var currentView = 'incidentsView';
var lastMainView = 'incidentsView';
var unitLiveMonitorChannel = null;
var callLiveMonitorChannel = null;
var advCallLiveMonitorChannel = null;
var incidentDetailsChannel = null;
var unitRequestAlertChannel = null;
var logoffRequestChannel = null;
var unitTableRefreshInterval = null;
var callTableRefreshInterval = null;
var advCallTableRefreshInterval = null;
var incidentRefreshInterval = null;
var suppressOwnUnitUpdateSoundUntil = 0;
var unloadLogoffTriggered = false;
var currentAdvCallsView = 'assigned';
var currentIncidentId = null;
var pendingCloseIncidentLast4 = null;
var incVehAddMode = false;
var incVehRemoveMode = false;
var incPerAddMode = false;
var incPerRemoveMode = false;
var incomingUnitRequestQueue = [];
var activeIncomingUnitRequest = null;
var seenIncomingUnitRequestKeys = new Set();
var processedCmds = [];
var surfedPages = [];
var currentPageIndex = -1;
var mdtGlobalInitComplete = false;
var mdtLayoutResizeBound = false;

function speakGpsOnline() {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;

    const sayOnline = () => {
        const utterance = new SpeechSynthesisUtterance('GPS online');
        utterance.rate = 0.95;
        utterance.pitch = 1.15;
        utterance.volume = 0.9;

        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(voice => /female|zira|samantha|aria|jenny|natural/i.test(voice.name))
            || voices.find(voice => /^en[-_]/i.test(voice.lang));

        if (preferredVoice) utterance.voice = preferredVoice;

        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    };

    if (window.speechSynthesis.getVoices().length) {
        sayOnline();
    } else {
        window.speechSynthesis.onvoiceschanged = sayOnline;
    }
}

function startGpsOfflineSequence() {
    const gpsEl = document.getElementById('gps-status');
    if (!gpsEl) return;

    gpsEl.style.backgroundColor = 'green';
    gpsEl.textContent = 'GPS Online';
    setTimeout(speakGpsOnline, 2000);
}

