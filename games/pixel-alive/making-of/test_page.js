// loads the page at desktop + phone size, taps play, flips a few layer toggles, checks console errors + frames advancing
const puppeteer = require('puppeteer-core');
(async () => {
  const url = process.argv[2], prefix = process.argv[3]; const res = {};
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  for (const [name, vp] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    const p = await b.newPage(); const errs = [];
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push(String(e)));
    p.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
    await p.setViewport(vp); await p.goto(url, { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => window.__film && window.__film.frames > 5, { timeout: 30000 });
    if (vp.hasTouch) await p.tap('#start'); else await p.click('#start');
    await new Promise((r) => setTimeout(r, 2500));
    const a = await p.evaluate(() => ({ t: window.__film.t, playing: window.__film.playing, started: window.__film.started }));
    await p.evaluate(() => { window.__film.abs = 21.5; });           // jump to step 16 to screenshot the full film frame
    await new Promise((r) => setTimeout(r, 400)); await p.screenshot({ path: `${prefix}_${name}_film.png` });
    const btns = await p.$$('#tog .t');
    for (const i of [4, 7, 8, 9]) { if (vp.hasTouch) await btns[i].tap(); else await btns[i].click(); }   // sky, ground, mid, mountains off
    await new Promise((r) => setTimeout(r, 700)); await p.screenshot({ path: `${prefix}_${name}_toggles.png` });
    const c = await p.evaluate(() => ({ mode: window.__film.mode, user: window.__film.user.map(Number).join(''), frames: window.__film.frames, off: document.querySelectorAll('.t.off').length, canvas: document.getElementById('cv').getBoundingClientRect().toJSON(), panelBottom: document.getElementById('tog').getBoundingClientRect().bottom, vh: innerHeight }));
    res[name] = { afterStart: a, afterToggles: c, errs };
    await p.close();
  }
  console.log(JSON.stringify(res, null, 1)); await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
