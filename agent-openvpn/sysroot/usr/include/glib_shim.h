/*
 * glib_shim.h  --  minimal GLib 2.x surface for the webOS OpenVPN agent.
 *
 * We only need a handful of GLib main-loop primitives to watch the openvpn
 * child + its output ON THE DAEMON'S MAIN THREAD (PmVpnDaemon runs a GLib main
 * loop). Calling the host notify/send-msg callbacks from a background pthread is
 * NOT safe -- they touch the default GMainContext -- so we integrate here
 * instead of spawning our own thread.
 *
 * The production webOS image strips /usr/include, and the host's glibconfig.h
 * has 64-bit types (wrong for the 32-bit ARM target), so we declare the exact
 * subset we use with correct ILP32 types and link the device's
 * libglib-2.0.so.0. Verified present via `nm -D libglib-2.0.so.0`.
 */
#ifndef WEBOS_GLIB_SHIM_H
#define WEBOS_GLIB_SHIM_H

#ifdef __cplusplus
extern "C" {
#endif

/* ---- 32-bit ARM (ILP32) base types ---- */
typedef int            gboolean;
typedef int            gint;
typedef unsigned int   guint;
typedef char           gchar;
typedef void          *gpointer;
typedef unsigned long  gsize;    /* 4 bytes on arm32 */
typedef int            GPid;     /* pid_t == int */

#define FALSE 0
#define TRUE  1

/* ---- GIOChannel ---- */
typedef struct _GIOChannel GIOChannel;

typedef enum {
    G_IO_IN   = 1,
    G_IO_PRI  = 2,
    G_IO_OUT  = 4,
    G_IO_ERR  = 8,
    G_IO_HUP  = 16,
    G_IO_NVAL = 32
} GIOCondition;

typedef enum {
    G_IO_STATUS_ERROR  = 0,
    G_IO_STATUS_NORMAL = 1,
    G_IO_STATUS_EOF    = 2,
    G_IO_STATUS_AGAIN  = 3
} GIOStatus;

typedef struct _GError GError;   /* opaque; we always pass NULL */

typedef gboolean (*GIOFunc)(GIOChannel *source, GIOCondition cond, gpointer data);
typedef void     (*GChildWatchFunc)(GPid pid, gint status, gpointer data);

extern GIOChannel *g_io_channel_unix_new(int fd);
extern guint       g_io_add_watch(GIOChannel *channel, GIOCondition cond,
                                  GIOFunc func, gpointer user_data);
extern GIOStatus   g_io_channel_read_line(GIOChannel *channel, gchar **str_return,
                                          gsize *length, gsize *terminator_pos,
                                          GError **error);
extern void        g_io_channel_unref(GIOChannel *channel);
extern void        g_io_channel_set_close_on_unref(GIOChannel *channel, gboolean do_close);
extern GIOStatus   g_io_channel_shutdown(GIOChannel *channel, gboolean flush,
                                         GError **error);

extern guint       g_child_watch_add(GPid pid, GChildWatchFunc func, gpointer data);
extern gboolean    g_source_remove(guint tag);

extern void        g_free(gpointer mem);

#ifdef __cplusplus
}
#endif

#endif /* WEBOS_GLIB_SHIM_H */
