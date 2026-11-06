/**
 * Military Organization v4 — 12 one-sheet charts (4 factions × 3 ranges)
 * Run: node --test games/story/military.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  FORBIDDEN_PUBLIC,
  FACTION_IDS,
  RANGE_IDS,
  chartCombos,
  getFaction,
  getRange,
  buildChartSvg,
  buildChartMeta,
  assertCanonInvariants,
  UNIT_TYPE_IDS,
  getUnitType,
  buildLegendHtml,
  buildDetailHtml,
  parseChartState,
  chartUrlQuery,
} from "./military-model.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const NINE = ["infantry","artillery","cavalry","armor","air","medic","signal","supply","staff"];

test("four factions including Desert Kingdom separate from enemy", () => {
  assert.deepEqual(FACTION_IDS, ["empire", "guard", "kingdom", "enemy"]);
  assert.match(getFaction("kingdom").title, /Desert Kingdom/i);
  assert.match(getFaction("enemy").title, /Desert [Ee]nemy|Enemy/i);
  assert.notEqual(getFaction("kingdom").id, getFaction("enemy").id);
});

test("three range views", () => {
  assert.deepEqual(RANGE_IDS, ["high-div", "hl-banner", "div-plt"]);
  assert.match(getRange("high-div").label, /Division/i);
  assert.match(getRange("hl-banner").label, /Banner/i);
  assert.match(getRange("div-plt").label, /Platoon/i);
});

test("exactly 12 chart combinations", () => {
  const c = chartCombos();
  assert.equal(c.length, 12);
  assert.ok(c.every((x) => x.faction && x.range));
});

test("canon invariants still hold on Guard locked structure", () => {
  assert.doesNotThrow(() => assertCanonInvariants());
});

test("each of 12 charts is compact one-sheet SVG with orthogonal connectors", () => {
  for (const { faction, range } of chartCombos()) {
    const svg = buildChartSvg(faction, range);
    const meta = buildChartMeta(faction, range);
    assert.match(svg, /class="[^"]*mil-chart-svg/);
    assert.match(svg, /data-chart-faction="/);
    assert.match(svg, /data-chart-range="/);
    assert.match(svg, /data-sheet="1"/);
    assert.match(svg, /<path class="connector"/);
    assert.match(svg, / d="M[^"]*[HV][^"]*"/);
    assert.match(svg, /class="tac-frame"/);
    assert.match(svg, /class="echelon"/);
    assert.match(svg, /class="unit-label"/);
    // one-sheet bounds — not a multi-thousand-px pan canvas
    const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    assert.ok(vb, `${faction}/${range}`);
    assert.ok(+vb[1] <= 1400, `${faction}/${range} width ${vb[1]}`);
    assert.ok(+vb[2] <= 1000, `${faction}/${range} height ${vb[2]}`);
    assert.ok(+vb[1] >= 640, `${faction}/${range} min width`);
    assert.ok(+vb[2] >= 420, `${faction}/${range} min height`);
    // all node boxes inside viewBox
    for (const m of svg.matchAll(/class="tac-frame"[^>]*\bx="([\d.-]+)"[^>]*\by="([\d.-]+)"[^>]*\bwidth="([\d.-]+)"[^>]*\bheight="([\d.-]+)"/g)) {
      const x = +m[1], y = +m[2], w = +m[3], h = +m[4];
      assert.ok(x >= 0 && y >= 0, `${faction}/${range} box origin`);
      assert.ok(x + w <= +vb[1] + 0.5, `${faction}/${range} box right ${x+w} > ${vb[1]}`);
      assert.ok(y + h <= +vb[2] + 0.5, `${faction}/${range} box bottom`);
    }
    assert.ok(meta.shortTitle.length >= 3);
  }
});

test("Guard div→platoon shows 4 companies and 9 platoon slots", () => {
  const svg = buildChartSvg("guard", "div-plt");
  assert.match(svg, /Recon/);
  assert.match(svg, /Iron/);
  assert.match(svg, /Ash/);
  assert.match(svg, /Heavy|Hammer/);
  assert.match(svg, /Brann/);
  assert.match(svg, /Joss/);
  // nine platoons: 2 named recon + iron×3 + ash×3 + heavy×1
  const pltMarks = (svg.match(/data-platoon="1"/g) || []).length;
  assert.equal(pltMarks, 9, `expected 9 platoon marks, got ${pltMarks}`);
});

test("no silent brigade / regiment layer required on Guard high charts", () => {
  const a = buildChartSvg("guard", "high-div");
  const b = buildChartSvg("guard", "hl-banner");
  // must not present a confirmed Brigade unit node
  assert.doesNotMatch(a + b, /data-unit-id="[^"]*brigade[^"]*"[^>]*data-status="confirmed"/i);
  assert.doesNotMatch(a + b, /class="unit-label"[^>]*>\s*Brigade/i);
  assert.match(a + b, /no formal regiments/i);
  assert.match(a + b, /5–8 Banners|5-8 Banners/);
});

test("Desert Kingdom canyon mix 3/4 desert + 1/4 Imperial appears proposed/confirmed carefully", () => {
  const svg = buildChartSvg("kingdom", "div-plt") + buildChartSvg("kingdom", "hl-banner") + buildChartSvg("kingdom", "high-div");
  assert.match(svg, /3\/4|¾|three.?quarter/i);
  assert.match(svg, /Imperial|1\/4|¼/i);
  assert.match(svg, /Canyon|canyon/);
  assert.match(svg, /Rashid|High Lord/i);
});

test("URL state round-trip for all 12", () => {
  for (const { faction, range } of chartCombos()) {
    const q = chartUrlQuery(faction, range);
    assert.match(q, new RegExp(`faction=${faction}`));
    assert.match(q, new RegExp(`range=${range}`));
    const parsed = parseChartState(q);
    assert.equal(parsed.faction, faction);
    assert.equal(parsed.range, range);
  }
  assert.deepEqual(parseChartState(""), { faction: "guard", range: "high-div" });
});

test("nine unit types retained proposed", () => {
  assert.deepEqual([...UNIT_TYPE_IDS], NINE);
  for (const id of NINE) assert.equal(getUnitType(id).status, "proposed");
});

test("legend + detail helpers", () => {
  assert.match(buildLegendHtml(), /Echelon|echelon|XXX|Banner|Company|Platoon/i);
  assert.match(buildLegendHtml(), /infantry|artillery|Proposed/i);
  const d = buildDetailHtml("guard", "div-plt", "alaric");
  assert.match(d, /data-detail-overlay/);
  assert.match(d, /Banner|Alaric/);
});

test("page is v4 with faction+range selectors and print hooks", () => {
  const html = readFileSync(join(dir, "military.html"), "utf8");
  assert.match(html, /data-military-build="story-military-org-v4"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /data-faction="kingdom"/);
  assert.match(html, /data-range="high-div"/);
  assert.match(html, /data-range="hl-banner"/);
  assert.match(html, /data-range="div-plt"/);
  assert.match(html, /Print|print/);
  assert.match(html, /chart-artboard|mil-artboard/);
  assert.doesNotMatch(html, /story-military-org-v3"/);
  for (const bad of FORBIDDEN_PUBLIC) assert.doesNotMatch(html, new RegExp(bad, "i"));
});

test("css one-sheet fit + print landscape, not giant pan-default", () => {
  const css = readFileSync(join(dir, "military.css"), "utf8");
  assert.match(css, /chart-artboard|mil-artboard/);
  assert.match(css, /@media print/);
  assert.match(css, /landscape|size:/i);
  assert.match(css, /object-fit|preserveAspectRatio|width:\s*100%/);
});

test("js wires 12 states, URL, print, fit sheet — not explorer", () => {
  const js = readFileSync(join(dir, "military.js"), "utf8");
  assert.match(js, /buildChartSvg/);
  assert.match(js, /chartUrlQuery|parseChartState|history\.replaceState|pushState/);
  assert.match(js, /print|Print/);
  assert.doesNotMatch(js, /buildExplorerHtml/);
  assert.doesNotMatch(js, /data-explorer/);
});
