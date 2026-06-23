import { useState } from 'react';
import { useStore } from '@/store';
import { PageHeader, Pill } from '@/ui';
import Icon from '@/components/Icon';
import TaskModal from '@/components/TaskModal';
import type { Task, TaskStatus } from '@/types';

const STATUSES: TaskStatus[] = ['TO DO', 'IN PROGRESS', 'REVIEW NEEDED', 'LONG-TERM', 'COMPLETE'];
const PRIO: Record<string, string> = { Urgent: 'action', High: 'pending', Normal: 'not_started' };

export default function Tasks() {
  const s = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');

  const tasks = s.tasks.filter((t) => filter === 'all' || t.assignee === s.currentUser);

  return (
    <>
      <PageHeader crumbs={[{ label: 'Tasks' }]}
        actions={<button onClick={() => setCreating(true)} className="btn-primary">＋ New Task</button>} />
      <div className="flex-1 overflow-hidden flex flex-col p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex gap-1 bg-bg border border-line rounded-[10px] p-1">
            {(['all', 'mine'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-[13px] font-semibold rounded-lg ${filter === f ? 'bg-primary-light text-primary' : 'text-muted'}`}>
                {f === 'all' ? 'All tasks' : 'Assigned to me'}
              </button>
            ))}
          </div>
          <span className="text-[12.5px] text-muted">{s.currentCarrier?.name}</span>
        </div>

        <div className="flex-1 overflow-x-auto flex gap-3.5 items-start pb-2">
          {STATUSES.map((status) => {
            const col = tasks.filter((t) => t.status === status);
            return (
              <div key={status} className="w-64 flex-shrink-0 bg-bg border border-line rounded-xl flex flex-col max-h-full">
                <div className="flex items-center gap-2 p-3 border-b border-line">
                  <Pill kind={status === 'COMPLETE' ? 'active' : status === 'IN PROGRESS' ? 'pending' : 'ready'}>{status}</Pill>
                  <span className="text-[11px] font-bold bg-surface border border-line rounded-full px-2 text-muted">{col.length}</span>
                  <button onClick={() => setCreating(true)} className="ml-auto text-muted hover:text-primary" title="Add task"><Icon name="plus" size={15} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2.5 min-h-[60px]">
                  {col.map((t) => <Card key={t.id} task={t} onOpen={() => setOpenId(t.id)} />)}
                  {col.length === 0 && <div className="text-[12px] text-muted text-center py-3">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {creating && <TaskModal createSeed={{ assignee: s.currentUser }} onClose={() => setCreating(false)} />}
      {openId && <TaskModal taskId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function Card({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const done = (task.checklist ?? []).filter((c) => c.done).length;
  const total = (task.checklist ?? []).length;
  return (
    <div onClick={onOpen} className="card p-3 cursor-pointer hover:shadow-card transition">
      <div className="text-[13.5px] font-semibold text-ink mb-1.5">{task.title}</div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {task.priority && <Pill kind={PRIO[task.priority]}>{task.priority}</Pill>}
        {task.due && <span className="text-[11px] text-muted flex items-center gap-1"><Icon name="calendar" size={12} /> {new Date(task.due).toLocaleDateString()}</span>}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted">
        {task.assignee && (
          <span className="flex items-center gap-1">
            <span className="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-purple grid place-items-center text-[9px] font-bold text-white">{task.assignee[0]}</span>
            {task.assignee}
          </span>
        )}
        {total > 0 && <span className="flex items-center gap-1"><Icon name="check" size={12} /> {done}/{total}</span>}
        {(task.commentList?.length ?? 0) > 0 && <span>💬 {task.commentList!.length}</span>}
      </div>
    </div>
  );
}
