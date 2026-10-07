const { test } = require('node:test');
const assert = require('node:assert/strict');
const { allocate, hoarderRelease, simulate, initialState } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS } = require('../docs/js/presets.js');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const demand = inventoryGw => ({ finalUseGw: 10, inventoryGw, total: 10 + inventoryGw,
  segments: [{ id: 'research', requestedGw: 4, routes: [{ assetOwner: 'frontierLab', customer: 'frontierLab', share: 1 }] },
    { id: 'enterprise', requestedGw: 6, routes: [{ assetOwner: 'neocloud', customer: 'hyperscaler', share: 1 }] }] });

// Literal outcomes: supply caps, inventory release, and zero investment.
for (const [price, stock, investment, supply, built, released, held, final] of [
  [13, 0, 0, 20, 10, 0, 0, 10],
  [13, 0, 0, 5, 5, 0, 0, 5],
  [13, 0, 10, 10, 10, 0, 5, 5],
  [40, 10, 0, 20, 4, 6, 0, 10],
  [40, 10, 0, 2, 2, 6, 0, 8],
  [40, 10, 4, 4, 4, 6, 2, 8],
  [40, 100, 0, 20, 0, 10, 0, 10],
  [40, 100, 4, 0, 0, 10, 0, 10],
]) {
  test(`allocation price=${price} stock=${stock} inventory=${investment} supply=${supply}`, () => {
    const r = allocate({ computePrice: price, hoardedStock: stock }, DEFAULT_INPUTS, demand(investment), supply);
    close(r.newGw, built); close(r.released, released); close(r.hoarderGot, held);
    close(r.allocation.totalGw, final); close(r.labGain, final * 0.4);
    close(r.hoardedStockAfter, stock - released + held);
  });
}

test('inventory release is bounded, price-sensitive, and cannot manufacture stock', () => {
  assert.equal(hoarderRelease({ hoardedStock: 10 }, 20), 0);
  assert.equal(hoarderRelease({ hoardedStock: 10 }, 30), 3);
  assert.equal(hoarderRelease({ hoardedStock: 10 }, 200), 6);
  assert.equal(hoarderRelease({ hoardedStock: 0 }, 200), 0);
});

test('lab ownership share is measured against final allocation including released stock', () => {
  let previous = initialState(DEFAULT_INPUTS);
  for (const y of simulate(DEFAULT_INPUTS, 12345)) {
    const allocated = y.newGw - y.hoarderGot + y.releasedGw;
    const gain = y.labGw - previous.labGw;
    close(y.labShareOfNew, allocated > 0 ? gain / allocated : 0);
    previous = y;
  }
});
