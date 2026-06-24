import { useState } from 'react';
import { useStore } from '@/store';
import { PageHeader, Pill } from '@/ui';
import DataTable, { type Column } from '@/components/DataTable';
import CreateModal from '@/components/CreateModal';
import type { Employee } from '@/types';

const SHIFT_COLOR: Record<string, string> = { 'Night shift': 'pill-purple', 'Main shift': 'pill-blue', 'Afterhours shift': 'pill-amber' };

export default function People({ kind }: { kind: 'employee' | 'dispatcher' }) {
  const s = useStore();
  const [tab, setTab] = useState('active');
  const [showAdd, setShowAdd] = useState(false);
  const rows = s.employees.filter((e) => e.kind === kind && (tab === 'active' ? e.status === 'ACTIVE' : e.status === 'ARCHIVED'));

  const cols: Column<Employee>[] = [
    { key: 'name', header: 'Name', sortValue: (e) => e.lastName, render: (e) => <span className="font-bold text-info">{e.firstName} {e.lastName}</span> },
    { key: 'status', header: 'Status', render: (e) => <Pill kind="ACTIVE">{e.status}</Pill> },
    { key: 'phone', header: 'Phone', render: (e) => e.phone ?? '—' },
    { key: 'email', header: 'Email', render: (e) => e.email ?? '—' },
    { key: 'shift', header: 'Shift', render: (e) => e.shift ? <span className={`pill ${SHIFT_COLOR[e.shift]}`}>{e.shift}</span> : '—' },
    { key: 'role', header: 'Role', render: (e) => e.role },
  ];

  const title = kind === 'dispatcher' ? 'Dispatchers' : 'Employees';
  return (
    <>
      <PageHeader crumbs={[{ label: 'People' }, { label: title }]} />
      <div className="flex-1 overflow-y-auto p-6">
        <DataTable rows={rows} columns={cols} rowKey={(e) => e.id}
          tabs={[{ key: 'active', label: `Active ${title}` }, { key: 'archived', label: `Archived ${title}` }]}
          activeTab={tab} onTab={setTab}
          toolbarRight={<button onClick={() => setShowAdd(true)} className="btn-primary">＋ Create {kind === 'dispatcher' ? 'Dispatcher' : 'Employee'}</button>} />
      </div>

      {showAdd && <CreateModal kind="employee" open onClose={() => setShowAdd(false)} />}
    </>
  );
}
