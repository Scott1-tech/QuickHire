/* Manage — folders (Inbox, Sent, Drafts, Deleted, custom), quick views
   (Action required, Waiting, Expiring, Completed, Declined/Voided), search and
   filters, and the envelope details drawer with per-recipient timelines, the
   full audit trail and every envelope action. */
import React from 'react';
import { T } from '../tasks/lib';
import { Envelope, Recipient, ViewKey, inView, statusLine, activeRecipients, isExpiringSoon, needsSenderAction, fmtAgo, fmtDate, fmtDateTime, daysUntil, shortId, actionLabel, isDone, IN_FLIGHT, STATUS_META } from './model';
import { svc, store, useEsign } from './store';
import { downloadSignedPdf, downloadCertificate, downloadOriginals, downloadFormData } from './actions';
import { Icon, Btn, IconButton, StatusPill, Drawer, Dropdown, MenuItem, MenuSep, Modal, Input, Textarea, Select, Chip, RecipientAvatar, EmptyState, Card, Label, hexA, useWidth, inputStyle, Field as FormField } from './ui';

export type SessionReq = { envId: string; rid: string; mode: 'remote' | 'inperson' | 'self' };
export interface ManageApi {
  openDetails: (id: string) => void;
  editDraft: (id: string) => void;
  correct: (id: string) => void;
  openSession: (s: SessionReq) => void;
  toast: (t: string, k?: string, a?: any) => void;
  start: () => void;
}

const VIEWS: { key: ViewKey; label: string; icon: string; group: 'Envelopes' | 'Quick views' }[] = [
  { key: 'inbox', label: 'Inbox', icon: 'inbox', group: 'Envelopes' }, { key: 'sent', label: 'Sent', icon: 'send', group: 'Envelopes' },
  { key: 'drafts', label: 'Drafts', icon: 'fileText', group: 'Envelopes' }, { key: 'deleted', label: 'Deleted', icon: 'trash', group: 'Envelopes' },
  { key: 'action', label: 'Action required', icon: 'alert', group: 'Quick views' }, { key: 'waiting', label: 'Waiting for others', icon: 'clock', group: 'Quick views' },
  { key: 'expiring', label: 'Expiring soon', icon: 'snooze', group: 'Quick views' }, { key: 'completed', label: 'Completed', icon: 'checkCircle', group: 'Quick views' },
  { key: 'closed', label: 'Declined / Voided', icon: 'ban', group: 'Quick views' },
];
export const viewLabel = (k: string) => VIEWS.find((v) => v.key === k)?.label || 'All';

/** Primary row/drawer action for an envelope (one primary action per screen). */
export function primaryAction(e: Envelope): { label: string; icon: string; run: (api: ManageApi) => void } | null {
  if (e.deletedAt) return { label: 'Restore', icon: 'rotateCcw', run: (api) => { svc.restore(e.id); api.toast('Envelope restored', 'success'); } };
  if (e.status === 'draft') return { label: 'Continue', icon: 'pencil', run: (api) => api.editDraft(e.id) };
  if (e.status === 'correcting') return { label: 'Resume correcting', icon: 'pencil', run: (api) => api.correct(e.id) };
  if (IN_FLIGHT.includes(e.status)) {
    const act = activeRecipients(e);
    const me = svc.me().email.toLowerCase();
    const mine = act.find((r) => r.email.toLowerCase() === me);
    if (mine) return { label: 'Sign', icon: 'sign', run: (api) => api.openSession({ envId: e.id, rid: mine.id, mode: e.selfSign ? 'self' : 'remote' }) };
    const host = act.find((r) => r.action === 'in_person');
    if (host) return { label: 'Host signing', icon: 'users', run: (api) => api.openSession({ envId: e.id, rid: host.id, mode: 'inperson' }) };
    return { label: 'Remind', icon: 'bell', run: (api) => { const r = svc.remind(e.id); api.toast(r.ok ? 'Reminder sent' : r.message || 'Could not remind', r.ok ? 'success' : 'warning'); } };
  }
  if (e.status === 'completed') return { label: 'Download', icon: 'download', run: (api) => { downloadSignedPdf(e, { withCertificate: true }).catch(() => api.toast('Download failed', 'error')); } };
  return { label: 'Clone', icon: 'copy', run: (api) => { const c = svc.clone(e.id); if (c) { api.toast('Cloned as a new draft', 'success'); api.editDraft(c.id); } } };
}

