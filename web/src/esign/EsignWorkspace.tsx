import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon, SegTabs, useToasts, ToastHost } from '../tasks/lib';
import { useEsign, svc, STATUS_META, ACTION_STATUSES, DOC_CATALOG, fmtAgo, fmtDate, daysUntil, validateEnvelope } from './store';
import { BG, Card, StatusPill, Modal, Confirm, EmptyState, primaryBtn, ghostBtn, Toggle, Input, Textarea, Select, SettingRow, Field } from './ui';
import { EnvelopeBuilder, PackageModal, SendPackageModal } from './builder';
import { SigningPreview } from './signing';
import { DocumentEditor } from './editor';

const AUDIT_ICON: Record<string, string> = { created: 'plus', draft_saved: 'fileText', sent: 'send', viewed: 'eye', signed: 'sign', completed: 'checkCircle', reminder_sent: 'bell', corrected: 'pencil', voided: 'ban', declined: 'x', downloaded: 'download' };

export default function EsignWorkspace({ drivers = [], go }: { drivers?: any[]; go?: (page: string) => void }) {
  const store = useEsign();
  const { toasts, toast } = useToasts();
  const [tab, setTab] = React.useState('home');
  const [filter, setFilter] = React.useState('all');
  const [openId, setOpenId] = React.useState<string | null>(null);     // detail drawer
  const [builderId, setBuilderId] = React.useState<string | null>(null); // envelope builder
  const [editId, setEditId] = React.useState<string | null>(null);      // correct/editor
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [pkgModal, setPkgModal] = React.useState<any>(null);            // {pkg?} or 'new'
  const [sendPkg, setSendPkg] = React.useState<any>(null);
  const [confirm, setConfirm] = React.useState<any>(null);

  const counts = svc.counts();
  const startEnvelope = () => { const env = svc.createEnvelope({}); setBuilderId(env.id); };
  const openAgreementsWith = (f: string) => { setFilter(f); setTab('agreements'); };

  const tabs = [
    { key: 'home', label: 'Home', icon: 'layout' },
    { key: 'agreements', label: 'Agreements', icon: 'fileText' },
    { key: 'templates', label: 'Templates', icon: 'copy' },
    { key: 'packages', label: 'Packages', icon: 'briefcase' },
    { key: 'settings', label: 'Settings', icon: 'settings' },
  ];

  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: BG }}>
    <ToastHost toasts={toasts} />
    <div style={{ flex: 'none', padding: '22px 28px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <span style={{ width: 44, height: 44, flex: 'none', borderRadius: 12, background: '#007AFF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="sign" size={22} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>e-Signature</h1>
            {store.settings.simulationMode && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: '#A05A00', background: 'rgba(255,159,10,0.14)', borderRadius: 999, padding: '3px 10px' }}><span style={{ width: 6, height: 6, borderRadius: 999, background: '#FF9F0A' }} />Simulation Mode</span>}
          </div>
          <p style={{ margin: '2px 0 0', fontSize: 13.5, color: T.muted }}>Create, send, track and manage driver onboarding documents.</p>
        </div>
        <Hover as="button" onClick={startEnvelope} style={primaryBtn} hover={{ background: '#0066D6' }}><Icon name="plus" size={16} />Start Envelope</Hover>
      </div>
      <div style={{ marginTop: 16 }}><SegTabs tabs={tabs} value={tab} onChange={setTab} /></div>
    </div>

    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 28px 28px' }}>
      {tab === 'home' && <Home counts={counts} store={store} onCard={openAgreementsWith} onOpen={setOpenId} onStart={startEnvelope}
        onUpload={() => { toast('PDF upload is simulated — starting a new envelope', 'info'); startEnvelope(); }}
        onSendPackage={() => setSendPkg({})} onUseTemplate={() => setTab('templates')} />}
      {tab === 'agreements' && <Agreements store={store} filter={filter} setFilter={setFilter} onOpen={setOpenId} onAction={handleRowAction} />}
      {tab === 'templates' && <Templates store={store} toast={toast} onUse={(t: any) => setSendPkg({ template: t })} onEdit={(t: any) => setEditTemplate(t)} setConfirm={setConfirm} />}
      {tab === 'packages' && <Packages store={store} onNew={() => setPkgModal('new')} onEdit={(p: any) => setPkgModal({ pkg: p })} onSend={(p: any) => setSendPkg({ pkg: p })} toast={toast} setConfirm={setConfirm} />}
      {tab === 'settings' && <SettingsTab store={store} toast={toast} />}
    </div>

    {openId && <DetailDrawer id={openId} onClose={() => setOpenId(null)} onAction={handleRowAction} toast={toast} />}
    {builderId && <EnvelopeBuilder envId={builderId} onClose={() => setBuilderId(null)} onSent={() => { setTab('agreements'); }} toast={toast} />}
    {editId && <CorrectEditor envId={editId} onClose={() => setEditId(null)} toast={toast} />}
    {previewId && <SigningPreview env={svc.envelope(previewId)} onClose={() => setPreviewId(null)} onComplete={(rid: string) => { svc.simulateSign(previewId, rid); }} />}
    {pkgModal && <PackageModal pkg={pkgModal === 'new' ? null : pkgModal.pkg} onClose={() => setPkgModal(null)} toast={toast} />}
    {sendPkg && <SendPackageModal pkg={sendPkg.pkg} drivers={drivers} onClose={() => setSendPkg(null)} onSent={() => setTab('agreements')} toast={toast} />}
    {confirm && <Confirm {...confirm} onClose={() => setConfirm(null)} />}
  </div>;

  function setEditTemplate(_t: any) { toast('Template editing opens the field editor', 'info'); }

  function handleRowAction(action: string, id: string) {
    const e = svc.envelope(id); if (!e) return;
    switch (action) {
      case 'open': if (e.status === 'draft' || e.status === 'missing_fields') setBuilderId(id); else setOpenId(id); break;
      case 'preview': setPreviewId(id); break;
      case 'remind': { const r = svc.remind(id); toast(r?.ok ? 'Reminder sent' : (r?.message || 'Could not remind'), r?.ok ? 'success' : 'warning'); break; }
      case 'correct': setEditId(id); break;
      case 'duplicate': { svc.duplicate(id); toast('Envelope duplicated', 'success'); break; }
      case 'download': svc.markDownloaded(id, 'Signed PDF'); toast('Signed PDF downloaded (simulated)', 'success'); break;
      case 'certificate': svc.markDownloaded(id, 'Certificate of completion'); toast('Certificate downloaded (simulated)', 'success'); break;
      case 'simulateSign': svc.simulateSign(id); toast('Signing simulated', 'success'); break;
      case 'extend': svc.extendExpiration(id); toast('Expiration extended 14 days', 'success'); break;
      case 'void': setConfirm({ title: 'Void this envelope?', body: 'Recipients will no longer be able to sign. This cannot be undone.', confirmLabel: 'Void envelope', danger: true, onConfirm: () => { svc.void(id); toast('Envelope voided', 'info'); } }); break;
      case 'delete': setConfirm({ title: 'Delete this draft?', body: 'The draft and its field placements will be removed.', confirmLabel: 'Delete draft', danger: true, onConfirm: () => { svc.remove(id); setOpenId(null); toast('Draft deleted', 'info'); } }); break;
    }
  }
}

