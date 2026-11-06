/** Locked lore org trees for Military Organization page. No invented ranks. */

export const FORBIDDEN_PUBLIC = [
  "ChatGPT",
  "coming soon",
  "Torvald",
  "\\bMathis\\b",
  "captain Rowan",
  "Captain Rowan",
];

export const PROVISIONAL = new Set([
  "Corvin",
  "Garrick",
  "Dagny",
  "Brynja",
  "Brann",
  "Joss",
  "Iron Company",
  "Ash Company",
  "Corin Saltmere",
  "Davian Solmarre",
  "Edric Halloran",
  "Rashid al-Zahir",
  "Bjorn Halvard",
  "Tomas Greaves",
  "Elowen Silvaris",
  "Aurelian Vaelor",
]);

export const RESET_ZOOM = 1;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_STEP = 1.2;

export function isProvisional(name) {
  if (!name) return false;
  if (PROVISIONAL.has(name)) return true;
  // strip trailing *
  const bare = String(name).replace(/\*$/, "").trim();
  return PROVISIONAL.has(bare);
}

export function nextZoom(current, action) {
  if (action === "reset") return RESET_ZOOM;
  if (action === "in") return Math.min(ZOOM_MAX, +(current * ZOOM_STEP).toFixed(4));
  if (action === "out") return Math.max(ZOOM_MIN, +(current / ZOOM_STEP).toFixed(4));
  return current;
}

function n(id, label, opts = {}) {
  return {
    id,
    label,
    detail: opts.detail || "",
    status: opts.status || "confirmed", // confirmed | provisional | draft | note
    kind: opts.kind || "cmd", // cmd | rel-target
    children: opts.children || [],
    relChildren: opts.relChildren || [], // { edgeLabel, node }
  };
}

const guardRoot = n("hl", "High Lord Cassian Thorne", {
  detail: "Commands the Black Guard",
  children: [
    n("div", "Black Guard — 1 Division", {
      detail: "5–8 Banners · spread out · no formal regiments",
      children: [
        n("alaric", "Banner — Commander Sir Alaric Vaelen", {
          detail: "A few hundred (company / battalion size)",
          children: [
            n("corvin", "Strategist Capt. Corvin*", {
              detail: "Staff only · 2IC / planner · messengers — not a company",
              status: "provisional",
            }),
            n("recon", "Recon — Capt. Seraphina", {
              detail: "2 platoons",
              children: [
                n("brann", "Lt Brann* (Mute)", {
                  detail: "1 platoon → Sergeants → Squads (this platoon only)",
                  status: "provisional",
                }),
                n("joss", "Lt Joss* (Speaker)", {
                  detail: "1 platoon → Sergeants → Squads (this platoon only)",
                  status: "provisional",
                }),
              ],
            }),
            n("iron", "Iron Company* — Capt. Garrick*", {
              detail: "3 platoons · same job as Ash: whatever Alaric needs that day",
              status: "provisional",
              children: [
                n("iron-plt", "3 Lieutenants → 3 Platoons", {
                  detail: "Each: Sergeants → Squads (Iron only)",
                }),
              ],
            }),
            n("ash", "Ash Company* — Capt. Dagny*", {
              detail: "3 platoons · same job as Iron",
              status: "provisional",
              children: [
                n("ash-plt", "3 Lieutenants → 3 Platoons", {
                  detail: "Each: Sergeants → Squads (Ash only)",
                }),
              ],
            }),
            n("heavy", "Heavy (Hammer)* — Capt. Brynja*", {
              detail: "1 platoon",
              status: "provisional",
              children: [
                n("heavy-lt", "1 Lieutenant under Heavy Capt.", {
                  detail: "Sergeants → Squads (Heavy only)",
                }),
              ],
            }),
          ],
        }),
        n("other", "Other Banners (4–7)", {
          detail: "Count locked · commanders unnamed",
        }),
      ],
    }),
  ],
});

