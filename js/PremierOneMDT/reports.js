// openReportEntry = funtion to open an report entry

//-- Reports View --\\
let currentReportsFilter = 'all';

//-- global vars --\\
let reportsConfigCache = null;
let activeReportType = null;
let activeDraftId = null;
let activeReportIncidentId = '';
const reportDrafts = [];
let reportsLiveMonitorChannel = null;
let reportsTableCache = [];
let activeExistingReportId = null;
let activeReportReadOnly = false;
let activePromptForIdTarget = null;

function filterReports(type) {
    const rows = document.querySelectorAll('#reports-table-body .reports-row');
    const header = document.getElementById('reports-content-header');
    const listView = document.getElementById('reports-list-view');
    const composeView = document.getElementById('reports-compose-view');

    currentReportsFilter = type;

    saveActiveDraftSnapshot();
    activeDraftId = null;
    activeReportType = null;
    activeReportIncidentId = '';
    activeExistingReportId = null;
    activeReportReadOnly = false;

    if (composeView) composeView.style.display = 'none';
    if (listView) listView.style.display = 'block';
    setReportsComposeFooterVisible(false);
    renderReportDrafts();

    syncReportsSidebarSelection();

    rows.forEach(row => {
        if (type === 'all') {
            row.style.display = '';
        } else if (type === 'pending') {
            row.style.display = row.classList.contains('reports-pending') ? '' : 'none';
        } else if (type === 'approved') {
            row.style.display = row.classList.contains('reports-approved') ? '' : 'none';
        } else if (type === 'declined') {
            row.style.display = row.classList.contains('reports-declined') ? '' : 'none';
        }
        // console.log(`Row ${row.getAttribute('data-report-id')} status: ${row.className}, display: ${row.style.display}`);
    });

    // Update content area header label
    const labels = {
        all: 'ALL REPORTS',
        pending: 'PENDING REPORTS',
        approved: 'ACCEPTED REPORTS',
        declined: 'REPORTS NEEDING REVIEW'
    };
    if (header) header.textContent = labels[type] || 'ALL REPORTS';
}

