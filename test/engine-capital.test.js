const { test } = require('node:test');
const assert = require('node:assert');
const { initialState, stepCapital, termPremium, creditCapacity, RATE_MAX } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS } = require('../docs/js/presets.js');

// M10 fix (final review): pin the literal ceiling value, not just that
// stepCapital's rate is bounded by "whatever RATE_MAX is" -- comparing an
// observed rate to the imported constant itself is tautological (both sides
// move together if RATE_MAX ever changes). Drive cumulativeCredit far past
// any plausible term premium so the rate genuinely saturates, then assert
// against the literal value.
test('RATE_MAX is pinned to 0.25, and the rate genuinely saturates there', () => {
  assert.equal(RATE_MAX, 0.25, 'a change here is a real calibration change, not a refactor');
  const s = initialState(DEFAULT_INPUTS);
  s.cumulativeCredit = 1e9; // absurdly high: forces termPremium far past RATE_MAX
  const r = stepCapital(s, DEFAULT_INPUTS, 3000);
  assert.equal(r.rate, 0.25, `rate should clamp to the literal RATE_MAX, got ${r.rate}`);
});

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
