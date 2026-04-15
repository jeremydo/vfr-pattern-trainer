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
    this.airspeed   = 0;     // knots
    this.vs         = 0;     // ft/min
    this._vsActual  = 0;     // ft/s, smoothed (drives position)
    this._rollInput = 0;     // -1..+1, used to animate ailerons
    this.throttle   = 0.55;
    this.flaps      = 0;
    this.gearDown   = data.gear === 'fixed';
    this.onGround   = false;

    this.mesh = this._buildMesh();
    scene.add(this.mesh);
  }

  place(x, y, z, headingDeg, airspeedKts) {
    this.position.set(x, y, z);
    this.heading  = headingDeg;
    this.pitch    = 0;
    this.bank     = 0;
    this.airspeed   = airspeedKts;
    this.vs         = 0;
    this._vsActual  = 0;
    this._rollInput = 0;
    this.flaps      = 0;
    this.gearDown   = this.data.gear === 'fixed';
    this.onGround   = false;
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
    this._rollInput   = controls.rollInput;
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
    if (this._gearGroup)  this._gearGroup.visible = this.gearDown;
    if (this._flapPivots) {
      const t     = this.flaps / Math.max(1, this.data.flaps.length - 1);
      const angle = -t * (35 * DEG);   // negative → trailing edge deflects down
      this._flapPivots.forEach(p => { p.rotation.x = angle; });
    }
    if (this._aileronPivots) {
      const maxAngle = 20 * DEG;
      // Antisymmetric: sx=+1 (right wing) down when rolling right, left wing up
      this._aileronPivots.forEach(({ pivot, sx }) => {
        pivot.rotation.x = -sx * this._rollInput * maxAngle;
      });
    }
  }

  _buildMesh() {
    const g  = new THREE.Group();
    const c  = this.data.color;
    const m  = col => new THREE.MeshLambertMaterial({ color: col });
    const mt = (col, op) => new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: op });

    // ── Fuselage — four sections tapering nose → tail ─────────────────────
    const fuseFwd = new THREE.Mesh(new THREE.BoxGeometry(4.0, 4.5, 12), m(c.body));
    fuseFwd.position.set(0, 0.3, 2);
    g.add(fuseFwd);

    // Octagonal mid section (more rounded appearance than a box)
    const fuseMid = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.6, 9, 8), m(c.body));
    fuseMid.rotation.x = Math.PI / 2;
    fuseMid.position.set(0, -0.1, -6);
    g.add(fuseMid);

    // Octagonal tail boom (tapers to small)
    const fuseTail = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.55, 8, 8), m(c.body));
    fuseTail.rotation.x = Math.PI / 2;   // radiusTop → aft end (small)
    fuseTail.position.set(0, -0.3, -14);
    g.add(fuseTail);

    // Belly fairing — smooths the underside transition
    const belly = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 9), m(c.body));
    belly.position.set(0, -2.0, 1.5);
    g.add(belly);

    // ── Livery accent stripe ──────────────────────────────────────────────
    const fuseStripe = new THREE.Mesh(new THREE.BoxGeometry(4.05, 1.1, 22), m(c.accent));
    fuseStripe.position.set(0, -0.5, -1.5);
    g.add(fuseStripe);

    // ── Windshield (raked semi-transparent panel) ─────────────────────────
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.2, 3.8), mt(0x334455, 0.80));
    windshield.position.set(0, 2.35, 7.0);
    windshield.rotation.x = 0.62;
    g.add(windshield);

    // ── Cabin windows + frames ────────────────────────────────────────────
    const winMat   = mt(0x2D3F50, 0.85);
    const frameMat = m(c.body);
    for (const sx of [1, -1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.55, 6.8), winMat);
      win.position.set(sx * 2.05, 1.05, 2.5);
      g.add(win);
      // Frame around each window
      const fTop = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.25, 7.2), frameMat);
      fTop.position.set(sx * 2.04, 1.9, 2.5);
      g.add(fTop);
      const fBot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.25, 7.2), frameMat);
      fBot.position.set(sx * 2.04, 0.25, 2.5);
      g.add(fBot);
    }

    // ── Door outlines (suggest fuselage door seams) ───────────────────────
    const doorMat = m(c.accent);
    for (const sx of [1, -1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 4.2), doorMat);
      door.position.set(sx * 2.06, -0.3, 4.0);
      g.add(door);
    }

    // ── Wings ─────────────────────────────────────────────────────────────
    const wingY  = this.data.wingHigh ? 2.1 : -0.9;
    const wZ     = 1;       // wing chord centre Z
    const wChord = 6.5;     // inner panel chord
    const wTE    = wZ - wChord / 2;   // = -2.25, trailing edge Z
    const oChord = 5.5;
    const oTE    = wZ - oChord / 2;   // outer panel TE

    // Inner panels (thick aerofoil at root)
    for (const sx of [1, -1]) {
      const wi = new THREE.Mesh(new THREE.BoxGeometry(13, 0.75, wChord), m(c.body));
      wi.position.set(sx * 8.5, wingY, wZ);
      g.add(wi);
    }
    // Outer panels (thinner, shorter chord)
    for (const sx of [1, -1]) {
      const wo = new THREE.Mesh(new THREE.BoxGeometry(12, 0.50, oChord), m(c.body));
      wo.position.set(sx * 21, wingY - 0.05, wZ);
      g.add(wo);
    }
    // Wing-tip caps
    for (const sx of [1, -1]) {
      const wt = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.38, 4.5), m(c.body));
      wt.position.set(sx * 27.5, wingY - 0.12, wZ);
      g.add(wt);
    }
    // Wing root fairings (blend into fuselage)
    for (const sx of [1, -1]) {
      const rf = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.55, wChord + 1.5), m(c.body));
      rf.position.set(sx * 3.5, wingY - 0.3, wZ);
      g.add(rf);
    }
    // Leading-edge accent stripe
    const wingStripe = new THREE.Mesh(new THREE.BoxGeometry(58, 0.15, 1.0), m(c.accent));
    wingStripe.position.set(0, wingY + 0.32, wZ + wChord / 2 - 0.8);
    g.add(wingStripe);

    // ── Wing struts (high-wing aircraft only — C172, C182) ─────────────────
    if (this.data.wingHigh) {
      const strutMat = m(c.body);
      const makeStrut = (x1, y1, z1, x2, y2, z2) => {
        const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, len, 5), strutMat);
        s.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
        s.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(dx, dy, dz).normalize()
        );
        return s;
      };
      g.add(makeStrut( 2.5, -1.5, 2.5,  14, wingY - 0.1, 0.0));
      g.add(makeStrut(-2.5, -1.5, 2.5, -14, wingY - 0.1, 0.0));
    }

    // ── Ailerons (outer wing trailing edge, animated antisymmetrically) ───
    // Each aileron is a child of a pivot group whose origin sits at its hinge
    // line (= outer panel trailing edge). Roll input drives them: one up, one down.
    this._aileronPivots = [1, -1].map(sx => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 21, wingY - 0.18, oTE);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.18, 1.9), m(c.body));
      panel.position.set(0, -0.09, -0.95);   // hangs aft of hinge at rest
      pivot.add(panel);
      g.add(pivot);
      return { pivot, sx };
    });

    // ── Flaps (inner wing trailing edge, animated) ────────────────────────
    // Each flap is a child of a pivot group whose origin sits at the hinge line
    // (= the wing's trailing edge). Rotating the pivot around X deploys the flap.
    const flapMat = m(c.body);
    this._flapPivots = [1, -1].map(sx => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 8.0, wingY - 0.18, wTE);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.20, 2.4), flapMat);
      panel.position.set(0, -0.10, -1.2);   // hangs aft of hinge at rest
      pivot.add(panel);
      g.add(pivot);
      return pivot;
    });

    // ── Nav lights ────────────────────────────────────────────────────────
    // Red = local +X side, Green = local -X side (pilot left/right convention)
    const navRed = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.9), m(0xDD2222));
    navRed.position.set(28.3, wingY, wZ);
    g.add(navRed);
    const navGreen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.9), m(0x22BB44));
    navGreen.position.set(-28.3, wingY, wZ);
    g.add(navGreen);
    const strobe = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), m(0xFFFFFF));
    strobe.position.set(0, 1.0, -18);
    g.add(strobe);

    // ── Pitot tube (left wing leading edge) ───────────────────────────────
    const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 3.2, 5), m(0x888888));
    pitot.rotation.z = Math.PI / 2;
    pitot.position.set(11, wingY - 0.15, wZ + wChord / 2 + 0.5);
    g.add(pitot);

    // ── VHF antenna (top of fuselage) ────────────────────────────────────
    const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.8, 0.12), m(0x333333));
    antenna.position.set(0, 4.8, -1.5);
    g.add(antenna);

    // ── Horizontal stabiliser ─────────────────────────────────────────────
    const hZ     = -13.2;
    const hChord = 4.0;
    const hTE    = hZ - hChord / 2;

    const hstabIn = new THREE.Mesh(new THREE.BoxGeometry(9, 0.50, hChord), m(c.body));
    hstabIn.position.set(0, 0.35, hZ);
    g.add(hstabIn);
    for (const sx of [1, -1]) {
      const ho = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.35, 3.2), m(c.body));
      ho.position.set(sx * 6.8, 0.25, hZ);
      g.add(ho);
    }
    // Elevator panels (trailing edge of h-stab, static)
    for (const sx of [1, -1]) {
      const elev = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.16, 1.7), m(c.body));
      elev.position.set(sx * 5.8, 0.18, hTE - 0.85);
      g.add(elev);
    }

    // ── Vertical stabiliser ───────────────────────────────────────────────
    const vChord = 4.5;
    const vZ     = -12.5;
    const vTE    = vZ - vChord / 2;

    const vstabLo = new THREE.Mesh(new THREE.BoxGeometry(0.55, 3.0, vChord), m(c.accent));
    vstabLo.position.set(0, 2.0, vZ);
    g.add(vstabLo);
    const vstabHi = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.4, 3.2), m(c.accent));
    vstabHi.position.set(0, 4.7, -11.8);
    g.add(vstabHi);
    // Rudder (trailing edge of v-stab, static)
    const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.55, 4.8, 1.7), m(c.accent));
    rudder.position.set(0, 2.9, vTE - 0.85);
    g.add(rudder);

    // ── Engine cowl ───────────────────────────────────────────────────────
    // Main cylindrical cowl body
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.35, 4.5, 10), m(c.accent));
    cowl.rotation.x = Math.PI / 2;
    cowl.position.set(0, 0.1, 10.5);
    g.add(cowl);
    // Cowl lip (ring where cowl meets fuselage)
    const cowlLip = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 10), m(c.body));
    cowlLip.rotation.x = Math.PI / 2;
    cowlLip.position.set(0, 0.1, 8.5);
    g.add(cowlLip);
    // Cheek intakes (air inlets either side of lower cowl)
    for (const sx of [1, -1]) {
      const intake = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 1.1), m(0x222222));
      intake.position.set(sx * 1.7, 0.1, 9.0);
      g.add(intake);
    }
    // Exhaust stacks (lower cowl)
    const exhMat = m(0x2A2A2A);
    for (const sx of [1, -1]) {
      const exh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.30, 4.0, 6), exhMat);
      exh.rotation.z = Math.PI / 2;
      exh.position.set(sx * 1.6, -1.7, 9.8);
      g.add(exh);
    }

    // ── Prop spinner + disk ───────────────────────────────────────────────
    // Spinner back ring (blends spinner into cowl)
    const spinnerRing = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.4, 10), m(c.accent));
    spinnerRing.rotation.x = Math.PI / 2;
    spinnerRing.position.set(0, 0.1, 13.1);
    g.add(spinnerRing);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 10), m(c.accent));
    spinner.rotation.x = -Math.PI / 2;
    spinner.position.set(0, 0.1, 14.4);
    g.add(spinner);
    const propMat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.35 });
    const prop = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.2, 14), propMat);
    prop.rotation.x = Math.PI / 2;
    prop.position.set(0, 0.1, 15.0);
    g.add(prop);

    // ── Landing gear ──────────────────────────────────────────────────────
    const gearGrp = new THREE.Group();
    const gm = m(c.gear);

    const addGear = (x, y, z) => {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 4.2, 6), gm);
      strut.position.set(x, y - 2.1, z);
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.8, 5), gm);
      axle.rotation.z = Math.PI / 2;
      axle.position.set(x, y - 4.3, z);
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 1.1, 12), gm);
      tyre.rotation.z = Math.PI / 2;
      tyre.position.set(x, y - 4.3, z);
      gearGrp.add(strut, axle, tyre);
      if (this.data.gear === 'fixed') {
        const fairing = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.35, 3.0, 10), m(c.body));
        fairing.rotation.z = Math.PI / 2;
        fairing.position.set(x, y - 4.3, z);
        gearGrp.add(fairing);
      }
    };

    addGear( 0, -1, 8);
    addGear(-9, -1, 0);
    addGear( 9, -1, 0);

    gearGrp.visible = this.gearDown;
    this._gearGroup = gearGrp;
    g.add(gearGrp);

    return g;
  }

  get flapLabel() { return flapLabel(this.data, this.flaps); }

  dispose() { this.scene.remove(this.mesh); }
}
