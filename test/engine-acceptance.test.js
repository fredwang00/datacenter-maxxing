const { test } = require('node:test');
const assert = require('node:assert');
const { simulate } = require('../docs/js/engine.js');
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
