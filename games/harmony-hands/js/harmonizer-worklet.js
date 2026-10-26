// AudioWorklet: live pitch detection (YIN on a 2x-decimated copy) + up to 3 pitch-shifted harmony voices.
// Shifter: two Hann-windowed read taps on a delay line (granular / "delay-line" shifter). Each new grain is
// started a whole number of pitch periods away from the other tap, so the two taps stay in phase on a voice
// (less warble). Each voice is snapped to a chord tone: ratio = 2^((target - sungMidi)/12).
// Self-contained (no imports) so it also runs in Node tests through a tiny stub.

const PCS_DEFAULT = [6, 10, 1]; // F# major
const pcOf = (n) => ((n % 12) + 12) % 12;

function harmonyTargets(sungMidi, pcs, voices) {
  const n = Math.round(sungMidi);
  const isTone = (m) => pcs.includes(pcOf(m));
  const up = []; for (let m = n + 1; up.length < 2 && m < n + 25; m++) if (isTone(m)) up.push(m);
  let down = n - 1; while (!isTone(down) && down > n - 13) down--;
  return [up[0], down, up[1]].slice(0, Math.max(0, Math.min(3, voices)));
}

class Yin {
  constructor(sr, { fmin = 65, fmax = 1100, win = 640, thresh = 0.15 } = {}) {
    this.sr = sr; this.win = win; this.thresh = thresh;
    this.tauMin = Math.max(2, Math.floor(sr / fmax)); this.tauMax = Math.ceil(sr / fmin);
    this.d = new Float32Array(this.tauMax + 2);
  }
  /** buf: Float32Array length >= win + tauMax (oldest first). returns {f, conf} (f = 0 when unvoiced) */
  detect(buf) {
    const { win, tauMax, tauMin, d } = this;
    d[0] = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      let s = 0;
      for (let i = 0; i < win; i++) { const x = buf[i] - buf[i + tau]; s += x * x; }
      d[tau] = s;
    }
    // cumulative mean normalised difference
    let run = 0; d[0] = 1;
    for (let tau = 1; tau <= tauMax; tau++) { run += d[tau]; d[tau] = run > 0 ? d[tau] * tau / run : 1; }
    let tau = -1;
    for (let t = tauMin; t < tauMax; t++) {
      if (d[t] < this.thresh) { while (t + 1 < tauMax && d[t + 1] < d[t]) t++; tau = t; break; }
    }
    if (tau < 0) { // no dip under threshold: take global min but report low confidence
      let best = tauMin; for (let t = tauMin; t < tauMax; t++) if (d[t] < d[best]) best = t;
      return { f: 0, conf: 1 - d[best], tau: best };
    }
    const a = d[tau - 1], b = d[tau], c = d[tau + 1];
    const den = a - 2 * b + c; const shift = den !== 0 ? 0.5 * (a - c) / den : 0;
    const t = tau + (Math.abs(shift) < 1 ? shift : 0);
    return { f: this.sr / t, conf: 1 - b, tau: t };
  }
}

class Shifter {
  constructor(sr) {
    this.sr = sr; this.dmin = 4; this.L = Math.round(0.028 * sr); this.T = 0; this.ratio = 1;
    // two taps half a grain apart; a = distance travelled in this grain (progress = a / L)
    this.taps = [{ d: this.dmin + this.L, a: 0, L: this.L }, { d: this.dmin + this.L / 2, a: this.L / 2, L: this.L }];
  }
  setPeriod(T) { // grain length ~3 periods, 20..50 ms
    const sr = this.sr; this.T = T;
    this.L = T > 0 ? Math.round(Math.min(0.05 * sr, Math.max(0.02 * sr, 3 * T))) : Math.round(0.028 * sr);
  }
  rebirth(tap, other) {
    const up = this.ratio > 1; tap.L = this.L; tap.a = 0;
    let d0 = up ? this.dmin + this.L : this.dmin;
    const T = this.T;
    if (T > 0) { // start a whole number of periods away from the other tap: both read in phase
      const k = Math.ceil((d0 - other.d) / T);
      const al = other.d + k * T;
      if (al >= this.dmin && al < d0 + T + 1) d0 = al;
    }
    tap.d = d0;
  }
}