// strip comments from jsonc for importing
function stripJsonComments(jsoncText) {
    return jsoncText
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

// this should be a helper func, didnt call..?
function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeSpecialInput(value) {
    return String(value || '').trim().toUpperCase();
}

function mapReportStatusClass(statusValue) {
    const status = String(statusValue || '').toLowerCase();
    if (status === 'approved' || status === 'accepted') return 'reports-approved';
    if (status === 'declined' || status === 'denied' || status === 'rejected') return 'reports-declined';
    return 'reports-pending';
}

function mapReportStatusBadgeClass(statusValue) {
    const status = String(statusValue || '').toLowerCase();
    if (status === 'approved' || status === 'accepted') return 'badge-approved';
    if (status === 'declined' || status === 'denied' || status === 'rejected') return 'badge-denied';
    return 'badge-pending';
}

function normalizeReportStatusText(statusValue) {
    const status = String(statusValue || '').toUpperCase();
    if (status === 'ACCEPTED') return 'APPROVED';
    if (status === 'DECLINED' || status === 'REJECTED') return 'DENIED';
    return status || 'PENDING';
}

function getReportStatusSortRank(statusValue) {
    const normalized = normalizeReportStatusText(statusValue);
    if (normalized === 'DENIED') return 0;
    if (normalized === 'PENDING') return 1;
    if (normalized === 'APPROVED') return 2;
    return 3;
}

function isDeclinedStatus(statusValue) {
    return String(statusValue || '').trim().toUpperCase() === 'DECLINED';
}

function setReportsReviewFlash(hasDeclinedReports) {
    const reviewBtn = document.getElementById('reports-btn-declined');
    if (!reviewBtn) return;
    reviewBtn.classList.toggle('flash-red', Boolean(hasDeclinedReports));
}

//-- Get report data from cache by report ID, returns null if not found or invalid ID --\\
function getCachedReportById(reportId) {
    const key = String(reportId || '').trim();
    if (!key) return null;
    return reportsTableCache.find(r => String(r?.report_id || '').trim() === key) || null;
}

//-- Open report entry view for a given report ID, using cache if available --\\
function openReportEntryFromRow(rowEl) {
    const reportId = rowEl?.getAttribute('data-report-id') || '';
    if (!reportId) return;
    openReportEntry(reportId);
}

//-- Get report type name from config based on type ID, with caching --\\
async function getReportTypeNameFromId(typeId) {
    const id = String(typeId || '').trim();
    if (!id) return 'UNKNOWN';
    try {
        const config = await loadReportsConfig();
        const type = (config.reportTypes || []).find(r => r.id === id);
        return type?.name || id.toUpperCase();
    } catch {
        return id.toUpperCase();
    }
}

//-- Format date time for report rows --\\
function formatReportDateTime(value) {
    if (!value) return '--';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);

    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}/${dd}/${yy} ${hh}:${mi}`;
}

//-- Render row in report table --\\
async function renderReportsRows(records) {
    const tbody = document.getElementById('reports-table-body');
    if (!tbody) return;

    if (!Array.isArray(records) || !records.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; font-style: italic; color: gray;">No reports to display.</td></tr>';
        return;
    }

    const rowsHtml = await Promise.all(records.map(async (row) => {
        const statusText = normalizeReportStatusText(row.status);
        const statusClass = mapReportStatusClass(row.status);
        const badgeClass = mapReportStatusBadgeClass(row.status);
        const typeName = await getReportTypeNameFromId(row.type);
        const reportNum = row.report_id == null ? '--' : String(row.report_id);
        const incidentId = row.inc_id == null ? '--' : String(row.inc_id);
        const dateTime = formatReportDateTime(row.completed_at || row.completed_at);

        return `
        <tr class="${statusClass} reports-row" data-report-id="${escapeHtml(reportNum)}" onclick="openReportEntryFromRow(this)">
            <td>${escapeHtml(reportNum)}</td>
            <td>${escapeHtml(incidentId)}</td>
            <td>${escapeHtml(typeName)}</td>
            <td>${escapeHtml(dateTime)}</td>
            <td><span class="report-status-badge ${badgeClass}">${escapeHtml(statusText)}</span></td>
        </tr>`;
    }));

    tbody.innerHTML = rowsHtml.join('');
}

async function refreshReportsTable() {
    if (!sbClient || typeof sbClient.from !== 'function') return;

    try {
        const { data, error } = await sbClient
            .from('reports')
            .select('report_id, inc_id, type, status, completed_at, fields')
            .order('completed_at', { ascending: false });

        if (error) {
            console.error('Failed to fetch reports table:', error);
            return;
        }

        setReportsReviewFlash((data || []).some(row => isDeclinedStatus(row?.status)));

        const orderedReports = (data || []).slice().sort((a, b) => {
            const rankDiff = getReportStatusSortRank(a?.status) - getReportStatusSortRank(b?.status);
            if (rankDiff !== 0) return rankDiff;

            const aTime = new Date(a?.completed_at || a?.completed_at || 0).getTime();
            const bTime = new Date(b?.completed_at || b?.completed_at || 0).getTime();
            return bTime - aTime;
        });

        reportsTableCache = orderedReports;

        await renderReportsRows(orderedReports);
        filterReports(currentReportsFilter || 'all');
    } catch (err) {
        console.error('Unexpected error refreshing reports table:', err);
    }
}

async function unsubscribeReportsLiveMonitor() {
    if (!reportsLiveMonitorChannel || !sbClient?.removeChannel) return;
    try {
        await sbClient.removeChannel(reportsLiveMonitorChannel);
    } catch (err) {
        console.warn('Failed to unsubscribe reports live monitor:', err);
    }
    reportsLiveMonitorChannel = null;
}

async function setupReportsLiveMonitor() {
    if (!sbClient || typeof sbClient.channel !== 'function') return;

    await refreshReportsTable();
    syncReportsSidebarSelection();

    if (reportsLiveMonitorChannel) return;

    reportsLiveMonitorChannel = sbClient
        .channel('reports-live-monitor')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, async () => {
            await refreshReportsTable();
        })
        .subscribe();
}

//-- Generate a date code and time code for draft labeling, e.g. "092423" and "1530" --\\
function formatDraftDateTime(dateObj) {
    const month = dateObj.getMonth() + 1;
    const day = String(dateObj.getDate()).padStart(2, '0');
    const year = String(dateObj.getFullYear()).slice(-2);
    const hour = String(dateObj.getHours()).padStart(2, '0');
    const minute = String(dateObj.getMinutes()).padStart(2, '0');
    return {
        dateCode: `${month}${day}${year}`,
        timeCode: `${hour}${minute}`
    };
}

//-- Get a short label for the draft based on its report type, e.g. "ARREST" for "Arrest Report" --\\
function getDraftTypeLabel(reportType) {
    const raw = String(reportType?.name || reportType?.id || 'REPORT').toUpperCase();
    return raw.replace(/\s*REPORT\s*/g, ' ').trim().split(/\s+/)[0] || 'REPORT';
}

//-- Render the list of report drafts in the sidebar --\\
function renderReportDrafts() {
    const host = document.getElementById('reports-drafts-list');
    if (!host) return;

    if (!reportDrafts.length) {
        host.innerHTML = '<div class="reports-draft-empty">No drafts yet.</div>';
        return;
    }

    host.innerHTML = reportDrafts.map(draft => {
        return `<a class="side-nav-btn reports-sidebar-btn reports-draft-btn d-flex align-center p-2" data-draft-id="${escapeHtml(draft.id)}" onclick="openReportDraft('${escapeHtml(draft.id)}')" title="${escapeHtml(draft.reportTypeName)}">
            <span class="mif-file-text mif-2x mr-2"></span>
            <span class="btn-text">${escapeHtml(draft.label)}</span>
        </a>`;
    }).join('');

    syncReportsSidebarSelection();
}

//-- Ensure that the active filter and draft are visually highlighted in the sidebar --\\
function syncReportsSidebarSelection() {
    const filterBtns = document.querySelectorAll('.reports-filter-btn');
    const draftBtns = document.querySelectorAll('.reports-draft-btn');

    filterBtns.forEach(btn => btn.classList.remove('active-reports-tab'));
    draftBtns.forEach(btn => btn.classList.remove('active-reports-tab'));

    const activeFilter = document.getElementById(`reports-btn-${currentReportsFilter}`);
    if (activeFilter) activeFilter.classList.add('active-reports-tab');

    if (activeDraftId) {
        const activeDraftBtn = Array.from(draftBtns).find(btn => btn.getAttribute('data-draft-id') === activeDraftId);
        if (activeDraftBtn) activeDraftBtn.classList.add('active-reports-tab');
    }
}

//-- Create a new report draft and open it for editing --\\
function createReportDraft(reportType) {
    const now = new Date();
    const { dateCode, timeCode } = formatDraftDateTime(now);
    const typeLabel = getDraftTypeLabel(reportType);

    const draft = {
        id: `${reportType?.id || 'report'}-${Date.now()}`,
        reportTypeId: reportType?.id || '',
        reportTypeName: reportType?.name || reportType?.id || 'Report',
        createdAt: now.toISOString(),
        label: `${typeLabel} ${dateCode} ${timeCode}`,
        incidentId: '',
        fields: {}
    };

    reportDrafts.unshift(draft);
    if (reportDrafts.length > 30) reportDrafts.length = 30;
    renderReportDrafts();
    return draft;
}

//-- Load and parse reports configuration from JSONC file, with caching --\\
async function loadReportsConfig() {
    if (reportsConfigCache) return reportsConfigCache;

    const response = await fetch('./js/PremierOneMDT/reports-config.jsonc', { cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to load reports-config.jsonc');

    const raw = await response.text();
    const parsed = JSON.parse(stripJsonComments(raw));
    if (!parsed || !Array.isArray(parsed.reportTypes)) {
        throw new Error('reports-config.jsonc is missing reportTypes[]');
    }

    reportsConfigCache = parsed;
    return parsed;
}

//-- Parse special input for dropdown options, e.g. "dropdown[Option1,Option2,Option3]" --\\
function parseDropdownOptions(typeValue) {
    const match = String(typeValue || '').match(/^dropdown\[(.*)\]$/i);
    if (!match) return null;
    return match[1].split(',').map(v => v.trim()).filter(Boolean);
}

function parseCheckboxOptions(typeValue) {
    const match = String(typeValue || '').match(/^checkbox\[(.*)\]$/i);
    if (!match) return null;
    return match[1].split(',').map(v => v.trim()).filter(Boolean);
}

//-- Parse special input for table columns, e.g. "TABLECOL[Color,Year,Make,Model]" --\\
function parseTableColumns(specialInput) {
    const match = String(specialInput || '').match(/^TABLECOL\[(.*)\]$/i);
    if (!match) return null;
    return match[1].split(',').map(v => v.trim()).filter(Boolean);
}

//-- Get display string for current user based on sessionStorage info --\\
function getReportUserDisplay() {
    const raw = sessionStorage.getItem('userInfo') || '';
    const parts = raw.split(',');
    const name = (parts[1] || parts[0] || '').trim();
    const unit = (parts[2] || '').trim();
    if (name && unit) return `${name} [${unit}]`;
    return name || unit || 'Unknown User';
}

//-- Show or hide the compose view footer based on context --\\
function setReportsComposeFooterVisible(visible) {
    const composeFoot = document.getElementById('reports-compose-foot');
    const homeFoot = document.getElementById('home-foot');
    if (composeFoot) composeFoot.style.display = visible ? 'flex' : 'none';
    if (homeFoot) homeFoot.style.display = visible ? 'none' : 'flex';
}

function setReportFormLocked(locked) {
    const host = document.getElementById('reports-compose-host');
    if (!host) return;

    const controls = host.querySelectorAll('.report-form-grid input, .report-form-grid textarea, .report-form-grid select, .report-form-grid button');
    controls.forEach(el => {
        el.disabled = !!locked;
    });

    const submitBtn = host.querySelector('.report-form-actions .bg-dark');
    if (submitBtn) submitBtn.disabled = !!locked;

    host.classList.toggle('report-form-locked', !!locked);
}

function setReportIncidentInputLocked(locked) {
    const incidentInput = document.getElementById('reportIncidentIdInput');
    if (incidentInput) incidentInput.disabled = !!locked;
}

function renderReportIncidentHeader(initialIncidentId = '') {
    const header = document.getElementById('reports-content-header');
    if (!header) return;

    const safeVal = escapeHtml(initialIncidentId || '');
    header.innerHTML = `
        <div class="report-incident-gate">
            <input id="reportIncidentIdInput" class="report-incident-id-input" type="text" value="${safeVal}" placeholder="INPUT INCIDENT ID BEFORE STARTING" onkeypress="if(event.key === 'Enter'){ event.preventDefault(); submitReportIncidentId(); }">
            <span id="reportIncidentIdStatus" class="report-incident-id-status">${initialIncidentId ? 'Incident linked' : 'Press Enter to unlock report fields'}</span>
        </div>
    `;
}

function submitReportIncidentId() {
    const input = document.getElementById('reportIncidentIdInput');
    const status = document.getElementById('reportIncidentIdStatus');
    const value = input ? input.value.trim() : '';

    if (!value) {
        if (status) status.textContent = 'INPUT INCIDENT ID BEFORE STARTING';
        setReportFormLocked(true);
        return;
    }

    activeReportIncidentId = value;
    if (status) status.textContent = `Incident linked: ${value}`;
    setReportFormLocked(false);
}

//-- Build HTML for a single report field based on its configuration --\\
function buildSingleReportFieldHtml(field, index, options = {}) {
    const compact = !!options.compact;
    const required = field.required ? ' required' : '';
    const requiredAsterisk = field.required ? ' <span class="report-required">*</span>' : '';
    const fieldId = `report-field-${index}-${field.name}`;
    const specialInput = normalizeSpecialInput(field.specialInput);

    if (specialInput === 'FIRSTLASTSEPERATE') {
        return `
        <div class="report-form-group ${compact ? 'report-form-group-compact' : 'report-form-group-wide'}">
            <label class="report-form-label">${escapeHtml(field.label)}${requiredAsterisk}</label>
            <div class="report-two-col">
                <input id="${fieldId}-first" class="report-input" type="text" placeholder="First Name"${required}>
                <input id="${fieldId}-last" class="report-input" type="text" placeholder="Last Name"${required}>
            </div>
        </div>`;
    }

    // FORMAT: TABLECOL[Column1,Column2,Column3] for inline tables
    const tableCols = parseTableColumns(field.specialInput);
    if (tableCols && tableCols.length) {
        const head = tableCols.map(col => `<th>${escapeHtml(col)}</th>`).join('') + '<th class="report-table-actions-col">Actions</th>';
        const bodyRows = [0, 1].map(rowIdx => {
            const cells = tableCols.map(col => {
                return `<td><input class="report-table-input" type="text" name="${escapeHtml(field.name)}-${rowIdx}-${escapeHtml(col)}"></td>`;
            }).join('');
            return `<tr>${cells}<td class="report-table-actions-col"><button type="button" class="button mini-button alert report-inline-remove-btn" onclick="removeReportTableRow(this)">Remove</button></td></tr>`;
        }).join('');

        return `
        <div class="report-form-group ${compact ? 'report-form-group-compact' : 'report-form-group-wide'}">
            <label class="report-form-label">${escapeHtml(field.label)}${requiredAsterisk}</label>
            <div class="report-table-wrap">
                <table class="report-entry-table">
                    <thead><tr>${head}</tr></thead>
                    <tbody data-report-table="${escapeHtml(field.name)}">${bodyRows}</tbody>
                </table>
                <button type="button" class="button mini-button report-inline-btn" onclick="addReportTableRow('${escapeHtml(field.name)}', '${escapeHtml(tableCols.join('|'))}')">+ Add Row</button>
            </div>
        </div>`;
    }

    const dropdownOptions = parseDropdownOptions(field.type);
    if (dropdownOptions) {
        const optionsHtml = dropdownOptions.map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('');
        return `
        <div class="report-form-group ${compact ? 'report-form-group-compact' : ''}">
            <label class="report-form-label" for="${fieldId}">${escapeHtml(field.label)}${requiredAsterisk}</label>
            <select id="${fieldId}" class="report-input"${required}>
                <option value="">Select...</option>
                ${optionsHtml}
            </select>
        </div>`;
    }

    // FORMAT: checkbox[Option1,Option2,Option3] in `type`
    const checkBoxOptions = parseCheckboxOptions(field.type) || parseCheckboxOptions(field.specialInput);
    if (checkBoxOptions && checkBoxOptions.length) {
        const checkboxesHtml = checkBoxOptions.map((opt, idx) => {
            const optId = `${fieldId}-opt-${idx}`;
            return `<div class="report-checkbox-option">
                <input id="${optId}" type="checkbox" name="${fieldId}" value="${escapeHtml(opt)}" data-checkbox-group="${fieldId}">
                <label for="${optId}">${escapeHtml(opt)}</label>
            </div>`;
        }).join('');

        return `
        <div class="report-form-group ${compact ? 'report-form-group-compact' : 'report-form-group-wide'}">
            <label class="report-form-label">${escapeHtml(field.label)}${requiredAsterisk}</label>
            <div class="report-checkbox-group">
                ${checkboxesHtml}
            </div>
        </div>`;
    }

    if (String(field.type).toLowerCase() === 'textarea') {
        const autoFillBtn = specialInput === 'INPUTUSERDATA'
            ? `<button type="button" class="button mini-button report-inline-btn" onclick="fillReportOfficer('${fieldId}')">Autofill</button>`
            : '';
        return `
        <div class="report-form-group ${compact ? 'report-form-group-compact' : 'report-form-group-wide'}">
            <label class="report-form-label" for="${fieldId}">${escapeHtml(field.label)}${requiredAsterisk}</label>
            <textarea id="${fieldId}" class="report-textarea" rows="4"${required}></textarea>
            ${autoFillBtn}
        </div>`;
    }

    const htmlType = ['text', 'date', 'time'].includes(String(field.type).toLowerCase())
        ? String(field.type).toLowerCase()
        : 'text';

    if (specialInput === 'INPUTUSERDATA') {
        return `
        <div class="report-form-group ${compact ? 'report-form-group-compact' : ''}">
            <label class="report-form-label" for="${fieldId}">${escapeHtml(field.label)}${requiredAsterisk}</label>
            <div class="report-input-action-wrap">
                <input id="${fieldId}" class="report-input" type="${htmlType}"${required}>
                <button type="button" class="button mini-button report-input-action-btn" onclick="fillReportOfficer('${fieldId}')">Autofill</button>
            </div>
        </div>`;
    }

    if (specialInput === 'PROMPTFORID') {
        return `
        <div class="report-form-group ${compact ? 'report-form-group-compact' : ''}">
            <label class="report-form-label" for="${fieldId}">${escapeHtml(field.label)}${requiredAsterisk}</label>
            <div class="report-input-action-wrap">
                <input id="${fieldId}" class="report-input" type="text" placeholder="Click to lookup by ID" readonly onclick="openReportPromptForIdModal('${fieldId}')"${required}>
                <button type="button" class="button mini-button report-input-action-btn" onclick="openReportPromptForIdModal('${fieldId}')">Lookup</button>
            </div>
        </div>`;
    }

    return `
    <div class="report-form-group ${compact ? 'report-form-group-compact' : ''}">
        <label class="report-form-label" for="${fieldId}">${escapeHtml(field.label)}${requiredAsterisk}</label>
        <input id="${fieldId}" class="report-input" type="${htmlType}"${required}>
    </div>`;
}

//-- Build Report Fields HTML with special handling for date/time pairs --\\
function buildReportFieldsHtml(fields) {
    const blocks = [];
    for (let i = 0; i < fields.length; i++) {
        const current = fields[i];
        const next = fields[i + 1];
        const currentType = String(current?.type || '').toLowerCase();
        const nextType = String(next?.type || '').toLowerCase();
        const isDateTimePair = next && (
            (currentType === 'date' && nextType === 'time') ||
            (currentType === 'time' && nextType === 'date')
        );

        if (isDateTimePair) {
            const left = buildSingleReportFieldHtml(current, i, { compact: true });
            const right = buildSingleReportFieldHtml(next, i + 1, { compact: true });
            blocks.push(`
            <div class="report-datetime-pair">
                ${left}
                ${right}
            </div>`);
            i++;
            continue;
        }

        blocks.push(buildSingleReportFieldHtml(current, i));
    }
    return blocks.join('');
}

//-- Save current form field values into the active draft --\\
function saveActiveDraftSnapshot() {
    if (!activeDraftId || !activeReportType) return;
    const draft = reportDrafts.find(d => d.id === activeDraftId);
    if (!draft) return;
    const incidentInput = document.getElementById('reportIncidentIdInput');
    draft.incidentId = incidentInput ? incidentInput.value.trim() : (activeReportIncidentId || '');
    draft.fields = collectReportFormData(activeReportType).fields || {};
}

//-- Apply draft data to form fields --\\
function applyDraftDataToForm(draft, reportType) {
    if (!draft || !draft.fields || !reportType) return;
    const fields = Array.isArray(reportType.fields) ? reportType.fields : [];

    fields.forEach((field, index) => {
        const specialInput = normalizeSpecialInput(field.specialInput);
        const fieldId = `report-field-${index}-${field.name}`;
        const value = draft.fields[field.name];

        if (specialInput === 'FIRSTLASTSEPERATE' && value && typeof value === 'object') {
            const first = document.getElementById(`${fieldId}-first`);
            const last = document.getElementById(`${fieldId}-last`);
            if (first) first.value = value.first || '';
            if (last) last.value = value.last || '';
            return;
        }

        const cols = parseTableColumns(field.specialInput);
        if (cols && cols.length) {
            const tbody = Array.from(document.querySelectorAll('tbody[data-report-table]'))
                .find(el => el.getAttribute('data-report-table') === field.name);
            if (!tbody) return;

            const rows = Array.isArray(value) ? value : [];
            if (!rows.length) return;

            tbody.innerHTML = rows.map((rowData, rowIndex) => {
                const cells = cols.map(col => {
                    const rowValue = rowData && typeof rowData === 'object' ? (rowData[col] || '') : '';
                    return `<td><input class="report-table-input" type="text" name="${escapeHtml(field.name)}-${rowIndex}-${escapeHtml(col)}" value="${escapeHtml(rowValue)}"></td>`;
                }).join('');
                return `<tr>${cells}<td class="report-table-actions-col"><button type="button" class="button mini-button alert report-inline-remove-btn" onclick="removeReportTableRow(this)">Remove</button></td></tr>`;
            }).join('');
            return;
        }

        const checkBoxOptions = parseCheckboxOptions(field.type) || parseCheckboxOptions(field.specialInput);
        if (checkBoxOptions && checkBoxOptions.length) {
            const selected = Array.isArray(value) ? value : [];
            const checkboxes = Array.from(document.querySelectorAll(`input[type="checkbox"][name="${fieldId}"]`));
            checkboxes.forEach(cb => {
                cb.checked = selected.includes(cb.value);
            });
            return;
        }

        const input = document.getElementById(fieldId);
        if (input) input.value = value || '';
    });
}

//-- Render New Report Form --\\
function renderReportForm(reportType, draft = null, options = {}) {
    const host = document.getElementById('reports-compose-host');
    const chooser = document.getElementById('reports-compose-chooser');
    const header = document.getElementById('reports-content-header');
    if (!host || !chooser) return;

    const readOnly = !!options.readOnly;
    const submitLabel = options.submitLabel || 'Submit Report';

    activeReportType = reportType || null;
    activeDraftId = draft?.id || null;
    activeExistingReportId = options.sourceReportId || null;
    activeReportReadOnly = readOnly;

    const fields = Array.isArray(reportType.fields) ? reportType.fields : [];
    const issuedAt = new Date().toLocaleString();
    const fieldBlocks = buildReportFieldsHtml(fields);

    host.innerHTML = `
    <div class="report-form-card">
        <div class="report-official-header">
            <img class="report-lapd-logo" src="https://upload.wikimedia.org/wikipedia/commons/a/aa/Seal_of_the_Los_Angeles_Police_Department.png" alt="LAPD Logo">
            <div>
                <div class="report-official-title">OFFICIAL REPORT</div>
                <div class="report-official-subtitle">All information in here must be valid</div>
            </div>
        </div>
        <div class="report-form-banner">
            <div>
                <div class="report-form-title">${escapeHtml(reportType.name || 'New Report')}</div>
                <div class="report-form-subtitle">Prepared by ${escapeHtml(getReportUserDisplay())}</div>
            </div>
            <div class="report-form-issued">${escapeHtml(issuedAt)}</div>
        </div>
        <div class="report-form-grid">
            ${fieldBlocks || '<div class="report-form-empty">No fields configured for this report type.</div>'}
        </div>
        <div class="report-form-actions" role="group" aria-label="Report submit actions">
            <button type="button" class="button" onclick="exitReportCompose()">${readOnly ? 'Back' : 'Cancel'}</button>
            ${readOnly ? '' : `<button type="button" class="button bg-dark fg-white" onclick="completeReportForm()">${escapeHtml(submitLabel)}</button>`}
        </div>
    </div>`;

    activeReportIncidentId = draft?.incidentId || '';
    renderReportIncidentHeader(activeReportIncidentId);
    chooser.style.display = 'none';
    host.style.display = 'block';
    applyDraftDataToForm(draft, reportType);
    setReportFormLocked(readOnly ? true : !activeReportIncidentId);
    setReportIncidentInputLocked(readOnly);
    renderReportDrafts();
    syncReportsSidebarSelection();
    setReportsComposeFooterVisible(true);
}

async function openReportEntry(reportId) {
    const reportKey = String(reportId || '').trim();
    if (!reportKey) {
        alert('Unable to open that report.');
        return;
    }

    if (!sbClient || typeof sbClient.from !== 'function') {
        alert('Report data service is unavailable. Please try again.');
        return;
    }

    try {
        const { data: report, error } = await sbClient
            .from('reports')
            .select('report_id, inc_id, type, status, completed_at, fields, denial_reason')
            .eq('report_id', reportKey)
            .single();

        if (error || !report) {
            alert('Unable to find that report. Please refresh and try again.');
            return;
        }

        const config = await loadReportsConfig();
        const reportType = config.reportTypes.find(r => r.id === report.type);
        if (!reportType) {
            alert('This report type is no longer configured.');
            return;
        }

        const listView = document.getElementById('reports-list-view');
        const composeView = document.getElementById('reports-compose-view');
        if (listView) listView.style.display = 'none';
        if (composeView) composeView.style.display = 'block';

        const normalized = normalizeReportStatusText(report.status);
        const readOnly = normalized === 'APPROVED';

        if (report.denial_reason !== null && report.denial_reason !== undefined) {
            alert(`This report was denied for the following reason:\n\n${report.denial_reason}\n\nYou can view the report details and resubmit.`);
        }

        const reportDraftLike = {
            id: null,
            incidentId: report.inc_id || '',
            fields: report.fields && typeof report.fields === 'object' ? report.fields : {}
        };

        renderReportForm(reportType, reportDraftLike, {
            sourceReportId: report.report_id,
            readOnly,
            submitLabel: 'Resubmit Report'
        });

        const statusNote = document.getElementById('reportIncidentIdStatus');
        if (statusNote && readOnly) {
            statusNote.textContent = `Viewing approved report #${String(report.report_id || '').trim()}`;
        }
    } catch (err) {
        console.error('Unable to open report entry:', err);
        alert('Unable to open report.');
    }
}

