import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store';
import { PageHeader, Pill } from '@/ui';
import DataTable, { type Column } from '@/components/DataTable';
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
  const [tab, setTab] = useState('active');

  const rows = s.drivers.filter((d) => tab === 'all' ? true : tab === 'vacation' ? d.status === 'vacation' : d.status === tab);

  const cols: Column<Driver>[] = [
    { key: 'name', header: 'Name', sortValue: (d) => d.name, render: (d) => (
      <Link to={`/carriers/${d.carrierId}/drivers/${d.id}`} className="font-bold text-info uppercase">{d.name}{d.isNew && <span className="ml-2 pill pill-blue">New</span>}</Link>
    ) },
    { key: 'driverStatus', header: 'Driver Status', render: (d) => d.driverStatus ? <Pill kind={d.driverStatus}>{d.driverStatus}</Pill> : '—' },
    { key: 'type', header: 'Type', render: (d) => d.type === 'company' ? 'Company' : 'Owner Operator' },
    { key: 'mc', header: 'MC', render: (d) => d.mc ?? '—' },
    { key: 'truck', header: 'Truck', render: (d) => d.assignedTruckId ? <Link to={`/carriers/${d.carrierId}/trucks/${d.assignedTruckId}`} className="text-info">#{s.trucks.find((t) => t.id === d.assignedTruckId)?.unit ?? '—'}</Link> : <span className="text-muted">—</span> },
    { key: 'dispatcher', header: 'Dispatcher', render: (d) => d.dispatcher ?? '—' },
    { key: 'score', header: 'Score', sortValue: (d) => d.score },
    { key: 'license', header: 'License #' },
    { key: 'state', header: 'State' },
    { key: 'status', header: 'Status', render: (d) => <Pill kind={d.status}>{d.status}</Pill> },
    { key: 'hireDate', header: 'Hire Date', sortValue: (d) => d.hireDate },
  ];

  return (
    <>
      <PageHeader crumbs={[{ label: 'Carriers' }, { label: s.currentCarrier.name }, { label: 'Drivers' }]} />
      <div className="flex-1 overflow-y-auto p-6">
        <DataTable rows={rows} columns={cols} rowKey={(d) => d.id} tabs={TABS} activeTab={tab} onTab={setTab}
          searchPlaceholder="Search by name or license…"
          toolbarRight={<button className="btn-primary">＋ Add Driver</button>}
          statusChips={[
            { label: 'AVAILABLE', count: s.drivers.filter((d) => d.driverStatus === 'Available').length, color: '#16A34A' },
            { label: 'ON-TRIP', count: s.drivers.filter((d) => d.driverStatus === 'On-trip').length, color: '#2563EB' },
            { label: 'HOME', count: s.drivers.filter((d) => d.driverStatus === 'Home').length, color: '#64748B' },
          ]} />
      </div>
    </>
  );
}
