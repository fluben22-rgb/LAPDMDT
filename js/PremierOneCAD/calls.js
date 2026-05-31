// CAD dispatch runtime: calls and incident actions

let dispatchRuntimeInitialized = false;
let dispatchRuntimeTabs = [];
let dispatchRuntimeSelectedKey = null;
let dispatchRuntimeCallFilter = 'all';
let dispatchRuntimeUnitFilter = 'all';
let dispatchRuntimeUnits = [];

function normalizeCallUnitList(value) {
	if (!value) return [];
	if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
	return String(value).split(',').map(v => v.trim()).filter(Boolean);
}

function normalizeUnitKey(value) {
	return String(value || '').trim().toUpperCase();
}

function parseCombinedUnitStatus(rawStatus) {
	const value = String(rawStatus || '');
	const statusCode = value.includes('|') ? value.split('|')[0].trim() : value.trim();
	return { statusCode };
}

function toHistoryItem(entry) {
	if (entry == null) return null;
	if (typeof entry === 'string' || typeof entry === 'number') {
		const text = String(entry).trim();
		return text ? { text, timestamp: '' } : null;
	}
	if (typeof entry === 'object') {
		const text = String(
			entry.message ||
			entry.text ||
			entry.comment ||
			entry.details ||
			''
		).trim();
		if (!text) return null;
		const timestamp = String(
			entry.timestamp ||
			entry.time ||
			entry.date ||
			entry.created_at ||
			''
		).trim();
		return { text, timestamp };
	}
	return null;
}

function normalizeIncidentHistory(callData) {
	const raw = [];
	if (Array.isArray(callData?.history)) raw.push(...callData.history);
	if (Array.isArray(callData?.incidentHistory)) raw.push(...callData.incidentHistory);
	if (Array.isArray(callData?.incident_history)) raw.push(...callData.incident_history);
	if (Array.isArray(callData?.comments)) raw.push(...callData.comments);

	const unique = new Set();
	const items = [];
	raw.forEach(entry => {
		const item = toHistoryItem(entry);
		if (!item) return;
		const key = `${item.timestamp}|${item.text}`;
		if (unique.has(key)) return;
		unique.add(key);
		items.push(item);
	});

	if (items.length === 0 && callData?.created_at) {
		items.push({ text: 'Incident created', timestamp: String(callData.created_at) });
	}

	items.sort((a, b) => {
		const at = Date.parse(a.timestamp || '');
		const bt = Date.parse(b.timestamp || '');
		const aValid = Number.isFinite(at);
		const bValid = Number.isFinite(bt);
		if (aValid && bValid) return bt - at;
		if (aValid) return -1;
		if (bValid) return 1;
		return 0;
	});

	return items;
}

function renderIncidentHistory(callData) {
	const items = normalizeIncidentHistory(callData);
	const subtabHistory = document.getElementById('subtab-history');
	const modalHistory = document.getElementById('incidentHistory');
	const modalHeader = document.getElementById('incHistoryHeader');
	const counter = document.getElementById('incHistoryCounter');

	if (counter) counter.textContent = `(${items.length})`;
	if (modalHeader) {
		const loc = callData?.location ? ` - ${callData.location}` : '';
		modalHeader.textContent = `${callData?.id || ''}${loc}`;
	}

	if (items.length === 0) {
		if (subtabHistory) subtabHistory.innerHTML = '<p>No history entries.</p>';
		if (modalHistory) modalHistory.innerHTML = '<p>No history entries.</p>';
		return;
	}

	const rows = items.map(item => {
		const time = item.timestamp ? `<span class="history-time">${item.timestamp}</span> ` : '';
		return `<div class="history-row">${time}<span class="history-text">${item.text}</span></div>`;
	}).join('');

	if (subtabHistory) subtabHistory.innerHTML = rows;
	if (modalHistory) modalHistory.innerHTML = rows;
}

