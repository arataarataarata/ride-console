// ==============================
// Ride Console - app.js
// Refactored single-file version
// ==============================

// ==============================
// 01. Constants
// ==============================
const GOOGLE_ROUTES_API_KEY = "AIzaSyA9EP_wOYfkx3CCjc8DWZ69ObxhiOPhyMM";

const DEFAULT_POSITION = {
  lat: 35.681236,
  lng: 139.767125
};

const MINI_MAP = {
  CANVAS_W: 320,
  CANVAS_H: 320,
  BLE_W: 32,
  BLE_H: 32,
  MAP_RANGE_METERS: 500,
  SELF_X_RATIO: 0.5,
  SELF_Y_RATIO: 0.85,
  BLE_SELF_X: 16,
  BLE_SELF_Y: 28,
  MAX_BLE_POINTS: 24,
  LOOK_AHEAD_METERS: 80
};

const ROUTE_DEVIATION_EXTRA_METERS = 10;
const ROUTE_DEVIATION_COUNT_LIMIT = 3;
const STEP_ADVANCE_THRESHOLD_METERS = 20;
const BLE_SEND_INTERVAL_MS = 3000;

const HISTORY_KEY = "rideConsoleDestinationHistory";
const HISTORY_LIMIT = 10;

const MANEUVER_ARROW_MAP = {
  DEPART: 17,
  DESTINATION: 18,
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

const ARROW_LABEL_MAP = {
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
  17: "DP",
  18: "🏁",
  98: "🏁",
  99: "?"
};

const RIDE_CONSOLE_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1d1d1d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#b8b8b8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1d1d1d" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#3a3a3a" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#111111" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#4a3a1a" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f1a22" }] }
];

// ==============================
// 02. State
// ==============================
let map = null;
let autocomplete = null;
let destinationMarker = null;
let currentLocationMarker = null;
let currentAccuracyCircle = null;
let locationWatchId = null;
let routePolyline = null;
let bleNaviSenderTimer = null;
let developerMode = false;

const appState = {
  screen: "home",

  destination: null,
  routeResults: [],
  selectedRouteIndex: 0,
  route: null,
  routePoints: [],

  currentLocation: null,
  latestAccuracy: null,
  locationReady: false,

  currentStepIndex: 0,
  currentStepRemainMeters: null,
  currentArrow: 99,
  nextArrow: 99,
  currentManeuver: "",
  nextManeuver: "",

  routeDeviationMeters: null,
  offRouteCount: 0,
  rerouting: false,
  navigationStarted: false
};

// 旧コード互換用。内部的には appState を正とする。
Object.defineProperty(window, "selectedDestination", {
  get: () => appState.destination,
  set: value => { appState.destination = value; }
});

// ==============================
// 03. Initialization
// ==============================
window.addEventListener("DOMContentLoaded", () => {
  restoreDeveloperMode();
  updateLastRouteDisplay();
  updateHistoryDisplay();

  if (window.BLE) {
    BLE.updateStatusUI();
  }
});

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: DEFAULT_POSITION,
    zoom: 14,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    zoomControl: false,
    gestureHandling: "greedy",
    styles: RIDE_CONSOLE_MAP_STYLE
  });

  setupAutocomplete();
  startLocationWatch();
}

// ==============================
// 04. UI
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

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

// ==============================
// 05. GPS
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
  return appState.currentLocation || DEFAULT_POSITION;
}

// ==============================
// 06. Google Places
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
    const place = autocomplete.getPlace();

    if (!place.geometry || !place.geometry.location) {
      console.warn("No geometry for selected place:", place);
      return;
    }

    appState.destination = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
      name: place.name || place.formatted_address || "Destination"
    };

    updateDestinationMarker(appState.destination);
    map.setCenter(appState.destination);
    map.setZoom(16);

    calculateRoutes();
    updateSearchDebug();
  });
}

function updateDestinationMarker(destination) {
  if (!map || !destination) return;

  if (!destinationMarker) {
    destinationMarker = new google.maps.Marker({
      map,
      title: "Destination"
    });
  }

  destinationMarker.setPosition(destination);
  destinationMarker.setTitle(destination.name);
}

