/*
 * openvpn_agent.c  --  webOS VPN agent plugin that drives OpenVPN.
 *
 * Makes the stock Settings -> VPN app configure and run OpenVPN tunnels, using
 * the reverse-engineered agent ABI (see webos_vpn_agent_abi.h). No patching of
 * PmVpnDaemon or com.palm.app.vpn -- discovery is manifest-driven and the form
 * is data-driven.
 *
 * Flow:
 *   initVpnAgent            -> fill descriptor + capture host callback table.
 *   connect(new profile)    -> launch the stock configure-profile scene with an
 *                              OpenVPN field schema (host0 = send-msg-to-app);
 *                              reply -6 (silent) so no error dialog appears.
 *   connect(saved profile)  -> generate an openvpn config from the profile
 *                              fields, spawn openvpn (LD_LIBRARY_PATH=ssl11),
 *                              ACK success, then push state via host1 (notify)
 *                              as the child's log crosses milestones.
 *   disconnect              -> SIGTERM the child, notify "disconnected".
 *   get_connection_details  -> report current state.
 *
 * Build: ../Makefile + ../BUILD.md. Links libcjson (json-c) + libglib-2.0.
 */
#include "webos_vpn_agent_abi.h"

#include <json.h>        /* Palm json-c: json_object_*  (link: -lcjson) */
#include <glib_shim.h>   /* GLib main-loop subset  (link: -lglib-2.0)  */

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <fcntl.h>
#include <signal.h>
#include <errno.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <sys/stat.h>

#define AGENT_ID    "org.webosarchive.openvpn"
#define AGENT_LOG   "/var/log/webos-openvpn-agent.log"
#define STATE_DIR   "/tmp/webos-openvpn"
#define CONF_FILE    STATE_DIR "/client.conf"
#define CRED_FILE    STATE_DIR "/auth.txt"      /* auth-user-pass (login)      */
#define ASKPASS_FILE STATE_DIR "/askpass.txt"   /* private-key passphrase      */
#define UP_SCRIPT   "/usr/lib/vpn/agents/openvpn/openvpn-up"
/* Prefer the agent-local openvpn; fall back to PATH. Installed by the .ipk. */
#define OPENVPN_BIN "/usr/lib/vpn/agents/openvpn/openvpn"
#define SSL11_DIR   "/usr/lib/ssl11"

/* Response codes (see ABI header). -7 is the ONLY code the app treats as silent
 * in EVERY scene: AddProfile/Main/ConfigureProfile suppress -5 and -7; the
 * CredsPrompt modal suppresses -6 and -7. Returning -6 to the Add/Configure
 * flow pops a "Connection Failure: undefined" dialog AND (for a new profile)
 * makes ConfigureProfile delete the just-saved profile -- so use -7. */
#define RSP_OK            0
#define RSP_NEED_CREDS   (-7)   /* silent everywhere: we launched the form   */
#define RSP_ERR          (-1)

/* ------------------------------------------------------------------ *
 *  Logging
 * ------------------------------------------------------------------ */
static void agent_log(const char *fmt, ...)
{
    FILE *f = fopen(AGENT_LOG, "a");
    if (!f) return;
    time_t t = time(NULL);
    char ts[32];
    struct tm tmv;
    localtime_r(&t, &tmv);
    strftime(ts, sizeof ts, "%Y-%m-%d %H:%M:%S", &tmv);
    fprintf(f, "%s [%s] ", ts, AGENT_ID);
    va_list ap; va_start(ap, fmt);
    vfprintf(f, fmt, ap);
    va_end(ap);
    fputc('\n', f);
    fclose(f);
}

/* ------------------------------------------------------------------ *
 *  Global agent state
 * ------------------------------------------------------------------ */
static host_send_msg_fn    g_send_msg;    /* host0: launch/relaunch VPN app  */
static host_notify_fn      g_notify;      /* host1: push status to getStatus */
static host_get_profile_fn g_get_profile; /* host11: load+decrypt a profile   */

