import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MAP_MODEL_URL = "./assets/maps/mobile-map.glb";
const MOBILE_MAP_MIN_ZOOM = 1.0;
const MOBILE_MAP_MAX_ZOOM = 6.0;

const mapState = {
    initialized: false,
    model: null,
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    mapRoot: null,
    bounds: null,
    root: null,
    animationId: null,
    heading: 0,
    viewSize: 100,
    rotating: false,
    lastPointerX: 0,
    resizeObserver: null,
    shellWindowElement: null,
    unitMarkers: new Map(),
    incidentMarkers: new Map(),
    fakeUnits: [],
    fakeUnitStartedAt: 0,
    lastIncidentPingFetch: 0,
    lastUnitGpsFetch: 0,
    raycaster: null,
    pointer: null,
    hoveredMarker: null,
    tooltip: null,
    detailsPanel: null,
    pointerMoveAttached: false,
};

function getMobileMapElement(id) {
    const root = mapState.root || document;
    return root.querySelector ? root.querySelector(`#${id}`) : document.getElementById(id);
}

function setMapStatus(text) {
    const status = getMobileMapElement("mobile-map-status");
    if (status) status.textContent = text;
}

function resizeMobileMap() {
    const canvas = getMobileMapElement("mobile-map-canvas");
    const stage = getMobileMapElement("mobile-map-stage");
    if (!canvas || !stage || !mapState.renderer || !mapState.camera) return;

    const width = Math.max(stage.clientWidth, 1);
    const height = Math.max(stage.clientHeight, 1);
    const aspect = width / height;
    mapState.renderer.setSize(width, height, false);

    if (mapState.camera.isOrthographicCamera) {
        mapState.camera.zoom = THREE.MathUtils.clamp(mapState.camera.zoom, MOBILE_MAP_MIN_ZOOM, MOBILE_MAP_MAX_ZOOM);
        const viewHeight = getMobileMapViewHeightForAspect(aspect);
        mapState.viewSize = viewHeight;
        const viewWidth = viewHeight * aspect;
        mapState.camera.left = -viewWidth / 2;
        mapState.camera.right = viewWidth / 2;
        mapState.camera.top = viewHeight / 2;
        mapState.camera.bottom = -viewHeight / 2;
    } else {
        mapState.camera.aspect = aspect;
    }

    mapState.camera.updateProjectionMatrix();
    updateMobileMapTooltip();
}

function queueMobileMapResize() {
    requestAnimationFrame(() => {
        resizeMobileMap();
        requestAnimationFrame(resizeMobileMap);
    });
}

function getMobileMapViewHeightForAspect(aspect) {
    if (!mapState.bounds) return mapState.viewSize;

    const size = new THREE.Vector3();
    mapState.bounds.getSize(size);

    const paddedWidth = Math.max(size.x, 1) * 1.08;
    const paddedDepth = Math.max(size.z, size.y * 0.35, 1) * 1.08;
    return Math.max(paddedDepth, paddedWidth / Math.max(aspect, 0.01));
}

function clampMobileMapZoom() {
    if (!mapState.camera?.isOrthographicCamera) return;
    const nextZoom = THREE.MathUtils.clamp(mapState.camera.zoom, MOBILE_MAP_MIN_ZOOM, MOBILE_MAP_MAX_ZOOM);
    if (nextZoom !== mapState.camera.zoom) {
        mapState.camera.zoom = nextZoom;
        mapState.camera.updateProjectionMatrix();
    }
}

function getUnitMarkerY() {
    if (!mapState.bounds) return 2;
    const size = new THREE.Vector3();
    mapState.bounds.getSize(size);
    return mapState.bounds.max.y + Math.max(size.y * 0.08, 1.8);
}

function getFakeUnitPosition(unit, elapsedSeconds) {
    if (!mapState.bounds) return new THREE.Vector3();

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    mapState.bounds.getCenter(center);
    mapState.bounds.getSize(size);

    const radiusX = Math.max(size.x * unit.radiusX, 8);
    const radiusZ = Math.max(size.z * unit.radiusZ, 8);
    const t = elapsedSeconds * unit.speed + unit.phase;

    return new THREE.Vector3(
        center.x + Math.cos(t) * radiusX + Math.sin(t * 0.55) * radiusX * 0.2,
        getUnitMarkerY(),
        center.z + Math.sin(t) * radiusZ
    );
}

