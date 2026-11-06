import {
  viewIds,
  getView,
  buildMobileHtml,
  buildSvgMarkup,
  nextZoom,
  RESET_ZOOM,
} from "./military-model.mjs";

const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const mobileHost = document.getElementById("mil-mobile");
const svgHost = document.getElementById("mil-svg-host");
const stage = document.getElementById("mil-stage");
const viewport = document.getElementById("mil-viewport");
const zoomLabel = document.getElementById("mil-zoom-label");

let view = "guard";
let zoom = RESET_ZOOM;
let panX = 0;
let panY = 0;
let dragging = false;
let lastX = 0;
let lastY = 0;

function applyTransform() {
  if (!stage) return;
  stage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  if (zoomLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}

function render() {
  const v = getView(view);
  document.getElementById("mil-view-title").textContent = v.title;
  if (mobileHost) mobileHost.innerHTML = buildMobileHtml(view);
  if (svgHost) svgHost.innerHTML = buildSvgMarkup(view);
  for (const tab of tabs) {
    const selected = tab.dataset.view === view;
    tab.setAttribute("aria-selected", selected ? "true" : "false");
    tab.tabIndex = selected ? 0 : -1;
  }
  const panel = document.getElementById("mil-panel");
  if (panel) panel.dataset.activeView = view;
}

function setView(next) {
  if (!viewIds().includes(next)) return;
  view = next;
  zoom = RESET_ZOOM;
  panX = 0;
  panY = 0;
  applyTransform();
  render();
}

for (const tab of tabs) {
  tab.addEventListener("click", () => setView(tab.dataset.view));
  tab.addEventListener("keydown", (e) => {
    const ids = viewIds();
    const i = ids.indexOf(view);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      setView(ids[(i + 1) % ids.length]);
      tabs.find((t) => t.dataset.view === view)?.focus();
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      setView(ids[(i - 1 + ids.length) % ids.length]);
      tabs.find((t) => t.dataset.view === view)?.focus();
    }
  });
}

document.getElementById("mil-zoom-in")?.addEventListener("click", () => {
  zoom = nextZoom(zoom, "in");
  applyTransform();
});
document.getElementById("mil-zoom-out")?.addEventListener("click", () => {
  zoom = nextZoom(zoom, "out");
  applyTransform();
});
document.getElementById("mil-zoom-reset")?.addEventListener("click", () => {
  zoom = nextZoom(zoom, "reset");
  panX = 0;
  panY = 0;
  applyTransform();
});

if (viewport) {
  viewport.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    panX += e.clientX - lastX;
    panY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    applyTransform();
  });
  viewport.addEventListener("pointerup", () => {
    dragging = false;
  });
  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom = nextZoom(zoom, e.deltaY < 0 ? "in" : "out");
      applyTransform();
    },
    { passive: false }
  );
}

const params = new URLSearchParams(location.search);
if (params.get("view") && viewIds().includes(params.get("view"))) {
  view = params.get("view");
}

function fitWidth() {
  if (!viewport || !svgHost) return;
  const svg = svgHost.querySelector("svg");
  if (!svg) return;
  const vb = svg.viewBox.baseVal;
  const vw = viewport.clientWidth - 32;
  if (vb.width > 0 && vw > 0) {
    const fit = Math.min(1, vw / vb.width);
    zoom = Math.max(0.25, Math.min(1, +fit.toFixed(4)));
    panX = 0;
    panY = 0;
  }
}

render();
fitWidth();
applyTransform();

window.addEventListener("resize", () => {
  fitWidth();
  applyTransform();
});
