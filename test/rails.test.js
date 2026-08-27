const { test } = require('node:test');
const assert = require('node:assert');
const { RAILS, railById, topLevelPerGwIds, sumPerGw, initialRailPrice } = require('../docs/js/rails.js');

test('perGw top-level rails sum to 38.2 $B/GW', () => {
  assert.ok(Math.abs(sumPerGw(initialRailPrice()) - 38.2) < 0.01);
});

test('servers children sum exactly to the servers parent', () => {
  const p = initialRailPrice();
  const kids = RAILS.filter(r => r.parent === 'servers');
  const kidSum = kids.reduce((a, r) => a + p[r.id], 0);
  assert.ok(Math.abs(kidSum - p.servers) < 0.01, `children ${kidSum} != parent ${p.servers}`);
});

test('annuity top-level rails sum to 6.0 $B per GW/yr', () => {
  const p = initialRailPrice();
  const total = RAILS
    .filter(r => r.parent === null && r.basis === 'annuity')
    .reduce((a, r) => a + p[r.id], 0);
  assert.ok(Math.abs(total - 6.0) < 0.01, `got ${total}`);
});

test('UNITS GUARD: summing an annuity rail into capexPerGw throws', () => {
  assert.throws(
    () => sumPerGw(initialRailPrice(), ['servers', 'euv']),
    /Units guard.*euv.*annuity/s
  );
});

test('every rail has a provenance tag', () => {
  for (const r of RAILS) {
    assert.ok(typeof r.provenance === 'string' && r.provenance.length > 0, `${r.id} missing provenance`);
  }
});

test('every parent reference resolves to a real rail', () => {
  for (const r of RAILS) {
    if (r.parent !== null) assert.ok(railById(r.parent), `${r.id} has dangling parent ${r.parent}`);
  }
});

const { clamp, railTightness, repriceContinuous, repriceStep, newStepState,
        TIGHTNESS_MAX, MEMORY_RESET_INTERVAL } = require('../docs/js/rails.js');

test('tightness is demand over ceiling, clamped to [0.5, 3.0]', () => {
  assert.ok(Math.abs(railTightness(30, 30) - 1.0) < 1e-9);
  assert.ok(Math.abs(railTightness(45, 30) - 1.5) < 1e-9);
  assert.equal(railTightness(1000, 30), TIGHTNESS_MAX, 'must clamp high');
  assert.equal(railTightness(1, 1000), 0.5, 'must clamp low');
});

test('a zero ceiling is maximally tight, not a divide-by-zero', () => {
  assert.equal(railTightness(30, 0), TIGHTNESS_MAX);
});

test('continuous repricing scales with elasticity', () => {
  // fast rail (1.3) vs slow rail (0.20) at the same tightness
  const fast = repriceContinuous(100, 1.3, 1.5);
  const slow = repriceContinuous(100, 0.20, 1.5);
  assert.ok(Math.abs(fast - 165) < 0.01, `fast ${fast}`);
  assert.ok(Math.abs(slow - 110) < 0.01, `slow ${slow}`);
  assert.ok(fast > slow, 'fast rails must capture margin faster — the whole mechanic');
});

test('slack rails give back price', () => {
  assert.ok(repriceContinuous(100, 1.0, 0.8) < 100);
});

test('STEP: memory stays flat between contract resets, then jumps', () => {
  const s = newStepState();
  let price = 100;
  price = repriceStep(price, 1.5, s, MEMORY_RESET_INTERVAL);
  assert.equal(price, 100, 'year 1 under an LTA must be FLAT — this is the HBM finding');
  price = repriceStep(price, 1.5, s, MEMORY_RESET_INTERVAL);
  assert.ok(Math.abs(price - 160) < 0.01, `year 2 reset should be ~+60%, got ${price}`);
});

test('STEP: pressure resets after discharge', () => {
  const s = newStepState();
  let price = 100;
  price = repriceStep(price, 1.5, s, MEMORY_RESET_INTERVAL);
  price = repriceStep(price, 1.5, s, MEMORY_RESET_INTERVAL);
  assert.equal(s.pressure, 0);
  assert.equal(s.yearsSinceReset, 0);
});

test('STEP: slack years do not produce a price cut at reset', () => {
  const s = newStepState();
  let price = 100;
  price = repriceStep(price, 0.6, s, MEMORY_RESET_INTERVAL);
  price = repriceStep(price, 0.6, s, MEMORY_RESET_INTERVAL);
  assert.equal(price, 100, 'LTAs floor the price; suppliers do not hand money back');
});
