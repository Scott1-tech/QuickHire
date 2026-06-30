import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon } from '../tasks/lib';
import { FIELD_DEFS, FieldType, DOC_CATALOG } from './store';
import { primaryBtn, ghostBtn, Modal } from './ui';

const PAGE_W = 660;

/* Signer preview — lets the recruiter test the signer experience end-to-end. */
export function SigningPreview({ env, recipient, onClose, onComplete }: any) {
  const signer = recipient || (env.recipients || []).find((r: any) => r.role === 'signer') || env.recipients?.[0];
  const myFields = (env.fields || []).filter((f: any) => f.recipientId === signer?.id && FIELD_DEFS[f.type as FieldType]?.signer);
  const [started, setStarted] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, any>>(() => Object.fromEntries((env.fields || []).map((f: any) => [f.id, f.value || (f.type === 'date' ? new Date().toLocaleDateString() : '')])));
  const [adopt, setAdopt] = React.useState<{ fieldId: string } | null>(null);
  const [sigName, setSigName] = React.useState(signer?.name || '');
  const [done, setDone] = React.useState(false);
  const [activeDoc, setActiveDoc] = React.useState(0);
  const pageRefs = React.useRef<Record<string, HTMLElement | null>>({});

  const docKey = (env.documentKeys || [])[activeDoc];
  const requiredLeft = myFields.filter((f: any) => f.required && !values[f.id]);
  const setVal = (id: string, v: any) => setValues((s) => ({ ...s, [id]: v }));

  const goNext = () => {
    const target = requiredLeft[0]; if (!target) return;
    const di = (env.documentKeys || []).indexOf(target.docKey); if (di >= 0) setActiveDoc(di);
    setTimeout(() => { const el = pageRefs.current[target.id]; el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60);
  };
  const finish = () => { setDone(true); };

  if (done) {
    return <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: '#F5F6F8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
      <span style={{ width: 64, height: 64, borderRadius: 999, background: 'rgba(52,199,89,0.14)', color: '#34C759', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="checkCircle" size={34} /></span>
      <div style={{ fontSize: 22, fontWeight: 700 }}>You're all done</div>
      <div style={{ fontSize: 14, color: T.muted, textAlign: 'center', maxWidth: 420, lineHeight: 1.5 }}>This was a preview of the signer experience. In live mode, {signer?.name || 'the signer'} would receive a confirmation email and a copy of the completed document.</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Close preview</Hover>
        {onComplete && <Hover as="button" onClick={() => { onComplete(signer?.id); onClose(); }} style={primaryBtn} hover={{ background: '#0066D6' }}>Mark as signed in app</Hover>}
      </div>
    </div>;
  }

  return <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: '#F5F6F8', display: 'flex', flexDirection: 'column' }}>
    {/* top bar */}
    <div style={{ height: 56, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', background: '#fff', borderBottom: `1px solid ${T.hair}` }}>
      <Hover as="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', color: T.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="x" size={18} /></Hover>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: '#A05A00', background: 'rgba(255,159,10,0.14)', borderRadius: 999, padding: '3px 10px' }}><Icon name="eye" size={13} />Signer preview</span>
      <div style={{ fontSize: 14, fontWeight: 650 }}>{env.title}</div>
      <div style={{ flex: 1 }} />
      {started && (requiredLeft.length > 0
        ? <Hover as="button" onClick={goNext} style={primaryBtn} hover={{ background: '#0066D6' }}>Next required field<span style={{ marginLeft: 4, background: 'rgba(255,255,255,0.25)', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>{requiredLeft.length}</span></Hover>
        : <Hover as="button" onClick={finish} style={{ ...primaryBtn, background: '#34C759' }} hover={{ background: '#2BA84A' }}><Icon name="check" size={15} />Finish signing</Hover>)}
    </div>

    {!started ? <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <span style={{ width: 60, height: 60, borderRadius: 999, background: 'rgba(0,122,255,0.1)', color: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="sign" size={30} /></span>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{signer?.name || 'Signer'}, please review & sign</div>
      <div style={{ fontSize: 13.5, color: T.muted }}>{myFields.length} field{myFields.length === 1 ? '' : 's'} to complete · {(env.documentKeys || []).length} document{(env.documentKeys || []).length === 1 ? '' : 's'}</div>
      <Hover as="button" onClick={() => setStarted(true)} style={{ ...primaryBtn, height: 44, padding: '0 26px', fontSize: 15 }} hover={{ background: '#0066D6' }}>Start</Hover>
    </div> : <>
      {/* doc tabs */}
      {(env.documentKeys || []).length > 1 && <div style={{ flex: 'none', display: 'flex', gap: 6, padding: '8px 16px', background: '#fff', borderBottom: `1px solid ${T.hair}`, overflowX: 'auto' }}>
        {(env.documentKeys || []).map((k: string, i: number) => <button key={k + i} onClick={() => setActiveDoc(i)} style={{ height: 28, padding: '0 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', background: activeDoc === i ? 'rgba(0,122,255,0.1)' : 'transparent', color: activeDoc === i ? '#007AFF' : T.muted }}>{DOC_CATALOG[k]?.name || k}</button>)}
      </div>}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '26px 0 80px' }}>
        <div style={{ width: PAGE_W, position: 'relative', background: '#fff', borderRadius: 4, boxShadow: '0 6px 26px rgba(0,0,0,0.12)', padding: '50px 56px', minHeight: 860 }}>
          <div style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', textTransform: 'uppercase' }}>{DOC_CATALOG[docKey]?.name || docKey}</div>
          <div style={{ fontSize: 12, color: T.faint, textAlign: 'center', marginBottom: 24 }}>{env.carrier}</div>
          {(DOC_CATALOG[docKey]?.body(env.carrier || 'GRAND ONE LLC') || []).map((p: string, i: number) => <p key={i} style={{ fontSize: 12.5, color: '#48484A', lineHeight: 1.9, margin: '0 0 14px' }}>{p}</p>)}
          {(env.fields || []).filter((f: any) => f.docKey === docKey).map((f: any) => {
            const mine = f.recipientId === signer?.id && FIELD_DEFS[f.type as FieldType]?.signer && !f.locked;
            const filled = !!values[f.id];
            const border = !mine ? '#C7C7CC' : filled ? '#34C759' : f.required ? '#FF3B30' : '#007AFF';
            const bg = !mine ? 'rgba(199,199,204,0.12)' : filled ? 'rgba(52,199,89,0.12)' : 'rgba(0,122,255,0.08)';
            return <div key={f.id} ref={(el) => { pageRefs.current[f.id] = el; }} style={{ position: 'absolute', left: f.x, top: f.y, width: f.w, height: f.h }}>
              <SignerField f={f} mine={mine} value={values[f.id]} border={border} bg={bg}
                onSet={(v: any) => setVal(f.id, v)} onAdopt={() => setAdopt({ fieldId: f.id })} />
            </div>;
          })}
        </div>
      </div>
    </>}

    {adopt && <Modal title="Adopt your signature" subtitle="Type your name — this becomes your legal electronic signature." width={460} onClose={() => setAdopt(null)} footer={<>
      <Hover as="button" onClick={() => setAdopt(null)} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover>
      <Hover as="button" onClick={() => { if (sigName.trim()) { setVal(adopt.fieldId, sigName.trim()); setAdopt(null); } }} style={primaryBtn} hover={{ background: '#0066D6' }}>Adopt & sign</Hover>
    </>}>
      <input value={sigName} onChange={(e) => setSigName(e.target.value)} placeholder="Full name" style={{ width: '100%', boxSizing: 'border-box', height: 40, borderRadius: 10, border: `1px solid ${T.border}`, padding: '0 12px', fontSize: 14, outline: 'none', marginBottom: 14 }} />
      <div style={{ height: 80, borderRadius: 10, border: `1px solid ${T.border}`, background: '#FAFAFA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'cursive', fontSize: 30, color: '#1D1D1F' }}>{sigName || 'Your signature'}</div>
    </Modal>}
  </div>;
}

function SignerField({ f, mine, value, border, bg, onSet, onAdopt }: any) {
  const common: React.CSSProperties = { width: '100%', height: '100%', boxSizing: 'border-box', borderRadius: 5, border: `1.5px solid ${border}`, background: bg, fontSize: 11, padding: '0 7px', outline: 'none' };
  if (!mine) return <div style={{ ...common, display: 'flex', alignItems: 'center', color: '#8E8E93', fontWeight: 600 }}>{value || f.placeholder}</div>;
  if (f.type === 'signature' || f.type === 'initial') return <button onClick={onAdopt} style={{ ...common, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: value ? 'cursive' : 'inherit', fontSize: value ? 17 : 11, color: value ? '#1D1D1F' : '#0066CC', fontWeight: 600 }}>{value || `Sign ${f.type === 'initial' ? '(initial)' : ''}`}</button>;
  if (f.type === 'checkbox' || f.type === 'radio') return <button onClick={() => onSet(value ? '' : 'x')} style={{ ...common, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#248A3D' }}>{value ? <Icon name="check" size={16} /> : ''}</button>;
  if (f.type === 'date') return <input value={value || ''} onChange={(e) => onSet(e.target.value)} style={{ ...common }} />;
  return <input value={value || ''} onChange={(e) => onSet(e.target.value)} placeholder={f.placeholder} style={{ ...common }} />;
}
