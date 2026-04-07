import * as THREE from 'three';
import { headingVec, thresholdPos } from './data/airports.js';

export class SceneManager {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, 1, 1, 500000);

    this._camPos    = new THREE.Vector3();
    this._camLook   = new THREE.Vector3();
    this._camPosTgt = new THREE.Vector3();
    this._camLookTgt= new THREE.Vector3();

    this._clouds = [];
    this._patternGuide = null;

    this._buildLighting();
    this._buildGround();
    this._buildSky();

    this.scene.background = new THREE.Color(0x87CEEB);
    this.scene.fog = new THREE.Fog(0x87CEEB, 10000, 220000);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  _buildLighting() {
    this.scene.add(new THREE.AmbientLight(0xFFFFFF, 0.65));
    const sun = new THREE.DirectionalLight(0xFFFAEE, 1.2);
    sun.position.set(80000, 60000, -40000);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xCCDDFF, 0.3);
    fill.position.set(-50000, 20000, 50000);
    this.scene.add(fill);
  }

  _buildGround() {
    // Organic tile texture: irregular field patches, no grid
    const size = 512;
    const cvs  = document.createElement('canvas');
    cvs.width = cvs.height = size;
    const ctx  = cvs.getContext('2d');

    ctx.fillStyle = '#5C7A3C';
    ctx.fillRect(0, 0, size, size);

    // Irregular farm / field patches
    const patches = [
      { x:  30, y:  20, w: 190, h: 150, c: '#4E7030' },
      { x: 260, y:  15, w: 210, h: 130, c: '#6A8840' },
      { x:  10, y: 260, w: 160, h: 220, c: '#527838' },
      { x: 310, y: 210, w: 180, h: 200, c: '#4A7235' },
      { x: 110, y: 160, w: 130, h: 110, c: '#C8B060' }, // crop
      { x: 370, y: 340, w: 130, h: 150, c: '#D4B870' }, // crop
      { x: 200, y: 340, w: 100, h: 140, c: '#7A9048' },
    ];
    patches.forEach(p => {
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, p.w, p.h);
    });

    // Subtle tonal variation dots
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#496929' : '#6B9045';
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(280, 280);

    this.groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1400000, 1400000),
      new THREE.MeshLambertMaterial({ map: tex })
    );
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.groundMesh);

    this._buildScenery();
  }

  _buildScenery() {
    this._sceneryGroup = new THREE.Group();
    this.scene.add(this._sceneryGroup);

    const rng   = (a, b) => a + Math.random() * (b - a);
    const place = (minR, maxR) => {
      const a = Math.random() * Math.PI * 2;
      const d = minR + Math.random() * (maxR - minR);
      return { x: Math.cos(a) * d, z: Math.sin(a) * d };
    };

    // --- Trees ---
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5C3A1E });
    const foliageMats = [0x2D6A2D, 0x357B35, 0x286228, 0x3E7A3E]
      .map(c => new THREE.MeshLambertMaterial({ color: c }));

    for (let i = 0; i < 220; i++) {
      const { x, z } = place(2800, 50000);
      const h = rng(25, 65);

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(2, 4, h * 0.45, 5),
        trunkMat
      );
      trunk.position.set(x, h * 0.22, z);

      const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(h * 0.32, h * 0.72, 6),
        foliageMats[i % foliageMats.length]
      );
      foliage.position.set(x, h * 0.72, z);

      this._sceneryGroup.add(trunk, foliage);
    }

    // --- Houses ---
    const wallCols = [0xD4C4A8, 0xC8B898, 0xDDD0B0, 0xBFBFA8];
    const roofCols = [0x8B3A2F, 0x9B4535, 0x7A3025, 0xA05040];

    for (let i = 0; i < 30; i++) {
      const { x: bx, z: bz } = place(3500, 42000);
      const count = Math.floor(rng(1, 4));
      for (let j = 0; j < count; j++) {
        const ox = bx + rng(-250, 250);
        const oz = bz + rng(-250, 250);
        const w = rng(55, 110), d = rng(45, 85), h = rng(22, 42);

        const body = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ color: wallCols[(i + j) % wallCols.length] })
        );
        body.position.set(ox, h / 2, oz);

        const roof = new THREE.Mesh(
          new THREE.CylinderGeometry(0, Math.max(w, d) * 0.62, h * 0.55, 4),
          new THREE.MeshLambertMaterial({ color: roofCols[(i + j) % roofCols.length] })
        );
        roof.position.set(ox, h + h * 0.27, oz);
        roof.rotation.y = Math.PI / 4;

        this._sceneryGroup.add(body, roof);
      }
    }
  }

  _buildSky() {
    this.skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(400000, 16, 8),
      new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide })
    );
    this.scene.add(this.skyDome);
  }

  setSkyColor(hexStr) {
    const col = new THREE.Color(hexStr);
    this.skyDome.material.color.copy(col);
    this.scene.background = col;
    this.scene.fog = new THREE.Fog(col, 10000, 220000);
  }

  setGroundLevel(elevation) {
    this.groundMesh.position.y = elevation;
    if (this._sceneryGroup) this._sceneryGroup.position.y = elevation - 3;
  }

  buildClouds(scenario, airportElevation) {
    this._clouds.forEach(c => this.scene.remove(c));
    this._clouds = [];

    for (const layer of scenario.clouds) {
      const altFt   = airportElevation + layer.agl;
      const opacity = layer.coverage === 'FEW' ? 0.5 : layer.coverage === 'SCT' ? 0.70 : 0.88;
      const count   = layer.coverage === 'FEW' ? 25 : layer.coverage === 'SCT' ? 55 : 110;

      for (let i = 0; i < count; i++) {
        const w = 2800 + Math.random() * 5000;
        const d = 1400 + Math.random() * 2600;
        const cloud = new THREE.Mesh(
          new THREE.BoxGeometry(w, 550, d),
          new THREE.MeshLambertMaterial({ color: 0xF0F4F8, transparent: true, opacity })
        );
        cloud.position.set(
          (Math.random() - 0.5) * 260000,
          altFt + (Math.random() - 0.5) * 400,
          (Math.random() - 0.5) * 260000
        );
        this.scene.add(cloud);
        this._clouds.push(cloud);
      }
    }
  }

  // Smooth chase camera — 220 ft behind, 80 ft above
  updateCamera(aircraft, dt) {
    if (!aircraft) return;
    const r    = aircraft.heading * Math.PI / 180;
    const fwdX = Math.sin(r), fwdZ = -Math.cos(r);
    const pitchY = Math.sin(-aircraft.pitch * Math.PI / 180);

    this._camPosTgt.set(
      aircraft.position.x - fwdX * 220,
      aircraft.position.y + 80 + pitchY * 30,
      aircraft.position.z - fwdZ * 220
    );
    this._camLookTgt.set(
      aircraft.position.x + fwdX * 380,
      aircraft.position.y - 15,
      aircraft.position.z + fwdZ * 380
    );

    const s = Math.min(1, 6 * dt);
    this._camPos.lerp(this._camPosTgt, s);
    this._camLook.lerp(this._camLookTgt, s);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLook);
  }

  snapCamera(aircraft) {
    const r = aircraft.heading * Math.PI / 180;
    const fwdX = Math.sin(r), fwdZ = -Math.cos(r);
    this._camPos.set(aircraft.position.x - fwdX*220, aircraft.position.y + 80, aircraft.position.z - fwdZ*220);
    this._camLook.set(aircraft.position.x + fwdX*380, aircraft.position.y - 15, aircraft.position.z + fwdZ*380);
    this._camPosTgt.copy(this._camPos);
    this._camLookTgt.copy(this._camLook);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLook);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ── Pattern guide ─────────────────────────────────────────────
  buildPatternGuide(airport, runway, activeEnd, patternAltMSL) {
    if (this._patternGuide) {
      this.scene.remove(this._patternGuide);
      this._patternGuide = null;
    }

    const elev   = airport.elevation;
    const patY   = patternAltMSL;
    const patAGL = patternAltMSL - elev;
    const landingHdg = parseInt(activeEnd.id) * 10;

    const rwyVec  = headingVec(landingHdg);
    const downDir = headingVec((landingHdg + 180) % 360);
    const perpVec = activeEnd.pattern === 'L'
      ? headingVec((landingHdg + 270) % 360)
      : headingVec((landingHdg +  90) % 360);

    const thr  = thresholdPos(runway, activeEnd.id, elev);
    const dptX = thr.x + rwyVec.x * runway.length;
    const dptZ = thr.z + rwyVec.z * runway.length;

    // Geometry constants (feet)
    const OFFSET    = 4500;
    const PAST_THR  = 2500;
    const FINAL_EXT = 7000;
    const TURN_R    = 1400;  // turn radius at each corner

    // Corner waypoints
    const pDW    = new THREE.Vector3(dptX + perpVec.x * OFFSET, patY,
                                     dptZ + perpVec.z * OFFSET);
    const pBase  = new THREE.Vector3(thr.x + downDir.x * PAST_THR + perpVec.x * OFFSET, patY,
                                     thr.z + downDir.z * PAST_THR + perpVec.z * OFFSET);
    const pFinal = new THREE.Vector3(thr.x + downDir.x * PAST_THR, elev + patAGL * 0.55,
                                     thr.z + downDir.z * PAST_THR);
    const pOuter = new THREE.Vector3(thr.x - rwyVec.x * (PAST_THR + FINAL_EXT), patY,
                                     thr.z - rwyVec.z * (PAST_THR + FINAL_EXT));
    const pThr   = new THREE.Vector3(thr.x, elev + 50, thr.z);

    // Leg direction unit vectors (horizontal only)
    const dnVec = new THREE.Vector3(downDir.x, 0, downDir.z);
    const bsVec = new THREE.Vector3(-perpVec.x, 0, -perpVec.z);
    const fnVec = new THREE.Vector3(rwyVec.x, 0, rwyVec.z);

    // Transition points TURN_R ft from each corner, on the two legs meeting there
    const baseEnter  = pBase.clone().addScaledVector(dnVec, -TURN_R);
    const baseExit   = pBase.clone().addScaledVector(bsVec,  TURN_R);
    const finalEnter = pFinal.clone().addScaledVector(bsVec, -TURN_R);
    const finalExit  = pFinal.clone().addScaledVector(fnVec,  TURN_R);

    const group = new THREE.Group();

    // Build a TubeGeometry from an array of Three.js curve objects
    const addTubePath = (curves, color, opacity = 0.78, radius = 18) => {
      const cp = new THREE.CurvePath();
      for (const c of curves) cp.add(c);
      const segs = Math.max(20, Math.ceil(cp.getLength() / 150));
      const geom = new THREE.TubeGeometry(cp, segs, radius, 8, false);
      const mat  = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
      group.add(new THREE.Mesh(geom, mat));
      return cp;
    };

    // Direction arrows sampled along a CurvePath
    const addCurveArrows = (cp, color, count = 2) => {
      for (let i = 1; i <= count; i++) {
        const t   = i / (count + 1);
        const pos = cp.getPointAt(t);
        const tan = cp.getTangentAt(t).normalize();
        const mesh = new THREE.Mesh(
          new THREE.ConeGeometry(28, 90, 6),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
        );
        mesh.position.copy(pos);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
        group.add(mesh);
      }
    };

    // Sphere node at a waypoint
    const addNode = (p, color, r = 50) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 8, 6),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88 })
      );
      mesh.position.copy(p);
      group.add(mesh);
    };

    // Downwind leg — cyan straight
    const dwPath = addTubePath([new THREE.LineCurve3(pDW, baseEnter)], 0x00E5FF);
    addCurveArrows(dwPath, 0x00E5FF, 2);

    // Downwind→base turn — yellow quadratic arc
    addTubePath([new THREE.QuadraticBezierCurve3(baseEnter, pBase, baseExit)], 0xFFE000);

    // Base leg — yellow straight (descends to pFinal altitude)
    const basePath = addTubePath([new THREE.LineCurve3(baseExit, finalEnter)], 0xFFE000);
    addCurveArrows(basePath, 0xFFE000, 1);

    // Base→final turn — magenta quadratic arc
    addTubePath([new THREE.QuadraticBezierCurve3(finalEnter, pFinal, finalExit)], 0xFF44AA);

    // Final leg — magenta straight
    const finPath = addTubePath([new THREE.LineCurve3(finalExit, pThr)], 0xFF44AA);
    addCurveArrows(finPath, 0xFF44AA, 1);

    // Extended final guide — white, dimmed
    addTubePath([new THREE.LineCurve3(pOuter, finalEnter)], 0xFFFFFF, 0.28, 12);

    // Waypoint nodes at corners
    addNode(pDW,    0x00E5FF);
    addNode(pBase,  0xFFE000);
    addNode(pFinal, 0xFF44AA);
    addNode(pThr,   0xFF3333, 35);

    group.visible = false;
    this._patternGuide = group;
    this.scene.add(group);
  }

  togglePatternGuide() {
    if (!this._patternGuide) return false;
    this._patternGuide.visible = !this._patternGuide.visible;
    return this._patternGuide.visible;
  }

  setPatternGuideVisible(visible) {
    if (this._patternGuide) this._patternGuide.visible = visible;
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