function getStatusLabelFromCode(statusCode) {
	const s = String(statusCode || '').toUpperCase();
	if (s === 'AVAL' || s === 'AVAILABLE') return 'Available';
	if (s === 'ENR') return 'Enroute';
	if (s === 'C6') return 'Code 6';
	if (s === 'UNAVL' || s === 'UNAVAILABLE') return 'Unavailable';
	if (s === 'SOW' || s === 'START OF WATCH') return 'Start of Watch';
	return statusCode || 'Unknown';
}

function ensureDispatchIncidentPaneVisible() {
	const incidentPane = document.getElementById('tab-2');
	if (incidentPane) incidentPane.style.display = 'flex';
	const blankPane = document.getElementById('tab-1');
	if (blankPane) blankPane.style.display = 'none';
}

function setDispatchStatus(kind, text) {
	const iconEl = document.querySelector('.dispatcher-status-inline .status-icon');
	const textEl = document.querySelector('.dispatcher-status-inline .status-text');
	if (!iconEl || !textEl) return;

	if (kind === 'error') {
		iconEl.textContent = 'X';
	} else if (kind === 'warn') {
		iconEl.textContent = '!';
	} else {
		iconEl.textContent = '✓';
	}
	textEl.textContent = text || 'Ready';
}

function dispatchGetSelectedTab() {
	return dispatchRuntimeTabs.find(tab => tab.key === dispatchRuntimeSelectedKey) || null;
}

function dispatchGetSelectedIncidentId() {
	const selected = dispatchGetSelectedTab();
	return selected && selected.kind === 'db' ? selected.id : null;
}

function getDispatchSessionUserInfo() {
	const raw = sessionStorage.getItem('userInfo');
	const parts = raw ? raw.split(',') : null;
	return {
		raw,
		parts,
		currentUser: parts ? String(parts[0] || '').trim() : '',
		currentUnit: parts ? String(parts[2] || '').trim() : ''
	};
}

function isIncidentClosedValue(incidentData) {
	if (!incidentData) return false;
	const status = String(incidentData.status || '').trim().toLowerCase();
	return incidentData.is_closed === true || status === 'closed';
}

function dispatchNowString() {
	return new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false });
}

function dispatchIsCurrentUnitAttachedToIncident(incidentData) {
	if (!incidentData) return false;
	const { currentUnit } = getDispatchSessionUserInfo();
	if (!currentUnit) return false;
	const selfKey = normalizeUnitKey(currentUnit);
	if (!selfKey) return false;
	return [
		...normalizeCallUnitList(incidentData.prmry),
		...normalizeCallUnitList(incidentData.assist)
	].some(unitName => normalizeUnitKey(unitName) === selfKey);
}

function updateAttachToggleButton(incidentData) {
	const btn = document.getElementById('attachToggleBtn');
	if (!btn) return;
	btn.textContent = dispatchIsCurrentUnitAttachedToIncident(incidentData) ? 'De-Attach' : 'Attach';
}

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

async function dispatchSetUnitStatusByUnitName(unitName, combinedStatus) {
	if (!sbClient || !unitName) return false;
	await dispatchLoadUnits();
	const targetKey = normalizeUnitKey(unitName);
	const row = dispatchRuntimeUnits.find(unit => normalizeUnitKey(unit.unit) === targetKey);
	if (!row) return false;

	let query = sbClient.from('units').update({ status: combinedStatus });
	if (row.user) query = query.eq('user', row.user);
	else query = query.eq('unit', row.unit);

	const { error } = await query;
	return !error;
}

async function refreshDispatchIncidentView() {
	if (dispatchRuntimeSelectedKey) {
		await loadIncidentToForm(dispatchRuntimeSelectedKey);
		return;
	}
	await renderDispatchUnitTable(dispatchRuntimeUnitFilter);
}

