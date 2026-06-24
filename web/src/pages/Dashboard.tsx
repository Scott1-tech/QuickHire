import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store';
import { PageHeader, Pill, timeAgo } from '@/ui';
import Icon from '@/components/Icon';
import RecordModal from '@/components/RecordModal';
import CreateModal, { type CreateKind } from '@/components/CreateModal';

type Panel =
  | 'add-candidate' | 'add-driver' | 'add-carrier' | 'add-truck' | 'add-employee'
  | 'list-carriers' | 'list-drivers' | 'list-trucks' | 'list-candidates'
  | null;

export default function Dashboard() {
  const s = useStore();
  const [panel, setPanel] = useState<Panel>(null);
  const close = () => setPanel(null);

  const carrierName = (id: string) => s.carriers.find((c) => c.id === id)?.name ?? id;
  const recent = [...s.allCandidates].sort((a, b) => +new Date(b.stageEnteredAt) - +new Date(a.stageEnteredAt)).slice(0, 6);
  const activeDrivers = s.allDrivers.filter((d) => d.status === 'active');
  const availableTrucks = s.allTrucks.filter((t) => t.status === 'Available');

  // Quick actions — order requested: Candidate, Driver, Carrier, Truck, Employee.
  const quick = [
    { key: 'add-candidate' as const, icon: 'clipboardCheck', title: 'Add Candidate', sub: 'Start hiring pipeline', accent: '#8B5CF6', tint: '#EDE9FE' },
    { key: 'add-driver' as const, icon: 'wheel', title: 'Add Driver', sub: 'Onboard a new driver', accent: '#16A34A', tint: '#F0FDF4' },
    { key: 'add-carrier' as const, icon: 'building', title: 'Add Carrier', sub: 'Register a new MC/DOT', accent: '#6366F1', tint: '#EEF2FF' },
    { key: 'add-truck' as const, icon: 'truck', title: 'Add Truck', sub: 'Register fleet unit', accent: '#D97706', tint: '#FFF7ED' },
    { key: 'add-employee' as const, icon: 'users', title: 'Add Employee', sub: 'Invite a team member', accent: '#2563EB', tint: '#EFF6FF' },
  ];

  // Stat cards — each opens a centered list preview.
  const stats = [
    { key: 'list-carriers' as const, icon: 'building', value: s.carriers.length, label: 'Total Carriers', accent: '#6366F1', tint: '#EEF2FF' },
    { key: 'list-drivers' as const, icon: 'wheel', value: activeDrivers.length, label: 'Active Drivers', accent: '#16A34A', tint: '#F0FDF4' },
    { key: 'list-trucks' as const, icon: 'truck', value: availableTrucks.length, label: 'Available Trucks', accent: '#D97706', tint: '#FFF7ED' },
    { key: 'list-candidates' as const, icon: 'clipboardCheck', value: s.allCandidates.length, label: 'Pending Candidates', accent: '#8B5CF6', tint: '#EDE9FE' },
  ];

  const addKind: CreateKind | null = panel && panel.startsWith('add-') ? (panel.slice(4) as CreateKind) : null;

  return (
    <>
      <PageHeader crumbs={[{ label: 'FleetView' }, { label: 'Dashboard' }]} />
      <div className="flex-1 overflow-y-auto p-6">
        <h1 className="text-[22px] font-extrabold text-ink">Welcome back, {s.role}</h1>
        <p className="text-sm text-muted mb-6">Here's your fleet at a glance.</p>

        {/* Quick actions */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5 mb-7">
          {quick.map((q) => (
            <button key={q.key} onClick={() => setPanel(q.key)}
              className="card p-5 flex items-center gap-3.5 text-left hover:shadow-card hover:-translate-y-0.5 transition">
              <div className="w-10 h-10 rounded-[10px] grid place-items-center flex-shrink-0" style={{ background: q.tint, color: q.accent }}>
                <Icon name={q.icon} size={20} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-ink">{q.title}</div>
                <div className="text-xs text-muted truncate">{q.sub}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Stat cards (clickable) */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3.5 mb-7">
          {stats.map((st) => (
            <button key={st.key} onClick={() => setPanel(st.key)}
              className="card p-4 flex items-center gap-4 shadow-card text-left hover:shadow-pop hover:-translate-y-0.5 transition group">
              <div className="w-11 h-11 rounded-[10px] grid place-items-center flex-shrink-0" style={{ background: st.tint, color: st.accent }}>
                <Icon name={st.icon} size={22} />
              </div>
              <div>
                <div className="text-2xl font-extrabold text-ink leading-none">{st.value}</div>
                <div className="text-xs text-muted mt-1">{st.label}</div>
              </div>
              <span className="ml-auto self-start text-muted opacity-0 group-hover:opacity-100 transition">
                <Icon name="arrowRight" size={16} />
              </span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-line flex items-center">
              <span className="text-base font-bold text-ink">Recent Candidates</span>
              <Link to={`/carriers/${s.currentCarrierId}/hiring`} className="ml-auto text-[12.5px] text-primary font-semibold">View all →</Link>
            </div>
            {recent.map((c) => (
              <Link key={c.id} to={`/carriers/${c.carrierId}/hiring/${c.id}`}
                className="flex items-center gap-3 px-5 py-3 border-b border-line/60 hover:bg-[var(--surface-hover)]">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple grid place-items-center text-[13px] font-bold text-white">{c.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-bold text-ink">{c.name}</div>
                  <div className="text-xs text-muted">{carrierName(c.carrierId)}</div>
                </div>
                <Pill kind={c.stage}>{c.stage}</Pill>
                <span className="text-xs text-muted w-16 text-right">{timeAgo(c.stageEnteredAt)}</span>
              </Link>
            ))}
            {recent.length === 0 && <div className="px-5 py-10 text-center text-sm text-muted">No candidates yet.</div>}
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 text-[15px] font-bold text-ink mb-3">
              <span className="text-warn"><Icon name="calendar" size={18} /></span>
              Upcoming Expirations
            </div>
            <div className="grid place-items-center text-center py-10 px-4">
              <div className="w-12 h-12 rounded-full bg-[#F0FDF4] text-success grid place-items-center mb-3"><Icon name="shield" size={24} /></div>
              <div className="text-base font-bold text-ink">No upcoming expirations</div>
              <div className="text-sm text-muted mt-1">Registration, inspection, insurance & medical look good.</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Create modals (centered, ClickUp-style) ───────────────────────────── */}
      {addKind && <CreateModal kind={addKind} open onClose={close} />}

      {/* ── Stat list previews (centered) ─────────────────────────────────────── */}
      <RecordModal open={panel === 'list-carriers'} onClose={close} icon="building" tint="#EEF2FF" accent="#6366F1"
        typeLabel="Carriers" context={`${s.carriers.length} under management`}
        footer={<Link to="/carriers" onClick={close} className="text-[13px] font-semibold text-primary flex items-center gap-1.5">Go to Carriers <Icon name="arrowRight" size={15} /></Link>}>
        <div className="flex flex-col gap-2.5">
          {s.carriers.map((c) => (
            <Link key={c.id} to={`/carriers/${c.id}`} onClick={() => { s.setCurrentCarrierId(c.id); close(); }}
              className="card p-3.5 flex items-center gap-3 hover:shadow-card transition">
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-bold text-ink uppercase truncate">{c.name}</div>
                <div className="text-xs text-muted">USDOT {c.dot} · {c.mc.join(', ')}</div>
              </div>
              <Pill kind={c.authority === 'active' ? 'active' : 'pending'}>{c.authority}</Pill>
            </Link>
          ))}
        </div>
      </RecordModal>

      <RecordModal open={panel === 'list-drivers'} onClose={close} icon="wheel" tint="#F0FDF4" accent="#16A34A"
        typeLabel="Active Drivers" context={`${activeDrivers.length} currently active`}
        footer={<Link to={`/carriers/${s.currentCarrierId}/drivers`} onClick={close} className="text-[13px] font-semibold text-primary flex items-center gap-1.5">Go to Drivers <Icon name="arrowRight" size={15} /></Link>}>
        <ListOrEmpty empty={activeDrivers.length === 0} label="No active drivers yet.">
          {activeDrivers.map((d) => (
            <Link key={d.id} to={`/carriers/${d.carrierId}/drivers/${d.id}`} onClick={close}
              className="card p-3.5 flex items-center gap-3 hover:shadow-card transition">
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-bold text-ink uppercase truncate">{d.name}</div>
                <div className="text-xs text-muted">{carrierName(d.carrierId)} · {d.type === 'company' ? 'Company' : 'Owner Operator'}</div>
              </div>
              {d.driverStatus && <Pill kind={d.driverStatus}>{d.driverStatus}</Pill>}
            </Link>
          ))}
        </ListOrEmpty>
      </RecordModal>

      <RecordModal open={panel === 'list-trucks'} onClose={close} icon="truck" tint="#FFF7ED" accent="#D97706"
        typeLabel="Available Trucks" context={`${availableTrucks.length} ready to dispatch`}
        footer={<Link to={`/carriers/${s.currentCarrierId}/trucks`} onClick={close} className="text-[13px] font-semibold text-primary flex items-center gap-1.5">Go to Trucks <Icon name="arrowRight" size={15} /></Link>}>
        <ListOrEmpty empty={availableTrucks.length === 0} label="No available trucks right now.">
          {availableTrucks.map((t) => (
            <Link key={t.id} to={`/carriers/${t.carrierId}/trucks/${t.id}`} onClick={close}
              className="card p-3.5 flex items-center gap-3 hover:shadow-card transition">
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-bold text-ink truncate">#{t.unit} · {t.make} {t.model}</div>
                <div className="text-xs text-muted">{t.year} · {t.plate}</div>
              </div>
              <Pill kind={t.status}>{t.status}</Pill>
            </Link>
          ))}
        </ListOrEmpty>
      </RecordModal>

      <RecordModal open={panel === 'list-candidates'} onClose={close} icon="clipboardCheck" tint="#EDE9FE" accent="#8B5CF6"
        typeLabel="Pending Candidates" context={`${s.allCandidates.length} in the pipeline`}
        footer={<Link to={`/carriers/${s.currentCarrierId}/hiring`} onClick={close} className="text-[13px] font-semibold text-primary flex items-center gap-1.5">Go to Hiring <Icon name="arrowRight" size={15} /></Link>}>
        <ListOrEmpty empty={s.allCandidates.length === 0} label="No candidates in the pipeline.">
          {s.allCandidates.map((c) => (
            <Link key={c.id} to={`/carriers/${c.carrierId}/hiring/${c.id}`} onClick={close}
              className="card p-3.5 flex items-center gap-3 hover:shadow-card transition">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple grid place-items-center text-[13px] font-bold text-white flex-shrink-0">{c.name[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-bold text-ink uppercase truncate">{c.name}</div>
                <div className="text-xs text-muted truncate">{c.email}</div>
              </div>
              <Pill kind={c.stage}>{c.stage}</Pill>
            </Link>
          ))}
        </ListOrEmpty>
      </RecordModal>
    </>
  );
}

function ListOrEmpty({ empty, label, children }: { empty: boolean; label: string; children: React.ReactNode }) {
  if (empty) return <div className="text-center text-sm text-muted py-10">{label}</div>;
  return <div className="flex flex-col gap-2.5">{children}</div>;
}
