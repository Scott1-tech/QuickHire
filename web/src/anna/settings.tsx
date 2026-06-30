import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon, Btn, useToasts, ToastHost } from '../tasks/lib';
import { annaApi } from './api';

const PROVIDERS = [
  { key: 'anthropic', label: 'Claude', sub: 'Anthropic · recommended', mark: 'C', bg: '#D97757' },
  { key: 'openai', label: 'OpenAI', sub: 'GPT-4o family', mark: 'AI', bg: '#10A37F' },
];

function Card({ children, style }: any) {
  return <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, ...style }}>{children}</div>;
}

/* Settings → Anna AI: connect the model provider that powers the agent. */
export function AnnaSettings() {
  const { toasts, toast } = useToasts();
  const [st, setSt] = React.useState<any>(null);
  const [provider, setProvider] = React.useState('anthropic');
  const [apiKey, setApiKey] = React.useState('');
  const [model, setModel] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    annaApi.getSettings().then((s) => { setSt(s); setProvider(s.provider || 'anthropic'); setModel(s.model || ''); })
      .catch(() => setSt({ configured: false, provider: 'anthropic', providers: ['anthropic', 'openai'], offline: true, integrations: {} }));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!apiKey.trim()) { toast('Enter an API key', 'error'); return; }
    setBusy(true);
    try { await annaApi.setSettings({ provider, apiKey: apiKey.trim(), model: model.trim() || undefined }); setApiKey(''); toast('Anna is connected', 'success'); load(); }
    catch (e: any) { toast(e?.message || 'Could not save key', 'error'); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try { const r = await annaApi.testSettings(apiKey.trim() ? { provider, apiKey: apiKey.trim() } : {}); toast(r.message || 'Connection successful', 'success'); }
    catch (e: any) { toast(e?.message || 'Connection failed', 'error'); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true);
    try { await annaApi.clearSettings(); toast('Disconnected', 'info'); load(); }
    catch { toast('Could not disconnect', 'error'); }
    finally { setBusy(false); }
  };

  const configured = st?.configured;
  const fromEnv = st?.source === 'env';

  return <div style={{ maxWidth: 820 }}>
    <ToastHost toasts={toasts} />
    <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Anna AI</h1>
    <p style={{ margin: '0 0 20px', fontSize: 14, color: T.muted }}>Connect the model that powers Anna — driver normalization, carrier matching narration, document scanning, and the in-app assistant.</p>

    {/* status */}
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#007AFF,#5856D6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="sparkles" size={20} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 650 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: configured ? '#34C759' : '#C7C7CC' }} />
            {configured ? `Connected · ${provider === 'openai' ? 'OpenAI' : 'Claude'}` : 'Not connected'}
          </div>
          <div style={{ fontSize: 12.5, color: T.faint, marginTop: 2 }}>{configured ? `${st.keyHint || 'key set'} · model ${st.model}${fromEnv ? ' · from environment' : ''}` : 'Add an API key below to enable AI features. Matching still works without one.'}</div>
        </div>
        {configured && !fromEnv && <Btn icon="ban" onClick={disconnect} style={{ opacity: busy ? 0.6 : 1 }}>Disconnect</Btn>}
      </div>
    </Card>

    {/* provider + key */}
    <Card style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint, marginBottom: 10 }}>Provider</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        {PROVIDERS.map((p) => { const on = provider === p.key; return <Hover key={p.key} as="button" onClick={() => setProvider(p.key)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 12, borderRadius: 12, border: `1.5px solid ${on ? '#007AFF' : T.border}`, background: on ? 'rgba(0,122,255,0.04)' : '#fff', cursor: 'pointer', textAlign: 'left' }} hover={{ background: on ? 'rgba(0,122,255,0.06)' : T.hover }}>
          <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 9, background: p.bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{p.mark}</span>
          <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 650 }}>{p.label}</div><div style={{ fontSize: 11.5, color: T.faint }}>{p.sub}</div></div>
          {on && <Icon name="checkCircle" size={18} style={{ color: '#007AFF' }} />}
        </Hover>; })}
      </div>

      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint, marginBottom: 8 }}>API key</div>
      <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder={configured ? 'Enter a new key to replace the current one' : 'sk-…'} style={{ width: '100%', boxSizing: 'border-box', height: 40, borderRadius: 10, border: `1px solid ${T.border}`, padding: '0 12px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit' }} />
      <div style={{ fontSize: 11.5, color: T.faint, marginTop: 6 }}>Stored server-side and never returned to the browser — only a masked hint is shown. Keys start with “sk-”.</div>

      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint, margin: '16px 0 8px' }}>Model <span style={{ textTransform: 'none', fontWeight: 500, color: T.faint }}>(optional override)</span></div>
      <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={provider === 'openai' ? 'gpt-4o' : 'claude-opus-4-8'} style={{ width: '100%', boxSizing: 'border-box', height: 40, borderRadius: 10, border: `1px solid ${T.border}`, padding: '0 12px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit' }} />

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Btn variant="primary" icon="check" onClick={save} style={{ opacity: busy ? 0.6 : 1 }}>Save & connect</Btn>
        <Btn icon="zap" onClick={test} style={{ opacity: busy ? 0.6 : 1 }}>Test connection</Btn>
      </div>
    </Card>

    {/* integrations Anna can pull (compliance sources) */}
    {st?.integrations && Object.keys(st.integrations).length > 0 && <Card>
      <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 4 }}>Compliance data sources</div>
      <div style={{ fontSize: 12, color: T.faint, marginBottom: 12 }}>MVR, PSP and Clearinghouse pulls require the driver's signed consent under FMCSA rules.</div>
      {Object.entries(st.integrations).map(([k, v]: any) => <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${T.hair}` }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: v?.configured || v?.connected ? '#34C759' : '#C7C7CC' }} />
        <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase' }}>{k}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: T.faint }}>{v?.configured || v?.connected ? 'connected' : 'demo / not configured'}</span>
      </div>)}
    </Card>}
  </div>;
}
