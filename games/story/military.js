import {
  FACTION_IDS,
  RANGE_IDS,
  getFaction,
  getRange,
  buildChartSvg,
  buildChartMeta,
  buildLegendHtml,
  buildDetailHtml,
  buildGlossaryHtml,
  buildUnitTypeGalleryHtml,
  chartUrlQuery,
  parseChartState,
  chartCombos,
} from "./military-model.mjs";

const factionTabs = Array.from(document.querySelectorAll("[data-faction]"));
const rangeTabs = Array.from(document.querySelectorAll("[data-range]"));
const host = document.getElementById("mil-chart-host");
const artboard = document.getElementById("mil-artboard");
const detailSlot = document.getElementById("mil-detail");
const titleEl = document.getElementById("mil-view-title");
const printAllRoot = document.getElementById("mil-print-all-root");

let { faction, range } = parseChartState(location.search);
let zoom = 1;

function syncTabs() {
  for (const t of factionTabs) {
    const on = t.dataset.faction === faction;
    t.setAttribute("aria-selected", on ? "true" : "false");
  }
  for (const t of rangeTabs) {
    const on = t.dataset.range === range;
    t.setAttribute("aria-selected", on ? "true" : "false");
  }
}

function applyZoom() {
  const svg = host?.querySelector(".mil-chart-svg");
  if (!svg) return;
  if (zoom === 1) {
    host.classList.remove("is-zoomed");
    svg.style.transform = "";
  } else {
    host.classList.add("is-zoomed");
    svg.style.transform = `scale(${zoom})`;
  }
}

function renderChart() {
  if (!host) return;
  const meta = buildChartMeta(faction, range);
  host.innerHTML = buildChartSvg(faction, range);
  if (titleEl) titleEl.textContent = meta.shortTitle;
  syncTabs();
  zoom = 1;
  applyZoom();
  const q = chartUrlQuery(faction, range);
  const url = `${location.pathname}?${q}`;
  if (location.search.replace(/^\?/, "") !== q) {
    history.replaceState({ faction, range }, meta.shortTitle, url);
  }
}

function setFaction(next) {
  if (!FACTION_IDS.includes(next)) return;
  faction = next;
  if (detailSlot) { detailSlot.hidden = true; detailSlot.innerHTML = ""; }
  renderChart();
}
function setRange(next) {
  if (!RANGE_IDS.includes(next)) return;
  range = next;
  if (detailSlot) { detailSlot.hidden = true; detailSlot.innerHTML = ""; }
  renderChart();
}

for (const t of factionTabs) t.addEventListener("click", () => setFaction(t.dataset.faction));
for (const t of rangeTabs) t.addEventListener("click", () => setRange(t.dataset.range));

host?.addEventListener("click", (e) => {
  const node = e.target.closest?.(".mil-node");
  if (!node || !detailSlot) return;
  detailSlot.innerHTML = buildDetailHtml(faction, range, node.getAttribute("data-unit-id"));
  detailSlot.hidden = false;
});
detailSlot?.addEventListener("click", (e) => {
  if (e.target.closest("[data-detail-close]")) {
    detailSlot.hidden = true;
    detailSlot.innerHTML = "";
  }
});

document.getElementById("mil-zoom-in")?.addEventListener("click", () => {
  zoom = Math.min(2.5, +(zoom * 1.2).toFixed(2));
  applyZoom();
});
document.getElementById("mil-zoom-out")?.addEventListener("click", () => {
  zoom = Math.max(1, +(zoom / 1.2).toFixed(2));
  applyZoom();
});
document.getElementById("mil-zoom-reset")?.addEventListener("click", () => {
  zoom = 1;
  applyZoom();
});

document.getElementById("mil-print")?.addEventListener("click", () => {
  document.body.classList.remove("is-print-all");
  if (printAllRoot) { printAllRoot.hidden = true; printAllRoot.innerHTML = ""; }
  window.print();
});

document.getElementById("mil-print-all")?.addEventListener("click", () => {
  if (!printAllRoot) return;
  printAllRoot.innerHTML = chartCombos().map(({ faction: f, range: r }) => {
    const meta = buildChartMeta(f, r);
    return `<section class="print-sheet"><h2>${meta.title}</h2>${buildChartSvg(f, r)}</section>`;
  }).join("");
  printAllRoot.hidden = false;
  document.body.classList.add("is-print-all");
  window.print();
  setTimeout(() => {
    document.body.classList.remove("is-print-all");
    printAllRoot.hidden = true;
  }, 500);
});

document.getElementById("mil-download")?.addEventListener("click", () => {
  const svg = host?.querySelector(".mil-chart-svg");
  if (!svg) return;
  const blob = new Blob([svg.outerHTML], { type: "image/svg+xml;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `military-${faction}-${range}-v4.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
});

window.addEventListener("popstate", () => {
  ({ faction, range } = parseChartState(location.search));
  renderChart();
});

const legendHost = document.getElementById("mil-legend");
const galleryHost = document.getElementById("mil-gallery");
const glossaryHost = document.getElementById("mil-glossary");
if (legendHost) legendHost.innerHTML = buildLegendHtml();
if (glossaryHost) glossaryHost.innerHTML = buildGlossaryHtml();
if (galleryHost) {
  galleryHost.innerHTML = buildUnitTypeGalleryHtml();
  galleryHost.addEventListener("click", (e) => {
    const filter = e.target.closest("[data-filter-type]");
    if (!filter) return;
    const type = filter.getAttribute("data-filter-type");
    galleryHost.querySelectorAll(".unit-filter").forEach((b) => b.classList.toggle("is-on", b === filter));
    galleryHost.querySelectorAll(".type-card").forEach((card) => {
      card.hidden = !(type === "all" || card.getAttribute("data-type") === type);
    });
  });
}

renderChart();
