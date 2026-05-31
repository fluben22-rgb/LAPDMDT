// submitPasswordRequest = change password req msg here + embed

const LOGGED_ON_COLS = [
    { key: 'serial', label: 'SERIAL', width: '80px' },
    { key: 'name', label: 'NAME', width: '170px' },
    { key: 'callsign', label: 'CALLSIGN', width: '90px' },
    { key: 'is_present', label: 'PRESENT', width: '70px' },
    { key: 'on_loa', label: 'LOA', width: '60px' },
    { key: 'in_time', label: 'IN TIME', width: '130px' },
    { key: 'out_time', label: 'OUT TIME', width: '130px' }
];

async function fetchUnitsRows(deps) {
    const sb = deps.getSbClient();
    if (!sb) return [];

    const result = await sb
        .from('super_unit_mang')
        .select('serial, name, callsign, is_present, on_loa, in_time, out_time')
        .order('name', { ascending: true })
        .limit(500);

    if (!result.error && Array.isArray(result.data) && result.data.length) {
        return result.data;
    }

    return [];
}

async function renderLoggedOnPage(state, deps) {
    const rows = await fetchUnitsRows(deps);
    if (!rows.length) {
        deps.setContent(state, 'Logged On', '<div class="p1r-muted">No units are currently available.</div>', { page: 'logged-on', rows: [] });
        return;
    }

    const html = `
            <div class="p1r-table-wrap p1r-logged-on-wrap">
                <table class="p1r-table p1r-logged-on-table">
                    <colgroup>
                        ${LOGGED_ON_COLS.map(c => `<col style="width:${c.width}; min-width:${c.width};">`).join('\n                        ')}
                    </colgroup>
                    <thead>
                        <tr>${LOGGED_ON_COLS.map(c => `<th style="white-space:nowrap;">${deps.escapeHtml(c.label)}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${rows.map(row => `<tr>${LOGGED_ON_COLS.map(c => `<td>${deps.escapeHtml(row[c.key] == null ? '--' : String(row[c.key]))}</td>`).join('')}</tr>`).join('\n                        ')}
                    </tbody>
                </table>
            </div>
        `;
    deps.setContent(state, 'Logged On', html, { page: 'logged-on', rows });
};

async function submitPasswordRequest(state, deps) {
    const email = String(state.root.querySelector('#p1r-pass-email')?.value || '').trim();
    const reason = String(state.root.querySelector('#p1r-pass-reason')?.value || '').trim();
    const newPassword = String(state.root.querySelector('#p1r-pass-new')?.value || '').trim();

    if (!email || !reason || !newPassword) {
        alert('Fill all fields before sending.');
        return;
    }

    const userToken = sessionStorage.getItem('p1rUserToken');
    if (!userToken) {
        alert('Authentication token missing. Please log in again.');
        return;
    }

    const payloadData = {
        source: 'PremierOne Records',
        requestedBy: state.userEmail,
        targetEmail: email,
        reason,
        newPassword,
        requestedAt: new Date().toISOString()
    };

    let pings = state.config.records.personPingsForWebhook || [];
    let pingString = '';
    if (Array.isArray(pings) && pings.length) {
        pingString = pings.map(id => `<@!${id}>`).join(' ');
    }

    try {
        const edgeFunctionUrl = state.config.supabase.supabaseUrl + '/functions/v1/send-dhook-msg';

        const response = await fetch(edgeFunctionUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'apikey': state.config.supabase.supabaseKey,
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                reqdHook: "pwd reset",
                msg: pingString || undefined,
                embed: [{
                    title: "change me password matey yar",
                    color: 3447003,
                    description: '```json\n' + JSON.stringify(payloadData, null, 2) + '\n```',
                    timestamp: new Date().toISOString()
                }]
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Server rejected request');
        }

        alert('Password change request sent securely.');
        deps.closeModals(state);

    } catch (err) {
        console.error('Secure Discord routing failed:', err);
        alert(`Failed to send request: ${err.message}`);
    }
}