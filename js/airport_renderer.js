import * as THREE from 'three';
import { headingVec, thresholdPos } from './data/airports.js';

const DEG = Math.PI / 180;

// Natural aspect ratios (width/height) from extracted FAA spec PNGs (D>2.5 distance-transform threshold)
const GLYPH_AR = {
  '0':123/169, '1':37/169,  '2':67/169,  '3':67/168,
  '4':80/167,  '5':68/169,  '6':70/171,  '7':76/167,
  '8':68/166,  '9':124/170, 'L':67/168,  'R':67/168,  'C':66/164
};

export class AirportRenderer {
  constructor(scene) {
    this.scene  = scene;
    this._group = new THREE.Group();
    scene.add(this._group);
    this._papiLights = [];

    // Preload glyph textures
    const loader = new THREE.TextureLoader();
    this._glyphTex = {};
    for (const ch of Object.keys(GLYPH_AR)) {
      const tex = loader.load(`textures/glyphs/${ch}.png`);
      tex.generateMipmaps = false;
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      this._glyphTex[ch] = tex;
    }
  }

  build(airport) {
    while (this._group.children.length) this._group.remove(this._group.children[0]);
    this._papiLights = [];

    const elev = airport.elevation;

    // Apron — kept below runway surface top (elev+0.55); polygonOffset prevents
    // z-fighting with the ground plane without pushing it above the runway.
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(2200, 2200),
      new THREE.MeshLambertMaterial({ color: 0x909090 })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, elev + 1, 0);
    this._group.add(apron);

