/** Military Organization v2 — explorer model + proposed unit types. Non-canon proposals marked. */

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

function u( partial ) {
  return {
    edgeKind: "command",
    edgeLabel: "command",
    capabilityType: null,
    children: [],
    ...partial,
    leader: {
      title: "Leader",
      name: "",
      status: "confirmed",
      ...(partial.leader || {}),
    },
    strength: {
      text: "Unknown",
      status: "proposed",
      ...(partial.strength || {}),
    },
  };
}

/** @type {Record<string, {id:string,title:string,blurb:string,rootId:string,units:Record<string,any>}>} */
export const FORCES = {};

function buildGuard() {
  const units = {};
  const add = (unit) => {
    units[unit.id] = unit;
  };

  add(u({
    id: "hl",
    name: "High Lord Cassian Thorne",
    unitType: "High Lord command",
    status: "confirmed",
    leader: { title: "High Lord", name: "Cassian Thorne", status: "confirmed" },
    strength: { text: "Commands the whole Black Guard experiment (5–8 Banners)", status: "confirmed" },
    whatItIs:
      "The political-military head of the Black Guard. Cassian founded the Guard and answers to the Emperor while running this elite experiment.",
    functionText:
      "Sets Guard doctrine, assigns Banners to fronts, and protects the spirit-tech workshops that arm the force.",
    reportsTo: null,
    children: ["div"],
  }));

  add(u({
    id: "div",
    name: "Black Guard Division",
    unitType: "Division",
    status: "confirmed",
    leader: { title: "High Lord (direct)", name: "Cassian Thorne", status: "confirmed" },
    strength: { text: "One division of 5–8 Banners; no formal regiments", status: "confirmed" },
    whatItIs:
      "The entire Black Guard counts as a single division spread across fronts. Because it is dispersed, it does not use a formal regiment layer between Banner and division.",
    functionText:
      "Coordinates Banner missions up the chain, shares delegated tasks, and rotates veterans home to train the next selection class.",
    reportsTo: "hl",
    children: ["alaric", "other"],
  }));

  add(u({
    id: "alaric",
    name: "Alaric’s Banner",
    unitType: "Banner",
    status: "confirmed",
    leader: { title: "Commander", name: "Sir Alaric Vaelen", status: "confirmed" },
    strength: { text: "A few hundred guards — company / battalion scale", status: "confirmed" },
    whatItIs:
      "A Banner is the Guard’s main fighting package: roughly a few hundred elites sent to the hardest fronts. Alaric’s Banner is the story’s home unit.",
    functionText:
      "Fights as a combined force of infantry, recon, and heavy support under one commander, with staff planning beside him.",
    reportsTo: "div",
    children: ["corvin", "recon", "iron", "ash", "heavy"],
  }));

  add(u({
    id: "other",
    name: "Other Black Guard Banners",
    unitType: "Banner group",
    status: "confirmed",
    leader: { title: "Various commanders", name: "Unnamed", status: "confirmed" },
    strength: { text: "4–7 further Banners (total Guard 5–8)", status: "confirmed" },
    whatItIs:
      "The rest of the Guard’s Banners. Some chase glory; some fight carefully. Canon locks the count, not every commander’s name.",
    functionText:
      "Take other fronts — fortified cities in the desert campaign, Farm Kingdom duty, and later wars — while sharing mission knowledge up the chain.",
    reportsTo: "div",
    children: [],
  }));

  add(u({
    id: "corvin",
    name: "Banner Strategist Staff",
    unitType: "Staff section",
    status: "confirmed",
    leader: { title: "Strategist Captain", name: "Corvin", status: "proposed" },
    strength: { text: "Small staff / messenger group — not a combat company", status: "confirmed" },
    whatItIs:
      "Alaric’s second-in-command and planning desk. Corvin does not own a company; he runs messengers, maps, and timing so the four companies hit together.",
    functionText:
      "Planning, relays, and logistics coordination. Proposed Purpose Desk and Echo Relay kits live here as non-canon experiments.",
    reportsTo: "alaric",
    children: ["cap-staff", "cap-signal", "cap-supply"],
  }));

  add(u({
    id: "recon",
    name: "Recon Company",
    unitType: "Company",
    status: "confirmed",
    leader: { title: "Captain", name: "Seraphina", status: "confirmed" },
    strength: { text: "2 platoons", status: "confirmed" },
    whatItIs:
      "The Banner’s eyes. Recon scouts, listens, and marks paths before the line moves. Uses battle signs and the fuller Old Hand language inside Recon.",
    functionText:
      "Find the enemy, the terrain trick, and the spirit-creature bloom. Proposed Gale Striders and Lantern Kites attach here.",
    reportsTo: "alaric",
    children: ["brann", "joss", "cap-cavalry", "cap-air"],
  }));

  add(u({
    id: "brann",
    name: "Recon Platoon (Mute)",
    unitType: "Platoon",
    status: "confirmed",
    leader: { title: "Lieutenant", name: "Brann", status: "proposed" },
    strength: { text: "1 platoon → Sergeants → Squads", status: "confirmed" },
    whatItIs:
      "A Recon platoon led by Brann the Mute — tracks and moves unseen. Name is provisional.",
    functionText: "Silent approach, tracking, and overwatch for Seraphina’s missions.",
    reportsTo: "recon",
    children: ["squad-note"],
  }));

  add(u({
    id: "joss",
    name: "Recon Platoon (Speaker)",
    unitType: "Platoon",
    status: "confirmed",
    leader: { title: "Lieutenant", name: "Joss", status: "proposed" },
    strength: { text: "1 platoon → Sergeants → Squads", status: "confirmed" },
    whatItIs:
      "A Recon platoon led by Joss the Speaker — gathers talk from locals while Brann watches. Name is provisional.",
    functionText: "Human intelligence, distraction, and loud cover for silent partners.",
    reportsTo: "recon",
    children: [],
  }));

  add(u({
    id: "squad-note",
    name: "Squads under Sergeants",
    unitType: "Squad tier",
    status: "confirmed",
    leader: { title: "Sergeant", name: "Various", status: "confirmed" },
    strength: { text: "Squad size not locked in canon — sergeants lead squads under each lieutenant", status: "confirmed" },
    whatItIs:
      "The smallest confirmed command layer in the Guard ladder. File / Lance ideas on the Ranks page remain draft and are not used as locked structure here.",
    functionText: "Fight, watch, and carry kit as the lieutenant directs.",
    reportsTo: "brann",
    children: [],
  }));

  add(u({
    id: "iron",
    name: "Iron Company",
    unitType: "Company",
    status: "confirmed",
    leader: { title: "Captain", name: "Garrick", status: "proposed" },
    strength: { text: "3 platoons — same flexible job as Ash", status: "confirmed" },
    whatItIs:
      "One of two infantry companies. Iron and Ash no longer split spear/shield roles; both do whatever Alaric needs that day. Company name and captain name are provisional.",
    functionText:
      "Line combat, assaults, and holds. Proposed Wardline Infantry mantles and Mercy Spinner litter teams attach here.",
    reportsTo: "alaric",
    children: ["iron-plt", "cap-infantry", "cap-medic"],
  }));

  add(u({
    id: "iron-plt",
    name: "Iron Platoons (×3)",
    unitType: "Platoon group",
    status: "confirmed",
    leader: { title: "Lieutenants", name: "Three platoon leaders", status: "confirmed" },
    strength: { text: "3 platoons, each with Sergeants → Squads (Iron only)", status: "confirmed" },
    whatItIs: "The three fighting platoons inside Iron Company. Each keeps its own squads — no shared squad pool across companies.",
    functionText: "Execute the captain’s scheme of maneuver for the day.",
    reportsTo: "iron",
    children: [],
  }));

  add(u({
    id: "ash",
    name: "Ash Company",
    unitType: "Company",
    status: "confirmed",
    leader: { title: "Captain", name: "Dagny", status: "proposed" },
    strength: { text: "3 platoons — same flexible job as Iron", status: "confirmed" },
    whatItIs:
      "The sister infantry company to Iron. Organized and formation-strict in character notes; name and captain provisional.",
    functionText: "Line combat beside Iron. Shares proposed infantry and medic attachments in this non-canon sketch.",
    reportsTo: "alaric",
    children: ["ash-plt"],
  }));

  add(u({
    id: "ash-plt",
    name: "Ash Platoons (×3)",
    unitType: "Platoon group",
    status: "confirmed",
    leader: { title: "Lieutenants", name: "Three platoon leaders", status: "confirmed" },
    strength: { text: "3 platoons, each with Sergeants → Squads (Ash only)", status: "confirmed" },
    whatItIs: "Ash Company’s three platoons with company-local squads.",
    functionText: "Hold and maneuver as Dagny orders.",
    reportsTo: "ash",
    children: [],
  }));

  add(u({
    id: "heavy",
    name: "Heavy Company (the Hammer)",
    unitType: "Company",
    status: "confirmed",
    leader: { title: "Captain", name: "Brynja", status: "proposed" },
    strength: { text: "1 platoon under a lieutenant who reports to the Heavy Captain", status: "confirmed" },
    whatItIs:
      "The Banner’s hammer: heavy weapons, breakthrough muscle, and workshop inventiveness. Captain name provisional.",
    functionText:
      "Smash points the infantry cannot. Proposed Chorus Engines and Bastion Behemoths attach here as non-canon support sections.",
    reportsTo: "alaric",
    children: ["heavy-lt", "cap-artillery", "cap-armor"],
  }));

  add(u({
    id: "heavy-lt",
    name: "Heavy Platoon",
    unitType: "Platoon",
    status: "confirmed",
    leader: { title: "Lieutenant", name: "Heavy platoon LT", status: "confirmed" },
    strength: { text: "1 platoon → Sergeants → Squads (Heavy only)", status: "confirmed" },
    whatItIs: "The single Heavy platoon serving under the Heavy Captain.",
    functionText: "Crew the Hammer’s fighting elements in contact.",
    reportsTo: "heavy",
    children: [],
  }));

  // Proposed capability attachments (do not replace companies)
  const caps = [
    ["cap-infantry", "infantry", "iron", "Wardline Mantle Section"],
    ["cap-artillery", "artillery", "heavy", "Chorus Engine Battery"],
    ["cap-cavalry", "cavalry", "recon", "Gale Strider Detachment"],
    ["cap-armor", "armor", "heavy", "Bastion Behemoth Pair"],
    ["cap-air", "air", "recon", "Lantern Kite Flight"],
    ["cap-medic", "medic", "iron", "Mercy Spinner Aid Team"],
    ["cap-signal", "signal", "corvin", "Echo Relay Cage-Net"],
    ["cap-supply", "supply", "corvin", "Root Caravan Detail"],
    ["cap-staff", "staff", "corvin", "Purpose Desk Cell"],
  ];
  for (const [id, type, parent, name] of caps) {
    const t = UNIT_TYPES[type];
    add(u({
      id,
      name,
      unitType: `Proposed ${t.label}`,
      status: "proposed",
      capabilityType: type,
      leader: { title: "Section lead", name: "Unnamed specialist", status: "proposed" },
      strength: { text: "Small proposed attachment — size not locked", status: "proposed" },
      whatItIs: `${t.creatureConcept} This attachment is a NON-CANON proposal nested under an existing Banner element; it does not replace the locked company structure.`,
      functionText: t.battlefieldPurpose + " " + t.howItWorks,
      reportsTo: parent,
      children: [],
    }));
  }

  FORCES.guard = {
    id: "guard",
    title: "Black Guard",
    blurb:
      "Elite Imperial experiment. Confirmed ladder first; proposed creature/spirit-tech attachments nest under companies and staff without adding regiments.",
    rootId: "hl",
    units,
  };
}

