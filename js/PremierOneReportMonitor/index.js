// handleAction = use this to modify what happens when specific action ran
// renderLoby / renderModulePage / renderReportsByTypePageFromModule = use these to modify what the main page looks like when loaded or when a nav item is clicked

const HASH_ENDPOINT = 'https://lgajaitgqqznzlzjazxn.supabase.co/functions/v1/hash-pwd';
const VERIFY_KEY_ENDPOINT = 'https://lgajaitgqqznzlzjazxn.supabase.co/functions/v1/verify-key';
// DEFAULT CONFIG FOR IF JSON DOES NOT LOAD OR IS MISSING PROPERTIES
const DEFAULT_CONFIG = {
    supabase: {
        supabaseUrl: 'https://lgajaitgqqznzlzjazxn.supabase.co',
        supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnYWphaXRncXF6bnpsemphenhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDg2NzQsImV4cCI6MjA4NTg4NDY3NH0.Sm_Y4XiwCwjVtdvNEALNsDNY4EDGVI2KIWXkp3VdmfQ'
    },
    records: {
        helpUrl: "https://www.motorolasolutions.com/en_us/products/command-center-software/public-safety-software/premierone/premierone-records.html",
        rosterUrl: "https://docs.google.com/spreadsheets/d/1XRuIfXciAG1-QAc9NbesWCqMLwaPQ4k9vPookpyUaus/edit?usp=sharing",
        attendanceSheetUrl: "",
        discordWebhook: "https://ptb.discord.com/api/webhooks/1508598380472045638/Wwtk7__WtIV3IsPjMr-UaJUe9MQeMFen5JRcE37Mfwux_EDry2S-h1vuphAl_yfbT8D0",
        personPingsForWebhook: ["1005989535265607821", "422170397379657730", "552838050955264010"]
    }
};

