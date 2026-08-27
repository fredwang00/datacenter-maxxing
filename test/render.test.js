const { test } = require('node:test');
const assert = require('node:assert');
const { stateTableHtml, calibrationRows, calibrationHtml, ladderRungs, ladderHtml,
        marginMigrationHtml, fmtPct,
        matrixTabForLimiter, railMarginExpansions, matrixHtml,
        labSplit, labComparisonHtml,
        fabCapexPerGwYr, perGwEconomics, perGwEconomicsHtml,
        bottleneckSegments, bottleneckHtml,
        diffusionRows, diffusionHtml } = require('../docs/js/render.js');
const { simulate } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS, CALIBRATION_TARGETS } = require('../docs/js/presets.js');
const { RAILS } = require('../docs/js/rails.js');
const { MARKET_SCENARIOS } = require('../docs/js/market-scenarios.js');

const run = simulate(DEFAULT_INPUTS, 12345);

test('state table has one row per simulated year', () => {
  const html = stateTableHtml(run);
  for (const y of run) assert.ok(html.includes(String(y.year)), `missing ${y.year}`);
});

test('state table shows the limiter per year', () => {
  const html = stateTableHtml(run);
  for (const y of run) assert.ok(html.toLowerCase().includes(y.limiter.toLowerCase()));
});

// C1 fix (final review): the state table's job here is to NOT name a supply
// rail in a year that was demand-limited. 2029 at defaults is the case that
// went wrong -- it printed "capital" beside a demand of 22.7 and a capital
// ceiling of 60.3.
test('a demand-limited year is labelled demand, not whichever ceiling is lowest', () => {
  const y = run.find(r => r.limiter === 'demand');
  assert.ok(y, 'DEFAULT_INPUTS/seed 12345 should have at least one demand-limited year (2029)');
  const lowestCeiling = Object.entries(y.ceilings)
    .reduce((a, b) => (b[1] < a[1] ? b : a))[0];
  assert.notEqual(y.limiter, lowestCeiling,
    `${y.year}: the lowest ceiling is '${lowestCeiling}' but demand ran out first -- ` +
    `naming the ceiling would restate the C1 false cause`);
  const row = stateTableHtml([y]);
  assert.ok(row.includes('>demand<'), 'the demand case must be rendered by name');
  assert.ok(!new RegExp(`limiter-${lowestCeiling}`).test(row),
    `${y.year} must not be styled as ${lowestCeiling}-limited`);
});

test('clamped years are visibly marked, not hidden', () => {
  const fake = run.map((y, i) => ({ ...y, clamped: i === 1 }));
  assert.ok(stateTableHtml(fake).includes('clamped'), 'a clamped year must be visibly marked');
});

// I7 fix (final review): `clamped` is NOT a fixture-only case -- at
// DEFAULT_INPUTS/seed 12345, 2029's nextPrice hits floorCost (11.00 = 11.00)
// exactly. A comment near the diffusionBound test below used to claim
// clamped "genuinely never fires at defaults," which was false and, worse,
// the marker's own title text called it a sign "parameters are likely
// wrong" -- but hitting the arbitrage floor is the model's stability defence
// #1 engaging, the same kind of legitimate finding the header calls 2029 GW
// and 2028 lab share. This tests the REAL run, not a synthetic fixture, and
// pins the softened wording.
test('clamped genuinely fires at DEFAULT_INPUTS (2029), and is not worded as an error', () => {
  const clampedYears = run.filter(y => y.clamped);
  assert.ok(clampedYears.length > 0, 'DEFAULT_INPUTS/seed 12345 should have a clamped year (2029)');
  assert.ok(clampedYears.some(y => y.year === 2029), `expected 2029 to be clamped, got ${clampedYears.map(y => y.year)}`);
  const html = stateTableHtml(run);
  assert.ok(html.includes('clamped'), 'the real clamped year must be visibly marked');
  assert.ok(!/parameters are likely wrong/.test(html),
    'hitting the arbitrage floor is the stability defence working, not necessarily a parameter error');
});

test('calibration rows compute deviation against every target', () => {
  const rows = calibrationRows(run, CALIBRATION_TARGETS);
  assert.equal(rows.length, CALIBRATION_TARGETS.length);
  for (const r of rows) {
    assert.ok(Number.isFinite(r.actual), `${r.id} actual not finite`);
    assert.ok(Number.isFinite(r.deviation), `${r.id} deviation not finite`);
    assert.equal(typeof r.pass, 'boolean');
  }
});

