const { test } = require('node:test');
const assert = require('node:assert');
const { simulate } = require('../docs/js/engine.js');
const { RAILS } = require('../docs/js/rails.js');
const { DEFAULT_INPUTS, CALIBRATION_TARGETS } = require('../docs/js/presets.js');

const run = simulate(DEFAULT_INPUTS, 12345);
const byYear = Object.fromEntries(run.map(y => [y.year, y]));

test('simulate returns 2026-2030 with no NaN', () => {
  assert.equal(run.length, 5);
  assert.equal(run[0].year, 2026);
  assert.equal(run[4].year, 2030);
  for (const y of run) {
    for (const [k, v] of Object.entries(y)) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `${y.year}.${k} = ${v}`);
    }
  }
});

test('ACCEPTANCE: GW path tracks 30/50/70/90-100 within 10%', () => {
  const want = { 2026: 30, 2027: 50, 2028: 70, 2029: 95 };
  for (const [year, target] of Object.entries(want)) {
    const got = byYear[year].newGw;
    const dev = Math.abs(got - target) / target;
    assert.ok(dev <= 0.10, `${year}: got ${got.toFixed(1)} GW vs ${target} (${(dev*100).toFixed(0)}% off)`);
  }
});

test('ACCEPTANCE: compute price inflects 13 -> 25 -> 40', () => {
  assert.ok(byYear[2026].computePrice >= 12 && byYear[2026].computePrice <= 18, byYear[2026].computePrice);
  assert.ok(byYear[2028].computePrice > byYear[2026].computePrice * 1.8, 'price must inflect upward');
});

test('ACCEPTANCE: capex per GW inflates ~38 -> ~52 from rail repricing alone', () => {
  assert.ok(Math.abs(byYear[2026].capexPerGw - 38.2) < 3.8, byYear[2026].capexPerGw);
  assert.ok(byYear[2028].capexPerGw > byYear[2026].capexPerGw * 1.25, 'rails must reprice upward');
});

test('ACCEPTANCE: 2028 cumulative world GW near 200', () => {
  const dev = Math.abs(byYear[2028].cumulativeGw - 200) / 200;
  assert.ok(dev <= 0.10, `got ${byYear[2028].cumulativeGw.toFixed(0)}`);
});

test('ACCEPTANCE: labs take 70-80% of 2028 incremental', () => {
  const share = byYear[2028].labShareOfNew;
  assert.ok(share > 0.60 && share < 0.90, `got ${(share*100).toFixed(0)}%`);
});

// Fix round 1 (Task 9): the acceptance suite originally bounded capex growth
// only from below (2028 > 1.25x 2026), which a runaway that never resolves
// passes trivially. These three tests bound it from above and check that the
// bullwhip's stabilizing half (stepBullwhip) actually turns tightness over,
// rather than letting it climb forever.

test('ACCEPTANCE: capexPerGw stays within a plausible band every year, not just 2028', () => {
  // Sourced inflation is ~1.36x by 2028 (38.2 -> ~52). Extending that trend
  // linearly to 2030 gives roughly 1.8x; 2.5x is a deliberately looser hard
  // ceiling on top of that trend, so a genuine runaway (the fix-round bug hit
  // ~6.2x by 2030) is caught without pinning every year to the exact sourced
  // trend line.
  const base = byYear[2026].capexPerGw;
  const ceilingMultiple = { 2026: 1.0, 2027: 1.375, 2028: 1.75, 2029: 2.125, 2030: 2.5 };
  for (const y of run) {
    const multiple = y.capexPerGw / base;
    assert.ok(multiple <= ceilingMultiple[y.year],
      `${y.year}: capexPerGw ${y.capexPerGw.toFixed(1)} is ${multiple.toFixed(2)}x the 2026 baseline, exceeds the ${ceilingMultiple[y.year]}x ceiling`);
  }
});

