/* Templates: library with search, use a template for a driver, bulk send
   (one envelope per driver, merge fields filled; CSV import), and
   self-service links (PowerForm-style) that let a driver start a template. */
import React from 'react';
import { T } from '../tasks/lib';
import { Template, Person, parseRecipientsCsv, CsvRecipient, fmtAgo, actionLabel } from './model';
import { svc, store, useEsign, PowerForm } from './store';
import { listPeople } from './integrations';
import { Icon, Btn, IconButton, Card, Modal, Input, Textarea, Select, Chip, Dropdown, MenuItem, MenuSep, EmptyState, Segmented, Checkbox, Label, inputStyle, useWidth, Field as FormField } from './ui';
import { PersonPicker } from './builder';

export interface TemplatesApi {
  toast: (t: string, k?: string, a?: any) => void;
  edit: (tplId: string) => void;
  create: () => void;
  use: (tplId?: string) => void;
  bulk: (tplId?: string) => void;
  openSession: (s: { envId: string; rid: string; mode: 'remote' }) => void;
  openManage: (view: string) => void;
}

export function TemplatesView({ api }: { api: TemplatesApi }) {
  const st = useEsign();
  const [q, setQ] = React.useState('');
  const [cat, setCat] = React.useState('all');
  const [pf, setPf] = React.useState<PowerForm | null>(null);
  const width = useWidth();
  const cats = ['all', ...new Set(st.templates.map((t) => t.category))];
  const rows = st.templates.filter((t) => (cat === 'all' ? t.status !== 'archived' : cat === 'archived' ? t.status === 'archived' : cat === 'favorites' ? t.favorite : t.category === cat && t.status !== 'archived'))
    .filter((t) => !q || `${t.name} ${t.description} ${t.carrier || ''} ${t.documents.map((d) => d.name).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || +new Date(b.updatedAt) - +new Date(a.updatedAt));
  return <div style={{ maxWidth: 1240, margin: '0 auto' }} data-testid="templates-view">
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      <div style={{ position: 'relative', flex: '1 1 260px' }}>
        <span style={{ position: 'absolute', left: 11, top: 11, color: T.faint }}><Icon name="search" size={16} /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates, documents, carriers…" aria-label="Search templates" data-testid="template-search" style={{ ...inputStyle, paddingLeft: 34 }} />
      </div>
      <Btn icon="layers" onClick={() => api.bulk()} data-testid="bulk-send-open">Bulk send</Btn>
      <Btn kind="primary" icon="plus" onClick={api.create} data-testid="new-template">New template</Btn>
    </div>
    <div style={{ marginBottom: 14 }}><Segmented size="sm" value={cat} onChange={setCat} options={[...cats.map((c) => ({ value: c, label: c === 'all' ? 'All' : c })), { value: 'favorites', label: 'Favorites', icon: 'star' }, { value: 'archived', label: 'Archived' }]} /></div>
    {rows.length === 0 ? <Card><EmptyState icon="copy" title={q ? 'No templates match' : 'No templates here'} body="Save an envelope as a template, or build one with roles and fields." action={<Btn kind="primary" icon="plus" onClick={api.create}>New template</Btn>} /></Card>
      : <div style={{ display: 'grid', gridTemplateColumns: `repeat(${width < 760 ? 1 : width < 1200 ? 2 : 3}, minmax(0, 1fr))`, gap: 14 }}>
        {rows.map((t) => <TemplateCard key={t.id} t={t} api={api} onLink={() => { const p = svc.createPowerForm(t.id); if (p) { api.toast('Self-service link created', 'success'); setPf(p); } }} />)}
      </div>}
    <PowerFormsSection api={api} onOpen={setPf} />
    <BatchesSection api={api} />
    {pf && <PowerFormModal pf={pf} api={api} onClose={() => setPf(null)} />}
  </div>;
}

function TemplateCard({ t, api, onLink }: { t: Template; api: TemplatesApi; onLink: () => void }) {
  return <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 10, background: t.category === 'Carrier packet' ? 'rgba(88,86,214,0.12)' : 'rgba(0,122,255,0.1)', color: t.category === 'Carrier packet' ? '#5856D6' : '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={t.category === 'Carrier packet' ? 'briefcase' : 'copy'} size={18} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3 }} data-testid="template-name">{t.name}</div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 3, lineHeight: 1.45 }}>{t.description || `${t.documents.length} document${t.documents.length === 1 ? '' : 's'}`}</div>
      </div>
      <IconButton icon="star" title={t.favorite ? 'Remove from favorites' : 'Add to favorites'} active={!!t.favorite} onClick={() => svc.updateTemplate(t.id, { favorite: !t.favorite })} />
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {t.roles.map((r) => <Chip key={r.id} bg={`${r.color}1a`} color={r.color}>{r.roleName} · {actionLabel(r.action).replace('Needs to ', '')}</Chip>)}
    </div>
    <div style={{ fontSize: 11.5, color: T.faint }}>{t.documents.length} doc{t.documents.length === 1 ? '' : 's'} · {t.fields.length} fields · used {t.usageCount}×{t.lastUsed ? ` · last ${fmtAgo(t.lastUsed)}` : ''}{t.carrier ? ` · ${t.carrier}` : ''}</div>
    <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
      <Btn kind="primary" size="sm" icon="send" onClick={() => api.use(t.id)} data-testid="template-use" style={{ flex: 1 }}>Use</Btn>
      <Btn size="sm" icon="layers" onClick={() => api.bulk(t.id)} data-testid="template-bulk">Bulk send</Btn>
      <Dropdown align="right" width={220} trigger={<IconButton icon="more" title="Template actions" />}>
        {(close: any) => { const run = (fn: () => void) => () => { close(); fn(); }; return <>
          <MenuItem icon="pencil" label="Edit" onClick={run(() => api.edit(t.id))} />
          <MenuItem icon="copy" label="Duplicate" onClick={run(() => { svc.duplicateTemplate(t.id); api.toast('Template duplicated', 'success'); })} />
          <MenuItem icon="link" label="Create self-service link" hint="Drivers start this template themselves" onClick={run(onLink)} />
          <MenuItem icon="archive" label={t.status === 'archived' ? 'Restore' : 'Archive'} onClick={run(() => { svc.updateTemplate(t.id, { status: t.status === 'archived' ? 'active' : 'archived' }); api.toast(t.status === 'archived' ? 'Template restored' : 'Template archived', 'info'); })} />
          <MenuSep />
          <MenuItem icon="trash" label="Delete" danger onClick={run(() => { const removed = svc.removeTemplate(t.id); if (removed) api.toast(`Deleted "${removed.name}"`, 'info', { label: 'Undo', run: () => svc.restoreTemplate(removed) }); })} />
        </>; }}
      </Dropdown>
    </div>
  </Card>;
}

/* ───────────────────────── use a template ───────────────────────── */
export function UseTemplateModal({ tplId, onClose, onCreated, toast }: { tplId?: string; onClose: () => void; onCreated: (envId: string) => void; toast: any }) {
  useEsign();
  const [id, setId] = React.useState(tplId || '');
  const [q, setQ] = React.useState('');
  const [person, setPerson] = React.useState<Person | null>(null);
  const t = svc.template(id);
  const list = store.templates.filter((x) => x.status !== 'archived' && (!q || x.name.toLowerCase().includes(q.toLowerCase())));
  const go = () => {
    const out = svc.envelopeFromTemplate(id, person);
    if (!out) return;
    if (out.missing.length && person) toast(`${person.name}: ${out.missing.length} driver field${out.missing.length > 1 ? 's' : ''} have no data yet — fill them in Prepare`, 'warning');
    onCreated(out.env.id);
  };
  return <Modal title={t ? `Use “${t.name}”` : 'Use a template'} subtitle={t ? 'Choose the driver — their name, email and driver data fill in automatically.' : 'Pick a template to start from.'} onClose={onClose} width={560}
    footer={<>{t && !tplId && <Btn kind="plain" onClick={() => setId('')}>Back</Btn>}<Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!t} onClick={go} data-testid="use-continue">Continue</Btn></>}>
    {!t ? <>
      <Input value={q} onChange={(e: any) => setQ(e.target.value)} placeholder="Search templates" autoFocus style={{ marginBottom: 10 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{list.map((x) => <MenuItem key={x.id} icon={x.category === 'Carrier packet' ? 'briefcase' : 'copy'} label={x.name} hint={`${x.documents.length} docs · ${x.roles.map((r) => r.roleName).join(', ')}`} onClick={() => setId(x.id)} />)}</div>
    </> : <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>{t.documents.map((d) => <Chip key={d.id} icon="fileText">{d.name}</Chip>)}</div>
      <Label>{svc.driverRole(t).roleName}</Label>
      <DriverList selected={person ? [person] : []} onToggle={(p) => setPerson(person?.id === p.id ? null : p)} single />
      <div style={{ fontSize: 12, color: T.faint, marginTop: 8 }}>No driver? Continue and type the recipient on the next screen.</div>
    </>}
  </Modal>;
}

function DriverList({ selected, onToggle, single, height = 280, carrierFilter }: { selected: Person[]; onToggle: (p: Person) => void; single?: boolean; height?: number; carrierFilter?: string }) {
  const [q, setQ] = React.useState('');
  const people = React.useMemo(() => listPeople(), []);
  const rows = people.filter((p) => (!carrierFilter || (p.carrierInfo?.name || p.carrier || '').startsWith(carrierFilter)) && (!q || `${p.name} ${p.email} ${p.carrier} ${p.phone}`.toLowerCase().includes(q.toLowerCase())));
  const isSel = (p: Person) => selected.some((s) => s.id === p.id && s.kind === p.kind);
  return <div>
    <Input value={q} onChange={(e: any) => setQ(e.target.value)} placeholder="Search drivers and leads" style={{ marginBottom: 8, height: 34 }} data-testid="driver-search" />
    <div style={{ maxHeight: height, overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: 10 }} data-testid="driver-list">
      {rows.map((p, i) => <label key={`${p.kind}:${p.id}`} data-testid="driver-option" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i ? `1px solid ${T.hair}` : 'none', cursor: 'pointer', background: isSel(p) ? 'rgba(0,122,255,0.05)' : '#fff' }}>
        <input type={single ? 'radio' : 'checkbox'} checked={isSel(p)} onChange={() => onToggle(p)} style={{ accentColor: '#007AFF', width: 16, height: 16 }} />
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: 11.5, color: T.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[p.kind === 'lead' ? 'Lead' : p.position, p.carrierInfo?.name || p.carrier, p.email].filter(Boolean).join(' · ')}</div></div>
        {!p.email && <Chip color="#A05A00" bg="rgba(255,159,10,0.14)">No email</Chip>}
      </label>)}
      {!rows.length && <div style={{ padding: 14, fontSize: 12.5, color: T.faint }}>No drivers match.</div>}
    </div>
  </div>;
}

/* ───────────────────────── bulk send ───────────────────────── */
export function BulkSendModal({ tplId, onClose, api }: { tplId?: string; onClose: () => void; api: TemplatesApi }) {
  useEsign();
  const [id, setId] = React.useState(tplId || store.templates.find((t) => t.status === 'active')?.id || '');
  const [tab, setTab] = React.useState<'drivers' | 'csv'>('drivers');
  const [picked, setPicked] = React.useState<Person[]>([]);
  const [csv, setCsv] = React.useState('');
  const [csvRows, setCsvRows] = React.useState<CsvRecipient[]>([]);
  const [result, setResult] = React.useState<null | { ok: number; failed: { name: string; error?: string }[] }>(null);
  const [carrier, setCarrier] = React.useState('');
  const t = svc.template(id);
  const parse = (text: string) => { setCsv(text); setCsvRows(parseRecipientsCsv(text)); };
  const validCsv = csvRows.filter((r) => !r.error);
  const rows = tab === 'drivers' ? picked.filter((p) => p.email).map((p) => ({ person: p, name: p.name, email: p.email!, phone: p.phone })) : validCsv.map((r) => {
    const match = listPeople().find((p) => (p.email && p.email.toLowerCase() === r.email.toLowerCase()) || p.name.toLowerCase() === r.name.toLowerCase());
    return { person: match ? { ...match, email: r.email, phone: r.phone || match.phone } : ({ name: r.name, email: r.email, phone: r.phone, carrier: r.carrier, carrierInfo: r.carrier ? { name: r.carrier } : null } as Person), name: r.name, email: r.email, phone: r.phone };
  });
  const noEmail = tab === 'drivers' ? picked.filter((p) => !p.email).length : 0;
  const send = () => {
    const out = svc.bulkSend(id, rows); if (!out) return;
    setResult({ ok: out.batch.count, failed: out.results.filter((r) => !r.ok) });
    api.toast(`Sent ${out.batch.count} envelope${out.batch.count === 1 ? '' : 's'}`, out.batch.failed ? 'warning' : 'success');
  };
  if (result) return <Modal title="Bulk send complete" onClose={onClose} width={480} footer={<><Btn onClick={onClose}>Close</Btn><Btn kind="primary" onClick={() => { onClose(); api.openManage('sent'); }} data-testid="bulk-view">View in Manage</Btn></>}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ width: 44, height: 44, borderRadius: 99, background: 'rgba(52,199,89,0.12)', color: '#34C759', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="checkCircle" size={22} /></span><div><div style={{ fontSize: 15, fontWeight: 700 }} data-testid="bulk-result">{result.ok} envelope{result.ok === 1 ? '' : 's'} sent</div><div style={{ fontSize: 12.5, color: T.muted }}>One separate envelope per recipient, with driver data filled in.</div></div></div>
    {result.failed.length > 0 && <div style={{ marginTop: 14, fontSize: 12.5, color: '#B3261E' }}>{result.failed.map((f) => <div key={f.name}>· {f.name}: {f.error}</div>)}</div>}
  </Modal>;
  const carriers = [...new Set(listPeople().map((p) => p.carrierInfo?.name || p.carrier).filter(Boolean))] as string[];
  return <Modal title="Bulk send" subtitle="Send a template to many drivers at once — each gets their own envelope." onClose={onClose} width={640}
    footer={<><span style={{ flex: 1, fontSize: 12.5, color: T.muted }}>{rows.length} envelope{rows.length === 1 ? '' : 's'} will be sent{noEmail ? ` · ${noEmail} skipped (no email)` : ''}</span><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" icon="send" disabled={!t || !rows.length} onClick={send} data-testid="bulk-send">Send {rows.length || ''}</Btn></>}>
    <FormField label="Template"><Select value={id} onChange={setId} options={store.templates.filter((x) => x.status === 'active').map((x) => ({ value: x.id, label: x.name }))} data-testid="bulk-template" /></FormField>
    {t && <div style={{ fontSize: 12, color: T.faint, margin: '-6px 0 14px' }}>Each driver becomes “{svc.driverRole(t).roleName}”. {t.roles.filter((r) => r.id !== svc.driverRole(t).id).map((r) => `${r.roleName}: ${r.name || 'unassigned'}`).join(' · ')}</div>}
    <div style={{ marginBottom: 12 }}><Segmented value={tab} onChange={setTab} options={[{ value: 'drivers', label: 'Choose drivers', icon: 'truck' }, { value: 'csv', label: 'Import CSV', icon: 'table' }]} /></div>
    {tab === 'drivers' ? <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select value={carrier} onChange={setCarrier} options={[{ value: '', label: 'All carriers' }, ...carriers.map((c) => ({ value: c, label: c }))]} style={{ width: 240, height: 34 }} />
        <Btn size="sm" onClick={() => setPicked(listPeople().filter((p) => p.email && (!carrier || (p.carrierInfo?.name || p.carrier || '').startsWith(carrier))))}>Select all</Btn>
        {picked.length > 0 && <Btn size="sm" kind="plain" onClick={() => setPicked([])}>Clear ({picked.length})</Btn>}
      </div>
      <DriverList carrierFilter={carrier} selected={picked} onToggle={(p) => setPicked((s) => (s.some((x) => x.id === p.id && x.kind === p.kind) ? s.filter((x) => !(x.id === p.id && x.kind === p.kind)) : [...s, p]))} />
    </> : <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'inline-flex' }}><span style={{ position: 'absolute', opacity: 0, width: 1, height: 1, overflow: 'hidden' }}>CSV file</span><input type="file" accept=".csv,text/csv" data-testid="csv-input" onChange={async (e) => { const f = e.target.files?.[0]; if (f) parse(await f.text()); e.target.value = ''; }} style={{ fontSize: 12.5 }} /></label>
        <span style={{ fontSize: 12, color: T.faint }}>Columns: name, email, phone (optional: carrier)</span>
      </div>
      <Textarea rows={4} value={csv} onChange={(e: any) => parse(e.target.value)} placeholder={'name,email,phone\nMike Okafor,mike@example.com,(555) 010-0105'} data-testid="csv-text" style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }} />
      {csvRows.length > 0 && <div style={{ marginTop: 10, border: `1px solid ${T.border}`, borderRadius: 10, maxHeight: 200, overflowY: 'auto' }} data-testid="csv-preview">
        {csvRows.map((r, i) => <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 12px', borderTop: i ? `1px solid ${T.hair}` : 'none', fontSize: 12.5, alignItems: 'center' }}>
          <Icon name={r.error ? 'alert' : 'check'} size={14} style={{ color: r.error ? '#C62820' : '#34C759' }} />
          <span style={{ flex: 1, minWidth: 0 }}><b>{r.name || '—'}</b> · {r.email || '—'}{r.phone ? ` · ${r.phone}` : ''}</span>
          {r.error && <span style={{ color: '#C62820', fontSize: 11.5 }}>{r.error}</span>}
        </div>)}
      </div>}
    </>}
  </Modal>;
}

/* ───────────────────────── self-service links ───────────────────────── */
function PowerFormsSection({ api, onOpen }: { api: TemplatesApi; onOpen: (p: PowerForm) => void }) {
  const st = useEsign();
  if (!st.powerforms.length) return null;
  return <div style={{ marginTop: 26 }} data-testid="powerforms">
    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Self-service links</div>
    <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 10 }}>Share a link (e.g. on your careers page). Drivers enter their name and email, then sign the template — no envelope needed from you.</div>
    <Card style={{ overflow: 'hidden' }}>{st.powerforms.map((p, i) => <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i ? `1px solid ${T.hair}` : 'none', flexWrap: 'wrap' }}>
      <Icon name="link" size={15} style={{ color: p.active ? '#007AFF' : T.faint }} />
      <div style={{ flex: 1, minWidth: 200 }}><div style={{ fontSize: 13, fontWeight: 650 }}>{p.name}</div><div style={{ fontSize: 11.5, color: T.faint, fontFamily: 'ui-monospace, Menlo, monospace' }}>{location.origin}/sign/{p.id.replace(/^pf_/, '')}</div></div>
      <span style={{ fontSize: 11.5, color: T.faint }}>{p.uses} use{p.uses === 1 ? '' : 's'}</span>
      <Btn size="sm" onClick={() => { navigator.clipboard?.writeText(`${location.origin}/sign/${p.id.replace(/^pf_/, '')}`).catch(() => {}); api.toast('Link copied (needs the backend to work outside this device)', 'info'); }}>Copy link</Btn>
      <Btn size="sm" kind="primary" disabled={!p.active} onClick={() => onOpen(p)} data-testid="powerform-open">Open</Btn>
      <Dropdown align="right" width={180} trigger={<IconButton icon="more" title="Link actions" />}>{(close: any) => <><MenuItem icon={p.active ? 'ban' : 'check'} label={p.active ? 'Deactivate' : 'Activate'} onClick={() => { svc.togglePowerForm(p.id); close(); }} /><MenuItem icon="trash" danger label="Delete" onClick={() => { svc.removePowerForm(p.id); close(); }} /></>}</Dropdown>
    </div>)}</Card>
  </div>;
}

function PowerFormModal({ pf, api, onClose }: { pf: PowerForm; api: TemplatesApi; onClose: () => void }) {
  const [name, setName] = React.useState(''); const [email, setEmail] = React.useState(''); const [phone, setPhone] = React.useState('');
  const ok = name.trim().length > 1 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  return <Modal title={pf.name} subtitle={pf.instructions} onClose={onClose} width={460} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!ok} data-testid="powerform-start" onClick={() => { const res = svc.submitPowerForm(pf.id, { name: name.trim(), email: email.trim(), phone: phone.trim() }); if (!res || res.errors?.length || !res.recipientId) { api.toast(res?.errors?.[0] || 'This link is not available', 'error'); return; } onClose(); api.openSession({ envId: res.env.id, rid: res.recipientId, mode: 'remote' }); }}>Begin signing</Btn></>}>
    <div style={{ fontSize: 12, color: '#8E5A00', background: 'rgba(255,159,10,0.1)', borderRadius: 8, padding: '6px 10px', marginBottom: 12 }}>This is the page a driver sees when opening the self-service link.</div>
    <FormField label="Full name"><Input value={name} onChange={(e: any) => setName(e.target.value)} autoFocus data-testid="pf-name" /></FormField>
    <FormField label="Email"><Input value={email} onChange={(e: any) => setEmail(e.target.value)} type="email" data-testid="pf-email" /></FormField>
    <FormField label="Mobile (optional)"><Input value={phone} onChange={(e: any) => setPhone(e.target.value)} /></FormField>
  </Modal>;
}

function BatchesSection({ api }: { api: TemplatesApi }) {
  const st = useEsign();
  if (!st.batches.length) return null;
  return <div style={{ marginTop: 26 }}>
    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Recent bulk sends</div>
    <Card style={{ overflow: 'hidden' }}>{st.batches.slice(0, 6).map((b, i) => {
      const envs = st.envelopes.filter((e) => e.batchId === b.id);
      const done = envs.filter((e) => e.status === 'completed').length;
      return <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i ? `1px solid ${T.hair}` : 'none' }}>
        <Icon name="layers" size={15} style={{ color: T.muted }} />
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 650 }}>{b.name}</div><div style={{ fontSize: 11.5, color: T.faint }}>{b.count} sent{b.failed ? ` · ${b.failed} failed` : ''} · {done} completed · {fmtAgo(b.createdAt)}</div></div>
        <div style={{ width: 120, height: 6, borderRadius: 9, background: '#E5E5EA', overflow: 'hidden' }}><div style={{ width: `${envs.length ? (done / envs.length) * 100 : 0}%`, height: 6, background: '#34C759' }} /></div>
        <Btn size="sm" kind="plain" onClick={() => api.openManage('sent')}>View</Btn>
      </div>;
    })}</Card>
  </div>;
}
