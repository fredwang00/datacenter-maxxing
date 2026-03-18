# Datacenter Dashboard v2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the single-file datacenter economics dashboard from a single-constraint EUV calculator into a multi-constraint scenario engine with demand elasticity modeling and equity mapping.

**Architecture:** Single HTML file (`docs/datacenter-economics.html`), no dependencies. All new features are additive CSS + HTML + JS within the existing file. Compute logic is separated from render logic in the JS section.

**Tech Stack:** Vanilla HTML/CSS/JS. No build step, no libraries.

**Spec:** `docs/superpowers/specs/2026-03-17-datacenter-dashboard-v2-design.md`

**Verification approach:** This is a standalone HTML file with no test framework. Each task includes a browser-based verification step: open the file, interact with sliders, confirm expected output. After each task, the dashboard must remain fully functional.

**XSS note:** All dynamic content rendered via innerHTML in this dashboard is derived from numeric slider values, hardcoded constants, and static editorial strings. There is no user-provided text input or external data. The innerHTML usage is safe in this context.

---

### Task 1: Add new CSS styles

All new CSS for presets, matrix, macro panel, pipeline highlight, and bottleneck dimming. CSS-only change — nothing visual changes yet since no HTML references these classes.

**Files:**
- Modify: `docs/datacenter-economics.html` (style block, lines 7-525)

- [ ] **Step 1: Add preset button styles**

Insert before the `/* Responsive */` comment (line 512):

```css
  /* Scenario Presets */
  .preset-row {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }

  .preset-btn {
    flex: 1;
    min-width: 140px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
  }

  .preset-btn::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: transparent;
    transition: background 0.3s ease;
  }

  .preset-btn:hover {
    background: var(--surface2);
    transform: translateY(-2px);
  }

  .preset-btn.base::before { background: var(--accent-blue); }
  .preset-btn.bull::before { background: var(--accent-green); }
  .preset-btn.bear::before { background: var(--accent-red); }
  .preset-btn.shock::before { background: var(--accent-amber); }

  .preset-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 0.25rem;
  }

  .preset-desc {
    font-size: 0.65rem;
    color: var(--text-dim);
    line-height: 1.3;
  }
```

- [ ] **Step 2: Add stock sensitivity matrix styles**

Insert after the preset styles:

```css
  /* Stock Sensitivity Matrix */
  .matrix-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .matrix-tab {
    background: var(--surface2);
    border: 1px solid var(--border);
    color: var(--text-dim);
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .matrix-tab:hover {
    border-color: var(--accent-blue);
    color: var(--text);
  }

  .matrix-tab.active {
    background: var(--glow-blue);
    border-color: var(--accent-blue);
    color: var(--accent-blue);
    font-weight: 600;
  }

  .matrix-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 1rem;
  }

  .matrix-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.25rem;
  }

  .matrix-card h4 {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 0.75rem;
  }

  .matrix-card.winners h4 { color: var(--accent-green); }
  .matrix-card.losers h4 { color: var(--accent-red); }
  .matrix-card.symptoms h4 { color: var(--accent-amber); }

  .matrix-list {
    list-style: none;
    font-size: 0.85rem;
    color: var(--text);
  }

  .matrix-list li {
    margin-bottom: 0.4rem;
    padding-left: 1rem;
    position: relative;
  }

  .matrix-list li::before {
    content: '\2192';
    position: absolute;
    left: 0;
    color: var(--text-dim);
    font-family: 'JetBrains Mono', monospace;
  }
```

- [ ] **Step 3: Add pipeline highlight and bottleneck dimming styles**

Insert after the matrix styles:

```css
  /* Pipeline binding highlight */
  .pipe-stage.binding {
    border-color: var(--accent-amber);
    box-shadow: 0 0 15px rgba(245, 158, 11, 0.2);
  }

  /* Bottleneck dimming for loose constraints */
  .bottleneck-segment.loose {
    opacity: 0.4;
  }

  /* Tightness indicator badges */
  .bn-hbm { background: rgba(74, 158, 255, 0.15); color: var(--accent-blue); }
  .bn-monetization { background: rgba(239, 68, 68, 0.15); color: var(--accent-red); }
```

