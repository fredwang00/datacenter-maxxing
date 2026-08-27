// Rail definitions for the v3 datacenter economics model.
//
// TWO DENOMINATORS — never sum across them:
//   basis 'perGw'   = $B per GW deployed once
//   basis 'annuity' = $B per GW/YEAR of production capacity (a fab emits GW forever)
// All perGw figures are IT-load basis. See the spec's units guard.

const PUE = 1.25;

const RAILS = [
  // ---- perGw: these sum to capexPerGw ----
  { id: 'servers', label: 'Accelerator + server BOM', basis: 'perGw', parent: null,
    price2026: 21.2, elasticity: 1.0, lag: 0.5, provenance: 'researched:epoch-ai-2026-05' },
  { id: 'logic', label: 'TSMC N3/N5 wafers', basis: 'perGw', parent: 'servers',
    price2026: 1.2, elasticity: 0.20, lag: 2, provenance: 'disputed:wafer-count-3x' },
  { id: 'memory', label: 'HBM4 + LPDDR5X', basis: 'perGw', parent: 'servers',
    price2026: 4.9, elasticity: 'step', lag: 1.0, provenance: 'researched:ms-vr200-rack-bom' },
  { id: 'package', label: 'CoWoS + ABF substrate', basis: 'perGw', parent: 'servers',
    price2026: 0.6, elasticity: 1.3, lag: 1, provenance: 'researched:cowos-950-per-package' },
  { id: 'vendorMargin', label: 'Vendor margin + rest of BOM', basis: 'perGw', parent: 'servers',
    price2026: 14.5, elasticity: 1.0, lag: 0.5, provenance: 'derived:residual-to-epoch-21.2' },
  { id: 'network', label: 'Networking, optics', basis: 'perGw', parent: null,
    price2026: 4.9, elasticity: 0.6, lag: 0.5, provenance: 'researched:epoch-ai-2026-05' },
  { id: 'dcElec', label: 'In-DC electrical, switchgear, UPS', basis: 'perGw', parent: null,
    price2026: 5.4, elasticity: 0.35, lag: 2.75, provenance: 'researched:tt-48pct-of-11.3' },
  { id: 'cooling', label: 'Mechanical / liquid cooling', basis: 'perGw', parent: null,
    price2026: 3.7, elasticity: 0.45, lag: 2, provenance: 'researched:tt-33pct-of-11.3' },
  { id: 'shell', label: 'Civil, land, utility works', basis: 'perGw', parent: null,
    price2026: 2.5, elasticity: 0.30, lag: 2, provenance: 'researched:tt-19pct-plus-epoch-land' },
  { id: 'power', label: 'Generation adder', basis: 'perGw', parent: null,
    price2026: 0.5, elasticity: 0.70, lag: 5.0, provenance: 'researched:lazard-v19-grid-connected' },

  // ---- annuity: capacity ceilings + amortized cost only. NEVER in capexPerGw. ----
  { id: 'euv', label: 'EUV tools (ASML)', basis: 'annuity', parent: null,
    price2026: 0.95, elasticity: 0.3, lag: 3, provenance: 'researched:asml-ar2025-realized-asp' },
  { id: 'optics', label: 'Mirrors (Zeiss)', basis: 'annuity', parent: 'euv',
    price2026: 0.23, elasticity: 0.1, lag: 4, provenance: 'estimate:zeiss-inferred-from-cogs-share' },
  { id: 'otherWfe', label: 'DUV, etch, depo, metrology', basis: 'annuity', parent: null,
    price2026: 2.55, elasticity: 0.4, lag: 2, provenance: 'derived:to-hit-3.5B-wfe' },
  { id: 'fabshell', label: 'Cleanroom + shell', basis: 'annuity', parent: null,
    price2026: 2.5, elasticity: 0.5, lag: 2, provenance: 'derived:to-hit-6B-total' },
];

const _byId = new Map(RAILS.map(r => [r.id, r]));
function railById(id) { return _byId.get(id); }

function topLevelPerGwIds() {
  return RAILS.filter(r => r.parent === null && r.basis === 'perGw').map(r => r.id);
}

function topLevelAnnuityIds() {
  return RAILS.filter(r => r.parent === null && r.basis === 'annuity').map(r => r.id);
}

function initialRailPrice() {
  const out = {};
  for (const r of RAILS) out[r.id] = r.price2026;
  return out;
}

// Sums perGw rails into capexPerGw. Throws on any annuity rail — the two
// denominators are not addable and a silent number here corrupts everything.
function sumPerGw(railPrice, ids) {
  const list = ids || topLevelPerGwIds();
  let total = 0;
  for (const id of list) {
    const rail = railById(id);
    if (!rail) throw new Error(`Unknown rail "${id}"`);
    if (rail.basis !== 'perGw') {
      throw new Error(
        `Units guard: rail "${id}" has basis "annuity" and cannot be summed into ` +
        `capexPerGw. annuity rails are $B per GW/yr of production capacity; ` +
        `perGw rails are $B per GW deployed once.`
      );
    }
    total += railPrice[id];
  }
  return total;
}

const TIGHTNESS_MIN = 0.5;
const TIGHTNESS_MAX = 3.0;
const STEP_GAIN = 0.6;            // calibrated: 2yr at tightness 1.5 -> +60%, matching HBM's 2027 reset
const MEMORY_RESET_INTERVAL = 2;  // HBM sits under multi-year LTAs

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function railTightness(demandGw, ceilingGw) {
  if (!(ceilingGw > 0)) return TIGHTNESS_MAX;
  return clamp(demandGw / ceilingGw, TIGHTNESS_MIN, TIGHTNESS_MAX);
}

function repriceContinuous(price, elasticity, tightness) {
  return price * (1 + elasticity * (tightness - 1));
}

function newStepState() { return { pressure: 0, yearsSinceReset: 0 }; }

// Long-term-agreement repricing. Tightness accumulates as pressure and
// discharges only at the contract reset. HBM was flat-to-down through 2026
// while commodity DRAM moved +93-98% in one quarter, then steps +50-79% at
// the 2027 reset. A continuous elasticity cannot express that shape.
function repriceStep(price, tightness, stepState, resetInterval) {
  stepState.pressure += (tightness - 1);
  stepState.yearsSinceReset += 1;
  if (stepState.yearsSinceReset >= resetInterval) {
    const multiplier = 1 + Math.max(0, stepState.pressure) * STEP_GAIN;
    stepState.pressure = 0;
    stepState.yearsSinceReset = 0;
    return price * multiplier;
  }
  return price;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PUE, RAILS, railById, topLevelPerGwIds, topLevelAnnuityIds, initialRailPrice, sumPerGw, clamp, railTightness, repriceContinuous, repriceStep, newStepState, TIGHTNESS_MIN, TIGHTNESS_MAX, STEP_GAIN, MEMORY_RESET_INTERVAL };
}
