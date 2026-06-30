/* Best-effort sync layer for the e-sign workspace. The store is local-first
   (localStorage); these calls mirror actions to the existing /api/docusign/*
   backend when a real deployment is serving the SPA. Failures are swallowed so
   the static preview keeps working. */
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

export const esignApi = {
  status: () => req('GET', '/docusign/status'),
  envelopes: () => req('GET', '/docusign/envelopes'),
  create: (env: any) => req('POST', '/docusign/envelopes', env).catch(() => null),
  saveDraft: (id: string, env: any) => req('PATCH', `/docusign/envelopes/${id}`, env).catch(() => null),
  send: (id: string, env: any) => req('POST', `/docusign/envelopes/${id}/send`, env).catch(() => null),
  remind: (id: string) => req('POST', `/docusign/envelopes/${id}/remind`),
  void: (id: string, reason: string) => req('POST', `/docusign/envelopes/${id}/void`, { reason }),
  simulate: (id: string) => req('POST', `/docusign/envelopes/${id}/simulate`),
  createPackage: (p: any) => req('POST', '/docusign/packages', p).catch(() => null),
  updateSettings: (s: any) => req('PATCH', '/docusign/settings', s).catch(() => null),
};

/** fire-and-forget */
export function bg(p: Promise<any> | undefined) { if (p && typeof p.catch === 'function') p.catch(() => {}); }

let _avail: boolean | null = null;
export async function esignAvailable(): Promise<boolean> {
  if (_avail !== null) return _avail;
  try { await esignApi.status(); _avail = true; } catch { _avail = false; }
  return _avail!;
}
