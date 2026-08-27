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
const { clamp, repriceContinuous, repriceStep, MEMORY_RESET_INTERVAL } = rails;
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
//
// Task 9 calibration (engine-acceptance.test.js): power.base/growth and
// memory.growth were retuned from their Task 4 seed values (33/0.34 and 0.42)
// after wiring stepRails to default an unceilinged rail's tightness to
// supplyGw instead of demandGw (see stepRails). That fix makes power the
// binding constraint through 2027 and lets memory's HBM step-reset take over
// as the binding constraint from 2028 -- its own ceiling comfortably clears
// the (off-limits) EUV ceiling (~94.3 GW in 2029) while still tracking the
// 30/50/70/95 transcript path within tolerance.
const PIPELINE_BASE = { memory: 34, package: 38, power: 30 };
const PIPELINE_GROWTH = { memory: 0.395, package: 0.40, power: 0.60 };

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
  // A non-positive floor has no denominator to measure excess against --
  // treat the shelf as fully engaged rather than let (price - 0) / 0 poison
  // Math.max/Math.exp with NaN.
  if (!(floorCost > 0)) return ARB_SHELF_MAX_GW;
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

// Ratio range over which lab share ramps from 0 to 1: labShare saturates at
// labWtp = (1 + RANGE)x price (ratio - 1 spans this many units before hitting
// the 1.0 clamp). This is a calibration lever -- Task 9 shrank it from 3 to
// 1.5, the tightest constraint on hitting the 60-90% 2028 lab-share
// acceptance target, since labs' WTP/price ratio at defaults (~2.4-3x by
// 2028) never reached the wider range's saturation floor.
const LAB_SHARE_SATURATION_RANGE = 1.5;

// Labs outbid everyone when their willingness-to-pay clears the market price.
function labShare(labWtp, price) {
  if (!(price > 0)) return 1;
  const ratio = labWtp / price;
  return clamp((ratio - 1) / LAB_SHARE_SATURATION_RANGE, 0, 1);
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
  const hoarderShare = demand.total > 0 ? demand.hoarder / demand.total : 0;
  const hoarderGot = newGw * hoarderShare;
  const forSale = (newGw - hoarderGot) + released;
  const labGain = forSale * labShare(demand.labWtp, state.computePrice);
  const hoardedStockAfter = state.hoardedStock - released + hoarderGot;
  return { newGw, forSale, released, hoarderGot, labGain, hoardedStockAfter };
}

const TERM_PREMIUM_SLOPE = 0.02;   // calibrated so ~$5T cumulative credit lifts Meta 5.5% -> ~8%
const RATE_MAX = 0.25;
const CREDIT_RATION_SLOPE = 8;

function termPremium(creditRatio) {
  return TERM_PREMIUM_SLOPE * Math.max(0, creditRatio);
}

// Bounded by market depth and rationed BY price, not expanded by it.
// "Meta would happily pay 8%; the market won't want them to."
function creditCapacity(rate, inputs) {
  const excess = Math.max(0, rate - inputs.baseRate);
  return inputs.creditMarketDepth * Math.exp(-CREDIT_RATION_SLOPE * excess);
}

function stepCapital(state, inputs, capexThisYear) {
  const cashAvailable = inputs.ecosystemCashFlow * inputs.reinvestRate;
  const credit = Math.max(0, capexThisYear - cashAvailable);
  const cumulativeCredit = state.cumulativeCredit + credit;
  const cumulativeCapex = state.cumulativeCapex + capexThisYear;
  const rate = Math.min(RATE_MAX, inputs.baseRate + termPremium(cumulativeCredit / inputs.creditMarketDepth));
  const availableCapital = inputs.ecosystemCashFlow + creditCapacity(rate, inputs);
  return { credit, rate, availableCapital, cumulativeCredit, cumulativeCapex };
}

