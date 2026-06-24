// docusign/config.js
// ─────────────────────────────────────────────────────────────────────────────
// DocuSign eSignature configuration, read from the environment.
//
// Like QuickHire's other integrations (Resend, Twilio, MVR/PSP/Clearinghouse),
// DocuSign runs in one of two modes:
//   • LIVE       — all required credentials are present → real JWT-authenticated
//                  calls to the DocuSign eSignature REST API.
//   • SIMULATED  — credentials missing → envelopes are fabricated locally and
//                  clearly flagged `simulated:true`, so the whole send → sign →
//                  complete flow is demonstrable in dev with no DocuSign account.
//
// Auth uses the JWT Grant flow (server-to-server, no human in the loop), which
// is the right fit for a backend that sends offer letters automatically.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';

/** Read the RSA private key from an env var (inline PEM) or a file path. */
function readPrivateKey() {
  const inline = process.env.DOCUSIGN_PRIVATE_KEY || '';
  if (inline.trim()) {
    // Env vars often carry the PEM with literal "\n" instead of real newlines.
    return inline.includes('\\n') ? inline.replace(/\\n/g, '\n') : inline;
  }
  const keyPath = process.env.DOCUSIGN_PRIVATE_KEY_PATH || '';
  if (keyPath) {
    try { return fs.readFileSync(keyPath, 'utf8'); } catch { return ''; }
  }
  return '';
}

const oauthBase = (process.env.DOCUSIGN_OAUTH_BASE || 'account-d.docusign.com')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');

export const config = {
  // OAuth / identity
  integrationKey: process.env.DOCUSIGN_INTEGRATION_KEY || '', // a.k.a. client_id
  userId: process.env.DOCUSIGN_USER_ID || '',                 // GUID of the impersonated user
  accountId: process.env.DOCUSIGN_ACCOUNT_ID || '',           // API account GUID
  privateKey: readPrivateKey(),

  // Endpoints — defaults target the DocuSign Demo (sandbox) environment.
  //   Demo: account-d.docusign.com  +  https://demo.docusign.net
  //   Prod: account.docusign.com    +  https://<region>.docusign.net
  oauthBase,
  apiBase: (process.env.DOCUSIGN_API_BASE || 'https://demo.docusign.net').replace(/\/$/, ''),
  scopes: process.env.DOCUSIGN_SCOPES || 'signature impersonation',

  // Optional behavior
  brandId: process.env.DOCUSIGN_BRAND_ID || '',
  webhookSecret: process.env.DOCUSIGN_WEBHOOK_SECRET || '',   // HMAC key for Connect
  returnUrl: process.env.DOCUSIGN_RETURN_URL || '',           // embedded-signing redirect
};

/** All four credentials present → we can authenticate and call the real API. */
export function isConfigured() {
  return Boolean(config.integrationKey && config.userId && config.accountId && config.privateKey);
}

/** 'live' when fully configured, otherwise 'simulated'. */
export function mode() {
  return isConfigured() ? 'live' : 'simulated';
}

/** Base path for account-scoped REST calls: {apiBase}/restapi/v2.1/accounts/{accountId} */
export function accountBasePath() {
  return `${config.apiBase}/restapi/v2.1/accounts/${config.accountId}`;
}