/* ───────────────────────── Manage view ───────────────────────── */
export function ManageView({ api, initialView = 'sent' }: { api: ManageApi; initialView?: string }) {
  const st = useEsign();
  const width = useWidth();
  const narrow = width < 980;
  const [view, setView] = React.useState<string>(initialView);
  React.useEffect(() => { setView(initialView); }, [initialView]);
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [range, setRange] = React.useState('any');
  const [from, setFrom] = React.useState(''); const [to, setTo] = React.useState('');
  const [driver, setDriver] = React.useState('');
  const [carrier, setCarrier] = React.useState('');
  const [limit, setLimit] = React.useState(50);
  const [folderModal, setFolderModal] = React.useState(false);

  const drivers = React.useMemo(() => [...new Set(st.envelopes.map((e) => e.driverName).filter(Boolean))].sort(), [st.rev]);
  const carriers = React.useMemo(() => [...new Set(st.envelopes.map((e) => e.carrier).filter(Boolean))].sort(), [st.rev]);
  const rows = React.useMemo(() => {
    const now = Date.now();
    const minDate = range === '7' ? now - 7 * 864e5 : range === '30' ? now - 30 * 864e5 : range === '90' ? now - 90 * 864e5 : range === 'custom' && from ? +new Date(from + 'T00:00:00') : 0;
    const maxDate = range === 'custom' && to ? +new Date(to + 'T23:59:59') : Infinity;
    const needle = q.trim().toLowerCase();
    return st.envelopes.filter((e) => {
      if (view.startsWith('fld_')) { if (e.folder !== view || e.deletedAt) return false; } else if (!inView(e, view as ViewKey, now)) return false;
      if (status !== 'all' && e.status !== status) return false;
      const t = +new Date(e.lastActivity || e.createdAt);
      if (t < minDate || t > maxDate) return false;
      if (driver && e.driverName !== driver) return false;
      if (carrier && e.carrier !== carrier) return false;
      if (needle) { const hay = `${e.title} ${e.subject} ${e.driverName} ${e.carrier} ${shortId(e.id)} ${e.recipients.map((r) => `${r.name} ${r.email}`).join(' ')} ${e.documents.map((d) => d.name).join(' ')}`.toLowerCase(); if (!hay.includes(needle)) return false; }
      return true;
    }).sort((a, b) => +new Date(b.lastActivity) - +new Date(a.lastActivity));
  }, [st.rev, view, q, status, range, from, to, driver, carrier]);
  const counts = svc.counts();
  const filtersOn = status !== 'all' || range !== 'any' || driver || carrier || q;

  const nav = <nav aria-label="Envelope folders" style={{ width: 216, flex: 'none' }}>
    {(['Envelopes', 'Quick views'] as const).map((g) => <div key={g} style={{ marginBottom: 14 }}>
      <Label style={{ margin: '0 10px 6px' }}>{g}</Label>
      {VIEWS.filter((v) => v.group === g).map((v) => <NavItem key={v.key} on={view === v.key} icon={v.icon} label={v.label} count={counts[v.key]} onClick={() => { setView(v.key); setLimit(50); }} testId={`view-${v.key}`} />)}
    </div>)}
    <Label style={{ margin: '0 10px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>Folders<button type="button" onClick={() => setFolderModal(true)} title="New folder" style={{ border: 'none', background: 'transparent', color: '#007AFF', cursor: 'pointer', padding: 0, display: 'flex' }}><Icon name="folderPlus" size={14} /></button></Label>
    {st.folders.map((f) => <NavItem key={f.id} on={view === f.id} icon="folder" label={f.name} count={st.envelopes.filter((e) => e.folder === f.id && !e.deletedAt).length} onClick={() => setView(f.id)} onDelete={() => { svc.deleteFolder(f.id); if (view === f.id) setView('sent'); api.toast(`Folder "${f.name}" deleted`, 'info'); }} />)}
    {!st.folders.length && <div style={{ fontSize: 12, color: T.faint, padding: '2px 10px' }}>Organize envelopes by carrier, driver class or hiring event.</div>}
  </nav>;

  return <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', gap: 22, alignItems: 'flex-start' }} data-testid="manage-view">
    {!narrow && nav}
    <div style={{ flex: 1, minWidth: 0 }}>
      {narrow && <div style={{ marginBottom: 10 }}><Select value={view} onChange={setView} options={[...VIEWS.map((v) => ({ value: v.key, label: `${v.label} (${counts[v.key]})` })), ...st.folders.map((f) => ({ value: f.id, label: `Folder: ${f.name}` }))]} aria-label="View" /></div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 11, top: 11, color: T.faint }}><Icon name="search" size={16} /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search driver, subject, recipient, ID…" aria-label="Search envelopes" data-testid="manage-search" style={{ ...inputStyle, paddingLeft: 34 }} />
        </div>
        <Select value={status} onChange={setStatus} aria-label="Status" options={[{ value: 'all', label: 'Any status' }, ...['draft', 'sent', 'viewed', 'partially_signed', 'correcting', 'completed', 'declined', 'voided', 'expired'].map((s) => ({ value: s, label: STATUS_META[s].label }))]} style={{ width: 130 }} data-testid="filter-status" />
        <Select value={range} onChange={setRange} aria-label="Date range" options={[{ value: 'any', label: 'Any date' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: 'custom', label: 'Custom range' }]} style={{ width: 132 }} data-testid="filter-date" />
        {range === 'custom' && <><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" style={{ ...inputStyle, width: 150 }} /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" style={{ ...inputStyle, width: 150 }} /></>}
        <Select value={driver} onChange={setDriver} aria-label="Driver" options={[{ value: '', label: 'Any driver' }, ...drivers.map((d) => ({ value: d, label: d }))]} style={{ width: 140 }} data-testid="filter-driver" />
        <Select value={carrier} onChange={setCarrier} aria-label="Carrier" options={[{ value: '', label: 'Any carrier' }, ...carriers.map((c) => ({ value: c, label: c }))]} style={{ width: 140 }} />
        {filtersOn && <Btn size="sm" kind="plain" onClick={() => { setQ(''); setStatus('all'); setRange('any'); setDriver(''); setCarrier(''); }}>Clear</Btn>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 2px 10px' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{view.startsWith('fld_') ? st.folders.find((f) => f.id === view)?.name : viewLabel(view)}</div>
        <span style={{ fontSize: 12.5, color: T.faint }}>{rows.length} envelope{rows.length === 1 ? '' : 's'}</span>
        {view === 'deleted' && rows.length > 0 && <span style={{ fontSize: 12, color: T.faint, marginLeft: 'auto' }}>Deleted envelopes can be restored any time.</span>}
      </div>
      <Card style={{ overflow: 'hidden' }}>
        {rows.length === 0 ? <EmptyState icon={view === 'deleted' ? 'trash' : 'inbox'} title={filtersOn ? 'No envelopes match' : `Nothing in ${viewLabel(view)}`} body={filtersOn ? 'Try clearing filters.' : 'Envelopes you send appear here with live status.'} action={!filtersOn && view !== 'deleted' ? <Btn kind="primary" icon="plus" onClick={api.start}>Start</Btn> : undefined} />
          : rows.slice(0, limit).map((e, i) => <EnvelopeRow key={e.id} e={e} first={i === 0} api={api} narrow={width < 760} />)}
        {rows.length > limit && <div style={{ padding: 12, textAlign: 'center', borderTop: `1px solid ${T.hair}` }}><Btn size="sm" onClick={() => setLimit(limit + 50)}>Show {Math.min(50, rows.length - limit)} more</Btn></div>}
      </Card>
    </div>
    {folderModal && <FolderModal onClose={() => setFolderModal(false)} onCreate={(name) => { const f = svc.createFolder(name); setView(f.id); setFolderModal(false); api.toast(`Folder "${f.name}" created`, 'success'); }} />}
  </div>;
}

function NavItem({ on, icon, label, count, onClick, onDelete, testId }: any) {
  return <div style={{ position: 'relative' }}>
    <button type="button" onClick={onClick} data-testid={testId} aria-current={on ? 'page' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', height: 34, padding: '0 10px', borderRadius: 9, border: 'none', background: on ? 'rgba(0,122,255,0.1)' : 'transparent', color: on ? '#0066CC' : T.text, fontWeight: on ? 650 : 500, fontSize: 13, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
      <Icon name={icon} size={15} style={{ color: on ? '#007AFF' : T.muted }} /><span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {count > 0 && <span style={{ fontSize: 11.5, color: on ? '#0066CC' : T.faint, fontWeight: 600, marginRight: onDelete ? 18 : 0 }}>{count}</span>}
    </button>
    {onDelete && <button type="button" title="Delete folder" onClick={onDelete} style={{ position: 'absolute', right: 4, top: 8, border: 'none', background: 'transparent', color: T.faint, cursor: 'pointer', padding: 2, display: 'flex' }}><Icon name="x" size={12} /></button>}
  </div>;
}

function EnvelopeRow({ e, first, api, narrow }: { e: Envelope; first: boolean; api: ManageApi; narrow: boolean }) {
  const pa = primaryAction(e);
  const exp = daysUntil(e.expiresAt);
  const urgent = needsSenderAction(e) && IN_FLIGHT.includes(e.status);
  const to = e.recipients.filter((r) => r.action !== 'cc').map((r) => r.name || r.roleName).filter(Boolean);
  return <div data-testid="envelope-row" data-envelope-id={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: first ? 'none' : `1px solid ${T.hair}`, cursor: 'pointer' }} onClick={() => api.openDetails(e.id)}>
    <span style={{ width: 8, height: 8, borderRadius: 99, background: urgent ? '#FF9500' : 'transparent', flex: 'none' }} title={urgent ? 'Needs your action' : undefined} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</span>
        {e.batchId && <Chip icon="layers" style={{ height: 19, fontSize: 10.5 }}>Bulk</Chip>}
        {e.folder && <Chip icon="folder" style={{ height: 19, fontSize: 10.5 }}>{store.folders.find((f) => f.id === e.folder)?.name}</Chip>}
      </div>
      <div style={{ fontSize: 12, color: T.muted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{to.length ? `To: ${to.join(', ')}` : 'No recipients yet'}{e.carrier ? ` · ${e.carrier}` : ''}</div>
    </div>
    {!narrow && <div style={{ width: 230, flex: 'none' }}>
      <StatusPill status={e.status} size="sm" />
      <div style={{ fontSize: 11.5, color: T.faint, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{statusLine(e)}{isExpiringSoon(e) && exp != null ? ` · expires in ${exp}d` : ''}</div>
    </div>}
    {!narrow && <div style={{ width: 92, flex: 'none', fontSize: 12, color: T.faint, textAlign: 'right' }} title={fmtDateTime(e.lastActivity)}>{fmtAgo(e.lastActivity)}</div>}
    {narrow && <StatusPill status={e.status} size="sm" />}
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }} onClick={(ev) => ev.stopPropagation()}>
      {pa && !narrow && <Btn size="sm" icon={pa.icon} onClick={() => pa.run(api)} data-testid="row-primary">{pa.label}</Btn>}
      <EnvelopeMenu e={e} api={api} trigger={<IconButton icon="more" title="More actions" />} />
    </div>
  </div>;
}

/* ───────────────────────── actions menu (row + drawer) ───────────────────────── */
export function EnvelopeMenu({ e, api, trigger, align = 'right' }: { e: Envelope; api: ManageApi; trigger: React.ReactNode; align?: string }) {
  const [modal, setModal] = React.useState<null | 'void' | 'template' | 'folder' | 'purge'>(null);
  const live = IN_FLIGHT.includes(e.status) && e.status !== 'correcting';
  const fail = () => api.toast('Download failed', 'error');
  return <>
    <Dropdown align={align} width={250} trigger={trigger}>
      {(close: any) => { const run = (fn: () => void) => () => { close(); fn(); }; return <>
        <MenuItem icon="eye" label="View details" onClick={run(() => api.openDetails(e.id))} />
        {e.status === 'draft' && <MenuItem icon="pencil" label="Edit draft" onClick={run(() => api.editDraft(e.id))} />}
        {live && <MenuItem icon="send" label="Resend" hint="Re-send the invitation to current signers" onClick={run(() => { const n = svc.resend(e.id); api.toast(`Resent to ${n} recipient${n === 1 ? '' : 's'}`, 'success'); })} />}
        {live && <MenuItem icon="bell" label="Remind" onClick={run(() => { const r = svc.remind(e.id); api.toast(r.ok ? 'Reminder sent' : r.message || 'Could not remind', r.ok ? 'success' : 'warning'); })} />}
        {live && <MenuItem icon="pencil" label="Correct" hint="Edit recipients and fields; signed fields stay locked" onClick={run(() => api.correct(e.id))} />}
        {live && <MenuItem icon="ban" label="Void" danger onClick={run(() => setModal('void'))} />}
        <MenuSep />
        <MenuItem icon="copy" label="Clone" onClick={run(() => { const c = svc.clone(e.id); if (c) { api.toast('Cloned as a new draft', 'success'); api.editDraft(c.id); } })} />
        <MenuItem icon="star" label="Save as template" onClick={run(() => setModal('template'))} />
        <MenuItem icon="folder" label="Move to folder" onClick={run(() => setModal('folder'))} />
        <MenuSep />
        {e.status === 'completed' && <MenuItem icon="download" label="Download signed PDF" onClick={run(() => { downloadSignedPdf(e).catch(fail); })} />}
        {e.status === 'completed' && <MenuItem icon="shield" label="Certificate of completion" onClick={run(() => { downloadCertificate(e).catch(fail); })} />}
        {e.status === 'completed' && <MenuItem icon="fileCheck" label="Signed PDF + certificate" onClick={run(() => { downloadSignedPdf(e, { withCertificate: true }).catch(fail); })} />}
        {e.status !== 'completed' && e.status !== 'draft' && <MenuItem icon="download" label="Download copy (in progress)" onClick={run(() => { downloadSignedPdf(e).catch(fail); })} />}
        <MenuItem icon="fileText" label="Download original documents" onClick={run(() => { downloadOriginals(e).catch(fail); })} />
        <MenuItem icon="table" label="Export form data (CSV)" onClick={run(() => downloadFormData(e))} />
        <MenuSep />
        {!e.deletedAt ? <MenuItem icon="trash" label="Delete" danger onClick={run(() => { svc.softDelete(e.id); api.toast('Moved to Deleted', 'info', { label: 'Undo', run: () => svc.restore(e.id) }); })} />
          : <><MenuItem icon="rotateCcw" label="Restore" onClick={run(() => { svc.restore(e.id); api.toast('Restored', 'success'); })} /><MenuItem icon="trash" label="Delete forever" danger onClick={run(() => setModal('purge'))} /></>}
      </>; }}
    </Dropdown>
    {modal === 'void' && <VoidModal e={e} onClose={() => setModal(null)} onVoid={(why) => { svc.void(e.id, why); setModal(null); api.toast('Envelope voided', 'info'); }} />}
    {modal === 'template' && <NameModal title="Save as template" label="Template name" initial={e.title.replace(/ — .*$/, '')} cta="Save template" onClose={() => setModal(null)} onSave={(name: string) => { const t = svc.saveAsTemplate(e.id, name); setModal(null); if (t) api.toast(`Template "${t.name}" saved`, 'success'); }} />}
    {modal === 'folder' && <MoveModal e={e} onClose={() => setModal(null)} onMove={(fid) => { svc.moveToFolder(e.id, fid); setModal(null); api.toast(fid ? 'Moved to folder' : 'Removed from folder', 'success'); }} />}
    {modal === 'purge' && <Modal title="Delete forever?" onClose={() => setModal(null)} width={420} footer={<><Btn onClick={() => setModal(null)}>Cancel</Btn><Btn kind="danger" onClick={() => { svc.purge(e.id); setModal(null); api.toast('Envelope deleted permanently', 'info'); }}>Delete forever</Btn></>}><div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.5 }}>“{e.title}” and its audit trail will be removed from this device. Completed PDFs already filed to driver documents are kept.</div></Modal>}
  </>;
}

function VoidModal({ e, onClose, onVoid }: { e: Envelope; onClose: () => void; onVoid: (why: string) => void }) {
  const [why, setWhy] = React.useState('');
  return <Modal title="Void envelope" subtitle="Recipients can no longer view or sign. Everyone who received it is notified." onClose={onClose} width={480} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="danger" disabled={!why.trim()} onClick={() => onVoid(why.trim())} data-testid="void-confirm">Void envelope</Btn></>}>
    <FormField label="Reason (shown to recipients)"><Textarea rows={3} value={why} onChange={(ev: any) => setWhy(ev.target.value)} autoFocus placeholder="e.g. Sent to the wrong carrier" data-testid="void-reason" /></FormField>
    <div style={{ fontSize: 12, color: T.faint }}>{e.title} · {shortId(e.id)}</div>
  </Modal>;
}
export function NameModal({ title, label, initial = '', cta, onClose, onSave }: any) {
  const [v, setV] = React.useState(initial);
  return <Modal title={title} onClose={onClose} width={440} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!v.trim()} onClick={() => onSave(v.trim())} data-testid="name-save">{cta}</Btn></>}>
    <FormField label={label}><Input value={v} onChange={(e: any) => setV(e.target.value)} autoFocus onKeyDown={(e: any) => { if (e.key === 'Enter' && v.trim()) onSave(v.trim()); }} data-testid="name-input" /></FormField>
  </Modal>;
}
function FolderModal({ onClose, onCreate }: { onClose: () => void; onCreate: (n: string) => void }) { return <NameModal title="New folder" label="Folder name" cta="Create folder" onClose={onClose} onSave={onCreate} />; }
function MoveModal({ e, onClose, onMove }: { e: Envelope; onClose: () => void; onMove: (fid: string | null) => void }) {
  useEsign();
  const [name, setName] = React.useState('');
  return <Modal title="Move to folder" onClose={onClose} width={420}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {store.folders.map((f) => <MenuItem key={f.id} icon="folder" label={f.name} checked={e.folder === f.id} onClick={() => onMove(f.id)} />)}
      {e.folder && <MenuItem icon="x" label="Remove from folder" onClick={() => onMove(null)} />}
      {!store.folders.length && <div style={{ fontSize: 12.5, color: T.faint, marginBottom: 6 }}>No folders yet — create one.</div>}
    </div>
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><Input value={name} onChange={(ev: any) => setName(ev.target.value)} placeholder="New folder name" data-testid="new-folder" /><Btn kind="primary" disabled={!name.trim()} onClick={() => { const f = svc.createFolder(name); onMove(f.id); }}>Create & move</Btn></div>
  </Modal>;
}

