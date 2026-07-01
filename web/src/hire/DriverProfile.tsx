import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon, Avatar, useToasts, ToastHost } from '../tasks/lib';
import { Card, Modal, Field, Input, Select, Textarea, primaryBtn, ghostBtn, Toggle, EmptyState } from '../esign/ui';
import { EmploymentVerification } from '../comms/pev';
import { addExternalTask, makeTask } from '../tasks/bus';
import { pickAndSave, openFile } from '../shell/files';
import {
  useHire, svc, AI_STATUS_META, STEP_STATUS_META, STEP_STATUSES, STEP_GROUPS, DOC_STATUS_META,
  completeness, initials, fmtAgo, fmtDate, STAGES,
} from './store';
import { store as esignStore } from '../esign/store';

const BG = '#F5F6F8';
const TABS = ['Overview', 'Application', 'Checklist', 'Documents', 'DocuSign', 'Messages', 'PEV', 'Activity'];

export default function DriverProfile({ driverId, go, onBack }: { driverId: string; go: (p: string) => void; onBack: () => void }) {
  const store = useHire();
  const { toasts, toast } = useToasts();
  const [tab, setTab] = React.useState('Overview');
  const [modal, setModal] = React.useState<any>(null);
  const [anna, setAnna] = React.useState(false);
  const d = svc.driver(driverId);
  React.useEffect(() => { if (d && !d.aiReview) { svc.runAIReview(driverId); } }, [driverId]); // eslint-disable-line
  if (!d) return <div style={{ padding: 40 }}>Driver not found.</div>;
  const review = d.aiReview || svc.ensureReview(driverId);
  const comp = completeness(d);

  const act = (type: string, label: string) => setModal({ kind: 'quick', type, label });

  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: BG }}>
    <ToastHost toasts={toasts} />
    {/* header */}
    <div style={{ flex: 'none', background: '#fff', borderBottom: `1px solid ${T.hair}`, padding: '14px 24px' }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: T.muted, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12 }}><Icon name="chevronLeft" size={15} />Hiring Pipeline</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 56, height: 56, flex: 'none', borderRadius: 999, background: d.avatarBg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 650 }}>{initials(d.name)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{d.name}</h1>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 22, padding: '0 9px', borderRadius: 999, background: AI_STATUS_META[review.status].bg, color: AI_STATUS_META[review.status].color, fontSize: 11.5, fontWeight: 650 }}><Icon name="sparkles" size={12} />{AI_STATUS_META[review.status].label}</span>
            <button onClick={() => setModal({ kind: 'editDriver' })} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="pencil" size={13} /></button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 6, fontSize: 12.5, color: T.muted }}>
            <Meta icon="user" v={`${d.stage}`} /><Meta icon="building" v={d.carrier} /><Meta icon="phone" v={d.phone} /><Meta icon="mail" v={d.email} /><Meta icon="sign" v={`CDL ${d.cdlClass}`} /><Meta icon="briefcase" v={d.position} /><Meta icon="gauge" v={`Risk: ${d.risk}`} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['phone', 'Call', 'call'], ['message', 'Text', 'text'], ['mail', 'Email', 'email'], ['fileText', 'Note', 'note'], ['listChecks', 'Task', 'task']].map(([icon, label, type]) =>
            <Hover key={type} as="button" onClick={() => type === 'task' ? setModal({ kind: 'task' }) : act(type, label)} title={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: 54, padding: '8px 0', borderRadius: 10, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', color: T.text }} hover={{ background: T.hover }}><Icon name={icon} size={16} /><span style={{ fontSize: 10, fontWeight: 600, color: T.muted }}>{label}</span></Hover>)}
        </div>
      </div>
    </div>

    {/* body: 3 columns */}
    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      {/* LEFT */}
      <div style={{ width: 312, flex: 'none', borderRight: `1px solid ${T.hair}`, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <AIPanel d={d} review={review} onRerun={() => { svc.runAIReview(driverId); toast('Anna re-reviewed this driver', 'success'); }} onAnna={() => setAnna(true)} />
        <CarrierTruckPanel d={d} toast={toast} onEdit={() => setModal({ kind: 'carrierTruck' })} />
        <Card style={{ padding: 14 }}>
          <Label>Actions</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[['upload', 'Upload Document', () => setModal({ kind: 'upload' })], ['mail', 'Request Missing Documents', () => setModal({ kind: 'request' })], ['send', 'Send Application', () => setModal({ kind: 'application' })], ['briefcase', 'Send Offer Package', () => setModal({ kind: 'offer' })], ['shield', 'Start Compliance Check', () => { svc.startCompliance(driverId); toast('Compliance check started', 'success'); }], ['sign', 'Open DocuSign', () => go('docusign')], ['arrowRight', 'Move Stage', () => setModal({ kind: 'stage' })], ['ban', 'Archive Candidate', () => setModal({ kind: 'archive' })]].map(([icon, label, fn]: any) =>
              <Hover key={label} as="button" onClick={fn} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 10px', border: 'none', background: 'transparent', borderRadius: 9, fontSize: 13, cursor: 'pointer', color: label === 'Archive Candidate' ? '#C62820' : T.text }} hover={{ background: label === 'Archive Candidate' ? 'rgba(255,59,48,0.07)' : 'rgba(0,0,0,0.05)' }}><Icon name={icon} size={16} style={{ color: label === 'Archive Candidate' ? '#C62820' : T.muted }} />{label}</Hover>)}
          </div>
        </Card>
      </div>

      {/* MIDDLE */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 'none', display: 'flex', gap: 2, padding: '0 18px', borderBottom: `1px solid ${T.hair}`, background: '#fff', overflowX: 'auto' }}>
          {TABS.map((t) => <button key={t} onClick={() => setTab(t)} style={{ height: 44, padding: '0 14px', border: 'none', background: 'transparent', borderBottom: `2px solid ${tab === t ? '#007AFF' : 'transparent'}`, color: tab === t ? '#007AFF' : T.muted, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{t}</button>)}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {tab === 'Overview' && <Overview d={d} review={review} comp={comp} toast={toast} setModal={setModal} />}
          {tab === 'Application' && <Application d={d} toast={toast} />}
          {tab === 'Checklist' && <Checklist d={d} toast={toast} />}
          {tab === 'Documents' && <Documents d={d} toast={toast} setModal={setModal} />}
          {tab === 'DocuSign' && <DocuSignTab d={d} go={go} toast={toast} setModal={setModal} />}
          {tab === 'Messages' && <Messages d={d} toast={toast} />}
          {tab === 'PEV' && <EmploymentVerification contact={{ id: d.id, name: d.name, phone: d.phone, email: d.email }} />}
          {tab === 'Activity' && <ActivityTab d={d} />}
        </div>
      </div>

      {/* RIGHT activity */}
      <div style={{ width: 320, flex: 'none', borderLeft: `1px solid ${T.hair}`, background: '#fff', overflowY: 'auto', padding: 16 }}>
        <ActivityPanel d={d} toast={toast} onAdd={(type: string) => act(type, type[0].toUpperCase() + type.slice(1))} onTask={() => setModal({ kind: 'task' })} />
      </div>
    </div>

    {/* floating */}
    <div style={{ position: 'absolute', right: 26, bottom: 24, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 30 }}>
      <Hover as="button" onClick={() => setModal({ kind: 'task' })} title="New task" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 16px', borderRadius: 999, border: `1px solid ${T.border}`, background: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.14)', cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }} hover={{ background: T.hover }}><Icon name="plus" size={17} />Task</Hover>
      <Hover as="button" onClick={() => setAnna(true)} title="Ask Anna" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 48, padding: '0 18px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg,#007AFF,#5856D6)', color: '#fff', boxShadow: '0 10px 28px rgba(0,122,255,0.4)', cursor: 'pointer', fontSize: 14, fontWeight: 650 }} hover={{ opacity: 0.94 }}><Icon name="sparkles" size={18} />Anna AI</Hover>
    </div>

    {anna && <AnnaDrawer d={d} review={review} go={go} toast={toast} onClose={() => setAnna(false)} setModal={setModal} />}
    {modal && <ProfileModals modal={modal} d={d} go={go} toast={toast} onClose={() => setModal(null)} />}
  </div>;
}

function Meta({ icon, v }: any) { return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name={icon} size={13} style={{ color: '#C7C7CC' }} />{v}</span>; }
function Label({ children, right }: any) { return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}><span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.faint }}>{children}</span>{right}</div>; }

