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

// ---------------------------------------------------------------------------
// MATRIX: full-contract coverage, {demand,supply}-constrained x
// {released == 0, released > 0}.
//
// Everything above this line is kept for regression history, but every
// balance assertion in it is an algebraic identity: forSale and
// hoardedStockAfter are DEFINED in terms of hoarderGot and released, so an
// equation built from those returned fields holds for any value allocate()
// happens to produce. None of it independently pins hoarderGot, forSale,
// labGain, or hoardedStockAfter to a number derived only from
// (state, inputs, demand, supplyGw).
//
// The tests below close that gap. `expectedAllocation` is a reference
// implementation of the contract, built only from the function's inputs
// (never from another field of allocate's own return value). Every one of
// allocate's six returned fields is checked against it, in all four cells
// of the matrix, so a mutation has nowhere left to hide:
//   - folding `released` into `newGw` before the clamp shows up as soon as
//     demand is not the binding constraint (cells 1-2);
//   - inflating `newGw` only on the supply-constrained branch shows up only
//     when supply binds AND the hoard is releasing (cell 4) -- exactly the
//     cell prior rounds never built;
//   - scaling `hoarderGot` shows up in every cell (hoarderBuildGw > 0
//     always here);
//   - dividing hoarderShare by `newGw` (or `supplyGw`) instead of
//     `demand.total` is invisible whenever newGw === demand.total, so it
//     only surfaces in the supply-constrained cells (3-4).
const HOARDER_INTERNAL_VALUE = 20;
const HOARDER_RELEASE_MAX = 0.6;

// Reference model of hoarderRelease, written independently of the function
// under test (not a call-through) so a mutation to hoarderRelease itself
// still shows up as a mismatch here.
function expectedHoarderRelease(state, price) {
  const spread = (price - HOARDER_INTERNAL_VALUE) / HOARDER_INTERNAL_VALUE;
  const fraction = Math.min(1, Math.max(0, spread)) * HOARDER_RELEASE_MAX;
  return Math.min(state.hoardedStock, state.hoardedStock * fraction);
}

// Reference model of labShare, same rationale.
function expectedLabShare(labWtp, price) {
  if (!(price > 0)) return 1;
  const ratio = labWtp / price;
  return Math.min(1, Math.max(0, (ratio - 1) / 3));
}

// Reference model of allocate's full contract, built only from
// (state, inputs, demand, supplyGw) -- never from another returned field.
function expectedAllocation(state, inputs, demand, supplyGw) {
  const newGw = Math.min(demand.total, supplyGw);
  const released = expectedHoarderRelease(state, state.computePrice);
  const hoarderShare = demand.total > 0 ? inputs.hoarderBuildGw / demand.total : 0;
  const hoarderGot = newGw * hoarderShare;
  const forSale = (newGw - hoarderGot) + released;
  const labGain = forSale * expectedLabShare(demand.labWtp, state.computePrice);
  const hoardedStockAfter = state.hoardedStock - released + hoarderGot;
  return { newGw, forSale, released, hoarderGot, labGain, hoardedStockAfter };
}

function assertMatchesContract(r, expected, state, label) {
  const EPS = 1e-9;
  for (const field of ['newGw', 'forSale', 'released', 'hoarderGot', 'labGain', 'hoardedStockAfter']) {
    assert.ok(Math.abs(r[field] - expected[field]) < EPS,
      `${label}: ${field} = ${r[field]}, expected ${expected[field]} (computed independently of allocate's own output)`);
  }
  // Restated directly from the contract. Redundant with the equalities
  // above under a correct implementation, but pinned separately so a
  // mutation that keeps the equality but breaks the bound (e.g. by also
  // corrupting the reference formula's assumptions) cannot hide behind it.
  assert.ok(r.hoarderGot <= r.newGw + EPS, `${label}: hoarderGot must never exceed newGw`);
  assert.ok(r.released <= state.hoardedStock + EPS, `${label}: released must never exceed the stock on hand`);
  assert.ok(r.labGain <= r.forSale + EPS, `${label}: labGain must never exceed forSale`);
}

test('MATRIX: demand-constrained, released == 0', () => {
  const s = initialState(DEFAULT_INPUTS);           // computePrice = 13 <= HOARDER_INTERNAL_VALUE
  s.hoardedStock = 10;
  const d = computeDemand(s, DEFAULT_INPUTS, 2026);
  const supplyGw = 5000;                            // far above demand.total (~26)
  assert.ok(supplyGw > d.total, 'scenario must actually be demand-constrained');
  const r = allocate(s, DEFAULT_INPUTS, d, supplyGw);
  assert.strictEqual(r.released, 0, 'computePrice <= HOARDER_INTERNAL_VALUE must yield zero release');
  assertMatchesContract(r, expectedAllocation(s, DEFAULT_INPUTS, d, supplyGw), s, 'demand-constrained/released=0');
});

test('MATRIX: demand-constrained, released > 0', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.hoardedStock = 10;
  s.computePrice = 45;                              // above HOARDER_INTERNAL_VALUE
  const d = computeDemand(s, DEFAULT_INPUTS, 2026);
  const supplyGw = 5000;                            // far above demand.total (~16 at this price)
  assert.ok(supplyGw > d.total, 'scenario must actually be demand-constrained');
  const r = allocate(s, DEFAULT_INPUTS, d, supplyGw);
  assert.ok(r.released > 0, 'test is only meaningful when the hoard is releasing');
  assertMatchesContract(r, expectedAllocation(s, DEFAULT_INPUTS, d, supplyGw), s, 'demand-constrained/released>0');
});

test('MATRIX: supply-constrained, released == 0', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.hoardedStock = 10;
  const d = computeDemand(s, DEFAULT_INPUTS, 2026);
  const supplyGw = 5;                               // below demand.total (~26)
  assert.ok(supplyGw < d.total, 'scenario must actually be supply-constrained');
  const r = allocate(s, DEFAULT_INPUTS, d, supplyGw);
  assert.strictEqual(r.released, 0, 'computePrice <= HOARDER_INTERNAL_VALUE must yield zero release');
  assertMatchesContract(r, expectedAllocation(s, DEFAULT_INPUTS, d, supplyGw), s, 'supply-constrained/released=0');
});

test('MATRIX: supply-constrained, released > 0', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.hoardedStock = 10;
  s.computePrice = 45;
  const d = computeDemand(s, DEFAULT_INPUTS, 2026);
  const supplyGw = 5;                               // below demand.total (~16 at this price)
  assert.ok(supplyGw < d.total, 'scenario must actually be supply-constrained');
  const r = allocate(s, DEFAULT_INPUTS, d, supplyGw);
  assert.ok(r.released > 0, 'test is only meaningful when the hoard is releasing');
  assertMatchesContract(r, expectedAllocation(s, DEFAULT_INPUTS, d, supplyGw), s, 'supply-constrained/released>0');
});

// None of the four cells above ever drives labWtp/price above 4 (both price
// settings, 13 and 45, sit close enough to labWtp=25 that the [0,1] clamp in
// labShare never binds on the upper side), so a mutation that drops just the
// upper bound would pass every test above undetected. Pin it directly.
test('labShare stays bounded to [0, 1] even at an extreme WTP/price ratio', () => {
  const extreme = labShare(100, 5);   // ratio = 20 -> unclamped (ratio-1)/3 = 6.33
  assert.ok(Math.abs(extreme - expectedLabShare(100, 5)) < 1e-9,
    `labShare(100, 5) = ${extreme}, expected ${expectedLabShare(100, 5)}`);
  assert.ok(extreme <= 1.0 + 1e-9, 'labShare must never exceed 1');
});
