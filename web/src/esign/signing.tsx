/* Signing session — what a recipient sees.
   Access code / SMS gate → in-person hand-off → electronic records consent →
   guided signing (START → NEXT tag, required counter, Finish only when
   complete) → done. Works at phone widths: text entry moves to a bottom sheet
   when the page is scaled down. Preview mode runs on a copy and never writes. */
import React from 'react';
import { T } from '../tasks/lib';
import {
  Envelope, Field, Recipient, Signature, Values, FIELD_DEFS, completion, isVisible, validateValue, autoValue, readingOrder, evalFormula, numericByLabel,
  isChecked, activeRecipients, fmtDateTime, splitName, PAGE_W, radioGroupValue,
} from './model';
import { svc, store, useEsign } from './store';
import { PageImage, EsignStyles } from './pages';
import { Icon, Btn, Modal, Dropdown, MenuItem, MenuSep, Checkbox, Input, Textarea, Segmented, useWidth, hexA, inputStyle, linkBtn, Field as FormField } from './ui';
import { renderTypedSignature, normalizeSignatureImage, renderStamp, initialsOf } from './pdfgen';
import { downloadSignedPdf, downloadCertificate } from './actions';
import { saveFile } from '../shell/files';

/* ───────────────────────── fonts + strings ───────────────────────── */
export const SIG_FONTS = ['Dancing Script', 'Great Vibes', 'Caveat', 'Sacramento'];
let fontsRequested = false;
export function ensureSignatureFonts() {
  if (fontsRequested || typeof document === 'undefined') return;
  fontsRequested = true;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Dancing+Script:wght@600&family=Great+Vibes&family=Sacramento&display=swap';
  document.head.appendChild(l);
}

const S = {
  en: { review: 'Please review and act on these documents', from: 'sent you documents to review and sign', agree: 'I agree to use electronic records and signatures.', disclosure: 'Read the Electronic Record and Signature Disclosure', cont: 'Continue', start: 'START', next: 'NEXT', finish: 'Finish', fin: 'FINISH', of: 'of', required: 'required fields complete', other: 'Other actions', later: 'Finish later', decline: 'Decline to sign', assign: 'Assign to someone else', comments: 'Comments', download: 'Download copy', sign: 'Sign', initial: 'Initial', attach: 'Attach file', approve: 'Approve', done: "You're done signing", doneBody: 'We emailed you a copy. You can also download it now.', choose: 'Choose…' },
  es: { review: 'Revise y firme estos documentos', from: 'le envió documentos para revisar y firmar', agree: 'Acepto usar registros y firmas electrónicos.', disclosure: 'Leer la divulgación de registros y firmas electrónicos', cont: 'Continuar', start: 'INICIO', next: 'SIGUIENTE', finish: 'Terminar', fin: 'TERMINAR', of: 'de', required: 'campos obligatorios completos', other: 'Otras acciones', later: 'Terminar después', decline: 'Rechazar firma', assign: 'Asignar a otra persona', comments: 'Comentarios', download: 'Descargar copia', sign: 'Firmar', initial: 'Iniciales', attach: 'Adjuntar', approve: 'Aprobar', done: 'Ya terminó de firmar', doneBody: 'Le enviamos una copia por correo. También puede descargarla ahora.', choose: 'Elegir…' },
};
type Lang = keyof typeof S;

type Mode = 'remote' | 'inperson' | 'self' | 'preview';
type Stage = 'auth' | 'handoff' | 'consent' | 'sign' | 'done' | 'declined' | 'later' | 'assigned' | 'return' | 'blocked';

export interface SessionProps { envId?: string; env?: Envelope; recipientId: string; mode: Mode; onClose: () => void; toast?: (t: string, k?: string, a?: any) => void }

