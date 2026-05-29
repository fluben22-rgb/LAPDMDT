
//-- hash helper --\\
function hashString(value) {
    let hash = 0;
    const input = String(value || '');
    for (let i = 0; i < input.length; i += 1) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

//-- Create pfp for emps --\\
function buildEmployeeAvatar(label) {
    const text = String(label || '').trim();
    const initials = text
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0])
        .join('')
        .toUpperCase() || 'U';
    const hue = hashString(text) % 360;
    const bgA = `hsl(${hue}, 48%, 58%)`;
    const bgB = `hsl(${(hue + 24) % 360}, 44%, 44%)`;
    return `<div class="p1r-avatar" style="background: linear-gradient(135deg, ${bgA}, ${bgB});">${initials}</div>`;
}

//-- Calls specific renderers and functions --\\
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

function renderEmployeeFile(result, serial, escapeHtml) {
    const fallbackName = [result?.FName, result?.LName].map(part => String(part || '').trim()).filter(Boolean).join(' ');
    const name = String(result?.name || fallbackName || serial || 'Unknown').trim();

    return `
            <div class="p1r-card">
                <div class="p1r-inline-row" style="align-items:center; gap:12px; margin-bottom:10px;">
                    ${buildEmployeeAvatar(name || serial)}
                    <div>
                        <div class="p1r-card-title" style="margin:0;">${escapeHtml(name || serial)}</div>
                        <div class="p1r-muted">Employee Record</div>
                    </div>
                </div>
                <table class="p1r-table p1r-detail-table" style="min-width:0; width:100%;">
                    <tbody>
                        <tr><th>Full Name</th><td>${escapeHtml(name || '--')}</td></tr>
                        <tr><th>Serial</th><td>${escapeHtml(serial)}</td></tr>
                    </tbody>
                </table>
                <div class="p1r-card-title" style="margin-top:12px;">Attendance Record</div>
                ${renderPresenceList(result?.presence, escapeHtml)}
            </div>
        `;
}

