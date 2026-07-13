enyo.kind({
    name: "DynamicForm",
    kind: enyo.VFlexBox,

    events: {
        onHandleDynamicFormButtonResponse: "",
        onEnterKeyPressed: "",
    },

    published: {
    },

    formFields: undefined,
    profileName: undefined,
    vpnServer: undefined,
    vpnAgentGuid: undefined,
    isDisabled: false,
    isNewProfile: true,
    isProfileDetailsScene: false,

    components: [
        { kind: "Drawer", name: "dynamicFormElementsStart" },
        { name: "uiPromptResponse", kind: "VpnService" }
    ],

    create: function() {
        this.log("Called");
        this.inherited(arguments);
    },

    getVpnProfileName: function() {
        return this.$['vpnProfileName'].getValue();
    },

    getVpnHost: function() {
        return this.$['vpnHost'].getValue();
    },

    checkIsNewProfile: function() {
        return this.isNewProfile;
    },

    iterateThroughFormFields: function(fields, actionFunction) {
        for(var index = 0; index < fields.length; index++) {
            var field = fields[index];
            if("groups" === field.type) {
                actionFunction(field);
                for(var groupIndex = 0; groupIndex < field.groups.length; groupIndex++) {
                    this.iterateThroughFormFields(field.groups[groupIndex].vpnFormFields, actionFunction);
                }
            } else if ("rowgroup" === field.type) {
                this.iterateThroughFormFields(field.vpnFormFields, actionFunction);
            } else {
                actionFunction(field);
            }
        }
    },

    checkFormFieldsValuesChanged: function() {
        var somethingChanged = false;
        
        // check if vpn server name/ip has changed.
        if(this.getVpnHost() !== this.vpnServer) {
            return true;
        }
        // check whether the remaining widget values have changed.
        this.iterateThroughFormFields(
            this.formFields,
            enyo.bind(this, function(field) {
                var newValue = undefined;
                if (undefined != this.$[field.id]) {

                    if(field.type === "checkbox") {
                        newValue = (this.$[field.id].getChecked())?"true":"false"; 
                    } else if (field.type === "listselector") {
                        var index = this.$[field.id].getValue();
                        newValue = field.options[index].value;
                    } else if (field.type === "textfield" || field.type === "passwordfield") {
                        newValue = this.$[field.id].getValue();
                    } else if (field.type === "groups") {
                        newValue = field.groups[this.$[field.id].getValue()].groupLabel;
                    }

                    // compare with the old value.
                    if(field.value !== newValue) {
                        somethingChanged = true;
                        return;
                    }
                }
            })
        );
        return somethingChanged;
    },

    getFormFieldsObjects: function() {
        this.iterateThroughFormFields(
            this.formFields,
            enyo.bind(this, function(field) {
                if (undefined != this.$[field.id]) {
                    if(field.type === "checkbox") {
                        field.value = (this.$[field.id].getChecked())?"true":"false";
                    } else if (field.type === "listselector") {
                        var index = this.$[field.id].getValue();
                        field.value = field.options[index].value;
                    } else if (field.type === "textfield" || field.type === "passwordfield"){
                        field.value = this.$[field.id].getValue();
                    } else if (field.type === "groups") {
                        field.value = field.groups[this.$[field.id].getValue()].groupLabel;
                    }
                } else {
                    //this.log("Could not find a form field for id: " + field.id);
                }
            })
        );
        return this.formFields;
    },

    disableFormFields: function(doDisable) {
        this.isDisabled = doDisable; // DFISH-18486 Fix.
        if (undefined != this.$['vpnHost']) {
            this.$['vpnHost'].setDisabled(doDisable);
            this.$['vpnHost'].render();
        }
        this.iterateThroughFormFields(
            this.formFields,
            enyo.bind(this, function(field) {
                if (undefined != this.$[field.id]) {
                    if (undefined == field.editable) {
                        field.editable = true;
                    }
                    this.$[field.id].setDisabled(doDisable?true:(field.editable?false:true));
                    this.$[field.id].render();
                } else {
                    //this.log("Could not find a form field for id: " + field.id);
                }
            })
        );
    },

    buildForm: function(formInfo) {
        this.log("Called");
        this.formFields = formInfo.formFields;
        this.profileName = formInfo.profileName;
        this.vpnServer = formInfo.vpnServer;
        this.vpnAgentGuid = formInfo.vpnAgentGuid;
        if (undefined == formInfo.globallyIsDisabled) {
            this.isDisabled = false;
        } else {
            this.isDisabled = formInfo.globallyIsDisabled;
        }
        this.isNewProfile = formInfo.isNewProfile;
        this.isProfileDetailsScene = formInfo.isProfileDetailsScene;

        // destroy all controls from the container now.
        this.$.dynamicFormElementsStart.destroyControls();

        // add the new controls
        if (undefined != this.profileName) {
            var data = {
                id: 'vpnProfileName',
                label: $L("Profile Name"),
                value: this.profileName,
                disabled: false,
            }

            if (0 != this.profileName.length) {
                data.disabled = true;
            } else {
                data.disabled = false;
            }

            if(undefined != this.isNewProfile && !this.isNewProfile) {
                data.disabled = true;
            } else {
                data.disabled = false;
            }

            this.insertTextFieldWidget(this.$.dynamicFormElementsStart, data);
        }

        if (undefined != this.vpnServer) {
            var data = {
                id: 'vpnHost',
                label: $L('VPN Server'),
                value: this.vpnServer,
                disabled: false,
                inputType: "url", 
            }

            this.insertTextFieldWidget(this.$.dynamicFormElementsStart, data);
        }

        this.buildFormFields(this.$.dynamicFormElementsStart, this.formFields);

        // render the container.
        this.$.dynamicFormElementsStart.render();
        
    },

    buildFormFields: function(parentComponent, fields) {
        this.log("Called");
        for(var i=0; i< fields.length; i++){
            //this.log("field data: ", fields[i]);
            if(undefined==fields[i].visible || fields[i].visible) {
                if("textfield" === fields[i].type ) {
                    this.insertTextFieldWidget(parentComponent, fields[i]);
                } else if("passwordfield" === fields[i].type) {
                    this.insertPasswordFieldWidget(parentComponent, fields[i]);
                } else if("checkbox" === fields[i].type) {
                    this.insertCheckboxWidget(parentComponent, fields[i]);
                } else if("listselector" === fields[i].type) {
                    this.insertListselectorWidget(parentComponent, fields[i]);
                } else if("button" === fields[i].type) {
                    if(!this.isProfileDetailsScene) {
                        this.insertButtonWidget(parentComponent, fields[i]);
                    }
                } else if("label" === fields[i].type) {
                    if(!this.isProfileDetailsScene) {
                        this.insertLabel(parentComponent, fields[i]);
                    }
                } else if("status" === fields[i].type) {
                    if(!this.isProfileDetailsScene) {
                        this.insertStatus(parentComponent, fields[i]);
                    }
                } else if ("rowgroup" === fields[i].type) {
                    this.log("found rowgroup field type");
                    this.processRowGroupWidget(parentComponent, fields[i]);
                } else if("groups" === fields[i].type) {
                    this.processGroupType(parentComponent, fields[i]);
                }
            }
        }
    },

    insertLabel: function(parentComponent, data) {
        var rowGroupComp = parentComponent.createComponent({
            kind: "RowGroup",
            caption: data.label,
            style: "margin: 8px 8px;",
        });

        var tempComp = rowGroupComp.createComponent({
            tapHighlight: false,
        });

        tempComp.createComponent({
            name: data.id,
            content: data.value,
            owner: this,
        });
    },

    insertStatus: function(parentComponent, data) {
        if(data.uiVersion === 2) {
        /*
            { name: "errorBox", kind: "HFlexBox", showing: false, align: "center", className: "error-box", components: [
                { kind: "Image", src: "../../images/warning-icon.png" },
                { name: "errorMessage", className: "enyo-text-error", flex:1  },
            ]},
        */
            var hFlexBoxComp = parentComponent.createComponent({
                name: data.id,
                kind: "HFlexBox",
                align: "center",
                owner: this,
            });

            hFlexBoxComp.createComponent({
                kind: "Image",
                src: "../../images/warning-icon.png",
                style: "margin-left: 8px; margin-right: 8px; margin-top: 4px;",
            });

            var statusType = data.statusType || "error";

            hFlexBoxComp.createComponent({
                content: data.value,
                className: "enyo-text-"+statusType, // enyo-text-error or enyo-text-footnote
                flex: 1,
            });
                
            
        } else {
            var rowGroupComp = parentComponent.createComponent({
                kind: "RowGroup",
                caption: " ",
                style: "margin: 8px 8px;",
            });

            var tempComp = rowGroupComp.createComponent({
                tapHighlight: false,
            });

            tempComp.createComponent({
                name: data.id,
                content: data.value,
                owner: this,
            });
        }
    },

    // Hack: To handle Enter Key Press.
    checkEnterKeyPressed: function(inSender, inEvent) {
        if (undefined != inEvent) {
            // when EnterKey Pressed..
            if (inEvent.keyCode === 13) {
                this.doEnterKeyPressed();
            }
        }
    },

    insertTextFieldWidget: function(parentComponent, data) {
        var inputHintText = "";
        
        // Use hinText passed by the plugin.
        if(data.hintText != undefined) {
            inputHintText = data.hintText;
        } else {
            inputHintText = $L("Enter ") + data.label.toLowerCase();
        }

        if(undefined == data.editable) {
            data.editable = true;
        }

        this.log("textfield uiVersion: " + data.uiVersion);

        if(data.uiVersion === 2) {
            var tempInputBox = parentComponent.createComponent({
                kind: "InputBox",
                layoutKind: "HFlexLayout",
            });

            tempInputBox.createComponent({
                content: data.label,
                className: "enyo-label",
                style: "padding-right: 10px",
            });

            tempInputBox.createComponent({
                kind: "Input",
                name: data.id,
                value: data.value,
                hint: inputHintText,
                flex: 1,
                styled: false,
                inputType: data.inputType?data.inputType:"",
                autoCapitalize: "lowercase",
                spellcheck: false,
                autocorrect: false,
                disabled: this.isDisabled?true:(data.editable?false:true),
                onkeypress: "checkEnterKeyPressed",
                owner: this
            });
        } else {
            var rowGroupComp = parentComponent.createComponent({
                kind: "RowGroup",
                caption: data.label,
                style: "margin: 8px 8px;",
                owner: this
            });

            var tempComp = rowGroupComp.createComponent({
                tapHighlight: false,
            });

            tempComp.createComponent({
                kind: "Input",
                name: data.id,
                value: data.value,
                hint: inputHintText,
                spellcheck: false,
                autocorrect: false,
                autoCapitalize: "lowercase",
                inputType: data.inputType,
                disabled: this.isDisabled?true:(data.editable?false:true),
                onkeypress: "checkEnterKeyPressed",
                owner: this
            });
        }
        // force keyboard focus
        if(!this.isProfileDetailsScene && this.$[data.id] != undefined && data.forceFocus != undefined && data.forceFocus === true) {
            enyo.asyncMethod(this.$[data.id], "forceFocus");
        }
    },

    insertPasswordFieldWidget: function(parentComponent, data) {
        var inputHintText = "";
        // Use hinText passed by the plugin.
        if(data.hintText != undefined) {
            inputHintText = data.hintText;
        } else {
            inputHintText = $L("Enter ") + data.label.toLowerCase();
        }

        if(undefined == data.editable) {
            data.editable = true;
        }

        this.log("textfield uiVersion: " + data.uiVersion);

        if(data.uiVersion === 2) {
            var tempInputBox = parentComponent.createComponent({
                kind: "InputBox",
                layoutKind: "HFlexLayout",
            });

            tempInputBox.createComponent({
                content: data.label,
                className: "enyo-label",
                style: "padding-right: 10px",
            });

            tempInputBox.createComponent({
                kind: "PasswordInput",
                name: data.id,
                value: data.value,
                hint: inputHintText,
                flex: 1,
                styled: false,
                autoCapitalize: "lowercase",
                spellcheck: false,
                autocorrect: false,
                disabled: this.isDisabled?true:(data.editable?false:true),
                onkeypress: "checkEnterKeyPressed",
                owner: this
            });
        } else {
            var rowGroupComp = parentComponent.createComponent({
                kind: "RowGroup",
                caption: data.label,
                style: "margin: 8px 8px;",
                owner: this,
            });

            var tempComp = rowGroupComp.createComponent({
                tapHighlight: false,
            });

            tempComp.createComponent({
                kind: "PasswordInput",
                name: data.id,
                value: data.value,
                hint: inputHintText,
                autoCapitalize: "lowercase",
                spellcheck: false,
                autocorrect: false,
                disabled: this.isDisabled?true:(data.editable?false:true),
                onkeypress: "checkEnterKeyPressed",
                owner: this
            });
        }
        // force keyboard focus
        if(!this.isProfileDetailsScene && this.$[data.id] != undefined && data.forceFocus != undefined && data.forceFocus === true) {
            enyo.asyncMethod(this.$[data.id], "forceFocus");
        }
    },

    dealWithDynamicButtonResponse: function(inSender, inResponse) {
        this.log("deal with the dynamic button response received from the backend module");
        this.doHandleDynamicFormButtonResponse(inResponse);
    },

    handleOnDynamicButtonTap: function(inSender) {
        this.log("Called");
        var paramsToSend = {
            buttonId: inSender.data.id,
            vpnFormFields: this.getFormFieldsObjects(),
            vpnAgentGuid: this.vpnAgentGuid,
        };
        this.log("Sending: ", paramsToSend.buttonId);
        this.$.uiPromptResponse.call(paramsToSend, {onResponse: "dealWithDynamicButtonResponse"});
        this.$[inSender.data.id].setActive(true);
        this.$[inSender.data.id].render();
    },

    insertButtonWidget: function(parentComponent, data) {
        var styleClassName = "vpn-button";
        if (data.buttonType) {
            styleClassName = "vpn-button enyo-button-"+data.buttonType;
        }
        parentComponent.createComponent({
            kind: "ActivityButton",
            className: styleClassName,
            name: data.id,
            data: data,
            caption: data.label,
            disabled: this.isDisabled, 
            onclick: "handleOnDynamicButtonTap",
            owner: this,
        });
    },

    insertCheckboxWidget: function(parentComponent, data) {
        var rootComp;
        this.log("checkbox uiVersion: " + data.uiVersion);
        if(data.uiVersion === 2) {
            rootComp = parentComponent;
        } else {
            rootComp = parentComponent.createComponent({
                kind: "RowGroup",
                style: "margin: 8px 8px;",
            });
        }

        var tempComp = rootComp.createComponent({
            kind: "LabeledContainer",
            caption: data.label,
        });

        if(data.value === undefined) {
            data.value = "false";
        }

        tempComp.createComponent({
            kind: "CheckBox",
            name: data.id,
            checked: (data.value === "true")?true:false,
            disabled: this.isDisabled,
            owner:this,
        });
    },

    insertListselectorWidget: function(parentComponent, data) {
        var selectedIndex = 0;

        var makeListItems = function(data) {
            var listItemsArray = [];
            for(var index = 0; index < data.options.length; ++index) {
                listItemsArray.push({
                    caption: data.options[index].label,
                    value: index,
                });
                if(data.options[index].value == data.value) {
                    selectedIndex = index;
                }
            }
            return listItemsArray;
        };

        if(data.uiVersion === 2) {
            var HFlexComp = parentComponent.createComponent({
                layoutKind: "HFlexLayout",
                align: "center",
            });
            
            HFlexComp.createComponent({
                content: data.label,
                className: "enyo-label",
                flex: 1,
            });

            HFlexComp.createComponent({
                kind: "ListSelector",
                name: data.id,
                disabled: this.isDisabled,
                owner: this,
            });
        } else {
            var rowGroupComp = parentComponent.createComponent({
                kind: "RowGroup",
                caption: data.label,
                style: "margin: 8px 8px;",
                owner: this,
            });

            var tempComp = rowGroupComp.createComponent({
                tapHighlight: false,
            });

            tempComp.createComponent({
                kind: "ListSelector",
                name: data.id,
                disabled: this.isDisabled,
                owner: this,
            });
        }

        this.$[data.id].setItems(makeListItems(data));
        this.$[data.id].setValue(selectedIndex);
    },

    processRowGroupWidget: function(parentComponent, data) {
        this.log("processing row group");
        var showing = true;

        if(!this.isProfileDetailsScene) {
            if(data.hideWhenReprompted != undefined && data.hideWhenReprompted == true) {
                showing = false;
            }
        }

        var rowGroupComp = parentComponent.createComponent({
            kind: "RowGroup",
            caption: data.label,
            style: "margin: 8px 8px;",
            showing: showing,
            owner: this,
        });

        this.buildFormFields(rowGroupComp, data.vpnFormFields);
    },

    onGroupListItemChanged: function(inSender, inValue, inOldValue) {
        var rootDiv = this.$[inSender.name+'divDynamic']
        rootDiv.destroyControls();

        this.buildFormFields(rootDiv, inSender.data.groups[inValue].vpnFormFields);
        rootDiv.render();
    },

    processGroupType: function(parentComponent, data) {

        var selectedIndex = 0;

        var makeListItems = function(data) {
            var listItemsArray = [];
            for(var index=0; index < data.groups.length; index++) {
                listItemsArray.push({
                    caption: data.groups[index].groupLabel,
                    value: index,
                });
                if(data.value === data.groups[index].groupLabel) {
                    selectedIndex = index;
                }
            }
            return listItemsArray;
        };

        var groupComp = parentComponent.createComponent({
            kind: "Group",
            caption: data.label,
            style: "margin: 8px 8px;",
            owner: this,
        });

        var tempComp = groupComp.createComponent({
            tapHighlight: false,
        });

        tempComp.createComponent({
            kind: "ListSelector",
            name: data.id,
            data: data,
            className: "vpn-list-selector",
            disabled: this.isDisabled,
            onChange: "onGroupListItemChanged",
            owner: this,
        });

        this.$[data.id].setItems(makeListItems(data));
        this.$[data.id].setValue(selectedIndex);

        var dataIdDynamicStart = groupComp.createComponent({
            kind: "Drawer",
            name: data.id + 'divDynamic',
            owner: this,
        });

        this.buildFormFields(dataIdDynamicStart, data.groups[selectedIndex].vpnFormFields);
    },

});
