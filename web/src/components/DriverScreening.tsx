import { useEffect, useState } from 'react';
import { useStore } from '@/store';
import Icon from '@/components/Icon';
import {
  type Reqs, type Driver, type Result,
  EMPTY_DRIVER, clone, loadReqs, saveReqs, runScreen,
  RequirementsFields, DriverFields, ResultPanel,
} from '@/components/screening';

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

  const setR = (section: keyof Reqs, key: string, value: unknown) =>
    setReqs((p) => ({ ...p, [section]: { ...(p[section] as object), [key]: value } }));
  const setD = (section: keyof Driver, key: string, value: unknown) =>
    setDriver((p) => ({ ...p, [section]: { ...(p[section] as object), [key]: value } }));

  const save = () => {
    saveReqs(s.currentCarrierId, reqs);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const run = async () => {
    setBusy(true); setResult(null); setError('');
    try {
      setResult(await runScreen(reqs, driver));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backend unreachable — could not run screening.');
    } finally {
      setBusy(false);
    }
  };

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

        <RequirementsFields reqs={reqs} setR={setR} />

        <div className="flex items-center gap-3 mt-4">
          <button onClick={save} className="btn-primary">Save requirements</button>
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

        <DriverFields driver={driver} setD={setD} />

        <div className="flex items-center gap-3 mt-4">
          <button onClick={run} disabled={busy} className="btn-primary disabled:opacity-50">{busy ? 'Screening…' : 'Run AI Screening'}</button>
          <button onClick={() => { setDriver(clone(EMPTY_DRIVER)); setResult(null); setError(''); }} className="btn-ghost">Reset</button>
          {error && <span className="text-[12.5px] text-danger">{error}</span>}
        </div>
      </div>

      {result && <ResultPanel result={result} name={driver.name} />}
    </div>
  );
}