const empireRoot = n("emp", "Emperor", {
  detail: "Final say on removing a high lord",
  relChildren: [
    {
      edgeLabel: "advises / relies on (not a command edge)",
      node: n("council", "Council of High Lords + Prefects", {
        detail: "Both sit · HL outrank Prefects · usually via staffs · advisory membership",
        kind: "rel-target",
        children: [
          n("pattern", "Regional pattern (×9)", {
            detail: "High Lord = military only · Prefect = civil union of kings & lords",
            children: [
              n("hl", "High Lord (military)", {
                detail: "Napoleon-style corps · autonomy in the field; Empire can remove",
                relChildren: [
                  {
                    edgeLabel: "outranks",
                    node: n("pref", "Prefect (civil)", {
                      detail: "Oversees union of region's kings and lords",
                      kind: "rel-target",
                      children: [
                        n("kings", "Regional kings & lords", {
                          detail: "Civil layer under Prefect",
                        }),
                      ],
                    }),
                  },
                ],
              }),
            ],
          }),
          n("domains", "Nine high-lord domains", {
            detail: "Domain list confirmed · most personal names provisional",
            children: [
              n("d1", "1. Black Guard — Cassian Thorne", { detail: "Confirmed keep" }),
              n("d2", "2. West Island — Corin Saltmere*", { detail: "Name provisional", status: "provisional" }),
              n("d3", "3. Southern Kingdoms — Davian Solmarre*", { detail: "Name provisional", status: "provisional" }),
              n("d4", "4. Middle Kingdoms — Edric Halloran*", { detail: "Name provisional", status: "provisional" }),
              n("d5", "5. Capital Kingdom — name being changed*", {
                detail: "Was Aurelian Vaelor* — renaming (too close to Alaric Vaelen)",
                status: "provisional",
              }),
              n("d6", "6. Mid-East Desert — Rashid al-Zahir*", {
                detail: "Imperial ally theater — NOT the desert enemy",
                status: "provisional",
              }),
              n("d7", "7. Northern Mountains — Bjorn Halvard*", { detail: "Name provisional", status: "provisional" }),
              n("d8", "8. NE Farm / Flatland — Tomas Greaves*", { detail: "Name provisional", status: "provisional" }),
              n("d9", "9. Far NE elf-human city — Elowen Silvaris*", {
                detail: "Half-elven · name provisional",
                status: "provisional",
              }),
            ],
          }),
        ],
      }),
    },
  ],
  children: [
    n("flame", "Flame Order", {
      detail: "Independent · answers to no one · not under the Emperor",
    }),
  ],
});

const enemyRoot = n("coal", "Coalition pushing on Desert Kingdom capital", {
  detail: "Unconquered desert part + rival kingdom beyond the desert",
  relChildren: [
    {
      edgeLabel: "alliance (composition)",
      node: n("wk", "Rival kingdom — Warrior King", {
        detail: "Wants land & resources; push Empire out",
        kind: "rel-target",
        relChildren: [
          {
            edgeLabel: "advises",
            node: n("adv", "Foreign advisor", {
              detail: "Brought spirit creatures",
              kind: "rel-target",
              relChildren: [
                {
                  edgeLabel: "from shared source",
                  node: n("hid", "Unnamed hidden power / shared source", {
                    detail: "Using the king · unnamed most of Book 1 · linked to Farm Kingdom attacks",
                    kind: "rel-target",
                  }),
                },
              ],
            }),
          },
          {
            edgeLabel: "hires",
            node: n("cult", "Fallen-spirit cult (hired)", {
              detail: "Spirit-heavy fighters at the canyon",
              kind: "rel-target",
            }),
          },
          {
            edgeLabel: "influence",
            node: n("hid2", "Unnamed hidden power (influence on king)", {
              detail: "Same shared source as advisor",
              kind: "rel-target",
            }),
          },
        ],
        children: [
          n("unspec", "Army chain below Warrior King — UNSPECIFIED", {
            detail: "No enemy divisions / regiments / companies locked. Do not invent.",
            status: "note",
          }),
        ],
      }),
    },
    {
      edgeLabel: "alliance (composition)",
      node: n("unc", "Unconquered desert kingdom part", {
        detail: "Leadership / ranks UNSPECIFIED",
        kind: "rel-target",
        status: "note",
      }),
    },
  ],
  children: [
    n("not", "NOT the desert enemy (Imperial / allied)", {
      detail: "Rashid al-Zahir* = Mid-East Desert Imperial HL · Canyon-city division = friendly theater (~¾ desert + ¼ Imperial)",
      status: "note",
    }),
  ],
});

export const VIEWS = {
  guard: {
    id: "guard",
    title: "Black Guard",
    blurb: "Elite Imperial experiment under High Lord Cassian Thorne. Solid lines are command.",
    root: guardRoot,
    draftNote:
      "Draft only (not locked): Guardsman · File (5) / File Leader · Lance (10) / Lance Sergeant. Do not treat as locked.",
    draftNodes: ["Guardsman", "File", "File Leader", "Lance", "Lance Sergeant"],
  },
  empire: {
    id: "empire",
    title: "The Empire",
    blurb: "Emperor with advisory Council. High lords command armies; Prefects oversee civil unions. Council does not command regions as a body.",
    root: empireRoot,
  },
  enemy: {
    id: "enemy",
    title: "Desert enemy",
    blurb: "Book 1 capital push. Dotted lines are alliance / hires / advises / influence — not a solid army ladder.",
    root: enemyRoot,
  },
};

