import { useState } from 'react';
import { PageHeader, Pill, Empty } from '@/ui';

// Carrier/driver lookup workspace. // TODO: connect to FMCSA SAFER / QC lookup API.
const SAMPLE = [
  { dot: '1234567', name: 'GRAND ONE LLC', authority: 'active', units: 14, drivers: 16, state: 'TX' },
  { dot: '2345678', name: 'DT NATIONAL TRANSPORTATION LLC', authority: 'active', units: 9, drivers: 11, state: 'GA' },
];

export default function Research() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<typeof SAMPLE | null>(null);

  return (
    <>
      <PageHeader crumbs={[{ label: 'Research' }]} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="card p-5 mb-5">
          <div className="text-base font-bold text-ink mb-3">Carrier Lookup</div>
          <div className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by USDOT, MC, or company name…" className="input flex-1" />
            <button onClick={() => setResults(SAMPLE)} className="btn-primary">Search</button>
          </div>
          <p className="text-[11px] text-muted mt-2">// TODO: connect to FMCSA SAFER / QCMobile API</p>
        </div>

        {!results && <Empty icon="🔍" title="Search the FMCSA database" sub="Look up carriers by DOT/MC to research authority, fleet size, and safety." />}
        {results && (
          <div className="card overflow-hidden">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-line">{['USDOT', 'Company', 'State', 'Power Units', 'Drivers', 'Authority'].map((h) => <th key={h} className="text-left px-5 py-3 text-[11px] font-bold text-muted uppercase">{h}</th>)}</tr></thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.dot} className="border-b border-line/60 hover:bg-[var(--surface-hover)]">
                    <td className="px-5 py-3 text-[13px] font-semibold text-info">{r.dot}</td>
                    <td className="px-5 py-3 text-[13px] font-semibold text-ink">{r.name}</td>
                    <td className="px-5 py-3 text-[13px]">{r.state}</td>
                    <td className="px-5 py-3 text-[13px]">{r.units}</td>
                    <td className="px-5 py-3 text-[13px]">{r.drivers}</td>
                    <td className="px-5 py-3"><Pill kind="active">{r.authority}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
