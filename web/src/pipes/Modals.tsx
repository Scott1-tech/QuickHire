import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon } from '../tasks/lib';
import { Modal, Field, Input, Select, Textarea, Toggle, primaryBtn, ghostBtn } from '../esign/ui';
import { svc as hSvc } from '../hire/store';
import { PipeKey, QUIT_REASONS, RECRUITERS, ME } from './stages';
import { CheckItem, CheckAction } from './lifecycle';

const Btns = ({ onClose, onOk, okLabel, danger, disabled }: any) => <>
  <Hover as="button" type="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover>
  <Hover as="button" type="button" disabled={disabled} onClick={onOk} style={{ ...primaryBtn, background: danger ? '#FF3B30' : '#007AFF', opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }} hover={disabled ? {} : { background: danger ? '#E0301F' : '#0066D6' }}>{okLabel}</Hover>
</>;
const Wrap = ({ children }: any) => <div data-modal-open>{children}</div>;
const tomorrow = () => { const d = new Date(Date.now() + 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Required reason before a record enters a final / lost stage. */
export function ReasonModal({ title, subtitle, reasons, okLabel = 'Confirm', danger = true, onConfirm, onClose, intro }: { title: string; subtitle?: string; reasons: string[]; okLabel?: string; danger?: boolean; intro?: string; onConfirm: (reason: string, note: string) => void; onClose: () => void }) {
  const [reason, setReason] = React.useState('');
  const [note, setNote] = React.useState('');
  return <Wrap><Modal title={title} subtitle={subtitle} width={460} onClose={onClose} footer={<Btns onClose={onClose} okLabel={okLabel} danger={danger} disabled={!reason} onOk={() => reason && onConfirm(reason, note.trim())} />}>
    {intro && <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, marginBottom: 14 }}>{intro}</div>}
    <Field label="Reason (required)">
      <div role="radiogroup" aria-label="Reason" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {reasons.map((r) => <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(r)} style={chip(reason === r)}>{r}</button>)}
      </div>
    </Field>
    <Field label="Note (optional)"><Textarea rows={2} value={note} onChange={(e: any) => setNote(e.target.value)} placeholder="Anything the next recruiter should know…" /></Field>
  </Modal></Wrap>;
}

/** Active → Inactive exit form: reason list, quit vs terminated, rehire eligibility, note. */
export function QuitModal({ name, onConfirm, onClose }: { name: string; onConfirm: (q: { reason: string; type: 'Quit' | 'Terminated'; rehireEligible: boolean; note: string }) => void; onClose: () => void }) {
  const [reason, setReason] = React.useState('');
  const [type, setType] = React.useState<'Quit' | 'Terminated'>('Quit');
  const [eligible, setEligible] = React.useState(true);
  const [note, setNote] = React.useState('');
  const pick = (r: string) => { setReason(r); if (r === 'Failed drug test') { setType('Terminated'); setEligible(false); } };
  return <Wrap><Modal title={`${name} is leaving`} subtitle="Moves the driver to Inactive & Rehire. The exit reason feeds retention reports." width={480} onClose={onClose}
    footer={<Btns onClose={onClose} okLabel="Move to Inactive" danger disabled={!reason} onOk={() => reason && onConfirm({ reason, type, rehireEligible: eligible, note: note.trim() })} />}>
    <Field label="Type">
      <div style={{ display: 'inline-flex', gap: 2, padding: 3, background: T.segBg, borderRadius: 10 }}>
        {(['Quit', 'Terminated'] as const).map((t) => <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} style={{ height: 30, padding: '0 14px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: type === t ? '#fff' : 'transparent', color: type === t ? T.text : T.muted, boxShadow: type === t ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}>{t}</button>)}
      </div>
    </Field>
    <Field label="Reason (required)">
      <div role="radiogroup" aria-label="Exit reason" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {QUIT_REASONS.map((r) => <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => pick(r)} style={chip(reason === r)}>{r}</button>)}
      </div>
    </Field>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderRadius: 12, background: eligible ? 'rgba(52,199,89,0.08)' : 'rgba(255,59,48,0.06)', marginBottom: 14 }}>
      <div><div style={{ fontSize: 13.5, fontWeight: 600 }}>Eligible for rehire</div><div style={{ fontSize: 12, color: T.muted }}>{eligible ? 'Lands in Inactive — can be re-engaged later.' : 'Lands in Do not rehire.'}</div></div>
      <Toggle on={eligible} onChange={setEligible} />
    </div>
    <Field label="Note (optional)"><Textarea rows={2} value={note} onChange={(e: any) => setNote(e.target.value)} placeholder="Exit interview notes, last day, equipment returned…" /></Field>
  </Modal></Wrap>;
}

