import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { PageHeader, Pill, Empty, timeAgo } from '@/ui';
import { DRIVERS, CANDIDATES, TRUCKS } from '@/data/mock';
import CarrierForm from '@/components/CarrierForm';
import {
  listCarriers, createCarrier, getCarrierForm, statusMeta,
  type CarrierSummary, type CarrierSection, type DispatchResult,
} from '@/lib/carrierApi';

export default function Carriers() {
  const s = useStore();
  const nav = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [carriers, setCarriers] = useState<CarrierSummary[] | null>(null);
  const [err, setErr] = useState('');

  const load = () => { listCarriers().then(setCarriers).catch((e) => setErr(e.message)); };
  useEffect(load, []);

  return (
    <>
      <PageHeader crumbs={[{ label: 'Carriers' }]}
        actions={<button onClick={() => setShowAdd(true)} className="btn-primary">＋ Add Carrier</button>} />
      <div className="flex-1 overflow-y-auto p-6">

        {/* ── Real carrier requirement profiles (backend) ───────────────────── */}
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-[15px] font-bold text-ink">Carrier Requirement Profiles</h2>
          {carriers && <span className="text-[12px] text-muted">({carriers.length})</span>}
        </div>
        <p className="text-[13px] text-muted mb-4 max-w-2xl">
          Add a carrier and either fill out their hiring requirements yourself, or send the carrier a secure link
          (email or SMS) to complete it. Once submitted, the requirements appear right here under the carrier's profile.
        </p>

        {err && <div className="text-[13px] text-danger mb-4">{err}</div>}

        {!carriers ? (
          err ? null : <div className="text-sm text-muted py-8">Loading carriers…</div>
        ) : carriers.length === 0 ? (
          <div className="card p-5 mb-8"><Empty icon="🏢" title="No carrier profiles yet"
            sub="Click “Add Carrier” to create your first one." /></div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 mb-8">
            {carriers.map((c) => {
              const meta = statusMeta(c.status, c.filledBy);
              return (
                <div key={c.id} className="card p-5 hover:shadow-card transition cursor-pointer"
                  onClick={() => nav(`/carriers/profile/${c.id}`)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[15px] font-extrabold text-ink uppercase truncate">{c.name}</div>
                      <div className="text-xs text-muted mt-1 truncate">{c.email || c.ownerName || 'No contact on file'}</div>
                    </div>
                    <Pill kind={meta.kind}>{meta.label}</Pill>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[12px] text-muted mb-1">
                      <span>Requirements</span><span>{c.progress.filled}/{c.progress.total}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-line overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${Math.round((c.progress.filled / c.progress.total) * 100)}%` }} />
                    </div>
                  </div>
                  <div className="text-[11px] text-muted mt-3">
                    {c.status === 'completed'
                      ? `Completed ${c.submittedAt ? timeAgo(c.submittedAt) : ''}`
                      : c.linkLastSentAt ? `Link sent ${timeAgo(c.linkLastSentAt)}` : 'Not sent yet'}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Demo carriers (mock — power the rest of the FleetView demo) ────── */}
        <div className="flex items-center gap-2 mb-3 mt-2">
          <h2 className="text-[15px] font-bold text-ink">Sample Carriers</h2>
          <span className="text-[12px] text-muted">demo data</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {s.carriers.map((c) => {
            const drivers = DRIVERS.filter((d) => d.carrierId === c.id).length;
            const trucks = TRUCKS.filter((t) => t.carrierId === c.id).length;
            const cands = CANDIDATES.filter((x) => x.carrierId === c.id).length;
            return (
              <div key={c.id} className="card p-5 hover:shadow-card transition cursor-pointer"
                onClick={() => { s.setCurrentCarrierId(c.id); nav(`/carriers/${c.id}`); }}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[15px] font-extrabold text-ink uppercase">{c.name}</div>
                    <div className="text-xs text-muted mt-1">USDOT {c.dot} · {c.mc.join(', ')}</div>
                  </div>
                  <Pill kind={c.authority === 'active' ? 'active' : 'pending'}>{c.authority}</Pill>
                </div>
                <div className="flex gap-4 mt-4 text-center">
                  <div><div className="text-lg font-bold text-ink">{drivers}</div><div className="text-[11px] text-muted">Drivers</div></div>
                  <div><div className="text-lg font-bold text-ink">{trucks}</div><div className="text-[11px] text-muted">Trucks</div></div>
                  <div><div className="text-lg font-bold text-ink">{cands}</div><div className="text-[11px] text-muted">Candidates</div></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showAdd && <AddCarrier onClose={() => setShowAdd(false)} onCreated={load}
        goToProfile={(id) => nav(`/carriers/profile/${id}`)} />}
    </>
  );
}

/* ── Add Carrier wizard ───────────────────────────────────────────────────────
   Step 1: choose how to capture requirements (recruiter fills, or carrier fills).
   Step 2a (invite): collect carrier contact → send link → show send result.
   Step 2b (self):   collect basics → fill the full requirements form → save.     */
type Mode = 'invite' | 'self';

function AddCarrier({ onClose, onCreated, goToProfile }: {
  onClose: () => void; onCreated: () => void; goToProfile: (id: string) => void;
}) {
  const [step, setStep] = useState<'choose' | 'invite' | 'self'>('choose');

  return (
    <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="card p-6 w-[560px] max-w-full max-h-[90vh] overflow-y-auto shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center mb-1">
          <div className="text-lg font-extrabold text-ink">Add Carrier</div>
          <button onClick={onClose} className="ml-auto text-muted hover:text-ink text-xl leading-none">×</button>
        </div>

        {step === 'choose' && (
          <>
            <p className="text-[13px] text-muted mb-5">How would you like to capture this carrier's hiring requirements?</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <button onClick={() => setStep('self')}
                className="text-left border-2 border-line hover:border-primary rounded-xl p-4 transition">
                <div className="text-2xl mb-2">📝</div>
                <div className="text-[14px] font-bold text-ink">Fill it out myself</div>
                <div className="text-[12px] text-muted mt-1">Enter the carrier's requirements now, on their behalf.</div>
              </button>
              <button onClick={() => setStep('invite')}
                className="text-left border-2 border-line hover:border-primary rounded-xl p-4 transition">
                <div className="text-2xl mb-2">✉️</div>
                <div className="text-[14px] font-bold text-ink">Send to the carrier</div>
                <div className="text-[12px] text-muted mt-1">Email or text the carrier owner a secure link to complete it themselves.</div>
              </button>
            </div>
          </>
        )}

        {step === 'invite' && <InviteCarrier back={() => setStep('choose')} onClose={onClose} onCreated={onCreated} />}
        {step === 'self' && <SelfFillCarrier back={() => setStep('choose')} onCreated={onCreated} goToProfile={goToProfile} />}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean;
}) {
  return (
    <div className="mb-3">
      <label className="field-label">{label}{required && <span className="text-danger"> *</span>}</label>
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* Invite flow — carrier fills it in themselves. */
function InviteCarrier({ back, onClose, onCreated }: { back: () => void; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [copied, setCopied] = useState(false);

  const send = async () => {
    if (!name.trim()) { setErr('Company name is required.'); return; }
    if (!email.trim() && !phone.trim()) { setErr('Add an email or phone so we can send the link.'); return; }
    setBusy(true); setErr('');
    try { setResult(await createCarrier({ name, ownerName, email, phone, mode: 'invite' })); onCreated(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not create carrier'); }
    finally { setBusy(false); }
  };

  if (result) return (
    <div>
      <div className="flex items-center gap-2 text-success font-bold text-[15px] mt-3 mb-2">✓ Carrier added & link sent</div>
      <div className="rounded-lg bg-slate-50 border border-line p-3 mb-3 text-[12.5px]">
        <div className={result.email ? (result.email.sent ? 'text-success' : 'text-danger') : 'text-muted'}>
          Email: {result.email ? (result.email.sent ? 'sent ✓' : `not sent — ${result.email.reason}`) : 'no email entered'}</div>
        <div className={result.sms ? (result.sms.sent ? 'text-success' : 'text-danger') : 'text-muted'}>
          SMS: {result.sms ? (result.sms.sent ? 'sent ✓' : `not sent — ${result.sms.reason}`) : 'no phone entered'}</div>
      </div>
      <label className="field-label">Shareable link (copy &amp; send manually if needed)</label>
      <div className="flex gap-2">
        <input className="input flex-1 text-[12px]" readOnly value={result.link ?? ''} onFocus={(e) => e.target.select()} />
        <button className="btn-ghost" onClick={() => { if (result.link) { navigator.clipboard?.writeText(result.link); setCopied(true); setTimeout(() => setCopied(false), 1500); } }}>
          {copied ? 'Copied' : 'Copy'}</button>
      </div>
      <button onClick={onClose} className="btn-primary w-full mt-5">Done</button>
    </div>
  );

  return (
    <div>
      <button onClick={back} className="text-[12px] text-muted hover:text-ink mb-3">‹ Back</button>
      <p className="text-[13px] text-muted mb-4">We'll send the carrier owner a secure link to fill out their requirements.</p>
      <Field label="Company name" value={name} onChange={setName} placeholder="American Power Trucking, LLC" required />
      <Field label="Carrier owner / contact name" value={ownerName} onChange={setOwnerName} placeholder="Jessica Owner" />
      <Field label="Owner email" value={email} onChange={setEmail} placeholder="owner@company.com" />
      <Field label="Owner phone (SMS)" value={phone} onChange={setPhone} placeholder="+1 555 000 1234" />
      {err && <div className="text-[12.5px] text-danger mb-2">{err}</div>}
      <div className="flex gap-2 mt-4">
        <button onClick={send} disabled={busy} className="btn-primary flex-1">{busy ? 'Sending…' : 'Send link to carrier'}</button>
        <button onClick={onClose} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

/* Self-fill flow — recruiter enters the requirements now. */
function SelfFillCarrier({ back, onCreated, goToProfile }: {
  back: () => void; onCreated: () => void; goToProfile: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sections, setSections] = useState<CarrierSection[] | null>(null);
  const [reqs, setReqs] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<'basics' | 'form'>('basics');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { getCarrierForm().then(setSections).catch((e) => setErr(e.message)); }, []);

  const toForm = () => {
    if (!name.trim()) { setErr('Company name is required.'); return; }
    setErr(''); setPhase('form');
  };

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const r = await createCarrier({ name, ownerName, email, phone, mode: 'self', requirements: reqs });
      onCreated();
      if (r.id) goToProfile(r.id);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); setBusy(false); }
  };

  if (phase === 'basics') return (
    <div>
      <button onClick={back} className="text-[12px] text-muted hover:text-ink mb-3">‹ Back</button>
      <p className="text-[13px] text-muted mb-4">Enter the carrier's basic info, then fill in their requirements.</p>
      <Field label="Company name" value={name} onChange={setName} placeholder="American Power Trucking, LLC" required />
      <Field label="Carrier owner / contact name" value={ownerName} onChange={setOwnerName} placeholder="Jessica Owner" />
      <Field label="Owner email" value={email} onChange={setEmail} placeholder="owner@company.com" />
      <Field label="Owner phone" value={phone} onChange={setPhone} placeholder="+1 555 000 1234" />
      {err && <div className="text-[12.5px] text-danger mb-2">{err}</div>}
      <div className="flex gap-2 mt-4">
        <button onClick={toForm} className="btn-primary flex-1">Continue to requirements →</button>
      </div>
    </div>
  );

  return (
    <div>
      <button onClick={() => setPhase('basics')} className="text-[12px] text-muted hover:text-ink mb-3">‹ Back to basics</button>
      <div className="text-[14px] font-bold text-ink mb-1">{name}</div>
      <p className="text-[12.5px] text-muted mb-4">Fill in what applies — you can leave anything blank and edit it later.</p>
      {!sections ? <div className="text-sm text-muted py-6">Loading form…</div> : (
        <CarrierForm sections={sections} value={reqs} onChange={(k, v) => setReqs((p) => ({ ...p, [k]: v }))} />
      )}
      {err && <div className="text-[12.5px] text-danger mt-3">{err}</div>}
      <div className="flex gap-2 mt-5 sticky bottom-0 bg-surface py-2">
        <button onClick={save} disabled={busy || !sections} className="btn-primary flex-1">{busy ? 'Saving…' : 'Save carrier profile'}</button>
      </div>
    </div>
  );
}
