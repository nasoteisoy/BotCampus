// All sound is procedural WebAudio (no audio files). Copied from flap-flyer-v2 + 3D game sounds (step, stomp, roar, swim, bubble).
const PENTA = [0, 2, 4, 7, 9];
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Sound {
  constructor(key = 'mp3d_muted') {
    this.ctx = null; this.key = key;
    try { this.muted = localStorage.getItem(key) === '1'; } catch (e) { this.muted = false; }
    this.chord = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.9; this.master.connect(ctx.destination);
    // soft echo bus
    this.echo = ctx.createDelay(1.5); this.echo.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    this.echo.connect(lp); lp.connect(fb); fb.connect(this.echo); lp.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.55; this.music.connect(this.master); this.music.connect(this.echo);
    // wind: looping noise through a bandpass
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = last * 6; }
    this.noiseBuf = buf;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 400; this.windF.Q.value = 0.8;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    src.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master); src.start();
    this.nextNote = ctx.currentTime + 0.5; this.nextPad = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this._schedule(), 250);
  }
  setMuted(m) {
    this.muted = m; try { localStorage.setItem(this.key, m ? '1' : '0'); } catch (e) { /* private mode */ }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1);
  }
  wind(speed, vy) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = Math.min(1, Math.max(0, (speed - 6) / 16 + Math.abs(vy) * 0.03));
    this.windG.gain.setTargetAtTime(0.025 + s * 0.11, t, 0.3);
    this.windF.frequency.setTargetAtTime(260 + s * 700, t, 0.3);
  }
  _tone(f, t, dur, gain, type = 'sine', dest = this.music, attack = 0.02) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  _schedule() {
    const ctx = this.ctx; if (!ctx || ctx.state !== 'running') return;
    const ahead = ctx.currentTime + 0.6;
    const roots = [60, 57, 53, 55]; // C, Am, F, G
    while (this.nextPad < ahead) {
      const r = roots[this.chord++ % 4];
      for (const iv of [0, 4 + (r === 57 ? -1 : 0), 7]) this._tone(midi(r - 12 + iv), this.nextPad, 7.5, 0.035, 'sine', this.music, 2.2);
      this.nextPad += 8;
    }
    while (this.nextNote < ahead) {
      if (Math.random() < 0.75) {
        const m = 72 + PENTA[Math.floor(Math.random() * 5)] + (Math.random() < 0.3 ? 12 : 0) - (Math.random() < 0.2 ? 12 : 0);
        this._tone(midi(m), this.nextNote, 2.4, 0.045, 'triangle', this.music, 0.03);
      }
      this.nextNote += [0.6, 0.9, 1.2, 1.8][Math.floor(Math.random() * 4)];
    }
  }
  _noise(t, dur, gain, freq, q = 1, type = 'bandpass') {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    return f;
  }
  flap() { if (!this.ctx) return; const t = this.ctx.currentTime; const f = this._noise(t, 0.28, 0.16, 700, 0.9); f.frequency.exponentialRampToValueAtTime(260, t + 0.25); }
  thump() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._noise(t, 0.4, 0.22, 300, 0.6, 'lowpass');
    this._tone(85, t, 0.35, 0.18, 'sine', this.master, 0.01);
  }
  chime(n) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const base = 76 + PENTA[n % 5] + (n >= 8 ? 12 : 0);
    [0, 4, 7, 12].forEach((iv, i) => {
      this._tone(midi(base + iv), t + i * 0.07, 1.6, 0.09, 'sine', this.music, 0.005);
      this._tone(midi(base + iv) * 2.01, t + i * 0.07, 0.6, 0.02, 'sine', this.music, 0.005);
    });
  }
  win() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    [72, 76, 79, 84, 79, 84, 88].forEach((m, i) => this._tone(midi(m), t + i * 0.16, 2.2, 0.08, 'triangle', this.music, 0.01));
  }
  /** ambient bed: level 0..1 (walking speed / swim speed); low = under water */
  ambient(level, low = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = Math.min(1, Math.max(0, level));
    this.windG.gain.setTargetAtTime((low ? 0.05 : 0.02) + s * (low ? 0.07 : 0.05), t, 0.3);
    this.windF.frequency.setTargetAtTime((low ? 160 : 300) + s * (low ? 260 : 400), t, 0.3);
  }
  step(k = 0) { if (!this.ctx) return; const t = this.ctx.currentTime; this._noise(t, 0.12, 0.08, 180 + (k % 2) * 40, 0.8, 'lowpass'); this._tone(70 + (k % 2) * 8, t, 0.12, 0.08, 'sine', this.master, 0.005); }
  jump() { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.18); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.3); }
  stomp() { if (!this.ctx) return; const t = this.ctx.currentTime; this._noise(t, 0.5, 0.3, 220, 0.6, 'lowpass'); this._tone(55, t, 0.45, 0.26, 'sine', this.master, 0.005); }
  roar() {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime;
    // a cute baby-dino roar: a rising then falling saw growl through a lowpass + a noise breath
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 4;
    o.frequency.setValueAtTime(170, t); o.frequency.linearRampToValueAtTime(260, t + 0.25); o.frequency.linearRampToValueAtTime(120, t + 0.9);
    o2.frequency.setValueAtTime(85, t); o2.frequency.linearRampToValueAtTime(130, t + 0.25); o2.frequency.linearRampToValueAtTime(60, t + 0.9);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 28; lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.08); g.gain.setValueAtTime(0.16, t + 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master); for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + 1.05); }
    this._noise(t, 0.9, 0.12, 700, 0.7);
  }
  swim() { if (!this.ctx) return; const t = this.ctx.currentTime; const f = this._noise(t, 0.45, 0.14, 500, 0.8, 'lowpass'); f.frequency.exponentialRampToValueAtTime(160, t + 0.4); }
  bubble(n = 1) {
    if (!this.ctx) return; const ctx = this.ctx, t0 = ctx.currentTime;
    for (let i = 0; i < n; i++) { const t = t0 + i * 0.07, o = ctx.createOscillator(), g = ctx.createGain(), f0 = 500 + Math.random() * 500; o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + 0.08); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.12); }
  }
  hatch() { if (!this.ctx) return; const t = this.ctx.currentTime; [0, 0.09, 0.18].forEach((d, i) => this._noise(t + d, 0.06, 0.12, 2500 + i * 400, 2)); [84, 88, 91].forEach((m, i) => this._tone(midi(m), t + 0.3 + i * 0.1, 0.5, 0.07, 'triangle', this.music, 0.005)); }
}
