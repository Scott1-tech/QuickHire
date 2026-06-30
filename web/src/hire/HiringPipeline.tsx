import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon, useToasts, ToastHost } from '../tasks/lib';
import { Modal, Field, Input, Select, primaryBtn, ghostBtn } from '../esign/ui';
import { useHire, svc, STAGES, STAGE_DOT } from './store';

const BG = '#F5F6F8';
const OWNER_COLOR: Record<string, string> = { NP: '#007AFF', DR: '#34C759', SP: '#FF9500' };

function daysInStage(d: any) { return Math.max(0, Math.floor((Date.now() - +new Date(d.stageSince || Date.now())) / 864e5)); }
function ownerInits(name: string) { return (name || 'NP').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase(); }
function riskColor(r: string) { return r === 'High' ? '#FF3B30' : r === 'Medium' ? '#FF9F0A' : '#34C759'; }
function scoreColor(s: number) { return s >= 85 ? '#248A3D' : s >= 70 ? '#A05A00' : '#C62820'; }
function firstMissing(d: any) { const m = (d.documents || []).find((x: any) => x.required && x.status === 'missing'); return m?.name || ''; }
function nextAction(d: any) {
  const fm = firstMissing(d);
  if (fm) return `Request ${fm}`;
  const map: Record<string, string> = { Lead: 'Send application', Screening: 'Run MVR', 'Background Check': 'Review PSP', Offer: 'Send offer package', Onboarding: 'Assign truck', Hired: 'Complete file' };
  return map[d.stage] || 'Review';
}

