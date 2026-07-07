// ==============================
// Ride Console - app.js
// ==============================

// API Key
const GOOGLE_ROUTES_API_KEY = "AIzaSyA9EP_wOYfkx3CCjc8DWZ69ObxhiOPhyMM";

// ==============================
// State
// ==============================
let map;
let destinationMarker;
let autocomplete;

let currentLocationMarker = null;
let currentAccuracyCircle = null;
let locationWatchId = null;

let selectedDestination = null;
let routeResults = [];
let selectedRouteIndex = 0;
let routePolyline = null;

let developerMode = false;

const MINI_MAP_W = 320;
const MINI_MAP_H = 320;

const MINI_SELF_X = MINI_MAP_W / 2;   // 160
const MINI_SELF_Y = MINI_MAP_H * 0.85; // 272
const appState = {
  screen: "HOME",
  route: null,
  destination: null,
  currentLocation: null,
  latestAccuracy: null,
  locationReady: false,
  currentStepIndex: 0,
  currentStepRemainMeters: null,
  offRouteCount: 0,
  routeDeviationMeters: null,
  rerouting: false,
  currentArrow: 99,
  nextArrow: 99,
  currentManeuver: "",
  nextManeuver: ""
};
// ==============================
// arrow
// ==============================
const MANEUVER_ARROW_MAP = {
  DEPART: 99,
  DESTINATION: 98,
  STRAIGHT: 3,
  TURN_LEFT: 1,
  TURN_RIGHT: 2,
  TURN_SLIGHT_LEFT: 4,
  TURN_SLIGHT_RIGHT: 5,
  TURN_SHARP_LEFT: 6,
  TURN_SHARP_RIGHT: 7,
  UTURN_LEFT: 8,
  UTURN_RIGHT: 9,
  MERGE: 10,
  RAMP_LEFT: 11,
  RAMP_RIGHT: 12,
  FORK_LEFT: 13,
  FORK_RIGHT: 14,
  ROUNDABOUT_LEFT: 15,
  ROUNDABOUT_RIGHT: 16,
  NAME_CHANGE: 3
};

function maneuverToArrow(maneuver) {
  if (!maneuver) return 99;

  return MANEUVER_ARROW_MAP[maneuver] ?? 99;
}
function arrowToLabel(arrow) {
  const map = {
    1: "L",
    2: "R",
    3: "↑",
    4: "SL",
    5: "SR",
    6: "HL",
    7: "HR",
    8: "U",
    9: "U",
    10: "M",
    11: "RL",
    12: "RR",
    13: "FL",
    14: "FR",
    15: "RA",
    16: "RA",
    98: "🏁",
    99: "DP"
  };

  return map[arrow] || "?";
}

function formatStepDistance(meters) {
  if (meters == null) return "--";

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }

  return `${Math.round(meters)}m`;
}
// ==============================
// Map Style
// ==============================
const rideConsoleMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1d1d1d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#b8b8b8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1d1d1d" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#3a3a3a" }]
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#111111" }]
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#4a3a1a" }]
  },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0f1a22" }]
  }
];

// ==============================
// Init
// ==============================
document.addEventListener("DOMContentLoaded", restoreDeveloperMode);

function initMap() {
  const defaultPosition = {
    lat: 35.681236,
    lng: 139.767125
  };

  map = new google.maps.Map(document.getElementById("map"), {
    center: defaultPosition,
    zoom: 14,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    zoomControl: false,
    gestureHandling: "greedy",
    styles: rideConsoleMapStyle
  });

  setupAutocomplete();
  startLocationWatch();
}

// ==============================
// Places Autocomplete
// ==============================
function setupAutocomplete() {
  const input = document.getElementById("destinationInput");

  if (!input) {
    console.error("destinationInput not found");
    return;
  }

  if (!google.maps.places) {
    console.error("Google Places library not loaded");
    return;
  }

  autocomplete = new google.maps.places.Autocomplete(input, {
    fields: ["place_id", "geometry", "name", "formatted_address"]
  });

  autocomplete.addListener("place_changed", () => {
    console.log("PLACE CHANGED");

    const place = autocomplete.getPlace();

    if (!place.geometry || !place.geometry.location) {
      console.warn("No geometry for selected place:", place);
      return;
    }

    selectedDestination = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
      name: place.name || place.formatted_address || "Destination"
    };

    appState.destination = selectedDestination;

    if (!destinationMarker) {
      destinationMarker = new google.maps.Marker({
        map,
        title: "Destination"
      });
    }

    destinationMarker.setPosition(selectedDestination);
    destinationMarker.setTitle(selectedDestination.name);

    map.setCenter(selectedDestination);
    map.setZoom(16);

    updateSearchDebug();
  });
}

