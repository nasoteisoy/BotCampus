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
    panel.appendChild(el('<p class="hint">Hear lines. Ask spaces. Fog hides the rest.</p>'));
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


  function roundScreen(view, handlers) {
    const frag = document.createDocumentFragment();
    const crumb =
      view.mysteryTitle +
      ' · R' +
      (view.roundIndex + 1) +
      '/' +
      view.totalRounds +
      ' · ' +
      view.me.roleName;
    frag.appendChild(topbar(crumb, handlers.home));

    // Tokens
    const tok = el('<div class="panel tok-bar"></div>');
    tok.appendChild(
      el(
        '<h2>' +
          I().icon('key') +
          ' Tokens · ' +
          view.tokens +
          ' <span class="uses">spent ' +
          view.tokensSpent +
          '</span></h2>'
      )
    );
    tok.appendChild(el('<p class="hint">Ask costs 1. Wall costs +1. Wrong hear costs 1.</p>'));
    frag.appendChild(tok);

    // Talking points
    const talk = el('<div class="panel"></div>');
    talk.appendChild(el('<h2>' + I().icon('talk') + ' Say these</h2>'));
    talk.appendChild(el('<p class="hint">Read them out. Not labeled as clues.</p>'));
    const talkList = el('<div class="list"></div>');
    (view.talkingPoints || []).forEach((t) => {
      talkList.appendChild(el('<div class="card"><strong>' + escapeHtml(t.text) + '</strong></div>'));
    });
    talk.appendChild(talkList);
    frag.appendChild(talk);

    if (view.botLines && view.botLines.length) {
      const bots = el('<div class="panel"></div>');
      bots.appendChild(el('<h2>' + I().icon('users') + ' Bots said</h2>'));
      bots.appendChild(el('<p class="hint">Match a line, then ask a space.</p>'));
      view.botLines.forEach((b) => {
        const c = el('<div class="card"><span class="tag">' + escapeHtml(b.name) + '</span></div>');
        b.lines.forEach((line) => c.appendChild(el('<div>' + escapeHtml(line) + '</div>')));
        bots.appendChild(c);
      });
      frag.appendChild(bots);
    }

    // Hear
    const hear = el('<div class="panel"></div>');
    hear.appendChild(el('<h2>' + I().icon('hear') + ' I heard…</h2>'));
    hear.appendChild(el('<p class="hint">Opens gated exits. Wrong pick costs a token.</p>'));
    const hearBtn = el('<button type="button" class="btn btn-primary btn-block">I heard…</button>');
    hearBtn.addEventListener('click', () => handlers.openHear(view.hearOptions));
    hear.appendChild(hearBtn);
    if (view.heardPhraseIds && view.heardPhraseIds.length) {
      hear.appendChild(
        el('<div class="tag" style="margin-top:8px">Heard ' + view.heardPhraseIds.length + ' line(s)</div>')
      );
    }
    if (view.forcedShow && view.forcedShow.text) {
      hear.appendChild(
        el(
          '<div class="card good" style="margin-top:8px"><span class="tag">Forced ask</span><div><strong>' +
            escapeHtml(view.forcedShow.text) +
            '</strong></div></div>'
        )
      );
    }
    frag.appendChild(hear);

    // Maze
    const maze = view.maze || {};
    const map = el('<div class="panel"></div>');
    map.appendChild(el('<h2>' + I().icon('map') + ' Your maze</h2>'));
    map.appendChild(
      el(
        '<p class="hint">Fog hides the rest · ' +
          (maze.fogHiddenCount || 0) +
          ' hidden</p>'
      )
    );

    const cur = maze.current || { label: '?', question: '' };
    map.appendChild(
      el(
        '<div class="card good"><span class="tag">Here · ' +
          escapeHtml(cur.label) +
          '</span><div><strong>' +
          escapeHtml(cur.question) +
          '</strong></div></div>'
      )
    );

    // Compass exits
    const pad = el('<div class="compass" aria-label="Exits"></div>');
    const byDir = {};
    (maze.exits || []).forEach((e) => {
      byDir[e.dir] = e;
    });
    ['N', 'W', 'E', 'S'].forEach((d) => {
      const e = byDir[d] || { kind: 'wall', label: null };
      const cls =
        'compass-cell dir-' +
        d +
        (e.kind === 'wall' ? ' is-wall' : '') +
        (e.kind === 'fog' ? ' is-fog' : '') +
        (e.kind === 'locked' ? ' is-locked' : '');
      let label = d;
      if (e.kind === 'wall') label = d + ' · Wall';
      else if (e.kind === 'fog') label = d + ' · ???';
      else if (e.kind === 'locked') label = d + ' · Locked';
      else label = d + ' · ' + (e.label || 'Exit');
      pad.appendChild(el('<div class="' + cls + '">' + escapeHtml(label) + '</div>'));
    });
    map.appendChild(pad);

    // Mini trail (visited only)
    if (maze.visibleCells && maze.visibleCells.length) {
      const trail = el('<div class="trail"></div>');
      maze.visibleCells.forEach((c) => {
        trail.appendChild(
          el(
            '<span class="trail-dot' +
              (c.here ? ' here' : '') +
              (c.peeked ? ' peeked' : '') +
              '" title="' +
              escapeHtml(c.label) +
              '">' +
              escapeHtml(c.label) +
              '</span>'
          )
        );
      });
      map.appendChild(trail);
    }

    // Responses (ask)
    map.appendChild(el('<h2 style="margin-top:12px">Ask this space</h2>'));
    const respList = el('<div class="list"></div>');
    const resps = maze.responses || [];
    if (!resps.length) {
      respList.appendChild(el('<div class="card">No open asks — hear a line first.</div>'));
    }
    resps.forEach((r) => {
      const b = el(
        '<button type="button" class="btn btn-block' +
          (r.locked ? '' : '') +
          '" ' +
          (r.locked || view.tokens < 1 ? 'disabled' : '') +
          '>' +
          (r.dir ? r.dir + ' · ' : '') +
          escapeHtml(r.text) +
          (r.locked ? ' · Locked' : '') +
          '</button>'
      );
      b.addEventListener('click', () => handlers.askResponse(r.id));
      respList.appendChild(b);
    });
    map.appendChild(respList);

    if (view.lastWall) {
      map.appendChild(
        el(
          '<div class="card wall" style="margin-top:8px">' +
            I().icon('wall') +
            ' <span class="tag wall">Dead end</span><div>' +
            escapeHtml(view.lastWall.clueText || view.lastWall.text) +
            '</div></div>'
        )
      );
    }
    frag.appendChild(map);

    // Clues found
    const cl = el('<div class="panel"></div>');
    cl.appendChild(el('<h2>Clues on your map</h2>'));
    cl.appendChild(el('<p class="hint">Only what you unlocked.</p>'));
    if (!(view.clues || []).length) {
      cl.appendChild(el('<div class="tag">None yet</div>'));
    }
    (view.clues || []).forEach((c) => {
      if (c.deadEnd) {
        cl.appendChild(
          el(
            '<div class="card wall">' +
              I().icon('wall') +
              ' <span class="tag wall">Dead end</span><div>' +
              escapeHtml(c.text) +
              '</div></div>'
          )
        );
      } else {
        cl.appendChild(
          el(
            '<div class="card good"><span class="tag' +
              (c.verified ? ' verified' : '') +
              '">' +
              (c.verified ? 'Verified' : 'Clue') +
              '</span><div>' +
              escapeHtml(c.text) +
              '</div></div>'
          )
        );
      }
    });
    frag.appendChild(cl);

    // Abilities
    const ab = el('<div class="panel"></div>');
    ab.appendChild(el('<h2>Abilities</h2>'));
    ab.appendChild(el('<p class="hint">One use each this round.</p>'));
    const row = el('<div class="ability-row"></div>');
    (view.abilities || []).forEach((a) => {
      const b = el(
        '<button type="button" class="btn" ' +
          (a.usesLeft < 1 ? 'disabled' : '') +
          '>' +
          I().icon(a.icon || 'star') +
          ' ' +
          escapeHtml(a.label) +
          ' · ' +
          a.usesLeft +
          '</button>'
      );
      b.title = a.hint || '';
      b.addEventListener('click', () => handlers.ability(a));
      row.appendChild(b);
    });
    ab.appendChild(row);
    frag.appendChild(ab);

    const foot = el('<div class="footer-actions"></div>');
    if (view.me.isHost) {
      const end = el('<button type="button" class="btn btn-block">End round</button>');
      end.addEventListener('click', handlers.endRound);
      foot.appendChild(end);
    } else {
      foot.appendChild(el('<p class="hint">Host ends the round.</p>'));
    }
    frag.appendChild(foot);
    return frag;
  }

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
          return l.name + ' (' + kc + ' keys / ' + ts + ' tok)';
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
