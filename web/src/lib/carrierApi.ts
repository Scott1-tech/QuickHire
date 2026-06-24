// Thin client for the carrier-requirements API on the Express backend.
// (Same origin in production; Vite proxies /api to :3000 in dev.)

export type FieldType = 'text' | 'area' | 'yesno';
export interface CarrierField { id: string; label: string; type: FieldType; placeholder?: string }
export interface CarrierSection { id: string; title: string; intro?: string; fields: CarrierField[] }

export type CarrierStatus = 'awaiting_carrier' | 'completed';
export interface CarrierSummary {
  id: string; name: string; ownerName: string; email: string; phone: string;
  status: CarrierStatus; filledBy: 'recruiter' | 'carrier' | null; mode: 'self' | 'invite';
  createdAt: string; updatedAt: string; submittedAt: string | null;
  linkSentCount: number; linkLastSentAt: string | null; linkLastStatus: string | null; linkExpiresAt: string | null;
  progress: { filled: number; total: number };
}
export interface CarrierActivity { id: string; type: string; by: string; at: string; note: string }
export interface CarrierRecord extends CarrierSummary {
  requirements: Record<string, string>;
  sections: CarrierSection[];
  activity: CarrierActivity[];
}
export interface DispatchResult {
  id?: string; status?: CarrierStatus; link: string | null;
  email: { sent: boolean; reason?: string } | null;
  sms: { sent: boolean; reason?: string } | null;
  anySuccess: boolean | null;
}

function headers(): HeadersInit {
  return { 'Content-Type': 'application/json', 'x-admin-token': localStorage.getItem('qh_admin') ?? '' };
}
async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status}).`);
  return data as T;
}

export const getCarrierForm = () =>
  fetch('/api/carrier-form').then((r) => json<{ sections: CarrierSection[] }>(r)).then((d) => d.sections);

export const listCarriers = () =>
  fetch('/api/carriers', { headers: headers() }).then((r) => json<CarrierSummary[]>(r));

export const getCarrier = (id: string) =>
  fetch(`/api/carriers/${id}`, { headers: headers() }).then((r) => json<CarrierRecord>(r));

export const createCarrier = (payload: {
  name: string; ownerName?: string; email?: string; phone?: string;
  mode: 'self' | 'invite'; requirements?: Record<string, string>;
}) => fetch('/api/carriers', { method: 'POST', headers: headers(), body: JSON.stringify(payload) }).then((r) => json<DispatchResult>(r));

export const updateCarrier = (id: string, payload: {
  name?: string; ownerName?: string; email?: string; phone?: string; requirements?: Record<string, string>;
}) => fetch(`/api/carriers/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(payload) })
  .then((r) => json<{ ok: boolean; status: CarrierStatus; progress: { filled: number; total: number } }>(r));

export const resendCarrier = (id: string, payload: { email?: string; phone?: string }) =>
  fetch(`/api/carriers/${id}/resend`, { method: 'POST', headers: headers(), body: JSON.stringify(payload) })
    .then((r) => json<DispatchResult>(r));

export const deleteCarrier = (id: string) =>
  fetch(`/api/carriers/${id}`, { method: 'DELETE', headers: headers() }).then((r) => json<{ ok: boolean }>(r));

// Friendly status label + pill kind for the existing <Pill> component.
export function statusMeta(status: CarrierStatus, filledBy: string | null) {
  if (status === 'completed') return { label: filledBy === 'carrier' ? 'Completed by carrier' : 'Completed', kind: 'active' };
  return { label: 'Awaiting carrier', kind: 'pending' };
}

// ── Send-the-link helpers ─────────────────────────────────────────────────────
// Let the recruiter send the intake link from their own email/SMS app — works
// even when no server-side email provider (Resend/SMTP) is configured.
export const inviteSubject = (name: string) => `Carrier requirements — ${name || 'your company'}`;
export function inviteBody(name: string, ownerName: string, link: string) {
  const who = (ownerName || '').trim().split(/\s+/)[0] || 'there';
  return `Hi ${who},\n\n`
    + `Please complete your carrier requirements for ${name || 'your company'} here:\n${link}\n\n`
    + `It only takes a few minutes — just fill in what applies. Thank you!`;
}
export const mailtoHref = (email: string, subject: string, body: string) =>
  `mailto:${email.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
export const smsHref = (phone: string, body: string) =>
  `sms:${phone.trim()}?&body=${encodeURIComponent(body)}`;