// ==============================
// GPS
// ==============================
function startLocationWatch() {
  if (!navigator.geolocation) {
    console.warn("Geolocation is not supported.");
    showDevLog("GPS not supported");
    return;
  }

  if (locationWatchId !== null) {
    console.log("Location watch already started.");
    return;
  }

  locationWatchId = navigator.geolocation.watchPosition(
    position => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      appState.currentLocation = { lat, lng };
      appState.latestAccuracy = accuracy;
      appState.locationReady = true;

      updateCurrentLocationOnMap(lat, lng, accuracy);
      updateCurrentStep();
      checkRouteDeviation();
      drawMiniMap(appState.currentLocation, appState.routePoints);
      
      showDevLog(
        `GPS lat=${lat.toFixed(6)}, lng=${lng.toFixed(6)}, acc=${Math.round(accuracy)}m`
      );
    },
    error => {
      console.warn("GPS error:", error);
      showDevLog(`GPS error: ${error.code} ${error.message}`);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    }
  );
}

function updateCurrentLocationOnMap(lat, lng, accuracy) {
  if (!map) return;

  const pos = { lat, lng };

  if (!currentLocationMarker) {
    currentLocationMarker = new google.maps.Marker({
      position: pos,
      map,
      title: "Current Location",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: "#ffffff",
        fillOpacity: 1,
        strokeColor: "#000000",
        strokeWeight: 2
      }
    });

    map.setCenter(pos);
    map.setZoom(17);
  } else {
    currentLocationMarker.setPosition(pos);
  }

  if (!currentAccuracyCircle) {
    currentAccuracyCircle = new google.maps.Circle({
      map,
      center: pos,
      radius: accuracy,
      strokeOpacity: 0.4,
      strokeWeight: 1,
      fillOpacity: 0.08
    });
  } else {
    currentAccuracyCircle.setCenter(pos);
    currentAccuracyCircle.setRadius(accuracy);
  }
}

function getCurrentOrigin() {
  if (appState.currentLocation) {
    return appState.currentLocation;
  }

  // GPS未取得時のフォールバック：東京駅
  return {
    lat: 35.681236,
    lng: 139.767125
  };
}

// ==============================
// Routes API
// ==============================
async function calculateRoutes() {
  if (!selectedDestination) {
    alert("Please select destination.");
    return;
  }

  clearRoute();

  const origin = getCurrentOrigin();

  const localRoute = await fetchRoute({
    originLat: origin.lat,
    originLng: origin.lng,
    destLat: selectedDestination.lat,
    destLng: selectedDestination.lng,
    avoidHighways: true,
    avoidTolls: true
  });

  const expressRoute = await fetchRoute({
    originLat: origin.lat,
    originLng: origin.lng,
    destLat: selectedDestination.lat,
    destLng: selectedDestination.lng,
    avoidHighways: false,
    avoidTolls: false
  });

  routeResults = [
    {
      type: "LOCAL",
      badge: "NO TOLL",
      route: localRoute,
      toll: "Free"
    },
    {
      type: "EXPRESS",
      badge: "FAST",
      route: expressRoute,
      toll: "Toll"
    }
  ].filter(item => item.route);

  if (routeResults.length === 0) {
    alert("No route found.");
    return;
  }

  selectedRouteIndex = 0;
  renderRouteCards();
  drawSelectedRoute(0);
}

