// docusign/webhooks.js
// ─────────────────────────────────────────────────────────────────────────────
// DocuSign Connect (webhooks): DocuSign POSTs to your endpoint whenever an
// envelope's status changes, so you don't have to poll. This module verifies the
// payload's HMAC signature and normalizes it into a small, stable event shape.
//
// Configure in DocuSign Admin → Connect: point a custom configuration at
//   <PUBLIC_URL>/api/docusign/webhook
// with "Include HMAC Signature" enabled and the same secret as DOCUSIGN_WEBHOOK_SECRET.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { config } from './config.js';

/**
 * Verify a Connect HMAC signature (header: X-DocuSign-Signature-1).
 * Returns true when no secret is configured (verification disabled) so dev/sim
 * webhooks still flow; set DOCUSIGN_WEBHOOK_SECRET in production to enforce it.
 * @param {Buffer|string} rawBody  the EXACT bytes DocuSign sent.
 * @param {string} signatureHeader
 */
export function verifySignature(rawBody, signatureHeader) {
  if (!config.webhookSecret) return true;
  if (!signatureHeader) return false;
  const computed = crypto.createHmac('sha256', config.webhookSecret).update(rawBody).digest('base64');
  const a = Buffer.from(computed);
  const b = Buffer.from(String(signatureHeader));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Normalize a Connect payload into { envelopeId, status, recipients, raw }.
 * Supports both the modern JSON ("aggregate") shape and the simpler flat shape.
 */
export function parseEvent(body) {
  if (!body || typeof body !== 'object') return null;

  // Modern DocuSign Connect JSON: { event, data: { envelopeId, envelopeSummary: {...} } }
  if (body.data?.envelopeId || body.data?.envelopeSummary) {
    const summary = body.data.envelopeSummary || {};
    return {
      envelopeId: body.data.envelopeId || summary.envelopeId,
      status: (summary.status || body.event || '').toLowerCase().replace(/^envelope-/, ''),
      completedAt: summary.completedDateTime || null,
      recipients: (summary.recipients?.signers || []).map((s) => ({ email: s.email, name: s.name, status: s.status, signedAt: s.signedDateTime || null })),
      raw: body,
    };
  }

  // Flat shape: { envelopeId, status, ... }
  if (body.envelopeId) {
    return {
      envelopeId: body.envelopeId,
      status: String(body.status || '').toLowerCase(),
      completedAt: body.completedDateTime || body.completedAt || null,
      recipients: body.recipients || [],
      raw: body,
    };
  }
  return null;
}
