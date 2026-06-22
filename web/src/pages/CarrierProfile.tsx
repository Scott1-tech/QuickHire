import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader, Pill, Empty, timeAgo } from '@/ui';
import CarrierForm from '@/components/CarrierForm';
import LinkSender from '@/components/LinkSender';
import {
  getCarrier, updateCarrier, resendCarrier, deleteCarrier,
  statusMeta, type CarrierRecord,
} from '@/lib/carrierApi';

export default function CarrierProfile() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [rec, setRec] = useState<CarrierRecord | null>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const load = () => {
    setErr('');
    getCarrier(id).then((r) => { setRec(r); setDraft(r.requirements); }).catch((e) => setErr(e.message));
  };
  useEffect(load, [id]);

  if (err) return (
    <><PageHeader crumbs={[{ label: 'Carriers', to: '/carriers' }, { label: 'Profile' }]} />
      <div className="flex-1 grid place-items-center p-6"><Empty icon="⚠️" title="Couldn't load this carrier" sub={err} /></div></>
  );
  if (!rec) return (
    <><PageHeader crumbs={[{ label: 'Carriers', to: '/carriers' }, { label: 'Profile' }]} />
      <div className="flex-1 grid place-items-center p-6 text-muted text-sm">Loading…</div></>
  );

  const meta = statusMeta(rec.status, rec.filledBy);
  const fieldLabel = (sectionFieldId: string) =>
    rec.sections.flatMap((s) => s.fields).find((f) => f.id === sectionFieldId)?.label ?? sectionFieldId;

  const save = async () => {
    setBusy(true);
    try { await updateCarrier(id, { requirements: draft }); setEditing(false); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Save failed'); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm(`Delete the requirements profile for ${rec.name}? This cannot be undone.`)) return;
    try { await deleteCarrier(id); nav('/carriers'); } catch (e) { setErr(e instanceof Error ? e.message : 'Delete failed'); }
  };

  return (
    <>
      <PageHeader crumbs={[{ label: 'Carriers', to: '/carriers' }, { label: rec.name }]}
        actions={
          <div className="flex gap-2">
            {!editing && <button onClick={() => setSendOpen(true)} className="btn-ghost">✉ Send to carrier</button>}
            {!editing && <button onClick={() => { setDraft(rec.requirements); setEditing(true); }} className="btn-primary">
              {rec.progress.filled ? '✎ Edit requirements' : '✎ Fill in requirements'}</button>}
            {editing && <>
              <button onClick={() => setEditing(false)} className="btn-ghost" disabled={busy}>Cancel</button>
              <button onClick={save} className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save requirements'}</button>
            </>}
          </div>
        } />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Identity / status */}
        <div className="card p-5 mb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-[22px] font-extrabold text-ink uppercase">{rec.name}</h1>
              <div className="text-[13px] text-muted mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {rec.ownerName && <span>👤 {rec.ownerName}</span>}
                {rec.email && <span>✉ {rec.email}</span>}
                {rec.phone && <span>📞 {rec.phone}</span>}
              </div>
            </div>
            <div className="text-right">
              <Pill kind={meta.kind}>{meta.label}</Pill>
              <div className="text-[12px] text-muted mt-2">{rec.progress.filled} of {rec.progress.total} answered</div>
            </div>
          </div>
          {rec.status === 'awaiting_carrier' && (
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-[13px] text-amber-800 flex items-center gap-2">
              <span>⏳</span>
              <span>Waiting for the carrier to complete their requirements
                {rec.linkLastSentAt ? ` — link last sent ${timeAgo(rec.linkLastSentAt)}.` : '.'} You can also fill it in yourself.</span>
            </div>
          )}
        </div>

        {/* Body: edit form OR read-only requirements grouped by section */}
        {editing ? (
          <CarrierForm sections={rec.sections} value={draft} onChange={(k, v) => setDraft((p) => ({ ...p, [k]: v }))} />
        ) : rec.progress.filled === 0 ? (
          <div className="card p-5"><Empty icon="📝" title="No requirements yet"
            sub="Send the carrier their link, or fill in the requirements yourself." /></div>
        ) : (
          <div className="space-y-5">
            {rec.sections.map((s) => {
              const filled = s.fields.filter((f) => rec.requirements[f.id]);
              if (!filled.length) return null;
              return (
                <div key={s.id} className="card p-5">
                  <div className="text-base font-bold text-ink mb-3">{s.title}</div>
                  <div className="grid sm:grid-cols-2 gap-x-6">
                    {filled.map((f) => (
                      <div key={f.id} className="flex flex-col py-2 border-b border-line/50">
                        <span className="text-[12px] text-muted">{fieldLabel(f.id)}</span>
                        <span className="text-[13.5px] font-semibold text-ink whitespace-pre-wrap">{rec.requirements[f.id]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Activity */}
        {!editing && rec.activity?.length > 0 && (
          <div className="card p-5 mt-5">
            <div className="text-base font-bold text-ink mb-3">Activity</div>
            <div className="space-y-2.5">
              {[...rec.activity].reverse().map((a) => (
                <div key={a.id} className="flex items-start gap-3 text-[13px]">
                  <span className="text-muted whitespace-nowrap">{timeAgo(a.at)}</span>
                  <span className="text-ink">{a.note}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!editing && (
          <button onClick={remove} className="text-[12px] text-danger hover:underline mt-6">Delete this carrier profile</button>
        )}
      </div>

      {sendOpen && <SendLink rec={rec} onClose={() => setSendOpen(false)} onSent={load} />}
    </>
  );
}

/* ── Send / resend the intake link to the carrier owner ──────────────────────── */
function SendLink({ rec, onClose, onSent }: { rec: CarrierRecord; onClose: () => void; onSent: () => void }) {
  const [email, setEmail] = useState(rec.email);
  const [phone, setPhone] = useState(rec.phone);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ link: string | null; email: { sent: boolean; reason?: string } | null; sms: { sent: boolean; reason?: string } | null } | null>(null);
  const [err, setErr] = useState('');

  const send = async () => {
    setBusy(true); setErr('');
    try { setResult(await resendCarrier(rec.id, { email, phone })); onSent(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not send'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="card p-6 w-[460px] max-w-full shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-extrabold text-ink mb-1">Send requirements to the carrier</div>
        <p className="text-[13px] text-muted mb-4">We'll email and/or text {rec.name} a secure link to fill out (or update) their requirements.</p>

        {!result ? (
          <>
            <div className="mb-3"><label className="field-label">Carrier owner email</label>
              <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@company.com" /></div>
            <div className="mb-3"><label className="field-label">Carrier owner phone (SMS)</label>
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 1234" /></div>
            {err && <div className="text-[12.5px] text-danger mb-2">{err}</div>}
            <div className="flex gap-2 mt-4">
              <button onClick={send} disabled={busy} className="btn-primary flex-1">{busy ? 'Sending…' : 'Send link'}</button>
              <button onClick={onClose} className="btn-ghost">Cancel</button>
            </div>
          </>
        ) : (
          <>
            <LinkSender link={result.link} name={rec.name} ownerName={rec.ownerName} email={email} phone={phone}
              serverEmail={result.email} serverSms={result.sms} />
            <button onClick={onClose} className="btn-ghost w-full mt-4">Done</button>
          </>
        )}
      </div>
    </div>
  );
}
