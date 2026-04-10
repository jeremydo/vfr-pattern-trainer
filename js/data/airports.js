// 10 Class D US airports with varied runway configurations
// Data is approximate — verify against official FAA/AF/D sources before use
// Coordinate system: +X=East, +Y=Up, +Z=South (feet from airport reference point)
// runway.heading = landing heading of the LOW-numbered runway end (e.g. 150 for RW15)

export const AIRPORTS = [
  {
    id: 'KAPA', name: 'Centennial Airport', city: 'Englewood, CO',
    lat: 39.5702, lon: -104.8492,
    elevation: 5885, patternAGL: 1000, turbinePatternAGL: 1500,
    runways: [
      {
        id: '17L/35R', heading: 172, length: 10001, width: 100,
        offsetX: 500, offsetZ: 0,
        ends: [{ id: '17L', pattern: 'L' }, { id: '35R', pattern: 'R' }]
      },
      {
        id: '17R/35L', heading: 172, length: 7001, width: 75,
        offsetX: -500, offsetZ: 0,
        ends: [{ id: '17R', pattern: 'R' }, { id: '35L', pattern: 'L' }]
      }
    ]
  },
  {
    id: 'KSNA', name: 'John Wayne Airport', city: 'Santa Ana, CA',
    lat: 33.6757, lon: -117.8682,
    elevation: 56, patternAGL: 1000, turbinePatternAGL: 1500,
    runways: [
      {
        id: '20L/2R', heading: 196, length: 5701, width: 150,
        offsetX: 400, offsetZ: 0,
        ends: [{ id: '20L', pattern: 'L' }, { id: '2R', pattern: 'R' }]
      },
      {
        id: '20R/2L', heading: 196, length: 2887, width: 75,
        offsetX: -400, offsetZ: 0,
        ends: [{ id: '20R', pattern: 'R' }, { id: '2L', pattern: 'L' }]
      }
    ]
  },
  {
    id: 'KVNY', name: 'Van Nuys Airport', city: 'Van Nuys, CA',
    lat: 34.2098, lon: -118.4898,
    elevation: 802, patternAGL: 1000, turbinePatternAGL: 1500,
    runways: [
      {
        id: '16L/34R', heading: 163, length: 8001, width: 150,
        offsetX: 600, offsetZ: 0,
        ends: [{ id: '16L', pattern: 'R' }, { id: '34R', pattern: 'L' }]
      },
      {
        id: '16R/34L', heading: 163, length: 4013, width: 75,
        offsetX: -600, offsetZ: 0,
        ends: [{ id: '16R', pattern: 'L' }, { id: '34L', pattern: 'R' }]
      }
    ]
  },
  {
    id: 'KFXE', name: 'Fort Lauderdale Executive', city: 'Fort Lauderdale, FL',
    lat: 26.1973, lon: -80.1707,
    elevation: 13, patternAGL: 1000, turbinePatternAGL: 1500,
    runways: [
      {
        id: '09/27', heading: 90, length: 6002, width: 100,
        offsetX: 0, offsetZ: 0,
        ends: [{ id: '09', pattern: 'L' }, { id: '27', pattern: 'R' }]
      },
      {
        id: '13/31', heading: 130, length: 2727, width: 100,
        offsetX: 400, offsetZ: 600,
        ends: [{ id: '13', pattern: 'R' }, { id: '31', pattern: 'L' }]
      }
    ]
  },
  {
    id: 'KRNT', name: 'Renton Municipal Airport', city: 'Renton, WA',
    lat: 47.4931, lon: -122.2157,
    elevation: 32, patternAGL: 1000, turbinePatternAGL: 1500,
    runways: [
      {
        id: '16/34', heading: 160, length: 5382, width: 200,
        offsetX: 0, offsetZ: 0,
        ends: [{ id: '16', pattern: 'R' }, { id: '34', pattern: 'L' }]
      }
    ]
  },
  {
    id: 'KSQL', name: 'San Carlos Airport', city: 'San Carlos, CA',
    lat: 37.5119, lon: -122.2499,
    elevation: 5, patternAGL: 800, turbinePatternAGL: 1000,
    runways: [
      {
        id: '12/30', heading: 121, length: 2600, width: 75,
        offsetX: 0, offsetZ: 0,
        ends: [{ id: '12', pattern: 'R' }, { id: '30', pattern: 'L' }]
      }
    ]
  },
  {
    id: 'KFRG', name: 'Republic Airport', city: 'Farmingdale, NY',
    lat: 40.7288, lon: -73.4134,
    elevation: 80, patternAGL: 1000, turbinePatternAGL: 1500,
    runways: [
      {
        id: '14/32', heading: 140, length: 6833, width: 150,
        offsetX: 0, offsetZ: 0,
        ends: [{ id: '14', pattern: 'R' }, { id: '32', pattern: 'L' }]
      },
      {
        id: '01/19', heading: 10, length: 5516, width: 150,
        offsetX: -800, offsetZ: 200,
        ends: [{ id: '01', pattern: 'R' }, { id: '19', pattern: 'L' }]
      }
    ]
  },
  {
    id: 'KHEF', name: 'Manassas Regional Airport', city: 'Manassas, VA',
    lat: 38.7214, lon: -77.5150,
    elevation: 192, patternAGL: 1000, turbinePatternAGL: 1500,
    runways: [
      {
        id: '16L/34R', heading: 164, length: 6200, width: 100,
        offsetX: 500, offsetZ: 0,
        ends: [{ id: '16L', pattern: 'R' }, { id: '34R', pattern: 'L' }]
      },
      {
        id: '16R/34L', heading: 164, length: 3702, width: 100,
        offsetX: -500, offsetZ: 0,
        ends: [{ id: '16R', pattern: 'L' }, { id: '34L', pattern: 'R' }]
      }
    ]
  },
  {
    id: 'KBJC', name: 'Rocky Mountain Metro Airport', city: 'Broomfield, CO',
    lat: 39.9088, lon: -105.1172,
    elevation: 5673, patternAGL: 1000, turbinePatternAGL: 1500,
    runways: [
      {
        id: '12L/30R', heading: 122, length: 9000, width: 100,
        offsetX: 600, offsetZ: 0,
        ends: [{ id: '12L', pattern: 'R' }, { id: '30R', pattern: 'L' }]
      },
      {
        id: '12R/30L', heading: 122, length: 7002, width: 75,
        offsetX: -600, offsetZ: 0,
        ends: [{ id: '12R', pattern: 'L' }, { id: '30L', pattern: 'R' }]
      },
      {
        id: '03/21', heading: 32, length: 3600, width: 75,
        offsetX: 0, offsetZ: -2000,
        ends: [{ id: '03', pattern: 'L' }, { id: '21', pattern: 'R' }]
      }
    ]
  },
  {
    id: 'KGYI', name: 'North Texas Regional Airport', city: 'Sherman, TX',
    lat: 33.7142, lon: -96.6736,
    elevation: 749, patternAGL: 1000, turbinePatternAGL: 1500,
    runways: [
      {
        id: '17L/35R', heading: 172, length: 9000, width: 150,
        offsetX: 600, offsetZ: 0,
        ends: [{ id: '17L', pattern: 'L' }, { id: '35R', pattern: 'R' }]
      },
      {
        id: '17R/35L', heading: 172, length: 2277, width: 60,
        offsetX: -600, offsetZ: 0,
        ends: [{ id: '17R', pattern: 'R' }, { id: '35L', pattern: 'L' }]
      }
    ]
  }
];