function renderCivilianRecord(data, term, escapeHtml) {
    const { name, gender, age, alerts } = normalizeCivilianRecord(data, term, data?.alerts);
    const alertClass = (alerts !== 'NONE' && alerts !== 'None') ? 'denied' : 'approved';

    return `
            <div class="p1r-card">
                <div style="margin-bottom:10px;">
                    <div class="p1r-card-title" style="margin:0;">${escapeHtml(name)}</div>
                    <div class="p1r-muted">Civilian Record</div>
                </div>
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
}



async function fetchFromCallsTable(sb, tableName) {
    let result = await sb
        .from(tableName)
        .select('id, created_at, logged_by, beat, call_type, comments, history, location, last4')
        .order('created_at', { ascending: false });

    if (!result.error) return result;

    result = await sb
        .from(tableName)
        .select('*')
        .order('created_at', { ascending: false });
    return result;
}

async function fetchCalls(state, deps) {
    const { getSbClient } = deps;
    const sb = getSbClient();
    if (!sb) return [];

    let data = null;
    let error = null;

    ({ data, error } = await fetchFromCallsTable(sb, 'calls'));
    if (error) {
        ({ data, error } = await fetchFromCallsTable(sb, 'Calls'));
    }

    if (error) {
        console.error('P1 Records calls fetch error after fallbacks:', error);
        return [];
    }

    return data || [];
};

function renderIncidentDetail(state, incidentId, deps) {
    const row = (state.cachedCalls || []).find(call => String(call.id) === String(incidentId) || String(call.incid || '') === String(incidentId));
    if (!row) {
        deps.setContent(state, 'Incident Detail', `<div class="p1r-muted">No incident found for ${deps.escapeHtml(incidentId)}.</div>`, { page: 'incident-detail', incidentId });
        return;
    }

    const fields = [
        ['Incident #', row.incid || row.id || '--'],
        ['Submitted On', deps.formatDateTime(row.created_at)],
        ['User', row.logged_by || '--'],
        ['Beat', row.beat || '--'],
        ['Call Type', row.call_type || '--'],
        ['Location', row.location || '--'],
        ['Last4', row.last4 || '--'],
        ['Comments', row.comments || '--'],
        ['History', row.history || '--']
    ];

    const html = `
            <div class="p1r-card">
                <div class="p1r-inline-row p1r-live-toolbar">
                    <div class="p1r-live-badge">Calls live monitor initialized</div>
                    <button class="p1r-btn" data-action="refresh-live-view">Refresh</button>
                </div>
                <div class="p1r-card-title">Incident ${deps.escapeHtml(row.incid || row.id || '--')}</div>
                <table class="p1r-table p1r-detail-table" style="min-width:0; width:100%;">
                    <tbody>
                        ${fields.map(([label, value]) => `<tr><th>${deps.escapeHtml(label)}</th><td>${deps.escapeHtml(String(value ?? ''))}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
        `;

    deps.setContent(state, 'Incident Detail', html, { page: 'incident-detail', incident: row });
};

async function renderCallsByTypePage(state, page, deps) {
    const calls = await fetchCalls(state, deps);
    state.cachedCalls = calls;

    if (page === 'calls-for-service') {
        const rows = calls.filter(c => String(c?.beat || '').trim().length > 0);
        deps.setContent(state, 'Calls for Service', deps.renderCallTable(rows, 'No calls with beat assignments found.'), { page, rows });
        return;
    }

    const rows = calls.filter(c => String(c?.call_type || '').trim().toUpperCase() === 'C6');
    deps.setContent(state, 'Field Investigations', deps.renderCallTable(rows, 'No field investigations found.'), { page, rows });
};

//-- render dispos based on history fields --\\
async function renderAllOfficerDispositions(state, deps) {
    const calls = await fetchCalls(state, deps);
    state.cachedCalls = calls;
    const dispositionDelimiter = '--------------------\n';
    const rows = calls
        .filter(call => String(call?.history || '').includes(dispositionDelimiter))
        .map(call => ({
            submittedOn: call.created_at,
            user: call.logged_by || '--',
            incident: call.id || '--',
            disposition: deps.deriveDisposition(call)
        }))
        .filter(r => r.disposition)
        .sort((a, b) => new Date(b.submittedOn || 0).getTime() - new Date(a.submittedOn || 0).getTime());

    const html = rows.length ? `
            <div class="p1r-table-wrap">
                <table class="p1r-table">
                    <thead>
                        <tr>
                            <th>SUBMITTED ON</th>
                            <th>USER</th>
                            <th>INCIDENT #</th>
                            <th>DISPOSITION</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(row => `
                            <tr>
                                <td>${deps.escapeHtml(deps.formatDateTime(row.submittedOn))}</td>
                                <td>${deps.escapeHtml(row.user)}</td>
                                <td><button class="p1r-link-btn" data-action="open-incident-detail" data-incident-id="${deps.escapeHtml(row.incident)}">${deps.escapeHtml(row.incident)}</button></td>
                                <td>${deps.escapeHtml(row.disposition)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        ` : '<div class="p1r-muted">No dispositions found.</div>';

    deps.setContent(state, 'All Officer Dispositions', html, { page: 'all-officer-dispositions', rows });
};

async function runAdvancedSearch(state, deps) {
    const input = state.root.querySelector('#p1r-advanced-input');
    const incidentRaw = String(input?.value || '').trim();
    if (!incidentRaw) {
        alert('Enter a full incident id.');
        return;
    }

    const sb = deps.getSbClient();
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

    deps.closeModals(state);

    if (error || !data) {
        deps.setContent(state, 'Advanced Search', `<div class="p1r-muted">No incident record found for ${deps.escapeHtml(incidentRaw)}.</div>`, { page: 'advanced-search', incidentRaw });
        return;
    }

    const html = `
            <div class="p1r-card p1r-incident-file">
                <div class="p1r-card-title">Incident Search Result</div>
                <div class="p1r-table-wrap" style="max-height:none;">
                    <table class="p1r-table" style="min-width:0; width:100%;">
                        <tbody>
                            ${Object.entries(data || {}).map(([key, value]) => `<tr><th>${deps.escapeHtml(String(key).replace(/_/g, ' ').toUpperCase())}</th><td>${deps.escapeHtml(Array.isArray(value) ? value.join(', ') : (value && typeof value === 'object' ? Object.values(value).filter(Boolean).join(', ') : String(value ?? '--')))}</td></tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    deps.setContent(state, 'Advanced Search', html, { page: 'advanced-search', data });
};

async function runSerialSearch(state, deps) {
    const input = state.root.querySelector('#p1r-serial-input');
    const serial = String(input?.value || '').trim();
    if (!serial) {
        alert('Enter a serial number.');
        return;
    }

    const sb = deps.getSbClient();
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

    deps.closeModals(state);

    if (error || !row) {
        deps.setContent(state, 'Employee Search', `<div class="p1r-muted">No employee record found for serial ${deps.escapeHtml(serial)}.</div>`, { page: 'serial-search', serial });
        return;
    }

    const html = renderEmployeeFile(row, serial, deps.escapeHtml);
    deps.setContent(state, 'Employee Search', html, { page: 'serial-search', row });
};

async function runQuickQuery(state, deps) {
    const input = state.root.querySelector('#p1r-query-input');
    const term = String(input?.value || '').trim();
    if (!term) {
        alert('Enter a player ID or name.');
        return;
    }

    const sb = deps.getSbClient();
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
        deps.setContent(state, 'Query', `<div class="p1r-muted">Error querying player record: ${deps.escapeHtml(queryError.message || String(queryError))}.</div>`, { page: 'query', term, error: queryError.message });
        return;
    }

    if (!data) {
        deps.setContent(state, 'Query', `<div class="p1r-muted">No player record found for ${deps.escapeHtml(term)}.</div>`, { page: 'query', term });
        return;
    }

    const alerts = await fetchPlayerAlerts(sb, term);
    const record = {
        ...data,
        alerts
    };
    const html = renderCivilianRecord(record, term, deps.escapeHtml);
    deps.setContent(state, 'Query', html, { page: 'query', row: record });
};