/* ───────── AI eligibility ───────── */
function AIPanel({ d, review, onRerun, onAnna }: any) {
  const m = AI_STATUS_META[review.status];
  return <Card style={{ padding: 16, borderColor: 'rgba(0,122,255,0.18)', background: 'linear-gradient(180deg,#F7FAFF,#FFFFFF)' }}>
    <Label right={<button onClick={onRerun} title="Re-run Anna review" style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: '#007AFF', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><Icon name="refresh" size={12} />Rerun</button>}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="sparkles" size={12} style={{ color: '#007AFF' }} />AI Eligibility</span></Label>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: 52, height: 52, flex: 'none' }}>
        <svg width={52} height={52} style={{ transform: 'rotate(-90deg)' }}><circle cx={26} cy={26} r={23} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={5} /><circle cx={26} cy={26} r={23} fill="none" stroke={m.color} strokeWidth={5} strokeDasharray={2 * Math.PI * 23} strokeDashoffset={2 * Math.PI * 23 * (1 - review.score / 100)} strokeLinecap="round" /></svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: m.color }}>{review.score}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 999, background: m.bg, color: m.color, fontSize: 11.5, fontWeight: 650 }}>{m.label}</span>
        <div style={{ fontSize: 11, color: T.faint, marginTop: 4 }}>Reviewed {fmtAgo(review.reviewedAt)}</div>
      </div>
    </div>
    <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5, marginTop: 10 }}>{review.summary}</div>
    {review.missing.length > 0 && <Block icon="alert" color="#C62820" title="Missing items" items={review.missing} />}
    {review.conflicts.length > 0 && <Block icon="ban" color="#C62820" title="Policy conflicts" items={review.conflicts} />}
    {review.risks.length > 0 && <Block icon="gauge" color="#A05A00" title="Risk factors" items={review.risks} />}
    <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 10, background: 'rgba(0,122,255,0.06)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#007AFF', letterSpacing: '0.04em' }}>Suggested next action</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 3 }}>{review.suggestedAction}</div>
    </div>
    <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11.5 }}>
      <div style={{ flex: 1 }}><div style={{ color: T.faint }}>Best-fit carrier</div><div style={{ fontWeight: 600 }}>{review.bestCarrier}</div></div>
      <div style={{ flex: 1 }}><div style={{ color: T.faint }}>Best-fit truck</div><div style={{ fontWeight: 600 }}>{review.bestTruck}</div></div>
    </div>
    <Hover as="button" onClick={onAnna} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', height: 34, marginTop: 12, borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#007AFF,#5856D6)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }} hover={{ opacity: 0.93 }}><Icon name="sparkles" size={14} />Ask Anna about this driver</Hover>
  </Card>;
}
function Block({ icon, color, title, items }: any) {
  return <div style={{ marginTop: 10 }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: T.faint, letterSpacing: '0.04em', marginBottom: 4 }}>{title}</div>
    {items.map((it: string, i: number) => <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12, color: T.muted, padding: '2px 0' }}><Icon name={icon} size={13} style={{ color, flex: 'none', marginTop: 1 }} />{it}</div>)}
  </div>;
}