export function viewIds() {
  return Object.keys(VIEWS);
}

export function getView(id) {
  const v = VIEWS[id];
  if (!v) throw new Error(`unknown view ${id}`);
  return v;
}

export function collectLabels(node, out = []) {
  if (!node) return out;
  out.push(node.label);
  for (const c of node.children || []) collectLabels(c, out);
  for (const r of node.relChildren || []) collectLabels(r.node, out);
  return out;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusBadge(status) {
  if (status === "provisional") return `<span class="badge prov">Provisional name</span>`;
  if (status === "draft") return `<span class="badge draft">Draft</span>`;
  if (status === "note") return `<span class="badge note">Note</span>`;
  return `<span class="badge ok">Confirmed</span>`;
}

function mobileNode(node, depth = 0) {
  const hasKids =
    (node.children && node.children.length) || (node.relChildren && node.relChildren.length);
  const open = depth === 0 ? " open" : "";
  const head = `${esc(node.label)} ${statusBadge(node.status)}`;
  const detail = node.detail ? `<p class="node-detail">${esc(node.detail)}</p>` : "";
  if (!hasKids) {
    return `<div class="leaf" data-node="${esc(node.id)}"><div class="leaf-title">${head}</div>${detail}</div>`;
  }
  let body = detail;
  for (const c of node.children || []) {
    body += `<div class="branch cmd"><span class="edge-label">command</span>${mobileNode(c, depth + 1)}</div>`;
  }
  for (const r of node.relChildren || []) {
    body += `<div class="branch rel"><span class="edge-label">${esc(r.edgeLabel)}</span>${mobileNode(r.node, depth + 1)}</div>`;
  }
  return `<details class="branch-block" data-node="${esc(node.id)}"${open}><summary>${head}</summary>${body}</details>`;
}

export function buildMobileHtml(viewId) {
  const v = getView(viewId);
  let html = `<div class="mobile-tree" data-view="${esc(viewId)}">`;
  html += `<p class="view-blurb">${esc(v.blurb)}</p>`;
  html += mobileNode(v.root, 0);
  if (v.draftNote) {
    html += `<aside class="draft-callout" role="note"><strong>Draft only</strong> — ${esc(v.draftNote)}</aside>`;
  }
  html += `</div>`;
  return html;
}

/** Simple top-down layout for SVG */
function layout(node, x, y, gapX, gapY, positions, edges) {
  positions.set(node.id, { node, x, y });
  const kids = [];
  for (const c of node.children || []) kids.push({ child: c, rel: false, label: "command" });
  for (const r of node.relChildren || []) kids.push({ child: r.node, rel: true, label: r.edgeLabel });
  if (!kids.length) return { width: 1, height: 1 };

  const childLayouts = [];
  let totalW = 0;
  for (const k of kids) {
    const sub = { width: 1 }; // prepass widths
    childLayouts.push(sub);
    totalW += 1;
  }
  // measure recursively
  const measured = kids.map((k) => {
    const dummy = new Map();
    const e2 = [];
    return measure(k.child, gapX, gapY, dummy, e2);
  });
  const widthSum = measured.reduce((a, m) => a + m.width, 0) + Math.max(0, measured.length - 1) * 0.15;

  let cx = x - widthSum / 2;
  kids.forEach((k, i) => {
    const w = measured[i].width;
    const childX = cx + w / 2;
    const childY = y + gapY;
    edges.push({
      from: node.id,
      to: k.child.id,
      rel: k.rel,
      label: k.label,
    });
    layout(k.child, childX, childY, gapX, gapY, positions, edges);
    cx += w + 0.15;
  });
  return { width: Math.max(1, widthSum), height: 1 };
}

function measure(node, gapX, gapY, positions, edges) {
  const kids = [];
  for (const c of node.children || []) kids.push(c);
  for (const r of node.relChildren || []) kids.push(r.node);
  if (!kids.length) return { width: 1, height: 1 };
  const ms = kids.map((c) => measure(c, gapX, gapY, positions, edges));
  const width = ms.reduce((a, m) => a + m.width, 0) + Math.max(0, ms.length - 1) * 0.15;
  return { width: Math.max(1, width), height: 1 };
}

export function buildSvgMarkup(viewId) {
  const v = getView(viewId);
  const positions = new Map();
  const edges = [];
  const gapX = 220;
  const gapY = 150;
  // measure then layout centered at 0,0
  const m = measure(v.root, gapX, gapY, positions, edges);
  layout(v.root, 0, 0, gapX, gapY, positions, edges);

  // convert unit coords to pixels
  const unit = gapX;
  const boxes = [];
  for (const [, p] of positions) {
    boxes.push({
      id: p.node.id,
      label: p.node.label,
      detail: p.node.detail,
      status: p.node.status,
      x: p.x * unit,
      y: p.y,
    });
  }
  // re-layout with pixel Y
  const positionsPx = new Map();
  function layPx(node, x, y) {
    positionsPx.set(node.id, { node, x, y });
    const kids = [];
    for (const c of node.children || []) kids.push({ child: c, rel: false, label: "command" });
    for (const r of node.relChildren || []) kids.push({ child: r.node, rel: true, label: r.edgeLabel });
    if (!kids.length) return 1;
    const widths = kids.map((k) => layPxMeasure(k.child));
    const sum = widths.reduce((a, w) => a + w, 0) + Math.max(0, kids.length - 1) * 40;
    let cx = x - sum / 2;
    kids.forEach((k, i) => {
      const w = widths[i];
      const childX = cx + w / 2;
      layPx(k.child, childX, y + gapY);
      cx += w + 48;
    });
    return Math.max(200, sum);
  }
  function layPxMeasure(node) {
    const kids = [...(node.children || []), ...(node.relChildren || []).map((r) => r.node)];
    if (!kids.length) return 260;
    return kids.map(layPxMeasure).reduce((a, w) => a + w, 0) + Math.max(0, kids.length - 1) * 48;
  }
  // rebuild edges list while laying out
  const edgeList = [];
  function walkEdges(node) {
    for (const c of node.children || []) {
      edgeList.push({ from: node.id, to: c.id, rel: false, label: "command" });
      walkEdges(c);
    }
    for (const r of node.relChildren || []) {
      edgeList.push({ from: node.id, to: r.node.id, rel: true, label: r.edgeLabel });
      walkEdges(r.node);
    }
  }
  layPx(v.root, 0, 40);
  walkEdges(v.root);

  let minX = Infinity,
    maxX = -Infinity,
    maxY = 0;
  for (const p of positionsPx.values()) {
    minX = Math.min(minX, p.x - 130);
    maxX = Math.max(maxX, p.x + 130);
    maxY = Math.max(maxY, p.y + 90);
  }
  const pad = 40;
  const width = Math.max(800, maxX - minX + pad * 2);
  const height = Math.max(500, maxY + pad);
  const ox = -minX + pad;

  let lines = "";
  for (const e of edgeList) {
    const a = positionsPx.get(e.from);
    const b = positionsPx.get(e.to);
    if (!a || !b) continue;
    const x1 = a.x + ox;
    const y1 = a.y + 78;
    const x2 = b.x + ox;
    const y2 = b.y;
    const midY = (y1 + y2) / 2;
    const cls = e.rel ? "edge-rel" : "edge-cmd";
    const dash = e.rel ? ` stroke-dasharray="8 7"` : "";
    lines += `<path class="${cls}" d="M${x1} ${y1} V${midY} H${x2} V${y2}" fill="none"${dash} />`;
    if (e.rel || e.label !== "command") {
      const lx = (x1 + x2) / 2;
      lines += `<text class="edge-text" x="${lx}" y="${midY - 6}" text-anchor="middle">${esc(e.label)}</text>`;
    }
  }

  let nodes = "";
  for (const p of positionsPx.values()) {
    const x = p.x + ox - 105;
    const y = p.y;
    const st = p.node.status || "confirmed";
    nodes += `<g class="node node-${st}" data-node="${esc(p.node.id)}" transform="translate(${x} ${y})">`;
    nodes += `<rect width="240" height="78" rx="10" />`;
    nodes += `<text class="node-title" x="120" y="30" text-anchor="middle">${esc(truncate(p.node.label, 34))}</text>`;
    nodes += `<text class="node-sub" x="120" y="54" text-anchor="middle">${esc(truncate(p.node.detail || st, 36))}</text>`;
    nodes += `</g>`;
  }

  return `<svg class="org-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(v.title)} organization chart">${lines}${nodes}</svg>`;
}

function truncate(s, n) {
  s = String(s);
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
