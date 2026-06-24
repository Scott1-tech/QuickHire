// anna/test/run.js
// Dependency-free test runner for Anna's deterministic core (no API key needed).
//   node anna/test/run.js
import { compileSpec } from '../spec.js';
import { matchDriver, evaluateGates, scoreSoft, suggestRematch, STATUS } from '../matcher.js';
import { normalizeDriver } from '../normalize.js';
import { buildPortfolio, writeCompliance } from '../portfolio.js';
import { createQueue } from '../queue.js';
import { extractCarrierSpec } from '../carrier.js';
import { pullCompliance, checkConsent, ConsentError, integrationStatus, normalizeConsent } from '../integrations.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); } };
const section = (s) => console.log('\n' + s);

// ── Fixtures ──
const carrierA = { id: 'A', name: 'Acme Freight', requirements: {
  eligibility: { minAge: 23 },
  cdl: { class: 'A', endorsements: ['H'], minExperienceYears: 2, minValidityDays: 30 },
  mvr: { maxMovingViolations: 2, maxAccidents: 1, maxDUI: 0 },
  psp: { maxCrashes: 1, maxOOSInspections: 2 },
  insurance: { minAutoLiability: 1000000 },
} };
const carrierB = { id: 'B', name: 'Budget Lanes', requirements: {
  eligibility: { minAge: 21 },
  cdl: { class: 'A', minExperienceYears: 1 },
  mvr: { maxMovingViolations: 4, maxAccidents: 2, maxDUI: 1 },
} };
const carrierC = { id: 'C', name: 'Hazmat Express', requirements: {
  cdl: { class: 'A', endorsements: ['H', 'N'], minExperienceYears: 5 },
  mvr: { maxMovingViolations: 0, maxAccidents: 0, maxDUI: 0 },
} };

const goodDriver = {
  name: 'Pat Driver', age: 30,
  cdl: { class: 'A', endorsements: ['H', 'N'], experienceYears: 6, expiresInDays: 400 },
  mvr: { movingViolations: 0, accidents: 0, dui: 0 },
  psp: { crashes: 0, oosInspections: 0 },
  insurance: { autoLiability: 1000000 },
};

section('spec compiler');
{
  const spec = compileSpec(carrierA);
  ok(spec.carrierId === 'A', 'carries id through');
  ok(spec.hardGates.length >= 8, `emits gates from requirements (got ${spec.hardGates.length})`);
  const weightSum = Object.values(spec.softWeights).reduce((a, b) => a + b, 0);
  ok(Math.abs(weightSum - 1) < 1e-9, 'soft weights normalize to 1');
  // Blank requirements -> no gates for that field.
  ok(!compileSpec({ requirements: {} }).hardGates.length, 'empty requirements => no gates');
}

section('hard gates: pass / fail / unknown');
{
  ok(evaluateGates(compileSpec(carrierA), goodDriver).status === STATUS.ELIGIBLE, 'clean driver is ELIGIBLE');

  const dui = { ...goodDriver, mvr: { ...goodDriver.mvr, dui: 1 } };
  const r = evaluateGates(compileSpec(carrierA), dui);
  ok(r.status === STATUS.INELIGIBLE, 'DUI over cap => INELIGIBLE');
  ok(r.failed.some((f) => f.id === 'mvr.maxDUI'), 'failure cites the DUI gate');

  const noAge = { ...goodDriver }; delete noAge.age;
  const r2 = evaluateGates(compileSpec(carrierA), noAge);
  ok(r2.status === STATUS.NEEDS_DATA, 'missing age => NEEDS_DATA, not INELIGIBLE');
  ok(r2.unknown.some((u) => u.id === 'eligibility.minAge'), 'unknown cites the age gate');

  const lowClass = { ...goodDriver, cdl: { ...goodDriver.cdl, class: 'B' } };
  ok(evaluateGates(compileSpec(carrierA), lowClass).status === STATUS.INELIGIBLE, 'Class B fails Class A requirement');

  const noEndorse = { ...goodDriver, cdl: { ...goodDriver.cdl, endorsements: [] } };
  ok(evaluateGates(compileSpec(carrierA), noEndorse).failed.some((f) => f.id === 'cdl.endorsements'), 'missing endorsement fails');
}