/* ───────────────────────── session ───────────────────────── */
export function SigningSession({ envId, env: previewEnv, recipientId, mode, onClose, toast }: SessionProps) {
  useEsign();
  const preview = mode === 'preview';
  const [local] = React.useState<Envelope | null>(() => (preview && previewEnv ? structuredClone(previewEnv) : null));
  const env = (preview ? local : svc.envelope(envId)) as Envelope | undefined;
  const r = env?.recipients.find((x) => x.id === recipientId);
  const lang: Lang = (r?.language as Lang) in S ? (r!.language as Lang) : 'en';
  const t = S[lang];
  const width = useWidth();
  const mobile = width < 700;
  const [stage, setStage] = React.useState<Stage>(() => {
    if (!env || !r) return 'blocked';
    if (!preview && !activeRecipients(env).some((x) => x.id === r.id)) return 'blocked';
    if (!preview && (r.accessCode || r.smsAuth) && !r.authAt) return 'auth';
    if (mode === 'inperson') return 'handoff';
    return r.consentAt && !preview ? 'sign' : 'consent';
  });
  const [values, setValues] = React.useState<Values>(() => Object.fromEntries((env?.fields || []).map((f) => [f.id, f.value])));
  const [sig, setSig] = React.useState<Signature | null>(r?.signature || null);
  const [adopt, setAdopt] = React.useState<{ fieldId?: string; kind: 'signature' | 'initial' | 'stamp' } | null>(null);
  const [sheet, setSheet] = React.useState<string | null>(null);
  const [drawing, setDrawing] = React.useState<string | null>(null);
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [tried, setTried] = React.useState(false);
  const [modal, setModal] = React.useState<null | 'decline' | 'assign' | 'ersd' | 'comments'>(null);
  const [started, setStarted] = React.useState(false);
  const [finishing, setFinishing] = React.useState(false);
  const [result, setResult] = React.useState<{ complete: boolean } | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [areaW, setAreaW] = React.useState(800);
  const targetRef = React.useRef<string | undefined>(undefined);
  const [tagY, setTagY] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const el = targetRef.current ? scrollRef.current?.querySelector<HTMLElement>(`[data-sign-field="${targetRef.current}"]`) : null;
    const y = el ? el.offsetTop + ((el.offsetParent as HTMLElement | null)?.offsetTop || 0) : null;
    if (y !== tagY) setTagY(y);
  });

  React.useEffect(() => { ensureSignatureFonts(); }, []);
  React.useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => setAreaW(el.clientWidth)) : null;
    setAreaW(el.clientWidth); ro?.observe(el);
    return () => ro?.disconnect();
  }, [stage]);
  React.useEffect(() => { if (stage === 'sign' && env && r && !preview) svc.openSession(env.id, r.id, { host: mode === 'inperson' ? r.hostName || svc.me().name : undefined }); }, [stage]);

  if (!env || !r) return <Shell onClose={onClose} title="Envelope unavailable"><CenterCard icon="alert" title="This envelope is not available" body="It may have been voided or deleted." action={<Btn kind="primary" onClick={onClose}>Close</Btn>} /></Shell>;

  const fields = env.fields;
  const docOrder = env.documents.map((d) => d.id);
  const mine = (f: Field) => f.recipientId === r.id;
  const vis = (f: Field) => isVisible(f, fields, values);
  const comp = completion(fields, r.id, values);
  const ordered = readingOrder(fields.filter((f) => mine(f) && vis(f) && !f.readOnly), docOrder);
  const missingIds = new Set(comp.missing.map((f) => f.id));
  const errorOf = (f: Field) => { const e = comp.errors.find((x) => x.field.id === f.id); if (e) return e.message; if (f.type !== 'checkbox' && f.type !== 'radio') return validateValue(f, values[f.id]); return null; };
  const target = ordered.find((f) => missingIds.has(f.id) || (f.type === 'radio' && f.group && comp.missing.some((m) => m.type === 'radio' && m.group === f.group))) || comp.errors[0]?.field;
  const maxScale = mobile ? 1 : 1.15;
  const gutter = mobile ? 16 : 200;
  const scale = Math.max(0.3, Math.min(maxScale, (areaW - gutter) / PAGE_W));
  const compact = scale < 0.8;
  const signer = r.signature || sig;
  const viewOnly = r.action === 'view';

  const set = (id: string, v: string | undefined) => setValues((s) => ({ ...s, [id]: v }));
  const focusField = (f: Field) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-sign-field="${f.id}"]`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => { const input = el.querySelector<HTMLElement>('input,select,textarea,button'); if (input && !compact) input.focus({ preventScroll: true }); }, 380); }
    if (compact && ['text', 'number', 'date', 'company', 'title'].includes(f.type)) setTimeout(() => setSheet(f.id), 380);
  };
  const goNext = () => { setStarted(true); if (target) focusField(target); else if (comp.complete) finish(); };

  const applySign = (f: Field, s: Signature | null = signer) => {
    if (!s) { setAdopt({ fieldId: f.id, kind: f.type as any }); return; }
    if (f.type === 'stamp' && !s.stampUrl) { setAdopt({ fieldId: f.id, kind: 'stamp' }); return; }
    set(f.id, values[f.id] ? '' : 'signed');
  };
  const onAdopted = (s: Signature) => {
    setSig(s);
    const fid = adopt?.fieldId; setAdopt(null);
    if (fid) setValues((v) => ({ ...v, [fid]: 'signed' }));
    if (!preview) { const rr = svc.envelope(env.id)?.recipients.find((x) => x.id === r.id); if (rr) rr.signature = s; }
  };

  const finish = async () => {
    setTried(true);
    if (!comp.complete) { if (target) focusField(target); toast?.(comp.missing.length ? `${comp.missing.length} required field${comp.missing.length > 1 ? 's' : ''} left` : comp.errors[0]?.message || 'Check the highlighted fields', 'warning'); return; }
    setFinishing(true);
    if (preview) { setResult({ complete: false }); setStage('done'); setFinishing(false); return; }
    const res = svc.finish(env.id, r.id, values, signer);
    setFinishing(false);
    if (!res.ok) { toast?.(res.error || 'Could not finish', 'error'); return; }
    setResult({ complete: !!res.complete });
    setStage(mode === 'inperson' ? 'return' : 'done');
  };
  const finishLater = () => { if (!preview) svc.saveProgress(env.id, r.id, values); setStage('later'); };

  const otherActions = <Dropdown align="right" width={240} trigger={<Btn kind={mobile ? 'plain' : 'ghost'} size={mobile ? 'sm' : undefined} icon={mobile ? 'more' : undefined} aria-label={t.other} data-testid="other-actions">{mobile ? null : <>{t.other}<Icon name="chevronDown" size={14} /></>}</Btn>}>
    {(close: any) => <>
      <MenuItem icon="clock" label={t.later} hint="Save your progress and come back" onClick={() => { close(); finishLater(); }} />
      {mode !== 'inperson' && mode !== 'self' && <MenuItem icon="userPlus" label={t.assign} onClick={() => { close(); setModal('assign'); }} />}
      <MenuItem icon="message" label={`${t.comments}${env.comments.length ? ` (${env.comments.length})` : ''}`} onClick={() => { close(); setModal('comments'); }} />
      <MenuItem icon="download" label={t.download} onClick={() => { close(); downloadSignedPdf(env, { values }).catch(() => toast?.('Download failed', 'error')); }} />
      <MenuItem icon="shield" label="Electronic record disclosure" onClick={() => { close(); setModal('ersd'); }} />
      <MenuSep />
      <MenuItem icon="ban" label={t.decline} danger onClick={() => { close(); setModal('decline'); }} />
    </>}
  </Dropdown>;

  /* ── stages before signing ── */
  if (stage === 'blocked') {
    const st = env.status;
    return <Shell onClose={onClose} title={env.title}><CenterCard icon={st === 'completed' ? 'checkCircle' : 'clock'} title={st === 'completed' ? 'This envelope is complete' : isDoneR(r) ? 'You already finished' : st === 'voided' ? 'This envelope was voided' : 'Not your turn yet'} body={st === 'completed' ? 'Everyone has signed. You can download the completed document.' : st === 'voided' ? env.voidReason : 'You will be notified when it is your turn to sign.'} action={<div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>{st === 'completed' && <Btn icon="download" onClick={() => downloadSignedPdf(env)}>Download</Btn>}<Btn kind="primary" onClick={onClose}>Close</Btn></div>} /></Shell>;
  }
  if (stage === 'auth') return <Shell onClose={onClose} title={env.title}><AuthGate env={env} r={r} onPass={() => setStage(mode === 'inperson' ? 'handoff' : r.consentAt ? 'sign' : 'consent')} /></Shell>;
  if (stage === 'handoff') return <Shell onClose={onClose} title={env.title}><CenterCard icon="users" title={`In-person signing for ${r.name}`} body={<>Hosted by <b>{r.hostName || svc.me().name}</b>. Hand this device to <b>{r.name}</b> now. They'll review the documents, adopt a signature and sign. When they finish, they'll be asked to return the device to you.</>} action={<HandoffConfirm name={r.name} onGo={() => setStage(r.consentAt && !preview ? 'sign' : 'consent')} />} /></Shell>;
  if (stage === 'consent') return <Shell onClose={onClose} title={env.title} right={otherActions}>
    <ConsentCard env={env} r={r} t={t} onErsd={() => setModal('ersd')} onContinue={() => { if (!preview) svc.consent(env.id, r.id); else r.consentAt = new Date().toISOString(); setStage('sign'); }} preview={preview} />
    {modal === 'ersd' && <ErsdModal onClose={() => setModal(null)} />}
    {modal === 'decline' && <DeclineModal onClose={() => setModal(null)} onDecline={(why) => { if (!preview) svc.decline(env.id, r.id, why); setModal(null); setStage('declined'); }} />}
    {modal === 'assign' && <AssignModal onClose={() => setModal(null)} onAssign={(to) => { if (!preview) svc.delegate(env.id, r.id, to); setModal(null); setStage('assigned'); }} />}
    {modal === 'comments' && <CommentsModal env={env} r={r} preview={preview} onClose={() => setModal(null)} />}
  </Shell>;
  if (stage === 'done' || stage === 'return') {
    const live = svc.envelope(env.id) || env;
    const complete = live.status === 'completed';
    return <Shell onClose={onClose} title={env.title}>
      <CenterCard icon="checkCircle" tone="green" title={stage === 'return' ? `Thank you, ${splitName(r.name).first}` : preview ? 'Preview complete' : complete ? 'Envelope completed' : t.done}
        body={stage === 'return' ? <>Please hand the device back to <b>{r.hostName || svc.me().name}</b>.</> : preview ? 'This was a preview — nothing was signed or sent.' : complete ? 'Everyone has signed. The completed PDF and Certificate of Completion are ready.' : viewOnly ? 'Thanks for reviewing. The sender has been notified.' : `${t.doneBody} Remaining recipients have been notified.`}
        action={<div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {!preview && <Btn icon="download" onClick={() => downloadSignedPdf(live).catch(() => toast?.('Download failed', 'error'))} data-testid="done-download">{complete ? 'Download PDF' : 'Download copy'}</Btn>}
          {!preview && complete && <Btn icon="shield" onClick={() => downloadCertificate(live).catch(() => toast?.('Download failed', 'error'))} data-testid="done-certificate">Certificate</Btn>}
          <Btn kind="primary" onClick={onClose} data-testid="done-close">{stage === 'return' ? 'I have the device — close' : 'Close'}</Btn>
        </div>} />
    </Shell>;
  }
  if (stage === 'declined') return <Shell onClose={onClose} title={env.title}><CenterCard icon="ban" tone="red" title="You declined to sign" body="The sender has been notified and the envelope is closed." action={<Btn kind="primary" onClick={onClose}>Close</Btn>} /></Shell>;
  if (stage === 'later') return <Shell onClose={onClose} title={env.title}><CenterCard icon="clock" title="Progress saved" body="Open this envelope again any time to finish. Your entries are kept." action={<Btn kind="primary" onClick={onClose}>Close</Btn>} /></Shell>;
  if (stage === 'assigned') return <Shell onClose={onClose} title={env.title}><CenterCard icon="userPlus" title="Assigned" body="The new signer will receive an invitation. You no longer need to act on this envelope." action={<Btn kind="primary" onClick={onClose}>Close</Btn>} /></Shell>;

  /* ── signing ── */
  const total = comp.total, done = comp.done;
  const pct = total ? Math.round((done / total) * 100) : 100;
  const canFinish = comp.complete;
  const tagLabel = canFinish ? t.fin : started ? t.next : t.start;
  targetRef.current = target?.id;

  return <Shell onClose={onClose} title={env.title} preview={preview} right={<>
    {!mobile && <div style={{ fontSize: 12, color: T.muted, whiteSpace: 'nowrap' }} data-testid="required-counter">{done} {t.of} {total} {t.required}</div>}
    {otherActions}
    {!mobile && <Btn kind="primary" onClick={finish} disabled={!canFinish || finishing} data-testid="finish" style={{ background: canFinish ? '#007AFF' : undefined }}>{t.finish}</Btn>}
  </>}>
    <div style={{ flex: 'none', height: 3, background: '#E5E7EB' }}><div style={{ height: 3, width: `${pct}%`, background: pct === 100 ? '#34C759' : '#007AFF', transition: 'width .25s' }} /></div>
    {(r.privateMessage || env.message) && !started && <div style={{ flex: 'none', padding: mobile ? '10px 14px' : '10px 20px', background: '#fff', borderBottom: `1px solid ${T.hair}`, fontSize: 12.5, color: T.muted, display: 'flex', gap: 8 }}><Icon name="message" size={14} style={{ marginTop: 1 }} /><span style={{ flex: 1 }}><b style={{ color: T.text }}>{env.sender.name}:</b> {r.privateMessage || env.message}</span></div>}
    <div ref={scrollRef} className="qh-esign-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#E9EBEE', position: 'relative' }} data-testid="signing-scroll">
      <div style={{ position: 'relative', width: PAGE_W * scale, margin: '0 auto', padding: mobile ? '12px 0 120px' : '24px 0 140px' }}>
        {env.documents.map((doc) => <React.Fragment key={doc.id}>
          {env.documents.length > 1 && <div style={{ fontSize: 11.5, fontWeight: 650, color: T.muted, margin: '6px 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="fileText" size={13} />{doc.name}</div>}
          {doc.pages.map((pg, pi) => <div key={pi} style={{ position: 'relative', width: pg.w * scale, height: pg.h * scale, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.1), 0 8px 24px rgba(0,0,0,0.06)', background: '#fff' }}>
            <PageImage doc={doc} page={pi} eager={pi < 2} />
            {fields.filter((f) => f.docId === doc.id && f.page === pi && vis(f)).map((f) => <SignField key={f.id} f={f} s={scale} env={env} r={r} isMine={mine(f)} value={values[f.id]} values={values} signer={signer} compact={compact} t={t}
              missing={(tried || touched[f.id]) && missingIds.has(f.id)} error={(touched[f.id] || tried) ? errorOf(f) : null} isTarget={target?.id === f.id && started}
              onSet={(v: string | undefined) => { set(f.id, v); setStarted(true); }} onTouch={() => setTouched((s0) => ({ ...s0, [f.id]: true }))}
              onSign={() => { setStarted(true); applySign(f); }} onSheet={() => setSheet(f.id)} onDecline={() => setModal('decline')} onDraw={() => setDrawing(f.id)}
              onRadio={() => { setStarted(true); setValues((v) => { const n = { ...v }; fields.filter((x) => x.type === 'radio' && x.group === f.group && x.recipientId === r.id).forEach((x) => { n[x.id] = x.id === f.id ? 'on' : ''; }); return n; }); }}
              toast={toast} />)}
          </div>)}
        </React.Fragment>)}
        {!mobile && target && tagY != null && <GuideTag label={tagLabel} top={tagY} onClick={goNext} done={canFinish} />}
        {!mobile && canFinish && !target && <GuideTag label={t.fin} top={40} onClick={finish} done />}
      </div>
    </div>
    {mobile && <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px calc(10px + env(safe-area-inset-bottom))', background: '#fff', borderTop: `1px solid ${T.hair}` }}>
      <button type="button" onClick={goNext} data-testid="guide-tag" style={{ ...tagStyle(canFinish), position: 'relative', height: 40, paddingRight: 22 }}>{tagLabel}</button>
      <div style={{ flex: 1, fontSize: 12, color: T.muted, textAlign: 'center' }} data-testid="required-counter">{done}/{total} {lang === 'es' ? 'obligatorios' : 'required'}</div>
      <Btn kind="primary" onClick={finish} disabled={!canFinish || finishing} data-testid="finish">{t.finish}</Btn>
    </div>}

    {adopt && <AdoptModal r={r} kind={adopt.kind} current={signer} onClose={() => setAdopt(null)} onAdopt={onAdopted} />}
    {sheet && (() => { const f = fields.find((x) => x.id === sheet)!; return <FieldSheet f={f} value={values[f.id]} onChange={(v) => set(f.id, v)} onClose={() => { setTouched((s0) => ({ ...s0, [f.id]: true })); setSheet(null); }} onNext={() => { setTouched((s0) => ({ ...s0, [f.id]: true })); setSheet(null); setTimeout(goNext, 60); }} />; })()}
    {drawing && <DrawModal title="Draw" onClose={() => setDrawing(null)} onSave={(url) => { set(drawing, url); setDrawing(null); }} />}
    {modal === 'ersd' && <ErsdModal onClose={() => setModal(null)} />}
    {modal === 'decline' && <DeclineModal onClose={() => setModal(null)} onDecline={(why) => { if (!preview) svc.decline(env.id, r.id, why); setModal(null); setStage('declined'); }} />}
    {modal === 'assign' && <AssignModal onClose={() => setModal(null)} onAssign={(to) => { if (!preview) svc.delegate(env.id, r.id, to); setModal(null); setStage('assigned'); }} />}
    {modal === 'comments' && <CommentsModal env={env} r={r} preview={preview} onClose={() => setModal(null)} />}
  </Shell>;
}
const isDoneR = (r: Recipient) => r.status === 'signed' || r.status === 'completed';

/* ───────────────────────── chrome ───────────────────────── */
function Shell({ title, children, onClose, right, preview }: any) {
  const mobile = useWidth() < 700;
  return <div style={{ position: 'fixed', inset: 0, zIndex: 110, background: '#F5F6F8', display: 'flex', flexDirection: 'column' }} data-testid="signing-session">
    <EsignStyles />
    <header style={{ height: 56, flex: 'none', display: 'flex', alignItems: 'center', gap: mobile ? 6 : 12, padding: mobile ? '0 8px 0 10px' : '0 16px', background: '#fff', borderBottom: `1px solid ${T.hair}` }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,#007AFF,#4DA2FF)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name="sign" size={16} /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontSize: 11, color: T.faint }}>QuickHire e-Sign{preview ? ' · Preview' : ''}</div>
      </div>
      {right}
      <button type="button" aria-label="Close" onClick={onClose} style={{ width: 34, height: 34, flex: 'none', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={18} /></button>
    </header>
    {preview && <div style={{ flex: 'none', padding: '6px 16px', background: 'rgba(255,159,10,0.12)', color: '#8E5A00', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>Preview — this is what your recipient sees. Nothing is saved.</div>}
    {children}
  </div>;
}

function CenterCard({ icon, title, body, action, tone }: any) {
  const c = tone === 'green' ? '#34C759' : tone === 'red' ? '#FF3B30' : '#007AFF';
  return <div style={{ flex: 1, overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
    <div style={{ width: 460, maxWidth: '100%', background: '#fff', borderRadius: 16, border: `1px solid ${T.border}`, boxShadow: '0 10px 30px rgba(0,0,0,0.06)', padding: '30px 24px', textAlign: 'center' }} data-testid="center-card">
      <span style={{ width: 56, height: 56, borderRadius: 999, background: hexA(c, 0.12), color: c, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={28} /></span>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 14, letterSpacing: '-0.01em' }}>{title}</div>
      {body && <div style={{ fontSize: 13.5, color: T.muted, marginTop: 8, lineHeight: 1.55 }}>{body}</div>}
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  </div>;
}

const tagStyle = (done: boolean): React.CSSProperties => ({ border: 'none', cursor: 'pointer', background: done ? '#34C759' : '#FFD60A', color: done ? '#fff' : '#1D1D1F', fontWeight: 800, fontSize: 12.5, letterSpacing: '0.06em', padding: '0 18px 0 12px', height: 34, clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)', borderRadius: '6px 0 0 6px', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.18))', fontFamily: 'inherit' });
function GuideTag({ label, top, onClick, done }: any) {
  return <button type="button" onClick={onClick} data-testid="guide-tag" style={{ ...tagStyle(done), position: 'absolute', left: -104, top: Math.max(0, top - 6), width: 96, transition: 'top .3s ease', animation: done ? undefined : 'qhGlow 1.8s ease-in-out infinite' }}>{label}</button>;
}

/* ───────────────────────── fields ───────────────────────── */
function SignField({ f, s, env, r, isMine, value, values, signer, compact, t, missing, error, isTarget, onSet, onTouch, onSign, onSheet, onRadio, onDecline, onDraw, toast }: any) {
  const def = FIELD_DEFS[f.type as keyof typeof FIELD_DEFS];
  const owner: Recipient | undefined = env.recipients.find((x: Recipient) => x.id === f.recipientId);
  const fs = Math.max(compact ? 7 : 9, (f.fontSize || 11) * s);
  const box: React.CSSProperties = { position: 'absolute', left: f.x * s, top: f.y * s, width: f.w * s, height: f.h * s, boxSizing: 'border-box' };
  const filled = f.type === 'radio' && f.group ? !!radioGroupValue(env.fields, f.group, f.recipientId, values) : f.type === 'checkbox' ? isChecked(value) : !!String(value ?? '').trim();
  if (!isMine) {
    // other recipients: show what they completed, nothing else
    const ownerDone = owner && (owner.status === 'signed' || owner.status === 'completed');
    if (f.readOnly && value && def.kind !== 'sign') return <div style={{ ...box, display: 'flex', alignItems: 'center', fontSize: fs, color: '#1D1D1F', padding: `0 ${2 * s}px`, whiteSpace: 'nowrap', overflow: 'hidden' }}>{value}</div>;
    if (!ownerDone || !value) return null;
    if (def.kind === 'sign') return <div style={{ ...box }}><SigImage r={owner} f={f} s={s} /></div>;
    if (f.type === 'checkbox' || f.type === 'radio') return <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1D1D1F' }}>{isChecked(value) ? <Icon name={f.type === 'radio' ? 'radio' : 'check'} size={Math.max(8, f.w * s * 0.8)} /> : null}</div>;
    return <div style={{ ...box, display: 'flex', alignItems: 'center', fontSize: fs, color: '#1D1D1F', padding: `0 ${2 * s}px`, whiteSpace: 'nowrap', overflow: 'hidden' }}>{fieldDisplay(f, value, values, env)}</div>;
  }
  const req = f.required && !f.readOnly;
  const tone = error ? '#FF3B30' : missing ? '#FF9500' : req && !filled ? '#E0A800' : '#007AFF';
  const bg = error ? 'rgba(255,59,48,0.08)' : filled ? (def.kind === 'input' || f.type === 'dropdown' ? 'rgba(255,255,255,0.94)' : 'transparent') : req ? 'linear-gradient(rgba(255,214,10,0.24),rgba(255,214,10,0.24)), rgba(255,255,255,0.9)' : 'linear-gradient(rgba(0,122,255,0.08),rgba(0,122,255,0.08)), rgba(255,255,255,0.9)';
  const frame: React.CSSProperties = { ...box, border: `${isTarget ? 2 : 1}px ${filled ? 'dashed' : 'solid'} ${filled && !error ? 'rgba(0,122,255,0.35)' : tone}`, background: bg, borderRadius: 3, boxShadow: isTarget ? `0 0 0 3px ${hexA(tone, 0.25)}` : 'none' };
  const tip = f.tooltip || f.label || def.label;
  const errBubble = error && <div role="alert" style={{ position: 'absolute', left: f.x * s, top: (f.y + f.h) * s + 3, zIndex: 4, background: '#FF3B30', color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 7px', borderRadius: 6, whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>{error}</div>;
  const hit = (min = 28): React.CSSProperties => ({ position: 'absolute', left: '50%', top: '50%', width: Math.max(min, f.w * s), height: Math.max(min, f.h * s), transform: 'translate(-50%,-50%)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 });

  // read-only (sender-filled / merge) — shown as plain text
  if (f.readOnly && def.kind !== 'auto') return <div data-sign-field={f.id} style={{ ...box, display: 'flex', alignItems: 'center', fontSize: fs, color: '#1D1D1F', padding: `0 ${2 * s}px`, whiteSpace: 'nowrap', overflow: 'hidden' }} title={tip}>{f.type === 'formula' ? fieldDisplay(f, value, values, env) : value}</div>;

  switch (f.type) {
    case 'signature': case 'initial': case 'stamp':
      return <div data-sign-field={f.id} style={{ ...frame, ...(filled ? { border: '1px dashed transparent', background: 'transparent' } : {}) }} title={tip}>
        <button type="button" onClick={onSign} className="qh-esign-field" data-testid={`sign-${f.type}`} aria-label={f.type === 'initial' ? t.initial : t.sign} style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 0, color: '#8A6D00', fontWeight: 800, fontSize: Math.max(8, 11 * s), fontFamily: 'inherit' }}>
          {filled ? <SigImage r={{ ...r, signature: signer }} f={f} s={s} /> : <><Icon name={f.type === 'initial' ? 'initial' : f.type === 'stamp' ? 'stamp' : 'sign'} size={Math.max(10, Math.min(18, f.h * s * 0.5))} />{f.h * s > 18 && (f.type === 'initial' ? t.initial : f.type === 'stamp' ? 'Stamp' : t.sign)}</>}
        </button>
      </div>;
    case 'dateSigned': case 'fullName': case 'firstName': case 'lastName': case 'email':
      return <div data-sign-field={f.id} style={{ ...box, display: 'flex', alignItems: 'center', fontSize: fs, color: '#1D1D1F', padding: `0 ${2 * s}px`, whiteSpace: 'nowrap', overflow: 'hidden' }}>{autoValue(f, r)}</div>;
    case 'checkbox':
      return <div data-sign-field={f.id} style={{ ...frame, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2 }} title={tip}>
        {isChecked(value) && <Icon name="check" size={Math.max(8, f.w * s * 0.85)} style={{ color: '#1D1D1F' }} />}
        <button type="button" role="checkbox" aria-checked={isChecked(value)} aria-label={tip} data-testid="sign-checkbox" className="qh-esign-field" onClick={() => { onSet(isChecked(value) ? '' : 'true'); onTouch(); }} style={hit()} />
      </div>;
    case 'radio':
      return <div data-sign-field={f.id} style={{ ...frame, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={`${f.group || ''}: ${f.optionValue || ''}`}>
        {isChecked(value) && <span style={{ width: '50%', height: '50%', borderRadius: 99, background: '#1D1D1F' }} />}
        <button type="button" role="radio" aria-checked={isChecked(value)} aria-label={`${f.group}: ${f.optionValue}`} data-testid="sign-radio" data-option={f.optionValue} className="qh-esign-field" onClick={() => { onRadio(); onTouch(); }} style={hit()} />
      </div>;
    case 'dropdown':
      return <div data-sign-field={f.id} style={frame} title={tip}><select value={value || ''} aria-label={tip} data-testid="sign-dropdown" className="qh-esign-field" onChange={(e) => { onSet(e.target.value); onTouch(); }} style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', fontSize: Math.max(compact ? 12 : 9, fs), padding: `0 ${2 * s}px`, outline: 'none', cursor: 'pointer', color: '#1D1D1F', fontFamily: 'inherit' }}>
        <option value="">{t.choose}</option>{(f.options || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>{errBubble}</div>;
    case 'note':
      return <div data-sign-field={f.id} style={{ ...box, background: '#FFF8D6', border: '1px solid #F2D675', borderRadius: 4, padding: 4 * s, fontSize: Math.max(8, 10.5 * s), color: '#5C4A00', overflow: 'auto', lineHeight: 1.35 }}>{f.value || 'Note'}</div>;
    case 'attachment': {
      let att: any = null; try { att = value ? JSON.parse(value) : null; } catch { att = null; }
      return <div data-sign-field={f.id} style={{ ...frame, display: 'flex', alignItems: 'center' }} title={tip}>
        <label data-testid="sign-attachment" className="qh-esign-field" style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', height: '100%', cursor: 'pointer', padding: `0 ${3 * s}px`, fontSize: Math.max(8, 10.5 * s), color: att ? '#1D1D1F' : '#0066CC', fontWeight: 650, overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <Icon name="paperclip" size={Math.max(9, Math.min(14, f.h * s * 0.55))} />{att ? att.name : t.attach}
          <input type="file" accept="application/pdf,image/png,image/jpeg" style={{ display: 'none' }} onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 10 * 1024 * 1024) { toast?.('Attachments must be under 10 MB', 'error'); return; } try { const rec = await saveFile(file); onSet(JSON.stringify({ fileId: rec.id, name: rec.name, type: rec.type, size: rec.size })); onTouch(); } catch { toast?.('Could not read that file', 'error'); } e.target.value = ''; }} />
        </label>
      </div>;
    }
    case 'approve':
      return <div data-sign-field={f.id} style={{ ...box }}><button type="button" data-testid="sign-approve" onClick={() => { onSet(value ? '' : 'approved'); onTouch(); }} style={{ width: '100%', height: '100%', borderRadius: 6, border: 'none', background: value ? '#34C759' : '#E8F8EC', color: value ? '#fff' : '#248A3D', fontWeight: 700, fontSize: Math.max(8, 11 * s), cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: 'inherit' }}><Icon name={value ? 'check' : 'thumbsUp'} size={Math.max(9, 12 * s)} />{value ? 'Approved' : t.approve}</button></div>;
    case 'decline':
      return <div data-sign-field={f.id} style={{ ...box }}><button type="button" onClick={onDecline} style={{ width: '100%', height: '100%', borderRadius: 6, border: '1px solid rgba(255,59,48,0.4)', background: '#FFF1F0', color: '#C62820', fontWeight: 700, fontSize: Math.max(8, 11 * s), cursor: 'pointer', fontFamily: 'inherit' }}>Decline</button></div>;
    case 'formula':
      return <div data-sign-field={f.id} style={{ ...box, display: 'flex', alignItems: 'center', fontSize: fs, padding: `0 ${2 * s}px`, color: '#1D1D1F', background: 'rgba(0,0,0,0.03)', borderRadius: 3 }}>{fieldDisplay(f, value, values, env)}</div>;
    case 'drawing':
      return <div data-sign-field={f.id} style={frame}><button type="button" onClick={onDraw} style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>{value ? <img src={value} alt="Drawing" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: Math.max(8, 11 * s), color: '#0066CC', fontWeight: 650 }}>Tap to draw</span>}</button></div>;
    default: {
      // text, number, date, company, title
      const placeholder = f.type === 'date' ? 'MM/DD/YYYY' : f.placeholder || (f.type === 'company' ? 'Company' : f.type === 'title' ? 'Title' : '');
      if (compact) return <div data-sign-field={f.id} style={frame} title={tip}><button type="button" onClick={onSheet} className="qh-esign-field" data-testid="sign-text" style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', textAlign: 'left', fontSize: fs, padding: `0 ${2 * s}px`, color: value ? '#1D1D1F' : '#8E8E93', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'inherit' }}>{value || placeholder || tip}</button>{errBubble}</div>;
      return <div data-sign-field={f.id} style={frame} title={tip}><input value={value || ''} placeholder={placeholder} aria-label={tip} inputMode={f.type === 'number' ? 'decimal' : undefined} maxLength={f.validation?.maxLength || undefined} data-testid="sign-text" className="qh-esign-field"
        onChange={(e) => onSet(e.target.value)} onBlur={onTouch}
        style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', fontSize: fs, padding: `0 ${2 * s}px`, outline: 'none', color: '#1D1D1F', fontFamily: 'inherit', boxSizing: 'border-box' }} />{errBubble}</div>;
    }
  }
}

function fieldDisplay(f: Field, value: any, values: Values, env: Envelope) {
  if (f.type === 'formula') { const n = evalFormula(f.formula || '', numericByLabel(env.fields, values)); return n == null ? '' : String(n); }
  if (f.type === 'attachment') { try { return JSON.parse(value).name; } catch { return value; } }
  if (f.type === 'approve') return value ? 'Approved' : '';
  return value;
}

function SigImage({ r, f, s }: any) {
  const sg: Signature | null = r?.signature || null;
  const url = f.type === 'initial' ? sg?.iniUrl : f.type === 'stamp' ? sg?.stampUrl || sg?.sigUrl : sg?.sigUrl;
  if (url) return <span style={{ position: 'relative', display: 'flex', width: '100%', height: '100%', alignItems: 'center', borderLeft: `${Math.max(1, 1.5 * s)}px solid #1F5FD6`, paddingLeft: 3 * s, boxSizing: 'border-box' }}><img src={url} alt={`${f.type} of ${r?.name}`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /></span>;
  const text = f.type === 'initial' ? sg?.initials || initialsOf(r?.name || '') : sg?.name || r?.name || '';
  return <span style={{ fontFamily: `"${sg?.font || 'Dancing Script'}", cursive`, fontSize: Math.max(10, f.h * s * 0.6), color: '#14213D', whiteSpace: 'nowrap', overflow: 'hidden', borderLeft: `${Math.max(1, 1.5 * s)}px solid #1F5FD6`, paddingLeft: 3 * s }}>{text}</span>;
}

