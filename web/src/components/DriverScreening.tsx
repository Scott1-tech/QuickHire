import { useEffect, useState } from 'react';
import { useStore } from '@/store';
import { Pill } from '@/ui';
import Icon from '@/components/Icon';

const ENDORSEMENTS = ['Hazmat', 'Tanker', 'Doubles/Triples', 'Passenger'];

interface Reqs {
  cdl: { class: string; endorsements: string[]; minExperienceYears: number; allowOwnerOperator: boolean; minValidityDays: number };
  mvr: { maxMovingViolations: number; maxAccidents: number; maxDUI: number; lookbackYears: number };
  psp: { maxCrashes: number; maxOOSInspections: number; lookbackYears: number };
  insurance: { minAutoLiability: number; cargoRequired: boolean; minCargo: number };
}
interface Driver {
  name: string;
  cdl: { class: string; endorsements: string[]; experienceYears: number; type: string; expiresInDays: number };
  mvr: { movingViolations: number; accidents: number; dui: number };
  psp: { crashes: number; oosInspections: number };
  insurance: { autoLiability: number; hasCargo: boolean; cargo: number };
}
interface Result {
  decision: string;
  categories: { key: string; pass: boolean; reason: string }[];
  summary: string;
  engine?: string;
  model?: string;
  aiError?: string;
}

