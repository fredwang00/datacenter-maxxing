---
id: dcm:spec/2026-08-26-datacenter-dashboard-v3
type: spec
status: current
repo: datacenter-modeling
created: 2026-08-26
updated: 2026-10-04
tags: [dashboard, euv-ceiling, capital-rails, design]
links:
  - repo: earnings-call-analyzer
    path: docs/specs/2026-10-04-mag7-capex-evidence-design.md
    relation: transcript-sourced-calibration-targets-should-cite-eca-claim-ids
  - repo: datacenter-modeling
    path: docs/superpowers/specs/2026-03-17-datacenter-dashboard-v2-design.md
    relation: supersedes
---

# Datacenter Economics Dashboard v3 — Design Spec

## Goal

Rebuild the dashboard's engine around a year-by-year market simulation in which the price of
compute, the cost per gigawatt, and the binding constraint are all **outputs** rather than inputs.

v1 and v2 are calculators: sliders in, arithmetic out. The Dwarkesh × Dylan Patel podcast of
2026-08-26 describes something different — a market that clears, with supply responding to price
on a multi-year lag, capital rationed by an interest rate that itself responds to capital demand,
and value capture migrating between supply chain layers at different speeds. That structure is
what makes the forecast interesting, and none of it survives being flattened into a slider.

Two audiences, unchanged from v2: investment decision support (regime detection, equity mapping)
and intuition building.

## Why v1 Must Change

### The stock/flow bug inverts the dashboard's conclusion

`docs/datacenter-economics.html:697`:

```js
const gwPerYear = (inputs.asmlYear * inputs.aiPct) / inputs.euvPerGw;  // 70 × 0.6 / 3.5 = 12 GW/yr
```

`asmlYear` is **tools shipped per year**. But eight lines down at `:703-705` the same file computes
the 2030 figure from *cumulative* tools — `700 / 3.5 = 200 GW`. Same divisor, two different
numerator bases.

`euvPerGw = 3.5` means "3.5 EUV tools of *installed* capacity sustain 1 GW/yr of chip output." It
is a stock coefficient. A tool does not produce one gigawatt and retire; it runs for a decade.

Applied correctly against today's installed base of roughly 250–300 EUV tools at 60% AI
allocation: `~165 / 3.5 ≈ 47 GW/yr` of theoretical fab capacity, against 30 GW actually added in
2026.

**EUV is not the binding constraint.** v1's central claim — a hard ~12 GW/yr EUV ceiling — is an
artifact of the bug. Dylan names one real constraint directly ("the world is capital constrained");
primary-source research on ASML's disclosed capacity plan and 2026 turbine lead times points to two
more, and to EUV staying slack through 2030. See *EUV tool supply is disclosed, not guessed* below.

### Calibration is 3–5x low

v2's `HBM_BASELINE_GW = 11` and `powerGw` default of 15 encode a world where ~12 GW/yr is the
ceiling. Actual: 30 GW in 2026, rising to 90–100 by 2029.

### Lab revenue is modelled as a markup on cost

`:680`:

```js
const labRevPerGw = inputs.revenueGw / (1 - inputs.margin);  // $10B / 0.55 = $18.2B/GW
```

Dylan reports $50–60B/GW. Beyond being ~3x low, this makes the cost-to-revenue spread
*mechanically fixed by a margin slider*, when that spread — competitively determined, time-varying,
migrating between layers — is the entire subject of the episode.

### The pipeline is decorative

Four of six pipeline stages are hardcoded string literals (`:661-662`: `'55K'`, `'170K'`), as are
all seven timeline years including their bottleneck labels (`:736-744`). The two things most worth
computing are typed in by hand.

## Source Data

All figures below are from the 2026-08-26 transcript unless tagged otherwise. They are internally
consistent, which is worth stating because it is unusual and it lets us use them as cross-checks.

### Gigawatt path

| | 2026 | 2027 | 2028 | 2029 |
|---|---|---|---|---|
| World incremental GW | 30 | 50 | 70 (80 bull) | 90–100 |
| World cumulative GW | ~80 | ~130 | ~200 | ~300 |
| Lab share of incremental | 30% | 40–50% | 70–80% | — |
| Lab combined GW (stock) | ~6 | ~18 | ~100 | — |
| China GW (stock) | small | — | ≤30 (~12 quality-adj) | +50/yr possible |
| Total capex | ~$1T | — | $3–4T | — |

Cross-check: labs go 6 → 100 GW = +94 GW against world incremental of 50 + 70 = 120 GW → **78%**,
matching the stated "70–80% of incremental." And 70 GW × $50B/GW = **$3.5T**, matching the stated
2028 capex.

### Price ladder ($M/MW/yr — multiply by 1000 for $B/GW/yr)