class HarmonizerCore {
  constructor(sr) {
    this.sr = sr;
    this.N = 8192; this.mask = this.N - 1; this.buf = new Float32Array(this.N); this.w = 0;
    this.yin = new Yin(sr / 2);
    this.dsN = this.yin.win + this.yin.tauMax + 4; this.ds = new Float32Array(this.dsN); this.dsW = 0; this.dsBuf = new Float32Array(this.dsN);
    this.prevIn = 0; this.odd = false; this.hop = 512; this.sinceDet = 0; this.sinceMsg = 0;
    this.voices = [new Shifter(sr), new Shifter(sr), new Shifter(sr)];
    this.pcs = PCS_DEFAULT.slice(); this.nVoices = 2; this.mix = 0.5; this.dryOn = true;
    this.f = 0; this.conf = 0; this.rms = 0; this.midi = 0; this.sung = 0; this.lastVoiced = -1e9; this.t = 0;
    this.targets = []; this.wetEnv = 0; this.ratiosT = [1, 1, 1];
    this.gate = 0.006; this.fixed = null; this.solo = null; // fixed = {sung} for tests (skip detection)
    this.pans = [[0.85, 0.5], [0.5, 0.85], [0.7, 0.7]];
  }
  set(m) {
    if (m.pcs) this.pcs = m.pcs.slice();
    if (m.voices != null) this.nVoices = m.voices;
    if (m.mix != null) this.mix = m.mix;
    if (m.dry != null) this.dryOn = m.dry;
    if (m.gate != null) this.gate = m.gate;
    if (m.solo !== undefined) this.solo = m.solo; // test hook: render one voice only
    if (m.fixedSung !== undefined) this.fixed = m.fixedSung;
    this.retarget();
  }
  retarget() {
    if (!this.sung) { this.targets = []; return; }
    this.targets = harmonyTargets(this.sung, this.pcs, this.nVoices);
    for (let i = 0; i < 3; i++) this.ratiosT[i] = this.targets[i] != null ? Math.pow(2, (this.targets[i] - this.midi) / 12) : 1;
  }
  detect() {
    const ds = this.ds, n = this.dsN, out = this.dsBuf;
    for (let i = 0; i < n; i++) out[i] = ds[(this.dsW + i) % n];
    let e = 0; for (let i = n - this.yin.win; i < n; i++) e += out[i] * out[i];
    this.rms = Math.sqrt(e / this.yin.win);
    const r = this.yin.detect(out);
    this.conf = r.conf;
    if (r.f > 0 && this.rms > this.gate && r.conf > 0.8) {
      this.f = r.f; const m = 69 + 12 * Math.log2(r.f / 440);
      this.midi = this.lastVoiced > this.t - 0.15 * this.sr ? this.midi + 0.5 * (m - this.midi) : m;
      if (Math.abs(m - this.midi) > 1.5) this.midi = m; // note jump: follow at once
      if (!this.sung || Math.abs(this.midi - Math.round(this.sung)) > 0.62) this.sung = Math.round(this.midi);
      this.lastVoiced = this.t;
      const T = this.sr / r.f; for (const v of this.voices) v.setPeriod(T);
      this.retarget();
    } else this.f = 0;
  }
  /** in: Float32Array mono; outL/outR: Float32Array */
  process(inp, outL, outR) {
    const n = inp.length, buf = this.buf, mask = this.mask;
    if (this.fixed != null && this.sung !== this.fixed) { this.sung = this.midi = this.fixed; this.lastVoiced = this.t; for (const v of this.voices) v.setPeriod(this.sr / (440 * Math.pow(2, (this.fixed - 69) / 12))); this.retarget(); }
    const dryG = this.dryOn ? Math.cos(this.mix * Math.PI / 2) : 0;
    const wetG = Math.sin(this.mix * Math.PI / 2) * 0.8;
    for (let i = 0; i < n; i++) {
      const x = inp ? inp[i] : 0;
      buf[this.w] = x;
      // decimate by 2 for pitch detection (2-tap average)
      if (this.odd) { this.ds[this.dsW] = 0.5 * (x + this.prevIn); this.dsW = (this.dsW + 1) % this.dsN; }
      this.prevIn = x; this.odd = !this.odd;
      if (++this.sinceDet >= this.hop && this.fixed == null) { this.sinceDet = 0; this.detect(); }
      const voiced = this.fixed != null || (this.t - this.lastVoiced) < 0.2 * this.sr;
      const envT = voiced && this.targets.length ? 1 : 0;
      this.wetEnv += (envT - this.wetEnv) * (envT > this.wetEnv ? 0.004 : 0.0006);
      let L = x * dryG, R = x * dryG;
      if (this.wetEnv > 1e-4) {
        for (let v = 0; v < this.nVoices; v++) {
          if (this.solo != null && this.solo !== v) continue;
          const sh = this.voices[v];
          sh.ratio += (this.ratiosT[v] - sh.ratio) * 0.003;
          const y = this.voiceSample(sh);
          const g = y * wetG * this.wetEnv;
          L += g * this.pans[v][0]; R += g * this.pans[v][1];
        }
      }
      outL[i] = L; if (outR) outR[i] = R;
      this.w = (this.w + 1) & mask; this.t++;
    }
  }
  read(d) { // Hermite interpolated read, d samples back from the newest sample
    const buf = this.buf, mask = this.mask;
    const pos = this.w - d; const i = Math.floor(pos), f = pos - i;
    const xm1 = buf[(i - 1) & mask], x0 = buf[i & mask], x1 = buf[(i + 1) & mask], x2 = buf[(i + 2) & mask];
    const c = (x1 - xm1) * 0.5, v = x0 - x1, w = c + v, a = w + v + (x2 - x0) * 0.5, b = w + a;
    return ((a * f - b) * f + c) * f + x0;
  }
  voiceSample(sh) {
    const step = 1 - sh.ratio, as = Math.abs(step); let num = 0, den = 0;
    for (let k = 0; k < 2; k++) {
      const tap = sh.taps[k];
      if (tap.a >= tap.L || tap.d < sh.dmin || tap.d > this.N - 8) sh.rebirth(tap, sh.taps[1 - k]);
      const s = Math.sin(Math.PI * tap.a / tap.L), wgt = s * s;
      num += wgt * this.read(tap.d); den += wgt;
      tap.d += step; tap.a += as;
    }
    return den > 1e-3 ? num / Math.max(den, 0.3) : 0;
  }
  status() { return { f: this.f, midi: this.f ? this.midi : 0, sung: this.sung, conf: this.conf, rms: this.rms, targets: this.targets.slice(), voiced: (this.t - this.lastVoiced) < 0.2 * this.sr }; }
}

if (typeof registerProcessor === 'function') {
  class HarmonizerProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.core = new HarmonizerCore(sampleRate); this.since = 0;
      this.port.onmessage = (e) => this.core.set(e.data || {});
    }
    process(inputs, outputs) {
      const inp = inputs[0] && inputs[0][0]; const out = outputs[0];
      const n = out[0].length;
      this.core.process(inp || new Float32Array(n), out[0], out[1]);
      this.since += n;
      if (this.since >= 1536) { this.since = 0; this.port.postMessage(this.core.status()); }
      return true;
    }
  }
  registerProcessor('harmonizer', HarmonizerProcessor);
}
if (typeof globalThis !== 'undefined') globalThis.HarmonizerDSP = { HarmonizerCore, Yin, Shifter, harmonyTargets };