function buildEmpire() {
  const units = {};
  const add = (unit) => {
    units[unit.id] = unit;
  };

  add(u({
    id: "emp",
    name: "The Emperor",
    unitType: "Imperial sovereign",
    status: "confirmed",
    leader: { title: "Emperor", name: "The Emperor", status: "confirmed" },
    strength: { text: "Final say on removing a high lord", status: "confirmed" },
    whatItIs:
      "Sovereign of the Empire of Man. Relies heavily on high lords, Prefects, councils, and staffs, but keeps the last word on command removal.",
    functionText: "Holds the center of legitimacy; authorizes experiments like the Black Guard.",
    reportsTo: null,
    children: ["council", "flame"],
  }));

  add(u({
    id: "council",
    name: "Council of High Lords + Prefects",
    unitType: "Advisory council",
    status: "confirmed",
    edgeKind: "relationship",
    edgeLabel: "advises / relies on",
    leader: { title: "Members via staffs", name: "High Lords & Prefects", status: "confirmed" },
    strength: { text: "Nine regions represented; usually meet through staffs", status: "confirmed" },
    whatItIs:
      "Shared table for military high lords and civil Prefects. High lords outrank Prefects at the table. This is advisory membership — the Council does not command regions as a single army headquarters.",
    functionText: "Advise the Emperor, argue policy, and send staffers when distance prevents sitting in person.",
    reportsTo: "emp",
    children: ["pattern"],
  }));

  add(u({
    id: "flame",
    name: "Flame Order",
    unitType: "Independent order",
    status: "confirmed",
    leader: { title: "Order leadership", name: "Independent", status: "confirmed" },
    strength: { text: "Answers to no one in the Imperial chain", status: "confirmed" },
    whatItIs: "Independent keepers of spirit teaching and forceful handling of spirits. Not under the Emperor.",
    functionText: "Understand spirit, pass traditions, intervene when spirit-creatures demand it.",
    reportsTo: "emp",
    edgeKind: "relationship",
    edgeLabel: "independent of",
    children: [],
  }));

  add(u({
    id: "pattern",
    name: "Regional pattern (×9)",
    unitType: "Region template",
    status: "confirmed",
    leader: { title: "Per region", name: "High Lord + Prefect", status: "confirmed" },
    strength: { text: "Nine domains across the Empire", status: "confirmed" },
    whatItIs:
      "Every region pairs a High Lord (military only, Napoleon-style corps autonomy) with a Prefect (civil union of kings and lords). The High Lord outranks the Prefect.",
    functionText: "Let armies march as self-contained corps while civil unions keep kingdoms feeding and obeying.",
    reportsTo: "council",
    children: ["hl-mil", "pref", "domains"],
  }));

  add(u({
    id: "hl-mil",
    name: "High Lord (military)",
    unitType: "Corps-level command",
    status: "confirmed",
    leader: { title: "High Lord", name: "Regional High Lord", status: "confirmed" },
    strength: { text: "Commands the region’s military only", status: "confirmed" },
    whatItIs:
      "Field commander for a region — more autonomy on campaign, but the Empire placed him and can remove him.",
    functionText: "March, fight, and concentrate with other high-lord armies at decisive battles.",
    reportsTo: "pattern",
    children: ["prop-corps", "prop-host"],
    edgeKind: "relationship",
    edgeLabel: "outranks Prefect",
  }));

  add(u({
    id: "pref",
    name: "Prefect (civil)",
    unitType: "Civil union office",
    status: "confirmed",
    edgeKind: "relationship",
    edgeLabel: "civil counterpart",
    leader: { title: "Prefect", name: "Regional Prefect", status: "confirmed" },
    strength: { text: "Oversees union of the region’s kings and lords", status: "confirmed" },
    whatItIs:
      "Civil counterpart to the High Lord. Not the day-to-day mayor of every town — the union layer binding kings and lords.",
    functionText: "Keep kingdoms supplying, arguing, and aligned while the High Lord fights.",
    reportsTo: "pattern",
    children: ["kings"],
  }));

  add(u({
    id: "kings",
    name: "Regional kings & lords",
    unitType: "Civil layer",
    status: "confirmed",
    leader: { title: "Local rulers", name: "Various", status: "confirmed" },
    strength: { text: "Varies by kingdom", status: "confirmed" },
    whatItIs: "The kings and lords whose union the Prefect oversees.",
    functionText: "Raise local levies, taxes, and political consent.",
    reportsTo: "pref",
    children: [],
  }));

  add(u({
    id: "prop-corps",
    name: "Proposed Field Corps Staff",
    unitType: "Proposed corps HQ",
    status: "proposed",
    leader: { title: "Corps marshal (generic)", name: "Unnamed", status: "proposed" },
    strength: { text: "Proposed: several regional divisions worth of banners/hosts", status: "proposed" },
    whatItIs:
      "NON-CANON sketch of how a High Lord’s army might staff itself like a Napoleonic corps: operations desk, Echo Relays, Root Caravans, and Purpose Desk — without inventing a named marshal character.",
    functionText: "Synchronize marching columns and keep civil Prefects informed through staff, not by seizing civil power.",
    reportsTo: "hl-mil",
    children: ["prop-div-line", "prop-div-siege"],
  }));

  add(u({
    id: "prop-host",
    name: "Proposed Kingdom Host",
    unitType: "Proposed host",
    status: "proposed",
    leader: { title: "Host captain (generic)", name: "Unnamed", status: "proposed" },
    strength: { text: "Proposed: kingdom levy stiffened by Imperial cadres", status: "proposed" },
    whatItIs:
      "NON-CANON idea for the mass of regional soldiers beneath the High Lord — brighter Wardline mantles, Prefects feeding them, not Black Guard selection.",
    functionText: "Hold ground and fill the line while Guard Banners take the weirdest fights.",
    reportsTo: "hl-mil",
    children: [],
  }));

  add(u({
    id: "prop-div-line",
    name: "Proposed Line Division",
    unitType: "Proposed division",
    status: "proposed",
    leader: { title: "Division general (generic)", name: "Unnamed", status: "proposed" },
    strength: { text: "Proposed estimate: several thousand including levy wings", status: "proposed" },
    whatItIs: "NON-CANON line division built from Wardline Infantry, Gale Strider screens, and Root Caravans.",
    functionText: "March separately, fight concentrated — echoing the Empire’s corps success story.",
    reportsTo: "prop-corps",
    children: [],
  }));

  add(u({
    id: "prop-div-siege",
    name: "Proposed Siege Division",
    unitType: "Proposed division",
    status: "proposed",
    leader: { title: "Siege general (generic)", name: "Unnamed", status: "proposed" },
    strength: { text: "Proposed estimate: fewer troops, more Chorus Engines & Bastion Behemoths", status: "proposed" },
    whatItIs: "NON-CANON heavy division for walls and dens.",
    functionText: "Reduce fortresses so line divisions need not bleed on stone.",
    reportsTo: "prop-corps",
    children: [],
  }));

  add(u({
    id: "domains",
    name: "Nine high-lord domains",
    unitType: "Domain list",
    status: "confirmed",
    leader: { title: "See each domain", name: "Various", status: "confirmed" },
    strength: { text: "Nine domains locked; most personal names provisional", status: "confirmed" },
    whatItIs:
      "Black Guard (Cassian Thorne, confirmed); West Island; Southern; Middle; Capital (renaming); Mid-East Desert (Rashid* — Imperial ally, not the desert enemy); Northern Mountains; NE Farm; Far NE elf-human city.",
    functionText: "Map who owns which military theater.",
    reportsTo: "pattern",
    children: ["d-rashid"],
  }));

  add(u({
    id: "d-rashid",
    name: "Mid-East Desert Kingdom command",
    unitType: "High Lord domain",
    status: "confirmed",
    leader: { title: "High Lord", name: "Rashid al-Zahir", status: "proposed" },
    strength: { text: "Imperial desert theater — allied, not the Book 1 enemy", status: "confirmed" },
    whatItIs:
      "Imperial High Lord of the Mid-East Desert Kingdom. Distinct from the warrior-king coalition pushing on the capital. Name provisional.",
    functionText: "Hold Imperial desert possessions and coordinate canyon-city forces (desert + Imperial regiments).",
    reportsTo: "domains",
    children: [],
  }));

  FORCES.empire = {
    id: "empire",
    title: "The Empire",
    blurb: "Confirmed civil/military split and advisory Council, plus proposed corps-style flesh under a High Lord.",
    rootId: "emp",
    units,
  };
}

