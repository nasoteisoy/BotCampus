// Trooper template library (v4.2). Built only from existing kit options (see js/trooper.js TROOPER_FIELDS).
// A template pick copies `t` (over TROOPER_DEFAULT) + name + icon into a roster slot; the name stays editable.
// Field values: helm 0 dome 1 angular 2 crest 3 goggles 4 recon · armor 0 Standard 1 Heavy · pads 0 none 1 round 2 angular
// weapon 0 blaster 1 rocket 2 sniper 3 shotgun 4 chaingun 5 EMP · side 0 blaster pistol 1 commando
// expl 0 thermal 1 mines 2 detpacks 3 time bombs · gadget 0 none 1 turret 2 recon droid 3 jetpack 4 fusion 5 health&ammo 6 rally
// extra 0 none 1 cape 2 scarf · banner 0/1
import { TROOPER_DEFAULT } from './trooper.js?v=6';

export const ROLES = [
  { id: 'assault', ico: '⚔️', name: 'Assault' },
  { id: 'heavy', ico: '🛡️', name: 'Heavy' },
  { id: 'recon', ico: '🔭', name: 'Recon' },
  { id: 'support', ico: '🧰', name: 'Support' },
  { id: 'command', ico: '⭐', name: 'Command' },
];
const T = (id, role, name, icon, desc, t) => Object.freeze({ id, role, name, icon, desc, t: Object.freeze({ ...TROOPER_DEFAULT, ...t }) });
export const TEMPLATES = Object.freeze([
  // the 6 v4 starters (same loadouts as trooper.js DEFAULT_ROSTER)
  T('trooper', 'assault', 'Trooper', '🪖', 'Cheap all-rounder: blaster rifle + thermal detonator.', { weapon: 0, expl: 0 }),
  T('heavy', 'heavy', 'Heavy', '🛡️', 'Tank buster in heavy armor: rocket + mines.', { helm: 1, armor: 1, pads: 2, weapon: 1, expl: 1, side: 1 }),
  T('sniper', 'recon', 'Sniper', '🎯', 'Long-range killer: sniper, time bombs, recon droid.', { helm: 4, pads: 0, weapon: 2, expl: 3, gadget: 2, extra: 2, banner: 0 }),
  T('engineer', 'support', 'Engineer', '🔧', 'Fixes tanks and gates: shotgun, detpack, fusion cutter.', { helm: 3, weapon: 3, expl: 2, gadget: 4, banner: 0 }),
  T('jet', 'assault', 'Jet Trooper', '🚀', 'Flies over walls and stuns droids: EMP + jetpack.', { helm: 2, pads: 2, weapon: 5, gadget: 3, banner: 0 }),
  T('commander', 'command', 'Commander', '⭐', 'Leads the squad: chaingun + rally call + cape.', { helm: 2, pads: 2, weapon: 4, side: 1, gadget: 6, extra: 1 }),
  // more
  T('rifle-veteran', 'assault', 'Rifle Veteran', '🎖️', 'Seasoned rifleman: commando pistol + supply drop.', { helm: 1, pads: 2, weapon: 0, side: 1, gadget: 5 }),
  T('breacher', 'assault', 'Breacher', '💥', 'Clears rooms: shotgun + thermal, commando pistol.', { helm: 1, pads: 2, weapon: 3, side: 1, expl: 0, banner: 0 }),
  T('jump-assault', 'assault', 'Jump Assault', '🦘', 'Jets in and blasts up close: shotgun + jetpack.', { helm: 2, pads: 1, weapon: 3, gadget: 3, expl: 0, banner: 0 }),
  T('grenadier', 'assault', 'Grenadier', '💣', 'Explosives expert: time bombs + ammo drop for more.', { helm: 0, pads: 1, weapon: 0, expl: 3, gadget: 5, banner: 0 }),
  T('at-specialist', 'heavy', 'AT Specialist', '🧨', 'Lighter tank hunter: rocket + mines, standard armor.', { helm: 4, pads: 1, weapon: 1, expl: 1, banner: 0 }),
  T('suppressor', 'heavy', 'Suppressor', '🌀', 'Bullet storm pins enemies down: chaingun, heavy armor.', { helm: 1, armor: 1, pads: 2, weapon: 4, expl: 0, gadget: 5 }),
  T('heavy-commando', 'heavy', 'Heavy Commando', '🦾', 'Armored shock trooper: shotgun, detpacks, heavy armor.', { helm: 1, armor: 1, pads: 2, weapon: 3, side: 1, expl: 2, extra: 2 }),
  T('scout', 'recon', 'Scout', '👟', 'Light and cheap: blaster + recon droid spots enemies.', { helm: 4, pads: 0, weapon: 0, gadget: 2, extra: 2, banner: 0 }),
  T('recon', 'recon', 'Recon', '🛰️', 'Sniper + droid spotter, mines to cover the retreat.', { helm: 4, pads: 0, weapon: 2, side: 1, expl: 1, gadget: 2, extra: 2, banner: 0 }),
  T('marksman', 'recon', 'Marksman', '🏹', 'Cheaper sharpshooter: sniper + commando pistol.', { helm: 1, pads: 1, weapon: 2, side: 1, expl: 0, banner: 0 }),
  T('emp-hunter', 'recon', 'EMP Hunter', '⚡', 'Hunts droids and tanks: EMP + mines + droid.', { helm: 3, pads: 1, weapon: 5, expl: 1, gadget: 2, banner: 0 }),
  T('medic', 'support', 'Medic', '🩹', 'Keeps the squad alive with health & ammo drops.', { helm: 0, pads: 1, weapon: 0, expl: 0, gadget: 5, extra: 2, banner: 0 }),
  T('demolitions', 'support', 'Demolitions', '🏗️', 'Cracks buildings: detpacks + rocket (one explosive type).', { helm: 3, pads: 1, weapon: 1, expl: 2, side: 0, banner: 0 }),
  T('sapper', 'support', 'Sapper', '⛏️', 'Mines chokepoints and repairs: fusion cutter + mines.', { helm: 3, pads: 0, weapon: 3, expl: 1, gadget: 4, banner: 0 }),
  T('turret-engineer', 'support', 'Turret Engineer', '🗼', 'Holds ground with a deployable auto turret.', { helm: 3, pads: 1, weapon: 0, expl: 1, gadget: 1, banner: 0 }),
  T('rally-captain', 'command', 'Rally Captain', '📣', 'Cheaper leader: blaster + rally call + cape.', { helm: 2, pads: 1, weapon: 0, side: 1, gadget: 6, extra: 1 }),
  T('field-marshal', 'command', 'Field Marshal', '🏅', 'Armored leader: EMP, rally call, heavy armor.', { helm: 2, armor: 1, pads: 2, weapon: 5, side: 1, expl: 3, gadget: 6, extra: 1 }),
]);
export const STARTER_IDS = Object.freeze(['trooper', 'heavy', 'sniper', 'engineer', 'jet', 'commander']);
export const templateById = (id) => TEMPLATES.find((x) => x.id === id) || null;
// icon picker: small emoji set; '' = auto icon from the main weapon
export const SLOT_ICONS = ['🪖', '🛡️', '🎯', '🔧', '🚀', '⭐', '🎖️', '💥', '🦘', '💣', '🧨', '🌀', '🦾', '👟', '🛰️', '🏹', '⚡', '🩹', '🏗️', '⛏️', '🗼', '📣', '🏅', '💀', '🐺', '🦅'];
export const WEAPON_ICONS = ['🔫', '🚀', '🎯', '💥', '🌀', '⚡'];
export const NAME_MAX = 16;
