/*! Campus NPC FSM (Dev B) — npc5b (Dev A collision/host assist)
 * Living map characters driven by campus-state.json.
 * HARD FAILS baked:
 *  - no walk-in-place (anim follows velocity + debounce + stuck detect)
 *  - no idle while pathing; no busy pose at wrong place
 *  - station VFX match kind (code/art/research/permission)
 *  - per-bot personality kits
 *  - mute-safe emotion spikes (pulse while ready/permission holds)
 *  - first spawn ALWAYS at desk (never station) so mute-10s shows pathing
 * npc3: larger intern radii, soft separation, Jesus/home loc badges
 * npc4: per-bot craft slots (no stacks), truthful loc badges, permission RUN+pad.on
 * npc5: mains INNER / interns OUTER|owner-orbit slots; sep 130/100/80;
 *       stuck walk→idle/retarget; banner on-arrive-only (host)
 * npc5 Dev A: hold stuck-nudge vs slot overwrite; post-sep frameDisp walk clear; slotAround export
 * Android Chrome + Windows. rAF tick; poll only retargets.
 */
(function (global) {
  'use strict';

  var ARRIVE_PX = 22;
  var MOVE_EPS = 8; // px/s — below this = standing
  var BASE_SPEED = 130;
  var RUN_MULT = 1.75;
  var EMOTION_MS = 800;
  var EMOTION_PULSE_MS = 2600; // soft re-spike while ready/permission holds
  var WALK_FRAME_MS = 170;
  var IDLE_DEBOUNCE_MS = 100;
  var FIDGET_MAX = 10;
  var SLOT_MIN_DIST = 130; // world px between MAIN craft ARRIVE slots (inner ring)
  var SLOT_INTERN_RING = 200; // outer ring start for interns around station
  var OWNER_ORBIT_R = 125; // intern orbit around owner main (>= main body)
  var SEP_MAIN = 130;
  var SEP_MIX = 100;
  var SEP_INTERN = 80;
  var STUCK_MS = 500;
  var STUCK_DISP_PX = 2;
  var HOME_ARRIVE_BADGE = 100;
  var STATION_NEAR_BADGE = 150;

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
      // Prefer craft stations over home desks so working bots actually path
      if (stationById(state, pers.preferredStation)) {
        return pers.preferredStation;
      }
      // desk preferredStation only when idle/home — for busy, fall through to role default
    }
    var id = (bot && bot.id) || '';
    if (id.indexOf('researcher') === 0) return 'station-research';
    if (id.indexOf('render') === 0) return 'station-art';
    if (id.indexOf('dev') === 0 || id === 'leader') return 'station-code';
    return (bot && bot.deskId) || (entity && entity.atDeskId) || null;
  }

  function homeSpawnPos(bot, entity, state, isIntern) {
    var homeId = (entity && entity.atDeskId) || bot.deskId;
    var home = deskById(state, homeId) || deskById(state, bot.deskId);
    if (!home) return null;
    var ox = 0, oy = 0;
    if (isIntern) {
      var h = 0;
      var s = String((entity && entity.id) || '');
      for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
      var a = (Math.abs(h) % 360) * Math.PI / 180;
      // Clear of main body (~104px) — orbit past main desk slot
      ox = Math.cos(a) * 110;
      oy = Math.sin(a) * 88 + 96;
    } else {
      oy = -72;
    }
    return { x: home.x + ox, y: home.y + oy };
  }

  /** Inner ring for MAINS — spaced so chord >= SLOT_MIN_DIST. */
  function mainSlotOffset(index, mainCount) {
    var n = Math.max(mainCount || 1, 1);
    // Prefer even spread on a circle sized for min chord
    var baseR = Math.max(SLOT_MIN_DIST * 1.1, (SLOT_MIN_DIST / (2 * Math.sin(Math.PI / Math.max(n, 2)))) * 1.05);
    if (n === 1) baseR = SLOT_MIN_DIST * 0.85;
    var ring = Math.floor(index / Math.max(n, 6));
    var i = index % Math.max(n, 1);
    var per = Math.max(n, 1);
    baseR += ring * SLOT_MIN_DIST * 1.15;
    var a = -Math.PI / 2 + (i / per) * Math.PI * 2 + ring * 0.2;
    return { x: Math.cos(a) * baseR, y: Math.sin(a) * baseR * 0.92 };
  }

  /** Outer ring for interns — always past main ring so never bury a main. */
  function internStationOffset(index, mainCount) {
    var perRing = 8;
    var ring = Math.floor(index / perRing);
    var i = index % perRing;
    var mainR = Math.max(SLOT_MIN_DIST * 1.1, (SLOT_MIN_DIST / (2 * Math.sin(Math.PI / Math.max(mainCount || 2, 2)))) * 1.05);
    var baseR = Math.max(SLOT_INTERN_RING, mainR + 110) + ring * 100;
    var a = -Math.PI / 2 + (i / perRing) * Math.PI * 2 + ring * 0.22 + 0.35;
    return { x: Math.cos(a) * baseR, y: Math.sin(a) * baseR * 0.9 + 18 };
  }

  /** Orbit around owner main — home desks / single-main stations only. */
  function ownerOrbitOffset(index, count) {
    var n = Math.max(count || 1, 3);
    var a = -Math.PI / 2 + (index / n) * Math.PI * 2 + 0.4;
    var r = OWNER_ORBIT_R + Math.floor(index / n) * 70;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.88 + 12 };
  }

  function ownerMainKey(internAgent) {
    var parts = String(internAgent.key || '').split(':');
    if (parts.length >= 2 && parts[0] === 'intern') return 'main:' + parts[1];
    return null;
  }

  function holdStuckNudge(a) {
    return a && a._slotKind === 'stuck-nudge' && (a.fsm === 'walk' || a.fsm === 'run');
  }

  /**
   * Craft/permission ARRIVE slots: mains INNER; interns OUTER (clear of mains).
   * Owner-orbit only when a single main shares the station. Dev A may refine.
   */
  function applyCraftSlots() {
    if (!ctx || !ctx.state) return;
    var groups = {};
    agents.forEach(function (a) {
      var tid = a.targetId;
      if (!tid || String(tid).indexOf('station-') !== 0) return;
      (groups[tid] = groups[tid] || []).push(a);
    });
    Object.keys(groups).forEach(function (tid) {
      var list = groups[tid];
      var st = stationById(ctx.state, tid);
      if (!st) return;
      var mains = [];
      var interns = [];
      list.forEach(function (a) {
        if (a.isIntern) interns.push(a); else mains.push(a);
      });
      mains.sort(function (a, b) {
        return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);
      });
      interns.sort(function (a, b) {
        return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);
      });

      var mc = mains.length;
      mains.forEach(function (a, i) {
        if (holdStuckNudge(a)) return;
        var off = mainSlotOffset(i, mc);
        a.targetX = st.x + off.x;
        a.targetY = st.y + off.y;
        a.slotIndex = i;
        a._slotKind = 'main-inner';
      });

      // Crowded multi-main stations: ALL interns on OUTER ring (never under a main).
      // Single-main: owner-orbit is fine (>= OWNER_ORBIT_R).
      if (mc <= 1 && mains.length === 1) {
        var owner = mains[0];
        interns.forEach(function (a, i) {
          if (holdStuckNudge(a)) return;
          var off = ownerOrbitOffset(i, interns.length);
          a.targetX = owner.targetX + off.x;
          a.targetY = owner.targetY + off.y;
          a.slotIndex = i;
          a._slotKind = 'owner-orbit';
        });
      } else {
        interns.forEach(function (a, i) {
          if (holdStuckNudge(a)) return;
          var off = internStationOffset(i, Math.max(mc, 2));
          a.targetX = st.x + off.x;
          a.targetY = st.y + off.y;
          a.slotIndex = i;
          a._slotKind = 'intern-outer';
        });
      }
    });
  }

  /** Home-desk slots: mains north of desk; interns clear orbit. */
  function applyHomeSlots() {
    if (!ctx || !ctx.state) return;
    var groups = {};
    agents.forEach(function (a) {
      if (!a.targetId || String(a.targetId).indexOf('desk-') !== 0) return;
      if (a.targetKind && a.targetKind !== 'home') return;
      (groups[a.targetId] = groups[a.targetId] || []).push(a);
    });
    Object.keys(groups).forEach(function (tid) {
      var desk = deskById(ctx.state, tid);
      if (!desk) return;
      var list = groups[tid];
      var mains = [];
      var interns = [];
      list.forEach(function (a) {
        if (a.isIntern) interns.push(a); else mains.push(a);
      });
      mains.sort(function (a, b) {
        return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);
      });
      interns.sort(function (a, b) {
        return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);
      });
      mains.forEach(function (a, i) {
        if (holdStuckNudge(a)) return;
        a.targetX = desk.x + (i - (mains.length - 1) / 2) * 36;
        a.targetY = desk.y - 72;
        a._slotKind = 'home-main';
      });
      var mainByKey = {};
      mains.forEach(function (a) { mainByKey[a.key] = a; });
      var oi = 0;
      interns.forEach(function (a) {
        if (holdStuckNudge(a)) { oi++; return; }
        var ok = ownerMainKey(a);
        var owner = ok && mainByKey[ok];
        var off = ownerOrbitOffset(oi, Math.max(interns.length, 3));
        if (owner) {
          a.targetX = owner.targetX + off.x;
          a.targetY = owner.targetY + off.y;
          a._slotKind = 'home-orbit';
        } else {
          var a2 = -Math.PI / 2 + (oi / Math.max(interns.length, 1)) * Math.PI * 2;
          a.targetX = desk.x + Math.cos(a2) * 110;
          a.targetY = desk.y + Math.sin(a2) * 88 + 96;
          a._slotKind = 'home-outer';
        }
        oi++;
      });
    });
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
        ox = Math.cos(a) * 110;
        oy = Math.sin(a) * 88 + 96;
      } else {
        oy = -72;
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
      el.dataset.id = st.id;
      el.id = st.id === 'station-permission' ? 'station-permission' : undefined;
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
    if (st.id === 'station-permission') el.id = 'station-permission';
    el.dataset.stationId = st.id;
    el.dataset.id = st.id;
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
    // Mute-readable: while ready/permission holds, keep emotion visible (soft pulse),
    // plus full .show spike on transition / periodic re-spike.
    var emoKind = agent.emotionKind;
    var st = agent.status || '';
    var holdEmo = (st === 'ready_for_review' || st === 'needs_permission') && emoKind;
    var spike = (agent.fsm === 'emotion' || agent._emoPulseOn) && emoKind;
    if (holdEmo || spike) {
      if (!emoKind) emoKind = st === 'needs_permission' ? 'permission' : 'ready';
      bubble.textContent = emotionGlyph(emoKind, agent.personality && agent.personality.emotionBias);
      bubble.classList.add('show');
      bubble.classList.toggle('perm', emoKind === 'permission');
      bubble.classList.toggle('ready', emoKind === 'ready');
      // persistent soft pulse while holding; full pop when spiking
      bubble.classList.toggle('pulse-hold', holdEmo && !spike);
    } else {
      bubble.textContent = '';
      bubble.classList.remove('show', 'perm', 'ready', 'pulse-hold');
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


  function jesusZoneRect(state) {
    var zones = (state && state.zones) || [];
    for (var i = 0; i < zones.length; i++) if (zones[i].id === 'jesus') return zones[i];
    var jd = deskById(state, (state && state.jesusDeskId) || 'desk-jesus');
    if (jd) return { x: jd.x - 220, y: jd.y - 90, w: 440, h: 240 };
    return null;
  }

  function pointInZone(x, y, z) {
    if (!z) return false;
    return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
  }

  /** Truthful loc badge from AGENT POSITION — never home while piled at a craft station. */
  function updateLocBadge(agent) {
    if (!ctx || !ctx.helpers || !ctx.helpers.setLocBadge) return;
    var el = ctx.spriteEls && ctx.spriteEls[agent.key];
    if (!el) return;
    var state = ctx.state || {};
    var z = jesusZoneRect(state);
    var pad = stationById(state, 'station-permission');
    var homeDesk = deskById(state, agent.bot && agent.bot.deskId);
    var homeLabel = (homeDesk && homeDesk.label) || (agent.bot && agent.bot.name) || 'home';

    // @ Jesus — only when physically in Jesus zone / on permission pad
    var atPad = pad && Math.hypot(agent.x - pad.x, agent.y - pad.y) < 100;
    var inJesus = pointInZone(agent.x, agent.y, z);
    if (atPad || inJesus) {
      ctx.helpers.setLocBadge(el, 'jesus');
      return;
    }

    // at {station} — near a craft station (not permission)
    var stations = state.stations || [];
    var nearestSt = null;
    var nearestD = Infinity;
    for (var i = 0; i < stations.length; i++) {
      var st = stations[i];
      if (!st || st.kind === 'permission') continue;
      var d = Math.hypot(agent.x - st.x, agent.y - st.y);
      if (d < nearestD) { nearestD = d; nearestSt = st; }
    }
    var dHome = homeDesk ? Math.hypot(agent.x - homeDesk.x, agent.y - homeDesk.y) : Infinity;
    if (nearestSt && nearestD < STATION_NEAR_BADGE && nearestD <= dHome + 20) {
      ctx.helpers.setLocBadge(el, 'station', nearestSt.label || nearestSt.id);
      return;
    }
    // Pathing toward craft: show station label once closer to target than home
    if (agent.targetId && String(agent.targetId).indexOf('station-') === 0 && agent.targetKind !== 'permission') {
      var tSt = stationById(state, agent.targetId);
      if (tSt && tSt.kind !== 'permission') {
        var dT = Math.hypot(agent.x - tSt.x, agent.y - tSt.y);
        if (dT < dHome || agent.fsm === 'busy_at_station') {
          ctx.helpers.setLocBadge(el, 'station', tSt.label || tSt.id);
          return;
        }
      }
    }

    // home · {desk} ONLY when actually within ARRIVE of own desk
    if (homeDesk && dHome < HOME_ARRIVE_BADGE) {
      ctx.helpers.setLocBadge(el, 'home', homeLabel);
      return;
    }

    // Elsewhere (pathing across courtyard etc.) — never fake home
    ctx.helpers.setLocBadge(el, 'clear');
  }

  function separateAgents() {
    var list = [];
    agents.forEach(function (a) { list.push(a); });
    for (var iter = 0; iter < 6; iter++) {
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var a = list[i], b = list[j];
          var aMoving = a.fsm === 'walk' || a.fsm === 'run' || a.speed > MOVE_EPS;
          var bMoving = b.fsm === 'walk' || b.fsm === 'run' || b.speed > MOVE_EPS;
          var aBusy = a.fsm === 'busy_at_station' || a.fsm === 'idle';
          var bBusy = b.fsm === 'busy_at_station' || b.fsm === 'idle';
          var dx = b.x - a.x, dy = b.y - a.y;
          var dist = Math.hypot(dx, dy) || 0.01;
          var need;
          if (!a.isIntern && !b.isIntern) need = SEP_MAIN;
          else if (a.isIntern && b.isIntern) need = SEP_INTERN;
          else need = SEP_MIX;
          // Prefer pushing interns away from mains (never bury main)
          var strength = 1;
          if (aMoving && bMoving && !aBusy && !bBusy) strength = 0.45;
          else if (aMoving || bMoving) strength = 0.7;
          else strength = 1.0;
          if (dist < need) {
            var push = ((need - dist) / 2) * strength;
            dx /= dist; dy /= dist;
            if (!a.isIntern && b.isIntern) {
              // main holds; intern yields more
              b.x += dx * push * 1.55;
              b.y += dy * push * 1.55;
              a.x -= dx * push * 0.35;
              a.y -= dy * push * 0.35;
            } else if (a.isIntern && !b.isIntern) {
              a.x -= dx * push * 1.55;
              a.y -= dy * push * 1.55;
              b.x += dx * push * 0.35;
              b.y += dy * push * 0.35;
            } else {
              a.x -= dx * push; a.y -= dy * push;
              b.x += dx * push; b.y += dy * push;
            }
          }
        }
      }
    }
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
    updateLocBadge(agent);
  }

  function triggerEmotion(agent, kind, now) {
    agent.fsm = 'emotion';
    agent.emotionKind = kind;
    agent.emotionUntil = now + EMOTION_MS;
    agent.visualFrame = kind === 'permission' ? 'emotion_permission' : 'emotion_ready';
    agent._emoPulseOn = true;
    agent._emoNextPulse = now + EMOTION_PULSE_MS;
  }

  /** Emotion overlay without freezing locomotion (permission must RUN). */
  function armEmotionOverlay(agent, kind, now) {
    agent.emotionKind = kind;
    agent._emoPulseOn = true;
    agent._emoNextPulse = now + EMOTION_PULSE_MS;
    agent.emotionUntil = now + EMOTION_MS;
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
    var now = performance.now();

    if (!agent) {
      // npc2: ALWAYS spawn at DESK — never initialize x/y at station target
      // so mute-10s watch sees real walk/run pathing even when status=working.
      var deskPos = homeSpawnPos(bot, entity, state, isIntern);
      var pos;
      if (deskPos) {
        pos = deskPos;
      } else {
        var left = parseFloat(el.style.left);
        var top = parseFloat(el.style.top);
        pos = (!isNaN(left) && !isNaN(top))
          ? worldFromPct(left, top, ctx.world)
          : { x: target.x, y: target.y };
      }
      agent = {
        key: key, bot: bot, isIntern: !!isIntern,
        x: pos.x, y: pos.y, vx: 0, vy: 0, speed: 0,
        fsm: 'idle', status: status, personality: pers,
        targetId: target.id, targetX: target.x, targetY: target.y,
        targetKind: target.kind, urgent: !!target.urgent,
        retargetKey: rk, visualFrame: 'idle', framePhase: 0, frameAcc: 0,
        emotionUntil: 0, emotionKind: null, lastStatus: status,
        stillMs: 0, facing: 1, _fx: 0, _fy: 0,
        fidgetAcc: Math.random() * 2,
        _emoPulseOn: false, _emoNextPulse: 0,
        slotIndex: 0, _slotKind: '',
        _stuckX: pos.x, _stuckY: pos.y, _stuckAcc: 0, _stuckNudge: 0
      };
      // ready: flash at desk OK. permission: overlay only — must not freeze RUN.
      if (status === 'ready_for_review') {
        triggerEmotion(agent, 'ready', now);
      } else if (status === 'needs_permission') {
        armEmotionOverlay(agent, 'permission', now);
      }
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
          triggerEmotion(agent, 'ready', now);
        } else if (status === 'needs_permission' && agent.lastStatus !== 'needs_permission') {
          armEmotionOverlay(agent, 'permission', now);
        } else if (status !== 'ready_for_review' && status !== 'needs_permission') {
          agent._emoPulseOn = false;
          agent.emotionKind = null;
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

    applyCraftSlots();
    applyHomeSlots();

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

  function tickEmotionPulse(agent, now) {
    var status = agent.status || 'idle';
    var hold = status === 'ready_for_review' || status === 'needs_permission';
    if (!hold) {
      agent._emoPulseOn = false;
      if (agent.fsm !== 'emotion') agent.emotionKind = null;
      return;
    }
    // Keep kind assigned while status holds
    if (!agent.emotionKind) {
      agent.emotionKind = status === 'needs_permission' ? 'permission' : 'ready';
    }
    // Soft re-spike every EMOTION_PULSE_MS while holding
    if (!agent._emoNextPulse) agent._emoNextPulse = now + EMOTION_PULSE_MS;
    if (now >= agent._emoNextPulse) {
      // brief show window
      agent._emoPulseOn = true;
      agent.emotionUntil = now + EMOTION_MS;
      agent._emoNextPulse = now + EMOTION_PULSE_MS;
      // Don't interrupt walk/run/busy — overlay bubble only
      var dxp = agent.targetX - agent.x;
      var dyp = agent.targetY - agent.y;
      var stillPathing = Math.hypot(dxp, dyp) > ARRIVE_PX;
      if (!stillPathing && agent.fsm !== 'walk' && agent.fsm !== 'run' && agent.fsm !== 'busy_at_station') {
        if (status === 'needs_permission') {
          // stay busy_at_station / idle at pad — don't lock emotion FSM that blocks motion next retarget
          agent._emoPulseOn = true;
        } else if (agent.fsm === 'idle' || agent.fsm === 'emotion' || agent.speed < MOVE_EPS) {
          agent.fsm = 'emotion';
          agent.visualFrame = agent.emotionKind === 'permission' ? 'emotion_permission' : 'emotion_ready';
        }
      }
    }
    // Clear pulse-on after flash window (bubble still gated by _emoPulseOn until end)
    if (agent._emoPulseOn && agent.emotionUntil && now >= agent.emotionUntil && agent.fsm !== 'emotion') {
      agent._emoPulseOn = false;
    }
  }

  function tickAgent(agent, dt) {
    var now = performance.now();
    var pers = agent.personality || normalizePersonality(null);
    var status = agent.status || 'idle';

    // Periodic mute-readable emotion while ready/permission holds
    tickEmotionPulse(agent, now);

    var dx0 = agent.targetX - agent.x;
    var dy0 = agent.targetY - agent.y;
    var dist0 = Math.hypot(dx0, dy0);

    // Emotion flash — never freeze permission RUN (or any craft pathing)
    if (agent.fsm === 'emotion' && now < agent.emotionUntil) {
      if (dist0 > ARRIVE_PX || status === 'needs_permission') {
        // fall through to pathing; keep overlay
        agent._emoPulseOn = true;
      } else {
        agent.visualFrame = agent.emotionKind === 'permission' ? 'emotion_permission' : 'emotion_ready';
        agent.speed = 0;
        agent._emoPulseOn = true;
        placeAgent(agent);
        return;
      }
    }
    if (agent.fsm === 'emotion' && now >= agent.emotionUntil) {
      // keep emotionKind for pulse-hold; clear only the FSM lock
      agent._emoPulseOn = false;
      if (status !== 'ready_for_review' && status !== 'needs_permission') {
        agent.emotionKind = null;
      }
    }

    var dx = agent.targetX - agent.x;
    var dy = agent.targetY - agent.y;
    var dist = Math.hypot(dx, dy);
    var busyStatuses = status === 'working' || status === 'reviewing' || status === 'collaborating';
    var wantRun = !!agent.urgent || status === 'needs_permission' || pers.speed >= 1.2 || dist > 320;

    // Stuck / walk-in-place: walk|run but world displacement < 2px over 0.5s
    if (agent._stuckX == null) { agent._stuckX = agent.x; agent._stuckY = agent.y; agent._stuckAcc = 0; }
    var disp = Math.hypot(agent.x - agent._stuckX, agent.y - agent._stuckY);
    if (agent.fsm === 'walk' || agent.fsm === 'run') {
      agent._stuckAcc = (agent._stuckAcc || 0) + dt * 1000;
      if (agent._stuckAcc >= STUCK_MS) {
        if (disp < STUCK_DISP_PX) {
          // Blocked or fighting separation — drop walk OR nudge to free slot
          agent._stuckNudge = (agent._stuckNudge || 0) + 1;
          if (agent._stuckNudge % 2 === 1 && dist > ARRIVE_PX) {
            // Retarget: small spiral offset from current target
            var ang = (agent._stuckNudge * 1.7) % (Math.PI * 2);
            var rad = 40 + (agent._stuckNudge % 4) * 28;
            agent.targetX += Math.cos(ang) * rad;
            agent.targetY += Math.sin(ang) * rad * 0.9;
            agent._slotKind = 'stuck-nudge';
          } else {
            // Force idle — never npc-walk with near-zero motion (busy only if already at slot)
            var near = dist <= ARRIVE_PX * 1.5;
            if (near && (busyStatuses || status === 'needs_permission')) {
              agent.fsm = 'busy_at_station';
              agent.visualFrame = status === 'needs_permission' ? 'emotion_permission' : 'busy';
            } else {
              agent.fsm = 'idle';
              agent.visualFrame = 'idle';
            }
            agent.vx = 0; agent.vy = 0; agent.speed = 0;
            agent.stillMs = IDLE_DEBOUNCE_MS + 1;
            placeAgent(agent);
            agent._stuckX = agent.x; agent._stuckY = agent.y; agent._stuckAcc = 0;
            return;
          }
        }
        agent._stuckX = agent.x; agent._stuckY = agent.y; agent._stuckAcc = 0;
      }
    } else {
      agent._stuckX = agent.x; agent._stuckY = agent.y; agent._stuckAcc = 0;
    }

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

      // HARD FAIL #1: walk anim ONLY while velocity > eps AND actually displacing
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
        // Arrive at pad: light station, clear "running" via busy_at_station
        agent.fsm = 'busy_at_station';
        agent.visualFrame = 'emotion_permission';
        agent.targetKind = 'permission';
        if (agent.targetId && String(agent.targetId).indexOf('station-') === 0) {
          occupied.add(agent.targetId);
        } else {
          occupied.add('station-permission');
          agent.targetId = 'station-permission';
        }
      } else {
        // idle / ready — chill, NO fake busy (MUST-HAVE)
        agent.fsm = 'idle';
        agent.visualFrame = status === 'ready_for_review' ? 'emotion_ready' : 'idle';
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

  /** Live permission arrival for alert banner (state JSON atDeskId may lag). */
  function permissionArrived(key) {
    var a = agents.get(key);
    if (!a || a.status !== 'needs_permission') return false;
    if (a.fsm === 'walk' || a.fsm === 'run') return false;
    if (a.speed > MOVE_EPS) return false;
    var pad = ctx && ctx.state ? stationById(ctx.state, 'station-permission') : null;
    if (pad && Math.hypot(a.x - pad.x, a.y - pad.y) < 110) return true;
    if (a.fsm === 'busy_at_station' && a.targetKind === 'permission') return true;
    var z = ctx && ctx.state ? jesusZoneRect(ctx.state) : null;
    if (z && pointInZone(a.x, a.y, z) && Math.hypot(a.x - a.targetX, a.y - a.targetY) <= ARRIVE_PX + 8) {
      return true;
    }
    return false;
  }

  function frame(ts) {
    rafId = requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    if (!ctx) return;
    occupied = new Set();
    applyCraftSlots(); // keep arrive slots stable every tick
    applyHomeSlots();
    agents.forEach(function (agent) {
      agent._frameX0 = agent.x;
      agent._frameY0 = agent.y;
      tickAgent(agent, dt);
    });
    separateAgents();
    // Dev A: drop walk-in-place when sep cancels net motion this frame
    agents.forEach(function (agent) {
      var frameDisp = Math.hypot(
        agent.x - (agent._frameX0 || agent.x),
        agent.y - (agent._frameY0 || agent.y)
      );
      if ((agent.fsm === 'walk' || agent.fsm === 'run') &&
          (agent.speed <= MOVE_EPS || frameDisp < 0.65)) {
        agent.fsm = 'idle';
        agent.visualFrame = 'idle';
        agent.vx = 0; agent.vy = 0; agent.speed = 0;
      }
      var dT = Math.hypot(agent.targetX - agent.x, agent.targetY - agent.y);
      if ((agent.fsm === 'walk' || agent.fsm === 'run') && dT < ARRIVE_PX * 2.0 && frameDisp < 1.2) {
        agent.x = agent.targetX;
        agent.y = agent.targetY;
        agent.vx = 0; agent.vy = 0; agent.speed = 0;
        agent.fsm = 'idle';
        agent.visualFrame = 'idle';
        if (agent._slotKind === 'stuck-nudge') agent._slotKind = null;
      }
    });
    // Re-place after separation so DOM matches pushed coords + badges
    agents.forEach(function (agent) { placeAgent(agent); });
    if (ctx.state) renderStations(ctx.state);
    if (ctx.helpers && typeof ctx.helpers.refreshPermissionAlert === 'function') {
      ctx.helpers.refreshPermissionAlert();
    }
  }

  function start() {
    if (started) return;
    started = true;
    rafId = requestAnimationFrame(frame);
  }

  function sync(nextCtx) {
    ctx = nextCtx || ctx;
    if (!ctx || !ctx.state) return;
    if (!ctx.world) ctx.world = { w: 2100, h: 1600 };
    syncFromState();
    start();
  }

  global.CampusNpc = {
    version: 'npc5b',
    ownsPositions: true,
    sync: sync,
    agents: agents,
    permissionArrived: permissionArrived,
    pickBusyStationId: pickBusyStationId,
    normalizePersonality: normalizePersonality,
    SLOT_MIN_DIST: SLOT_MIN_DIST,
    SEP_MAIN: SEP_MAIN,
    SEP_MIX: SEP_MIX,
    SEP_INTERN: SEP_INTERN,
    slotAround: function (index, isIntern, mainCount) {
      return isIntern ? internStationOffset(index, mainCount) : mainSlotOffset(index, mainCount);
    },
    ownerOrbitOffset: ownerOrbitOffset
  };
})(typeof window !== 'undefined' ? window : globalThis);
