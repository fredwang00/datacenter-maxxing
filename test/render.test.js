const { test } = require('node:test');
const assert = require('node:assert');
const { stateTableHtml, calibrationRows, calibrationHtml, ladderRungs, ladderHtml,
        marginMigrationHtml, fmtPct,
        matrixTabForLimiter, railMarginExpansions, matrixHtml,
        labSplit, labComparisonHtml,
        fabCapexPerGwYr, perGwEconomics, perGwEconomicsHtml,
        bottleneckSegments, bottleneckHtml,
        providerRevenueRows, providerRevenueHtml } = require('../docs/js/render.js');
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

test('fmtPct multiplies by 100 before formatting', () => {
  assert.equal(fmtPct(0.52), '52%');
  assert.notEqual(fmtPct(0.52), '1%');
});

test('calibration output declares each target units basis', () => {
  const html = calibrationHtml(run, CALIBRATION_TARGETS);
  assert.ok(html.includes('itLoad') || html.includes('IT load'), 'basis must be visible');
});

test('calibration summary counts passes from data rather than a fixed forecast', () => {
  const { calibrationSummary } = require('../docs/js/render.js');
  const summary = calibrationSummary([{ pass: true, outOfSample: true }, { pass: false }, { pass: false, outOfSample: true }]);
  assert.deepEqual(summary, { total: 3, passing: 1, failing: 2, validatorsTotal: 2, validatorsPassing: 1 });
  const targets = [{ id: 'gw2026', year: 2026, target: 10, tolerance: 0.01, label: 'GW', basis: 'none' },
    { id: 'gw2027', year: 2027, target: 10, tolerance: 0.01, label: 'GW', basis: 'none' }];
  const html = calibrationHtml([{ year: 2026, newGw: 10 }, { year: 2027, newGw: 20 }], targets);
  assert.ok(html.includes('1 of 2'));
});

test('ladder top rung is flagged as non-scaling', () => {
  const rungs = ladderRungs(run[0]);
  const top = rungs[rungs.length - 1];
  assert.equal(top.scales, false, 'the Jane Street rung is a marginal rate');
  assert.ok(top.warn && top.warn.length > 0);
});

test('economic rates keep provider revenue below rental price when the scenario says so', () => {
  const rungs = ladderRungs({ ...run[0], providerRevenuePerCommercialMw: 3, computePrice: 25 });
  assert.equal(rungs.find(r => r.id === 'lab').value, 3);
  assert.equal(rungs.find(r => r.id === 'rental').value, 25);
  assert.ok(rungs.find(r => r.id === 'scarcity').value >= 25);
});

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

test('state table labels provider revenue separately from lab ownership', () => {
  const html = stateTableHtml(run);
  assert.ok(html.includes('Lab-owned GW'));
  assert.ok(html.includes('Provider $/commercial MW'));
});

test('state table distinguishes the allocation price from the newly cleared price', () => {
  const html = stateTableHtml(run);
  assert.ok(/alloc price/i.test(html), 'the allocation price must be labeled distinctly from the newly cleared price');
});

test('state table surfaces hoarderGot per year', () => {
  const html = stateTableHtml(run);
  assert.ok(/hoarder/i.test(html), 'hoarderGot must appear in the state table');
});

test('source-comparison miss names segment budgets rather than blaming a supply rail', () => {
  const miss = calibrationRows(run, CALIBRATION_TARGETS, DEFAULT_INPUTS, 12345).find(r => r.id === 'gw2029');
  assert.equal(miss.pass, false);
  assert.ok(miss.explanation.includes('demand-limited'));
  assert.ok(miss.explanation.includes('segment budgets'));
  assert.ok(miss.explanation.includes(miss.actual.toFixed(1)));
  assert.ok(!miss.explanation.includes('memory-bound'));
});

test('source-comparison explanation reports reachable credit requirement', () => {
  const inputs = { ...DEFAULT_INPUTS, addressableValueB: 420000, ecosystemCashFlow: 0, creditMarketDepth: 50 };
  const limited = simulate(inputs, 12345);
  const target = { id: 'gw2026', label: 'GW', basis: 'none', year: 2026, target: 10, tolerance: 0.01 };
  const row = calibrationRows(limited, [target], inputs, 12345)[0];
  assert.ok(row.explanation.includes('$382.0B/yr'));
  assert.ok(row.explanation.includes('capital-bound'));
});

test('source-comparison explanations use the same seed as the displayed run', () => {
  const first = simulate(DEFAULT_INPUTS, 1);
  const second = simulate(DEFAULT_INPUTS, 12345);
  const a = calibrationRows(first, CALIBRATION_TARGETS, DEFAULT_INPUTS, 1).find(r => r.id === 'gw2029');
  const b = calibrationRows(second, CALIBRATION_TARGETS, DEFAULT_INPUTS, 12345).find(r => r.id === 'gw2029');
  assert.ok(a.explanation.includes(a.actual.toFixed(1)));
  assert.ok(b.explanation.includes(b.actual.toFixed(1)));
  assert.notEqual(a.explanation, b.explanation);
});

test('a passing source-comparison target carries no miss explanation', () => {
  const target = { id: 'gw2026', label: 'GW', year: 2026, target: 10, tolerance: 0.01 };
  const row = calibrationRows([{ year: 2026, newGw: 10 }], [target])[0];
  assert.equal(row.pass, true);
  assert.equal(row.explanation, null);
});


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

test('lab comparison consumes ownership capacity without substituting commercial workload GW', () => {
  const rows = labSplit([{ year: 2026, labGw: 10 }, { year: 2027, labGw: 20 }]);
  assert.equal(rows[0].anthropicGw, 4.5);
  assert.equal(rows[1].anthropicGw, 9);
  assert.equal(rows[1].openaiGw, 11);
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


test('fab amortization uses its own annuity basis and the supplied construction cost', () => {
  const info = perGwEconomics({ ...run[0], capexPerGw: 40 });
  assert.ok(Math.abs(info.fabCapex - 6) < 1e-8);
  assert.ok(Math.abs(info.amortizedFabPerGw - 0.6) < 1e-8);
  assert.ok(Math.abs(info.ratio - 0.015) < 1e-8);
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


test('provider diagnostic shows the regulatory reduction without claiming a demand ceiling', () => {
  const fixture = [{ year: 2026, providerRevenuePerCommercialMw: 8, providerRevenuePoolPerMw: 10, commercialCapacityShare: 0.6 }];
  const rows = providerRevenueRows(fixture);
  assert.equal(rows[0].regulatoryReductionMw, 2);
  const html = providerRevenueHtml(fixture);
  assert.ok(html.includes('$8.0M') && html.includes('$10.0M') && html.includes('$2.0M'));
  assert.ok(html.includes('60%'));
});

test('provider diagnostic explains its limited interpretation', () => {
  const html = providerRevenueHtml(run);
  assert.ok(html.includes('not a market-wide price ceiling'));
  assert.ok(html.includes('separate compute budgets'));
});

test('renderers for the five ported panels emit strings and never throw on a real run', () => {
  const activeTab = matrixTabForLimiter(run[0].limiter);
  for (const fn of [
    () => matrixHtml(run, MARKET_SCENARIOS, activeTab),
    () => labComparisonHtml(run),
    () => perGwEconomicsHtml(run[0]),
    () => bottleneckHtml(run[0]),
    () => providerRevenueHtml(run),
  ]) {
    const out = fn();
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0);
  }
});
