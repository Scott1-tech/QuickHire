import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useStore } from '@/store';
import { PageHeader, Pill, Empty, AssignmentIcon } from '@/ui';

const TABS = ['Details', 'Finances', 'Accounting', 'Documents', 'Fleet Issues', 'Work Order', 'Assets', 'Toll Tags', 'Statistics'];

export default function TruckRecord() {
  const s = useStore();
  const { truckId } = useParams();
  const [tab, setTab] = useState('Details');
  const t = s.allTrucks.find((x) => x.id === truckId);
  if (!t) return <><PageHeader crumbs={[{ label: 'Trucks' }]} /><Empty icon="🚫" title="Truck not found" /></>;
  const operator = s.allDrivers.find((d) => d.id === t.operatorDriverId);
  const carrier = s.carriers.find((c) => c.id === t.carrierId);

  return (
    <>
      <PageHeader crumbs={[{ label: 'Carriers' }, { label: carrier?.name ?? '—' }, { label: 'Trucks', to: `/carriers/${t.carrierId}/trucks` }, { label: `Unit #${t.unit}` }]}
        actions={<div className="flex gap-2"><button className="btn-ghost">Truck Switch</button><button className="btn-ghost">Edit</button></div>} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="text-xl font-extrabold text-ink">Unit #{t.unit} — {t.make} {t.model}</div>
          <Pill kind={t.status}>{t.status}</Pill>
          <span className="flex items-center gap-2 text-[13px]">
            <AssignmentIcon assigned={!!operator} size={16} label />
            {operator
              ? <span>· working with <Link to={`/carriers/${t.carrierId}/drivers/${operator.id}`} className="text-info font-semibold">{operator.name}</Link></span>
              : <span className="text-muted">· no driver assigned</span>}
          </span>
        </div>

        <div className="flex gap-1 mb-4 border-b border-line overflow-x-auto">
          {TABS.map((x) => (
            <button key={x} onClick={() => setTab(x)}
              className={`px-3 py-2 text-[13px] font-medium -mb-px border-b-2 whitespace-nowrap ${tab === x ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}>{x}</button>
          ))}
        </div>

        {tab === 'Details' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="Vehicle" rows={[['Make', t.make], ['Model', t.model], ['Unit #', t.unit], ['Plate', t.plate], ['VIN', t.vin], ['Year', String(t.year)], ['State', t.state]]} />
            <Card title="Status & Compliance" rows={[['Status', t.status], ['Fleet status', t.fleetStatus ?? '—'], ['Registration expiry', t.regExpiry ?? '—'], ['Annual inspection', t.inspExpiry ?? '—'], ['Insurance expiry', t.insExpiry ?? '—'], ['Odometer', t.odometer?.toLocaleString() ?? '—']]} />
            <Card title="Ownership" rows={[['Ownership type', t.ownership === 'company' ? 'Company' : 'Owner Operator'], ['Company (MC)', `${carrier?.name ?? '—'} · ${t.mc}`], ['Owner', t.owner ?? '—'], ['Operator', operator?.name ?? '—']]} />
          </div>
        ) : <Empty icon="📄" title={`${tab} tab`} sub="// TODO: connect to API" />}
      </div>
    </>
  );
}

function Card({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="card p-5">
      <div className="text-base font-bold text-ink mb-3">{title}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between py-2 border-b border-line/60 last:border-0">
          <span className="text-[13px] text-muted">{k}</span><span className="text-[13px] font-semibold text-ink text-right">{v}</span>
        </div>
      ))}
    </div>
  );
}
