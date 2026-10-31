/** Pooled dust / spark / leaf particles. */
export function createParticles(max = 128) {
  const pool = [];
  for (let i = 0; i < max; i++) {
    pool.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, kind: 'dust', s: 1 });
  }
  function spawn(kind, x, y, n = 6) {
    for (let i = 0; i < n; i++) {
      const p = pool.find((q) => !q.alive);
      if (!p) break;
      p.alive = true;
      p.kind = kind;
      p.x = x + (Math.random() - 0.5) * 8;
      p.y = y + (Math.random() - 0.5) * 4;
      p.vx = (Math.random() - 0.5) * 80;
      p.vy = -40 - Math.random() * 60;
      p.life = 0;
      p.max = 0.25 + Math.random() * 0.35;
      p.s = 0.8 + Math.random() * 0.6;
    }
  }
  function update(dt) {
    for (const p of pool) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.max) { p.alive = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt;
    }
  }
  function draw(ctx, sheets, cam) {
    for (const p of pool) {
      if (!p.alive) continue;
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = a;
      sheets.particles.draw(ctx, p.kind, p.x - cam.x, p.y - cam.y, { scale: p.s });
      ctx.globalAlpha = 1;
    }
  }
  return { spawn, update, draw, pool };
}
