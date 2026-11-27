import React from 'react';
import { T, Icon } from '../tasks/lib';
import { RECRUITERS, recruiterName } from './stages';
import { PipeDef, stageOf, daysInStage, recordSla, nextStepOf, docsProgress, ownerOf, readyToAdvance, SLA_COLORS, fmtDay } from './lifecycle';
import { SlaChip, ReadyBadge, PersonAvatar, ExampleTag, SmallBtn, BLUE } from './ui';

export type SortKey = 'name' | 'stage' | 'days' | 'next' | 'docs' | 'score' | 'recruiter';
export interface SortState { key: SortKey; dir: 1 | -1 }

function docsOf(pipe: string, r: any) {
  if (pipe === 'leads') { const ds = r.documents || []; return { have: ds.filter((d: any) => d.status === 'received').length, total: ds.length }; }
  return docsProgress(r);
}

export function sortRecords(def: PipeDef, rows: any[], sort: SortState, now = Date.now()) {
  const order = def.stages.map((s) => s.name);
  const val = (r: any): any => {
    switch (sort.key) {
      case 'name': return String(r.name).toLowerCase();
      case 'stage': return order.indexOf(stageOf(def.key, r));
      case 'days': return daysInStage(def.key, r, now);
      case 'next': return nextStepOf(def.key, r)?.title?.toLowerCase() || '￿';
      case 'docs': { const d = docsOf(def.key, r); return d.total ? d.have / d.total : 0; }
      case 'score': return +r.score || 0;
      case 'recruiter': return recruiterName(ownerOf(def.key, r));
    }
  };
  return rows.slice().sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || String(a.name).localeCompare(String(b.name)); });
}

interface Props {
  def: PipeDef;
  rows: any[];
  sort: SortState;
  onSort: (s: SortState) => void;
  selected: Set<string>;
  onSelect: (ids: string[], on: boolean) => void;
  onOpen: (id: string) => void;
  onBulkMove: (stage: string) => void;
  onBulkAssign: (owner: string) => void;
  onBulkTask: () => void;
  peekId: string | null;
}

const COLS: { key: SortKey; label: string; w: string; align?: 'right' }[] = [
  { key: 'name', label: 'Name', w: 'minmax(180px,1.6fr)' },
  { key: 'stage', label: 'Stage', w: 'minmax(130px,1fr)' },
  { key: 'days', label: 'In stage', w: '96px' },
  { key: 'next', label: 'Next step', w: 'minmax(160px,1.4fr)' },
  { key: 'docs', label: 'Docs', w: '92px' },
  { key: 'score', label: 'Score', w: '70px', align: 'right' },
  { key: 'recruiter', label: 'Recruiter', w: 'minmax(120px,0.9fr)' },
];

