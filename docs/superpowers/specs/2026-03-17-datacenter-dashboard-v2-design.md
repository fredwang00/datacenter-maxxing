# Datacenter Economics Dashboard v2 — Design Spec

## Goal

Upgrade the existing "Anatomy of 1 Gigawatt" dashboard from a single-constraint EUV supply calculator into a multi-constraint scenario engine with demand-side economics. The dashboard serves two purposes: personal investment decision support (regime detection, equity mapping) and intuition building (understanding the AI infrastructure supply chain through interactive "what if" exploration).

## Current State

Single HTML file (`docs/datacenter-economics.html`, ~850 lines). Six sliders control a supply-side model where EUV tool production is the sole capacity constraint. Outputs include per-GW economics, annual capacity ceiling, a static bottleneck bar, a static timeline (2024-2030), and a static Anthropic vs OpenAI comparison. No demand-side modeling, no scenario presets, no equity mapping.

## Architecture

Single HTML file. No build step, no dependencies, no charting libraries. All visualizations use CSS bars, grids, and flexbox — same approach as v1. If the file exceeds ~2000 lines, extract JS into separate modules as a follow-up; until then, simplicity wins.

### Code organization within the file

```
<style>
  existing styles
  new: preset buttons, matrix tabs/cards, macro panel
</style>

<body>
  Pipeline
  Scenario Presets (new)
  Supply Controls (existing 6 + HBM, Power, Demand sliders)
  Demand Elasticity Controls (new: price decay, elasticity, target payback)
  Qualitative Controls (new: labor severity, permitting severity)
  Output Panels (existing, expanded with constraint ceilings)
  Bottleneck Bar (now reactive)
  Timeline (now reactive)
  Jevons Reality Check (new)
  Stock Sensitivity Matrix (new)
  Anthropic vs OpenAI (partially reactive)
</body>

<script>
  Data & constants (scenario presets, market scenario data)
  getInputs() — reads all sliders
  Supply engine: computeSupplyCeilings(inputs), computeTimeline(inputs)
  Demand engine: computeJevons(inputs, timeline)
  Render functions (one per panel, each takes computed data)
  update() — master orchestrator, calls compute then render
  Event binding
</script>
```

## Design

### 1. Multi-Constraint Supply Model

The core change. Three first-class constraints compute independent GW ceilings. The binding constraint (minimum) determines actual capacity.

**New sliders:**

| Slider | ID | Range | Default | Step | Display format |
|--------|----|-------|---------|------|----------------|
| HBM supply index | `hbmIndex` | 0.5 - 2.0 | 1.0 | 0.1 | `1.0x` |
| Power-deliverable GW/yr | `powerGw` | 5 - 40 | 15 | 1 | `15 GW` |
| Demand for GW/yr | `demandGw` | 5 - 60 | 20 | 5 | `20 GW` |

**HBM baseline assumption:** At index 1.0x, the global HBM supply chain supports ~11 GW/yr of new AI datacenter capacity (derived from ~170K DRAM wafers per GW, current HBM production rates, and the 3x wafer-intensity of HBM vs commodity DRAM). The slider scales this linearly. The constant for this is `HBM_BASELINE_GW = 11`.

**Core equations:**

```js
gw_from_euv   = (asml_tools * ai_pct) / euv_per_gw
gw_from_hbm   = HBM_BASELINE_GW * hbm_index  // 11 GW baseline at 1.0x
gw_from_power = power_gw         // direct input

// Supply ceiling — the max that CAN be built, regardless of demand.
// Demand is NOT included in min(). It's a separate concept used for
// tightness ratios (Section 2) and the Jevons module (Section 4).
supply_ceiling_gw = Math.min(gw_from_euv, gw_from_hbm, gw_from_power)
binding = whichever argument to min() is smallest

// What actually gets built: the lesser of supply and demand.
// If demand < supply, there's overcapacity — not all buildable GW gets built.
actual_new_gw = Math.min(supply_ceiling_gw, demand_gw)

// Tightness: >1.0 means demand exceeds supply (tight), <1.0 means overcapacity (loose).
tightness_ratio = demand_gw / supply_ceiling_gw
```