const DEFAULT_REQS: Reqs = {
  cdl: { class: 'A', endorsements: [], minExperienceYears: 2, allowOwnerOperator: true, minValidityDays: 30 },
  mvr: { maxMovingViolations: 3, maxAccidents: 1, maxDUI: 0, lookbackYears: 3 },
  psp: { maxCrashes: 2, maxOOSInspections: 3, lookbackYears: 3 },
  insurance: { minAutoLiability: 1000000, cargoRequired: true, minCargo: 100000 },
};
const EMPTY_DRIVER: Driver = {
  name: '',
  cdl: { class: 'A', endorsements: [], experienceYears: 0, type: 'company', expiresInDays: 365 },
  mvr: { movingViolations: 0, accidents: 0, dui: 0 },
  psp: { crashes: 0, oosInspections: 0 },
  insurance: { autoLiability: 1000000, hasCargo: true, cargo: 100000 },
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function loadReqs(carrierId: string): Reqs {
  try {
    const raw = localStorage.getItem(`qh_req_${carrierId}`);
    if (raw) return JSON.parse(raw) as Reqs;
  } catch { /* ignore */ }
  return clone(DEFAULT_REQS);
}

/* ── small field helpers ─────────────────────────────────────────────────── */
function Num({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1">
      <span className="text-[13px] text-ink">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="input w-32 py-1.5" />
    </label>
  );
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (b: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[13px] text-ink">{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" />
    </label>
  );
}
function Endorsements({ selected, onToggle }: { selected: string[]; onToggle: (e: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 py-1">
      {ENDORSEMENTS.map((e) => (
        <button key={e} type="button" onClick={() => onToggle(e)}
          className={`pill cursor-pointer ${selected.includes(e) ? 'pill-blue' : 'pill-slate'}`}>{e}</button>
      ))}
    </div>
  );
}
function Box({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-line rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2 text-[13px] font-bold text-ink">
        <span className="text-primary"><Icon name={icon} size={16} /></span>{title}
      </div>
      {children}
    </div>
  );
}

export default function DriverScreening() {
  const s = useStore();
  const [reqs, setReqs] = useState<Reqs>(() => loadReqs(s.currentCarrierId));
  const [driver, setDriver] = useState<Driver>(() => clone(EMPTY_DRIVER));
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  // Requirements are per-carrier — reload when the active carrier changes.
  useEffect(() => { setReqs(loadReqs(s.currentCarrierId)); setResult(null); }, [s.currentCarrierId]);

  // typed nested setters
  const setR = (section: keyof Reqs, key: string, value: unknown) =>
    setReqs((p) => ({ ...p, [section]: { ...(p[section] as object), [key]: value } }));
  const setD = (section: keyof Driver, key: string, value: unknown) =>
    setDriver((p) => ({ ...p, [section]: { ...(p[section] as object), [key]: value } }));

  const saveReqs = () => {
    localStorage.setItem(`qh_req_${s.currentCarrierId}`, JSON.stringify(reqs));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const run = async () => {
    setBusy(true); setResult(null); setError('');
    try {
      const res = await fetch('/api/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': localStorage.getItem('qh_admin') ?? '' },
        body: JSON.stringify({ requirements: reqs, driver }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setResult(data as Result);
      else setError(data.error || `Screening failed (${res.status}).`);
    } catch {
      setError('Backend unreachable — could not run screening.');
    } finally {
      setBusy(false);
    }
  };

  const decisionKind = (d: string) => (d === 'approved' ? 'active' : d === 'rejected' ? 'Missing' : 'pending');

  return (
    <div className="max-w-4xl space-y-5">
      {/* ── Carrier requirements ─────────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-primary"><Icon name="shield" size={18} /></span>
          <div className="text-base font-bold text-ink">Driver Requirements</div>
          <span className="ml-auto text-[12px] text-muted">{s.currentCarrier.name}</span>
        </div>
        <p className="text-[12.5px] text-muted mb-4">Set the hiring bar for this carrier. Each carrier keeps its own thresholds; an applicant is screened against these.</p>

        <div className="grid sm:grid-cols-2 gap-3">
          <Box icon="wheel" title="CDL">
            <label className="flex items-center justify-between gap-3 py-1">
              <span className="text-[13px] text-ink">Minimum class</span>
              <select value={reqs.cdl.class} onChange={(e) => setR('cdl', 'class', e.target.value)} className="input w-32 py-1.5">
                <option value="A">Class A</option><option value="B">Class B</option><option value="C">Class C</option>
              </select>
            </label>
            <div className="text-[13px] text-ink pt-1">Required endorsements</div>
            <Endorsements selected={reqs.cdl.endorsements} onToggle={(e) =>
              setR('cdl', 'endorsements', reqs.cdl.endorsements.includes(e) ? reqs.cdl.endorsements.filter((x) => x !== e) : [...reqs.cdl.endorsements, e])} />
            <Num label="Min experience (yrs)" value={reqs.cdl.minExperienceYears} onChange={(v) => setR('cdl', 'minExperienceYears', v)} />
            <Num label="Min CDL validity (days)" value={reqs.cdl.minValidityDays} onChange={(v) => setR('cdl', 'minValidityDays', v)} />
            <Toggle label="Allow owner-operators" value={reqs.cdl.allowOwnerOperator} onChange={(v) => setR('cdl', 'allowOwnerOperator', v)} />
          </Box>

          <Box icon="shield" title="MVR — Motor Vehicle Record">
            <Num label="Max moving violations" value={reqs.mvr.maxMovingViolations} onChange={(v) => setR('mvr', 'maxMovingViolations', v)} />
            <Num label="Max accidents" value={reqs.mvr.maxAccidents} onChange={(v) => setR('mvr', 'maxAccidents', v)} />
            <Num label="Max DUI / DWI" value={reqs.mvr.maxDUI} onChange={(v) => setR('mvr', 'maxDUI', v)} />
            <Num label="Lookback (yrs)" value={reqs.mvr.lookbackYears} onChange={(v) => setR('mvr', 'lookbackYears', v)} />
          </Box>

          <Box icon="clipboardCheck" title="PSP — Pre-Employment Screening">
            <Num label="Max crashes" value={reqs.psp.maxCrashes} onChange={(v) => setR('psp', 'maxCrashes', v)} />
            <Num label="Max out-of-service inspections" value={reqs.psp.maxOOSInspections} onChange={(v) => setR('psp', 'maxOOSInspections', v)} />
            <Num label="Lookback (yrs)" value={reqs.psp.lookbackYears} onChange={(v) => setR('psp', 'lookbackYears', v)} />
          </Box>

          <Box icon="building" title="Insurance">
            <Num label="Min auto liability ($)" value={reqs.insurance.minAutoLiability} onChange={(v) => setR('insurance', 'minAutoLiability', v)} />
            <Toggle label="Cargo insurance required" value={reqs.insurance.cargoRequired} onChange={(v) => setR('insurance', 'cargoRequired', v)} />
            <Num label="Min cargo coverage ($)" value={reqs.insurance.minCargo} onChange={(v) => setR('insurance', 'minCargo', v)} />
          </Box>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button onClick={saveReqs} className="btn-primary">Save requirements</button>
          {saved && <span className="text-[12.5px] text-success">Saved for {s.currentCarrier.name}.</span>}
        </div>
      </div>

      {/* ── Screen a driver ──────────────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-primary"><Icon name="clipboardCheck" size={18} /></span>
          <div className="text-base font-bold text-ink">Screen a Driver</div>
        </div>
        <p className="text-[12.5px] text-muted mb-4">Enter the applicant's record. The AI evaluates it against the requirements above and approves it, or explains why it isn't acceptable.</p>

        <div className="mb-3 max-w-sm">
          <label className="field-label">Applicant name</label>
          <input value={driver.name} onChange={(e) => setDriver({ ...driver, name: e.target.value })} className="input" placeholder="e.g. James Wilson" />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Box icon="wheel" title="CDL">
            <label className="flex items-center justify-between gap-3 py-1">
              <span className="text-[13px] text-ink">Class held</span>
              <select value={driver.cdl.class} onChange={(e) => setD('cdl', 'class', e.target.value)} className="input w-32 py-1.5">
                <option value="A">Class A</option><option value="B">Class B</option><option value="C">Class C</option>
              </select>
            </label>
            <div className="text-[13px] text-ink pt-1">Endorsements held</div>
            <Endorsements selected={driver.cdl.endorsements} onToggle={(e) =>
              setD('cdl', 'endorsements', driver.cdl.endorsements.includes(e) ? driver.cdl.endorsements.filter((x) => x !== e) : [...driver.cdl.endorsements, e])} />
            <Num label="Experience (yrs)" value={driver.cdl.experienceYears} onChange={(v) => setD('cdl', 'experienceYears', v)} />
            <Num label="CDL expires in (days)" value={driver.cdl.expiresInDays} onChange={(v) => setD('cdl', 'expiresInDays', v)} />
            <label className="flex items-center justify-between gap-3 py-1">
              <span className="text-[13px] text-ink">Driver type</span>
              <select value={driver.cdl.type} onChange={(e) => setD('cdl', 'type', e.target.value)} className="input w-32 py-1.5">
                <option value="company">Company</option><option value="owner-operator">Owner-operator</option>
              </select>
            </label>
          </Box>

          <Box icon="shield" title="MVR">
            <Num label="Moving violations" value={driver.mvr.movingViolations} onChange={(v) => setD('mvr', 'movingViolations', v)} />
            <Num label="Accidents" value={driver.mvr.accidents} onChange={(v) => setD('mvr', 'accidents', v)} />
            <Num label="DUI / DWI" value={driver.mvr.dui} onChange={(v) => setD('mvr', 'dui', v)} />
          </Box>

          <Box icon="clipboardCheck" title="PSP">
            <Num label="PSP crashes" value={driver.psp.crashes} onChange={(v) => setD('psp', 'crashes', v)} />
            <Num label="Out-of-service inspections" value={driver.psp.oosInspections} onChange={(v) => setD('psp', 'oosInspections', v)} />
          </Box>

          <Box icon="building" title="Insurance">
            <Num label="Auto liability ($)" value={driver.insurance.autoLiability} onChange={(v) => setD('insurance', 'autoLiability', v)} />
            <Toggle label="Has cargo insurance" value={driver.insurance.hasCargo} onChange={(v) => setD('insurance', 'hasCargo', v)} />
            <Num label="Cargo coverage ($)" value={driver.insurance.cargo} onChange={(v) => setD('insurance', 'cargo', v)} />
          </Box>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button onClick={run} disabled={busy} className="btn-primary disabled:opacity-50">{busy ? 'Screening…' : 'Run AI Screening'}</button>
          <button onClick={() => { setDriver(clone(EMPTY_DRIVER)); setResult(null); setError(''); }} className="btn-ghost">Reset</button>
          {error && <span className="text-[12.5px] text-danger">{error}</span>}
        </div>
      </div>

      {/* ── Result ───────────────────────────────────────────────────────── */}
      {result && (
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <Pill kind={decisionKind(result.decision)}>
              {result.decision === 'approved' ? 'Approved' : result.decision === 'rejected' ? 'Not Acceptable' : 'Needs Review'}
            </Pill>
            <div className="text-[15px] font-bold text-ink">{driver.name || 'Applicant'}</div>
            <span className="ml-auto text-[11px] text-muted">
              {result.engine === 'ai' ? `AI · ${result.model ?? ''}` : 'Rule-based check'}
              {result.aiError ? ' (AI fallback)' : ''}
            </span>
          </div>
          <p className="text-[13px] text-ink mb-4">{result.summary}</p>
          <div className="flex flex-col gap-2">
            {result.categories.map((c) => (
              <div key={c.key} className="flex items-start gap-3 border border-line rounded-lg p-3">
                <Pill kind={c.pass ? 'valid' : 'Missing'}>{c.pass ? 'Pass' : 'Fail'}</Pill>
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-ink">{c.key}</div>
                  <div className="text-[12.5px] text-muted">{c.reason}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-4">AI assists screening against your stated requirements — a recruiter makes the final hiring decision.</p>
        </div>
      )}
    </div>
  );
}
