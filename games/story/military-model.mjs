export const FORBIDDEN_PUBLIC = [
  "ChatGPT",
  "coming soon",
  "Torvald",
  "\\bMathis\\b",
  "captain Rowan",
  "Captain Rowan",
];

export const UNIT_TYPE_IDS = Object.freeze([
  "infantry",
  "artillery",
  "cavalry",
  "armor",
  "air",
  "medic",
  "signal",
  "supply",
  "staff",
]);

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function badge(status) {
  if (status === "proposed") {
    return `<span class="badge proposed">Proposed · Non-Canon</span>`;
  }
  return `<span class="badge confirmed">Confirmed</span>`;
}

/** Nine imaginative branches: creatures + spirit-tech channeling a bounded tie/purpose. */
export const UNIT_TYPES = {
  infantry: {
    id: "infantry",
    label: "Wardline Infantry",
    status: "proposed",
    icon: "shield",
    creatureConcept:
      "Line fighters bonded to ash-mantle beetles whose chitin drinks weak spirit pressure. The beetles do not become soldiers; they coat shields and greaves so a Know-are fighter can hold a purpose-bound ward without shifting the spectrum.",
    battlefieldPurpose:
      "Hold ground, advance in formation, and absorb the first clash so specialist branches can work.",
    howItWorks:
      "Each squad carries a living mantle colony keyed to one oath-word (courage, endurance). Spirit-tech braziers warm the colony; the tie answers only that oath. Know-know beings are invited as witnesses to the oath, never enslaved as ammunition.",
    limitations:
      "If the oath is broken or the braziers cool, the mantle goes inert. Mantles cannot be retuned mid-battle to a different virtue.",
    commanderPlacement:
      "Under infantry companies (Iron / Ash). Platoon lieutenants own the oath braziers.",
    forceNotes: {
      guard:
        "Black Guard infantry use short, severe oaths taught in selection; mantles stay matte black.",
      empire:
        "Regional hosts favor brighter heraldic mantles keyed to kingdom saints.",
      enemy:
        "Desert foe uses sand-glass mantles that drink heat instead of ash — brittle but fierce in open dunes.",
    },
  },
  artillery: {
    id: "artillery",
    label: "Chorus Engines",
    status: "proposed",
    icon: "burst",
    creatureConcept:
      "Siege crews tend glass-lung hydras: many-throated beasts that exhale focused resonance, not shells. Spirit-tech tuning forks lock each throat to a single battlefield purpose (shatter stone, stun charge, crack spirit-ward).",
    battlefieldPurpose:
      "Break walls, dens, and massed wards from afar before the line closes.",
    howItWorks:
      "Operators never 'fire spirits.' They strike forks that invite a hydra throat to sing one prepared purpose. The Know-know answer is a directed pressure pulse lasting seconds, then silence.",
    limitations:
      "Each throat needs long rest. Wrong fork / wrong purpose injures the hydra and can backlash on the crew. Useless in tight tunnels.",
    commanderPlacement:
      "Proposed under Heavy (Hammer) as a support battery section, or Imperial siege trains.",
    forceNotes: {
      guard: "Rare, hush-kept; Cassian's workshops experiment with quieter forks.",
      empire: "Formal siege trains with numbered hydra teams.",
      enemy: "Uses dune-horn serpents that boom through canyons — loud, terrifying, inaccurate.",
    },
  },
  cavalry: {
    id: "cavalry",
    label: "Gale Striders",
    status: "proposed",
    icon: "hoof",
    creatureConcept:
      "Riders partner with wind-deer whose antlers hold feather-thin spirit sails. The animal remains a physical-heavy being; sails only catch a prepared travel-purpose, never free flight into other worlds.",
    battlefieldPurpose:
      "Scout flanks, chase routers, deliver urgent messages across open ground.",
    howItWorks:
      "Sails unfurl when the rider speaks a route-purpose. Short bursts of unnatural speed, then the sail folds. No spectrum shifting — only borrowed haste.",
    limitations:
      "Fails in dead calm canyons or when sails are torn. Animals panic near uncontrolled spirit creatures.",
    commanderPlacement:
      "Proposed recon attachments and Banner messenger pools under the Strategist staff.",
    forceNotes: {
      guard: "Pairs with Recon silence doctrine; sails dyed night-black.",
      empire: "Parade-bright sails for courier corps between Prefects and High Lords.",
      enemy: "Rides heat-mirage jackals — fast at dusk, useless at noon glare.",
    },
  },
  armor: {
    id: "armor",
    label: "Bastion Behemoths",
    status: "proposed",
    icon: "bulk",
    creatureConcept:
      "Living plate-moles: burrowing titans grown under spirit-tech growth rings. Crews ride in howdah-shells. The mole's purpose-tie is 'endure and push,' not think like a knight.",
    battlefieldPurpose:
      "Break spear walls, shield advancing infantry, drag Chorus Engines into range.",
    howItWorks:
      "Growth rings store compressed endurance from many small rites. On release, the mole shrugs blows that would fell a wagon. No free will over soldiers — it follows the rangercall of its handler.",
    limitations:
      "Slow to turn. Overuse cracks growth rings; beast must sleep in earth for days. Vulnerable to trench spikes.",
    commanderPlacement:
      "Proposed Heavy company attachment; Imperial fortress garrisons.",
    forceNotes: {
      guard: "Few beasts, treated as rare engines, not mascots.",
      empire: "Kingdom armories compete over bloodlines.",
      enemy: "Uses salt-carapace scarabs — lighter, swarm more, die faster.",
    },
  },
  air: {
    id: "air",
    label: "Lantern Kites",
    status: "proposed",
    icon: "kite",
    creatureConcept:
      "Handlers loft moth-ray gliders: wide-winged creatures that ride thermal and a single 'watch' purpose hung in a spirit lantern. Not aircraft with guns — living observation veils.",
    battlefieldPurpose:
      "See over ridges, spot spirit-creature bloom, drop signal ribbons for Recon.",
    howItWorks:
      "The lantern holds a Know-know invitation to notice and report patterns, not to judge or destroy. Moth-rays mirror that noticing as patterned wing-flashes crews can read.",
    limitations:
      "Storms ground them. Lanterns must stay lit with clean purpose; rage or panic fouls the feed. No bombing role in this proposal.",
    commanderPlacement:
      "Proposed under Recon; Empire tower-watches; enemy cliff-nests.",
    forceNotes: {
      guard: "Tight partnership with Seraphina's Recon and Old Hand signals.",
      empire: "City walls keep standing lantern roosts.",
      enemy: "Uses ash-bats that scream locations — effective, hard to hide.",
    },
  },
  medic: {
    id: "medic",
    label: "Mercy Spinners",
    status: "proposed",
    icon: "thread",
    creatureConcept:
      "Teams keep silk-weavers: gentle spiders whose threads bind wounds when spun through a 'mend flesh' purpose-loom. Spirit-tech looms refuse any kill-purpose spool.",
    battlefieldPurpose:
      "Stabilize wounded, seal bleeding, quiet panic so soldiers can be carried back.",
    howItWorks:
      "Loom and weaver answer only mend. Attempting to weaponize thread burns the spool and stuns the weaver. Know-know participation is compassionate attention, not possession of the patient.",
    limitations:
      "Cannot regrow limbs or cure deep corruption. Smoke, ash-storms, and blasphemy near the loom spoil silk.",
    commanderPlacement:
      "Proposed Banner aid tents under staff/supply; company litter teams.",
    forceNotes: {
      guard: "Aid tents travel with each Banner; Flame Order sometimes watches quietly.",
      empire: "Prefect hospitals train civilian weavers for levy armies.",
      enemy: "Uses resin-binders — faster clot, uglier scars, less mercy culture.",
    },
  },
  signal: {
    id: "signal",
    label: "Echo Relays",
    status: "proposed",
    icon: "wave",
    creatureConcept:
      "Crystal cicadas kept in lattice cages. Each cage is tuned to one call-sign purpose. They do not 'radio' — they re-sing a short phrase to the next cage in the chain.",
    battlefieldPurpose:
      "Carry orders and warnings across a Banner or Imperial corps without runners alone.",
    howItWorks:
      "An officer speaks into a mouthpiece fork. The cicada repeats only phrases matching its call-sign purpose. Long messages need several cages. Know-know beings may steady the echo but cannot invent new content.",
    limitations:
      "Jammed by louder spirit storms. Enemy can capture a cage and learn the call-sign. No infinite range.",
    commanderPlacement:
      "Proposed Strategist messenger group; Recon listening posts; Empire staff nets.",
    forceNotes: {
      guard: "Integrates with battle hand signs and Old Hand for silent backup.",
      empire: "Prefect–High Lord staffs keep formal relay ladders.",
      enemy: "Uses bone-flute chains — eerie, carry far in canyons, betray position.",
    },
  },
  supply: {
    id: "supply",
    label: "Root Caravans",
    status: "proposed",
    icon: "crate",
    creatureConcept:
      "Convoys led by ballast-oxen that grow living root-sleds. Roots grip sand or mud when a 'carry and keep' purpose is sung. No trucks — growing sledges and sealed spirit-cool jars.",
    battlefieldPurpose:
      "Move water, rations, spare mantles, fork-spares, and wounded litters behind the line.",
    howItWorks:
      "Root-sleds refuse to haul forbidden cargo tagged as plundered temple metal or unbound spirit vessels. Cool jars keep water and silk viable in desert heat.",
    limitations:
      "Slow. Roots need damp soil nightly or they shatter. Ambush on the train starves the Banner.",
    commanderPlacement:
      "Proposed under Strategist logistics clerks and Imperial train masters.",
    forceNotes: {
      guard: "Lean trains; Banners live off careful caches near Nightwatch routes.",
      empire: "Huge seasonal trains between kingdoms.",
      enemy: "Uses dune-snail barges — overnight move, daytime bury.",
    },
  },
  staff: {
    id: "staff",
    label: "Purpose Desk",
    status: "proposed",
    icon: "desk",
    creatureConcept:
      "Staff officers keep counsel-moths and map-ink fish: small beings that settle only on true, spoken intents. Spirit-tech desks record plans as luminous ink that fades if the speaker lies about the purpose.",
    battlefieldPurpose:
      "Plan marches, assign companies, keep Corvin-style staff work honest under pressure.",
    howItWorks:
      "A plan spoken as purpose becomes ink. Know-know scrutiny highlights contradictions. The desk cannot grant power — only reveal whether the stated purpose matches the order written.",
    limitations:
      "Useless if officers refuse to speak plainly. Ink panics in uncontrolled spirit storms. Not a weapon.",
    commanderPlacement:
      "Proposed Banner Strategist staff and High Lord / Prefect headquarters.",
    forceNotes: {
      guard: "Fits Corvin's calm planning culture; Alaric still decides.",
      empire: "Council staffs and Prefect offices use larger counsel halls.",
      enemy: "Warlord tents use omen-birds — persuasive, often wrong.",
    },
  },
};

