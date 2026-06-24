import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store';
import Drawer from '@/components/Drawer';
import Icon from '@/components/Icon';
import {
  type Driver, type Result, type SourceMap,
  loadProfile, saveProfile, pullFromSources, loadReqs, runScreen,
  DriverFields, ResultPanel,
} from '@/components/screening';

// Slide-over that screens a single candidate against their carrier's saved
// requirements (Settings → Driver Screening). Auto-fills from a saved record or
// from connected sources (driver record today; FMCSA/Tenstreet once connected),
// and remembers what the recruiter enters.
export default function CandidateScreening({
  candidateId, candidateName, carrierId, onClose,
}: { candidateId: string; candidateName: string; carrierId: string; onClose: () => void }) {
  const s = useStore();
  const saved = loadProfile(candidateId);
  const pulled = pullFromSources(candidateName, s.drivers);

  const [driver, setDriver] = useState<Driver>(() => saved ?? pulled.driver);
  const [sources, setSources] = useState<SourceMap>(pulled.sources);
  const [loadedSaved, setLoadedSaved] = useState(Boolean(saved));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  const setD = (section: keyof Driver, key: string, value: unknown) =>
    setDriver((p) => ({ ...p, [section]: { ...(p[section] as object), [key]: value } }));

  const pull = () => {
    const fresh = pullFromSources(candidateName, s.drivers);
    setDriver(fresh.driver);
    setSources(fresh.sources);
    setLoadedSaved(false);
    setResult(null);
  };

  const run = async () => {
    setBusy(true); setResult(null); setError('');
    try {
      const r = await runScreen(loadReqs(carrierId), driver);
      setResult(r);
      saveProfile(candidateId, driver); // remember the record for next time
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
      <p className="text-[12.5px] text-muted mb-3">
        Evaluated against this carrier’s saved requirements. {loadedSaved
          ? 'Loaded this candidate’s saved record.'
          : 'Pre-filled from connected sources; fill in the rest.'}
      </p>

      {/* Data sources — where each section is (or will be) pulled from */}
      <div className="border border-line rounded-lg p-3 mb-4 text-[12px]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-bold text-ink">Data sources</span>
          <button onClick={pull} className="flex items-center gap-1 text-primary font-semibold hover:gap-1.5 transition-all">
            <Icon name="arrowRight" size={13} /> Pull latest
          </button>
        </div>
        {(['cdl', 'mvr', 'psp', 'insurance'] as const).map((k) => {
          const connected = !/not connected/i.test(sources[k]);
          return (
            <div key={k} className="flex items-center justify-between py-0.5">
              <span className="uppercase text-muted">{k}</span>
              <span className={connected ? 'text-success' : 'text-muted'}>{sources[k]}</span>
            </div>
          );
        })}
      </div>

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
        MVR and PSP auto-populate once <Link to="/settings#screening" onClick={onClose} className="text-primary font-semibold">Tenstreet and FMCSA</Link> are connected.
        Requirements are managed in Settings → Driver Screening.
      </p>
    </Drawer>
  );
}
