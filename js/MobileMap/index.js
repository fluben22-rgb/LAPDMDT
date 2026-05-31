window.initMobileMapApp = function initMobileMapApp(shellWindow) {
    const root = shellWindow?.body?.querySelector?.('[data-mobile-map-app]') || document.querySelector('[data-mobile-map-app]');
    if (!root) return;

    root.querySelectorAll('.mobile-map-rail-btn').forEach(button => {
        button.addEventListener('click', () => {
            if (!button.classList.contains('mobile-map-return-mdt')) return;
            root.querySelectorAll('.mobile-map-rail-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        });
    });

    const returnToMdtButton = root.querySelector('.mobile-map-return-mdt');
    if (returnToMdtButton) {
        returnToMdtButton.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();
            if (typeof window.openWindowsApp === 'function') {
                await window.openWindowsApp('PremierOneMDT');
            }
            if (shellWindow?.id && typeof window.closeWindow === 'function') {
                window.closeWindow(shellWindow.id);
            }
        });
    }

    const soundToggle = root.querySelector('.mobile-map-sound-toggle');
    if (soundToggle) {
        soundToggle.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const icon = soundToggle.querySelector('span');
            const muted = soundToggle.dataset.muted !== 'true';
            soundToggle.dataset.muted = muted ? 'true' : 'false';
            soundToggle.title = muted ? 'Unmute map' : 'Mute map';
            if (icon) icon.className = muted ? 'mif-volume-mute' : 'mif-volume-high';
        });
    }

    if (typeof window.initMobileMapView === 'function') {
        window.initMobileMapView(root);
    }
};
