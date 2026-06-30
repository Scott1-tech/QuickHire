import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon, Btn, Menu, MenuItem, Toggle, SegTabs, useToasts, ToastHost } from '../tasks/lib';
import { useComms, svc, fmtWhen, PEV_STATUS } from './store';

const OK = '#34C759', WARN = '#FF9500', ERR = '#FF3B30', PRI = '#007AFF', TS = '#0B7285';

function StatusChip({ status }: any) { const s = PEV_STATUS[status] || PEV_STATUS.not_requested; return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 22, padding: '0 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, color: s.color, background: s.color + '1f' }}><span style={{ width: 6, height: 6, borderRadius: 999, background: s.color }} />{s.label}</span>; }
function VerifiedBadge() { return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, color: '#248A3D', background: 'rgba(52,199,89,0.14)' }}><Icon name="shield" size={11} />Verified from FMCSA</span>; }
const input: React.CSSProperties = { width: '100%', height: 38, border: `1px solid ${T.border}`, borderRadius: 10, padding: '0 12px', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', background: '#fff' };
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint, marginBottom: 6 };
const slug = (s: string) => (s || '').toLowerCase().replace(/llc|inc|group|transportation|lines|trucking/g, '').replace(/[^a-z]/g, '').slice(0, 14) || 'carrier';

/* ============================ MAIN SECTION ============================ */
export function EmploymentVerification({ contact }: any) {
  const store = useComms();
  const { toasts, toast } = useToasts();
  const [add, setAdd] = React.useState(false);
  const [send, setSend] = React.useState<any>(null);
  const entries = svc.employmentFor(contact.id);

  return <div>
    <ToastHost toasts={toasts} />
    {add && <AddEmployerModal contact={contact} onClose={() => setAdd(false)} onSaved={() => toast('Previous employer added', 'success')} />}
    {send && <SendVerificationModal entry={send} contact={contact} onClose={() => setSend(null)} onSent={(ch: string) => toast(`Verification request sent via ${ch}`, 'success')} />}

    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>Employment Verification</h2>
        <p style={{ margin: '5px 0 0', fontSize: 13, color: T.muted }}>Previous-employer history & safety performance per FMCSA §391.23 (last 3 years).</p>
      </div>
      <Btn variant="primary" icon="plus" onClick={() => setAdd(true)}>Add Previous Employer</Btn>
    </div>

    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 13px', background: 'rgba(0,122,255,0.05)', border: '1px solid rgba(0,122,255,0.16)', borderRadius: 10, fontSize: 12.5, color: '#0066CC', marginBottom: 16 }}>
      <Icon name="shield" size={15} style={{ flex: 'none', marginTop: 1 }} />
      <span>Companies are matched against FMCSA SAFER public data. Verification requests cover DOT employment dates, accident history (§390.15) and drug &amp; alcohol testing records (§40.25). PSP &amp; Clearinghouse require separate driver consent.</span>
    </div>

    {entries.length === 0 ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '48px 20px', background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14 }}>
      <span style={{ width: 52, height: 52, borderRadius: 15, background: '#F2F2F7', color: T.faint, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon name="building" size={24} /></span>
      <div style={{ fontSize: 16, fontWeight: 650, marginBottom: 5 }}>No previous employers yet</div>
      <div style={{ fontSize: 13, color: T.muted, maxWidth: 360, marginBottom: 16 }}>Add a previous employer by DOT, MC, or company name — QuickHire looks it up in FMCSA and auto-fills the details.</div>
      <Btn variant="primary" icon="plus" onClick={() => setAdd(true)}>Add Previous Employer</Btn>
    </div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {entries.map((e: any) => <EmployerCard key={e.id} e={e} onSend={() => setSend(e)} toast={toast} />)}
    </div>}
  </div>;
}

