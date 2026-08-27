// Panel renderers. These consume the engine's year-state array and produce
// HTML strings. No arithmetic beyond formatting and presentation ratios --
// the one deliberate exception is the calibration panel's use of
// impliedCreditDepthFor (see explainGwMiss below), which is the engine's own
// designated diagnostic for exactly this purpose, not renderer-invented math.

(function (root, factory) {
  const rails = (typeof require !== 'undefined') ? require('./rails.js') : root;
  const engine = (typeof require !== 'undefined') ? require('./engine.js') : root;
  const presets = (typeof require !== 'undefined') ? require('./presets.js') : root;
  const api = factory(rails, engine, presets);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function (rails, engine, presets) {

const { RAILS } = rails;
const { impliedCreditDepthFor, hoarderRelease } = engine;
const { DEFAULT_INPUTS } = presets;

function fmtB(n) {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(1) + 'T';
  return '$' + n.toFixed(1) + 'B';
}
function fmtPct(n) { return Number.isFinite(n) ? (n * 100).toFixed(0) + '%' : '—'; }
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

return { fmtB, fmtPct, fmtGw, stateTableHtml, calibrationRows, calibrationHtml, calibrationSummary,
         ladderRungs, ladderHtml, marginMigrationHtml };
});