//-- Autofill user data into a field --\\
function fillReportOfficer(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.value = getReportUserDisplay();
}

function openReportPromptForIdModal(targetInputId) {
    activePromptForIdTarget = targetInputId || null;
    const input = document.getElementById('reportPromptForIdInput');
    const status = document.getElementById('reportPromptForIdStatus');
    if (input) input.value = '';
    if (status) status.textContent = 'Enter a person ID to lookup.';
    if (typeof showModal === 'function') {
        showModal('reportPromptForIdModal');
    }
    setTimeout(() => {
        const focusEl = document.getElementById('reportPromptForIdInput');
        if (focusEl) focusEl.focus();
    }, 0);
}

async function submitReportPromptForId() {
    const input = document.getElementById('reportPromptForIdInput');
    const status = document.getElementById('reportPromptForIdStatus');
    const target = activePromptForIdTarget ? document.getElementById(activePromptForIdTarget) : null;
    const personId = input ? input.value.trim() : '';

    if (!target) {
        alert('Target report field is unavailable. Reopen the report and try again.');
        return;
    }
    if (!personId) {
        if (status) status.textContent = 'Enter a person ID first.';
        return;
    }

    if (status) status.textContent = 'Looking up ID...';

    try {
        const rlsClient = typeof getRlsClient === 'function' ? getRlsClient() : sbClient;
        const data = await queryPlayerRecord(rlsClient, personId);
        if (!data) {
            if (status) status.textContent = 'No record found for that ID.';
            return;
        }

        const fullName = `${data.FName || ''} ${data.LName || ''}`.trim();
        const dlValue = String(data.DL || data.DLNum || data.License || personId).trim();
        const combined = `${fullName || personId} - DL# ${dlValue}`;

        target.value = combined;
        if (status) status.textContent = `Filled: ${combined}`;
        if (typeof closeModal === 'function') {
            closeModal('reportPromptForIdModal');
        }
    } catch (err) {
        console.error('PROMPTFORID lookup failed:', err);
        if (status) status.textContent = `Lookup failed: ${err?.message || err}`;
    }
}