/* All of the following are touched ONLY from the daemon's main thread: the ops
 * (dispatched by the daemon main loop) and the GLib io/child watch callbacks.
 * No background thread => no locking needed and no cross-thread host calls. */
static pid_t       g_ovpn_pid  = -1;
static guint       g_io_tag    = 0;   /* g_io_add_watch source id      */
static GIOChannel *g_ovpn_chan = NULL;/* openvpn stdout/stderr channel */
static char  g_profile_name[128] = "";
static char  g_state[32] = "disconnected";

/* A disconnect request whose reply we deferred until openvpn actually exits
 * (mirrors the stock vpnc agent, which replies only after teardown completes;
 * replying immediately makes the VPN app show a spurious "Disconnect Failure"). */
static vpn_response_cb g_disc_cb    = NULL;
static void           *g_disc_token = NULL;

/* ------------------------------------------------------------------ *
 *  Small json helpers
 * ------------------------------------------------------------------ */
static struct json_object *jobj_get(struct json_object *o, const char *key)
{
    struct json_object *v = NULL;
    if (o && json_object_object_get_ex(o, key, &v))
        return v;
    return NULL;
}

static const char *jstr(struct json_object *o, const char *key, const char *dflt)
{
    struct json_object *v = jobj_get(o, key);
    if (v && json_object_is_type(v, json_type_string))
        return json_object_get_string(v);
    return dflt;
}

/* Look up a value in a vpnFormFields array by field id. */
static const char *field_value(struct json_object *fields, const char *id,
                               const char *dflt)
{
    if (!fields || !json_object_is_type(fields, json_type_array))
        return dflt;
    int n = json_object_array_length(fields);
    for (int i = 0; i < n; i++) {
        struct json_object *f = json_object_array_get_idx(fields, i);
        const char *fid = jstr(f, "id", NULL);
        if (fid && strcmp(fid, id) == 0)
            return jstr(f, "value", dflt);
    }
    return dflt;
}

/* ------------------------------------------------------------------ *
 *  Field schema (OpenVPN). Consumed by com.palm.app.vpn/DynamicForm.js.
 *   { id, type: textfield|passwordfield|listselector|checkbox,
 *     label, value, editable, options:[{label,value}] }
 * ------------------------------------------------------------------ */
static struct json_object *mk_text(const char *id, const char *label,
                                   const char *value, const char *input_type)
{
    struct json_object *o = json_object_new_object();
    json_object_object_add(o, "id",       json_object_new_string(id));
    json_object_object_add(o, "type",     json_object_new_string("textfield"));
    json_object_object_add(o, "label",    json_object_new_string(label));
    json_object_object_add(o, "value",    json_object_new_string(value ? value : ""));
    json_object_object_add(o, "editable", json_object_new_boolean(1));
    if (input_type)
        json_object_object_add(o, "inputType", json_object_new_string(input_type));
    return o;
}

static struct json_object *mk_pass(const char *id, const char *label)
{
    struct json_object *o = json_object_new_object();
    json_object_object_add(o, "id",       json_object_new_string(id));
    json_object_object_add(o, "type",     json_object_new_string("passwordfield"));
    json_object_object_add(o, "label",    json_object_new_string(label));
    json_object_object_add(o, "value",    json_object_new_string(""));
    json_object_object_add(o, "editable", json_object_new_boolean(1));
    return o;
}

static struct json_object *mk_opt(const char *label, const char *value)
{
    struct json_object *o = json_object_new_object();
    json_object_object_add(o, "label", json_object_new_string(label));
    json_object_object_add(o, "value", json_object_new_string(value));
    return o;
}

/* Build the OpenVPN field array. `seed` (may be NULL) is the existing
 * vpnFormFields so we preserve values when re-editing a saved profile. */
static struct json_object *build_form(struct json_object *seed)
{
    struct json_object *fields = json_object_new_array();

    json_object_array_add(fields,
        mk_text("vpnPort", "Server Port",
                field_value(seed, "vpnPort", "1194"), NULL));

