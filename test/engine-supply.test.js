const { test } = require('node:test');
const assert = require('node:assert');
const { initialState, computeCeilings, bindingConstraint, POWER_MODES } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS } = require('../docs/js/presets.js');

test('binding constraint is the argmin, computed not editorial', () => {
  assert.equal(bindingConstraint({ euv: 50, memory: 40, power: 12, capital: 80 }), 'power');
  assert.equal(bindingConstraint({ euv: 9, memory: 40, power: 12, capital: 80 }), 'euv');
});

test('EUV is NOT the 2026 binding constraint — this is the v1 bug corrected', () => {
  const s = initialState(DEFAULT_INPUTS);
  const c = computeCeilings(s, DEFAULT_INPUTS, 2026);
  assert.ok(c.euv > 45, `EUV ceiling should be ~50 GW/yr, got ${c.euv}`);
  assert.notEqual(bindingConstraint(c), 'euv', 'v1 claimed EUV binds at ~12 GW/yr; it does not');
});

test('capital ceiling is availableCapital / capexPerGw', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.availableCapital = 1000;
  s.capexPerGw = 40;
  const c = computeCeilings(s, DEFAULT_INPUTS, 2026);
  assert.ok(Math.abs(c.capital - 25) < 0.01, `got ${c.capital}`);
});

test('power mode changes both cost and lead time', () => {
  assert.ok(POWER_MODES.ccgt.pricePerGw > POWER_MODES.grid.pricePerGw);
  assert.ok(POWER_MODES.nuclear.pricePerGw > POWER_MODES.ccgt.pricePerGw);
  assert.equal(POWER_MODES.ccgt.leadYears, 5, 'GE Vernova is quoting 2031 delivery');
  assert.ok(POWER_MODES.nuclear.leadYears > POWER_MODES.ccgt.leadYears);
});

// Recurses into nested plain objects (pipeline.memory[2028], railPrice.power,
// stepStates.memory.pressure, ...) so a NaN or undefined buried below the
// top level can't slip past Object.entries(s).
function assertNoNaNOrUndefined(value, path) {
  assert.notEqual(value, undefined, `${path} undefined`);
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} is ${value}`);
  } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      assertNoNaNOrUndefined(v, `${path}.${k}`);
    }
  }
}

test('initial state has no NaN or undefined fields, including nested objects', () => {
  const s = initialState(DEFAULT_INPUTS);
  for (const [k, v] of Object.entries(s)) {
    assertNoNaNOrUndefined(v, k);
  }
});
