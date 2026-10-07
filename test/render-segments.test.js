const { test } = require('node:test');
const assert = require('node:assert/strict');
const render = require('../docs/js/render.js');
const { simulate } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS } = require('../docs/js/presets.js');

test('segment panel renders value, provider revenue, compute budget and allocated capacity separately', () => {
  assert.equal(typeof render.segmentDemandHtml, 'function');
  const run = simulate(DEFAULT_INPUTS, 12345);
  const html = render.segmentDemandHtml(run[0]);
  for (const s of run[0].demandBreakdown.segments) {
    assert.ok(html.includes(`data-segment="${s.id}"`));
    assert.ok(html.includes(render.fmtB(s.economicValueB)));
    assert.ok(html.includes(render.fmtB(s.providerRevenueB)));
    assert.ok(html.includes(render.fmtB(s.computeBudgetB)));
  }
  assert.match(html, /hyperscaler/);
  assert.match(html, /neocloud/);
});

test('rental panel shows operating shortfall without claiming expected credit loss', () => {
  assert.equal(typeof render.spacexHtml, 'function');
  const html = render.spacexHtml([{ year: 2026, capexPerGw: 40, providerRevenuePerCommercialMw: 30 }]);
  assert.match(html, /Operating shortfall/);
  assert.match(html, /\$80.0B/); // 4 GW × ($50 - $30)M/MW
  assert.match(html, /0.80/); // $40B/GW / $50B/GW/year
  assert.match(html, /does not establish profitability, liquidity, or solvency/i);
});
