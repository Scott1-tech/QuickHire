import { useState } from 'react';
import { useStore } from '@/store';
import type { Candidate } from '@/types';

// Anna's best-fit carrier offers, shown inside a candidate's profile.
// Takes the key driver-qualification fields, asks the backend matcher to rank
// every carrier, and shows each as an offer with a "why this fits" summary.
// Selecting an offer creates a send-offer task (the human action).

type Match = {
  carrierId: string;
  carrierName: string;
  status: 'ELIGIBLE' | 'NEEDS_DATA' | 'INELIGIBLE';
  fitScore: number;
  fitSummary?: string | null;
  gateResults?: { status: string; reason: string }[];
};

const STATUS_CLASS: Record<string, string> = {
  ELIGIBLE: 'bg-[#DCFCE7] text-[#16A34A]',
  NEEDS_DATA: 'bg-[#FEF3C7] text-[#B45309]',
  INELIGIBLE: 'bg-[#F1F5F9] text-[#64748B]',
};

export default function AnnaOffers({ candidate }: { candidate: Candidate }) {
  const s = useStore();
  const [form, setForm] = useState({ cdlClass: 'A', experienceYears: '', endorsements: '', age: '', movingViolations: '', accidents: '', dui: '' });
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const find = async () => {
    setBusy(true); setErr(''); setNote(''); setMatches(null);
    const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
    const lead: Record<string, unknown> = {
      name: candidate.name,
      cdlClass: form.cdlClass || undefined,
      experienceYears: num(form.experienceYears),
      age: num(form.age),
      movingViolations: num(form.movingViolations),
      accidents: num(form.accidents),
      dui: num(form.dui),
    };
    if (form.endorsements.trim()) lead.endorsements = form.endorsements.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
    try {
      const res = await fetch('/api/anna/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': localStorage.getItem('qh_admin') ?? '' },
        body: JSON.stringify({ lead }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setMatches(data.match.matches as Match[]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const selectOffer = (m: Match) => {
    s.addTask({
      title: `Send ${m.carrierName} offer to ${candidate.name}`,
      assignee: s.currentUser,
      priority: 'High',
      source: 'Anna',
      description: m.fitSummary || `Best-fit carrier for ${candidate.name} (${m.fitScore}% fit).`,
    });
    setNote(`Created a task to send the ${m.carrierName} offer to ${candidate.name}. Find it in Tasks.`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <span className="w-7 h-7 grid place-items-center rounded-full bg-primary-light text-primary">🤖</span>
        <div>
          <h3 className="text-sm font-bold text-ink">Anna — best-fit carrier offers</h3>
          <p className="text-[12px] text-muted">Enter the driver's qualifications. Anna ranks every carrier and explains why each fits — you pick which offer to send.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <label className="text-[12px] text-muted">CDL class
          <select value={form.cdlClass} onChange={set('cdlClass')} className="mt-0.5 w-full bg-transparent border border-line rounded-lg px-2 py-1.5 text-sm text-ink outline-none focus:border-primary">
            <option>A</option><option>B</option><option>C</option>
          </select>
        </label>
        <Field label="Experience (yrs)" value={form.experienceYears} onChange={set('experienceYears')} type="number" placeholder="5" />
        <Field label="Age" value={form.age} onChange={set('age')} type="number" placeholder="30" />
        <Field label="Endorsements" value={form.endorsements} onChange={set('endorsements')} placeholder="H, N" />
        <Field label="Moving violations" value={form.movingViolations} onChange={set('movingViolations')} type="number" placeholder="0" />
        <Field label="Accidents" value={form.accidents} onChange={set('accidents')} type="number" placeholder="0" />
        <Field label="DUI / DWI" value={form.dui} onChange={set('dui')} type="number" placeholder="0" />
        <div className="flex items-end">
          <button onClick={find} disabled={busy} className="btn-primary w-full disabled:opacity-50">{busy ? 'Matching…' : 'Find best-fit carriers'}</button>
        </div>
      </div>

      {err && <div className="text-sm text-danger bg-[#FEF2F2] rounded-lg p-2">⚠ {err}</div>}
      {note && <div className="text-sm text-[#16A34A] bg-[#DCFCE7] rounded-lg p-2">✓ {note}</div>}

      {matches && matches.length === 0 && <Empty />}
      {matches && matches.length > 0 && (
        <div className="space-y-2">
          {matches.map((m, i) => {
            const issues = (m.gateResults || []).filter((g) => g.status !== 'PASS');
            const isTop = i === 0 && m.status === 'ELIGIBLE';
            return (
              <div key={m.carrierId} className={`rounded-xl border p-3 ${isTop ? 'border-primary' : 'border-line'} bg-surface`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-ink">{m.carrierName} {isTop && <span className="text-[10px] text-primary font-bold">★ Anna's top pick</span>}</span>
                  <span className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_CLASS[m.status]}`}>{m.status}</span>
                    <span className="text-xs font-bold text-ink">{m.status === 'INELIGIBLE' ? '—' : `${m.fitScore}%`}</span>
                  </span>
                </div>
                {m.fitSummary && <p className="text-xs text-ink/80 mt-1.5"><span className="font-semibold text-muted">Why this fits:</span> {m.fitSummary}</p>}
                {issues.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {issues.map((g, j) => <li key={j} className={`text-xs ${g.status === 'FAIL' ? 'text-danger' : 'text-[#B45309]'}`}>• {g.reason}</li>)}
                  </ul>
                )}
                {m.status !== 'INELIGIBLE' && (
                  <button onClick={() => selectOffer(m)} className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-white hover:opacity-90">Select & create send task</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; placeholder?: string;
}) {
  return (
    <label className="text-[12px] text-muted">
      {label}
      <input value={value} onChange={onChange} type={type} placeholder={placeholder}
        className="mt-0.5 w-full bg-transparent border border-line rounded-lg px-2 py-1.5 text-sm text-ink outline-none focus:border-primary" />
    </label>
  );
}

function Empty() {
  return (
    <div className="text-center text-sm text-muted py-8">
      No carriers configured to match against, or none recommended. Add carrier requirements first.
    </div>
  );
}
