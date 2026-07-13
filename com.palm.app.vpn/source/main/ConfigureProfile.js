enyo.kind({
    name: "ConfigureProfileView",
    kind: enyo.VFlexBox,
    className: "enyo-bg",
    
    events: {
        onConnected: "",
        onTapBackBtn: "",
    },

    published: {
    },

    pushedParams: undefined,

    components: [
        { kind: "Scroller", name: "scroller", flex: 1, components: [
			{kind:"VFlexBox", className:"box-center", components: [
				{ kind: "DynamicForm", name: "dynamicForm", onHandleDynamicFormButtonResponse: "handleDynamicFormButtonResponse", onEnterKeyPressed: "handleOnConnectBtnPressed" },
			]},
        ]},
        { kind: "Toolbar", className:"enyo-toolbar-light", pack: "center", components: [
            { kind: "ActivityButton", className:"wide-button left", name: "backButton", caption: $L("Back"), disabled: false, onclick: "tapBackBtn" },
            { kind: "ActivityButton", className:"wide-button right enyo-button-affirmative", name: "connectButton", caption: $L("Connect"), disabled: false, onclick: "handleOnConnectBtnPressed" },
        ]},
        { name: "dialogError", kind: "ErrorDialog" },
        { name: "addProfile", kind: "VpnService", },
        { name: "updateProfile", kind: "VpnService", },
        { name: "deleteProfile", kind: "VpnService", },
        { name: "connect", kind: "VpnService", },
        { name: "uiPromptResponse", kind: "VpnService" }
    ],

    create: function() {
        this.inherited(arguments);
    },

    showDialog: function(title, errorMsg) {
        this.$.dialogError.openAtCenter(title, errorMsg, "");
    },

    updateConfigureProfileDynamicForm: function(params) {
        this.pushedParams = params;

        this.$.scroller.setScrollTop(0);

        if(params.isNewProfile) {
            this.log("isNewProfile is set to TRUE");
        } else {
            this.log("isNewProfile is set to FALSE");
        }

        if(undefined != params.vpnMsgType && "noDefaultControls" === params.vpnMsgType) {
            // hide connect button
            this.$.connectButton.hide();
            // Make 'back' button big.
            this.$.backButton.removeClass("wide-button left");
            this.$.backButton.addClass("single-wide-button");
        } else {
            // show connect button
            this.$.connectButton.setActive(false);
            this.$.connectButton.setDisabled(false);
            this.$.connectButton.show();
            // Make 'back' button short.
            this.$.backButton.removeClass("single-wide-button");
            this.$.backButton.addClass("wide-button left");
        }

        var formInfo = {
            formFields: params.vpnFormFields,
            vpnServer: params.vpnHost,
            vpnAgentGuid: params.vpnAgentGuid,
            globallyIsDisabled: false,
            isNewProfile: params.isNewProfile,
            isProfileDetailsScene: false,
        }

        if (params.isNewProfile) {
            formInfo.profileName = params.vpnHost;
        }

        if(undefined != params.vpnProfileName) {
            formInfo.profileName = params.vpnProfileName;
        }

        // update the dynamic form.
        this.$.dynamicForm.buildForm(formInfo);
    },

    enableConnectButton: function() {
        this.$.connectButton.setActive(false);
        this.$.connectButton.setDisabled(false);
    },

    disableConnectButton: function() {
        this.$.connectButton.setActive(true);
        this.$.connectButton.setDisabled(true);
    },

    handleDynamicFormButtonResponse: function(inSender, inResponse) {
        this.log("Called");

        if (undefined != inResponse && false === inResponse.returnValue) {
            if (-6 === inResponse.errorCode || -7 === inResponse.errorCode) {
                // Complete Silently. It's a hack.
            } else {
                if (undefined == inResponse.errorText || "" === inResponse.errorText) {
                    inResponse.errorAlertText = $L("VPN Agent reported an error");
                } else {
                    inResponse.errorAlertText = params.errorText;
                }
            }
            if(inResponse.errorAlertText) {
                this.showDialog($L("Error"), inResponse.errorAlertText);
            }
        } else {
            this.showDialog($L(""), $L("Request Completed Successfully"));
        }
    },

    handleConnectResponse: function(inSender, inResponse) {
        this.log("Response Received: ", inResponse);
        if(inResponse && true === inResponse.returnValue) {
            this.doConnected();
        } else if(inResponse && false === inResponse.returnValue) {
            if(undefined != this.$.dynamicForm.getVpnProfileName() && 0 != this.$.dynamicForm.getVpnProfileName().length) {
                if(this.$.dynamicForm.checkIsNewProfile()) {
                    // If new profile, then remove it.
                    var paramsToSend = {
                        vpnProfileName: this.$.dynamicForm.getVpnProfileName(),
                        vpnAgentGuid: this.pushedParams.vpnAgentGuid,
                    };
                    this.log("Removing profile: ", paramsToSend);
                    this.$.deleteProfile.call(paramsToSend);
                } else {
                    // If existing profile, then revert to the previously saved profile
                    var paramsToSend = {
                        vpnProfileName: this.pushedParams.vpnProfileName,
                        vpnAgentGuid: this.pushedParams.vpnAgentGuid,
                        vpnProfile: {
                            vpnFormFields: this.pushedParams.vpnFormFields,
                            vpnHost: this.pushedParams.vpnHost,
                        },
                    };
                    this.log("Revert to the previously saved profile ");
                    this.$.updateProfile.call(paramsToSend);
                }
            }
            // If user canceled prompt or need user authentication credentials,
            // then, do not throw the error dialog.
            if(-5!==inResponse.errorCode && -7!==inResponse.errorCode) {
                this.error("Connection Failure: ", inResponse.errorText);
                this.showDialog($L("Connection Error"), $L("Connection Failure: ") + inResponse.errorText);
            }
        }
        //Enable Connect Button
        this.enableConnectButton(false);
    },

    handleProfileSave : function(inSender, inResponse) {
        this.log("Response Received: ", inResponse);
        if(inResponse.returnValue) {
            var connectParams = {
                vpnHost: this.$.dynamicForm.getVpnHost(),
                vpnAgentGuid: this.pushedParams.vpnAgentGuid,
                vpnProfileName: this.$.dynamicForm.getVpnProfileName()
            };
            this.log("Connecting using profile - ", connectParams.vpnProfileName);
            this.lunaConnectRequest = this.$.connect.call(connectParams, {onResponse: "handleConnectResponse"});
        } else {
            this.showDialog($L("Error"), $L("Failed to save profile: ") + inResponse.errorText);
            //Enable Connect Button
            this.enableConnectButton();
        }
    },

    handleOnConnectBtnPressed: function() {
        this.log("Called");

        //Disable Connect Button
        this.disableConnectButton();
        
        //Save Profiles
        var profileToSave = {
            vpnProfileName: this.$.dynamicForm.getVpnProfileName(),
            vpnAgentGuid: this.pushedParams.vpnAgentGuid,
            vpnProfile: {
                vpnFormFields: this.$.dynamicForm.getFormFieldsObjects(),
                vpnHost: this.$.dynamicForm.getVpnHost(),
            },
        };
        if(this.$.dynamicForm.checkIsNewProfile()) {
            this.log("Adding a new profile - ", profileToSave.vpnProfileName);
            this.$.addProfile.call(profileToSave, {onResponse: "handleProfileSave"});
        } else {
            this.log("Updating an existing profile - ", profileToSave.vpnProfileName);
            this.$.updateProfile.call(profileToSave, {onResponse: "handleProfileSave"});
        }
    },

    tapBackBtn: function() {
        this.doTapBackBtn();
        // Hack: Send uiPromptResponse when 'back' button is tapped.
        // So, the backend plugin can reset the connection and clean-up any profile,
        // that is created but not yet connected.
        var paramsToSend = {
            buttonId: "backButton",
            vpnFormFields: this.$.dynamicForm.getFormFieldsObjects(),
            vpnAgentGuid: this.pushedParams.vpnAgentGuid,
        };
        this.log("Sending: ", paramsToSend.buttonId);
        this.$.uiPromptResponse.call(paramsToSend, undefined);
        this.log("sent 'backButton' response to the backend module");
    },
});
