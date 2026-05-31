//-- Helper to see if db flag is true --\\
function isLogoffTrueDbFlag(value) {
    if (value === true || value === 1) return true;
    const norm = String(value ?? '').trim().toLowerCase();
    return norm === 'true' || norm === '1' || norm === 't' || norm === 'yes' || norm === 'y';
}

const unitLiveSoundSignatures = new Map();

function getUnitLiveSoundKey(row) {
    return String(row?.user || row?.unit || row?.id || '').trim();
}

function getUnitLiveSoundSignature(row) {
    if (!row) return '';
    return JSON.stringify({
        unit: row.unit ?? '',
        status: row.status ?? '',
        inc: row.inc ?? '',
        incLocation: row.incLocation ?? '',
        code: row.code ?? '',
        invehicle: row.invehicle ?? row.inVehicle ?? ''
    });
}

function isVisibleUnitRow(unit) {
    const status = String(unit?.status || '').trim().toLowerCase();
    const inc = String(unit?.inc || '').trim();
    const incLocation = String(unit?.incLocation || '').trim();
    const gpsUpdatedAt = Date.parse(unit?.gps_updated_at || '');
    const hasRecentGps = Number.isFinite(gpsUpdatedAt) && Date.now() - gpsUpdatedAt < 30000;
    const combinedStatus = [
        unit?.status,
        unit?.invehicle,
        unit?.inVehicle
    ].map(value => String(value || '').trim().toLowerCase()).filter(Boolean).join(' ');

    if (!status && !unit?.unit) return false;
    if (status === 'end of watch' || status === 'eow') return false;
    if (combinedStatus.includes('end of watch') || combinedStatus.includes('eow')) return false;
    if (hasRecentGps) return true;
    if (inc || incLocation) return true;
    if (['sow', 'start of watch', 'stat', 'station'].includes(status)) return false;
    return true;
}

function seedUnitLiveSoundSignatures(rows) {
    if (!Array.isArray(rows)) return;
    rows.forEach(row => {
        const key = getUnitLiveSoundKey(row);
        if (key) unitLiveSoundSignatures.set(key, getUnitLiveSoundSignature(row));
    });
}

function shouldPlayUnitLiveSound(payload) {
    if (!payload || payload.eventType === 'DELETE') return false;

    const row = payload.new || payload.old || null;
    const key = getUnitLiveSoundKey(row);
    if (!key) return false;

    const nextSignature = getUnitLiveSoundSignature(payload.new || row);
    const previousSignature = unitLiveSoundSignatures.get(key) || getUnitLiveSoundSignature(payload.old);
    unitLiveSoundSignatures.set(key, nextSignature);

    if (payload.eventType === 'INSERT') return true;
    return previousSignature && nextSignature !== previousSignature;
}

//-- Unsubscribe from logoff request live monitor after logoff --\\
async function unsubscribeLogoffRequestLiveMonitor() {
    if (sbClient && logoffRequestChannel) {
        await sbClient.removeChannel(logoffRequestChannel);
        logoffRequestChannel = null;
    }
}

//-- Live Monitor for database logoff = true req -\\\
async function logoffRequestLiveMonitor() {
    if (!sbClient) return;

    const currentUser = sessionStorage.getItem('userInfo');
    const currentUserEmail = currentUser ? currentUser.split(',')[0] : null;
    if (!currentUserEmail) return;

    await unsubscribeLogoffRequestLiveMonitor();

    const channelName = `logoff-requests`;
    logoffRequestChannel = sbClient.channel(channelName);

    const shouldLogoffFromRow = (row) => {
        if (!row) return false;
        const rowUser = row.user ?? row.user_email ?? row.USER ?? row.USER_EMAIL ?? null;
        if (String(rowUser || '').trim().toLowerCase() !== String(currentUserEmail).trim().toLowerCase()) return false;
        const rawLogoff = row.LOGOFF ?? row.logoff ?? row.Logoff ?? row.logOff ?? false;
        return isLogoffTrueDbFlag(rawLogoff);
    };

    logoffRequestChannel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'units' }, async payload => {
            const row = payload?.new || payload?.old || null;
            if (shouldLogoffFromRow(row)) {
                await logoff(true);
            }
        })
        .subscribe();

    const { data: unitRow, error } = await sbClient
        .from('units')
        .select('*')
        .eq('user', currentUserEmail)
        .limit(1)
        .maybeSingle();

    if (!error && shouldLogoffFromRow(unitRow)) {
        await logoff(true);
    }
}

