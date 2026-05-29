(function () {
    const shell = window.WindowsShell || (window.WindowsShell = {});
    const state = shell.getState();

    function updateTaskbarOpenState(appId) {
        const btn = state.winTaskbarButtonsByAppId.get(appId);
        if (!btn) return;
        const windowsForApp = Array.from(state.winWindows.values()).filter(w => w.appId === appId);
        btn.classList.toggle('is-open', windowsForApp.length > 0);
        btn.classList.toggle('is-active', windowsForApp.some(w => w.id === state.winActiveWindowId && !w.minimized));
    }

    function setActiveWindow(windowId) {
        const windowObj = state.winWindows.get(windowId);
        if (!windowObj) return;

        windowObj.minimized = false;
        windowObj.el.style.display = 'block';
        windowObj.el.style.zIndex = String(++state.winZCounter);
        windowObj.zIndex = state.winZCounter;
        state.winActiveWindowId = windowId;

        for (const win of state.winWindows.values()) {
            win.el.classList.toggle('active', win.id === windowId);
        }

        const uniqueAppIds = new Set(Array.from(state.winWindows.values()).map(win => win.appId));
        uniqueAppIds.forEach(updateTaskbarOpenState);
    }

    function removeWindowFromTaskbarState(windowObj) {
        if (!windowObj) return;
        updateTaskbarOpenState(windowObj.appId);
    }

    function makeWindowMovable(windowObj, dragHandle) {
        let dragState = null;
        dragHandle.addEventListener('mousedown', event => {
            if (event.button !== 0) return;
            if (event.target.closest('.win-app-window-actions')) return;
            if (windowObj.maximized) return;
            const rect = windowObj.el.getBoundingClientRect();
            dragState = {
                startX: event.clientX,
                startY: event.clientY,
                left: rect.left,
                top: rect.top
            };
            setActiveWindow(windowObj.id);
        });

        document.addEventListener('mousemove', event => {
            if (!dragState) return;
            const dx = event.clientX - dragState.startX;
            const dy = event.clientY - dragState.startY;
            const nextLeft = Math.max(0, Math.min(window.innerWidth - 320, dragState.left + dx));
            const nextTop = Math.max(0, Math.min(window.innerHeight - 110, dragState.top + dy));
            windowObj.el.style.left = `${nextLeft}px`;
            windowObj.el.style.top = `${nextTop}px`;
        });

        document.addEventListener('mouseup', () => {
            dragState = null;
        });
    }

    function makeWindowResizable(windowObj, resizeHandle) {
        let resizeState = null;
        resizeHandle.addEventListener('mousedown', event => {
            if (event.button !== 0) return;
            if (windowObj.maximized) return;
            const rect = windowObj.el.getBoundingClientRect();
            resizeState = {
                startX: event.clientX,
                startY: event.clientY,
                width: rect.width,
                height: rect.height
            };
            setActiveWindow(windowObj.id);
            event.preventDefault();
        });

        document.addEventListener('mousemove', event => {
            if (!resizeState) return;
            const dx = event.clientX - resizeState.startX;
            const dy = event.clientY - resizeState.startY;
            const width = Math.max(360, Math.min(window.innerWidth - 20, resizeState.width + dx));
            const height = Math.max(220, Math.min(window.innerHeight - 70, resizeState.height + dy));
            windowObj.el.style.width = `${width}px`;
            windowObj.el.style.height = `${height}px`;
        });

        document.addEventListener('mouseup', () => {
            resizeState = null;
        });
    }

    function minimizeWindow(windowId) {
        const windowObj = state.winWindows.get(windowId);
        if (!windowObj) return;
        windowObj.minimized = true;
        windowObj.el.style.display = 'none';
        if (state.winActiveWindowId === windowId) state.winActiveWindowId = null;
        updateTaskbarOpenState(windowObj.appId);
    }

    function toggleMaximizeWindow(windowId) {
        const windowObj = state.winWindows.get(windowId);
        if (!windowObj) return;

        if (!windowObj.maximized) {
            const rect = windowObj.el.getBoundingClientRect();
            windowObj.restoreRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
            windowObj.el.classList.add('maximized');
            windowObj.maximized = true;
            return;
        }

        windowObj.el.classList.remove('maximized');
        windowObj.maximized = false;
        if (windowObj.restoreRect) {
            windowObj.el.style.left = `${windowObj.restoreRect.left}px`;
            windowObj.el.style.top = `${windowObj.restoreRect.top}px`;
            windowObj.el.style.width = `${windowObj.restoreRect.width}px`;
            windowObj.el.style.height = `${windowObj.restoreRect.height}px`;
        }
    }

    function closeWindow(windowId) {
        const windowObj = state.winWindows.get(windowId);
        if (!windowObj) return;

        const cleanupHandlers = window.__appCleanupHandlers || {};
        const cleanup = cleanupHandlers[windowObj.appId];
        if (typeof cleanup === 'function') {
            try {
                cleanup(windowObj);
            } catch (err) {
                console.warn(`App cleanup failed for ${windowObj.appId}:`, err);
            }
        }

        if (windowObj.detachOnClose && windowObj.contentNode) {
            windowObj.contentNode.classList.remove('shell-window-host');
            windowObj.contentNode.style.display = 'none';
            document.body.appendChild(windowObj.contentNode);
        }

        windowObj.el.remove();
        state.winWindows.delete(windowId);
        if (state.winActiveWindowId === windowId) state.winActiveWindowId = null;
        removeWindowFromTaskbarState(windowObj);

        const btn = state.winTaskbarButtonsByAppId.get(windowObj.appId);
        if (btn && !state.winPinnedAppIds.has(windowObj.appId)) {
            const stillOpen = Array.from(state.winWindows.values()).some(win => win.appId === windowObj.appId);
            if (!stillOpen) {
                btn.remove();
                state.winTaskbarButtonsByAppId.delete(windowObj.appId);
            }
        }

        window.hideTaskbarPreview();
    }

    function restoreWindow(windowId) {
        const windowObj = state.winWindows.get(windowId);
        if (!windowObj) return;
        windowObj.minimized = false;
        windowObj.el.style.display = 'block';
        setActiveWindow(windowId);
    }

    function createAppWindow({ appId, title, iconUrl, contentHtml, contentNode, detachOnClose = false, theme = '' }) {
        const layer = shell.ensureWindowLayer();
        if (!layer) return null;

        shell.ensureTaskbarButtonForApp(appId);

        const id = `win-${++state.winWindowCounter}`;
        const wrapper = document.createElement('section');
        wrapper.className = 'win-app-window';
        wrapper.dataset.windowId = id;
        wrapper.dataset.appId = appId;
        if (theme) wrapper.classList.add(`theme-${theme}`);
        wrapper.style.left = `${80 + (state.winWindowCounter % 5) * 28}px`;
        wrapper.style.top = `${70 + (state.winWindowCounter % 4) * 22}px`;

        const header = document.createElement('header');
        header.className = 'win-app-window-titlebar';

        const titleWrap = document.createElement('div');
        titleWrap.className = 'win-app-window-title';

        const icon = document.createElement('img');
        icon.className = 'win-app-window-icon';
        icon.alt = title;
        if (iconUrl) {
            icon.src = iconUrl;
            icon.style.display = 'inline-block';
        }

        const titleEl = document.createElement('span');
        titleEl.textContent = title;

        titleWrap.appendChild(icon);
        titleWrap.appendChild(titleEl);

        const actions = document.createElement('div');
        actions.className = 'win-app-window-actions';

        const minBtn = document.createElement('button');
        minBtn.innerHTML = '&#x2212;';
        minBtn.onclick = event => {
            event.stopPropagation();
            minimizeWindow(id);
        };

        const maxBtn = document.createElement('button');
        maxBtn.innerHTML = '&#x2610;';
        maxBtn.onclick = event => {
            event.stopPropagation();
            toggleMaximizeWindow(id);
            setActiveWindow(id);
        };

        const closeBtn = document.createElement('button');
        closeBtn.className = 'danger';
        closeBtn.innerHTML = '&#x2715;';
        closeBtn.onclick = event => {
            event.stopPropagation();
            closeWindow(id);
        };

        actions.appendChild(minBtn);
        actions.appendChild(maxBtn);
        actions.appendChild(closeBtn);

        header.appendChild(titleWrap);
        header.appendChild(actions);

        const body = document.createElement('div');
        body.className = 'win-app-window-body';
        if (contentNode) {
            contentNode.classList.add('shell-window-host');
            body.appendChild(contentNode);
            contentNode.style.display = 'block';
            contentNode.style.height = '100%';
            contentNode.style.width = '100%';
        } else {
            body.innerHTML = contentHtml || '';
        }

        const resizer = document.createElement('div');
        resizer.className = 'win-app-window-resizer';

        wrapper.appendChild(header);
        wrapper.appendChild(body);
        wrapper.appendChild(resizer);
        layer.appendChild(wrapper);

        const windowObj = {
            id,
            appId,
            title,
            iconUrl,
            el: wrapper,
            body,
            minimized: false,
            maximized: false,
            zIndex: 0,
            contentNode,
            detachOnClose,
            restoreRect: null
        };

        wrapper.addEventListener('mousedown', () => setActiveWindow(id));
        makeWindowMovable(windowObj, header);
        makeWindowResizable(windowObj, resizer);

        state.winWindows.set(id, windowObj);
        setActiveWindow(id);
        updateTaskbarOpenState(appId);
        return windowObj;
    }

    function findTopWindowForApp(appId) {
        const windowsForApp = Array.from(state.winWindows.values()).filter(win => win.appId === appId);
        if (windowsForApp.length === 0) return null;
        return windowsForApp.reduce((acc, cur) => (cur.zIndex > acc.zIndex ? cur : acc), windowsForApp[0]);
    }

    shell.updateTaskbarOpenState = updateTaskbarOpenState;
    shell.findTopWindowForApp = findTopWindowForApp;
    shell.createAppWindow = createAppWindow;

    window.minimizeWindow = minimizeWindow;
    window.toggleMaximizeWindow = toggleMaximizeWindow;
    window.closeWindow = closeWindow;
    window.restoreWindow = restoreWindow;
    window.createAppWindow = createAppWindow;
    window.findTopWindowForApp = findTopWindowForApp;
})();
