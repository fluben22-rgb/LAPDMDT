// renderAttendanceTable = use this to change how the attendence table renders
// scheduleAttendanceAutosave = change the time in between saves (default: 5s after last change)

function toGoogleCsvUrl(sheetUrl) {
    const raw = String(sheetUrl || '').trim();
    if (!raw) return '';
    if (raw.includes('/gviz/tq') && raw.includes('tqx=out:csv')) return raw;
    if (raw.includes('/edit')) return raw.replace(/\/edit.*$/i, '/gviz/tq?tqx=out:csv');
    return raw;
}

function parseCsvRow(line) {
    const row = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const next = line[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            row.push(current);
            current = '';
            continue;
        }

        current += char;
    }

    row.push(current);
    return row;
}

function parseCsvText(csvText) {
    const lines = String(csvText || '')
        .split(/\r?\n/)
        .map(line => line.trimEnd())
        .filter(Boolean);
    return lines.map(parseCsvRow);
}

function pickHeaderIndex(headers, candidates) {
    const normalized = headers.map(h => String(h || '').toLowerCase().trim());
    return normalized.findIndex(header => candidates.some(c => header.includes(c)));
}

function getPstDateKey() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function formatPstTimeCode(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    }).format(date).replace(':', '');
}

function normalizeAttendanceTime(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^\d{4}$/.test(text)) return text;

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
        return formatPstTimeCode(parsed);
    }

    const digits = text.replace(/\D/g, '');
    if (digits.length >= 4) return digits.slice(-4);
    return text;
}

function normalizeSearchText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function attendanceRowMatchesSearch(row, term) {
    const query = normalizeSearchText(term);
    if (!query) return true;

    const name = normalizeSearchText(row?.name || '');
    const serial = normalizeSearchText(row?.serial || '');
    const tokens = query.split(/\s+/).filter(Boolean);
    const nameTokens = name.split(/\s+/).filter(Boolean);

    if (name.includes(query) || serial.includes(query)) return true;

    return tokens.every(token => {
        if (token.length === 1) {
            return nameTokens.some(part => part.startsWith(token));
        }
        return nameTokens.some(part => part.includes(token));
    });
}

async function importRosterIntoAttendance(sb, rosterUrl) {
    const csvUrl = toGoogleCsvUrl(rosterUrl);
    if (!csvUrl) return { imported: 0 };

    const response = await fetch(csvUrl, { cache: 'no-store' });
    if (!response.ok) return { imported: 0 };

    const csvText = await response.text();
    const rows = parseCsvText(csvText);
    if (rows.length < 2) return { imported: 0 };

    const headers = rows[0];
    const serialIdx = pickHeaderIndex(headers, ['serial', '#']);
    const nameIdx = pickHeaderIndex(headers, ['full name', 'name']);
    if (serialIdx < 0) return { imported: 0 };

    const existingRows = await sb.from('super_unit_mang').select('serial, name, presence').limit(5000);
    const existing = new Set((existingRows.data || []).map(r => String(r.serial || '').trim().toUpperCase()).filter(Boolean));

    const toInsert = [];
    for (const row of rows.slice(1)) {
        const serial = String(row[serialIdx] || '').trim();
        if (!serial) continue;
        const key = serial.toUpperCase();
        if (existing.has(key)) continue;

        const fullName = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : '';
        toInsert.push({
            name: fullName || serial,
            serial,
            is_present: false,
            on_loa: false,
            loa_date: null,
            in_time: null,
            out_time: null,
            presence: [],
            callsign: null
        });
        existing.add(key);
    }

    if (toInsert.length) {
        await sb.from('super_unit_mang').upsert(toInsert, { onConflict: 'serial' });
    }

    return { imported: toInsert.length };
}

