#!/usr/bin/env bash
#
# install-openvpn-agent.sh  --  install the webOS OpenVPN VPN-agent onto a
# TouchPad over novacom, from the machine that built it.
#
# Installs:
#   /usr/lib/vpn/agents/openvpn/vpn-plugin-info.json   (manifest)
#   /usr/lib/vpn/agents/openvpn/libVpnOpenvpnAgent.so  (the agent)
#   /usr/lib/vpn/agents/openvpn/openvpn                (2.5.9, vs OpenSSL 1.1.1w)
#   /usr/lib/vpn/agents/openvpn/openvpn-up             (route/DNS hook)
#
# Requires: novacom in PATH, a device connected (novacom -l shows it), and the
# codepoet80/OpenSSL-legacyWebOS package already installed (provides
# /usr/lib/ssl11/libssl.so.1.1 + libcrypto.so.1.1 that openvpn links against).
#
# Re-run any time to update; it just re-pushes. Then restart the VPN daemon
# (this script does it) and open Settings -> VPN -> Add Profile -> OpenVPN.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
D=/usr/lib/vpn/agents/openvpn

need() { [ -f "$HERE/$1" ] || { echo "missing build artifact: $1 (run 'make' first)" >&2; exit 1; }; }
need libVpnOpenvpnAgent.so
need vpn-plugin-info.json
need scripts/openvpn-up
need openvpn

command -v novacom >/dev/null || { echo "novacom not in PATH" >&2; exit 1; }
novacom -l | grep -q . || { echo "no device on novacom (novacom -l is empty)" >&2; exit 1; }

echo ">> checking device prerequisites"
echo 'test -e /dev/net/tun && echo "tun: ok" || echo "tun: MISSING";
      test -e /usr/lib/ssl11/libssl.so.1.1 && echo "ssl11: ok" || echo "ssl11: MISSING (install OpenSSL-legacyWebOS first)"' \
  | novacom run file://bin/sh

echo ">> creating $D"
echo "mkdir -p $D" | novacom run file://bin/sh

echo ">> pushing files"
novacom put file://$D/vpn-plugin-info.json     < "$HERE/vpn-plugin-info.json"
novacom put file://$D/libVpnOpenvpnAgent.so    < "$HERE/libVpnOpenvpnAgent.so"
novacom put file://$D/openvpn-up               < "$HERE/scripts/openvpn-up"
novacom put file://$D/openvpn                   < "$HERE/openvpn"

echo ">> setting permissions"
echo "chmod 644 $D/vpn-plugin-info.json;
      chmod 755 $D/libVpnOpenvpnAgent.so $D/openvpn-up $D/openvpn;
      ls -la $D" | novacom run file://bin/sh

echo ">> restarting VPN daemon (re-scans agents)"
echo "killall PmVpnDaemon 2>/dev/null; sleep 1; echo done" | novacom run file://bin/sh

echo ">> verifying OpenVPN is now registered"
echo "luna-send -n 1 palm://com.palm.vpn/getAgents '{}' 2>/dev/null" | novacom run file://bin/sh | tr ',' '\n' | grep -i openvpn || true

cat <<EOF

Done. On the device:
  Settings -> VPN -> Add Profile -> Connection Type: OpenVPN
  Enter your server (host), tap Next, fill the OpenVPN fields, Save & Connect.

Recommended: copy a PiVPN .ovpn to the device (e.g. /media/internal/vpn/client.ovpn)
and point the "Config file (.ovpn) path" field at it. See the community guide
(PIVPN-GUIDE.md) for the Pi side.

Logs on device:  tail -f /var/log/webos-openvpn-agent.log
EOF