async function fetchRoute({
  originLat,
  originLng,
  destLat,
  destLng,
  avoidHighways,
  avoidTolls
}) {
  const url = "https://routes.googleapis.com/directions/v2:computeRoutes";

  const body = {
    origin: {
      location: {
        latLng: {
          latitude: originLat,
          longitude: originLng
        }
      }
    },
    destination: {
      location: {
        latLng: {
          latitude: destLat,
          longitude: destLng
        }
      }
    },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    computeAlternativeRoutes: false,
    routeModifiers: {
      avoidHighways,
      avoidTolls
    },
    languageCode: "ja-JP",
    units: "METRIC"
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_ROUTES_API_KEY,
        "X-Goog-FieldMask": [
        "routes.distanceMeters",
        "routes.duration",
        "routes.polyline.encodedPolyline",
        "routes.travelAdvisory.tollInfo",

  // step取得
        "routes.legs.steps.distanceMeters",
        "routes.legs.steps.staticDuration",
        "routes.legs.steps.polyline.encodedPolyline",
        "routes.legs.steps.navigationInstruction"
        ].join(",")
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Routes API error:", errorText);
      return null;
    }

    const data = await response.json();
    console.log("Routes API response:", data);
    
    if (data.routes && data.routes[0]?.legs?.[0]?.steps) {
      console.log("Route steps:", data.routes[0].legs[0].steps);
    }
    
    if (!data.routes || data.routes.length === 0) {
      return null;
    }

    return data.routes[0];
  } catch (error) {
    console.error("fetchRoute failed:", error);
    return null;
  }
}

function getRouteSteps(route) {
  if (!route || !route.legs || !route.legs[0] || !route.legs[0].steps) {
    return [];
  }

  return route.legs[0].steps;
}

// ==============================
// Route Drawing
// ==============================
function clearRoute() {
  if (routePolyline) {
    routePolyline.setMap(null);
    routePolyline = null;
  }

  routeResults = [];
  selectedRouteIndex = 0;
}

function renderRouteCards() {
  const container = document.getElementById("routeOptions");
  if (!container) return;

  container.innerHTML = "";

  routeResults.forEach((item, index) => {
    const minutes = formatDuration(item.route.duration);
    const distance = formatDistance(item.route.distanceMeters);

    const button = document.createElement("button");
    button.className =
      "route-option" + (index === selectedRouteIndex ? " selected" : "");

    button.onclick = () => {
      selectedRouteIndex = index;
      drawSelectedRoute(index);

      document.querySelectorAll(".route-option").forEach(btn => {
        btn.classList.remove("selected");
      });

      button.classList.add("selected");
    };

    button.innerHTML = `
      <div class="route-option-top">
        <div class="route-name">${item.type}</div>
        <div class="route-badge ${item.type === "EXPRESS" ? "express" : ""}">
          ${item.badge}
        </div>
      </div>
      <div class="route-main">${minutes}</div>
      <div class="route-meta">
        <span>${distance}</span>
        <span>${item.toll}</span>
      </div>
    `;

    container.appendChild(button);
  });
}

function drawSelectedRoute(index) {
  const item = routeResults[index];

  if (!item || !item.route || !item.route.polyline) {
    console.warn("No route polyline:", item);
    return;
  }

  if (!google.maps.geometry || !google.maps.geometry.encoding) {
    console.error("Google Maps geometry library not loaded");
    return;
  }

  if (routePolyline) {
    routePolyline.setMap(null);
  }

  const encoded = item.route.polyline.encodedPolyline;
  const path = google.maps.geometry.encoding.decodePath(encoded);

  routePolyline = new google.maps.Polyline({
    path,
    map,
    strokeColor: item.type === "EXPRESS" ? "#4285f4" : "#ffb000",
    strokeOpacity: 0.95,
    strokeWeight: 6
  });

  const bounds = new google.maps.LatLngBounds();
  path.forEach(point => bounds.extend(point));

  if (appState.currentLocation) {
    bounds.extend(appState.currentLocation);
  }

  if (selectedDestination) {
    bounds.extend(selectedDestination);
  }

  map.fitBounds(bounds);
}

