// docusign/client.js
// ─────────────────────────────────────────────────────────────────────────────
// DocuSign authentication (JWT Grant) + a thin authenticated fetch helper.
//
// JWT Grant flow:
//   1. Build a JWT asserting "I am integration X impersonating user Y, and I
//      want the `signature impersonation` scopes."
//   2. RS256-sign it with the app's RSA private key.
//   3. POST it to /oauth/token → receive a short-lived access token (~1h).
//   4. Cache the token until just before expiry; reuse for every API call.
//
// One-time setup note: the impersonated user must have granted consent to the
// integration key (a single browser visit to the consent URL). After that, this
// server-to-server flow needs no human interaction.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { config, isConfigured, accountBasePath } from './config.js';

let cached = null; // { accessToken, expiresAt }

const b64url = (input) =>
  Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Build and RS256-sign the JWT assertion. */
function buildAssertion() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: config.integrationKey,
    sub: config.userId,
    aud: config.oauthBase,
    iat: now,
    exp: now + 3600,
    scope: config.scopes,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(config.privateKey);
  return `${signingInput}.${b64url(signature)}`;
}

/** The URL a DocuSign admin visits once to grant the integration consent. */
export function consentUrl(redirectUri = 'https://www.docusign.com') {
  const params = new URLSearchParams({
    response_type: 'code',
    scope: config.scopes,
    client_id: config.integrationKey,
    redirect_uri: redirectUri,
  });
  return `https://${config.oauthBase}/oauth/auth?${params}`;
}

/**
 * Return a valid access token, fetching a new one via JWT Grant when the cache
 * is empty or about to expire. Throws (with a helpful message) on failure.
 */
export async function getAccessToken() {
  if (!isConfigured()) throw new Error('DocuSign is not configured (missing integration key, user id, account id, or private key).');
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;

  const res = await fetch(`https://${config.oauthBase}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: buildAssertion(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // The classic first-run error: the user hasn't granted consent yet.
    if (data.error === 'consent_required') {
      throw new Error(`DocuSign consent required — grant it once at: ${consentUrl()}`);
    }
    throw new Error(`DocuSign token error ${res.status}: ${data.error || ''} ${data.error_description || ''}`.trim());
  }
  cached = { accessToken: data.access_token, expiresAt: Date.now() + (Number(data.expires_in || 3600) * 1000) };
  return cached.accessToken;
}

/** Clear the cached token (used by tests / after auth errors). */
export function resetToken() { cached = null; }

/**
 * Authenticated fetch against an account-scoped endpoint.
 * @param {string} pathAfterAccount  e.g. "/envelopes" or `/envelopes/${id}`
 * @param {object} [opts]            fetch options; JSON bodies are stringified.
 * @param {boolean} [raw]            when true, resolve with the Response (for binary downloads).
 */
export async function apiFetch(pathAfterAccount, opts = {}, raw = false) {
  const token = await getAccessToken();
  const headers = { authorization: `Bearer ${token}`, ...(opts.headers || {}) };
  let body = opts.body;
  if (body && typeof body === 'object' && !(body instanceof Buffer)) {
    headers['content-type'] = headers['content-type'] || 'application/json';
    body = JSON.stringify(body);
  }
  const res = await fetch(`${accountBasePath()}${pathAfterAccount}`, { ...opts, headers, body });
  if (raw) {
    if (!res.ok) throw new Error(`DocuSign API ${res.status} on ${pathAfterAccount}`);
    return res;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`DocuSign API ${res.status} on ${pathAfterAccount}: ${data.message || data.errorCode || ''}`.trim());
  }
  return data;
}
