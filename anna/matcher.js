// anna/matcher.js
// ─────────────────────────────────────────────────────────────────────────────
// The matching algorithm — deterministic, explainable, testable (no API key).
//
// Layer 1: HARD GATES (pass/fail). Any FAIL => INELIGIBLE for that carrier.
//          A gate whose driver data is missing is UNKNOWN, not FAIL — the
//          carrier stays a candidate "pending data" instead of being rejected
//          for information we simply haven't collected yet.
// Layer 2: SOFT SCORE (0..100). Among carriers a driver passes, rank by fit.
//
// Claude is NOT used here. Anna uses the LLM only to NORMALIZE messy input into
// the structured DriverProfile (see normalize.js); the scoring itself is plain
// arithmetic so every decision is auditable ("failed gate mvr.maxDUI: 1 > 0").
// ─────────────────────────────────────────────────────────────────────────────

import { OPS, NUMERIC_OPS, getPath, compileSpec } from './spec.js';

export const STATUS = { ELIGIBLE: 'ELIGIBLE', NEEDS_DATA: 'NEEDS_DATA', INELIGIBLE: 'INELIGIBLE' };
const GATE = { PASS: 'PASS', FAIL: 'FAIL', UNKNOWN: 'UNKNOWN' };

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * Evaluate one driver against one compiled spec's hard gates.
 * @returns {{ status, gateResults, failed, unknown }}
 */
export function evaluateGates(spec, driver) {
  const gateResults = spec.hardGates.map((g) => {
    const dv = getPath(driver, g.field);
    // Missing data for a numeric comparison => UNKNOWN (needs the record/doc).
    if ((dv == null || dv === '') && NUMERIC_OPS.has(g.op)) {
      return { id: g.id, category: g.category, status: GATE.UNKNOWN, reason: `${g.label}: no data on file yet.` };
    }
    const fn = OPS[g.op];
    const pass = fn ? fn(dv, g.value) : true;
    return {
      id: g.id,
      category: g.category,
      status: pass ? GATE.PASS : GATE.FAIL,
      reason: pass ? `${g.label}: OK.` : explainFail(g, dv),
    };
  });

  const failed = gateResults.filter((r) => r.status === GATE.FAIL);
  const unknown = gateResults.filter((r) => r.status === GATE.UNKNOWN);
  let status = STATUS.ELIGIBLE;
  if (failed.length) status = STATUS.INELIGIBLE;
  else if (unknown.length) status = STATUS.NEEDS_DATA;

  return { status, gateResults, failed, unknown };
}

function explainFail(g, dv) {
  const have = dv == null || dv === '' ? 'none on file' : Array.isArray(dv) ? dv.join(', ') || 'none' : dv;
  switch (g.op) {
    case 'lte': return `${g.label}: has ${have}, exceeds the limit of ${g.value}.`;
    case 'gte': return `${g.label}: has ${have}, below the required ${g.value}.`;
    case 'cdlRankGte': return `${g.label}: holds ${have ? 'Class ' + have : 'no class'}.`;
    case 'includesAll': {
      const missing = (g.value || []).filter((x) => !(Array.isArray(dv) ? dv : []).includes(x));
      return `${g.label}: missing ${missing.join(', ')}.`;
    }
    case 'notOwnerOperator': return `${g.label}: applicant is an owner-operator.`;
    default: return `${g.label}: does not meet requirement (${have}).`;
  }
}

/**
 * Soft fit score (0..100) for a driver the gates allow. Only the factors that
 * have both a carrier requirement and driver data contribute; weights are
 * re-normalized over the contributing factors so a sparse spec still scores 0..100.
 */