    struct json_object *proto = json_object_new_object();
    json_object_object_add(proto, "id",    json_object_new_string("vpnProto"));
    json_object_object_add(proto, "type",  json_object_new_string("listselector"));
    json_object_object_add(proto, "label", json_object_new_string("Protocol"));
    json_object_object_add(proto, "value",
        json_object_new_string(field_value(seed, "vpnProto", "udp")));
    struct json_object *popts = json_object_new_array();
    json_object_array_add(popts, mk_opt("UDP", "udp"));
    json_object_array_add(popts, mk_opt("TCP", "tcp"));
    json_object_object_add(proto, "options", popts);
    json_object_array_add(fields, proto);

    struct json_object *am = json_object_new_object();
    json_object_object_add(am, "id",    json_object_new_string("vpnAuthMode"));
    json_object_object_add(am, "type",  json_object_new_string("listselector"));
    json_object_object_add(am, "label", json_object_new_string("Authentication"));
    json_object_object_add(am, "value",
        json_object_new_string(field_value(seed, "vpnAuthMode", "cert")));
    struct json_object *aopts = json_object_new_array();
    json_object_array_add(aopts, mk_opt("Certificate (.ovpn)", "cert"));
    json_object_array_add(aopts, mk_opt("Certificate + Login", "certuser"));
    json_object_object_add(am, "options", aopts);
    json_object_array_add(fields, am);

    /* Path to a PiVPN/OpenVPN .ovpn (inline ca/cert/key/tls-crypt). The device
     * doesn't have a good file-import UI, so we take a path the user copied the
     * profile to (e.g. via USB / download). remote is overridden with vpnHost. */
    json_object_array_add(fields,
        mk_text("vpnConfigFile", "Config file (.ovpn) path",
                field_value(seed, "vpnConfigFile", "/media/internal/vpn/client.ovpn"),
                NULL));

    json_object_array_add(fields,
        mk_text("vpnUsername", "Username (login only)",
                field_value(seed, "vpnUsername", ""), NULL));
    /* In cert mode this is the .ovpn private-key passphrase (PiVPN's per-client
     * password); in "Certificate + Login" mode it's the login password. */
    json_object_array_add(fields, mk_pass("vpnPassword", "Password / key passphrase"));

    return fields;
}

/* ------------------------------------------------------------------ *
 *  host0: launch the configure-profile scene with our field schema.
 *  Envelope (becomes enyo.windowParams): the app shows the profile scene
 *  when vpnFormFields is present and no popupPrompt/banner is set.
 * ------------------------------------------------------------------ */
static void prompt_for_profile(const char *profile_name, const char *host,
                               struct json_object *seed_fields)
{
    if (!g_send_msg) { agent_log("prompt: no host0!"); return; }

    struct json_object *msg = json_object_new_object();
    json_object_object_add(msg, "vpnAgentGuid", json_object_new_string(AGENT_ID));
    json_object_object_add(msg, "vpnMsgType",   json_object_new_string("credentials"));
    if (profile_name && *profile_name)
        json_object_object_add(msg, "vpnProfileName",
                               json_object_new_string(profile_name));
    if (host && *host)
        json_object_object_add(msg, "vpnHost", json_object_new_string(host));
    json_object_object_add(msg, "vpnFormFields", build_form(seed_fields));

    const char *s = json_object_to_json_string(msg);
    agent_log("prompt_for_profile: %s", s);
    g_send_msg(s);
    json_object_put(msg);
}

/* ------------------------------------------------------------------ *
 *  host1: push a connection-state update to getStatus subscribers.
 * ------------------------------------------------------------------ */
/* Main-thread only. */
static void notify_state(const char *state)
{
    snprintf(g_state, sizeof g_state, "%s", state);

    if (!g_notify) return;
    struct json_object *o = json_object_new_object();
    if (*g_profile_name)
        json_object_object_add(o, "vpnProfileName",
                               json_object_new_string(g_profile_name));
    json_object_object_add(o, "state", json_object_new_string(state));
    const char *s = json_object_to_json_string(o);
    agent_log("notify_state: %s", s);
    g_notify(s);
    json_object_put(o);
}

