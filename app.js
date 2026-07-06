function showScreen(name) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  document.getElementById(`screen-${name}`).classList.add("active");
}
