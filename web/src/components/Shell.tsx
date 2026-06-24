import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import Icon from '@/components/Icon';
import TaskModal from '@/components/TaskModal';
import type { Role } from '@/types';

const ROLES: Role[] = ['Recruiter', 'Owner', 'Super Admin'];
const ROLE_ICON: Record<Role, string> = { Recruiter: '📞', Owner: '👑', 'Super Admin': '🛡' };

function can(role: Role, cap: 'research' | 'people' | 'admin' | 'multicarrier' | 'trucksEdit') {
  switch (cap) {
    case 'research': return role === 'Owner' || role === 'Super Admin';
    case 'people': return role === 'Owner' || role === 'Super Admin';
    case 'admin': return role === 'Owner' || role === 'Super Admin';
    case 'multicarrier': return role === 'Super Admin';
    case 'trucksEdit': return role === 'Owner' || role === 'Super Admin';
  }
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const s = useStore();
  const loc = useLocation();
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [carrierOpen, setCarrierOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickTask, setQuickTask] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(true); }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const cid = s.currentCarrierId;
  const link = (p: string) => `/carriers/${cid}/${p}`;

  const NavItem = ({ to, icon, label, badge }: { to: string; icon: string; label: string; badge?: string }) => (
    <NavLink to={to} className={({ isActive }) =>
      `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${isActive ? 'bg-primary-light text-primary font-semibold' : 'text-slate-300 hover:bg-white/5'}`}>
      <span className="w-5 text-center">{icon}</span>
      {!collapsed && <span className="flex-1">{label}</span>}
      {!collapsed && badge && <span className="text-[10px] font-bold bg-danger text-white rounded-full px-1.5 py-0.5">{badge}</span>}
    </NavLink>
  );

  const SectionLabel = ({ children }: { children: React.ReactNode }) =>
    collapsed ? <div className="my-2 border-t border-white/10" /> : <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide px-3 mt-4 mb-1.5">{children}</div>;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-60'} flex-shrink-0 bg-[#0f172a] text-slate-200 flex flex-col transition-all duration-200`}>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
          {/* User switcher */}
          <div className="relative">
            <button onClick={() => { setRoleOpen((o) => !o); setCarrierOpen(false); }}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple grid place-items-center text-sm font-bold text-white">{s.role[0]}</div>
              {!collapsed && <div className="text-left flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">Fleet Admin</div>
                <div className="text-[11px] text-slate-400">{ROLE_ICON[s.role]} {s.role}</div>
              </div>}
              {!collapsed && <span className="text-slate-500">▾</span>}
            </button>
            {roleOpen && (
              <div className="absolute left-0 right-0 mt-1 bg-[#1e293b] border border-white/10 rounded-lg p-1 z-20 shadow-pop">
                {ROLES.map((r) => (
                  <button key={r} onClick={() => { s.setRole(r); setRoleOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 rounded text-sm flex items-center gap-2 ${s.role === r ? 'text-primary' : 'text-slate-300 hover:bg-white/5'}`}>
                    <span>{ROLE_ICON[r]}</span> {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          <NavItem to="/dashboard" icon="⊞" label="Dashboard" />

          <SectionLabel>Features</SectionLabel>
          <NavItem to="/notifications" icon="🔔" label="Notifications" badge="3" />
          <NavItem to="/inbox" icon="✉" label="Inbox" />
          <NavItem to="/tasks" icon="✓" label="Tasks" badge="5" />
          {can(s.role, 'research') && <NavItem to="/research" icon="🔍" label="Research" />}
          {/* Anna lives outside the SPA (standalone page), so use a real anchor. */}
          <a href="/anna" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition text-slate-300 hover:bg-white/5">
            <span className="w-5 text-center">🤖</span>
            {!collapsed && <span className="flex-1">Anna — AI Agent</span>}
          </a>

          {/* Carrier badge */}
          <div className="relative mt-3">
            <button onClick={() => { setCarrierOpen((o) => !o); setRoleOpen(false); }}
              className="w-full flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10">
              <span className="w-2 h-2 rounded-full bg-success" />
              {!collapsed && <div className="text-left flex-1 min-w-0">
                <div className="text-[12px] font-semibold truncate">{s.currentCarrier.name}</div>
                <div className="text-[10px] text-slate-400">DOT {s.currentCarrier.dot}</div>
              </div>}
              {!collapsed && <span className="text-slate-500">▾</span>}
            </button>
            {carrierOpen && (
              <div className="absolute left-0 right-0 mt-1 bg-[#1e293b] border border-white/10 rounded-lg p-1 z-20 shadow-pop">
                {s.carriers.map((c) => (
                  <button key={c.id} onClick={() => { s.setCurrentCarrierId(c.id); setCarrierOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 rounded text-[12px] ${c.id === cid ? 'text-primary' : 'text-slate-300 hover:bg-white/5'}`}>
                    {c.name}
                  </button>
                ))}
                <Link to="/carriers" onClick={() => setCarrierOpen(false)} className="block px-3 py-1.5 rounded text-[12px] text-slate-400 border-t border-white/10 mt-1">＋ Manage carriers</Link>
              </div>
            )}
          </div>

          <SectionLabel>Manage</SectionLabel>
          <NavItem to={link('hiring')} icon="🧭" label="Hiring" />
          <NavItem to={link('drivers')} icon="🚚" label="Drivers" />
          <NavItem to={link('trucks')} icon="🚛" label="Trucks" />
          <NavItem to="/carriers" icon="🏢" label="Carriers" />
          {can(s.role, 'people') && (
            <NavItem to="/employees" icon="👥" label="Employees" />
          )}
          <NavItem to="/departments" icon="🗂" label="Departments" />
          {can(s.role, 'admin') && <NavItem to={link('administration')} icon="⚙" label="Administration" />}
          <NavItem to="/settings" icon="🛠" label="Settings" />
          <NavItem to="/settings#screening" icon="✅" label="Driver Screening" />

          {can(s.role, 'multicarrier') && <>
            <SectionLabel>My Carriers</SectionLabel>
            {s.carriers.map((c) => (
              <button key={c.id} onClick={() => s.setCurrentCarrierId(c.id)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] ${c.id === cid ? 'text-primary' : 'text-slate-400 hover:bg-white/5'}`}>
                <span>●</span> {!collapsed && <span className="truncate">{c.name}</span>}
              </button>
            ))}
          </>}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1 p-2 border-t border-white/10">
          <button onClick={() => setPaletteOpen(true)} className="flex-1 grid place-items-center py-2 rounded hover:bg-white/5" title="Search (Ctrl+K)">⌕</button>
          <button onClick={s.toggleTheme} className="flex-1 grid place-items-center py-2 rounded hover:bg-white/5" title="Toggle theme">{s.theme === 'dark' ? '☀' : '🌙'}</button>
          <button onClick={() => setCollapsed((c) => !c)} className="flex-1 grid place-items-center py-2 rounded hover:bg-white/5" title="Collapse">{collapsed ? '›' : '‹'}</button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>

      {/* Create-anywhere: floating New Task button, available on every page */}
      <button onClick={() => setQuickTask(true)} title="Create a task (works anywhere)"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-primary text-white font-semibold rounded-full pl-4 pr-5 py-3 shadow-pop hover:-translate-y-0.5 transition">
        <Icon name="plus" size={18} /> New Task
      </button>

      {paletteOpen && <CommandPalette
        onClose={() => setPaletteOpen(false)}
        onGo={(to) => { nav(to); setPaletteOpen(false); }}
        onCreateTask={() => { setPaletteOpen(false); setQuickTask(true); }} />}
      {quickTask && <TaskModal createSeed={{ assignee: s.currentUser }} onClose={() => setQuickTask(false)} />}
    </div>
  );
}

function CommandPalette({ onClose, onGo, onCreateTask }: { onClose: () => void; onGo: (to: string) => void; onCreateTask: () => void }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const ql = q.toLowerCase().trim();
  const hits = ql ? [
    ...s.drivers.filter((d) => d.name.toLowerCase().includes(ql)).map((d) => ({ type: 'Driver', name: d.name, sub: d.license, to: `/carriers/${d.carrierId}/drivers/${d.id}` })),
    ...s.candidates.filter((c) => c.name.toLowerCase().includes(ql)).map((c) => ({ type: 'Candidate', name: c.name, sub: c.email, to: `/carriers/${c.carrierId}/hiring/${c.id}` })),
    ...s.trucks.filter((t) => t.unit.includes(ql) || t.vin.toLowerCase().includes(ql)).map((t) => ({ type: 'Truck', name: `Unit #${t.unit}`, sub: t.vin, to: `/carriers/${t.carrierId}/trucks/${t.id}` })),
    ...s.carriers.filter((c) => c.name.toLowerCase().includes(ql)).map((c) => ({ type: 'Carrier', name: c.name, sub: `DOT ${c.dot}`, to: `/carriers/${c.id}` })),
  ].slice(0, 8) : [];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-24" onClick={onClose}>
      <div className="bg-surface border border-line rounded-xl w-[560px] max-w-[90vw] shadow-pop overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
          <span className="text-muted">⌕</span>
          <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find or ask — drivers, trucks, candidates, carriers…"
            className="flex-1 bg-transparent outline-none text-sm text-ink" />
          <kbd className="text-[11px] text-muted border border-line rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div className="p-2 max-h-80 overflow-y-auto">
          <button onClick={onCreateTask} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--surface-hover)] text-left text-primary font-semibold text-sm">
            <Icon name="plus" size={16} /> Create new task
          </button>
          <div className="border-t border-line my-1" />
          {!ql && <div className="p-5 text-center text-sm text-muted">Start typing to search…</div>}
          {ql && hits.length === 0 && <div className="p-5 text-center text-sm text-muted">No results.</div>}
          {hits.map((h, i) => (
            <button key={i} onClick={() => onGo(h.to)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--surface-hover)] text-left">
              <span className="text-[11px] font-bold text-primary bg-primary-light px-2 py-0.5 rounded-full">{h.type}</span>
              <span className="text-sm font-semibold text-ink">{h.name}</span>
              <span className="text-xs text-muted ml-auto">{h.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