function EmployerCard({ e, onSend, toast }: any) {
  const v = e.verification;
  return <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '15px 18px' }}>
      <span style={{ width: 40, height: 40, flex: 'none', borderRadius: 10, background: 'rgba(0,122,255,0.10)', color: PRI, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="building" size={20} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{e.employer.legalName}</span>
          {e.employer.verifiedFromFmcsa && <VerifiedBadge />}
        </div>
        <div style={{ fontSize: 12.5, color: T.faint, marginTop: 3 }}>{e.employer.dotNumber ? `DOT ${e.employer.dotNumber}` : ''}{e.employer.mcNumber ? ` · ${e.employer.mcNumber}` : ''}{e.employer.phone ? ` · ${e.employer.phone}` : ''}</div>
        {e.employer.physicalAddress && <div style={{ fontSize: 12, color: T.faint, marginTop: 1 }}>{e.employer.physicalAddress}</div>}
      </div>
      <StatusChip status={v.status} />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '2px 18px', padding: '0 18px 12px' }}>
      <Field label="Position" value={e.position || '—'} />
      <Field label="Dates" value={`${e.startDate || '—'} → ${e.endDate || 'present'}`} />
      <Field label="Operated CMV" value={e.droveCmv ? 'Yes' : 'No'} />
      <Field label="DOT testing" value={e.subjectToTesting ? 'Yes' : 'No'} />
    </div>
    {e.reason && <div style={{ padding: '0 18px 12px', fontSize: 12.5, color: T.muted }}>Reason for leaving: {e.reason}</div>}
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderTop: `1px solid ${T.hair}`, flexWrap: 'wrap' }}>
      {v.status !== 'not_requested' && <span style={{ fontSize: 11.5, color: T.faint, marginRight: 'auto' }}>{v.channel === 'tenstreet' ? 'Tenstreet' : v.channel?.toUpperCase()} · sent {fmtWhen(v.sentAt)} ago{v.returnedAt ? ` · returned ${fmtWhen(v.returnedAt)} ago` : ''}</span>}
      {v.status === 'not_requested' && <span style={{ marginRight: 'auto' }} />}
      <Btn variant={v.status === 'not_requested' ? 'primary' : 'secondary'} icon="send" onClick={onSend}>{v.status === 'not_requested' ? 'Send verification request' : 'Resend'}</Btn>
      {v.status === 'requested' || v.status === 'pending' ? <Menu align="right" width={190} trigger={<Hover as="button" style={pill} hover={{ background: 'rgba(0,0,0,0.04)' }}>Mark status<Icon name="chevronDown" size={13} /></Hover>}>
        {(close: any) => <>
          <MenuItem icon="clock" label="Pending" onClick={() => { svc.markVerification(e.id, 'pending'); close(); }} />
          <MenuItem icon="check" label="Verified" onClick={() => { svc.markVerification(e.id, 'verified'); toast('Marked verified', 'success'); close(); }} />
          <MenuItem icon="fileText" label="Returned" onClick={() => { svc.markVerification(e.id, 'returned'); close(); }} />
          <MenuItem icon="ban" label="Unable to verify" danger onClick={() => { svc.markVerification(e.id, 'unable'); close(); }} />
        </>}
      </Menu> : null}
      <Menu align="right" width={170} trigger={<Hover as="button" style={{ width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${T.border}`, background: '#fff', borderRadius: 9, color: T.muted, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="more" size={16} /></Hover>}>
        {(close: any) => <>
          <MenuItem icon="listChecks" label="Create task" onClick={() => { svc._task({ title: `Follow up PEV — ${e.employer.legalName}`, contactId: e.contactId, tags: ['PEV'] }); toast('Task created', 'success'); close(); }} />
          <MenuItem icon="trash" label="Remove" danger onClick={() => { svc.removeEmployer(e.id); close(); }} />
        </>}
      </Menu>
    </div>
  </div>;
}

/* ============================ ADD EMPLOYER ============================ */
function AddEmployerModal({ contact, onClose, onSaved }: any) {
  const [q, setQ] = React.useState('');
  const [results, setResults] = React.useState<any[]>([]);
  const [searched, setSearched] = React.useState(false);
  const [picked, setPicked] = React.useState<any>(null);
  const [manual, setManual] = React.useState(false);
  const [f, setF] = React.useState<any>({ position: 'Company Driver', startDate: '', endDate: '', reason: '', droveCmv: true, subjectToTesting: true, manualName: '', manualDot: '', manualMc: '', manualPhone: '' });
  const set = (p: any) => setF((s: any) => ({ ...s, ...p }));
  const run = () => { const r = svc.fmcsaSearch(q); setResults(r); setSearched(true); };
  const save = () => { if (!picked && !f.manualName) return; svc.addEmployer(contact.id, picked, f); onSaved(); onClose(); };

  return <div onClick={onClose} style={overlay}>
    <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, width: 'min(620px, 95vw)' }}>
      <Head title="Add Previous Employer" sub={`Driver: ${contact.name}`} onClose={onClose} />
      <div style={{ padding: '16px 22px', maxHeight: '70vh', overflowY: 'auto' }}>
        {!picked && !manual && <>
          <div style={lbl}>Find employer in FMCSA</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, ...input }}>
              <Icon name="search" size={15} style={{ color: T.faint }} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} placeholder="Previous company DOT, MC, or name" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13.5, fontFamily: 'inherit' }} />
            </div>
            <Btn variant="primary" icon="search" onClick={run}>Search</Btn>
          </div>
          {results.map((r) => <Hover key={r.dotNumber} onClick={() => setPicked(r)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 8, cursor: 'pointer' }} hover={{ background: 'rgba(0,122,255,0.04)', borderColor: 'rgba(0,122,255,0.4)' }}>
            <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 9, background: 'rgba(0,122,255,0.10)', color: PRI, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="building" size={17} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 650 }}>{r.legalName}</div><div style={{ fontSize: 12, color: T.faint }}>DOT {r.dotNumber} · {r.mcNumber} · {r.state} · {r.operatingStatus}</div></div>
            <span style={{ fontSize: 12, fontWeight: 600, color: PRI }}>Select</span>
          </Hover>)}
          {searched && results.length === 0 && <div style={{ fontSize: 13, color: T.muted, padding: '8px 0' }}>No FMCSA match for “{q}”.</div>}
          <button onClick={() => setManual(true)} style={{ fontSize: 12.5, fontWeight: 600, color: PRI, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0' }}>Can’t find it? Enter manually</button>
        </>}

        {picked && <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '13px 14px', border: '1px solid rgba(52,199,89,0.3)', background: 'rgba(52,199,89,0.05)', borderRadius: 12, marginBottom: 16 }}>
          <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 9, background: 'rgba(52,199,89,0.14)', color: '#248A3D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="shield" size={17} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 14, fontWeight: 700 }}>{picked.legalName}</span><VerifiedBadge /></div>
            <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>DOT {picked.dotNumber} · {picked.mcNumber} · {picked.phone}</div>
            <div style={{ fontSize: 12, color: T.faint }}>{picked.physicalAddress}</div>
          </div>
          <button onClick={() => setPicked(null)} style={{ fontSize: 12, fontWeight: 600, color: PRI, background: 'none', border: 'none', cursor: 'pointer' }}>Change</button>
        </div>}

        {manual && !picked && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>Company name</div><input value={f.manualName} onChange={(e) => set({ manualName: e.target.value })} style={input} /></div>
          <div><div style={lbl}>DOT</div><input value={f.manualDot} onChange={(e) => set({ manualDot: e.target.value })} style={input} /></div>
          <div><div style={lbl}>MC</div><input value={f.manualMc} onChange={(e) => set({ manualMc: e.target.value })} style={input} /></div>
          <div><div style={lbl}>Phone</div><input value={f.manualPhone} onChange={(e) => set({ manualPhone: e.target.value })} style={input} /></div>
          <button onClick={() => { setManual(false); }} style={{ alignSelf: 'end', fontSize: 12.5, fontWeight: 600, color: PRI, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>Search FMCSA instead</button>
        </div>}

        {(picked || manual) && <>
          <div style={{ height: 1, background: T.hair, margin: '4px 0 16px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>Position held</div><input value={f.position} onChange={(e) => set({ position: e.target.value })} style={input} /></div>
            <div><div style={lbl}>Start date</div><input type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} style={input} /></div>
            <div><div style={lbl}>End date</div><input type="date" value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} style={input} /></div>
            <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>Reason for leaving</div><input value={f.reason} onChange={(e) => set({ reason: e.target.value })} style={input} /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 14 }}>
            <ToggleRow label="Operated a commercial motor vehicle (CMV)" desc="Required for DOT-regulated employment" on={f.droveCmv} onClick={() => set({ droveCmv: !f.droveCmv })} />
            <ToggleRow label="Subject to DOT drug & alcohol testing" desc="Triggers §40.25 testing-records request" on={f.subjectToTesting} onClick={() => set({ subjectToTesting: !f.subjectToTesting })} />
          </div>
        </>}
      </div>
      <Foot onClose={onClose}><Btn variant="primary" icon="plus" onClick={save}>Add Employer</Btn></Foot>
    </div>
  </div>;
}

/* ============================ SEND VERIFICATION ============================ */
function SendVerificationModal({ entry, contact, onClose, onSent }: any) {
  const store = useComms();
  const [channel, setChannel] = React.useState<'email' | 'sms' | 'tenstreet'>(entry.employer.verifiedFromFmcsa ? 'tenstreet' : 'email');
  const [to, setTo] = React.useState(`safety@${slug(entry.employer.legalName)}.com`);
  const emp = entry.employer;
  const body = `Re: Employment & Safety Performance History Verification — 49 CFR §391.23 / §40.25\n\nWe are verifying employment for ${contact.name}, who reported working for ${emp.legalName} (USDOT ${emp.dotNumber || '—'}${emp.mcNumber ? `, ${emp.mcNumber}` : ''}).\n\nPlease confirm:\n• Dates of employment (${entry.startDate || '—'} – ${entry.endDate || 'present'})\n• Position held / whether the driver operated a CMV\n• DOT-recordable accidents (§390.15)\n• Drug & alcohol testing records, including positives or refusals (§40.25)\n\nThis request is made under FMCSA previous-employer inquiry requirements.\n\nQuickHire Compliance · compliance@quickhire.com`;
  const [text, setText] = React.useState(body);
  const [attach, setAttach] = React.useState(emp.verifiedFromFmcsa);
  const sms = `QuickHire Compliance: employment verification request for ${contact.name} (per FMCSA §391.23). Please reply or call (214) 555-1010 to confirm dates & safety history.`;
  const recipient = channel === 'email'
    ? { value: to || 'Add an email', ok: !!to, icon: 'mail' }
    : channel === 'sms'
      ? { value: emp.phone || 'No phone on FMCSA record', ok: !!emp.phone, icon: 'message' }
      : { value: 'Tenstreet network', ok: true, icon: 'externalLink' };

  const doSend = () => {
    if (!recipient.ok) return;
    svc.sendVerification(entry.id, channel, { to: channel === 'sms' ? emp.phone : channel === 'email' ? to : undefined, body: channel === 'sms' ? sms : text, attach });
    onSent(channel === 'tenstreet' ? 'Tenstreet' : channel.toUpperCase()); onClose();
  };

  return <div onClick={onClose} style={overlay}>
    <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, width: 'min(640px, 95vw)' }}>
      <Head title="Send Employment Verification" sub={`${emp.legalName} · ${emp.dotNumber ? 'DOT ' + emp.dotNumber : ''}`} onClose={onClose} />
      <div style={{ padding: '16px 22px', maxHeight: '72vh', overflowY: 'auto' }}>
        {/* who this verification is being sent to — always visible on every channel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: `1px solid ${T.border}`, borderRadius: 12, background: '#FBFBFD', marginBottom: 14 }}>
          <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 10, background: 'rgba(0,122,255,0.10)', color: PRI, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="building" size={19} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}><span style={{ fontSize: 14.5, fontWeight: 700 }}>{emp.legalName}</span>{emp.verifiedFromFmcsa && <VerifiedBadge />}</div>
            <div style={{ fontSize: 12, color: T.faint, marginTop: 1 }}>{emp.dotNumber ? `DOT ${emp.dotNumber}` : ''}{emp.mcNumber ? ` · ${emp.mcNumber}` : ''}{emp.physicalAddress ? ` · ${emp.physicalAddress}` : ''}</div>
          </div>
          <div style={{ textAlign: 'right', flex: 'none', maxWidth: 230 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', color: T.faint }}>Sending to</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 650, color: recipient.ok ? '#1D1D1F' : ERR, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 230 }}><Icon name={recipient.icon} size={13} style={{ color: recipient.ok ? PRI : ERR }} />{recipient.value}</div>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}><SegTabs value={channel} onChange={(v: any) => setChannel(v)} tabs={[{ key: 'email', label: 'Email', icon: 'mail' }, { key: 'sms', label: 'SMS', icon: 'message' }, { key: 'tenstreet', label: 'Tenstreet', icon: 'externalLink' }]} /></div>

        {channel === 'email' && <>
          <div style={{ marginBottom: 12 }}><div style={lbl}>To (employer safety / HR)</div><input value={to} onChange={(e) => setTo(e.target.value)} style={input} /></div>
          <div style={{ marginBottom: 12 }}><div style={lbl}>Request</div><textarea value={text} onChange={(e) => setText(e.target.value)} style={{ ...input, height: 220, padding: '11px 13px', lineHeight: 1.5, resize: 'vertical' }} /></div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.muted, cursor: 'pointer' }}><span onClick={() => setAttach(!attach)} style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${attach ? PRI : 'rgba(0,0,0,0.25)'}`, background: attach ? PRI : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>{attach && <Icon name="check" size={12} />}</span>Attach FMCSA verification snapshot</label>
        </>}

        {channel === 'sms' && <>
          <div style={{ marginBottom: 12 }}><div style={lbl}>To (employer phone — from FMCSA)</div><div style={{ ...input, display: 'flex', alignItems: 'center', color: emp.phone ? T.text : T.faint }}>{emp.phone || 'No phone on FMCSA record'}</div></div>
          <div><div style={lbl}>Message</div><div style={{ ...input, height: 'auto', minHeight: 84, padding: '11px 13px', lineHeight: 1.5, color: T.text }}>{sms}</div></div>
          <div style={{ fontSize: 11.5, color: T.faint, marginTop: 8 }}>Sent from the Compliance Line +1 214-555-1010.</div>
        </>}

        {channel === 'tenstreet' && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '20px', border: `1px solid ${T.border}`, borderRadius: 12 }}>
          <span style={{ width: 46, height: 46, borderRadius: 12, background: TS + '14', color: TS, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, fontWeight: 700 }}>TS</span>
          <div style={{ fontSize: 15, fontWeight: 650 }}>Send through Tenstreet network</div>
          <div style={{ fontSize: 13, color: T.muted, maxWidth: 380, marginTop: 6 }}>Routes the §391.23 verification to {emp.legalName} (DOT {emp.dotNumber || '—'}) through Tenstreet’s carrier network and pulls the response back into this profile.</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 11.5, fontWeight: 600, color: WARN, background: 'rgba(255,149,0,0.12)', borderRadius: 999, padding: '3px 10px' }}><span style={{ width: 6, height: 6, borderRadius: 999, background: WARN }} />Tenstreet · Demo mode</div>
        </div>}
      </div>
      <Foot onClose={onClose}><Btn variant="primary" icon="send" onClick={doSend}>Send via {channel === 'tenstreet' ? 'Tenstreet' : channel === 'sms' ? 'SMS' : 'Email'}</Btn></Foot>
    </div>
  </div>;
}