- [ ] **Step 4: Update responsive styles**

Replace the existing `@media (max-width: 900px)` block (around line 513) to include the new components. Leave the `@media (max-width: 600px)` block (around line 520) unchanged:

```css
  @media (max-width: 900px) {
    .pipeline { grid-template-columns: repeat(3, 1fr); }
    .outputs, .comparison { grid-template-columns: 1fr; }
    .timeline { flex-wrap: wrap; }
    .year-col { min-width: 120px; }
    .matrix-grid { grid-template-columns: 1fr; }
  }
```

- [ ] **Step 5: Verify and commit**

Open `docs/datacenter-economics.html` in browser. Dashboard should look and behave identically to v1 — no visual changes yet, just new CSS loaded.

```bash
git add docs/datacenter-economics.html
git commit -m "feat: add CSS styles for v2 components (presets, matrix, pipeline highlight)"
```

---

### Task 2: Add new HTML sliders and controls sections

Add the 8 new slider controls (HBM, Power, Demand, Price Decay, Elasticity, Target Payback, Labor, Permitting) and the scenario preset buttons. Update `getInputs()` to read them all.

**Files:**
- Modify: `docs/datacenter-economics.html` (HTML body + getInputs function)

- [ ] **Step 1: Add scenario preset buttons**

Insert immediately after the pipeline div (`<div class="pipeline" id="pipeline"></div>`, line 541) and before the existing controls section:

```html
<!-- Scenario Presets -->
<div class="controls-section">
  <h2>Scenario Presets</h2>
  <div class="preset-row">
    <button class="preset-btn base" onclick="applyScenario('base')">
      <div class="preset-title">Base Case</div>
      <div class="preset-desc">Gradual scaling, 40% price decay, tight but functional supply.</div>
    </button>
    <button class="preset-btn bull" onclick="applyScenario('bull')">
      <div class="preset-title">Agent Supercycle</div>
      <div class="preset-desc">Elastic demand explodes, pricing stays firm, power is the bottleneck.</div>
    </button>
    <button class="preset-btn bear" onclick="applyScenario('bear')">
      <div class="preset-title">Winter / Digestion</div>
      <div class="preset-desc">Overbuilding meets weak demand. Race to the bottom.</div>
    </button>
    <button class="preset-btn shock" onclick="applyScenario('shock')">
      <div class="preset-title">Geopolitical Shock</div>
      <div class="preset-desc">Supply fractures. Extreme CapEx premiums and hoarded compute.</div>
    </button>
  </div>
</div>
```

- [ ] **Step 2: Add new supply sliders to existing controls grid**

Add three new control cards inside the existing controls-grid div, after the last existing control card (the "% EUV allocated to AI" card ending around line 594):

```html
    <div class="control-card">
      <div class="control-label">
        HBM supply index
        <span class="control-value-display" id="hbm-display">1.0x</span>
      </div>
      <input type="range" id="hbmIndex" min="0.5" max="2" value="1" step="0.1">
      <div class="control-range-labels"><span>0.5x</span><span>2.0x</span></div>
    </div>
    <div class="control-card">
      <div class="control-label">
        Power-deliverable GW / yr
        <span class="control-value-display" id="power-display">15 GW</span>
      </div>
      <input type="range" id="powerGw" min="5" max="40" value="15" step="1">
      <div class="control-range-labels"><span>5 GW</span><span>40 GW</span></div>
    </div>
    <div class="control-card">
      <div class="control-label">
        Demand for GW / yr
        <span class="control-value-display" id="demand-display">20 GW</span>
      </div>
      <input type="range" id="demandGw" min="5" max="60" value="20" step="5">
      <div class="control-range-labels"><span>5 GW</span><span>60 GW</span></div>
    </div>
```

- [ ] **Step 3: Add demand elasticity controls section**

Insert after the closing tags of the existing controls section:

