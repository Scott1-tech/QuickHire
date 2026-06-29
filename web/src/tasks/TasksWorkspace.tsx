import React from 'react';
import { Hover } from '../lib/dc';
import {
  T, Icon, Btn, SegTabs, FilterSelect, Menu, MenuItem, TagChip, Avatar,
  STATUS, STATUS_ORDER, PRIORITY, PRIORITY_ORDER, SOURCE, dueInfo, iso, addDays,
  TasksCtx, useToasts, ToastHost,
} from './lib';
import { SEED_TASKS, SEED_AUTOMATIONS, TEMPLATES, PEOPLE, CARRIERS, TAGS, ME, nameOf } from './data';
import { ListView, BoardView, CalendarView, TimelineView, MyWorkView, AutomationsView } from './views';
import { TaskDetail, NewTaskModal, TemplatesDrawer } from './components';

const EMPTY_FILTERS = { search: '', assignee: '', status: '', priority: '', due: '', carrier: '', related: '', source: '', tags: [] as string[] };

function applyFilters(tasks: any[], f: any, savedView: string, me: any) {
  return tasks.filter((t) => {
    if (savedView === 'me' && t.assignee !== me.initials) return false;
    if (savedView === 'overdue' && !(dueInfo(t).group === 'overdue' && t.status !== 'complete')) return false;
    if (savedView === 'today' && dueInfo(t).group !== 'today') return false;
    if (savedView === 'waiting' && t.status !== 'waiting') return false;
    if (savedView === 'compliance' && !(t.source === 'compliance' || t.tags.includes('Compliance'))) return false;
    if (savedView === 'docusign' && !(t.source === 'docusign' || t.tags.includes('DocuSign'))) return false;
    if (savedView === 'carrier' && !(t.relatedType === 'carrier' || t.source === 'carrier' || t.tags.includes('Carrier Setup'))) return false;
    if (f.search) { const q = f.search.toLowerCase(); if (!(t.title.toLowerCase().includes(q) || (t.related || '').toLowerCase().includes(q) || (t.carrier || '').toLowerCase().includes(q))) return false; }
    if (f.assignee && t.assignee !== f.assignee) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.due && dueInfo(t).group !== f.due) return false;
    if (f.carrier && t.carrier !== f.carrier) return false;
    if (f.related && t.relatedType !== f.related) return false;
    if (f.source && t.source !== f.source) return false;
    if (f.tags.length && !f.tags.some((tg: string) => t.tags.includes(tg))) return false;
    return true;
  });
}

