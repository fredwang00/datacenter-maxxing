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

test('newGw is pinned by supply ceiling regardless of hoard stock', () => {
  const s1 = initialState(DEFAULT_INPUTS);
  s1.hoardedStock = 0;
  s1.computePrice = 45;
  const d1 = computeDemand(s1, DEFAULT_INPUTS, 2026);
  const r1 = allocate(s1, DEFAULT_INPUTS, d1, 15);

  const s2 = initialState(DEFAULT_INPUTS);
  s2.hoardedStock = 10;
  s2.computePrice = 45;
  const d2 = computeDemand(s2, DEFAULT_INPUTS, 2026);
  const r2 = allocate(s2, DEFAULT_INPUTS, d2, 15);

  assert.ok(Math.abs(r1.newGw - r2.newGw) < 1e-9, 'identical supply/demand should yield identical newGw regardless of hoard stock');
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
