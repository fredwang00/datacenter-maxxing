const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_INPUTS } = require('../docs/js/presets.js');
const { DEFAULT_SEGMENTS } = require('../docs/js/demand.js');
const { initialState, computeDemand, clearPrice, allocate, simulate } = require('../docs/js/engine.js');
const inputs = { ...DEFAULT_INPUTS, demandSegments: DEFAULT_SEGMENTS };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

// Removing segment state/allocation would lose inventory conservation.
test('each run conserves installed capacity across four final uses and unallocated inventory', () => {
  for (const y of simulate(inputs, 12345)) {
    assert.ok(y.segmentCapacityGw, 'segment capacity must be emitted');
    assert.equal(Object.keys(y.segmentCapacityGw).length, 4);
    close(Object.values(y.segmentCapacityGw).reduce((a, b) => a + b, 0) + y.hoardedStock, y.cumulativeGw);
    close(Object.values(y.allocation.byOwner).reduce((a, b) => a + b, 0), y.allocation.totalGw);
    for (const segment of y.demandBreakdown.segments) {
      assert.ok(y.allocation.bySegment[segment.id] <= segment.requestedGw + 1e-9);
    }
  }
});

test('provider revenue cannot suppress an independently funded enterprise workload', () => {
  const s = initialState(inputs);
  const low = computeDemand({ ...s, providerRevenuePerCommercialMw: 0 }, inputs, 2026);
  const high = computeDemand({ ...s, providerRevenuePerCommercialMw: 1000 }, inputs, 2026);
  assert.ok(Array.isArray(low.segments), 'demand must be segmented');
  const enterprise = d => d.segments.find(v => v.id === 'enterprise');
  assert.ok(enterprise(low).directComputeBudgetB > 0);
  close(enterprise(low).requestedGw, enterprise(high).requestedGw);
});

test('aggregate segment demand can clear above a zero-revenue lab price cap', () => {
  const s = { ...initialState(inputs), providerRevenuePerCommercialMw: 0 };
  assert.ok(clearPrice(s, inputs, 2026, 1) > inputs.floorCost,
    'research/enterprise/sovereign bids must be able to set the price');
});

test('a higher enterprise adoption rate increases its requested capacity', () => {
  const higher = { ...inputs, demandSegments: DEFAULT_SEGMENTS.map(s => s.id === 'enterprise'
    ? { ...s, adoptionRate: 0.2 } : s) };
  const base = computeDemand(initialState(inputs), inputs, 2026);
  const changed = computeDemand(initialState(higher), higher, 2026);
  assert.ok(Array.isArray(base.segments), 'demand must be segmented');
  assert.ok(changed.segments.find(s => s.id === 'enterprise').requestedGw > base.segments.find(s => s.id === 'enterprise').requestedGw);
});

test('released inventory meets final demand before additional capacity is built', () => {
  const s = { ...initialState(inputs), hoardedStock: 100, computePrice: 50 };
  const d = computeDemand(s, inputs, 2026);
  const a = allocate(s, inputs, d, 100);
  assert.ok(a.released <= d.finalUseGw + 1e-9);
  close(a.allocation.totalGw + a.hoarderGot, a.newGw + a.released);
  close(a.hoardedStockAfter, 100 - a.released + a.hoarderGot);
});

test('reused inventory is excluded from new-build demand and physical-rail tightness', () => {
  const demandSegments = DEFAULT_SEGMENTS.map(s => s.valueShare
    ? { ...s, adoptionRate: 1, annualDemandGw: 40, demandGrowth: 0.6 }
    : { ...s, budgetB: 10000, annualDemandGw: 40, demandGrowth: 0.6 });
  const run = simulate({ ...inputs, demandSegments, hoarderBuildGw: 30 }, 1);
  assert.ok(run.some(y => y.releasedGw > 0));
  for (const y of run) close(y.demand, y.demandBreakdown.total - y.releasedGw);
});
