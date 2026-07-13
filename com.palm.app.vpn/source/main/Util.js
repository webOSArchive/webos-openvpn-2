var VpnUtil = (function () {

    return {

        // function to return localized string (in all caps) for a given state of the connection.
        getLocalizedConnectState: function(state) {
            var locState = state;
            switch (state) {
                case "connecting":
                    locState = $L("CONNECTING");
                    break;
                case "connected":
                    locState = $L("CONNECTED");
                    break;
                case "disconnecting":
                    locState = $L("DISCONNECTING");
                    break;
                case "disconnected":
                    locState = $L("DISCONNECTED");
                    break;
                case "reconnecting":
                    locState = $L("RECONNECTING");
                    break;
            }
            return locState;
        },

    }
}());
