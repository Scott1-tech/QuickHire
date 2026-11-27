import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon } from '../tasks/lib';
import { SOURCES } from '../recruit/store';
import { LEAD_STAGE, HIRING_STAGE, ACTIVE_STAGE, INACTIVE_STAGE, recruiterName } from './stages';
import {
  PipeDef, CheckAction, stageOf, daysInStage, recordSla, checklistFor, nextStageOf, nextStepOf, readyToAdvance, ownerOf,
  leadAttempts, leadLastContact, speedToLeadMin, fmtDuration, fmtShortAgo, fmtDay, docsProgress, esignStatus, tenureDays,
  driverLastContact, nextCheckIn, daysBetween, suggestedNextStep, stageDef,
} from './lifecycle';
import { nextTaskOf } from './service';
import { SlaChip, ReadyBadge, PersonAvatar, ExampleTag, IconButton, SmallBtn, SectionLabel, BLUE } from './ui';

export interface PeekHandlers {
  onClose: () => void;
  onCall: () => void;
  onText: () => void;
  onTask: () => void;
  onOpenProfile: () => void;
  onMove: (stage: string) => void;
  onAction: (a: CheckAction) => void;
  onSetNext: (title: string) => void;
  onCompleteNext: () => void;
  onCompleteTask: (taskId: string) => void;
}

const ES_LABEL: Record<string, string> = { none: 'Not sent', sent: 'Sent — awaiting signature', viewed: 'Viewed — not signed', completed: 'Signed' };

function facts(def: PipeDef, r: any, now: number): [string, React.ReactNode][] {
  const pipe = def.key;
  if (pipe === 'leads') {
    const sp = speedToLeadMin(r);
    return [
      ['Phone', r.phone], ['Email', r.email || '—'],
      ['Source', SOURCES.find((s) => s.key === r.source)?.label || r.source],
      ['CDL / experience', `${r.licenseType || '—'} · ${r.experienceYears ?? 0} yrs`],
      ['Speed-to-lead', sp == null ? `Not contacted · ${fmtDuration((now - +new Date(r.createdAt)) / 6e4)} old` : fmtDuration(sp)],
      ['Attempts', `${leadAttempts(r)} · last ${fmtShortAgo(leadLastContact(r), now)}`],
      ['Consent', r.consent?.doNotContact ? 'Do-Not-Contact' : r.consent?.status === 'in' ? 'Opted in' : 'Not asked'],
    ];
  }
  if (pipe === 'hiring') {
    const dp = docsProgress(r);
    return [
      ['Phone', r.phone], ['Carrier', r.carrier],
      ['CDL / experience', `Class ${r.cdlClass || 'A'} · ${r.experienceYears ?? 0} yrs`],
      ['Applied', `${fmtDay(r.appliedAt)} · ${daysBetween(r.appliedAt, now)}d ago`],
      ['Documents', `${dp.have}/${dp.total} required collected`],
      ['E-sign', ES_LABEL[esignStatus(r)]],
      ...(r.reapplyCount > 0 ? [['Rehire', `#${r.reapplyCount} · left before for ${(r.tenures || []).slice(-1)[0]?.reason || '—'}`] as [string, string]] : []),
      ...(r.stage === HIRING_STAGE.LOST ? [['Closed', `${r.lostReason || '—'} (from ${r.lostFrom || '—'})`] as [string, string]] : []),
    ];
  }
  if (pipe === 'active') {
    const n = nextCheckIn(r);
    return [
      ['Phone', r.phone], ['Carrier', r.carrier], ['Truck', r.truckNo ? `Unit ${r.truckNo}` : 'Not assigned'],
      ['Hired', r.hireDate ? `${fmtDay(r.hireDate)} · ${tenureDays(r, now)} days` : '—'],
      ['Last check-in', r.lastCheckIn ? fmtShortAgo(r.lastCheckIn, now) : 'None yet'],
      ...(n ? [['Next check-in', `Day ${n.day} · ${fmtDay(n.due)}`] as [string, string]] : []),
      ['Risk', r.riskReason ? `${r.riskReason}${r.riskNote ? ' — ' + r.riskNote : ''}` : 'No flags'],
      ...(r.activeStage === ACTIVE_STAGE.LEAVE ? [['Return date', r.returnDate ? fmtDay(r.returnDate) : 'Not set'] as [string, string]] : []),
    ];
  }
  const last = (r.tenures || []).slice(-1)[0];
  return [
    ['Phone', r.phone],
    ['Exit', r.quitReason ? `${r.quitType || 'Left'} · ${r.quitReason}` : 'Not recorded'],
    ['Inactive since', r.inactiveSince ? `${fmtDay(r.inactiveSince)} · ${daysBetween(r.inactiveSince, now)}d` : '—'],
    ['Tenure', last?.hireDate && last?.endDate ? `${daysBetween(last.hireDate, +new Date(last.endDate))} days` : '—'],
    ['Rehire eligible', r.rehireEligible === true ? 'Yes' : r.rehireEligible === false ? `No${r.dnrReason ? ' — ' + r.dnrReason : ''}` : 'Not reviewed'],
    ['Last contact', fmtShortAgo(driverLastContact(r), now)],
    ...(r.quitNote ? [['Note', r.quitNote] as [string, string]] : []),
  ];
}