export function scoreSoft(spec, driver) {
  const reqs = spec.raw || {};
  const w = spec.softWeights;
  const factors = {}; // factorId -> { weight, value(0..1) }

  // Experience margin: up to +5 years above the minimum is "full marks".
  const minExp = num(reqs.cdl?.minExperienceYears);
  const exp = num(driver.cdl?.experienceYears);
  if (minExp != null && exp != null) factors.experienceMargin = { weight: w.experienceMargin, value: clamp01((exp - minExp) / 5) };

  // Clean-record margin: average headroom under MVR/PSP caps (0 = at the cap, 1 = spotless).
  const headrooms = [
    margin(driver.mvr?.movingViolations, reqs.mvr?.maxMovingViolations),
    margin(driver.mvr?.accidents, reqs.mvr?.maxAccidents),
    margin(driver.mvr?.dui, reqs.mvr?.maxDUI),
    margin(driver.psp?.crashes, reqs.psp?.maxCrashes),
    margin(driver.psp?.oosInspections, reqs.psp?.maxOOSInspections),
  ].filter((x) => x != null);
  if (headrooms.length) factors.cleanRecordMargin = { weight: w.cleanRecordMargin, value: headrooms.reduce((a, b) => a + b, 0) / headrooms.length };

  // Endorsements match: fraction of requested endorsements the driver holds.
  const wanted = reqs.cdl?.endorsements || [];
  if (wanted.length) {
    const have = driver.cdl?.endorsements || [];
    factors.endorsementsMatch = { weight: w.endorsementsMatch, value: clamp01(wanted.filter((e) => have.includes(e)).length / wanted.length) };
  }

  // CDL validity margin: comfortably valid beyond the minimum (cap at +365 days).
  const minValid = num(reqs.cdl?.minValidityDays);
  const expiresIn = num(driver.cdl?.expiresInDays);
  if (minValid != null && expiresIn != null) factors.cdlValidityMargin = { weight: w.cdlValidityMargin, value: clamp01((expiresIn - minValid) / 365) };

  const ids = Object.keys(factors);
  if (!ids.length) return { score: 0, breakdown: {} };
  const wsum = ids.reduce((s, id) => s + factors[id].weight, 0) || 1;
  let score = 0;
  const breakdown = {};
  for (const id of ids) {
    const contribution = (factors[id].weight / wsum) * factors[id].value;
    breakdown[id] = Math.round(factors[id].value * 100);
    score += contribution;
  }
  return { score: Math.round(score * 100), breakdown };
}

// Headroom under a "max" cap, normalized 0..1 (1 = zero incidents, 0 = at the cap).
function margin(actual, cap) {
  const a = num(actual), c = num(cap);
  if (a == null || c == null) return null;
  if (c <= 0) return a <= 0 ? 1 : 0;
  return clamp01((c - a) / c);
}

/**
 * Plain-language "why this carrier fits this driver" summary — the offer rationale
 * shown in the driver profile. Positive framing for ELIGIBLE/NEEDS_DATA; for an
 * INELIGIBLE carrier the gate reasons already explain why not, so returns null.
 */
export function buildFitSummary(spec, driver, status, score) {
  if (status === STATUS.INELIGIBLE) return null;
  const reqs = spec.raw || {};
  const pts = [];

  const exp = num(driver.cdl?.experienceYears), minExp = num(reqs.cdl?.minExperienceYears);
  if (exp != null && minExp != null) pts.push(`${exp} yr${exp === 1 ? '' : 's'} experience vs ${minExp} required`);
  else if (exp != null) pts.push(`${exp} yr${exp === 1 ? '' : 's'} experience`);

  const incidents = [driver.mvr?.movingViolations, driver.mvr?.accidents, driver.mvr?.dui, driver.psp?.crashes, driver.psp?.oosInspections].filter((x) => x != null);
  if (incidents.length && incidents.every((x) => Number(x) === 0)) pts.push('clean driving & safety record');
  else if (incidents.length) pts.push('violations within this carrier\'s limits');

  const wanted = reqs.cdl?.endorsements || [];
  if (wanted.length) {
    const have = driver.cdl?.endorsements || [];
    if (wanted.every((e) => have.includes(e))) pts.push(`holds required endorsement${wanted.length > 1 ? 's' : ''} (${wanted.join(', ')})`);
  }
  if (num(driver.cdl?.expiresInDays) != null && num(reqs.cdl?.minValidityDays) != null) pts.push(`CDL valid ${driver.cdl.expiresInDays} days`);
  if (num(driver.age) != null && num(reqs.eligibility?.minAge) != null) pts.push(`meets the ${reqs.eligibility.minAge}+ age requirement`);

  const lead = status === STATUS.ELIGIBLE ? (score >= 80 ? 'Strong fit' : 'Qualifies') : 'Likely fit, pending records';
  const tail = status === STATUS.NEEDS_DATA ? ' MVR/PSP/Clearinghouse not pulled yet.' : '';
  return pts.length ? `${lead} for ${spec.carrierName} — ${pts.join(', ')}.${tail}` : `${lead} for ${spec.carrierName}.${tail}`;
}

