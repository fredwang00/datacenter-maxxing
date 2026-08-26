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

**EUV is not the binding constraint and will not be until roughly 2029–30.** v1's central claim —
a hard ~12 GW/yr EUV ceiling — is an artifact of the bug. Dylan names the real one directly: "the
world is capital constrained."

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
| Cost to own + operate | ~11–12 | derived: 5yr amort + ~$0.5B power + opex |
| Commodity rental | 10–15 | "anyone can make money at $10-15M/MW" |
| Scarcity / hoarder | 25–50 | SpaceX → Google at "$40B a gigawatt" |
| Lab revenue | 50–60 now → 70–80 (end '27) → 100 | Anthropic "$60+ billion per gigawatt" |
| End-user capture | 200–500 | Jane Street. **Marginal rate, does not scale.** |
| Full-AGI ceiling | ~100 ("many hundreds") | 1M workers × $100K. Speculative. |

The thin margin between cost (~11–12) and commodity rental (13) is why "anyone can make money…
it's not that hard" is true *and* why Elon would not sell at $15 but does at $25. Internal
consistency here is evidence the numbers are real.

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

| Rail | Parent | 2026 $B/GW | Elasticity | Lag (yr) | Provenance |
|---|---|---|---|---|---|
| `accel` — accelerator vendor | — | 17.0 | 1.0 | 0.5 | derived |
| ├ `logic` — TSMC N3/N5 wafers | accel | 1.2 | 0.25 | 2 | wafer counts `dylan-2026-08`, prices `estimate` |
| ├ `hbm` — HBM / memory | accel | 5.0 | 1.5 | 0.75 | `estimate` — **pending research** |
| ├ `package` — CoWoS / substrate | accel | 1.8 | 1.3 | 1 | `estimate` — **pending research** |
| └ vendor margin + non-die BOM | accel | 9.0 | 1.0 | 0.5 | derived residual |
| `network` — networking, optics, servers | — | 7.0 | 0.6 | 0.5 | `estimate` |
| `power` — generation | — | 5.0 | 0.7 | 3 | `estimate` — **pending research** |
| `dc` — shell, electrical, cooling | — | 6.0 | 0.5 | 2 | `estimate` |
| **Total** | | **35.0** | | | reproduces $1.05T ÷ 30 GW |

IT subtotal (`accel` + `network`) = $24.0B; DC + energy = $11.0B. By 2028 rail repricing should
carry these to roughly $35.7B and $16.3B for a $52B/GW total, matching $3.65T ÷ 70 GW — from the
elasticities alone, with no hand-tuning.

### annuity rails — capacity ceilings and amortized cost only

| Rail | Parent | $B per GW/yr | Elasticity | Lag (yr) | Provenance |
|---|---|---|---|---|---|
| `euv` — EUV tools (ASML) | — | 1.4 | 0.3 | 3 | 3.5 × $400M, `dylan-2026-08` |
| └ `optics` — mirrors (Zeiss) | euv | 0.4 | 0.1 | 4 | `estimate` — **pending research** |
| `otherWfe` — DUV, etch, depo, metrology | — | 2.1 | 0.4 | 2 | derived to hit $3.5B WFE |
| `fabshell` — cleanroom + shell | — | 2.5 | 0.5 | 2 | derived to hit $6B total |
| **Total** | | **6.0** | | | `dylan-2026-08` |

WFE subtotal (`euv` + `otherWfe`) = $3.5B, inside the stated $3–4B.

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

**`regDrag`** carries the New York bans, Texas moratoriums, withheld Astra and Mythos 2. It
suppresses `revPerMw` → lowers `labWtp` → lowers clearing price → starves supply. One coefficient
propagating the full causal path Dylan describes for how the 100 GW target fails.

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

- **Pipeline** → computed rail ladder; `'55K'` / `'170K'` become live quantities
- **Per-GW economics** → recalibrated, with the ~1.5% amortization result surfaced
- **Capacity ceiling** → absorbed into the state table
- **Bottleneck bar + timeline** → emergent per year
- **Jevons check** → becomes the diffusion ceiling
- **Stock sensitivity matrix** → tab auto-selection driven by *rail margin expansion* rather than
  rail tightness
- **Anthropic vs OpenAI** → driven by the `labGw` split

## Acceptance Criteria

The engine at default settings must reproduce, within 10%:

| Check | Target | Source |
|---|---|---|
| 2026 new GW | 30 | transcript |
| 2027 new GW | 50 | transcript |
| 2028 new GW | 70 | transcript |
| 2029 new GW | 90–100 | transcript |
| 2028 cumulative world GW | ~200 | transcript |
| 2028 total capex | $3.5T | transcript |
| 2026 capex per GW | $35B | derived: $1.05T ÷ 30 |
| 2028 capex per GW | $52B | derived: $3.65T ÷ 70 |
| Cumulative capex 2024–29 | $11T | SemiAnalysis model |
| Cumulative credit 2024–29 | $5T | SemiAnalysis model |
| Lab share of 2028 incremental | 70–80% | transcript |
| Compute price path | 13 → 25 → 40 | transcript |

The last four are *independent* of the GW discussion, so hitting them validates the engine against
numbers it was not fitted to.

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

Four rail constants are estimates pending web research, marked `estimate` in `rails.js` and
visibly flagged in the UI until resolved:

| Rail | Current estimate | Needed |
|---|---|---|
| `optics` | $0.4B per GW/yr | Zeiss optics as share of EUV tool cost. May be permanently unavailable — Zeiss does not disclose it. |
| `hbm` | $5.0B/GW | HBM stack cost, stacks per accelerator, DRAM wafer intensity vs commodity |
| `package` | $1.8B/GW | CoWoS wafer cost, ABF substrate unit cost, packaging share of accelerator BOM |
| `power` | $5.0B/GW, lag 3yr | Turbine $/GW **and quoted lead time**. Lead time matters more than price — if turbines quote at 4–5 years rather than 3, the 2028 power rail binds far harder than the transcript implies. |

If a figure cannot be sourced, the rail keeps its estimate and stays flagged rather than being
dropped. A visible estimate is more useful than a missing rung.
