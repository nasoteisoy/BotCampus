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
  paintTouchIcons();
  paintChromeIcons();
});

function paintTouchIcons() {
  const mk = (sel, color, path) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${color}' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'>${path}</svg>`
    )}")`;
    el.style.backgroundSize = '42%';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundPosition = 'center';
  };
  mk('[data-act=left]', '#ffffff', "<path d='M15 6l-6 6 6 6'/>");
  mk('[data-act=right]', '#ffffff', "<path d='M9 6l6 6-6 6'/>");
  mk('[data-act=jump]', '#ffffff', "<path d='M6 14l6-8 6 8H6z' fill='#ffffff' stroke='none'/>");
  mk('[data-act=action]', '#ffffff', "<circle cx='12' cy='12' r='5' fill='#ffffff' stroke='none'/>");
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
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
