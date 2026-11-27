import React from 'react';
import { T, Icon } from '../tasks/lib';
import { SOURCES } from '../recruit/store';
import { PipeKey, LEAD_STAGE, HIRING_STAGE, ACTIVE_STAGE, recruiterName } from './stages';
import {
  PipeDef, StageDef, ColumnMetric, stageOf, daysInStage, recordSla, readyToAdvance, nextStageOf, nextStepOf, ownerOf,
  leadAttempts, leadLastContact, speedToLeadMin, fmtDuration, fmtShortAgo, docsProgress, esignStatus, tenureDays,
  driverLastContact, nextCheckIn, daysBetween, openStages, finalStages, sortForColumn, fmtDay,
} from './lifecycle';
import { SlaChip, ReadyBadge, PersonAvatar, IconButton, Popover, MenuRow, MenuLabel, SmallBtn, BLUE } from './ui';

export interface BoardHandlers {
  onOpen: (id: string) => void;
  onMove: (id: string, stage: string) => void;
  onCall: (id: string) => void;
  onText: (id: string) => void;
  onTask: (id: string) => void;
  onHandoff: (id: string) => void;
  onOpenElsewhere: (pipe: PipeKey, id: string) => void;
}
interface BoardProps extends BoardHandlers {
  def: PipeDef;
  records: any[];
  metrics: Record<string, ColumnMetric>;
  recent: any[];
  collapsed: string[];
  onToggleCollapse: (stage: string) => void;
  peekId: string | null;
  compact: boolean;
}

const MIN_COL = 238;
const MAX_COL = 360;
const GAP = 12;
const PAGE = 30;

export function Board(p: BoardProps) {
  const [over, setOver] = React.useState<string | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const dragRef = React.useRef<string | null>(null);
  const now = Date.now();
  const drop = (stage: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragRef.current;
    setOver(null); setDragId(null); dragRef.current = null;
    if (id) p.onMove(id, stage);
  };
  const dnd = (stage: string) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== stage) setOver(stage); },
    onDragLeave: (e: React.DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver((o) => (o === stage ? null : o)); },
    onDrop: drop(stage),
  });
  const startDrag = (id: string) => (e: React.DragEvent) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; dragRef.current = id; setDragId(id); };
  const endDrag = () => { setDragId(null); setOver(null); };
  const byStage = (name: string) => sortForColumn(p.def, p.records.filter((r) => stageOf(p.def.key, r) === name), now);
  const open = openStages(p.def); const finals = finalStages(p.def);
  // `collapsed` holds toggled keys: open stages are collapsed, `final:` zones are expanded
  const isCollapsed = (s: string) => p.collapsed.includes(s);
  const railExpanded = finals.some((s) => isCollapsed('final:' + s.name));
  const minCol = p.compact ? 252 : MIN_COL;
  const minWidth = open.reduce((w, s) => w + (isCollapsed(s.name) ? 46 : minCol), 0) + (railExpanded ? 250 : 112) + GAP * open.length;

  return <div data-testid="board" style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 14 }}>
    <div style={{ display: 'flex', gap: GAP, height: '100%', width: `max(100%, ${minWidth}px)`, alignItems: 'stretch' }}>
      {open.map((st) => <Column key={st.name} def={p.def} st={st} cards={byStage(st.name)} metric={p.metrics[st.name]} collapsed={isCollapsed(st.name)} onToggle={() => p.onToggleCollapse(st.name)}
        over={over === st.name} dnd={dnd(st.name)} startDrag={startDrag} endDrag={endDrag} dragId={dragId} handlers={p} peekId={p.peekId} now={now} minCol={minCol} />)}
      {/* final + handoff zones share one narrow rail at the end of the board */}
      <div style={{ width: railExpanded ? 250 : 112, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, transition: 'width .15s' }}>
        {finals.map((st) => <FinalZone key={st.name} def={p.def} st={st} records={st.final === 'lost' ? byStage(st.name) : p.recent} expanded={isCollapsed('final:' + st.name)}
          onToggle={() => p.onToggleCollapse('final:' + st.name)} over={over === st.name} dnd={dnd(st.name)} handlers={p} now={now} />)}
      </div>
    </div>
  </div>;
}

