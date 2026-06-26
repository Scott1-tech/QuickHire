// anna/portfolio.js
// ─────────────────────────────────────────────────────────────────────────────
// Driver Portfolio (Stage 3) + compliance summary writing (Stage 4).
//
// buildPortfolio()  aggregates everything Anna has collected about a driver into
//                   one reviewable record, and assigns a recruiter.
// writeCompliance() compares pulled MVR/PSP/Clearinghouse data against the
//                   matched carrier's gates and produces an approve/reject flag
//                   with per-category reasons + a human-readable summary. Uses
//                   the deterministic gate engine for the verdict (auditable) and
//                   optionally Claude to phrase the narrative summary.
// ─────────────────────────────────────────────────────────────────────────────

import { compileSpec } from './spec.js';
import { evaluateGates, STATUS } from './matcher.js';
import { callClaude, MODELS, annaConfigured } from './claude.js';

let _seq = 0;
const id = (p) => `${p}_${Date.now().toString(36)}${(_seq++).toString(36)}`;

/**
 * Build a driver portfolio with Anna's RANKED carrier recommendations.
 *
 * Anna does NOT pick the carrier — she ranks the best fits and a human recruiter
 * selects one (see selectCarrier). So the portfolio starts with `carrier: null`
 * and a `recommendations` list, awaiting recruiter selection.
 *
 * @param {Object} p
 * @param {Object} p.driver          Normalized DriverProfile.
 * @param {Object} p.match           Full result from matchDriver ({ matches, top, summary }).
 * @param {Object} [p.documents]     { docType: { fields, confidence, warnings } }.
 * @param {string} [p.recruiter]     Pre-assigned recruiter, else round-robin.
 * @param {string[]} [p.recruiterPool]
 * @returns {Object} portfolio
 */
export function buildPortfolio({ driver, match, documents = {}, recruiter, recruiterPool = [] }) {
  const assigned = recruiter || pickRecruiter(recruiterPool);
  const docWarnings = Object.entries(documents).flatMap(([t, d]) => (d.warnings || []).map((w) => `${t}: ${w}`));
  const matches = (match && match.matches) || [];
  // Compact, ranked recommendation list for the recruiter to choose from.
  const recommendations = matches.map((m) => ({
    carrierId: m.carrierId,
    carrierName: m.carrierName,
    status: m.status,
    fitScore: m.fitScore,
    scoreBreakdown: m.scoreBreakdown || {},
    fitSummary: m.fitSummary || null,
    nearMiss: m.nearMiss || null,
    topReason: (m.reasons && m.reasons[0]) || null,
  }));
  return {
    id: id('portfolio'),
    createdAt: new Date().toISOString(),
    driver,
    recommendations,            // Anna's ranked best-fit list (advisory)
    suggestedTop: match?.top?.carrierId || null, // highlight only; NOT auto-selected
    carrier: null,              // set by the recruiter via selectCarrier()
    documents,
    documentWarnings: docWarnings,
    compliance: null,           // filled in by writeCompliance() after a carrier is picked
    review: {
      assignedRecruiter: assigned,
      task: assigned ? `${assigned}, please review this driver and pick the best-fit carrier.` : 'Unassigned — needs a recruiter.',
      status: 'awaiting_carrier', // awaiting_carrier | pending | approved | rejected
      carrierSelectedBy: null, carrierSelectedAt: null,
      decidedBy: null, decidedAt: null, decisionReason: null,
    },
  };
}

/**
 * Recruiter picks a carrier from the recommendations (the human-in-the-loop step).
 * Binds the portfolio to that carrier and moves it to 'pending' review.
 * @returns {Object} the updated portfolio (mutated in place).
 */
export function selectCarrier(portfolio, carrierId, by = 'Recruiter') {
  const rec = (portfolio.recommendations || []).find((r) => r.carrierId === carrierId);
  if (!rec) throw new Error('That carrier is not in this driver\'s recommendation list.');
  portfolio.carrier = { carrierId: rec.carrierId, carrierName: rec.carrierName, fitScore: rec.fitScore, status: rec.status, scoreBreakdown: rec.scoreBreakdown || {} };
  portfolio.review = {
    ...portfolio.review,
    status: portfolio.review.status === 'awaiting_carrier' ? 'pending' : portfolio.review.status,
    carrierSelectedBy: by,
    carrierSelectedAt: new Date().toISOString(),
  };
  return portfolio;
}

