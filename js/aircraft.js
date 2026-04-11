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
    this.airspeed = 0;     // knots
    this.vs       = 0;     // ft/min
    this.throttle = 0.55;
    this.flaps    = 0;
    this.gearDown = data.gear === 'fixed';
    this.onGround = false;

    this.mesh = this._buildMesh();
    scene.add(this.mesh);
  }

  place(x, y, z, headingDeg, airspeedKts) {
    this.position.set(x, y, z);
    this.heading  = headingDeg;
    this.pitch    = 0;
    this.bank     = 0;
    this.airspeed = airspeedKts;
    this.vs       = 0;
    this.flaps    = 0;
    this.gearDown = this.data.gear === 'fixed';
    this.onGround = false;
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

    // Vertical speed
    const stallF = Math.max(0, Math.min(1, (this.airspeed - this.data.vs0 * 0.8) / (this.data.vs1 * 0.4)));
    const vsFPS  = this.airspeed * KTS * Math.sin(pitchRad) * stallF;
    this.vs      = vsFPS * 60;

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
    this.position.y += vsFPS * dt;

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
    const m = col => new THREE.MeshLambertMaterial({ color: col });

    // Fuselage
    const fuse = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 26), m(c.body));
    fuse.position.z = -2;
    g.add(fuse);

    // Wings — high for C172, low for others
    const wingY = this.data.wingHigh ? 1.5 : -0.5;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(38, 0.6, 6), m(c.body));
    wing.position.set(0, wingY, 1);
    g.add(wing);

    // Accent stripe along wing leading edge
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(40, 0.15, 1), m(c.accent));
    stripe.position.set(0, wingY + 0.3, -2);
    g.add(stripe);

    // H-stab
    const hstab = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 4), m(c.body));
    hstab.position.set(0, 0.5, -11);
    g.add(hstab);

    // V-stab
    const vstab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 4), m(c.accent));
    vstab.position.set(0, 3, -11);
    g.add(vstab);

    // Engine cowl / nose
    const cowl = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 3), m(c.accent));
    cowl.position.set(0, 0, 11.5);
    g.add(cowl);

    // Propeller disk
    const propMat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.35 });
    const prop = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.2, 12), propMat);
    prop.rotation.x = Math.PI / 2;
    prop.position.z = 13.5;
    g.add(prop);

    // Landing gear
    const gearGrp = new THREE.Group();
    const gm = m(c.gear);

    const addGear = (x, y, z) => {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 4, 6), gm);
      strut.position.set(x, y - 2, z);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.9, 8), gm);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, y - 4.5, z);
      gearGrp.add(strut, wheel);
    };
    addGear(0, -1, 8);      // nose
    addGear(-9, -1, 0);     // left main
    addGear( 9, -1, 0);     // right main

    gearGrp.visible = this.gearDown;
    this._gearGroup = gearGrp;
    g.add(gearGrp);

    return g;
  }

  get flapLabel() { return flapLabel(this.data, this.flaps); }

  dispose() { this.scene.remove(this.mesh); }
}
