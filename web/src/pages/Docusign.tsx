import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store';
import { PageHeader, Pill, Empty, timeAgo } from '@/ui';
import {
  getDocusignStatus, listEnvelopes, listCandidates,
  signingUrl, voidEnvelope, simulateComplete, docHtmlUrl, docPdfUrl, statusMeta,
  type Envelope, type DocType, type DocusignStatus, type CandidateLite,
} from '@/lib/docusignApi';
import EnvelopeBuilder from '@/pages/EnvelopeBuilder';

type View = 'home' | 'agreements' | 'templates' | 'reports' | 'admin';
type Folder = 'inbox' | 'sent' | 'completed' | 'action';

// Doc types surfaced as "favorite" template cards on Home (match the trucking theme).
const FAVORITE_TYPES = ['owner_operator_agreement', 'company_driver_agreement', 'lease_agreement', 'offer_letter'];
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

export default function Docusign() {
  const s = useStore();
  const [view, setView] = useState<View>('home');
  const [status, setStatus] = useState<DocusignStatus | null>(null);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [candidates, setCandidates] = useState<CandidateLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [send, setSend] = useState<{ candidateId?: string; docType?: string } | null>(null);
  const [agrFolder, setAgrFolder] = useState<Folder>('inbox');
  const goAgreements = (f: Folder) => { setAgrFolder(f); setView('agreements'); };

  const docTypes = status?.documents ?? [];
  const userName = (s.currentUser || 'QuickHire Admin').toUpperCase();

  async function reload() {
    const [st, env, cands] = await Promise.all([
      getDocusignStatus().catch(() => null),
      listEnvelopes().catch(() => []),
      listCandidates().catch(() => []),
    ]);
    setStatus(st); setEnvelopes(env); setCandidates(cands); setLoading(false);
  }
  useEffect(() => { reload(); }, []);

  const stats = useMemo(() => ({
    action: envelopes.filter((e) => (e.status === 'sent' || e.status === 'delivered') && e.embedded).length,
    waiting: envelopes.filter((e) => (e.status === 'sent' || e.status === 'delivered') && !e.embedded).length,
    expiring: 0,
    completed: envelopes.filter((e) => e.status === 'completed').length,
  }), [envelopes]);

  const tabs: { key: View; label: string }[] = [
    { key: 'home', label: 'Home' }, { key: 'agreements', label: 'Agreements' },
    { key: 'templates', label: 'Templates' }, { key: 'reports', label: 'Reports' }, { key: 'admin', label: 'Admin' },
  ];

  return (
    <>
      <PageHeader crumbs={[{ label: 'DocuSign · e-Signature' }]}
        actions={<>
          {status && <span className={`pill ${status.mode === 'live' ? 'pill-green' : 'pill-amber'}`}>{status.mode === 'live' ? '● Live' : '● Simulated'}</span>}
          <button onClick={() => setSend({})} className="btn-primary">＋ Start</button>
        </>} />

      {/* DocuSign-style top nav */}
      <div className="px-6 border-b border-line bg-surface flex items-center gap-1 sticky top-[57px] z-[5]">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setView(t.key)}
            className={`px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition ${view === t.key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? <Empty icon="⏳" title="Loading…" /> : (
          <>
            {view === 'home' && <Home userName={userName} stats={stats} docTypes={docTypes} envelopes={envelopes}
              onStart={() => setSend({})} onUse={(t) => setSend({ docType: t })} onTemplates={() => setView('templates')}
              onCopy={(e) => setSend({ candidateId: e.candidateId, docType: e.docType })} onStat={goAgreements} />}
            {view === 'agreements' && <Agreements envelopes={envelopes} onReload={reload} initialFolder={agrFolder}
              onCopy={(e) => setSend({ candidateId: e.candidateId, docType: e.docType })} />}
            {view === 'templates' && <Templates docTypes={docTypes} onUse={(t) => setSend({ docType: t })} />}
            {view === 'reports' && <Reports envelopes={envelopes} />}
            {view === 'admin' && <Admin status={status} />}
          </>
        )}
      </div>

      {send && status && (
        <EnvelopeBuilder preset={send} candidates={candidates} docTypes={docTypes} mode={status.mode}
          onClose={() => setSend(null)} onSent={() => { setSend(null); reload(); }} />
      )}
    </>
  );
}

// ── Home ─────────────────────────────────────────────────────────────────────
function Home({ userName, stats, docTypes, envelopes, onStart, onUse, onTemplates, onCopy, onStat }: {
  userName: string; stats: { action: number; waiting: number; expiring: number; completed: number };
  docTypes: DocType[]; envelopes: Envelope[];
  onStart: () => void; onUse: (t: string) => void; onTemplates: () => void; onCopy: (e: Envelope) => void;
  onStat: (folder: Folder) => void;
}) {
  const favorites = FAVORITE_TYPES.map((t) => docTypes.find((d) => d.type === t)).filter(Boolean).slice(0, 3) as DocType[];
  const recent = [...envelopes].slice(0, 6);
  const stat = (n: number, l: string, folder: Folder) => (
    <button onClick={() => onStat(folder)} className="text-left hover:opacity-80 transition cursor-pointer">
      <div className="text-4xl font-light leading-none">{n}</div><div className="text-[13px] mt-2 opacity-90 underline-offset-2 hover:underline">{l}</div>
    </button>
  );
  return (
    <div>
      {/* Welcome banner */}
      <div className="px-6 sm:px-10 py-8 text-white" style={{ background: 'linear-gradient(90deg,#6b0f1a 0%,#8f1727 100%)' }}>
        <div className="max-w-[1100px] mx-auto flex flex-wrap items-center gap-x-16 gap-y-6">
          <div>
            <div className="text-sm tracking-wide opacity-90">WELCOME BACK</div>
            <div className="flex items-center gap-3 mt-2">
              <span className="w-9 h-9 rounded-full bg-white/15 grid place-items-center">📝</span>
              <span className="text-lg font-semibold tracking-wide">{userName}</span>
            </div>
          </div>
          <div className="flex-1" />
          <div className="text-[12px] opacity-90 self-start">Last 6 Months</div>
          <div className="flex items-end gap-12">
            {stat(stats.action, 'Action Required', 'action')}
            {stat(stats.waiting, 'Waiting for Others', 'sent')}
            {stat(stats.expiring, 'Expiring Soon', 'inbox')}
            {stat(stats.completed, 'Completed', 'completed')}
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-6 py-7">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-ink">Get Started or Use Templates</h2>
          <button onClick={onTemplates} className="btn-ghost">Go to Templates ›</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Start card */}
          <div className="card p-5 flex flex-col items-center justify-center text-center gap-3 bg-bg">
            <div className="text-sm font-semibold text-ink">Sign or get signatures</div>
            <button onClick={onStart} className="btn-primary">Start ▾</button>
          </div>
          {/* Favorite templates */}
          {favorites.map((d) => (
            <div key={d.type} onClick={() => onUse(d.type)} className="card p-0 overflow-hidden cursor-pointer hover:shadow-card transition group">
              <div className="h-32 bg-bg border-b border-line p-3 relative">
                <span className="absolute top-2 right-2 text-[11px] text-primary font-semibold">★ Favorite</span>
                <div className="text-[8px] leading-[1.5] text-muted/70 overflow-hidden h-full pt-3">
                  <div className="font-bold text-[10px] text-ink/60 mb-1">{d.label.toUpperCase()}</div>
                  {d.description}
                </div>
              </div>
              <div className="p-3">
                <div className="text-[13px] font-semibold text-ink truncate group-hover:text-primary">{d.label}</div>
                <div className="text-[11px] text-muted mt-0.5">Tap to send for signature</div>
              </div>
            </div>
          ))}
        </div>

        {/* Agreement activity */}
        <h2 className="text-xl font-bold text-ink mt-9 mb-3">Agreement activity</h2>
        {recent.length === 0 ? (
          <Empty icon="🗂" title="No agreements yet" sub="Send your first document with Start." />
        ) : (
          <div className="card divide-y divide-line">
            {recent.map((e) => {
              const m = statusMeta(e);
              return (
                <div key={e.envelopeId} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-ink truncate">{e.documentName} · {e.candidateName}</div>
                    <div className="text-[12px] text-muted">{timeAgo(e.createdAt)}</div>
                  </div>
                  <Pill kind={m.kind}>{m.label}</Pill>
                  {e.status === 'completed'
                    ? <a className="btn-ghost text-[12px]" href={docPdfUrl(e.envelopeId)} target="_blank" rel="noreferrer">Download</a>
                    : <button onClick={() => onCopy(e)} className="btn-ghost text-[12px]">Copy</button>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Agreements (Inbox) ───────────────────────────────────────────────────────
function Agreements({ envelopes, onReload, onCopy, initialFolder }: { envelopes: Envelope[]; onReload: () => void; onCopy: (e: Envelope) => void; initialFolder?: Folder }) {
  const [folder, setFolder] = useState<Folder>(initialFolder ?? 'inbox');
  const [busy, setBusy] = useState<string | null>(null);

  const counts = {
    inbox: envelopes.length,
    sent: envelopes.filter((e) => e.status === 'sent' || e.status === 'delivered').length,
    completed: envelopes.filter((e) => e.status === 'completed').length,
    action: envelopes.filter((e) => (e.status === 'sent' || e.status === 'delivered') && e.embedded).length,
  };
  const visible = envelopes.filter((e) => {
    if (folder === 'sent') return e.status === 'sent' || e.status === 'delivered';
    if (folder === 'completed') return e.status === 'completed';
    if (folder === 'action') return (e.status === 'sent' || e.status === 'delivered') && e.embedded;
    return true;
  });

  const act = async (id: string, fn: () => Promise<unknown>) => { setBusy(id); try { await fn(); await onReload(); } finally { setBusy(null); } };
  const openSign = async (id: string) => { const { url } = await signingUrl(id); window.open(url, '_blank'); };

  const folders: { key: Folder; label: string; icon: string }[] = [
    { key: 'inbox', label: 'Inbox', icon: '📥' }, { key: 'sent', label: 'Sent', icon: '📤' },
    { key: 'completed', label: 'Completed', icon: '✅' }, { key: 'action', label: 'Action Required', icon: '✍️' },
  ];

  return (
    <div className="flex min-h-full">
      {/* sub-sidebar */}
      <div className="w-52 border-r border-line p-3 bg-bg flex-shrink-0">
        <div className="text-[10.5px] font-bold text-muted uppercase px-2 mb-1.5">Envelopes</div>
        {folders.map((f) => (
          <div key={f.key} onClick={() => setFolder(f.key)}
            className={`px-2.5 py-2 rounded-lg text-[13px] flex items-center justify-between cursor-pointer ${folder === f.key ? 'bg-primary-light text-primary font-semibold' : 'hover:bg-[var(--surface-hover)]'}`}>
            <span>{f.icon} {f.label}</span>
            {counts[f.key] > 0 && <span className="text-[11px] text-muted font-semibold">{counts[f.key]}</span>}
          </div>
        ))}
      </div>

      {/* table */}
      <div className="flex-1 p-6 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-ink capitalize">{folder === 'action' ? 'Action Required' : folder}</h2>
          <button onClick={onReload} className="btn-ghost text-xs">↻ Refresh</button>
        </div>
        {visible.length === 0 ? <Empty icon="📭" title="Nothing here" sub="No envelopes match this view." /> : (
          <div className="card overflow-hidden">
            <div className="grid grid-cols-[1fr_180px_120px_220px] gap-2 px-4 py-2 text-[11px] font-bold uppercase text-muted border-b border-line">
              <span>Name</span><span>Status</span><span>Last Change</span><span>Actions</span>
            </div>
            {visible.map((e) => {
              const m = statusMeta(e);
              const done = e.status === 'completed' || e.status === 'voided';
              return (
                <div key={e.envelopeId} className="grid grid-cols-[1fr_180px_120px_220px] gap-2 px-4 py-3 border-b border-line/60 items-center">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold text-ink truncate">{e.documentName}</div>
                    <div className="text-[11.5px] text-muted truncate">To: {e.candidateName} · {e.signer?.email}{e.simulated ? ' · sim' : ''}</div>
                  </div>
                  <div><Pill kind={m.kind}>{m.label}</Pill></div>
                  <div className="text-[12px] text-muted">{fmtDate(e.completedAt || e.voidedAt || e.sentAt || e.createdAt)}</div>
                  <div className="flex flex-wrap gap-1">
                    <a className="btn-ghost text-[11.5px] py-1" href={docHtmlUrl(e.envelopeId)} target="_blank" rel="noreferrer">View</a>
                    {!done && <button className="btn-ghost text-[11.5px] py-1" onClick={() => openSign(e.envelopeId)}>Sign</button>}
                    {!done && e.simulated && <button disabled={busy === e.envelopeId} className="btn-ghost text-[11.5px] py-1" onClick={() => act(e.envelopeId, () => simulateComplete(e.envelopeId))}>✔</button>}
                    {!done && <button disabled={busy === e.envelopeId} className="btn-ghost text-[11.5px] py-1 text-danger" onClick={() => act(e.envelopeId, () => voidEnvelope(e.envelopeId, 'Voided by recruiter'))}>Void</button>}
                    {e.status === 'completed' && <a className="btn-ghost text-[11.5px] py-1" href={docPdfUrl(e.envelopeId)} target="_blank" rel="noreferrer">⬇ PDF</a>}
                    {done && <button className="btn-ghost text-[11.5px] py-1" onClick={() => onCopy(e)}>Copy</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Templates ────────────────────────────────────────────────────────────────
function Templates({ docTypes, onUse }: { docTypes: DocType[]; onUse: (t: string) => void }) {
  const [q, setQ] = useState('');
  const rows = docTypes.filter((d) => d.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="max-w-[1100px] mx-auto px-6 py-7">
      <h2 className="text-2xl font-bold text-ink mb-4">My Templates</h2>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search My Templates" className="input max-w-xs mb-4" />
      <div className="card overflow-hidden">
        <div className="grid grid-cols-[1fr_160px_120px_90px] gap-2 px-4 py-2.5 text-[11px] font-bold uppercase text-muted border-b border-line">
          <span>Name</span><span>Owner</span><span>Type</span><span></span>
        </div>
        {rows.map((d) => (
          <div key={d.type} className="grid grid-cols-[1fr_160px_120px_90px] gap-2 px-4 py-3 border-b border-line/60 items-center">
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-ink flex items-center gap-2">
                {FAVORITE_TYPES.includes(d.type) ? '★' : '☆'} {d.label}
              </div>
              <div className="text-[11.5px] text-muted">{d.description}</div>
            </div>
            <div className="text-[12.5px] text-muted">Digital Signing Center</div>
            <div><Pill kind="ready">Auto-fill</Pill></div>
            <button onClick={() => onUse(d.type)} className="btn-primary text-[12px] py-1.5">Use</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────────
function Reports({ envelopes }: { envelopes: Envelope[] }) {
  const by = (st: string) => envelopes.filter((e) => e.status === st).length;
  const total = envelopes.length || 1;
  const rows = [
    { label: 'Completed', n: by('completed'), color: '#16A34A' },
    { label: 'Sent / Waiting', n: envelopes.filter((e) => e.status === 'sent' || e.status === 'delivered').length, color: '#D97706' },
    { label: 'Voided', n: by('voided'), color: '#6B7280' },
    { label: 'Declined', n: by('declined'), color: '#DC2626' },
  ];
  return (
    <div className="max-w-[800px] mx-auto px-6 py-7">
      <h2 className="text-2xl font-bold text-ink mb-1">Reports</h2>
      <p className="text-sm text-muted mb-5">Envelope outcomes across {envelopes.length} agreement(s).</p>
      <div className="card p-5 space-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex justify-between text-[13px] mb-1"><span className="text-ink font-medium">{r.label}</span><span className="text-muted">{r.n}</span></div>
            <div className="h-2.5 rounded-full bg-bg overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(r.n / total) * 100}%`, background: r.color }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Admin ────────────────────────────────────────────────────────────────────
function Admin({ status }: { status: DocusignStatus | null }) {
  if (!status) return <Empty icon="⚙" title="No status" />;
  const Row = ({ k, v }: { k: string; v: string }) => (
    <div className="flex justify-between py-2 border-b border-line/60 text-[13px]"><span className="text-muted">{k}</span><span className="text-ink font-medium">{v}</span></div>
  );
  return (
    <div className="max-w-[760px] mx-auto px-6 py-7">
      <h2 className="text-2xl font-bold text-ink mb-4">Admin · Integration</h2>
      <div className="card p-5">
        <Row k="Mode" v={status.mode === 'live' ? 'Live (real e-signatures)' : 'Simulated'} />
        <Row k="Account ID" v={status.accountId || '—'} />
        <Row k="API base" v={status.apiBase} />
        <Row k="Webhook HMAC" v={status.hasWebhookSecret ? 'Enabled' : 'Not set'} />
        <Row k="Document types" v={String(status.documents.length)} />
      </div>
      {status.mode === 'simulated' && (
        <div className="mt-4 text-[13px] text-muted bg-bg border border-line rounded-xl p-4">
          Running in <b>simulated</b> mode — envelopes are created locally and clearly flagged. Set the
          <code className="mx-1 px-1 bg-surface rounded">DOCUSIGN_*</code> environment variables (JWT Grant auth) to
          enable real, legally-binding signatures. No code changes needed.
        </div>
      )}
    </div>
  );
}

