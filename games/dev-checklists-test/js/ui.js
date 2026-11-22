import { icon, iconBtn, LEVEL_ICON, LEVEL_LABEL, STATUS_ICON, STATUS_LABEL } from './icons.js';
import {
  GRAPHICS_FOCUSES, TIER_GROUP_LABEL, TIER_GROUPS, COST_CUE,
  focusLabel, tierById, tiersInGroup,
} from './graphics.js';
import { KIND_ICON, KIND_LABEL, reuseList, loadCatalog } from './reuse.js';
import {
  activeProjects, archivedProjects, countTicks, historyList, mergeLog, isValidName, isValidItemText,
} from './data.js';
import { shouldPromptLevelChange } from './presets.js';
import { getEmu } from './auth.js';
import { isVerified, getUid, signInGoogle, doSignOut } from './auth.js';
import {
  getStoreState, canEdit, hintSeen, markHintSeen,
  saveTick, saveLevel, saveFocus, saveTier, saveTierAdd, saveTierRename, saveTierRemove,
  saveReuse, saveItemAdd, saveItemRename, saveItemRemove,
  saveProjectAdd, saveProjectRename, saveProjectStatus, saveStarterList,
} from './store.js';

const WHO = 'Chumi only';

const ui = {
  route: parseHash(),
  sheet: null,
  flashOn: false,
  hint: !hintSeen(),
  explain: '',
};

