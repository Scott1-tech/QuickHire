// anna/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Anna — Driver Qualification AI Agent (standalone module).
//
// Decoupled from the Fleetmule/QuickHire backend by design: clean inputs/outputs,
// no Express, no DB coupling. The host app calls these functions (or wraps them
// in HTTP routes) and persists the results however it likes.
//
// Public surface:
//   compileSpec, matchDriver, suggestRematch     — Stage 1 (matching)
//   normalizeDriver, extractFromDocument          — Stage 1/2 (intake + scanning)
//   buildPortfolio                                — Stage 3 (portfolio + recruiter)
//   writeCompliance                               — Stage 4 (compliance verdict)
//   createQueue                                   — async scale backbone
//   processLead                                   — high-level orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export { compileSpec, OPS } from './spec.js';
export { matchDriver, suggestRematch, evaluateGates, scoreSoft, STATUS } from './matcher.js';
export { normalizeDriver, extractFromDocument, lowConfidenceFields, DRIVER_SHAPE } from './normalize.js';
export { buildPortfolio, writeCompliance } from './portfolio.js';
export { createQueue } from './queue.js';
export { callClaude, callClaudeJSON, annaConfigured, MODELS } from './claude.js';

import { normalizeDriver } from './normalize.js';
import { matchDriver } from './matcher.js';
import { buildPortfolio } from './portfolio.js';
import { createQueue } from './queue.js';

// A shared queue so concurrent leads respect one global concurrency limit.
const defaultQueue = createQueue({ concurrency: Number(process.env.ANNA_CONCURRENCY) || 4 });

/**
 * End-to-end Stage 1 → Stage 3 for a single lead:
 *   normalize → match against all carriers → build portfolio for the best fit.
 * Compliance (Stage 4) is intentionally separate — it costs money and should run
 * only after a carrier is chosen.
 *
 * @param {Object} p
 * @param {Object} p.lead                 Raw lead payload.
 * @param {Object[]} p.carriers           Carrier records (with .requirements).
 * @param {Object} [p.opts]               { apiKey, model, recruiterPool, minScore, queue }
 * @returns {Promise<{ profile, match, portfolio, source }>}
 */
export async function processLead({ lead, carriers, opts = {} }) {
  const queue = opts.queue || defaultQueue;
  // Normalization is the API-bound step → run it through the queue.
  const { profile, confidence, source } = await queue.push(() => normalizeDriver(lead, opts), 'normalizeDriver');
  // Matching is pure CPU → no queue needed.
  const match = matchDriver(profile, carriers, { minScore: opts.minScore });
  const portfolio = match.top
    ? buildPortfolio({ driver: profile, match: match.top, recruiterPool: opts.recruiterPool || [] })
    : null;
  return { profile, confidence, match, portfolio, source };
}
