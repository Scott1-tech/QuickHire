// anna/normalize.js
// ─────────────────────────────────────────────────────────────────────────────
// Turning messy input into a structured DriverProfile.
//
// Two jobs:
//   1. normalizeDriver()      — map a raw lead (varied ad-source fields, free
//                               text) onto Anna's structured DriverProfile.
//   2. extractFromDocument()  — read a license / medical card / cert image|PDF
//                               and pull the fields needed to auto-fill the
//                               application (Stage 2).
//
// Both prefer Claude when ANTHROPIC_API_KEY is set, and fall back to a
// deterministic passthrough so the module is usable (and unit-testable) without
// an API key. Every LLM-extracted field carries a confidence; low-confidence
// fields are surfaced for human/driver confirmation rather than trusted blindly.
// ─────────────────────────────────────────────────────────────────────────────

import { callClaudeJSON, documentBlock, MODELS, annaConfigured } from './claude.js';

// The canonical shape the matcher consumes. Documented here as the contract.
export const DRIVER_SHAPE = {
  name: 'string', age: 'number', phone: 'string', email: 'string',
  cdl: { class: 'A|B|C', endorsements: ['H', 'N', 'T', 'X', 'P', 'S'], experienceYears: 'number', type: 'company|owner-operator', expiresInDays: 'number' },
  mvr: { movingViolations: 'number', accidents: 'number', dui: 'number' },
  psp: { crashes: 'number', oosInspections: 'number' },
  insurance: { autoLiability: 'number', hasCargo: 'boolean', cargo: 'number' },
};

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : undefined);

/**
 * Normalize a raw lead into a DriverProfile.
 * @param {Object} lead  Arbitrary lead payload (FB/TikTok/form fields, free text).
 * @param {Object} [opts] { apiKey, model }
 * @returns {Promise<{ profile, confidence, source }>}
 */
export async function normalizeDriver(lead = {}, opts = {}) {
  if (annaConfigured(opts.apiKey)) {
    try {
      const out = await callClaudeJSON({
        apiKey: opts.apiKey,
        model: opts.model || MODELS.fast,
        maxTokens: 1024,
        system:
          'You normalize raw truck-driver lead data into a strict JSON DriverProfile for an FMCSA driver-qualification system. ' +
          'Infer numeric fields from free text (e.g. "drove for Swift 2018-2021" => experienceYears 3). ' +
          'Never invent data: if a field is unknown, omit it. Return ONLY JSON.',
        messages: [{
          role: 'user',
          content:
            `Raw lead:\n${JSON.stringify(lead, null, 2)}\n\n` +
            'Return JSON: { "profile": <DriverProfile>, "confidence": { "<dot.path>": 0..1 } }. ' +
            `DriverProfile shape: ${JSON.stringify(DRIVER_SHAPE)}.`,
        }],
      });
      return { profile: coerce(out.profile || {}), confidence: out.confidence || {}, source: 'ai' };
    } catch (e) {
      // Fall through to deterministic mapping; never block intake on an API error.
    }
  }
  return { profile: deterministicMap(lead), confidence: {}, source: 'heuristic' };
}

/**
 * Extract structured fields from a document for application auto-fill.
 * @param {Object} p { dataUrl|base64+mediaType, docType, apiKey, model }
 * @returns {Promise<{ fields, confidence, warnings }>}
 */
export async function extractFromDocument(p = {}) {
  if (!annaConfigured(p.apiKey)) throw new Error('Document scanning requires ANTHROPIC_API_KEY');
  const docType = p.docType || 'document';
  const out = await callClaudeJSON({
    apiKey: p.apiKey,
    model: p.model || MODELS.fast,
    maxTokens: 1024,
    system:
      'You read US commercial driver documents (CDL, DOT medical card, certificates) and extract fields for an application. ' +
      'Report a confidence 0..1 per field. Flag expired documents and unreadable fields in "warnings". Return ONLY JSON.',
    messages: [{
      role: 'user',
      content: [
        documentBlock(p),
        { type: 'text', text:
          `This is a "${docType}". Extract relevant fields (e.g. for a CDL: fullName, licenseNumber, state, class, endorsements[], issueDate, expirationDate). ` +
          'Return JSON: { "fields": {...}, "confidence": {"<field>":0..1}, "warnings": ["..."] }.' },
      ],
    }],
  });
  return { fields: out.fields || {}, confidence: out.confidence || {}, warnings: out.warnings || [] };
}

/** Fields that should be human-confirmed (below threshold) before auto-advancing. */
export function lowConfidenceFields(confidence = {}, threshold = 0.75) {
  return Object.entries(confidence).filter(([, c]) => Number(c) < threshold).map(([k]) => k);
}

// ── Deterministic fallback: copy known fields straight through, coerce types. ──
function deterministicMap(lead) {
  // Accept either an already-nested profile or a flat lead with matching keys.
  if (lead.cdl || lead.mvr || lead.psp || lead.insurance) return coerce(lead);
  return coerce({
    name: lead.name, age: lead.age, phone: lead.phone, email: lead.email,
    cdl: { class: lead.cdlClass, endorsements: lead.endorsements, experienceYears: lead.experienceYears, type: lead.driverType, expiresInDays: lead.cdlExpiresInDays },
    mvr: { movingViolations: lead.movingViolations, accidents: lead.accidents, dui: lead.dui },
    psp: { crashes: lead.crashes, oosInspections: lead.oosInspections },
    insurance: { autoLiability: lead.autoLiability, hasCargo: lead.hasCargo, cargo: lead.cargo },
  });
}

// Coerce numeric fields and drop empties so the matcher sees clean data.
function coerce(p = {}) {
  const out = { ...p };
  if (p.age != null) out.age = num(p.age);
  out.cdl = clean({ ...p.cdl, experienceYears: num(p.cdl?.experienceYears), expiresInDays: num(p.cdl?.expiresInDays), class: p.cdl?.class ? String(p.cdl.class).toUpperCase() : undefined });
  out.mvr = clean({ movingViolations: num(p.mvr?.movingViolations), accidents: num(p.mvr?.accidents), dui: num(p.mvr?.dui) });
  out.psp = clean({ crashes: num(p.psp?.crashes), oosInspections: num(p.psp?.oosInspections) });
  out.insurance = clean({ autoLiability: num(p.insurance?.autoLiability), hasCargo: p.insurance?.hasCargo, cargo: num(p.insurance?.cargo) });
  return out;
}

function clean(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') out[k] = v;
  return out;
}
