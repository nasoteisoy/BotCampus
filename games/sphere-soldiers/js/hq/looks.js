// Fixed default looks per side + class (no customizer UI).
// Digits match conquest-commander DEFAULT_ROSTER / TROOPER_DEFAULT.
import {
  TROOPER_DEFAULT, NATION_DEFAULT, sanitizeNation, sanitizeFields, TROOPER_FIELDS,
} from './trooper.js';
import { TANK_DEFAULT } from './tank.js';

const RT = (o) => ({ ...TROOPER_DEFAULT, ...o });

/** Class → trooper shape digits (Army HQ DEFAULT_ROSTER). */
export const CLASS_ST = Object.freeze({
  rifle:    RT({ weapon: 0, expl: 0 }),
  heavy:    RT({ helm: 1, armor: 1, pads: 2, weapon: 1, expl: 1, side: 1 }),
  sniper:   RT({ helm: 4, pads: 0, weapon: 2, expl: 3, gadget: 2, extra: 2, banner: 0 }),
  recon:    RT({ helm: 4, pads: 0, weapon: 2, expl: 3, gadget: 2, extra: 2, banner: 0 }),
  engineer: RT({ helm: 3, weapon: 3, expl: 2, gadget: 4, banner: 0 }),
  special:  RT({ helm: 2, pads: 2, weapon: 5, gadget: 3, banner: 0 }),
  officer:  RT({ helm: 2, pads: 2, weapon: 4, side: 1, gadget: 6, extra: 1 }),
});

/** Default tank look (medium hull, cannon, antenna + pennant like HQ battle). */
export const TANK_ST = Object.freeze({ ...TANK_DEFAULT, hull: 1, gun: 0, antenna: 1, pennant: 1 });

/** Nation paint for a team hex — dark charcoal suit, white-ish secondary, cyan/red visor. */
export function nationFor(teamHex, side = 'attacker') {
  const isAtt = side === 'attacker' || side === 0;
  return sanitizeNation({
    ...NATION_DEFAULT,
    p: teamHex || (isAtt ? '#3ab4ff' : '#ff5a4a'),
    s: isAtt ? '#ffe14d' : '#f4f6f8',
    suit: 0,           // charcoal dark armor
    sym: isAtt ? 0 : 6, // star / chevron
    sc: 0,
    vis: isAtt ? 0 : 1, // cyan / red
    glow: 1,
  });
}

export function trooperSt(type) {
  const raw = CLASS_ST[type] || CLASS_ST.rifle;
  return sanitizeFields(raw, TROOPER_FIELDS, TROOPER_DEFAULT);
}

export function paintState(nation, st) {
  return { ...nation, skin: st.skin | 0 };
}
