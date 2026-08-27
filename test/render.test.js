const { test } = require('node:test');
const assert = require('node:assert');
const { stateTableHtml, calibrationRows, calibrationHtml, ladderRungs, ladderHtml,
        marginMigrationHtml } = require('../docs/js/render.js');
const { simulate } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS, CALIBRATION_TARGETS } = require('../docs/js/presets.js');

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
  assert.ok(stateTableHtml(fake).includes('clamped'), 'a clamped run signals bad parameters');
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
// field to exercise (unlike `clamped`, which genuinely never fires at
// defaults and is left as a fixture-based test).
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