async function handleAttach() {
	const incidentId = dispatchGetSelectedIncidentId();
	if (!incidentId || !sbClient) {
		alert('No incident is currently open.');
		return;
	}

	const { currentUser, currentUnit } = getDispatchSessionUserInfo();
	if (!currentUser || !currentUnit) {
		alert('No active user session found. Please log in again.');
		return;
	}

	try {
		const { data, error } = await sbClient
			.from('calls')
			.select('id, last4, location, prmry, assist, status, is_closed, history')
			.eq('id', incidentId)
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
		const selfKey = normalizeUnitKey(currentUnit);
		const alreadyPrimary = primaryUnits.some(unitName => normalizeUnitKey(unitName) === selfKey);
		const existingAssist = normalizeCallUnitList(data.assist);
		const alreadyAssist = existingAssist.some(unitName => normalizeUnitKey(unitName) === selfKey);

		if (alreadyPrimary || alreadyAssist) {
			alert('Your unit is already attached to this incident.');
			return;
		}

		const nextPrimary = hasPrimary ? data.prmry : currentUnit;
		const nextAssist = hasPrimary
			? Array.from(new Set([...existingAssist, currentUnit]))
			: existingAssist.filter(unitName => normalizeUnitKey(unitName) !== selfKey);

		const { error: updateCallError } = await sbClient
			.from('calls')
			.update({
				prmry: nextPrimary,
				assist: nextAssist,
				status: 'Active',
				is_active: true,
				is_pending: false,
				history: [...(data.history || []), `${dispatchNowString()} ${currentUnit} (${currentUser}) - Unit attached to incident as ${hasPrimary ? 'assist' : 'primary'}.`]
			})
			.eq('id', incidentId);

		if (updateCallError) {
			console.error('Error attaching to incident:', updateCallError);
			alert(`Failed to attach to incident: ${updateCallError?.message || updateCallError}`);
			return;
		}

		const unitQuery = sbClient.from('units').update({
			inc: data.last4 ? String(data.last4) : '',
			incLocation: data.location ?? '',
			code: 0
		});
		const { error: updateUnitError } = await (currentUser ? unitQuery.eq('user', currentUser) : unitQuery.eq('unit', currentUnit));
		if (updateUnitError) {
			console.error('Error syncing unit after attach:', updateUnitError);
		}

		setDispatchStatus('success', hasPrimary ? 'Unit attached' : 'Unit attached as primary');
		await refreshDispatchIncidentView();
	} catch (error) {
		console.error('Error attaching to incident:', error);
		alert(`Failed to attach to incident: ${error?.message || error}`);
	}
}

async function handleDetachSelf() {
	const incidentId = dispatchGetSelectedIncidentId();
	if (!incidentId || !sbClient) {
		alert('No incident is currently open.');
		return;
	}

	const { currentUser, currentUnit } = getDispatchSessionUserInfo();
	if (!currentUser || !currentUnit) {
		alert('No active user session found. Please log in again.');
		return;
	}

	try {
		const { data: callData, error: callError } = await sbClient
			.from('calls')
			.select('id, prmry, assist, last4, location, history, status, is_closed')
			.eq('id', incidentId)
			.single();

		if (callError || !callData) {
			alert('Incident not found with that ID.');
			return;
		}

		if (isIncidentClosedValue(callData)) {
			alert('Cannot change attachment on a closed incident.');
			return;
		}

		const updates = buildIncidentDetachUpdates([callData], currentUnit);
		if (updates.length === 0) {
			alert('Your unit is not attached to this incident.');
			return;
		}

		const next = updates[0];
		const { error: updateCallError } = await sbClient
			.from('calls')
			.update({
				prmry: next.prmry,
				assist: next.assist,
				history: [...(callData.history || []), `${dispatchNowString()} ${currentUnit} (${currentUser}) - Unit de-attached from incident.`]
			})
			.eq('id', incidentId);

		if (updateCallError) {
			console.error('Error detaching from incident:', updateCallError);
			alert(`Failed to de-attach from incident: ${updateCallError?.message || updateCallError}`);
			return;
		}

		const unitQuery = sbClient.from('units').update({
			status: 'Aval | IV',
			inc: '',
			incLocation: '',
			code: ''
		});
		const { error: updateUnitError } = await (currentUser ? unitQuery.eq('user', currentUser) : unitQuery.eq('unit', currentUnit));
		if (updateUnitError) {
			console.error('Error syncing unit after de-attach:', updateUnitError);
		}

		setDispatchStatus('success', 'Unit de-attached');
		await refreshDispatchIncidentView();
	} catch (error) {
		console.error('Error detaching from incident:', error);
		alert(`Failed to de-attach from incident: ${error?.message || error}`);
	}
}

