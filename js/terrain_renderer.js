import * as THREE from 'three';

// Ray-casting point-in-polygon test (2D, coords are [x, z] pairs)
function pointInPolygon(px, pz, coords) {
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][0], zi = coords[i][1];
    const xj = coords[j][0], zj = coords[j][1];
    if (((zi > pz) !== (zj > pz)) &&
        (px < (xj - xi) * (pz - zi) / (zj - zi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

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
  KSNA: 'arid',          KVNY: 'arid',          KSQL: 'arid',          KSBA: 'arid',
  KRHV: 'arid',          KSJC: 'arid',          KPAO: 'arid',
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

// Build a tiling grayscale detail texture from multi-octave value noise.
// Tiles at `tileFt` world-feet intervals; vertex colours are multiplied by it.
// Range ≈ 0.55–1.00 (centre ~0.78) — vertex colours compensated ×1/0.78 below.
function _makeDetailTex(side) {
  const S    = 512;
  const buf  = new Uint8Array(S * S * 4);
  // Scales in texture pixels (1 px = tileFt/S ft in world space)
  const sA = 112, sB = 48, sC = 20, sD = 9;
  for (let ty = 0; ty < S; ty++) {
    for (let tx = 0; tx < S; tx++) {
      const v =
        smoothNoise2D(tx,           ty,           sA) * 0.38 +
        smoothNoise2D(tx + 157,     ty +  89,     sB) * 0.30 +
        smoothNoise2D(tx + 271,     ty + 213,     sC) * 0.20 +
        smoothNoise2D(tx +  83,     ty + 347,     sD) * 0.12;
      // Map 0..1 → 140..255 (0.55..1.00)
      const g = 140 + Math.round(v * 115);
      const i = (ty * S + tx) * 4;
      buf[i] = buf[i+1] = buf[i+2] = g; buf[i+3] = 255;
    }
  }
  const tex = new THREE.DataTexture(buf, S, S, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const tileFt = 8000;
  tex.repeat.set(side / tileFt, side / tileFt);
  tex.needsUpdate = true;
  return tex;
}

// Deterministic hash 0..1 from grid indices — gives each vertex a stable random value
function hash(ix, iy) {
  const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothstep(t) { return t * t * (3 - 2 * t); }

// Bilinearly-interpolated 2D value noise — gives smooth, non-grid organic patches
function smoothNoise2D(x, z, scale) {
  const fx = x / scale, fz = z / scale;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const sx = smoothstep(tx), sz = smoothstep(tz);
  return hash(ix,   iz  ) * (1-sx) * (1-sz) +
         hash(ix+1, iz  ) *    sx  * (1-sz) +
         hash(ix,   iz+1) * (1-sx) *    sz  +
         hash(ix+1, iz+1) *    sx  *    sz;
}

const _snowCol   = new THREE.Color(0xF2F0EC);  // off-white snow
const _midGreen  = new THREE.Color(0x90B050);  // lighter yellow-green field
const _dryCol    = new THREE.Color(0xC4AA60);  // dry/crop golden-tan
const _rockCol1  = new THREE.Color(0x8A7A68);  // lighter rock face
const _rockCol2  = new THREE.Color(0x6E5E50);  // darker rock crevice

function elevColor(colorElevFt, airportElevFt, palette) {
  if (colorElevFt < 0) return _col.setHex(0x1E6E8E).clone();
  // Snow hard cutoff removed — handled with gradient in vertex loop
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

        // Outer edge skirt: blend elevation to 0 over the outermost 12% of the
        // tile so the mesh tucks into the flat ground plane instead of forming
        // visible floating walls at the tile boundary.
        const distFrac = dist / radiusFt;
        if (distFrac > 0.88) {
          const s = smoothstep((distFrac - 0.88) / 0.12);
          elevations[vi] *= (1 - s);
        }
      }
    }

    // ── Depress terrain inside water polygons ────────────────────────────────
    // For each water polygon, compute its surface elevation (same formula used
    // when placing the mesh), then sink every terrain vertex that falls inside
    // the polygon to just below that surface.  This makes the polygon boundary
    // the visible shoreline rather than an elevation-contour intersection.
    if (water && water.length) {
      for (const poly of water) {
        if (poly.coords.length < 3) continue;
        const cx = poly.coords.reduce((s, c) => s + c[0], 0) / poly.coords.length;
        const cz = poly.coords.reduce((s, c) => s + c[1], 0) / poly.coords.length;
        const wSurf = Math.min(
          sampleElev(cx, cz, data.elevations, grid, radiusFt) + correction + 2,
          airport.elevation - 5
        );
        for (let iy = 0; iy < grid; iy++) {
          for (let ix = 0; ix < grid; ix++) {
            const wx = radiusFt * (-1 + 2 * ix / segs);
            const wz = radiusFt * (-1 + 2 * iy / segs);
            // Never depress inside the flat inner zone — protects runway area
            // from tidal/wetland polygons that may overlap the airport footprint.
            const distSq = wx * wx + wz * wz;
            if (distSq < FLAT_INNER_FT * FLAT_INNER_FT) continue;
            if (pointInPolygon(wx, wz, poly.coords)) {
              const vi = iy * grid + ix;
              elevations[vi] = -500;
            }
          }
        }
      }
    }

    // Store for runtime elevation sampling (crash detection etc.)
    this._elevations = elevations;
    this._grid       = grid;
    this._radiusFt   = radiusFt;

    const group = new THREE.Group();

    // ── Heightmap mesh ───────────────────────────────────────────────────────
    const geo = new THREE.PlaneGeometry(side, side, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos       = geo.attributes.position;
    const colBuf    = new Float32Array(pos.count * 3);
    const cellSize  = side / segs;
    // Detail texture multiplied with vertex colours — compensate brightness upward
    // so average = 1.0 (texture averages ~0.78, so ×1.28 keeps overall luminance).
    const COMP = 1.28;

    for (let iy = 0; iy < grid; iy++) {
      for (let ix = 0; ix < grid; ix++) {
        const vi   = iy * grid + ix;
        const elev = elevations[vi] ?? airport.elevation;
        pos.setY(vi, elev);

        const wx = radiusFt * (-1 + 2 * ix / segs);
        const wz = radiusFt * (-1 + 2 * iy / segs);
        const aboveAirport = Math.max(0, elev - airport.elevation);

        // ── Smooth organic noise (four scales) ──────────────────────────────
        // 128-grid cell size ≈ 4133 ft → Nyquist ≈ 8266 ft; all scales > 2×cell.
        const n1 = smoothNoise2D(wx,         wz,         52000);  // large regional sweeps
        const n2 = smoothNoise2D(wx + 31700, wz + 17590, 22000);  // medium patches
        const n3 = smoothNoise2D(wx + 61000, wz + 29830, 13000);  // finer patches
        const n4 = smoothNoise2D(wx + 47300, wz + 53100, 11000);  // fine detail (>2×cell)
        const patchNoise = n1 * 0.28 + n2 * 0.27 + n3 * 0.25 + n4 * 0.20;  // 0..1

        // ── Slope-based hillshade baked into vertex colour ───────────────────
        // Light from NW at ~45° elevation: lx=-0.577, ly=0.577, lz=-0.577
        const dex = (elevations[iy * grid + Math.min(ix+1, segs)] -
                     elevations[iy * grid + Math.max(ix-1, 0)]) / (cellSize * 2);
        const dez = (elevations[Math.min(iy+1, segs) * grid + ix] -
                     elevations[Math.max(iy-1, 0)   * grid + ix]) / (cellSize * 2);
        const nLen = Math.sqrt(dex*dex + 1 + dez*dez);
        const dot  = (0.577*dex + 0.577 + 0.577*dez) / nLen;
        // Map: flat face (dot≈0.577) → 0.85, sunlit ridge → ~1.35, shadowed valley → ~0.35
        const hillshade = Math.max(0.35, Math.min(1.4, 0.85 + (dot - 0.577) * 1.6));

        // ── Colour-band elevation jitter (smooth, not per-vertex stipple) ────
        const noiseRange = 350 + Math.min(900, aboveAirport * 0.18);
        const colorElev  = elev + (patchNoise - 0.5) * 2 * noiseRange;
        const c = elevColor(colorElev, airport.elevation, biome);

        // ── Flat land colour variety: dry/crop/lush patches ──────────────────
        const hillWeight = Math.min(1, aboveAirport / 2500);
        const flatWeight = 1 - hillWeight;
        if (flatWeight > 0) {
          // category drives colour type: low=lush, mid=lighter, high=dry/crop
          const category = n1 * 0.50 + n3 * 0.30 + n4 * 0.20;
          if (category > 0.25) {
            const t = Math.min(1, (category - 0.25) / 0.30) * flatWeight;
            c.lerp(category > 0.60 ? _dryCol : _midGreen, t * 0.92);
          }
        }

        // ── Rocky slope variation: steep faces blend toward rock colours ──────
        const slopeMag  = Math.sqrt(dex * dex + dez * dez);
        const rockiness = Math.min(1, slopeMag * 2.4) * hillWeight;
        if (rockiness > 0.05) {
          const rockCol = (n2 + n3 * 0.4) > 0.52 ? _rockCol1 : _rockCol2;
          c.lerp(rockCol, rockiness * 0.82);
        }

        // ── Noise-driven rocky outcrops at elevation (independent of slope) ───
        // Scattered rock patches on mountain terrain even on gentler slopes.
        const highFrac = Math.min(1, Math.max(0, (elev - airport.elevation - 1500) / 5000));
        if (highFrac > 0) {
          const outcrop = (n2 * 0.55 + n4 * 0.45);  // 0..1 outcrop noise
          if (outcrop > 0.58) {
            const ot = Math.min(1, (outcrop - 0.58) / 0.28) * highFrac;
            c.lerp(outcrop > 0.75 ? _rockCol2 : _rockCol1, ot * 0.60);
          }
        }

        // ── Snow: noise-modulated gradient from 8000 ft, full at 13500 ft ────
        const snowNoise = n1 * 0.45 + n3 * 0.55;
        const snowT = Math.max(0, Math.min(1,
          (elev - 8000) / 5500 * 1.4 + (snowNoise - 0.5) * 0.9
        ));
        if (snowT > 0) c.lerp(_snowCol, snowT);

        // ── Final brightness: organic patches on flat, hillshade on hills ────
        const flatBright = 0.55 + patchNoise * 0.95;              // flat: 55–150%
        // Snow softens the hillshade contrast (bright diffuse surface)
        const hsStrength = 2.2 * (1 - snowT * 0.5);               // stronger mountain contrast
        const hillshadeSoft = Math.max(0.28, Math.min(1.55, 0.85 + (dot - 0.577) * hsStrength));
        const hillBright = hillshadeSoft * (0.75 + patchNoise * 0.50);  // 75–125% patch variation
        const brightness = flatBright * (1 - hillWeight) + hillBright * hillWeight;

        // Hue tint on flat non-snow land
        const hueTint = (n2 - 0.5) * flatWeight * (1 - snowT);
        const rMul = brightness * (1 + hueTint * 0.18);
        const gMul = brightness * (1 - Math.abs(hueTint) * 0.06);
        const bMul = brightness * (1 - hueTint * 0.14);

        colBuf[vi * 3]     = Math.max(0, Math.min(1, c.r * rMul * COMP));
        colBuf[vi * 3 + 1] = Math.max(0, Math.min(1, c.g * gMul * COMP));
        colBuf[vi * 3 + 2] = Math.max(0, Math.min(1, c.b * bMul * COMP));
      }
    }
    pos.needsUpdate = true;
    geo.setAttribute('color', new THREE.BufferAttribute(colBuf, 3));
    geo.computeVertexNormals();

    const detailTex = _makeDetailTex(side);
    group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading:  false,
      map:          detailTex,   // tiling noise × vertex colour → fine surface detail
    })));

    // ── Water polygons ───────────────────────────────────────────────────────
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x3B7CBF, side: THREE.DoubleSide });
    for (const poly of water) {
      if (poly.coords.length < 3) continue;
      const cx    = poly.coords.reduce((s, c) => s + c[0], 0) / poly.coords.length;
      const cz    = poly.coords.reduce((s, c) => s + c[1], 0) / poly.coords.length;
      // Use raw (pre-flat-zone) elevations so water never floats above the flat-zone-raised terrain
      const wElev = Math.min(
        sampleElev(cx, cz, data.elevations, grid, radiusFt) + correction + 2,
        airport.elevation - 5
      );

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

  // Returns the corrected terrain elevation (post-flatten, post-skirt) at world (wx, wz).
  sampleElevation(wx, wz) {
    if (!this._elevations) return 0;
    const segs = this._grid - 1;
    const j = Math.max(0, Math.min(segs, Math.round((wx + this._radiusFt) / (2 * this._radiusFt) * segs)));
    const i = Math.max(0, Math.min(segs, Math.round((wz + this._radiusFt) / (2 * this._radiusFt) * segs)));
    return this._elevations[i * this._grid + j] ?? 0;
  }

  dispose() {
    if (this._group) { this._scene.remove(this._group); this._group = null; }
  }
}
