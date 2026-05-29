const APP_MANIFEST_PATH = './js/Windows/apps.json';
let APP_ASSET_MANIFEST = {};
let _manifestLoadPromise = null;

async function ensureAppManifestLoaded() {
	if (Object.keys(APP_ASSET_MANIFEST).length > 0) {
		return APP_ASSET_MANIFEST;
	}

	if (!_manifestLoadPromise) {
		_manifestLoadPromise = (async () => {
			const response = await fetch(APP_MANIFEST_PATH, { cache: 'no-store' });
			if (!response.ok) {
				throw new Error(`Failed to load app manifest: ${APP_MANIFEST_PATH}`);
			}

			const manifest = await response.json();
			if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
				throw new Error(`Invalid app manifest format: ${APP_MANIFEST_PATH}`);
			}

			APP_ASSET_MANIFEST = manifest;
			window.APP_ASSET_MANIFEST = APP_ASSET_MANIFEST;
			return APP_ASSET_MANIFEST;
		})();
	}

	try {
		return await _manifestLoadPromise;
	} catch (err) {
		_manifestLoadPromise = null;
		throw err;
	}
}


const _loadedStyleHrefs = new Set();
const _loadedScriptSrcs = new Set();
const _loadedConfigs = new Set();
const _htmlCache = new Map();
const _configJsonCache = new Map();
let _dispatchUserLoginComplete = false;
let _appStyleLoadEpoch = 0;

async function fetchConfig(configPath) {
	if (!configPath) return null;
	if (_configJsonCache.has(configPath)) {
		return _configJsonCache.get(configPath);
	}
	const response = await fetch(configPath, { cache: 'no-store' });
	if (!response.ok) {
		throw new Error(`Failed to load config: ${configPath}`);
	}
	const config = await response.json();
	_configJsonCache.set(configPath, config);
	return config;
}

function normalizeAppName(appName) {
	if (!appName) return '';
	const key = String(appName).trim();
	if (APP_ASSET_MANIFEST[key]) return key;
	const fallback = Object.keys(APP_ASSET_MANIFEST).find(name => name.toLowerCase() === key.toLowerCase());
	return fallback || key;
}

function ensureContainer(containerId, parent) {
	let el = document.getElementById(containerId);
	if (!el) {
		el = document.createElement('div');
		el.id = containerId;
		(parent || document.head || document.documentElement).appendChild(el);
	}
	return el;
}

function isLocalAssetHref(href) {
	return !!href && !/^(?:https?:)?\/\//i.test(href) && !/^data:/i.test(href);
}