async function handleAttachToggle() {
	const incidentId = dispatchGetSelectedIncidentId();
	if (!incidentId || !sbClient) {
		alert('No incident is currently open.');
		return;
	}

	try {
		const { data, error } = await sbClient
			.from('calls')
			.select('prmry, assist, status, is_closed')
			.eq('id', incidentId)
			.single();

		if (error || !data) {
			alert('Incident not found with that ID.');
			return;
		}

		if (isIncidentClosedValue(data)) {
			alert('Cannot change attachment on a closed incident.');
			return;
		}

		if (dispatchIsCurrentUnitAttachedToIncident(data)) {
			await handleDetachSelf();
		} else {
			await handleAttach();
		}
	} catch (error) {
		console.error('Error toggling attach state:', error);
		alert(`Failed to toggle attach state: ${error?.message || error}`);
	}
}

async function handlePrimaryButtonClick() {
	const incidentId = dispatchGetSelectedIncidentId();
	if (!incidentId || !sbClient) {
		alert('No incident is currently open.');
		return;
	}

	const { currentUser, currentUnit } = getDispatchSessionUserInfo();
	if (!currentUser || !currentUnit) {
		alert('No active user session found. Please log in again.');
		return;
	}

	try {
		const { data, error } = await sbClient
			.from('calls')
			.select('id, prmry, assist, status, is_closed, last4, location, history')
			.eq('id', incidentId)
			.single();

		if (error || !data) {
			alert('Incident not found with that ID.');
			return;
		}

		if (isIncidentClosedValue(data)) {
			alert('Cannot become primary on a closed incident.');
			return;
		}

		const selfKey = normalizeUnitKey(currentUnit);
		const primaryUnits = normalizeCallUnitList(data.prmry);
		const assistUnits = normalizeCallUnitList(data.assist);
		const currentPrimary = primaryUnits[0] || null;

		if (currentPrimary && normalizeUnitKey(currentPrimary) === selfKey) {
			alert('Your unit is already primary on this incident.');
			return;
		}

		const nextAssist = assistUnits
			.filter(unit => normalizeUnitKey(unit) !== selfKey)
			.filter(unit => normalizeUnitKey(unit) !== normalizeUnitKey(currentPrimary));
		if (currentPrimary) nextAssist.unshift(currentPrimary);

		const dedupAssist = Array.from(new Set(nextAssist));
		const { error: updateCallError } = await sbClient
			.from('calls')
			.update({
				prmry: currentUnit,
				assist: dedupAssist,
				status: 'Active',
				is_active: true,
				is_pending: false,
				history: [...(data.history || []), `${dispatchNowString()} ${currentUnit} (${currentUser}) - Unit became primary.`]
			})
			.eq('id', incidentId);

		if (updateCallError) {
			console.error('Error becoming primary:', updateCallError);
			alert(`Failed to become primary: ${updateCallError?.message || updateCallError}`);
			return;
		}

		const unitQuery = sbClient.from('units').update({
			inc: data.last4 ? String(data.last4) : '',
			incLocation: data.location ?? '',
			code: 0
		});
		const { error: updateUnitError } = await (currentUser ? unitQuery.eq('user', currentUser) : unitQuery.eq('unit', currentUnit));
		if (updateUnitError) {
			console.error('Error syncing current unit after primary reassignment:', updateUnitError);
		}

		setDispatchStatus('success', 'Primary updated');
		await refreshDispatchIncidentView();
	} catch (error) {
		console.error('Error becoming primary:', error);
		alert(`Failed to become primary: ${error?.message || error}`);
	}
}