/* ------------------------------------------------------------------ *
 *  OpenVPN config generation
 * ------------------------------------------------------------------ */
static int file_exists(const char *p)
{
    struct stat st;
    return p && *p && stat(p, &st) == 0 && S_ISREG(st.st_mode);
}

/* Write CONF_FILE from the profile fields. Returns 0 on success. */
static int write_config(const char *host, struct json_object *fields)
{
    mkdir(STATE_DIR, 0700);

    const char *port     = field_value(fields, "vpnPort", "1194");
    const char *proto    = field_value(fields, "vpnProto", "udp");
    const char *authmode = field_value(fields, "vpnAuthMode", "cert");
    const char *cfgfile  = field_value(fields, "vpnConfigFile", "");
    const char *user     = field_value(fields, "vpnUsername", "");
    const char *pass     = field_value(fields, "vpnPassword", "");

    FILE *f = fopen(CONF_FILE, "w");
    if (!f) { agent_log("write_config: cannot open %s: %s", CONF_FILE, strerror(errno)); return -1; }

    int import = file_exists(cfgfile);
    if (import) {
        /* IMPORT MODE (recommended): the user copied a full PiVPN/OpenVPN .ovpn
         * (inline ca/cert/key/tls-crypt, remote, proto, cipher) onto the device.
         * We include it wholesale and only layer on the route/DNS hook.
         *
         * The "VPN Server" field OVERRIDES the .ovpn's remote: we emit our
         * `remote` FIRST so it's connection-profile #0 (tried first). This lets
         * the same .ovpn work on the LAN (enter the Pi's internal IP) or over
         * the internet (enter the public IP / DDNS) without editing the file --
         * PiVPN bakes in whichever endpoint you picked at install, which is often
         * the public IP and won't reach the Pi from inside the LAN (no NAT
         * hairpin). If the field is left matching the file, it's just a harmless
         * duplicate. */
        if (host && *host)
            fprintf(f, "remote %s %s %s\n", host, port, proto);
        fprintf(f, "config %s\n", cfgfile);
        /* Keep the (decrypted) key + tun across openvpn's SIGUSR1 restarts, so a
         * transient TLS/network hiccup doesn't make it re-prompt for the key
         * passphrase on a non-tty and fatally exit. */
        fprintf(f, "persist-key\n");
        fprintf(f, "persist-tun\n");
        fprintf(f, "script-security 2\n");
        fprintf(f, "up %s\n",   UP_SCRIPT);
        fprintf(f, "down %s\n", UP_SCRIPT);
        fprintf(f, "up-restart\n");
        /* PiVPN pushes block-outside-dns (a Windows-only option); drop it so
         * openvpn doesn't log a scary (harmless) "Options error". */
        fprintf(f, "pull-filter ignore \"block-outside-dns\"\n");
        fprintf(f, "verb 3\n");
    } else {
        /* FALLBACK MODE: no .ovpn given -> synthesize a client from the fields.
         * Needs certs to exist; without them openvpn will (correctly) refuse.
         * This path mainly exists so a mis-typed path fails loudly, not weirdly. */
        agent_log("write_config: no .ovpn at '%s' -> synthesizing minimal client (needs certs)", cfgfile);
        fprintf(f, "client\n");
        fprintf(f, "dev tun\n");
        fprintf(f, "proto %s\n", proto);
        fprintf(f, "remote %s %s\n", host ? host : "", port);
        fprintf(f, "nobind\n");
        fprintf(f, "persist-key\n");
        fprintf(f, "persist-tun\n");
        fprintf(f, "remote-cert-tls server\n");
        fprintf(f, "data-ciphers AES-256-GCM:AES-128-GCM:AES-256-CBC\n");
        fprintf(f, "data-ciphers-fallback AES-256-CBC\n");
        fprintf(f, "auth SHA256\n");
        fprintf(f, "pull-filter ignore \"block-outside-dns\"\n");
        fprintf(f, "verb 3\n");
        fprintf(f, "script-security 2\n");
        fprintf(f, "up %s\n",   UP_SCRIPT);
        fprintf(f, "down %s\n", UP_SCRIPT);
        fprintf(f, "up-restart\n");
    }

    if (strcmp(authmode, "certuser") == 0) {
        /* Server-side login: username + password via --auth-user-pass. */
        FILE *c = fopen(CRED_FILE, "w");
        if (c) {
            fprintf(c, "%s\n%s\n", user ? user : "", pass ? pass : "");
            fclose(c);
            chmod(CRED_FILE, 0600);
            fprintf(f, "auth-user-pass %s\n", CRED_FILE);
        } else {
            agent_log("write_config: cannot write creds file");
        }
    } else if (pass && *pass) {
        /* Cert mode + a password -> it's the PRIVATE-KEY passphrase (PiVPN's
         * per-client password encrypts the .ovpn's <key>). Feed it via
         * --askpass so openvpn can decrypt the key non-interactively. Harmless
         * if the key turns out to be unencrypted. */
        FILE *c = fopen(ASKPASS_FILE, "w");
        if (c) {
            fprintf(c, "%s\n", pass);
            fclose(c);
            chmod(ASKPASS_FILE, 0600);
            fprintf(f, "askpass %s\n", ASKPASS_FILE);
        } else {
            agent_log("write_config: cannot write askpass file");
        }
    }

    fclose(f);
    chmod(CONF_FILE, 0600);
    agent_log("write_config: wrote %s (host=%s port=%s proto=%s auth=%s cfg=%s)",
              CONF_FILE, host, port, proto, authmode, cfgfile);
    return 0;
}