//-- Request any type of key --\\
async function requestKey(inputId, errorId, keyNameInDb, successCallback) {
    const inputElement = document.getElementById(inputId);
    const errorElement = document.getElementById(errorId);
    if (!inputElement || !errorElement) return;

    const userKeyValue = inputElement.value.trim();
    errorElement.textContent = '';

    let jwtKey = sessionStorage.getItem('userToken');
    if (!jwtKey) {
        errorElement.textContent = 'User not authenticated. Please log in again.';
        return;
    }

    try {
        const response = await fetch('https://lgajaitgqqznzlzjazxn.supabase.co/functions/v1/verify-key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwtKey}`
            },
            body: JSON.stringify({
                keyName: keyNameInDb,
                userKey: userKeyValue
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            inputElement.value = '';

            if (result.token) {
                sessionStorage.setItem('userToken', result.token);
                if (typeof refreshSupabaseClient === 'function') await refreshSupabaseClient();
            }

            successCallback();
        } else {
            errorElement.textContent = result.error || 'Incorrect key. Please try again.';
        }
    } catch (err) {
        console.error('Key request error:', err);
        errorElement.textContent = 'A connection error occurred.';
    }
}


/*
 * HELPER FUNCTIONS BEYOND THIS POINT (that dont fall into any specific category)
 */

function movePages(direction) {
    if (surfedPages.length === 0) return;
    if (direction === 'next') {
        if (currentPageIndex < surfedPages.length - 1) {
            currentPageIndex++;
            executePage(surfedPages[currentPageIndex]);
        }
    } else if (direction === 'prev') {
        // Move backward in history
        if (currentPageIndex > 0) {
            currentPageIndex--;
            executePage(surfedPages[currentPageIndex]);
        }
    }
}

function executePage(page) {
    // Check if it's an incident display command (contains 'showIncident')
    if (typeof page === 'string' && page.includes('showIncident')) {
        // Execute the incident display
        eval(page);
    } else {
        // It's a view name, navigate to it
        updateView(page);
    }
}
async function syncLiveMonitorsForCurrentView() {
    if (!sbClient) return;

    const callIfFn = (name) => {
        const fn = window[name];
        if (typeof fn === 'function') fn();
    };
    const awaitIfFn = async (name) => {
        const fn = window[name];
        if (typeof fn === 'function') await fn();
    };

    if (currentView === 'incidentsView') {
        callIfFn('stopUnitTableRefreshLoop');
        callIfFn('stopAdvCallTableRefreshLoop');
        callIfFn('stopIncidentRefreshLoop');
        await awaitIfFn('unsubscribeUnitLiveMonitor');
        await awaitIfFn('unsubscribeAdvCallsLiveMonitor');
        await awaitIfFn('setupCallsLiveMonitor');
        callIfFn('startCallTableRefreshLoop');
        return;
    }

    if (currentView === 'units-table') {
        callIfFn('stopCallTableRefreshLoop');
        callIfFn('stopAdvCallTableRefreshLoop');
        callIfFn('stopIncidentRefreshLoop');
        await awaitIfFn('unsubscribeCallsLiveMonitor');
        await awaitIfFn('unsubscribeAdvCallsLiveMonitor');
        await awaitIfFn('setupUnitLiveMonitor');
        callIfFn('startUnitTableRefreshLoop');
        return;
    }

    if (currentView === 'callsAdvTable') {
        callIfFn('stopUnitTableRefreshLoop');
        callIfFn('stopCallTableRefreshLoop');
        callIfFn('stopIncidentRefreshLoop');
        await awaitIfFn('unsubscribeCallsLiveMonitor');
        await awaitIfFn('unsubscribeUnitLiveMonitor');
        await awaitIfFn('setupAdvCallsLiveMonitor');
        callIfFn('startAdvCallTableRefreshLoop');
        return;
    }

    if (currentView === 'incidentDetails') {
        callIfFn('stopUnitTableRefreshLoop');
        callIfFn('stopCallTableRefreshLoop');
        callIfFn('stopAdvCallTableRefreshLoop');
        await awaitIfFn('unsubscribeCallsLiveMonitor');
        await awaitIfFn('unsubscribeUnitLiveMonitor');
        await awaitIfFn('unsubscribeAdvCallsLiveMonitor');
        callIfFn('startIncidentRefreshLoop');
        return;
    }

    callIfFn('stopUnitTableRefreshLoop');
    callIfFn('stopCallTableRefreshLoop');
    callIfFn('stopAdvCallTableRefreshLoop');
    callIfFn('stopIncidentRefreshLoop');
    await awaitIfFn('unsubscribeCallsLiveMonitor');
    await awaitIfFn('unsubscribeUnitLiveMonitor');
    await awaitIfFn('unsubscribeAdvCallsLiveMonitor');
}

function playSound(type) {
    const url = SOUND_URLS[type];
    if (!url) return;
    let audio = document.getElementById('audio-player');
    if (!audio) {
        audio = document.createElement('audio');
        audio.id = 'audio-player';
        document.body.appendChild(audio);
    }
    audio.pause();
    audio.src = url;
    audio.load();
    audio.play().catch(e => console.warn("Audio blocked:", e));
}

//-- Incident ID Key Logic --\\
function acceptSupervisorKey() {
    closeModal('supervisorKeyModal');
    showModal('supervisorSetIncidentModal');
}

//-- Dispatch Key Logic --\\
function acceptDispatchKey() {
    document.getElementById('dispatchLoginArea').style.display = 'none';
    const mainActionButtons = document.getElementById('mainActionButtons');
    if (mainActionButtons) mainActionButtons.style.display = 'none';
    document.querySelectorAll('#mainApp > .px-5, #mainApp > .container-fluid').forEach(el => {
        el.style.display = 'none';
    });
    document.getElementById('dispatchingArea').classList.add('dispatch-active');
    document.getElementById('titleBar').style.display = 'block';
    const homeFoot = document.getElementById('home-foot');
    if (homeFoot) homeFoot.style.display = 'none';
}

function addCode6Person() {
    const holder = document.getElementById('code6VehHolder');
    const personDiv = document.createElement('div');
    personDiv.classList.add('grid');
    personDiv.style.marginBottom = '10px';
    personDiv.innerHTML = `
                    <div class="row">
                        <input type="text" class="cell-6" placeholder="Name" style="border-radius: 0px !important; padding: 5px;">
                        <input type="text" class="cell-6" placeholder="Clothing Desc" style="border-radius: 0px !important; padding: 5px;">
                    </div>
                    <div class="row">
                        <input type="text" class="cell-4" placeholder="Race" style="border-radius: 0px !important; padding: 5px;">
                        <input type="text" class="cell-4" placeholder="Sex" style="border-radius: 0px !important; padding: 5px;">
                        <input type="text" class="cell-4" placeholder="ID#" style="border-radius: 0px !important; padding: 5px;">
                    </div>
                `;
    holder.appendChild(personDiv);
}

function removeCode6Person() {
    const holder = document.getElementById('code6VehHolder');
    if (holder.children.length > 0) {
        holder.removeChild(holder.lastChild);
    } else {
        alert('No persons to remove.');
    }
}

function addTrafficStopVehicle() {
    const holder = document.getElementById('trafficStopVehHolder');
    if (holder.children.length >= 3) {
        alert('Maximum of 3 vehicles can be added to a traffic stop.');
        return;
    }
    const vehicleDiv = document.createElement('div');
    vehicleDiv.classList.add('grid');
    vehicleDiv.style.marginBottom = '10px';
    vehicleDiv.innerHTML = `
                    <div class="row">
                        <input type="text" class="cell-4" placeholder="Year" style="border-radius: 0px !important; padding: 5px;">
                        <input type="text" class="cell-4" placeholder="Make" style="border-radius: 0px !important; padding: 5px;">
                        <input type="text" class="cell-4" placeholder="Model" style="border-radius: 0px !important; padding: 5px;">
                    </div>
                    <div class="row">
                        <input type="text" class="cell-6" placeholder="Color" style="border-radius: 0px !important; padding: 5px;">
                        <input type="text" class="cell-6" placeholder="Plate" style="border-radius: 0px !important; padding: 5px;">
                    </div>
                `;
    holder.appendChild(vehicleDiv);
}

function removeTrafficStopVehicle() {
    const holder = document.getElementById('trafficStopVehHolder');
    if (holder.children.length > 0) {
        holder.removeChild(holder.lastChild);
    } else {
        alert('No vehicles to remove.');
    }
}

function getCode6Persons() {
    const holder = document.getElementById('code6VehHolder');
    if (!holder) return [];
    const persons = [];
    holder.querySelectorAll('.grid').forEach(personDiv => {
        const inputs = personDiv.querySelectorAll('input');
        if (inputs.length >= 5) {
            persons.push([
                inputs[0].value.trim() || 'N/A',
                inputs[1].value.trim() || 'N/A',
                inputs[2].value.trim() || 'N/A',
                inputs[3].value.trim() || 'N/A',
                inputs[4].value.trim() || 'N/A'
            ]);
        }
    });
    return persons;
}

function getTrafficStopVehicles() {
    const holder = document.getElementById('trafficStopVehHolder');
    if (!holder) return [];
    const vehicles = [];
    holder.querySelectorAll('.grid').forEach(vehicleDiv => {
        const inputs = vehicleDiv.querySelectorAll('input');
        if (inputs.length >= 5) {
            vehicles.push(
                inputs[0].value.trim() || 'N/A',
                inputs[1].value.trim() || 'N/A',
                inputs[2].value.trim() || 'N/A',
                inputs[3].value.trim() || 'N/A',
                inputs[4].value.trim() || 'N/A'
            );
        }
    });
    return vehicles;
}

function applyLoginState() {
    const loginArea = document.getElementById('loginArea');
    const appLoginArea = document.getElementById('appLoginArea');
    const inputUserDataArea = document.getElementById('inputUserDataArea');
    const robloxGpsArea = document.getElementById('robloxGpsArea');
    const mainApp = document.getElementById('mainApp');
    const homeFoot = document.getElementById('home-foot');
    const loginEnabled = window.loginEnabled !== false;
    const windowsHome = document.getElementById('windowsHome');
    const isWindowsShellLaunch = !!windowsHome && window.getComputedStyle(windowsHome).display !== 'none';

    if (isWindowsShellLaunch) {
        if (loginArea) loginArea.style.display = 'none';
        if (inputUserDataArea) inputUserDataArea.style.display = 'none';
        if (robloxGpsArea) robloxGpsArea.style.display = 'none';
        if (loginEnabled) {
            if (appLoginArea) appLoginArea.style.display = 'flex';
            if (mainApp) mainApp.style.display = 'none';
            if (homeFoot) homeFoot.style.display = 'none';
        } else {
            if (appLoginArea) appLoginArea.style.display = 'none';
            if (mainApp) mainApp.style.display = 'flex';
            if (homeFoot) homeFoot.style.display = 'flex';
            if (typeof updateView === 'function') updateView('incidentsView');
        }
        return;
    }

    if (loginEnabled) {
        if (loginArea) loginArea.style.display = 'flex';
        if (appLoginArea) appLoginArea.style.display = 'none';
        if (inputUserDataArea) inputUserDataArea.style.display = 'none';
        if (robloxGpsArea) robloxGpsArea.style.display = 'none';
        if (mainApp) mainApp.style.display = 'none';
        if (homeFoot) homeFoot.style.display = 'none';
    } else {
        if (loginArea) loginArea.style.display = 'none';
        if (appLoginArea) appLoginArea.style.display = 'none';
        if (inputUserDataArea) inputUserDataArea.style.display = 'none';
        if (robloxGpsArea) robloxGpsArea.style.display = 'none';
        if (mainApp) mainApp.style.display = 'flex';
        if (homeFoot) homeFoot.style.display = 'flex';
        if (typeof updateView === 'function') updateView('incidentsView');
        document.getElementById('titleBar').style.display = 'block';
    }
}

function showModal(id) {
    const modal = document.getElementById(id);
    const overlay = document.querySelector('.modal-overlay');
    if (modal && overlay) {
        const appRoot = document.getElementById('premierOneApp');
        if (appRoot && overlay.parentElement !== appRoot) {
            appRoot.appendChild(overlay);
        }
        const allModals = overlay.querySelectorAll('.modal-content');
        allModals.forEach(m => m.style.display = 'none');
        modal.style.display = 'block';
        overlay.classList.add('active');
    }
    if (id === 'dispositionModal') {
        resetDispositionModal();
    }
    if (id === 'dispReqUnit') {
        populateRequestUnitSelect();
        renderRequestedUnits();
    }
    if (id === 'dispRespList') {
        showDispatchResponseList();
    }
    if (id === 'dispatchCommentModal') {
        const input = document.getElementById('dispatchCommentInput');
        if (input) input.value = '';
    }
    if (id === 'supervisorKeyModal') {
        const keyInput = document.getElementById('supervisorKeyInput');
        const error = document.getElementById('supervisorKeyError');
        if (keyInput) keyInput.value = '';
        if (error) error.textContent = '';
    }
    if (id === 'supervisorSetIncidentModal') {
        const idInput = document.getElementById('incidentIdInput');
        const error = document.getElementById('incidentIdError');
        if (idInput) idInput.value = '';
        if (error) error.textContent = '';
    }
    if (id === 'closeIncidentFullIdModal') {
        const fullIdInput = document.getElementById('closeIncidentFullIdInput');
        const fullIdError = document.getElementById('closeIncidentFullIdError');
        const hintEl = document.getElementById('closeIncidentFullIdHint');
        if (fullIdInput) fullIdInput.value = '';
        if (fullIdError) fullIdError.textContent = '';
        if (hintEl) {
            hintEl.textContent = pendingCloseIncidentLast4
                ? `No incident found for today using ${pendingCloseIncidentLast4}. Enter full incident ID:`
                : 'No incident found for today. Enter full incident ID:';
        }
    }
    if (id === 'printCallsModal') {
        const dateInput = document.getElementById('printCallsDate');
        const endDateInput = document.getElementById('printCallsDateEnd');
        const status = document.getElementById('printCallsStatus');
        const today = new Date().toISOString().slice(0, 10);
        if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
        if (endDateInput) endDateInput.value = '';
        if (status) status.textContent = `Single day default: ${today}. Set End Date for a range.`;
    }
}

function toggleSupervisorPresent(isChecked) {
    const section = document.getElementById('supervisorArea');
    const action = document.getElementById('supervisorAction');
    if (!section) return;
    section.style.display = isChecked ? 'block' : 'none';
    if (!isChecked) {
        resetSupervisorSection();
        if (action) action.disabled = true;
    }
}

function updateSupervisorActionState() {
    const input = document.getElementById('supervisorCallsignInput');
    const action = document.getElementById('supervisorAction');
    if (!input || !action) return;
    const hasValue = input.value.trim() !== '';
    action.disabled = !hasValue;
    if (!hasValue) {
        action.value = '';
    }
}

function finalizeSupervisorCallsign() {
    const input = document.getElementById('supervisorCallsignInput');
    const label = document.getElementById('supervisorCallsignLabel');
    const action = document.getElementById('supervisorAction');
    if (!input || !label || !action) return;
    const value = input.value.trim();
    if (value) {
        label.textContent = value;
        label.style.display = 'block';
        input.style.display = 'none';
        action.disabled = false;
    } else {
        label.style.display = 'none';
        action.value = '';
        action.disabled = true;
    }
}

function editSupervisorCallsign() {
    const input = document.getElementById('supervisorCallsignInput');
    const label = document.getElementById('supervisorCallsignLabel');
    if (!input || !label) return;
    label.style.display = 'none';
    input.style.display = 'block';
    input.focus();
}

function resetSupervisorSection() {
    const input = document.getElementById('supervisorCallsignInput');
    const label = document.getElementById('supervisorCallsignLabel');
    const action = document.getElementById('supervisorAction');
    if (input) {
        input.style.display = 'block';
        input.value = '';
    }
    if (label) {
        label.style.display = 'none';
        label.textContent = '';
    }
    if (action) {
        action.value = '';
        action.disabled = true;
    }
}

function resetDispositionModal() {
    const checkbox = document.getElementById('disp-super');
    if (checkbox) checkbox.checked = false;
    toggleSupervisorPresent(false);
}

function closeModal(id) {
    const modal = document.getElementById(id);
    const overlay = document.querySelector('.modal-overlay');
    if (modal) {
        modal.style.display = 'none';
    }
    if (overlay) {
        overlay.classList.remove('active');
    }
}

function parseCallDateOnly(value) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    parsed.setHours(0, 0, 0, 0);
    return parsed;
}