| Rung | Value | Note |
|---|---|---|
| Cost to own + operate | **~8–9** | derived: `capexPerGw`/5yr + ~$1.5 power & opex — see below |
| Commodity rental | 10–15 | "anyone can make money at $10-15M/MW" |
| Scarcity / hoarder | 25–50 | SpaceX → Google at "$40B a gigawatt" |
| Lab revenue | 50–60 now → 70–80 (end '27) → 100 | Anthropic "$60+ billion per gigawatt" |
| End-user capture | 200–500 | Jane Street. **Marginal rate, does not scale.** |
| Full-AGI ceiling | ~100 ("many hundreds") | 1M workers × $100K. Speculative. |

**Correction (2026-08-27).** This rung previously read "~11–12," derived when the model's capex was
~$50B/GW. After the rails were sourced individually the IT-basis total is **$38.2B/GW**, so
`38.2 / 5 + 1.5 ≈ 9.1`. The renderer computes it from `capexPerGw` rather than hard-coding it, so it
tracks the rails automatically.

This matters because it weakens a claim the earlier draft made. At ~$11–12 against a $13 rental,
the owner's margin looked razor-thin, which read as a neat explanation for why "anyone can make
money… it's not that hard" *and* why Elon would not sell at $15 but does at $25. At ~$9 the margin
is a 40–45% markup — comfortable, not thin.

The honest reading: the "anyone can make money" claim still holds (rental clears above cost), but
the *thinness* was an artifact of the stale capex figure, not evidence. Note also that Dylan's
$10–15M/MW and $50B/GW figures may be facility-basis while our rails are IT-basis — a 20–30% wedge
that would move cost back toward $11. That ambiguity is the unresolved calibration question in the
load-basis guard below, and it is exactly why the calibration panel must label each figure's basis.

### Fab economics

- 1 GW of Vera Rubin-class compute = 55K N3 wafers + 6K N5 wafers + 170K DRAM wafers
- Wafer fab equipment for 1 GW/yr of capacity: **$3–4B**
- Fab all-in including cleanroom and shell: **$6B per GW/yr of capacity**
- EUV tool ~$400M; resale value north of $1B in a shortage
- ~100 EUV tools/yr by 2030; ~700 cumulative → ~200 GW/yr of fab capacity

### Lab compute allocation

50% research / 10% development / 40% inference. An actual Mythos pre-train is sub-200 MW for ~2
months; RL is smaller still at any single site. Most compute goes to research, not to training runs.

Dylan's non-consensus call: **inference share falls over time.** Labs choose AGI over dividends.

### Capital and macro

- SemiAnalysis model: **$11T capex 2024–29**, $6T cash-funded, **$5T debt-funded**
- Meta currently raises at 5–6%; Dylan expects 8% (**+250bps**)
- US debt service: 20% of tax revenue → 25% at +1pp → 40%+ at +5pp → 60%+ including $2T/yr new borrowing
- Anthropic reportedly willing to pay 20% for incremental capacity debt

### Chip efficiency

GB300 / TPUv7 / Trainium3 are 3–5x perf/watt over the prior generation. Frontier FLOP compute grows
4–5x/yr; compute required per capability level falls ~3x/yr; effective AI population therefore grows
~10x/yr. Chinese domestic chips are worth roughly 0.4x their nameplate watts.

## The Units Guard

Two denominators exist in this model and **must never be summed**:

- **`annuity` basis** — dollars per *GW/year of production capacity*. $6B of fab capex emits 1 GW
  of chips every year, indefinitely. A capacity annuity.
- **`perGw` basis** — dollars per *GW deployed, once*. $35B builds one gigawatt one time.

Revenue is per GW-year, a third thing.

`$6B fab + $50B datacenter = $56B/GW` is wrong and destroys the model's central insight. Every rail
carries an explicit `basis` field; the renderer and the aggregator both assert on it.

v1 violates this at `:683` — `leverage = capex / euvCostPerGw` divides a one-time deployment cost by
a capacity annuity. The v3 replacement is the amortization result below.

### Second guard: IT load vs facility load

`$/GW` is ambiguous between **GW of critical IT load** and **GW of grid-facing facility load**. At
PUE 1.2–1.3 that is a 20–30% swing — large enough to explain most apparent disagreements between
published per-GW figures, and large enough to silently corrupt the calibration panel.

All rails in this spec are defined on an **IT-load basis**, matching Epoch AI's convention, which is
the most methodologically transparent public model. A `pue` parameter (default 1.25) converts to
facility load for comparison against sources that use it.

This is an unresolved calibration question, not a solved one. Dylan's "$1T+ capex / 30 GW" implies
**$35B/GW**; Epoch's bottom-up GB200 model gives **$37.9B/GW** grid-powered; and if his 30 GW is
facility load then the IT-basis figure is nearer $44B/GW. Published comparables span the range —
Barclays $50–60B, Huang $50–80B, JLL ~$30B blended across AI and non-AI. The calibration panel must
display which basis each target uses, and a mismatch there is a bug, not a modelling choice.

### The amortization result

$6B fab capex ÷ (1 GW/yr × ~10yr fab life) = **~$0.6B per GW of chips produced**, against $35–50B/GW
all-in deployed cost.

**The entire physical bottleneck of the AI economy is ~1.5% of its cost structure.**

This reproduces Dylan's arithmetic exactly: $6B produces 5 GW over five years; 15 cumulative
GW-years × $100B/GW-yr = **$1.5T**; halved for middlemen = **$750B**; against $6B = **125x**. His
"100x, and we're being conservative" checks out.

It also explains the episode's psychology — why an EUV tool is worth $1B on resale, why "$10B to
Carl Zeiss, please expand production" is obviously correct and still does not happen, and why the
mirrors are simultaneously the tightest and the cheapest thing in the stack.

## Architecture

The engine, eleven rails, ~8 renderers, and the preset/calibration data blow through v2's 2000-line
threshold for extracting JS.

**ES modules do not work over `file://`** — CORS blocks them, and this is a file opened by
double-clicking. So the modern-looking answer breaks the artifact. Use plain `<script>` tags with
globals, loaded in order. No build step, no dependencies.

```
docs/datacenter-economics.html   shell + styles + panel containers
docs/js/rails.js                 rail definitions, elasticities, lags, provenance tags
docs/js/presets.js               scenario presets + calibration targets
docs/js/engine.js                year-step simulation
docs/js/render.js                panel renderers
```

Every rail constant carries a provenance tag — `dylan-2026-08`, `semianalysis-model`, `researched`,
`estimate` — surfaced on hover.

## Engine

### Carried state

```
installedGw        physical world AI datacenter capacity
effectiveGw        quality-adjusted (vintage-weighted perf/watt)
labGw              GW controlled by OpenAI + Anthropic combined
computePrice       $M/MW/yr at which compute actually transacts
labRevPerMw        $M/MW/yr the labs generate
capexPerGw         $B/GW all-in — OUTPUT, = sum of perGw rail prices
rate               blended ecosystem cost of credit
railPrice{}        per-rail price, updated each year
pipeline{}         per-rail capacity landing in future years
hoardedGw          built without a customer, available to sell later
cumulativeCredit   running total of debt issued
capability         index driving labRevPerMw growth
```

### Year step, 2026 → 2030

```js
for (const year of years) {
  // 1 — SUPPLY. Set by commitments made `lag` years ago, not by today's price.
  ceilings = {
    euv:     (cumulativeEuvTools * aiPct) / euvToolsPerGw,   // STOCK, not flow
    hbm:     pipeline.hbm[year],
    package: pipeline.package[year],
    power:   pipeline.power[year],
    capital: availableCapital / capexPerGw,
  }
  supplyGw = min(...values(ceilings))                        // NEW capacity only
  binding  = argmin(ceilings)                                // emergent, never editorial

  // 2 — DEMAND
  labWtp    = labRevPerMw * wtpFraction
  labDemand = labGw * labGrowthRate * priceDamp(computePrice, labWtp)
  demandGw  = labDemand + hyperscalerDemand + hoarderBuild + arbitrageShelf(computePrice)

  // 3 — CLEAR
  gap         = demandGw / supplyGw
  targetPrice = clamp(computePrice * gap ** priceElasticity, floorCost, labWtp)
  computePrice += damping * (targetPrice - computePrice)

  // 4 — ALLOCATE. Hoarded stock is already-built capacity, NOT new supply.
  newGw       = min(demandGw, supplyGw)
  forSale     = newGw + hoardedStock                         // released inventory
  labGw      += forSale * labShare(labWtp, computePrice)
  hoardedStock = hoardedStock - released + hoarderBuild      // built this year, sold later

  // 5 — RAIL REPRICING (margin migration)
  for (const r of RAILS)
    railPrice[r] *= 1 + r.marginElasticity * (railTightness(r) - 1)
  capexPerGw = sum(RAILS.filter(r => r.basis === 'perGw').map(r => railPrice[r]))

  // 6 — CAPITAL
  capex             = newGw * capexPerGw
  credit            = max(0, capex - ecosystemCashFlow * reinvestRate)
  cumulativeCredit += credit
  rate              = baseRate + termPremium(cumulativeCredit / creditMarketDepth)
  availableCapital  = ecosystemCashFlow + creditCapacity(rate)

  // 7 — BULLWHIP. Today's price buys capacity that lands in year + r.lag.
  for (const r of RAILS)
    if (railPrice[r] > r.investmentTrigger)
      pipeline[r][year + r.lag] += expansion(railPrice[r], rate)

  // 8 — MONETIZATION
  capability  += researchShare * labGw * perfPerWatt(year)
  labRevPerMw  = grow(labRevPerMw, capability) * (1 - regDrag)
  labRevPerMw  = min(labRevPerMw, diffusionCeiling(labGw, inferenceShare))

  // 9 — VINTAGE STACK
  effectiveGw += newGw * perfPerWatt(year)
}
```

### Stability

Recursive feedback can oscillate. Three defences, in order of importance:

1. **Structural clamping.** `computePrice` is bounded below by the arbitrage shelf and above by lab
   willingness-to-pay. It cannot escape the band, so divergence is impossible rather than merely
   unlikely.
2. **Damping** on price adjustment (default 0.5).
3. **Hard clamps** on every state variable, with a visible warning in the state table when one binds
   — a clamped run is a signal the parameters are wrong, not something to hide.

## Rails

Each rail carries capacity, price, a **numeric margin elasticity**, and a response lag. Elasticity
is numeric and slider-exposed rather than categorical, so the historical backtest below can tune it.

### perGw rails — sum to `capexPerGw`

Rails may nest via `parent`. Only top-level rails sum, which prevents double counting while
preserving sub-rail margin analysis — which is where the memory-vs-TSMC story lives.

All figures on an **IT-load basis** (see the load-basis guard below). Anchored on Epoch AI's
published 1 GW GB200 model, cross-checked against JLL and Turner & Townsend.

| Rail | Parent | 2026 $B/GW | Elasticity | Lag (yr) | Provenance |
|---|---|---|---|---|---|
| `servers` — accelerator + server BOM | — | 21.2 | 1.0 | 0.5 | `researched` — Epoch AI 2026-05 |
| ├ `logic` — TSMC N3/N5 wafers | servers | 1.2 | **0.20** | 2 | counts **disputed** — see below |
| ├ `memory` — HBM4 + LPDDR5X | servers | **4.9** | **step** | 1.0 | `researched` — MS rack BOM, post-SOCAMM-cut |
| ├ `package` — CoWoS + ABF substrate | servers | **0.6** | 1.3 | 1 | `researched` — was 3x too high |
| └ vendor margin + rest of BOM | servers | **14.5** | 1.0 | 0.5 | derived residual |
| `network` — networking, optics | — | 4.9 | 0.6 | 0.5 | `researched` — Epoch AI |
| `dcElec` — in-DC electrical, switchgear, UPS | — | 5.4 | 0.35 | **2.75** | `researched` — 48% × $11.3B (T&T share) |
| `cooling` — mechanical / liquid cooling | — | 3.7 | 0.45 | 2 | `researched` — 33% × $11.3B (T&T share) |
| `shell` — civil, land, utility works | — | 2.5 | 0.30 | 2 | `researched` — 19% × $11.3B + Epoch land |
| `power` — generation adder | — | **0.5** | 0.70 | **5.0** | `researched` — see generation modes |
| **Total (grid-connected)** | | **38.2** | | | vs Epoch's independent $37.9B |

Three independent sources converge on **$11.3–11.4B/GW** for facility (shell + in-DC electrical +
cooling): Epoch AI's bottom-up $11.43B, JLL's $11.3M/MW shell-and-core, and Turner & Townsend's
52-market index. That agreement to within 1% is the strongest calibration point in the whole model.

**`power` is a mode, not a scalar.** Generation cost per GW of datacenter load, assuming ~1.15 GW
nameplate to firmly serve 1 GW:

| Mode | $B/GW | Time to power | Source |
|---|---|---|---|
| Grid-connected (default) | 0.05–0.5 | 4–7 yr queue | interconnection cost data |
| Dedicated CCGT | **2.3–3.0** | 24mo build + **5yr turbine lead** | Lazard v19, BNEF, GridLab |
| Simple-cycle bridge | 1.3–1.9 | 24mo + 18–36mo lead | Lazard v19 |
| New nuclear | **14–20** | **84 months** | Lazard v19 |

**This corrects two errors of roughly 2x in opposite directions.** My draft had `power` at $5.0B/GW
(actual: $0.5–3.0B unless nuclear) and `dc` at $6.0B/GW (actual: ~$11.4B). They happened to cancel
in the total, which is exactly the kind of compensating error a calibration panel would never catch.

### Elasticities are now calibrated, not guessed

Observed price series from the research replace my reading of Dylan's qualitative "fast/slow":

| Component | Price change | Period | Implied annual |
|---|---|---|---|
| Gas turbine equipment | +195% | vs 2019 | ~+16%/yr |
| CCGT installed | $1,500 → $2,157/kW (+44%) | 2023–25 | ~+20%/yr |
| Power transformers | +77% | since 2019 | ~+10%/yr |
| Distribution transformers | up to +95% | since 2019 | ~+12%/yr |
| MV switchgear | +50% | since 2021 | ~+8%/yr |
| MV circuit breakers | +47% | since 2021 | ~+8%/yr |

Back-solving `dcElec`: transformer demand rose +119% over six years against roughly flat supply
(2025 shortfall 30%), yielding +77% price. A sustained tightness near 1.3 producing 1.77x over six
years implies a per-year multiplier of 1.10, so `1 + e × 0.3 = 1.10` → **e ≈ 0.35**. That is well
below the 0.5 I guessed, and it is now derived from a real series rather than from an adjective.

### Silicon-side repricing: measured, and faster than I modelled

The chip supply chain gave up a full observed series over four quarters. This is the bullwhip,
instrumented:

| Layer | Contract structure | Observed rate |
|---|---|---|
| Conventional / server DRAM | quarterly, spot-linked | **+93–98% QoQ (1Q26) → +58–63% (2Q26) → +13–18% (3Q26)** |
| ABF film (Ajinomoto, ~95% share) | annual, monopoly | **+30% in one step**, Q3'26 |
| ABF substrate | semi-annual | +3–5% QoQ H1'26, +5–10% H2'26; AI-grade +15–40%/yr |
| FC-BGA (Samsung Electro-Mechanics) | renegotiation | +10%, Apr 2026 |
| **HBM** | **annual LTA, 5-yr frames** | **flat-to-down 2026, then +50–79% for 2027** |
| CoWoS / advanced packaging | annual, allocated | +10–20%/yr ASP |
| Foundry (advanced nodes) | annual, strategic | +3–10% for 2026; up to +25% on some services 2027 |
| NVIDIA rack / server | per-generation | +15% early 2027; rack BOM +95% GB300 → VR200 |

**Two structural corrections to the mechanic.**

**HBM does not reprice continuously — it steps.** This is the opposite of what I assumed, and it is
the single most counterintuitive finding in the research. HBM sits under multi-year LTAs, was
*flat-to-down through 2026* while commodity DRAM nearly doubled in a single quarter, and then jumps
50–79% in one annual reset. My continuous-elasticity formula cannot express that shape. `memory`
therefore carries `elasticity: 'step'` — tightness accumulates as pressure and discharges at the
contract reset, rather than bleeding into price each year.

**The bullwhip is bifurcated by buyer size.** TrendForce attributes 3Q26's moderation directly to
*"multi-year long-term agreements which restrict suppliers from raising prices"* for large CSPs —
smaller buyers eat the full increase. SK hynix has LTAs with ~10 customers on 5-year terms; Micron
holds **$18B of customer cash deposits**. So labs and hyperscalers face a materially different price
path from the arbitrage shelf, which is exactly the buyer class our demand model already separates.

### Margin is the tell — and these are validation targets

Disclosed FY2026 profitability across the rails, all Tier 1:

| Layer | Margin | Company |
|---|---|---|
| Memory | **76% OP margin** / **84.9% GM** | SK hynix Q2'26 / Micron FQ3'26 |
| Accelerator | **75.0% GM**, guiding 74.0% | NVIDIA Q2 FY27 (reported 2026-08-26) |
| Foundry | **67.7% GM** | TSMC Q2'26 |
| Substrate | **~29% Electronics OP margin** | Ibiden Q1 FY26 |

The margin-migration mechanic must reproduce this ordering. It is a harder test than the historical
backtest because it is a *level* check, not a direction check.

Two pieces of evidence worth encoding directly:

**Foundry's slowness is a choice, not a constraint.** TSMC's CEO, on the Q2 2026 call: *"I'm really
jealous about memory companies, 86% gross margin… About 68%, I would be happy about that,"* and
*"we don't suddenly increase our price by 4x or 5x… we earn our value."* The CFO calls pricing
*"strategic, not opportunistic."* Our `logic` elasticity of 0.20 encodes a management policy, not a
physical response time — and policy can change faster than physics. Worth a scenario toggle.

**Ibiden gives the cleanest price-vs-volume decomposition available anywhere.** Of the ¥35B increase
in FY2026 Electronics operating-profit guidance, **¥26.5B was ASP and mix and only ~¥3B was volume**
— 76% price, 9% volume. That is direct proof that a tight rail converts scarcity into margin rather
than into output, which is the entire premise of the margin-migration model.

**Measured OEM damping:** NVIDIA is absorbing ~300–400bps of gross margin (75.0% → guided 74.0%,
reportedly bottoming 71–72%) while passing ~15% through to server prices with roughly a two-quarter
lag. That is a directly observed damping coefficient at the OEM node, not an assumption.

### annuity rails — capacity ceilings and amortized cost only

| Rail | Parent | $B per GW/yr | Elasticity | Lag (yr) | Provenance |
|---|---|---|---|---|---|
| `euv` — EUV tools (ASML) | — | **0.95** | 0.3 | 3 | `researched` — 3.5 × realized ASP |
| └ `optics` — mirrors (Zeiss) | euv | **0.23** | 0.1 | **4+** | `researched` — see derivation |
| `otherWfe` — DUV, etch, depo, metrology | — | 2.55 | 0.4 | 2 | derived to hit $3.5B WFE |
| `fabshell` — cleanroom + shell | — | 2.5 | 0.5 | 2 | derived to hit $6B total |
| **Total** | | **6.0** | | | `dylan-2026-08`, verbatim |

WFE subtotal (`euv` + `otherWfe`) = $3.5B, inside the stated $3–4B.

**The $400M/tool figure in the transcript is wrong for 2025 actuals.** ASML recognized 48 EUV
systems on €11.6bn of EUV net system sales in FY2025 → **realized blended ASP €242M (~$265–285M)**.
The $380–400M price belongs to High-NA (EXE:5000/5200), not the Low-NA NXE tools that make up 44 of
those 48 units. Dylan's number is defensible as a forward 2027+ figure under High-NA mix shift, but
it overstates today by 20–25%, and 3.5 × $400M = $1.4B was carrying that error into our rail.

**`optics` derivation.** ASML's disclosed related-party purchases from Carl Zeiss SMT were
**€4,406.9M in 2025 = 28.6% of total cost of sales**, a ratio stable in a 28–34% band across twenty
years of 20-F filings. No EUV/DUV split is disclosed by anyone, so the per-tool optics content must
be inferred: **€45–70M per Low-NA tool** (~20–29% of ASML's EUV ASP), bounded above by €92M/tool
(the unreachable case where DUV, metrology and spares contain zero Zeiss content). At 3.5 tools:
**$185–285M per GW/yr, or 3–5% of the $6B fab cost.** Confidence stays Low-Medium — this remains
the weakest-sourced rung in the model and keeps its flag.

**Why the rail exists at all**, from ASML's own 2025 risk factors (p.69):

> "The number of lithography systems we are able to produce is limited by the production capacity of
> one of our key suppliers, Carl Zeiss SMT, our sole supplier of lenses, mirrors, illuminators,
> collectors and other critical optical components… if Carl Zeiss SMT were to terminate its supply
> relationship with us or be unable to maintain production of optics over a prolonged period, we
> would effectively cease to be able to conduct our business."

Note the live disagreement: ASML's filing and Dylan both say Zeiss is the binding constraint; Zeiss
SMT's CEO said publicly in August 2026 that it is not. Both hold if ASML's ramp plan is *itself set
by* what Zeiss can deliver — which is why `optics` sits upstream of `euv` as its parent rail rather
than as a peer.

### EUV tool supply is disclosed, not guessed

ASML's CEO gave hard capacity guidance on the Q2 2026 call: **~65 Low-NA systems in 2026, +30% for
2027 (~85), and a further +30% under investigation for 2028 (~110)** — all within the existing
footprint. `cumulativeEuvTools` should be driven by this series rather than by a slider guess, with
the slider expressing deviation from it.

**This contradicts the transcript, in the direction that matters.** Dylan puts ~100 tools/yr at
2030; ASML's own plan reaches ~110/yr by **2028**, two years earlier.

**Install-lag convention.** A tool shipped in year Y does not produce a full year of wafers in Y —
it needs months to install and qualify. The ceiling for year Y therefore uses tools cumulative
**through the end of Y−1**. This must be stated explicitly because the answer is sensitive to it:
counting same-year shipments moves the 2028 ceiling from ~75 to ~94 GW/yr. Constant:
`EUV_INSTALL_LAG_YEARS = 1`.

Running the corrected stock model on ASML's series — ~290 cumulative tools at end-2025, then
+65/+85/+110 — at 60% AI allocation and 3.5 tools/GW:

| Year | Installed base | Ceiling GW/yr | Demand GW | Headroom |
|---|---|---|---|---|
| 2026 | 290 | **49.7** | 30 | +66% |
| 2027 | 355 | **60.9** | 50 | +22% |
| 2028 | 440 | **75.4** | 70 | **+8%** |

**EUV is slack in 2026–27 and marginal in 2028** under the most conservative reading. That is more
nuanced than "never binds," and the honest version: EUV is not the 2026 constraint v1 claimed, but
it is not comfortably slack forever either. Three things push it back to slack — a higher AI
allocation than 60%, ASML sustaining +30%/yr past 2028, or the disputed wafer count resolving low
(which alone would triple the ceiling). Two push the other way: High-NA transition raising
tools/GW, or a Zeiss shock.

The rail stays in the model and the base case should show 2028 headroom in single digits, not a
comfortable margin.

### Anchors that survived

The transcript's fab numbers held up under primary-source checking, and the derivation surfaced:

| Anchor | Verdict |
|---|---|
| 3.5 EUV tool-years per GW/yr | Derivation located, but **rests on a disputed input** — see below |
| $3–4B WFE per GW/yr | **Supported** |
| $6B fab all-in per GW/yr | **Supported verbatim** |
| $400M per EUV tool | **Contradicted** for 2025; forward-looking only |
| 170K DRAM wafers per GW | **Supported** — bottom-up gives ~140K, within 20% |
| 55K N3 wafers per GW | **Disputed by 3x** — see below |

### The 55,000 N3 wafer figure is the model's largest single uncertainty

The 3.5-tools-per-GW coefficient is *derived from* the wafer counts: ~2M EUV passes per GW comes
from 55K N3 + 6K N5 wafers at ~20 passes each. So if the wafer count is wrong, the EUV coefficient
is wrong by the same factor, and the EUV rail moves with it.

A bottom-up die count contradicts it. At Foxconn's disclosed **3,557 racks/GW** × 72 packages =
~256,000 Rubin packages/GW, each carrying two near-reticle N3 compute dies → ~512,000 dies. At
~730mm², a 300mm wafer yields ~76 gross and ~47 good at D0 ≈ 0.07/cm² → **~10,900 wafers**. Adding
I/O dies, Vera CPU, NVLink switch, ConnectX and CPO silicon reaches **~17,000–20,000 N3-class
wafers/GW**. Hitting 55,000 would require ~9 good dies per wafer from a 730mm² die, which is not
physically plausible.

Two top-down checks *support* 55,000 — TSMC's disclosed "high-teens %" AI revenue implies ~$1.8B of
TSMC content per GW against the anchor's ~$1.4B, and 20 GW × 55K reconciles with SemiAnalysis's
separately published "AI ≈ 60% of N3 output in 2026." But that second check is circular (same shop),
and the first is consistent with either reading once packaging and non-GPU silicon are included.

Most likely resolution: **55,000 is an all-in system figure** covering networking, optics, CPU, HBM
base dies, and yield/binning loss — not GPU compute wafers, which are ~11,000–13,000/GW.

Notably, Dylan states the figure in March 2026 and never restates or defends it; Dwarkesh repeats it
back in the August episode and Dylan does not engage. No published derivation exists.

**Model treatment.** `logicWafersPerGw` becomes a slider spanning **20,000–55,000** (default 55,000
to stay Dylan-calibrated), and `euvToolsPerGw` is **derived from it** rather than entered
independently — they are not free parameters. At the low end the EUV coefficient falls to ~1.3
tools/GW and the EUV rail goes from slack to irrelevant. Since the spec already concludes EUV never
binds, this uncertainty only strengthens that conclusion; it would need to resolve the *other* way,
well above 55,000, to threaten it.

One transcript detail to avoid repeating: the claim that a scanner has "18 of these lenses"
conflicts with the documented **6 mirrors** in 0.33-NA projection optics and **8** in High-NA. It is
probably a full-optical-path count including collector and illuminator, but no source gives a clean
total, so the UI should not cite it.

### Margin migration

```js
railTightness(r) = demandGw / r.ceiling          // >1 tight, <1 slack
railMargin[y]    = baseMargin * (1 + r.marginElasticity * (railTightness(r) - 1))
```

`annuity` rails use their own capacity ceiling; `perGw` rails use the pipeline capacity for that
component. Tightness is clamped to `[0.5, 3.0]` so a single starved rail cannot drive prices to
absurdity in one step.

Fast rails capture margin almost immediately when tight; slow rails do not. This is the transcript
nearly verbatim: "TSMC raising prices very slowly, but memory companies raising prices very quickly.
Substrate companies raising prices very quickly."

**Historical backtest.** Run the engine from 2023 with memory loose. It must reproduce a known
outcome: all value at the fab and chip layer, memory earning nothing on HBM, then memory margin
overtaking TSMC's by 2026. If the elasticities cannot reproduce a shift that already happened, they
are wrong. This is a free validation set and the reason elasticity is numeric.

## Demand

Four buyer classes, behaving differently:

**`labDemand`** — OpenAI + Anthropic. 3x/yr trend, damped as price approaches `labWtp`.
`wtpFraction` is the most important slider in the model: labs generate ~$50M/MW and pay ~$13M today
(≈0.26), but at $100M/MW generation Dylan says they would pay $50M. How fast that fraction rises
decides whether 100 GW by 2028 happens at all.

**`hyperscalerDemand`** — Google, Meta, Amazon, Microsoft internal use. Moderately price-sensitive.

**`hoarderBuild`** — Meta and SpaceX building with no customer, off balance sheet. Price-insensitive
at build time. **Becomes available inventory in a later year at whatever the market will bear.**
This is the only buyer that flips to seller, and it is load-bearing: it is how Elon "recoups my
entire CapEx in a year," and it is self-limiting, since hoarding only pays while the spread is wide,
damping the scarcity it profits from.

*Accounting care required.* Hoarded gigawatts consume physical rails in the year they are **built**.
Releasing them later must not add to `supplyGw`, or the model manufactures capacity from nothing.
They are carried as `hoardedStock` — already-built inventory that enters the *allocation* step, not
the supply ceiling. Release rate is a function of the spread between `computePrice` and the
hoarder's own internal monetization: they sell when renting out beats using it themselves.

**`arbitrageShelf`** — the "go get a GB300 rack, download Kimi weights, put it on OpenRouter" crowd.
Near-infinitely elastic below ~$15M/MW, vanishing above. It does not compete for scarce compute; it
**sets the floor**.

## Capital

```js
credit           = max(0, capex - ecosystemCashFlow * reinvestRate)
rate             = baseRate + termPremium(cumulativeCredit / creditMarketDepth)
availableCapital = ecosystemCashFlow + creditCapacity(rate)
```

`creditCapacity` is bounded by market depth and **rationed by price, not expanded by it** — "Meta
would happily pay 8%; the market won't want them to."

The negative feedback (more capex → more credit → higher rate → less affordable capex) is what makes
the system converge, and is the mechanism behind "not as many gigawatts as should be built will be
built."

Three independent calibration anchors for this one loop: $5T cumulative credit, $11T cumulative
capex, and Meta's cost of debt moving 5–6% → 8%.

## Lab Allocation and the Diffusion Ceiling

Starting split: 50% research / 10% development / 40% inference.

```js
labRevenue   = labGw * inferenceShare * revPerMw
capability  += researchShare * labGw * perfPerWatt
revPerMw     = grow(revPerMw, capability) * (1 - regDrag)
```

Research compute raises *future* revenue per MW at the cost of *current* revenue. `inferenceShare`
declines by default, per Dylan's non-consensus call.

**Nowcast hook.** `impliedInferenceShare ≈ ΔARR / (ΔGW × revPerMw)`. Computable from public ARR and
compute announcements — the model's best real-world validation signal, and the reasoning behind
"compute adds accelerated while ARR adds plateaued, so the marginal megawatt went to R&D."

### Regulatory drag is discrete, not smooth

My draft had `regDrag` as a single smooth coefficient. The 2026 evidence says that is the wrong
shape. Two of the largest US markets went to effectively zero new approvals **three weeks apart**:

- **New York, 14 July 2026** — Executive Order 62: one-year moratorium on discretionary DEC
  environmental permits for datacenters ≥50 MW, effective immediately, applications held in abeyance.
- **Texas, 3 August 2026** — Governor's directive requiring an audit of every datacenter project in
  ERCOT's interconnection queue before any further approvals. ERCOT told press this "effectively
  pauses all data center projects." Audit completes December 2026. ERCOT's queue holds ~474 GW of
  requests, ~90% datacenter — **five times ERCOT's record peak demand**.
- **Ohio** — not a moratorium but a tariff: datacenters >25 MW pay for ≥85% of subscribed capacity
  for up to 12 years regardless of consumption, plus collateral and exit penalties.

Nationally: **300+ datacenter bills across 30+ states in the first six weeks of the 2026 session**
(vs 200+ across 40+ states in all of 2025), and **14 states considering statewide moratoriums**.

This validates the transcript's aside — "New York's banning data centers, Texas is holding
moratoriums, Ohio's saying you have to pay everyone's property tax" — as current fact rather than
prediction. It also means the model needs **discrete, correlated, jurisdiction-level stop events**,
not a smooth multiplier: a Bernoulli draw per jurisdiction per year, with correlation, because the
observed behavior is step-function and contagious across states.

`regDrag` retains its second, separate channel — withheld model releases (Astra, Mythos 2)
suppressing `revPerMw` → `labWtp` → clearing price → supply. That one *is* smooth. The two channels
must not be collapsed into one coefficient.

### Announcement-to-delivery attrition

Announced capacity is a bad predictor of delivered capacity, and now we have the discount rates:

| Measure | Ratio | Source |
|---|---|---|
| Interconnection queue capacity reaching COD | **13%** | LBNL *Queued Up* 2026 |
| Behind-the-meter: 2 GW online vs 90 GW announced | **2.2%** | Cleanview 2026 |
| Eaton's 307 GW DC backlog converting near-term | **~20%**, majority 2028+ | Eaton Q2 2026 call |
| Typical queue time to COD | **55 months** | LBNL |

Eaton describes its 307 GW pipeline as "15 years of backlog at 2025 build rates." Any pipeline the
model ingests must be discounted by these factors before it becomes capacity, or the supply rails
will be systematically optimistic by roughly an order of magnitude.

The hardest number here: **EIA expects only 6.3 GW of new US gas capacity in 2026** against a
combined OEM backlog of ~220 GW — gas is being *ordered* at roughly ten times the rate it is being
*commissioned*. That gap is the bullwhip, measured.

**Diffusion ceiling:**

```js
maxLabRevenue = addressableValue * captureRate   // wage bill + IT spend, slow-moving
revPerMw      = min(revPerMw, maxLabRevenue / (labGw * inferenceShare))
```

Without it the model prints $7T of 2028 lab revenue — 6% of world GDP to two firms, requiring
15–20% of the global white-collar wage bill displaced in twenty-four months. With it, the model is
forced to report **which of Dylan's numbers has to give**: the 100 GW or the $70M/MW. He cannot have
both, and half-concedes it — "there's an upper limit on how fast their revenue can grow versus the
value they deliver into the world."

This is the most valuable output in the tool and the one thing here that is not in the podcast.

## Panels

### Value capture ladder (hero)

Stacked rungs in $M/MW with the **spread between rungs** as the visual emphasis. Top rung
(end-user capture) renders dashed with a "marginal rate — does not scale" warning: displayed for
context, never load-bearing on any calculation.

### Rail margin migration

Small multiples, one sparkline per rail, 2023 → 2030, showing margin share. The investment thesis
lives here: not which rail is *tight*, but which rail converts tightness into *margin*.

### Per-year state table (anti-black-box)

| Year | Demand | EUV | HBM | Pkg | Power | Capital | Binding | Price | $B/GW | Credit | Rate | Lab GW |

Replaces v1's hardcoded `renderTimeline()`. Any surprising year is traceable to the rail that moved.
Clamped values render with a warning marker.

### Calibration panel

Model output against Dylan's stated figures, with live deviation:

| Target | Source | Model | Δ |
|---|---|---|---|
| 2026 new GW | 30 | — | — |
| 2028 new GW | 70 | — | — |
| 2028 total capex | $3.5T | — | — |
| Cumulative capex '24–29 | $11T | — | — |
| Cumulative credit | $5T | — | — |
| Compute price 2028 | $40M/MW | — | — |
| 2026 $/GW | $35B | — | — |
| 2028 $/GW | $52B | — | — |

Keeps the user honest about when they are modelling Dylan versus modelling themselves — necessary
given Dylan-calibrated defaults with deliberately wide slider ranges.

### Retained from v1/v2

- **Pipeline** → ships as a current-year state snapshot (the "Current-year snapshot" panel renders
  the same per-year rail/limiter/price row the full state table does, pinned to the first simulated
  year), not a live-quantity panel. `'55K'` (logic wafers/GW) remains an INPUT slider only — it feeds
  `euvToolsPerGwFromWafers` but is never displayed back as a computed quantity — and `'170K'` (DRAM
  wafers/GW) is not modelled at all: no field for it exists anywhere in engine.js, rails.js, or
  presets.js. Making either a genuine live quantity needs new model surface (a DRAM/memory-tooling
  sub-model this branch never built), not a rendering change, so it is deferred to a follow-up spec
  rather than shipped as a label on a number the model doesn't actually compute. (Final review, I10.)
- **Per-GW economics** → recalibrated, with the ~1.5% amortization result surfaced
- **Capacity ceiling** → absorbed into the state table
- **Bottleneck bar + timeline** → emergent per year
- **Jevons check** → becomes the diffusion ceiling
- **Stock sensitivity matrix** → tab auto-selection driven by *rail margin expansion* rather than
  rail tightness
- **Anthropic vs OpenAI** → driven by the `labGw` split

## Acceptance Criteria

> **Outcome, recorded 2026-08-27 after implementation.** Eight of the thirteen checks below hold.
> Five do not, and **that is a deliberate, retained result rather than an unfinished requirement** —
> the whole point of the calibration panel is to show where the model disagrees with its source.
> The subsection *Results against these criteria* immediately after the table records what actually
> shipped, including the fact that the four checks this section calls "independent" all fail. Read
> the table below as the targets the model is measured against, not as a claim that it hits them.

The engine at default settings must reproduce, within 10%:

| Check | Target | Source |
|---|---|---|
| 2026 new GW | 30 | transcript |
| 2027 new GW | 50 | transcript |
| 2028 new GW | 70 | transcript |
| 2029 new GW | 90–100 | transcript |
| 2028 cumulative world GW | ~200 | transcript |
| 2028 total capex | $3.5T | transcript |
| 2026 capex per GW | $35B facility / $38B IT-basis | derived vs Epoch AI — **see load-basis guard** |
| 2028 capex per GW | $52B | derived: $3.65T ÷ 70 |
| Facility subtotal (shell+elec+cooling) | $11.3–11.4B | Epoch, JLL, T&T converge |
| Turbine lead time | 5 yr | GE Vernova 2031 reservations |
| EUV ceiling 2026 / 2027 / 2028 | ~50 / ~61 / ~75 GW/yr | ASML 65/85/110, install lag 1yr |
| Cumulative capex 2024–29 | $11T | SemiAnalysis model |
| Cumulative credit 2024–29 | $5T | SemiAnalysis model |
| Lab share of 2028 incremental | 70–80% | transcript |
| Compute price path | 13 → 25 → 40 | transcript |

The last four are *independent* of the GW discussion, so hitting them would validate the engine
against numbers it was not fitted to. **None of the four is hit** — see below.

### Results against these criteria (2026-08-27, `DEFAULT_INPUTS`, seed 12345)

| Check | Target | Actual | |
|---|---|---|---|
| 2026 new GW | 30 | 30.0 | ✅ |
| 2027 new GW | 50 | 45.6 | ✅ −9% |
| 2028 new GW | 70 | 64.9 | ✅ −7% |
| **2029 new GW** | **90–100** | **22.7** | ❌ **−76%** |
| 2028 cumulative world GW | ~200 | 190 | ✅ |
| 2028 total capex | $3.5T | $3.22T | ✅ −8% |
| 2026 capex per GW | $38.2B IT-basis | $38.1B | ✅ |
| 2028 capex per GW | $52B | $49.6B | ✅ −5% |
| EUV ceiling 2026/27/28 | ~50 / ~61 / ~75 | 49.7 / 60.9 / 75.4 | ✅ |
| **Cumulative capex** | **$11T** | **$7.18T** | ❌ *out-of-sample* |
| **Cumulative credit** | **$5T** | **$3.58T** | ❌ *out-of-sample* |
| **Lab share of 2028 incremental** | **70–80%** | **52%** | ❌ *out-of-sample* |
| **Compute price path** | **13 → 25 → 40** | **13 → 16 → 25** | ❌ *out-of-sample* |

**One mechanism explains four of the five misses.** The diffusion ceiling caps `labRevPerMw` at what
the addressable economy can absorb. That pulls lab willingness-to-pay below the clearing price, lab
demand collapses, and 2029 becomes **demand-limited** — so GW, cumulative capex, cumulative credit
and the price path all come in low together. Lab share falls for the same reason: labs cannot outbid
when they cannot monetize.

**Capital is not the cause, despite an earlier draft of this spec and several code comments saying
so.** The 2029 capital ceiling is 60.3 GW against demand of 22.7; raising `creditMarketDepth` to
10,000,000 moves the year by 0.4 GW of a 72 GW gap. Capital binds in exactly one year, 2030, which
is not a target. That mislabel survived three fix rounds because `bindingConstraint` was `argmin`
over ceilings and never asked whether demand had fallen below all of them; see `limitingFactor()`.

**On the out-of-sample four.** Their unanimous failure is the single most important thing in this
table. It is consistent with the same mechanism, which is reassuring for internal coherence — but it
is also exactly what over-constraining the demand side would look like, and this model cannot
distinguish those two readings from inside itself. Treat the direction (a monetization-driven
shortfall) as the finding and the magnitude as unresolved. Note also that the 2029 figure is a single
seeded draw: across seeds 1–40 it spans 22.7–76.2 GW, though *no* seed reaches 90.

**Window mismatch, resolved by relabelling.** The two cumulative targets are stated by their source
for 2024–29; the model accumulates 2026–29 only. Two of six source years are structurally absent, so
the comparison understates by construction. The labels now say so rather than comparing silently; the
target values were not moved.

Additional required behaviours:

- **Historical backtest**: from a 2023 start, memory margin must overtake TSMC's by 2026.
- **Units guard**: summing an `annuity` rail into `capexPerGw` must throw, not silently produce a
  number.
- **Stability**: no state variable diverges across a full sweep of every slider's range.
- **Diffusion ceiling bites**: at Dylan's 100 GW and $70M/MW the model must report an explicit
  conflict rather than printing $7T.

## Out of Scope

Deferred to the macro spec, which builds on this foundation:

- Sovereign stress screen (debt service ratios, Volcker-2 default cascade)
- Equity duration crusher (`Δvalue ≈ −duration × Δr`)
- The "everything trades at 2–3x earnings" inversion toggle
- Bank credit-spread mismatch, levered-sector screen

Deferred to a later spec:

- Bayesian regime tracker with evidence toggles and likelihood ratios
- Monte Carlo fan charts, Brier-scored calibration log
- China as a separate quality-adjusted compute track
- Centralization / effective-AI-population panel

Permanently out:

- External data feeds, hosting, build step, charting libraries

## Open Items

### Resolved by research

| Rail | Was | Now | Change |
|---|---|---|---|
| `power` | $5.0B/GW, lag 3yr | $0.5B grid / $2.3–3.0B gas, **lag 5yr** | ~2x too expensive, and the lag was badly wrong |
| `dcElec` + `cooling` + `shell` | $6.0B/GW combined | **$11.4B/GW** | ~2x too cheap — cancelled the `power` error in the total |
| `euv` | $1.4B per GW/yr | **$0.95B** | $400M/tool is High-NA, not realized ASP |
| `optics` | $0.4B per GW/yr | **$0.23B** ($185–285M) | now bounded by ASML's disclosed Zeiss purchases |
| `memory` | $5.0B/GW (`hbm`) | **$4.9B/GW**, step-repricing | estimate was close; the *shape* was wrong |
| `package` | $1.8B/GW | **$0.6B/GW** | ~3x too high |

The `power`/`dc` pair is worth dwelling on: two ~2x errors in opposite directions that **summed to
the right total**. No amount of top-line calibration would have caught it. Rails have to be sourced
individually.

`package` decomposes as CoWoS-L at ~$950/package × 256K packages/GW ≈ $244M, ~$460M including
packaging yield loss, plus ~$90–115M of ABF substrate across the full rack. `memory` is the
post-SOCAMM-cut all-memory figure (HBM4 + LPDDR5X); NVIDIA halved SOCAMM capacity in July 2026,
taking rack LPDDR from ~55TB to ~28TB, so the pre-cut $7.1B/GW is now stale.

HBM wafer intensity resolves to **3.0x** commodity DRAM, not the 4x SemiAnalysis projects: Micron's
HBM architecture fellow stated ~3x at Hot Chips on 2026-08-23 and said it would *"definitely not get
better,"* and TrendForce's published wafer-share and bit-share series independently imply 2.9x for
both 2026 and 2027. Use 3.0x with a 2.5–3.5x sensitivity.

### Still open

| Rail | Issue |
|---|---|
| `servers` | Epoch's $21.2B is **GB200-based**. Morgan Stanley's VR200 rack BOM × 3,557 racks/GW gives ~$27.7B, and Foxconn puts Vera Rubin at ~$47B/GW all-in vs ~$40.5B for Blackwell. The rail needs a **generation dimension**, not a single 2026 value. |
| `logic` | Wafer count disputed 3x (above). Slider, not a constant. |

### Permanently unavailable

These stay flagged estimates regardless of further research:

- **Zeiss optics content per EUV tool.** No public figure exists in dollars or percent — not from
  ASML, Zeiss, or any analyst. The related-party purchase total is the only handle and it has no
  EUV/DUV split. Zeiss reports no SMT-segment capex, EBIT or balance sheet.
- **No Zeiss primary source for "100 EUV tools/year by 2030."** The only trace is the transcript
  paraphrasing Zeiss. Use ASML's disclosed 65/85/110 series instead.
- **Mirror polishing throughput.** "Months per mirror," and a 2021-vintage "more than a year" quote,
  is as granular as the public record gets.
- **2026 switchgear, UPS, chiller and generator lead times.** Only vendor and trade-press estimates.
  A real gap, since switchgear is plausibly as binding as transformers.

If a figure cannot be sourced, the rail keeps its estimate and stays flagged rather than being
dropped. A visible estimate is more useful than a missing rung.

### Worth pulling from primary sources

Things a subscription or an institutional login would resolve that web search could not:

1. **SemiAnalysis Datacenter Industry Model** (paywalled). It is the source of the $11T/$5T capex
   and credit figures we are calibrating against, and we could not verify them against a primary
   document.
2. **SPIE 12953 (2024), "EUV optics at ZEISS: status, outlook, and future"** — the most likely
   public source of optics manufacturing throughput detail. Paywalled.
3. **Turner & Townsend Data Centre Construction Cost Index** (gated). We have the headline $/W and
   the electrical/mechanical cost shares only through secondary coverage.
4. **EPRI's gas turbine pricing publication** — its $2,000→$3,000/kW figure has no stated scope, and
   at installed-cost scope it sits ~15% above Lazard's high case. Scope confirmation would settle
   the `power` stress case.
