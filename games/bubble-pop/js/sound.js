// Procedural WebAudio sound (no audio files, no network). Mute is shared by all Move & Play games.
const KEY = 'move-play-muted';
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
export class Sound {
  constructor() { this.ctx = null; this.muted = this._load(); this.musicOn = false; this.step = 0; this.tempo = 120; }
  _load() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(ctx.destination);
    this.bus = ctx.createGain(); this.bus.gain.value = 0.35; this.bus.connect(this.master);
    this.next = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this._schedule(), 100);
  }
  setMuted(m) {
    this.muted = !!m; try { localStorage.setItem(KEY, m ? '1' : '0'); } catch {}
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }
  tone(f, dur = 0.15, gain = 0.3, type = 'sine', when = 0, slide = 0, dest) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  pop(i = 0) { this.tone(midi(72 + [0, 4, 7, 12, 16][i % 5]), 0.12, 0.35, 'triangle', 0, 1.6); this.tone(1800, 0.04, 0.12, 'square', 0, 0.3); }
  coin() { this.tone(midi(84), 0.08, 0.25, 'square'); this.tone(midi(91), 0.18, 0.22, 'square', 0.07); }
  bump() { this.tone(160, 0.25, 0.4, 'sawtooth', 0, 0.4); }
  jump() { this.tone(330, 0.2, 0.22, 'triangle', 0, 2.2); }
  whoosh() { this.tone(500, 0.18, 0.15, 'sine', 0, 0.4); }
  tick() { this.tone(midi(81), 0.06, 0.2, 'square'); }
  go() { this.tone(midi(88), 0.3, 0.3, 'square'); }
  good() { [76, 79, 84].forEach((m, i) => this.tone(midi(m), 0.16, 0.25, 'triangle', i * 0.07)); }
  oops() { this.tone(midi(62), 0.18, 0.25, 'triangle', 0); this.tone(midi(58), 0.25, 0.25, 'triangle', 0.15); }
  fanfare() { [72, 76, 79, 84, 79, 84].forEach((m, i) => this.tone(midi(m), i === 5 ? 0.6 : 0.16, 0.3, 'square', i * 0.12)); }
  /** background groove; dance=true makes it louder & bouncier (Freeze Dance) */
  music(on, dance = false) { this.musicOn = on; this.dance = dance; if (this.ctx && this.bus) this.bus.gain.setTargetAtTime(on ? (dance ? 0.6 : 0.28) : 0, this.ctx.currentTime, on ? 0.02 : 0.04); }
  _schedule() {
    const ctx = this.ctx; if (!ctx || !this.musicOn) { if (ctx) this.next = Math.max(this.next, ctx.currentTime + 0.05); return; }
    const spb = 60 / this.tempo / 2; // eighth notes
    const BASS = [48, 48, 55, 55, 53, 53, 50, 55], MEL = [72, 76, 79, 76, 77, 74, 79, 72, 76, 79, 84, 79, 77, 81, 79, 74];
    while (this.next < ctx.currentTime + 0.3) {
      const i = this.step++, w = this.next - ctx.currentTime;
      if (i % 2 === 0) this.tone(midi(BASS[(i >> 2) % 8]), spb * 1.6, 0.35, 'triangle', w, 0, this.bus);
      if (this.dance && i % 4 === 0) this.tone(120, 0.12, 0.6, 'sine', w, 0.35, this.bus); // kick
      if (this.dance && i % 4 === 2) this.tone(3000, 0.03, 0.08, 'square', w, 0.5, this.bus); // hat
      if (i % 2 === 1 || this.dance) this.tone(midi(MEL[i % 16]), spb * 0.9, 0.16, 'square', w, 0, this.bus);
      this.next += spb;
    }
  }
}
