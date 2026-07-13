enyo.kind({
    name: "ErrorDialog",
    kind: "Popup",
    lazy: false,
    scrim: true,
    width:"300px",
    published: {
        title: "",
        message: "",
        acceptButtonCaption: "OK",
    },

    components: [
        { kind:"VFlexBox", components: [
            { name: "title", width:"100%", style:"text-align: center; padding-bottom: 6px;" },
            { name: "message", className: "enyo-paragraph", allowHtml: true },
            { name: "acceptButton", kind: "Button", className: "enyo-button-affirmative", onclick: "acceptClick" }  
        ]}
    ],

    create: function() {
        this.inherited(arguments);
        this.titleChanged();
        this.messageChanged();
        this.acceptButtonCaptionChanged();
    },

    openAtCenter: function(inTitle, inMessage, inAcceptButtonCaption) {
        if (inTitle) {
            this.setTitle(inTitle);
        }
        if (inMessage) {
            this.setMessage(inMessage);
        }
        if (inAcceptButtonCaption) {
            this.setAcceptButtonCaption(inAcceptButtonCaption);
        }
        this.inherited(arguments);
    },

    titleChanged: function() {
        this.$.title.setContent(this.title);
        this.$.title.setShowing(this.title);
    },

    messageChanged: function() {
        this.$.message.setContent(this.message.replace(/\n/g, '<br>'));
    },

    acceptButtonCaptionChanged: function() {
        this.$.acceptButton.setCaption(this.acceptButtonCaption);
    },

    acceptClick: function() {
        this.close();
    }
});
