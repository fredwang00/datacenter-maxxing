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

test('UNITS GUARD: error message interpolates the rail\'s actual basis, not a hardcoded "annuity"', () => {
  // Temporarily give an existing rail a third, made-up basis to prove the
  // message reflects rail.basis dynamically rather than a literal "annuity"
  // that happens to be right today because only two bases exist. Restored
  // in `finally` so no other test observes the mutated rail.
  const optics = railById('optics');
  const originalBasis = optics.basis;
  optics.basis = 'widget';
  try {
    assert.throws(
      () => sumPerGw(initialRailPrice(), ['servers', 'optics']),
      /Units guard.*optics.*basis "widget"/s,
      'message must report the rail\'s real basis, not a hardcoded string'
    );
  } finally {
    optics.basis = originalBasis;
  }
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
        TIGHTNESS_MAX, MEMORY_RESET_INTERVAL, REPRICE_MULTIPLIER_MIN } = require('../docs/js/rails.js');

// M10 fix (final review): comparing against the imported TIGHTNESS_MAX
// constant is tautological -- if TIGHTNESS_MAX ever drifted to, say, 5.0,
// this assertion would silently keep passing since both sides move together.
// Pin the literal value (3.0) so a drift is actually caught, and keep a
// separate sanity check that the constant itself still equals that literal.
test('TIGHTNESS_MAX is pinned to 3.0, not just internally consistent', () => {
  assert.equal(TIGHTNESS_MAX, 3.0, 'a change here is a real calibration change, not a refactor');
});

test('tightness is demand over ceiling, clamped to [0.5, 3.0]', () => {
  assert.ok(Math.abs(railTightness(30, 30) - 1.0) < 1e-9);
  assert.ok(Math.abs(railTightness(45, 30) - 1.5) < 1e-9);
  assert.equal(railTightness(1000, 30), 3.0, 'must clamp high to the literal TIGHTNESS_MAX value');
  assert.equal(railTightness(1, 1000), 0.5, 'must clamp low');
});

test('a zero ceiling is maximally tight, not a divide-by-zero', () => {
  assert.equal(railTightness(30, 0), 3.0);
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

test('F5: a legitimate high multiplier is unaffected by the floor', () => {
  // elasticity 1.3 (the fastest rail today) at max tightness 3.0: multiplier
  // = 1 + 1.3 * 2 = 3.6. Must not be clipped -- there is no upper cap.
  const price = repriceContinuous(100, 1.3, 3.0);
  assert.ok(Math.abs(price - 360) < 0.01, `expected 100 * 3.6 = 360, got ${price}`);
});

test('F5: REPRICE_MULTIPLIER_MIN floors the multiplier so extreme elasticity cannot invert price', () => {
  // elasticity 2.5 (above today's max of 1.3, but slider-exposed per spec) at
  // the tightness floor 0.5: unguarded multiplier = 1 + 2.5 * (0.5 - 1) = -0.25.
  const unguardedMultiplier = 1 + 2.5 * (0.5 - 1);
  assert.ok(unguardedMultiplier <= 0, 'sanity check: this scenario is genuinely dangerous without a floor');
  const price = repriceContinuous(100, 2.5, 0.5);
  assert.ok(price > 0, `price must stay positive, got ${price}`);
  assert.ok(Math.abs(price - 100 * REPRICE_MULTIPLIER_MIN) < 1e-9,
    `expected the multiplier clamped to REPRICE_MULTIPLIER_MIN (${REPRICE_MULTIPLIER_MIN}), got price ${price}`);
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
