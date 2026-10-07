// Year-by-year market simulation. Pure: takes inputs, returns an array of
// year states. No DOM, no Date.now(), no ambient randomness.

(function (root, factory) {
  const rails = (typeof require !== 'undefined') ? require('./rails.js') : root;
  const presets = (typeof require !== 'undefined') ? require('./presets.js') : root;
  const demandModel = (typeof require !== 'undefined') ? require('./demand.js') : root;
  const api = factory(rails, presets, demandModel);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function (rails, presets, demandModel) {

const { RAILS, railById, initialRailPrice, sumPerGw, newStepState, railTightness } = rails;
const { clamp, repriceContinuous, repriceStep, MEMORY_RESET_INTERVAL, TIGHTNESS_MAX } = rails;
const { euvCeilingGw, euvToolsPerGwFromWafers } = presets;

const { allocateSegments, segmentEconomics, validateSegments, deploymentProfile } = demandModel;

const START_YEAR = 2026;
const END_YEAR = 2030;

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
// as the binding constraint from 2028.
//
// Fix round 1 (Task 9): power.growth 0.60 -> 0.55 and memory.growth 0.395 ->
// 0.34, retuned again once stepBullwhip (below) started expanding memory's
// and power's pipelines on top of this base growth. At the Task 9 values,
// the bullwhip's added expansion pushed memory's ceiling past the
// (off-limits, fixed) EUV ceiling by 2029, flipping the binding constraint
// to EUV. Lower base growth leaves headroom for the bullwhip's contribution
// so memory still clears 2028/2029 without ever crossing EUV.
const PIPELINE_BASE = { memory: 34, package: 38, power: 30 };
const PIPELINE_GROWTH = { memory: 0.34, package: 0.40, power: 0.55 };

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
  validateSegments(inputs.demandSegments);
  const initialAllocation = allocateSegments(inputs.demandSegments.map(s => ({
    ...s, routes: s.apiShare !== undefined ? deploymentProfile(s, 0).routes : s.routes, requestedGw: s.initialGw,
  })), inputs.demandSegments.reduce((sum, s) => sum + s.initialGw, 0));
  const installedGw = initialAllocation.totalGw;
  const railPrice = initialRailPrice();
  railPrice.power = POWER_MODES[inputs.powerMode].pricePerGw;
  const stepStates = {};
  for (const r of RAILS) if (r.elasticity === 'step') stepStates[r.id] = newStepState();

  const capexPerGw = sumPerGw(railPrice);
  const state = {
    installedGw,
    labGw: initialAllocation.byOwner.frontierLab || 0,
    segmentCapacityGw: { ...initialAllocation.bySegment },
    computePrice: 13,
    providerRevenuePerCommercialMw: 0,
    providerRevenueFactor: 1,
    capexPerGw,
    rate: inputs.baseRate,
    railPrice,
    stepStates,
    pipeline: {},
    hoardedStock: 0,
    cumulativeCredit: 0,
    cumulativeCapex: 0,
    availableCapital: inputs.ecosystemCashFlow + inputs.creditMarketDepth,
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

// Argmin over the supply ceilings. Answers "which ceiling is lowest", which is
// NOT the same question as "what actually limited this year" -- see
// limitingFactor below.
function bindingConstraint(ceilings) {
  let best = null, bestVal = Infinity;
  for (const [k, v] of Object.entries(ceilings)) {
    if (v < bestVal) { bestVal = v; best = k; }
  }
  return best;
}

// New construction is the minimum of net construction demand and the supply
// ceilings. Released inventory does not consume new physical rails.
function limitingFactor(demandGw, ceilings) {
  const values = Object.values(ceilings);
  const minCeiling = values.length > 0 ? Math.min(...values) : Infinity;
  if (demandGw <= minCeiling) return 'demand';
  return bindingConstraint(ceilings);
}

// PHYSICAL scarcity (fabs, tools, power plants) is a different phenomenon
// from FINANCIAL scarcity (capital) and must not be treated identically.
// If money is tight, hyperscalers build less -- memory/package/power
// suppliers see LESS demand and should soften, not spike. `capital` is
// deliberately excluded here: it constrains how much gets built (supplyGw,
// used for allocation below), but it must never feed the rail-repricing
// tightness signal, or a credit crunch reprices HBM as if it were a fab
// shortage. Fix round 2 (Task 9): this was the bug behind fix round 1's
// runaway-via-capital and the resulting pressure to inflate capital
// parameters past plausibility.
function physicalCeiling(ceilings) {
  return Math.min(ceilings.euv, ceilings.memory, ceilings.package, ceilings.power);
}

// A distribution of use-case values creates a smooth response around the
// segment's mean bid. The inherited 8% tail is illustrative. A separate budget
// constraint below prevents it from creating unfunded expansion.
const PRICE_DAMP_EXPONENT = 0.4;
const LAB_TAIL_SHARE = 0.08;
const LAB_TAIL_DECAY = 3.0;

// Demand tapers with price; the same response shape is used for each segment.
function priceDamp(price, wtp) {
  if (!(wtp > 0)) return 0;
  const ratio = price / wtp;
  const core = (1 - LAB_TAIL_SHARE) * Math.pow(Math.max(0, 1 - ratio), PRICE_DAMP_EXPONENT);
  const tail = LAB_TAIL_SHARE * Math.exp(-LAB_TAIL_DECAY * Math.max(0, ratio - 1));
  return core + tail;
}

function computeDemand(state, inputs, year, price = state.computePrice) {
  const elapsed = year - START_YEAR;
  const segments = inputs.demandSegments.map(config => {
    const economics = segmentEconomics(config, inputs.addressableValueB, elapsed, state.providerRevenueFactor);
    economics.providerRevenuePoolB = segmentEconomics(config, inputs.addressableValueB, elapsed).providerRevenueB;
    const capacityGw = state.segmentCapacityGw[config.id];
    const deployment = economics.deployment;
    const targetGw = deployment ? deployment.requiredGw
      : capacityGw + config.annualDemandGw * Math.pow(1 + config.demandGrowth, elapsed);
    const desiredGw = Math.max(0, targetGw - capacityGw);
    // Existing idle capacity need not be rented again. Owned stranded assets
    // remain installed; retirement and vintage-specific costs are separate work.
    const operatingGw = Math.min(capacityGw, targetGw);
    const willingnessToPay = targetGw > 0 ? economics.computeBudgetB / targetGw : 0;
    const affordableGw = price > 0 ? Math.max(0, economics.computeBudgetB / price - operatingGw) : desiredGw;
    return { id: config.id, label: config.label, routes: deployment ? deployment.routes : config.routes,
      capacityGw, desiredGw, willingnessToPay, ...economics,
      requestedGw: Math.min(affordableGw, desiredGw * priceDamp(price, willingnessToPay)) };
  });
  const finalUseGw = segments.reduce((sum, s) => sum + s.requestedGw, 0);
  const inventoryGw = inputs.hoarderBuildGw * priceDamp(price, HOARDER_INTERNAL_VALUE);
  return { segments, finalUseGw, inventoryGw, total: finalUseGw + inventoryGw };
}

// Find the price at which aggregate final-use and inventory demand fit new
// supply plus usable released inventory. The floor can leave supply unused.
function clearPrice(state, inputs, year, supplyGw) {
  const excess = price => {
    const d = computeDemand(state, inputs, year, price);
    const released = Math.min(d.finalUseGw, hoarderRelease(state, price));
    return d.total - released - supplyGw;
  };
  if (excess(inputs.floorCost) <= 0) return inputs.floorCost;
  let lo = inputs.floorCost;
  let hi = Math.max(lo * 2, 1);
  while (excess(hi) > 0 && hi < 1e6) hi *= 2;
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    if (excess(mid) > 0) lo = mid;
    else hi = mid;
  }
  return hi;
}

const HOARDER_INTERNAL_VALUE = 20; // illustrative internal-use value, $M/MW/year
function hoarderRelease(state, price) {
  const premium = Math.max(0, price / HOARDER_INTERNAL_VALUE - 1);
  return state.hoardedStock * Math.min(1, premium) * 0.6;
}

function allocate(state, inputs, demand, supplyGw) {
  const released = Math.min(demand.finalUseGw, hoarderRelease(state, state.computePrice));
  const unmetFinal = Math.max(0, demand.finalUseGw - released);
  const constructionDemand = unmetFinal + demand.inventoryGw;
  const newGw = Math.min(constructionDemand, Math.max(0, supplyGw));
  const hoarderGot = constructionDemand > 0 ? newGw * demand.inventoryGw / constructionDemand : 0;
  const forSale = newGw - hoarderGot + released;
  const allocation = allocateSegments(demand.segments, forSale);
  return { newGw, forSale, released, hoarderGot, allocation,
    labGain: allocation.byOwner.frontierLab || 0,
    hoardedStockAfter: state.hoardedStock - released + hoarderGot };
}

// I6 (final review) -- RESOLVED as a naming defect, not a units bug. This was
// first raised as "dividing a STOCK (cumulativeCredit, $B borrowed to date) by
// a FLOW (creditMarketDepth, $B/yr of absorbable issuance)" -- the bug class
// the units guard catches on the perGw/annuity side. On investigation that is
// wrong: stock/flow yields TIME, and years is exactly the right dimension for
// a leverage measure. `cumulativeCredit / creditMarketDepth` = years-of-market-
// depth consumed, the same shape as debt/EBITDA or reserve-to-production.
// TERM_PREMIUM_SLOPE then reads "+2pp of spread per year of depth consumed."
// The argument is passed as `creditRatio` below, which is the misleading part
// and the actual defect: it should be named for the duration it is.
//
// Both "corrected" forms were tried and neither is a fix. Scaling depth by a
// fixed 5-year horizon is algebraically identical to TERM_PREMIUM_SLOPE x 1/5
// (verified bit-identical to changing 0.02 -> 0.004 on every field, every
// year) -- a 5x parameter cut wearing a units-fix costume. Scaling by
// years-elapsed makes the premium FALL as leverage rises (2028->2029:
// cumulativeCredit +$22B, rate -0.233pp), which is a genuine economic error;
// the current form is monotone. Neither moves 2026-2029 newGw at all.
const TERM_PREMIUM_SLOPE = 0.02;
// Calibration anchor, corrected: the original comment claimed "~$5T cumulative
// credit lifts Meta 5.5% -> ~8%". That is arithmetically wrong -- $5T against a
// $2.5T/yr depth is 2.0 years consumed, so +4pp, landing at 9.50%. Reaching 8%
// takes ~$3.13T. The slope is a fitted choice, not a sourced one.
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

// The legacy regulatory reductions persist in provider revenue and its compute budget.
// Splitting permitting and model-release restrictions is a separate improvement.
function regStopFactor(rng, inputs) {
  return rng() < inputs.regStopProbability ? (1 - REG_STOP_SEVERITY) : 1;
}

function stepMonetization(state, inputs, year) {
  const config = inputs.demandSegments.find(s => s.id === 'commercial');
  const capacity = state.segmentCapacityGw.commercial || 0;
  const pool = config ? segmentEconomics(config, inputs.addressableValueB, year - START_YEAR).providerRevenueB : 0;
  const ceiling = capacity > 0 ? pool / capacity : 0;
  const revenueFactor = state.providerRevenueFactor;
  const research = state.segmentCapacityGw.research || 0;
  return { providerRevenuePerCommercialMw: ceiling * revenueFactor, providerRevenuePoolPerMw: ceiling,
    commercialProviderRevenueB: pool * revenueFactor,
    commercialProviderRevenuePoolB: pool, commercialCapacityShare: capacity + research > 0 ? capacity / (capacity + research) : 0 };
}

// Repriced per year against DEMAND vs a per-rail CEILING. Only memory, package
// and power have component-specific ceilings (see computeCeilings); every
// other rail defaults to `physicalCeilingGw` so it still reprices on overall
// PHYSICAL market tightness, scaled by its own elasticity, rather than
// sitting inert at a demandGw/demandGw === 1 ceiling that can never bind.
//
// `physicalCeilingGw` -- not `supplyGw` -- deliberately excludes `capital`.
// Fix round 2 (Task 9): the previous version defaulted to `supplyGw` (which
// is min(ALL ceilings), including capital), so a capital crunch repriced
// HBM/CoWoS/power upward exactly as if a fab had gone offline. Financial
// scarcity reduces the VOLUME the model allocates (see `supplyGw` at the
// simulate() call site, used for allocation) but must never masquerade as a
// physical shortage in the repricing signal.
function stepRails(state, inputs, demandGw, ceilings, physicalCeilingGw) {
  const railPrice = { ...state.railPrice };
  const tightness = {};
  for (const r of RAILS) {
    const ceiling = ceilings[r.id] !== undefined ? ceilings[r.id] : physicalCeilingGw;
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

// Bullwhip, stabilizing half. A rail priced above its 2026 baseline signals
// profit, which induces capacity expansion landing r.lag years later. Without
// this, tightness never resolves and prices compound without bound -- only
// the amplifying half of the bullwhip (repriceContinuous/repriceStep) existed
// before this fix. BULLWHIP_GAIN is fitted, not sourced: no public figure
// exists for how strongly capacity responds to price in these supply chains.
// Fix-round calibration (Task 9): 0.5 was tried first and left tightness
// still climbing through 2029; 0.9 is strong enough to turn tightness over
// by 2029-2030 while leaving the 2026-2028 GW path within tolerance.
const BULLWHIP_GAIN = 0.9;

function stepBullwhip(state, year) {
  for (const railId of Object.keys(PIPELINE_BASE)) {
    const rail = railById(railId);
    const priceRatio = state.railPrice[railId] / rail.price2026;
    if (priceRatio <= 1) continue;
    const landing = Math.round(year + rail.lag);
    if (state.pipeline[railId][landing] === undefined) continue;
    state.pipeline[railId][landing] *= 1 + BULLWHIP_GAIN * (priceRatio - 1);
  }
}

function simulate(inputs, seed) {
  const rng = makeRng(seed === undefined ? 1 : seed);
  const state = initialState(inputs);
  const out = [];

  for (let year = START_YEAR; year <= END_YEAR; year++) {
    state.providerRevenueFactor *= (1 - inputs.regDragSmooth) * regStopFactor(rng, inputs);
    const ceilings = computeCeilings(state, inputs, year);
    // supplyGw (ALL ceilings, including capital) bounds how much can actually
    // be BUILT and ALLOCATED this year -- a capital crunch genuinely limits
    // volume. physicalCeilingGw (excluding capital) is the separate, correct
    // basis for rail REPRICING -- see physicalCeiling()/stepRails().
    const supplyGw = Math.min(...Object.values(ceilings));
    const physCeilGw = physicalCeiling(ceilings);

    const demand = computeDemand(state, inputs, year);
    const constructionDemand = demand.total - Math.min(demand.finalUseGw, hoarderRelease(state, state.computePrice));
    const limiter = limitingFactor(constructionDemand, ceilings);
    const nextPrice = clearPrice(state, inputs, year, supplyGw);
    // Retain the annual price lag: allocation uses the opening price, while
    // the aggregate clearing result becomes next year's opening price.
    const clearingPrice = state.computePrice;
    const alloc = allocate(state, inputs, demand, supplyGw);

    const railStep = stepRails(state, inputs, constructionDemand, ceilings, physCeilGw);
    const capex = alloc.newGw * railStep.capexPerGw;
    const cap = stepCapital(state, inputs, capex);
    for (const [id, gw] of Object.entries(alloc.allocation.bySegment)) state.segmentCapacityGw[id] += gw;
    for (const segment of demand.segments) {
      if (!segment.deployment) continue;
      const required = segment.deployment.requiredGw;
      const budgetCapacity = clearingPrice > 0 ? segment.computeBudgetB / clearingPrice : Infinity;
      const servedGw = Math.min(required, state.segmentCapacityGw[segment.id], budgetCapacity);
      segment.servedTaskIndex = required > 0 ? segment.deployment.taskIndex * servedGw / required : segment.deployment.taskIndex;
      segment.unmetTaskIndex = segment.deployment.taskIndex - segment.servedTaskIndex;
      segment.idleGw = Math.max(0, state.segmentCapacityGw[segment.id] - servedGw);
    }
    const mon = stepMonetization(state, inputs, year);

    const clamped = supplyGw <= 0 || nextPrice <= inputs.floorCost;

    state.computePrice = nextPrice;
    state.installedGw += alloc.newGw;
    state.labGw += alloc.labGain;
    state.hoardedStock = alloc.hoardedStockAfter;
    state.railPrice = railStep.railPrice;
    state.capexPerGw = railStep.capexPerGw;
    stepBullwhip(state, year);
    state.cumulativeCredit = cap.cumulativeCredit;
    state.cumulativeCapex = cap.cumulativeCapex;
    state.rate = cap.rate;
    state.availableCapital = cap.availableCapital;
    state.providerRevenuePerCommercialMw = mon.providerRevenuePerCommercialMw;
    state.commercialCapacityShare = mon.commercialCapacityShare;

    out.push({
      // `limiter` (not the old `binding`) is what actually held newGw down:
      // 'demand' when buyers wanted less than every ceiling allowed,
      // otherwise the lowest ceiling. See limitingFactor().
      year, limiter, supplyGw, clamped,
      demand: constructionDemand,
      demandBreakdown: demand,
      segmentCapacityGw: { ...state.segmentCapacityGw },
      allocation: alloc.allocation,
      releasedGw: alloc.released,
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
      // The price this year's allocation (and labShareOfNew) actually used --
      // see the comment above clearingPrice's assignment. Distinct from
      // computePrice below, which is the NEW price cleared this year.
      clearingPrice,
      computePrice: state.computePrice,
      capexPerGw: state.capexPerGw,
      capex,
      credit: cap.credit,
      cumulativeCapex: state.cumulativeCapex,
      cumulativeCredit: state.cumulativeCredit,
      rate: state.rate,
      labGw: state.labGw,
      providerRevenuePerCommercialMw: state.providerRevenuePerCommercialMw,
      hoardedStock: state.hoardedStock,
      commercialCapacityShare: state.commercialCapacityShare,
      commercialProviderRevenueB: mon.commercialProviderRevenueB,
      commercialProviderRevenuePoolB: mon.commercialProviderRevenuePoolB,
      providerRevenuePoolPerMw: mon.providerRevenuePoolPerMw,
      railPrice: { ...railStep.railPrice },
      railTightness: { ...railStep.tightness },
    });
  }
  return out;
}

// Solves for the creditMarketDepth ($B/yr) that would make `year`'s newGw
// reach `targetGw`, holding every other input fixed. This is the headline
// calibration-panel output for Task 9's fix round 3: "target N GW in year Y
// is unreachable / needs $D/yr of credit depth."
//
// Raising creditMarketDepth only ever relaxes the capital ceiling, so
// realized newGw is monotonic non-decreasing in it -- UNTIL something else
// becomes the limiter instead, past which more credit does nothing. That
// something is either a PHYSICAL rail (euv, memory, package, power; see
// physicalCeiling()) or DEMAND itself: if buyers want less than the target at
// the clearing price, no amount of credit conjures the build. Both cases are
// reported through `limitingRail`, which is the year's `limiter` and can be
// 'demand' (C1 fix: it previously could only ever name a supply rail, so a
// demand-limited miss was attributed to whichever ceiling happened to be the
// numeric argmin).
//
// When the reachable ceiling sits below targetGw, NO credit depth reaches the
// target. That case is the interesting one and must be representable directly,
// rather than as Infinity or a crash: this returns
// `{ reachable: false, limitingRail, maxGw }` instead.
function impliedCreditDepthFor(targetGw, year, inputs, seed) {
  // Large enough that `capital` cannot possibly bind (creditCapacity grows
  // with creditMarketDepth), so this pins down the ceiling the PHYSICAL
  // rails alone allow in `year`.
  const PRACTICALLY_UNLIMITED_CREDIT = 1e7;

  function yearStateAt(creditMarketDepth) {
    const run = simulate({ ...inputs, creditMarketDepth }, seed);
    const y = run.find(r => r.year === year);
    if (!y) throw new Error(`impliedCreditDepthFor: no year state for ${year}`);
    return y;
  }

  const atUnlimitedCredit = yearStateAt(PRACTICALLY_UNLIMITED_CREDIT);
  if (atUnlimitedCredit.newGw < targetGw) {
    return { reachable: false, limitingRail: atUnlimitedCredit.limiter, maxGw: atUnlimitedCredit.newGw };
  }

  // Bisect for the minimal creditMarketDepth that clears targetGw. 60
  // iterations over [0, 1e7] resolves creditMarketDepth to well under a
  // cent -- far finer than this estimate needs, but bisection is cheap.
  let lo = 0, hi = PRACTICALLY_UNLIMITED_CREDIT;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (yearStateAt(mid).newGw >= targetGw) hi = mid; else lo = mid;
  }
  return { reachable: true, creditMarketDepth: hi, limitingRail: yearStateAt(hi).limiter };
}

// ---------------------------------------------------------------------------
// SpaceX-class hoarder book. Diagnostic on top of a run, same shape as
// impliedCreditDepthFor -- it does not feed the simulation.
//
// This is a hypothetical rental book, not a disclosed SpaceX contract portfolio.
// Revenue payback compares annual rent with construction cost; it excludes
// operating expenses and collection. Revenue coverage compares modeled customer
// AI revenue with rent. A shortfall can be funded by cash, other businesses or
// financing. Neither measure establishes profitability, liquidity, insolvency,
// probability of default, or expected credit loss.
// The internal-use value is an illustrative alternative use, not a cash guarantee.
//
// UNITS -- read before editing (see rails.js for the guard this respects):
//   contractPriceMw is $M/MW/YEAR, a REVENUE RATE. That is the spec's third
//   basis, distinct from perGw (one-time) and annuity (per GW/yr of capacity).
//   1 $M/MW == 1 $B/GW, since 1 GW = 1000 MW. So $50M/MW/yr == $50B/GW/yr and
//   is directly comparable to capexPerGw in $B/GW.
//   capexPerGw / contractPriceMw therefore yields YEARS. That is a ratio
//   between two different bases, which is legitimate and is never a sum --
//   the same shape as the ~1.57% amortization result and the term-premium
//   duration. Do not add these two quantities.
const SPACEX_DEFAULTS = {
  contractPriceMw: 50,          // $M/MW/yr -- the reported SpaceX rate
  termYears: 5,                 // illustrative contract duration
  gwPerYear: 4,                 // illustrative GW newly contracted each year
  startYear: START_YEAR,
};

// Revenue-basis payback in years. Deliberately NOT gross-profit payback: it
// ignores power, opex and collection, so it flatters the deal exactly the way
// the public bull case does. Reported alongside coverage so the two can be
// read together rather than one standing in for the other.
function spacexPayback(capexPerGw, contractPriceMw) {
  if (!(contractPriceMw > 0)) return Infinity;
  return capexPerGw / contractPriceMw;
}

// The highest contract price the customer can cover in EVERY year of the run.
// This is a revenue-only threshold, before any other customer expenses; it
// does not predict default or imply that cash reserves cannot bridge a gap.
function coverableContractPrice(run) {
  if (!run || run.length === 0) return 0;
  return Math.min(...run.map(y => y.providerRevenuePerCommercialMw));
}

// Per-year book: GW under contract by vintage, revenue, and whether the
// counterparty generates enough per MW to service what it signed.
function spacexBook(run, opts) {
  const o = { ...SPACEX_DEFAULTS, ...(opts || {}) };
  const price = o.contractPriceMw;
  let vintages = [];
  const rows = [];

  for (const y of run) {
    if (y.year >= o.startYear) vintages.push({ year: y.year, gw: o.gwPerYear });
    // A vintage is live while it is inside its term. Prune rather than filter
    // in place so the list cannot grow without bound on a long horizon.
    vintages = vintages.filter(v => y.year - v.year < o.termYears);
    const bookGw = vintages.reduce((a, v) => a + v.gw, 0);

    // $M/MW/yr x GW == $B/yr (1 $M/MW == 1 $B/GW).
    const revenueB = bookGw * Math.max(0, price);
    // Coverage > 1 means the customer earns more per MW than it owes.
    const coverage = price > 0 ? y.providerRevenuePerCommercialMw / price : Infinity;
    const covered = coverage >= 1;
    const operatingShortfallB = covered ? 0 : revenueB * (1 - coverage);

    rows.push({
      year: y.year,
      bookGw,
      revenueB,
      customerRevPerMw: y.providerRevenuePerCommercialMw,
      coverage,
      covered,
      operatingShortfallB,
      // If renting out stops clearing, the hoarder falls back to internal use
      // (xAI/Grok for SpaceX, ads/ranking for Meta). An assumption, not a guarantee.
      internalFallbackB: bookGw * HOARDER_INTERNAL_VALUE,
    });
  }
  return rows;
}

function spacexSummary(run, opts) {
  const o = { ...SPACEX_DEFAULTS, ...(opts || {}) };
  const rows = spacexBook(run, o);
  const covered = rows.filter(r => r.covered);
  return {
    contractPriceMw: o.contractPriceMw,
    termYears: o.termYears,
    revenuePaybackYears: spacexPayback(run[0].capexPerGw, o.contractPriceMw),
    maxCoverablePriceMw: coverableContractPrice(run),
    internalFallbackMw: HOARDER_INTERNAL_VALUE,
    yearsCovered: covered.length,
    yearsWithOperatingShortfall: rows.length - covered.length,
    minCoverage: Math.min(...rows.map(r => r.coverage)),
    totalRevenueB: rows.reduce((a, r) => a + r.revenueB, 0),
    totalOperatingShortfallB: rows.reduce((a, r) => a + r.operatingShortfallB, 0),
    rows,
  };
}

// Historical validation: 2023 memory was loose and earning nothing on HBM;
// by 2026 memory margin (SK hynix 76% OP) had overtaken foundry (TSMC 67.7%).
// If the elasticities cannot reproduce a shift that already happened, they are
// wrong. This is a free validation set.
const HISTORICAL_START = {
  year: 2023,
  memoryPrice: 1.4, logicPrice: 1.1,
  memoryCost: 1.3, logicCost: 0.42,      // memory near breakeven, foundry fat
  tightness: { 2023: { memory: 0.7, logic: 1.2 },
               2024: { memory: 1.6, logic: 1.2 },
               2025: { memory: 2.6, logic: 1.2 },
               2026: { memory: 3.0, logic: 1.2 } },
};

function backtest() {
  const memoryRail = railById('memory');
  const logicRail = railById('logic');
  let memoryPrice = HISTORICAL_START.memoryPrice;
  let logicPrice = HISTORICAL_START.logicPrice;
  const stepState = newStepState();
  const out = [];

  for (let year = 2023; year <= 2026; year++) {
    const t = HISTORICAL_START.tightness[year];
    memoryPrice = repriceStep(memoryPrice, t.memory, stepState, MEMORY_RESET_INTERVAL);
    logicPrice = repriceContinuous(logicPrice, logicRail.elasticity, t.logic);
    out.push({
      year,
      memoryMargin: (memoryPrice - HISTORICAL_START.memoryCost) / memoryPrice,
      logicMargin: (logicPrice - HISTORICAL_START.logicCost) / logicPrice,
    });
  }
  return out;
}

return {
  START_YEAR, END_YEAR, POWER_MODES, PIPELINE_BASE, PIPELINE_GROWTH,
  initialState, seedPipelines, computeCeilings, bindingConstraint, limitingFactor,
  physicalCeiling, pipelineCapacity,
  priceDamp, LAB_TAIL_SHARE, LAB_TAIL_DECAY, computeDemand, clearPrice,
  hoarderRelease, allocate,
  termPremium, creditCapacity, stepCapital, RATE_MAX,
  makeRng, regStopFactor, stepMonetization,
  stepRails, stepBullwhip, BULLWHIP_GAIN, simulate, impliedCreditDepthFor,
  HISTORICAL_START, backtest,
  SPACEX_DEFAULTS, HOARDER_INTERNAL_VALUE, spacexPayback, coverableContractPrice,
  spacexBook, spacexSummary,
};
});