/* ───────── carrier + truck ───────── */
function CarrierTruckPanel({ d, toast, onEdit }: any) {
  const carrier = svc.carrierByName(d.carrier);
  const trucks = svc.trucksForCarrier(d.carrier);
  const assigned = d.assignedTruckId ? trucks.find((t: any) => t.id === d.assignedTruckId) : null;
  return <Card style={{ padding: 14 }}>
    <Label right={<button onClick={onEdit} style={{ border: 'none', background: 'transparent', color: '#007AFF', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Edit</button>}>Company / Carrier / Truck</Label>
    <Row k="Hiring company" v={d.carrier} />
    <Row k="DOT / MC" v={`${carrier?.dot || '—'} · ${carrier?.mc || '—'}`} />
    <Row k="Carrier status" v={carrier?.status || '—'} chip={carrier?.status === 'active' ? 'ok' : 'warn'} />
    <Row k="Position" v={d.position} />
    <div style={{ borderTop: `1px solid ${T.hair}`, margin: '10px 0', paddingTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, marginBottom: 8 }}>ASSIGNED TRUCK</div>
      {assigned ? <>
        <Row k="Unit" v={assigned.unit} /><Row k="VIN" v={assigned.vin} /><Row k="Plate" v={assigned.plate} />{assigned.trailer && <Row k="Trailer" v={assigned.trailer} />}<Row k="Status" v={assigned.status} chip={assigned.status === 'Available' || assigned.status === 'Assigned' ? 'ok' : 'warn'} />
      </> : <div style={{ fontSize: 12, color: T.faint, marginBottom: 8 }}>No truck assigned.</div>}
      <Select value={d.assignedTruckId || ''} onChange={(v: string) => { if (v) { svc.assignTruck(d.id, v); toast('Truck assigned', 'success'); } }}
        options={[{ value: '', label: assigned ? 'Change truck…' : 'Assign a truck…' }, ...trucks.filter((t: any) => t.status === 'Available' || t.id === d.assignedTruckId).map((t: any) => ({ value: t.id, label: `Unit ${t.unit} · ${t.status}` }))]} style={{ marginTop: 6, height: 34 }} />
      <div style={{ fontSize: 11, color: T.faint, marginTop: 5 }}>Trucks shown are from {d.carrier}.</div>
    </div>
  </Card>;
}
function Row({ k, v, chip }: any) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', fontSize: 12.5 }}>
    <span style={{ color: T.faint }}>{k}</span>
    {chip ? <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: chip === 'ok' ? 'rgba(52,199,89,0.12)' : 'rgba(255,159,10,0.14)', color: chip === 'ok' ? '#248A3D' : '#A05A00', textTransform: 'capitalize' }}>{v}</span>
      : <span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>}
  </div>;
}

