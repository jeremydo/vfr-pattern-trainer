#!/usr/bin/env node
// Fetches elevation + OSM feature data for each airport.
// Outputs js/data/terrain/{ICAO}.json
// Usage: npm run fetch-terrain
'use strict';

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { PNG } = require('pngjs');

const AIRPORTS = [
  { id: 'KAPA', lat: 39.5702, lon: -104.8492 },
  { id: 'KSNA', lat: 33.6757, lon: -117.8682 },
  { id: 'KVNY', lat: 34.2098, lon: -118.4898 },
  { id: 'KFXE', lat: 26.1973, lon:  -80.1707 },
  { id: 'KRNT', lat: 47.4931, lon: -122.2157 },
  { id: 'KSQL', lat: 37.5119, lon: -122.2499 },
  { id: 'KFRG', lat: 40.7288, lon:  -73.4134 },
  { id: 'KHEF', lat: 38.7214, lon:  -77.5150 },
  { id: 'KBJC', lat: 39.9088, lon: -105.1172 },
  { id: 'KEUG', lat: 44.1246, lon: -123.2119 },
  { id: 'KGYI', lat: 33.7142, lon:  -96.6736 },
];

const ZOOM     = 9;       // Terrarium tile zoom level
const GRID     = 64;      // Output grid resolution (64×64 vertices)
const RADIUS_M = 80000;   // 80 km ≈ 50 miles sampling radius
const OUT_DIR  = path.join(__dirname, '..', 'js', 'data', 'terrain');

// ── Mercator / tile math ─────────────────────────────────────────────────────

function tileXF(lon, z) { return (lon + 180) / 360 * (1 << z); }
function tileYF(lat, z) {
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << z);
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function fetchBuffer(url, hops = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'vfr-terrain-builder/1.0' } }, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && hops > 0) {
        res.resume();
        return fetchBuffer(res.headers.location, hops - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function decodePNG(buf) {
  return new Promise((resolve, reject) =>
    new PNG().parse(buf, (err, data) => err ? reject(err) : resolve(data))
  );
}

// Terrarium zero-elevation fallback tile (sea level)
function zeroTile() {
  const png = { width: 256, height: 256, data: Buffer.alloc(256 * 256 * 4) };
  // R=128, G=0, B=0 → elevation = 128*256 + 0 + 0 - 32768 = 0 m
  for (let i = 0; i < 256 * 256; i++) { png.data[i * 4] = 128; png.data[i * 4 + 3] = 255; }
  return png;
}

async function fetchTile(z, x, y) {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  process.stdout.write(`    tile ${z}/${x}/${y} ... `);
  try {
    const buf = await fetchBuffer(url);
    const png = await decodePNG(buf);
    console.log('ok');
    return png;
  } catch (e) {
    console.log(`failed (${e.message}), using zero`);
    return zeroTile();
  }
}

// ── Terrarium decode ─────────────────────────────────────────────────────────

function terrariumM(png, px, py) {
  px = Math.max(0, Math.min(png.width  - 1, Math.floor(px)));
  py = Math.max(0, Math.min(png.height - 1, Math.floor(py)));
  const i = (py * png.width + px) * 4;
  const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
  return r * 256 + g + b / 256 - 32768;
}

// ── Elevation grid ───────────────────────────────────────────────────────────

async function buildElevGrid(lat, lon) {
  const cx = Math.floor(tileXF(lon, ZOOM));
  const cy = Math.floor(tileYF(lat, ZOOM));

  // Fetch 3×3 tile neighbourhood centred on airport
  const tiles = {};
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      tiles[`${dx},${dy}`] = await fetchTile(ZOOM, cx - 1 + dx, cy - 1 + dy);
    }
  }

  function lookupM(qlat, qlon) {
    const tx  = tileXF(qlon, ZOOM);
    const ty  = tileYF(qlat, ZOOM);
    const txi = Math.floor(tx);
    const tyi = Math.floor(ty);
    const dxi = txi - (cx - 1);
    const dyi = tyi - (cy - 1);
    if (dxi < 0 || dxi > 2 || dyi < 0 || dyi > 2) return 0;
    const tile = tiles[`${dxi},${dyi}`];
    return terrariumM(tile, (tx - txi) * 256, (ty - tyi) * 256);
  }

  const FT_PER_M = 3.28084;
  const latRange = RADIUS_M / 111319.9;          // degrees
  const lonRange = latRange / Math.cos(lat * Math.PI / 180);
  const latStep  = (latRange * 2) / (GRID - 1);
  const lonStep  = (lonRange * 2) / (GRID - 1);

  const elevFt = [];
  for (let i = 0; i < GRID; i++) {
    const qlat = lat + latRange - i * latStep;   // row 0 = north
    for (let j = 0; j < GRID; j++) {
      const qlon = lon - lonRange + j * lonStep; // col 0 = west
      elevFt.push(Math.round(lookupM(qlat, qlon) * FT_PER_M));
    }
  }
  return elevFt;
}

// ── Overpass API ─────────────────────────────────────────────────────────────

function overpassQuery(query) {
  const body = 'data=' + encodeURIComponent(query);
  return new Promise(resolve => {
    const opts = {
      hostname: 'overpass-api.de',
      path: '/api/interpreter',
      method: 'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent':     'vfr-terrain-builder/1.0',
      },
    };
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (_) { resolve({ elements: [] }); }
      });
    });
    req.on('error', () => resolve({ elements: [] }));
    req.write(body);
    req.end();
  });
}

