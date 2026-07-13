enyo.kind({
    name: "CredsPrompt",
    kind: "Popup",
    lazy: false,
    dismissWithEscape: false,
    dismissWithClick: false,
    modal: true,
    scrim: true,
    width: "300px",
    credsPromptPopupExists: false,
    
    events: {
        onTapBackBtn: "",
    },

    published: {
    },

    pushedParams: undefined,

    components: [
        { kind: "VFlexBox", components: [
            { name: "title", width: "100%", content: $L(""), style: "text-align: center;" },
            { kind: "DynamicForm", style: "margin-left: -8px; margin-right: -8px;", name: "dynamicForm", onHandleDynamicFormButtonResponse: "handleDynamicFormButtonResponse", onEnterKeyPressed: "handleOnConnectBtnPressed" },
            { kind: "ActivityButton", style: "margin-right: 0px; margin-left: 0px; margin-top: 8px;", name: "backButton", caption: $L("Cancel"), disabled: false, onclick: "tapBackBtn" },
        ]},
        { name: "uiPromptResponse", kind: "VpnService" }
    ],

    create: function() {
        this.inherited(arguments);
    },

    openAtCenter: function() {
        this.inherited(arguments);
        this.credsPromptPopupExists = true;
    },

    closeIfExists: function() {
        if(this.credsPromptPopupExists) {
            this.close();
            this.credsPromptPopupExists = false;
        }
    },

    showDialog: function(title, errorMsg) {
        //this.$.dialogError.openAtCenter(title, errorMsg, "");
    },

    updateCredsPromptDynamicForm: function(params) {
        this.pushedParams = params;

        var formInfo = {
            formFields: params.vpnFormFields,
            vpnAgentGuid: params.vpnAgentGuid,
            globallyIsDisabled: false,
            isProfileDetailsScene: false,
        }

        if(params.popupPrompt != undefined && params.popupPrompt.label != undefined) {
            this.$.title.setContent(params.popupPrompt.label);
        }

        // update the dynamic form.
        this.$.dynamicForm.buildForm(formInfo);
    },

    handleDynamicFormButtonResponse: function(inSender, inResponse) {
        this.log("Called");

        // close popup
        this.close();

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

    tapBackBtn: function() {
        // close popup
        this.close();
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
