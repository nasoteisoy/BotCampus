// Touch (left stick, right drag to look, big buttons) and desktop (WASD, mouse with pointer lock).
export function createInput({ canvas, stickZone, lookZone, stickEl, knobEl, buttons, onPause, settings }) {
  const s = { mx: 0, my: 0, lookDx: 0, lookDy: 0, suck: false, touch: false, locked: false, enabled: false };
  const edges = { grab: false, skill: false, jump: false, guide: false };
  const keys = new Set();
  let stick = null, look = null;

  // ---- touch stick: appears under the thumb, stays live if the thumb slides off
  const R = 56;
  stickZone.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || stick) return;
    s.touch = true; e.preventDefault();
    stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
    stickZone.setPointerCapture(e.pointerId);
    stickEl.style.left = e.clientX + 'px'; stickEl.style.top = e.clientY + 'px'; stickEl.classList.add('on');
    knobEl.style.transform = 'translate(-50%,-50%)';
  });
  stickZone.addEventListener('pointermove', (e) => {
    if (!stick || e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.x0, dy = e.clientY - stick.y0;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    s.mx = dx / R; s.my = -dy / R;
    knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });
  const endStick = (e) => { if (!stick || e.pointerId !== stick.id) return; stick = null; s.mx = 0; s.my = 0; stickEl.classList.remove('on'); };
  stickZone.addEventListener('pointerup', endStick); stickZone.addEventListener('pointercancel', endStick);

  // ---- touch look: drag anywhere on the right side
  lookZone.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') { if (s.enabled && !s.locked && !s.touch) canvas.requestPointerLock?.(); return; }
    if (look) return;
    s.touch = true; e.preventDefault();
    look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    lookZone.setPointerCapture(e.pointerId);
  });
  lookZone.addEventListener('pointermove', (e) => {
    if (!look || e.pointerId !== look.id) return;
    s.lookDx += (e.clientX - look.x) * 0.0055 * settings.sens; s.lookDy += (e.clientY - look.y) * 0.0055 * settings.sens;
    look.x = e.clientX; look.y = e.clientY;
  });
  const endLook = (e) => { if (look && e.pointerId === look.id) look = null; };
  lookZone.addEventListener('pointerup', endLook); lookZone.addEventListener('pointercancel', endLook);

  // ---- on-screen buttons (also clickable with a mouse when the pointer is free)
  const hold = (el, on, off) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId); el.classList.add('down'); on(); });
    const up = (e) => { e.stopPropagation(); el.classList.remove('down'); off && off(); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  hold(buttons.suck, () => { s.suck = true; }, () => { s.suck = false; });
  hold(buttons.grab, () => { edges.grab = true; });
  hold(buttons.skill, () => { edges.skill = true; });
  hold(buttons.jump, () => { edges.jump = true; });
  hold(buttons.guide, () => { edges.guide = true; });

  // ---- desktop
  let mouseSuck = false;
  document.addEventListener('pointerlockchange', () => {
    s.locked = document.pointerLockElement === canvas;
    if (!s.locked) { mouseSuck = false; if (s.enabled && !s.touch) onPause(); }
  });
  document.addEventListener('mousemove', (e) => {
    if (!s.locked) return;
    s.lookDx += e.movementX * 0.0022 * settings.sens; s.lookDy += e.movementY * 0.0022 * settings.sens;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (!s.locked) return;
    if (e.button === 0) mouseSuck = true;
    if (e.button === 2) edges.grab = true;
  });
  document.addEventListener('mouseup', (e) => { if (e.button === 0) mouseSuck = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (!s.enabled || e.target.tagName === 'INPUT') return;
    const k = e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(k)) e.preventDefault();
    if (e.repeat) return;
    keys.add(k);
    if (k === 'KeyE') edges.grab = true;
    if (k === 'KeyQ' || k === 'KeyF') edges.skill = true;
    if (k === 'Space') edges.jump = true;
    if (k === 'KeyG' || k === 'Tab') edges.guide = true;
    if (k === 'Escape' || k === 'KeyP') onPause();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouseSuck = false; s.suck = false; });

  return {
    state: s,
    sample() {
      let mx = s.mx, my = s.my;
      if (keys.size) {
        const kx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
        const ky = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
        if (kx || ky) { const l = Math.hypot(kx, ky); mx = kx / l; my = ky / l; }
      }
      const out = { mx, my, lookDx: s.lookDx, lookDy: s.lookDy * (settings.invertY ? -1 : 1), suck: s.suck || mouseSuck || keys.has('KeyR'), ...edges };
      s.lookDx = 0; s.lookDy = 0;
      edges.grab = edges.skill = edges.jump = edges.guide = false;
      return out;
    },
    reset() { s.mx = s.my = 0; s.suck = false; mouseSuck = false; keys.clear(); stick = null; look = null; stickEl.classList.remove('on'); },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
  };
}
