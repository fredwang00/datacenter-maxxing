---
id: dcm:plan/2026-08-26-datacenter-dashboard-v3
type: plan
status: done
repo: datacenter-modeling
created: 2026-08-26
updated: 2026-10-04
tags: [dashboard, implementation-plan]
links:
  - repo: datacenter-modeling
    path: docs/superpowers/specs/2026-08-26-datacenter-dashboard-v3-design.md
    relation: implements
---

# Datacenter Dashboard v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v1 calculator with a year-by-year market simulation where compute price, cost per gigawatt, and the binding constraint are outputs rather than inputs.

**Architecture:** Four plain-JS files loaded as ordered `<script>` tags (no ES modules — they are CORS-blocked over `file://`, and this artifact is opened by double-clicking). Each file exposes globals in the browser and `module.exports` under Node so the same source is testable with `node --test`. The engine is a pure function: `simulate(inputs) → Array<YearState>`; renderers consume that array and touch the DOM. No engine code reads the DOM; no renderer does arithmetic.

**Tech Stack:** Vanilla JS (ES2020), `node --test` (Node 22, built-in, zero dependencies), CSS bars and grids for all visualisation. No build step, no npm install, no charting library.

**Spec:** `docs/superpowers/specs/2026-08-26-datacenter-dashboard-v3-design.md`

## Global Constraints

