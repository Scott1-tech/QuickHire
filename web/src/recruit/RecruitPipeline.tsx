import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon, useToasts, ToastHost, SegTabs } from '../tasks/lib';
import { Card, Modal, Field, Input, Select, Textarea, primaryBtn, ghostBtn, Toggle, EmptyState } from '../esign/ui';
import { RecruitDashboard, RecruitReports, RecruitArchive, RecruitAutomations } from './views';
import { LeadProfile } from './LeadProfile';
import {
  useRecruit, svc, USERS, SOURCES, SCORE_META, INTEREST, CLOSE_REASONS, DECISIONS,
  daysInStage, agingLevel, isOverdue, fmtAgo, fmtDate, dueLabel, findDuplicate, stageByName,
} from './store';
import { svc as hireSvc } from '../hire/store';

const BG = '#F5F5F7';
const owner = (id: string) => USERS.find((u) => u.id === id);
const sourceMeta = (k: string) => SOURCES.find((s) => s.key === k) || SOURCES[1];

export default function RecruitPipeline({ go }: { go?: (p: string) => void }) {
  const store = useRecruit();
  const { toasts, toast } = useToasts();
  const [q, setQ] = React.useState('');
  const [fSource, setFSource] = React.useState('all');
  const [fOwner, setFOwner] = React.useState('all');
  const [fScore, setFScore] = React.useState('all');
  const [fOverdue, setFOverdue] = React.useState(false);
  const [sort, setSort] = React.useState('score');
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [modal, setModal] = React.useState<any>(null);
  const [tab, setTab] = React.useState('board');
  const drag = React.useRef<string | null>(null);
  void store;

  // Full-page lead profile (replaces the board while a lead is open).
  if (openId && svc.lead(openId)) {
    return <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ToastHost toasts={toasts} />
      <LeadProfile id={openId} go={go} onClose={() => setOpenId(null)} toast={toast} setModal={setModal} />
      {modal && <RecruitModals modal={modal} onClose={() => setModal(null)} toast={toast} onOpen={(x: string) => setOpenId(x)} />}
    </div>;
  }

  const stages = svc.stages();
  const all = svc.visibleLeads('NP');
  const filtered = all.filter((l: any) => {
    if (l.archived) return false;
    if (q) { const h = `${l.name} ${l.phone} ${l.location} ${l.email}`.toLowerCase(); if (!h.includes(q.toLowerCase())) return false; }
    if (fSource !== 'all' && l.source !== fSource) return false;
    if (fOwner !== 'all' && l.ownerId !== fOwner) return false;
    if (fScore !== 'all' && l.scoreLabel !== fScore) return false;
    if (fOverdue && !isOverdue(l)) return false;
    return true;
  });
  const sortFn = (a: any, b: any) => {
    if (sort === 'score') return b.score - a.score;
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'overdue') return (isOverdue(b) ? 1 : 0) - (isOverdue(a) ? 1 : 0) || daysInStage(b) - daysInStage(a);
    if (sort === 'location') return a.location.localeCompare(b.location);
    return +new Date(b.createdAt) - +new Date(a.createdAt);
  };
  const activeCount = all.filter((l: any) => !l.archived).length;
  const overdue = all.filter((l: any) => !l.archived && isOverdue(l)).length;
  const hot = all.filter((l: any) => !l.archived && l.scoreLabel === 'Hot Lead').length;

  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: BG, padding: '22px 22px 0' }}>
    <ToastHost toasts={toasts} />
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flex: 'none' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>Hiring Pipeline</h1>
        <p style={{ margin: '5px 0 0', fontSize: 13.5, color: T.muted }}>{activeCount} active leads · <span style={{ color: '#FF375F', fontWeight: 600 }}>{hot} hot</span> · <span style={{ color: '#C62820', fontWeight: 600 }}>{overdue} overdue follow-up</span></p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Hover as="button" onClick={() => setModal({ kind: 'anna' })} style={{ ...ghostBtn, gap: 6 }} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="sparkles" size={15} style={{ color: '#007AFF' }} />Anna intake</Hover>
        {tab === 'board' && <Hover as="button" onClick={() => setModal({ kind: 'settings' })} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="settings" size={15} />Stages</Hover>}
        <Hover as="button" onClick={() => setModal({ kind: 'new' })} style={primaryBtn} hover={{ background: '#0066D6' }}><Icon name="plus" size={16} />New Lead</Hover>
      </div>
    </div>

    <div style={{ marginTop: 14, flex: 'none' }}><SegTabs value={tab} onChange={setTab} tabs={[{ key: 'board', label: 'Board', icon: 'columns' }, { key: 'dashboard', label: 'Dashboard', icon: 'layout' }, { key: 'reports', label: 'Reports', icon: 'barChart' }, { key: 'archive', label: 'Archive', icon: 'ban' }, { key: 'automations', label: 'Automations', icon: 'zap' }]} /></div>

    {tab !== 'board' && <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 2px 24px' }}>
      {tab === 'dashboard' && <RecruitDashboard onOpen={setOpenId} />}
      {tab === 'reports' && <RecruitReports />}
      {tab === 'archive' && <RecruitArchive onOpen={setOpenId} toast={toast} />}
      {tab === 'automations' && <RecruitAutomations toast={toast} />}
    </div>}

    {/* toolbar */}
    {tab === 'board' && <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0', flex: 'none', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: 260 }}>
        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.faint }}><Icon name="search" size={16} /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, location…" style={{ width: '100%', boxSizing: 'border-box', height: 36, borderRadius: 10, border: `1px solid ${T.border}`, padding: '0 12px 0 34px', fontSize: 13, outline: 'none' }} />
      </div>
      <Select value={fSource} onChange={setFSource} options={[{ value: 'all', label: 'All sources' }, ...SOURCES.map((s) => ({ value: s.key, label: s.label }))]} style={{ width: 150, height: 36 }} />
      <Select value={fOwner} onChange={setFOwner} options={[{ value: 'all', label: 'All owners' }, ...USERS.map((u) => ({ value: u.id, label: u.name }))]} style={{ width: 140, height: 36 }} />
      <Select value={fScore} onChange={setFScore} options={[{ value: 'all', label: 'All scores' }, ...Object.keys(SCORE_META).map((s) => ({ value: s, label: s }))]} style={{ width: 150, height: 36 }} />
      <Hover as="button" onClick={() => setFOverdue((v) => !v)} style={{ height: 36, padding: '0 12px', borderRadius: 10, border: `1px solid ${fOverdue ? '#FF453A' : T.border}`, background: fOverdue ? 'rgba(255,69,58,0.08)' : '#fff', color: fOverdue ? '#C62820' : T.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }} hover={{ background: fOverdue ? 'rgba(255,69,58,0.1)' : T.hover }}><Icon name="clock" size={14} />Overdue</Hover>
      <div style={{ flex: 1 }} />
      <Select value={sort} onChange={setSort} options={[{ value: 'score', label: 'Sort: Score' }, { value: 'date', label: 'Sort: Newest' }, { value: 'overdue', label: 'Sort: Overdue' }, { value: 'name', label: 'Sort: Name' }, { value: 'location', label: 'Sort: Location' }]} style={{ width: 160, height: 36 }} />
    </div>}

    {/* board */}
    {tab === 'board' && <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 22 }}>
      <div style={{ display: 'flex', gap: 12, height: '100%', minWidth: 'max-content' }}>
        {stages.map((st: any) => {
          const cards = filtered.filter((l: any) => l.stageName === st.name).sort(sortFn);
          return <div key={st.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (drag.current) { svc.moveStage(drag.current, st.name); toast(`Moved to ${st.name}`, 'success'); drag.current = null; } }} style={{ width: 280, flex: 'none', background: '#EDEDF0', borderRadius: 14, display: 'flex', flexDirection: 'column', maxHeight: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px 8px', flex: 'none', position: 'sticky', top: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 650 }}>{st.name}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: T.muted, background: '#fff', borderRadius: 999, padding: '1px 8px' }}>{cards.length}</span>
              <div style={{ flex: 1 }} />
              <ColumnMenu st={st} toast={toast} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '2px 8px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cards.map((l: any) => <LeadCard key={l.id} l={l} onOpen={() => setOpenId(l.id)} onDrag={() => { drag.current = l.id; }} />)}
              {cards.length === 0 && <div style={{ fontSize: 11.5, color: '#B0B0B5', textAlign: 'center', padding: '12px 0' }}>—</div>}
            </div>
          </div>;
        })}
      </div>
    </div>}

    {modal && <RecruitModals modal={modal} onClose={() => setModal(null)} toast={toast} onOpen={(id: string) => { setOpenId(id); }} />}
  </div>;
}

