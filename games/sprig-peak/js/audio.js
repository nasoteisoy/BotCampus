/** Procedural WebAudio SFX + tiny chiptune loop. Pattern adapted from space-sfx part. */
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let musicTimer = null;
  let musicOn = true;
  let soundOn = true;
  let step = 0;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.18;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(master);
  }

  async function unlock() {
    ensure();
    if (ctx.state === 'suspended') await ctx.resume();
  }

  function beep(freq, dur, type = 'square', vol = 0.3, when = 0) {
    if (!soundOn || !ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol = 0.2) {
    if (!soundOn || !ctx) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g); g.connect(sfxGain);
    src.start();
  }

  const sfx = {
    jump: () => { beep(420, 0.08); beep(560, 0.06, 'square', 0.2, 0.05); },
    land: () => noise(0.06, 0.15),
    coin: () => { beep(880, 0.05); beep(1175, 0.08, 'square', 0.25, 0.05); },
    gem: () => { beep(660, 0.05); beep(880, 0.05, 'square', 0.2, 0.05); beep(1320, 0.1, 'square', 0.2, 0.1); },
    hit: () => { beep(180, 0.1, 'sawtooth', 0.3); noise(0.08, 0.2); },
    death: () => { beep(200, 0.15, 'sawtooth', 0.3); beep(120, 0.25, 'sawtooth', 0.25, 0.1); },
    checkpoint: () => { beep(523, 0.08); beep(659, 0.08, 'square', 0.25, 0.08); beep(784, 0.12, 'square', 0.25, 0.16); },
    boss: () => { beep(90, 0.2, 'sawtooth', 0.35); noise(0.15, 0.25); },
    blip: () => beep(640, 0.04, 'square', 0.15),
    power: () => { beep(400, 0.06); beep(600, 0.06, 'square', 0.2, 0.05); beep(800, 0.1, 'square', 0.2, 0.1); },
    spring: () => { beep(300, 0.05); beep(500, 0.08, 'square', 0.22, 0.04); },
    stomp: () => { beep(150, 0.06, 'square', 0.25); noise(0.05, 0.15); },
    dash: () => noise(0.08, 0.18),
    break: () => noise(0.1, 0.22),
    switch: () => beep(500, 0.07, 'triangle', 0.2),
  };

  const melody = [262, 330, 392, 330, 349, 392, 440, 392, 262, 294, 330, 294, 311, 349, 392, 349];

  function tickMusic() {
    if (!musicOn || !ctx) return;
    const note = melody[step % melody.length];
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = note;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.15, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.3);
    // bass
    const b = ctx.createOscillator();
    const bg = ctx.createGain();
    b.type = 'square';
    b.frequency.value = note / 4;
    bg.gain.value = 0.05;
    b.connect(bg); bg.connect(musicGain);
    b.start(t); b.stop(t + 0.2);
    step++;
  }

  function startMusic() {
    ensure();
    stopMusic();
    musicTimer = setInterval(tickMusic, 320);
  }
  function stopMusic() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
  }

  return {
    unlock, sfx,
    setSound(v) { soundOn = v; },
    setMusic(v) { musicOn = v; if (v) startMusic(); else stopMusic(); },
    startMusic, stopMusic,
    get soundOn() { return soundOn; },
    get musicOn() { return musicOn; },
  };
}
