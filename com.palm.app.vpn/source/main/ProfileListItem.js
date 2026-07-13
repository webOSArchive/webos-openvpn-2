enyo.kind({
    kind: "SwipeableItem",
    name: "ProfileItem",
    style: "padding-top: 0px; padding-bottom: 4px;",
    tapHighlight: true,

    events: {
        onTapProfileItem: "",
        onTapProfileDetails: "",
    },

    published: {
    },

    components: [
        { kind: "HFlexBox", align: "center", onclick: "handleTapOnProfileName", components: [
            { kind: "VFlexBox", flex: 1, components: [
                { name: "profileName" },
                { name: "profileConnectState" }
            ]},
            { name: "spinner", kind: "Spinner", style: "margin-right: 1px;" },
            { name: "checkmark", kind: "Image", src: "$palm/themes/Onyx/images/checkmark.png" },
            { name: "profileDetails", className: "info-icon", onclick: "handleTapOnProfileDetailsIcon", onmousedown: "applySelectedStyle", onmouseup: "removeSelectedStyle", onmouseout: "removeSelectedStyle" }
        ]}
    ],

    create: function() {
        this.inherited(arguments);

        // set confirm caption to 'Delete'
        this.setConfirmCaption($L("Delete"));

        // show profile name
        this.$.profileName.setClassName("enyo-text-ellipsis vpnprofile " + this.data.vpnProfileConnectState);
        this.$.profileName.setContent(this.data.vpnProfileName);

        // show/hide connect-status
        this.$.profileConnectState.setClassName("connect-status " + this.data.vpnProfileConnectState);
        this.$.profileConnectState.setContent(VpnUtil.getLocalizedConnectState(this.data.vpnProfileConnectState));

        // show/hide spinner
        if(this.data.vpnProfileConnectState === "connecting" ||
                this.data.vpnProfileConnectState == "reconnecting" ||
                this.data.vpnProfileConnectState == "disconnecting") {
            this.$.spinner.show();
            // Also, prevent swipe to delete.
            this.setSwipeable(false);
        } else {
            this.$.spinner.hide();
        }

        // show/hide checkmark
        this.$.checkmark.setClassName("checkmark " + this.data.vpnProfileConnectState);
            
    },

    handleTapOnProfileName: function() {
        this.log("Tapped on ProfileName, profileItem: ", this.data);
        this.doTapProfileItem(this.data);
    },

    handleTapOnProfileDetailsIcon: function() {
        this.log("Tapped on Profile Details Icon, profileItem: ", this.data);
        this.doTapProfileDetails(this.data);
        return true;
    },

    applySelectedStyle: function() {
        this.$.profileDetails.addClass("selected");
    },

    removeSelectedStyle: function() {
        this.$.profileDetails.removeClass("selected");
    },

});


