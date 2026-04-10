import * as THREE from 'three';

// Elevation colour palettes per biome: [deep_valley, base, hills, high, peaks/snow]
const BIOMES = {
  arid_mountain: [0x8B7B5B, 0xAA9070, 0x968060, 0x7A6B58, 0xDDD8D0],
  arid:          [0xB0A070, 0xC4AD7A, 0xA89060, 0x8B7850, 0xCEC8B8],
  temperate:     [0x4A6B3A, 0x5C7A3C, 0x78896A, 0x8B7858, 0xDDD8D0],
  tropical:      [0x3A7040, 0x4A8040, 0x6A9060, 0x7A8060, 0xC8C0B0],
  plains:        [0x7A8A50, 0x8B9B60, 0x8B8B58, 0x8B7860, 0xC0B8A8],
};

const AIRPORT_BIOMES = {
  KAPA: 'arid_mountain', KBJC: 'arid_mountain',
  KSNA: 'arid',          KVNY: 'arid',          KSQL: 'arid',
  KFXE: 'tropical',
  KRNT: 'temperate',     KFRG: 'temperate',     KHEF: 'temperate',
  KGYI: 'plains',
};

const _col = new THREE.Color();

function elevColor(elevFt, airportElevFt, palette) {
  if (elevFt < 0)     return _col.setHex(0x1E6E8E).clone();
  if (elevFt > 11500) return _col.setHex(0xEEEEE8).clone();
  const rel = elevFt - airportElevFt;
  let hex;
  if      (rel < -1500) hex = palette[0];
  else if (rel <   500) hex = palette[1];
  else if (rel <  3000) hex = palette[2];
  else if (rel <  7000) hex = palette[3];
  else                  hex = palette[4];
  return _col.setHex(hex).clone();
}

// Sample terrain elevation at a world (x, z) position
function sampleElev(x, z, elevations, grid, radiusFt) {
  const j = Math.max(0, Math.min(grid - 1, Math.round((x + radiusFt) / (2 * radiusFt) * (grid - 1))));
  const i = Math.max(0, Math.min(grid - 1, Math.round((z + radiusFt) / (2 * radiusFt) * (grid - 1))));
  return elevations[i * grid + j] ?? 0;
}

export class TerrainRenderer {
  constructor(scene) {
    this._scene = scene;
    this._group = null;
  }

  build(airport, data) {
    if (this._group) { this._scene.remove(this._group); this._group = null; }

    const { grid, radiusFt, water, rivers, towns } = data;
    const side  = radiusFt * 2;
    const segs  = grid - 1;
    const biome = BIOMES[AIRPORT_BIOMES[airport.id] || 'temperate'];

    // Shift all elevations so the terrain centre matches airport.elevation exactly,
    // ensuring the apron/runway geometry sits flush with the terrain surface.
    const centerIdx  = Math.floor(grid / 2) * grid + Math.floor(grid / 2);
    const correction = airport.elevation - (data.elevations[centerIdx] ?? airport.elevation);
    const elevations = data.elevations.map(e => e + correction);

    const group = new THREE.Group();

    // ── Heightmap mesh ───────────────────────────────────────────────────────
    // PlaneGeometry in XY, rotated to XZ.  Vertex index = iy*grid + ix,
    // where iy=0 is north (smallest world-Z) and ix=0 is west.
    const geo = new THREE.PlaneGeometry(side, side, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos    = geo.attributes.position;
    const colBuf = new Float32Array(pos.count * 3);

    for (let iy = 0; iy < grid; iy++) {
      for (let ix = 0; ix < grid; ix++) {
        const vi   = iy * grid + ix;
        const elev = elevations[vi] ?? airport.elevation;
        pos.setY(vi, elev);
        const c = elevColor(elev, airport.elevation, biome);
        colBuf[vi * 3]     = c.r;
        colBuf[vi * 3 + 1] = c.g;
        colBuf[vi * 3 + 2] = c.b;
      }
    }
    pos.needsUpdate = true;
    geo.setAttribute('color', new THREE.BufferAttribute(colBuf, 3));
    geo.computeVertexNormals();

    group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      vertexColors:        true,
      flatShading:         true,
      polygonOffset:       true,   // sit above the flat background ground
      polygonOffsetFactor: -1,
      polygonOffsetUnits:  -1,
    })));

    // ── Water polygons ───────────────────────────────────────────────────────
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x3B7CBF, side: THREE.DoubleSide });
    for (const poly of water) {
      if (poly.coords.length < 3) continue;
      // Elevation at polygon centroid
      const cx     = poly.coords.reduce((s, c) => s + c[0], 0) / poly.coords.length;
      const cz     = poly.coords.reduce((s, c) => s + c[1], 0) / poly.coords.length;
      const wElev  = sampleElev(cx, cz, elevations, grid, radiusFt) + 3;

      // Shape is in XY; after rotation.x = -PI/2, shape-X → world-X, shape-Y → world -Z
      // So for world point (x, z): shape = (x, -z)
      const shape = new THREE.Shape();
      shape.moveTo(poly.coords[0][0], -poly.coords[0][1]);
      for (let k = 1; k < poly.coords.length; k++) {
        shape.lineTo(poly.coords[k][0], -poly.coords[k][1]);
      }
      shape.closePath();

      const wMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), waterMat);
      wMesh.rotation.x = -Math.PI / 2;
      wMesh.position.y = wElev;
      group.add(wMesh);
    }

    // ── Rivers ───────────────────────────────────────────────────────────────
    const riverMat = new THREE.MeshLambertMaterial({ color: 0x4A90CC });
    for (const river of rivers) {
      if (river.coords.length < 2) continue;
      const pts = river.coords.map(([x, z]) =>
        new THREE.Vector3(x, sampleElev(x, z, elevations, grid, radiusFt) + 3, z)
      );
      try {
        const curve = new THREE.CatmullRomCurve3(pts);
        const rGeo  = new THREE.TubeGeometry(
          curve,
          Math.max(8, pts.length * 2),
          (river.widthFt || 600) / 2,
          3,    // 3-sided tube = low-poly look
          false
        );
        group.add(new THREE.Mesh(rGeo, riverMat));
      } catch (_) {}
    }

    // ── Towns ─────────────────────────────────────────────────────────────────
    const townMat   = new THREE.MeshLambertMaterial({ color: 0xB0B0A8 });
    const footprints = [3000, 7000, 15000]; // ft, by size 1/2/3
    for (const town of towns) {
      const fp   = footprints[Math.min(town.size - 1, 2)];
      const h    = fp * 0.012 + 20;
      const y    = sampleElev(town.x, town.z, elevations, grid, radiusFt);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(fp, h, fp),
        townMat
      );
      mesh.position.set(town.x, y + h / 2, town.z);
      group.add(mesh);
    }

    this._scene.add(group);
    this._group = group;
  }

  dispose() {
    if (this._group) { this._scene.remove(this._group); this._group = null; }
  }
}