function ensureStylesheetLink(href) {
	if (!href) return;
	const baseHref = href.split('?')[0];
	const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(link => {
		const raw = link.getAttribute('href') || '';
		const rawBase = raw.split('?')[0];
		return raw === href || rawBase === href || rawBase.endsWith(baseHref.replace(/^\.\//, '')) || raw.endsWith(baseHref.replace(/^\.\//, ''));
	});
	if (exists) return;

	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.href = isLocalAssetHref(href) ? `${href}${href.includes('?') ? '&' : '?'}v=${_appStyleLoadEpoch}` : href;
	link.dataset.bootstrapStyle = 'true';
	(document.head || document.documentElement).appendChild(link);
}

function ensureCoreStylesheets() {
	ensureStylesheetLink('https://cdn.metroui.org.ua/current/metro.css');
	ensureStylesheetLink('https://cdn.metroui.org.ua/current/icons.css');
	ensureStylesheetLink('./css/styles.css');
}

function importStyleOnce(href, appId) {
	if (!href || _loadedStyleHrefs.has(href)) return Promise.resolve();
	const existingStyleLinks = Array.from(document.querySelectorAll('link[data-app-style]')).filter(link => (link.dataset.appStyle || '') === href);
	for (const existingLink of existingStyleLinks) {
		existingLink.remove();
	}

	const styleHost = document.head || document.documentElement;
	const link = document.createElement('link');
	link.rel = 'stylesheet';
	const resolvedHref = /^(?:https?:)?\/\//i.test(href) ? href : `${href}${href.includes('?') ? '&' : '?'}v=${_appStyleLoadEpoch}`;
	link.href = resolvedHref;
	link.dataset.app = appId;
	link.dataset.appStyle = href;

	return new Promise((resolve, reject) => {
		link.onload = () => {
			_loadedStyleHrefs.add(href);
			resolve();
		};
		link.onerror = () => {
			console.warn(`Failed to load stylesheet: ${href}`);
			resolve();
		};
		styleHost.appendChild(link);
	});
}

function importScriptOnce(src, appId) {
	if (!src || _loadedScriptSrcs.has(src)) return Promise.resolve();
	const localSrc = /^(?:https?:)?\/\//i.test(src) ? src : `${src}${src.includes('?') ? '&' : '?'}v=${_appStyleLoadEpoch}`;
	const resolvedSrc = new URL(localSrc, window.location.href).href;
	const existingScript = Array.from(document.querySelectorAll('script[src]')).find(tag => {
		try {
			return new URL(tag.getAttribute('src'), window.location.href).href === resolvedSrc;
		} catch (_) {
			return false;
		}
	});
	if (existingScript) {
		_loadedScriptSrcs.add(src);
		return Promise.resolve();
	}
	if (document.querySelector(`script[data-app-script="${src}"]`)) {
		_loadedScriptSrcs.add(src);
		return Promise.resolve();
	}

	const scriptHost = ensureContainer('scriptsImportArea', document.body || document.documentElement);
	const script = document.createElement('script');
	script.src = localSrc;
	script.defer = true;
	script.dataset.app = appId;
	script.dataset.appScript = src;

	return new Promise((resolve, reject) => {
		script.onload = () => {
			_loadedScriptSrcs.add(src);
			resolve();
		};
		script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
		scriptHost.appendChild(script);
	});
}

async function applyConfigOnce(configPath) {
	if (!configPath || _loadedConfigs.has(configPath)) return;
	const config = await fetchConfig(configPath);
	if (!config) return;

	if (config?.sound_urls) {
		window.SOUND_URLS = { ...window.SOUND_URLS, ...config.sound_urls };
	}
	if (config?.supabase?.supabaseUrl) {
		window.supabaseUrl = config.supabase.supabaseUrl;
	}
	if (config?.supabase?.supabaseKey) {
		window.supabaseKey = config.supabase.supabaseKey;
	}
	if (Array.isArray(config?.vars?.inVehicleOptions)) {
		window.inVehicleOptions = [...config.vars.inVehicleOptions];
	}
	if (Array.isArray(config?.vars?.unitStatusOptions)) {
		window.unitStatusOptions = [...config.vars.unitStatusOptions];
	}
	if (config?.vars?.unitCycleState) {
		window.unitCycleState = {
			invehicle: Number(config.vars.unitCycleState.invehicle) || 0,
			enroute: Number(config.vars.unitCycleState.enroute) || 0
		};
	}
	if (typeof config?.flags?.loadByDefault === 'boolean') {
		window.loadByDefault = config.flags.loadByDefault;
	}
	if (typeof config?.flags?.loginEnabled === 'boolean') {
		window.loginEnabled = config.flags.loginEnabled;
	}

	_loadedConfigs.add(configPath);
}

async function findLoadByDefaultApp() {
	await ensureAppManifestLoaded();
	for (const [appId, appConfig] of Object.entries(APP_ASSET_MANIFEST)) {
		if (appConfig?.flags?.loadByDefault === true) {
			return appId;
		}
		if (!appConfig?.configPath) continue;
		try {
			const config = await fetchConfig(appConfig.configPath);
			if (config?.flags?.loadByDefault === true) {
				return appId;
			}
		} catch (err) {
			console.warn(`Unable to read config for ${appId}:`, err);
		}
	}
	return null;
}

async function mountHtmlOnce(htmlPath) {
	if (!htmlPath) return;

	const mount = document.getElementById('appContentMount');
	if (!mount) {
		throw new Error('App content mount not found (#appContentMount).');
	}

	if (!_htmlCache.has(htmlPath)) {
		const response = await fetch(htmlPath, { cache: 'no-store' });
		if (!response.ok) {
			throw new Error(`Failed to load app html: ${htmlPath}`);
		}
		_htmlCache.set(htmlPath, await response.text());
	}
	const html = _htmlCache.get(htmlPath) || '';
	mount.innerHTML = html;
}

function showDispatchUiOnly() {
	const loginArea = document.getElementById('loginArea');
	if (loginArea) loginArea.style.display = 'none';

	const appRoot = document.getElementById('premierOneApp');
	if (appRoot) appRoot.style.display = 'block';

	const titleBar = document.getElementById('titleBar');
	if (titleBar) titleBar.style.display = 'block';

	ensureDispatchUserLoginPanel();
	_dispatchUserLoginComplete = false;
	configureDispatchKeyPrompt();

	const dispatchUserLoginArea = document.getElementById('dispatchUserLoginArea');
	if (dispatchUserLoginArea) dispatchUserLoginArea.style.display = 'flex';

	const dispatchLoginArea = document.getElementById('dispatchLoginArea');
	if (dispatchLoginArea) dispatchLoginArea.style.display = 'none';

	const dispatchingArea = document.getElementById('dispatchingArea');
	if (dispatchingArea) dispatchingArea.classList.remove('dispatch-active');

	const mainApp = document.getElementById('mainApp');
	if (mainApp) mainApp.style.display = 'none';

	const inputUserDataArea = document.getElementById('inputUserDataArea');
	if (inputUserDataArea) inputUserDataArea.style.display = 'none';

	const appLoginArea = document.getElementById('appLoginArea');
	if (appLoginArea) appLoginArea.style.display = 'none';

	const homeFoot = document.getElementById('home-foot');
	if (homeFoot) homeFoot.style.display = 'none';
}

function configureDispatchKeyPrompt() {
	const dispatchLoginArea = document.getElementById('dispatchLoginArea');
	if (!dispatchLoginArea) return;

	const heading = dispatchLoginArea.querySelector('h2');
	if (heading) heading.textContent = 'Dispatch Key';

	const emailEl = document.getElementById('dispatch-email-input');
	if (emailEl) {
		emailEl.value = '';
		emailEl.style.display = 'none';
	}

	const pwdEl = document.getElementById('dispatch-password-input');
	if (pwdEl) {
		pwdEl.value = '';
		pwdEl.placeholder = 'Enter Dispatch Key';
		pwdEl.type = 'password';
	}

	const submitBtn = dispatchLoginArea.querySelector('button');
	if (submitBtn) submitBtn.textContent = 'Submit Key';
}

function ensureDispatchUserLoginPanel() {
	if (document.getElementById('dispatchUserLoginArea')) return;

	const dispatchLoginArea = document.getElementById('dispatchLoginArea');
	if (!dispatchLoginArea || !dispatchLoginArea.parentElement) return;

	const panel = document.createElement('div');
	panel.id = 'dispatchUserLoginArea';
	panel.style.display = 'none';
	panel.style.alignItems = 'center';
	panel.style.justifyContent = 'center';
	panel.style.padding = '20px';
	panel.innerHTML = `
		<div class="login-box">
			<div class="align-center">
				<h2 style="margin-top: 0; margin-bottom: 20px; text-align: center;">User Login</h2>
				<input id="dispatch-user-email" type="email" data-role="input" placeholder="Email"
					style="margin-bottom: 15px !important; border-radius: 0 !important;"
					onkeydown="if(event.key === 'Enter') submitDispatchUserLogin();">
				<input id="dispatch-user-password" type="password" data-role="input" placeholder="Password"
					style="margin-bottom: 15px !important; border-radius: 0 !important;"
					onkeydown="if(event.key === 'Enter') submitDispatchUserLogin();">
				<button class="button bg-dark fg-white"
					style="width: auto; margin: 6px auto 0; border-radius: 0 !important;"
					onclick="submitDispatchUserLogin()">Continue</button>
				<p id="dispatch-user-login-error" style="color: #c80000; margin-top: 8px; min-height: 18px;"></p>
			</div>
		</div>
	`;

	dispatchLoginArea.parentElement.insertBefore(panel, dispatchLoginArea);
}

function submitDispatchUserLogin() {
	const emailEl = document.getElementById('dispatch-user-email');
	const passwordEl = document.getElementById('dispatch-user-password');
	const errEl = document.getElementById('dispatch-user-login-error');
	if (!emailEl || !passwordEl || !errEl) return;

	const email = String(emailEl.value || '').trim();
	const password = String(passwordEl.value || '').trim();
	errEl.textContent = '';

	if (!email || !password) {
		errEl.textContent = 'Please enter both email and password.';
		return;
	}

	if (!window.supabaseKey) {
		errEl.textContent = 'Login service is unavailable.';
		return;
	}

	fetch('https://lgajaitgqqznzlzjazxn.supabase.co/functions/v1/hash-pwd', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'apikey': window.supabaseKey,
			'Authorization': `Bearer ${window.supabaseKey}`
		},
		body: JSON.stringify({ email, password })
	})
		.then(async response => {
			const result = await response.json();
			if (!response.ok || !result.success || !result.token) {
				errEl.textContent = result.error || 'Invalid email or password';
				return;
			}

			sessionStorage.setItem('userToken', result.token);
			sessionStorage.setItem('userInfo', [email, email.split('@')[0], 'DISPATCH', 'dispatch', null]);
			if (typeof refreshSupabaseClient === 'function') {
				await refreshSupabaseClient();
			}

			_dispatchUserLoginComplete = true;
			sessionStorage.setItem('dispatchUserLogin', email);

			const dispatchUserLoginArea = document.getElementById('dispatchUserLoginArea');
			if (dispatchUserLoginArea) dispatchUserLoginArea.style.display = 'none';

			const dispatchLoginArea = document.getElementById('dispatchLoginArea');
			if (dispatchLoginArea) dispatchLoginArea.style.display = 'flex';
			configureDispatchKeyPrompt();
		})
		.catch(err => {
			console.error('Dispatch user login failed:', err);
			errEl.textContent = 'Connection error. Please try again.';
		});
}

