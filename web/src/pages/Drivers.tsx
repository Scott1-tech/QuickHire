import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { PageHeader, Pill } from '@/ui';
import DataTable, { type Column } from '@/components/DataTable';
import CreateModal from '@/components/CreateModal';
import type { Driver } from '@/types';

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'all', label: 'All' },
  { key: 'terminated', label: 'Terminated' },
  { key: 'vacation', label: 'Vacation / Home-Time' },
];

export default function Drivers() {
  const s = useStore();
  const nav = useNavigate();
  const [section, setSection] = useState<'active' | 'hiring'>('active');
  const [tab, setTab] = useState('active');
  const [showAdd, setShowAdd] = useState(false);

  const rows = s.drivers.filter((d) => tab === 'all' ? true : tab === 'vacation' ? d.status === 'vacation' : d.status === tab);
  const hiring = s.candidates;

  const cols: Column<Driver>[] = [
    { key: 'name', header: 'Name', sortValue: (d) => d.name, render: (d) => (
      <Link to={`/carriers/${d.carrierId}/drivers/${d.id}`} className="font-bold text-info uppercase">{d.name}{d.isNew && <span className="ml-2 pill pill-blue">New</span>}</Link>
    ) },
    { key: 'driverStatus', header: 'Driver Status', render: (d) => d.driverStatus ? <Pill kind={d.driverStatus}>{d.driverStatus}</Pill> : '—' },
    { key: 'type', header: 'Type', render: (d) => d.type === 'company' ? 'Company' : 'Owner Operator' },
    { key: 'mc', header: 'MC', render: (d) => d.mc ?? '—' },
    { key: 'truck', header: 'Truck', render: (d) => d.assignedTruckId ? <Link to={`/carriers/${d.carrierId}/trucks/${d.assignedTruckId}`} className="text-info">#{s.trucks.find((t) => t.id === d.assignedTruckId)?.unit ?? '—'}</Link> : <span className="text-muted">—</span> },
    { key: 'dispatcher', header: 'Recruiter', render: (d) => d.dispatcher ?? '—' },
    { key: 'score', header: 'Score', sortValue: (d) => d.score },
    { key: 'license', header: 'License #' },
    { key: 'state', header: 'State' },
    { key: 'status', header: 'Status', render: (d) => <Pill kind={d.status}>{d.status}</Pill> },
    { key: 'hireDate', header: 'Hire Date', sortValue: (d) => d.hireDate },
  ];

  return (
    <>
      <PageHeader crumbs={[{ label: 'Carriers', to: '/carriers' }, { label: s.currentCarrier.name, to: `/carriers/${s.currentCarrierId}` }, { label: 'Drivers' }]} />
      <div className="flex-1 overflow-y-auto p-6">
        {/* Section switch: active drivers vs drivers still in hiring */}
        <div className="inline-flex gap-1 bg-bg border border-line rounded-[10px] p-1 mb-4">
          <button onClick={() => setSection('active')} className={`px-4 py-1.5 text-[13px] font-semibold rounded-lg transition ${section === 'active' ? 'bg-primary-light text-primary' : 'text-muted'}`}>
            Active Drivers <span className="opacity-60">{s.drivers.length}</span>
          </button>
          <button onClick={() => setSection('hiring')} className={`px-4 py-1.5 text-[13px] font-semibold rounded-lg transition ${section === 'hiring' ? 'bg-primary-light text-primary' : 'text-muted'}`}>
            Hiring Drivers <span className="opacity-60">{hiring.length}</span>
          </button>
        </div>

        {section === 'active' ? (
          <DataTable rows={rows} columns={cols} rowKey={(d) => d.id} tabs={TABS} activeTab={tab} onTab={setTab}
            searchPlaceholder="Search by name or license…"
            toolbarRight={<button onClick={() => setShowAdd(true)} className="btn-primary">＋ Add Driver</button>}
            statusChips={[
              { label: 'AVAILABLE', count: s.drivers.filter((d) => d.driverStatus === 'Available').length, color: '#16A34A' },
              { label: 'ON-TRIP', count: s.drivers.filter((d) => d.driverStatus === 'On-trip').length, color: '#2563EB' },
              { label: 'HOME', count: s.drivers.filter((d) => d.driverStatus === 'Home').length, color: '#64748B' },
            ]} />
        ) : (
          <div className="card overflow-hidden shadow-card">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-line">
                {['Name', 'Stage', 'Email', 'Phone', 'Application'].map((h) => <th key={h} className="text-left px-4 py-3 text-[11px] font-bold text-muted uppercase">{h}</th>)}
              </tr></thead>
              <tbody>
                {hiring.map((c) => (
                  <tr key={c.id} onClick={() => nav(`/carriers/${c.carrierId}/hiring/${c.id}`)} className="border-b border-line/60 hover:bg-[var(--surface-hover)] cursor-pointer">
                    <td className="px-4 py-3 text-[13px] font-bold text-info uppercase">{c.name}</td>
                    <td className="px-4 py-3"><Pill kind={c.stage}>{c.stage}</Pill></td>
                    <td className="px-4 py-3 text-[13px] text-muted">{c.email}</td>
                    <td className="px-4 py-3 text-[13px] text-muted">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-[13px] text-muted">{c.appProgress}%</td>
                  </tr>
                ))}
                {hiring.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">No candidates in hiring.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && <CreateModal kind="driver" open onClose={() => setShowAdd(false)} />}
    </>
  );
}
