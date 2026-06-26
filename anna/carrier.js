// anna/carrier.js
// ─────────────────────────────────────────────────────────────────────────────
// Carrier Spec Intake (the "Carrier onboarding" stage).
//
// QuickHire stores carrier hiring requirements as FREE TEXT from a questionnaire
// (e.g. minimumAge: "At least 23 years of age", duiDwiPolicy: "None in a
// lifetime"). The matcher needs structured numeric caps/minimums. This module
// turns the free-text form into Anna's structured `requirements` shape
// ({ eligibility, cdl, mvr, psp, insurance }) so compileSpec() can build gates.
//
// Parse ONCE per carrier and cache the result (the prompt-caching/parse-once
// design): deterministic parser by default, optional Claude path for messy text.
// ─────────────────────────────────────────────────────────────────────────────

import { annaConfigured } from './claude.js';
import { llmJSON } from './llm.js';

/**
 * Extract structured requirements from a carrier's flat free-text form fields.
 * @param {Object} form  The carrier.requirements object (flat string fields).
 * @param {Object} [opts] { apiKey, model, ai } — set ai:true to use Claude.
 * @returns {Promise<{ requirements, source }>}
 */
export async function extractCarrierSpec(form = {}, opts = {}) {
  if (opts.ai && annaConfigured(opts.apiKey)) {
    try {
      const out = await llmJSON({
        provider: opts.provider,
        apiKey: opts.apiKey,
        model: opts.model,
        maxTokens: 700,
        system:
          'You convert a trucking carrier\'s free-text hiring requirements into strict structured JSON for a driver-matching engine. ' +
          'Interpret phrases like "no more than 1 in the past 3 years" => 1, "none in a lifetime" => 0, "at least 23 years of age" => 23. ' +
          'Omit anything not stated. Return ONLY JSON.',
        messages: [{
          role: 'user',
          content:
            `Carrier requirements (free text):\n${JSON.stringify(form, null, 2)}\n\n` +
            'Return JSON with this shape (omit unknown fields):\n' +
            '{ "eligibility": { "minAge": n }, "cdl": { "class":"A|B|C", "endorsements":["H","N","T","X","P","S"], "minExperienceYears": n }, ' +
            '"mvr": { "maxMovingViolations": n, "maxAccidents": n, "maxDUI": n } }',
        }],
      });
      return { requirements: out, source: 'ai' };
    } catch {
      // fall through to deterministic parsing
    }
  }
  return { requirements: parseDeterministic(form), source: 'heuristic' };
}

// ── Deterministic best-effort parser ─────────────────────────────────────────
const firstInt = (s) => { const m = String(s || '').match(/\d+/); return m ? Number(m[0]) : undefined; };

// Parse a "maximum allowed count" phrase. Strips timeframe noise ("past 3 years")
// so "no accidents in the past 3 years" => 0, not 3.
function parseMax(text) {
  if (text == null || String(text).trim() === '') return undefined;
  const stripped = String(text).toLowerCase()
    .replace(/past\s+\d+/g, ' ')
    .replace(/\d+\s*(?:to\s*\d+\s*)?[-–]?\s*(?:year|yr|month|mo|day|week|wk)s?/g, ' ');
  const n = firstInt(stripped);
  if (n != null) return n;
  if (/\b(no|none|zero|never)\b/.test(stripped)) return 0;
  return undefined;
}

const isYes = (s) => /\b(yes|required|y)\b/i.test(String(s || '')) && !/\bno\b/i.test(String(s || ''));

function parseDeterministic(form = {}) {
  const reqs = {};
  const set = (obj, key, val) => { if (val !== undefined) { (reqs[obj] ||= {})[key] = val; } };

  set('eligibility', 'minAge', firstInt(form.minimumAge));
  set('cdl', 'minExperienceYears', firstInt(form.minimumExperience));
  set('mvr', 'maxMovingViolations', parseMax(form.maxMovingViolations));
  set('mvr', 'maxAccidents', parseMax(form.dotRecordableAccidents));
  set('mvr', 'maxDUI', parseMax(form.duiDwiPolicy));

  // Endorsements: hazmat + a few keyword-mapped extras.
  const endorsements = [];
  if (isYes(form.hazmatRequired)) endorsements.push('H');
  const other = String(form.otherEndorsements || '').toLowerCase();
  if (/tank/.test(other)) endorsements.push('N');
  if (/double|triple/.test(other)) endorsements.push('T');
  if (/passenger/.test(other)) endorsements.push('P');
  if (/school\s*bus/.test(other)) endorsements.push('S');
  if (endorsements.length) set('cdl', 'endorsements', [...new Set(endorsements)]);

  return reqs;
}