/* ───────────────────────── pre-sign cards ───────────────────────── */
function ConsentCard({ env, r, t, onErsd, onContinue, preview }: any) {
  const [ok, setOk] = React.useState(false);
  return <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: 16 }}>
    <div style={{ width: 560, maxWidth: '100%', marginTop: 'min(8vh, 60px)', alignSelf: 'flex-start', background: '#fff', borderRadius: 16, border: `1px solid ${T.border}`, boxShadow: '0 10px 30px rgba(0,0,0,0.06)', overflow: 'hidden' }} data-testid="consent-card">
      <div style={{ padding: '22px 22px 16px', background: 'linear-gradient(180deg,#F3F8FF,#fff)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#0066CC', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t.review}</div>
        <div style={{ fontSize: 19, fontWeight: 700, marginTop: 6, letterSpacing: '-0.01em' }}>{env.subject || env.title}</div>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}><b style={{ color: T.text }}>{env.sender.name}</b> {t.from}{r.hostName && r.action === 'in_person' ? ` · hosted by ${r.hostName}` : ''}.</div>
      </div>
      {(r.privateMessage || env.message) && <div style={{ margin: '0 22px', padding: 12, borderRadius: 10, background: '#F7F8FA', fontSize: 13, color: '#3A3A3C', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.privateMessage || env.message}</div>}
      <div style={{ padding: '14px 22px 4px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>{env.documents.map((d: any) => <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 9px', borderRadius: 999, background: '#F2F2F7', fontSize: 11.5, color: T.muted }}><Icon name="fileText" size={12} />{d.name}</span>)}</div>
      <div style={{ padding: 22, borderTop: `1px solid ${T.hair}`, marginTop: 14 }}>
        <Checkbox checked={ok} onChange={setOk} label={<span data-testid="consent-checkbox">{t.agree} <button type="button" onClick={(e) => { e.preventDefault(); onErsd(); }} style={{ ...linkBtn, fontSize: 13 }}>{t.disclosure}</button></span>} />
        <Btn kind="primary" disabled={!ok} onClick={onContinue} style={{ width: '100%', marginTop: 16, height: 44, fontSize: 15 }} data-testid="consent-continue">{t.cont}</Btn>
        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 10, textAlign: 'center' }}>{preview ? 'Preview mode' : `Signing as ${r.name} · ${r.email}`}</div>
      </div>
    </div>
  </div>;
}

