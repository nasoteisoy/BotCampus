// Captain Bridge r1 data: the six departments, the officer at each bridge station, and the flight plans.
// All names and numbers are made up for the game (public-safe).

// status: ok = all good, busy = working on it, alert = needs the captain
export const STATUS = {
  ok: { icon: 'check', color: '#2fbf71', label: 'All good' },
  busy: { icon: 'clock', color: '#ffb020', label: 'Working' },
  alert: { icon: 'alert', color: '#ff5a5a', label: 'Needs you' },
};

// Departments (one bridge station each). color tints the officer's suit, the station console and the icons.
export const DEPTS = [
  { id: 'eng', name: 'Engineering', icon: 'wrench', color: '#ff8a3d', status: 'ok', lines: [['zap', 'Reactor 98%'], ['gauge', 'Engines ready']] },
  { id: 'wpn', name: 'Weapons', icon: 'crosshair', color: '#ff4f6d', status: 'busy', lines: [['shield', 'Shields up'], ['clock', 'Guns: reloading']] },
  { id: 'fly', name: 'Flight Ops', icon: 'plane', color: '#ffd23f', status: 'alert', lines: [['plane', '8 fighters ready'], ['alert', 'Gold wing late']] },
  { id: 'med', name: 'Medical', icon: 'cross', color: '#3ddc84', status: 'ok', lines: [['heart', 'Crew healthy'], ['users', '2 resting']] },
  { id: 'nav', name: 'Navigation', icon: 'compass', color: '#4fc3ff', status: 'ok', lines: [['route', 'On course'], ['clock', 'Gate in 12 min']] },
  { id: 'sci', name: 'Science', icon: 'atom', color: '#b388ff', status: 'busy', lines: [['scan', 'Scanning nebula'], ['planet', '1 new planet']] },
];

// One officer per department. pos = station spot on the bridge (metres), face = yaw toward the console.
export const OFFICERS = [
  { dept: 'eng', name: 'Rook Tanaka', role: 'Chief Engineer', status: 'ok' },
  { dept: 'wpn', name: 'Vera Kade', role: 'Weapons Officer', status: 'busy' },
  { dept: 'fly', name: 'Juno Park', role: 'Flight Boss', status: 'alert' },
  { dept: 'med', name: 'Dr. Ines Mora', role: 'Ship Doctor', status: 'ok' },
  { dept: 'nav', name: 'Leo Brandt', role: 'Navigator', status: 'ok' },
  { dept: 'sci', name: 'Ada Quill', role: 'Science Officer', status: 'busy' },
];

// Flight plans. Routes are waypoints in the outside scene (carrier at the origin, nose +Z, metres).
// kind: route = the carrier's own course, sortie = a fighter wing's patrol loop.
export const PLANS = [
  { id: 'r1', kind: 'route', icon: 'route', name: 'To Rigel Gate', color: '#4fc3ff', when: '12 min', status: 'ok',
    pts: [[0, 0, 180], [140, 30, 520], [80, 60, 900], [-160, 40, 1250]] },
  { id: 'r2', kind: 'route', icon: 'route', name: 'Back to Port', color: '#9fe7ff', when: 'Later', status: 'busy',
    pts: [[0, 0, -120], [-220, -30, -420], [-420, -60, -560]] },
  { id: 's1', kind: 'sortie', icon: 'plane', name: 'Gold wing', color: '#ffd23f', when: 'Now', status: 'alert', ships: 4,
    loop: { c: [260, 20, 260], r: 120 } },
  { id: 's2', kind: 'sortie', icon: 'plane', name: 'Red wing', color: '#ff7a59', when: '20 min', status: 'ok', ships: 2,
    loop: { c: [-260, -10, 120], r: 90 } },
];
