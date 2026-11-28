// Procedural sounds with WebAudio. No files. Unlocks on the first tap.
let ctx = null, master = null, enabled = true;
let hum = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = enabled ? 0.5 : 0; master.connect(ctx.destination);
}
export function setSound(on) { enabled = on; if (master) master.gain.value = on ? 0.5 : 0; }

function env(g, t, a, d, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(type, f0, f1, dur, peak = 0.3, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, 0.01, dur, peak); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
let noiseBuf = null;
function noise(dur, freq, q = 1, peak = 0.3, type = 'bandpass', delay = 0) {
  if (!ctx) return;
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q;
  env(g, t, 0.01, dur, peak); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
}

export const sfx = {
  click: () => tone('triangle', 660, 880, 0.06, 0.15),
  stun: () => { tone('square', 1200, 600, 0.12, 0.08); tone('sine', 1800, 2400, 0.1, 0.06, 0.03); },
  capture: () => { tone('sine', 300, 1400, 0.25, 0.25); tone('triangle', 1400, 1900, 0.15, 0.18, 0.2); noise(0.2, 2000, 2, 0.12); },
  coin: () => { tone('square', 988, 0, 0.07, 0.1); tone('square', 1319, 0, 0.18, 0.1, 0.07); },
  bump: () => noise(0.12, 300, 1, 0.25, 'lowpass'),
  crack: () => { noise(0.18, 3500, 3, 0.25); tone('triangle', 2400, 900, 0.1, 0.08); },
  smash: () => { noise(0.4, 2800, 1, 0.35); noise(0.3, 6000, 1, 0.2, 'highpass', 0.05); },
  hit: () => { tone('sawtooth', 220, 90, 0.25, 0.2); noise(0.15, 800, 1, 0.2); },
  boo: () => { tone('sine', 420, 260, 0.45, 0.12); tone('sine', 430, 250, 0.45, 0.08, 0.02); },
  down: () => { tone('triangle', 392, 0, 0.25, 0.2); tone('triangle', 330, 0, 0.25, 0.2, 0.25); tone('triangle', 262, 180, 0.5, 0.2, 0.5); },
  revive: () => { tone('triangle', 523, 0, 0.12, 0.18); tone('triangle', 659, 0, 0.12, 0.18, 0.1); tone('triangle', 784, 0, 0.25, 0.18, 0.2); },
  ding: () => { tone('sine', 1047, 0, 0.8, 0.25); tone('sine', 1568, 0, 0.8, 0.12, 0.02); },
  quota: () => { [523, 659, 784, 1047].forEach((f, i) => tone('square', f, 0, 0.14, 0.08, i * 0.08)); },
  buy: () => { tone('square', 784, 0, 0.06, 0.1); tone('square', 1175, 0, 0.2, 0.1, 0.06); },
  ability: () => { tone('sine', 400, 1600, 0.3, 0.2); noise(0.3, 1500, 4, 0.08); },
  strobe: () => { noise(0.25, 5000, 0.7, 0.3, 'highpass'); tone('square', 2000, 300, 0.2, 0.1); },
  tick: () => tone('square', 1500, 0, 0.04, 0.06),
  free: () => { [659, 784, 988].forEach((f, i) => tone('triangle', f, 0, 0.15, 0.15, i * 0.07)); },
  roar: () => { tone('sawtooth', 120, 60, 0.8, 0.25); noise(0.8, 400, 1, 0.2, 'lowpass'); },
  win: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, 0, 0.3, 0.18, i * 0.12)); },
  lose: () => { [392, 349, 311, 262].forEach((f, i) => tone('triangle', f, 0, 0.35, 0.18, i * 0.2)); },
  jump: () => tone('sine', 300, 600, 0.12, 0.08),
};

// continuous vacuum hum while sucking; pitch rises with pull strength
export function setHum(on, strength = 0) {
  if (!ctx) return;
  if (on && !hum) {
    if (!noiseBuf) noise(0.01, 100);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.value = 500;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 90;
    const og = ctx.createGain(); og.gain.value = 0.04;
    const g = ctx.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.15);
    s.connect(f); f.connect(g); o.connect(og); og.connect(g); g.connect(master); s.start(); o.start();
    hum = { s, f, o, g };
  }
  if (hum) {
    if (on) { hum.f.frequency.setTargetAtTime(500 + strength * 900, ctx.currentTime, 0.1); hum.o.frequency.setTargetAtTime(90 + strength * 70, ctx.currentTime, 0.1); }
    else { const h = hum; hum = null; h.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05); setTimeout(() => { try { h.s.stop(); h.o.stop(); } catch (e) { /* already stopped */ } }, 300); }
  }
}
