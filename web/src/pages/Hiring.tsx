import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { PageHeader, Pill, timeSince, isStale } from '@/ui';
import { STAGES, type Stage } from '@/types';
import CreateModal from '@/components/CreateModal';

export default function Hiring() {
  const s = useStore();
  const nav = useNavigate();
  const [view, setView] = useState<'board' | 'table'>('board');
  const [q, setQ] = useState('');
  const [recruiter, setRecruiter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);

  const visible = s.candidates.filter((c) =>
    (!q || c.name.toLowerCase().includes(q.toLowerCase()) || c.email.toLowerCase().includes(q.toLowerCase())) &&
    (!recruiter || c.ownerUserId === recruiter));

  const owners = Array.from(new Set(s.candidates.map((c) => c.ownerUserId).filter(Boolean))) as string[];

  return (
    <>
      <PageHeader crumbs={[{ label: 'Carriers' }, { label: s.currentCarrier.name }, { label: 'Hiring' }]} />
      <div className="flex-1 overflow-hidden flex flex-col p-6">
        <div className="flex items-center gap-2.5 mb-4 flex-wrap">
          <div className="flex gap-1 bg-bg border border-line rounded-[10px] p-1">
            <button onClick={() => setView('board')} className={`px-3 py-1.5 text-[13px] font-semibold rounded-lg ${view === 'board' ? 'bg-primary-light text-primary' : 'text-muted'}`}>▦ Board</button>
            <button onClick={() => setView('table')} className={`px-3 py-1.5 text-[13px] font-semibold rounded-lg ${view === 'table' ? 'bg-primary-light text-primary' : 'text-muted'}`}>☰ Table</button>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search candidates…" className="input max-w-[240px]" />
          <select value={recruiter} onChange={(e) => setRecruiter(e.target.value)} className="input max-w-[180px]">
            <option value="">All recruiters</option>
            {owners.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <button onClick={() => setShowAdd(true)} className="btn-primary ml-auto">＋ Add Candidate</button>
        </div>

        {view === 'board' ? (
          <div className="flex-1 overflow-x-auto flex gap-3.5 items-start pb-2">
            {STAGES.map((stage) => {
              const inStage = visible.filter((c) => c.stage === stage);
              const weighted = inStage.reduce((sum, c) => sum + (c.amount ?? 0) * (c.winProb ?? 0) / 100, 0);
              return (
                <div key={stage} className="w-64 flex-shrink-0 bg-bg border border-line rounded-xl flex flex-col max-h-full"
                  onDragOver={(e) => { e.preventDefault(); setOverStage(stage); }}
                  onDragLeave={() => setOverStage(null)}
                  onDrop={() => { if (dragId) s.moveCandidate(dragId, stage); setDragId(null); setOverStage(null); }}>
                  <div className="flex items-center gap-2 p-3 border-b border-line">
                    <Pill kind={stage}>{stage}</Pill>
                    <span className="text-[11px] font-bold bg-surface border border-line rounded-full px-2 text-muted">{inStage.length}</span>
                  </div>
                  <div className={`flex-1 overflow-y-auto p-2.5 flex flex-col gap-2.5 min-h-[60px] ${overStage === stage ? 'bg-primary-light rounded-lg' : ''}`}>
                    {inStage.map((c) => (
                      <div key={c.id} draggable onDragStart={() => setDragId(c.id)} onDragEnd={() => setDragId(null)}
                        onClick={() => nav(`/carriers/${c.carrierId}/hiring/${c.id}`)}
                        className={`card p-3 cursor-grab hover:shadow-card transition ${dragId === c.id ? 'opacity-50' : ''}`}>
                        <div className="text-[13.5px] font-bold text-ink uppercase tracking-wide">{c.name}</div>
                        <div className="text-[11.5px] text-muted my-1">{c.email}</div>
                        <div className="flex items-center gap-2">
                          <Pill kind={c.statusTag}>{c.statusTag}</Pill>
                          <span className={`text-[11px] ml-auto ${isStale(c.stageEnteredAt) ? 'text-danger font-bold' : 'text-muted'}`}>⏱ {timeSince(c.stageEnteredAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-2.5 border-t border-line text-[11px] text-muted">
                    Weighted <b className="text-ink">${Math.round(weighted).toLocaleString()}</b>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto card">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-line">
                {['Name', 'Stage', 'Email', 'Win %', 'Time in stage'].map((h) => <th key={h} className="text-left px-4 py-3 text-[11px] font-bold text-muted uppercase">{h}</th>)}
              </tr></thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} onClick={() => nav(`/carriers/${c.carrierId}/hiring/${c.id}`)} className="border-b border-line/60 hover:bg-[var(--surface-hover)] cursor-pointer">
                    <td className="px-4 py-3 text-[13px] font-bold text-ink uppercase">{c.name}</td>
                    <td className="px-4 py-3"><Pill kind={c.stage}>{c.stage}</Pill></td>
                    <td className="px-4 py-3 text-[13px] text-muted">{c.email}</td>
                    <td className="px-4 py-3 text-[13px]">{c.winProb}%</td>
                    <td className={`px-4 py-3 text-[12px] ${isStale(c.stageEnteredAt) ? 'text-danger font-bold' : 'text-muted'}`}>{timeSince(c.stageEnteredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && <CreateModal kind="candidate" open onClose={() => setShowAdd(false)} />}
    </>
  );
}