async function submitDispatchAppLogin() {
	if (!_dispatchUserLoginComplete) {
		const dispatchUserLoginArea = document.getElementById('dispatchUserLoginArea');
		const dispatchLoginArea = document.getElementById('dispatchLoginArea');
		if (dispatchLoginArea) dispatchLoginArea.style.display = 'none';
		if (dispatchUserLoginArea) dispatchUserLoginArea.style.display = 'flex';
		return;
	}

	const pwdEl = document.getElementById('dispatch-password-input');
	const errEl = document.getElementById('dispatch-login-error');
	if (!pwdEl || !errEl) return;

	const keyValue = String(pwdEl.value || '').trim();
	errEl.textContent = '';

	if (!keyValue) {
		errEl.textContent = 'Please enter dispatch key.';
		return;
	}

	const jwtKey = sessionStorage.getItem('userToken');
	if (!jwtKey) {
		errEl.textContent = 'User not authenticated. Please log in again.';
		return;
	}

	try {
		const response = await fetch('https://lgajaitgqqznzlzjazxn.supabase.co/functions/v1/verify-key', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${jwtKey}`
			},
			body: JSON.stringify({
				keyName: 'DISPATCH KEY',
				userKey: keyValue
			})
		});

		const result = await response.json();
		if (!response.ok || !result.success) {
			errEl.textContent = result.error || 'Incorrect key. Please try again.';
			return;
		}

		if (result.token) {
			sessionStorage.setItem('userToken', result.token);
			if (typeof refreshSupabaseClient === 'function') {
				await refreshSupabaseClient();
			}
		}

		const dispatchUserLogin = sessionStorage.getItem('dispatchUserLogin');
		if (dispatchUserLogin) {
			sessionStorage.setItem('dispatchOperatorName', dispatchUserLogin);
		}

		const dispatchLoginArea = document.getElementById('dispatchLoginArea');
		if (dispatchLoginArea) dispatchLoginArea.style.display = 'none';

		const dispatchingArea = document.getElementById('dispatchingArea');
		if (dispatchingArea) dispatchingArea.classList.add('dispatch-active');

		if (typeof initDispatcherOverlay === 'function') {
			await initDispatcherOverlay();
		}
	} catch (err) {
		console.error('Dispatch login failed:', err);
		errEl.textContent = 'Could not contact login service.';
	}
}

async function launchDispatchFromWifi(event) {
	if (event && typeof event.stopPropagation === 'function') {
		event.stopPropagation();
	}
	if (typeof dismissMenus === 'function') {
		dismissMenus();
	}

	await openApp('PremierOneCAD');
	showDispatchUiOnly();
}

/**
 * Opens any application.
 * @param {string} appName - The application id from APP_ASSET_MANIFEST.
 * @returns {Promise<boolean>}
 */
async function openApp(appName) {
	ensureCoreStylesheets();
	_appStyleLoadEpoch += 1;
	APP_ASSET_MANIFEST = {};
	_manifestLoadPromise = null;
	_loadedStyleHrefs.clear();
	_loadedScriptSrcs.clear();
	_htmlCache.clear();
	_configJsonCache.clear();
	document.querySelectorAll('script[data-app-script]').forEach(script => script.remove());
	await ensureAppManifestLoaded();
	const appId = normalizeAppName(appName);
	const appConfig = APP_ASSET_MANIFEST[appId];

	if (!appConfig) {
		console.warn(`openApp: Unknown app id "${appName}".`);
		return false;
	}

	await applyConfigOnce(appConfig.configPath);
	await mountHtmlOnce(appConfig.htmlPath);

	for (const href of appConfig.styles || []) {
		await importStyleOnce(href, appId);
	}

	for (const src of appConfig.scripts || []) {
		await importScriptOnce(src, appId);
	}

	const appRoot = document.getElementById(appConfig.rootId || 'premierOneApp');
	if (appRoot) appRoot.style.display = 'block';
	const titleBar = document.getElementById('titleBar');
	if (titleBar) {
		const isWindowsShell = !!document.getElementById('windowsHome');
		titleBar.style.display = isWindowsShell ? 'none' : 'flex';
	}

	const titleEl = document.getElementById('appTitle');
	if (titleEl && appConfig.title) {
		titleEl.textContent = ` ${appConfig.title}`;
	}
	const iconEl = document.getElementById('appIcon');
	if (iconEl && appConfig.iconUrl) {
		iconEl.src = appConfig.iconUrl;
		iconEl.alt = appConfig.title || appId;
	}

	const dispatchingArea = document.getElementById('dispatchingArea');
	if (dispatchingArea && appId !== 'PremierOneCAD') {
		dispatchingArea.classList.remove('dispatch-active');
		dispatchingArea.style.display = 'none';
	}

	window.__activeAppId = appId;
	if (appId === 'PremierOneCAD' && typeof initDispatcherOverlay === 'function') {
		await initDispatcherOverlay();
	}
	if (appId === 'PremierOneMDT' && typeof initPremierOneMDT === 'function') {
		await initPremierOneMDT();
	}
	if (typeof appConfig.initFunction === 'string' && typeof window[appConfig.initFunction] === 'function') {
		await window[appConfig.initFunction]();
	}
	return true;
}

window.APP_ASSET_MANIFEST = APP_ASSET_MANIFEST;
window.openApp = openApp;
window.launchDispatchFromWifi = launchDispatchFromWifi;
window.submitDispatchUserLogin = submitDispatchUserLogin;
window.submitDispatchAppLogin = submitDispatchAppLogin;
window.escapeHtml = window.escapeHtml || function escapeHtml(str) {
	return String(str ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
};

document.addEventListener('DOMContentLoaded', async function () {
	try {
		const appId = await findLoadByDefaultApp();
		if (!appId) {
			const loginArea = document.getElementById('loginArea');
			if (loginArea) loginArea.style.display = 'flex';
			return;
		}

		await openApp(appId);

		const loginArea = document.getElementById('loginArea');
		if (loginArea) loginArea.style.display = 'none';
		const titleBar = document.getElementById('titleBar');
		if (titleBar) {
			const isWindowsShell = !!document.getElementById('windowsHome');
			titleBar.style.display = isWindowsShell ? 'none' : 'block';
		}

		if (appId === 'PremierOneCAD') {
			showDispatchUiOnly();
		} else {
			const dispatchLoginArea = document.getElementById('dispatchLoginArea');
			if (dispatchLoginArea) dispatchLoginArea.style.display = 'none';
			const dispatchingArea = document.getElementById('dispatchingArea');
			if (dispatchingArea) dispatchingArea.classList.remove('dispatch-active');

			const appLoginArea = document.getElementById('appLoginArea');
			const inputUserDataArea = document.getElementById('inputUserDataArea');
			const mainApp = document.getElementById('mainApp');
			const homeFoot = document.getElementById('home-foot');
			const loginEnabled = window.loginEnabled !== false;

			if (loginEnabled) {
				if (appLoginArea) appLoginArea.style.display = 'flex';
				if (inputUserDataArea) inputUserDataArea.style.display = 'none';
				if (mainApp) mainApp.style.display = 'none';
				if (homeFoot) homeFoot.style.display = 'none';
			} else {
				if (appLoginArea) appLoginArea.style.display = 'none';
				if (inputUserDataArea) inputUserDataArea.style.display = 'none';
				if (mainApp) mainApp.style.display = 'flex';
				if (homeFoot) homeFoot.style.display = 'flex';
				if (typeof updateView === 'function') {
					await updateView('incidentsView');
				}
			}
		}
	} catch (err) {
		console.error('Default app auto-load failed:', err);
	}
});