export function getUnitType(id) {
  const t = UNIT_TYPES[id];
  if (!t) throw new Error(`unknown unit type ${id}`);
  return t;
}


/* ========== v4: 12 one-sheet charts (4 factions × 3 ranges) ========== */

export const FACTION_IDS = Object.freeze(["empire", "guard", "kingdom", "enemy"]);
export const RANGE_IDS = Object.freeze(["high-div", "hl-banner", "div-plt"]);

const FACTIONS = {
  empire: {
    id: "empire",
    title: "Empire",
    blurb: "Imperial sovereign, advisory council, and regional High Lord pattern. Many mid-tiers are proposed templates.",
  },
  guard: {
    id: "guard",
    title: "Black Guard",
    blurb: "Elite Imperial experiment. Confirmed ladder: High Lord → one Division of 5–8 Banners → companies → platoons. No formal regiments.",
  },
  kingdom: {
    id: "kingdom",
    title: "Desert Kingdom",
    blurb: "Imperial-allied Mid-East theater under High Lord Rashid (draft name). Canyon division mix: 3/4 desert regiments, 1/4 Imperial — separate from the Desert Enemy.",
  },
  enemy: {
    id: "enemy",
    title: "Desert Enemy",
    blurb: "Rival warrior-king host opposing the Empire in the desert. Hierarchy below king is largely proposed flesh.",
  },
};

const RANGES = {
  "high-div": {
    id: "high-div",
    label: "Highest → Divisions",
    short: "High→Div",
    hint: "Top command down to division-scale formations.",
  },
  "hl-banner": {
    id: "hl-banner",
    label: "High Lord → Banners",
    short: "HL→Banner",
    hint: "Theater / High Lord command down to Banner- or regiment-scale packages.",
  },
  "div-plt": {
    id: "div-plt",
    label: "Division → Platoons",
    short: "Div→Plt",
    hint: "One division (or home Banner for Guard) down through companies to platoons.",
  },
};

export function getFaction(id) {
  const f = FACTIONS[id];
  if (!f) throw new Error(`unknown faction ${id}`);
  return f;
}
export function getRange(id) {
  const r = RANGES[id];
  if (!r) throw new Error(`unknown range ${id}`);
  return r;
}
export function chartCombos() {
  const out = [];
  for (const faction of FACTION_IDS) for (const range of RANGE_IDS) out.push({ faction, range });
  return out;
}

export function chartUrlQuery(faction, range) {
  return `faction=${encodeURIComponent(faction)}&range=${encodeURIComponent(range)}`;
}
export function parseChartState(search) {
  const q = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  let faction = q.get("faction") || q.get("view") || "guard";
  let range = q.get("range") || "high-div";
  if (!FACTION_IDS.includes(faction)) faction = "guard";
  if (!RANGE_IDS.includes(range)) range = "high-div";
  return { faction, range };
}

