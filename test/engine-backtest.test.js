const { test } = require('node:test');
const assert = require('node:assert');
const { backtest } = require('../docs/js/engine.js');

test('BACKTEST: memory earns nothing on HBM in 2023', () => {
  const r = backtest();
  const y2023 = r.find(y => y.year === 2023);
  assert.ok(y2023.memoryMargin < y2023.logicMargin,
    'in 2023 all value sat at the fab and chip layer; memory made nothing on HBM');
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

test('BACKTEST: 2026 margins match disclosed real-world figures (SK hynix 76%, TSMC 67.7%)', () => {
  const r = backtest();
  const y2026 = r.find(y => y.year === 2026);

  // SK hynix Q2 2026 operating margin: 76% (disclosed)
  // TSMC Q2 2026 gross margin: 67.7% (disclosed)
  // The backtest should land within ~3pp of these figures.
  assert.ok(y2026.memoryMargin >= 0.72 && y2026.memoryMargin <= 0.79,
    `2026 memory margin ${(y2026.memoryMargin * 100).toFixed(1)}% should be within 3pp of SK hynix 76%`);
  assert.ok(y2026.logicMargin >= 0.647 && y2026.logicMargin <= 0.707,
    `2026 logic margin ${(y2026.logicMargin * 100).toFixed(1)}% should be within 3pp of TSMC 67.7%`);
});
