import {
  viewIds,
  getForce,
  buildChartSvg,
  buildLegendHtml,
  buildDetailHtml,
  buildGlossaryHtml,
  buildUnitTypeGalleryHtml,
  nextZoom,
  RESET_ZOOM,
  FIT_ACTION,
} from "./military-model.mjs";

const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const host = document.getElementById("mil-chart-host");
const detailSlot = document.getElementById("mil-detail");
const legendHost = document.getElementById("mil-legend");
const galleryHost = document.getElementById("mil-gallery");
const glossaryHost = document.getElementById("mil-glossary");
const titleEl = document.getElementById("mil-view-title");

let view = "guard";
let zoom = RESET_ZOOM; // actual size — never auto fitWidth on load
let panX = 0;
let panY = 0;
let dragging = false;
let lastX = 0;
let lastY = 0;
let pointers = new Map();
let pinchStartDist = 0;
let pinchStartZoom = 1;

function applyTransform() {
  const svg = host?.querySelector(".mil-chart-svg");
  if (!svg) return;
  svg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
}

/** Keep zoom at actual size but pan so the command symbol is in view (not empty left margin). */
function centerOnRoot() {
  const svg = host?.querySelector(".mil-chart-svg");
  if (!svg || !host) return;
  const rx = Number(svg.getAttribute("data-root-x")) || 80;
  const ry = Number(svg.getAttribute("data-root-y")) || 60;
  panX = Math.round(host.clientWidth / 2 - rx * zoom);
  panY = Math.round(48 - ry * zoom);
}

function renderChart() {
  if (!host) return;
  host.innerHTML = buildChartSvg(view);
  if (titleEl) titleEl.textContent = getForce(view).title;
  for (const tab of tabs) {
    const on = tab.dataset.view === view;
    tab.setAttribute("aria-selected", on ? "true" : "false");
    tab.tabIndex = on ? 0 : -1;
  }
  centerOnRoot();
  applyTransform();
}

function setView(next) {
  if (!viewIds().includes(next)) return;
  view = next;
  zoom = RESET_ZOOM;
  panX = 0;
  panY = 0;
  if (detailSlot) {
    detailSlot.hidden = true;
    detailSlot.innerHTML = "";
  }
  renderChart();
}

function fitOverview() {
  const svg = host?.querySelector(".mil-chart-svg");
  if (!svg || !host) return;
  nextZoom(zoom, FIT_ACTION); // acknowledge fit action
  const vb = svg.viewBox.baseVal;
  const pad = 16;
  const sx = (host.clientWidth - pad * 2) / vb.width;
  const sy = (host.clientHeight - pad * 2) / vb.height;
  zoom = Math.max(0.15, Math.min(sx, sy, 1));
  panX = pad + (host.clientWidth - pad * 2 - vb.width * zoom) / 2;
  panY = pad + (host.clientHeight - pad * 2 - vb.height * zoom) / 2;
  applyTransform();
}

function showDetail(unitId) {
  if (!detailSlot || !unitId) return;
  detailSlot.innerHTML = buildDetailHtml(view, unitId);
  detailSlot.hidden = false;
  detailSlot.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

host?.addEventListener("click", (e) => {
  const node = e.target.closest?.(".mil-node");
  if (!node) return;
  showDetail(node.getAttribute("data-unit-id"));
});

detailSlot?.addEventListener("click", (e) => {
  if (e.target.closest("[data-detail-close]")) {
    detailSlot.hidden = true;
    detailSlot.innerHTML = "";
  }
});

for (const tab of tabs) {
  tab.addEventListener("click", () => setView(tab.dataset.view));
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
  centerOnRoot();
  applyTransform();
});
document.getElementById("mil-fit")?.addEventListener("click", () => fitOverview());

document.getElementById("mil-download")?.addEventListener("click", () => {
  const svg = host?.querySelector(".mil-chart-svg");
  if (!svg) return;
  const blob = new Blob([svg.outerHTML], { type: "image/svg+xml;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `military-${view}-v3.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
});

/* Pointer pan + pinch */
host?.addEventListener("pointerdown", (e) => {
  if (e.target.closest?.(".mil-node")) return; // let click select
  host.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    host.classList.add("is-panning");
  } else if (pointers.size === 2) {
    dragging = false;
    const pts = [...pointers.values()];
    pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    pinchStartZoom = zoom;
  }
});

host?.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const pts = [...pointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (pinchStartDist > 0) {
      zoom = Math.min(4, Math.max(0.2, pinchStartZoom * (dist / pinchStartDist)));
      applyTransform();
    }
    return;
  }
  if (!dragging) return;
  panX += e.clientX - lastX;
  panY += e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  applyTransform();
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStartDist = 0;
  if (pointers.size === 0) {
    dragging = false;
    host?.classList.remove("is-panning");
  }
}
host?.addEventListener("pointerup", endPointer);
host?.addEventListener("pointercancel", endPointer);

host?.addEventListener("wheel", (e) => {
  e.preventDefault();
  zoom = nextZoom(zoom, e.deltaY < 0 ? "in" : "out");
  applyTransform();
}, { passive: false });

if (legendHost) legendHost.innerHTML = buildLegendHtml();
if (glossaryHost) glossaryHost.innerHTML = buildGlossaryHtml();
if (galleryHost) {
  galleryHost.innerHTML = buildUnitTypeGalleryHtml();
  galleryHost.addEventListener("click", (e) => {
    const filter = e.target.closest("[data-filter-type]");
    if (!filter) return;
    const type = filter.getAttribute("data-filter-type");
    galleryHost.querySelectorAll(".unit-filter").forEach((b) => {
      b.classList.toggle("is-on", b === filter);
    });
    galleryHost.querySelectorAll(".type-card").forEach((card) => {
      const show = type === "all" || card.getAttribute("data-type") === type;
      card.hidden = !show;
    });
  });
}

const params = new URLSearchParams(location.search);
if (params.get("view") && viewIds().includes(params.get("view"))) {
  view = params.get("view");
}

renderChart();
// Explicit: do NOT call fitOverview on load — actual size default readable