// I4 fix (final review): presence/finiteness checks like the one above cannot
// catch an inverted SIGN -- inverting deviation to (target - actual) / target
// made 2029 read +76.1% ("the model overshoots Dylan") when the model
// actually undershoots by that much. Pin both the sign and the formula.
test('calibration deviation sign is (actual - target) / target, not inverted', () => {
  const rows = calibrationRows(run, CALIBRATION_TARGETS);
  const gw2029 = rows.find(r => r.id === 'gw2029');
  assert.ok(gw2029.actual < gw2029.target, 'sanity check: 2029 undershoots at DEFAULT_INPUTS');
  assert.ok(gw2029.deviation < 0,
    `the model undershoots 2029, so deviation must be NEGATIVE, got ${gw2029.deviation}`);
  const expected = (gw2029.actual - gw2029.target) / gw2029.target;
  assert.ok(Math.abs(gw2029.deviation - expected) < 1e-9,
    `deviation ${gw2029.deviation} != (actual - target) / target = ${expected}`);
});

// I4 fix (final review): reads each target's `actual` against the field the
// calibration target is actually documented to mean (targetActual's switch
// in render.js), reconstructed independently here so a swapped case (e.g.
// capex2028 silently reading cumulativeCapex instead of capex) is caught.
test('every calibration row reads its documented field, not a swapped one', () => {
  const rows = calibrationRows(run, CALIBRATION_TARGETS);
  const y = Object.fromEntries(run.map(yy => [yy.year, yy]));
  const expectedField = {
    gw2026: y[2026].newGw, gw2027: y[2027].newGw, gw2028: y[2028].newGw, gw2029: y[2029].newGw,
    cumGw2028: y[2028].cumulativeGw,
    capex2028: y[2028].capex,
    capexPerGw2026: y[2026].capexPerGw, capexPerGw2028: y[2028].capexPerGw,
    price2028: y[2028].computePrice,
    cumCapex2029: y[2029].cumulativeCapex,
    cumCredit2029: y[2029].cumulativeCredit,
    labShare2028: y[2028].labShareOfNew,
  };
  for (const r of rows) {
    assert.equal(r.actual, expectedField[r.id], `${r.id}: actual reads the wrong field`);
  }
});

// I4 fix (final review): fmtPct dropping its ×100 rendered 52% as "1%"
// (0.52.toFixed(0) rounds to "1").
test('fmtPct multiplies by 100 before formatting', () => {
  assert.equal(fmtPct(0.52), '52%');
  assert.notEqual(fmtPct(0.52), '1%');
});

test('calibration output declares each target units basis', () => {
  const html = calibrationHtml(run, CALIBRATION_TARGETS);
  assert.ok(html.includes('itLoad') || html.includes('IT load'), 'basis must be visible');
});

// I5 fix (final review): the page header used to hardcode "disagrees ... in
// two places" while 5 of 12 targets actually fail at DEFAULT_INPUTS, and all
// four out-of-sample validators (spec:758) are among the failures. The panel
// must state real counts, computed from the same rows it renders, not a
// number that can go stale the moment sliders move.
test('calibration panel states the real pass/fail count, not a hardcoded one', () => {
  const { calibrationSummary } = require('../docs/js/render.js');
  const rows = calibrationRows(run, CALIBRATION_TARGETS);
  const s = calibrationSummary(rows);
  assert.equal(s.total, 12);
  assert.equal(s.passing, 7, 'at DEFAULT_INPUTS/seed 12345, 7 of 12 targets pass');
  assert.equal(s.failing, 5, 'at DEFAULT_INPUTS/seed 12345, 5 of 12 targets fail');
  assert.equal(s.validatorsTotal, 4, 'spec:758 designates exactly 4 out-of-sample validators');
  assert.equal(s.validatorsPassing, 0, 'none of the 4 out-of-sample validators pass at DEFAULT_INPUTS');

  const html = calibrationHtml(run, CALIBRATION_TARGETS);
  assert.ok(html.includes('7 of 12'), 'the passing count must be visible in the rendered panel');
  assert.ok(/0 of 4/.test(html), 'the out-of-sample validator count must be stated plainly, not hidden');
});