**Downstream effects:**

- **Pipeline visualization:** the pipeline keeps its 6 stages. The stage corresponding to the binding constraint gets a highlighted border/glow. The mapping:
  - EUV binding → highlight **"EUV Tools"** stage
  - HBM binding → highlight **"Memory (HBM)"** stage
  - Power binding → highlight **"Data Center"** stage (encompasses power/site/cooling)
  - Overcapacity (`tightness_ratio < 1.0`) → highlight **"Token Revenue"** stage (monetization is the real constraint)
- **"Per-GW Economics" panel:** unchanged — uses raw slider values (capex, revenueGw, margin). These describe the economics of ONE gigawatt independent of how many get built.
- **"Annual Capacity Ceiling" panel:** shows all three supply ceilings plus demand side by side. The binding one is highlighted (amber). The others show in neutral/dim text. Shows the tightness ratio with color coding: green if < 0.8 (loose), amber if 0.8-1.2, red if > 1.2 (severe). The *aggregate* rows (implied AI capex required, implied rental revenue) use `actual_new_gw` replacing the old EUV-only `gwPerYear`.

### 2. Dynamic Bottleneck Bar

Instead of hardcoded percentages, bottleneck severity is derived from how close each constraint is to being the binding one.

**Tightness score per constraint:**

```js
tightness_euv   = demand_gw / gw_from_euv
tightness_hbm   = demand_gw / gw_from_hbm
tightness_power = demand_gw / gw_from_power
tightness_labor = labor_severity / 100      // qualitative, from slider
tightness_permit = permit_severity / 100    // qualitative, from slider
```

The bar segment widths are proportional to each tightness score (normalized so they sum to 100%). Constraints with tightness < 0.5 get a muted/dimmed appearance to visually indicate they're loose.

**New qualitative sliders:**

| Slider | ID | Range | Default | Step | Display format |
|--------|----|-------|---------|------|----------------|
| Labor constraint severity | `laborSeverity` | 0 - 100 | 40 | 5 | `40` |
| Permitting constraint severity | `permitSeverity` | 0 - 100 | 30 | 5 | `30` |

These are placed in a separate "Qualitative Factors" group to make clear they're editorial, not computed.

### 3. Dynamic Timeline

Instead of hardcoded GW values per year, the timeline is projected forward from the current slider state using growth assumptions.

**Growth rates (annual):**

```js
const growth = {
  asmlTools: 8,         // +8 tools/year (additive, not multiplicative)
  hbmImprovement: 0.15, // 15% improvement in HBM supply per year
  powerGrowth: 0.20,    // 20% more power-deliverable GW per year
  demandGrowth: 0.25,   // 25% more demand per year (agents, enterprise adoption)
};
```

**Per-year projection (starting from slider values as the 2026 baseline):**

```js
const HISTORICAL_BASE_GW = 50;  // ~50 GW installed by end of 2025
let cumulative_new_gw = 0;      // only NEW GW built from 2026 onward

for each year from 2026 to 2030:
  delta = year - 2026

  // Supply side
  euv_tools_y   = asml_tools + delta * growth.asmlTools
  hbm_index_y   = hbm_index * (1 + growth.hbmImprovement) ^ delta
  power_gw_y    = power_gw * (1 + growth.powerGrowth) ^ delta

  gw_from_euv_y   = (euv_tools_y * ai_pct) / euv_per_gw
  gw_from_hbm_y   = HBM_BASELINE_GW * hbm_index_y
  gw_from_power_y = power_gw_y

  supply_ceiling_y = Math.min(gw_from_euv_y, gw_from_hbm_y, gw_from_power_y)
  binding_y = whichever supply constraint is smallest

  // Demand side grows too — keeps bottleneck labels realistic across years
  demand_y = demand_gw * (1 + growth.demandGrowth) ^ delta
  actual_new_gw_y = Math.min(supply_ceiling_y, demand_y)
  tightness_y = demand_y / supply_ceiling_y

  cumulative_new_gw += actual_new_gw_y
  cumulative_total_gw = HISTORICAL_BASE_GW + cumulative_new_gw  // for display
```

