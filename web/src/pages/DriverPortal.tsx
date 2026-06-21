import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

// Driver Qualification Portal — public, tokenized. Navy/Crimson palette. No marketing nav.
// TODO: resolve token -> { candidateId, carrierId, companyName }; POST application on submit.

const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const EQUIPMENT = ['Dry Van','Flatbed','Refrigerated (Reefer)','Tanker','Hazmat','Auto Hauler','Intermodal','LTL','Heavy Haul','Other'];
const ENDORSEMENTS = ['H-Hazmat','N-Tank Vehicles','P-Passenger','S-School Bus','T-Double/Triple','X-Hazmat+Tank'];

export default function DriverPortal() {
  const { token } = useParams();
  const companyName = 'National Carrier Xpress Corp.'; // TODO: from token
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [ineligible, setIneligible] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({ experience: '', years: '', equipment: [] as string[], position: 'Company Driver', endorsements: [] as string[], firstName: '', lastName: '' });
  const [confirm, setConfirm] = useState<null | { msg: string; onYes: () => void; onNo: () => void }>(null);
  const [ocrBanner, setOcrBanner] = useState(false);
  const [autoFilled, setAutoFilled] = useState<Set<string>>(new Set());
  const [consents, setConsents] = useState({ psp: false, mvr: false, emp: false });
  const [sigConfirmed, setSigConfirmed] = useState(false);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const toggleArr = (k: string, v: string) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x: string) => x !== v) : [...f[k], v] }));

  if (done) return <Success first={form.firstName || 'Driver'} company={companyName} />;

  return (
    <div className="min-h-screen bg-[#F5F7FB] text-[#0F1B2D]">
      {/* Hero */}
      <div className="bg-[#0A1F3D] text-white text-center py-12 px-4" style={{ backgroundImage: 'repeating-linear-gradient(135deg,rgba(255,255,255,.03) 0 2px,transparent 2px 14px)' }}>
        <h1 className="text-3xl font-extrabold" style={{ fontFamily: 'Sora, Inter, sans-serif' }}>Qualification Portal</h1>
        <p className="max-w-xl mx-auto mt-3 text-white/80 text-[15px]">Take the step. Apply now, get qualified, and start earning consistent, reliable income with <b className="text-white">{companyName}</b>.</p>
      </div>

      {/* Stepper */}
      <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 -mt-6">
        {[['Application', 'Driver Information'], ['Consents', 'Authorizations & Employment']].map(([t, sub], i) => {
          const n = i + 1, isDone = step > n, isActive = step === n;
          return (
            <div key={t} className={`flex-1 bg-white rounded-xl border p-3 flex items-center gap-3 ${isActive ? 'border-[#0B2545]' : 'border-[#E2E8F0]'}`}>
              <div className={`w-8 h-8 rounded-full grid place-items-center text-sm font-bold ${isDone ? 'bg-[#16A34A] text-white' : isActive ? 'bg-[#0B2545] text-white' : 'bg-slate-200 text-slate-500'}`}>{isDone ? '✓' : n}</div>
              <div><div className={`text-[13px] font-bold ${isDone ? 'text-[#16A34A]' : ''}`}>{t}</div><div className="text-[11px] text-slate-500">{sub}</div></div>
            </div>
          );
        })}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {ineligible && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-4 text-sm">Based on your answers we're unable to proceed with this application. Please contact the recruiter if you believe this is a mistake.</div>}

        {step === 1 ? (
          <>
            {/* Experience */}
            <Section icon="🛡" title="Experience Qualification" tint>
              <Label req>Do you have at least one (1) year of CDL driving experience?</Label>
              <YesNo value={form.experience} onChange={(v) => {
                if (v === 'No') setConfirm({ msg: 'You indicated that you do not have at least 1 year of CDL driving experience. Please confirm this is accurate. If confirmed, we will be unable to proceed with your application as we require a minimum of 1 year CDL experience.', onYes: () => { set('experience', 'No'); setIneligible(true); setConfirm(null); }, onNo: () => setConfirm(null) });
                else { set('experience', 'Yes'); setIneligible(false); }
              }} />
              {form.experience === 'Yes' && (
                <div className="mt-4">
                  <Label req>Years of Experience</Label>
                  <select value={form.years} onChange={(e) => set('years', e.target.value)} className="dp-input"><option value="">Select…</option>{Array.from({ length: 20 }, (_, i) => i + 1).map((y) => <option key={y}>{y}{y === 20 ? '+' : ''} years</option>)}</select>
                  <Label className="mt-4">Equipment Types <span className="text-[#2563EB]">(select all that apply)</span></Label>
                  <Pills options={EQUIPMENT} selected={form.equipment} onToggle={(v) => toggleArr('equipment', v)} />
                </div>
              )}
            </Section>

            {/* Documents */}
            <Section icon="🖼" title="Document Uploads">
              <p className="text-[13px] text-slate-500 mb-3">Upload clear photos or scans. All image and document formats accepted (max 10MB each).</p>
              <div className="grid sm:grid-cols-3 gap-3">
                <Upload label="CDL Front" hint="Side with your PHOTO" onFile={() => { setOcrBanner(true); setAutoFilled(new Set(['firstName', 'lastName', 'cdlNumber', 'cdlState', 'dob'])); set('firstName', 'JOHN'); set('lastName', 'DRIVER'); set('cdlNumber', 'D1234567'); set('cdlState', 'TX'); set('dob', '1990-05-12'); }} />
                <Upload label="CDL Back" hint="Side with BARCODE" />
                <Upload label="Medical Card" hint="DOT Medical Certificate" />
              </div>
              <button className="text-[13px] text-[#2563EB] mt-3">＋ Add another CDL photo (optional)</button>
              {ocrBanner && <div className="bg-blue-50 border border-blue-200 text-[#1D4ED8] rounded-lg p-3 mt-3 text-[13px] flex items-center gap-2">
                We auto-filled some fields from your CDL — please review for accuracy.<button onClick={() => setOcrBanner(false)} className="ml-auto">✕</button></div>}
            </Section>

            {/* Personal */}
            <Section icon="👤" title="Personal Information">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="First Name" req value={form.firstName} onChange={(v) => set('firstName', v)} warn={autoFilled.has('firstName')} />
                <Field label="Last Name" req value={form.lastName} onChange={(v) => set('lastName', v)} warn={autoFilled.has('lastName')} />
                <div><Label req>Date of Birth</Label><input type="date" value={form.dob || ''} onChange={(e) => set('dob', e.target.value)} className={`dp-input ${autoFilled.has('dob') ? 'ring-2 ring-amber-300' : ''}`} /></div>
                <Field label="Email" req value={form.email || ''} onChange={(v) => set('email', v)} />
                <Field label="Phone" req value={form.phone || ''} onChange={(v) => set('phone', v)} placeholder="(555) 555-5555" />
              </div>
            </Section>

            {/* Address */}
            <Section icon="📍" title="Address">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Street Address" req value={form.street || ''} onChange={(v) => set('street', v)} />
                <Field label="City" req value={form.city || ''} onChange={(v) => set('city', v)} />
                <div><Label req>State</Label><StateSelect value={form.state} onChange={(v) => set('state', v)} /></div>
                <Field label="ZIP" req value={form.zip || ''} onChange={(v) => set('zip', v)} />
              </div>
            </Section>

            {/* CDL */}
            <Section icon="🪪" title="CDL Information">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="CDL Number" req value={form.cdlNumber || ''} onChange={(v) => set('cdlNumber', v)} warn={autoFilled.has('cdlNumber')} />
                <div><Label req>CDL State</Label><StateSelect value={form.cdlState} onChange={(v) => set('cdlState', v)} warn={autoFilled.has('cdlState')} /></div>
                <div><Label>CDL Issued Date</Label><input type="date" className="dp-input" /></div>
                <div><Label>CDL Expiration Date</Label><input type="date" className="dp-input" /></div>
              </div>
              <Label className="mt-4">Endorsements <span className="text-[#2563EB]">(optional)</span></Label>
              <Pills options={ENDORSEMENTS} selected={form.endorsements} onToggle={(v) => toggleArr('endorsements', v)} />
            </Section>

            {/* Compliance History */}
            <Section icon="✅" title="Compliance History">
              <Label req>Accidents in past 3 years?</Label>
              <YesNo value={form.accidents} onChange={(v) => set('accidents', v)} />
              <Label className="mt-4" req>Convicted of a DUI/DWI?</Label>
              <YesNo value={form.dui} onChange={(v) => { if (v === 'Yes') setConfirm({ msg: 'You indicated you have been convicted of a DUI/DWI. If confirmed, we are unable to proceed due to our insurance and safety requirements.', onYes: () => { set('dui', 'Yes'); setIneligible(true); setConfirm(null); }, onNo: () => setConfirm(null) }); else set('dui', 'No'); }} />
              <Label className="mt-4" req>Completed a SAP (Substance Abuse Professional) program?</Label>
              <YesNo value={form.sap} onChange={(v) => { if (v === 'Yes') setConfirm({ msg: 'You indicated you completed a SAP program. If confirmed, we are unable to proceed due to our insurance and safety requirements.', onYes: () => { set('sap', 'Yes'); setIneligible(true); setConfirm(null); }, onNo: () => setConfirm(null) }); else set('sap', 'No'); }} />
            </Section>

            {/* Position & Referral */}
            <Section icon="💼" title="Position & Referral">
              <Label>Position Type</Label>
              <div className="flex gap-2 mb-3">
                {['Company Driver', 'Owner Operator'].map((p) => (
                  <button key={p} onClick={() => set('position', p)} className={`px-4 py-2 rounded-lg text-sm font-semibold border ${form.position === p ? 'bg-[#0B2545] text-white border-[#0B2545]' : 'border-[#E2E8F0]'}`}>{form.position === p && '✓ '}{p}</button>
                ))}
              </div>
              {form.position === 'Owner Operator' && (
                <div className="bg-[#EEF2FF] rounded-xl p-4 grid sm:grid-cols-2 gap-3">
                  <Field label="Truck Year" req value={form.truckYear || ''} onChange={(v) => set('truckYear', v)} />
                  <Field label="Truck Make" req value={form.truckMake || ''} onChange={(v) => set('truckMake', v)} />
                  <Field label="Truck Model" req value={form.truckModel || ''} onChange={(v) => set('truckModel', v)} />
                  <Upload label="Truck Picture" hint="JPG/PNG/PDF" />
                  <Upload label="DOT Inspection" hint="JPG/PNG/PDF" />
                </div>
              )}
              <Label className="mt-4">Additional Message <span className="text-[#2563EB]">(optional)</span></Label>
              <textarea className="dp-input h-20 resize-none" />
              <Label className="mt-3" req>How did you hear about us?</Label>
              <select className="dp-input"><option value="">Select…</option><option>Referral</option><option>Job Board</option><option>Social Media</option><option>Other</option></select>
            </Section>

            <button disabled={ineligible} onClick={() => setStep(2)}
              className="w-full bg-[#A4193D] hover:bg-[#8E1635] disabled:opacity-40 text-white font-bold rounded-xl py-3.5 mt-2">Next Step ›</button>
          </>
        ) : (
          <>
            <div className="bg-[#EEF2FF] rounded-xl p-4 mb-4"><div className="text-[11px] font-bold text-slate-500 uppercase">Applicant</div><div className="text-lg font-extrabold uppercase">{form.firstName} {form.lastName}</div></div>

            <Section icon="🔒" title="Social Security Number">
              <div className="text-[13px] text-[#16A34A] bg-green-50 rounded-lg p-2.5 mb-3">Required for background checks and FMCSA compliance. Your SSN is encrypted and stored securely.</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="SSN" req value={form.ssn || ''} onChange={(v) => set('ssn', v)} placeholder="xxx-xx-xxxx" />
                <Field label="Confirm SSN" req value={form.ssn2 || ''} onChange={(v) => set('ssn2', v)} placeholder="xxx-xx-xxxx" />
              </div>
              {form.ssn && form.ssn2 && form.ssn !== form.ssn2 && <div className="text-[12px] text-red-600 mt-1">SSN does not match.</div>}
            </Section>

            <Section icon="🏢" title="Previous Employers">
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-[13px] mb-3">At least one employer with name and phone is required. Start typing a company name to search the FMCSA database for auto-fill.</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Employer Name" req value={form.empName || ''} onChange={(v) => set('empName', v)} />
                <Field label="Phone" req value={form.empPhone || ''} onChange={(v) => set('empPhone', v)} />
                <Field label="DOT Number" value={form.empDot || ''} onChange={(v) => set('empDot', v)} />
                <Field label="MC Number" value={form.empMc || ''} onChange={(v) => set('empMc', v)} />
              </div>
              <button className="text-[13px] text-[#2563EB] mt-3">＋ Add Another Employer</button>
            </Section>

            <Section icon="📄" title="Required Consent Documents">
              <p className="text-[13px] text-slate-500 mb-3">Please review each document and check the acknowledgment box.</p>
              {[['psp', 'PSP Disclosure & Authorization', 'I authorize release of my driving & safety inspection history.'], ['mvr', 'MVR Disclosure & Authorization', 'I authorize release of my motor vehicle records.'], ['emp', 'Employment Verification Consent', 'I authorize release of my employment history & records.']].map(([k, t, d]) => (
                <label key={k} className="flex items-start gap-2.5 py-2 border-b border-[#E2E8F0] last:border-0">
                  <input type="checkbox" className="mt-1" checked={(consents as any)[k]} onChange={(e) => setConsents({ ...consents, [k]: e.target.checked })} />
                  <div><div className="text-[13.5px] font-semibold">{t}</div><div className="text-[12px] text-slate-500">{d}</div></div>
                </label>
              ))}
            </Section>

            <Section icon="✍" title="Your Signature">
              <p className="text-[12px] text-slate-500 mb-3">This signature applies to all consent documents above.</p>
              <SignaturePad onConfirm={setSigConfirmed} confirmed={sigConfirmed} />
            </Section>

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="btn-ghost px-6">← Back</button>
              <button disabled={ineligible || !consents.psp || !consents.mvr || !consents.emp || !sigConfirmed || !form.ssn || form.ssn !== form.ssn2 || !form.empName || !form.empPhone}
                onClick={() => setDone(true)}
                className="flex-1 bg-[#A4193D] hover:bg-[#8E1635] disabled:opacity-40 text-white font-bold rounded-xl py-3.5">Submit Application</button>
            </div>
            <p className="text-[11px] text-slate-400 mt-3">Token: {token} · // TODO: POST application to candidate under company</p>
          </>
        )}
      </div>

      {confirm && <ConfirmModal msg={confirm.msg} onYes={confirm.onYes} onNo={confirm.onNo} />}

      <style>{`
        .dp-input{width:100%;border:1px solid #E2E8F0;border-radius:10px;padding:10px 12px;font-size:14px;background:#fff;outline:none}
        .dp-input:focus{box-shadow:0 0 0 3px rgba(11,37,69,.15)}
      `}</style>
    </div>
  );
}

