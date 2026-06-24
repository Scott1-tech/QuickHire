import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useStore } from '@/store';
import { PageHeader, Pill, Empty, AssignmentIcon } from '@/ui';
import TaskModal from '@/components/TaskModal';
import type { TaskStatus } from '@/types';

const TABS = ['Overview', 'Application', 'PEV', 'Activity', 'Documents', 'Inspections', 'Safety Events'];
const taskPill = (st: TaskStatus) => (st === 'COMPLETE' ? 'active' : st === 'IN PROGRESS' ? 'pending' : st === 'REVIEW NEEDED' ? 'ready' : 'slate');

export default function DriverRecord() {
  const s = useStore();
  const { driverId } = useParams();
  const [tab, setTab] = useState('Overview');
  const [showAssign, setShowAssign] = useState(false);
  const [taskOpenId, setTaskOpenId] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const d = s.allDrivers.find((x) => x.id === driverId);
  if (!d) return <><PageHeader crumbs={[{ label: 'Drivers' }]} /><Empty icon="🚫" title="Driver not found" /></>;
  const truck = s.allTrucks.find((t) => t.id === d.assignedTruckId);
  const carrier = s.carriers.find((c) => c.id === d.carrierId);
  const driverTasks = s.allTasks.filter((t) => t.driverId === d.id);

  return (
    <>
      <PageHeader crumbs={[{ label: 'Carriers' }, { label: carrier?.name ?? '—' }, { label: 'Drivers', to: `/carriers/${d.carrierId}/drivers` }, { label: 'Driver Details' }]}
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
                    <button onClick={() => setShowAssign(true)} className="ml-auto btn-primary py-1.5 text-[12px]">{truck ? 'Change Truck' : 'Assign Truck'}</button></div>
                  {truck ? (
                    <div className="flex items-center gap-3">
                      <AssignmentIcon assigned size={18} />
                      <Link to={`/carriers/${d.carrierId}/trucks/${truck.id}`} className="text-info font-semibold flex-1">
                        Unit #{truck.unit} — {truck.make} {truck.model} ({truck.year}) · {truck.plate}
                      </Link>
                      <button onClick={() => s.assignDriverToTruck(truck.id, null)} className="btn-ghost py-1 text-[12px] text-danger">Unassign</button>
                    </div>
                  ) : <div className="text-[13px] text-muted">No truck assigned. Pick an available truck from {carrier?.name ?? 'this carrier'}.</div>}
                </div>

                {/* Tasks linked to this driver — create one here and it's pre-linked to the driver + carrier. */}
                <div className="card p-5">
                  <div className="flex items-center mb-3">
                    <span className="text-base font-bold text-ink">Tasks for this driver</span>
                    <span className="ml-2 text-[11px] font-bold bg-bg border border-line rounded-full px-2 text-muted">{driverTasks.length}</span>
                    <button onClick={() => setCreatingTask(true)} className="ml-auto btn-primary py-1.5 text-[12px]">＋ New Task</button>
                  </div>
                  {driverTasks.length === 0 ? (
                    <div className="text-[13px] text-muted">No tasks yet. New tasks are linked to {d.name} and {carrier?.name ?? 'their carrier'} automatically.</div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {driverTasks.map((t) => (
                        <button key={t.id} onClick={() => setTaskOpenId(t.id)}
                          className="w-full text-left p-2.5 rounded-lg border border-line hover:border-primary transition flex items-center gap-2.5">
                          <Pill kind={taskPill(t.status)}>{t.status}</Pill>
                          <span className="flex-1 text-[13px] font-medium text-ink truncate">{t.title}</span>
                          {t.assignee && <span className="text-[11px] text-muted">{t.assignee}</span>}
                          {t.due && <span className="text-[11px] text-muted">{new Date(t.due).toLocaleDateString()}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <Card title="Dispatch & Team" rows={[['Dispatcher', d.dispatcher ?? '—'], ['Team Driver', d.team ? 'Yes' : 'No']]} />
              </div>
            ) : <Empty icon="📄" title={`${tab} tab`} sub="// TODO: connect to API" />}
          </div>

          <div className="card p-5 h-fit">
            <div className="text-base font-bold text-ink mb-1">Working With</div>
            <div className="text-[12px] text-muted mb-3">Who this driver is currently working with.</div>

            {/* Carrier the driver works with */}
            <Link to={`/carriers/${d.carrierId}`} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-line hover:border-primary transition mb-3">
              <span className="w-8 h-8 rounded-md grid place-items-center text-white text-[12px] font-bold flex-shrink-0" style={{ background: '#e25563' }}>{(carrier?.name ?? 'C')[0]}</span>
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-muted uppercase">Carrier</div>
                <div className="text-[13px] font-semibold text-ink truncate">{carrier?.name ?? '—'}</div>
                <div className="text-[11px] text-muted">{d.mc ?? '—'}</div>
              </div>
            </Link>

            <div className="flex justify-between py-2 border-b border-line/60">
              <span className="text-[12px] text-muted">Driver status</span>
              <span className="text-[12px] font-semibold text-ink text-right">{d.driverStatus ?? '—'}</span>
            </div>

            {/* Vehicle pairing */}
            <div className="flex items-center gap-2.5 py-2.5">
              <AssignmentIcon assigned={!!truck} size={16} />
              {truck
                ? <Link to={`/carriers/${d.carrierId}/trucks/${truck.id}`} className="text-[12.5px] font-semibold text-info">Driving Unit #{truck.unit} · {truck.make} {truck.model}</Link>
                : <span className="text-[12.5px] text-muted">No vehicle assigned yet</span>}
            </div>
          </div>
        </div>
      </div>

      {showAssign && <AssignTruck onClose={() => setShowAssign(false)} driverId={d.id} carrierId={d.carrierId} />}
      {creatingTask && <TaskModal createSeed={{ driverId: d.id, carrierId: d.carrierId, assignee: s.currentUser, title: `Follow up — ${d.name}` }} onClose={() => setCreatingTask(false)} />}
      {taskOpenId && <TaskModal taskId={taskOpenId} onClose={() => setTaskOpenId(null)} />}
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

function AssignTruck({ onClose, driverId, carrierId }: { onClose: () => void; driverId: string; carrierId: string }) {
  const s = useStore();
  const carrier = s.carriers.find((c) => c.id === carrierId);
  // Only trucks belonging to THIS driver's carrier — you don't assign across
  // carriers. Available units float to the top; in-use units can be reassigned.
  const trucks = s.allTrucks
    .filter((t) => t.carrierId === carrierId && t.status !== 'Inactive')
    .sort((a, b) => (a.operatorDriverId ? 1 : 0) - (b.operatorDriverId ? 1 : 0));
  const pick = (truckId: string) => { s.assignDriverToTruck(truckId, driverId); onClose(); };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="card p-6 w-[540px] max-w-full shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-extrabold text-ink mb-1">Assign Truck</div>
        <div className="text-xs text-muted mb-4 flex items-center gap-3 flex-wrap">
          <span>Trucks for <span className="font-semibold text-ink">{carrier?.name ?? 'this carrier'}</span>.</span>
          <span className="flex items-center gap-1.5"><AssignmentIcon assigned={false} size={13} /> available</span>
          <span className="flex items-center gap-1.5"><AssignmentIcon assigned size={13} /> in use</span>
        </div>
        {trucks.length === 0 && <Empty icon="🚛" title="No trucks for this carrier" sub="Add a truck to this carrier first." />}
        <div className="max-h-[55vh] overflow-y-auto flex flex-col gap-2">
          {trucks.map((t) => {
            const op = s.allDrivers.find((x) => x.id === t.operatorDriverId);
            const assigned = !!t.operatorDriverId;
            return (
              <button key={t.id} onClick={() => pick(t.id)}
                className="w-full text-left p-3 rounded-lg border border-line hover:border-primary flex items-center gap-3 transition">
                <AssignmentIcon assigned={assigned} size={18} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-ink">Unit #{t.unit} — {t.make} {t.model} {t.year}</div>
                  <div className="text-xs text-muted">{t.plate}{assigned && op ? ` · currently with ${op.name}` : ''}</div>
                </div>
                <Pill kind={assigned ? 'Assigned' : 'Available'}>{assigned ? 'Assigned' : 'Available'}</Pill>
              </button>
            );
          })}
        </div>
        <button onClick={onClose} className="btn-ghost w-full mt-3">Cancel</button>
      </div>
    </div>
  );
}
