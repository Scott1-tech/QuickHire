// docusign/envelopes.js
// ─────────────────────────────────────────────────────────────────────────────
// Low-level wrappers around the DocuSign Envelopes API. Every function here
// makes a REAL authenticated call and assumes DocuSign is configured — the
// live/simulated decision lives one level up in index.js.
//
// Envelope status lifecycle:
//   created → sent → delivered → completed   (or declined / voided)
// ─────────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client.js';

/**
 * Create and (when status:'sent') immediately send an envelope.
 * @param {object} envelopeDefinition  full DocuSign envelope JSON.
 * @returns {Promise<{envelopeId, status, statusDateTime, uri}>}
 */
export function createEnvelope(envelopeDefinition) {
  return apiFetch('/envelopes', { method: 'POST', body: envelopeDefinition });
}

/** Fetch an envelope's current status. */
export function getEnvelope(envelopeId) {
  return apiFetch(`/envelopes/${envelopeId}`, { method: 'GET' });
}

/** Fetch per-recipient status (who has signed, who's pending). */
export function getRecipients(envelopeId) {
  return apiFetch(`/envelopes/${envelopeId}/recipients`, { method: 'GET' });
}

/** Void an in-flight envelope (cannot void a completed one). */
export function voidEnvelope(envelopeId, voidedReason) {
  return apiFetch(`/envelopes/${envelopeId}`, { method: 'PUT', body: { status: 'voided', voidedReason } });
}

/**
 * Download the combined PDF of all documents in an envelope (signed, if complete).
 * @returns {Promise<Buffer>}
 */
export async function downloadCombined(envelopeId) {
  const res = await apiFetch(`/envelopes/${envelopeId}/documents/combined`, { method: 'GET', headers: { accept: 'application/pdf' } }, true);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * List envelopes changed since a given time (used to reconcile status in bulk).
 * @param {string} fromDate  ISO date string.
 */
export function listStatusChanges(fromDate) {
  return apiFetch(`/envelopes?from_date=${encodeURIComponent(fromDate)}`, { method: 'GET' });
}