let _rr = 0;
function pickRecruiter(pool) {
  if (!pool.length) return null;
  return pool[_rr++ % pool.length];
}

/**
 * Run a compliance check: merge pulled records into the driver profile, evaluate
 * against the carrier's gates, and produce the approve/reject summary.
 *
 * @param {Object} p
 * @param {Object} p.carrier   Carrier record (with .requirements) or compiled spec.
 * @param {Object} p.driver    DriverProfile.
 * @param {Object} [p.records] { mvr, psp, clearinghouse } pulled from integrations,
 *                              shaped to merge into the driver profile.
 * @param {Object} [p.opts]    { apiKey, model, narrate }
 * @returns {Promise<Object>} compliance result
 */
export async function writeCompliance({ carrier, driver, records = {}, opts = {} }) {
  const spec = carrier.hardGates ? carrier : compileSpec(carrier);
  const merged = mergeRecords(driver, records);
  const { status, gateResults, failed, unknown } = evaluateGates(spec, merged);

  const flag = status === STATUS.ELIGIBLE ? 'approve' : status === STATUS.NEEDS_DATA ? 'review' : 'reject';
  const byCategory = groupByCategory(gateResults);
  let summary = buildSummary(flag, failed, unknown, spec.carrierName);

  // Optionally let Claude phrase a richer narrative; never let it change the verdict.
  if (opts.narrate && annaConfigured(opts.apiKey)) {
    try {
      const { text } = await callClaude({
        apiKey: opts.apiKey,
        model: opts.model || MODELS.smart,
        maxTokens: 400,
        system: 'You are Anna, an FMCSA driver-qualification compliance assistant. Write a concise, factual 2-3 sentence summary for a recruiter. Do not change the provided verdict. Cite specifics.',
        messages: [{ role: 'user', content: `Verdict: ${flag.toUpperCase()} for ${spec.carrierName}.\nGate results:\n${JSON.stringify(gateResults, null, 2)}\n\nWrite the summary.` }],
      });
      if (text.trim()) summary = text.trim();
    } catch { /* keep deterministic summary */ }
  }

  return {
    flag, // approve | reject | review
    status,
    carrierId: spec.carrierId,
    carrierName: spec.carrierName,
    categories: byCategory,
    reasons: [...failed, ...unknown].map((r) => r.reason),
    summary,
    checkedAt: new Date().toISOString(),
  };
}

// Merge pulled compliance records into the driver profile (records win).
// Exported so callers can persist the authoritative profile after a pull.
export function mergeRecords(driver, records) {
  return {
    ...driver,
    mvr: { ...driver.mvr, ...records.mvr },
    psp: { ...driver.psp, ...records.psp },
    // Clearinghouse: a positive/incomplete result is a hard disqualifier; expose
    // it as a DUI-equivalent so existing gates catch it (extendable later).
    ...(records.clearinghouse?.prohibited ? { mvr: { ...driver.mvr, ...records.mvr, dui: Math.max(driver.mvr?.dui || 0, 1) } } : {}),
  };
}

function groupByCategory(gateResults) {
  const map = {};
  for (const r of gateResults) {
    (map[r.category] ||= { pass: true, reasons: [] });
    if (r.status !== 'PASS') { map[r.category].pass = false; map[r.category].reasons.push(r.reason); }
  }
  return Object.entries(map).map(([key, v]) => ({ key, pass: v.pass, reason: v.reasons.join(' ') || `${key} meets requirements.` }));
}

function buildSummary(flag, failed, unknown, carrierName) {
  if (flag === 'approve') return `Driver meets all of ${carrierName}'s stated CDL, MVR, PSP, and insurance requirements and is recommended for approval.`;
  if (flag === 'reject') return `Driver does not meet ${carrierName}'s requirements: ${failed.map((f) => f.reason).join(' ')}`;
  return `Cannot finalize for ${carrierName} — missing data: ${unknown.map((u) => u.reason).join(' ')}`;
}
