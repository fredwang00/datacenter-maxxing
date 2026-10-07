// Regression test for the browser-fallback path. rails.js, presets.js, and
// engine.js all need to work as plain <script>-tag globals, with no
// `require`/`module` in scope — that's how docs/datacenter-economics.html
// loads them.
//
// Top-level `const`/`let` in a classic script do NOT become properties of
// the global object (only `var` and function declarations do), so a naive
// `module.exports = { ... }` footer with no browser branch silently leaves
// things like `RAILS` unreachable as a global. This test loads all three
// files into a single vm context with no CommonJS machinery present and
// exercises the same globals a browser would see.

const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadAsBrowserGlobals() {
  const context = {};
  vm.createContext(context);
  // Simulate `self` (and thus `window`) being the global object, exactly
  // like a browser's classic-script execution context — and nothing else.
  // No `require`, no `module`, no `exports`.
  context.self = context;

  // ALL FIVE files, in the same order the HTML's <script src> tags load them.
  // This list previously stopped at engine.js, so render.js's browser path was
  // never exercised -- and when market-scenarios.js was added by the v2 port it
  // inherited the same blind spot. Both must expose globals or the page renders
  // nothing, and the failure mode is silent: top-level `const` in a classic
  // script never becomes a property of the global object, so a missing
  // browser branch in the export footer leaves the value simply undefined.
  const jsDir = path.join(__dirname, '..', 'docs', 'js');
  for (const file of ['rails.js', 'demand.js', 'presets.js', 'engine.js', 'market-scenarios.js', 'render.js']) {
    const code = fs.readFileSync(path.join(jsDir, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }
  return context;
}

test('rails.js, presets.js, engine.js expose their APIs as browser globals with no require/module present', () => {
  const context = loadAsBrowserGlobals();

  assert.equal(typeof context.require, 'undefined', 'sanity check: require must not be in scope');
  assert.equal(typeof context.module, 'undefined', 'sanity check: module must not be in scope');

  assert.ok(Array.isArray(context.RAILS), 'RAILS should be a global array in the browser path');
  assert.ok(context.RAILS.length > 0, 'RAILS should be populated, not an empty array');

  assert.equal(typeof context.DEFAULT_INPUTS, 'object', 'DEFAULT_INPUTS should be reachable as a global');
  assert.ok(context.DEFAULT_INPUTS !== null);

  assert.equal(typeof context.initialState, 'function', 'initialState should be a global function');
  assert.equal(typeof context.computeCeilings, 'function', 'computeCeilings should be a global function');
  assert.equal(typeof context.bindingConstraint, 'function', 'bindingConstraint should be a global function');

  const state = context.initialState(context.DEFAULT_INPUTS);
  assert.ok(Math.abs(state.capexPerGw - 38.2) < 0.01, `capexPerGw should be ~38.2, got ${state.capexPerGw}`);
});

test('market-scenarios.js and render.js also expose their APIs as browser globals', () => {
  const context = loadAsBrowserGlobals();

  // The v2 port's editorial data. render.js reads it, so if this is undefined
  // the stock-sensitivity matrix renders empty in a browser while every Node
  // test passes.
  assert.equal(typeof context.MARKET_SCENARIOS, 'object', 'MARKET_SCENARIOS must be a global');
  assert.equal(Object.keys(context.MARKET_SCENARIOS).length, 4, 'expected four market regimes');

  // Every panel the page actually draws.
  for (const fn of ['stateTableHtml', 'calibrationHtml', 'ladderHtml', 'marginMigrationHtml',
                    'matrixHtml', 'labComparisonHtml', 'perGwEconomicsHtml',
                    'bottleneckHtml', 'providerRevenueHtml', 'segmentDemandHtml', 'spacexHtml', 'segmentAssumptionsHtml']) {
    assert.equal(typeof context[fn], 'function', `${fn} must be reachable as a browser global`);
  }
});

test('a full run renders every panel through the browser-global path', () => {
  const context = loadAsBrowserGlobals();
  // Exercise the real call path a browser takes, not just the presence of the
  // symbols: a renderer that throws on real data is as broken as a missing one.
  const run = context.simulate(context.DEFAULT_INPUTS, 12345);
  assert.ok(Array.isArray(run) && run.length === 5, 'simulate must work in the browser path');

  const panels = {
    stateTableHtml: () => context.stateTableHtml(run),
    calibrationHtml: () => context.calibrationHtml(run, context.CALIBRATION_TARGETS, context.DEFAULT_INPUTS, 12345),
    ladderHtml: () => context.ladderHtml(run[0]),
    marginMigrationHtml: () => context.marginMigrationHtml(run),
    matrixHtml: () => context.matrixHtml(run, context.MARKET_SCENARIOS),
    labComparisonHtml: () => context.labComparisonHtml(run),
    perGwEconomicsHtml: () => context.perGwEconomicsHtml(run[0]),
    bottleneckHtml: () => context.bottleneckHtml(run[0]),
    providerRevenueHtml: () => context.providerRevenueHtml(run),
    segmentDemandHtml: () => context.segmentDemandHtml(run[0]),
    spacexHtml: () => context.spacexHtml(run),
    segmentAssumptionsHtml: () => context.segmentAssumptionsHtml(context.DEFAULT_INPUTS.demandSegments),
  };
  for (const [name, call] of Object.entries(panels)) {
    const html = call();
    assert.equal(typeof html, 'string', `${name} must return a string in the browser path`);
    assert.ok(html.length > 0, `${name} returned an empty string`);
  }
});

// Exercise the real page wiring with only the DOM boundary replaced. No DOM
// parsing/layout claim: the separate Chrome check covers those behaviors.
function loadPageWiring() {
  const context = loadAsBrowserGlobals();
  const elements = new Map();
  context.document = {
    querySelectorAll: () => [],
    getElementById: id => {
      if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', listeners: {},
        addEventListener(event, listener) { this.listeners[event] = listener; },
        querySelectorAll() { return []; } });
      return elements.get(id);
    },
  };
  const html = fs.readFileSync(path.join(__dirname, '../docs/datacenter-economics.html'), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInContext(script, context, { filename: 'dashboard-inline.js' });
  return { context, elements };
}

test('invalid segment edits restore the displayed value before a later valid edit clears the error', () => {
  const { context, elements } = loadPageWiring();
  const handler = elements.get('segment-assumptions').listeners.change;
  const invalid = { dataset: { segment: 'commercial', field: 'valueShare' }, value: '0.8', checkValidity: () => true };
  handler({ target: invalid });
  assert.ok(elements.get('segment-error').textContent.length > 0);
  assert.equal(Number(invalid.value), 0.5, 'rejected value must revert to the value actually modeled');
  handler({ target: { dataset: { segment: 'research', field: 'budgetB' }, value: '160', checkValidity: () => true } });
  assert.equal(elements.get('segment-error').textContent, '');
  assert.equal(vm.runInContext("currentInputs().demandSegments.find(s => s.id === 'research').budgetB", context), 160);
  assert.equal(vm.runInContext("currentInputs().demandSegments.find(s => s.id === 'commercial').valueShare", context), 0.5);
  assert.equal(context.DEFAULT_INPUTS.demandSegments[0].budgetB, 150);
});