function AuthGate({ env, r, onPass }: any) {
  const [code, setCode] = React.useState('');
  const [err, setErr] = React.useState('');
  const [tries, setTries] = React.useState(0);
  const [sms] = React.useState(() => String(Math.floor(100000 + Math.random() * 900000)));
  const [smsStep, setSmsStep] = React.useState(!r.accessCode && r.smsAuth);
  const phone = String(r.phone || '').replace(/\D/g, '');
  if (smsStep) return <CenterCard icon="smartphone" title="Verify with a text message" body={<>
    <div>We sent a 6-digit code to the mobile number ending in <b>{phone.slice(-4) || '••••'}</b>.</div>
    {store.settings.simulationMode && <div style={{ marginTop: 8, fontSize: 12, color: '#8E5A00', background: 'rgba(255,159,10,0.12)', borderRadius: 8, padding: '6px 10px' }}>Simulation mode — real SMS delivery needs the backend. Your code is <b data-testid="sms-code">{sms}</b>.</div>}
    <Input value={code} onChange={(e: any) => { setCode(e.target.value); setErr(''); }} placeholder="6-digit code" inputMode="numeric" style={{ marginTop: 14, textAlign: 'center', fontSize: 18, letterSpacing: '0.3em', height: 46 }} data-testid="sms-input" />
    {err && <div role="alert" style={{ color: '#C62820', fontSize: 12.5, marginTop: 8 }}>{err}</div>}
  </>} action={<Btn kind="primary" style={{ width: '100%', height: 44 }} onClick={() => { if (code.trim() === sms) { svc.smsVerified(env.id, r.id); onPass(); } else setErr('That code is not correct.'); }}>Verify</Btn>} />;
  return <CenterCard icon="key" title="Enter the access code" body={<>
    <div>{env.sender.name} protected this envelope with an access code. They should have shared it with you separately.</div>
    <Input value={code} onChange={(e: any) => { setCode(e.target.value); setErr(''); }} onKeyDown={(e: any) => { if (e.key === 'Enter') (document.querySelector('[data-testid="access-submit"]') as HTMLElement)?.click(); }} placeholder="Access code" autoFocus style={{ marginTop: 14, textAlign: 'center', fontSize: 16, height: 46 }} data-testid="access-input" />
    {err && <div role="alert" style={{ color: '#C62820', fontSize: 12.5, marginTop: 8 }} data-testid="access-error">{err}</div>}
  </>} action={<Btn kind="primary" data-testid="access-submit" disabled={tries >= 5} style={{ width: '100%', height: 44 }} onClick={() => { if (svc.verifyAccess(env.id, r.id, code)) { if (r.smsAuth) { setCode(''); setSmsStep(true); } else onPass(); } else { const n = tries + 1; setTries(n); setErr(n >= 5 ? 'Too many attempts. Ask the sender to resend the envelope.' : 'That access code is not correct.'); } }}>Validate</Btn>} />;
}

