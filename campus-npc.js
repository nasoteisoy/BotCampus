/*! Campus NPC FSM (Dev B) — npc1
 * Living map characters driven by campus-state.json.
 * HARD FAILS baked:
 *  - no walk-in-place (anim follows velocity + debounce)
 *  - no idle while pathing; no busy pose at wrong place
 *  - station VFX match kind (code/art/research/permission)
 *  - per-bot personality kits
 *  - mute-safe emotion spikes
 * Android Chrome + Windows. rAF tick; poll only retargets.
 */
(function (global) {
  'use strict';

  var ARRIVE_PX = 22;
  var MOVE_EPS = 8; // px/s — below this = standing
  var BASE_SPEED = 130;
  var RUN_MULT = 1.75;
  var EMOTION_MS = 800;
  var WALK_FRAME_MS = 170;
  var IDLE_DEBOUNCE_MS = 100;
  var FIDGET_MAX = 10;

  var KIND_GLYPH = { code: '💻', art: '🎨', research: '📚', permission: '🙏' };
  var KIND_BUSY = { code: '⚡', art: '🖌️', research: '🔎', permission: '🚨' };
  var KIND_VFX_CLASS = { code: 'vfx-code', art: 'vfx-art', research: 'vfx-research', permission: 'vfx-permission' };

  var agents = new Map();
  var stationEls = new Map();
  var occupied = new Set();
  var ctx = null;
  var lastTs = 0;
  var rafId = 0;
  var started = false;

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function worldFromPct(left, top, world) {
    return { x: (left / 100) * world.w, y: (top / 100) * world.h };
  }
  function pctFromWorld(x, y, world) {
    return {
      left: clamp((x / world.w) * 100, 2, 98),
      top: clamp((y / world.h) * 100, 2, 98)
    };
  }

  function deskById(state, id) {
    if (!id || !state || !state.desks) return null;
    for (var i = 0; i < state.desks.length; i++) if (state.desks[i].id === id) return state.desks[i];
    return null;
  }
  function stationById(state, id) {
    if (!id || !state || !state.stations) return null;
    for (var i = 0; i < state.stations.length; i++) if (state.stations[i].id === id) return state.stations[i];
    return null;
  }

  function normalizePersonality(p) {
    p = p || {};
    var walk = p.walk || 'measured';
    var speed = p.speed;
    if (speed == null) {
      if (walk === 'saunter') speed = 0.85;
      else if (walk === 'hurry') speed = 1.2;
      else speed = 1.0;
    }
    return {
      vibe: p.vibe || '',
      idle: p.idle || '',
      walk: walk,
      emotionBias: p.emotionBias || p.emotion_bias || 'neutral',
      accessory: p.accessory || '',
      preferredStation: p.preferredStation || p.station || null,
      speed: Number(speed) || 1,
      fidgetRate: p.fidgetRate != null ? Number(p.fidgetRate) : 0.25
    };
  }

  function pickBusyStationId(bot, entity, state) {
    var status = (entity && entity.status) || (bot && bot.status) || 'idle';
    if (status === 'needs_permission') return 'station-permission';
    if (entity && entity.stationId) return entity.stationId;
    var pers = normalizePersonality(bot && bot.personality);
    if (pers.preferredStation) {
      if (stationById(state, pers.preferredStation) || deskById(state, pers.preferredStation)) {
        return pers.preferredStation;
      }
    }
    var id = (bot && bot.id) || '';
    if (id.indexOf('researcher') === 0) return 'station-research';
    if (id.indexOf('render') === 0) return 'station-art';
    if (id.indexOf('dev') === 0 || id === 'leader') return 'station-code';
    return (bot && bot.deskId) || (entity && entity.atDeskId) || null;
  }

  function resolveTarget(bot, entity, state, isIntern) {
    var status = (entity && entity.status) || bot.status || 'idle';
    var homeId = (entity && entity.atDeskId) || bot.deskId;
    var jesusId = state.jesusDeskId || 'desk-jesus';

    if (status === 'needs_permission') {
      var pad = stationById(state, 'station-permission');
      if (pad) return { id: pad.id, x: pad.x, y: pad.y, kind: 'permission', urgent: true };
      var jd = deskById(state, jesusId);
      if (jd) return { id: jd.id, x: jd.x, y: jd.y, kind: 'permission', urgent: true };
    }

    if (status === 'working' || status === 'reviewing' || status === 'collaborating') {
      var sid = pickBusyStationId(bot, entity, state);
      var st = stationById(state, sid);
      if (st) return { id: st.id, x: st.x, y: st.y, kind: st.kind || 'code', urgent: false };
      var desk = deskById(state, sid) || deskById(state, homeId);
      if (desk) return { id: desk.id, x: desk.x, y: desk.y, kind: 'home', urgent: false };
    }

    var home = deskById(state, homeId) || deskById(state, bot.deskId);
    if (home) {
      var ox = 0, oy = 0;
      if (isIntern) {
        var h = 0;
        var s = String((entity && entity.id) || '');
        for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        var a = (Math.abs(h) % 360) * Math.PI / 180;
        ox = Math.cos(a) * 36;
        oy = Math.sin(a) * 28 + 40;
      } else {
        oy = -48;
      }
      return { id: home.id, x: home.x + ox, y: home.y + oy, kind: 'home', urgent: false };
    }
    return { id: null, x: 720, y: 400, kind: 'home', urgent: false };
  }

  function retargetKey(bot, entity) {
    var e = entity || {};
    return [
      e.status || bot.status || '',
      e.task || bot.task || '',
      e.atDeskId || bot.deskId || '',
      e.stationId || '',
      (bot.personality && bot.personality.preferredStation) || ''
    ].join('|');
  }

  function ensureStationDom(st, mapWorld) {
    var el = stationEls.get(st.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'station kind-' + (st.kind || 'code');
      el.dataset.stationId = st.id;
      el.innerHTML =
        '<span class="station-glyph" aria-hidden="true"></span>' +
        '<span class="station-label"></span>' +
        '<span class="station-vfx" aria-hidden="true"></span>';
      mapWorld.appendChild(el);
      stationEls.set(st.id, el);
    }
    var world = (ctx && ctx.world) || { w: 1440, h: 1120 };
    var pct = pctFromWorld(st.x, st.y, world);
    el.style.left = pct.left + '%';
    el.style.top = pct.top + '%';
    el.className = 'station kind-' + (st.kind || 'code') + (occupied.has(st.id) ? ' on' : '');
    // kind-specific VFX class (HARD FAIL #3)
    var vfx = el.querySelector('.station-vfx');
    vfx.className = 'station-vfx ' + (KIND_VFX_CLASS[st.kind] || '');
    vfx.textContent = occupied.has(st.id) ? (KIND_BUSY[st.kind] || '') : '';
    el.querySelector('.station-glyph').textContent = KIND_GLYPH[st.kind] || '📍';
    el.querySelector('.station-label').textContent = st.label || st.id;
    return el;
  }

  function renderStations(state) {
    if (!ctx || !ctx.mapWorld) return;
    var seen = new Set();
    (state.stations || []).forEach(function (st) {
      seen.add(st.id);
      ensureStationDom(st, ctx.mapWorld);
    });
    stationEls.forEach(function (el, id) {
      if (!seen.has(id)) { el.remove(); stationEls.delete(id); }
    });
  }

  function tryNpcFrame(bot, frameKey) {
    if (!ctx || !ctx.helpers) return null;
    var h = ctx.helpers;
    var entry = h.resolveCastEntry(bot, ctx.state);
    if (bot.sprites) {
      var mapKey = {
        idle: 'idle', busy: 'working',
        walk_a: 'working', walk_b: 'working',
        run_a: 'working', run_b: 'working',
        emotion_ready: 'ready_for_review',
        emotion_permission: 'needs_permission'
      }[frameKey];
      if (mapKey && bot.sprites[mapKey]) return './' + String(bot.sprites[mapKey]).replace(/^\.\//, '');
      if (bot.sprites[frameKey]) return './' + String(bot.sprites[frameKey]).replace(/^\.\//, '');
    }
    if (!entry) return null;
    return h.castSrc(entry, frameKey);
  }

  function fallbackStatusFrame(bot, status, isIntern) {
    if (!ctx || !ctx.helpers) return null;
    var h = ctx.helpers;
    var entry = h.resolveCastEntry(bot, ctx.state);
    if (isIntern) {
      if (status === 'needs_permission') {
        return h.castSrc(entry, 'needs_permission') || h.castSrc(entry, 'intern_idle');
      }
      return h.castSrc(entry, 'intern_idle');
    }
    return h.castSrc(entry, h.mainFrameForStatus(status));
  }

  function accessoryGlyph(pers) {
    if (!pers || !pers.accessory) return '';
    var a = pers.accessory;
    if (/cable|USB/i.test(a)) return '🔌';
    if (/clipboard|map/i.test(a)) return '📋';
    if (/wrench|tab/i.test(a)) return '🔧';
    if (/magnifier|stamp/i.test(a)) return '🔍';
    if (/paint|shield/i.test(a)) return '🖌️';
    if (/sparkle|spotlight/i.test(a)) return '✨';
    if (/QC|lightbox/i.test(a)) return '📎';
    if (/bookmark|paper/i.test(a)) return '📖';
    if (/sticky/i.test(a)) return '🗒️';
    if (/notebook|pencil/i.test(a)) return '📝';
    if (/index/i.test(a)) return '🗂️';
    return '•';
  }

  function emotionGlyph(kind, bias) {
    if (kind === 'permission') return '🚨';
    if (kind === 'ready') {
      if (bias === 'cheer') return '🎉';
      if (bias === 'grump') return '😤';
      if (bias === 'focus') return '✅';
      return '📋';
    }
    return '❗';
  }

  function applyFrame(agent, el) {
    if (!el || !ctx || !ctx.helpers) return;
    var h = ctx.helpers;
    var frame = agent.visualFrame || 'idle';
    var src = tryNpcFrame(agent.bot, frame);
    if (!src) src = fallbackStatusFrame(agent.bot, agent.status, agent.isIntern);
    h.setCastOrFallback(el, src, agent.bot.color || '#94a3b8',
      agent.isIntern ? 'i' : h.initials(agent.bot.name));

    var bubble = el.querySelector('.npc-emotion');
    if (!bubble) {
      bubble = document.createElement('span');
      bubble.className = 'npc-emotion';
      bubble.setAttribute('aria-hidden', 'true');
      (el.querySelector('.body') || el).appendChild(bubble);
    }
    if (agent.fsm === 'emotion' && agent.emotionKind) {
      bubble.textContent = emotionGlyph(agent.emotionKind, agent.personality && agent.personality.emotionBias);
      bubble.classList.add('show');
      bubble.classList.toggle('perm', agent.emotionKind === 'permission');
      bubble.classList.toggle('ready', agent.emotionKind === 'ready');
    } else {
      bubble.textContent = '';
      bubble.classList.remove('show', 'perm', 'ready');
    }

    var acc = el.querySelector('.npc-acc');
    if (!acc) {
      acc = document.createElement('span');
      acc.className = 'npc-acc';
      acc.setAttribute('aria-hidden', 'true');
      (el.querySelector('.body') || el).appendChild(acc);
    }
    if (agent.fsm === 'busy_at_station') {
      acc.textContent = KIND_BUSY[agent.targetKind] || '⚡';
    } else if (agent.fsm === 'idle') {
      acc.textContent = accessoryGlyph(agent.personality);
    } else {
      acc.textContent = '';
    }

    // FSM class for CSS (walk bob only while moving)
    el.classList.remove('npc-idle', 'npc-walk', 'npc-run', 'npc-busy', 'npc-emotion-flash');
    if (agent.fsm === 'idle') el.classList.add('npc-idle');
    else if (agent.fsm === 'walk') el.classList.add('npc-walk');
    else if (agent.fsm === 'run') el.classList.add('npc-run');
    else if (agent.fsm === 'busy_at_station') el.classList.add('npc-busy');
    else if (agent.fsm === 'emotion') el.classList.add('npc-emotion-flash');
  }

  function placeAgent(agent) {
    if (!ctx || !ctx.spriteEls) return;
    var el = ctx.spriteEls[agent.key];
    if (!el) return;
    el.classList.add('npc-fsm');
    var fidgetX = 0, fidgetY = 0;
    if (agent.fsm === 'idle') {
      fidgetX = agent._fx || 0;
      fidgetY = agent._fy || 0;
    }
    var pct = pctFromWorld(agent.x + fidgetX, agent.y + fidgetY, ctx.world);
    el.style.transition = 'none';
    el.style.left = pct.left + '%';
    el.style.top = pct.top + '%';
    var body = el.querySelector('.body');
    if (body) {
      // facing via scaleX; breath CSS still applies on .body — ok for idle
      if (agent.facing < 0) el.style.setProperty('--npc-face', '-1');
      else el.style.setProperty('--npc-face', '1');
    }
    applyFrame(agent, el);
  }

  function syncAgent(key, bot, entity, isIntern) {
    var state = ctx.state;
    var el = ctx.spriteEls[key];
    if (!el) return;

    var pers = normalizePersonality(bot.personality);
    var target = resolveTarget(bot, entity, state, isIntern);
    var status = (entity && entity.status) || bot.status || 'idle';
    var rk = retargetKey(bot, entity);
    var agent = agents.get(key);

    if (!agent) {
      var left = parseFloat(el.style.left);
      var top = parseFloat(el.style.top);
      var pos = (!isNaN(left) && !isNaN(top))
        ? worldFromPct(left, top, ctx.world)
        : { x: target.x, y: target.y };
      agent = {
        key: key, bot: bot, isIntern: !!isIntern,
        x: pos.x, y: pos.y, vx: 0, vy: 0, speed: 0,
        fsm: 'idle', status: status, personality: pers,
        targetId: target.id, targetX: target.x, targetY: target.y,
        targetKind: target.kind, urgent: !!target.urgent,
        retargetKey: rk, visualFrame: 'idle', framePhase: 0, frameAcc: 0,
        emotionUntil: 0, emotionKind: null, lastStatus: status,
        stillMs: 0, facing: 1, _fx: 0, _fy: 0,
        fidgetAcc: Math.random() * 2
      };
      agents.set(key, agent);
    } else {
      agent.bot = bot;
      agent.personality = pers;
      agent.status = status;
      if (agent.retargetKey !== rk) {
        agent.retargetKey = rk;
        agent.targetId = target.id;
        agent.targetX = target.x;
        agent.targetY = target.y;
        agent.targetKind = target.kind;
        agent.urgent = !!target.urgent;
        if (status === 'ready_for_review' && agent.lastStatus !== 'ready_for_review') {
          agent.fsm = 'emotion';
          agent.emotionKind = 'ready';
          agent.emotionUntil = performance.now() + EMOTION_MS;
          agent.visualFrame = 'emotion_ready';
        } else if (status === 'needs_permission' && agent.lastStatus !== 'needs_permission') {
          agent.fsm = 'emotion';
          agent.emotionKind = 'permission';
          agent.emotionUntil = performance.now() + EMOTION_MS;
          agent.visualFrame = 'emotion_permission';
        }
        agent.lastStatus = status;
      }
    }
  }

  function syncFromState() {
    if (!ctx || !ctx.state) return;
    var state = ctx.state;
    var seen = new Set();
    occupied = new Set();

    (state.bots || []).forEach(function (bot) {
      var mainKey = 'main:' + bot.id;
      seen.add(mainKey);
      syncAgent(mainKey, bot, bot.main || bot, false);
      (bot.interns || []).forEach(function (intern) {
        var key = 'intern:' + bot.id + ':' + intern.id;
        seen.add(key);
        syncAgent(key, bot, intern, true);
      });
    });

    agents.forEach(function (_a, key) {
      if (!seen.has(key)) agents.delete(key);
    });

    agents.forEach(function (a) {
      if (a.fsm === 'busy_at_station' && a.targetId && String(a.targetId).indexOf('station-') === 0) {
        occupied.add(a.targetId);
      }
    });
    renderStations(state);
  }

  function pickLocomoteFrame(agent, running) {
    var phase = agent.framePhase & 1;
    if (running) return phase ? 'run_b' : 'run_a';
    return phase ? 'walk_b' : 'walk_a';
  }

  function tickAgent(agent, dt) {
    var now = performance.now();
    var pers = agent.personality || normalizePersonality(null);
    var status = agent.status || 'idle';

    // Emotion flash (mute-safe big glyph) — HARD FAIL #5
    if (agent.fsm === 'emotion' && now < agent.emotionUntil) {
      agent.visualFrame = agent.emotionKind === 'permission' ? 'emotion_permission' : 'emotion_ready';
      agent.speed = 0;
      placeAgent(agent);
      return;
    }
    if (agent.fsm === 'emotion' && now >= agent.emotionUntil) {
      agent.emotionKind = null;
    }

    var dx = agent.targetX - agent.x;
    var dy = agent.targetY - agent.y;
    var dist = Math.hypot(dx, dy);
    var busyStatuses = status === 'working' || status === 'reviewing' || status === 'collaborating';
    var wantRun = !!agent.urgent || status === 'needs_permission' || pers.speed >= 1.2 || dist > 320;

    if (dist > ARRIVE_PX) {
      // PATHING — never idle pose, never busy pose (HARD FAIL #2)
      var spd = BASE_SPEED * (pers.speed || 1) * (wantRun ? RUN_MULT : 1);
      var step = spd * dt;
      if (step >= dist) {
        agent.x = agent.targetX;
        agent.y = agent.targetY;
        agent.vx = 0; agent.vy = 0; agent.speed = 0;
        agent.stillMs += dt * 1000;
      } else {
        agent.vx = (dx / dist) * spd;
        agent.vy = (dy / dist) * spd;
        agent.x += agent.vx * dt;
        agent.y += agent.vy * dt;
        agent.speed = spd;
        agent.stillMs = 0;
        if (dx !== 0) agent.facing = dx < 0 ? -1 : 1;
      }

      // HARD FAIL #1: walk anim ONLY while velocity > eps
      if (agent.speed > MOVE_EPS) {
        agent.fsm = wantRun ? 'run' : 'walk';
        agent.frameAcc += dt * 1000;
        if (agent.frameAcc >= WALK_FRAME_MS) {
          agent.frameAcc = 0;
          agent.framePhase = (agent.framePhase + 1) & 1;
        }
        agent.visualFrame = pickLocomoteFrame(agent, agent.fsm === 'run');
      } else {
        // standing during path settle — idle frame, not walk-in-place
        agent.fsm = 'idle';
        agent.visualFrame = 'idle';
      }
    } else {
      agent.x = agent.targetX;
      agent.y = agent.targetY;
      agent.vx = 0; agent.vy = 0; agent.speed = 0;
      agent.stillMs += dt * 1000;

      // debounce after arrive — no walk while standing
      if (agent.stillMs < IDLE_DEBOUNCE_MS && (agent.fsm === 'walk' || agent.fsm === 'run')) {
        agent.fsm = 'idle';
        agent.visualFrame = 'idle';
        placeAgent(agent);
        return;
      }

      if (busyStatuses) {
        // ONLY busy when arrived at target station (HARD FAIL #2)
        agent.fsm = 'busy_at_station';
        agent.visualFrame = 'busy';
        if (agent.targetId && String(agent.targetId).indexOf('station-') === 0) {
          occupied.add(agent.targetId);
        }
      } else if (status === 'needs_permission') {
        agent.fsm = 'idle';
        agent.visualFrame = 'emotion_permission';
      } else {
        // idle / ready — chill, NO fake busy (MUST-HAVE)
        agent.fsm = 'idle';
        agent.visualFrame = 'idle';
        agent.fidgetAcc += dt;
        var rate = pers.fidgetRate || 0.25;
        if (agent.fidgetAcc > (1.2 - rate)) {
          agent.fidgetAcc = 0;
          if (Math.random() < rate + 0.15) {
            agent._fx = (Math.random() - 0.5) * FIDGET_MAX * rate * 4;
            agent._fy = (Math.random() - 0.5) * FIDGET_MAX * rate * 3;
          } else {
            agent._fx *= 0.4;
            agent._fy *= 0.4;
          }
        }
      }
    }
    placeAgent(agent);
  }

  function frame(ts) {
    rafId = requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    if (!ctx) return;
    occupied = new Set();
    agents.forEach(function (agent) { tickAgent(agent, dt); });
    if (ctx.state) renderStations(ctx.state);
  }

  function start() {
    if (started) return;
    started = true;
    rafId = requestAnimationFrame(frame);
  }

  function sync(nextCtx) {
    ctx = nextCtx || ctx;
    if (!ctx || !ctx.state) return;
    if (!ctx.world) ctx.world = { w: 1440, h: 1120 };
    syncFromState();
    start();
  }

  global.CampusNpc = {
    version: 'npc1',
    ownsPositions: true,
    sync: sync,
    agents: agents,
    pickBusyStationId: pickBusyStationId,
    normalizePersonality: normalizePersonality
  };
})(typeof window !== 'undefined' ? window : globalThis);