export function ListView({ def, rows, sort, onSort, selected, onSelect, onOpen, onBulkMove, onBulkAssign, onBulkTask, peekId }: Props) {
  const now = Date.now();
  const sorted = sortRecords(def, rows, sort, now);
  const allOn = sorted.length > 0 && sorted.every((r) => selected.has(r.id));
  const grid = `40px ${COLS.map((c) => c.w).join(' ')}`;
  const sel = sorted.filter((r) => selected.has(r.id)).length;
  return <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 14 }}>
    {sel > 0 && <div role="toolbar" aria-label="Bulk actions" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 12, background: 'rgba(0,122,255,0.07)', border: '1px solid rgba(0,122,255,0.18)' }}>
      <span style={{ fontSize: 13, fontWeight: 650, color: '#0066CC', marginRight: 4 }}>{sel} selected</span>
      <select aria-label="Move selected to stage" value="" onChange={(e) => { if (e.target.value) onBulkMove(e.target.value); }} style={selStyle}>
        <option value="">Move to stage…</option>
        {def.stages.filter((s) => s.final !== 'handoff').map((s) => <option key={s.name} value={s.name}>{s.name}{s.final === 'lost' ? ' (needs reason)' : ''}</option>)}
      </select>
      <select aria-label="Reassign selected" value="" onChange={(e) => { if (e.target.value) onBulkAssign(e.target.value); }} style={selStyle}>
        <option value="">Reassign to…</option>
        {RECRUITERS.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <SmallBtn label="Add task" icon="listChecks" onClick={onBulkTask} />
      <span style={{ flex: 1 }} />
      <SmallBtn label="Clear" onClick={() => onSelect(sorted.map((r) => r.id), false)} />
    </div>}
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', borderRadius: 14, border: `1px solid ${T.border}` }}>
      <div role="table" aria-label={`${def.label} list`} style={{ minWidth: 900 }}>
        <div role="row" style={{ display: 'grid', gridTemplateColumns: grid, alignItems: 'center', position: 'sticky', top: 0, zIndex: 1, background: '#FAFAFB', borderBottom: `1px solid ${T.hair}`, height: 38 }}>
          <span role="columnheader" style={{ display: 'flex', justifyContent: 'center' }}><input type="checkbox" aria-label="Select all" checked={allOn} onChange={(e) => onSelect(sorted.map((r) => r.id), e.target.checked)} /></span>
          {COLS.map((c) => <button key={c.key} role="columnheader" type="button" aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} onClick={() => onSort({ key: c.key, dir: sort.key === c.key ? (sort.dir === 1 ? -1 : 1) : (c.key === 'days' || c.key === 'score' ? -1 : 1) })}
            title={c.key === 'days' ? 'Days in stage' : undefined}
            style={{ display: 'flex', alignItems: 'center', justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start', gap: 4, height: '100%', padding: '0 10px', border: 'none', background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase', color: sort.key === c.key ? BLUE : T.faint }}>
            {c.label}{sort.key === c.key && <Icon name="chevronDown" size={12} style={{ transform: sort.dir === 1 ? 'rotate(180deg)' : 'none' }} />}
          </button>)}
        </div>
        {sorted.length === 0 && <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: T.faint }}>No records match these filters.</div>}
        {sorted.map((r) => {
          const stage = stageOf(def.key, r); const st = def.stages.find((s) => s.name === stage);
          const days = daysInStage(def.key, r, now); const sla = recordSla(def, r, now);
          const next = nextStepOf(def.key, r); const docs = docsOf(def.key, r); const owner = recruiterName(ownerOf(def.key, r));
          const on = selected.has(r.id);
          return <div key={r.id} role="row" data-row={r.id} onClick={() => onOpen(r.id)} style={{ display: 'grid', gridTemplateColumns: grid, alignItems: 'center', minHeight: 48, borderBottom: `1px solid ${T.hair}`, cursor: 'pointer', background: peekId === r.id ? 'rgba(0,122,255,0.05)' : on ? 'rgba(0,122,255,0.03)' : '#fff' }}>
            <span role="cell" style={{ display: 'flex', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${r.name}`} checked={on} onChange={(e) => onSelect([r.id], e.target.checked)} /></span>
            <span role="cell" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 10px', minWidth: 0 }}>
              <PersonAvatar name={r.name} size={26} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>{r.example && <ExampleTag />}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: T.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.phone}</span>
              </span>
            </span>
            <span role="cell" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', minWidth: 0, fontSize: 12.5 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: st?.color || '#8E8E93', flex: 'none' }} /><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stage}</span>{readyToAdvance(def, r, now) && <ReadyBadge />}</span>
            <span role="cell" style={{ padding: '0 10px' }}>{st?.final ? <span style={{ fontSize: 12, color: T.faint }}>—</span> : <SlaChip days={days} level={sla} />}</span>
            <span role="cell" style={{ padding: '0 10px', minWidth: 0, fontSize: 12.5, color: next ? T.text : '#A05A00', fontWeight: next ? 400 : 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{next ? `${next.title}${next.due ? ' · ' + fmtDay(next.due) : ''}` : st?.final ? '—' : 'No next step'}</span>
            <span role="cell" style={{ padding: '0 10px', fontSize: 12.5, color: docs.total && docs.have === docs.total ? '#248A3D' : T.text }}>{docs.total ? `${docs.have}/${docs.total}` : '—'}</span>
            <span role="cell" style={{ padding: '0 10px', textAlign: 'right', fontSize: 12.5, fontWeight: 650, color: (+r.score || 0) >= 85 ? '#248A3D' : (+r.score || 0) >= 70 ? '#A05A00' : SLA_COLORS.over.fg }}>{r.score ?? '—'}</span>
            <span role="cell" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px', minWidth: 0, fontSize: 12.5 }}><PersonAvatar name={owner} size={20} /><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{owner}</span></span>
          </div>;
        })}
      </div>
    </div>
  </div>;
}
const selStyle: React.CSSProperties = { height: 30, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: '#fff', padding: '0 8px', fontSize: 12.5, fontWeight: 600, color: T.text, cursor: 'pointer' };