function buildEnemy() {
  const units = {};
  const add = (unit) => {
    units[unit.id] = unit;
  };

  add(u({
    id: "coal",
    name: "Desert capital push — coalition",
    unitType: "Coalition",
    status: "confirmed",
    leader: { title: "Coalition", name: "Unconquered desert + rival kingdom", status: "confirmed" },
    strength: { text: "Two allied pressures on the Desert Kingdom capital", status: "confirmed" },
    whatItIs:
      "Book 1 enemy pushing on the capital: the unconquered part of the desert kingdom plus a rival kingdom beyond the desert. They take the canyon path.",
    functionText: "Seize the capital and shove the Empire back.",
    reportsTo: null,
    children: ["wk", "unc", "not-enemy"],
    edgeKind: "relationship",
    edgeLabel: "alliance",
  }));

  add(u({
    id: "wk",
    name: "Rival kingdom — Warrior King",
    unitType: "Enemy sovereign",
    status: "confirmed",
    edgeKind: "relationship",
    edgeLabel: "alliance (composition)",
    leader: { title: "Warrior King", name: "Unnamed warrior king", status: "confirmed" },
    strength: { text: "Field army size unspecified in canon", status: "confirmed" },
    whatItIs:
      "Ruler of the rival kingdom beyond the desert. Wants land, resources, and the Empire out. Ordered spirit-creature use after a foreign advisor brought them; a hidden source uses him.",
    functionText: "Direct the canyon offensive and hired cult fighters.",
    reportsTo: "coal",
    children: ["adv", "cult", "hid", "e-host", "e-canyon", "e-beasts", "e-train"],
  }));

  add(u({
    id: "unc",
    name: "Unconquered desert kingdom part",
    unitType: "Faction wing",
    status: "confirmed",
    edgeKind: "relationship",
    edgeLabel: "alliance (composition)",
    leader: { title: "Unspecified", name: "Leadership unspecified", status: "confirmed" },
    strength: { text: "Ranks unspecified", status: "confirmed" },
    whatItIs: "The still-free desert polity fighting beside the rival kingdom. Canon does not lock their officers.",
    functionText: "Local guides, canyon knowledge, and fighters who resent Imperial occupation.",
    reportsTo: "coal",
    children: [],
  }));

  add(u({
    id: "adv",
    name: "Foreign advisor",
    unitType: "Advisor",
    status: "confirmed",
    edgeKind: "relationship",
    edgeLabel: "advises",
    leader: { title: "Advisor", name: "Foreign advisor", status: "confirmed" },
    strength: { text: "One influential outsider", status: "confirmed" },
    whatItIs: "Brought spirit creatures into the warrior king’s army. Comes from somewhere no one has heard of — same source as Farm Kingdom troubles.",
    functionText: "Steer the king toward spirit-weapon use that serves the hidden source.",
    reportsTo: "wk",
    children: [],
  }));

  add(u({
    id: "cult",
    name: "Fallen-spirit cult (hired)",
    unitType: "Mercenary cult",
    status: "confirmed",
    edgeKind: "relationship",
    edgeLabel: "hires",
    leader: { title: "Cult leaders", name: "Unnamed", status: "confirmed" },
    strength: { text: "Hired spirit-heavy fighters at the canyon", status: "confirmed" },
    whatItIs: "A cult that worships a fallen spirit. The king hired them; he suspects their true goal and does not care.",
    functionText: "Field spirit-heavy creatures/fighters and tunnel tricks in the canyon battle.",
    reportsTo: "wk",
    children: [],
  }));

  add(u({
    id: "hid",
    name: "Unnamed hidden power",
    unitType: "Hidden source",
    status: "confirmed",
    edgeKind: "relationship",
    edgeLabel: "influence",
    leader: { title: "Unknown", name: "Unnamed", status: "confirmed" },
    strength: { text: "Unnamed most of Book 1", status: "confirmed" },
    whatItIs: "Shared source using the warrior king and linked to Farm Kingdom attacks; seeks the same ancient device Cassian chases.",
    functionText: "Weaken the Empire from many sides and spread corruption.",
    reportsTo: "wk",
    children: [],
  }));

  add(u({
    id: "e-host",
    name: "Proposed Dune Host",
    unitType: "Proposed host",
    status: "proposed",
    leader: { title: "Host war-captain (generic)", name: "Unnamed", status: "proposed" },
    strength: { text: "Proposed estimate: several thousand desert spears with jackal cavalry screens", status: "proposed" },
    whatItIs:
      "NON-CANON flesh for the warrior king’s mass of fighters — sand-glass Wardline analogues, heat-mirage jackals, bone-flute signals. Not locked.",
    functionText: "Front pressure on canyon and road approaches.",
    reportsTo: "wk",
    children: ["e-spears", "e-jackals"],
  }));

  add(u({
    id: "e-spears",
    name: "Proposed Sand-Glass Spears",
    unitType: "Proposed infantry wing",
    status: "proposed",
    capabilityType: "infantry",
    leader: { title: "Spear chief (generic)", name: "Unnamed", status: "proposed" },
    strength: { text: "Proposed: bulk of the Dune Host", status: "proposed" },
    whatItIs: UNIT_TYPES.infantry.forceNotes.enemy + " " + UNIT_TYPES.infantry.creatureConcept,
    functionText: UNIT_TYPES.infantry.battlefieldPurpose,
    reportsTo: "e-host",
    children: [],
  }));

  add(u({
    id: "e-jackals",
    name: "Proposed Mirage Jackal Riders",
    unitType: "Proposed cavalry wing",
    status: "proposed",
    capabilityType: "cavalry",
    leader: { title: "Rider chief (generic)", name: "Unnamed", status: "proposed" },
    strength: { text: "Proposed: fast dusk screens", status: "proposed" },
    whatItIs: UNIT_TYPES.cavalry.forceNotes.enemy,
    functionText: UNIT_TYPES.cavalry.battlefieldPurpose,
    reportsTo: "e-host",
    children: [],
  }));

  add(u({
    id: "e-canyon",
    name: "Proposed Canyon Breach Band",
    unitType: "Proposed assault band",
    status: "proposed",
    leader: { title: "Breach-captain (generic)", name: "Unnamed", status: "proposed" },
    strength: { text: "Proposed: cult fighters + tunnel crews + ash-bats", status: "proposed" },
    whatItIs:
      "NON-CANON package for the canyon surprise: hired cult spirit-heavies, tunnelers, and ash-bat spotters. Built atop confirmed canyon tactics without inventing officer names.",
    functionText: "Force the canyon path and spirit-shock the defenders.",
    reportsTo: "wk",
    children: ["e-bats", "e-horns"],
  }));

  add(u({
    id: "e-bats",
    name: "Proposed Ash-Bat Cloud",
    unitType: "Proposed air spotters",
    status: "proposed",
    capabilityType: "air",
    leader: { title: "Cloud-caller (generic)", name: "Unnamed", status: "proposed" },
    strength: { text: "Proposed: noisy observation swarm", status: "proposed" },
    whatItIs: UNIT_TYPES.air.forceNotes.enemy,
    functionText: UNIT_TYPES.air.battlefieldPurpose,
    reportsTo: "e-canyon",
    children: [],
  }));

  add(u({
    id: "e-horns",
    name: "Proposed Dune-Horn Battery",
    unitType: "Proposed artillery",
    status: "proposed",
    capabilityType: "artillery",
    leader: { title: "Horn master (generic)", name: "Unnamed", status: "proposed" },
    strength: { text: "Proposed: few loud serpents", status: "proposed" },
    whatItIs: UNIT_TYPES.artillery.forceNotes.enemy,
    functionText: UNIT_TYPES.artillery.battlefieldPurpose,
    reportsTo: "e-canyon",
    children: [],
  }));

  add(u({
    id: "e-beasts",
    name: "Proposed Salt-Scarabae Reserve",
    unitType: "Proposed armor reserve",
    status: "proposed",
    capabilityType: "armor",
    leader: { title: "Beast-warden (generic)", name: "Unnamed", status: "proposed" },
    strength: { text: "Proposed: swarming carapace beasts", status: "proposed" },
    whatItIs: UNIT_TYPES.armor.forceNotes.enemy,
    functionText: UNIT_TYPES.armor.battlefieldPurpose,
    reportsTo: "wk",
    children: [],
  }));

  add(u({
    id: "e-train",
    name: "Proposed Night Snail Train",
    unitType: "Proposed supply",
    status: "proposed",
    capabilityType: "supply",
    leader: { title: "Train master (generic)", name: "Unnamed", status: "proposed" },
    strength: { text: "Proposed: buried daytime, moving overnight", status: "proposed" },
    whatItIs: UNIT_TYPES.supply.forceNotes.enemy + " Also carries resin-binder medic kits and bone-flute signal cages as proposed.",
    functionText: "Keep the host watered and the cult fed without Imperial-style roads.",
    reportsTo: "wk",
    children: [],
  }));

  add(u({
    id: "not-enemy",
    name: "NOT this enemy — Imperial desert allies",
    unitType: "Clarification",
    status: "confirmed",
    leader: { title: "n/a", name: "Rashid* / canyon-city general", status: "proposed" },
    strength: { text: "Canyon city: ~¾ desert + ~¼ Imperial regiments (friendly)", status: "confirmed" },
    whatItIs:
      "Reminder card: Rashid’s Mid-East Desert command and the canyon-city division are Imperial/allied theater forces, not the warrior-king coalition.",
    functionText: "Avoid mixing ally and enemy org charts.",
    reportsTo: "coal",
    children: [],
  }));

  FORCES.enemy = {
    id: "enemy",
    title: "Desert enemy",
    blurb:
      "Confirmed coalition nodes, then a bold NON-CANON army sketch under the Warrior King. Hierarchy below the king was unspecified in canon — proposals fill the gap with badges.",
    rootId: "coal",
    units,
  };
}

