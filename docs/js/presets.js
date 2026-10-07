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

// Illustrative segmented-demand assumptions are defined and frozen in demand.js.
const demandDefaults = (typeof require !== 'undefined') ? require('./demand.js') : self;
const DEFAULT_INPUTS = {
  aiPct: 0.60,
  logicWafersPerGw: 55000,
  powerMode: 'grid',
  demandSegments: demandDefaults.DEFAULT_SEGMENTS,
  hoarderBuildGw: 4,             // desired inventory investment, not final-use demand
  floorCost: 11,                 // $M/MW/year rental floor
  baseRate: 0.055,
  creditMarketDepth: 2500,        // $B/year absorbable credit; unchanged assumption
  ecosystemCashFlow: 1000,        // $B/year; unchanged aggregate funding assumption
  reinvestRate: 0.9,
  regDragSmooth: 0.05,            // retained provider-revenue diagnostic shock
  regStopProbability: 0.25,
  addressableValueB: 42000,       // $B/year economic-value pool, partitioned by final use
};
// Mutable module-level singleton: a stray `Object.assign(DEFAULT_INPUTS, ...)`
// would permanently poison every later simulate() in the same page session.
// Freeze it structurally rather than rely on callers copying it correctly.
Object.freeze(DEFAULT_INPUTS);

// `basis` records the units denominator so the calibration panel never compares
// an IT-load figure against a facility-load one (a 20-30% error at PUE 1.25).
// Only PER-GW targets carry a load basis. A TOTAL-dollar target has no GW
// denominator, so its basis is 'none' — the same datacenter costs the same
// dollars whether you describe it as 1 GW IT or 1.25 GW facility.
//
// outOfSample preserves the earlier dashboard's historical comparison flags.
// None of these comparisons validate the illustrative segment assumptions.
// Lab-owned allocations also differ from a source measure of lab usage.
//
// WINDOW MISMATCH (I5, final review): cumCapex2029 and cumCredit2029 are
// labelled against the source's stated 2024-29 cumulative window, but
// simulate() only accumulates cumulativeCapex/cumulativeCredit from
// START_YEAR (2026) -- see engine.js. Two of the source's six years (2024,
// 2025) are structurally absent from the model's number, which is part of
// why the model's cumulative figures run low against the 24-29 target
// independent of any capital or physical ceiling binding. Relabelled below to
// say what the model actually covers rather than silently comparing
// mismatched windows. Not adding a synthetic 2024-25 baseline: it would need
// assumptions this model doesn't make anywhere else, and target/tolerance
// values are intentionally left untouched (11000 and 5000 stay as sourced).
// `sourceClaimId` forward-links a transcript-sourced target to a citation-
// backed claim in the sibling earnings-call-analyzer repo (see its spec:
// docs/specs/2026-10-04-mag7-capex-evidence-design.md). Today every
// transcript target carries null — the `source: 'transcript'` label is
// opaque, and the number's provenance lives only in this comment block.
// When the ECA claims index exists, fill these with stable claim IDs so
// superseded guidance can be detected instead of silently staling.
const CALIBRATION_TARGETS = [
  { id: 'gw2026', label: '2026 new GW', source: 'transcript', sourceClaimId: null, basis: 'none', year: 2026, target: 30, tolerance: 0.10 },
  { id: 'gw2027', label: '2027 new GW', source: 'transcript', sourceClaimId: null, basis: 'none', year: 2027, target: 50, tolerance: 0.10 },
  { id: 'gw2028', label: '2028 new GW', source: 'transcript', sourceClaimId: null, basis: 'none', year: 2028, target: 70, tolerance: 0.10 },
  { id: 'gw2029', label: '2029 new GW', source: 'transcript', sourceClaimId: null, basis: 'none', year: 2029, target: 95, tolerance: 0.12 },
  { id: 'cumGw2028', label: '2028 cumulative world GW', source: 'transcript', sourceClaimId: null, basis: 'none', year: 2028, target: 200, tolerance: 0.10 },
  { id: 'capex2028', label: '2028 total capex ($B)', source: 'transcript', sourceClaimId: null, basis: 'none', year: 2028, target: 3500, tolerance: 0.15 },
  { id: 'capexPerGw2026', label: '2026 $B/GW', source: 'epoch-ai', basis: 'itLoad', year: 2026, target: 38.2, tolerance: 0.10 },
  { id: 'capexPerGw2028', label: '2028 $B/GW', source: 'derived', basis: 'itLoad', year: 2028, target: 52, tolerance: 0.15 },
  { id: 'price2028', label: '2028 compute price ($M/MW)', source: 'transcript', sourceClaimId: null, basis: 'none', year: 2028, target: 40, tolerance: 0.20, outOfSample: true },
  { id: 'cumCapex2029', label: 'Cumulative capex, model 2026-29 vs source 2024-29 ($B)', source: 'semianalysis-model', basis: 'none', year: 2029, target: 11000, tolerance: 0.20, outOfSample: true },
  { id: 'cumCredit2029', label: 'Cumulative credit, model 2026-29 vs source 2024-29 ($B)', source: 'semianalysis-model', basis: 'none', year: 2029, target: 5000, tolerance: 0.20, outOfSample: true },
  { id: 'labShare2028', label: 'Lab-owned share of allocated GW vs source lab-use share (different bases)', source: 'transcript', sourceClaimId: null, basis: 'none', year: 2028, target: 0.75, tolerance: 0.15, outOfSample: true },
];

function withSegments(transform) {
  return DEFAULT_INPUTS.demandSegments.map(segment => ({ ...segment, ...transform(segment) }));
}

const PRESETS = {
  'dylan-base': {},
  'migration-slow': { demandSegments: withSegments(s => s.apiShare !== undefined ? { migrationRate: 0.05 } : {}) },
  'migration-moderate': { demandSegments: withSegments(s => s.apiShare !== undefined ? { migrationRate: 0.1 } : {}) },
  'migration-fast': { demandSegments: withSegments(s => s.apiShare !== undefined ? { migrationRate: 0.2 } : {}) },
  'regulatory-freeze': { regStopProbability: 0.70, regDragSmooth: 0.20 },
  'capital-crunch': { baseRate: 0.085, creditMarketDepth: 700, ecosystemCashFlow: 500 },
  'takeoff': { demandSegments: withSegments(s => s.valueShare
    ? { adoptionGrowth: 0.60, demandGrowth: 0.60 }
    : { budgetGrowth: 0.60, demandGrowth: 0.60 }), regStopProbability: 0.05 },
  'power-starved': { powerMode: 'ccgt', hoarderBuildGw: 1 },
  // Higher all-in spending share holds adopted economic value fixed. It does
  // not establish profitability or sustainable financing of a rental book.
  'spacex-bull': { demandSegments: withSegments(s => s.id === 'commercial'
    ? { spendingShare: 0.9 } : {}) },
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
