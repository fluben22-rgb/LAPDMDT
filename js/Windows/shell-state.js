// global state manager

(function () {
    const shell = window.WindowsShell || (window.WindowsShell = {});

    if (!shell.state) {
        shell.state = {
            winHomeClockTimer: null,
            winAppIconMapPromise: null,
            winHomeConfigPromise: null,
            winGlobalMuted: false,
            winDesktopSelection: null,
            winHomeAppsById: new Map(),
            winTaskbarButtonsByAppId: new Map(),
            winWindowCounter: 0,
            winZCounter: 1200,
            winActiveWindowId: null,
            winWindows: new Map(),
            winPinnedAppIds: new Set(),
            winTaskbarPreviewHideTimer: null
        };
    }

    shell.getState = function getState() {
        return shell.state;
    };
})();