function HandoffConfirm({ name, onGo }: any) {
  const [ok, setOk] = React.useState(false);
  return <div>
    <Checkbox checked={ok} onChange={setOk} label={<span data-testid="handoff-confirm">I am <b>{name}</b> and I'm ready to sign.</span>} style={{ textAlign: 'left' }} />
    <Btn kind="primary" disabled={!ok} onClick={onGo} style={{ width: '100%', marginTop: 14, height: 44 }} data-testid="handoff-go">Start signing</Btn>
  </div>;
}

/* ───────────────────────── modals ───────────────────────── */
export function ErsdModal({ onClose }: any) {
  return <Modal title="Electronic Record and Signature Disclosure" onClose={onClose} width={600} footer={<Btn kind="primary" onClick={onClose}>Close</Btn>}>
    <div style={{ fontSize: 13, color: '#3A3A3C', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{store.settings.ersd}</div>
  </Modal>;
}
function DeclineModal({ onClose, onDecline }: { onClose: () => void; onDecline: (why: string) => void }) {
  const [why, setWhy] = React.useState('');
  return <Modal title="Decline to sign" subtitle="The sender will be notified and the envelope will be closed for everyone." onClose={onClose} width={480} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="danger" disabled={!why.trim()} onClick={() => onDecline(why.trim())} data-testid="decline-confirm">Decline</Btn></>}>
    <FormField label="Reason"><Textarea rows={4} value={why} onChange={(e: any) => setWhy(e.target.value)} placeholder="Let the sender know why you're declining" autoFocus data-testid="decline-reason" /></FormField>
  </Modal>;
}
function AssignModal({ onClose, onAssign }: { onClose: () => void; onAssign: (to: { name: string; email: string; reason?: string }) => void }) {
  const [name, setName] = React.useState(''); const [email, setEmail] = React.useState(''); const [reason, setReason] = React.useState('');
  const ok = name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  return <Modal title="Assign to someone else" subtitle="They'll receive the envelope and sign in your place." onClose={onClose} width={480} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!ok} onClick={() => onAssign({ name: name.trim(), email: email.trim(), reason: reason.trim() })}>Assign</Btn></>}>
    <FormField label="Full name"><Input value={name} onChange={(e: any) => setName(e.target.value)} autoFocus /></FormField>
    <FormField label="Email"><Input value={email} onChange={(e: any) => setEmail(e.target.value)} type="email" /></FormField>
    <FormField label="Reason (optional)"><Input value={reason} onChange={(e: any) => setReason(e.target.value)} /></FormField>
  </Modal>;
}
function CommentsModal({ env, r, preview, onClose }: any) {
  useEsign();
  const [text, setText] = React.useState('');
  const live = preview ? env : svc.envelope(env.id) || env;
  return <Modal title="Comments" subtitle="Visible to the sender and other recipients of this envelope." onClose={onClose} width={480} footer={<><Btn onClick={onClose}>Close</Btn><Btn kind="primary" disabled={!text.trim() || preview} onClick={() => { svc.addComment(env.id, { author: r.name, authorEmail: r.email, text, recipientId: r.id }); setText(''); }} data-testid="comment-post">Post comment</Btn></>}>
    {(live.comments || []).length === 0 && <div style={{ fontSize: 13, color: T.faint, marginBottom: 12 }}>No comments yet. Ask a question or leave a note for the sender.</div>}
    {(live.comments || []).map((c: any) => <div key={c.id} style={{ padding: '9px 0', borderBottom: `1px solid ${T.hair}` }}><div style={{ fontSize: 12.5, fontWeight: 650 }}>{c.author} <span style={{ fontWeight: 400, color: T.faint, fontSize: 11.5 }}>· {fmtDateTime(c.at)}</span></div><div style={{ fontSize: 13, color: '#3A3A3C', marginTop: 3, whiteSpace: 'pre-wrap' }}>{c.text}</div></div>)}
    <Textarea rows={3} value={text} onChange={(e: any) => setText(e.target.value)} placeholder={preview ? 'Comments are disabled in preview' : 'Write a comment…'} style={{ marginTop: 12 }} data-testid="comment-input" />
  </Modal>;
}

