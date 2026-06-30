import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon, useToasts, ToastHost } from '../tasks/lib';
import { Card, Modal, Field, Input, Select, Textarea, primaryBtn, ghostBtn, Toggle, EmptyState } from '../esign/ui';
import { useHire, svc, carrierAISummary, fmtAgo, fmtDate } from './store';

const BG = '#F5F6F8';
const COVERAGE_TYPES = ['Auto Liability', 'Cargo Insurance', 'General Liability', 'Occupational Accident', 'Physical Damage', 'Trailer Interchange', 'Workers Compensation', 'Certificate of Insurance'];

export default function CarrierFolders({ go }: { go?: (p: string) => void }) {
  const store = useHire();
  const { toasts, toast } = useToasts();
  const [sel, setSel] = React.useState<string | null>(null);
  const [modal, setModal] = React.useState<any>(null);
  const [q, setQ] = React.useState('');
  void go;

  const carriers = store.carriers.filter((c: any) => !q || `${c.name} ${c.dot} ${c.mc}`.toLowerCase().includes(q.toLowerCase()));
  const carrier = sel ? svc.carrier(sel) : null;

  return <div style={{ height: '100%', overflowY: 'auto', background: BG }}>
    <ToastHost toasts={toasts} />
    {!carrier ? <div style={{ maxWidth: 1100, margin: '0 auto', padding: '26px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Carrier Folders</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13.5, color: T.muted }}>Carrier records, submitted forms, insurance, and hiring policy. Anna uses these to judge driver fit.</p>
        </div>
        <Hover as="button" onClick={() => setModal({ kind: 'newCarrier' })} style={primaryBtn} hover={{ background: '#0066D6' }}><Icon name="plus" size={16} />New carrier folder</Hover>
      </div>
      <div style={{ position: 'relative', marginBottom: 16, maxWidth: 360 }}>
        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.faint }}><Icon name="search" size={16} /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search carriers…" style={{ width: '100%', boxSizing: 'border-box', height: 38, borderRadius: 10, border: `1px solid ${T.border}`, padding: '0 12px 0 34px', fontSize: 13.5, outline: 'none' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {carriers.map((c: any) => { const ai = carrierAISummary(c); return <Card key={c.id} onClick={() => setSel(c.id)} style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ width: 44, height: 44, flex: 'none', borderRadius: 11, background: 'rgba(0,122,255,0.1)', color: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="building" size={21} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
              <div style={{ fontSize: 12, color: T.faint }}>DOT {c.dot || '—'} · {c.mc || '—'}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: c.status === 'active' ? '#248A3D' : '#A05A00', background: c.status === 'active' ? 'rgba(52,199,89,0.12)' : 'rgba(255,159,10,0.14)', borderRadius: 999, padding: '2px 9px', textTransform: 'capitalize' }}>{c.status}</span>
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 14, fontSize: 12, color: T.muted }}>
            <Stat icon="fileText" v={`${c.forms.length} forms`} /><Stat icon="shield" v={`${c.insurance.filter((i: any) => i.active).length} insured`} />
          </div>
          {ai.flags.length > 0 && <div style={{ marginTop: 10, fontSize: 11.5, color: '#A05A00', display: 'flex', gap: 6, alignItems: 'flex-start' }}><Icon name="alert" size={13} style={{ flex: 'none', marginTop: 1 }} />{ai.flags[0]}</div>}
        </Card>; })}
      </div>
    </div>
    : <CarrierDetail carrier={carrier} onBack={() => setSel(null)} toast={toast} setModal={setModal} />}

    {modal && <CarrierModals modal={modal} carrier={carrier} onClose={() => setModal(null)} toast={toast} onCreated={(id: string) => setSel(id)} />}
  </div>;
}

function Stat({ icon, v }: any) { return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name={icon} size={13} style={{ color: '#C7C7CC' }} />{v}</span>; }