// ==============================
// Navigation
// ==============================
function startNavigation() {
  const selected = routeResults[selectedRouteIndex];

  if (!selected || !selected.route) {
    alert("Please select route.");
    return;
  }

  const duration = formatDuration(selected.route.duration);
  const distance = formatDistance(selected.route.distanceMeters);

  appState.route = selected.route;

  const encoded = appState.route.polyline.encodedPolyline;
  const path = google.maps.geometry.encoding.decodePath(encoded);

  appState.routePoints = path.map(p => ({
    lat: p.lat(),
    lng: p.lng()
  }));

  appState.currentStepIndex = 0;
  appState.currentStepRemainMeters = null;

  updateCurrentStep();

  const steps = getRouteSteps(selected.route);

  console.table(
    steps.map((step, index) => {
      const maneuver = step.navigationInstruction?.maneuver || "";
      return {
        index,
        distance: step.distanceMeters,
        maneuver,
        arrow: maneuverToArrow(maneuver),
        instruction: step.navigationInstruction?.instructions || ""
      };
    })
  );

  setText("naviDistance", "ready");
  setText("naviInstruction", selected.type);
  setText("naviRoad", selectedDestination?.name || "Navigation");

  setText("naviNext", "READY");
  setText("naviTotalDistance", distance);
  setText("naviEta", duration);

  updateCurrentStep();
  updateNaviStepDisplay();
  updateNaviDebug(selected);

  showScreen("navi");

  drawMiniMap(appState.currentLocation, appState.routePoints);
}

function updateNaviStepDisplay() {
  if (!appState.route) return;

  const steps = getRouteSteps(appState.route);
  const index = appState.currentStepIndex || 0;

  const currentStep = steps[index];
  const nextStep = steps[index + 1];

  const currentManeuver =
    currentStep?.navigationInstruction?.maneuver || "";

  const nextManeuver =
    nextStep?.navigationInstruction?.maneuver || "";

  const currentArrow = maneuverToArrow(currentManeuver);
  const nextArrow = maneuverToArrow(nextManeuver);

  const left = arrowToLabel(currentArrow);
  const distance = formatStepDistance(appState.currentStepRemainMeters);
  const right = arrowToLabel(nextArrow);

  setText("naviDistance", `${left} ${distance} ${right}`);

  const instruction =
    currentStep?.navigationInstruction?.instructions || "";

  setText("naviInstruction", instruction);
}

// ==============================
// re-route
// ==============================
function checkRouteDeviation() {
  if (!appState.route || !appState.currentLocation) {
    return;
  }

  if (!appState.route.polyline?.encodedPolyline) {
    return;
  }

  const path = google.maps.geometry.encoding.decodePath(
    appState.route.polyline.encodedPolyline
  );

  if (!path || path.length < 2) {
    return;
  }

  let minDistance = Infinity;

  path.forEach(point => {
    const p = latLngToPlain(point);
    const d = getDistanceMeters(appState.currentLocation, p);

    if (d < minDistance) {
      minDistance = d;
    }
  });

  appState.routeDeviationMeters = Math.round(minDistance);

  const accuracy = appState.latestAccuracy || 0;
  const threshold = accuracy + 10;

  const isOffRoute = minDistance > threshold;

  if (isOffRoute) {
    appState.offRouteCount += 1;
  } else {
    appState.offRouteCount = 0;
  }

  console.table([
    {
      deviation: Math.round(minDistance),
      accuracy: Math.round(accuracy),
      threshold: Math.round(threshold),
      offRoute: isOffRoute,
      offRouteCount: appState.offRouteCount
    }
  ]);
  if (appState.offRouteCount >= 3) {
    recalculateRoute();
  }
}

async function recalculateRoute() {
  if (appState.rerouting) {
    console.log("Reroute already in progress");
    return;
  }

  if (!appState.currentLocation || !selectedDestination) {
    console.warn("Cannot reroute: currentLocation or destination missing");
    return;
  }

  const currentSelected = routeResults[selectedRouteIndex];

  if (!currentSelected) {
    console.warn("Cannot reroute: selected route missing");
    return;
  }

  appState.rerouting = true;

  try {
    console.warn("REROUTE START");

    setText("naviNext", "REROUTING");

    const useExpress = currentSelected.type === "EXPRESS";

    const newRoute = await fetchRoute({
      originLat: appState.currentLocation.lat,
      originLng: appState.currentLocation.lng,
      destLat: selectedDestination.lat,
      destLng: selectedDestination.lng,
      avoidHighways: !useExpress,
      avoidTolls: !useExpress
    });

    if (!newRoute) {
      console.warn("REROUTE FAILED");
      setText("naviNext", "REROUTE FAILED");
      return;
    }

    routeResults[selectedRouteIndex].route = newRoute;
    appState.route = newRoute;
    appState.currentStepIndex = 0;
    appState.currentStepRemainMeters = null;
    appState.offRouteCount = 0;

    drawSelectedRoute(selectedRouteIndex);
    updateCurrentStep();
    updateNaviStepDisplay();

    console.warn("REROUTE DONE");
    setText("naviNext", "REROUTE DONE");

  } finally {
    appState.rerouting = false;
  }
}