/** Shows open requirements before entering a stage, with one-click fixes. */
export function RequirementsModal({ name, target, missing, onAction, onConfirm, onClose }: { name: string; target: string; missing: CheckItem[]; onAction: (a: CheckAction) => void; onConfirm: (override: string[]) => void; onClose: () => void }) {
  const left = missing.filter((m) => !m.done);
  return <Wrap><Modal title={`Move ${name} to ${target}?`} subtitle={left.length ? `${left.length} requirement${left.length === 1 ? ' is' : 's are'} still open` : 'All requirements met'} width={480} onClose={onClose}
    footer={<Btns onClose={onClose} okLabel={left.length ? 'Move anyway' : `Move to ${target}`} onOk={() => onConfirm(left.map((m) => m.label))} />}>
    {left.length > 0 ? <>
      <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, marginBottom: 12 }}>Finish these now, or move anyway — the open items are logged on the timeline.</div>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {left.map((m, i) => <div key={m.key + i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: i ? `1px solid ${T.hair}` : 'none' }}>
          <Icon name="alert" size={14} style={{ color: '#FF9F0A', flex: 'none' }} />
          <span style={{ flex: 1, fontSize: 13 }}>{m.label}</span>
          {m.action && m.action.kind !== 'openProfile' && <Hover as="button" type="button" onClick={() => onAction(m.action!)} style={{ height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.04)' }}>{m.action.label}</Hover>}
        </div>)}
      </div>
    </> : <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: '#248A3D' }}><Icon name="checkCircle" size={16} />Everything required for {target} is done.</div>}
  </Modal></Wrap>;
}

export function TaskModal({ name, defaultTitle, count, onConfirm, onClose }: { name: string; defaultTitle: string; count?: number; onConfirm: (p: { title: string; due: string; priority: string }) => void; onClose: () => void }) {
  const [title, setTitle] = React.useState(defaultTitle);
  const [due, setDue] = React.useState(tomorrow());
  const [priority, setPriority] = React.useState('normal');
  const ok = () => title.trim() && onConfirm({ title: title.trim(), due, priority });
  return <Wrap><Modal title={count && count > 1 ? `Add a task for ${count} records` : 'Add task'} subtitle={count && count > 1 ? 'One task per selected record, sent to Tasks' : `Linked to ${name} · appears in Tasks`} width={460} onClose={onClose} footer={<Btns onClose={onClose} okLabel="Add task" disabled={!title.trim()} onOk={ok} />}>
    <Field label="Task"><Input autoFocus value={title} onChange={(e: any) => setTitle(e.target.value)} onKeyDown={(e: any) => { if (e.key === 'Enter') ok(); }} /></Field>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Field label="Due"><Input type="date" value={due} onChange={(e: any) => setDue(e.target.value)} /></Field>
      <Field label="Priority"><Select value={priority} onChange={setPriority} options={[{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }]} /></Field>
    </div>
  </Modal></Wrap>;
}

export function TextModal({ name, phone, defaultBody, onSend, onClose }: { name: string; phone: string; defaultBody: string; onSend: (body: string) => void; onClose: () => void }) {
  const [body, setBody] = React.useState(defaultBody);
  return <Wrap><Modal title={`Text ${name}`} subtitle={phone} width={460} onClose={onClose} footer={<Btns onClose={onClose} okLabel="Send text" disabled={!body.trim()} onOk={() => body.trim() && onSend(body.trim())} />}>
    <Field label="Message" hint={`${body.length} characters · logged on the timeline`}><Textarea autoFocus rows={4} value={body} onChange={(e: any) => setBody(e.target.value)} /></Field>
  </Modal></Wrap>;
}