// ==============================
// 07. Routes API
// ==============================
async function calculateRoutes() {
  if (!appState.destination) {
    alert("Please select destination.");
    return;
  }

  clearRoute();

  const origin = getCurrentOrigin();

  const localRoute = await fetchRoute({
    originLat: origin.lat,
    originLng: origin.lng,
    destLat: appState.destination.lat,
    destLng: appState.destination.lng,
    avoidHighways: true,
    avoidTolls: true
  });

  const expressRoute = await fetchRoute({
    originLat: origin.lat,
    originLng: origin.lng,
    destLat: appState.destination.lat,
    destLng: appState.destination.lng,
    avoidHighways: false,
    avoidTolls: false
  });

  appState.routeResults = [
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

  if (appState.routeResults.length === 0) {
    alert("No route found.");
    return;
  }

  appState.selectedRouteIndex = 0;

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
  if (!route?.legs?.[0]?.steps) {
    return [];
  }

  return route.legs[0].steps;
}

// ==============================
// 08. Route Drawing
// ==============================
function clearRoute() {
  if (routePolyline) {
    routePolyline.setMap(null);
    routePolyline = null;
  }

  appState.routeResults = [];
  appState.selectedRouteIndex = 0;
  appState.route = null;
  appState.routePoints = [];
  appState.currentStepIndex = 0;
  appState.currentStepRemainMeters = null;
  appState.routeDeviationMeters = null;
  appState.offRouteCount = 0;
}

function renderRouteCards() {
  const container = document.getElementById("routeOptions");
  if (!container) return;

  container.innerHTML = "";

  appState.routeResults.forEach((item, index) => {
    const minutes = formatDuration(item.route.duration);
    const distance = formatDistance(item.route.distanceMeters);

    const button = document.createElement("button");
    button.className =
      "route-option" + (index === appState.selectedRouteIndex ? " selected" : "");

    button.onclick = () => {
      appState.selectedRouteIndex = index;
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
  const item = appState.routeResults[index];

  if (!item?.route?.polyline?.encodedPolyline) {
    console.warn("No route polyline:", item);
    return;
  }

  if (!google.maps.geometry?.encoding) {
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

  if (appState.destination) {
    bounds.extend(appState.destination);
  }

  map.fitBounds(bounds);
}

// ==============================
// 09. Navigation
// ==============================
function startNavigation() {
  const selected = appState.routeResults[appState.selectedRouteIndex];

  if (!selected?.route) {
    alert("Please select route.");
    return;
  }

  addDestinationHistory({
    name: appState.destination?.name || getDestinationInputValue() || "目的地",
    lat: appState.destination?.lat || null,
    lng: appState.destination?.lng || null,
    useToll: selected.type === "EXPRESS"
  });

  appState.route = selected.route;
  appState.routePoints = decodeRoutePoints(appState.route);

  appState.currentStepIndex = 0;
  appState.currentStepRemainMeters = null;
  appState.offRouteCount = 0;
  appState.routeDeviationMeters = null;
  appState.navigationStarted = true;

  logRouteSteps(appState.route);

  const duration = formatDuration(selected.route.duration);
  const distance = formatDistance(selected.route.distanceMeters);

  setText("naviDistance", "ready");
  setText("naviInstruction", selected.type);
  setText("naviRoad", appState.destination?.name || "Navigation");

  setText("naviNext", "READY");
  setText("naviTotalDistance", distance);
  setText("naviEta", duration);

  updateCurrentStep();
  updateNaviStepDisplay();
  updateNaviDebug(selected);
  drawMiniMap(appState.currentLocation, appState.routePoints);

  startBleNaviSender();
  showScreen("navi");
}

function finishNavigation() {
  stopBleNaviSender();

  if (window.BLE?.isEnabled?.()) {
    BLE.sendText("NAV_END");
  }

  clearRoute();

  appState.navigationStarted = false;

  showScreen("home");
}

function updateNaviStepDisplay() {
  if (!appState.route) return;

  const steps = getRouteSteps(appState.route);
  const index = appState.currentStepIndex || 0;

  const currentStep = steps[index];
  const nextStep = steps[index + 1];

  const currentManeuver = currentStep?.navigationInstruction?.maneuver || "";
  const nextManeuver = nextStep?.navigationInstruction?.maneuver || "";

  const currentArrow = maneuverToArrow(currentManeuver);
  const nextArrow = maneuverToArrow(nextManeuver);

  appState.currentArrow = currentArrow;
  appState.nextArrow = nextArrow;
  appState.currentManeuver = currentManeuver;
  appState.nextManeuver = nextManeuver;

  const left = arrowToLabel(currentArrow);
  const distance = formatStepDistance(appState.currentStepRemainMeters);
  const right = arrowToLabel(nextArrow);

  setText("naviDistance", `${left} ${distance} ${right}`);

  const instruction = currentStep?.navigationInstruction?.instructions || "";
  setText("naviInstruction", instruction);

  const road = appState.destination?.name || "Navigation";
  setText("naviRoad", road);
}

function checkNavigationFinished() {
  if (!appState.route) return;

  const steps = getRouteSteps(appState.route);
  const index = appState.currentStepIndex || 0;

  if (steps.length > 0 && index >= steps.length - 1) {
    finishNavigation();
  }
}

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

  const remainInfo = getRemainingDistanceToStepEnd(
    appState.currentLocation,
    steps[index]
  );

  if (!remainInfo) {
    return;
  }

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

  const currentManeuver = currentStep?.navigationInstruction?.maneuver || "";
  const nextManeuver = nextStep?.navigationInstruction?.maneuver || "";

  appState.currentManeuver = currentManeuver;
  appState.nextManeuver = nextManeuver;
  appState.currentArrow = maneuverToArrow(currentManeuver);
  appState.nextArrow = maneuverToArrow(nextManeuver);

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
      currentArrow: appState.currentArrow,
      nextManeuver,
      nextArrow: appState.nextArrow
    }
  ]);

  updateNaviStepDisplay();
  updateDeveloperPanel();
  checkNavigationFinished();
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

  path.forEach((point, index) => {
    const p = latLngToPlain(point);
    const d = getDistanceMeters(currentLocation, p);

    if (d < nearestDistance) {
      nearestDistance = d;
      nearestIndex = index;
    }
  });

  let routeRemain = 0;

  for (let i = nearestIndex; i < path.length - 1; i++) {
    routeRemain += google.maps.geometry.spherical.computeDistanceBetween(
      path[i],
      path[i + 1]
    );
  }

  const nearestPoint = latLngToPlain(path[nearestIndex]);
  const directRemain = getDistanceMeters(currentLocation, nearestPoint);
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

// ==============================
// 10. Reroute
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
  const threshold = accuracy + ROUTE_DEVIATION_EXTRA_METERS;
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

  if (appState.offRouteCount >= ROUTE_DEVIATION_COUNT_LIMIT) {
    recalculateRoute();
  }
}

async function recalculateRoute() {
  if (appState.rerouting) {
    console.log("Reroute already in progress");
    return;
  }

  if (!appState.currentLocation || !appState.destination) {
    console.warn("Cannot reroute: currentLocation or destination missing");
    return;
  }

  const currentSelected = appState.routeResults[appState.selectedRouteIndex];

  if (!currentSelected) {
    console.warn("Cannot reroute: selected route missing");
    return;
  }

  appState.rerouting = true;

  try {
    console.warn("REROUTE START");
    setText("naviNext", "REROUTING");

    if (window.BLE?.isEnabled?.() && window.BLE?.isConnected?.()) {
      BLE.sendText("REROUTE");
    }

    const useExpress = currentSelected.type === "EXPRESS";

    const newRoute = await fetchRoute({
      originLat: appState.currentLocation.lat,
      originLng: appState.currentLocation.lng,
      destLat: appState.destination.lat,
      destLng: appState.destination.lng,
      avoidHighways: !useExpress,
      avoidTolls: !useExpress
    });

    if (!newRoute) {
      console.warn("REROUTE FAILED");
      setText("naviNext", "REROUTE FAILED");
      return;
    }

    appState.routeResults[appState.selectedRouteIndex].route = newRoute;
    appState.route = newRoute;
    appState.routePoints = decodeRoutePoints(newRoute);

    appState.currentStepIndex = 0;
    appState.currentStepRemainMeters = null;
    appState.offRouteCount = 0;

    drawSelectedRoute(appState.selectedRouteIndex);
    updateCurrentStep();
    updateNaviStepDisplay();
    drawMiniMap(appState.currentLocation, appState.routePoints);

    console.warn("REROUTE DONE");
    setText("naviNext", "REROUTE DONE");

  } finally {
    appState.rerouting = false;
  }
}

// ==============================
// 11. Mini Map
// ==============================
class MiniMap {
  static decodeRoutePoints(route) {
    if (!route?.polyline?.encodedPolyline) return [];

    if (!google.maps.geometry?.encoding) {
      console.error("Google Maps geometry library not loaded");
      return [];
    }

    const path = google.maps.geometry.encoding.decodePath(
      route.polyline.encodedPolyline
    );

    return path.map(point => ({
      lat: point.lat(),
      lng: point.lng()
    }));
  }

  static draw(current, routePoints) {
    const canvas = document.getElementById("miniMap");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    canvas.width = MINI_MAP.CANVAS_W;
    canvas.height = MINI_MAP.CANVAS_H;

    const W = canvas.width;
    const H = canvas.height;
    const scale = W / MINI_MAP.MAP_RANGE_METERS;
    const selfX = W * MINI_MAP.SELF_X_RATIO;
    const selfY = H * MINI_MAP.SELF_Y_RATIO;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, W, H);

    if (!current || !Array.isArray(routePoints) || routePoints.length < 2) {
      MiniMap.drawSelfPoint(ctx, selfX, selfY);
      return;
    }

    const nearestIndex = MiniMap.getNearestRoutePointIndex(current, routePoints);
    const bearing = MiniMap.getBearingToNextRoutePoint(
      current,
      routePoints,
      MINI_MAP.LOOK_AHEAD_METERS
    );

    const cos = Math.cos(bearing);
    const sin = Math.sin(bearing);

    ctx.strokeStyle = "white";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(selfX, selfY);

    let drawn = false;

    for (let i = nearestIndex + 1; i < routePoints.length; i++) {
      const local = MiniMap.toLocalMeters(current, routePoints[i]);

      const rx = local.x * cos - local.y * sin;
      const ry = local.x * sin + local.y * cos;

      const x = selfX + rx * scale;
      const y = selfY - ry * scale;

      ctx.lineTo(x, y);
      drawn = true;
    }

    if (drawn) ctx.stroke();

    MiniMap.drawSelfPoint(ctx, selfX, selfY);
  }

  static toBlePoints(current, routePoints) {
    if (!current || !Array.isArray(routePoints) || routePoints.length < 2) {
      return [];
    }

    const nearestIndex = MiniMap.getNearestRoutePointIndex(current, routePoints);
    const bearing = MiniMap.getBearingToNextRoutePoint(current, routePoints, 40);

    const cos = Math.cos(bearing);
    const sin = Math.sin(bearing);

    const scale = MINI_MAP.BLE_W / MINI_MAP.MAP_RANGE_METERS;
    const mapPoints = [];

    for (let i = nearestIndex; i < routePoints.length; i++) {
      const local = MiniMap.toLocalMeters(current, routePoints[i]);

      const rx = local.x * cos - local.y * sin;
      const ry = local.x * sin + local.y * cos;

      const sx = Math.round(MINI_MAP.BLE_SELF_X + rx * scale);
      const sy = Math.round(MINI_MAP.BLE_SELF_Y - ry * scale);

      if (sx >= 0 && sx <= 31 && sy >= 0 && sy <= 31) {
        mapPoints.push(`${sx},${sy}`);
      }

      if (mapPoints.length >= MINI_MAP.MAX_BLE_POINTS) break;
    }

    return mapPoints;
  }

  static getBearingToNextRoutePoint(
    current,
    routePoints,
    minLookAhead = MINI_MAP.LOOK_AHEAD_METERS
  ) {
    if (!current || !Array.isArray(routePoints) || routePoints.length < 2) {
      return 0;
    }

    const nearestIndex = MiniMap.getNearestRoutePointIndex(current, routePoints);

    let target = null;

    for (let i = nearestIndex + 1; i < routePoints.length; i++) {
      const d = getDistanceMeters(current, routePoints[i]);

      if (d >= minLookAhead) {
        target = routePoints[i];
        break;
      }
    }

    if (!target) {
      target = routePoints[routePoints.length - 1];
    }

    const local = MiniMap.toLocalMeters(current, target);

    return Math.atan2(local.x, local.y);
  }

  static getNearestRoutePointIndex(current, routePoints) {
    if (!current || !Array.isArray(routePoints) || routePoints.length === 0) {
      return 0;
    }

    let nearestIndex = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < routePoints.length; i++) {
      const d = getDistanceMeters(current, routePoints[i]);

      if (d < nearestDist) {
        nearestDist = d;
        nearestIndex = i;
      }
    }

    return nearestIndex;
  }

  static toLocalMeters(origin, point) {
    return {
      x:
        (point.lng - origin.lng) *
        Math.cos(origin.lat * Math.PI / 180) *
        111320,
      y:
        (point.lat - origin.lat) *
        110540
    };
  }

  static drawSelfPoint(ctx, x, y) {
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 既存コード互換ラッパー
function decodeRoutePoints(route) {
  return MiniMap.decodeRoutePoints(route);
}

function drawMiniMap(current, routePoints) {
  MiniMap.draw(current, routePoints);
}

function routePointsToBleMiniMap(current, routePoints) {
  return MiniMap.toBlePoints(current, routePoints);
}

// ==============================
// 12. BLE Sender
// ==============================
function startBleNaviSender() {
  stopBleNaviSender();

  sendCurrentNaviToBle();
  sendCurrentMiniMapToBle();

  bleNaviSenderTimer = setInterval(() => {
    sendCurrentNaviToBle();
    sendCurrentMiniMapToBle();
  }, BLE_SEND_INTERVAL_MS);
}

function stopBleNaviSender() {
  if (bleNaviSenderTimer) {
    clearInterval(bleNaviSenderTimer);
    bleNaviSenderTimer = null;
  }
}

function sendCurrentNaviToBle() {
  if (!window.BLE) return;
  if (!BLE.isEnabled()) return;
  if (!BLE.isConnected()) return;
  if (!appState.route) return;

  updateCurrentStep();

  const steps = getRouteSteps(appState.route);
  const index = appState.currentStepIndex || 0;

  const currentStep = steps[index];
  const nextStep = steps[index + 1];

  if (!currentStep) return;

  const currentManeuver = currentStep?.navigationInstruction?.maneuver || "";
  const nextManeuver = nextStep?.navigationInstruction?.maneuver || "";

  const currentArrow = maneuverToArrow(currentManeuver);
  const nextArrow = maneuverToArrow(nextManeuver);

  const distance = formatStepDistance(
    appState.currentStepRemainMeters ??
    currentStep?.distanceMeters ??
    0
  );

  const instruction = currentStep?.navigationInstruction?.instructions || "";

  const payload =
    `${currentArrow}|${distance}|${nextArrow}|${currentManeuver}|${instruction}`;

  BLE.sendNavigation(payload);
}

function sendCurrentMiniMapToBle() {
  if (!window.BLE) return;
  if (!BLE.isEnabled()) return;
  if (!BLE.isConnected()) return;
  if (!appState.route) return;
  if (!appState.currentLocation) return;
  if (!appState.routePoints || appState.routePoints.length < 2) return;

  const mapPoints = routePointsToBleMiniMap(
    appState.currentLocation,
    appState.routePoints
  );

  if (mapPoints.length < 2) return;

  const payload = `MAP|${mapPoints.join(";")}`;

  BLE.sendText(payload);
}

// ==============================
// 13. Destination History
// ==============================
function getDestinationHistory() {
  const json = localStorage.getItem(HISTORY_KEY);
  if (!json) return [];

  try {
    return JSON.parse(json);
  } catch (e) {
    console.warn("Failed to parse destination history:", e);
    return [];
  }
}

function saveDestinationHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function addDestinationHistory(route) {
  if (!route?.name) return;

  const history = getDestinationHistory();

  const newItem = {
    name: route.name,
    lat: route.lat || null,
    lng: route.lng || null,
    useToll: route.useToll ?? null,
    timestamp: Date.now(),
    favorite: route.favorite || false
  };

  const filtered = history.filter(item => item.name !== newItem.name);
  filtered.unshift(newItem);

  saveDestinationHistory(filtered.slice(0, HISTORY_LIMIT));
  updateHistoryDisplay();
}

function getLastRoute() {
  const history = getDestinationHistory();
  return history.length > 0 ? history[0] : null;
}

function updateHistoryDisplay() {
  updateLastRouteDisplay();

  const listEl = document.getElementById("historyList");
  if (!listEl) return;

  const history = getDestinationHistory();

  if (history.length === 0) {
    listEl.innerHTML = `
      <div class="history-empty">履歴なし</div>
    `;
    return;
  }

  listEl.innerHTML = history.map((item, index) => `
    <div class="history-item">
      <div class="history-main" onclick="startHistoryItem(${index})">
        <div class="history-title">${escapeHtml(item.name)}</div>
        <div class="history-sub">${formatHistoryTime(item.timestamp)}</div>
      </div>
      <button class="history-delete" onclick="deleteHistoryItem(${index})">削除</button>
    </div>
  `).join("");
}

function updateLastRouteDisplay() {
  const el = document.getElementById("lastRouteText");
  if (!el) return;

  const lastRoute = getLastRoute();
  el.textContent = lastRoute ? lastRoute.name : "なし";
}

async function startHistoryItem(index) {
  const history = getDestinationHistory();
  const item = history[index];

  if (!item) return;

  if (!item.lat || !item.lng) {
    console.warn("History item has no coordinates:", item);
    showScreen("map");
    return;
  }

  appState.destination = {
    name: item.name,
    lat: item.lat,
    lng: item.lng
  };

  const input = document.getElementById("destinationInput");
  if (input) {
    input.value = item.name;
  }

  updateDestinationMarker(appState.destination);

  if (map) {
    map.setCenter(appState.destination);
    map.setZoom(16);
  }

  showScreen("map");
  await calculateRoutes();
}

async function startLastRoute() {
  const lastRoute = getLastRoute();

  if (!lastRoute) {
    alert("履歴がありません");
    return;
  }

  const history = getDestinationHistory();
  const index = history.findIndex(item => item.timestamp === lastRoute.timestamp);

  if (index >= 0) {
    await startHistoryItem(index);
  } else {
    showScreen("map");
  }
}

function deleteHistoryItem(index) {
  const history = getDestinationHistory();

  if (!history[index]) return;

  const ok = confirm(`「${history[index].name}」を履歴から削除しますか？`);
  if (!ok) return;

  history.splice(index, 1);

  saveDestinationHistory(history);
  updateHistoryDisplay();
}

function toggleFavoriteHistoryItem(index) {
  const history = getDestinationHistory();

  if (!history[index]) return;

  history[index].favorite = !history[index].favorite;

  saveDestinationHistory(history);
  updateHistoryDisplay();
}

function toggleHistoryList() {
  const el = document.getElementById("historyList");
  if (!el) return;

  el.classList.toggle("open");
}

function formatHistoryTime(timestamp) {
  if (!timestamp) return "";

  const d = new Date(timestamp);

  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
// ==============================
// 14. Developer
// ==============================
function updateDevScreen() {
  updateDeveloperPanel();
}

function updateDeveloperPanel() {
  const steps = appState.route ? getRouteSteps(appState.route) : [];
  const currentStep = steps[appState.currentStepIndex] || null;
  const nextStep = steps[appState.currentStepIndex + 1] || null;

  setText(
    "devLine1",
    [
      "GPS",
      `  ready: ${appState.locationReady}`,
      `  lat: ${appState.currentLocation?.lat ?? "--"}`,
      `  lng: ${appState.currentLocation?.lng ?? "--"}`,
      `  acc: ${appState.latestAccuracy != null ? Math.round(appState.latestAccuracy) + "m" : "--"}`,
      "",
      "ROUTE",
      `  destination: ${appState.destination?.name || "--"}`,
      `  selected: ${appState.routeResults[appState.selectedRouteIndex]?.type || "--"}`,
      `  routeCount: ${appState.routeResults.length}`,
      `  distance: ${appState.route?.distanceMeters ? formatDistance(appState.route.distanceMeters) : "--"}`,
      `  duration: ${appState.route?.duration ? formatDuration(appState.route.duration) : "--"}`,
      `  deviation: ${appState.routeDeviationMeters ?? "--"}m`,
      `  offRouteCount: ${appState.offRouteCount ?? 0}`,
      `  rerouting: ${appState.rerouting ? "true" : "false"}`
    ].join("\n")
  );

  setText(
    "devLine2",
    [
      "NAVI",
      `  started: ${appState.navigationStarted ? "true" : "false"}`,
      `  stepIndex: ${steps.length ? appState.currentStepIndex : "--"}`,
      `  stepTotal: ${steps.length}`,
      `  remain: ${appState.currentStepRemainMeters != null ? Math.round(appState.currentStepRemainMeters) + "m" : "--"}`,
      `  currentManeuver: ${appState.currentManeuver || "--"}`,
      `  nextManeuver: ${appState.nextManeuver || "--"}`,
      `  currentArrow: ${appState.currentArrow ?? "--"} / ${arrowToLabel(appState.currentArrow ?? 99)}`,
      `  nextArrow: ${appState.nextArrow ?? "--"} / ${arrowToLabel(appState.nextArrow ?? 99)}`,
      "",
      "INSTRUCTION",
      `  current: ${currentStep?.navigationInstruction?.instructions || "--"}`,
      `  next: ${nextStep?.navigationInstruction?.instructions || "--"}`,
      "",
      "BLE",
      `  status: ${window.BLE?.getStatus?.() || "--"}`,
      "",
      "STATE",
      JSON.stringify(
        {
          screen: appState.screen,
          locationReady: appState.locationReady,
          currentStepIndex: appState.currentStepIndex,
          routeDeviationMeters: appState.routeDeviationMeters,
          offRouteCount: appState.offRouteCount,
          rerouting: appState.rerouting,
          navigationStarted: appState.navigationStarted
        },
        null,
        2
      )
    ].join("\n")
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

  if (debugRoute && appState.destination) {
    debugRoute.textContent = `DEST: ${appState.destination.name}`;
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

  if (appState.screen === "dev") {
    updateDeveloperPanel();
  }
}

// ==============================
// 15. Utility
// ==============================
function maneuverToArrow(maneuver) {
  if (!maneuver) return 99;
  return MANEUVER_ARROW_MAP[maneuver] ?? 99;
}

function arrowToLabel(arrow) {
  return ARROW_LABEL_MAP[arrow] || "?";
}

function formatStepDistance(meters) {
  if (meters == null) return "--";

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }

  return `${Math.round(meters)}m`;
}

function formatDuration(durationText) {
  if (!durationText) return "--";

  const seconds = Number(String(durationText).replace("s", ""));
  const minutes = Math.round(seconds / 60);

  return `${minutes} min`;
}

function formatDistance(meters) {
  if (meters == null) return "--";

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }

  return `${meters} m`;
}

function getDistanceMeters(a, b) {
  if (!a || !b) return 0;

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

function getDestinationInputValue() {
  const input = document.getElementById("destinationInput");
  return input ? input.value : "";
}

function logRouteSteps(route) {
  const steps = getRouteSteps(route);

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
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ==============================
// 16. Window Exports
// ==============================
window.initMap = initMap;

window.showScreen = showScreen;
window.selectRouteOption = selectRouteOption;

window.calculateRoutes = calculateRoutes;
window.startNavigation = startNavigation;
window.finishNavigation = finishNavigation;

window.toggleDeveloperMode = toggleDeveloperMode;
window.updateDevScreen = updateDevScreen;

window.addDestinationHistory = addDestinationHistory;
window.getDestinationHistory = getDestinationHistory;
window.getLastRoute = getLastRoute;
window.startHistoryItem = startHistoryItem;
window.startLastRoute = startLastRoute;
window.deleteHistoryItem = deleteHistoryItem;
window.toggleFavoriteHistoryItem = toggleFavoriteHistoryItem;
window.toggleHistoryList = toggleHistoryList;
window.updateHistoryDisplay = updateHistoryDisplay;
window.updateLastRouteDisplay = updateLastRouteDisplay;

// デバッグ用
window.appState = appState;
