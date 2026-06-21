import { useState } from 'react';
import { useStore } from '@/store';
import { PageHeader } from '@/ui';
import { TASKS } from '@/data/mock';
import type { Task, TaskStatus } from '@/types';

const COLUMNS: TaskStatus[] = ['TO DO', 'IN PROGRESS', 'REVIEW NEEDED', 'LONG-TERM', 'COMPLETE'];
const SPACES = ['Safety', 'HR', 'Dispatch', 'Accounting', 'Claims', 'ELD', 'Driver Relations'];
const PRIORITY_COLOR: Record<string, string> = { Urgent: 'text-danger', High: 'text-warn', Normal: 'text-muted' };

export default function Departments() {
  const s = useStore();
  const [space, setSpace] = useState('Driver Relations');
  const [tasks, setTasks] = useState<Task[]>(TASKS.filter((t) => t.carrierId === s.currentCarrierId));
  const [open, setOpen] = useState<Task | null>(null);
  const [drag, setDrag] = useState<string | null>(null);

  const move = (id: string, status: TaskStatus) => setTasks((p) => p.map((t) => t.id === id ? { ...t, status } : t));

  return (
    <>
      <PageHeader crumbs={[{ label: 'Departments' }, { label: space }]} />
      <div className="flex-1 overflow-hidden flex flex-col p-6">
        <div className="flex gap-1 mb-4 flex-wrap">
          {SPACES.map((sp) => (
            <button key={sp} onClick={() => setSpace(sp)} className={`px-3 py-1.5 text-[13px] font-medium rounded-lg ${space === sp ? 'bg-primary-light text-primary' : 'text-muted hover:bg-[var(--surface-hover)]'}`}>{sp}</button>
          ))}
        </div>

        <div className="flex-1 overflow-x-auto flex gap-3.5 items-start">
          {COLUMNS.map((col) => {
            const items = tasks.filter((t) => t.status === col);
            return (
              <div key={col} className="w-64 flex-shrink-0 bg-bg border border-line rounded-xl flex flex-col max-h-full"
                onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) move(drag, col); setDrag(null); }}>
                <div className="flex items-center gap-2 p-3 border-b border-line">
                  <span className="text-[12px] font-bold text-ink uppercase">{col}</span>
                  <span className="text-[11px] bg-surface border border-line rounded-full px-2 text-muted">{items.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2.5 min-h-[60px]">
                  {items.map((t) => (
                    <div key={t.id} draggable onDragStart={() => setDrag(t.id)} onClick={() => setOpen(t)}
                      className="card p-3 cursor-grab hover:shadow-card">
                      <div className="text-[13px] font-semibold text-ink mb-2">{t.title}</div>
                      <div className="flex items-center gap-2 text-[11px] text-muted">
                        {t.priority && <span className={PRIORITY_COLOR[t.priority]}>⚑ {t.priority}</span>}
                        {t.due && <span>📅 {new Date(t.due).toLocaleDateString()}</span>}
                        <span className="ml-auto">💬 {t.comments} · 📎 {t.attachments}</span>
                      </div>
                      {t.assignee && <div className="w-6 h-6 rounded-full bg-primary text-white text-[10px] grid place-items-center mt-2">{t.assignee}</div>}
                    </div>
                  ))}
                  <button className="text-[12px] text-muted text-left px-2 py-1 hover:text-primary">＋ Add Task</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {open && <TaskDetail task={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
      <div className="w-[460px] max-w-full bg-surface h-full overflow-y-auto p-6 shadow-pop" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="text-muted mb-4">✕ Close</button>
        <h2 className="text-lg font-extrabold text-ink mb-4">{task.title}</h2>
        {[['Status', task.status], ['Assignee', task.assignee ?? '—'], ['Due', task.due ? new Date(task.due).toLocaleDateString() : '—'], ['Priority', task.priority ?? 'Normal']].map(([k, v]) => (
          <div key={k} className="flex justify-between py-2 border-b border-line/60"><span className="text-[13px] text-muted">{k}</span><span className="text-[13px] font-semibold text-ink">{v}</span></div>
        ))}
        <div className="mt-5"><div className="text-[12px] font-bold text-muted uppercase mb-2">Subtasks</div>
          <label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" /> Confirm documents received</label></div>
        <div className="mt-5"><div className="text-[12px] font-bold text-muted uppercase mb-2">Checklist</div>
          <label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" defaultChecked /> Initial review</label></div>
        <div className="mt-5"><div className="text-[12px] font-bold text-muted uppercase mb-2">Attachments</div>
          <div className="border-2 border-dashed border-line rounded-xl p-5 text-center text-[12px] text-muted">Drop files to upload</div></div>
        <div className="mt-5"><div className="text-[12px] font-bold text-muted uppercase mb-2">Comments</div>
          <textarea placeholder="Add a comment… (@mention)" className="input h-20 resize-none" /></div>
      </div>
    </div>
  );
}