function Column({ def, st, cards, metric, collapsed, onToggle, over, dnd, startDrag, endDrag, dragId, handlers, peekId, now, minCol }: any) {
  const [limit, setLimit] = React.useState(PAGE);
  const sub: string[] = [];
  if (metric?.conversion != null) sub.push(`${metric.conversion}% from prev`);
  if (metric?.avgDays != null && cards.length) sub.push(`avg ${metric.avgDays}d`);
  if (collapsed) {
    return <div {...dnd} data-stage={st.name} style={{ width: 46, flex: 'none', borderRadius: 14, background: over ? 'rgba(0,122,255,0.08)' : '#EEF0F3', border: `1px solid ${over ? BLUE : 'transparent'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 10, gap: 10, cursor: 'pointer' }} onClick={onToggle} title={`Expand ${st.name}`}>
      <span style={{ width: 22, height: 4, borderRadius: 4, background: st.color }} />
      <span style={{ fontSize: 11.5, fontWeight: 700, color: T.muted, background: '#fff', borderRadius: 999, padding: '1px 7px' }}>{cards.length}</span>
      <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 12.5, fontWeight: 650, color: T.text, whiteSpace: 'nowrap' }}>{st.name}</span>
    </div>;
  }
  return <section {...dnd} data-stage={st.name} aria-label={`${st.name} column`} style={{ flex: '1 1 0', minWidth: minCol, maxWidth: MAX_COL, display: 'flex', flexDirection: 'column', maxHeight: '100%', borderRadius: 14, background: over ? 'rgba(0,122,255,0.06)' : '#EEF0F3', outline: over ? `2px dashed ${BLUE}` : 'none', outlineOffset: -2, transition: 'background .12s' }}>
    <header style={{ flex: 'none', padding: '0 12px 8px', borderTop: `3px solid ${st.color}`, borderRadius: '14px 14px 0 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingTop: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.name}</span>
        <span style={{ fontSize: 11.5, fontWeight: 650, color: T.muted, background: '#fff', borderRadius: 999, padding: '1px 8px', flex: 'none' }}>{cards.length}</span>
        {metric?.pastSla > 0 && <span title={`${metric.pastSla} past the ${st.maxDays}-day SLA`} style={{ fontSize: 11, fontWeight: 650, color: '#C62820', background: 'rgba(255,59,48,0.10)', borderRadius: 999, padding: '1px 7px', flex: 'none' }}>{metric.pastSla} late</span>}
        <span style={{ flex: 1 }} />
        <IconButton icon="chevronLeft" label={`Collapse ${st.name}`} size={24} onClick={onToggle} />
      </div>
      <div style={{ fontSize: 11, color: T.faint, marginTop: 3, minHeight: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={st.maxDays ? `SLA ${st.maxDays} days in stage` : 'No SLA'}>{sub.join(' · ') || (st.maxDays ? `SLA ${st.maxDays}d` : ' ')}{sub.length > 0 && st.maxDays ? ` · SLA ${st.maxDays}d` : ''}</div>
    </header>
    <div style={{ flex: 1, minHeight: 60, overflowY: 'auto', padding: '2px 8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {cards.slice(0, limit).map((r: any) => <Card key={r.id} def={def} r={r} now={now} dragging={dragId === r.id} active={peekId === r.id} onDragStart={startDrag(r.id)} onDragEnd={endDrag} h={handlers} />)}
      {cards.length > limit && <button type="button" onClick={() => setLimit((l) => l + PAGE)} style={{ height: 32, border: 'none', borderRadius: 9, background: 'rgba(0,0,0,0.04)', color: T.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Show {Math.min(PAGE, cards.length - limit)} more</button>}
      {cards.length === 0 && <div style={{ fontSize: 12, color: '#A1A1A6', textAlign: 'center', padding: '18px 8px', border: '1px dashed rgba(0,0,0,0.10)', borderRadius: 10 }}>{over ? 'Drop here' : 'No one here'}</div>}
    </div>
  </section>;
}

/* ───────── card ───────── */
const srcLabel = (k: string) => SOURCES.find((s) => s.key === k)?.label || k || 'Manual';
const srcIcon = (k: string) => SOURCES.find((s) => s.key === k)?.icon || 'tag';

type Field = { icon: string; text: string; color?: string; title?: string };
function cardFields(pipe: PipeKey, r: any, now: number): { fields: Field[]; bar?: { have: number; total: number } } {
  if (pipe === 'leads') {
    const sp = speedToLeadMin(r); const att = leadAttempts(r); const lc = leadLastContact(r);
    const ageMin = (now - +new Date(r.createdAt)) / 6e4;
    return { fields: [
      { icon: srcIcon(r.source), text: srcLabel(r.source), title: 'Source' },
      sp != null ? { icon: 'zap', text: `First touch ${fmtDuration(sp)}`, color: sp <= 15 ? '#248A3D' : sp <= 60 ? '#A05A00' : '#C62820', title: 'Speed-to-lead' }
        : { icon: 'clock', text: `Waiting ${fmtDuration(ageMin)}`, color: ageMin > 60 ? '#C62820' : ageMin > 5 ? '#A05A00' : T.muted, title: 'Lead age — not contacted yet' },
      { icon: 'phone', text: `${att} attempt${att === 1 ? '' : 's'}`, title: 'Outbound contact attempts' },
      { icon: 'message', text: lc ? `Last contact ${fmtShortAgo(lc, now)}` : 'No contact yet', color: lc ? undefined : T.faint, title: 'Last contact' },
    ] };
  }
  if (pipe === 'hiring') {
    const dp = docsProgress(r); const es = esignStatus(r);
    const late = [HIRING_STAGE.OFFER, HIRING_STAGE.ORIENTATION, HIRING_STAGE.HIRED].includes(r.stage as any);
    const miss = (r.documents || []).find((x: any) => x.required && x.status === 'missing');
    const f: Field[] = [];
    if (late || es !== 'none') f.push({ icon: 'sign', text: `E-sign: ${({ none: 'Not sent', sent: 'Sent', viewed: 'Viewed', completed: 'Signed' } as any)[es]}`, color: es === 'completed' ? '#248A3D' : es === 'none' ? T.faint : '#0066CC', title: 'E-sign status' });
    else if (miss) f.push({ icon: 'alert', text: `Missing ${miss.name}`, color: '#C62820' });
    if (r.reapplyCount > 0) f.push({ icon: 'repeat', text: `Rehire #${r.reapplyCount}`, color: '#5856D6', title: 'Re-applied after a previous tenure' });
    if (r.stage === HIRING_STAGE.LOST && r.lostReason) f.push({ icon: 'ban', text: r.lostReason, color: '#C62820' });
    return { fields: f, bar: dp };
  }
  if (pipe === 'active') {
    const t = tenureDays(r, now); const lc = r.lastCheckIn; const ld = lc ? daysBetween(lc, now) : null;
    const f: Field[] = [
      { icon: 'truck', text: r.truckNo ? `Unit ${r.truckNo}` : 'No truck', color: r.truckNo ? undefined : '#A05A00', title: 'Truck' },
      { icon: 'calendar', text: t == null ? '—' : r.activeStage === ACTIVE_STAGE.FIRST90 ? `Day ${t} of 90` : `${t} days tenure`, title: `Hired ${fmtDay(r.hireDate)}` },
      { icon: 'phone', text: lc ? `Check-in ${fmtShortAgo(lc, now)}` : 'No check-in yet', color: ld == null ? '#A05A00' : ld > 30 ? '#C62820' : ld > 14 ? '#A05A00' : undefined, title: 'Last check-in' },
    ];
    if (r.riskReason) f.push({ icon: 'alert', text: `At risk: ${r.riskReason}`, color: '#C62820', title: 'Risk flag' });
    else if (r.activeStage === ACTIVE_STAGE.LEAVE) f.push({ icon: 'clock', text: r.returnDate ? `Back ${fmtDay(r.returnDate)}` : 'Return date not set', color: r.returnDate ? undefined : '#A05A00' });
    else if (r.activeStage === ACTIVE_STAGE.FIRST90) { const n = nextCheckIn(r); if (n) { const dd = Math.ceil((+new Date(n.due) - now) / 864e5); f.push({ icon: 'listChecks', text: `Day ${n.day} check-in ${dd < 0 ? `${-dd}d overdue` : dd === 0 ? 'today' : `in ${dd}d`}`, color: dd < 0 ? '#C62820' : undefined }); } }
    else f.push({ icon: 'shield', text: 'No risk flags', color: '#248A3D', title: 'Risk flag' });
    return { fields: f };
  }
  const lc = driverLastContact(r);
  return { fields: [
    { icon: 'ban', text: r.quitReason ? `${r.quitType || 'Left'}: ${r.quitReason}` : 'Reason not recorded', color: r.quitReason ? undefined : '#A05A00', title: 'Exit reason' },
    { icon: 'calendar', text: r.inactiveSince ? `Inactive since ${fmtDay(r.inactiveSince)}` : 'Inactive', color: r.inactiveSince && daysBetween(r.inactiveSince, now) > 90 ? T.faint : undefined, title: 'Inactive since' },
    r.rehireEligible === true ? { icon: 'checkCircle', text: 'Rehire eligible', color: '#248A3D' } : r.rehireEligible === false ? { icon: 'ban', text: 'Not rehire-eligible', color: '#C62820' } : { icon: 'alert', text: 'Eligibility not reviewed', color: '#A05A00' },
    { icon: 'message', text: lc ? `Last contact ${fmtShortAgo(lc, now)}` : 'No contact since exit', color: lc ? undefined : T.faint, title: 'Last contact' },
  ] };
}

function Card({ def, r, now, dragging, active, onDragStart, onDragEnd, h }: any) {
  const pipe: PipeKey = def.key;
  const [hover, setHover] = React.useState(false);
  const [moveOpen, setMoveOpen] = React.useState(false);
  const stage = stageOf(pipe, r);
  const st: StageDef | undefined = def.stages.find((s: StageDef) => s.name === stage);
  const isFinal = !!st?.final;
  const days = daysInStage(pipe, r, now);
  const sla = recordSla(def, r, now);
  const ready = readyToAdvance(def, r, now);
  const next = nextStepOf(pipe, r);
  const nextStage = nextStageOf(def, stage);
  const { fields, bar } = cardFields(pipe, r, now);
  const handoffStage = isFinal ? null : (pipe === 'leads' && stage === LEAD_STAGE.QUALIFIED ? 'Move to Hiring' : pipe === 'hiring' && stage === HIRING_STAGE.HIRED ? 'Start 90-day onboarding' : null);
  const owner = recruiterName(ownerOf(pipe, r));
  const showActions = hover || moveOpen;
  const dueTxt = next?.due ? (() => { const dd = Math.ceil((+new Date(next.due) - now) / 864e5); return dd < 0 ? `${-dd}d overdue` : dd === 0 ? 'today' : dd === 1 ? 'tomorrow' : fmtDay(next.due); })() : '';
  const overdue = !!next?.due && +new Date(next.due) < now - 864e5 / 2;
  return <article draggable onDragStart={onDragStart} onDragEnd={onDragEnd} tabIndex={0} data-card={r.id} aria-label={`${r.name}, ${stage}, ${days} days in stage`}
    onClick={() => h.onOpen(r.id)} onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h.onOpen(r.id); } if (e.key === 'm' || e.key === 'M') { e.preventDefault(); setMoveOpen(true); } }}
    onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHover(false); }}
    style={{ position: 'relative', background: '#fff', borderRadius: 12, padding: '11px 12px 10px', cursor: 'pointer', border: `1px solid ${active ? BLUE : 'rgba(0,0,0,0.06)'}`, boxShadow: hover ? '0 6px 18px rgba(0,0,0,0.10)' : '0 1px 2px rgba(0,0,0,0.05)', opacity: dragging ? 0.45 : 1, transition: 'box-shadow .14s, opacity .14s', outline: 'none' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <PersonAvatar name={r.name} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 650, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
        <div style={{ fontSize: 11.5, color: T.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pipe === 'leads' ? (r.lane || r.location || r.licenseType) : `${r.lane || r.position || ''}${r.carrier ? ' · ' + r.carrier.replace(/ (LLC|INC|TRANSPORTATION).*$/i, '') : ''}`}</div>
      </div>
      {!showActions && !isFinal && <SlaChip days={days} level={sla} title={st?.maxDays ? `${days} days in ${stage} · SLA ${st.maxDays}d` : `${days} days in ${stage}`} />}
    </div>
    {showActions && <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 2, padding: 2, background: '#fff', borderRadius: 10, boxShadow: '0 2px 10px rgba(0,0,0,0.10)', border: '1px solid rgba(0,0,0,0.06)' }}>
      <IconButton icon="phone" label={`Call ${r.name}`} size={28} onClick={() => h.onCall(r.id)} />
      <IconButton icon="message" label={`Text ${r.name}`} size={28} onClick={() => h.onText(r.id)} />
      <IconButton icon="listChecks" label="Add task" size={28} onClick={() => h.onTask(r.id)} />
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <IconButton icon="arrowRight" label="Move to…" size={28} onClick={() => setMoveOpen((o) => !o)} />
        <MoveMenu open={moveOpen} onClose={() => setMoveOpen(false)} def={def} current={stage} onPick={(s: string) => { setMoveOpen(false); h.onMove(r.id, s); }} />
      </span>
    </div>}
    {bar && <div style={{ marginTop: 9 }} title={`${bar.have} of ${bar.total} required documents collected`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.muted, marginBottom: 3 }}><span>Documents</span><span style={{ fontWeight: 650, color: bar.have === bar.total ? '#248A3D' : T.text }}>{bar.have}/{bar.total}</span></div>
      <div style={{ height: 5, borderRadius: 99, background: '#EEF0F3', overflow: 'hidden' }}><div style={{ width: `${bar.total ? (bar.have / bar.total) * 100 : 0}%`, height: '100%', borderRadius: 99, background: bar.have === bar.total ? '#34C759' : bar.have / Math.max(1, bar.total) >= 0.6 ? BLUE : '#FF9F0A' }} /></div>
    </div>}
    {fields.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 12, rowGap: 4, marginTop: 9 }}>
      {fields.slice(0, 4).map((f, i) => <span key={i} title={f.title} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%', fontSize: 11.5, color: f.color || T.muted }}><Icon name={f.icon} size={12} style={{ flex: 'none', opacity: 0.8 }} /><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.text}</span></span>)}
    </div>}
    {!isFinal && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, paddingTop: 8, borderTop: `1px solid ${T.hair}` }}>
      {next ? <span title={`Next step: ${next.title}`} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: overdue ? '#C62820' : T.text }}>
        <Icon name="arrowRight" size={11} style={{ flex: 'none', color: overdue ? '#C62820' : T.faint }} />
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{next.title}</span>
        {dueTxt && <span style={{ flex: 'none', color: overdue ? '#C62820' : T.faint }}>· {dueTxt}</span>}
      </span> : <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: '#A05A00' }}><Icon name="alert" size={12} />No next step</span>}
      {ready && <ReadyBadge to={nextStage} />}
      <span title={`Recruiter: ${owner}`} style={{ flex: 'none', display: 'inline-flex' }}><PersonAvatar name={owner} size={20} /></span>
    </div>}
    {handoffStage && <SmallBtn label={handoffStage} icon="arrowRight" tone={ready ? 'primary' : 'default'} onClick={() => h.onHandoff(r.id)} style={{ width: '100%', marginTop: 8, height: 28 }} />}
  </article>;
}

