// Section mode (deep link): index.html?section=nation|troopers|armor shows only that part of the Customizer.
// Used by Army HQ (games/army/) so its 🪖 Customize menu opens straight at one editor. &new=1 (nation only)
// makes a new player + nation first. No ?section= = the normal full Customizer (this file does nothing).
const q = new URLSearchParams(location.search), sec = q.get('section');
const MODES = { nation: { unit: null, tab: 'nation' }, troopers: { unit: 'trooper', tab: 'head' }, armor: { unit: 'tank', tab: 'hull' } };
const mode = MODES[sec];
if (mode) {
  const css = `
body.tcsec #unitbar,body.tcsec #backBtn,body.tcsec #demoBtn,body.tcsec #ccBtn,body.tcsec #shipBtn,body.tcsec #demomenu{display:none!important}
body.tcsec-nation #tabs,body.tcsec-nation #roster{display:none!important}
body.tcsec-troopers #tabs [data-tab=nation],body.tcsec-armor #tabs [data-tab=nation]{display:none!important}
body.tcsec-armor #roster{display:none!important}`;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
  document.body.classList.add('tcsec', 'tcsec-' + sec);
  const t0 = performance.now();
  const go = () => {
    const tc = window.__tc;
    if (!tc || !tc.ready) { if (performance.now() - t0 < 15000) setTimeout(go, 30); return; }
    if (mode.unit && tc.unit !== mode.unit) tc.setUnit(mode.unit);
    tc.tab(mode.tab);
    if (sec === 'nation' && q.get('new') === '1') {
      tc.nations.create(); tc.tab('nation');
      q.delete('new'); history.replaceState(history.state, '', location.pathname + '?' + q.toString() + location.hash); // refresh won't make another
    }
    document.body.dataset.secReady = '1';
  };
  go();
}
