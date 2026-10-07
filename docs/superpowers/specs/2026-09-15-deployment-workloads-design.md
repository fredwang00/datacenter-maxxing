---
id: dcm:spec/2026-09-15-deployment-workloads
type: spec
status: current
repo: datacenter-modeling
created: 2026-09-15
updated: 2026-10-04
tags: [deployment-switching, workloads, demand]
links:
  - repo: datacenter-modeling
    path: docs/superpowers/specs/2026-09-15-segmented-demand-design.md
    relation: supersedes-commercial-enterprise-formulas-fixed-routes
  - repo: datacenter-modeling
    path: docs/research/ai-deployment-findings.md
    relation: research-evidence-informs-deployment-mix-assumptions
---

# Deployment switching and workload capacity

Implements approved priorities 4–5 with illustrative defaults. Supersedes the commercial/enterprise formulas and fixed routes in the September 15 segmented-demand design. Research, sovereign budgets, inventory, supply constraints and financing remain as before.

## Inputs and conventions

Commercial and enterprise describe final uses. Both have four deployment choices: frontier API, managed open weights, self-hosted on rented GPUs, self-hosted on owned GPUs. Workloads must deliver comparable task quality; the model does not assume every open model can substitute for every frontier task.

Initial task shares (API / managed / rented / owned): commercial 60/20/15/5%; enterprise 40/20/25/15%. Each year 5%, 10%, or 20% of remaining API tasks migrate (slow/moderate/fast; default moderate). Migrants go 30% managed, 50% rented, 20% owned. These destination weights are fixed scenario conventions. All displayed numeric assumptions are editable; owned initial share is the remainder.

| Mode | Relative compute/task | Utilization | All-in cost index | Infrastructure share of spending |
|---|---:|---:|---:|---:|
| Frontier API | 1 | .65 | 1 | .5 |
| Managed open weights | .7 | .6 | .75 | .6 |
| Rented self-hosting | .7 | .45 | .6 | .8 |
| Owned self-hosting | .7 | .35 | .55 | .8 |

Compute/task falls 15% annually; power/compute falls 10% annually. Initial all-in spending is 55% of adopted commercial economic value and 50% of enterprise value. All are illustrative scenario coefficients, not researched estimates. Cost indices include operations and annualized infrastructure; they evolve with deployment mix, independently of technical efficiency. No claim is made that physical efficiency savings are automatically passed to customers.

## Formulas

Let t=0 be 2026, K0 be initial IT GW, A be annual task increment in baseline-GW equivalents, and g its growth. Opening task index is 100. The selected year includes that year's task increment.

- API share(t) = initial API share × (1 − migration rate)^t.
- Baseline workload equivalent B(t) = K0 + sum[A × (1+g)^k, k=0..t]. This accumulates desired work independently of actual supply, so unmet demand is not silently discarded.
- Intensity I(t) = sum[task share × relative compute/task ÷ utilization]. Reference I0 uses the initial mix and the same configured coefficients.
- Cost index C(t) = weighted current all-in cost / weighted initial all-in cost.
- Rebound R(t) = min(1,C(t))^(−elasticity). Elasticity defaults to zero, is limited to [0,1], and only models extra usage after cost reductions.
- Task index = 100 × B(t)/K0 × R(t).
- Required IT GW = B(t) × R(t) × I(t)/I0 × [(1−compute efficiency gain) × (1−power efficiency gain)]^t.
- Desired new GW = max(0, required GW − installed segment GW).

The normalization anchors each scenario's starting stock; changing initial coefficients or mix also changes the implied task-unit calibration. Cross-scenario absolute task counts cannot be inferred from these indices. No PUE is applied: these are IT-capacity GW, not facility demand or electricity consumption. Utilization determines required installed capacity, not average power draw.

Illustration with 10 GW, no added tasks, initial utilization .6: halve compute/task and move to utilization .4 → 10 × .5 × (.6/.4) = 7.5 GW. Halving costs with elasticity 1 doubles tasks: 7.5 × 2 = 15 GW. With elasticity 0, capacity stays 7.5 GW.

## Dollar flows

Adopted economic value remains addressable pool × final-use share × adoption. Initial spending envelope = economic value × spending share. Mode spending = envelope × rebound × mode task share × mode cost / initial weighted cost. Persistent regulation scales the two provider modes, leaving direct spending unchanged. It remains a generic provider-funding shock, not a model of regulation by deployment type.

API and managed spending are provider receipts. Their infrastructure fractions are downstream provider compute budgets, never added again to customer spending. Direct rented/owned spending splits into infrastructure and other operations. Owned infrastructure is an annual budget, not immediate construction capex. Provider-funded infrastructure is separately reported without inventing a split between rented and owned provider hardware.

Example: economic value 100, spending share .5, equal costs, half API/half rented: customer spending 50; API receipts 25; direct compute 25×.8=20; direct operations 5; provider compute 25×.4=10; total compute budget 30. Customer spending reconciles as 25+20+5=50, not 50+10.

All dollar figures are budget-supported potential spending, not realized revenue from completed tasks. Displayed served/unmet task indices separately reflect supply and aggregate compute affordability.

## Market integration and limits

The existing price response and annual price lag remain. Required operating GW replaces the previous installed-plus-exogenous-expansion denominator. Idle installed capacity is retained, not demolished or automatically sold. Served tasks are limited by installed capacity after allocation and affordable capacity at the opening price. Efficiency can therefore reduce new construction while increasing service capacity.

Capacity and compute budgets are pooled within each final use. Individual deployment budgets do not independently constrain served tasks; capacity is assumed reusable. This does not model hardware compatibility, data locality, lead times for migration, contract lock-in, decommissioning, or execution quality. Owned and rented infrastructure use the common market price as an opportunity-cost proxy for affordability; route-specific realized capex/opex is not simulated. Mode required GW is a demand decomposition, not an installed asset ledger. Ownership/customer rows split allocated additions, including released inventory, without transferring titles to existing assets.

Ownership routing is separate from deployment: API capacity is illustratively 25% lab-owned and 75% rented from hyperscalers (editable). Managed open weights use hyperscaler capacity; rented self-hosting uses neocloud capacity; owned self-hosting uses enterprise capacity. These are routing assumptions, not observed market shares.

The SpaceX diagnostic remains average commercial provider receipts divided by commercial capacity. It is not frontier-provider-only revenue or proof of any actual customer's rent coverage.

## Verification

177 Node tests passed; JavaScript syntax and whitespace checks passed. Headless Chrome verified valid defaults, cost edits, rejected shares restoring their prior values, all three migration presets, year selection, rebound controls, and mobile overflow. Desktop output and mobile controls were visually inspected. Independent review found input-step and provider-receipt wording issues; both were corrected. Changes remain uncommitted.
