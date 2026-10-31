// Fixed SpaceShip / BattleShip roster for STAR CONQUESTS space battles.
// No editor, no customizing — every ship of a given kind shares these numbers.
// Shell units arrive as { id, type, name, icon, stats:{hp,attack,range,speed,armor}, hpNow }.
// We keep shell stats as the combat baseline and layer type extras (shield, hangar, turrets).

export const SPACE_TYPES = new Set(['spaceship', 'battleship']);

/** Fixed roster shown in README / shop hints. Keys match unit.type (+ optional name). */
export const ROSTER = Object.freeze({
  scout: Object.freeze({
    kind: 'spaceship', type: 'spaceship', id: 'scout', name: 'Scout', icon: 'scout',
    // defaults when shell does not pass stats
    stats: Object.freeze({ hp: 120, attack: 12, range: 28, speed: 9, armor: 5 }),
    extras: Object.freeze({ shield: 30, shieldRegen: 3, dps: 12, turn: 120, scale: 0.9, role: 'scout' }),
  }),
  fighter: Object.freeze({
    kind: 'spaceship', type: 'spaceship', id: 'fighter', name: 'Fighter', icon: 'fighter',
    stats: Object.freeze({ hp: 180, attack: 18, range: 32, speed: 7, armor: 10 }),
    extras: Object.freeze({ shield: 50, shieldRegen: 4, dps: 18, turn: 100, scale: 1.0, role: 'fighter' }),
  }),
  interceptor: Object.freeze({
    kind: 'spaceship', type: 'spaceship', id: 'interceptor', name: 'Interceptor', icon: 'interceptor',
    stats: Object.freeze({ hp: 100, attack: 14, range: 26, speed: 12, armor: 0 }),
    extras: Object.freeze({ shield: 20, shieldRegen: 2, dps: 14, turn: 160, scale: 0.85, role: 'interceptor' }),
  }),
  corvette: Object.freeze({
    kind: 'battleship', type: 'battleship', id: 'corvette', name: 'Corvette', icon: 'corvette',
    stats: Object.freeze({ hp: 500, attack: 40, range: 70, speed: 4, armor: 15 }),
    extras: Object.freeze({
      shield: 200, shieldRegen: 8, dps: 40, turn: 40, turrets: 2,
      hangarSlots: 2, launchRate: 0.25, scale: 2.2, role: 'corvette',
    }),
  }),
  cruiser: Object.freeze({
    kind: 'battleship', type: 'battleship', id: 'cruiser', name: 'Cruiser', icon: 'cruiser',
    stats: Object.freeze({ hp: 900, attack: 70, range: 90, speed: 3, armor: 25 }),
    extras: Object.freeze({
      shield: 400, shieldRegen: 14, dps: 70, turn: 28, turrets: 4,
      hangarSlots: 4, launchRate: 0.33, scale: 3.0, role: 'cruiser',
    }),
  }),
});

const BY_NAME = Object.fromEntries(Object.values(ROSTER).map((r) => [r.name.toLowerCase(), r]));
const BY_ID = Object.fromEntries(Object.values(ROSTER).map((r) => [r.id, r]));

/** Pick a roster entry for a shell unit. Unknown spaceship → fighter; unknown battleship → corvette. */
export function templateFor(unit) {
  if (!unit || !SPACE_TYPES.has(unit.type)) return null;
  const key = String(unit.name || '').toLowerCase();
  if (BY_NAME[key]) return BY_NAME[key];
  if (unit.icon && Object.values(ROSTER).find((r) => r.icon === unit.icon)) {
    return Object.values(ROSTER).find((r) => r.icon === unit.icon);
  }
  return unit.type === 'battleship' ? ROSTER.corvette : ROSTER.fighter;
}

/**
 * Merge shell unit + roster into a combat blueprint.
 * Shell stats win when present; extras always come from the roster template.
 */
export function resolveUnit(unit) {
  const tpl = templateFor(unit);
  if (!tpl) return null;
  const s = unit.stats || {};
  const hpMax = Math.max(1, Number(s.hp ?? tpl.stats.hp) || tpl.stats.hp);
  const hpNow = Math.max(0, Math.min(hpMax, Number(unit.hpNow ?? hpMax)));
  return {
    id: unit.id,
    type: unit.type,
    name: unit.name || tpl.name,
    icon: unit.icon || tpl.icon,
    role: tpl.extras.role,
    kind: tpl.kind,
    hpMax,
    hp: hpNow,
    attack: Number(s.attack ?? tpl.stats.attack) || tpl.stats.attack,
    range: Number(s.range ?? tpl.stats.range) || tpl.stats.range,
    speed: Number(s.speed ?? tpl.stats.speed) || tpl.stats.speed,
    armor: Math.min(90, Math.max(0, Number(s.armor ?? tpl.stats.armor) || 0)),
    shieldMax: tpl.extras.shield || 0,
    shield: tpl.extras.shield || 0,
    shieldRegen: tpl.extras.shieldRegen || 0,
    turn: tpl.extras.turn || 60,
    turrets: tpl.extras.turrets || 1,
    hangarSlots: tpl.extras.hangarSlots || 0,
    launchRate: tpl.extras.launchRate || 0,
    scale: tpl.extras.scale || 1,
    // keep original shell unit so survivors can be rebuilt
    _src: unit,
  };
}

/** Fighter craft launched from a battleship hangar (not a shell unit). */
export function makeHangarCraft(parent, index, seedRand) {
  const tpl = ROSTER.scout;
  const hp = tpl.stats.hp;
  return {
    id: `${parent.id}-craft-${index}`,
    type: 'spaceship',
    name: 'Scout',
    icon: 'scout',
    role: 'scout',
    kind: 'spaceship',
    hpMax: hp,
    hp,
    attack: tpl.stats.attack,
    range: tpl.stats.range,
    speed: tpl.stats.speed,
    armor: tpl.stats.armor,
    shieldMax: tpl.extras.shield,
    shield: tpl.extras.shield,
    shieldRegen: tpl.extras.shieldRegen,
    turn: tpl.extras.turn,
    turrets: 1,
    hangarSlots: 0,
    launchRate: 0,
    scale: tpl.extras.scale,
    launched: true,
    parentId: parent.id,
    _src: null, // hangar craft are not shell survivors
  };
}

export { BY_ID as ROSTER_BY_ID };
