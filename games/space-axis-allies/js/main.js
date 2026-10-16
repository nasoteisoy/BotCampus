import { Game } from './game.js';
import { Map3D } from './map3d.js';
import { UI } from './ui.js';
import { UNITS } from './data.js';

const game = new Game();
const viewport = document.getElementById('viewport');
const map = new Map3D(viewport, game);
map.refreshUnits();
const ui = new UI(game, map);

game.addLog('Axis & Allies 1942 in Space — hot-seat ready. Iron Khanate begins.');
ui.render();

// Expose for playtest / console
window.SAA = { game, map, ui };
window.SAA_UNITS = UNITS;
