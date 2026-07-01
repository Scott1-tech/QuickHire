import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon } from '../tasks/lib';
import { Card, EmptyState, primaryBtn, ghostBtn, Toggle } from '../esign/ui';
import { useRecruit, svc, USERS, SCORE_META, isOverdue, daysInStage, stageByName, fmtAgo, fmtDate, dueLabel } from './store';

const owner = (id: string) => USERS.find((u) => u.id === id);
function isToday(iso: string) { if (!iso) return false; const d = new Date(iso); const n = new Date(); return d.toDateString() === n.toDateString(); }

/* ───────── Recruiter dashboard ───────── */
export function RecruitDashboard({ onOpen }: { onOpen: (id: string) => void }) {
  const store = useRecruit(); void store;
  const me = 'NP';
  const mine = svc.visibleLeads(me).filter((l: any) => !l.archived);
  const dueToday = mine.filter((l: any) => l.nextAction?.status === 'open' && isToday(l.nextAction?.due));
  const overdueFollow = mine.filter((l: any) => l.nextAction?.status === 'open' && l.nextAction?.due && +new Date(l.nextAction.due) < Date.now());
  const assigned = mine.filter((l: any) => l.ownerId === me);
  const hot = mine.filter((l: any) => l.scoreLabel === 'Hot Lead');
  const waiting = mine.filter((l: any) => isOverdue(l));
  const ready = mine.filter((l: any) => l.stageName === 'Ready for Review');
  const archived = svc.visibleLeads(me).filter((l: any) => l.archived).sort((a: any, b: any) => +new Date(b.archiveReport?.archivedAt || 0) - +new Date(a.archiveReport?.archivedAt || 0)).slice(0, 6);
  const recs = svc.recommendations(me);

  const kpis = [
    { label: 'My assigned', value: assigned.length, icon: 'user', color: '#007AFF' },
    { label: 'Due today', value: dueToday.length, icon: 'clock', color: '#FF9F0A' },
    { label: 'Overdue', value: overdueFollow.length, icon: 'alert', color: '#FF453A' },
    { label: 'Hot leads', value: hot.length, icon: 'zap', color: '#FF375F' },
  ];

  return <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
      {kpis.map((k) => <Card key={k.label} style={{ padding: 16 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: k.color + '1c', color: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={k.icon} size={18} /></span>
        <div style={{ fontSize: 28, fontWeight: 700, marginTop: 10, letterSpacing: '-0.02em' }}>{k.value}</div>
        <div style={{ fontSize: 12.5, color: T.muted }}>{k.label}</div>
      </Card>)}
    </div>

    <Card style={{ padding: 16, borderColor: 'rgba(0,122,255,0.18)', background: 'linear-gradient(180deg,#F7FAFF,#FFFFFF)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}><Icon name="sparkles" size={15} style={{ color: '#007AFF' }} /><span style={{ fontSize: 14, fontWeight: 650 }}>Anna recommendations</span></div>
      {recs.length === 0 ? <div style={{ fontSize: 12.5, color: T.faint }}>Nothing needs attention right now.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{recs.map((r: any, i: number) => <Hover key={i} as="button" onClick={() => onOpen(r.leadId)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 11px', borderRadius: 10, border: `1px solid ${T.hair}`, background: '#fff', cursor: 'pointer' }} hover={{ background: T.hover }}>
          <span style={{ width: 7, height: 7, flex: 'none', borderRadius: 999, background: r.priority === 'high' ? '#FF453A' : '#FF9F0A' }} />
          <span style={{ flex: 1, fontSize: 13 }}>{r.text}</span><Icon name="arrowRight" size={14} style={{ color: '#C7C7CC' }} />
        </Hover>)}</div>}
    </Card>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
      <ListCard title="Follow-ups due today" icon="clock" leads={dueToday} onOpen={onOpen} sub={(l: any) => dueLabel(l.nextAction?.due)} />
      <ListCard title="Overdue follow-ups" icon="alert" leads={overdueFollow} onOpen={onOpen} tone="#C62820" sub={(l: any) => dueLabel(l.nextAction?.due)} />
      <ListCard title="Drivers waiting too long" icon="clock" leads={waiting} onOpen={onOpen} sub={(l: any) => `${daysInStage(l)}d in ${l.stageName}`} />
      <ListCard title="Hot leads" icon="zap" leads={hot} onOpen={onOpen} tone="#FF375F" sub={(l: any) => `Score ${l.score}`} />
      <ListCard title="Ready for decision" icon="checkCircle" leads={ready} onOpen={onOpen} sub={(l: any) => l.stageName} />
      <ListCard title="Recently archived" icon="ban" leads={archived} onOpen={onOpen} sub={(l: any) => l.closeReason || 'archived'} />
    </div>
  </div>;
}
function ListCard({ title, icon, leads, onOpen, sub, tone }: any) {
  return <Card style={{ padding: 16 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><Icon name={icon} size={15} style={{ color: tone || T.muted }} /><span style={{ fontSize: 13.5, fontWeight: 650 }}>{title}</span><span style={{ fontSize: 11.5, color: T.faint, marginLeft: 'auto' }}>{leads.length}</span></div>
    {leads.length === 0 ? <div style={{ fontSize: 12, color: T.faint, padding: '6px 0' }}>None</div>
      : leads.slice(0, 6).map((l: any) => <Hover key={l.id} as="button" onClick={() => onOpen(l.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '7px 0', border: 'none', background: 'transparent', cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.03)' }}>
        <span style={{ width: 24, height: 24, flex: 'none', borderRadius: 999, background: '#007AFF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 650 }}>{l.ownerId}</span>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div><div style={{ fontSize: 11, color: tone || T.faint }}>{sub(l)}</div></div>
      </Hover>)}
  </Card>;
}

/* ───────── Management reports ───────── */
export function RecruitReports() {
  const store = useRecruit(); void store;
  const a = svc.analytics();
  const kpis = [
    { label: 'Total leads', value: a.totalLeads }, { label: 'New leads', value: a.newLeads },
    { label: 'Hired', value: a.hired, color: '#248A3D' }, { label: 'Rejected', value: a.rejected, color: '#C62820' },
    { label: 'Refused', value: a.refused, color: '#A05A00' }, { label: 'Conversion', value: a.conversion + '%', color: '#007AFF' },
    { label: 'Avg time to hire', value: a.avgHoursToHire != null ? (a.avgHoursToHire >= 24 ? Math.round(a.avgHoursToHire / 24) + 'd' : a.avgHoursToHire + 'h') : '—' },
    { label: 'Anna conversion', value: a.annaConversion + '%', color: '#FF375F' },
  ];
  return <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
      {kpis.map((k: any) => <Card key={k.label} style={{ padding: 16 }}>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: k.color || T.text }}>{k.value}</div>
        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{k.label}</div>
      </Card>)}
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <Card style={{ padding: 16 }}>
        <H>Average time in each stage</H>
        {a.byStage.filter((s: any) => s.count > 0 || s.avgDays != null).map((s: any) => <div key={s.stage} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: `1px solid ${T.hair}` }}>
          <span style={{ flex: 1, fontSize: 12.5 }}>{s.stage}</span>
          <span style={{ fontSize: 11.5, color: T.faint }}>{s.count} in stage</span>
          <span style={{ fontSize: 12.5, fontWeight: 650, width: 56, textAlign: 'right' }}>{s.avgDays != null ? s.avgDays + 'd' : '—'}</span>
        </div>)}
      </Card>
      <Card style={{ padding: 16 }}>
        <H>Top reasons drivers are lost</H>
        {a.topLost.length === 0 ? <div style={{ fontSize: 12.5, color: T.faint }}>No closed leads yet.</div>
          : a.topLost.map((r: any) => { const max = a.topLost[0].count || 1; return <div key={r.reason} style={{ padding: '7px 0', borderTop: `1px solid ${T.hair}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}><span>{r.reason}</span><span style={{ fontWeight: 650 }}>{r.count}</span></div>
            <div style={{ height: 6, borderRadius: 999, background: '#F2F2F7', overflow: 'hidden' }}><div style={{ width: `${(r.count / max) * 100}%`, height: '100%', background: '#FF453A' }} /></div>
          </div>; })}
      </Card>
    </div>

    <Card style={{ padding: 16 }}>
      <H>Recruiter performance</H>
      <Table cols={['Recruiter', 'Leads', 'Active', 'Hired', 'Overdue']} rows={a.perRecruiter.map((r: any) => [r.name, r.leads, r.active, r.hired, r.overdue])} highlightLast="#C62820" />
    </Card>
    <Card style={{ padding: 16 }}>
      <H>Lead source performance</H>
      <Table cols={['Source', 'Leads', 'Hired', 'Hire rate']} rows={a.perSource.map((s: any) => [s.source, s.leads, s.hired, s.leads ? Math.round((s.hired / s.leads) * 100) + '%' : '—'])} />
      <div style={{ fontSize: 11.5, color: T.faint, marginTop: 10 }}>Anna AI: {a.annaLeads} leads · {a.annaHired} hired · {a.annaConversion}% conversion.</div>
    </Card>
  </div>;
}
function H({ children }: any) { return <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 10 }}>{children}</div>; }
function Table({ cols, rows, highlightLast }: any) {
  return <div>
    <div style={{ display: 'grid', gridTemplateColumns: `1.6fr repeat(${cols.length - 1}, 1fr)`, gap: 8, padding: '0 2px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint }}>
      {cols.map((c: string, i: number) => <span key={c} style={{ textAlign: i ? 'right' : 'left' }}>{c}</span>)}
    </div>
    {rows.map((r: any[], ri: number) => <div key={ri} style={{ display: 'grid', gridTemplateColumns: `1.6fr repeat(${cols.length - 1}, 1fr)`, gap: 8, padding: '9px 2px', borderTop: `1px solid ${T.hair}`, fontSize: 13 }}>
      {r.map((cell: any, ci: number) => <span key={ci} style={{ textAlign: ci ? 'right' : 'left', fontWeight: ci ? 600 : 600, color: ci === r.length - 1 && highlightLast && +cell > 0 ? highlightLast : T.text }}>{cell}</span>)}
    </div>)}
  </div>;
}

/* ───────── Archive ───────── */
export function RecruitArchive({ onOpen, toast }: { onOpen: (id: string) => void; toast: any }) {
  const store = useRecruit(); void store;
  const [q, setQ] = React.useState('');
  const archived = svc.visibleLeads('NP').filter((l: any) => l.archived && (!q || l.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a: any, b: any) => +new Date(b.archiveReport?.archivedAt || 0) - +new Date(a.archiveReport?.archivedAt || 0));
  return <div style={{ maxWidth: 1000, margin: '0 auto' }}>
    <div style={{ position: 'relative', maxWidth: 320, marginBottom: 14 }}>
      <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.faint }}><Icon name="search" size={16} /></span>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search archived leads…" style={{ width: '100%', boxSizing: 'border-box', height: 36, borderRadius: 10, border: `1px solid ${T.border}`, padding: '0 12px 0 34px', fontSize: 13, outline: 'none' }} />
    </div>
    {archived.length === 0 ? <Card><EmptyState icon="ban" title="No archived leads" body="Closed and archived leads appear here with a full report." /></Card>
      : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{archived.map((l: any) => <Card key={l.id} style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 650 }}>{l.name}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', background: '#F2F2F7', borderRadius: 999, padding: '2px 9px', textTransform: 'capitalize' }}>{(l.decision || 'archived').replace(/_/g, ' ')}</span>
              {l.canContactAgain ? <span style={{ fontSize: 10.5, fontWeight: 600, color: '#248A3D', background: 'rgba(52,199,89,0.12)', borderRadius: 999, padding: '2px 8px' }}>Can re-contact</span> : <span style={{ fontSize: 10.5, fontWeight: 600, color: '#C62820', background: 'rgba(255,69,58,0.1)', borderRadius: 999, padding: '2px 8px' }}>Do not contact</span>}
            </div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4 }}>Reason: {l.closeReason || '—'} · owner {owner(l.ownerId)?.name} · archived {fmtDate(l.archiveReport?.archivedAt)}</div>
            <div style={{ fontSize: 11.5, color: T.faint, marginTop: 2 }}>{(l.archiveReport?.timeline || l.activities || []).length} timeline events · {(l.archiveReport?.documents || l.documents || []).length} documents</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Hover as="button" onClick={() => onOpen(l.id)} style={{ ...ghostBtn, height: 32, padding: '0 11px', fontSize: 12.5 }} hover={{ background: 'rgba(0,0,0,0.04)' }}>View report</Hover>
            {l.canContactAgain && <Hover as="button" onClick={() => { svc.reopen(l.id); toast('Re-opened from archive', 'success'); }} style={{ ...primaryBtn, height: 32, padding: '0 11px', fontSize: 12.5 }} hover={{ background: '#0066D6' }}>Re-open</Hover>}
          </div>
        </div>
      </Card>)}</div>}
  </div>;
}

/* ───────── Automations ───────── */
export function RecruitAutomations({ toast }: { toast: any }) {
  const store = useRecruit();
  const [last, setLast] = React.useState<any>(null);
  return <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
    <Card style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><Icon name="zap" size={16} style={{ color: '#007AFF' }} /><h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Smart automation rules</h2></div>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: T.muted }}>Rules run across the pipeline to keep leads moving and scores fresh. Toggle them on/off, then run.</p>
      {store.automations.map((r: any, i: number) => <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderTop: i ? `1px solid ${T.hair}` : 'none' }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>{r.desc}</div></div>
        <Toggle on={r.enabled} onChange={() => svc.toggleAutomation(r.id)} />
      </div>)}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Hover as="button" onClick={() => { const res = svc.runAutomations(); setLast(res); toast(`Automations ran — ${res.flagged} flagged, ${res.escalated} escalated, ${res.rescored} rescored`, 'success'); }} style={primaryBtn} hover={{ background: '#0066D6' }}><Icon name="zap" size={15} />Run automations now</Hover>
        <Hover as="button" onClick={() => { store.leads.forEach((l: any) => { l.score = undefined; }); const res = svc.runAutomations(); setLast(res); toast('Scores recomputed', 'success'); }} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="refresh" size={15} />Recompute scores</Hover>
      </div>
      {last && <div style={{ marginTop: 12, fontSize: 12.5, color: T.muted, padding: '10px 12px', borderRadius: 10, background: '#F2F2F7' }}>Last run: {last.flagged} flagged · {last.escalated} escalated · {last.advanced} auto-advanced · {last.rescored} rescored.</div>}
    </Card>
    <Card style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><Icon name="sparkles" size={16} style={{ color: '#007AFF' }} /><h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Anna scoring automation</h2></div>
      <p style={{ margin: 0, fontSize: 13, color: T.muted }}>Driver scores update automatically from experience, license, availability, interest, location, consent and reply speed. Inbound replies raise the score; opt-outs drop it. Labels: Hot Lead ≥85, Good Fit ≥70, Needs Review ≥55, Low Fit ≥40, else Do Not Proceed.</p>
    </Card>
  </div>;
}
