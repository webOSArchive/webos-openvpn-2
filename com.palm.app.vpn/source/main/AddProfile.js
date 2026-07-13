enyo.kind({
    name: "AddProfileView",
    kind: enyo.VFlexBox,
    className: "enyo-bg",

    events: {
        onShowEulaTerms: "",
        onConnected: "",
        onCancel: "",
    },

    published: {
        wasEulaTermsAccepted: false,
        vpnServerName: undefined,
    },

    chosenAgentGuid: undefined,

    components: [
        { kind: "Scroller", flex: 1, components: [
			{kind:"VFlexBox", className:"box-center", components: [
				{ kind: "RowGroup", caption: $L("CONNECTION TYPE"), style: "margin: 8px 8px;", components: [
                    { name: "connectionTypeList", kind: "ConnectionTypeSelector", onChange: "changeConnectionType" }
	            ]},
	            { kind: "RowGroup", caption: $L("VPN SERVER"), style: "margin: 8px 8px;", components: [
	                { tapHighlight: false, components: [
	                    { kind: "Input", name: "vpnHost", hint: $L("Enter hostname or IP address"), spellcheck: false, autocorrect: false, autoCapitalize: "lowercase", inputType: "url", oninput: "changeVpnHost", onkeypress: "checkEnterKeyPressed" }
	                ]}
	            ]},
			]},
        ]},
        { kind: "Toolbar", className:"enyo-toolbar-light", pack: "center", components: [
            { kind: "ActivityButton", className:"wide-button left", name: "cancelButton", active: false, caption: $L("Cancel"), disabled: false, onclick: "tapCancelButton" },
            { kind: "ActivityButton", className:"wide-button right enyo-button-affirmative", name: "nextButton", active: false, caption: $L("Next"), disabled: true, onclick: "tapNextButton" },
        ]},
        { name: "getAgents", kind: "VpnService", onResponse: "handleGetAgentsResponse" },
        { name: "getConnectionDetails", kind: "VpnService", onResponse: "handleGetConnectionDetailsResponse" },
        { name: "connect", kind: "VpnService", onResponse: "handleConnectResponse" },
        { name: "disconnect", kind: "VpnService", onResponse: "handleDisconnectResponse" },
        { name: "dialogError", kind: "ErrorDialog" }
    ],

    create: function() {
        this.log("Called");
        this.inherited(arguments);
        this.wasEulaTermsAcceptedChanged();
        this.vpnServerNameChanged();
    },

    wasEulaTermsAcceptedChanged: function() {
        this.log("Called");
        if(this.wasEulaTermsAccepted) {
            this.disableAll();
            this.$.getConnectionDetails.call({});
        } else {
            this.enableAll();
        }
    },

    vpnServerNameChanged: function() {
        this.log("Called");
        this.getAgentsList();
        this.$.vpnHost.setValue(this.vpnServerName);
        this.vpnHostChanged();
    },

    fillConnectionTypeList: function(vpnAgents) {

        var doDisable = false;
        var label = "";

        if (vpnAgents.length > 0) {
            var connectionTypeListArray = [];
            var itemFound = false;

            for(var index = 0; index < vpnAgents.length; index++) {
                var techString = "";
                if(undefined != vpnAgents[index].vpnAgentTechnology) {
                    var techArray = vpnAgents[index].vpnAgentTechnology;
                    for(var techIndex = 0; techIndex < techArray.length; techIndex++) {
                        if(techString.length) {
                            techString +=  " " + techArray[techIndex];
                        } else {
                            techString += techArray[techIndex];
                        }
                    }
                }
                connectionTypeListArray.push({
                    value: vpnAgents[index].vpnAgentGuid,
                    caption: vpnAgents[index].vpnAgentLabel,
                    icon: vpnAgents[index].vpnAgentIcon,
                    agentGuid: vpnAgents[index].vpnAgentGuid,
                    eulaPath: vpnAgents[index].vpnAgentEula,
                    techTypes: techString,
                });
                
                if(this.chosenAgentGuid != undefined && vpnAgents[index].vpnAgentGuid != undefined && this.chosenAgentGuid === vpnAgents[index].vpnAgentGuid) {
                    this.log("Previously chosen guid - " + this.chosenAgentGuid);
                    this.$.connectionTypeList.setValue(this.chosenAgentGuid);
                    itemFound = true;
                }
            }

            this.$.connectionTypeList.setItems(connectionTypeListArray);

            if(false == itemFound) {
                this.log("Previously selected item not found.. so, choosing the first one..");
                this.$.connectionTypeList.setValue(vpnAgents[0].vpnAgentGuid);
                this.chosenAgentGuid = vpnAgents[0].vpnAgentGuid;
            }
            doDisable = false;
        } else {
            this.chosenAgentGuid = undefined;
            doDisable = true;
            label = $L("Failed Loading Agents...");
        }

        this.$.connectionTypeList.setHideArrow(doDisable);
        this.$.connectionTypeList.setLabel(label);
        this.$.connectionTypeList.setDisabled(doDisable);
        this.$.connectionTypeList.render();
    },

    handleGetAgentsResponse: function(inSender, inResponse) {
        if(inResponse) {
            this.log("Response Received: ", inResponse);
            if(inResponse.returnValue && 0!=inResponse.vpnAgents.length) {
                this.fillConnectionTypeList(inResponse.vpnAgents);
            } else {
                this.fillConnectionTypeList([]);
                this.disableAll();
                this.$.nextButton.setActive(false);
            }
        } else {
            this.error("Invalid GetAgents response received");
            this.fillConnectionTypeList([]);
            this.disableAll();
            this.$.nextButton.setActive(false);
        }
    },

    getAgentsList: function() {
        this.log("Called");
        this.$.getAgents.call();
    },

    changeConnectionType: function(inSender, inValue, inOldValue) {
        this.chosenAgentGuid = inValue;
        if(this.chosenAgentGuid != undefined && this.$.connectionTypeList.item != undefined) {
            this.log("connectionType: chosen caption: ", this.$.connectionTypeList.item.getCaption(), ", agentGuid: ", this.$.connectionTypeList.getValue());
        } else {
        }
        this.$.connectionTypeList.render();
    },

    vpnHostChanged: function() {
        if(undefined != this.$.vpnHost && !this.$.vpnHost.isEmpty()) {
            this.$.nextButton.setDisabled(false);
        } else {
            this.$.nextButton.setDisabled(true);
        }
    },

    changeVpnHost: function(inSender, inEvent) {
        this.vpnHostChanged();
    },

    // Hack: To handle Enter Key Press. This should be handled in changeVpnHost() itself, once enyo framework fixes it in 'oninput' event.
    checkEnterKeyPressed: function(inSender, inEvent) {
        if (undefined != inEvent) {
            // when EnterKey Pressed..
            if (inEvent.keyCode === 13 && inSender.getValue().length > 0) {
                this.tapNextButton();
            }
        }
    },

    disableAll: function() {
        this.$.connectionTypeList.setDisabled(true);
        this.$.vpnHost.setDisabled(true);
        this.$.vpnHost.render();
        this.$.nextButton.setActive(true);
        this.$.nextButton.setDisabled(true);
    },

    enableAll: function() {
        this.$.connectionTypeList.setDisabled(false);
        this.$.vpnHost.setDisabled(false);
        this.$.vpnHost.render();
        this.$.nextButton.setActive(false);
        this.$.nextButton.setDisabled(false);
    },

    showError: function(errorMsg) {
        this.$.dialogError.openAtCenter($L("Connection Error"), errorMsg, "");
    },

    handleConnectResponse: function(inSender, inResponse) {
        this.enableAll();
        if(undefined != inResponse) {
            this.log("Response: ", inResponse);
            if(false===inResponse.returnValue) {
                if(-5 !== inResponse.errorCode && -7 !== inResponse.errorCode) {
                    this.error("Couldn't connect to service: " + inResponse.errorText);
                    this.showError($L("Couldn't connect to service: ") + inResponse.errorText);
                } else {
                    // If User canceled prompt or need user authentication credentials,
                    // then do not throw the error dialog.
                    this.log("User canceled prompt. So, do not throw error dialog");
                }
            } else {
                this.doConnected();
            }
        } else {
            this.error("Invalid connect response received");
        }
    },

    connectIt: function() {
        var connectParams = {
            vpnHost: this.$.vpnHost.getValue(),
            vpnAgentGuid: this.$.connectionTypeList.getValue(),
        };

        this.log("Connecting: ", connectParams);
        this.$.connect.call(connectParams);
    },

    handleDisconnectResponse: function(inSender, inResponse) {
        if(undefined != inResponse) {
            this.log("Response: ", inResponse);
            if(inResponse.returnValue) {
                this.connectIt();
            } else {
                this.enableAll();
                this.error("Couldn't disconnect connected profile: " + inResponse.errorText);
                this.showError($L("Couldn't disconnect connected profile: ") + inResponse.errorText);
            }
        } else {
            this.enableAll();
            this.error("Invalid disconnect response received");
        }
    },

    handleGetConnectionDetailsResponse: function(inSender, inResponse) {
        if(undefined != inResponse) {
            this.log("Response: ", inResponse);
            if(inResponse.returnValue) {
                if(inResponse.state == "disconnected") {
                    this.connectIt();
                } else {
                    this.$.disconnect.call({});
                }
            } else {
                this.enableAll();
                this.error("Couldn't get service state: " + inResponse.errorText);
                this.showError($L("Couldn't get service state: ") + inResponse.errorText);
            }
        } else {
            this.enableAll();
            this.error("Invalid connection details response received");
        }
    },

    tapCancelButton: function() {
        this.doCancel();
    },

    tapNextButton: function() {
        this.disableAll();
        var agentGuid = this.$.connectionTypeList.getValue();
        var agentInfo = this.$.connectionTypeList.item;
        if(undefined != agentGuid && undefined != agentInfo) {
            this.log("VPN Server: ", this.$.vpnHost.getValue(), ", Agent GUID: ", agentGuid);
            var eulaPath = agentInfo.getEulaPath();
            if(undefined != eulaPath && 0 < eulaPath.length) {
                var eulaParams = {
                    eulaPath: eulaPath,
                    agentGuid: agentInfo.getAgentGuid(),
                    label: agentInfo.getCaption()
                };
                this.doShowEulaTerms(eulaParams);
                this.enableAll();
            } else {
                this.$.getConnectionDetails.call({});
            }
        } else {
            this.error("Valid plugin agent not selected from the list");
            this.showError($L("Connection Type not selected"));
        }
    },
});