function getUnitGpsPosition(unit) {
    const x = Number(unit?.gps_x);
    const z = Number(unit?.gps_z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return new THREE.Vector3(x, getUnitMarkerY(), z);
}

function createUnitMarker(unit) {
    const group = new THREE.Group();
    group.name = `unit-${unit.callsign}`;
    group.userData.type = "unit-marker";
    group.userData.callsign = unit.callsign;
    group.userData.status = unit.status;
    group.userData.speedMph = unit.speedMph;
    group.userData.assignment = unit.assignment;
    group.userData.lastUpdated = new Date().toLocaleTimeString();

    const dot = new THREE.Mesh(
        new THREE.CircleGeometry(unit.isSelf ? 12 : 10, 32),
        new THREE.MeshBasicMaterial({ color: unit.color })
    );
    dot.rotation.x = -Math.PI / 2;
    dot.userData.markerRoot = group;

    const ring = new THREE.Mesh(
        new THREE.RingGeometry(unit.isSelf ? 14 : 12, unit.isSelf ? 17 : 15, 36),
        new THREE.MeshBasicMaterial({
            color: unit.color,
            transparent: true,
            opacity: 0.72,
            side: THREE.DoubleSide
        })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.userData.markerRoot = group;

    const hitbox = new THREE.Mesh(
        new THREE.CircleGeometry(unit.isSelf ? 28 : 24, 32),
        new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthWrite: false
        })
    );
    hitbox.rotation.x = -Math.PI / 2;
    hitbox.userData.markerRoot = group;

    group.add(hitbox, ring, dot);
    mapState.scene.add(group);
    mapState.unitMarkers.set(unit.callsign, group);
    return group;
}

function createIncidentPingMarker(call) {
    const group = new THREE.Group();
    group.name = `incident-${call.id}`;
    group.userData.type = "incident-marker";
    group.userData.callsign = call.id;
    group.userData.status = call.status || "Pending";
    group.userData.speedMph = null;
    group.userData.assignment = call.location || "911 Ping";
    group.userData.priority = call.call_code || "911";
    group.userData.attachedUnits = formatCallAttachedUnits(call);
    group.userData.lastUpdated = call.created_at || new Date().toLocaleTimeString();

    const ring = new THREE.Mesh(
        new THREE.RingGeometry(70, 76, 64),
        new THREE.MeshBasicMaterial({
            color: 0xffd24a,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
        })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.userData.markerRoot = group;

    const hitbox = new THREE.Mesh(
        new THREE.CircleGeometry(90, 48),
        new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthWrite: false
        })
    );
    hitbox.rotation.x = -Math.PI / 2;
    hitbox.userData.markerRoot = group;

    group.add(hitbox, ring);
    mapState.scene.add(group);
    mapState.incidentMarkers.set(call.id, group);
    return group;
}

function getCallPingPosition(call) {
    const x = Number(call?.ping_x);
    const z = Number(call?.ping_z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return new THREE.Vector3(x, getUnitMarkerY(), z);
}

function syncIncidentPingMarkers(calls) {
    const visibleIds = new Set();

    calls.forEach(call => {
        const id = String(call?.id || "").trim();
        const position = getCallPingPosition(call);
        if (!id || !position) return;

        visibleIds.add(id);
        const marker = mapState.incidentMarkers.get(id) || createIncidentPingMarker(call);
        marker.position.copy(position);
        marker.userData.callsign = id;
        marker.userData.status = call.status || "Pending";
        marker.userData.assignment = call.location || "911 Ping";
        marker.userData.priority = call.call_code || "911";
        marker.userData.attachedUnits = formatCallAttachedUnits(call);
        marker.userData.lastUpdated = call.created_at || new Date().toLocaleTimeString();
    });

    mapState.incidentMarkers.forEach((marker, id) => {
        if (visibleIds.has(id)) return;
        marker.removeFromParent();
        mapState.incidentMarkers.delete(id);
    });
}

function getMobileMapSupabaseClient() {
    if (typeof sbClient !== "undefined" && sbClient?.from) return sbClient;
    if (window.sbClient?.from) return window.sbClient;
    if (typeof sbAnonClient !== "undefined" && sbAnonClient?.from) return sbAnonClient;
    if (window.sbAnonClient?.from) return window.sbAnonClient;
    return null;
}

function normalizeCallUnitListForMap(value) {
    if (Array.isArray(value)) return value.map(unit => String(unit || "").trim()).filter(Boolean);
    if (value === undefined || value === null) return [];
    const text = String(value).trim();
    if (!text || ["n/a", "na", "none", "null"].includes(text.toLowerCase())) return [];
    if (text.startsWith("[") && text.endsWith("]")) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) return parsed.map(unit => String(unit || "").trim()).filter(Boolean);
        } catch (_) {
            return [];
        }
    }
    return text.split(",").map(unit => unit.trim()).filter(Boolean);
}

