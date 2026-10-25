// Shared viewer chrome for demo.html / combat.html / team.html (UI checklist: breadcrumb, labeled ⬅️ Back top-left,
// one yellow ✅ Done bottom-right, labeled buttons, 48 px tap targets). No imports, no saves.
const HQ = (() => { try { return window.parent !== window && window.parent.__armyMenu ? window.parent.__armyMenu : null; } catch (e) { return null; } })();
const CSS = `
#backBtn{flex-direction:column;gap:0;min-width:52px;height:52px;padding:0 6px;font-size:18px;line-height:1}
#backBtn small{font-size:11px;font-weight:800}
#who{left:66px!important;height:auto!important;min-height:52px;flex-wrap:wrap;row-gap:0;align-content:center;max-width:calc(100% - 136px)!important}
#who .crumbs{flex:1 0 100%;display:flex;gap:4px;align-items:center;font-size:11px;white-space:nowrap;overflow:hidden;min-width:0}
#who .crumbs a{color:#7cc4ff;text-decoration:none}
#who .crumbs span{opacity:.6}
#cambar button,#playbar button{width:52px!important;height:50px!important;display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:1px;font-size:17px!important}
#cambar button svg{width:20px!important;height:20px!important}
#cambar button i,#playbar button i{font-style:normal;font-size:11px!important;font-weight:700;opacity:.9;display:block;line-height:1.1}
#doneBtn{position:absolute;right:8px;bottom:8px;z-index:3;min-height:52px;padding:0 16px;border-radius:14px;border:0;background:#ffd23f;color:#241a00;font-size:17px;font-weight:900;box-shadow:0 3px 0 #b38b00;text-decoration:none;display:flex;align-items:center}
#doneBtn:active{transform:translateY(2px);box-shadow:0 1px 0 #b38b00}
@media (max-width:520px){#playbar{left:8px!important;transform:none!important}#doneBtn{padding:0 12px;font-size:16px}}
`;
export function backHref() { const from = new URLSearchParams(location.search).get('from'); return from ? './?from=' + encodeURIComponent(from) : './'; }
export function goHQ(e) { if (HQ) { if (e) e.preventDefault(); HQ.goHome(); } }
// name: e.g. '🥊 Combat'. Builds crumbs inside #who, labels #backBtn, adds the ✅ Done button.
export function pageChrome(name) {
  if (!document.getElementById('pageChromeCss')) { const s = document.createElement('style'); s.id = 'pageChromeCss'; s.textContent = CSS; document.head.append(s); }
  const back = document.getElementById('backBtn'), href = backHref();
  if (back) { back.href = href; back.innerHTML = '⬅️<small>Back</small>'; back.title = 'Back to the customizer'; }
  const who = document.getElementById('who');
  if (who && !who.querySelector('.crumbs')) {
    const nav = document.createElement('nav'); nav.className = 'crumbs'; nav.setAttribute('aria-label', 'You are here');
    const hq = document.createElement('a'); hq.href = '../army/'; hq.textContent = '🏠 Army HQ'; hq.addEventListener('click', goHQ);
    const cu = document.createElement('a'); cu.href = href; cu.textContent = '🪖 Customizer';
    const here = document.createElement('b'); here.textContent = name;
    const sep = () => { const s = document.createElement('span'); s.textContent = '›'; return s; };
    nav.append(hq, sep(), cu, sep(), here); who.prepend(nav);
  }
  if (!document.getElementById('doneBtn')) {
    const d = document.createElement('a'); d.id = 'doneBtn'; d.href = href; d.textContent = '✅ Done'; d.title = 'Done: back to the customizer';
    (document.getElementById('view') || document.body).append(d);
  }
  for (const b of document.querySelectorAll('#cambar button')) if (!b.querySelector('i')) { const i = document.createElement('i'); i.textContent = (b.title || '').replace(/^\W+\s*/u, ''); b.append(i); }
}
// sets an icon + word label on a play-bar button
export function setBtn(b, icon, label) { if (!b) return; b.innerHTML = ''; const s = document.createElement('span'); s.textContent = icon; const i = document.createElement('i'); i.textContent = label; b.append(s, i); }
