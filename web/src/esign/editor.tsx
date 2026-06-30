import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon } from '../tasks/lib';
import { FIELD_DEFS, FieldType, AUTOFILL_GROUPS, DOC_CATALOG, findOverlaps, uid, validateEnvelope, colorFor, docName, uploadPages } from './store';
import { primaryBtn, ghostBtn, Toggle } from './ui';

const PAGE_W = 680;

/* field display color by state (per spec) */
function fieldColors(f: any, recipients: any[]) {
  if (f.locked) return { border: '#C7C7CC', bg: 'rgba(199,199,204,0.18)', text: '#6E6E73' };           // gray: locked
  if (f.autofill) return { border: '#34C759', bg: 'rgba(52,199,89,0.14)', text: '#248A3D' };             // green: auto-filled
  if (!FIELD_DEFS[f.type as FieldType]?.signer) return { border: '#FF9F0A', bg: 'rgba(255,159,10,0.14)', text: '#A05A00' }; // orange: prefill/missing value
  const rc = recipients.find((r) => r.id === f.recipientId)?.color || '#007AFF';
  return { border: rc, bg: 'rgba(0,122,255,0.10)', text: '#0066CC' };                                     // blue: signer-editable
}

type Props = {
  title: string; subtitle?: string;
  value: { documentKeys: string[]; recipients: any[]; fields: any[]; carrier?: string };
  onChange: (patch: any) => void;
  onClose: () => void;
  onSave?: () => void;
  onSend?: () => void;
  onPreview?: () => void;
  sendLabel?: string;
};

