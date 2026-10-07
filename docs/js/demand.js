// Final-use capacity. Routes describe ownership and rentals of the SAME GW.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function () {

function nonnegative(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be finite and nonnegative`);
  return value;
}

function validateRoutes(routes) {
  if (!Array.isArray(routes) || !routes.length) throw new Error('Segment routes are required');
  let sum = 0;
  for (const route of routes) {
    nonnegative(route.share, 'Route share');
    if (!route.assetOwner || !route.customer) throw new Error('Route needs an asset owner and customer');
    sum += route.share;
  }
  if (Math.abs(sum - 1) > 1e-9) throw new Error('Route shares must sum to one');
}

function allocateSegments(segments, availableGw) {
  nonnegative(availableGw, 'Available capacity');
  const ids = new Set();
  let requestedGw = 0;
  for (const segment of segments) {
    if (ids.has(segment.id)) throw new Error(`Duplicate segment: ${segment.id}`);
    ids.add(segment.id);
    nonnegative(segment.requestedGw, 'Requested capacity');
    validateRoutes(segment.routes);
    requestedGw += segment.requestedGw;
  }
  const totalGw = Math.min(availableGw, requestedGw);
  const factor = requestedGw > 0 ? totalGw / requestedGw : 0;
  const bySegment = {}, byOwner = {}, byCustomer = {}, routes = [];
  for (const segment of segments) {
    const gw = segment.requestedGw * factor;
    bySegment[segment.id] = gw;
    for (const route of segment.routes) {
      const routedGw = gw * route.share;
      byOwner[route.assetOwner] = (byOwner[route.assetOwner] || 0) + routedGw;
      byCustomer[route.customer] = (byCustomer[route.customer] || 0) + routedGw;
      routes.push({ segment: segment.id, ...route, gw: routedGw });
    }
  }
  return { totalGw, bySegment, byOwner, byCustomer, routes };
}

function fraction(value, name) {
  nonnegative(value, name);
  if (value > 1) throw new Error(`${name} must be at most one`);
  return value;
}

// Each mode serves the same quality-qualified task basket. These coefficients
// are scenario assumptions, not benchmarks. GW is IT capacity, excluding PUE.
const DEPLOYMENT_MODES = [
  { id: 'api', label: 'Frontier API', assetOwner: 'frontierLab', customer: 'frontierLab' },
  { id: 'managed', label: 'Managed open weights', assetOwner: 'hyperscaler', customer: 'openModelHost' },
  { id: 'rented', label: 'Self-hosted / rented GPUs', assetOwner: 'neocloud', customer: 'applications' },
  { id: 'owned', label: 'Self-hosted / owned GPUs', assetOwner: 'enterprise', customer: 'enterprise' },
];

function deploymentProfile(s, elapsed) {
  nonnegative(elapsed, 'Elapsed years');
  if (!Number.isInteger(elapsed)) throw new Error('Elapsed years must be an integer');
  for (const key of ['apiShare', 'managedShare', 'rentedShare', 'migrationRate', 'apiOwnedShare',
    'efficiencyGain', 'hardwareEfficiencyGain', 'reboundElasticity', 'spendingShare']) fraction(s[key], key);
  if (s.efficiencyGain >= 1 || s.hardwareEfficiencyGain >= 1) throw new Error('Efficiency gains must be below one');
  const ownedShare = 1 - s.apiShare - s.managedShare - s.rentedShare;
  if (ownedShare < -1e-9) throw new Error('Deployment shares cannot exceed one');
  if (!(s.initialGw > 0)) throw new Error('Workload anchor requires positive initial GW');
  nonnegative(s.annualDemandGw, 'Baseline annual task increment');
  nonnegative(s.demandGrowth, 'Task increment growth');
  const initial = [s.apiShare, s.managedShare, s.rentedShare, Math.max(0, ownedShare)];
  const apiShare = s.apiShare * Math.pow(1 - s.migrationRate, elapsed);
  const migrated = s.apiShare - apiShare;
  // Destination weights are explicit scenario conventions: 30% managed,
  // 50% rented self-hosting, 20% owned self-hosting. No extra tasks are created.
  const shares = [apiShare, initial[1] + migrated * 0.3,
    initial[2] + migrated * 0.5, initial[3] + migrated * 0.2];
  let anchorIntensity = 0, anchorCost = 0;
  const modes = DEPLOYMENT_MODES.map((mode, i) => {
    const intensity = nonnegative(s[mode.id + 'Intensity'], mode.id + ' intensity');
    const utilization = fraction(s[mode.id + 'Utilization'], mode.id + ' utilization');
    const cost = nonnegative(s[mode.id + 'Cost'], mode.id + ' cost');
    const computeFraction = fraction(s[mode.id + 'ComputeFraction'], mode.id + ' compute fraction');
    if (!(intensity > 0 && utilization > 0 && cost > 0)) throw new Error('Intensity, utilization and cost must be positive');
    anchorIntensity += initial[i] * intensity / utilization;
    anchorCost += initial[i] * cost;
    return { ...mode, share: shares[i], intensity, utilization, cost, computeFraction };
  });
  const costIndex = modes.reduce((n,m) => n + m.share * m.cost, 0) / anchorCost;
  const rebound = Math.pow(Math.min(1, costIndex), -s.reboundElasticity);
  // 100 task units at the opening of 2026. Accumulate an exogenous annual
  // increment in baseline-GW equivalents, independent of fulfilled demand.
  let baselineGw = s.initialGw;
  for (let t = 0; t <= elapsed; t++) baselineGw += s.annualDemandGw * Math.pow(1 + s.demandGrowth, t);
  const taskIndex = 100 * baselineGw / s.initialGw * rebound;
  const efficiency = Math.pow((1 - s.efficiencyGain) * (1 - s.hardwareEfficiencyGain), elapsed);
  const weightedIntensity = modes.reduce((n,m) => n + m.share * m.intensity / m.utilization, 0);
  const requiredGw = baselineGw * rebound * weightedIntensity / anchorIntensity * efficiency;
  const routes = modes.flatMap(m => {
    const share = m.share * m.intensity / m.utilization / weightedIntensity;
    if (m.id === 'api') return [
      { assetOwner: 'frontierLab', customer: 'frontierLab', share: share * s.apiOwnedShare },
      { assetOwner: 'hyperscaler', customer: 'frontierLab', share: share * (1 - s.apiOwnedShare) },
    ];
    return [{ assetOwner: m.assetOwner,
      customer: s.id === 'enterprise' && m.id === 'rented' ? 'enterprise' : m.customer, share }];
  });
  modes.forEach(m => { m.requiredGw = requiredGw * m.share * m.intensity / m.utilization / weightedIntensity; });
  return { modes, routes, taskIndex, costIndex, rebound, requiredGw, anchorCost };
}

function deploymentEconomics(s, economicValueB, elapsed, revenueFactor) {
  const deployment = deploymentProfile(s, elapsed);
  // Spending envelope is a fraction of adopted economic value at the initial
  // mix. Cheaper delivery lowers spending; explicit rebound can offset savings.
  const envelope = economicValueB * s.spendingShare * deployment.rebound / deployment.anchorCost;
  let frontierRevenueB = 0, managedRevenueB = 0, directComputeBudgetB = 0;
  let providerComputeBudgetB = 0, directOperationsB = 0, ownedInfrastructureB = 0, gpuRentalB = 0;
  for (const m of deployment.modes) {
    const provider = m.id === 'api' || m.id === 'managed';
    m.spendingB = envelope * m.share * m.cost * (provider ? revenueFactor : 1);
    m.computeBudgetB = m.spendingB * m.computeFraction;
    if (m.id === 'api') frontierRevenueB += m.spendingB;
    if (m.id === 'managed') managedRevenueB += m.spendingB;
    if (provider) providerComputeBudgetB += m.computeBudgetB;
    else {
      directComputeBudgetB += m.computeBudgetB;
      directOperationsB += m.spendingB - m.computeBudgetB;
      if (m.id === 'rented') gpuRentalB += m.computeBudgetB;
      else ownedInfrastructureB += m.computeBudgetB;
    }
  }
  const providerRevenueB = frontierRevenueB + managedRevenueB;
  return { deployment, frontierRevenueB, managedRevenueB, providerRevenueB,
    directComputeBudgetB, providerComputeBudgetB, directOperationsB,
    gpuRentalB, ownedInfrastructureB,
    customerSpendingB: providerRevenueB + directComputeBudgetB + directOperationsB,
    computeBudgetB: directComputeBudgetB + providerComputeBudgetB };
}

function segmentEconomics(segment, addressableValueB, elapsedYears, revenueFactor = 1) {
  nonnegative(addressableValueB, 'Addressable value');
  nonnegative(elapsedYears, 'Elapsed years');
  if (segment.id === 'research' || segment.id === 'sovereign') {
    nonnegative(segment.budgetB, 'Strategic budget');
    nonnegative(segment.budgetGrowth, 'Budget growth');
    return { economicValueB: 0, providerRevenueB: 0, directComputeBudgetB: 0,
      providerComputeBudgetB: 0, adoptionRate: null,
      computeBudgetB: segment.budgetB * Math.pow(1 + segment.budgetGrowth, elapsedYears) };
  }
  for (const key of ['valueShare', 'adoptionRate']) fraction(segment[key], key);
  nonnegative(segment.adoptionGrowth, 'Adoption growth');
  fraction(revenueFactor, 'Revenue factor');
  const adoptionRate = Math.min(1, segment.adoptionRate * Math.pow(1 + segment.adoptionGrowth, elapsedYears));
  const economicValueB = addressableValueB * segment.valueShare * adoptionRate;
  return { adoptionRate, economicValueB, ...deploymentEconomics(segment, economicValueB, elapsedYears, revenueFactor) };
}

function validateSegments(segments) {
  if (!Array.isArray(segments) || !segments.length) throw new Error('Demand segments are required');
  const ids = new Set();
  let valueShare = 0;
  for (const segment of segments) {
    if (!['research', 'commercial', 'enterprise', 'sovereign'].includes(segment.id)) throw new Error('Unknown final-use segment');
    if (ids.has(segment.id)) throw new Error(`Duplicate segment: ${segment.id}`);
    ids.add(segment.id);
    for (const key of ['initialGw', 'annualDemandGw', 'demandGrowth']) nonnegative(segment[key], key);
    if (segment.id === 'research' || segment.id === 'sovereign') validateRoutes(segment.routes);
    segmentEconomics(segment, 1, 0);
    valueShare += segment.valueShare || 0;
  }
  if (valueShare > 1 + 1e-9) throw new Error('Segment value shares cannot exceed one economic pool');
}

// Illustrative splits, budgets and growth rates, not interview-derived estimates.
// The four initial stocks sum to the existing 50 GW starting world capacity.
const DEPLOYMENT_DEFAULTS = {
  migrationRate: 0.1, reboundElasticity: 0, apiOwnedShare: 0.25,
  efficiencyGain: 0.15, hardwareEfficiencyGain: 0.1,
  apiIntensity: 1, apiUtilization: 0.65, apiCost: 1, apiComputeFraction: 0.5,
  managedIntensity: 0.7, managedUtilization: 0.6, managedCost: 0.75, managedComputeFraction: 0.6,
  rentedIntensity: 0.7, rentedUtilization: 0.45, rentedCost: 0.6, rentedComputeFraction: 0.8,
  ownedIntensity: 0.7, ownedUtilization: 0.35, ownedCost: 0.55, ownedComputeFraction: 0.8,
};
const DEFAULT_SEGMENTS = [
  { id: 'research', label: 'Frontier research', initialGw: 2.4, annualDemandGw: 4,
    demandGrowth: 0.5, budgetB: 150, budgetGrowth: 0.35,
    routes: [{ assetOwner: 'frontierLab', customer: 'frontierLab', share: 1 }] },
  { ...DEPLOYMENT_DEFAULTS, apiShare: 0.6, managedShare: 0.2, rentedShare: 0.15, spendingShare: 0.55,
    id: 'commercial', label: 'Commercial inference', initialGw: 16, annualDemandGw: 12,
    demandGrowth: 0.35, valueShare: 0.5, adoptionRate: 0.04, adoptionGrowth: 0.35,
  },
  { ...DEPLOYMENT_DEFAULTS, apiShare: 0.4, managedShare: 0.2, rentedShare: 0.25, spendingShare: 0.5,
    id: 'enterprise', label: 'Enterprise internal use', initialGw: 26.6, annualDemandGw: 10,
    demandGrowth: 0.25, valueShare: 0.5, adoptionRate: 0.04, adoptionGrowth: 0.35,
  },
  { id: 'sovereign', label: 'Sovereign workloads', initialGw: 5, annualDemandGw: 4,
    demandGrowth: 0.25, budgetB: 150, budgetGrowth: 0.25,
    routes: [{ assetOwner: 'sovereign', customer: 'sovereign', share: 1 }] },
];
for (const segment of DEFAULT_SEGMENTS) {
  if (segment.routes) {
    segment.routes.forEach(Object.freeze);
    Object.freeze(segment.routes);
  }
  Object.freeze(segment);
}
Object.freeze(DEFAULT_SEGMENTS);

return { allocateSegments, segmentEconomics, validateSegments, deploymentProfile, DEPLOYMENT_MODES, DEFAULT_SEGMENTS };
});