async function executeDispatchCommand() {
	const cmdInput = document.getElementById('dispatcherCmdInput');
	const raw = cmdInput ? String(cmdInput.value || '').trim() : '';
	if (!raw) return;
	if (cmdInput) cmdInput.value = '';

	const parts = raw.split(/\s+/).filter(Boolean);
	const verb = String(parts[0] || '').toLowerCase();

	try {
		if (verb === 'id') {
			const incidentId = String(parts[1] || '').trim();
			const unitsText = parts.slice(2).join(' ');
			const units = unitsText.split(',').map(v => v.trim()).filter(Boolean);
			if (!incidentId || units.length === 0) {
				setDispatchStatus('warn', 'Usage: ID <incident> <unit[,unit]>');
				return;
			}

			const { data: call, error } = await sbClient
				.from('calls')
				.select('prmry, assist, last4, location, history')
				.eq('id', incidentId)
				.maybeSingle();

			if (error || !call) {
				setDispatchStatus('warn', 'No incident found');
				return;
			}

			let primary = normalizeCallUnitList(call.prmry)[0] || null;
			const assist = normalizeCallUnitList(call.assist);
			units.forEach(unit => {
				const key = normalizeUnitKey(unit);
				if (primary && normalizeUnitKey(primary) === key) return;
				if (assist.some(existing => normalizeUnitKey(existing) === key)) return;
				if (!primary) primary = unit;
				else assist.push(unit);
			});

			const { error: updateErr } = await sbClient
				.from('calls')
				.update({
					prmry: primary,
					assist,
					history: [...(call.history || []), `${dispatchNowString()} DISPATCH - Units dispatched: ${units.join(', ')}`]
				})
				.eq('id', incidentId);

			if (updateErr) {
				setDispatchStatus('error', 'Dispatch command failed');
				return;
			}

			for (const unit of units) {
				await dispatchSetUnitStatusByUnitName(unit, 'ENR | IV');
			}
			setDispatchStatus('success', 'Units dispatched');
			await dispatchLoadTabs(dispatchRuntimeCallFilter);
			return;
		}

		if (verb === 'ond' && parts[1]) {
			const ok = await dispatchSetUnitStatusByUnitName(parts[1], 'Aval | IV');
			setDispatchStatus(ok ? 'success' : 'warn', ok ? 'Unit marked available' : 'Unit not found');
			await renderDispatchUnitTable(dispatchRuntimeUnitFilter);
			return;
		}

		if (verb === 'ufd' && parts[1]) {
			const ok = await dispatchSetUnitStatusByUnitName(parts[1], 'UNAVL | IV');
			setDispatchStatus(ok ? 'success' : 'warn', ok ? 'Unit marked unavailable' : 'Unit not found');
			await renderDispatchUnitTable(dispatchRuntimeUnitFilter);
			return;
		}

		if ((verb === 'end' || verb === 'osd') && parts[1]) {
			const unitPart = raw.substring(raw.indexOf(parts[1]));
			const units = unitPart.split(',').map(v => v.trim()).filter(Boolean);
			const status = verb === 'end' ? 'ENR | IV' : 'C6 | IV';
			let updated = 0;
			for (const unit of units) {
				if (await dispatchSetUnitStatusByUnitName(unit, status)) updated++;
			}
			setDispatchStatus(updated > 0 ? 'success' : 'warn', updated > 0 ? 'Unit status updated' : 'No units updated');
			await renderDispatchUnitTable(dispatchRuntimeUnitFilter);
			return;
		}

		setDispatchStatus('warn', 'Unknown dispatch command');
	} catch (e) {
		console.error('Dispatch command error:', e);
		setDispatchStatus('error', 'Command failed');
	}
}

async function initDispatchUnitTable() {
	await renderDispatchUnitTable(dispatchRuntimeUnitFilter);
}

async function dispatchLoadUnits() {
	if (!sbClient) return;
	const { data, error } = await sbClient
		.from('units')
		.select('user, unit, status, inc, incLocation, code')
		.order('unit', { ascending: true });
	if (error) {
		console.error('Dispatch units fetch failed:', error);
		setDispatchStatus('warn', 'Units load warning');
		return;
	}
	dispatchRuntimeUnits = Array.isArray(data) ? data : [];
}

