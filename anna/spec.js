// anna/spec.js
// ─────────────────────────────────────────────────────────────────────────────
// Carrier Spec compiler.
//
// Anna's matching model is two-layer (see matcher.js):
//   1. HARD GATES  — pass/fail disqualifiers. Any failure => INELIGIBLE.
//   2. SOFT WEIGHTS — preferences used only to RANK carriers a driver passes.
//
// This module turns a carrier's stored hiring requirements (QuickHire's nested
// `requirements` shape: { cdl, mvr, psp, insurance, ... }) into a reusable,
// versioned CarrierSpec made of declarative gates + weights. Gates are DATA, not
// code, so new rule types are additive and the result is auditable/testable.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Gate
 * @property {string} id        Stable identifier (e.g. "mvr.maxDUI").
 * @property {string} label     Human-readable label for summaries.
 * @property {string} field     Dot-path into the DriverProfile (e.g. "mvr.dui").
 * @property {string} op        One of OPS keys.
 * @property {*}      value     Comparison value from the carrier requirement.
 * @property {string} category  CDL | MVR | PSP | Insurance | Eligibility.
 */

/**
 * @typedef {Object} CarrierSpec
 * @property {string} carrierId
 * @property {string} carrierName
 * @property {number} version             Bumped whenever requirements change.
 * @property {Gate[]} hardGates
 * @property {Object<string,number>} softWeights  factorId -> weight (0..1).
 * @property {Object} raw                 Original requirements (kept for the LLM / audit).
 */

// Supported gate operators. Each returns true when the driver PASSES the gate.
// `d` = driver value (already normalized), `v` = carrier requirement value.
const CDL_RANK = { A: 3, B: 2, C: 1 };
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);

export const OPS = {
  gte: (d, v) => num(d) >= num(v),
  lte: (d, v) => num(d) <= num(v),
  eq: (d, v) => d === v,
  cdlRankGte: (d, v) => (CDL_RANK[String(d || '').toUpperCase()] || 0) >= (CDL_RANK[String(v || '').toUpperCase()] || 0),
  includesAll: (d, v) => Array.isArray(v) && v.every((x) => (Array.isArray(d) ? d : []).includes(x)),
  notOwnerOperator: (d /* driver.cdl.type */) => d !== 'owner-operator',
};

// Which ops need a non-null driver value to be evaluable. If the driver value is
// missing for one of these, the gate is UNKNOWN (needs data) rather than FAIL.
const NUMERIC_OPS = new Set(['gte', 'lte']);

/**
 * Resolve a dot-path from an object (e.g. "mvr.dui").
 * @returns {*} the value, or undefined if any segment is missing.
 */
