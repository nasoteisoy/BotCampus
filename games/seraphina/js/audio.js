/** Procedural WebAudio SFX + soft loop. Adapted from mini2d/js/audio.js (space-sfx pattern). */
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
    musicGain.gain.value = 0.12;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(master);
  }

  async function unlock() {
    ensure();
    if (ctx.state === 'suspended') await ctx.resume();
  }

  function beep(freq, dur, type = 'square', vol = 0.3, when = 0, slideTo) {
    if (!soundOn || !ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
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
    twang: () => { beep(520, 0.08, 'triangle', 0.22); beep(280, 0.12, 'sawtooth', 0.12, 0.02, 180); },
    hit: () => { beep(220, 0.06, 'square', 0.2); noise(0.04, 0.12); },
    pop: () => { beep(180, 0.05, 'square', 0.18); noise(0.08, 0.2); beep(420, 0.06, 'triangle', 0.15, 0.04); },
    hurt: () => { beep(160, 0.12, 'sawtooth', 0.28); beep(110, 0.18, 'sawtooth', 0.2, 0.08); },
    gameover: () => { beep(300, 0.15, 'triangle', 0.22); beep(220, 0.2, 'triangle', 0.2, 0.12); beep(140, 0.35, 'sawtooth', 0.22, 0.28); },
    blip: () => beep(640, 0.04, 'square', 0.12),
    start: () => { beep(400, 0.06); beep(600, 0.08, 'triangle', 0.18, 0.05); },
  };

  // Soft forest-ish pentatonic loop
  const melody = [196, 220, 247, 262, 294, 262, 247, 220, 196, 175, 196, 220, 247, 220, 196, 175];

  function tickMusic() {
    if (!musicOn || !ctx) return;
    const note = melody[step % melody.length];
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = note;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.42);
    step++;
  }

  function startMusic() {
    ensure();
    stopMusic();
    musicTimer = setInterval(tickMusic, 380);
  }
  function stopMusic() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
  }

  return {
    unlock, sfx,
    setSound(v) { soundOn = !!v; },
    setMusic(v) { musicOn = !!v; if (v) startMusic(); else stopMusic(); },
    startMusic, stopMusic,
    get soundOn() { return soundOn; },
    get musicOn() { return musicOn; },
  };
}
