// Initialize dispatcher overlay
// Initialize left-side drag for sidebar
function initSidebarLeftDrag() {
    const panel = document.querySelector('.dispatcher-calls-panel');
    if (!panel) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    panel.addEventListener('mousedown', (e) => {
        if (e.offsetX < 6) {
            isResizing = true;
            startX = e.clientX;
            startWidth = panel.offsetWidth;
            document.body.style.cursor = 'col-resize';
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const delta = e.clientX - startX;
        const newWidth = startWidth - delta;
        if (newWidth >= 120 && newWidth <= 300) {
            panel.style.width = newWidth + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
        }
    });
}

// Toggle dispatch footer panel (VS Code style)
function toggleDispatchFooterPanel(panelId) {
    const panel = document.getElementById(`dispatch-${panelId}-panel`);
    const button = event.target.closest('.dispatch-footer-btn');
    const arrow = button.querySelector('.dispatch-footer-arrow');

    if (!panel) return;

    document.querySelectorAll('.dispatch-footer-content').forEach(p => {
        p.classList.remove('visible');
    });
    document.querySelectorAll('.dispatch-footer-btn').forEach(b => {
        b.classList.remove('expanded');
        b.querySelector('.dispatch-footer-arrow').classList.remove('expanded');
    });

    // Toggle current panel
    if (panel.classList.contains('visible')) {
        panel.classList.remove('visible');
        button.classList.remove('expanded');
        arrow.classList.remove('expanded');
    } else {
        panel.classList.add('visible');
        button.classList.add('expanded');
        arrow.classList.add('expanded');
    }
}

// Update clock display
function updateDispatcherClock() {
    const pstTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const hours = String(pstTime.getHours()).padStart(2, '0');
    const minutes = String(pstTime.getMinutes()).padStart(2, '0');
    const seconds = String(pstTime.getSeconds()).padStart(2, '0');
    const clockDisplay = document.getElementById('dispatcherClock');
    if (clockDisplay) {
        clockDisplay.textContent = `${hours}:${minutes}:${seconds}`;
    }
}

// Update time and date display
function updateDispatcherTimeDate() {
    const pstTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = pstTime.toLocaleDateString('en-US', options);
    const timeDateDisplay = document.getElementById('dispatcherTimeDate');
    if (timeDateDisplay) {
        timeDateDisplay.textContent = dateStr;
    }
}

// Toggle submenu visibility
function toggleSubmenu(submenuId) {
    const submenu = document.getElementById(submenuId);
    const allSubmenus = document.querySelectorAll('.submenu');
    allSubmenus.forEach(m => {
        if (m.id !== submenuId) m.style.display = 'none';
    });
    if (submenu) {
        submenu.style.display = submenu.style.display === 'none' ? 'block' : 'none';
        if (submenuId === 'dispatchMenu') {
            updateDispatchMenuState();
        }
    }
}

// Toggle command bar visibility
function toggleCommandBar() {
    const cmdBar = document.getElementById('dispatcherCommandBar');
    const cmdInput = document.getElementById('dispatcherCmdInput');
    if (cmdBar) {
        const isHidden = cmdBar.style.display === 'none';
        cmdBar.style.display = isHidden ? 'flex' : 'none';
        if (isHidden && cmdInput) cmdInput.focus();
    }
}

function updateDispatchMenuState() {
    if (typeof currentDispatcherTab === 'undefined' || typeof dispatcherIncidents === 'undefined' || !dispatcherIncidents) {
        return;
    }
    const currentIncident = dispatcherIncidents[currentDispatcherTab];
    const isIncidentOpen = currentIncident && currentIncident.location;
    const pushBtn = document.getElementById('pushIncidentBtn');
    if (pushBtn) {
        pushBtn.disabled = !isIncidentOpen;
        pushBtn.style.opacity = isIncidentOpen ? 1 : 0.5;
    }
}

function openIncidentSubtab(subtab) {
    const subtabs = document.querySelectorAll('.subtab-pane');
    subtabs.forEach(s => s.style.display = 'none');

    const subButtons = document.querySelectorAll('.incident-subtab');
    subButtons.forEach(b => b.classList.remove('active'));

    const activeButton = document.querySelector(`.incident-subtab[data-tab="${subtab}"]`);
    if (activeButton) activeButton.classList.add('active');

    const selectedPane = document.getElementById(`subtab-${subtab}`);
    if (selectedPane) selectedPane.style.display = 'block';

    if (subtab === 'dispatch') {
        initDispatchUnitTable();
    }

    const dispRightPanel = document.getElementById('dispRightPanel');
    const callsListView = document.getElementById('callsListView');
    if (subtab === 'dispatch') {
        if (dispRightPanel) dispRightPanel.style.display = 'flex';
        callsListView.style.display = 'none';
    } else {
        if (dispRightPanel) dispRightPanel.style.display = 'none';
        callsListView.style.display = 'none';
    }

    updateSubtabCounts();
}

function openDispatchSidebarPanel(panel) {
    const panels = ['summaryPanel', 'commentsPanel', 'responsesPanel'];
    panels.forEach(id => {
        const elem = document.getElementById(id);
        if (elem) elem.style.display = 'none';
    });
    const activeElem = document.getElementById(`${panel}Panel`);
    if (activeElem) activeElem.style.display = 'block';
}

function switchDispRightTab(tab) {
    const infoPane = document.getElementById('dispRightInfoPane');
    const queriesPane = document.getElementById('dispRightQueriesPane');
    const infoBtn = document.getElementById('dispRightTabInfo');
    const queriesBtn = document.getElementById('dispRightTabQueries');
    if (!infoPane || !queriesPane) return;
    if (tab === 'info') {
        infoPane.style.display = 'flex';
        queriesPane.style.display = 'none';
        if (infoBtn) infoBtn.classList.add('active');
        if (queriesBtn) queriesBtn.classList.remove('active');
    } else {
        infoPane.style.display = 'none';
        queriesPane.style.display = 'flex';
        if (infoBtn) infoBtn.classList.remove('active');
        if (queriesBtn) queriesBtn.classList.add('active');
        loadDispRightQueries();
    }
}

function updateSubtabCounts() {
    const personsCount = document.querySelectorAll('#personsContent .person-row').length;
    const vehiclesCount = document.querySelectorAll('#vehiclesContent .vehicle-row').length;
    const personsTab = document.querySelector('.incident-subtab[data-tab="persons"]');
    const vehiclesTab = document.querySelector('.incident-subtab[data-tab="vehicles"]');
    if (personsTab) personsTab.textContent = `Persons (${personsCount})`;
    if (vehiclesTab) vehiclesTab.textContent = `Vehicles (${vehiclesCount})`;
}

function setDispatchStatus(kind, text) {
    const iconEl = document.querySelector('.dispatcher-status-inline .status-icon');
    const textEl = document.querySelector('.dispatcher-status-inline .status-text');
    if (!iconEl || !textEl) return;

    if (kind === 'error') {
        iconEl.textContent = 'X';
        iconEl.style.color = '#c80000';
    } else if (kind === 'warn') {
        iconEl.textContent = '!';
        iconEl.style.color = '#b8860b';
    } else {
        iconEl.textContent = '✓';
        iconEl.style.color = '#0a8a26';
    }
    textEl.textContent = text || 'Ready';
}

function updateDispatchMenuState() {
    const pushBtn = document.getElementById('pushIncidentBtn');
    if (!pushBtn) return;
    const selected = dispatchGetSelectedTab();
    const canPush = !!selected && selected.kind === 'draft';
    pushBtn.disabled = !canPush;
    pushBtn.style.opacity = canPush ? '1' : '0.5';
}

function dispatchGetSelectedTab() {
    return dispatchRuntimeTabs.find(tab => tab.key === dispatchRuntimeSelectedKey) || null;
}

function dispatchGetSelectedIncidentId() {
    const selected = dispatchGetSelectedTab();
    return selected && selected.kind === 'db' ? selected.id : null;
}

function dispatchGetSelectedIncidentLast4() {
    const selected = dispatchGetSelectedTab();
    if (!selected || selected.kind !== 'db') return '';
    const parts = String(selected.id || '').split('-');
    return parts.length > 1 ? parts[1] : '';
}

function dispatchNormalizeStatusLabel(rawStatus) {
    const parsed = parseCombinedUnitStatus(rawStatus);
    return getStatusLabelFromCode(parsed.statusCode);
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