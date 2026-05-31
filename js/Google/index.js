(function () {
    function initGoogleApp(shellWindow) {
        const root = shellWindow?.body || document;
        const frame = root.querySelector('#google-iframe');
        if (!frame) return;
        frame.referrerPolicy = 'no-referrer';
    }

    window.initGoogleApp = initGoogleApp;
})();