//-- Update User Info (For Update Unit Info Modal) --\\
async function updateUser() {
    let newCallsign = document.getElementById('newCallsign');
    let newWatch = document.getElementById('newWatch');

    if (!newCallsign.value.trim() || !newWatch.value.trim()) {
        alert('Please fill in all fields');
        return;
    }

    const currentUser = sessionStorage.getItem('userInfo');
    try {
        const { error } = await sbClient.from('units').update({
            unit: `${newCallsign.value.trim()}-${newWatch.value.trim()}`
        }).eq('user', currentUser ? currentUser.split(',')[0] : null);
        closeModal('editUnitInfoModal');
        let storedData = sessionStorage.getItem('userInfo');
        let serial;
        if (storedData) {
            storedData = storedData.split(',');
            storedData[2] = `${newCallsign.value.trim()}-${newWatch.value.trim()}`;
            serial = storedData[1];
            sessionStorage.setItem('userInfo', storedData.join(','));
        }
        const currentUserDisplay = document.getElementById('current-user');

        if (currentUserDisplay) currentUserDisplay.textContent = `${sessionStorage.getItem('userInfo') ? sessionStorage.getItem('userInfo').split(',')[1] : ''} [${newCallsign.value.trim()}-${newWatch.value.trim()}]`;

        newCallsign.value = '';
        newWatch.value = '';

    } catch (e) {
        console.error('Error updating unit data:', e);
        alert('An error occurred while updating your data. Please try again.');
        return;
    }
}

