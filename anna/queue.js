// anna/queue.js
// ─────────────────────────────────────────────────────────────────────────────
// In-process async job queue with bounded concurrency + retry/backoff.
//
// The blueprint's scale model: the bottleneck is API calls, not the language, so
// every Claude / external-integration call runs as a queued job through a worker
// pool. This is a dependency-free in-memory implementation suitable for the
// standalone module and single-process deploys; the same interface (push ->
// promise) can later be backed by a durable queue (e.g. Supabase/pg, Redis)
// without changing callers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Object} [opts]
 * @param {number} [opts.concurrency=4]   Max jobs running at once (API rate guard).
 * @param {number} [opts.maxRetries=3]    Retries per job on failure.
 * @param {number} [opts.baseDelayMs=500] Exponential backoff base (500,1000,2000…).
 * @param {function} [opts.onError]       Notified on each failed attempt.
 */
export function createQueue({ concurrency = 4, maxRetries = 3, baseDelayMs = 500, onError } = {}) {
  const pending = [];
  let active = 0;
  const stats = { queued: 0, running: 0, done: 0, failed: 0, retries: 0 };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function pump() {
    while (active < concurrency && pending.length) {
      const job = pending.shift();
      active++;
      stats.running = active;
      run(job).finally(() => {
        active--;
        stats.running = active;
        pump();
      });
    }
  }

  async function run(job) {
    let attempt = 0;
    for (;;) {
      try {
        const result = await job.fn();
        stats.done++;
        job.resolve(result);
        return;
      } catch (err) {
        attempt++;
        if (onError) { try { onError(err, { name: job.name, attempt }); } catch { /* ignore */ } }
        if (attempt > maxRetries) {
          stats.failed++;
          job.reject(err);
          return;
        }
        stats.retries++;
        await sleep(baseDelayMs * 2 ** (attempt - 1)); // 500, 1000, 2000, …
      }
    }
  }

  return {
    /**
     * Enqueue a job. `fn` is an async function; resolves/rejects with its result.
     * @returns {Promise<*>}
     */
    push(fn, name = 'job') {
      stats.queued++;
      return new Promise((resolve, reject) => {
        pending.push({ fn, name, resolve, reject });
        pump();
      });
    },
    /** Enqueue many and resolve when all settle. */
    pushAll(fns) { return Promise.all(fns.map((fn, i) => this.push(fn, `batch[${i}]`))); },
    stats: () => ({ ...stats, pending: pending.length }),
    idle: () => active === 0 && pending.length === 0,
  };
}