//-- Add a new row to a report table field --\\
function addReportTableRow(fieldName, serializedColumns) {
    const tbody = Array.from(document.querySelectorAll('tbody[data-report-table]'))
        .find(el => el.getAttribute('data-report-table') === fieldName);
    if (!tbody) return;

    const cols = String(serializedColumns || '').split('|').map(v => v.trim()).filter(Boolean);
    const rowIndex = tbody.querySelectorAll('tr').length;
    const tr = document.createElement('tr');
    tr.innerHTML = cols.map(col => `<td><input class="report-table-input" type="text" name="${escapeHtml(fieldName)}-${rowIndex}-${escapeHtml(col)}"></td>`).join('') +
        '<td class="report-table-actions-col"><button type="button" class="button mini-button alert report-inline-remove-btn" onclick="removeReportTableRow(this)">Remove</button></td>';
    tbody.appendChild(tr);
}

//-- Remove a table row, but if it's the last row, just clear its inputs --\\
function removeReportTableRow(buttonEl) {
    const row = buttonEl?.closest('tr');
    const tbody = row?.closest('tbody');
    if (!row || !tbody) return;

    const rowCount = tbody.querySelectorAll('tr').length;
    if (rowCount <= 1) {
        row.querySelectorAll('input').forEach(input => {
            input.value = '';
        });
        return;
    }

    row.remove();
}