export default function HiringPipeline({ openDriver }: { openDriver: (id: string) => void }) {
  const store = useHire();
  const { toasts, toast } = useToasts();
  const [filter, setFilter] = React.useState('all');
  const [modal, setModal] = React.useState<any>(null);
  const drag = React.useRef<string | null>(null);

  const active = store.drivers.filter((d: any) => !d.archived);
  const matches = (d: any) => {
    if (filter === 'mine') return ownerInits(d.ownerName) === 'NP';
    if (filter === 'review') return !!firstMissing(d) || d.risk === 'High';
    if (filter === 'missing') return !!firstMissing(d);
    if (filter === 'stale') return daysInStage(d) >= 6;
    if (filter === 'ready') return d.stage === 'Onboarding' || d.stage === 'Hired';
    return true;
  };
  const need = active.filter((d: any) => firstMissing(d) || d.risk === 'High').length;
  const ready = active.filter((d: any) => d.stage === 'Onboarding' || d.stage === 'Hired').length;

  const FILTERS = [['all', 'All', active.length], ['mine', 'Assigned to Me', active.filter((d: any) => ownerInits(d.ownerName) === 'NP').length], ['review', 'Needs Review', need], ['missing', 'Missing Docs', active.filter((d: any) => firstMissing(d)).length], ['stale', 'Stale', active.filter((d: any) => daysInStage(d) >= 6).length], ['ready', 'Ready for Onboarding', ready]];

  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: BG, padding: '24px 24px 0' }}>
    <ToastHost toasts={toasts} />
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flex: 'none' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>Hiring Pipeline</h1>
        <p style={{ margin: '5px 0 0', fontSize: 13.5, color: T.muted }}>{active.length} candidates · <span style={{ color: '#A05A00', fontWeight: 600 }}>{need} need action</span> · <span style={{ color: '#248A3D', fontWeight: 600 }}>{ready} ready for onboarding</span></p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Hover as="button" onClick={() => setModal({ kind: 'add', stage: 'Lead' })} style={primaryBtn} hover={{ background: '#0066D6' }}><Icon name="plus" size={16} />Invite Driver</Hover>
        <Hover as="button" onClick={() => toast('Import: upload a CSV or connect Tenstreet', 'info')} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Import</Hover>
        <Hover as="button" onClick={() => toast('Pipeline CSV exported', 'success')} style={{ ...ghostBtn, border: 'none' }} hover={{ background: 'rgba(0,0,0,0.05)' }}>Export</Hover>
      </div>
    </div>

    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 16px', flex: 'none', flexWrap: 'wrap' }}>
      {FILTERS.map(([k, label, count]: any) => <button key={k} onClick={() => setFilter(k)} style={{ height: 32, padding: '0 13px', fontSize: 12.5, fontWeight: 600, borderRadius: 999, cursor: 'pointer', border: `1px solid ${filter === k ? '#007AFF' : 'rgba(0,0,0,0.1)'}`, background: filter === k ? 'rgba(0,122,255,0.08)' : '#fff', color: filter === k ? '#007AFF' : '#3a3a3c', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{label}<span style={{ opacity: 0.7 }}>{count}</span></button>)}
    </div>

    <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 24 }}>
      <div style={{ display: 'flex', gap: 14, height: '100%', minWidth: 'max-content' }}>
        {STAGES.map((stage) => {
          const cards = active.filter((d: any) => d.stage === stage && matches(d));
          return <div key={stage} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (drag.current) { svc.moveStage(drag.current, stage); toast(`Moved to ${stage}`, 'success'); drag.current = null; } }} style={{ width: 290, flex: 'none', background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, display: 'flex', flexDirection: 'column', maxHeight: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 14px 10px', flex: 'none' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: STAGE_DOT[stage] }} />
              <span style={{ fontSize: 13, fontWeight: 650 }}>{stage}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: T.muted, background: '#F2F2F7', borderRadius: 999, padding: '1px 8px' }}>{cards.length}</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 10px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {cards.map((d: any) => { const fm = firstMissing(d); return <Hover key={d.id} draggable onDragStart={() => { drag.current = d.id; }} onClick={() => openDriver(d.id)} style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, cursor: 'pointer' }} hover={{ boxShadow: '0 6px 18px rgba(0,0,0,0.08)', transform: 'translateY(-1px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 650 }}>{d.name}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: riskColor(d.risk) + '22', color: riskColor(d.risk) === '#34C759' ? '#248A3D' : riskColor(d.risk) === '#FF9F0A' ? '#A05A00' : '#C62820' }}>{d.risk}</span>
                </div>
                <div style={{ fontSize: 11.5, color: T.faint, marginTop: 3 }}>{daysInStage(d)}d in stage</div>
                {fm && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 9, fontSize: 11.5, fontWeight: 600, color: '#C62820', background: 'rgba(255,59,48,0.1)', borderRadius: 7, padding: '3px 8px' }}><Icon name="alert" size={12} />Missing: {fm}</div>}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 11, paddingTop: 10, borderTop: `1px solid ${T.hair}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span style={{ width: 22, height: 22, flex: 'none', borderRadius: 999, background: OWNER_COLOR[ownerInits(d.ownerName)] || '#8E8E93', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 650 }}>{ownerInits(d.ownerName)}</span>
                    <span style={{ fontSize: 11.5, color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Next: {nextAction(d)}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(d.score) }}>{d.score}</span>
                </div>
              </Hover>; })}
              <Hover as="button" onClick={() => setModal({ kind: 'add', stage })} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 9, fontSize: 12.5, fontWeight: 600, color: T.muted, background: 'transparent', border: '1px dashed rgba(0,0,0,0.14)', borderRadius: 10, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.03)', color: T.text }}><Icon name="plus" size={14} />Add candidate</Hover>
            </div>
          </div>;
        })}
      </div>
    </div>

    {modal?.kind === 'add' && <AddCandidate stage={modal.stage} onClose={() => setModal(null)} onAdd={(id: string) => { setModal(null); openDriver(id); }} toast={toast} />}
  </div>;
}

function AddCandidate({ stage, onClose, onAdd, toast }: any) {
  const [v, setV] = React.useState({ name: '', phone: '', email: '', carrier: svc.carriers()[0]?.name || '', position: 'Company Driver', cdlClass: 'A' });
  const set = (k: string, val: any) => setV((s) => ({ ...s, [k]: val }));
  return <Modal title="Add candidate" subtitle={`New candidate in ${stage}`} width={500} onClose={onClose}
    footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={() => { if (!v.name.trim()) { toast('Add a name', 'error'); return; } const d = svc.addDriver({ ...v, email: v.email || v.name.toLowerCase().replace(/[^a-z]/g, '.') + '@example.com' }, stage); toast('Candidate added', 'success'); onAdd(d.id); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Add candidate</Hover></>}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Field label="Full name"><Input value={v.name} onChange={(e: any) => set('name', e.target.value)} /></Field>
      <Field label="Phone"><Input value={v.phone} onChange={(e: any) => set('phone', e.target.value)} /></Field>
      <Field label="Email"><Input value={v.email} onChange={(e: any) => set('email', e.target.value)} placeholder="auto from name" /></Field>
      <Field label="Hiring carrier"><Select value={v.carrier} onChange={(x: string) => set('carrier', x)} options={svc.carriers().map((c: any) => ({ value: c.name, label: c.name }))} /></Field>
      <Field label="Position"><Select value={v.position} onChange={(x: string) => set('position', x)} options={['Company Driver', 'Owner Operator']} /></Field>
      <Field label="CDL class"><Select value={v.cdlClass} onChange={(x: string) => set('cdlClass', x)} options={['A', 'B', 'C']} /></Field>
    </div>
  </Modal>;
}
