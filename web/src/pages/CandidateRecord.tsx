import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '@/store';
import { PageHeader, Pill, Empty, timeAgo } from '@/ui';
import { CHECKLIST_TEMPLATE, DOC_TYPES_MAIN } from '@/data/mock';
import { STAGES, type ChecklistStep, type Stage } from '@/types';

const TABS = ['Pipeline', 'Application', 'PEV', 'Documents'];
const GROUPS: ChecklistStep['group'][] = ['Compliance & Eligibility', 'Risk Screening', 'Health & Safety', 'Employment Setup'];
const RECRUITERS: Record<string, string> = { u1: 'Nina Patel', u2: 'Dana Reed', u3: 'Sam Pike' };

interface Activity {
  id: string;
  type: 'Note' | 'Email' | 'Call' | 'Task' | 'Stage';
  author: string;
  time: string;
  text: string;
}

const INITIAL_ACTIVITY: Activity[] = [
  { id: 'a0', type: 'Stage', author: 'System', time: new Date(Date.now() - 3 * 86400000).toISOString(), text: 'Candidate created and added to pipeline at Lead stage.' },
  { id: 'a1', type: 'Email', author: 'Nina Patel', time: new Date(Date.now() - 2 * 86400000).toISOString(), text: 'Application link sent via email and SMS.' },
  { id: 'a2', type: 'Note', author: 'Nina Patel', time: new Date(Date.now() - 86400000).toISOString(), text: 'Spoke with candidate. Available to start immediately. Prefers OTR solo runs.' },
  { id: 'a3', type: 'Stage', author: 'Dana Reed', time: new Date(Date.now() - 7200000).toISOString(), text: 'Stage changed to Screening.' },
];

const ACTION_ICON: Record<string, string> = { Note: '✏', Email: '✉', Call: '📞', Task: '✓' };
const ACTIVITY_ICON: Record<string, string> = { Note: '✏', Email: '✉', Call: '📞', Task: '✓', Stage: '🔀' };
const ACTIVITY_COLOR: Record<string, string> = {
  Note: 'bg-primary-light text-primary',
  Email: 'bg-[#DBEAFE] text-[#2563EB]',
  Call: 'bg-[#DCFCE7] text-[#16A34A]',
  Task: 'bg-[#EDE9FE] text-[#8B5CF6]',
  Stage: 'bg-[#F1F5F9] text-[#64748B]',
};

