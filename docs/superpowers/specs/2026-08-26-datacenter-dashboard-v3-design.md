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
| ├ `logic` — TSMC N3/N5 wafers | servers | 1.2 | 0.25 | 2 | counts `dylan-2026-08`, prices `estimate` |
| ├ `hbm` — HBM / memory | servers | 5.0 | 1.5 | 0.75 | `estimate` — **pending research** |
| ├ `package` — CoWoS / substrate | servers | 1.8 | 1.3 | 1 | `estimate` — **pending research** |
| └ vendor margin + rest of BOM | servers | 13.2 | 1.0 | 0.5 | derived residual |
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
2030; ASML's own plan reaches ~110/yr by **2028**, two years earlier. Running the corrected stock
model on ASML's numbers — roughly 290–300 cumulative tools at end-2025, +65/+85/+110 — gives an EUV
ceiling of about **50 GW/yr in 2026 rising to ~93 GW/yr by 2028** at 60% AI allocation, against 30
and 70 GW of actual demand.

**EUV does not bind at any point in the 2026–2030 window under ASML's disclosed plan.** That is a
stronger conclusion than the one in this spec's opening, and it is sourced to the supplier rather
than inferred. The rail stays in the model — it is the right place for a Zeiss shock to enter — but
the base case should show it slack throughout.

### Anchors that survived

The transcript's fab numbers held up under primary-source checking, and the derivation surfaced:

| Anchor | Verdict |
|---|---|
| 3.5 EUV tool-years per GW/yr | **Supported**, with derivation — ~2M EUV wafer passes per GW from 55K N3 + 6K N5 + 170K DRAM wafers at ~20 passes/wafer, 75 wph, 90% uptime |
| $3–4B WFE per GW/yr | **Supported** |
| $6B fab all-in per GW/yr | **Supported verbatim** |
| $400M per EUV tool | **Contradicted** for 2025; forward-looking only |

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
| 2026 capex per GW | $35B facility / $38B IT-basis | derived vs Epoch AI — **see load-basis guard** |
| 2028 capex per GW | $52B | derived: $3.65T ÷ 70 |
| Facility subtotal (shell+elec+cooling) | $11.3–11.4B | Epoch, JLL, T&T converge |
| Turbine lead time | 5 yr | GE Vernova 2031 reservations |
| EUV ceiling 2026 / 2028 | ~50 / ~93 GW/yr (slack) | ASML disclosed 65/85/110 |
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

### Resolved by research

| Rail | Was | Now | Change |
|---|---|---|---|
| `power` | $5.0B/GW, lag 3yr | $0.5B grid / $2.3–3.0B gas, **lag 5yr** | ~2x too expensive, and the lag was badly wrong |
| `dcElec` + `cooling` + `shell` | $6.0B/GW combined | **$11.4B/GW** | ~2x too cheap — cancelled the `power` error in the total |
| `euv` | $1.4B per GW/yr | **$0.95B** | $400M/tool is High-NA, not realized ASP |
| `optics` | $0.4B per GW/yr | **$0.23B** ($185–285M) | now bounded by ASML's disclosed Zeiss purchases |

The `power`/`dc` pair is worth dwelling on: two ~2x errors in opposite directions that **summed to
the right total**. No amount of top-line calibration would have caught it. Rails have to be sourced
individually.

### Still open

| Rail | Current estimate | Needed |
|---|---|---|
| `hbm` | $5.0B/GW | HBM stack cost, stacks per accelerator, DRAM wafer intensity vs commodity |
| `package` | $1.8B/GW | CoWoS wafer cost, ABF substrate unit cost, packaging share of accelerator BOM |

Research still running. `servers` currently carries a $13.2B residual that these two will partly
resolve; if they come in materially different, the residual absorbs the difference and the
`servers` total stays pinned to Epoch's $21.2B.

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
