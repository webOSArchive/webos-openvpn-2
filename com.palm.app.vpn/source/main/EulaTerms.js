enyo.kind({
    name: "EulaTermsView",
    kind: enyo.VFlexBox,
    className: "enyo-bg",

    events: {
        onAcceptDeclineTerms: "",
    },

    published: {
        eulaPath: "",
        agentGuid: "",
        label: "",
    },

    components: [
        { kind: "Scroller", name: "scroller", flex:1, components: [
            // {kind:"VFlexBox", className:"box-center", components: [
            // 
            // ]},

			{ name: "termsBox", className: "terms-box", flex: 1, onclick: "expandTerms", components: [
                { name: "termsText", className: "terms-text", components: [
                    { name: "termsTitleText", className: "terms-title" },
                    { kind: "AjaxContent", name: "termsBodyText", className: "terms-body-text" }
                ]},
                //{ name: "termsExpandIcon", className: "terms-expand-icon" }
			]}
        ]},
        { kind: "Toolbar", className:"enyo-toolbar-light", components: [
            { kind: "Button", className:"wide-button left", name: "declineTermsButton", caption: $L("Decline"), disabled: false, style: "enyo-button-negative", onclick: "handleDeclineTermsPressed" },
            { kind: "Button", className:"wide-button right enyo-button-affirmative", name: "acceptTermsButton", caption: $L("Accept"), disabled: false, style: "enyo-button-affirmative", onclick: "handleAcceptTermsPressed" },
        ]},
        { name: "acceptEula", kind: "VpnService", onResponse: "handleEulaAcceptResponse" },
        { name: "dialogError", kind: "ErrorDialog" }
    ],

    create: function() {
        this.inherited(arguments);
    },

    showError: function(errorMsg) {
        this.$.dialogError.openAtCenter($L("Error"), errorMsg, "");
    },

    agentGuidChanged: function() {
        this.$.scroller.setScrollTop(0);
       
    },

    eulaPathChanged: function() {
        this.$.termsBox.setClassName("terms-box");
        //this.$.termsExpandIcon.show();
        this.$.termsBodyText.setUrl(this.eulaPath);
    },

    labelChanged: function() {
        this.$.termsTitleText.setContent(this.label);
    },


    expandTerms: function() {
        //this.$.termsExpandIcon.hide();
        //this.$.termsBox.addClass("expanded");
    },

    handleEulaAcceptResponse: function(inSender, inResponse) {
        this.log("Response Received: ", inResponse);
        //this.$.acceptTermsButton.setActive(false);
        if(undefined != inResponse && inResponse.returnValue) {
            this.doAcceptDeclineTerms(true);
        } else {
            this.log("Error accepting the EULA");
            this.showError($L("Error accepting the EULA"));
        }
    },

    handleAcceptTermsPressed: function() {
        this.log("Eula Terms have been accepted, agentGuid: "+ this.agentGuid);
        //this.$.acceptTermsButton.setActive(true);
        this.$.acceptEula.call({vpnAgentGuid:this.agentGuid});
    },

    handleDeclineTermsPressed: function() {
        //this.$.declineTermsButton.setActive(true);
        this.log("Eula Terms have been rejected, agentGuid: "+ this.agentGuid);
        this.doAcceptDeclineTerms(false);
        //this.$.declineTermsButton.setActive(false);
    },
});
