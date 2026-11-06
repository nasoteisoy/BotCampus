/**
 * Soft multi-partial synth + dual-track sequencer.
 * Voice shape inspired by sine-clip playground polyphony (sine+partials, ADSR).
 */
import { midiToFreq } from './theory.js';

const MAX_VOICES = 16;

function softPartials(ctx, freq, dest, when, dur, gainLevel) {
  // Fundamental + soft 2nd/3rd for a gentle piano-ish tone (no samples).
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(dest);

  const specs = [
    { type: 'sine', mul: 1, g: 0.72 },
    { type: 'sine', mul: 2, g: 0.18 },
    { type: 'triangle', mul: 3, g: 0.08 },
  ];
  const oscs = [];
  for (const s of specs) {
    const o = ctx.createOscillator();
    o.type = s.type;
    o.frequency.setValueAtTime(freq * s.mul, when);
    const g = ctx.createGain();
    g.gain.value = s.g;
    o.connect(g);
    g.connect(master);
    o.start(when);
    o.stop(when + dur + 0.15);
    oscs.push(o);
  }

  const attack = 0.012;
  const release = Math.min(0.18, dur * 0.35);
  const peak = gainLevel;
  master.gain.setValueAtTime(0, when);
  master.gain.linearRampToValueAtTime(peak, when + attack);
  master.gain.setValueAtTime(peak, Math.max(when + attack, when + dur - release));
  master.gain.linearRampToValueAtTime(0, when + dur + 0.02);

  return { master, oscs, end: when + dur + 0.15 };
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.melodyGain = null;
    this.harmonyGain = null;
    this.melodyOn = true;
    this.harmonyOn = true;
    this.tempo = 90;
    this._timer = null;
    this._playing = false;
    this._voices = [];
    this.onBeat = null;
    this.onDone = null;
  }

  async ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);
    this.melodyGain = this.ctx.createGain();
    this.harmonyGain = this.ctx.createGain();
    this.melodyGain.gain.value = 0.7;
    this.harmonyGain.gain.value = 0.55;
    this.melodyGain.connect(this.master);
    this.harmonyGain.connect(this.master);
    return this.ctx;
  }

  setMelodyVolume(v) {
    if (this.melodyGain) this.melodyGain.gain.value = v;
  }
  setHarmonyVolume(v) {
    if (this.harmonyGain) this.harmonyGain.gain.value = v;
  }
  setMelodyOn(on) {
    this.melodyOn = !!on;
  }
  setHarmonyOn(on) {
    this.harmonyOn = !!on;
  }

  stop() {
    this._playing = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this.ctx) {
      const now = this.ctx.currentTime;
      for (const v of this._voices) {
        try {
          v.master.gain.cancelScheduledValues(now);
          v.master.gain.setValueAtTime(0, now);
          for (const o of v.oscs) o.stop(now + 0.02);
        } catch (_) {}
      }
    }
    this._voices = [];
  }

  get playing() {
    return this._playing;
  }

  /**
   * Play melody + harmony note arrays: [{midi, beats}, ...] aligned by cumulative beats.
   * octaveShift applied to both. Returns a handle with stop().
   */
  async playTracks({ melody, harmony, tempo, octaveShift = 0 }) {
    await this.ensure();
    this.stop();
    this.tempo = tempo || 90;
    this._playing = true;

    const beat = 60 / this.tempo;
    const mel = expand(melody, octaveShift);
    const har = expand(harmony, octaveShift);
    const totalBeats = Math.max(lastEnd(mel), lastEnd(har));

    const startAt = this.ctx.currentTime + 0.08;
    const schedule = (notes, dest, enabled) => {
      if (!enabled) return;
      for (const n of notes) {
        if (n.midi == null || n.midi < 0) continue;
        const when = startAt + n.t * beat;
        const dur = Math.max(0.08, n.beats * beat * 0.92);
        const v = softPartials(this.ctx, midiToFreq(n.midi), dest, when, dur, 0.28);
        this._voices.push(v);
      }
    };
    schedule(mel, this.melodyGain, this.melodyOn);
    schedule(har, this.harmonyGain, this.harmonyOn);

    // Beat clock for UI / scoring
    let beatIdx = 0;
    const tick = () => {
      if (!this._playing) return;
      const elapsed = this.ctx.currentTime - startAt;
      const b = elapsed / beat;
      if (this.onBeat) this.onBeat(b, totalBeats);
      if (b >= totalBeats) {
        this._playing = false;
        if (this.onDone) this.onDone();
        return;
      }
      beatIdx++;
      this._timer = setTimeout(tick, 30);
    };
    tick();

    return {
      startAt,
      beatSec: beat,
      totalBeats,
      melody: mel,
      harmony: har,
    };
  }

  /** Hold a single drone + optional target for warm-up listens. */
  async playHold(melodyMidi, harmonyMidi, seconds, octaveShift = 0) {
    const beats = Math.max(1, seconds * (this.tempo / 60));
    return this.playTracks({
      melody: [{ midi: melodyMidi, beats }],
      harmony: [{ midi: harmonyMidi, beats }],
      tempo: this.tempo,
      octaveShift,
    });
  }
}

function expand(notes, shift) {
  let t = 0;
  const out = [];
  for (const n of notes || []) {
    const beats = n.beats == null ? 1 : n.beats;
    const midi = n.midi == null || n.midi < 0 ? null : n.midi + shift;
    out.push({ midi, beats, t });
    t += beats;
  }
  return out;
}

function lastEnd(notes) {
  if (!notes.length) return 0;
  const n = notes[notes.length - 1];
  return n.t + n.beats;
}

/** Active harmony MIDI at beat position b (floating). */
export function harmonyAtBeat(expandedHarmony, b) {
  for (const n of expandedHarmony) {
    if (b >= n.t && b < n.t + n.beats) return n.midi;
  }
  return null;
}

export function melodyAtBeat(expandedMelody, b) {
  for (const n of expandedMelody) {
    if (b >= n.t && b < n.t + n.beats) return n.midi;
  }
  return null;
}