test('ladder top rung is flagged as non-scaling', () => {
  const rungs = ladderRungs(run[0]);
  const top = rungs[rungs.length - 1];
  assert.equal(top.scales, false, 'the Jane Street rung is a marginal rate');
  assert.ok(top.warn && top.warn.length > 0);
});

// CORRECTION 1: the brief's implementation sorted this array, making the
// assertion below tautological. With the sort removed, this is a real claim
// about the model. It could legitimately fail under a different slider
// combination; that is the point.
//
// I2 fix (final review): this used to check `run[0]` (2026) only. The old
// flat `computePrice * 2.2` scarcity rung inverted past lab revenue in 2028
// and 2030 at DEFAULT_INPUTS/seed 12345 -- a single-year check could not have
// caught it. Every simulated year must hold, not just the first.
test('ladder rungs ascend from cost to end-user, every simulated year', () => {
  for (const y of run) {
    const rungs = ladderRungs(y);
    for (let i = 1; i < rungs.length; i++) {
      assert.ok(rungs[i].value >= rungs[i - 1].value,
        `${y.year}: rung ${rungs[i].id} (${rungs[i].value.toFixed(1)}) below ${rungs[i - 1].id} (${rungs[i - 1].value.toFixed(1)})`);
    }
  }
});

// I4 fix (final review): normalising sparklines to the LAST year instead of
// the FIRST inverts every one of them (a rail that got 4x more expensive
// would read as if it fell to a quarter of its start). Pin the direction.
test('margin sparkline normalises to the FIRST year, not the last', () => {
  const fake = run.map(y => ({ ...y, railPrice: { ...y.railPrice } }));
  fake[0].railPrice.servers = 10;
  fake[fake.length - 1].railPrice.servers = 40;
  const html = marginMigrationHtml(fake);
  assert.ok(html.includes('4.00x'),
    'the final ratio must be measured against the FIRST year (10), giving 40/10 = 4.00x');
  assert.ok(html.includes(`${fake[0].year}: 1.00x`),
    'the first year must read 1.00x against itself when normalised to the first year');
  assert.ok(!html.includes(`${fake[0].year}: 0.25x`),
    'the first year reading 0.25x (10/40) would mean normalisation used the LAST year instead');
});

test('renderers emit strings and never throw on a real run', () => {
  for (const fn of [() => stateTableHtml(run), () => ladderHtml(run[0]),
                    () => marginMigrationHtml(run), () => calibrationHtml(run, CALIBRATION_TARGETS)]) {
    const out = fn();
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0);
  }
});

// CORRECTION 2: diffusionBound is the single most valuable model output --
// lab revenue hitting the ceiling of what the economy can absorb -- and must
// be a visible marker on the affected year, not buried in a raw number.
//
// Fix round 3 (Task 11): fix rounds 1-2 (corrected captureRate, then the
// priceDamp smooth-tail fix) mean DEFAULT_INPUTS/seed 12345 now genuinely
// binds the diffusion ceiling in 2027-2029 -- this no longer needs a faked
// field to exercise. (I7 fix, final review: `clamped` ALSO genuinely fires
// at defaults, in 2029 -- see the dedicated test above. An earlier version of
// this comment claimed the opposite.)
test('diffusionBound is surfaced as a visible marker on the affected year', () => {
  const boundYears = run.filter(y => y.diffusionBound);
  assert.ok(boundYears.length > 0, 'DEFAULT_INPUTS should bind the diffusion ceiling in at least one real year');
  const html = stateTableHtml(run);
  assert.ok(html.includes('diffusion-bound'), 'a diffusion-bound year must be visibly flagged');
});

test('state table distinguishes the allocation price from the newly cleared price', () => {
  // Fix round 3 (Task 11): allocate() runs on the PRIOR year's price, not the
  // one emitted as computePrice -- an auditor reconciling labShareOfNew needs
  // both, labeled, or they'll recompute against the wrong number.
  const html = stateTableHtml(run);
  assert.ok(/alloc price/i.test(html), 'the allocation price must be labeled distinctly from the newly cleared price');
});

test('state table surfaces hoarderGot per year', () => {
  const html = stateTableHtml(run);
  assert.ok(/hoarder/i.test(html), 'hoarderGot must appear in the state table');
});

