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

test('state table shows the binding constraint per year', () => {
  const html = stateTableHtml(run);
  for (const y of run) assert.ok(html.toLowerCase().includes(y.binding.toLowerCase()));
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

test('ladder top rung is flagged as non-scaling', () => {
  const rungs = ladderRungs(run[0]);
  const top = rungs[rungs.length - 1];
  assert.equal(top.scales, false, 'the Jane Street rung is a marginal rate');
  assert.ok(top.warn && top.warn.length > 0);
});

// CORRECTION 1: the brief's implementation sorted this array, making the
// assertion below tautological. With the sort removed, this is a real claim
// about the model -- verified across all five simulated years at
// DEFAULT_INPUTS/seed 12345 (see the comment on ladderRungs). It could
// legitimately fail under a different slider combination; that is the point.
test('ladder rungs ascend from cost to end-user', () => {
  const rungs = ladderRungs(run[0]);
  for (let i = 1; i < rungs.length; i++) {
    assert.ok(rungs[i].value >= rungs[i-1].value, `rung ${rungs[i].id} below ${rungs[i-1].id}`);
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
test('diffusionBound is surfaced as a visible marker on the affected year', () => {
  const fake = run.map((y, i) => ({ ...y, diffusionBound: i === 2 }));
  const html = stateTableHtml(fake);
  assert.ok(html.includes('diffusion-bound'), 'a diffusion-bound year must be visibly flagged');
});

test('state table surfaces hoarderGot per year', () => {
  const html = stateTableHtml(run);
  assert.ok(/hoarder/i.test(html), 'hoarderGot must appear in the state table');
});

// CORRECTION 3: the 2029 GW target (95) is a deliberate miss at DEFAULT_INPUTS
// -- the model produces 59.4 GW because capital binds. The calibration panel
// must explain why via impliedCreditDepthFor, not just flag red.
test('calibration panel explains an unreachable GW miss using impliedCreditDepthFor', () => {
  const rows = calibrationRows(run, CALIBRATION_TARGETS);
  const miss = rows.find(r => r.id === 'gw2029');
  assert.equal(miss.pass, false, 'the 2029 GW target is a deliberate miss at DEFAULT_INPUTS');
  assert.ok(typeof miss.explanation === 'string' && miss.explanation.length > 0,
    'a missed GW target must carry an explanation');
  assert.ok(miss.explanation.toLowerCase().includes('memory'), 'must name the limiting rail');
  assert.ok(miss.explanation.includes('86.3'), 'must surface the physical ceiling GW (confirmed: 86.32)');

  const html = calibrationHtml(run, CALIBRATION_TARGETS);
  assert.ok(html.includes('unreachable'));
  assert.ok(html.toLowerCase().includes('memory'));
});

test('calibration explanation reports required credit depth when a miss is reachable', () => {
  // Confirmed: impliedCreditDepthFor(80, 2029, DEFAULT_INPUTS) ->
  // { reachable: true, creditMarketDepth: 3321.5, limitingRail: 'capital' }.
  const reachableTarget = { id: 'gw2029', label: '2029 new GW (test)', source: 'test',
    basis: 'none', year: 2029, target: 80, tolerance: 0.01 };
  const rows = calibrationRows(run, [reachableTarget]);
  assert.equal(rows[0].pass, false);
  assert.ok(rows[0].explanation.includes('capital'), 'confirmed limitingRail for the 80GW/2029 case');
  assert.ok(rows[0].explanation.includes('3.3'), 'confirmed creditMarketDepth ~$3.3T/yr');
});

test('a passing GW target carries no miss explanation', () => {
  const rows = calibrationRows(run, CALIBRATION_TARGETS);
  const hit = rows.find(r => r.id === 'gw2026');
  assert.equal(hit.pass, true);
  assert.equal(hit.explanation, null);
});
