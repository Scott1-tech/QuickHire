import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon } from '../tasks/lib';
import { store, svc, DOC_CATALOG, DOC_KEYS, defaultFieldsFor, uid, colorFor, validateEnvelope, daysUntil } from './store';
import { Modal, Field, Input, Textarea, Select, primaryBtn, ghostBtn, StatusPill } from './ui';
import { DocumentEditor } from './editor';
import { SigningPreview } from './signing';

const STEPS = ['Documents', 'Recipients', 'Prepare', 'Review & Send'];

/* Full envelope builder. Operates on a real draft envelope in the store. */
export function EnvelopeBuilder({ envId, onClose, onSent, toast }: any) {
  const [step, setStep] = React.useState(0);
  const [editing, setEditing] = React.useState(false);
  const [preview, setPreview] = React.useState(false);
  const [, force] = React.useReducer((x) => x + 1, 0);
  const env = svc.envelope(envId);
  if (!env) return null;

  const patch = (p: any) => { svc.updateEnvelope(envId, p); force(); };
  const errs = validateEnvelope(env);

  const send = () => { const res = svc.send(envId); if (res.ok) { toast?.('Envelope sent', 'success'); onSent?.(); onClose(); } else { toast?.(res.errors[0] || 'Cannot send', 'error'); setStep(3); } };
  const saveDraft = () => { svc.saveDraft(envId); toast?.('Draft saved', 'success'); onClose(); };

  if (editing) return <DocumentEditor title={env.title} subtitle={`${env.driverName || 'Recipient'} · ${env.carrier || ''}`}
    value={env} onChange={patch} onClose={() => setEditing(false)} onPreview={() => setPreview(true)}
    onSave={() => { svc.saveDraft(envId); toast?.('Draft saved', 'success'); }}
    onSend={() => { const res = svc.send(envId); if (res.ok) { toast?.('Envelope sent', 'success'); onSent?.(); onClose(); } else { toast?.(res.errors[0], 'error'); } }} />;

  if (preview) return <SigningPreview env={env} onClose={() => setPreview(false)} onComplete={(rid: string) => { svc.simulateSign(envId, rid); force(); }} />;

  return <div style={{ position: 'fixed', inset: 0, zIndex: 78, background: '#F5F6F8', display: 'flex', flexDirection: 'column' }}>
    <div style={{ height: 56, flex: 'none', display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', background: '#fff', borderBottom: `1px solid ${T.hair}` }}>
      <Hover as="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', color: T.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="x" size={18} /></Hover>
      <div style={{ fontSize: 14, fontWeight: 650 }}>New Envelope</div>
      <div style={{ flex: 1 }} />
      <Hover as="button" onClick={saveDraft} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Save Draft</Hover>
    </div>
    {/* stepper */}
    <div style={{ flex: 'none', display: 'flex', justifyContent: 'center', gap: 6, padding: '16px', background: '#fff', borderBottom: `1px solid ${T.hair}` }}>
      {STEPS.map((s, i) => <button key={s} onClick={() => setStep(i)} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, background: step === i ? 'rgba(0,122,255,0.1)' : 'transparent', color: step === i ? '#007AFF' : T.muted }}>
        <span style={{ width: 20, height: 20, borderRadius: 999, background: step > i ? '#34C759' : step === i ? '#007AFF' : '#E3E3E8', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{step > i ? <Icon name="check" size={12} /> : i + 1}</span>{s}
      </button>)}
    </div>

    <div style={{ flex: 1, overflowY: 'auto', padding: '26px 20px 80px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {step === 0 && <DocumentsStep env={env} patch={patch} toast={toast} />}
        {step === 1 && <RecipientsStep env={env} patch={patch} />}
        {step === 2 && <PrepareStep env={env} onOpen={() => setEditing(true)} />}
        {step === 3 && <ReviewStep env={env} patch={patch} errs={errs} onPreview={() => setPreview(true)} />}
      </div>
    </div>

    <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px', background: '#fff', borderTop: `1px solid ${T.hair}` }}>
      <div style={{ flex: 1, fontSize: 12, color: errs.length ? '#C62820' : '#248A3D' }}>{errs.length ? `${errs.length} item${errs.length > 1 ? 's' : ''} to resolve before sending` : 'Ready to send'}</div>
      {step > 0 && <Hover as="button" onClick={() => setStep(step - 1)} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Back</Hover>}
      {step < 3 ? <Hover as="button" onClick={() => setStep(step + 1)} style={primaryBtn} hover={{ background: '#0066D6' }}>Continue</Hover>
        : <Hover as="button" onClick={send} style={{ ...primaryBtn, opacity: errs.length ? 0.6 : 1 }} hover={{ background: '#0066D6' }}><Icon name="send" size={15} />Send Envelope</Hover>}
    </div>
  </div>;
}

function DocumentsStep({ env, patch, toast }: any) {
  const keys: string[] = env.documentKeys || [];
  const toggle = (k: string) => {
    const next = keys.includes(k) ? keys.filter((x) => x !== k) : [...keys, k];
    const signer = (env.recipients || []).find((r: any) => r.role === 'signer')?.id || (env.recipients[0] || {}).id || 'r1';
    // rebuild fields: keep fields for kept docs, add defaults for new docs
    let fields = (env.fields || []).filter((f: any) => next.includes(f.docKey));
    const added = next.filter((x) => !keys.includes(x));
    added.forEach((k2) => { fields = [...fields, ...defaultFieldsFor(k2, signer)]; });
    patch({ documentKeys: next, fields, title: env.title === 'Untitled envelope' && next.length ? DOC_CATALOG[next[0]].name : env.title });
  };
  return <>
    <SectionTitle title="Choose documents" desc="Pick from QuickHire's onboarding library, a template, or a package. Uploading a PDF is simulated in preview mode." />
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      <Hover as="button" onClick={() => toast?.('PDF upload is simulated in preview mode', 'info')} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="upload" size={15} />Upload PDF</Hover>
      <SmallMenu label="Use template" icon="copy" items={store.templates.map((t: any) => ({ label: t.name, onClick: () => { const fields = defaultFieldsFor(t.documentKey, (env.recipients[0] || {}).id || 'r1'); patch({ documentKeys: [...new Set([...keys, t.documentKey])], fields: [...env.fields.filter((f: any) => f.docKey !== t.documentKey), ...fields], title: t.name }); } }))} />
      <SmallMenu label="Use package" icon="briefcase" items={store.packages.map((p: any) => ({ label: p.name, onClick: () => { const signer = (env.recipients[0] || {}).id || 'r1'; let fields: any[] = []; p.documentKeys.forEach((k: string) => fields.push(...defaultFieldsFor(k, signer))); patch({ documentKeys: [...p.documentKeys], fields, title: p.name }); } }))} />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {DOC_KEYS.map((k) => { const on = keys.includes(k); const d = DOC_CATALOG[k]; return <Hover key={k} as="button" onClick={() => toggle(k)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 12, borderRadius: 12, border: `1.5px solid ${on ? '#007AFF' : T.border}`, background: on ? 'rgba(0,122,255,0.04)' : '#fff', cursor: 'pointer', textAlign: 'left' }} hover={{ background: on ? 'rgba(0,122,255,0.06)' : 'rgba(0,0,0,0.02)' }}>
        <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 9, background: on ? '#007AFF' : '#F2F2F7', color: on ? '#fff' : T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="fileText" size={16} /></span>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div><div style={{ fontSize: 11.5, color: T.faint }}>{d.category}</div></div>
        {on && <Icon name="checkCircle" size={18} style={{ color: '#007AFF' }} />}
      </Hover>; })}
    </div>
  </>;
}

function RecipientsStep({ env, patch }: any) {
  const recips = env.recipients || [];
  const add = () => patch({ recipients: [...recips, { id: uid('r'), name: '', email: '', role: 'signer', order: recips.length + 1, color: colorFor('R' + recips.length), status: 'pending' }] });
  const upd = (id: string, p: any) => patch({ recipients: recips.map((r: any) => (r.id === id ? { ...r, ...p } : r)) });
  const del = (id: string) => patch({ recipients: recips.filter((r: any) => r.id !== id), fields: (env.fields || []).filter((f: any) => f.recipientId !== id) });
  const ROLES = [{ value: 'signer', label: 'Needs to Sign' }, { value: 'cc', label: 'Receives a Copy' }, { value: 'viewer', label: 'Needs to View' }, { value: 'approver', label: 'Approver' }];
  return <>
    <SectionTitle title="Add recipients" desc="Set the signing order, role, and an optional private message for each recipient." />
    {recips.map((r: any, i: number) => <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 10, background: '#fff' }}>
      <span style={{ width: 26, height: 26, marginTop: 6, flex: 'none', borderRadius: 999, background: r.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Input value={r.name} onChange={(e: any) => upd(r.id, { name: e.target.value })} placeholder="Full name" />
        <Input value={r.email} onChange={(e: any) => upd(r.id, { email: e.target.value })} placeholder="Email address" />
        <Select value={r.role} onChange={(v: string) => upd(r.id, { role: v })} options={ROLES} />
        <Input value={r.message || ''} onChange={(e: any) => upd(r.id, { message: e.target.value })} placeholder="Private message (optional)" />
      </div>
      <Hover as="button" onClick={() => del(r.id)} style={{ width: 30, height: 30, marginTop: 4, flex: 'none', borderRadius: 8, border: 'none', background: 'transparent', color: '#C62820', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} hover={{ background: 'rgba(255,59,48,0.08)' }}><Icon name="trash" size={15} /></Hover>
    </div>)}
    <Hover as="button" onClick={add} style={{ ...ghostBtn, width: '100%', justifyContent: 'center' }} hover={{ background: 'rgba(0,0,0,0.03)' }}><Icon name="userPlus" size={15} />Add recipient</Hover>
  </>;
}

function PrepareStep({ env, onOpen }: any) {
  const signerFields = (env.fields || []).filter((f: any) => f.recipientId && env.recipients.some((r: any) => r.id === f.recipientId && r.role === 'signer'));
  return <>
    <SectionTitle title="Prepare documents" desc="Place signature, date, and data fields on each page. Assign every required field to a signer." />
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 18, border: `1px solid ${T.border}`, borderRadius: 14, background: '#fff' }}>
      <span style={{ width: 44, height: 44, flex: 'none', borderRadius: 11, background: 'rgba(0,122,255,0.1)', color: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="sign" size={22} /></span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 650 }}>{(env.documentKeys || []).length} document{(env.documentKeys || []).length === 1 ? '' : 's'} · {(env.fields || []).length} field{(env.fields || []).length === 1 ? '' : 's'}</div>
        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{signerFields.length} field{signerFields.length === 1 ? '' : 's'} assigned to signers</div>
      </div>
      <Hover as="button" onClick={onOpen} style={primaryBtn} hover={{ background: '#0066D6' }}><Icon name="pencil" size={15} />Open editor</Hover>
    </div>
  </>;
}

function ReviewStep({ env, patch, errs, onPreview }: any) {
  const exp = daysUntil(env.expiresAt);
  return <>
    <SectionTitle title="Review & send" desc="Confirm the email, reminders, and expiration, then send or save as a draft." />
    {errs.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: 14, borderRadius: 12, background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.2)', marginBottom: 16 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#C62820', display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="alert" size={15} />Resolve before sending</div>
      {errs.map((e: string, i: number) => <div key={i} style={{ fontSize: 12.5, color: '#C62820', paddingLeft: 22 }}>· {e}</div>)}
    </div>}
    <Field label="Email subject"><Input value={env.subject} onChange={(e: any) => patch({ subject: e.target.value })} placeholder="Please sign your documents" /></Field>
    <Field label="Email message"><Textarea rows={3} value={env.message} onChange={(e: any) => patch({ message: e.target.value })} placeholder="Add a personal note…" /></Field>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
      <Field label="Remind every (days)"><Input type="number" value={env.reminderEveryDays} onChange={(e: any) => patch({ reminderEveryDays: +e.target.value })} /></Field>
      <Field label="Max reminders"><Input type="number" value={env.maxReminders} onChange={(e: any) => patch({ maxReminders: +e.target.value })} /></Field>
      <Field label="Expires in (days)"><Input type="number" value={exp ?? 14} onChange={(e: any) => patch({ expiresAt: new Date(Date.now() + (+e.target.value) * 864e5).toISOString() })} /></Field>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
      <Hover as="button" onClick={onPreview} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="eye" size={15} />Preview signer experience</Hover>
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 12, color: T.faint }}>{(env.recipients || []).length} recipient{(env.recipients || []).length === 1 ? '' : 's'} · {(env.documentKeys || []).length} doc{(env.documentKeys || []).length === 1 ? '' : 's'}</span>
    </div>
  </>;
}