async function dispatchLoadTabs(filter = dispatchRuntimeCallFilter) {
	dispatchRuntimeCallFilter = filter;
	if (!sbClient) return;

	const { data, error } = await sbClient
		.from('calls')
		.select('id, call_type, location, status, is_active, is_closed, is_pending, created_at')
		.order('created_at', { ascending: false });

	if (error) {
		console.error('Dispatch calls fetch failed:', error);
		setDispatchStatus('error', 'Failed loading calls');
		return;
	}

	const rows = Array.isArray(data) ? data : [];
	const filtered = rows.filter(call => {
		const statusNorm = String(call.status || '').toLowerCase();
		const isClosed = call.is_closed === true || statusNorm === 'closed';
		const isActive = call.is_active === true;
		const isPending = call.is_pending === true;

		if (filter === 'closed') return isClosed;
		if (filter === 'active') return isActive;
		return true;
	});

	dispatchRuntimeTabs = filtered.map(call => ({
		key: `db:${call.id}`,
		kind: 'db',
		id: call.id,
		label: String(call.id).split('-').pop() || call.id,
		type: call.call_type || '',
		location: call.location || '',
		status: call.status || 'Pending',
		isActive: call.is_active === true,
		isPending: call.is_pending === true
	}));

	if (!dispatchRuntimeSelectedKey || !dispatchRuntimeTabs.some(t => t.key === dispatchRuntimeSelectedKey)) {
		dispatchRuntimeSelectedKey = dispatchRuntimeTabs.length > 0 ? dispatchRuntimeTabs[0].key : null;
	}

	renderDispatcherTabs();
	await loadIncidentToForm(dispatchRuntimeSelectedKey);
}

function renderDispatcherTabs() {
	const tabsContainer = document.getElementById('dispatcherTabs');
	if (!tabsContainer) return;
	tabsContainer.innerHTML = '';

	dispatchRuntimeTabs.forEach(tab => {
		const card = document.createElement('div');
		card.className = 'tab-card';
		const statusNorm = String(tab.status || '').toLowerCase();
		if (statusNorm === 'closed') card.classList.add('status-closed');
		else if (tab.isActive || statusNorm === 'active') card.classList.add('status-active');
		else if (tab.isPending || statusNorm === 'pending') card.classList.add('status-pending');
		else card.classList.add('status-new');
		if (tab.key === dispatchRuntimeSelectedKey) card.classList.add('active');
		card.onclick = () => switchDispatcherTab(tab.key);

		const title = document.createElement('div');
		title.className = 'tab-card-title';
		title.textContent = `Inc ${tab.label}`;

		const subtype = document.createElement('div');
		subtype.className = 'tab-card-sub';
		subtype.textContent = `Type: ${tab.type || 'N/A'}`;

		const subloc = document.createElement('div');
		subloc.className = 'tab-card-sub';
		subloc.textContent = `Loc: ${tab.location || 'N/A'}`;

		card.appendChild(title);
		card.appendChild(subtype);
		card.appendChild(subloc);
		tabsContainer.appendChild(card);
	});
}

async function switchDispatcherTab(tabKey) {
	dispatchRuntimeSelectedKey = tabKey;
	ensureDispatchIncidentPaneVisible();
	renderDispatcherTabs();
	await loadIncidentToForm(tabKey);
}