/* ---- shared bits ---- */
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '7vh', animation: 'qhFade .16s ease' };
const sheet: React.CSSProperties = { background: '#fff', borderRadius: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.3)', animation: 'qhScaleIn .18s ease' };
const pill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 13px', borderRadius: 10, border: `1px solid ${T.border}`, background: '#fff', color: '#1D1D1F', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
function Head({ title, sub, onClose }: any) { return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 0' }}><div><h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h2><div style={{ fontSize: 12.5, color: T.faint, marginTop: 3 }}>{sub}</div></div><Hover as="button" onClick={onClose} style={{ width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 8, color: T.muted, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.06)' }}><Icon name="x" size={17} /></Hover></div>; }
function Foot({ children, onClose }: any) { return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px 20px', borderTop: `1px solid ${T.hair}` }}><Btn variant="secondary" onClick={onClose}>Cancel</Btn>{children}</div>; }
function Field({ label, value }: any) { return <div style={{ padding: '6px 0' }}><div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', color: T.faint }}>{label}</div><div style={{ fontSize: 13, fontWeight: 600, marginTop: 1 }}>{value}</div></div>; }
function ToggleRow({ label, desc, on, onClick }: any) { return <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0' }}><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div><div style={{ fontSize: 12, color: T.faint, marginTop: 1 }}>{desc}</div></div><Toggle on={on} onChange={onClick} /></div>; }