**Two cumulative values:**
- `cumulative_new_gw` — GW built 2026-2030 only. Used by the Jevons module to compute total sunk capex.
- `cumulative_total_gw` — includes the ~50 GW historical base. Shown in the timeline's cumulative column.

The timeline columns display:
- Year label
- New GW/yr (computed, not hardcoded)
- Cumulative total GW (including historical base)
- Binding supply constraint label + badge (computed per year)
- Tightness indicator (tight/loose/overcapacity)
- 2026 column is highlighted as "active"

The existing editorial detail text ("CoWoS & power", "Behind-the-meter boom", etc.) is dropped — the computed bottleneck label replaces it. Years 2024-2025 are kept as static historical context with their current values, since they're in the past.

**Known limitation:** The growth rates are constants, not per-scenario. In a Winter scenario, demand growth would realistically be much lower than 25%/yr; in a Supercycle, higher. The presets capture scenario thesis through the 2026 baseline slider values. The growth rates exist to make the bottleneck migration plausible across years, not to be precise per-scenario projections. Making growth rates configurable is a possible v3 enhancement.

**The timeline also returns its data** (array of per-year objects) so the Jevons module can consume it.

### 4. Jevons Paradox / Intelligence Clearing Price Module

The demand-side engine. It consumes the dynamic timeline's cumulative GW output and stress-tests whether revenue can justify the capex.

**New sliders (grouped under "Demand Elasticity"):**

| Slider | ID | Range | Default | Step | Display format |
|--------|-----|-------|---------|------|----------------|
| Annual token price decay | `priceDecay` | 10 - 80 | 40 | 5 | `40%` |
| Demand elasticity | `elasticity` | 1.0 - 10.0 | 3.0 | 0.5 | `3.0x` |
| Target payback period | `targetPayback` | 2 - 10 | 4 | 1 | `4 yrs` |

**Core equations:**

All slider references below use the IDs from the Slider Summary:
- `capex` → CapEx per GW slider (in $B)
- `revenueGw` → Annual rental revenue per GW slider (in $B/yr)
- `priceDecay` → Annual token price decay slider (as decimal, e.g. 0.40)
- `elasticity` → Demand elasticity slider (multiplier)
- `targetPayback` → Target payback period slider (years)

```js
// NEW GW built 2026-2030, from the dynamic timeline (Section 3).
// This is cumulative_new_gw (not cumulative_total_gw which includes historical base).
cumulative_new_gw = timeline[2030].cumulative_new_gw

// Price decay compounds over 4 intervals (2026→2027, 2027→2028, 2028→2029, 2029→2030).
// 2026 is the baseline year — prices start decaying AFTER that point.
years = 4  // number of compounding intervals, NOT number of production years

// Total sunk cost across all GW built 2026-2030
total_capex = cumulative_new_gw * capex  // capex slider, in $B

// Annual revenue run-rate needed to pay back total capex within target period
required_annual_rev = total_capex / targetPayback

// Price decay and demand expansion (Jevons math)
price_multiplier = (1 - priceDecay) ^ years
half_lives = years * ln(1 - priceDecay) / ln(0.5)
volume_multiplier = elasticity ^ half_lives

// Projected ANNUAL revenue from all new capacity in 2030.
// revenueGw is per-GW annual cloud rental revenue (from slider).
// The multiplier adjusts for price decay offset by volume growth.
// Note: "token price decay" is applied to cloud rental revenue as a proxy.
// In reality, cloud rental and token pricing are different layers, but
// token price compression eventually flows upstream to rental rates.
effective_rev_multiplier = price_multiplier * volume_multiplier
projected_rev_per_gw = revenueGw * effective_rev_multiplier  // annual, per GW
projected_annual_rev = cumulative_new_gw * projected_rev_per_gw  // annual, all new GW

// Verdict: can annual revenue cover the required payback run-rate?
revenue_gap = projected_annual_rev - required_annual_rev
is_sustainable = revenue_gap >= 0

// GDP reality check
pct_global_gdp = (required_annual_rev / 120000) * 100  // $120T est. 2030 GDP
```

**Output panel ("2030 Reality Check"):**

