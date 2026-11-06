/**
 * Focused tests for Military Organization page.
 * Run: node --test games/story/military.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  VIEWS,
  viewIds,
  getView,
  buildMobileHtml,
  buildSvgMarkup,
  nextZoom,
  RESET_ZOOM,
  FORBIDDEN_PUBLIC,
  isProvisional,
  collectLabels,
} from "./military-model.mjs";

const dir = dirname(fileURLToPath(import.meta.url));

test("exposes exactly three view ids", () => {
  assert.deepEqual(viewIds(), ["guard", "empire", "enemy"]);
});

test("each view has a title and non-empty tree", () => {
  for (const id of viewIds()) {
    const v = getView(id);
    assert.ok(v.title.length >= 8, id);
    assert.ok(v.root, id);
    assert.ok(collectLabels(v.root).length >= 4, id);
  }
});

test("every node label is readable (non-empty, min length)", () => {
  for (const id of viewIds()) {
    for (const label of collectLabels(getView(id).root)) {
      assert.ok(label.trim().length >= 3, `short label in ${id}: ${label}`);
    }
  }
});

test("Black Guard has confirmed ladder roles and provisional names flagged", () => {
  const labels = collectLabels(getView("guard").root).join("\n");
  assert.match(labels, /Cassian Thorne/);
  assert.match(labels, /Alaric Vaelen/);
  assert.match(labels, /Seraphina/);
  assert.match(labels, /Corvin/);
  assert.match(labels, /Garrick/);
  assert.match(labels, /Dagny/);
  assert.match(labels, /Brynja/);
  assert.match(labels, /Brann/);
  assert.match(labels, /Joss/);
  assert.equal(isProvisional("Corvin"), true);
  assert.equal(isProvisional("Cassian Thorne"), false);
});

test("Empire marks Council as advisory relationship, not region command", () => {
  const v = getView("empire");
  const rel = JSON.stringify(v);
  assert.match(rel, /advises|advisory|Advisory/i);
  assert.match(rel, /Prefect/);
  assert.match(rel, /outranks/i);
  assert.doesNotMatch(rel, /Council commands regions/i);
});

test("Desert enemy uses relationship edges and unspecified army note", () => {
  const v = getView("enemy");
  const blob = JSON.stringify(v);
  assert.match(blob, /Warrior King/);
  assert.match(blob, /alliance|hires|advises|influence/i);
  assert.match(blob, /UNSPECIFIED|unspecified/);
  assert.match(blob, /Rashid/);
  assert.match(blob, /NOT the desert enemy|not the desert enemy/i);
});

test("draft File/Lance/Guardsman appear only as draft, not as command ladder children of companies", () => {
  const guard = getView("guard");
  const draft = (guard.draftNote || "") + JSON.stringify(guard.draftNodes || []);
  assert.match(draft, /Guardsman/);
  assert.match(draft, /File/);
  assert.match(draft, /Lance/);
  const cmdLabels = collectLabels(guard.root).join(" ");
  assert.doesNotMatch(cmdLabels, /\bFile Leader\b/);
  assert.doesNotMatch(cmdLabels, /\bLance Sergeant\b/);
});

test("mobile HTML uses details/summary collapsible branches at normal text size", () => {
  const html = buildMobileHtml("guard");
  assert.match(html, /<details/);
  assert.match(html, /<summary/);
  assert.match(html, /Cassian Thorne/);
  assert.doesNotMatch(html, /font-size:\s*[0-9]px/);
  assert.doesNotMatch(html, /transform:\s*scale\(/);
});

test("mobile branch toggle markup starts closed except optional open roots", () => {
  const html = buildMobileHtml("empire");
  assert.match(html, /<details/);
  // at least one nested details for Prefects/HL pattern
  assert.ok((html.match(/<details/g) || []).length >= 3);
});

test("SVG markup draws real branches with command vs relationship classes", () => {
  const svg = buildSvgMarkup("enemy");
  assert.match(svg, /<svg/);
  assert.match(svg, /class="[^"]*edge-cmd|edge-rel/);
  assert.match(svg, /edge-rel/);
  assert.match(svg, /Warrior King|alliance|hires/);
  assert.match(svg, /<text/);
});

test("SVG for guard has separate company subtrees (no shared squad node id)", () => {
  const svg = buildSvgMarkup("guard");
  assert.match(svg, /Recon|Seraphina/);
  assert.match(svg, /Iron|Garrick/);
  assert.match(svg, /Ash|Dagny/);
  assert.match(svg, /Heavy|Brynja/);
  assert.doesNotMatch(svg, /id="shared-squads"/);
});

test("zoom steps and reset", () => {
  assert.equal(RESET_ZOOM, 1);
  const up = nextZoom(1, "in");
  assert.ok(up > 1);
  const down = nextZoom(up, "out");
  assert.ok(down < up);
  assert.equal(nextZoom(0.25, "out"), 0.25); // floor
  assert.equal(nextZoom(3, "in"), 3); // ceiling if at max
  assert.equal(nextZoom(1.5, "reset"), RESET_ZOOM);
});

test("public page source must not contain forbidden strings", () => {
  // Will fail until html exists — that's RED for page wiring later
  const htmlPath = join(dir, "military.html");
  let html = "";
  try {
    html = readFileSync(htmlPath, "utf8");
  } catch {
    assert.fail("military.html missing");
  }
  for (const bad of FORBIDDEN_PUBLIC) {
    assert.doesNotMatch(html, new RegExp(bad, "i"), bad);
  }
  assert.match(html, /data-military-build="story-military-org-v1"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /Black Guard/);
  assert.match(html, /Empire/);
  assert.match(html, /Desert/);
  assert.match(html, /military\.js/);
  assert.match(html, /military\.css/);
});

test("page links hub, home, non-canon, and military self", () => {
  const html = readFileSync(join(dir, "military.html"), "utf8");
  assert.match(html, /href="\.\.\/"/); // Everything We Built
  assert.match(html, /href="index\.html"/);
  assert.match(html, /href="non-canon\.html"/);
  assert.match(html, /href="ranks\.html"/);
});

test("non-canon nav links to military.html", () => {
  const nc = readFileSync(join(dir, "non-canon.html"), "utf8");
  assert.match(nc, /href="military\.html"/);
});

test("VIEWS export matches public tab count", () => {
  assert.equal(Object.keys(VIEWS).length, 3);
});
