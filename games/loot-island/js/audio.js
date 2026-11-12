// WebAudio unlock-after-gesture, same pattern as parts-library/space-sfx.
// Chime pitch comes from the one rarity lookup table.

export function createAudio() {
  let ctx = null;
  let master = null;
  let unlocked = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.4;
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

  function tone(freq, dur, type, vol, slide, t0) {
    if (!unlocked) return;
    const c = ensure();
    if (!c || !master) return;
    try {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch (_) {}
  }

  function chime(pitch, notes) {
    const c = ensure();
    if (!unlocked || !c) return;
    const t0 = c.currentTime;
    const base = 392 * pitch; // G4 scaled
    const seq = notes || 3;
    for (let i = 0; i < seq; i++) {
      const f = base * Math.pow(1.25, i);
      tone(f, 0.22 + i * 0.04, 'sine', 0.18 - i * 0.02, f * 1.5, t0 + i * 0.09);
      tone(f * 2, 0.16, 'triangle', 0.07, null, t0 + i * 0.09 + 0.02);
    }
  }

  return { unlock, chime, get unlocked() { return unlocked; } };
}
