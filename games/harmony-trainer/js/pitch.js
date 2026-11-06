/**
 * YIN pitch detector (McLeod/de Cheveigné style CMND).
 * Adapted from parts-library/harmony-hands harmonizer-worklet (DIY, no paid deps).
 */
export class Yin {
  constructor(sr, { fmin = 70, fmax = 900, win = 640, thresh = 0.12 } = {}) {
    this.sr = sr;
    this.win = win;
    this.thresh = thresh;
    this.tauMin = Math.max(2, Math.floor(sr / fmax));
    this.tauMax = Math.ceil(sr / fmin);
    this.d = new Float32Array(this.tauMax + 2);
  }

  /** buf: Float32Array length >= win + tauMax (oldest first). returns {f, conf} */
  detect(buf) {
    const { win, tauMax, tauMin, d } = this;
    for (let tau = 1; tau <= tauMax; tau++) {
      let s = 0;
      for (let i = 0; i < win; i++) {
        const x = buf[i] - buf[i + tau];
        s += x * x;
      }
      d[tau] = s;
    }
    let run = 0;
    d[0] = 1;
    for (let tau = 1; tau <= tauMax; tau++) {
      run += d[tau];
      d[tau] = run > 0 ? (d[tau] * tau) / run : 1;
    }
    let tau = -1;
    for (let t = tauMin; t < tauMax; t++) {
      if (d[t] < this.thresh) {
        while (t + 1 < tauMax && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      let best = tauMin;
      for (let t = tauMin; t < tauMax; t++) if (d[t] < d[best]) best = t;
      return { f: 0, conf: 1 - d[best], tau: best };
    }
    const a = d[tau - 1];
    const b = d[tau];
    const c = d[tau + 1];
    const den = a - 2 * b + c;
    const shift = den !== 0 ? (0.5 * (a - c)) / den : 0;
    const t = tau + (Math.abs(shift) < 1 ? shift : 0);
    return { f: this.sr / t, conf: 1 - b, tau: t };
  }
}

/** Ring buffer feeding YIN from AnalyserNode time domain. */
export class PitchTracker {
  constructor(ctx, { fmin = 70, fmax = 900 } = {}) {
    this.ctx = ctx;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;
    this.yin = new Yin(ctx.sampleRate, { fmin, fmax, win: 1024, thresh: 0.12 });
    const need = this.yin.win + this.yin.tauMax + 4;
    this.buf = new Float32Array(need);
    this.tmp = new Float32Array(this.analyser.fftSize);
    this.last = { f: 0, conf: 0, midi: null };
  }

  connect(source) {
    source.connect(this.analyser);
  }

  disconnect() {
    try {
      this.analyser.disconnect();
    } catch (_) {}
  }

  poll() {
    this.analyser.getFloatTimeDomainData(this.tmp);
    const n = this.buf.length;
    const t = this.tmp;
    // append newest samples into ring by shifting
    const take = Math.min(t.length, n);
    this.buf.copyWithin(0, take);
    this.buf.set(t.subarray(t.length - take), n - take);

    // RMS gate — skip silence
    let sum = 0;
    for (let i = 0; i < t.length; i++) sum += t[i] * t[i];
    const rms = Math.sqrt(sum / t.length);
    if (rms < 0.01) {
      this.last = { f: 0, conf: 0, midi: null, rms };
      return this.last;
    }

    const r = this.yin.detect(this.buf);
    const midi = r.f > 0 && r.conf > 0.6 ? 69 + 12 * Math.log2(r.f / 440) : null;
    this.last = { f: r.f, conf: r.conf, midi, rms };
    return this.last;
  }
}