/** Chart node factory */
function n(partial) {
  return {
    id: partial.id,
    label: partial.label, // short on-sheet
    fullName: partial.fullName || partial.label,
    unitType: partial.unitType || "",
    status: partial.status || "proposed",
    role: partial.role || "infantry",
    ech: partial.ech || "II",
    leader: partial.leader || "",
    strength: partial.strength || "",
    whatItIs: partial.whatItIs || "",
    functionText: partial.functionText || "",
    edgeKind: partial.edgeKind || "command", // command | relationship
    platoon: !!partial.platoon,
    children: partial.children || [],
  };
}

/* ---- Guard locked facts for invariants + charts ---- */
const GUARD_FACTS = {
  bannerStrength: "A few hundred guards — company / battalion scale",
  bannerCount: "5–8 Banners; no formal regiments",
  companies: ["recon", "iron", "ash", "heavy"],
  reconPlt: 2,
  ironPlt: 3,
  ashPlt: 3,
  heavyPlt: 1,
};

export function assertCanonInvariants() {
  const total =
    GUARD_FACTS.reconPlt + GUARD_FACTS.ironPlt + GUARD_FACTS.ashPlt + GUARD_FACTS.heavyPlt;
  if (total !== 9) throw new Error("Alaric must have 9 platoons");
  if (GUARD_FACTS.companies.length !== 4) throw new Error("4 companies");
  if (!/few hundred/i.test(GUARD_FACTS.bannerStrength)) throw new Error("Banner strength");
  if (!/no formal regiments/i.test(GUARD_FACTS.bannerCount)) throw new Error("regiments");
  if (!/5\s*[–-]\s*8/.test(GUARD_FACTS.bannerCount)) throw new Error("banner count");
}

/* ---- Trees per faction × range ---- */
function treeGuardHighDiv() {
  return n({
    id: "emp",
    label: "Emperor",
    fullName: "The Emperor (Imperial sovereign)",
    unitType: "Sovereign",
    status: "confirmed",
    role: "hq",
    ech: "XXXX",
    whatItIs: "Imperial sovereign over High Lords.",
    functionText: "Final political-military authority of the Empire.",
    children: [
      n({
        id: "hl",
        label: "HL Cassian",
        fullName: "High Lord Cassian Thorne",
        unitType: "High Lord",
        status: "confirmed",
        role: "hq",
        ech: "XXX",
        leader: "Cassian Thorne",
        whatItIs: "Political-military head of the Black Guard experiment.",
        functionText: "Commands the Guard division and its Banner deployments.",
        children: [
          n({
            id: "div",
            label: "BG Division",
            fullName: "Black Guard Division",
            unitType: "Division",
            status: "confirmed",
            role: "hq",
            ech: "XX",
            strength: GUARD_FACTS.bannerCount,
            whatItIs: "The entire Black Guard counts as one division spread across fronts — no formal regiment layer.",
            functionText: "Coordinates 5–8 Banners. Confirmed: no formal regiments.",
            children: [],
          }),
        ],
      }),
    ],
  });
}

function treeGuardHlBanner() {
  return n({
    id: "hl",
    label: "HL Cassian",
    fullName: "High Lord Cassian Thorne",
    unitType: "High Lord",
    status: "confirmed",
    role: "hq",
    ech: "XXX",
    children: [
      n({
        id: "div",
        label: "BG Division",
        fullName: "Black Guard Division",
        unitType: "Division",
        status: "confirmed",
        role: "hq",
        ech: "XX",
        strength: GUARD_FACTS.bannerCount,
        whatItIs: "One division of 5–8 Banners; no formal regiments (2–3 Banners would be a regiment if used — not locked).",
        functionText: "Assigns Banners to fronts.",
        children: [
          n({
            id: "alaric",
            label: "Alaric Banner",
            fullName: "Alaric’s Banner",
            unitType: "Banner",
            status: "confirmed",
            role: "hq",
            ech: "III",
            leader: "Sir Alaric Vaelen",
            strength: GUARD_FACTS.bannerStrength,
            whatItIs: "Home Banner of the story — few hundred elites.",
            functionText: "Combined recon, infantry, and heavy under one commander.",
          }),
          n({
            id: "other",
            label: "Other Banners ×4–7",
            fullName: "Other Black Guard Banners (template ×4–7)",
            unitType: "Banner group",
            status: "confirmed",
            role: "infantry",
            ech: "III",
            strength: "4–7 further Banners (total Guard 5–8)",
            whatItIs: "Representative repeated Banner formations. Count locked as part of 5–8 total; individual names not locked.",
            functionText: "Other fronts while sharing mission knowledge up the chain.",
          }),
        ],
      }),
    ],
  });
}

