import { PHASES } from './state.js';
import { vref } from './data/aircraft_data.js';
import { gustAddition } from './data/scenarios.js';

export class HUD {
  _el(id) { return document.getElementById(id); }

  update(aircraft, appState, checker, scenario) {
    const elev   = appState.selectedAirport.elevation;
    const agl    = Math.round(aircraft.position.y - elev);
    const vr     = vref(aircraft.data) + gustAddition(scenario);
    const phase  = checker.phase;
    const asp    = Math.round(aircraft.airspeed);

    // Airspeed
    this._el('hud-airspeed').textContent = asp;
    const aspBox = this._el('hud-airspeed-box');
    aspBox.className = 'hud-box' +
      (aircraft.airspeed < aircraft.data.vs0 + 5 ? ' danger' :
       aircraft.airspeed > aircraft.data.vno      ? ' caution' : '');
    this._el('hud-vref').textContent = `Vref ${vr}`;

    // Speed target
    let tgt = null;
    if (phase === PHASES.DOWNWIND) tgt = aircraft.data.speeds.downwind;
    else if (phase === PHASES.BASE) tgt = aircraft.data.speeds.base;
    else if (phase === PHASES.FINAL || phase === PHASES.FLARE) tgt = vr;
    this._el('hud-target-speed').textContent = tgt ? `▶ ${tgt} kts` : '';

    // Altitude
    this._el('hud-altitude').textContent = Math.round(aircraft.position.y).toLocaleString();
    this._el('hud-agl').textContent = `${agl} AGL`;

    const patAlt = appState.selectedAirport.elevation +
      (aircraft.data.type === 'turbine'
        ? appState.selectedAirport.turbinePatternAGL
        : appState.selectedAirport.patternAGL);
    const altDiff = aircraft.position.y - patAlt;
    const patEl   = this._el('hud-pat-alt');
    patEl.textContent = `PAT ${Math.round(patAlt)} ft ${Math.abs(altDiff) < 100 ? '✓' : altDiff > 0 ? '▼' : '▲'}`;
    patEl.style.color = Math.abs(altDiff) < 100 ? '#00FF88' : Math.abs(altDiff) < 300 ? '#FFCC00' : '#FF4444';

    // VSI
    const vs   = Math.round(aircraft.vs / 10) * 10;
    const vsEl = this._el('hud-vsi');
    vsEl.textContent = (vs >= 0 ? '+' : '') + vs + ' fpm';
    vsEl.style.color = vs < -800 ? '#FF4444' : vs > 500 ? '#88FF88' : '#FFFFFF';

    // Heading
    this._el('hud-heading').textContent = String(Math.round(aircraft.heading)).padStart(3, '0') + '°';

    // Throttle
    this._el('hud-throttle-fill').style.width = Math.round(aircraft.throttle * 100) + '%';
    this._el('hud-throttle-pct').textContent  = Math.round(aircraft.throttle * 100) + '%';

    // Flaps
    this._el('hud-flaps').textContent = aircraft.flapLabel;

    // Gear
    const gearEl = this._el('hud-gear');
    if (aircraft.data.gear === 'fixed') {
      gearEl.textContent  = 'FIXED';
      gearEl.className    = 'hud-indicator gear-fixed';
    } else {
      gearEl.textContent  = aircraft.gearDown ? 'DOWN' : 'UP';
      gearEl.className    = 'hud-indicator ' + (aircraft.gearDown ? 'gear-down' : 'gear-up');
    }

    // Phase badge
    const phEl = this._el('hud-phase');
    phEl.textContent = phase;
    phEl.className   = 'phase-badge phase-' + phase.toLowerCase();

    // Warnings
    this._el('hud-warnings').innerHTML = checker.warnings
      .map(w => `<div class="warn-item">${w}</div>`).join('');

    // Guidance
    this._el('hud-guidance').textContent = checker.guidance;

    // Wind
    const sc = scenario;
    this._el('hud-wind').textContent = sc.windSpeed === 0 ? 'CALM'
      : `${String(sc.windFrom).padStart(3,'0')}°@${sc.windSpeed}${sc.windGust ? 'G'+sc.windGust : ''} kts`;

    // Distance
    const dist = Math.sqrt(aircraft.position.x**2 + aircraft.position.z**2);
    this._el('hud-dist').textContent = (dist / 6076.12).toFixed(1) + ' nm';

    // Stall flash
    this._el('stall-flash').style.display =
      aircraft.airspeed < aircraft.data.vs0 + 5 && !aircraft.onGround ? 'flex' : 'none';
  }

  show() { this._el('hud').style.display = 'block'; }
  hide() { this._el('hud').style.display = 'none'; }
}
