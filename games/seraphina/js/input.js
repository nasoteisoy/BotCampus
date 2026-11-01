/**
 * Action-mapped input: keyboard, virtual joystick + fire (touch), mouse aim.
 * Adapted from mini2d/js/input.js + boarding-input joystick pattern.
 * Actions: move (axis), fire, pause. Deadzone 0.25 radial.
 */
const DEADZONE = 0.25;

export function createInput(root) {
  const down = new Set();
  const pressed = new Set();
  const released = new Set();

  // Analog move from joystick / keys
  let axisX = 0;
  let axisY = 0;
  let mouseAim = null; // {x,y} in CSS pixels relative to canvas, or null
  let fireHeld = false;

  const keyMap = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    ' ': 'fire', j: 'fire', J: 'fire',
    Escape: 'pause', p: 'pause', P: 'pause',
  };

  function onKey(e, isDown) {
    const act = keyMap[e.key];
    if (!act) return;
    e.preventDefault();
    if (isDown) {
      if (!down.has(act)) pressed.add(act);
      down.add(act);
    } else {
      down.delete(act);
      released.add(act);
    }
  }

  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));

  // --- Virtual joystick ---
  const joyEl = root.querySelector('#joy');
  const knobEl = root.querySelector('#joyKnob');
  const fireEl = root.querySelector('[data-act=fire]');
  let joyId = null;
  let joyCx = 0, joyCy = 0;
  const JOY_R = 40;

  function setKnob(dx, dy) {
    if (!knobEl) return;
    knobEl.style.transform = `translate(${dx}px,${dy}px)`;
  }

  if (joyEl) {
    joyEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      joyId = e.pointerId;
      joyEl.setPointerCapture(e.pointerId);
      const r = joyEl.getBoundingClientRect();
      joyCx = r.left + r.width / 2;
      joyCy = r.top + r.height / 2;
      updateJoy(e.clientX, e.clientY);
    });
    joyEl.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyId) return;
      e.preventDefault();
      updateJoy(e.clientX, e.clientY);
    });
    const endJoy = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null;
      axisX = 0; axisY = 0;
      setKnob(0, 0);
    };
    joyEl.addEventListener('pointerup', endJoy);
    joyEl.addEventListener('pointercancel', endJoy);
  }

  function updateJoy(cx, cy) {
    let dx = cx - joyCx;
    let dy = cy - joyCy;
    const len = Math.hypot(dx, dy) || 1;
    const mag = Math.min(1, len / JOY_R);
    dx = (dx / len) * mag;
    dy = (dy / len) * mag;
    // radial deadzone
    if (mag < DEADZONE) {
      axisX = 0; axisY = 0;
      setKnob(0, 0);
      return;
    }
    const scaled = (mag - DEADZONE) / (1 - DEADZONE);
    axisX = (dx / mag) * scaled;
    axisY = (dy / mag) * scaled;
    setKnob(axisX * JOY_R, axisY * JOY_R);
  }

  // Fire button
  function bindFire(el) {
    if (!el) return;
    const set = (v) => {
      fireHeld = v;
      if (v) {
        if (!down.has('fire')) pressed.add('fire');
        down.add('fire');
        el.classList.add('pressed');
      } else {
        down.delete('fire');
        released.add('fire');
        el.classList.remove('pressed');
      }
    };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); set(true); });
    el.addEventListener('pointerup', (e) => { e.preventDefault(); set(false); });
    el.addEventListener('pointerleave', (e) => { e.preventDefault(); set(false); });
    el.addEventListener('pointercancel', (e) => { e.preventDefault(); set(false); });
  }
  bindFire(fireEl);

  // Mouse aim on canvas (optional)
  const canvas = document.getElementById('game');
  if (canvas) {
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = canvas.getBoundingClientRect();
      mouseAim = { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) {
        if (!down.has('fire')) pressed.add('fire');
        down.add('fire');
        fireHeld = true;
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      if (fireHeld && e.button === 0) {
        down.delete('fire');
        released.add('fire');
        fireHeld = false;
      }
    });
  }

  function keyAxis() {
    let x = 0, y = 0;
    if (down.has('left')) x -= 1;
    if (down.has('right')) x += 1;
    if (down.has('up')) y -= 1;
    if (down.has('down')) y += 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  function update(_dt) {
    // keys override / blend with joystick: prefer non-zero
  }

  function endFrame() {
    pressed.clear();
    released.clear();
  }

  function moveAxis() {
    const k = keyAxis();
    if (Math.abs(k.x) > 0.01 || Math.abs(k.y) > 0.01) return k;
    return { x: axisX, y: axisY };
  }

  return {
    update, endFrame,
    held: (a) => down.has(a) || (a === 'fire' && fireHeld),
    pressed: (a) => pressed.has(a),
    released: (a) => released.has(a),
    moveAxis,
    getMouseAim: () => mouseAim,
    /** CSS-pixel rects of touch controls for overlap tests */
    touchRects() {
      const rects = [];
      if (joyEl) {
        const r = joyEl.getBoundingClientRect();
        rects.push({ id: 'joy', x: r.left, y: r.top, w: r.width, h: r.height });
      }
      if (fireEl) {
        const r = fireEl.getBoundingClientRect();
        rects.push({ id: 'fire', x: r.left, y: r.top, w: r.width, h: r.height });
      }
      return rects;
    },
  };
}
