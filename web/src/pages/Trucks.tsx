import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store';
import { PageHeader, Pill, AssignmentIcon } from '@/ui';
import DataTable, { type Column } from '@/components/DataTable';
import CreateModal from '@/components/CreateModal';
import type { Truck } from '@/types';

const TABS = [
  { key: 'active', label: 'Active Trucks' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'all', label: 'All Trucks' },
  { key: 'inactive', label: 'Inactive' },
];

export default function Trucks() {
  const s = useStore();
  const [tab, setTab] = useState('all');
  const [showAdd, setShowAdd] = useState(false);

  const rows = s.trucks.filter((t) =>
    tab === 'all' ? true :
    tab === 'inactive' ? t.status === 'Inactive' :
    tab === 'unassigned' ? !t.operatorDriverId :
    t.status !== 'Inactive');

  const cols: Column<Truck>[] = [
    { key: 'availability', header: 'Avail.', sortValue: (t) => (t.operatorDriverId ? 1 : 0), render: (t) => <AssignmentIcon assigned={!!t.operatorDriverId} size={16} /> },
    { key: 'unit', header: 'Unit #', sortValue: (t) => t.unit, render: (t) => <Link to={`/carriers/${t.carrierId}/trucks/${t.id}`} className="font-bold text-info">#{t.unit}</Link> },
    { key: 'make', header: 'Make', render: (t) => `${t.make}` },
    { key: 'model', header: 'Model' },
    { key: 'year', header: 'Year', sortValue: (t) => t.year },
    { key: 'plate', header: 'Plate' },
    { key: 'mc', header: 'MC', render: (t) => t.mc ?? '—' },
    { key: 'operator', header: 'Working with', render: (t) => {
      const d = s.allDrivers.find((x) => x.id === t.operatorDriverId);
      return d ? <Link to={`/carriers/${t.carrierId}/drivers/${d.id}`} className="text-info">{d.name}</Link> : <span className="text-muted">— Available —</span>;
    } },
    { key: 'owner', header: 'Owner', render: (t) => t.owner ?? '—' },
    { key: 'odometer', header: 'Odometer', sortValue: (t) => t.odometer ?? 0, render: (t) => t.odometer?.toLocaleString() ?? '—' },
    { key: 'status', header: 'Status', render: (t) => <Pill kind={t.status}>{t.status}</Pill> },
  ];

  return (
    <>
      <PageHeader crumbs={[{ label: 'Carriers' }, { label: s.currentCarrier.name }, { label: 'Trucks' }]} />
      <div className="flex-1 overflow-y-auto p-6">
        <DataTable rows={rows} columns={cols} rowKey={(t) => t.id} tabs={TABS} activeTab={tab} onTab={setTab}
          searchPlaceholder="Search by unit, VIN, plate…"
          toolbarRight={<button onClick={() => setShowAdd(true)} className="btn-primary">＋ Create Truck</button>}
          statusChips={[
            { label: 'AVAILABLE', count: s.trucks.filter((t) => t.status === 'Available').length, color: '#16A34A' },
            { label: 'IN-TRANSIT', count: s.trucks.filter((t) => t.status === 'In-Transit').length, color: '#2563EB' },
            { label: 'SHOP', count: s.trucks.filter((t) => t.status === 'Shop').length, color: '#DC2626' },
          ]} />
      </div>

      {showAdd && <CreateModal kind="truck" open onClose={() => setShowAdd(false)} />}
    </>
  );
}