/* ------------------------------------------------------------------ *
 *  openvpn process: spawn + monitor
 * ------------------------------------------------------------------ */
static const char *openvpn_path(void)
{
    if (file_exists(OPENVPN_BIN)) return OPENVPN_BIN;
    if (file_exists("/usr/sbin/openvpn")) return "/usr/sbin/openvpn";
    if (file_exists("/usr/bin/openvpn"))  return "/usr/bin/openvpn";
    return OPENVPN_BIN; /* let exec fail + log */
}

/* --- GLib main-loop callbacks (run on the daemon's main thread) --- */

/* Process one openvpn output line (trims newline, maps milestones to state). */
static void handle_line(gchar *line, gsize len)
{
    if (len && (line[len - 1] == '\n' || line[len - 1] == '\r')) line[len - 1] = 0;
    agent_log("openvpn: %s", line);
    if (strstr(line, "Initialization Sequence Completed"))
        notify_state("connected");
    else if (strstr(line, "AUTH_FAILED") || strstr(line, "auth-failure"))
        notify_state("disconnected");
    /* TLS/resolve errors: openvpn retries; keep "connecting". */
}

/* Drain every complete line currently available on the channel. */
static void drain_channel(GIOChannel *ch)
{
    if (!ch) return;
    for (;;) {
        gchar *line = NULL;
        gsize len = 0;
        GIOStatus st = g_io_channel_read_line(ch, &line, &len, NULL, NULL);
        if (st == G_IO_STATUS_NORMAL && line) { handle_line(line, len); g_free(line); continue; }
        if (line) g_free(line);
        break;   /* AGAIN (no full line yet), EOF, or ERROR */
    }
}

/* Data ready / hangup on the openvpn pipe. Drain, keep watching until HUP/EOF. */
static gboolean on_openvpn_output(GIOChannel *ch, GIOCondition cond, gpointer d)
{
    drain_channel(ch);
    if (cond & (G_IO_HUP | G_IO_ERR)) {
        g_io_tag = 0;          /* returning FALSE removes this source */
        return FALSE;
    }
    return TRUE;
}

