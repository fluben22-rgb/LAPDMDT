/*
         * ALL QUERY FUNCTIONS BEYOND THIS POINT
         * ALL PERSON ALERT FUNCTIONS BEYOND THIS POINT
         * QUERYING IS NOT FROM OUR DB, WRITING NOT ALLOWED 
         */

//-- Query panel resizer --\\
(function () {
    let dragging = false, startY = 0, startH = 0;
    document.addEventListener('mousedown', function (e) {
        if (!e.target || e.target.id !== 'query-resizer') return;
        const topArea = document.getElementById('query-top-area');
        if (!topArea) return;
        dragging = true;
        startY = e.clientY;
        startH = topArea.offsetHeight;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        const topArea = document.getElementById('query-top-area');
        const mainArea = topArea && topArea.parentElement;
        if (!topArea || !mainArea) return;
        const delta = e.clientY - startY;
        const newH = Math.max(40, Math.min(mainArea.offsetHeight - 60, startH + delta));
        topArea.style.height = newH + 'px';
    });
    document.addEventListener('mouseup', function () {
        if (dragging) {
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
})();

//-- Query table folder/detail/checkbox logic --\\
let id = 0;
window._queryFolder = 'responses';
window._queryRows = []; // {id, criteria, summary, received, responseType, folder}
window._queryResponses = {}; // keyed by row id
window._queryDrafts = {};   // Save draft person data: {rowId: {type, plateInput, personInput, lastNameInput, firstNameInput, dobInput, ssnInput, incidentInput, plateTyp, plateState, vin, licensePlateYear, purpCode}}
window._activeDraftId = null;

function showQueryOptsView(defaultType) {
    const viewIndicator = document.getElementById('currentpage');
    viewIndicator.textContent = 'Query';
    if (surfedPages.length >= 7) {
        surfedPages.shift();  // Remove oldest entry
    }
    surfedPages.push('Query');
    currentPageIndex = surfedPages.length - 1;  // Point to newest entry
    restoreMainUI();
    const qv = document.getElementById('query-opts-view');
    if (qv) {
        qv.style.setProperty('display', 'flex', 'important');
        qv.style.setProperty('z-index', 'var(--mdt-z-content, 1)', 'important');
        flickerIn(qv);
    }
    const homeFoot = document.getElementById('home-foot');
    const queryFoot = document.getElementById('query-foot');
    const submitFoot = document.getElementById('submit-query-foot');
    const advCallFoot = document.getElementById('adv-call-table-foot');
    if (homeFoot) homeFoot.style.setProperty('display', 'none', 'important');
    if (queryFoot) queryFoot.style.setProperty('display', 'none', 'important');
    if (advCallFoot) advCallFoot.style.setProperty('display', 'none', 'important');
    if (submitFoot) submitFoot.style.setProperty('display', 'flex', 'important');
    if (qv && typeof window.positionMdtOverlayWithinWorkspace === 'function') {
        window.positionMdtOverlayWithinWorkspace(qv);
    }
    switchQueryInputPanel(defaultType || 'CAL-OP');
}

function hideQueryOptsView() {
    const qv = document.getElementById('query-opts-view');
    if (qv) qv.style.setProperty('display', 'none', 'important');
    const homeFoot = document.getElementById('home-foot');
    const queryFoot = document.getElementById('query-foot');
    const submitFoot = document.getElementById('submit-query-foot');
    if (submitFoot) submitFoot.style.display = 'none';
    if (queryFoot) queryFoot.style.display = 'none';
    if (homeFoot) homeFoot.style.display = 'flex';
    restoreMainUI();
}

//-- Switch to Query Input Sub Pannel based on type requested --\\
function switchQueryInputPanel(type) {
    const platePanel = document.getElementById('input-plate-info');
    const personPanel = document.getElementById('input-person-info');
    document.querySelectorAll('#query-opts-view .side-nav-btn').forEach(b => b.classList.remove('active-query-tab'));
    const activeBtn = document.querySelector('#query-opts-view .side-nav-btn[data-qtype="' + type + '"]');
    if (activeBtn) activeBtn.classList.add('active-query-tab');
    if (type === 'CAL-OP') {
        if (platePanel) platePanel.style.display = 'block';
        if (personPanel) personPanel.style.display = 'none';
    } else if (type === 'PERSON') {
        if (platePanel) platePanel.style.display = 'none';
        if (personPanel) personPanel.style.display = 'block';
    }
}

//-- Switch to Query Result Sub Folder and render table based on folder --\\
function switchQueryFolder(folder, el) {
    window._queryFolder = folder;
    document.querySelectorAll('.query-sidebar-area .side-nav-btn').forEach(b => b.classList.remove('active-query-tab'));
    const sidebarBtn = document.querySelector(`.query-sidebar-area .side-nav-btn[onclick*="'${folder}'"]`);
    if (sidebarBtn) sidebarBtn.classList.add('active-query-tab');
    else if (el && el.closest && el.closest('.query-sidebar-area')) el.classList.add('active-query-tab');
    renderQueryTable();
    let mainFooter = document.getElementById('home-foot');
    let queryFooter = document.getElementById('query-foot');
    const inQueryResultsView = String(window.currentView || '') === 'queryResults';
    if (mainFooter) mainFooter.style.display = inQueryResultsView ? 'none' : 'flex';
    if (queryFooter) queryFooter.style.display = inQueryResultsView ? 'flex' : 'none';
}

//-- Update response count per folder by filtering  _queryRows array --\\
function updateQueryCounters() {
    const folders = ['responses', 'drafts', 'pending', 'posted', 'trash'];
    folders.forEach(f => {
        const count = (window._queryRows || []).filter(r => r.folder === f).length;
        const el = document.getElementById('qcount-' + f);
        if (el) el.textContent = count > 0 ? '(' + count + ')' : '';
    });
}

//-- QUERY TABLE RENDERING FUNC --\\
function renderQueryTable() {
    const tbody = document.getElementById('query-table-real');
    const thead = document.querySelector('#queryTableView thead tr');
    if (!tbody) return;

    const isDrafts = window._queryFolder === 'drafts';

    // Swap headers for drafts view
    if (thead) {
        if (isDrafts) {
            thead.innerHTML = `<th style="width:28px;" class="query-check-col"><input type="checkbox" data-role="none" id="querySelectAll" title="Select all" onchange="queryToggleAll(this)"></th>
                        <th style="width:28px;"></th>
                        <th style="width:22%;">Query Type</th>
                        <th>Criteria Entered</th>
                        <th style="width:80px;">Saved At</th>
                        <th style="width:20ch;">Actions</th>`;
        } else {
            thead.innerHTML = `<th style="width:28px;" class="query-check-col"><input type="checkbox" data-role="none" id="querySelectAll" title="Select all" onchange="queryToggleAll(this)"></th>
                        <th style="width:28px;"><span class="mif-attachment"></span></th>
                        <th style="width:22%;">Query Criteria</th>
                        <th>Summary</th>
                        <th style="width:80px;">Received</th>
                        <th style="width:30ch;">Response Type</th>`;
        }
    }

    const rows = (window._queryRows || []).filter(r => r.folder === window._queryFolder);
    tbody.innerHTML = '';
    rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.dataset.qid = row.id;
        if (isDrafts) {
            const draft = window._queryDrafts[row.id] || {};
            const criteria = draft.type === 'vehicle'
                ? (draft.plateInput || '(no plate)')
                : (draft.personInput || draft.lastNameInput || '(no ID)');
            tr.innerHTML = `<td class="query-check-col"><input type="checkbox" data-role="none" class="query-row-check"></td>
                        <td></td>
                        <td>${row.criteria || ''}</td>
                        <td>${criteria}</td>
                        <td>${row.received || ''}</td>
                        <td><button class="button" style="border-radius:0; padding:2px 8px; font-size:11px;" onclick="openDraft(${row.id})">Open &amp; Edit</button></td>`;
        } else {
            const isPending = row.folder === 'pending';
            tr.innerHTML = `<td class="query-check-col"><input type="checkbox" data-role="none" class="query-row-check"></td>
                        <td><button style="border:none;background:none;cursor:pointer;" title="Attach to incident" onclick="attachQueryToIncident(${JSON.stringify(row.id)})"><span class="mif-attachment"></span></button></td>
                        <td onclick="showQueryDetail(${JSON.stringify(row.id)})">${row.criteria || ''}</td>
                        <td onclick="showQueryDetail(${JSON.stringify(row.id)})">${isPending ? '<em style="color:#888;">Awaiting response...</em>' : (row.summary || '')}</td>
                        <td onclick="showQueryDetail(${JSON.stringify(row.id)})">${row.received || ''}</td>
                        <td onclick="showQueryDetail(${JSON.stringify(row.id)})">${row.responseType || ''}</td>`;
        }
        tbody.appendChild(tr);
    });

    const selAll = document.getElementById('querySelectAll');
    if (selAll) selAll.checked = false;
    showQueryDetail(null);
    updateQueryCounters();
}

window._currentAlertSubjectId = null;

//-- Handle managing alerts modal (fetching, rendering, adding, removing) --\\
async function openManageAlertsModal() {
    const selectedRow = document.querySelector('#query-table-real tr.query-row-selected');
    if (!selectedRow) { alert('No query result selected.'); return; }
    const rowId = Number(selectedRow.dataset.qid);
    const response = (window._queryResponses || {})[rowId];
    if (!response || !response._playerId) { alert('Player ID not found for this result.'); return; }
    window._currentAlertSubjectId = response._playerId;
    document.getElementById('manageAlertsIdLabel').textContent = 'DL #: ' + response._playerId;
    document.getElementById('manageAlertsStatus').textContent = '';
    document.getElementById('newAlertInput').value = '';
    document.getElementById('manageAlertsHolder').innerHTML = '<p style="color:#999;">Loading...</p>';
    showModal('manageAlertsModal');

    const authClient = getRlsClient();
    const { data: rows, error } = await authClient
        .from('Alerts')
        .select('id,alert')
        .eq('id', response._playerId)
        .limit(1);

    if (error) {
        console.error('Error loading alerts:', error);
        document.getElementById('manageAlertsStatus').textContent = 'Error loading alerts.';
    }

    const arr = (rows && rows.length > 0 && Array.isArray(rows[0].alert)) ? rows[0].alert : [];
    renderManageAlertsHolder(arr);
}

//-- Render the list of alerts in the manage alerts modal, with remove buttons --\\
function renderManageAlertsHolder(alertsVal) {
    const holder = document.getElementById('manageAlertsHolder');
    if (!holder) return;
    const list = Array.isArray(alertsVal)
        ? alertsVal.filter(Boolean)
        : (alertsVal && alertsVal !== 'NONE' ? [alertsVal] : []);
    if (list.length === 0) {
        holder.innerHTML = '<p style="color:#999; font-style:italic;">No alerts on file.</p>';
        return;
    }
    holder.innerHTML = list.map((alert, i) => `
                <div class="row" style="align-items:center; margin-bottom:4px; gap:6px;">
                    <span class="cell-auto" style="color:red; font-weight:bold;">${escapeHtml(alert)}</span>
                    <button class="cell-2 button bg-red fg-white" style="border-radius:0 !important; padding:2px 6px;" onclick="removeAlertAtIndex(${i})">Remove</button>
                </div>`).join('');
}

//-- Remove an alert at a specific index for the current subject, then update Supabase, re-render modal list, and update query response display --\\
async function removeAlertAtIndex(index) {
    const playerId = window._currentAlertSubjectId;
    if (!playerId) return;
    const status = document.getElementById('manageAlertsStatus');
    status.textContent = 'Saving...';

    const authClient = getRlsClient();
    const { data: rows, error: getError } = await authClient
        .from('Alerts')
        .select('id,alert')
        .eq('id', playerId)
        .limit(1);
    if (getError) { status.textContent = 'Error loading record.'; return; }

    const current = (rows && rows.length > 0 && Array.isArray(rows[0].alert))
        ? [...rows[0].alert] : [];
    current.splice(index, 1);

    const { error: updateError } = await authClient
        .from('Alerts')
        .update({ alert: current })
        .eq('id', playerId);
    if (updateError) { status.textContent = 'Error saving.'; return; }

    status.textContent = 'Saved.';
    renderManageAlertsHolder(current);
    refreshAlertInQueryResponse(playerId, current);
}

//-- Add alert to a person --\\
async function addAlertToSubject() {
    const playerId = window._currentAlertSubjectId;
    const newAlert = document.getElementById('newAlertInput').value.trim();
    if (!playerId) return;
    if (!newAlert) { document.getElementById('manageAlertsStatus').textContent = 'Enter alert text first.'; return; }
    const status = document.getElementById('manageAlertsStatus');
    status.textContent = 'Saving...';

    const authClient = getRlsClient();
    const { data: rows, error: getError } = await authClient
        .from('Alerts')
        .select('id,alert')
        .eq('id', playerId)
        .limit(1);
    if (getError) { status.textContent = 'Error loading record.'; return; }

    let newArr;
    if (!rows || rows.length === 0) {
        newArr = [newAlert];
        const { error: insertError } = await authClient
            .from('Alerts')
            .insert([{ id: playerId, alert: newArr }]);
        if (insertError) { status.textContent = 'Error saving.'; return; }
    } else {
        const current = Array.isArray(rows[0].alert) ? [...rows[0].alert] : [];
        current.push(newAlert);
        newArr = current;
        const { error: updateError } = await authClient
            .from('Alerts')
            .update({ alert: newArr })
            .eq('id', playerId);
        if (updateError) { status.textContent = 'Error saving.'; return; }
    }

    status.textContent = 'Alert added.';
    document.getElementById('newAlertInput').value = '';
    renderManageAlertsHolder(newArr);
    refreshAlertInQueryResponse(playerId, newArr);
}

//-- Refresh alert display in query response --\\
function refreshAlertInQueryResponse(playerId, newAlertsVal) {
    const displayStr = Array.isArray(newAlertsVal) ? newAlertsVal.join(', ') : (newAlertsVal || '');
    for (const rowId of Object.keys(window._queryResponses || {})) {
        const r = window._queryResponses[rowId];
        if (r && r._playerId === playerId) {
            r.alerts = displayStr;
            const alertsEl = document.getElementById('alertsContainer');
            if (alertsEl) alertsEl.textContent = displayStr;
        }
    }
}

function formatQueryList(val) {
    if (!val || val === 'None' || val === 'N/A' || val === '0') return val || '';
    return String(val).split(',').map(s => escapeHtml(s.trim())).filter(Boolean).join('<br>');
}

//-- Show details of a query --\\
function showQueryDetail(id) {
    let respFrom = document.getElementById('queryDetailFrom');
    let person = document.getElementById('personHeader');
    let alerts = document.getElementById('alertsContainer');
    let gender = document.getElementById('queryGenderContainer');
    let age = document.getElementById('queryAgeContainer');
    let infractions = document.getElementById('queryInfractionContainer');
    let arrests = document.getElementById('queryArrestContainer');

    const placeholder = document.getElementById('query-detail-placeholder');
    const detailArea = document.getElementById('query-detail-area');

    if (!id) {
        if (placeholder) placeholder.style.display = '';
        if (detailArea) detailArea.style.display = 'none';
        return;
    }

    const row = (window._queryRows || []).find(r => r.id === id);
    if (!row) {
        if (placeholder) placeholder.style.display = '';
        if (detailArea) detailArea.style.display = 'none';
        return;
    }

    document.querySelectorAll('#query-table-real tr').forEach(tr => {
        tr.classList.toggle('query-row-selected', tr.dataset.qid == id);
    });

    if (placeholder) placeholder.style.display = 'none';
    if (detailArea) detailArea.style.display = '';

    const response = (window._queryResponses || {})[id] || {};
    if (respFrom) respFrom.textContent = response.from || '';
    if (person) person.textContent = response.name || '';
    if (alerts) alerts.textContent = response.alerts || '';
    if (gender) gender.textContent = response.gender || '';
    if (age) age.textContent = response.age || '';
    if (infractions) infractions.innerHTML = formatQueryList(response.infractions);
    if (arrests) arrests.innerHTML = formatQueryList(response.arrests);


}


function queryToggleAll(cb) {
    document.querySelectorAll('.query-row-check').forEach(c => c.checked = cb.checked);
}

//-- Delete a query row based on selections -\\
function deleteSelectedQueryRows() {
    const toDelete = [];
    document.querySelectorAll('#query-table-real tr').forEach(tr => {
        const cb = tr.querySelector('.query-row-check');
        if (cb && cb.checked) toDelete.push(String(tr.dataset.qid));
    });
    if (toDelete.length === 0) return;
    if (window._queryFolder === 'trash') {
        window._queryRows = (window._queryRows || []).filter(r => !toDelete.includes(String(r.id)));
    } else {
        (window._queryRows || []).forEach(r => {
            if (toDelete.includes(String(r.id))) r.folder = 'trash';
        });
    }
    renderQueryTable();
}

//-- View details of selected query rows (if multiple, just open first one and user can click others) --\\
function viewSelectedQueryRows() {
    const selected = [];
    document.querySelectorAll('#query-table-real tr').forEach(tr => {
        const cb = tr.querySelector('.query-row-check');
        if (cb && cb.checked) selected.push(Number(tr.dataset.qid));
    });
    if (selected.length === 0) {
        const selTr = document.querySelector('#query-table-real tr.query-row-selected');
        if (selTr) showQueryDetail(Number(selTr.dataset.qid));
        return;
    }
    showQueryDetail(selected[0]);
}

// -- Draft helpers -- \\
function _captureQueryFormState() {
    const platePanel = document.getElementById('input-plate-info');
    const isPlate = platePanel && platePanel.style.display !== 'none';
    return {
        type: isPlate ? 'vehicle' : 'person',
        plateInput: (document.getElementById('plateInput') || {}).value || '',
        plateTyp: (document.getElementById('plateTyp') || {}).value || '',
        plateState: (document.getElementById('plateState') || {}).value || '',
        vin: (document.getElementById('vin') || {}).value || '',
        licensePlateYear: (document.getElementById('licensePlateYear') || {}).value || '',
        purpCode: (document.getElementById('purpCode') || {}).value || '',
        personInput: (document.getElementById('personInput') || {}).value || '',
        lastNameInput: (document.getElementById('lastNameInput') || {}).value || '',
        firstNameInput: (document.getElementById('firstNameInput') || {}).value || '',
        dobInput: (document.getElementById('dobInput') || {}).value || '',
        ssnInput: (document.getElementById('ssnInput') || {}).value || '',
        incidentInput: (document.getElementById('incidentInput') || {}).value || '',
    };
}

//--- Restore query input from a draft obj --\\
function _restoreQueryFormState(state) {
    if (!state) return;
    switchQueryInputPanel(state.type === 'vehicle' ? 'CAL-OP' : 'PERSON');
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('plateInput', state.plateInput); set('plateTyp', state.plateTyp); set('plateState', state.plateState);
    set('vin', state.vin); set('licensePlateYear', state.licensePlateYear); set('purpCode', state.purpCode);
    set('personInput', state.personInput); set('lastNameInput', state.lastNameInput);
    set('firstNameInput', state.firstNameInput); set('dobInput', state.dobInput);
    set('ssnInput', state.ssnInput); set('incidentInput', state.incidentInput);
}

//-- Save query input draft --\\
function saveQueryDraft() {
    const state = _captureQueryFormState();
    const criteria = state.type === 'vehicle' ? `VEH: ${state.plateInput || '(no plate)'}` : `PERSON: ${state.personInput || '(no ID)'}`;
    const existingId = window._activeDraftId;
    const rowId = existingId || Date.now();

    if (existingId) {
        const row = (window._queryRows || []).find(r => r.id === existingId);
        if (row) {
            row.criteria = criteria;
            row.received = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            row.folder = 'drafts';
        }
    } else {
        window._queryRows = [{
            id: rowId,
            criteria,
            summary: '',
            received: new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
            responseType: 'Draft',
            folder: 'drafts'
        }, ...window._queryRows];
    }
    window._queryDrafts[rowId] = state;
    window._activeDraftId = null;
    resetQueryFields();
    const qv = document.getElementById('query-opts-view');
    if (qv) qv.style.setProperty('display', 'none', 'important');
    const submitFoot = document.getElementById('submit-query-foot');
    if (submitFoot) submitFoot.style.display = 'none';
    updateView('queryResults').then(() => switchQueryFolder('drafts', null));
}

/* Open a draft for editing 
 * If it's a vehicle draft, open plate input panel and populate fields
 * If it's a person draft, open person input panel and populate fields
 * Set activeDraftId to the opened draft's id so that if they submit, it updates that draft instead of creating a new query
 */
function openDraft(rowId) {
    const state = window._queryDrafts[rowId];
    if (!state) return;
    window._activeDraftId = rowId;
    showQueryOptsView(state.type === 'vehicle' ? 'CAL-OP' : 'PERSON');
    _restoreQueryFormState(state);
}

function resetQueryFields() {
    ['plateInput', 'vin', 'licensePlateYear', 'personInput', 'lastNameInput', 'firstNameInput', 'ssnInput', 'incidentInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const dob = document.getElementById('dobInput');
    if (dob) dob.value = '';
    const plateTyp = document.getElementById('plateTyp');
    if (plateTyp) plateTyp.selectedIndex = 0;
    const plateState = document.getElementById('plateState');
    if (plateState) plateState.value = 'CA';
    const purpCode = document.getElementById('purpCode');
    if (purpCode) purpCode.selectedIndex = 0;
}

//-- Actually Querying Logic --\\\
/*
 * {
 *  Age:
 *  Bank:
 *  Charges: (empty str for none)
 *  FName:
 *  Gas:
 *  Gender:
 *  GunLicense:
 *  Infractions:
 *  LName:
 *  LicenseRevokedUntil: (0 for false) 
 *  Money:
 *  Number of arrests:
 *  OwnedVehicles: (list them off like 0 is first veh owned, 1, two, etc)
 * }
 *  
 */

function submitQueryForm() {
    const platePanel = document.getElementById('input-plate-info');
    const plateVisible = platePanel && platePanel.style.display !== 'none';
    if (window._activeDraftId) {
        window._queryRows = (window._queryRows || []).filter(r => r.id !== window._activeDraftId);
        delete window._queryDrafts[window._activeDraftId];
        window._activeDraftId = null;
    }
    query(plateVisible ? 'vehicle' : 'person');
}

//-- get the current time in PST (I HAD THIS BEFORE HOLY SHIT WHY DID I MAKE IT AGAIN WHAT THE FUCK) note 2 underscore to prevent syntax errors -\\
function _timeNow() {
    return new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

//-- hide query input
function _hideQueryInput() {
    const qv = document.getElementById('query-opts-view');
    if (qv) qv.style.setProperty('display', 'none', 'important');
    const submitFoot = document.getElementById('submit-query-foot');
    if (submitFoot) submitFoot.style.display = 'none';
}

//-- Handle querying --\\
async function query(type) {
    if (type === 'person') {
        const inputId = document.getElementById('personInput').value.trim();
        if (!inputId) { alert('Please enter a person ID to query.'); return; }

        const rowId = Date.now();
        const criteria = `PERSON: ${inputId}`;

        // add pending b4 req processed, due to new system might get stuck here...
        window._queryRows = [{
            id: rowId,
            criteria,
            summary: '',
            received: _timeNow(),
            responseType: 'Person Query Result',
            folder: 'pending'
        }, ...window._queryRows];
        window._queryResponses[rowId] = { from: 'NCIC / DMV', name: '...', alerts: 'Pending', gender: '', age: '', infractions: '', arrests: '', licenseRevoked: '', _playerId: inputId };

        _hideQueryInput();
        await updateView('queryResults');
        switchQueryFolder('pending', null);

        try {
            const rlsClient = getRlsClient();
            const { data, error } = await rlsClient.functions.invoke('query-player', {
                body: { playerId: inputId }
            });

            // if err
            if (error && error.message !== '404') {
                console.error('Error from query function:', error);
                const row = (window._queryRows || []).find(r => r.id === rowId);
                if (row) { row.folder = 'posted'; row.summary = 'Error fetching data'; row.responseType = 'ERROR – Fetch Failed'; }
                window._queryResponses[rowId] = { from: 'NCIC / DMV', name: 'Error: ' + (error.message || error), alerts: 'N/A', gender: '', age: '', infractions: '', arrests: '', licenseRevoked: '', _playerId: inputId };
                playSound('query');
                renderQueryTable();
                switchQueryFolder('posted', null);
                return;
            }

            // if no data 
            if (!data) {
                const row = (window._queryRows || []).find(r => r.id === rowId);
                if (row) { row.folder = 'posted'; row.summary = 'No record found'; row.responseType = 'ERROR – No Record'; }
                window._queryResponses[rowId] = { from: 'NCIC / DMV', name: 'No record found', alerts: 'N/A', gender: '', age: '', infractions: '', arrests: '', licenseRevoked: '', _playerId: inputId };
                playSound('query');
                renderQueryTable();
                switchQueryFolder('posted', null);
                return;
            }

            const age = data.Age || 'N/A';
            const arrests = data.Charges === '' ? 'None' : data.Charges || 'None';
            const gender = data.Gender === 'Male' ? 'M - Male' : 'F - Female';
            const infractions = data.Infractions === '' ? 'None' : (data.Infractions || 'None');
            const name = ((data.FName || '') + ' ' + (data.LName || '')).trim() || inputId;
            const licenseRevoked = data.LicenseRevokedUntil && data.LicenseRevokedUntil !== 0
                ? `Revoked until ${data.LicenseRevokedUntil}` : 'Valid';

            let alerts = 'NONE';
            try {
                const { data: alertData, error: alertErr } = await sbClient.from('Alerts').select('id, alert').eq('id', inputId);
                if (!alertErr && alertData && alertData.length > 0 && Array.isArray(alertData[0].alert) && alertData[0].alert.length > 0) {
                    alerts = alertData[0].alert.join(', ');
                }
            } catch (alertFetchErr) {
                console.warn('Alert fetch failed:', alertFetchErr);
            }
            playSound('query');

            // move row to responses if no err or data tru
            const row = (window._queryRows || []).find(r => r.id === rowId);
            if (row) { row.folder = 'responses'; row.summary = name; }
            window._queryResponses[rowId] = { from: 'NCIC / DMV', name, alerts, gender, age: String(age), infractions, arrests: String(arrests), licenseRevoked, _playerId: inputId };
            renderQueryTable();
            switchQueryFolder('responses', null);
            showQueryDetail(rowId);

        } catch (err) {
            console.error('Error performing person query:', err);
            // move posted if err, but with error message in summary and response type
            const row = (window._queryRows || []).find(r => r.id === rowId);
            if (row) { row.folder = 'posted'; row.summary = 'Request failed'; row.responseType = 'ERROR – Fetch Failed'; }
            window._queryResponses[rowId] = { from: 'NCIC / DMV', name: 'Error: ' + (err.message || err), alerts: 'N/A', gender: '', age: '', infractions: '', arrests: '', licenseRevoked: '', _playerId: inputId };
            playSound('query');
            renderQueryTable();
            switchQueryFolder('posted', null);
        }

    } else if (type === 'vehicle') {
        alert('Sorry, vehicle querying is not yet functional. Please query by person ID.');
    }
}

// ----------------
// QUERY RESULTS IN INCIDENTS
// -------------------

// SHOUTOUT TO COPILOT FOR THE HELP YOOOOO

// Returns the full calls.id for the incident the current user's unit is attached to.
// units.inc stores only the last4 (e.g. "2234"), while calls.id is the full formatted
// ID (e.g. "2026-2234"). We look up the matching calls row by last4 to get the real ID.
async function getEffectiveIncidentId() {
    if (!sbClient) return currentIncidentId || null;
    const userInfo = sessionStorage.getItem('userInfo');
    const currentUser = userInfo ? userInfo.split(',')[0] : null;
    if (currentUser) {
        try {
            const { data: unitRow } = await sbClient.from('units').select('inc').eq('user', currentUser).limit(1).maybeSingle();
            const last4 = unitRow?.inc ? String(unitRow.inc).trim() : null;
            if (last4) {
                // Resolve the last4 to the full calls.id
                const { data: callRow } = await sbClient.from('calls').select('id').eq('last4', last4).limit(1).maybeSingle();
                if (callRow?.id) return String(callRow.id);
            }
        } catch (e) { /* fall through */ }
    }

    return currentIncidentId || null;
}

// Open the Query Results modal for the current incident
async function openIncQueryResultsModal() {
    if (!sbClient) { showModal('incQueryResultsModal'); return; }
    const incId = await getEffectiveIncidentId();
    if (!incId) { showModal('incQueryResultsModal'); return; }
    const holder = document.getElementById('incQueryResultsHolder');
    if (holder) holder.innerHTML = '<p style="color:#999;">Loading...</p>';
    showModal('incQueryResultsModal');
    try {
        const { data } = await sbClient.from('calls').select('queries').eq('id', incId).maybeSingle();
        const rawQueries = Array.isArray(data?.queries) ? data.queries : [];
        const queries = rawQueries.map(q => { try { return (typeof q === 'string') ? JSON.parse(q) : q; } catch (e) { return null; } }).filter(Boolean);
        if (!holder) return;
        if (queries.length === 0) {
            holder.innerHTML = '<p style="color:#999; margin:10px;">No query results attached to this incident.</p>';
            return;
        }
        holder.innerHTML = '';
        queries.forEach((q, i) => {
            const div = document.createElement('div');
            div.style.cssText = 'border:1px solid #ddd; border-radius:2px; padding:8px; margin-bottom:8px; background:#f9f9f9; position:relative;';
            const timestamp = q.received ? `${q.received}${q.addedBy ? ' (' + q.addedBy + ')' : ''}` : (q.addedBy || '');
            div.innerHTML = `
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <b style="font-size:12px;">#${i + 1} — ${q.type === 'vehicle' ? 'Vehicle Query' : 'Person Query'}</b>
                            <span style="font-size:11px; color:#888;">${timestamp}</span>
                        </div>
                        <div><b>Criteria:</b> ${q.criteria || '—'}</div>
                        <div><b>Result:</b> ${q.name || q.summary || '—'}</div>
                        ${q.alerts ? `<div><b>Alerts:</b> <span style="color:${q.alerts === 'NONE' || q.alerts === 'N/A' ? '#888' : '#c00'}">${q.alerts}</span></div>` : ''}
                        ${q.gender ? `<div><b>Gender:</b> ${q.gender} &nbsp; <b>Age:</b> ${q.age || '—'}</div>` : ''}
                        <button onclick="removeQueryFromIncident(${i})" style="position:absolute; bottom:6px; right:6px; background:none; border:1px solid #bbb; border-radius:2px; color:#888; cursor:pointer; font-size:13px; line-height:1; padding:1px 6px;" title="Remove this query result">&minus;</button>
                    `;
            holder.appendChild(div);
        });
    } catch (e) {
        if (holder) holder.innerHTML = '<p style="color:#c00;">Failed to load query results.</p>';
    }
}

async function refreshIncQueryCounter() {
    if (!sbClient) return;
    const incId = await getEffectiveIncidentId();
    if (!incId) return;
    try {
        const { data } = await sbClient.from('calls').select('queries').eq('id', incId).maybeSingle();
        const rawQ = Array.isArray(data?.queries) ? data.queries : [];
        const count = rawQ.filter(q => { try { const p = typeof q === 'string' ? JSON.parse(q) : q; return p && typeof p === 'object'; } catch (e) { return false; } }).length;
        const el = document.getElementById('incQueryCounter');
        if (el) el.textContent = `(${count})`;
    } catch (e) { /* silent */ }
}

async function removeQueryFromIncident(index) {
    const userInfo = sessionStorage.getItem('userInfo');
    const currentUser = userInfo ? userInfo.split(',')[0] : null;
    const currentUnit = userInfo ? userInfo.split(',')[2] : null;

    if (!sbClient) return;
    const incId = await getEffectiveIncidentId();
    if (!incId) return;
    try {
        const { data } = await sbClient
            .from('calls')
            .select('queries, history')
            .eq('id', incId)
            .maybeSingle();
        const rawQ = Array.isArray(data?.queries) ? data.queries : [];
        const parsed = rawQ.map(q => { try { return typeof q === 'string' ? JSON.parse(q) : q; } catch (e) { return null; } }).filter(Boolean);
        parsed.splice(index, 1);
        const { error } = await sbClient
            .from('calls')
            .update({
                queries: parsed,
                history: [data.history, `${currentUnit} (${currentUser}) removed a query result from the incident.`].filter(Boolean).join(' | ')
            })
            .eq('id', incId);
        if (error) throw error;
        refreshIncQueryCounter();
        openIncQueryResultsModal();
    } catch (e) {
        alert('Failed to remove query: ' + (e.message || e));
    }
}

function autoQueryId(idValue) {
    if (!idValue || idValue === '\u2014') return;
    closeModal('incPerModal');
    const isDispatch = document.getElementById('dispatchingArea')?.classList.contains('dispatch-active');
    if (isDispatch) {
        openDispatchQuery('person');
        setTimeout(() => {
            const inp = document.getElementById('dispQueryId');
            if (inp) { inp.value = idValue; runDispatchQuery(); }
        }, 100);
    } else {
        showQueryOptsView('PERSON');
        setTimeout(() => {
            const personInput = document.getElementById('personInput');
            if (personInput) personInput.value = idValue;
        }, 150);
    }
}

async function attachQueryToIncident(rowId) {
    if (!sbClient) return;
    const incId = await getEffectiveIncidentId();
    if (!incId) { alert('No incident open. Open an incident first before attaching a query.'); return; }
    const response = (window._queryResponses || {})[rowId];
    const row = (window._queryRows || []).find(r => r.id === rowId);
    if (!response && !row) { alert('Query result not found.'); return; }
    const _userInfo = sessionStorage.getItem('userInfo');
    const _callsign = _userInfo ? (_userInfo.split(',')[2] || 'DISPATCH') : 'DISPATCH';
    const queryEntry = {
        type: response?._playerId ? 'person' : 'vehicle',
        criteria: row?.criteria || '',
        name: response?.name || '',
        alerts: response?.alerts || '',
        gender: response?.gender || '',
        age: response?.age || '',
        infractions: response?.infractions || '',
        arrests: response?.arrests || '',
        received: row?.received || new Date().toLocaleTimeString('en-US', { hour12: false }),
        summary: row?.summary || '',
        addedBy: _callsign
    };
    try {
        const { data: existing } = await sbClient.from('calls').select('queries').eq('id', incId).maybeSingle();
        const currentQueries = Array.isArray(existing?.queries) ? existing.queries : [];
        const updated = [...currentQueries, queryEntry];
        const { error } = await sbClient
            .from('calls')
            .update({
                queries: updated,
                history: [existing?.history, `${_callsign} (${_userInfo ? _userInfo.split(',')[0] : 'Unknown'}) attached a query result to the incident.`].filter(Boolean).join(' | ')
            })
            .eq('id', incId);
        if (error) throw error;
        alert(`Query attached to incident ${incId}.`);
        refreshIncQueryCounter();
    } catch (e) {
        alert('Failed to attach query: ' + (e.message || e));
    }
}

async function sendQryToInc() {
    const incId = await getEffectiveIncidentId();
    if (!incId) { alert('No incident open. Open an incident first.'); return; }
    const checked = document.querySelectorAll('#query-table-real tr .query-row-check:checked');
    if (checked.length === 0) { alert('No query rows selected. Check at least one row.'); return; }
    const rowIds = Array.from(checked).map(cb => Number(cb.closest('tr').dataset.qid));
    let attached = 0;
    try {
        const { data: existing } = await sbClient.from('calls').select('queries').eq('id', incId).maybeSingle();
        const currentQueries = Array.isArray(existing?.queries) ? existing.queries : [];
        const newEntries = rowIds.map(rowId => {
            const response = (window._queryResponses || {})[rowId];
            const row = (window._queryRows || []).find(r => r.id === rowId);
            if (!response && !row) return null;
            attached++;
            const _ui = sessionStorage.getItem('userInfo');
            const _cs = _ui ? (_ui.split(',')[2] || 'DISPATCH') : 'DISPATCH';
            return {
                type: response?._playerId ? 'person' : 'vehicle',
                criteria: row?.criteria || '',
                name: response?.name || '',
                alerts: response?.alerts || '',
                gender: response?.gender || '',
                age: response?.age || '',
                infractions: response?.infractions || '',
                arrests: response?.arrests || '',
                received: row?.received || new Date().toLocaleTimeString('en-US', { hour12: false }),
                summary: row?.summary || '',
                addedBy: _cs
            };
        }).filter(Boolean);
        const { error } = await sbClient.from('calls').update({ queries: [...currentQueries, ...newEntries] }).eq('id', incId);
        if (error) throw error;
        alert(`${attached} query result(s) sent to incident ${incId}.`);
        refreshIncQueryCounter();
    } catch (e) {
        alert('Failed to send queries: ' + (e.message || e));
    }
}

function createTrafficStopFromQuery() {
    const selectedRow = document.querySelector('#query-table-real tr.query-row-selected');
    const rowId = selectedRow ? Number(selectedRow.dataset.qid) : null;
    const response = rowId ? (window._queryResponses || {})[rowId] : null;
    const row = rowId ? (window._queryRows || []).find(r => r.id === rowId) : null;

    const narEl = document.getElementById('trafficStopNarrative');
    if (narEl && response) {
        narEl.value = `${row?.criteria || ''} — ${response.name || 'No record'}${response.alerts && response.alerts !== 'N/A' ? ' | ALERTS: ' + response.alerts : ''}`;
    }

    if (row?.criteria && row.criteria.toLowerCase().startsWith('veh:')) {
        const plate = row.criteria.replace(/^veh:\s*/i, '').trim();
        // clear existing vehicles and add one
        const holder = document.getElementById('trafficStopVehHolder');
        if (holder) {
            holder.innerHTML = '';
            addTrafficStopVehicle();
            const plateInput = holder.querySelector('input[placeholder="Plate"]');
            if (plateInput) plateInput.value = plate;
        }
    }

    window._pendingTrafficStopQueryId = rowId;
    showModal('trafficStopModal');
}