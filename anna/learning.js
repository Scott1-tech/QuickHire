// anna/learning.js
// ─────────────────────────────────────────────────────────────────────────────
// Outcome-based learning: tune each carrier's soft-match weights from real
// hiring outcomes, so the more drivers Anna places, the better its ranking gets.
//
// Conservative + explainable by design: we only nudge weights once there is
// enough signal (minSamples), and only toward factors where *successful* drivers
// scored higher than *unsuccessful* ones. Hard gates are never touched — learning
// only re-weights the soft ranking among already-eligible carriers.
// ─────────────────────────────────────────────────────────────────────────────

// Outcome → signal. "good" = a placement that worked out; "bad" = it didn't.
export const OUTCOME_SIGNAL = {
  hired: 'good', started: 'good', retained_90d: 'good',
  washed_out: 'bad', rejected: 'bad', declined_by_driver: 'bad',
};
export const OUTCOME_KINDS = Object.keys(OUTCOME_SIGNAL);

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * Record an outcome sample and recompute tuned weights for one carrier.
 * @param {Object} learning      Prior { samples:[], weights:{} } (or undefined).
 * @param {Object} p
 * @param {string} p.outcome     One of OUTCOME_KINDS.
 * @param {Object} p.breakdown   factorId -> score(0..100) for the placed driver.
 * @param {Object} p.baseWeights The carrier's default soft weights.
 * @param {Object} [p.opts]      { minSamples=5, k=0.5 }
 * @returns {{ samples, weights, stats }}
 */
export function recordOutcome(learning = {}, { outcome, breakdown = {}, baseWeights = {}, opts = {} }) {
  const signal = OUTCOME_SIGNAL[outcome];
  const samples = [...(learning.samples || [])];
  if (signal === 'good' || signal === 'bad') samples.push({ at: new Date().toISOString(), signal, breakdown });
  const weights = tuneWeights(samples, baseWeights, opts);
  return { samples, weights, stats: outcomeStats(samples) };
}

/**
 * Compute tuned weights from samples. Returns null (caller keeps base) until
 * there are enough good+bad samples to be meaningful.
 */
export function tuneWeights(samples = [], baseWeights = {}, { minSamples = 5, k = 0.5 } = {}) {
  const good = samples.filter((s) => s.signal === 'good');
  const bad = samples.filter((s) => s.signal === 'bad');
  if (good.length + bad.length < minSamples || !good.length || !bad.length) return null;

  const factors = Object.keys(baseWeights);
  const avg = (rows, f) => (rows.length ? rows.reduce((sum, r) => sum + (Number(r.breakdown?.[f]) || 0), 0) / rows.length : 0);

  const raw = {};
  for (const f of factors) {
    const delta = (avg(good, f) - avg(bad, f)) / 100; // -1..1
    // Nudge each weight up/down by at most k, never below a small floor.
    raw[f] = Math.max(0.02, baseWeights[f] * (1 + k * delta));
  }
  // Re-normalize to sum to 1 so fit scores stay comparable across carriers.
  const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(raw).map(([f, v]) => [f, clamp01(v / total)]));
}

export function outcomeStats(samples = []) {
  const good = samples.filter((s) => s.signal === 'good').length;
  const bad = samples.filter((s) => s.signal === 'bad').length;
  const total = good + bad;
  return { good, bad, total, successRate: total ? Math.round((good / total) * 100) : null };
}