function formatCallAttachedUnits(call) {
    const units = [
        ...normalizeCallUnitListForMap(call?.prmry),
        ...normalizeCallUnitListForMap(call?.assist)
    ];
    return units.length ? units.join(", ") : "None";
}

async function refreshIncidentPingMarkers() {
    const client = getMobileMapSupabaseClient();
    if (!mapState.bounds || !client) return;
    const now = performance.now();
    if (mapState.lastIncidentPingFetch && now - mapState.lastIncidentPingFetch < 3000) return;
    mapState.lastIncidentPingFetch = now;

    const { data, error } = await client
        .from("calls")
        .select("id, created_at, status, location, call_code, prmry, assist, is_closed, ping_x, ping_y, ping_z, ping_radius_miles")
        .not("ping_x", "is", null)
        .eq("call_type", "911 CALL")
        .order("created_at", { ascending: false })
        .limit(100);

    if (error) {
        console.warn("Failed loading incident pings for mobile map:", error);
        return;
    }

    const openCalls = (Array.isArray(data) ? data : []).filter(call => {
        const status = String(call?.status || "").toLowerCase();
        return call?.is_closed !== true && status !== "closed";
    });
    syncIncidentPingMarkers(openCalls);
}

function seedFakeMobileMapUnits() {
    mapState.fakeUnits = [
        { callsign: "12A23", status: "Available", assignment: "Patrol", speedMph: 18, color: 0x16c7ff, speed: 0.045, phase: 0.1, radiusX: 0.22, radiusZ: 0.18, isSelf: true },
        { callsign: "14L10", status: "Enroute", assignment: "PD-00020308", speedMph: 34, color: 0xffd24a, speed: 0.038, phase: 1.8, radiusX: 0.31, radiusZ: 0.14 },
        { callsign: "18W41", status: "Code 6", assignment: "2309 W WILCOX ST", speedMph: 6, color: 0x52e67b, speed: 0.032, phase: 3.2, radiusX: 0.18, radiusZ: 0.27 },
        { callsign: "21R55", status: "Available", assignment: "Patrol", speedMph: 22, color: 0xff6b6b, speed: 0.041, phase: 4.6, radiusX: 0.28, radiusZ: 0.25 }
    ];
    mapState.fakeUnitStartedAt = performance.now();

    mapState.fakeUnits.forEach(unit => {
        const marker = mapState.unitMarkers.get(unit.callsign) || createUnitMarker(unit);
        marker.position.copy(getFakeUnitPosition(unit, 0));
    });
}

function updateFakeMobileMapUnits() {
    if (!mapState.fakeUnits.length || !mapState.bounds) return;
    const elapsedSeconds = (performance.now() - mapState.fakeUnitStartedAt) / 1000;

    mapState.fakeUnits.forEach(unit => {
        const marker = mapState.unitMarkers.get(unit.callsign) || createUnitMarker(unit);
        const nextPosition = getFakeUnitPosition(unit, elapsedSeconds);
        marker.position.lerp(nextPosition, 0.055);
        marker.userData.lastUpdated = new Date().toLocaleTimeString();
    });

    updateMobileMapTooltip();
}