function SectionTitle({ title, desc }: any) { return <div style={{ marginBottom: 16 }}><h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h2><p style={{ margin: '3px 0 0', fontSize: 13, color: T.muted }}>{desc}</p></div>; }

function SmallMenu({ label, icon, items }: any) {
  const [open, setOpen] = React.useState(false);
  return <div style={{ position: 'relative' }}>
    <Hover as="button" onClick={() => setOpen((o) => !o)} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name={icon} size={15} />{label}<Icon name="chevronDown" size={13} /></Hover>
    {open && <><div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} /><div style={{ position: 'absolute', top: 42, left: 0, zIndex: 10, minWidth: 220, background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.12)', padding: 6 }}>
      {items.length === 0 && <div style={{ fontSize: 12.5, color: T.faint, padding: 10 }}>None available</div>}
      {items.map((it: any, i: number) => <Hover key={i} as="button" onClick={() => { it.onClick(); setOpen(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', background: 'transparent', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: T.text }} hover={{ background: 'rgba(0,0,0,0.05)' }}>{it.label}</Hover>)}
    </div></>}
  </div>;
}

/* ───────────────────────── Create / Edit package ───────────────────────── */
export function PackageModal({ pkg, onClose, toast }: any) {
  const [name, setName] = React.useState(pkg?.name || '');
  const [description, setDescription] = React.useState(pkg?.description || '');
  const [category, setCategory] = React.useState(pkg?.category || 'Onboarding');
  const [docKeys, setDocKeys] = React.useState<string[]>(pkg?.documentKeys || []);
  const [signingOrder, setSigningOrder] = React.useState(pkg?.signingOrder || 'sequential');
  const [subject, setSubject] = React.useState(pkg?.subject || '');
  const [message, setMessage] = React.useState(pkg?.message || '');
  const [reminderEveryDays, setRem] = React.useState(pkg?.reminderEveryDays || 3);
  const [expiresInDays, setExp] = React.useState(pkg?.expiresInDays || 14);

  const move = (i: number, dir: number) => { const j = i + dir; if (j < 0 || j >= docKeys.length) return; const next = [...docKeys]; [next[i], next[j]] = [next[j], next[i]]; setDocKeys(next); };
  const save = () => {
    if (!name.trim()) { toast?.('Name your package', 'error'); return; }
    if (!docKeys.length) { toast?.('Add at least one document', 'error'); return; }
    const data = { name: name.trim(), description, category, documentKeys: docKeys, signingOrder, subject, message, reminderEveryDays: +reminderEveryDays, expiresInDays: +expiresInDays };
    if (pkg) { svc.updatePackage(pkg.id, data); toast?.('Package updated', 'success'); } else { svc.createPackage(data); toast?.('Package created', 'success'); }
    onClose();
  };
  return <Modal title={pkg ? 'Edit package' : 'Create package'} subtitle="Reusable bundle of documents recruiters can send in one click." width={640} onClose={onClose}
    footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={save} style={primaryBtn} hover={{ background: '#0066D6' }}>{pkg ? 'Save package' : 'Create package'}</Hover></>}>
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
      <Field label="Package name"><Input value={name} onChange={(e: any) => setName(e.target.value)} placeholder="Company Driver Onboarding" /></Field>
      <Field label="Category"><Select value={category} onChange={setCategory} options={['Onboarding', 'Compliance', 'Rehire', 'Tax', 'Other']} /></Field>
    </div>
    <Field label="Description"><Input value={description} onChange={(e: any) => setDescription(e.target.value)} placeholder="What this package is for" /></Field>
    <Field label="Documents" hint="Click to add. Use the arrows to set the order documents appear in.">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
        {DOC_KEYS.map((k) => { const on = docKeys.includes(k); return <Hover key={k} as="button" onClick={() => setDocKeys(on ? docKeys.filter((x) => x !== k) : [...docKeys, k])} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, border: `1px solid ${on ? '#007AFF' : T.border}`, background: on ? 'rgba(0,122,255,0.06)' : '#fff', fontSize: 12.5, cursor: 'pointer', color: on ? '#007AFF' : T.text }} hover={{ background: on ? 'rgba(0,122,255,0.08)' : 'rgba(0,0,0,0.03)' }}>{on ? <Icon name="checkCircle" size={14} /> : <Icon name="plus" size={14} />}{DOC_CATALOG[k].name}</Hover>; })}
      </div>
    </Field>
    {docKeys.length > 0 && <Field label="Signing order">
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
        {docKeys.map((k, i) => <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderTop: i ? `1px solid ${T.hair}` : 'none' }}>
          <span style={{ fontSize: 11, color: T.faint, width: 16 }}>{i + 1}</span><span style={{ flex: 1, fontSize: 12.5 }}>{DOC_CATALOG[k].name}</span>
          <button onClick={() => move(i, -1)} style={arrowBtn}><Icon name="chevronDown" size={13} style={{ transform: 'rotate(180deg)' }} /></button>
          <button onClick={() => move(i, 1)} style={arrowBtn}><Icon name="chevronDown" size={13} /></button>
        </div>)}
      </div>
    </Field>}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Field label="Remind every (days)"><Input type="number" value={reminderEveryDays} onChange={(e: any) => setRem(e.target.value)} /></Field>
      <Field label="Expires in (days)"><Input type="number" value={expiresInDays} onChange={(e: any) => setExp(e.target.value)} /></Field>
    </div>
    <Field label="Default email subject"><Input value={subject} onChange={(e: any) => setSubject(e.target.value)} placeholder="Use {driver} and {carrier} as placeholders" /></Field>
    <Field label="Default email message"><Textarea rows={2} value={message} onChange={(e: any) => setMessage(e.target.value)} /></Field>
    <input type="hidden" value={signingOrder} onChange={() => setSigningOrder('sequential')} />
  </Modal>;
}
const arrowBtn: React.CSSProperties = { width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted };

