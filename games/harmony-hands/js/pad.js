// Soft synth pad: 2 detuned saws per note -> low-pass -> slow attack/release.
import { midiToFreq } from './theory.js';
export class Pad {
  constructor(ctx, dest) {
    this.ctx = ctx; this.out = ctx.createGain(); this.out.gain.value = 0.07;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 1100; this.lp.Q.value = 0.4;
    this.lp.connect(this.out); this.out.connect(dest);
    this.on = false; this.notes = []; this.voices = [];
  }
  setOn(on) { this.on = on; if (on) this.play(this.notes); else this.release(); }
  setChord(notes) { this.notes = notes.slice(); if (this.on) this.play(notes); }
  release() {
    const t = this.ctx.currentTime;
    for (const v of this.voices) { v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0, t + 0.45); v.oscs.forEach((o) => o.stop(t + 0.5)); }
    this.voices = [];
  }
  play(notes) {
    this.release();
    const t = this.ctx.currentTime;
    for (const n of notes) {
      const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.lp);
      const oscs = [-7, 7].map((det) => { const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiToFreq(n); o.detune.value = det; o.connect(g); o.start(t); return o; });
      g.gain.linearRampToValueAtTime(n < 48 ? 0.5 : 0.32, t + 0.3);
      this.voices.push({ g, oscs });
    }
  }
}
