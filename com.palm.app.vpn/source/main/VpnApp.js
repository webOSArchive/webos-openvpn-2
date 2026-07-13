enyo.kind({
	name: "VpnService", kind: "PalmService", service: "palm://com.palm.vpn/"
});

enyo.kind({
    name: "VpnApp",
    kind: "VFlexBox",

    components: [
        { kind: "AppMenu", components: [
            { kind: "HelpMenu", target: "http://help.palm.com/vpn/index.html" }
        ]},
        { kind: "Toolbar", className: "enyo-toolbar-light", pack: "center", components: [
            { kind: "Image", src: "../../images/vpn-48.png", },
            { kind: "Control", name: "title", content: $L("VPN"), className: "enyo-text-header vpn-page-title" }
        ]},
        { kind: "Pane", flex: 1, onSelectView: "viewSelected", components: [
            { kind: "MainProfileListView", name: "mainView", onAddProfile: "showAddProfileView", onShowConnectionDetails: "showConnectionDetailsView", onConnectFailure: "closeBannerPrompt", onForceShowMainView: "showMainView", onClearConnectionDetailsView: "clearConnectionDetailsView" },
            { kind: "AddProfileView", name: "addProfileView", onShowEulaTerms: "showEulaTermsView", onConnected: "showMainView", onCancel: "showMainView" },
            { kind: "EulaTermsView", name: "eulaTermsView", onAcceptDeclineTerms: "handleAcceptDeclineTerms" },
            { kind: "ConfigureProfileView", name: "configureProfileView", onConnected: "showMainView", onTapBackBtn: "goBackToPreviousView" },
            { kind: "ConnectionDetailsView", name: "connectionDetailsView", onDone: "showMainView", onRemoveProfile: "removeProfile", onConnectDisconnectProfile: "connectDisconnectProfile" }
        ]},
        { kind: "ApplicationEvents", onWindowParamsChange: "windowParamsChangeHandler", onWindowActivated: "windowActivatedHandler", onWindowDeactivated: "windowDeactivatedHandler" },
        { name: "registerServerStatus", kind: "PalmService", service: "palm://com.palm.lunabus/signal/", subscribe: true, resubscribe: true, onResponse: "handleVpnSvcState" },
        { name: "getStatus", kind: "VpnService", subscribe: true, resubscribe: true, onResponse: "handleVpnServiceNotifications" },
        { name: "getProfileList", kind: "VpnService", subscribe: true, resubscribe: true, onResponse: "handleGetProfileListResponse" },
        { name: "getProfileDetails", kind: "VpnService" },
        { name: "dialogError", kind: "ErrorDialog" },
        { name: "bannerPrompt", kind: "BannerDialog" },
        { name: "credsPromptPopup", kind: "CredsPrompt" },
    ], 

    create: function() {
        this.inherited(arguments);
        this.$.registerServerStatus.call({"serviceName": "com.palm.vpn"});
    },

    windowActivatedHandler: function() {
        this.log("************************* activated ******************* ");
    },

    windowDeactivatedHandler: function() {
        this.log("************************* de-activated ******************* ");
    },

    windowParamsChangeHandler: function() {
        this.log("################## window params changed ###################");
        this.handleLaunch(enyo.windowParams);
    },

    viewSelected: function(inSender, inView, inPreviousView) {
        var title = "";
        switch (inView.name) {
            case "addProfileView":
                title = $L("Add A Profile");
                break;
            case "eulaTermsView":
                title = $L("EULA");
                break;
            case "configureProfileView":
                title = $L("Configure A Profile");
                break;
            default:
                title = $L("VPN");
                break;
        }
        this.$.title.setContent(title);
    },

    showError: function(errorMsg) {
        this.$.dialogError.openAtCenter($L("Error"), errorMsg, "");
    },

    handleLaunch: function(params) {
        this.log("handleLaunch Called.");

        params = params || {};
        this.launchParams = params;

        if (undefined != params.vpnAgentGuid) {
            this.log("vpnAgentGuid");
            if (undefined != params.banner) {
                this.showVpnBannerPrompt(params);
            } else if (params.popupPrompt) {
                this.$.credsPromptPopup.updateCredsPromptDynamicForm(params);
                this.$.credsPromptPopup.openAtCenter();
            } else if (undefined != params.vpnFormFields) {
                var launchSceneAfterGettingProfileDetails = false;
                if (undefined != params.vpnProfileName) {
                    this.log("Received a profile name. Lets find if is existing or new one");
                    this.$.getProfileDetails.call({vpnProfileName: params.vpnProfileName}, {onResponse: "handleGetProfileDetailsResponse"});
                    launchSceneAfterGettingProfileDetails = true;
                } else {
                    this.log("Its New Profile");
                    params.isNewProfile = true;
                }
                if(!launchSceneAfterGettingProfileDetails) {
                    this.log("Launch configure-profile scene right now");
                    this.$.configureProfileView.updateConfigureProfileDynamicForm(params);
                    this.$.pane.selectViewByName("configureProfileView");
                } else {
                    this.log("Launch configure-profile scene later");
                }
            } else {
                this.log("Launched with agent guid but with out right paramters");
            }
        } else if (undefined != params.dashBoardBanner) {
            this.log("dashBoardBanner.. this is not supposed to happen from here..");
        } else if (undefined != params.dashBoardLaunch) {
            this.log("dashBoardLaunch");
            this.$.mainView.setReconnectProfileName(params.vpnProfileName);
            this.$.pane.selectViewByName("mainView");
        } else if (undefined != params.connectedWithOutProfile) {
            this.log("connectedWithOutProfile");
            this.$.pane.selectViewByName("mainView");
        } else {
            this.log("default");
            this.$.pane.selectViewByName("mainView");
        }
    },

    handleVpnServiceNotifications: function(inSender, inResponse, inRequest) {
        if(undefined!=inResponse) {
            this.log("handleVpnServiceNotifications", inResponse);
            if(null!=inResponse.profile) {
                this.log("*****************************************shouldn't be getting profile changed notifications", inResponse);
            } else if(null!=inResponse.noticeSeverity && "errorNotice"===inResponse.noticeSeverity) {
                this.showError(inResponse.notice);
            } else if(undefined != inResponse.bannerResponseReceived) {
                this.log("banner response received. so, close banner prompt if it still exists");
                // close banner prompt, if any
                this.$.bannerPrompt.closeIfExists();
            }
        }
    },

    handleVpnSvcState: function(inSender, inResponse, inRequest) {
        this.log("handleVpnSvcState: ", inResponse);
        if (inResponse.connected) {
            // subscribe to vpn notifications.
            this.$.getStatus.call({});
            // subscribe to vpn profile list changes.
            this.$.getProfileList.call({});
        } else {
            this.log("service went down");
            this.closeBannerPrompt();
            this.closeCredsPopupPrompt();
            this.$.getStatus.cancel();
            this.$.getProfileList.cancel();
        }
    },

    handleGetProfileDetailsResponse: function(inSender, inResponse) {
        this.log("Called");
        if (inResponse.returnValue) {
            this.log("It is a Existing Profile");
            this.launchParams.isNewProfile = false;
        } else {
            this.log("It is a New Profile");
            this.launchParams.isNewProfile = true;
        }
        this.$.configureProfileView.updateConfigureProfileDynamicForm(this.launchParams);
        this.$.pane.selectViewByName("configureProfileView");
    },

    handleGetProfileListResponse: function(inSender, inResponse) {
        this.log("Response Received: ", inResponse);
        this.$.mainView.setActiveProfile(undefined);
        if (undefined != inResponse && undefined != inResponse.vpnProfiles) {
            this.$.mainView.destroyProfileList();
            if(inResponse.vpnProfiles.length > 0) {
                for(var i=0; i<inResponse.vpnProfiles.length; ++i) {
                    this.$.mainView.addProfileItemToList(inResponse.vpnProfiles[i]);
                    // update connection details view if the profileName matches..
                    this.updateConnectionDetailsView(inResponse.vpnProfiles[i]);
                }
            }
            this.$.mainView.appendAddProfile();
            this.$.mainView.renderProfileList();
        } else if (undefined != inResponse && false === inResponse.returnValue) {
            this.error("probably vpn service went down");
        } else {
            this.$.mainView.destroyProfileList();
            this.$.mainView.renderProfileList();
            this.error("Failed to get list of vpn profiles");
        }
        this.log("###### active profile: ", this.$.mainView.getActiveProfile());
    },

    showVpnBannerPrompt: function(params) {
        this.log("show VPN Banner Popup");
        this.$.bannerPrompt.setData(params);
        this.$.bannerPrompt.openAtCenter();
    },

    closeBannerPrompt: function() {
        // close banner prompt, if any
        this.$.bannerPrompt.closeIfExists();
    },

    closeCredsPopupPrompt: function() {
        // close banner prompt, if any
        this.$.credsPromptPopup.closeIfExists();
    },

    showMainView: function(inView) {
        this.$.pane.selectViewByName("mainView");
    },

    removeProfile: function(inView, profile) {
        this.log("profile to be deleted: ", profile);
        this.$.mainView.removeProfile(profile);
    },

    connectDisconnectProfile: function(inView, profile) {
        this.log("connect/disconnect profile: ", profile);
        this.$.mainView.connectDisconnectProfile(profile);
    },

    showAddProfileView: function() {
        this.$.addProfileView.setVpnServerName("");
        this.$.pane.selectViewByName("addProfileView");
    },

    goBackToPreviousView: function() {
        this.$.pane.back();
    },

    showEulaTermsView: function(inView, eulaParams) {
        this.$.eulaTermsView.setEulaPath(eulaParams.eulaPath);
        this.$.eulaTermsView.setAgentGuid(eulaParams.agentGuid);
        this.$.eulaTermsView.setLabel(eulaParams.label);
        this.$.pane.selectViewByName("eulaTermsView");
    },

    handleAcceptDeclineTerms: function(inView, acceptTerms) {
        this.$.addProfileView.setWasEulaTermsAccepted(acceptTerms);
        this.$.pane.selectViewByName("addProfileView");
    },

    showConnectionDetailsView: function(inView, profileItem) {
        // Hack: first set profile details to undefined..
        this.$.connectionDetailsView.setProfileDetails(undefined);
        this.$.connectionDetailsView.setProfileName(profileItem.vpnProfileName);
        this.$.connectionDetailsView.setAgentGuid(profileItem.vpnAgentGuid);
        this.$.connectionDetailsView.setProfileConnectState(profileItem.vpnProfileConnectState);
        this.$.pane.selectViewByName("connectionDetailsView");
    },

    updateConnectionDetailsView: function(profileItem) {
        // TODO: update connection details view, only if it is current view..
        if (this.$.connectionDetailsView.getProfileName() === profileItem.vpnProfileName) {
            this.log("profile: " + profileItem.vpnProfileName + ", connect state: " + profileItem.vpnProfileConnectState);
            this.$.connectionDetailsView.setProfileConnectState(profileItem.vpnProfileConnectState);
        }
    },

    clearConnectionDetailsView: function(inView, profileItem) {
        if (this.$.connectionDetailsView.getProfileName() === profileItem.vpnProfileName) {
            this.$.connectionDetailsView.setProfileName("");
            this.$.connectionDetailsView.setAgentGuid("");
            this.$.connectionDetailsView.setProfileConnectState("");
            this.$.connectionDetailsView.setProfileDetails(undefined);
        }
    },

    backHandler: function(inSender, inEvent) {
        this.$.pane.back(inEvent);
    },
});
