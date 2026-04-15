import * as THREE from 'three';
import { flapLabel } from './data/aircraft_data.js';

const DEG = Math.PI / 180;
const KTS = 1.68781;   // knots → ft/s

function lerp(a, b, t) { return a + (b - a) * Math.min(1, t); }

export class Aircraft {
  constructor(data, scene) {
    this.data     = data;
    this.scene    = scene;

    this.position = new THREE.Vector3();
    this.heading  = 0;     // degrees
    this.pitch    = 0;     // degrees, +up
    this.bank     = 0;     // degrees, +right wing down
    this.airspeed  = 0;     // knots
    this.vs        = 0;     // ft/min
    this._vsActual = 0;     // ft/s, smoothed (drives position)
    this.throttle  = 0.55;
    this.flaps     = 0;
    this.gearDown  = data.gear === 'fixed';
    this.onGround  = false;

    this.mesh = this._buildMesh();
    scene.add(this.mesh);
  }

  place(x, y, z, headingDeg, airspeedKts) {
    this.position.set(x, y, z);
    this.heading  = headingDeg;
    this.pitch    = 0;
    this.bank     = 0;
    this.airspeed  = airspeedKts;
    this.vs        = 0;
    this._vsActual = 0;
    this.flaps     = 0;
    this.gearDown  = this.data.gear === 'fixed';
    this.onGround  = false;
    this._syncMesh();
  }

  update(dt, controls, scenario, airportElevation) {
    this.throttle = controls.throttle;

    if (this.onGround) { this._groundUpdate(dt, controls); return; }

    // Gear / flap toggles
    if (controls.gearToggle && this.data.gear === 'retractable') {
      this.gearDown = !this.gearDown;
    }
    if (controls.flapsDown) this.flaps = Math.min(this.data.flaps.length - 1, this.flaps + 1);
    if (controls.flapsUp)   this.flaps = Math.max(0, this.flaps - 1);

    // Attitude
    const pitchTarget = controls.pitchInput * this.data.maxPitch;
    const bankTarget  = controls.rollInput  * this.data.maxBank;
    this.pitch = lerp(this.pitch, pitchTarget, this.data.pitchRate * dt);
    this.bank  = lerp(this.bank,  bankTarget,  this.data.rollRate  * dt);

    // Airspeed — converges toward throttle-driven target, modulated by pitch energy
    const flapDrag = this.data.flapDrag[this.flaps];
    const gearDrag = (this.gearDown && this.data.gear === 'retractable') ? this.data.gearDrag : 0;
    let effCruise  = this.data.cruise * (1 - flapDrag - gearDrag);
    if (this.flaps > 0 && this.data.vfe[this.flaps]) effCruise = Math.min(effCruise, this.data.vfe[this.flaps]);
    if (this.gearDown && this.data.vge) effCruise = Math.min(effCruise, this.data.vge);

    const pitchRad    = this.pitch * DEG;
    const gravKts     = 32.2 * Math.sin(pitchRad) / KTS;

    if (controls.turbo) {
      this.airspeed = 1000;
    } else {
      const targetSpeed = this.data.vs1 + (effCruise - this.data.vs1) * this.throttle;
      this.airspeed += (targetSpeed - this.airspeed) * this.data.accelRate * dt - gravKts * dt;
      this.airspeed  = Math.max(this.data.vs0 * 0.7, Math.min(this.data.vne, this.airspeed));
    }

    // Vertical speed — smoothed so flare feels gradual (~0.33 s time constant)
    const stallF      = Math.max(0, Math.min(1, (this.airspeed - this.data.vs0 * 0.8) / (this.data.vs1 * 0.4)));
    const targetVsFPS = this.airspeed * KTS * Math.sin(pitchRad) * stallF;
    this._vsActual    = lerp(this._vsActual, targetVsFPS, 3.0 * dt);
    this.vs           = this._vsActual * 60;

    // Ground effect: within 40 ft AGL, cushion descent (reduced induced drag near
    // the surface causes the natural "float" pilots experience during flare)
    const agl = this.position.y - airportElevation;
    let effectiveVsFPS = this._vsActual;
    if (this._vsActual < 0 && agl < 40) {
      const ge = Math.max(0, 1 - agl / 40);   // 0 at 40 ft → 1 at surface
      effectiveVsFPS = this._vsActual * (1 - ge * 0.4);  // up to 40% reduction
    }

    // Heading change from bank
    const bankRad   = this.bank * DEG;
    const airFPS    = Math.max(1, this.airspeed * KTS);
    const turnRateD = -(32.2 * Math.tan(bankRad) / airFPS) / DEG;
    this.heading    = (this.heading + turnRateD * dt + 360) % 360;

    // Position
    const hdgRad = this.heading * DEG;
    const hSpeed = this.airspeed * KTS * Math.cos(pitchRad);
    this.position.x += Math.sin(hdgRad) * hSpeed * dt;
    this.position.z -= Math.cos(hdgRad) * hSpeed * dt;
    this.position.y += effectiveVsFPS * dt;

    // Wind drift
    if (scenario && scenario.windSpeed > 0) {
      const wRad = (scenario.windFrom + 180) * DEG;
      const wFPS = scenario.windSpeed * KTS;
      this.position.x += Math.sin(wRad) * wFPS * dt;
      this.position.z -= Math.cos(wRad) * wFPS * dt;
    }

    // Ground
    if (this.position.y <= airportElevation) {
      this.position.y = airportElevation;
      this._vsActual  = 0;
      this.onGround   = true;
    }

    this._syncMesh();
  }