async function loadAttendanceRows(state, deps) {
    const sb = deps.getSbClient();
    if (!sb) return [];

    const rosterUrl = state?.config?.records?.rosterUrl || '';
    try {
        await importRosterIntoAttendance(sb, rosterUrl);
    } catch (err) {
        console.warn('Attendance roster sync skipped:', err);
    }

    const usersResult = await sb.from('users').select('full_name, serial, email').limit(500);
    const attendanceResult = await sb.from('super_unit_mang').select('name, serial, is_present, on_loa, loa_date, in_time, out_time, callsign, presence').limit(500);

    const users = usersResult.data || [];
    const attendance = attendanceResult.data || [];

    const attendanceMap = new Map(attendance.map(r => [String(r.serial || r.name || '').toUpperCase(), r]));
    const source = users.length ? users : attendance;

    return source.map((userRow, idx) => {
        const serial = String(userRow.serial || userRow.name || `UNK-${idx + 1}`);
        const key = serial.toUpperCase();
        const merged = attendanceMap.get(key) || {};
        return {
            name: String(userRow.full_name || userRow.name || userRow.email || merged.name || `Unknown ${idx + 1}`),
            serial,
            is_present: false,
            on_loa: Boolean(merged.on_loa),
            loa_date: merged.loa_date ? String(merged.loa_date) : null,
            in_time: merged.in_time ? normalizeAttendanceTime(merged.in_time) : null,
            out_time: merged.out_time ? normalizeAttendanceTime(merged.out_time) : null,
            callsign: merged.callsign ? String(merged.callsign) : null,
            presence: Array.isArray(merged.presence) ? merged.presence.map(entry => String(entry || '').trim()).filter(Boolean) : []
        };
    });
};