function isRecentUnitGps(unit) {
    if (!unit?.gps_updated_at) return true;
    const updatedAt = Date.parse(unit.gps_updated_at);
    if (!Number.isFinite(updatedAt)) return true;
    return Date.now() - updatedAt < 15000;
}

function syncLiveUnitGpsMarkers(units) {
    const visibleIds = new Set();
    const userInfo = sessionStorage.getItem("userInfo");
    const currentUnit = userInfo ? userInfo.split(",")[2] : null;

    units.forEach(unit => {
        if (!isRecentUnitGps(unit)) return;
        const callsign = String(unit?.unit || "").trim();
        const position = getUnitGpsPosition(unit);
        if (!callsign || !position) return;

        visibleIds.add(callsign);
        const marker = mapState.unitMarkers.get(callsign) || createUnitMarker({
            callsign,
            status: unit.status || "GPS",
            assignment: unit.incLocation || unit.inc || unit.roblox_username || "Patrol",
            speedMph: 0,
            color: 0x16c7ff,
            isSelf: currentUnit && normalizeUnitKeyForMap(currentUnit) === normalizeUnitKeyForMap(callsign)
        });

        marker.position.copy(position);
        marker.userData.callsign = callsign;
        marker.userData.status = unit.status || "GPS";
        marker.userData.assignment = unit.incLocation || unit.inc || unit.roblox_username || "Patrol";
        marker.userData.speedMph = 0;
        marker.userData.lastUpdated = unit.gps_updated_at || new Date().toLocaleTimeString();
    });

    mapState.unitMarkers.forEach((marker, callsign) => {
        if (visibleIds.has(callsign)) return;
        marker.removeFromParent();
        mapState.unitMarkers.delete(callsign);
    });
}

function normalizeUnitKeyForMap(value) {
    return String(value || "").trim().toUpperCase();
}

async function fetchLiveUnitGpsRowsViaFunction() {
    const baseUrl = window.supabaseUrl || supabaseUrl;
    const anonKey = window.supabaseKey || supabaseKey;
    const authToken = sessionStorage.getItem("userToken") || anonKey;
    if (!baseUrl || !anonKey || !authToken) return null;

    const response = await fetch(`${baseUrl}/functions/v1/list-unit-gps`, {
        method: "GET",
        headers: {
            "apikey": anonKey,
            "Authorization": `Bearer ${authToken}`
        }
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `list-unit-gps failed with ${response.status}`);
    }

    const result = await response.json();
    return Array.isArray(result?.units) ? result.units : [];
}

async function refreshLiveUnitGpsMarkers() {
    const client = getMobileMapSupabaseClient();
    if (!mapState.bounds) return;
    const now = performance.now();
    if (mapState.lastUnitGpsFetch && now - mapState.lastUnitGpsFetch < 2000) return;
    mapState.lastUnitGpsFetch = now;

    try {
        const functionRows = await fetchLiveUnitGpsRowsViaFunction();
        if (Array.isArray(functionRows)) {
            syncLiveUnitGpsMarkers(functionRows);
            setMapStatus(`Map loaded - ${functionRows.length} GPS unit${functionRows.length === 1 ? "" : "s"}`);
            return;
        }
    } catch (error) {
        console.warn("Failed loading unit GPS through edge function, falling back to direct query:", error);
    }

    if (!client) return;

    const { data, error } = await client
        .from("units")
        .select("user, unit, status, inc, incLocation, roblox_username, gps_x, gps_y, gps_z, gps_heading, gps_updated_at")
        .not("gps_x", "is", null)
        .limit(200);

    if (error) {
        console.warn("Failed loading live unit GPS for mobile map:", error);
        setMapStatus("Unit GPS load failed");
        return;
    }

    const unitRows = Array.isArray(data) ? data : [];
    syncLiveUnitGpsMarkers(unitRows);
    if (unitRows.length > 0) {
        setMapStatus(`Map loaded - ${unitRows.length} GPS unit${unitRows.length === 1 ? "" : "s"}`);
    }
}

