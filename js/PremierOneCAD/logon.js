"use strict";

// CAD Logon Handlers
window.openDispatchFromLauncher = function () { if (typeof openApp === 'function') openApp('PremierOneCAD'); };
window.submitDispatchLogin = function () { if (typeof submitDispatchAppLogin === 'function') submitDispatchAppLogin(); };

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

		let email = sessionStorage.getItem('dispatchUserLogin');

		try {
			const { data, error } = await sbClient
				.from('flags')
				.select('flag')
				.eq('flag', 'dispActive')
				.maybeSingle();

			if (error || !data) {
				console.error('Error fetching dispatch active flag:', error);
			}

			let newData = [data.dispatchers || [] + email];

			const { updateError } = await sbClient
				.from('flags')
				.update({ dispatchers: newData })
				.eq('flag', 'dispActive');

			if (updateError) {
				console.error('Error updating dispatch active flag:', updateError);
			}
		} catch (error) {
			console.error('Error during dispatch active flag update:', error);
		}


		if (typeof initDispatcherOverlay === 'function') {
			await initDispatcherOverlay();
		}
	} catch (err) {
		console.error('Dispatch login failed:', err);
		errEl.textContent = 'Could not contact login service.';
	}
}

window.ensureDispatchUserLoginPanel = ensureDispatchUserLoginPanel;