// CORRECTION 3: the 2029 GW target (95) is a deliberate miss at DEFAULT_INPUTS
// -- the calibration panel must explain why via impliedCreditDepthFor, not
// just flag red.
//
// C1 fix (final review): this test USED to require the explanation to say
// "memory" and "23.1" -- i.e. it pinned the false cause in place. 2029's memory
// ceiling is 87.0 GW; the 22.7 GW cap has nothing to do with memory. The
// explanation must now name the demand collapse, and must NOT name a supply
// rail.
//
// I8 fix: the seed is threaded through so the explanation describes the SAME
// draw as the `actual` column beside it (seed 12345 -> 22.7; the old unseeded
// call used makeRng(1) -> 23.1).
test('calibration panel explains an unreachable GW miss as demand-limited, naming no supply rail', () => {
  const rows = calibrationRows(run, CALIBRATION_TARGETS, DEFAULT_INPUTS, 12345);
  const miss = rows.find(r => r.id === 'gw2029');
  assert.equal(miss.pass, false, 'the 2029 GW target is a deliberate miss at DEFAULT_INPUTS');
  assert.ok(typeof miss.explanation === 'string' && miss.explanation.length > 0,
    'a missed GW target must carry an explanation');
  assert.ok(miss.explanation.includes('demand-limited'), 'must name the demand collapse');
  assert.ok(/monetize/.test(miss.explanation), 'must say WHY demand collapsed');
  for (const rail of ['memory', 'euv', 'package', 'power', 'capital']) {
    assert.ok(!miss.explanation.includes(rail),
      `must not blame '${rail}': 2029 sits below every supply ceiling`);
  }
  // The figure must match the displayed run, not a different draw.
  assert.ok(miss.explanation.includes('22.7'),
    `must surface the same GW the panel displays (${miss.actual.toFixed(1)}), got: ${miss.explanation}`);
  assert.ok(Math.abs(miss.actual - 22.7) < 0.05, `actual ${miss.actual}`);

  const html = calibrationHtml(run, CALIBRATION_TARGETS, DEFAULT_INPUTS, 12345);
  assert.ok(html.includes('unreachable'));
  assert.ok(html.includes('demand-limited'));
});

test('calibration explanation reports required credit depth when a miss is reachable', () => {
  // Confirmed at seed 12345: impliedCreditDepthFor(20, 2029, DEFAULT_INPUTS,
  // 12345) -> { reachable: true, creditMarketDepth: ~0, limitingRail: 'demand' }.
  // 20 GW sits just inside 2029's 22.7 GW of demand, and DEFAULT_INPUTS'
  // ecosystemCashFlow alone already funds it -- no credit-market depth needed.
  const reachableTarget = { id: 'gw2029', label: '2029 new GW (test)', source: 'test',
    basis: 'none', year: 2029, target: 20, tolerance: 0.01 };
  const rows = calibrationRows(run, [reachableTarget], DEFAULT_INPUTS, 12345);
  assert.equal(rows[0].pass, false);
  assert.ok(rows[0].explanation.includes('reachable at'), 'must state the reachable-branch framing');
  assert.ok(rows[0].explanation.includes('demand-limited'),
    'confirmed limitingRail for the 20GW/2029 case: even at zero credit depth, demand is what runs out');
});

// I8 fix (final review): a seed mismatch between the panel's numbers and its
// explanation is invisible unless something pins it. makeRng(1) yields 23.14 GW
// for the 2029 case where 12345 yields 22.70, so an unseeded call is detectable.
test('the miss explanation is computed from the seed it was given, not a default draw', () => {
  const at12345 = calibrationRows(run, CALIBRATION_TARGETS, DEFAULT_INPUTS, 12345)
    .find(r => r.id === 'gw2029').explanation;
  const at1 = calibrationRows(run, CALIBRATION_TARGETS, DEFAULT_INPUTS, 1)
    .find(r => r.id === 'gw2029').explanation;
  assert.notEqual(at12345, at1, 'the seed must actually reach impliedCreditDepthFor');
  assert.ok(at12345.includes('22.7'), at12345);
  assert.ok(at1.includes('23.1'), at1);
});

test('a passing GW target carries no miss explanation', () => {
  const rows = calibrationRows(run, CALIBRATION_TARGETS);
  const hit = rows.find(r => r.id === 'gw2026');
  assert.equal(hit.pass, true);
  assert.equal(hit.explanation, null);
});