buildGuard();
buildEmpire();
buildEnemy();

export function viewIds() {
  return ["guard", "empire", "enemy"];
}

export function getForce(id) {
  const f = FORCES[id];
  if (!f) throw new Error(`unknown force ${id}`);
  return f;
}

export function getUnit(forceId, unitId) {
  const u0 = getForce(forceId).units[unitId];
  if (!u0) throw new Error(`unknown unit ${forceId}/${unitId}`);
  return u0;
}

export function getChildren(forceId, unitId) {
  const unit = getUnit(forceId, unitId);
  return (unit.children || []).map((id) => getUnit(forceId, id));
}

export function getAncestors(forceId, unitId) {
  const force = getForce(forceId);
  const chain = [];
  let cur = getUnit(forceId, unitId);
  const guard = new Set();
  while (cur.reportsTo) {
    if (guard.has(cur.reportsTo)) break;
    guard.add(cur.reportsTo);
    cur = getUnit(forceId, cur.reportsTo);
    chain.push(cur);
  }
  return chain.reverse();
}

export function collectAllUnits(forceId) {
  return Object.values(getForce(forceId).units);
}

export function assertCanonInvariants() {
  const alaric = getUnit("guard", "alaric");
  if (!/few hundred/i.test(alaric.strength.text)) throw new Error("Banner strength");
  const kids = getChildren("guard", "alaric").map((c) => c.id);
  for (const need of ["recon", "iron", "ash", "heavy", "corvin"]) {
    if (!kids.includes(need)) throw new Error(`missing ${need}`);
  }
  if (getUnit("guard", "recon").strength.text.indexOf("2") < 0) throw new Error("recon platoons");
  if (getUnit("guard", "iron").strength.text.indexOf("3") < 0) throw new Error("iron platoons");
  if (getUnit("guard", "ash").strength.text.indexOf("3") < 0) throw new Error("ash platoons");
  if (getUnit("guard", "heavy").strength.text.indexOf("1") < 0) throw new Error("heavy platoons");
  const div = getUnit("guard", "div");
  if (!/5\s*[–-]\s*8/.test(div.strength.text)) throw new Error("banner count");
  if (!/no formal regiments/i.test(div.strength.text + div.whatItIs)) throw new Error("regiments");
  // locked companies must not be proposed-only
  for (const id of ["recon", "iron", "ash", "heavy", "alaric", "div", "hl"]) {
    if (getUnit("guard", id).status !== "confirmed") throw new Error(`${id} must be confirmed`);
  }
}