async function loadIncidentToForm(tabKey) {
	const key = tabKey || dispatchRuntimeSelectedKey;
	if (!key || !sbClient) return;

	const selected = dispatchRuntimeTabs.find(t => t.key === key);
	if (!selected) return;

	const { data, error } = await sbClient
		.from('calls')
		.select('*')
		.eq('id', selected.id)
		.maybeSingle();
	if (error || !data) {
		setDispatchStatus('warn', 'Incident missing or stale');
		return;
	}

	const incidentNameDisplay = document.getElementById('incidentNameDisplay');
	const incidentLocationDisplay = document.getElementById('incidentLocationDisplay');
	const locationEl = document.getElementById('dispatcherLocation');
	const commentsEl = document.getElementById('dispatcherComments');
	const statusEl = document.getElementById('dispatchStatus');
	const typeEl = document.getElementById('dispatchIncType');
	const areaEl = document.getElementById('dispatchArea');
	const priEl = document.getElementById('dispatchPriority');
	const beatEl = document.getElementById('dispatchBeat');
	const attachedEl = document.getElementById('dispatchAttachedUnits');

	const attachedUnits = [
		...normalizeCallUnitList(data.prmry),
		...normalizeCallUnitList(data.assist)
	];
	const comments = Array.isArray(data.comments) ? data.comments : [];

	if (incidentNameDisplay) incidentNameDisplay.textContent = `// ${data.id}`;
	if (incidentLocationDisplay) incidentLocationDisplay.textContent = `// ${data.location || 'No Location'}`;
	if (locationEl) locationEl.value = data.location || '';
	if (commentsEl) commentsEl.value = comments.join('\n');
	if (statusEl) statusEl.value = (String(data.status || '').toLowerCase() === 'active' ? 'Active' : 'Pending');
	if (typeEl) typeEl.value = data.call_type || '';
	if (areaEl) areaEl.value = data.area || 'HWD';
	if (priEl) priEl.value = String(data.call_code ?? '1');
	if (beatEl) beatEl.value = data.beat || '';
	if (attachedEl) attachedEl.textContent = attachedUnits.join(', ') || 'None';
	renderIncidentHistory(data);
	updateAttachToggleButton(data);

	const rightPanel = document.getElementById('dispRightPanel');
	if (rightPanel) rightPanel.style.display = 'flex';
	const callsListView = document.getElementById('callsListView');
	if (callsListView) callsListView.style.display = 'none';
	const summaryPanel = document.getElementById('summaryPanel');
	if (summaryPanel) summaryPanel.style.display = 'block';
	const summaryLocation = document.getElementById('summaryLocation');
	if (summaryLocation) summaryLocation.textContent = data.location || '';
	const summaryResponding = document.getElementById('summaryResponding');
	if (summaryResponding) summaryResponding.textContent = String(attachedUnits.length);
	const summaryOnScene = document.getElementById('summaryOnScene');
	if (summaryOnScene) summaryOnScene.textContent = '0';

	await renderDispatchUnitTable(dispatchRuntimeUnitFilter);
	setDispatchStatus('success', 'Incident loaded');
}

async function renderDispatchUnitTable(filter = dispatchRuntimeUnitFilter) {
	dispatchRuntimeUnitFilter = filter;
	await dispatchLoadUnits();

	const table = document.getElementById('dispatchUnitTable');
	if (!table) return;
	table.innerHTML = '';

	const selectedIncidentId = dispatchGetSelectedIncidentId();
	let attachedSet = new Set();
	if (selectedIncidentId && sbClient) {
		const { data: call } = await sbClient.from('calls').select('prmry, assist').eq('id', selectedIncidentId).maybeSingle();
		attachedSet = new Set([
			...normalizeCallUnitList(call?.prmry),
			...normalizeCallUnitList(call?.assist)
		].map(normalizeUnitKey));
	}

	const filteredUnits = dispatchRuntimeUnits.filter(unit => {
		const label = getStatusLabelFromCode(parseCombinedUnitStatus(unit.status).statusCode);
		if (filter === 'available') return label === 'Available' || label === 'Start of Watch';
		if (filter === 'unavailable') return !(label === 'Available' || label === 'Start of Watch');
		return true;
	});

	for (let i = 0; i < filteredUnits.length; i += 3) {
		const tr = document.createElement('tr');
		for (let j = 0; j < 3; j++) {
			const row = filteredUnits[i + j];
			const td = document.createElement('td');
			td.className = 'unit-cell';
			if (!row) {
				tr.appendChild(td);
				continue;
			}

			const btn = document.createElement('button');
			btn.textContent = row.unit || 'Unknown';
			btn.className = 'unit-btn';
			btn.type = 'button';
			if (attachedSet.has(normalizeUnitKey(row.unit))) btn.classList.add('attached-unit');
			td.appendChild(btn);
			tr.appendChild(td);
		}
		table.appendChild(tr);
	}
}

