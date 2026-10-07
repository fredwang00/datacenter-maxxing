const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initialState, computeDemand, clearPrice, priceDamp, hoarderRelease } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS } = require('../docs/js/presets.js');

test('price response has a thin positive tail rather than an abrupt cutoff', () => {
  assert.ok(priceDamp(10, 50) > 0.9);
  assert.ok(priceDamp(49, 50) < 0.3);
  assert.ok(priceDamp(60, 50) > 0 && priceDamp(60, 50) < 0.1);
  assert.equal(priceDamp(10, 0), 0);
});

test('oversupply clears at the rental floor', () => {
  assert.equal(clearPrice(initialState(DEFAULT_INPUTS), DEFAULT_INPUTS, 2026, 500), 11);
});

test('clearing balances aggregate demand including released inventory', () => {
  for (const stock of [0, 10]) {
    const s = { ...initialState(DEFAULT_INPUTS), hoardedStock: stock };
    const price = clearPrice(s, DEFAULT_INPUTS, 2026, 2);
    assert.ok(price > 11);
    const d = computeDemand(s, DEFAULT_INPUTS, 2026, price);
    const release = Math.min(d.finalUseGw, hoarderRelease(s, price));
    assert.ok(Math.abs(d.total - release - 2) < 1e-7);
  }
});

test('scarcer supply raises the aggregate clearing price', () => {
  const s = initialState(DEFAULT_INPUTS);
  assert.ok(clearPrice(s, DEFAULT_INPUTS, 2026, 1) > clearPrice(s, DEFAULT_INPUTS, 2026, 3));
});

test('strategic budget covers existing capacity as well as expansion', () => {
  const inputs = { ...DEFAULT_INPUTS, demandSegments: [{
    id: 'research', label: 'Research', initialGw: 4, annualDemandGw: 6,
    demandGrowth: 0, budgetB: 200, budgetGrowth: 0,
    routes: [{ assetOwner: 'frontierLab', customer: 'frontierLab', share: 1 }],
  }] };
  const d = computeDemand(initialState(inputs), inputs, 2026, 20);
  assert.equal(d.segments[0].willingnessToPay, 20); // $200B / (4 + 6)GW
  assert.equal(d.segments[0].requestedGw, 0.48); // at mean bid, 8% tail of 6GW
});

test('zero adoption removes commercial requests, not independently funded research', () => {
  const inputs = { ...DEFAULT_INPUTS, demandSegments: DEFAULT_INPUTS.demandSegments.map(s =>
    s.valueShare ? { ...s, adoptionRate: 0 } : s) };
  const d = computeDemand(initialState(inputs), inputs, 2026);
  for (const id of ['commercial', 'enterprise']) assert.equal(d.segments.find(s => s.id === id).requestedGw, 0);
  assert.ok(d.segments.find(s => s.id === 'research').requestedGw > 0);
});

test('an exhausted annual compute budget cannot fund expansion through the demand tail', () => {
  const inputs = { ...DEFAULT_INPUTS, demandSegments: [{
    id: 'research', label: 'Research', initialGw: 10, annualDemandGw: 10,
    demandGrowth: 0, budgetB: 50, budgetGrowth: 0,
    routes: [{ assetOwner: 'frontierLab', customer: 'frontierLab', share: 1 }],
  }] };
  const d = computeDemand(initialState(inputs), inputs, 2026, 10);
  assert.equal(d.segments[0].requestedGw, 0); // existing 10GW already exceeds $50B / $10B/GW/year
});