async function fetchFeatures(lat, lon) {
  const R    = RADIUS_M / 111319.9;
  const Rlon = R / Math.cos(lat * Math.PI / 180);
  const bbox = `${lat - R},${lon - Rlon},${lat + R},${lon + Rlon}`;

  console.log('  Fetching OSM water...');
  const waterData = await overpassQuery(
    `[out:json][timeout:30];(way["natural"="water"](${bbox});way["landuse"="reservoir"](${bbox}););out geom;`
  );

  console.log('  Fetching OSM rivers...');
  const riverData = await overpassQuery(
    `[out:json][timeout:30];way["waterway"~"^(river|canal)$"]["name"](${bbox});out geom;`
  );

  console.log('  Fetching OSM towns...');
  const townData = await overpassQuery(
    `[out:json][timeout:30];node["place"~"^(city|town|village)$"](${bbox});out body;`
  );

  return { waterData, riverData, townData };
}

// ── Coordinate conversion ────────────────────────────────────────────────────

function ll2ft(lat, lon, aLat, aLon) {
  const FPD = 364567; // feet per degree of latitude (mean)
  const x   = Math.round((lon - aLon) * Math.cos(aLat * Math.PI / 180) * FPD);
  const z   = Math.round(-(lat - aLat) * FPD); // +Z = south
  return { x, z };
}

// ── OSM feature processors ───────────────────────────────────────────────────

function processWater(elements, aLat, aLon) {
  // Keep only the 30 largest water bodies (by geometry point count as proxy for area).
  // Skip anything with fewer than 10 geometry points (tiny ponds).
  const candidates = elements
    .filter(el => el.geometry?.length >= 10)
    .sort((a, b) => b.geometry.length - a.geometry.length)
    .slice(0, 30);

  const out = [];
  for (const el of candidates) {
    const MAX_PTS = 24;
    const step    = Math.max(1, Math.floor(el.geometry.length / MAX_PTS));
    const coords  = [];
    for (let k = 0; k < el.geometry.length; k += step) {
      const g = el.geometry[k];
      const { x, z } = ll2ft(g.lat, g.lon, aLat, aLon);
      coords.push([x, z]);
    }
    if (coords.length >= 3) out.push({ coords });
  }
  return out;
}

function processRivers(elements, aLat, aLon) {
  // Keep the 15 longest rivers (by geometry point count).
  const candidates = elements
    .filter(el => el.geometry?.length >= 4)
    .sort((a, b) => b.geometry.length - a.geometry.length)
    .slice(0, 15);

  const out = [];
  for (const el of candidates) {
    const MAX_PTS = 32;
    const step    = Math.max(1, Math.floor(el.geometry.length / MAX_PTS));
    const coords  = [];
    for (let k = 0; k < el.geometry.length; k += step) {
      const g = el.geometry[k];
      const { x, z } = ll2ft(g.lat, g.lon, aLat, aLon);
      coords.push([x, z]);
    }
    if (coords.length >= 2) out.push({ coords, widthFt: 600 });
  }
  return out;
}

function processTowns(elements, aLat, aLon, radFt) {
  return elements
    .filter(el => el.lat != null)
    .map(el => {
      const { x, z } = ll2ft(el.lat, el.lon, aLat, aLon);
      const pop  = parseInt(el.tags?.population) || 0;
      const size = pop > 100000 ? 3 : pop > 10000 ? 2 : 1;
      return { name: el.tags?.name || '', x, z, size, pop };
    })
    .filter(t => Math.abs(t.x) < radFt && Math.abs(t.z) < radFt)
    .sort((a, b) => b.pop - a.pop || b.size - a.size)
    .slice(0, 50)
    .map(({ name, x, z, size }) => ({ name, x, z, size }));
}

// ── Per-airport pipeline ─────────────────────────────────────────────────────

async function processAirport(apt) {
  console.log(`\n── ${apt.id}  (${apt.lat}, ${apt.lon}) ──`);

  const radFt = Math.round(RADIUS_M * 3.28084);

  console.log('  Building elevation grid (9 tiles)...');
  const elevations = await buildElevGrid(apt.lat, apt.lon);

  const { waterData, riverData, townData } = await fetchFeatures(apt.lat, apt.lon);

  const water  = processWater(waterData.elements  || [], apt.lat, apt.lon);
  const rivers = processRivers(riverData.elements || [], apt.lat, apt.lon);
  const towns  = processTowns(townData.elements   || [], apt.lat, apt.lon, radFt);

  console.log(`  Water: ${water.length}  Rivers: ${rivers.length}  Towns: ${towns.length}`);

  const output   = { grid: GRID, radiusFt: radFt, elevations, water, rivers, towns };
  const outFile  = path.join(OUT_DIR, `${apt.id}.json`);
  fs.writeFileSync(outFile, JSON.stringify(output));
  const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`  ✓ ${path.basename(outFile)}  (${kb} KB)`);
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Optional: pass an ICAO code as CLI argument to process a single airport
  // e.g.  node scripts/fetch_terrain.js KEUG
  const filter = process.argv[2]?.toUpperCase();
  const queue  = filter ? AIRPORTS.filter(a => a.id === filter) : AIRPORTS;
  if (filter && queue.length === 0) {
    console.error(`Airport ${filter} not found in list.`); process.exit(1);
  }
  let ok = 0, fail = 0;
  for (const apt of queue) {
    try   { await processAirport(apt); ok++;   }
    catch (e) { console.error(`  ✗ ${apt.id}: ${e.message}`); fail++; }
  }
  console.log(`\nDone: ${ok} ok, ${fail} failed`);
}

main().catch(console.error);
