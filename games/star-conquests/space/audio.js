// Self-contained WebAudio SFX (no asset files). Unlock only after a user gesture.
export function createSpaceAudio() {
  let ctx = null;
  let muted = false;
  let unlocked = false;
  let master = null;

  function ensure() {
    if (muted) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  async function unlock() {
    const c = ensure();
    if (!c) return;
    try {
      if (c.state === 'suspended') await c.resume();
      unlocked = true;
    } catch (_) {}
  }

  function beep(freq, dur, type, vol, slide) {
    if (muted || !unlocked) return;
    const c = ensure();
    if (!c || !master) return;
    try {
      const t0 = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (_) {}
  }

  function noiseBurst(dur, vol) {
    if (muted || !unlocked) return;
    const c = ensure();
    if (!c || !master) return;
    try {
      const n = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, n, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1800;
      g.gain.value = vol || 0.25;
      src.connect(f); f.connect(g); g.connect(master);
      src.start();
    } catch (_) {}
  }

  return {
    get muted() { return muted; },
    get unlocked() { return unlocked; },
    setMuted(v) { muted = !!v; },
    unlock,
    pew() { beep(880, 0.08, 'square', 0.12, 220); },
    hit() { beep(180, 0.1, 'sawtooth', 0.18, 60); noiseBurst(0.06, 0.12); },
    boom() { beep(90, 0.35, 'sawtooth', 0.28, 35); noiseBurst(0.28, 0.3); },
    alarm() { beep(660, 0.12, 'square', 0.15, 440); setTimeout(() => beep(660, 0.12, 'square', 0.15, 440), 140); },
    suspend() {
      if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    },
    resume() {
      if (muted || !unlocked || !ctx) return;
      ctx.resume().catch(() => {});
    },
    dispose() {
      try { if (ctx) ctx.close(); } catch (_) {}
      ctx = null; master = null; unlocked = false;
    },
  };
}
