const { test } = require('node:test');
const assert = require('node:assert');
const { simulate, impliedCreditDepthFor } = require('../docs/js/engine.js');
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

test('ACCEPTANCE: 2026-2028 GW path tracks 30/50/70 within 10%', () => {
  const want = { 2026: 30, 2027: 50, 2028: 70 };
  for (const [year, target] of Object.entries(want)) {
    const got = byYear[year].newGw;
    const dev = Math.abs(got - target) / target;
    assert.ok(dev <= 0.10, `${year}: got ${got.toFixed(1)} GW vs ${target} (${(dev*100).toFixed(0)}% off)`);
  }
});

// Fix round 3 (Task 9): 2029 does NOT track the stated 95 GW path at a
// plausible capital depth (fix round 2), and re-inflating capital to force a
// fit would reintroduce fix round 1's mistake. This test's job is no longer
// "assert the forecast is right" -- CALIBRATION_TARGETS still carries the 95
// GW target and displays the deviation for exactly that reason -- it's
// "assert we know WHY we miss." A miss is only acceptable when it's
// EXPLAINED by a real constraint taking over, not by some unrelated bug
// quietly capping growth.
//
// C1/C1b fix (final review): the previous version accepted
// `y.binding === 'capital' || y.diffusionBound === true`, and the capital
// clause could not discriminate. `binding` was argmin over ceilings, so it read
// 'capital' whenever the capital ceiling happened to be the numeric lowest --
// regardless of whether capital did anything. Setting captureRate 0.004 -> 0.04
// (10x wrong; kills the diffusion mechanism in all five years) still passed.
//
// The miss at defaults is MONETIZATION-constrained, not capital-constrained.
// The causal chain is: the diffusion ceiling caps lab revenue (diffusionBound)
// -> labRevPerMw 27.1 falls below the clearing price -> labWtp 16.26 < price
// 25.16 -> priceDamp drops to its 0.0155 tail -> lab demand 80.8 -> 2.69 ->
// total demand 22.7, BELOW every ceiling (euv 94.3 / memory 87.0 / package
// 118.7 / power 111.7 / capital 60.3), so `limiter` is 'demand'.
//
// Both links are asserted. Requiring diffusionBound alone would not prove the
// collapse reached demand; requiring limiter 'demand' alone would not identify
// WHY demand collapsed. Capital is verifiably not the cause: raising
// creditMarketDepth 2500 -> 10,000,000 moves 2029 by 0.44 GW of a 72 GW miss.
function assertGwMissIsExplained(y, target, label) {
  const dev = Math.abs(y.newGw - target.target) / target.target;
  const hitsTarget = dev <= target.tolerance;
  const explainedMiss = y.diffusionBound === true && y.limiter === 'demand';
  assert.ok(hitsTarget || explainedMiss,
    `${label}: got ${y.newGw.toFixed(1)} GW vs ${target.target} (${(dev * 100).toFixed(0)}% off), ` +
    `limiter '${y.limiter}', diffusionBound=${y.diffusionBound} -- a miss must be explained by the ` +
    `diffusion ceiling collapsing DEMAND below every supply ceiling, not by whichever ceiling is lowest`);
}

test('2029 misses the stated path, and a monetization-driven demand collapse explains why', () => {
  const target = CALIBRATION_TARGETS.find(t => t.id === 'gw2029');
  assertGwMissIsExplained(byYear[2029], target, '2029');

  // A test that accepts ANY miss is worthless -- the whole point of C1b. Stub
  // each link of the chain in turn and confirm the SAME assertion then fails.
  assert.throws(() => assertGwMissIsExplained({ ...byYear[2029], diffusionBound: false }, target, '2029 (stubbed)'),
    /must be explained by the diffusion ceiling/,
    'stubbing diffusionBound=false must make the assertion fail');
  assert.throws(() => assertGwMissIsExplained({ ...byYear[2029], limiter: 'capital' }, target, '2029 (stubbed)'),
    /must be explained by the diffusion ceiling/,
    'a capital limiter must NOT be accepted as the explanation -- that was the C1 false cause');
});

