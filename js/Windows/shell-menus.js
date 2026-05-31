// all of these handles menus
// 

(function () {
    const shell = window.WindowsShell || (window.WindowsShell = {});
    const state = shell.getState();

    //-- dismissMenus: Utility function to close all open menus --\\
    function dismissMenus() {
        const wifiMenu = document.getElementById('win-wifi-menu');
        const powerMenu = document.getElementById('win-power-menu');
        const startMenu = document.getElementById('startMenu');
        const desktopContextMenu = document.getElementById('desktopContextMenu');
        const startPowerMenu = document.getElementById('startPowerMenu');

        if (wifiMenu) wifiMenu.classList.remove('active');
        if (powerMenu) powerMenu.classList.remove('active');
        if (startMenu) startMenu.classList.remove('active');
        if (desktopContextMenu) {
            desktopContextMenu.classList.remove('active');
            desktopContextMenu.setAttribute('aria-hidden', 'true');
        }
        if (startPowerMenu) startPowerMenu.classList.remove('active');
    }

    //-- handles power options --\\
    function toggleStartPowerMenu(event) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        const menu = document.getElementById('startPowerMenu');
        if (!menu) return;
        const shouldOpen = !menu.classList.contains('active');
        dismissMenus();
        const startMenu = document.getElementById('startMenu');
        if (startMenu) startMenu.classList.add('active');
        if (shouldOpen) menu.classList.add('active');
    }

    function powerAction() {
        dismissMenus();
        window.location.reload();
    }

    function toggleStartMenu(event) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        const startMenu = document.getElementById('startMenu');
        if (!startMenu) return;
        const shouldOpen = !startMenu.classList.contains('active');
        dismissMenus();
        if (shouldOpen) startMenu.classList.add('active');
    }

    function showDesktopContextMenu(event) {
        const home = document.getElementById('windowsHome');
        const menu = document.getElementById('desktopContextMenu');
        if (!home || !menu || home.style.display === 'none') return;
        if (event.target.closest('.win-app-window') || event.target.closest('.shell-window-host')) return;

        event.preventDefault();
        dismissMenus();

        const x = Math.min(event.clientX, window.innerWidth - 260);
        const y = Math.min(event.clientY, window.innerHeight - 230);
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.classList.add('active');
        menu.setAttribute('aria-hidden', 'false');
    }

    function toggleWifiMenu(event) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        const wifiMenu = document.getElementById('win-wifi-menu');
        if (!wifiMenu) return;
        const shouldOpen = !wifiMenu.classList.contains('active');
        dismissMenus();
        if (shouldOpen) wifiMenu.classList.add('active');
    }

    function togglePowerMenu(event) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        const powerMenu = document.getElementById('win-power-menu');
        if (!powerMenu) return;
        const shouldOpen = !powerMenu.classList.contains('active');
        dismissMenus();
        if (shouldOpen) powerMenu.classList.add('active');
    }

    function updateWindowsHomeClock() {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
        const timeEl = document.getElementById('winHomeTime');
        const dateEl = document.getElementById('winHomeDate');
        if (timeEl) {
            timeEl.textContent = now.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'America/Los_Angeles'
            });
        }
        if (dateEl) {
            dateEl.textContent = now.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' });
        }
    }

    // global mute
    function toggleGlobalMute() {
        state.winGlobalMuted = !state.winGlobalMuted;
        document.querySelectorAll('audio, video').forEach(media => {
            media.muted = state.winGlobalMuted;
        });

        const icon = document.getElementById('taskbarSoundIcon');
        if (icon) {
            icon.className = state.winGlobalMuted ? 'mif-volume-mute' : 'mif-volume-high';
        }
    }

    function toggleA11yMenu(event) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    }

    function closeDesktopAppWindow() {
        if (!state.winActiveWindowId) return;
        window.closeWindow(state.winActiveWindowId);
    }

    function handleWindowClose() {
        if (state.winActiveWindowId) {
            window.closeWindow(state.winActiveWindowId);
            setTimeout(() => window.location.reload(), 0);
            return;
        }
        if (typeof logoff === 'function') {
            logoff();
        }
        setTimeout(() => window.location.reload(), 0);
    }

    function handleWindowMinimize() {
        if (state.winActiveWindowId) {
            window.minimizeWindow(state.winActiveWindowId);
        }
    }

    function handleWindowMaximize() {
        if (state.winActiveWindowId) {
            window.toggleMaximizeWindow(state.winActiveWindowId);
        }
    }

    function showWindowsHome() {
        const home = document.getElementById('windowsHome');
        const titleBar = document.getElementById('titleBar');
        const appRoot = document.getElementById('premierOneApp');

        if (titleBar) titleBar.style.display = 'none';
        if (appRoot) appRoot.style.display = 'none';
        if (home) home.style.display = 'block';

        window.renderHomeSurface();
        updateWindowsHomeClock();
        if (!state.winHomeClockTimer) {
            state.winHomeClockTimer = setInterval(updateWindowsHomeClock, 1000);
        }
    }

    // functions -> global scope html only no () needed unless specific params
    window.showWindowsHome = showWindowsHome;
    window.toggleStartMenu = toggleStartMenu;
    window.toggleGlobalMute = toggleGlobalMute;
    window.closeDesktopAppWindow = closeDesktopAppWindow;
    window.handleWindowClose = handleWindowClose;
    window.handleWindowMinimize = handleWindowMinimize;
    window.handleWindowMaximize = handleWindowMaximize;
    window.toggleStartPowerMenu = toggleStartPowerMenu;
    window.powerAction = powerAction;
    window.dismissMenus = dismissMenus;
    window.toggleWifiMenu = toggleWifiMenu;
    window.togglePowerMenu = togglePowerMenu;
    window.toggleA11yMenu = toggleA11yMenu;
    window.showDesktopContextMenu = showDesktopContextMenu;
})();
