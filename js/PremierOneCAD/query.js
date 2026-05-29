 // ============================================================
        // DISPATCH QUERY PANEL
        // ============================================================

        let _dispQueryType = 'vehicle';
        let _lastDispQueryEntry = null;

        function openDispatchQuery(type) {
            _dispQueryType = type || 'vehicle';
            const panel = document.getElementById('dispatchQueryPanel');
            const rightPanel = document.getElementById('dispRightPanel');
            const callsList = document.getElementById('callsListView');
            // Hide the right tab panel (Incident Info / Queries), not its inner content
            if (rightPanel) rightPanel.style.display = 'none';
            if (callsList) callsList.style.display = 'none';
            if (panel) panel.style.display = 'flex';
            updateDispatchQueryTypeUI();
            setTimeout(() => {
                const inp = _dispQueryType === 'vehicle'
                    ? document.getElementById('dispQueryPlate')
                    : document.getElementById('dispQueryId');
                if (inp) inp.focus();
            }, 50);
        }

        function closeDispatchQuery() {
            const panel = document.getElementById('dispatchQueryPanel');
            if (panel) panel.style.display = 'none';
            // Restore the right tab panel
            const rightPanel = document.getElementById('dispRightPanel');
            if (rightPanel) rightPanel.style.display = 'flex';
        }

        function switchDispatchQueryType() {
            _dispQueryType = _dispQueryType === 'vehicle' ? 'person' : 'vehicle';
            updateDispatchQueryTypeUI();
        }

        function updateDispatchQueryTypeUI() {
            const label = document.getElementById('dispQueryTypeLabel');
            const vehInputs = document.getElementById('dispQueryVehicleInputs');
            const perInputs = document.getElementById('dispQueryPersonInputs');
            if (_dispQueryType === 'vehicle') {
                if (label) label.textContent = 'VEHICLE QUERY';
                if (vehInputs) vehInputs.style.display = 'block';
                if (perInputs) perInputs.style.display = 'none';
            } else {
                if (label) label.textContent = 'PERSON / ID QUERY';
                if (vehInputs) vehInputs.style.display = 'none';
                if (perInputs) perInputs.style.display = 'block';
            }
        }

        function clearDispatchQueryOutput() {
            const out = document.getElementById('dispQueryOutput');
            if (out) out.innerHTML = '<span style="color:#555;">// Ready.</span>';
            _lastDispQueryEntry = null;
        }

        async function runDispatchQuery() {
            const out = document.getElementById('dispQueryOutput');
            if (!out) return;
            if (!sbClient) { out.innerHTML = '<span style="color:#f00;">// ERROR: No database connection.</span>'; return; }

            const isVehicle = _dispQueryType === 'vehicle';
            const inputVal = isVehicle
                ? (document.getElementById('dispQueryPlate')?.value || '').trim().toUpperCase()
                : (document.getElementById('dispQueryId')?.value || '').trim();

            if (!inputVal) { out.innerHTML = '<span style="color:#f00;">// ERROR: No input provided.</span>'; return; }

            const safeVal = escapeHtml(inputVal);
            out.innerHTML = `<span style="color:#ff0;">// QUERYING ${isVehicle ? 'PLATE' : 'ID'}: ${safeVal}...</span>`;

            try {
                let result, queryEntry;
                if (isVehicle) {
                    alert("We don't support that, sorry!");
                } else {
                    const rlsClient = getRlsClient();
                    const { data: personData, error } = await rlsClient.functions.invoke('query-player', {
                        body: { playerId: inputVal }
                    });

                    if (error) {
                        throw error;
                    }

                    if (!personData) {
                        out.innerHTML = `<span style="color:#0f0;">// QUERY: ${safeVal}\n// SOURCE: NCIC / DMV\n// RESULT: <span style="color:#ff0;">NO RECORD FOUND</span></span>`;
                        queryEntry = { type: 'person', criteria: `PERSON: ${inputVal}`, name: 'No record found', alerts: 'N/A', received: new Date().toLocaleTimeString('en-US', { hour12: false }) };
                    } else {
                        const name = ((personData.FName || '') + ' ' + (personData.LName || '')).trim() || inputVal;
                        const age = personData.Age || 'N/A';
                        const gender = personData.Gender === 'Male' ? 'M - Male' : personData.Gender === 'Female' ? 'F - Female' : (personData.Gender || '—');
                        const infractions = personData.Infractions === '' ? 'None' : (personData.Infractions || 'None');
                        const arrests = personData.Charges === '' ? 'None' : (personData.Charges || 'None');
                        const licenseRevoked = personData.LicenseRevokedUntil && personData.LicenseRevokedUntil !== 0 ? `Revoked until ${personData.LicenseRevokedUntil}` : 'Valid';
                        let alerts = 'NONE';
                        try {
                            const { data: alertData } = await sbClient.from('Alerts').select('alert').eq('id', inputVal).maybeSingle();
                            if (alertData?.alert && Array.isArray(alertData.alert) && alertData.alert.filter(Boolean).length > 0)
                                alerts = alertData.alert.filter(Boolean).join(', ');
                        } catch (e) { /* silent */ }
                        const alertColor = alerts !== 'NONE' ? '#f00' : '#0f0';
                        out.innerHTML = `<span style="color:#0f0;">// QUERY: ${safeVal}
                        // SOURCE: NCIC / DMV
                        // NAME:   ${escapeHtml(name)}
                        // AGE:    ${escapeHtml(String(age))}
                        // SEX:    ${escapeHtml(gender)}
                        // INF:    ${escapeHtml(String(infractions))}
                        // ARR:    ${escapeHtml(String(arrests))}
                        // LIC:    ${escapeHtml(licenseRevoked)}
                        // ALERTS: <span style="color:${alertColor};">${escapeHtml(alerts)}</span></span>`;
                        queryEntry = { type: 'person', criteria: `PERSON: ${inputVal}`, name, alerts, gender, age: String(age), infractions, arrests: String(arrests), received: new Date().toLocaleTimeString('en-US', { hour12: false }) };
                    }
                }
                _lastDispQueryEntry = queryEntry;
            } catch (e) {
                out.innerHTML = `<span style="color:#f00;">// ERROR: ${escapeHtml(e.message || String(e))}</span>`;
            }
        }

        async function attachDispatchQueryToInc() {
            if (!_lastDispQueryEntry) { alert('Run a query first.'); return; }
            let incId = dispatchGetSelectedIncidentId();
            if (!incId) {
                const selTab = dispatchGetSelectedTab();
                incId = selTab?.id || null;
            }
            if (!incId) {
                const nameEl = document.getElementById('incidentNameDisplay');
                const nameText = nameEl ? nameEl.textContent.replace(/^\/\/\s*/, '').trim() : '';
                if (/^\d{4}-\d+$/.test(nameText)) incId = nameText;
            }
            if (!incId) incId = window._dispatchCurrentIncidentId || window.currentIncidentId || null;
            if (!incId) { alert('No incident selected in dispatch. Open an incident first.'); return; }
            if (!sbClient) return;
            try {
                const { data: existing } = await sbClient.from('calls').select('queries').eq('id', incId).single();
                const currentQueries = Array.isArray(existing?.queries) ? existing.queries : [];
                const newQueries = [...currentQueries, _lastDispQueryEntry];
                await sbClient.from('calls').update({ queries: newQueries }).eq('id', incId);
                updateDispRightQueriesCount(newQueries.length);
                const out = document.getElementById('dispQueryOutput');
                if (out) {
                    const existing = out.innerHTML;
                    out.innerHTML = existing + `\n\n<span style="color:#0af;">// ATTACHED TO INCIDENT ${incId}</span>`;
                }
            } catch (e) {
                alert('Failed to attach: ' + (e.message || e));
            }
        }