/* The openvpn child exited (glib reaped it for us). Drain the final output
 * (openvpn's exit reason often arrives here), then report + tidy up. */
static void on_openvpn_exit(GPid pid, gint status, gpointer d)
{
    drain_channel(g_ovpn_chan);     /* capture the last lines before teardown */
    agent_log("on_openvpn_exit: pid=%d status=%d", (int)pid, status);
    if (g_io_tag)    { g_source_remove(g_io_tag); g_io_tag = 0; }
    if (g_ovpn_chan) { g_io_channel_unref(g_ovpn_chan); g_ovpn_chan = NULL; }
    g_ovpn_pid = -1;
    notify_state("disconnected");

    /* If a disconnect request was waiting on this teardown, reply success now. */
    if (g_disc_cb) {
        agent_log("on_openvpn_exit: answering deferred disconnect");
        g_disc_cb(g_disc_token, 0, RSP_OK, NULL);
        g_disc_cb = NULL; g_disc_token = NULL;
    }
}

/* Returns 0 if the child launched. Registers glib watches on the MAIN loop so
 * all further notifications happen on the daemon's thread. */
static int spawn_openvpn(void)
{
    int pipefd[2];
    if (pipe(pipefd) != 0) { agent_log("pipe: %s", strerror(errno)); return -1; }

    pid_t pid = fork();
    if (pid < 0) { agent_log("fork: %s", strerror(errno));
                   close(pipefd[0]); close(pipefd[1]); return -1; }

    if (pid == 0) {
        /* child */
        dup2(pipefd[1], STDOUT_FILENO);
        dup2(pipefd[1], STDERR_FILENO);
        close(pipefd[0]); close(pipefd[1]);
        setenv("LD_LIBRARY_PATH", SSL11_DIR, 1);
        const char *bin = openvpn_path();
        execl(bin, bin, "--config", CONF_FILE, (char *)NULL);
        fprintf(stderr, "exec %s failed: %s\n", bin, strerror(errno));
        _exit(127);
    }

    /* parent */
    close(pipefd[1]);
    fcntl(pipefd[0], F_SETFL, O_NONBLOCK);
    g_ovpn_pid = pid;

    g_ovpn_chan = g_io_channel_unix_new(pipefd[0]);
    g_io_channel_set_close_on_unref(g_ovpn_chan, TRUE);  /* close pipefd[0] w/ chan */
    g_io_tag = g_io_add_watch(g_ovpn_chan, G_IO_IN | G_IO_HUP | G_IO_ERR,
                              on_openvpn_output, NULL);
    /* keep our own ref in g_ovpn_chan so on_openvpn_exit can drain it; the watch
     * holds a second ref. Both are released in on_openvpn_exit. */
    g_child_watch_add((GPid)pid, on_openvpn_exit, NULL);

    agent_log("spawn_openvpn: pid=%d", pid);
    return 0;
}

/* Main-thread only. Ask openvpn to exit; on_openvpn_exit does the bookkeeping. */
static void kill_openvpn(void)
{
    if (g_ovpn_pid > 0) {
        agent_log("kill_openvpn: SIGTERM %d", (int)g_ovpn_pid);
        kill(g_ovpn_pid, SIGTERM);
    }
}

/* ------------------------------------------------------------------ *
 *  Ops (invoked by PmVpnDaemon)
 *    op(token, params_json_STRING, cb);  reply cb(token, 0, code, errText)
 *
 *  arg1 is the raw JSON payload STRING (the daemon g_strdup'd the LSMessage
 *  payload) -- we must json_tokener_parse it ourselves, exactly like
 *  vpnc_connect. Treating it as a json_object* segfaults the daemon.
 * ------------------------------------------------------------------ */

/* json-c "is error pointer" guard (old json_tokener_parse convention). */
#define JC_IS_ERR(p) ((uintptr_t)(p) > (uintptr_t)-4000)

