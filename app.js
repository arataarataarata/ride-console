function showScreen(name) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  document.getElementById(`screen-${name}`).classList.add("active");
}
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