function Section({ icon, title, children, tint }: { icon: string; title: string; children: React.ReactNode; tint?: boolean }) {
  return (
    <div className={`rounded-xl border border-[#E2E8F0] p-5 mb-4 ${tint ? 'bg-[#EEF2FF]' : 'bg-white'}`}>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-[#0B2545] text-white grid place-items-center text-sm">{icon}</div>
        <h2 className="text-[15px] font-bold">{title}</h2>
      </div>
      {children}
    </div>
  );
}
function Label({ children, req, className = '' }: { children: React.ReactNode; req?: boolean; className?: string }) {
  return <label className={`block text-[13px] font-semibold mb-1.5 ${className}`}>{children}{req && <span className="text-red-500"> *</span>}</label>;
}
function Field({ label, req, value, onChange, placeholder, warn }: { label: string; req?: boolean; value: string; onChange: (v: string) => void; placeholder?: string; warn?: boolean }) {
  return <div><Label req={req}>{label}</Label><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`dp-input ${warn ? 'ring-2 ring-amber-300' : ''}`} /></div>;
}
function YesNo({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      {['Yes', 'No'].map((o) => (
        <button key={o} onClick={() => onChange(o)} className={`px-5 py-2 rounded-lg text-sm font-semibold border ${value === o ? 'bg-[#0B2545] text-white border-[#0B2545]' : 'border-[#E2E8F0]'}`}>{value === o && '✓ '}{o}</button>
      ))}
    </div>
  );
}
function Pills({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {options.map((o) => (
        <button key={o} onClick={() => onToggle(o)} className={`px-3 py-1.5 rounded-full text-[13px] border ${selected.includes(o) ? 'bg-[#0B2545] text-white border-[#0B2545]' : 'border-[#E2E8F0]'}`}>{o}</button>
      ))}
    </div>
  );
}
function StateSelect({ value, onChange, warn }: { value?: string; onChange: (v: string) => void; warn?: boolean }) {
  return <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={`dp-input ${warn ? 'ring-2 ring-amber-300' : ''}`}><option value="">Select state…</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select>;
}
function Upload({ label, hint, onFile }: { label: string; hint: string; onFile?: () => void }) {
  const [name, setName] = useState('');
  return (
    <div className="border border-[#E2E8F0] rounded-xl p-3 text-center">
      <div className="text-[13px] font-semibold">{label}</div>
      <div className="text-[11px] text-slate-500 mb-2">{hint}</div>
      <label className="inline-block bg-[#0B2545] text-white text-[12px] rounded-lg px-3 py-1.5 cursor-pointer">Choose File
        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setName(f.name); onFile?.(); } }} /></label>
      {name && <div className="text-[11px] text-[#16A34A] mt-2 truncate">✓ {name}</div>}
    </div>
  );
}
function ConfirmModal({ msg, onYes, onNo }: { msg: string; onYes: () => void; onNo: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4">
      <div className="bg-white rounded-xl p-6 w-[440px] max-w-full shadow-2xl">
        <div className="flex items-center gap-2 mb-3"><span className="text-[#F59E0B] text-xl">⚠</span><span className="font-bold text-lg">Please Confirm</span></div>
        <p className="text-[14px] text-slate-700 mb-5">{msg}</p>
        <div className="flex gap-3"><button onClick={onNo} className="btn-ghost flex-1">No, Go Back</button><button onClick={onYes} className="flex-1 bg-[#A4193D] text-white font-bold rounded-lg py-2.5">Yes, Confirm</button></div>
      </div>
    </div>
  );
}
function SignaturePad({ onConfirm, confirmed }: { onConfirm: (v: boolean) => void; confirmed: boolean }) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typed, setTyped] = useState('');
  const [ack, setAck] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const pos = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const start = (e: React.PointerEvent) => { drawing.current = true; const c = canvas.current!.getContext('2d')!; const p = pos(e); c.beginPath(); c.moveTo(p.x, p.y); };
  const draw = (e: React.PointerEvent) => { if (!drawing.current) return; const c = canvas.current!.getContext('2d')!; const p = pos(e); c.lineTo(p.x, p.y); c.strokeStyle = '#0B2545'; c.lineWidth = 2; c.stroke(); setHasDrawn(true); };
  const clear = () => { const c = canvas.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setHasDrawn(false); onConfirm(false); };

  const canConfirm = mode === 'draw' ? hasDrawn : typed.trim().length > 1 && ack;

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {(['draw', 'type'] as const).map((m) => <button key={m} onClick={() => { setMode(m); onConfirm(false); }} className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold border ${mode === m ? 'bg-[#0B2545] text-white border-[#0B2545]' : 'border-[#E2E8F0]'}`}>{m === 'draw' ? 'Draw Signature' : 'Type Signature'}</button>)}
      </div>
      {mode === 'draw' ? (
        <>
          <canvas ref={canvas} width={520} height={140} onPointerDown={start} onPointerMove={draw} onPointerUp={() => (drawing.current = false)}
            className="w-full border border-[#E2E8F0] rounded-lg bg-white touch-none" style={{ height: 140 }} />
          <div className="flex justify-between mt-1"><span className="text-[12px] text-slate-400">Sign here with your finger or mouse</span><button onClick={clear} className="text-[12px] text-[#2563EB]">Clear</button></div>
        </>
      ) : (
        <>
          <input value={typed} onChange={(e) => { setTyped(e.target.value); onConfirm(false); }} placeholder="Type your full legal name" className="dp-input mb-2" />
          <label className="flex items-center gap-2 text-[12px] text-slate-600"><input type="checkbox" checked={ack} onChange={(e) => { setAck(e.target.checked); onConfirm(false); }} /> By typing my name above, I acknowledge that this constitutes my legal electronic signature.</label>
        </>
      )}
      <button disabled={!canConfirm} onClick={() => onConfirm(true)} className={`mt-3 w-full rounded-lg py-2.5 font-bold text-white ${confirmed ? 'bg-[#16A34A]' : 'bg-[#0B2545] disabled:opacity-40'}`}>{confirmed ? '✓ Signature Confirmed' : 'Confirm Signature'}</button>
    </div>
  );
}
function Success({ first, company }: { first: string; company: string }) {
  return (
    <div className="min-h-screen bg-[#F5F7FB] grid place-items-center p-4">
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-10 text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-[#16A34A] text-white grid place-items-center text-3xl mx-auto mb-4">✓</div>
        <h1 className="text-2xl font-extrabold mb-2">Thank you, {first}!</h1>
        <p className="text-slate-600 text-[15px]">Your application to <b>{company}</b> has been submitted. A recruiter will be in touch shortly.</p>
      </div>
    </div>
  );
}