function ensureMobileMapTooltip(stage) {
    if (mapState.tooltip && stage.contains(mapState.tooltip)) return mapState.tooltip;

    const tooltip = document.createElement("div");
    tooltip.className = "mobile-map-unit-tooltip";
    tooltip.hidden = true;
    stage.appendChild(tooltip);
    mapState.tooltip = tooltip;
    return tooltip;
}

function ensureMobileMapDetailsPanel(stage) {
    if (mapState.detailsPanel && stage.contains(mapState.detailsPanel)) return mapState.detailsPanel;

    const panel = document.createElement("div");
    panel.className = "mobile-map-unit-details";
    panel.hidden = true;
    stage.appendChild(panel);
    mapState.detailsPanel = panel;
    return panel;
}

function getMarkerAtPointer(event, canvas) {
    if (!mapState.camera || !mapState.raycaster || !mapState.pointer) return null;
    const rect = canvas.getBoundingClientRect();
    mapState.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mapState.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    mapState.raycaster.setFromCamera(mapState.pointer, mapState.camera);

    const roots = [
        ...Array.from(mapState.unitMarkers.values()),
        ...Array.from(mapState.incidentMarkers.values())
    ];
    const hits = mapState.raycaster.intersectObjects(roots, true);
    return hits[0]?.object?.userData?.markerRoot || null;
}

function showMobileMapUnitDetails(marker) {
    if (!marker || !mapState.detailsPanel) return;
    const { callsign, status, speedMph, assignment, lastUpdated } = marker.userData;
    if (marker.userData.type === "incident-marker") {
        mapState.detailsPanel.innerHTML = `
        <div class="unit-details-head">
            <strong>${callsign || "Call"}</strong>
            <button type="button" aria-label="Close call details">×</button>
        </div>
        <dl>
            <div><dt>Status</dt><dd>${status || "Pending"}</dd></div>
            <div><dt>Units</dt><dd>${marker.userData.attachedUnits || "None"}</dd></div>
            <div><dt>Priority</dt><dd>${marker.userData.priority || "911"}</dd></div>
            <div><dt>Updated</dt><dd>${lastUpdated || "Now"}</dd></div>
        </dl>
        <button type="button" class="mobile-map-call-details-btn">Open Call Details</button>
    `;
        mapState.detailsPanel.hidden = false;
        mapState.detailsPanel.querySelector(".unit-details-head button")?.addEventListener("click", () => {
            mapState.detailsPanel.hidden = true;
        }, { once: true });
        mapState.detailsPanel.querySelector(".mobile-map-call-details-btn")?.addEventListener("click", () => {
            openMobileMapCallDetails(callsign);
        });
        return;
    }

    mapState.detailsPanel.innerHTML = `
        <div class="unit-details-head">
            <strong>${callsign || "Unit"}</strong>
            <button type="button" aria-label="Close unit details">×</button>
        </div>
        <dl>
            <div><dt>Status</dt><dd>${status || "Unknown"}</dd></div>
            <div><dt>Speed</dt><dd>${speedMph ?? 0} mph</dd></div>
            <div><dt>Assignment</dt><dd>${assignment || "None"}</dd></div>
            <div><dt>Updated</dt><dd>${lastUpdated || "Now"}</dd></div>
        </dl>
    `;
    mapState.detailsPanel.hidden = false;
    mapState.detailsPanel.querySelector("button")?.addEventListener("click", () => {
        mapState.detailsPanel.hidden = true;
    }, { once: true });
}

async function openMobileMapCallDetails(callId) {
    if (!callId) return;

    if (typeof window.openWindowsApp === "function") {
        await window.openWindowsApp("PremierOneMDT");
    }

    if (typeof window.showIncident === "function") {
        await window.showIncident(callId);
    } else if (typeof showIncident === "function") {
        await showIncident(callId);
    }

    const shellWindow = mapState.root?.closest?.(".win-app-window");
    const windowId = shellWindow?.dataset?.windowId;
    if (windowId && typeof window.closeWindow === "function") {
        window.closeWindow(windowId);
    }
}

