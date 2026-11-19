// Action-mapped input: gameplay reads actions (steerX, steerY, fire, go), never raw keys.
// Keyboard + mouse on PC, floating stick + big buttons on touch, basic gamepad. Pattern per input-systems skill;
// touch layout (left stick, right action button, 56px safe corner) follows parts-library boarding-input.
const BIND = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  fire: ['Space', 'KeyJ', 'KeyF'], go: ['Space', 'Enter', 'KeyW', 'ArrowUp', 'NumpadEnter'],
};
const STICK_R = 54, DEAD = 0.12;

export function createInput({ stickZone, stickBase, stickKnob, btnFire, btnGo, canvas }) {
  const held = new Set();
  const st = { sx: 0, sy: 0, stickId: null, cx: 0, cy: 0, fireTouch: false, mouseFire: false, goEdge: false, padGoPrev: false, lastDevice: 'kb' };
  const has = (act) => BIND[act].some((c) => held.has(c));

  addEventListener('keydown', (e) => {
    if (BIND.fire.includes(e.code) || BIND.left.includes(e.code) || BIND.right.includes(e.code) || BIND.up.includes(e.code) || BIND.down.includes(e.code)) e.preventDefault();
    if (!e.repeat && BIND.go.includes(e.code)) st.goEdge = true;
    held.add(e.code); st.lastDevice = 'kb';
  });
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => { held.clear(); st.mouseFire = false; st.fireTouch = false; resetStick(); });

  // mouse: hold left button on the game view to fire
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { st.mouseFire = true; st.lastDevice = 'kb'; } });
  addEventListener('mouseup', () => { st.mouseFire = false; });

  // floating stick on the left side
  function placeBase(x, y) {
    const r = stickZone.getBoundingClientRect();
    stickBase.style.left = (x - r.left) + 'px'; stickBase.style.top = (y - r.top) + 'px';
  }
  function resetStick() {
    st.stickId = null; st.sx = 0; st.sy = 0; stickKnob.style.transform = '';
    stickZone.classList.remove('active'); stickBase.style.left = ''; stickBase.style.top = '';
  }
  stickZone.addEventListener('pointerdown', (e) => {
    if (st.stickId !== null) return;
    e.preventDefault(); stickZone.setPointerCapture?.(e.pointerId);
    st.stickId = e.pointerId; st.cx = e.clientX; st.cy = e.clientY; st.lastDevice = 'touch';
    placeBase(e.clientX, e.clientY); stickZone.classList.add('active');
  });
  stickZone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== st.stickId) return;
    let dx = e.clientX - st.cx, dy = e.clientY - st.cy;
    const m = Math.hypot(dx, dy);
    if (m > STICK_R) { dx *= STICK_R / m; dy *= STICK_R / m; }
    stickKnob.style.transform = `translate(${dx}px,${dy}px)`;
    st.sx = dx / STICK_R; st.sy = -dy / STICK_R;
  });
  const end = (e) => { if (e.pointerId === st.stickId) resetStick(); };
  stickZone.addEventListener('pointerup', end); stickZone.addEventListener('pointercancel', end);

  // big buttons (pointer events cover mouse + touch + pen)
  btnFire.addEventListener('pointerdown', (e) => { e.preventDefault(); btnFire.setPointerCapture?.(e.pointerId); st.fireTouch = true; btnFire.classList.add('down'); });
  const fireUp = () => { st.fireTouch = false; btnFire.classList.remove('down'); };
  btnFire.addEventListener('pointerup', fireUp); btnFire.addEventListener('pointercancel', fireUp); btnFire.addEventListener('lostpointercapture', fireUp);
  btnGo.addEventListener('pointerdown', (e) => { e.preventDefault(); st.goEdge = true; });

  function radial(x, y) { // radial deadzone + rescale
    const m = Math.hypot(x, y);
    if (m < DEAD) return [0, 0];
    const k = Math.pow(Math.min(1, (m - DEAD) / (1 - DEAD)), 0.75) / m; // curve < 1: small pushes still turn
    return [x * k, y * k];
  }
  return {
    get device() { return st.lastDevice; },
    sample() {
      let x = (has('right') ? 1 : 0) - (has('left') ? 1 : 0);
      let y = (has('up') ? 1 : 0) - (has('down') ? 1 : 0);
      let fire = has('fire') || st.mouseFire || st.fireTouch;
      let go = st.goEdge; st.goEdge = false;
      if (st.stickId !== null) { const [a, b] = radial(st.sx, st.sy); x = a; y = b; }
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let padGo = false;
      for (const p of pads) {
        if (!p) continue;
        const [a, b] = radial(p.axes[0] || 0, -(p.axes[1] || 0));
        if (a || b) { x = a; y = b; }
        if (p.buttons[0]?.pressed || p.buttons[7]?.pressed) fire = true; // A / right trigger
        if (p.buttons[0]?.pressed || p.buttons[9]?.pressed) padGo = true; // A / Start
      }
      if (padGo && !st.padGoPrev) go = true; // edge only
      st.padGoPrev = padGo;
      return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), fire, go };
    },
    reset() { held.clear(); resetStick(); st.fireTouch = false; st.mouseFire = false; st.goEdge = false; },
  };
}