export function Peek({ def, r, h, compact }: { def: PipeDef; r: any; h: PeekHandlers; compact: boolean }) {
  const now = Date.now();
  const pipe = def.key;
  const stage = stageOf(pipe, r);
  const st = stageDef(def, stage);
  const isFinal = !!st?.final;
  const days = daysInStage(pipe, r, now);
  const items = checklistFor(pipe, stage, r, now);
  const open = items.filter((x) => !x.done).length;
  const next = nextStepOf(pipe, r);
  const nextStage = nextStageOf(def, stage);
  const nextDef = nextStage ? stageDef(def, nextStage) : null;
  const ready = readyToAdvance(def, r, now);
  const task = nextTaskOf(r);
  const acts = (r.activities || []).slice(0, 3);
  const owner = recruiterName(ownerOf(pipe, r));
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { ref.current?.focus(); }, [r.id]);
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[data-modal-open]')) h.onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [h]);
  const nextLabel = nextDef?.final === 'handoff' ? (nextDef.label || nextDef.name) : nextStage ? `Move to ${nextStage}` : '';
  const lostStage = def.stages.find((s) => s.final === 'lost');
  const exitLabel = pipe === 'active' ? 'Quit / terminated…' : pipe === 'inactive' ? 'Do not rehire…' : `Mark ${lostStage?.name.toLowerCase()}…`;
  const exitStage = pipe === 'active' ? ACTIVE_STAGE.QUIT : lostStage?.name;

  return <aside ref={ref} tabIndex={-1} aria-label={`${r.name} quick peek`} data-peek={r.id} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: compact ? '100vw' : 404, zIndex: 75, background: '#fff', borderLeft: `1px solid ${T.border}`, boxShadow: '-12px 0 40px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', outline: 'none', animation: 'qhSheetIn .18s ease' }}>
    <div style={{ flex: 'none', padding: '16px 18px 12px', borderBottom: `1px solid ${T.hair}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <PersonAvatar name={r.name} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}><h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>{r.name}</h2>{r.example && <ExampleTag />}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap', fontSize: 12, color: T.muted }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600, color: T.text }}><span style={{ width: 8, height: 8, borderRadius: 99, background: st?.color || '#8E8E93' }} />{def.label} · {stage}</span>
            {!isFinal && <SlaChip days={days} level={recordSla(def, r, now)} title={st?.maxDays ? `SLA ${st.maxDays}d` : 'No SLA'} />}
            <span>· {owner}</span>
          </div>
        </div>
        <IconButton icon="x" label="Close quick peek" onClick={h.onClose} size={32} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 12 }}>
        {[['phone', 'Call', h.onCall], ['message', 'Text', h.onText], ['listChecks', 'Add task', h.onTask], ['externalLink', 'Profile', h.onOpenProfile]].map(([icon, label, fn]: any) =>
          <Hover key={label} as="button" type="button" onClick={fn} aria-label={label === 'Profile' ? 'Open full profile' : label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 0', borderRadius: 10, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', color: T.text }} hover={{ background: 'rgba(0,0,0,0.03)' }}><Icon name={icon} size={16} /><span style={{ fontSize: 10.5, fontWeight: 600, color: T.muted }}>{label}</span></Hover>)}
      </div>
      {!isFinal && nextLabel && <div style={{ marginTop: 10 }}>
        <SmallBtn label={nextLabel} icon="arrowRight" tone={ready ? 'primary' : 'default'} onClick={() => h.onMove(nextStage!)} style={{ width: '100%', height: 36, fontSize: 13 }} />
        {!ready && open > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 11.5, color: '#A05A00' }}><Icon name="alert" size={12} />{open} checklist item{open === 1 ? '' : 's'} still open — you'll be asked to confirm</div>}
      </div>}
      {isFinal && st?.final === 'lost' && <SmallBtn label={`Re-open in ${(def.stages.find((s) => !s.final) || { name: '' }).name}`} icon="repeat" onClick={() => h.onMove((r.lostFrom && def.stages.some((s) => s.name === r.lostFrom && !s.final)) ? r.lostFrom : def.stages[0].name)} style={{ width: '100%', height: 34, marginTop: 10 }} />}
    </div>

    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <section>
        <SectionLabel>Key facts</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '112px 1fr', rowGap: 6, columnGap: 10, fontSize: 12.5 }}>
          {facts(def, r, now).map(([k, v]) => <React.Fragment key={k}><span style={{ color: T.faint }}>{k}</span><span style={{ fontWeight: 550, minWidth: 0, overflowWrap: 'anywhere' }}>{v}</span></React.Fragment>)}
        </div>
      </section>

      {items.length > 0 && <section>
        <SectionLabel right={ready ? <ReadyBadge to={nextStage} /> : <span style={{ fontSize: 11.5, color: T.faint }}>{items.length - open}/{items.length} done</span>}>{stage} checklist</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {items.map((it, i) => <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderTop: i ? `1px solid ${T.hair}` : 'none', background: it.done ? '#fff' : '#FFFCF5' }}>
            <span aria-hidden style={{ width: 18, height: 18, flex: 'none', borderRadius: 99, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: it.done ? '#34C759' : '#fff', border: it.done ? 'none' : '1.5px solid rgba(0,0,0,0.2)', color: '#fff' }}>{it.done && <Icon name="check" size={12} />}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: it.done ? T.muted : T.text, textDecoration: it.done ? 'line-through' : 'none' }}>{it.label}</span>
            {!it.done && it.action && <SmallBtn label={it.action.label} onClick={() => (it.action!.kind === 'openProfile' ? h.onOpenProfile() : h.onAction(it.action!))} style={{ height: 26, padding: '0 9px', fontSize: 11.5 }} />}
          </div>)}
        </div>
      </section>}

      {!isFinal && <section>
        <SectionLabel>Next step</SectionLabel>
        {next ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: '#F5F6F8' }}>
          <Icon name="arrowRight" size={14} style={{ color: BLUE, flex: 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{next.title}</div>{next.due && <div style={{ fontSize: 11.5, color: +new Date(next.due) < now - 432e5 ? '#C62820' : T.faint }}>Due {fmtDay(next.due)}</div>}</div>
          <SmallBtn label="Done" icon="check" onClick={h.onCompleteNext} style={{ height: 28 }} />
        </div> : <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#A05A00', marginBottom: 8 }}><Icon name="alert" size={13} />No next step — pick one</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Array.from(new Set([suggestedNextStep(stage), pipe === 'leads' ? 'Call driver' : 'Check-in call', 'Follow up tomorrow'])).map((t) => <SmallBtn key={t} label={t} icon="plus" onClick={() => h.onSetNext(t)} style={{ height: 28 }} />)}
          </div>
        </div>}
      </section>}

      <section>
        <SectionLabel right={<button type="button" onClick={h.onTask} style={linkBtn}>+ Add task</button>}>Next task</SectionLabel>
        {task ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12, border: `1px solid ${T.border}` }}>
          <Icon name="listChecks" size={14} style={{ color: T.muted, flex: 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600 }}>{task.title}</div>{task.due && <div style={{ fontSize: 11.5, color: +new Date(task.due) < now - 432e5 ? '#C62820' : T.faint }}>Due {fmtDay(task.due)}</div>}</div>
          <SmallBtn label="Done" onClick={() => h.onCompleteTask(task.id)} style={{ height: 26, fontSize: 11.5 }} />
        </div> : <div style={{ fontSize: 12.5, color: T.faint }}>No open tasks.</div>}
      </section>

      <section>
        <SectionLabel right={<button type="button" onClick={h.onOpenProfile} style={linkBtn}>Full timeline</button>}>Recent activity</SectionLabel>
        {acts.length === 0 ? <div style={{ fontSize: 12.5, color: T.faint }}>No activity yet.</div> : acts.map((a: any, i: number) => <div key={a.id || i} style={{ display: 'flex', gap: 9, padding: '7px 0', borderTop: i ? `1px solid ${T.hair}` : 'none' }}>
          <span style={{ width: 22, height: 22, flex: 'none', borderRadius: 99, background: a.type === 'lifecycle' ? 'rgba(88,86,214,0.12)' : '#F2F2F7', color: a.type === 'lifecycle' ? '#5856D6' : T.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={ACT_ICON[a.type] || 'circle'} size={11} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5 }}>{a.title}</div>
            {a.detail && <div style={{ fontSize: 11.5, color: T.muted, overflowWrap: 'anywhere' }}>{a.detail}</div>}
            <div style={{ fontSize: 11, color: T.faint }}>{a.user} · {fmtShortAgo(a.at, now)}</div>
          </div>
        </div>)}
      </section>

      {!isFinal && exitStage && <button type="button" onClick={() => h.onMove(exitStage)} style={{ ...linkBtn, color: '#C62820', alignSelf: 'flex-start', padding: 0 }}>{exitLabel}</button>}
      {pipe === 'inactive' && stage !== INACTIVE_STAGE.DNR && <button type="button" onClick={() => h.onMove(INACTIVE_STAGE.REAPPLIED)} style={{ ...linkBtn, alignSelf: 'flex-start', padding: 0, marginTop: -8 }}>Driver re-applied → send to Hiring</button>}
      {pipe === 'leads' && stage !== LEAD_STAGE.QUALIFIED && !isFinal && <div style={{ fontSize: 11.5, color: T.faint, marginTop: -8 }}>Qualified leads move to Hiring in one click.</div>}
    </div>
  </aside>;
}
const linkBtn: React.CSSProperties = { border: 'none', background: 'transparent', color: BLUE, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 };
const ACT_ICON: Record<string, string> = { lead: 'plus', anna: 'sparkles', comm: 'phone', note: 'fileText', stage: 'arrowRight', assignment: 'users', document: 'fileText', task: 'listChecks', decision: 'checkCircle', archive: 'ban', consent: 'shield', system: 'alert', lifecycle: 'repeat', call: 'phone', text: 'message', email: 'mail', request: 'mail', offer: 'briefcase', compliance: 'shield', step: 'checkCircle', truck: 'truck', application: 'send', ai: 'sparkles' };
