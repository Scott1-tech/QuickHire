import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store';
import Icon from '@/components/Icon';
import type { Task, TaskStatus, TaskChecklistItem, TaskComment } from '@/types';

type Layout = 'modal' | 'full' | 'sidebar';
const STATUSES: TaskStatus[] = ['TO DO', 'IN PROGRESS', 'REVIEW NEEDED', 'LONG-TERM', 'COMPLETE'];
const STATUS_PILL: Record<TaskStatus, string> = {
  'TO DO': 'pill-slate', 'IN PROGRESS': 'pill-amber', 'REVIEW NEEDED': 'pill-blue',
  'LONG-TERM': 'pill-purple', COMPLETE: 'pill-green',
};
const PRIO_COLOR: Record<string, string> = { Urgent: 'text-danger', High: 'text-warn', Normal: 'text-muted' };
const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/**
 * ClickUp-style task record. Opens centered (Modal), Full screen, or as a right
 * Sidebar — switchable from the header. New tasks are committed with "Create
 * task"; existing tasks save live to the store as you edit.
 */
export default function TaskModal({ taskId, createSeed, onClose }: {
  taskId?: string; createSeed?: Partial<Task>; onClose: () => void;
}) {
  const s = useStore();
  const existing = Boolean(taskId);
  const stored = useMemo(() => s.allTasks.find((t) => t.id === taskId), [s.allTasks, taskId]);

  const seed: Task = useMemo(() => stored ?? {
    id: '', carrierId: createSeed?.carrierId ?? s.currentCarrierId, title: createSeed?.title ?? '',
    status: 'TO DO', assignee: createSeed?.assignee, priority: 'Normal',
    tags: [], description: createSeed?.description ?? '', checklist: [], commentList: [],
    source: createSeed?.source, start: createSeed?.start, due: createSeed?.due,
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [draft, setDraft] = useState<Task>(seed);
  const [layout, setLayout] = useState<Layout>('modal');
  const [layoutOpen, setLayoutOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Edit existing → save live. Create → only local until committed.
  const patch = (p: Partial<Task>) => {
    setDraft((d) => ({ ...d, ...p }));
    if (existing && draft.id) s.updateTask(draft.id, p);
  };

  const create = () => {
    if (!draft.title.trim()) { patch({ title: draft.title }); return; }
    s.addTask(draft);
    onClose();
  };

  const employees = s.allEmployees.filter((e) => e.carrierId === draft.carrierId);
  const carrier = s.carriers.find((c) => c.id === draft.carrierId);

  /* ── panel geometry per layout ─────────────────────────────────────────── */
  const panelCls =
    layout === 'full' ? 'absolute inset-3 rounded-2xl'
      : layout === 'sidebar' ? 'absolute right-0 top-0 h-full w-[860px] max-w-full border-l border-line'
        : 'relative w-[1000px] max-w-[96vw] h-[88vh] rounded-2xl';
  const twoCol = layout !== 'sidebar';

  return (
    <div className={`fixed inset-0 z-50 ${layout === 'modal' ? 'grid place-items-center p-4' : ''}`}>
      <div className="absolute inset-0 bg-black/50 animate-[fadeIn_.15s_ease]" onClick={onClose} />
      <div className={`bg-surface shadow-pop border border-line flex flex-col overflow-hidden animate-[popIn_.18s_cubic-bezier(.16,1,.3,1)] ${panelCls}`}>
        {/* Header */}
        <header className="flex items-center gap-2.5 px-4 py-2.5 border-b border-line">
          <span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold bg-primary-light text-primary">
            <Icon name="clipboardCheck" size={14} /> Task
          </span>
          <span className="text-[12px] text-muted truncate hidden sm:block">
            {carrier?.name ?? 'Tasks'} {draft.source ? `/ ${draft.source}` : ''}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {/* Layout switcher */}
            <div className="relative">
              <button onClick={() => setLayoutOpen((o) => !o)} title="Switch layout"
                className="grid place-items-center w-8 h-8 rounded-lg text-muted hover:bg-[var(--surface-hover)] hover:text-ink transition">
                <Icon name="layout" size={17} />
              </button>
              {layoutOpen && (
                <div className="absolute right-0 mt-1 bg-surface border border-line rounded-xl shadow-pop p-1.5 z-10 w-44" onMouseLeave={() => setLayoutOpen(false)}>
                  <div className="text-[10.5px] font-bold text-muted uppercase px-2 pt-1 pb-1.5">Switch layout</div>
                  {(['modal', 'full', 'sidebar'] as Layout[]).map((l) => (
                    <button key={l} onClick={() => { setLayout(l); setLayoutOpen(false); }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] flex items-center gap-2 ${layout === l ? 'bg-primary-light text-primary font-semibold' : 'text-ink hover:bg-[var(--surface-hover)]'}`}>
                      <Icon name={l === 'modal' ? 'square' : l === 'full' ? 'maximize' : 'sidebarRight'} size={15} />
                      {l === 'modal' ? 'Modal' : l === 'full' ? 'Full screen' : 'Sidebar'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={onClose} title="Close"
              className="grid place-items-center w-8 h-8 rounded-lg text-muted hover:bg-[var(--surface-hover)] hover:text-ink transition">
              <Icon name="close" size={18} />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className={`flex-1 min-h-0 ${twoCol ? 'grid grid-cols-1 lg:grid-cols-[1fr_360px]' : 'overflow-y-auto'}`}>
          <div className={twoCol ? 'overflow-y-auto px-6 py-5 scrollbar-thin' : 'px-6 py-5'}>
            <Main draft={draft} patch={patch} employees={employees} />
            {!twoCol && <Activity draft={draft} patch={patch} currentUser={s.currentUser} />}
          </div>
          {twoCol && (
            <div className="border-l border-line bg-bg overflow-y-auto px-4 py-4 scrollbar-thin hidden lg:block">
              <Activity draft={draft} patch={patch} currentUser={s.currentUser} />
            </div>
          )}
        </div>

        {/* Footer (create mode only) */}
        {!existing && (
          <footer className="border-t border-line px-6 py-3 flex items-center gap-2 bg-[var(--surface-hover)]">
            <button onClick={create} className="btn-primary">Create task</button>
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <span className="text-[12px] text-muted ml-1">It will appear in Tasks and the assignee's Inbox.</span>
          </footer>
        )}
      </div>
    </div>
  );
}

/* ── Main column ─────────────────────────────────────────────────────────────── */
function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex items-center gap-2 w-36 flex-shrink-0 text-[13px] text-muted"><Icon name={icon} size={15} /> {label}</div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function Main({ draft, patch, employees }: {
  draft: Task; patch: (p: Partial<Task>) => void; employees: { id: string; firstName: string; lastName: string }[];
}) {
  const [tag, setTag] = useState('');
  const [sub, setSub] = useState('');
  const toggleComplete = () => patch({ status: draft.status === 'COMPLETE' ? 'TO DO' : 'COMPLETE' });

  const addSub = () => {
    if (!sub.trim()) return;
    const item: TaskChecklistItem = { id: uid('s'), text: sub.trim(), done: false };
    patch({ checklist: [...(draft.checklist ?? []), item] });
    setSub('');
  };
  const toggleSub = (id: string) =>
    patch({ checklist: (draft.checklist ?? []).map((c) => (c.id === id ? { ...c, done: !c.done } : c)) });
  const delSub = (id: string) => patch({ checklist: (draft.checklist ?? []).filter((c) => c.id !== id) });
  const subDone = (draft.checklist ?? []).filter((c) => c.done).length;

  return (
    <>
      <input autoFocus={!draft.id} value={draft.title} onChange={(e) => patch({ title: e.target.value })}
        placeholder="Task name" className="w-full text-[24px] leading-tight font-extrabold text-ink bg-transparent outline-none placeholder:text-muted/40 mb-4" />

      <Row icon="circleDot" label="Status">
        <div className="flex items-center gap-2">
          <select value={draft.status} onChange={(e) => patch({ status: e.target.value as TaskStatus })}
            className={`pill ${STATUS_PILL[draft.status]} cursor-pointer border-0 outline-none`}>
            {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
          <button onClick={toggleComplete} title="Mark complete"
            className={`grid place-items-center w-6 h-6 rounded-full border ${draft.status === 'COMPLETE' ? 'bg-success text-white border-success' : 'border-line text-muted hover:border-success'}`}>
            <Icon name="check" size={13} />
          </button>
        </div>
      </Row>

      <Row icon="user" label="Assignee">
        <select value={draft.assignee ?? ''} onChange={(e) => patch({ assignee: e.target.value || undefined })} className="input py-1.5">
          <option value="">Unassigned</option>
          {employees.map((e) => <option key={e.id} value={`${e.firstName} ${e.lastName}`}>{e.firstName} {e.lastName}</option>)}
        </select>
      </Row>

      <Row icon="calendar" label="Dates">
        <div className="flex items-center gap-2 text-[13px]">
          <input type="date" value={(draft.start ?? '').slice(0, 10)} onChange={(e) => patch({ start: e.target.value })} className="input py-1.5 w-40" />
          <Icon name="arrowRight" size={14} />
          <input type="date" value={(draft.due ?? '').slice(0, 10)} onChange={(e) => patch({ due: e.target.value })} className="input py-1.5 w-40" />
        </div>
      </Row>

      <Row icon="tag" label="Priority">
        <select value={draft.priority ?? 'Normal'} onChange={(e) => patch({ priority: e.target.value as Task['priority'] })}
          className={`input py-1.5 w-40 font-semibold ${PRIO_COLOR[draft.priority ?? 'Normal']}`}>
          <option value="Urgent">🚩 Urgent</option><option value="High">High</option><option value="Normal">Normal</option>
        </select>
      </Row>

      <Row icon="clock" label="Time estimate">
        <input value={draft.timeEstimate ?? ''} onChange={(e) => patch({ timeEstimate: e.target.value })} placeholder="e.g. 2h" className="input py-1.5 w-40" />
      </Row>

      <Row icon="tag" label="Tags">
        <div className="flex flex-wrap items-center gap-1.5">
          {(draft.tags ?? []).map((t) => (
            <span key={t} className="pill pill-blue flex items-center gap-1">{t}
              <button onClick={() => patch({ tags: (draft.tags ?? []).filter((x) => x !== t) })} className="hover:text-danger">×</button>
            </span>
          ))}
          <input value={tag} onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && tag.trim()) { patch({ tags: [...(draft.tags ?? []), tag.trim()] }); setTag(''); } }}
            placeholder="+ tag" className="bg-transparent outline-none text-[13px] w-20" />
        </div>
      </Row>

      <hr className="border-line my-4" />

      <div className="text-[13px] font-semibold text-muted mb-1.5">Description</div>
      <textarea value={draft.description ?? ''} onChange={(e) => patch({ description: e.target.value })} rows={3}
        placeholder="Add a description…" className="input w-full mb-5" />

      {/* Subtasks / checklist */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[13px] font-semibold text-ink">Checklist</span>
        {(draft.checklist ?? []).length > 0 && <span className="text-[11px] text-muted">{subDone}/{(draft.checklist ?? []).length}</span>}
      </div>
      <div className="flex flex-col gap-1.5 mb-2">
        {(draft.checklist ?? []).map((c) => (
          <div key={c.id} className="flex items-center gap-2 group">
            <button onClick={() => toggleSub(c.id)} className={`grid place-items-center w-5 h-5 rounded border flex-shrink-0 ${c.done ? 'bg-success text-white border-success' : 'border-line text-transparent hover:border-success'}`}>
              <Icon name="check" size={12} />
            </button>
            <span className={`text-[13px] flex-1 ${c.done ? 'line-through text-muted' : 'text-ink'}`}>{c.text}</span>
            <button onClick={() => delSub(c.id)} className="text-muted opacity-0 group-hover:opacity-100 hover:text-danger text-sm">×</button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Icon name="plus" size={14} />
        <input value={sub} onChange={(e) => setSub(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addSub(); }}
          placeholder="Add a checklist item" className="bg-transparent outline-none text-[13px] flex-1" />
      </div>
    </>
  );
}

/* ── Activity / comments ─────────────────────────────────────────────────────── */
function Activity({ draft, patch, currentUser }: { draft: Task; patch: (p: Partial<Task>) => void; currentUser: string }) {
  const [text, setText] = useState('');
  const comments = draft.commentList ?? [];
  const send = () => {
    if (!text.trim()) return;
    const c: TaskComment = { id: uid('c'), author: currentUser, text: text.trim(), at: new Date().toISOString() };
    patch({ commentList: [...comments, c] });
    setText('');
  };
  return (
    <div className="flex flex-col h-full">
      <div className="text-[13px] font-bold text-ink mb-3">Activity</div>
      <div className="flex-1 flex flex-col gap-3 mb-3">
        {comments.length === 0 && <div className="text-[12.5px] text-muted">No comments yet. Start the conversation.</div>}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-purple grid place-items-center text-[11px] font-bold text-white flex-shrink-0">{c.author[0]}</div>
            <div className="min-w-0">
              <div className="text-[12px]"><span className="font-bold text-ink">{c.author}</span> <span className="text-muted">{new Date(c.at).toLocaleString()}</span></div>
              <div className="text-[13px] text-ink whitespace-pre-wrap">{c.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2 border-t border-line pt-3">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Write a comment…"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
          className="input flex-1 resize-none" />
        <button onClick={send} className="btn-primary px-3 py-2">Send</button>
      </div>
    </div>
  );
}