function updateMobileMapTooltip() {
    if (!mapState.hoveredMarker || !mapState.camera || !mapState.tooltip) return;
    const stage = getMobileMapElement("mobile-map-stage");
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    const projected = mapState.hoveredMarker.position.clone().project(mapState.camera);
    const x = (projected.x * 0.5 + 0.5) * rect.width;
    const y = (-projected.y * 0.5 + 0.5) * rect.height;

    mapState.tooltip.style.left = `${x}px`;
    mapState.tooltip.style.top = `${y - 16}px`;
}

function setupMobileMapUnitHover(canvas, stage) {
    ensureMobileMapTooltip(stage);
    ensureMobileMapDetailsPanel(stage);
    if (!mapState.raycaster) mapState.raycaster = new THREE.Raycaster();
    if (!mapState.pointer) mapState.pointer = new THREE.Vector2();
    if (mapState.pointerMoveAttached) return;

    canvas.addEventListener("pointermove", event => {
        const hitRoot = getMarkerAtPointer(event, canvas);
        mapState.hoveredMarker = hitRoot;

        if (mapState.tooltip) {
        if (hitRoot) {
                mapState.tooltip.textContent = `${hitRoot.userData.callsign} - ${hitRoot.userData.status || "Unit"}`;
                mapState.tooltip.hidden = false;
                updateMobileMapTooltip();
            } else {
                mapState.tooltip.hidden = true;
            }
        }
    });

    canvas.addEventListener("pointerleave", () => {
        mapState.hoveredMarker = null;
        if (mapState.tooltip) mapState.tooltip.hidden = true;
    });

    canvas.addEventListener("click", event => {
        const hitRoot = getMarkerAtPointer(event, canvas);
        if (hitRoot) showMobileMapUnitDetails(hitRoot);
    });

    mapState.pointerMoveAttached = true;
}

function frameMobileMap(mode = "top") {
    if (!mapState.camera || !mapState.controls || !mapState.bounds) return;

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    mapState.bounds.getSize(size);
    mapState.bounds.getCenter(center);

    const span = Math.max(size.x, size.z, size.y * 0.35, 1);
    const height = Math.max(size.y, span * 0.8);

    mapState.viewSize = span * 1.08;
    mapState.camera.position.set(center.x, center.y + height, center.z);

    mapState.camera.near = 0.1;
    mapState.camera.far = span * 10;
    mapState.camera.zoom = THREE.MathUtils.clamp(mapState.camera.zoom || 1, MOBILE_MAP_MIN_ZOOM, MOBILE_MAP_MAX_ZOOM);
    mapState.camera.lookAt(center);
    mapState.camera.updateProjectionMatrix();
    mapState.controls.target.copy(center);
    mapState.controls.update();
    resizeMobileMap();
    applyMobileMapHeading(mode === "north" ? 0 : mapState.heading);
}

function applyMobileMapHeading(heading) {
    mapState.heading = heading;
    if (mapState.mapRoot) mapState.mapRoot.rotation.y = 0;
    if (!mapState.camera || !mapState.controls) return;

    const target = mapState.controls.target;
    const height = Math.max(mapState.camera.position.y - target.y, 1);
    mapState.camera.position.set(target.x, target.y + height, target.z);
    mapState.camera.up.set(Math.sin(mapState.heading), 0, -Math.cos(mapState.heading));
    mapState.camera.lookAt(target);
    mapState.camera.updateMatrixWorld();
}

function centerMobileMapOnPosition(position, zoom = 3.2) {
    if (!position || !mapState.camera || !mapState.controls || !mapState.bounds) return false;

    const targetY = mapState.controls.target.y;
    const height = Math.max(mapState.camera.position.y - targetY, 1);
    mapState.controls.target.set(position.x, targetY, position.z);
    mapState.camera.position.set(position.x, targetY + height, position.z);
    mapState.camera.zoom = THREE.MathUtils.clamp(zoom, MOBILE_MAP_MIN_ZOOM, MOBILE_MAP_MAX_ZOOM);
    mapState.camera.updateProjectionMatrix();
    applyMobileMapHeading(mapState.heading);
    mapState.controls.update();
    updateMobileMapTooltip();
    return true;
}