async function dispatcherAction(action) {
	if (action === 'refresh_incident') return dispatchLoadTabs(dispatchRuntimeCallFilter);
	if (action === 'show_all_units') return renderDispatchUnitTable('all');
	if (action === 'show_available_units') return renderDispatchUnitTable('available');
	if (action === 'show_unavailable_units') return renderDispatchUnitTable('unavailable');
	if (action === 'calls_all') return dispatchLoadTabs('all');
	if (action === 'calls_active') return dispatchLoadTabs('active');
	if (action === 'calls_closed') return dispatchLoadTabs('closed');
	if (action === 'print_calls' && typeof showModal === 'function') showModal('printCallsModal');
}

function showModal(id) {
	const overlay = document.querySelector('.modal-overlay');
	const modal = document.getElementById(id);
	if (!overlay || !modal) return;
	overlay.querySelectorAll('.modal-content').forEach(m => m.style.display = 'none');
	modal.style.display = 'block';
	overlay.classList.add('active');
}

function closeModal(id) {
	const overlay = document.querySelector('.modal-overlay');
	const modal = document.getElementById(id);
	if (modal) modal.style.display = 'none';
	if (overlay) overlay.classList.remove('active');
}

function updateDispatcherClock() {
	const pstTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
	const hours = String(pstTime.getHours()).padStart(2, '0');
	const minutes = String(pstTime.getMinutes()).padStart(2, '0');
	const seconds = String(pstTime.getSeconds()).padStart(2, '0');
	const clockDisplay = document.getElementById('dispatcherClock');
	if (clockDisplay) clockDisplay.textContent = `${hours}:${minutes}:${seconds}`;
}

function updateDispatcherTimeDate() {
	const pstTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
	const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
	const timeDateDisplay = document.getElementById('dispatcherTimeDate');
	if (timeDateDisplay) timeDateDisplay.textContent = pstTime.toLocaleDateString('en-US', options);
}

async function initDispatcherOverlay() {
	if (dispatchRuntimeInitialized) return;
	dispatchRuntimeInitialized = true;

	updateDispatcherClock();
	setInterval(updateDispatcherClock, 1000);
	updateDispatcherTimeDate();
	setInterval(updateDispatcherTimeDate, 1000);

	await dispatchLoadUnits();
	await dispatchLoadTabs('all');
	ensureDispatchIncidentPaneVisible();
	const rightPanel = document.getElementById('dispRightPanel');
	if (rightPanel) rightPanel.style.display = 'flex';
	setDispatchStatus('success', 'Ready');
}

window.dispatchGetSelectedTab = dispatchGetSelectedTab;
window.dispatchGetSelectedIncidentId = dispatchGetSelectedIncidentId;
window.initDispatchUnitTable = initDispatchUnitTable;
window.executeDispatchCommand = executeDispatchCommand;
window.handleAttachToggle = window.handleAttachToggle || handleAttachToggle;
window.handlePrimaryButtonClick = window.handlePrimaryButtonClick || handlePrimaryButtonClick;
window.updateAttachToggleButton = window.updateAttachToggleButton || updateAttachToggleButton;
window.dispatcherAction = dispatcherAction;
window.renderDispatchUnitTable = renderDispatchUnitTable;
window.dispatchLoadTabs = dispatchLoadTabs;
window.initDispatcherOverlay = initDispatcherOverlay;
window.showModal = window.showModal || showModal;
window.closeModal = window.closeModal || closeModal;

window.__appCleanupHandlers = window.__appCleanupHandlers || {};
window.__appCleanupHandlers.PremierOneCAD = () => {
	setTimeout(() => window.location.reload(), 0);
};

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initDispatcherOverlay);
} else {
	initDispatcherOverlay();
}

