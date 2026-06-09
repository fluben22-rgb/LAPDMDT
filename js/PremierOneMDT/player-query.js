"use strict";

function getPlayerQueryConfig() {
    const cfg = window.playerQueryConfig || {};
    return {
        source: cfg.source || 'function',
        functionName: cfg.functionName || 'query-player-new',
        fallbackFunctionNames: Array.isArray(cfg.fallbackFunctionNames)
            ? cfg.fallbackFunctionNames
            : ['query-player-v2', 'query-player'],
        tableName: cfg.tableName || '',
        idColumns: Array.isArray(cfg.idColumns) && cfg.idColumns.length > 0
            ? cfg.idColumns
            : ['id', 'player_id', 'playerId', 'roblox_id', 'robloxId', 'license_number'],
        select: cfg.select || '*'
    };
}

function isMissingPlayerQuerySourceError(error) {
    const text = String(error?.message || error || '').toLowerCase();
    const status = error?.status || error?.context?.status || error?.details?.status;
    return status === 404 ||
        text.includes('404') ||
        text.includes('not found') ||
        text.includes('could not find') ||
        text.includes('does not exist');
}

function normalizePlayerQueryRecord(record, requestedId) {
    if (!record) return null;
    const firstName = record.FName ?? record.fname ?? record.first_name ?? record.firstName ?? record.FirstName ?? '';
    const lastName = record.LName ?? record.lname ?? record.last_name ?? record.lastName ?? record.LastName ?? '';
    const charges = record.Charges ?? record.charges ?? record.arrests ?? record.Arrests ?? '';
    const infractions = record.Infractions ?? record.infractions ?? record.citations ?? record.Citations ?? '';
    const revoked = record.LicenseRevokedUntil ?? record.license_revoked_until ?? record.licenseRevokedUntil ?? record.revoked_until ?? 0;

    return {
        ...record,
        FName: firstName,
        LName: lastName,
        Age: record.Age ?? record.age ?? 'N/A',
        Gender: record.Gender ?? record.gender ?? record.sex ?? record.Sex ?? '',
        Charges: charges,
        Infractions: infractions,
        LicenseRevokedUntil: revoked,
        _sourceId: requestedId
    };
}

async function queryPlayerRecordViaFunction(client, playerId, functionName) {
    const result = await client.functions.invoke(functionName, {
        body: { playerId, id: playerId, query: playerId }
    });
    if (result?.error) throw result.error;
    return normalizePlayerQueryRecord(result?.data || null, playerId);
}

async function queryPlayerRecordViaTable(client, playerId, cfg) {
    if (!cfg.tableName) return null;

    for (const column of cfg.idColumns) {
        try {
            const { data, error } = await client
                .from(cfg.tableName)
                .select(cfg.select)
                .eq(column, playerId)
                .limit(1)
                .maybeSingle();
            if (error) {
                if (isMissingPlayerQuerySourceError(error)) continue;
                throw error;
            }
            if (data) return normalizePlayerQueryRecord(data, playerId);
        } catch (error) {
            if (isMissingPlayerQuerySourceError(error)) continue;
            throw error;
        }
    }

    return null;
}

async function queryPlayerRecord(client, playerId) {
    if (!client) throw new Error('Database connection is not available.');
    const cfg = getPlayerQueryConfig();
    const requestedId = String(playerId || '').trim();
    if (!requestedId) return null;

    if (cfg.source === 'table') {
        return queryPlayerRecordViaTable(client, requestedId, cfg);
    }

    const functionNames = [cfg.functionName, ...cfg.fallbackFunctionNames]
        .map(name => String(name || '').trim())
        .filter((name, index, list) => name && list.indexOf(name) === index);

    let lastMissingError = null;
    for (const functionName of functionNames) {
        try {
            return await queryPlayerRecordViaFunction(client, requestedId, functionName);
        } catch (error) {
            if (isMissingPlayerQuerySourceError(error) && functionName !== functionNames[functionNames.length - 1]) {
                lastMissingError = error;
                continue;
            }
            throw error;
        }
    }

    if (lastMissingError) throw lastMissingError;
    return null;
}

window.queryPlayerRecord = queryPlayerRecord;