export default function CandidateRecord() {
  const s = useStore();
  const nav = useNavigate();
  const { candidateId } = useParams();
  const [tab, setTab] = useState('Pipeline');
  const [steps, setSteps] = useState<ChecklistStep[]>(() => CHECKLIST_TEMPLATE.map((x) => ({ ...x })));
  const [expanded, setExpanded] = useState<string | null>('clearinghouse');
  const [showTruck, setShowTruck] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [action, setAction] = useState<'Note' | 'Email' | 'Call' | 'Task' | null>(null);
  const [activity, setActivity] = useState<Activity[]>(INITIAL_ACTIVITY);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [activityFilter, setActivityFilter] = useState<'all' | 'Note' | 'Email' | 'Call' | 'Task'>('all');

  const c = s.candidates.find((x) => x.id === candidateId);
  const done = steps.filter((x) => x.status === 'complete').length;
  const allDone = c ? done === steps.length : false;
  const nextStage: Stage | null = c ? (STAGES[STAGES.indexOf(c.stage) + 1] ?? null) : null;
  const recruiter = c?.ownerUserId ? RECRUITERS[c.ownerUserId] ?? c.ownerUserId : 'Unassigned';

  useEffect(() => {
    if (autoAdvance && c && allDone && nextStage && nextStage !== 'Onboarding') {
      s.moveCandidate(c.id, nextStage);
      setActivity((prev) => [{ id: 'a' + Date.now(), type: 'Stage', author: 'System', time: new Date().toISOString(), text: `Pipeline auto-advanced to ${nextStage}.` }, ...prev]);
    }
  }, [allDone]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c) return <><PageHeader crumbs={[{ label: 'Hiring' }]} /><Empty icon="🚫" title="Candidate not found" /></>;

  const toggle = (id: string) =>
    setSteps((prev) => prev.map((x) => x.id === id ? { ...x, status: x.status === 'complete' ? 'ready' : 'complete' } : x));

  const addActivity = (type: Activity['type'], text: string) => {
    setActivity((prev) => [{ id: 'a' + Date.now(), type, author: recruiter, time: new Date().toISOString(), text }, ...prev]);
  };

  const advance = () => {
    if (nextStage === 'Onboarding') { setShowTruck(true); return; }
    if (nextStage) {
      s.moveCandidate(c.id, nextStage);
      addActivity('Stage', `Stage advanced to ${nextStage}.`);
    }
  };

  const filteredActivity = activityFilter === 'all' ? activity : activity.filter((a) => a.type === activityFilter);

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Carriers', to: '/carriers' }, { label: s.currentCarrier.name, to: `/carriers/${c.carrierId}` }, { label: 'Hiring', to: `/carriers/${c.carrierId}/hiring` }, { label: c.name }]}
        actions={<div className="flex gap-2"><button onClick={() => setShowEdit(true)} className="btn-ghost">Edit</button><button onClick={() => { if (confirm(`Archive ${c.name}?`)) nav(`/carriers/${c.carrierId}/hiring`); }} className="btn-ghost text-danger">Archive</button></div>}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="flex min-h-full">
          {/* ── LEFT RAIL ───────────────────────────── */}
          <aside className="w-[270px] flex-shrink-0 border-r border-line overflow-y-auto p-5 flex flex-col gap-4">
            {/* Avatar + name */}
            <div>
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-purple grid place-items-center text-xl font-bold text-white mb-3">{c.name[0]}</div>
              <div className="text-[17px] font-extrabold text-ink uppercase leading-tight">{c.name}</div>
              <div className="text-[12px] text-muted mt-1 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-primary-light text-primary grid place-items-center text-[9px] font-bold flex-shrink-0">{recruiter[0]}</span>
                <span>{recruiter}</span>
              </div>
              <div className="mt-2"><Pill kind={c.stage}>{c.stage}</Pill></div>
            </div>

            {/* Action icon buttons — HubSpot style */}
            <div className="flex gap-2">
              {(['Note', 'Email', 'Call', 'Task'] as const).map((a) => (
                <button key={a} onClick={() => setAction(a)}
                  className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border border-line bg-bg hover:border-primary hover:bg-primary-light hover:text-primary transition-all text-muted">
                  <span className="text-[18px]">{ACTION_ICON[a]}</span>
                  <span className="text-[10px] font-semibold">{a}</span>
                </button>
              ))}
            </div>

            {/* Contact info */}
            <div className="card p-3 space-y-2">
              <div className="flex justify-between text-[12.5px]"><span className="text-muted">Full name</span><span className="font-semibold text-ink truncate ml-2">{c.name}</span></div>
              <div className="flex justify-between text-[12.5px]"><span className="text-muted">Phone</span><a href={`tel:${c.phone}`} className="font-semibold text-info">{c.phone ?? '—'}</a></div>
              <div className="flex justify-between text-[12.5px] gap-1"><span className="text-muted flex-shrink-0">Email</span><a href={`mailto:${c.email}`} className="font-semibold text-info truncate">{c.email}</a></div>
            </div>

            {/* Eligibility */}
            <div>
              <div className="text-[10px] font-bold text-muted uppercase mb-2">Eligibility</div>
              {[['MVR', 'not_prohibited'], ['BGC', 'not_prohibited'], ['Clearinghouse', 'not_prohibited']].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1 text-[12.5px] border-b border-line/50 last:border-0">
                  <span className="text-muted">{k}</span><span className="text-success font-semibold">{v}</span>
                </div>
              ))}
            </div>

            {/* Settings */}
            <div>
              <div className="text-[10px] font-bold text-muted uppercase mb-2">Settings</div>
              <label className="flex items-center justify-between text-[12.5px] text-ink py-1">
                <span>Auto-advance pipeline</span>
                <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} className="w-4 h-4 accent-[#6366F1]" />
              </label>
              <label className="field-label mt-2">Recruiter</label>
              <select defaultValue={c.ownerUserId ?? ''} className="input text-[12px]">
                <option value="">Unassigned</option>
                {Object.entries(RECRUITERS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
          </aside>

          {/* ── CENTER ──────────────────────────────── */}
          <main className="flex-1 min-w-0 p-6">
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
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[12px] font-bold text-muted uppercase">{g}</span>
                        <span className="text-[11px] bg-bg border border-line rounded-full px-2 text-muted">{items.length}</span>
                      </div>
                      <div className="card divide-y divide-line/60">
                        {items.map((step) => (
                          <div key={step.id}>
                            <button onClick={() => setExpanded(expanded === step.id ? null : step.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-hover)]">
                              <span>{step.status === 'complete' ? '✅' : step.status === 'ready' ? '🔵' : '🔴'}</span>
                              <span className="text-[13.5px] font-semibold text-ink flex-1">{step.name}</span>
                              <Pill kind={step.status === 'complete' ? 'Complete' : step.status === 'ready' ? 'Ready to Run' : 'Action Needed'}>
                                {step.status === 'complete' ? 'Complete' : step.status === 'ready' ? 'Ready to Run' : 'Action Needed'}
                              </Pill>
                              <span className="text-muted ml-1">{expanded === step.id ? '▴' : '▾'}</span>
                            </button>
                            {expanded === step.id && (
                              <div className="px-4 pb-4 bg-bg/50">
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
            {(tab === 'Application' || tab === 'PEV') && <Empty icon="📄" title={`${tab} tab`} sub="Connect to API to render submitted application data." />}
          </main>

          {/* ── RIGHT RAIL ──────────────────────────── */}
          <aside className="w-[320px] flex-shrink-0 border-l border-line overflow-y-auto p-5 flex flex-col gap-4">
            {/* Pipeline Journey */}
            <div className="card p-4">
              <div className="text-[11px] font-bold text-muted uppercase mb-3">Pipeline Journey</div>
              <div className="flex flex-col gap-2 mb-4">
                {STAGES.map((st, i) => (
                  <div key={st} className={`flex items-center gap-2 text-[13px] ${st === c.stage ? 'font-bold text-primary' : 'text-muted'}`}>
                    <span>{i < STAGES.indexOf(c.stage) ? '✅' : st === c.stage ? '🔵' : '⚪'}</span> {st}
                  </div>
                ))}
              </div>
              {nextStage && <button onClick={advance} className="btn-primary w-full">Advance to {nextStage}</button>}
              {!nextStage && <div className="text-[12px] text-success font-semibold text-center">✔ Final stage reached</div>}
            </div>

            {/* Consents + Application compact */}
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-2"><span className="font-semibold text-[13px] text-ink">Consents</span><Pill kind="Submitted">Submitted</Pill></div>
              <div className="text-[12px] text-muted">Sent 2× via email & sms. Last: {timeAgo(c.stageEnteredAt)}</div>
              <button className="btn-ghost w-full py-1.5 text-[12px]">Download Consents</button>
            </div>

            <div className="card p-4 space-y-2">
              <div className="flex items-center gap-2"><span className="font-semibold text-[13px] text-ink">Application</span><Pill kind={c.appProgress === 100 ? 'Submitted' : 'In Progress'}>{c.appProgress === 100 ? 'Submitted' : 'In Progress'}</Pill></div>
              <div className="h-1.5 rounded-full bg-bg overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${c.appProgress}%` }} /></div>
              <div className="text-[11.5px] text-muted">{c.appProgress}% complete · last active {timeAgo(c.stageEnteredAt)}</div>
              <div className="flex flex-col gap-1.5">
                <button className="btn-ghost py-1.5 text-[12px]">Send Application Link</button>
                <button className="btn-ghost py-1.5 text-[12px] text-danger">Reject / Withdraw</button>
                <button className="btn-ghost py-1.5 text-[12px]">Download PDF</button>
              </div>
            </div>

            {/* Activity / Notes feed */}
            <div className="card overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                <span className="font-bold text-[14px] text-ink">Recent Activity</span>
                <button onClick={() => setAction('Note')} className="text-[12px] font-semibold text-primary hover:underline">＋ Add</button>
              </div>

              {/* Filter chips */}
              <div className="flex gap-1 px-3 pt-2.5 pb-1 flex-wrap">
                {(['all', 'Note', 'Email', 'Call', 'Task'] as const).map((f) => (
                  <button key={f} onClick={() => setActivityFilter(f)}
                    className={`text-[11px] px-2.5 py-0.5 rounded-full border transition ${activityFilter === f ? 'bg-primary text-white border-primary' : 'border-line text-muted hover:border-primary'}`}>
                    {f === 'all' ? 'All' : f}
                  </button>
                ))}
              </div>

              <div className="divide-y divide-line/50 max-h-[520px] overflow-y-auto">
                {filteredActivity.map((a) => (
                  <div key={a.id} className="px-4 py-3 hover:bg-[var(--surface-hover)]">
                    <div className="flex items-start gap-2.5 mb-1">
                      <span className={`w-6 h-6 rounded-full flex-shrink-0 grid place-items-center text-[11px] font-bold ${ACTIVITY_COLOR[a.type]}`}>{ACTIVITY_ICON[a.type]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-[12.5px] font-semibold text-ink">{a.type}</span>
                          <span className="text-[11px] text-muted">by {a.author}</span>
                          <span className="text-[11px] text-muted ml-auto">{timeAgo(a.time)}</span>
                        </div>
                        <div className="text-[12.5px] text-ink mt-0.5 break-words">{a.text}</div>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredActivity.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted">No {activityFilter} entries yet.</div>}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {showTruck && <SelectTruck onClose={() => setShowTruck(false)} onPick={(tid) => { s.assignTruck(c.id, tid); s.moveCandidate(c.id, 'Onboarding'); addActivity('Stage', 'Moved to Onboarding and truck assigned.'); setShowTruck(false); }} />}
      {action && <ActionModal kind={action} candidate={c} recruiter={recruiter} onClose={() => setAction(null)} onLog={addActivity} />}
      {showEdit && <EditCandidate name={c.name} email={c.email} phone={c.phone ?? ''} onClose={() => setShowEdit(false)} />}
    </>
  );
}

function ActionModal({ kind, candidate, recruiter, onClose, onLog }: {
  kind: 'Note' | 'Email' | 'Call' | 'Task';
  candidate: { name: string; email: string; phone?: string };
  recruiter: string;
  onClose: () => void;
  onLog: (type: Activity['type'], text: string) => void;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const TITLES: Record<string, string> = { Note: 'Add Note', Email: `Email ${candidate.name}`, Call: `Log Call`, Task: 'Create Task' };
  const PLACEHOLDERS: Record<string, string> = { Note: 'Write a note…', Email: 'Message body…', Call: 'Call outcome & notes…', Task: 'Task description…' };
  const SAVES: Record<string, string> = { Note: 'Save Note', Email: 'Send & Log', Call: 'Log Call', Task: 'Create Task' };

  const submit = () => {
    if (!text.trim()) return;
    if (kind === 'Email') window.location.href = `mailto:${candidate.email}?body=${encodeURIComponent(text)}`;
    const logText = kind === 'Email' ? `Emailed: ${text.trim()}` : kind === 'Call' ? `Call: ${text.trim()}` : kind === 'Task' ? `Task: ${text.trim()}` : text.trim();
    onLog(kind, logText);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="card p-6 w-[460px] max-w-full shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="text-[16px] font-extrabold text-ink mb-1">{TITLES[kind]}</div>
        {kind === 'Call' && <a href={`tel:${candidate.phone}`} className="text-[13px] text-info font-semibold block mb-2">{candidate.phone ?? '—'}</a>}
        {kind === 'Email' && <div className="text-[13px] text-muted mb-2">{candidate.email}</div>}
        <div className="text-[12px] text-muted mb-2">Logged as: <span className="font-semibold text-ink">{recruiter}</span></div>
        <textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) submit(); }}
          placeholder={PLACEHOLDERS[kind]} className="input h-28 resize-none" />
        <p className="text-[11px] text-muted mt-1.5">⌘ Enter to save</p>
        <div className="flex gap-2 mt-4">
          <button onClick={submit} className="btn-primary flex-1">{SAVES[kind]}</button>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function EditCandidate({ name, email, phone, onClose }: { name: string; email: string; phone: string; onClose: () => void }) {
  const [form, setForm] = useState({ name, email, phone });
  return (
    <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="card p-6 w-[440px] max-w-full shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-extrabold text-ink mb-4">Edit Candidate</div>
        {(['name', 'email', 'phone'] as const).map((f) => (
          <div key={f} className="mb-3">
            <label className="field-label capitalize">{f}</label>
            <input value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} className="input" />
          </div>
        ))}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="btn-primary flex-1">Save changes</button>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
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
      <text x="36" y="36" transform="rotate(90 36 36)" textAnchor="middle" dy="5" className="fill-ink text-[14px] font-bold">{Math.round(pct * 100)}%</text>
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
          <div className="border-2 border-dashed border-line rounded-xl p-8 text-center text-sm text-muted">Drag & drop files here, or click to browse — up to 10 files, 10MB each</div>
        </div>
      )}
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
          <button key={t.id} onClick={() => onPick(t.id)} className="w-full text-left p-3 rounded-lg border border-line hover:border-primary mb-2 transition-all">
            <div className="font-bold text-ink">Unit #{t.unit} — {t.make} {t.model} {t.year}</div>
            <div className="text-xs text-muted">{t.plate} · {s.currentCarrier.name}</div>
          </button>
        ))}
        <button onClick={onClose} className="btn-ghost w-full mt-2">Cancel</button>
      </div>
    </div>
  );
}