// The mechanism, measured directly rather than inferred: capital is not what
// holds 2029 down. If this ever stops being true the 2029 framing above needs
// rewriting, so pin it.
test('2029 is demand-limited, not capital-limited: unlimited credit barely moves it', () => {
  const y = byYear[2029];
  const flooded = simulate({ ...DEFAULT_INPUTS, creditMarketDepth: 10000000 }, 12345)
    .find(r => r.year === 2029);
  const moved = flooded.newGw - y.newGw;
  assert.ok(moved < 1.0,
    `raising creditMarketDepth to 1e7 moved 2029 by ${moved.toFixed(2)} GW -- if credit genuinely ` +
    `mattered this much, 2029 is not demand-limited and the framing is wrong`);
  assert.ok(y.demand < Math.min(...Object.values(y.ceilings)),
    `2029 demand ${y.demand.toFixed(1)} must sit below EVERY ceiling for 'demand' to be the limiter`);
});

// impliedCreditDepthFor is the model's answer to "how deep would credit
// markets need to be for the stated path to be financeable" -- Task 11's
// calibration panel should be able to render this directly rather than a
// hand-written number in a report.
//
// C1 fix (final review): this previously asserted `limitingRail === 'memory'`,
// which was the false cause -- 2029's memory ceiling is 87.0 GW, nearly 4x the
// 22.7 GW cap being explained. With the demand case added, the diagnostic
// correctly reports 'demand'. Nothing about the model changed; the label was
// wrong.
//
// I8 fix: the seed is now passed explicitly. Omitting it silently used
// makeRng(1) (maxGw 23.14) while the page and every other test here use 12345
// (maxGw 22.70).
test('impliedCreditDepthFor: 2029/95 GW is unreachable at ANY credit depth -- demand runs out first', () => {
  const result = impliedCreditDepthFor(95, 2029, DEFAULT_INPUTS, 12345);
  assert.equal(result.reachable, false);
  assert.equal(result.limitingRail, 'demand');
  assert.ok(Math.abs(result.maxGw - 22.7) < 0.5, `maxGw ${result.maxGw}`);
  // The claim that makes 'demand' the right answer rather than 'memory': the
  // cap sits far below the memory ceiling it used to be blamed on.
  assert.ok(result.maxGw < byYear[2029].ceilings.memory / 3,
    `maxGw ${result.maxGw.toFixed(1)} vs memory ceiling ${byYear[2029].ceilings.memory.toFixed(1)} -- ` +
    `if these were close, blaming memory would at least be arguable`);
});

// Fix round 2 (Task 11): the old "80 GW needs MORE than default credit"
// framing no longer holds -- the new, lower physical ceiling (~23.1 GW,
// above) sits BELOW 80, so 80 is unreachable at any depth, same as 95. The
// still-true statement is the opposite shape: DEFAULT_INPUTS' own
// ecosystemCashFlow (independent of credit markets) already funds close to
// 20 GW in 2029, so a target comfortably inside the new physical ceiling
// needs no MORE credit than the default -- it demonstrates reachability
// without needing the credit market to deepen at all.
test('impliedCreditDepthFor: a target inside the physical ceiling IS reachable via credit alone', () => {
  const result = impliedCreditDepthFor(20, 2029, DEFAULT_INPUTS, 12345);
  assert.equal(result.reachable, true);
  assert.equal(result.limitingRail, 'demand',
    '20 GW clears because demand (22.7) exceeds it, not because any rail relaxed');
  assert.ok(result.creditMarketDepth >= 0 && Number.isFinite(result.creditMarketDepth));
  assert.ok(result.creditMarketDepth <= DEFAULT_INPUTS.creditMarketDepth,
    `20 GW should already be inside what DEFAULT_INPUTS credit depth (${DEFAULT_INPUTS.creditMarketDepth}) achieves, needed ${result.creditMarketDepth}`);
});

