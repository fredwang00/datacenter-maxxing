const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initialState, stepMonetization, makeRng, regStopFactor, simulate } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS } = require('../docs/js/presets.js');

test('commercial revenue per MW divides the adopted provider pool by commercial capacity', () => {
  const inputs = { ...DEFAULT_INPUTS, addressableValueB: 1000,
    demandSegments: DEFAULT_INPUTS.demandSegments.map(s => s.id === 'commercial'
      ? { ...s, valueShare: 0.5, adoptionRate: 0.2, apiShare: 1, managedShare: 0, rentedShare: 0, spendingShare: 0.25 } : s) };
  const state = initialState(inputs);
  state.segmentCapacityGw.commercial = 10;
  state.providerRevenueFactor = 0.8;
  const r = stepMonetization(state, inputs, 2026);
  assert.equal(r.commercialProviderRevenuePoolB, 25); // 1000 × .5 × .2 × .25
  assert.equal(r.commercialProviderRevenueB, 20); // 25 × .8
  assert.equal(r.providerRevenuePerCommercialMw, 2); // $20B / 10 GW
  assert.equal(r.providerRevenuePoolPerMw, 2.5);
});

test('regulatory draws remain discrete and reproducible', () => {
  assert.equal(regStopFactor(() => 0.1, DEFAULT_INPUTS), 0.75);
  assert.equal(regStopFactor(() => 0.9, DEFAULT_INPUTS), 1);
  assert.equal(regStopFactor(() => 0.001, { ...DEFAULT_INPUTS, regStopProbability: 0 }), 1);
  assert.equal(regStopFactor(() => 0.999, { ...DEFAULT_INPUTS, regStopProbability: 1 }), 0.75);
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
});

test('provider restrictions reduce provider-funded compute but preserve direct enterprise budgets', () => {
  const free = simulate({ ...DEFAULT_INPUTS, regStopProbability: 0, regDragSmooth: 0 }, 7)[0];
  const frozen = simulate({ ...DEFAULT_INPUTS, regStopProbability: 1, regDragSmooth: 0.3 }, 7)[0];
  assert.ok(frozen.commercialProviderRevenueB < free.commercialProviderRevenueB);
  assert.ok(frozen.newGw < free.newGw);
  const a = free.demandBreakdown.segments.find(s => s.id === 'enterprise');
  const b = frozen.demandBreakdown.segments.find(s => s.id === 'enterprise');
  assert.equal(a.economicValueB, b.economicValueB);
  assert.equal(a.directComputeBudgetB, b.directComputeBudgetB);
  assert.ok(b.providerComputeBudgetB < a.providerComputeBudgetB);
});

test('seeds affect provider revenue while identical seeds reproduce the full run', () => {
  assert.deepEqual(simulate(DEFAULT_INPUTS, 42), simulate(DEFAULT_INPUTS, 42));
  const results = new Set([1,2,3,4,5,6,7,8].map(seed => simulate({ ...DEFAULT_INPUTS, regStopProbability: 0.5 }, seed)[0].commercialProviderRevenueB));
  assert.ok(results.size > 1);
});

test('regulatory reductions persist into later years rather than resetting each year', () => {
  const run = simulate({ ...DEFAULT_INPUTS, regStopProbability: 0, regDragSmooth: 0.1 }, 7);
  const factors = [0.9, 0.81, 0.729, 0.6561, 0.59049];
  run.forEach((y, i) => assert.ok(Math.abs(y.commercialProviderRevenueB / y.commercialProviderRevenuePoolB - factors[i]) < 1e-9));
});
