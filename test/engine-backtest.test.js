const { test } = require('node:test');
const assert = require('node:assert');
const { backtest } = require('../docs/js/engine.js');

test('BACKTEST: 2023 starting condition — memory near breakeven', () => {
  // This test encodes the 2023 starting condition (memoryPrice=1.4, memoryCost=1.3),
  // not the repricing mechanic. MEMORY_RESET_INTERVAL=2 guarantees memory's price
  // unchanged on year 1 regardless of tightness, elasticity, or STEP_GAIN, so
  // this asserts only the hardcoded constants, not repricing behavior. Worth keeping
  // because memory actually was near breakeven in 2023 — a real historical fact.
  const r = backtest();
  const y2023 = r.find(y => y.year === 2023);
  assert.ok(y2023.memoryMargin < y2023.logicMargin,
    'memory near breakeven; foundry fat — the 2023 baseline');
});

test('BACKTEST: memory margin overtakes foundry by 2026', () => {
  const r = backtest();
  const y2026 = r.find(y => y.year === 2026);
  assert.ok(y2026.memoryMargin > y2026.logicMargin,
    'a known shift the elasticities must reproduce, or they are wrong');
});

test('BACKTEST: the crossover happens once and sticks', () => {
  const r = backtest();
  const crossings = r.filter((y, i) =>
    i > 0 && (y.memoryMargin > y.logicMargin) !== (r[i-1].memoryMargin > r[i-1].logicMargin));
  assert.equal(crossings.length, 1, `expected one crossover, saw ${crossings.length}`);
});

test('BACKTEST: 2026 margins are consistent with disclosed actuals under current calibration', () => {
  // CONSISTENCY CHECK, not independent validation. The tightness table (2023–2025)
  // was reverse-engineered after already knowing the disclosed 2026 endpoints
  // (SK hynix 76%, TSMC 67.7%), so this test confirms our current calibration
  // is self-consistent, not that the elasticities are independently validated.
  //
  // **Critical sensitivity:** Memory's 2026 result stays within ±3pp of 76% ONLY
  // for STEP_GAIN in roughly [0.55, 0.70]. It fails (too high) at STEP_GAIN=0.50
  // and fails (too low) at STEP_GAIN=0.80. If Task 2 ever recalibrates STEP_GAIN
  // or MEMORY_RESET_INTERVAL, this tightness table will need re-tuning or this
  // test will break. This is a fixture, not a validation.
  const r = backtest();
  const y2026 = r.find(y => y.year === 2026);

  // SK hynix Q2 2026 operating margin: 76% (disclosed)
  // TSMC Q2 2026 gross margin: 67.7% (disclosed)
  // Symmetric ±3pp tolerance on both.
  assert.ok(y2026.memoryMargin >= 0.73 && y2026.memoryMargin <= 0.79,
    `2026 memory margin ${(y2026.memoryMargin * 100).toFixed(1)}% should be within ±3pp of SK hynix 76%`);
  assert.ok(y2026.logicMargin >= 0.647 && y2026.logicMargin <= 0.707,
    `2026 logic margin ${(y2026.logicMargin * 100).toFixed(1)}% should be within ±3pp of TSMC 67.7%`);
});