export function getPath(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * Compile a carrier record into a CarrierSpec.
 * Accepts the QuickHire carrier object ({ id, name, requirements }) OR a bare
 * requirements object. Unknown / blank requirement fields are simply skipped, so
 * a carrier that only specifies a few rules just gets a few gates.
 *
 * @param {Object} carrier
 * @returns {CarrierSpec}
 */
export function compileSpec(carrier = {}) {
  const reqs = carrier.requirements || carrier || {};
  const gates = [];
  const push = (g) => { if (g.value != null && g.value !== '' && !(Array.isArray(g.value) && g.value.length === 0)) gates.push(g); };

  // ── Eligibility (general FMCSA-style gates) ──
  const elig = reqs.eligibility || {};
  push({ id: 'eligibility.minAge', label: `Minimum age ${elig.minAge}`, field: 'age', op: 'gte', value: num(elig.minAge), category: 'Eligibility' });

  // ── CDL ──
  const cdl = reqs.cdl || {};
  push({ id: 'cdl.class', label: `CDL Class ${cdl.class} or higher`, field: 'cdl.class', op: 'cdlRankGte', value: cdl.class, category: 'CDL' });
  push({ id: 'cdl.endorsements', label: `Endorsements: ${(cdl.endorsements || []).join(', ')}`, field: 'cdl.endorsements', op: 'includesAll', value: cdl.endorsements, category: 'CDL' });
  push({ id: 'cdl.minExperienceYears', label: `Min ${cdl.minExperienceYears} yr(s) experience`, field: 'cdl.experienceYears', op: 'gte', value: num(cdl.minExperienceYears), category: 'CDL' });
  push({ id: 'cdl.minValidityDays', label: `CDL valid ${cdl.minValidityDays}+ days`, field: 'cdl.expiresInDays', op: 'gte', value: num(cdl.minValidityDays), category: 'CDL' });
  if (cdl.allowOwnerOperator === false) push({ id: 'cdl.noOwnerOperator', label: 'No owner-operators', field: 'cdl.type', op: 'notOwnerOperator', value: false, category: 'CDL' });

  // ── MVR ──
  const mvr = reqs.mvr || {};
  push({ id: 'mvr.maxMovingViolations', label: `Max ${mvr.maxMovingViolations} moving violation(s)`, field: 'mvr.movingViolations', op: 'lte', value: num(mvr.maxMovingViolations), category: 'MVR' });
  push({ id: 'mvr.maxAccidents', label: `Max ${mvr.maxAccidents} accident(s)`, field: 'mvr.accidents', op: 'lte', value: num(mvr.maxAccidents), category: 'MVR' });
  push({ id: 'mvr.maxDUI', label: `Max ${mvr.maxDUI} DUI/DWI`, field: 'mvr.dui', op: 'lte', value: num(mvr.maxDUI), category: 'MVR' });

  // ── PSP ──
  const psp = reqs.psp || {};
  push({ id: 'psp.maxCrashes', label: `Max ${psp.maxCrashes} PSP crash(es)`, field: 'psp.crashes', op: 'lte', value: num(psp.maxCrashes), category: 'PSP' });
  push({ id: 'psp.maxOOSInspections', label: `Max ${psp.maxOOSInspections} OOS inspection(s)`, field: 'psp.oosInspections', op: 'lte', value: num(psp.maxOOSInspections), category: 'PSP' });

  // ── Insurance ──
  const ins = reqs.insurance || {};
  push({ id: 'insurance.minAutoLiability', label: `Min $${num(ins.minAutoLiability)?.toLocaleString?.() || ins.minAutoLiability} auto liability`, field: 'insurance.autoLiability', op: 'gte', value: num(ins.minAutoLiability), category: 'Insurance' });
  if (ins.cargoRequired) push({ id: 'insurance.minCargo', label: `Min $${num(ins.minCargo)?.toLocaleString?.() || ins.minCargo} cargo`, field: 'insurance.cargo', op: 'gte', value: num(ins.minCargo), category: 'Insurance' });

  return {
    carrierId: carrier.id || reqs.id || null,
    carrierName: carrier.name || reqs.name || 'Unknown carrier',
    version: carrier.specVersion || carrier.version || 1,
    hardGates: gates,
    softWeights: normalizeWeights(reqs.softWeights),
    raw: reqs,
  };
}

// Default soft-ranking factors. Carriers may override via reqs.softWeights.
const DEFAULT_WEIGHTS = {
  experienceMargin: 0.35, // experience above the minimum
  cleanRecordMargin: 0.30, // violations/accidents/DUI well under the caps
  endorsementsMatch: 0.20, // holds the requested endorsements (and extras)
  cdlValidityMargin: 0.15, // CDL valid comfortably beyond the minimum
};

function normalizeWeights(overrides) {
  const w = { ...DEFAULT_WEIGHTS, ...(overrides || {}) };
  const total = Object.values(w).reduce((s, x) => s + (Number(x) || 0), 0) || 1;
  // Re-normalize so weights always sum to 1 (keeps fit scores comparable across carriers).
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, (Number(v) || 0) / total]));
}

export { NUMERIC_OPS };
