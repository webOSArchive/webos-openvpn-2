enyo.kind({
    name: "Vpn",
    kind: "VFlexBox",

    components: [
        { name: "vpnDashboard", kind: "Dashboard", onTap: "tapVpnDashboard" },
        { kind: "ApplicationEvents", onWindowParamsChange: "windowParamsChangeHandler", onWindowActivated: "windowActivatedHandler", onWindowDeactivated: "windowDeactivatedHandler", onApplicationRelaunch: "applicationRelaunchHandler" }
    ],

    create: function() {
        this.inherited(arguments);
        this.handleLaunch(enyo.windowParams);
    },

    windowActivatedHandler: function() {
        this.log("************************* activated ******************* ");
    },

    windowDeactivatedHandler: function() {
        this.log("************************* de-activated ******************* ");
    },

    windowParamsChangeHandler: function() {
        this.log("################## window params changed ###################");
    },

    applicationRelaunchHandler: function(params) {
        this.log("####################### app relaunched #################### ");
        this.handleLaunch(enyo.windowParams);
    },

    handleLaunch: function(params) {
        var mainWindow = enyo.windows.fetchWindow("main");
        this.log("handleLaunch called.");

        params = params || {};
        params.mainWindowCreated = false;
        this.launchParams = params;

        if (undefined != params.dashBoardBanner) {
            this.log("---------- dashboard banner ----------");
            if(!mainWindow || (mainWindow && mainWindow != enyo.windows.getActiveWindow())) {
                var params = {};
                if (this.launchParams.vpnProfileName != undefined) {
                    params.vpnProfileName = this.launchParams.vpnProfileName;
                }
                this.showDashboard(params);
            }
        } else {
            this.log("---------- main card  ----------");
            if(!mainWindow) {
                this.log("Main window is not there. So, open and activate it.");
                params.mainWindowCreated = true;
                enyo.windows.activate("source/main/main.html", "main", params);
            } else {
                this.log("Main window is already open. So, just activate it and pass the params to it.");
                enyo.windows.activateWindow(mainWindow, params);
            }
            this.$.vpnDashboard.pop();
        }
        return true;
    },

    showDashboard: function(params) {
        this.log("Show VPN Dashboard");
        enyo.windows.addBannerMessage($L("VPN Disconnected"), "{}", "./images/vpn-notify-small.png");
        this.$.vpnDashboard.push({title: $L("VPN Disconnected"), text: $L("Tap to reconnect"), icon: "./images/vpn-48-notify.png", params: params});
    },

    tapVpnDashboard: function(inSender, inLayer, inEvent) {
        this.log("Tapped on VPN Dashboard");
        this.$.vpnDashboard.pop();
        var params = inLayer.params;
        params.dashBoardLaunch = true;
        this.log("Launch params: ", params);
        this.handleLaunch(params);
    },

    backHandler: function(inSender, inEvent) {
        this.$.pane.back(inEvent);
    },

});

