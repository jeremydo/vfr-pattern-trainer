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

// Sample corrected terrain elevation at a world (x, z) position from raw JSON data
function _sampleTerrainElev(wx, wz, data, airportElev) {
  const { grid, radiusFt, elevations } = data;
  const segs = grid - 1;
  const ci   = Math.floor(segs / 2);
  const avg4 = (elevations[ci*grid+ci] + elevations[ci*grid+(ci+1)] +
                elevations[(ci+1)*grid+ci] + elevations[(ci+1)*grid+(ci+1)]) / 4;
  const correction = airportElev - avg4;
  const j = Math.max(0, Math.min(segs, Math.round((wx + radiusFt) / (2 * radiusFt) * segs)));
  const i = Math.max(0, Math.min(segs, Math.round((wz + radiusFt) / (2 * radiusFt) * segs)));
  return (elevations[i * grid + j] ?? airportElev) + correction;
}

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

  // Starting position: chosen distance from airport at chosen compass direction
  const bearingRad = DIR_HDG[state.startDirection] * Math.PI / 180;
  const startX = Math.sin(bearingRad) * state.startDistance * NM;
  const startZ = -Math.cos(bearingRad) * state.startDistance * NM;
  const patAlt  = getPatternAlt(apt, acData.type === 'turbine');

  // Terrain — fetch pre-built JSON; sample elevation at spawn point so the
  // aircraft never starts underground when the entry direction is into mountains.
  // AGL above airport elevation at each starting distance
  const DIST_AGL = { 2: 1500, 5: 3000, 10: 5000, 20: 8000 };
  const agl = DIST_AGL[state.startDistance] ?? 1500;
  let startAlt = apt.elevation + agl;
  try {
    const res  = await fetch(`js/data/terrain/${apt.id}.json`);
    if (res.ok) {
      const tData = await res.json();
      scene.buildTerrain(apt, tData);
      // Ensure we're never underground — add 1000 ft clearance above spawn terrain
      const spawnElev = _sampleTerrainElev(startX, startZ, tData, apt.elevation);
      startAlt = Math.max(startAlt, spawnElev + 1000);
    }
  } catch (_) {}
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

  // Crash detection: hit terrain that isn't the runway surface.
  // onGround is only set true when position.y <= airportElevation (valid landing zone).
  // Turbo is a debug cheat — skip crash detection so mountains can be flown through.
  if (!ctrl.turbo && !ac.onGround) {
    const terrainElev = scene.sampleTerrainElevation(ac.position.x, ac.position.z);
    if (ac.position.y < terrainElev - 30) { _crashFlight(); return; }
  }

  const { glidepath } = checker.update(ac, apt, rwy, end, sc);
  if (glidepath > 0) airport.updatePAPI(end.id, glidepath);

  hud.update(ac, state, checker, sc, guideVisible, ctrl.turbo);
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

function _crashFlight() {
  hud.hide();
  const result = { score: 0, grade: 'F', crashed: true,
    breakdown: { gear:0, speed:0, altitude:0, zone:0, centerline:0, sinkRate:0 },
    touchdownMetrics: null };
  state.score = result;
  ui.renderDebrief(result);
  state.setScreen(SCREENS.DEBRIEF);
}
