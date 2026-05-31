 async function exportCallsCsvByDateRange() {
            const startInput = document.getElementById('printCallsDate');
            const endInput = document.getElementById('printCallsDateEnd');
            const statusEl = document.getElementById('printCallsStatus');

            const startStr = startInput ? String(startInput.value || '').trim() : '';
            const endStrRaw = endInput ? String(endInput.value || '').trim() : '';
            const endStr = endStrRaw || startStr;

            if (!startStr) {
                if (statusEl) {
                    statusEl.style.color = '#c80000';
                    statusEl.textContent = 'Please select a start date.';
                }
                return;
            }

            const startDate = parseCallDateOnly(startStr);
            const endDate = parseCallDateOnly(endStr);
            if (!startDate || !endDate) {
                if (statusEl) {
                    statusEl.style.color = '#c80000';
                    statusEl.textContent = 'Invalid date selection.';
                }
                return;
            }

            if (startDate.getTime() > endDate.getTime()) {
                if (statusEl) {
                    statusEl.style.color = '#c80000';
                    statusEl.textContent = 'Start date cannot be after end date.';
                }
                return;
            }

            if (!sbClient) {
                if (statusEl) {
                    statusEl.style.color = '#c80000';
                    statusEl.textContent = 'Database connection unavailable.';
                }
                return;
            }

            if (statusEl) {
                statusEl.style.color = '#666';
                statusEl.textContent = 'Preparing CSV export...';
            }

            const { data, error } = await sbClient
                .from('calls')
                .select('id, area, beat, created_at, call_type, call_code')
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Error exporting calls CSV:', error);
                if (statusEl) {
                    statusEl.style.color = '#c80000';
                    statusEl.textContent = 'Failed to query calls.';
                }
                return;
            }

            const rows = (Array.isArray(data) ? data : []).filter(call => {
                const callDate = parseCallDateOnly(call.created_at);
                if (!callDate) return false;
                return callDate.getTime() >= startDate.getTime() && callDate.getTime() <= endDate.getTime();
            });

            const headers = [
                'Incident_Number',
                'Area',
                'Rpt_Dist (Beat)',
                'Dispatch_Date (created_at)',
                'Call_type',
                'Call_code'
            ];

            const lines = [headers.join(',')];
            rows.forEach(call => {
                lines.push([
                    csvEscape(call.id || ''),
                    csvEscape(call.area || ''),
                    csvEscape(call.beat || ''),
                    csvEscape(call.created_at || ''),
                    csvEscape(call.call_type || ''),
                    csvEscape(call.call_code || '')
                ].join(','));
            });

            const csvText = lines.join('\n');
            const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            const startFile = startStr.replace(/-/g, '');
            const endFile = endStr.replace(/-/g, '');
            const suffix = startFile === endFile ? startFile : `${startFile}-${endFile}`;

            link.href = url;
            link.download = `calls_export_${suffix}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            if (statusEl) {
                statusEl.style.color = '#0a8a26';
                statusEl.textContent = `Exported ${rows.length} call(s) to CSV.`;
            }

            closeModal('printCallsModal');
        }