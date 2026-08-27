const { test } = require('node:test');
const assert = require('node:assert');
const { initialState, stepCapital, termPremium, creditCapacity } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS } = require('../docs/js/presets.js');

test('term premium rises with cumulative credit', () => {
  assert.ok(termPremium(2.0) > termPremium(0.5));
  assert.ok(termPremium(0) >= 0);
});

test('credit is only what cash flow cannot cover', () => {
  const s = initialState(DEFAULT_INPUTS);
  const small = stepCapital(s, DEFAULT_INPUTS, 100);
  assert.equal(small.credit, 0, 'cheap year fully cash-funded');
  const big = stepCapital(s, DEFAULT_INPUTS, 5000);
  assert.ok(big.credit > 0, 'expensive year needs debt');
});

test('NEGATIVE FEEDBACK: heavy borrowing raises the rate', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.cumulativeCredit = 4000;
  const stressed = stepCapital(s, DEFAULT_INPUTS, 3000);
  assert.ok(stressed.rate > DEFAULT_INPUTS.baseRate, 'rate must respond to credit demand');
});

test('credit capacity is RATIONED by price, not expanded by it', () => {
  const cheap = creditCapacity(0.05, DEFAULT_INPUTS);
  const dear = creditCapacity(0.12, DEFAULT_INPUTS);
  assert.ok(dear < cheap, 'higher rates must shrink absorbable credit — "the market won\'t want them to"');
});

test('the loop converges rather than exploding', () => {
  let s = initialState(DEFAULT_INPUTS);
  for (let i = 0; i < 20; i++) {
    const r = stepCapital(s, DEFAULT_INPUTS, 3000);
    s.cumulativeCredit = r.cumulativeCredit;
    s.rate = r.rate;
    s.availableCapital = r.availableCapital;
    assert.ok(Number.isFinite(s.rate) && s.rate < 1.0, `rate diverged to ${s.rate} at iter ${i}`);
    assert.ok(s.availableCapital >= 0, `negative capital at iter ${i}`);
  }
});
