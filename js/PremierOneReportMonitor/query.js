function formatPresenceDate(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const parsed = new Date(`${text}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return text;
    return parsed.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/Los_Angeles'
    });
}

function renderPresenceList(presence, escapeHtml) {
    const days = Array.isArray(presence) ? presence.map(day => String(day || '').trim()).filter(Boolean) : [];
    if (!days.length) {
        return '<div class="p1r-muted">No attendance history recorded.</div>';
    }

    return `
        <div class="p1r-inline-row" style="margin-top:6px; flex-wrap:wrap; gap:6px;">
            ${days.map(day => `<span class="p1r-status-pill approved">${escapeHtml(formatPresenceDate(day))}</span>`).join('')}
        </div>
    `;
}

function normalizeCivilianRecord(data, term, alertsValue) {
    const fallbackName = [data?.FName, data?.LName]
        .map(part => String(part || '').trim())
        .filter(Boolean)
        .join(' ');
    const name = String(data?.name || data?.full_name || data?.display_name || fallbackName || term || 'Unknown').trim();
    const rawGender = String(data?.gender || data?.Gender || '--').trim();
    const gender = rawGender === 'Male'
        ? 'M - Male'
        : rawGender === 'Female'
            ? 'F - Female'
            : (rawGender || '--');
    const ageValue = data?.age ?? data?.Age;
    const age = String(ageValue ?? '--');
    const alerts = String(alertsValue || data?.alerts || 'NONE');

    return { name, gender, age, alerts };
}

async function fetchPlayerAlerts(sb, playerId) {
    if (!playerId) return 'NONE';

    try {
        const { data, error } = await sb
            .from('Alerts')
            .select('id, alert')
            .eq('id', playerId)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.warn('Alert fetch failed:', error);
            return 'NONE';
        }

        return Array.isArray(data?.alert) && data.alert.length > 0
            ? data.alert.join(', ')
            : 'NONE';
    } catch (error) {
        console.warn('Alert fetch failed:', error);
        return 'NONE';
    }
}

function getCallsModule() {
    if (typeof renderEmployeeFile === 'function') return { renderEmployeeFile };
    if (typeof p1rCalls !== 'undefined') return p1rCalls;
    return null;
}

function renderReadablePersonRecord(data, serial, escapeHtml) {
    const name = String(data?.name || data?.full_name || data?.display_name || serial || 'Unknown').trim();

    return `
        <div class="p1r-card">
            <div class="p1r-card-title">${escapeHtml(name)}</div>
            <div class="p1r-muted" style="margin-bottom:10px;">Employee Record</div>
            <table class="p1r-table p1r-detail-table" style="min-width:0; width:100%;">
                <tbody>
                    <tr><th>Full Name</th><td>${escapeHtml(name)}</td></tr>
                    <tr><th>Serial</th><td>${escapeHtml(serial)}</td></tr>
                </tbody>
            </table>
            <div class="p1r-card-title" style="margin-top:12px;">Attendance Record</div>
            ${renderPresenceList(data?.presence, escapeHtml)}
        </div>
    `;
}

async function runSerialSearch(state, deps) {
    const { getSbClient, closeModals, setContent, escapeHtml } = deps;
    const input = state.root.querySelector('#p1r-serial-input');
    const serial = String(input?.value || '').trim();
    if (!serial) {
        alert('Enter a serial number.');
        return;
    }

    const sb = getSbClient();
    if (!sb) {
        alert('Database is not available.');
        return;
    }

    const { data: row, error } = await sb
        .from('super_unit_mang')
        .select('serial, name, presence')
        .eq('serial', serial)
        .limit(1)
        .maybeSingle();

    closeModals(state);

    if (error || !row) {
        setContent(state, 'Employee Search', `<div class="p1r-muted">No employee record found for serial ${escapeHtml(serial)}.</div>`, { page: 'serial-search', serial });
        return;
    }

    const callsMod = getCallsModule();
    const html = (callsMod && typeof callsMod.renderEmployeeFile === 'function')
        ? callsMod.renderEmployeeFile(row, serial, escapeHtml)
        : renderReadablePersonRecord(row, serial, escapeHtml);
    setContent(state, 'Employee Search', html, { page: 'serial-search', row });
};

async function runAdvancedSearch(state, deps) {
    const { getSbClient, closeModals, setContent, escapeHtml } = deps;
    const input = state.root.querySelector('#p1r-advanced-input');
    const incidentRaw = String(input?.value || '').trim();
    if (!incidentRaw) {
        alert('Enter a full incident id.');
        return;
    }

    const sb = getSbClient();
    if (!sb) {
        alert('Database is not available.');
        return;
    }

    const safe = incidentRaw.replace(/[^a-zA-Z0-9\-]/g, '');
    const numeric = Number.parseInt(safe, 10);
    const orExpr = Number.isNaN(numeric)
        ? `id.eq.${safe},incid.eq.${safe}`
        : `id.eq.${safe},incid.eq.${safe},last4.eq.${numeric}`;

    const { data, error } = await sb
        .from('calls')
        .select('*')
        .or(orExpr)
        .limit(1)
        .maybeSingle();

    closeModals(state);

    if (error || !data) {
        setContent(state, 'Advanced Search', `<div class="p1r-muted">No incident record found for ${escapeHtml(incidentRaw)}.</div>`, { page: 'advanced-search', incidentRaw });
        return;
    }

    const html = `
        <div class="p1r-card">
            <div class="p1r-card-title">Incident Search Result</div>
            <textarea class="p1r-textarea" readonly>${escapeHtml(JSON.stringify(data, null, 2))}</textarea>
        </div>
    `;
    setContent(state, 'Advanced Search', html, { page: 'advanced-search', data });
};

async function runQuickQuery(state, deps) {
    const { getSbClient, escapeHtml, setContent } = deps;
    const input = state.root.querySelector('#p1r-query-input');
    const term = String(input?.value || '').trim();
    if (!term) {
        alert('Enter a person ID or name.');
        return;
    }

    const sb = getSbClient();
    if (!sb) {
        alert('Database is not available.');
        return;
    }

    let data = null;
    let queryError = null;
    try {
        const queryResult = await sb.functions.invoke('query-player', {
            body: { playerId: term }
        });
        if (queryResult?.error && queryResult.error.message !== '404') {
            throw queryResult.error;
        }
        data = queryResult?.data || null;
    } catch (err) {
        if (err?.message !== '404') {
            queryError = err;
        }
    }

    if (queryError) {
        setContent(state, 'Query', `<div class="p1r-muted">Error querying person record: ${escapeHtml(queryError.message || String(queryError))}.</div>`, { page: 'query', term, error: queryError.message });
        return;
    }

    if (!data) {
        setContent(state, 'Query', `<div class="p1r-muted">No person record found for ${escapeHtml(term)}.</div>`, { page: 'query', term });
        return;
    }

    const alerts = await fetchPlayerAlerts(sb, term);
    const record = {
        ...data,
        alerts
    };
    const { name, gender, age } = normalizeCivilianRecord(record, term, alerts);
    const alertClass = (alerts !== 'NONE' && alerts !== 'None') ? 'denied' : 'approved';

    const html = `
        <div class="p1r-card">
            <div class="p1r-card-title">${escapeHtml(name)}</div>
            <div class="p1r-muted" style="margin-bottom:10px;">Person Record</div>
            <div class="p1r-inline-row" style="margin-bottom:10px; flex-wrap:wrap; gap:6px;">
                <span class="p1r-status-pill ${alertClass}">${escapeHtml(alerts)}</span>
            </div>
            <table class="p1r-table p1r-detail-table p1r-query-result-table" style="min-width:0; width:100%;">
                <tbody>
                    <tr><th>Full Name</th><td>${escapeHtml(name)}</td></tr>
                    <tr><th>Alerts</th><td>${escapeHtml(alerts)}</td></tr>
                    <tr><th>Gender</th><td>${escapeHtml(gender)}</td></tr>
                    <tr><th>Age</th><td>${escapeHtml(age)}</td></tr>
                </tbody>
            </table>
        </div>
    `;
    setContent(state, 'Query', html, { page: 'query', row: record });
};
