// Self-contained WebAudio SFX (no asset files). Starts only after a user gesture.
// Source part: parts-library space-sfx (code/audio.js), adapted: musket volley, cannon-like rout
// thump and a bugle call on village capture replace the space cues.
export function createBattleAudio() {
  let ctx = null;
  let muted = false;
  let audioReady = false;
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
      audioReady = true;
    } catch (_) {}
  }

  function beep(freq, dur, type, vol, slide) {
    if (muted || !audioReady) return;
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
    if (muted || !audioReady) return;
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
    get ready() { return audioReady; },
    setMuted(v) { muted = !!v; },
    unlock,
    volley() { noiseBurst(0.16, 0.16); beep(120, 0.08, 'triangle', 0.08, 60); },
    rout() { beep(90, 0.4, 'sawtooth', 0.2, 40); noiseBurst(0.3, 0.2); },
    bugle(high) {
      const base = high ? 523 : 392;
      beep(base, 0.14, 'triangle', 0.14);
      setTimeout(() => beep(base * 1.25, 0.14, 'triangle', 0.14), 160);
      setTimeout(() => beep(base * 1.5, 0.28, 'triangle', 0.14), 320);
    },
    tap() { beep(660, 0.05, 'triangle', 0.08); },
    suspend() {
      if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    },
    resume() {
      if (muted || !audioReady || !ctx) return;
      ctx.resume().catch(() => {});
    },
    dispose() {
      try { if (ctx) ctx.close(); } catch (_) {}
      ctx = null; master = null; audioReady = false;
    },
  };
}
