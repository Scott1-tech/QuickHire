// docusign/templates.js
// ─────────────────────────────────────────────────────────────────────────────
// Wrappers around the DocuSign Templates API. Templates are reusable envelope
// definitions stored in your DocuSign account (documents + roles + tabs). You
// send one by supplying just the recipient who fills each role.
// ─────────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client.js';

/** List the account's templates. */
export function listTemplates() {
  return apiFetch('/templates', { method: 'GET' });
}

/** Fetch one template's full definition. */
export function getTemplate(templateId) {
  return apiFetch(`/templates/${templateId}`, { method: 'GET' });
}

/**
 * Create + send an envelope from a stored template by binding roles to signers.
 * @param {object} p
 * @param {string} p.templateId
 * @param {string} p.emailSubject
 * @param {Array<{roleName, name, email, clientUserId?}>} p.roles
 */
export function sendFromTemplate({ templateId, emailSubject, roles }) {
  return apiFetch('/envelopes', {
    method: 'POST',
    body: {
      templateId,
      emailSubject,
      status: 'sent',
      templateRoles: roles.map((r) => ({
        roleName: r.roleName,
        name: r.name,
        email: r.email,
        ...(r.clientUserId ? { clientUserId: r.clientUserId } : {}),
      })),
    },
  });
}
