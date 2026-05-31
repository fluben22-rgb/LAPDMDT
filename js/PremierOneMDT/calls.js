/*
       * ALL CALL / INCIDENT RELATED FUNCTIONS WILL BE BEYOND THIS POINT
       *Notes for future:
        - Make creating incident functionality FIRST, then add incident advanced view
        - ^ Make sure when I do this that creating a C6 / TS is also possible thru those main action btns
        - When done, incident advanced view will have you subscribe to the incident your viewing for updates, all content will be dynically generated? un-subscribe after not viewing incident anymore
       * ALL INCIDENT RELATED FUNCTIONS HERE
       */





//-- Set Incident ID Logic --\\
async function setIncidentID() {
    const input = document.getElementById('incidentIdInput');
    const error = document.getElementById('incidentIdError');

    if (input.value.trim().length !== 4) {
        error.textContent = 'Incident ID must be exactly 4 digits.';
        return;
    }

    let inputParsed = Number.parseInt(input.value.trim(), 10);
    if (isNaN(inputParsed) || inputParsed < 0 || inputParsed > 9999) {
        error.textContent = 'Incident ID must be a number between 0000 and 9999.';
        return;
    }

    try {
        const { error } = await sbClient
            .from('settings')
            .upsert({
                id: 1,
                lastFour: inputParsed
            }, { onConflict: 'id' });

        if (error) {
            console.error('Error setting incident ID:', error);
            error.textContent = 'Failed to set Incident ID.';
            return;
        }

        console.log(`Incident ID set to ${inputParsed}`);
        closeModal('supervisorSetIncidentModal');
    } catch (e) {
        console.error('Error setting incident ID:', e);
        error.textContent = 'A connection error occurred. Please try again.';
    }

}

/* incid (text from settings edg func), 
 * last4 (int4 from settings), 
 * created_at (text get local time to PST) , 
 * prmry (text), 
 * assist (text arr), 
 * area (text),
 * beat (text), 
 * call_type (text), 
 * call_code (text), 
 * location (text), 
 * comments (text), 
 * vehicles (text arr),
 * persons (text, arr),
 * history (text), 
 * is_active (bool), 
 * is_closed (bool), 
 * is_pending (bool), 
 * logged_by (text, serial + @lapd.org)
 */

//-- Setup Live Monitor [Calls]--\\
async function setupCallsLiveMonitor() {
    if (!sbClient) return;

    await refreshCallTable();

    if (callLiveMonitorChannel) return;

    callLiveMonitorChannel = sbClient
        .channel('calls-live-monitor')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, async (payload) => {
            await refreshCallTable();

            if (payload?.eventType === 'INSERT') {
                playSound('newCall');
            }
        })
        .subscribe();
}

//-- Un subscribe from call table (logoff) --\\
async function unsubscribeCallsLiveMonitor() {
    if (sbClient && callLiveMonitorChannel) {
        await sbClient.removeChannel(callLiveMonitorChannel);
        callLiveMonitorChannel = null;
    }
}

//-- Start call table refresh loop (logon) --\\
function startCallTableRefreshLoop() {
    if (callTableRefreshInterval) return;
    callTableRefreshInterval = setInterval(async () => {
        if (currentView !== 'incidentsView') return;
        await refreshCallTable();
    }, 3000);
}

//-- stop call table refresh loop (logoff) --\\
function stopCallTableRefreshLoop() {
    if (!callTableRefreshInterval) return;
    clearInterval(callTableRefreshInterval);
    callTableRefreshInterval = null;
}

function startAdvCallTableRefreshLoop() {
    if (advCallTableRefreshInterval) return;
    advCallTableRefreshInterval = setInterval(async () => {
        if (currentView !== 'callsAdvTable') return;
        await refreshAdvCallTable(currentAdvCallsView);
    }, 3000);
}

function stopAdvCallTableRefreshLoop() {
    if (!advCallTableRefreshInterval) return;
    clearInterval(advCallTableRefreshInterval);
    advCallTableRefreshInterval = null;
}

function startIncidentRefreshLoop() {
    if (incidentRefreshInterval) return;
    incidentRefreshInterval = setInterval(async () => {
        if (currentView !== 'incidentDetails' || !currentIncidentId || !sbClient) return;
        const { data, error } = await sbClient
            .from('calls')
            .select('*')
            .eq('id', currentIncidentId)
            .single();
        if (!error && data) {
            applyIncidentDetailsToView(data, currentIncidentId);
        }
    }, 3000);
}

function stopIncidentRefreshLoop() {
    if (!incidentRefreshInterval) return;
    clearInterval(incidentRefreshInterval);
    incidentRefreshInterval = null;
}

async function unsubscribeAdvCallsLiveMonitor() {
    if (sbClient && advCallLiveMonitorChannel) {
        await sbClient.removeChannel(advCallLiveMonitorChannel);
        advCallLiveMonitorChannel = null;
    }
}

async function unsubscribeUnitRequestAlertMonitor() {
    if (sbClient && unitRequestAlertChannel) {
        await sbClient.removeChannel(unitRequestAlertChannel);
        unitRequestAlertChannel = null;
    }
}

//-- Refresh Call Table for live monitor --\\
async function refreshCallTable() {
    let incidentCounterEl = document.getElementById('incidentCounter');
    let incidentCounter = 0;
    const callTable = document.getElementById('call-table-real');
    if (!callTable || !sbClient) return;

    const { data, error } = await sbClient.from('calls').select('*');
    if (error) {
        console.error('Error fetching calls for live monitor:', error);
        return;
    }

    callTable.innerHTML = '';

    if (!Array.isArray(data)) return;

    data.forEach(call => {

        if (call.is_closed == true) return;
        const row = document.createElement('tr');
        const callRowKey = call.id ?? call.incid ?? Math.random().toString(36).slice(2);

        row.id = `call-${callRowKey}`;

        // APPLY CLASS DIRECTLY HERE
        const statusClass = call.status ? `row-${call.status.toLowerCase()}` : '';
        row.className = statusClass;
        row.onclick = () => { showIncident(call.id) };

        row.innerHTML = `
                <td>${call.status ?? ''}</td>
                <td>${call.call_type ?? ''}</td>
                <td>${call.call_code ?? ''}</td>
                <td>${call.location ?? ''}</td>
                <td>${call.prmry ?? ''},${call.assist ?? ''}</td>
                <td>${call.area ?? ''}</td>`;
        incidentCounter++;

        callTable.appendChild(row);
    });

    incidentCounterEl.textContent = `(${incidentCounter})`;

}

//-- ii command logic --\\
async function createCustomIncident() {
    let typEl = document.getElementById('customIncType');
    let locEl = document.getElementById('customIncLocation');
    let narEl = document.getElementById('customIncNarrative');

    let typ = typEl.value.trim();
    let location = locEl.value.trim();
    let narrative = narEl.value.trim();

    if (!typ || !location || !narrative) {
        alert('Please fill in all fields');
        return;
    }

    const currentUser = sessionStorage.getItem('userInfo') ? sessionStorage.getItem('userInfo').split(',') : null;
    if (!currentUser) {
        alert('No active user session found. Please log in again.');
        return;
    }

    const user = currentUser[0];
    const callsign = currentUser[2];

    try {
        const { data: idData, error: idError } = await sbClient.functions.invoke('incident-id');

        if (idError || !idData) {
            console.error('Edge Function Error:', idError);
            throw new Error('Could not generate Incident ID');
        }

        const { lastFour, formatted } = idData;
        const timeNow = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false });
        const { data, error } = await sbClient
            .from('calls')
            .insert([{
                id: formatted,
                last4: lastFour,
                created_at: timeNow,
                status: 'Active',
                prmry: callsign ?? 'N/A',
                assist: [],
                area: 'HWD',
                beat: null,
                call_type: typ,
                call_code: 3,
                location: location,
                comments: [narrative],
                vehicles: [],
                persons: [],
                history: [`${timeNow} ${callsign} (${user}) - Created incident with narrative: ${narrative}`],
                is_active: true,
                is_closed: false,
                is_pending: false,
                logged_by: user
            }]);

        if (error) throw error;

        typEl.value = '';
        locEl.value = '';
        narEl.value = '';

        closeModal('incidentInitModal');
        setUnitStatus('Code 6');
        syncCurrentUnitStatus();
        try {
            const { error } = await sbClient.from('units').update({
                inc: lastFour,
                incLocation: location,
                code: 0
            }).eq('user', user);
            if (error) throw error;
            currentUser[3] = lastFour;
            currentUser[4] = true;
            sessionStorage.setItem('userInfo', currentUser.join(','));
        } catch (e) {
            console.error('Error updating unit with new incident info:', e);
            alert(`Failed to sync unit data: ${e?.message || e}`);
        }

    } catch (err) {
        console.error('Error creating incident:', err);
        alert(`Failed to create incident}`);
    }
}

//-- Code 6 Logic --\\
async function finalizeCode6() {
    let persons = getCode6Persons();
    let locEl = document.getElementById('code6Location');
    let narEl = document.getElementById('code6Narrative');

    let narrative = narEl.value.trim();
    let location = locEl.value.trim();
    if (!location || !narrative) {
        alert('Please fill in all fields');
        return;
    }

    const currentUser = sessionStorage.getItem('userInfo') ? sessionStorage.getItem('userInfo').split(',') : null;
    if (!currentUser) {
        alert('No active user session found. Please log in again.');
        return;
    }


    const user = currentUser[0];
    const callsign = currentUser[2];

    try {
        const { data: idData, error: idError } = await sbClient.functions.invoke('incident-id');

        if (idError || !idData) {
            console.error('Edge Function Error:', idError);
            throw new Error('Could not generate Incident ID');
        }

        const { lastFour, formatted } = idData;
        const timeNow = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false });
        const { data, error } = await sbClient
            .from('calls')
            .insert([{
                id: formatted,
                last4: lastFour,
                created_at: timeNow,
                status: 'Active',
                prmry: callsign ?? 'N/A',
                assist: [],
                area: 'HWD',
                beat: null,
                call_type: 'C6',
                call_code: 3,
                location: location,
                comments: [narrative],
                vehicles: [],
                persons: persons,
                history: [`${timeNow} ${callsign} (${user}) - Created incident with narrative: ${narrative}`],
                is_active: true,
                is_closed: false,
                is_pending: false,
                logged_by: user
            }]);

        if (error) throw error;

        locEl.value = '';
        narEl.value = '';

        closeModal('code6Modal');
        setUnitStatus('Code 6');
        syncCurrentUnitStatus();
        try {
            const { error } = await sbClient.from('units').update({
                inc: lastFour,
                incLocation: location,
                code: 0
            }).eq('user', user);
            if (error) throw error;
            currentUser[3] = lastFour;
            currentUser[4] = true;
            sessionStorage.setItem('userInfo', currentUser.join(','));
        } catch (e) {
            console.error('Error updating unit with new incident info:', e);
            alert(`Failed to sync unit data: ${e?.message || e}`);
        }

    } catch (err) {
        console.error('Error creating incident:', err);
        alert(`Failed to create incident: ${err.message}`);
    }
}

