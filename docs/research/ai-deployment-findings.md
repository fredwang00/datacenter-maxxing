---
id: dcm:research/2026-09-16-ai-deployment-evidence
type: research
status: active
repo: datacenter-modeling
created: 2026-09-16
updated: 2026-10-04
tags: [ai-deployment, open-weights, inference, evidence-tracker]
links:
  - repo: earnings-call-analyzer
    path: docs/specs/2026-10-04-mag7-capex-evidence-design.md
    relation: sibling-evidence-methodology-precedent-for-claims-schema
  - repo: datacenter-modeling
    path: docs/js/demand.js
    relation: evidence-informs-demand-segment-assumptions-without-recalibrating
---

# AI deployment evidence

Reviewed September 16, 2026. [CSV tracker](ai-deployment-evidence.csv): 15 observations across Coinbase, Uber, Pinterest, AT&T, Shopify, Block, and Spotify. Public evidence only. No model inputs were recalibrated.

## Findings

| Company | What the evidence establishes | What it does not establish |
|---|---|---|
| Coinbase | Mixed-model infrastructure; a reproduced executive report of lower spending; experimental cheaper defaults; a separate future mix expectation | Current migrated share or attribution of savings to open weights alone |
| Uber | Same-model efficiency improvements, portfolio growth, and a benchmark-informed production model choice | A company-wide open-weight migration rate |
| Pinterest | Management reports deployment of post-trained open models with a favorable transaction-cost comparison | A historical before/after bill reduction across the company |
| AT&T | Selected-task cost and quality tradeoff reported in an interview | A company-wide spending reduction or a disclosed quality methodology |
| Shopify | Specialized production inference, with an estimated frontier-cost counterfactual | The base model's license or audited savings |
| Block | An internally used, model-agnostic open-source agent | The share of inference served by open weights |
| Spotify | Self-hosted open models included in internal coding infrastructure; separate recommendation research and production work | Open-model traffic share or displaced API spending |

The strongest update to the earlier discussion is Spotify. Its [August 10 Xirp announcement](https://portal.spotify.com/blog/introducing-xirp) explicitly includes self-hosted open models alongside proprietary agents. The previously cited research alone did not establish that internal coding use. Record both pathways separately.

### Measured use, forecasts, and comparisons are different evidence

Coinbase's [interview publisher](https://www.sourcery.vc/p/breaking-brian-armstrong-coinbase) describes management's expectation that 80% of workloads could move to much cheaper models within 12–18 months. CB04 is a forecast, not a current measured mix. CB02–03 rely on a previously retrieved reproduction and user-supplied material: the original X post returned 403 and the mirror timed out during this pass. These remain provisional.

Uber's [engineering post](https://www.uber.com/gb/en/blog/efficient-software-factory/) states that portfolio spending stabilized since **April**, correcting the newsletter's March wording. Its unit-cost reductions use their own peaks, while request growth starts in February. UB01–03 overlap and must not be multiplied together. UB04 records the production choice shown in the supplied chart, which remains a frontier model.

Pinterest's [company-hosted transcript, page 2](https://s204.q4cdn.com/369458543/files/doc_earnings/2026/q2/transcript/Q2-2026-Transcript.pdf#page=2) is a direct management claim about transaction costs and task performance. Cloud control does not establish physical hardware ownership. A comparator is not automatically a previously deployed model.

Shopify's [GraphQL-agent account](https://shopify.engineering/sidekicks-continual-learning-loop) presents approximate annual serving estimates. The ratio is $1M / $27M = 0.0370; implied reduction = 1 − 0.0370 = 0.9630, approximately 96%. This arithmetic does not turn a counterfactual estimate into booked savings. Frontier models also contribute training signals.

### Evidence against treating flexibility as displacement

The [Goose team account](https://goose-docs.ai/blog/2025/04/21/mcp-in-enterprise/) documents employee adoption and model independence. It does not disclose an inference mix. The original block.github.io path failed, so the accessible project documentation URL is retained with its publisher identity.

Spotify's [NEO and GLIDE article](https://research.atspotify.com/2026/8/from-models-to-products-llms-for-recommendation-at-spotify-scale) distinguishes the two projects. NEO explicitly adapts open weights. GLIDE is an additional production candidate generator; it is not described as replacing a frontier API. Neither project supplies a migration-rate denominator.

## Cross-company context

These sources inform the interpretation of the seven-company tracker. They are not additional independent company observations.

- [Databricks: Managing AI Coding Costs at Scale, August 7](https://www.databricks.com/blog/managing-ai-coding-costs-scale). The source behind the newsletter graphic calls its survey estimates directional and informal. It separately reports internal router savings above 30% and harness/caching improvements approaching 50%. Do not attribute these to every interviewed company or add them together. It also describes rejection of a more expensive proprietary-model upgrade at Stripe, demonstrating cost control within a proprietary model family.
- [Ramp: September AI Index, September 9](https://ramp.com/data/ai-index-sept-2026). Its top-spender measure is median monthly AI spending per employee within a small cohort. The report flags revisions, volatility, and possible seasonality. Its routing-platform proxy does not directly measure open-weight model use and includes access to closed models. It provides counterevidence to attributing broad spending changes primarily to open-source migration.

## How to use the tracker

**Unit of evidence:** one workload and dated observation. Related observations can appear in multiple rows when the metrics or status differ. Do not count rows as companies, independent samples, or migrated workloads.

**Unknowns:** `unknown` and `not_disclosed` are intentional, not zero. A month or quarter in `source_date` preserves available precision. `reviewed_on` is the retrieval date, not the event date. `measurement_period` identifies the metric window when disclosed.

**Status and confidence:** status distinguishes experiments, production descriptions, operating results, forecasts, and research. `high_for_reported_claim` means the accessible source directly supports the statement; it does not mean the measurement was independently audited. Provisional reproduced claims and interview claims with unverified methodology are labeled separately.

**Mechanisms:** model substitution, routing, serving efficiency, provider flexibility, and usage growth can coexist. `substitution_or_addition` remains unknown unless a source supplies a baseline or explicitly describes incremental use. An open-source harness is not an open-weight model, and self-hosting is not proof of owned GPUs.

**Metrics:** numeric values retain their source units. Qualifiers such as `less than`, `nearly`, and `more than` stay in the CSV rather than becoming false exact observations. Spend, requests, sessions, tokens, users, and physical compute have distinct denominators. Quality comparisons need their own definitions and task populations.

**Sources:** each row includes a URL, a section locator, source type, access status, and unknowns. The AT&T interview link was located; its scoped cost/quality details are retained from the newsletter quotation supplied in this discussion. A later accessible primary measurement should replace provisional evidence without silently overwriting its historical status.

## Next evidence to seek

1. Before/after deployment shares for the same workload and interval, including cheaper proprietary alternatives.
2. Costs for equivalent successful tasks, with hosting, engineering overhead, caching, and quality treatment specified.
3. Hardware type, utilization, throughput and capacity for the relevant deployments.
4. Continued frontier usage and incremental workloads, including training and evaluation calls.

No row currently establishes an industry-wide migration rate or a defensible conversion from spending changes to GW. Keep the existing simulation defaults illustrative until those gaps are addressed.