async function centerMobileMapOnCallPing(callOrId) {
    let call = callOrId;

    if (typeof callOrId === "string") {
        const client = getMobileMapSupabaseClient();
        if (!client) return false;
        const { data, error } = await client
            .from("calls")
            .select("id, created_at, status, location, call_code, prmry, assist, is_closed, ping_x, ping_y, ping_z, ping_radius_miles")
            .eq("id", callOrId)
            .single();
        if (error || !data) return false;
        call = data;
    }

    const position = getCallPingPosition(call);
    if (!position || !mapState.bounds) {
        window.__pendingMobileMapCallPing = call;
        return false;
    }

    const id = String(call?.id || "").trim();
    if (id) {
        const marker = mapState.incidentMarkers.get(id) || createIncidentPingMarker(call);
        marker.position.copy(position);
        marker.userData.callsign = id;
        marker.userData.status = call.status || "Pending";
        marker.userData.assignment = call.location || "911 Ping";
        marker.userData.priority = call.call_code || "911";
        marker.userData.attachedUnits = formatCallAttachedUnits(call);
        marker.userData.lastUpdated = call.created_at || new Date().toLocaleTimeString();
    }
    return centerMobileMapOnPosition(position);
}

function setupMobileMapRotation(canvas) {
    canvas.addEventListener("contextmenu", event => event.preventDefault());

    canvas.addEventListener("pointerdown", event => {
        if (event.button !== 2) return;
        mapState.rotating = true;
        mapState.lastPointerX = event.clientX;
        canvas.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    });

    canvas.addEventListener("pointermove", event => {
        if (!mapState.rotating) return;
        const deltaX = event.clientX - mapState.lastPointerX;
        mapState.lastPointerX = event.clientX;
        applyMobileMapHeading(mapState.heading - deltaX * 0.006);
        event.preventDefault();
    });

    canvas.addEventListener("pointerup", event => {
        if (!mapState.rotating) return;
        mapState.rotating = false;
        canvas.releasePointerCapture?.(event.pointerId);
        event.preventDefault();
    });
}

function renderMobileMap() {
    if (!mapState.renderer || !mapState.scene || !mapState.camera) return;
    mapState.animationId = requestAnimationFrame(renderMobileMap);
    updateFakeMobileMapUnits();
    refreshLiveUnitGpsMarkers();
    refreshIncidentPingMarkers();
    mapState.controls?.update();
    clampMobileMapZoom();
    mapState.renderer.render(mapState.scene, mapState.camera);
}

async function loadMobileMapModel() {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(MAP_MODEL_URL);
    mapState.model = gltf.scene;
    mapState.bounds = new THREE.Box3().setFromObject(mapState.model);
    const center = new THREE.Vector3();
    mapState.bounds.getCenter(center);

    mapState.mapRoot = new THREE.Group();
    mapState.mapRoot.position.copy(center);
    mapState.model.position.sub(center);
    mapState.mapRoot.add(mapState.model);
    mapState.scene.add(mapState.mapRoot);
    frameMobileMap("top");
}

function resetMobileMapRenderer() {
    if (mapState.animationId) {
        cancelAnimationFrame(mapState.animationId);
        mapState.animationId = null;
    }
    if (mapState.renderer) {
        mapState.renderer.dispose();
    }
    if (mapState.resizeObserver) {
        mapState.resizeObserver.disconnect();
        mapState.resizeObserver = null;
    }
    if (mapState.shellWindowElement) {
        mapState.shellWindowElement.removeEventListener("shell-window-resize", queueMobileMapResize);
        mapState.shellWindowElement = null;
    }
    mapState.initialized = false;
    mapState.model = null;
    mapState.renderer = null;
    mapState.scene = null;
    mapState.camera = null;
    mapState.controls = null;
    mapState.mapRoot = null;
    mapState.bounds = null;
    mapState.unitMarkers.forEach(marker => marker.removeFromParent());
    mapState.unitMarkers.clear();
    mapState.incidentMarkers.forEach(marker => marker.removeFromParent());
    mapState.incidentMarkers.clear();
    mapState.fakeUnits = [];
    mapState.lastIncidentPingFetch = 0;
    mapState.lastUnitGpsFetch = 0;
    mapState.hoveredMarker = null;
    if (mapState.tooltip) {
        mapState.tooltip.remove();
        mapState.tooltip = null;
    }
    if (mapState.detailsPanel) {
        mapState.detailsPanel.remove();
        mapState.detailsPanel = null;
    }
    mapState.heading = 0;
    mapState.rotating = false;
    mapState.pointerMoveAttached = false;
}

