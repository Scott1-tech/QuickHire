// anna/integrations.js
// ─────────────────────────────────────────────────────────────────────────────
// Compliance integrations: MVR · PSP · Clearinghouse (Stage 4).
//
// Two responsibilities:
//   1. CONSENT GATE — FMCSA/FCRA-style: a record may not be pulled without the
//      driver's recorded consent for that specific check. pullCompliance refuses
//      to run any adapter the driver hasn't consented to.
//   2. PLUGGABLE ADAPTERS — each provider is an adapter with a `configured()`
//      check and a `pull()` method. When real credentials are present (env vars)
//      the adapter calls the provider; otherwise it returns a clearly-flagged
//      SIMULATED result that pulls NO incident data (so it can never produce a
//      false "approve") — safe to run in dev and ready for real keys in prod.
// ─────────────────────────────────────────────────────────────────────────────

export class ConsentError extends Error {
  constructor(missing) {
    super(`Missing driver consent for: ${missing.join(', ')}. Capture consent before pulling these records.`);
    this.name = 'ConsentError';
    this.missing = missing;
    this.code = 'CONSENT_REQUIRED';
  }
}

/**
 * Verify the driver has consented to each requested check.
 * @param {Object} consent  e.g. { mvr:true, psp:true, clearinghouse:true, signedAt }
 * @param {string[]} types
 * @throws {ConsentError}
 */
export function checkConsent(consent = {}, types = []) {
  const missing = types.filter((t) => !consent[t]);
  if (missing.length) throw new ConsentError(missing);
  return true;
}

const nowIso = () => new Date().toISOString();

/**
 * Normalize a consent input into Anna's consent shape. Accepts either direct
 * flags ({ mvr, psp, clearinghouse }) or the driver application's consent fields
 * ({ consentMvr, consentPsp, consentEmployment }) so consent captured during the
 * application flows straight into the gate. Under FMCSA, the employment/PSP
 * authorization covers the Clearinghouse query.
 * @returns {{ mvr, psp, clearinghouse, signedAt, signature, by }}
 */
export function normalizeConsent(input = {}) {
  const b = (v) => v === true || v === 'true' || v === 'on' || v === 1;
  const mvr = b(input.mvr) || b(input.consentMvr);
  const psp = b(input.psp) || b(input.consentPsp);
  const clearinghouse = b(input.clearinghouse) || b(input.consentClearinghouse) || b(input.consentEmployment);
  const any = mvr || psp || clearinghouse;
  return {
    mvr, psp, clearinghouse,
    signedAt: input.signedAt || input.consentCompletedAt || (any ? nowIso() : null),
    signature: input.signature || null,
    by: input.by || null,
  };
}
const numFields = (o, keys) => {
  const out = {};
  for (const k of keys) if (o && o[k] != null && o[k] !== '') out[k] = Number(o[k]);
  return out;
};

/**
 * Build a provider adapter.
 * @param {string} name        Display name.
 * @param {string} envPrefix   Env var prefix, e.g. "MVR" -> MVR_API_URL / MVR_API_KEY.
 * @param {function} mapResponse  Maps the provider's JSON to Anna's record shape.
 */
function makeAdapter(name, envPrefix, mapResponse) {
  return {
    name,
    type: envPrefix.toLowerCase(),
    configured: () => Boolean(process.env[`${envPrefix}_API_URL`] && process.env[`${envPrefix}_API_KEY`]),
    /**
     * @param {Object} driver  DriverProfile (used for identity fields).
     * @param {Object} [opts]  { simulatedData } per-type override for demos/tests.
     */
    async pull(driver = {}, opts = {}) {
      if (this.configured()) {
        // ── Real provider call (integration seam) ──────────────────────────
        // The exact request body varies per provider; adjust identity fields to
        // match your contract. Response is normalized via mapResponse().
        const res = await fetch(process.env[`${envPrefix}_API_URL`], {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env[`${envPrefix}_API_KEY`]}` },
          body: JSON.stringify({
            licenseNumber: driver.cdl?.licenseNumber,
            state: driver.cdl?.state,
            firstName: driver.firstName, lastName: driver.lastName, name: driver.name,
            dob: driver.dob,
          }),
        });
        if (!res.ok) throw new Error(`${name} provider error ${res.status}`);
        return { provider: name, simulated: false, pulledAt: nowIso(), data: mapResponse(await res.json()) };
      }
      // ── Simulated: not configured. Pull NO incidents unless explicitly seeded.
      const seed = opts.simulatedData?.[this.type];
      return {
        provider: 'simulated',
        simulated: true,
        pulledAt: nowIso(),
        note: `${name} provider not configured — simulated pull (no records).`,
        data: seed ? mapResponse(seed) : {},
      };
    },
  };
}

export const INTEGRATIONS = {
  mvr: makeAdapter('MVR', 'MVR', (r) => numFields(r, ['movingViolations', 'accidents', 'dui'])),
  psp: makeAdapter('PSP', 'PSP', (r) => numFields(r, ['crashes', 'oosInspections'])),
  clearinghouse: makeAdapter('Clearinghouse', 'CLEARINGHOUSE', (r) => ({ prohibited: Boolean(r.prohibited) })),
};

/**
 * Pull the requested compliance records for a driver, enforcing consent first.
 * Adapters run through the queue if provided (rate/concurrency control).
 *
 * @param {Object} p
 * @param {Object} p.driver
 * @param {Object} p.consent           { mvr, psp, clearinghouse, signedAt, ... }
 * @param {string[]} [p.types]         defaults to all three.
 * @param {Object} [p.queue]           optional createQueue() instance.
 * @param {Object} [p.opts]            { simulatedData } for demos/tests.
 * @returns {Promise<{ records, sources, consent }>}
 * @throws {ConsentError} if consent is missing for any requested type.
 */
export async function pullCompliance({ driver, consent, types = ['mvr', 'psp', 'clearinghouse'], queue, opts = {} }) {
  checkConsent(consent, types);
  const run = (t) => INTEGRATIONS[t].pull(driver, opts);
  const results = await Promise.all(types.map((t) => (queue ? queue.push(() => run(t), `pull:${t}`) : run(t))));

  const records = {};
  const sources = [];
  types.forEach((t, i) => {
    records[t] = results[i].data;
    sources.push({ type: t, provider: results[i].provider, simulated: results[i].simulated, pulledAt: results[i].pulledAt, note: results[i].note });
  });
  return { records, sources, consent: { ...consent, verifiedAt: nowIso() } };
}

/** Which integrations have real credentials configured (for status display). */
export function integrationStatus() {
  return Object.fromEntries(Object.entries(INTEGRATIONS).map(([k, a]) => [k, a.configured() ? 'live' : 'simulated']));
}
