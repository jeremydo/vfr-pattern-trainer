import { PHASES } from './state.js';
import { thresholdPos, headingVec } from './data/airports.js';
import { vref } from './data/aircraft_data.js';
import { windComponents, gustAddition } from './data/scenarios.js';

const DEG = Math.PI / 180;

function normHdg(h) { return ((h % 360) + 360) % 360; }
function hdgDiff(a, b) { const d = Math.abs(normHdg(a) - normHdg(b)); return d > 180 ? 360 - d : d; }

export class PatternChecker {
  constructor() {
    this.phase    = PHASES.CRUISE;
    this.warnings = [];
    this.guidance = '';
    this._downwindAltErrs  = [];
    this._finalSpeedErrs   = [];
    this._touchdownMetrics = null;
  }

  update(aircraft, airport, runway, activeEnd, scenario) {
    this.warnings = [];
    const elev       = airport.elevation;
    const agl        = aircraft.position.y - elev;
    const isTurbine  = aircraft.data.type === 'turbine';
    const patAGL     = isTurbine ? airport.turbinePatternAGL : airport.patternAGL;
    const patAltMSL  = elev + patAGL;
    const landingHdg = parseInt(activeEnd.id) * 10;
    const downwindHdg= normHdg(landingHdg + 180);
    const thr        = thresholdPos(runway, activeEnd.id, elev);
    const rwyVec     = headingVec(landingHdg);

    // Geometry relative to threshold
    const toPosX  = aircraft.position.x - thr.x;
    const toPosZ  = aircraft.position.z - thr.z;
    const latDev  = rwyVec.x * toPosZ - rwyVec.z * toPosX;   // + = right of CL
    const longDev = rwyVec.x * toPosX + rwyVec.z * toPosZ;   // + = past threshold
    const distToThr = Math.sqrt(toPosX * toPosX + toPosZ * toPosZ);

    // Glidepath angle from threshold
    let glidepath = 0;
    if (distToThr > 100 && longDev < 0) {
      glidepath = Math.atan2(agl, distToThr) / DEG;
    }

    // --- Phase detection ---
    let phase = PHASES.CRUISE;
    if (aircraft.onGround) {
      phase = PHASES.LANDED;
    } else if (agl < 60) {
      phase = PHASES.FLARE;
    } else if (
      hdgDiff(aircraft.heading, landingHdg) < 25 &&
      Math.abs(latDev) < 800 && longDev < 0
    ) {
      phase = PHASES.FINAL;
    } else if (
      hdgDiff(aircraft.heading, downwindHdg) < 25 &&
      distToThr > 2500 && distToThr < 14000 &&
      Math.abs(latDev) > 2000 && Math.abs(latDev) < 10000 &&
      agl > patAGL * 0.65
    ) {
      phase = PHASES.DOWNWIND;
    } else if (
      Math.min(
        hdgDiff(aircraft.heading, normHdg(landingHdg + 90)),
        hdgDiff(aircraft.heading, normHdg(landingHdg - 90))
      ) < 30 && agl < patAGL * 1.3 && agl > 150 && distToThr < 12000
    ) {
      phase = PHASES.BASE;
    } else if (distToThr < 35000 && agl < patAGL * 2.5) {
      phase = PHASES.APPROACH;
    }
    this.phase = phase;

    // --- Warnings & metrics ---
    const vrefSpd = vref(aircraft.data) + gustAddition(scenario);
    const { crosswind } = windComponents(scenario, landingHdg);

    if (phase === PHASES.DOWNWIND) {
      const err = aircraft.position.y - patAltMSL;
      this._downwindAltErrs.push(Math.abs(err));
      if (err >  200) this.warnings.push('HIGH — descend to pattern altitude');
      if (err < -200) this.warnings.push('LOW — climb to pattern altitude');
      if (aircraft.airspeed > aircraft.data.speeds.downwind + 15)
        this.warnings.push('Too fast — reduce power for downwind');
    }

    if (phase === PHASES.BASE) {
      if (aircraft.airspeed > aircraft.data.speeds.base + 15)
        this.warnings.push('Too fast for base — reduce power, extend flaps');
      if (aircraft.flaps === 0 && aircraft.data.flaps.length > 2)
        this.warnings.push('Consider flaps for base leg');
    }

    if (phase === PHASES.FINAL) {
      const sErr = aircraft.airspeed - vrefSpd;
      this._finalSpeedErrs.push(Math.abs(sErr));
      if (sErr >  15) this.warnings.push(`Too fast — target ${vrefSpd} kts`);
      if (sErr < -10) this.warnings.push('Too slow — add power!');
      if (aircraft.data.gear === 'retractable' && !aircraft.gearDown)
        this.warnings.push('GEAR NOT DOWN — extend gear now!');
      if (aircraft.flaps < aircraft.data.flaps.length - 1)
        this.warnings.push('Flaps — full flaps recommended');
      if (Math.abs(latDev) > 300)
        this.warnings.push(`Off centerline — correct ${latDev > 0 ? 'left' : 'right'}`);
      if (glidepath > 4.5)
        this.warnings.push('High on glidepath (all white PAPI)');
      else if (glidepath > 0 && glidepath < 1.5)
        this.warnings.push('Low on glidepath (all red PAPI)');
    }

    if (aircraft.airspeed < aircraft.data.vs0 + 5 && !aircraft.onGround)
      this.warnings.push('STALL WARNING');

    this.guidance = this._buildGuidance(phase, aircraft, airport, activeEnd, patAltMSL, vrefSpd, crosswind);
    return { glidepath };
  }

