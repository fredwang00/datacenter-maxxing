const { test } = require('node:test');
const assert = require('node:assert');
const { initialState, computeDemand, allocate, labShare, hoarderRelease } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS } = require('../docs/js/presets.js');

test('CONSERVATION: released hoard is inventory, never new capacity', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.hoardedStock = 10;
  s.computePrice = 45;
  const d = computeDemand(s, DEFAULT_INPUTS, 2026);
  const r = allocate(s, DEFAULT_INPUTS, d, 30);
  assert.ok(r.newGw <= 30 + 1e-9, 'newGw may never exceed the physical supply ceiling');
  const expected = s.hoardedStock - r.released + r.hoarderGot;
  assert.ok(Math.abs(r.hoardedStockAfter - expected) < 1e-9, 'hoard must balance: in - out + got');
  assert.ok(Math.abs((r.forSale + r.hoarderGot) - (r.newGw + r.released)) < 1e-9, 'forSale + hoarderGot must equal newGw + released');
});

test('INVARIANT: released hoard never inflates newGw (demand-constrained)', () => {
  const mk = (stock) => {
    const s = initialState(DEFAULT_INPUTS);
    s.computePrice = 45;          // above HOARDER_INTERNAL_VALUE, so released > 0
    s.hoardedStock = stock;
    const d = computeDemand(s, DEFAULT_INPUTS, 2026);
    // Supply deliberately FAR above demand so newGw is demand-bound. If supply
    // binds, the clamp hides any leakage of `released` into newGw — which is
    // exactly how the previous version of this test was defeated.
    return { r: allocate(s, DEFAULT_INPUTS, d, 5000), d };
  };
  const dry = mk(0);
  const wet = mk(10);

  assert.ok(wet.r.released > 0, 'test is only meaningful when released > 0');
  assert.ok(Math.abs(dry.r.newGw - wet.r.newGw) < 1e-9,
    `newGw must not move with hoarded stock: ${dry.r.newGw} vs ${wet.r.newGw}`);
  assert.ok(Math.abs(wet.r.newGw - wet.d.total) < 1e-9,
    'demand-constrained: newGw must equal demand.total exactly, never demand.total + released');
});

test('hoarders release more when price is high relative to internal use', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.hoardedStock = 10;
  s.computePrice = 15;
  const low = hoarderRelease(s, s.computePrice);
  s.computePrice = 45;
  const high = hoarderRelease(s, s.computePrice);
  assert.ok(high > low, 'a wide spread should pull inventory out — how Elon recoups capex in a year');
});

test('hoarders cannot release more than they hold', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.hoardedStock = 2;
  s.computePrice = 200;
  assert.ok(hoarderRelease(s, s.computePrice) <= 2 + 1e-9);
});

test('labs take a larger share when they can outbid', () => {
  assert.ok(labShare(60, 13) > labShare(20, 13), 'higher WTP vs price -> bigger share');
  assert.ok(labShare(60, 13) <= 1.0);
  assert.ok(labShare(10, 40) >= 0.0);
});

test('newGw is the lesser of demand and supply', () => {
  const s = initialState(DEFAULT_INPUTS);
  const d = computeDemand(s, DEFAULT_INPUTS, 2026);
  const constrained = allocate(s, DEFAULT_INPUTS, d, 5);
  assert.ok(Math.abs(constrained.newGw - 5) < 1e-9, 'supply-limited');
  const abundant = allocate(s, DEFAULT_INPUTS, d, 5000);
  assert.ok(Math.abs(abundant.newGw - d.total) < 1e-9, 'demand-limited');
});

test('INVARIANT: hoarderGot is the proportional share and never exceeds newGw', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.computePrice = 45;
  s.hoardedStock = 10;
  const d = computeDemand(s, DEFAULT_INPUTS, 2026);
  const r = allocate(s, DEFAULT_INPUTS, d, 5000);
  const expected = r.newGw * (DEFAULT_INPUTS.hoarderBuildGw / d.total);
  assert.ok(r.hoarderGot > 0, 'test is only meaningful when the hoarder builds');
  assert.ok(Math.abs(r.hoarderGot - expected) < 1e-9,
    `hoarderGot ${r.hoarderGot} is not the proportional share ${expected}`);
  assert.ok(r.hoarderGot <= r.newGw + 1e-9, 'hoarderGot can never exceed newGw');
});

test('INVARIANT: newGw never exceeds supplyGw even while the hoard is releasing', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.computePrice = 45;          // above HOARDER_INTERNAL_VALUE, so released > 0
  s.hoardedStock = 10;
  const d = computeDemand(s, DEFAULT_INPUTS, 2026);
  const supply = 5;             // deliberately BELOW demand so supply binds
  const r = allocate(s, DEFAULT_INPUTS, d, supply);
  assert.ok(r.released > 0, 'test is only meaningful when released > 0');
  assert.ok(d.total > supply, 'scenario must actually be supply-constrained');
  assert.ok(r.newGw <= supply + 1e-9,
    `newGw ${r.newGw} exceeded the physical ceiling ${supply}`);
  assert.ok(Math.abs(r.newGw - supply) < 1e-9,
    'supply-constrained: newGw must equal supplyGw exactly');
});
