import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '@/store';
import Icon from '@/components/Icon';
import type { Task, TaskStatus, TaskPriority, TaskChecklistItem, TaskComment } from '@/types';

type Layout = 'modal' | 'full' | 'sidebar';
const STATUSES: TaskStatus[] = ['TO DO', 'IN PROGRESS', 'REVIEW NEEDED', 'LONG-TERM', 'COMPLETE'];
// ClickUp-style status colours
const STATUS_C: Record<TaskStatus, { bg: string; fg: string; dot: string }> = {
  'TO DO': { bg: '#e4e6ea', fg: '#50555c', dot: '#7c828d' },
  'IN PROGRESS': { bg: '#d6ecff', fg: '#1090e0', dot: '#1090e0' },
  'REVIEW NEEDED': { bg: '#efe7ff', fg: '#7b68ee', dot: '#7b68ee' },
  'LONG-TERM': { bg: '#ffe9d6', fg: '#d4820a', dot: '#f29d38' },
  COMPLETE: { bg: '#d6f3e1', fg: '#1aa15a', dot: '#1aa15a' },
};
const PRIO_C: Record<string, string> = { Urgent: '#e3492f', High: '#f5b400', Normal: '#6a8fef', Low: '#a3a8b0' };
const PRIORITIES = ['Urgent', 'High', 'Normal', 'Low'] as const;
const PURPLE = '#7b68ee';
const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

/** Faithful ClickUp-style task record. Opens centered (Modal), Full screen, or
 *  as a right Sidebar — switchable from the panel icon in the top bar. */
