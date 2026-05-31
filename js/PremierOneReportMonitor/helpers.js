function createRecordsSupabaseClient(token) {
    if (!window.supabase || !window.supabaseUrl || !window.supabaseKey) return null;

    const options = {
        auth: {
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

    return window.supabase.createClient(window.supabaseUrl, window.supabaseKey, options);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getSbClient() {
    const verified = sessionStorage.getItem('p1rAuthVerified') === '1';
    if (!verified) return null;

    const token = sessionStorage.getItem('p1rUserToken');
    if (token && (!window.sbClient || window.__p1rSbClientToken !== token)) {
        const client = createRecordsSupabaseClient(token);
        if (client) {
            window.sbClient = client;
            window.__p1rSbClientToken = token;
        }
    }

    if (!window.sbClient && window.sbAnonClient) {
        window.sbClient = window.sbAnonClient;
        window.__p1rSbClientToken = null;
    }

    return window.sbClient || window.sbAnonClient || null;
}

function parseDateSafe(value) {
    const d = new Date(value || 0);
    if (Number.isNaN(d.getTime())) return 0;
    return d.getTime();
}

function formatDateTime(value) {
    if (!value) return '--';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
}

function textFromUnknown(value) {
    if (Array.isArray(value)) return value.map(v => String(v || '')).join('\n');
    if (typeof value === 'object' && value !== null) return JSON.stringify(value, null, 2);
    return String(value || '');
}

function downloadBlob(fileName, blob, type) {
    const payload = blob instanceof Blob ? blob : new Blob([String(blob || '')], { type: type || 'text/plain' });
    const url = URL.createObjectURL(payload);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

async function loadLocalConfig(defaultConfig) {
    try {
        const res = await fetch('./js/PremierOneReportMonitor/config.json', { cache: 'no-store' });
        if (!res.ok) return { ...defaultConfig };
        const parsed = await res.json();
        return {
            ...defaultConfig,
            ...parsed,
            records: {
                ...(defaultConfig.records || {}),
                ...(parsed.records || {})
            }
        };
    } catch {
        return { ...defaultConfig };
    }
}

function setButtonState(el, enabled) {
    if (!el) return;
    el.disabled = !enabled;
}

function openModal(state, modalId) {
    const root = state.root;
    root.querySelectorAll('.p1r-modal').forEach(m => m.classList.add('hidden'));
    const target = root.querySelector(`#${modalId}`);
    if (target) target.classList.remove('hidden');
}

function closeModals(state) {
    state.root.querySelectorAll('.p1r-modal').forEach(m => m.classList.add('hidden'));
}

function closeMenus(state) {
    const fileMenu = state.root.querySelector('#p1r-file-menu');
    const viewMenu = state.root.querySelector('#p1r-view-menu');
    if (fileMenu) fileMenu.classList.add('hidden');
    if (viewMenu) viewMenu.classList.add('hidden');
}

function updateUserBadge(state) {
    const badge = state.root.querySelector('#p1r-user-badge');
    if (!badge) return;
    const roleText = state.isSupervisor ? 'Supervisor' : 'Standard';
    badge.textContent = `${state.userEmail || 'Unknown'} (${roleText})`;
}

function setNavActive(state, page) {
    state.root.querySelectorAll('.p1r-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-page') === page);
    });
}

function renderCards(items, escapeHtmlFn) {
    return `
            <div class="p1r-card-grid">
                ${items.map(item => `
                    <article class="p1r-card">
                        <div class="p1r-card-title">${escapeHtmlFn(item.title)}</div>
                        <div>${escapeHtmlFn(item.body)}</div>
                    </article>
                `).join('')}
            </div>
        `;
}

function setContent(state, title, html, dataPayload) {
    const titleEl = state.root.querySelector('#p1r-content-title');
    const bodyEl = state.root.querySelector('#p1r-content-body');
    const tabTitle = state.root.querySelector('#p1r-tab-title');
    if (titleEl) titleEl.textContent = title;
    if (tabTitle) tabTitle.textContent = title;
    if (bodyEl) bodyEl.innerHTML = html;
    state.lastData = dataPayload || null;
}

function buildReportStatusPill(statusValue) {
    const raw = String(statusValue || '').toLowerCase();
    let cls = 'pending';
    let label = 'PENDING';
    if (raw === 'approved' || raw === 'accepted') {
        cls = 'approved';
        label = 'APPROVED';
    } else if (raw === 'declined' || raw === 'denied' || raw === 'rejected') {
        cls = 'denied';
        label = 'DENIED';
    }
    return `<span class="p1r-status-pill ${cls}">${label}</span>`;
}

function deriveDisposition(callRow, textFromUnknownFn) {
    const historyText = textFromUnknownFn(callRow?.history);
    const delimiter = '--------------------';
    if (!historyText.includes(delimiter)) return '';
    const chunks = historyText.split(delimiter).map(v => v.trim()).filter(Boolean);
    if (chunks.length) return chunks[chunks.length - 1];
    const commentsText = textFromUnknownFn(callRow?.comments).trim();
    return commentsText || '';
}

function normalizeTypeKey(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function filterReportsByKeywords(reports, keys, normalizeTypeKeyFn) {
    const tokens = keys.map(normalizeTypeKeyFn);
    return reports.filter(row => {
        const key = normalizeTypeKeyFn(row?.type);
        return tokens.some(t => key.includes(t));
    });
}

function renderSimpleReportTable(rows, emptyText, deps) {
    const { escapeHtml, formatDateTime, buildReportStatusPill } = deps;
    if (!rows.length) return `<div class="p1r-muted">${escapeHtml(emptyText)}</div>`;
    return `
            <div class="p1r-table-wrap">
                <table class="p1r-table">
                    <thead>
                        <tr>
                            <th>SUBMITTED ON</th>
                            <th>USER</th>
                            <th>REPORT #</th>
                            <th>TYPE</th>
                            <th>STATUS</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(row => `
                            <tr class="clickable" data-action="open-report-detail" data-report-id="${escapeHtml(row.report_id)}">
                                <td>${escapeHtml(formatDateTime(row.completed_at))}</td>
                                <td>${escapeHtml(row.user || '--')}</td>
                                <td>${escapeHtml(row.report_id || '--')}</td>
                                <td>${escapeHtml(row.type || '--')}</td>
                                <td>${buildReportStatusPill(row.status)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
}

function renderCallTable(rows, emptyText, deps) {
    const { escapeHtml, formatDateTime, deriveDisposition } = deps;
    if (!rows.length) return `<div class="p1r-muted">${escapeHtml(emptyText)}</div>`;
    return `
            <div class="p1r-table-wrap">
                <table class="p1r-table">
                    <thead>
                        <tr>
                            <th>SUBMITTED ON</th>
                            <th>USER</th>
                            <th>INCIDENT #</th>
                            <th>TYPE</th>
                            <th>DETAIL</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(row => `
                            <tr>
                                <td>${escapeHtml(formatDateTime(row.created_at))}</td>
                                <td>${escapeHtml(row.logged_by || '--')}</td>
                                <td>${escapeHtml(row.incid || row.id || '--')}</td>
                                <td>${escapeHtml(row.call_type || '--')}</td>
                                <td>${escapeHtml(row.beat || deriveDisposition(row) || '--')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
}

function getPstNow() {
    return new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
}
