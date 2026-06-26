import Icon from '@/components/Icon';

export const ENDORSEMENTS = ['Hazmat', 'Tanker', 'Doubles/Triples', 'Passenger'];

export interface Reqs {
  cdl: { class: string; endorsements: string[]; minExperienceYears: number; allowOwnerOperator: boolean; minValidityDays: number };
  mvr: { maxMovingViolations: number; maxAccidents: number; maxDUI: number; lookbackYears: number };
  psp: { maxCrashes: number; maxOOSInspections: number; lookbackYears: number };
  insurance: { minAutoLiability: number; cargoRequired: boolean; minCargo: number };
}
export interface Driver {
  name: string;
  cdl: { class: string; endorsements: string[]; experienceYears: number; type: string; expiresInDays: number };
  mvr: { movingViolations: number; accidents: number; dui: number };
  psp: { crashes: number; oosInspections: number };
  insurance: { autoLiability: number; hasCargo: boolean; cargo: number };
}
export interface Result {
  decision: string;
  categories: { key: string; pass: boolean; reason: string }[];
  summary: string;
  engine?: string;
  model?: string;
  aiError?: string;
}

export const DEFAULT_REQS: Reqs = {
  cdl: { class: 'A', endorsements: [], minExperienceYears: 2, allowOwnerOperator: true, minValidityDays: 30 },
  mvr: { maxMovingViolations: 3, maxAccidents: 1, maxDUI: 0, lookbackYears: 3 },
  psp: { maxCrashes: 2, maxOOSInspections: 3, lookbackYears: 3 },
  insurance: { minAutoLiability: 1000000, cargoRequired: true, minCargo: 100000 },
};
export const EMPTY_DRIVER: Driver = {
  name: '',
  cdl: { class: 'A', endorsements: [], experienceYears: 0, type: 'company', expiresInDays: 365 },
  mvr: { movingViolations: 0, accidents: 0, dui: 0 },
  psp: { crashes: 0, oosInspections: 0 },
  insurance: { autoLiability: 1000000, hasCargo: true, cargo: 100000 },
};

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export function loadReqs(carrierId: string): Reqs {
  try {
    const raw = localStorage.getItem(`qh_req_${carrierId}`);
    if (raw) return JSON.parse(raw) as Reqs;
  } catch { /* ignore */ }
  return clone(DEFAULT_REQS);
}
export function saveReqs(carrierId: string, reqs: Reqs) {
  localStorage.setItem(`qh_req_${carrierId}`, JSON.stringify(reqs));
}

// Per-candidate screening record — remembered between visits so the CDL/MVR/PSP/
// Insurance data doesn't have to be re-typed each time.
export function loadProfile(candidateId: string): Driver | null {
  try {
    const raw = localStorage.getItem(`qh_screen_${candidateId}`);
    if (raw) return JSON.parse(raw) as Driver;
  } catch { /* ignore */ }
  return null;
}
export function saveProfile(candidateId: string, driver: Driver) {
  localStorage.setItem(`qh_screen_${candidateId}`, JSON.stringify(driver));
}

// ── Integration seam ─────────────────────────────────────────────────────────
// Single place where applicant data is pulled from connected sources. Today it
// derives CDL basics from a linked driver record; once FMCSA (PSP) and Tenstreet
// (MVR / employment verification) are connected they populate the rest here, and
// the screening form auto-fills instead of being typed.
export interface SourceMap { cdl: string; mvr: string; psp: string; insurance: string }
export function pullFromSources(
  name: string,
  drivers: { name: string; type: string; hireDate: string }[],
): { driver: Driver; sources: SourceMap } {
  const driver = { ...clone(EMPTY_DRIVER), name };
  const sources: SourceMap = {
    cdl: 'Manual entry',
    mvr: 'Tenstreet — not connected',
    psp: 'FMCSA PSP — not connected',
    insurance: 'Manual entry',
  };
  const match = drivers.find((d) => d.name.toUpperCase() === name.toUpperCase());
  if (match) {
    driver.cdl.type = match.type === 'owner-operator' ? 'owner-operator' : 'company';
    driver.cdl.experienceYears = Math.max(0, Math.floor((Date.now() - new Date(match.hireDate).getTime()) / (365.25 * 864e5)));
    sources.cdl = 'Driver record';
  }
  return { driver, sources };
}

// Screen a driver against requirements via the backend (AI, or rule-engine fallback).
export async function runScreen(requirements: Reqs, driver: Driver): Promise<Result> {
  const res = await fetch('/api/screen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': localStorage.getItem('qh_admin') ?? '' },
    body: JSON.stringify({ requirements, driver }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Screening failed (${res.status}).`);
  return data as Result;
}

/* ── small field helpers ─────────────────────────────────────────────────── */
export function Num({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1">
      <span className="text-[13px] text-ink">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="input w-32 py-1.5" />
    </label>
  );
}
export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (b: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[13px] text-ink">{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" />
    </label>
  );
}
export function Endorsements({ selected, onToggle }: { selected: string[]; onToggle: (e: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 py-1">
      {ENDORSEMENTS.map((e) => (
        <button key={e} type="button" onClick={() => onToggle(e)}
          className={`pill cursor-pointer ${selected.includes(e) ? 'pill-blue' : 'pill-slate'}`}>{e}</button>
      ))}
    </div>
  );
}
export function Box({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-line rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2 text-[13px] font-bold text-ink">
        <span className="text-primary"><Icon name={icon} size={16} /></span>{title}
      </div>
      {children}
    </div>
  );
}

/* ── requirements editor grid ────────────────────────────────────────────── */
export function RequirementsFields({ reqs, setR }: { reqs: Reqs; setR: (section: keyof Reqs, key: string, value: unknown) => void }) {
  return (
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
  );
}

/* ── driver-record input grid ────────────────────────────────────────────── */
export function DriverFields({ driver, setD }: { driver: Driver; setD: (section: keyof Driver, key: string, value: unknown) => void }) {
  return (
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
  );
}

/* ── result panel ────────────────────────────────────────────────────────── */
import { Pill } from '@/ui';

const decisionKind = (d: string) => (d === 'approved' ? 'active' : d === 'rejected' ? 'Missing' : 'pending');
const decisionLabel = (d: string) => (d === 'approved' ? 'Approved' : d === 'rejected' ? 'Not Acceptable' : 'Needs Review');

export function ResultPanel({ result, name }: { result: Result; name: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <Pill kind={decisionKind(result.decision)}>{decisionLabel(result.decision)}</Pill>
        <div className="text-[15px] font-bold text-ink">{name || 'Applicant'}</div>
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
  );
}
