// Face memory (v5): in-browser face descriptors as an extra "who is who" signal for the tracker (track.js).
// Free + client-side only: @vladmandic/face-api (tiny face detector + 128-d face recognition net, from jsDelivr) runs
// in a Web Worker (faceworker.js), so the game loop never waits for it. Lazy: loaded a moment after the camera and the
// pose model are up; if anything fails it switches itself off silently (shirt + motion tracking as before).
// Cheap: only a small head crop (from the pose nose / eyes) goes to the worker, at most one every TRACK.faceEvery s,
// and only for people who need an identity check (new person, just crossed, not enrolled yet).
// Privacy: descriptors stay in this tab's memory (the tracker's slots); never stored (no localStorage / IndexedDB),
// never sent anywhere; gone on reset / new roll call / page close.
// URL: ?face=0 off; ?face=stub (tests) uses window.__faceStub(lm, target) -> descriptor | null instead of the model
// (answers after a few ms like the worker; window.__faceStubSync = true answers at once, for sim-stepped tests).
const CROP = 160;
export class FaceMemory {
  /** @param param ?face= value; opts.delay = stub answer delay in ms (0 = synchronous, unit tests) */
  constructor(param = null, opts = {}) {
    this.delay = opts.delay ?? 15;
    this.mode = param === '0' || param === 'off' ? 'off' : param === 'stub' ? 'stub' : 'auto';
    this.state = this.mode === 'off' ? 'off' : 'idle'; // idle -> loading -> ready | failed
    this.busy = false; this.reqT = -99; this.sentAt = 0; this.gen = 0; this.timer = 0; this.last = null;
    this.stats = { req: 0, faces: 0, none: 0, ms: 0 }; this.backend = '';
  }
  /** start loading after delayMs (+ an idle moment), once */
  later(delayMs = 1500) {
    if (this.state !== 'idle' || this.timer) return;
    this.timer = setTimeout(() => { const go = () => this.load(); if (globalThis.requestIdleCallback) requestIdleCallback(go, { timeout: 2000 }); else go(); }, delayMs);
  }
  load() {
    if (this.state !== 'idle') return;
    if (this.mode === 'stub') { this.state = 'ready'; this.backend = 'stub'; return; }
    this.state = 'loading';
    try {
      const w = new Worker(new URL('./faceworker.js?v=f1', import.meta.url), { type: 'module' });
      this.worker = w;
      w.onmessage = (e) => this._msg(e.data || {});
      w.onerror = (e) => { e.preventDefault?.(); this._fail('worker error ' + (e.message || '')); };
      w.postMessage({ type: 'init' });
      this.loadTimer = setTimeout(() => { if (this.state === 'loading') this._fail('load timeout'); }, 90000);
    } catch (e) { this._fail(e?.message || e); }
  }
  _fail(why) {
    if (this.state === 'failed') return;
    console.info('[face] face memory off (shirt + motion tracking only):', why);
    this.state = 'failed'; this.busy = false; clearTimeout(this.loadTimer);
    try { this.worker?.terminate(); } catch (e) { /* ignore */ }
    this.worker = null;
  }
  _msg(m) {
    if (m.type === 'ready') { clearTimeout(this.loadTimer); this.state = 'ready'; this.backend = m.backend; console.info('[face] face memory ready:', m.backend, m.ms + ' ms'); }
    else if (m.type === 'fail') this._fail(m.why);
    else if (m.type === 'res') this._done(m.gen, m.id, m.desc, m.ms);
  }
  /**
   * After each tracker.update(): maybe sends one head crop (never waits). src = video / canvas frame (raw, un-mirrored),
   * t = seconds (same clock as the tracker), ar = frame width / height.
   */
  tick(tracker, src, t, ar = 4 / 3) {
    if (this.state !== 'ready' || !tracker) return;
    const now = performance.now();
    if (this.busy && now - this.sentAt > 5000) this.busy = false; // a lost answer never blocks face memory for good
    if (t < this.reqT) this.reqT = -99;
    if (this.busy || t - this.reqT < tracker.o.faceEvery - 1e-9) return;
    const stub = this.mode === 'stub';
    const W = stub ? 640 : src?.videoWidth || src?.width || 0, H = stub ? Math.round(640 / ar) : src?.videoHeight || src?.height || 0;
    if (!W || !H) return;
    const tg = tracker.faceTarget(t, W, H); if (!tg) return;
    this.reqT = t; this.busy = true; this.sentAt = now; this.stats.req++; this.tracker = tracker; this.lastWhy = tg.why;
    const gen = this.gen;
    if (stub) { let d = null; try { d = globalThis.__faceStub?.(tg.lm, tg) || null; } catch (e) { d = null; } if (this.delay > 0 && !globalThis.__faceStubSync) setTimeout(() => this._done(gen, tg.id, d, 1), this.delay); else this._done(gen, tg.id, d, 0); return; }
    const img = this._crop(src, tg.rect); if (!img) { this.busy = false; return; }
    this.worker.postMessage({ type: 'desc', gen, id: tg.id, w: img.width, h: img.height, data: img.data.buffer }, [img.data.buffer]);
  }
  _crop(src, r) {
    if (!this.cv) { this.cv = document.createElement('canvas'); this.cv.width = this.cv.height = CROP; this.cx = this.cv.getContext('2d', { willReadFrequently: true }); }
    try { this.cx.fillStyle = '#808080'; this.cx.fillRect(0, 0, CROP, CROP); this.cx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, CROP, CROP); return this.cx.getImageData(0, 0, CROP, CROP); } catch (e) { return null; }
  }
  _done(gen, id, desc, ms) {
    if (gen !== this.gen) return;
    this.busy = false; this.stats.ms = ms || 0;
    if (!desc) { this.stats.none++; return; }
    this.stats.faces++;
    this.last = this.tracker?.faceResult(id, desc instanceof Float32Array ? desc : Float32Array.from(desc)) || null;
  }
  /** forget pending work (the tracker's reset / roll call forgets the faces themselves) */
  clear() { this.gen++; this.busy = false; this.reqT = -99; this.last = null; }
  get info() { return { mode: this.mode, state: this.state, backend: this.backend, ...this.stats, last: this.last }; }
}
