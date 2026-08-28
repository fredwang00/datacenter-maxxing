const { test } = require('node:test');
const assert = require('node:assert');
const { initialState, stepMonetization, diffusionCeiling, makeRng, regStopFactor } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS } = require('../docs/js/presets.js');

test('DIFFUSION CEILING BITES: revenue cannot exceed addressable value', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.labGw = 100;                 // Dylan's 2028 figure
  s.labRevPerMw = 70;            // and his revenue figure
  const cap = diffusionCeiling(s, DEFAULT_INPUTS);
  assert.ok(cap < 70, `at 100 GW x $70M/MW the ceiling must bind, got cap ${cap}`);
});

test('diffusion conflict is reported, not silently swallowed', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.labGw = 100;
  s.labRevPerMw = 70;
  const r = stepMonetization(s, DEFAULT_INPUTS, makeRng(1));
  assert.equal(r.diffusionBound, true, 'must flag that Dylan cannot have both numbers');
});

test('inference share declines — the non-consensus call', () => {
  const s = initialState(DEFAULT_INPUTS);
  const r = stepMonetization(s, DEFAULT_INPUTS, makeRng(1));
  assert.ok(r.inferenceShare < s.inferenceShare);
  assert.ok(r.inferenceShare > 0);
});

test('research compute compounds capability', () => {
  const s = initialState(DEFAULT_INPUTS);
  const r = stepMonetization(s, DEFAULT_INPUTS, makeRng(1));
  assert.ok(r.capability > s.capability);
});

test('regulatory stops are DISCRETE and seeded-reproducible', () => {
  const s = initialState(DEFAULT_INPUTS);
  const a = stepMonetization(s, DEFAULT_INPUTS, makeRng(42));
  const b = stepMonetization(s, DEFAULT_INPUTS, makeRng(42));
  assert.deepEqual(a, b, 'same seed must give the same run');
});

test('a regulatory freeze suppresses revenue per MW', () => {
  const s = initialState(DEFAULT_INPUTS);
  const free = stepMonetization(s, { ...DEFAULT_INPUTS, regStopProbability: 0, regDragSmooth: 0 }, makeRng(7));
  const frozen = stepMonetization(s, { ...DEFAULT_INPUTS, regStopProbability: 1, regDragSmooth: 0.3 }, makeRng(7));
  assert.ok(frozen.labRevPerMw < free.labRevPerMw);
});

test('wtpFraction rises toward the 0.5 Dylan describes', () => {
  const s = initialState(DEFAULT_INPUTS);
  const r = stepMonetization(s, DEFAULT_INPUTS, makeRng(1));
  assert.ok(r.wtpFraction > s.wtpFraction);
  assert.ok(r.wtpFraction <= 0.6);
});

test('regStopFactor is a discrete draw, not a smooth multiplier', () => {
  const inputs = { ...DEFAULT_INPUTS, regStopProbability: 0.25 };
  // Draw below the threshold -> a stop fires and suppresses revenue.
  assert.ok(regStopFactor(() => 0.10, inputs) < 1, 'a draw under the probability must fire a stop');
  // Draw above the threshold -> no stop, factor is exactly 1 (not merely < 1).
  assert.equal(regStopFactor(() => 0.90, inputs), 1, 'a draw over the probability must be a clean no-op');
  // At probability 0 no draw can ever fire; at 1 every draw must.
  assert.equal(regStopFactor(() => 0.001, { ...DEFAULT_INPUTS, regStopProbability: 0 }), 1);
  assert.ok(regStopFactor(() => 0.999, { ...DEFAULT_INPUTS, regStopProbability: 1 }) < 1);
});

test('regulatory stop channel alone suppresses revenue (independent of regDragSmooth)', () => {
  const s = initialState(DEFAULT_INPUTS);
  const noStop = stepMonetization(s, { ...DEFAULT_INPUTS, regStopProbability: 0, regDragSmooth: 0 }, makeRng(7));
  const withStop = stepMonetization(s, { ...DEFAULT_INPUTS, regStopProbability: 1, regDragSmooth: 0 }, makeRng(7));
  assert.ok(withStop.labRevPerMw < noStop.labRevPerMw, 'discrete reg stop alone must suppress revenue');
});

test('different seeds produce different monetization outcomes', () => {
  const s = initialState(DEFAULT_INPUTS);
  // regStopProbability strictly between 0 and 1 so the draw can actually differ.
  const inputs = { ...DEFAULT_INPUTS, regStopProbability: 0.5 };
  const outs = [1, 2, 3, 4, 5, 6, 7, 8].map(seed =>
    stepMonetization(s, inputs, makeRng(seed)).labRevPerMw);
  const distinct = new Set(outs.map(v => v.toFixed(6)));
  assert.ok(distinct.size > 1,
    `seeds must actually influence the outcome; all 8 gave ${outs[0]}`);
});