// ---------------------------------------------------------------------------
// v2 port: Stock Sensitivity Matrix
// ---------------------------------------------------------------------------

test('matrix auto-selects the documented tab for each limiter', () => {
  assert.equal(matrixTabForLimiter('euv'), 'euv');
  assert.equal(matrixTabForLimiter('memory'), 'hbm');
  assert.equal(matrixTabForLimiter('package'), 'hbm');
  assert.equal(matrixTabForLimiter('power'), 'power');
  assert.equal(matrixTabForLimiter('capital'), 'demand');
  assert.equal(matrixTabForLimiter('demand'), 'demand');
});

test('a different limiter selects a different matrix tab', () => {
  assert.notEqual(matrixTabForLimiter('euv'), matrixTabForLimiter('power'));
  assert.notEqual(matrixTabForLimiter('memory'), matrixTabForLimiter('power'));
  assert.notEqual(matrixTabForLimiter('capital'), matrixTabForLimiter('euv'));
});

test('matrixHtml marks the active tab and renders that scenario\'s verbatim content', () => {
  const euvHtml = matrixHtml(run, MARKET_SCENARIOS, 'euv');
  assert.ok(/class="matrix-tab active" data-tab="euv"/.test(euvHtml), 'euv tab must be marked active');
  assert.ok(euvHtml.includes('TSMC (Pricing power, margin expansion)'), 'euv scenario content must render verbatim');
  assert.ok(!euvHtml.includes('SK Hynix'), 'must not render another tab\'s content');

  const powerHtml = matrixHtml(run, MARKET_SCENARIOS, 'power');
  assert.ok(/class="matrix-tab active" data-tab="power"/.test(powerHtml));
  assert.ok(powerHtml.includes('Independent Power Producers (CEG, VST)'));
  assert.notEqual(euvHtml, powerHtml, 'a different activeTab must change the rendered panel');
});

test('MARKET_SCENARIOS editorial content matches the extracted v2 source verbatim', () => {
  assert.deepEqual(Object.keys(MARKET_SCENARIOS).sort(), ['demand', 'euv', 'hbm', 'power'].sort());
  assert.equal(MARKET_SCENARIOS.demand.label, 'Monetization Tight (Jevons Failure)');
  assert.deepEqual(MARKET_SCENARIOS.hbm.winners,
    ['SK Hynix (First-mover advantage)', 'Micron (Margin catch-up)', 'Amkor (Advanced packaging)']);
});

test('railMarginExpansions ranks by last-year railPrice / rail.price2026, highest first', () => {
  const fakeLastYear = { year: 2030, railPrice: Object.fromEntries(RAILS.map(r => [r.id, r.price2026])) };
  const shellRail = RAILS.find(r => r.id === 'shell');
  fakeLastYear.railPrice.shell = shellRail.price2026 * 5; // force shell to expand most
  const ranked = railMarginExpansions([fakeLastYear]);
  assert.equal(ranked[0].id, 'shell', 'the rail with the largest last-year/price2026 ratio must rank first');
  assert.ok(ranked[0].ratio > ranked[1].ratio);
});

test('matrix panel annotates the rail with the largest margin expansion across the run', () => {
  const html = matrixHtml(run, MARKET_SCENARIOS, 'euv');
  const top = railMarginExpansions(run)[0];
  assert.ok(html.includes(top.label), 'the top-expansion rail must be named in the panel');
  assert.ok(html.includes(top.ratio.toFixed(2) + 'x'), 'the expansion ratio must be shown');
});

// ---------------------------------------------------------------------------
// v2 port: Anthropic vs OpenAI
// ---------------------------------------------------------------------------

test('the Anthropic/OpenAI split sums to labGw for every simulated year', () => {
  const split = labSplit(run);
  assert.equal(split.length, run.length);
  for (const s of split) {
    assert.ok(Math.abs((s.anthropicGw + s.openaiGw) - s.labGw) < 1e-9,
      `${s.year}: anthropicGw + openaiGw (${s.anthropicGw + s.openaiGw}) must equal labGw (${s.labGw})`);
  }
});

