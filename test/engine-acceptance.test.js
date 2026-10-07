const { test } = require('node:test');
const assert = require('node:assert/strict');
const { simulate, impliedCreditDepthFor } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS, PRESETS, CALIBRATION_TARGETS } = require('../docs/js/presets.js');

function checkRun(run) {
  assert.deepEqual(run.map(y => y.year), [2026, 2027, 2028, 2029, 2030]);
  for (const y of run) {
    for (const [key, value] of Object.entries(y)) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key}=${value}`);
    assert.ok(y.newGw >= 0 && y.newGw <= Math.min(...Object.values(y.ceilings)) + 1e-7);
    assert.ok(y.capexPerGw > 0 && y.computePrice >= DEFAULT_INPUTS.floorCost);
    assert.ok(y.rate > 0 && y.rate < 1);
    assert.ok(y.labShareOfNew >= 0 && y.labShareOfNew <= 1);
    assert.ok(y.providerRevenuePerCommercialMw <= y.providerRevenuePoolPerMw + 1e-8);
  }
}

test('all presets and regulatory draws yield finite capacity-conserving runs', () => {
  for (const preset of Object.values(PRESETS)) for (const seed of [1, 7, 42, 12345]) checkRun(simulate({ ...DEFAULT_INPUTS, ...preset }, seed));
});

test('supply and funding slider extremes remain finite', () => {
  for (const [key, values] of Object.entries({ aiPct: [.3,.9], logicWafersPerGw: [20000,55000],
    baseRate: [.03,.12], creditMarketDepth: [400,6000], regStopProbability: [0,1] })) {
    for (const value of values) checkRun(simulate({ ...DEFAULT_INPUTS, [key]: value }, 7));
  }
});

test('segment adoption and budget extremes remain finite', () => {
  for (const segment of DEFAULT_INPUTS.demandSegments) {
    const ranges = segment.valueShare ? { adoptionRate: [0,1], adoptionGrowth: [0,3], spendingShare: [0,1], migrationRate: [0,1], reboundElasticity: [0,1], efficiencyGain: [0,.99] }
      : { budgetB: [0,10000], budgetGrowth: [0,3] };
    for (const [key, values] of Object.entries(ranges)) for (const value of values) {
      const demandSegments = DEFAULT_INPUTS.demandSegments.map(s => s.id === segment.id ? { ...s, [key]: value } : s);
      checkRun(simulate({ ...DEFAULT_INPUTS, demandSegments }, 7));
    }
  }
});

test('funding diagnostic solves a reachable build using first-year construction cost', () => {
  const result = impliedCreditDepthFor(10, 2026, { ...DEFAULT_INPUTS, addressableValueB: 420000, ecosystemCashFlow: 0, creditMarketDepth: 50 }, 12345);
  assert.equal(result.reachable, true);
  assert.equal(result.limitingRail, 'capital');
  assert.ok(Math.abs(result.creditMarketDepth - 382) < 1e-5); // 10 GW × $38.2B/GW
});

test('credit cannot override physical or final-use limits', () => {
  const result = impliedCreditDepthFor(100, 2026, DEFAULT_INPUTS, 12345);
  assert.equal(result.reachable, false);
  assert.ok(result.maxGw < 30);
  assert.equal(result.limitingRail, 'demand');
});

test('historical targets remain comparisons, not requirements to reproduce the old forecast', () => {
  const run = simulate(DEFAULT_INPUTS, 12345);
  for (const t of CALIBRATION_TARGETS) assert.ok(run.some(y => y.year === t.year));
  assert.equal(CALIBRATION_TARGETS.find(t => t.id === 'gw2029').target, 95);
});
