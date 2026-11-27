/* Recruiting (Leads) modals — new lead / Anna intake (with duplicate +
   boomerang detection), edit, change stage, next action, Anna summary,
   close / archive with a required reason, and the lead stage editor.
   The Leads board itself now lives in Pipelines (src/pipes). */
import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon } from '../tasks/lib';
import { Modal, Field, Input, Select, Textarea, primaryBtn, ghostBtn, Toggle } from '../esign/ui';
import { useRecruit, svc, USERS, SOURCES, INTEREST, CLOSE_REASONS } from './store';

export function RecruitModals({ modal, onClose, toast, onOpen }: any) {
  useRecruit();
  const k = modal.kind;
  if (k === 'new' || k === 'anna') {
    const isAnna = k === 'anna';
    const [v, setV] = React.useState<any>({ name: '', phone: '', email: '', location: 'Dallas, TX', licenseType: 'Class A', experienceYears: 3, availability: 'immediate', source: isAnna ? 'anna' : 'manual', interest: isAnna ? 'medium' : 'unknown' });
    const [dupe, setDupe] = React.useState<any>(null);
    const set = (key: string, val: any) => setV((s: any) => ({ ...s, [key]: val }));
    const submit = (force = false) => {
      if (!v.name.trim() || !v.phone.trim()) { toast('Name and phone are required', 'error'); return; }
      const res = (isAnna ? svc.annaIntake({ ...v, force }) : svc.addLead(v, { force }));
      if ((res as any).blocked) { toast('Blocked — this driver is Do-Not-Contact', 'error'); return; }
      if ((res as any).boomerang) { setDupe({ ...(res as any).dupe, boomerang: true }); return; }
      if ((res as any).duplicate) { setDupe((res as any).dupe); return; }
      toast(isAnna ? 'Anna captured the lead' : 'Lead created', 'success'); onClose(); onOpen((res as any).lead.id);
    };
    return <Modal title={isAnna ? 'Anna AI lead intake' : 'New lead'} subtitle={isAnna ? 'Anna captures the lead, sets interest, and starts the timeline.' : 'Add a driver lead to the pipeline.'} width={540} onClose={onClose}
      footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => submit(false)} style={primaryBtn} hover={{ background: '#0066D6' }}>{isAnna ? 'Capture lead' : 'Create lead'}</Hover></>}>
      {dupe && <div style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: 'rgba(255,159,10,0.1)', border: '1px solid rgba(255,159,10,0.3)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#A05A00', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="alert" size={15} />{dupe.boomerang ? 'Returning driver found' : 'Possible duplicate'}</div>
        <div style={{ fontSize: 12.5, color: T.muted, margin: '6px 0 10px' }}>Matches <b>{dupe.lead.name}</b> on {dupe.on}. {dupe.boomerang ? 'This driver was archived but can be re-contacted.' : ''}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {dupe.boomerang ? <Hover as="button" onClick={() => { svc.reopen(dupe.lead.id); toast('Re-opened from archive', 'success'); onClose(); onOpen(dupe.lead.id); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Re-open profile</Hover>
            : <><Hover as="button" onClick={() => { onClose(); onOpen(dupe.lead.id); }} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Open existing</Hover><Hover as="button" onClick={() => submit(true)} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Create anyway (flag)</Hover></>}
        </div>
      </div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Full name"><Input value={v.name} onChange={(e: any) => set('name', e.target.value)} /></Field>
        <Field label="Phone (primary key)"><Input value={v.phone} onChange={(e: any) => set('phone', e.target.value)} /></Field>
        <Field label="Email"><Input value={v.email} onChange={(e: any) => set('email', e.target.value)} /></Field>
        <Field label="Location"><Input value={v.location} onChange={(e: any) => set('location', e.target.value)} /></Field>
        <Field label="License"><Select value={v.licenseType} onChange={(x: string) => set('licenseType', x)} options={['Class A', 'Class B', 'Class C']} /></Field>
        <Field label="Experience (yrs)"><Input type="number" value={v.experienceYears} onChange={(e: any) => set('experienceYears', +e.target.value)} /></Field>
        <Field label="Availability"><Select value={v.availability} onChange={(x: string) => set('availability', x)} options={[{ value: 'immediate', label: 'Immediate' }, { value: '2weeks', label: '2 weeks' }, { value: 'flexible', label: 'Flexible' }]} /></Field>
        <Field label="Source"><Select value={v.source} onChange={(x: string) => set('source', x)} options={SOURCES.map((s) => ({ value: s.key, label: s.label }))} /></Field>
      </div>
      {isAnna && <Field label="Interest level"><Select value={v.interest} onChange={(x: string) => set('interest', x)} options={Object.keys(INTEREST).map((key) => ({ value: key, label: INTEREST[key].label }))} /></Field>}
    </Modal>;
  }
  if (k === 'editLead') {
    const l = svc.lead(modal.id);
    // eslint-disable-next-line
    const [v, setV] = React.useState<any>({ phone: l?.phone || '', email: l?.email || '', location: l?.location || '', licenseType: l?.licenseType || 'Class A', experienceYears: l?.experienceYears ?? 0, availability: l?.availability || 'immediate' });
    const set = (key: string, val: any) => setV((s: any) => ({ ...s, [key]: val }));
    return <Modal title="Edit lead" subtitle={l?.name} width={500} onClose={onClose} footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { svc.update(modal.id, { ...v, experienceYears: +v.experienceYears }); toast('Lead updated', 'success'); onClose(); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Save</Hover></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Phone"><Input value={v.phone} onChange={(e: any) => set('phone', e.target.value)} /></Field>
        <Field label="Email"><Input value={v.email} onChange={(e: any) => set('email', e.target.value)} /></Field>
        <Field label="Location"><Input value={v.location} onChange={(e: any) => set('location', e.target.value)} /></Field>
        <Field label="License"><Select value={v.licenseType} onChange={(x: string) => set('licenseType', x)} options={['Class A', 'Class B', 'Class C']} /></Field>
        <Field label="Experience (yrs)"><Input type="number" value={v.experienceYears} onChange={(e: any) => set('experienceYears', e.target.value)} /></Field>
        <Field label="Availability"><Select value={v.availability} onChange={(x: string) => set('availability', x)} options={[{ value: 'immediate', label: 'Immediate' }, { value: '2weeks', label: '2 weeks' }, { value: 'flexible', label: 'Flexible' }]} /></Field>
      </div>
    </Modal>;
  }
  if (k === 'moveStage') {
    const l = svc.lead(modal.id);
    return <Modal title="Change stage" subtitle={l?.name} width={420} onClose={onClose}>
      <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 10 }}>To close a lead use Reject / Refused; qualified leads move to Hiring from Pipelines.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{svc.stages().filter((s: any) => !s.terminal).map((s: any) => <Hover key={s.id} as="button" onClick={() => { svc.moveStage(modal.id, s.name); toast(`Moved to ${s.name}`, 'success'); onClose(); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, border: `1px solid ${s.name === l?.stageName ? '#007AFF' : T.border}`, background: s.name === l?.stageName ? 'rgba(0,122,255,0.06)' : '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }} hover={{ background: T.hover }}>{s.name}{s.name === l?.stageName && <span style={{ fontSize: 11, color: '#007AFF' }}>Current</span>}</Hover>)}</div>
    </Modal>;
  }
  if (k === 'nextAction') {
    const l = svc.lead(modal.id);
    const [v, setV] = React.useState({ title: l?.nextAction?.title || '', assignee: l?.nextAction?.assignee || 'NP', due: '', priority: 'normal' });
    return <Modal title="Set next action" subtitle={l?.name} width={460} onClose={onClose} footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { if (!v.title.trim()) { toast('Add a title', 'error'); return; } svc.setNextAction(modal.id, { ...v, status: 'open', due: v.due || null }); toast('Next action set', 'success'); onClose(); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Save</Hover></>}>
      <Field label="Action"><Select value={v.title} onChange={(x: string) => setV({ ...v, title: x })} options={['Call driver', 'Send document request', 'Follow up tomorrow', 'Waiting for driver response', 'Review documents', 'Send offer', 'Archive'].map((o: string) => ({ value: o, label: o }))} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Field label="Assignee"><Select value={v.assignee} onChange={(x: string) => setV({ ...v, assignee: x })} options={USERS.map((u) => ({ value: u.id, label: u.name }))} /></Field>
        <Field label="Due"><Input type="date" value={v.due} onChange={(e: any) => setV({ ...v, due: e.target.value })} /></Field>
        <Field label="Priority"><Select value={v.priority} onChange={(x: string) => setV({ ...v, priority: x })} options={['low', 'normal', 'high', 'urgent']} /></Field>
      </div>
    </Modal>;
  }
  if (k === 'annaSummary') {
    const l = svc.lead(modal.id);
    const [txt, setTxt] = React.useState(l?.annaSummary || '');
    const [interest, setInterest] = React.useState(l?.interest || 'medium');
    return <Modal title="Anna conversation summary" subtitle={l?.name} width={480} onClose={onClose} footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { svc.annaSummarize(modal.id, txt, interest); toast('Summary saved', 'success'); onClose(); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Save</Hover></>}>
      <Field label="Summary"><Textarea rows={4} value={txt} onChange={(e: any) => setTxt(e.target.value)} placeholder="What the driver said, key questions, objections…" /></Field>
      <Field label="Detected interest"><Select value={interest} onChange={setInterest} options={Object.keys(INTEREST).map((key) => ({ value: key, label: INTEREST[key].label }))} /></Field>
    </Modal>;
  }
  if (k === 'close' || k === 'archive') {
    const l = svc.lead(modal.id); const isArchive = k === 'archive';
    const [reason, setReason] = React.useState(CLOSE_REASONS[0]);
    const [contact, setContact] = React.useState(true);
    return <Modal title={isArchive ? 'Archive lead' : `Close — ${modal.decision?.replace(/_/g, ' ')}`} subtitle={l?.name} width={460} onClose={onClose}
      footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { if (isArchive) svc.archive(modal.id, reason, contact); else svc.close(modal.id, modal.decision, reason, contact); toast(isArchive ? 'Archived with report' : 'Closed', 'success'); onClose(); }} style={{ ...primaryBtn, background: '#FF3B30' }} hover={{ background: '#E0301F' }}>{isArchive ? 'Archive' : 'Confirm'}</Hover></>}>
      <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 12 }}>A reason is required. {isArchive ? 'This generates a full archive report and preserves the timeline.' : ''}</div>
      <Field label="Reason"><Select value={reason} onChange={setReason} options={CLOSE_REASONS} /></Field>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}><span style={{ fontSize: 13, color: T.muted }}>Can be contacted again later</span><Toggle on={contact} onChange={setContact} /></div>
    </Modal>;
  }
  if (k === 'settings') {
    const [name, setName] = React.useState('');
    const open = svc.allStages().filter((s: any) => !s.terminal);
    return <Modal title="Lead stages & SLAs" subtitle="Add, reorder, set the days-in-stage SLA, or disable stages. Closed stages (Not qualified, Moved to Hiring) are fixed." width={560} onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Input value={name} onChange={(e: any) => setName(e.target.value)} placeholder="New stage name" />
        <Hover as="button" onClick={() => { if (name.trim()) { svc.addStage(name.trim()); setName(''); toast('Stage added', 'success'); } }} style={{ ...primaryBtn, height: 38 }} hover={{ background: '#0066D6' }}>Add</Hover>
      </div>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {open.map((s: any, i: number) => <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i ? `1px solid ${T.hair}` : 'none', opacity: s.disabled ? 0.55 : 1 }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{s.name}{s.disabled && <span style={{ fontWeight: 500, color: T.faint }}> · disabled</span>}</span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: T.faint }}>SLA<input type="number" min={0} max={365} aria-label={`${s.name} SLA days`} value={s.maxDays || 0} onChange={(e) => svc.setStageMaxDays(s.id, Math.max(0, Math.min(365, +e.target.value || 0)))} style={{ width: 52, height: 28, borderRadius: 7, border: `1px solid ${T.border}`, padding: '0 6px', fontSize: 12.5 }} />d</label>
          <button onClick={() => svc.moveStageOrder(s.id, -1)} title="Move left" style={miniIcon}><Icon name="chevronLeft" size={13} /></button>
          <button onClick={() => svc.moveStageOrder(s.id, 1)} title="Move right" style={miniIcon}><Icon name="chevronRight" size={13} /></button>
          <button onClick={() => svc.disableStage(s.id)} title={s.disabled ? 'Enable' : 'Disable'} style={miniIcon}><Icon name={s.disabled ? 'check' : 'ban'} size={13} /></button>
        </div>)}
      </div>
    </Modal>;
  }
  return null;
}
const miniIcon: React.CSSProperties = { width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.border}`, background: '#fff', color: T.muted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
