/** Procedural dice clacks with Web Audio. No sound files. */

function noiseBuffer(ctx, seconds) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function createDiceAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let unlocked = false;
  let noise = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(ctx.destination);
    noise = noiseBuffer(ctx, 0.4);
    return ctx;
  }

  async function unlock() {
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') {
      try { await c.resume(); } catch (_) { /* ignore */ }
    }
    unlocked = c.state === 'running';
  }

  function setMuted(v) {
    muted = !!v;
    if (master) master.gain.value = muted ? 0 : 0.85;
  }

  function impact(when, strength = 1, pitch = 1) {
    const c = ctx;
    if (!c || !master || muted) return;
    const t = when;
    const src = c.createBufferSource();
    src.buffer = noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + 1400 * pitch;
    bp.Q.value = 1.6;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 400;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55 * strength, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04 + 0.03 * strength);
    src.connect(bp);
    bp.connect(hp);
    hp.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + 0.12);

    const osc = c.createOscillator();
    const og = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(90 * pitch, t + 0.05);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.22 * strength, t + 0.003);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(og);
    og.connect(master);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  function roll(dieCount = 2) {
    const c = ensure();
    if (!c || muted) return;
    const now = c.currentTime;
    const n = 5 + dieCount * 2;
    for (let i = 0; i < n; i++) {
      const t = now + 0.05 + i * (0.045 + Math.random() * 0.04);
      const fall = 1 - i / (n + 2);
      impact(t, 0.45 + 0.55 * fall, 0.85 + Math.random() * 0.5);
    }
  }

  function settle() {
    const c = ensure();
    if (!c || muted) return;
    const t = c.currentTime;
    impact(t, 0.85, 0.7);
    const osc = c.createOscillator();
    const og = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.12);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.28, t + 0.006);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(og);
    og.connect(master);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  function deny() {
    const c = ensure();
    if (!c || muted) return;
    const t = c.currentTime;
    impact(t, 0.35, 1.4);
  }

  return {
    unlock,
    setMuted,
    roll,
    settle,
    deny,
    get muted() { return muted; },
    get unlocked() { return unlocked; },
  };
}
