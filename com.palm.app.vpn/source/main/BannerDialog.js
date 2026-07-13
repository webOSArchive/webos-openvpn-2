enyo.kind({
    name: "BannerDialog",
    kind: "Popup",
    lazy: false,
    dismissWithEscape: false,
    dismissWithClick: false,
    modal: true,
    scrim: true,
    width:"500px",
    bannerExists: false,

    published: {
        data: "",
    },

    components: [
        { kind:"VFlexBox", components: [
            { name: "title", width:"100%", content: $L("Message"), style:"text-align: center; padding-bottom: 6px;" },
            { kind:"Scroller", className:"box", height:"200px", components: [
                { name: "message", className:"vpn-message", allowHtml: true },
            ]},
            { kind:"HFlexBox", components: [
                { name: "cancelButton", flex:1, kind: "Button", caption: $L("Cancel"), onclick: "handleDeclineBannerPrompt" },
                { name: "acceptButton", flex:1, kind: "Button", caption: $L("Continue"), className: "enyo-button-affirmative", onclick: "handleAcceptBannerPrompt" },
            ]}
        ]},
        { name: "uiPromptResponse", kind: "VpnService", onResponse: "handleUiPromptResponseResponse" },
    ],

    create: function() {
        this.inherited(arguments);
    },

    openAtCenter: function() {
        this.inherited(arguments);
        this.bannerExists = true;
    },

    closeIfExists: function() {
        if(this.bannerExists) {
            this.close();
            this.bannerExists = false;
        }
    },

    dataChanged: function() {
        var bannerMessage = this.data?this.data.banner:"";          
        bannerMessage = bannerMessage.replace(/\n/g, '<br>');       
        this.$.message.setContent(bannerMessage);
    },

    handleUiPromptResponseResponse: function(inSender, inResponse) {
        this.log("Received: ", inResponse);
    },

    handleDeclineBannerPrompt: function(inSender) {
        this.log("banner declined");
        var params = this.data;
        params.isOk = false;
        this.performCommonTask(params);
    },

    handleAcceptBannerPrompt: function(inSender) {
        this.log("banner accepted");
        var params = this.data;
        params.isOk = true;
        this.performCommonTask(params);
    },

    performCommonTask: function(params) {
        this.$.uiPromptResponse.call(params);
        this.closeIfExists();
        
        // close the main window if it was created just to show the banner message.
        if(params.mainWindowCreated) {
            window.close();
        }
    },

});
