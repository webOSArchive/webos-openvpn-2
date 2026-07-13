# webOS OpenVPN agent — build & architecture guide

A native VPN **agent plugin** for legacy webOS (tested target: HP TouchPad,
webOS 3.0.5) that makes the **stock Settings → VPN** app drive **OpenVPN**
instead of only Cisco EasyVPN/AnyConnect. The point: modern, roaming-capable,
cert-authenticated tunnels **inside the built-in UI**, using the modernized
OpenSSL (TLS 1.3) from `codepoet80/OpenSSL-legacyWebOS`.

> **STATUS: working & validated on a real HP TouchPad (webOS 3.0.5).** The agent
> registers in the stock UI, prompts for OpenVPN settings through it, saves
> profiles, and on Connect spawns a cross-compiled **OpenVPN 2.5.9** (linked
> against **OpenSSL 1.1.1w**) that runs on-device; connection state flows back to
> the UI and Disconnect cleanly stops the tunnel — with no daemon crashes across
> repeated connect/disconnect cycles. The full agent ABI (below) was recovered
> from *both* `libVpncAgent.so` and `PmVpnDaemon` and confirmed by on-device
> behaviour. Remaining polish: DNS/route hand-off to the webOS connection manager
> (see §8). To install, run `./install-openvpn-agent.sh`; for the Pi side see the
> repo-root `PIVPN-GUIDE.md`.

---

## 0. TL;DR for the Linux build box

```sh
git clone <this repo> && cd webos-vpn/agent-openvpn
# edit Makefile CROSS_COMPILE / SYSROOT to match your webOS toolchain, then:
make CROSS_COMPILE=arm-none-linux-gnueabi- SYSROOT=/opt/webos/sysroot
make check                       # confirm 32-bit ARM ELF + NEEDED libs
# install onto the device (novacom, from whatever host has it):
#   see section 6.
```

You need the **same cross toolchain + sysroot you used for OpenSSL-legacyWebOS**.
Nothing here needs the OpenSSL work *yet* (M1 has no TLS); M2 does.

**Sysroot missing libcjson?** Run the helper (on a host with the device on
novacom) to pull Palm's json-c into your sysroot, then build:

```sh
./scripts/get-palm-libcjson.sh /opt/webos/sysroot
```

It grabs `libcjson.so*` (production images strip the headers — the script tells
you how to backfill json-c 0.9.x headers if so). glib/pthread come the same way.

---

## 1. What's in here

```
agent-openvpn/
├── vpn-plugin-info.json          # the manifest vpnd scans for (agent id/type/plugin)
├── src/
│   ├── webos_vpn_agent_abi.h      # reverse-engineered agent ABI (descriptor + entry pts)
│   └── openvpn_agent.c            # M1 implementation (registers + logs; stub ops)
├── scripts/
│   ├── openvpn-up                 # route/DNS script (OpenVPN --up/--down); analogue of vpnc-script-palm
│   └── get-palm-libcjson.sh       # pull Palm's json-c (libcjson) off a device into a sysroot
├── icons/                         # openvpn-small.png (add your own; referenced by manifest)
├── Makefile                       # cross-compile to libVpnOpenvpnAgent.so
└── BUILD.md                       # this file
```

On the device it installs to `/usr/lib/vpn/agents/openvpn/` alongside the stock
`vpnc/` and `ciscoanyconnect/` agents.

---

## 2. How webOS VPN agents work (verified on-device)

The Settings VPN app is a thin front-end (`com.palm.app.vpn`, Enyo 1). The real
work is in `vpnd`, which **scans `/usr/lib/vpn/agents/*/` and reads each
`vpn-plugin-info.json`** to discover agents — so adding a third directory is all
it takes to appear; **no patching of vpnd or the app.**

- **Discovery / manifest** (`vpn-plugin-info.json`):
  `{ title, id, version, vendor, type[], plugin }` (+ optional `icon`, `eula`).
  `type` (`IPSec`/`ssl`) is a **cosmetic label** only — we reuse `ssl`.
- **UI is data-driven.** `vpnd` asks the agent for a field schema and hands it to
  the app as `vpnFormFields` (via `enyo.windowParams`); `DynamicForm.js` renders
  whatever it's given. So the agent declares its own fields — see §5.
- **The plugin is a C shared object** `dlopen`'d by `vpnd`, exporting exactly
  two symbols. Everything else is the ops table it fills. See §4.
- `/dev/net/tun` exists (char 10,200) → OpenVPN's data path works out of the box.

Reference implementation we cloned: `/usr/lib/vpn/agents/vpnc/libVpncAgent.so`
(plain C, unstripped) — a local copy + disassembly live in `../reversing/`.

---

## 3. How the ABI was recovered (reproducible)

All from the stock `libVpncAgent.so` (in `../reversing/`), using LLVM binutils
(macOS `objdump`/`nm` are LLVM; on Linux use `llvm-nm`/`llvm-objdump` or the
arm cross `nm`/`objdump`):