static struct json_object *parse_params(const char *params_json)
{
    if (!params_json) return NULL;
    struct json_object *o = json_tokener_parse(params_json);
    if (JC_IS_ERR(o)) return NULL;
    return o;   /* caller json_object_put()s it */
}

/* host11 hands the (decrypted) profile JSON to this callback synchronously. */
struct profile_capture { char *json; };
static void profile_load_cb(const char *json, void *ud)
{
    struct profile_capture *c = ud;
    if (json && !c->json) c->json = strdup(json);
}

static int fields_ok(struct json_object *f)
{
    return f && json_object_is_type(f, json_type_array) &&
           json_object_array_length(f) > 0;
}

static void op_connect(void *token, const char *params_json, vpn_response_cb cb)
{
    agent_log("op_connect: params=%s", params_json ? params_json : "(null)");
    struct json_object *params = parse_params(params_json);
    struct json_object *loaded = NULL;   /* profile JSON fetched via host11 */

    const char *pname = jstr(params, "vpnProfileName", "");
    struct json_object *prof   = jobj_get(params, "vpnProfile");
    struct json_object *fields = jobj_get(prof, "vpnFormFields");

    /* The app connects a SAVED profile by name only -- the daemon does NOT
     * expand it. If we didn't get fields inline but have a name, load the saved
     * (decrypted) profile ourselves via host11 (profileGetPrvDetails). */
    if (!fields_ok(fields) && *pname && g_get_profile) {
        struct profile_capture cap = { NULL };
        agent_log("op_connect: loading saved profile '%s' via host11", pname);
        g_get_profile(pname, profile_load_cb, &cap);
        if (cap.json) {
            agent_log("op_connect: loaded profile = %s", cap.json);
            loaded = json_tokener_parse(cap.json);
            if (JC_IS_ERR(loaded)) loaded = NULL;
            free(cap.json);
            /* profile may be {vpnProfile:{...}} or the vpnProfile object flat */
            struct json_object *lprof = jobj_get(loaded, "vpnProfile");
            prof = lprof ? lprof : loaded;
            fields = jobj_get(prof, "vpnFormFields");
        } else {
            agent_log("op_connect: host11 returned no profile for '%s'", pname);
        }
    }

    const char *host = jstr(prof, "vpnHost", jstr(params, "vpnHost", ""));

    /* Truly new profile (no fields anywhere) -> launch the configure scene. */
    if (!fields_ok(fields)) {
        agent_log("op_connect: no fields -> prompting for profile");
        prompt_for_profile(pname, host, NULL);
        if (cb) cb(token, 0, RSP_NEED_CREDS, NULL);   /* silent in app */
        goto done;
    }

    snprintf(g_profile_name, sizeof g_profile_name, "%s", pname);

    if (write_config(host, fields) != 0) {
        if (cb) cb(token, 0, RSP_ERR, "Failed to write OpenVPN config");
        goto done;
    }

    notify_state("connecting");
    if (spawn_openvpn() != 0) {
        notify_state("disconnected");
        if (cb) cb(token, 0, RSP_ERR, "Failed to start OpenVPN");
        goto done;
    }
    if (cb) cb(token, 0, RSP_OK, NULL);   /* ACK; state follows via notify */

done:
    if (loaded) json_object_put(loaded);
    if (params) json_object_put(params);
}

/* IMPORTANT: disconnect's ABI is op(token, cb) -- the response callback is the
 * SECOND arg (r1), NOT the third. The daemon passes no params json and leaves
 * r2/r3 as garbage; reading cb from a 3rd param and calling it jumps to junk and
 * SIGSEGVs the daemon mid-teardown ("looks disconnected" + the app's spurious
 * "Message status unknown"/"Disconnect Failure"). Confirmed at PmVpnDaemon
 * handleLunaDisconnectRequest 0xe39c. Cast into the descriptor slot in init. */
