// Aircraft performance data — approximate, based on published POH values
// Speeds in knots

export const AIRCRAFT = {
  C172: {
    id: 'C172',
    name: 'Cessna 172S Skyhawk',
    type: 'piston',
    gear: 'fixed',
    flaps: [0, 10, 20, 30],          // degrees per position index
    flapLabels: ['UP', '10°', '20°', '30°'],
    vfe:  [null, 110, 85, 85],        // max speed per flap position (null = clean)
    vs0:  40,   vs1:  48,             // stall speeds: full flaps / clean
    vy:   74,   vno: 129,  vne: 163,
    cruise: 110,
    speeds: { downwind: 90, base: 80, final: 65 },
    accelRate: 0.25,   // airspeed convergence rate (1/s)
    pitchRate: 2.5,    // attitude change rate multiplier
    rollRate:  3.0,
    maxPitch:  15,     // max controllable pitch degrees
    maxBank:   45,
    flapDrag:  [0, 0.06, 0.14, 0.24], // fractional cruise-speed reduction per flap position
    gearDrag:  0,                      // fixed gear: drag already in baseline
    color: { body: 0xFFFFFF, accent: 0xCC3333, gear: 0x444444 },
    wingHigh: true                     // high-wing aircraft
  },

  C182T: {
    id: 'C182T',
    name: 'Cessna 182T Skylane',
    type: 'piston',
    gear: 'fixed',
    flaps: [0, 10, 20, 30],
    flapLabels: ['UP', '10°', '20°', '30°'],
    vfe:  [null, 140, 110, 95],
    vs0:  49,   vs1:  56,
    vy:   80,   vno: 140,  vne: 175,
    cruise: 145,
    speeds: { downwind: 100, base: 90, final: 70 },
    accelRate: 0.28,
    pitchRate: 2.6,
    rollRate:  3.2,
    maxPitch:  15,
    maxBank:   45,
    flapDrag:  [0, 0.05, 0.13, 0.24],
    gearDrag:  0,
    color: { body: 0xF8F8F8, accent: 0x1A5B8C, gear: 0x444444 },
    wingHigh: true
  },

  SR22: {
    id: 'SR22',
    name: 'Cirrus SR22',
    type: 'piston',
    gear: 'fixed',
    flaps: [0, 50, 100],
    flapLabels: ['UP', '50%', '100%'],
    vfe:  [null, 119, 104],
    vs0:  59,   vs1:  71,
    vy:  101,   vno: 178,  vne: 201,
    cruise: 183,
    speeds: { downwind: 110, base: 100, final: 85 },
    accelRate: 0.30,
    pitchRate: 2.8,
    rollRate:  3.5,
    maxPitch:  15,
    maxBank:   45,
    flapDrag:  [0, 0.08, 0.20],
    gearDrag:  0,
    color: { body: 0xE8E8E8, accent: 0x1155AA, gear: 0x444444 },
    wingHigh: false
  },

  TBM930: {
    id: 'TBM930',
    name: 'Daher TBM 930',
    type: 'turbine',
    gear: 'retractable',
    flaps: [0, 1, 2],
    flapLabels: ['UP', 'T/O', 'APR'],
    vfe:  [null, 178, 122],
    vge:  178,                         // max gear extension speed
    vs0:  75,   vs1:  82,
    vy:  124,   vno: 266,  vne: 266,
    cruise: 290,
    speeds: { downwind: 150, base: 120, final: 98 },
    accelRate: 0.45,
    pitchRate: 3.0,
    rollRate:  4.0,
    maxPitch:  15,
    maxBank:   45,
    flapDrag:  [0, 0.05, 0.20],
    gearDrag:  0.10,
    color: { body: 0xF0F0F0, accent: 0x224488, gear: 0x333333 },
    wingHigh: false
  }
};

export const AIRCRAFT_LIST = Object.values(AIRCRAFT);

// Vref = Vs0 × 1.3 (standard approach speed with full flaps)
export function vref(aircraft) {
  return Math.round(aircraft.vs0 * 1.3);
}

export function flapLabel(aircraft, pos) {
  return aircraft.flapLabels ? aircraft.flapLabels[pos] : aircraft.flaps[pos] + '°';
}
