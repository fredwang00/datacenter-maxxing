// Editorial market-scenario data for the Stock Sensitivity Matrix panel.
//
// Ported VERBATIM from v2 (origin/main:docs/datacenter-economics.html) --
// this is hand-researched winners/losers/early-warning commentary, not model
// output, and the port must not reword it. See
// .superpowers/sdd/2026-08-26-datacenter-dashboard-v3/v2-market-scenarios.js
// for the pre-extracted source this was copied from.
//
// Wrapped in the same dual-environment (CommonJS + browser-global) shape as
// rails.js/presets.js so render.js can `require()` it under Node while the
// page can still load it as a plain <script src> global.

const MARKET_SCENARIOS = {
  euv: {
    label: 'EUV & Fab Tight',
    winners: ['TSMC (Pricing power, margin expansion)', 'ASML (Backlog locked, cash flow)', 'NVIDIA (Allocation king)'],
    losers: ['Lower-tier ASIC projects', 'Consumer electronics (Apple/Qualcomm margin hit)', 'AMD (If unable to secure N3/N2)'],
    symptoms: ['Foundry price hikes leaked to press', 'Smartphone chip delays', 'Extended lead times on semi-cap equipment'],
  },
  hbm: {
    label: 'HBM / Memory Tight',
    winners: ['SK Hynix (First-mover advantage)', 'Micron (Margin catch-up)', 'Amkor (Advanced packaging)'],
    losers: ['Commodity DDR buyers (Price spikes)', 'Accelerators waiting on HBM pins', 'Datacenter CapEx budgets'],
    symptoms: ['Massive DDR pricing spikes', 'GPU shipments stall despite logic availability', 'Wafer reallocations from consumer to server'],
  },
  power: {
    label: 'Power & DC Tight',
    winners: ['Electrical equipment (VRT, ETN, PWR)', 'Independent Power Producers (CEG, VST)', 'Asset-rich neoclouds (CoreWeave)'],
    losers: ['Hyperscalers without secured sites', 'Model labs stuck waiting for compute', 'Legacy enterprise cloud migrations'],
    symptoms: ['Transformers take 3+ years to deliver', 'Nuclear/gas plant direct-connect deals', 'Stranded GPUs sitting in warehouses'],
  },
  demand: {
    label: 'Monetization Tight (Jevons Failure)',
    winners: ['Enterprise software incumbents (MSFT)', 'Value-add consulting/SI', 'Cheapest inference provider (META)'],
    losers: ['GPU neoclouds (Spot pricing collapse)', 'NVIDIA (CapEx orders slashed)', 'Pure-play foundation model labs'],
    symptoms: ['GPU hourly rental rates plummet', 'Payback periods stretch to 7+ years', 'Hyperscalers push out rack deliveries'],
  },
};

const _marketScenariosApi = { MARKET_SCENARIOS };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _marketScenariosApi;
} else if (typeof self !== 'undefined') {
  Object.assign(self, _marketScenariosApi);
}
