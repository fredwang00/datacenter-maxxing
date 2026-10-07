// Panel renderers. These consume the engine's year-state array and produce
// HTML strings. No arithmetic beyond formatting and presentation ratios.
//
// Two deliberate exceptions, both calls into the engine rather than
// renderer-invented math:
//   - impliedCreditDepthFor (see explainGwMiss) -- the engine's own designated
//     diagnostic for explaining a missed GW target.
//   - hoarderRelease (see ladderRungs) -- reused to read off the engine's real
//     release fraction, added by the final review's I2 fix so the scarcity rung
//     stops being an unsourced render-layer multiplier. It is called with a
//     synthetic { hoardedStock: 1 } to extract the fraction; that is a working
//     but implicit contract, and the cleaner shape would be for the engine to
//     emit the fraction itself.
//
// v2-port panels (matrix, lab comparison, per-GW economics, bottleneck,
// diffusion) add no third exception: every number they use is either read
// straight off the year state the engine already emits, or a plain sum/ratio
// over RAILS' own declared fields (price2026, basis, parent). See each
// section below for what's presentation-only vs. what's editorial (v2's
// hand-maintained commentary, ported verbatim and labelled as such).

(function (root, factory) {
  const rails = (typeof require !== 'undefined') ? require('./rails.js') : root;
  const engine = (typeof require !== 'undefined') ? require('./engine.js') : root;
  const presets = (typeof require !== 'undefined') ? require('./presets.js') : root;
  const marketScenarios = (typeof require !== 'undefined') ? require('./market-scenarios.js') : root;
  const api = factory(rails, engine, presets, marketScenarios);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function (rails, engine, presets, marketScenarios) {

const { RAILS } = rails;
const { impliedCreditDepthFor, hoarderRelease, spacexSummary } = engine;
const { DEFAULT_INPUTS } = presets;
const { MARKET_SCENARIOS } = marketScenarios;

function fmtB(n) {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(1) + 'T';
  return '$' + n.toFixed(1) + 'B';
}
function fmtPct(n) { return Number.isFinite(n) ? (n * 100).toFixed(0) + '%' : '—'; }
// fmtPct rounds to the nearest whole percent, which is too coarse for the
// amortization ratio (~1.57%) -- fmtPct(0.0157) would print "2%" and lose the
// entire finding. Used only where sub-percent precision is load-bearing.
function fmtPctFine(n, decimals) {
  return Number.isFinite(n) ? (n * 100).toFixed(decimals === undefined ? 2 : decimals) + '%' : '—';
}
function fmtGw(n) { return Number.isFinite(n) ? n.toFixed(1) : '—'; }

// Column list is explicit (rather than a bare label array) so a couple of
// headers can carry a tooltip explaining what they mean -- specifically the
// Alloc Price / Price split (fix round 3, Task 11): allocate() runs on the
// PRIOR year's price, not the newly-cleared one, so an auditor recomputing
// labShare from the emitted state needs to know which price feeds which
// number, or they'll reconcile against the wrong one.
const STATE_TABLE_COLUMNS = [
  { label: 'Year' },
  { label: 'New-build demand', title: 'Final-use expansion plus inventory investment, less released inventory.' },
  { label: 'EUV' },
  { label: 'Memory' },
  { label: 'Pkg' },
  { label: 'Power' },
  { label: 'Capital' },
  { label: 'Limiter', title: 'What actually held new build down: "demand" when buyers wanted less than every ceiling allowed, otherwise the lowest ceiling.' },
  { label: 'Alloc Price', title: 'The price this year\'s allocation and lab share actually used -- last year\'s ending price (the initial price in 2026).' },
  { label: 'Price', title: 'This year\'s newly cleared price. Becomes next year\'s Alloc Price.' },
  { label: '$B/GW' },
  { label: 'Credit' },
  { label: 'Rate' },
  { label: 'Lab-owned GW' },
  { label: 'Hoarder Got' },
  { label: 'Commercial share', title: 'Commercial inference capacity / (commercial inference + frontier research capacity).' },
  { label: 'Provider $/commercial MW', title: 'Commercial provider revenue pool per commercial MW, after the illustrative regulatory channel. Not marginal customer revenue or willingness to pay.' },
];

function stateTableHtml(run) {
  const head = STATE_TABLE_COLUMNS.map(c => `<th${c.title ? ` title="${c.title}"` : ''}>${c.label}</th>`).join('');
  const rows = run.map(y => {
    const ceilings = y.ceilings || {};
    const labRevCell = (() => {
      if (!Number.isFinite(y.providerRevenuePerCommercialMw)) return '—';
      const rev = '$' + y.providerRevenuePerCommercialMw.toFixed(0) + 'M';
      const ceilingTxt = Number.isFinite(y.providerRevenuePoolPerMw) ? '$' + y.providerRevenuePoolPerMw.toFixed(0) + 'M' : '—';
      return `${rev} <span class="ceiling-note" title="provider revenue pool before regulatory adjustment">/ pool ${ceilingTxt}</span>`;
    })();
    const cells = [
      y.year, fmtGw(y.demand), fmtGw(ceilings.euv), fmtGw(ceilings.memory),
      fmtGw(ceilings.package), fmtGw(ceilings.power), fmtGw(ceilings.capital),
      y.limiter ? `<span class="limiter limiter-${y.limiter}">${y.limiter}</span>` : '—',
      Number.isFinite(y.clearingPrice) ? '$' + y.clearingPrice.toFixed(0) + 'M' : '—',
      Number.isFinite(y.computePrice) ? '$' + y.computePrice.toFixed(0) + 'M' : '—',
      Number.isFinite(y.capexPerGw) ? y.capexPerGw.toFixed(1) : '—',
      fmtB(y.credit),
      Number.isFinite(y.rate) ? (y.rate * 100).toFixed(1) + '%' : '—',
      fmtGw(y.labGw), fmtGw(y.hoarderGot), fmtPct(y.commercialCapacityShare), labRevCell,
    ];
    const mark = y.clamped ? ' <span class="warn" title="price hit the configured rental floor; supply may remain unused">clamped</span>' : '';
    const rowClass = [y.clamped ? 'row-clamped' : '']
      .filter(Boolean).join(' ');
    return `<tr class="${rowClass}">` +
           cells.map((c, i) => `<td>${c}${i === 0 ? mark : ''}</td>`).join('') + '</tr>';
  }).join('');
  return `<table class="state-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function targetActual(run, target) {
  const y = run.find(r => r.year === target.year);
  if (!y) return NaN;
  switch (target.id) {
    case 'gw2026': case 'gw2027': case 'gw2028': case 'gw2029': return y.newGw;
    case 'cumGw2028': return y.cumulativeGw;
    case 'capex2028': return y.capex;
    case 'capexPerGw2026': case 'capexPerGw2028': return y.capexPerGw;
    case 'price2028': return y.computePrice;
    case 'cumCapex2029': return y.cumulativeCapex;
    case 'cumCredit2029': return y.cumulativeCredit;
    case 'labShare2028': return y.labShareOfNew;
    default: return NaN;
  }
}

// Only these targets are denominated in a single year's newGw -- the only
// shape impliedCreditDepthFor solves for. Matches targetActual's cases above.
const NEW_GW_TARGET_IDS = new Set(['gw2026', 'gw2027', 'gw2028', 'gw2029']);

// The calibration panel's most important row: WHY a GW target misses, not just
// that it does. impliedCreditDepthFor is the engine's own designated diagnostic
// for this (see its header comment in engine.js): it reports either the credit
// depth that would clear the target, or -- when something caps the outcome
// regardless of credit -- what and how far.
//
// Explain the active model's limiting factor, not a historical forecast.
function limiterPhrase(limitingRail) {
  return limitingRail === 'demand'
    ? 'demand-limited: segment budgets and adoption limit expansion at the opening price'
    : `${limitingRail}-bound`;
}

function explainGwMiss(target, inputs, seed) {
  try {
    const result = impliedCreditDepthFor(target.target, target.year, inputs, seed);
    if (result.reachable) {
      return `reachable at ${fmtB(result.creditMarketDepth)}/yr credit depth (then ${limiterPhrase(result.limitingRail)})`;
    }
    return `unreachable — ${limiterPhrase(result.limitingRail)} at ${fmtGw(result.maxGw)} GW regardless of credit depth`;
  } catch (e) {
    return null;
  }
}

// `seed` must be the SAME seed the displayed `run` was simulated with. I8 fix
// (final review): explainGwMiss called impliedCreditDepthFor with no seed at
// all, so it silently fell back to makeRng(1) while the page renders seed
// 12345 -- the panel printed a "Model" column from one draw beside an
// explanation computed from a different one.
function calibrationRows(run, targets, inputs = DEFAULT_INPUTS, seed) {
  return targets.map(t => {
    const actual = targetActual(run, t);
    const deviation = Number.isFinite(actual) && t.target !== 0
      ? (actual - t.target) / t.target : NaN;
    const pass = Number.isFinite(deviation) && Math.abs(deviation) <= t.tolerance;
    const explanation = (!pass && NEW_GW_TARGET_IDS.has(t.id)) ? explainGwMiss(t, inputs, seed) : null;
    return { ...t, actual, deviation, pass, explanation };
  });
}

// Counts come from the displayed rows and stay correct as inputs change.
function calibrationSummary(rows) {
  const total = rows.length;
  const passing = rows.filter(r => r.pass).length;
  const validators = rows.filter(r => r.outOfSample);
  const validatorsPassing = validators.filter(r => r.pass).length;
  return { total, passing, failing: total - passing, validatorsTotal: validators.length, validatorsPassing };
}

function calibrationHtml(run, targets, inputs = DEFAULT_INPUTS, seed) {
  const rows = calibrationRows(run, targets, inputs, seed);
  const s = calibrationSummary(rows);
  const validatorNote = s.validatorsTotal > 0
    ? ` Of the ${s.validatorsTotal} historical comparison targets marked *, ${s.validatorsPassing} of ${s.validatorsTotal} pass. These comparisons do not validate the new segment assumptions.`
    : '';
  const summary = `<p class="cal-summary">${s.passing} of ${s.total} calibration targets pass at these inputs (${s.failing} miss).${validatorNote}</p>`;
  const rowsHtml = rows.map(r => `
    <tr class="${r.pass ? 'cal-pass' : 'cal-fail'}">
      <td>${r.label}${r.outOfSample ? ' <span class="cal-oos" title="historical comparison target; segment assumptions are not recalibrated">*</span>' : ''}</td>
      <td class="cal-source">${r.source}</td>
      <td class="cal-basis" title="units basis">${r.basis}</td>
      <td>${Number.isFinite(r.target) ? r.target : '—'}</td>
      <td>${Number.isFinite(r.actual) ? r.actual.toFixed(1) : '—'}</td>
      <td>${Number.isFinite(r.deviation) ? (r.deviation * 100).toFixed(1) + '%' : '—'}</td>
      <td class="cal-explain">${r.explanation ? r.explanation : '—'}</td>
    </tr>`).join('');
  return summary + `<table class="calibration-table"><thead><tr>
    <th>Target</th><th>Source</th><th>Basis</th><th>Stated</th><th>Model</th><th>Δ</th><th>Explain</th>
  </tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

// These rates have different economic denominators and need not ascend.
// Provider revenue is not an upper bound on market rent. The scarcity estimate
// uses the inherited inventory-release fraction and only a positive spread.
// The marginal end-user example is historical editorial context, not an input.
const JANE_STREET_MARGINAL_RATE_MW = 350; // midpoint of the sourced $200-500M/MW band

function ladderRungs(y) {
  const ownCost = (y.capexPerGw / 5) + 1.5;   // 5yr amortization + power and opex
  const releaseFraction = hoarderRelease({ hoardedStock: 1 }, y.computePrice);
  const scarcity = y.computePrice + Math.max(0, y.providerRevenuePerCommercialMw - y.computePrice) * releaseFraction;
  return [
    { id: 'cost',     label: 'Cost to own + operate', value: ownCost,          scales: true,  warn: '' },
    { id: 'rental',   label: 'Commodity rental',      value: y.computePrice,   scales: true,  warn: '' },
    { id: 'scarcity', label: 'Scarcity / hoarder',    value: scarcity,         scales: true,  warn: '' },
    { id: 'lab',      label: 'Provider revenue / commercial MW',           value: y.providerRevenuePerCommercialMw,    scales: true,  warn: '' },
    { id: 'enduser',  label: 'End-user capture',      value: JANE_STREET_MARGINAL_RATE_MW, scales: false,
      warn: 'Marginal rate on the best user in the world (Jane Street, sourced $200-500M/MW). Does not scale to a gigawatt.' },
  ];
}

function fmtRungValue(v) {
  return Number.isFinite(v) ? '$' + v.toFixed(0) + 'M/MW' : '—';
}

function ladderHtml(y) {
  const rungs = ladderRungs(y);
  const finiteMax = Math.max(...rungs.map(r => r.value).filter(Number.isFinite));
  const max = Number.isFinite(finiteMax) && finiteMax > 0 ? finiteMax : 1;
  return '<div class="ladder">' + rungs.map(r => {
    const width = Number.isFinite(r.value) ? Math.max(0, (r.value / max) * 100) : 0;
    return `
    <div class="ladder-rung ${r.scales ? '' : 'rung-nonscaling'}" ${r.warn ? `title="${r.warn}"` : ''}>
      <span class="rung-label">${r.label}</span>
      <div class="rung-track"><div class="rung-fill" style="width:${width}%"></div></div>
      <span class="rung-value">${fmtRungValue(r.value)}</span>
      ${r.warn ? `<span class="rung-warn">⚠ does not scale</span>` : ''}
    </div>`;
  }).join('') + '</div>';
}

function marginMigrationHtml(run) {
  const tracked = RAILS.filter(r => r.parent === null || r.parent === 'servers');
  return '<div class="margin-grid">' + tracked.map(rail => {
    const series = run.map(y => y.railPrice[rail.id] / run[0].railPrice[rail.id]);
    const max = Math.max(...series, 1.01);
    const bars = series.map((v, i) =>
      `<div class="spark-bar" style="height:${(v / max) * 100}%" title="${run[i].year}: ${v.toFixed(2)}x"></div>`).join('');
    return `<div class="margin-cell">
      <div class="margin-name" title="${rail.provenance}">${rail.label}</div>
      <div class="sparkline">${bars}</div>
      <div class="margin-delta">${series[series.length - 1].toFixed(2)}x</div>
    </div>`;
  }).join('') + '</div>';
}

// ---------------------------------------------------------------------------
// Panel: Stock Sensitivity Matrix
//
// MARKET_SCENARIOS (market-scenarios.js) is v2's editorial winners/losers/
// symptoms commentary, ported verbatim -- that content is the point of this
// panel and must not be reworded here.
//
// Auto-selection maps v3's `limiter` to a matrix tab. v2 had no 'package' or
// 'capital' tab (those are v3 distinctions), so both fall back to the
// documented adjacent tab: 'package' to 'hbm' (packaging is the adjacent
// supply-chain layer) and 'capital' to 'demand' (v2's 'demand' tab is
// literally "Monetization Tight (Jevons Failure)" -- capital binding in v3
// means labs are pulling back on monetization grounds, not a physical
// shortage). This is a plain lookup table, not a renderer invention: it is
// the mapping the spec hands down verbatim.
// ---------------------------------------------------------------------------
const LIMITER_TO_MATRIX_TAB = {
  euv: 'euv',
  memory: 'hbm',
  package: 'hbm',
  power: 'power',
  capital: 'demand',
  demand: 'demand',
};

function matrixTabForLimiter(limiter) {
  return LIMITER_TO_MATRIX_TAB[limiter] || 'demand';
}

// Which rail expanded margin most across the run -- railPrice at the LAST
// simulated year divided by the rail's own sourced `price2026` baseline (not
// the run's own first year; RAILS' price2026 is the fixed starting point
// every rail is defined against). This is the actual investment signal the
// spec asks the matrix to surface alongside the tightness-driven auto-select:
// a rail can be tight without its price ever moving, and a rail that quietly
// re-rated 4x is the one an investor actually cares about.
//
// Uses the same "tracked" rail universe as marginMigrationHtml (top-level
// rails plus servers' direct children) so the two panels never disagree about
// what counts as a trackable rail.
function railMarginExpansions(run) {
  const tracked = RAILS.filter(r => r.parent === null || r.parent === 'servers');
  const last = run[run.length - 1];
  return tracked
    .map(r => ({ id: r.id, label: r.label, ratio: last.railPrice[r.id] / r.price2026 }))
    .sort((a, b) => b.ratio - a.ratio);
}

// Renders tabs (marked up with data-tab for the HTML wiring's addEventListener
// delegation -- see the file header) plus the content pane for `activeTab`.
// `activeTab` is an explicit parameter, not computed here: the caller decides
// whether that came from auto-selection (matrixTabForLimiter) or a manual
// click override, keeping this a pure string producer.
function matrixHtml(run, scenarios, activeTab) {
  const keys = Object.keys(scenarios);
  const resolvedTab = scenarios[activeTab] ? activeTab : keys[0];
  const tabs = keys.map(key => {
    const cls = 'matrix-tab' + (key === resolvedTab ? ' active' : '');
    return `<button type="button" class="${cls}" data-tab="${key}">${scenarios[key].label}</button>`;
  }).join('');

  const data = scenarios[resolvedTab];
  const list = items => items.map(i => `<li>${i}</li>`).join('');
  const content = `<div class="matrix-card winners"><h4>Long / Winners</h4><ul class="matrix-list">${list(data.winners)}</ul></div>`
    + `<div class="matrix-card losers"><h4>Short / Losers</h4><ul class="matrix-list">${list(data.losers)}</ul></div>`
    + `<div class="matrix-card symptoms"><h4>Early Warning Symptoms</h4><ul class="matrix-list">${list(data.symptoms)}</ul></div>`;

  const expansions = railMarginExpansions(run);
  const top = expansions[0];
  const note = top
    ? `<p class="matrix-expansion-note">Largest rail margin expansion across the run: <strong>${top.label}</strong> `
      + `at ${top.ratio.toFixed(2)}x (price2026 &rarr; final simulated year). That expansion -- not raw tightness -- `
      + `is the actual investment signal.</p>`
    : '';

  return `<div class="matrix-tabs">${tabs}</div>${note}<div class="matrix-grid">${content}</div>`;
}

// ---------------------------------------------------------------------------
// Panel: Anthropic vs OpenAI
//
// An illustrative two-company split of aggregate lab-owned capacity. Actual
// ownership includes other labs. Historical ARR and strategy text is editorial
// material from the earlier dashboard, not refreshed or used in this engine.
const ANTHROPIC_SHARE = 0.45; // editorial: renormalized from v2's 0.25/0.30 GW-share ratio
const OPENAI_SHARE = 0.55;    // editorial: renormalized from v2's 0.25/0.30 GW-share ratio

const LAB_COMPANY_DATA = {
  anthropic: {
    name: 'Anthropic', dotClass: 'anthropic-dot', barClass: 'bar-anthropic',
    arr: 19, raised: 30,
    strategy: 'Conservative → scrambling. Paying spot premiums, revenue-sharing through Bedrock/Vertex. Best model but compute-constrained.',
    trajectory: 'ARR trajectory: $1B (Dec \'24) → $9B (Dec \'25) → $14B (Feb \'26) → $19B (Mar \'26). ~10x annual growth.',
  },
  openai: {
    name: 'OpenAI', dotClass: 'openai-dot', barClass: 'bar-openai',
    arr: 25, raised: 110,
    strategy: 'Aggressive from day one. Locked 5-year deals with CoreWeave, Oracle, SoftBank. Better margins on compute.',
    trajectory: 'ARR trajectory: $2B (end \'23) → $6B (\'24) → $20B+ (Dec \'25) → $25B (Feb \'26). ~3x annual growth.',
  },
};

// Splits every simulated year's combined labGw by the editorial shares above.
// By construction anthropicGw + openaiGw === labGw for every year (the shares
// sum to 1) -- that identity is the thing a wrong split (e.g. re-normalizing
// against something other than labGw, or swapping which company gets which
// share) would break.
function labSplit(run) {
  return run.map(y => ({
    year: y.year,
    labGw: y.labGw,
    anthropicGw: y.labGw * ANTHROPIC_SHARE,
    openaiGw: y.labGw * OPENAI_SHARE,
  }));
}

function labComparisonHtml(run) {
  const split = labSplit(run);
  const maxGw = Math.max(...split.map(s => Math.max(s.anthropicGw, s.openaiGw)), 1);
  const maxArr = Math.max(LAB_COMPANY_DATA.anthropic.arr, LAB_COMPANY_DATA.openai.arr, 30);
  const maxRaised = 120; // fixed normalization ceiling, ported from v2

  function companyCard(id, gwField, share) {
    const d = LAB_COMPANY_DATA[id];
    const gwBars = split.map(s => {
      const gw = s[gwField];
      const pct = Math.max(0, Math.min(100, (gw / maxGw) * 100));
      return `<div class="bar-row"><span class="bar-label">${s.year} GW</span>`
        + `<div class="bar-track"><div class="bar-fill ${d.barClass}" style="width:${pct.toFixed(1)}%">${gw.toFixed(1)} GW</div></div></div>`;
    }).join('');
    const arrPct = (d.arr / maxArr) * 100;
    const raisedPct = (d.raised / maxRaised) * 100;
    return `<div class="company-card">
      <div class="company-name"><span class="company-dot ${d.dotClass}"></span>${d.name}</div>
      <p class="lab-share-note">Editorial share of modeled lab-owned capacity: ${fmtPct(share)} -- not a model output.</p>
      <div class="bar-chart">
        ${gwBars}
        <div class="bar-row"><span class="bar-label">ARR</span><div class="bar-track"><div class="bar-fill ${d.barClass}" style="width:${arrPct}%">$${d.arr}B ARR</div></div></div>
        <div class="bar-row"><span class="bar-label">Last raise</span><div class="bar-track"><div class="bar-fill ${d.barClass}" style="width:${raisedPct}%">$${d.raised}B</div></div></div>
      </div>
      <div class="company-strategy"><strong>Strategy:</strong> ${d.strategy}</div>
      <div class="company-trajectory">${d.trajectory}</div>
    </div>`;
  }

  return '<p class="pergw-note">Illustrative allocation of aggregate lab-owned capacity to two companies; actual ownership includes other labs. ARR and strategy text are historical editorial context, not refreshed inputs.</p><div class="comparison">'
    + companyCard('anthropic', 'anthropicGw', ANTHROPIC_SHARE)
    + companyCard('openai', 'openaiGw', OPENAI_SHARE)
    + '</div>';
}

// ---------------------------------------------------------------------------
// Panel: Per-Gigawatt Economics -- the amortization result
//
// v2's version used v1's broken formulas (labRevPerGw = revenueGw / (1 -
// margin), and a "leverage ratio" dividing a one-time deployment cost by an
// annuity-basis capacity cost). Neither is ported. This is rebuilt from v3's
// own fields: capexPerGw, computePrice, clearingPrice, providerRevenuePerCommercialMw.
//
// The headline number: fab build-out (EUV tools + other wafer equipment +
// cleanroom shell -- the annuity-basis rails, $B per GW/yr of tool capacity)
// costs roughly $6B. Amortized over ~10 years of 1 GW/yr output, that is
// ~$0.6B per GW of chips actually produced (a perGw-EQUIVALENT figure) --
// against capexPerGw's ~$38B/GW of all-in deployed cost (the real perGw
// basis). The ratio between the two is the fab bottleneck's share of the
// AI economy's cost structure: ~1.6% at DEFAULT_INPUTS/2026.
//
// UNITS GUARD: annuity and perGw bases are never summed here, only ratioed --
// see rails.js's own units-guard comment. Both bases are labelled explicitly
// in perGwEconomicsHtml below so a reader cannot mistake this ratio for a sum.
// ---------------------------------------------------------------------------

// Top-level (parent === null) annuity rails only -- deliberately excludes
// 'optics' (Zeiss mirrors), whose parent is 'euv': it is already inside the
// EUV tool line, not a separate fab-capex component, mirroring the
// parent === null convention rails.js's topLevelPerGwIds() uses on the perGw
// side.
const FAB_ANNUITY_RAILS = RAILS.filter(r => r.basis === 'annuity' && r.parent === null);

// ~10 years of 1 GW/yr output before a fab is replaced/upgraded -- the
// amortization horizon the spec's finding is stated against.
const FAB_AMORTIZATION_YEARS = 10;

// Computed from RAILS' own sourced price2026 fields, not a hardcoded literal:
// if a rail's price2026 changes in rails.js, this figure moves with it.
function fabCapexPerGwYr() {
  return FAB_ANNUITY_RAILS.reduce((sum, r) => sum + r.price2026, 0);
}

function perGwEconomics(y) {
  const fabCapex = fabCapexPerGwYr();                              // $B per GW/yr of fab capacity (annuity basis)
  const amortizedFabPerGw = fabCapex / FAB_AMORTIZATION_YEARS;      // $B per GW of chips produced (perGw-equivalent)
  const allInPerGw = y.capexPerGw;                                  // $B per GW deployed (perGw basis)
  const ratio = allInPerGw > 0 ? amortizedFabPerGw / allInPerGw : NaN; // ratio between two bases -- never a sum
  return {
    fabCapex, amortizedFabPerGw, allInPerGw, ratio,
    computePrice: y.computePrice, clearingPrice: y.clearingPrice, providerRevenuePerCommercialMw: y.providerRevenuePerCommercialMw,
  };
}

function perGwEconomicsHtml(y) {
  const info = perGwEconomics(y);
  const row = (label, val, cls) => `<div class="metric-row"><span class="metric-label">${label}</span><span class="metric-value ${cls || 'neutral'}">${val}</span></div>`;

  return '<div class="pergw-economics">'
    + row('Fab build capex (annuity basis: $B per GW/yr of tool capacity)', fmtB(info.fabCapex), 'blue')
    + row(`Amortized over ${FAB_AMORTIZATION_YEARS} yrs of output (perGw-equivalent: $B per GW of chips produced)`, fmtB(info.amortizedFabPerGw), 'blue')
    + row('All-in deployed capex (perGw basis: $B per GW)', fmtB(info.allInPerGw), 'neutral')
    + row('Ratio: amortized fab capex / all-in deployed capex', fmtPctFine(info.ratio), 'highlight')
    + `<p class="pergw-note">Two different bases, ratioed -- never summed: annuity ($B per GW/YEAR of fab capacity) `
    + `against perGw ($B per GW deployed once). The entire physical fab bottleneck of the AI economy is roughly `
    + `${fmtPctFine(info.ratio)} of its all-in cost structure.</p>`
    + row('Clearing price (prior-year basis, what this year\'s allocation used)', Number.isFinite(info.clearingPrice) ? '$' + info.clearingPrice.toFixed(0) + 'M/MW' : '—')
    + row('Compute price (newly cleared this year)', Number.isFinite(info.computePrice) ? '$' + info.computePrice.toFixed(0) + 'M/MW' : '—')
    + row('Provider revenue per commercial MW', Number.isFinite(info.providerRevenuePerCommercialMw) ? '$' + info.providerRevenuePerCommercialMw.toFixed(0) + 'M/MW' : '—', 'positive')
    + '</div>';
}

// ---------------------------------------------------------------------------
// Panel: Bottleneck Severity
//
// v2 sized segments by per-rail tightness PLUS two editorial 0-100 sliders
// (laborSeverity, permitSeverity). Neither slider is ported: v3 models
// regulation properly via regStopProbability as discrete jurisdiction-level
// stops (see engine.js's regStopFactor), not an editorial severity dial.
//
// Segments cover the four rails with their own ceiling in computeCeilings --
// euv, memory, package, power. `capital` is deliberately excluded: it is a
// FINANCIAL ceiling, not a physical one (engine.js's physicalCeiling()
// excludes it from the physical-tightness signal for the same reason), and
// this is a bar about physical bottlenecks.
// ---------------------------------------------------------------------------
const BOTTLENECK_RAILS = [
  { id: 'euv', label: 'EUV' },
  { id: 'memory', label: 'HBM' },
  { id: 'package', label: 'PACKAGE' },
  { id: 'power', label: 'POWER' },
];

// Segments proportional to each rail's tightness (railTightness, from
// stepRails), for the currently-selected year's state `y`. `loose: true`
// (rendered dimmed) when a rail's tightness sits below 1 -- i.e. demand did
// not even reach that rail's ceiling that year.
function bottleneckSegments(y) {
  const tightness = y.railTightness || {};
  const values = BOTTLENECK_RAILS.map(r => tightness[r.id] || 0);
  const total = values.reduce((a, b) => a + b, 0);
  return BOTTLENECK_RAILS.map((r, i) => {
    const t = values[i];
    const pct = total > 0 ? (t / total) * 100 : 0;
    return { id: r.id, label: r.label, tightness: t, pct, loose: t < 1 };
  });
}

function bottleneckHtml(y) {
  const segments = bottleneckSegments(y);
  return '<div class="bottleneck-bar">' + segments.map(s =>
    `<div class="bottleneck-segment seg-${s.id}${s.loose ? ' loose' : ''}" style="flex:${s.pct.toFixed(2)}" `
    + `title="${s.label}: tightness ${s.tightness.toFixed(2)}">${s.label} ${s.pct.toFixed(0)}%</div>`
  ).join('') + '</div>';
}

// ---------------------------------------------------------------------------
// Panel: Commercial provider revenue per commercial MW (diagnostic only).
function providerRevenueRows(run) {
  return run.map(y => ({ year: y.year, providerRevenuePerCommercialMw: y.providerRevenuePerCommercialMw,
    providerRevenuePoolPerMw: y.providerRevenuePoolPerMw,
    regulatoryReductionMw: y.providerRevenuePoolPerMw - y.providerRevenuePerCommercialMw,
    commercialCapacityShare: y.commercialCapacityShare }));
}

function providerRevenueHtml(run) {
  const body = providerRevenueRows(run).map(r => `<tr data-year="${r.year}"><td>${r.year}</td>`
    + `<td>$${fmtGw(r.providerRevenuePerCommercialMw)}M</td><td>$${fmtGw(r.providerRevenuePoolPerMw)}M</td>`
    + `<td>$${fmtGw(r.regulatoryReductionMw)}M</td><td>${fmtPct(r.commercialCapacityShare)}</td></tr>`).join('');
  return `<p class="diffusion-note">Commercial model-provider revenue is one portion of adopted economic value. `
    + `Revenue per commercial MW is a diagnostic, not a market-wide price ceiling or marginal customer revenue. `
    + `Enterprise, research, and sovereign uses have separate compute budgets. Revenue does not establish profit.</p>`
    + `<table class="diffusion-table"><thead><tr><th>Year</th><th>Provider $/commercial MW</th>`
    + `<th>Before regulatory adjustment</th><th>Regulatory reduction</th><th>Commercial capacity share</th>`
    + `</tr></thead><tbody>${body}</tbody></table>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function segmentDemandHtml(y) {
  const body = y.demandBreakdown.segments.map(s => `<tr data-segment="${s.id}">`
    + `<td>${escapeHtml(s.label)}</td><td>${fmtGw(s.desiredGw)}</td><td>${fmtGw(s.requestedGw)}</td>`
    + `<td>${fmtGw(y.allocation.bySegment[s.id])}</td><td>${fmtB(s.economicValueB)}</td>`
    + `<td>${fmtB(s.providerRevenueB)}</td><td>${fmtB(s.computeBudgetB)}</td>`
    + `<td>$${fmtGw(s.willingnessToPay)}M</td></tr>`).join('');
  const routes = y.allocation.routes.map(r => `<tr><td>${escapeHtml(r.segment)}</td>`
    + `<td>${escapeHtml(r.assetOwner)}</td><td>${escapeHtml(r.customer)}</td><td>${fmtGw(r.gw)}</td></tr>`).join('');
  return `<p class="pergw-note">${y.year}: final-use expansion is counted once. Owner and customer rows below describe the same allocated GW. `
    + `Economic value, provider revenue, and compute budget are overlapping flows; do not add them. Budgets are $B/year; bids are $M/MW/year. `
    + `Requested demand and allocation use the opening price; the newly cleared price applies next year.</p>`
    + `<table class="state-table"><thead><tr><th>Final use</th><th>Desired GW</th><th>Requested GW</th><th>Allocated GW</th>`
    + `<th>Economic value</th><th>Provider revenue</th><th>Compute budget</th><th>Mean bid</th></tr></thead><tbody>${body}</tbody></table>`
    + `<p class="pergw-note">Inventory construction: ${fmtGw(y.hoarderGot)} GW. Released to final uses: ${fmtGw(y.releasedGw)} GW. `
    + `Unallocated inventory: ${fmtGw(y.hoardedStock)} GW. Strategic research and sovereign budgets are not additional modeled commercial revenue.</p>`
    + deploymentHtml(y)
    + `<details><summary>Ownership and contractual customers (same capacity)</summary><table class="state-table">`
    + `<thead><tr><th>Final use</th><th>Asset owner</th><th>Contract customer</th><th>Allocated GW</th></tr></thead><tbody>${routes}</tbody></table></details>`;
}

function deploymentHtml(y) {
  return y.demandBreakdown.segments.filter(s => s.deployment).map(s => {
    const d = s.deployment;
    const rows = d.modes.map(m => `<tr><td>${escapeHtml(m.label)}</td><td>${fmtPct(m.share)}</td>`
      + `<td>${fmtGw(m.requiredGw)}</td><td>${fmtB(m.spendingB)}</td><td>${fmtB(m.computeBudgetB)}</td></tr>`).join('');
    return `<details open><summary>${escapeHtml(s.label)}: deployment and workload</summary>`
      + `<p class="pergw-note">Task index (opening 2026 = 100): desired ${fmtGw(d.taskIndex)}, served ${fmtGw(s.servedTaskIndex)}, unmet ${fmtGw(s.unmetTaskIndex)}. `
      + `Required IT capacity: ${fmtGw(d.requiredGw)} GW; idle installed capacity: ${fmtGw(s.idleGw)} GW. Cost index: ${d.costIndex.toFixed(2)}; usage multiplier from lower costs: ${d.rebound.toFixed(2)}.</p>`
      + `<table class="state-table"><thead><tr><th>Deployment</th><th>Task share</th><th>Required GW</th><th>Customer spending / year</th><th>Compute budget / year</th></tr></thead><tbody>${rows}</tbody></table>`
      + `<p class="pergw-note">Frontier API receipts: ${fmtB(s.frontierRevenueB)}; managed open-model receipts: ${fmtB(s.managedRevenueB)}; direct GPU rentals: ${fmtB(s.gpuRentalB)}; owned infrastructure annual budget: ${fmtB(s.ownedInfrastructureB)}; direct operations: ${fmtB(s.directOperationsB)}. `
      + `Provider-funded infrastructure (${fmtB(s.providerComputeBudgetB)}) is included in provider receipts (frontier API and managed open weights), not additional customer spending. These are budget-supported spending scenarios, not realized sales. `
      + `Migration redistributes tasks within this final use. Capacity and compute budgets are pooled within each final use; existing hardware is assumed reusable. Ownership rows describe additions, not transfers of existing assets.</p></details>`;
  }).join('');
}

const SEGMENT_FIELDS = [
  ['annualDemandGw', 'Annual task increment (baseline GW equivalent)', 0, 1000, 1],
  ['demandGrowth', 'Annual increment growth', 0, 3, 0.05],
  ['valueShare', 'Economic-pool share', 0, 1, 0.05],
  ['adoptionRate', 'Adoption fraction', 0, 1, 0.01],
  ['adoptionGrowth', 'Adoption growth/year', 0, 3, 0.05],
  ['spendingShare', 'Initial all-in spending / economic value', 0, 1, 0.05],
  ['apiShare', 'Initial frontier API task share', 0, 1, 0.05],
  ['managedShare', 'Initial managed open-weight share', 0, 1, 0.05],
  ['rentedShare', 'Initial rented self-hosting share', 0, 1, 0.05],
  ['apiOwnedShare', 'Frontier API capacity owned by labs (remainder rented)', 0, 1, 0.05],
  ['migrationRate', 'Fraction of remaining API tasks migrating / year', 0, 1, 0.05],
  ['efficiencyGain', 'Annual reduction in compute / task', 0, 0.99, 0.05],
  ['hardwareEfficiencyGain', 'Annual reduction in power / compute', 0, 0.99, 0.05],
  ['reboundElasticity', 'Lower-cost usage response (0 = none)', 0, 1, 0.1],
  ...['api', 'managed', 'rented', 'owned'].flatMap(id => [
    [id + 'Intensity', id + ': relative compute / task', 0.01, 10, 0.01],
    [id + 'Utilization', id + ': utilization', 0.01, 1, 0.01],
    [id + 'Cost', id + ': all-in cost / task index', 0.01, 10, 0.01],
    [id + 'ComputeFraction', id + ': spending on infrastructure', 0, 1, 0.05],
  ]),
  ['budgetB', 'Strategic compute budget ($B/year)', 0, 10000, 10],
  ['budgetGrowth', 'Strategic budget growth/year', 0, 3, 0.05],
];

function segmentAssumptionsHtml(segments) {
  const fieldHtml = (s, [key, label, min, max, step]) => {
    if (s.apiShare === undefined && key === 'annualDemandGw') label = 'Desired new GW/year';
    if (s.apiShare === undefined && key === 'demandGrowth') label = 'Expansion growth/year';
    return `<label class="segment-field">${label}<input type="number" data-segment="${s.id}" data-field="${key}" `
    + `value="${s[key]}" min="${min}" max="${max}" step="${step}" aria-label="${escapeHtml(s.label + ': ' + label)}"></label>`;
  };
  const isCoefficient = key => /(?:Intensity|Utilization|Cost|ComputeFraction)$/.test(key);
  return segments.map(s => {
    const fields = SEGMENT_FIELDS.filter(([key]) => key in s);
    const basic = fields.filter(([key]) => !isCoefficient(key)).map(f => fieldHtml(s, f)).join('');
    const coefficients = fields.filter(([key]) => isCoefficient(key)).map(f => fieldHtml(s, f)).join('');
    const advanced = coefficients ? `<details><summary>Deployment costs, compute intensity and utilization</summary>${coefficients}</details>` : '';
    const deploymentNote = coefficients ? ' Owned task share is the remainder. Migration destinations: 30% managed, 50% rented, 20% owned. Costs include operations; intensity assumes comparable task quality.' : '';
    return `<fieldset class="control-card"><legend>${escapeHtml(s.label)}</legend>${basic}${advanced}`
      + `<p class="control-note">Initial capacity: ${fmtGw(s.initialGw)} GW. All splits and budgets are illustrative.${deploymentNote}</p></fieldset>`;
  }).join('');
}

function spacexHtml(run) {
  const s = spacexSummary(run);
  const body = s.rows.map(r => `<tr><td>${r.year}</td><td>${fmtGw(r.bookGw)}</td><td>${fmtB(r.revenueB)}</td>`
    + `<td>${Number.isFinite(r.coverage) ? r.coverage.toFixed(2) + '×' : '—'}</td><td>${fmtB(r.operatingShortfallB)}</td></tr>`).join('');
  return `<p class="pergw-note">Hypothetical $50M/MW/year rental book: 4 GW added annually, five-year terms. `
    + `Revenue payback: ${s.revenuePaybackYears.toFixed(2)} years (construction cost / annual rental rate), before expenses and collection. `
    + `Operating shortfall: ${fmtB(s.totalOperatingShortfallB)} across the modeled years. `
    + `This does not establish profitability, liquidity, or solvency and is not an expected credit loss. `
    + `The customer-revenue proxy uses provider revenue per commercial MW; actual customers and contracts can differ.</p>`
    + `<table class="state-table"><thead><tr><th>Year</th><th>Contracted GW</th><th>Rental revenue</th><th>Revenue coverage</th>`
    + `<th>Operating shortfall</th></tr></thead><tbody>${body}</tbody></table>`;
}

return { segmentDemandHtml, segmentAssumptionsHtml, spacexHtml, fmtB, fmtPct, fmtPctFine, fmtGw, stateTableHtml, calibrationRows, calibrationHtml, calibrationSummary,
         ladderRungs, ladderHtml, marginMigrationHtml,
         matrixTabForLimiter, railMarginExpansions, matrixHtml,
         labSplit, labComparisonHtml,
         fabCapexPerGwYr, perGwEconomics, perGwEconomicsHtml,
         bottleneckSegments, bottleneckHtml,
         providerRevenueRows, providerRevenueHtml };
});
