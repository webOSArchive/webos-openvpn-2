enyo.kind({
    name: "ConnectionDetailsView",
    kind: enyo.VFlexBox,
    className: "enyo-bg",

    events: {
        onDone: "",
        onRemoveProfile: "",
        onConnectDisconnectProfile: "",
    },

    published: {
        profileName: "",
        agentGuid: "",
        profileConnectState: "",
        profileDetails: undefined,
    },

    components: [
        { kind: "Scroller", name: "scroller", flex: 1, components: [
            {kind:"VFlexBox", className:"box-center", components: [
                { kind: "RowGroup", caption: $L("PROFILE NAME"), style: "margin: 8px 8px;", components: [
                    { tapHighlight: false, components: [
                        { kind: "Input", name: "vpnProfileName", hint: $L("Enter profile name"), spellcheck: false, autocorrect: false, autoCapitalize: "lowercase", oninput: "changeVpnProfileName", onkeypress: "checkEnterKeyPressed" }
                    ]}
                ]},
                { kind: "RowGroup", caption: $L("CONNECTION DETAILS"), name: "conDetailsRowGroup", style: "margin: 8px 8px;" },
                { kind: "DividerDrawer", caption: $L("PROFILE DETAILS"), name: "profileDetailsDrawer", open: false, components: [
                    { kind: "DynamicForm", name: "profileDetailsDynamicForm", onEnterKeyPressed: "tapConnectDisconnectButton" },
                    { kind: "HFlexBox", name: "fetchProfileDetailsStatus", align: "center", style: "padding: 8px 8px;", components: [
                        { content: $L("Fetching Profile Details..."), style: "padding-right: 16px", className: "enyo-paragraph" },
                        { kind: "Spinner", showing: true },
                    ]},
                ]},
				{ kind: "ActivityButton", className: "vpn-button", name: "connectDisconnectButton", active: false, caption: $L("Connect"), disabled: false, onclick: "tapConnectDisconnectButton" },
				//{style:"margin:6px 0;"},
				//{ kind: "ActivityButton", className: "vpn-button", name: "configureProxyButton", active: false, caption: $L("Configure Proxy"), disabled: false, onclick: "tapConfigureProxyButton" },
				{style:"margin:6px 0;"},
                { kind: "ActivityButton", className: "enyo-button-negative vpn-button", name: "deleteButton", active: false, caption: $L("Delete Profile"), disabled: false, onclick: "confirmProfileRemoval" },
            ]},
        ]},
        { kind: "Toolbar", className:"enyo-toolbar-light", components: [
            { kind: "Button", name: "doneButton", className:"enyo-button-affirmative single-wide-button", caption: $L("Done"), disabled: false, onclick: "confirmProfileSave" },
        ]},
        { kind: "ModalDialog", name: "deleteConfirmDialog", caption: $L("Delete Profile"), modal: true, scrim: true, components: [
            { className: "popup-message", content: $L("Are you sure you want to delete this profile?"), className: "enyo-paragraph" },
            { kind:"HFlexBox", components: [
                { kind: "Button", caption: $L("Cancel"), flex: 0.8, onclick: "keepProfile"},
                { kind: "Button", caption: $L("Delete"), flex: 1, className: "enyo-button-negative", onclick: "deleteProfile"},
            ]}
        ]},
        { kind: "ModalDialog", name: "saveConfirmDialog", caption: $L("Save Profile"), modal: true, scrim: true, className: "vpn-popup-dialog", components: [
            { className: "popup-message", content: $L("Are you sure you want to save changes made to this profile?"), className: "enyo-paragraph" },
            { kind:"HFlexBox", components: [
                { kind: "Button", caption: $L("Discard"), flex: 0.8, onclick: "discardProfileChanges"},
                { kind: "Button", caption: $L("Save"), flex: 1, className: "enyo-button-affirmative", onclick: "saveProfileChanges"},
            ]}
        ]},
        { kind: "ModalDialog", name: "connectConfirmDialog", caption: $L("Connect Profile"), modal: true, scrim: true, className: "vpn-popup-dialog", components: [
            { className: "popup-message", content: $L("Are you sure you want to save changes made to this profile and connect using the updated profile?"), className: "enyo-paragraph" },
            { kind:"HFlexBox", components: [
                { kind: "Button", caption: $L("Cancel"), flex: 0.8, onclick: "tapCancel"},
                { kind: "Button", caption: $L("Continue"), flex: 1, className: "enyo-button-affirmative", onclick: "tapSaveAndConnect"},
            ]}
        ]},
        { name: "connect", kind: "VpnService" },
        { name: "disconnect", kind: "VpnService" },
        { name: "addProfile", kind: "VpnService" },
        { name: "updateProfile", kind: "VpnService" },
        { name: "deleteProfile", kind: "VpnService" },
        { name: "getProfileDetails", kind: "VpnService" },
        { name: "getConnectionDetails", kind: "VpnService" },
        { name: "dialogError", kind: "ErrorDialog" }
    ],

    create: function() {
        this.inherited(arguments);
    },

    showDialogError: function(title, errorMsg) {
        this.$.dialogError.openAtCenter(title, errorMsg, "");
    },

    updateProfileDetails: function(params) {
        var formInfo = {
            formFields: params.vpnProfile.vpnFormFields,
            vpnServer: params.vpnProfile.vpnHost,
            vpnAgentGuid: params.vpnAgentGuid,
            globallyIsDisabled: (this.getProfileConnectState() != "disconnected")?true:false,
            isNewProfile: false,
            isProfileDetailsScene: true,
        }
        this.$.profileDetailsDynamicForm.buildForm(formInfo);
    },

    profileDetailsChanged: function() {
        if(this.getProfileDetails() != undefined) {
            this.log("profile details passed: " + this.getProfileDetails().vpnProfileName);
            this.updateProfileDetails(this.getProfileDetails());
            this.$.fetchProfileDetailsStatus.hide();
            this.$.profileDetailsDynamicForm.show();
        } else {
            this.$.fetchProfileDetailsStatus.show();
            this.$.profileDetailsDynamicForm.hide();
        }
    },

    gotProfileDetails: function(inSender, inResponse, inRequest) {
        this.setProfileDetails(inResponse);
    },

    changeVpnProfileName: function() {
        if(undefined != this.$.vpnProfileName && !this.$.vpnProfileName.isEmpty()) {
            this.$.doneButton.setDisabled(false);
            this.$.connectDisconnectButton.setDisabled(false);
        } else {
            this.$.doneButton.setDisabled(true);
            this.$.connectDisconnectButton.setDisabled(true);
        }
    },

    profileNameChanged: function() {
        var profileName = this.getProfileName();
        this.$.vpnProfileName.setValue(profileName);
        this.changeVpnProfileName();
        this.$.getProfileDetails.call(
            { vpnProfileName: profileName },
            { onSuccess: "gotProfileDetails" }
        );
    },

    // Hack: To handle Enter Key Press.
    checkEnterKeyPressed: function(inSender, inEvent) {
        if (undefined != inEvent) {
            // when EnterKey Pressed..
            if (inEvent.keyCode === 13 && inSender.getValue().length > 0) {
                this.tapConnectDisconnectButton();
            }
        }
    },

    getCtrlPropsByConnectState: function(state) {
        var conDetailsShow = true;
        var conDetailsOpen = false;
        var profileFormOpen = false;
        var profileFormFieldsDisable = false;
        var conDisconBtnCaption = $L("Connect");
        var conDisconBtnDisable = false;
        var conDisconBtnActive = false;
        var deleteBtnDisable = false;


        if (state == "connected") {
            conDetailsOpen = true;
            profileFormFieldsDisable = true;
            conDisconBtnCaption = $L("Disconnect");
            conDisconBtnDisable = false;
            conDisconBtnActive = false;
            deleteBtnDisable = false;
        } else if (state == "disconnected") {
            conDetailsShow = false;
            profileFormOpen = true;
            profileFormFieldsDisable = false;
            conDisconBtnCaption = $L("Connect");
            conDisconBtnDisable = false;
            conDisconBtnActive = false;
            deleteBtnDisable = false;
        } else if (state == "connecting") {
            profileFormFieldsDisable = true;
            conDisconBtnCaption = $L("Connecting");
            conDisconBtnDisable = true;
            conDisconBtnActive = true;
            deleteBtnDisable = true;
        } else if (state == "reconnecting") {
            profileFormFieldsDisable = true;
            conDisconBtnCaption = $L("Disconnect");
            conDisconBtnDisable = false;
            conDisconBtnActive = false;
            deleteBtnDisable = false;
        } else if (state == "disconnecting") {
            profileFormFieldsDisable = true;
            conDisconBtnCaption = $L("Disconnecting");
            conDisconBtnDisable = true;
            conDisconBtnActive = true;
            deleteBtnDisable = true;
        }
        
        return { 
            conDetailsShow: conDetailsShow,
            conDetailsOpen: conDetailsOpen,
            profileFormOpen: profileFormOpen,
            profileFormFieldsDisable: profileFormFieldsDisable,
            conDisconBtnCaption: conDisconBtnCaption,
            conDisconBtnDisable: conDisconBtnDisable,
            conDisconBtnActive: conDisconBtnActive,
            deleteBtnDisable: deleteBtnDisable,
        };
    },

    addStatsContent: function(parentComp, str, value) {
        var tempHFlexLayout = parentComp.createComponent({
            layoutKind: "HFlexLayout",
        });

        tempHFlexLayout.createComponent({
            content: str,
            flex: 1,
            className: "enyo-label",
        });

        tempHFlexLayout.createComponent({
            content: (value == undefined)?$L("Not Available"):value,
            className: "enyo-text-body",
        });
    },

    handleGetConnectionDetailsResponse: function(inSender, inResponse, inRequest) {
        this.log("Response Received: ", inResponse);

        if(!inResponse.returnValue) {
            //this.showDialogError("Error", "Failed to get connection details: " + inResponse.errorText);
        } else {
            var state = this.getProfileConnectState();

            this.$.conDetailsRowGroup.destroyControls();
            this.addStatsContent(this.$.conDetailsRowGroup, $L("STATE"), VpnUtil.getLocalizedConnectState(state));
            if("connected" === state) {
                this.addStatsContent(this.$.conDetailsRowGroup, $L("SERVER"), inResponse.serverHostname);
                this.addStatsContent(this.$.conDetailsRowGroup, $L("SERVER ADDRESS"), inResponse.serverIpAddress);
                this.addStatsContent(this.$.conDetailsRowGroup, $L("CLIENT ADDRESS"), inResponse.clientIpAddress);
                this.addStatsContent(this.$.conDetailsRowGroup, $L("TUNNEL TYPE"), inResponse.tunnelType);
                this.addStatsContent(this.$.conDetailsRowGroup, $L("BYTES RECEIVED"), inResponse.bytesRx);
                this.addStatsContent(this.$.conDetailsRowGroup, $L("BYTES TRANSMITTED"), inResponse.bytesTx);
            }
            this.$.conDetailsRowGroup.render();
        }
    },

    refreshConnectionDetails: function() {
        if(this.$.getConnectionDetails != undefined && this.$.connectionDetailsDrawer.getOpen() == true) {
            this.$.getConnectionDetails.call(this.getProfileName(), {onResponse: "handleGetConnectionDetailsResponse"});
        }
    },

    profileConnectStateChanged: function() {
        var state = this.getProfileConnectState();

        this.log("****** connect state: " + state);

        var ctrlProps = this.getCtrlPropsByConnectState(state);

        this.$.scroller.setScrollTop(0);
        this.$.vpnProfileName.setDisabled(ctrlProps.profileFormFieldsDisable);
        /*
        //this.$.connectionDetailsDrawer.setOpen(ctrlProps.conDetailsOpen);
        if(ctrlProps.conDetailsShow) {
            this.$.connectionDetailsDrawer.show();
        } else {
            this.$.connectionDetailsDrawer.hide();
        }
        this.$.connectionDetailsDrawer.setOpen(true);
        this.refreshConnectionDetails();
        this.$.profileDetailsDrawer.setOpen(ctrlProps.profileFormOpen);
        //this.$.profileDetailsDrawer.setOpen(false);
        */
        this.$.getConnectionDetails.call(this.getProfileName(), {onResponse: "handleGetConnectionDetailsResponse"});
        if(this.getProfileDetails() != undefined) {
            this.$.profileDetailsDynamicForm.disableFormFields(ctrlProps.profileFormFieldsDisable);
        }
        this.$.connectDisconnectButton.setCaption(ctrlProps.conDisconBtnCaption);
        this.$.connectDisconnectButton.setDisabled(ctrlProps.conDisconBtnDisable);
        this.$.connectDisconnectButton.setActive(ctrlProps.conDisconBtnActive);
        this.$.connectDisconnectButton.render();
        this.$.deleteButton.setDisabled(ctrlProps.deleteBtnDisable);
    },

    keepProfile: function() {
        // Close the dialog
        this.$.deleteConfirmDialog.close();
    },

    deleteProfile: function() {
        // Close the dialog
        this.$.deleteConfirmDialog.close();

        var profileToDelete = {
            vpnProfileName: this.getProfileName(),
            vpnAgentGuid: this.getAgentGuid(),
            vpnProfileConnectState: this.getProfileConnectState(),
        };
        this.log("profile to be deleted: ", profileToDelete);
        this.doRemoveProfile(profileToDelete);
    },

    confirmProfileRemoval: function() {
        // Open the "delete confirm" dialog
        this.$.deleteConfirmDialog.openAtCenter();
    },

    connectDisconnectProfile: function() {
        var currentState = this.getProfileConnectState();
    
        switch (currentState) {
            case "connected":
                this.setProfileConnectState("disconnecting");
                break;
            case "disconnected":
                this.setProfileConnectState("connecting");
                break;
        }

        var profile = {
            vpnProfileName: this.getProfileName(),
            vpnAgentGuid: this.getAgentGuid(),
            vpnProfileConnectState: currentState,
        };
        this.doConnectDisconnectProfile(profile);
    },

    handleProfileSaveAndConnectSuccess: function(inSender, inResponse, inRequest) {
        this.setProfileName(this.$.vpnProfileName.getValue());
        this.connectDisconnectProfile();
    },

    handleProfileSaveAndConnectFailure: function(inSender, inResponse, inRequest) {
        this.error("Failed to update profile: " + inRequest.params.vpnProfileName);
        this.showDialogError($L("Connection Error"), $L("Failed To Update Profile"));
    },

    handleDeleteProfileSuccessWhileSaveAndConnect: function(inSender, inResponse, inRequest) {
        this.log("Profile Deleted. Add New Profile Info And Connect");
        // remove webproxy config for this profile.
        //NetworkProxyConfigLib.removeProxyConfig({networkTechnology:"vpn", proxyScope: inRequest.params.vpnProfileName}, {owner: this});
        this.$.addProfile.call(inRequest.params.newProfile,
            {
                onSuccess: "handleProfileSaveAndConnectSuccess",
                onFailure: "handleProfileSaveAndConnectFailure"
            }
        );
    },

    saveAndConnectProfile: function() {
        var paramsToSend = {
            vpnProfileName: this.getProfileName(),
            vpnAgentGuid: this.getAgentGuid(),
            newProfile: {
                vpnProfileName: this.$.vpnProfileName.getValue(),
                vpnAgentGuid: this.getAgentGuid(),
                vpnProfile: {
                    vpnFormFields: this.$.profileDetailsDynamicForm.getFormFieldsObjects(),
                    vpnHost: this.$.profileDetailsDynamicForm.getVpnHost(),
                },
            },
        };
        if(this.getProfileName() === this.$.vpnProfileName.getValue()) {
            this.$.updateProfile.call(paramsToSend.newProfile, 
                {
                    onSuccess: "handleProfileSaveAndConnectSuccess",
                    onFailure: "handleProfileSaveAndConnectFailure"
                }
            );
        } else {
            this.$.deleteProfile.call(paramsToSend,
                {
                    onSuccess: "handleDeleteProfileSuccessWhileSaveAndConnect",
                    onFailure: "handleProfileSaveAndConnectFailure"
                }
            );
        }
    },

    handleProfileDetailsSuccessResponseBeforeSaveAndConnect: function(inSender, inResponse, inRequest) {
        this.error("Error: Failed to save profile. Profile Already Exists with Name: " + inRequest.params.vpnProfileName);
        this.showDialogError($L("Error"), $L("Failed to save profile: Profile With That Name Already Exists"));
    },

    handleProfileDetailsFailureResponseBeforeSaveAndConnect: function(inSender, inResponse, inRequest) {
        this.log("No Profile Exists With Name: " + inRequest.params.vpnProfileName + ". Save and Connect");
        this.saveAndConnectProfile();
    },

    tapSaveAndConnect: function() {
        // Close the dialog
        this.$.connectConfirmDialog.close();
        if(this.getProfileName() === this.$.vpnProfileName.getValue()) {
            this.log("No Change in Profile Name. Save and Connect");
            this.saveAndConnectProfile();
        } else {
            this.log("Profile Name has changed. Is there any existing profile with the same name?");
            // Check if a profile already exists with the same name.
            this.$.getProfileDetails.call({vpnProfileName: this.$.vpnProfileName.getValue()},
                {
                    onSuccess: "handleProfileDetailsSuccessResponseBeforeSaveAndConnect",
                    onFailure: "handleProfileDetailsFailureResponseBeforeSaveAndConnect",
                }
            );
        }
    },

    tapCancel: function() {
        this.$.connectConfirmDialog.close();
    },

    hasProfileInfoChanged: function() {
        return (this.getProfileName() != this.$.vpnProfileName.getValue() ||
                this.$.profileDetailsDynamicForm.checkFormFieldsValuesChanged() === true);
    },

    tapConnectDisconnectButton: function() {
        switch(this.getProfileConnectState()) {
            case "connected":
                // connected profile. so, just disconnect it.
                this.connectDisconnectProfile();
                // Hack: To show the state correctly in 'connection details' box.
                this.setProfileConnectState("connecting");
                break;
            case "disconnected":
                if(this.hasProfileInfoChanged()) {
                    this.log("Profile info has changed. Throw a connect confirmation dialog to the user.");
                    // Open the "save confirm" dialog
                    this.$.connectConfirmDialog.openAtCenter();
                } else {
                    this.log("No changes made to the profile. So, just connect it");
                    this.connectDisconnectProfile();
                }
                break;
            default:
                this.error("Error. It should never hit this case.");
                break;
        }
    },

    handleProfileSave: function(inSender, inResponse, inRequest) {
        this.log("Response Received: ", inResponse);
        this.doDone();
    },

    handleDeleteProfileWhileUpdating: function(inSender, inResponse, inRequest) {
        this.log("Response Received: ", inResponse);
        if(undefined != inResponse && inResponse.returnValue) {
            this.$.addProfile.call(inRequest.params.newProfile, {onResponse: "handleProfileSave"});
            // remove webproxy config for this profile.
            //NetworkProxyConfigLib.removeProxyConfig({networkTechnology:"vpn", proxyScope: inRequest.params.vpnProfileName}, {owner: this});
        } else {
            this.error("Failed to update profile: " + inRequest.params.vpnProfileName);
            this.doDone();
        }
    },

    saveProfile: function() {
        var paramsToSend = {
            vpnProfileName: this.getProfileName(),
            vpnAgentGuid: this.getAgentGuid(),
            newProfile: {
                vpnProfileName: this.$.vpnProfileName.getValue(),
                vpnAgentGuid: this.getAgentGuid(),
                vpnProfile: {
                    vpnFormFields: this.$.profileDetailsDynamicForm.getFormFieldsObjects(),
                    vpnHost: this.$.profileDetailsDynamicForm.getVpnHost(),
                },
            },
        };
        if(this.getProfileName() === this.$.vpnProfileName.getValue()) {
            this.$.updateProfile.call(paramsToSend.newProfile, {onResponse: "handleProfileSave"});
        } else {
            this.$.deleteProfile.call(paramsToSend, {onResponse: "handleDeleteProfileWhileUpdating"});
        }
    },

    handleProfileDetailsResponse: function(inSender, inResponse, inRequest) {
        if(inResponse.returnValue) {
            this.error("Error: Failed to save profile. Profile Already Exists with Name: " + inRequest.params.vpnProfileName);
            this.showDialogError($L("Error"), $L("Failed to save profile: Profile With That Name Already Exists"));
        } else {
            this.log("No Profile exists with Name: " + inRequest.params.vpnProfileName + ". So, save it");
            this.saveProfile();
        }
    },

    saveProfileChanges: function() {
        // Close the dialog
        this.$.saveConfirmDialog.close();
        if(this.getProfileName() === this.$.vpnProfileName.getValue()) {
            this.log("No change in profile name.. so, just save profile");
            this.saveProfile();
        } else {
            this.log("Profile Name has changed. Is there any existing profile with the same name?");
            // Check if a profile already exists with the same name.
            this.$.getProfileDetails.call(
                {vpnProfileName: this.$.vpnProfileName.getValue()},
                {onResponse: "handleProfileDetailsResponse"}
            );
        }
    },

    discardProfileChanges: function() {
        // Close the dialog
        this.$.saveConfirmDialog.close();
        this.doDone();
    },

    confirmProfileSave: function() {
        var confirmationNeeded = false;
        if("disconnected" === this.getProfileConnectState() && undefined != this.getProfileName() && 0 < this.$.vpnProfileName.getValue().length) {
            // throw the confirmation dialog only if there are any changes to the profile.
            if(this.hasProfileInfoChanged()) {
            	this.log("Profile Info has changed. Throw a save confirmation dialog to the user.");
                confirmationNeeded = true;
                // Open the "save confirm" dialog
                this.$.saveConfirmDialog.openAtCenter();
            }
        }
        if (!confirmationNeeded) {
            this.log("No need for update. Just go back to main view");
            this.doDone();
        }
    },

    tapConfigureProxyButton: function() {
        //NetworkProxyConfigLib.openProxyConfigUi({networkTechnology:"vpn", proxyScope: this.getProfileName()},{owner:this});
    },

});
