// openWindowsApp = ADD PER APP CONFIGS HERE

let winLoginInFlight = false;

// global funcs used by shell menus and windows
const _shellAppHtmlCache = new Map();
const _shellAppScriptLoaded = new Set();
const _shellAppStyleLoaded = new Set();

//-- Loader --\\
function initBootSequence() {
    const boot = document.getElementById('bootscreen');
    if (!boot) {
        document.body.classList.remove('booting');
        return;
    }

    boot.classList.add('is-active');
    setTimeout(() => {
        boot.classList.remove('is-active');
        document.body.classList.remove('booting');
    }, 1650);
}

function setWinLoginLoading(isLoading) {
    const pwd = document.getElementById('win-pwd');
    const pwdContainer = document.getElementById('win-pwd-container');
    const loadingContainer = document.getElementById('win-loading-container');

    if (pwd) pwd.disabled = !!isLoading;
    if (pwdContainer) pwdContainer.style.display = isLoading ? 'none' : 'flex';
    if (loadingContainer) {
        if (isLoading) loadingContainer.classList.add('active');
        else loadingContainer.classList.remove('active');
    }
}

//-- Login w/ shop # --\\
async function tryLogin() {
    if (winLoginInFlight) return;

    const pwd = document.getElementById('win-pwd');
    const err = document.getElementById('win-logon-error');
    const rawShop = (pwd?.value || '').trim();

    err.textContent = '';
    if (typeof sbAnonClient === 'undefined' || !sbAnonClient) {
        err.textContent = 'Login service is unavailable. Please refresh and try again.';
        return;
    }

    if (!/^\d+$/.test(rawShop)) {
        err.textContent = 'Invalid Formatting';
        return;
    }

    const shopNumber = Number.parseInt(rawShop, 10);
    winLoginInFlight = true;
    setWinLoginLoading(true);
    try {
        const { data, error } = await sbAnonClient
            .from('veh_fleet')
            .select('*')
            .eq('SHOP', shopNumber)
            .limit(1);

        if (error) {
            console.error('Supabase login query error:', error);
            err.textContent = error.message || 'Login service error';
            setWinLoginLoading(false);
            winLoginInFlight = false;
            return;
        }

        if (!data || data.length === 0) {
            err.textContent = 'Incorrect password';
            setWinLoginLoading(false);
            winLoginInFlight = false;
        } else {
            await showLoaderSequence();
        }
    } catch (e) {
        console.error('Login error:', e);
        err.textContent = 'An error occurred during login. Please try again.';
        setWinLoginLoading(false);
        winLoginInFlight = false;
    }
}

//-- Loader Sequence (spin glitched...) --\\
async function showLoaderSequence() {
    const err = document.getElementById('win-logon-error');

    try {
        await new Promise(resolve => setTimeout(resolve, 700));

        const loginArea = document.getElementById('loginArea');
        if (loginArea) loginArea.style.display = 'none';

        window.showWindowsHome();

        winLoginInFlight = false;
    } catch (errObj) {
        console.error('Failed to initialize desktop:', errObj);
        if (err) err.textContent = 'Unable to open desktop. Please try again.';
        setWinLoginLoading(false);
        winLoginInFlight = false;
    }
}

function buildPlaceholderHtml(title, text) {
    return `<div style="padding:18px;font:14px/1.5 'Segoe UI',sans-serif;color:#20314f;">${title}: ${text}</div>`;
}

