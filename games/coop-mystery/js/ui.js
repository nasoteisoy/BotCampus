/**
 * Screen rendering — big buttons, one hint line, icons with labels.
 */
(function (global) {
  'use strict';

  const I = () => global.CoopIcons;

  function el(html) {
    const d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function mount(root, nodes) {
    clear(root);
    nodes.forEach((n) => {
      if (n) root.appendChild(n);
    });
  }

  function topbar(crumb, onBack) {
    const bar = el('<div class="topbar"></div>');
    if (onBack) {
      const b = el('<button type="button" class="btn btn-ghost" data-act="back">' + I().icon('home') + ' Home</button>');
      b.addEventListener('click', onBack);
      bar.appendChild(b);
    }
    bar.appendChild(el('<div class="crumb">' + crumb + '</div>'));
    return bar;
  }

  function errorBanner(msg) {
    if (!msg) return null;
    return el(
      '<div class="error-banner" role="alert">' +
        I().icon('alert') +
        '<div>' +
        escapeHtml(msg) +
        '</div></div>'
    );
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function homeScreen(handlers, saved) {
    const wrap = document.createDocumentFragment();
    const panel = el('<div class="panel"></div>');
    panel.appendChild(el('<h1>' + I().icon('key') + ' Who Has the Key</h1>'));
    panel.appendChild(el('<p class="hint">Hear lines. Pick doors. Not every door is right.</p>'));
    panel.appendChild(
      el(
        '<div class="field"><label for="name">Your name</label>' +
          '<input id="name" type="text" maxlength="16" autocomplete="nickname" value="' +
          escapeHtml((saved && saved.name) || '') +
          '"></div>'
      )
    );
    const row = el('<div class="btn-row"></div>');
    const create = el('<button type="button" class="btn btn-primary" data-act="create">' + I().icon('users') + ' Create room</button>');
    const join = el('<button type="button" class="btn" data-act="join">' + I().icon('users') + ' Join</button>');
    const solo = el('<button type="button" class="btn btn-block" data-act="solo" style="margin-top:8px">' + I().icon('star') + ' Solo Test</button>');
    create.addEventListener('click', () => {
      const name = panel.querySelector('#name').value.trim() || 'Host';
      handlers.create(name);
    });
    join.addEventListener('click', () => {
      const name = panel.querySelector('#name').value.trim() || 'Player';
      handlers.joinPrompt(name);
    });
    solo.addEventListener('click', () => {
      const name = panel.querySelector('#name').value.trim() || 'You';
      handlers.solo(name);
    });
    row.appendChild(create);
    row.appendChild(join);
    panel.appendChild(row);
    panel.appendChild(solo);
    if (saved && saved.code) {
      const re = el(
        '<button type="button" class="btn btn-ghost btn-block" style="margin-top:8px">Rejoin ' +
          escapeHtml(saved.code) +
          '</button>'
      );
      re.addEventListener('click', () => handlers.rejoin(saved));
      panel.appendChild(re);
    }
    wrap.appendChild(topbar('Co-op Mystery'));
    wrap.appendChild(panel);
    return wrap;
  }

  function joinScreen(name, handlers) {
    const frag = document.createDocumentFragment();
    const panel = el('<div class="panel"></div>');
    panel.appendChild(el('<h1>Join room</h1>'));
    panel.appendChild(el('<p class="hint">Enter the 4-letter code.</p>'));
    panel.appendChild(
      el(
        '<div class="field"><label for="code">Room code</label>' +
          '<input id="code" type="text" maxlength="4" autocapitalize="characters" spellcheck="false"></div>'
      )
    );
    const go = el('<button type="button" class="btn btn-primary btn-block">Join</button>');
    go.addEventListener('click', () => {
      const code = panel.querySelector('#code').value.trim().toUpperCase();
      handlers.join(name, code);
    });
    panel.appendChild(go);
    frag.appendChild(topbar('Join', handlers.home));
    frag.appendChild(panel);
    return frag;
  }

  function lobbyScreen(view, handlers, isHost, err) {
    const frag = document.createDocumentFragment();
    frag.appendChild(topbar(view.mysteryTitle + ' · Lobby', handlers.home));
    if (err) frag.appendChild(errorBanner(err));
    const panel = el('<div class="panel"></div>');
    panel.appendChild(el('<p class="hint">Share the code. Host starts.</p>'));
    panel.appendChild(el('<div class="code-big">' + escapeHtml(view.roomCode || '----') + '</div>'));
    const list = el('<div class="list"></div>');
    (view.players || []).forEach((p) => {
      list.appendChild(
        el(
          '<div class="card"><span class="tag">' +
            escapeHtml(p.roleName) +
            (p.isHost ? ' · Host' : '') +
            (p.isBot ? ' · Bot' : '') +
            '</span><div><strong>' +
            escapeHtml(p.name) +
            '</strong></div></div>'
        )
      );
    });
    panel.appendChild(list);
    frag.appendChild(panel);
    const foot = el('<div class="footer-actions"></div>');
    if (isHost) {
      const start = el(
        '<button type="button" class="btn btn-primary btn-block"' +
          (view.canStart ? '' : ' disabled') +
          '>Start</button>'
      );
      start.addEventListener('click', handlers.start);
      foot.appendChild(start);
    } else {
      foot.appendChild(el('<p class="hint">Waiting for host…</p>'));
    }
    frag.appendChild(foot);
    return frag;
  }


  // ---- Round UI: one action per screen (Talk > Listen > Door), tabs, top bar ----
  const RS = { round: -1, step: 'talk', tab: 'play', door: null, pending: null, snap: null, fb: null, menu: false, doneDoor: false };

  function snapOf(view) {
    return {
      tokens: view.tokens,
      heard: (view.heardPhraseIds || []).length,
      clues: (view.clues || []).length,
      here: view.maze && view.maze.current ? view.maze.current.id : null,
      wall: view.lastWall ? JSON.stringify(view.lastWall) : ''
    };
  }

  function resolvePending(view) {
    if (!RS.pending) return;
    const a = RS.snap, b = snapOf(view);
    if (RS.pending === 'hear') {
      if (b.heard > a.heard) RS.fb = { kind: 'good', icon: 'door', title: 'New door opened', step: 'door' };
      else if (b.tokens < a.tokens) RS.fb = { kind: 'bad', icon: 'alert', title: 'Wrong · -1 guess', step: 'listen' };
      else return;
    } else if (RS.pending === 'ask') {
      if (b.wall !== a.wall && view.lastWall) {
        RS.fb = { kind: 'wall', icon: 'wall', title: 'Dead end', text: view.lastWall.clueText || view.lastWall.text, step: 'door' };
      } else if (b.clues > a.clues) {
        const c = view.clues[view.clues.length - 1];
        RS.fb = { kind: 'good', icon: 'key', title: 'New clue', text: c.text, step: 'door' };
      } else if (b.here !== a.here) {
        RS.fb = { kind: 'good', icon: 'check', title: 'Something new', step: 'door' };
      } else if (b.tokens < a.tokens) {
        RS.fb = { kind: 'bad', icon: 'lock', title: 'Locked this round', step: 'door' };
      } else return;
    }
    RS.pending = null;
  }

  function stepDots(step) {
    const steps = [['talk', 'talk', 'Talk'], ['listen', 'hear', 'Listen'], ['door', 'door', 'Door']];
    const bar = el('<div class="steps" data-step="' + step + '"></div>');
    steps.forEach((s, i) => {
      bar.appendChild(el('<div class="step' + (s[0] === step ? ' on' : '') + '">' + I().icon(s[1]) + '<span>' + s[2] + '</span></div>'));
      if (i < 2) bar.appendChild(el('<div class="step-sep"></div>'));
    });
    return bar;
  }

  function gameTopbar(view, handlers, rerender) {
    const bar = el('<div class="gbar"></div>');
    const keys = el('<div class="keys" aria-label="' + view.tokens + ' guesses"></div>');
    const max = Math.max(view.tokensPerRound || 4, view.tokens);
    for (let i = 0; i < max; i++) keys.appendChild(el('<span class="k' + (i < view.tokens ? ' on' : '') + '">' + I().icon(i < view.tokens ? 'key' : 'keyEmpty') + '</span>'));
    bar.appendChild(keys);
    bar.appendChild(el('<div class="rnd">R' + (view.roundIndex + 1) + '/' + view.totalRounds + '</div>'));
    bar.appendChild(el('<div class="role" title="' + escapeHtml(view.me.roleName) + '">' + I().icon(view.roleIcon || 'star') + '</div>'));
    const m = el('<button type="button" class="btn btn-icon" data-act="menu" aria-label="Menu">' + I().icon('menu') + '</button>');
    m.addEventListener('click', () => { RS.menu = !RS.menu; rerender(); });
    bar.appendChild(m);
    return bar;
  }

  function tabBar(rerender) {
    const tabs = [['play', 'play', 'Play'], ['clues', 'list', 'Clues'], ['map', 'map', 'Map'], ['ability', 'star', 'Ability']];
    const bar = el('<nav class="tabbar"></nav>');
    tabs.forEach((t) => {
      const b = el('<button type="button" class="tab' + (RS.tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + I().icon(t[1]) + '<span>' + t[2] + '</span></button>');
      b.addEventListener('click', () => { RS.tab = t[0]; RS.menu = false; rerender(); });
      bar.appendChild(b);
    });
    return bar;
  }

  function bigBtn(label, cls, onClick, attrs) {
    const b = el('<button type="button" class="btn big ' + (cls || '') + '" ' + (attrs || '') + '>' + label + '</button>');
    b.addEventListener('click', onClick);
    return b;
  }

  function talkStep(view, rerender) {
    const s = el('<section class="stage"></section>');
    s.appendChild(el('<h1 class="prompt">Say this out loud</h1>'));
    const box = el('<div class="say-list"></div>');
    (view.talkingPoints || []).forEach((t) => box.appendChild(el('<div class="say">' + escapeHtml(t.text) + '</div>')));
    s.appendChild(box);
    s.appendChild(bigBtn('Done', 'btn-primary', () => { RS.step = 'listen'; rerender(); }, 'data-act="talk-done"'));
    return s;
  }

  function listenStep(view, handlers, rerender) {
    const s = el('<section class="stage"></section>');
    s.appendChild(el('<h1 class="prompt">What did you hear?</h1>'));
    if (view.botLines && view.botLines.length) {
      const bub = el('<div class="bubbles"></div>');
      view.botLines.forEach((b) => bub.appendChild(el('<div class="bubble"><b>' + escapeHtml(b.name) + '</b> ' + b.lines.map(escapeHtml).join(' · ') + '</div>')));
      s.appendChild(bub);
    }
    const grid = el('<div class="tiles"></div>');
    const heard = new Set(view.heardPhraseIds || []);
    (view.hearOptions || []).filter((o) => !heard.has(o.phraseId)).forEach((o) => {
      const b = bigBtn(escapeHtml(o.text), 'tile', () => {
        RS.pending = 'hear'; RS.snap = snapOf(view);
        handlers.hear(o.phraseId, o.fromId);
      }, 'data-act="hear-tile" data-phrase="' + o.phraseId + '"' + (view.tokens < 1 ? ' disabled' : ''));
      grid.appendChild(b);
    });
    s.appendChild(grid);
    s.appendChild(bigBtn('Nothing', '', () => { RS.step = 'door'; rerender(); }, 'data-act="hear-none"'));
    return s;
  }

  function kindIcon(k) { return I().icon(k === 'topic' ? 'talk' : 'hand'); }

  function doorStep(view, handlers, rerender) {
    const s = el('<section class="stage"></section>');
    const maze = view.maze || {};
    const resps = maze.responses || [];
    const exits = {};
    (maze.exits || []).forEach((e) => { exits[e.dir] = e; });
    if (RS.door) {
      const d = RS.door;
      const list = resps.filter((r) => (r.dir || '*') === d);
      s.appendChild(el('<h1 class="prompt">How?</h1>'));
      const col = el('<div class="choices"></div>');
      list.forEach((r) => {
        col.appendChild(bigBtn((r.locked ? I().icon('lock') : kindIcon(r.kind)) + '<span>' + escapeHtml(r.act || r.text) + '</span>', 'act act-' + r.kind + (r.locked ? ' is-locked' : ''), () => {
          RS.pending = 'ask'; RS.snap = snapOf(view); RS.door = null;
          handlers.askResponse(r.id);
        }, 'data-act="resp" data-resp="' + r.id + '"' + (r.locked || view.tokens < 1 ? ' disabled' : '')));
      });
      s.appendChild(col);
      s.appendChild(bigBtn('Back', 'btn-ghost', () => { RS.door = null; rerender(); }, 'data-act="door-back"'));
      return s;
    }
    s.appendChild(el('<h1 class="prompt">What now?</h1>'));
    const col = el('<div class="choices"></div>');
    const dirs = [];
    resps.forEach((r) => { const k = r.dir || '*'; if (dirs.indexOf(k) < 0) dirs.push(k); });
    dirs.forEach((d) => {
      const group = resps.filter((r) => (r.dir || '*') === d);
      const allLocked = group.every((r) => r.locked);
      const ex = exits[d] || {};
      const label = ex.action || group[0].act || group[0].text;
      const kind = ex.action ? ex.actionKind : group[0].kind;
      col.appendChild(bigBtn((allLocked ? I().icon('lock') : kindIcon(kind)) + '<span>' + escapeHtml(label) + '</span>', 'act act-' + kind + (allLocked ? ' is-locked' : ''), () => { RS.door = d; rerender(); },
        'data-door="' + d + '"' + (allLocked || view.tokens < 1 ? ' disabled' : '')));
    });
    const hidden = (maze.exits || []).filter((e) => e.kind === 'fog').length;
    if (hidden) col.appendChild(el('<div class="hint center">' + I().icon('fog') + ' ' + hidden + ' more need a line</div>'));
    s.appendChild(col);
    s.appendChild(bigBtn('Listen again', 'btn-ghost', () => { RS.step = 'listen'; rerender(); }, 'data-act="to-listen"'));
    return s;
  }

  function feedbackCard(rerender) {
    const f = RS.fb;
    const s = el('<section class="stage"></section>');
    s.appendChild(el('<div class="fb fb-' + f.kind + '" data-fb="' + f.kind + '">' + I().icon(f.icon) + '<h1>' + escapeHtml(f.title) + '</h1>' + (f.text && f.text !== f.title ? '<p>' + escapeHtml(f.text) + '</p>' : '') + '</div>'));
    s.appendChild(bigBtn('OK', 'btn-primary', () => { RS.step = f.step; RS.fb = null; rerender(); }, 'data-act="fb-ok"'));
    return s;
  }

  function cluesTab(view) {
    const s = el('<section class="stage scroll"></section>');
    s.appendChild(el('<h1 class="prompt">Your clues</h1>'));
    if (!(view.clues || []).length) s.appendChild(el('<p class="hint center">None yet</p>'));
    (view.clues || []).forEach((c) => {
      s.appendChild(el('<div class="card ' + (c.deadEnd ? 'wall' : 'good') + '">' + I().icon(c.deadEnd ? 'wall' : c.verified ? 'check' : 'key') + ' ' + escapeHtml(c.text) + '</div>'));
    });
    return s;
  }

  function mapTab(view) {
    const s = el('<section class="stage"></section>');
    s.appendChild(el('<h1 class="prompt">Your map</h1>'));
    if (view.maze && view.maze.current) s.appendChild(el('<p class="hint center">Here: ' + escapeHtml(view.maze.current.label) + '</p>'));
    const cells = (view.maze && view.maze.visibleCells) || [];
    if (!cells.length) { s.appendChild(el('<p class="hint center">Fog</p>')); return s; }
    const xs = cells.map((c) => c.x), ys = cells.map((c) => c.y);
    const minX = Math.min.apply(null, xs), minY = Math.min.apply(null, ys);
    const w = Math.max.apply(null, xs) - minX + 1, h = Math.max.apply(null, ys) - minY + 1;
    const grid = el('<div class="mapgrid" style="grid-template-columns:repeat(' + w + ',1fr)"></div>');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = cells.find((k) => k.x - minX === x && k.y - minY === y);
      grid.appendChild(el('<div class="mcell' + (c ? (c.here ? ' here' : c.peeked ? ' peeked' : ' seen') : ' fog') + '">' + (c ? escapeHtml(c.label) : '') + '</div>'));
    }
    s.appendChild(grid);
    s.appendChild(el('<p class="hint center">' + I().icon('fog') + ' ' + ((view.maze && view.maze.fogHiddenCount) || 0) + ' hidden</p>'));
    return s;
  }

  function abilityTab(view, handlers) {
    const s = el('<section class="stage"></section>');
    s.appendChild(el('<h1 class="prompt">' + escapeHtml(view.me.roleName) + '</h1>'));
    (view.abilities || []).forEach((a) => {
      const b = bigBtn(I().icon(a.icon || 'star') + ' ' + escapeHtml(a.label) + ' <span class="uses">' + a.usesLeft + ' left</span>', 'btn-primary', () => handlers.ability(a), 'data-act="ability"' + (a.usesLeft < 1 ? ' disabled' : ''));
      s.appendChild(b);
      if (a.hint) s.appendChild(el('<p class="hint center">' + escapeHtml(a.hint) + '</p>'));
    });
    return s;
  }

  function menuSheet(view, handlers, rerender) {
    const m = el('<div class="sheet" data-sheet="menu"></div>');
    if (view.me.isHost) m.appendChild(bigBtn('End round', 'btn-primary', () => { RS.menu = false; handlers.endRound(); }, 'data-act="end-round"'));
    else m.appendChild(el('<p class="hint center">Host ends the round</p>'));
    m.appendChild(bigBtn(I().icon('home') + ' Home', '', () => { RS.menu = false; handlers.home(); }, 'data-act="back"'));
    m.appendChild(bigBtn('Close', '', () => { RS.menu = false; rerender(); }, 'data-act="menu-close"'));
    return m;
  }

  function roundScreen(view, handlers) {
    const rerender = handlers.rerender || function () {};
    if (RS.round !== view.roundIndex) {
      Object.assign(RS, { round: view.roundIndex, step: 'talk', tab: 'play', door: null, pending: null, fb: null, menu: false });
    }
    resolvePending(view);
    const frag = document.createElement('div');
    frag.className = 'game';
    frag.appendChild(gameTopbar(view, handlers, rerender));
    const body = el('<main class="gbody"></main>');
    if (RS.menu) body.appendChild(menuSheet(view, handlers, rerender));
    else if (RS.tab === 'clues') body.appendChild(cluesTab(view));
    else if (RS.tab === 'map') body.appendChild(mapTab(view));
    else if (RS.tab === 'ability') body.appendChild(abilityTab(view, handlers));
    else {
      body.appendChild(stepDots(RS.fb ? RS.fb.step === 'listen' ? 'listen' : 'door' : RS.step));
      if (RS.fb) body.appendChild(feedbackCard(rerender));
      else if (RS.step === 'talk') body.appendChild(talkStep(view, rerender));
      else if (RS.step === 'listen') body.appendChild(listenStep(view, handlers, rerender));
      else body.appendChild(doorStep(view, handlers, rerender));
    }
    frag.appendChild(body);
    frag.appendChild(tabBar(rerender));
    const out = document.createDocumentFragment();
    out.appendChild(frag);
    return out;
  }
  roundScreen._state = RS;

  function calloutScreen(view, handlers) {
    const frag = document.createDocumentFragment();
    frag.appendChild(topbar('Round callout', handlers.home));
    const panel = el('<div class="callout"></div>');
    panel.appendChild(el('<div class="tag">Closest to the key clues</div>'));
    const leaders = (view.callout && view.callout.leaders) || [];
    const names =
      leaders
        .map((l) => {
          const kc = l.keyClues != null ? l.keyClues : '?';
          const ts = l.tokensSpent != null ? l.tokensSpent : '?';
          return l.name + ' (' + kc + ' keys / ' + ts + ' guesses)';
        })
        .join(' · ') || '—';
    panel.appendChild(el('<div class="who">' + escapeHtml(names) + '</div>'));
    const board = el('<div style="margin-top:12px;text-align:left"></div>');
    ((view.callout && view.callout.board) || []).forEach((b) => {
      board.appendChild(
        el(
          '<div class="score-line"><span>' +
            escapeHtml(b.name) +
            '</span><strong>' +
            (b.keyClues != null ? b.keyClues : b.score) +
            ' / ' +
            (b.tokensSpent != null ? b.tokensSpent : '?') +
            '</strong></div>'
        )
      );
    });
    panel.appendChild(board);
    frag.appendChild(panel);
    const foot = el('<div class="footer-actions"></div>');
    if (view.me.isHost) {
      const next = el(
        '<button type="button" class="btn btn-primary btn-block">' +
          (view.roundIndex + 1 >= view.totalRounds ? 'Final answer' : 'Next round') +
          '</button>'
      );
      next.addEventListener('click', handlers.nextAfterCallout);
      foot.appendChild(next);
    } else {
      foot.appendChild(el('<p class="hint">Waiting for host…</p>'));
    }
    frag.appendChild(foot);
    return frag;
  }

  function finalScreen(view, handlers) {
    const frag = document.createDocumentFragment();
    frag.appendChild(topbar('Final answer', handlers.home));
    const panel = el('<div class="panel"></div>');
    panel.appendChild(el('<h2>Who has the key?</h2>'));
    panel.appendChild(
      el(
        '<p class="hint">Group pick. Votes ' +
          view.votesIn +
          '/' +
          view.votesNeeded +
          '.</p>'
      )
    );
    const list = el('<div class="list"></div>');
    (view.suspects || []).forEach((s) => {
      const b = el(
        '<button type="button" class="btn btn-block' +
          (view.myVote === s.id ? ' btn-primary' : '') +
          '">' +
          escapeHtml(s.name) +
          '</button>'
      );
      b.addEventListener('click', () => handlers.vote(s.id));
      list.appendChild(b);
    });
    panel.appendChild(list);
    frag.appendChild(panel);
    if (view.me.isHost) {
      const foot = el('<div class="footer-actions"></div>');
      const rev = el(
        '<button type="button" class="btn btn-primary btn-block"' +
          (view.votesIn < view.votesNeeded ? ' disabled' : '') +
          '>Reveal</button>'
      );
      rev.addEventListener('click', handlers.reveal);
      foot.appendChild(rev);
      frag.appendChild(foot);
    }
    return frag;
  }

  function revealScreen(view, handlers) {
    const frag = document.createDocumentFragment();
    frag.appendChild(topbar('Reveal', handlers.home));
    const r = view.reveal || {};
    const panel = el('<div class="panel" style="text-align:center"></div>');
    if (r.win) {
      panel.appendChild(el('<div class="reveal-win">You got it</div>'));
    } else {
      panel.appendChild(el('<div class="reveal-lose">Wrong call</div>'));
    }
    const correct = (view.suspects || []).find((s) => s.id === r.correctId);
    const picked = (view.suspects || []).find((s) => s.id === r.picked);
    panel.appendChild(
      el(
        '<p class="hint">Answer: <strong>' +
          escapeHtml(correct ? correct.name : '?') +
          '</strong>' +
          (r.tie ? ' · Vote tied' : ' · Group picked ' + escapeHtml(picked ? picked.name : '?')) +
          '</p>'
      )
    );
    const board = el('<div style="text-align:left;margin-top:12px"></div>');
    (r.board || []).forEach((b) => {
      board.appendChild(
        el(
          '<div class="score-line"><span>' +
            escapeHtml(b.name) +
            '</span><strong>' +
            b.score +
            '</strong></div>'
        )
      );
    });
    panel.appendChild(board);
    frag.appendChild(panel);
    (r.players || []).forEach((pl) => {
      const card = el('<div class="panel reveal-player"><h2>' + escapeHtml(pl.name) + '</h2></div>');
      if (!pl.clues.length) card.appendChild(el('<div class="tag">No clues</div>'));
      pl.clues.forEach((c) => {
        const tag = { key: 'Key', real: 'Real', herring: 'Herring', deadend: 'Dead end' }[c.kind];
        card.appendChild(el('<div class="card kind-' + c.kind + '"><span class="tag">' + tag + '</span><div>' + escapeHtml(c.text) + '</div></div>'));
      });
      pl.falseDoors.forEach((d) => {
        card.appendChild(el('<div class="card kind-false"><span class="tag">False trail door</span><div>' + escapeHtml(d.label) + '</div></div>'));
      });
      frag.appendChild(card);
    });
    const foot = el('<div class="footer-actions"></div>');
    const again = el('<button type="button" class="btn btn-primary btn-block">Home</button>');
    again.addEventListener('click', handlers.home);
    foot.appendChild(again);
    frag.appendChild(foot);
    return frag;
  }

  function modalPicker(title, hint, options, onPick, onClose) {
    const back = el('<div class="modal-back"></div>');
    const modal = el('<div class="modal"></div>');
    modal.appendChild(el('<h2>' + escapeHtml(title) + '</h2>'));
    if (hint) modal.appendChild(el('<p class="hint">' + escapeHtml(hint) + '</p>'));
    const list = el('<div class="list"></div>');
    if (!options.length) {
      list.appendChild(el('<div class="card">Nothing to pick</div>'));
    }
    options.forEach((opt) => {
      const b = el(
        '<button type="button" class="btn btn-block">' +
          escapeHtml(opt.label) +
          '</button>'
      );
      b.addEventListener('click', () => {
        onPick(opt);
        back.remove();
      });
      list.appendChild(b);
    });
    modal.appendChild(list);
    const cancel = el('<button type="button" class="btn btn-ghost btn-block" style="margin-top:8px">Cancel</button>');
    cancel.addEventListener('click', () => {
      back.remove();
      if (onClose) onClose();
    });
    modal.appendChild(cancel);
    back.appendChild(modal);
    back.addEventListener('click', (e) => {
      if (e.target === back) {
        back.remove();
        if (onClose) onClose();
      }
    });
    document.body.appendChild(back);
    return back;
  }

  global.CoopUI = {
    mount: mount,
    clear: clear,
    homeScreen: homeScreen,
    joinScreen: joinScreen,
    lobbyScreen: lobbyScreen,
    roundScreen: roundScreen,
    calloutScreen: calloutScreen,
    finalScreen: finalScreen,
    revealScreen: revealScreen,
    modalPicker: modalPicker,
    errorBanner: errorBanner,
    escapeHtml: escapeHtml
  };
})(typeof window !== 'undefined' ? window : globalThis);
