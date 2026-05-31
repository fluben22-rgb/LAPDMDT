//-- App Login --\\
async function submitAppLogin() {
    const email = document.getElementById('app-email-input').value.trim();
    const password = document.getElementById('app-password-input').value.trim();
    const errorEl = document.getElementById('app-login-error');
    errorEl.textContent = '';

    if (!email || !password) {
        errorEl.textContent = 'Please enter both email and password';
        return;
    }

    try {
        const response = await fetch('https://lgajaitgqqznzlzjazxn.supabase.co/functions/v1/hash-pwd', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({ email, password })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            errorEl.textContent = result.error || 'Invalid email or password';
            return;
        }

        sessionStorage.setItem('userToken', result.token);
        if (typeof refreshSupabaseClient === 'function') await refreshSupabaseClient();

        let role = 'unit';
        try {
            const payloadBase64 = result.token.split('.')[1];
            const decodedPayload = JSON.parse(atob(payloadBase64));
            role = decodedPayload.user_role || 'unit';
        } catch (e) {
            console.warn('Failed to parse role from token payload:', e);
        }

        // Save role at index 3 instead of null
        sessionStorage.setItem('userInfo', [email, email.split('@')[0], null, role, null]);

        document.getElementById('appLoginArea').style.display = 'none';
        document.getElementById('inputUserDataArea').style.display = 'flex';

    } catch (e) {
        console.error('App login error:', e);
        errorEl.textContent = 'Connection error. Please try again.';
    }
}

//-- User Data Login --\\
async function submitUserData() {
    const callsignInput = document.getElementById('callsign-input');
    const watchInput = document.getElementById('watch-input');
    const errorEl = document.getElementById('user-data-error');
    if (errorEl) errorEl.textContent = '';

    const callsign = callsignInput ? callsignInput.value.trim() : '';
    const watch = watchInput ? watchInput.value.trim() : '';

    const currentUser = sessionStorage.getItem('userInfo') ? sessionStorage.getItem('userInfo').split(',')[0] : null;
    const userToken = sessionStorage.getItem('userToken');

    if (!callsign || !watch) {
        if (errorEl) errorEl.textContent = 'Please fill in all fields';
        else alert('Please fill in all fields');
        return;
    }

    if (!currentUser || !userToken) {
        if (errorEl) errorEl.textContent = 'No active user session found. Please log in again.';
        else alert('No active user session found. Please log in again.');
        return;
    }

    try {
        if (errorEl) errorEl.textContent = 'Saving unit information...';
        const response = await fetch('https://lgajaitgqqznzlzjazxn.supabase.co/functions/v1/handle-unit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${userToken}` // Custom minted JWT from submitAppLogin
            },
            body: JSON.stringify({ callsign, watch })
        });


        const result = await response.json();

        if (!response.ok || !result.success) {
            console.error('Error saving unit data:', result.error);
            if (errorEl) errorEl.textContent = 'Failed to save unit data: ' + (result.error || 'Access denied');
            else alert('An error occurred while saving your data: ' + (result.error || 'Access denied'));
            return;
        }
        if (errorEl) errorEl.textContent = '';

        // Success logic continues normally
        let storedData = sessionStorage.getItem('userInfo');
        if (storedData) {
            storedData = storedData.split(',');
            storedData[2] = `${callsign}-${watch}`;
            sessionStorage.setItem('userInfo', storedData.join(','));
        }

        const inputArea = document.getElementById('inputUserDataArea');
        const robloxGpsArea = document.getElementById('robloxGpsArea');

        if (inputArea) inputArea.style.display = 'none';
        if (robloxGpsArea) robloxGpsArea.style.display = 'flex';

        const robloxInput = document.getElementById('roblox-username-input');
        if (robloxInput) robloxInput.focus();

    } catch (e) {
        console.error('Error saving unit data:', e);
        if (errorEl) errorEl.textContent = 'Failed to save unit data. Please try again.';
        else alert('An error occurred while saving your data. Please try again.');
    }
}

async function submitRobloxGpsUsername() {
    const input = document.getElementById('roblox-username-input');
    const errorEl = document.getElementById('roblox-gps-error');
    const currentUser = sessionStorage.getItem('userInfo') ? sessionStorage.getItem('userInfo').split(',')[0] : null;
    const robloxUsername = input ? input.value.trim() : '';

    if (errorEl) errorEl.textContent = '';

    if (!robloxUsername) {
        if (errorEl) errorEl.textContent = 'Enter Roblox username for GPS tracking.';
        return;
    }

    if (!currentUser) {
        if (errorEl) errorEl.textContent = 'No active user session found. Please log in again.';
        return;
    }

    try {
        if (errorEl) errorEl.textContent = 'Saving GPS username...';
        const { error: gpsUserError } = await sbClient
            .from('units')
            .update({ roblox_username: robloxUsername })
            .eq('user', currentUser);

        if (gpsUserError) {
            console.error('Error saving Roblox GPS username:', gpsUserError);
            if (errorEl) errorEl.textContent = 'Failed to save Roblox username for GPS tracking.';
            return;
        }

        if (errorEl) errorEl.textContent = '';
        sessionStorage.setItem('robloxUsername', robloxUsername);
        await finishUnitLogin();
    } catch (e) {
        console.error('Error saving Roblox GPS username:', e);
        if (errorEl) errorEl.textContent = 'Failed to save Roblox username for GPS tracking.';
    }
}

async function finishUnitLogin() {
        const inputArea = document.getElementById('inputUserDataArea');
        const robloxGpsArea = document.getElementById('robloxGpsArea');
        const mainApp = document.getElementById('mainApp');
        const homeFoot = document.getElementById('home-foot');

        if (inputArea) inputArea.style.display = 'none';
        if (robloxGpsArea) robloxGpsArea.style.display = 'none';
        if (mainApp) mainApp.style.display = 'flex';
        if (homeFoot) homeFoot.style.display = 'flex';

        const currentUserDisplay = document.getElementById('current-user');
        if (currentUserDisplay) {
            const info = sessionStorage.getItem('userInfo');
            const parts = info ? info.split(',') : [];
            currentUserDisplay.textContent = parts[1] ? `${parts[1]} [${parts[2] || ''}]` : '';
        }

        playSound('logon');
        await updateView('incidentsView');
        await setupUnitRequestAlertMonitor();
        startGpsOfflineSequence();
        await logoffRequestLiveMonitor();
}

window.submitAppLogin = submitAppLogin;
window.submitUserData = submitUserData;
window.submitRobloxGpsUsername = submitRobloxGpsUsername;