function treeGuardDivPlt() {
  const ironPlts = [1, 2, 3].map((i) =>
    n({
      id: `iron-p${i}`,
      label: `Iron Plt ${i}`,
      fullName: `Iron Company Platoon ${i} (of 3)`,
      unitType: "Platoon",
      status: "confirmed",
      role: "infantry",
      ech: "•••",
      platoon: true,
      whatItIs: "One of three Iron fighting platoons. Lieutenants unnamed in canon.",
      functionText: "Line combat under Captain Garrick (name provisional).",
    })
  );
  const ashPlts = [1, 2, 3].map((i) =>
    n({
      id: `ash-p${i}`,
      label: `Ash Plt ${i}`,
      fullName: `Ash Company Platoon ${i} (of 3)`,
      unitType: "Platoon",
      status: "confirmed",
      role: "infantry",
      ech: "•••",
      platoon: true,
      whatItIs: "One of three Ash fighting platoons.",
      functionText: "Line combat under Captain Dagny (name provisional).",
    })
  );
  return n({
    id: "div",
    label: "BG Division",
    fullName: "Black Guard Division (focus: Alaric Banner)",
    unitType: "Division",
    status: "confirmed",
    role: "hq",
    ech: "XX",
    children: [
      n({
        id: "alaric",
        label: "Alaric Banner",
        fullName: "Alaric’s Banner",
        unitType: "Banner",
        status: "confirmed",
        role: "hq",
        ech: "III",
        leader: "Sir Alaric Vaelen",
        strength: GUARD_FACTS.bannerStrength,
        children: [
          n({
            id: "corvin",
            label: "Staff (Corvin)",
            fullName: "Banner Strategist Staff",
            unitType: "Staff",
            status: "confirmed",
            role: "staff",
            ech: "•",
            leader: "Corvin (provisional)",
            whatItIs: "Planning desk — not a combat company.",
            functionText: "Messengers, maps, timing. Proposed Purpose Desk / Echo / Root attach here.",
            children: [
              n({ id: "cap-staff", label: "Purpose Desk", fullName: "Proposed Purpose Desk Cell", unitType: "Proposed staff", status: "proposed", role: "staff", ech: "•", whatItIs: getUnitType("staff").creatureConcept, functionText: getUnitType("staff").battlefieldPurpose }),
              n({ id: "cap-signal", label: "Echo Relay", fullName: "Proposed Echo Relay Cage-Net", unitType: "Proposed signal", status: "proposed", role: "signal", ech: "•", whatItIs: getUnitType("signal").creatureConcept, functionText: getUnitType("signal").battlefieldPurpose }),
              n({ id: "cap-supply", label: "Root Caravan", fullName: "Proposed Root Caravan Detail", unitType: "Proposed supply", status: "proposed", role: "supply", ech: "•", whatItIs: getUnitType("supply").creatureConcept, functionText: getUnitType("supply").battlefieldPurpose }),
            ],
          }),
          n({
            id: "recon",
            label: "Recon Co",
            fullName: "Recon Company",
            unitType: "Company",
            status: "confirmed",
            role: "cavalry",
            ech: "I",
            leader: "Capt. Seraphina",
            strength: "2 platoons",
            children: [
              n({ id: "brann", label: "Brann Plt", fullName: "Recon Platoon (Mute) — Brann", unitType: "Platoon", status: "confirmed", role: "cavalry", ech: "•••", platoon: true, leader: "Brann (provisional)" }),
              n({ id: "joss", label: "Joss Plt", fullName: "Recon Platoon (Speaker) — Joss", unitType: "Platoon", status: "confirmed", role: "cavalry", ech: "•••", platoon: true, leader: "Joss (provisional)" }),
              n({ id: "cap-cavalry", label: "Gale Striders", fullName: "Proposed Gale Strider Detachment", unitType: "Proposed cavalry", status: "proposed", role: "cavalry", ech: "•", whatItIs: getUnitType("cavalry").creatureConcept, functionText: getUnitType("cavalry").battlefieldPurpose }),
              n({ id: "cap-air", label: "Lantern Kites", fullName: "Proposed Lantern Kite Flight", unitType: "Proposed air", status: "proposed", role: "air", ech: "•", whatItIs: getUnitType("air").creatureConcept, functionText: getUnitType("air").battlefieldPurpose }),
            ],
          }),
          n({
            id: "iron",
            label: "Iron Co",
            fullName: "Iron Company",
            unitType: "Company",
            status: "confirmed",
            role: "infantry",
            ech: "I",
            leader: "Capt. Garrick (prov.)",
            strength: "3 platoons",
            children: [
              ...ironPlts,
              n({ id: "cap-infantry", label: "Wardline", fullName: "Proposed Wardline Mantle Section", unitType: "Proposed infantry", status: "proposed", role: "infantry", ech: "•", whatItIs: getUnitType("infantry").creatureConcept, functionText: getUnitType("infantry").battlefieldPurpose }),
              n({ id: "cap-medic", label: "Mercy Spin.", fullName: "Proposed Mercy Spinner Aid Team", unitType: "Proposed medic", status: "proposed", role: "medic", ech: "•", whatItIs: getUnitType("medic").creatureConcept, functionText: getUnitType("medic").battlefieldPurpose }),
            ],
          }),
          n({
            id: "ash",
            label: "Ash Co",
            fullName: "Ash Company",
            unitType: "Company",
            status: "confirmed",
            role: "infantry",
            ech: "I",
            leader: "Capt. Dagny (prov.)",
            strength: "3 platoons",
            children: ashPlts,
          }),
          n({
            id: "heavy",
            label: "Heavy Co",
            fullName: "Heavy Company (the Hammer)",
            unitType: "Company",
            status: "confirmed",
            role: "armor",
            ech: "I",
            leader: "Capt. Brynja (prov.)",
            strength: "1 platoon",
            children: [
              n({ id: "heavy-lt", label: "Heavy Plt", fullName: "Heavy Platoon", unitType: "Platoon", status: "confirmed", role: "armor", ech: "•••", platoon: true }),
              n({ id: "cap-artillery", label: "Chorus Eng.", fullName: "Proposed Chorus Engine Battery", unitType: "Proposed artillery", status: "proposed", role: "artillery", ech: "•", whatItIs: getUnitType("artillery").creatureConcept, functionText: getUnitType("artillery").battlefieldPurpose }),
              n({ id: "cap-armor", label: "Bastion", fullName: "Proposed Bastion Behemoth Pair", unitType: "Proposed armor", status: "proposed", role: "armor", ech: "•", whatItIs: getUnitType("armor").creatureConcept, functionText: getUnitType("armor").battlefieldPurpose }),
            ],
          }),
        ],
      }),
    ],
  });
}

function treeEmpireHighDiv() {
  return n({
    id: "emp",
    label: "Emperor",
    fullName: "The Emperor",
    unitType: "Sovereign",
    status: "confirmed",
    role: "hq",
    ech: "XXXX",
    children: [
      n({
        id: "council",
        label: "Council (adv.)",
        fullName: "Council of High Lords + Prefects",
        unitType: "Advisory council",
        status: "confirmed",
        role: "staff",
        ech: "III",
        edgeKind: "relationship",
        whatItIs: "Advisory body — not a corps HQ over the nine regions.",
        functionText: "Advice and coordination; Prefects are civil, High Lords military.",
        children: [],
      }),
      n({
        id: "regions",
        label: "Regions ×9",
        fullName: "Nine regional High Lord seats (template ×9)",
        unitType: "Region pattern",
        status: "confirmed",
        role: "hq",
        ech: "XXX",
        whatItIs: "Each region has a High Lord (military) and Prefect (civil).",
        functionText: "Regional command pattern across the Empire.",
        children: [
          n({
            id: "reg-div",
            label: "Region host",
            fullName: "Proposed regional host / division layer",
            unitType: "Division (proposed)",
            status: "proposed",
            role: "hq",
            ech: "XX",
            whatItIs: "Bridge from High Lord to field hosts — PROPOSED, not locked.",
            functionText: "Groups kingdom hosts under a regional seat.",
          }),
        ],
      }),
    ],
  });
}

function treeEmpireHlBanner() {
  return n({
    id: "hl",
    label: "High Lord",
    fullName: "Regional High Lord (template)",
    unitType: "High Lord",
    status: "confirmed",
    role: "hq",
    ech: "XXX",
    whatItIs: "Military chief of a region. Title confirmed; specific org below often proposed.",
    functionText: "Commands regional military effort.",
    children: [
      n({
        id: "prefect",
        label: "Prefect (civil)",
        fullName: "Regional Prefect",
        unitType: "Civil office",
        status: "confirmed",
        role: "staff",
        ech: "II",
        edgeKind: "relationship",
        whatItIs: "Civil officer over kings/lords union — outranked by High Lord in military matters.",
        functionText: "Civil binding, not army command.",
      }),
      n({
        id: "host",
        label: "Kingdom host ×N",
        fullName: "Proposed kingdom hosts under High Lord",
        unitType: "Host (proposed)",
        status: "proposed",
        role: "hq",
        ech: "XX",
        whatItIs: "Proposed field hosts — size and count not locked.",
        functionText: "Fighting packages analogous to Banner-scale for Imperial regions.",
        children: [
          n({
            id: "bannerish",
            label: "Banner-scale ×?",
            fullName: "Proposed Banner-scale packages",
            unitType: "Banner-scale (proposed)",
            status: "proposed",
            role: "infantry",
            ech: "III",
            whatItIs: "Template for mid packages under a host. Not Guard Banners.",
            functionText: "Deployable chunks under a regional host.",
          }),
        ],
      }),
    ],
  });
}