function CarrierDetail({ carrier: c, onBack, toast, setModal }: any) {
  const ai = carrierAISummary(c);
  const trucks = svc.trucksForCarrier(c.name);
  return <div style={{ maxWidth: 1000, margin: '0 auto', padding: '22px 28px 48px' }}>
    <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: T.muted, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 14 }}><Icon name="chevronLeft" size={15} />Carrier Folders</button>
    {/* header */}
    <Card style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <span style={{ width: 52, height: 52, flex: 'none', borderRadius: 13, background: 'rgba(0,122,255,0.1)', color: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="building" size={26} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{c.name}</h1>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: c.status === 'active' ? '#248A3D' : '#A05A00', background: c.status === 'active' ? 'rgba(52,199,89,0.12)' : 'rgba(255,159,10,0.14)', borderRadius: 999, padding: '2px 9px', textTransform: 'capitalize' }}>{c.status}</span>
            <button onClick={() => setModal({ kind: 'editCarrier' })} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="pencil" size={13} /></button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 8, fontSize: 12.5, color: T.muted }}>
            <Stat icon="sign" v={`DOT ${c.dot || '—'}`} /><Stat icon="tag" v={c.mc || '—'} /><Stat icon="user" v={c.contact || '—'} /><Stat icon="mail" v={c.email || '—'} /><Stat icon="phone" v={c.phone || '—'} /><Stat icon="mapPin" v={c.address || '—'} />
          </div>
        </div>
      </div>
    </Card>

    {/* Anna summary */}
    <Card style={{ padding: 16, marginBottom: 16, borderColor: 'rgba(0,122,255,0.18)', background: 'linear-gradient(180deg,#F7FAFF,#FFFFFF)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}><Icon name="sparkles" size={14} style={{ color: '#007AFF' }} /><span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#007AFF' }}>Anna summary</span></div>
      <div style={{ fontSize: 13, color: T.text, lineHeight: 1.55 }}>{ai.text}</div>
      {ai.flags.map((f: string, i: number) => <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12.5, color: '#A05A00', marginTop: 6 }}><Icon name="alert" size={13} style={{ flex: 'none', marginTop: 1 }} />{f}</div>)}
    </Card>

    {/* Insurance */}
    <Section title="Insurance" icon="shield" action={<Hover as="button" onClick={() => setModal({ kind: 'insurance' })} style={{ ...ghostBtn, height: 32, padding: '0 12px', fontSize: 12.5 }} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="plus" size={14} />Add requirement</Hover>}>
      {c.insurance.length === 0 ? <EmptyState icon="shield" title="No insurance on file" body="Add coverage requirements and policy details." />
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 10 }}>
          {c.insurance.map((i: any) => { const expired = i.expiration && +new Date(i.expiration) < Date.now(); return <div key={i.id} style={{ border: `1px solid ${expired ? 'rgba(255,59,48,0.3)' : T.border}`, borderRadius: 12, padding: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 650, flex: 1 }}>{i.coverageType}</span>
              <Toggle on={i.active} onChange={(v: boolean) => { svc.updateInsurance(c.id, i.id, { active: v }); }} />
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>Coverage {i.amount} · {i.provider || '—'}</div>
            <div style={{ fontSize: 11.5, color: T.faint, marginTop: 2 }}>Policy {i.policyNumber || '—'}</div>
            <div style={{ fontSize: 11.5, color: expired ? '#C62820' : T.faint, marginTop: 2 }}>{i.effective ? `${fmtDate(i.effective)} – ` : ''}{i.expiration ? fmtDate(i.expiration) : 'no expiry'}{expired ? ' · EXPIRED' : ''}</div>
            {i.additionalInsured && <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10.5, fontWeight: 600, color: '#0066CC', background: 'rgba(0,122,255,0.1)', borderRadius: 999, padding: '2px 8px' }}>Additional insured</span>}
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <SmallBtn icon="upload" label="Policy PDF" onClick={() => toast('Policy PDF uploaded (simulated)', 'success')} />
              <SmallBtn icon="pencil" label="Edit" onClick={() => setModal({ kind: 'insurance', ins: i })} />
              <button onClick={() => { svc.removeInsurance(c.id, i.id); toast('Removed', 'info'); }} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', color: '#C62820', cursor: 'pointer' }}><Icon name="trash" size={13} /></button>
            </div>
          </div>; })}
        </div>}
    </Section>

    {/* Hiring policy / eligibility rules */}
    <Section title="Hiring policy & driver eligibility rules" icon="gauge">
      <Card style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[['maxMovingViolations', 'Max moving violations'], ['maxAccidents', 'Max accidents'], ['maxDUI', 'Max DUI'], ['minExperienceYears', 'Min experience (yrs)']].map(([k, label]) =>
            <Field key={k} label={label}><Input type="number" defaultValue={c.policy?.[k]} onBlur={(e: any) => { svc.updatePolicy(c.id, { [k]: +e.target.value }); toast('Policy updated', 'success'); }} /></Field>)}
        </div>
        <div style={{ fontSize: 11.5, color: T.faint }}>Anna applies these thresholds when scoring driver eligibility for {c.name}.</div>
      </Card>
    </Section>

    {/* Carrier forms */}
    <Section title="Carrier forms" icon="fileText" action={<Hover as="button" onClick={() => setModal({ kind: 'form' })} style={{ ...ghostBtn, height: 32, padding: '0 12px', fontSize: 12.5 }} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="plus" size={14} />Attach form</Hover>}>
      {c.forms.length === 0 ? <EmptyState icon="fileText" title="No forms submitted" body="When a carrier submits a form it attaches here automatically." />
        : <Card style={{ overflow: 'hidden' }}>{c.forms.map((f: any, i: number) => <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i ? `1px solid ${T.hair}` : 'none' }}>
          <span style={{ width: 32, height: 32, flex: 'none', borderRadius: 8, background: 'rgba(52,199,89,0.12)', color: '#248A3D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="fileText" size={15} /></span>
          <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{f.name}</div><div style={{ fontSize: 11.5, color: T.faint }}>{f.type} · {f.submittedBy} · {fmtAgo(f.at)}</div></div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#248A3D', background: 'rgba(52,199,89,0.12)', borderRadius: 999, padding: '2px 9px' }}>Submitted</span>
          <SmallBtn icon="eye" label="View" onClick={() => toast('Opening form…', 'info')} />
          <button onClick={() => { svc.removeForm(c.id, f.id); toast('Removed', 'info'); }} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: '#C62820', cursor: 'pointer' }}><Icon name="trash" size={14} /></button>
        </div>)}</Card>}
    </Section>

    {/* Trucks / requirements */}
    <Section title="Truck requirements" icon="truck">
      {trucks.length === 0 ? <EmptyState icon="truck" title="No trucks" body="No equipment on file for this carrier." />
        : <Card style={{ overflow: 'hidden' }}>{trucks.map((t: any, i: number) => <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderTop: i ? `1px solid ${T.hair}` : 'none', fontSize: 13 }}>
          <Icon name="truck" size={16} style={{ color: T.faint }} />
          <div style={{ flex: 1 }}><span style={{ fontWeight: 600 }}>Unit {t.unit}</span><span style={{ color: T.faint, marginLeft: 8 }}>{t.requirements}</span></div>
          <span style={{ fontSize: 11.5, color: T.muted }}>{t.plate}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: t.status === 'Available' ? '#248A3D' : t.status === 'Assigned' ? '#0066CC' : '#A05A00', background: t.status === 'Available' ? 'rgba(52,199,89,0.12)' : t.status === 'Assigned' ? 'rgba(0,122,255,0.12)' : 'rgba(255,159,10,0.14)', borderRadius: 999, padding: '2px 9px' }}>{t.status}</span>
        </div>)}</Card>}
    </Section>

    {/* Notes */}
    <Section title="Notes" icon="message">
      <Card style={{ padding: 14 }}><Textarea rows={3} defaultValue={c.notes} placeholder="Internal notes about this carrier…" onBlur={(e: any) => { svc.updateCarrier(c.id, { notes: e.target.value }); }} /></Card>
    </Section>

    {/* Activity */}
    <Section title="Activity history" icon="list">
      <Card style={{ padding: 16 }}>{(c.activities || []).length === 0 ? <div style={{ fontSize: 12.5, color: T.faint }}>No activity yet.</div> : c.activities.map((a: any, i: number) => <div key={a.id} style={{ display: 'flex', gap: 11, padding: '9px 0', borderTop: i ? `1px solid ${T.hair}` : 'none' }}>
        <span style={{ width: 24, height: 24, flex: 'none', borderRadius: 999, background: '#F2F2F7', color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="circle" size={11} /></span>
        <div style={{ flex: 1 }}><div style={{ fontSize: 12.5 }}>{a.title}</div>{a.detail && <div style={{ fontSize: 11.5, color: T.muted }}>{a.detail}</div>}<div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>{a.user} · {fmtAgo(a.at)}</div></div>
      </div>)}</Card>
    </Section>
  </div>;
}

function Section({ title, icon, action, children }: any) {
  return <div style={{ marginBottom: 18 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <Icon name={icon} size={15} style={{ color: T.muted }} /><span style={{ fontSize: 14, fontWeight: 650 }}>{title}</span>
      <span style={{ flex: 1 }} />{action}
    </div>
    {children}
  </div>;
}
function SmallBtn({ icon, label, onClick }: any) { return <Hover as="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: T.text }} hover={{ background: T.hover }}><Icon name={icon} size={13} />{label}</Hover>; }

function CarrierModals({ modal, carrier, onClose, toast, onCreated }: any) {
  const k = modal.kind;
  if (k === 'newCarrier') {
    const [v, setV] = React.useState({ name: '', dot: '', mc: '', contact: '', email: '', phone: '', address: '', status: 'pending' });
    const set = (key: string, val: any) => setV((s) => ({ ...s, [key]: val }));
    return <Modal title="New carrier folder" width={520} onClose={onClose} footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { if (!v.name.trim()) { toast('Name the carrier', 'error'); return; } const c = svc.addCarrier(v); toast('Carrier folder created', 'success'); onClose(); onCreated(c.id); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Create folder</Hover></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Carrier name"><Input value={v.name} onChange={(e: any) => set('name', e.target.value)} /></Field>
        <Field label="Status"><Select value={v.status} onChange={(x: string) => set('status', x)} options={['active', 'pending', 'inactive']} /></Field>
        <Field label="DOT number"><Input value={v.dot} onChange={(e: any) => set('dot', e.target.value)} /></Field>
        <Field label="MC number"><Input value={v.mc} onChange={(e: any) => set('mc', e.target.value)} /></Field>
        <Field label="Contact person"><Input value={v.contact} onChange={(e: any) => set('contact', e.target.value)} /></Field>
        <Field label="Contact email"><Input value={v.email} onChange={(e: any) => set('email', e.target.value)} /></Field>
        <Field label="Phone"><Input value={v.phone} onChange={(e: any) => set('phone', e.target.value)} /></Field>
        <Field label="Address"><Input value={v.address} onChange={(e: any) => set('address', e.target.value)} /></Field>
      </div>
    </Modal>;
  }
  if (k === 'editCarrier') {
    const [v, setV] = React.useState({ contact: carrier.contact, email: carrier.email, phone: carrier.phone, address: carrier.address, status: carrier.status, dot: carrier.dot, mc: carrier.mc });
    const set = (key: string, val: any) => setV((s) => ({ ...s, [key]: val }));
    return <Modal title="Edit carrier" width={520} onClose={onClose} footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { svc.updateCarrier(carrier.id, v); svc.logCarrier(carrier.id, 'carrier', 'Carrier details updated'); toast('Saved', 'success'); onClose(); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Save</Hover></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="DOT"><Input value={v.dot} onChange={(e: any) => set('dot', e.target.value)} /></Field>
        <Field label="MC"><Input value={v.mc} onChange={(e: any) => set('mc', e.target.value)} /></Field>
        <Field label="Status"><Select value={v.status} onChange={(x: string) => set('status', x)} options={['active', 'pending', 'inactive']} /></Field>
        <Field label="Contact"><Input value={v.contact} onChange={(e: any) => set('contact', e.target.value)} /></Field>
        <Field label="Email"><Input value={v.email} onChange={(e: any) => set('email', e.target.value)} /></Field>
        <Field label="Phone"><Input value={v.phone} onChange={(e: any) => set('phone', e.target.value)} /></Field>
        <Field label="Address"><Input value={v.address} onChange={(e: any) => set('address', e.target.value)} /></Field>
      </div>
    </Modal>;
  }
  if (k === 'insurance') {
    const ins = modal.ins;
    const [v, setV] = React.useState(ins || { coverageType: COVERAGE_TYPES[0], amount: '', provider: '', policyNumber: '', effective: '', expiration: '', additionalInsured: false, notes: '' });
    const set = (key: string, val: any) => setV((s: any) => ({ ...s, [key]: val }));
    return <Modal title={ins ? 'Edit insurance' : 'Add insurance requirement'} width={520} onClose={onClose} footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { if (ins) { svc.updateInsurance(carrier.id, ins.id, v); } else { svc.addInsurance(carrier.id, v); } toast('Saved', 'success'); onClose(); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Save</Hover></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Coverage type"><Select value={v.coverageType} onChange={(x: string) => set('coverageType', x)} options={COVERAGE_TYPES} /></Field>
        <Field label="Coverage amount"><Input value={v.amount} onChange={(e: any) => set('amount', e.target.value)} placeholder="$1,000,000" /></Field>
        <Field label="Provider"><Input value={v.provider} onChange={(e: any) => set('provider', e.target.value)} /></Field>
        <Field label="Policy number"><Input value={v.policyNumber} onChange={(e: any) => set('policyNumber', e.target.value)} /></Field>
        <Field label="Effective date"><Input type="date" value={(v.effective || '').slice(0, 10)} onChange={(e: any) => set('effective', e.target.value)} /></Field>
        <Field label="Expiration date"><Input type="date" value={(v.expiration || '').slice(0, 10)} onChange={(e: any) => set('expiration', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}><span style={{ fontSize: 13, color: T.muted }}>Additional insured required</span><Toggle on={v.additionalInsured} onChange={(x: boolean) => set('additionalInsured', x)} /></div>
      <Field label="Notes / special conditions"><Textarea rows={2} value={v.notes} onChange={(e: any) => set('notes', e.target.value)} /></Field>
    </Modal>;
  }
  if (k === 'form') {
    const [v, setV] = React.useState({ name: '', type: 'Carrier Setup Packet', submittedBy: carrier?.contact || '' });
    return <Modal title="Attach carrier form" subtitle="Simulates a carrier submitting a completed form to this folder." width={460} onClose={onClose} footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { if (!v.name.trim()) { toast('Name the form', 'error'); return; } svc.addForm(carrier.id, v); toast('Form attached to folder', 'success'); onClose(); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Attach</Hover></>}>
      <Field label="Form name"><Input value={v.name} onChange={(e: any) => setV({ ...v, name: e.target.value })} placeholder="e.g. Certificate of Insurance" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Form type"><Select value={v.type} onChange={(x: string) => setV({ ...v, type: x })} options={['Carrier Setup Packet', 'Certificate of Insurance', 'W-9', 'Authority Letter', 'Insurance Form', 'Other']} /></Field>
        <Field label="Submitted by"><Input value={v.submittedBy} onChange={(e: any) => setV({ ...v, submittedBy: e.target.value })} /></Field>
      </div>
    </Modal>;
  }
  return null;
}
