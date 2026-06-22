import { useState } from 'react';
import { Link } from 'react-router-dom';
import Drawer from '@/components/Drawer';
import {
  type Driver, type Result,
  EMPTY_DRIVER, clone, loadReqs, runScreen,
  DriverFields, ResultPanel,
} from '@/components/screening';

// Slide-over that screens a single candidate against their carrier's saved
// requirements (Settings → Driver Screening). Pre-fills the candidate's name;
// the recruiter fills in the CDL/MVR/PSP/Insurance record.
export default function CandidateScreening({
  candidateName, carrierId, onClose,
}: { candidateName: string; carrierId: string; onClose: () => void }) {
  const [driver, setDriver] = useState<Driver>(() => ({ ...clone(EMPTY_DRIVER), name: candidateName }));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  const setD = (section: keyof Driver, key: string, value: unknown) =>
    setDriver((p) => ({ ...p, [section]: { ...(p[section] as object), [key]: value } }));

  const run = async () => {
    setBusy(true); setResult(null); setError('');
    try {
      setResult(await runScreen(loadReqs(carrierId), driver));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backend unreachable — could not run screening.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open onClose={onClose}
      icon="clipboardCheck" tint="#EDE9FE" accent="#8B5CF6"
      title="AI Driver Screening" subtitle={candidateName}
      hint={{ to: '/settings#screening', label: 'Edit this carrier’s requirements' }}
    >
      <p className="text-[12.5px] text-muted mb-4">
        Evaluated against this carrier’s saved requirements. Fill in the applicant’s
        record, then run the screening.
      </p>

      <DriverFields driver={driver} setD={setD} />

      <div className="flex items-center gap-3 mt-4">
        <button onClick={run} disabled={busy} className="btn-primary disabled:opacity-50">{busy ? 'Screening…' : 'Run AI Screening'}</button>
        {error && <span className="text-[12.5px] text-danger">{error}</span>}
      </div>

      {result && (
        <div className="mt-5">
          <ResultPanel result={result} name={candidateName} />
        </div>
      )}

      <p className="text-[11px] text-muted mt-4">
        Requirements are managed in <Link to="/settings#screening" onClick={onClose} className="text-primary font-semibold">Settings → Driver Screening</Link>.
      </p>
    </Drawer>
  );
}
