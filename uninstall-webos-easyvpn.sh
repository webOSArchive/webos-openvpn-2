#!/usr/bin/env bash
#
# uninstall-webos-easyvpn.sh
# -----------------------------------------------------------------------------
# Fully removes the legacy strongSwan "EasyVPN" server created by
# setup-webos-easyvpn-deprecated.sh, and undoes its firewall / sysctl changes.
#
# SAFE ALONGSIDE PiVPN/OpenVPN: it does NOT touch iptables-persistent, IP
# forwarding, or any rules outside the EasyVPN client pool, so a PiVPN server on
# the same box keeps working.
#
# Usage:
#   sudo ./uninstall-webos-easyvpn.sh
#
# If you installed with a non-default pool or uplink, pass the SAME values so the
# exact NAT/forward rules get removed:
#   sudo VPN_POOL='10.10.10.0/24' WAN_IF='eth0' ./uninstall-webos-easyvpn.sh
# -----------------------------------------------------------------------------
set -uo pipefail   # NOT -e: every step is best-effort / idempotent.

# Match the installer's defaults.
VPN_POOL="${VPN_POOL:-10.10.10.0/24}"
WAN_IF="${WAN_IF:-}"

if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR: run as root (sudo $0)" >&2
    exit 1
fi

if [[ -z "${WAN_IF}" ]]; then
    WAN_IF="$(ip route show default 2>/dev/null | awk '{print $5; exit}')"
fi

echo "==> Removing the webOS EasyVPN (strongSwan) server"
echo "    Client IP pool   : ${VPN_POOL}"
echo "    Uplink interface : ${WAN_IF:-<unknown>}"
echo

# --- 1. Stop, disable, and purge strongSwan ---------------------------------
echo "==> Stopping + purging strongSwan..."
for svc in strongswan strongswan-starter strongswan-swanctl; do
    systemctl stop "$svc" 2>/dev/null || true
    systemctl disable "$svc" 2>/dev/null || true
done
ipsec stop 2>/dev/null || true

export DEBIAN_FRONTEND=noninteractive
# Purge only strongSwan bits. Deliberately NOT touching iptables /
# iptables-persistent / netfilter-persistent (PiVPN relies on them).
apt-get purge -y strongswan libcharon-extra-plugins 2>/dev/null || true
apt-get autoremove --purge -y 2>/dev/null || true

# --- 2. Remove config files the installer wrote -----------------------------
echo "==> Removing config files..."
rm -f /etc/strongswan.d/webos-easyvpn.conf
rm -f /etc/ipsec.conf /etc/ipsec.secrets
rm -f /etc/ipsec.conf.orig /etc/ipsec.secrets.orig   # the installer's backups
# strongswan.d and ipsec.d are package dirs; remove only if now empty.
for d in /etc/strongswan.d /etc/ipsec.d /etc/swanctl; do
    [[ -d "$d" ]] && rmdir --ignore-fail-on-non-empty "$d" 2>/dev/null || true
done

# --- 3. Remove the pool-scoped NAT / forward rules --------------------------
echo "==> Removing NAT/forward rules for ${VPN_POOL}..."
if command -v iptables >/dev/null 2>&1; then
    changed=0
    if [[ -n "${WAN_IF}" ]]; then
        iptables -t nat -D POSTROUTING -s "${VPN_POOL}" -o "${WAN_IF}" -j MASQUERADE 2>/dev/null && changed=1 || true
    fi
    iptables -D FORWARD -s "${VPN_POOL}" -j ACCEPT 2>/dev/null && changed=1 || true
    iptables -D FORWARD -d "${VPN_POOL}" -j ACCEPT 2>/dev/null && changed=1 || true
    # NOTE: the generic TCP-MSS clamp rule is intentionally left in place --
    # it's not pool-specific and PiVPN benefits from one too.
    if [[ "$changed" -eq 1 ]] && command -v netfilter-persistent >/dev/null 2>&1; then
        netfilter-persistent save 2>/dev/null || true
        echo "    removed rules and saved."
    else
        echo "    no matching rules found (already clean)."
    fi
fi

# --- 4. Remove its sysctl drop-in (keep IP forwarding on for PiVPN) ---------
echo "==> Removing sysctl drop-in..."
rm -f /etc/sysctl.d/99-webos-vpn.conf
sysctl --system >/dev/null 2>&1 || true

# --- 5. Verify --------------------------------------------------------------
echo
echo "============================================================"
echo " Cleanup complete. Verifying..."
echo "============================================================"

if command -v ipsec >/dev/null 2>&1; then
    echo "  [!] 'ipsec' still present -- strongSwan may not have fully purged."
else
    echo "  [ok] strongSwan removed."
fi

if ss -lunp 2>/dev/null | grep -qE ':500\b|:4500\b'; then
    echo "  [!] Something is still listening on UDP 500/4500:"
    ss -lunp 2>/dev/null | grep -E ':500\b|:4500\b'
else
    echo "  [ok] nothing listening on IKE ports (UDP 500/4500)."
fi

fwd="$(sysctl -n net.ipv4.ip_forward 2>/dev/null)"
if [[ "$fwd" == "1" ]]; then
    echo "  [ok] IP forwarding still enabled (PiVPN needs this)."
else
    echo "  [!] IP forwarding is OFF (net.ipv4.ip_forward=$fwd)."
    echo "      If you run PiVPN/OpenVPN, re-enable it (PiVPN sets it in its own"
    echo "      /etc/sysctl.d file; 'sudo pivpn -d' will flag/fix it)."
fi

if command -v pivpn >/dev/null 2>&1; then
    echo "  [i] PiVPN detected and untouched. Sanity-check it with: sudo pivpn -c"
fi

cat <<'EOF'

Two things to do by hand (they're not on this box):
  * ROUTER: delete the UDP 500 + UDP 4500 port-forward to this Pi, plus any
    source-IP allowlist rules you added for those ports. That was the actual
    insecure exposure.
  * Device: delete the old "VPNC" profile in Settings -> VPN if you made one.

EOF