test('each share is applied to the right company, not swapped', () => {
  const split = labSplit(run);
  for (const s of split) {
    assert.ok(Math.abs(s.anthropicGw / s.labGw - 0.45) < 1e-9, `${s.year}: Anthropic must get the 45% share`);
    assert.ok(Math.abs(s.openaiGw / s.labGw - 0.55) < 1e-9, `${s.year}: OpenAI must get the 55% share`);
    assert.ok(s.openaiGw > s.anthropicGw, `${s.year}: OpenAI's larger share must yield the larger GW figure`);
  }
});

test('labGw trajectory matches v3\'s combined stock across 2026-2030', () => {
  const split = labSplit(run);
  const expected = [20.0, 54.5, 87.1, 87.1, 108.9];
  split.forEach((s, i) => assert.ok(Math.abs(s.labGw - expected[i]) < 0.1, `${s.year}: labGw ${s.labGw} != ~${expected[i]}`));
});

test('lab comparison panel shows the full trajectory, not just one year, and keeps v2\'s editorial text verbatim', () => {
  const html = labComparisonHtml(run);
  for (const y of run) assert.ok(html.includes(`${y.year} GW`), `missing ${y.year} in the GW trajectory`);
  assert.ok(html.includes('Anthropic') && html.includes('OpenAI'));
  assert.ok(html.includes('$19B ARR') && html.includes('$25B ARR'));
  assert.ok(html.includes('Locked 5-year deals with CoreWeave, Oracle, SoftBank'), 'OpenAI strategy text must be verbatim');
  assert.ok(html.includes('Best model but compute-constrained'), 'Anthropic strategy text must be verbatim');
  assert.ok(html.includes('~10x annual growth') && html.includes('~3x annual growth'), 'ARR trajectory notes must be verbatim');
  assert.ok(/editorial/i.test(html), 'the split must be labelled editorial, not model output');
});

// ---------------------------------------------------------------------------
// v2 port: Per-Gigawatt Economics -- the amortization result
// ---------------------------------------------------------------------------

test('amortization ratio is ~1.57% at DEFAULT_INPUTS 2026, per the spec\'s stated finding', () => {
  const info = perGwEconomics(run[0]);
  assert.ok(Math.abs(info.fabCapex - 6.0) < 0.01, `fab capex ${info.fabCapex} should be ~$6B`);
  assert.ok(Math.abs(info.amortizedFabPerGw - 0.6) < 0.01, `amortized fab capex ${info.amortizedFabPerGw} should be ~$0.6B/GW`);
  assert.ok(Math.abs(info.allInPerGw - 38.1) < 0.1, `all-in capexPerGw ${info.allInPerGw} should be ~$38.1B/GW`);
  assert.ok(Math.abs(info.ratio - 0.0157) < 0.001, `ratio ${info.ratio} should be ~1.57%`);
});

test('the amortization ratio is computed from annuity rails, not hardcoded', () => {
  const before = perGwEconomics(run[0]).ratio;
  const otherWfe = RAILS.find(r => r.id === 'otherWfe');
  const original = otherWfe.price2026;
  otherWfe.price2026 = original + 10; // materially bump fab capex
  try {
    const after = perGwEconomics(run[0]).ratio;
    assert.notEqual(after, before, 'changing an annuity rail\'s price2026 must move the ratio -- a hardcoded 6.0 would not react');
    assert.ok(after > before, 'raising fab capex must raise the ratio');
  } finally {
    otherWfe.price2026 = original; // RAILS is shared module state -- always restore
  }
});

test('the amortization ratio excludes optics (a child of euv, not a top-level fab-capex component)', () => {
  const before = perGwEconomics(run[0]).ratio;
  const optics = RAILS.find(r => r.id === 'optics');
  const original = optics.price2026;
  optics.price2026 = original + 1000; // an enormous bump; must have zero effect if correctly excluded
  try {
    const after = perGwEconomics(run[0]).ratio;
    assert.equal(after, before, 'optics is a child of euv and must not be double-counted into fab capex');
  } finally {
    optics.price2026 = original;
  }
});