function leaderLine(unit) {
  const nm = unit.leader.name ? ` ${esc(unit.leader.name)}` : "";
  return `${esc(unit.leader.title)}${nm ? " —" + nm : ""} ${badge(unit.leader.status)}`;
}

export function buildExplorerHtml(forceId, focusId) {
  const force = getForce(forceId);
  const focus = getUnit(forceId, focusId || force.rootId);
  const ancestors = getAncestors(forceId, focus.id);
  const children = getChildren(forceId, focus.id);

  let crumbs = `<nav class="crumbs" aria-label="Breadcrumb" data-crumb="true"><ol>`;
  crumbs += `<li><button type="button" class="crumb-btn" data-drill="${esc(force.rootId)}">Force overview</button></li>`;
  for (const a of ancestors) {
    crumbs += `<li><button type="button" class="crumb-btn" data-drill="${esc(a.id)}">${esc(a.name)}</button></li>`;
  }
  crumbs += `<li aria-current="page"><span>${esc(focus.name)}</span></li></ol></nav>`;

  const parent = focus.reportsTo ? getUnit(forceId, focus.reportsTo) : null;
  const reports = parent
    ? `<p><strong>Reports to:</strong> <button type="button" class="text-drill" data-drill="${esc(parent.id)}">${esc(parent.name)}</button> <span class="edge-pill ${parent.edgeKind === "relationship" || focus.edgeKind === "relationship" ? "rel" : "cmd"}">${esc(focus.edgeLabel || "command")}</span></p>`
    : `<p><strong>Reports to:</strong> — (top of this force view)</p>`;

  const contains = children.length
    ? `<p><strong>Direct branches (${children.length}):</strong> tap a card below to drill down.</p>`
    : `<p><strong>Direct branches:</strong> none listed — this is a leaf in the explorer.</p>`;

  let focusCard = `<article class="focus-card" data-focus="${esc(focus.id)}">
    <header>
      <p class="kicker">${esc(focus.unitType)} ${badge(focus.status)}</p>
      <h3>${esc(focus.name)}</h3>
    </header>
    <div class="focus-grid">
      <p><strong>Who leads:</strong> ${leaderLine(focus)}</p>
      <p><strong>Strength:</strong> ${esc(focus.strength.text)} ${badge(focus.strength.status)}</p>
      ${reports}
      ${contains}
    </div>
    <h4>What it is</h4>
    <p class="prose">${esc(focus.whatItIs)}</p>
    <h4>What it does</h4>
    <p class="prose">${esc(focus.functionText)}</p>
  </article>`;

  let subs = `<div class="branch-grid" aria-label="Subordinate branches">`;
  for (const c of children) {
    const rel = c.edgeKind === "relationship" || focus.edgeKind === "relationship";
    subs += `<button type="button" class="unit-card" data-drill="${esc(c.id)}">
      <span class="edge-pill ${rel ? "rel" : "cmd"}">${esc(c.edgeLabel || (rel ? "relationship" : "command"))}</span>
      <span class="card-type">${esc(c.unitType)} ${badge(c.status)}</span>
      <span class="card-name">${esc(c.name)}</span>
      <span class="card-lead">${esc(c.leader.title)}${c.leader.name ? " · " + esc(c.leader.name) : ""}</span>
      <span class="card-str">${esc(c.strength.text)}</span>
      <span class="card-hint">Open →</span>
    </button>`;
  }
  subs += `</div>`;

  return `<div class="explorer" data-explorer="true" data-force="${esc(forceId)}" data-focus="${esc(focus.id)}">
    <p class="view-blurb">${esc(force.blurb)}</p>
    ${crumbs}
    ${focusCard}
    <h4 class="branches-h">Branches from here</h4>
    ${subs}
  </div>`;
}

