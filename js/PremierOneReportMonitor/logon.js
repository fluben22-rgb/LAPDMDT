const P1R_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // jwt token expire time (24hr)


//-- clear session storage on app load --\\
function clearRecordsStorage() {
    sessionStorage.removeItem('p1rUserEmail');
    sessionStorage.removeItem('p1rSupervisor');
    sessionStorage.removeItem('p1rAuthVerified');
    sessionStorage.removeItem('p1rSessionIssuedAt');
    sessionStorage.removeItem('p1rUserToken');
}

//-- reserve certain vars in session storage --\\
function setSession(state, token, email, isSupervisor) {
    sessionStorage.setItem('p1rUserEmail', email);
    sessionStorage.setItem('p1rSupervisor', isSupervisor ? '1' : '0');
    sessionStorage.setItem('p1rAuthVerified', '1');
    sessionStorage.setItem('p1rSessionIssuedAt', String(Date.now()));
    if (token) sessionStorage.setItem('p1rUserToken', token);
    state.userEmail = email;
    state.isSupervisor = !!isSupervisor;
};

function clearSession(state) {
    clearRecordsStorage();
    state.userEmail = '';
    state.isSupervisor = false;
    state.pendingEmail = '';
    state.pendingHashToken = '';
};

function showAuthStep(state, step) {
    const hashStep = state.root.querySelector('#p1r-login-step-hash');
    const supStep = state.root.querySelector('#p1r-login-step-supervisor');
    if (hashStep) hashStep.classList.toggle('hidden', step !== 'hash');
    if (supStep) supStep.classList.toggle('hidden', step !== 'supervisor');
};

//-- Handle user logon --\\
async function handleLoginHash(state, hashEndpoint) {
    const email = String(state.root.querySelector('#p1r-email')?.value || '').trim();
    const password = String(state.root.querySelector('#p1r-password')?.value || '').trim();
    const err = state.root.querySelector('#p1r-login-error');
    if (err) err.textContent = '';

    if (!email || !password) {
        if (err) err.textContent = 'Please enter email and password.';
        return false;
    }

    try {
        const res = await fetch(hashEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': window.supabaseKey,
                'Authorization': `Bearer ${window.supabaseKey}`
            },
            body: JSON.stringify({ email, password })
        });
        const result = await res.json();
        if (!res.ok || !result.success || !result.token) {
            if (err) err.textContent = result.error || 'Invalid email or password.';
            return false;
        }

        state.pendingEmail = email;
        state.pendingHashToken = result.token;
        const contextEl = state.root.querySelector('#p1r-login-context');
        if (contextEl) contextEl.textContent = `Authenticated as ${email}. Enter supervisor key to continue.`;
        showAuthStep(state, 'supervisor');

        const supErr = state.root.querySelector('#p1r-supervisor-error');
        if (supErr) supErr.textContent = '';
        const supInput = state.root.querySelector('#p1r-supervisor-key');
        if (supInput) {
            supInput.value = '';
            supInput.focus();
        }
        return true;
    } catch (e) {
        console.error('Records login failed:', e);
        if (err) err.textContent = 'Connection error during login.';
        return false;
    }
};

//-- Handle supervisor key --\\
async function handleLoginSupervisor(state, verifyKeyEndpoint) {
    const supKeyInput = String(state.root.querySelector('#p1r-supervisor-key')?.value || '').trim();
    const err = state.root.querySelector('#p1r-supervisor-error');
    if (err) err.textContent = '';

    if (!state.pendingHashToken || !state.pendingEmail) {
        if (err) err.textContent = 'Session expired. Please authenticate again.';
        showAuthStep(state, 'hash');
        return false;
    }

    if (!supKeyInput) {
        if (err) err.textContent = 'Supervisor key is required.';
        return false;
    }

    try {
        const verifyRes = await fetch(verifyKeyEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.pendingHashToken}`
            },
            body: JSON.stringify({
                keyName: 'INCIDENT ID KEY',
                userKey: supKeyInput
            })
        });

        const verifyData = await verifyRes.json();
        if (!verifyRes.ok || !verifyData.success || !verifyData.token) {
            if (err) err.textContent = verifyData.error || 'Supervisor key verification failed.';
            return false;
        }

        setSession(state, verifyData.token, state.pendingEmail, true);
        state.pendingEmail = '';
        state.pendingHashToken = '';

        if (typeof window.refreshSupabaseClient === 'function') {
            await window.refreshSupabaseClient();
        } else if (typeof window.p1rEnsureSupabaseClients === 'function') {
            await window.p1rEnsureSupabaseClients(window.__p1rRuntimeConfig || null);
        }

        const login = state.root.querySelector('#p1r-login');
        const app = state.root.querySelector('#p1r-app');
        if (login) login.classList.add('hidden');
        if (app) app.classList.remove('hidden');
        return true;
    } catch (e) {
        console.error('Records supervisor verification failed:', e);
        if (err) err.textContent = 'Connection error during supervisor verification.';
        return false;
    }
};

function handleLoginBack(state) {
    state.pendingHashToken = '';
    state.pendingEmail = '';
    const supInput = state.root.querySelector('#p1r-supervisor-key');
    const supErr = state.root.querySelector('#p1r-supervisor-error');
    if (supInput) supInput.value = '';
    if (supErr) supErr.textContent = '';
    showAuthStep(state, 'hash');
};

//-- check for session on app load (comment this out to disable) --\\
function hydrateSession(state) {
    const email = sessionStorage.getItem('p1rUserEmail');
    const verified = sessionStorage.getItem('p1rAuthVerified') === '1';
    const issuedAt = Number.parseInt(sessionStorage.getItem('p1rSessionIssuedAt') || '0', 10);
    const isExpired = !issuedAt || (Date.now() - issuedAt) > P1R_SESSION_MAX_AGE_MS;
    if (isExpired) {
        clearSession(state);
        return false;
    }
    if (!email || !verified) return false;

    state.userEmail = email;
    state.isSupervisor = sessionStorage.getItem('p1rSupervisor') === '1';

    const login = state.root.querySelector('#p1r-login');
    const app = state.root.querySelector('#p1r-app');
    if (login) login.classList.add('hidden');
    if (app) app.classList.remove('hidden');
    return true;
};