//-- Traffic Stop Logic --\\
async function finalizeTrafficStop() {
    let vehicles = getTrafficStopVehicles();
    let locEl = document.getElementById('trafficStopLocation');
    let narEl = document.getElementById('trafficStopNarrative');

    let narrative = narEl.value.trim();
    let location = locEl.value.trim();
    if (!location || !narrative) {
        alert('Please fill in all fields');
        return;
    }

    const currentUser = sessionStorage.getItem('userInfo') ? sessionStorage.getItem('userInfo').split(',') : null;
    if (!currentUser) {
        alert('No active user session found. Please log in again.');
        return;
    }

    const user = currentUser[0];
    const callsign = currentUser[2];

    try {
        const { data: isData, error: idError } = await sbClient.functions.invoke('incident-id');
        if (idError || !isData) {
            console.error('Edge Function Error:', idError);
            throw new Error('Could not generate Incident ID');
        }

        const { lastFour, formatted } = isData;
        const timeNow = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false });
        const { data, error } = await sbClient
            .from('calls')
            .insert([{
                id: formatted,
                last4: lastFour,
                created_at: timeNow,
                status: 'Active',
                prmry: callsign ?? 'N/A',
                assist: [],
                area: 'HWD',
                beat: null,
                call_type: '902',
                call_code: 3,
                location: location,
                comments: [narrative],
                vehicles: vehicles,
                persons: [],
                history: [`${timeNow} ${callsign} (${user}) - Created incident with narrative: ${narrative}`],
                is_active: true,
                is_closed: false,
                is_pending: false,
                logged_by: user
            }]);

        if (error) throw error;

        locEl.value = '';
        narEl.value = '';

        closeModal('trafficStopModal');
        setUnitStatus('Code 6');
        syncCurrentUnitStatus();
        try {
            const { error } = await sbClient.from('units').update({
                inc: lastFour,
                incLocation: location,
                code: 0
            }).eq('user', user);
            if (error) throw error;
            currentUser[3] = lastFour;
            currentUser[4] = true;
            sessionStorage.setItem('userInfo', currentUser.join(','));
        } catch (e) {
            console.error('Error updating unit with new incident info:', e);
            alert(`Failed to sync unit data: ${e?.message || e}`);
        }
    } catch (err) {
        console.error('Error creating incident:', err);
        alert(`Failed to create incident: ${err.message}`);

    }
}

//-- Clone Incident Command (ci command) --\\
async function cloneIncident(id) {
    const date = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const parts = formatter.formatToParts(date).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});

    const mm = parts.month;
    const dd = parts.day;
    const yy = parts.year.slice(-2);
    const dateStr = `${mm}${dd}${yy}`;

    let idInt = Number.parseInt(id, 10);
    if (isNaN(idInt) || idInt < 0 || idInt > 9999) {
        alert('Invalid incident ID (Tip: put only last 4 of incident.)');
        return;
    }

    let incId = `PD/${dateStr}-${idInt}`;

    const currentUser = sessionStorage.getItem('userInfo') ? sessionStorage.getItem('userInfo').split(',') : null;
    if (!currentUser) {
        alert('No active user session found. Please log in again.');
        return;
    }

    const user = currentUser[0];
    const callsign = currentUser[2];

    try {
        const { data, error } = await sbClient
            .from('calls')
            .select('*')
            .eq('id', incId)
            .single();

        if (error || !data) {
            alert('Incident not found with that ID.');
            return;
        }

        if (isIncidentClosedValue(data)) {
            alert('Cannot attach to a closed incident.');
            return;
        }

        const newIdData = await sbClient.functions.invoke('incident-id');
        if (newIdData.error || !newIdData.data) {
            console.error('Edge Function Error:', newIdData.error);
            throw new Error('Could not generate new Incident ID');
        }

        const { lastFour, formatted } = newIdData.data;
        const timeNow = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false });

        const { error: insertError } = await sbClient
            .from('calls')
            .insert([{
                id: formatted,
                last4: lastFour,
                created_at: timeNow,
                status: 'Pending',
                prmry: null,
                assist: [],
                area: data.area,
                beat: data.beat,
                call_type: data.call_type,
                call_code: data.call_code,
                location: data.location,
                comments: [`${timeNow} ${callsign} - Cloned incident. Original ID: ${incId}`, ...data.comments],
                vehicles: data.vehicles,
                persons: data.persons,
                history: [`${timeNow} ${callsign} (${user})- Cloned incident. Original ID: ${incId}`, ...data.history],
                is_active: true,
                is_closed: false,
                is_pending: false,
                logged_by: user
            }]);

        if (insertError) throw insertError;

        alert(`Incident cloned successfully with new ID ending in ${lastFour}.`);

    } catch (err) {
        console.error('Error cloning incident:', err);
        alert(`Failed to clone incident: ${err.message}`);
    }
}

//-- Helper Function to build incident ID given the last 4 --\\
function buildTodayIncidentIdFromLast4(id) {
    const date = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const parts = formatter.formatToParts(date).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});

    const mm = parts.month;
    const dd = parts.day;
    const yy = parts.year.slice(-2);
    const dateStr = `${mm}${dd}${yy}`;

    const idInt = Number.parseInt(id, 10);
    if (isNaN(idInt) || idInt < 0 || idInt > 9999) {
        return null;
    }

    return `PD/${dateStr}-${idInt}`;
}

//-- Open modal if incident not found by last 4 (only used by incident close) --\\
function openCloseIncidentFullIdModal(last4Hint) {
    pendingCloseIncidentLast4 = String(last4Hint || '').trim() || null;
    const hintEl = document.getElementById('closeIncidentFullIdHint');
    if (hintEl) {
        hintEl.textContent = pendingCloseIncidentLast4
            ? `No incident found for today using ${pendingCloseIncidentLast4}. Enter full incident ID:`
            : 'No incident found for today. Enter full incident ID:';
    }
    showModal('closeIncidentFullIdModal');
}

//-- Close incident by exact ID (used by both close command and full ID modal) --\\
async function closeIncidentByExactId(incId, sourceLabel) {
    const timeNow = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false });
    const normalizedId = String(incId || '').trim();
    if (!normalizedId) {
        return { ok: false, found: false };
    }

    const currentUser = sessionStorage.getItem('userInfo') ? sessionStorage.getItem('userInfo').split(',') : null;
    if (!currentUser) {
        alert('No active user session found. Please log in again.');
        return { ok: false, found: false };
    }

    const user = currentUser[0];
    const callsign = currentUser[2];

    try {
        const authClient = getRlsClient();

        const { data: incident, error: fetchError } = await authClient
            .from('calls')
            .select('comments, history, prmry, assist, last4, status, is_closed')
            .eq('id', normalizedId)
            .maybeSingle();

        if (fetchError) throw fetchError;
        if (!incident) return { ok: true, found: false };
        if (isIncidentClosedValue(incident)) return { ok: true, found: true, alreadyClosed: true };

        let cleanComments = [];
        if (incident.comments && Array.isArray(incident.comments)) {
            cleanComments = incident.comments.filter(item => item !== null && String(item).trim() !== "");
        }

        let cleanHistory = [];
        if (incident.history && Array.isArray(incident.history)) {
            cleanHistory = incident.history.filter(item => item !== null && String(item).trim() !== "");
        }

        cleanComments.push(`INC CLOSED W/O DISPOSITION BY ${callsign}`);
        cleanHistory.push(`${timeNow} ${callsign} (${user}) - Incident closed via ${sourceLabel || 'IC command'}, no disposition.`);

        const { data, error } = await authClient
            .from('calls')
            .update({
                comments: cleanComments,
                history: cleanHistory,
                status: 'Closed',
                is_active: false,
                is_closed: true
            })
            .eq('id', normalizedId);

        if (error) throw error;

        alert(`Incident ${normalizedId} closed successfully.`);
        playSound('callClosed');
        await refreshCallTable();
        await refreshAdvCallTable(currentAdvCallsView);
        if (currentIncidentId === normalizedId) {
            await closeIncident();
        }
        return { ok: true, found: true };
    } catch (err) {
        console.error('Error closing incident:', err);
        alert(`Failed to close incident: ${err.message}`);
        return { ok: false, found: false };
    }
}


//-- Close Incident Logic (ic command + footer)--\\
async function closeIncidentById(id, sourceLabel = 'IC command') {
    const todayIncidentId = buildTodayIncidentIdFromLast4(id);
    if (!todayIncidentId) {
        alert('Invalid incident ID (Tip: put only last 4 of incident.)');
        return;
    }

    const result = await closeIncidentByExactId(todayIncidentId, sourceLabel);
    if (!result.ok) return;
    if (!result.found) {
        openCloseIncidentFullIdModal(id);
    }
}

//-- Submit handler for full ID incident close modal --\\
async function submitCloseIncidentFullId() {
    const input = document.getElementById('closeIncidentFullIdInput');
    const error = document.getElementById('closeIncidentFullIdError');
    const fullId = input ? input.value.trim() : '';

    if (error) error.textContent = '';

    if (!fullId) {
        if (error) error.textContent = 'Please enter a full incident ID.';
        return;
    }

    const result = await closeIncidentByExactId(fullId, 'full ID lookup');
    if (!result.ok) return;

    if (!result.found) {
        if (error) error.textContent = 'No incident found with that ID.';
        return;
    }

    if (result.alreadyClosed) {
        if (error) error.textContent = 'This incident is already closed.';
        return;
    }

    closeModal('closeIncidentFullIdModal');
}

//-- Logic for add comment command (iu) --\\
async function addComment(id, comment) {
    const timeNow = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false });
    const date = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const parts = formatter.formatToParts(date).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});

    const mm = parts.month;
    const dd = parts.day;
    const yy = parts.year.slice(-2);
    const dateStr = `${mm}${dd}${yy}`;

    let idInt = Number.parseInt(id, 10);
    if (isNaN(idInt) || idInt < 0 || idInt > 9999) {
        alert('Invalid incident ID (Tip: put only last 4 of incident.)');
        return;
    }

    let incId = `PD/${dateStr}-${idInt}`;

    const currentUser = sessionStorage.getItem('userInfo') ? sessionStorage.getItem('userInfo').split(',') : null;
    if (!currentUser) {
        alert('No active user session found. Please log in again.');
        return;
    }

    const user = currentUser[0];
    const callsign = currentUser[2];

    try {
        const { data: incident, error: fetchError } = await sbClient
            .from('calls')
            .select('comments, history, status, is_closed')
            .eq('id', incId)
            .single();

        if (fetchError) {
            alert('Incident not found with that ID.');
            return;
        }

        if (isIncidentClosedValue(incident)) {
            alert('Cannot add comments. Incident is closed.');
            return;
        }

        const { data, error } = await sbClient
            .from('calls')
            .update({
                comments: [...(incident.comments || []), comment],
                history: [...(incident.history || []), `${timeNow} ${callsign} (${user}) - Comment added: ${comment}`]
            }).eq('id', incId)

        if (error) throw error;

        alert(`Comment added to incident ${incId} successfully.`);
    } catch (err) {
        console.error('Error fetching incident for adding comment:', err);
        alert(`Failed to fetch incident: ${err.message}`);
        return;
    }
}

//-- Helper functions for normalizing and rendering incident person and vehicle entries --\\
function normalizeIncidentArrayEntry(entry, size) {
    const fallback = Array(size).fill('N/A');
    if (Array.isArray(entry)) {
        return fallback.map((v, idx) => entry[idx] ?? v);
    }
    if (entry && typeof entry === 'object') {
        if (size === 5 && 'clothing' in entry) {
            return [entry.name ?? 'N/A', entry.clothing ?? 'N/A', entry.race ?? 'N/A', entry.sex ?? 'N/A', entry.id ?? 'N/A'];
        }
        if (size === 5 && 'make' in entry) {
            return [entry.year ?? 'N/A', entry.make ?? 'N/A', entry.model ?? 'N/A', entry.plate ?? 'N/A', entry.color ?? 'N/A'];
        }
    }
    return fallback;
}