export function NoteModal({ title, label, placeholder, okLabel = 'Save', onConfirm, onClose }: { title: string; label: string; placeholder?: string; okLabel?: string; onConfirm: (text: string) => void; onClose: () => void }) {
  const [text, setText] = React.useState('');
  return <Wrap><Modal title={title} width={440} onClose={onClose} footer={<Btns onClose={onClose} okLabel={okLabel} disabled={!text.trim()} onOk={() => text.trim() && onConfirm(text.trim())} />}>
    <Field label={label}><Textarea autoFocus rows={3} value={text} onChange={(e: any) => setText(e.target.value)} placeholder={placeholder} /></Field>
  </Modal></Wrap>;
}

/** Primary "add" action for Hiring / Active / Inactive. */
export function AddDriverModal({ pipe, onCreate, onClose }: { pipe: PipeKey; onCreate: (fields: any) => void; onClose: () => void }) {
  const carriers = hSvc.carriers();
  const [v, setV] = React.useState<any>({ name: '', phone: '', email: '', carrier: carriers.find((c: any) => /GRAND ONE/i.test(c.name))?.name || carriers[0]?.name || 'GRAND ONE LLC', cdlClass: 'A', owner: ME, truckNo: '', reason: QUIT_REASONS[0], eligible: true, lane: 'OTR · Dry van' });
  const set = (k: string, x: any) => setV((s: any) => ({ ...s, [k]: x }));
  const title = pipe === 'hiring' ? 'Add candidate' : pipe === 'active' ? 'Add active driver' : 'Add former driver';
  const ok = () => { if (!v.name.trim()) return; onCreate(v); };
  return <Wrap><Modal title={title} subtitle={pipe === 'hiring' ? 'Starts in Application' : pipe === 'active' ? 'Starts in First 90 days with check-in tasks' : 'Lands in Inactive & Rehire'} width={520} onClose={onClose} footer={<Btns onClose={onClose} okLabel={title} disabled={!v.name.trim()} onOk={ok} />}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', columnGap: 12 }}>
      <Field label="Full name"><Input autoFocus value={v.name} onChange={(e: any) => set('name', e.target.value)} /></Field>
      <Field label="Phone"><Input value={v.phone} onChange={(e: any) => set('phone', e.target.value)} placeholder="(214) 555-0100" /></Field>
      <Field label="Email"><Input value={v.email} onChange={(e: any) => set('email', e.target.value)} placeholder="auto from name" /></Field>
      <Field label="Carrier"><Select value={v.carrier} onChange={(x: string) => set('carrier', x)} options={carriers.map((c: any) => ({ value: c.name, label: c.name }))} /></Field>
      <Field label="CDL class"><Select value={v.cdlClass} onChange={(x: string) => set('cdlClass', x)} options={['A', 'B', 'C']} /></Field>
      <Field label="Lane"><Select value={v.lane} onChange={(x: string) => set('lane', x)} options={['OTR · Dry van', 'OTR · Flatbed', 'Regional · Dry van', 'Regional · Reefer', 'Local · Dry van']} /></Field>
      <Field label="Recruiter"><Select value={v.owner} onChange={(x: string) => set('owner', x)} options={RECRUITERS.map((r) => ({ value: r.id, label: r.name }))} /></Field>
      {pipe === 'active' && <Field label="Truck #"><Input value={v.truckNo} onChange={(e: any) => set('truckNo', e.target.value)} placeholder="e.g. 112" /></Field>}
      {pipe === 'inactive' && <Field label="Exit reason"><Select value={v.reason} onChange={(x: string) => set('reason', x)} options={QUIT_REASONS} /></Field>}
    </div>
    {pipe === 'inactive' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}><span style={{ fontSize: 13, color: T.muted }}>Eligible for rehire</span><Toggle on={v.eligible} onChange={(x: boolean) => set('eligible', x)} /></div>}
  </Modal></Wrap>;
}

const chip = (on: boolean): React.CSSProperties => ({ height: 32, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, border: `1px solid ${on ? '#007AFF' : 'rgba(0,0,0,0.12)'}`, background: on ? 'rgba(0,122,255,0.08)' : '#fff', color: on ? '#0066CC' : T.text });