```html
<!-- Demand Elasticity -->
<div class="controls-section">
  <h2>Demand Elasticity</h2>
  <div class="controls-grid">
    <div class="control-card">
      <div class="control-label">
        Annual token price decay
        <span class="control-value-display" id="price-decay-display">40%</span>
      </div>
      <input type="range" id="priceDecay" min="10" max="80" value="40" step="5">
      <div class="control-range-labels"><span>10%</span><span>80%</span></div>
    </div>
    <div class="control-card">
      <div class="control-label">
        Demand elasticity (vol growth per 50% price cut)
        <span class="control-value-display" id="elasticity-display">3.0x</span>
      </div>
      <input type="range" id="elasticity" min="1" max="10" value="3" step="0.5">
      <div class="control-range-labels"><span>1.0x (Flat)</span><span>10.0x (Boom)</span></div>
    </div>
    <div class="control-card">
      <div class="control-label">
        Target industry payback period
        <span class="control-value-display" id="target-payback-display">4 yrs</span>
      </div>
      <input type="range" id="targetPayback" min="2" max="10" value="4" step="1">
      <div class="control-range-labels"><span>2 yrs</span><span>10 yrs</span></div>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Add qualitative controls section**

Insert after the demand elasticity section:

```html
<!-- Qualitative Factors -->
<div class="controls-section">
  <h2>Qualitative Factors (Editorial)</h2>
  <div class="controls-grid">
    <div class="control-card">
      <div class="control-label">
        Labor constraint severity
        <span class="control-value-display" id="labor-display">40</span>
      </div>
      <input type="range" id="laborSeverity" min="0" max="100" value="40" step="5">
      <div class="control-range-labels"><span>0</span><span>100</span></div>
    </div>
    <div class="control-card">
      <div class="control-label">
        Permitting constraint severity
        <span class="control-value-display" id="permit-display">30</span>
      </div>
      <input type="range" id="permitSeverity" min="0" max="100" value="30" step="5">
      <div class="control-range-labels"><span>0</span><span>100</span></div>
    </div>
  </div>
</div>
```

- [ ] **Step 5: Update getInputs() to read all 14 sliders**

Replace the existing `getInputs()` function:

```js
function getInputs() {
  return {
    capex: +$('capex').value,
    revenueGw: +$('revenueGw').value,
    margin: +$('margin').value / 100,
    euvPerGw: +$('euvPerGw').value,
    asmlYear: +$('asmlYear').value,
    aiPct: +$('aiPct').value / 100,
    hbmIndex: +$('hbmIndex').value,
    powerGw: +$('powerGw').value,
    demandGw: +$('demandGw').value,
    priceDecay: +$('priceDecay').value / 100,
    elasticity: +$('elasticity').value,
    targetPayback: +$('targetPayback').value,
    laborSeverity: +$('laborSeverity').value,
    permitSeverity: +$('permitSeverity').value,
  };
}
```

- [ ] **Step 6: Update display labels in update() and add stub applyScenario**

Add the new slider display updates inside the `update()` function after the existing display updates. Also add a stub `applyScenario` function after `fmtDollar`:

```js
// Stub — will be implemented in Task 7
function applyScenario(key) { update(); }
```

New display updates to add inside `update()`:
```js
  $('hbm-display').textContent = inputs.hbmIndex.toFixed(1) + 'x';
  $('power-display').textContent = inputs.powerGw + ' GW';
  $('demand-display').textContent = inputs.demandGw + ' GW';
  $('price-decay-display').textContent = (inputs.priceDecay * 100).toFixed(0) + '%';
  $('elasticity-display').textContent = inputs.elasticity.toFixed(1) + 'x';
  $('target-payback-display').textContent = inputs.targetPayback + ' yrs';
  $('labor-display').textContent = inputs.laborSeverity;
  $('permit-display').textContent = inputs.permitSeverity;