/**
 * Match ONE driver against MANY carriers and rank the results.
 *
 * @param {Object} driver   Normalized DriverProfile (see normalize.js).
 * @param {Object[]} carriers  Carrier records (with .requirements) OR pre-compiled specs.
 * @param {Object} [opts]
 * @param {number} [opts.minScore=0]  Drop ELIGIBLE carriers below this fit score.
 * @returns {{ matches, top, summary }}
 */
export function matchDriver(driver, carriers = [], opts = {}) {
  const specs = carriers.map((c) => (c.hardGates ? c : compileSpec(c)));
  const matches = specs.map((spec) => {
    const { status, gateResults, failed, unknown } = evaluateGates(spec, driver);
    const { score, breakdown } = status === STATUS.INELIGIBLE ? { score: 0, breakdown: {} } : scoreSoft(spec, driver);
    return {
      carrierId: spec.carrierId,
      carrierName: spec.carrierName,
      specVersion: spec.version,
      status,
      fitScore: score,
      scoreBreakdown: breakdown,
      gateResults,
      reasons: [...failed, ...unknown].map((r) => r.reason),
      fitSummary: buildFitSummary(spec, driver, status, score),
      // "near miss" => ineligible on a single gate; useful for re-match suggestions.
      nearMiss: status === STATUS.INELIGIBLE && failed.length === 1 ? failed[0].reason : null,
    };
  });

  // Rank: ELIGIBLE (by fit desc) > NEEDS_DATA (fewest unknowns) > INELIGIBLE (near-misses first).
  const order = { [STATUS.ELIGIBLE]: 0, [STATUS.NEEDS_DATA]: 1, [STATUS.INELIGIBLE]: 2 };
  matches.sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    if (a.status === STATUS.ELIGIBLE) return b.fitScore - a.fitScore;
    if (a.status === STATUS.NEEDS_DATA) return countUnknown(a) - countUnknown(b);
    return (b.nearMiss ? 1 : 0) - (a.nearMiss ? 1 : 0);
  });

  const min = num(opts.minScore) || 0;
  const eligible = matches.filter((m) => m.status === STATUS.ELIGIBLE && m.fitScore >= min);
  const top = eligible[0] || matches.find((m) => m.status === STATUS.NEEDS_DATA) || null;

  return {
    matches,
    top,
    summary: {
      eligible: eligible.length,
      needsData: matches.filter((m) => m.status === STATUS.NEEDS_DATA).length,
      ineligible: matches.filter((m) => m.status === STATUS.INELIGIBLE).length,
      nearMisses: matches.filter((m) => m.nearMiss).map((m) => ({ carrierId: m.carrierId, carrierName: m.carrierName, reason: m.nearMiss })),
    },
  };
}

const countUnknown = (m) => m.gateResults.filter((r) => r.status === 'UNKNOWN').length;

/**
 * Suggest carriers to re-match a rejected driver to (Stage 5).
 * Excludes carriers already rejected; returns eligible carriers ranked by fit,
 * then near-miss carriers (one gate away) as "stretch" options.
 */
export function suggestRematch(driver, carriers, { excludeCarrierIds = [] } = {}) {
  const { matches } = matchDriver(driver, carriers);
  const ex = new Set(excludeCarrierIds);
  const eligible = matches.filter((m) => m.status === STATUS.ELIGIBLE && !ex.has(m.carrierId));
  const stretch = matches.filter((m) => m.nearMiss && !ex.has(m.carrierId));
  return { eligible, stretch };
}