function treeEmpireDivPlt() {
  return n({
    id: "host",
    label: "Host (prop.)",
    fullName: "Proposed Imperial field host",
    unitType: "Division-scale host",
    status: "proposed",
    role: "hq",
    ech: "XX",
    whatItIs: "One proposed Imperial host broken to company/platoon for comparison.",
    functionText: "Template only — counts not locked.",
    children: [
      n({
        id: "line",
        label: "Line Co ×4",
        fullName: "Proposed line companies (template ×4)",
        unitType: "Company group",
        status: "proposed",
        role: "infantry",
        ech: "I",
        children: [
          n({ id: "plt", label: "Plt ×3 / Co", fullName: "Proposed platoons (×3 per company template)", unitType: "Platoon group", status: "proposed", role: "infantry", ech: "•••", platoon: true }),
        ],
      }),
      n({
        id: "supp",
        label: "Support (prop.)",
        fullName: "Proposed support (creature/spirit-tech sketch)",
        unitType: "Support",
        status: "proposed",
        role: "staff",
        ech: "I",
        children: [
          n({ id: "e-arty", label: "Chorus Eng.", fullName: "Proposed Chorus Engines", status: "proposed", role: "artillery", ech: "•", unitType: "Proposed artillery", whatItIs: getUnitType("artillery").creatureConcept }),
          n({ id: "e-sig", label: "Echo Relay", fullName: "Proposed Echo Relays", status: "proposed", role: "signal", ech: "•", unitType: "Proposed signal", whatItIs: getUnitType("signal").creatureConcept }),
          n({ id: "e-sup", label: "Root Caravan", fullName: "Proposed Root Caravans", status: "proposed", role: "supply", ech: "•", unitType: "Proposed supply", whatItIs: getUnitType("supply").creatureConcept }),
        ],
      }),
    ],
  });
}

function treeKingdomHighDiv() {
  return n({
    id: "emp",
    label: "Emperor",
    fullName: "The Emperor (Imperial sovereign)",
    unitType: "Sovereign",
    status: "confirmed",
    role: "hq",
    ech: "XXXX",
    children: [
      n({
        id: "rashid",
        label: "HL Rashid",
        fullName: "High Lord Rashid al-Zahir (draft name) — Desert Kingdom theater",
        unitType: "High Lord",
        status: "proposed",
        role: "hq",
        ech: "XXX",
        leader: "Rashid al-Zahir (draft)",
        whatItIs: "Theater commander for Mid-East Desert Kingdom — Imperial ally, NOT the Desert Enemy. Name still draft on Decide.",
        functionText: "Keeps desert armies united with Imperial interests; canyon city is a key hold.",
        children: [
          n({
            id: "canyon-div",
            label: "Canyon Div",
            fullName: "Canyon city division (allied)",
            unitType: "Division",
            status: "confirmed",
            role: "hq",
            ech: "XX",
            strength: "Mix: 3/4 desert kingdom regiments + 1/4 Imperial regiments",
            whatItIs: "Division holding the canyon path’s major city — known mix of desert and Imperial regiments.",
            functionText: "Guards the canyon approach; saved in story beats involving Alaric.",
          }),
        ],
      }),
    ],
  });
}

function treeKingdomHlBanner() {
  return n({
    id: "rashid",
    label: "HL Rashid",
    fullName: "High Lord Rashid al-Zahir (draft) — theater command",
    unitType: "High Lord",
    status: "proposed",
    role: "hq",
    ech: "XXX",
    whatItIs: "Equivalent High Lord seat for Desert Kingdom theater. Title/name not fully locked.",
    functionText: "Coordinates allied desert and Imperial contingent forces.",
    children: [
      n({
        id: "canyon-div",
        label: "Canyon Div",
        fullName: "Canyon city division",
        unitType: "Division",
        status: "confirmed",
        role: "hq",
        ech: "XX",
        strength: "3/4 desert + 1/4 Imperial regiments",
        children: [
          n({
            id: "des-reg",
            label: "Desert Reg ×3",
            fullName: "Desert kingdom regiments (template ×3 of 4)",
            unitType: "Regiment group",
            status: "confirmed",
            role: "infantry",
            ech: "III",
            strength: "Three-quarters of the division — desert kingdom troops",
            whatItIs: "Representative desert regiments making up 3/4 of the canyon division.",
            functionText: "Hold canyon works and desert approaches.",
          }),
          n({
            id: "imp-reg",
            label: "Imperial Reg ×1",
            fullName: "Imperial regiment contingent (×1 of 4)",
            unitType: "Regiment",
            status: "confirmed",
            role: "infantry",
            ech: "III",
            strength: "One-quarter of the division — Imperial",
            whatItIs: "Imperial regiment slice inside the canyon division.",
            functionText: "Stiffens the allied hold with Imperial drill.",
          }),
        ],
      }),
    ],
  });
}

function treeKingdomDivPlt() {
  return n({
    id: "canyon-div",
    label: "Canyon Div",
    fullName: "Canyon city division",
    unitType: "Division",
    status: "confirmed",
    role: "hq",
    ech: "XX",
    strength: "3/4 desert + 1/4 Imperial",
    children: [
      n({
        id: "reg-t",
        label: "Regiment (tmpl)",
        fullName: "Representative regiment (desert or Imperial pattern)",
        unitType: "Regiment template",
        status: "proposed",
        role: "infantry",
        ech: "III",
        whatItIs: "One regiment expanded to company/platoon for readability — pattern repeats ×4 in the division (3 desert + 1 Imperial).",
        functionText: "Template ×4 implied by division mix; not inventing extra totals.",
        children: [
          n({
            id: "co",
            label: "Line Co ×3",
            fullName: "Proposed line companies (×3 template)",
            unitType: "Company group",
            status: "proposed",
            role: "infantry",
            ech: "I",
            children: [
              n({ id: "plt", label: "Plt ×3 / Co", fullName: "Proposed platoons ×3 per company", unitType: "Platoon group", status: "proposed", role: "infantry", ech: "•••", platoon: true }),
            ],
          }),
          n({
            id: "k-sup",
            label: "Support (prop.)",
            fullName: "Proposed canyon support (spirit-tech sketch)",
            unitType: "Support",
            status: "proposed",
            role: "staff",
            ech: "I",
            children: [
              n({ id: "k-cav", label: "Gale/Camel", fullName: "Proposed desert cavalry / Gale analogue", status: "proposed", role: "cavalry", ech: "•", unitType: "Proposed cavalry", whatItIs: getUnitType("cavalry").forceNotes.empire }),
              n({ id: "k-med", label: "Mercy Spin.", fullName: "Proposed Mercy Spinner aid", status: "proposed", role: "medic", ech: "•", unitType: "Proposed medic", whatItIs: getUnitType("medic").creatureConcept }),
              n({ id: "k-sig", label: "Echo Relay", fullName: "Proposed Echo Relay", status: "proposed", role: "signal", ech: "•", unitType: "Proposed signal", whatItIs: getUnitType("signal").creatureConcept }),
            ],
          }),
        ],
      }),
    ],
  });
}

