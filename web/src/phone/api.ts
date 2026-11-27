/* Backend client for in-app calling. Everything is best-effort: the phone works
   fully local-first and these calls only sync org config / call logs when the
   FastAPI backend is actually serving the SPA.

   We only talk to the backend when there is evidence it exists — the backend's
   SPA route sets a `qh_backend=1` cookie, an admin token is present, or an
   earlier call succeeded — so a static preview never fires failing requests. */

const OK_FLAG = 'qh_phone_backend';

function token(): string {
  if (typeof window === 'undefined') return '';
  try { return (window as any).__QH_ADMIN_TOKEN || localStorage.getItem('qh_admin_token') || localStorage.getItem('qh_admin') || ''; } catch { return ''; }
}

export function backendLikely(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (/(?:^|;\s*)qh_backend=1(?:;|$)/.test(document.cookie || '')) return true;
    if (token()) return true;
    return localStorage.getItem(OK_FLAG) === '1';
  } catch { return false; }
}
function markOk() { try { localStorage.setItem(OK_FLAG, '1'); } catch { /* storage blocked */ } }

async function req(method: string, path: string, body?: unknown): Promise<any> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = token(); if (t) h['X-Admin-Token'] = t;
  const r = await fetch('/api' + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}`);
  markOk();
  return r.json();
}

export type EmbedConfig = { clientId: string; mode: 'browser' | 'ringout'; callerId: string; updatedAt?: string | null };

export const phoneApi = {
  getEmbedConfig: (): Promise<EmbedConfig> => req('GET', '/ringcentral/embed-config'),
  putEmbedConfig: (c: EmbedConfig): Promise<EmbedConfig> => req('PUT', '/ringcentral/embed-config', c),
  logCall: (recordId: string, body: Record<string, unknown>) => req('POST', `/drivers/${encodeURIComponent(recordId)}/call-log`, body),
};