// Direction vector for a compass heading in world space (+X=East, +Z=South)
export function headingVec(deg) {
  const r = deg * Math.PI / 180;
  return { x: Math.sin(r), z: -Math.cos(r) };
}

// Threshold world position for a runway end (feet, relative to airport origin at Y=elevation)
export function thresholdPos(runway, endId, elevation) {
  const landingHdg      = parseInt(endId) * 10;
  const hdgToThreshold  = (landingHdg + 180) % 360;  // opposite of landing direction
  const v    = headingVec(hdgToThreshold);
  const half = runway.length / 2;
  return {
    x: runway.offsetX + v.x * half,
    y: elevation,
    z: runway.offsetZ + v.z * half
  };
}

// Select the runway end with the best headwind component for a given wind
export function selectActiveEnd(airport, windFrom, windSpeed) {
  let best = null, bestHW = -Infinity;
  for (const rwy of airport.runways) {
    for (const end of rwy.ends) {
      const landingHdg = parseInt(end.id) * 10;
      const hw = windSpeed * Math.cos((windFrom - landingHdg) * Math.PI / 180);
      if (hw > bestHW) { bestHW = hw; best = { runway: rwy, end }; }
    }
  }
  return best || { runway: airport.runways[0], end: airport.runways[0].ends[0] };
}

export function getPatternAlt(airport, isTurbine) {
  return airport.elevation + (isTurbine ? airport.turbinePatternAGL : airport.patternAGL);
}
