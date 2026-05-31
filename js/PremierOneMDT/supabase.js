"use strict";

const sbAnonClient = createSupabaseClient({
    storageKey: 'sb-lgajaitgqqznzlzjazxn-anon-auth-token'
});

let sbClient = sbAnonClient;
let sbClientToken = null;
let rlsClient = null;
let rlsClientToken = null;

//-- Create supabase helper --\\
function createSupabaseClient({ token = null, storageKey = 'sb-lgajaitgqqznzlzjazxn-anon-auth-token' } = {}) {
    const options = {
        auth: {
            storageKey,
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    };

    if (token) {
        options.global = {
            headers: {
                Authorization: `Bearer ${token}`
            }
        };
    }

    return window.supabase.createClient(supabaseUrl, supabaseKey, options);
}

//-- Get user token helper --\\
function getRlsClient() {
    const token = sessionStorage.getItem('userToken');
    if (!token) throw new Error('No active auth token found.');
    if (!rlsClient || rlsClientToken !== token) {
        rlsClient = createSupabaseClient({
            token,
            storageKey: 'sb-lgajaitgqqznzlzjazxn-rls-auth-token'
        });
        rlsClientToken = token;
    }
    return rlsClient;
}

//-- Sync supabase session --\\
async function syncSupabaseSession() {
    const token = sessionStorage.getItem('userToken');
    if (typeof unsubscribeDispatchLiveMonitor === 'function') {
        await unsubscribeDispatchLiveMonitor();
    }
    if (token) {
        if (!sbClientToken || sbClientToken !== token) {
            sbClient = createSupabaseClient({
                token,
                storageKey: 'sb-lgajaitgqqznzlzjazxn-app-auth-token'
            });
            sbClientToken = token;
        }
        try {
            sbClient.realtime.setAuth(token);
        } catch (e) {
            console.warn('Realtime auth sync failed:', e);
        }
    }
    if (!token) {
        sbClient = sbAnonClient;
        sbClientToken = null;
        rlsClient = null;
        rlsClientToken = null;
    }
    return sbClient;
}

//-- Refresh after login/logout --\\
async function refreshSupabaseClient() {
    await syncSupabaseSession();
    if (typeof dispatchRuntimeInitialized !== 'undefined' && dispatchRuntimeInitialized && typeof setupDispatchLiveMonitor === 'function') {
        await setupDispatchLiveMonitor();
    }
    return sbClient;
}

//-- get authr headers helper --\\
function getSupabaseAuthHeaders(extraHeaders = {}) {
    const token = sessionStorage.getItem('userToken');
    if (!token) throw new Error('No active auth token found.');
    return {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${token}`,
        ...extraHeaders
    };
}

//-- Clear auth state on logoff --\\
function clearAuthState() {
    const activeClient = sbClient;
    sessionStorage.removeItem('userToken');
    sessionStorage.removeItem('userInfo');
    sessionStorage.removeItem('robloxUsername');
    sbClient = sbAnonClient;
    sbClientToken = null;
    rlsClient = null;
    rlsClientToken = null;
    // Reset client to anon state
    try {
        if (activeClient && activeClient.auth) {
            activeClient.auth.signOut();
        }
    } catch (e) {
        console.warn('Supabase signOut cleanup failed:', e);
    }
}
