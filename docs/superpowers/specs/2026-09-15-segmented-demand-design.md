---
id: dcm:spec/2026-09-15-segmented-demand
type: spec
status: current
repo: datacenter-modeling
created: 2026-09-15
updated: 2026-10-04
tags: [segmented-demand, revenue, allocation]
links:
  - repo: datacenter-modeling
    path: docs/superpowers/specs/2026-09-15-deployment-workloads-design.md
    relation: commercial-enterprise-formulas-superseded-by-this-doc
---

# Segmented demand and revenue interpretation

Implements the approved improvements 1–3 in order. Supply, funding, hardware
vintages, regulation, and orbital scenarios remain outside this change.

## 1. Rental diagnostic

Keep the revenue-payback and revenue-coverage arithmetic. Rename the uncovered
amount to operating shortfall. It measures rent less modeled customer revenue,
not expected loss, inability to pay, profitability, or insolvency. Contract
volume, duration, and alternative-use values are illustrative assumptions.

## 2. Final-use demand and allocation

Use four mutually exclusive final uses: frontier research, commercial inference,
enterprise internal use, and sovereign workloads. Track each segment's capacity,
annual expansion request, growth, and allocation. Asset owner and contractual
customer are routing attributes of that demand; they never create additional GW.
Inventory construction remains separate from final-use demand. Released inventory
can satisfy unmet final-use demand; allocation cannot exceed requests or supply.
Lab-owned capacity remains an ownership statistic, not an extra demand segment.

## 3. Value, provider revenue, and compute budgets

Commercial and enterprise uses partition one addressable economic-value pool.
Each has its own adoption rate and growth, provider revenue share, direct compute
spend share, and provider compute spend share. Annual economic value is
addressable value × segment share × adoption. Provider revenue is a portion of
that value, not additional economic value. Annual compute budget combines direct
compute spending and the portion of provider revenue spent on compute.

Research and sovereign uses instead have explicit annual strategic compute
budgets and growth; neither creates assumed model-provider revenue.
Willingness to pay is budget divided by existing plus desired capacity. Demand
is the expansion request discounted by the existing price-response function.
Market pricing uses the aggregate segment demand curve, not a lab revenue cap.
No adoption, ownership, or budget split is claimed to be calibrated from the
interviews. Defaults are illustrative, and historical targets remain visible
as comparisons rather than acceptance constraints on this new structure.

Provider revenue per commercial MW is a diagnostic: commercial provider revenue
divided by commercial capacity, before operating costs. It does not determine
other segments' willingness to pay or claim customer solvency. Enterprise
provider revenue is shown separately in the economic ledger.

## Verification

Use literal budget/value fixtures, conservation tests, independent enterprise
response to provider monetization, responsive price clearing, browser-global
loading, and rendered tables and controls. Keep tests for unchanged supply and
capital behavior. Replace obsolete calibration-specific tests with invariants
and explicitly labeled source comparisons; do not tune defaults to restore the
old forecast. No new dependencies.

## Accounting examples and limits

At the illustrative defaults, each commercial/enterprise value pool is
$42,000B/year × 0.5 × 0.04 = $840B/year. Before regulatory reductions,
commercial provider revenue is $840B × 0.15 = $126B/year and enterprise provider
revenue is $840B × 0.05 = $42B/year. These are portions of value, not additions.
Commercial compute budget is $840B × 0.45 + $126B × 0.5 = $441B/year;
enterprise compute budget is $840B × 0.45 + $42B × 0.5 = $399B/year.
Research and sovereign budgets are separately assumed at $150B/year each.
Provider compute fractions fund only their own final-use segment; strategic
budgets are not inferred again from that same provider revenue.

The inherited annual regulatory reductions remain cumulative and reduce only
provider revenue and the compute funded from it. Direct spending and economic
value remain independent. Requested expansion is capped by the annual budget
remaining after existing capacity at the opening rental price. Existing capacity
is not retired when a budget is insufficient; that belongs to the later asset
vintage and funding work. Desired expansion and initial stocks are still direct
GW assumptions, not workload/efficiency estimates.

Allocation uses the opening price. The new aggregate clearing price is used the
following year. Inventory release satisfies final-use demand before construction;
only net construction demand reprices new physical rails. Provider revenue per
commercial MW is an average scenario proxy, not a measured customer margin.

Source targets and older dated specs remain historical context. The lab-owned
allocation share is explicitly labeled as a different basis from source lab-use
share. Updated APIs use operatingShortfallB, totalOperatingShortfallB,
yearsWithOperatingShortfall, providerRevenuePerCommercialMw, segmentCapacityGw,
and allocation. Retired single-lab demand/capture controls have been removed.
