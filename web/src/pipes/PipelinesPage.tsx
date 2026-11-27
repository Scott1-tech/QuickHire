import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon } from '../tasks/lib';
import { primaryBtn, Confirm } from '../esign/ui';
import { useRecruit } from '../recruit/store';
import { useHire, svc as hSvc } from '../hire/store';
import { RecruitDashboard, RecruitReports, RecruitArchive, RecruitAutomations } from '../recruit/views';
import { RecruitModals } from '../recruit/RecruitPipeline';
import { LeadProfile } from '../recruit/LeadProfile';
import { takePendingLead } from '../phone/nav';
import {
  PipeKey, PIPE_ORDER, ME, RECRUITERS, recruiterName, LEAD_LOST_REASONS, HIRING_LOST_REASONS, DNR_REASONS, RISK_REASONS,
  HIRING_STAGE, ACTIVE_STAGE, INACTIVE_STAGE,
} from './stages';
import {
  PIPE_META, Filters, matchesFilters, pipeStats, columnMetrics, lifecycleFunnel, planMove, missingForMove, stageOf,
  nextStepOf, suggestedNextStep, JUMP_TESTS, HOT_HINT, CheckAction, stageDef,
} from './lifecycle';
import * as S from './service';
import { Board } from './Board';
import { ListView, SortState } from './ListView';
import { Peek } from './Peek';
import { ReasonModal, QuitModal, RequirementsModal, TaskModal, TextModal, NoteModal, AddDriverModal } from './Modals';
import { UndoBar, SnackItem, Popover, MenuRow, MenuLabel, MenuSep, IconButton, useViewportWidth, BG, BLUE } from './ui';

/* ───────── remembered UI preferences ───────── */
type Chips = { mine: boolean; pastSla: boolean; noNext: boolean; ready: boolean; hot: boolean };
interface Prefs {
  pipe: PipeKey; view: 'board' | 'list'; chips: Chips; recruiter: string;
  stat: Record<PipeKey, string | null>; collapsed: Record<PipeKey, string[]>; sort: SortState;
}
const PREFS_KEY = 'qh_pipes_ui_v1';
const NO_CHIPS: Chips = { mine: false, pastSla: false, noNext: false, ready: false, hot: false };
const DEFAULT_PREFS: Prefs = { pipe: 'leads', view: 'board', chips: NO_CHIPS, recruiter: 'all', stat: { leads: null, hiring: null, active: null, inactive: null }, collapsed: { leads: [], hiring: [], active: [], inactive: [] }, sort: { key: 'days', dir: -1 } };
function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...raw, pipe: PIPE_ORDER.includes(raw.pipe) ? raw.pipe : 'leads', chips: { ...NO_CHIPS, ...(raw.chips || {}) }, stat: { ...DEFAULT_PREFS.stat, ...(raw.stat || {}) }, collapsed: { ...DEFAULT_PREFS.collapsed, ...(raw.collapsed || {}) }, sort: raw.sort?.key ? raw.sort : DEFAULT_PREFS.sort };
  } catch { return DEFAULT_PREFS; }
}

const CHIP_DEFS: { key: keyof Chips; label: string; icon: string; hint: (p: PipeKey) => string }[] = [
  { key: 'mine', label: 'Mine', icon: 'user', hint: () => `Assigned to ${recruiterName(ME)}` },
  { key: 'pastSla', label: 'Past SLA', icon: 'clock', hint: () => 'Longer in stage than the stage SLA' },
  { key: 'noNext', label: 'No next step', icon: 'alert', hint: () => 'Open records with no planned next step' },
  { key: 'ready', label: 'Ready to advance', icon: 'checkCircle', hint: () => 'Stage exit checklist complete' },
  { key: 'hot', label: 'Hot', icon: 'zap', hint: (p) => HOT_HINT[p] },
];

type UndoItem = SnackItem & { undo?: () => void };
const KINDS = ['success', 'info', 'warning', 'danger'];

