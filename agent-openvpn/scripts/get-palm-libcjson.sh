#!/bin/sh
# get-palm-libcjson — pull Palm's json-c (libcjson) off a novacom-connected
# webOS device into a cross sysroot, so agent-openvpn/ can link against it.
#
# Palm shipped json-c under the soname libcjson.so (json-c ~0.9 API). The
# OpenVPN agent links -lcjson and #includes <json.h>, so the build box needs
# both the runtime lib (to link) and matching headers (to compile).
#
# Usage:
#   ./get-palm-libcjson.sh [SYSROOT]
#   SYSROOT=/opt/webos/sysroot ./get-palm-libcjson.sh
#
# Requires: novacom ON THIS HOST with the device (TouchPad) connected — i.e.
# run this on whatever machine has novacom access, then copy the sysroot to
# (or share it with) the Linux box that has the ARM cross toolchain.

set -e

SYSROOT="${1:-${SYSROOT:-/opt/webos/sysroot}}"
LIBDIR="$SYSROOT/usr/lib"
INCDIR="$SYSROOT/usr/include/json"

run() { echo "$1" | novacom run file://bin/sh; }

# 0. device present?
if ! run 'echo novacom-ok' 2>/dev/null | grep -q novacom-ok; then
    echo "ERROR: no device on novacom. Connect the TouchPad and retry." >&2
    exit 1
fi

mkdir -p "$LIBDIR" "$INCDIR"

# 1. runtime libraries — libcjson.so plus any versioned sonames.
echo "== locating libcjson on device =="
libs=$(run 'ls -1 /usr/lib/libcjson.so* 2>/dev/null' || true)
if [ -z "$libs" ]; then
    echo "ERROR: no /usr/lib/libcjson.so* found on device." >&2
    echo "  investigate: echo 'ls /usr/lib/*json*' | novacom run file://bin/sh" >&2
    exit 1
fi
for f in $libs; do
    base=$(basename "$f")
    echo "  pull $f -> $LIBDIR/$base"
    novacom get "file://$f" > "$LIBDIR/$base"
done
# ensure a plain -lcjson link name exists (device may only ship a versioned so).
if [ ! -e "$LIBDIR/libcjson.so" ]; then
    first=$(basename "$(echo "$libs" | head -1)")
    ln -sf "$first" "$LIBDIR/libcjson.so"
    echo "  symlink libcjson.so -> $first"
fi

# 2. headers — production images usually STRIP /usr/include, so this often
#    comes up empty. The runtime lib is enough to LINK; headers are needed to
#    COMPILE, and can be sourced from json-c 0.9.x if absent here.
echo "== locating json-c headers on device =="
hdrs=$(run 'ls -1 /usr/include/json/*.h /usr/include/json.h 2>/dev/null' || true)
if [ -n "$hdrs" ]; then
    for h in $hdrs; do
        base=$(basename "$h")
        echo "  pull $h -> $INCDIR/$base"
        novacom get "file://$h" > "$INCDIR/$base"
    done
else
    cat <<WARN
  WARNING: no json-c headers on device (expected on a production image).
  You can still LINK; to COMPILE, drop json-c ~0.9 headers into:
      $INCDIR
  e.g.:  git clone https://github.com/json-c/json-c \\
           && cd json-c && git checkout json-c-0.9 && cp *.h "$INCDIR"/
  (Palm's is the old API: json_object_object_get returns json_object*, not _ex.)
  Sanity-check the header set against the device's exported symbols:
      arm-*-nm -D "$LIBDIR/libcjson.so" | grep json_object_
WARN
fi

echo
echo "Done."
echo "  libs    -> $LIBDIR/libcjson.so*"
echo "  headers -> $INCDIR/  (see warning above if empty)"
echo "  build:     make CROSS_COMPILE=<prefix> SYSROOT=$SYSROOT"
echo
echo "NOTE: glib-2.0 + libpthread are also needed; pull them the same way"
echo "      (/usr/lib/libglib-2.0.so*, /usr/include/glib-2.0) if your sysroot"
echo "      doesn't already have them."