function treeEnemyHighDiv() {
  return n({
    id: "king",
    label: "Warrior King",
    fullName: "Desert Enemy Warrior King",
    unitType: "Warrior King",
    status: "confirmed",
    role: "hq",
    ech: "XXX",
    whatItIs: "Enemy sovereign opposing Empire presence in the desert. Not Rashid / Desert Kingdom.",
    functionText: "Orders spirit-creature use and the desert war.",
    children: [
      n({
        id: "hosts",
        label: "War Hosts ×?",
        fullName: "Proposed war hosts under the King",
        unitType: "Host group (proposed)",
        status: "proposed",
        role: "hq",
        ech: "XX",
        whatItIs: "Division-scale enemy hosts — count not locked.",
        functionText: "Main field armies of the rival kingdom.",
      }),
    ],
  });
}

function treeEnemyHlBanner() {
  return n({
    id: "host-cmd",
    label: "Host Lord*",
    fullName: "Proposed Host Lord (High-Lord-equivalent commander)",
    unitType: "Host commander (proposed)",
    status: "proposed",
    role: "hq",
    ech: "XXX",
    whatItIs: "No confirmed High Lord title on the enemy side. This node is a PROPOSED equivalence for chart range 2 — not canonizing the title.",
    functionText: "Commands one war host’s Banner-scale warbands.",
    children: [
      n({
        id: "host",
        label: "War Host",
        fullName: "Proposed war host",
        unitType: "Host",
        status: "proposed",
        role: "hq",
        ech: "XX",
        children: [
          n({
            id: "warband",
            label: "Warbands ×N",
            fullName: "Proposed warbands (Banner-scale)",
            unitType: "Warband group",
            status: "proposed",
            role: "infantry",
            ech: "III",
            whatItIs: "Banner-analogue packages under a host.",
            functionText: "Raid, storm, and hold with spirit-creature shock.",
          }),
        ],
      }),
    ],
  });
}

function treeEnemyDivPlt() {
  return n({
    id: "host",
    label: "War Host",
    fullName: "Proposed enemy war host",
    unitType: "Host",
    status: "proposed",
    role: "hq",
    ech: "XX",
    children: [
      n({
        id: "wb",
        label: "Warband",
        fullName: "Proposed warband",
        unitType: "Warband",
        status: "proposed",
        role: "infantry",
        ech: "III",
        children: [
          n({
            id: "shock",
            label: "Shock Co ×2",
            fullName: "Proposed shock companies ×2",
            unitType: "Company group",
            status: "proposed",
            role: "infantry",
            ech: "I",
            children: [
              n({ id: "eplt", label: "Plt ×3 / Co", fullName: "Proposed platoons ×3", unitType: "Platoon group", status: "proposed", role: "infantry", ech: "•••", platoon: true }),
            ],
          }),
          n({
            id: "beast",
            label: "Beast / spirit",
            fullName: "Proposed spirit-creature branches",
            unitType: "Support",
            status: "proposed",
            role: "armor",
            ech: "I",
            children: [
              n({ id: "en-inf", label: "Wardline*", fullName: "Enemy Wardline analogue", status: "proposed", role: "infantry", ech: "•", unitType: "Proposed infantry", whatItIs: getUnitType("infantry").forceNotes.enemy }),
              n({ id: "en-arty", label: "Chorus*", fullName: "Enemy Chorus analogue", status: "proposed", role: "artillery", ech: "•", unitType: "Proposed artillery", whatItIs: getUnitType("artillery").forceNotes.enemy }),
              n({ id: "en-air", label: "Kites*", fullName: "Enemy air / kite analogue", status: "proposed", role: "air", ech: "•", unitType: "Proposed air", whatItIs: getUnitType("air").forceNotes.enemy }),
              n({ id: "en-cav", label: "Striders*", fullName: "Enemy cavalry analogue", status: "proposed", role: "cavalry", ech: "•", unitType: "Proposed cavalry", whatItIs: getUnitType("cavalry").forceNotes.enemy }),
            ],
          }),
        ],
      }),
    ],
  });
}

const TREE_BUILDERS = {
  "guard:high-div": treeGuardHighDiv,
  "guard:hl-banner": treeGuardHlBanner,
  "guard:div-plt": treeGuardDivPlt,
  "empire:high-div": treeEmpireHighDiv,
  "empire:hl-banner": treeEmpireHlBanner,
  "empire:div-plt": treeEmpireDivPlt,
  "kingdom:high-div": treeKingdomHighDiv,
  "kingdom:hl-banner": treeKingdomHlBanner,
  "kingdom:div-plt": treeKingdomDivPlt,
  "enemy:high-div": treeEnemyHighDiv,
  "enemy:hl-banner": treeEnemyHlBanner,
  "enemy:div-plt": treeEnemyDivPlt,
};

export function getChartTree(faction, range) {
  const key = `${faction}:${range}`;
  const b = TREE_BUILDERS[key];
  if (!b) throw new Error(`no chart tree for ${key}`);
  return b();
}

export function buildChartMeta(faction, range) {
  const f = getFaction(faction);
  const r = getRange(range);
  return {
    faction,
    range,
    title: `${f.title} — ${r.label}`,
    shortTitle: `${f.title} · ${r.short}`,
    blurb: f.blurb,
    hint: r.hint,
  };
}

/* ---- Compact one-sheet SVG layout ---- */
const BOX_W = 40;
const BOX_H = 26;
const V_GAP = 52;
const H_GAP = 14;
const PAD_X = 28;
const PAD_Y = 36;
const LABEL_MAX = 18;
const SHEET_W = 1100;
const SHEET_H = 720;

const ROLE_FILL = {
  hq: "#6b8f71",
  infantry: "#9eb6c8",
  cavalry: "#d4b84a",
  artillery: "#c45c48",
  armor: "#8a8a8a",
  air: "#8eb4d8",
  medic: "#f0f0f0",
  signal: "#b8a0d0",
  supply: "#c4b59a",
  staff: "#d8d8d8",
};

