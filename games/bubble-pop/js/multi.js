// Pure multiplayer helpers (no DOM). Copied from Flap Flyer v2 (js/multi.js); unit-tested in move-play/test/unit-shared.mjs.
//  - personFromLandmarks: is this a countable person (face + shoulders visible)? where (mirrored x)?
//  - PeopleTracker: debounced, stable player slots for up to 4 people in the camera
//  - layoutViewports: split-screen rectangles for 1-4 players
export const MAX_PLAYERS = 4;
// Bird colors per slot (body, darker body, wingtips, head). Slot 0 = the v1 green bird.
export const PLAYER_COLORS = [
  { name: 'green', css: '#38c172', dot: '🟢' },
  { name: 'blue', css: '#3f8fe0', dot: '🔵' },
  { name: 'orange', css: '#ff8a1f', dot: '🟠' },
  { name: 'purple', css: '#a05ad8', dot: '🟣' },
];

const FACE = [0, 2, 5]; // nose, left eye, right eye
const visOk = (p, min) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility === undefined || p.visibility >= min);

/**
 * Returns { x, y, sw, face } (x mirrored like the selfie preview, 0 = left of screen) or null when the shoulders aren't visible.
 * Only detections with face === true (nose or an eye visible) can create / grow a new player; a player who is already
 * flying can be kept alive by shoulders alone (e.g. arms flapping in front of the face).
 */
