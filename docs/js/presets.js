// Scenario presets, calibration targets, and the corrected EUV stock model.

// ASML CEO capacity guidance, Q2 2026 call: ~65 Low-NA systems in 2026,
// +30% for 2027, a further +30% under investigation for 2028.
const ASML_TOOLS_PER_YEAR = { 2026: 65, 2027: 85, 2028: 110, 2029: 110, 2030: 110 };
const ASML_TOOLS_DEFAULT = 110;
const EUV_CUMULATIVE_END_2025 = 290;

// A tool shipped in year Y needs months to install and qualify, so year Y's
// output comes from tools installed by the end of Y-1. The answer is sensitive
// to this: counting same-year shipments moves 2028 from ~75 to ~94 GW/yr.
const EUV_INSTALL_LAG_YEARS = 1;

function cumulativeEuvTools(year) {
  let total = EUV_CUMULATIVE_END_2025;
  for (let y = 2026; y <= year - EUV_INSTALL_LAG_YEARS; y++) {
    total += ASML_TOOLS_PER_YEAR[y] !== undefined ? ASML_TOOLS_PER_YEAR[y] : ASML_TOOLS_DEFAULT;
  }
  return total;
}

function euvCeilingGw(year, aiPct, euvToolsPerGw) {
  return (cumulativeEuvTools(year) * aiPct) / euvToolsPerGw;
}

// The 3.5 tools/GW coefficient is DERIVED from the wafer count: ~2M EUV passes
// per GW from 55K N3 + 6K N5 wafers at ~20 passes each. The wafer count is
// disputed 3x by a bottom-up die count, so these are not free parameters.
const DYLAN_LOGIC_WAFERS_PER_GW = 55000;
const DYLAN_EUV_TOOLS_PER_GW = 3.5;

function euvToolsPerGwFromWafers(logicWafersPerGw) {
  return DYLAN_EUV_TOOLS_PER_GW * (logicWafersPerGw / DYLAN_LOGIC_WAFERS_PER_GW);
}

const DEFAULT_INPUTS = {
  // supply
  aiPct: 0.60,
  logicWafersPerGw: 55000,        // slider 20000-55000; disputed 3x
  powerMode: 'grid',              // grid | ccgt | peaker | nuclear
  // demand
  labGrowthRate: 3.0,             // labs triple per year
  wtpFraction: 0.50,              // labs pay ~$13M/MW while generating ~$50M
  wtpFractionGrowth: 0.18,        // how fast that fraction rises — the key slider
  hyperscalerDemandGw: 12,
  hoarderBuildGw: 4,
  // clearing
  priceElasticity: 0.6,
  damping: 0.5,
  floorCost: 11.0,                // $M/MW — "anyone can make money at $10-15"
  // capital
  baseRate: 0.055,                // Meta raises at 5-6%
  creditMarketDepth: 1400,        // $B/yr of absorbable AI credit issuance
  ecosystemCashFlow: 700,         // $B/yr fundable from operations
  reinvestRate: 0.9,
  // monetization
  labRevPerMw0: 50,               // $M/MW, Anthropic peak today
  inferenceShare: 0.40,
  inferenceShareDecay: 0.04,      // Dylan's non-consensus call: it falls
  regDragSmooth: 0.05,            // withheld model releases
  regStopProbability: 0.25,       // discrete jurisdiction-level stops
  addressableValueB: 42000,       // $B/yr wage bill + IT spend
  captureRate: 0.03,
  captureRateGrowth: 0.35,
};

const CALIBRATION_TARGETS = [
  { id: 'gw2026', label: '2026 new GW', source: 'transcript', basis: 'none', year: 2026, target: 30, tolerance: 0.10 },
  { id: 'gw2027', label: '2027 new GW', source: 'transcript', basis: 'none', year: 2027, target: 50, tolerance: 0.10 },
  { id: 'gw2028', label: '2028 new GW', source: 'transcript', basis: 'none', year: 2028, target: 70, tolerance: 0.10 },
  { id: 'gw2029', label: '2029 new GW', source: 'transcript', basis: 'none', year: 2029, target: 95, tolerance: 0.12 },
  { id: 'cumGw2028', label: '2028 cumulative world GW', source: 'transcript', basis: 'none', year: 2028, target: 200, tolerance: 0.10 },
  { id: 'capex2028', label: '2028 total capex ($B)', source: 'transcript', basis: 'facilityLoad', year: 2028, target: 3500, tolerance: 0.15 },
  { id: 'capexPerGw2026', label: '2026 $B/GW', source: 'epoch-ai', basis: 'itLoad', year: 2026, target: 38.2, tolerance: 0.10 },
  { id: 'capexPerGw2028', label: '2028 $B/GW', source: 'derived', basis: 'itLoad', year: 2028, target: 52, tolerance: 0.15 },
  { id: 'price2028', label: '2028 compute price ($M/MW)', source: 'transcript', basis: 'none', year: 2028, target: 40, tolerance: 0.20 },
  { id: 'cumCapex2029', label: 'Cumulative capex 24-29 ($B)', source: 'semianalysis-model', basis: 'facilityLoad', year: 2029, target: 11000, tolerance: 0.20 },
  { id: 'cumCredit2029', label: 'Cumulative credit 24-29 ($B)', source: 'semianalysis-model', basis: 'none', year: 2029, target: 5000, tolerance: 0.20 },
  { id: 'labShare2028', label: 'Lab share of 2028 incremental', source: 'transcript', basis: 'none', year: 2028, target: 0.75, tolerance: 0.15 },
];

const PRESETS = {
  'dylan-base': {},
  'regulatory-freeze': { regStopProbability: 0.70, regDragSmooth: 0.20, wtpFractionGrowth: 0.05 },
  'capital-crunch':    { baseRate: 0.085, creditMarketDepth: 700, ecosystemCashFlow: 500 },
  'takeoff':           { wtpFractionGrowth: 0.40, labRevPerMw0: 70, inferenceShareDecay: 0.08,
                         regStopProbability: 0.05, captureRateGrowth: 0.60 },
  'power-starved':     { powerMode: 'ccgt', hoarderBuildGw: 1 },
};

const _presetsApi = {
  ASML_TOOLS_PER_YEAR, EUV_CUMULATIVE_END_2025, EUV_INSTALL_LAG_YEARS,
  cumulativeEuvTools, euvCeilingGw, euvToolsPerGwFromWafers,
  DEFAULT_INPUTS, CALIBRATION_TARGETS, PRESETS,
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _presetsApi;
} else if (typeof self !== 'undefined') {
  Object.assign(self, _presetsApi);
}
