/** Pooled pop / spark / leaf particles. Adapted from mini2d/js/particles.js */
export function createParticles(max = 160) {
  const pool = [];
  for (let i = 0; i < max; i++) {
    pool.push({
      alive: false, x: 0, y: 0, vx: 0, vy: 0,
      life: 0, max: 0, kind: 'pop', r: 2, g: 180, b: 90, a: 1,
    });
  }

  function spawn(kind, x, y, n = 10, color) {
    for (let i = 0; i < n; i++) {
      const p = pool.find((q) => !q.alive);
      if (!p) break;
      p.alive = true;
      p.kind = kind;
      p.x = x + (Math.random() - 0.5) * 6;
      p.y = y + (Math.random() - 0.5) * 6;
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 90;
      p.vx = Math.cos(ang) * spd;
      p.vy = Math.sin(ang) * spd - 20;
      p.life = 0;
      p.max = 0.25 + Math.random() * 0.35;
      p.r = 1 + Math.random() * 2.5;
      if (color) {
        p.g = color.g; p.b = color.b; p.cr = color.r;
      } else if (kind === 'pop') {
        p.cr = 60 + Math.random() * 40;
        p.g = 150 + Math.random() * 60;
        p.b = 60 + Math.random() * 40;
      } else if (kind === 'hurt') {
        p.cr = 210; p.g = 60; p.b = 70;
      } else {
        p.cr = 200; p.g = 180; p.b = 80;
      }
    }
  }

  function update(dt) {
    for (const p of pool) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.max) { p.alive = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt;
      p.vx *= 0.98;
    }
  }

  function draw(ctx, camX, camY) {
    for (const p of pool) {
      if (!p.alive) continue;
      const a = 1 - p.life / p.max;
      const x = Math.floor(p.x - camX);
      const y = Math.floor(p.y - camY);
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgb(${p.cr|0},${p.g|0},${p.b|0})`;
      const s = Math.max(1, Math.floor(p.r));
      ctx.fillRect(x, y, s, s);
      ctx.globalAlpha = 1;
    }
  }

  return { spawn, update, draw, pool };
}
