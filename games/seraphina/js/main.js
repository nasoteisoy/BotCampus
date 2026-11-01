import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { loadSave } from './save.js';
import { boot } from './game.js';

const canvas = document.getElementById('game');
const app = document.getElementById('app');
const input = createInput(document.getElementById('touch'));
const audio = createAudio();
const save = loadSave();
audio.setSound(save.settings.sound);
audio.setMusic(false);

boot({ canvas, input, audio, assetBase: './assets/' }).then(() => {
  document.getElementById('btnPause').addEventListener('click', (e) => {
    e.stopPropagation();
    audio.unlock();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' })), 40);
  });
  document.getElementById('btnFs').addEventListener('click', async (e) => {
    e.stopPropagation();
    audio.unlock();
    try {
      if (!document.fullscreenElement) await app.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) {}
  });
  paintChromeIcons();
  paintTouchIcons();
});

function paintTouchIcons() {
  const fire = document.querySelector('[data-act=fire]');
  if (fire) {
    fire.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#fff' stroke-width='2.5' stroke-linecap='round'><circle cx='12' cy='12' r='3'/><path d='M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2'/></svg>`
    )}")`;
    fire.style.backgroundSize = '46%';
    fire.style.backgroundRepeat = 'no-repeat';
    fire.style.backgroundPosition = 'center';
  }
}

function paintChromeIcons() {
  const mk = (id, svg) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    el.style.backgroundSize = '55%';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundPosition = 'center';
  };
  mk('btnPause', `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='#fff'><rect x='5' y='4' width='5' height='16'/><rect x='14' y='4' width='5' height='16'/></svg>`);
  mk('btnFs', `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#fff' stroke-width='2.5'><path d='M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'/></svg>`);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
