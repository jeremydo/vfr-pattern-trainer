import * as THREE from 'three';
import { headingVec, thresholdPos, endHeading } from './data/airports.js';
import { TerrainRenderer } from './terrain_renderer.js';

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

    this._terrain = new TerrainRenderer(this.scene);

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
    const trunkMat     = new THREE.MeshLambertMaterial({ color: 0x5C3A1E });
    const coniferMats  = [0x2D6A2D, 0x286228, 0x255A22, 0x2F6030]
      .map(c => new THREE.MeshLambertMaterial({ color: c }));
    const deciduousMats= [0x4A8030, 0x5A9035, 0x3D7828, 0x6A9840]
      .map(c => new THREE.MeshLambertMaterial({ color: c }));

    for (let i = 0; i < 500; i++) {
      const { x, z } = place(2800, 52000);
      const h         = rng(22, 70);
      const deciduous = Math.random() < 0.40;

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(1.8, 3.5, h * 0.45, 5),
        trunkMat
      );
      trunk.position.set(x, h * 0.22, z);

      const foliage = deciduous
        ? new THREE.Mesh(
            new THREE.SphereGeometry(h * 0.30, 7, 5),
            deciduousMats[i % deciduousMats.length]
          )
        : new THREE.Mesh(
            new THREE.ConeGeometry(h * 0.30, h * 0.70, 6),
            coniferMats[i % coniferMats.length]
          );
      foliage.position.set(x, deciduous ? h * 0.78 : h * 0.70, z);

      this._sceneryGroup.add(trunk, foliage);
    }

    // --- Houses ---
    const wallMats = [0xD4C4A8, 0xC8B898, 0xDDD0B0, 0xBFBFA8, 0xC4B8A0, 0xD8CEB8]
      .map(c => new THREE.MeshLambertMaterial({ color: c }));
    const roofMats = [0x8B3A2F, 0x9B4535, 0x7A3025, 0xA05040, 0x6A3020, 0x703828]
      .map(c => new THREE.MeshLambertMaterial({ color: c }));

    for (let i = 0; i < 80; i++) {
      const { x: bx, z: bz } = place(3500, 52000);
      const count = Math.floor(rng(1, 5));
      for (let j = 0; j < count; j++) {
        const ox = bx + rng(-300, 300);
        const oz = bz + rng(-300, 300);
        const w  = rng(50, 120), d = rng(40, 90), h = rng(20, 44);
        const mi = (i * 4 + j) % wallMats.length;

        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMats[mi]);
        body.position.set(ox, h / 2, oz);

        const roof = new THREE.Mesh(
          new THREE.CylinderGeometry(0, Math.max(w, d) * 0.62, h * 0.55, 4),
          roofMats[mi]
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

  buildTerrain(airport, data) {
    // Drop the flat ground 2000 ft below airport elevation so it can never
    // Z-fight with the terrain (which is clamped to airport.elevation at its
    // lowest near the airport).  It remains as a distant horizon fallback.
    this.groundMesh.position.y = airport.elevation - 2000;
    this._terrain.build(airport, data);
    this._buildTerrainScenery(airport, data);
  }

  _buildTerrainScenery(airport, data) {
    if (this._terrainSceneryGroup) {
      this.scene.remove(this._terrainSceneryGroup);
      this._terrainSceneryGroup = null;
    }
    const group = new THREE.Group();
    this._terrainSceneryGroup = group;
    this.scene.add(group);

    // Use the terrain renderer's post-processed elevation (includes flat zone,
    // blend zone, and outer skirt) so scenery sits flush on the visual surface.
    const { radiusFt } = data;
    const sampleE = (wx, wz) => this._terrain.sampleElevation(wx, wz);

    const rng = (a, b) => a + Math.random() * (b - a);
    const lim = radiusFt * 0.92;

    // Shared geometries (reused across all instances)
    const trunkMat     = new THREE.MeshLambertMaterial({ color: 0x5C3A1E });
    const coniferMats  = [0x2D6A2D, 0x286228, 0x255A22, 0x2F6030]
      .map(c => new THREE.MeshLambertMaterial({ color: c }));
    const deciduousMats = [0x4A8030, 0x5A9035, 0x3D7828, 0x6A9840]
      .map(c => new THREE.MeshLambertMaterial({ color: c }));
    const coniferGeos  = [28, 45, 68].map(h => ({
      trunk:   new THREE.CylinderGeometry(1.8, 3.5, h * 0.45, 5),
      foliage: new THREE.ConeGeometry(h * 0.30, h * 0.70, 6),
      h,
    }));
    const decidGeos = [22, 38, 58].map(h => ({
      trunk:   new THREE.CylinderGeometry(1.4, 3.0, h * 0.45, 5),
      foliage: new THREE.SphereGeometry(h * 0.30, 7, 5),
      h,
    }));

    let treeCount = 0;
    for (let attempt = 0; attempt < 18000 && treeCount < 2000; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = rng(8000, 245000);
      const wx = Math.cos(angle) * dist, wz = Math.sin(angle) * dist;
      if (Math.abs(wx) > lim || Math.abs(wz) > lim) continue;
      const elev = sampleE(wx, wz);
      if (elev < 0)    continue;  // water area (terrain depressed to -500)
      if (elev > 7800) continue;  // no trees above snowline

      const deciduous = Math.random() < 0.35 && elev < 6000;
      const geoSet = deciduous
        ? decidGeos[Math.floor(Math.random() * decidGeos.length)]
        : coniferGeos[Math.floor(Math.random() * coniferGeos.length)];
      const { h } = geoSet;

      const trunk   = new THREE.Mesh(geoSet.trunk, trunkMat);
      trunk.position.set(wx, elev + h * 0.22, wz);
      const foliage = new THREE.Mesh(
        geoSet.foliage,
        deciduous ? deciduousMats[treeCount % 4] : coniferMats[treeCount % 4]
      );
      foliage.position.set(wx, deciduous ? elev + h * 0.78 : elev + h * 0.70, wz);
      group.add(trunk, foliage);
      treeCount++;
    }

    // Houses — only in lower, flatter areas
    const wallMats = [0xD4C4A8, 0xC8B898, 0xDDD0B0, 0xBFBFA8, 0xC4B8A0, 0xD8CEB8]
      .map(c => new THREE.MeshLambertMaterial({ color: c }));
    const roofMats = [0x8B3A2F, 0x9B4535, 0x7A3025, 0xA05040, 0x6A3020, 0x703828]
      .map(c => new THREE.MeshLambertMaterial({ color: c }));

    for (let i = 0; i < 300; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = rng(8000, 200000);
      const bx = Math.cos(angle) * dist, bz = Math.sin(angle) * dist;
      if (Math.abs(bx) > lim || Math.abs(bz) > lim) continue;
      const baseElev = sampleE(bx, bz);
      if (baseElev < 0)    continue;  // water area
      if (baseElev > 6200) continue;  // no houses on high terrain

      const count = Math.floor(rng(1, 5));
      for (let j = 0; j < count; j++) {
        const ox = bx + rng(-400, 400), oz = bz + rng(-400, 400);
        if (Math.abs(ox) > lim || Math.abs(oz) > lim) continue;
        const ey = sampleE(ox, oz);
        if (ey < 0) continue;  // don't place houses in water
        const w  = rng(50, 120), d = rng(40, 90), h = rng(20, 44);
        const mi = (i * 4 + j) % wallMats.length;
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMats[mi]);
        body.position.set(ox, ey + h / 2, oz);
        const roof = new THREE.Mesh(
          new THREE.CylinderGeometry(0, Math.max(w, d) * 0.62, h * 0.55, 4),
          roofMats[mi]
        );
        roof.position.set(ox, ey + h + h * 0.27, oz);
        roof.rotation.y = Math.PI / 4;
        group.add(body, roof);
      }
    }
  }

  sampleTerrainElevation(wx, wz) { return this._terrain.sampleElevation(wx, wz); }

  buildClouds(scenario, airportElevation) {
    this._clouds.forEach(c => this.scene.remove(c));
    this._clouds = [];

    for (const layer of scenario.clouds) {
      const altFt   = airportElevation + layer.agl;
      const opacity = layer.coverage === 'FEW' ? 0.50 : layer.coverage === 'SCT' ? 0.70 : 0.88;
      const count   = layer.coverage === 'FEW' ? 25  : layer.coverage === 'SCT' ? 55  : 110;
      // One shared material per layer
      const mat = new THREE.MeshLambertMaterial({
        color: 0xF2F6FA, transparent: true, opacity, depthWrite: false,
      });

      for (let i = 0; i < count; i++) {
        const group = new THREE.Group();
        const span  = 2800 + Math.random() * 5000;
        const nPuffs = 3 + Math.floor(Math.random() * 3);   // 3–5 puffs

        for (let p = 0; p < nPuffs; p++) {
          const r    = span * (0.17 + Math.random() * 0.14);
          const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), mat);
          puff.scale.set(
            0.9 + Math.random() * 0.3,
            0.35 + Math.random() * 0.20,   // flatten vertically
            0.8 + Math.random() * 0.35,
          );
          puff.position.set(
            (Math.random() - 0.5) * span * 0.75,
            (Math.random() - 0.5) * 160,
            (Math.random() - 0.5) * span * 0.30,
          );
          group.add(puff);
        }

        group.position.set(
          (Math.random() - 0.5) * 260000,
          altFt + (Math.random() - 0.5) * 300,
          (Math.random() - 0.5) * 260000,
        );
        group.rotation.y = Math.random() * Math.PI * 2;
        this.scene.add(group);
        this._clouds.push(group);
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
  buildPatternGuide(airport, runway, activeEnd, patternAltMSL, ac) {
    if (this._patternGuide) {
      this.scene.remove(this._patternGuide);
      this._patternGuide = null;
    }

    const elev   = airport.elevation;
    const patY   = patternAltMSL;
    const patAGL = patternAltMSL - elev;
    const landingHdg = endHeading(runway, activeEnd.id);

    // Scale pattern geometry to aircraft speed.
    // speedF=1 for ~90 kt trainers, speedF=2 for ~180 kt turbines.
    const dwSpeed = ac?.speeds?.downwind ?? 90;
    const speedF  = dwSpeed / 90;

    // 3° glidepath: altitude (ft AGL above elev) at distance d (ft) from threshold
    const SLOPE  = Math.tan(3 * Math.PI / 180);   // ≈ 0.0524
    const gda    = d => elev + 50 + d * SLOPE;

    const OFFSET    = Math.round(4500 * speedF);   // downwind offset from centerline
    const PAST_THR  = Math.round(4500 * speedF);   // base-to-final turn before threshold
    const TURN_R    = Math.round(1500 * speedF);   // corner turn radius
    const N_ARC     = Math.round(16 * Math.sqrt(speedF)); // arc smoothness
    // Extended final: exactly the distance needed for a 3° descent from patY to threshold
    const FINAL_EXT = Math.max(6000, Math.round(patAGL / SLOPE) - PAST_THR);

    // Altitude of key final-approach points (on the 3° glidepath)
    const finCorAlt = Math.min(patY - 80, gda(PAST_THR));   // altitude at base-to-final turn
    const outerAlt  = Math.min(patY, gda(PAST_THR + FINAL_EXT));  // ≈ patY

    const rwyVec  = headingVec(landingHdg);
    const downDir = headingVec((landingHdg + 180) % 360);
    const perpVec = activeEnd.pattern === 'L'
      ? headingVec((landingHdg + 270) % 360)
      : headingVec((landingHdg +  90) % 360);

    const thr  = thresholdPos(runway, activeEnd.id, elev);
    const dptX = thr.x + rwyVec.x * runway.length;
    const dptZ = thr.z + rwyVec.z * runway.length;

    // Corner waypoints
    const pDW    = new THREE.Vector3(dptX + perpVec.x * OFFSET, patY,
                                     dptZ + perpVec.z * OFFSET);
    const pBase  = new THREE.Vector3(thr.x + downDir.x * PAST_THR + perpVec.x * OFFSET, patY,
                                     thr.z + downDir.z * PAST_THR + perpVec.z * OFFSET);
    const pFinal = new THREE.Vector3(thr.x + downDir.x * PAST_THR, finCorAlt,
                                     thr.z + downDir.z * PAST_THR);
    const pOuter = new THREE.Vector3(thr.x - rwyVec.x * (PAST_THR + FINAL_EXT), outerAlt,
                                     thr.z - rwyVec.z * (PAST_THR + FINAL_EXT));
    const pThr   = new THREE.Vector3(thr.x, elev + 50, thr.z);

    // Leg direction unit vectors (horizontal)
    const dnVec = new THREE.Vector3(downDir.x, 0, downDir.z);
    const bsVec = new THREE.Vector3(-perpVec.x, 0, -perpVec.z);
    const fnVec = new THREE.Vector3(rwyVec.x, 0, rwyVec.z);

    // Generate N+1 points along the true circular arc of a 90° turn.
    // Arc centre for perpendicular inDir/outDir: corner + (outDir − inDir) * R
    const circArc = (corner, inDir, outDir, R, N = 14) => {
      const cx = corner.x + (outDir.x - inDir.x) * R;
      const cz = corner.z + (outDir.z - inDir.z) * R;
      const sa = Math.atan2(-outDir.z, -outDir.x);
      const ea = Math.atan2( inDir.z,   inDir.x);
      let da = ea - sa;
      if (da >  Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      return Array.from({ length: N + 1 }, (_, i) => {
        const a = sa + da * (i / N);
        return new THREE.Vector3(cx + Math.cos(a) * R, corner.y, cz + Math.sin(a) * R);
      });
    };

    // Higher arc resolution for smooth curves
    const N_ARC2 = Math.round(28 * Math.sqrt(speedF));
    const baseArc  = circArc(pBase,  dnVec, bsVec, TURN_R, N_ARC2);
    const finalArc = circArc(pFinal, bsVec, fnVec, TURN_R, N_ARC2);

    // Abeam-threshold point on downwind — this is where the pilot starts descent
    const pAbeam = new THREE.Vector3(
      thr.x + perpVec.x * OFFSET, patY, thr.z + perpVec.z * OFFSET
    );

    const lerp3 = (a, b, t) => new THREE.Vector3(
      a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t
    );

    // ── Single continuous control-point list ────────────────────
    // Many collinear intermediate points on straight legs keep
    // CatmullRomCurve3 from bowing them into unwanted curves.
    const nMid = 10;
    const pts  = [];
    const addSeg = (a, b, n) => {
      for (let i = 0; i <= n; i++) pts.push(lerp3(a, b, i / n));
    };

    addSeg(pDW, pAbeam, nMid);                                  // upper downwind
    addSeg(pAbeam, baseArc[0], nMid);                           // lower downwind
    baseArc.forEach(p => pts.push(p.clone()));                  // downwind→base turn
    addSeg(baseArc[baseArc.length - 1], finalArc[0], nMid);     // base leg
    finalArc.forEach(p => pts.push(p.clone()));                 // base→final turn
    addSeg(finalArc[finalArc.length - 1], pThr, nMid);          // final approach

    // ── Altitude profile ─────────────────────────────────────────
    // Level on the upper downwind; smooth S-curve descent from the
    // abeam point all the way to the threshold.
    const abeamIdx = nMid;          // index of pAbeam in pts[]
    const lastIdx  = pts.length - 1;
    pts.forEach((pt, i) => {
      if (i <= abeamIdx) {
        pt.y = patY;
      } else {
        const t    = (i - abeamIdx) / (lastIdx - abeamIdx);
        const ease = t * t * (3 - 2 * t);                      // smoothstep
        pt.y = patY + (elev + 50 - patY) * ease;
      }
    });

    const group = new THREE.Group();

    // ── Single continuous tube ───────────────────────────────────
    const mainCurve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const mainSegs  = Math.max(200, pts.length * 6);
    group.add(new THREE.Mesh(
      new THREE.TubeGeometry(mainCurve, mainSegs, 18, 8, false),
      new THREE.MeshBasicMaterial({ color: 0x44CCFF, transparent: true, opacity: 0.42 })
    ));

    // Direction arrows evenly spaced along the full curve
    for (let i = 1; i <= 5; i++) {
      const t   = i / 6;
      const pos = mainCurve.getPointAt(t);
      const tan = mainCurve.getTangentAt(t).normalize();
      const m   = new THREE.Mesh(
        new THREE.ConeGeometry(28, 90, 6),
        new THREE.MeshBasicMaterial({ color: 0x44CCFF, transparent: true, opacity: 0.50 })
      );
      m.position.copy(pos);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
      group.add(m);
    }

    // Extended final guide (white, dimmed) on the 3° glide slope
    const extPath = new THREE.CurvePath();
    extPath.add(new THREE.LineCurve3(pOuter, pts[lastIdx - nMid]));
    group.add(new THREE.Mesh(
      new THREE.TubeGeometry(extPath, 20, 12, 8, false),
      new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.18 })
    ));

    // Waypoint nodes — entry, abeam, threshold
    const addNode = (p, color, r = 50) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(r, 8, 6),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })
      );
      m.position.copy(p);
      group.add(m);
    };
    addNode(pDW,   0x44CCFF);
    addNode(pAbeam.clone().setY(patY), 0xFFE000, 40);
    addNode(pThr,  0xFF3333, 35);

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
