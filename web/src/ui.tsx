import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const PILL_MAP: Record<string, string> = {
  // stages
  Lead: 'pill-slate', Screening: 'pill-blue', 'Background Check': 'pill-amber',
  Offer: 'pill-purple', Onboarding: 'pill-green',
  // statuses
  active: 'pill-green', Available: 'pill-green', Complete: 'pill-green', complete: 'pill-green',
  valid: 'pill-green', ACTIVE: 'pill-green', submitted: 'pill-purple', Submitted: 'pill-purple',
  pending: 'pill-amber', 'In Progress': 'pill-amber', in_progress: 'pill-amber',
  ready: 'pill-blue', 'Ready to Run': 'pill-blue',
  Missing: 'pill-red', missing: 'pill-red', terminated: 'pill-red', action: 'pill-red',
  'Action Needed': 'pill-red', not_started: 'pill-slate', inactive: 'pill-slate',
  unassigned: 'pill-slate', Home: 'pill-slate', Shop: 'pill-red', 'In-Transit': 'pill-blue',
  Assigned: 'pill-purple', pending_auth: 'pill-amber',
};

export function Pill({ children, kind }: { children: ReactNode; kind?: string }) {
  const cls = PILL_MAP[kind ?? String(children)] ?? 'pill-slate';
  return <span className={`pill ${cls}`}>{children}</span>;
}

export function StatCard({ icon, value, label, tint }: { icon: string; value: ReactNode; label: string; tint: string }) {
  return (
    <div className="card p-4 flex items-center gap-4 shadow-card">
      <div className="w-11 h-11 rounded-[10px] grid place-items-center text-xl" style={{ background: tint }}>{icon}</div>
      <div>
        <div className="text-2xl font-extrabold text-ink leading-none">{value}</div>
        <div className="text-xs text-muted mt-1">{label}</div>
      </div>
    </div>
  );
}

export function PageHeader({ crumbs, actions }: { crumbs: { label: string; to?: string }[]; actions?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="flex items-center gap-3 px-6 py-3.5 border-b border-line bg-surface sticky top-0 z-10">
      <button onClick={() => nav(-1)} title="Back"
        className="grid place-items-center w-7 h-7 rounded-lg text-muted hover:bg-[var(--surface-hover)] hover:text-ink transition">‹</button>
      <nav className="flex items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted">›</span>}
              {c.to && !last ? (
                <Link to={c.to} className="text-muted hover:text-primary transition">{c.label}</Link>
              ) : (
                <span className={last ? 'font-semibold text-ink' : 'text-muted'}>{c.label}</span>
              )}
            </span>
          );
        })}
      </nav>
      <div className="flex-1" />
      {actions}
    </div>
  );
}

export function timeAgo(date: string | Date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function timeSince(date: string | Date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  const m = Math.floor(s / 60), h = Math.floor(m / 60), days = Math.floor(h / 24);
  if (days > 0) return `${days}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

export function isStale(date: string | Date, hours = 48) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return Date.now() - d.getTime() > hours * 3600000;
}

export function Empty({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="grid place-items-center text-center py-12 px-6">
      <div className="text-4xl mb-3">{icon}</div>
      <div className="text-base font-bold text-ink">{title}</div>
      {sub && <div className="text-sm text-muted mt-1">{sub}</div>}
    </div>
  );
}
