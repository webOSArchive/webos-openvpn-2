#!/usr/bin/env bash
#
# setup-webos-easyvpn-deprecated.sh
# -----------------------------------------------------------------------------
# One-shot EasyVPN installer that turns a Raspberry Pi (or any Debian/Raspbian/Ubuntu
# box) into a strongSwan VPN server that legacy Palm/HP webOS devices can
# connect to with their BUILT-IN "VPN" app (the VPNC / Cisco IPsec agent).
#
# webOS's bundled client is vpnc 0.5.3, which speaks Cisco "EasyVPN":
#     IKEv1 Aggressive Mode  +  group pre-shared key  +  XAUTH user/password.
# This script configures strongSwan as a matching EasyVPN-style responder.
#
# ---  SECURITY NOTE  ---------------------------------------------------------
# To interoperate with a 2011-era client this uses deliberately WEAK, legacy
# crypto (modp1024 / 3DES / SHA1 / aggressive-mode PSK). That's fine for a
# hobby tunnel to an old tablet. DO NOT reuse this server for anything you
# actually need to keep private.
# -----------------------------------------------------------------------------
#
# Usage:
#   sudo ./setup-webos-easyvpn-deprecated.sh
#
# Override any default by exporting it first, e.g.:
#   sudo GROUP_SECRET='mysecret' VPN_USER='alice' VPN_PASS='pw' ./setup-webos-easyvpn-deprecated.sh
#
set -euo pipefail

# ============================ EDIT THESE ====================================
GROUP_ID="${GROUP_ID:-webos}"                      # "IPSec ID" field (cosmetic with catch-all PSK)
GROUP_SECRET="${GROUP_SECRET:-ChangeThisGroupSecret}"   # "IPSec Secret" (group PSK)
VPN_USER="${VPN_USER:-webos}"                      # XAUTH username
VPN_PASS="${VPN_PASS:-ChangeThisPassword}"         # XAUTH "VPN password"

VPN_POOL="${VPN_POOL:-10.10.10.0/24}"              # IPs handed to clients (Mode-Config)
VPN_DNS="${VPN_DNS:-1.1.1.1,8.8.8.8}"              # DNS pushed to clients
# Subnet the client can reach. 0.0.0.0/0 = full tunnel (route all traffic).
# Use e.g. 192.168.1.0/24 to only reach your home LAN (split tunnel).
LEFT_SUBNET="${LEFT_SUBNET:-0.0.0.0/0}"

# Uplink interface to NAT out of. Auto-detected from the default route if empty.
WAN_IF="${WAN_IF:-}"
# ============================================================================

if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR: run as root (sudo $0)" >&2
    exit 1
fi

if [[ -z "${WAN_IF}" ]]; then
    WAN_IF="$(ip route show default 2>/dev/null | awk '{print $5; exit}')"
fi
if [[ -z "${WAN_IF}" ]]; then
    echo "ERROR: could not auto-detect uplink interface; set WAN_IF=eth0 (or wlan0)." >&2
    exit 1
fi

echo "==> webOS strongSwan setup"
echo "    Uplink interface : ${WAN_IF}"
echo "    Client IP pool   : ${VPN_POOL}"
echo "    Routed subnet    : ${LEFT_SUBNET}"
echo "    Group ID / user  : ${GROUP_ID} / ${VPN_USER}"
if [[ "${GROUP_SECRET}" == "ChangeThisGroupSecret" || "${VPN_PASS}" == "ChangeThisPassword" ]]; then
    echo
    echo "    !! You are using the DEFAULT secret/password. Re-run with your own:"
    echo "       sudo GROUP_SECRET='...' VPN_USER='...' VPN_PASS='...' $0"
    echo
fi

# --- 1. Install strongSwan + the XAUTH plugin -------------------------------
echo "==> Installing packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
# libcharon-extra-plugins provides xauth-generic (required for XAUTH).
# iptables-persistent saves the NAT rules across reboots.
echo "iptables-persistent iptables-persistent/autosave_v4 boolean false" | debconf-set-selections
echo "iptables-persistent iptables-persistent/autosave_v6 boolean false" | debconf-set-selections
apt-get install -y strongswan libcharon-extra-plugins iptables iptables-persistent

# --- 2. Enable IP forwarding (persistent) -----------------------------------
echo "==> Enabling IP forwarding..."
cat > /etc/sysctl.d/99-webos-vpn.conf <<'EOF'
net.ipv4.ip_forward = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
EOF
sysctl -p /etc/sysctl.d/99-webos-vpn.conf >/dev/null

# --- 3. NAT / firewall ------------------------------------------------------
echo "==> Configuring NAT (masquerade ${VPN_POOL} out ${WAN_IF})..."
iptables -t nat -C POSTROUTING -s "${VPN_POOL}" -o "${WAN_IF}" -j MASQUERADE 2>/dev/null \
    || iptables -t nat -A POSTROUTING -s "${VPN_POOL}" -o "${WAN_IF}" -j MASQUERADE
