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

appState.map = {
    googleMap:null,
    autocomplete:null,
    destinationMarker:null,
    currentLocationMarker:null,
    accuracyCircle:null,
    routePolyline:null
}

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
  MapManager.createMap("map", DEFAULT_POSITION);

  setupAutocomplete();
  startLocationWatch();
}

// ==============================
// 04. UI Manager
// ==============================
class UIManager {
  static showScreen(name) {
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

  static setText(id, text) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = text;
    }
  }

  static selectRouteOption(selectedButton) {
    document.querySelectorAll(".route-option").forEach(button => {
      button.classList.remove("selected");
    });

    selectedButton.classList.add("selected");
  }

static updateDestinationMarker(destination) {
  return MapManager.updateDestinationMarker(destination);
}

static updateCurrentLocationOnMap(lat, lng, accuracy) {
  return MapManager.updateCurrentLocation(lat, lng, accuracy);
}
  static updateNavigationHeader({
    distanceText,
    instructionText,
    roadText,
    nextText,
    totalDistanceText,
    etaText
  }) {
    if (distanceText != null) UIManager.setText("naviDistance", distanceText);
    if (instructionText != null) UIManager.setText("naviInstruction", instructionText);
    if (roadText != null) UIManager.setText("naviRoad", roadText);
    if (nextText != null) UIManager.setText("naviNext", nextText);
    if (totalDistanceText != null) UIManager.setText("naviTotalDistance", totalDistanceText);
    if (etaText != null) UIManager.setText("naviEta", etaText);
  }

  static updateSearchDebug() {
    const debugMap = document.getElementById("debugMapStatus");
    const debugRoute = document.getElementById("debugRouteStatus");

    if (debugMap) {
      debugMap.textContent = "MAP: PLACE SELECTED";
    }

    if (debugRoute && appState.destination) {
      debugRoute.textContent = `DEST: ${appState.destination.name}`;
    }
  }

  static updateNaviDebug(selected) {
    const debugPanels = document.querySelectorAll("#screen-navi .debug-panel div");

    if (!debugPanels || debugPanels.length < 3) return;

    debugPanels[1].textContent = `ROUTE: ${selected.type}`;
    debugPanels[2].textContent = "SEND: READY";
  }
}

// 既存コード互換ラッパー
function showScreen(name) {
  return UIManager.showScreen(name);
}

function setText(id, text) {
  return UIManager.setText(id, text);
}

function selectRouteOption(selectedButton) {
  return UIManager.selectRouteOption(selectedButton);
}

function updateDestinationMarker(destination) {
  return UIManager.updateDestinationMarker(destination);
}

function updateCurrentLocationOnMap(lat, lng, accuracy) {
  return UIManager.updateCurrentLocationOnMap(lat, lng, accuracy);
}

function updateSearchDebug() {
  return UIManager.updateSearchDebug();
}

