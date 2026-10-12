// 🧪 Coffee Opening v6 · deterministic FAKE portfolio generator. Run: node tools/gen-portfolio.mjs  →  portfolio.json
// Everything here is made up (codes, addresses, money, people, comments). Only the city centres are real public geography.
// Same seed → byte-identical output. Compact format: see FORMAT below (decoded by portfolio.js).
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITIES } from './pf-cities.mjs';
const HERE = dirname(fileURLToPath(import.meta.url)), SEED = 6061, N = 1900;
let a = SEED >>> 0; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1)), pick = (arr) => arr[Math.floor(rnd() * arr.length)], nrm = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return u - 3; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), r = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const DAY0 = Date.UTC(2020, 0, 1), TODAY = Math.round((Date.UTC(2026, 9, 11) - DAY0) / 864e5);
// ---- made-up people (generic first names + last initials) and firms
const FIRST = ['Alex','Sam','Jordan','Taylor','Casey','Riley','Morgan','Jamie','Avery','Quinn','Drew','Reese','Parker','Rowan','Skyler','Hayden','Blake','Cameron','Dakota','Emerson','Finley','Harper','Jesse','Kendall','Logan','Micah','Noel','Peyton','Sage','Tatum'];
const LAST = 'ABCDEFGHJKLMNPRSTVWZ'.split('');
const PEOPLE = []; for (let i = 0; i < 160; i++) PEOPLE.push(`${FIRST[i % FIRST.length]} ${LAST[(i * 7 + Math.floor(i / 30)) % LAST.length]}.`);
const FIRMS = { arch: ['Mesa Line Architects','Cedar & Grid Design','Northpoint Studio','Blue Arc Architecture'], civil: ['Granite Civil Group','Ridgeway Engineering','Plainview Civil','Summit Site Works'], sign: ['Brightline Signs','Beacon Sign Co.','Neon Mile Signage'], gc: ['Ironwood Builders','Keystone General','Copperline Construction','Two Rivers GC','Trailhead Builders'], dev: ['Sunbelt Retail Dev','Crossroads Partners','Pad Site Holdings','Corner Lot Capital','Meridian Net Lease','Highline Development'], fr: ['Morning Roast LLC','Drive-Up Partners','Sunrise Pour Co.','Northstar Beverage Group','Three Lanes LLC'] };
const STREETS = ['Main St','Oak Ave','Center St','Park Blvd','Elm St','Maple Ave','Mill Rd','Ridge Rd','Lake Dr','Sunset Blvd','Pine St','Broadway','Valley Pkwy','Market St','College Ave','Airport Rd','Highland Ave','Canyon Rd','Grand Ave','Railroad Ave'];
// ---- generic competitors (no brands) and whether they run drive-thrus
const COMPS = [['Coffee chain A', 1], ['Coffee chain B', 1], ['Coffee chain C', 0], ['Donut chain', 1], ['Burger chain (coffee)', 1], ['Local cafés', 0]];
const STATUS_TYPES = { O: 'Open', A: 'Approved', L: 'Looking', F: 'Franchise', R: 'Rejected' };
// ---- Phoenix tie-in: the app's example shops are part of the portfolio (same lat/lng, linked by id)
const dataJs = readFileSync(join(HERE, '..', 'data.js'), 'utf8');
const EXLL = Function('return ' + dataJs.match(/const EXLL = (\{[\s\S]*?\});/)[1])();
const LINKED = { 'ex-down': ['O', 'Scottsdale'], 'ex-hwy': ['O', 'Chandler'], 'ex-lake': ['O', 'Goodyear'], 'ex-pine': ['O', 'Glendale'], 'ex-college': ['O', 'Surprise'],
  'ex-elm': ['A', 'Tempe', 5], 'ex-airport': ['A', 'Phoenix', 8], 'ex-sun': ['A', 'Gilbert', 4], 'ex-river': ['L', 'Mesa', 0, 'REC'], 'ex-desert': ['L', 'Peoria', 0, 'Pre-REC'], 'ex-hill': ['R', 'Fountain Hills'] };
