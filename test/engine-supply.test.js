const { test } = require('node:test');
const assert = require('node:assert');
const { initialState, computeCeilings, bindingConstraint, limitingFactor,
        physicalCeiling, POWER_MODES } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS } = require('../docs/js/presets.js');

test('binding constraint is the argmin, computed not editorial', () => {
  assert.equal(bindingConstraint({ euv: 50, memory: 40, power: 12, capital: 80 }), 'power');
  assert.equal(bindingConstraint({ euv: 9, memory: 40, power: 12, capital: 80 }), 'euv');
});

// I3 fix (final review): `physicalCeiling` excluding `capital` is the exact fix
// that cost Task 9 a whole extra round -- financial scarcity must reduce the
// VOLUME built (supplyGw) but must never feed the rail-repricing tightness
// signal, or a credit crunch reprices HBM as if a fab went offline. Adding
// `ceilings.capital` back into this min passed 127/127 while moving 2030
// capexPerGw +21%, so the fix had zero direct coverage. It does now.
test('physicalCeiling EXCLUDES capital, even when capital is far the smallest ceiling', () => {
  const ceilings = { euv: 90, memory: 60, package: 100, power: 80, capital: 5 };
  assert.equal(physicalCeiling(ceilings), 60,
    'capital (5) must be ignored entirely; the physical min is memory at 60');
  // The value must be indifferent to capital, not merely larger than it.
  for (const capital of [0.01, 5, 1e9]) {
    assert.equal(physicalCeiling({ ...ceilings, capital }), 60,
      `physicalCeiling moved when only capital changed (capital=${capital}) -- ` +
      `financial scarcity is leaking into the physical repricing signal`);
  }
});

test('physicalCeiling is the min over exactly the four physical rails', () => {
  // Each rail in turn is made the smallest and must be picked up, proving none
  // of the four was accidentally dropped from the min.
  const base = { euv: 500, memory: 500, package: 500, power: 500, capital: 500 };
  for (const rail of ['euv', 'memory', 'package', 'power']) {
    assert.equal(physicalCeiling({ ...base, [rail]: 7 }), 7, `${rail} is not in the min`);
  }
});

// C1 fix (final review): the demand case. `bindingConstraint` above answers
// "which ceiling is lowest"; `limitingFactor` answers "what actually held the
// build down", which is a different question whenever demand undershoots.
test('limitingFactor reports demand when demand sits below every ceiling', () => {
  const ceilings = { euv: 94.3, memory: 87.0, package: 118.7, power: 111.7, capital: 60.3 };
  // The 2029-at-defaults shape: demand far below the lowest ceiling.
  assert.equal(limitingFactor(22.7, ceilings), 'demand');
  assert.equal(bindingConstraint(ceilings), 'capital',
    'sanity check: the old argmin would have blamed capital here -- that was C1');
});

test('limitingFactor reports the lowest ceiling when demand exceeds it', () => {
  const ceilings = { euv: 94.3, memory: 87.0, package: 118.7, power: 111.7, capital: 60.3 };
  assert.equal(limitingFactor(150, ceilings), 'capital');
  assert.equal(limitingFactor(90, ceilings), 'capital');
});

test('limitingFactor is demand at the exact boundary -- nothing was rationed', () => {
  const ceilings = { euv: 100, memory: 50, package: 100, power: 100, capital: 100 };
  assert.equal(limitingFactor(50, ceilings), 'demand',
    'demand == the lowest ceiling means every buyer was served; the ceiling did not bite');
  assert.equal(limitingFactor(50.0001, ceilings), 'memory');
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
