/* Thin client for the Anna driver-qualification agent (FastAPI /api/anna/*).
   Every call is best-effort: in the static preview (no backend) calls fail and
   the workspace falls back to local demo data, so the UI always renders. */
const BASE = '/api';

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = (typeof window !== 'undefined' && ((window as any).__QH_ADMIN_TOKEN || window.localStorage?.getItem('qh_admin_token'))) || '';
  if (t) h['X-Admin-Token'] = t;
  return h;
}
async function req(method: string, path: string, body?: any): Promise<any> {
  const r = await fetch(BASE + path, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) {
    let detail = '';
    try { const j = await r.json(); detail = (j && (j.detail?.error || j.detail || j.error)) || ''; } catch { /* noop */ }
    throw new Error(detail || `${method} ${path} → ${r.status}`);
  }
  return r.json();
}

export const annaApi = {
  // Settings (AI provider + key)
  getSettings: () => req('GET', '/anna/settings'),
  setSettings: (b: { provider: string; apiKey: string; model?: string }) => req('POST', '/anna/settings', b),
  clearSettings: () => req('DELETE', '/anna/settings'),
  testSettings: (b: { provider?: string; apiKey?: string }) => req('POST', '/anna/settings/test', b),
  // Assistant
  chat: (messages: any[], context?: any) => req('POST', '/anna/chat', { messages, context: context || {} }),
  // Intake + matching
  scan: (dataUrl: string, docType?: string) => req('POST', '/anna/scan', { dataUrl, docType }),
  match: (lead: any, minScore = 0) => req('POST', '/anna/match', { lead, minScore }),
  leads: (lead: any, consent?: any, minScore = 0) => req('POST', '/anna/leads', { lead, consent, minScore }),
  // Portfolios
  portfolios: () => req('GET', '/anna/portfolios'),
  portfolio: (id: string) => req('GET', `/anna/portfolios/${id}`),
  selectCarrier: (id: string, carrierId: string, by = 'Recruiter') => req('POST', `/anna/portfolios/${id}/select-carrier`, { carrierId, by }),
  compliance: (id: string, records?: any) => req('POST', `/anna/portfolios/${id}/compliance`, { records: records || {} }),
  decision: (id: string, b: any) => req('POST', `/anna/portfolios/${id}/decision`, b),
  outcome: (id: string, status: string) => req('POST', `/anna/portfolios/${id}/outcome`, { status }),
  // Metrics + nudges
  metrics: () => req('GET', '/anna/metrics'),
  nudges: () => req('GET', '/anna/nudges'),
};

/** Probe whether the Anna backend is reachable (cached). */
let _avail: boolean | null = null;
export async function annaAvailable(): Promise<boolean> {
  if (_avail !== null) return _avail;
  try { await annaApi.getSettings(); _avail = true; } catch { _avail = false; }
  return _avail!;
}