| Metric | Color logic |
|--------|-------------|
| Cumulative 2030 CapEx (new GW built 2026-2030) | neutral |
| Required annual revenue run-rate (at target payback) | amber |
| Required global GDP capture | red if > 3%, neutral otherwise |
| --- separator --- | |
| 2030 cost of intelligence (% of today) | blue |
| 2030 token volume demand (multiplier of today) | blue |
| Projected 2030 annual revenue (new GW only) | green if sustainable, red if not |
| Market status | "Escape Velocity" (green) or "Death Spiral" (red) |

### 5. Scenario Presets

Four buttons at the top of the controls section. Clicking one sets all sliders to a coherent world-state and triggers `update()`.

| Preset | capex | revGw | margin | euvPerGw | asml | aiPct | hbmIdx | powerGw | demandGw | decay | elast | payback | laborSev | permitSev |
|--------|-------|-------|--------|----------|------|-------|--------|---------|----------|-------|-------|---------|----------|-----------|
| Base Case | 50 | 10 | 45 | 3.5 | 70 | 60 | 1.0 | 15 | 20 | 40 | 3.0 | 4 | 40 | 30 |
| Agent Supercycle | 55 | 14 | 55 | 3.0 | 90 | 75 | 1.5 | 14 | 40 | 25 | 5.0 | 3 | 20 | 15 |
| Winter / Digestion | 45 | 7 | 30 | 3.5 | 70 | 60 | 1.2 | 25 | 10 | 65 | 1.5 | 7 | 50 | 40 |
| Geopolitical Shock | 75 | 18 | 35 | 5.0 | 40 | 85 | 0.7 | 10 | 30 | 10 | 2.0 | 5 | 70 | 80 |

**Preset math verification (HBM_BASELINE_GW = 11):**
- **Base Case:** gw_euv=12.0, gw_hbm=11.0, gw_power=15. supply=11.0 (HBM binding). tightness=20/11=1.82.
- **Agent Supercycle:** gw_euv=22.5, gw_hbm=16.5, gw_power=14. supply=14.0 (Power binding). tightness=40/14=2.86.
- **Winter:** gw_euv=12.0, gw_hbm=13.2, gw_power=25. supply=12.0 (EUV binding). tightness=10/12=0.83 (overcapacity).
- **Geopolitical Shock:** gw_euv=6.8, gw_hbm=7.7, gw_power=10. supply=6.8 (EUV binding). tightness=30/6.8=4.41.

Each preset auto-selects the Stock Sensitivity Matrix tab matching its regime:
- Base → **HBM tab** (memory is the binding supply constraint)
- Agent Supercycle → **Power tab** (physical power delivery is the binding constraint)
- Winter → **Monetization tab** (tightness < 1.0, overcapacity — revenue is the problem, not supply)
- Geopolitical Shock → **EUV tab** (fab access is catastrophically constrained)

After applying a preset, all sliders remain adjustable — the preset is a starting point, not a lock.

**UI:** A row of four styled buttons above the controls grid. Each has a top-edge color accent (blue/green/red/amber), a title, and a one-line description.

### 6. Stock Sensitivity Matrix

A tabbed panel where each tab maps a bottleneck regime to equity implications.

**Tabs:** EUV & Fab Tight, HBM / Memory Tight, Power & DC Tight, Monetization Tight.

**Each tab shows three columns:**
- **Winners** — equities/sectors with pricing power in this regime
- **Losers** — equities/sectors that get squeezed
- **Early Warning Symptoms** — what to watch for in earnings calls and data

**Data (static, editorial):**

