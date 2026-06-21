import { useStore } from '@/store';
import { PageHeader, StatCard, Pill, Empty } from '@/ui';

export default function CarrierOverview() {
  const s = useStore();
  const c = s.currentCarrier;

  return (
    <>
      <PageHeader crumbs={[{ label: 'Carriers' }, { label: c.name }]} />
      <div className="flex-1 overflow-y-auto p-6">
        <h1 className="text-[22px] font-extrabold text-ink uppercase mb-5">{c.name}</h1>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3.5 mb-6">
          <StatCard icon="🚚" value={s.drivers.filter((d) => d.status === 'active').length} label="Active Drivers" tint="#F0FDF4" />
          <StatCard icon="🚛" value={s.trucks.length} label="Fleet Size" tint="#FFF7ED" />
          <StatCard icon="✓" value={<Pill kind="active">active</Pill>} label="Authority" tint="#EEF2FF" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card p-5">
            <div className="flex items-center mb-4"><span className="text-base font-bold text-ink">Company Information</span>
              <button className="ml-auto text-muted hover:text-primary">✎</button></div>
            {[['Company Name', c.name], ['DOT Number', c.dot], ['MC Number(s)', c.mc.join(', ')], ['Phone', c.phone ?? '—'], ['Address', c.address ?? '—']].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2 border-b border-line/60 last:border-0">
                <span className="text-[13px] text-muted">{k}</span><span className="text-[13px] font-semibold text-ink">{v}</span>
              </div>
            ))}
          </div>

          <div className="card p-5">
            <div className="text-base font-bold text-ink mb-4">Compliance Overview</div>
            {[['Authority Status', 'active'], ['Fleet Size', String(s.trucks.length)], ['FMCSA Power Units', '14'], ['Driver Count', String(s.drivers.length)], ['FMCSA Drivers', '16']].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2 border-b border-line/60 last:border-0">
                <span className="text-[13px] text-muted">{k}</span><span className="text-[13px] font-semibold text-ink">{v}</span>
              </div>
            ))}
          </div>

          <div className="card p-5">
            <div className="flex items-center mb-2"><span className="text-base font-bold text-ink">Alerts</span>
              <button className="ml-auto btn-ghost py-1.5 text-[12px]">Scan</button></div>
            <Empty icon="✅" title="No active alerts" />
          </div>

          <div className="card p-5">
            <div className="text-base font-bold text-ink mb-2">Recent Activity</div>
            <Empty icon="🕓" title="No recent activity" />
          </div>
        </div>
      </div>
    </>
  );
}
