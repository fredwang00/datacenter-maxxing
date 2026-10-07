// Hypothetical rental-book diagnostics. Revenue coverage and payback are not
// profit, liquidity, or default models. $M/MW/year equals $B/GW/year.

const { test } = require('node:test');
const assert = require('node:assert');
const {
  simulate, spacexBook, spacexSummary, spacexPayback, coverableContractPrice,
  SPACEX_DEFAULTS, HOARDER_INTERNAL_VALUE,
} = require('../docs/js/engine.js');
const { DEFAULT_INPUTS, PRESETS } = require('../docs/js/presets.js');

const run = simulate(DEFAULT_INPUTS, 12345);

test('the contracted book accumulates by vintage and expires on term', () => {
  const rows = spacexBook(run, { gwPerYear: 4, termYears: 3, contractPriceMw: 50 });
  // 2026: 4, 2027: 8, 2028: 12, then the 2026 vintage rolls off at 3-year term.
  assert.equal(rows[0].bookGw, 4, '2026 book');
  assert.equal(rows[1].bookGw, 8, '2027 book');
  assert.equal(rows[2].bookGw, 12, '2028 book');
  assert.equal(rows[3].bookGw, 12, '2029: 2026 vintage expired, 2029 added');
  assert.equal(rows[4].bookGw, 12, '2030: steady state at term x gwPerYear');
});

test('a longer term accumulates a strictly larger book', () => {
  const short = spacexBook(run, { gwPerYear: 4, termYears: 2 });
  const long = spacexBook(run, { gwPerYear: 4, termYears: 5 });
  assert.ok(long[4].bookGw > short[4].bookGw,
    `5yr term (${long[4].bookGw}) must exceed 2yr term (${short[4].bookGw}) by 2030`);
  assert.equal(long[4].bookGw, 20, '5 vintages x 4 GW, none expired inside the horizon');
});

test('contract revenue is book x price, in $B/yr', () => {
  const rows = spacexBook(run, { gwPerYear: 4, termYears: 5, contractPriceMw: 50 });
  // $50M/MW/yr == $50B/GW/yr, so 4 GW under contract is $200B/yr.
  assert.ok(Math.abs(rows[0].revenueB - 200) < 1e-9, `got ${rows[0].revenueB}`);
  assert.ok(Math.abs(rows[4].revenueB - 20 * 50) < 1e-9, `got ${rows[4].revenueB}`);
});

test('COVERAGE: the customer must generate more per MW than it is contracted to pay', () => {
  const rows = spacexBook(run, { contractPriceMw: 50 });
  for (let i = 0; i < rows.length; i++) {
    const expected = run[i].providerRevenuePerCommercialMw / 50;
    assert.ok(Math.abs(rows[i].coverage - expected) < 1e-9,
      `${rows[i].year}: coverage should be providerRevenuePerCommercialMw/price`);
    assert.equal(rows[i].covered, expected >= 1, `${rows[i].year}: covered flag`);
  }
});

test('at $50M/MW the book is UNCOVERED in this model, every single year', () => {
  const s = spacexSummary(run, { contractPriceMw: 50 });
  assert.equal(s.yearsCovered, 0,
    'the illustrative commercial provider revenue proxy is below the assumed rent');
  assert.equal(s.yearsWithOperatingShortfall, 5);
  assert.ok(s.minCoverage < 0.6, `worst coverage should be badly short, got ${s.minCoverage}`);
});

test('a price the customer CAN cover flips the book to covered', () => {
  // The floor on customer revenue across the run is the max coverable price.
  const coverable = coverableContractPrice(run);
  const s = spacexSummary(run, { contractPriceMw: coverable });
  assert.equal(s.yearsWithOperatingShortfall, 0, `at $${coverable.toFixed(1)}M/MW every year should cover`);
  assert.ok(Math.abs(s.minCoverage - 1) < 1e-9, 'the binding year sits exactly at coverage 1.0');
});

test('coverableContractPrice is the MINIMUM customer revenue over the run, not the mean', () => {
  const coverable = coverableContractPrice(run);
  const min = Math.min(...run.map(y => y.providerRevenuePerCommercialMw));
  const mean = run.reduce((a, y) => a + y.providerRevenuePerCommercialMw, 0) / run.length;
  assert.ok(Math.abs(coverable - min) < 1e-9, 'must be the min');
  assert.ok(coverable < mean, 'and the min must be strictly below the mean here');
});

