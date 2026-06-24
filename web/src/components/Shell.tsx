import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import Icon from '@/components/Icon';
import TaskModal from '@/components/TaskModal';

import { NOTIFICATIONS } from '@/data/mock';

import AnnaAssistant from '@/components/AnnaAssistant';

import type { Role } from '@/types';

const ROLES: Role[] = ['Recruiter', 'Owner', 'Super Admin'];
const ROLE_ICON: Record<Role, string> = { Recruiter: 'phone', Owner: 'crown', 'Super Admin': 'shield' };

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

  // The carrier you're working in follows the URL — there is no manual carrier
  // switch. Opening /carriers/:id/* scopes drivers, trucks, hiring, etc. to that
  // carrier; you change carriers by navigating into one from the Carriers list.
  const routeCarrierId = loc.pathname.match(/^\/carriers\/(?!profile(?:\/|$))([^/]+)/)?.[1];
  useEffect(() => {
    if (routeCarrierId && routeCarrierId !== s.currentCarrierId) s.setCurrentCarrierId(routeCarrierId);
  }, [routeCarrierId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cid = s.currentCarrierId;
  const link = (p: string) => `/carriers/${cid}/${p}`;

  // Live badge counts (no more hardcoded numbers)
  const notifCount = NOTIFICATIONS.filter((n) => !n.cleared).length;
  const taskCount = s.allTasks.filter((t) => t.assignee === s.currentUser && t.status !== 'COMPLETE').length;

  const itemCls = (active: boolean) =>
    `relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${collapsed ? 'justify-center' : ''} ${
      active ? 'bg-primary text-white font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.25)]' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
    }`;

  const NavItem = ({ to, icon, label, badge, activeWhen }: {
    to: string; icon: string; label: string; badge?: number; activeWhen?: boolean;
  }) => (
    <NavLink to={to} title={collapsed ? label : undefined} end={to === '/settings'}
      className={({ isActive }) => itemCls(activeWhen ?? isActive)}>
      <Icon name={icon} size={18} className="flex-shrink-0" />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && badge ? <span className="text-[10px] font-bold bg-danger text-white rounded-full min-w-[18px] text-center px-1.5 py-0.5">{badge}</span> : null}
      {collapsed && badge ? <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger ring-2 ring-[#0f172a]" /> : null}
    </NavLink>
  );

  const SectionLabel = ({ children }: { children: React.ReactNode }) =>
    collapsed ? <div className="my-2 border-t border-white/10" /> : <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide px-3 mt-4 mb-1.5">{children}</div>;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-60'} flex-shrink-0 bg-[#0f172a] border-r border-white/5 text-slate-200 flex flex-col transition-all duration-200`}>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
          {/* Click-away backdrop for the dropdowns */}
          {(roleOpen || carrierOpen) && (
            <div className="fixed inset-0 z-10" onClick={() => { setRoleOpen(false); setCarrierOpen(false); }} />
          )}

          {/* User switcher */}

          <div className="relative z-20">
            <button onClick={() => { setRoleOpen((o) => !o); setCarrierOpen(false); }}

          <div className="relative">
            <button onClick={() => setRoleOpen((o) => !o)}

              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple grid place-items-center text-sm font-bold text-white flex-shrink-0">{s.role[0]}</div>
              {!collapsed && <div className="text-left flex-1 min-w-0">
                <div className="text-sm font-semibold truncate text-white">Fleet Admin</div>
                <div className="text-[11px] text-slate-400 flex items-center gap-1"><Icon name={ROLE_ICON[s.role]} size={11} /> {s.role}</div>
              </div>}
              {!collapsed && <Icon name="chevronDown" size={14} className="text-slate-500" />}
            </button>
            {roleOpen && (
              <div className={`absolute mt-1 bg-[#1e293b] border border-white/10 rounded-lg p-1 z-30 shadow-pop ${collapsed ? 'left-full ml-2 top-0 w-48' : 'left-0 right-0'}`}>
                {ROLES.map((r) => (
                  <button key={r} onClick={() => { s.setRole(r); setRoleOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 rounded text-sm flex items-center gap-2 ${s.role === r ? 'bg-primary/15 text-white font-semibold' : 'text-slate-300 hover:bg-white/5'}`}>
                    <Icon name={ROLE_ICON[r]} size={14} /> {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-2" />
          <NavItem to="/dashboard" icon="layout" label="Dashboard" />

          <SectionLabel>Features</SectionLabel>

          <NavItem to="/notifications" icon="bell" label="Notifications" badge={notifCount} />
          <NavItem to="/inbox" icon="mail" label="Inbox" />
          <NavItem to="/tasks" icon="listChecklist" label="Tasks" badge={taskCount} />
          {can(s.role, 'research') && <NavItem to="/research" icon="search" label="Research" />}

          {/* Carrier badge */}
          <div className="relative z-20 mt-3">
            <button onClick={() => { setCarrierOpen((o) => !o); setRoleOpen(false); }}
              title={collapsed ? s.currentCarrier.name : undefined}
              className={`w-full flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 ${collapsed ? 'justify-center' : ''}`}>
              <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
              {!collapsed && <div className="text-left flex-1 min-w-0">
                <div className="text-[12px] font-semibold truncate text-white">{s.currentCarrier.name}</div>
                <div className="text-[10px] text-slate-400">DOT {s.currentCarrier.dot}</div>
              </div>}
              {!collapsed && <Icon name="chevronDown" size={14} className="text-slate-500" />}
            </button>
            {carrierOpen && (
              <div className={`absolute mt-1 bg-[#1e293b] border border-white/10 rounded-lg p-1 z-30 shadow-pop ${collapsed ? 'left-full ml-2 top-0 w-56' : 'left-0 right-0'}`}>
                {s.carriers.map((c) => (
                  <button key={c.id} onClick={() => { s.setCurrentCarrierId(c.id); setCarrierOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 rounded text-[12px] flex items-center gap-2 ${c.id === cid ? 'bg-primary/15 text-white font-semibold' : 'text-slate-300 hover:bg-white/5'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${c.id === cid ? 'bg-success' : 'bg-slate-500'}`} /> {c.name}
                  </button>
                ))}
                <Link to="/carriers" onClick={() => setCarrierOpen(false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] text-slate-400 hover:text-white border-t border-white/10 mt-1"><Icon name="plus" size={12} /> Manage carriers</Link>
              </div>
            )}
          </div>

          <NavItem to="/notifications" icon="🔔" label="Notifications" badge="3" />
          <NavItem to="/inbox" icon="✉" label="Inbox" />
          <NavItem to="/tasks" icon="✓" label="Tasks" badge="5" />
          {can(s.role, 'research') && <NavItem to="/research" icon="🔍" label="Research" />}
          {/* Anna lives outside the SPA (standalone page), so use a real anchor. */}
          <a href="/anna" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition text-slate-300 hover:bg-white/5">
            <span className="w-5 text-center">🤖</span>
            {!collapsed && <span className="flex-1">Anna — AI Agent</span>}
          </a>
          {/* DocuSign console is also a standalone page — real anchor, not a route. */}
          <a href="/docusign" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition text-slate-300 hover:bg-white/5">
            <span className="w-5 text-center">📄</span>
            {!collapsed && <span className="flex-1">DocuSign — e-Sign</span>}
          </a>

          {/* Carrier-in-context chip — read-only. Shows which carrier the
              Manage section is scoped to; click to open that carrier, or use the
              Carriers list to work in a different one. No live switching. */}
          <Link to={cid ? `/carriers/${cid}` : '/carriers'} title="Carrier in context — open Carriers to switch"
            className="mt-3 w-full flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10">
            <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
            {!collapsed && <div className="text-left flex-1 min-w-0">
              <div className="text-[12px] font-semibold truncate">{s.currentCarrier.name}</div>
              <div className="text-[10px] text-slate-400">DOT {s.currentCarrier.dot}</div>
            </div>}
            {!collapsed && <span className="text-slate-500 text-[10px]">↗</span>}
          </Link>


          <SectionLabel>Manage</SectionLabel>
          <NavItem to={link('hiring')} icon="compass" label="Hiring" />
          <NavItem to={link('drivers')} icon="idCard" label="Drivers" />
          <NavItem to={link('trucks')} icon="truck" label="Trucks" />
          <NavItem to="/carriers" icon="building" label="Carriers" />
          {can(s.role, 'people') && (
            <NavItem to="/employees" icon="users" label="Employees" />
          )}

          <NavItem to="/departments" icon="folder" label="Departments" />
          {can(s.role, 'admin') && <NavItem to={link('administration')} icon="cog" label="Administration" />}
          <NavItem to="/settings" icon="wrench" label="Settings" activeWhen={loc.pathname === '/settings' && loc.hash !== '#screening'} />
          <NavItem to="/settings#screening" icon="shield" label="Driver Screening" activeWhen={loc.pathname === '/settings' && loc.hash === '#screening'} />

          <NavItem to="/departments" icon="🗂" label="Departments" />
          {can(s.role, 'admin') && <NavItem to={link('administration')} icon="⚙" label="Administration" />}
          <NavItem to="/settings" icon="🛠" label="Settings" />
          <NavItem to="/settings#screening" icon="✅" label="Driver Screening" />

        </div>

        {/* Footer */}
        <div className={`flex items-center gap-1 p-2 border-t border-white/10 ${collapsed ? 'flex-col' : ''}`}>
          <button onClick={() => setPaletteOpen(true)} className="flex-1 w-full grid place-items-center py-2 rounded text-slate-400 hover:text-white hover:bg-white/5" title="Search (Ctrl+K)"><Icon name="search" size={17} /></button>
          <button onClick={s.toggleTheme} className="flex-1 w-full grid place-items-center py-2 rounded text-slate-400 hover:text-white hover:bg-white/5" title={s.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}><Icon name={s.theme === 'dark' ? 'sun' : 'moon'} size={17} /></button>
          <button onClick={() => setCollapsed((c) => !c)} className="flex-1 w-full grid place-items-center py-2 rounded text-slate-400 hover:text-white hover:bg-white/5" title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={17} /></button>
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

      {/* Anna — app-wide AI assistant (ask questions, assign tasks anywhere) */}
      <AnnaAssistant />
    </div>
  );
}

function CommandPalette({ onClose, onGo, onCreateTask }: { onClose: () => void; onGo: (to: string) => void; onCreateTask: () => void }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const carrierName = (id: string) => s.carriers.find((c) => c.id === id)?.name ?? '';
  const ql = q.toLowerCase().trim();
  // Search spans every carrier (there is no single active carrier to scope to);
  // each hit shows its carrier so you know where you're navigating.
  const hits = ql ? [
    ...s.allDrivers.filter((d) => d.name.toLowerCase().includes(ql)).map((d) => ({ type: 'Driver', name: d.name, sub: carrierName(d.carrierId), to: `/carriers/${d.carrierId}/drivers/${d.id}` })),
    ...s.allCandidates.filter((c) => c.name.toLowerCase().includes(ql)).map((c) => ({ type: 'Candidate', name: c.name, sub: carrierName(c.carrierId), to: `/carriers/${c.carrierId}/hiring/${c.id}` })),
    ...s.allTrucks.filter((t) => t.unit.includes(ql) || t.vin.toLowerCase().includes(ql)).map((t) => ({ type: 'Truck', name: `Unit #${t.unit}`, sub: carrierName(t.carrierId), to: `/carriers/${t.carrierId}/trucks/${t.id}` })),
    ...s.carriers.filter((c) => c.name.toLowerCase().includes(ql)).map((c) => ({ type: 'Carrier', name: c.name, sub: `DOT ${c.dot}`, to: `/carriers/${c.id}` })),
  ].slice(0, 8) : [];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-24" onClick={onClose}>
      <div className="bg-surface border border-line rounded-xl w-[560px] max-w-[90vw] shadow-pop overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
          <Icon name="search" size={16} className="text-muted" />
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
