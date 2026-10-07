---
id: dcm:plan/2026-09-15-segmented-demand
type: plan
status: done
repo: datacenter-modeling
created: 2026-09-15
updated: 2026-10-04
tags: [segmented-demand, implementation-plan]
links:
  - repo: datacenter-modeling
    path: docs/superpowers/specs/2026-09-15-segmented-demand-design.md
    relation: implements
---

# Segmented Demand Implementation Plan

> Execute inline in the current clean feature checkout, in the approved order.

**Goal:** Implement improvements 1–3 without changing supply or funding mechanics.
**Architecture:** A pure demand module defines segment requests, capacity routes,
value and budget ledgers. The engine allocates and prices that demand; the existing
render layer displays the ledgers and rental diagnostic.
**Tech Stack:** Plain JavaScript, browser script globals, Node built-in tests.
**Spec:** ../specs/2026-09-15-segmented-demand-design.md

## Global constraints

No new dependencies. Explicit units ($B/year, $M/MW/year, GW). No additional GW
for intermediate rentals. Defaults are illustrative, not refreshed observations.

## 1. Rental interpretation

- [x] Write a literal shortfall test and migrate API consumers to operatingShortfallB.
- [x] Run `node --test test/engine-spacex.test.js` and observe failures.
- [x] Rename fields and remove solvency assertions from comments and preset copy.
- [x] Run the same tests successfully.

## 2. Segments and ownership

- [x] Add tests for four final uses, exclusive routing, capped allocations,
  released inventory, and conservation across owners and final uses.
- [x] Implement `docs/js/demand.js` segment configuration and allocation helpers.
- [x] Integrate segment state, allocation, lab ownership and browser loading.
- [x] Display requested/allocated GW and owner/customer routes.

## 3. Independent economics

- [x] Add literal adoption/provider-revenue/direct-spend budget tests and tests
  for enterprise demand when provider revenue is zero.
- [x] Implement segment economics and aggregate-demand price clearing.
- [x] Replace owner-based inputs and lab-only price caps in engine/presets/UI.
- [x] Display and edit assumptions, value, provider revenue, and compute budgets.
- [x] Update source-comparison wording and remove obsolete numerical claims.
- [x] Run `node --test test/*.test.js`, syntax checks, browser-path verification,
  and review the diff for scope, conservation, and misleading output.

## Verification results

- Baseline: 184 tests passed before edits.
- Final: 167 tests passed. Replaced obsolete forecast pins and lab-only demand
  tests with segment budget, routing, inventory, and price-clearing behavior.
- Node syntax checks and `git diff --check` passed.
- Chrome: no page errors; rejected inputs revert, valid edits update the run,
  presets reset assumptions, and year selection updates segment results.
- Desktop (1440px) screenshot inspected; mobile (390px) screenshot captured
  and no page-level horizontal overflow measured. Tables scroll within panels.
- Independent review findings fixed: invalid displayed input state, cumulative
  regulatory effects, and remaining provider-revenue denominator label.