//-- Load an app in a shell window --\\
async function loadShellAppHtml(htmlPath) {
    if (!htmlPath) return '';
    if (_shellAppHtmlCache.has(htmlPath)) return _shellAppHtmlCache.get(htmlPath);

    const response = await fetch(htmlPath, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to load shell app html: ${htmlPath}`);
    }

    const html = await response.text();
    _shellAppHtmlCache.set(htmlPath, html);
    return html;
}

//-- Add an app's scripts and styles if no rpesent --\\
async function loadShellAppScriptOnce(scriptPath) {
    if (!scriptPath || _shellAppScriptLoaded.has(scriptPath)) return;

    const resolvedSrc = new URL(scriptPath, window.location.href).href;
    const existing = Array.from(document.querySelectorAll('script[src]')).find(tag => {
        try {
            return new URL(tag.getAttribute('src'), window.location.href).href === resolvedSrc;
        } catch (_) {
            return false;
        }
    });

    if (existing) {
        _shellAppScriptLoaded.add(scriptPath);
        return;
    }

    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.defer = true;
        script.onload = () => {
            _shellAppScriptLoaded.add(scriptPath);
            resolve();
        };
        script.onerror = () => reject(new Error(`Failed to load shell app script: ${scriptPath}`));
        document.body.appendChild(script);
    });
}

async function loadShellAppStyleOnce(stylePath, appId) {
    if (!stylePath) return;

    const styleKey = `${appId}:${stylePath}`;
    if (_shellAppStyleLoaded.has(styleKey)) return;

    const resolvedHref = new URL(stylePath, window.location.href).href;
    const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find(link => {
        try {
            const linkHref = (link.getAttribute('href') || '').split('?')[0];
            return new URL(linkHref, window.location.href).href === resolvedHref.split('?')[0];
        } catch (_) {
            return false;
        }
    });

    if (existing) {
        _shellAppStyleLoaded.add(styleKey);
        return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = stylePath;
    link.dataset.app = appId;
    link.dataset.appStyle = stylePath;

    await new Promise(resolve => {
        link.onload = () => resolve();
        link.onerror = () => {
            console.warn(`Failed to load app stylesheet: ${stylePath}`);
            resolve();
        };
        (document.head || document.documentElement).appendChild(link);
    });

    _shellAppStyleLoaded.add(styleKey);
}

async function loadShellAppStyles(styles, appId) {
    if (!Array.isArray(styles) || styles.length === 0) return;
    for (const stylePath of styles) {
        await loadShellAppStyleOnce(stylePath, appId);
    }
}

async function loadShellAppScripts(options, appId) {
    const scripts = Array.isArray(options.scripts) && options.scripts.length
        ? options.scripts
        : (options.scriptPath ? [options.scriptPath] : []);

    for (const scriptPath of scripts) {
        await loadShellAppScriptOnce(scriptPath, appId);
    }
}

async function openShellHtmlApp(appId, appMeta, options) {
    const existing = window.findTopWindowForApp(appId);
    if (existing) {
        window.restoreWindow(existing.id);
        return existing;
    }

    try {
        await loadShellAppStyles(options.styles, appId);

        const html = await loadShellAppHtml(options.htmlPath);
        const shellWindow = window.createAppWindow({
            appId,
            title: appMeta.label || options.title || appId,
            iconUrl: appMeta.iconUrl,
            contentHtml: html,
            theme: options.theme || '',
            initialRect: options.initialRect || null
        });

        await loadShellAppScripts(options, appId);

        if (options.initName && typeof window[options.initName] === 'function') {
            window[options.initName](shellWindow);
        }
        return shellWindow;
    } catch (err) {
        console.error(`Failed to open ${appId}:`, err);
        return window.createAppWindow({
            appId,
            title: appMeta.label || options.title || appId,
            iconUrl: appMeta.iconUrl,
            contentHtml: buildPlaceholderHtml(appMeta.label || appId, 'Unable to load app content.')
        });
    }
}

//-- Main app launcher --\\
async function openWindowsApp(appId) {
    window.dismissMenus();

    const home = document.getElementById('windowsHome');
    if (home) home.style.display = 'block';

    const appMeta = window.getAppMeta(appId);

    if (appId === 'PremierOneMDT') {
        const existing = window.findTopWindowForApp(appId);
        if (existing) {
            window.restoreWindow(existing.id);
            return;
        }

        if (typeof openApp !== 'function') {
            window.createAppWindow({
                appId,
                title: appMeta.label || 'PremierOne MDT',
                iconUrl: appMeta.iconUrl,
                contentHtml: buildPlaceholderHtml('PremierOne MDT', 'App loader unavailable.')
            });
            return;
        }

        const opened = await openApp('PremierOneMDT');
        if (opened === false) {
            window.createAppWindow({
                appId,
                title: appMeta.label || 'PremierOne MDT',
                iconUrl: appMeta.iconUrl,
                contentHtml: buildPlaceholderHtml('PremierOne MDT', 'Unable to load app content.')
            });
            return;
        }

        const appRoot = document.getElementById('premierOneApp');
        if (!appRoot) {
            window.createAppWindow({
                appId,
                title: appMeta.label || 'PremierOne MDT',
                iconUrl: appMeta.iconUrl,
                contentHtml: buildPlaceholderHtml('PremierOne MDT', 'App root not found after load.')
            });
            return;
        }

        window.createAppWindow({
            appId,
            title: appMeta.label || 'PremierOne MDT',
            iconUrl: appMeta.iconUrl,
            contentNode: appRoot,
            detachOnClose: true,
            theme: 'mdt'
        });
        return;
    }

    // ALT CONFIGS HERE FOR SPECIAL HANDALING

    if (appId === 'Google') {
        await openShellHtmlApp(appId, appMeta, {
            title: 'Google',
            htmlPath: './html/Google/app.html',
            scriptPath: './js/Google/index.js',
            initName: 'initGoogleApp',
            theme: 'dark'
        });
        return;
    }

    if (appId === 'Notepad') {
        await openShellHtmlApp(appId, appMeta, {
            title: 'Notepad',
            htmlPath: './html/Notepad/app.html',
            scriptPath: './js/Notepad/index.js',
            initName: 'initNotepadApp',
            theme: 'dark'
        });
        return;
    }

    if (appId === 'MobileMap' || appId === 'MOBILEMAP') {
        const mobileMapWindow = await openShellHtmlApp(appId, appMeta, {
            title: 'MOBILE MAP',
            htmlPath: './html/MobileMap/app.html',
            styles: ['./css/MobileMap/app.css'],
            scriptPath: './js/MobileMap/index.js',
            initName: 'initMobileMapApp',
            theme: 'mobile-map',
            initialRect: {
                left: 8,
                top: 20,
                width: 'min(1040px, calc(100vw - 16px))',
                height: 'min(560px, calc(100vh - 90px))'
            }
        });
        if (mobileMapWindow && !mobileMapWindow.maximized) {
            mobileMapWindow.el.classList.add('maximized');
            mobileMapWindow.maximized = true;
            mobileMapWindow.el.dispatchEvent(new CustomEvent('shell-window-resize', { bubbles: true }));
        }
        return;
    }

    if (appId === 'Outlook') {
        await openShellHtmlApp(appId, appMeta, {
            title: 'Outlook',
            htmlPath: './html/Outlook/app.html',
            scriptPath: './js/Outlook/index.js',
            initName: 'initOutlookApp'
        });
        return;
    }

    if (appId === 'PremierOneReportMonitor') {
        await openShellHtmlApp(appId, appMeta, {
            title: 'Premier One Report Monitor',
            htmlPath: './html/PremierOneReportMonitor/app.html',
            styles: ['./css/PremierOneReportMonitor/app.css'],
            scripts: [
                './js/PremierOneReportMonitor/helpers.js',
                './js/PremierOneReportMonitor/user-management.js',
                './js/PremierOneReportMonitor/attendence.js',
                './js/PremierOneReportMonitor/calls.js',
                './js/PremierOneReportMonitor/export.js',
                './js/PremierOneReportMonitor/reports.js',
                './js/PremierOneReportMonitor/logon.js',
                './js/PremierOneReportMonitor/index.js'
            ],
            initName: 'initReportMonitorApp'
        });
        return;
    }

    window.createAppWindow({
        appId,
        title: appMeta.label || appId,
        iconUrl: appMeta.iconUrl,
        contentHtml: buildPlaceholderHtml(appMeta.label || appId, 'This app is not implemented yet.')
    });
}

// click listeners after this point and misc 

document.addEventListener('click', function (event) {
    if (!event.target.closest('#win-bottom-buttons') && !event.target.closest('#startMenu') && !event.target.closest('#startMenuTrigger')) {
        window.dismissMenus();
    }
});

document.addEventListener('mousemove', event => {
    const preview = document.getElementById('taskbarPreview');
    if (!preview || !preview.classList.contains('active')) return;

    const isOverPreview = preview.matches(':hover');
    const isOverTaskButton = event.target && event.target.closest && event.target.closest('.win-task-btn');
    if (!isOverPreview && !isOverTaskButton) {
        window.hideTaskbarPreview();
    }
});

window.openWindowsApp = openWindowsApp;
window.tryLogin = tryLogin;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initBootSequence();
        window.renderHomeSurface();
    }, { once: true });
} else {
    initBootSequence();
    window.renderHomeSurface();
}

document.addEventListener('contextmenu', window.showDesktopContextMenu);
