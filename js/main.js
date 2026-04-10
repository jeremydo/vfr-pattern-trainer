import { AppState, SCREENS, PHASES } from './state.js';
import { Controls } from './controls.js';
import { SceneManager } from './scene.js';
import { Aircraft } from './aircraft.js';
import { AirportRenderer } from './airport_renderer.js';
import { PatternChecker } from './pattern.js';
import { HUD } from './hud.js';
import { UI } from './ui.js';
import { AIRCRAFT } from './data/aircraft_data.js';
import { getPatternAlt } from './data/airports.js';

const NM = 6076.12;   // feet per nautical mile
const DIR_HDG = { N:0, NE:45, E:90, SE:135, S:180, SW:225, W:270, NW:315 };

// ---- Singletons ----
const state   = new AppState();
const ctrl    = new Controls();
const ui      = new UI(state);
const canvas  = document.getElementById('game-canvas');
const scene   = new SceneManager(canvas);
const airport = new AirportRenderer(scene.scene);
const checker = new PatternChecker();
const hud     = new HUD();

let ac           = null;   // Aircraft instance
let paused       = false;
let prevTime     = null;
let landingWait  = 0;
let guideVisible = false;  // pattern guide on/off (persists across retries)

// ---- Boot ----
ui.renderMain();
state.setScreen(SCREENS.MAIN);
hud.hide();
requestAnimationFrame(_loop);   // start render loop immediately

document.addEventListener('startFlight', () => _startFlight().catch(console.error));

async function _startFlight() {
  const apt     = state.selectedAirport;
  const acData  = AIRCRAFT[state.selectedAircraft.id];
  const sc      = state.selectedScenario;

  if (ac) ac.dispose();

  // Re-init pattern checker
  checker.phase = PHASES.CRUISE;
  checker.warnings = [];
  checker.guidance = '';
  checker._downwindAltErrs  = [];
  checker._finalSpeedErrs   = [];
  checker._touchdownMetrics = null;

  // Scene setup
  airport.build(apt);
  scene.setGroundLevel(apt.elevation);
  scene.setSkyColor(sc.skyColor);
  scene.buildClouds(sc, apt.elevation);

  // Terrain — fetch pre-built JSON and apply; gracefully skip if missing
  try {
    const res  = await fetch(`js/data/terrain/${apt.id}.json`);
    if (res.ok) scene.buildTerrain(apt, await res.json());
  } catch (_) {}

  // Starting position: chosen distance from airport at chosen compass direction
  const bearingRad = DIR_HDG[state.startDirection] * Math.PI / 180;
  const startX = Math.sin(bearingRad) * state.startDistance * NM;
  const startZ = -Math.cos(bearingRad) * state.startDistance * NM;
  const patAlt  = getPatternAlt(apt, acData.type === 'turbine');
  const startAlt= patAlt + 1500;
  const inbound = (DIR_HDG[state.startDirection] + 180) % 360;

  ac = new Aircraft(acData, scene.scene);
  ac.place(startX, startAlt, startZ, inbound, acData.cruise * 0.85);
  ctrl.throttle = 0.58;

  scene.resize();
  scene.snapCamera(ac);
  scene.buildPatternGuide(apt, state.selectedRunway, state.selectedEnd, patAlt);
  scene.setPatternGuideVisible(guideVisible);
  state.startFlight();
  hud.show();

  paused      = false;
  prevTime    = null;
  landingWait = 0;
}

function _loop(ts) {
  requestAnimationFrame(_loop);
  if (state.screen !== SCREENS.FLIGHT) return;

  const dt = prevTime !== null ? Math.min((ts - prevTime) / 1000, 0.05) : 0.016;
  prevTime  = ts;

  ctrl.update(dt);

  if (ctrl.pause) {
    paused = !paused;
    document.getElementById('pause-overlay').style.display = paused ? 'flex' : 'none';
  }

  if (ctrl.guideToggle) {
    guideVisible = scene.togglePatternGuide();
  }

  if (!paused && ac) {
    try { _tick(dt); } catch(e) { console.error('Tick error:', e); }
  }

  scene.updateCamera(ac, paused ? 0 : dt);
  scene.render();
}

function _tick(dt) {
  const apt = state.selectedAirport;
  const sc  = state.selectedScenario;
  const rwy = state.selectedRunway;
  const end = state.selectedEnd;

  ac.update(dt, ctrl, sc, apt.elevation);

  const { glidepath } = checker.update(ac, apt, rwy, end, sc);
  if (glidepath > 0) airport.updatePAPI(end.id, glidepath);

  hud.update(ac, state, checker, sc, guideVisible);
  state.phase = checker.phase;

  if (checker.phase === PHASES.LANDED) {
    if (landingWait === 0) checker.recordTouchdown(ac, apt, rwy, end);
    landingWait += dt;
    if (landingWait > 4) _endFlight();
  }
}

function _endFlight() {
  hud.hide();
  const result = checker.score(ac);
  state.score  = result;
  state.recordFlight(result);
  ui.renderDebrief(result);
  state.setScreen(SCREENS.DEBRIEF);
}
