// Carrier Fighter audio. Adapted from parts-library space-sfx (createSpaceAudio):
// same unlock-after-gesture + mute model, plus a propeller engine drone and game cues. No sound files.
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
  function startEngine() {
    if (!ctx) return;
    try {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = 60; o2.frequency.value = 30;
      f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(master); o.start(); o2.start();
      eng = { o, o2, f, g };
    } catch (_) {}
  }
  return {
    get muted() { return muted; },
    setMuted(v) { muted = !!v; if (master) master.gain.value = muted ? 0 : 0.35; },
    unlock,
    engine(rpm01, on) { // rpm01 0..1
      if (!eng || !ctx) return;
      const t = ctx.currentTime;
      eng.o.frequency.setTargetAtTime(55 + rpm01 * 70, t, 0.12);
      eng.o2.frequency.setTargetAtTime(27 + rpm01 * 35, t, 0.12);
      eng.g.gain.setTargetAtTime(on ? 0.05 + rpm01 * 0.08 : 0, t, 0.2);
    },
    gun() { beep(240, 0.05, 'square', 0.08, 120); noise(0.04, 0.08, 2600); },
    pop() { noise(0.18, 0.35, 3000); beep(520, 0.25, 'triangle', 0.18, 1200); },
    go() { beep(330, 0.12, 'triangle', 0.18); beep(495, 0.16, 'triangle', 0.18, 0, 0.12); },
    ring() { beep(880, 0.12, 'sine', 0.14, 1320); },
    thud() { beep(90, 0.3, 'sawtooth', 0.25, 40); noise(0.25, 0.3, 900); },
    win() { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 'triangle', 0.2, 0, i * 0.13)); },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); },
    resume() { if (unlocked && ctx) ctx.resume().catch(() => {}); },
  };
}
