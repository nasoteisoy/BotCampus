import {
  viewIds,
  getForce,
  buildExplorerHtml,
  buildGlossaryHtml,
  buildUnitTypeGalleryHtml,
} from "./military-model.mjs";

const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const explorerHost = document.getElementById("mil-explorer");
const galleryHost = document.getElementById("mil-gallery");
const glossaryHost = document.getElementById("mil-glossary");
const titleEl = document.getElementById("mil-view-title");

let view = "guard";
let focusId = getForce(view).rootId;
const history = [];

function renderExplorer() {
  if (!explorerHost) return;
  explorerHost.innerHTML = buildExplorerHtml(view, focusId);
  if (titleEl) titleEl.textContent = getForce(view).title;
  for (const tab of tabs) {
    const on = tab.dataset.view === view;
    tab.setAttribute("aria-selected", on ? "true" : "false");
    tab.tabIndex = on ? 0 : -1;
  }
}

function setFocus(nextId, pushHist = true) {
  if (!nextId) return;
  if (pushHist && focusId && nextId !== focusId) history.push({ view, focusId });
  focusId = nextId;
  renderExplorer();
  explorerHost?.querySelector(".focus-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setView(next) {
  if (!viewIds().includes(next)) return;
  view = next;
  focusId = getForce(view).rootId;
  history.length = 0;
  renderExplorer();
}

function onDrillClick(e) {
  const btn = e.target.closest("[data-drill]");
  if (!btn) return;
  e.preventDefault();
  setFocus(btn.getAttribute("data-drill"), true);
}

explorerHost?.addEventListener("click", onDrillClick);

document.getElementById("mil-back")?.addEventListener("click", () => {
  const prev = history.pop();
  if (prev) {
    view = prev.view;
    focusId = prev.focusId;
    renderExplorer();
  } else {
    setFocus(getForce(view).rootId, false);
  }
});

document.getElementById("mil-overview")?.addEventListener("click", () => {
  history.length = 0;
  setFocus(getForce(view).rootId, false);
});

for (const tab of tabs) {
  tab.addEventListener("click", () => setView(tab.dataset.view));
}

function renderGallery() {
  if (!galleryHost) return;
  galleryHost.innerHTML = buildUnitTypeGalleryHtml();
}

galleryHost?.addEventListener("click", (e) => {
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

if (glossaryHost) glossaryHost.innerHTML = buildGlossaryHtml();

const params = new URLSearchParams(location.search);
if (params.get("view") && viewIds().includes(params.get("view"))) {
  view = params.get("view");
  focusId = getForce(view).rootId;
}
if (params.get("focus")) focusId = params.get("focus");

renderExplorer();
renderGallery();
