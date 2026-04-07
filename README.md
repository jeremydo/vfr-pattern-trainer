# VFR Pattern Trainer

A browser-based 3D simulator for practicing VFR traffic patterns and landings at real US airports.

## Features

- **10 real Class D airports** with accurate runway configurations and elevations
- **3 aircraft** — Cessna 172S (fixed gear), Cirrus SR22 (fixed gear), Daher TBM 930 (turbine/retractable)
- **Weather scenarios** — calm, crosswind, gusty, overcast, and more
- **G1000-style PFD** overlay with speed tape, altitude tape, VSI, AI, and heading tape
- **Pattern phase detection** — CRUISE → DOWNWIND → BASE → FINAL → FLARE → LANDED
- **Real-time warnings** — altitude deviations, speed callouts, gear/flap reminders, PAPI guidance
- **Smooth 3D pattern guide** (press T) with color-coded legs and rounded turns
- **Flight scoring and debrief** — gear, speed, pattern altitude, touchdown zone, centerline, sink rate
- **High score tracking** per airport/runway/aircraft combination (localStorage)

## Airports

KAPA, KSNA, KVNY, KFXE, KRNT, KSQL, KFRG, KHEF, KBJC, KGYI

## Controls

| Key | Action |
|-----|--------|
| ↑ ↓ / W S | Pitch |
| ← → / A D | Roll |
| = / − | Throttle up / down |
| F / V | Flaps down / up |
| G | Gear toggle |
| B | Brakes |
| T | Pattern guide on/off |
| P / Esc | Pause |

## Running

Open `index.html` in a browser. No build step or server required — uses ES modules with an import map pointing to Three.js on jsDelivr.

> A local server is needed if your browser blocks local ES module imports. Run e.g. `npx serve .` or `python3 -m http.server`.

## Stack

- [Three.js](https://threejs.org/) r168 — 3D scene, aircraft model, airport geometry
- Vanilla JS (ES modules) — flight model, pattern checker, HUD, UI
- HTML Canvas 2D — PFD instruments
