// Integration test for the dashboard shell (docs/datacenter-economics.html).
// This is a static-analysis test: it greps the HTML/JS text rather than
// executing a browser, because there is no build step and the artifact is
// meant to be opened via file://. See the comment above each test for why it
// exists as a check rather than a manual claim.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '../docs/datacenter-economics.html'), 'utf8');

function inlineScript() {
  // The wiring script is the last <script> block, right before </body> --
  // distinct from the four <script src> loader tags above it.
  const matches = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(matches.length > 0, 'no inline <script> block found');
  return matches[matches.length - 1][1];
}

test('loads all four scripts in dependency order', () => {
  const order = ['js/rails.js', 'js/presets.js', 'js/engine.js', 'js/render.js'];
  let last = -1;
  for (const src of order) {
    const at = HTML.indexOf(src);
    assert.ok(at > -1, `missing <script src> for ${src}`);
    assert.ok(at > last, `${src} loaded out of order`);
    last = at;
  }
});

test('uses NO ES modules — they are CORS-blocked over file://', () => {
  assert.ok(!/<script[^>]+type=["']module["']/.test(HTML), 'type="module" breaks file:// loading');
  assert.ok(!/\bimport\s+.*\bfrom\b/.test(HTML), 'no import statements in the shell');
});

test('the v1 stock/flow bug is gone', () => {
  assert.ok(!HTML.includes('asmlYear * inputs.aiPct'), 'the old flow-based EUV formula must be deleted');
  assert.ok(!/renderTimeline/.test(HTML), 'the hardcoded timeline must be gone');
});

test('no hardcoded pipeline literals remain', () => {
  assert.ok(!HTML.includes("'55K'"), 'wafer counts must be computed, not typed');
  assert.ok(!HTML.includes("'170K'"), 'DRAM counts must be computed, not typed');
});

test('every panel container the renderers target exists', () => {
  for (const id of ['state-table', 'calibration', 'ladder', 'margin-migration', 'pipeline']) {
    assert.ok(HTML.includes(`id="${id}"`), `missing container #${id}`);
  }
});

test('all engine source files carry the dual-environment export footer', () => {
  for (const f of ['rails.js', 'presets.js', 'engine.js', 'render.js']) {
    const src = fs.readFileSync(path.join(__dirname, '../docs/js', f), 'utf8');
    assert.ok(src.includes('module.exports'), `${f} is not requireable under Node`);
  }
});

// ---------------------------------------------------------------------------
// Wiring-soundness checks below. Task 12's brief warns that a passing suite
// isn't proof the page works: these greps verify the concrete claims that
// double-clicking the file would otherwise require a browser to check --
// every slider maps to a real input, every element the script reaches for
// exists, and every function/global it calls is actually exported.
// ---------------------------------------------------------------------------

test('every data-input attribute matches a real DEFAULT_INPUTS key', () => {
  const { DEFAULT_INPUTS } = require('../docs/js/presets.js');
  const keys = new Set([...HTML.matchAll(/data-input="([^"]+)"/g)].map(m => m[1]));
  assert.ok(keys.size > 0, 'no data-input attributes found');
  for (const key of keys) {
    assert.ok(key in DEFAULT_INPUTS, `data-input="${key}" is not a DEFAULT_INPUTS key`);
  }
});

test('every slider has a value-display element', () => {
  const ids = [...HTML.matchAll(/<input[^>]+type="range"[^>]+id="([^"]+)"/g)].map(m => m[1]);
  assert.ok(ids.length > 0, 'no range sliders found');
  for (const id of ids) {
    assert.ok(HTML.includes(`id="${id}-display"`), `missing display span for slider #${id}`);
  }
});

test('every data-preset button matches a real PRESETS key', () => {
  const { PRESETS } = require('../docs/js/presets.js');
  const names = [...HTML.matchAll(/data-preset="([^"]+)"/g)].map(m => m[1]);
  assert.equal(names.length, Object.keys(PRESETS).length, 'expected one button per PRESETS entry');
  for (const name of names) assert.ok(name in PRESETS, `data-preset="${name}" is not a PRESETS key`);
});

test('every literal getElementById target exists in the HTML', () => {
  const inline = inlineScript();
  const ids = new Set([...inline.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1]));
  assert.ok(ids.size > 0, 'no getElementById calls found in the wiring script');
  for (const id of ids) {
    assert.ok(HTML.includes(`id="${id}"`), `script targets #${id} but no element carries that id`);
  }
});

// Independently lists the names the wiring script is expected to call (based
// on what Task 12 actually wired up), then checks each one both appears in
// the script AND is a real exported function -- catching a typo'd call name
// or a render.js export rename that the inline script wasn't updated for.
test('every render/engine function the inline script calls is actually exported', () => {
  const inline = inlineScript();
  const presets = require('../docs/js/presets.js');
  const engine = require('../docs/js/engine.js');
  const render = require('../docs/js/render.js');
  const allExports = { ...presets, ...engine, ...render };
  const used = ['simulate', 'ladderHtml', 'stateTableHtml', 'marginMigrationHtml', 'calibrationHtml'];
  for (const name of used) {
    assert.ok(new RegExp(`\\b${name}\\s*\\(`).test(inline), `expected the wiring script to call ${name}(...)`);
    assert.equal(typeof allExports[name], 'function',
      `${name} is not exported as a function by presets.js/engine.js/render.js`);
  }
});

test('simulate is called with a fixed seed of 12345 for reproducibility across reloads', () => {
  const inline = inlineScript();
  const literalSeed = /simulate\([^)]*,\s*12345\s*\)/.test(inline);
  const namedSeed = /const\s+SEED\s*=\s*12345\b/.test(inline) && /simulate\([^)]*,\s*SEED\s*\)/.test(inline);
  assert.ok(literalSeed || namedSeed, 'simulate must be called with a fixed seed of 12345 (literal or a SEED constant)');
});

test('calibrationHtml is called with BOTH inputs and the display seed', () => {
  const inline = inlineScript();
  // Four arguments, not three. The seed is load-bearing: without it
  // explainGwMiss falls back to makeRng(1) while the displayed run uses 12345,
  // so the panel prints a model value beside an explanation drawn from a
  // different draw (22.7 GW beside "23.1 GW"). A 3-argument regex passed the
  // whole suite with `, SEED` deleted, which is how that defect survived.
  assert.ok(/calibrationHtml\(\s*[^,()]+,\s*[^,()]+,\s*[^,()]+,\s*SEED\s*\)/.test(inline),
    'calibrationHtml must be called with (run, targets, inputs, SEED) so explainGwMiss explains the SAME draw the page displays');
});

test('DEFAULT_INPUTS is never mutated directly', () => {
  const inline = inlineScript();
  assert.ok(!/DEFAULT_INPUTS\s*\[[^\]]+\]\s*=[^=]/.test(inline), 'must not index-assign into DEFAULT_INPUTS');
  assert.ok(!/DEFAULT_INPUTS\.\w+\s*=[^=]/.test(inline), 'must not property-assign into DEFAULT_INPUTS');
  assert.ok(/\{\s*\.\.\.DEFAULT_INPUTS/.test(inline), 'inputs must be built by spreading a copy of DEFAULT_INPUTS');
});