// ---- city weights → a list we draw from
const bag = []; CITIES.forEach((c, i) => { for (let k = 0; k < c[5]; k++) bag.push(i); });
const types = []; const QUOTA = { O: 1010, F: 150, A: 300, L: 320, R: 120 }; for (const [t, n] of Object.entries(QUOTA)) for (let i = 0; i < n; i++) types.push(t);
for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
const ex = Object.entries(LINKED); ex.forEach(([, v], i) => { types[i] = v[0]; });
const usedCodes = new Set(), code = (st) => { let c; do c = st + ri(1000, 9999); while (usedCodes.has(c)); usedCodes.add(c); return c; };
const cityIdx = (name) => CITIES.findIndex((c) => c[0] === name);
// schedule template: [group, task, baseline offset days from project start, duration]
export const TASKS = 24;
const sites = [];
for (let i = 0; i < N; i++) {
  const t = types[i], link = i < ex.length ? ex[i][0] : null, ci = link ? cityIdx(ex[i][1][1]) : pick(bag), C = CITIES[ci];
  const ll = link ? EXLL[link] : [r(C[3] + nrm() * 0.035, 5), r(C[4] + nrm() * 0.04, 5)];
  const tier = ri(1, 4), urb = rnd() < 0.25 ? 0 : rnd() < 0.8 ? 1 : 2; // 0 urban 1 suburban 2 rural
  const tap = r(clamp(28000 + nrm() * 9000 - urb * 6000, 6000, 80000), -2), dp = r(tap * (0.7 + rnd() * 0.9), -2), age = r(31 + nrm() * 3.5, 1), gr = r(1.2 + nrm() * 1.4, 1);
  // stage: one source (stage + dates)
  let sg = t === 'O' || t === 'F' ? 'Open' : t === 'A' ? 'Approved' : t === 'R' ? 'Rejected' : (rnd() < 0.55 ? 'Pre-REC' : 'REC');
  if (link && LINKED[link][3]) sg = LINKED[link][3];
  const os = t === 'A' ? (link ? LINKED[link][2] : ri(4, 10)) : t === 'O' || t === 'F' ? 11 : t === 'L' ? (sg === 'REC' ? 3 : ri(0, 2)) : 3;
  // project start (scouting began) and baseline open date
  const pStart = t === 'O' || t === 'F' ? TODAY - ri(500, 2300) : t === 'A' ? TODAY - [0, 0, 0, 0, 110, 262, 345, 355, 382, 392, 398][os] - ri(5, 40) : t === 'L' ? TODAY - ri(20, 160) : TODAY - ri(150, 700);
  const baseOpen = pStart + ri(430, 520);
  const moved = t === 'A' ? (rnd() < 0.45 ? ri(1, 3) : 0) : t === 'O' || t === 'F' ? (rnd() < 0.3 ? ri(1, 2) : 0) : 0;
  const slipTotal = moved ? ri(10, 35) * moved : (t === 'A' && rnd() < 0.3 ? ri(3, 12) : 0);
  const od = t === 'O' || t === 'F' ? baseOpen + slipTotal : null;
  // market
  const open = ri(0, 14), pipe = ri(0, 6), tam = Math.max(open + pipe + 1, ri(6, 30)), mNew = open === 0 ? 1 : 0;
  const mk = [mNew, r(clamp(4 + nrm() * 3, 0.5, 18), 1), ri(0, 2), tam, open, pipe, r(open / tam * 100), r(clamp(1900 + nrm() * 280, 1100, 2900)), r(clamp(1 + rnd() * 9 + mNew * 15, 0.3, 40), 1), r(clamp(0.6 + rnd() * 10, 0.3, 30), 1)];
  // deal
  const dt = rnd() < 0.62 ? 0 : 1, aadt = r(clamp(26000 + nrm() * 12000, 6000, 72000), -2), bsf = pick([950, 950, 1050, 1150, 1300]), psf = r(clamp(30000 + nrm() * 8000, 14000, 60000), -2);
  const rent = r((dt ? 155 : 95) + nrm() * 22 + (urb === 0 ? 30 : 0)), esc = pick([1.5, 2, 2, 2.5, 3, 10]);
  const dl = [dt, ri(0, FIRMS.dev.length - 1), bsf, psf, ri(18, 42), ri(0, 5), aadt, rent, pick([10, 15, 15, 20]), pick([3, 4, 4, 5]), esc];
  // financials (thousands $)
  const rev = r(clamp(1750 + nrm() * 380 + (aadt - 26000) / 120 - mk[2] * 70 + (tier === 1 ? 160 : tier === 4 ? -160 : 0), 900, 3200));
  const pct = Math.round(clamp(50 + (rev - mk[7]) / 6.5, 2, 99)), lo = r(rev * 0.86), hi = r(rev * 1.13);
  const cx = [r(38 + rnd() * 30), r(160 + rnd() * 120), r(240 + rnd() * 60), r(45 + rnd() * 35), r(110 + rnd() * 60), r((dt ? 520 : 380) + rnd() * 260), r(60 + rnd() * 50), r(rnd() < 0.4 ? 0 : 40 + rnd() * 120)];
  const bud = cx.reduce((s, v) => s + v, 0), ti = dt ? r(bud * (0.15 + rnd() * 0.1)) : 0, margin = r(clamp(22 + nrm() * 3, 12, 34), 1);
  const coc = r((rev * margin / 100 - rent) / (bud - ti) * 100, 1), spr = r(coc - 9.5, 1);
  const nx = ri(0, 3), xf = []; for (let k = 0; k < nx; k++) { const p = r(clamp(3 + rnd() * 12, 1, 22), 1); xf.push([CITIES[ci][1] + ri(1000, 9999), r(p * 18), p]); }
  // competitors × 5/10/15 min + CBSA
  const cp = COMPS.map(([, dtf], k) => { const d = urb === 0 ? 1.6 : urb === 2 ? 0.45 : 1; const m5 = Math.round(rnd() * 3 * d * (k === 5 ? 2 : 1)); const m10 = m5 + Math.round(rnd() * 5 * d); const m15 = m10 + Math.round(rnd() * 7 * d); return [m5, m10, m15, m15 + ri(5, 60)]; });
  const re = [r(0.2 + rnd() * 4, 1), ri(5, 99), r(0.1 + rnd() * 2.5, 1), ri(5, 99), r(0.1 + rnd() * 1.8, 1), ri(5, 99)], nc = [ri(0, 2400), ri(0, 220)];
  // crime index (100 = US avg): 9 categories × [site, high analog, nearest store, similar analog]
  const lvl = clamp(0.9 + nrm() * 0.35 + (urb === 0 ? 0.35 : urb === 2 ? -0.25 : 0), 0.25, 2.6), cr = [];
  for (let k = 0; k < 9; k++) { const b = 70 + rnd() * 60; cr.push(Math.round(b * lvl), Math.round(b * (1.5 + rnd() * 0.4)), Math.round(b * clamp(lvl + nrm() * 0.2, 0.2, 3)), Math.round(b * clamp(lvl * (0.9 + rnd() * 0.2), 0.2, 3))); }
  // comments: [kind 0 REM site, 1 AVP, 2 Ops, template, day, person]
  const cm = []; const nc2 = t === 'L' ? ri(1, 3) : ri(0, 3); for (let k = 0; k < nc2; k++) cm.push([k === 0 ? 0 : ri(0, 2), ri(0, 11), Math.min(TODAY, pStart + ri(5, 300)), ri(0, PEOPLE.length - 1)]);
  // Lucernex: members (12 roles → people), milestones (8), workflows, schedule slips
  const mb = []; for (let k = 0; k < 9; k++) mb.push(ri(0, PEOPLE.length - 1));
  const firms = [ri(0, 3), ri(0, 3), ri(0, 2), ri(0, 4)];
  const msOff = [30, 95, 130, 170, 215, 285, 410, 450], ms = msOff.map((o, k) => { const d = pStart + o + Math.round(slipTotal * (k / 7)); return d <= TODAY && (t !== 'L' || k < os) && (t !== 'R' || k < 1) ? d : null; });
  const slips = []; for (let k = 0; k < TASKS; k++) { const late = t === 'A' && rnd() < (moved ? 0.35 : 0.12); slips.push(late ? ri(2, 25) : rnd() < 0.08 ? -ri(1, 6) : 0); }
  const wf = []; for (let k = 0; k < 5; k++) wf.push(ri(0, 7));   // per-workflow variation seed (statuses derived from stage + dates)
  const lx = [t === 'F' ? 1 : 0, rnd() < 0.06 ? 1 : 0, t === 'F' ? ri(0, FIRMS.fr.length - 1) : -1, ri(1, 12), ri(1, 60), pick(['BT-A', 'BT-B', 'BT-C2', 'BT-D']), pStart, baseOpen, moved, ms, mb, firms, slips, wf];
  const ad = `${ri(100, 9899)} ${pick(STREETS)}`;
  sites.push([code(C[1]), t, sg, os, ad, ci, ll, tap, dp, age, gr, urb, tier, mk, dl, [rev, pct, lo, hi, r(bud), r(ti), coc, spr, margin], xf, cx, cp, re, nc, cr, cm, lx, link]);
}
const out = { v: 6, seed: SEED, today: TODAY, day0: '2020-01-01', note: '🧪 Example data: every site, number, person and comment here is made up (seeded generator tools/gen-portfolio.mjs). City centres are real public geography.',
  FORMAT: 'site = [code, type O/A/L/F/R, stage, openingStageIdx, address, cityIdx, [lat,lng], taPop, dayPop, medAge, growth%, urb 0/1/2, tier, mk[new,share%,compLvl,tam,open,pipe,pen%,near3AUVk,dOpenMi,dApprMi], dl[dealType 0GL/1BTS, devIdx, bldgSf, propSf, parking, coTenantIdx, aadt, rentK, termYrs, options, esc%], fn[revK, pctile, lowK, highK, budgetK, tiK, coc%, spread%, margin%], xfer[[code,$K,%]], capexK[8], comp[6][5m,10m,15m,cbsa], re[bigboxMi,pct,grocerMi,pct,centerMi,pct], newConst[homes,retailSf/1k], crime[9x4], comments[[kind,tpl,day,person]], lx[franchise, reloc, franchiseeIdx, roa, shopNo, bldgType, projStartDay, baselineOpenDay, timesMoved, milestones[8], members[9], firms[arch,civil,sign,gc], taskSlips[24], wfSeed[5]], linkedShopId]',
  cities: CITIES.map((c) => [c[0], c[1], c[2], c[6]]), people: PEOPLE, firms: FIRMS, comps: COMPS, cotenants: ['Grocery anchor','Big box','Quick-service pad','Fuel station','Strip center','None'], sites };
const json = JSON.stringify(out); writeFileSync(join(HERE, '..', 'portfolio.json'), json);
console.log('sites', sites.length, 'bytes', json.length);