**EUV & Fab Tight:**
- Winners: TSMC (pricing power), ASML (backlog), NVIDIA (allocation king)
- Losers: lower-tier ASICs, consumer electronics (Apple/Qualcomm margin), AMD (if can't secure N3)
- Symptoms: foundry price hikes, smartphone chip delays, extended semi-cap lead times

**HBM / Memory Tight:**
- Winners: SK Hynix (first-mover), Micron (margin catch-up), Amkor (packaging)
- Losers: commodity DDR buyers, accelerators waiting on HBM, DC capex budgets
- Symptoms: DDR price spikes, GPU shipments stall despite logic availability, wafer reallocations from consumer to server

**Power & DC Tight:**
- Winners: electrical equipment (VRT, ETN, PWR), IPPs (CEG, VST), asset-rich neoclouds
- Losers: hyperscalers without secured sites, model labs waiting on compute, legacy enterprise cloud
- Symptoms: transformer lead times 3+ years, nuclear/gas direct-connect deals, stranded GPUs

**Monetization Tight (Jevons Failure):**
- Winners: enterprise software incumbents (MSFT), consulting/SI, cheapest inference (META)
- Losers: GPU neoclouds (spot collapse), NVIDIA (capex cuts), pure-play foundation model labs
- Symptoms: GPU rental rates plummet, payback stretches to 7+ years, rack delivery push-outs

**Auto-selection logic:**
1. If `tightness_ratio < 1.0` (supply exceeds demand — overcapacity), select the **Monetization Tight** tab. This is the regime where the problem isn't supply, it's justifying the capex.
2. Otherwise, select the tab matching the binding supply constraint from `min()`: EUV → EUV tab, HBM → HBM tab, Power → Power tab.
3. The user can always click any tab manually to override.

### 7. Partially Reactive Anthropic vs OpenAI

The existing comparison panel gets a light upgrade:

- **GW allocations** become a function of 2026's available GW. Anthropic and OpenAI each get a configurable share of the 2026 `actual_new_gw` (hardcoded ratios: Anthropic ~25%, OpenAI ~30% of AI-allocated capacity, as rough editorial estimates). As supply constraints tighten/loosen via sliders, their absolute GW shifts.
- **ARR, strategy text, and trajectory notes** stay as manually-updated editorial content. These change with news, not slider math.
- **EOY 2026 GW projections** are computed as: `current_gw + (share * actual_new_gw_2026)`. This panel is specifically about end-of-2026 positions, not multi-year projections.

This makes the comparison react to supply changes without pretending we can model revenue growth from sliders.

## What's Explicitly Out of Scope

- **Announced vs Usable GW distinction** — good idea but adds a second layer to the timeline; save for v3.
- **"Sam Test" panel** — the existing ceiling metrics already serve this purpose; the multi-constraint model makes it more useful automatically.
- **Scenario delta table** — presets + visual comparison covers this.
- **Constraint radar/spider chart** — would require Canvas/SVG, adds visual complexity without analytical value beyond the bottleneck bar.
- **External data feeds or hosting** — this is a local file you open in a browser.
- **Multi-file architecture** — revisit only if the file exceeds ~2000 lines.

## Slider Summary

Total slider count: 14 (up from 6).

**Supply constraints (existing + new):**
1. CapEx per GW ($20-80B)
2. Annual rental revenue per GW ($6-18B)
3. AI lab gross margin (25-65%)
4. EUV tool-years per GW (2.0-6.0)
5. ASML EUV tools/year (50-120)
6. % EUV allocated to AI (30-90%)
7. HBM supply index (0.5-2.0x) — **new**
8. Power-deliverable GW/yr (5-40) — **new**
9. Demand for GW/yr (5-60) — **new**

**Demand elasticity (all new):**
10. Annual token price decay (10-80%)
11. Demand elasticity (1.0-10.0x)
12. Target payback period (2-10 years)

**Qualitative (all new):**
13. Labor constraint severity (0-100)
14. Permitting constraint severity (0-100)

## Panel Layout (top to bottom)

1. Header (unchanged)
2. Pipeline visualization (reactive: binding constraint highlighted)
3. Scenario Preset buttons (new)
4. Supply Controls (existing 6 + 3 new sliders)
5. Demand Elasticity Controls (3 new sliders)
6. Qualitative Controls (2 new sliders)
7. Output Panels: Per-GW Economics + Annual Capacity Ceiling (expanded with multi-constraint)
8. Bottleneck Bar (reactive)
9. Timeline 2024-2030 (reactive from 2026 onward)
10. Jevons Reality Check panel (new)
11. Stock Sensitivity Matrix (new)
12. Anthropic vs OpenAI (partially reactive)
13. Footnote (unchanged)