/* Correcting a sent envelope reuses the full document editor. */
function CorrectEditor({ envId, onClose, toast }: any) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  const env = svc.envelope(envId); if (!env) return null;
  return <DocumentEditor title={`Correct — ${env.title}`} subtitle={`${env.driverName || ''} · ${env.carrier || ''}`} value={env}
    onChange={(p: any) => { svc.updateEnvelope(envId, p); force(); }} onClose={onClose}
    onSave={() => { svc.saveDraft(envId); toast('Changes saved', 'success'); }}
    onSend={() => { const r = svc.send(envId); if (r.ok) { toast('Corrected & resent', 'success'); onClose(); } else toast(r.errors[0], 'error'); }} sendLabel="Resend" />;
}

/* ───────────────────────── HOME ───────────────────────── */
function Home({ counts, store, onCard, onOpen, onStart, onUpload, onSendPackage, onUseTemplate }: any) {
  const cards = [
    { key: 'action', label: 'Action Required', desc: 'Drafts, missing fields & failed sends', icon: 'alert', color: '#FF9500', count: counts.action, filter: 'action' },
    { key: 'waiting', label: 'Waiting for Others', desc: 'Sent and awaiting signature', icon: 'clock', color: '#007AFF', count: counts.waiting, filter: 'waiting' },
    { key: 'completed', label: 'Completed', desc: 'Fully signed agreements', icon: 'checkCircle', color: '#34C759', count: counts.completed, filter: 'completed' },
    { key: 'expiring', label: 'Expiring Soon', desc: 'Close to expiration', icon: 'snooze', color: '#FF3B30', count: counts.expiring, filter: 'expiring' },
  ];
  const quick = [
    { label: 'Start Envelope', icon: 'plus', onClick: onStart },
    { label: 'Send Offer Package', icon: 'briefcase', onClick: onSendPackage },
    { label: 'Upload PDF', icon: 'upload', onClick: onUpload },
    { label: 'Use Template', icon: 'copy', onClick: onUseTemplate },
  ];
  const recent = [...store.envelopes].sort((a: any, b: any) => +new Date(b.lastActivity) - +new Date(a.lastActivity)).slice(0, 6);
  return <div style={{ maxWidth: 1160, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
      {cards.map((c) => <Card key={c.key} onClick={() => onCard(c.filter)} hover={{ boxShadow: '0 8px 24px rgba(0,0,0,0.08)', transform: 'translateY(-1px)', borderColor: c.color }} style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, background: c.color + '1c', color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={c.icon} size={19} /></span>
          <Icon name="chevronRight" size={16} style={{ color: '#C7C7CC' }} />
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, marginTop: 12, letterSpacing: '-0.02em', color: c.color }}>{c.count}</div>
        <div style={{ fontSize: 13.5, fontWeight: 650, marginTop: 2 }}>{c.label}</div>
        <div style={{ fontSize: 12, color: T.faint, marginTop: 1 }}>{c.desc}</div>
      </Card>)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
      {quick.map((q) => <Card key={q.label} onClick={q.onClick} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 10, background: 'rgba(0,122,255,0.1)', color: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={q.icon} size={17} /></span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{q.label}</span>
      </Card>)}
    </div>
    <Card style={{ overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px 12px', fontSize: 15, fontWeight: 650 }}>Recent Agreements</div>
      {recent.length === 0 ? <EmptyState icon="fileText" title="No agreements yet" body="Start an envelope to send your first document." action={<Hover as="button" onClick={onStart} style={primaryBtn} hover={{ background: '#0066D6' }}>Start Envelope</Hover>} />
        : recent.map((a: any) => <Hover key={a.id} as="button" onClick={() => onOpen(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left', padding: '12px 18px', border: 'none', borderTop: `1px solid ${T.hair}`, background: 'transparent', cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.018)' }}>
          <span style={{ color: T.faint, display: 'flex' }}><Icon name="fileText" size={17} /></span>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.title}</div><div style={{ fontSize: 12, color: T.muted }}>{a.driverName || (a.recipients[0] || {}).name || '—'} · {a.carrier || '—'}</div></div>
          <StatusPill status={a.status} />
          <span style={{ fontSize: 12, color: T.faint, width: 84, textAlign: 'right' }}>{fmtAgo(a.lastActivity)}</span>
        </Hover>)}
    </Card>
  </div>;
}

/* ───────────────────────── AGREEMENTS ───────────────────────── */
function Agreements({ store, filter, setFilter, onOpen, onAction }: any) {
  const [q, setQ] = React.useState('');
  const [sort, setSort] = React.useState('newest');
  const FILTERS = [['all', 'All'], ['action', 'Needs Action'], ['waiting', 'Waiting'], ['completed', 'Completed'], ['expiring', 'Expiring Soon'], ['draft', 'Drafts'], ['voided', 'Voided']];
  let rows = store.envelopes.filter((e: any) => {
    const m = STATUS_META[e.status];
    if (filter === 'action' && !ACTION_STATUSES.includes(e.status)) return false;
    if (filter === 'waiting' && m?.group !== 'waiting') return false;
    if (filter === 'completed' && e.status !== 'completed') return false;
    if (filter === 'expiring' && e.status !== 'expiring_soon') return false;
    if (filter === 'draft' && e.status !== 'draft') return false;
    if (filter === 'voided' && e.status !== 'voided') return false;
    if (q) { const hay = `${e.title} ${e.driverName} ${e.carrier} ${(e.recipients || []).map((r: any) => r.name + r.email).join(' ')} ${STATUS_META[e.status]?.label}`.toLowerCase(); if (!hay.includes(q.toLowerCase())) return false; }
    return true;
  });
  rows = rows.sort((a: any, b: any) => {
    if (sort === 'oldest') return +new Date(a.createdAt) - +new Date(b.createdAt);
    if (sort === 'status') return a.status.localeCompare(b.status);
    if (sort === 'recipient') return ((a.driverName || '')).localeCompare(b.driverName || '');
    if (sort === 'expiration') return +new Date(a.expiresAt || 0) - +new Date(b.expiresAt || 0);
    return +new Date(b.createdAt) - +new Date(a.createdAt);
  });

  return <div style={{ maxWidth: 1160, margin: '0 auto' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.faint }}><Icon name="search" size={16} /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search driver, carrier, document, recipient…" style={{ width: '100%', boxSizing: 'border-box', height: 38, borderRadius: 10, border: `1px solid ${T.border}`, padding: '0 12px 0 34px', fontSize: 13.5, outline: 'none' }} />
      </div>
      <Select value={sort} onChange={setSort} options={[{ value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }, { value: 'status', label: 'Status' }, { value: 'recipient', label: 'Recipient' }, { value: 'expiration', label: 'Expiration' }]} style={{ width: 150 }} />
    </div>
    <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
      {FILTERS.map(([k, l]) => <button key={k} onClick={() => setFilter(k)} style={{ height: 30, padding: '0 13px', borderRadius: 999, border: `1px solid ${filter === k ? '#007AFF' : T.border}`, background: filter === k ? 'rgba(0,122,255,0.08)' : '#fff', color: filter === k ? '#007AFF' : T.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{l}</button>)}
    </div>
    <Card style={{ overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1.2fr 1fr 1fr 0.9fr 96px', gap: 12, padding: '11px 18px', background: '#FAFAFB', borderBottom: `1px solid ${T.hair}`, fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint }}>
        <span>Document</span><span>Recipient</span><span>Carrier</span><span>Status</span><span>Expires</span><span style={{ textAlign: 'right' }}>Actions</span>
      </div>
      {rows.length === 0 ? <EmptyState icon="search" title="No agreements match" body="Try a different filter or search." />
        : rows.map((e: any) => <AgreementRow key={e.id} e={e} onOpen={() => onOpen(e.id)} onAction={onAction} />)}
    </Card>
  </div>;
}

function AgreementRow({ e, onOpen, onAction }: any) {
  const exp = daysUntil(e.expiresAt);
  const recip = e.driverName || (e.recipients[0] || {}).name || '—';
  return <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1.2fr 1fr 1fr 0.9fr 96px', gap: 12, alignItems: 'center', padding: '12px 18px', borderTop: `1px solid ${T.hair}`, fontSize: 13 }}>
    <Hover as="button" onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', minWidth: 0, padding: 0 }} hover={{ color: '#007AFF' }}>
      <Icon name="fileText" size={16} style={{ color: T.faint, flex: 'none' }} />
      <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</span>
    </Hover>
    <span style={{ color: '#3a3a3c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{recip}</span>
    <span style={{ color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.carrier || '—'}</span>
    <span><StatusPill status={e.status} size="sm" /></span>
    <span style={{ fontSize: 12, color: exp != null && exp <= 3 && !['completed', 'voided'].includes(e.status) ? '#C62820' : T.faint }}>{['completed', 'voided'].includes(e.status) ? '—' : exp != null ? (exp < 0 ? 'Expired' : `${exp}d`) : '—'}</span>
    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
      {['sent', 'viewed', 'partially_signed', 'expiring_soon'].includes(e.status) && <RowIcon name="bell" title="Send reminder" onClick={() => onAction('remind', e.id)} />}
      {e.status === 'completed' && <RowIcon name="download" title="Download signed PDF" onClick={() => onAction('download', e.id)} />}
      <RowMenu e={e} onAction={onAction} onOpen={onOpen} />
    </div>
  </div>;
}
function RowIcon({ name, title, onClick }: any) { return <Hover as="button" title={title} onClick={onClick} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: T.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} hover={{ background: 'rgba(0,0,0,0.06)' }}><Icon name={name} size={15} /></Hover>; }

function RowMenu({ e, onAction, onOpen }: any) {
  const [open, setOpen] = React.useState(false);
  const items: any[] = [
    { label: 'Open', icon: 'externalLink', a: 'open' },
    { label: 'Preview signing', icon: 'eye', a: 'preview' },
  ];
  if (['sent', 'viewed', 'partially_signed', 'expiring_soon'].includes(e.status)) { items.push({ label: 'Send reminder', icon: 'bell', a: 'remind' }, { label: 'Simulate signature', icon: 'sign', a: 'simulateSign' }, { label: 'Correct envelope', icon: 'pencil', a: 'correct' }); }
  if (e.status === 'expiring_soon') items.push({ label: 'Extend expiration', icon: 'clock', a: 'extend' });
  if (e.status === 'completed') items.push({ label: 'Download signed PDF', icon: 'download', a: 'download' }, { label: 'Completion certificate', icon: 'shield', a: 'certificate' });
  items.push({ label: 'Duplicate', icon: 'copy', a: 'duplicate' });
  if (!['completed', 'voided'].includes(e.status)) items.push({ label: 'Void', icon: 'ban', a: 'void', danger: true });
  if (['draft', 'missing_fields'].includes(e.status)) items.push({ label: 'Delete draft', icon: 'trash', a: 'delete', danger: true });
  return <div style={{ position: 'relative' }}>
    <Hover as="button" onClick={() => setOpen((o) => !o)} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: T.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} hover={{ background: 'rgba(0,0,0,0.06)' }}><Icon name="more" size={16} /></Hover>
    {open && <><div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
      <div style={{ position: 'absolute', top: 34, right: 0, zIndex: 31, minWidth: 196, background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.14)', padding: 6 }}>
        {items.map((it, i) => <Hover key={i} as="button" onClick={() => { setOpen(false); it.a === 'open' ? onOpen() : onAction(it.a, e.id); }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', background: 'transparent', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: it.danger ? '#C62820' : T.text }} hover={{ background: it.danger ? 'rgba(255,59,48,0.08)' : 'rgba(0,0,0,0.05)' }}><Icon name={it.icon} size={15} style={{ color: it.danger ? '#C62820' : T.muted }} />{it.label}</Hover>)}
      </div></>}
  </div>;
}

/* ───────────────────────── DETAIL DRAWER ───────────────────────── */
function DetailDrawer({ id, onClose, onAction, toast }: any) {
  const store = useEsign(); void store;
  const e = svc.envelope(id); if (!e) return null;
  const exp = daysUntil(e.expiresAt);
  const signed = (e.recipients || []).filter((r: any) => r.status === 'signed').length;
  const fieldTotal = (e.fields || []).length;
  const errs = validateEnvelope(e);
  return <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', justifyContent: 'flex-end' }}>
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(2px)' }} />
    <div style={{ position: 'relative', width: 540, maxWidth: '94vw', height: '100%', background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', padding: '18px 22px', borderBottom: `1px solid ${T.hair}`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{e.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}><StatusPill status={e.status} /><span style={{ fontSize: 12, color: T.faint }}>{e.driverName || '—'} · {e.carrier || '—'}</span></div>
        </div>
        <Hover as="button" onClick={onClose} style={{ width: 32, height: 32, flex: 'none', borderRadius: 8, border: 'none', background: T.segBg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted }} hover={{ background: 'rgba(0,0,0,0.08)' }}><Icon name="x" size={16} /></Hover>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* quick actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['draft', 'missing_fields'].includes(e.status) && <DBtn primary icon="pencil" label="Edit & send" onClick={() => { onAction('open', e.id); onClose(); }} />}
          {['sent', 'viewed', 'partially_signed', 'expiring_soon'].includes(e.status) && <><DBtn icon="bell" label="Send reminder" onClick={() => onAction('remind', e.id)} /><DBtn icon="pencil" label="Correct" onClick={() => { onAction('correct', e.id); onClose(); }} /></>}
          <DBtn icon="eye" label="Preview signing" onClick={() => { onAction('preview', e.id); onClose(); }} />
          {e.status === 'completed' && <><DBtn icon="download" label="Signed PDF" onClick={() => onAction('download', e.id)} /><DBtn icon="shield" label="Certificate" onClick={() => onAction('certificate', e.id)} /></>}
          {!['completed', 'voided', 'draft', 'missing_fields'].includes(e.status) && <DBtn icon="sign" label="Simulate signature" onClick={() => onAction('simulateSign', e.id)} />}
          {!['completed', 'voided'].includes(e.status) && <DBtn icon="ban" label="Void" danger onClick={() => onAction('void', e.id)} />}
        </div>

        {errs.length > 0 && ['draft', 'missing_fields'].includes(e.status) && <Box>
          <Label icon="alert">Field completion</Label>
          {errs.map((x: string, i: number) => <div key={i} style={{ fontSize: 12.5, color: '#C62820', display: 'flex', gap: 7, padding: '3px 0' }}><Icon name="alert" size={13} style={{ flex: 'none', marginTop: 1 }} />{x}</div>)}
        </Box>}

        <Box>
          <Label icon="users">Recipients</Label>
          {(e.recipients || []).map((r: any) => <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
            <span style={{ width: 28, height: 28, flex: 'none', borderRadius: 999, background: r.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{(r.name || '?').split(' ').map((s: string) => s[0]).slice(0, 2).join('')}</span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{r.name || 'Unnamed'}</div><div style={{ fontSize: 11.5, color: T.faint }}>{r.email} · {r.role}</div></div>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: r.status === 'signed' ? '#248A3D' : r.status === 'declined' ? '#C62820' : r.status === 'viewed' ? '#0066CC' : T.faint, textTransform: 'capitalize' }}>{r.status}</span>
          </div>)}
        </Box>

        <Box>
          <Label icon="fileText">Documents ({(e.documentKeys || []).length})</Label>
          {(e.documentKeys || []).map((k: string) => <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13 }}><Icon name="fileText" size={14} style={{ color: T.faint }} />{DOC_CATALOG[k]?.name || k}</div>)}
          <div style={{ fontSize: 11.5, color: T.faint, marginTop: 6 }}>{signed}/{(e.recipients || []).filter((r: any) => r.role === 'signer').length} signers complete · {fieldTotal} fields placed</div>
        </Box>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Box><Label icon="clock">Expiration</Label><div style={{ fontSize: 13 }}>{['completed', 'voided'].includes(e.status) ? '—' : exp != null ? (exp < 0 ? 'Expired' : `in ${exp} days`) : '—'}</div><div style={{ fontSize: 11.5, color: T.faint, marginTop: 2 }}>{fmtDate(e.expiresAt)}</div></Box>
          <Box><Label icon="bell">Reminders</Label><div style={{ fontSize: 13 }}>{e.remindersSent || 0} of {e.maxReminders || 3} sent</div><div style={{ fontSize: 11.5, color: T.faint, marginTop: 2 }}>Every {e.reminderEveryDays} days</div></Box>
        </div>

        {e.certificate && <Box style={{ background: 'rgba(52,199,89,0.05)', borderColor: 'rgba(52,199,89,0.25)' }}>
          <Label icon="shield">Completion certificate</Label>
          <div style={{ fontSize: 12.5, color: T.muted }}>Completed {fmtDate(e.certificate.completedAt)} · Seal {e.certificate.sealId}</div>
          <div style={{ fontSize: 11.5, color: '#248A3D', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="checkCircle" size={13} />Tamper-sealed · all recipients verified</div>
        </Box>}

        <Box>
          <Label icon="list">Audit trail</Label>
          {(e.audit || []).slice().reverse().map((a: any) => <div key={a.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: `1px solid ${T.hair}` }}>
            <span style={{ width: 24, height: 24, flex: 'none', borderRadius: 999, background: '#F2F2F7', color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={AUDIT_ICON[a.event] || 'circle'} size={12} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5 }}>{a.detail || a.event}</div><div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>{a.actor} · {fmtAgo(a.at)}</div></div>
          </div>)}
        </Box>
        <div style={{ display: 'flex', gap: 8 }}>
          <DBtn icon="copy" label="Duplicate" onClick={() => { onAction('duplicate', e.id); toast('Duplicated', 'success'); }} />
          {['draft', 'missing_fields'].includes(e.status) && <DBtn icon="trash" label="Delete draft" danger onClick={() => onAction('delete', e.id)} />}
        </div>
      </div>
    </div>
  </div>;
}
function DBtn({ icon, label, onClick, primary, danger }: any) {
  const style: React.CSSProperties = primary ? primaryBtn : { ...ghostBtn, color: danger ? '#C62820' : T.text };
  return <Hover as="button" onClick={onClick} style={{ ...style, height: 34, padding: '0 12px', fontSize: 12.5 }} hover={{ background: primary ? '#0066D6' : danger ? 'rgba(255,59,48,0.08)' : 'rgba(0,0,0,0.04)' }}><Icon name={icon} size={14} />{label}</Hover>;
}
function Box({ children, style }: any) { return <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, ...style }}>{children}</div>; }
function Label({ icon, children }: any) { return <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}><Icon name={icon} size={14} style={{ color: T.muted }} /><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint }}>{children}</span></div>; }

/* ───────────────────────── TEMPLATES ───────────────────────── */
function Templates({ store, toast, onUse, setConfirm }: any) {
  const [q, setQ] = React.useState('');
  const [cat, setCat] = React.useState('all');
  const cats = ['all', ...Array.from(new Set(store.templates.map((t: any) => t.category)))];
  const rows = store.templates.filter((t: any) => (cat === 'all' || t.category === cat) && (!q || t.name.toLowerCase().includes(q.toLowerCase())));
  return <div style={{ maxWidth: 1160, margin: '0 auto' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.faint }}><Icon name="search" size={16} /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates…" style={{ width: '100%', boxSizing: 'border-box', height: 38, borderRadius: 10, border: `1px solid ${T.border}`, padding: '0 12px 0 34px', fontSize: 13.5, outline: 'none' }} />
      </div>
      <Select value={cat} onChange={setCat} options={cats.map((c) => ({ value: c, label: c === 'all' ? 'All categories' : c }))} style={{ width: 170 }} />
      <Hover as="button" onClick={() => { const t = svc.createTemplate({ name: 'New Template', documentKey: 'company_driver_agreement', category: 'Onboarding', fields: [] }); toast('Template created', 'success'); void t; }} style={primaryBtn} hover={{ background: '#0066D6' }}><Icon name="plus" size={15} />Create template</Hover>
    </div>
    {rows.length === 0 ? <Card><EmptyState icon="copy" title="No templates" body="Create a reusable template to standardize a document's fields and email." /></Card>
      : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
        {rows.map((t: any) => <Card key={t.id} style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
            <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 10, background: 'rgba(0,122,255,0.1)', color: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="copy" size={18} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 650 }}>{t.name}</div><div style={{ fontSize: 12, color: T.faint }}>{t.category} · {(t.fields || []).length} fields · used {t.usageCount}×</div></div>
            <span style={{ fontSize: 11, fontWeight: 600, color: t.status === 'active' ? '#248A3D' : T.faint, background: t.status === 'active' ? 'rgba(52,199,89,0.12)' : '#F2F2F7', borderRadius: 999, padding: '2px 9px', textTransform: 'capitalize' }}>{t.status}</span>
          </div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 10 }}>Last used {fmtAgo(t.lastUsed)}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
            <Hover as="button" onClick={() => onUse(t)} style={{ ...primaryBtn, height: 32, padding: '0 12px', fontSize: 12.5 }} hover={{ background: '#0066D6' }}>Use</Hover>
            <Hover as="button" onClick={() => { svc.duplicateTemplate(t.id); toast('Duplicated', 'success'); }} style={{ ...ghostBtn, height: 32, padding: '0 11px', fontSize: 12.5 }} hover={{ background: 'rgba(0,0,0,0.04)' }}>Duplicate</Hover>
            <Hover as="button" onClick={() => { svc.archiveTemplate(t.id); toast(t.status === 'archived' ? 'Restored' : 'Archived', 'info'); }} style={{ ...ghostBtn, height: 32, padding: '0 11px', fontSize: 12.5 }} hover={{ background: 'rgba(0,0,0,0.04)' }}>{t.status === 'archived' ? 'Restore' : 'Archive'}</Hover>
            <Hover as="button" onClick={() => setConfirm({ title: 'Delete template?', body: `“${t.name}” will be removed.`, confirmLabel: 'Delete', danger: true, onConfirm: () => { svc.removeTemplate(t.id); toast('Deleted', 'info'); } })} style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${T.border}`, background: '#fff', color: '#C62820', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} hover={{ background: 'rgba(255,59,48,0.08)' }}><Icon name="trash" size={14} /></Hover>
          </div>
        </Card>)}
      </div>}
  </div>;
}

/* ───────────────────────── PACKAGES ───────────────────────── */
function Packages({ store, onNew, onEdit, onSend, toast, setConfirm }: any) {
  const [q, setQ] = React.useState('');
  const [cat, setCat] = React.useState('all');
  const cats = ['all', ...Array.from(new Set(store.packages.map((p: any) => p.category)))];
  const rows = store.packages.filter((p: any) => (cat === 'all' || p.category === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  return <div style={{ maxWidth: 1160, margin: '0 auto' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.faint }}><Icon name="search" size={16} /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search packages…" style={{ width: '100%', boxSizing: 'border-box', height: 38, borderRadius: 10, border: `1px solid ${T.border}`, padding: '0 12px 0 34px', fontSize: 13.5, outline: 'none' }} />
      </div>
      <Select value={cat} onChange={setCat} options={cats.map((c) => ({ value: c, label: c === 'all' ? 'All categories' : c }))} style={{ width: 170 }} />
      <Hover as="button" onClick={onNew} style={primaryBtn} hover={{ background: '#0066D6' }}><Icon name="plus" size={15} />Create Package</Hover>
    </div>
    {rows.length === 0 ? <Card><EmptyState icon="briefcase" title="No packages" body="Bundle several documents into a reusable package recruiters can send in one click." action={<Hover as="button" onClick={onNew} style={primaryBtn} hover={{ background: '#0066D6' }}>Create Package</Hover>} /></Card>
      : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
        {rows.map((p: any) => <Card key={p.id} style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
            <span style={{ width: 40, height: 40, flex: 'none', borderRadius: 11, background: 'rgba(88,86,214,0.1)', color: '#5856D6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="briefcase" size={19} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 650 }}>{p.name}</div><div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{p.description}</div></div>
            <span style={{ fontSize: 11, fontWeight: 600, color: p.status === 'active' ? '#248A3D' : p.status === 'archived' ? T.faint : '#A05A00', background: p.status === 'active' ? 'rgba(52,199,89,0.12)' : p.status === 'archived' ? '#F2F2F7' : 'rgba(255,159,10,0.14)', borderRadius: 999, padding: '2px 9px', textTransform: 'capitalize' }}>{p.status}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0', fontSize: 12, color: T.faint }}><span>{p.documentKeys.length} documents</span><span>·</span><span>Used {p.usageCount}×</span><span>·</span><span>Updated {fmtAgo(p.updatedAt)}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
            {p.documentKeys.map((k: string) => <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#3a3a3c' }}><Icon name="check" size={13} style={{ color: '#34C759' }} />{DOC_CATALOG[k]?.name || k}</div>)}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Hover as="button" onClick={() => onSend(p)} style={{ ...primaryBtn, height: 34, padding: '0 14px', fontSize: 12.5, flex: 1, justifyContent: 'center' }} hover={{ background: '#0066D6' }}><Icon name="send" size={14} />Send Package</Hover>
            <Hover as="button" onClick={() => onEdit(p)} style={{ ...ghostBtn, height: 34, padding: '0 11px', fontSize: 12.5 }} hover={{ background: 'rgba(0,0,0,0.04)' }}>Edit</Hover>
            <Hover as="button" onClick={() => { svc.duplicatePackage(p.id); toast('Duplicated', 'success'); }} style={{ ...ghostBtn, height: 34, padding: '0 11px', fontSize: 12.5 }} hover={{ background: 'rgba(0,0,0,0.04)' }}>Duplicate</Hover>
            <RowMenuPackage p={p} toast={toast} setConfirm={setConfirm} />
          </div>
        </Card>)}
      </div>}
  </div>;
}
function RowMenuPackage({ p, toast, setConfirm }: any) {
  const [open, setOpen] = React.useState(false);
  return <div style={{ position: 'relative' }}>
    <Hover as="button" onClick={() => setOpen((o) => !o)} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${T.border}`, background: '#fff', color: T.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="more" size={16} /></Hover>
    {open && <><div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
      <div style={{ position: 'absolute', bottom: 40, right: 0, zIndex: 31, minWidth: 170, background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.14)', padding: 6 }}>
        <MenuRow icon={p.status === 'archived' ? 'refresh' : 'inbox'} label={p.status === 'archived' ? 'Restore' : 'Archive'} onClick={() => { svc.archivePackage(p.id); setOpen(false); toast(p.status === 'archived' ? 'Restored' : 'Archived', 'info'); }} />
        <MenuRow icon="trash" label="Delete" danger onClick={() => { setOpen(false); setConfirm({ title: 'Delete package?', body: `“${p.name}” will be removed.`, confirmLabel: 'Delete', danger: true, onConfirm: () => { svc.removePackage(p.id); toast('Deleted', 'info'); } }); }} />
      </div></>}
  </div>;
}
function MenuRow({ icon, label, onClick, danger }: any) { return <Hover as="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', background: 'transparent', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: danger ? '#C62820' : T.text }} hover={{ background: danger ? 'rgba(255,59,48,0.08)' : 'rgba(0,0,0,0.05)' }}><Icon name={icon} size={15} style={{ color: danger ? '#C62820' : T.muted }} />{label}</Hover>; }

/* ───────────────────────── SETTINGS ───────────────────────── */
function SettingsTab({ store, toast }: any) {
  const s = store.settings;
  const set = (path: string, v: any) => svc.setSettingPath(path, v);
  return <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
    <Card style={{ padding: 20 }}>
      <H2 icon="image">Branding</H2>
      <Field label="Sender name"><Input value={s.branding.senderName} onChange={(e: any) => set('branding.senderName', e.target.value)} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Logo text"><Input value={s.branding.logoText} onChange={(e: any) => set('branding.logoText', e.target.value)} /></Field>
        <Field label="Primary color"><input type="color" value={s.branding.primaryColor} onChange={(e) => set('branding.primaryColor', e.target.value)} style={{ width: '100%', height: 38, borderRadius: 10, border: `1px solid ${T.border}`, cursor: 'pointer', background: '#fff' }} /></Field>
      </div>
      <Field label="Email footer"><Input value={s.branding.emailFooter} onChange={(e: any) => set('branding.emailFooter', e.target.value)} /></Field>
    </Card>

    <Card style={{ padding: 20 }}>
      <H2 icon="mail">Email templates</H2>
      {Object.entries(s.emailTemplates).map(([k, v]: any) => <div key={k} style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'capitalize', color: T.muted, marginBottom: 6 }}>{k}</div>
        <Input value={v.subject} onChange={(e: any) => set(`emailTemplates.${k}.subject`, e.target.value)} placeholder="Subject" style={{ marginBottom: 6 }} />
        <Textarea rows={2} value={v.message} onChange={(e: any) => set(`emailTemplates.${k}.message`, e.target.value)} placeholder="Message" />
      </div>)}
    </Card>

    <Card style={{ padding: '6px 20px 14px' }}>
      <div style={{ paddingTop: 14 }}><H2 icon="bell">Reminders</H2></div>
      <SettingRow label="Reminder frequency" desc="Days between automatic reminders"><Input type="number" value={s.reminders.everyDays} onChange={(e: any) => set('reminders.everyDays', +e.target.value)} style={{ width: 90 }} /></SettingRow>
      <SettingRow label="Max reminders" desc="Stop after this many"><Input type="number" value={s.reminders.maxCount} onChange={(e: any) => set('reminders.maxCount', +e.target.value)} style={{ width: 90 }} /></SettingRow>
      <SettingRow label="Reminder message"><Input value={s.reminders.message} onChange={(e: any) => set('reminders.message', e.target.value)} style={{ width: 280 }} /></SettingRow>
    </Card>

    <Card style={{ padding: '6px 20px 14px' }}>
      <div style={{ paddingTop: 14 }}><H2 icon="clock">Expiration</H2></div>
      <SettingRow label="Default expiration" desc="Days until an envelope expires"><Input type="number" value={s.expiration.days} onChange={(e: any) => set('expiration.days', +e.target.value)} style={{ width: 90 }} /></SettingRow>
      <SettingRow label="Expiring-soon threshold" desc="Flag as expiring within N days"><Input type="number" value={s.expiration.expiringSoonDays} onChange={(e: any) => set('expiration.expiringSoonDays', +e.target.value)} style={{ width: 90 }} /></SettingRow>
    </Card>

    <Card style={{ padding: '6px 20px 14px' }}>
      <div style={{ paddingTop: 14 }}><H2 icon="users">Recipients & fields</H2></div>
      <SettingRow label="Default signing order"><Select value={s.recipients.defaultOrder} onChange={(v: string) => set('recipients.defaultOrder', v)} options={[{ value: 'sequential', label: 'Sequential' }, { value: 'parallel', label: 'Parallel' }]} style={{ width: 150 }} /></SettingRow>
      <SettingRow label="Default recipient role"><Select value={s.recipients.defaultRole} onChange={(v: string) => set('recipients.defaultRole', v)} options={[{ value: 'signer', label: 'Needs to Sign' }, { value: 'cc', label: 'Receives a Copy' }, { value: 'viewer', label: 'Needs to View' }]} style={{ width: 170 }} /></SettingRow>
      <SettingRow label="Fields required by default"><Toggle on={s.fields.defaultRequired} onChange={(v: boolean) => set('fields.defaultRequired', v)} /></SettingRow>
    </Card>

    <Card style={{ padding: '6px 20px 14px' }}>
      <div style={{ paddingTop: 14 }}><H2 icon="shield">Permissions & mode</H2></div>
      <SettingRow label="Simulation mode" desc="No real emails are sent; signing is simulated"><Toggle on={s.simulationMode} onChange={(v: boolean) => set('simulationMode', v)} /></SettingRow>
      <SettingRow label="Recruiters can void envelopes"><Toggle on={s.permissions.recruiterCanVoid} onChange={(v: boolean) => set('permissions.recruiterCanVoid', v)} /></SettingRow>
      <SettingRow label="Recruiters can delete drafts"><Toggle on={s.permissions.recruiterCanDelete} onChange={(v: boolean) => set('permissions.recruiterCanDelete', v)} /></SettingRow>
      <SettingRow label="Viewers can download completed PDFs"><Toggle on={s.permissions.viewerCanDownload} onChange={(v: boolean) => set('permissions.viewerCanDownload', v)} /></SettingRow>
    </Card>

    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <Hover as="button" onClick={() => { svc.resetDemo(); toast('Demo data reset', 'info'); }} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="refresh" size={15} />Reset demo data</Hover>
      <span style={{ fontSize: 12, color: T.faint, alignSelf: 'center' }}>Settings save automatically</span>
    </div>
  </div>;
}
function H2({ icon, children }: any) { return <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><Icon name={icon} size={16} style={{ color: T.muted }} /><span style={{ fontSize: 15, fontWeight: 650 }}>{children}</span></div>; }
