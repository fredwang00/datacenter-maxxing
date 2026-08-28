const { test } = require('node:test');
const assert = require('node:assert');
const { cumulativeEuvTools, euvCeilingGw, euvToolsPerGwFromWafers,
        DEFAULT_INPUTS, CALIBRATION_TARGETS, PRESETS } = require('../docs/js/presets.js');

test('EUV installed base uses tools through END of prior year', () => {
  assert.equal(cumulativeEuvTools(2026), 290, '2026 produces on tools installed by end-2025');
  assert.equal(cumulativeEuvTools(2027), 355, '290 + 65');
  assert.equal(cumulativeEuvTools(2028), 440, '290 + 65 + 85');
});

test('EUV ceiling reproduces the spec table', () => {
  const t = (y) => euvCeilingGw(y, 0.6, 3.5);
  assert.ok(Math.abs(t(2026) - 49.7) < 0.5, `2026 ${t(2026)}`);
  assert.ok(Math.abs(t(2027) - 60.9) < 0.5, `2027 ${t(2027)}`);
  assert.ok(Math.abs(t(2028) - 75.4) < 0.5, `2028 ${t(2028)}`);
});

test('EUV is slack in 2026-27 and only marginal in 2028', () => {
  assert.ok(euvCeilingGw(2026, 0.6, 3.5) > 30 * 1.5, '2026 comfortably slack vs 30 GW');
  const headroom2028 = euvCeilingGw(2028, 0.6, 3.5) / 70 - 1;
  assert.ok(headroom2028 > 0, '2028 still above demand');
  assert.ok(headroom2028 < 0.15, '2028 headroom is single-digit-ish, not comfortable');
});

test('euvToolsPerGw DERIVES from the wafer count — they are not independent', () => {
  assert.ok(Math.abs(euvToolsPerGwFromWafers(55000) - 3.5) < 0.01, 'Dylan default');
  const low = euvToolsPerGwFromWafers(20000);
  assert.ok(low < 1.5, `disputed low end should collapse the coefficient, got ${low}`);
});

test('the disputed low wafer count makes EUV irrelevant, not binding', () => {
  const low = euvCeilingGw(2028, 0.6, euvToolsPerGwFromWafers(20000));
  assert.ok(low > 150, `low wafer count should triple+ the ceiling, got ${low}`);
});

test('every calibration target declares its units basis', () => {
  for (const t of CALIBRATION_TARGETS) {
    assert.ok(['itLoad', 'facilityLoad', 'none'].includes(t.basis), `${t.id} basis "${t.basis}"`);
    assert.ok(t.source && t.label, `${t.id} missing source or label`);
  }
});

test('presets only override keys that exist in DEFAULT_INPUTS', () => {
  for (const [name, overrides] of Object.entries(PRESETS)) {
    for (const k of Object.keys(overrides)) {
      assert.ok(k in DEFAULT_INPUTS, `preset "${name}" sets unknown input "${k}"`);
    }
  }
});

test('F12: DEFAULT_INPUTS is frozen so a stray write cannot poison later simulate() calls', () => {
  const original = DEFAULT_INPUTS.hoarderBuildGw;
  // presets.js and this test file are both sloppy mode (no 'use strict'), so
  // a direct write to a frozen object fails SILENTLY rather than throwing --
  // assert the value is unchanged, not that an exception was thrown.
  DEFAULT_INPUTS.hoarderBuildGw = 999999;
  assert.equal(DEFAULT_INPUTS.hoarderBuildGw, original,
    'direct property assignment on DEFAULT_INPUTS must not stick');

  // Object.assign uses an internal [[Set]] that throws on a non-writable
  // property regardless of strict mode -- unlike the direct assignment
  // above, so we tolerate (not assert on) the throw here. Either way, the
  // outcome the finding cares about -- DEFAULT_INPUTS never actually
  // changes -- must hold.
  try {
    Object.assign(DEFAULT_INPUTS, { hoarderBuildGw: 12345 });
  } catch (e) { /* frozen objects may throw here; that's fine either way */ }
  assert.equal(DEFAULT_INPUTS.hoarderBuildGw, original,
    'Object.assign onto DEFAULT_INPUTS must never leave it changed');
});