//-- Show report type selector to start a new report --\\
function showReportStartSelector() {
    const listView = document.getElementById('reports-list-view');
    const composeView = document.getElementById('reports-compose-view');
    const host = document.getElementById('reports-compose-host');
    const chooser = document.getElementById('reports-compose-chooser');
    const header = document.getElementById('reports-content-header');

    saveActiveDraftSnapshot();
    if (listView) listView.style.display = 'none';
    if (composeView) composeView.style.display = 'block';
    if (host) {
        host.style.display = 'none';
        host.innerHTML = '';
    }
    activeReportType = null;
    activeDraftId = null;
    activeReportIncidentId = '';
    activeExistingReportId = null;
    activeReportReadOnly = false;
    if (chooser) chooser.style.display = 'block';
    if (header) header.textContent = 'START NEW REPORT';
    syncReportsSidebarSelection();
    setReportsComposeFooterVisible(true);

    populateReportTypeSelect();
}

//-- Populate report type dropdown in start selector --\\
async function populateReportTypeSelect() {
    const select = document.getElementById('startNewReportSelect');
    if (!select) return;

    try {
        const config = await loadReportsConfig();
        const optionsHtml = config.reportTypes
            .map(r => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name || r.id)}</option>`)
            .join('');
        select.innerHTML = optionsHtml;
    } catch (err) {
        console.error('Failed to load reports config:', err);
    }
}

//-- Exit compose view and return to list view --\\
function exitReportCompose() {
    const listView = document.getElementById('reports-list-view');
    const composeView = document.getElementById('reports-compose-view');
    const host = document.getElementById('reports-compose-host');
    const chooser = document.getElementById('reports-compose-chooser');

    saveActiveDraftSnapshot();
    if (composeView) composeView.style.display = 'none';
    if (listView) listView.style.display = 'block';
    if (host) {
        host.style.display = 'none';
        host.innerHTML = '';
    }
    activeReportType = null;
    activeDraftId = null;
    activeReportIncidentId = '';
    activeExistingReportId = null;
    activeReportReadOnly = false;
    if (chooser) chooser.style.display = 'block';
    syncReportsSidebarSelection();
    setReportsComposeFooterVisible(false);

    filterReports(currentReportsFilter || 'all');
}

//-- Clear form fields without affecting draft data --\\
function clearReportFields() {
    const host = document.getElementById('reports-compose-host');
    if (!host || host.style.display === 'none') return;

    host.querySelectorAll('input, textarea, select').forEach(el => {
        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (tag === 'select') {
            el.selectedIndex = 0;
            return;
        }
        if (type === 'checkbox' || type === 'radio') {
            el.checked = false;
            return;
        }
        el.value = '';
    });
}

//-- Open a draft report for editing --\\
async function openReportDraft(draftId) {
    const draft = reportDrafts.find(d => d.id === draftId);
    if (!draft) return;

    saveActiveDraftSnapshot();

    try {
        const config = await loadReportsConfig();
        const reportType = config.reportTypes.find(r => r.id === draft.reportTypeId);
        if (!reportType) {
            alert('Draft report type is no longer configured.');
            return;
        }

        const listView = document.getElementById('reports-list-view');
        const composeView = document.getElementById('reports-compose-view');
        if (listView) listView.style.display = 'none';
        if (composeView) composeView.style.display = 'block';

        renderReportForm(reportType, draft);
        syncReportsSidebarSelection();
    } catch (err) {
        console.error('Unable to open draft:', err);
        alert('Unable to open draft.');
    }
}

//-- Debug utility to log active draft data to console --\\
function logActiveDraftToConsole() {
    if (!activeReportType) {
        alert('No active draft open.');
        return;
    }

    saveActiveDraftSnapshot();
    const draft = reportDrafts.find(d => d.id === activeDraftId);
    const payload = collectReportFormData(activeReportType);

    console.log('[P1 MDT] Active Draft:', {
        draft,
        payload
    });
    alert('Draft logged to console.');
}

//-- Clear form fields and optionally draft data --\\
function clearActiveDraftData() {
    if (!activeReportType || !activeDraftId) {
        clearReportFields();
        return;
    }

    const draft = reportDrafts.find(d => d.id === activeDraftId);
    if (draft) draft.fields = {};
    clearReportFields();
}

//-- Collect form data into structured payload --\\
function collectReportFormData(reportType) {
    const fields = Array.isArray(reportType?.fields) ? reportType.fields : [];
    const payloadFields = {};

    fields.forEach((field, index) => {
        const specialInput = normalizeSpecialInput(field.specialInput);
        const fieldId = `report-field-${index}-${field.name}`;

        if (specialInput === 'FIRSTLASTSEPERATE') {
            payloadFields[field.name] = {
                first: document.getElementById(`${fieldId}-first`)?.value?.trim() || '',
                last: document.getElementById(`${fieldId}-last`)?.value?.trim() || ''
            };
            return;
        }

        const cols = parseTableColumns(field.specialInput);
        if (cols && cols.length) {
            const tbody = Array.from(document.querySelectorAll('tbody[data-report-table]'))
                .find(el => el.getAttribute('data-report-table') === field.name);
            const rows = [];
            if (tbody) {
                tbody.querySelectorAll('tr').forEach(tr => {
                    const rowData = {};
                    let hasAnyValue = false;
                    cols.forEach((col, colIdx) => {
                        const input = tr.querySelector(`td:nth-child(${colIdx + 1}) input`);
                        const value = input?.value?.trim() || '';
                        if (value) hasAnyValue = true;
                        rowData[col] = value;
                    });
                    if (hasAnyValue) rows.push(rowData);
                });
            }
            payloadFields[field.name] = rows;
            return;
        }

        const checkBoxOptions = parseCheckboxOptions(field.type) || parseCheckboxOptions(field.specialInput);
        if (checkBoxOptions && checkBoxOptions.length) {
            const selectedValues = Array.from(document.querySelectorAll(`input[type="checkbox"][name="${fieldId}"]:checked`))
                .map(el => el.value);
            payloadFields[field.name] = selectedValues;
            return;
        }

        payloadFields[field.name] = document.getElementById(fieldId)?.value?.trim() || '';
    });

    return {
        reportTypeId: reportType?.id || '',
        reportTypeName: reportType?.name || '',
        incidentId: activeReportIncidentId || (document.getElementById('reportIncidentIdInput')?.value?.trim() || ''),
        completedAt: new Date().toISOString(),
        preparedBy: getReportUserDisplay(),
        fields: payloadFields
    };
}

//-- Submit Report --\\
async function completeReportForm() {
    const userInfo = sessionStorage.getItem('userInfo');
    const currentUser = userInfo ? userInfo.split(',')[0] : null;
    const currentUnit = userInfo ? userInfo.split(',')[2] : null;

    if (!currentUser || !currentUnit) {
        alert('Not logged in, log in to continue');
        return;
    }

    if (!sbClient) return;

    if (!activeReportType) {
        alert('No active report form to complete.');
        return;
    }

    if (activeReportReadOnly) {
        alert('Approved reports are view-only and cannot be edited.');
        return;
    }

    const host = document.getElementById('reports-compose-host');
    const incidentValue = document.getElementById('reportIncidentIdInput')?.value?.trim() || '';
    if (!incidentValue) {
        alert('INPUT INCIDENT ID BEFORE STARTING');
        return;
    }
    activeReportIncidentId = incidentValue;

    const requiredControls = host ? Array.from(host.querySelectorAll('input[required], textarea[required], select[required]')) : [];
    const firstInvalid = requiredControls.find(el => !el.value || !el.value.trim());
    if (firstInvalid) {
        alert('Please complete all required fields before submitting.');
        firstInvalid.focus();
        return;
    }

    // Required checkbox groups are validated from config since they render as multiple inputs.
    const requiredCheckboxField = (activeReportType?.fields || []).find((field, index) => {
        if (!field?.required) return false;
        const checkBoxOptions = parseCheckboxOptions(field.type) || parseCheckboxOptions(field.specialInput);
        if (!checkBoxOptions || !checkBoxOptions.length) return false;
        const fieldId = `report-field-${index}-${field.name}`;
        return !document.querySelector(`input[type="checkbox"][name="${fieldId}"]:checked`);
    });
    if (requiredCheckboxField) {
        alert(`Please select at least one option for ${requiredCheckboxField.label || requiredCheckboxField.name}.`);
        return;
    }

    const payload = collectReportFormData(activeReportType);

    try {
        const wasResubmit = !!activeExistingReportId;
        let error = null;

        if (activeExistingReportId) {
            const updateResult = await sbClient
                .from('reports')
                .update({
                    user: currentUser.trim().toLowerCase(),
                    completed_at: payload.completedAt,
                    inc_id: payload.incidentId,
                    type: payload.reportTypeId,
                    fields: payload.fields,
                    status: 'pending',
                    denial_reason: null
                })
                .eq('report_id', activeExistingReportId)
                .select('report_id')
                .single();
            error = updateResult.error;
        } else {
            const insertResult = await sbClient
                .from('reports')
                .insert({
                    user: currentUser.trim().toLowerCase(),
                    completed_at: payload.completedAt,
                    inc_id: payload.incidentId,
                    type: payload.reportTypeId,
                    fields: payload.fields,
                    status: 'pending',
                    denial_reason: null
                })
                .single();
            error = insertResult.error;
        }
        
        if (error) {
            console.error('Error submitting report:', error);
            alert('Failed to submit report. Please try again.');
            return;
        }

        await refreshReportsTable();
        

        exitReportCompose();
        alert(wasResubmit ? 'Report resubmitted successfully!' : 'Report submitted successfully!');

    } catch (err) {
        console.error('Unexpected error submitting report:', err);
        alert('An unexpected error occurred while submitting the report. Please try again.');
    }
}

//-- Start New Report --\\
async function startNewReport() {
    const select = document.getElementById('startNewReportSelect');
    const reportTypeId = select ? select.value : null;

    if (!reportTypeId) {
        alert('Please select a report type to start.');
        return;
    }

    try {
        const config = await loadReportsConfig();
        const reportType = config.reportTypes.find(r => r.id === reportTypeId);
        if (!reportType) {
            alert('Selected report type is not configured.');
            return;
        }
        const draft = createReportDraft(reportType);
        renderReportForm(reportType, draft);
    } catch (err) {
        console.error('Error starting report:', err);
        alert('Unable to start report form. Please try again.');
    }
}

//-- Footer Btn auto fill officer fields --\\
function autofillReportOfficerFields() {
    const host = document.getElementById('reports-compose-host');
    if (!host || host.style.display === 'none') return;

    const autoFillButtons = Array.from(host.querySelectorAll('.report-input-action-btn'));
    autoFillButtons.forEach(btn => {
        btn.click();
    });
}