/* ───────────────────────── Send package ───────────────────────── */
export function SendPackageModal({ pkg, drivers, onClose, onSent, toast }: any) {
  const [packageId, setPackageId] = React.useState(pkg?.id || store.packages[0]?.id || '');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [carrier, setCarrier] = React.useState('GRAND ONE LLC');
  const selected = store.packages.find((p: any) => p.id === packageId);

  const send = (draftOnly = false) => {
    if (!packageId) { toast?.('Choose a package', 'error'); return; }
    if (!name.trim() || !/.+@.+\..+/.test(email)) { toast?.('Add recipient name and a valid email', 'error'); return; }
    const out = svc.sendPackage(packageId, { name: name.trim(), email: email.trim(), carrier }, { draftOnly });
    if (out?.res?.ok) { toast?.(draftOnly ? 'Saved as draft' : 'Package sent', 'success'); onSent?.(); onClose(); }
    else { toast?.(out?.res?.errors?.[0] || 'Could not send', 'error'); }
  };
  return <Modal title="Send package" subtitle="Bundle of documents sent to one driver in a single envelope." width={560} onClose={onClose}
    footer={<><Hover as="button" onClick={() => send(true)} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Save as draft</Hover><Hover as="button" onClick={() => send(false)} style={primaryBtn} hover={{ background: '#0066D6' }}><Icon name="send" size={15} />Send now</Hover></>}>
    <Field label="Package"><Select value={packageId} onChange={setPackageId} options={store.packages.map((p: any) => ({ value: p.id, label: `${p.name} (${p.documentKeys.length} docs)` }))} /></Field>
    {selected && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>{selected.documentKeys.map((k: string) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 9px', borderRadius: 999, background: '#F2F2F7', fontSize: 11.5, color: T.muted }}><Icon name="fileText" size={12} />{DOC_CATALOG[k]?.name}</span>)}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Field label="Driver / recipient"><Input value={name} onChange={(e: any) => setName(e.target.value)} placeholder="Full name" list="qh-drivers" /></Field>
      <Field label="Email"><Input value={email} onChange={(e: any) => setEmail(e.target.value)} placeholder="driver@example.com" /></Field>
    </div>
    {drivers && <datalist id="qh-drivers">{drivers.map((d: any) => <option key={d.id} value={d.name} />)}</datalist>}
    {drivers && drivers.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>{drivers.slice(0, 6).map((d: any) => <Hover key={d.id} as="button" onClick={() => { setName(d.name); setEmail(d.email || (d.name.toLowerCase().replace(/[^a-z]/g, '.') + '@example.com')); setCarrier(d.carrier || carrier); }} style={{ height: 26, padding: '0 10px', borderRadius: 999, border: `1px solid ${T.border}`, background: '#fff', fontSize: 11.5, cursor: 'pointer', color: T.muted }} hover={{ background: 'rgba(0,0,0,0.04)' }}>{d.name}</Hover>)}</div>}
    <Field label="Carrier / company"><Input value={carrier} onChange={(e: any) => setCarrier(e.target.value)} /></Field>
  </Modal>;
}