test('PAYBACK: revenue-basis payback is capexPerGw / contractPrice, in years', () => {
  const capex = run[0].capexPerGw;                  // $B/GW, one-time
  const years = spacexPayback(capex, 50);           // $M/MW/yr == $B/GW/yr
  assert.ok(Math.abs(years - capex / 50) < 1e-9);
  assert.ok(years < 1, `the bull case: sub-one-year revenue payback, got ${years.toFixed(2)}`);
});

test('PAYBACK is revenue-basis only -- it says nothing about whether the customer pays', () => {
  // Both books have an identical sub-1yr payback; only coverage separates them.
  const rich = spacexSummary(run, { contractPriceMw: 50 });
  const capex = run[0].capexPerGw;
  assert.ok(rich.revenuePaybackYears < 1, 'payback looks great');
  assert.equal(rich.yearsCovered, 0, 'but modeled AI revenue does not cover rent');
  assert.ok(Math.abs(rich.revenuePaybackYears - capex / 50) < 1e-9);
});

test('the illustrative internal-use value is below the assumed rental price', () => {
  const s = spacexSummary(run, { contractPriceMw: 50 });
  assert.equal(s.internalFallbackMw, HOARDER_INTERNAL_VALUE);
  assert.ok(HOARDER_INTERNAL_VALUE < 50,
    'the alternative-use assumption is below rent; it is not a guaranteed recovery');
  const rows = s.rows;
  assert.ok(rows[0].internalFallbackB < rows[0].revenueB,
    'falling back to internal use is a real haircut');
});

test('operating shortfall is the shortfall, zero when covered', () => {
  const rows = spacexBook(run, { contractPriceMw: 50, gwPerYear: 4, termYears: 5 });
  for (const r of rows) {
    if (r.covered) assert.equal(r.operatingShortfallB, 0);
    else assert.ok(Math.abs(r.operatingShortfallB - r.revenueB * (1 - r.coverage)) < 1e-9,
      `${r.year}: operating shortfall should be the uncovered fraction of revenue`);
  }
  const s = spacexSummary(run, { contractPriceMw: 50 });
  assert.ok(s.totalOperatingShortfallB > 0, 'a wholly uncovered book must report operating shortfall');
  assert.ok(s.totalOperatingShortfallB < s.totalRevenueB, 'but not more than the book itself');
});

test('a zero or negative contract price cannot produce Infinity or NaN downstream', () => {
  for (const p of [0, -10]) {
    const s = spacexSummary(run, { contractPriceMw: p });
    assert.ok(Number.isFinite(s.totalRevenueB), `price ${p}: revenue`);
    assert.ok(Number.isFinite(s.totalOperatingShortfallB), `price ${p}: shortfall`);
    assert.equal(s.yearsWithOperatingShortfall, 0, `price ${p}: nothing to cover, so no operating shortfall`);
  }
});

test('the provider-revenue sensitivity raises revenue coverage without asserting solvency', () => {
  const bull = simulate({ ...DEFAULT_INPUTS, ...PRESETS['spacex-bull'] }, 12345);
  const base = spacexSummary(run);
  const changed = spacexSummary(bull);
  assert.ok(changed.minCoverage > base.minCoverage);
  assert.ok(changed.totalOperatingShortfallB < base.totalOperatingShortfallB);
});

test('SPACEX_DEFAULTS carry the reported rate and a multi-year term', () => {
  assert.equal(SPACEX_DEFAULTS.contractPriceMw, 50, 'the reported SpaceX rate');
  assert.ok(SPACEX_DEFAULTS.termYears >= 3, 'these are multi-year contracts');
  assert.ok(SPACEX_DEFAULTS.gwPerYear > 0);
});

// Catches confusing rental expense shortfall with expected loss or profit.
test('operating shortfall measures only the modeled revenue gap', () => {
  const rows = spacexBook([
    { year: 2026, providerRevenuePerCommercialMw: 30 },
    { year: 2027, providerRevenuePerCommercialMw: 60 },
  ], { contractPriceMw: 50, gwPerYear: 2 });
  assert.equal(rows[0].revenueB, 100);
  assert.equal(rows[0].operatingShortfallB, 40);
  assert.equal(rows[1].operatingShortfallB, 0);
});
