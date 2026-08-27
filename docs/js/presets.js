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
  // Labs' WILLINGNESS to pay, as a fraction of what they generate. Dylan's
  // figure: they would pay ~$50M/MW while generating ~$100M/MW.
  // Do NOT set this to 0.26. That is the observed CLEARING OUTCOME (they pay
  // ~$13M today while generating ~$50M), not their willingness. Feeding the
  // outcome back in as an input makes labWtp equal the starting computePrice
  // exactly, so clearPrice clamps to [floorCost, labWtp] and price can never
  // move — the whole market mechanic goes inert.
  wtpFraction: 0.50,
  wtpFractionGrowth: 0.18,        // how fast that fraction rises — the key slider
  // Task 9 calibration: 12 -> 16. Under the corrected stepRails ceiling
  // default (see engine.js), 12 left 2026 demand at ~26 GW against a 30 GW
  // pipeline ceiling -- pure slack, no scarcity, and no repricing signal for
  // the "capex per GW inflates from rail repricing alone" acceptance test.
  hyperscalerDemandGw: 16,
  hoarderBuildGw: 4,
  // clearing
  // Task 9 calibration: 0.6 -> 1.0 and damping 0.5 -> 1.0 (below). Needed for
  // computePrice to inflect >1.8x by 2028 against the modest (1.0-1.4x)
  // demand/supply gap the corrected rail ceilings produce; see engine.js's
  // PIPELINE_BASE/GROWTH comment for why that gap can't simply be widened
  // further without starving the 2029 GW target through the capital ceiling.
  priceElasticity: 1.0,
  damping: 1.0,
  floorCost: 11.0,                // $M/MW — "anyone can make money at $10-15"
  // capital
  baseRate: 0.055,                // Meta raises at 5-6%
  // Task 9 / fix round 1 pushed these to creditMarketDepth 8000 and
  // ecosystemCashFlow 1200 to keep "capital" from ever binding -- which was
  // masking a modeling bug (fix round 1's capital ceiling fed the rail
  // REPRICING signal, so a credit crunch spuriously repriced HBM/CoWoS/power
  // as if they were physically scarce; see physicalCeiling() in engine.js,
  // which now excludes capital from that signal). With the bug fixed, these
  // no longer need to be implausible, and 8000 never was defensible (total US
  // investment-grade corporate bond issuance is ~$1.5T/yr for the WHOLE
  // economy). Reset to plausible bases:
  //   ecosystemCashFlow 1000: combined hyperscaler operating cash flow is
  //     roughly $500-600B/yr today, plus chipmakers ~$150B/yr; 1000 already
  //     assumes continued growth on top of that.
  //   creditMarketDepth 2500: a large share of US investment-grade issuance
  //     plus private credit and ABS specifically absorbable by AI
  //     infrastructure. Already generous, not a hard ceiling on all credit.
  // With capital repricing removed, `capital` DOES bind here (see the fix
  // round 2 report) and pulls the GW path below the 30/50/70/95 target --
  // left as-is rather than re-inflated to force the path green. That result
  // is the finding: see the report for the creditMarketDepth Dylan's stated
  // GW path would actually require.
  creditMarketDepth: 2500,        // $B/yr of absorbable AI credit issuance
  ecosystemCashFlow: 1000,        // $B/yr fundable from operations
  reinvestRate: 0.9,
  // monetization
  labRevPerMw0: 50,               // $M/MW, Anthropic peak today
  inferenceShare: 0.40,
  inferenceShareDecay: 0.04,      // Dylan's non-consensus call: it falls
  regDragSmooth: 0.05,            // withheld model releases
  regStopProbability: 0.25,       // discrete jurisdiction-level stops
  addressableValueB: 42000,       // $B/yr wage bill + IT spend
  // Fix round 1 (Task 11): 0.03 implied 42000 x 0.03 = $1,260B/yr of AI
  // revenue TODAY -- 8-20x actual (OpenAI ~$25B ARR, Anthropic ~$19B, maybe
  // ~$60-150B across all AI software). That overstatement defanged the
  // diffusion ceiling entirely: diffusionBound was never true anywhere,
  // across every preset, at any point in the simulated horizon. 0.004
  // implies 42000 x 0.004 = $168B/yr, a defensible 2026 starting point, and
  // is calibrated so the ceiling actually binds (2027-2029 at defaults)
  // while preserving the 2026-2028 GW acceptance path. Do NOT restore 0.03.
  captureRate: 0.004,
  captureRateGrowth: 0.35,
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
// `outOfSample: true` marks the four targets spec:758 calls out as
// independent of the GW discussion the model IS fitted against -- hitting
// them validates the engine on numbers it was never tuned to. At
// DEFAULT_INPUTS, 0 of these 4 pass; the calibration panel (render.js
// calibrationHtml) states that count plainly rather than only surfacing the
// two GW/lab-share misses the page header calls out by name.
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
const CALIBRATION_TARGETS = [
  { id: 'gw2026', label: '2026 new GW', source: 'transcript', basis: 'none', year: 2026, target: 30, tolerance: 0.10 },
  { id: 'gw2027', label: '2027 new GW', source: 'transcript', basis: 'none', year: 2027, target: 50, tolerance: 0.10 },
  { id: 'gw2028', label: '2028 new GW', source: 'transcript', basis: 'none', year: 2028, target: 70, tolerance: 0.10 },
  { id: 'gw2029', label: '2029 new GW', source: 'transcript', basis: 'none', year: 2029, target: 95, tolerance: 0.12 },
  { id: 'cumGw2028', label: '2028 cumulative world GW', source: 'transcript', basis: 'none', year: 2028, target: 200, tolerance: 0.10 },
  { id: 'capex2028', label: '2028 total capex ($B)', source: 'transcript', basis: 'none', year: 2028, target: 3500, tolerance: 0.15 },
  { id: 'capexPerGw2026', label: '2026 $B/GW', source: 'epoch-ai', basis: 'itLoad', year: 2026, target: 38.2, tolerance: 0.10 },
  { id: 'capexPerGw2028', label: '2028 $B/GW', source: 'derived', basis: 'itLoad', year: 2028, target: 52, tolerance: 0.15 },
  { id: 'price2028', label: '2028 compute price ($M/MW)', source: 'transcript', basis: 'none', year: 2028, target: 40, tolerance: 0.20, outOfSample: true },
  { id: 'cumCapex2029', label: 'Cumulative capex, model 2026-29 vs source 2024-29 ($B)', source: 'semianalysis-model', basis: 'none', year: 2029, target: 11000, tolerance: 0.20, outOfSample: true },
  { id: 'cumCredit2029', label: 'Cumulative credit, model 2026-29 vs source 2024-29 ($B)', source: 'semianalysis-model', basis: 'none', year: 2029, target: 5000, tolerance: 0.20, outOfSample: true },
  { id: 'labShare2028', label: 'Lab share of 2028 incremental', source: 'transcript', basis: 'none', year: 2028, target: 0.75, tolerance: 0.15, outOfSample: true },
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