enyo.kind({
    name: "ConnectionTypeSelector",
    kind: "CustomListSelector",
    itemKind: "ConnectionTypeItem",

    setItemProps: function(inItem) {
        this.item.setValue(inItem.value);
        this.item.setCaption(inItem.caption);
        this.item.setIcon(inItem.icon);
        this.item.setAgentGuid(inItem.agentGuid);
        this.item.setEulaPath(inItem.eulaPath);
        this.item.setTechTypes(inItem.techTypes);
    }

});

enyo.kind({
    name: "ConnectionTypeItem",
    kind: "MenuCheckItem",

    published: {
        caption: "",
        icon: "",
        agentGuid: "",
        eulaPath: "",
        techTypes: "",
    },

    chrome: [
        { name: "item", kind: "Item", tapHighlight: true, align: "center", className: "enyo-menuitem", layoutKind: "HFlexLayout", onclick: "itemClick", components: [
            { name: "caption", style: "margin-right: 8px;" },
            { name: "icon", kind: "Image" },
        ]}
    ],

    create: function() {
        this.inherited(arguments);
        this.captionChanged();
        this.iconChanged();
    },

    captionChanged: function() {
        this.$.caption.setContent(this.caption);
    },

    iconChanged: function() {
        if(this.icon != undefined) {
            this.$.icon.setSrc(this.icon);
            this.$.icon.show();
        } else {
            this.$.icon.hide();
        }
    },

});

