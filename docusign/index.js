// docusign/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Public façade for the DocuSign integration — the only file server.js imports.
//
// It decides LIVE vs SIMULATED per call, normalizes every result into one stable
// envelope record shape (so the data store and frontend never care which mode
// produced it), and exposes a small high-level API:
//
//   status()            → integration status for /api/config
//   send(opts)          → build + send a document for e-signature
//   refresh(env)        → re-poll an envelope's status (live) / passthrough (sim)
//   recipientView(env)  → embedded-signing URL (live) / mock URL (sim)
//   download(env)       → completed PDF bytes (live) / generated PDF (sim)
//   templates()         → account templates (live) / [] (sim)
//   simulateAdvance()   → move a simulated envelope to a new status (sim only)
//   handleWebhook()     → verify + parse a Connect callback
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { config, isConfigured, mode } from './config.js';
import { consentUrl } from './client.js';
import * as env from './envelopes.js';
import * as templatesApi from './templates.js';
import * as embedded from './embeddedSigning.js';
import * as webhooks from './webhooks.js';
import { DOC_TEMPLATES, DATA_FIELDS, documentCatalog, buildDocumentHtml, htmlDocument, buildSignerTabs, driverProfile, missingFields, simplePdf } from './documents.js';

const nowIso = () => new Date().toISOString();

export { isConfigured, mode, consentUrl, documentCatalog, driverProfile, DATA_FIELDS, DOC_TEMPLATES };

/**
 * Preview the auto-filled contract before sending — used by the console so the
 * recruiter (and ultimately the driver) can see every field pre-populated from
 * the driver's existing QuickHire data.
 * @returns {{docType,label,html,profile,fields,missing}}
 */
export function preview({ candidate, docType, fields = {} }) {
  if (!DOC_TEMPLATES[docType]) throw new Error(`Unknown document type "${docType}".`);
  const profile = driverProfile(candidate);
  return {
    docType,
    label: DOC_TEMPLATES[docType].label,
    html: buildDocumentHtml(docType, candidate, fields, { simulated: true }),
    profile,
    fields: DATA_FIELDS.map((f) => ({ key: f.key, label: f.label, value: profile[f.key] || '', required: Boolean(f.required) })),
    missing: missingFields(profile),
  };
}

/** Integration status, surfaced on /api/config (parallels anna.integrationStatus()). */
export function status() {
  return {
    configured: isConfigured(),
    mode: mode(),
    accountId: config.accountId || null,
    apiBase: config.apiBase,
    hasWebhookSecret: Boolean(config.webhookSecret),
    documents: documentCatalog(),
  };
}

/** Build a fresh normalized envelope record. */
function normalize(partial) {
  return {
    envelopeId: partial.envelopeId,
    status: partial.status || 'sent',
    mode: partial.simulated ? 'simulated' : 'live',
    simulated: Boolean(partial.simulated),
    docType: partial.docType || null,
    documentName: partial.documentName || null,
    emailSubject: partial.emailSubject || null,
    message: partial.message || null,
    embedded: Boolean(partial.embedded),
    returnUrl: partial.returnUrl || null,
    signer: partial.signer,
    documentHtml: partial.documentHtml || null,
    createdAt: partial.createdAt || nowIso(),
    sentAt: partial.sentAt || nowIso(),
    deliveredAt: partial.deliveredAt || null,
    completedAt: partial.completedAt || null,
    declinedAt: partial.declinedAt || null,
    voidedAt: partial.voidedAt || null,
    voidedReason: partial.voidedReason || null,
    statusHistory: partial.statusHistory || [{ status: partial.status || 'sent', at: nowIso() }],
  };
}

function pushStatus(record, status, extra = {}) {
  if (record.status !== status) record.statusHistory.push({ status, at: nowIso(), ...extra });
  record.status = status;
  if (status === 'delivered') record.deliveredAt = record.deliveredAt || nowIso();
  if (status === 'completed') record.completedAt = record.completedAt || nowIso();
  if (status === 'declined') record.declinedAt = record.declinedAt || nowIso();
  if (status === 'voided') record.voidedAt = record.voidedAt || nowIso();
  return record;
}