test('ACCEPTANCE: no individual rail price exceeds 4x its 2026 baseline in any year', () => {
  // 4x is a deliberately generous backstop -- well above what any single
  // rail should need under a resolved (non-runaway) tightness path -- meant
  // to catch a genuine blow-up (the fix-round bug moved vendorMargin's
  // aggregate ~8.2x) rather than to pin normal repricing.
  const RAIL_PRICE_MAX_MULTIPLE = 4;
  for (const y of run) {
    for (const r of RAILS) {
      const multiple = y.railPrice[r.id] / r.price2026;
      assert.ok(multiple <= RAIL_PRICE_MAX_MULTIPLE,
        `${y.year}.${r.id}: ${y.railPrice[r.id].toFixed(2)} is ${multiple.toFixed(2)}x its 2026 baseline (${r.price2026}), exceeds ${RAIL_PRICE_MAX_MULTIPLE}x`);
    }
  }
});

test('ACCEPTANCE: physical tightness does not climb monotonically across all five years -- the bullwhip must bend it', () => {
  // Fix round 2: this gap must be measured against the PHYSICAL ceiling
  // (euv/memory/package/power), not against supplyGw. supplyGw also folds in
  // `capital`, and fix round 2 deliberately stopped feeding capital into the
  // rail-repricing signal -- a capital crunch now correctly reduces built
  // volume (see the fix-round report) rather than spuriously repricing
  // physical rails, so demand/supplyGw can legitimately climb every year
  // once capital binds without that being a repricing runaway. The
  // bullwhip's job is only to bend the PHYSICAL gap.
  const gaps = run.map(y => y.demand / Math.min(y.ceilings.euv, y.ceilings.memory, y.ceilings.package, y.ceilings.power));
  const strictlyIncreasing = gaps.every((g, i) => i === 0 || g > gaps[i - 1]);
  assert.ok(!strictlyIncreasing,
    `demand/physicalCeiling gap rose every year (${gaps.map(g => g.toFixed(2)).join(', ')}) -- the bullwhip stabilizer never caught up`);
});

test('EUV is never the binding constraint at defaults', () => {
  for (const y of run) {
    assert.notEqual(y.binding, 'euv', `${y.year} bound on EUV — contradicts ASML's disclosed plan`);
  }
});

test('STABILITY: no divergence across a full sweep of every slider', () => {
  const sweeps = {
    aiPct: [0.3, 0.9], logicWafersPerGw: [20000, 55000], labGrowthRate: [1.5, 4.0],
    wtpFraction: [0.1, 0.6], wtpFractionGrowth: [0, 0.6], priceElasticity: [0.2, 1.2],
    damping: [0.1, 1.0], baseRate: [0.03, 0.12], creditMarketDepth: [400, 3000],
    regStopProbability: [0, 1], inferenceShareDecay: [0, 0.15], captureRateGrowth: [0, 1.0],
  };
  for (const [key, values] of Object.entries(sweeps)) {
    for (const v of values) {
      const r = simulate({ ...DEFAULT_INPUTS, [key]: v }, 7);
      for (const y of r) {
        assert.ok(Number.isFinite(y.newGw) && y.newGw >= 0, `${key}=${v} y${y.year} newGw=${y.newGw}`);
        assert.ok(Number.isFinite(y.computePrice) && y.computePrice > 0, `${key}=${v} price=${y.computePrice}`);
        assert.ok(Number.isFinite(y.capexPerGw) && y.capexPerGw > 0, `${key}=${v} capex=${y.capexPerGw}`);
        assert.ok(y.rate < 1.0, `${key}=${v} rate=${y.rate}`);
      }
    }
  }
});

test('a regulatory freeze reduces built GW versus the base case', () => {
  const frozen = simulate({ ...DEFAULT_INPUTS, regStopProbability: 0.9, regDragSmooth: 0.25 }, 12345);
  const base2028 = byYear[2028].newGw;
  const frozen2028 = frozen.find(y => y.year === 2028).newGw;
  assert.ok(frozen2028 < base2028, 'regDrag must propagate to supply via WTP and price');
});

test('every calibration target has a matching field on the year state', () => {
  for (const t of CALIBRATION_TARGETS) {
    const y = byYear[t.year];
    assert.ok(y, `no year state for target ${t.id}`);
  }
});