function csvEscape(value) {
    const text = String(value == null ? '' : value);
    if (/[",\n\r]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

// Command Processing
function processCmd() {
    /* 
     * Commands list:
     * II - Opens a modal saying to input circumstances and location
     * CI [incident ID] - Clones a incident given ID
     * IC [incident ID] - Closes incident given ID
     * IU [INCIDENT ID] [details] - Adds notes to an incident based on ID, will update to details given
     
     --- DISPATCH ONLY COMMANDS BELOW ---
     * ID [incident ID] [unit 1], [unit 2]... etc - dispatches units to a incident
     * OND [unit 1] - Marks a unit on duty
     * UFD [unit 1] - Marks a unit off duty
     * END [unit 1], [unit 2]... etc - Marks a unit enroute
     * OSD [unit 1], [unit 2]... etc - Marks a unit on scene
     
     --- SELF UNIT MODIFY COMMANDS BELOW ---
     * ON - Marks your unit on duty
     * UF - Marks your unit off duty
     * EN - Marks your unit enroute
     * OS - Marks your unit on scene
     */

    const input = document.getElementById('cmdBar');
    const cmdStr = input.value.trim().toLowerCase();
    const parts = cmdStr.trim().split(/\s+/);
    const command = parts[0];

    if (command === 'ii') {
        showModal('incidentInitModal');
    } else if (command === 'ci' && parts[1]) {
        cloneIncident(parts[1]);
    } else if (command === 'ic' && parts[1]) {
        closeIncidentById(parts[1], 'IC command');
    } else if (command === `iu` && parts[1] && parts[2]) {
        console.log(`ID: ${parts[1]}, Comment: ${parts.slice(2).join(' ')}`);
        addComment(parts[1], parts.slice(2).join(' '));
    } else if (command === 'on') {
        setUnitStatus('Available');
    } else if (command === 'uf') {
        setUnitStatus('End of Watch');
    } else if (command === 'en') {
        setUnitStatus('Enroute');
    } else if (command === 'os') {
        setUnitStatus('Code 6');
    }
    else {
        alert('Unknown command or missing parameters.');
    }

    if (processedCmds.length > 4) {
        processedCmds.splice(0, processedCmds.length - 4);
    }
    input.value = '';
}

function recallCmd(direction) {
    const input = document.getElementById('cmdBar');
    if (processedCmds.length === 0) return;
    if (direction === 'up') {
        const lastCmd = processedCmds[processedCmds.length - 1];
        input.value = lastCmd;
    } else if (direction === 'down') {
        const firstCmd = processedCmds[0];
        input.value = firstCmd;
    }
}

//-- Update view logic --\\
function restoreMainUI() {
    const isDispatchActive = document.getElementById('dispatchingArea')?.classList.contains('dispatch-active');
    const mainActionButtons = document.getElementById('mainActionButtons');
    if (mainActionButtons) {
        mainActionButtons.style.removeProperty('display');
    }
    document.querySelectorAll('#mainApp > .px-5, #mainApp > .container-fluid').forEach(el => {
        el.style.removeProperty('display');
    });
    const dispatchArea = document.getElementById('dispatchingArea');
    if (dispatchArea && !isDispatchActive) dispatchArea.classList.remove('dispatch-active');
    const qv = document.getElementById('query-opts-view');
    if (qv) qv.style.setProperty('display', 'none', 'important');
    const submitFoot = document.getElementById('submit-query-foot');
    if (submitFoot) submitFoot.style.display = 'none';
    const queryFoot = document.getElementById('query-foot');
    if (queryFoot) queryFoot.style.display = 'none';
    const advCallFoot = document.getElementById('adv-call-table-foot');
    if (advCallFoot) advCallFoot.style.display = 'none';
    const reportsComposeFoot = document.getElementById('reports-compose-foot');
    if (reportsComposeFoot) reportsComposeFoot.style.display = 'none';
    document.querySelectorAll('.incident-view-wrapper').forEach(panel => {
        panel.style.display = 'none';
        panel.style.visibility = 'hidden';
    });
    const reportsArea = document.getElementById('reports-area');
    if (reportsArea) {
        reportsArea.style.display = 'none';
        reportsArea.style.visibility = 'hidden';
    }
    const mobileMapArea = document.getElementById('mobile-map-area');
    if (mobileMapArea) {
        mobileMapArea.style.display = 'none';
        mobileMapArea.style.visibility = 'hidden';
    }
    const homeContentWrapper = document.getElementById('homeContentWrapper');
    if (homeContentWrapper) homeContentWrapper.style.display = '';
    const incFoot = document.getElementById('inc-foot');
    if (incFoot) incFoot.style.display = 'none';
    const homeFoot = document.getElementById('home-foot');
    if (homeFoot && !isDispatchActive) homeFoot.style.display = 'flex';
    const queryResultsViewEl = document.getElementById('queryResultsView');
    if (queryResultsViewEl) queryResultsViewEl.style.display = 'none';
}

function getVisibleElementHeight(el) {
    if (!el) return 0;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return 0;
    return el.offsetHeight || 0;
}

function getMdtTopChromeHeight() {
    const mainActionButtons = document.getElementById('mainActionButtons');
    const commandBarRow = document.querySelector('#mainApp > .px-5.mt-1');
    const unitInfoRow = document.querySelector('#mainApp > .container-fluid.p-0.mt-1');
    return getVisibleElementHeight(mainActionButtons)
        + getVisibleElementHeight(commandBarRow)
        + getVisibleElementHeight(unitInfoRow);
}

function getMdtVisibleFooterHeight() {
    const footerIds = ['query-foot', 'submit-query-foot', 'inc-foot', 'adv-call-table-foot', 'reports-compose-foot', 'home-foot'];
    for (const id of footerIds) {
        const el = document.getElementById(id);
        const height = getVisibleElementHeight(el);
        if (height > 0) return height;
    }
    return 0;
}

function positionMdtOverlayWithinWorkspace(overlayEl) {
    if (!overlayEl) return;
    const top = getMdtTopChromeHeight() + 8; // extra buffer just incase
    const bottom = getMdtVisibleFooterHeight();
    const targets = overlayEl.id
        ? Array.from(document.querySelectorAll(`#${CSS.escape(overlayEl.id)}`))
        : [overlayEl];
    targets.forEach(el => {
        el.style.position = 'absolute';
        el.style.removeProperty('inset');
        el.style.top = `${top}px`;
        el.style.left = '0';
        el.style.right = '0';
        el.style.bottom = `${bottom}px`;
        el.style.height = 'auto';
        el.style.maxHeight = 'none';
    });
}

window.positionMdtOverlayWithinWorkspace = positionMdtOverlayWithinWorkspace;

async function launchMobileMapWindow(event) {
    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }

    if (typeof openWindowsApp === 'function') {
        await openWindowsApp('MobileMap');
        return;
    }

    await updateView('mobileMap');
}

window.launchMobileMapWindow = launchMobileMapWindow;

// shoutout to the clank
function flickerIn(el) {
    if (!el) return;

    const all = Array.from(el.querySelectorAll('*'));
    if (!all.length) return;
    for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
    }
    const step = Math.min(300 / all.length, 40);
    all.forEach((child, i) => {
        const computed = getComputedStyle(child);
        if (computed.display === 'none' || computed.visibility === 'hidden') return;
        child.classList.remove('mdt-flicker-child');
        child.style.opacity = '0';
        setTimeout(() => {
            child.style.opacity = '';
            child.classList.add('mdt-flicker-child');
            setTimeout(() => child.classList.remove('mdt-flicker-child'), 200);
        }, i * step);
    });
}

async function updateView(viewId) {
    const viewIndicator = document.getElementById('currentpage');
    if (viewId !== 'dispatchLogon') restoreMainUI();
    const incidentsView = document.getElementById('incidentsView');
    const unitsTable = document.getElementById('units-table');
    const callsAdvTable = document.getElementById('callsAdvTable');
    const queryResultsView = document.getElementById('queryResultsView');
    const advCallsTabs = document.getElementById('advCallsTabs');
    const mainTabs = document.getElementById('mainTabs');
    const sidebarArea = document.querySelector('.sidebar-area');
    const tableArea = document.querySelector('.table-area');
    const dispatchLogonArea = document.getElementById('dispatchLoginArea');
    const queryFoot = document.getElementById('query-foot');
    const homeFoot = document.getElementById('home-foot');
    const advCallFoot = document.getElementById('adv-call-table-foot');
    const reportsComposeFoot = document.getElementById('reports-compose-foot');
    const reportsArea = document.getElementById('reports-area');
    if (reportsArea && viewId !== 'reports') {
        reportsArea.style.setProperty('display', 'none', 'important');
        reportsArea.style.setProperty('visibility', 'hidden', 'important');
    }
    const mobileMapArea = document.getElementById('mobile-map-area');
    if (mobileMapArea && viewId !== 'mobileMap') {
        mobileMapArea.style.setProperty('display', 'none', 'important');
        mobileMapArea.style.setProperty('visibility', 'hidden', 'important');
    }
    if (advCallFoot) advCallFoot.style.display = 'none';
    if (reportsComposeFoot) reportsComposeFoot.style.display = 'none';

    const tabIndexMap = { 'incidentsView': 0, 'units-table': 1, 'queryResults': 2 };
    if (tabIndexMap[viewId] !== undefined && mainTabs) {
        const tabLinks = mainTabs.querySelectorAll('li > a');
        tabLinks.forEach(a => a.classList.remove('active-tab'));
        const lis = mainTabs.querySelectorAll('li');
        lis.forEach(li => li.classList.remove('active'));
        const idx = tabIndexMap[viewId];
        if (lis[idx]) lis[idx].classList.add('active');
        if (tabLinks[idx]) tabLinks[idx].classList.add('active-tab');
    }

    if (viewId === 'incidentsView') {
        const homeContentWrapper = document.getElementById('homeContentWrapper');
        if (homeContentWrapper) homeContentWrapper.style.display = '';
        if (incidentsView) incidentsView.style.display = 'block';
        if (unitsTable) unitsTable.style.display = 'none';
        if (callsAdvTable) callsAdvTable.style.display = 'none';
        if (advCallsTabs) advCallsTabs.style.setProperty('display', 'none', 'important');
        if (mainTabs) mainTabs.style.setProperty('display', 'flex', 'important');
        if (sidebarArea) sidebarArea.style.display = 'flex';
        if (tableArea) tableArea.style.width = '';
        if (dispatchLogonArea) dispatchLogonArea.style.display = 'none';
        if (queryFoot) queryFoot.style.setProperty('display', 'none', 'important');
        if (homeFoot) homeFoot.style.setProperty('display', 'flex', 'important');
        if (viewIndicator) viewIndicator.textContent = 'Home';
        if (surfedPages.length < 7) {
            surfedPages.push('incidentsView');
        } else {
            surfedPages.shift();  // Remove oldest entry
            surfedPages.push('incidentsView');
        }
        currentPageIndex = surfedPages.length - 1;  // Point to newest entry
        currentView = 'incidentsView';
        lastMainView = currentView;
        flickerIn(tableArea);
        await syncLiveMonitorsForCurrentView();
    } else if (viewId === 'units-table') {
        const homeContentWrapper = document.getElementById('homeContentWrapper');
        if (homeContentWrapper) homeContentWrapper.style.display = '';
        if (incidentsView) incidentsView.style.display = 'none';
        if (unitsTable) unitsTable.style.display = 'block';
        if (callsAdvTable) callsAdvTable.style.display = 'none';
        if (advCallsTabs) advCallsTabs.style.setProperty('display', 'none', 'important');
        if (mainTabs) mainTabs.style.setProperty('display', 'flex', 'important');
        if (sidebarArea) sidebarArea.style.display = 'flex';
        if (tableArea) tableArea.style.width = '';
        if (dispatchLogonArea) dispatchLogonArea.style.display = 'none';
        if (queryFoot) queryFoot.style.setProperty('display', 'none', 'important');
        if (homeFoot) homeFoot.style.setProperty('display', 'flex', 'important');
        if (viewIndicator) viewIndicator.textContent = 'Home';
        if (surfedPages.length < 7) {
            surfedPages.push('units-table');
        } else {
            surfedPages.shift();  // Remove oldest entry
            surfedPages.push('units-table');
        }
        currentPageIndex = surfedPages.length - 1;  // Point to newest entry
        currentView = 'units-table';
        lastMainView = currentView;
        flickerIn(unitsTable);
        await syncLiveMonitorsForCurrentView();
    } else if (viewId === 'callsAdvTable') {
        const homeContentWrapper = document.getElementById('homeContentWrapper');
        if (homeContentWrapper) homeContentWrapper.style.display = '';
        if (incidentsView) incidentsView.style.display = 'none';
        if (unitsTable) unitsTable.style.display = 'none';
        if (callsAdvTable) callsAdvTable.style.display = 'flex';
        if (advCallsTabs) advCallsTabs.style.setProperty('display', 'none', 'important');
        if (mainTabs) mainTabs.style.setProperty('display', 'none', 'important');
        if (sidebarArea) sidebarArea.style.display = 'none';
        if (tableArea) tableArea.style.width = '';
        if (dispatchLogonArea) dispatchLogonArea.style.display = 'none';
        if (queryResultsView) queryResultsView.style.display = 'none';
        if (queryFoot) queryFoot.style.setProperty('display', 'none', 'important');
        if (homeFoot) homeFoot.style.setProperty('display', 'none', 'important');
        if (advCallFoot) advCallFoot.style.setProperty('display', 'flex', 'important');
        if (viewIndicator) viewIndicator.textContent = 'Home';
        if (surfedPages.length < 7) {
            surfedPages.push('callsAdvTable');
        } else {
            surfedPages.pop();
            surfedPages.push('callsAdvTable');
        }
        currentView = 'callsAdvTable';
        lastMainView = currentView;
        switchCallsSubView(window._callsSubView || 'callboard');
        flickerIn(callsAdvTable);
        await syncLiveMonitorsForCurrentView();
    } else if (viewId === 'queryResults') {
        const mainActionButtons = document.getElementById('mainActionButtons');
        if (mainActionButtons) mainActionButtons.style.removeProperty('display');
        document.querySelectorAll('#mainApp > .px-5, #mainApp > .container-fluid').forEach(el => {
            el.style.removeProperty('display');
        });
        const homeContentWrapper = document.getElementById('homeContentWrapper');
        if (homeContentWrapper) homeContentWrapper.style.display = '';
        if (incidentsView) incidentsView.style.display = 'none';
        if (unitsTable) unitsTable.style.display = 'none';
        if (callsAdvTable) callsAdvTable.style.display = 'none';
        if (advCallsTabs) advCallsTabs.style.setProperty('display', 'none', 'important');
        if (mainTabs) mainTabs.style.setProperty('display', 'none', 'important');
        if (sidebarArea) sidebarArea.style.display = 'none';
        if (tableArea) tableArea.style.width = '100%';
        if (dispatchLogonArea) dispatchLogonArea.style.display = 'none';
        if (queryFoot) queryFoot.style.setProperty('display', 'flex', 'important');
        if (homeFoot) homeFoot.style.setProperty('display', 'none', 'important');
        if (queryResultsView) queryResultsView.style.display = 'flex';
        if (viewIndicator) viewIndicator.textContent = 'Query';
        if (surfedPages.length < 7) {
            surfedPages.push('queryResults');
        } else {
            surfedPages.pop();
            surfedPages.push('queryResults');
        }
        currentView = 'queryResults';
        lastMainView = currentView;
        switchQueryFolder(window._queryFolder || 'responses', null);
        if (queryFoot) queryFoot.style.setProperty('display', 'flex', 'important');
        if (homeFoot) homeFoot.style.setProperty('display', 'none', 'important');
        flickerIn(queryResultsView);
        await syncLiveMonitorsForCurrentView();
    } else if (viewId === 'mobileMap') {
        const mainActionButtons = document.getElementById('mainActionButtons');
        if (mainActionButtons) mainActionButtons.style.removeProperty('display');
        document.querySelectorAll('#mainApp > .px-5, #mainApp > .container-fluid').forEach(el => {
            el.style.removeProperty('display');
        });
        const homeContentWrapper = document.getElementById('homeContentWrapper');
        if (homeContentWrapper) homeContentWrapper.style.display = 'none';
        if (unitsTable) unitsTable.style.display = 'none';
        if (incidentsView) incidentsView.style.display = 'none';
        if (callsAdvTable) callsAdvTable.style.display = 'none';
        if (advCallsTabs) advCallsTabs.style.setProperty('display', 'none', 'important');
        if (mainTabs) mainTabs.style.display = 'none';
        if (sidebarArea) sidebarArea.style.display = 'none';
        if (tableArea) tableArea.style.width = '';
        if (dispatchLogonArea) dispatchLogonArea.style.display = 'none';
        if (queryFoot) queryFoot.style.setProperty('display', 'none', 'important');
        if (homeFoot) homeFoot.style.setProperty('display', 'flex', 'important');
        if (reportsComposeFoot) reportsComposeFoot.style.display = 'none';
        if (advCallFoot) advCallFoot.style.setProperty('display', 'none', 'important');
        if (viewIndicator) viewIndicator.textContent = 'Mobile Map';
        if (queryResultsView) queryResultsView.style.display = 'none';
        if (mobileMapArea) {
            mobileMapArea.style.setProperty('display', 'flex', 'important');
            mobileMapArea.style.setProperty('visibility', 'visible', 'important');
            positionMdtOverlayWithinWorkspace(mobileMapArea);
        }
        currentView = 'mobileMap';
        lastMainView = currentView;
        if (typeof initMobileMapView === 'function') {
            await initMobileMapView();
        }
        if (surfedPages.length < 7) {
            surfedPages.push('mobileMap');
        } else {
            surfedPages.pop();
            surfedPages.push('mobileMap');
        }
        await syncLiveMonitorsForCurrentView();
    }  else if (viewId === 'dispatchLogon') {
        /* if (unitsTable) unitsTable.style.display = 'none';
        if (incidentsView) incidentsView.style.display = 'none';
        if (callsAdvTable) callsAdvTable.style.display = 'none';
        if (advCallsTabs) advCallsTabs.style.setProperty('display', 'none', 'important');
        if (mainTabs) mainTabs.style.setProperty('display', 'none', 'important');
        if (sidebarArea) sidebarArea.style.display = 'none';
        if (tableArea) tableArea.style.width = '';
        if (dispatchLogonArea) dispatchLogonArea.style.display = 'flex';
        if (queryFoot) queryFoot.style.display = 'none';
        if (homeFoot) homeFoot.style.display = 'flex';
        if (advCallFoot) advCallFoot.style.display = 'none';
        if (viewIndicator) viewIndicator.textContent = 'Home';
        if (queryResultsView) queryResultsView.style.display = 'none';
        if (surfedPages.length < 7) {
            surfedPages.push('dispatchLogon');
        } else {
            surfedPages.pop();
            surfedPages.push('dispatchLogon');
        }
        currentView = 'dispatchLogon';
        flickerIn(dispatchLogonArea);
        await syncLiveMonitorsForCurrentView(); */
        console.log('howd you get here');
    } else if (viewId === 'reports'){
        const mainActionButtons = document.getElementById('mainActionButtons');
        if (mainActionButtons) mainActionButtons.style.removeProperty('display');
        document.querySelectorAll('#mainApp > .px-5, #mainApp > .container-fluid').forEach(el => {
            el.style.removeProperty('display');
        });
        const homeContentWrapper = document.getElementById('homeContentWrapper');
        if (homeContentWrapper) homeContentWrapper.style.display = 'none';
        if (unitsTable) unitsTable.style.display = 'none';
        if (incidentsView) incidentsView.style.display = 'none';
        if (callsAdvTable) callsAdvTable.style.display = 'none';
        if (advCallsTabs) advCallsTabs.style.setProperty('display', 'none', 'important');
        if (mainTabs) mainTabs.style.display = 'none';
        if (sidebarArea) sidebarArea.style.display = 'none';
        if (tableArea) tableArea.style.width = '';
        if (dispatchLogonArea) dispatchLogonArea.style.display = 'none';
        if (queryFoot) queryFoot.style.setProperty('display', 'none', 'important');
        if (homeFoot) homeFoot.style.setProperty('display', 'flex', 'important');
        if (reportsComposeFoot) reportsComposeFoot.style.display = 'none';
        if (advCallFoot) advCallFoot.style.setProperty('display', 'none', 'important');
        if (viewIndicator) viewIndicator.textContent = 'Reports';
        if (queryResultsView) queryResultsView.style.display = 'none';
        if (reportsArea) {
            reportsArea.style.setProperty('display', 'flex', 'important');
            reportsArea.style.setProperty('visibility', 'visible', 'important');
            positionMdtOverlayWithinWorkspace(reportsArea);
        }
        currentView = 'reports';
        lastMainView = currentView;
        if (typeof setupReportsLiveMonitor === 'function') {
            await setupReportsLiveMonitor();
        }
        if (typeof filterReports === 'function') filterReports('all');
        if (surfedPages.length < 7) {
            surfedPages.push('reports');
        } else {
            surfedPages.pop();
            surfedPages.push('reports');
        }
        await syncLiveMonitorsForCurrentView();
    }
}

//-- Calls View Filters --\\
function applyCallsViewFilters() {
    const showClosed = document.getElementById('showClosedCalls')?.checked;
    const unitFilter = (document.getElementById('unitFilter')?.value || '').trim().toLowerCase();

    const rows = document.querySelectorAll('#callsAdvTable tbody tr');
    rows.forEach(row => {
        const status = (row.dataset.status || '').toLowerCase();  // 'closed' | 'pending' | 'assigned'
        const units = (row.dataset.units || '').toLowerCase();

        let visible = true;

        // Tab filtering: only show rows matching the current view tab
        if (currentAdvCallsView === 'closed') {
            if (status !== 'closed') visible = false;
        } else if (currentAdvCallsView === 'pending') {
            if (status !== 'pending') visible = false;
        } else {
            // assigned/active view - hide closed (unless checkbox on) and pending
            if (status === 'closed') {
                if (!showClosed) visible = false;
            } else if (status === 'pending') {
                visible = false;  // pending has its own tab
            }
        }

        if (unitFilter) {
            const unitFilters = unitFilter.split(',').map(u => u.trim()).filter(u => u);
            const matchesAnyUnit = unitFilters.some(u => units.includes(u));
            if (!matchesAnyUnit) visible = false;
        }

        row.style.setProperty('display', visible ? 'table-row' : 'none', 'important');
    });

    const dateSelector = document.getElementById('dateFilter');
    if (dateSelector && dateSelector.value) {
        console.log('Date selected:', dateSelector.value);
    }
}

//-- Night Mode Toggle --\\
function toggleNightMode() {
    const mainApp = document.getElementById('mainApp');
    const toggle = document.getElementById('dayNightToggle');
    if (!mainApp || !toggle) return;
    const isNight = mainApp.classList.toggle('night-mode');
    document.body.classList.toggle('night-mode-active', isNight);
    const icon = toggle.querySelector('span:first-child');
    const label = toggle.querySelector('span:last-child');
    if (label) label.textContent = isNight ? 'Night' : 'Day';
    if (icon) {
        icon.className = isNight ? 'mif-moon-left mif-sm' : 'mif-brightness-auto mif-sm';
    }
}

//-- All content loaded required functions here --\\
function initPremierOneMDT() {
    if (!mdtGlobalInitComplete) {
        const unloadHandler = typeof runUnloadLogoff === 'function'
            ? runUnloadLogoff
            : (typeof window.runUnloadLogoff === 'function' ? window.runUnloadLogoff : null);
        if (unloadHandler) {
            window.addEventListener('beforeunload', unloadHandler);
            window.addEventListener('pagehide', unloadHandler);
        }
        mdtGlobalInitComplete = true;
    }

    const dayToggle = document.getElementById('dayNightToggle');
    if (dayToggle) {
        dayToggle.onclick = toggleNightMode;
        dayToggle.style.cursor = 'pointer';
    }

    applyLoginState();
    if (typeof updateIncCounts === 'function') updateIncCounts();

    const showClosedCallsCheckbox = document.getElementById('showClosedCalls');
    const showCallsTodayCheckbox = document.getElementById('showCallsToday');
    const unitFilterInput = document.getElementById('unitFilter');
    const dateFilterInput = document.getElementById('dateFilter');
    const refreshCallsButton = document.getElementById('refreshCallsView');

    if (showClosedCallsCheckbox) {
        showClosedCallsCheckbox.onchange = applyCallsViewFilters;
    }
    if (showCallsTodayCheckbox) {
        showCallsTodayCheckbox.onchange = applyCallsViewFilters;
    }
    if (unitFilterInput) {
        unitFilterInput.oninput = applyCallsViewFilters;
    }
    if (dateFilterInput) {
        dateFilterInput.onchange = function () {
            if (dateFilterInput.value) {
                console.log('Date selected:', dateFilterInput.value);
            }
            applyCallsViewFilters();
        };
    }
    if (refreshCallsButton) {
        refreshCallsButton.onclick = applyCallsViewFilters;
    }

    //-- App Login Key Logic --\\
    function updateLayoutVars() {
        const header = document.getElementById('titleBar');
        const footer = document.getElementById('home-foot') || document.getElementById('inc-foot');
        if (header) {
            document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
        }
    }
    updateLayoutVars();
    if (!mdtLayoutResizeBound) {
        window.addEventListener('resize', updateLayoutVars);
        mdtLayoutResizeBound = true;
    }

    const windowsHome = document.getElementById('windowsHome');
    const isWindowsShellLaunch = !!windowsHome && window.getComputedStyle(windowsHome).display !== 'none';
    const shellHost = document.getElementById('premierOneApp');

    ['home-foot', 'inc-foot', 'query-foot', 'adv-call-table-foot', 'submit-query-foot', 'inc-adv-view-wrapper'].forEach(function (id) {
        const el = document.getElementById(id);
        if (!el) return;

        if (isWindowsShellLaunch && shellHost) {
            if (!shellHost.contains(el)) shellHost.appendChild(el);
            return;
        }

        if (el.parentElement !== document.body) {
            document.body.appendChild(el);
        }
    });

    const modalOverlay = document.querySelector('.modal-overlay');
    if (modalOverlay) {
        if (isWindowsShellLaunch && shellHost) {
            if (!shellHost.contains(modalOverlay)) shellHost.appendChild(modalOverlay);
        } else if (modalOverlay.parentElement !== document.body) {
            document.body.appendChild(modalOverlay);
        }
    }
}

window.initPremierOneMDT = initPremierOneMDT;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPremierOneMDT, { once: true });
} else {
    initPremierOneMDT();
}
