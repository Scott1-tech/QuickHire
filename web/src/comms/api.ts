/* Thin client for the QuickHire integrations backend (FastAPI).
   The SPA stays optimistic/offline-capable: every call is best-effort and
   failures are swallowed, so the static preview works with local state while a
   deployment served by the real backend actually hits these endpoints. */
const BASE = '/api';

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = (typeof window !== 'undefined' && ((window as any).__QH_ADMIN_TOKEN || window.localStorage?.getItem('qh_admin_token'))) || '';
  if (t) h['X-Admin-Token'] = t;
  return h;
}
async function req(method: string, path: string, body?: any): Promise<any> {
  const r = await fetch(BASE + path, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}`);
  return r.json();
}

export const api = {
  rcStatus: () => req('GET', '/ringcentral/status'),
  rcNumbers: () => req('GET', '/ringcentral/numbers'),
  patchNumber: (id: string, p: any) => req('PATCH', `/ringcentral/numbers/${id}/settings`, p),
  testSms: (to: string) => req('POST', '/ringcentral/test-sms', { to }),
  driverSms: (id: string, b: any) => req('POST', `/drivers/${id}/sms`, b),
  driverCall: (id: string, b: any) => req('POST', `/drivers/${id}/call-log`, b),
  driverEmail: (id: string, b: any) => req('POST', `/drivers/${id}/email`, b),
  emailStatus: () => req('GET', '/email/status'),
  inboxes: () => req('GET', '/email/inboxes'),
  patchInbox: (id: string, p: any) => req('PATCH', `/email/inboxes/${id}/settings`, p),
  testEmail: (to: string) => req('POST', '/email/test-send', { to }),
  fmcsaStatus: () => req('GET', '/fmcsa/status'),
  fmcsaLookup: (dot = '', mc = '') => req('GET', `/fmcsa/lookup?dot=${encodeURIComponent(dot)}&mc=${encodeURIComponent(mc)}`),
  testLookup: () => req('POST', '/fmcsa/test-lookup'),
  watchlist: () => req('GET', '/fmcsa/watchlist'),
  addWatch: (s: any) => req('POST', '/fmcsa/watchlist', s),
  removeWatch: (id: string) => req('DELETE', `/fmcsa/watchlist/${id}`),
};

/** Probe whether the integrations backend is reachable (cached). */
let _avail: boolean | null = null;
export async function backendAvailable(): Promise<boolean> {
  if (_avail !== null) return _avail;
  try { await api.rcStatus(); _avail = true; } catch { _avail = false; }
  return _avail!;
}

/** fire-and-forget: run a backend call, swallow errors (offline/static preview). */
export function bg(p: Promise<any> | undefined) { if (p && typeof p.catch === 'function') p.catch(() => {}); }
