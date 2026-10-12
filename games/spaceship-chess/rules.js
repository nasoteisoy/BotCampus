/* Spaceship Chess rules + AI. PURE: no DOM, no Three.js. Runs in the page (window.RULES),
   in the AI Web Worker (self.RULES via importScripts) and in node (module.exports).
   Board: 8x8x8. Square index s = x + 8*y + 64*z.  x = file a-h, y = row 1-8, z = level 1-8.
   Pieces: +type = Blue (moves first, levels 1-2), -type = Orange (levels 7-8). */
(function (root) {
  'use strict';
  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6, U = 7;
  const NAMES = ['', 'Drone', 'Fighter', 'Interceptor', 'Battleship', 'Mothership', 'Command station', 'Scout'];
  const ICON = ['', '🤖', '🚀', '🛩️', '🚢', '🛸', '🛰️', '🦄'];
  const VAL = [0, 100, 300, 320, 500, 1100, 0, 280];
  const sq = (x, y, z) => x + 8 * y + 64 * z;
  const X = (s) => s & 7, Y = (s) => (s >> 3) & 7, Z = (s) => s >> 6;
  const on = (x, y, z) => x >= 0 && x < 8 && y >= 0 && y < 8 && z >= 0 && z < 8;

  // 26 directions split by class
  const ORTHO = [], DIAG = [], TRI = [];
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const n = (dx !== 0) + (dy !== 0) + (dz !== 0); if (!n) continue;
    (n === 1 ? ORTHO : n === 2 ? DIAG : TRI).push([dx, dy, dz]);
  }
  const DIRS = ORTHO.concat(DIAG, TRI);              // 0-5 ortho, 6-17 diag, 18-25 tri
  const KNO = [];                                     // 24 knight leaps: permutations of (±2, ±1, 0)
  for (const a of [-2, 2]) for (const b of [-1, 1]) {
    KNO.push([a, b, 0], [a, 0, b], [b, a, 0], [0, a, b], [b, 0, a], [0, b, a]);
  }
  // precomputed rays / leaps
  const RAYS = DIRS.map(() => new Array(512));
  const KN = new Array(512), KG = new Array(512);
  const PF = [new Array(512), new Array(512)], PC = [new Array(512), new Array(512)], PA = [new Array(512), new Array(512)];
  // pawn: Blue (ci 0) forward = +row or +level; Orange (ci 1) = -row or -level
  const PFWD = [[[0, 1, 0], [0, 0, 1]], [[0, -1, 0], [0, 0, -1]]];
  const PCAP = [[[-1, 1, 0], [1, 1, 0], [-1, 0, 1], [1, 0, 1], [0, 1, 1]], [[-1, -1, 0], [1, -1, 0], [-1, 0, -1], [1, 0, -1], [0, -1, -1]]];
  const list = (s, offs) => { const x = X(s), y = Y(s), z = Z(s), r = []; for (const [a, b, c] of offs) if (on(x + a, y + b, z + c)) r.push(sq(x + a, y + b, z + c)); return Int16Array.from(r); };
  for (let s = 0; s < 512; s++) {
    const x = X(s), y = Y(s), z = Z(s);
    DIRS.forEach(([a, b, c], d) => { const r = []; let i = x + a, j = y + b, k = z + c; while (on(i, j, k)) { r.push(sq(i, j, k)); i += a; j += b; k += c; } RAYS[d][s] = Int16Array.from(r); });
    KN[s] = list(s, KNO); KG[s] = list(s, DIRS);
    for (let ci = 0; ci < 2; ci++) {
      PF[ci][s] = list(s, PFWD[ci]); PC[ci][s] = list(s, PCAP[ci]);
      PA[ci][s] = list(s, PCAP[ci].map(([a, b, c]) => [-a, -b, -c])); // squares a pawn of ci would attack s from
    }
  }
  const ci = (c) => (c > 0 ? 0 : 1);
  const promoSq = (c, t) => (c > 0 ? (Y(t) === 7 || Z(t) === 7) : (Y(t) === 0 || Z(t) === 0));

  // ---------------------------------------------------------------- setup
  const BACK = [R, N, B, Q, K, B, N, R];
  const L2 = [0, U, U, 0, 0, U, U, 0];
  function fresh() {
    const b = new Int8Array(512);
    for (let x = 0; x < 8; x++) {
      b[sq(x, 0, 0)] = BACK[x]; b[sq(x, 1, 0)] = P; b[sq(x, 1, 1)] = P; if (L2[x]) b[sq(x, 0, 1)] = L2[x];
      b[sq(x, 7, 7)] = -BACK[x]; b[sq(x, 6, 7)] = -P; b[sq(x, 6, 6)] = -P; if (L2[x]) b[sq(x, 7, 6)] = -L2[x];
    }
    return fromBoard(b, 1);
  }
  function fromBoard(b, turn) {
    const st = { b: Int8Array.from(b), turn: turn || 1, kw: -1, kb: -1, stack: [] };
    for (let s = 0; s < 512; s++) { if (st.b[s] === K) st.kw = s; else if (st.b[s] === -K) st.kb = s; }
    return st;
  }
  const clone = (st) => fromBoard(st.b, st.turn);

  // ---------------------------------------------------------------- attacks
  function attacked(b, s, by) {
    for (let d = 0; d < 26; d++) {
      const r = RAYS[d][s];
      for (let i = 0; i < r.length; i++) {
        const p = b[r[i]]; if (!p) continue;
        if (p * by > 0) {
          const t = p > 0 ? p : -p;
          if (t === Q) return true;
          if (i === 0 && t === K) return true;
          if (d < 6) { if (t === R) return true; }
          else if (d < 18) { if (t === B) return true; }
          else if (t === U) return true;
        }
        break;
      }
    }
    const kn = KN[s]; for (let i = 0; i < kn.length; i++) if (b[kn[i]] === by * N) return true;
    const pa = PA[ci(by)][s]; for (let i = 0; i < pa.length; i++) if (b[pa[i]] === by * P) return true;
    return false;
  }
  const inCheck = (st, c) => { const k = c > 0 ? st.kw : st.kb; return k >= 0 && attacked(st.b, k, -c); };

  // ---------------------------------------------------------------- move generation (move = from | to << 9)
  function slide(b, s, c, d0, d1, out, capsOnly) {
    for (let d = d0; d < d1; d++) { const r = RAYS[d][s]; for (let i = 0; i < r.length; i++) { const t = r[i], q = b[t]; if (!q) { if (!capsOnly) out.push(s | t << 9); continue; } if (q * c < 0) out.push(s | t << 9); break; } }
  }
  function genFrom(st, s, out, capsOnly) {
    const b = st.b, p = b[s], c = p > 0 ? 1 : -1, t = p * c;
    if (t === P) {
      const f = PF[ci(c)][s]; if (!capsOnly) for (let i = 0; i < f.length; i++) if (!b[f[i]]) out.push(s | f[i] << 9);
      const k = PC[ci(c)][s]; for (let i = 0; i < k.length; i++) if (b[k[i]] * c < 0) out.push(s | k[i] << 9);
    } else if (t === N || t === K) {
      const l = t === N ? KN[s] : KG[s]; for (let i = 0; i < l.length; i++) { const q = b[l[i]]; if (q * c < 0 || (!q && !capsOnly)) out.push(s | l[i] << 9); }
    } else if (t === R) slide(b, s, c, 0, 6, out, capsOnly);
    else if (t === B) slide(b, s, c, 6, 18, out, capsOnly);
    else if (t === U) slide(b, s, c, 18, 26, out, capsOnly);
    else if (t === Q) slide(b, s, c, 0, 26, out, capsOnly);
    return out;
  }
  function pseudo(st, out, capsOnly) { const b = st.b, c = st.turn; for (let s = 0; s < 512; s++) if (b[s] * c > 0) genFrom(st, s, out, capsOnly); return out; }
  function make(st, m) {
    const f = m & 511, t = m >> 9, b = st.b, p = b[f], cap = b[t];
    st.stack.push(p, cap);
    const c = p > 0 ? 1 : -1;
    b[t] = (p * c === P && promoSq(c, t)) ? c * Q : p; b[f] = 0;
    if (p === K) st.kw = t; else if (p === -K) st.kb = t;
    if (cap === K) st.kw = -1; else if (cap === -K) st.kb = -1;
    st.turn = -st.turn;
  }
  function unmake(st, m) {
    const f = m & 511, t = m >> 9, cap = st.stack.pop(), p = st.stack.pop();
    st.b[f] = p; st.b[t] = cap;
    if (p === K) st.kw = f; else if (p === -K) st.kb = f;
    if (cap === K) st.kw = t; else if (cap === -K) st.kb = t;
    st.turn = -st.turn;
  }
  function legal(st, from) {
    const out = from === undefined ? pseudo(st, []) : (st.b[from] * st.turn > 0 ? genFrom(st, from, []) : []);
    const c = st.turn, res = [];
    for (const m of out) { make(st, m); if (!inCheck(st, c)) res.push(m); unmake(st, m); }
    return res;
  }
  function hasLegal(st) {
    const c = st.turn, b = st.b, out = [];
    for (let s = 0; s < 512; s++) if (b[s] * c > 0) {
      out.length = 0; genFrom(st, s, out);
      for (const m of out) { make(st, m); const ok = !inCheck(st, c); unmake(st, m); if (ok) return true; }
    }
    return false;
  }
  function bareKings(b) { for (let s = 0; s < 512; s++) if (b[s] && b[s] !== K && b[s] !== -K) return false; return true; }
  // 'play' | 'check' | 'mate' | 'stalemate' | 'draw'
  function status(st) {
    const chk = inCheck(st, st.turn), any = hasLegal(st);
    if (!any) return chk ? 'mate' : 'stalemate';
    if (bareKings(st.b)) return 'draw';
    return chk ? 'check' : 'play';
  }

  // ---------------------------------------------------------------- evaluation + search
  const CENT = new Int16Array(512);
  for (let s = 0; s < 512; s++) CENT[s] = Math.round(10.5 - (Math.abs(X(s) - 3.5) + Math.abs(Y(s) - 3.5) + Math.abs(Z(s) - 3.5)));
  function mobility(b, s, p) {
    const c = p > 0 ? 1 : -1, t = p * c; let n = 0, d0, d1;
    if (t === N) { const l = KN[s]; for (let i = 0; i < l.length; i++) if (b[l[i]] * c <= 0) n++; return n; }
    if (t === R) { d0 = 0; d1 = 6; } else if (t === B) { d0 = 6; d1 = 18; } else if (t === U) { d0 = 18; d1 = 26; } else if (t === Q) { d0 = 0; d1 = 26; } else return 0;
    for (let d = d0; d < d1; d++) { const r = RAYS[d][s]; for (let i = 0; i < r.length; i++) { const q = b[r[i]]; if (!q) { n++; continue; } if (q * c < 0) n++; break; } }
    return n;
  }
  // score from White(Blue) perspective: material + mobility + centrality + drone advance
  function evaluate(st) {
    const b = st.b; let sc = 0;
    for (let s = 0; s < 512; s++) {
      const p = b[s]; if (!p) continue;
      const c = p > 0 ? 1 : -1, t = p * c; let v = VAL[t];
      if (t === P) v += 6 * (c > 0 ? Y(s) + Z(s) : 14 - Y(s) - Z(s));
      else if (t !== K) v += 2 * CENT[s] + 3 * mobility(b, s, p);
      else v -= 2 * CENT[s];
      sc += c * v;
    }
    return sc;
  }
  const MATE = 100000;
  function search(st, opts) {
    opts = opts || {};
    const t0 = Date.now(), budget = opts.ms || 900, maxDepth = opts.depth || 3, rnd = opts.random === undefined ? 8 : opts.random;
    const now = () => Date.now();
    let nodes = 0, stop = false;
    const order = (ms) => {
      const b = st.b; const key = (m) => { const v = b[m >> 9]; return v ? 10 * VAL[v > 0 ? v : -v] + 1000 - VAL[Math.abs(b[m & 511])] / 10 : 0; };
      return ms.map((m) => [key(m), m]).sort((a, c) => c[0] - a[0]).map((x) => x[1]);
    };
    function quies(alpha, beta, qd) {
      nodes++;
      const stand = evaluate(st) * st.turn;
      if (stand >= beta) return stand; if (stand > alpha) alpha = stand;
      if (qd <= 0) return alpha;
      const c = st.turn;
      for (const m of order(pseudo(st, [], true))) {
        make(st, m);
        if (inCheck(st, c)) { unmake(st, m); continue; }
        const v = -quies(-beta, -alpha, qd - 1); unmake(st, m);
        if (v >= beta) return v; if (v > alpha) alpha = v;
      }
      return alpha;
    }
    function nega(depth, alpha, beta, ply) {
      if ((++nodes & 255) === 0 && now() - t0 > budget) stop = true;
      if (stop) return 0;
      if (depth <= 0) return quies(alpha, beta, 2);
      const c = st.turn; let best = -Infinity, any = false;
      for (const m of order(pseudo(st, []))) {
        make(st, m);
        if (inCheck(st, c)) { unmake(st, m); continue; }
        any = true;
        const v = -nega(depth - 1, -beta, -alpha, ply + 1); unmake(st, m);
        if (stop) return 0;
        if (v > best) best = v; if (v > alpha) alpha = v; if (alpha >= beta) break;
      }
      if (!any) return inCheck(st, c) ? -MATE + ply : 0;
      return best;
    }
    let root = legal(st); if (!root.length) return { move: -1, score: 0, depth: 0, nodes: 0, ms: 0 };
    // light randomness so games vary; applied once to root ordering ties
    let scored = root.map((m) => [0, m]), best = root[0], bestScore = -Infinity, done = 0;
    for (let depth = 1; depth <= maxDepth; depth++) {
      const cur = [];
      let alpha = -Infinity;
      for (const [, m] of scored) {
        make(st, m);
        const v = -nega(depth - 1, -Infinity, -alpha, 1) + (rnd ? Math.floor(Math.random() * rnd) : 0);
        unmake(st, m);
        if (stop) break;
        cur.push([v, m]); if (v > alpha) alpha = v;
      }
      if (stop && depth > 1) break;
      // partial depth-1 results still beat nothing
      cur.sort((a, c) => c[0] - a[0]);
      const rest = scored.filter(([, m]) => !cur.some((x) => x[1] === m));
      scored = cur.concat(rest);
      best = scored[0][1]; bestScore = scored[0][0]; done = depth;
      if (stop || bestScore > MATE - 100 || now() - t0 > budget * 0.45) break; // next depth would not finish in time
    }
    return { move: best, score: bestScore, depth: done, nodes, ms: now() - t0 };
  }

  // ---------------------------------------------------------------- game record (list of moves from the start)
  const KEY = 'spaceship-chess-save-v1';
  function replay(moves) { const st = fresh(); for (const m of moves) { if (legal(st).indexOf(m) < 0) return null; make(st, m); } st.stack.length = 0; return st; }
  function valid(o) { return !!o && typeof o === 'object' && Array.isArray(o.moves) && o.moves.length < 2000 && o.moves.every((m) => Number.isInteger(m) && m >= 0 && m < 262144) && (o.mode === 'ai' || o.mode === 'pass'); }
  function load(storage) {
    try { const o = JSON.parse(storage.getItem(KEY)); if (valid(o) && replay(o.moves)) return { mode: o.mode, moves: o.moves.slice() }; } catch (e) { /* junk -> fresh */ }
    return { mode: 'ai', moves: [] };
  }
  const name = (s) => 'abcdefgh'[X(s)] + (Y(s) + 1);

  const api = { P, N, B, R, Q, K, U, NAMES, ICON, VAL, DIRS, ORTHO, DIAG, TRI, KNO, sq, X, Y, Z, fresh, fromBoard, clone, attacked, inCheck,
    pseudo, genFrom, legal, make, unmake, status, evaluate, search, replay, valid, load, KEY, name, promoSq, MATE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RULES = api;
})(typeof self !== 'undefined' ? self : this);
