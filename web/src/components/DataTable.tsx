import { useMemo, useState, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  width?: string;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  tabs?: { key: string; label: string; count?: number }[];
  activeTab?: string;
  onTab?: (key: string) => void;
  toolbarRight?: ReactNode;
  searchPlaceholder?: string;
  statusChips?: { label: string; count: number; color?: string }[];
}

export default function DataTable<T>({
  rows, columns, rowKey, tabs, activeTab, onTab, toolbarRight, searchPlaceholder = 'Search…', statusChips,
}: Props<T>) {
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const perPage = 20;

  const filtered = useMemo(() => {
    const ql = q.toLowerCase().trim();
    let r = rows;
    if (ql) r = r.filter((row) => JSON.stringify(row).toLowerCase().includes(ql));
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        r = [...r].sort((a, b) => {
          const av = col.sortValue!(a), bv = col.sortValue!(b);
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return sortDir === 'asc' ? cmp : -cmp;
        });
      }
    }
    return r;
  }, [rows, q, sortKey, sortDir, columns]);

  const pageRows = filtered.slice(page * perPage, page * perPage + perPage);
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  return (
    <div>
      {tabs && (
        <div className="flex gap-1 mb-3 flex-wrap">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => onTab?.(t.key)}
              className={`px-3 py-1.5 text-[13px] font-medium rounded-lg ${activeTab === t.key ? 'bg-primary-light text-primary' : 'text-muted hover:bg-[var(--surface-hover)]'}`}>
              {t.label}{t.count != null && <span className="opacity-60"> {t.count}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={searchPlaceholder}
          className="input max-w-[280px]" />
        <button className="btn-ghost">Filter</button>
        <button className="btn-ghost">Columns</button>
        <button className="btn-ghost">Export</button>
        <div className="ml-auto flex gap-2">{toolbarRight}</div>
      </div>

      <div className="card overflow-hidden shadow-card">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line">
              {columns.map((c) => (
                <th key={c.key} style={{ width: c.width }}
                  onClick={() => c.sortValue && toggleSort(c.key)}
                  className={`text-left px-4 py-3 text-[11px] font-bold text-muted uppercase ${c.sortValue ? 'cursor-pointer select-none' : ''}`}>
                  {c.header}{sortKey === c.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-line/60 hover:bg-[var(--surface-hover)]">
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3 text-[13px] text-ink">
                    {c.render ? c.render(row) : (row as any)[c.key]}
                  </td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-muted">No records.</td></tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center gap-3 px-4 py-2.5 border-t border-line text-[12px] text-muted">
          {statusChips?.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: s.color ?? '#64748B' }} />
              {s.label} <b className="text-ink">{s.count}</b>
            </span>
          ))}
          <div className="ml-auto flex items-center gap-3">
            <span>{filtered.length ? page * perPage + 1 : 0}–{Math.min((page + 1) * perPage, filtered.length)} of {filtered.length}</span>
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-2 disabled:opacity-30">‹</button>
            <span>{page + 1}/{pages}</span>
            <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="px-2 disabled:opacity-30">›</button>
          </div>
        </div>
      </div>
    </div>
  );
}