export function DocumentEditor({ title, subtitle, value, onChange, onClose, onSave, onSend, onPreview, sendLabel = 'Send' }: Props) {
  const { documentKeys, recipients, fields, carrier = 'GRAND ONE LLC' } = value;
  const env = value as any;
  const [armed, setArmed] = React.useState<FieldType | ''>('');
  const [armedAutofill, setArmedAutofill] = React.useState<{ key: string; label: string } | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [activeDoc, setActiveDoc] = React.useState(0);
  const [zoom, setZoom] = React.useState(1);
  const [errs, setErrs] = React.useState<string[] | null>(null);
  const history = React.useRef<any[]>([]);
  const future = React.useRef<any[]>([]);
  const drag = React.useRef<any>(null);

  const docKey = documentKeys[activeDoc];
  const overlapSet = React.useMemo(() => findOverlaps(fields), [fields]);
  const selected = fields.find((f: any) => f.id === selectedId) || null;

  const pushHistory = () => { history.current.push(JSON.stringify(fields)); if (history.current.length > 50) history.current.shift(); future.current = []; };
  const setFields = (next: any[]) => onChange({ fields: next });

  const undo = () => { if (!history.current.length) return; future.current.push(JSON.stringify(fields)); const prev = JSON.parse(history.current.pop()!); onChange({ fields: prev }); };
  const redo = () => { if (!future.current.length) return; history.current.push(JSON.stringify(fields)); onChange({ fields: JSON.parse(future.current.pop()!) }); };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); delField(selectedId); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const placeAt = (clientX: number, clientY: number, pageEl: HTMLElement) => {
    const rect = pageEl.getBoundingClientRect();
    const x = (clientX - rect.left) / zoom;
    const y = (clientY - rect.top) / zoom;
    const signerId = recipients.find((r) => r.role === 'signer')?.id || (recipients[0] || {}).id;
    if (armedAutofill) {
      const fd = FIELD_DEFS.autofill;
      pushHistory();
      setFields([...fields, { id: uid('f'), docKey, page: 0, type: 'autofill', x: Math.max(0, x - fd.w / 2), y: Math.max(0, y - fd.h / 2), w: fd.w, h: fd.h, recipientId: signerId, required: false, value: '', placeholder: armedAutofill.label, locked: true, autofill: armedAutofill.key, label: armedAutofill.label }]);
      setArmedAutofill(null);
      return;
    }
    if (!armed) return;
    const fd = FIELD_DEFS[armed];
    pushHistory();
    setFields([...fields, { id: uid('f'), docKey, page: 0, type: armed, x: Math.max(0, x - fd.w / 2), y: Math.max(0, y - fd.h / 2), w: fd.w, h: fd.h, recipientId: signerId, required: fd.signer, value: '', placeholder: fd.label, locked: false, autofill: '', label: fd.label }]);
    if (!(window.event && (window.event as any).shiftKey)) setArmed('');
  };

  const patchField = (id: string, patch: any, snapshot = true) => {
    if (snapshot) pushHistory();
    setFields(fields.map((f: any) => (f.id === id ? { ...f, ...patch } : f)));
  };
  const delField = (id: string) => { pushHistory(); setFields(fields.filter((f: any) => f.id !== id)); if (selectedId === id) setSelectedId(null); };
  const dupField = (id: string) => { const f = fields.find((x: any) => x.id === id); if (!f) return; pushHistory(); const c = { ...f, id: uid('f'), x: f.x + 16, y: f.y + 16 }; setFields([...fields, c]); setSelectedId(c.id); };

  const fixOverlaps = () => {
    pushHistory();
    const next = fields.map((f: any) => ({ ...f }));
    const bad = findOverlaps(next);
    let shift = 0;
    for (const f of next) if (bad.has(f.id)) { f.y += shift; shift += f.h + 12; }
    setFields(next);
  };

  // ── drag move / resize ──
  const startMove = (e: React.MouseEvent, f: any) => {
    if (f.locked) { setSelectedId(f.id); return; }
    e.stopPropagation(); setSelectedId(f.id);
    pushHistory();
    drag.current = { id: f.id, mode: 'move', startX: e.clientX, startY: e.clientY, ox: f.x, oy: f.y };
    window.addEventListener('mousemove', onDragMove); window.addEventListener('mouseup', onDragEnd);
  };
  const startResize = (e: React.MouseEvent, f: any) => {
    e.stopPropagation(); setSelectedId(f.id); pushHistory();
    drag.current = { id: f.id, mode: 'resize', startX: e.clientX, startY: e.clientY, ow: f.w, oh: f.h };
    window.addEventListener('mousemove', onDragMove); window.addEventListener('mouseup', onDragEnd);
  };
  const onDragMove = (e: MouseEvent) => {
    const d = drag.current; if (!d) return;
    const dx = (e.clientX - d.startX) / zoom, dy = (e.clientY - d.startY) / zoom;
    setFields(getLatestFields().map((f: any) => {
      if (f.id !== d.id) return f;
      if (d.mode === 'move') return { ...f, x: Math.max(0, Math.round((d.ox + dx) / 4) * 4), y: Math.max(0, Math.round((d.oy + dy) / 4) * 4) };
      return { ...f, w: Math.max(40, Math.round((d.ow + dx) / 4) * 4), h: Math.max(22, Math.round((d.oh + dy) / 4) * 4) };
    }));
  };
  // fields can be stale inside listener; read from latest via ref
  const fieldsRef = React.useRef(fields); fieldsRef.current = fields;
  const getLatestFields = () => fieldsRef.current;
  const onDragEnd = () => { drag.current = null; window.removeEventListener('mousemove', onDragMove); window.removeEventListener('mouseup', onDragEnd); };

  const trySend = () => { const v = validateEnvelope({ ...value, subject: 'x', status: 'draft' } as any); setErrs(v); if (!v.length && onSend) onSend(); };

  const docFields = fields.filter((f: any) => f.docKey === docKey);

  return <div style={{ position: 'fixed', inset: 0, zIndex: 75, background: '#F5F6F8', display: 'flex', flexDirection: 'column' }}>
    {/* top bar */}
    <div style={{ height: 56, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', background: '#fff', borderBottom: `1px solid ${T.hair}` }}>
      <Hover as="button" onClick={onClose} style={iconBtn} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="x" size={18} /></Hover>
      <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>{subtitle && <div style={{ fontSize: 12, color: T.faint }}>{subtitle}</div>}</div>
      <div style={{ flex: 1 }} />
      <Hover as="button" onClick={undo} title="Undo" style={iconBtn} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="repeat" size={16} style={{ transform: 'scaleX(-1)' }} /></Hover>
      <Hover as="button" onClick={redo} title="Redo" style={iconBtn} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="repeat" size={16} /></Hover>
      {onPreview && <Hover as="button" onClick={onPreview} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="eye" size={15} />Preview</Hover>}
      {onSave && <Hover as="button" onClick={onSave} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Save Draft</Hover>}
      {onSend && <Hover as="button" onClick={trySend} style={primaryBtn} hover={{ background: '#0066D6' }}><Icon name="send" size={15} />{sendLabel}</Hover>}
    </div>

    {/* validation banner */}
    {errs && errs.length > 0 && <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', background: 'rgba(255,59,48,0.08)', borderBottom: '1px solid rgba(255,59,48,0.2)', color: '#C62820', fontSize: 12.5 }}>
      <Icon name="alert" size={16} /><span style={{ fontWeight: 600 }}>Can't send:</span><span>{errs.join('  ·  ')}</span>
      <span style={{ flex: 1 }} /><Hover as="button" onClick={() => setErrs(null)} style={{ ...iconBtn, width: 26, height: 26 }} hover={{ background: 'rgba(255,59,48,0.1)' }}><Icon name="x" size={14} /></Hover>
    </div>}

    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* left: tools */}
      <div style={{ width: 230, flex: 'none', borderRight: `1px solid ${T.hair}`, background: '#fff', overflowY: 'auto', padding: 14 }}>
        <PanelLabel>Field Tools</PanelLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 20 }}>
          {(Object.keys(FIELD_DEFS) as FieldType[]).filter((k) => k !== 'autofill').map((k) => {
            const fd = FIELD_DEFS[k]; const on = armed === k;
            return <Hover key={k} as="button" onClick={() => { setArmed(on ? '' : k); setArmedAutofill(null); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '10px 4px', borderRadius: 10, border: `1px solid ${on ? '#007AFF' : T.border}`, background: on ? 'rgba(0,122,255,0.08)' : '#fff', color: on ? '#007AFF' : T.muted, cursor: 'pointer' }} hover={{ background: on ? 'rgba(0,122,255,0.1)' : 'rgba(0,0,0,0.03)' }}>
              <Icon name={fd.icon} size={16} /><span style={{ fontSize: 10.5, fontWeight: 600 }}>{fd.label}</span>
            </Hover>;
          })}
        </div>
        <PanelLabel>Auto-fill Groups</PanelLabel>
        {AUTOFILL_GROUPS.map((g) => <div key={g.group} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: T.text, padding: '6px 4px' }}>{g.group}</div>
          {g.fields.map(([key, label]) => { const on = armedAutofill?.key === key; return <Hover key={key} as="button" onClick={() => { setArmedAutofill(on ? null : { key, label }); setArmed(''); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 12, borderRadius: 7, border: 'none', background: on ? 'rgba(52,199,89,0.1)' : 'transparent', color: on ? '#248A3D' : '#3a3a3c', cursor: 'pointer' }} hover={{ background: on ? 'rgba(52,199,89,0.12)' : 'rgba(0,0,0,0.04)' }}><span style={{ width: 7, height: 7, borderRadius: 999, background: '#34C759', flex: 'none' }} />{label}</Hover>; })}
        </div>)}
      </div>

      {/* center: canvas */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto', position: 'relative' }} onClick={() => setSelectedId(null)}>
        {/* doc tabs + zoom */}
        <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'rgba(245,246,248,0.9)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${T.hair}` }} onClick={(e) => e.stopPropagation()}>
          {documentKeys.map((k, i) => <button key={k + i} onClick={() => setActiveDoc(i)} style={{ height: 28, padding: '0 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: activeDoc === i ? '#fff' : 'transparent', color: activeDoc === i ? T.text : T.muted, boxShadow: activeDoc === i ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}>{docName(env, k)}</button>)}
          <div style={{ flex: 1 }} />
          {(armed || armedAutofill) && <span style={{ fontSize: 11.5, color: '#007AFF', fontWeight: 600, marginRight: 8 }}>Click the page to place {armedAutofill?.label || FIELD_DEFS[armed as FieldType]?.label}</span>}
          <Hover as="button" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))} style={iconBtn} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="x" size={13} style={{ display: 'none' }} /><span style={{ fontSize: 16, fontWeight: 600 }}>−</span></Hover>
          <span style={{ fontSize: 12, color: T.muted, width: 38, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <Hover as="button" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))} style={iconBtn} hover={{ background: 'rgba(0,0,0,0.05)' }}><span style={{ fontSize: 16, fontWeight: 600 }}>+</span></Hover>
          <Hover as="button" onClick={() => setZoom(1)} style={{ ...ghostBtn, height: 28 }} hover={{ background: 'rgba(0,0,0,0.04)' }}>Fit</Hover>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 0 80px' }}>
          <div style={{ width: PAGE_W * zoom }}>
            <DocPage docKey={docKey} carrier={carrier} zoom={zoom} pages={uploadPages(env, docKey)}
              armed={!!(armed || armedAutofill)}
              onPlace={(x: number, y: number, el: HTMLElement) => placeAt(x, y, el)}
              fields={docFields} recipients={recipients} selectedId={selectedId} overlapSet={overlapSet}
              onSelect={setSelectedId} onStartMove={startMove} onStartResize={startResize} />
          </div>
        </div>
      </div>

      {/* right: inspector */}
      <div style={{ width: 280, flex: 'none', borderLeft: `1px solid ${T.hair}`, background: '#fff', overflowY: 'auto', padding: 14 }}>
        <PanelLabel>Recipients</PanelLabel>
        {recipients.length === 0 && <div style={{ fontSize: 12, color: T.faint, marginBottom: 14 }}>No recipients yet.</div>}
        {recipients.map((r: any) => <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', background: '#F9FAFB', border: `1px solid ${T.hair}`, borderRadius: 10, marginBottom: 6 }}>
          <span style={{ width: 24, height: 24, flex: 'none', borderRadius: 999, background: r.color || colorFor(r.name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{(r.name || '?').split(' ').map((s: string) => s[0]).slice(0, 2).join('')}</span>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name || 'Unnamed'}</div><div style={{ fontSize: 11, color: T.faint, textTransform: 'capitalize' }}>{r.role}</div></div>
          <span style={{ fontSize: 10.5, color: T.muted }}>{fields.filter((f: any) => f.recipientId === r.id).length} fields</span>
        </div>)}

        <div style={{ borderTop: `1px solid ${T.hair}`, margin: '14px 0', paddingTop: 14 }}>
          <PanelLabel>Field Inspector</PanelLabel>
          {!selected ? <div style={{ fontSize: 12.5, color: T.faint, lineHeight: 1.5 }}>Select a placed field to edit its properties, or pick a tool / auto-fill value and click the page to place one.</div> : <FieldInspector f={selected} recipients={recipients} onPatch={(p: any) => patchField(selected.id, p)} onDelete={() => delField(selected.id)} onDuplicate={() => dupField(selected.id)} />}
        </div>

        {overlapSet.size > 0 && <div style={{ borderTop: `1px solid ${T.hair}`, paddingTop: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#C62820', fontWeight: 600, marginBottom: 8 }}><Icon name="alert" size={15} />{overlapSet.size} overlapping field{overlapSet.size > 2 ? 's' : ''}</div>
          <Hover as="button" onClick={fixOverlaps} style={{ ...ghostBtn, width: '100%', justifyContent: 'center' }} hover={{ background: 'rgba(0,0,0,0.04)' }}>Fix overlapping fields</Hover>
        </div>}

        <div style={{ borderTop: `1px solid ${T.hair}`, paddingTop: 14 }}>
          <PanelLabel>Legend</PanelLabel>
          {[['#007AFF', 'Signer-editable'], ['#34C759', 'Auto-filled'], ['#FF9F0A', 'Prefill / missing'], ['#C7C7CC', 'Locked / read-only'], ['#FF3B30', 'Overlap warning']].map(([c, l]) => <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.muted, padding: '3px 0' }}><span style={{ width: 12, height: 12, borderRadius: 4, background: c, flex: 'none' }} />{l}</div>)}
        </div>
      </div>
    </div>
  </div>;
}

function PanelLabel({ children }: any) { return <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.faint, marginBottom: 10 }}>{children}</div>; }
const iconBtn: React.CSSProperties = { width: 32, height: 32, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'transparent', color: T.muted, cursor: 'pointer' };

