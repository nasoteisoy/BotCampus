/**
 * Military Organization v2 — army explorer + unit-type gallery tests
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
  getUnit,
  getChildren,
  getAncestors,
  buildExplorerHtml,
  buildGlossaryHtml,
  buildUnitTypeGalleryHtml,
  collectAllUnits,
  assertCanonInvariants,
  UNIT_TYPE_IDS,
  getUnitType,
} from "./military-model.mjs";

const dir = dirname(fileURLToPath(import.meta.url));

const NINE = [
  "infantry",
  "artillery",
  "cavalry",
  "armor",
  "air",
  "medic",
  "signal",
  "supply",
  "staff",
];

test("three forces", () => {
  assert.deepEqual(viewIds(), ["guard", "empire", "enemy"]);
});

test("canon invariants on Black Guard", () => {
  assert.doesNotThrow(() => assertCanonInvariants());
});

test("every unit has plain educational fields", () => {
  for (const id of viewIds()) {
    for (const u of collectAllUnits(id)) {
      assert.ok(u.name && u.name.length >= 3, u.id);
      assert.ok(u.unitType && u.unitType.length >= 3, u.id);
      assert.ok(u.whatItIs && u.whatItIs.length >= 40, `${u.id} whatItIs too short`);
      assert.ok(u.functionText && u.functionText.length >= 20, `${u.id} function`);
      assert.ok(u.strength && u.strength.text, u.id);
      assert.ok(["confirmed", "proposed"].includes(u.status), u.id);
      assert.ok(["confirmed", "proposed"].includes(u.strength.status), u.id);
      assert.ok(u.leader && u.leader.title, u.id);
      assert.doesNotMatch(u.whatItIs, /\u2026|\.\.\.$/);
      assert.doesNotMatch(u.name, /\u2026/);
    }
  }
});

test("proposed units are explicitly marked; confirmed stay confirmed", () => {
  const enemy = collectAllUnits("enemy");
  const proposed = enemy.filter((u) => u.status === "proposed");
  assert.ok(proposed.length >= 6, "desert enemy chain should be fleshed out as proposed");
  const cassian = getUnit("guard", "hl");
  assert.equal(cassian.status, "confirmed");
  assert.equal(cassian.leader.name, "Cassian Thorne");
});

test("drilldown: children and ancestors", () => {
  const kids = getChildren("guard", "alaric");
  assert.ok(kids.some((c) => c.id === "recon"));
  assert.ok(kids.some((c) => c.id === "iron"));
  const anc = getAncestors("guard", "recon");
  assert.equal(anc[0].id, getForce("guard").rootId);
  assert.ok(anc.map((a) => a.id).includes("alaric"));
});

test("explorer HTML at a focus is one level — roomy cards, no SVG fit scale, no truncated titles", () => {
  const html = buildExplorerHtml("guard", "alaric");
  assert.match(html, /data-explorer="true"/);
  assert.match(html, /data-focus="alaric"/);
  assert.match(html, /Sir Alaric Vaelen/);
  assert.match(html, /data-drill=/);
  assert.match(html, /data-crumb|breadcrumb/i);
  assert.doesNotMatch(html, /fitWidth|scale\(/);
  assert.doesNotMatch(html, /<svg[\s\S]*org-svg/);
  assert.doesNotMatch(html, /Alaric Vae\u2026|Garri\u2026|Bry\u2026/);
  assert.match(html, /Confirmed|CONFIRMED|confirmed/);
  assert.match(html, /Recon/);
  assert.match(html, /Iron/);
});

test("explorer at root shows overview subordinates", () => {
  const html = buildExplorerHtml("guard", getForce("guard").rootId);
  assert.match(html, /Black Guard|Division/i);
  assert.match(html, /data-drill=/);
});

test("glossary explains unit types and civil vs military", () => {
  const g = buildGlossaryHtml();
  for (const word of ["Division", "Banner", "Company", "Platoon", "Squad", "Prefect", "High Lord"]) {
    assert.match(g, new RegExp(word, "i"));
  }
  assert.match(g, /military/i);
  assert.match(g, /civil/i);
});

test("nine unit-type ids are complete (cavalry not calvary)", () => {
  assert.deepEqual([...UNIT_TYPE_IDS], NINE);
  assert.ok(!UNIT_TYPE_IDS.includes("calvary"));
});

test("each of nine roles has creature concept, purpose, how, limits, placement", () => {
  for (const id of NINE) {
    const t = getUnitType(id);
    assert.equal(t.id, id);
    assert.ok(t.label.length >= 3);
    assert.ok(t.creatureConcept.length >= 40, id);
    assert.ok(t.battlefieldPurpose.length >= 30, id);
    assert.ok(t.howItWorks.length >= 40, id);
    assert.ok(t.limitations.length >= 30, id);
    assert.ok(t.commanderPlacement.length >= 20, id);
    assert.equal(t.status, "proposed");
    assert.match(t.creatureConcept + t.howItWorks, /spirit|tie|purpose|Know|channel/i);
    assert.doesNotMatch(t.creatureConcept, /tank|helicopter|radio truck|ambulance jeep|fighter jet/i);
  }
});

test("unit-type gallery HTML lists all nine and is filterable by data-type", () => {
  const html = buildUnitTypeGalleryHtml();
  assert.match(html, /data-unit-gallery="true"/);
  for (const id of NINE) {
    assert.match(html, new RegExp(`data-type="${id}"`));
    assert.match(html, new RegExp(getUnitType(id).label));
  }
  assert.match(html, /PROPOSED|Proposed|proposed/);
  assert.match(html, /data-filter-type|unit-filter/i);
});

test("proposed capability branches attach under Guard companies/staff without replacing locked 4-company structure", () => {
  const alaricKids = getChildren("guard", "alaric").map((c) => c.id);
  assert.ok(alaricKids.includes("recon"));
  assert.ok(alaricKids.includes("iron"));
  assert.ok(alaricKids.includes("ash"));
  assert.ok(alaricKids.includes("heavy"));
  assert.ok(alaricKids.includes("corvin"));
  // proposed support capability nodes exist somewhere under guard
  const all = collectAllUnits("guard");
  const caps = all.filter((u) => u.capabilityType);
  assert.ok(caps.length >= 5, "proposed capabilities under guard");
  assert.ok(caps.every((u) => u.status === "proposed"));
  const types = new Set(caps.map((u) => u.capabilityType));
  for (const id of NINE) assert.ok(types.has(id), `missing capability attachment for ${id}`);
});

test("forces feel different in unit-type flavor notes", () => {
  const inf = getUnitType("infantry");
  assert.ok(inf.forceNotes.guard && inf.forceNotes.empire && inf.forceNotes.enemy);
  assert.notEqual(inf.forceNotes.guard, inf.forceNotes.enemy);
});

test("page is v2 marker and has explorer + gallery chrome", () => {
  const html = readFileSync(join(dir, "military.html"), "utf8");
  assert.match(html, /data-military-build="story-military-org-v2"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /mil-back|Back/);
  assert.match(html, /mil-overview|Overview/);
  assert.match(html, /Glossary|glossary/);
  assert.match(html, /unit-gallery|Unit types|Capabilities/i);
  assert.doesNotMatch(html, /fitWidth/);
  for (const bad of FORBIDDEN_PUBLIC) {
    assert.doesNotMatch(html, new RegExp(bad, "i"), bad);
  }
});

test("no miniature whole-force graph CSS as primary UX", () => {
  const css = readFileSync(join(dir, "military.css"), "utf8");
  assert.doesNotMatch(css, /fitWidth|viewBox.*scale/);
  assert.match(css, /explorer|unit-card|focus-card/i);
  assert.match(css, /@media/);
  assert.match(css, /type-card|type-grid/i);
  assert.match(css, /branch-grid/);
});

test("js wires drilldown and unit-type filter without fit-to-width", () => {
  const js = readFileSync(join(dir, "military.js"), "utf8");
  assert.doesNotMatch(js, /fitWidth/);
  assert.match(js, /data-drill|drillTo|setFocus/);
  assert.match(js, /buildExplorerHtml/);
  assert.match(js, /buildUnitTypeGalleryHtml|data-filter-type|filterType/);
});

test("empire includes proposed corps-style subordinates", () => {
  const units = collectAllUnits("empire");
  assert.ok(units.some((u) => /corps|division|host/i.test(u.unitType + u.name) && u.status === "proposed"));
  assert.ok(units.some((u) => /Prefect/i.test(u.name) && u.status === "confirmed"));
});

test("desert enemy proposed chain has depth below warrior king", () => {
  const kids = getChildren("enemy", "wk");
  assert.ok(kids.length >= 3);
});