/**
 * Send a QuickHire document to a signer for e-signature.
 * @param {object} p
 * @param {object} p.candidate        QuickHire candidate (for name/email + doc content).
 * @param {string} p.docType          key of DOC_TEMPLATES (e.g. 'offer_letter').
 * @param {object} [p.fields]         document-specific details (position, payRate, …).
 * @param {object} [p.signer]         { name, email } — defaults to the candidate.
 * @param {boolean} [p.embedded]      true → embedded/captive signing (no email).
 * @param {string} [p.returnUrl]      embedded-signing redirect target.
 * @param {string} [p.emailSubject]
 * @param {string} [p.message]
 * @returns {Promise<object>} normalized envelope record.
 */
export async function send({ candidate, docType, fields = {}, signer, embedded: useEmbedded = false, returnUrl, emailSubject, message }) {
  if (!DOC_TEMPLATES[docType]) throw new Error(`Unknown document type "${docType}".`);
  const who = {
    name: signer?.name || candidate?.name,
    email: signer?.email || candidate?.email,
  };
  if (!who.name || !who.email) throw new Error('Signer name and email are required.');

  const label = DOC_TEMPLATES[docType].label;
  const subject = emailSubject || `Please sign: ${label} — ${process.env.COMPANY_NAME || 'QuickHire'}`;
  const profile = driverProfile(candidate || who);
  // Two renders of the same contract: anchors-only for DocuSign (its editable
  // prefilled tabs supply the values) and values-inline for storage/preview.
  const liveHtml = buildDocumentHtml(docType, candidate || who, fields, { simulated: false });
  const previewHtml = buildDocumentHtml(docType, candidate || who, fields, { simulated: true });
  const documentName = `${label}.pdf`;
  // Captive signers are keyed by a stable clientUserId so we can later open their view.
  const clientUserId = useEmbedded ? (candidate?.id || crypto.createHash('sha1').update(who.email).digest('hex').slice(0, 16)) : undefined;

  const signerRecord = {
    name: who.name,
    email: who.email,
    recipientId: '1',
    clientUserId: clientUserId || null,
    status: 'sent',
    signedAt: null,
  };

  // ── LIVE ───────────────────────────────────────────────────────────────────
  if (isConfigured()) {
    const definition = {
      emailSubject: subject,
      emailBlurb: message || undefined,
      status: 'sent',
      documents: [htmlDocument({ name: documentName, html: liveHtml, documentId: '1' })],
      recipients: {
        signers: [{
          email: who.email,
          name: who.name,
          recipientId: '1',
          routingOrder: '1',
          ...(clientUserId ? { clientUserId } : {}),
          tabs: buildSignerTabs(profile),
        }],
      },
      ...(config.brandId ? { brandId: config.brandId } : {}),
    };
    const created = await env.createEnvelope(definition);
    return normalize({
      envelopeId: created.envelopeId,
      status: created.status || 'sent',
      simulated: false,
      docType, documentName, emailSubject: subject, message,
      embedded: useEmbedded, returnUrl,
      signer: signerRecord,
      documentHtml: previewHtml,
    });
  }

  // ── SIMULATED ────────────────────────────────────────────────────────────────
  return normalize({
    envelopeId: `sim-${crypto.randomUUID()}`,
    status: 'sent',
    simulated: true,
    docType, documentName, emailSubject: subject, message,
    embedded: useEmbedded, returnUrl,
    signer: signerRecord,
    documentHtml: previewHtml,
  });
}

/** Re-poll a live envelope's status; simulated records pass through unchanged. */
export async function refresh(record) {
  if (record.simulated) return record;
  const live = await env.getEnvelope(record.envelopeId);
  const next = { ...record };
  pushStatus(next, String(live.status || record.status).toLowerCase());
  try {
    const r = await env.getRecipients(record.envelopeId);
    const signer = (r.signers || [])[0];
    if (signer) {
      next.signer = { ...next.signer, status: signer.status, signedAt: signer.signedDateTime || next.signer.signedAt };
    }
  } catch { /* recipients are best-effort */ }
  return next;
}