  _groundUpdate(dt, controls) {
    const decel = controls.braking ? 10 : 2;
    const spd   = Math.max(0, this.airspeed * KTS - decel * dt);
    this.airspeed = spd / KTS;
    this.pitch    = lerp(this.pitch, 0, 4 * dt);
    this.bank     = lerp(this.bank,  0, 4 * dt);
    this.vs       = 0;
    if (this.airspeed > 0.5) {
      const h = this.heading * DEG;
      this.position.x += Math.sin(h) * spd * dt;
      this.position.z -= Math.cos(h) * spd * dt;
    }
    this._syncMesh();
  }

  _syncMesh() {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y =  Math.PI - this.heading * DEG;
    this.mesh.rotation.x = -this.pitch  * DEG;
    this.mesh.rotation.z = -this.bank   * DEG;
    if (this._gearGroup) this._gearGroup.visible = this.gearDown;
  }

  _buildMesh() {
    const g = new THREE.Group();
    const c = this.data.color;
    const m  = col => new THREE.MeshLambertMaterial({ color: col });
    const mt = (col, op) => new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: op });

    // ── Fuselage — three tapered sections (cabin → mid → tail) ───────────────
    // Forward / cabin section (tallest and widest)
    const fuseFwd = new THREE.Mesh(new THREE.BoxGeometry(4.0, 4.5, 12), m(c.body));
    fuseFwd.position.set(0, 0.3, 2);
    g.add(fuseFwd);

    // Mid-aft section (steps down in cross-section)
    const fuseMid = new THREE.Mesh(new THREE.BoxGeometry(3.1, 3.2, 9), m(c.body));
    fuseMid.position.set(0, -0.2, -6);
    g.add(fuseMid);

    // Tail cone (narrow)
    const fuseTail = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.2, 7), m(c.body));
    fuseTail.position.set(0, -0.6, -13.5);
    g.add(fuseTail);

    // ── Livery accent stripe along fuselage sides ────────────────────────────
    const fuseStripe = new THREE.Mesh(new THREE.BoxGeometry(4.05, 1.1, 21), m(c.accent));
    fuseStripe.position.set(0, -0.6, -1);
    g.add(fuseStripe);

    // ── Windshield (raked panel) ─────────────────────────────────────────────
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.2, 3.8), mt(0x334455, 0.80));
    windshield.position.set(0, 2.35, 7.0);
    windshield.rotation.x = 0.62;   // ~35° rake
    g.add(windshield);

    // ── Cabin side windows ───────────────────────────────────────────────────
    const winMat = mt(0x2D3F50, 0.85);
    const winL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.7, 7.5), winMat);
    winL.position.set(2.05, 1.0, 2.5);
    g.add(winL);
    const winR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.7, 7.5), winMat);
    winR.position.set(-2.05, 1.0, 2.5);
    g.add(winR);

    // ── Wings ────────────────────────────────────────────────────────────────
    const wingY = this.data.wingHigh ? 2.1 : -0.9;

    // Inner panels (thicker root, full chord)
    const wingInL = new THREE.Mesh(new THREE.BoxGeometry(13, 0.75, 6.5), m(c.body));
    wingInL.position.set( 8.5, wingY, 1);
    g.add(wingInL);
    const wingInR = new THREE.Mesh(new THREE.BoxGeometry(13, 0.75, 6.5), m(c.body));
    wingInR.position.set(-8.5, wingY, 1);
    g.add(wingInR);

    // Outer panels (thinner, slightly shorter chord)
    const wingOutL = new THREE.Mesh(new THREE.BoxGeometry(12, 0.50, 5.5), m(c.body));
    wingOutL.position.set( 21, wingY - 0.05, 1);
    g.add(wingOutL);
    const wingOutR = new THREE.Mesh(new THREE.BoxGeometry(12, 0.50, 5.5), m(c.body));
    wingOutR.position.set(-21, wingY - 0.05, 1);
    g.add(wingOutR);

    // Wing-tip caps
    const tipL = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.38, 4.5), m(c.body));
    tipL.position.set( 27.5, wingY - 0.12, 1);
    g.add(tipL);
    const tipR = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.38, 4.5), m(c.body));
    tipR.position.set(-27.5, wingY - 0.12, 1);
    g.add(tipR);

    // Wing leading-edge accent stripe
    const wingStripe = new THREE.Mesh(new THREE.BoxGeometry(58, 0.15, 1.0), m(c.accent));
    wingStripe.position.set(0, wingY + 0.32, -1.8);
    g.add(wingStripe);

    // ── Horizontal stabiliser ────────────────────────────────────────────────
    const hstabIn = new THREE.Mesh(new THREE.BoxGeometry(9, 0.50, 4.0), m(c.body));
    hstabIn.position.set(0, 0.4, -13);
    g.add(hstabIn);

    const hstabOutL = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.35, 3.2), m(c.body));
    hstabOutL.position.set( 6.8, 0.3, -13);
    g.add(hstabOutL);
    const hstabOutR = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.35, 3.2), m(c.body));
    hstabOutR.position.set(-6.8, 0.3, -13);
    g.add(hstabOutR);

    // ── Vertical stabiliser (two boxes for slight taper) ─────────────────────
    const vstabLo = new THREE.Mesh(new THREE.BoxGeometry(0.55, 3.0, 4.5), m(c.accent));
    vstabLo.position.set(0, 2.0, -12.5);
    g.add(vstabLo);

    const vstabHi = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.2, 3.2), m(c.accent));
    vstabHi.position.set(0, 4.6, -11.8);
    g.add(vstabHi);

    // ── Engine cowl (cylindrical) ─────────────────────────────────────────────
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.35, 4.5, 8), m(c.accent));
    cowl.rotation.x = Math.PI / 2;
    cowl.position.set(0, 0.1, 10.5);
    g.add(cowl);

    // ── Prop spinner (cone) ──────────────────────────────────────────────────
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 8), m(c.accent));
    spinner.rotation.x = -Math.PI / 2;
    spinner.position.set(0, 0.1, 14.0);
    g.add(spinner);

    // ── Propeller disk ───────────────────────────────────────────────────────
    const propMat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.35 });
    const prop = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.2, 12), propMat);
    prop.rotation.x = Math.PI / 2;
    prop.position.set(0, 0.1, 14.6);
    g.add(prop);

    // ── Landing gear ─────────────────────────────────────────────────────────
    const gearGrp = new THREE.Group();
    const gm = m(c.gear);

    const addGear = (x, y, z) => {
      // Strut (slightly tapered)
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 4.2, 6), gm);
      strut.position.set(x, y - 2.1, z);
      // Axle
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.8, 5), gm);
      axle.rotation.z = Math.PI / 2;
      axle.position.set(x, y - 4.3, z);
      // Tyre
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 1.1, 10), gm);
      tyre.rotation.z = Math.PI / 2;
      tyre.position.set(x, y - 4.3, z);
      gearGrp.add(strut, axle, tyre);

      // Wheel fairing for fixed-gear aircraft
      if (this.data.gear === 'fixed') {
        const fairing = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.35, 3.0, 8), m(c.body));
        fairing.rotation.z = Math.PI / 2;
        fairing.position.set(x, y - 4.3, z);
        gearGrp.add(fairing);
      }
    };

    addGear( 0, -1, 8);    // nose
    addGear(-9, -1, 0);    // left main
    addGear( 9, -1, 0);    // right main

    gearGrp.visible = this.gearDown;
    this._gearGroup = gearGrp;
    g.add(gearGrp);

    return g;
  }

  get flapLabel() { return flapLabel(this.data, this.flaps); }

  dispose() { this.scene.remove(this.mesh); }
}
