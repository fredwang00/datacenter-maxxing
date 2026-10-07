const { test } = require('node:test');
const assert = require('node:assert/strict');
const demand = require('../docs/js/demand.js');

const routes = [{ assetOwner: 'neocloud', customer: 'hyperscaler', share: 1 }];
const segment = (id, requestedGw, rs = routes) => ({ id, requestedGw, routes: rs });

test('capacity is counted once across final uses and rental intermediaries', () => {
  assert.equal(typeof demand.allocateSegments, 'function');
  const result = demand.allocateSegments([
    segment('commercial', 8),
    segment('enterprise', 2, [{ assetOwner: 'enterprise', customer: 'enterprise', share: 1 }]),
  ], 5);
  assert.equal(result.totalGw, 5);
  assert.equal(result.bySegment.commercial, 4);
  assert.equal(result.bySegment.enterprise, 1);
  assert.equal(result.byOwner.neocloud, 4);
  assert.equal(result.byCustomer.hyperscaler, 4);
  assert.equal(Object.values(result.byOwner).reduce((a, b) => a + b, 0), 5);
});

test('surplus capacity is not allocated beyond requested expansion', () => {
  assert.equal(typeof demand.allocateSegments, 'function');
  const result = demand.allocateSegments([segment('research', 2)], 10);
  assert.equal(result.totalGw, 2);
  assert.equal(result.bySegment.research, 2);
  assert.equal(demand.allocateSegments([segment('research', 2)], 0).totalGw, 0);
});

test('routing changes owner exposure but never final-use allocation', () => {
  assert.equal(typeof demand.allocateSegments, 'function');
  const direct = demand.allocateSegments([segment('commercial', 6,
    [{ assetOwner: 'hyperscaler', customer: 'applications', share: 1 }])], 4);
  const rented = demand.allocateSegments([segment('commercial', 6)], 4);
  assert.deepEqual(direct.bySegment, rented.bySegment);
  assert.equal(direct.byOwner.hyperscaler, 4);
  assert.equal(rented.byOwner.neocloud, 4);
});

test('invalid or duplicate routes cannot create or silently drop capacity', () => {
  assert.equal(typeof demand.allocateSegments, 'function');
  for (const share of [-1, 0.5, 2, NaN]) {
    assert.throws(() => demand.allocateSegments([segment('commercial', 3,
      [{ assetOwner: 'neocloud', customer: 'hyperscaler', share }])], 3), /route/i);
  }
  assert.throws(() => demand.allocateSegments([segment('commercial', 3), segment('commercial', 2)], 5), /duplicate/i);
  assert.equal(demand.allocateSegments([], 5).totalGw, 0);
});

const commercial = {
  ...demand.DEFAULT_SEGMENTS.find(s => s.id === 'commercial'),
  apiShare: 0.5, managedShare: 0, rentedShare: 0.5, spendingShare: 0.5,
  apiCost: 1, rentedCost: 1, apiComputeFraction: 0.4, rentedComputeFraction: 0.8,
  id: 'commercial', label: 'Commercial inference', initialGw: 2,
  annualDemandGw: 3, demandGrowth: 0, valueShare: 0.5,
  adoptionRate: 0.2, adoptionGrowth: 0,
  routes,
};

test('adopted value, provider revenue and compute budget are distinct dollar flows', () => {
  assert.equal(typeof demand.segmentEconomics, 'function');
  const result = demand.segmentEconomics(commercial, 1000, 0);
  // $1000B × 50% segment × 20% adoption = $100B of value.
  // Spending = 100 × .5 = 50; API receipts = 50 × .5 = 25.
  // Compute = 25 × .8 direct + 25 × .4 provider = 30.
  assert.equal(result.economicValueB, 100);
  assert.equal(result.providerRevenueB, 25);
  assert.equal(result.directComputeBudgetB, 20);
  assert.equal(result.providerComputeBudgetB, 10);
  assert.equal(result.computeBudgetB, 30);
});

test('internal enterprise spending survives zero model-provider revenue', () => {
  assert.equal(typeof demand.segmentEconomics, 'function');
  const result = demand.segmentEconomics({ ...commercial, id: 'enterprise', apiShare: 0, rentedShare: 1 }, 1000, 0);
  assert.equal(result.providerRevenueB, 0);
  assert.equal(result.computeBudgetB, 40);
  assert.equal(result.economicValueB, 100);
});

test('adoption saturates while deployment shares do not change economic value', () => {
  assert.equal(typeof demand.segmentEconomics, 'function');
  const result = demand.segmentEconomics({ ...commercial, adoptionRate: 0.8, adoptionGrowth: 1 }, 1000, 2);
  assert.equal(result.adoptionRate, 1);
  assert.equal(result.economicValueB, 500);
  const low = demand.segmentEconomics({ ...commercial, apiShare: 0, rentedShare: 1 }, 1000, 0);
  const high = demand.segmentEconomics(commercial, 1000, 0);
  assert.equal(low.economicValueB, high.economicValueB);
  assert.ok(low.directComputeBudgetB > high.directComputeBudgetB);
});

test('strategic research budgets are not booked as commercial economic value or provider revenue', () => {
  assert.equal(typeof demand.segmentEconomics, 'function');
  const result = demand.segmentEconomics({ id: 'research', budgetB: 20, budgetGrowth: 0.5 }, 1000, 1);
  assert.equal(result.computeBudgetB, 30);
  assert.equal(result.providerRevenueB, 0);
  assert.equal(result.economicValueB, 0);
});

test('value shares and spend shares cannot double-count the economic pool', () => {
  assert.equal(typeof demand.validateSegments, 'function');
  assert.throws(() => demand.validateSegments([{ ...commercial, valueShare: 0.7 },
    { ...commercial, id: 'enterprise', valueShare: 0.7 }]), /value shares/i);
  assert.throws(() => demand.segmentEconomics({ ...commercial, spendingShare: 1.1 }, 1000, 0), /share/i);
  assert.throws(() => demand.segmentEconomics({ ...commercial, adoptionRate: -1 }, 1000, 0), /adoption/i);
});