  _buildGuidance(phase, aircraft, airport, activeEnd, patAltMSL, vrefSpd, xwind) {
    const ac = aircraft.data;
    switch (phase) {
      case PHASES.CRUISE:
        return `Fly toward ${airport.id}. Descend to ${patAltMSL} ft MSL (pattern altitude).`;
      case PHASES.APPROACH:
        return `Approaching ${airport.id}. Enter on the 45° to the ${activeEnd.pattern === 'L' ? 'left' : 'right'} downwind for RW${activeEnd.id}.`;
      case PHASES.DOWNWIND:
        return `Downwind RW${activeEnd.id} — maintain ${patAltMSL} ft. Target ${ac.speeds.downwind} kts. Abeam the threshold: power back, flaps.`;
      case PHASES.BASE:
        return `Base leg — ${ac.speeds.base} kts, extend flaps${ac.gear === 'retractable' ? ', gear DOWN' : ''}. Don't overshoot final.`;
      case PHASES.FINAL:
        return `Final RW${activeEnd.id} — ${vrefSpd} kts${xwind > 3 ? `, crab ${Math.round(xwind * 0.7)}° into wind` : ''}. Full flaps. Aim for the numbers.`;
      case PHASES.FLARE:
        return 'Flare — idle power, raise nose slightly, let it settle.';
      case PHASES.LANDED:
        return 'Landed — brakes (B) to slow down.';
      default:
        return '';
    }
  }

  recordTouchdown(aircraft, airport, runway, activeEnd) {
    const elev       = airport.elevation;
    const landingHdg = parseInt(activeEnd.id) * 10;
    const thr        = thresholdPos(runway, activeEnd.id, elev);
    const rwyVec     = headingVec(landingHdg);
    const toPosX     = aircraft.position.x - thr.x;
    const toPosZ     = aircraft.position.z - thr.z;
    const longDist   = rwyVec.x * toPosX + rwyVec.z * toPosZ;
    const latDev     = Math.abs(rwyVec.x * toPosZ - rwyVec.z * toPosX);

    this._touchdownMetrics = {
      distFromThresh: longDist,
      lateralDev:     latDev,
      airspeed:       aircraft.airspeed,
      vs:             aircraft.vs,
      onRunway:       latDev < runway.width / 2 && longDist >= 0 && longDist < runway.length
    };
  }

  score(aircraft) {
    const m = this._touchdownMetrics;
    if (!m) return { score: 0, grade: 'F', breakdown: {}, detail: 'No landing recorded.' };

    let total = 0, bd = {};

    // Gear (20 pts)
    bd.gear = (aircraft.data.gear === 'fixed' || aircraft.gearDown) ? 20 : 0;
    total  += bd.gear;

    // Final speed (20 pts)
    const avgSpeedErr = this._finalSpeedErrs.length
      ? this._finalSpeedErrs.reduce((a, b) => a + b) / this._finalSpeedErrs.length : 20;
    bd.speed = Math.max(0, 20 - avgSpeedErr * 1.5);
    total   += bd.speed;

    // Pattern altitude (15 pts)
    const avgAltErr = this._downwindAltErrs.length
      ? this._downwindAltErrs.reduce((a, b) => a + b) / this._downwindAltErrs.length : 300;
    bd.altitude = Math.max(0, 15 - avgAltErr * 0.04);
    total      += bd.altitude;

    // Touchdown zone (20 pts)
    const d = m.distFromThresh;
    bd.zone = !m.onRunway ? 0
            : d < 0    ? 0
            : d < 200  ? 8    // before numbers
            : d < 1000 ? 20   // ideal
            : d < 2000 ? 12
            : 5;
    total  += bd.zone;

    // Centerline (15 pts)
    bd.centerline = m.onRunway ? Math.max(0, 15 - m.lateralDev * 0.08) : 0;
    total        += bd.centerline;

    // Sink rate (10 pts)
    const sink = Math.abs(m.vs);
    bd.sinkRate = sink < 300 ? 10 : sink < 700 ? Math.max(0, 10 - (sink - 300) * 0.025) : 0;
    total      += bd.sinkRate;

    const score = Math.round(Math.max(0, Math.min(100, total)));
    const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
    return { score, grade, breakdown: bd, touchdownMetrics: m };
  }
}