/* ── card ── */
function LeadCard({ l, onOpen, onDrag }: any) {
  const sm = SCORE_META[l.scoreLabel]; const aging = agingLevel(l); const src = sourceMeta(l.source);
  return <Hover draggable onDragStart={onDrag} onClick={onOpen} style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: 14, cursor: 'pointer' }} hover={{ boxShadow: '0 6px 18px rgba(0,0,0,0.12)', transform: 'translateY(-1px)' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-0.01em' }}>{l.name}</span>
      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: sm.bg, color: sm.color, whiteSpace: 'nowrap' }}>{l.scoreLabel}</span>
    </div>
    <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>{l.phone}</div>
    <div style={{ fontSize: 12.5, color: T.faint }}>{l.location}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
      {aging === 'over' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#C62820' }}><span style={{ width: 6, height: 6, borderRadius: 999, background: '#FF453A' }} />{daysInStage(l)}d in stage</span>}
      {aging === 'warn' && <span style={{ fontSize: 11, fontWeight: 600, color: '#A05A00' }}>{daysInStage(l)}d in stage</span>}
      {(l.flags || []).includes('escalated') && <span style={{ fontSize: 10.5, fontWeight: 600, color: '#C62820', background: 'rgba(255,69,58,0.1)', borderRadius: 999, padding: '2px 7px' }}>Needs attention</span>}
      {(l.flags || []).includes('possible_duplicate') && <span style={{ fontSize: 10.5, fontWeight: 600, color: '#A05A00', background: 'rgba(255,159,10,0.14)', borderRadius: 999, padding: '2px 7px' }}>Possible duplicate</span>}
      {l.consent?.doNotContact && <span style={{ fontSize: 10.5, fontWeight: 600, color: '#C62820', background: 'rgba(255,69,58,0.1)', borderRadius: 999, padding: '2px 7px' }}>Do-Not-Contact</span>}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 11, paddingTop: 10, borderTop: `1px solid ${T.hair}` }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: isOverdue(l) ? '#C62820' : T.muted, minWidth: 0 }}><Icon name={src.icon} size={13} style={{ color: T.faint, flex: 'none' }} /><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.nextAction?.status === 'done' ? 'No next action' : l.nextAction?.title}</span></span>
      <span title={owner(l.ownerId)?.name} style={{ width: 22, height: 22, flex: 'none', borderRadius: 999, background: '#007AFF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 650 }}>{l.ownerId}</span>
    </div>
  </Hover>;
}

/* ── column menu ── */
function ColumnMenu({ st, toast }: any) {
  const [open, setOpen] = React.useState(false);
  return <div style={{ position: 'relative' }}>
    <button onClick={() => setOpen((o) => !o)} style={{ width: 24, height: 24, borderRadius: 7, border: 'none', background: 'transparent', color: T.faint, cursor: 'pointer' }}><Icon name="more" size={16} /></button>
    {open && <><div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
      <div style={{ position: 'absolute', top: 28, right: 0, zIndex: 41, width: 190, background: '#fff', borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.16)', padding: 6 }}>
        <MRow icon="pencil" label="Rename" onClick={() => { const n = prompt('Rename stage', st.name); if (n) svc.renameStage(st.id, n); setOpen(false); }} />
        <MRow icon="chevronLeft" label="Move left" onClick={() => { svc.moveStageOrder(st.id, -1); setOpen(false); }} />
        <MRow icon="chevronRight" label="Move right" onClick={() => { svc.moveStageOrder(st.id, 1); setOpen(false); }} />
        <MRow icon="clock" label={`SLA: ${st.maxDays || 0}d`} onClick={() => { const n = prompt('Max days in this stage (SLA)', String(st.maxDays || 0)); if (n != null) svc.setStageMaxDays(st.id, +n); setOpen(false); }} />
        <MRow icon="ban" label={st.disabled ? 'Enable' : 'Disable'} onClick={() => { svc.disableStage(st.id); setOpen(false); }} />
        <MRow icon="trash" label="Delete" danger onClick={() => { const r = svc.removeStage(st.id); if ((r as any)?.hasLeads) toast('Move its leads first', 'error'); setOpen(false); }} />
      </div></>}
  </div>;
}
function MRow({ icon, label, onClick, danger }: any) { return <Hover as="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', background: 'transparent', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: danger ? '#C62820' : T.text }} hover={{ background: danger ? 'rgba(255,59,48,0.08)' : 'rgba(0,0,0,0.05)' }}><Icon name={icon} size={15} style={{ color: danger ? '#C62820' : T.muted }} />{label}</Hover>; }

/* ── slide-out lead profile ── */
function Section({ title, children, defaultOpen = true, right }: any) {
  const [open, setOpen] = React.useState<boolean>(defaultOpen);
  return <div style={{ borderBottom: `1px solid ${T.hair}` }}>
    <button onClick={() => setOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '13px 0', border: 'none', background: 'transparent', cursor: 'pointer' }}>
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase', color: T.faint, flex: 1 }}>{title}</span>
      {right}<Icon name="chevronDown" size={15} style={{ color: T.faint, transform: open ? 'rotate(180deg)' : 'none' }} />
    </button>
    {open && <div style={{ paddingBottom: 16 }}>{children}</div>}
  </div>;
}
function KV({ k, v }: any) { return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0', fontSize: 13 }}><span style={{ color: T.faint }}>{k}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span></div>; }

function LeadPanel({ id, onClose, toast, setModal, go }: any) {
  const store = useRecruit(); void store;
  const l = svc.lead(id); if (!l) return null;
  const [note, setNote] = React.useState('');
  const sm = SCORE_META[l.scoreLabel]; const st = stageByName(l.stageName);

  const comm = (channel: string, direction: string, outcome?: string) => { const r = svc.logComm(id, { channel, direction, outcome }); if ((r as any)?.blocked) toast('Blocked — driver is Do-Not-Contact', 'error'); else toast('Logged', 'success'); };

  return <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', justifyContent: 'flex-end' }}>
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(3px)' }} />
    <div style={{ position: 'relative', width: 440, maxWidth: '96vw', height: '100%', background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
      {/* sticky header */}
      <div style={{ flex: 'none', padding: '16px 20px', borderBottom: `1px solid ${T.hair}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{l.name}</h2>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: sm.bg, color: sm.color }}>{l.scoreLabel} · {l.score}</span>
            </div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>{l.phone} · {l.location}</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#F2F2F7', cursor: 'pointer', color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={16} /></button>
        </div>
        {l.previousApplication && <div style={{ marginTop: 10, padding: '8px 11px', borderRadius: 10, background: 'rgba(255,159,10,0.12)', fontSize: 12, color: '#A05A00' }}><Icon name="refresh" size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Previous application — closed “{l.previousApplication.closeReason || '—'}” ({fmtDate(l.previousApplication.archivedAt)})</div>}
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <QA icon="phone" label="Call" onClick={() => comm('call', 'outbound', 'connected')} />
          <QA icon="message" label="SMS" onClick={() => comm('sms', 'outbound')} />
          <QA icon="mail" label="Email" onClick={() => comm('email', 'outbound')} />
          <QA icon="arrowRight" label="Stage" onClick={() => setModal({ kind: 'moveStage', id })} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
        <Section title="Next action">
          {l.nextAction && l.nextAction.status !== 'done' ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: isOverdue(l) ? 'rgba(255,69,58,0.07)' : '#F2F2F7' }}>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{l.nextAction.title}</div><div style={{ fontSize: 11.5, color: isOverdue(l) ? '#C62820' : T.faint }}>{owner(l.nextAction.assignee)?.name} · {dueLabel(l.nextAction.due)} · {l.nextAction.priority}</div></div>
            <button onClick={() => { svc.completeNextAction(id); toast('Done', 'success'); }} style={{ ...ghostBtn, height: 30, padding: '0 10px', fontSize: 12 }}>Done</button>
          </div> : <div style={{ fontSize: 12.5, color: T.faint }}>No open next action.</div>}
          <button onClick={() => setModal({ kind: 'nextAction', id })} style={{ marginTop: 8, border: 'none', background: 'transparent', color: '#007AFF', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>+ Set next action</button>
        </Section>

        <Section title="Basic information">
          <KV k="Phone" v={l.phone} /><KV k="Email" v={l.email || '—'} /><KV k="Location" v={l.location} />
          <KV k="License" v={l.licenseType} /><KV k="Experience" v={`${l.experienceYears} yrs`} /><KV k="Availability" v={l.availability} />
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 11px', borderRadius: 10, background: l.consent?.doNotContact ? 'rgba(255,69,58,0.07)' : '#F2F2F7' }}>
            <div><div style={{ fontSize: 12.5, fontWeight: 600 }}>Consent (TCPA)</div><div style={{ fontSize: 11.5, color: T.faint }}>{l.consent?.status === 'in' ? 'Opted In' : l.consent?.status === 'out' ? 'Opted Out' : 'Not yet asked'}{l.consent?.at ? ` · ${fmtDate(l.consent.at)}` : ''}</div></div>
            <Select value={l.consent?.status || 'not_asked'} onChange={(v: string) => { svc.setConsent(id, v); toast('Consent updated', 'success'); }} options={[{ value: 'not_asked', label: 'Not asked' }, { value: 'in', label: 'Opted In' }, { value: 'out', label: 'Opted Out' }]} style={{ width: 130, height: 32 }} />
          </div>
        </Section>

        <Section title="Source & assignment">
          <KV k="Source" v={sourceMeta(l.source).label} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}><span style={{ fontSize: 13, color: T.faint }}>Owner</span><Select value={l.ownerId} onChange={(v: string) => { svc.assign(id, v); toast('Reassigned', 'success'); }} options={USERS.map((u) => ({ value: u.id, label: u.name }))} style={{ width: 150, height: 32 }} /></div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}><span style={{ fontSize: 13, color: T.faint }}>Interest</span><Select value={l.interest} onChange={(v: string) => { svc.update(id, { interest: v }); }} options={Object.keys(INTEREST).map((k) => ({ value: k, label: INTEREST[k].label }))} style={{ width: 150, height: 32 }} /></div>
          <KV k="Stage" v={`${l.stageName} · ${daysInStage(l)}d${st?.maxDays ? ` / ${st.maxDays}d SLA` : ''}`} />
        </Section>

        <Section title="Anna AI summary" right={<button onClick={(e) => { e.stopPropagation(); setModal({ kind: 'annaSummary', id }); }} style={{ border: 'none', background: 'transparent', color: '#007AFF', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginRight: 8 }}>Edit</button>}>
          {l.annaSummary ? <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5, padding: '10px 12px', borderRadius: 10, background: 'rgba(0,122,255,0.05)' }}>{l.annaSummary}</div> : <div style={{ fontSize: 12.5, color: T.faint }}>No Anna conversation summary yet.</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <MiniBtn label="Flag no-response" onClick={() => { svc.flagNoResponse(id); toast('Flagged', 'info'); }} />
            <MiniBtn label="Escalate to owner" onClick={() => { svc.escalate(id, 'Recruiter requested review'); toast('Escalated', 'info'); }} />
          </div>
        </Section>

        <Section title="Screening">
          {['cdlValid', 'mvrClear', 'medical'].map((k) => <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
            <span style={{ fontSize: 13, color: T.muted, textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}</span>
            <Select value={String(l.screening?.[k] ?? '')} onChange={(v: string) => { const s = { ...l.screening, [k]: v === '' ? null : v === 'true' }; svc.update(id, { screening: s }); }} options={[{ value: '', label: '—' }, { value: 'true', label: 'Pass' }, { value: 'false', label: 'Fail' }]} style={{ width: 110, height: 30 }} />
          </div>)}
        </Section>

        <Section title="Documents">
          {l.documents.map((d: any) => <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <Icon name="fileText" size={14} style={{ color: T.faint }} /><span style={{ flex: 1, fontSize: 13 }}>{d.name}</span>
            <Select value={d.status} onChange={(v: string) => svc.setDoc(id, d.name, v)} options={[{ value: 'missing', label: 'Missing' }, { value: 'requested', label: 'Requested' }, { value: 'received', label: 'Received' }]} style={{ width: 120, height: 30 }} />
          </div>)}
        </Section>

        <Section title="Activity timeline" defaultOpen={false}>
          {l.activities.map((a: any, i: number) => <div key={a.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i ? `1px solid ${T.hair}` : 'none' }}>
            <span style={{ width: 24, height: 24, flex: 'none', borderRadius: 999, background: '#F2F2F7', color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={ACT_ICON[a.type] || 'circle'} size={12} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5 }}>{a.title}{a.outcome ? ` (${a.outcome})` : ''}</div>{a.detail && <div style={{ fontSize: 11.5, color: T.muted }}>{a.detail}</div>}<div style={{ fontSize: 11, color: T.faint }}>{a.user} · {fmtAgo(a.at)}</div></div>
          </div>)}
        </Section>

        <Section title="Notes" defaultOpen={false}>
          <div style={{ display: 'flex', gap: 8 }}><Input value={note} onChange={(e: any) => setNote(e.target.value)} placeholder="Add a note…" /><Hover as="button" onClick={() => { svc.addNote(id, note); setNote(''); toast('Note added', 'success'); }} style={{ ...primaryBtn, height: 38 }} hover={{ background: '#0066D6' }}>Add</Hover></div>
        </Section>

        <Section title="Final decision & archive">
          <KV k="Decision" v={l.decision ? l.decision.replace(/_/g, ' ') : '—'} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <MiniBtn label="Approve" onClick={() => { svc.close(id, 'acceptable', 'Approved for hire', true); toast('Approved', 'success'); }} />
            <MiniBtn label="Reject" onClick={() => setModal({ kind: 'close', id, decision: 'not_acceptable' })} />
            <MiniBtn label="Refused" onClick={() => setModal({ kind: 'close', id, decision: 'refused' })} />
            <MiniBtn label="Archive" onClick={() => setModal({ kind: 'archive', id })} />
          </div>
          {l.stageName === 'Hired' && <Hover as="button" onClick={() => { hireSvc.addDriver({ name: l.name, phone: l.phone, email: l.email, carrier: l.carrier, position: 'Company Driver' }, 'Onboarding'); toast('Sent to onboarding pipeline', 'success'); go && go('pipeline'); }} style={{ ...primaryBtn, marginTop: 10, width: '100%', justifyContent: 'center' }} hover={{ background: '#0066D6' }}><Icon name="arrowRight" size={15} />Send to Onboarding</Hover>}
        </Section>
        <div style={{ height: 20 }} />
      </div>
    </div>
  </div>;
}
function QA({ icon, label, onClick }: any) { return <Hover as="button" onClick={onClick} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 0', borderRadius: 10, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', color: T.text }} hover={{ background: T.hover }}><Icon name={icon} size={16} /><span style={{ fontSize: 10, fontWeight: 600, color: T.muted }}>{label}</span></Hover>; }
function MiniBtn({ label, onClick }: any) { return <Hover as="button" onClick={onClick} style={{ height: 30, padding: '0 11px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: T.text }} hover={{ background: T.hover }}>{label}</Hover>; }
const ACT_ICON: Record<string, string> = { lead: 'plus', anna: 'sparkles', comm: 'phone', note: 'fileText', stage: 'arrowRight', assignment: 'users', document: 'fileText', task: 'listChecks', decision: 'checkCircle', archive: 'ban', consent: 'shield', system: 'alert' };

/* ── modals ── */
function RecruitModals({ modal, onClose, toast, onOpen }: any) {
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{svc.stages().map((s: any) => <Hover key={s.id} as="button" onClick={() => { svc.moveStage(modal.id, s.name); toast(`Moved to ${s.name}`, 'success'); onClose(); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, border: `1px solid ${s.name === l?.stageName ? '#007AFF' : T.border}`, background: s.name === l?.stageName ? 'rgba(0,122,255,0.06)' : '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }} hover={{ background: T.hover }}>{s.name}{s.name === l?.stageName && <span style={{ fontSize: 11, color: '#007AFF' }}>Current</span>}</Hover>)}</div>
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
    const store = svc; void store;
    const [name, setName] = React.useState('');
    return <Modal title="Pipeline stages" subtitle="Add, rename, reorder, set SLA, disable, or delete stages." width={560} onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Input value={name} onChange={(e: any) => setName(e.target.value)} placeholder="New stage name" />
        <Hover as="button" onClick={() => { if (name.trim()) { svc.addStage(name.trim()); setName(''); toast('Stage added', 'success'); } }} style={{ ...primaryBtn, height: 38 }} hover={{ background: '#0066D6' }}>Add</Hover>
      </div>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {svc.stages().map((s: any, i: number) => <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i ? `1px solid ${T.hair}` : 'none' }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{s.name}</span>
          <span style={{ fontSize: 11.5, color: T.faint }}>SLA {s.maxDays || 0}d</span>
          <button onClick={() => svc.moveStageOrder(s.id, -1)} style={miniIcon}><Icon name="chevronLeft" size={13} /></button>
          <button onClick={() => svc.moveStageOrder(s.id, 1)} style={miniIcon}><Icon name="chevronRight" size={13} /></button>
          <button onClick={() => svc.disableStage(s.id)} title="Disable" style={miniIcon}><Icon name="ban" size={13} /></button>
        </div>)}
      </div>
    </Modal>;
  }
  return null;
}
const miniIcon: React.CSSProperties = { width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.border}`, background: '#fff', color: T.muted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
