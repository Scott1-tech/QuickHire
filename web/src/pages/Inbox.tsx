import { useState } from 'react';
import { useStore } from '@/store';
import { PageHeader, Pill, Empty } from '@/ui';
import Icon from '@/components/Icon';
import TaskModal from '@/components/TaskModal';

const CONVS = [
  { id: 1, channel: '📧', name: 'ROBERT JOHNSON', preview: 'Thanks, I just submitted my application…', time: '2h', pending: true, carrier: 'GRAND ONE LLC', label: 'Candidate' },
  { id: 2, channel: '💬', name: '+1 (555) 010-2233', preview: 'Got the link, filling it out now', time: '4h', pending: false, carrier: 'GRAND ONE LLC', label: 'Candidate' },
  { id: 3, channel: '📞', name: 'MARIA GARCIA', preview: 'Missed call · 3m', time: '1d', pending: false, carrier: 'GRAND ONE LLC', label: 'Driver' },
];
const PRIO: Record<string, string> = { Urgent: 'action', High: 'pending', Normal: 'not_started' };

export default function Inbox() {
  const s = useStore();
  const [tab, setTab] = useState<'messages' | 'tasks'>('messages');
  const [filter, setFilter] = useState('mine');
  const [showSettings, setShowSettings] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // Tasks assigned to the signed-in user show up right here in their inbox.
  const myTasks = s.allTasks.filter((t) => t.assignee === s.currentUser && t.status !== 'COMPLETE');

  return (
    <>
      <PageHeader crumbs={[{ label: 'Inbox' }]}
        actions={<button onClick={() => setShowSettings(true)} className="btn-ghost">⚙ Inbox Settings</button>} />
      <div className="flex-1 overflow-hidden p-6 flex flex-col">
        {/* Messages / Tasks switch */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex gap-1 bg-bg border border-line rounded-[10px] p-1">
            <button onClick={() => setTab('messages')} className={`px-3 py-1.5 text-[12.5px] font-semibold rounded-lg ${tab === 'messages' ? 'bg-primary-light text-primary' : 'text-muted'}`}>Messages</button>
            <button onClick={() => setTab('tasks')} className={`px-3 py-1.5 text-[12.5px] font-semibold rounded-lg flex items-center gap-1.5 ${tab === 'tasks' ? 'bg-primary-light text-primary' : 'text-muted'}`}>
              My Tasks {myTasks.length > 0 && <span className="text-[10px] font-bold bg-danger text-white rounded-full px-1.5">{myTasks.length}</span>}
            </button>
          </div>
          {tab === 'messages' && [['mine', 'Mine'], ['unassigned', 'Unassigned'], ['all', 'All (3)']].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 text-[12.5px] font-semibold rounded-lg ${filter === k ? 'bg-primary-light text-primary' : 'text-muted'}`}>{l}</button>
          ))}
        </div>

        {tab === 'messages' ? (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[200px_320px_1fr] border border-line rounded-xl overflow-hidden bg-surface">
            <div className="border-r border-line p-3 bg-bg overflow-y-auto hidden lg:block">
              {['📥 All conversations', '● Unreads', '⏳ Unattended', '🗄 Archived'].map((x) => <div key={x} className="px-2.5 py-2 rounded-lg text-[13px] hover:bg-[var(--surface-hover)] cursor-pointer">{x}</div>)}
              <div className="text-[10.5px] font-bold text-muted uppercase px-2 mt-4 mb-1.5">Labels</div>
              {['Driver', 'Candidate', 'Carrier'].map((x) => <div key={x} className="px-2.5 py-2 rounded-lg text-[13px] hover:bg-[var(--surface-hover)] cursor-pointer">● {x}</div>)}
              <div className="text-[10.5px] font-bold text-muted uppercase px-2 mt-4 mb-1.5">Contacts</div>
              {['Carrier', 'Driver', 'Candidate', 'Guest', 'Blocked'].map((x) => <div key={x} className="px-2.5 py-2 rounded-lg text-[13px] hover:bg-[var(--surface-hover)] cursor-pointer">{x}</div>)}
            </div>
            <div className="border-r border-line overflow-y-auto hidden lg:block">
              {CONVS.map((c) => (
                <div key={c.id} className="flex gap-2.5 px-3.5 py-3 border-b border-line/60 hover:bg-[var(--surface-hover)] cursor-pointer">
                  <div className="text-lg">{c.channel}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5"><span className="text-[13px] font-bold text-ink">{c.name}</span>{c.pending && <Pill kind="pending">pending</Pill>}<span className="text-[11px] text-muted ml-auto">{c.time}</span></div>
                    <div className="text-[12.5px] text-muted truncate my-0.5">{c.preview}</div>
                    <div className="flex gap-1.5 items-center"><span className="text-[10.5px] text-muted">{c.carrier}</span><Pill kind={c.label === 'Driver' ? 'active' : 'Submitted'}>{c.label}</Pill></div>
                  </div>
                </div>
              ))}
            </div>
            <Empty icon="💬" title="Select a conversation" sub="Choose a conversation from the list to start messaging." />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {myTasks.length === 0 ? (
              <Empty icon="✓" title="No tasks assigned to you" sub="When someone assigns you a task, it shows up here." />
            ) : (
              <div className="flex flex-col gap-2.5 max-w-3xl">
                {myTasks.map((t) => (
                  <div key={t.id} onClick={() => setOpenTaskId(t.id)} className="card p-4 flex items-center gap-3 cursor-pointer hover:shadow-card transition">
                    <span className="w-9 h-9 rounded-[10px] grid place-items-center bg-primary-light text-primary flex-shrink-0"><Icon name="clipboardCheck" size={18} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-semibold text-ink truncate">{t.title}</div>
                      <div className="text-[12px] text-muted flex items-center gap-2 mt-0.5">
                        <Pill kind={t.status === 'IN PROGRESS' ? 'pending' : 'ready'}>{t.status}</Pill>
                        {t.due && <span className="flex items-center gap-1"><Icon name="calendar" size={12} /> {new Date(t.due).toLocaleDateString()}</span>}
                        {s.carriers.find((c) => c.id === t.carrierId)?.name}
                      </div>
                    </div>
                    {t.priority && <Pill kind={PRIO[t.priority]}>{t.priority}</Pill>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showSettings && (
        <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={() => setShowSettings(false)}>
          <div className="card p-6 w-[440px] max-w-full shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-extrabold text-ink mb-4">Create inbox</div>
            <label className="field-label">Carrier</label>
            <select className="input mb-4">{s.carriers.map((c) => <option key={c.id}>{c.name}</option>)}</select>
            <div className="flex gap-1 bg-bg border border-line rounded-[10px] p-1 mb-4">
              <button className="flex-1 py-1.5 text-[13px] font-semibold rounded-lg bg-primary-light text-primary">📧 Email</button>
              <button className="flex-1 py-1.5 text-[13px] font-semibold rounded-lg text-muted">📞 Phone</button>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" defaultChecked /> Use system default configuration</label>
            <div className="flex gap-2 mt-5"><button onClick={() => setShowSettings(false)} className="btn-primary flex-1">Create inbox</button><button onClick={() => setShowSettings(false)} className="btn-ghost">Cancel</button></div>
          </div>
        </div>
      )}

      {openTaskId && <TaskModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </>
  );
}