    // Simple hangars (west side)
    const hMat = new THREE.MeshLambertMaterial({ color: 0x7A8878 });
    for (let i = 0; i < 5; i++) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(110, 38, 80), hMat);
      h.position.set(-1300, elev + 19, -380 + i * 155);
      this._group.add(h);
    }

    // Control tower
    const towerBase = new THREE.Mesh(new THREE.BoxGeometry(28, 90, 28),
      new THREE.MeshLambertMaterial({ color: 0x888888 }));
    towerBase.position.set(-950, elev + 45, 150);
    const towerCab = new THREE.Mesh(new THREE.BoxGeometry(38, 18, 38),
      new THREE.MeshLambertMaterial({ color: 0x99CCDD }));
    towerCab.position.set(-950, elev + 99, 150);
    this._group.add(towerBase, towerCab);

    for (const runway of airport.runways) {
      this._buildRunway(runway, elev);
    }
  }

  _buildRunway(rwy, elev) {
    const hv   = headingVec(rwy.heading);            // unit vec along runway (low→high end)
    const rotY = Math.PI / 2 - rwy.heading * DEG;   // Three.js Y rotation for box alignment
    const perpX = -hv.z, perpZ = hv.x;              // perpendicular (right side)

    // Surface — polygonOffset keeps it above the apron without z-fighting
    const surf = new THREE.Mesh(
      new THREE.BoxGeometry(rwy.length, 0.5, rwy.width),
      new THREE.MeshLambertMaterial({ color: 0x2E2E32 })
    );
    surf.rotation.y = rotY;
    surf.position.set(rwy.offsetX, elev + 1.75, rwy.offsetZ);
    this._group.add(surf);

    // Centerline dashes
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const nDashes = Math.floor(rwy.length / 120);
    for (let i = 1; i < nDashes; i += 2) {
      const t    = -rwy.length / 2 + (i + 0.5) * (rwy.length / nDashes);
      const dash = new THREE.Mesh(new THREE.BoxGeometry(55, 0.1, 1.5), dashMat);
      dash.rotation.y = rotY;
      dash.position.set(rwy.offsetX + hv.x * t, elev + 2.2, rwy.offsetZ + hv.z * t);
      this._group.add(dash);
    }

    // Threshold markings + numbers for each end
    for (const end of rwy.ends) {
      this._buildThreshold(rwy, end, elev, hv, perpX, perpZ);
      this._buildRunwayNumber(rwy, end, elev);
    }

    // Edge lights (white)
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xFFFFEE });
    const lightGeo = new THREE.SphereGeometry(1.1, 4, 4);
    for (let t = -rwy.length / 2 + 200; t < rwy.length / 2; t += 300) {
      [-( rwy.width / 2 + 5), (rwy.width / 2 + 5)].forEach(side => {
        const l = new THREE.Mesh(lightGeo, edgeMat);
        l.position.set(
          rwy.offsetX + hv.x * t + perpX * side,
          elev + 2.5,
          rwy.offsetZ + hv.z * t + perpZ * side
        );
        this._group.add(l);
      });
    }

    // PAPI lights (4 per runway end)
    for (const end of rwy.ends) this._buildPAPI(rwy, end, elev, hv, perpX, perpZ);
  }

  // Return the true landing heading for an end, using rwy.heading rather than
  // the rounded published number (e.g. end '17L' on heading:172 → 172, not 170).
  _endHdg(rwy, end) {
    const approx = parseInt(end.id) * 10;
    const h1 = rwy.heading;
    const h2 = (rwy.heading + 180) % 360;
    const d1 = Math.abs(((approx - h1 + 540) % 360) - 180);
    const d2 = Math.abs(((approx - h2 + 540) % 360) - 180);
    return d1 <= d2 ? h1 : h2;
  }

  _buildThreshold(rwy, end, elev, hv, perpX, perpZ) {
    const landingHdg  = this._endHdg(rwy, end);
    const hdgToThresh = (landingHdg + 180) % 360;
    const tv   = headingVec(hdgToThresh);   // direction from center toward this threshold
    const hv2  = headingVec(landingHdg);    // inbound direction (toward runway)
    const half = rwy.length / 2;
    const wMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

    // Threshold bar
    const bar = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, rwy.width), wMat);
    bar.rotation.y = Math.PI / 2 - landingHdg * DEG;
    bar.position.set(rwy.offsetX + tv.x * half, elev + 2.2, rwy.offsetZ + tv.z * half);
    this._group.add(bar);

    // Piano key stripes (8 stripes)
    const sw = 6, sg = 4, sl = 140;
    const totalW = 8 * sw + 7 * sg;
    for (let i = 0; i < 8; i++) {
      const offset = -totalW / 2 + i * (sw + sg) + sw / 2;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(sl, 0.1, sw), wMat);
      stripe.rotation.y = Math.PI / 2 - landingHdg * DEG;
      stripe.position.set(
        rwy.offsetX + tv.x * (half - sl / 2) + perpX * offset,
        elev + 2.2,
        rwy.offsetZ + tv.z * (half - sl / 2) + perpZ * offset
      );
      this._group.add(stripe);
    }

    // Touchdown zone marks (3 pairs)
    for (let i = 0; i < 3; i++) {
      const dist = 500 + i * 500;
      const tMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
      [-rwy.width * 0.28, rwy.width * 0.28].forEach(side => {
        const tm = new THREE.Mesh(new THREE.BoxGeometry(140, 0.1, 18), tMat);
        tm.rotation.y = Math.PI / 2 - landingHdg * DEG;
        tm.position.set(
          rwy.offsetX + tv.x * half + hv2.x * dist + perpX * side,
          elev + 2.2,
          rwy.offsetZ + tv.z * half + hv2.z * dist + perpZ * side
        );
        this._group.add(tm);
      });
    }
  }

  _buildPAPI(rwy, end, elev, hv, perpX, perpZ) {
    const landingHdg  = this._endHdg(rwy, end);
    const hdgToThresh = (landingHdg + 180) % 360;
    const tv  = headingVec(hdgToThresh);
    const hv2 = headingVec(landingHdg);
    const half = rwy.length / 2;
    const lateralOff  = rwy.width / 2 + 55;
    const inboundDist = 1000;

    for (let i = 0; i < 4; i++) {
      const mat   = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
      const light = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 3), mat);
      light.position.set(
        rwy.offsetX + tv.x * half + hv2.x * inboundDist + perpX * (lateralOff + i * 11),
        elev + 3,
        rwy.offsetZ + tv.z * half + hv2.z * inboundDist + perpZ * (lateralOff + i * 11)
      );
      this._group.add(light);
      this._papiLights.push({ mesh: light, endId: end.id, index: i });
    }
  }

  _buildRunwayNumber(rwy, end, elev) {
    const landingHdg = this._endHdg(rwy, end);
    const tv  = headingVec((landingHdg + 180) % 360);  // toward threshold
    const hv2 = headingVec(landingHdg);                // inbound (toward runway)
    const rv  = headingVec((landingHdg + 90) % 360);   // pilot's right on approach
    const half = rwy.length / 2;

    const match  = end.id.match(/^(\d+)([LRC]?)$/i);
    const digits = (match ? match[1] : end.id).padStart(2, '0');
    const desig  = match ? match[2].toUpperCase() : '';
    const elements = desig ? [digits[0], digits[1], desig] : [digits[0], digits[1]];

    // Character height along runway; width per char derived from natural aspect ratio
    const charH = Math.min(rwy.width * 0.75, 90);
    const gap   = charH * 0.06;
    const widths = elements.map(ch => charH * (GLYPH_AR[ch] ?? 0.6));
    const totalW = widths.reduce((a, b) => a + b, 0) + gap * (elements.length - 1);

    // Block center: 150 ft inbound from threshold
    const fromThresh = 150 + charH / 2;
    const cx = rwy.offsetX + tv.x * half + hv2.x * fromThresh;
    const cz = rwy.offsetZ + tv.z * half + hv2.z * fromThresh;

    let curOffset = -totalW / 2;
    for (let i = 0; i < elements.length; i++) {
      const ch = elements[i];
      const w  = widths[i];
      const offset = curOffset + w / 2;
      curOffset += w + gap;

      const tex = this._glyphTex[ch];
      if (!tex) continue;

      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, charH),
        new THREE.MeshBasicMaterial({
          map: tex, transparent: true, depthWrite: false,
          alphaTest: 0.05, side: THREE.DoubleSide
        })
      );

      mesh.rotation.order = 'YXZ';
      mesh.rotation.y     = -landingHdg * DEG;
      mesh.rotation.x     = -Math.PI / 2;

      mesh.position.set(
        cx + rv.x * offset,
        elev + 2.3,
        cz + rv.z * offset
      );
      this._group.add(mesh);
    }
  }

  // Update PAPI colors based on current glidepath angle
  // Standard 3° glidepath: 2 white + 2 red = on path
  updatePAPI(endId, glidepathDeg) {
    const thresholds = [2.5, 3.0, 3.5, 4.0];
    for (const p of this._papiLights) {
      if (p.endId !== endId) continue;
      p.mesh.material.color.setHex(glidepathDeg > thresholds[p.index] ? 0xFFFFFF : 0xFF2200);
    }
  }
}