function DocPage({ docKey, carrier, zoom, armed, onPlace, fields, recipients, selectedId, overlapSet, onSelect, onStartMove, onStartResize, pages }: any) {
  const def = DOC_CATALOG[docKey];
  const ref = React.useRef<HTMLDivElement>(null);
  const isUpload = !!(pages && pages.length);
  return <div ref={ref} onClick={(e) => { if (armed && ref.current) { e.stopPropagation(); onPlace(e.clientX, e.clientY, ref.current); } }}
    style={{ width: PAGE_W, transform: `scale(${zoom})`, transformOrigin: 'top center', position: 'relative', background: '#fff', borderRadius: 4, boxShadow: '0 6px 26px rgba(0,0,0,0.12)', padding: isUpload ? 0 : '54px 60px', minHeight: isUpload ? undefined : 880, overflow: 'hidden', cursor: armed ? 'crosshair' : 'default' }}>
    {isUpload ? pages.map((pg: any, i: number) => <img key={i} src={pg.dataUrl} draggable={false} style={{ display: 'block', width: PAGE_W, height: pg.h, borderBottom: i < pages.length - 1 ? '1px solid rgba(0,0,0,0.08)' : 'none', userSelect: 'none' }} />)
      : <>
        <div style={{ fontSize: 19, fontWeight: 700, textAlign: 'center', textTransform: 'uppercase' }}>{def?.name || docKey}</div>
        <div style={{ fontSize: 12, color: T.faint, textAlign: 'center', marginBottom: 26 }}>{carrier}</div>
        {(def?.body(carrier) || []).map((p: string, i: number) => <p key={i} style={{ fontSize: 12.5, color: '#48484A', lineHeight: 1.9, margin: '0 0 14px' }}>{p}</p>)}
      </>}
    {/* placed fields */}
    {fields.map((f: any) => {
      const sel = f.id === selectedId; const bad = overlapSet.has(f.id);
      const c = fieldColors(f, recipients);
      return <div key={f.id} onClick={(e) => { e.stopPropagation(); onSelect(f.id); }} onMouseDown={(e) => onStartMove(e, f)}
        style={{ position: 'absolute', left: f.x, top: f.y, width: f.w, height: f.h, borderRadius: 5, border: `1.5px ${bad ? 'solid #FF3B30' : sel ? 'solid ' + c.border : 'dashed ' + c.border}`, background: bad ? 'rgba(255,59,48,0.1)' : c.bg, color: c.text, display: 'flex', alignItems: 'center', gap: 5, padding: '0 7px', fontSize: 10.5, fontWeight: 600, cursor: f.locked ? 'pointer' : 'move', boxShadow: sel ? '0 0 0 3px rgba(0,122,255,0.18)' : 'none', overflow: 'hidden', userSelect: 'none' }}>
        <Icon name={FIELD_DEFS[f.type as FieldType]?.icon || 'fileText'} size={12} />
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.placeholder || f.label}{f.required ? ' *' : ''}</span>
        {sel && !f.locked && <span onMouseDown={(e) => { e.stopPropagation(); onStartResize(e, f); }} style={{ position: 'absolute', right: -5, bottom: -5, width: 12, height: 12, borderRadius: 3, background: '#fff', border: `2px solid ${c.border}`, cursor: 'nwse-resize' }} />}
      </div>;
    })}
  </div>;
}

