/* Send flow: Setup (documents · recipients · message · options) → Prepare
   (field editor) → Send. The same flow edits templates (roles instead of
   recipients), corrects sent envelopes and prepares self-signing. Every edit
   autosaves to the draft. */
import React from 'react';
import { T } from '../tasks/lib';
import { Envelope, Template, EDoc, Field, Recipient, TemplateRole, ACTIONS, RecipientAction, colorForIndex, uid, validateForSend, personMergeData, routingSteps, isDone, actionLabel, Person, canHaveFields } from './model';
import { svc, store, useEsign } from './store';
import { CATALOG, CATALOG_KEYS, catalogFields } from './catalog';
import { PdfError } from './pdf';
import { PageImage } from './pages';
import { DocumentEditor } from './editor';
import { SigningSession } from './signing';
import { listPeople, personForEnvelope } from './integrations';
import { Icon, Btn, IconButton, Input, Textarea, Select, Toggle, SectionCard, Dropdown, MenuItem, MenuSep, Label, Chip, RecipientAvatar, hexA, useWidth, inputStyle, Field as FormField } from './ui';

export type BuilderKind = 'envelope' | 'template' | 'self' | 'correct';
type Party = Partial<Recipient> & Partial<TemplateRole> & { id: string; name: string; email: string; action: RecipientAction; order: number; color: string };