```sh
cd ../reversing
nm libVpncAgent.so | grep ' [Tt] '                 # function inventory (unstripped!)
#   -> exported (T): initVpnAgent, cleanupVpnAgent   (the entry points)
objdump -d libVpncAgent.so > disasm.txt             # full disassembly
objdump -R libVpncAgent.so                          # .got RELATIVE relocs
objdump -s -j .got -j .data.rel.ro libVpncAgent.so  # resolve op pointers
```

Reading `initVpnAgent` (see `disasm.txt` @ 0x1cf4): it `memset`s the caller's
descriptor to 60 bytes, sets `version=1`, `strncpy`s the agent id into a 32-byte
field, then stores five function pointers. Matching the `.got` slot contents to
the symbol table gives the op → offset map in §4.

---

## 4. The agent ABI (see `src/webos_vpn_agent_abi.h`) — FULLY RECOVERED

Recovered from `libVpncAgent.so` **and** `PmVpnDaemon` (both unstripped) and
**confirmed on-device** (the agent log prints the exact host pointers the daemon
passes: `host0=0xdb14 host1=0xdbc0`, matching PmVpnDaemon's symbol table).

**Entry points** (`PmVpnDaemon::activatePlugin` dlsym's these; must be exported):

```c
int  initVpnAgent(VpnAgentDescriptor *desc, host0, host1, host2, ... host11);
void cleanupVpnAgent(void);
```

- **`initVpnAgent` MUST return `int 0`.** `activatePlugin` does
  `cmp r0,#0; bne <unload>` — a nonzero (or garbage `void`) return makes the
  daemon `dlclose` the plugin *before any op is dispatched*. (Cost us one debug
  cycle: the agent registered but connect never fired.)
- The extra args are the **host callback table** (3 in r1..r3, the rest on the
  stack), read from daemon `.data` 0x21988: `host0 =
  handleLunaServiceSendMsgToAppCb`, `host1 = handleLunaServiceNotifyCb`, `host2 =
  addNetworkInterface`, then modify/remove/get-iface, `updateIpTableRules`, …,
  `profileGetPrvDetails`. **host0 and host1 each take a single JSON *string*.**

**Descriptor** (offsets EXACT, 32-bit ARM; first 60 bytes of the daemon's
72-byte plugin struct — the daemon owns 0x3c..0x47, so `memset` only 60):

| offset | field                    |
|-------:|--------------------------|
| 0x00   | `version` = 1            |
| 0x04   | `id[32]`                 |
| 0x28   | `connect`                |
| 0x2c   | `disconnect`             |
| 0x30   | `get_connection_details` |
| 0x34   | `handle_ui_prompt_resp`  |
| 0x38   | `notify_system_change`   |
|  —     | **sizeof == 0x3c (60)**  |

**Op signature** (confirmed at the daemon call sites `handleConnectRequest` /
`handleDelayedConnectRequest`):

```c
void op(void *token, const char *params_json, vpn_response_cb cb);
```

- `params_json` is a **raw JSON string** (the daemon `g_strdup`s the LSMessage
  payload) — the agent must `json_tokener_parse` it. *Treating it as a
  json_object* segfaults the daemon* (the second debug cycle we hit).
- Reply once via `cb(token, 0, code, errText)` — `code 0` = success
  (`returnValue:true`), negative = failure; **`-6` is silent in the app** (used
  after launching the credentials/profile form). Connect carries no payload;
  state is pushed asynchronously via `host1`.

**Threading:** `host0`/`host1` touch the default `GMainContext` and are **not**
safe from a background thread. The agent therefore watches the openvpn child +
its output with `g_io_add_watch` / `g_child_watch_add` on the daemon's own main
loop (link `-lglib-2.0`), so every host call happens on the daemon thread. (The
third debug cycle: a `pthread` monitor racing Disconnect crashed the daemon.)

---

## 5. The field-schema contract (authoritative: `DynamicForm.js`)

The agent emits an array of field objects; the renderer
(`com.palm.app.vpn/source/main/DynamicForm.js`) consumes:

```jsonc
{ "id": "vpnUsername", "type": "textfield",     "label": "Username", "value": "", "editable": true, "inputType": "url" }
{ "id": "vpnPassword", "type": "passwordfield", "label": "Password", "value": "" }
{ "id": "vpnProto",    "type": "listselector",  "label": "Protocol", "value": "udp",
  "options": [ { "label": "UDP", "value": "udp" }, { "label": "TCP", "value": "tcp" } ] }
```

- `id` is both the widget key and the profile key read back on connect.
- Supported `type`s: `textfield`, `passwordfield`, `checkbox`, `listselector`,
  `label`, `status`, `button`, plus nesting via `rowgroup`/`groups`.
- listselector: selection index → `options[index].value`.
- `VPN Server` (`vpnHost`) is collected by the Add-Profile scene separately —
  **don't** declare it in the agent schema.

`build_openvpn_form_json()` in `openvpn_agent.c` builds our set (port, proto,
auth mode, username, password, CA path). Tune the field set to taste — it's a
UX decision, not an ABI constraint.

---

## 6. Install on the device (novacom, from the host that has it)

```sh
# from the machine with novacom access to the TouchPad:
D=/usr/lib/vpn/agents/openvpn
echo "mkdir -p $D $D/icons $D/resources/en_us" | novacom run file://bin/sh
novacom put file://$D/libVpnOpenvpnAgent.so     < libVpnOpenvpnAgent.so
novacom put file://$D/vpn-plugin-info.json      < vpn-plugin-info.json
novacom put file://$D/openvpn-up                 < scripts/openvpn-up
echo "chmod 755 $D/openvpn-up; chmod 644 $D/libVpnOpenvpnAgent.so" | novacom run file://bin/sh
# restart the VPN daemon (or just reboot) so it re-scans agents:
echo "stop com.palm.vpn; start com.palm.vpn" | novacom run file://bin/sh   # verify svc name on-device
```

(If `novacom put`'s stdin form differs on your build, use the same
`novacom get`/`put file://…` convention you used to pull `libVpncAgent.so`.)

---

## 7. Testing Milestone 1

Do it in three cheap stages — each isolates one risk:

- **M1a — agent appears.** Install only `vpn-plugin-info.json` (a stub `.so` or
  none). Open Settings → VPN → Add Profile. **"OpenVPN" should show in the
  Connection Type list** (this comes purely from the manifest via `getAgents`).
  If it doesn't: `vpnd` didn't re-scan (restart it) or the JSON is malformed.
- **M1b — it loads & fields render.** Install the real `.so`. Pick OpenVPN in the
  UI. **Our fields (Port / Protocol / Auth / Username / …) should render.**
  Watch `tail -f /var/log/webos-openvpn-agent.log` over novacom for
  `initVpnAgent: registered id=…`.
- **M1c — dispatch works.** Fill fields, tap Connect. The log should show
  `op_connect: dispatched` + the form-schema dump. (No tunnel yet — expected.)

**Expected host-side (Linux/Mac) editor diagnostics before you build:**
`json.h file not found` and a cascade of `json_object` undeclared errors are
**normal off-target** — the json-c headers live in the cross **sysroot**, not on
your host. The 32-bit ABI asserts are `#if __SIZEOF_POINTER__==4`-guarded so
they're inert on a 64-bit host. Both clear under the real cross-compile.

---

## 8. Status & remaining work

**Done (validated on-device):**
1. ✅ **OpenVPN 2.5.9 cross-compiled** against OpenSSL 1.1.1w (`../build-openvpn/`),
   `openvpn --version` runs on the TouchPad and reports `OpenSSL 1.1.1w`. Launched
   by the agent with `LD_LIBRARY_PATH=/usr/lib/ssl11`. Toolchain: Linaro 4.9.4
   `arm-linux-gnueabi`, `-march=armv7-a -mtune=cortex-a8 -mfpu=neon
   -mfloat-abi=softfp` (matches the device/OpenSSL float ABI). Config used:
   `--disable-lzo --disable-lz4 --disable-plugins --disable-pkcs11 --disable-management`.
2. ✅ **Ops wired**: parse profile fields → generate an openvpn config (import a
   user `.ovpn` when present, else synthesize) → spawn openvpn → GLib-watch its
   output/exit → push `connecting`/`connected`/`disconnected` via host1 → clean
   Disconnect (SIGTERM, no orphaned process, no daemon crash).
3. ✅ **Install**: `./install-openvpn-agent.sh` (novacom).

**Remaining polish:**
1. **DNS / route hand-off to the webOS connection manager.** openvpn currently
   sets up `tun` + kernel routes itself via `/sbin/ifconfig` + `/sbin/route`, so
   IP routing works, but pushed DNS isn't applied to the system resolver. Proper
   integration = call `host2 addNetworkInterface` / `host6 updateIpTableRules`
   (already identified in the host table) from `openvpn-up`, mirroring
   `vpnc-script-palm`'s `/var/run/resolv.conf` dance.
2. **Cert import UX** — today the agent takes a path to a PiVPN `.ovpn` on the
   device (robust, recommended). A nicer on-device import flow is optional.
3. **Roaming/reconnect** beyond openvpn's own `--up-restart`.
4. **Packaging** as an `.ipk` targeting
   `/media/cryptofs/apps/usr/palm/vpnframework/agents` (a path the daemon already
   scans) so it survives without novacom.

---

## 9. Reversing artifacts

`../reversing/` holds the pulled stock `libVpncAgent.so` and `disasm.txt`. HP
open-sourced/abandoned webOS over a decade ago; these are here as the ground
truth for the ABI. Re-pull or re-disassemble anytime with the §3 commands.