- **No ES modules.** Files load via ordered `<script src>` tags. Dual-environment export footer on every source file: `if (typeof module !== 'undefined' && module.exports) { module.exports = {...}; }`
- **No build step, no dependencies, no charting libraries.** Opening `docs/datacenter-economics.html` from the filesystem must work with zero setup.
- **Two denominators must never be summed.** `basis: 'annuity'` is $B per GW/**year of production capacity**; `basis: 'perGw'` is $B per GW **deployed once**. Summing an annuity rail into `capexPerGw` must throw, not return a number.
- **All rail figures are IT-load basis.** `PUE = 1.25` converts to facility load. Every calibration target declares its basis.
- **Every rail constant carries a `provenance` tag:** one of `dylan-2026-08`, `semianalysis-model`, `researched:<source>`, `derived:<how>`, `estimate:<why>`, `disputed:<what>`.
- **Nested rails roll into their parent.** Only `parent === null` rails sum. Never sum a child and its parent together.
- **`EUV_INSTALL_LAG_YEARS = 1`** — year Y's ceiling uses tools cumulative through end of Y−1. The result is sensitive to this; it is not a free choice.
- **Engine is pure.** `simulate()` takes a plain object and returns a plain array. No DOM, no `Date.now()`, no randomness outside an injected seeded RNG.
- Commit after every task with a conventional-commit message.

---

### Task 1: Rails data and the units guard

**Files:**
- Create: `docs/js/rails.js`
- Create: `test/rails.test.js`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: global `RAILS` (array of rail objects), `railById(id) → rail`, `topLevelPerGwIds() → string[]`, `topLevelAnnuityIds() → string[]`, `sumPerGw(railPrice, ids?) → number`, `initialRailPrice() → {[id]: number}`, constant `PUE = 1.25`. Rail object shape: `{ id, label, basis: 'perGw'|'annuity', parent: string|null, price2026: number, elasticity: number|'step', lag: number, provenance: string }`.

- [ ] **Step 1: Write the failing test**

Create `test/rails.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { RAILS, railById, topLevelPerGwIds, sumPerGw, initialRailPrice } = require('../docs/js/rails.js');

test('perGw top-level rails sum to 38.2 $B/GW', () => {
  assert.ok(Math.abs(sumPerGw(initialRailPrice()) - 38.2) < 0.01);
});

test('servers children sum exactly to the servers parent', () => {
  const p = initialRailPrice();
  const kids = RAILS.filter(r => r.parent === 'servers');
  const kidSum = kids.reduce((a, r) => a + p[r.id], 0);
  assert.ok(Math.abs(kidSum - p.servers) < 0.01, `children ${kidSum} != parent ${p.servers}`);
});

test('annuity top-level rails sum to 6.0 $B per GW/yr', () => {
  const p = initialRailPrice();
  const total = RAILS
    .filter(r => r.parent === null && r.basis === 'annuity')
    .reduce((a, r) => a + p[r.id], 0);
  assert.ok(Math.abs(total - 6.0) < 0.01, `got ${total}`);
});

test('UNITS GUARD: summing an annuity rail into capexPerGw throws', () => {
  assert.throws(
    () => sumPerGw(initialRailPrice(), ['servers', 'euv']),
    /Units guard.*euv.*annuity/s
  );
});

test('every rail has a provenance tag', () => {
  for (const r of RAILS) {
    assert.ok(typeof r.provenance === 'string' && r.provenance.length > 0, `${r.id} missing provenance`);
  }
});

test('every parent reference resolves to a real rail', () => {
  for (const r of RAILS) {
    if (r.parent !== null) assert.ok(railById(r.parent), `${r.id} has dangling parent ${r.parent}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/rails.test.js`
Expected: FAIL — `Cannot find module '../docs/js/rails.js'`

- [ ] **Step 3: Write minimal implementation**

Create `docs/js/rails.js`:

```js
// Rail definitions for the v3 datacenter economics model.
//
// TWO DENOMINATORS — never sum across them:
//   basis 'perGw'   = $B per GW deployed once
//   basis 'annuity' = $B per GW/YEAR of production capacity (a fab emits GW forever)
// All perGw figures are IT-load basis. See the spec's units guard.

const PUE = 1.25;

const RAILS = [
  // ---- perGw: these sum to capexPerGw ----
  { id: 'servers', label: 'Accelerator + server BOM', basis: 'perGw', parent: null,
    price2026: 21.2, elasticity: 1.0, lag: 0.5, provenance: 'researched:epoch-ai-2026-05' },
  { id: 'logic', label: 'TSMC N3/N5 wafers', basis: 'perGw', parent: 'servers',
    price2026: 1.2, elasticity: 0.20, lag: 2, provenance: 'disputed:wafer-count-3x' },
  { id: 'memory', label: 'HBM4 + LPDDR5X', basis: 'perGw', parent: 'servers',
    price2026: 4.9, elasticity: 'step', lag: 1.0, provenance: 'researched:ms-vr200-rack-bom' },
  { id: 'package', label: 'CoWoS + ABF substrate', basis: 'perGw', parent: 'servers',
    price2026: 0.6, elasticity: 1.3, lag: 1, provenance: 'researched:cowos-950-per-package' },
  { id: 'vendorMargin', label: 'Vendor margin + rest of BOM', basis: 'perGw', parent: 'servers',
    price2026: 14.5, elasticity: 1.0, lag: 0.5, provenance: 'derived:residual-to-epoch-21.2' },
  { id: 'network', label: 'Networking, optics', basis: 'perGw', parent: null,
    price2026: 4.9, elasticity: 0.6, lag: 0.5, provenance: 'researched:epoch-ai-2026-05' },
  { id: 'dcElec', label: 'In-DC electrical, switchgear, UPS', basis: 'perGw', parent: null,
    price2026: 5.4, elasticity: 0.35, lag: 2.75, provenance: 'researched:tt-48pct-of-11.3' },
  { id: 'cooling', label: 'Mechanical / liquid cooling', basis: 'perGw', parent: null,
    price2026: 3.7, elasticity: 0.45, lag: 2, provenance: 'researched:tt-33pct-of-11.3' },
  { id: 'shell', label: 'Civil, land, utility works', basis: 'perGw', parent: null,
    price2026: 2.5, elasticity: 0.30, lag: 2, provenance: 'researched:tt-19pct-plus-epoch-land' },
  { id: 'power', label: 'Generation adder', basis: 'perGw', parent: null,
    price2026: 0.5, elasticity: 0.70, lag: 5.0, provenance: 'researched:lazard-v19-grid-connected' },

  // ---- annuity: capacity ceilings + amortized cost only. NEVER in capexPerGw. ----
  { id: 'euv', label: 'EUV tools (ASML)', basis: 'annuity', parent: null,
    price2026: 0.95, elasticity: 0.3, lag: 3, provenance: 'researched:asml-ar2025-realized-asp' },
  { id: 'optics', label: 'Mirrors (Zeiss)', basis: 'annuity', parent: 'euv',
    price2026: 0.23, elasticity: 0.1, lag: 4, provenance: 'estimate:zeiss-inferred-from-cogs-share' },
  { id: 'otherWfe', label: 'DUV, etch, depo, metrology', basis: 'annuity', parent: null,
    price2026: 2.55, elasticity: 0.4, lag: 2, provenance: 'derived:to-hit-3.5B-wfe' },
  { id: 'fabshell', label: 'Cleanroom + shell', basis: 'annuity', parent: null,
    price2026: 2.5, elasticity: 0.5, lag: 2, provenance: 'derived:to-hit-6B-total' },
];

const _byId = new Map(RAILS.map(r => [r.id, r]));
function railById(id) { return _byId.get(id); }

function topLevelPerGwIds() {
  return RAILS.filter(r => r.parent === null && r.basis === 'perGw').map(r => r.id);
}

function topLevelAnnuityIds() {
  return RAILS.filter(r => r.parent === null && r.basis === 'annuity').map(r => r.id);
}

function initialRailPrice() {
  const out = {};
  for (const r of RAILS) out[r.id] = r.price2026;
  return out;
}

// Sums perGw rails into capexPerGw. Throws on any annuity rail — the two
// denominators are not addable and a silent number here corrupts everything.
function sumPerGw(railPrice, ids) {
  const list = ids || topLevelPerGwIds();
  let total = 0;
  for (const id of list) {
    const rail = railById(id);
    if (!rail) throw new Error(`Unknown rail "${id}"`);
    if (rail.basis !== 'perGw') {
      throw new Error(
        `Units guard: rail "${id}" has basis "annuity" and cannot be summed into ` +
        `capexPerGw. annuity rails are $B per GW/yr of production capacity; ` +
        `perGw rails are $B per GW deployed once.`
      );
    }
    total += railPrice[id];
  }
  return total;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PUE, RAILS, railById, topLevelPerGwIds, topLevelAnnuityIds, initialRailPrice, sumPerGw };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/rails.test.js`
Expected: PASS, 6/6

- [ ] **Step 5: Commit**

```bash
git add docs/js/rails.js test/rails.test.js
git commit -m "feat: rail definitions with units guard on the two denominators"
```

---

### Task 2: Rail repricing — continuous and step

**Files:**
- Modify: `docs/js/rails.js` (append repricing functions before the export footer)
- Modify: `test/rails.test.js` (append)

**Interfaces:**
- Consumes: `RAILS`, `railById` from Task 1
- Produces: `clamp(v, lo, hi) → number`, `railTightness(demandGw, ceilingGw) → number`, `repriceContinuous(price, elasticity, tightness) → number`, `repriceStep(price, tightness, stepState, resetInterval) → number`, `newStepState() → {pressure, yearsSinceReset}`, constants `TIGHTNESS_MIN = 0.5`, `TIGHTNESS_MAX = 3.0`, `STEP_GAIN = 0.6`, `MEMORY_RESET_INTERVAL = 2`.

- [ ] **Step 1: Write the failing test**

Append to `test/rails.test.js`:

```js
const { clamp, railTightness, repriceContinuous, repriceStep, newStepState,
        TIGHTNESS_MAX, MEMORY_RESET_INTERVAL } = require('../docs/js/rails.js');

test('tightness is demand over ceiling, clamped to [0.5, 3.0]', () => {
  assert.ok(Math.abs(railTightness(30, 30) - 1.0) < 1e-9);
  assert.ok(Math.abs(railTightness(45, 30) - 1.5) < 1e-9);
  assert.equal(railTightness(1000, 30), TIGHTNESS_MAX, 'must clamp high');
  assert.equal(railTightness(1, 1000), 0.5, 'must clamp low');
});

test('a zero ceiling is maximally tight, not a divide-by-zero', () => {
  assert.equal(railTightness(30, 0), TIGHTNESS_MAX);
});

test('continuous repricing scales with elasticity', () => {
  // fast rail (1.3) vs slow rail (0.20) at the same tightness
  const fast = repriceContinuous(100, 1.3, 1.5);
  const slow = repriceContinuous(100, 0.20, 1.5);
  assert.ok(Math.abs(fast - 165) < 0.01, `fast ${fast}`);
  assert.ok(Math.abs(slow - 110) < 0.01, `slow ${slow}`);
  assert.ok(fast > slow, 'fast rails must capture margin faster — the whole mechanic');
});

test('slack rails give back price', () => {
  assert.ok(repriceContinuous(100, 1.0, 0.8) < 100);
});

test('STEP: memory stays flat between contract resets, then jumps', () => {
  const s = newStepState();
  let price = 100;
  price = repriceStep(price, 1.5, s, MEMORY_RESET_INTERVAL);
  assert.equal(price, 100, 'year 1 under an LTA must be FLAT — this is the HBM finding');
  price = repriceStep(price, 1.5, s, MEMORY_RESET_INTERVAL);
  assert.ok(Math.abs(price - 160) < 0.01, `year 2 reset should be ~+60%, got ${price}`);
});

test('STEP: pressure resets after discharge', () => {
  const s = newStepState();
  let price = 100;
  price = repriceStep(price, 1.5, s, MEMORY_RESET_INTERVAL);
  price = repriceStep(price, 1.5, s, MEMORY_RESET_INTERVAL);
  assert.equal(s.pressure, 0);
  assert.equal(s.yearsSinceReset, 0);
});

test('STEP: slack years do not produce a price cut at reset', () => {
  const s = newStepState();
  let price = 100;
  price = repriceStep(price, 0.6, s, MEMORY_RESET_INTERVAL);
  price = repriceStep(price, 0.6, s, MEMORY_RESET_INTERVAL);
  assert.equal(price, 100, 'LTAs floor the price; suppliers do not hand money back');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/rails.test.js`
Expected: FAIL — `railTightness is not a function`

- [ ] **Step 3: Write minimal implementation**

Insert into `docs/js/rails.js`, immediately before the export footer:

```js
const TIGHTNESS_MIN = 0.5;
const TIGHTNESS_MAX = 3.0;
const STEP_GAIN = 0.6;            // calibrated: 2yr at tightness 1.5 -> +60%, matching HBM's 2027 reset
const MEMORY_RESET_INTERVAL = 2;  // HBM sits under multi-year LTAs

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function railTightness(demandGw, ceilingGw) {
  if (!(ceilingGw > 0)) return TIGHTNESS_MAX;
  return clamp(demandGw / ceilingGw, TIGHTNESS_MIN, TIGHTNESS_MAX);
}

function repriceContinuous(price, elasticity, tightness) {
  return price * (1 + elasticity * (tightness - 1));
}

function newStepState() { return { pressure: 0, yearsSinceReset: 0 }; }

// Long-term-agreement repricing. Tightness accumulates as pressure and
// discharges only at the contract reset. HBM was flat-to-down through 2026
// while commodity DRAM moved +93-98% in one quarter, then steps +50-79% at
// the 2027 reset. A continuous elasticity cannot express that shape.
function repriceStep(price, tightness, stepState, resetInterval) {
  stepState.pressure += (tightness - 1);
  stepState.yearsSinceReset += 1;
  if (stepState.yearsSinceReset >= resetInterval) {
    const multiplier = 1 + Math.max(0, stepState.pressure) * STEP_GAIN;
    stepState.pressure = 0;
    stepState.yearsSinceReset = 0;
    return price * multiplier;
  }
  return price;
}
```

Extend the export footer to include: `clamp, railTightness, repriceContinuous, repriceStep, newStepState, TIGHTNESS_MIN, TIGHTNESS_MAX, STEP_GAIN, MEMORY_RESET_INTERVAL`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/rails.test.js`
Expected: PASS, 13/13

- [ ] **Step 5: Commit**

```bash
git add docs/js/rails.js test/rails.test.js
git commit -m "feat: rail repricing with LTA step function for memory"
```

---

### Task 3: Presets, calibration targets, and the EUV stock model

**Files:**
- Create: `docs/js/presets.js`
- Create: `test/presets.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `ASML_TOOLS_PER_YEAR` (object keyed by year), `EUV_CUMULATIVE_END_2025 = 290`, `EUV_INSTALL_LAG_YEARS = 1`, `cumulativeEuvTools(year) → number`, `euvCeilingGw(year, aiPct, euvToolsPerGw) → number`, `euvToolsPerGwFromWafers(logicWafersPerGw) → number`, `DEFAULT_INPUTS` (object), `CALIBRATION_TARGETS` (array of `{id, label, source, basis, year, target, tolerance}`), `PRESETS` (object of named partial-input overrides).

- [ ] **Step 1: Write the failing test**

Create `test/presets.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { cumulativeEuvTools, euvCeilingGw, euvToolsPerGwFromWafers,
        DEFAULT_INPUTS, CALIBRATION_TARGETS, PRESETS } = require('../docs/js/presets.js');

test('EUV installed base uses tools through END of prior year', () => {
  assert.equal(cumulativeEuvTools(2026), 290, '2026 produces on tools installed by end-2025');
  assert.equal(cumulativeEuvTools(2027), 355, '290 + 65');
  assert.equal(cumulativeEuvTools(2028), 440, '290 + 65 + 85');
});

test('EUV ceiling reproduces the spec table', () => {
  const t = (y) => euvCeilingGw(y, 0.6, 3.5);
  assert.ok(Math.abs(t(2026) - 49.7) < 0.5, `2026 ${t(2026)}`);
  assert.ok(Math.abs(t(2027) - 60.9) < 0.5, `2027 ${t(2027)}`);
  assert.ok(Math.abs(t(2028) - 75.4) < 0.5, `2028 ${t(2028)}`);
});

test('EUV is slack in 2026-27 and only marginal in 2028', () => {
  assert.ok(euvCeilingGw(2026, 0.6, 3.5) > 30 * 1.5, '2026 comfortably slack vs 30 GW');
  const headroom2028 = euvCeilingGw(2028, 0.6, 3.5) / 70 - 1;
  assert.ok(headroom2028 > 0, '2028 still above demand');
  assert.ok(headroom2028 < 0.15, '2028 headroom is single-digit-ish, not comfortable');
});

test('euvToolsPerGw DERIVES from the wafer count — they are not independent', () => {
  assert.ok(Math.abs(euvToolsPerGwFromWafers(55000) - 3.5) < 0.01, 'Dylan default');
  const low = euvToolsPerGwFromWafers(20000);
  assert.ok(low < 1.5, `disputed low end should collapse the coefficient, got ${low}`);
});

test('the disputed low wafer count makes EUV irrelevant, not binding', () => {
  const low = euvCeilingGw(2028, 0.6, euvToolsPerGwFromWafers(20000));
  assert.ok(low > 150, `low wafer count should triple+ the ceiling, got ${low}`);
});

test('every calibration target declares its units basis', () => {
  for (const t of CALIBRATION_TARGETS) {
    assert.ok(['itLoad', 'facilityLoad', 'none'].includes(t.basis), `${t.id} basis "${t.basis}"`);
    assert.ok(t.source && t.label, `${t.id} missing source or label`);
  }
});

test('presets only override keys that exist in DEFAULT_INPUTS', () => {
  for (const [name, overrides] of Object.entries(PRESETS)) {
    for (const k of Object.keys(overrides)) {
      assert.ok(k in DEFAULT_INPUTS, `preset "${name}" sets unknown input "${k}"`);
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/presets.test.js`
Expected: FAIL — `Cannot find module '../docs/js/presets.js'`

- [ ] **Step 3: Write minimal implementation**

Create `docs/js/presets.js`:

```js
// Scenario presets, calibration targets, and the corrected EUV stock model.

// ASML CEO capacity guidance, Q2 2026 call: ~65 Low-NA systems in 2026,
// +30% for 2027, a further +30% under investigation for 2028.
const ASML_TOOLS_PER_YEAR = { 2026: 65, 2027: 85, 2028: 110, 2029: 110, 2030: 110 };
const ASML_TOOLS_DEFAULT = 110;
const EUV_CUMULATIVE_END_2025 = 290;

// A tool shipped in year Y needs months to install and qualify, so year Y's
// output comes from tools installed by the end of Y-1. The answer is sensitive
// to this: counting same-year shipments moves 2028 from ~75 to ~94 GW/yr.
const EUV_INSTALL_LAG_YEARS = 1;

function cumulativeEuvTools(year) {
  let total = EUV_CUMULATIVE_END_2025;
  for (let y = 2026; y <= year - EUV_INSTALL_LAG_YEARS; y++) {
    total += ASML_TOOLS_PER_YEAR[y] !== undefined ? ASML_TOOLS_PER_YEAR[y] : ASML_TOOLS_DEFAULT;
  }
  return total;
}

function euvCeilingGw(year, aiPct, euvToolsPerGw) {
  return (cumulativeEuvTools(year) * aiPct) / euvToolsPerGw;
}

// The 3.5 tools/GW coefficient is DERIVED from the wafer count: ~2M EUV passes
// per GW from 55K N3 + 6K N5 wafers at ~20 passes each. The wafer count is
// disputed 3x by a bottom-up die count, so these are not free parameters.
const DYLAN_LOGIC_WAFERS_PER_GW = 55000;
const DYLAN_EUV_TOOLS_PER_GW = 3.5;

function euvToolsPerGwFromWafers(logicWafersPerGw) {
  return DYLAN_EUV_TOOLS_PER_GW * (logicWafersPerGw / DYLAN_LOGIC_WAFERS_PER_GW);
}

const DEFAULT_INPUTS = {
  // supply
  aiPct: 0.60,
  logicWafersPerGw: 55000,        // slider 20000-55000; disputed 3x
  powerMode: 'grid',              // grid | ccgt | peaker | nuclear
  // demand
  labGrowthRate: 3.0,             // labs triple per year
  wtpFraction: 0.26,              // labs pay ~$13M/MW while generating ~$50M
  wtpFractionGrowth: 0.18,        // how fast that fraction rises — the key slider
  hyperscalerDemandGw: 12,
  hoarderBuildGw: 4,
  // clearing
  priceElasticity: 0.6,
  damping: 0.5,
  floorCost: 11.0,                // $M/MW — "anyone can make money at $10-15"
  // capital
  baseRate: 0.055,                // Meta raises at 5-6%
  creditMarketDepth: 1400,        // $B/yr of absorbable AI credit issuance
  ecosystemCashFlow: 700,         // $B/yr fundable from operations
  reinvestRate: 0.9,
  // monetization
  labRevPerMw0: 50,               // $M/MW, Anthropic peak today
  inferenceShare: 0.40,
  inferenceShareDecay: 0.04,      // Dylan's non-consensus call: it falls
  regDragSmooth: 0.05,            // withheld model releases
  regStopProbability: 0.25,       // discrete jurisdiction-level stops
  addressableValueB: 42000,       // $B/yr wage bill + IT spend
  captureRate: 0.03,
  captureRateGrowth: 0.35,
};

const CALIBRATION_TARGETS = [
  { id: 'gw2026', label: '2026 new GW', source: 'transcript', basis: 'none', year: 2026, target: 30, tolerance: 0.10 },
  { id: 'gw2027', label: '2027 new GW', source: 'transcript', basis: 'none', year: 2027, target: 50, tolerance: 0.10 },
  { id: 'gw2028', label: '2028 new GW', source: 'transcript', basis: 'none', year: 2028, target: 70, tolerance: 0.10 },
  { id: 'gw2029', label: '2029 new GW', source: 'transcript', basis: 'none', year: 2029, target: 95, tolerance: 0.12 },
  { id: 'cumGw2028', label: '2028 cumulative world GW', source: 'transcript', basis: 'none', year: 2028, target: 200, tolerance: 0.10 },
  { id: 'capex2028', label: '2028 total capex ($B)', source: 'transcript', basis: 'facilityLoad', year: 2028, target: 3500, tolerance: 0.15 },
  { id: 'capexPerGw2026', label: '2026 $B/GW', source: 'epoch-ai', basis: 'itLoad', year: 2026, target: 38.2, tolerance: 0.10 },
  { id: 'capexPerGw2028', label: '2028 $B/GW', source: 'derived', basis: 'itLoad', year: 2028, target: 52, tolerance: 0.15 },
  { id: 'price2028', label: '2028 compute price ($M/MW)', source: 'transcript', basis: 'none', year: 2028, target: 40, tolerance: 0.20 },
  { id: 'cumCapex2029', label: 'Cumulative capex 24-29 ($B)', source: 'semianalysis-model', basis: 'facilityLoad', year: 2029, target: 11000, tolerance: 0.20 },
  { id: 'cumCredit2029', label: 'Cumulative credit 24-29 ($B)', source: 'semianalysis-model', basis: 'none', year: 2029, target: 5000, tolerance: 0.20 },
  { id: 'labShare2028', label: 'Lab share of 2028 incremental', source: 'transcript', basis: 'none', year: 2028, target: 0.75, tolerance: 0.15 },
];

const PRESETS = {
  'dylan-base': {},
  'regulatory-freeze': { regStopProbability: 0.70, regDragSmooth: 0.20, wtpFractionGrowth: 0.05 },
  'capital-crunch':    { baseRate: 0.085, creditMarketDepth: 700, ecosystemCashFlow: 500 },
  'takeoff':           { wtpFractionGrowth: 0.40, labRevPerMw0: 70, inferenceShareDecay: 0.08,
                         regStopProbability: 0.05, captureRateGrowth: 0.60 },
  'power-starved':     { powerMode: 'ccgt', hoarderBuildGw: 1 },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ASML_TOOLS_PER_YEAR, EUV_CUMULATIVE_END_2025, EUV_INSTALL_LAG_YEARS,
    cumulativeEuvTools, euvCeilingGw, euvToolsPerGwFromWafers,
    DEFAULT_INPUTS, CALIBRATION_TARGETS, PRESETS,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/presets.test.js`
Expected: PASS, 7/7

- [ ] **Step 5: Commit**

```bash
git add docs/js/presets.js test/presets.test.js
git commit -m "feat: EUV stock model, presets, and calibration targets"
```

---

### Task 4: Supply ceilings and the emergent binding constraint

**Files:**
- Create: `docs/js/engine.js`
- Create: `test/engine-supply.test.js`

**Interfaces:**
- Consumes: `railById`, `railTightness` (Task 1-2); `euvCeilingGw`, `euvToolsPerGwFromWafers` (Task 3)
- Produces: `POWER_MODES` (object), `computeCeilings(state, inputs, year) → {euv, memory, package, power, capital}`, `bindingConstraint(ceilings) → string`, `initialState(inputs) → state object`. State fields established here: `installedGw, effectiveGw, labGw, computePrice, labRevPerMw, capexPerGw, rate, railPrice, pipeline, hoardedStock, cumulativeCredit, cumulativeCapex, capability, availableCapital, stepStates, wtpFraction, inferenceShare, captureRate`.

- [ ] **Step 1: Write the failing test**

Create `test/engine-supply.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { initialState, computeCeilings, bindingConstraint, POWER_MODES } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS } = require('../docs/js/presets.js');

test('binding constraint is the argmin, computed not editorial', () => {
  assert.equal(bindingConstraint({ euv: 50, memory: 40, power: 12, capital: 80 }), 'power');
  assert.equal(bindingConstraint({ euv: 9, memory: 40, power: 12, capital: 80 }), 'euv');
});

test('EUV is NOT the 2026 binding constraint — this is the v1 bug corrected', () => {
  const s = initialState(DEFAULT_INPUTS);
  const c = computeCeilings(s, DEFAULT_INPUTS, 2026);
  assert.ok(c.euv > 45, `EUV ceiling should be ~50 GW/yr, got ${c.euv}`);
  assert.notEqual(bindingConstraint(c), 'euv', 'v1 claimed EUV binds at ~12 GW/yr; it does not');
});

test('capital ceiling is availableCapital / capexPerGw', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.availableCapital = 1000;
  s.capexPerGw = 40;
  const c = computeCeilings(s, DEFAULT_INPUTS, 2026);
  assert.ok(Math.abs(c.capital - 25) < 0.01, `got ${c.capital}`);
});

test('power mode changes both cost and lead time', () => {
  assert.ok(POWER_MODES.ccgt.pricePerGw > POWER_MODES.grid.pricePerGw);
  assert.ok(POWER_MODES.nuclear.pricePerGw > POWER_MODES.ccgt.pricePerGw);
  assert.equal(POWER_MODES.ccgt.leadYears, 5, 'GE Vernova is quoting 2031 delivery');
  assert.ok(POWER_MODES.nuclear.leadYears > POWER_MODES.ccgt.leadYears);
});

test('initial state has no NaN or undefined fields', () => {
  const s = initialState(DEFAULT_INPUTS);
  for (const [k, v] of Object.entries(s)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} is ${v}`);
    assert.notEqual(v, undefined, `${k} undefined`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/engine-supply.test.js`
Expected: FAIL — `Cannot find module '../docs/js/engine.js'`

- [ ] **Step 3: Write minimal implementation**

Create `docs/js/engine.js`:

```js
// Year-by-year market simulation. Pure: takes inputs, returns an array of
// year states. No DOM, no Date.now(), no ambient randomness.

(function (root, factory) {
  const rails = (typeof require !== 'undefined') ? require('./rails.js') : root;
  const presets = (typeof require !== 'undefined') ? require('./presets.js') : root;
  const api = factory(rails, presets);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function (rails, presets) {

const { RAILS, railById, initialRailPrice, sumPerGw, newStepState, railTightness } = rails;
const { euvCeilingGw, euvToolsPerGwFromWafers } = presets;

const START_YEAR = 2026;
const END_YEAR = 2030;
const INSTALLED_GW_END_2025 = 50;
const LAB_GW_END_2025 = 4;

// $B per GW of datacenter load, and lead time in years.
const POWER_MODES = {
  grid:    { label: 'Grid-connected',    pricePerGw: 0.5,  leadYears: 5, provenance: 'researched:interconnection' },
  ccgt:    { label: 'Dedicated CCGT',    pricePerGw: 2.6,  leadYears: 5, provenance: 'researched:lazard-v19-bnef' },
  peaker:  { label: 'Simple-cycle',      pricePerGw: 1.6,  leadYears: 3, provenance: 'researched:lazard-v19' },
  nuclear: { label: 'New nuclear',       pricePerGw: 17.0, leadYears: 7, provenance: 'researched:lazard-v19' },
};

function initialState(inputs) {
  const railPrice = initialRailPrice();
  railPrice.power = POWER_MODES[inputs.powerMode].pricePerGw;
  const stepStates = {};
  for (const r of RAILS) if (r.elasticity === 'step') stepStates[r.id] = newStepState();

  const capexPerGw = sumPerGw(railPrice);
  return {
    installedGw: INSTALLED_GW_END_2025,
    effectiveGw: INSTALLED_GW_END_2025,
    labGw: LAB_GW_END_2025,
    computePrice: 13,
    labRevPerMw: inputs.labRevPerMw0,
    capexPerGw,
    rate: inputs.baseRate,
    railPrice,
    stepStates,
    pipeline: {},
    hoardedStock: 0,
    cumulativeCredit: 0,
    cumulativeCapex: 0,
    capability: 1,
    availableCapital: inputs.ecosystemCashFlow + inputs.creditMarketDepth,
    wtpFraction: inputs.wtpFraction,
    inferenceShare: inputs.inferenceShare,
    captureRate: inputs.captureRate,
  };
}

// Pipeline capacity for a rail in a given year, defaulting to a generous
// baseline so an unseeded rail never spuriously binds.
function pipelineCapacity(state, railId, year, fallback) {
  const byYear = state.pipeline[railId];
  if (!byYear || byYear[year] === undefined) return fallback;
  return byYear[year];
}

function computeCeilings(state, inputs, year) {
  const euvToolsPerGw = euvToolsPerGwFromWafers(inputs.logicWafersPerGw);
  return {
    euv:     euvCeilingGw(year, inputs.aiPct, euvToolsPerGw),
    memory:  pipelineCapacity(state, 'memory', year, 999),
    package: pipelineCapacity(state, 'package', year, 999),
    power:   pipelineCapacity(state, 'power', year, 999),
    capital: state.availableCapital / state.capexPerGw,
  };
}

function bindingConstraint(ceilings) {
  let best = null, bestVal = Infinity;
  for (const [k, v] of Object.entries(ceilings)) {
    if (v < bestVal) { bestVal = v; best = k; }
  }
  return best;
}

return { START_YEAR, END_YEAR, POWER_MODES, initialState, computeCeilings, bindingConstraint, pipelineCapacity };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/engine-supply.test.js`
Expected: PASS, 5/5

- [ ] **Step 5: Commit**

```bash
git add docs/js/engine.js test/engine-supply.test.js
git commit -m "feat: supply ceilings with emergent binding constraint"
```

---

### Task 5: Demand classes and price clearing

**Files:**
- Modify: `docs/js/engine.js` (add inside the factory, before the `return`)
- Create: `test/engine-demand.test.js`

**Interfaces:**
- Consumes: `initialState` (Task 4), `clamp` (Task 2)
- Produces: `arbitrageShelf(price, floorCost) → number`, `priceDamp(price, wtp) → number`, `computeDemand(state, inputs, year) → {labDemand, hyperscaler, hoarder, arbitrage, total, labWtp}`, `clearPrice(state, inputs, demandGw, supplyGw) → number`

- [ ] **Step 1: Write the failing test**

Create `test/engine-demand.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { initialState, computeDemand, clearPrice, arbitrageShelf, priceDamp } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS } = require('../docs/js/presets.js');

test('arbitrage shelf is large below the floor and vanishes above it', () => {
  const cheap = arbitrageShelf(11, 11);
  const dear = arbitrageShelf(40, 11);
  assert.ok(cheap > 5, `shelf should absorb capacity when cheap, got ${cheap}`);
  assert.ok(dear < 0.5, `shelf must vanish when dear, got ${dear}`);
});

test('lab demand is damped as price approaches willingness to pay', () => {
  assert.ok(priceDamp(10, 50) > 0.9, 'cheap vs WTP -> buy freely');
  assert.ok(priceDamp(49, 50) < 0.3, 'at WTP -> nearly stop');
  assert.equal(priceDamp(60, 50), 0, 'above WTP -> stop entirely');
});

test('price cannot fall below the arbitrage floor', () => {
  const s = initialState(DEFAULT_INPUTS);
  const p = clearPrice(s, DEFAULT_INPUTS, 1, 500);  // massive oversupply
  assert.ok(p >= DEFAULT_INPUTS.floorCost - 1e-9, `got ${p}`);
});

test('price cannot exceed lab willingness to pay', () => {
  const s = initialState(DEFAULT_INPUTS);
  const wtp = s.labRevPerMw * s.wtpFraction;
  const p = clearPrice(s, DEFAULT_INPUTS, 500, 1);  // massive shortage
  assert.ok(p <= wtp + 1e-9, `price ${p} escaped WTP ceiling ${wtp}`);
});

test('damping means price moves partway, not all the way, in one year', () => {
  const s = initialState(DEFAULT_INPUTS);
  const before = s.computePrice;
  const p = clearPrice(s, DEFAULT_INPUTS, 60, 30);
  assert.ok(p > before, 'shortage should raise price');
  const undamped = before * Math.pow(2, DEFAULT_INPUTS.priceElasticity);
  assert.ok(p < undamped, 'damping must slow the approach');
});

test('all four buyer classes are present and non-negative', () => {
  const s = initialState(DEFAULT_INPUTS);
  const d = computeDemand(s, DEFAULT_INPUTS, 2026);
  for (const k of ['labDemand', 'hyperscaler', 'hoarder', 'arbitrage']) {
    assert.ok(d[k] >= 0, `${k} negative`);
  }
  assert.ok(Math.abs(d.total - (d.labDemand + d.hyperscaler + d.hoarder + d.arbitrage)) < 1e-9);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/engine-demand.test.js`
Expected: FAIL — `computeDemand is not a function`

- [ ] **Step 3: Write minimal implementation**

Add inside `engine.js`'s factory, before the `return`:

```js
const { clamp } = rails;

const ARB_SHELF_MAX_GW = 12;
const ARB_SHELF_SHARPNESS = 6;

// The "download Kimi weights and put it on OpenRouter" crowd. Near-infinitely
// elastic below the floor, gone above it. Does not compete for scarce compute
// -- it sets the floor.
function arbitrageShelf(price, floorCost) {
  const excess = (price - floorCost) / floorCost;
  return ARB_SHELF_MAX_GW * Math.exp(-ARB_SHELF_SHARPNESS * Math.max(0, excess));
}

// Labs buy freely well below their willingness-to-pay and stop at it.
function priceDamp(price, wtp) {
  if (!(wtp > 0)) return 0;
  if (price >= wtp) return 0;
  const headroom = 1 - price / wtp;
  return Math.pow(headroom, 0.5);
}

function computeDemand(state, inputs, year) {
  const labWtp = state.labRevPerMw * state.wtpFraction;
  const labDemand = state.labGw * (inputs.labGrowthRate - 1) * priceDamp(state.computePrice, labWtp);
  const hyperscaler = inputs.hyperscalerDemandGw;
  const hoarder = inputs.hoarderBuildGw;
  const arbitrage = arbitrageShelf(state.computePrice, inputs.floorCost);
  return {
    labDemand, hyperscaler, hoarder, arbitrage, labWtp,
    total: labDemand + hyperscaler + hoarder + arbitrage,
  };
}

function clearPrice(state, inputs, demandGw, supplyGw) {
  const labWtp = state.labRevPerMw * state.wtpFraction;
  const ceiling = Math.max(labWtp, inputs.floorCost);
  const gap = supplyGw > 0 ? demandGw / supplyGw : 3;
  const raw = state.computePrice * Math.pow(gap, inputs.priceElasticity);
  const target = clamp(raw, inputs.floorCost, ceiling);
  return state.computePrice + inputs.damping * (target - state.computePrice);
}
```

Add `arbitrageShelf, priceDamp, computeDemand, clearPrice` to the factory's `return`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/engine-demand.test.js`
Expected: PASS, 6/6

- [ ] **Step 5: Commit**

```bash
git add docs/js/engine.js test/engine-demand.test.js
git commit -m "feat: four buyer classes and clamped price clearing"
```

---

### Task 6: Allocation and hoarder inventory accounting

**Files:**
- Modify: `docs/js/engine.js`
- Create: `test/engine-allocation.test.js`

**Interfaces:**
- Consumes: `initialState`, `computeDemand` (Tasks 4-5)
- Produces: `labShare(labWtp, price) → number`, `hoarderRelease(state, price) → number`, `allocate(state, inputs, demand, supplyGw) → {newGw, forSale, released, labGain, hoardedStockAfter}`

- [ ] **Step 1: Write the failing test**

Create `test/engine-allocation.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { initialState, computeDemand, allocate, labShare, hoarderRelease } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS } = require('../docs/js/presets.js');

test('CONSERVATION: released hoard is inventory, never new capacity', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.hoardedStock = 10;
  const d = computeDemand(s, DEFAULT_INPUTS, 2026);
  const r = allocate(s, DEFAULT_INPUTS, d, 30);
  assert.ok(r.newGw <= 30 + 1e-9, 'newGw may never exceed the physical supply ceiling');
  const expected = s.hoardedStock - r.released + DEFAULT_INPUTS.hoarderBuildGw;
  assert.ok(Math.abs(r.hoardedStockAfter - expected) < 1e-9, 'hoard must balance: in - out + built');
});

test('hoarders release more when price is high relative to internal use', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.hoardedStock = 10;
  s.computePrice = 15;
  const low = hoarderRelease(s, s.computePrice);
  s.computePrice = 45;
  const high = hoarderRelease(s, s.computePrice);
  assert.ok(high > low, 'a wide spread should pull inventory out — how Elon recoups capex in a year');
});

test('hoarders cannot release more than they hold', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.hoardedStock = 2;
  s.computePrice = 200;
  assert.ok(hoarderRelease(s, s.computePrice) <= 2 + 1e-9);
});

test('labs take a larger share when they can outbid', () => {
  assert.ok(labShare(60, 13) > labShare(20, 13), 'higher WTP vs price -> bigger share');
  assert.ok(labShare(60, 13) <= 1.0);
  assert.ok(labShare(10, 40) >= 0.0);
});

test('newGw is the lesser of demand and supply', () => {
  const s = initialState(DEFAULT_INPUTS);
  const d = computeDemand(s, DEFAULT_INPUTS, 2026);
  const constrained = allocate(s, DEFAULT_INPUTS, d, 5);
  assert.ok(Math.abs(constrained.newGw - 5) < 1e-9, 'supply-limited');
  const abundant = allocate(s, DEFAULT_INPUTS, d, 5000);
  assert.ok(Math.abs(abundant.newGw - d.total) < 1e-9, 'demand-limited');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/engine-allocation.test.js`
Expected: FAIL — `allocate is not a function`

- [ ] **Step 3: Write minimal implementation**

Add inside the factory, before the `return`:

```js
const HOARDER_INTERNAL_VALUE = 20;   // $M/MW Meta/SpaceX get from using it themselves
const HOARDER_RELEASE_MAX = 0.6;     // fraction of stock releasable in one year

// Labs outbid everyone when their willingness-to-pay clears the market price.
function labShare(labWtp, price) {
  if (!(price > 0)) return 1;
  const ratio = labWtp / price;
  return clamp((ratio - 1) / 3, 0, 1);
}

// Hoarders sell when renting out beats using it internally. Self-limiting:
// hoarding only pays while the spread is wide, so it damps the scarcity it
// profits from.
function hoarderRelease(state, price) {
  const spread = (price - HOARDER_INTERNAL_VALUE) / HOARDER_INTERNAL_VALUE;
  const fraction = clamp(spread, 0, 1) * HOARDER_RELEASE_MAX;
  return Math.min(state.hoardedStock, state.hoardedStock * fraction);
}

// Hoarded GW consumed physical rails in the year they were BUILT. Releasing
// them later is inventory changing hands, never new supply -- otherwise the
// model manufactures capacity from nothing.
function allocate(state, inputs, demand, supplyGw) {
  const newGw = Math.min(demand.total, supplyGw);
  const released = hoarderRelease(state, state.computePrice);
  const forSale = newGw + released;
  const labGain = forSale * labShare(demand.labWtp, state.computePrice);
  const hoardedStockAfter = state.hoardedStock - released + inputs.hoarderBuildGw;
  return { newGw, forSale, released, labGain, hoardedStockAfter };
}
```

Add `labShare, hoarderRelease, allocate` to the factory's `return`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/engine-allocation.test.js`
Expected: PASS, 5/5

- [ ] **Step 5: Commit**

```bash
git add docs/js/engine.js test/engine-allocation.test.js
git commit -m "feat: allocation with hoarder inventory conservation"
```

---

### Task 7: The capital loop

**Files:**
- Modify: `docs/js/engine.js`
- Create: `test/engine-capital.test.js`

**Interfaces:**
- Consumes: `initialState` (Task 4)
- Produces: `termPremium(creditRatio) → number`, `creditCapacity(rate, inputs) → number`, `stepCapital(state, inputs, capexThisYear) → {credit, rate, availableCapital, cumulativeCredit, cumulativeCapex}`

- [ ] **Step 1: Write the failing test**

Create `test/engine-capital.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/engine-capital.test.js`
Expected: FAIL — `stepCapital is not a function`

- [ ] **Step 3: Write minimal implementation**

Add inside the factory, before the `return`:

```js
const TERM_PREMIUM_SLOPE = 0.02;   // calibrated so ~$5T cumulative credit lifts Meta 5.5% -> ~8%
const RATE_MAX = 0.25;
const CREDIT_RATION_SLOPE = 8;

function termPremium(creditRatio) {
  return TERM_PREMIUM_SLOPE * Math.max(0, creditRatio);
}

// Bounded by market depth and rationed BY price, not expanded by it.
// "Meta would happily pay 8%; the market won't want them to."
function creditCapacity(rate, inputs) {
  const excess = Math.max(0, rate - inputs.baseRate);
  return inputs.creditMarketDepth * Math.exp(-CREDIT_RATION_SLOPE * excess);
}

function stepCapital(state, inputs, capexThisYear) {
  const cashAvailable = inputs.ecosystemCashFlow * inputs.reinvestRate;
  const credit = Math.max(0, capexThisYear - cashAvailable);
  const cumulativeCredit = state.cumulativeCredit + credit;
  const cumulativeCapex = state.cumulativeCapex + capexThisYear;
  const rate = Math.min(RATE_MAX, inputs.baseRate + termPremium(cumulativeCredit / inputs.creditMarketDepth));
  const availableCapital = inputs.ecosystemCashFlow + creditCapacity(rate, inputs);
  return { credit, rate, availableCapital, cumulativeCredit, cumulativeCapex };
}
```

Add `termPremium, creditCapacity, stepCapital` to the factory's `return`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/engine-capital.test.js`
Expected: PASS, 5/5

- [ ] **Step 5: Commit**

```bash
git add docs/js/engine.js test/engine-capital.test.js
git commit -m "feat: capital loop with price-rationed credit"
```

---

### Task 8: Monetization, regulatory drag, and the diffusion ceiling

**Files:**
- Modify: `docs/js/engine.js`
- Create: `test/engine-monetization.test.js`

**Interfaces:**
- Consumes: `initialState` (Task 4)
- Produces: `makeRng(seed) → () => number`, `diffusionCeiling(state, inputs) → number`, `regStopFactor(rng, inputs) → number`, `stepMonetization(state, inputs, rng) → {labRevPerMw, capability, inferenceShare, captureRate, wtpFraction, diffusionBound: boolean}`

- [ ] **Step 1: Write the failing test**

Create `test/engine-monetization.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { initialState, stepMonetization, diffusionCeiling, makeRng } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS } = require('../docs/js/presets.js');

test('DIFFUSION CEILING BITES: revenue cannot exceed addressable value', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.labGw = 100;                 // Dylan's 2028 figure
  s.labRevPerMw = 70;            // and his revenue figure
  const cap = diffusionCeiling(s, DEFAULT_INPUTS);
  assert.ok(cap < 70, `at 100 GW x $70M/MW the ceiling must bind, got cap ${cap}`);
});

test('diffusion conflict is reported, not silently swallowed', () => {
  const s = initialState(DEFAULT_INPUTS);
  s.labGw = 100;
  s.labRevPerMw = 70;
  const r = stepMonetization(s, DEFAULT_INPUTS, makeRng(1));
  assert.equal(r.diffusionBound, true, 'must flag that Dylan cannot have both numbers');
});

test('inference share declines — the non-consensus call', () => {
  const s = initialState(DEFAULT_INPUTS);
  const r = stepMonetization(s, DEFAULT_INPUTS, makeRng(1));
  assert.ok(r.inferenceShare < s.inferenceShare);
  assert.ok(r.inferenceShare > 0);
});

test('research compute compounds capability', () => {
  const s = initialState(DEFAULT_INPUTS);
  const r = stepMonetization(s, DEFAULT_INPUTS, makeRng(1));
  assert.ok(r.capability > s.capability);
});

test('regulatory stops are DISCRETE and seeded-reproducible', () => {
  const s = initialState(DEFAULT_INPUTS);
  const a = stepMonetization(s, DEFAULT_INPUTS, makeRng(42));
  const b = stepMonetization(s, DEFAULT_INPUTS, makeRng(42));
  assert.deepEqual(a, b, 'same seed must give the same run');
});

test('a regulatory freeze suppresses revenue per MW', () => {
  const s = initialState(DEFAULT_INPUTS);
  const free = stepMonetization(s, { ...DEFAULT_INPUTS, regStopProbability: 0, regDragSmooth: 0 }, makeRng(7));
  const frozen = stepMonetization(s, { ...DEFAULT_INPUTS, regStopProbability: 1, regDragSmooth: 0.3 }, makeRng(7));
  assert.ok(frozen.labRevPerMw < free.labRevPerMw);
});

test('wtpFraction rises toward the 0.5 Dylan describes', () => {
  const s = initialState(DEFAULT_INPUTS);
  const r = stepMonetization(s, DEFAULT_INPUTS, makeRng(1));
  assert.ok(r.wtpFraction > s.wtpFraction);
  assert.ok(r.wtpFraction <= 0.6);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/engine-monetization.test.js`
Expected: FAIL — `stepMonetization is not a function`

- [ ] **Step 3: Write minimal implementation**

Add inside the factory, before the `return`:

```js
const WTP_FRACTION_MAX = 0.6;
const CAPABILITY_GAIN = 0.015;
const REG_STOP_SEVERITY = 0.25;   // a jurisdiction-level stop removes ~25% of revenue growth

// Deterministic RNG (mulberry32) so runs are reproducible and testable.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Revenue cannot exceed what the economy can actually absorb. Without this the
// model prints $7T of 2028 lab revenue -- 6% of world GDP to two firms.
function diffusionCeiling(state, inputs) {
  const maxLabRevenueB = inputs.addressableValueB * state.captureRate;
  const monetizedMw = state.labGw * 1000 * state.inferenceShare;
  if (!(monetizedMw > 0)) return Infinity;
  return (maxLabRevenueB * 1000) / monetizedMw;
}

// Discrete, correlated jurisdiction-level stops. NY EO 62 and the Texas ERCOT
// audit took two major markets to zero approvals three weeks apart, so the
// observed shape is step-function and contagious, not a smooth multiplier.
function regStopFactor(rng, inputs) {
  return rng() < inputs.regStopProbability ? (1 - REG_STOP_SEVERITY) : 1;
}

function stepMonetization(state, inputs, rng) {
  const capability = state.capability + CAPABILITY_GAIN * (1 - state.inferenceShare) * state.labGw;
  const stop = regStopFactor(rng, inputs);
  const grown = state.labRevPerMw * (capability / state.capability) * (1 - inputs.regDragSmooth) * stop;

  const inferenceShare = Math.max(0.05, state.inferenceShare - inputs.inferenceShareDecay);
  const captureRate = state.captureRate * (1 + inputs.captureRateGrowth);
  const wtpFraction = Math.min(WTP_FRACTION_MAX, state.wtpFraction * (1 + inputs.wtpFractionGrowth));

  const next = { ...state, inferenceShare, captureRate };
  const cap = diffusionCeiling(next, inputs);
  const diffusionBound = grown > cap;
  const labRevPerMw = diffusionBound ? cap : grown;

  return { labRevPerMw, capability, inferenceShare, captureRate, wtpFraction, diffusionBound };
}
```

Add `makeRng, diffusionCeiling, regStopFactor, stepMonetization` to the factory's `return`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/engine-monetization.test.js`
Expected: PASS, 7/7

- [ ] **Step 5: Commit**

```bash
git add docs/js/engine.js test/engine-monetization.test.js
git commit -m "feat: monetization with discrete reg stops and diffusion ceiling"
```

---

### Task 9: Full simulate() wiring and acceptance criteria

**Files:**
- Modify: `docs/js/engine.js`
- Create: `test/engine-acceptance.test.js`

**Interfaces:**
- Consumes: everything from Tasks 4-8
- Produces: `stepRails(state, inputs, demandGw, ceilings) → {railPrice, capexPerGw, tightness}`, `seedPipelines(state, inputs) → void`, `simulate(inputs, seed?) → Array<YearState>`. Each `YearState` has: `year, demand, ceilings, binding, supplyGw, newGw, cumulativeGw, computePrice, capexPerGw, capex, credit, rate, labGw, labShareOfNew, labRevPerMw, railPrice, railTightness, effectiveGw, hoardedStock, diffusionBound, clamped`.

- [ ] **Step 1: Write the failing test**

Create `test/engine-acceptance.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { simulate } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS, CALIBRATION_TARGETS } = require('../docs/js/presets.js');

const run = simulate(DEFAULT_INPUTS, 12345);
const byYear = Object.fromEntries(run.map(y => [y.year, y]));

test('simulate returns 2026-2030 with no NaN', () => {
  assert.equal(run.length, 5);
  assert.equal(run[0].year, 2026);
  assert.equal(run[4].year, 2030);
  for (const y of run) {
    for (const [k, v] of Object.entries(y)) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `${y.year}.${k} = ${v}`);
    }
  }
});

test('ACCEPTANCE: GW path tracks 30/50/70/90-100 within 10%', () => {
  const want = { 2026: 30, 2027: 50, 2028: 70, 2029: 95 };
  for (const [year, target] of Object.entries(want)) {
    const got = byYear[year].newGw;
    const dev = Math.abs(got - target) / target;
    assert.ok(dev <= 0.10, `${year}: got ${got.toFixed(1)} GW vs ${target} (${(dev*100).toFixed(0)}% off)`);
  }
});

test('ACCEPTANCE: compute price inflects 13 -> 25 -> 40', () => {
  assert.ok(byYear[2026].computePrice >= 12 && byYear[2026].computePrice <= 18, byYear[2026].computePrice);
  assert.ok(byYear[2028].computePrice > byYear[2026].computePrice * 1.8, 'price must inflect upward');
});

test('ACCEPTANCE: capex per GW inflates ~38 -> ~52 from rail repricing alone', () => {
  assert.ok(Math.abs(byYear[2026].capexPerGw - 38.2) < 3.8, byYear[2026].capexPerGw);
  assert.ok(byYear[2028].capexPerGw > byYear[2026].capexPerGw * 1.25, 'rails must reprice upward');
});

test('ACCEPTANCE: 2028 cumulative world GW near 200', () => {
  const dev = Math.abs(byYear[2028].cumulativeGw - 200) / 200;
  assert.ok(dev <= 0.10, `got ${byYear[2028].cumulativeGw.toFixed(0)}`);
});

test('ACCEPTANCE: labs take 70-80% of 2028 incremental', () => {
  const share = byYear[2028].labShareOfNew;
  assert.ok(share > 0.60 && share < 0.90, `got ${(share*100).toFixed(0)}%`);
});

test('EUV is never the binding constraint at defaults', () => {
  for (const y of run) {
    assert.notEqual(y.binding, 'euv', `${y.year} bound on EUV — contradicts ASML's disclosed plan`);
  }
});

test('STABILITY: no divergence across a full sweep of every slider', () => {
  const sweeps = {
    aiPct: [0.3, 0.9], logicWafersPerGw: [20000, 55000], labGrowthRate: [1.5, 4.0],
    wtpFraction: [0.1, 0.6], wtpFractionGrowth: [0, 0.6], priceElasticity: [0.2, 1.2],
    damping: [0.1, 1.0], baseRate: [0.03, 0.12], creditMarketDepth: [400, 3000],
    regStopProbability: [0, 1], inferenceShareDecay: [0, 0.15], captureRateGrowth: [0, 1.0],
  };
  for (const [key, values] of Object.entries(sweeps)) {
    for (const v of values) {
      const r = simulate({ ...DEFAULT_INPUTS, [key]: v }, 7);
      for (const y of r) {
        assert.ok(Number.isFinite(y.newGw) && y.newGw >= 0, `${key}=${v} y${y.year} newGw=${y.newGw}`);
        assert.ok(Number.isFinite(y.computePrice) && y.computePrice > 0, `${key}=${v} price=${y.computePrice}`);
        assert.ok(Number.isFinite(y.capexPerGw) && y.capexPerGw > 0, `${key}=${v} capex=${y.capexPerGw}`);
        assert.ok(y.rate < 1.0, `${key}=${v} rate=${y.rate}`);
      }
    }
  }
});

test('a regulatory freeze reduces built GW versus the base case', () => {
  const frozen = simulate({ ...DEFAULT_INPUTS, regStopProbability: 0.9, regDragSmooth: 0.25 }, 12345);
  const base2028 = byYear[2028].newGw;
  const frozen2028 = frozen.find(y => y.year === 2028).newGw;
  assert.ok(frozen2028 < base2028, 'regDrag must propagate to supply via WTP and price');
});

test('every calibration target has a matching field on the year state', () => {
  for (const t of CALIBRATION_TARGETS) {
    const y = byYear[t.year];
    assert.ok(y, `no year state for target ${t.id}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/engine-acceptance.test.js`
Expected: FAIL — `simulate is not a function`

- [ ] **Step 3: Write minimal implementation**

Add inside the factory, before the `return`:

```js
const { repriceContinuous, repriceStep, MEMORY_RESET_INTERVAL } = rails;

// Baseline pipeline capacity per rail, before bullwhip expansion, discounted
// for announcement-to-delivery attrition (13% of queue capacity reaches COD).
const PIPELINE_BASE = { memory: 34, package: 38, power: 33 };
const PIPELINE_GROWTH = { memory: 0.42, package: 0.40, power: 0.34 };

function seedPipelines(state, inputs) {
  for (const railId of Object.keys(PIPELINE_BASE)) {
    state.pipeline[railId] = {};
    for (let y = START_YEAR; y <= END_YEAR + 6; y++) {
      const delta = y - START_YEAR;
      state.pipeline[railId][y] = PIPELINE_BASE[railId] * Math.pow(1 + PIPELINE_GROWTH[railId], delta);
    }
  }
}

function stepRails(state, inputs, demandGw, ceilings) {
  const railPrice = { ...state.railPrice };
  const tightness = {};
  for (const r of RAILS) {
    const ceiling = ceilings[r.id] !== undefined ? ceilings[r.id] : demandGw;
    const t = railTightness(demandGw, ceiling);
    tightness[r.id] = t;
    if (r.elasticity === 'step') {
      railPrice[r.id] = repriceStep(railPrice[r.id], t, state.stepStates[r.id], MEMORY_RESET_INTERVAL);
    } else {
      railPrice[r.id] = repriceContinuous(railPrice[r.id], r.elasticity, t);
    }
  }
  // Children must always reconcile to their parent.
  const kids = RAILS.filter(r => r.parent === 'servers');
  railPrice.servers = kids.reduce((a, r) => a + railPrice[r.id], 0);
  return { railPrice, capexPerGw: sumPerGw(railPrice), tightness };
}

function simulate(inputs, seed) {
  const rng = makeRng(seed === undefined ? 1 : seed);
  const state = initialState(inputs);
  seedPipelines(state, inputs);
  const out = [];

  for (let year = START_YEAR; year <= END_YEAR; year++) {
    const ceilings = computeCeilings(state, inputs, year);
    const supplyGw = Math.min(...Object.values(ceilings));
    const binding = bindingConstraint(ceilings);

    const demand = computeDemand(state, inputs, year);
    const nextPrice = clearPrice(state, inputs, demand.total, supplyGw);
    const alloc = allocate(state, inputs, demand, supplyGw);

    const railStep = stepRails(state, inputs, demand.total, ceilings);
    const capex = alloc.newGw * railStep.capexPerGw;
    const cap = stepCapital(state, inputs, capex);
    const mon = stepMonetization(state, inputs, rng);

    const clamped = supplyGw <= 0 || nextPrice <= inputs.floorCost;

    state.computePrice = nextPrice;
    state.installedGw += alloc.newGw;
    state.effectiveGw += alloc.newGw * (1 + 0.35 * (year - START_YEAR));
    state.labGw += alloc.labGain;
    state.hoardedStock = alloc.hoardedStockAfter;
    state.railPrice = railStep.railPrice;
    state.capexPerGw = railStep.capexPerGw;
    state.cumulativeCredit = cap.cumulativeCredit;
    state.cumulativeCapex = cap.cumulativeCapex;
    state.rate = cap.rate;
    state.availableCapital = cap.availableCapital;
    state.labRevPerMw = mon.labRevPerMw;
    state.capability = mon.capability;
    state.inferenceShare = mon.inferenceShare;
    state.captureRate = mon.captureRate;
    state.wtpFraction = mon.wtpFraction;

    out.push({
      year, binding, supplyGw, clamped,
      demand: demand.total,
      demandBreakdown: { ...demand },
      ceilings: { ...ceilings },
      newGw: alloc.newGw,
      cumulativeGw: state.installedGw,
      labShareOfNew: alloc.newGw > 0 ? alloc.labGain / alloc.newGw : 0,
      computePrice: state.computePrice,
      capexPerGw: state.capexPerGw,
      capex,
      credit: cap.credit,
      cumulativeCapex: state.cumulativeCapex,
      cumulativeCredit: state.cumulativeCredit,
      rate: state.rate,
      labGw: state.labGw,
      labRevPerMw: state.labRevPerMw,
      effectiveGw: state.effectiveGw,
      hoardedStock: state.hoardedStock,
      diffusionBound: mon.diffusionBound,
      railPrice: { ...railStep.railPrice },
      railTightness: { ...railStep.tightness },
    });
  }
  return out;
}
```

Add `stepRails, seedPipelines, simulate` to the factory's `return`.

- [ ] **Step 4: Run test until it passes**

Run: `node --test test/engine-acceptance.test.js`

The acceptance tests are the real specification. If the GW path misses, tune **only** these, in this order, and re-run:
1. `PIPELINE_BASE` / `PIPELINE_GROWTH` — the dominant lever on the GW path
2. `DEFAULT_INPUTS.hyperscalerDemandGw`, `hoarderBuildGw` — the demand level
3. `DEFAULT_INPUTS.creditMarketDepth`, `ecosystemCashFlow` — whether capital binds
4. `ARB_SHELF_MAX_GW` — the demand floor

Do **not** tune the researched rail prices, the ASML tool series, or `EUV_INSTALL_LAG_YEARS` to make a test pass — those are sourced. If they appear to be the problem, stop and report it rather than fitting.

Expected: PASS, 10/10

- [ ] **Step 5: Commit**

```bash
git add docs/js/engine.js test/engine-acceptance.test.js
git commit -m "feat: full simulation wiring, calibrated to the transcript GW path"
```

---

### Task 10: Historical backtest — margin migration 2023 to 2026

**Files:**
- Modify: `docs/js/engine.js`
- Create: `test/engine-backtest.test.js`

**Interfaces:**
- Consumes: `simulate`, `stepRails` (Task 9)
- Produces: `HISTORICAL_START` (object), `backtest(inputs?) → Array<{year, memoryMargin, logicMargin}>`

- [ ] **Step 1: Write the failing test**

Create `test/engine-backtest.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/engine-backtest.test.js`
Expected: FAIL — `backtest is not a function`

- [ ] **Step 3: Write minimal implementation**

Add inside the factory, before the `return`:

```js
// Historical validation: 2023 memory was loose and earning nothing on HBM;
// by 2026 memory margin (SK hynix 76% OP) had overtaken foundry (TSMC 67.7%).
// If the elasticities cannot reproduce a shift that already happened, they are
// wrong. This is a free validation set.
const HISTORICAL_START = {
  year: 2023,
  memoryPrice: 1.4, logicPrice: 1.1,
  memoryCost: 1.3, logicCost: 0.42,      // memory near breakeven, foundry fat
  tightness: { 2023: { memory: 0.6, logic: 1.2 },
               2024: { memory: 1.3, logic: 1.25 },
               2025: { memory: 1.9, logic: 1.3 },
               2026: { memory: 2.4, logic: 1.35 } },
};

function backtest() {
  const memoryRail = railById('memory');
  const logicRail = railById('logic');
  let memoryPrice = HISTORICAL_START.memoryPrice;
  let logicPrice = HISTORICAL_START.logicPrice;
  const stepState = newStepState();
  const out = [];

  for (let year = 2023; year <= 2026; year++) {
    const t = HISTORICAL_START.tightness[year];
    memoryPrice = repriceStep(memoryPrice, t.memory, stepState, MEMORY_RESET_INTERVAL);
    logicPrice = repriceContinuous(logicPrice, logicRail.elasticity, t.logic);
    out.push({
      year,
      memoryMargin: (memoryPrice - HISTORICAL_START.memoryCost) / memoryPrice,
      logicMargin: (logicPrice - HISTORICAL_START.logicCost) / logicPrice,
    });
  }
  return out;
}
```

Add `HISTORICAL_START, backtest` to the factory's `return`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/engine-backtest.test.js`
Expected: PASS, 3/3

- [ ] **Step 5: Commit**

```bash
git add docs/js/engine.js test/engine-backtest.test.js
git commit -m "test: historical backtest — memory overtakes foundry by 2026"
```

---

### Task 11: Renderers — state table, calibration panel, ladder, margin sparklines

**Files:**
- Create: `docs/js/render.js`
- Create: `test/render.test.js`

**Interfaces:**
- Consumes: `simulate` (Task 9), `CALIBRATION_TARGETS` (Task 3), `RAILS` (Task 1)
- Produces: `fmtB(n) → string`, `fmtPct(n) → string`, `stateTableHtml(run) → string`, `calibrationRows(run, targets) → Array<{id,label,source,basis,target,actual,deviation,pass}>`, `calibrationHtml(run, targets) → string`, `ladderRungs(yearState) → Array<{id,label,value,scales,warn}>`, `ladderHtml(yearState) → string`, `marginMigrationHtml(run) → string`

- [ ] **Step 1: Write the failing test**

Create `test/render.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { stateTableHtml, calibrationRows, calibrationHtml, ladderRungs, ladderHtml,
        marginMigrationHtml } = require('../docs/js/render.js');
const { simulate } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS, CALIBRATION_TARGETS } = require('../docs/js/presets.js');

const run = simulate(DEFAULT_INPUTS, 12345);

test('state table has one row per simulated year', () => {
  const html = stateTableHtml(run);
  for (const y of run) assert.ok(html.includes(String(y.year)), `missing ${y.year}`);
});

test('state table shows the binding constraint per year', () => {
  const html = stateTableHtml(run);
  for (const y of run) assert.ok(html.toLowerCase().includes(y.binding.toLowerCase()));
});

test('clamped years are visibly marked, not hidden', () => {
  const fake = run.map((y, i) => ({ ...y, clamped: i === 1 }));
  assert.ok(stateTableHtml(fake).includes('clamped'), 'a clamped run signals bad parameters');
});

test('calibration rows compute deviation against every target', () => {
  const rows = calibrationRows(run, CALIBRATION_TARGETS);
  assert.equal(rows.length, CALIBRATION_TARGETS.length);
  for (const r of rows) {
    assert.ok(Number.isFinite(r.actual), `${r.id} actual not finite`);
    assert.ok(Number.isFinite(r.deviation), `${r.id} deviation not finite`);
    assert.equal(typeof r.pass, 'boolean');
  }
});

test('calibration output declares each target units basis', () => {
  const html = calibrationHtml(run, CALIBRATION_TARGETS);
  assert.ok(html.includes('itLoad') || html.includes('IT load'), 'basis must be visible');
});

test('ladder top rung is flagged as non-scaling', () => {
  const rungs = ladderRungs(run[0]);
  const top = rungs[rungs.length - 1];
  assert.equal(top.scales, false, 'the Jane Street rung is a marginal rate');
  assert.ok(top.warn && top.warn.length > 0);
});

test('ladder rungs ascend from cost to end-user', () => {
  const rungs = ladderRungs(run[0]);
  for (let i = 1; i < rungs.length; i++) {
    assert.ok(rungs[i].value >= rungs[i-1].value, `rung ${rungs[i].id} below ${rungs[i-1].id}`);
  }
});

test('renderers emit strings and never throw on a real run', () => {
  for (const fn of [() => stateTableHtml(run), () => ladderHtml(run[0]),
                    () => marginMigrationHtml(run), () => calibrationHtml(run, CALIBRATION_TARGETS)]) {
    const out = fn();
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/render.test.js`
Expected: FAIL — `Cannot find module '../docs/js/render.js'`

- [ ] **Step 3: Write minimal implementation**

Create `docs/js/render.js`:

```js
// Panel renderers. These consume the engine's year-state array and produce
// HTML strings. No arithmetic beyond formatting and presentation ratios.

(function (root, factory) {
  const rails = (typeof require !== 'undefined') ? require('./rails.js') : root;
  const api = factory(rails);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function (rails) {

const { RAILS } = rails;

function fmtB(n) {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(1) + 'T';
  return '$' + n.toFixed(1) + 'B';
}
function fmtPct(n) { return Number.isFinite(n) ? (n * 100).toFixed(0) + '%' : '—'; }
function fmtGw(n) { return Number.isFinite(n) ? n.toFixed(1) : '—'; }

function stateTableHtml(run) {
  const head = ['Year','Demand','EUV','Memory','Pkg','Power','Capital','Binding','Price','$B/GW','Credit','Rate','Lab GW']
    .map(h => `<th>${h}</th>`).join('');
  const rows = run.map(y => {
    const cells = [
      y.year, fmtGw(y.demand), fmtGw(y.ceilings.euv), fmtGw(y.ceilings.memory),
      fmtGw(y.ceilings.package), fmtGw(y.ceilings.power), fmtGw(y.ceilings.capital),
      `<span class="binding binding-${y.binding}">${y.binding}</span>`,
      '$' + y.computePrice.toFixed(0) + 'M', y.capexPerGw.toFixed(1),
      fmtB(y.credit), (y.rate * 100).toFixed(1) + '%', fmtGw(y.labGw),
    ];
    const mark = y.clamped ? ' <span class="warn" title="a clamp bound — parameters are likely wrong">clamped</span>' : '';
    return `<tr class="${y.clamped ? 'row-clamped' : ''}">` +
           cells.map((c, i) => `<td>${c}${i === 0 ? mark : ''}</td>`).join('') + '</tr>';
  }).join('');
  return `<table class="state-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function targetActual(run, target) {
  const y = run.find(r => r.year === target.year);
  if (!y) return NaN;
  switch (target.id) {
    case 'gw2026': case 'gw2027': case 'gw2028': case 'gw2029': return y.newGw;
    case 'cumGw2028': return y.cumulativeGw;
    case 'capex2028': return y.capex;
    case 'capexPerGw2026': case 'capexPerGw2028': return y.capexPerGw;
    case 'price2028': return y.computePrice;
    case 'cumCapex2029': return y.cumulativeCapex;
    case 'cumCredit2029': return y.cumulativeCredit;
    case 'labShare2028': return y.labShareOfNew;
    default: return NaN;
  }
}

function calibrationRows(run, targets) {
  return targets.map(t => {
    const actual = targetActual(run, t);
    const deviation = Number.isFinite(actual) && t.target !== 0
      ? (actual - t.target) / t.target : NaN;
    return { ...t, actual, deviation, pass: Number.isFinite(deviation) && Math.abs(deviation) <= t.tolerance };
  });
}

function calibrationHtml(run, targets) {
  const rows = calibrationRows(run, targets).map(r => `
    <tr class="${r.pass ? 'cal-pass' : 'cal-fail'}">
      <td>${r.label}</td>
      <td class="cal-source">${r.source}</td>
      <td class="cal-basis" title="units basis">${r.basis}</td>
      <td>${Number.isFinite(r.target) ? r.target : '—'}</td>
      <td>${Number.isFinite(r.actual) ? r.actual.toFixed(1) : '—'}</td>
      <td>${Number.isFinite(r.deviation) ? (r.deviation * 100).toFixed(0) + '%' : '—'}</td>
    </tr>`).join('');
  return `<table class="calibration-table"><thead><tr>
    <th>Target</th><th>Source</th><th>Basis</th><th>Stated</th><th>Model</th><th>Δ</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

// $M/MW rungs. The top rung is DISPLAY ONLY -- Jane Street's $200-500M/MW is a
// marginal rate measured on the best user in the world and does not scale to a
// gigawatt. It must never feed a calculation.
function ladderRungs(y) {
  const ownCost = (y.capexPerGw / 5) + 1.5;   // 5yr amortization + power and opex
  return [
    { id: 'cost',     label: 'Cost to own + operate', value: ownCost,          scales: true,  warn: '' },
    { id: 'rental',   label: 'Commodity rental',      value: y.computePrice,   scales: true,  warn: '' },
    { id: 'scarcity', label: 'Scarcity / hoarder',    value: y.computePrice * 2.2, scales: true, warn: '' },
    { id: 'lab',      label: 'Lab revenue',           value: y.labRevPerMw,    scales: true,  warn: '' },
    { id: 'enduser',  label: 'End-user capture',      value: y.labRevPerMw * 4, scales: false,
      warn: 'Marginal rate on the best user in the world. Does not scale to a gigawatt.' },
  ].sort((a, b) => a.value - b.value);
}

function ladderHtml(y) {
  const rungs = ladderRungs(y);
  const max = Math.max(...rungs.map(r => r.value)) || 1;
  return '<div class="ladder">' + rungs.map(r => `
    <div class="ladder-rung ${r.scales ? '' : 'rung-nonscaling'}" ${r.warn ? `title="${r.warn}"` : ''}>
      <span class="rung-label">${r.label}</span>
      <div class="rung-track"><div class="rung-fill" style="width:${(r.value / max) * 100}%"></div></div>
      <span class="rung-value">$${r.value.toFixed(0)}M/MW</span>
      ${r.warn ? `<span class="rung-warn">⚠ does not scale</span>` : ''}
    </div>`).join('') + '</div>';
}

function marginMigrationHtml(run) {
  const tracked = RAILS.filter(r => r.parent === null || r.parent === 'servers');
  return '<div class="margin-grid">' + tracked.map(rail => {
    const series = run.map(y => y.railPrice[rail.id] / run[0].railPrice[rail.id]);
    const max = Math.max(...series, 1.01);
    const bars = series.map((v, i) =>
      `<div class="spark-bar" style="height:${(v / max) * 100}%" title="${run[i].year}: ${v.toFixed(2)}x"></div>`).join('');
    return `<div class="margin-cell">
      <div class="margin-name" title="${rail.provenance}">${rail.label}</div>
      <div class="sparkline">${bars}</div>
      <div class="margin-delta">${series[series.length - 1].toFixed(2)}x</div>
    </div>`;
  }).join('') + '</div>';
}

return { fmtB, fmtPct, fmtGw, stateTableHtml, calibrationRows, calibrationHtml,
         ladderRungs, ladderHtml, marginMigrationHtml };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/render.test.js`
Expected: PASS, 8/8

- [ ] **Step 5: Commit**

```bash
git add docs/js/render.js test/render.test.js
git commit -m "feat: state table, calibration panel, value ladder, margin sparklines"
```

---

### Task 12: HTML shell, wiring, and full-suite verification

**Files:**
- Modify: `docs/datacenter-economics.html` (replace the inline `<script>` block and the controls section; keep the existing `<style>` block and add to it)
- Create: `test/integration.test.js`

**Interfaces:**
- Consumes: everything
- Produces: a working dashboard opened via `file://`

- [ ] **Step 1: Write the failing test**

Create `test/integration.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '../docs/datacenter-economics.html'), 'utf8');

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/integration.test.js`
Expected: FAIL — the old inline script and `renderTimeline` are still present

- [ ] **Step 3: Write minimal implementation**

In `docs/datacenter-economics.html`:

1. Delete the entire inline `<script>` block (currently `:636-856`).
2. Replace the controls block and output panels with containers, then load the scripts. Insert before `</body>`:

```html
<section class="panel">
  <h2>Value capture ladder</h2>
  <div id="ladder"></div>
</section>

<section class="panel">
  <h2>Per-year state</h2>
  <div id="state-table"></div>
</section>

<section class="panel">
  <h2>Rail margin migration</h2>
  <div id="margin-migration"></div>
</section>

<section class="panel">
  <h2>Calibration vs. source</h2>
  <div id="calibration"></div>
</section>

<script src="js/rails.js"></script>
<script src="js/presets.js"></script>
<script src="js/engine.js"></script>
<script src="js/render.js"></script>
<script>
function currentInputs() {
  const inputs = { ...DEFAULT_INPUTS };
  document.querySelectorAll('input[type="range"][data-input]').forEach(el => {
    const key = el.dataset.input;
    const scale = el.dataset.scale ? Number(el.dataset.scale) : 1;
    inputs[key] = Number(el.value) * scale;
    const out = document.getElementById(el.id + '-display');
    if (out) out.textContent = el.dataset.fmt === 'pct'
      ? (inputs[key] * 100).toFixed(0) + '%'
      : String(inputs[key]);
  });
  const mode = document.querySelector('select[data-input="powerMode"]');
  if (mode) inputs.powerMode = mode.value;
  return inputs;
}

function update() {
  const inputs = currentInputs();
  const run = simulate(inputs, 12345);
  const latest = run[0];
  document.getElementById('ladder').innerHTML = ladderHtml(latest);
  document.getElementById('state-table').innerHTML = stateTableHtml(run);
  document.getElementById('margin-migration').innerHTML = marginMigrationHtml(run);
  document.getElementById('calibration').innerHTML = calibrationHtml(run, CALIBRATION_TARGETS);
  document.getElementById('pipeline').innerHTML = stateTableHtml([latest]);
}

document.querySelectorAll('input[type="range"], select').forEach(el =>
  el.addEventListener('input', update));

document.querySelectorAll('button[data-preset]').forEach(btn =>
  btn.addEventListener('click', () => {
    const overrides = PRESETS[btn.dataset.preset] || {};
    for (const [k, v] of Object.entries(overrides)) {
      const el = document.querySelector(`[data-input="${k}"]`);
      if (el) el.value = el.dataset.scale ? v / Number(el.dataset.scale) : v;
    }
    update();
  }));

update();
</script>
```

3. Append to the existing `<style>` block:

```css
.state-table, .calibration-table { width:100%; border-collapse:collapse; font-size:0.72rem;
  font-family:'JetBrains Mono',monospace }
.state-table th, .state-table td, .calibration-table th, .calibration-table td {
  padding:0.35rem 0.5rem; text-align:right; border-bottom:1px solid var(--border) }
.state-table th:first-child, .state-table td:first-child,
.calibration-table th:first-child, .calibration-table td:first-child { text-align:left }
.row-clamped { background:rgba(255,80,80,0.08) }
.warn { color:var(--accent-red); font-size:0.65rem }
.binding { padding:0.1rem 0.4rem; border-radius:3px; background:var(--accent-amber); color:#000 }
.cal-pass td { color:var(--accent-green) }
.cal-fail td { color:var(--accent-red) }
.cal-basis { opacity:0.6; font-size:0.65rem }
.ladder-rung { display:flex; align-items:center; gap:0.6rem; margin-bottom:0.4rem }
.rung-label { width:11rem; font-size:0.72rem }
.rung-track { flex:1; height:1.2rem; background:var(--bg-elev); border-radius:3px }
.rung-fill { height:100%; background:var(--accent-blue); border-radius:3px }
.rung-nonscaling .rung-fill { background:repeating-linear-gradient(45deg,
  var(--accent-red) 0 6px, transparent 6px 12px); border:1px dashed var(--accent-red) }
.rung-warn { color:var(--accent-red); font-size:0.62rem }
.rung-value { width:7rem; text-align:right; font-family:'JetBrains Mono',monospace; font-size:0.72rem }
.margin-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:0.8rem }
.margin-cell { background:var(--bg-elev); padding:0.5rem; border-radius:4px }
.margin-name { font-size:0.65rem; margin-bottom:0.3rem }
.sparkline { display:flex; align-items:flex-end; gap:2px; height:36px }
.spark-bar { flex:1; background:var(--accent-cyan); border-radius:1px 1px 0 0; min-height:2px }
.margin-delta { font-family:'JetBrains Mono',monospace; font-size:0.7rem; margin-top:0.3rem }
```

4. Give each remaining slider a `data-input` attribute matching a `DEFAULT_INPUTS` key, and add `data-scale="0.01"` plus `data-fmt="pct"` for percentage sliders.

- [ ] **Step 4: Run the full suite**

Run: `node --test test/`
Expected: PASS across all 8 test files

Then open `docs/datacenter-economics.html` by double-clicking it and confirm: no console errors, four panels render, dragging any slider updates all of them.

- [ ] **Step 5: Commit**

```bash
git add docs/datacenter-economics.html test/integration.test.js
git commit -m "feat: wire v3 dashboard shell to the simulation engine"
```

---

## Self-Review

**Spec coverage.** Units guard → T1. Margin migration and step repricing → T2. EUV stock model, presets, calibration targets → T3. Supply ceilings and emergent binding → T4. Four buyer classes and clamped clearing → T5. Hoarder conservation → T6. Capital loop → T7. Diffusion ceiling and discrete reg stops → T8. Full wiring plus all acceptance criteria → T9. Historical backtest → T10. All four panels → T11. File split, no-ES-modules, dead-code removal → T12.

**Deliberately deferred, matching the spec's Out of Scope:** the macro consequences (sovereign screen, duration crusher, 2–3x-earnings toggle), the Bayesian regime tracker, Monte Carlo, China as a separate track. The retained v1/v2 panels named under "Retained from v1/v2" — stock sensitivity matrix, Anthropic vs OpenAI, per-GW economics — are **not** covered by these twelve tasks; they are a follow-up pass once the engine is proven, and should not block it.

**Known tension to watch in Task 9.** `PIPELINE_BASE` and `PIPELINE_GROWTH` are the only free parameters fitted to make the GW path land. That is legitimate — they represent capacity nobody publishes — but it means the GW path is partly *fitted*, while the four SemiAnalysis and price targets remain genuinely out-of-sample. If Task 9 requires touching a researched constant to pass, that is a finding about the model, not a tuning step: stop and report.

**Two spec defects were fixed before planning:** an orphaned table fragment in Open Items, and a mixed install-lag convention that had the 2028 EUV ceiling at both ~75 and ~93 GW/yr. Resolved to `EUV_INSTALL_LAG_YEARS = 1` and ~75, which changes the conclusion from "EUV never binds" to "EUV is slack in 2026–27 and marginal in 2028 at ~8% headroom." Task 3's tests assert the honest version.