/** Bottom sheet for typing into a field on small screens. */
function FieldSheet({ f, value, onChange, onClose, onNext }: { f: Field; value?: string; onChange: (v: string) => void; onClose: () => void; onNext: () => void }) {
  const err = validateValue(f, value);
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { setTimeout(() => ref.current?.focus(), 50); }, []);
  return <div style={{ position: 'fixed', inset: 0, zIndex: 130, display: 'flex', alignItems: 'flex-end' }} role="dialog" aria-label={f.label || 'Field'}>
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }} />
    <div style={{ position: 'relative', width: '100%', background: '#fff', borderRadius: '16px 16px 0 0', padding: '14px 16px calc(16px + env(safe-area-inset-bottom))', boxShadow: '0 -10px 30px rgba(0,0,0,0.15)', animation: 'qhSlideUp .18s ease' }} data-testid="field-sheet">
      <div style={{ width: 36, height: 4, borderRadius: 9, background: '#D1D1D6', margin: '0 auto 12px' }} />
      <div style={{ fontSize: 14, fontWeight: 700 }}>{f.label || FIELD_DEFS[f.type].label}{f.required && <span style={{ color: '#E5372C' }}> *</span>}</div>
      {f.tooltip && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>{f.tooltip}</div>}
      <input ref={ref} value={value || ''} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !err) onNext(); }} inputMode={f.type === 'number' ? 'decimal' : undefined} placeholder={f.type === 'date' ? 'MM/DD/YYYY' : ''} maxLength={f.validation?.maxLength || undefined} data-testid="sheet-input"
        style={{ ...inputStyle, height: 46, fontSize: 16, marginTop: 10, borderColor: err ? '#FF3B30' : 'rgba(0,0,0,0.15)' }} />
      {err && <div role="alert" style={{ color: '#C62820', fontSize: 12.5, marginTop: 6 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><Btn onClick={onClose} style={{ flex: 1, height: 44 }}>Done</Btn><Btn kind="primary" disabled={!!err} onClick={onNext} style={{ flex: 1, height: 44 }} data-testid="sheet-next">Next</Btn></div>
    </div>
  </div>;
}

/* ───────────────────────── adopt signature ───────────────────────── */
function AdoptModal({ r, kind, current, onClose, onAdopt }: { r: Recipient; kind: 'signature' | 'initial' | 'stamp'; current: Signature | null; onClose: () => void; onAdopt: (s: Signature) => void }) {
  const [tab, setTab] = React.useState<'style' | 'draw' | 'upload'>(kind === 'stamp' ? 'upload' : 'style');
  const [name, setName] = React.useState(current?.name || r.name);
  const [ini, setIni] = React.useState(current?.initials || initialsOf(r.name));
  const [font, setFont] = React.useState(current?.font || SIG_FONTS[0]);
  const [drawnSig, setDrawnSig] = React.useState<string | null>(null);
  const [drawnIni, setDrawnIni] = React.useState<string | null>(null);
  const [upload, setUpload] = React.useState<string | null>(null);
  const [stamp, setStamp] = React.useState<string | null>(current?.stampUrl || null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const mobile = useWidth() < 700;

  const valid = kind === 'stamp' ? !!stamp : name.trim().length > 1 && ini.trim().length > 0 && (tab === 'style' || (tab === 'draw' && !!drawnSig && !!drawnIni) || (tab === 'upload' && !!upload));
  const adopt = async () => {
    setBusy(true); setErr('');
    try {
      if (kind === 'stamp') { onAdopt({ ...(current || { kind: 'uploaded', name: r.name, initials: initialsOf(r.name), sigUrl: '', iniUrl: '', adoptedAt: new Date().toISOString() }), stampUrl: stamp! }); return; }
      let sigUrl = '', iniUrl = '';
      if (tab === 'style') { sigUrl = await renderTypedSignature(name.trim(), font); iniUrl = await renderTypedSignature(ini.trim(), font); }
      else if (tab === 'draw') { sigUrl = await normalizeSignatureImage(drawnSig!); iniUrl = await normalizeSignatureImage(drawnIni!); }
      else { sigUrl = upload!; iniUrl = drawnIni ? await normalizeSignatureImage(drawnIni) : await renderTypedSignature(ini.trim(), font); }
      onAdopt({ kind: tab === 'style' ? 'typed' : tab === 'draw' ? 'drawn' : 'uploaded', font: tab === 'style' ? font : undefined, name: name.trim(), initials: ini.trim(), sigUrl, iniUrl, stampUrl: current?.stampUrl, adoptedAt: new Date().toISOString() });
    } catch { setErr('Something went wrong creating your signature. Try again.'); } finally { setBusy(false); }
  };

  return <Modal zIndex={140} title={kind === 'stamp' ? 'Add your stamp' : 'Adopt your signature'} subtitle={kind === 'stamp' ? 'Upload your company stamp or generate one.' : 'Confirm your name, initials and signature.'} onClose={onClose} width={mobile ? 420 : 620}
    footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!valid || busy} onClick={adopt} data-testid="adopt-sign">{busy ? 'Working…' : kind === 'stamp' ? 'Adopt stamp' : 'Adopt and sign'}</Btn></>}>
    {kind === 'stamp' ? <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <label style={{ ...linkBtn, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><Icon name="upload" size={14} />Upload image<input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const url = await readAsDataUrl(f); setStamp(await normalizeSignatureImage(url, 500, 300, true)); }} /></label>
        <button type="button" style={linkBtn} onClick={() => setStamp(renderStamp(store.settings.sender.company || 'QuickHire', r.name))}>Generate a stamp</button>
      </div>
      <div style={{ height: 160, border: `1px dashed ${T.border}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAFB' }}>{stamp ? <img src={stamp} alt="Stamp preview" style={{ maxHeight: 140, maxWidth: '90%' }} /> : <span style={{ color: T.faint, fontSize: 13 }}>No stamp yet</span>}</div>
    </div> : <>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '2fr 1fr', gap: 12 }}>
        <FormField label="Full name"><Input value={name} onChange={(e: any) => setName(e.target.value)} data-testid="adopt-name" /></FormField>
        <FormField label="Initials"><Input value={ini} onChange={(e: any) => setIni(e.target.value.slice(0, 5))} data-testid="adopt-initials" /></FormField>
      </div>
      <div style={{ marginBottom: 12 }}><Segmented value={tab} onChange={setTab} options={[{ value: 'style', label: 'Choose style', icon: 'text' }, { value: 'draw', label: 'Draw', icon: 'pencil' }, { value: 'upload', label: 'Upload', icon: 'image' }]} /></div>
      {tab === 'style' && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="style-list">
        {SIG_FONTS.map((fo) => <label key={fo} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${font === fo ? '#007AFF' : T.border}`, background: font === fo ? 'rgba(0,122,255,0.04)' : '#fff', cursor: 'pointer' }}>
          <input type="radio" name="sigfont" checked={font === fo} onChange={() => setFont(fo)} style={{ accentColor: '#007AFF' }} />
          <span style={{ flex: 1, minWidth: 0, fontFamily: `"${fo}", cursive`, fontSize: 30, color: '#14213D', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>{name || 'Your name'}</span>
          <span style={{ fontFamily: `"${fo}", cursive`, fontSize: 26, color: '#14213D', minWidth: 46, textAlign: 'right' }}>{ini}</span>
        </label>)}
      </div>}
      {tab === 'draw' && <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '2fr 1fr', gap: 12 }}>
        <div><div style={{ fontSize: 11.5, fontWeight: 700, color: T.faint, textTransform: 'uppercase', marginBottom: 6 }}>Draw your signature</div><DrawPad height={150} onChange={setDrawnSig} testId="draw-signature" /></div>
        <div><div style={{ fontSize: 11.5, fontWeight: 700, color: T.faint, textTransform: 'uppercase', marginBottom: 6 }}>Draw initials</div><DrawPad height={150} onChange={setDrawnIni} testId="draw-initials" /></div>
      </div>}
      {tab === 'upload' && <div>
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, height: 150, border: `1.5px dashed ${T.border}`, borderRadius: 12, cursor: 'pointer', background: '#FAFAFB', color: T.muted, fontSize: 13 }}>
          {upload ? <img src={upload} alt="Uploaded signature" style={{ maxHeight: 120, maxWidth: '90%' }} /> : <><Icon name="upload" size={22} />Upload a photo of your signature (PNG or JPG)</>}
          <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 5 * 1024 * 1024) { setErr('Use an image under 5 MB.'); return; } setUpload(await normalizeSignatureImage(await readAsDataUrl(f), 600, 200, true)); }} data-testid="upload-signature" />
        </label>
        <div style={{ fontSize: 12, color: T.faint, marginTop: 8 }}>Initials will use your typed initials in the selected style.</div>
      </div>}
      <div style={{ fontSize: 11.5, color: T.faint, lineHeight: 1.5, marginTop: 14 }}>By selecting <b>Adopt and sign</b>, I agree that this signature and these initials are the electronic representation of my signature and initials for all purposes when I use them on documents, including legally binding contracts.</div>
    </>}
    {err && <div role="alert" style={{ color: '#C62820', fontSize: 12.5, marginTop: 8 }}>{err}</div>}
  </Modal>;
}