export function parseHash() {
  let hash = '#/';
  try {
    if (typeof location !== 'undefined' && location && location.hash) hash = location.hash;
  } catch (_) { /* no window (unit tests) */ }
  const h = hash.replace(/^#/, '');
  const p = h.split('/').filter(Boolean);
  if (p[0] === 'archive') return { view: 'archive' };
  if (p[0] === 'history' && !p[1]) return { view: 'history' };
  if (p[0] === 'p' && p[1]) {
    if (p[2] === 'history') return { view: 'history', slug: p[1] };
    if (p[2] === 'reuse') return { view: 'reuse', slug: p[1] };
    return { view: 'project', slug: p[1] };
  }
  return { view: 'list' };
}

export function go(hash) {
  if (location.hash !== hash) location.hash = hash;
  else {
    ui.route = parseHash();
    render();
  }
}

function showFlash() {
  const el = document.getElementById('saved-flash');
  if (!el) return;
  el.classList.add('show');
  clearTimeout(showFlash._t);
  showFlash._t = setTimeout(() => el.classList.remove('show'), 1400);
}

function banner(store) {
  if (store.offline && store.source === 'cache') {
    return `<div class="banner offline" data-id="banner-offline">${icon('cloudoff', { size: 22 })}<span>Offline list</span></div>`;
  }
  if (store.source === 'seed' || (store.source === 'cache' && !store.readable)) {
    return `<div class="banner" data-id="banner-local">${icon('cloudoff', { size: 22 })}<span>Local list</span></div>`;
  }
  return '';
}

/** Persistent signed-out cue. Empty when already signed in / verified. */
export function signinCueHtml(signedIn) {
  if (signedIn) return '';
  return `<button type="button" class="banner signin-cue" data-action="signin" data-id="signin-cue" aria-label="Sign in to edit">${icon('login', { size: 22 })}<span>Sign in to edit</span></button>`;
}

function cues(store) {
  return `${banner(store)}${signinCueHtml(isVerified())}`;
}

function showSigninCue() {
  ui.sheet = { type: 'confirm', title: 'Sign in to edit', ok: 'OK', danger: false, noop: true };
  render();
}

function requireEdit() {
  if (canEdit()) return true;
  showSigninCue();
  return false;
}

function editLock(edit) {
  return edit ? '' : 'aria-disabled="true"';
}

function hintBar() {
  if (!ui.hint) return '';
  return `<div class="hint" data-id="first-hint">${icon('clipboard', { size: 22 })}<p>Tap a project to set its test bar.</p>
    <button class="icon-btn" data-action="dismiss-hint" aria-label="Dismiss">${icon('x', { size: 20 })}<span class="lb">OK</span></button>
  </div>`;
}

function topBar(opts) {
  const { back, crumb, crumbSub, actions } = opts;
  return `<header class="bar">
    ${back ? `<button class="back-btn" data-action="back" aria-label="Back">${icon('back', { size: 22 })}<span class="lb">Back</span></button>` : ''}
    <div class="crumb">${esc(crumb)}${crumbSub ? `<small>${esc(crumbSub)}</small>` : ''}</div>
    <div class="bar-actions">${actions || ''}</div>
  </header>`;
}

function accountBtn() {
  if (isVerified()) {
    return `<button class="icon-btn" data-action="account" aria-label="Account">${icon('user', { size: 20 })}<span class="lb">Account</span></button>`;
  }
  return `<button class="icon-btn" data-action="signin" data-id="signin" aria-label="Sign in with Google">${icon('login', { size: 20 })}<span class="lb">Sign in</span></button>`;
}

function listView(store) {
  const list = activeProjects(store.projects);
  const archived = archivedProjects(store.projects);
  const cards = list.map(projectCard).join('') || `<div class="empty">No projects yet</div>`;
  const starter = canEdit() && store.emptyLive
    ? `<div class="fab-wrap"><button class="btn primary big" data-action="seed-list">${icon('plus', { size: 22 })} Add starter list</button></div>`
    : '';
  const add = canEdit()
    ? `<div class="fab-wrap"><button class="btn primary big" data-action="add-project" data-id="add-project">${icon('plus', { size: 22 })} Add project</button></div>`
    : '';
  return `${topBar({
    crumb: 'Checklists',
    actions: `${accountBtn()}
      <button class="icon-btn" data-action="goto-history" aria-label="History">${icon('clock', { size: 20 })}<span class="lb">Log</span></button>
      <button class="icon-btn" data-action="goto-archive" data-id="goto-archive" aria-label="Archive">${icon('archive', { size: 20 })}<span class="lb">Archive</span></button>`,
  })}
  <div class="scroll" data-view="list">
    ${cues(store)}
    ${hintBar()}
    ${cards}
    ${starter}
    ${add}
    ${archived.length && !canEdit() ? '' : ''}
  </div>`;
}

function projectCard(p) {
  const t = countTicks(p.tests);
  const s = countTicks(p.standards);
  const hold = p.status === 'hold'
    ? `<span class="pill hold">${icon(STATUS_ICON.hold, { size: 14 })} ${STATUS_LABEL.hold}</span>`
    : '';
  return `<button class="card" data-action="open-project" data-slug="${esc(p.slug)}" aria-label="${esc(p.name)}">
    <span class="mark">${icon(LEVEL_ICON[p.level] || 'layers', { size: 24 })}</span>
    <span class="body">
      <span class="name">${esc(p.name)}</span>
      <span class="meta">
        <span class="pill ${esc(p.level)}">${icon(LEVEL_ICON[p.level] || 'layers', { size: 14 })} ${LEVEL_LABEL[p.level] || p.level}</span>
        <span class="pill">${icon((GRAPHICS_FOCUSES.find((f) => f.id === p.graphicsFocus) || GRAPHICS_FOCUSES[0]).icon, { size: 14 })} ${esc(focusLabel(p.graphicsFocus))}</span>
        ${hold}
        <span class="pill">${icon('shield', { size: 14 })} ${s.on}/${s.total}</span>
        <span class="pill">${icon('target', { size: 14 })} ${t.on}/${t.total}</span>
      </span>
    </span>
  </button>`;
}

function projectView(store, slug) {
  const p = store.projects[slug];
  if (!p) {
    return `${topBar({ back: true, crumb: 'Checklists', actions: accountBtn() })}
      <div class="scroll"><div class="empty">No project</div></div>`;
  }
  const edit = canEdit();
  const levelCtl = `<div class="seg" role="group" aria-label="Test level">
    ${['light', 'normal', 'heavy'].map((lv) => `
      <button class="seg-btn" data-action="set-level" data-level="${lv}" data-id="level-${lv}"
        aria-pressed="${p.level === lv ? 'true' : 'false'}" ${editLock(edit)}>
        ${icon(LEVEL_ICON[lv], { size: 22 })}
        <span>${LEVEL_LABEL[lv]}</span>
      </button>`).join('')}
  </div>`;
  const tools = edit ? `<div class="proj-tools">
    <button class="btn" data-action="rename-project">${icon('pencil', { size: 18 })} Rename</button>
    ${p.status === 'hold'
      ? `<button class="btn" data-action="set-status" data-status="active">${icon('check', { size: 18 })} Active</button>`
      : `<button class="btn" data-action="set-status" data-status="hold">${icon('pause', { size: 18 })} On hold</button>`}
    <button class="btn" data-action="archive-project" data-id="archive-project">${icon('archive', { size: 18 })} Archive</button>
  </div>` : '';

  return `${topBar({
    back: true,
    crumb: p.name,
    crumbSub: 'Checklists',
    actions: `${accountBtn()}
      <button class="icon-btn" data-action="project-history" data-id="project-history" aria-label="History">${icon('clock', { size: 20 })}<span class="lb">Log</span></button>`,
  })}
  <div class="scroll" data-view="project" data-slug="${esc(slug)}">
    ${cues(store)}
    ${levelCtl}
    ${graphicsFocusBar(p, edit)}
    ${tools}
    <div class="groups">
      ${groupBlock('standards', 'Standards', 'shield', p.standards, edit)}
      ${groupBlock('tests', 'Tests', 'target', p.tests, edit)}
    </div>
    ${graphicsTierLadder(p, edit)}
    ${reuseBar(p, edit, slug)}
  </div>`;
}


function costCue(cost) {
  const word = (COST_CUE[cost] && COST_CUE[cost].word) || '';
  const ico = (COST_CUE[cost] && COST_CUE[cost].icon) || 'clock';
  const pips = [1, 2, 3, 4].map((i) => `<i class="${i <= cost ? 'on' : ''}"></i>`).join('');
  return `<span class="cost">${icon(ico, { size: 16 })}<span class="cost-pips">${pips}</span><span class="cost-word">${word}</span></span>`;
}

function graphicsFocusBar(p, edit) {
  const cur = p.graphicsFocus || 'feel';
  const stops = GRAPHICS_FOCUSES.map((f) => `
    <button class="focus-stop" data-action="set-focus" data-focus="${f.id}" data-id="focus-${f.id}"
      role="radio" aria-checked="${cur === f.id ? 'true' : 'false'}" ${editLock(edit)}>
      ${icon(f.icon, { size: 22 })}
      <span>${esc(f.label)}</span>
    </button>`).join('');
  return `<section class="gfx-block" data-id="graphics-focus">
    <div class="group-hd">${icon('palette', { size: 20 })} Graphics</div>
    <div class="focus-slider" role="radiogroup" aria-label="Graphics focus">${stops}</div>
  </section>`;
}

function graphicsTierLadder(p, edit) {
  const items = p.graphicsTiers || {};
  const blocks = TIER_GROUPS.map((g) => {
    const rows = tiersInGroup(items, g).map((t) => {
      const builtin = tierById(t.id);
      const ico = (builtin && builtin.icon) || (t.group === 'game' ? 'layout' : 'layers');
      const editBtns = edit ? `
        <button class="icon-btn" data-action="rename-tier" data-tier="${esc(t.id)}" aria-label="Rename">${icon('pencil', { size: 18 })}<span class="lb">Edit</span></button>
        <button class="icon-btn" data-action="remove-tier" data-tier="${esc(t.id)}" aria-label="Remove">${icon('trash', { size: 18 })}<span class="lb">Drop</span></button>
      ` : '';
      return `<div class="tier-line" data-tier-row="${esc(t.id)}">
        <button class="tier-row" data-action="toggle-tier" data-tier="${esc(t.id)}" data-id="tier-${esc(t.id)}"
          aria-pressed="${t.on ? 'true' : 'false'}" ${editLock(edit)}>
          <span class="mark">${icon(ico, { size: 22 })}</span>
          <span class="lab">${esc(t.text)}</span>
          ${costCue(t.cost)}
          <span class="check" aria-hidden="true">${t.on ? icon('check', { size: 18 }) : ''}</span>
        </button>
        ${editBtns}
      </div>`;
    }).join('') || `<div class="empty">No items</div>`;
    const add = edit
      ? `<button class="icon-btn" data-action="add-tier" data-group="${g}" data-id="add-tier-${g}" aria-label="Add ${TIER_GROUP_LABEL[g]} tier">${icon('plus', { size: 20 })}<span class="lb">Add</span></button>`
      : '';
    return `<div class="tier-group"><div class="tier-kicker">${TIER_GROUP_LABEL[g]} <span class="sp"></span>${add}</div>${rows}</div>`;
  }).join('');
  return `<section class="gfx-block" data-id="graphics-tiers">
    <div class="group-hd">${icon('layers', { size: 20 })} Tiers</div>
    ${blocks}
  </section>`;
}

function reuseBar(p, edit, slug) {
  const list = reuseList(p.reuse);
  const chips = list.map((r) => `
    <span class="reuse-chip">
      ${reuseThumb(r)}
      <span class="lab">${esc(r.name)}</span>
    </span>`).join('') || `<span class="muted">None yet</span>`;
  return `<section class="gfx-block" data-id="reuse-bar">
    <div class="group-hd">${icon('inbox', { size: 20 })} Reuse
      <span class="sp"></span>
      <button class="icon-btn" data-action="open-reuse" data-id="open-reuse" aria-label="Pick reuse parts">${icon('grid', { size: 20 })}<span class="lb">Pick</span></button>
    </div>
    <div class="reuse-chips">${chips}</div>
  </section>`;
}

function reuseThumb(part) {
  if (part && part.thumb) {
    return `<img class="reuse-thumb" src="catalog/${esc(part.thumb)}" alt="" width="48" height="48" />`;
  }
  const kind = (part && part.kind) || 'other';
  return `<span class="reuse-ph" data-kind="${esc(kind)}">${icon(KIND_ICON[kind] || 'clipboard', { size: 22 })}</span>`;
}

let catalogParts = [];
export function setCatalog(parts) {
  catalogParts = Array.isArray(parts) ? parts : [];
}

function reuseView(store, slug) {
  const p = store.projects[slug];
  if (!p) {
    return `${topBar({ back: true, crumb: 'Reuse', actions: accountBtn() })}
      <div class="scroll"><div class="empty">No project</div></div>`;
  }
  const edit = canEdit();
  const selected = p.reuse || {};
  const cards = (catalogParts || []).map((part) => {
    const on = !!selected[part.id];
    return `<button class="reuse-card" data-action="toggle-reuse" data-id="reuse-${esc(part.id)}"
      data-part="${esc(part.id)}" aria-pressed="${on ? 'true' : 'false'}" ${editLock(edit)}>
      ${reuseThumb(part)}
      <span class="body">
        <span class="name">${esc(part.name)}</span>
        <span class="src">${esc(part.source || KIND_LABEL[part.kind] || '')}</span>
      </span>
      <span class="check" aria-hidden="true">${on ? icon('check', { size: 18 }) : ''}</span>
    </button>`;
  }).join('') || `<div class="empty">No parts catalog</div>`;
  return `${topBar({
    back: true,
    crumb: 'Reuse',
    crumbSub: p.name,
    actions: accountBtn(),
  })}<div class="scroll" data-view="reuse">${cues(store)}
    <div class="reuse-grid">${cards}</div>
  </div>`;
}

function groupBlock(group, title, ico, items, edit) {
  const ids = Object.keys(items || {});
  const rows = ids.map((id) => itemRow(group, id, items[id], edit)).join('') || `<div class="empty">No items</div>`;
  const add = edit
    ? `<button class="icon-btn" data-action="add-item" data-group="${group}" data-id="add-${group}" aria-label="Add ${title} item">${icon('plus', { size: 20 })}<span class="lb">Add</span></button>`
    : '';
  return `<section class="group" data-group="${group}">
    <div class="group-hd">${icon(ico, { size: 20 })} ${esc(title)} <span class="sp"></span>${add}</div>
    ${rows}
  </section>`;
}

function itemRow(group, id, item, edit) {
  const on = !!(item && item.on);
  const editBtns = edit ? `
    <button class="icon-btn" data-action="rename-item" data-group="${group}" data-id="${esc(id)}" aria-label="Rename">${icon('pencil', { size: 18 })}<span class="lb">Edit</span></button>
    <button class="icon-btn" data-action="remove-item" data-group="${group}" data-id="${esc(id)}" aria-label="Remove">${icon('trash', { size: 18 })}<span class="lb">Drop</span></button>
  ` : '';
  return `<div class="row" data-item="${esc(id)}">
    <button class="check" data-action="tick" data-group="${group}" data-id="${esc(id)}"
      role="checkbox" aria-checked="${on}" ${editLock(edit)} aria-label="${esc(item.text)}">
      ${on ? icon('check', { size: 22 }) : ''}
    </button>
    <div class="lab">${esc(item.text)}</div>
    ${editBtns}
  </div>`;
}

function archiveView(store) {
  const list = archivedProjects(store.projects);
  const cards = list.map((p) => {
    const restore = canEdit()
      ? `<button class="btn" data-action="restore-project" data-slug="${esc(p.slug)}" data-id="restore-${esc(p.slug)}">${icon('inbox', { size: 18 })} Restore</button>`
      : '';
    return `<div class="card" style="flex-wrap:wrap">
      <span class="mark">${icon('archive', { size: 22 })}</span>
      <span class="body"><span class="name">${esc(p.name)}</span></span>
      ${restore}
    </div>`;
  }).join('') || `<div class="empty">No archived projects</div>`;
  return `${topBar({
    back: true,
    crumb: 'Archive',
    crumbSub: 'Checklists',
    actions: accountBtn(),
  })}<div class="scroll" data-view="archive">${cues(store)}${cards}</div>`;
}

function historyView(store, slug) {
  const title = slug && store.projects[slug] ? store.projects[slug].name : 'All projects';
  const entries = slug
    ? historyList(store.projects[slug] && store.projects[slug].history)
    : mergeLog(combinedHistory(store));
  const items = entries.map((e) => `
    <div class="hist-item">
      <div class="when">${fmtWhen(e.at)}${e.who ? ' · ' + esc(e.who) : ''}</div>
      <div class="what">${esc(e.text)}</div>
    </div>`).join('') || `<div class="empty">No changes yet</div>`;
  return `${topBar({
    back: true,
    crumb: 'Log',
    crumbSub: title,
    actions: accountBtn(),
  })}<div class="scroll" data-view="history">${items}</div>`;
}

function combinedHistory(store) {
  const map = { ...(store.log || {}) };
  for (const [slug, p] of Object.entries(store.projects || {})) {
    for (const [id, rec] of Object.entries((p && p.history) || {})) {
      if (!map[id]) map[`${slug}-${id}`] = rec;
    }
  }
  return map;
}

function fmtWhen(at) {
  const d = new Date(Number(at) || 0);
  if (!Number.isFinite(d.getTime()) || d.getTime() <= 0) return '';
  const tz = 'America/Phoenix';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function renderSheet() {
  const s = ui.sheet;
  if (!s) return '';
  if (s.type === 'level-choice') {
    return `<div class="sheet-bg" data-action="sheet-cancel"><div class="sheet" data-id="level-choice" >
      <h2>Apply this level's ticks?</h2>
      <div class="actions">
        <button class="btn primary big" data-action="apply-preset" data-id="apply-preset">${icon('check', { size: 20 })} Apply preset</button>
        <button class="btn big" data-action="keep-ticks" data-id="keep-ticks">${icon('lock', { size: 20 })} Keep my ticks</button>
      </div>
    </div></div>`;
  }
  if (s.type === 'text') {
    return `<div class="sheet-bg" data-action="sheet-cancel"><div class="sheet" data-id="text-sheet" >
      <h2>${esc(s.title)}</h2>
      <div class="field"><label for="dc-text">${esc(s.label || 'Name')}</label>
        <input id="dc-text" maxlength="${s.max || 80}" value="${esc(s.value || '')}" />
      </div>
      <div class="actions">
        <button class="btn primary big" data-action="text-ok" data-id="text-ok">Done</button>
        <button class="btn big" data-action="sheet-cancel">Cancel</button>
      </div>
    </div></div>`;
  }
  if (s.type === 'add-project') {
    return `<div class="sheet-bg" data-action="sheet-cancel"><div class="sheet" data-id="add-project-sheet" >
      <h2>Add project</h2>
      <div class="field"><label for="dc-text">Name</label>
        <input id="dc-text" maxlength="80" value="" />
      </div>
      <div class="field"><label>Level</label>
        <div class="seg">
          ${['light', 'normal', 'heavy'].map((lv) => `
            <button class="seg-btn" data-action="draft-level" data-level="${lv}" aria-pressed="${(s.level || 'light') === lv}">
              ${icon(LEVEL_ICON[lv], { size: 20 })}<span>${LEVEL_LABEL[lv]}</span>
            </button>`).join('')}
        </div>
      </div>
      <div class="actions">
        <button class="btn primary big" data-action="add-project-ok" data-id="add-project-ok">Done</button>
        <button class="btn big" data-action="sheet-cancel">Cancel</button>
      </div>
    </div></div>`;
  }
  if (s.type === 'add-tier') {
    return `<div class="sheet-bg" data-action="sheet-cancel"><div class="sheet" data-id="add-tier-sheet" >
      <h2>Add item</h2>
      <div class="field"><label for="dc-text">Item</label>
        <input id="dc-text" maxlength="80" value="" />
      </div>
      <div class="field"><label>Group</label>
        <div class="seg">
          ${TIER_GROUPS.map((g) => `
            <button class="seg-btn" data-action="draft-tier-group" data-group="${g}" aria-pressed="${(s.group || '2d') === g}">
              <span>${TIER_GROUP_LABEL[g]}</span>
            </button>`).join('')}
        </div>
      </div>
      <div class="actions">
        <button class="btn primary big" data-action="add-tier-ok" data-id="add-tier-ok">Done</button>
        <button class="btn big" data-action="sheet-cancel">Cancel</button>
      </div>
    </div></div>`;
  }
  if (s.type === 'confirm') {
    return `<div class="sheet-bg" data-action="sheet-cancel"><div class="sheet" data-id="confirm-sheet" >
      <h2>${esc(s.title)}</h2>
      <div class="actions">
        <button class="btn ${s.danger ? 'danger' : 'primary'} big" data-action="confirm-ok" data-id="confirm-ok">${esc(s.ok || 'OK')}</button>
        <button class="btn big" data-action="sheet-cancel">Cancel</button>
      </div>
    </div></div>`;
  }
  if (s.type === 'account') {
    const uid = getUid();
    return `<div class="sheet-bg" data-action="sheet-cancel"><div class="sheet" data-id="account-sheet" >
      <h2>Account</h2>
      <p class="who">${WHO}</p>
      <div class="field"><label>uid</label>
        <div class="row" style="margin:0">
          <div class="lab" data-id="uid-value">${esc(uid)}</div>
          <button class="icon-btn" data-action="copy-uid" data-id="copy-uid" aria-label="Copy uid">${icon('copy', { size: 20 })}<span class="lb">Copy</span></button>
        </div>
      </div>
      <div class="actions">
        <button class="btn big" data-action="signout" data-id="signout">${icon('logout', { size: 20 })} Sign out</button>
        <button class="btn big" data-action="sheet-cancel">Close</button>
      </div>
    </div></div>`;
  }
  return '';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function render() {
  const root = document.getElementById('app');
  if (!root) return;
  ui.route = parseHash();
  const store = getStoreState();
  let body = '';
  if (ui.route.view === 'archive') body = archiveView(store);
  else if (ui.route.view === 'history') body = historyView(store, ui.route.slug);
  else if (ui.route.view === 'reuse') body = reuseView(store, ui.route.slug);
  else if (ui.route.view === 'project') body = projectView(store, ui.route.slug);
  else body = listView(store);
  root.innerHTML = body + renderSheet();
  const input = document.getElementById('dc-text');
  if (input) {
    input.focus();
    const v = input.value;
    input.setSelectionRange(v.length, v.length);
  }
}

async function withSave(fn) {
  try {
    const out = await fn();
    if (out && out.needsChoice) return out;
    showFlash();
    render();
    return out;
  } catch (e) {
    ui.sheet = { type: 'confirm', title: e && e.code === 'readonly' ? 'Sign in to edit' : 'Could not save', ok: 'OK', danger: false, noop: true };
    render();
    return null;
  }
}

export function bind(root) {
  root.addEventListener('click', onTap);
  window.addEventListener('hashchange', () => {
    ui.sheet = null;
    ui.route = parseHash();
    render();
  });
}

async function onTap(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  const store = getStoreState();
  const route = ui.route;

  if (action === 'dismiss-hint') {
    ui.hint = false;
    markHintSeen();
    render();
    return;
  }
  if (action === 'back') {
    if (route.view === 'history' && route.slug) go(`#/p/${route.slug}`);
    else if (route.view === 'reuse' && route.slug) go(`#/p/${route.slug}`);
    else go('#/');
    return;
  }
  if (action === 'signin') {
    try { await signInGoogle(); } catch (_) { /* popup blocked or cancelled */ }
    render();
    return;
  }
  if (action === 'account') {
    ui.sheet = { type: 'account' };
    render();
    return;
  }
  if (action === 'signout') {
    await doSignOut();
    ui.sheet = null;
    render();
    return;
  }
  if (action === 'copy-uid') {
    const uid = getUid();
    try { await navigator.clipboard.writeText(uid); showFlash(); } catch (_) { /* */ }
    return;
  }
  if (action === 'goto-history') { go('#/history'); return; }
  if (action === 'goto-archive') { go('#/archive'); return; }
  if (action === 'open-project') { go(`#/p/${btn.getAttribute('data-slug')}`); return; }
  if (action === 'project-history' && route.slug) { go(`#/p/${route.slug}/history`); return; }

  if (action === 'sheet-cancel') {
    if (e.target !== btn && e.target.closest('.sheet')) return;
    ui.sheet = null;
    render();
    return;
  }


  if (action === 'tick' && route.slug) {
    if (!requireEdit()) return;
    const group = btn.getAttribute('data-group');
    const id = btn.getAttribute('data-id');
    const on = btn.getAttribute('aria-checked') !== 'true';
    await withSave(() => saveTick(route.slug, group, id, on));
    return;
  }

  if (action === 'set-level' && route.slug) {
    if (!requireEdit()) return;
    const level = btn.getAttribute('data-level');
    const proj = store.projects[route.slug];
    if (!proj || proj.level === level) return;
    if (shouldPromptLevelChange(proj.tests, level)) {
      ui.sheet = { type: 'level-choice', level };
      render();
      return;
    }
    await withSave(() => saveLevel(route.slug, level, 'same'));
    return;
  }
  if (action === 'apply-preset' && route.slug && ui.sheet && ui.sheet.level) {
    const level = ui.sheet.level;
    ui.sheet = null;
    await withSave(() => saveLevel(route.slug, level, 'apply'));
    return;
  }
  if (action === 'keep-ticks' && route.slug && ui.sheet && ui.sheet.level) {
    const level = ui.sheet.level;
    ui.sheet = null;
    await withSave(() => saveLevel(route.slug, level, 'keep'));
    return;
  }


  if (action === 'set-focus' && route.slug) {
    if (!requireEdit()) return;
    const focus = btn.getAttribute('data-focus');
    await withSave(() => saveFocus(route.slug, focus));
    return;
  }
  if (action === 'toggle-tier' && route.slug) {
    if (!requireEdit()) return;
    const id = btn.getAttribute('data-tier');
    const on = btn.getAttribute('aria-pressed') !== 'true';
    await withSave(() => saveTier(route.slug, id, on));
    return;
  }

  if (action === 'open-reuse' && route.slug) { go(`#/p/${route.slug}/reuse`); return; }
  if (action === 'toggle-reuse' && route.slug) {
    if (!requireEdit()) return;
    const id = btn.getAttribute('data-part');
    const on = btn.getAttribute('aria-pressed') !== 'true';
    const part = (catalogParts || []).find((x) => x.id === id);
    if (!part) return;
    await withSave(() => saveReuse(route.slug, part, on));
    return;
  }
  if (action === 'add-tier' && route.slug) {
    ui.sheet = { type: 'add-tier', group: btn.getAttribute('data-group') || '2d' };
    render();
    return;
  }
  if (action === 'draft-tier-group') {
    if (ui.sheet && ui.sheet.type === 'add-tier') {
      const val = (document.getElementById('dc-text') || {}).value || '';
      ui.sheet.group = btn.getAttribute('data-group') || '2d';
      render();
      const input = document.getElementById('dc-text');
      if (input) input.value = val;
    }
    return;
  }
  if (action === 'add-tier-ok' && route.slug) {
    const name = ((document.getElementById('dc-text') || {}).value || '').trim();
    const group = (ui.sheet && ui.sheet.group) || '2d';
    ui.sheet = null;
    if (!isValidItemText(name)) { render(); return; }
    await withSave(() => saveTierAdd(route.slug, name, group, 2));
    return;
  }
  if (action === 'rename-tier' && route.slug) {
    const id = btn.getAttribute('data-tier');
    const item = store.projects[route.slug] && store.projects[route.slug].graphicsTiers && store.projects[route.slug].graphicsTiers[id];
    ui.sheet = { type: 'text', title: 'Rename', label: 'Item', max: 80, value: item ? item.text : '', next: { kind: 'rename-tier', id } };
    render();
    return;
  }
  if (action === 'remove-tier' && route.slug) {
    ui.sheet = { type: 'confirm', title: 'Remove this item?', ok: 'Remove', danger: true, next: { kind: 'remove-tier', id: btn.getAttribute('data-tier') } };
    render();
    return;
  }
  if (action === 'add-item' && route.slug) {
    ui.sheet = { type: 'text', title: 'Add item', label: 'Item', max: 80, value: '', next: { kind: 'add-item', group: btn.getAttribute('data-group') } };
    render();
    return;
  }
  if (action === 'rename-item' && route.slug) {
    const group = btn.getAttribute('data-group');
    const id = btn.getAttribute('data-id');
    const item = store.projects[route.slug] && store.projects[route.slug][group] && store.projects[route.slug][group][id];
    ui.sheet = { type: 'text', title: 'Rename', label: 'Item', max: 80, value: item ? item.text : '', next: { kind: 'rename-item', group, id } };
    render();
    return;
  }
  if (action === 'remove-item' && route.slug) {
    ui.sheet = { type: 'confirm', title: 'Remove this item?', ok: 'Remove', danger: true, next: { kind: 'remove-item', group: btn.getAttribute('data-group'), id: btn.getAttribute('data-id') } };
    render();
    return;
  }
  if (action === 'rename-project' && route.slug) {
    const p = store.projects[route.slug];
    ui.sheet = { type: 'text', title: 'Rename', label: 'Name', max: 80, value: p ? p.name : '', next: { kind: 'rename-project' } };
    render();
    return;
  }
  if (action === 'set-status' && route.slug) {
    await withSave(() => saveProjectStatus(route.slug, btn.getAttribute('data-status')));
    return;
  }
  if (action === 'archive-project' && route.slug) {
    ui.sheet = { type: 'confirm', title: 'Archive this project?', ok: 'Archive', danger: false, next: { kind: 'archive' } };
    render();
    return;
  }
  if (action === 'restore-project') {
    const slug = btn.getAttribute('data-slug');
    await withSave(() => saveProjectStatus(slug, 'active'));
    return;
  }
  if (action === 'add-project') {
    ui.sheet = { type: 'add-project', level: 'light' };
    render();
    return;
  }
  if (action === 'draft-level') {
    if (ui.sheet && ui.sheet.type === 'add-project') {
      ui.sheet.level = btn.getAttribute('data-level');
      const val = (document.getElementById('dc-text') || {}).value || '';
      render();
      const input = document.getElementById('dc-text');
      if (input) input.value = val;
    }
    return;
  }
  if (action === 'add-project-ok') {
    const name = ((document.getElementById('dc-text') || {}).value || '').trim();
    if (!isValidName(name)) return;
    const level = (ui.sheet && ui.sheet.level) || 'light';
    ui.sheet = null;
    const out = await withSave(() => saveProjectAdd({ name, status: 'active', level }));
    if (out && out.slug) go(`#/p/${out.slug}`);
    return;
  }
  if (action === 'text-ok') {
    const name = ((document.getElementById('dc-text') || {}).value || '').trim();
    const next = ui.sheet && ui.sheet.next;
    ui.sheet = null;
    if (!next) { render(); return; }
    if (next.kind === 'add-item' && isValidItemText(name)) {
      await withSave(() => saveItemAdd(route.slug, next.group, name));
    } else if (next.kind === 'rename-item' && isValidItemText(name)) {
      await withSave(() => saveItemRename(route.slug, next.group, next.id, name));
    } else if (next.kind === 'rename-project' && isValidName(name)) {
      await withSave(() => saveProjectRename(route.slug, name));
    } else if (next.kind === 'rename-tier' && isValidItemText(name)) {
      await withSave(() => saveTierRename(route.slug, next.id, name));
    } else {
      render();
    }
    return;
  }
  if (action === 'confirm-ok') {
    const next = ui.sheet && ui.sheet.next;
    const noop = ui.sheet && ui.sheet.noop;
    ui.sheet = null;
    if (noop || !next) { render(); return; }
    if (next.kind === 'remove-item') {
      await withSave(() => saveItemRemove(route.slug, next.group, next.id));
    } else if (next.kind === 'remove-tier') {
      await withSave(() => saveTierRemove(route.slug, next.id));
    } else if (next.kind === 'archive') {
      await withSave(() => saveProjectStatus(route.slug, 'archived'));
      go('#/');
    } else {
      render();
    }
    return;
  }
  if (action === 'seed-list') {
    await withSave(() => saveStarterList());
    return;
  }
  void getEmu;
}

export { ui, showFlash };