static void op_disconnect(void *token, vpn_response_cb cb)
{
    agent_log("op_disconnect: dispatched");
    if (g_ovpn_pid > 0) {
        /* Defer the reply until on_openvpn_exit, like vpnc: reply only once the
         * teardown actually finishes. */
        g_disc_cb = cb;
        g_disc_token = token;
        notify_state("disconnecting");
        kill_openvpn();
    } else {
        /* Nothing running -> already down; ack immediately. */
        notify_state("disconnected");
        if (cb) cb(token, 0, RSP_OK, NULL);
    }
}

/* Same convention as disconnect: op(token, cb) -- cb is arg1 (0x30 call site). */
static void op_get_connection_details(void *token, vpn_response_cb cb)
{
    /* Just ACK. The daemon already tracks the connection state from our
     * notify_state() calls; broadcasting here would create a notify->poll->notify
     * feedback loop (~100+/sec) that floods everything. */
    if (cb) cb(token, 0, RSP_OK, NULL);
}

static void op_handle_ui_prompt_response(void *token, const char *params_json,
                                         vpn_response_cb cb)
{
    agent_log("op_handle_ui_prompt_response: %s",
              params_json ? params_json : "(null)");
    struct json_object *params = parse_params(params_json);
    const char *btn = jstr(params, "buttonId", "");
    if (strcmp(btn, "backButton") == 0) {
        /* user cancelled the modal creds prompt */
        kill_openvpn();
        notify_state("disconnected");
    }
    if (cb) cb(token, 0, RSP_OK, NULL);
    if (params) json_object_put(params);
}

/* notify_system_change is a fire-and-forget notification (network/power/app
 * change). Its exact arg convention isn't confirmed, so take only token and do
 * NOT invoke any callback -- calling a wrongly-positioned/garbage cb would
 * SIGSEGV the daemon. openvpn handles network changes itself (up-restart). */
static void op_notify_system_change(void *token)
{
    (void)token;
    agent_log("op_notify_system_change: dispatched");
}

/* ------------------------------------------------------------------ *
 *  Exported entry points
 * ------------------------------------------------------------------ */
#define VPN_EXPORT __attribute__((visibility("default")))

VPN_EXPORT
int initVpnAgent(VpnAgentDescriptor *desc,
                 host_send_msg_fn host_send_msg,
                 host_notify_fn   host_notify,
                 void *host_add_iface,
                 void *host3, void *host4, void *host5, void *host6,
                 void *host7, void *host8, void *host9, void *host10,
                 host_get_profile_fn host_get_profile)
{
    (void)host_add_iface; (void)host3; (void)host4; (void)host5; (void)host6;
    (void)host7; (void)host8; (void)host9; (void)host10;

    g_send_msg    = host_send_msg;
    g_notify      = host_notify;
    g_get_profile = host_get_profile;

    agent_log("initVpnAgent: desc=%p host0=%p host1=%p host11=%p",
              (void *)desc, (void *)host_send_msg, (void *)host_notify,
              (void *)host_get_profile);
    if (!desc) return 1;   /* nonzero => failure (daemon will unload us) */

    memset(desc, 0, sizeof *desc);      /* 60 bytes; daemon owns 0x3c.. */
    desc->version = 1;
    strncpy(desc->id, AGENT_ID, sizeof desc->id - 1);

    /* Op ABI is NOT uniform: connect/handle_ui take (token, params_json, cb);
     * disconnect/get_connection_details take (token, cb); notify_system_change
     * we treat as (token) no-reply. Cast the odd ones into the slot type. */
    desc->connect                = op_connect;
    desc->disconnect             = (vpn_op_fn)op_disconnect;
    desc->get_connection_details = (vpn_op_fn)op_get_connection_details;
    desc->handle_ui_prompt_resp  = op_handle_ui_prompt_response;
    desc->notify_system_change   = (vpn_op_fn)op_notify_system_change;

    agent_log("initVpnAgent: registered id=%s", desc->id);
    return 0;   /* success */
}

VPN_EXPORT
void cleanupVpnAgent(void)
{
    agent_log("cleanupVpnAgent: called");
    kill_openvpn();
}