function roleGlyph(role, cx, cy) {
  const s = 8;
  if (role === "infantry") return `<path d="M${cx - s} ${cy - s} L${cx + s} ${cy + s} M${cx + s} ${cy - s} L${cx - s} ${cy + s}" stroke="#111" stroke-width="2" fill="none"/>`;
  if (role === "cavalry") return `<path d="M${cx - s} ${cy + s * 0.55} L${cx + s} ${cy - s * 0.55}" stroke="#111" stroke-width="2.2" fill="none"/>`;
  if (role === "artillery") return `<circle cx="${cx}" cy="${cy}" r="5" fill="#111"/>`;
  if (role === "armor") return `<ellipse cx="${cx}" cy="${cy}" rx="10" ry="6.5" fill="none" stroke="#111" stroke-width="2"/>`;
  if (role === "air") return `<path d="M${cx - 9} ${cy} Q${cx} ${cy - 7} ${cx + 9} ${cy} Q${cx} ${cy + 7} ${cx - 9} ${cy}" fill="none" stroke="#111" stroke-width="1.8"/>`;
  if (role === "medic") return `<path d="M${cx - 2} ${cy - 7} H${cx + 2} V${cy - 2} H${cx + 7} V${cy + 2} H${cx + 2} V${cy + 7} H${cx - 2} V${cy + 2} H${cx - 7} V${cy - 2} H${cx - 2} Z" fill="#c0392b"/>`;
  if (role === "signal") return `<path d="M${cx - 7} ${cy + 5} L${cx - 2} ${cy - 5} L${cx + 2} ${cy + 2} L${cx + 7} ${cy - 5}" fill="none" stroke="#111" stroke-width="2"/>`;
  if (role === "supply") return `<g><circle cx="${cx - 4}" cy="${cy}" r="2.8" fill="#111"/><circle cx="${cx + 4}" cy="${cy}" r="2.8" fill="#111"/><circle cx="${cx}" cy="${cy - 4}" r="2.8" fill="#111"/></g>`;
  if (role === "staff") return `<g><rect x="${cx - 6}" y="${cy - 1.5}" width="12" height="3" fill="#111"/><rect x="${cx - 1.5}" y="${cy - 7}" width="3" height="12" fill="#111"/></g>`;
  return `<path d="M${cx - 7} ${cy + 8} V${cy - 8} H${cx + 5} L${cx + 2} ${cy - 2} H${cx - 7}" fill="#111"/>`;
}

function shortLabel(s) {
  const t = String(s || "");
  return t.length > LABEL_MAX ? t.slice(0, LABEL_MAX - 1) + "…" : t;
}

function estimateLabelW(label) {
  return Math.min(150, 6 + Math.min(label.length, LABEL_MAX) * 6.6);
}

function measure(node) {
  const kids = node.children || [];
  const self = BOX_W + 8 + estimateLabelW(shortLabel(node.label)) + H_GAP;
  if (!kids.length) return Math.max(self, 88);
  let sum = 0;
  for (const k of kids) sum += measure(k);
  return Math.max(self, sum);
}

function place(node, left, top, positions) {
  const width = measure(node);
  const x = left + width / 2;
  const y = top;
  positions.push({ node, x, y, width });
  const kids = node.children || [];
  if (!kids.length) return;
  let cursor = left;
  for (const k of kids) {
    const w = measure(k);
    place(k, cursor, top + V_GAP, positions);
    cursor += w;
  }
}

function indexNodes(node, map = {}) {
  map[node.id] = node;
  for (const c of node.children || []) indexNodes(c, map);
  return map;
}

export function buildChartSvg(faction, range) {
  const meta = buildChartMeta(faction, range);
  const root = getChartTree(faction, range);
  const positions = [];
  const treeW = measure(root);
  place(root, PAD_X, PAD_Y + 8, positions);

  let maxX = 0;
  let maxY = 0;
  for (const p of positions) {
    maxX = Math.max(maxX, p.x + BOX_W / 2 + estimateLabelW(shortLabel(p.node.label)) + 24);
    maxY = Math.max(maxY, p.y + BOX_H / 2 + 28);
  }
  // Fit onto one sheet: if natural size exceeds sheet, scale coordinates
  const contentW = Math.max(maxX + PAD_X, 640);
  const contentH = Math.max(maxY + PAD_Y, 420);
  const scale = Math.min(1, (SHEET_W - 8) / contentW, (SHEET_H - 8) / contentH);
  const vbW = Math.round(Math.min(SHEET_W, contentW * scale + (scale < 1 ? 0 : 0)));
  const vbH = Math.round(Math.min(SHEET_H, contentH * scale + (scale < 1 ? 0 : 0)));
  // Prefer fixed sheet when scaled; otherwise tight content box capped at sheet
  const artW = scale < 1 ? SHEET_W : Math.min(SHEET_W, Math.ceil(contentW));
  const artH = scale < 1 ? SHEET_H : Math.min(SHEET_H, Math.ceil(contentH));

  const sx = (x) => x * scale + (artW - contentW * scale) / 2;
  const sy = (y) => y * scale + 10;

  const byId = Object.fromEntries(positions.map((p) => [p.node.id, p]));

  let paths = "";
  for (const p of positions) {
    const kids = p.node.children || [];
    if (!kids.length) continue;
    const childPos = kids.map((c) => byId[c.id]);
    const xs = childPos.map((c) => sx(c.x));
    const busY = (sy(p.y) + (BOX_H / 2) * scale + sy(childPos[0].y) - (BOX_H / 2) * scale) / 2;
    const px = sx(p.x);
    paths += `<path class="connector" d="M${px} ${sy(p.y) + (BOX_H / 2) * scale} V${busY}" fill="none" stroke="#111" stroke-width="1.4"/>`;
    if (kids.length > 1) {
      paths += `<path class="connector" d="M${Math.min(...xs)} ${busY} H${Math.max(...xs)}" fill="none" stroke="#111" stroke-width="1.4"/>`;
    }
    for (const c of childPos) {
      const dash = c.node.edgeKind === "relationship" ? ` stroke-dasharray="4 3"` : "";
      paths += `<path class="connector" d="M${sx(c.x)} ${busY} V${sy(c.y) - (BOX_H / 2) * scale}" fill="none" stroke="#111" stroke-width="1.4"${dash}/>`;
    }
  }

  let nodes = "";
  for (const p of positions) {
    const node = p.node;
    const x = sx(p.x);
    const y = sy(p.y);
    const bw = BOX_W * scale;
    const bh = BOX_H * scale;
    const fill = ROLE_FILL[node.role] || ROLE_FILL.infantry;
    const proposed = node.status === "proposed";
    const stroke = proposed ? "#8a5a00" : "#111";
    const sw = proposed ? 2.2 : 1.6;
    const dash = node.edgeKind === "relationship" ? ` stroke-dasharray="4 3"` : "";
    const lab = shortLabel(node.label);
    const fs = Math.max(9, Math.round(11 * Math.min(1, scale + 0.15)));
    const pltAttr = node.platoon ? ` data-platoon="1"` : "";
    nodes += `<g class="mil-node" data-unit-id="${esc(node.id)}" data-status="${esc(node.status)}"${pltAttr} tabindex="0" role="button" aria-label="${esc(node.fullName)}">
      <text class="echelon" x="${x}" y="${y - bh / 2 - 4}" text-anchor="middle" font-size="${Math.max(8, fs - 1)}" font-family="Georgia,serif" fill="#111">${esc(node.ech)}</text>
      <rect class="tac-frame" x="${x - bw / 2}" y="${y - bh / 2}" width="${bw}" height="${bh}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>
      <g transform="translate(0 0)">${roleGlyph(node.role, x, y)}</g>
      <text class="unit-label" x="${x + bw / 2 + 6}" y="${y + 1}" font-size="${fs}" font-family="Georgia,serif" fill="#111">${esc(lab)}</text>
    </g>`;
  }

  let foot = "";
  if (faction === "guard") {
    foot = `<text class="sheet-note" x="16" y="${artH - 12}" font-size="10" font-family="system-ui,sans-serif" fill="#444">Black Guard: 5–8 Banners; no formal regiments. No locked mid-tier between Banner and Division.</text>`;
  } else if (faction === "kingdom") {
    foot = `<text class="sheet-note" x="16" y="${artH - 12}" font-size="10" font-family="system-ui,sans-serif" fill="#444">Canyon division mix: 3/4 desert kingdom regiments + 1/4 Imperial. Allied theater (Rashid) — not Desert Enemy.</text>`;
  } else if (faction === "enemy") {
    foot = `<text class="sheet-note" x="16" y="${artH - 12}" font-size="10" font-family="system-ui,sans-serif" fill="#444">*Host Lord = proposed High-Lord-equivalent title — not canon. Separate from Desert Kingdom / Rashid.</text>`;
  }

  return `<svg class="mil-chart-svg" data-chart-faction="${esc(faction)}" data-chart-range="${esc(range)}" data-sheet="1" data-root-x="${sx(byId[root.id].x)}" data-root-y="${sy(byId[root.id].y)}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${artW} ${artH}" width="${artW}" height="${artH}" role="img" aria-label="${esc(meta.title)}">
  <rect class="chart-paper" x="0" y="0" width="${artW}" height="${artH}" fill="#f7f4ea"/>
  <text x="16" y="18" font-size="12" font-family="Georgia,serif" fill="#333">${esc(meta.shortTitle)} · one sheet · v4</text>
  <g class="connectors">${paths}</g>
  <g class="nodes">${nodes}</g>
  ${foot}
</svg>`;
}

