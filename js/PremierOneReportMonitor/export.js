
function toGoogleCsvUrl(sheetUrl) {
    const raw = String(sheetUrl || '').trim();
    if (!raw) return '';
    if (raw.includes('/gviz/tq') && raw.includes('tqx=out:csv')) return raw;
    if (raw.includes('/edit')) {
        return raw.replace(/\/edit.*$/i, '/gviz/tq?tqx=out:csv');
    }
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
    if (!lines.length) return [];
    return lines.map(parseCsvRow);
}

async function fetchRosterRows(sheetUrl) {
    const csvUrl = toGoogleCsvUrl(sheetUrl);
    if (!csvUrl) return { rows: [], sourceUrl: '' };

    const response = await fetch(csvUrl, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Roster fetch failed (${response.status})`);
    }

    const csvText = await response.text();
    const rows = parseCsvText(csvText);
    return { rows, sourceUrl: csvUrl };
}

async function renderRosterPage(state, deps) {
    const url = state.config.records.rosterUrl;
    try {
        const { rows, sourceUrl } = await fetchRosterRows(url);
        if (!rows.length) {
            deps.setContent(state, 'Roster', `
                    <div class="p1r-card">
                        <div class="p1r-card-title">Roster</div>
                        <div class="p1r-muted">No roster rows were returned by the Google Sheet.</div>
                        <button class="p1r-btn p1r-btn-primary" data-action="open-roster-link">Open Roster</button>
                    </div>
                `, { page: 'roster', url });
            return;
        }

        const headers = rows[0].map((h, idx) => String(h || `Column ${idx + 1}`).trim() || `Column ${idx + 1}`);
        const dataRows = rows.slice(1);

        const html = `
                <div class="p1r-inline-row" style="margin-bottom:8px;">
                    <button class="p1r-btn" data-action="open-roster-link">Open Roster</button>
                    <div class="p1r-muted">Imported ${dataRows.length} rows from Google Sheets.</div>
                </div>
                <div class="p1r-table-wrap" style="max-height: calc(100vh - 260px); overflow: auto;">
                    <table class="p1r-table">
                        <thead>
                            <tr>${headers.map(h => `<th>${deps.escapeHtml(h)}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${dataRows.map(row => `<tr>${headers.map((_, colIdx) => `<td>${deps.escapeHtml(row[colIdx] || '')}</td>`).join('')}</tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="p1r-muted" style="margin-top:8px;">Source: ${deps.escapeHtml(sourceUrl || url)}</div>
            `;
        deps.setContent(state, 'Roster', html, { page: 'roster', url, headers, rows: dataRows });
    } catch (err) {
        console.error('Roster import failed:', err);
        const html = `
                <div class="p1r-card">
                    <div class="p1r-card-title">Roster</div>
                    <div class="p1r-login-error" style="min-height: 0;">Unable to import roster from Google Sheets.</div>
                    <button class="p1r-btn p1r-btn-primary" data-action="open-roster-link">Open Roster</button>
                    <div class="p1r-muted" style="margin-top:8px;">${deps.escapeHtml(url)}</div>
                </div>
            `;
        deps.setContent(state, 'Roster', html, { page: 'roster', url });
    }
};

function exportRosterCsv(state, deps) {
    const rows = state.attendanceRows || [];
    if (!rows.length) {
        alert('No roster data available to export.');
        return;
    }
    const lines = [
        'name,serial,is_present,on_loa,loa_date,in_time,out_time,callsign',
        ...rows.map(row => {
            return [
                row.name,
                row.serial,
                row.is_present ? '1' : '0',
                row.on_loa ? '1' : '0',
                row.loa_date || '',
                row.in_time || '',
                row.out_time || '',
                row.callsign || ''
            ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',');
        })
    ];
    deps.downloadBlob('premierone-records-roster.csv', lines.join('\n'), 'text/csv;charset=utf-8');
};

function isPrimitiveValue(value) {
    return value == null || ['string', 'number', 'boolean'].includes(typeof value);
}

function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
}

function formatPrimitiveValue(value, esc) {
    if (value == null) return '<span class="muted">N/A</span>';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    const text = String(value).trim();
    return text ? esc(text) : '<span class="muted">N/A</span>';
}

function renderPrimitiveList(items, esc) {
    if (!items.length) {
        return '<div class="muted">No items available.</div>';
    }
    return `<ul class="value-list">${items.map(item => `<li>${formatPrimitiveValue(item, esc)}</li>`).join('')}</ul>`;
}

function renderObjectTable(rows, esc) {
    if (!rows.length) {
        return '<div class="muted">No rows available.</div>';
    }
    const columns = [];
    rows.forEach(row => {
        Object.keys(row || {}).forEach(key => {
            if (!columns.includes(key)) columns.push(key);
        });
    });
    if (!columns.length) {
        return '<div class="muted">No columns available.</div>';
    }
    return `
        <table>
            <thead>
                <tr>${columns.map(col => `<th>${esc(col)}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${rows.map(row => `<tr>${columns.map(col => `<td>${formatPrimitiveValue((row || {})[col], esc)}</td>`).join('')}</tr>`).join('')}
            </tbody>
        </table>
    `;
}

function renderDataBlock(value, esc, heading, depth) {
    const titleTag = depth <= 1 ? 'h3' : 'h4';
    const title = heading ? `<${titleTag}>${esc(heading)}</${titleTag}>` : '';

    if (isPrimitiveValue(value)) {
        return `<section class="block">${title}<div>${formatPrimitiveValue(value, esc)}</div></section>`;
    }

    if (Array.isArray(value)) {
        if (!value.length) {
            return `<section class="block">${title}<div class="muted">No records available.</div></section>`;
        }
        if (value.every(isPrimitiveValue)) {
            return `<section class="block">${title}${renderPrimitiveList(value, esc)}</section>`;
        }
        if (value.every(item => isPlainObject(item) && Object.values(item).every(isPrimitiveValue))) {
            return `<section class="block">${title}${renderObjectTable(value, esc)}</section>`;
        }

        return `
            <section class="block">
                ${title}
                ${value.slice(0, 25).map((item, index) => renderDataBlock(item, esc, `Item ${index + 1}`, depth + 1)).join('')}
                ${value.length > 25 ? `<div class="muted">Showing first 25 of ${value.length} items.</div>` : ''}
            </section>
        `;
    }

    if (isPlainObject(value)) {
        const entries = Object.entries(value);
        if (!entries.length) {
            return `<section class="block">${title}<div class="muted">No data available.</div></section>`;
        }

        const primitiveRows = entries.filter(([, val]) => isPrimitiveValue(val));
        const nestedRows = entries.filter(([, val]) => !isPrimitiveValue(val));

        const summary = primitiveRows.length
            ? `
                <table class="key-value-table">
                    <tbody>
                        ${primitiveRows.map(([key, val]) => `<tr><th>${esc(key)}</th><td>${formatPrimitiveValue(val, esc)}</td></tr>`).join('')}
                    </tbody>
                </table>
            `
            : '';

        const nested = nestedRows
            .map(([key, val]) => renderDataBlock(val, esc, key, depth + 1))
            .join('');

        return `<section class="block">${title}${summary}${nested}</section>`;
    }

    return `<section class="block">${title}<div>${esc(String(value))}</div></section>`;
}

// generate random id for docx export --\\
function generateRandomId(){
    return Math.random().toString(36).substr(2, 9);
}

function exportCurrentDataDocx(state, deps) {
    const page = state.lastData?.page || 'current-data';
    const body = state.lastData || { note: 'No active dataset.' };
    const esc = typeof deps.escapeHtml === 'function'
        ? deps.escapeHtml
        : (value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
    const generatedAt = new Date().toLocaleString();
    const content = renderDataBlock(body, esc, 'Exported Data', 0);
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>PremierOne Records Export</title>
<style>
body {
    font-family: Calibri, "Segoe UI", Tahoma, sans-serif;
    font-size: 11pt;
    color: #1f2937;
    margin: 24px;
    line-height: 1.4;
}

h1 {
    margin: 0 0 8px;
    font-size: 20pt;
    color: #0f3b72;
}

h2 {
    margin: 0 0 12px;
    font-size: 12pt;
    color: #1d4f91;
    font-weight: 600;
}

h3 {
    margin: 14px 0 8px;
    font-size: 12pt;
    color: #0f3b72;
}

h4 {
    margin: 10px 0 6px;
    font-size: 11pt;
    color: #1d4f91;
}

.meta {
    margin-bottom: 16px;
    padding: 10px 12px;
    border: 1px solid #d6e0ef;
    background: #f6f9ff;
}

.muted {
    color: #64748b;
}

.block {
    margin-bottom: 14px;
    page-break-inside: avoid;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 6px;
}

th,
td {
    border: 1px solid #d8dee9;
    padding: 6px 8px;
    vertical-align: top;
    text-align: left;
}

thead th {
    background: #eaf1fc;
    color: #0f3b72;
    font-weight: 700;
}

.key-value-table th {
    width: 28%;
    background: #f3f7ff;
    color: #27466f;
}

.value-list {
    margin: 6px 0 0;
    padding-left: 18px;
}

.value-list li {
    margin: 2px 0;
}
</style>
</head>
<body>
<h1>PremierOne Records Export</h1>
<div class="meta">
    <h2>Report Summary</h2>
    <div><strong>Page:</strong> ${esc(String(page))}</div>
    <div><strong>Generated:</strong> ${esc(generatedAt)}</div>
</div>
${content}
</body>
</html>`;
    deps.downloadBlob(`${generateRandomId()} premierone-records-${page}.doc`, html, 'application/msword;charset=utf-8');
};

function saveReal() {
    alert('ha you thought');
};

function handleWindowView(action) {
    if (action === 'set-view-fullscreen' && typeof window.handleWindowMaximize === 'function') {
        window.handleWindowMaximize();
        return;
    }
    if (action === 'set-view-windowed' && typeof window.handleWindowMaximize === 'function') {
        window.handleWindowMaximize();
        return;
    }
    if (action === 'set-view-minimize' && typeof window.handleWindowMinimize === 'function') {
        window.handleWindowMinimize();
    }
};