export function SendFlow({ kind, id, onClose, toast, onOpenEnvelope, startAt = 'setup' }: { kind: BuilderKind; id: string; onClose: () => void; toast: (t: string, k?: string, a?: any) => void; onOpenEnvelope?: (id: string) => void; startAt?: 'setup' | 'prepare' }) {
  useEsign();
  const isTpl = kind === 'template';
  const env = isTpl ? undefined : svc.envelope(id);
  const tpl = isTpl ? svc.template(id) : undefined;
  const [step, setStep] = React.useState<'setup' | 'prepare' | 'sent'>(startAt);
  const [issues, setIssues] = React.useState<string[]>([]);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [selfSession, setSelfSession] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number>(Date.now());
  const width = useWidth();
  if (!env && !tpl) return null;

  const title = isTpl ? tpl!.name : env!.title;
  const documents: EDoc[] = (isTpl ? tpl!.documents : env!.documents) || [];
  const parties: Party[] = (isTpl ? tpl!.roles : env!.recipients) as any;
  const fields: Field[] = isTpl ? tpl!.fields : env!.fields;
  const signingOrder = isTpl ? tpl!.signingOrder : env!.signingOrder;
  const patch = (p: any) => { if (isTpl) svc.updateTemplate(id, p); else svc.updateEnvelope(id, p); setSavedAt(Date.now()); };
  const person = env ? personForEnvelope(env) : null;
  const mergeData = person ? personMergeData(person) : undefined;

  const closeAll = () => { if (kind === 'correct' && env?.status === 'correcting') { svc.cancelCorrect(id); toast('Correction cancelled', 'info'); } else if (!isTpl && env?.status === 'draft') toast('Draft saved', 'info'); onClose(); };

  /* ── minimal checks before Prepare ── */
  const setupIssues = () => {
    const out: string[] = [];
    if (!documents.length) out.push('Add at least one document.');
    if (kind !== 'self') {
      if (!parties.length) out.push(isTpl ? 'Add at least one role.' : 'Add at least one recipient.');
      parties.forEach((p) => { if (isTpl) { if (!String(p.roleName || '').trim()) out.push('Every role needs a name.'); } else { if (!p.name?.trim()) out.push('Every recipient needs a name.'); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(p.email || '').trim())) out.push(`${p.name || 'A recipient'} needs a valid email.`); } });
    }
    return [...new Set(out)];
  };

  if (step === 'prepare') {
    const editorRecipients = parties.map((p) => ({ id: p.id, name: p.name, roleName: p.roleName, email: p.email, action: p.action, color: p.color }));
    const primary = kind === 'template' ? { label: 'Save template', icon: 'check', onClick: () => { toast('Template saved', 'success'); onClose(); } }
      : kind === 'self' ? { label: 'Sign now', icon: 'sign', onClick: () => { const res = svc.send(id); if (!res.ok) { setIssues(res.errors); return; } setSelfSession(env!.recipients[0].id); } }
        : kind === 'correct' ? { label: 'Finish correcting', icon: 'send', onClick: () => { const res = svc.finishCorrect(id); if (!res.ok) { setIssues(res.errors); return; } toast('Envelope corrected and re-sent', 'success'); onClose(); } }
          : { label: 'Send', icon: 'send', onClick: () => { const res = svc.send(id); if (!res.ok) { setIssues(res.errors); return; } setStep('sent'); } };
    const firstSigner = parties.find((p) => canHaveFields(p as any) && !isDone(p as any));
    return <>
      <DocumentEditor mode={kind === 'correct' ? 'correct' : kind === 'template' ? 'template' : kind === 'self' ? 'self' : 'envelope'} title={title}
        documents={documents} recipients={editorRecipients} fields={fields} onFields={(f) => patch({ fields: f })} mergeData={mergeData}
        onBack={() => setStep('setup')} backLabel="Setup" primary={primary} issues={issues} onDismissIssues={() => setIssues([])} toast={toast}
        secondary={<>
          {kind !== 'self' && firstSigner && <Btn icon="eye" onClick={() => setPreview(firstSigner.id)} data-testid="editor-preview">{width > 1200 ? 'Preview' : null}</Btn>}
          {kind === 'envelope' && <Btn onClick={() => { svc.updateEnvelope(id, {}); toast('Draft saved', 'success'); onClose(); }}>{width > 1200 ? 'Save & close' : 'Save'}</Btn>}
        </>} />
      {preview && <SigningSession mode="preview" env={isTpl ? templatePreviewEnv(tpl!) : env} recipientId={preview} onClose={() => setPreview(null)} toast={toast} />}
      {selfSession && <SigningSession mode="self" envId={id} recipientId={selfSession} onClose={() => { setSelfSession(null); onClose(); }} toast={toast} />}
    </>;
  }

  if (step === 'sent' && env) return <SentScreen env={env} onClose={onClose} onOpen={() => { onClose(); onOpenEnvelope?.(env.id); }} />;

  /* ── Setup ── */
  const next = () => { const errs = setupIssues(); if (errs.length) { setIssues(errs); toast(errs[0], 'warning'); return; } setIssues([]); setStep('prepare'); };
  const lockedDocs = kind === 'correct' && env!.recipients.some(isDone);
  return <div style={{ position: 'fixed', inset: 0, zIndex: 85, background: '#F5F6F8', display: 'flex', flexDirection: 'column' }} data-testid="send-setup">
    <header style={{ height: 56, flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', background: '#fff', borderBottom: `1px solid ${T.hair}` }}>
      <IconButton icon="x" title="Close" onClick={closeAll} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <input value={title} aria-label={isTpl ? 'Template name' : 'Envelope name'} onChange={(e) => patch(isTpl ? { name: e.target.value } : { title: e.target.value })} data-testid="envelope-title"
          style={{ border: 'none', outline: 'none', fontSize: 15, fontWeight: 700, width: '100%', background: 'transparent', fontFamily: 'inherit', color: T.text, padding: 0 }} />
        <div style={{ fontSize: 11.5, color: T.faint }}>{kind === 'template' ? 'Template' : kind === 'self' ? 'Sign a document yourself' : kind === 'correct' ? 'Correcting sent envelope' : 'Draft'} · <SavedLabel at={savedAt} /></div>
      </div>
      <Steps step={0} kind={kind} />
      <Btn kind="primary" onClick={next} data-testid="setup-next" icon="arrowRight">Next</Btn>
    </header>
    <div style={{ flex: 1, overflowY: 'auto', padding: width < 700 ? '16px 12px 80px' : '24px 20px 80px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {issues.length > 0 && <div role="alert" style={{ padding: '10px 14px', borderRadius: 12, background: '#FFF4F3', border: '1px solid rgba(255,59,48,0.22)', color: '#B3261E', fontSize: 13 }}>{issues.join(' · ')}</div>}
        <DocumentsCard kind={kind} documents={documents} locked={lockedDocs} carrier={(env?.carrier || tpl?.carrier || 'GRAND ONE LLC')} toast={toast}
          onChange={(docs: EDoc[], extra?: any) => patch({ documents: docs, ...(extra || {}) })} fields={fields} parties={parties} isTpl={isTpl} envId={isTpl ? undefined : id} getDocs={() => ((isTpl ? svc.template(id)?.documents : svc.envelope(id)?.documents) || [])} />
        {kind !== 'self' && <RecipientsCard kind={kind} env={env} parties={parties} signingOrder={signingOrder} fields={fields} onChange={patch} toast={toast} />}
        {kind !== 'self' && <MessageCard subject={isTpl ? tpl!.subject : env!.subject} message={isTpl ? tpl!.message : env!.message} isTpl={isTpl} onChange={patch} documents={documents} />}
        {kind !== 'self' && <OptionsCard reminders={isTpl ? tpl!.reminders : env!.reminders} expireDays={isTpl ? tpl!.expireDays : env!.expireDays} warnDays={env?.warnDays ?? 3} isTpl={isTpl} onChange={patch} />}
        {isTpl && <TemplateMetaCard tpl={tpl!} onChange={patch} />}
      </div>
    </div>
  </div>;
}

function templatePreviewEnv(t: Template): Envelope {
  return { id: 'preview', title: t.name, status: 'sent', documents: t.documents, recipients: t.roles.map((r) => ({ id: r.id, name: r.name || r.roleName, email: r.email || 'recipient@example.com', action: r.action, order: r.order, color: r.color, status: 'sent', roleName: r.roleName })), fields: t.fields, subject: t.subject, message: t.message, signingOrder: t.signingOrder, reminders: { ...t.reminders }, remindersSent: 0, maxReminders: 3, expireDays: t.expireDays, expiresAt: new Date(Date.now() + 864e5 * 30).toISOString(), warnDays: 3, driverName: '', carrier: t.carrier || '', createdAt: '', updatedAt: '', lastActivity: '', audit: [], comments: [], sender: svc.me(), version: 2 };
}

function SavedLabel({ at }: { at: number }) {
  const [, tick] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { const t = setInterval(tick, 15000); return () => clearInterval(t); }, []);
  const s = Math.round((Date.now() - at) / 1000);
  return <span style={{ color: '#248A3D' }} data-testid="autosave">Saved{s > 20 ? ` ${s < 60 ? 'moments' : Math.round(s / 60) + ' min'} ago` : ''}</span>;
}

function Steps({ step, kind }: { step: number; kind: BuilderKind }) {
  if (useWidth() < 900) return null;
  const labels = ['Setup', kind === 'template' ? 'Fields' : 'Prepare', kind === 'template' ? 'Save' : kind === 'self' ? 'Sign' : kind === 'correct' ? 'Re-send' : 'Send'];
  return <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>{labels.map((l, i) => <React.Fragment key={l}>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 650, color: i === step ? '#007AFF' : T.faint }}><span style={{ width: 18, height: 18, borderRadius: 99, background: i === step ? '#007AFF' : '#E5E5EA', color: i === step ? '#fff' : T.muted, fontSize: 10.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>{l}</span>
    {i < labels.length - 1 && <span style={{ width: 18, height: 1, background: '#D1D1D6' }} />}
  </React.Fragment>)}</div>;
}

/* ───────────────────────── documents ───────────────────────── */
function DocumentsCard({ kind, documents, onChange, toast, locked, carrier, fields, parties, isTpl, envId, getDocs }: any) {
  const [busy, setBusy] = React.useState(0);
  const [over, setOver] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const addFiles = async (files: FileList | File[]) => {
    const list = [...files]; if (!list.length) return;
    setBusy((n) => n + list.length);
    const added: EDoc[] = [];
    for (const f of list) {
      try { added.push(await svc.importPdf(f)); }
      catch (e: any) { toast(e instanceof PdfError ? e.message : `${f.name} could not be added`, 'error'); }
      finally { setBusy((n) => n - 1); }
    }
    if (added.length) {
      const latest = getDocs();
      const extra: any = {};
      const cur = !isTpl ? svc.envelope(envId) : null;
      if (cur && /^Untitled/.test(cur.title || '')) extra.title = added[0].name;
      onChange([...latest, ...added], extra);
      toast(`Added ${added.map((d) => `${d.name} (${d.pages.length} page${d.pages.length === 1 ? '' : 's'})`).join(', ')}`, 'success');
    }
  };
  const addCatalog = (key: string) => {
    const d = svc.catalogDoc(key, carrier);
    const signerIds = (parties as Party[]).filter((p) => canHaveFields(p as any)).sort((a, b) => a.order - b.order).map((p) => p.id);
    const extra: any = { fields: [...fields, ...(signerIds.length ? catalogFields(key, d.id, signerIds) : [])] };
    onChange([...documents, d], extra);
    toast(`${d.name} added${signerIds.length ? ' with signature fields' : ''}`, 'success');
  };
  const remove = (doc: EDoc) => {
    const prevDocs = documents, prevFields = fields;
    onChange(documents.filter((d: EDoc) => d.id !== doc.id), { fields: fields.filter((f: Field) => f.docId !== doc.id) });
    toast(`Removed ${doc.name}`, 'info', { label: 'Undo', run: () => onChange(prevDocs, { fields: prevFields }) });
  };
  const move = (i: number, dir: number) => { const j = i + dir; if (j < 0 || j >= documents.length) return; const n = [...documents]; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  const rename = (doc: EDoc, name: string) => onChange(documents.map((d: EDoc) => (d.id === doc.id ? { ...d, name } : d)));
  return <SectionCard icon="fileText" title="Documents" desc={kind === 'self' ? 'Upload the document you want to sign.' : 'Upload PDFs or add QuickHire documents. They are sent as one envelope, in this order.'}
    right={<div style={{ display: 'flex', gap: 6 }}>
      <Dropdown align="right" width={260} trigger={<Btn size="sm" icon="filePlus" disabled={locked}>Library</Btn>}>
        {(close: any) => <>{CATALOG_KEYS.map((k) => <MenuItem key={k} icon="fileText" label={CATALOG[k].name} hint={CATALOG[k].category} onClick={() => { addCatalog(k); close(); }} />)}</>}
      </Dropdown>
    </div>}>
    <input ref={input} type="file" accept="application/pdf,.pdf" multiple style={{ display: 'none' }} data-testid="pdf-input" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
    {!locked && <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
      onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }} data-testid="dropzone"
      style={{ border: `1.5px dashed ${over ? '#007AFF' : 'rgba(0,0,0,0.16)'}`, background: over ? 'rgba(0,122,255,0.05)' : '#FAFAFB', borderRadius: 12, padding: documents.length ? '14px' : '28px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, cursor: 'pointer', marginBottom: documents.length ? 14 : 0, flexWrap: 'wrap', textAlign: 'center' }}>
      <span style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(0,122,255,0.1)', color: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={busy ? 'refresh' : 'upload'} size={18} /></span>
      <div><div style={{ fontSize: 13.5, fontWeight: 650 }}>{busy ? `Reading ${busy} PDF${busy > 1 ? 's' : ''}…` : 'Drop PDFs here or click to upload'}</div><div style={{ fontSize: 12, color: T.faint }}>Up to 25 MB each · multi-page supported</div></div>
    </div>}
    {locked && <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 10, display: 'flex', gap: 6 }}><Icon name="lock" size={14} />Documents can't change after someone has signed.</div>}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="doc-list">
      {documents.map((d: EDoc, i: number) => <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: `1px solid ${T.border}`, borderRadius: 12, background: '#fff' }}>
        <div style={{ position: 'relative', width: 44, height: 56, flex: 'none', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.1)' }}><PageImage doc={d} page={0} eager /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input value={d.name} onChange={(e) => rename(d, e.target.value)} aria-label="Document name" disabled={locked} style={{ border: 'none', outline: 'none', fontSize: 13.5, fontWeight: 650, width: '100%', background: 'transparent', padding: 0, fontFamily: 'inherit', color: T.text }} />
          <div style={{ fontSize: 11.5, color: T.faint }}>{d.pages.length} page{d.pages.length === 1 ? '' : 's'} · {d.source === 'pdf' ? `Uploaded PDF${d.size ? ` · ${Math.max(1, Math.round(d.size / 1024))} KB` : ''}` : d.source === 'catalog' ? 'QuickHire document' : 'Uploaded (legacy)'} · {fields.filter((f: Field) => f.docId === d.id).length} fields</div>
        </div>
        {!locked && <>
          <IconButton icon="arrowUp" title="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
          <IconButton icon="arrowDown" title="Move down" disabled={i === documents.length - 1} onClick={() => move(i, 1)} />
          <IconButton icon="trash" title={`Remove ${d.name}`} onClick={() => remove(d)} />
        </>}
      </div>)}
    </div>
  </SectionCard>;
}

/* ───────────────────────── recipients ───────────────────────── */
function RecipientsCard({ kind, env, parties, signingOrder, fields, onChange, toast }: { kind: BuilderKind; env?: Envelope; parties: Party[]; signingOrder: boolean; fields: Field[]; onChange: (p: any) => void; toast: any }) {
  const isTpl = kind === 'template';
  const key = isTpl ? 'roles' : 'recipients';
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const set = (list: Party[]) => onChange({ [key]: list });
  const upd = (id: string, p: Partial<Party>) => set(parties.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const add = (seed: Partial<Party> = {}) => {
    const i = parties.length;
    const maxOrder = Math.max(0, ...parties.map((r) => r.order || 1));
    const r: any = { id: isTpl ? uid('role') : uid('r'), name: '', email: '', action: 'sign', order: maxOrder + 1, color: colorForIndex(i), ...(isTpl ? { roleName: `Recipient ${i + 1}` } : { status: 'created' }), ...seed };
    set([...parties, r]);
  };
  const remove = (r: Party) => {
    const prevP = parties, prevF = fields;
    onChange({ [key]: parties.filter((x) => x.id !== r.id), fields: fields.filter((f) => f.recipientId !== r.id) });
    toast(`Removed ${r.name || r.roleName || 'recipient'}`, 'info', { label: 'Undo', run: () => onChange({ [key]: prevP, fields: prevF }) });
  };
  const me = svc.me();
  const linked = env ? personForEnvelope(env) : null;
  return <SectionCard icon="users" title={isTpl ? 'Roles' : 'Recipients'} desc={isTpl ? 'Placeholders filled in when the template is used — e.g. Driver, Carrier Representative.' : 'Who needs to sign, approve, view or get a copy.'}
    right={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 12.5, color: T.muted }}>Set signing order</span><Toggle on={signingOrder} onChange={(v: boolean) => onChange({ signingOrder: v })} label="Set signing order" /></div>}>
    {!isTpl && env && kind !== 'correct' && <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: 10, borderRadius: 12, background: '#F7F9FC', border: `1px solid ${T.hair}`, flexWrap: 'wrap' }}>
      <Icon name="truck" size={16} style={{ color: T.muted }} />
      <div style={{ flex: 1, minWidth: 180 }}><div style={{ fontSize: 13, fontWeight: 650 }}>{linked ? `Linked to ${linked.name}` : 'Link a driver'}</div><div style={{ fontSize: 11.5, color: T.faint }}>{linked ? `${linked.carrierInfo?.name || linked.carrier || ''} · driver data fills merge fields and the signed PDF files to their documents` : 'Fills the first signer and every driver-data field automatically.'}</div></div>
      <PersonPicker label={linked ? 'Change' : 'Choose driver'} onPick={(p) => { const res = svc.linkPerson(env.id, p); toast(res.missing.length ? `Linked ${p.name} — ${res.missing.length} driver field${res.missing.length > 1 ? 's' : ''} have no data yet` : `Linked ${p.name}`, res.missing.length ? 'warning' : 'success'); }} />
      {linked && <Btn size="sm" kind="plain" onClick={() => svc.linkPerson(env.id, null)}>Unlink</Btn>}
    </div>}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="recipient-list">
      {parties.map((r, i) => {
        const done = !isTpl && isDone(r as any);
        const locked = kind === 'correct' && (done || r.status === 'declined');
        const expanded = open[r.id];
        const nFields = fields.filter((f) => f.recipientId === r.id).length;
        return <div key={r.id} data-testid="recipient-row" style={{ border: `1px solid ${T.border}`, borderLeft: `4px solid ${r.color}`, borderRadius: 12, background: '#fff', padding: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {signingOrder ? <input type="number" min={1} value={r.order} disabled={locked} aria-label="Signing order" data-testid="recipient-order" onChange={(e) => upd(r.id, { order: Math.max(1, Number(e.target.value) || 1) })} style={{ ...inputStyle, width: 54, textAlign: 'center', fontWeight: 700, padding: '0 4px', flex: 'none' }} />
              : <RecipientAvatar r={r} size={34} />}
            <div style={{ flex: 1, minWidth: 220, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
              {isTpl && <Input value={r.roleName || ''} onChange={(e: any) => upd(r.id, { roleName: e.target.value })} placeholder="Role (e.g. Driver)" aria-label="Role name" data-testid="role-name" />}
              <Input value={r.name} disabled={locked} onChange={(e: any) => upd(r.id, { name: e.target.value })} placeholder={isTpl ? 'Name (optional)' : 'Full name'} aria-label="Name" data-testid="recipient-name" />
              <Input value={r.email} disabled={locked} type="email" onChange={(e: any) => upd(r.id, { email: e.target.value })} placeholder={isTpl ? 'Email (optional)' : 'Email'} aria-label="Email" data-testid="recipient-email" />
              <Select value={r.action} disabled={locked} onChange={(v: RecipientAction) => upd(r.id, { action: v, ...(v === 'in_person' && !r.hostName ? { hostName: me.name, hostEmail: me.email } : {}) })} options={ACTIONS.map((a) => ({ value: a.value, label: a.label }))} aria-label="Action" data-testid="recipient-action" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Btn size="sm" kind="plain" onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))} data-testid="recipient-more" icon={expanded ? 'chevronDown' : 'settings'}>{expanded ? 'Less' : 'More'}</Btn>
              {!locked && <IconButton icon="trash" title="Remove recipient" onClick={() => remove(r)} />}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, paddingLeft: signingOrder ? 64 : 44 }}>
            {done && <Chip color="#248A3D" bg="rgba(52,199,89,0.12)" icon="check">{r.action === 'view' ? 'Viewed' : 'Signed'}</Chip>}
            {r.accessCode && <Chip icon="key">Access code</Chip>}
            {r.smsAuth && <Chip icon="smartphone">SMS code</Chip>}
            {r.language && r.language !== 'en' && <Chip icon="globe">{r.language === 'es' ? 'Español' : r.language}</Chip>}
            {r.privateMessage && <Chip icon="message">Private message</Chip>}
            {r.action === 'in_person' && <Chip icon="users">Host: {r.hostName || me.name}</Chip>}
            {canHaveFields(r as any) && <Chip>{nFields} field{nFields === 1 ? '' : 's'}</Chip>}
          </div>
          {expanded && <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.hair}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }} data-testid="recipient-options">
            <FormField label="Access code" hint="Share it with the recipient separately. They must enter it to open the envelope." style={{ marginBottom: 0 }}><Input value={r.accessCode || ''} disabled={locked} onChange={(e: any) => upd(r.id, { accessCode: e.target.value })} placeholder="None" data-testid="access-code" /></FormField>
            <FormField label="Mobile (for SMS code)" style={{ marginBottom: 0 }}><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Input value={r.phone || ''} disabled={locked} onChange={(e: any) => upd(r.id, { phone: e.target.value })} placeholder="(555) 010-0101" /><Toggle on={!!r.smsAuth} onChange={(v: boolean) => upd(r.id, { smsAuth: v })} label="Require SMS code" /></div></FormField>
            <FormField label="Signing language" style={{ marginBottom: 0 }}><Select value={r.language || 'en'} onChange={(v: string) => upd(r.id, { language: v })} options={[{ value: 'en', label: 'English' }, { value: 'es', label: 'Español' }]} /></FormField>
            {r.action === 'in_person' && <FormField label="Host (in person)" style={{ marginBottom: 0 }}><Input value={r.hostName || ''} onChange={(e: any) => upd(r.id, { hostName: e.target.value })} placeholder={me.name} /></FormField>}
            <FormField label="Private message" style={{ gridColumn: '1 / -1', marginBottom: 0 }}><Textarea rows={2} value={r.privateMessage || ''} onChange={(e: any) => upd(r.id, { privateMessage: e.target.value })} placeholder="Only this recipient sees this message" /></FormField>
          </div>}
        </div>;
      })}
    </div>
    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
      <Btn icon="userPlus" onClick={() => add()} data-testid="add-recipient">Add recipient</Btn>
      {!isTpl && !parties.some((p) => p.email?.toLowerCase() === me.email.toLowerCase()) && <Btn kind="plain" icon="user" onClick={() => add({ name: me.name, email: me.email, roleName: 'Recruiter' })}>Add me</Btn>}
      {!isTpl && <PersonPicker label="Add driver" icon="truck" onPick={(p) => add({ name: p.name, email: p.email || '', phone: p.phone, driverId: p.id })} />}
    </div>
    {signingOrder && parties.length > 1 && <div style={{ marginTop: 12, fontSize: 12, color: T.muted, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} data-testid="routing-summary">
      <Icon name="arrowRight" size={13} />Routing: {routingSteps({ signingOrder, recipients: parties as any }).map(([o, rs]) => `${o}. ${rs.map((x) => x.name || x.roleName || 'recipient').join(' + ')}`).join('  →  ')}
      <span style={{ color: T.faint }}>(same number = at the same time)</span>
    </div>}
  </SectionCard>;
}