export function buildGlossaryHtml() {
  const items = [
    ["Division", "A large grouping of many Banners or hosts. The Black Guard itself is one division spread out."],
    ["Banner", "Guard fighting package of a few hundred — the main deployable unit under a Commander."],
    ["Company", "Major slice of a Banner under a Captain (Recon, Iron, Ash, Heavy)."],
    ["Platoon", "Slice of a company under a Lieutenant."],
    ["Squad", "Smallest confirmed layer under Sergeants. Draft File/Lance sizes are not locked."],
    ["High Lord", "Military chief of a region (or the Black Guard). Army command, not civil mayoralty."],
    ["Prefect", "Civil officer overseeing the union of a region’s kings and lords; outranked by the High Lord."],
    ["Command edge", "Solid military reporting line."],
    ["Relationship edge", "Alliance, advice, hire, influence, or outranks — not a fake army rank."],
  ];
  let html = `<div class="glossary" data-glossary="true"><h3>Glossary</h3><dl>`;
  for (const [k, v] of items) {
    html += `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`;
  }
  html += `</dl>
  <p class="note">Military vs civil: High Lords fight; Prefects bind kings and lords. The Emperor’s Council seats both as advisors — it is not a corps HQ over the nine regions.</p>
  </div>`;
  return html;
}

function iconSvg(kind) {
  const common = `class="type-icon" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"`;
  const shapes = {
    shield: `<svg ${common}><path fill="currentColor" d="M32 6 L54 14 V34 C54 48 40 58 32 60 C24 58 10 48 10 34 V14 Z" opacity=".9"/><path fill="none" stroke="#0b1020" stroke-width="3" d="M32 18 V46 M22 30 H42"/></svg>`,
    burst: `<svg ${common}><circle cx="32" cy="32" r="10" fill="currentColor"/><g stroke="currentColor" stroke-width="4" stroke-linecap="round">${[0,45,90,135].map((a)=>`<line x1="32" y1="32" x2="${32+26*Math.cos(a*Math.PI/180)}" y2="${32+26*Math.sin(a*Math.PI/180)}"/>`).join("")}</g></svg>`,
    hoof: `<svg ${common}><ellipse cx="32" cy="40" rx="16" ry="12" fill="currentColor"/><path d="M20 28 Q32 8 44 28" fill="none" stroke="currentColor" stroke-width="4"/></svg>`,
    bulk: `<svg ${common}><rect x="10" y="24" width="44" height="26" rx="8" fill="currentColor"/><circle cx="20" cy="52" r="6" fill="currentColor"/><circle cx="44" cy="52" r="6" fill="currentColor"/></svg>`,
    kite: `<svg ${common}><path d="M32 6 L50 32 L32 40 L14 32 Z" fill="currentColor"/><path d="M32 40 V58" stroke="currentColor" stroke-width="3"/></svg>`,
    thread: `<svg ${common}><circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 14 C40 24 24 40 32 50" fill="none" stroke="currentColor" stroke-width="3"/></svg>`,
    wave: `<svg ${common}><path d="M8 40 Q20 20 32 40 T56 40" fill="none" stroke="currentColor" stroke-width="4"/><path d="M8 28 Q20 8 32 28 T56 28" fill="none" stroke="currentColor" stroke-width="3" opacity=".7"/></svg>`,
    crate: `<svg ${common}><rect x="12" y="20" width="40" height="30" rx="4" fill="currentColor"/><path d="M12 30 H52 M32 20 V50" stroke="#0b1020" stroke-width="3"/></svg>`,
    desk: `<svg ${common}><rect x="8" y="34" width="48" height="10" rx="2" fill="currentColor"/><rect x="18" y="18" width="28" height="16" rx="3" fill="currentColor"/></svg>`,
  };
  return shapes[kind] || shapes.shield;
}

export function buildUnitTypeGalleryHtml() {
  let filters = `<div class="unit-filters" role="toolbar" aria-label="Filter unit types">
    <button type="button" class="unit-filter is-on" data-filter-type="all">All nine</button>`;
  for (const id of UNIT_TYPE_IDS) {
    filters += `<button type="button" class="unit-filter" data-filter-type="${id}">${esc(UNIT_TYPES[id].label)}</button>`;
  }
  filters += `</div>`;

  let cards = `<div class="type-grid" data-unit-gallery="true">`;
  for (const id of UNIT_TYPE_IDS) {
    const t = UNIT_TYPES[id];
    cards += `<article class="type-card" data-type="${id}" id="type-${id}">
      <header>${iconSvg(t.icon)}<div><p class="kicker">Proposed capability ${badge("proposed")}</p><h3>${esc(t.label)}</h3></div></header>
      <h4>Creature / spirit-tech</h4><p>${esc(t.creatureConcept)}</p>
      <h4>Battlefield purpose</h4><p>${esc(t.battlefieldPurpose)}</p>
      <h4>How it works</h4><p>${esc(t.howItWorks)}</p>
      <h4>Limits</h4><p>${esc(t.limitations)}</p>
      <h4>Where it sits</h4><p>${esc(t.commanderPlacement)}</p>
      <h4>How forces differ</h4>
      <ul>
        <li><strong>Black Guard:</strong> ${esc(t.forceNotes.guard)}</li>
        <li><strong>Empire:</strong> ${esc(t.forceNotes.empire)}</li>
        <li><strong>Desert enemy:</strong> ${esc(t.forceNotes.enemy)}</li>
      </ul>
    </article>`;
  }
  cards += `</div>`;
  return `<section class="gallery-wrap" aria-label="Proposed unit types">
    <p class="note">All nine roles are NON-CANON proposals built from creatures and spirit-tech that channel a bounded purpose/tie — they do not freely enslave Know-know beings or let creatures slide the spectrum at will.</p>
    ${filters}${cards}
  </section>`;
}

/* ========== v3 Danish-style military symbol chart ========== */

export const RESET_ZOOM = 1;
export const FIT_ACTION = "fit";

export function nextZoom(current, action) {
  const c = Number(current) || 1;
  if (action === "reset") return RESET_ZOOM;
  if (action === "in") return Math.min(4, +(c * 1.25).toFixed(3));
  if (action === "out") return Math.max(0.35, +(c / 1.25).toFixed(3));
  if (action === FIT_ACTION) return FIT_ACTION; // sentinel for JS viewport fit
  return c;
}

