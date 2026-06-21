import { Link } from 'react-router-dom';
import { useStore } from '@/store';
import { PageHeader, StatCard, Pill, timeAgo, Empty } from '@/ui';
import { CARRIERS, DRIVERS, CANDIDATES } from '@/data/mock';

export default function Dashboard() {
  const s = useStore();
  const carrierName = (id: string) => CARRIERS.find((c) => c.id === id)?.name ?? id;
  const recent = [...CANDIDATES].sort((a, b) => +new Date(b.stageEnteredAt) - +new Date(a.stageEnteredAt)).slice(0, 6);

  const quick = [
    { to: `/carriers/${s.currentCarrierId}/drivers`, icon: '🚚', title: 'Add Driver', sub: 'Onboard a new driver', tint: '#F0FDF4' },
    { to: `/carriers/${s.currentCarrierId}/hiring`, icon: '➕', title: 'Add Candidate', sub: 'Start hiring pipeline', tint: '#EEF2FF' },
    { to: `/carriers/${s.currentCarrierId}/trucks`, icon: '🚛', title: 'Add Truck', sub: 'Register fleet unit', tint: '#FFF7ED' },
    { to: '/employees', icon: '👥', title: 'Add Employee', sub: 'Invite staff', tint: '#FDF2F8' },
  ];

  return (
    <>
      <PageHeader crumbs={[{ label: 'FleetView' }, { label: 'Dashboard' }]} />
      <div className="flex-1 overflow-y-auto p-6">
        <h1 className="text-[22px] font-extrabold text-ink">Welcome back, {s.role}! 👋</h1>
        <p className="text-sm text-muted mb-6">Here's your fleet at a glance.</p>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5 mb-7">
          {quick.map((q) => (
            <Link key={q.title} to={q.to} className="card p-5 flex items-center gap-3.5 hover:shadow-card transition">
              <div className="w-10 h-10 rounded-[10px] grid place-items-center text-xl" style={{ background: q.tint }}>{q.icon}</div>
              <div>
                <div className="text-sm font-bold text-ink">{q.title}</div>
                <div className="text-xs text-muted">{q.sub}</div>
              </div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3.5 mb-7">
          <StatCard icon="🏢" value={CARRIERS.length} label="Total Carriers" tint="#EEF2FF" />
          <StatCard icon="🚚" value={DRIVERS.filter((d) => d.status === 'active').length} label="Active Drivers" tint="#F0FDF4" />
          <StatCard icon="🚛" value={s.trucks.filter((t) => t.status === 'Available').length} label="Available Trucks" tint="#FFF7ED" />
          <StatCard icon="👤" value={s.candidates.length} label="Pending Candidates" tint="#EDE9FE" />
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
          </div>

          <div className="card p-5">
            <div className="text-[15px] font-bold text-ink mb-3">⚠️ Upcoming Expirations</div>
            <Empty icon="🗓" title="No upcoming expirations" sub="Registration, inspection, insurance & medical look good." />
          </div>
        </div>
      </div>
    </>
  );
}