// Labs' willingness-to-pay for compute as a fraction of revenue. Dylan's source
// figure is 0.5 (labs paying ~$50M/MW while generating ~$100M). The ceiling sits
// above it deliberately — that snapshot is not a hard bound. Beyond roughly 0.6,
// a lab would hand over almost all gross revenue for compute, which no operator would do.
const WTP_FRACTION_MAX = 0.6;

// Annual capability growth driven by research-compute scaling. Compounds with lab GW
// and inverts when inference dominates (inferenceShare rising suppresses research
// opportunity). Calibrated to produce observed capability gains over a 5-year horizon.
const CAPABILITY_GAIN = 0.015;

// Regulatory jurisdiction-level stops (e.g., NY EO 62, Texas ERCOT audit) fire as a
// discrete Bernoulli draw. When a stop occurs, suppress revenue by this fraction (~25%).
// This is a step-function mechanism, separate from regDragSmooth's smooth channel.
const REG_STOP_SEVERITY = 0.25;

// Deterministic RNG (mulberry32) so runs are reproducible and testable.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Revenue cannot exceed what the economy can actually absorb. Without this the
// model prints $7T of 2028 lab revenue -- 6% of world GDP to two firms.
function diffusionCeiling(state, inputs) {
  const maxLabRevenueB = inputs.addressableValueB * state.captureRate;
  const monetizedMw = state.labGw * 1000 * state.inferenceShare;
  if (!(monetizedMw > 0)) return Infinity;
  return (maxLabRevenueB * 1000) / monetizedMw;
}

// Discrete, correlated jurisdiction-level stops. NY EO 62 and the Texas ERCOT
// audit took two major markets to zero approvals three weeks apart, so the
// observed shape is step-function and contagious, not a smooth multiplier.
function regStopFactor(rng, inputs) {
  return rng() < inputs.regStopProbability ? (1 - REG_STOP_SEVERITY) : 1;
}

function stepMonetization(state, inputs, rng) {
  const capability = state.capability + CAPABILITY_GAIN * (1 - state.inferenceShare) * state.labGw;
  const stop = regStopFactor(rng, inputs);
  const grown = state.labRevPerMw * (capability / state.capability) * (1 - inputs.regDragSmooth) * stop;

  const inferenceShare = Math.max(0.05, state.inferenceShare - inputs.inferenceShareDecay);
  const captureRate = state.captureRate * (1 + inputs.captureRateGrowth);
  const wtpFraction = Math.min(WTP_FRACTION_MAX, state.wtpFraction * (1 + inputs.wtpFractionGrowth));

  const next = { ...state, inferenceShare, captureRate };
  const cap = diffusionCeiling(next, inputs);
  const diffusionBound = grown > cap;
  const labRevPerMw = diffusionBound ? cap : grown;

  return { labRevPerMw, capability, inferenceShare, captureRate, wtpFraction, diffusionBound };
}

// Repriced per year against DEMAND vs a per-rail CEILING. Only memory, package
// and power have component-specific ceilings (see computeCeilings); every
// other rail defaults to the system-wide supplyGw so it still reprices on
// overall market tightness, scaled by its own elasticity, rather than sitting
// inert at a demandGw/demandGw === 1 ceiling that can never bind.
function stepRails(state, inputs, demandGw, ceilings, supplyGw) {
  const railPrice = { ...state.railPrice };
  const tightness = {};
  for (const r of RAILS) {
    const ceiling = ceilings[r.id] !== undefined ? ceilings[r.id] : supplyGw;
    const t = railTightness(demandGw, ceiling);
    tightness[r.id] = t;
    if (r.elasticity === 'step') {
      railPrice[r.id] = repriceStep(railPrice[r.id], t, state.stepStates[r.id], MEMORY_RESET_INTERVAL);
    } else {
      railPrice[r.id] = repriceContinuous(railPrice[r.id], r.elasticity, t);
    }
  }
  // Children must always reconcile to their parent.
  const kids = RAILS.filter(r => r.parent === 'servers');
  railPrice.servers = kids.reduce((a, r) => a + railPrice[r.id], 0);
  return { railPrice, capexPerGw: sumPerGw(railPrice), tightness };
}

