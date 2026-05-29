(function () {
    const shell = window.WindowsShell || (window.WindowsShell = {});
    const state = shell.getState();

    async function getWinAppIconMap() {
        if (!state.winAppIconMapPromise) {
            state.winAppIconMapPromise = fetch('./js/Windows/apps.json', { cache: 'no-store' })
                .then(async response => {
                    if (!response.ok) throw new Error('Unable to load apps.json');
                    const manifest = await response.json();
                    const map = {};
                    Object.entries(manifest || {}).forEach(([appId, config]) => {
                        if (config && config.iconUrl) map[appId] = config.iconUrl;
                    });
                    return map;
                })
                .catch(err => {
                    console.warn('Failed to load app icons from manifest:', err);
                    return {};
                });
        }
        return state.winAppIconMapPromise;
    }

    async function getWinHomeConfig() {
        if (!state.winHomeConfigPromise) {
            state.winHomeConfigPromise = fetch('./js/Windows/home-screen-config.json', { cache: 'no-store' })
                .then(async response => {
                    if (!response.ok) throw new Error('Unable to load home-screen-config.json');
                    return response.json();
                })
                .catch(err => {
                    console.warn('Failed to load home screen config:', err);
                    return { apps: [] };
                });
        }
        return state.winHomeConfigPromise;
    }

    async function getHomeApps() {
        const [config, iconMap] = await Promise.all([getWinHomeConfig(), getWinAppIconMap()]);
        const apps = Array.isArray(config?.apps) ? config.apps : [];
        return apps.map(app => ({
            ...app,
            iconUrl: app.iconUrl || iconMap[app.id] || ''
        }));
    }

    function getAppMeta(appId) {
        const fromMap = state.winHomeAppsById.get(appId);
        if (fromMap) return fromMap;
        return { id: appId, label: appId, iconUrl: '' };
    }

    function ensureWindowLayer() {
        let layer = document.getElementById('windowLayer');
        if (!layer) {
            const home = document.getElementById('windowsHome');
            if (!home) return null;
            layer = document.createElement('div');
            layer.id = 'windowLayer';
            layer.className = 'win-window-layer';
            home.appendChild(layer);
        }
        return layer;
    }

    function ensureTaskbarPreview() {
        let preview = document.getElementById('taskbarPreview');
        if (!preview) {
            const home = document.getElementById('windowsHome');
            if (!home) return null;
            preview = document.createElement('div');
            preview.id = 'taskbarPreview';
            preview.className = 'win-task-preview';
            home.appendChild(preview);
        }
        return preview;
    }

    function getDesktopLabelText(rawLabel) {
        const label = String(rawLabel || '');
        return label.length > 10 ? `${label.slice(0, 10)}...` : label;
    }

    function createDesktopButton(app) {
        const button = document.createElement('button');
        button.className = 'win-desktop-icon';
        button.onclick = () => {
            if (state.winDesktopSelection && state.winDesktopSelection !== button) {
                state.winDesktopSelection.classList.remove('selected');
            }
            state.winDesktopSelection = button;
            button.classList.add('selected');
        };
        button.ondblclick = () => window.openWindowsApp(app.id);
        button.dataset.appId = app.id;
        button.title = app.label || app.id;

        const img = document.createElement('img');
        img.className = 'win-app-icon';
        img.alt = app.label || app.id;
        if (app.iconUrl) {
            img.src = app.iconUrl;
            img.style.display = 'inline-block';
        }

        const label = document.createElement('span');
        label.textContent = getDesktopLabelText(app.label || app.id);
        label.title = app.label || app.id;

        button.appendChild(img);
        button.appendChild(label);
        makeDesktopIconMovable(button);
        return button;
    }

    function createStartButton(app) {
        const button = document.createElement('button');
        button.onclick = event => event.stopPropagation();
        button.ondblclick = () => window.openWindowsApp(app.id);

        const img = document.createElement('img');
        img.className = 'win-app-icon';
        img.alt = app.label || app.id;
        if (app.iconUrl) {
            img.src = app.iconUrl;
            img.style.display = 'inline-block';
        }

        const label = document.createElement('span');
        label.textContent = app.label || app.id;

        button.appendChild(img);
        button.appendChild(label);
        return button;
    }

    function showTaskbarPreview(appId, buttonEl) {
        const preview = ensureTaskbarPreview();
        if (!preview || !buttonEl) return;

        if (state.winTaskbarPreviewHideTimer) {
            clearTimeout(state.winTaskbarPreviewHideTimer);
            state.winTaskbarPreviewHideTimer = null;
        }

        const windowsForApp = Array.from(state.winWindows.values()).filter(w => w.appId === appId);
        if (windowsForApp.length === 0) {
            preview.classList.remove('active');
            return;
        }

        const topWindow = windowsForApp.reduce((acc, cur) => (cur.zIndex > acc.zIndex ? cur : acc), windowsForApp[0]);
        const title = topWindow.title || getAppMeta(appId).label || appId;

        preview.innerHTML = '';
        const titleEl = document.createElement('div');
        titleEl.className = 'win-task-preview-title';
        titleEl.textContent = windowsForApp.length > 1 ? `${title} (${windowsForApp.length})` : title;

        const actionsEl = document.createElement('div');
        actionsEl.className = 'win-task-preview-actions';

        const switchBtn = document.createElement('button');
        switchBtn.textContent = 'Open';
        switchBtn.onclick = event => {
            event.stopPropagation();
            window.restoreWindow(topWindow.id);
            preview.classList.remove('active');
        };

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.onclick = event => {
            event.stopPropagation();
            window.closeWindow(topWindow.id);
            preview.classList.remove('active');
        };

        actionsEl.appendChild(switchBtn);
        actionsEl.appendChild(closeBtn);
        preview.appendChild(titleEl);
        preview.appendChild(actionsEl);

        const rect = buttonEl.getBoundingClientRect();
        preview.style.left = `${Math.max(8, rect.left - 40)}px`;
        preview.style.bottom = '56px';
        preview.classList.add('active');

        preview.onmouseenter = () => {
            if (state.winTaskbarPreviewHideTimer) {
                clearTimeout(state.winTaskbarPreviewHideTimer);
                state.winTaskbarPreviewHideTimer = null;
            }
        };
        preview.onmouseleave = () => hideTaskbarPreview();
    }

    function hideTaskbarPreview() {
        const preview = document.getElementById('taskbarPreview');
        if (!preview) return;
        if (state.winTaskbarPreviewHideTimer) clearTimeout(state.winTaskbarPreviewHideTimer);
        state.winTaskbarPreviewHideTimer = setTimeout(() => {
            preview.classList.remove('active');
        }, 80);
    }

    function createTaskbarButton(app) {
        const button = document.createElement('button');
        button.className = 'win-task-btn';
        button.setAttribute('aria-label', app.label || app.id);
        button.dataset.appId = app.id;

        button.onclick = event => {
            event.stopPropagation();
            const windowsForApp = Array.from(state.winWindows.values()).filter(w => w.appId === app.id);
            if (windowsForApp.length === 0) {
                window.openWindowsApp(app.id);
                return;
            }

            const topWindow = windowsForApp.reduce((acc, cur) => (cur.zIndex > acc.zIndex ? cur : acc), windowsForApp[0]);
            if (topWindow.minimized) {
                window.restoreWindow(topWindow.id);
            } else if (state.winActiveWindowId === topWindow.id) {
                window.minimizeWindow(topWindow.id);
            } else {
                window.restoreWindow(topWindow.id);
            }
        };

        button.onmouseenter = () => showTaskbarPreview(app.id, button);
        button.onmouseleave = () => hideTaskbarPreview();

        const img = document.createElement('img');
        img.className = 'win-app-icon';
        img.alt = app.label || app.id;
        if (app.iconUrl) {
            img.src = app.iconUrl;
            img.style.display = 'inline-block';
        }
        button.appendChild(img);

        state.winTaskbarButtonsByAppId.set(app.id, button);
        return button;
    }

    function ensureTaskbarButtonForApp(appId) {
        if (state.winTaskbarButtonsByAppId.has(appId)) return;
        const taskbarHost = document.getElementById('taskbarPinnedHost');
        if (!taskbarHost) return;
        taskbarHost.appendChild(createTaskbarButton(getAppMeta(appId)));
    }

    function makeDesktopIconMovable(button) {
        button.addEventListener('mousedown', event => {
            if (event.button !== 0) return;
            const host = document.getElementById('desktopIconsHost');
            if (!host) return;
            const hostRect = host.getBoundingClientRect();
            const rect = button.getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const offsetY = event.clientY - rect.top;
            const gridX = 76;
            const gridY = 78;

            const onMove = moveEvent => {
                const rawLeft = Math.max(0, Math.min(hostRect.width - rect.width, moveEvent.clientX - hostRect.left - offsetX));
                const rawTop = Math.max(0, Math.min(hostRect.height - rect.height, moveEvent.clientY - hostRect.top - offsetY));
                const left = Math.round(rawLeft / gridX) * gridX;
                const top = Math.round(rawTop / gridY) * gridY;
                button.style.left = `${Math.max(0, Math.min(hostRect.width - rect.width, left))}px`;
                button.style.top = `${Math.max(0, Math.min(hostRect.height - rect.height, top))}px`;
            };

            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }
    
    //-- render desktop, icons, start menu, taskbar based on all configurations
    async function renderHomeSurface() {
        const apps = await getHomeApps();
        state.winHomeAppsById = new Map(apps.map(app => [app.id, app]));

        const desktopHost = document.getElementById('desktopIconsHost');
        const startHost = document.getElementById('startMenuGrid');
        const taskbarHost = document.getElementById('taskbarPinnedHost');

        if (desktopHost) {
            desktopHost.innerHTML = '';
            const desktopApps = apps.filter(app => app.showOnDesktop);
            desktopApps.forEach((app, index) => {
                const button = createDesktopButton(app);
                const x = (index % 8) * 76;
                const y = Math.floor(index / 8) * 78;
                // const z = 100 + index;
                button.style.left = `${x}px`;
                button.style.top = `${y}px`;
                desktopHost.appendChild(button);
            });
        }

        if (startHost) {
            startHost.innerHTML = '';
            apps.filter(app => app.showInStart).forEach(app => {
                startHost.appendChild(createStartButton(app));
            });
        }

        if (taskbarHost) {
            taskbarHost.innerHTML = '';
            state.winTaskbarButtonsByAppId = new Map();
            state.winPinnedAppIds = new Set(apps.filter(app => app.showOnTaskbar).map(app => app.id));
            apps.filter(app => app.showOnTaskbar).forEach(app => {
                taskbarHost.appendChild(createTaskbarButton(app));
            });
        }

        ensureTaskbarPreview();
    }

    // js --> global scope (DEFINE FUNCTIONS TO BE USED IN HTML HERE ADD () IF SPECIFIC PARAMS)

    shell.getWinAppIconMap = getWinAppIconMap;
    shell.getWinHomeConfig = getWinHomeConfig;
    shell.getHomeApps = getHomeApps;
    shell.getAppMeta = getAppMeta;
    shell.ensureWindowLayer = ensureWindowLayer;
    shell.ensureTaskbarPreview = ensureTaskbarPreview;
    shell.hideTaskbarPreview = hideTaskbarPreview;
    shell.ensureTaskbarButtonForApp = ensureTaskbarButtonForApp;
    shell.renderHomeSurface = renderHomeSurface;

    window.getAppMeta = getAppMeta;
    window.hideTaskbarPreview = hideTaskbarPreview;
    window.renderHomeSurface = renderHomeSurface;
})();