export default function TaskModal({ taskId, createSeed, onClose }: {
  taskId?: string; createSeed?: Partial<Task>; onClose: () => void;
}) {
  const s = useStore();
  const existing = Boolean(taskId);
  const stored = useMemo(() => s.allTasks.find((t) => t.id === taskId), [s.allTasks, taskId]);

  const seed: Task = useMemo(() => stored ?? {
    id: '', carrierId: createSeed?.carrierId ?? s.currentCarrierId, title: createSeed?.title ?? '',
    status: 'TO DO', assignee: createSeed?.assignee, tags: [], description: createSeed?.description ?? '',
    checklist: [], commentList: [], source: createSeed?.source, createdBy: s.currentUser, createdAt: new Date().toISOString(),
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [draft, setDraft] = useState<Task>(seed);
  const [layout, setLayout] = useState<Layout>('modal');
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [showChecklist, setShowChecklist] = useState((seed.checklist ?? []).length > 0);
  const [files, setFiles] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patch = (p: Partial<Task>) => {
    setDraft((d) => ({ ...d, ...p }));
    if (existing && draft.id) s.updateTask(draft.id, p);
  };
  const create = () => { if (draft.title.trim()) { s.addTask(draft); onClose(); } };
  // Status changes are logged into the Activity feed, like ClickUp.
  const changeStatus = (next: TaskStatus) => {
    if (next === draft.status) return;
    patch({ status: next, activityLog: [...(draft.activityLog ?? []), { id: uid('e'), text: `changed status from ${draft.status} to ${next}`, at: new Date().toISOString(), author: s.currentUser }] });
  };

  const employees = s.allEmployees.filter((e) => e.carrierId === draft.carrierId);
  const carrier = s.carriers.find((c) => c.id === draft.carrierId);

  const panelCls =
    layout === 'full' ? 'absolute inset-2 rounded-lg'
      : layout === 'sidebar' ? 'absolute right-0 top-0 h-full w-[940px] max-w-full'
        : 'relative w-[1160px] max-w-[97vw] h-[92vh] rounded-lg';
  const twoCol = layout !== 'sidebar';

  return (
    <div className={`fixed inset-0 z-50 ${layout === 'modal' ? 'grid place-items-center p-3' : ''}`} style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="absolute inset-0 bg-black/40 animate-[fadeIn_.15s_ease]" onClick={onClose} />
      <div className={`bg-white text-[#1d2430] shadow-pop flex flex-col overflow-hidden border border-[#e8eaed] animate-[popIn_.16s_cubic-bezier(.16,1,.3,1)] ${panelCls}`}>
        {/* ── Top breadcrumb bar ─────────────────────────────────────────── */}
        <header className="flex items-center gap-1 px-3 h-11 border-b border-[#e8eaed] text-[#7c828d] text-[13px] flex-shrink-0">
          <TopBtn icon="chevronRight" rotate={90} title="Up" />
          <TopBtn icon="chevronRight" rotate={-90} title="Down" />
          <span className="mx-1 w-px h-4 bg-[#e8eaed]" />
          <span className="w-[18px] h-[18px] rounded bg-[#e25563] text-white grid place-items-center text-[10px] font-bold flex-shrink-0">{(carrier?.name ?? 'S')[0]}</span>
          <span className="truncate max-w-[160px]">{carrier?.name ?? 'Workspace'}</span>
          <span className="text-[#c2c6cc]">/</span>
          <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-[#f29d38] grid place-items-center text-white"><Icon name="clipboardCheck" size={10} /></span> Tasks</span>

          <div className="ml-auto flex items-center gap-0.5">
            <span className="text-[#a3a8b0] mr-1 hidden md:inline">Created {fmt(draft.createdAt)}</span>
            <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#f4f5f7] text-[#7b68ee] font-semibold"><Icon name="sparkles" size={14} /> Brain²</button>
            <button className="flex items-center gap-1.5 px-2.5 py-1 rounded hover:bg-[#f4f5f7] font-medium"><Icon name="share" size={14} /> Share</button>
            <TopBtn icon="dots" title="More" />
            <TopBtn icon="star" title="Favorite" />
            {/* layout switch */}
            <div className="relative">
              <button onClick={() => setLayoutOpen((o) => !o)} title="Switch layout" className="w-7 h-7 grid place-items-center rounded hover:bg-[#f4f5f7]"><Icon name="sidebarRight" size={15} /></button>
              {layoutOpen && (
                <div className="absolute right-0 mt-1 bg-white border border-[#e8eaed] rounded-lg shadow-pop p-1.5 z-10 w-44" onMouseLeave={() => setLayoutOpen(false)}>
                  <div className="text-[10.5px] font-bold text-[#a3a8b0] uppercase px-2 pt-1 pb-1.5">Switch layout</div>
                  {(['modal', 'full', 'sidebar'] as Layout[]).map((l) => (
                    <button key={l} onClick={() => { setLayout(l); setLayoutOpen(false); }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] flex items-center gap-2 ${layout === l ? 'bg-[#f0eeff] text-[#7b68ee] font-semibold' : 'hover:bg-[#f4f5f7]'}`}>
                      <Icon name={l === 'modal' ? 'square' : l === 'full' ? 'maximize' : 'sidebarRight'} size={15} />
                      {l === 'modal' ? 'Modal' : l === 'full' ? 'Full screen' : 'Sidebar'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <TopBtn icon="close" title="Close" onClick={onClose} />
          </div>
        </header>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className={`flex-1 min-h-0 ${twoCol ? 'grid grid-cols-1 lg:grid-cols-[1fr_380px]' : 'flex flex-col'}`}>
          {/* Main */}
          <main className="overflow-y-auto px-6 sm:px-10 py-5 scrollbar-thin">
            {/* type pill + icons */}
            <div className="flex items-center gap-2 mb-4 text-[#7c828d]">
              <button className="flex items-center gap-1.5 border border-[#e8eaed] rounded-md px-2 py-1 text-[12.5px] font-medium hover:bg-[#f4f5f7]">
                <span className="w-3.5 h-3.5 rounded-full grid place-items-center" style={{ background: '#d6ecff' }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#1090e0' }} /></span>
                Task <Icon name="chevronDown" size={13} />
              </button>
              <button className="w-7 h-7 grid place-items-center rounded hover:bg-[#f4f5f7]" title="Task ID"><Icon name="hash" size={15} /></button>
              <button className="flex items-center gap-1 px-1.5 h-7 rounded hover:bg-[#f4f5f7]" title="Attachments"><Icon name="paperclip" size={15} /> <span className="text-[12px]">{files.length}</span></button>
            </div>

            {/* Title */}
            <input autoFocus={!draft.id} value={draft.title} onChange={(e) => patch({ title: e.target.value })}
              placeholder="Task name" className="w-full text-[27px] leading-tight font-bold text-[#1d2430] bg-transparent outline-none placeholder:text-[#c2c6cc] mb-3" />

            {/* AI banner */}
            <div className="flex items-center gap-2 bg-[#f7f7fb] rounded-lg px-3.5 py-3 text-[13px] text-[#8b8f98] mb-6">
              <Icon name="sparkles" size={15} className="text-[#7b68ee]" />
              <span>Ask <span className="text-[#7b68ee] font-semibold">Brain²</span> for a <span className="underline">presentation</span>, <span className="underline">document</span> or <span className="underline">prototype</span></span>
            </div>

            {/* Properties — two columns */}
            <div className="grid sm:grid-cols-2 gap-x-10 mb-1">
              <div>
                <Prop icon="circleDot" label="Status">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <select value={draft.status} onChange={(e) => changeStatus(e.target.value as TaskStatus)}
                        className="appearance-none rounded px-2 py-1 pr-6 text-[11.5px] font-semibold uppercase tracking-wide cursor-pointer outline-none"
                        style={{ background: STATUS_C[draft.status].bg, color: STATUS_C[draft.status].fg }}>
                        {STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                      </select>
                      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2" style={{ color: STATUS_C[draft.status].fg }}><Icon name="chevronRight" size={12} /></span>
                    </div>
                    <button onClick={() => changeStatus(draft.status === 'COMPLETE' ? 'TO DO' : 'COMPLETE')} title="Mark complete"
                      className="w-5 h-5 rounded-full grid place-items-center border"
                      style={draft.status === 'COMPLETE' ? { background: '#1aa15a', borderColor: '#1aa15a', color: '#fff' } : { borderColor: '#c2c6cc', color: '#c2c6cc' }}>
                      <Icon name="check" size={12} />
                    </button>
                  </div>
                </Prop>
                <Prop icon="calendar" label="Dates">
                  <div className="flex items-center gap-1.5">
                    <DateCell value={draft.start} placeholder="Start" onChange={(v) => patch({ start: v })} />
                    <Icon name="arrowRight" size={13} className="text-[#c2c6cc]" />
                    <DateCell value={draft.due} placeholder="Due" onChange={(v) => patch({ due: v })} />
                  </div>
                </Prop>
                <Prop icon="hourglass" label="Time estimate">
                  <Editable value={draft.timeEstimate} placeholder="Empty" onChange={(v) => patch({ timeEstimate: v })} />
                </Prop>
                <Prop icon="tag" label="Tags">
                  <Tags tags={draft.tags ?? []} onChange={(t) => patch({ tags: t })} />
                </Prop>
              </div>
              <div>
                <Prop icon="user" label="Assignees">
                  <AssigneePick value={draft.assignee} employees={employees} onChange={(v) => patch({ assignee: v })} />
                </Prop>
                <Prop icon="flag" label="Priority">
                  <PriorityPick value={draft.priority} onChange={(v) => patch({ priority: v })} />
                </Prop>
                <Prop icon="clock" label="Track time">
                  <button className="flex items-center gap-1.5 text-[13px] text-[#7c828d] hover:text-[#1d2430]">
                    <span className="w-4 h-4 rounded-full border border-current grid place-items-center text-[8px]">▶</span> Start
                  </button>
                </Prop>
              </div>
            </div>

            <hr className="border-[#edeef0] my-5" />

            {/* Description */}
            <DescriptionField value={draft.description ?? ''} onChange={(v) => patch({ description: v })} />

            {/* Fields */}
            <Collapse title="Fields" right={<><Hi icon="search" /><Hi icon="maximize" /><Hi icon="plus" /></>}>
              <div className="flex items-center gap-3 py-1.5 text-[13px] border-t border-[#f0f1f3]">
                <div className="flex items-center gap-2 w-[130px] text-[#7c828d]"><Icon name="user" size={15} /> Reviewer</div>
                <AssigneePick value={draft.reviewer} employees={employees} onChange={(v) => patch({ reviewer: v })} placeholder="—" />
              </div>
            </Collapse>

            {/* Row actions */}
            <RowAction icon="subtask" label="Add subtask" onClick={() => setShowChecklist(true)} />
            <RowAction icon="link" label="Relate items or add dependencies" />
            <RowAction icon="listChecklist" label="Create checklist" onClick={() => setShowChecklist(true)} />

            {showChecklist && <Checklist items={draft.checklist ?? []} onChange={(c) => patch({ checklist: c })} />}

            {/* Attachments */}
            <div className="mt-5">
              <Collapse title={`Attachments ${files.length}`} right={<><Hi icon="search" /><Hi icon="maximize" /><Hi icon="plus" /></>} defaultOpen>
                <label className="block border border-dashed border-[#d6d9de] rounded-lg py-6 text-center text-[13px] text-[#a3a8b0] cursor-pointer hover:bg-[#fafbfc]">
                  Drop your files here to <span className="text-[#7b68ee] underline">upload</span>
                  <input type="file" multiple className="hidden" onChange={(e) => setFiles((p) => [...p, ...Array.from(e.target.files ?? []).map((f) => f.name)])} />
                </label>
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {files.map((f, i) => <span key={i} className="text-[12px] bg-[#f4f5f7] rounded px-2 py-1 flex items-center gap-1"><Icon name="paperclip" size={12} /> {f}</span>)}
                  </div>
                )}
              </Collapse>
            </div>
          </main>

          {/* Activity */}
          {twoCol ? (
            <aside className="border-l border-[#e8eaed] bg-[#fbfbfc] flex flex-col min-h-0"><Activity draft={draft} patch={patch} currentUser={s.currentUser} /></aside>
          ) : (
            <div className="border-t border-[#e8eaed] bg-[#fbfbfc] max-h-[42%] flex flex-col"><Activity draft={draft} patch={patch} currentUser={s.currentUser} /></div>
          )}
        </div>

        {!existing && (
          <footer className="border-t border-[#e8eaed] px-6 py-3 flex items-center gap-2 flex-shrink-0">
            <button onClick={create} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white" style={{ background: PURPLE }}>Create task</button>
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#50555c] hover:bg-[#f4f5f7]">Cancel</button>
            <span className="text-[12px] text-[#a3a8b0] ml-1">Appears in Tasks and the assignee's Inbox.</span>
          </footer>
        )}
      </div>
    </div>
  );
}

/* ── small pieces ─────────────────────────────────────────────────────────── */
function TopBtn({ icon, title, onClick, rotate }: { icon: string; title: string; onClick?: () => void; rotate?: number }) {
  return (
    <button onClick={onClick} title={title} className="w-7 h-7 grid place-items-center rounded hover:bg-[#f4f5f7] text-[#7c828d]">
      <span style={rotate ? { transform: `rotate(${rotate}deg)`, display: 'inline-flex' } : undefined}><Icon name={icon} size={15} /></span>
    </button>
  );
}
function Hi({ icon }: { icon: string }) {
  return <button className="w-6 h-6 grid place-items-center rounded hover:bg-[#f4f5f7] text-[#a3a8b0]"><Icon name={icon} size={14} /></button>;
}
function Prop({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-[7px] text-[13px]">
      <div className="flex items-center gap-2 w-[118px] flex-shrink-0 text-[#7c828d]"><Icon name={icon} size={15} /> {label}</div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <span className="rounded-full grid place-items-center text-white font-semibold flex-shrink-0" style={{ width: size, height: size, background: PURPLE, fontSize: size * 0.42 }}>{initials}</span>;
}
// Click-to-open popover with an outside-click backdrop.
function Pop({ trigger, children, width = 260 }: {
  trigger: (toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; width?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      {trigger(() => setOpen((o) => !o))}
      {open && (
        <>
          <div className="fixed inset-0 z-[5]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-10 bg-white border border-[#e8eaed] rounded-lg shadow-pop" style={{ width }}>
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  );
}

function AssigneePick({ value, employees, onChange, placeholder }: {
  value?: string; employees: { id: string; firstName: string; lastName: string }[]; onChange: (v?: string) => void; placeholder?: string;
}) {
  const s = useStore();
  const [q, setQ] = useState('');
  const people = [{ id: 'me', name: s.currentUser }, ...employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }))];
  const filtered = people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Pop width={290} trigger={(toggle) => (
      <div className={`flex items-center gap-2 ${value ? 'border border-[#e8eaed] rounded-md pl-1 pr-1.5 py-0.5' : ''}`}>
        <button onClick={toggle} className="flex items-center gap-2 text-[13px]">
          {value ? <Avatar name={value} /> : <span className="w-[22px] h-[22px] rounded-full border border-dashed border-[#c2c6cc] grid place-items-center text-[#c2c6cc]"><Icon name="plus" size={11} /></span>}
          <span style={{ color: value ? '#1d2430' : '#a3a8b0' }}>{value || placeholder || 'Assign'}</span>
        </button>
        {value && <button onClick={() => onChange(undefined)} title="Clear" className="text-[#a3a8b0] hover:text-[#1d2430] ml-auto"><Icon name="close" size={13} /></button>}
      </div>
    )}>
      {(close) => (
        <div className="p-2">
          <div className="flex items-center gap-2 border border-[#e8eaed] rounded-md px-2 py-1.5 mb-1">
            <Icon name="search" size={14} className="text-[#a3a8b0]" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or enter email…" className="bg-transparent outline-none text-[13px] flex-1" />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {value && (<>
              <div className="text-[11px] font-bold text-[#a3a8b0] px-1 pt-1.5 pb-1">Assignees</div>
              <PersonRow name={value} selected onClick={() => { onChange(undefined); close(); }} />
            </>)}
            <div className="text-[11px] font-bold text-[#a3a8b0] px-1 pt-1.5 pb-1">People</div>
            {filtered.map((p) => <PersonRow key={p.id} name={p.id === 'me' ? `${p.name}` : p.name} onClick={() => { onChange(p.name); close(); }} />)}
            {filtered.length === 0 && <div className="px-2 py-2 text-[12.5px] text-[#a3a8b0]">No matches.</div>}
          </div>
          <button onClick={close} className="w-full mt-1 border-t border-[#f0f1f3] pt-2 flex items-center justify-center gap-1.5 text-[13px] text-[#7b68ee] font-medium"><Icon name="sparkles" size={14} /> Assign with AI</button>
        </div>
      )}
    </Pop>
  );
}
function PersonRow({ name, onClick, selected }: { name: string; onClick: () => void; selected?: boolean }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-[#f4f5f7] text-[13px] text-left">
      <Avatar name={name} size={24} /> <span className="flex-1 truncate">{name}</span>
      {selected && <Icon name="check" size={14} className="text-[#7b68ee]" />}
    </button>
  );
}

function PriorityPick({ value, onChange }: { value?: TaskPriority; onChange: (v?: TaskPriority) => void }) {
  return (
    <Pop width={220} trigger={(toggle) => (
      <button onClick={toggle} className="flex items-center gap-1.5 text-[13px]">
        <Icon name="flag" size={14} style={{ color: value ? PRIO_C[value] : '#a3a8b0' }} />
        <span style={{ color: value ? '#1d2430' : '#a3a8b0' }}>{value ?? 'Empty'}</span>
      </button>
    )}>
      {(close) => (
        <div className="p-1.5">
          {PRIORITIES.map((p) => (
            <button key={p} onClick={() => { onChange(p); close(); }} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[#f4f5f7] text-[13px]">
              <Icon name="flag" size={15} style={{ color: PRIO_C[p] }} /> {p}
            </button>
          ))}
          {value && <button onClick={() => { onChange(undefined); close(); }} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#f4f5f7] text-[13px] text-[#a3a8b0]">Clear</button>}
          <div className="border-t border-[#f0f1f3] mt-1 pt-1.5">
            <button onClick={close} className="w-full flex items-center justify-center gap-1.5 text-[13px] text-[#7b68ee] font-medium py-1"><Icon name="sparkles" size={14} /> Prioritize with AI</button>
          </div>
        </div>
      )}
    </Pop>
  );
}
function DateCell({ value, placeholder, onChange }: { value?: string; placeholder: string; onChange: (v: string) => void }) {
  const [edit, setEdit] = useState(false);
  if (edit || value) return (
    <input type="date" autoFocus={edit} value={(value ?? '').slice(0, 10)} onChange={(e) => onChange(e.target.value)} onBlur={() => setEdit(false)}
      className="bg-transparent text-[13px] text-[#1d2430] outline-none border border-[#e8eaed] rounded px-1.5 py-0.5" />
  );
  return <button onClick={() => setEdit(true)} className="flex items-center gap-1 text-[13px] text-[#a3a8b0] hover:text-[#1d2430]"><Icon name="calendar" size={13} /> {placeholder}</button>;
}
function Editable({ value, placeholder, onChange }: { value?: string; placeholder: string; onChange: (v: string) => void }) {
  const [edit, setEdit] = useState(false);
  if (edit) return <input autoFocus value={value ?? ''} onChange={(e) => onChange(e.target.value)} onBlur={() => setEdit(false)} className="bg-transparent text-[13px] outline-none border border-[#e8eaed] rounded px-1.5 py-0.5 w-32" />;
  return <button onClick={() => setEdit(true)} className="text-[13px] hover:text-[#1d2430]" style={{ color: value ? '#1d2430' : '#a3a8b0' }}>{value || placeholder}</button>;
}
function Tags({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t} className="text-[11.5px] rounded px-1.5 py-0.5 flex items-center gap-1" style={{ background: '#efe7ff', color: '#7b68ee' }}>{t}
          <button onClick={() => onChange(tags.filter((x) => x !== t))}>×</button></span>
      ))}
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onChange([...tags, v.trim()]); setV(''); } }}
        placeholder={tags.length ? '' : 'Empty'} className="bg-transparent outline-none text-[13px] text-[#1d2430] placeholder:text-[#a3a8b0] w-16" />
    </div>
  );
}
function DescriptionField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative mb-2">
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2}
        className="w-full bg-transparent outline-none text-[14px] text-[#1d2430] resize-none placeholder:text-[#a3a8b0]" placeholder="" />
      {!value && (
        <div className="pointer-events-none absolute top-0 left-0 text-[14px] text-[#a3a8b0] flex items-center gap-1">
          Add description, or write with <Icon name="sparkles" size={14} className="text-[#7b68ee]" /> AI
        </div>
      )}
    </div>
  );
}
function Collapse({ title, right, children, defaultOpen }: { title: string; right?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className="mt-2">
      <div className="flex items-center gap-1 py-2 group">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-[13px] font-semibold text-[#50555c]">
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} /> {title}
        </button>
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">{right}</div>
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}
function RowAction({ icon, label, onClick }: { icon: string; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2.5 py-2.5 text-[13px] text-[#50555c] hover:text-[#1d2430] w-full border-t border-[#f0f1f3]">
      <Icon name={icon} size={16} className="text-[#7c828d]" /> {label}
    </button>
  );
}
function Checklist({ items, onChange }: { items: TaskChecklistItem[]; onChange: (c: TaskChecklistItem[]) => void }) {
  const [v, setV] = useState('');
  const done = items.filter((c) => c.done).length;
  return (
    <div className="border-t border-[#f0f1f3] py-2">
      <div className="flex items-center gap-2 mb-1.5 text-[12.5px] text-[#7c828d]"><Icon name="listChecklist" size={14} /> Checklist {items.length > 0 && <span>{done}/{items.length}</span>}</div>
      <div className="flex flex-col gap-1">
        {items.map((c) => (
          <div key={c.id} className="flex items-center gap-2 group">
            <button onClick={() => onChange(items.map((x) => x.id === c.id ? { ...x, done: !x.done } : x))}
              className="w-[18px] h-[18px] rounded border grid place-items-center flex-shrink-0"
              style={c.done ? { background: '#1aa15a', borderColor: '#1aa15a', color: '#fff' } : { borderColor: '#c2c6cc', color: 'transparent' }}><Icon name="check" size={11} /></button>
            <span className={`text-[13px] flex-1 ${c.done ? 'line-through text-[#a3a8b0]' : 'text-[#1d2430]'}`}>{c.text}</span>
            <button onClick={() => onChange(items.filter((x) => x.id !== c.id))} className="text-[#c2c6cc] opacity-0 group-hover:opacity-100 hover:text-[#e3492f]">×</button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <Icon name="plus" size={13} className="text-[#a3a8b0]" />
        <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onChange([...items, { id: uid('s'), text: v.trim(), done: false }]); setV(''); } }}
          placeholder="Add an item" className="bg-transparent outline-none text-[13px] flex-1 placeholder:text-[#a3a8b0]" />
      </div>
    </div>
  );
}

/* ── Activity / comments ─────────────────────────────────────────────────────── */
const whenLabel = (at?: string) => {
  if (!at) return '';
  if (Date.now() - new Date(at).getTime() < 60000) return 'Just now';
  return new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

function Activity({ draft, patch, currentUser }: { draft: Task; patch: (p: Partial<Task>) => void; currentUser: string }) {
  const [text, setText] = useState('');
  const [showAll, setShowAll] = useState(false);
  const comments = draft.commentList ?? [];

  const send = () => {
    if (!text.trim()) return;
    patch({ commentList: [...comments, { id: uid('c'), author: currentUser, text: text.trim(), at: new Date().toISOString(), replies: [] }] });
    setText('');
  };
  const addReply = (cid: string, rtext: string) => patch({
    commentList: comments.map((c) => c.id === cid
      ? { ...c, replies: [...(c.replies ?? []), { id: uid('r'), author: currentUser, text: rtext, at: new Date().toISOString() }] }
      : c),
  });

  const events = [
    ...[...(draft.activityLog ?? [])].reverse().map((e) => ({ id: e.id, author: e.author ?? 'Someone', text: e.text, at: e.at })),
    { id: 'created', author: draft.createdBy ?? 'Someone', text: 'created this task', at: draft.createdAt ?? '' },
  ];
  const shownEvents = showAll ? events : events.slice(0, 2);

  return (
    <>
      <div className="flex items-center gap-2 px-4 h-11 border-b border-[#e8eaed] flex-shrink-0">
        <span className="text-[14px] font-semibold text-[#1d2430]">Activity</span>
        <div className="ml-auto flex items-center gap-0.5 text-[#a3a8b0]"><Hi icon="search" /><Hi icon="bell" /><Hi icon="filter" /></div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
        {/* System events (status changes, created) */}
        <div className="mb-3">
          {shownEvents.map((e) => (
            <div key={e.id} className="flex items-start gap-2 text-[12.5px] text-[#7c828d] py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#c2c6cc] mt-1.5 flex-shrink-0" />
              <span><span className="font-medium text-[#50555c]">{e.author === currentUser ? 'You' : e.author}</span> {e.text}</span>
              <span className="ml-auto whitespace-nowrap">{whenLabel(e.at)}</span>
            </div>
          ))}
          {events.length > 2 && (
            <button onClick={() => setShowAll((v) => !v)} className="flex items-center gap-1 text-[12.5px] text-[#7c828d] mt-0.5 ml-3.5 hover:text-[#1d2430]">
              <Icon name="chevronRight" size={12} /> {showAll ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
        {/* Comments with threaded replies */}
        {comments.map((c) => <CommentItem key={c.id} c={c} currentUser={currentUser} onReply={(t) => addReply(c.id, t)} />)}
      </div>
      {/* Composer */}
      <div className="p-3 border-t border-[#e8eaed] flex-shrink-0">
        <div className="border border-[#e8eaed] rounded-xl bg-white px-3 pt-2 pb-1.5">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="Write a comment…"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
            className="w-full bg-transparent outline-none text-[13px] resize-none placeholder:text-[#a3a8b0]" />
          <div className="flex items-center gap-2 text-[#a3a8b0] mt-1">
            <Icon name="plus" size={16} /><Icon name="sparkles" size={16} className="text-[#7b68ee]" /><Icon name="at" size={16} /><Icon name="paperclip" size={16} /><Icon name="smile" size={16} />
            <button onClick={send} className="ml-auto w-7 h-7 grid place-items-center rounded-lg text-white" style={{ background: text.trim() ? PURPLE : '#c8c4f0' }}><Icon name="send" size={14} /></button>
          </div>
        </div>
      </div>
    </>
  );
}

function CommentItem({ c, currentUser, onReply }: { c: TaskComment; currentUser: string; onReply: (text: string) => void }) {
  const [replying, setReplying] = useState(false);
  const [rt, setRt] = useState('');
  const submit = () => { if (rt.trim()) { onReply(rt.trim()); setRt(''); setReplying(false); } };
  const replies = c.replies ?? [];
  return (
    <div className="mb-4">
      <div className="flex gap-2.5">
        <Avatar name={c.author} size={26} />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px]"><span className="font-semibold text-[#1d2430]">{c.author}</span> <span className="text-[#a3a8b0]">{whenLabel(c.at)}</span></div>
          <div className="text-[13px] text-[#1d2430] whitespace-pre-wrap mt-0.5">{c.text}</div>
          <div className="flex items-center gap-3 mt-1.5 text-[12px] text-[#a3a8b0]">
            <button className="hover:text-[#1d2430]">👍</button>
            <button className="hover:text-[#1d2430]">🙂</button>
            <button onClick={() => setReplying((r) => !r)} className="hover:text-[#7b68ee] font-medium ml-auto">Reply</button>
          </div>
        </div>
      </div>

      {replies.length > 0 && (
        <div className="ml-9 mt-2 flex flex-col gap-2.5 border-l-2 border-[#eef0f2] pl-3">
          {replies.map((r) => (
            <div key={r.id} className="flex gap-2">
              <Avatar name={r.author} size={20} />
              <div className="min-w-0">
                <div className="text-[12px]"><span className="font-semibold text-[#1d2430]">{r.author}</span> <span className="text-[#a3a8b0]">{whenLabel(r.at)}</span></div>
                <div className="text-[12.5px] text-[#1d2430] whitespace-pre-wrap">{r.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {replying && (
        <div className="ml-9 mt-2 flex items-center gap-2">
          <input autoFocus value={rt} onChange={(e) => setRt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setReplying(false); }}
            placeholder={`Reply to ${c.author}…`} className="flex-1 border border-[#e8eaed] rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:border-[#7b68ee]" />
          <button onClick={submit} className="px-3 py-1.5 rounded-lg text-white text-[12px] font-medium" style={{ background: PURPLE }}>Reply</button>
        </div>
      )}
    </div>
  );
}
