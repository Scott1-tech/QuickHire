import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '@/store';
import { PageHeader, Pill, Empty, timeAgo } from '@/ui';
import { CHECKLIST_TEMPLATE, DOC_TYPES_MAIN } from '@/data/mock';
import { STAGES, type ChecklistStep, type Stage } from '@/types';

const TABS = ['Pipeline', 'Application', 'PEV', 'Activity', 'Documents'];
const GROUPS: ChecklistStep['group'][] = ['Compliance & Eligibility', 'Risk Screening', 'Health & Safety', 'Employment Setup'];

export default function CandidateRecord() {
  const s = useStore();
  const { candidateId } = useParams();
  const [tab, setTab] = useState('Pipeline');
  const [steps, setSteps] = useState<ChecklistStep[]>(() => CHECKLIST_TEMPLATE.map((x) => ({ ...x })));
  const [expanded, setExpanded] = useState<string | null>('clearinghouse');
  const [showTruck, setShowTruck] = useState(false);
  const c = s.candidates.find((x) => x.id === candidateId);
  if (!c) return <><PageHeader crumbs={[{ label: 'Hiring' }]} /><Empty icon="🚫" title="Candidate not found" /></>;

  const done = steps.filter((x) => x.status === 'complete').length;
  const nextStage: Stage | null = STAGES[STAGES.indexOf(c.stage) + 1] ?? null;

  const toggle = (id: string) =>
    setSteps((prev) => prev.map((x) => x.id === id ? { ...x, status: x.status === 'complete' ? 'ready' : 'complete' } : x));

  const advance = () => {
    if (nextStage === 'Onboarding') { setShowTruck(true); return; }
    if (nextStage) s.moveCandidate(c.id, nextStage);
  };

  return (
    <>
      <PageHeader crumbs={[{ label: 'Carriers' }, { label: s.currentCarrier.name }, { label: 'Hiring', to: `/carriers/${c.carrierId}/hiring` }, { label: 'Candidate Details' }]}
        actions={<div className="flex gap-2"><button className="btn-ghost">Edit</button><button className="btn-ghost text-danger">Archive</button></div>} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-5">
          {/* Left rail */}
          <div className="card p-5 h-fit">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-purple grid place-items-center text-xl font-bold text-white mb-3">{c.name[0]}</div>
            <div className="text-lg font-extrabold text-ink uppercase">{c.name}</div>
            <div className="mt-2 mb-3"><Pill kind={c.stage}>{c.stage}</Pill></div>
            <div className="text-[13px] text-muted">{c.email}</div>
            <div className="text-[13px] text-muted mb-4">{c.phone}</div>
            <div className="text-[11px] font-bold text-muted uppercase mb-2">Eligibility</div>
            {[['MVR', 'not_prohibited'], ['BGC', 'not_prohibited'], ['Clearinghouse', 'not_prohibited']].map(([k, v]) => (
              <div key={k} className="flex justify-between py-1.5 text-[12.5px]"><span className="text-muted">{k}</span><span className="text-success font-semibold">{v}</span></div>
            ))}
            <div className="flex gap-1.5 mt-4 flex-wrap">
              {['Note', 'Email', 'Call', 'Task'].map((a) => <button key={a} className="text-[11px] px-2.5 py-1 rounded border border-line hover:border-primary">{a}</button>)}
            </div>
          </div>

          {/* Center */}
          <div>
            <div className="flex gap-1 mb-4 border-b border-line">
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-2 text-[13px] font-medium -mb-px border-b-2 ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}>{t}</button>
              ))}
            </div>

            {tab === 'Pipeline' && (
              <>
                <div className="card p-5 mb-4 flex items-center gap-5">
                  <Ring value={done} total={steps.length} />
                  <div>
                    <div className="text-lg font-bold text-ink">{done}/{steps.length} steps complete</div>
                    <div className="text-[13px] text-muted">Hiring progress</div>
                  </div>
                </div>
                {GROUPS.map((g) => {
                  const items = steps.filter((x) => x.group === g);
                  return (
                    <div key={g} className="mb-4">
                      <div className="flex items-center gap-2 mb-2"><span className="text-[12px] font-bold text-muted uppercase">{g}</span>
                        <span className="text-[11px] bg-bg border border-line rounded-full px-2 text-muted">{items.length}</span></div>
                      <div className="card divide-y divide-line/60">
                        {items.map((step) => (
                          <div key={step.id}>
                            <button onClick={() => setExpanded(expanded === step.id ? null : step.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                              <span>{step.status === 'complete' ? '✅' : step.status === 'ready' ? '🔵' : '🔴'}</span>
                              <span className="text-[13.5px] font-semibold text-ink flex-1">{step.name}</span>
                              <Pill kind={step.status === 'complete' ? 'Complete' : step.status === 'ready' ? 'Ready to Run' : 'Action Needed'}>
                                {step.status === 'complete' ? 'Complete' : step.status === 'ready' ? 'Ready to Run' : 'Action Needed'}
                              </Pill>
                              <span className="text-muted">{expanded === step.id ? '▴' : '▾'}</span>
                            </button>
                            {expanded === step.id && (
                              <div className="px-4 pb-4">
                                <p className="text-[13px] text-muted mb-3">{step.description}</p>
                                {step.result && <div className="text-[13px] text-success bg-success/10 rounded-lg px-3 py-2 mb-3">✔ {step.result}</div>}
                                <div className="flex gap-2">
                                  <button className="btn-ghost py-1.5 text-[12px]">Full Query</button>
                                  <button className="btn-ghost py-1.5 text-[12px]">Limited Query</button>
                                  <button onClick={() => toggle(step.id)} className="ml-auto btn-primary py-1.5 text-[12px]">
                                    {step.status === 'complete' ? 'Mark as Undone' : 'Mark Complete'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {tab === 'Documents' && <Documents />}
            {tab === 'Activity' && <ActivityTab name={c.name} />}
            {(tab === 'Application' || tab === 'PEV') && <Empty icon="📄" title={`${tab} tab`} sub="// TODO: connect to API — render submitted application data" />}
          </div>

          {/* Right rail */}
          <div className="flex flex-col gap-4 h-fit">
            <div className="card p-5">
              <div className="text-[12px] font-bold text-muted uppercase mb-3">Pipeline Journey</div>
              <div className="flex flex-col gap-2">
                {STAGES.map((st, i) => (
                  <div key={st} className={`flex items-center gap-2 text-[13px] ${st === c.stage ? 'font-bold text-primary' : 'text-muted'}`}>
                    <span>{i < STAGES.indexOf(c.stage) ? '✅' : st === c.stage ? '🔵' : '⚪'}</span> {st}
                  </div>
                ))}
              </div>
              <textarea placeholder="Notes (optional)" className="input mt-4 h-20 resize-none" />
              {nextStage && <button onClick={advance} className="btn-primary w-full mt-3">Advance to {nextStage}</button>}
            </div>

            <div className="card p-5">
              <div className="flex items-center mb-2"><span className="text-base font-bold text-ink">Consents</span><Pill kind="Submitted">Submitted</Pill></div>
              <div className="text-[13px] text-muted">Consents Completed</div>
              <div className="text-[12px] text-muted mt-1">Sent 2 times via email & sms. Last: {timeAgo(c.stageEnteredAt)}</div>
              <button className="btn-ghost w-full mt-3 py-2 text-[13px]">Download Consents</button>
            </div>

            <div className="card p-5">
              <div className="flex items-center mb-2"><span className="text-base font-bold text-ink">Application</span><Pill kind={c.appProgress === 100 ? 'Submitted' : 'In Progress'}>{c.appProgress === 100 ? 'Submitted' : 'In Progress'}</Pill></div>
              <div className="h-2 rounded-full bg-bg overflow-hidden my-2"><div className="h-full bg-primary" style={{ width: `${c.appProgress}%` }} /></div>
              <div className="text-[12px] text-muted">{c.appProgress}% complete · last active {timeAgo(c.stageEnteredAt)}</div>
              <div className="flex flex-col gap-2 mt-3">
                <button className="btn-ghost py-2 text-[13px]">Send Application Link</button>
                <button className="btn-ghost py-2 text-[13px] text-danger">Reject / Withdraw</button>
                <button className="btn-ghost py-2 text-[13px]">Download Application PDF</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showTruck && <SelectTruck onClose={() => setShowTruck(false)} onPick={(tid) => { s.assignTruck(c.id, tid); s.moveCandidate(c.id, 'Onboarding'); setShowTruck(false); }} />}
    </>
  );
}

function Ring({ value, total }: { value: number; total: number }) {
  const pct = total ? value / total : 0;
  const r = 28, circ = 2 * Math.PI * r;
  return (
    <svg width="72" height="72" className="-rotate-90">
      <circle cx="36" cy="36" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
      <circle cx="36" cy="36" r={r} fill="none" stroke="#6366F1" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} />
      <text x="36" y="36" transform="rotate(90 36 36)" textAnchor="middle" dy="5" className="fill-ink text-[14px] font-bold rotate-90">{Math.round(pct * 100)}%</text>
    </svg>
  );
}

function Documents() {
  const [sub, setSub] = useState<'main' | 'other'>('main');
  const uploaded = new Set(['CDL Front', 'CDL Back', 'Medical card', 'Pre-hire MVR report']);
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setSub('main')} className={`px-3 py-1.5 text-[13px] font-semibold rounded-lg ${sub === 'main' ? 'bg-primary-light text-primary' : 'text-muted'}`}>Main ({DOC_TYPES_MAIN.length - uploaded.size} missing)</button>
        <button onClick={() => setSub('other')} className={`px-3 py-1.5 text-[13px] font-semibold rounded-lg ${sub === 'other' ? 'bg-primary-light text-primary' : 'text-muted'}`}>Other (0)</button>
      </div>
      {sub === 'main' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {DOC_TYPES_MAIN.map((d) => {
            const has = uploaded.has(d);
            return (
              <div key={d} className="card p-4">
                <div className="text-[13px] font-semibold text-ink mb-2">{d}</div>
                {has ? <Pill kind="valid">1 file</Pill> : <><Pill kind="Missing">Missing</Pill><button className="btn-ghost w-full mt-2 py-1.5 text-[12px]">Upload</button></>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card p-6">
          <label className="field-label">Document Type</label>
          <select className="input mb-3"><option>Other</option></select>
          <label className="flex items-center gap-2 text-[13px] mb-3"><input type="checkbox" defaultChecked /> Extract with AI (OCR)</label>
          <div className="border-2 border-dashed border-line rounded-xl p-8 text-center text-sm text-muted">Drag &amp; drop files here, or click to browse — up to 10 files, 10MB each</div>
        </div>
      )}
    </div>
  );
}

function ActivityTab({ name }: { name: string }) {
  const events = [
    { icon: '🔀', text: `Stage changed to Screening`, time: '2h ago' },
    { icon: '📧', text: `Application link sent to ${name}`, time: '1d ago' },
    { icon: '✅', text: `Consents submitted`, time: '1d ago' },
    { icon: '➕', text: `Candidate created`, time: '3d ago' },
  ];
  return (
    <div className="card divide-y divide-line/60">
      {events.map((e, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <span>{e.icon}</span><span className="text-[13px] text-ink flex-1">{e.text}</span><span className="text-[12px] text-muted">{e.time}</span>
        </div>
      ))}
    </div>
  );
}

function SelectTruck({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const s = useStore();
  const available = s.trucks.filter((t) => t.status === 'Available');
  return (
    <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="card p-6 w-[480px] max-w-full shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-extrabold text-ink mb-1">Select Truck for Onboarding</div>
        <div className="text-xs text-muted mb-4">Only Available trucks are shown.</div>
        {available.length === 0 && <Empty icon="🚛" title="No available trucks" sub="Add a truck (Owner/Admin) to continue." />}
        {available.map((t) => (
          <button key={t.id} onClick={() => onPick(t.id)} className="w-full text-left p-3 rounded-lg border border-line hover:border-primary mb-2">
            <div className="font-bold text-ink">Unit #{t.unit} — {t.make} {t.model} {t.year}</div>
            <div className="text-xs text-muted">{t.plate} · {s.currentCarrier.name}</div>
          </button>
        ))}
        <button onClick={onClose} className="btn-ghost w-full mt-2">Cancel</button>
      </div>
    </div>
  );
}