export default function TasksWorkspace() {
  const [view, setView] = React.useState('list');
  const [savedView, setSavedView] = React.useState('all');
  const [grouping, setGrouping] = React.useState('due');
  const [filters, setFilters] = React.useState<any>({ ...EMPTY_FILTERS });
  const [tasks, setTasks] = React.useState<any[]>(SEED_TASKS);
  const [automations, setAutomations] = React.useState<any[]>(SEED_AUTOMATIONS);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [newOpen, setNewOpen] = React.useState(false);
  const [tplOpen, setTplOpen] = React.useState(false);
  const { toasts, toast } = useToasts();

  const setF = (patch: any) => setFilters((s: any) => ({ ...s, ...patch }));
  const mkAct = (text: string) => ({ id: 'a' + Date.now() + Math.random(), who: ME.name, text, time: iso(new Date()) });

  const ctx = React.useMemo(() => ({
    me: ME,
    openTask: (id: string) => setDetailId(id),
    closeTask: () => setDetailId(null),
    toast,
    updateTask: (id: string, patch: any) => setTasks((ts) => ts.map((t) => {
      if (t.id !== id) return t;
      const act: any[] = [];
      if (patch.status && patch.status !== t.status) act.push(mkAct('set status to ' + STATUS[patch.status].label));
      if (patch.priority && patch.priority !== t.priority) act.push(mkAct('set priority to ' + PRIORITY[patch.priority].label));
      if ('due' in patch && patch.due !== t.due) act.push(mkAct('changed the due date'));
      if (patch.assignee && patch.assignee !== t.assignee) act.push(mkAct('reassigned to ' + nameOf(patch.assignee)));
      return { ...t, ...patch, activity: [...t.activity, ...act] };
    })),
    toggleComplete: (id: string) => setTasks((ts) => ts.map((t) => t.id === id ? { ...t, status: t.status === 'complete' ? 'todo' : 'complete', activity: [...t.activity, mkAct(t.status === 'complete' ? 'reopened this task' : 'completed this task')] } : t)),
    deleteTask: (id: string) => { setTasks((ts) => ts.filter((t) => t.id !== id)); setDetailId((d) => (d === id ? null : d)); toast('Task deleted', 'warning'); },
    duplicateTask: (id: string) => setTasks((ts) => { const t = ts.find((x) => x.id === id); if (!t) return ts; const copy = { ...t, id: 'tk' + Date.now(), title: t.title + ' (copy)', status: 'todo', activity: [mkAct('created this task')] }; toast('Task duplicated', 'success'); return [...ts, copy]; }),
    addComment: (id: string, text: string, mentions: string[] = []) => {
      setTasks((ts) => ts.map((t) => t.id === id ? { ...t, comments: [...t.comments, { id: 'm' + Date.now(), author: ME.name, text, time: iso(new Date()), mentions, replies: [] }], activity: [...t.activity, mkAct('added a comment')] } : t));
      if (mentions.length) toast('Notified ' + mentions.join(', '), 'info');
    },
    addReply: (taskId: string, commentId: string, text: string, mentions: string[] = []) => {
      setTasks((ts) => ts.map((t) => t.id === taskId ? { ...t, comments: t.comments.map((c: any) => c.id === commentId ? { ...c, replies: [...(c.replies || []), { id: 'r' + Date.now(), author: ME.name, text, time: iso(new Date()), mentions }] } : c), activity: [...t.activity, mkAct('replied to a comment')] } : t));
      if (mentions.length) toast('Notified ' + mentions.join(', '), 'info');
    },
  }), [toast]);

  const filtered = React.useMemo(() => applyFilters(tasks, filters, savedView, ME), [tasks, filters, savedView]);
  const detailTask = detailId ? tasks.find((t) => t.id === detailId) : null;

  // keyboard: N for new task
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as any).isContentEditable)) return;
      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); setNewOpen(true); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const createTask = (data: any) => {
    const t = { id: 'tk' + Date.now(), title: data.title, description: data.description || '', status: data.status || 'todo', assignee: data.assignee || 'NP', priority: data.priority || 'normal', due: data.due || null, start: null, relatedType: data.relatedType || null, related: data.related || null, carrier: data.carrier || null, source: 'manual', tags: data.tags || [], checklist: data.checklist || [], subtasks: [], comments: [], attachments: [], watching: false, createdBy: ME.name, createdDate: iso(new Date()), activity: [mkAct('created this task')] };
    setTasks((ts) => [t, ...ts]); setNewOpen(false); toast('Task created', 'success'); setDetailId(t.id);
  };
  const useTemplate = (tpl: any) => {
    const t = { id: 'tk' + Date.now(), title: tpl.name, description: '', status: 'todo', assignee: tpl.assignee, priority: 'normal', due: null, start: null, relatedType: null, related: null, carrier: null, source: 'manual', tags: [tpl.category].filter((c) => TAGS.includes(c)), checklist: tpl.checklist.map((c: string, i: number) => ({ id: 'c' + i, text: c, done: false })), subtasks: [], comments: [], attachments: [], watching: false, createdBy: ME.name, createdDate: iso(new Date()), activity: [mkAct('created this task from a template')] };
    setTasks((ts) => [t, ...ts]); setTplOpen(false); toast('Task created from template', 'success'); setDetailId(t.id);
  };

  // selection helpers
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleMany = (ids: string[], on: boolean) => setSelected((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  const clearSel = () => setSelected(new Set());
  const bulk = (patch: any, msg: string) => { setTasks((ts) => ts.map((t) => selected.has(t.id) ? { ...t, ...patch } : t)); toast(msg, 'success'); clearSel(); };
  const bulkDelete = () => { setTasks((ts) => ts.filter((t) => !selected.has(t.id))); toast(`${selected.size} tasks deleted`, 'warning'); clearSel(); };

  const counts = {
    all: tasks.length,
    me: tasks.filter((t) => t.assignee === ME.initials).length,
    overdue: tasks.filter((t) => dueInfo(t).group === 'overdue' && t.status !== 'complete').length,
    today: tasks.filter((t) => dueInfo(t).group === 'today').length,
    waiting: tasks.filter((t) => t.status === 'waiting').length,
  } as any;

  const savedViews = [
    { key: 'all', label: 'All Tasks' }, { key: 'me', label: 'Assigned to Me' }, { key: 'overdue', label: 'Overdue' },
    { key: 'today', label: 'Due Today' }, { key: 'waiting', label: 'Waiting' }, { key: 'compliance', label: 'Compliance' },
    { key: 'docusign', label: 'DocuSign' }, { key: 'carrier', label: 'Carrier Setup' },
  ];

  const tabs = [
    { key: 'list', label: 'List', icon: 'list' }, { key: 'board', label: 'Board', icon: 'columns' },
    { key: 'calendar', label: 'Calendar', icon: 'calendar' }, { key: 'timeline', label: 'Timeline', icon: 'gantt' },
    { key: 'mywork', label: 'My Work', icon: 'user' }, { key: 'automations', label: 'Automations', icon: 'zap' },
  ];

  const showFilters = ['list', 'board', 'calendar', 'timeline'].includes(view);
  const anyFilter = filters.search || filters.assignee || filters.status || filters.priority || filters.due || filters.carrier || filters.related || filters.source || filters.tags.length || savedView !== 'all';

  const EmptyState = ({ icon, title, text }: any) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 20px', textAlign: 'center' }}>
      <span style={{ width: 56, height: 56, borderRadius: 16, background: '#F2F2F7', color: T.faint, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><Icon name={icon} size={26} /></span>
      <div style={{ fontSize: 17, fontWeight: 650, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: T.muted, maxWidth: 360, marginBottom: 18 }}>{text}</div>
      <Btn variant="primary" icon="plus" onClick={() => setNewOpen(true)}>New Task</Btn>
    </div>
  );

  let content: React.ReactNode;
  if (view === 'automations') content = <AutomationsView automations={automations} onToggle={(id: string) => { setAutomations((a) => a.map((x) => x.id === id ? { ...x, enabled: !x.enabled } : x)); }} />;
  else if (view === 'mywork') content = <MyWorkView tasks={filtered} me={ME} />;
  else if (filtered.length === 0) content = <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14 }}><EmptyState icon="listChecks" title="No tasks here." text="Create a task or use a template to start tracking work." /></div>;
  else if (view === 'list') content = <ListView tasks={filtered} grouping={grouping} selected={selected} onToggle={toggleSel} onToggleMany={toggleMany} />;
  else if (view === 'board') content = <BoardView tasks={filtered} />;
  else if (view === 'calendar') content = <CalendarView tasks={filtered} />;
  else if (view === 'timeline') content = <TimelineView tasks={filtered} />;

  return <TasksCtx.Provider value={ctx}>
    <div style={{ minHeight: '100%', background: T.bg }}>
      {/* page header */}
      <div style={{ padding: '24px 28px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>Tasks</h1>
            <p style={{ margin: '6px 0 0', fontSize: 14.5, color: T.muted }}>Manage recruiting, compliance, carrier setup, and follow-up work.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
            <Btn variant="primary" icon="plus" onClick={() => setNewOpen(true)}>New Task</Btn>
            <Btn variant="secondary" icon="listChecks" onClick={() => setTplOpen(true)}>Templates</Btn>
            <Btn variant="secondary" icon="zap" onClick={() => setView('automations')}>Automations</Btn>
            <Btn variant="secondary" icon="download" onClick={() => toast('Export started · tasks.csv', 'success')}>Export</Btn>
            <Menu align="right" width={190} trigger={<Btn variant="ghost" style={{ width: 36, padding: 0, justifyContent: 'center', border: `1px solid rgba(0,0,0,0.12)`, color: T.muted }}><Icon name="more" size={18} /></Btn>}>
              {(close: any) => <>
                <MenuItem icon="inbox" label="Import tasks" onClick={() => { toast('Import tasks', 'info'); close(); }} />
                <MenuItem icon="bell" label="Notification settings" onClick={() => { toast('Notifications', 'info'); close(); }} />
                <MenuItem icon="settings" label="Workspace settings" onClick={() => { toast('Workspace settings', 'info'); close(); }} />
              </>}
            </Menu>
          </div>
        </div>

        {/* tabs + group-by */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 14px' }}>
          <SegTabs value={view} onChange={setView} tabs={tabs} />
          <div style={{ flex: 1 }} />
          {view === 'list' && <Menu align="right" width={190} trigger={<Hover as="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 12px', borderRadius: 10, border: `1px solid rgba(0,0,0,0.10)`, background: '#fff', color: '#3a3a3c', fontSize: 13, fontWeight: 600, cursor: 'pointer' }} hover={{ borderColor: 'rgba(0,0,0,0.18)' }}><Icon name="layout" size={15} />Group: {({ status: 'Status', due: 'Due Date', assignee: 'Assignee', carrier: 'Carrier', none: 'None' } as any)[grouping]}<Icon name="chevronDown" size={14} /></Hover>}>
            {(close: any) => [['due', 'Due Date'], ['status', 'Status'], ['assignee', 'Assignee'], ['carrier', 'Carrier'], ['none', 'No grouping']].map(([k, l]) => <MenuItem key={k} label={l} onClick={() => { setGrouping(k); close(); }} trailing={grouping === k ? <Icon name="check" size={14} style={{ color: '#007AFF' }} /> : null} />)}
          </Menu>}
        </div>

        {/* saved views */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {savedViews.map((s) => { const on = savedView === s.key; const c = counts[s.key]; return (
            <Hover as="button" key={s.key} onClick={() => setSavedView(s.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 999, border: on ? '1px solid #007AFF' : `1px solid rgba(0,0,0,0.10)`, background: on ? 'rgba(0,122,255,0.08)' : '#fff', color: on ? '#007AFF' : '#3a3a3c', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }} hover={on ? {} : { background: 'rgba(0,0,0,0.03)' }}>
              {s.label}{c != null && <span style={{ opacity: 0.7 }}>{c}</span>}
            </Hover>); })}
        </div>

        {/* filters */}
        {showFilters && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px', background: '#fff', border: `1px solid rgba(0,0,0,0.10)`, borderRadius: 10, width: 240 }}>
            <Icon name="search" size={15} style={{ color: T.faint }} />
            <input value={filters.search} onChange={(e) => setF({ search: e.target.value })} placeholder="Search tasks" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontFamily: 'inherit', background: 'transparent' }} />
          </div>
          <FilterSelect icon="user" label="Assignee" value={filters.assignee} onChange={(v: string) => setF({ assignee: v })} options={[{ value: '', label: 'Anyone' }, ...PEOPLE.map((p) => ({ value: p.initials, label: p.name }))]} />
          <FilterSelect icon="circle" label="Status" value={filters.status} onChange={(v: string) => setF({ status: v })} options={[{ value: '', label: 'Any status' }, ...STATUS_ORDER.map((k) => ({ value: k, label: STATUS[k].label }))]} />
          <FilterSelect icon="flag" label="Priority" value={filters.priority} onChange={(v: string) => setF({ priority: v })} options={[{ value: '', label: 'Any priority' }, ...PRIORITY_ORDER.map((k) => ({ value: k, label: PRIORITY[k].label }))]} />
          <FilterSelect icon="calendar" label="Due" value={filters.due} onChange={(v: string) => setF({ due: v })} options={[{ value: '', label: 'Any due' }, { value: 'overdue', label: 'Overdue' }, { value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' }, { value: 'week', label: 'This Week' }, { value: 'later', label: 'Later' }, { value: 'none', label: 'No Due Date' }]} />
          <FilterSelect icon="building" label="Carrier" value={filters.carrier} onChange={(v: string) => setF({ carrier: v })} options={[{ value: '', label: 'Any carrier' }, ...CARRIERS.map((c) => ({ value: c, label: c }))]} />
          <FilterSelect icon="link" label="Related" value={filters.related} onChange={(v: string) => setF({ related: v })} options={[{ value: '', label: 'Any type' }, { value: 'candidate', label: 'Candidate' }, { value: 'driver', label: 'Driver' }, { value: 'carrier', label: 'Carrier' }, { value: 'truck', label: 'Truck' }, { value: 'document', label: 'Document' }, { value: 'docusign', label: 'DocuSign' }]} />
          <FilterSelect icon="zap" label="Source" value={filters.source} onChange={(v: string) => setF({ source: v })} options={[{ value: '', label: 'Any source' }, ...Object.keys(SOURCE).map((k) => ({ value: k, label: SOURCE[k].label }))]} />
          <Menu width={200} trigger={<Hover as="div" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 12px', borderRadius: 10, border: `1px solid ${filters.tags.length ? 'rgba(0,122,255,0.4)' : 'rgba(0,0,0,0.10)'}`, background: filters.tags.length ? 'rgba(0,122,255,0.06)' : '#fff', color: filters.tags.length ? '#0066CC' : '#3a3a3c', fontSize: 13, fontWeight: 600, cursor: 'pointer' }} hover={{ borderColor: 'rgba(0,0,0,0.18)' }}><Icon name="tag" size={15} />{filters.tags.length ? `${filters.tags.length} tags` : 'Tags'}<Icon name="chevronDown" size={14} /></Hover>}>
            {() => TAGS.map((tg) => { const on = filters.tags.includes(tg); return <MenuItem key={tg} label={tg} onClick={() => setF({ tags: on ? filters.tags.filter((x: string) => x !== tg) : [...filters.tags, tg] })} trailing={on ? <Icon name="check" size={14} style={{ color: '#007AFF' }} /> : null} />; })}
          </Menu>
          {anyFilter && <Hover as="button" onClick={() => { setFilters({ ...EMPTY_FILTERS }); setSavedView('all'); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 34, padding: '0 11px', borderRadius: 10, border: 'none', background: 'transparent', color: '#C62820', fontSize: 13, fontWeight: 600, cursor: 'pointer' }} hover={{ background: 'rgba(255,59,48,0.06)' }}><Icon name="x" size={14} />Clear</Hover>}
        </div>}
      </div>

      {/* bulk action bar */}
      {selected.size > 0 && <div style={{ position: 'sticky', top: 0, zIndex: 40, padding: '0 28px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#1D1D1F', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', animation: 'qhSlideUp .2s ease' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{selected.size} selected</span>
          <div style={{ flex: 1 }} />
          {[
            ['Complete', () => bulk({ status: 'complete' }, `${selected.size} tasks completed`)],
          ].map(([l, fn]: any) => <button key={l} onClick={fn} style={{ height: 30, padding: '0 12px', fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', background: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>{l}</button>)}
          <Menu align="right" width={180} trigger={<button style={{ height: 30, padding: '0 12px', fontSize: 12.5, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.14)', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Status</button>}>
            {(close: any) => STATUS_ORDER.map((k) => <MenuItem key={k} label={STATUS[k].label} onClick={() => { bulk({ status: k }, `Status changed for ${selected.size} tasks`); close(); }} />)}
          </Menu>
          <Menu align="right" width={200} trigger={<button style={{ height: 30, padding: '0 12px', fontSize: 12.5, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.14)', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Assign</button>}>
            {(close: any) => PEOPLE.map((p) => <Hover key={p.initials} as="button" onClick={() => { bulk({ assignee: p.initials }, `Assigned ${selected.size} tasks to ${p.name}`); close(); }} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', height: 34, padding: '0 10px', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', fontSize: 13 }} hover={{ background: 'rgba(0,0,0,0.05)' }}><Avatar name={p.name} size={22} />{p.name}</Hover>)}
          </Menu>
          <Menu align="right" width={180} trigger={<button style={{ height: 30, padding: '0 12px', fontSize: 12.5, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.14)', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Due date</button>}>
            {(close: any) => [['Today', 0], ['Tomorrow', 1], ['Next week', 7], ['No date', null]].map(([l, n]: any) => <MenuItem key={l} label={l} onClick={() => { bulk({ due: n === null ? null : iso(addDays(new Date(), n)) }, `Due date set for ${selected.size} tasks`); close(); }} />)}
          </Menu>
          <Menu align="right" width={160} trigger={<button style={{ height: 30, padding: '0 12px', fontSize: 12.5, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.14)', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Priority</button>}>
            {(close: any) => PRIORITY_ORDER.map((k) => <MenuItem key={k} label={PRIORITY[k].label} onClick={() => { bulk({ priority: k }, `Priority changed for ${selected.size} tasks`); close(); }} />)}
          </Menu>
          <button onClick={bulkDelete} style={{ height: 30, padding: '0 12px', fontSize: 12.5, fontWeight: 600, color: '#fff', background: 'rgba(255,59,48,0.9)', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Delete</button>
          <button onClick={clearSel} style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: 'rgba(255,255,255,0.14)', border: 'none', borderRadius: 8, cursor: 'pointer' }}><Icon name="x" size={15} /></button>
        </div>
      </div>}

      {/* view content */}
      <div style={{ padding: '0 28px 64px' }}>{content}</div>
    </div>

    {detailTask && <TaskDetail task={detailTask} onClose={() => setDetailId(null)} />}
    {newOpen && <NewTaskModal onClose={() => setNewOpen(false)} onCreate={createTask} />}
    {tplOpen && <TemplatesDrawer templates={TEMPLATES} onClose={() => setTplOpen(false)} onUse={useTemplate} />}
    <ToastHost toasts={toasts} />
  </TasksCtx.Provider>;
}