function readAsDataUrl(f: File): Promise<string> { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); }); }

/** Pointer-based drawing surface (mouse, touch and pen). */
export function DrawPad({ height = 150, onChange, testId }: { height?: number; onChange: (url: string | null) => void; testId?: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = React.useState(true);
  React.useEffect(() => {
    const c = ref.current!; const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr; c.height = height * dpr;
    const ctx = c.getContext('2d')!; ctx.scale(dpr, dpr); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14213D'; ctx.lineWidth = 2.6;
  }, [height]);
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent) => { e.preventDefault(); ref.current!.setPointerCapture?.(e.pointerId); drawing.current = true; last.current = pos(e); const ctx = ref.current!.getContext('2d')!; ctx.beginPath(); ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2); ctx.fillStyle = '#14213D'; ctx.fill(); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = pos(e); const ctx = ref.current!.getContext('2d')!;
    const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 };
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
  };
  const up = () => { if (!drawing.current) return; drawing.current = false; last.current = null; setEmpty(false); onChange(ref.current!.toDataURL('image/png')); };
  const clear = () => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setEmpty(true); onChange(null); };
  return <div style={{ position: 'relative' }}>
    <canvas ref={ref} data-testid={testId} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} style={{ width: '100%', height, display: 'block', borderRadius: 12, border: `1px solid ${T.border}`, background: '#FAFAFB', touchAction: 'none', cursor: 'crosshair' }} />
    <div style={{ position: 'absolute', left: 14, right: 14, bottom: 30, height: 1, background: 'rgba(0,0,0,0.12)', pointerEvents: 'none' }} />
    {empty ? <span style={{ position: 'absolute', left: 14, bottom: 10, fontSize: 11.5, color: T.faint, pointerEvents: 'none' }}>Sign above the line</span>
      : <button type="button" onClick={clear} style={{ position: 'absolute', right: 8, top: 8, border: 'none', background: '#fff', borderRadius: 7, padding: '3px 8px', fontSize: 12, color: '#0066CC', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.12)', fontFamily: 'inherit' }}>Clear</button>}
  </div>;
}

function DrawModal({ title, onClose, onSave }: { title: string; onClose: () => void; onSave: (url: string) => void }) {
  const [url, setUrl] = React.useState<string | null>(null);
  return <Modal zIndex={140} title={title} onClose={onClose} width={560} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!url} onClick={() => url && onSave(url)}>Save drawing</Btn></>}><DrawPad height={240} onChange={setUrl} /></Modal>;
}
