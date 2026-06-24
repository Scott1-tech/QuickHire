// docusign/embeddedSigning.js
// ─────────────────────────────────────────────────────────────────────────────
// Embedded ("captive") signing: instead of emailing the signer, you generate a
// one-time URL and host the signing ceremony inside your own app (e.g. an
// iframe in the QuickHire console).
//
// Requirement: the recipient must have been created WITH a `clientUserId` on the
// envelope, which marks them as a captive/embedded signer. index.js sets this
// automatically when a send requests `embedded:true`.
// ─────────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client.js';

/**
 * Create a recipient view (embedded signing) URL for one signer.
 * @param {object} p
 * @param {string} p.envelopeId
 * @param {string} p.returnUrl     where DocuSign redirects after signing.
 * @param {string} p.email
 * @param {string} p.userName
 * @param {string} p.clientUserId  must match the value used at envelope creation.
 * @param {string} [p.recipientId]
 * @returns {Promise<{url}>}  short-lived signing URL (valid a few minutes).
 */
export function createRecipientView({ envelopeId, returnUrl, email, userName, clientUserId, recipientId = '1' }) {
  return apiFetch(`/envelopes/${envelopeId}/views/recipient`, {
    method: 'POST',
    body: {
      returnUrl,
      authenticationMethod: 'none',
      email,
      userName,
      clientUserId,
      recipientId,
    },
  });
}

/**
 * Create a sender view URL (open the prepared envelope in the DocuSign editor).
 * @returns {Promise<{url}>}
 */
export function createSenderView({ envelopeId, returnUrl }) {
  return apiFetch(`/envelopes/${envelopeId}/views/sender`, { method: 'POST', body: { returnUrl } });
}