function renderAttendanceTable(state, deps) {
    const nowPst = deps.getPstNow();
    const rows = state.attendanceRows || [];

    const html = `
            <div class="p1r-card">
                <div class="p1r-card-title">Attendance</div>
                <div class="p1r-inline-row p1r-attendance-toolbar">
                    <button class="p1r-btn" data-action="refresh-attendance">Refresh</button>
                    <input class="p1r-input" id="p1r-att-search" type="text" placeholder="Search by name or serial" style="max-width:280px;">
                    <button class="p1r-btn" data-action="export-roster-csv">Export Current Roster</button>
                    <button class="p1r-btn" data-action="open-attendance-sheet">Export to Google Sheets</button>
                    <div class="p1r-clock">PST: ${deps.escapeHtml(nowPst)}</div>
                </div>
                <div class="p1r-table-wrap">
                    <table class="p1r-table" id="p1r-att-table">
                        <thead>
                            <tr>
                                <th>FULL NAME</th>
                                <th>SERIAL #</th>
                                <th>P</th>
                                <th>L</th>
                                <th>UNTIL WHEN</th>
                                <th>IN TIME</th>
                                <th>OUT TIME</th>
                                <th>CALLSIGN</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map(row => `
                                <tr data-serial="${deps.escapeHtml(row.serial)}" data-name="${deps.escapeHtml(row.name)}" data-presence="${deps.escapeHtml(JSON.stringify(row.presence || []))}">
                                    <td>${deps.escapeHtml(row.name)}</td>
                                    <td>${deps.escapeHtml(row.serial)}</td>
                                    <td><input type="checkbox" data-att-field="is_present"></td>
                                    <td><input type="checkbox" data-att-field="on_loa" ${row.on_loa ? 'checked' : ''}></td>
                                    <td><input class="p1r-input" data-att-field="loa_date" type="date" value="${deps.escapeHtml(row.loa_date)}"></td>
                                    <td>
                                        <div class="p1r-inline-row" style="margin:0; gap:4px;">
                                            <input class="p1r-input" data-att-field="in_time" inputmode="numeric" maxlength="4" placeholder="HHMM" value="${deps.escapeHtml(row.in_time)}">
                                            <button class="p1r-btn" data-action="att-now" data-target="in_time" style="height:26px;">Now</button>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="p1r-inline-row" style="margin:0; gap:4px;">
                                            <input class="p1r-input" data-att-field="out_time" inputmode="numeric" maxlength="4" placeholder="HHMM" value="${deps.escapeHtml(row.out_time)}">
                                            <button class="p1r-btn" data-action="att-now" data-target="out_time" style="height:26px;">Now</button>
                                        </div>
                                    </td>
                                    <td><input class="p1r-input" data-att-field="callsign" value="${deps.escapeHtml(row.callsign)}"></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="p1r-muted" id="p1r-att-save-status">Autosave is enabled (5s idle).</div>
            </div>
        `;

    deps.setContent(state, 'Attendance', html, { page: 'attendance', rows: rows.slice() });
    filterAttendanceRows(state, state.attendanceSearchTerm || '');
};

function filterAttendanceRows(state, term) {
    state.attendanceSearchTerm = String(term || '');
    const table = state.root.querySelector('#p1r-att-table');
    if (!table) return 0;

    let visibleCount = 0;
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    rows.forEach(row => {
        const rowData = {
            name: String(row.getAttribute('data-name') || row.children[0]?.textContent || ''),
            serial: String(row.getAttribute('data-serial') || row.children[1]?.textContent || '')
        };
        const match = attendanceRowMatchesSearch(rowData, term);
        row.style.display = match ? '' : 'none';
        if (match) visibleCount += 1;
    });

    return visibleCount;
};

function collectAttendanceRowsFromDom(state) {
    const table = state.root.querySelector('#p1r-att-table');
    if (!table) return [];
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    return rows.map(tr => {
        const getValue = field => {
            const input = tr.querySelector(`[data-att-field="${field}"]`);
            if (!input) return '';
            if (input.type === 'checkbox') return !!input.checked;
            return String(input.value || '').trim();
        };
        return {
            name: String(tr.children[0]?.textContent || '').trim(),
            serial: String(tr.getAttribute('data-serial') || '').trim(),
            is_present: Boolean(getValue('is_present')),
            on_loa: Boolean(getValue('on_loa')),
            loa_date: String(getValue('loa_date') || ''),
            in_time: normalizeAttendanceTime(getValue('in_time')),
            out_time: normalizeAttendanceTime(getValue('out_time')),
            callsign: String(getValue('callsign') || ''),
            presence: (() => {
                try {
                    return JSON.parse(String(tr.getAttribute('data-presence') || '[]'));
                } catch {
                    return [];
                }
            })()
        };
    });
};

//-- push updates to db every 5s if changes --\\
async function saveAttendanceRows(state, deps) {
    const status = state.root.querySelector('#p1r-att-save-status');
    const rows = collectAttendanceRowsFromDom(state);
    state.attendanceRows = rows;

    const sb = deps.getSbClient();
    if (!sb) {
        if (status) status.textContent = 'Autosave skipped: database unavailable.';
        return;
    }

    try {
        if (status) status.textContent = 'Saving attendance...';
        const todayKey = getPstDateKey();
        for (const row of rows) {
            const presence = Array.isArray(row.presence) ? row.presence.slice() : [];
            const inTime = normalizeAttendanceTime(row.in_time);
            const outTime = normalizeAttendanceTime(row.out_time);
            if (row.is_present && !presence.includes(todayKey)) {
                presence.push(todayKey);
            }
            await sb.from('super_unit_mang').upsert({
                name: row.name,
                serial: row.serial,
                is_present: row.is_present,
                on_loa: row.on_loa,
                loa_date: row.loa_date,
                in_time: inTime,
                out_time: outTime,
                callsign: row.callsign,
                presence
            }, { onConflict: 'serial' });
        }
        if (status) status.textContent = `Saved ${rows.length} rows at ${deps.getPstNow()}`;
    } catch (err) {
        console.error('Attendance autosave failed:', err);
        if (status) status.textContent = 'Autosave failed. Check console.';
    }
};

function scheduleAttendanceAutosave(state, deps) {
    if (state.attendanceSaveTimer) clearTimeout(state.attendanceSaveTimer);
    state.attendanceSaveTimer = setTimeout(async () => {
        await saveAttendanceRows(state, deps);
    }, 5000);
};
