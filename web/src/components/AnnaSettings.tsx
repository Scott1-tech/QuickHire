import { useEffect, useState } from 'react';

// Anna AI settings: paste an Anthropic API key to enable real Claude-powered
// answers, summaries, and matching. The key is stored server-side (never shown
// back), so this just reflects status + lets you set / test / remove it.

type Settings = { configured: boolean; source: 'ui' | 'env' | null; keyHint: string | null; model?: string; integrations?: Record<string, string> };

const headers = () => ({ 'Content-Type': 'application/json', 'x-admin-token': localStorage.getItem('qh_admin') ?? '' });

export default function AnnaSettings() {
  const [st, setSt] = useState<Settings | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => { try { setSt(await (await fetch('/api/anna/settings', { headers: headers() })).json()); } catch { /* ignore */ } };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!key.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/anna/settings', { method: 'POST', headers: headers(), body: JSON.stringify({ apiKey: key.trim() }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Save failed');
      setKey('');
      setMsg({ ok: true, text: 'Saved. Testing connection…' });
      await load();
      await test();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/anna/settings/test', { method: 'POST', headers: headers(), body: JSON.stringify({}) });
      const d = await res.json();
      setMsg({ ok: !!d.ok, text: d.ok ? (d.message || 'Connection successful — Anna is live.') : (d.error || 'Test failed') });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm('Remove the saved API key? Anna will fall back to deterministic mode.')) return;
    setBusy(true); setMsg(null);
    try { await fetch('/api/anna/settings', { method: 'DELETE', headers: headers() }); await load(); setMsg({ ok: true, text: 'Key removed.' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-7 h-7 grid place-items-center rounded-full bg-primary-light text-primary">🤖</span>
        <div className="text-base font-bold text-ink">Anna AI</div>
      </div>
      <p className="text-[13px] text-muted mb-4">Connect a Claude (Anthropic) API key to enable Anna's free-form answers, record summaries, document scanning, and AI-written compliance notes. Without a key, Anna still runs in deterministic mode (matching, tasks, navigation).</p>

      {/* Status */}
      <div className="border border-line rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-ink">Status</div>
          {st?.configured
            ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#16A34A]">Live{st.source === 'env' ? ' (env)' : ''}</span>
            : <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#B45309]">Deterministic mode</span>}
        </div>
        {st?.keyHint && <div className="text-[12px] text-muted mt-1">Key: <code>{st.keyHint}</code> · model <code>{st.model}</code></div>}
        {st?.source === 'ui' && <button onClick={remove} disabled={busy} className="mt-2 text-[12px] text-danger font-semibold">Remove key</button>}
      </div>

      {/* Set key */}
      <label className="field-label">Anthropic API key</label>
      <div className="flex gap-2">
        <input value={key} onChange={(e) => setKey(e.target.value)} type="password" placeholder="sk-ant-…" className="input flex-1" />
        <button onClick={save} disabled={busy || !key.trim()} className="btn-primary disabled:opacity-50">{busy ? '…' : 'Save'}</button>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <button onClick={test} disabled={busy || !st?.configured} className="btn-ghost text-[12px] disabled:opacity-40">Test connection</button>
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-[12px] text-primary underline">Get a key →</a>
      </div>
      {msg && <div className={`mt-3 text-sm rounded-lg p-2 ${msg.ok ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-[#FEF2F2] text-danger'}`}>{msg.ok ? '✓' : '⚠'} {msg.text}</div>}
      <p className="text-[11px] text-muted mt-3">The key is stored on your server and never shown back in full. Treat it like a password.</p>

      {/* Compliance providers */}
      {st?.integrations && (
        <div className="border-t border-line mt-5 pt-4">
          <div className="text-[12px] font-bold text-muted uppercase mb-2">Compliance providers</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(st.integrations).map(([k, v]) => (
              <span key={k} className={`text-[11px] px-2 py-0.5 rounded-full ${v === 'live' ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-[#F1F5F9] text-[#64748B]'}`}>{k}: {v}</span>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-2">MVR / PSP / Clearinghouse go “live” when their provider API keys are set as environment variables on the server.</p>
        </div>
      )}
    </div>
  );
}
