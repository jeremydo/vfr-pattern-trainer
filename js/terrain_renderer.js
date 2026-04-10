import * as THREE from 'three';

// Elevation colour palettes per biome: [deep_valley, base, hills, high, peaks/snow]
// Palettes: [deep_valley, base/plains, foothills, high_terrain, peaks/snow]
const BIOMES = {
  // Colorado Front Range: green irrigated plains → tan foothills → brown rock → snow
  arid_mountain: [0x5A7840, 0x788F50, 0xA09268, 0x7A6B58, 0xDDD8D0],
  // SoCal/desert: tan scrub at all elevations, greener in valleys
  arid:          [0x8A9060, 0xB8A878, 0xA89060, 0x8B7850, 0xCEC8B8],
  temperate:     [0x4A6B3A, 0x5C7A3C, 0x78896A, 0x8B7858, 0xDDD8D0],
  tropical:      [0x3A7040, 0x4A8040, 0x6A9060, 0x7A8060, 0xC8C0B0],
  plains:        [0x7A8A50, 0x8B9B60, 0x8B8B58, 0x8B7860, 0xC0B8A8],
};

const AIRPORT_BIOMES = {
  KAPA: 'arid_mountain', KBJC: 'arid_mountain',
  KSNA: 'arid',          KVNY: 'arid',          KSQL: 'arid',
  KFXE: 'tropical',
  KRNT: 'temperate',     KFRG: 'temperate',     KHEF: 'temperate',
  KEUG: 'temperate',
  KGYI: 'plains',
};

// Flat zone around airport: terrain is forced to airport elevation within FLAT_INNER,
// then blends smoothly back to real terrain between FLAT_INNER and FLAT_OUTER.
const FLAT_INNER_FT = 12000;  // ~2.3 miles — dead flat, runway/apron visible
const FLAT_OUTER_FT = 35000;  // ~6.6 miles — blend complete, real terrain starts

const _col = new THREE.Color();

// Deterministic hash 0..1 from grid indices — gives each vertex a stable random value
function hash(ix, iy) {
  const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothstep(t) { return t * t * (3 - 2 * t); }

function elevColor(colorElevFt, airportElevFt, palette) {
  if (colorElevFt < 0)     return _col.setHex(0x1E6E8E).clone();
  if (colorElevFt > 11500) return _col.setHex(0xEEEEE8).clone();
  const rel = colorElevFt - airportElevFt;
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

    // Use average of the 4 centre vertices for a more stable elevation correction
    const ci = Math.floor(segs / 2);  // 31 for grid=64
    const avg4 = (
      data.elevations[ ci      * grid +  ci     ] +
      data.elevations[ ci      * grid + (ci + 1)] +
      data.elevations[(ci + 1) * grid +  ci     ] +
      data.elevations[(ci + 1) * grid + (ci + 1)]
    ) / 4;
    const correction = airport.elevation - avg4;

    // Working copy with correction applied
    const elevations = data.elevations.map(e => e + correction);

    // ── Flatten airport vicinity ─────────────────────────────────────────────
    // Prevents terrain from rising above the runway/apron geometry.
    for (let iy = 0; iy < grid; iy++) {
      for (let ix = 0; ix < grid; ix++) {
        // World position of this vertex (after PlaneGeometry + rotateX(-PI/2))
        const wx = radiusFt * (-1 + 2 * ix / segs);
        const wz = radiusFt * (-1 + 2 * iy / segs);
        const dist = Math.sqrt(wx * wx + wz * wz);

        const vi = iy * grid + ix;
        if (dist < FLAT_INNER_FT) {
          elevations[vi] = airport.elevation;
        } else if (dist < FLAT_OUTER_FT) {
          const t = (dist - FLAT_INNER_FT) / (FLAT_OUTER_FT - FLAT_INNER_FT);
          const s = smoothstep(t);
          elevations[vi] = airport.elevation * (1 - s) + elevations[vi] * s;
        }
      }
    }

    const group = new THREE.Group();

    // ── Heightmap mesh ───────────────────────────────────────────────────────
    const geo = new THREE.PlaneGeometry(side, side, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos    = geo.attributes.position;
    const colBuf = new Float32Array(pos.count * 3);

    for (let iy = 0; iy < grid; iy++) {
      for (let ix = 0; ix < grid; ix++) {
        const vi   = iy * grid + ix;
        const elev = elevations[vi] ?? airport.elevation;
        pos.setY(vi, elev);

        // Noise proportional to how far above airport level this vertex is.
        // Jitter the elevation used for colour lookup so the colour bands have
        // ragged, natural edges — this makes individual flat-shaded faces visible
        // and gives a sense of the terrain's undulations.
        const aboveAirport = Math.max(0, elev - airport.elevation);
        const noiseRange   = Math.min(600, aboveAirport * 0.12); // up to ±600 ft jitter in peaks
        const colorElev    = elev + (hash(ix, iy) - 0.5) * 2 * noiseRange;

        const c = elevColor(colorElev, airport.elevation, biome);

        // Additional brightness scatter: ±10% brightness in mountains
        const brightness = 1 + (hash(ix + 99, iy + 37) - 0.5) * 0.2 * Math.min(1, aboveAirport / 3000);
        colBuf[vi * 3]     = Math.max(0, Math.min(1, c.r * brightness));
        colBuf[vi * 3 + 1] = Math.max(0, Math.min(1, c.g * brightness));
        colBuf[vi * 3 + 2] = Math.max(0, Math.min(1, c.b * brightness));
      }
    }
    pos.needsUpdate = true;
    geo.setAttribute('color', new THREE.BufferAttribute(colBuf, 3));
    geo.computeVertexNormals();

    group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading:  true,
    })));

    // ── Water polygons ───────────────────────────────────────────────────────
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x3B7CBF, side: THREE.DoubleSide });
    for (const poly of water) {
      if (poly.coords.length < 3) continue;
      const cx    = poly.coords.reduce((s, c) => s + c[0], 0) / poly.coords.length;
      const cz    = poly.coords.reduce((s, c) => s + c[1], 0) / poly.coords.length;
      const wElev = sampleElev(cx, cz, elevations, grid, radiusFt) + 20;

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
        new THREE.Vector3(x, sampleElev(x, z, elevations, grid, radiusFt) + 12, z)
      );
      try {
        const curve = new THREE.CatmullRomCurve3(pts);
        const rGeo  = new THREE.TubeGeometry(
          curve, Math.max(8, pts.length * 2), (river.widthFt || 600) / 2, 3, false
        );
        group.add(new THREE.Mesh(rGeo, riverMat));
      } catch (_) {}
    }

    // ── Towns ─────────────────────────────────────────────────────────────────
    const townMat    = new THREE.MeshLambertMaterial({ color: 0xB0B0A8 });
    const footprints = [3000, 7000, 15000];
    for (const town of towns) {
      const fp   = footprints[Math.min(town.size - 1, 2)];
      const h    = fp * 0.012 + 20;
      const y    = sampleElev(town.x, town.z, elevations, grid, radiusFt);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(fp, h, fp), townMat);
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
