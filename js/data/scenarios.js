// 10 VFR weather scenarios
// windFrom: direction wind is FROM (degrees true)
// windSpeed / windGust: knots

export const SCENARIOS = [
  {
    id: 'CALM',
    name: 'Calm & Clear',
    description: 'Ideal conditions — calm winds, clear skies.',
    windFrom: 0, windSpeed: 0, windGust: 0,
    clouds: [], visibility: 10,
    skyColor: '#5AAFF0', fogColor: '#87CEEB'
  },
  {
    id: 'LIGHT_HEAD',
    name: 'Light Headwind (8 kts)',
    description: 'Gentle headwind, clear skies. Great for first practice.',
    windFrom: 360, windSpeed: 8, windGust: 0,
    clouds: [{ coverage: 'FEW', agl: 5000 }], visibility: 10,
    skyColor: '#5AAFF0', fogColor: '#87CEEB'
  },
  {
    id: 'LIGHT_TAIL',
    name: 'Light Tailwind',
    description: 'Light tailwind — choose the best runway carefully.',
    windFrom: 180, windSpeed: 6, windGust: 0,
    clouds: [], visibility: 10,
    skyColor: '#5AAFF0', fogColor: '#87CEEB'
  },
  {
    id: 'DIRECT_CROSS',
    name: 'Direct Crosswind (10 kts)',
    description: 'Steady crosswind. Establish a crab angle on final.',
    windFrom: 90, windSpeed: 10, windGust: 0,
    clouds: [{ coverage: 'FEW', agl: 3500 }], visibility: 10,
    skyColor: '#6DB8F0', fogColor: '#87CEEB'
  },
  {
    id: 'STRONG_CROSS',
    name: 'Strong Crosswind (15 kts)',
    description: 'Near max demonstrated crosswind for light aircraft.',
    windFrom: 270, windSpeed: 15, windGust: 0,
    clouds: [{ coverage: 'SCT', agl: 2500 }], visibility: 8,
    skyColor: '#7EC4EE', fogColor: '#90BEDA'
  },
  {
    id: 'QUARTER_HEAD',
    name: 'Quartering Headwind (10 kts)',
    description: 'Wind slightly off runway heading. Minor crab required.',
    windFrom: 20, windSpeed: 10, windGust: 0,
    clouds: [{ coverage: 'FEW', agl: 4000 }], visibility: 10,
    skyColor: '#5AAFF0', fogColor: '#87CEEB'
  },
  {
    id: 'GUSTY_CROSS',
    name: 'Gusty Crosswind (12 G 18 kts)',
    description: 'Crosswind with gusts. Add half the gust increment to Vref.',
    windFrom: 80, windSpeed: 12, windGust: 18,
    clouds: [{ coverage: 'FEW', agl: 3000 }], visibility: 10,
    skyColor: '#82BFEE', fogColor: '#87CEEB'
  },
  {
    id: 'OVERCAST_HIGH',
    name: 'High Overcast (OVC 050)',
    description: 'Solid ceiling at 5000 ft — comfortably VFR.',
    windFrom: 50, windSpeed: 8, windGust: 0,
    clouds: [{ coverage: 'OVC', agl: 5000 }], visibility: 7,
    skyColor: '#B0C8D8', fogColor: '#B0C8D8'
  },
  {
    id: 'MARGINAL_VFR',
    name: 'Marginal VFR (BKN 035)',
    description: 'Broken layer at 3500 ft and gusty. Still legal VFR but demanding.',
    windFrom: 330, windSpeed: 10, windGust: 14,
    clouds: [{ coverage: 'SCT', agl: 2500 }, { coverage: 'BKN', agl: 3500 }],
    visibility: 5,
    skyColor: '#9AAFC0', fogColor: '#9AAFC0'
  },
  {
    id: 'SCATTERED_LOW',
    name: 'Scattered at 2000 ft',
    description: 'Low scattered layer — pattern altitude is close to clouds.',
    windFrom: 360, windSpeed: 5, windGust: 0,
    clouds: [{ coverage: 'SCT', agl: 2000 }], visibility: 8,
    skyColor: '#A8C4D0', fogColor: '#A8C4D0'
  }
];

// Headwind and crosswind components for a given runway landing heading
export function windComponents(scenario, runwayLandingHdg) {
  const angle = (scenario.windFrom - runwayLandingHdg) * Math.PI / 180;
  return {
    headwind:  scenario.windSpeed * Math.cos(angle),
    crosswind: scenario.windSpeed * Math.sin(angle)
  };
}

// Half the gust increment above steady wind (standard practice addition to Vref)
export function gustAddition(scenario) {
  if (!scenario.windGust || scenario.windGust <= scenario.windSpeed) return 0;
  return Math.round((scenario.windGust - scenario.windSpeed) / 2);
}