function FieldInspector({ f, recipients, onPatch, onDelete, onDuplicate }: any) {
  return <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <Icon name={FIELD_DEFS[f.type as FieldType]?.icon || 'fileText'} size={15} style={{ color: T.muted }} />
      <span style={{ fontSize: 13.5, fontWeight: 650 }}>{FIELD_DEFS[f.type as FieldType]?.label || f.type}</span>
    </div>
    <Row label="Assigned to">
      <select value={f.recipientId} onChange={(e) => onPatch({ recipientId: e.target.value })} style={miniInput}>
        {recipients.map((r: any) => <option key={r.id} value={r.id}>{r.name || 'Unnamed'} ({r.role})</option>)}
        {!recipients.length && <option>No recipients</option>}
      </select>
    </Row>
    <Row label="Placeholder"><input value={f.placeholder || ''} onChange={(e) => onPatch({ placeholder: e.target.value }, false)} style={miniInput} /></Row>
    <Row label="Default value"><input value={f.value || ''} onChange={(e) => onPatch({ value: e.target.value }, false)} placeholder="optional" style={miniInput} /></Row>
    <Row label="Tooltip / help"><input value={f.tooltip || ''} onChange={(e) => onPatch({ tooltip: e.target.value }, false)} placeholder="optional" style={miniInput} /></Row>
    <ToggleRow label="Required" on={!!f.required} onChange={(v: boolean) => onPatch({ required: v })} />
    <ToggleRow label="Editable by signer" on={!f.locked} onChange={(v: boolean) => onPatch({ locked: !v })} />
    <ToggleRow label="Locked / read-only" on={!!f.locked} onChange={(v: boolean) => onPatch({ locked: v })} />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
      <Hover as="button" onClick={onDuplicate} style={{ ...ghostBtn, height: 32, justifyContent: 'center' }} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="copy" size={14} />Duplicate</Hover>
      <Hover as="button" onClick={onDelete} style={{ ...ghostBtn, height: 32, justifyContent: 'center', color: '#C62820' }} hover={{ background: 'rgba(255,59,48,0.08)' }}><Icon name="trash" size={14} />Delete</Hover>
    </div>
  </div>;
}
const miniInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 32, borderRadius: 8, border: `1px solid ${T.border}`, padding: '0 9px', fontSize: 12.5, outline: 'none', fontFamily: 'inherit', appearance: 'none' as any };
function Row({ label, children }: any) { return <div style={{ marginBottom: 9 }}><div style={{ fontSize: 11, color: T.faint, fontWeight: 600, marginBottom: 4 }}>{label}</div>{children}</div>; }
function ToggleRow({ label, on, onChange }: any) { return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0' }}><span style={{ fontSize: 12.5, color: T.muted }}>{label}</span><Toggle on={on} onChange={onChange} /></div>; }