//-- Helper functions for normalizing and rendering incident person and vehicle entries --\\
function toGroupedIncidentEntries(raw, size) {
    const arr = Array.isArray(raw) ? raw : [];
    if (arr.length === 0) return [];

    const first = arr[0];
    if (Array.isArray(first) || (first && typeof first === 'object')) {
        return arr.map(entry => normalizeIncidentArrayEntry(entry, size));
    }

    const grouped = [];
    for (let i = 0; i < arr.length; i += size) {
        grouped.push(normalizeIncidentArrayEntry(arr.slice(i, i + size), size));
    }
    return grouped;
}

function flattenIncidentEntries(entries, size) {
    const normalizedEntries = Array.isArray(entries) ? entries : [];
    return normalizedEntries.flatMap(entry => normalizeIncidentArrayEntry(entry, size));
}

function renderIncidentPersonEntry(personData) {
    const [name, clothing, race, sex, idValue] = normalizeIncidentArrayEntry(personData, 5);
    const personDiv = document.createElement('div');
    personDiv.classList.add('person-entry');
    personDiv.dataset.name = String(name);
    personDiv.dataset.clothing = String(clothing);
    personDiv.dataset.race = String(race);
    personDiv.dataset.sex = String(sex);
    personDiv.dataset.id = String(idValue);
    const idDisplay = idValue
        ? '<span style="text-decoration:underline;cursor:pointer;color:#1a6abf;" onclick="autoQueryId(\'' + idValue + '\')">' + idValue + '</span>'
        : '\u2014';
    personDiv.innerHTML = `
                <div class="row">
                    <div class="cell-6"><b>Name:</b> ${name}</div>
                    <div class="cell-6"><b>Clothing Desc:</b> ${clothing}</div>
                </div>
                <div class="row">
                    <div class="cell-4"><b>Race:</b> ${race}</div>
                    <div class="cell-4"><b>Sex:</b> ${sex}</div>
                    <div class="cell-4"><b>ID#:</b> ${idDisplay}</div>
                </div>
                <hr />
            `;
    return personDiv;
}

//-- Helper functions for normalizing and rendering incident person and vehicle entries --\\
function renderIncidentVehicleEntry(vehicleData) {
    const [year, make, model, plate, color] = normalizeIncidentArrayEntry(vehicleData, 5);
    const vehicleDiv = document.createElement('div');
    vehicleDiv.classList.add('vehicle-entry');
    vehicleDiv.dataset.year = String(year);
    vehicleDiv.dataset.make = String(make);
    vehicleDiv.dataset.model = String(model);
    vehicleDiv.dataset.plate = String(plate);
    vehicleDiv.dataset.color = String(color);
    vehicleDiv.innerHTML = `
                <div class="row">
                    <div class="cell-4">${year}</div>
                    <div class="cell-4">${make}</div>
                    <div class="cell-4">${model}</div>
                </div>
                <div class="row">
                    <div class="cell-6">${plate}</div>
                    <div class="cell-6">${color}</div>
                </div>
                <hr />
            `;
    return vehicleDiv;
}

//-- Helper functions for collecting incident person and vehicle data from modals --\\
function collectIncidentPersonsFromModal() {
    const entries = document.querySelectorAll('#incPerModal .person-entry');
    return Array.from(entries).map(entry => ([
        entry.dataset.name || 'N/A',
        entry.dataset.clothing || 'N/A',
        entry.dataset.race || 'N/A',
        entry.dataset.sex || 'N/A',
        entry.dataset.id || 'N/A'
    ]));
}

//-- Helper functions for collecting incident person and vehicle data from modals --\\
function collectIncidentVehiclesFromModal() {
    const entries = document.querySelectorAll('#incVehModal .vehicle-entry');
    return Array.from(entries).map(entry => ([
        entry.dataset.year || 'N/A',
        entry.dataset.make || 'N/A',
        entry.dataset.model || 'N/A',
        entry.dataset.plate || 'N/A',
        entry.dataset.color || 'N/A'
    ]));
}

//-- Helper functions for updating incident person and vehicle counts in modals and nav --\\
function updateIncPerCount() {
    const count = document.querySelectorAll('#incPerModal .person-entry').length;
    const text = document.getElementById('incPerCountText');
    const navCounter = document.getElementById('incPerCounter');
    if (text) text.innerHTML = `<b>${count}</b> person${count !== 1 ? 's' : ''} found attached to incident:`;
    if (navCounter) navCounter.textContent = `(${count})`;
    return count;
}

//-- Helper functions for updating incident person and vehicle counts in modals and nav --\\
function updateIncVehCount() {
    const count = document.querySelectorAll('#incVehModal .vehicle-entry').length;
    const text = document.getElementById('incVehCountText');
    const navCounter = document.getElementById('incVehCounter');
    if (text) text.innerHTML = `<b>${count}</b> vehicle${count !== 1 ? 's' : ''} found attached to incident:`;
    if (navCounter) navCounter.textContent = `(${count})`;
    return count;
}

//-- Helper functions for updating incident person and vehicle counts in modals and nav --\\
function updateIncCounts() {
    updateIncPerCount();
    updateIncVehCount();
}

//-- Helper functions for normalizing and rendering incident person and vehicle entries --\\
async function saveIncidentPersons(id, persons) {
    const isOpen = await ensureIncidentOpenForAction(id, 'update persons');
    if (!isOpen) return;

    const { error } = await sbClient
        .from('calls')
        .update({ persons: flattenIncidentEntries(persons, 5) })
        .eq('id', id);

    if (error) throw error;
}

//-- Helper functions for normalizing and rendering incident person and vehicle entries --\\
async function saveIncidentVehicles(id, vehicles) {
    const isOpen = await ensureIncidentOpenForAction(id, 'update vehicles');
    if (!isOpen) return;

    const { error } = await sbClient
        .from('calls')
        .update({ vehicles: flattenIncidentEntries(vehicles, 5) })
        .eq('id', id);

    if (error) throw error;
}

//-- Helper functions for normalizing and rendering incident person and vehicle entries --\\
function normalizeCallUnitList(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.map(v => String(v || '').trim()).filter(Boolean);
    }
    return String(value)
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
}