```

- [ ] **Step 7: Verify and commit**

Open in browser. Confirm:
- Four preset buttons appear below the pipeline (clicking them does nothing yet — expected)
- 9 supply sliders visible (6 old + 3 new)
- 3 demand elasticity sliders visible
- 2 qualitative sliders visible
- All sliders update their display labels when dragged
- Existing panels still work correctly

```bash
git add docs/datacenter-economics.html
git commit -m "feat: add 8 new slider controls and preset button stubs"
```

---

### Task 3: Build the multi-constraint supply engine

Extract the supply ceiling computation into a standalone `computeSupply()` function. Update `renderMetrics()` ceiling panel to show all three constraints. Update `renderPipeline()` to highlight the binding constraint.

**Files:**
- Modify: `docs/datacenter-economics.html` (script block)

- [ ] **Step 1: Add constants and computeSupply function**

Add after the `applyScenario` stub and before `getInputs`:

```js
const HBM_BASELINE_GW = 11;

function computeSupply(inputs) {
  const gwFromEuv = (inputs.asmlYear * inputs.aiPct) / inputs.euvPerGw;
  const gwFromHbm = HBM_BASELINE_GW * inputs.hbmIndex;
  const gwFromPower = inputs.powerGw;

  const ceilings = { euv: gwFromEuv, hbm: gwFromHbm, power: gwFromPower };
  const supplyCeiling = Math.min(gwFromEuv, gwFromHbm, gwFromPower);

  let binding = 'euv';
  if (gwFromHbm <= gwFromEuv && gwFromHbm <= gwFromPower) binding = 'hbm';
  if (gwFromPower <= gwFromEuv && gwFromPower <= gwFromHbm) binding = 'power';

  const actualNewGw = Math.min(supplyCeiling, inputs.demandGw);
  const tightnessRatio = inputs.demandGw / supplyCeiling;

  return { ceilings, supplyCeiling, binding, actualNewGw, tightnessRatio };
}
```

- [ ] **Step 2: Update renderPipeline to accept supply and highlight binding stage**

Replace the existing `renderPipeline` function. Add a `binding` parameter and apply the `.binding` CSS class to the appropriate pipeline stage. The mapping is: EUV=index 0, HBM=index 2, Power=index 3, Overcapacity=index 5.

See spec Section 1 for the full mapping. The stage array and template generation stay the same, but the outer div gets `class="pipe-stage binding"` when `i === bindingIndex`.

- [ ] **Step 3: Update renderMetrics to show multi-constraint ceiling**

Replace the existing `renderMetrics` function. The per-GW panel stays unchanged (uses raw slider values). The ceiling panel is completely replaced — remove the old "Sam wants 52 GW" editorial rows and the single-constraint EUV ceiling. The new ceiling panel shows: GW ceiling for each of EUV/HBM/Power (binding one highlighted in amber, others neutral), supply ceiling, demand, tightness ratio with color coding (green < 0.8, amber 0.8-1.2, red > 1.2), actual new GW, and aggregate implied capex/revenue using `supply.actualNewGw`.

See spec Sections 1 and 2 for the exact metrics and color logic.

- [ ] **Step 4: Update update() to compute supply and pass it to render functions**

Add `const supply = computeSupply(inputs);` after `getInputs()`. Pass `supply` as second argument to `renderPipeline` and `renderMetrics`.

- [ ] **Step 5: Verify and commit**

Open in browser. Confirm:
- Pipeline shows amber glow on "Memory (HBM)" at defaults (HBM binding at 11.0 vs EUV 12.0)
- Ceiling panel shows all three ceilings with HBM highlighted
- Tightness ratio shows ~1.82 in red ("severe")
- Dragging HBM index to 2.0 shifts binding to EUV
- Setting demand below supply ceiling shifts highlight to "Token Revenue"

```bash
git add docs/datacenter-economics.html
git commit -m "feat: add multi-constraint supply engine with pipeline highlighting"
```

---

### Task 4: Make bottleneck bar reactive

Replace the hardcoded bottleneck bar with one that computes segment widths from tightness scores.

**Files:**
- Modify: `docs/datacenter-economics.html` (renderBottleneck + HTML heading + update call)

- [ ] **Step 1: Update bottleneck section heading**

Change `Bottleneck Severity (2026 · editorial estimate)` to `Bottleneck Severity (2026)` in the HTML.

- [ ] **Step 2: Replace renderBottleneck**

Compute tightness per constraint: `demand_gw / gw_from_*` for supply constraints, `severity / 100` for qualitative. Normalize to percentages. Apply `.loose` class when tightness < 0.5.

- [ ] **Step 3: Update update() to pass inputs and supply to renderBottleneck**

- [ ] **Step 4: Verify and commit**

Confirm segments resize when sliders change. Setting labor/permitting to 0 dims those segments. Low demand dims all supply segments.

```bash
git add docs/datacenter-economics.html
git commit -m "feat: make bottleneck bar reactive to slider inputs"
```

---

### Task 5: Make timeline dynamic

Replace hardcoded timeline with projected values from current slider state and growth rates.

**Files:**
- Modify: `docs/datacenter-economics.html` (add computeTimeline, replace renderTimeline, update update())

- [ ] **Step 1: Add growth constants and computeTimeline function**

Uses `HISTORICAL_BASE_GW = 50` and growth rates from spec Section 3. Returns array of year objects with `newGw`, `cumulativeTotal`, `cumulativeNew`, `binding`, `tightness`, `isHistorical`. Historical years (2024-2025) are static. Projected years (2026-2030) are computed.

- [ ] **Step 2: Replace renderTimeline**

Renders year columns from the timeline array. Historical years show `~` prefix. Computed years show `.toFixed(1)`. Each year shows bottleneck badge and tightness label (loose/moderate/tight). 2026 is "active".

Badge class mapping for the dynamic timeline:
- `euv` binding → `.bn-euv` (existing)
- `hbm` binding → `.bn-hbm` (added in Task 1)
- `power` binding → `.bn-power` (existing)
- `monetization` (overcapacity) → `.bn-monetization` (added in Task 1)

The old `.bn-chips` and `.bn-fabs` classes from v1 are no longer used. Leave them in CSS for now; remove as cleanup later.

- [ ] **Step 3: Wire into update()**

Add `const timeline = computeTimeline(inputs);` and pass to `renderTimeline(timeline)`.

- [ ] **Step 4: Verify and commit**

Confirm 2024-2025 are static, 2026+ are computed. Bottleneck badges shift when sliders change. Setting demand to 5 GW shows "Demand" badges and "loose" labels.

```bash
git add docs/datacenter-economics.html
git commit -m "feat: make timeline dynamically computed from slider state"
```

---

### Task 6: Add Jevons Paradox module

Add the demand-side reality check panel.

**Files:**
- Modify: `docs/datacenter-economics.html` (HTML panel + JS compute + render)

- [ ] **Step 1: Add Jevons output panel HTML**

Insert after timeline section, before Anthropic/OpenAI. Full-width output panel with id `jevons-metrics`, uses a 2-column grid layout inside.

- [ ] **Step 2: Add computeJevons function**

Implements the Jevons math from spec Section 4. Takes `inputs` and `timeline`, reads `cumulativeNew` from the 2030 timeline entry (this field must be set by `computeTimeline` in Task 5). Computes total capex, required annual revenue, price/volume multipliers, projected revenue, sustainability verdict, GDP capture.

Important: the half-lives calculation uses natural log — `Math.log()`, not `Math.log2()`:
```js
const halfLives = years * Math.log(1 - inputs.priceDecay) / Math.log(0.5);
```

- [ ] **Step 3: Add renderJevons function**

Two-column layout: left column shows capex/required-rev/GDP-capture, right column shows price-multiplier/volume-multiplier/projected-rev/status. Color coding per spec. The Jevons panel reuses existing `.output-panel` and `.metric-row` CSS classes — no new styles needed.

- [ ] **Step 4: Wire into update()**

Add `const jevons = computeJevons(inputs, timeline);` and `renderJevons(jevons);`.

- [ ] **Step 5: Verify and commit**

At defaults: Escape Velocity. Sliding price decay to 65% + elasticity to 1.5x: should flip to Death Spiral. GDP capture under 1% at defaults.

```bash
git add docs/datacenter-economics.html
git commit -m "feat: add Jevons Paradox demand elasticity module"
```

---

### Task 7: Add scenario presets

Implement `applyScenario()` with the four verified preset configurations.

**Files:**
- Modify: `docs/datacenter-economics.html` (replace applyScenario stub)

- [ ] **Step 1: Add SCENARIOS constant and replace applyScenario**

Define `SCENARIOS` object with `base`, `bull`, `bear`, `shock` keys. Each maps all 14 slider IDs to their preset values (from spec Section 5, verified math). `applyScenario(key)` sets all slider `.value` properties and calls `update()`.

- [ ] **Step 2: Verify and commit**

Click each preset. Verify binding constraint matches spec:
- Base: HBM binding, tightness ~1.82
- Bull: Power binding, tightness ~2.86
- Bear: overcapacity (tightness ~0.83), Monetization
- Shock: EUV binding, tightness ~4.41

```bash
git add docs/datacenter-economics.html
git commit -m "feat: add scenario preset buttons (base, bull, bear, shock)"
```

---

### Task 8: Add Stock Sensitivity Matrix

Add the tabbed equity mapping panel with auto-selection based on binding constraint.

**Files:**
- Modify: `docs/datacenter-economics.html` (HTML section + JS data + render)

- [ ] **Step 1: Add matrix HTML section**

Insert after Jevons panel, before Anthropic/OpenAI. Contains `matrix-tabs` and `matrix-content` divs.

- [ ] **Step 2: Add MARKET_SCENARIOS data, renderMatrix, and setMatrixTab functions**

`MARKET_SCENARIOS` object with `euv`, `hbm`, `power`, `demand` keys. Each has `label`, `winners`, `losers`, `symptoms` arrays (content from spec Section 6).

`renderMatrix(supply)` auto-selects tab: if `tightnessRatio < 1.0` select `demand`, otherwise select `supply.binding`. Renders tabs and 3-column grid (winners/losers/symptoms).

`setMatrixTab(key)` handles manual tab clicks — updates active class and content without auto-selection.

- [ ] **Step 3: Wire renderMatrix into update()**

- [ ] **Step 4: Verify and commit**

At defaults: HBM tab auto-selected. Clicking other tabs works. Setting demand to 5 GW: Monetization tab. Presets auto-select correct tabs.

```bash
git add docs/datacenter-economics.html
git commit -m "feat: add stock sensitivity matrix with auto-selecting tabs"
```

---

### Task 9: Make Anthropic vs OpenAI comparison reactive

Update GW allocations to respond to supply changes.

**Files:**
- Modify: `docs/datacenter-economics.html` (renderComparison function)

- [ ] **Step 1: Update renderComparison**

Add `supply` parameter. Compute EOY GW as `currentGw + share * supply.actualNewGw` (Anthropic 25%, OpenAI 30% share). ARR, strategy, trajectory text stay as hardcoded editorial.

- [ ] **Step 2: Update update() to pass supply**

- [ ] **Step 3: Verify and commit**

EOY GW bars change with supply sliders. In Geopolitical Shock (tight supply), EOY GW values shrink. ARR/strategy stay constant.

```bash
git add docs/datacenter-economics.html
git commit -m "feat: make Anthropic/OpenAI comparison reactive to supply model"
```

---

### Task 10: Final integration verification

End-to-end walkthrough. Fix any remaining issues.

**Files:**
- Modify: `docs/datacenter-economics.html` (if fixes needed)

- [ ] **Step 1: Full scenario walkthrough**

Click each of the 4 presets and verify the full chain: pipeline highlight, bottleneck bar, timeline, Jevons verdict, matrix tab, comparison GW — all match expected behavior per spec Section 5 verification table.

- [ ] **Step 2: Slider interaction test**

From Base Case, drag individual sliders and confirm all panels update coherently. Test edge cases: minimum demand (5 GW), maximum ASML (120), extreme price decay (80%).

- [ ] **Step 3: Responsive test**

Resize to < 900px. Confirm pipeline wraps, outputs stack, matrix stacks, timeline wraps. All sliders usable.

- [ ] **Step 4: Commit if fixes were needed**

```bash
git add docs/datacenter-economics.html
git commit -m "feat: datacenter dashboard v2 complete"
```
