/**
 * Military Organization v3 — Danish-style symbol org chart
 * Run: node --test games/story/military.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  FORBIDDEN_PUBLIC,
  viewIds,
  getForce,
  assertCanonInvariants,
  buildChartSvg,
  UNIT_TYPE_IDS,
  getUnitType,
  buildLegendHtml,
  buildDetailHtml,
  nextZoom,
  RESET_ZOOM,
  FIT_ACTION,
} from "./military-model.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const NINE = ["infantry","artillery","cavalry","armor","air","medic","signal","supply","staff"];

test("three forces", () => {
  assert.deepEqual(viewIds(), ["guard", "empire", "enemy"]);
});

test("canon invariants", () => {
  assert.doesNotThrow(() => assertCanonInvariants());
});

test("chart SVG is large native chart with orthogonal connectors and paper class", () => {
  for (const id of viewIds()) {
    const svg = buildChartSvg(id);
    assert.match(svg, /<svg[^>]*class="[^"]*mil-chart-svg/);
    assert.match(svg, /data-chart-force="/);
    assert.match(svg, /<path class="connector"/);
    // orthogonal: H and V commands present
    assert.match(svg, / d="M[^"]*[HV][^"]*"/);
    assert.match(svg, /class="tac-frame"/);
    assert.match(svg, /class="echelon"/);
    assert.match(svg, /class="unit-label"/);
    // readable: no tiny global scale attribute as primary
    assert.doesNotMatch(svg, /transform="scale\(0\./);
    // viewBox large enough for at-once hierarchy
    const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    assert.ok(vb, id);
    assert.ok(+vb[1] >= 800, `${id} width`);
    assert.ok(+vb[2] >= 600, `${id} height`);
  }
});

test("Black Guard chart shows HL, Banner, four companies without ellipsis truncation", () => {
  const svg = buildChartSvg("guard");
  assert.match(svg, /Cassian Thorne/);
  assert.match(svg, /Alaric/);
  assert.match(svg, /Recon|Seraphina/);
  assert.match(svg, /Iron|Garrick/);
  assert.match(svg, /Ash|Dagny/);
  assert.match(svg, /Heavy|Brynja/);
  assert.doesNotMatch(svg, /Alaric Vae…|Garri…|…/);
});

test("Desert enemy chart includes warrior king and proposed host flesh", () => {
  const svg = buildChartSvg("enemy");
  assert.match(svg, /Warrior King|warrior king|Rival/i);
  assert.match(svg, /Proposed|PROPOSED|proposed/);
});

test("nine unit types retained with proposed status", () => {
  assert.deepEqual([...UNIT_TYPE_IDS], NINE);
  for (const id of NINE) {
    const t = getUnitType(id);
    assert.equal(t.status, "proposed");
    assert.ok(t.label.length > 3);
  }
});

test("legend explains echelon and role symbols", () => {
  const html = buildLegendHtml();
  assert.match(html, /echelon|Echelon|XXX|Division|Banner|Company|Platoon/i);
  assert.match(html, /infantry|artillery|cavalry|armor/i);
  assert.match(html, /Proposed|Confirmed/i);
});

test("detail overlay helper returns prose for a unit without replacing chart", () => {
  const html = buildDetailHtml("guard", "alaric");
  assert.match(html, /data-detail-overlay/);
  assert.match(html, /Banner|Alaric/);
  assert.match(html, /Confirmed|confirmed/);
  assert.ok(html.length > 80);
});

test("zoom: reset is 1; fit action distinct; no forced shrink on reset", () => {
  assert.equal(RESET_ZOOM, 1);
  assert.equal(nextZoom(1, "reset"), 1);
  assert.ok(nextZoom(1, "in") > 1);
  assert.ok(nextZoom(1, "out") < 1);
  assert.equal(FIT_ACTION, "fit");
});

test("page is v3 marker — chart chrome not card explorer primary", () => {
  const html = readFileSync(join(dir, "military.html"), "utf8");
  assert.match(html, /data-military-build="story-military-org-v3"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /mil-chart-host|chart-viewport/);
  assert.match(html, /Zoom in|Zoom out|Reset|Fit overview|Fit/i);
  assert.match(html, /Download/i);
  assert.doesNotMatch(html, /data-explorer="true"/);
  assert.doesNotMatch(html, /story-military-org-v2"/);
  for (const bad of FORBIDDEN_PUBLIC) {
    assert.doesNotMatch(html, new RegExp(bad, "i"));
  }
});

test("css paper chart + pan viewport, not focus-card explorer primary", () => {
  const css = readFileSync(join(dir, "military.css"), "utf8");
  assert.match(css, /chart-viewport|mil-chart/);
  assert.match(css, /#f[5-9]|#fff|paper|ivory|cream/i);
  assert.doesNotMatch(css, /\.focus-card\s*\{[^}]*min-height:\s*140px/);
});

test("js wires pan zoom fit download and optional detail without fitWidth-on-load", () => {
  const js = readFileSync(join(dir, "military.js"), "utf8");
  assert.match(js, /buildChartSvg/);
  assert.match(js, /Fit|fitOverview|FIT_ACTION/);
  assert.match(js, /download|Download/);
  assert.doesNotMatch(js, /fitWidth\(\)/);
  assert.match(js, /buildDetailHtml|detail/);
});
