#!/bin/sh

export PALM_VPN_APP_ID="com.palm.app.vpn"
export PALM_VPN_INSTALLED_AGENT_PATH=/media/cryptofs/apps/usr/palm/vpnframework/agents
export PALM_VPN_AGENT_PATH=/usr/lib/vpn/agents
export ANYCONNECT_INSTALL_DIR=/usr/lib/vpn/agents/ciscoanyconnect
export PALM_VPN_SERVICE_L18N_DIR=/usr/lib/vpn/service/resources
exec /usr/bin/PmVpnDaemon
