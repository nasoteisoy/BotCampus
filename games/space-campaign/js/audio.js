// Space Carrier audio. Built on parts-library space-sfx (createSpaceAudio): same unlock-after-gesture + mute model
// and its pew / boom cues, plus a thruster hum and the Carrier Fighter game cues. No sound files.
export function createAudio() {
  let ctx = null, master = null, muted = false, unlocked = false;
  let eng = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.35;
      master.connect(ctx.destination);
    }
    return ctx;
  }
  async function unlock() {
    const c = ensure();
    if (!c) return;
    try { if (c.state === 'suspended') await c.resume(); unlocked = true; } catch (_) {}
    if (!eng) startEngine();
  }
  function beep(freq, dur, type, vol, slide, delay = 0) {
    if (!unlocked || !ctx) return;
    try {
      const t0 = ctx.currentTime + delay;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (_) {}
  }
  function noise(dur, vol, freq = 1800) {
    if (!unlocked || !ctx) return;
    try {
      const n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(master); s.start();
    } catch (_) {}
  }
  function startEngine() { // soft two-tone thruster hum
    if (!ctx) return;
    try {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o2.type = 'triangle'; o.frequency.value = 70; o2.frequency.value = 140;
      f.type = 'lowpass'; f.frequency.value = 380; g.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(master); o.start(); o2.start();
      eng = { o, o2, f, g };
    } catch (_) {}
  }
  return {
    get muted() { return muted; },
    setMuted(v) { muted = !!v; if (master) master.gain.value = muted ? 0 : 0.35; },
    unlock,
    engine(thr01, on) {
      if (!eng || !ctx) return;
      const t = ctx.currentTime;
      eng.o.frequency.setTargetAtTime(60 + thr01 * 60, t, 0.15);
      eng.o2.frequency.setTargetAtTime(120 + thr01 * 120, t, 0.15);
      eng.f.frequency.setTargetAtTime(300 + thr01 * 500, t, 0.2);
      eng.g.gain.setTargetAtTime(on ? 0.04 + thr01 * 0.07 : 0, t, 0.2);
    },
    gun() { beep(880, 0.08, 'square', 0.07, 220); },                                  // space-sfx pew (softer)
    pop() { beep(90, 0.35, 'sawtooth', 0.28, 35); noise(0.28, 0.3); beep(620, 0.2, 'triangle', 0.12, 1240); }, // space-sfx boom + sparkle
    go() { beep(330, 0.12, 'triangle', 0.18); beep(495, 0.16, 'triangle', 0.18, 0, 0.12); noise(0.5, 0.12, 700); },
    ring() { beep(880, 0.12, 'sine', 0.14, 1320); },
    thud() { beep(110, 0.3, 'sawtooth', 0.22, 45); noise(0.25, 0.25, 900); beep(660, 0.15, 'sine', 0.1, 990, 0.1); },
    win() { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 'triangle', 0.2, 0, i * 0.13)); },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); },
    resume() { if (unlocked && ctx) ctx.resume().catch(() => {}); },
  };
}