/**
 * Embedded-signing URL. Live → DocuSign recipient view; simulated → a local mock
 * signing URL the console can open to drive the demo flow.
 */
export async function recipientView(record, { returnUrl } = {}) {
  const ret = returnUrl || record.returnUrl || config.returnUrl || 'https://www.docusign.com';
  if (record.simulated) {
    return { url: `/docusign-sign.html?envelopeId=${encodeURIComponent(record.envelopeId)}`, simulated: true, returnUrl: ret };
  }
  const view = await embedded.createRecipientView({
    envelopeId: record.envelopeId,
    returnUrl: ret,
    email: record.signer.email,
    userName: record.signer.name,
    clientUserId: record.signer.clientUserId,
    recipientId: record.signer.recipientId || '1',
  });
  return { url: view.url, simulated: false, returnUrl: ret };
}

/** Completed-document bytes. Live → combined PDF; simulated → a generated PDF. */
export async function download(record) {
  const filename = (record.documentName || 'document.pdf').replace(/[^\w.-]+/g, '_');
  if (record.simulated) {
    const signed = record.status === 'completed';
    const buffer = simplePdf(DOC_TEMPLATES[record.docType]?.label || 'Document', [
      `Signer: ${record.signer?.name || ''} <${record.signer?.email || ''}>`,
      `Envelope: ${record.envelopeId}`,
      `Status: ${record.status}${signed ? ` (signed ${record.completedAt})` : ''}`,
      '',
      'This is a SIMULATED DocuSign document generated by QuickHire because',
      'DocuSign credentials are not configured. Configure DOCUSIGN_* env vars',
      'for real, legally-binding e-signatures.',
    ]);
    return { buffer, filename, contentType: 'application/pdf' };
  }
  const buffer = await env.downloadCombined(record.envelopeId);
  return { buffer, filename, contentType: 'application/pdf' };
}

/** List account templates (live only). */
export async function templates() {
  if (!isConfigured()) return { simulated: true, templates: [] };
  const data = await templatesApi.listTemplates();
  return { simulated: false, templates: (data.envelopeTemplates || []).map((t) => ({ templateId: t.templateId, name: t.name, shared: t.shared, description: t.description })) };
}

/** Void an envelope. Live → API call; simulated → local state change. */
export async function voidEnvelope(record, reason = 'Voided by recruiter') {
  if (!record.simulated) await env.voidEnvelope(record.envelopeId, reason);
  const next = { ...record, voidedReason: reason };
  return pushStatus(next, 'voided', { reason });
}

/**
 * Advance a SIMULATED envelope to a new status (drives the demo signing flow).
 * No-op for live envelopes (their status is owned by DocuSign).
 */
export function simulateAdvance(record, toStatus = 'completed') {
  if (!record.simulated) return record;
  const next = { ...record, signer: { ...record.signer } };
  if (toStatus === 'completed') {
    next.signer.status = 'completed';
    next.signer.signedAt = nowIso();
    pushStatus(next, 'delivered');
  }
  return pushStatus(next, toStatus);
}

/** Merge a parsed Connect event into an existing envelope record. */
export function applyWebhookEvent(record, event) {
  const next = { ...record, signer: { ...record.signer }, statusHistory: [...record.statusHistory] };
  if (event.completedAt) next.completedAt = event.completedAt;
  const sig = (event.recipients || [])[0];
  if (sig) {
    next.signer.status = sig.status || next.signer.status;
    next.signer.signedAt = sig.signedAt || next.signer.signedAt;
  }
  return pushStatus(next, (event.status || next.status).toLowerCase());
}

/** Verify + parse a Connect webhook. Returns { ok, event }. */
export function handleWebhook(rawBody, parsedBody, signatureHeader) {
  const ok = webhooks.verifySignature(rawBody, signatureHeader);
  if (!ok) return { ok: false, event: null };
  return { ok: true, event: webhooks.parseEvent(parsedBody) };
}