export default function PipelinesPage({ go, openDriver, initialPipe, nonce = 0 }: { go: (p: string) => void; openDriver: (id: string) => void; initialPipe?: PipeKey; nonce?: number }) {
  useRecruit(); useHire();
  const vw = useViewportWidth();
  const compact = vw < 760;
  const [undo, setUndo] = React.useState<UndoItem | null>(null);
  // one calm snackbar for all feedback (also handed to the recruiting modals/views)
  const toast = React.useCallback((text: string, kind = 'success') => setUndo({ id: Math.random().toString(36).slice(2), text, canUndo: false, kind: (KINDS.includes(kind) ? kind : kind === 'error' ? 'danger' : 'info') as SnackItem['kind'] }), []);
  const [prefs, setPrefs] = React.useState<Prefs>(() => { const p = loadPrefs(); return initialPipe ? { ...p, pipe: initialPipe } : p; });
  const [q, setQ] = React.useState('');
  const [peekId, setPeekId] = React.useState<string | null>(null);
  const [openLeadId, setOpenLeadId] = React.useState<string | null>(null);
  const [subView, setSubView] = React.useState<null | 'dashboard' | 'reports' | 'archive' | 'automations'>(null);
  const [modal, setModal] = React.useState<any>(null);
  const [recruitModal, setRecruitModal] = React.useState<any>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ } }, [prefs]);
  React.useEffect(() => {
    if (initialPipe) { setPrefs((p) => ({ ...p, pipe: initialPipe })); setPeekId(null); setSubView(null); setOpenLeadId(null); }
    // The phone's "Open profile" for a lead: picked up after the reset above.
    const fromPhone = takePendingLead();
    if (fromPhone) { setPrefs((p) => ({ ...p, pipe: 'leads' })); setPeekId(null); setSubView(null); setOpenLeadId(fromPhone); }
  }, [nonce]); // eslint-disable-line

  const pipe = prefs.pipe;
  const P = S.pipes();
  const def = P[pipe];
  const all = S.records(pipe);
  const now = Date.now();
  const allLeads = S.allLeads(); const allDrivers = S.allDrivers();
  const stats = pipeStats(def, all, { allLeads, allDrivers, now });
  const statKey = prefs.stat[pipe];
  const statTest = statKey ? (stats.find((s) => s.key === statKey)?.test || JUMP_TESTS[statKey]) : undefined;
  const filters: Filters = { ...prefs.chips, recruiter: prefs.recruiter, q };
  const visible = all.filter((r) => matchesFilters(def, r, filters, now) && (!statTest || statTest(r)));
  const metrics = columnMetrics(def, all, S.handedOff(pipe), now);
  const funnel = lifecycleFunnel(allLeads, allDrivers);
  const peekRec = peekId ? all.find((r) => r.id === peekId) || null : null;
  const anyFilter = Object.values(prefs.chips).some(Boolean) || prefs.recruiter !== 'all' || !!q || !!statKey;

  const set = (patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch }));
  const switchPipe = (p: PipeKey, stat?: string | null) => { setPrefs((x) => ({ ...x, pipe: p, stat: stat !== undefined ? { ...x.stat, [p]: stat } : x.stat })); setPeekId(null); setSelected(new Set()); setSubView(null); };
  const toggleChip = (k: keyof Chips) => set({ chips: { ...prefs.chips, [k]: !prefs.chips[k] } });
  const clearFilters = () => { set({ chips: NO_CHIPS, recruiter: 'all', stat: { ...prefs.stat, [pipe]: null } }); setQ(''); };

  /* ───────── results → toast / undo bar ───────── */
  const commit = (res: S.ActionResult, view?: boolean) => {
    if (!res.ok) { toast(res.message, res.kind || 'warning'); return; }
    if (res.undo) {
      const extra = view && res.openPipe ? { label: `View in ${PIPE_META[res.openPipe].label}`, onClick: () => { switchPipe(res.openPipe!); if (res.id) setPeekId(res.id); setUndo(null); } } : undefined;
      setUndo({ id: Math.random().toString(36).slice(2), text: res.message, canUndo: true, kind: 'success', undo: res.undo.undo, extra });
    } else toast(res.message, res.kind || 'success');
  };
  const rec = (id: string) => S.record(pipe, id);

  /* ───────── moves ───────── */
  const requestMove = (id: string, stage: string) => {
    const r = rec(id); if (!r) return;
    const plan = planMove(def, r, stage, Date.now());
    if (plan.kind === 'noop') return;
    if (plan.kind === 'reason') return setModal({ kind: 'reason', id, stage });
    if (plan.kind === 'risk') return setModal({ kind: 'risk', id, stage });
    if (plan.kind === 'quit') return setModal({ kind: 'quit', id });
    if (plan.missing.length) return setModal({ kind: 'req', id, stage, handoff: plan.kind === 'handoff' });
    if (plan.kind === 'handoff') return doHandoff(id, []);
    commit(S.moveRecord(pipe, id, stage));
  };
  const doHandoff = (id: string, override: string[]) => { const res = S.handoff(pipe, id, override); if (res.ok && peekId === id) setPeekId(null); commit(res, true); };
  const handoffStage = def.stages.find((s) => s.final === 'handoff')?.name;
  const onHandoff = (id: string) => handoffStage && requestMove(id, handoffStage);

  const runAction = (id: string, a: CheckAction) => {
    if (a.kind === 'openProfile') return openProfile(id);
    if (a.kind === 'actionPlan') return setModal({ kind: 'plan', id });
    commit(S.runAction(pipe, id, a));
  };
  const openProfile = (id: string) => { if (pipe === 'leads') { setPeekId(null); setOpenLeadId(id); } else openDriver(id); };
  const textDefault = (r: any) => {
    const first = String(r.name).split(' ')[0]; const me = recruiterName(ME).split(' ')[0]; const carrier = String(r.carrier || 'GRAND ONE LLC').replace(/ (LLC|INC).*/i, '');
    if (pipe === 'leads') return `Hi ${first}, this is ${me} with ${carrier}. Thanks for your interest in our ${r.lane || 'CDL-A'} opening — do you have a few minutes to talk today?`;
    if (pipe === 'hiring') return `Hi ${first}, quick update on your application with ${carrier}: ${nextStepOf(pipe, r)?.title || 'we just need a couple of documents'}. Reply here with any questions.`;
    if (pipe === 'active') return `Hi ${first}, checking in — how are the truck, dispatch and home time going this week?`;
    return `Hi ${first}, it's ${me} from ${carrier}. We've improved pay and home time — would you be open to talking about coming back?`;
  };

  /* ───────── bulk ───────── */
  const selIds = visible.filter((r) => selected.has(r.id)).map((r) => r.id);
  const bulkMove = (stage: string) => {
    const st = stageDef(def, stage); if (!st || !selIds.length) return;
    if (st.final === 'lost') return setModal({ kind: 'reason', ids: selIds, stage });
    if (pipe === 'active' && stage === ACTIVE_STAGE.AT_RISK) return setModal({ kind: 'risk', ids: selIds, stage });
    const blocked = selIds.filter((id) => { const r = rec(id); return r && missingForMove(def, r, stage).length > 0; });
    if (blocked.length) return setModal({ kind: 'bulkReq', ids: selIds, stage, blocked: blocked.length });
    commit(S.bulkMove(pipe, selIds, stage)); setSelected(new Set());
  };

  /* ───────── primary action ───────── */
  const primary = pipe === 'leads' ? { label: 'New lead', onClick: () => setRecruitModal({ kind: 'new' }) } : { label: pipe === 'hiring' ? 'Add candidate' : pipe === 'active' ? 'Add driver' : 'Add former driver', onClick: () => setModal({ kind: 'add' }) };
  const createDriver = (v: any) => {
    const base = { name: v.name.trim(), phone: v.phone || '(555) 010-0000', email: v.email || `${v.name.toLowerCase().replace(/[^a-z]/g, '.')}@example.com`, carrier: v.carrier, cdlClass: v.cdlClass, ownerName: recruiterName(v.owner), lane: v.lane, position: 'Company Driver' };
    let d: any;
    if (pipe === 'hiring') d = hSvc.addDriver({ ...base, nextStep: { title: suggestedNextStep(HIRING_STAGE.APPLICATION), due: new Date(Date.now() + 864e5).toISOString(), status: 'open' } }, HIRING_STAGE.APPLICATION);
    else if (pipe === 'active') { d = hSvc.addDriver({ ...base, truckNo: v.truckNo || '' }, HIRING_STAGE.HIRED); S.startOnboarding(d.id); }
    else { const t = new Date().toISOString(); d = hSvc.addDriver({ ...base, lifecycle: 'inactive', inactiveStage: v.eligible ? INACTIVE_STAGE.INACTIVE : INACTIVE_STAGE.DNR, inactiveStageSince: t, inactiveSince: t, quitReason: v.reason, quitType: 'Quit', rehireEligible: !!v.eligible }, HIRING_STAGE.HIRED); }
    setModal(null); toast(`${d.name} added to ${def.label}`, 'success'); setPeekId(d.id);
  };

  /* ───────── full-page lead profile ───────── */
  if (openLeadId && S.record('leads', openLeadId)) {
    return <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <LeadProfile id={openLeadId} go={go} onClose={() => setOpenLeadId(null)} toast={toast} setModal={setRecruitModal} openDriver={openDriver} backLabel="Pipelines" />
      {recruitModal && <RecruitModals key={recruitModal.kind} modal={recruitModal} onClose={() => setRecruitModal(null)} toast={toast} onOpen={(id: string) => setOpenLeadId(id)} />}
      <UndoBar item={undo} onClose={() => setUndo(null)} onUndo={() => { undo?.undo?.(); setUndo(null); }} />
    </div>;
  }

  const pad = compact ? 12 : 24;
  return <div data-testid="pipelines" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: BG, padding: `${compact ? 14 : 20}px ${pad}px 0`, minWidth: 0 }}>
    {/* header */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 150 }}>
        <h1 style={{ margin: 0, fontSize: compact ? 21 : 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Pipelines</h1>
        {!compact && <p style={{ margin: '3px 0 0', fontSize: 13, color: T.muted }}>Every driver from first lead to rehire — one place, four linked pipelines.</p>}
      </div>
      {!subView && <div role="group" aria-label="View" style={{ display: 'inline-flex', gap: 2, padding: 3, background: T.segBg, borderRadius: 10 }}>
        {(['board', 'list'] as const).map((v) => <button key={v} type="button" aria-pressed={prefs.view === v} title={v === 'board' ? 'Board view' : 'List view'} onClick={() => set({ view: v })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: compact ? '0 9px' : '0 12px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: prefs.view === v ? '#fff' : 'transparent', color: prefs.view === v ? T.text : T.muted, boxShadow: prefs.view === v ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}><Icon name={v === 'board' ? 'columns' : 'list'} size={15} />{!compact && (v === 'board' ? 'Board' : 'List')}</button>)}
      </div>}
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <Hover as="button" type="button" aria-label="More pipeline tools" aria-haspopup="menu" onClick={() => setMenuOpen((o) => !o)} style={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${T.border}`, background: '#fff', color: T.muted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="more" size={18} /></Hover>
        <Popover open={menuOpen} onClose={() => setMenuOpen(false)} width={250}>
          <MenuLabel>Recruiting (Leads)</MenuLabel>
          <MenuRow icon="layout" label="Recruiter dashboard" onClick={() => { setMenuOpen(false); setSubView('dashboard'); }} />
          <MenuRow icon="barChart" label="Reports" onClick={() => { setMenuOpen(false); setSubView('reports'); }} />
          <MenuRow icon="ban" label="Lead archive" onClick={() => { setMenuOpen(false); setSubView('archive'); }} />
          <MenuRow icon="zap" label="Automations" onClick={() => { setMenuOpen(false); setSubView('automations'); }} />
          <MenuSep />
          <MenuRow icon="sparkles" label="Anna lead intake" onClick={() => { setMenuOpen(false); setRecruitModal({ kind: 'anna' }); }} />
          <MenuRow icon="settings" label="Lead stages & SLAs" onClick={() => { setMenuOpen(false); setRecruitModal({ kind: 'settings' }); }} />
          {S.exampleCount() > 0 && <><MenuSep /><MenuRow icon="trash" danger label={`Remove example data (${S.exampleCount()})`} onClick={() => { setMenuOpen(false); setModal({ kind: 'examples' }); }} /></>}
        </Popover>
      </span>
      {!subView && <Hover as="button" type="button" onClick={primary.onClick} style={{ ...primaryBtn, padding: compact ? '0 12px' : '0 16px' }} hover={{ background: '#0066D6' }}><Icon name="plus" size={16} />{primary.label}</Hover>}
    </div>

    {subView ? <SubView view={subView} onBack={() => setSubView(null)} onOpenLead={(id: string) => { switchPipe('leads'); setOpenLeadId(id); }} toast={toast} /> : <>
      {/* pipeline switcher + lifecycle strip */}
      <LifecycleSwitcher pipe={pipe} funnel={funnel} onPick={(p) => switchPipe(p)} compact={compact} />

      {/* stats strip */}
      <div role="group" aria-label={`${def.label} stats`} style={{ display: 'flex', gap: 8, marginTop: 12, flex: 'none', overflowX: 'auto', paddingBottom: 2 }}>
        {stats.map((s) => {
          const on = statKey === s.key; const clickable = !!(s.test || s.jump);
          const tone = { good: '#248A3D', warn: '#A05A00', bad: '#C62820', neutral: T.text }[s.tone || 'neutral'];
          return <button key={s.key} type="button" data-stat={s.key} aria-pressed={on} disabled={!clickable} title={s.hint || (clickable ? `Filter: ${s.label}` : s.label)}
            onClick={() => { if (s.jump) switchPipe(s.jump.pipe, s.jump.stat); else if (s.test) set({ stat: { ...prefs.stat, [pipe]: on ? null : s.key } }); }}
            style={{ flex: '1 0 128px', minWidth: 128, textAlign: 'left', padding: '9px 12px', borderRadius: 12, cursor: clickable ? 'pointer' : 'default', border: `1px solid ${on ? BLUE : T.border}`, background: on ? 'rgba(0,122,255,0.06)' : '#fff', boxShadow: on ? 'none' : '0 1px 2px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: s.value.length > 8 ? 14.5 : 19, fontWeight: 700, letterSpacing: '-0.02em', color: on ? BLUE : tone, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.25 }}>{s.value}</div>
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 1, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>{s.label}{s.jump && <Icon name="arrowRight" size={11} />}</div>
          </button>;
        })}
      </div>

      {/* filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', flex: 'none', flexWrap: compact ? 'nowrap' : 'wrap', overflowX: compact ? 'auto' : 'visible', paddingBottom: compact ? 2 : 0 }}>
        <div style={{ position: 'relative', width: compact ? 170 : 230, flex: 'none' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.faint, display: 'flex' }}><Icon name="search" size={15} /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" placeholder={`Search ${def.label.toLowerCase()}…`} style={{ width: '100%', height: 34, borderRadius: 10, border: `1px solid ${T.border}`, padding: '0 10px 0 32px', fontSize: 13, outline: 'none', background: '#fff' }} />
        </div>
        {CHIP_DEFS.map((c) => {
          const on = prefs.chips[c.key];
          const cnt = all.filter((r) => matchesFilters(def, r, { [c.key]: true, recruiter: prefs.recruiter, q } as Filters, now)).length;
          return <button key={c.key} type="button" aria-pressed={on} data-chip={c.key} title={c.hint(pipe)} onClick={() => toggleChip(c.key)} style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 11px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, border: `1px solid ${on ? BLUE : 'rgba(0,0,0,0.10)'}`, background: on ? 'rgba(0,122,255,0.08)' : '#fff', color: on ? '#0066CC' : '#3a3a3c' }}>
            <Icon name={c.icon} size={13} />{c.label}<span style={{ fontSize: 11.5, opacity: 0.65 }}>{cnt}</span>
          </button>;
        })}
        <select aria-label="Recruiter" value={prefs.recruiter} onChange={(e) => set({ recruiter: e.target.value })} style={{ flex: 'none', height: 32, borderRadius: 999, border: `1px solid ${prefs.recruiter !== 'all' ? BLUE : 'rgba(0,0,0,0.10)'}`, background: prefs.recruiter !== 'all' ? 'rgba(0,122,255,0.08)' : '#fff', color: prefs.recruiter !== 'all' ? '#0066CC' : '#3a3a3c', padding: '0 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          <option value="all">All recruiters</option>
          {RECRUITERS.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {anyFilter && <button type="button" onClick={clearFilters} style={{ flex: 'none', border: 'none', background: 'transparent', color: BLUE, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Clear filters</button>}
        {anyFilter && <span style={{ flex: 'none', fontSize: 12, color: T.faint }}>{visible.length} of {all.length}</span>}
      </div>

      {/* board / list */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingRight: peekRec && !compact ? 404 : 0 }}>
        {prefs.view === 'board'
          ? <Board def={def} records={visible} metrics={metrics} recent={S.recentHandoffs(pipe)} collapsed={prefs.collapsed[pipe] || []} peekId={peekId} compact={compact}
            onToggleCollapse={(st) => { const cur = prefs.collapsed[pipe] || []; set({ collapsed: { ...prefs.collapsed, [pipe]: cur.includes(st) ? cur.filter((x) => x !== st) : [...cur, st] } }); }}
            onOpen={setPeekId} onMove={requestMove} onCall={(id) => commit(S.call(pipe, id))} onText={(id) => setModal({ kind: 'text', id })} onTask={(id) => setModal({ kind: 'task', id })}
            onHandoff={onHandoff} onOpenElsewhere={(p, id) => { switchPipe(p); setPeekId(id); }} />
          : <ListView def={def} rows={visible} sort={prefs.sort} onSort={(sort) => set({ sort })} selected={selected} peekId={peekId}
            onSelect={(ids, on) => setSelected((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; })}
            onOpen={setPeekId} onBulkMove={bulkMove} onBulkAssign={(owner) => { commit(S.bulkAssign(pipe, selIds, owner)); setSelected(new Set()); }} onBulkTask={() => setModal({ kind: 'task', ids: selIds })} />}
      </div>
    </>}

    {peekRec && !subView && <Peek def={def} r={peekRec} compact={compact} h={{
      onClose: () => setPeekId(null),
      onCall: () => commit(S.call(pipe, peekRec.id)),
      onText: () => setModal({ kind: 'text', id: peekRec.id }),
      onTask: () => setModal({ kind: 'task', id: peekRec.id }),
      onOpenProfile: () => openProfile(peekRec.id),
      onMove: (stage) => requestMove(peekRec.id, stage),
      onAction: (a) => runAction(peekRec.id, a),
      onSetNext: (t) => commit(S.setNextStep(pipe, peekRec.id, t)),
      onCompleteNext: () => commit(S.completeNextStep(pipe, peekRec.id)),
      onCompleteTask: (tid) => commit(S.completeTask(pipe, peekRec.id, tid)),
    }} />}

    <Modals modal={modal} setModal={setModal} pipe={pipe} def={def} commit={commit} doHandoff={doHandoff} runAction={runAction} createDriver={createDriver} textDefault={textDefault} clearSel={() => setSelected(new Set())} />
    {recruitModal && <RecruitModals key={recruitModal.kind} modal={recruitModal} onClose={() => setRecruitModal(null)} toast={toast} onOpen={(id: string) => { switchPipe('leads'); setPeekId(id); }} />}
    <UndoBar item={undo} onClose={() => setUndo(null)} onUndo={() => { undo?.undo?.(); toast('Undone', 'info'); }} />
  </div>;
}

/* ───────── modal router ───────── */
function Modals({ modal, setModal, pipe, def, commit, doHandoff, runAction, createDriver, textDefault, clearSel }: any) {
  if (!modal) return null;
  const close = () => setModal(null);
  const r = modal.id ? S.record(pipe, modal.id) : null;
  const many: string[] | undefined = modal.ids;
  const who = r?.name || (many ? `${many.length} records` : '');
  if (modal.kind === 'reason') {
    const reasons = pipe === 'leads' ? LEAD_LOST_REASONS : pipe === 'hiring' ? HIRING_LOST_REASONS : DNR_REASONS;
    return <ReasonModal title={`Move ${who} to ${modal.stage}`} subtitle="A reason is required for closed records" reasons={reasons} okLabel={`Move to ${modal.stage}`}
      onClose={close} onConfirm={(reason, note) => { close(); if (many) { commit(S.bulkMove(pipe, many, modal.stage, { reason, note })); clearSel(); } else commit(S.moveRecord(pipe, modal.id, modal.stage, { reason, note })); }} />;
  }
  if (modal.kind === 'risk') return <ReasonModal title={`Flag ${who} as at risk`} subtitle="What's driving the risk? This shows on the card." reasons={RISK_REASONS} okLabel="Flag at risk" danger={false}
    onClose={close} onConfirm={(reason, note) => { close(); if (many) { commit(S.bulkMove(pipe, many, modal.stage, { reason, note })); clearSel(); } else commit(S.moveRecord(pipe, modal.id, modal.stage, { reason, note })); }} />;
  if (modal.kind === 'quit' && r) return <QuitModal name={r.name} onClose={close} onConfirm={(qi) => { close(); commit(S.markQuit(r.id, qi), true); }} />;
  if (modal.kind === 'req' && r) {
    const missing = missingForMove(def, r, modal.stage);
    const st = stageDef(def, modal.stage);
    return <RequirementsModal name={r.name} target={st?.label || modal.stage} missing={missing} onClose={close} onAction={(a) => runAction(r.id, a)}
      onConfirm={(override) => { close(); if (modal.handoff) doHandoff(r.id, override); else commit(S.moveRecord(pipe, r.id, modal.stage, { override })); }} />;
  }
  if (modal.kind === 'bulkReq') return <Confirm title={`Move ${many?.length} to ${modal.stage}?`} body={`${modal.blocked} of ${many?.length} selected still have open requirements for ${modal.stage}. Move them anyway? Open items are logged on each timeline, and you can undo.`} confirmLabel="Move anyway"
    onClose={close} onConfirm={() => { commit(S.bulkMove(pipe, many || [], modal.stage, { override: ['bulk move'] })); clearSel(); }} />;
  if (modal.kind === 'task') return <TaskModal name={who} count={many?.length} defaultTitle={r ? (nextStepOf(pipe, r)?.title || suggestedNextStep(stageOf(pipe, r))) : 'Follow up'} onClose={close}
    onConfirm={(p) => { close(); if (many) { commit(S.bulkTask(pipe, many, p.title, p.due)); clearSel(); } else commit(S.addTask(pipe, modal.id, p)); }} />;
  if (modal.kind === 'text' && r) return <TextModal name={r.name} phone={r.phone} defaultBody={textDefault(r)} onClose={close} onSend={(body) => { close(); commit(S.text(pipe, r.id, body)); }} />;
  if (modal.kind === 'plan' && r) return <NoteModal title={`Retention plan — ${r.name}`} label="What did you agree on?" placeholder="e.g. Home every other weekend; dispatcher change to Mark; CPM review in 30 days" onClose={close} onConfirm={(t) => { close(); commit(S.runAction(pipe, r.id, { kind: 'actionPlan', label: '', arg: t })); }} />;
  if (modal.kind === 'add') return <AddDriverModal pipe={pipe} onClose={close} onCreate={createDriver} />;
  if (modal.kind === 'examples') return <Confirm title="Remove example data?" body={`Removes the ${S.exampleCount()} records marked “Example” from Leads, Hiring, Active and Inactive. Your own records are untouched, and you can undo right after.`} confirmLabel="Remove" danger onClose={close} onConfirm={() => commit(S.removeExamples())} />;
  return null;
}

/* ───────── switcher (doubles as the lifecycle strip) ───────── */
function LifecycleSwitcher({ pipe, funnel, onPick, compact }: { pipe: PipeKey; funnel: ReturnType<typeof lifecycleFunnel>; onPick: (p: PipeKey) => void; compact: boolean }) {
  const conv: (string | null)[] = [
    funnel.leadToHiring == null ? null : `${funnel.leadToHiring}%`,
    funnel.hiringToActive == null ? null : `${funnel.hiringToActive}%`,
    funnel.churn == null ? null : `${funnel.churn}% churn`,
  ];
  const tips = ['Leads moved to Hiring', 'Candidates who started as drivers', 'Hired drivers who became inactive'];
  return <nav aria-label="Lifecycle pipelines" style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 14, flex: 'none', overflowX: 'auto', paddingBottom: 2 }}>
    <div role="tablist" style={{ display: 'flex', alignItems: 'center', gap: 0, padding: 3, background: '#E9EBEF', borderRadius: 12 }}>
      {PIPE_ORDER.map((k, i) => {
        const on = k === pipe; const m = PIPE_META[k];
        return <React.Fragment key={k}>
          {i > 0 && <span title={tips[i - 1]} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: compact ? '0 3px' : '0 7px', fontSize: 11, fontWeight: 650, color: T.faint, whiteSpace: 'nowrap', flex: 'none' }}>{!compact && conv[i - 1]}<Icon name="chevronRight" size={12} /></span>}
          <button type="button" role="tab" aria-selected={on} data-pipe={k} onClick={() => onPick(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: compact ? '0 10px' : '0 14px', border: 'none', borderRadius: 9, cursor: 'pointer', flex: 'none', background: on ? '#fff' : 'transparent', boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none', color: on ? T.text : T.muted, fontSize: 13.5, fontWeight: on ? 700 : 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: m.color, flex: 'none' }} />{m.label}
            <span style={{ fontSize: 12, fontWeight: 650, color: on ? m.color : T.faint, minWidth: 14 }}>{funnel.counts[k]}</span>
          </button>
        </React.Fragment>;
      })}
    </div>
  </nav>;
}

/* ───────── secondary recruiting views (overflow menu) ───────── */
function SubView({ view, onBack, onOpenLead, toast }: any) {
  const title = ({ dashboard: 'Recruiter dashboard', reports: 'Recruiting reports', archive: 'Lead archive', automations: 'Lead automations' } as any)[view];
  return <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 4px', flex: 'none' }}>
      <IconButton icon="chevronLeft" label="Back to pipelines" onClick={onBack} size={32} />
      <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
    </div>
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 2px 24px' }}>
      {view === 'dashboard' && <RecruitDashboard onOpen={onOpenLead} />}
      {view === 'reports' && <RecruitReports />}
      {view === 'archive' && <RecruitArchive onOpen={onOpenLead} toast={toast} />}
      {view === 'automations' && <RecruitAutomations toast={toast} />}
    </div>
  </div>;
}