export function personFromLandmarks(lm, visMin = 0.5) {
  if (!lm || lm.length < 13) return null;
  const ls = lm[11], rs = lm[12];
  if (!visOk(ls, visMin) || !visOk(rs, visMin)) return null;
  const face = FACE.some((i) => visOk(lm[i], visMin));
  const sw = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  if (sw < 0.03) return null;
  return { x: 1 - (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2, sw, face };
}

/**
 * Tracks people across detector frames and debounces joins/leaves.
 * Track states: 'pending' (seen < joinSec), 'active' (has a slot / bird), 'lost' (active but unseen, removed after leaveSec).
 * Slots (0..3 = bird color / player number) are given out when a track becomes active: lowest free slot,
 * and people who become active in the same update get slots in left-to-right order.
 */
export class PeopleTracker {
  constructor(opts = {}) {
    this.o = { joinSec: 1.0, leaveSec: 2.0, pendingGapSec: 0.35, maxJump: 0.22, maxPlayers: MAX_PLAYERS, ...opts };
    this.reset();
  }
  reset() { this.tracks = []; this.nextId = 1; this.t = null; }
  /** @param people array of {x, y, sw, lm?} (already filtered by personFromLandmarks); @param t seconds */
  update(people, t) {
    const o = this.o;
    this.t = t;
    people = (people || []).filter(Boolean).slice(0, 6);
    // predicted positions (light constant-velocity model, so a small crossing doesn't swap ids)
    const tr = this.tracks;
    const pred = tr.map((k) => k.x + k.vx * Math.min(t - k.lastSeen, 0.5));
    // best one-to-one matching by brute force (<= 4-6 items, tiny)
    let best = { cost: Infinity, pairs: [] };
    const cost = (ti, pi) => {
      const k = tr[ti], p = people[pi];
      const dx = Math.abs(pred[ti] - p.x);
      if (dx > o.maxJump + (t - k.lastSeen) * 0.3) return Infinity;
      if (k.state === 'pending' && p.face === false) return Infinity;
      return dx + Math.abs(p.sw - k.sw) * 0.6 + Math.abs(p.y - k.y) * 0.3;
    };
    const used = new Array(people.length).fill(false);
    const rec = (ti, acc, pairs) => {
      if (acc >= best.cost) return;
      if (ti === tr.length) {
        // prefer more matches: each unmatched track costs a penalty
        if (acc < best.cost) best = { cost: acc, pairs: pairs.slice() };
        return;
      }
      rec(ti + 1, acc + 0.5, pairs); // leave track ti unmatched
      for (let pi = 0; pi < people.length; pi++) {
        if (used[pi]) continue;
        const c = cost(ti, pi);
        if (!Number.isFinite(c)) continue;
        used[pi] = true; pairs.push([ti, pi]);
        rec(ti + 1, acc + c, pairs);
        pairs.pop(); used[pi] = false;
      }
    };
    rec(0, 0, []);
    const matchedP = new Set();
    const matchedT = new Set();
    for (const [ti, pi] of best.pairs) {
      const k = tr[ti], p = people[pi];
      const gap = Math.max(1e-3, t - k.lastSeen);
      const v = (p.x - k.x) / gap;
      k.vx = gap < 0.5 ? k.vx + (v - k.vx) * 0.5 : 0;
      k.x = p.x; k.y = p.y; k.sw = k.sw * 0.7 + p.sw * 0.3; k.lm = p.lm || null; k.lastSeen = t;
      if (k.state === 'lost') k.state = 'active';
      matchedP.add(pi); matchedT.add(ti);
    }
    // unmatched tracks
    for (let ti = 0; ti < tr.length; ti++) {
      if (matchedT.has(ti)) continue;
      const k = tr[ti];
      k.lm = null; k.vx *= 0.5;
      if (k.state === 'pending' && t - k.lastSeen > o.pendingGapSec) k.dead = true;
      else if (k.state === 'active') k.state = 'lost';
      if (k.state === 'lost' && t - k.lastSeen >= o.leaveSec) k.dead = true;
    }
    this.tracks = tr.filter((k) => !k.dead);
    if (this.tracks.length > 8) this.tracks.length = 8;
    // new people -> pending tracks
    for (let pi = 0; pi < people.length; pi++) {
      if (matchedP.has(pi)) continue;
      const p = people[pi];
      if (p.face === false) continue; // need a face to count as a new person
      this.tracks.push({ id: this.nextId++, slot: -1, state: 'pending', x: p.x, y: p.y, sw: p.sw, vx: 0, lm: p.lm || null, firstSeen: t, lastSeen: t });
    }
    // pending long enough -> active, gets a slot
    const ready = this.tracks.filter((k) => k.state === 'pending' && t - k.firstSeen >= o.joinSec - 1e-9).sort((a, b) => a.x - b.x);
    for (const k of ready) {
      const taken = new Set(this.tracks.filter((q) => q.slot >= 0).map((q) => q.slot));
      if (taken.size >= o.maxPlayers) break;
      let s = 0; while (taken.has(s)) s++;
      k.slot = s; k.state = 'active';
    }
    return this.players();
  }
  /** players with a slot (active or lost), sorted by slot */
  players() { return this.tracks.filter((k) => k.slot >= 0).sort((a, b) => a.slot - b.slot); }
  get count() { return this.tracks.filter((k) => k.slot >= 0).length; }
}

/**
 * Split-screen layout. Rects use CSS pixels, origin top-left: { x, y, w, h }.
 * 1 = full, 2 = side by side (landscape) / stacked (portrait), 3-4 = 2x2 grid.
 * For 3 players the 4th cell is returned as `extra` (scoreboard tile).
 * `gap` = divider width in px between tiles.
 */
export function layoutViewports(n, W, H, gap = 4) {
  n = Math.max(1, Math.min(MAX_PLAYERS, n | 0));
  const portrait = W / H < 1;
  const g = gap / 2;
  const R = (x, y, w, h) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  if (n === 1) return { views: [R(0, 0, W, H)], extra: null, portrait, cols: 1, rows: 1 };
  if (n === 2) {
    if (portrait) return { views: [R(0, 0, W, H / 2 - g), R(0, H / 2 + g, W, H / 2 - g)], extra: null, portrait, cols: 1, rows: 2 };
    return { views: [R(0, 0, W / 2 - g, H), R(W / 2 + g, 0, W / 2 - g, H)], extra: null, portrait, cols: 2, rows: 1 };
  }
  const cw = W / 2 - g, ch = H / 2 - g;
  const cells = [R(0, 0, cw, ch), R(W / 2 + g, 0, cw, ch), R(0, H / 2 + g, cw, ch), R(W / 2 + g, H / 2 + g, cw, ch)];
  return { views: cells.slice(0, n), extra: n === 3 ? cells[3] : null, portrait, cols: 2, rows: 2 };
}

/** Order players for the screen: left-to-right by where they stand (mirrored x), so tiles match the room. */
export function screenOrder(players) {
  return players.slice().sort((a, b) => (a.x ?? a.slot) - (b.x ?? b.slot) || a.slot - b.slot);
}