function simulate(inputs, seed) {
  const rng = makeRng(seed === undefined ? 1 : seed);
  const state = initialState(inputs);
  const out = [];

  for (let year = START_YEAR; year <= END_YEAR; year++) {
    const ceilings = computeCeilings(state, inputs, year);
    const supplyGw = Math.min(...Object.values(ceilings));
    const binding = bindingConstraint(ceilings);

    const demand = computeDemand(state, inputs, year);
    const nextPrice = clearPrice(state, inputs, demand.total, supplyGw);
    const alloc = allocate(state, inputs, demand, supplyGw);

    const railStep = stepRails(state, inputs, demand.total, ceilings, supplyGw);
    const capex = alloc.newGw * railStep.capexPerGw;
    const cap = stepCapital(state, inputs, capex);
    const mon = stepMonetization(state, inputs, rng);

    const clamped = supplyGw <= 0 || nextPrice <= inputs.floorCost;

    state.computePrice = nextPrice;
    state.installedGw += alloc.newGw;
    state.effectiveGw += alloc.newGw * (1 + 0.35 * (year - START_YEAR));
    state.labGw += alloc.labGain;
    state.hoardedStock = alloc.hoardedStockAfter;
    state.railPrice = railStep.railPrice;
    state.capexPerGw = railStep.capexPerGw;
    state.cumulativeCredit = cap.cumulativeCredit;
    state.cumulativeCapex = cap.cumulativeCapex;
    state.rate = cap.rate;
    state.availableCapital = cap.availableCapital;
    state.labRevPerMw = mon.labRevPerMw;
    state.capability = mon.capability;
    state.inferenceShare = mon.inferenceShare;
    state.captureRate = mon.captureRate;
    state.wtpFraction = mon.wtpFraction;

    out.push({
      year, binding, supplyGw, clamped,
      demand: demand.total,
      demandBreakdown: { ...demand },
      ceilings: { ...ceilings },
      newGw: alloc.newGw,
      hoarderGot: alloc.hoarderGot,
      cumulativeGw: state.installedGw,
      // Labs' share of capacity AVAILABLE FOR SALE (new build net of the
      // hoarder's own take, plus released hoarded inventory) -- NOT of
      // newly-built capacity. The model pools new build and released
      // inventory into one market, so `forSale` is the only denominator that
      // stays in [0,1] by construction; dividing by newGw alone lets the
      // ratio exceed 1.0 whenever the hoard releases materially.
      labShareOfNew: alloc.forSale > 0 ? alloc.labGain / alloc.forSale : 0,
      computePrice: state.computePrice,
      capexPerGw: state.capexPerGw,
      capex,
      credit: cap.credit,
      cumulativeCapex: state.cumulativeCapex,
      cumulativeCredit: state.cumulativeCredit,
      rate: state.rate,
      labGw: state.labGw,
      labRevPerMw: state.labRevPerMw,
      effectiveGw: state.effectiveGw,
      hoardedStock: state.hoardedStock,
      diffusionBound: mon.diffusionBound,
      railPrice: { ...railStep.railPrice },
      railTightness: { ...railStep.tightness },
    });
  }
  return out;
}

return {
  START_YEAR, END_YEAR, POWER_MODES, PIPELINE_BASE, PIPELINE_GROWTH,
  initialState, seedPipelines, computeCeilings, bindingConstraint, pipelineCapacity,
  arbitrageShelf, priceDamp, computeDemand, clearPrice,
  labShare, hoarderRelease, allocate, LAB_SHARE_SATURATION_RANGE,
  termPremium, creditCapacity, stepCapital,
  makeRng, diffusionCeiling, regStopFactor, stepMonetization,
  stepRails, simulate,
};
});
