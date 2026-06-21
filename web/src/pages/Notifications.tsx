import { useState } from 'react';
import { PageHeader, Empty } from '@/ui';
import { NOTIFICATIONS } from '@/data/mock';

const TABS = ['Primary', 'Other', 'Later', 'Cleared'];

export default function Notifications() {
  const [tab, setTab] = useState('Primary');
  const [items, setItems] = useState(NOTIFICATIONS);
  const clear = (id: string) => setItems((p) => p.map((n) => n.id === id ? { ...n, cleared: true } : n));

  const groups = ['Yesterday', 'Last 7 days'] as const;
  const active = items.filter((n) => tab === 'Cleared' ? n.cleared : !n.cleared);

  return (
    <>
      <PageHeader crumbs={[{ label: 'Notifications' }]}
        actions={<button onClick={() => setItems((p) => p.map((n) => ({ ...n, cleared: true })))} className="btn-ghost">Clear all</button>} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex gap-1 mb-4">
          {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-[13px] font-semibold rounded-lg ${tab === t ? 'bg-primary-light text-primary' : 'text-muted'}`}>{t}</button>)}
        </div>
        {active.length === 0 && <Empty icon="🔔" title="Nothing here" sub="You're all caught up." />}
        {groups.map((g) => {
          const rows = active.filter((n) => n.group === g);
          if (!rows.length) return null;
          return (
            <div key={g} className="mb-5">
              <div className="text-[11px] font-bold text-muted uppercase mb-2">{g}</div>
              <div className="card divide-y divide-line/60">
                {rows.map((n) => (
                  <div key={n.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-primary text-white text-[12px] grid place-items-center">{n.actor[0]}</div>
                    <div className="flex-1"><div className="text-[13px] text-ink"><b>{n.actor}</b> {n.event}</div><div className="text-[11.5px] text-muted">{n.time}</div></div>
                    {n.priority && <span className={`text-[11px] ${n.priority === 'Urgent' ? 'text-danger' : 'text-warn'}`}>⚑</span>}
                    {tab !== 'Cleared' && <button onClick={() => clear(n.id)} className="text-[12px] text-muted hover:text-primary">Clear</button>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
