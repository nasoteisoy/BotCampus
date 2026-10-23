// Move & Play hub: offline cache for this page + an install button. No tracking, no accounts.
(() => {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch((e) => console.info('[sw] not registered', e && e.message));
  }
  const btn = document.getElementById('install');
  let prompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); prompt = e; btn.classList.remove('hidden'); });
  btn.addEventListener('click', async () => { if (!prompt) return; prompt.prompt(); try { await prompt.userChoice; } catch {} prompt = null; btn.classList.add('hidden'); });
  window.addEventListener('appinstalled', () => btn.classList.add('hidden'));
})();
