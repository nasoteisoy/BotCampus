import { centsOff, midiToName, midiToFreq } from './theory.js';
import { harmonyAtBeat } from './audio-engine.js';

const ON_CENTS = 50;

/**
 * Live scrolling pitch lane + accuracy scoring.
 * Target harmony = gold line; sung pitch = cyan line (octave-folded toward target).
 */
export class PracticeSession {
  constructor({ canvas, exercise, octaveShift }) {
    this.canvas = canvas;
    this.ctx2d = canvas.getContext('2d');
    this.exercise = exercise;
    this.octaveShift = octaveShift;
    this.handle = null;
    this.samples = []; // {t, targetMidi, sungMidi, cents, ok}
    this.running = false;
    this.beat = 0;
    this.lastPitch = null;
    this._resize();
  }

  _resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(r.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(r.height * dpr));
    this.dpr = dpr;
  }

  start(handle) {
    this.handle = handle;
    this.samples = [];
    this.running = true;
    this.beat = 0;
    this._resize();
  }

  stop() {
    this.running = false;
  }

  /** Fold sung MIDI into nearest octave relative to target so male/female both score. */
  static foldToTarget(sungMidi, targetMidi) {
    if (sungMidi == null || targetMidi == null) return null;
    let s = sungMidi;
    while (s - targetMidi > 6) s -= 12;
    while (targetMidi - s > 6) s += 12;
    return s;
  }

  onBeat(b) {
    this.beat = b;
  }

  onPitch(pitch) {
    if (!this.running || !this.handle) return;
    const target = harmonyAtBeat(this.handle.harmony, this.beat);
    let cents = null;
    let ok = false;
    let sungFolded = null;
    if (pitch && pitch.f > 0 && pitch.conf > 0.55 && target != null) {
      const rawMidi = 69 + 12 * Math.log2(pitch.f / 440);
      sungFolded = PracticeSession.foldToTarget(rawMidi, target);
      cents = centsOff(midiToFreq(sungFolded), target);
      ok = cents != null && Math.abs(cents) <= ON_CENTS;
    }
    this.lastPitch = {
      targetMidi: target,
      sungMidi: sungFolded,
      cents,
      ok,
      conf: pitch ? pitch.conf : 0,
      f: pitch ? pitch.f : 0,
    };
    this.samples.push({
      t: this.beat,
      targetMidi: target,
      sungMidi: sungFolded,
      cents,
      ok: !!ok,
      voiced: !!(pitch && pitch.f > 0 && pitch.conf > 0.55),
    });
  }

  getMeter() {
    return this.lastPitch || { targetMidi: null, sungMidi: null, cents: null, ok: false };
  }

  draw() {
    const ctx = this.ctx2d;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1a1d27';
    ctx.fillRect(0, 0, w, h);

    const total = this.handle ? this.handle.totalBeats : 8;
    const windowBeats = Math.min(8, total);
    const now = this.beat;
    const t0 = Math.max(0, now - windowBeats * 0.25);
    const t1 = t0 + windowBeats;

    // Staff-ish horizontal guides
    ctx.strokeStyle = '#2a2e3a';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h * i) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Now line
    const nowX = ((now - t0) / (t1 - t0)) * w;
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(nowX, 0);
    ctx.lineTo(nowX, h);
    ctx.stroke();

    if (!this.handle) return;

    const midis = this.handle.harmony.map((n) => n.midi).filter((m) => m != null);
    const lo = Math.min(...midis) - 2;
    const hi = Math.max(...midis) + 2;
    const yOf = (m) => {
      if (m == null) return h / 2;
      return h - ((m - lo) / (hi - lo || 1)) * (h - 16) - 8;
    };
    const xOf = (t) => ((t - t0) / (t1 - t0)) * w;

    // Target segments
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const n of this.handle.harmony) {
      if (n.midi == null) continue;
      const x1 = xOf(n.t);
      const x2 = xOf(n.t + n.beats);
      if (x2 < 0 || x1 > w) continue;
      const y = yOf(n.midi);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
    }

    // Sung trail
    ctx.strokeStyle = '#5eead4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    const recent = this.samples.filter((s) => s.t >= t0 && s.sungMidi != null);
    for (const s of recent) {
      const x = xOf(s.t);
      const y = yOf(s.sungMidi);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    if (started) ctx.stroke();
  }

  /** Score: % of voiced samples within ±50 cents, overall + per phrase. */
  score() {
    const voiced = this.samples.filter((s) => s.voiced && s.targetMidi != null);
    const ok = voiced.filter((s) => s.ok).length;
    const overall = voiced.length ? (100 * ok) / voiced.length : 0;
    const phrases = (this.exercise.phrases || [[0, this.handle ? this.handle.totalBeats : 0]]).map(
      ([a, b], i) => {
        const slice = voiced.filter((s) => s.t >= a && s.t < b);
        const good = slice.filter((s) => s.ok).length;
        const pct = slice.length ? (100 * good) / slice.length : 0;
        return { index: i + 1, pct, samples: slice.length };
      }
    );
    return { overall, phrases, samples: voiced.length };
  }
}

export function formatMeter(m) {
  const target = m.targetMidi != null ? midiToName(m.targetMidi) : '—';
  const sung = m.sungMidi != null ? midiToName(m.sungMidi) : '—';
  let centsLabel = '—';
  let state = 'idle';
  let cls = 'idle';
  if (m.cents != null && Number.isFinite(m.cents)) {
    const c = Math.round(m.cents);
    if (Math.abs(c) <= ON_CENTS) {
      centsLabel = (c >= 0 ? '+' : '') + c;
      state = 'On note';
      cls = 'on';
    } else if (c < 0) {
      centsLabel = String(c);
      state = 'Flat';
      cls = 'flat';
    } else {
      centsLabel = '+' + c;
      state = 'Sharp';
      cls = 'sharp';
    }
  } else {
    state = 'Listen';
  }
  return { target, sung, centsLabel, state, cls };
}
