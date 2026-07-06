// ==============================
// Ride Console - app.js
// ==============================

// API Key
const GOOGLE_ROUTES_API_KEY = "AIzaSyA9EP_wOYfkx3CCjc8DWZ69ObxhiOPhyMM";

// State
let map;
let marker;
let autocomplete;
let selectedDestination = null;

let routeResults = [];
let selectedRouteIndex = 0;
let routePolyline = null;

let developerMode = false;
// ==============================
// Map Style
// ==============================
const rideConsoleMapStyle = [
  {
    elementType: "geometry",
    stylers: [{ color: "#1d1d1d" }]
  },
  {
    elementType: "labels.text.fill",
    stylers: [{ color: "#b8b8b8" }]
  },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#1d1d1d" }]
  },
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
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0f1a22" }]
  }
];
const appState = {
    screen: "HOME",
    route: null,
    destination: null,
    currentLocation: null,
    latestAccuracy: null,
    locationReady: false
};

// ==============================
// Init
// ==============================
document.addEventListener("DOMContentLoaded", restoreDeveloperMode);


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

// =====================================================
// Location State
// =====================================================

let locationWatchId = null;
let currentLocationMarker = null;
let currentAccuracyCircle = null;

function startLocationWatch() {
    if (!navigator.geolocation) {
        console.warn("Geolocation is not supported.");
        showDevLog("GPS not supported");
        return;
    }

    // 二重起動防止
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

// ==============================
// Update current location
// ==============================
function updateCurrentLocationOnMap(lat, lng, accuracy) {
    if (!map) {
        console.warn("Map is not ready.");
        return;
    }

    const pos = { lat, lng };

    // 初回だけマーカー作成
    if (!currentLocationMarker) {
        currentLocationMarker = new google.maps.Marker({
            position: pos,
            map: map,
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

    // 精度円
    if (!currentAccuracyCircle) {
        currentAccuracyCircle = new google.maps.Circle({
            map: map,
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

// ==============================
// Google Map
// ==============================
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

  marker = new google.maps.Marker({
    position: defaultPosition,
    map: map,
    title: "Tokyo Station"
  });

  setupAutocomplete();
  
}

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
    fields: ["place_id", "geometry", "name", "formatted_address"],
  });

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();

    if (!place.geometry || !place.geometry.location) {
      console.warn("No geometry for selected place:", place);
      return;
    }

    destination = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng()
    };

    console.log("Destination selected:", destination, place.name);

    map.setCenter(destination);
    map.setZoom(16);

    if (!marker) {
      marker = new google.maps.Marker({
        map: map,
        title: "Destination"
      });
    }

    marker.setPosition(destination);
  });
}

function clearRoute() {
  if (routePolyline) {
    routePolyline.setMap(null);
    routePolyline = null;
  }

  routeResults = [];
  selectedRouteIndex = 0;
}


// ==============================
// Routes API
// ==============================
async function calculateRoutes() {
  if (!selectedDestination) {
    alert("Please select destination.");
    return;
  }

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

function getCurrentOrigin() {
  // TODO: GPS連携後は現在地に置き換える
  return {
    lat: 35.681236,
    lng: 139.767125
  };
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
          "routes.travelAdvisory.tollInfo"
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


// ==============================
// Route Cards
// ==============================
function renderRouteCards() {
  const container = document.getElementById("routeOptions");

  if (!container) return;

  container.innerHTML = "";

  routeResults.forEach((item, index) => {
    const minutes = formatDuration(item.route.duration);
    const distance = formatDistance(item.route.distanceMeters);

    const button = document.createElement("button");
    button.className = "route-option" + (index === selectedRouteIndex ? " selected" : "");

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

  console.log("drawSelectedRoute:", index, item);

  if (!item || !item.route || !item.route.polyline) {
    console.warn("No route polyline:", item);
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
// Utility
// ==============================
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
// Expose functions for HTML onclick / Google callback
// ==============================
window.initMap = initMap;
window.showScreen = showScreen;
window.toggleDeveloperMode = toggleDeveloperMode;
window.selectRouteOption = selectRouteOption;
window.calculateRoutes = calculateRoutes;
window.startNavigation = startNavigation;
