import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Empty, timeAgo } from '@/ui';

interface Notification {
  id: string; type: string; title: string; body: string;
  candidateId?: string; candidateName?: string; at?: string; severity: string;
  cleared?: boolean;
}

const SEVERITY_ICON: Record<string, string> = {
  error: '🚨', warning: '⚠️', success: '✅', info: 'ℹ️',
};
const SEVERITY_COLOR: Record<string, string> = {
  error: 'text-red-600', warning: 'text-amber-600', success: 'text-green-600', info: 'text-blue-600',
};

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'success'>('all');

  const h = () => ({ 'Content-Type': 'application/json', 'x-admin-token': localStorage.getItem('qh_admin') ?? '' });

  useEffect(() => {
    fetch('/api/notifications', { headers: h() })
      .then((r) => r.json())
      .then((d) => { setNotifications(d.notifications || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const clearAll = () => setCleared(new Set(notifications.map((n) => n.id)));
  const clearOne = (id: string) => setCleared((s) => { const n = new Set(s); n.add(id); return n; });

  const visible = notifications.filter((n) => !cleared.has(n.id) && (filter === 'all' || n.severity === filter));
  const clearedList = notifications.filter((n) => cleared.has(n.id));

  const [showCleared, setShowCleared] = useState(false);
  const displayList = showCleared ? clearedList : visible;

  return (
    <>
      <PageHeader crumbs={[{ label: 'Notifications' }]}
        actions={
          <div className="flex gap-2">
            <button onClick={() => setShowCleared((s) => !s)} className="btn-ghost text-[13px]">
              {showCleared ? 'Show Active' : `Cleared (${clearedList.length})`}
            </button>
            {!showCleared && visible.length > 0 && <button onClick={clearAll} className="btn-ghost text-[13px]">Clear all</button>}
          </div>
        } />

      <div className="flex-1 overflow-y-auto p-6">
        {!showCleared && (
          <div className="flex gap-2 mb-4">
            {[['all', 'All'], ['error', '🚨 Critical'], ['warning', '⚠️ Warnings'], ['success', '✅ Completed']].map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key as any)}
                className={`px-3 py-1.5 text-[13px] font-semibold rounded-lg border ${filter === key ? 'bg-ink text-white border-ink' : 'border-line bg-surface text-muted hover:text-ink'}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {loading && <Empty icon="⏳" title="Loading notifications…" />}
        {!loading && displayList.length === 0 && <Empty icon="🔔" title="All caught up" sub="No notifications match this filter." />}

        {!loading && displayList.length > 0 && (
          <div className="card divide-y divide-line/60">
            {displayList.map((n) => (
              <div key={n.id} className={`flex items-start gap-3 px-4 py-3.5 ${n.candidateId ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                onClick={n.candidateId ? () => navigate(`/candidates/${n.candidateId}`) : undefined}>
                <div className={`text-xl mt-0.5 ${SEVERITY_COLOR[n.severity] || ''}`}>{SEVERITY_ICON[n.severity] || '🔔'}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-ink">{n.title}</div>
                  <div className="text-[13px] text-muted">{n.body}</div>
                  {n.candidateName && <div className="text-[11px] text-muted mt-0.5">Driver: {n.candidateName}</div>}
                  {n.at && <div className="text-[11px] text-muted mt-0.5">{timeAgo(n.at)}</div>}
                </div>
                {!showCleared && (
                  <button onClick={(e) => { e.stopPropagation(); clearOne(n.id); }} className="text-[12px] text-muted hover:text-primary flex-shrink-0 mt-1">
                    Clear
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
