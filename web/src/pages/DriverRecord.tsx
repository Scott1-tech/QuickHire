import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useStore } from '@/store';
import { PageHeader, Pill, Empty } from '@/ui';

const TABS = ['Overview', 'Application', 'PEV', 'Activity', 'Documents', 'Inspections', 'Safety Events'];

export default function DriverRecord() {
  const s = useStore();
  const { driverId } = useParams();
  const [tab, setTab] = useState('Overview');
  const [showAssign, setShowAssign] = useState(false);
  const d = s.drivers.find((x) => x.id === driverId);
  if (!d) return <><PageHeader crumbs={[{ label: 'Drivers' }]} /><Empty icon="🚫" title="Driver not found" /></>;
  const truck = s.trucks.find((t) => t.id === d.assignedTruckId);

  return (
    <>
      <PageHeader crumbs={[{ label: 'Carriers' }, { label: s.currentCarrier.name }, { label: 'Drivers', to: `/carriers/${d.carrierId}/drivers` }, { label: 'Driver Details' }]}
        actions={<div className="flex gap-2">
          <button className="btn-ghost">Mark Reviewed</button><button className="btn-ghost">Edit</button>
          <button className="btn-ghost text-danger">Terminate</button></div>} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-purple grid place-items-center text-lg font-bold text-white">{d.name[0]}</div>
          <div>
            <div className="text-xl font-extrabold text-ink uppercase">{d.name}</div>
            <div className="flex items-center gap-2 mt-1">
              <Pill kind={d.status}>{d.status}</Pill>
              <Pill kind="slate">{d.type === 'company' ? 'Company' : 'Owner Operator'}</Pill>
              <span className="text-[13px] text-muted">{d.email} · {d.phone}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-1 mb-4 border-b border-line">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-[13px] font-medium -mb-px border-b-2 ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}>{t}</button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          <div>
            {tab === 'Overview' ? (
              <div className="grid gap-4">
                <Card title="Personal Info" rows={[['First/Last', d.name], ['Email', d.email ?? '—'], ['Phone', d.phone ?? '—'], ['State', d.state]]} />
                <Card title="License & Compliance" rows={[['License #', d.license], ['State', d.state], ['Score', String(d.score)]]} />
                <div className="card p-5">
                  <div className="flex items-center mb-3"><span className="text-base font-bold text-ink">Truck / Vehicle Assignment</span>
                    {!truck && <button onClick={() => setShowAssign(true)} className="ml-auto btn-primary py-1.5 text-[12px]">Assign Truck</button>}</div>
                  {truck ? (
                    <Link to={`/carriers/${d.carrierId}/trucks/${truck.id}`} className="text-info font-semibold">
                      Unit #{truck.unit} — {truck.make} {truck.model} ({truck.year}) · {truck.plate}
                    </Link>
                  ) : <div className="text-[13px] text-muted">No truck assigned.</div>}
                </div>
                <Card title="Dispatch & Team" rows={[['Dispatcher', d.dispatcher ?? '—'], ['Team Driver', d.team ? 'Yes' : 'No']]} />
              </div>
            ) : <Empty icon="📄" title={`${tab} tab`} sub="// TODO: connect to API" />}
          </div>

          <div className="card p-5 h-fit">
            <div className="text-base font-bold text-ink mb-3">Associations</div>
            {[['Company / MC', `${s.currentCarrier.name} · ${d.mc}`], ['Dispatcher', d.dispatcher ?? '—'], ['Truck', truck ? `#${truck.unit}` : '—']].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2 border-b border-line/60 last:border-0">
                <span className="text-[12px] text-muted">{k}</span><span className="text-[12px] font-semibold text-ink text-right">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showAssign && <AssignTruck onClose={() => setShowAssign(false)} driverId={d.id} />}
    </>
  );
}

function Card({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="card p-5">
      <div className="text-base font-bold text-ink mb-3">{title}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between py-2 border-b border-line/60 last:border-0">
          <span className="text-[13px] text-muted">{k}</span><span className="text-[13px] font-semibold text-ink">{v}</span>
        </div>
      ))}
    </div>
  );
}

function AssignTruck({ onClose }: { onClose: () => void; driverId: string }) {
  const s = useStore();
  const available = s.trucks.filter((t) => t.status === 'Available');
  return (
    <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="card p-6 w-[480px] max-w-full shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-extrabold text-ink mb-1">Select Truck</div>
        <div className="text-xs text-muted mb-4">Only Available trucks are shown.</div>
        {available.length === 0 && <Empty icon="🚛" title="No available trucks" sub="Add a truck or free one up." />}
        {available.map((t) => (
          <button key={t.id} onClick={onClose} className="w-full text-left p-3 rounded-lg border border-line hover:border-primary mb-2">
            <div className="font-bold text-ink">Unit #{t.unit} — {t.make} {t.model} {t.year}</div>
            <div className="text-xs text-muted">{t.plate} · {s.currentCarrier.name}</div>
          </button>
        ))}
        <button onClick={onClose} className="btn-ghost w-full mt-2">Cancel</button>
      </div>
    </div>
  );
}