section('soft score ranking');
{
  const exp = scoreSoft(compileSpec(carrierA), goodDriver);
  ok(exp.score >= 90, `excellent driver scores high (${exp.score})`);
  const minimal = { ...goodDriver, cdl: { ...goodDriver.cdl, experienceYears: 2, expiresInDays: 30 }, mvr: { movingViolations: 2, accidents: 1, dui: 0 } };
  ok(scoreSoft(compileSpec(carrierA), minimal).score < exp.score, 'at-the-limit driver scores lower than spotless one');
}

section('matchDriver across carriers');
{
  const { matches, top, summary } = matchDriver(goodDriver, [carrierA, carrierB, carrierC]);
  ok(matches.length === 3, 'returns a result per carrier');
  ok(top && top.status === STATUS.ELIGIBLE, 'top pick is eligible');
  ok(matches[0].fitScore >= matches[matches.length - 1].fitScore || matches[matches.length - 1].status !== STATUS.ELIGIBLE, 'sorted by eligibility then fit');
  ok(summary.eligible >= 2, `multiple eligible carriers (${summary.eligible})`);

  // A driver with 1 violation: near-miss for Hazmat (max 0), fine for A/B.
  const oneViol = { ...goodDriver, mvr: { movingViolations: 1, accidents: 0, dui: 0 } };
  const res = matchDriver(oneViol, [carrierA, carrierB, carrierC]);
  const hz = res.matches.find((m) => m.carrierId === 'C');
  ok(hz.status === STATUS.INELIGIBLE && hz.nearMiss, 'Hazmat is a near-miss (one gate away)');
  ok(res.summary.nearMisses.some((n) => n.carrierId === 'C'), 'near-miss surfaced in summary');
}

section('suggestRematch');
{
  const rejected = { ...goodDriver, mvr: { movingViolations: 3, accidents: 0, dui: 0 } }; // fails A (max2), ok B (max4)
  const { eligible } = suggestRematch(rejected, [carrierA, carrierB, carrierC], { excludeCarrierIds: ['A'] });
  ok(eligible.some((m) => m.carrierId === 'B'), 'suggests Budget Lanes after Acme rejection');
  ok(!eligible.some((m) => m.carrierId === 'A'), 'excluded carrier is not re-suggested');
}

