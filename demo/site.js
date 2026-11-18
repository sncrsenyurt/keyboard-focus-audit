const pickup = document.getElementById("pickup");
const keep = document.getElementById("keep");
const closeBtn = document.getElementById("close");

document.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const active = document.activeElement;
  if (!pickup.contains(active)) return;
  if (event.shiftKey) {
    if (active === keep) {
      event.preventDefault();
      closeBtn.focus();
    }
    return;
  }
  if (active === closeBtn) {
    event.preventDefault();
    keep.focus();
  }
});