window.initMobileMapView = async function initMobileMapView(root) {
    mapState.root = root && root.querySelector ? root : null;
    const canvas = getMobileMapElement("mobile-map-canvas");
    const stage = getMobileMapElement("mobile-map-stage");
    if (!canvas || !stage) return;

    if (mapState.initialized && mapState.renderer?.domElement !== canvas) {
        resetMobileMapRenderer();
    }

    if (!mapState.initialized) {
        mapState.scene = new THREE.Scene();
        mapState.scene.background = new THREE.Color(0x303336);

        mapState.camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 10000);
        mapState.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        mapState.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        const ambient = new THREE.AmbientLight(0xffffff, 5);
        const directional = new THREE.DirectionalLight(0xffffff, 3);
        directional.position.set(250, 500, 250);
        mapState.scene.add(ambient, directional);

        mapState.controls = new OrbitControls(mapState.camera, canvas);
        mapState.controls.enableDamping = true;
        mapState.controls.enableRotate = false;
        mapState.controls.minZoom = MOBILE_MAP_MIN_ZOOM;
        mapState.controls.maxZoom = MOBILE_MAP_MAX_ZOOM;
        mapState.controls.zoomSpeed = 2.4;
        mapState.controls.panSpeed = 1.8;
        mapState.controls.screenSpacePanning = true;
        mapState.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
        mapState.controls.mouseButtons.RIGHT = null;
        mapState.controls.touches.ONE = THREE.TOUCH.PAN;
        mapState.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
        setupMobileMapRotation(canvas);
        setupMobileMapUnitHover(canvas, stage);

        window.addEventListener("resize", resizeMobileMap);
        mapState.shellWindowElement = root?.closest?.(".win-app-window") || null;
        mapState.shellWindowElement?.addEventListener("shell-window-resize", queueMobileMapResize);
        if (typeof ResizeObserver !== "undefined") {
            mapState.resizeObserver = new ResizeObserver(() => queueMobileMapResize());
            mapState.resizeObserver.observe(stage);
        }
        mapState.initialized = true;
        resizeMobileMap();
        renderMobileMap();

        try {
            setMapStatus("Loading assets/maps/mobile-map.glb...");
            await loadMobileMapModel();
            await refreshLiveUnitGpsMarkers();
            await refreshIncidentPingMarkers();
            setMapStatus("Map loaded");
        } catch (error) {
            console.error("Failed to load mobile map GLB:", error);
            setMapStatus("Put your GLB at assets/maps/mobile-map.glb");
        }
    }

    resizeMobileMap();
    if (window.__pendingMobileMapCallPing) {
        await centerMobileMapOnCallPing(window.__pendingMobileMapCallPing);
        window.__pendingMobileMapCallPing = null;
    } else {
        frameMobileMap("top");
    }
};

window.resetMobileMapCamera = function resetMobileMapCamera() {
    applyMobileMapHeading(0);
    frameMobileMap("top");
};

window.setMobileMapCameraMode = function setMobileMapCameraMode(mode) {
    if (mode === "north") {
        applyMobileMapHeading(0);
        return;
    }

    frameMobileMap(mode === "tilt" ? "top" : mode);
};

window.centerMobileMapOnCallPing = centerMobileMapOnCallPing;

window.__mobileMapDebugState = function mobileMapDebugState() {
    return {
        initialized: mapState.initialized,
        fakeUnitCount: mapState.fakeUnits.length,
        markerCount: mapState.unitMarkers.size,
        markerCallsigns: Array.from(mapState.unitMarkers.keys()),
        incidentMarkerCount: mapState.incidentMarkers.size,
        incidentMarkerIds: Array.from(mapState.incidentMarkers.keys()),
        hasBounds: !!mapState.bounds
    };
};
