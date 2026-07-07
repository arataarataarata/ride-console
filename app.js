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

const appState = {
  screen: "HOME",
  route: null,
  destination: null,
  currentLocation: null,
  latestAccuracy: null,
  locationReady: false,
  currentStepIndex: 0,
  currentStepRemainMeters: null
};

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
  cationWatch();
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
   
  setText("naviDistance", distance);
  setText("naviInstruction", selected.type);
  setText("naviRoad", selectedDestination?.name || "Navigation");

  setText("naviNext", "READY");
  setText("naviTotalDistance", distance);
  setText("naviEta", duration);

  updateNaviDebug(selected);
  showScreen("navi");
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

  appState.currentStepRemainMeters = remainInfo.remainMeters;

  // step終端に近づいたら次へ進める
  if (remainInfo.remainMeters < 20 && index < steps.length - 1) {
    index += 1;
    appState.currentStepIndex = index;
  }

  const currentStep = steps[index];
  const nextStep = steps[index + 1];

  const currentManeuver =
    currentStep?.navigationInstruction?.maneuver || "";

  const nextManeuver =
    nextStep?.navigationInstruction?.maneuver || "";

  console.table([
    {
      currentStepIndex: index,
      remain: remainInfo.remainMeters,
      nearestDistance: remainInfo.nearestDistance,
      currentManeuver,
      currentArrow: maneuverToArrow(currentManeuver),
      nextManeuver,
      nextArrow: maneuverToArrow(nextManeuver)
    }
  ]);
}

function getRemainingDistanceToStepEnd(currentLocation, step) {
  if (!currentLocation || !step?.polyline?.encodedPolyline) {
    return null;
  }

  const path = google.maps.geometry.encoding.decodePath(
    step.polyline.encodedPolyline
  );

  if (!path || path.length === 0) {
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

  let remain = 0;

  for (let i = nearestIndex; i < path.length - 1; i++) {
    remain += google.maps.geometry.spherical.computeDistanceBetween(
      path[i],
      path[i + 1]
    );
  }

  const nearestPoint = latLngToPlain(path[nearestIndex]);
  remain += getDistanceMeters(currentLocation, nearestPoint);

  return {
    remainMeters: Math.round(remain),
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