test('per-GW economics panel labels both bases explicitly so the ratio cannot be mistaken for a sum', () => {
  const html = perGwEconomicsHtml(run[0]);
  assert.ok(/annuity basis/i.test(html), 'the annuity basis must be labelled');
  assert.ok(/perGw basis|per GW basis/i.test(html), 'the perGw basis must be labelled');
  assert.ok(html.includes('1.57%') || html.includes('1.6%') || /ratio/i.test(html), 'the ratio must be surfaced');
  assert.ok(html.includes('$6.0B'), 'fab capex must be shown');
  assert.ok(!/leverage ratio/i.test(html), 'v1/v2\'s broken "leverage ratio" must not be ported');
  assert.ok(!/revenueGw \/ \(1 - margin\)/.test(html), 'v1/v2\'s broken labRevPerGw formula must not be ported');
});

// ---------------------------------------------------------------------------
// v2 port: Bottleneck Severity
// ---------------------------------------------------------------------------

test('bottleneck segment widths track railTightness', () => {
  const base = { railTightness: { euv: 1, memory: 1, package: 1, power: 1 } };
  const changed = { railTightness: { euv: 3, memory: 1, package: 1, power: 1 } };
  const pctBase = bottleneckSegments(base).find(s => s.id === 'euv').pct;
  const pctChanged = bottleneckSegments(changed).find(s => s.id === 'euv').pct;
  assert.notEqual(pctBase, pctChanged, 'raising euv tightness must change its segment width');
  assert.ok(pctChanged > pctBase, 'raising euv tightness must increase its share of the bar');
});

test('bottleneck segments dim exactly the rails with tightness below 1', () => {
  const y = { railTightness: { euv: 0.5, memory: 2, package: 1.5, power: 1 } };
  const segs = bottleneckSegments(y);
  assert.equal(segs.find(s => s.id === 'euv').loose, true);
  assert.equal(segs.find(s => s.id === 'memory').loose, false);
  assert.equal(segs.find(s => s.id === 'package').loose, false);
  assert.equal(segs.find(s => s.id === 'power').loose, false, 'tightness exactly 1 is not slack');
});

test('bottleneck panel renders for every real simulated year without throwing, and does not reintroduce labor/permitting sliders', () => {
  for (const y of run) {
    const html = bottleneckHtml(y);
    assert.equal(typeof html, 'string');
    assert.ok(html.length > 0);
    assert.ok(!/labor/i.test(html), 'v2\'s laborSeverity slider must not be ported');
    assert.ok(!/permit/i.test(html), 'v2\'s permitSeverity slider must not be ported');
  }
});

test('bottleneck panel excludes capital -- it is a financial ceiling, not a physical one', () => {
  const html = bottleneckHtml(run[0]);
  assert.ok(!/seg-capital/.test(html));
});

// ---------------------------------------------------------------------------
// v2 port: Diffusion (Jevons) Reality Check
// ---------------------------------------------------------------------------

test('diffusion panel marks exactly the years where diffusionBound is true', () => {
  const rows = diffusionRows(run);
  for (const r of rows) {
    const y = run.find(x => x.year === r.year);
    assert.equal(r.diffusionBound, y.diffusionBound, `${r.year}: diffusionBound must match the engine's own flag`);
  }
  const boundYears = rows.filter(r => r.diffusionBound).map(r => r.year);
  assert.deepEqual(boundYears, [2027, 2028, 2029], 'DEFAULT_INPUTS/seed 12345 binds the ceiling in 2027-2029');

  const html = diffusionHtml(run);
  for (const r of rows) {
    const expected = `data-year="${r.year}" data-diffusion-bound="${r.diffusionBound}"`;
    assert.ok(html.includes(expected), `${r.year} must be marked data-diffusion-bound="${r.diffusionBound}"`);
  }
});

test('diffusion panel states the mechanism: headroom, and what binding means for demand', () => {
  const html = diffusionHtml(run);
  assert.ok(/headroom/i.test(html));
  assert.ok(/willingness-to-pay/i.test(html) || /clearing price/i.test(html));
  assert.ok(html.includes('22.7'), 'must connect the mechanism to the 2029 finding');
});

test('renderers for the five ported panels emit strings and never throw on a real run', () => {
  const activeTab = matrixTabForLimiter(run[0].limiter);
  for (const fn of [
    () => matrixHtml(run, MARKET_SCENARIOS, activeTab),
    () => labComparisonHtml(run),
    () => perGwEconomicsHtml(run[0]),
    () => bottleneckHtml(run[0]),
    () => diffusionHtml(run),
  ]) {
    const out = fn();
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0);
  }
});
