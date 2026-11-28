// Runs while the host tab is in the background so guests can tell "away" from "gone".
let timer = 0, dest = '';
function tick() {
  if (!dest) return;
  fetch(dest, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ away: 1, hb: Date.now() }) }).catch(() => {});
}
onmessage = (e) => {
  if (e.data && e.data.stop) { clearInterval(timer); timer = 0; dest = ''; return; }
  dest = e.data && e.data.url;
  if (!dest) return;
  tick();
  clearInterval(timer);
  timer = setInterval(tick, 3000);
};