// Fix round 2 (Task 11): priceDamp's smooth tail removed the hard demand
// cutoff that produced full bang-bang oscillation (labs stopping entirely
// one year, price crashing, labs returning at ~5x volume the next). The
// residual year-over-year swing is a KNOWN LIMITATION, not a finding -- a
// swing this large is more plausibly under-damping than a real capex cycle.
// Proper smoothing (contracted revenue, demand-side commitment lags) belongs
// in a later spec; this test only bounds the swing from silently getting
// worse. 60 GW is chosen just above the current worst swing (~51 GW,
// 2029->2030) at DEFAULT_INPUTS/seed 12345.
test('ACCEPTANCE: year-over-year newGw swing stays under a known-limitation ceiling', () => {
  const YOY_SWING_CEILING_GW = 60;
  for (let i = 1; i < run.length; i++) {
    const swing = Math.abs(run[i].newGw - run[i - 1].newGw);
    assert.ok(swing <= YOY_SWING_CEILING_GW,
      `${run[i - 1].year}->${run[i].year}: newGw swung ${swing.toFixed(1)} GW, exceeds the ${YOY_SWING_CEILING_GW} GW ceiling`);
  }
});

// M1 fix (final review): the only existing diffusionCeilingMw test
// (engine-monetization.test.js) used a synthetic scenario and asserted
// `cap < 70` -- three orders of magnitude looser than the actual value there
// (4.2). No test bounded diffusionCeilingMw at DEFAULT_INPUTS itself; drift
// was only caught incidentally by unrelated snapshot pins (one of which
// locked in the C1 false cause). Pin a real numeric band on the actual run.
test('ACCEPTANCE: diffusionCeilingMw sits in a real numeric band every year, not just "< 70"', () => {
  const bands = { 2026: [120, 200], 2027: [30, 65], 2028: [15, 40], 2029: [15, 40], 2030: [25, 60] };
  for (const y of run) {
    const [lo, hi] = bands[y.year];
    assert.ok(y.diffusionCeilingMw >= lo && y.diffusionCeilingMw <= hi,
      `${y.year}: diffusionCeilingMw ${y.diffusionCeilingMw.toFixed(1)} outside expected band [${lo}, ${hi}]`);
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

// Fix round 3 (Task 11): the 70-80% lab-share claim and Dylan's $50-100M/MW
// lab revenue claim are THE SAME CLAIM, not two independent checks. A 75%
// share requires labs to decisively outbid everyone else, which requires the
// revenue his forecast assumes -- and the diffusion ceiling rejects that
// revenue (2028 labWtp/price ratio is only 1.14: labs can pay just 14% above
// market, nowhere near decisive). Reject the revenue and the share goes with
// it; reframed the same way as the 2029 GW test -- a miss is only acceptable
// when EXPLAINED by the diffusion ceiling binding that year.
function assertLabShareMissIsExplained(y, label) {
  const share = y.labShareOfNew;
  const hitsBand = share > 0.60 && share < 0.90;
  const explainedMiss = y.diffusionBound === true;
  assert.ok(hitsBand || explainedMiss,
    `${label}: labShareOfNew ${(share * 100).toFixed(0)}% outside 60-90% and diffusionBound=${y.diffusionBound} -- ` +
    `a miss must be explained by a bound diffusion ceiling, not an unrelated cap`);
}

test('2028 lab share misses the stated band, and the diffusion ceiling explains why', () => {
  assertLabShareMissIsExplained(byYear[2028], '2028');

  // A test that accepts ANY miss is worthless. Stub diffusionBound to false
  // on the 2028 state and confirm the SAME assertion logic then fails --
  // 2028's labShareOfNew (52%) genuinely sits outside 60-90% on its own, so
  // without the diffusion ceiling as an explanation there is nothing left to
  // excuse the miss.
  assert.throws(() => assertLabShareMissIsExplained({ ...byYear[2028], diffusionBound: false }, '2028 (stubbed)'),
    /outside 60-90%/, 'stubbing diffusionBound=false must make the assertion fail');
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

test('EUV is never the limiting constraint at defaults', () => {
  for (const y of run) {
    assert.notEqual(y.limiter, 'euv', `${y.year} bound on EUV — contradicts ASML's disclosed plan`);
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
