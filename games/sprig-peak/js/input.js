/** Action-mapped input: keyboard, touch (pointer:coarse), gamepad. */
const DEADZONE = 0.25;

export function createInput(root) {
  const down = new Set();
  const pressed = new Set();
  const released = new Set();
  const touch = { left: false, right: false, jump: false, action: false };
  let jumpBuf = 0;
  let actionBuf = 0;

  const keyMap = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'jump', w: 'jump', W: 'jump', ' ': 'jump', z: 'jump', Z: 'jump',
    x: 'action', X: 'action', j: 'action', J: 'action',
    Escape: 'pause', p: 'pause', P: 'pause',
  };

  function onKey(e, isDown) {
    const act = keyMap[e.key];
    if (!act) return;
    e.preventDefault();
    if (isDown) {
      if (!down.has(act)) pressed.add(act);
      down.add(act);
      if (act === 'jump') jumpBuf = 0.12;
      if (act === 'action') actionBuf = 0.1;
    } else {
      down.delete(act);
      released.add(act);
    }
  }

  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));

  // Touch buttons — only wired when pointer:coarse; UI visibility handled in CSS
  function bindTouch(el, act) {
    if (!el) return;
    const set = (v) => {
      touch[act] = v;
      if (v) {
        if (!down.has(act)) pressed.add(act);
        down.add(act);
        if (act === 'jump') jumpBuf = 0.12;
        if (act === 'action') actionBuf = 0.1;
        el.classList.add('pressed');
      } else {
        down.delete(act);
        released.add(act);
        touch[act] = false;
        el.classList.remove('pressed');
      }
    };
    const start = (e) => { e.preventDefault(); set(true); };
    const end = (e) => { e.preventDefault(); set(false); };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointerleave', end);
    el.addEventListener('pointercancel', end);
  }

  bindTouch(root.querySelector('[data-act=left]'), 'left');
  bindTouch(root.querySelector('[data-act=right]'), 'right');
  bindTouch(root.querySelector('[data-act=jump]'), 'jump');
  bindTouch(root.querySelector('[data-act=action]'), 'action');

  function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      let ax = pad.axes[0] || 0;
      if (Math.abs(ax) < DEADZONE) ax = 0;
      const L = ax < -DEADZONE || pad.buttons[14]?.pressed;
      const R = ax > DEADZONE || pad.buttons[15]?.pressed;
      const J = pad.buttons[0]?.pressed || pad.buttons[1]?.pressed;
      const A = pad.buttons[2]?.pressed || pad.buttons[3]?.pressed;
      const P = pad.buttons[9]?.pressed || pad.buttons[8]?.pressed;
      syncPad('left', L); syncPad('right', R); syncPad('jump', J); syncPad('action', A); syncPad('pause', P);
      break;
    }
  }

  const padState = {};
  function syncPad(act, v) {
    if (v && !padState[act]) { pressed.add(act); if (act === 'jump') jumpBuf = 0.12; }
    if (!v && padState[act]) released.add(act);
    padState[act] = v;
    if (v) down.add(act); else if (!touch[act]) down.delete(act);
  }

  function update(dt) {
    pollGamepad();
    jumpBuf = Math.max(0, jumpBuf - dt);
    actionBuf = Math.max(0, actionBuf - dt);
  }

  function endFrame() {
    pressed.clear();
    released.clear();
  }

  return {
    update, endFrame,
    held: (a) => down.has(a) || !!touch[a] || !!padState[a],
    pressed: (a) => pressed.has(a),
    released: (a) => released.has(a),
    consumeJumpBuffer() { if (jumpBuf > 0) { jumpBuf = 0; return true; } return false; },
    hasJumpBuffer: () => jumpBuf > 0,
    axis() {
      let x = 0;
      if (down.has('left') || touch.left || padState.left) x -= 1;
      if (down.has('right') || touch.right || padState.right) x += 1;
      return x;
    },
  };
}