/* ───────────────────────── details drawer ───────────────────────── */
const EVENT_ICON: Record<string, string> = { created: 'plus', sent: 'send', delivered_email: 'mail', copied: 'copy', viewed: 'eye', consent: 'shield', auth_passed: 'key', auth_failed: 'alert', signed: 'sign', approved: 'thumbsUp', viewed_done: 'eye', completed: 'checkCircle', declined: 'ban', voided: 'ban', reminder_sent: 'bell', resent: 'send', corrected: 'pencil', correcting: 'pencil', delegated: 'userPlus', comment: 'message', downloaded: 'download', cloned: 'copy', saved_template: 'star', moved: 'folder', deleted: 'trash', restored: 'rotateCcw', expired: 'clock', finish_later: 'clock', powerform: 'link' };

export function EnvelopeDrawer({ id, api, onClose }: { id: string; api: ManageApi; onClose: () => void }) {
  useEsign();
  const e = svc.envelope(id);
  const [showAll, setShowAll] = React.useState(false);
  const [comment, setComment] = React.useState('');
  const width = useWidth();
  if (!e) return null;
  const pa = primaryAction(e);
  const exp = daysUntil(e.expiresAt);
  const me = svc.me();
  const act = activeRecipients(e);
  const history = [...e.audit].sort((a, b) => +new Date(b.at) - +new Date(a.at));
  return <Drawer width={Math.min(580, width)} onClose={onClose} title={<span data-testid="drawer-title">{e.title}</span>}
    subtitle={<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><StatusPill status={e.status} /><span style={{ fontSize: 12, color: T.faint }}>ID {shortId(e.id)} · created {fmtDate(e.createdAt)}{e.driverName ? ` · ${e.driverName}` : ''}</span></div>}
    footer={<>
      {pa && <Btn kind="primary" icon={pa.icon} onClick={() => pa.run(api)} data-testid="drawer-primary">{pa.label}</Btn>}
      <EnvelopeMenu e={e} api={api} align="left" trigger={<Btn icon="more" data-testid="drawer-more">More</Btn>} />
    </>}>
    <div data-testid="envelope-drawer" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ padding: 14, borderRadius: 12, background: e.status === 'completed' ? 'rgba(52,199,89,0.07)' : e.status === 'declined' || e.status === 'voided' ? 'rgba(255,59,48,0.05)' : '#F7F9FC', border: `1px solid ${T.hair}` }}>
        <div style={{ fontSize: 14, fontWeight: 650 }}>{statusLine(e)}</div>
        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {e.sentAt && <span>Sent {fmtDateTime(e.sentAt)}</span>}
          {IN_FLIGHT.includes(e.status) && exp != null && <span style={{ color: exp <= (e.warnDays || 3) ? '#C62820' : undefined }}>Expires {exp <= 0 ? 'today' : `in ${exp} day${exp === 1 ? '' : 's'}`}</span>}
          {e.completedAt && <span>Completed {fmtDateTime(e.completedAt)}</span>}
          {IN_FLIGHT.includes(e.status) && <span>{e.reminders.enabled ? `Auto-reminders every ${e.reminders.everyDays}d` : 'Auto-reminders off'} · {e.remindersSent}/{e.maxReminders} sent</span>}
        </div>
        {e.declineReason && e.status === 'declined' && <div style={{ fontSize: 12.5, color: '#C62820', marginTop: 6 }}>“{e.declineReason}”</div>}
        {e.status === 'completed' && <div style={{ fontSize: 12, color: '#248A3D', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="fileCheck" size={13} />{e.signedFileId ? `Signed PDF filed to ${e.driverName ? e.driverName + "'s documents" : 'QuickHire files'}` : 'Preparing signed PDF…'}</div>}
      </div>

      <section>
        <Label>Recipients{e.signingOrder ? ' · signing order' : ' · all at once'}</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...e.recipients].sort((a, b) => (e.signingOrder ? a.order - b.order : 0)).map((r) => <RecipientTimeline key={r.id} e={e} r={r} active={act.some((x) => x.id === r.id)} isMe={r.email.toLowerCase() === me.email.toLowerCase()} api={api} />)}
        </div>
      </section>

      <section>
        <Label>Documents</Label>
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 12 }}>
          {e.documents.map((d, i) => <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i ? `1px solid ${T.hair}` : 'none' }}><Icon name="fileText" size={15} style={{ color: T.muted }} /><span style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span><span style={{ fontSize: 11.5, color: T.faint }}>{d.pages.length} p · {e.fields.filter((f) => f.docId === d.id).length} fields</span></div>)}
        </div>
        {e.status === 'completed' && <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <Btn size="sm" icon="download" onClick={() => downloadSignedPdf(e).catch(() => api.toast('Download failed', 'error'))} data-testid="download-signed">Signed PDF</Btn>
          <Btn size="sm" icon="shield" onClick={() => downloadCertificate(e).catch(() => api.toast('Download failed', 'error'))} data-testid="download-certificate">Certificate</Btn>
          <Btn size="sm" icon="table" onClick={() => downloadFormData(e)}>Form data</Btn>
        </div>}
      </section>

      {(e.subject || e.message) && <section><Label>Message</Label><div style={{ fontSize: 13, fontWeight: 650 }}>{e.subject}</div>{e.message && <div style={{ fontSize: 13, color: '#3A3A3C', marginTop: 4, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{e.message}</div>}</section>}

      <section>
        <Label>Comments{e.comments.length ? ` (${e.comments.length})` : ''}</Label>
        {e.comments.map((c) => <div key={c.id} style={{ padding: '8px 0', borderTop: `1px solid ${T.hair}` }}><div style={{ fontSize: 12.5, fontWeight: 650 }}>{c.author} <span style={{ color: T.faint, fontWeight: 400 }}>· {fmtAgo(c.at)}</span></div><div style={{ fontSize: 13, color: '#3A3A3C', marginTop: 2, whiteSpace: 'pre-wrap' }}>{c.text}</div></div>)}
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}><Input value={comment} onChange={(ev: any) => setComment(ev.target.value)} placeholder="Add a comment for recipients" onKeyDown={(ev: any) => { if (ev.key === 'Enter' && comment.trim()) { svc.addComment(e.id, { author: me.name, authorEmail: me.email, text: comment }); setComment(''); } }} /><Btn disabled={!comment.trim()} onClick={() => { svc.addComment(e.id, { author: me.name, authorEmail: me.email, text: comment }); setComment(''); }}>Post</Btn></div>
      </section>

      <section data-testid="audit-trail">
        <Label>History · {e.audit.length} events</Label>
        <div style={{ position: 'relative', paddingLeft: 4 }}>
          {(showAll ? history : history.slice(0, 8)).map((a, i, arr) => <div key={a.id} style={{ display: 'flex', gap: 10, position: 'relative', paddingBottom: 12 }}>
            {i < arr.length - 1 && <span style={{ position: 'absolute', left: 11, top: 24, bottom: 0, width: 1, background: T.hair }} />}
            <span style={{ width: 23, height: 23, flex: 'none', borderRadius: 99, background: a.event === 'completed' ? 'rgba(52,199,89,0.14)' : a.event === 'declined' || a.event === 'voided' || a.event === 'auth_failed' ? 'rgba(255,59,48,0.1)' : '#F2F2F7', color: a.event === 'completed' ? '#248A3D' : a.event === 'declined' || a.event === 'voided' || a.event === 'auth_failed' ? '#C62820' : T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={EVENT_ICON[a.event] || 'circle'} size={12} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.4 }}>{a.detail || a.event}</div><div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>{a.actor}{a.actorEmail ? ` <${a.actorEmail}>` : ''} · {fmtDateTime(a.at)}</div></div>
          </div>)}
        </div>
        {history.length > 8 && <Btn size="sm" kind="plain" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show less' : `Show all ${history.length} events`}</Btn>}
      </section>
    </div>
  </Drawer>;
}

function RecipientTimeline({ e, r, active, isMe, api }: { e: Envelope; r: Recipient; active: boolean; isMe: boolean; api: ManageApi }) {
  const steps: { label: string; at?: string; tone?: string }[] = [
    { label: r.action === 'cc' ? 'Copy sent' : 'Sent', at: r.sentAt },
    ...(r.action === 'cc' ? [] : [{ label: 'Delivered', at: r.deliveredAt }]),
    ...(r.status === 'declined' ? [{ label: 'Declined', at: r.declinedAt, tone: '#C62820' }] : r.action === 'cc' ? [] : [{ label: r.action === 'view' ? 'Viewed' : r.action === 'approve' ? 'Approved' : 'Signed', at: r.signedAt || r.completedAt, tone: '#248A3D' }]),
  ];
  const statusText = r.status === 'created' ? (IN_FLIGHT.includes(e.status) ? 'Waiting for earlier signers' : 'Not sent') : r.status === 'sent' ? 'Sent' : r.status === 'delivered' ? 'Delivered' : r.status === 'declined' ? 'Declined' : isDone(r) ? (r.action === 'cc' ? 'Copy delivered' : 'Completed') : r.status;
  return <div data-testid="recipient-timeline" style={{ border: `1px solid ${active ? hexA(r.color, 0.5) : T.border}`, borderRadius: 12, padding: 12, background: active ? hexA(r.color, 0.04) : '#fff' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {e.signingOrder && <span style={{ width: 20, fontSize: 12, fontWeight: 700, color: T.faint, textAlign: 'center' }}>{r.order}</span>}
      <RecipientAvatar r={r} size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}{isMe ? ' (you)' : ''}</div>
        <div style={{ fontSize: 11.5, color: T.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.email} · {actionLabel(r.action)}{r.accessCode ? ' · access code' : ''}{r.smsAuth ? ' · SMS' : ''}</div>
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 650, color: r.status === 'declined' ? '#C62820' : isDone(r) ? '#248A3D' : active ? '#0066CC' : T.faint, whiteSpace: 'nowrap' }}>{statusText}</span>
    </div>
    <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
      {steps.map((s, i) => <div key={i} style={{ flex: '1 1 110px', minWidth: 0 }}>
        <div style={{ height: 3, borderRadius: 9, background: s.at ? s.tone || '#007AFF' : '#E5E5EA' }} />
        <div style={{ fontSize: 11, fontWeight: 650, color: s.at ? T.text : T.faint, marginTop: 5 }}>{s.label}</div>
        <div style={{ fontSize: 10.5, color: T.faint }}>{s.at ? fmtDateTime(s.at) : '—'}</div>
      </div>)}
    </div>
    {r.delegatedFrom && <div style={{ fontSize: 11.5, color: T.muted, marginTop: 8 }}>Assigned by {r.delegatedFrom.name}{r.delegatedFrom.reason ? ` — “${r.delegatedFrom.reason}”` : ''}</div>}
    {r.declineReason && <div style={{ fontSize: 12, color: '#C62820', marginTop: 8 }}>“{r.declineReason}”</div>}
    {active && <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {r.action === 'in_person' ? <Btn size="sm" kind="primary" icon="users" onClick={() => api.openSession({ envId: e.id, rid: r.id, mode: 'inperson' })} data-testid="host-session">Host in-person signing</Btn>
        : isMe ? <Btn size="sm" kind="primary" icon="sign" onClick={() => api.openSession({ envId: e.id, rid: r.id, mode: e.selfSign ? 'self' : 'remote' })}>Sign now</Btn>
          : store.settings.simulationMode && <Btn size="sm" icon="externalLink" onClick={() => api.openSession({ envId: e.id, rid: r.id, mode: 'remote' })} data-testid="open-as-recipient">Open as {r.name.split(' ')[0] || 'recipient'}</Btn>}
      {!isMe && r.action !== 'in_person' && <span style={{ fontSize: 11, color: T.faint }}>{store.settings.simulationMode ? 'Simulation: opens the signer’s session on this device' : 'Signer uses the emailed link'}</span>}
    </div>}
  </div>;
}
