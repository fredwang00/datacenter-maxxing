const { test } = require('node:test');
const assert = require('node:assert');
const { RAILS, railById, topLevelPerGwIds, sumPerGw, initialRailPrice } = require('../docs/js/rails.js');

test('perGw top-level rails sum to 38.2 $B/GW', () => {
  assert.ok(Math.abs(sumPerGw(initialRailPrice()) - 38.2) < 0.01);
});

test('servers children sum exactly to the servers parent', () => {
  const p = initialRailPrice();
  const kids = RAILS.filter(r => r.parent === 'servers');
  const kidSum = kids.reduce((a, r) => a + p[r.id], 0);
  assert.ok(Math.abs(kidSum - p.servers) < 0.01, `children ${kidSum} != parent ${p.servers}`);
});

test('annuity top-level rails sum to 6.0 $B per GW/yr', () => {
  const p = initialRailPrice();
  const total = RAILS
    .filter(r => r.parent === null && r.basis === 'annuity')
    .reduce((a, r) => a + p[r.id], 0);
  assert.ok(Math.abs(total - 6.0) < 0.01, `got ${total}`);
});

test('UNITS GUARD: summing an annuity rail into capexPerGw throws', () => {
  assert.throws(
    () => sumPerGw(initialRailPrice(), ['servers', 'euv']),
    /Units guard.*euv.*annuity/s
  );
});

test('every rail has a provenance tag', () => {
  for (const r of RAILS) {
    assert.ok(typeof r.provenance === 'string' && r.provenance.length > 0, `${r.id} missing provenance`);
  }
});

test('every parent reference resolves to a real rail', () => {
  for (const r of RAILS) {
    if (r.parent !== null) assert.ok(railById(r.parent), `${r.id} has dangling parent ${r.parent}`);
  }
});