export function MoveMenu({ open, onClose, def, current, onPick }: { open: boolean; onClose: () => void; def: PipeDef; current: string; onPick: (s: string) => void }) {
  return <Popover open={open} onClose={onClose} width={236}>
    <MenuLabel>Move to…</MenuLabel>
    {def.stages.map((s) => <MenuRow key={s.name} dot={s.color} label={s.final === 'handoff' ? (s.label || s.name) : s.name} hint={s.final === 'lost' ? 'needs reason' : s.final === 'handoff' ? '→ ' + ({ leads: 'Leads', hiring: 'Hiring', active: 'Active', inactive: 'Inactive' } as any)[s.to || 'hiring'] : ''} active={s.name === current} disabled={s.name === current} onClick={() => onPick(s.name)} />)}
  </Popover>;
}

/* ───────── final / handoff zones ───────── */
function FinalZone({ def, st, records, expanded, onToggle, over, dnd, handlers, now }: any) {
  const isHandoff = st.final === 'handoff';
  const label = st.label || st.name;
  const toLabel = ({ leads: 'Leads', hiring: 'Hiring', active: 'Active', inactive: 'Inactive' } as any)[st.to || ''] || '';
  const tint = isHandoff ? 'rgba(52,199,89,0.08)' : 'rgba(255,59,48,0.06)';
  const fg = isHandoff ? '#248A3D' : '#C62820';
  const icon = isHandoff ? 'arrowRight' : 'ban';
  const otherPipe: PipeKey = st.to || def.key;
  return <section {...dnd} data-stage={st.name} aria-label={`${label} drop zone`} style={{ flex: '1 1 0', minHeight: 120, display: 'flex', flexDirection: 'column', borderRadius: 14, border: `1.5px dashed ${over ? fg : 'rgba(0,0,0,0.12)'}`, background: over ? tint : 'rgba(255,255,255,0.5)', transition: 'background .12s, width .15s' }}>
    <button type="button" onClick={onToggle} title={expanded ? 'Collapse' : `Show ${isHandoff ? 'recent handoffs' : 'records'}`} style={{ border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', padding: '12px 10px 10px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: expanded ? 'stretch' : 'center' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: expanded ? 'flex-start' : 'center' }}>
        <span style={{ width: 24, height: 24, borderRadius: 999, background: tint, color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name={icon} size={13} /></span>
        {expanded && <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{label}</span>}
      </span>
      {!expanded && <span style={{ fontSize: 11.5, fontWeight: 650, color: T.text, textAlign: 'center', lineHeight: 1.25 }}>{label}</span>}
      <span style={{ fontSize: 11, color: T.faint, textAlign: expanded ? 'left' : 'center' }}>{isHandoff ? `${records.length} in 30d` : `${records.length} closed`}</span>
      {!expanded && <span style={{ fontSize: 10.5, color: over ? fg : '#A1A1A6', textAlign: 'center', marginTop: 4 }}>{over ? 'Release to move' : isHandoff ? `Drop to send to ${toLabel}` : 'Drop to close'}</span>}
    </button>
    {expanded && <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {records.length === 0 && <div style={{ fontSize: 11.5, color: '#A1A1A6', textAlign: 'center', padding: 12 }}>None yet</div>}
      {records.slice(0, 40).map((r: any) => {
        const sub = isHandoff
          ? (def.key === 'leads' ? 'In Hiring' : def.key === 'hiring' ? `Hired ${fmtDay(r.hireDate)}` : def.key === 'active' ? `${r.quitType || 'Left'} · ${r.quitReason || ''}` : `Re-applied ${fmtShortAgo(r.lastReappliedAt, now)}`)
          : (r.closeReason || r.lostReason || r.dnrReason || r.quitReason || 'No reason');
        const target = isHandoff ? (def.key === 'leads' ? r.convertedTo : r.id) : r.id;
        return <button key={r.id} type="button" onClick={() => (isHandoff ? handlers.onOpenElsewhere(otherPipe, target) : handlers.onOpen(r.id))} draggable={!isHandoff} onDragStart={(e) => { if (isHandoff) return; e.dataTransfer.setData('text/plain', r.id); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 8px', borderRadius: 9, border: '1px solid rgba(0,0,0,0.06)', background: '#fff', cursor: 'pointer' }}>
          <PersonAvatar name={r.name} size={22} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
            <span style={{ display: 'block', fontSize: 11, color: T.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
          </span>
        </button>;
      })}
    </div>}
  </section>;
}