// ==============================
// Mini Map
// ==============================
function getBearingToNextRoutePoint(current, routePoints, minLookAhead = 40) {
  if (!current || !Array.isArray(routePoints) || routePoints.length < 2) {
    return 0;
  }

  // 1. 現在地に一番近いルート点を探す
  let nearestIndex = 0;
  let nearestDist = Infinity;

  for (let i = 0; i < routePoints.length; i++) {
    const d = getDistanceMeters(current, routePoints[i]);
    if (d < nearestDist) {
      nearestDist = d;
      nearestIndex = i;
    }
  }

  // 2. 近すぎる点ではなく、ある程度先の点を探す
  let target = null;

  for (let i = nearestIndex + 1; i < routePoints.length; i++) {
    const d = getDistanceMeters(current, routePoints[i]);

    if (d >= minLookAhead) {
      target = routePoints[i];
      break;
    }
  }

  // 3. 見つからなければ最後の点
  if (!target) {
    target = routePoints[routePoints.length - 1];
  }

  const dx =
    (target.lng - current.lng) *
    Math.cos(current.lat * Math.PI / 180) *
    111320;

  const dy =
    (target.lat - current.lat) *
    110540;

  // 画面座標系に合わせるため、ここでは atan2(dx, dy)
  return Math.atan2(dx, dy);
}
function drawMiniMap(current, routePoints) {
  const canvas = document.getElementById("miniMap");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  canvas.width = 320;
  canvas.height = 320;

  const W = canvas.width;
  const H = canvas.height;

  const selfX = W / 2;
  const selfY = H * 0.85;

  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, W, H);

  if (!current || !Array.isArray(routePoints) || routePoints.length < 2) {
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(selfX, selfY, 10, 0, Math.PI * 2);
    ctx.fill();

    console.warn("drawMiniMap skipped:", {
      current,
      routePoints
    });

    return;
  }

  const bearing = getBearingToNextRoutePoint(current, routePoints, 80);

  const cos = Math.cos(-bearing);
  const sin = Math.sin(-bearing);

  const scale = 1.2;

  ctx.strokeStyle = "white";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();

  let started = false;

  let nearestIndex = 0;
　let nearestDist = Infinity;

　for (let i = 0; i < routePoints.length; i++) {
  　const d = getDistanceMeters(current, routePoints[i]);
  　if (d < nearestDist) {
    　nearestDist = d;
    　nearestIndex = i;
  　}
　}
// ==============================
// UI
// ==============================
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  const target = document.getElementById(`screen-${name}`);
  if (target) {
    target.classList.add("active");
  }

  appState.screen = name;
  if (name === "dev") {
    updateDevScreen();
  }
}

function selectRouteOption(selectedButton) {
  document.querySelectorAll(".route-option").forEach(button => {
    button.classList.remove("selected");
  });

  selectedButton.classList.add("selected");
}