//-- Logoff --\\
async function logoff(shouldReload = true) {
    const currentUser = sessionStorage.getItem('userInfo');
    const currentUserParts = currentUser ? currentUser.split(',') : null;
    const currentUnit = currentUserParts ? currentUserParts[2] : null;
    const userToken = sessionStorage.getItem('userToken');

    try {
        if (currentUser && userToken) {
            const authClient = getRlsClient();

            if (currentUnit) {
                try {
                    await detachUnitFromAllIncidents(currentUnit, authClient);
                } catch (detachError) {
                    console.warn('Logoff continuing after detach failed:', detachError);
                }
            }

            try {
                const { error: gpsClearError } = await authClient
                    .from('units')
                    .update({
                        roblox_username: null,
                        gps_x: null,
                        gps_y: null,
                        gps_z: null,
                        gps_heading: null,
                        gps_updated_at: null
                    })
                    .eq('user', currentUserParts[0]);

                if (gpsClearError) throw gpsClearError;
            } catch (gpsClearError) {
                console.warn('Logoff continuing after GPS cleanup failed:', gpsClearError);
            }

            await unsubscribeUnitRequestAlertMonitor();
            await unsubscribeLogoffRequestLiveMonitor();

            const response = await fetch('https://lgajaitgqqznzlzjazxn.supabase.co/functions/v1/logoff', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${userToken}`
                }
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Failed to delete unit on server');
            }
        }

        clearAuthState();
        resetMdtUiAfterLogoff();
        if (shouldReload) {
            location.reload();
        }
    } catch (e) {
        console.error('Error during logoff:', e);
        clearAuthState();
        resetMdtUiAfterLogoff();
        if (shouldReload) {
            alert('An error occurred during logoff. Please try again.');
        }
    }
}

function resetMdtUiAfterLogoff() {
    const idsToClear = [
        'current-user',
        'cmdBar',
        'callsign-input',
        'roblox-username-input',
        'app-email-input',
        'app-password-input',
        'app-login-error',
        'user-data-error',
        'roblox-gps-error',
        'gps-status',
        'call-table-real',
        'adv-call-table-real',
        'unit-table-real',
        'query-table-real'
    ];

    idsToClear.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if ('value' in el) el.value = '';
        else el.textContent = '';
        if (id === 'gps-status') el.style.backgroundColor = '';
    });

    const watchInput = document.getElementById('watch-input');
    if (watchInput) watchInput.value = '';

    currentIncidentId = null;
    currentAdvCallsView = 'assigned';
    surfedPages = [];
    currentPageIndex = -1;
    incomingUnitRequestQueue = [];
    activeIncomingUnitRequest = null;
    seenIncomingUnitRequestKeys.clear();
    unitLiveSoundSignatures.clear();

    ['home-foot', 'inc-foot', 'query-foot', 'submit-query-foot', 'adv-call-table-foot', 'reports-compose-foot'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    document.querySelectorAll('.modal-overlay.active, .modal-content').forEach(el => {
        if (el.classList.contains('active')) el.classList.remove('active');
        if (el.classList.contains('modal-content')) el.style.display = 'none';
    });

    const appLoginArea = document.getElementById('appLoginArea');
    const inputUserDataArea = document.getElementById('inputUserDataArea');
    const robloxGpsArea = document.getElementById('robloxGpsArea');
    const mainApp = document.getElementById('mainApp');

    if (appLoginArea) appLoginArea.style.display = 'flex';
    if (inputUserDataArea) inputUserDataArea.style.display = 'none';
    if (robloxGpsArea) robloxGpsArea.style.display = 'none';
    if (mainApp) mainApp.style.display = 'none';
}


//-- Logoff on unload / reload --\\
function runUnloadLogoff() {
    if (unloadLogoffTriggered) return;
    unloadLogoffTriggered = true;

    const userInfo = sessionStorage.getItem('userInfo');
    const currentUser = userInfo ? userInfo.split(',')[0] : null;
    const currentUnit = userInfo ? userInfo.split(',')[2] : null;
    if (!currentUser) return;
    if (!supabaseUrl || !supabaseKey) return;

    try {
        fetch('https://lgajaitgqqznzlzjazxn.supabase.co/functions/v1/logoff', {
            method: 'POST',
            headers: getSupabaseAuthHeaders({ 'Content-Type': 'application/json' }),
            keepalive: true
        }).catch(err => console.error('Unload logoff function error:', err));

        if (currentUnit) {
            fetch(`${supabaseUrl}/rest/v1/calls?select=id,prmry,assist&apikey=${encodeURIComponent(supabaseKey)}`, {
                method: 'GET',
                headers: getSupabaseAuthHeaders(),
                keepalive: true
            })
                .then(resp => resp.ok ? resp.json() : [])
                .then(calls => {
                    const updates = buildIncidentDetachUpdates(Array.isArray(calls) ? calls : [], currentUnit);
                    updates.forEach(update => {
                        fetch(`${supabaseUrl}/rest/v1/calls?id=eq.${encodeURIComponent(update.id)}&apikey=${encodeURIComponent(supabaseKey)}`, {
                            method: 'PATCH',
                            headers: getSupabaseAuthHeaders({
                                'Content-Type': 'application/json',
                                Prefer: 'return=minimal'
                            }),
                            body: JSON.stringify({ prmry: update.prmry, assist: update.assist }),
                            keepalive: true
                        });
                    });
                })
                .catch(err => console.error('Unload detach incident error:', err));
        }

        fetch(`${supabaseUrl}/rest/v1/units?user=eq.${encodeURIComponent(currentUser)}&apikey=${encodeURIComponent(supabaseKey)}`, {
            method: 'DELETE',
            headers: getSupabaseAuthHeaders({ Prefer: 'return=minimal' }),
            keepalive: true
        });

        if (currentUnit) {
            fetch(`${supabaseUrl}/rest/v1/units?unit=eq.${encodeURIComponent(currentUnit)}&apikey=${encodeURIComponent(supabaseKey)}`, {
                method: 'DELETE',
                headers: getSupabaseAuthHeaders({ Prefer: 'return=minimal' }),
                keepalive: true
            });
        }
    } catch (e) {
        console.error('Unload logoff error:', e);
    }

    clearAuthState();
}

//-- Refresh Unit table for live monitor --\\
async function refreshUnitsTable() {
    const unitTable = document.getElementById('unit-table-real');
    if (!unitTable || !sbClient) return [];

    const { data, error } = await sbClient.from('units').select('*');
    if (error) {
        console.error('Error fetching units for live monitor:', error);
        return [];
    }

    unitTable.innerHTML = '';

    if (!Array.isArray(data)) return [];
    const visibleUnits = data.filter(isVisibleUnitRow);

    const monitorCountEl = document.getElementById('callsAdvMonitorCount');
    if (monitorCountEl) monitorCountEl.textContent = `(${visibleUnits.length})`;

    visibleUnits.forEach(unit => {
        const row = document.createElement('tr');
        const unitRowKey = unit.id ?? unit.user ?? unit.unit ?? Math.random().toString(36).slice(2);
        row.id = `unit-${unitRowKey}`;
        row.innerHTML = `
                    <td>${unit.unit ?? ''}</td>
                    <td class="unit-status">${unit.status ?? ''}</td>
                    <td class="unit-inc">${unit.inc ?? ''}</td>
                    <td class="unit-location">${unit.incLocation ?? ''}</td>
                    <td class="unit-code">${unit.code ?? ''}</td>
        `;
        unitTable.appendChild(row);
    });

    return visibleUnits;
}

//-- Setup live monitor [Units]--\\
async function setupUnitLiveMonitor() {
    if (!sbClient) return;

    const initialRows = await refreshUnitsTable();
    seedUnitLiveSoundSignatures(initialRows);
    await syncCurrentUserStatusFromUnitsTable();

    if (unitLiveMonitorChannel) return;

    unitLiveMonitorChannel = sbClient
        .channel('units-live-monitor')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'units' }, async (payload) => {
            const shouldPlaySound = shouldPlayUnitLiveSound(payload);
            await refreshUnitsTable();
            await syncCurrentUserStatusFromUnitsTable();

            if (shouldPlaySound) {
                const currentUser = sessionStorage.getItem('userInfo') ? sessionStorage.getItem('userInfo').split(',')[0] : null;
                const payloadUser = payload?.new?.user || payload?.old?.user || null;
                const isOwnRecentUpdate = currentUser && payloadUser === currentUser && Date.now() < suppressOwnUnitUpdateSoundUntil;

                if (!isOwnRecentUpdate) {
                    playSound('untUpd');
                }
            }
        })
        .subscribe();
}

//-- Unsubcribe from unit table (logoff) --\\
async function unsubscribeUnitLiveMonitor() {
    if (sbClient && unitLiveMonitorChannel) {
        await sbClient.removeChannel(unitLiveMonitorChannel);
        unitLiveMonitorChannel = null;
    }
}

//-- Refresh unit table (2s) --\\
function startUnitTableRefreshLoop() {
    if (unitTableRefreshInterval) return;

    unitTableRefreshInterval = setInterval(async () => {
        if (currentView !== 'units-table') return;
        await refreshUnitsTable();
        await syncCurrentUserStatusFromUnitsTable();
    }, 2000);
}

//-- Stop unit table refresh loop (logoff) --\\
function stopUnitTableRefreshLoop() {
    if (!unitTableRefreshInterval) return;
    clearInterval(unitTableRefreshInterval);
    unitTableRefreshInterval = null;
}

//-- Quick Action set Status --\\
function setUnitStatus(status) {
    // IF IN VEH STATUS CHECK
    const ivIdx = inVehicleOptions.indexOf(status);
    if (ivIdx >= 0) {
        unitCycleState.invehicle = ivIdx;
        const ivSelect = document.getElementById('unit-in-vehicle-status');
        if (ivSelect) ivSelect.value = status;
        syncCurrentUnitStatus();
        return;
    }
    // else its a enroute status
    const display = document.getElementById('unit-current-status');
    if (display) display.textContent = `Status: ${status}`;
    const idx = unitStatusOptions.indexOf(status);
    if (idx >= 0) {
        unitCycleState.enroute = idx;
        const enSelect = document.getElementById('unit-in-enroute-status');
        if (enSelect) enSelect.value = status;
        syncCurrentUnitStatus();
    }
}

//-- For unit status --\\
function getCombinedUnitStatus() {
    const selectedStatus = unitStatusOptions[unitCycleState.enroute] || unitStatusOptions[0];
    const statusMap = {
        'Available': 'Aval',
        'Start of Watch': 'SOW',
        'End of Watch': 'EOW',
        'At Scene not Investigating': 'ASNI',
        'Code 6': 'C6',
        'Station': 'STAT',
        'Enroute': 'ENR',
        'Unavailable': 'UNAVL'
    };
    const mappedStatus = statusMap[selectedStatus] || selectedStatus;
    const inVehicle = inVehicleOptions[unitCycleState.invehicle] || inVehicleOptions[0];
    const vehicleCode = inVehicle === 'Out of Vehicle' ? 'OOV' : 'IV';
    return `${mappedStatus} | ${vehicleCode}`;
}

//-- Parse Combine status for supabase and top bar display --\\
function parseCombinedUnitStatus(rawStatus) {
    const [statusPart, vehiclePart] = String(rawStatus || '').split('|').map(part => part.trim());
    return {
        statusCode: statusPart || 'SOW',
        vehicleCode: vehiclePart === 'OOV' ? 'OOV' : 'IV'
    };
}

//-- Get status from given status code --\\
function getStatusLabelFromCode(statusCode) {
    const labelMap = {
        'Aval': 'Available',
        'AVAL': 'Available',
        'Available': 'Available',
        'SOW': 'Start of Watch',
        'EOW': 'End of Watch',
        'ASNI': 'At Scene not Investigating',
        'C6': 'Code 6',
        'STAT': 'Station',
        'ENR': 'Enroute',
        'UNAVL': 'Unavailable'
    };
    return labelMap[statusCode] || 'Start of Watch';
}

//-- Combine Status Funcs --\\
function getAvailableCombinedStatus(rawStatus) {
    const { vehicleCode } = parseCombinedUnitStatus(rawStatus);
    return `Aval | ${vehicleCode}`;
}

function getCode6CombinedStatus(rawStatus) {
    const { vehicleCode } = parseCombinedUnitStatus(rawStatus);
    return `C6 | ${vehicleCode}`;
}

//-- Sync current user's unit status from units table (for top bar display) --\\
async function syncUnitsForIncidentAssignment(incidentData) {
    if (!sbClient || !incidentData) return;

    const last4 = String(incidentData.last4 || '').trim();
    const numericLast4 = String(Number.parseInt(last4, 10));
    const location = incidentData.location ?? '';

    const attachedKeys = new Set();
    normalizeCallUnitList(incidentData.prmry)
        .map(normalizeUnitKey)
        .filter(Boolean)
        .forEach(key => attachedKeys.add(key));
    normalizeCallUnitList(incidentData.assist)
        .map(normalizeUnitKey)
        .filter(Boolean)
        .forEach(key => attachedKeys.add(key));

    const { data: unitRows, error: unitRowsError } = await sbClient
        .from('units')
        .select('user, unit, status, inc');

    if (unitRowsError) {
        console.error('Error fetching units for incident sync:', unitRowsError);
        return;
    }

    const rowsToSync = (unitRows || []).filter(row => {
        const normalizedUnit = normalizeUnitKey(row.unit);
        const rowInc = String(row.inc || '').trim();
        return attachedKeys.has(normalizedUnit) || (!!last4 && (rowInc === last4 || rowInc === numericLast4));
    });

    for (const row of rowsToSync) {
        const normalizedUnit = normalizeUnitKey(row.unit);
        const shouldBeAttached = attachedKeys.has(normalizedUnit);

        const nextUpdate = shouldBeAttached
            ? {
                status: getCode6CombinedStatus(row.status),
                inc: last4,
                incLocation: location,
                code: 0
            }
            : {
                status: getAvailableCombinedStatus(row.status),
                inc: '',
                incLocation: '',
                code: ''
            };

        let updateQuery = sbClient.from('units').update(nextUpdate);
        if (row.user) {
            updateQuery = updateQuery.eq('user', row.user);
        } else {
            updateQuery = updateQuery.eq('unit', row.unit);
        }

        const { error: updateError } = await updateQuery;
        if (updateError) {
            console.error(`Error syncing incident unit ${row.unit}:`, updateError);
        }
    }
}

//-- Apply combined status to unit info area --\\
function applyCombinedStatusToTopBar(rawStatus) {
    const { statusCode, vehicleCode } = parseCombinedUnitStatus(rawStatus);
    const statusLabel = getStatusLabelFromCode(statusCode);

    const statusIndex = unitStatusOptions.indexOf(statusLabel);
    if (statusIndex >= 0) {
        unitCycleState.enroute = statusIndex;
    }
    unitCycleState.invehicle = vehicleCode === 'OOV' ? 1 : 0;

    const enSelect = document.getElementById('unit-in-enroute-status');
    if (enSelect) enSelect.value = unitStatusOptions[unitCycleState.enroute];

    const inVehSelect = document.getElementById('unit-in-vehicle-status');
    if (inVehSelect) inVehSelect.value = inVehicleOptions[unitCycleState.invehicle];

    const display = document.getElementById('unit-current-status');
    if (display) display.textContent = `Status: ${statusLabel}`;
}

//-- Sync status from table (upon disp upd of unit) --\\
async function findCurrentUnitRow(authClient, currentUser, currentUnit) {
    if (!authClient || !currentUser) return null;

    if (currentUnit) {
        const { data: byUnitData, error: byUnitError } = await authClient
            .from('units')
            .select('user, unit, status')
            .eq('unit', currentUnit)
            .limit(1)
            .maybeSingle();

        if (byUnitError) {
            console.error('Error resolving current unit row by unit:', byUnitError);
        } else if (byUnitData) {
            return byUnitData;
        }
    }

    const { data: byUserData, error: byUserError } = await authClient
        .from('units')
        .select('user, unit, status')
        .eq('user', currentUser)
        .limit(1)
        .maybeSingle();

    if (byUserError) {
        console.error('Error resolving current unit row by user:', byUserError);
        return null;
    }

    return byUserData || null;
}

async function syncCurrentUserStatusFromUnitsTable() {
    const userInfo = sessionStorage.getItem('userInfo');
    const currentUser = userInfo ? userInfo.split(',')[0] : null;
    const currentUnit = userInfo ? userInfo.split(',')[2] : null;
    if (!currentUser) return;

    try {
        const authClient = getRlsClient();
        const row = await findCurrentUnitRow(authClient, currentUser, currentUnit);
        if (row && row.status) {
            applyCombinedStatusToTopBar(row.status);
        }
    } catch (e) {
        console.error('Error syncing local status from units table:', e);
    }
}

//-- Sync current unit status to Supabase --\\
async function syncCurrentUnitStatus() {
    const userInfo = sessionStorage.getItem('userInfo');
    const currentUser = userInfo
        ? userInfo.split(',')[0].replace(/[\[\]" ]/g, '').trim().toLowerCase()
        : null;

    const userToken = sessionStorage.getItem('userToken');

    if (!currentUser || !userToken) return;

    try {
        const combinedStatus = getCombinedUnitStatus();
        const authClient = getRlsClient();

        console.log(`Searching for user: |${currentUser}|`);

        const { data, error } = await authClient
            .from('units')
            .update({ status: combinedStatus })
            .eq('user', currentUser)
            .select();

        if (data && data.length > 0) {
            playSound('untUpd');
        } else {
            console.error('Err in rLS.');
        }
    } catch (e) {
        console.error('System Error:', e);
    }
}
