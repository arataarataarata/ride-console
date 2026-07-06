let map;
let marker;
let autocomplete;
let selectedDestination = null;
let mapInitialized = false;

function initMap() {
  const defaultPosition = {
    lat: 35.681236,
    lng: 139.767125
  };
  
function setupAutocomplete() {
  const input = document.getElementById("destinationInput");

  if (!input) {
    console.warn("destinationInput not found");
    return;
  }

  autocomplete = new google.maps.places.Autocomplete(input, {
    fields: ["place_id", "geometry", "name", "formatted_address"],
    componentRestrictions: { country: "jp" }
  });

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();

    if (!place.geometry || !place.geometry.location) {
      console.warn("No geometry for selected place");
      return;
    }

    selectedDestination = {
      placeId: place.place_id,
      name: place.name,
      address: place.formatted_address,
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng()
    };

    map.setCenter(place.geometry.location);
    map.setZoom(15);

    marker.setPosition(place.geometry.location);
    marker.setTitle(place.name || "Destination");

    updateSearchDebug();
  });
}

function updateSearchDebug() {
  const debugMap = document.getElementById("debugMapStatus");
  const debugRoute = document.getElementById("debugRouteStatus");

  if (debugMap) {
    debugMap.textContent = `MAP: PLACE SELECTED`;
  }

  if (debugRoute && selectedDestination) {
    debugRoute.textContent = `DEST: ${selectedDestination.name}`;
  }
}
  
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

  mapInitialized = true;
}

window.initMap = initMap;

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  document.getElementById(`screen-${name}`).classList.add("active");
}







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
function selectRouteOption(selectedButton) {
  document.querySelectorAll(".route-option").forEach(button => {
    button.classList.remove("selected");
  });

  selectedButton.classList.add("selected");
}
let developerMode = false;

function toggleDeveloperMode() {
  developerMode = !developerMode;
  document.body.classList.toggle("dev-mode", developerMode);

  localStorage.setItem("rideConsoleDeveloperMode", developerMode ? "1" : "0");
}

function restoreDeveloperMode() {
  developerMode = localStorage.getItem("rideConsoleDeveloperMode") === "1";
  document.body.classList.toggle("dev-mode", developerMode);
}

document.addEventListener("DOMContentLoaded", restoreDeveloperMode);