/* ───────── overview: hiring progress module ───────── */
function Overview({ d, review, comp, toast, setModal }: any) {
  const [customize, setCustomize] = React.useState(false);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const groups = STEP_GROUPS.map((g) => ({ g, steps: d.steps.filter((s: any) => s.group === g) }));
  const done = d.steps.filter((s: any) => s.status === 'complete').length;
  return <div style={{ maxWidth: 860 }}>
    <Card style={{ padding: 16, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}><span style={{ fontWeight: 650 }}>Profile completeness</span><span style={{ fontWeight: 700 }}>{comp}%</span></div>
          <div style={{ height: 8, borderRadius: 999, background: '#F2F2F7', overflow: 'hidden' }}><div style={{ width: `${comp}%`, height: '100%', borderRadius: 999, background: comp >= 80 ? '#34C759' : comp >= 50 ? '#FF9F0A' : '#FF3B30' }} /></div>
          <div style={{ fontSize: 11.5, color: T.faint, marginTop: 6 }}>{done} of {d.steps.length} hiring steps complete</div>
        </div>
      </div>
    </Card>

    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Hiring Progress</h2>
      <Hover as="button" onClick={() => setCustomize((c) => !c)} style={{ ...ghostBtn, height: 32, padding: '0 12px', fontSize: 12.5 }} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="settings" size={14} />{customize ? 'Done' : 'Customize'}</Hover>
    </div>

    {groups.map(({ g, steps }) => <div key={g} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{g}</span>
        <span style={{ fontSize: 11, color: T.faint }}>{steps.filter((s: any) => s.status === 'complete').length}/{steps.length}</span>
        {customize && <button onClick={() => setModal({ kind: 'addStep', group: g })} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: '#007AFF', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><Icon name="plus" size={12} />Add step</button>}
      </div>
      <Card style={{ overflow: 'hidden' }}>
        {steps.length === 0 && <div style={{ fontSize: 12.5, color: T.faint, padding: 14 }}>No steps.</div>}
        {steps.map((s: any, i: number) => <StepRow key={s.id} d={d} s={s} first={i === 0} expanded={!!open[s.id]} customize={customize} onToggle={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))} toast={toast} />)}
      </Card>
    </div>)}
  </div>;
}
function StepRow({ d, s, first, expanded, customize, onToggle, toast }: any) {
  const m = STEP_STATUS_META[s.status];
  const cycle = () => { const i = STEP_STATUSES.indexOf(s.status); svc.setStepStatus(d.id, s.id, STEP_STATUSES[(i + 1) % STEP_STATUSES.length]); };
  return <div style={{ borderTop: first ? 'none' : `1px solid ${T.hair}` }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px' }}>
      <span style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: '#F2F2F7', color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={s.icon} size={15} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.name}{s.required && <span style={{ color: '#FF3B30', marginLeft: 4 }}>*</span>}</div>
        <div style={{ fontSize: 11.5, color: T.faint }}>Due {fmtDate(s.due)} · {s.owner}</div>
      </div>
      <button onClick={cycle} title="Change status" style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 9px', borderRadius: 999, border: 'none', background: m.bg, color: m.color, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>{m.label}</button>
      {!customize && <>
        <button onClick={() => { svc.setStepStatus(d.id, s.id, 'complete'); toast(`${s.name} marked complete`, 'success'); }} title="Run / complete" style={iconBtn}><Icon name="checkCircle" size={16} /></button>
        <button onClick={onToggle} style={iconBtn}><Icon name="chevronDown" size={15} style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} /></button>
      </>}
      {customize && <>
        <button onClick={() => svc.moveStep(d.id, s.id, -1)} style={iconBtn}><Icon name="chevronDown" size={14} style={{ transform: 'rotate(180deg)' }} /></button>
        <button onClick={() => svc.moveStep(d.id, s.id, 1)} style={iconBtn}><Icon name="chevronDown" size={14} /></button>
        <button onClick={() => svc.toggleStepRequired(d.id, s.id)} title="Required" style={{ ...iconBtn, color: s.required ? '#007AFF' : T.faint }}><Icon name="flag" size={14} /></button>
        <button onClick={() => svc.removeStep(d.id, s.id)} style={{ ...iconBtn, color: '#C62820' }}><Icon name="trash" size={14} /></button>
      </>}
    </div>
    {expanded && !customize && <div style={{ padding: '0 14px 14px 56px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <SmallBtn icon="zap" label="Run check" onClick={() => { svc.setStepStatus(d.id, s.id, 'in_progress'); toast(`${s.name} running`, 'info'); }} />
        <SmallBtn icon="upload" label="Upload" onClick={() => pickAndSave('application/pdf,image/*', (f) => { svc.addDocument(d.id, s.name, 'collected', f.id, f.name); toast(`${f.name} attached to ${s.name}`, 'success'); }, (m) => toast(m, 'error'))} />
        <SmallBtn icon="eye" label="View" onClick={() => { const doc = d.documents.find((x: any) => x.name === s.name && x.fileId); if (!openFile(doc?.fileId)) toast('No file attached to this step yet', 'info'); }} />
      </div>
      <Textarea rows={2} placeholder="Add notes…" defaultValue={s.notes} onBlur={(e: any) => { s.notes = e.target.value; }} />
    </div>}
  </div>;
}
const iconBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: T.muted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
function SmallBtn({ icon, label, onClick }: any) { return <Hover as="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: T.text }} hover={{ background: T.hover }}><Icon name={icon} size={13} />{label}</Hover>; }

/* ───────── tabs ───────── */
function Application({ d, toast }: any) {
  const [app, setApp] = React.useState(d.application);
  const set = (k: string, v: any) => { const n = { ...app, [k]: v }; setApp(n); svc.update(d.id, { application: n }); };
  return <div style={{ maxWidth: 640 }}>
    <Card style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Driver Application</h2>
        <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 999, background: app.submitted ? 'rgba(52,199,89,0.12)' : 'rgba(255,159,10,0.14)', color: app.submitted ? '#248A3D' : '#A05A00', fontSize: 11.5, fontWeight: 600 }}>{app.submitted ? 'Submitted' : 'Not submitted'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Full name"><Input defaultValue={d.name} disabled /></Field>
        <Field label="Phone"><Input defaultValue={d.phone} /></Field>
        <Field label="Email"><Input defaultValue={d.email} /></Field>
        <Field label="CDL class"><Input defaultValue={d.cdlClass} /></Field>
        <Field label="Start date"><Input type="date" value={app.startDate} onChange={(e: any) => set('startDate', e.target.value)} /></Field>
        <Field label="Pay rate"><Input value={app.payRate} onChange={(e: any) => set('payRate', e.target.value)} placeholder="$0.60/mi" /></Field>
      </div>
      <Field label="Emergency contact"><Input value={app.emergencyContact} onChange={(e: any) => set('emergencyContact', e.target.value)} /></Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <Hover as="button" onClick={() => { set('submitted', true); svc.log(d.id, 'application', 'Application marked submitted'); toast('Application saved', 'success'); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Save application</Hover>
        <Hover as="button" onClick={() => toast('Application PDF downloaded (simulated)', 'success')} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="download" size={15} />Download PDF</Hover>
      </div>
    </Card>
  </div>;
}
function Checklist({ d, toast }: any) {
  return <div style={{ maxWidth: 720 }}>
    <Card style={{ overflow: 'hidden' }}>
      {d.steps.map((s: any, i: number) => { const m = STEP_STATUS_META[s.status]; const isDone = s.status === 'complete'; return <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderTop: i ? `1px solid ${T.hair}` : 'none' }}>
        <button onClick={() => { svc.setStepStatus(d.id, s.id, isDone ? 'not_started' : 'complete'); toast(`${s.name} ${isDone ? 'reopened' : 'complete'}`, 'success'); }} style={{ width: 22, height: 22, flex: 'none', borderRadius: 999, border: `1.5px solid ${isDone ? '#34C759' : 'rgba(0,0,0,0.25)'}`, background: isDone ? '#34C759' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', padding: 0 }}>{isDone && <Icon name="check" size={14} />}</button>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: 11.5, color: T.faint }}>{s.group} · due {fmtDate(s.due)}</div></div>
        <span style={{ display: 'inline-flex', height: 22, padding: '0 9px', borderRadius: 999, background: m.bg, color: m.color, fontSize: 11.5, fontWeight: 600, alignItems: 'center' }}>{m.label}</span>
      </div>; })}
    </Card>
  </div>;
}
function Documents({ d, toast, setModal }: any) {
  return <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Documents</h2>
      <Hover as="button" onClick={() => setModal({ kind: 'addDoc' })} style={{ ...ghostBtn, height: 32, padding: '0 12px', fontSize: 12.5 }} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="plus" size={14} />Add requirement</Hover>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
      {d.documents.map((doc: any) => { const m = DOC_STATUS_META[doc.status]; return <Card key={doc.key} style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 9, background: m.bg, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="fileText" size={16} /></span>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 650 }}>{doc.name}</div><div style={{ fontSize: 11, color: T.faint }}>{doc.required ? 'Required' : 'Optional'}{doc.exp ? ` · exp ${fmtDate(doc.exp)}` : ''}</div></div>
        </div>
        <div style={{ marginTop: 10 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 9px', borderRadius: 999, background: m.bg, color: m.color, fontSize: 11.5, fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: m.color }} />{m.label}</span></div>
        {doc.fileName && <div style={{ fontSize: 11, color: T.faint, marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="paperclip" size={11} />{doc.fileName}</div>}
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {doc.status === 'missing'
            ? <><SmallBtn icon="upload" label="Upload" onClick={() => pickAndSave('application/pdf,image/*', (f) => { svc.setDocFile(d.id, doc.key, f.id, f.name); toast(`${doc.name} uploaded — ${f.name}`, 'success'); }, (m) => toast(m, 'error'))} /><SmallBtn icon="mail" label="Request" onClick={() => { svc.setDocStatus(d.id, doc.key, 'pending'); svc.log(d.id, 'request', `Requested ${doc.name}`); toast('Requested from driver', 'success'); }} /></>
            : <><SmallBtn icon="eye" label="View" onClick={() => { if (!openFile(doc.fileId)) toast('No file attached yet — use Replace to upload one', 'info'); }} /><SmallBtn icon="repeat" label="Replace" onClick={() => pickAndSave('application/pdf,image/*', (f) => { svc.setDocFile(d.id, doc.key, f.id, f.name); toast(`Replaced with ${f.name}`, 'success'); }, (m) => toast(m, 'error'))} /></>}
        </div>
      </Card>; })}
    </div>
  </div>;
}
function DocuSignTab({ d, go, toast, setModal }: any) {
  const envs = (esignStore.envelopes || []).filter((e: any) => (e.driverName || '').toLowerCase() === d.name.toLowerCase());
  return <div style={{ maxWidth: 760 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>DocuSign</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <Hover as="button" onClick={() => setModal({ kind: 'offer' })} style={{ ...ghostBtn, height: 32, padding: '0 12px', fontSize: 12.5 }} hover={{ background: 'rgba(0,0,0,0.04)' }}>Send package</Hover>
        <Hover as="button" onClick={() => go('docusign')} style={{ ...primaryBtn, height: 32, padding: '0 12px', fontSize: 12.5 }} hover={{ background: '#0066D6' }}>Open e-Signature</Hover>
      </div>
    </div>
    {envs.length === 0 ? <Card><EmptyState icon="sign" title="No envelopes yet" body="Send an offer package or start an envelope in e-Signature." action={<Hover as="button" onClick={() => go('docusign')} style={primaryBtn} hover={{ background: '#0066D6' }}>Open e-Signature</Hover>} /></Card>
      : <Card style={{ overflow: 'hidden' }}>{envs.map((e: any, i: number) => <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i ? `1px solid ${T.hair}` : 'none' }}>
        <Icon name="fileText" size={16} style={{ color: T.faint }} />
        <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.title}</div><div style={{ fontSize: 11.5, color: T.faint }}>{e.status}</div></div>
        <Hover as="button" onClick={() => go('docusign')} style={{ ...ghostBtn, height: 30, padding: '0 11px', fontSize: 12 }} hover={{ background: 'rgba(0,0,0,0.04)' }}>Open</Hover>
      </div>)}</Card>}
  </div>;
}
function Messages({ d, toast }: any) {
  const store = useHire(); void store;
  const [chan, setChan] = React.useState('text');
  const [body, setBody] = React.useState('');
  const msgs = d.activities.filter((a: any) => a.type === 'text' || a.type === 'email' || a.type === 'call');
  const send = () => { if (!body.trim()) return; svc.log(d.id, chan, `${chan === 'email' ? 'Email' : chan === 'call' ? 'Call note' : 'Text'} to ${d.name}`, body); setBody(''); toast(`${chan === 'email' ? 'Email' : 'Message'} logged`, 'success'); };
  return <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', height: '100%' }}>
    <Card style={{ flex: 1, minHeight: 220, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {msgs.length === 0 && <div style={{ fontSize: 12.5, color: T.faint, textAlign: 'center', padding: 20 }}>No messages yet. Send a text or email below.</div>}
        {msgs.slice().reverse().map((m: any) => <div key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '80%' }}>
          <div style={{ padding: '9px 12px', borderRadius: 14, borderTopRightRadius: 4, background: '#007AFF', color: '#fff', fontSize: 13 }}>{m.detail || m.title}</div>
          <div style={{ fontSize: 10.5, color: T.faint, textAlign: 'right', marginTop: 2 }}>{m.type} · {fmtAgo(m.at)}</div>
        </div>)}
      </div>
      <div style={{ flex: 'none', borderTop: `1px solid ${T.hair}`, padding: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Select value={chan} onChange={setChan} options={[{ value: 'text', label: 'SMS' }, { value: 'email', label: 'Email' }, { value: 'call', label: 'Call note' }]} style={{ width: 110, height: 36 }} />
        <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder={`Message ${d.name.split(' ')[0]}…`} style={{ flex: 1, height: 36, borderRadius: 9, border: `1px solid ${T.border}`, padding: '0 11px', fontSize: 13, outline: 'none' }} />
        <Hover as="button" onClick={send} style={{ ...primaryBtn, height: 36 }} hover={{ background: '#0066D6' }}><Icon name="send" size={15} /></Hover>
      </div>
    </Card>
  </div>;
}
function ActivityTab({ d }: any) {
  const [filter, setFilter] = React.useState('all');
  const types = ['all', ...Array.from(new Set(d.activities.map((a: any) => a.type)))];
  const items = d.activities.filter((a: any) => filter === 'all' || a.type === filter);
  return <div style={{ maxWidth: 720 }}>
    <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
      {types.map((t: any) => <button key={t} onClick={() => setFilter(t)} style={{ height: 28, padding: '0 11px', borderRadius: 999, border: `1px solid ${filter === t ? '#007AFF' : T.border}`, background: filter === t ? 'rgba(0,122,255,0.08)' : '#fff', color: filter === t ? '#007AFF' : T.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>)}
    </div>
    <Card style={{ padding: 16 }}>{items.length === 0 ? <div style={{ fontSize: 12.5, color: T.faint }}>No activity.</div> : items.map((a: any, i: number) => <ActivityRow key={a.id} a={a} first={i === 0} />)}</Card>
  </div>;
}
function ActivityRow({ a, first }: any) {
  return <div style={{ display: 'flex', gap: 11, padding: '10px 0', borderTop: first ? 'none' : `1px solid ${T.hair}` }}>
    <span style={{ width: 26, height: 26, flex: 'none', borderRadius: 999, background: '#F2F2F7', color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={ACT_ICON[a.type] || 'circle'} size={13} /></span>
    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13 }}>{a.title}</div>{a.detail && <div style={{ fontSize: 12, color: T.muted, marginTop: 1 }}>{a.detail}</div>}<div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>{a.user} · {fmtAgo(a.at)}</div></div>
  </div>;
}
const ACT_ICON: Record<string, string> = { stage: 'arrowRight', step: 'checkCircle', document: 'fileText', request: 'mail', truck: 'truck', carrier: 'building', ai: 'sparkles', application: 'send', offer: 'briefcase', compliance: 'shield', archive: 'ban', call: 'phone', text: 'message', email: 'mail', note: 'fileText', task: 'listChecks' };

/* right activity panel */
function ActivityPanel({ d, onAdd, onTask }: any) {
  return <>
    <Label right={<button onClick={onTask} style={{ border: 'none', background: 'transparent', color: '#007AFF', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>+ Task</button>}>Activity</Label>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 14 }}>
      {[['fileText', 'Note', 'note'], ['phone', 'Call', 'call'], ['message', 'Text', 'text'], ['mail', 'Email', 'email']].map(([icon, label, type]) =>
        <Hover key={type} as="button" onClick={() => onAdd(type)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 0', borderRadius: 9, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer' }} hover={{ background: T.hover }}><Icon name={icon} size={15} /><span style={{ fontSize: 10, fontWeight: 600, color: T.muted }}>{label}</span></Hover>)}
    </div>
    <div>{d.activities.length === 0 ? <div style={{ fontSize: 12.5, color: T.faint }}>No activity yet.</div> : d.activities.slice(0, 30).map((a: any, i: number) => <ActivityRow key={a.id} a={a} first={i === 0} />)}</div>
  </>;
}

/* ───────── Anna drawer ───────── */
function AnnaDrawer({ d, review, go, toast, onClose, setModal }: any) {
  const [log, setLog] = React.useState<any[]>([{ who: 'anna', text: `Here's my read on ${d.name}: ${review.summary}` }]);
  const run = (label: string, fn: () => string) => { setLog((l) => [...l, { who: 'you', text: label }, { who: 'anna', text: fn() }]); };
  const actions = [
    ['Enroll MVR', () => { svc.setStepStatus(d.id, d.steps.find((s: any) => s.name === 'MVR Check')?.id, 'in_progress'); return 'Enrolled the MVR check — running now and logged to activity.'; }],
    ['Enroll PSP', () => { svc.setStepStatus(d.id, d.steps.find((s: any) => s.name === 'PSP Report')?.id, 'in_progress'); return 'Enrolled the PSP report request.'; }],
    ['Enroll Clearinghouse', () => { svc.setStepStatus(d.id, d.steps.find((s: any) => s.name === 'Clearinghouse Query')?.id, 'in_progress'); return 'Submitted the Clearinghouse limited query.'; }],
    ['Review missing documents', () => review.missing.length ? `Missing: ${review.missing.join(', ')}. I can request these from the driver.` : 'No required documents are missing.'],
    ['Review eligibility', () => `${AI_STATUS_META[review.status].label} (score ${review.score}). ${review.summary}`],
    ['Compare to carrier policy', () => review.conflicts.length ? `Policy conflicts with ${d.carrier}: ${review.conflicts.join('; ')}.` : `Meets all ${d.carrier} policy thresholds (MVR, accidents, DUI, experience).`],
    ['Recommend carrier', () => `Best fit: ${review.bestCarrier}. The driver's CDL class, endorsements and record align with this carrier's hiring and insurance rules.`],
    ['Recommend truck', () => `Suggested: ${review.bestTruck} from ${d.carrier}.`],
    ['Suggest next action', () => review.suggestedAction],
    ['Draft message to driver', () => `Hi ${d.name.split(' ')[0]}, to keep your onboarding moving we still need: ${review.missing[0] || 'your signed documents'}. You can upload it from the link we sent. — ${d.ownerName}`],
    ['Create task', () => { setModal({ kind: 'task' }); return 'Opening the task form linked to this driver.'; }],
    ['Summarize profile', () => `${d.name} · ${d.position} for ${d.carrier} · stage ${d.stage} · ${completeness(d)}% complete · ${AI_STATUS_META[review.status].label}.`],
  ];
  return <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', justifyContent: 'flex-end' }}>
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(2px)' }} />
    <div style={{ position: 'relative', width: 420, maxWidth: '94vw', height: '100%', background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: `1px solid ${T.hair}` }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#007AFF,#5856D6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="sparkles" size={17} /></span>
        <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Anna</div><div style={{ fontSize: 11.5, color: T.faint }}>Helping with {d.name}</div></div>
        <button onClick={onClose} style={{ ...iconBtn, width: 32, height: 32 }}><Icon name="x" size={16} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {log.map((m, i) => <div key={i} style={{ alignSelf: m.who === 'you' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
          <div style={{ padding: '9px 12px', borderRadius: 14, fontSize: 13, lineHeight: 1.5, background: m.who === 'you' ? '#007AFF' : '#F2F2F7', color: m.who === 'you' ? '#fff' : T.text, borderTopRightRadius: m.who === 'you' ? 4 : 14, borderTopLeftRadius: m.who === 'you' ? 14 : 4 }}>{m.text}</div>
        </div>)}
      </div>
      <div style={{ flex: 'none', borderTop: `1px solid ${T.hair}`, padding: 12, display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
        {actions.map(([label, fn]: any) => <button key={label} onClick={() => run(label, fn)} style={{ height: 30, padding: '0 11px', borderRadius: 999, border: `1px solid ${T.border}`, background: '#fff', fontSize: 12, fontWeight: 600, color: T.text, cursor: 'pointer' }}>{label}</button>)}
      </div>
    </div>
  </div>;
}

/* ───────── modals ───────── */
function ProfileModals({ modal, d, go, toast, onClose }: any) {
  const k = modal.kind;
  if (k === 'quick') {
    const cfg: any = { call: ['Log call', 'Outcome & notes'], text: ['Send text', 'Message'], email: ['Send email', 'Message'], note: ['Add note', 'Note'] };
    const [c, l] = cfg[modal.type] || ['Log', 'Notes'];
    let val = '';
    return <Modal title={`${c} — ${d.name}`} width={460} onClose={onClose} footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { svc.log(d.id, modal.type, `${c}`, val); toast(`${c} logged`, 'success'); onClose(); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Save</Hover></>}>
      <Field label={l}><Textarea rows={4} onChange={(e: any) => { val = e.target.value; }} placeholder={`${l}…`} /></Field>
    </Modal>;
  }
  if (k === 'task') {
    let title = '', due = '', priority = 'normal';
    return <Modal title="New task" subtitle={`Linked to ${d.name}`} width={480} onClose={onClose} footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { if (!title.trim()) { toast('Add a title', 'error'); return; } addExternalTask(makeTask({ title, due: due || null, priority, related: d.name, relatedType: 'driver', assignee: 'NP', createdBy: 'Nina Patel' })); svc.log(d.id, 'task', `Task created — ${title}`); toast('Task created', 'success'); onClose(); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Create task</Hover></>}>
      <Field label="Task title"><Input onChange={(e: any) => { title = e.target.value; }} placeholder="Follow up on…" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Due date"><Input type="date" onChange={(e: any) => { due = e.target.value; }} /></Field>
        <Field label="Priority"><Select value={priority} onChange={(v: string) => { priority = v; }} options={[{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }]} /></Field>
      </div>
    </Modal>;
  }
  if (k === 'stage') {
    return <Modal title="Move stage" subtitle={`${d.name} is in ${d.stage}`} width={420} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {STAGES.map((s) => <Hover key={s} as="button" onClick={() => { svc.moveStage(d.id, s); toast(`Moved to ${s}`, 'success'); onClose(); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 12px', borderRadius: 10, border: `1px solid ${s === d.stage ? '#007AFF' : T.border}`, background: s === d.stage ? 'rgba(0,122,255,0.06)' : '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }} hover={{ background: T.hover }}>{s}{s === d.stage && <span style={{ fontSize: 11, color: '#007AFF' }}>Current</span>}</Hover>)}
      </div>
    </Modal>;
  }
  if (k === 'archive') {
    let reason = '';
    return <Modal title="Archive candidate" width={440} onClose={onClose} footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { if (!reason.trim()) { toast('A reason is required', 'error'); return; } svc.archive(d.id, reason); toast('Candidate archived', 'info'); onClose(); }} style={{ ...primaryBtn, background: '#FF3B30' }} hover={{ background: '#E0301F' }}>Archive</Hover></>}>
      <div style={{ fontSize: 13, color: T.muted, marginBottom: 12 }}>Archiving removes {d.name} from the active pipeline. This is logged.</div>
      <Field label="Reason (required)"><Textarea rows={3} onChange={(e: any) => { reason = e.target.value; }} placeholder="e.g. Withdrew, hired elsewhere…" /></Field>
    </Modal>;
  }
  if (k === 'request') {
    const missing = d.documents.filter((x: any) => x.status === 'missing');
    const sel = new Set<string>(missing.map((m: any) => m.name));
    const Comp = () => { const [, f] = React.useReducer((x) => x + 1, 0); return <>
      {missing.length === 0 ? <div style={{ fontSize: 13, color: T.muted }}>No missing documents 🎉</div> : missing.map((m: any) => <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer' }}>
        <input type="checkbox" defaultChecked onChange={(e) => { e.target.checked ? sel.add(m.name) : sel.delete(m.name); f(); }} />{m.name}</label>)}
    </>; };
    return <Modal title="Request documents" subtitle={`Send a request to ${d.name}`} width={460} onClose={onClose} footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { svc.requestDocs(d.id, [...sel]); toast(`Requested ${sel.size} document${sel.size > 1 ? 's' : ''}`, 'success'); onClose(); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Send request</Hover></>}><Comp /></Modal>;
  }
  if (k === 'upload') {
    return <Modal title="Upload document" subtitle="Pick which requirement this file belongs to — the file is stored and viewable." width={440} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {d.documents.map((doc: any) => <Hover key={doc.key} as="button" onClick={() => pickAndSave('application/pdf,image/*', (f) => { svc.setDocFile(d.id, doc.key, f.id, f.name); toast(`${doc.name} uploaded — ${f.name}`, 'success'); onClose(); }, (m) => toast(m, 'error'))} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 13 }} hover={{ background: T.hover }}><Icon name="upload" size={15} style={{ color: T.muted }} />{doc.name}<span style={{ marginLeft: 'auto', fontSize: 11, color: T.faint }}>{doc.fileName || DOC_STATUS_META[doc.status].label}</span></Hover>)}
      </div>
    </Modal>;
  }
  if (k === 'application' || k === 'offer') {
    const isOffer = k === 'offer';
    return <Modal title={isOffer ? 'Send offer package' : 'Send application'} subtitle={`To ${d.name}`} width={460} onClose={onClose} footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { isOffer ? svc.sendOffer(d.id) : svc.sendApplication(d.id); toast(isOffer ? 'Offer package sent' : 'Application sent', 'success'); onClose(); if (isOffer) go('docusign'); }} style={primaryBtn} hover={{ background: '#0066D6' }}>{isOffer ? 'Send package' : 'Send'}</Hover></>}>
      <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>{isOffer ? `Sends the onboarding DocuSign package (Offer Letter, Driver Agreement, W-9, Drug Test Consent) to ${d.email}.` : `Emails a driver application link to ${d.email}. Status updates as they complete it.`}</div>
    </Modal>;
  }
  if (k === 'addStep') { let name = ''; return <Modal title="Add hiring step" subtitle={modal.group} width={420} onClose={onClose} footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { if (!name.trim()) { toast('Name the step', 'error'); return; } svc.addStep(d.id, modal.group, name); toast('Step added', 'success'); onClose(); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Add</Hover></>}><Field label="Step name"><Input onChange={(e: any) => { name = e.target.value; }} placeholder="e.g. Road Test" /></Field></Modal>; }
  if (k === 'addDoc') { let name = ''; return <Modal title="Add document requirement" width={420} onClose={onClose} footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { if (!name.trim()) { toast('Name the document', 'error'); return; } svc.addDocument(d.id, name, 'missing'); toast('Requirement added', 'success'); onClose(); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Add</Hover></>}><Field label="Document name"><Input onChange={(e: any) => { name = e.target.value; }} placeholder="e.g. TWIC Card" /></Field></Modal>; }
  if (k === 'editDriver') {
    const [v, setV] = React.useState({ phone: d.phone, email: d.email, cdlClass: d.cdlClass, position: d.position, risk: d.risk });
    return <Modal title="Edit driver" width={480} onClose={onClose} footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { svc.update(d.id, v); svc.runAIReview(d.id); toast('Driver updated', 'success'); onClose(); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Save</Hover></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Phone"><Input value={v.phone} onChange={(e: any) => setV({ ...v, phone: e.target.value })} /></Field>
        <Field label="Email"><Input value={v.email} onChange={(e: any) => setV({ ...v, email: e.target.value })} /></Field>
        <Field label="CDL class"><Select value={v.cdlClass} onChange={(x: string) => setV({ ...v, cdlClass: x })} options={['A', 'B', 'C']} /></Field>
        <Field label="Risk"><Select value={v.risk} onChange={(x: string) => setV({ ...v, risk: x })} options={['Low', 'Medium', 'High']} /></Field>
        <Field label="Position"><Select value={v.position} onChange={(x: string) => setV({ ...v, position: x })} options={['Company Driver', 'Owner Operator']} /></Field>
      </div>
    </Modal>;
  }
  if (k === 'carrierTruck') {
    const [carrier, setCarrier] = React.useState(d.carrier);
    return <Modal title="Carrier & truck" subtitle="Changing the carrier updates the available truck list" width={460} onClose={onClose} footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { if (carrier !== d.carrier) { svc.changeCarrier(d.id, carrier); svc.runAIReview(d.id); } toast('Saved', 'success'); onClose(); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Save</Hover></>}>
      <Field label="Hiring carrier"><Select value={carrier} onChange={setCarrier} options={svc.carriers().map((c: any) => ({ value: c.name, label: c.name }))} /></Field>
      <div style={{ fontSize: 12, color: T.faint }}>Available trucks for {carrier}: {svc.trucksForCarrier(carrier).filter((t: any) => t.status === 'Available').length}. Assign one from the carrier panel after saving.</div>
    </Modal>;
  }
  return null;
}