section('normalizeDriver (heuristic fallback, no API key)');
(async () => {
  const { profile, source } = await normalizeDriver({ name: 'Jo', age: '27', cdlClass: 'a', experienceYears: '4', dui: '0', movingViolations: '1' });
  ok(source === 'heuristic', 'falls back to heuristic without API key');
  ok(profile.age === 27 && typeof profile.age === 'number', 'coerces age to number');
  ok(profile.cdl.class === 'A', 'uppercases CDL class');
  ok(profile.cdl.experienceYears === 4, 'maps flat experienceYears into cdl');
  ok(profile.mvr.movingViolations === 1, 'maps flat violations into mvr');

  section('buildPortfolio + recruiter assignment');
  const { top } = matchDriver(goodDriver, [carrierA, carrierB]);
  const p = buildPortfolio({ driver: goodDriver, match: top, recruiterPool: ['Jenna', 'Marco'] });
  ok(p.review.assignedRecruiter === 'Jenna', 'round-robin assigns first recruiter');
  ok(p.review.task.includes('Jenna'), 'task names the recruiter');
  ok(p.carrier.carrierId === top.carrierId, 'portfolio tied to matched carrier');

  section('writeCompliance (deterministic verdict)');
  const clean = await writeCompliance({ carrier: carrierA, driver: goodDriver });
  ok(clean.flag === 'approve', 'clean driver => approve');
  const bad = await writeCompliance({ carrier: carrierA, driver: goodDriver, records: { mvr: { dui: 2 } } });
  ok(bad.flag === 'reject', 'pulled MVR with DUIs => reject');
  ok(bad.reasons.length > 0, 'reject carries reasons');
  const ch = await writeCompliance({ carrier: carrierA, driver: goodDriver, records: { clearinghouse: { prohibited: true } } });
  ok(ch.flag === 'reject', 'clearinghouse prohibited => reject');

  section('queue: concurrency + retry');
  const q = createQueue({ concurrency: 2, maxRetries: 2, baseDelayMs: 1 });
  let live = 0, maxLive = 0;
  const job = () => new Promise((r) => { live++; maxLive = Math.max(maxLive, live); setTimeout(() => { live--; r(true); }, 10); });
  await q.pushAll([job, job, job, job, job]);
  ok(maxLive <= 2, `respects concurrency limit (peak ${maxLive})`);
  let tries = 0;
  const val = await q.push(() => { tries++; if (tries < 2) throw new Error('boom'); return 42; });
  ok(val === 42 && tries === 2, 'retries a failing job then succeeds');

  section('extractCarrierSpec (free-text parser)');
  const { requirements: parsed, source: psrc } = await extractCarrierSpec({
    minimumAge: 'At least 23 years of age',
    minimumExperience: 'At least 2 yrs verifiable OTR in the last 3 yrs',
    maxMovingViolations: 'No more than 1 in the past 3 years',
    dotRecordableAccidents: 'No accidents in the past 3 years',
    duiDwiPolicy: 'None in a lifetime',
    hazmatRequired: 'Yes',
  });
  ok(psrc === 'heuristic', 'parses deterministically without AI');
  ok(parsed.eligibility.minAge === 23, 'minAge 23 from "At least 23 years of age"');
  ok(parsed.cdl.minExperienceYears === 2, 'experience 2 from "At least 2 yrs ... last 3 yrs"');
  ok(parsed.mvr.maxMovingViolations === 1, 'moving violations 1 from "No more than 1 in the past 3 years"');
  ok(parsed.mvr.maxAccidents === 0, 'accidents 0 from "No accidents in the past 3 years" (timeframe ignored)');
  ok(parsed.mvr.maxDUI === 0, 'DUI 0 from "None in a lifetime"');
  ok((parsed.cdl.endorsements || []).includes('H'), 'hazmat "Yes" => H endorsement');

  section('integrations: consent gate + adapters');
  // Consent enforcement.
  let threw = null;
  try { checkConsent({ mvr: true }, ['mvr', 'psp']); } catch (e) { threw = e; }
  ok(threw instanceof ConsentError && threw.missing.includes('psp'), 'checkConsent throws ConsentError naming missing types');
  ok(checkConsent({ mvr: true, psp: true }, ['mvr', 'psp']) === true, 'passes when all consents present');

  let pullThrew = null;
  try { await pullCompliance({ driver: goodDriver, consent: {}, types: ['mvr'] }); } catch (e) { pullThrew = e; }
  ok(pullThrew?.code === 'CONSENT_REQUIRED', 'pullCompliance refuses without consent');

  // Simulated pull (no provider configured) returns flagged, empty records.
  const pulled = await pullCompliance({ driver: goodDriver, consent: { mvr: true, psp: true, clearinghouse: true } });
  ok(pulled.sources.every((s) => s.simulated), 'unconfigured providers report simulated');
  ok(pulled.consent.verifiedAt, 'records consent verification timestamp');
  ok(Object.keys(pulled.records.mvr).length === 0, 'simulated pull fabricates no MVR incidents (no false approve)');

  // Seeded simulation flows through to a verdict.
  const seeded = await pullCompliance({ driver: goodDriver, consent: { mvr: true }, types: ['mvr'], opts: { simulatedData: { mvr: { dui: 2 } } } });
  ok(seeded.records.mvr.dui === 2, 'seeded simulation maps provider response');
  ok(integrationStatus().mvr === 'simulated', 'integrationStatus reports simulated when unconfigured');

  section('normalizeConsent (application flow -> gate)');
  const fromApp = normalizeConsent({ consentMvr: true, consentPsp: true, consentEmployment: true, consentCompletedAt: '2026-01-02T00:00:00Z' });
  ok(fromApp.mvr && fromApp.psp && fromApp.clearinghouse, 'maps consentMvr/Psp/Employment -> mvr/psp/clearinghouse');
  ok(fromApp.signedAt === '2026-01-02T00:00:00Z', 'preserves consentCompletedAt as signedAt');
  const direct = normalizeConsent({ mvr: true });
  ok(direct.mvr && !direct.psp && direct.signedAt, 'direct flags set signedAt when any consent given');
  ok(normalizeConsent({}).signedAt === null, 'no consent => null signedAt');
  // The consent normalizer composes with the gate.
  ok(checkConsent(fromApp, ['mvr', 'clearinghouse']) === true, 'normalized application consent passes the gate');

  // ── Report ──
  console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