/** Driver/lead search picker. */
export function PersonPicker({ label = 'Choose driver', icon = 'search', onPick, width = 300 }: { label?: string; icon?: string; onPick: (p: Person) => void; width?: number }) {
  const [q, setQ] = React.useState('');
  return <Dropdown width={width} align="right" trigger={<Btn size="sm" icon={icon} data-testid="person-picker">{label}</Btn>}>
    {(close: any) => {
      const people = listPeople();
      const rows = people.filter((p) => !q || `${p.name} ${p.email} ${p.carrier} ${p.phone}`.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
      return <>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search drivers and leads" style={{ ...inputStyle, height: 34, fontSize: 13, marginBottom: 6 }} data-testid="person-search" />
        {rows.map((p) => <MenuItem key={`${p.kind}:${p.id}`} icon={p.kind === 'lead' ? 'user' : 'truck'} label={p.name} hint={[p.kind === 'lead' ? 'Lead' : p.position || 'Driver', p.carrierInfo?.name || p.carrier, p.email].filter(Boolean).join(' · ')} onClick={() => { onPick(p); close(); setQ(''); }} />)}
        {!rows.length && <div style={{ padding: 10, fontSize: 12.5, color: T.faint }}>No matches</div>}
      </>;
    }}
  </Dropdown>;
}

/* ───────────────────────── message + options ───────────────────────── */
function MessageCard({ subject, message, onChange, isTpl, documents }: any) {
  return <SectionCard icon="mail" title="Message" desc={isTpl ? 'Use {driver}, {first}, {carrier} and {position} — filled in when the template is used.' : 'This email goes to every recipient. Add a private message per recipient under "More".'}>
    <FormField label="Subject"><Input value={subject} onChange={(e: any) => onChange({ subject: e.target.value.slice(0, 100) })} placeholder={`Please sign: ${documents[0]?.name || 'documents'}`} data-testid="env-subject" /><div style={{ fontSize: 11, color: T.faint, textAlign: 'right', marginTop: 3 }}>{String(subject || '').length}/100</div></FormField>
    <FormField label="Message" style={{ marginBottom: 0 }}><Textarea rows={4} value={message} onChange={(e: any) => onChange({ message: e.target.value.slice(0, 10000) })} placeholder="Hi, please review and sign the attached documents." data-testid="env-message" /></FormField>
  </SectionCard>;
}

function OptionsCard({ reminders, expireDays, warnDays, onChange, isTpl }: any) {
  const [open, setOpen] = React.useState(false);
  return <SectionCard icon="clock" title="Reminders & expiration" desc={`${reminders.enabled ? `Reminder every ${reminders.everyDays} day${reminders.everyDays === 1 ? '' : 's'}` : 'No automatic reminders'} · expires in ${expireDays} days`} right={<Btn size="sm" kind="plain" onClick={() => setOpen(!open)} data-testid="options-toggle">{open ? 'Done' : 'Edit'}</Btn>}>
    {open ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
      <div><Label>Automatic reminders</Label><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Toggle on={reminders.enabled} onChange={(v: boolean) => onChange({ reminders: { ...reminders, enabled: v } })} label="Automatic reminders" /><span style={{ fontSize: 13 }}>every</span><Input type="number" min={1} max={30} value={reminders.everyDays} onChange={(e: any) => onChange({ reminders: { ...reminders, everyDays: Math.max(1, Math.min(30, Number(e.target.value) || 1)) } })} style={{ width: 70 }} data-testid="remind-days" /><span style={{ fontSize: 13 }}>days</span></div></div>
      <div><Label>Expires after</Label><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Input type="number" min={1} max={365} value={expireDays} onChange={(e: any) => { const d = Math.max(1, Math.min(365, Number(e.target.value) || 1)); onChange(isTpl ? { expireDays: d } : { expireDays: d, expiresAt: new Date(Date.now() + d * 864e5).toISOString() }); }} style={{ width: 80 }} data-testid="expire-days" /><span style={{ fontSize: 13 }}>days</span></div></div>
      {!isTpl && <div><Label>Warn before expiring</Label><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Input type="number" min={0} max={30} value={warnDays} onChange={(e: any) => onChange({ warnDays: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 70 }} /><span style={{ fontSize: 13 }}>days</span></div></div>}
    </div> : <div style={{ fontSize: 12.5, color: T.muted }}>Smart defaults from Settings. Unsigned envelopes also raise a QuickHire notification after 48 hours.</div>}
  </SectionCard>;
}

function TemplateMetaCard({ tpl, onChange }: { tpl: Template; onChange: (p: any) => void }) {
  return <SectionCard icon="copy" title="Template details">
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
      <FormField label="Category"><Select value={tpl.category} onChange={(v: string) => onChange({ category: v })} options={[...new Set(['Carrier packet', 'Onboarding', 'Compliance', 'Rehire', 'Tax', 'Saved', 'Other', tpl.category])]} /></FormField>
      <FormField label="Carrier"><Select value={tpl.carrier || ''} onChange={(v: string) => onChange({ carrier: v, documents: tpl.documents.map((d) => (d.source === 'catalog' ? { ...d, carrier: v || d.carrier } : d)) })} options={[{ value: '', label: 'Any carrier' }, ...['GRAND ONE LLC', 'DT NATIONAL TRANSPORTATION LLC', 'PREMIER TRUCKING GROUP INC', 'RMR TRANSPORT'].map((c) => ({ value: c, label: c }))]} /></FormField>
    </div>
    <FormField label="Description" style={{ marginBottom: 0 }}><Input value={tpl.description} onChange={(e: any) => onChange({ description: e.target.value })} placeholder="What this template is for" /></FormField>
  </SectionCard>;
}

/* ───────────────────────── sent confirmation ───────────────────────── */
function SentScreen({ env, onClose, onOpen }: { env: Envelope; onClose: () => void; onOpen: () => void }) {
  const steps = routingSteps(env);
  return <div style={{ position: 'fixed', inset: 0, zIndex: 85, background: '#F5F6F8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} data-testid="sent-screen">
    <div style={{ width: 520, maxWidth: '100%', background: '#fff', borderRadius: 18, border: `1px solid ${T.border}`, boxShadow: '0 20px 60px rgba(0,0,0,0.08)', padding: 28, textAlign: 'center' }}>
      <span style={{ width: 60, height: 60, borderRadius: 99, background: 'rgba(52,199,89,0.12)', color: '#34C759', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="send" size={26} /></span>
      <div style={{ fontSize: 21, fontWeight: 700, marginTop: 14 }}>Your envelope was sent</div>
      <div style={{ fontSize: 13.5, color: T.muted, marginTop: 6 }}>{env.title}</div>
      <div style={{ textAlign: 'left', marginTop: 20, border: `1px solid ${T.hair}`, borderRadius: 12, padding: '6px 14px' }}>
        {steps.map(([o, rs]) => <div key={o} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: o === steps[0][0] ? 'none' : `1px solid ${T.hair}` }}>
          <span style={{ width: 22, height: 22, borderRadius: 99, background: '#F2F2F7', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted }}>{o}</span>
          <div style={{ flex: 1, minWidth: 0 }}>{rs.map((r) => <div key={r.id} style={{ fontSize: 13 }}><b>{r.name}</b> <span style={{ color: T.faint }}>· {actionLabel(r.action)}</span></div>)}</div>
          <span style={{ fontSize: 11.5, fontWeight: 650, color: rs.some((r) => r.status === 'sent' || r.status === 'completed') ? '#0066CC' : T.faint }}>{rs.some((r) => r.status === 'sent') ? 'Sent now' : rs.some((r) => r.status === 'completed') ? 'Copy sent' : 'Waiting'}</span>
        </div>)}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
        <Btn onClick={onClose}>Done</Btn>
        <Btn kind="primary" icon="eye" onClick={onOpen} data-testid="view-envelope">View envelope</Btn>
      </div>
    </div>
  </div>;
}