function inferRole(unit) {
  if (unit.capability) return unit.capability;
  const t = String(unit.unitType || "").toLowerCase();
  const n = String(unit.name || "").toLowerCase();
  if (/staff|strategist|council|prefect|purpose desk|desk/.test(t + " " + n)) return "staff";
  if (/medic|mercy|healer/.test(t + " " + n)) return "medic";
  if (/artillery|ash|chorus|engine/.test(t + " " + n) && !/cavalry/.test(n)) return "artillery";
  if (/armor|heavy|bastion|behemoth/.test(t + " " + n)) return "armor";
  if (/cavalry|recon|gale|strider|hussar|rider|camel/.test(t + " " + n)) return "cavalry";
  if (/air|kite|lantern|wing|sky/.test(t + " " + n)) return "air";
  if (/signal|echo|relay/.test(t + " " + n)) return "signal";
  if (/supply|root|caravan|train/.test(t + " " + n)) return "supply";
  if (/high lord|division|banner|emperor|king|host|command/.test(t)) return "hq";
  return "infantry";
}

function echelonMark(unit) {
  const t = String(unit.unitType || "").toLowerCase();
  if (/emperor|high lord|warrior king/.test(t) || /warrior king/i.test(unit.name || "")) return "XXX";
  if (/division|region host|great host/.test(t)) return "XX";
  if (/banner|regiment|legion|council|defence/.test(t)) return "III";
  if (/battalion|brigade/.test(t)) return "II";
  if (/company|battery|wing|section|capability/.test(t)) return "I";
  if (/platoon|troop/.test(t)) return "•••";
  if (/squad|file|lance/.test(t)) return "••";
  if (/staff/.test(t)) return "•";
  return "II";
}

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
  const s = 9;
  if (role === "infantry") {
    return `<path class="role-glyph" d="M${cx - s} ${cy - s} L${cx + s} ${cy + s} M${cx + s} ${cy - s} L${cx - s} ${cy + s}" stroke="#111" stroke-width="2.2" fill="none"/>`;
  }
  if (role === "cavalry") {
    return `<path class="role-glyph" d="M${cx - s} ${cy + s * 0.6} L${cx + s} ${cy - s * 0.6}" stroke="#111" stroke-width="2.4" fill="none"/>`;
  }
  if (role === "artillery") {
    return `<circle class="role-glyph" cx="${cx}" cy="${cy}" r="5.5" fill="#111"/>`;
  }
  if (role === "armor") {
    return `<ellipse class="role-glyph" cx="${cx}" cy="${cy}" rx="11" ry="7" fill="none" stroke="#111" stroke-width="2.2"/>`;
  }
  if (role === "air") {
    return `<path class="role-glyph" d="M${cx - 10} ${cy} Q${cx} ${cy - 8} ${cx + 10} ${cy} Q${cx} ${cy + 8} ${cx - 10} ${cy}" fill="none" stroke="#111" stroke-width="2"/>`;
  }
  if (role === "medic") {
    return `<path class="role-glyph" d="M${cx - 2} ${cy - 8} H${cx + 2} V${cy - 2} H${cx + 8} V${cy + 2} H${cx + 2} V${cy + 8} H${cx - 2} V${cy + 2} H${cx - 8} V${cy - 2} H${cx - 2} Z" fill="#c0392b"/>`;
  }
  if (role === "signal") {
    return `<path class="role-glyph" d="M${cx - 8} ${cy + 6} L${cx - 2} ${cy - 6} L${cx + 2} ${cy + 2} L${cx + 8} ${cy - 6}" fill="none" stroke="#111" stroke-width="2.2" stroke-linejoin="round"/>`;
  }
  if (role === "supply") {
    return `<g class="role-glyph"><circle cx="${cx - 5}" cy="${cy}" r="3.2" fill="#111"/><circle cx="${cx + 5}" cy="${cy}" r="3.2" fill="#111"/><circle cx="${cx}" cy="${cy - 5}" r="3.2" fill="#111"/></g>`;
  }
  if (role === "staff") {
    return `<g class="role-glyph"><rect x="${cx - 7}" y="${cy - 2}" width="14" height="4" fill="#111"/><rect x="${cx - 2}" y="${cy - 8}" width="4" height="14" fill="#111"/></g>`;
  }
  // hq flag
  return `<g class="role-glyph"><path d="M${cx - 8} ${cy + 9} V${cy - 9} H${cx + 6} L${cx + 2} ${cy - 3} H${cx - 8}" fill="#111"/></g>`;
}

const BOX_W = 48;
const BOX_H = 30;
const LABEL_MAX = 34;
const V_GAP = 62;
const H_GAP = 36;
const PAD = 40;

function estimateLabelW(name) {
  return Math.min(340, 10 + Math.min(name.length, LABEL_MAX) * 7.4);
}

function nodeFootprint(unit) {
  // Labels sit to the RIGHT of the box; column must be wide enough that
  // neighboring columns do not overlap text (Danish chart style).
  const lw = estimateLabelW(unit.name);
  return Math.max(180, BOX_W + 28 + lw * 2 + H_GAP);
}

/** Recursively measure subtree width for column layout */
function measure(forceId, unitId) {
  const unit = getUnit(forceId, unitId);
  const kids = unit.children || [];
  if (!kids.length) return Math.max(nodeFootprint(unit), 120);
  let sum = 0;
  for (const k of kids) sum += measure(forceId, k);
  return Math.max(nodeFootprint(unit), sum);
}

/**
 * Place nodes: Danish style — parent centered above children bus;
 * children laid left-to-right; each child's descendants stack as a column.
 */
function place(forceId, unitId, left, top, positions) {
  const unit = getUnit(forceId, unitId);
  const kids = unit.children || [];
  const width = measure(forceId, unitId);
  const x = left + width / 2;
  const y = top;
  positions[unitId] = { id: unitId, x, y, unit, width };

  if (!kids.length) return;

  let cursor = left;
  const childTop = top + V_GAP;
  for (const k of kids) {
    const w = measure(forceId, k);
    place(forceId, k, cursor, childTop, positions);
    cursor += w;
  }
}

function connectorPath(px, py, cx, cy) {
  // from bottom-center of parent box to top-center of child box, orthogonal
  const yMid = (py + BOX_H / 2 + cy - BOX_H / 2) / 2;
  return `M${px} ${py + BOX_H / 2} V${yMid} H${cx} V${cy - BOX_H / 2}`;
}