// ==============================
// Developer Mode
// ==============================
function updateDevScreen() {
  const steps = appState.route ? getRouteSteps(appState.route) : [];
  const currentStep = steps[appState.currentStepIndex] || null;
  const nextStep = steps[appState.currentStepIndex + 1] || null;

  setText(
    "devScreenGps",
    [
      `locationReady: ${appState.locationReady}`,
      `lat: ${appState.currentLocation?.lat ?? "--"}`,
      `lng: ${appState.currentLocation?.lng ?? "--"}`,
      `accuracy: ${appState.latestAccuracy != null ? Math.round(appState.latestAccuracy) + "m" : "--"}`
    ].join("\n")
  );

  setText(
    "devScreenRoute",
    [
      `destination: ${selectedDestination?.name || "--"}`,
      `routeSelected: ${routeResults[selectedRouteIndex]?.type || "--"}`,
      `routeCount: ${routeResults.length}`,
      `distance: ${appState.route?.distanceMeters ? formatDistance(appState.route.distanceMeters) : "--"}`,
      `duration: ${appState.route?.duration ? formatDuration(appState.route.duration) : "--"}`,
      `deviation: ${appState.routeDeviationMeters ?? "--"}m`,
      `offRouteCount: ${appState.offRouteCount ?? 0}`,
      `rerouting: ${appState.rerouting ? "true" : "false"}`
    ].join("\n")
  );

  setText(
    "devScreenStep",
    [
      `stepIndex: ${steps.length ? appState.currentStepIndex : "--"}`,
      `stepTotal: ${steps.length}`,
      `remain: ${appState.currentStepRemainMeters != null ? Math.round(appState.currentStepRemainMeters) + "m" : "--"}`,
      `currentManeuver: ${appState.currentManeuver || "--"}`,
      `nextManeuver: ${appState.nextManeuver || "--"}`,
      `currentArrow: ${appState.currentArrow ?? "--"}`,
      `nextArrow: ${appState.nextArrow ?? "--"}`
    ].join("\n")
  );

  setText(
    "devScreenNavi",
    [
      `display: ${arrowToLabel(appState.currentArrow ?? 99)} ${formatStepDistance(appState.currentStepRemainMeters)} ${arrowToLabel(appState.nextArrow ?? 99)}`,
      `instruction: ${currentStep?.navigationInstruction?.instructions || "--"}`,
      `nextInstruction: ${nextStep?.navigationInstruction?.instructions || "--"}`
    ].join("\n")
  );

  setText(
    "devScreenBle",
    [
      `bleConnected: --`,
      `lastPacket: --`,
      `sendStatus: not implemented`
    ].join("\n")
  );

  setText(
    "devScreenState",
    JSON.stringify(
      {
        screen: appState.screen,
        locationReady: appState.locationReady,
        currentStepIndex: appState.currentStepIndex,
        routeDeviationMeters: appState.routeDeviationMeters,
        offRouteCount: appState.offRouteCount,
        rerouting: appState.rerouting
      },
      null,
      2
    )
  );
}

function toggleDeveloperMode() {
  developerMode = !developerMode;
  document.body.classList.toggle("dev-mode", developerMode);
  localStorage.setItem("rideConsoleDeveloperMode", developerMode ? "1" : "0");
}

function restoreDeveloperMode() {
  developerMode = localStorage.getItem("rideConsoleDeveloperMode") === "1";
  document.body.classList.toggle("dev-mode", developerMode);
}

function updateSearchDebug() {
  const debugMap = document.getElementById("debugMapStatus");
  const debugRoute = document.getElementById("debugRouteStatus");

  if (debugMap) {
    debugMap.textContent = "MAP: PLACE SELECTED";
  }

  if (debugRoute && selectedDestination) {
    debugRoute.textContent = `DEST: ${selectedDestination.name}`;
  }
}

function updateNaviDebug(selected) {
  const debugPanels = document.querySelectorAll("#screen-navi .debug-panel div");

  if (!debugPanels || debugPanels.length < 3) return;

  debugPanels[1].textContent = `ROUTE: ${selected.type}`;
  debugPanels[2].textContent = "SEND: READY";
}

function showDevLog(text) {
  console.log(text);

  const debugGps = document.getElementById("debugGpsStatus");
  if (debugGps) {
    debugGps.textContent = text;
  }
}
function updateDeveloperPanel() {
  setText(
    "devLine1",
    `GPS:${appState.latestAccuracy != null ? Math.round(appState.latestAccuracy) : "--"}m   `
    + `DEV:${appState.routeDeviationMeters ?? "--"}m   `
    + `OFF:${appState.offRouteCount ?? 0}   `
    + `STEP:${(appState.currentStepIndex ?? 0) + 1}`
  );

  setText(
    "devLine2",
    `${arrowToLabel(appState.currentArrow ?? 99)}→${arrowToLabel(appState.nextArrow ?? 99)}   `
    + `${formatStepDistance(appState.currentStepRemainMeters)}   `
    + `${appState.currentManeuver || "--"}`
  );
}