function updateNaviDebug(selected) {
  return UIManager.updateNaviDebug(selected);
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

    MapManager.updateDestinationMarker(appState.destination);
    MapManager.centerOnDestination(appState.destination);

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
// 06.5 Map Manager
// ==============================
class MapManager {
  static createMap(elementId, center = DEFAULT_POSITION) {
    const el = document.getElementById(elementId);
    if (!el) {
      console.error(`${elementId} not found`);
      return null;
    }

    appState.map.googleMap = new google.maps.Map(el, {
      center,
      zoom: 14,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: false,
      gestureHandling: "greedy",
      styles: RIDE_CONSOLE_MAP_STYLE
    });

    return appState.map.googleMap;
  }

  static getMap() {
    return appState.map.googleMap;
  }

  static updateDestinationMarker(destination) {
    const googleMap = MapManager.getMap();
    if (!googleMap || !destination) return;

    if (!appState.map.destinationMarker) {
      appState.map.destinationMarker = new google.maps.Marker({
        map: googleMap,
        title: "Destination"
      });
    }

    appState.map.destinationMarker.setPosition(destination);
    appState.map.destinationMarker.setTitle(destination.name);
  }

  static updateCurrentLocation(lat, lng, accuracy) {
    const googleMap = MapManager.getMap();
    if (!googleMap) return;

    const pos = { lat, lng };

    if (!appState.map.currentLocationMarker) {
      appState.map.currentLocationMarker = new google.maps.Marker({
        position: pos,
        map: googleMap,
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

      googleMap.setCenter(pos);
      googleMap.setZoom(17);
    } else {
      appState.map.currentLocationMarker.setPosition(pos);
    }

    if (!appState.map.accuracyCircle) {
      appState.map.accuracyCircle = new google.maps.Circle({
        map: googleMap,
        center: pos,
        radius: accuracy,
        strokeOpacity: 0.4,
        strokeWeight: 1,
        fillOpacity: 0.08
      });
    } else {
      appState.map.accuracyCircle.setCenter(pos);
      appState.map.accuracyCircle.setRadius(accuracy);
    }
  }

  static drawRoute(routeItem) {
    const googleMap = MapManager.getMap();

    if (!googleMap) return;

    if (!routeItem?.route?.polyline?.encodedPolyline) {
      console.warn("No route polyline:", routeItem);
      return;
    }

    if (!google.maps.geometry?.encoding) {
      console.error("Google Maps geometry library not loaded");
      return;
    }

    MapManager.clearRoutePolyline();

    const encoded = routeItem.route.polyline.encodedPolyline;
    const path = google.maps.geometry.encoding.decodePath(encoded);

    appState.map.routePolyline = new google.maps.Polyline({
      path,
      map: googleMap,
      strokeColor: routeItem.type === "EXPRESS" ? "#4285f4" : "#ffb000",
      strokeOpacity: 0.95,
      strokeWeight: 6
    });

    MapManager.fitRouteBounds(path);
  }

  static clearRoutePolyline() {
    if (appState.map.routePolyline) {
      appState.map.routePolyline.setMap(null);
      appState.map.routePolyline = null;
    }
  }

  static fitRouteBounds(path) {
    const googleMap = MapManager.getMap();

    if (!googleMap || !path?.length) return;

    const bounds = new google.maps.LatLngBounds();

    path.forEach(point => bounds.extend(point));

    if (appState.currentLocation) {
      bounds.extend(appState.currentLocation);
    }

    if (appState.destination) {
      bounds.extend(appState.destination);
    }

    googleMap.fitBounds(bounds);
  }

  static centerOnDestination(destination) {
    const googleMap = MapManager.getMap();

    if (!googleMap || !destination) return;

    googleMap.setCenter(destination);
    googleMap.setZoom(16);
  }
}
// ==============================
// 07. Route Manager
// ==============================
class RouteManager {
  static async calculateRoutes() {
    if (!appState.destination) {
      alert("Please select destination.");
      return;
    }

    RouteManager.clearRoute();

    const origin = getCurrentOrigin();

    const localRoute = await RouteManager.fetchRoute({
      originLat: origin.lat,
      originLng: origin.lng,
      destLat: appState.destination.lat,
      destLng: appState.destination.lng,
      avoidHighways: true,
      avoidTolls: true
    });

    const expressRoute = await RouteManager.fetchRoute({
      originLat: origin.lat,
      originLng: origin.lng,
      destLat: appState.destination.lat,
      destLng: appState.destination.lng,
      avoidHighways: false,
      avoidTolls: false
    });

    appState.routeResults = [
      { type: "LOCAL", badge: "NO TOLL", route: localRoute, toll: "Free" },
      { type: "EXPRESS", badge: "FAST", route: expressRoute, toll: "Toll" }
    ].filter(item => item.route);

    if (appState.routeResults.length === 0) {
      alert("No route found.");
      return;
    }

    appState.selectedRouteIndex = 0;

    RouteManager.renderRouteCards();
    RouteManager.drawSelectedRoute(0);
  }

  static async fetchRoute({
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

  static getSteps(route) {
    if (!route?.legs?.[0]?.steps) {
      return [];
    }

    return route.legs[0].steps;
  }

  static clearRoute() {
    MapManager.clearRoutePolyline();

    appState.routeResults = [];
    appState.selectedRouteIndex = 0;
    appState.route = null;
    appState.routePoints = [];
    appState.currentStepIndex = 0;
    appState.currentStepRemainMeters = null;
    appState.routeDeviationMeters = null;
    appState.offRouteCount = 0;
  }

  static renderRouteCards() {
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
        RouteManager.drawSelectedRoute(index);

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

static drawSelectedRoute(index) {
  const item = appState.routeResults[index];
  MapManager.drawRoute(item);
}

  static getSelectedRouteItem() {
    return appState.routeResults[appState.selectedRouteIndex] || null;
  }

  static isExpressSelected() {
    const selected = RouteManager.getSelectedRouteItem();
    return selected?.type === "EXPRESS";
  }
}

// 既存コード互換ラッパー
function calculateRoutes() {
  return RouteManager.calculateRoutes();
}

function fetchRoute(params) {
  return RouteManager.fetchRoute(params);
}

function getRouteSteps(route) {
  return RouteManager.getSteps(route);
}

function clearRoute() {
  return RouteManager.clearRoute();
}

function renderRouteCards() {
  return RouteManager.renderRouteCards();
}

function drawSelectedRoute(index) {
  return RouteManager.drawSelectedRoute(index);
}

// ==============================
// 09. Navigation Manager
// ==============================
class NavigationManager {
  static start() {
    const selected = RouteManager.getSelectedRouteItem();

    if (!selected?.route) {
      alert("Please select route.");
      return;
    }

    NavigationManager.saveDestinationToHistory(selected);
    NavigationManager.initializeRoute(selected);
    NavigationManager.updateInitialDisplay(selected);
    NavigationManager.logRouteSteps();

    NavigationManager.updateCurrentStep();
    NavigationManager.updateStepDisplay();

    MiniMap.draw(appState.currentLocation, appState.routePoints);

    startBleNaviSender();
    showScreen("navi");
  }

  static finish() {
    stopBleNaviSender();

    if (window.BLE?.isEnabled?.()) {
      BLE.sendText("NAV_END");
    }

    RouteManager.clearRoute();

    appState.navigationStarted = false;

    showScreen("home");
  }

  static saveDestinationToHistory(selected) {
    addDestinationHistory({
      name: appState.destination?.name || getDestinationInputValue() || "目的地",
      lat: appState.destination?.lat || null,
      lng: appState.destination?.lng || null,
      useToll: selected.type === "EXPRESS"
    });
  }

  static initializeRoute(selected) {
    appState.route = selected.route;
    appState.routePoints = MiniMap.decodeRoutePoints(appState.route);

    appState.currentStepIndex = 0;
    appState.currentStepRemainMeters = null;
    appState.offRouteCount = 0;
    appState.routeDeviationMeters = null;
    appState.navigationStarted = true;
  }

static updateInitialDisplay(selected) {
  const duration = formatDuration(selected.route.duration);
  const distance = formatDistance(selected.route.distanceMeters);

  UIManager.updateNavigationHeader({
    distanceText: "ready",
    instructionText: selected.type,
    roadText: appState.destination?.name || "Navigation",
    nextText: "READY",
    totalDistanceText: distance,
    etaText: duration
  });
}

static updateStepDisplay() {
  if (!appState.route) return;

  const steps = RouteManager.getSteps(appState.route);
  const index = appState.currentStepIndex || 0;

  const currentStep = steps[index];
  const nextStep = steps[index + 1];

  const currentManeuver = currentStep?.navigationInstruction?.maneuver || "";
  const nextManeuver = nextStep?.navigationInstruction?.maneuver || "";

  appState.currentArrow = maneuverToArrow(currentManeuver);
  appState.nextArrow = maneuverToArrow(nextManeuver);
  appState.currentManeuver = currentManeuver;
  appState.nextManeuver = nextManeuver;

  const left = arrowToLabel(appState.currentArrow);
  const distance = formatStepDistance(appState.currentStepRemainMeters);
  const right = arrowToLabel(appState.nextArrow);
  const instruction = currentStep?.navigationInstruction?.instructions || "";

  UIManager.updateNavigationHeader({
    distanceText: `${left} ${distance} ${right}`,
    instructionText: instruction,
    roadText: appState.destination?.name || "Navigation"
  });
}

  static updateCurrentStep() {
    if (!appState.route || !appState.currentLocation) {
      return;
    }

    const steps = RouteManager.getSteps(appState.route);

    if (!steps.length) {
      return;
    }

    let index = appState.currentStepIndex || 0;

    if (index >= steps.length) {
      index = steps.length - 1;
    }

    const remainInfo = NavigationManager.getRemainingDistanceToStepEnd(
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

      const nextRemainInfo = NavigationManager.getRemainingDistanceToStepEnd(
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

    NavigationManager.updateStepDisplay();
    updateDeveloperPanel();
    NavigationManager.checkFinished();
  }

  static getRemainingDistanceToStepEnd(currentLocation, step) {
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

  static checkFinished() {
    if (!appState.route) return;

    const steps = RouteManager.getSteps(appState.route);
    const index = appState.currentStepIndex || 0;

    if (steps.length > 0 && index >= steps.length - 1) {
      NavigationManager.finish();
    }
  }

  static logRouteSteps() {
    const steps = RouteManager.getSteps(appState.route);

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
}

// 既存コード互換ラッパー
function startNavigation() {
  return NavigationManager.start();
}

function finishNavigation() {
  return NavigationManager.finish();
}

function updateNaviStepDisplay() {
  return NavigationManager.updateStepDisplay();
}

function checkNavigationFinished() {
  return NavigationManager.checkFinished();
}

function updateCurrentStep() {
  return NavigationManager.updateCurrentStep();
}

function getRemainingDistanceToStepEnd(currentLocation, step) {
  return NavigationManager.getRemainingDistanceToStepEnd(currentLocation, step);
}

// ==============================
// 10. Reroute Manager
// ==============================
class RerouteManager {
  static checkDeviation() {
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

    const minDistance = RerouteManager.getMinimumDistanceFromRoute(
      appState.currentLocation,
      path
    );

    appState.routeDeviationMeters = Math.round(minDistance);

    const accuracy = appState.latestAccuracy || 0;
    const threshold = accuracy + ROUTE_DEVIATION_EXTRA_METERS;
    const isOffRoute = minDistance > threshold;

    appState.offRouteCount = isOffRoute
      ? appState.offRouteCount + 1
      : 0;

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
      RerouteManager.recalculate();
    }
  }

  static getMinimumDistanceFromRoute(currentLocation, path) {
    let minDistance = Infinity;

    path.forEach(point => {
      const p = latLngToPlain(point);
      const d = getDistanceMeters(currentLocation, p);

      if (d < minDistance) {
        minDistance = d;
      }
    });

    return minDistance;
  }

  static async recalculate() {
    if (appState.rerouting) {
      console.log("Reroute already in progress");
      return;
    }

    if (!appState.currentLocation || !appState.destination) {
      console.warn("Cannot reroute: currentLocation or destination missing");
      return;
    }

    const currentSelected = RouteManager.getSelectedRouteItem();

    if (!currentSelected) {
      console.warn("Cannot reroute: selected route missing");
      return;
    }

    appState.rerouting = true;

    try {
      console.warn("REROUTE START");
      setText("naviNext", "REROUTING");

      RerouteManager.sendRerouteNoticeToBle();

      const useExpress = currentSelected.type === "EXPRESS";

      const newRoute = await RouteManager.fetchRoute({
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

      RerouteManager.applyNewRoute(newRoute);

      console.warn("REROUTE DONE");
      setText("naviNext", "REROUTE DONE");

    } finally {
      appState.rerouting = false;
    }
  }

  static sendRerouteNoticeToBle() {
    if (window.BLE?.isEnabled?.() && window.BLE?.isConnected?.()) {
      BLE.sendText("REROUTE");
    }
  }

  static applyNewRoute(newRoute) {
    appState.routeResults[appState.selectedRouteIndex].route = newRoute;
    appState.route = newRoute;
    appState.routePoints = MiniMap.decodeRoutePoints(newRoute);

    appState.currentStepIndex = 0;
    appState.currentStepRemainMeters = null;
    appState.offRouteCount = 0;

    RouteManager.drawSelectedRoute(appState.selectedRouteIndex);
    NavigationManager.updateCurrentStep();
    NavigationManager.updateStepDisplay();
    MiniMap.draw(appState.currentLocation, appState.routePoints);
  }
}

// 既存コード互換ラッパー
function checkRouteDeviation() {
  return RerouteManager.checkDeviation();
}

function recalculateRoute() {
  return RerouteManager.recalculate();
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
// 13. History Manager
// ==============================
class HistoryManager {
  static getAll() {
    const json = localStorage.getItem(HISTORY_KEY);
    if (!json) return [];

    try {
      return JSON.parse(json);
    } catch (e) {
      console.warn("Failed to parse destination history:", e);
      return [];
    }
  }

  static save(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  static add(route) {
    if (!route?.name) return;

    const history = HistoryManager.getAll();

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

    HistoryManager.save(filtered.slice(0, HISTORY_LIMIT));
    HistoryManager.updateDisplay();
  }

  static getLast() {
    const history = HistoryManager.getAll();
    return history.length > 0 ? history[0] : null;
  }

  static updateDisplay() {
    HistoryManager.updateLastRouteDisplay();

    const listEl = document.getElementById("historyList");
    if (!listEl) return;

    const history = HistoryManager.getAll();

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
          <div class="history-sub">${HistoryManager.formatTime(item.timestamp)}</div>
        </div>
        <button class="history-delete" onclick="deleteHistoryItem(${index})">削除</button>
      </div>
    `).join("");
  }

  static updateLastRouteDisplay() {
    const el = document.getElementById("lastRouteText");
    if (!el) return;

    const lastRoute = HistoryManager.getLast();
    el.textContent = lastRoute ? lastRoute.name : "なし";
  }

  static async startItem(index) {
    const history = HistoryManager.getAll();
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

    MapManager.updateDestinationMarker(appState.destination);
    MapManager.centerOnDestination(appState.destination);

    showScreen("map");
    await RouteManager.calculateRoutes();
  }

  static async startLast() {
    const lastRoute = HistoryManager.getLast();

    if (!lastRoute) {
      alert("履歴がありません");
      return;
    }

    const history = HistoryManager.getAll();
    const index = history.findIndex(
      item => item.timestamp === lastRoute.timestamp
    );

    if (index >= 0) {
      await HistoryManager.startItem(index);
    } else {
      showScreen("map");
    }
  }

  static deleteItem(index) {
    const history = HistoryManager.getAll();

    if (!history[index]) return;

    const ok = confirm(`「${history[index].name}」を履歴から削除しますか？`);
    if (!ok) return;

    history.splice(index, 1);

    HistoryManager.save(history);
    HistoryManager.updateDisplay();
  }

  static toggleFavorite(index) {
    const history = HistoryManager.getAll();

    if (!history[index]) return;

    history[index].favorite = !history[index].favorite;

    HistoryManager.save(history);
    HistoryManager.updateDisplay();
  }

  static toggleList() {
    const el = document.getElementById("historyList");
    if (!el) return;

    el.classList.toggle("open");
  }

  static formatTime(timestamp) {
    if (!timestamp) return "";

    const d = new Date(timestamp);

    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
}

// 既存コード互換ラッパー
function getDestinationHistory() {
  return HistoryManager.getAll();
}

function saveDestinationHistory(history) {
  return HistoryManager.save(history);
}

function addDestinationHistory(route) {
  return HistoryManager.add(route);
}

function getLastRoute() {
  return HistoryManager.getLast();
}

function updateHistoryDisplay() {
  return HistoryManager.updateDisplay();
}

function updateLastRouteDisplay() {
  return HistoryManager.updateLastRouteDisplay();
}

function startHistoryItem(index) {
  return HistoryManager.startItem(index);
}

function startLastRoute() {
  return HistoryManager.startLast();
}

function deleteHistoryItem(index) {
  return HistoryManager.deleteItem(index);
}

function toggleFavoriteHistoryItem(index) {
  return HistoryManager.toggleFavorite(index);
}

function toggleHistoryList() {
  return HistoryManager.toggleList();
}

function formatHistoryTime(timestamp) {
  return HistoryManager.formatTime(timestamp);
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