iptables -C FORWARD -s "${VPN_POOL}" -j ACCEPT 2>/dev/null \
    || iptables -A FORWARD -s "${VPN_POOL}" -j ACCEPT
iptables -C FORWARD -d "${VPN_POOL}" -j ACCEPT 2>/dev/null \
    || iptables -A FORWARD -d "${VPN_POOL}" -j ACCEPT
# Clamp MSS so tunneled TCP doesn't fragment on the old client's small MTU.
iptables -t mangle -C FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu 2>/dev/null \
    || iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
netfilter-persistent save

# --- 4. strongSwan: enable aggressive-mode PSK + Cisco Unity ----------------
echo "==> Enabling aggressive-mode PSK + Cisco Unity..."
cat > /etc/strongswan.d/webos-easyvpn.conf <<'EOF'
# webOS / vpnc compatibility: required to answer IKEv1 aggressive-mode PSK.
charon {
    i_dont_care_about_security_and_use_aggressive_mode_psk = yes
    cisco_unity = yes
}
EOF

# --- 5. ipsec.conf ----------------------------------------------------------
echo "==> Writing /etc/ipsec.conf..."
[[ -f /etc/ipsec.conf ]] && cp -n /etc/ipsec.conf /etc/ipsec.conf.orig || true
cat > /etc/ipsec.conf <<EOF
# Generated by setup-webos-easyvpn-deprecated.sh — Cisco EasyVPN responder for webOS vpnc 0.5.3
config setup
    uniqueids = no

conn webos-easyvpn
    keyexchange = ikev1
    aggressive  = yes
    authby      = xauthpsk

    # Legacy proposals vpnc 0.5.3 offers (DH group 2 / 3DES / AES-CBC / SHA1).
    ike = aes128-sha1-modp1024,aes256-sha1-modp1024,3des-sha1-modp1024
    esp = aes128-sha1,aes256-sha1,3des-sha1

    # --- server side ---
    left         = %any
    leftauth     = psk
    leftsubnet   = ${LEFT_SUBNET}
    leftfirewall = yes

    # --- client (webOS) side ---
    right          = %any
    rightauth      = psk
    rightauth2     = xauth          # second auth round = XAUTH username/password
    xauth          = server
    rightsourceip  = ${VPN_POOL}    # Mode-Config address pool
    rightdns       = ${VPN_DNS}

    dpdaction = clear
    dpddelay  = 30s
    rekey     = no
    auto      = add
EOF

# --- 6. ipsec.secrets -------------------------------------------------------
echo "==> Writing /etc/ipsec.secrets..."
[[ -f /etc/ipsec.secrets ]] && cp -n /etc/ipsec.secrets /etc/ipsec.secrets.orig || true
umask 077
cat > /etc/ipsec.secrets <<EOF
# Group pre-shared key — matches the "IPSec Secret" field on the device.
# The leading ": PSK" is a catch-all: any "IPSec ID" the device sends is accepted.
: PSK "${GROUP_SECRET}"

# XAUTH user(s) — "Username" + "VPN password" fields on the device.
${VPN_USER} : XAUTH "${VPN_PASS}"
EOF
chmod 600 /etc/ipsec.secrets

# --- 7. Restart + verify ----------------------------------------------------
echo "==> Restarting strongSwan..."
systemctl enable strongswan >/dev/null 2>&1 || systemctl enable strongswan-starter >/dev/null 2>&1 || true
(systemctl restart strongswan 2>/dev/null || systemctl restart strongswan-starter 2>/dev/null || ipsec restart)
sleep 2

echo
echo "============================================================"
echo " Done. strongSwan is configured for webOS (Cisco EasyVPN)."
echo "============================================================"
PUBIP="$(ip -4 addr show "${WAN_IF}" 2>/dev/null | awk '/inet /{print $2}' | cut -d/ -f1 | head -1)"
echo
echo " On the webOS device:  Settings -> VPN -> Add VPN Profile"
echo "   Connection type : VPNC   (the Cisco IPsec agent)"
echo "   VPN Server      : ${PUBIP:-<this box public IP / DDNS hostname>}"
echo "   IPSec ID        : ${GROUP_ID}"
echo "   IPSec Secret    : <your group secret>"
echo "   Username        : ${VPN_USER}"
echo "   VPN password    : <your password>"
echo "   NAT Traversal   : NAT-T (auto-detect)"
echo
echo " Make sure UDP 500 and UDP 4500 reach this box (router port-forward)."
echo
echo " Watch a live connection attempt with:"
echo "   sudo ipsec statusall"
echo "   sudo journalctl -u strongswan -f    # (or: -u strongswan-starter)"
echo
echo " Loaded plugins (xauth-generic must be listed):"
ipsec statusall 2>/dev/null | sed -n 's/^.*loaded plugins: /  /p' | head -1 || true
