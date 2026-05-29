// renderReportsByTypePage = FOR CONFIG PAGES (accident, booking, citations, impounds)
// renderAllOfficerReports = FOR SUPERVISOR VIEW OF ALL REPORTS WITH FILTERING
// renderReportDetail = FOR RENDERING THE DETAIL PAGE OF A SINGLE REPORT


async function fetchFromReportsTable(sb, tableName) {
    let result = await sb
        .from(tableName)
        .select('report_id, user, type, status, completed_at, inc_id, fields, denial_reason')
        .order('completed_at', { ascending: false });

    if (!result.error) return result;

    // Fallback for schema drift between environments.
    result = await sb
        .from(tableName)
        .select('*')
        .order('completed_at', { ascending: false });
    return result;
}

function normalizeTypeKey(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeStatus(value) {
    return String(value || '').trim().toUpperCase();
}

function isDeniedStatus(value) {
    const normalized = normalizeStatus(value);
    return normalized === 'DENIED' || normalized === 'DECLINED' || normalized === 'REJECTED';
}

function isPendingStatus(value) {
    return normalizeStatus(value) === 'PENDING';
}

function isApprovedStatus(value) {
    const normalized = normalizeStatus(value);
    return normalized === 'APPROVED' || normalized === 'ACCEPTED';
}

function reportMatchesKeys(report, normalizedKeys) {
    const key = normalizeTypeKey(report?.type);
    return normalizedKeys.some(expected => key.includes(expected));
}

function formatValueOnly(value) {
    if (Array.isArray(value)) {
        return value.map(formatValueOnly).filter(Boolean).join(', ');
    }
    if (value && typeof value === 'object') {
        return Object.values(value).map(formatValueOnly).filter(Boolean).join(', ');
    }
    return String(value ?? '').trim();
}

function renderReadableValue(value, deps) {
    if (value == null || value === '') {
        return '<span class="p1r-muted">--</span>';
    }

    if (Array.isArray(value)) {
        if (!value.length) {
            return '<span class="p1r-muted">--</span>';
        }

        if (value.every(item => item == null || typeof item !== 'object')) {
            return `<ul class="p1r-readable-list">${value.map(item => `<li>${deps.escapeHtml(String(item))}</li>`).join('')}</ul>`;
        }

        return `<div class="p1r-readable-stack">${value.map((item, index) => `
                <div class="p1r-readable-block">
                    <div class="p1r-readable-block-title">Item ${index + 1}</div>
                    ${renderReadableValue(item, deps)}
                </div>
            `).join('')}</div>`;
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value);
        if (!entries.length) {
            return '<span class="p1r-muted">--</span>';
        }

        return `
                <table class="p1r-table p1r-structured-table">
                    <tbody>
                        ${entries.map(([key, item]) => `
                            <tr>
                                <th>${deps.escapeHtml(String(key).replace(/_/g, ' ').toUpperCase())}</th>
                                <td>${renderReadableValue(item, deps)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
    }

    return deps.escapeHtml(String(value));
}

function buildReportSummaryRows(row, deps) {
    const summary = [
        ['User', row.user || '--'],
        ['Type', row.type || '--'],
        ['Status', deps.buildReportStatusPill(row.status)],
        ['Incident', row.inc_id || '--'],
        ['Submitted', deps.formatDateTime(row.completed_at)],
        ['Denial Reason', row.denial_reason || '--']
    ];

    return summary.map(([label, value]) => `<tr><th>${deps.escapeHtml(label)}</th><td>${value}</td></tr>`).join('');
}

async function fetchReports(state, deps) {
    const { getSbClient } = deps;
    const sb = getSbClient();
    if (!sb) return [];

    let data = null;
    let error = null;

    ({ data, error } = await fetchFromReportsTable(sb, 'reports'));
    if (error) {
        ({ data, error } = await fetchFromReportsTable(sb, 'Reports'));
    }

    if (error) {
        console.error('P1 Records reports fetch error after fallbacks:', error);
        return [];
    }

    return data || [];
};

async function renderReportsByTypePage(state, page, deps) {
    const reports = await fetchReports(state, deps);
    state.cachedReports = reports;

    const pageDef = {
        accident: { title: 'Accident', keys: ['chp555'] },
        booking: { title: 'Booking', keys: ['ARRESTREPT', 'ARRESTREPORT'] },
        citations: { title: 'Citations', keys: ['noticeToAppear'] },
        impounds: { title: 'Impounds', keys: ['chp180'] }
    }[page];

    if (!pageDef) return;

    const normalizedKeys = pageDef.keys.map(normalizeTypeKey);
    const rows = reports.filter(report => reportMatchesKeys(report, normalizedKeys));
    deps.setContent(state, pageDef.title, deps.renderSimpleReportTable(rows, `No ${pageDef.title.toLowerCase()} records found.`), {
        page,
        rows
    });
};

async function renderAllOfficerReports(state, deps, filterMode) {
    const reports = await fetchReports(state, deps);
    const activeFilter = filterMode || state.officerReportsFilter || 'pending';
    state.officerReportsFilter = activeFilter;

    const nonDenied = reports.filter(row => !isDeniedStatus(row?.status));
    const ordered = nonDenied.slice().sort((a, b) => {
        const aRank = isPendingStatus(a?.status) ? 0 : (isApprovedStatus(a?.status) ? 1 : 2);
        const bRank = isPendingStatus(b?.status) ? 0 : (isApprovedStatus(b?.status) ? 1 : 2);
        if (aRank !== bRank) return aRank - bRank;
        return deps.parseDateSafe(b?.completed_at) - deps.parseDateSafe(a?.completed_at);
    });

    const visible = ordered.filter(row => {
        if (activeFilter === 'approved') return isApprovedStatus(row?.status);
        if (activeFilter === 'pending') return isPendingStatus(row?.status);
        return true;
    });

    state.cachedReports = ordered;
    const html = `
            <div class="p1r-inline-row" style="margin-bottom: 8px;">
                <button class="p1r-btn ${activeFilter === 'pending' ? 'p1r-filter-active' : ''}" data-action="reports-filter-pending">Pending</button>
                <button class="p1r-btn ${activeFilter === 'approved' ? 'p1r-filter-active' : ''}" data-action="reports-filter-approved">Approved</button>
                <button class="p1r-btn ${activeFilter === 'all' ? 'p1r-filter-active' : ''}" data-action="reports-filter-all">All Non-Denied</button>
            </div>
            ${deps.renderSimpleReportTable(visible, 'No reports found for this filter.')}
        `;
    deps.setContent(state, 'All Officer Reports', html, { page: 'all-officer-reports', rows: visible, filter: activeFilter });
};

function renderReportDetail(state, reportId, deps) {
    const row = (state.cachedReports || []).find(r => String(r.report_id) === String(reportId));
    if (!row) {
        alert('Unable to locate selected report.');
        return;
    }
    const showDeny = !!state.isSupervisor && !isDeniedStatus(row.status);
    const detailRows = Object.entries(row.fields && typeof row.fields === 'object' ? row.fields : {})
        .map(([key, value]) => `<tr><th>${deps.escapeHtml(String(key).replace(/_/g, ' ').toUpperCase())}</th><td>${renderReadableValue(value, deps)}</td></tr>`)
        .join('');
    const html = `
            <div class="p1r-card">
                <div class="p1r-inline-row p1r-live-toolbar">
                    <div class="p1r-live-badge">Reports live monitor initialized</div>
                    <button class="p1r-btn" data-action="refresh-live-view">Refresh</button>
                </div>
                <div class="p1r-card-title">Report #${deps.escapeHtml(row.report_id || '--')}</div>
                <div class="p1r-muted" style="margin-bottom:10px;">${deps.escapeHtml(row.type || '--')} • ${deps.escapeHtml(deps.formatDateTime(row.completed_at))}</div>
                <table class="p1r-table p1r-detail-table" style="min-width: 0; width: 100%;">
                    <tbody>
                        ${buildReportSummaryRows(row, deps)}
                    </tbody>
                </table>
                <div class="p1r-card-title" style="margin-top:12px;">Details</div>
                ${detailRows ? `<div class="p1r-table-wrap"><table class="p1r-table"><tbody>${detailRows}</tbody></table></div>` : '<div class="p1r-muted">No structured report fields found.</div>'}
                ${isDeniedStatus(row.status) && (row.denial_reason || (row.fields && row.fields.denial_reason)) ? `
                    <div class="p1r-card-title" style="margin-top:12px;">Denial</div>
                    <div class="p1r-inline-row" style="margin-top:8px; align-items:center; gap:8px;">
                        <span class="p1r-status-pill denied">DENIED</span>
                        <button class="p1r-btn" data-action="open-report-denial-reason" data-report-id="${deps.escapeHtml(row.report_id)}">View Denial Reason</button>
                    </div>
                ` : ''}
                ${showDeny ? `
                    <div class="p1r-card-title" style="margin-top:12px;">Supervisor Review</div>
                    <div class="p1r-inline-row" style="margin-top:8px;">
                        <button class="p1r-btn p1r-btn-primary" data-action="open-report-approve" data-report-id="${deps.escapeHtml(row.report_id)}">Approve Report</button>
                        <button class="p1r-btn p1r-btn-danger" data-action="open-report-deny" data-report-id="${deps.escapeHtml(row.report_id)}">Deny Report</button>
                    </div>
                ` : ''}
            </div>
        `;
    deps.setContent(state, `Report ${row.report_id}`, html, { page: 'report-detail', report: row });

    if (isDeniedStatus(row.status) && (row.denial_reason || (row.fields && row.fields.denial_reason)) && state.lastDeniedReasonShownReportId !== String(row.report_id)) {
        if (typeof deps.openDeniedReasonModal === 'function') {
            deps.openDeniedReasonModal(state, row);
        }
    }
};

async function approveReport(state, reportId, deps) {
    const sb = deps.getSbClient();
    if (!sb) {
        return { ok: false, message: 'Database is unavailable.' };
    }

    const { error } = await sb
        .from('reports')
        .update({
            status: 'APPROVED',
            denial_reason: null
        })
        .eq('report_id', reportId);

    if (error) {
        console.error('Failed to approve report:', error);
        return { ok: false, message: error.message || 'Failed to approve report.' };
    }

    return { ok: true, message: 'Report approved.' };
};

async function denyReport(state, reportId, reason, deps) {
    const sb = deps.getSbClient();
    if (!sb) {
        return { ok: false, message: 'Database is unavailable.' };
    }

    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) {
        return { ok: false, message: 'Denial reason is required.' };
    }

    const existing = (state.cachedReports || []).find(r => String(r.report_id) === String(reportId));
    const currentFields = existing && typeof existing.fields === 'object' && existing.fields !== null
        ? existing.fields
        : {};
    const nextFields = {
        ...currentFields,
        denial_reason: trimmedReason,
        denied_by: state.userEmail || 'Supervisor',
        denied_at: new Date().toISOString()
    };

    const { error } = await sb
        .from('reports')
        .update({
            status: 'DENIED',
            denial_reason: trimmedReason,
            fields: nextFields
        })
        .eq('report_id', reportId);

    if (error) {
        console.error('Failed to deny report:', error);
        return { ok: false, message: error.message || 'Failed to deny report.' };
    }

    return { ok: true, message: 'Report denied.' };
};
