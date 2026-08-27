const { test } = require('node:test');
const assert = require('node:assert');
const { initialState, computeDemand, clearPrice, arbitrageShelf, priceDamp } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS } = require('../docs/js/presets.js');

test('arbitrage shelf is large below the floor and vanishes above it', () => {
  const cheap = arbitrageShelf(11, 11);
  const dear = arbitrageShelf(40, 11);
  assert.ok(cheap > 5, `shelf should absorb capacity when cheap, got ${cheap}`);
  assert.ok(dear < 0.5, `shelf must vanish when dear, got ${dear}`);
});

test('lab demand is damped as price approaches willingness to pay', () => {
  assert.ok(priceDamp(10, 50) > 0.9, 'cheap vs WTP -> buy freely');
  assert.ok(priceDamp(49, 50) < 0.3, 'at WTP -> nearly stop');
  assert.equal(priceDamp(60, 50), 0, 'above WTP -> stop entirely');
});

test('price cannot fall below the arbitrage floor', () => {
  const s = initialState(DEFAULT_INPUTS);
  const p = clearPrice(s, DEFAULT_INPUTS, 1, 500);  // massive oversupply
  assert.ok(p >= DEFAULT_INPUTS.floorCost - 1e-9, `got ${p}`);
});

test('price cannot exceed lab willingness to pay', () => {
  const s = initialState(DEFAULT_INPUTS);
  const wtp = s.labRevPerMw * s.wtpFraction;
  const p = clearPrice(s, DEFAULT_INPUTS, 500, 1);  // massive shortage
  assert.ok(p <= wtp + 1e-9, `price ${p} escaped WTP ceiling ${wtp}`);
});

test('damping means price moves partway, not all the way, in one year', () => {
  const s = initialState(DEFAULT_INPUTS);
  const before = s.computePrice;
  const p = clearPrice(s, DEFAULT_INPUTS, 60, 30);
  assert.ok(p > before, 'shortage should raise price');
  const undamped = before * Math.pow(2, DEFAULT_INPUTS.priceElasticity);
  assert.ok(p < undamped, 'damping must slow the approach');
});

test('all four buyer classes are present and non-negative', () => {
  const s = initialState(DEFAULT_INPUTS);
  const d = computeDemand(s, DEFAULT_INPUTS, 2026);
  for (const k of ['labDemand', 'hyperscaler', 'hoarder', 'arbitrage']) {
    assert.ok(d[k] >= 0, `${k} negative`);
  }
  assert.ok(Math.abs(d.total - (d.labDemand + d.hyperscaler + d.hoarder + d.arbitrage)) < 1e-9);
});
