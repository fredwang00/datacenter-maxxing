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
  // Fix round 2 (Task 11): labWtp is a MEAN across a lab's use cases, not a
  // hard reservation price -- a tail of uses is worth far more than average,
  // so demand above WTP narrows to that tail rather than vanishing. A hard
  // zero here caused bang-bang oscillation (labs stopped entirely, price
  // crashed, labs returned next year at ~5x volume). This assertion IS the
  // defect being removed, not a goalpost move: small and strictly positive.
  const above = priceDamp(60, 50);
  assert.ok(above > 0, 'above WTP -> tapers to a thin tail, never hits exactly zero');
  assert.ok(above < 0.1, 'the tail is thin -- most demand still falls away above WTP');
});

test('F6: arbitrage shelf is fully engaged, not NaN, when floorCost is non-positive', () => {
  // (price - 0) / 0 is NaN, which poisons Math.max and then Math.exp. A
  // floorCost <= 0 means there's no cost floor to measure excess against, so
  // the shelf should be treated as fully engaged (its max), not NaN.
  const atZero = arbitrageShelf(0, 0);
  assert.ok(Number.isFinite(atZero), `expected a finite number, got ${atZero}`);
  assert.equal(atZero, 12, 'floorCost <= 0 must fully engage the shelf at ARB_SHELF_MAX_GW');

  const negativeFloor = arbitrageShelf(5, -3);
  assert.ok(Number.isFinite(negativeFloor), `expected a finite number, got ${negativeFloor}`);
  assert.equal(negativeFloor, 12, 'a negative floorCost must also fully engage the shelf');
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

// T5 fix (final review): the checks above cannot catch a wrong formula for
// any ONE class -- `total` is DEFINED in computeDemand as the sum of these
// same four fields, so a bug that changes labDemand (say) still keeps
// total === sum trivially. Pin each class to its own formula independently,
// so a wrong formula for one class fails on that class specifically.
test('each buyer class matches its own formula, not just the total', () => {
  const s = initialState(DEFAULT_INPUTS);
  const d = computeDemand(s, DEFAULT_INPUTS, 2026);

  const labWtp = s.labRevPerMw * s.wtpFraction;
  const expectedLabDemand = s.labGw * (DEFAULT_INPUTS.labGrowthRate - 1) * priceDamp(s.computePrice, labWtp);
  assert.ok(Math.abs(d.labDemand - expectedLabDemand) < 1e-9,
    `labDemand ${d.labDemand} != labGw * (labGrowthRate - 1) * priceDamp(price, labWtp) = ${expectedLabDemand}`);

  assert.equal(d.hyperscaler, DEFAULT_INPUTS.hyperscalerDemandGw,
    'hyperscaler demand is a direct input pass-through, not a derived quantity');
  assert.equal(d.hoarder, DEFAULT_INPUTS.hoarderBuildGw,
    'hoarder demand is a direct input pass-through, not a derived quantity');

  const expectedArbitrage = arbitrageShelf(s.computePrice, DEFAULT_INPUTS.floorCost);
  assert.ok(Math.abs(d.arbitrage - expectedArbitrage) < 1e-9,
    `arbitrage ${d.arbitrage} != arbitrageShelf(price, floorCost) = ${expectedArbitrage}`);
});