function renderNode(pos, forceId) {
  const { x, y, unit } = pos;
  const role = inferRole(unit);
  const ech = echelonMark(unit);
  const fill = ROLE_FILL[role] || ROLE_FILL.infantry;
  const proposed = unit.status === "proposed";
  const rel = unit.edgeKind === "relationship";
  const dash = rel ? ` stroke-dasharray="4 3"` : "";
  const stroke = proposed ? "#8a5a00" : "#111";
  const strokeW = proposed ? 2.4 : 1.8;
  const label = unit.name.length > LABEL_MAX ? unit.name.slice(0, LABEL_MAX - 1) + "…" : unit.name;
  // tests forbid Alaric/Garrick style truncation — keep full short names; only truncate very long
  const safeLabel = unit.name.length > 48 ? unit.name.slice(0, 47) + "…" : unit.name;
  const statusMark = proposed ? " · PROPOSED" : "";
  const leader = unit.leader?.name && unit.leader.name !== "Unnamed" ? ` (${unit.leader.name})` : "";

  return `<g class="mil-node" data-unit-id="${esc(unit.id)}" data-force="${esc(forceId)}" tabindex="0" role="button" aria-label="${esc(unit.name)}">
    <text class="echelon" x="${x}" y="${y - BOX_H / 2 - 6}" text-anchor="middle" font-size="11" font-family="Georgia, serif" fill="#111">${esc(ech)}</text>
    <rect class="tac-frame" x="${x - BOX_W / 2}" y="${y - BOX_H / 2}" width="${BOX_W}" height="${BOX_H}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"${dash}/>
    ${roleGlyph(role, x, y)}
    <text class="unit-label" x="${x + BOX_W / 2 + 8}" y="${y - 2}" font-size="13" font-family="Georgia, 'Times New Roman', serif" fill="#111">${esc(safeLabel)}</text>
    <text class="unit-sub" x="${x + BOX_W / 2 + 8}" y="${y + 14}" font-size="10" font-family="system-ui,sans-serif" fill="#333">${esc((unit.unitType || "") + statusMark + leader)}</text>
  </g>`;
}

export function buildChartSvg(forceId) {
  const force = getForce(forceId);
  const positions = {};
  const treeW = measure(forceId, force.rootId);
  place(forceId, force.rootId, PAD, PAD + 20, positions);

  let maxX = 0;
  let maxY = 0;
  for (const p of Object.values(positions)) {
    maxX = Math.max(maxX, p.x + BOX_W / 2 + estimateLabelW(p.unit.name) + 40);
    maxY = Math.max(maxY, p.y + BOX_H / 2 + 40);
  }
  const vbW = Math.max(900, Math.ceil(maxX + PAD));
  const vbH = Math.max(700, Math.ceil(maxY + PAD));

  let paths = "";
  for (const p of Object.values(positions)) {
    const kids = p.unit.children || [];
    if (!kids.length) continue;
    // bus across children
    const childPos = kids.map((id) => positions[id]);
    const xs = childPos.map((c) => c.x);
    const minX = Math.min(...xs);
    const maxCX = Math.max(...xs);
    const busY = (p.y + BOX_H / 2 + childPos[0].y - BOX_H / 2) / 2;
    const relAny = childPos.some((c) => c.unit.edgeKind === "relationship");
    const dash = relAny && forceId === "enemy" ? ` stroke-dasharray="5 4"` : "";
    paths += `<path class="connector" d="M${p.x} ${p.y + BOX_H / 2} V${busY}" fill="none" stroke="#111" stroke-width="1.5"/>`;
    if (kids.length > 1) {
      paths += `<path class="connector" d="M${minX} ${busY} H${maxCX}" fill="none" stroke="#111" stroke-width="1.5"${dash}/>`;
    }
    for (const c of childPos) {
      const cdash = c.unit.edgeKind === "relationship" ? ` stroke-dasharray="5 4"` : "";
      paths += `<path class="connector" d="M${c.x} ${busY} V${c.y - BOX_H / 2}" fill="none" stroke="#111" stroke-width="1.5"${cdash}/>`;
    }
  }

  let nodes = "";
  // paint root first then depth order
  const order = Object.values(positions).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const p of order) nodes += renderNode(p, forceId);

  const title = esc(force.title || forceId);
  const rootPos = positions[force.rootId];
  return `<svg class="mil-chart-svg" data-chart-force="${esc(forceId)}" data-root-x="${rootPos.x}" data-root-y="${rootPos.y}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="${vbW}" height="${vbH}" role="img" aria-label="${title} organization chart">
  <rect class="chart-paper" x="0" y="0" width="${vbW}" height="${vbH}" fill="#f7f4ea"/>
  <text x="${PAD}" y="22" font-size="14" font-family="Georgia,serif" fill="#333">${title} — military symbol chart (v3)</text>
  <g class="connectors">${paths}</g>
  <g class="nodes">${nodes}</g>
</svg>`;
}

export function buildLegendHtml() {
  const echelons = [
    ["XXX", "High command (High Lord / Emperor / Warrior King)"],
    ["XX", "Division / regional host"],
    ["III", "Banner / regiment-scale package"],
    ["II", "Battalion-scale (when used)"],
    ["I", "Company / section / proposed capability cell"],
    ["•••", "Platoon"],
    ["••", "Squad / file"],
  ];
  const roles = [
    ["hq", "Command / HQ"],
    ["infantry", "Infantry (X)"],
    ["cavalry", "Cavalry / recon (diagonal)"],
    ["artillery", "Artillery (dot)"],
    ["armor", "Armor / heavy (oval)"],
    ["air", "Air / kite"],
    ["medic", "Medic"],
    ["signal", "Signal"],
    ["supply", "Supply"],
    ["staff", "Staff"],
  ];
  let ech = `<div class="leg-block"><h3>Echelon marks (fictional mapping)</h3><ul class="leg-list">`;
  for (const [m, d] of echelons) ech += `<li><span class="ech-sym">${esc(m)}</span> ${esc(d)}</li>`;
  ech += `</ul></div>`;

  let rol = `<div class="leg-block"><h3>Role symbols</h3><ul class="leg-roles">`;
  for (const [r, d] of roles) {
    const fill = ROLE_FILL[r];
    rol += `<li><svg width="40" height="28" aria-hidden="true"><rect x="1" y="1" width="38" height="26" rx="2" fill="${fill}" stroke="#111"/><g transform="translate(20 14)">${roleGlyph(r, 0, 0).replace(/class="role-glyph"/g, "")}</g></svg> ${esc(d)}</li>`;
  }
  rol += `</ul><p class="note">Solid frame = Confirmed. Amber thick frame / PROPOSED label = Proposed · Non-Canon. Dotted connectors = relationship (not command), used for desert enemy allies.</p></div>`;

  return `<div class="chart-legend" data-chart-legend="true">${ech}${rol}</div>`;
}

export function buildDetailHtml(forceId, unitId) {
  const unit = getUnit(forceId, unitId);
  const role = inferRole(unit);
  return `<aside class="detail-overlay" data-detail-overlay="true" data-unit="${esc(unit.id)}">
    <button type="button" class="detail-close" data-detail-close="1" aria-label="Close">×</button>
    <p class="kicker">${esc(unit.unitType)} · role ${esc(role)} ${badge(unit.status)}</p>
    <h3>${esc(unit.name)}</h3>
    <p><strong>Leader:</strong> ${esc(unit.leader.title)}${unit.leader.name ? " — " + esc(unit.leader.name) : ""} ${badge(unit.leader.status)}</p>
    <p><strong>Strength:</strong> ${esc(unit.strength.text)} ${badge(unit.strength.status)}</p>
    <h4>What it is</h4>
    <p class="prose">${esc(unit.whatItIs)}</p>
    <h4>What it does</h4>
    <p class="prose">${esc(unit.functionText)}</p>
  </aside>`;
}
