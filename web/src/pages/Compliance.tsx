import { useStore } from '@/store';
import { PageHeader, Pill, StatCard } from '@/ui';

// Aggregated expiring-document view across the active carrier's fleet & drivers.
export default function Compliance() {
  const s = useStore();
  const today = Date.now();
  const days = (d?: string) => (d ? Math.round((+new Date(d) - today) / 86400000) : null);

  const truckExpiries = s.trucks.flatMap((t) => [
    { who: `Unit #${t.unit}`, kind: 'Registration', d: t.regExpiry },
    { who: `Unit #${t.unit}`, kind: 'Annual Inspection', d: t.inspExpiry },
    { who: `Unit #${t.unit}`, kind: 'Insurance', d: t.insExpiry },
  ]).map((x) => ({ ...x, days: days(x.d) })).filter((x) => x.days != null).sort((a, b) => a.days! - b.days!);

  const tone = (n: number) => (n < 0 ? 'Missing' : n <= 14 ? 'Missing' : n <= 30 ? 'pending' : 'valid');

  return (
    <>
      <PageHeader crumbs={[{ label: 'Carriers' }, { label: s.currentCarrier.name }, { label: 'Compliance' }]} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3.5 mb-6">
          <StatCard icon="🚛" value={s.trucks.length} label="Fleet Units" tint="#FFF7ED" />
          <StatCard icon="⚠️" value={truckExpiries.filter((x) => x.days! <= 30).length} label="Expiring ≤ 30 days" tint="#FEE2E2" />
          <StatCard icon="📋" value={s.drivers.length} label="Drivers Tracked" tint="#EEF2FF" />
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line text-base font-bold text-ink">Upcoming Expirations</div>
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-line">
              {['Asset', 'Document', 'Expires', 'Days Left', 'Status'].map((h) => <th key={h} className="text-left px-5 py-3 text-[11px] font-bold text-muted uppercase">{h}</th>)}
            </tr></thead>
            <tbody>
              {truckExpiries.map((x, i) => (
                <tr key={i} className="border-b border-line/60 hover:bg-[var(--surface-hover)]">
                  <td className="px-5 py-3 text-[13px] font-semibold text-ink">{x.who}</td>
                  <td className="px-5 py-3 text-[13px]">{x.kind}</td>
                  <td className="px-5 py-3 text-[13px] text-muted">{x.d ? new Date(x.d).toLocaleDateString() : '—'}</td>
                  <td className={`px-5 py-3 text-[13px] font-bold ${x.days! <= 14 ? 'text-danger' : x.days! <= 30 ? 'text-warn' : 'text-muted'}`}>{x.days}d</td>
                  <td className="px-5 py-3"><Pill kind={tone(x.days!)}>{x.days! <= 14 ? 'Action Needed' : x.days! <= 30 ? 'Warning' : 'Valid'}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