//-- Helper functions for normalizing and rendering incident person and vehicle entries --\\
function normalizeUnitKey(unitName) {
    return String(unitName || '')
        .replace(/^PD\//i, '')
        .trim()
        .toUpperCase();
}

function isIncidentClosedValue(incidentData) {
    const statusNorm = String(incidentData?.status || '').trim().toLowerCase();
    return incidentData?.is_closed === true || statusNorm === 'closed';
}

function didIncidentReceiveNewComment(oldIncident, newIncident) {
    const oldComments = Array.isArray(oldIncident?.comments) ? oldIncident.comments : [];
    const newComments = Array.isArray(newIncident?.comments) ? newIncident.comments : [];
    const oldHistory = Array.isArray(oldIncident?.history) ? oldIncident.history : [];
    const newHistory = Array.isArray(newIncident?.history) ? newIncident.history : [];

    if (newComments.length > oldComments.length) return true;
    if (newHistory.length > oldHistory.length) return true;

    const oldLastComment = oldComments.length > 0 ? oldComments[oldComments.length - 1] : '';
    const newLastComment = newComments.length > 0 ? newComments[newComments.length - 1] : '';
    if (oldLastComment !== newLastComment && newLastComment !== '') return true;

    return false;
}

//-- Func checks for if a incident is open, if open allows actions --\\
async function ensureIncidentOpenForAction(id, actionLabel) {
    if (!id || !sbClient) {
        alert('No incident is currently open.');
        return false;
    }

    const { data, error } = await sbClient
        .from('calls')
        .select('status, is_closed')
        .eq('id', id)
        .single();

    if (error || !data) {
        alert('Incident not found with that ID.');
        return false;
    }

    if (isIncidentClosedValue(data)) {
        alert(`Cannot ${actionLabel}. Incident is closed.`);
        return false;
    }

    return true;
}

//-- Helper func for attach and de-attach btn --\\
function isCurrentUnitAttachedToIncident(incidentData) {
    const userInfo = sessionStorage.getItem('userInfo') ? sessionStorage.getItem('userInfo').split(',') : null;
    const unit = userInfo ? userInfo[2] : null;
    const selfKey = normalizeUnitKey(unit);
    if (!selfKey || !incidentData) return false;

    const primaryUnits = normalizeCallUnitList(incidentData.prmry);
    const assistUnits = normalizeCallUnitList(incidentData.assist);

    return primaryUnits.some(unitName => normalizeUnitKey(unitName) === selfKey) ||
        assistUnits.some(unitName => normalizeUnitKey(unitName) === selfKey);
}

//-- helper func for attach and de-attach btn (ui upd) --\\
function updateAttachToggleButton(incidentData) {
    const btn = document.getElementById('attachToggleBtn');
    if (!btn) return;
    btn.textContent = isCurrentUnitAttachedToIncident(incidentData) ? 'De-Attach' : 'Attach';
}

//-- Helper functions for building incident detach updates --\\
function buildIncidentDetachUpdates(calls, unitName) {
    const detachedUnit = normalizeUnitKey(unitName);
    if (!detachedUnit) return [];

    const updates = [];

    calls.forEach(call => {
        const callId = call.id;
        const primaryUnits = normalizeCallUnitList(call.prmry);
        const assistUnits = normalizeCallUnitList(call.assist);
        if (!callId) return;

        const wasPrimary = primaryUnits.length > 0 && normalizeUnitKey(primaryUnits[0]) === detachedUnit;
        const wasAssist = assistUnits.some(unit => normalizeUnitKey(unit) === detachedUnit);
        if (!wasPrimary && !wasAssist) return;

        const filteredAssist = assistUnits.filter(unit => normalizeUnitKey(unit) !== detachedUnit);
        let nextPrimary = primaryUnits.length > 0 ? primaryUnits[0] : null;
        let nextAssist = filteredAssist;

        if (wasPrimary) {
            nextPrimary = filteredAssist.length > 0 ? filteredAssist[0] : null;
            nextAssist = filteredAssist.slice(1);
        }

        updates.push({
            id: callId,
            prmry: nextPrimary,
            assist: nextAssist
        });
    });

    return updates;
}

//-- Helper functions for detaching units from incidents --\\
async function detachUnitFromAllIncidents(unitName, client = sbClient) {
    if (!client || !unitName) return;

    const { data: calls, error } = await client
        .from('calls')
        .select('id, prmry, assist');

    if (error) {
        console.error('Error fetching incidents for detach:', error);
        return;
    }

    const updates = buildIncidentDetachUpdates(Array.isArray(calls) ? calls : [], unitName);
    for (const update of updates) {
        const { error: updateError } = await client
            .from('calls')
            .update({ prmry: update.prmry, assist: update.assist })
            .eq('id', update.id);

        if (updateError) {
            console.error(`Error detaching unit from incident ${update.id}:`, updateError);
        }
    }
}

//-- Logic for handling primary unit assignment and change --\\
async function handlePrimaryButtonClick() {
    if (!currentIncidentId || !sbClient) {
        alert('No incident is currently open.');
        return;
    }

    try {
        const { data, error } = await sbClient
            .from('calls')
            .select('prmry, status, is_closed')
            .eq('id', currentIncidentId)
            .single();

        if (error || !data) {
            alert('Incident not found.');
            return;
        }

        if (isIncidentClosedValue(data)) {
            alert('Cannot become primary on a closed incident.');
            return;
        }

        const currentPrimary = normalizeCallUnitList(data.prmry)[0] || null;
        if (!currentPrimary) {
            await becomePrimaryOfCurrentIncident();
            return;
        }

        showModal('makePrimaryConfirmModal');
    } catch (e) {
        console.error('Error checking incident primary:', e);
        alert(`Failed to check incident primary: ${e?.message || e}`);
    }
}

//-- Logic for toggling incident sections in the UI --\\
function setIncidentSectionState(section, visible) {
    const map = {
        summary: { nav: 'incSummaryNav', targets: ['incSummarySection'] },
        incidentInfo: { nav: 'incInfoNav', targets: ['incInfoHeader', 'incInfoStatusRow'] },
        unitDetails: { nav: 'incUnitDetailsNav', targets: ['incUnitDetailsSection'] }
    };

    const config = map[section];
    if (!config) return;

    config.targets.forEach(targetId => {
        const el = document.getElementById(targetId);
        if (el) {
            el.style.display = visible ? '' : 'none';
        }
    });

    const nav = document.getElementById(config.nav);
    if (nav) {
        nav.classList.toggle('active-inc-tab', visible);
    }
}

//-- Logic for toggling incident sections in the UI --\\
function toggleIncidentSection(section) {
    const map = {
        summary: ['incSummarySection'],
        incidentInfo: ['incInfoHeader', 'incInfoStatusRow'],
        unitDetails: ['incUnitDetailsSection']
    };

    const targetIds = map[section] || [];
    const firstTarget = targetIds.length > 0 ? document.getElementById(targetIds[0]) : null;
    const currentlyVisible = firstTarget ? firstTarget.style.display !== 'none' : true;
    setIncidentSectionState(section, !currentlyVisible);
}

//-- Logic for subscribing to real-time updates for the currently viewed incident --\\
function applyIncidentDetailsToView(data, id) {
    const vehicles = toGroupedIncidentEntries(data.vehicles, 5);
    const persons = toGroupedIncidentEntries(data.persons, 5);
    const primaryUnits = normalizeCallUnitList(data.prmry);
    const assistUnits = normalizeCallUnitList(data.assist);
    const allUnits = [...primaryUnits, ...assistUnits];
    const incidentClosed = isIncidentClosedValue(data);

    const incidentPanel = document.getElementById('inc-adv-view-wrapper');
    if (incidentPanel) {
        incidentPanel.dataset.incidentClosed = incidentClosed ? 'true' : 'false';
    }

    const vehCounter = document.getElementById('incVehCounter');
    const perCounter = document.getElementById('incPerCounter');
    const unitCounter = document.getElementById('incUnitCounter');
    const incHistoryCounter = document.getElementById('incHistoryCounter');
    const incCommentsModalSubmit = document.getElementById('incAdvViewAddCmtsSubmit');
    const dispFile = document.getElementById('dispSubmitBtn');
    dispFile.onclick = () => { handleDisposition(id); };
    const editIncSubmit = document.getElementById('editIncSubmitBtn');
    editIncSubmit.onclick = () => { editIncident(id); };
    const historyArea = document.getElementById('incidentHistory');
    if (historyArea) {
        const hist = data.history;
        if (Array.isArray(hist) && hist.length > 0) {
            historyArea.innerHTML = hist.map(h => `<div style="margin-bottom:4px;border-bottom:1px solid #ccc;padding-bottom:4px;">${escapeHtml(h)}</div>`).join('');
        } else {
            historyArea.innerHTML = '<p>No history available.</p>';
        }
    }
    const historyHeader = document.getElementById('incHistoryHeader');
    if (historyHeader) { historyHeader.textContent = `History for incident ${id}`; }

    // Pre-populate edit modal fields only when the modal is closed (avoid overwriting in-progress edits)
    const editModal = document.getElementById('editIncidentModal');
    if (!editModal || editModal.style.display === 'none' || editModal.style.display === '') {
        const editIncTypeEl = document.getElementById('editIncType');
        const editIncLocEl = document.getElementById('editIncLocation');
        const editIncNarrEl = document.getElementById('editIncNarrative');
        const editIncPriEl = document.getElementById('editIncPriority');
        if (editIncTypeEl) editIncTypeEl.value = data.call_type || '';
        if (editIncLocEl) editIncLocEl.value = data.location || '';
        if (editIncNarrEl) editIncNarrEl.value = (Array.isArray(data.comments) ? data.comments[0] : data.narrative) || '';
        if (editIncPriEl) editIncPriEl.value = String(data.priority ?? '');
    }

    const dispHeader = document.getElementById('dispHeader');
    const dispIncId = document.getElementById('dispIncId');
    const dispPrmry = document.getElementById('primaryCallsLabel');

    dispHeader.textContent = `CLEAR ${data.call_type} AT ${data.location}`;
    dispIncId.textContent = `Inc Number: ${id}`;
    dispPrmry.textContent = `PD/${data.prmry}`;

    const footerCloseBtn = document.getElementById('footerBtnClose');
    if (footerCloseBtn) {
        footerCloseBtn.onclick = () => {
            closeIncidentById(id.split('-').pop(), 'incident footer button');
        };
    }

    if (incCommentsModalSubmit) {
        incCommentsModalSubmit.onclick = () => {
            if (incidentClosed) {
                alert('Cannot add comments. Incident is closed.');
                return;
            }
            addComment(id.split('-').pop(), document.getElementById('incAdvViewAddCmtsInput').value.trim());
            document.getElementById('incAdvViewAddCmtsInput').value = '';
            closeModal('incAdvViewAddCommantsModal');
        };
    }
    if (vehCounter) vehCounter.textContent = `(${vehicles.length})`;
    if (perCounter) perCounter.textContent = `(${persons.length})`;
    if (unitCounter) unitCounter.textContent = `(${String(allUnits.length)})`;
    if (incHistoryCounter) incHistoryCounter.textContent = `(${data.history.length || 0})`;
    const cmtsEl = document.getElementById('inc-adv-view-cmts');
    const beat = document.getElementById('rd');
    const start = document.getElementById('incStart');
    const units = document.getElementById('incUnits');
    const incLocation2 = document.getElementById('inc-location2');
    const incStatus2 = document.getElementById('inc-status2');
    const incStatus = document.getElementById('inc-status');
    const incLocation = document.getElementById('inc-location');
    const incType = document.getElementById('inc-type');
    const incId = document.getElementById('inc-id');

    if (cmtsEl) cmtsEl.textContent = Array.isArray(data.comments) ? data.comments.join('\n') : (data.comments || 'No comments available.');
    if (beat) beat.textContent = data.beat ?? '';
    if (start) start.textContent = data.created_at ?? '';
    if (units) units.textContent = allUnits.join(', ');
    if (incLocation2) incLocation2.textContent = data.location ?? '';
    if (incStatus2) incStatus2.textContent = data.status ? `Incident Status: ${data.status}` : '';
    if (incStatus) incStatus.textContent = data.status ? `${data.status} Incident` : '';
    if (incLocation) incLocation.textContent = data.location ?? '';
    if (incType) incType.textContent = data.call_type ? `Inc Type: ${data.call_type}` : '';
    if (incId) incId.textContent = id ? `Inc #: ${id}` : '';

    updateAttachToggleButton(data);
}

//-- Logic for subscribing to real-time updates for the currently viewed incident --\\
async function unsubscribeIncidentDetails() {
    if (sbClient && incidentDetailsChannel) {
        await sbClient.removeChannel(incidentDetailsChannel);
        incidentDetailsChannel = null;
    }
}

//-- Logic for subscribing to real-time updates for the currently viewed incident --\\
async function subscribeIncidentDetails(id) {
    if (!sbClient || !id) return;

    await unsubscribeIncidentDetails();

    incidentDetailsChannel = sbClient
        .channel(`incident-details-${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, async (payload) => {
            const payloadId = payload?.new?.id || payload?.old?.id;
            if (payloadId !== id) return;

            if (payload.eventType === 'DELETE') {
                await closeIncident();
                return;
            }

            if (payload.new) {
                if (didIncidentReceiveNewComment(payload.old, payload.new)) {
                    playSound('newCmt');
                }

                applyIncidentDetailsToView(payload.new, id);
            }
        })
        .subscribe();
}

//-- Logic for handling primary unit assignment and change --\\
async function becomePrimaryOfCurrentIncident() {
    if (!currentIncidentId || !sbClient) {
        alert('No incident is currently open.');
        return;
    }

    const userInfo = sessionStorage.getItem('userInfo') ? sessionStorage.getItem('userInfo').split(',') : null;
    const currentUser = userInfo ? userInfo[0] : null;
    const myUnit = userInfo ? userInfo[2] : null;

    if (!currentUser || !myUnit) {
        alert('No active user session found. Please log in again.');
        return;
    }

    try {
        const { data: callData, error: callError } = await sbClient
            .from('calls')
            .select('id, prmry, assist, last4, location, status, is_closed')
            .eq('id', currentIncidentId)
            .single();

        if (callError || !callData) {
            alert('Incident not found.');
            return;
        }

        if (isIncidentClosedValue(callData)) {
            alert('Cannot become primary on a closed incident.');
            closeModal('makePrimaryConfirmModal');
            return;
        }

        const oldPrimary = normalizeCallUnitList(callData.prmry)[0] || null;
        if (oldPrimary && oldPrimary === myUnit) {
            closeModal('makePrimaryConfirmModal');
            return;
        }

        const assist = normalizeCallUnitList(callData.assist)
            .filter(unit => unit !== myUnit && unit !== oldPrimary);

        if (oldPrimary && oldPrimary !== myUnit) {
            assist.unshift(oldPrimary);
        }

        const dedupAssist = Array.from(new Set(assist));

        const { error: updateCallError } = await sbClient
            .from('calls')
            .update({
                prmry: myUnit,
                assist: dedupAssist,
                status: 'Active',
                is_active: true,
                is_pending: false
            })
            .eq('id', currentIncidentId);

        if (updateCallError) throw updateCallError;

        if (callData.last4) {
            const { error: updateSelfUnitError } = await sbClient
                .from('units')
                .update({
                    inc: String(callData.last4),
                    incLocation: callData.location ?? ''
                })
                .eq('user', currentUser);

            if (updateSelfUnitError) {
                console.error('Error syncing current unit after primary reassignment:', updateSelfUnitError);
            }
        }

        closeModal('makePrimaryConfirmModal');
    } catch (e) {
        console.error('Error becoming primary:', e);
        alert(`Failed to become primary: ${e?.message || e}`);
    }
}

async function locateCurrentIncidentOnMobileMap() {
    if (!currentIncidentId || !sbClient) {
        alert('No incident is currently open.');
        return;
    }

    try {
        const { data, error } = await sbClient
            .from('calls')
            .select('id, created_at, status, location, call_code, prmry, assist, is_closed, ping_x, ping_y, ping_z, ping_radius_miles')
            .eq('id', currentIncidentId)
            .single();

        if (error || !data) {
            alert('Incident not found.');
            return;
        }

        const x = Number(data.ping_x);
        const z = Number(data.ping_z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) {
            alert('This incident does not have a mobile map ping.');
            return;
        }

        window.__pendingMobileMapCallPing = data;

        if (typeof openWindowsApp === 'function') {
            await openWindowsApp('MobileMap');
        } else if (typeof updateView === 'function') {
            await updateView('mobileMap');
        }

        const centerWhenReady = () => {
            if (typeof window.centerMobileMapOnCallPing === 'function') {
                window.centerMobileMapOnCallPing(data);
                return true;
            }
            return false;
        };

        if (!centerWhenReady()) {
            setTimeout(centerWhenReady, 250);
            setTimeout(centerWhenReady, 750);
        }
    } catch (e) {
        console.error('Failed locating incident on mobile map:', e);
        alert('Failed to locate incident on mobile map.');
    }
}

window.locateCurrentIncidentOnMobileMap = locateCurrentIncidentOnMobileMap;

//-- Logic for showing incident details view and loading incident data --\\
async function showIncident(id) {
    if (typeof restoreMainUI === 'function') {
        restoreMainUI();
    }
    const homeFoot = document.getElementById('home-foot');
    const incFoot = document.getElementById('inc-foot');
    const queryFoot = document.getElementById('query-foot');
    const submitQueryFoot = document.getElementById('submit-query-foot');
    const mainApp = document.getElementById('mainApp');
    const mainWrapper = document.getElementById('homeContentWrapper');
    const incidentPanel = document.getElementById('inc-adv-view-wrapper');
    const incContent = document.getElementById('inc-content');
    const mainActionButtons = document.getElementById('mainActionButtons');
    const commandBarRow = document.querySelector('#mainApp > .px-5.mt-1');
    const unitInfoRow = document.querySelector('#mainApp > .container-fluid.p-0.mt-1');

    const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
    };

    const positionIncidentPanel = () => {
        if (!incidentPanel || !mainApp) return;

        const appRect = mainApp.getBoundingClientRect();
        const chromeBottoms = [];
        if (isVisible(mainActionButtons)) chromeBottoms.push(mainActionButtons.getBoundingClientRect().bottom);
        if (isVisible(commandBarRow)) chromeBottoms.push(commandBarRow.getBoundingClientRect().bottom);
        if (isVisible(unitInfoRow)) chromeBottoms.push(unitInfoRow.getBoundingClientRect().bottom);

        const chromeBottomViewport = chromeBottoms.length ? Math.max(...chromeBottoms) : appRect.top;
        const topEdge = Math.max(0, Math.round(chromeBottomViewport - appRect.top));

        const footerRect = isVisible(incFoot) ? incFoot.getBoundingClientRect() : null;
        const bottomOffset = footerRect
            ? Math.max(0, Math.round(appRect.bottom - footerRect.top))
            : 0;

        incidentPanel.style.setProperty('position', 'absolute', 'important');
        incidentPanel.style.removeProperty('inset');
        incidentPanel.style.setProperty('top', `${topEdge}px`, 'important');
        incidentPanel.style.setProperty('left', '0', 'important');
        incidentPanel.style.setProperty('right', '0', 'important');
        incidentPanel.style.setProperty('bottom', `${bottomOffset}px`, 'important');
        incidentPanel.style.setProperty('height', 'auto', 'important');
        incidentPanel.style.setProperty('z-index', 'var(--mdt-z-content, 1)', 'important');
    };

    if (mainApp) mainApp.style.display = 'flex';
    if (mainActionButtons) mainActionButtons.style.setProperty('display', 'block', 'important');
    document.querySelectorAll('#mainApp > .px-5, #mainApp > .container-fluid').forEach(el => {
        el.style.setProperty('display', 'block', 'important');
    });
    if (commandBarRow) commandBarRow.style.setProperty('display', 'block', 'important');
    if (unitInfoRow) unitInfoRow.style.setProperty('display', 'block', 'important');

    if (homeFoot) homeFoot.style.display = 'none';
    if (incFoot) incFoot.style.display = 'flex';
    if (queryFoot) queryFoot.style.display = 'none';
    if (submitQueryFoot) submitQueryFoot.style.display = 'none';
    const advCallFoot = document.getElementById('adv-call-table-foot');
    if (advCallFoot) advCallFoot.style.display = 'none';

    if (mainWrapper) mainWrapper.style.display = 'none';
    if (incidentPanel) {
        incidentPanel.style.display = 'flex';
        incidentPanel.style.visibility = 'visible';
        positionIncidentPanel();
        // Re-run after layout settles (fonts/tabs/footer sizing can shift immediately after open).
        requestAnimationFrame(positionIncidentPanel);
        setTimeout(positionIncidentPanel, 60);
        flickerIn(incidentPanel);
    }
    if (incContent) {
        incContent.style.display = 'block';
    }

    if (currentView && currentView !== 'incidentDetails') {
        lastMainView = currentView;
    }
    currentView = 'incidentDetails';
    await syncLiveMonitorsForCurrentView();

    currentIncidentId = id;

    try {
        const { data, error } = await sbClient
            .from('calls')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            alert('Incident not found with that ID.');
            return;
        }

        applyIncidentDetailsToView(data, id);

        const incPerActivator = document.getElementById('incPerActivator');
        const incVehActivator = document.getElementById('incVehActivator');

        if (incPerActivator) {
            incPerActivator.onclick = () => {
                let addPerEl = document.getElementById('addIncPerBtn');
                let remvPerEl = document.getElementById('removeIncPerBtn');
                if (isIncidentClosedValue(data)) {
                    addPerEl.disabled = true;
                    remvPerEl.disabled = true;
                } else {
                    addPerEl.disabled = false;
                    remvPerEl.disabled = false;
                }
                showModal('incPerModal');
                getIncidentPersons(id);
            };
        }

        if (incVehActivator) {
            incVehActivator.onclick = () => {
                let addVehBtnEl = document.getElementById('addIncVehBtn');
                let removeVehBtnEl = document.getElementById('removeIncVehBtn');
                if (isIncidentClosedValue(data)) {
                    addVehBtnEl.disabled = true;
                    removeVehBtnEl.disabled = true;
                } else {
                    addVehBtnEl.disabled = false;
                    removeVehBtnEl.disabled = false;
                }
                showModal('incVehModal');
                getIncidentVehicles(id);
            };
        }

        setIncidentSectionState('summary', true);
        setIncidentSectionState('incidentInfo', true);
        setIncidentSectionState('unitDetails', true);

        if (surfedPages.length < 7) {
            surfedPages.push(`showIncident(${id});`);
        } else {
            surfedPages.shift();
            surfedPages.push(`showIncident(${id});`);
        }
        currentPageIndex = surfedPages.length - 1;

        await subscribeIncidentDetails(id);
        refreshIncQueryCounter();
    } catch (e) {
        console.error('Error fetching incident details:', e);
        alert('Failed to fetch incident details. Please try again.');
    }
}

//-- Logic for closing incident details view and cleaning up --\\
async function getIncidentPersons(id) {
    try {
        const { data, error } = await sbClient
            .from('calls')
            .select('persons')
            .eq('id', id)
            .single();

        if (error || !data) {
            alert('Incident not found with that ID.');
            return;
        }

        const holder = document.getElementById('incPerHolder');
        const countText = document.getElementById('incPerCountText');
        if (!holder || !countText) return;

        holder.innerHTML = '';

        const people = toGroupedIncidentEntries(data.persons, 5);
        people.forEach(person => holder.appendChild(renderIncidentPersonEntry(person)));
        countText.innerHTML = `<b>${people.length}</b> person${people.length !== 1 ? 's' : ''} found attached to incident:`;
        updateIncPerCount();
    } catch (e) {
        console.error('Error fetching incident persons:', e);
        alert('Failed to fetch incident persons. Please try again.');
    }
}

//-- Logic for fetching and displaying incident vehicles in the vehicle modal --\\
async function getIncidentVehicles(id) {
    try {
        const { data, error } = await sbClient
            .from('calls')
            .select('vehicles')
            .eq('id', id)
            .single();

        if (error || !data) {
            alert('Incident not found with that ID.');
            return;
        }

        const holder = document.getElementById('incVehHolder');
        const countText = document.getElementById('incVehCountText');
        if (!holder || !countText) return;

        holder.innerHTML = '';

        const vehicles = toGroupedIncidentEntries(data.vehicles, 5);
        vehicles.forEach(vehicle => holder.appendChild(renderIncidentVehicleEntry(vehicle)));
        countText.innerHTML = `<b>${vehicles.length}</b> vehicle${vehicles.length !== 1 ? 's' : ''} found attached to incident:`;
        updateIncVehCount();
    } catch (e) {
        console.error('Error fetching incident vehicles:', e);
        alert('Failed to fetch incident vehicles. Please try again.');
    }
}

//-- Logic for adding a new person to the incident or toggling remove mode in the person modal --\\
async function addIncPerson() {
    if (!currentIncidentId) {
        alert('No incident is currently open.');
        return;
    }

    const isOpen = await ensureIncidentOpenForAction(currentIncidentId, 'add or edit persons');
    if (!isOpen) return;

    const holder = document.getElementById('incPerHolder');
    if (!holder) return;

    if (incPerRemoveMode) {
        const modalBody = document.querySelector('#incPerModal .modal-body');
        const entries = modalBody ? modalBody.querySelectorAll('.person-entry') : [];
        entries.forEach(entry => {
            if (entry.style.backgroundColor === 'rgb(40, 167, 69)') {
                entry.remove();
            } else {
                entry.style.backgroundColor = '';
                entry.style.cursor = '';
                entry.onclick = null;
            }
        });

        try {
            await saveIncidentPersons(currentIncidentId, collectIncidentPersonsFromModal());
        } catch (e) {
            console.error('Error saving incident persons:', e);
            alert(`Failed to save persons: ${e?.message || e}`);
        }

        document.getElementById('addIncPerBtn').textContent = 'Add New Person';
        document.getElementById('removeIncPerBtn').textContent = 'Remove Person';
        incPerRemoveMode = false;
        updateIncCounts();
        return;
    }

    if (incPerAddMode) {
        const inputs = holder.querySelectorAll('input');
        if (inputs.length >= 5) {
            const personDiv = renderIncidentPersonEntry([
                inputs[0].value.trim() || 'N/A',
                inputs[1].value.trim() || 'N/A',
                inputs[2].value.trim() || 'N/A',
                inputs[3].value.trim() || 'N/A',
                inputs[4].value.trim() || 'N/A'
            ]);

            holder.appendChild(personDiv);
            holder.querySelectorAll('.pending-entry').forEach(node => node.remove());

            try {
                await saveIncidentPersons(currentIncidentId, collectIncidentPersonsFromModal());
            } catch (e) {
                console.error('Error saving incident persons:', e);
                alert(`Failed to save persons: ${e?.message || e}`);
            }
        }

        document.getElementById('addIncPerBtn').textContent = 'Add New Person';
        document.getElementById('removeIncPerBtn').textContent = 'Remove Person';
        incPerAddMode = false;
        updateIncCounts();
        return;
    }

    const personDiv = document.createElement('div');
    personDiv.classList.add('grid', 'pending-entry');
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
    document.getElementById('addIncPerBtn').textContent = 'Save Data';
    document.getElementById('removeIncPerBtn').textContent = 'Cancel';
    incPerAddMode = true;
}

//-- Logic for adding a new person to the incident or toggling remove mode in the person modal --\\
function toggleRemoveIncPerMode() {
    if (incPerAddMode) {
        document.getElementById('incPerHolder').querySelectorAll('.pending-entry').forEach(node => node.remove());
        document.getElementById('addIncPerBtn').textContent = 'Add New Person';
        document.getElementById('removeIncPerBtn').textContent = 'Remove Person';
        incPerAddMode = false;
        updateIncCounts();
        return;
    }

    const modalBody = document.querySelector('#incPerModal .modal-body');
    if (incPerRemoveMode) {
        const entries = modalBody.querySelectorAll('.person-entry');
        entries.forEach(entry => {
            entry.style.backgroundColor = '';
            entry.style.cursor = '';
            entry.onclick = null;
        });
        document.getElementById('addIncPerBtn').textContent = 'Add New Person';
        document.getElementById('removeIncPerBtn').textContent = 'Remove Person';
        incPerRemoveMode = false;
        updateIncCounts();
        return;
    }

    const entries = modalBody.querySelectorAll('.person-entry');
    entries.forEach(entry => {
        entry.style.cursor = 'pointer';
        entry.onclick = function (event) {
            if (event.target.closest('.button')) return;
            this.style.backgroundColor = this.style.backgroundColor === 'rgb(40, 167, 69)' ? '' : '#28a745';
        };
    });
    document.getElementById('addIncPerBtn').textContent = 'Save Changes';
    document.getElementById('removeIncPerBtn').textContent = 'Cancel Remove';
    incPerRemoveMode = true;
}

//-- Logic for resetting the incident person modal state when closed --\\
function resetIncPerModal() {
    document.getElementById('incPerHolder').innerHTML = '';
    document.getElementById('addIncPerBtn').textContent = 'Add New Person';
    document.getElementById('removeIncPerBtn').textContent = 'Remove Person';
    incPerAddMode = false;
    incPerRemoveMode = false;
    const selected = document.querySelectorAll('#incPerModal .person-entry');
    selected.forEach(el => {
        el.style.backgroundColor = '';
        el.style.cursor = '';
        el.onclick = null;
    });
}

//-- Logic for adding a new vehicle to the incident or toggling remove mode in the vehicle modal --\\
async function addIncVehicle() {
    if (!currentIncidentId) {
        alert('No incident is currently open.');
        return;
    }

    const isOpen = await ensureIncidentOpenForAction(currentIncidentId, 'add or edit vehicles');
    if (!isOpen) return;

    const holder = document.getElementById('incVehHolder');
    if (!holder) return;

    if (incVehRemoveMode) {
        const modalBody = document.querySelector('#incVehModal .modal-body');
        const entries = modalBody ? modalBody.querySelectorAll('.vehicle-entry') : [];
        entries.forEach(entry => {
            if (entry.style.backgroundColor === 'rgb(40, 167, 69)') {
                entry.remove();
            } else {
                entry.style.backgroundColor = '';
                entry.style.cursor = '';
                entry.onclick = null;
            }
        });

        try {
            await saveIncidentVehicles(currentIncidentId, collectIncidentVehiclesFromModal());
        } catch (e) {
            console.error('Error saving incident vehicles:', e);
            alert(`Failed to save vehicles: ${e?.message || e}`);
        }

        document.getElementById('addIncVehBtn').textContent = 'Add New Vehicle';
        document.getElementById('removeIncVehBtn').textContent = 'Remove Vehicle';
        incVehRemoveMode = false;
        updateIncCounts();
        return;
    }

    if (incVehAddMode) {
        const inputs = holder.querySelectorAll('input');
        if (inputs.length >= 5) {
            const vehicleDiv = renderIncidentVehicleEntry([
                inputs[0].value.trim() || 'N/A',
                inputs[1].value.trim() || 'N/A',
                inputs[2].value.trim() || 'N/A',
                inputs[3].value.trim() || 'N/A',
                inputs[4].value.trim() || 'N/A'
            ]);

            holder.appendChild(vehicleDiv);
            holder.querySelectorAll('.pending-entry').forEach(node => node.remove());

            try {
                await saveIncidentVehicles(currentIncidentId, collectIncidentVehiclesFromModal());
            } catch (e) {
                console.error('Error saving incident vehicles:', e);
                alert(`Failed to save vehicles: ${e?.message || e}`);
            }
        }

        document.getElementById('addIncVehBtn').textContent = 'Add New Vehicle';
        document.getElementById('removeIncVehBtn').textContent = 'Remove Vehicle';
        incVehAddMode = false;
        updateIncCounts();
        return;
    }

    const vehicleDiv = document.createElement('div');
    vehicleDiv.classList.add('grid', 'pending-entry');
    vehicleDiv.style.marginBottom = '10px';
    vehicleDiv.innerHTML = `
                    <div class="row">
                        <input type="text" class="cell-4" placeholder="Year" style="border-radius: 0px !important; padding: 5px;">
                        <input type="text" class="cell-4" placeholder="Make" style="border-radius: 0px !important; padding: 5px;">
                        <input type="text" class="cell-4" placeholder="Model" style="border-radius: 0px !important; padding: 5px;">
                    </div>
                    <div class="row">
                        <input type="text" class="cell-6" placeholder="Plate" style="border-radius: 0px !important; padding: 5px;">
                        <input type="text" class="cell-6" placeholder="Color" style="border-radius: 0px !important; padding: 5px;">
                    </div>
                `;
    holder.appendChild(vehicleDiv);
    document.getElementById('addIncVehBtn').textContent = 'Save Data';
    document.getElementById('removeIncVehBtn').textContent = 'Cancel';
    incVehAddMode = true;
}

//-- Logic for adding a new vehicle to the incident or toggling remove mode in the vehicle modal --\\
function toggleRemoveIncVehMode() {
    if (incVehAddMode) {
        document.getElementById('incVehHolder').querySelectorAll('.pending-entry').forEach(node => node.remove());
        document.getElementById('addIncVehBtn').textContent = 'Add New Vehicle';
        document.getElementById('removeIncVehBtn').textContent = 'Remove Vehicle';
        incVehAddMode = false;
        updateIncCounts();
        return;
    }

    const modalBody = document.querySelector('#incVehModal .modal-body');
    if (incVehRemoveMode) {
        const entries = modalBody.querySelectorAll('.vehicle-entry');
        entries.forEach(entry => {
            entry.style.backgroundColor = '';
            entry.style.cursor = '';
            entry.onclick = null;
        });
        document.getElementById('addIncVehBtn').textContent = 'Add New Vehicle';
        document.getElementById('removeIncVehBtn').textContent = 'Remove Vehicle';
        incVehRemoveMode = false;
        updateIncCounts();
        return;
    }

    const entries = modalBody.querySelectorAll('.vehicle-entry');
    entries.forEach(entry => {
        entry.style.cursor = 'pointer';
        entry.onclick = function (event) {
            if (event.target.closest('.button')) return;
            this.style.backgroundColor = this.style.backgroundColor === 'rgb(40, 167, 69)' ? '' : '#28a745';
        };
    });
    document.getElementById('addIncVehBtn').textContent = 'Save Changes';
    document.getElementById('removeIncVehBtn').textContent = 'Cancel Remove';
    incVehRemoveMode = true;
}

//-- Logic for resetting the incident vehicle modal state when closed --\\
function resetIncVehModal() {
    document.getElementById('incVehHolder').innerHTML = '';
    document.getElementById('addIncVehBtn').textContent = 'Add New Vehicle';
    document.getElementById('removeIncVehBtn').textContent = 'Remove Vehicle';
    incVehAddMode = false;
    incVehRemoveMode = false;
    const selected = document.querySelectorAll('#incVehModal .vehicle-entry');
    selected.forEach(el => {
        el.style.backgroundColor = '';
        el.style.cursor = '';
        el.onclick = null;
    });
}

//-- Logic for closing incident details view and cleaning up --\\
//-- Footer 'Close' button: guard against closing an already-closed incident --\\
async function footerCloseIncident() {
    if (!currentIncidentId) {
        alert('No incident is currently open.');
        return;
    }

    const isOpen = await ensureIncidentOpenForAction(currentIncidentId, 'close incident');
    if (!isOpen) return;  // Already closed - ensureIncidentOpenForAction shows the alert

    // closeIncidentByExactId directly since we already have the full ID
    await closeIncidentByExactId(currentIncidentId, 'footer close button');
}

async function closeIncident() {
    const homeFoot = document.getElementById('home-foot');
    const incFoot = document.getElementById('inc-foot');
    const mainWrapper = document.getElementById('homeContentWrapper');
    const incidentPanel = document.querySelectorAll('.incident-view-wrapper');

    if (homeFoot) homeFoot.style.display = 'flex';
    if (incFoot) incFoot.style.display = 'none';
    if (mainWrapper) mainWrapper.style.display = 'flex';

    incidentPanel.forEach(panel => {
        panel.style.display = 'none';
        panel.style.visibility = 'hidden';
        panel.dataset.incidentClosed = '';
    });

    await unsubscribeIncidentDetails();
    currentIncidentId = null;
    currentView = lastMainView || 'incidentsView';

    // Restore tableArea on return from incident view
    const tableArea = document.querySelector('.table-area');
    if (tableArea) tableArea.classList.remove('adv-table-mode');
    const queryFoot = document.getElementById('query-foot');
    if (queryFoot) queryFoot.style.display = 'none';

    await syncLiveMonitorsForCurrentView();

    const attachToggleBtn = document.getElementById('attachToggleBtn');
    if (attachToggleBtn) attachToggleBtn.textContent = 'Attach';
}

//-- Setup Live Monitor [Adv Calls]--\\
async function setupAdvCallsLiveMonitor() {
    if (!sbClient) return;

    await refreshAdvCallTable(currentAdvCallsView);

    if (advCallLiveMonitorChannel) return;

    advCallLiveMonitorChannel = sbClient
        .channel('adv-call-monitor')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, async (payload) => {
            await refreshAdvCallTable(currentAdvCallsView);

            if (payload?.eventType === 'INSERT') {
                playSound('newCall');
            }
        })
        .subscribe();
}

//-- Switch between callboard and query sub-views --\\
function fixCallsAdvLayout() {
    const tableArea = document.querySelector('.table-area');
    if (tableArea) tableArea.classList.add('adv-table-mode');
}

//-- Relies on callboard to switchover to query, otherwise callboard overide  --\\
function switchCallsSubView(subView) {
    window._callsSubView = subView;
    const callboardSidebar = document.getElementById('callboard-sidebar-area');
    const callboardTable = document.getElementById('callboard-table-area');
    const queryArea = document.getElementById('query-table-area');
    const queryFoot = document.getElementById('query-foot');
    const homeFoot = document.getElementById('home-foot');
    const advCallFoot = document.getElementById('adv-call-table-foot');
    if (subView === 'query') {
        if (!queryArea) {
            if (typeof updateView === 'function') updateView('queryResults');
            return;
        }
        if (callboardSidebar) callboardSidebar.style.display = 'none';
        if (callboardTable) callboardTable.style.display = 'none';
        if (queryArea) queryArea.style.display = 'flex';
        if (queryFoot) queryFoot.style.setProperty('display', 'flex', 'important');
        if (homeFoot) homeFoot.style.setProperty('display', 'none', 'important');
        if (advCallFoot) advCallFoot.style.setProperty('display', 'none', 'important');
    } else {
        if (callboardSidebar) callboardSidebar.style.display = 'flex';
        if (callboardTable) callboardTable.style.display = 'flex';
        if (queryArea) queryArea.style.display = 'none';
        if (queryFoot) queryFoot.style.setProperty('display', 'none', 'important');
        // Only show home footer if we're NOT in callsAdvTable (which has its own footer)
        if (homeFoot && currentView !== 'callsAdvTable') homeFoot.style.setProperty('display', 'flex', 'important');
    }
}

//-- Edit Incident (via footer btn) --\\
async function editIncident(id) {
    const timeNow = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false });

    if (!sbClient) return;
    if (!id) {
        alert('No incident ID provided for editing.');
        return;
    }

    const currentUser = sessionStorage.getItem('userInfo') ? sessionStorage.getItem('userInfo').split(',') : null;
    if (!currentUser) {
        alert('No active user session found. Please log in again.');
        return;
    }

    const user = currentUser[0];
    const callsign = currentUser[2];

    const incTyp = document.getElementById('editIncType');
    const incLoc = document.getElementById('editIncLocation');
    const incNarrative = document.getElementById('editIncNarrative');
    const incPriority = document.getElementById('editIncPriority');

    try {
        // Fetch current comments so we can update comments[0] (narrative) without wiping others
        const { data: existing } = await sbClient.from('calls').select('comments').eq('id', id).single();
        const currentComments = Array.isArray(existing?.comments) ? [...existing.comments] : [];
        if (incNarrative && incNarrative.value.trim()) {
            currentComments[0] = incNarrative.value.trim();
        }

        const { error: updateError } = await sbClient
            .from('calls')
            .update({
                call_type: incTyp ? incTyp.value.trim() : undefined,
                location: incLoc ? incLoc.value.trim() : undefined,
                comments: currentComments,
                call_code: incPriority ? incPriority.value : undefined,
                history: [...(existing.history || []), `${timeNow} ${callsign} (${user}) - Edited base incident data. New data: <br />Call Type: ${incTyp ? incTyp.value.trim() : ''}<br />Location: ${incLoc ? incLoc.value.trim() : ''}<br />Narrative: ${incNarrative ? incNarrative.value.trim() : ''}<br />Priority: ${incPriority ? incPriority.value : ''}`]
            })
            .eq('id', id);

        if (updateError) {
            console.error('Error updating incident:', updateError);
            alert('Failed to save changes. Please try again.');
            return;
        }
        closeModal('editIncidentModal');
        await showIncident(id);
    } catch (e) {
        console.error('Error saving incident edits:', e);
        alert('Failed to save changes. Please try again.');
    }
}

//-- Parse data from DB for requested units --\\
function parseRequestedUnitsFromText(text) {
    const raw = String(text || '');
    const match = raw.match(/Requested\s+units:\s*(.+)$/i);
    if (!match || !match[1]) return [];
    return match[1].split(',').map(v => v.trim()).filter(Boolean);
}

//-- Logic for monitoring incoming unit requests and showing alert modals --\\
function getRequestedUnitsFromCallData(call) {
    const history = Array.isArray(call?.history) ? call.history : [];
    for (let i = history.length - 1; i >= 0; i -= 1) {
        const units = parseRequestedUnitsFromText(history[i]);
        if (units.length > 0) {
            return { units, sourceLine: String(history[i]) };
        }
    }

    const comments = Array.isArray(call?.comments) ? call.comments : [];
    for (let i = comments.length - 1; i >= 0; i -= 1) {
        const units = parseRequestedUnitsFromText(comments[i]);
        if (units.length > 0) {
            return { units, sourceLine: String(comments[i]) };
        }
    }

    return { units: [], sourceLine: '' };
}

function showNextIncomingUnitRequestModal() {
    if (activeIncomingUnitRequest || incomingUnitRequestQueue.length === 0) return;

    const next = incomingUnitRequestQueue.shift();
    activeIncomingUnitRequest = next;

    const idEl = document.getElementById('unitReqIncidentId');
    const typeEl = document.getElementById('unitReqIncidentType');
    const locEl = document.getElementById('unitReqIncidentLocation');

    if (idEl) idEl.textContent = next.incidentId || 'N/A';
    if (typeEl) typeEl.textContent = next.callType || 'N/A';
    if (locEl) locEl.textContent = next.location || 'N/A';

    playSound('untUpd');
    showModal('unitRequestActionModal');
}

//-- Queue incoming unit requests --\\
function queueIncomingUnitRequest(request) {
    if (!request || !request.incidentId || !request.uniqueKey) return;
    if (seenIncomingUnitRequestKeys.has(request.uniqueKey)) return;

    seenIncomingUnitRequestKeys.add(request.uniqueKey);
    incomingUnitRequestQueue.push(request);
    showNextIncomingUnitRequestModal();
}

// maybe
async function maybeHandleIncomingUnitRequest(callLikeData) {
    const userInfo = sessionStorage.getItem('userInfo') ? sessionStorage.getItem('userInfo').split(',') : null;
    const myUnit = userInfo ? userInfo[2] : null;
    const myUnitKey = normalizeUnitKey(myUnit);
    if (!myUnitKey) return;

    const callId = callLikeData?.id;
    if (!callId) return;

    let call = callLikeData;
    if (!Array.isArray(call?.history) && !Array.isArray(call?.comments)) {
        const { data, error } = await sbClient
            .from('calls')
            .select('id, call_type, location, comments, history, status, is_closed')
            .eq('id', callId)
            .maybeSingle();
        if (error || !data) return;
        call = data;
    }

    if (isIncidentClosedValue(call)) return;

    const parsed = getRequestedUnitsFromCallData(call);
    if (!parsed || parsed.units.length === 0) return;

    const requestedSelf = parsed.units.some(unit => normalizeUnitKey(unit) === myUnitKey);
    if (!requestedSelf) return;

    queueIncomingUnitRequest({
        incidentId: call.id,
        callType: call.call_type || '',
        location: call.location || '',
        uniqueKey: `${call.id}|${parsed.sourceLine}`
    });
}

//-- Setup live monitor for incoming unit requests --\\
async function setupUnitRequestAlertMonitor() {
    if (!sbClient || unitRequestAlertChannel) return;

    unitRequestAlertChannel = sbClient
        .channel('unit-request-alert-monitor')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, async (payload) => {
            try {
                await maybeHandleIncomingUnitRequest(payload?.new || null);
            } catch (e) {
                console.error('Incoming request monitor error:', e);
            }
        })
        .subscribe();

    try {
        const { data: openCalls, error } = await sbClient
            .from('calls')
            .select('id, call_type, location, comments, history, status, is_closed')
            .eq('is_closed', false)
            .limit(150);

        if (!error && Array.isArray(openCalls)) {
            for (const call of openCalls) {
                await maybeHandleIncomingUnitRequest(call);
            }
        }
    } catch (e) {
        console.error('Initial incoming request scan failed:', e);
    }
}

//-- Handlers for incoming unit request modal actions --\\
async function handleIncomingUnitRequestIgnore() {
    closeModal('unitRequestActionModal');
    activeIncomingUnitRequest = null;
    showNextIncomingUnitRequestModal();
}

async function handleIncomingUnitRequestView() {
    const req = activeIncomingUnitRequest;
    closeModal('unitRequestActionModal');
    activeIncomingUnitRequest = null;
    if (req?.incidentId) {
        await showIncident(req.incidentId);
    }
    showNextIncomingUnitRequestModal();
}

async function handleIncomingUnitRequestRespond() {
    const req = activeIncomingUnitRequest;
    closeModal('unitRequestActionModal');
    activeIncomingUnitRequest = null;
    if (req?.incidentId) {
        await showIncident(req.incidentId);
        await handleAttach();
        await setUnitStatus('Enroute');
        await syncCurrentUnitStatus();
    }
    showNextIncomingUnitRequestModal();
}

//-- Refresh adv call table --\\
async function refreshAdvCallTable(view) {
    if (!sbClient) return;

    currentAdvCallsView = view || currentAdvCallsView || 'assigned';

    document.querySelectorAll('#callboard-sidebar-area .side-nav-btn').forEach(btn => btn.classList.remove('active-calls-tab'));
    const viewBtnMap = { assigned: 0, pending: 1, closed: 2 };
    const activeIdx = viewBtnMap[currentAdvCallsView];
    const sideNavBtns = document.querySelectorAll('#callboard-sidebar-area .side-nav-btn');
    if (activeIdx !== undefined && sideNavBtns[activeIdx]) sideNavBtns[activeIdx].classList.add('active-calls-tab');

    const PAGE_SIZE = 100;
    let offset = 0;
    let data = [];

    while (true) {
        const { data: pageData, error } = await sbClient
            .from('calls')
            .select('id, last4, call_type, call_code, location, status, created_at, beat, prmry, assist, is_active, is_closed, is_pending')
            .order('created_at', { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
            console.error('Error fetching calls for live monitor:', error);
            return;
        }

        if (!Array.isArray(pageData) || pageData.length === 0) {
            break;
        }

        data = data.concat(pageData);

        if (pageData.length < PAGE_SIZE) {
            break;
        }

        offset += PAGE_SIZE;

        if (offset > 1000000) {
            console.warn('Stopped paging calls at 1,000,000 max for api :)');
            break;
        }
    }

    // Stable ordering for UI by incident last4 descending (fallback to created_at desc).
    data.sort((a, b) => {
        const aLast4 = Number(a?.last4);
        const bLast4 = Number(b?.last4);

        const aLast4Valid = Number.isFinite(aLast4);
        const bLast4Valid = Number.isFinite(bLast4);

        if (aLast4Valid && bLast4Valid && aLast4 !== bLast4) {
            return bLast4 - aLast4;
        }

        const aTime = Date.parse(a?.created_at || '');
        const bTime = Date.parse(b?.created_at || '');
        if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
            return bTime - aTime;
        }

        return String(b?.id || '').localeCompare(String(a?.id || ''));
    });

    const tableBody = document.getElementById('adv-call-table-real');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    const unclassified = (data || []).filter(c => {
        const s = String(c.status || '').toLowerCase();
        return !c.is_closed && s !== 'closed' && !c.is_pending && s !== 'pending' && !c.is_active && s !== 'assigned' && s !== 'active';
    });

    (data || []).forEach(call => {
        const statusNorm = String(call.status || '').toLowerCase();
        const isClosed = !!call.is_closed || statusNorm === 'closed';
        const isPending = !isClosed && (!!call.is_pending || statusNorm === 'pending');
        const isAssigned = !isClosed && !isPending && (!!call.is_active || statusNorm === 'assigned' || statusNorm === 'active');

        const row = document.createElement('tr');
        row.className = isClosed ? 'row-closed' : (isPending ? 'row-pending' : (isAssigned ? 'row-active' : 'row-pending'));
        row.dataset.status = isClosed ? 'closed' : (isPending ? 'pending' : 'assigned');
        row.dataset.units = [call.prmry, ...(Array.isArray(call.assist) ? call.assist : [])]
            .filter(Boolean)
            .join(', ')
            .toLowerCase();
        row.dataset.date = call.created_at ? String(call.created_at).slice(0, 10) : '';
        row.dataset.incId = call.id;
        row.innerHTML = `
                    <td>${call.last4 || ''}</td>
                    <td>${call.call_type || ''}</td>
                    <td>${call.call_code || ''}</td>
                    <td>${call.location || ''}</td>
                    <td>${call.beat || ''}</td>
                `;
        row.onclick = () => {
            document.querySelectorAll('#adv-call-table-real tr').forEach(r => r.classList.remove('row-selected-callsadv'));
            row.classList.add('row-selected-callsadv');
            window._callsAdvSelectedId = call.id;
        };
        tableBody.appendChild(row);
    });

    applyCallsViewFilters();

    if (window._callsAdvSelectedId) {
        const rows = document.querySelectorAll('#adv-call-table-real tr');
        rows.forEach(r => {
            if (r.dataset && r.dataset.incId == window._callsAdvSelectedId) {
                r.classList.add('row-selected-callsadv');
            }
        });
    }
}


function callsAdvView() {
    if (!window._callsAdvSelectedId) { alert('Select an incident first.'); return; }
    showIncident(window._callsAdvSelectedId);
}

function callsAdvSelfDispatch() {
    if (!window._callsAdvSelectedId) { alert('Select an incident first.'); return; }
    currentIncidentId = window._callsAdvSelectedId;
    handleAttach();
}


//-- Logic for handling attach to incident action --\\
async function handleAttach() {
    if (!currentIncidentId) {
        alert('No incident is currently open.');
        return;
    }

    if (!sbClient) {
        alert('Database connection is not available.');
        return;
    }

    try {
        const { data, error } = await sbClient
            .from('calls')
            .select('id, last4, location, prmry, assist, status, is_closed, history')
            .eq('id', currentIncidentId)
            .single();

        if (error || !data) {
            alert('Incident not found with that ID.');
            return;
        }

        if (isIncidentClosedValue(data)) {
            alert('Cannot attach to a closed incident.');
            return;
        }

        const primaryUnits = normalizeCallUnitList(data.prmry);
        const hasPrimary = primaryUnits.some(unitName => {
            const key = normalizeUnitKey(unitName);
            return key && key !== 'N/A' && key !== 'NULL' && key !== 'UNASSIGNED';
        });

        const userInfo = sessionStorage.getItem('userInfo') ? sessionStorage.getItem('userInfo').split(',') : null;
        const currentUser = userInfo ? userInfo[0] : null;
        const unit = userInfo ? userInfo[2] : null;

        if (!currentUser || !unit) {
            alert('No active user session found. Please log in again.');
            return;
        }

        const selfKey = normalizeUnitKey(unit);
        const alreadyPrimary = primaryUnits.some(unitName => normalizeUnitKey(unitName) === selfKey);
        const existingAssist = normalizeCallUnitList(data.assist);
        const alreadyAssist = existingAssist.some(unitName => normalizeUnitKey(unitName) === selfKey);

        if (alreadyPrimary) {
            alert("You're already primary on incident!");
            return;
        }

        if (alreadyAssist) {
            alert('Your unit is already attached to this incident.');
            return;
        }

        const nextAssist = Array.from(new Set([...existingAssist, unit]));
        const nextPrimary = hasPrimary ? data.prmry : unit;
        const nextAssistFinal = hasPrimary
            ? nextAssist
            : existingAssist.filter(unitName => normalizeUnitKey(unitName) !== selfKey);

        const { error: updateCallError } = await sbClient
            .from('calls')
            .update({
                prmry: nextPrimary,
                assist: nextAssistFinal,
                status: 'Active',
                is_active: true,
                is_pending: false,
                history: [...(data.history || []), `${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false })} ${unit} (${currentUser}) - Unit attached to incident as ${hasPrimary ? 'assist' : 'primary'}.`]
            }).eq('id', currentIncidentId);

        if (updateCallError) {
            console.error('Error attaching to incident:', updateCallError);
            alert(`Failed to attach to incident: ${updateCallError?.message || updateCallError}`);
            return;
        }

        const { error: updateUnitError } = await sbClient
            .from('units')
            .update({
                inc: data.last4 ? String(data.last4) : '',
                incLocation: data.location ?? '',
                code: 0
            })
            .eq('user', currentUser);

        if (updateUnitError) {
            console.error('Error syncing unit after attach:', updateUnitError);
        }

        await syncUnitsForIncidentAssignment({
            prmry: nextPrimary,
            assist: nextAssistFinal,
            last4: data.last4,
            location: data.location
        });

        updateAttachToggleButton({ prmry: nextPrimary, assist: nextAssistFinal });

        alert(hasPrimary ? 'Unit attached to incident.' : 'Unit attached to incident as primary.');


    } catch (error) {
        console.error('Error fetching incident data:', error);
        alert('An error occurred while fetching incident data.');

    }
}

//-- logic for handle an attach --\\
async function handleAttachToggle() {
    if (!currentIncidentId || !sbClient) {
        alert('No incident is currently open.');
        return;
    }

    try {
        const { data, error } = await sbClient
            .from('calls')
            .select('prmry, assist, status, is_closed')
            .eq('id', currentIncidentId)
            .single();

        if (error || !data) {
            alert('Incident not found with that ID.');
            return;
        }

        if (isIncidentClosedValue(data)) {
            alert('Cannot change attachment on a closed incident.');
            return;
        }

        if (isCurrentUnitAttachedToIncident(data)) {
            await handleDetachSelf();
        } else {
            await handleAttach();
        }
    } catch (e) {
        console.error('Error toggling attach state:', e);
        alert(`Failed to toggle attach state: ${e?.message || e}`);
    }
}

//-- logic for de-attaching yourself --\\
async function handleDetachSelf() {
    if (!currentIncidentId) {
        alert('No incident is currently open.');
        return;
    }

    if (!sbClient) {
        alert('Database connection is not available.');
        return;
    }

    const userInfo = sessionStorage.getItem('userInfo') ? sessionStorage.getItem('userInfo').split(',') : null;
    const currentUser = userInfo ? userInfo[0] : null;
    const unit = userInfo ? userInfo[2] : null;

    if (!currentUser || !unit) {
        alert('No active user session found. Please log in again.');
        return;
    }

    try {
        const { data: callData, error: callError } = await sbClient
            .from('calls')
            .select('id, prmry, assist, last4, location')
            .eq('id', currentIncidentId)
            .single();

        if (callError || !callData) {
            alert('Incident not found with that ID.');
            return;
        }

        const updates = buildIncidentDetachUpdates([callData], unit);
        if (updates.length === 0) {
            alert('Your unit is not attached to this incident.');
            return;
        }

        const next = updates[0];
        const { data, error: updateCallError } = await sbClient
            .from('calls')
            .update({
                prmry: next.prmry,
                assist: next.assist,
                history: [...(callData.history || []), `${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false })} ${unit} (${currentUser}) - Unit de-attached from incident.`]
            })
            .eq('id', currentIncidentId);

        if (updateCallError) {
            console.error('Error detaching from incident:', updateCallError);
            alert(`Failed to de-attach from incident: ${updateCallError?.message || updateCallError}`);
            return;
        }

        const { data: unitRow } = await sbClient
            .from('units')
            .select('status')
            .eq('user', currentUser)
            .single();

        const { error: updateUnitError } = await sbClient
            .from('units')
            .update({
                status: getAvailableCombinedStatus(unitRow?.status),
                inc: '',
                incLocation: '',
                code: ''
            })
            .eq('user', currentUser);

        if (updateUnitError) {
            console.error('Error syncing unit after de-attach:', updateUnitError);
        }

        await syncUnitsForIncidentAssignment({
            prmry: next.prmry,
            assist: next.assist,
            last4: callData.last4,
            location: callData.location
        });

        updateAttachToggleButton({ prmry: next.prmry, assist: next.assist });

        alert('Unit de-attached from incident.');
    } catch (e) {
        console.error('Error detaching from incident:', e);
        alert(`Failed to de-attach from incident: ${e?.message || e}`);
    }
}

//-- Allow disposition func --\\
function allowDisp() {
    const incidentView = document.getElementById('inc-adv-view-wrapper');
    if (incidentView && incidentView.style.display !== 'none' && incidentView.style.visibility !== 'hidden') {
        if (incidentView.dataset.incidentClosed === 'true') {
            alert('Cannot file disposition. Incident is already closed.');
            return;
        }
        showModal('dispositionModal');
    } else {
        alert("You're not viewing an incident!");
    }
}

//-- Handle disposition --\\

async function handleDisposition(id) {
    const mainDispoEl = document.getElementById('top-disposition');
    const dispoCmtsEl = document.getElementById('disp-cmts');
    const prmryDispoEl = document.getElementById('primaryAction');
    const superCallsignEl = document.getElementById('supervisorCallsignInput');
    const superDispoEl = document.getElementById('supervisorAction');
    const superPresentEl = document.getElementById('disp-super');
    const bwvUsedEl = document.getElementById('disp-bwv');
    const dicvUsedEl = document.getElementById('disp-dicv');
    const repNumEl = document.getElementById('disp-rept');

    const mainDispo = mainDispoEl ? mainDispoEl.value.trim() : '';
    const dispoCmts = dispoCmtsEl ? dispoCmtsEl.value.trim() : '';
    const prmryDispo = prmryDispoEl ? prmryDispoEl.value.trim() : '';
    const supervisorCallsign = superCallsignEl ? superCallsignEl.value.trim() : '';
    const supervisorDispo = superDispoEl ? superDispoEl.value.trim() : '';
    const reportNum = repNumEl ? repNumEl.value.trim() : '';
    const supervisorPresent = superPresentEl ? superPresentEl.checked : false;
    const bwvUsed = bwvUsedEl ? bwvUsedEl.checked : false;
    const dicvUsed = dicvUsedEl ? dicvUsedEl.checked : false;

    const currentUser = sessionStorage.getItem('userInfo') ? sessionStorage.getItem('userInfo').split(',') : null;
    if (!currentUser) {
        alert('No active user session found. Please log in again.');
        return;
    }

    if (!mainDispo) {
        alert('Please select a disposition.');
        return;
    }

    if (!prmryDispo) {
        alert('Please select a primary action.');
        return;
    }

    if (supervisorPresent && (!supervisorCallsign || !supervisorDispo)) {
        alert('Please provide supervisor callsign and action.');
        return;
    }

    const user = currentUser[0];
    const callsign = currentUser[2];
    const timeNow = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false });

    try {
        const { data: incident, error: fetchError } = await sbClient
            .from('calls')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !incident) {
            alert('Incident not found with that ID.');
            return;
        }

        if (isIncidentClosedValue(incident)) {
            alert('Cannot file disposition. Incident is already closed.');
            return;
        }

        const supervisorText = supervisorPresent
            ? `Supervisor was present (${supervisorCallsign}) and their action was: ${supervisorDispo}`
            : 'Supervisor was not present.';

        const dispositionEntry = [
            '--------------------',
            `DISPOSITION FILED BY ${callsign}`,
            `Disposition: ${mainDispo}`,
            `Primary (${incident.prmry || 'N/A'}) action: ${prmryDispo}`,
            supervisorText,
            `Report #: ${reportNum}`,
            `Body-worn camera used: ${bwvUsed ? 'Yes' : 'No'}`,
            `DICV used: ${dicvUsed ? 'Yes' : 'No'}`,
            `Extra comments attached from disposition: ${dispoCmts || 'None'}`
        ].join('\n');

        const historyEntry = [
            '--------------------',
            `${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false })} ${callsign} (${currentUser})`,
            `==DISPOSITION FILED==`,
            `Disposition: ${mainDispo}`,
            `Primary (${incident.prmry || 'N/A'}) action: ${prmryDispo}`,
            supervisorText,
            `Body-worn camera used: ${bwvUsed ? 'Yes' : 'No'}`,
            `DICV used: ${dicvUsed ? 'Yes' : 'No'}`,
            `Extra comments attached from disposition: ${dispoCmts || 'None'}`,
            `${timeNow} ${callsign} (${user}) - Incident status set to Closed via disposition.`
        ].join('\n');

        const { error: updateError } = await sbClient
            .from('calls')
            .update({
                status: 'Closed',
                is_active: false,
                is_closed: true,
                is_pending: false,
                comments: [...(incident.comments || []), dispositionEntry],
                history: [...(incident.history || []), historyEntry]
            })
            .eq('id', id);

        if (updateError) {
            throw updateError;
        }

        mainDispoEl.value = '';
        dispoCmtsEl.value = '';
        prmryDispoEl.value = '';
        superCallsignEl.value = '';
        superDispoEl.value = '';
        superPresentEl.checked = false;
        bwvUsedEl.checked = false;
        dicvUsedEl.checked = false;
        repNumEl.value = '';
        closeModal('dispositionModal');
        closeIncident();
        await refreshCallTable();
        await refreshAdvCallTable(currentAdvCallsView);

        alert('Disposition filed and incident closed.');
    } catch (e) {
        console.error('Error filing disposition:', e);
        alert(`Failed to file disposition: ${e?.message || e}`);
    }
}