//-- create supabase client for records --\\
function createSupabaseClientForRecords(token) {
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

async function ensureSupabaseClients(config) {
    if (!window.supabase) return false;

    const cfgUrl = config?.supabase?.supabaseUrl || window.supabaseUrl;
    const cfgKey = config?.supabase?.supabaseKey || window.supabaseKey;
    if (!cfgUrl || !cfgKey) return false;

    window.supabaseUrl = cfgUrl;
    window.supabaseKey = cfgKey;

    if (!window.sbAnonClient) {
        window.sbAnonClient = createSupabaseClientForRecords(null);
    }

    const token = sessionStorage.getItem('p1rUserToken');
    if (token) {
        if (!window.sbClient || window.__p1rSbClientToken !== token) {
            window.sbClient = createSupabaseClientForRecords(token) || window.sbAnonClient;
            window.__p1rSbClientToken = token;
        }
    } else if (!window.sbClient) {
        window.sbClient = window.sbAnonClient || null;
        window.__p1rSbClientToken = null;
    }

    return !!window.sbClient;
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
        const client = createSupabaseClientForRecords(token);
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

function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
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

//-- Load config --\\
async function loadLocalConfig() {
    try {
        const res = await fetch('./js/PremierOneReportMonitor/config.json', { cache: 'no-store' });
        if (!res.ok) return { ...DEFAULT_CONFIG };
        const parsed = await res.json();
        return {
            ...DEFAULT_CONFIG,
            ...parsed,
            records: {
                ...DEFAULT_CONFIG.records,
                ...(parsed.records || {})
            }
        };
    } catch {
        return { ...DEFAULT_CONFIG };
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

/*
 * BEYOND THIS POINT ARE FUNCTIONS IN OTHER MODULES
 * YOU WILL HAVE TO ADD A FUNCTION HERE FOR IT TO LOAD CORRECTLY
 * 
 * IF NOT ADDED, IT WONT LOAD 
 */


function getLogonModule() {
    if (window.p1rLogon) return window.p1rLogon;
    if (typeof window.setSession === 'function') {
        return {
            setSession: window.setSession,
            clearSession: window.clearSession,
            clearStorage: window.clearRecordsStorage,
            showAuthStep: window.showAuthStep,
            handleLoginHash: window.handleLoginHash,
            handleLoginSupervisor: window.handleLoginSupervisor,
            handleLoginBack: window.handleLoginBack,
            hydrateSession: window.hydrateSession
        };
    }
    return null;
}

function getHelpersModule() {
    if (typeof window.p1rHelpers !== 'undefined' && window.p1rHelpers) return window.p1rHelpers;
    if (typeof escapeHtml === 'function') {
        return {
            escapeHtml,
            getSbClient,
            parseDateSafe,
            formatDateTime,
            textFromUnknown,
            downloadBlob,
            loadLocalConfig,
            setButtonState,
            openModal,
            closeModals,
            closeMenus,
            updateUserBadge,
            setNavActive,
            renderCards,
            setContent,
            buildReportStatusPill,
            deriveDisposition,
            normalizeTypeKey,
            filterReportsByKeywords,
            renderSimpleReportTable,
            renderCallTable,
            getPstNow
        };
    }
    return null;
}

function getReportsModule() {
    if (window.p1rReports) return window.p1rReports;
    if (typeof fetchReports === 'function') {
        return {
            fetchReports,
            renderReportsByTypePage,
            renderAllOfficerReports,
            renderReportDetail,
            approveReport,
            denyReport
        };
    }
    return null;
}

function getCallsModule() {
    if (window.p1rCalls) return window.p1rCalls;
    if (typeof fetchCalls === 'function') {
        return {
            renderEmployeeFile,
            fetchCalls,
            renderIncidentDetail,
            renderCallsByTypePage,
            renderAllOfficerDispositions,
            runAdvancedSearch,
            runSerialSearch,
            runQuickQuery
        };
    }
    return null;
}

function getQueryModule() {
    if (window.p1rQuery) return window.p1rQuery;
    if (typeof runQuickQuery === 'function') {
        return {
            runSerialSearch,
            runAdvancedSearch,
            runQuickQuery
        };
    }
    return null;
}

function getAttendenceModule() {
    if (window.p1rAttendence) return window.p1rAttendence;
    if (typeof loadAttendanceRows === 'function') {
        return {
            loadAttendanceRows,
            renderAttendanceTable,
            filterAttendanceRows,
            collectAttendanceRowsFromDom,
            saveAttendanceRows,
            scheduleAttendanceAutosave
        };
    }
    return null;
}

function getExportModule() {
    if (window.p1rExport) return window.p1rExport;
    if (typeof renderRosterPage === 'function') {
        return {
            renderRosterPage,
            exportRosterCsv,
            exportCurrentDataDocx,
            saveReal,
            handleWindowView
        };
    }
    return null;
}

function getUserManagementModule() {
    if (window.p1rUserManagement) return window.p1rUserManagement;
    if (typeof renderLoggedOnPage === 'function') {
        return {
            renderLoggedOnPage,
            submitPasswordRequest
        };
    }
    return null;
}

function applySessionFromModule(state, token, email, isSupervisor) {
    const mod = getLogonModule();
    if (mod && typeof mod.setSession === 'function') {
        mod.setSession(state, token, email, isSupervisor);
        return;
    }
}

function clearSessionFromModule(state) {
    const mod = getLogonModule();
    if (mod && typeof mod.clearSession === 'function') {
        mod.clearSession(state);
        return;
    }
}

function showAuthStepFromModule(state, step) {
    const mod = getLogonModule();
    if (mod && typeof mod.showAuthStep === 'function') {
        mod.showAuthStep(state, step);
    }
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

function setCommandBarActive(state, page) {
    const actionByPage = {
        lobby: 'go-lobby',
        query: 'open-query'
    };
    const activeAction = actionByPage[page] || '';
    state.root.querySelectorAll('.p1r-command-bar .p1r-btn[data-action]').forEach(btn => {
        btn.classList.toggle('is-active', btn.getAttribute('data-action') === activeAction);
    });
}

function renderCards(title, items) {
    return `
            <div class="p1r-card-grid">
                ${items.map(item => `
                    <article class="p1r-card">
                        <div class="p1r-card-title">${escapeHtml(item.title)}</div>
                        <div>${escapeHtml(item.body)}</div>
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

function deriveDisposition(callRow) {
    const historyText = textFromUnknown(callRow?.history);
    const delimiter = '--------------------';
    if (!historyText.includes(delimiter)) return '';
    const chunks = historyText.split(delimiter).map(v => v.trim()).filter(Boolean);
    if (chunks.length) return chunks[chunks.length - 1];
    const commentsText = textFromUnknown(callRow?.comments).trim();
    return commentsText || '';
}

async function fetchReportsFromModule() {
    const mod = getReportsModule();
    if (mod && typeof mod.fetchReports === 'function') {
        return await mod.fetchReports(null, { getSbClient });
    }
    return [];
}

async function fetchCallsFromModule() {
    const mod = getCallsModule();
    if (mod && typeof mod.fetchCalls === 'function') {
        return await mod.fetchCalls(null, { getSbClient });
    }
    return [];
}

function normalizeTypeKey(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function filterReportsByKeywords(reports, keys) {
    const tokens = keys.map(normalizeTypeKey);
    return reports.filter(row => {
        const key = normalizeTypeKey(row?.type);
        return tokens.some(t => key.includes(t));
    });
}

function renderSimpleReportTable(rows, emptyText) {
    const toolbar = `
            <div class="p1r-inline-row p1r-live-toolbar">
                <div class="p1r-live-badge">Reports live monitor initialized</div>
                <button class="p1r-btn" data-action="refresh-live-view">Refresh</button>
            </div>
        `;

    if (!rows.length) {
        return `${toolbar}<div class="p1r-muted">${escapeHtml(emptyText)}</div>`;
    }

    return `
            ${toolbar}
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

function renderCallTable(rows, emptyText) {
    const toolbar = `
            <div class="p1r-inline-row p1r-live-toolbar">
                <div class="p1r-live-badge">Calls live monitor initialized</div>
                <button class="p1r-btn" data-action="refresh-live-view">Refresh</button>
            </div>
        `;

    if (!rows.length) {
        return `${toolbar}<div class="p1r-muted">${escapeHtml(emptyText)}</div>`;
    }

    return `
            ${toolbar}
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
                                <td><button class="p1r-link-btn" data-action="open-incident-detail" data-incident-id="${escapeHtml(row.incid || row.id || '--')}">${escapeHtml(row.incid || row.id || '--')}</button></td>
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
    // let new pstDate = Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
    // return pstDate;
    return new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
}

function getPstTimeCode() {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date()).replace(':', '');
}

function renderLobby(state) {
    const section = (iconClass, title, links) => {
        const linksHtml = links
            .map((item, index) => {
                const isLast = index === links.length - 1;
                const linkHtml = item.page
                    ? `<button class="p1r-lobby-link" data-page="${escapeHtml(item.page)}">${escapeHtml(item.label)}</button>`
                    : `<span class="p1r-lobby-link is-static">${escapeHtml(item.label)}</span>`;
                const dot = isLast ? '' : '<span class="p1r-lobby-dot">&#8226;</span>';
                return `${linkHtml}${dot}`;
            })
            .join('');

        return `
                <section class="p1r-lobby-section">
                    <div class="p1r-lobby-row">
                        <div class="p1r-lobby-icon" aria-hidden="true"><span class="${iconClass}"></span></div>
                        <div class="p1r-lobby-title">${escapeHtml(title)}</div>
                    </div>
                    <div class="p1r-lobby-links">${linksHtml}</div>
                </section>
            `;
    };

    const html = `
            <div class="p1r-lobby">
                ${section('mif-automobile', 'Operations', [
        { label: 'Accident', page: 'accident' },
        { label: 'Booking', page: 'booking' },
        { label: 'Calls for Service', page: 'calls-for-service' },
        { label: 'Citations', page: 'citations' },
        { label: 'Field Investigations', page: 'field-investigations' },
        { label: 'Impounds', page: 'impounds' }
    ])}
                ${section('mif-folder', 'Cases', [
        { label: 'All Officer Reports', page: 'all-officer-reports' },
        { label: 'All Officer Dispositions', page: 'all-officer-dispositions' }
    ])}
                ${section('mif-organization', 'Staff', [
        { label: 'Attendance', page: 'attendance' },
        { label: 'Roster', page: 'roster' },
        { label: 'Logged On', page: 'logged-on' }
    ])}
            </div>
        `;
    setContent(state, 'Lobby', html, { page: 'lobby' });
}

function renderModulePage(state, page) {
    const map = {
        operations: ['Accident', 'Booking', 'Calls for Service', 'Citations', 'Field Investigations', 'Impounds'],
        cases: ['All Officer Reports', 'All Officer Dispositions'],
        staff: ['Attendance', 'Roster', 'Logged On']
    };
    const titles = {
        operations: 'Operations',
        cases: 'Cases',
        staff: 'Staff'
    };
    const items = (map[page] || []).map(label => ({ title: label, body: `Open ${label} from the left navigation.` }));
    setContent(state, titles[page] || 'Module', renderCards('Module', items), { page });
}

async function renderReportsByTypePageFromModule(state, page) {
    const mod = getReportsModule();
    if (!mod || typeof mod.renderReportsByTypePage !== 'function') return;
    await mod.renderReportsByTypePage(state, page, {
        getSbClient,
        filterReportsByKeywords,
        renderSimpleReportTable,
        setContent,
        parseDateSafe
    });
}

async function renderCallsByTypePageFromModule(state, page) {
    const mod = getCallsModule();
    if (!mod || typeof mod.renderCallsByTypePage !== 'function') return;
    await mod.renderCallsByTypePage(state, page, {
        getSbClient,
        renderCallTable,
        setContent
    });
}

async function renderAllOfficerReportsFromModule(state, filterMode) {
    const mod = getReportsModule();
    if (!mod || typeof mod.renderAllOfficerReports !== 'function') return;
    await mod.renderAllOfficerReports(state, {
        getSbClient,
        parseDateSafe,
        renderSimpleReportTable,
        setContent
    }, filterMode);
}

async function renderAllOfficerDispositionsFromModule(state) {
    const mod = getCallsModule();
    if (!mod || typeof mod.renderAllOfficerDispositions !== 'function') return;
    await mod.renderAllOfficerDispositions(state, {
        getSbClient,
        deriveDisposition,
        escapeHtml,
        formatDateTime,
        setContent
    });
}

async function loadAttendanceRowsFromModule(state) {
    const mod = getAttendenceModule();
    if (!mod || typeof mod.loadAttendanceRows !== 'function') return [];
    return await mod.loadAttendanceRows(state, { getSbClient });
}

function renderAttendanceTableFromModule(state) {
    const mod = getAttendenceModule();
    if (!mod || typeof mod.renderAttendanceTable !== 'function') return;
    mod.renderAttendanceTable(state, { getPstNow, escapeHtml, setContent });
}

function renderRosterPageFromModule(state) {
    const mod = getExportModule();
    if (!mod || typeof mod.renderRosterPage !== 'function') return;
    return mod.renderRosterPage(state, { escapeHtml, setContent });
}

async function renderLoggedOnPageFromModule(state) {
    const mod = getUserManagementModule();
    if (!mod || typeof mod.renderLoggedOnPage !== 'function') return;
    await mod.renderLoggedOnPage(state, { escapeHtml, getPstNow, setContent, getSbClient });
}

function renderQueryPage(state) {
    const html = `
            <div class="p1r-card">
                <div class="p1r-card-title">Civilian Query</div>
                <div class="p1r-inline-row">
                    <input id="p1r-query-input" class="p1r-input" type="text" placeholder="Enter player ID or name..." style="max-width:280px;">
                    <button class="p1r-btn p1r-btn-primary" data-action="run-query">Query</button>
                </div>
            </div>
        `;
    setContent(state, 'Query', html, { page: 'query' });
}

async function renderReportDetailFromModule(state, reportId) {
    state.currentPage = 'report-detail';
    state.currentReportId = String(reportId || '');
    state.currentIncidentId = '';
    const mod = getReportsModule();
    if (!mod || typeof mod.renderReportDetail !== 'function') return;
    mod.renderReportDetail(state, reportId, { escapeHtml, formatDateTime, buildReportStatusPill, setContent, openDeniedReasonModal });
    await syncLiveMonitorsForCurrentView(state);
}

async function renderIncidentDetailFromModule(state, incidentId) {
    state.currentPage = 'incident-detail';
    state.currentIncidentId = String(incidentId || '');
    state.currentReportId = '';
    const mod = getCallsModule();
    if (!mod || typeof mod.renderIncidentDetail !== 'function') return;
    mod.renderIncidentDetail(state, incidentId, { escapeHtml, formatDateTime, setContent });
    await syncLiveMonitorsForCurrentView(state);
}

function isReportsLivePage(page) {
    return ['accident', 'booking', 'citations', 'impounds', 'all-officer-reports', 'report-detail'].includes(page);
}

function isCallsLivePage(page) {
    return ['calls-for-service', 'field-investigations', 'all-officer-dispositions', 'incident-detail'].includes(page);
}

async function unsubscribeLiveMonitor(state, key) {
    const sb = getSbClient();
    const channel = state.liveChannels?.[key];
    if (!channel) return;
    if (sb && typeof sb.removeChannel === 'function') {
        try {
            await sb.removeChannel(channel);
        } catch (error) {
            console.warn(`Failed to remove ${key} live monitor:`, error);
        }
    }
    state.liveChannels[key] = null;
}

async function refreshCurrentView(state) {
    if (state.currentPage === 'report-detail') {
        state.cachedReports = await fetchReportsFromModule();
        if (state.currentReportId) {
            await renderReportDetailFromModule(state, state.currentReportId);
        }
        return;
    }

    if (state.currentPage === 'incident-detail') {
        state.cachedCalls = await fetchCallsFromModule();
        if (state.currentIncidentId) {
            await renderIncidentDetailFromModule(state, state.currentIncidentId);
        }
        return;
    }

    if (isReportsLivePage(state.currentPage) || isCallsLivePage(state.currentPage)) {
        await goToPage(state, state.currentPage, false);
    }
}

async function syncLiveMonitorsForCurrentView(state) {
    const sb = getSbClient();
    const page = state.currentPage;

    if (!sb || typeof sb.channel !== 'function') {
        await unsubscribeLiveMonitor(state, 'reports');
        await unsubscribeLiveMonitor(state, 'calls');
        return;
    }

    if (isReportsLivePage(page)) {
        if (!state.liveChannels.reports) {
            state.liveChannels.reports = sb
                .channel('p1r-reports-live-monitor')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, async () => {
                    await refreshCurrentView(state);
                })
                .subscribe();
        }
    } else {
        await unsubscribeLiveMonitor(state, 'reports');
    }

    if (isCallsLivePage(page)) {
        if (!state.liveChannels.calls) {
            state.liveChannels.calls = sb
                .channel('p1r-calls-live-monitor')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, async () => {
                    await refreshCurrentView(state);
                })
                .subscribe();
        }
    } else {
        await unsubscribeLiveMonitor(state, 'calls');
    }
}

function pushHistory(state, page) {
    if (state.historyIndex < state.history.length - 1) {
        state.history = state.history.slice(0, state.historyIndex + 1);
    }
    state.history.push(page);
    state.historyIndex = state.history.length - 1;
    updateHistoryButtons(state);
}

function updateHistoryButtons(state) {
    const backBtn = state.root.querySelector('#p1r-back-btn');
    const fwdBtn = state.root.querySelector('#p1r-forward-btn');
    setButtonState(backBtn, state.historyIndex > 0);
    setButtonState(fwdBtn, state.historyIndex < state.history.length - 1);
}

async function goToPage(state, page, push) {
    state.currentPage = page;
    setNavActive(state, page);
    setCommandBarActive(state, page);

    if (push !== false) pushHistory(state, page);

    if (page === 'lobby') {
        renderLobby(state);
        await syncLiveMonitorsForCurrentView(state);
        return;
    }
    if (page === 'operations' || page === 'cases' || page === 'staff') {
        renderModulePage(state, page);
        state.currentReportId = '';
        state.currentIncidentId = '';
        await syncLiveMonitorsForCurrentView(state);
        return;
    }
    if (page === 'accident' || page === 'booking' || page === 'citations' || page === 'impounds') {
        state.currentReportId = '';
        state.currentIncidentId = '';
        await renderReportsByTypePageFromModule(state, page);
        await syncLiveMonitorsForCurrentView(state);
        return;
    }
    if (page === 'calls-for-service' || page === 'field-investigations') {
        state.currentReportId = '';
        state.currentIncidentId = '';
        await renderCallsByTypePageFromModule(state, page);
        await syncLiveMonitorsForCurrentView(state);
        return;
    }
    if (page === 'all-officer-reports') {
        state.currentReportId = '';
        state.currentIncidentId = '';
        await renderAllOfficerReportsFromModule(state);
        await syncLiveMonitorsForCurrentView(state);
        return;
    }
    if (page === 'all-officer-dispositions') {
        state.currentReportId = '';
        state.currentIncidentId = '';
        await renderAllOfficerDispositionsFromModule(state);
        await syncLiveMonitorsForCurrentView(state);
        return;
    }
    if (page === 'attendance') {
        setContent(state, 'Attendance', `
                <div class="p1r-card">
                    <div class="p1r-card-title">Attendance</div>
                    <div class="p1r-muted">Syncing roster and loading attendance data...</div>
                </div>
            `, { page: 'attendance-loading' });
        state.attendanceRows = await loadAttendanceRowsFromModule(state);
        renderAttendanceTableFromModule(state);
        state.currentReportId = '';
        state.currentIncidentId = '';
        await syncLiveMonitorsForCurrentView(state);
        return;
    }
    if (page === 'roster') {
        await renderRosterPageFromModule(state);
        state.currentReportId = '';
        state.currentIncidentId = '';
        await syncLiveMonitorsForCurrentView(state);
        return;
    }
    if (page === 'logged-on') {
        await renderLoggedOnPageFromModule(state);
        state.currentReportId = '';
        state.currentIncidentId = '';
        await syncLiveMonitorsForCurrentView(state);
        return;
    }
    if (page === 'query') {
        renderQueryPage(state);
        state.currentReportId = '';
        state.currentIncidentId = '';
        await syncLiveMonitorsForCurrentView(state);
        return;
    }

    renderLobby(state);
    await syncLiveMonitorsForCurrentView(state);
}

async function runSerialSearchFromModule(state) {
    const mod = getQueryModule() || getCallsModule();
    if (!mod || typeof mod.runSerialSearch !== 'function') return;
    await mod.runSerialSearch(state, { getSbClient, closeModals, setContent, escapeHtml });
}

async function runAdvancedSearchFromModule(state) {
    const mod = getQueryModule() || getCallsModule();
    if (!mod || typeof mod.runAdvancedSearch !== 'function') return;
    await mod.runAdvancedSearch(state, { getSbClient, closeModals, setContent, escapeHtml });
}

async function runQuickQueryFromModule(state) {
    const mod = getQueryModule() || getCallsModule();
    if (!mod || typeof mod.runQuickQuery !== 'function') return;
    await mod.runQuickQuery(state, { getSbClient, setContent, escapeHtml });
}

function filterAttendanceRowsFromModule(state, term) {
    const mod = getAttendenceModule();
    if (!mod || typeof mod.filterAttendanceRows !== 'function') return 0;
    return mod.filterAttendanceRows(state, term);
}

function openReportReviewModal(state, mode, reportId) {
    const modal = state.root.querySelector('#p1r-modal-report-review');
    const title = state.root.querySelector('#p1r-report-review-title');
    const body = state.root.querySelector('#p1r-report-review-body');
    const reasonWrap = state.root.querySelector('#p1r-report-review-reason-wrap');
    const reasonInput = state.root.querySelector('#p1r-report-review-reason');
    const submitBtn = state.root.querySelector('#p1r-report-review-submit');
    const reviewRow = (state.cachedReports || []).find(row => String(row.report_id) === String(reportId));

    state.pendingReportReview = {
        reportId: String(reportId || ''),
        mode: mode === 'approve' ? 'approve' : 'deny'
    };

    if (title) title.textContent = mode === 'approve' ? 'Approve Report' : 'Deny Report';
    if (body) {
        body.innerHTML = reviewRow ? `
                <div class="p1r-review-item"><span>Report</span><strong>#${escapeHtml(reviewRow.report_id || '--')}</strong></div>
                <div class="p1r-review-item"><span>User</span><strong>${escapeHtml(reviewRow.user || '--')}</strong></div>
                <div class="p1r-review-item"><span>Type</span><strong>${escapeHtml(reviewRow.type || '--')}</strong></div>
                <div class="p1r-review-item"><span>Status</span><strong>${buildReportStatusPill(reviewRow.status)}</strong></div>
            ` : `<div class="p1r-muted">Report ${escapeHtml(reportId)}.</div>`;
    }

    if (reasonWrap) reasonWrap.classList.toggle('hidden', mode !== 'deny');
    if (reasonInput) reasonInput.value = '';
    if (submitBtn) submitBtn.textContent = mode === 'approve' ? 'Approve' : 'Deny';
    if (modal) modal.classList.remove('hidden');
}

function openDeniedReasonModal(state, reportRow) {
    const modal = state.root.querySelector('#p1r-modal-denial-reason');
    if (!modal || !reportRow) return;

    const title = state.root.querySelector('#p1r-denial-title');
    const body = state.root.querySelector('#p1r-denial-body');
    if (title) title.textContent = `Denial Reason - Report #${reportRow.report_id || '--'}`;

    const fields = reportRow.fields && typeof reportRow.fields === 'object' ? reportRow.fields : {};
    const denialReason = reportRow.denial_reason || fields.denial_reason || '--';
    const deniedBy = fields.denied_by || '--';
    const deniedAt = fields.denied_at || reportRow.completed_at || '--';

    if (body) {
        body.innerHTML = `
                <div class="p1r-review-item"><span>Report</span><strong>#${escapeHtml(reportRow.report_id || '--')}</strong></div>
                <div class="p1r-review-item"><span>Type</span><strong>${escapeHtml(reportRow.type || '--')}</strong></div>
                <div class="p1r-review-item"><span>Denied By</span><strong>${escapeHtml(deniedBy)}</strong></div>
                <div class="p1r-review-item"><span>Denied At</span><strong>${escapeHtml(formatDateTime(deniedAt))}</strong></div>
                <div class="p1r-card" style="margin-top:12px;">
                    <div class="p1r-card-title" style="margin-bottom:8px;">Denial Reason</div>
                    <div>${escapeHtml(denialReason)}</div>
                </div>
            `;
    }

    modal.classList.remove('hidden');
    state.lastDeniedReasonShownReportId = String(reportRow.report_id || '');
}

async function submitPasswordRequestFromModule(state) {
    const mod = getUserManagementModule();
    if (!mod || typeof mod.submitPasswordRequest !== 'function') return;
    await mod.submitPasswordRequest(state, { closeModals });
}

async function submitReportReview(state) {
    const mod = getReportsModule();
    const pending = state.pendingReportReview || {};
    if (!mod || !pending.reportId) return;

    let result = null;
    if (pending.mode === 'approve' && typeof mod.approveReport === 'function') {
        result = await mod.approveReport(state, pending.reportId, { getSbClient });
    } else if (pending.mode === 'deny' && typeof mod.denyReport === 'function') {
        const reasonInput = state.root.querySelector('#p1r-report-review-reason');
        const reason = String(reasonInput?.value || '').trim();
        result = await mod.denyReport(state, pending.reportId, reason, { getSbClient });
    }

    if (!result?.ok) {
        alert(result?.message || 'Unable to update report.');
        return;
    }

    closeModals(state);
    state.pendingReportReview = null;
    alert(result.message || 'Report updated successfully.');
    await renderAllOfficerReportsFromModule(state, 'pending');
}

function setupRecordsUnloadLogout(state) {
    if (window.__p1rUnloadLogoutAttached) return;
    const logoutOnUnload = () => {
        const mod = getLogonModule();
        if (mod && typeof mod.clearStorage === 'function') {
            mod.clearStorage();
            return;
        }
        sessionStorage.removeItem('p1rUserEmail');
        sessionStorage.removeItem('p1rSupervisor');
        sessionStorage.removeItem('p1rAuthVerified');
        sessionStorage.removeItem('p1rSessionIssuedAt');
        sessionStorage.removeItem('p1rUserToken');
    };
    window.addEventListener('beforeunload', logoutOnUnload);
    window.addEventListener('pagehide', logoutOnUnload);
    window.__p1rUnloadLogoutAttached = true;
}

function exportRosterCsvFromModule(state) {
    const mod = getExportModule();
    if (!mod || typeof mod.exportRosterCsv !== 'function') return;
    mod.exportRosterCsv(state, { downloadBlob });
}

function exportCurrentDataDocxFromModule(state) {
    const mod = getExportModule();
    if (!mod || typeof mod.exportCurrentDataDocx !== 'function') return;
    mod.exportCurrentDataDocx(state, { downloadBlob });
}

function saveRealFromModule() {
    const mod = getExportModule();
    if (!mod || typeof mod.saveReal !== 'function') return;
    mod.saveReal();
}

function handleWindowViewFromModule(action) {
    const mod = getExportModule();
    if (!mod || typeof mod.handleWindowView !== 'function') return;
    mod.handleWindowView(action);
}

function scheduleAttendanceAutosaveFromModule(state) {
    const mod = getAttendenceModule();
    if (!mod || typeof mod.scheduleAttendanceAutosave !== 'function') return;
    mod.scheduleAttendanceAutosave(state, { getSbClient, getPstNow });
}

function collectAttendanceRowsFromModule(state) {
    const mod = getAttendenceModule();
    if (!mod || typeof mod.collectAttendanceRowsFromDom !== 'function') return [];
    return mod.collectAttendanceRowsFromDom(state);
}

async function saveAttendanceRowsFromModule(state) {
    const mod = getAttendenceModule();
    if (!mod || typeof mod.saveAttendanceRows !== 'function') return;
    await mod.saveAttendanceRows(state, { getSbClient, getPstNow });
}

async function runLoginHash(state) {
    const mod = getLogonModule();
    if (!mod || typeof mod.handleLoginHash !== 'function') return;
    await mod.handleLoginHash(state, HASH_ENDPOINT);
}

async function runLoginSupervisor(state) {
    const mod = getLogonModule();
    if (!mod || typeof mod.handleLoginSupervisor !== 'function') return;
    const ok = await mod.handleLoginSupervisor(state, VERIFY_KEY_ENDPOINT);
    if (ok) {
        updateUserBadge(state);
        await goToPage(state, 'lobby', true);
    }
}

function runLoginBack(state) {
    const mod = getLogonModule();
    if (!mod || typeof mod.handleLoginBack !== 'function') return;
    mod.handleLoginBack(state);
}

function hydrateSessionFromModule(state) {
    const mod = getLogonModule();
    if (!mod || typeof mod.hydrateSession !== 'function') return false;
    const restored = mod.hydrateSession(state);
    if (restored) updateUserBadge(state);
    return restored;
}

async function handleAction(state, action, trigger) {
    closeMenus(state);

    if (action === 'login') {
        await runLoginHash(state);
        return;
    }

    if (action === 'login-hash') {
        await runLoginHash(state);
        return;
    }

    if (action === 'login-supervisor') {
        await runLoginSupervisor(state);
        return;
    }

    if (action === 'login-back') {
        runLoginBack(state);
        return;
    }

    if (action === 'logout') {
        clearSessionFromModule(state);
        const login = state.root.querySelector('#p1r-login');
        const app = state.root.querySelector('#p1r-app');
        if (app) app.classList.add('hidden');
        if (login) login.classList.remove('hidden');
        showAuthStepFromModule(state, 'hash');
        return;
    }

    if (action === 'go-lobby') {
        await goToPage(state, 'lobby', true);
        return;
    }

    if (action === 'go-back') {
        if (state.historyIndex > 0) {
            state.historyIndex -= 1;
            const prev = state.history[state.historyIndex];
            updateHistoryButtons(state);
            await goToPage(state, prev, false);
        }
        return;
    }

    if (action === 'go-forward') {
        if (state.historyIndex < state.history.length - 1) {
            state.historyIndex += 1;
            const next = state.history[state.historyIndex];
            updateHistoryButtons(state);
            await goToPage(state, next, false);
        }
        return;
    }

    if (action === 'open-query') {
        await goToPage(state, 'query', true);
        return;
    }

    if (action === 'open-help') {
        window.open(state.config.records.helpUrl, '_blank', 'noopener,noreferrer');
        return;
    }

    if (action === 'open-serial-search') {
        openModal(state, 'p1r-modal-serial');
        return;
    }

    if (action === 'open-advanced-search') {
        openModal(state, 'p1r-modal-advanced');
        return;
    }

    if (action === 'open-change-password') {
        openModal(state, 'p1r-modal-password');
        return;
    }

    if (action === 'close-modals') {
        closeModals(state);
        return;
    }

    if (action === 'submit-serial-search') {
        await runSerialSearchFromModule(state);
        return;
    }

    if (action === 'submit-advanced-search') {
        await runAdvancedSearchFromModule(state);
        return;
    }

    if (action === 'submit-password-request') {
        await submitPasswordRequestFromModule(state);
        return;
    }

    if (action === 'run-query') {
        await runQuickQueryFromModule(state);
        return;
    }

    if (action === 'reports-filter-pending') {
        await renderAllOfficerReportsFromModule(state, 'pending');
        return;
    }

    if (action === 'reports-filter-approved') {
        await renderAllOfficerReportsFromModule(state, 'approved');
        return;
    }

    if (action === 'reports-filter-all') {
        await renderAllOfficerReportsFromModule(state, 'all');
        return;
    }

    if (action === 'open-report-detail') {
        const reportId = trigger?.getAttribute('data-report-id');
        if (reportId) await renderReportDetailFromModule(state, reportId);
        return;
    }

    if (action === 'open-report-approve') {
        const reportId = trigger?.getAttribute('data-report-id');
        if (reportId) openReportReviewModal(state, 'approve', reportId);
        return;
    }

    if (action === 'open-report-deny') {
        const reportId = trigger?.getAttribute('data-report-id');
        if (reportId) openReportReviewModal(state, 'deny', reportId);
        return;
    }

    if (action === 'open-report-denial-reason') {
        const reportId = trigger?.getAttribute('data-report-id');
        const reportRow = (state.cachedReports || []).find(row => String(row.report_id) === String(reportId));
        if (reportRow) openDeniedReasonModal(state, reportRow);
        return;
    }

    if (action === 'open-incident-detail') {
        const incidentId = trigger?.getAttribute('data-incident-id');
        if (incidentId) await renderIncidentDetailFromModule(state, incidentId);
        return;
    }

    if (action === 'refresh-live-view') {
        await refreshCurrentView(state);
        return;
    }

    if (action === 'submit-report-review') {
        await submitReportReview(state);
        return;
    }

    if (action === 'export-roster-csv') {
        exportRosterCsvFromModule(state);
        return;
    }

    if (action === 'export-current-docx') {
        exportCurrentDataDocxFromModule(state);
        return;
    }

    if (action === 'save-as') {
        saveRealFromModule();
        return;
    }

    if (action === 'set-view-fullscreen' || action === 'set-view-windowed' || action === 'set-view-minimize') {
        handleWindowViewFromModule(action);
        return;
    }

    if (action === 'open-roster-link') {
        window.open(state.config.records.rosterUrl, '_blank', 'noopener,noreferrer');
        return;
    }

    if (action === 'open-attendance-sheet') {
        const url = state.config.records.attendanceSheetUrl || state.config.records.rosterUrl;
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
    }

    if (action === 'refresh-attendance') {
        state.attendanceRows = await loadAttendanceRowsFromModule(state);
        renderAttendanceTableFromModule(state);
        filterAttendanceRowsFromModule(state, state.attendanceSearchTerm || '');
        return;
    }

    if (action === 'att-now') {
        const target = trigger?.getAttribute('data-target');
        const row = trigger?.closest('tr');
        const input = row ? row.querySelector(`[data-att-field="${target}"]`) : null;
        if (input) {
            input.value = getPstTimeCode();
            scheduleAttendanceAutosaveFromModule(state);
        }
    }
    if (action === 'filter-attendance') {
        const term = String(trigger?.getAttribute('data-term') || '').trim().toLowerCase();
        filterAttendanceRowsFromModule(state, term);
        return;
    }
}

function handleMenuToggle(state, menuKey) {
    const fileMenu = state.root.querySelector('#p1r-file-menu');
    const viewMenu = state.root.querySelector('#p1r-view-menu');
    if (!fileMenu || !viewMenu) return;

    if (menuKey === 'file') {
        const next = fileMenu.classList.contains('hidden');
        closeMenus(state);
        if (next) fileMenu.classList.remove('hidden');
        return;
    }

    if (menuKey === 'view') {
        const next = viewMenu.classList.contains('hidden');
        closeMenus(state);
        if (next) viewMenu.classList.remove('hidden');
    }
}

function bindEvents(state) {
    const root = state.root;

    root.addEventListener('keydown', async event => {
        const targetId = event.target && event.target.id ? event.target.id : '';
        if (event.key !== 'Enter') return;

        if (targetId === 'p1r-email' || targetId === 'p1r-password') {
            event.preventDefault();
            await runLoginHash(state);
            return;
        }

        if (targetId === 'p1r-supervisor-key') {
            event.preventDefault();
            await runLoginSupervisor(state);
        }
    });

    root.addEventListener('click', async event => {
        const actionEl = event.target.closest('[data-action]');
        if (actionEl) {
            event.preventDefault();
            await handleAction(state, actionEl.getAttribute('data-action'), actionEl);
            return;
        }

        const pageEl = event.target.closest('[data-page]');
        if (pageEl) {
            event.preventDefault();
            await goToPage(state, pageEl.getAttribute('data-page'), true);
            return;
        }

        const menuEl = event.target.closest('[data-menu]');
        if (menuEl) {
            event.preventDefault();
            handleMenuToggle(state, menuEl.getAttribute('data-menu'));
            return;
        }

        if (!event.target.closest('.p1r-menu-popover')) {
            closeMenus(state);
        }
    });

    root.addEventListener('input', event => {
        const target = event.target;
        if (target && target.hasAttribute('data-att-field')) {
            scheduleAttendanceAutosaveFromModule(state);
        }

        if (target && target.id === 'p1r-att-search') {
            state.attendanceSearchTerm = String(target.value || '');
            filterAttendanceRowsFromModule(state, state.attendanceSearchTerm);
        }
    });
}

async function initReportMonitorApp(shellWindow) {
    const root = shellWindow?.body || document;
    const marker = root.querySelector('#p1r-root');
    if (!marker) return;

    const runtimeConfig = await loadLocalConfig();
    window.__p1rRuntimeConfig = runtimeConfig;
    window.p1rEnsureSupabaseClients = ensureSupabaseClients;
    await ensureSupabaseClients(runtimeConfig);

    const state = {
        root,
        config: runtimeConfig,
        history: [],
        historyIndex: -1,
        currentPage: 'lobby',
        cachedReports: [],
        lastData: null,
        attendanceRows: [],
        attendanceSaveTimer: null,
        userEmail: '',
        isSupervisor: false,
        pendingEmail: '',
        pendingHashToken: '',
        officerReportsFilter: 'pending',
        attendanceSearchTerm: '',
        lastDeniedReasonShownReportId: '',
        currentReportId: '',
        currentIncidentId: '',
        liveChannels: {
            reports: null,
            calls: null
        }
    };

    bindEvents(state);
    setupRecordsUnloadLogout(state);

    window.__p1rHandleAction = (action, el) => handleAction(state, action, el);
    window.__p1rHandlePage = (page, el) => goToPage(state, page, true);
    window.__p1rHandleMenu = (key, el) => handleMenuToggle(state, key);

    window.__appCleanupHandlers = window.__appCleanupHandlers || {};
    window.__appCleanupHandlers.PremierOneReportMonitor = () => {
        if (state.attendanceSaveTimer) clearTimeout(state.attendanceSaveTimer);
        state.attendanceSaveTimer = null;
        if (state.liveChannels?.reports && window.sbClient?.removeChannel) {
            window.sbClient.removeChannel(state.liveChannels.reports).catch(() => { });
        }
        if (state.liveChannels?.calls && window.sbClient?.removeChannel) {
            window.sbClient.removeChannel(state.liveChannels.calls).catch(() => { });
        }
        state.liveChannels = { reports: null, calls: null };
        delete window.__p1rHandleAction;
        delete window.__p1rHandlePage;
        delete window.__p1rHandleMenu;
    };

    const restored = hydrateSessionFromModule(state);
    if (restored) {
        await goToPage(state, 'lobby', true);
    } else {
        showAuthStepFromModule(state, 'hash');
    }
}

window.initReportMonitorApp = initReportMonitorApp;