// ==============================
// Utility
// ==============================
function updateCurrentStep() {
  if (!appState.route || !appState.currentLocation) {
    return;
  }

  const steps = getRouteSteps(appState.route);

  if (!steps.length) {
    return;
  }

  let index = appState.currentStepIndex || 0;

  if (index >= steps.length) {
    index = steps.length - 1;
  }

  const step = steps[index];
  const remainInfo = getRemainingDistanceToStepEnd(
    appState.currentLocation,
    step
  );

  if (!remainInfo) {
    return;
  }

  const STEP_ADVANCE_THRESHOLD_METERS = 20;

  if (
    remainInfo.routeRemain < STEP_ADVANCE_THRESHOLD_METERS &&
    index < steps.length - 1
  ) {
    index += 1;
    appState.currentStepIndex = index;

    const nextRemainInfo = getRemainingDistanceToStepEnd(
      appState.currentLocation,
      steps[index]
    );

    if (nextRemainInfo) {
      appState.currentStepRemainMeters = nextRemainInfo.remainMeters;
    }
  } else {
    appState.currentStepRemainMeters = remainInfo.remainMeters;
  }

  const currentStep = steps[index];
  const nextStep = steps[index + 1];

  const currentManeuver =
    currentStep?.navigationInstruction?.maneuver || "";

  const nextManeuver =
    nextStep?.navigationInstruction?.maneuver || "";

  const currentArrow = maneuverToArrow(currentManeuver);
  const nextArrow = maneuverToArrow(nextManeuver);

  appState.currentArrow = currentArrow;
  appState.nextArrow = nextArrow;
  appState.currentManeuver = currentManeuver;
  appState.nextManeuver = nextManeuver;

  console.table([
    {
      currentStepIndex: index,
      remain: appState.currentStepRemainMeters,
      routeRemain: remainInfo.routeRemain,
      directRemain: remainInfo.directRemain,
      nearestDistance: remainInfo.nearestDistance,
      nearestIndex: remainInfo.nearestIndex,
      pointCount: remainInfo.pointCount,
      currentManeuver,
      currentArrow,
      nextManeuver,
      nextArrow
    }
  ]);

  updateNaviStepDisplay();
  updateDeveloperPanel();
}
function getRemainingDistanceToStepEnd(currentLocation, step) {
  if (!currentLocation || !step?.polyline?.encodedPolyline) {
    return null;
  }

  const path = google.maps.geometry.encoding.decodePath(
    step.polyline.encodedPolyline
  );

  if (!path || path.length < 2) {
    return null;
  }

  let nearestIndex = 0;
  let nearestDistance = Infinity;

  // 1. 現在地に最も近いpolyline点を探す
  path.forEach((point, index) => {
    const p = latLngToPlain(point);
    const d = getDistanceMeters(currentLocation, p);

    if (d < nearestDistance) {
      nearestDistance = d;
      nearestIndex = index;
    }
  });

  // 2. 最寄点からstep終端までのpolyline距離
  let routeRemain = 0;

  for (let i = nearestIndex; i < path.length - 1; i++) {
    routeRemain += google.maps.geometry.spherical.computeDistanceBetween(
      path[i],
      path[i + 1]
    );
  }

  // 3. 現在地から最寄点までの直線距離
  const nearestPoint = latLngToPlain(path[nearestIndex]);
  const directRemain = getDistanceMeters(currentLocation, nearestPoint);

  // 4. 旧ソフト方式：polyline残距離 + 現在地ズレ補正
  const remainMeters = routeRemain + directRemain;

  return {
    remainMeters: Math.round(remainMeters),
    routeRemain: Math.round(routeRemain),
    directRemain: Math.round(directRemain),
    nearestDistance: Math.round(nearestDistance),
    nearestIndex,
    pointCount: path.length
  };
}
function getDistanceMeters(a, b) {
  return google.maps.geometry.spherical.computeDistanceBetween(
    new google.maps.LatLng(a.lat, a.lng),
    new google.maps.LatLng(b.lat, b.lng)
  );
}

function latLngToPlain(point) {
  return {
    lat: point.lat(),
    lng: point.lng()
  };
}

function formatDuration(durationText) {
  if (!durationText) return "--";

  const seconds = Number(durationText.replace("s", ""));
  const minutes = Math.round(seconds / 60);

  return `${minutes} min`;
}

function formatDistance(meters) {
  if (!meters && meters !== 0) return "--";

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }

  return `${meters} m`;
}

function setText(id, text) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = text;
  }
}

// ==============================
// Expose functions
// ==============================
window.initMap = initMap;
window.showScreen = showScreen;
window.toggleDeveloperMode = toggleDeveloperMode;
window.selectRouteOption = selectRouteOption;
window.calculateRoutes = calculateRoutes;
window.startNavigation = startNavigation;
window.updateDevScreen = updateDevScreen;
