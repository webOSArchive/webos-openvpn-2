enyo.kind({
    name: "MainProfileListView",
    kind: enyo.VFlexBox,
    className: "enyo-bg",

    events: {
        onAddProfile:"",
        onShowConnectionDetails: "",
        onForceShowMainView: "",
        onClearConnectionDetailsView: "",
        onConnectFailure: "",
    },
    
    published: {
        activeProfile: undefined,
        reconnectProfileName: undefined,
    },

    components: [
        { kind: "Scroller", flex: 1, components: [
            {kind:"VFlexBox", className:"box-center", components: [
                { kind: "RowGroup", name: "profileList", caption: $L("CHOOSE A PROFILE"), style:"min-height:32px;", components: [
                    // 'Add profile...'
                    { kind: "Item", tapHighlight: true, onclick: "doAddProfile", components: [
                        { kind: "HFlexBox", components: [
                            { kind: "Image", src: "../../images/list-icon-add-item.png", style: "padding: 4px; padding-right: 10px;" },
                            { content: $L("Add profile...") }
                        ]},
                    ]},
                ]},
            ]},
        ]},
        { name: "connect", kind: "VpnService" },
        { name: "disconnect", kind: "VpnService" },
        { name: "deleteProfile", kind: "VpnService" },
        { name: "getProfileDetails", kind: "VpnService" },
        { name: "dialogError", kind: "ErrorDialog" }
    ],

    create: function() {
        this.inherited(arguments);
    },

    handleDashboardLaunchProfileDetails: function(inSender, inResponse, inRequest) {
        this.$.connect.call(inRequest.params, {onResponse: "handleConnectResponse"});
    },

    reconnectProfileNameChanged: function() {
        this.$.getProfileDetails.call({vpnProfileName: this.reconnectProfileName}, {onSuccess: "handleDashboardLaunchProfileDetails"});
        this.reconnectProfileName = undefined;
    },

    showError: function(errorMsg) {
        this.$.dialogError.openAtCenter($L("Connection Error"), errorMsg, "");
    },

    handleDisconnectResponse: function(inSender, inResponse, inRequest) {
        var profile = inRequest.params;
        if (inResponse && inResponse.returnValue) {
            this.log("Successfully disconnected profile: " + profile.vpnProfileName);
        } else {
            this.error("Failed to disconnect profile: " + profile.vpnProfileName);
            this.showError($L("Disconnect Failure: ") + inResponse.errorText);
        }
    },

    handleProfileDeleteResponse: function(inSender, inResponse, inRequest) {
        this.log("Response Received: ", inResponse);
        this.profileNameBeingDeleted = undefined;
        if(undefined != inResponse && true == inResponse.returnValue) {
            // force showing main view is required, when delete profile is requested from connection details view.
            this.doForceShowMainView();
            this.doClearConnectionDetailsView(inRequest.params);
            // remove webproxy config for this profile.
            //NetworkProxyConfigLib.removeProxyConfig({networkTechnology:"vpn", proxyScope: inRequest.params.vpnProfileName}, {owner: this});
        }
    },

    handleProfileDisconnectResponseBeforeDelete: function(inSender, inResponse, inRequest) {
        this.log("Response Received: ");
        var profile = inRequest.params;
        if (inResponse && inResponse.returnValue) {
            this.$.deleteProfile.call(profile, {onResponse: "handleProfileDeleteResponse"});
        } else {
            this.error("Failed to disconnect profile: " + profile.vpnProfileName);
            this.showError($L("Disconnect Failure: ") + inResponse.errorText);
        }
    },

    removeProfile: function(profile) {
        var state = profile.vpnProfileConnectState;
        this.profileNameBeingDeleted = profile.vpnProfileName;
        if("connected" === state || "connecting" === state || "reconnecting" === state) {
            this.log("Disconnecting profile - " + profile.vpnProfileName);
            this.$.disconnect.call(profile, {onResponse: "handleProfileDisconnectResponseBeforeDelete"});
        } else {
            this.log("Deleting profile - " + profile.vpnProfileName);
            this.$.deleteProfile.call(profile, {onResponse: "handleProfileDeleteResponse"});
        }
    },

    handleSwipeDeleteProfileItem: function(inSender, inIndex) {
        this.log("Called: ", inSender.data);
        this.removeProfile(inSender.data);

    },

    appendAddProfile: function() {
        var compItem = this.$.profileList.createComponent({
            kind: "Item",
            tapHighlight: true,
            onclick: "doAddProfile",
            owner: this,
        });
        var compHFlexBox = compItem.createComponent({
            kind: "HFlexBox",
            owner: this,
        });
        compHFlexBox.createComponent({
            kind: "Image",
            src: "../../images/list-icon-add-item.png",
            style: "padding: 4px; padding-right: 10px;",
            owner: this,
        });
        compHFlexBox.createComponent({
            content: $L("Add profile..."),
            owner: this,
        });
    },

    addProfileItemToList: function(profileItem) {
        if (profileItem.vpnProfileConnectState != "disconnected" && profileItem.vpnProfileConnectState != "disconnecting") {
            this.log("###### setting active profile");
            this.setActiveProfile(profileItem);
        }
        // if profile is being deleted, then do not show it in the list.
        if(undefined == this.profileNameBeingDeleted || this.profileNameBeingDeleted != profileItem.vpnProfileName) {
            this.$.profileList.createComponent({
                kind: "ProfileItem",
                data: profileItem,
                onConfirm: "handleSwipeDeleteProfileItem",
                onTapProfileItem: "handleTapProfileItem",
                onTapProfileDetails: "handleTapProfileDetails",
                owner: this,
            });
        }
    },

    destroyProfileList: function(){
        this.$.profileList.destroyControls();
    },

    renderProfileList: function() {
        this.$.profileList.render();
    },

    handleDisconnectResponseBeforeConnect: function(inSender, inResponse, inRequest) {
        if(undefined != inResponse && true == inResponse.returnValue) {
            this.log("connecting.. ");
            this.$.connect.call(inRequest.params.profileToConnect, {onResponse: "handleConnectResponse"});
        } else {
            this.showError($L("Disconnect Failure: ") + inResponse.errorText);
        }
    },

    connectDisconnectProfile: function(profile) {
        //this.$.profileList.setDisabled(true);
        //this.$.profileList.render();

        if ("connected" == profile.vpnProfileConnectState || "reconnecting" == profile.vpnProfileConnectState) {
            this.$.disconnect.call(profile, {onResponse: "handleDisconnectResponse"});
        } else if ("disconnected" === profile.vpnProfileConnectState) {
            this.log("profile's current state is disconnected.. so attempt to connect using this profile");
            var activeProfile = this.getActiveProfile();
            if(undefined != activeProfile) {
                this.log("there seems to be an active profile .. so first attempt to disconnect this one and then, reconnect", activeProfile);
                this.$.disconnect.call({activeProfile: activeProfile, profileToConnect: profile}, {onResponse: "handleDisconnectResponseBeforeConnect"});
            } else {
                this.log("connecting.. ");
                this.$.connect.call(profile, {onResponse: "handleConnectResponse"});
            }
        }
    },

    handleTapProfileItem: function(inSender, profileItem) {
        this.log("Called: ", profileItem);

        this.connectDisconnectProfile(profileItem);
    },

    handleTapProfileDetails: function(inSender, profileItem) {
        this.log("profileItem: ", profileItem);
        this.doShowConnectionDetails(profileItem);
    },

    /*
    vpnServiceStateHandler: function(notify) {
        this.log("Response Received: " + notifyResponse);
        if(undefined != notify && undefined != notify.service) {
            if('connected' === notify.service) {
            } else {
            }
        } else {
            this.error("Failed to read vpn service state");
        }
    },
    */

    handleConnectResponse: function(inSender, inResponse, inRequest) {
        if(undefined != inResponse) {
            this.log("Response Received: ", inResponse);
            if(false===inResponse.returnValue) {
                if(-5 !== inResponse.errorCode && -7 !== inResponse.errorCode) {
                    this.doConnectFailure();
                    this.error("Show Alert Dialog for the connection failure: " + inResponse.errorText);
                    this.showError(inResponse.errorText);
                } else {
                    // If User canceled prompt or need user authentication credentials,
                    // then do not throw the error dialog.
                    this.log("User canceled prompt. So, do not throw error dialog");
                }
            } else {
                this.log("Successfully Connected using profile - " + inRequest.params.vpnProfileName);
                this.doForceShowMainView();
            }
        } else {
            this.error("Invalid connect response received");
        }
        // TODO: enable profile list
    },

    handleDashboardLaunchProfileDetails: function(inSender, inResponse) {
        this.log("Response Received: " + inResponse);
        if(undefined != inResponse && inResponse.returnValue) {
            var params = {
                vpnAgentGuid: inResponse.vpnAgentGuid,
                vpnProfileName: inResponse.vpnProfileName,
            };
            this.log("Reconnecting: " + params);
            this.$.connect.call(params);
        } else {
            this.error("Failed to get profile details");
        }
    },

    reconnectVpnProfile: function(params) {
        if(undefined!=params && undefined != params.dashboardLaunch && undefined!=params.vpnProfileName) {
            this.log("profileName: " + params.vpnProfileName);
            this.$.getProfileDetails.call(params);
        }
    },

});
