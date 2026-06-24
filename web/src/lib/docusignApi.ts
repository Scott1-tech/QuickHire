// Thin client for the DocuSign e-signature API on the Express backend
// (docusign/ module). Same origin in production; Vite proxies /api in dev.

export type EnvelopeStatus = 'created' | 'sent' | 'delivered' | 'completed' | 'declined' | 'voided';

export interface Signer { name: string; email: string; status?: string; signedAt?: string | null }
export interface Envelope {
  envelopeId: string;
  status: EnvelopeStatus;
  simulated: boolean;
  docType: string;
  documentName: string;
  emailSubject?: string;
  embedded?: boolean;
  signer: Signer;
  createdAt: string;
  sentAt?: string | null;
  completedAt?: string | null;
  voidedAt?: string | null;
  voidedReason?: string | null;
  candidateId?: string;
  candidateName?: string;
}
export interface DocType { type: string; label: string; description: string }
export interface DocusignStatus {
  configured: boolean; mode: 'live' | 'simulated'; accountId: string | null;
  apiBase: string; hasWebhookSecret: boolean; documents: DocType[];
}
export interface PreviewField { key: string; label: string; value: string; required: boolean }
export interface PreviewResult { docType: string; label: string; html: string; fields: PreviewField[]; missing: string[] }
export interface CandidateLite { id: string; name: string; email: string; phone?: string; stage?: string; submittedAt?: string | null }

function headers(): HeadersInit {
  return { 'Content-Type': 'application/json', 'x-admin-token': localStorage.getItem('qh_admin') ?? '' };
}
async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status}).`);
  return data as T;
}

export const getDocusignStatus = () =>
  fetch('/api/docusign/status', { headers: headers() }).then((r) => json<DocusignStatus>(r));

export const listEnvelopes = () =>
  fetch('/api/docusign/envelopes', { headers: headers() }).then((r) => json<Envelope[]>(r));

export const listCandidates = () =>
  fetch('/api/candidates', { headers: headers() }).then((r) => json<CandidateLite[]>(r));

export const previewDoc = (candidateId: string, docType: string, fields: Record<string, string> = {}) =>
  fetch(`/api/docusign/candidates/${candidateId}/preview`, { method: 'POST', headers: headers(), body: JSON.stringify({ docType, fields }) })
    .then((r) => json<PreviewResult>(r));

export interface PlacedField {
  id: string; type: string; xPct: number; yPct: number; page: number;
  recipientId: string; label: string; required?: boolean; value?: string; readOnly?: boolean;
}
export interface Recipient { id: string; name: string; email: string; colorIdx: number }

export const sendDoc = (candidateId: string, payload: {
  docType: string; fields?: Record<string, string>; embedded?: boolean;
  emailSubject?: string; message?: string; recipients?: Recipient[]; placedFields?: PlacedField[];
}) =>
  fetch(`/api/docusign/candidates/${candidateId}/send`, { method: 'POST', headers: headers(), body: JSON.stringify(payload) })
    .then((r) => json<Envelope>(r));

export const refreshEnvelope = (envelopeId: string) =>
  fetch(`/api/docusign/envelopes/${envelopeId}/refresh`, { method: 'POST', headers: headers() }).then((r) => json<Envelope>(r));

export const signingUrl = (envelopeId: string) =>
  fetch(`/api/docusign/envelopes/${envelopeId}/signing-url`, { headers: headers() }).then((r) => json<{ url: string; simulated: boolean }>(r));

export const voidEnvelope = (envelopeId: string, reason: string) =>
  fetch(`/api/docusign/envelopes/${envelopeId}/void`, { method: 'POST', headers: headers(), body: JSON.stringify({ reason }) }).then((r) => json<Envelope>(r));

export const simulateComplete = (envelopeId: string) =>
  fetch(`/api/docusign/envelopes/${envelopeId}/simulate`, { method: 'POST', headers: headers(), body: JSON.stringify({ status: 'completed' }) }).then((r) => json<Envelope>(r));

export const docHtmlUrl = (envelopeId: string) => `/api/docusign/envelopes/${envelopeId}/document.html`;
export const docPdfUrl = (envelopeId: string) => `/api/docusign/envelopes/${envelopeId}/document`;

// Map an envelope status to a <Pill> kind + label for the existing UI component.
export function statusMeta(e: Envelope): { label: string; kind: string } {
  switch (e.status) {
    case 'completed': return { label: 'Completed', kind: 'active' };
    case 'voided': return { label: 'Voided', kind: 'inactive' };
    case 'declined': return { label: 'Declined', kind: 'missing' };
    case 'sent':
    case 'delivered': return { label: e.embedded ? 'Need to sign' : `Waiting for ${e.signer?.name || 'signer'}`, kind: 'pending' };
    default: return { label: e.status, kind: 'not_started' };
  }
}
