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

  const jsDir = path.join(__dirname, '..', 'docs', 'js');
  for (const file of ['rails.js', 'presets.js', 'engine.js']) {
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
