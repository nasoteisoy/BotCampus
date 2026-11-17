// Renders out/pixel_alive.mp4 (1080x1920, 30fps, audio) + GIF preview. Frames come from film.js in Node; the audio is the same
// WebAudio synth rendered with OfflineAudioContext in headless Chrome. ffmpeg scales x8 with nearest-neighbour and muxes.
const path = require('path'), fs = require('fs'), { spawnSync } = require('child_process');
const puppeteer = require('puppeteer-core');
require('./web/film.js'); const PA = globalThis.PixelAlive;
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); await p.goto('file://' + path.join(__dirname, 'web/index.html'));
  const b64 = await p.evaluate(async () => { const u = await window.PixelAlive.renderWav(); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); });
  fs.writeFileSync(path.join(OUT, 'audio.wav'), Buffer.from(b64, 'base64')); await b.close();
  const FPS = 30, N = Math.round(PA.TOTAL * FPS), raw = Buffer.alloc(PA.W * PA.H * 4 * N);
  for (let f = 0; f < N; f++) Buffer.from(PA.render(f / FPS).d.buffer).copy(raw, f * PA.W * PA.H * 4);
  fs.writeFileSync(path.join(OUT, 'frames.rgba'), raw);
  const run = (args) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' }); if (r.status) throw new Error('ffmpeg ' + args.join(' ')); };
  const IN = ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${PA.W}x${PA.H}`, '-r', String(FPS), '-i', path.join(OUT, 'frames.rgba')];
  run([...IN, '-i', path.join(OUT, 'audio.wav'), '-vf', 'scale=1080:1920:flags=neighbor', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', path.join(OUT, 'pixel_alive.mp4')]);
  // GIF preview: 12 s highlight (steps 04 -> 16 + 'now it's alive'), 270x480, 15fps
  run([...IN, '-ss', '10.5', '-t', '15', '-vf', 'fps=15,scale=270:480:flags=neighbor,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=none', path.join(OUT, 'pixel_alive_preview.gif')]);
  fs.unlinkSync(path.join(OUT, 'frames.rgba'));
  console.log('done', N, 'frames');
})().catch((e) => { console.error(e); process.exit(1); });
