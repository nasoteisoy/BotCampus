// Coin Grab two-finger test: phone viewport, CDP Input.dispatchTouchEvent with TWO simultaneous touch points on two
// different players' joysticks, both fingers moving; checks both characters moved at once. Usage: node multitouch.js <url> <prefix> [n]
const puppeteer = require('puppeteer-core');
(async () => {
  const [url, prefix, nArg, fArg] = process.argv.slice(2); const N = Number(nArg || 2); const F = Math.min(N, Number(fArg || 2));
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await p.goto(url, { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => window.__game && window.__game.frames > 5, { timeout: 90000 });
  await (await p.$(`#counts .pc[data-n="${N}"]`)).tap();
  await p.waitForFunction(() => window.__game.state === 'play', { timeout: 20000 });
  const cdp = await p.target().createCDPSession();
  // log pointer events per joystick so we can prove the two fingers had different pointerIds
  await p.evaluate(() => { window.__ptr = []; document.querySelectorAll('.joy').forEach((j, i) => ['pointerdown', 'pointermove', 'pointerup'].forEach((t) => j.addEventListener(t, (e) => window.__ptr.push([i, t, e.pointerId])))); });
  const joys = await p.$$('.joy'); const R = []; for (const j of joys.slice(0, F)) R.push(await j.boundingBox());
  const C = R.map((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 }));
  const p0 = await p.evaluate(() => window.__game.players);
  const tp = (k, dx, dy) => C.map((c, i) => ({ x: c.x + dx[i] * k, y: c.y + dy[i] * k, id: i + 1, radiusX: 8, radiusY: 8, force: 1 }));
  const DX = [1, -1, 1, -1], DY = [-1, -1, 1, 1];   // finger 1 pushes up-right, finger 2 pushes up-left
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(0, DX, DY) });
  const track = []; let knobs = null;
  for (let i = 1; i <= 30; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(Math.min(40, 4 * i), DX, DY) });
    await new Promise((r) => setTimeout(r, 60));
    if (i % 5 === 0) track.push(await p.evaluate(() => window.__game.players.map((q) => [q.pos[0], q.pos[2], q.walk])));
    if (i === 20) { knobs = await p.evaluate(() => [...document.querySelectorAll('.joy i')].map((k) => k.style.transform || 'none')); await p.screenshot({ path: `${prefix}_twofinger.png` }); }
  }
  const mid = await p.evaluate(() => window.__game.players);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 500));
  const after = await p.evaluate(() => window.__game.players);
  const d = (a, b_) => +Math.hypot(a.pos[0] - b_.pos[0], a.pos[2] - b_.pos[2]).toFixed(2);
  const FI = [...Array(F).keys()]; const moved = FI.map((i) => d(mid[i], p0[i])); const drift = FI.map((i) => d(after[i], mid[i]));
  const ptr = await p.evaluate(() => window.__ptr); const ids = FI.map((i) => [...new Set(ptr.filter((e) => e[0] === i).map((e) => e[2]))]);
  const ok = moved.every((m) => m > 1) && ids.every((x) => x.length === 1) && new Set(ids.map((x) => x[0])).size === F;
  console.log(JSON.stringify({ ok, moved, drift_after_release: drift, pointerIds_per_joystick: ids, fingers: F, moves_per_joystick: FI.map((i) => ptr.filter((e) => e[0] === i && e[1] === 'pointermove').length), knobs_during_touch: knobs, track, others_still: [...Array(N).keys()].slice(F).map((i) => d(mid[i], p0[i])), errs }));
  await b.close(); process.exit(ok ? 0 : 2);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