export function buildDetailHtml(faction, range, unitId) {
  const root = getChartTree(faction, range);
  const map = indexNodes(root);
  const unit = map[unitId];
  if (!unit) return `<aside class="detail-overlay" data-detail-overlay="true"><p>Unknown unit.</p></aside>`;
  return `<aside class="detail-overlay" data-detail-overlay="true" data-unit="${esc(unit.id)}">
    <button type="button" class="detail-close" data-detail-close="1" aria-label="Close">×</button>
    <p class="kicker">${esc(unit.unitType)} · ${esc(unit.role)} ${badge(unit.status)}</p>
    <h3>${esc(unit.fullName)}</h3>
    ${unit.leader ? `<p><strong>Leader:</strong> ${esc(unit.leader)}</p>` : ""}
    ${unit.strength ? `<p><strong>Strength:</strong> ${esc(unit.strength)}</p>` : ""}
    <h4>What it is</h4>
    <p class="prose">${esc(unit.whatItIs || "—")}</p>
    <h4>What it does</h4>
    <p class="prose">${esc(unit.functionText || "—")}</p>
  </aside>`;
}

export function buildLegendHtml() {
  const echelons = [
    ["XXXX", "Emperor / sovereign"],
    ["XXX", "High Lord / Host Lord* / Warrior King"],
    ["XX", "Division / host"],
    ["III", "Banner / regiment / warband"],
    ["I", "Company / section"],
    ["•••", "Platoon"],
    ["•", "Staff / proposed attachment"],
  ];
  const roles = Object.keys(ROLE_FILL);
  let ech = `<div class="leg-block"><h3>Echelon marks</h3><ul class="leg-list">`;
  for (const [m, d] of echelons) ech += `<li><span class="ech-sym">${esc(m)}</span> ${esc(d)}</li>`;
  ech += `</ul></div>`;
  let rol = `<div class="leg-block"><h3>Role symbols</h3><ul class="leg-roles">`;
  for (const r of roles) {
    rol += `<li><svg width="36" height="24" aria-hidden="true"><rect width="36" height="24" rx="2" fill="${ROLE_FILL[r]}" stroke="#111"/><g>${roleGlyph(r, 18, 12)}</g></svg> ${esc(r)}</li>`;
  }
  rol += `</ul><p class="note">Amber frame / PROPOSED = Non-Canon. Dotted connector = relationship (advice/civil), not command. *Host Lord = proposed High-Lord-equivalent for factions without that title — not canonizing the title. Nine creature/spirit-tech roles live under support branches.</p></div>`;
  return `<div class="chart-legend" data-chart-legend="true">${ech}${rol}</div>`;
}

export function buildGlossaryHtml() {
  const items = [
    ["Division", "Large grouping of Banners/hosts. Black Guard is one division of 5–8 Banners with no formal regiments."],
    ["Banner", "Guard fighting package of a few hundred under a Commander."],
    ["Company", "Major slice of a Banner (Recon, Iron, Ash, Heavy)."],
    ["Platoon", "Slice of a company under a Lieutenant."],
    ["Desert Kingdom", "Imperial-allied Mid-East theater (Rashid) — not the Desert Enemy."],
    ["Canyon mix", "Canyon city division: 3/4 desert kingdom regiments + 1/4 Imperial."],
    ["Brigade", "Not locked for the Guard. If shown, must be Proposed only."],
  ];
  let html = `<div class="glossary" data-glossary="true"><h3>Glossary</h3><dl>`;
  for (const [k, v] of items) html += `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`;
  html += `</dl></div>`;
  return html;
}

export function buildUnitTypeGalleryHtml() {
  let filters = `<div class="unit-filters" role="toolbar" aria-label="Filter unit types"><button type="button" class="unit-filter is-on" data-filter-type="all">All nine</button>`;
  for (const id of UNIT_TYPE_IDS) filters += `<button type="button" class="unit-filter" data-filter-type="${id}">${esc(UNIT_TYPES[id].label)}</button>`;
  filters += `</div>`;
  let cards = `<div class="type-grid" data-unit-gallery="true">`;
  for (const id of UNIT_TYPE_IDS) {
    const t = UNIT_TYPES[id];
    cards += `<article class="type-card" data-type="${id}"><header><div><p class="kicker">Proposed ${badge("proposed")}</p><h3>${esc(t.label)}</h3></div></header>
      <h4>Creature / spirit-tech</h4><p>${esc(t.creatureConcept)}</p>
      <h4>Purpose</h4><p>${esc(t.battlefieldPurpose)}</p>
      <h4>Limits</h4><p>${esc(t.limitations)}</p></article>`;
  }
  cards += `</div>`;
  return `<section class="gallery-wrap">${filters}${cards}</section>`;
}

// Back-compat stubs (tests forbid explorer in page JS)
export function viewIds() { return [...FACTION_IDS]; }
