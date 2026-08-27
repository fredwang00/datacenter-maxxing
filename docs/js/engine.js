// Year-by-year market simulation. Pure: takes inputs, returns an array of
// year states. No DOM, no Date.now(), no ambient randomness.

(function (root, factory) {
  const rails = (typeof require !== 'undefined') ? require('./rails.js') : root;
  const presets = (typeof require !== 'undefined') ? require('./presets.js') : root;
  const api = factory(rails, presets);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function (rails, presets) {

const { RAILS, railById, initialRailPrice, sumPerGw, newStepState, railTightness } = rails;
const { clamp } = rails;
const { euvCeilingGw, euvToolsPerGwFromWafers } = presets;

const START_YEAR = 2026;
const END_YEAR = 2030;
const INSTALLED_GW_END_2025 = 50;
const LAB_GW_END_2025 = 4;

// $B per GW of datacenter load, and lead time in years.
const POWER_MODES = {
  grid:    { label: 'Grid-connected',    pricePerGw: 0.5,  leadYears: 5, provenance: 'researched:interconnection' },
  ccgt:    { label: 'Dedicated CCGT',    pricePerGw: 2.6,  leadYears: 5, provenance: 'researched:lazard-v19-bnef' },
  peaker:  { label: 'Simple-cycle',      pricePerGw: 1.6,  leadYears: 3, provenance: 'researched:lazard-v19' },
  nuclear: { label: 'New nuclear',       pricePerGw: 17.0, leadYears: 7, provenance: 'researched:lazard-v19' },
};

// Baseline pipeline capacity per rail, before bullwhip expansion, discounted
// for announcement-to-delivery attrition (only ~13% of announced interconnection
// queue capacity ever reaches commercial operation).
const PIPELINE_BASE = { memory: 34, package: 38, power: 33 };
const PIPELINE_GROWTH = { memory: 0.42, package: 0.40, power: 0.34 };

function seedPipelines(state, inputs) {
  for (const railId of Object.keys(PIPELINE_BASE)) {
    state.pipeline[railId] = {};
    for (let y = START_YEAR; y <= END_YEAR + 6; y++) {
      const delta = y - START_YEAR;
      state.pipeline[railId][y] = PIPELINE_BASE[railId] * Math.pow(1 + PIPELINE_GROWTH[railId], delta);
    }
  }
}

function initialState(inputs) {
  const railPrice = initialRailPrice();
  railPrice.power = POWER_MODES[inputs.powerMode].pricePerGw;
  const stepStates = {};
  for (const r of RAILS) if (r.elasticity === 'step') stepStates[r.id] = newStepState();

  const capexPerGw = sumPerGw(railPrice);
  const state = {
    installedGw: INSTALLED_GW_END_2025,
    effectiveGw: INSTALLED_GW_END_2025,
    labGw: LAB_GW_END_2025,
    computePrice: 13,
    labRevPerMw: inputs.labRevPerMw0,
    capexPerGw,
    rate: inputs.baseRate,
    railPrice,
    stepStates,
    pipeline: {},
    hoardedStock: 0,
    cumulativeCredit: 0,
    cumulativeCapex: 0,
    capability: 1,
    availableCapital: inputs.ecosystemCashFlow + inputs.creditMarketDepth,
    wtpFraction: inputs.wtpFraction,
    inferenceShare: inputs.inferenceShare,
    captureRate: inputs.captureRate,
  };
  seedPipelines(state, inputs);
  return state;
}

// Pipeline capacity for a rail in a given year, defaulting to a generous
// baseline so an unseeded rail never spuriously binds.
function pipelineCapacity(state, railId, year, fallback) {
  const byYear = state.pipeline[railId];
  if (!byYear || byYear[year] === undefined) return fallback;
  return byYear[year];
}

function computeCeilings(state, inputs, year) {
  const euvToolsPerGw = euvToolsPerGwFromWafers(inputs.logicWafersPerGw);
  return {
    euv:     euvCeilingGw(year, inputs.aiPct, euvToolsPerGw),
    memory:  pipelineCapacity(state, 'memory', year, 999),
    package: pipelineCapacity(state, 'package', year, 999),
    power:   pipelineCapacity(state, 'power', year, 999),
    capital: state.availableCapital / state.capexPerGw,
  };
}

function bindingConstraint(ceilings) {
  let best = null, bestVal = Infinity;
  for (const [k, v] of Object.entries(ceilings)) {
    if (v < bestVal) { bestVal = v; best = k; }
  }
  return best;
}

const ARB_SHELF_MAX_GW = 12;
const ARB_SHELF_SHARPNESS = 6;
// Exponent on the headroom term in priceDamp. Bounded by the calibration
// tests: priceDamp(10, 50) must stay above 0.9 and priceDamp(49, 50) must
// stay below 0.3, which pins this to roughly (0.31, 0.47). 0.4 sits in the
// middle of that range.
const PRICE_DAMP_EXPONENT = 0.4;

// The "download Kimi weights and put it on OpenRouter" crowd. Near-infinitely
// elastic below the floor, gone above it. Does not compete for scarce compute
// -- it sets the floor.
function arbitrageShelf(price, floorCost) {
  const excess = (price - floorCost) / floorCost;
  return ARB_SHELF_MAX_GW * Math.exp(-ARB_SHELF_SHARPNESS * Math.max(0, excess));
}

// Labs buy freely well below their willingness-to-pay and stop at it.
function priceDamp(price, wtp) {
  if (!(wtp > 0)) return 0;
  if (price >= wtp) return 0;
  const headroom = 1 - price / wtp;
  return Math.pow(headroom, PRICE_DAMP_EXPONENT);
}

function computeDemand(state, inputs, year) {
  const labWtp = state.labRevPerMw * state.wtpFraction;
  const labDemand = state.labGw * (inputs.labGrowthRate - 1) * priceDamp(state.computePrice, labWtp);
  const hyperscaler = inputs.hyperscalerDemandGw;
  const hoarder = inputs.hoarderBuildGw;
  const arbitrage = arbitrageShelf(state.computePrice, inputs.floorCost);
  return {
    labDemand, hyperscaler, hoarder, arbitrage, labWtp,
    total: labDemand + hyperscaler + hoarder + arbitrage,
  };
}

function clearPrice(state, inputs, demandGw, supplyGw) {
  const labWtp = state.labRevPerMw * state.wtpFraction;
  const ceiling = Math.max(labWtp, inputs.floorCost);
  const gap = supplyGw > 0 ? demandGw / supplyGw : 3;
  const raw = state.computePrice * Math.pow(gap, inputs.priceElasticity);
  const target = clamp(raw, inputs.floorCost, ceiling);
  return state.computePrice + inputs.damping * (target - state.computePrice);
}

const HOARDER_INTERNAL_VALUE = 20;   // $M/MW Meta/SpaceX get from using it themselves
const HOARDER_RELEASE_MAX = 0.6;     // fraction of stock releasable in one year

// Labs outbid everyone when their willingness-to-pay clears the market price.
function labShare(labWtp, price) {
  if (!(price > 0)) return 1;
  const ratio = labWtp / price;
  return clamp((ratio - 1) / 3, 0, 1);
}

// Hoarders sell when renting out beats using it internally. Self-limiting:
// hoarding only pays while the spread is wide, so it damps the scarcity it
// profits from.
function hoarderRelease(state, price) {
  const spread = (price - HOARDER_INTERNAL_VALUE) / HOARDER_INTERNAL_VALUE;
  const fraction = clamp(spread, 0, 1) * HOARDER_RELEASE_MAX;
  return Math.min(state.hoardedStock, state.hoardedStock * fraction);
}

// Hoarded GW consumed physical rails in the year they were BUILT. Releasing
// them later is inventory changing hands, never new supply -- otherwise the
// model manufactures capacity from nothing.
function allocate(state, inputs, demand, supplyGw) {
  const newGw = Math.min(demand.total, supplyGw);
  const released = hoarderRelease(state, state.computePrice);
  // The hoarder's own build goes to ITS inventory, not to market. Under supply
  // constraint newGw < demand.total, so ration proportionally rather than
  // subtracting hoarderBuildGw outright (which could exceed newGw).
  const hoarderShare = demand.total > 0 ? inputs.hoarderBuildGw / demand.total : 0;
  const hoarderGot = newGw * hoarderShare;
  const forSale = (newGw - hoarderGot) + released;
  const labGain = forSale * labShare(demand.labWtp, state.computePrice);
  const hoardedStockAfter = state.hoardedStock - released + hoarderGot;
  return { newGw, forSale, released, hoarderGot, labGain, hoardedStockAfter };
}

return {
  START_YEAR, END_YEAR, POWER_MODES, PIPELINE_BASE, PIPELINE_GROWTH,
  initialState, seedPipelines, computeCeilings, bindingConstraint, pipelineCapacity,
  arbitrageShelf, priceDamp, computeDemand, clearPrice,
  labShare, hoarderRelease, allocate,
};
});
