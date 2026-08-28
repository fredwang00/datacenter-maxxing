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
const { impliedCreditDepthFor, hoarderRelease } = engine;
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
  { label: 'Demand' },
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
  { label: 'Lab GW' },
  { label: 'Hoarder Got' },
  { label: 'Inference Share' },
  { label: 'Lab $/MW (ceiling)', title: 'Realized lab revenue per MW, and the diffusion ceiling -- the most the economy can absorb that year.' },
];

function stateTableHtml(run) {
  const head = STATE_TABLE_COLUMNS.map(c => `<th${c.title ? ` title="${c.title}"` : ''}>${c.label}</th>`).join('');
  const rows = run.map(y => {
    const ceilings = y.ceilings || {};
    const labRevCell = (() => {
      if (!Number.isFinite(y.labRevPerMw)) return '—';
      const rev = '$' + y.labRevPerMw.toFixed(0) + 'M';
      const ceilingTxt = Number.isFinite(y.diffusionCeilingMw) ? '$' + y.diffusionCeilingMw.toFixed(0) + 'M' : '—';
      const marker = y.diffusionBound
        ? ' <span class="warn diffusion-bound" title="lab revenue hit the ceiling of what the economy can absorb this year">diffusion-bound</span>'
        : '';
      return `${rev} <span class="ceiling-note" title="diffusion ceiling this year">/ ceil ${ceilingTxt}</span>${marker}`;
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
      fmtGw(y.labGw), fmtGw(y.hoarderGot), fmtPct(y.inferenceShare), labRevCell,
    ];
    // I7 fix (final review): this used to say "parameters are likely wrong."
    // `clamped` fires whenever nextPrice hits the floorCost arbitrage shelf --
    // at DEFAULT_INPUTS/seed 12345 that's 2029 (price 11.00 = floorCost
    // exactly). That is the spec's stability defence #1 ENGAGING, not a sign
    // something is misconfigured -- wording it as an error contradicted the
    // header's own framing of 2029 as a legitimate finding.
    const mark = y.clamped ? ' <span class="warn" title="price hit the floor-cost arbitrage shelf -- the model\'s stability defence engaging, not necessarily a parameter error">clamped</span>' : '';
    const rowClass = [y.clamped ? 'row-clamped' : '', y.diffusionBound ? 'row-diffusion-bound' : '']
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
// C1 fix (final review): that "what" can be DEMAND, and the phrasing must then
// name a demand collapse rather than a supply rail. At DEFAULT_INPUTS the
// 2029/95 miss is demand-limited: the diffusion ceiling cuts lab revenue below
// the clearing price, so labs stop buying long before any rail or the capital
// ceiling binds. The old wording read "memory-bound at 23.1 GW" in a year
// whose memory ceiling was 87.0 GW, printed three columns away in the same
// table.
//
// Wrapped defensively: an explanatory aside must never take down the
// calibration panel.
function limiterPhrase(limitingRail) {
  return limitingRail === 'demand'
    ? 'demand-limited: labs cannot monetize at the clearing price'
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

// I5 fix (final review): the page header used to hardcode "disagrees with its
// source in two places," naming only the 2029 GW and 2028 lab-share misses.
// At DEFAULT_INPUTS, 5 of 12 targets actually fail (those two plus
// price2028, cumCapex2029, cumCredit2029), and all four targets spec:758
// designates as out-of-sample validators -- independent of the GW discussion
// the model is fitted against -- are among the failures: 0 of 4 pass. A
// hardcoded count goes stale the moment sliders move (as the "two places"
// claim already had). Compute it here instead, from the same rows the table
// renders, so the summary can never drift from what's actually displayed.
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
    ? ` Of the ${s.validatorsTotal} targets independent of the GW discussion (marked *) -- the strongest test, since the model was never fitted to them -- ${s.validatorsPassing} of ${s.validatorsTotal} pass.`
    : '';
  const summary = `<p class="cal-summary">${s.passing} of ${s.total} calibration targets pass at these inputs (${s.failing} miss).${validatorNote}</p>`;
  const rowsHtml = rows.map(r => `
    <tr class="${r.pass ? 'cal-pass' : 'cal-fail'}">
      <td>${r.label}${r.outOfSample ? ' <span class="cal-oos" title="out-of-sample validator: independent of the GW discussion the model is fitted against">*</span>' : ''}</td>
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

// $M/MW rungs, in a fixed, meaningful order: cost to build/operate < what a
// commodity renter pays < what a scarcity-driven hoarder captures < what a
// lab earns per MW < the marginal rate the single best end-user pays.
//
// This order is NOT enforced by a sort -- it is a claim about the model, and
// the "ladder rungs ascend" test checks it for real, across every simulated
// year, not just 2026.
//
// I2 fix (final review): the old flat `computePrice * 2.2` scarcity rung was
// safe only while wtpFraction stayed below 1/2.2 ~= 0.45; the default STARTS
// at 0.50 and rises to a 0.6 cap, so it was never actually safe, and it
// inverted past lab revenue in 2028 ($55.4M vs $27.1M) and 2030. A five-year
// "verified" table used to live in this comment -- by the time the inversion
// was caught, only its 2026 row still matched the model. Don't trust a
// comment for a live invariant; the test below is what actually checks it.
//
// Scarcity/hoarder is now derived from the engine's own hoarderRelease rather
// than an unsourced render-layer multiplier: it reuses hoarderRelease with a
// synthetic 1-GW stock to read off exactly the release FRACTION the engine
// would apply at this year's price (hoarderRelease(state, price) returns
// min(hoardedStock, hoardedStock * fraction); at hoardedStock = 1 that IS the
// fraction), then places the rung that fraction of the way from commodity
// rental up to lab revenue. HOARDER_RELEASE_MAX (0.6, engine.js) caps that
// fraction, so the rung can reach at most 60% of the way to lab revenue --
// it can never cross it, unlike the old multiplier. Below HOARDER_INTERNAL_
// VALUE ($20M/MW) the fraction is 0 and the rung sits exactly on rental --
// which is correct: a hoarder has no scarcity premium to extract when price
// hasn't cleared their own internal-use value. This assumes labRevPerMw >=
// computePrice, true at defaults across all five years; if a slider
// combination ever inverts that base relationship the ladder's ascending
// claim is broken regardless of this formula, and the test should, and will,
// legitimately fail.
//
// The top rung (end-user capture) is DISPLAY ONLY and now a pinned constant,
// not a multiple of a model output: Jane Street's $200-500M/MW is a marginal
// rate measured on the single best user in the world, observed once,
// independent of this model -- tying it to labRevPerMw (the old `* 4`) let it
// drift with the simulation and land at $108/MW by 2028, BELOW its own
// sourced floor, while still carrying a "Jane Street" tooltip. It must never
// feed a calculation.
const JANE_STREET_MARGINAL_RATE_MW = 350; // midpoint of the sourced $200-500M/MW band

function ladderRungs(y) {
  const ownCost = (y.capexPerGw / 5) + 1.5;   // 5yr amortization + power and opex
  const releaseFraction = hoarderRelease({ hoardedStock: 1 }, y.computePrice);
  const scarcity = y.computePrice + (y.labRevPerMw - y.computePrice) * releaseFraction;
  return [
    { id: 'cost',     label: 'Cost to own + operate', value: ownCost,          scales: true,  warn: '' },
    { id: 'rental',   label: 'Commodity rental',      value: y.computePrice,   scales: true,  warn: '' },
    { id: 'scarcity', label: 'Scarcity / hoarder',    value: scarcity,         scales: true,  warn: '' },
    { id: 'lab',      label: 'Lab revenue',           value: y.labRevPerMw,    scales: true,  warn: '' },
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
// v2 computed gwEoy = base + share * actualNewGw off its own inline supply
// model with hardcoded 0.25/0.30 shares. v3 emits `labGw` -- the COMBINED
// Anthropic + OpenAI stock -- directly off the engine, so this splits that
// instead of recomputing anything. The split shares themselves remain
// editorial (reflecting v2's 0.25/0.30 GW ratio, renormalized to sum to 1 of
// the combined figure: 0.30/(0.25+0.30) ~= 55% OpenAI, 45% Anthropic) and are
// labelled as such in the panel -- they are not a model output.
//
// ARR figures, strategy text, and ARR trajectory notes are v2's hand-
// maintained news content and are kept verbatim; they are not derived from
// the simulation and must not be re-derived from it.
// ---------------------------------------------------------------------------
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
      <p class="lab-share-note">Editorial share of v3's combined labGw: ${fmtPct(share)} -- not a model output.</p>
      <div class="bar-chart">
        ${gwBars}
        <div class="bar-row"><span class="bar-label">ARR</span><div class="bar-track"><div class="bar-fill ${d.barClass}" style="width:${arrPct}%">$${d.arr}B ARR</div></div></div>
        <div class="bar-row"><span class="bar-label">Last raise</span><div class="bar-track"><div class="bar-fill ${d.barClass}" style="width:${raisedPct}%">$${d.raised}B</div></div></div>
      </div>
      <div class="company-strategy"><strong>Strategy:</strong> ${d.strategy}</div>
      <div class="company-trajectory">${d.trajectory}</div>
    </div>`;
  }

  return '<div class="comparison">'
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
// own fields: capexPerGw, computePrice, clearingPrice, labRevPerMw.
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
    computePrice: y.computePrice, clearingPrice: y.clearingPrice, labRevPerMw: y.labRevPerMw,
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
    + row('Lab revenue per MW', Number.isFinite(info.labRevPerMw) ? '$' + info.labRevPerMw.toFixed(0) + 'M/MW' : '—', 'positive')
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
// Panel: Diffusion (Jevons) Reality Check
//
// The model's headline finding, previously only a table column
// (labRevPerMw / diffusionCeilingMw / diffusionBound in stateTableHtml): lab
// revenue per MW is capped by what the addressable economy can actually
// absorb. When that cap binds, lab willingness-to-pay falls below the
// clearing price and lab demand collapses -- this is why 2029 lands at 22.7
// GW against a stated 95, not a supply-side shortfall.
// ---------------------------------------------------------------------------
function diffusionRows(run) {
  return run.map(y => ({
    year: y.year,
    labRevPerMw: y.labRevPerMw,
    diffusionCeilingMw: y.diffusionCeilingMw,
    headroom: Number.isFinite(y.diffusionCeilingMw) ? y.diffusionCeilingMw - y.labRevPerMw : NaN,
    inferenceShare: y.inferenceShare,
    diffusionBound: y.diffusionBound,
  }));
}

function diffusionHtml(run) {
  const rows = diffusionRows(run);
  const head = ['Year', 'Lab $/MW', 'Diffusion ceiling', 'Headroom', 'Inference share', '']
    .map(h => `<th>${h}</th>`).join('');
  const body = rows.map(r => {
    const marker = r.diffusionBound
      ? ' <span class="warn diffusion-bound" title="lab revenue is capped by what the addressable economy can absorb this year">diffusion-bound</span>'
      : '';
    return `<tr data-year="${r.year}" data-diffusion-bound="${r.diffusionBound}" class="${r.diffusionBound ? 'dbound-row' : ''}">`
      + `<td>${r.year}</td>`
      + `<td>$${r.labRevPerMw.toFixed(0)}M</td>`
      + `<td>${Number.isFinite(r.diffusionCeilingMw) ? '$' + r.diffusionCeilingMw.toFixed(0) + 'M' : '—'}</td>`
      + `<td>${Number.isFinite(r.headroom) ? '$' + r.headroom.toFixed(0) + 'M' : '—'}</td>`
      + `<td>${fmtPct(r.inferenceShare)}</td>`
      + `<td>${marker}</td>`
      + `</tr>`;
  }).join('');
  const note = `<p class="diffusion-note">Lab revenue per MW is capped by what the addressable economy can absorb `
    + `(the diffusion ceiling). When that cap binds -- marked below -- lab willingness-to-pay falls below the `
    + `clearing price and lab demand collapses. That mechanism, not a supply-side shortfall, is why 2029 lands at `
    + `22.7 GW against a stated 95.</p>`;
  return note + `<table class="diffusion-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

return { fmtB, fmtPct, fmtPctFine, fmtGw, stateTableHtml, calibrationRows, calibrationHtml, calibrationSummary,
         ladderRungs, ladderHtml, marginMigrationHtml,
         matrixTabForLimiter, railMarginExpansions, matrixHtml,
         labSplit, labComparisonHtml,
         fabCapexPerGwYr, perGwEconomics, perGwEconomicsHtml,
         bottleneckSegments, bottleneckHtml,
         diffusionRows, diffusionHtml };
});
