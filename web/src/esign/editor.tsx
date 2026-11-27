/* Prepare — the field editor.
   Multi-page canvas with page thumbnails, zoom and page navigation; drag or
   click to place fields; move, resize, marquee + shift multi-select, copy /
   paste / duplicate / delete, undo / redo, alignment; a properties panel for
   validation, options, conditional logic, formulas and merge data. Fields are
   colored by recipient. Edits stay local and are synced to the store on a
   short debounce so dragging never thrashes persistence. */
import React from 'react';
import { Hover } from '../lib/dc';
import { T } from '../tasks/lib';
import {
  EDoc, Field, FieldType, FIELD_DEFS, FIELD_GROUPS, MERGE_FIELDS, VALIDATIONS, CondOp, uid, canHaveFields, isVisible, evalFormula, numericByLabel, mergeLabel, cloneFields,
} from './model';
import { PageImage } from './pages';
import { Icon, IconButton, Btn, Dropdown, MenuItem, MenuSep, Toggle, Label, Kbd, hexA, useWidth, Select, inputStyle } from './ui';

export type EditorRecipient = { id: string; name: string; roleName?: string; email?: string; action: string; color: string };
type Armed = { type: FieldType; mergeKey?: string; label?: string } | null;

export interface EditorProps {
  mode: 'envelope' | 'template' | 'correct' | 'self';
  title: string;
  subtitle?: string;
  documents: EDoc[];
  recipients: EditorRecipient[];
  fields: Field[];
  onFields: (fields: Field[]) => void;
  mergeData?: Record<string, string>;
  onBack: () => void;
  backLabel?: string;
  primary: { label: string; icon?: string; onClick: () => void };
  secondary?: React.ReactNode;
  issues?: string[];
  onDismissIssues?: () => void;
  toast?: (t: string, k?: string, a?: any) => void;
}

let CLIPBOARD: Field[] = [];
let pasteCount = 0;

const recName = (r?: EditorRecipient) => (r ? r.name || r.roleName || r.email || 'Recipient' : 'Unassigned');

export function DocumentEditor(p: EditorProps) {
  const { documents, recipients, mode, toast } = p;
  const width = useWidth();
  const [fields, setFieldsState] = React.useState<Field[]>(() => p.fields.map((f) => ({ ...f })));
  const fieldsRef = React.useRef(fields); fieldsRef.current = fields;
  const past = React.useRef<Field[][]>([]);
  const future = React.useRef<Field[][]>([]);
  const [, bump] = React.useReducer((x) => x + 1, 0);
  const [sel, setSel] = React.useState<string[]>([]);
  const selRef = React.useRef(sel); selRef.current = sel;
  const [armed, setArmed] = React.useState<Armed>(null);
  const fieldable = recipients.filter((r) => canHaveFields(r as any));
  const [activeRid, setActiveRid] = React.useState<string>(() => fieldable[0]?.id || recipients[0]?.id || '');
  const [zoom, setZoom] = React.useState(1);
  const zoomRef = React.useRef(zoom); zoomRef.current = zoom;
  const [cur, setCur] = React.useState<{ docId: string; page: number }>({ docId: documents[0]?.id || '', page: 0 });
  const curRef = React.useRef(cur); curRef.current = cur;
  const [marquee, setMarquee] = React.useState<null | { key: string; x: number; y: number; w: number; h: number }>(null);
  const [paletteQ, setPaletteQ] = React.useState('');
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<any>(null);
  const syncT = React.useRef<any>(null);
  const narrow = width < 1100;

  React.useEffect(() => { if (!recipients.some((r) => r.id === activeRid)) setActiveRid(fieldable[0]?.id || recipients[0]?.id || ''); }, [recipients.map((r) => r.id).join()]);

  /* ── sync to parent ── */
  const flush = React.useCallback(() => { if (syncT.current) { clearTimeout(syncT.current); syncT.current = null; } p.onFields(fieldsRef.current); }, [p.onFields]);
  React.useEffect(() => () => { if (syncT.current) { clearTimeout(syncT.current); p.onFields(fieldsRef.current); } }, []);
  const commit = (next: Field[], history = true) => {
    if (history) { past.current.push(fieldsRef.current); if (past.current.length > 150) past.current.shift(); future.current = []; }
    fieldsRef.current = next; setFieldsState(next);
    if (syncT.current) clearTimeout(syncT.current);
    syncT.current = setTimeout(() => { syncT.current = null; p.onFields(fieldsRef.current); }, 300);
  };
  const snapshot = () => { past.current.push(fieldsRef.current); if (past.current.length > 150) past.current.shift(); future.current = []; bump(); };
  const undo = () => { const prev = past.current.pop(); if (!prev) return; future.current.push(fieldsRef.current); commit(prev, false); setSel((s) => s.filter((id) => prev.some((f) => f.id === id))); bump(); };
  const redo = () => { const nx = future.current.pop(); if (!nx) return; past.current.push(fieldsRef.current); commit(nx, false); bump(); };

  const docOf = (id: string) => documents.find((d) => d.id === id);
  const pageDims = (docId: string, page: number) => docOf(docId)?.pages[page] || { w: 680, h: 880 };
  const recOf = (id: string) => recipients.find((r) => r.id === id);
  const selected = fields.filter((f) => sel.includes(f.id));

  /* ── creating fields ── */
  const counter = (t: FieldType) => fieldsRef.current.filter((f) => f.type === t).length + 1;
  const makeField = (spec: NonNullable<Armed>, docId: string, page: number, cx: number, cy: number): Field[] => {
    const def = FIELD_DEFS[spec.type];
    const mw = spec.mergeKey ? MERGE_FIELDS.find((m) => m.key === spec.mergeKey)?.w || 160 : def.w;
    const w = mw, h = def.h;
    const dims = pageDims(docId, page);
    const x = Math.round(Math.max(0, Math.min(dims.w - w, cx - w / 2))), y = Math.round(Math.max(0, Math.min(dims.h - h, cy - h / 2)));
    const rid = recipients.some((r) => r.id === activeRid && canHaveFields(r as any)) ? activeRid : fieldable[0]?.id || '';
    const req = ['sign', 'input', 'file', 'drawing'].includes(def.kind) || spec.type === 'radio' || spec.type === 'dropdown';
    const base: Field = { id: uid('f'), docId, page, x, y, w, h, type: spec.type, recipientId: rid, required: !spec.mergeKey && req, label: spec.mergeKey ? mergeLabel(spec.mergeKey) : `${def.label} ${counter(spec.type)}`, value: '' };
    if (spec.mergeKey) { base.mergeKey = spec.mergeKey; base.readOnly = true; base.value = p.mergeData?.[spec.mergeKey] || ''; }
    if (spec.type === 'dropdown') base.options = ['Option 1', 'Option 2', 'Option 3'];
    if (spec.type === 'note') base.value = '';
    if (spec.type === 'formula') { base.formula = ''; base.readOnly = true; base.required = false; }
    if (spec.type === 'radio') {
      const g = `Radio group ${new Set(fieldsRef.current.filter((f) => f.type === 'radio').map((f) => f.group)).size + 1}`;
      const second: Field = { ...base, id: uid('f'), y: Math.min(dims.h - h, y + 26), group: g, optionValue: 'Option 2', label: `${g} · Option 2` };
      return [{ ...base, group: g, optionValue: 'Option 1', label: `${g} · Option 1` }, second];
    }
    return [base];
  };
  const placeAt = (spec: NonNullable<Armed>, docId: string, page: number, cx: number, cy: number) => {
    if (!fieldable.length) { toast?.('Add a recipient who signs before placing fields', 'warning'); return; }
    const created = makeField(spec, docId, page, cx, cy);
    commit([...fieldsRef.current, ...created]);
    setSel(created.map((f) => f.id));
  };

  /* ── selection helpers ── */
  const patchFields = (ids: string[], patch: Partial<Field> | ((f: Field) => Partial<Field>), history = true) => {
    commit(fieldsRef.current.map((f) => (ids.includes(f.id) && !f.locked ? { ...f, ...(typeof patch === 'function' ? patch(f) : patch) } : f)), history);
  };
  const deleteSel = () => {
    const ids = selRef.current.filter((id) => !fieldsRef.current.find((f) => f.id === id)?.locked);
    if (!ids.length) return;
    commit(fieldsRef.current.filter((f) => !ids.includes(f.id)).map((f) => (f.conditional && ids.includes(f.conditional.fieldId) ? { ...f, conditional: null } : f)));
    setSel([]);
  };
  const copySel = () => { CLIPBOARD = fieldsRef.current.filter((f) => selRef.current.includes(f.id)).map((f) => ({ ...f })); pasteCount = 0; if (CLIPBOARD.length) toast?.(`Copied ${CLIPBOARD.length} field${CLIPBOARD.length > 1 ? 's' : ''}`, 'info'); };
  const pasteFrom = (src: Field[], offsetMode: 'paste' | 'dup') => {
    if (!src.length) return;
    const target = offsetMode === 'dup' ? { docId: src[0].docId, page: src[0].page } : curRef.current;
    const samePlace = src.every((f) => f.docId === target.docId && f.page === target.page);
    if (offsetMode === 'paste') pasteCount++;
    const off = offsetMode === 'dup' ? 14 : samePlace ? 14 * pasteCount : 0;
    const groupMap: Record<string, string> = {};
    const out = cloneFields(src, (f) => {
      const dims = pageDims(target.docId, target.page);
      const rid = recipients.some((r) => r.id === f.recipientId) ? f.recipientId : activeRid;
      let group = f.group;
      if (f.type === 'radio' && f.group) group = groupMap[f.group] ||= `${f.group.replace(/ copy( \d+)?$/, '')} copy ${Math.floor(Math.random() * 90 + 10)}`;
      return { docId: target.docId, page: target.page, x: Math.min(dims.w - f.w, f.x + off), y: Math.min(dims.h - f.h, f.y + off), recipientId: rid, locked: undefined, filledAt: undefined, group, label: f.label ? f.label.replace(/( copy)?$/, ' copy') : f.label };
    });
    commit([...fieldsRef.current, ...out]);
    setSel(out.map((f) => f.id));
  };
  const align = (how: 'left' | 'top' | 'right' | 'bottom' | 'center' | 'middle' | 'width' | 'height') => {
    const s = fieldsRef.current.filter((f) => selRef.current.includes(f.id) && !f.locked);
    if (s.length < 2) return;
    const minX = Math.min(...s.map((f) => f.x)), minY = Math.min(...s.map((f) => f.y)), maxR = Math.max(...s.map((f) => f.x + f.w)), maxB = Math.max(...s.map((f) => f.y + f.h));
    const first = s[0];
    patchFields(s.map((f) => f.id), (f) => {
      switch (how) {
        case 'left': return { x: minX }; case 'top': return { y: minY }; case 'right': return { x: maxR - f.w }; case 'bottom': return { y: maxB - f.h };
        case 'center': return { x: Math.round((minX + maxR) / 2 - f.w / 2) }; case 'middle': return { y: Math.round((minY + maxB) / 2 - f.h / 2) };
        case 'width': return { w: first.w }; case 'height': return { h: first.h };
      }
    });
  };

  /* ── keyboard ── */
  const keyRef = React.useRef<(e: KeyboardEvent) => void>(() => {});
  const nudgeAt = React.useRef(0);
  keyRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (document.querySelector('[role="dialog"]')) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 'c') { if (selRef.current.length) { e.preventDefault(); copySel(); } return; }
    if (mod && k === 'x') { if (selRef.current.length) { e.preventDefault(); copySel(); deleteSel(); } return; }
    if (mod && k === 'v') { if (CLIPBOARD.length) { e.preventDefault(); pasteFrom(CLIPBOARD, 'paste'); } return; }
    if (mod && k === 'd') { e.preventDefault(); pasteFrom(fieldsRef.current.filter((f) => selRef.current.includes(f.id)), 'dup'); return; }
    if (mod && k === 'a') { e.preventDefault(); setSel(fieldsRef.current.filter((f) => f.docId === curRef.current.docId && f.page === curRef.current.page).map((f) => f.id)); return; }
    if (k === 'delete' || k === 'backspace') { if (selRef.current.length) { e.preventDefault(); deleteSel(); } return; }
    if (k === 'escape') { setArmed(null); setSel([]); return; }
    if (k.startsWith('arrow') && selRef.current.length) {
      e.preventDefault();
      const d = e.shiftKey ? 10 : 1;
      const dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0;
      const coalesce = Date.now() - nudgeAt.current < 600;
      patchFields(selRef.current, (f) => { const dims = pageDims(f.docId, f.page); return { x: Math.max(0, Math.min(dims.w - f.w, f.x + dx)), y: Math.max(0, Math.min(dims.h - f.h, f.y + dy)) }; }, !coalesce);
      nudgeAt.current = Date.now();
    }
  };
  React.useEffect(() => { const h = (e: KeyboardEvent) => keyRef.current(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  /* ── pointer interactions ── */
  const pageKeyFromPoint = (x: number, y: number) => { const el = document.elementFromPoint(x, y)?.closest('[data-page]') as HTMLElement | null; return el ? { el, docId: el.dataset.doc!, page: Number(el.dataset.pageIndex) } : null; };
  const onMove = (e: PointerEvent) => {
    const d = drag.current; if (!d || !d.kind) return;
    const z = zoomRef.current;
    const dx = (e.clientX - d.sx) / z, dy = (e.clientY - d.sy) / z;
    if (d.kind === 'marquee') {
      const r = d.pageEl.getBoundingClientRect();
      const x1 = (d.sx - r.left) / z, y1 = (d.sy - r.top) / z, x2 = (e.clientX - r.left) / z, y2 = (e.clientY - r.top) / z;
      if (Math.abs(x2 - x1) + Math.abs(y2 - y1) > 4) d.moved = true;
      setMarquee({ key: d.key, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) });
      return;
    }
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 2 / z) return;
    if (!d.moved) { snapshot(); d.moved = true; }
    const single = d.ids.length === 1;
    const next = fieldsRef.current.map((f) => {
      const o = d.orig[f.id]; if (!o) return f;
      const dims = pageDims(f.docId, f.page);
      if (d.kind === 'move') {
        let x = Math.round(o.x + dx), y = Math.round(o.y + dy);
        // a single field may travel to another page (clamped on drop); groups stay on their page
        if (!single) { x = Math.max(0, Math.min(dims.w - f.w, x)); y = Math.max(0, Math.min(dims.h - f.h, y)); }
        return { ...f, x, y };
      }
      const minW = f.type === 'checkbox' || f.type === 'radio' ? 10 : 24, minH = f.type === 'checkbox' || f.type === 'radio' ? 10 : 14;
      let w = o.w, h = o.h;
      if (d.dir.includes('e')) w = Math.max(minW, Math.min(dims.w - f.x, Math.round(o.w + dx)));
      if (d.dir.includes('s')) h = Math.max(minH, Math.min(dims.h - f.y, Math.round(o.h + dy)));
      if ((f.type === 'checkbox' || f.type === 'radio') && d.dir === 'se') { const s = Math.max(w, h); w = h = s; }
      return { ...f, w, h };
    });
    fieldsRef.current = next; setFieldsState(next);
  };
  const onUp = (e: PointerEvent) => {
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (d.kind === 'marquee') {
      const m = marqueeRef.current; setMarquee(null);
      if (!d.moved || !m) { if (!d.additive) setSel([]); return; }
      const hit = fieldsRef.current.filter((f) => `${f.docId}:${f.page}` === d.key && f.x < m.x + m.w && f.x + f.w > m.x && f.y < m.y + m.h && f.y + f.h > m.y).map((f) => f.id);
      setSel(d.additive ? [...new Set([...selRef.current, ...hit])] : hit);
      return;
    }
    if (!d.moved) return;
    // single-field drop onto another page
    if (d.kind === 'move' && d.ids.length === 1) {
      const f = fieldsRef.current.find((x) => x.id === d.ids[0]);
      const hitPage = pageKeyFromPoint(e.clientX, e.clientY);
      if (f && hitPage) {
        const z = zoomRef.current; const r = hitPage.el.getBoundingClientRect(); const dims = pageDims(hitPage.docId, hitPage.page);
        const x = Math.round(Math.max(0, Math.min(dims.w - f.w, (e.clientX - r.left) / z - d.grabX))), y = Math.round(Math.max(0, Math.min(dims.h - f.h, (e.clientY - r.top) / z - d.grabY)));
        const next = fieldsRef.current.map((x0) => (x0.id === f.id ? { ...x0, docId: hitPage.docId, page: hitPage.page, x, y } : x0));
        fieldsRef.current = next; setFieldsState(next);
      } else if (f) {
        const dims = pageDims(f.docId, f.page);
        const next = fieldsRef.current.map((x0) => (x0.id === f.id ? { ...x0, x: Math.max(0, Math.min(dims.w - f.w, f.x)), y: Math.max(0, Math.min(dims.h - f.h, f.y)) } : x0));
        fieldsRef.current = next; setFieldsState(next);
      }
    }
    commit(fieldsRef.current, false);
  };
  const marqueeRef = React.useRef(marquee); marqueeRef.current = marquee;
  const startDrag = (state: any) => { drag.current = state; window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); };

  const onFieldDown = (e: React.PointerEvent, f: Field) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let next = selRef.current;
    if (additive) next = next.includes(f.id) ? next.filter((x) => x !== f.id) : [...next, f.id];
    else if (!next.includes(f.id)) next = [f.id];
    setSel(next); selRef.current = next;
    if (f.recipientId && recipients.some((r) => r.id === f.recipientId)) setActiveRid(f.recipientId);
    if (f.locked || !next.includes(f.id)) return;
    const z = zoomRef.current; const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const orig: any = {}; fieldsRef.current.filter((x) => next.includes(x.id) && !x.locked).forEach((x) => { orig[x.id] = { x: x.x, y: x.y }; });
    startDrag({ kind: 'move', sx: e.clientX, sy: e.clientY, orig, ids: Object.keys(orig), moved: false, grabX: (e.clientX - box.left) / z, grabY: (e.clientY - box.top) / z });
  };
  const onHandleDown = (e: React.PointerEvent, f: Field, dir: string) => {
    e.stopPropagation(); e.preventDefault();
    if (f.locked) return;
    startDrag({ kind: 'resize', dir, sx: e.clientX, sy: e.clientY, orig: { [f.id]: { w: f.w, h: f.h } }, ids: [f.id], moved: false });
  };
  const onPageDown = (e: React.PointerEvent, docId: string, page: number) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement; const r = el.getBoundingClientRect(); const z = zoomRef.current;
    if (armed) { placeAt(armed, docId, page, (e.clientX - r.left) / z, (e.clientY - r.top) / z); if (!e.shiftKey) setArmed(null); return; }
    e.preventDefault();
    startDrag({ kind: 'marquee', key: `${docId}:${page}`, pageEl: el, sx: e.clientX, sy: e.clientY, moved: false, additive: e.shiftKey || e.metaKey || e.ctrlKey });
  };
  const onDrop = (e: React.DragEvent, docId: string, page: number) => {
    const raw = e.dataTransfer.getData('text/x-qh-field'); if (!raw) return;
    e.preventDefault();
    try { const spec = JSON.parse(raw); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); placeAt(spec, docId, page, (e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom); } catch { /* ignore */ }
  };

  /* ── page tracking for "Page X of Y", paste target and thumbnails ── */
  const allPages = documents.flatMap((d) => d.pages.map((_pg, i) => ({ docId: d.id, page: i })));
  const pageIndex = Math.max(0, allPages.findIndex((x) => x.docId === cur.docId && x.page === cur.page));
  const onScroll = () => {
    const c = canvasRef.current; if (!c) return;
    const mid = c.getBoundingClientRect().top + c.clientHeight * 0.35;
    let best: any = null;
    c.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => { const r = el.getBoundingClientRect(); if (r.top <= mid && r.bottom >= mid - 40) best = el; else if (!best && r.top > mid) best = best || el; });
    if (best) { const k = { docId: best.dataset.doc!, page: Number(best.dataset.pageIndex) }; if (k.docId !== curRef.current.docId || k.page !== curRef.current.page) setCur(k); }
  };
  const goPage = (docId: string, page: number) => {
    const el = canvasRef.current?.querySelector<HTMLElement>(`[data-page="${docId}:${page}"]`);
    if (el && canvasRef.current) canvasRef.current.scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' });
    setCur({ docId, page });
  };
  const fitWidth = () => { const c = canvasRef.current; if (!c) return; setZoom(Math.max(0.4, Math.min(2, +((c.clientWidth - 80) / 680).toFixed(2)))); };
  React.useEffect(() => { if (width < 900) fitWidth(); }, []);

  /* ── palette ── */
  const activeRec = recOf(activeRid);
  const color = activeRec?.color || '#8E8E93';
  const q = paletteQ.trim().toLowerCase();
  const paletteItem = (spec: NonNullable<Armed>, label: string, icon: string, badge?: string) => {
    if (q && !label.toLowerCase().includes(q)) return null;
    const on = armed?.type === spec.type && armed?.mergeKey === spec.mergeKey;
    return <Hover key={label + (spec.mergeKey || '')} as="button" type="button" draggable data-palette={spec.mergeKey || spec.type}
      onDragStart={(e: React.DragEvent) => { e.dataTransfer.setData('text/x-qh-field', JSON.stringify(spec)); e.dataTransfer.effectAllowed = 'copy'; }}
      onClick={() => setArmed(on ? null : spec)} title={`Click, then click the page — or drag onto the page`}
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', height: 32, padding: '0 9px', borderRadius: 8, border: `1px solid ${on ? color : 'transparent'}`, background: on ? hexA(color, 0.1) : 'transparent', cursor: 'grab', color: T.text, fontSize: 12.5, fontWeight: 550, textAlign: 'left', fontFamily: 'inherit' }}
      hover={{ background: on ? hexA(color, 0.14) : 'rgba(0,0,0,0.04)' }}>
      <span style={{ width: 22, height: 22, borderRadius: 6, background: hexA(color, 0.14), color, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name={icon} size={13} /></span>
      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {badge && <span style={{ fontSize: 9.5, fontWeight: 700, color: T.faint, letterSpacing: '0.04em' }}>{badge}</span>}
    </Hover>;
  };

  const palette = <div style={{ width: 228, flex: 'none', borderRight: `1px solid ${T.hair}`, background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <div style={{ padding: '12px 12px 8px', borderBottom: `1px solid ${T.hair}` }}>
      <Label style={{ marginBottom: 6 }}>Fields for</Label>
      <Dropdown width={240} trigger={<Hover as="button" type="button" data-testid="recipient-picker" style={{ display: 'flex', alignItems: 'center', gap: 8, width: 204, height: 36, padding: '0 10px', borderRadius: 10, border: `1px solid ${hexA(color, 0.5)}`, background: hexA(color, 0.07), cursor: 'pointer', fontFamily: 'inherit' }} hover={{ background: hexA(color, 0.12) }}>
        <span style={{ width: 10, height: 10, borderRadius: 99, background: color, flex: 'none' }} />
        <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: T.text }}>{fieldable.length ? recName(activeRec) : 'No signers yet'}</span>
        <Icon name="chevronDown" size={14} style={{ color: T.faint }} />
      </Hover>}>
        {(close: any) => <>{fieldable.map((r) => <MenuItem key={r.id} label={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: 99, background: r.color }} />{recName(r)}</span>} hint={r.roleName && r.name ? r.roleName : undefined} checked={r.id === activeRid} onClick={() => { setActiveRid(r.id); if (selRef.current.length) patchFields(selRef.current, (f) => (f.type === 'radio' && f.group ? {} : { recipientId: r.id })); close(); }} />)}
          {!fieldable.length && <div style={{ padding: 10, fontSize: 12.5, color: T.faint }}>Go back and add a recipient who needs to sign.</div>}</>}
      </Dropdown>
      <div style={{ position: 'relative', marginTop: 8 }}>
        <span style={{ position: 'absolute', left: 9, top: 8, color: T.faint }}><Icon name="search" size={14} /></span>
        <input value={paletteQ} onChange={(e) => setPaletteQ(e.target.value)} placeholder="Find a field" aria-label="Find a field" style={{ ...inputStyle, height: 30, fontSize: 12.5, paddingLeft: 28, borderRadius: 8 }} />
      </div>
    </div>
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 16px' }}>
      {FIELD_GROUPS.map((g) => {
        const items = (Object.keys(FIELD_DEFS) as FieldType[]).filter((t) => FIELD_DEFS[t].group === g).map((t) => paletteItem({ type: t }, FIELD_DEFS[t].label, FIELD_DEFS[t].icon, FIELD_DEFS[t].phase2 ? 'BETA' : undefined)).filter(Boolean);
        if (!items.length) return null;
        return <div key={g} style={{ marginBottom: 10 }}><Label style={{ margin: '8px 4px 4px' }}>{g === 'Recipient' ? 'Recipient info' : g}</Label>{items}</div>;
      })}
      {(() => { const items = MERGE_FIELDS.map((m) => paletteItem({ type: 'text', mergeKey: m.key }, m.label, 'zap')).filter(Boolean); return items.length ? <div><Label style={{ margin: '8px 4px 4px' }}>QuickHire driver data</Label>{items}</div> : null; })()}
    </div>
    <div style={{ padding: '10px 12px', borderTop: `1px solid ${T.hair}`, fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>Drag a field onto the page, or click it and then click where it goes. Hold <Kbd>Shift</Kbd> to place several.</div>
  </div>;

  /* ── toolbar ── */
  const n = sel.length;
  const toolbar = <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 2, padding: '6px 12px', background: '#fff', borderBottom: `1px solid ${T.hair}`, overflowX: 'auto' }}>
    <IconButton icon="undo" title="Undo (Ctrl/⌘ Z)" disabled={!past.current.length} onClick={undo} />
    <IconButton icon="redo" title="Redo (Ctrl/⌘ Shift Z)" disabled={!future.current.length} onClick={redo} />
    <Sep />
    <IconButton icon="copy" title="Copy (Ctrl/⌘ C)" disabled={!n} onClick={copySel} />
    <IconButton icon="clipboard" title="Paste (Ctrl/⌘ V)" disabled={!CLIPBOARD.length} onClick={() => pasteFrom(CLIPBOARD, 'paste')} />
    <IconButton icon="layers" title="Duplicate (Ctrl/⌘ D)" disabled={!n} onClick={() => pasteFrom(selected, 'dup')} />
    <IconButton icon="trash" title="Delete (Del)" disabled={!n} onClick={deleteSel} />
    <Sep />
    <IconButton icon="alignLeft" title="Align left" disabled={n < 2} onClick={() => align('left')} />
    <IconButton icon="alignTop" title="Align top" disabled={n < 2} onClick={() => align('top')} />
    <Dropdown width={200} trigger={<IconButton icon="more" title="More alignment" disabled={n < 2} />}>
      {(close: any) => <>{([['right', 'Align right'], ['bottom', 'Align bottom'], ['center', 'Center horizontally'], ['middle', 'Center vertically'], ['width', 'Match width'], ['height', 'Match height']] as const).map(([k, l]) => <MenuItem key={k} label={l} disabled={n < 2} onClick={() => { align(k); close(); }} />)}</>}
    </Dropdown>
    <div style={{ flex: 1 }} />
    {armed && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color, fontWeight: 650, marginRight: 8, whiteSpace: 'nowrap' }}><Icon name="target" size={14} />Click the page to place {armed.mergeKey ? mergeLabel(armed.mergeKey) : FIELD_DEFS[armed.type].label}<button type="button" onClick={() => setArmed(null)} style={{ border: 'none', background: 'transparent', color: T.faint, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Cancel</button></span>}
    <IconButton icon="chevronLeft" title="Previous page" disabled={pageIndex <= 0} onClick={() => { const pg = allPages[pageIndex - 1]; if (pg) goPage(pg.docId, pg.page); }} />
    <span style={{ fontSize: 12, color: T.muted, whiteSpace: 'nowrap', minWidth: 70, textAlign: 'center' }} data-testid="page-indicator">Page {pageIndex + 1} of {allPages.length}</span>
    <IconButton icon="chevronRight" title="Next page" disabled={pageIndex >= allPages.length - 1} onClick={() => { const pg = allPages[pageIndex + 1]; if (pg) goPage(pg.docId, pg.page); }} />
    <Sep />
    <IconButton icon="zoomOut" title="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} />
    <button type="button" onClick={() => setZoom(1)} title="Reset zoom" style={{ border: 'none', background: 'transparent', fontSize: 12, color: T.muted, width: 44, cursor: 'pointer', fontFamily: 'inherit' }}>{Math.round(zoom * 100)}%</button>
    <IconButton icon="zoomIn" title="Zoom in" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))} />
    <IconButton icon="maximize" title="Fit to width" onClick={fitWidth} />
    <Dropdown width={250} align="right" trigger={<IconButton icon="help" title="Keyboard shortcuts" />}>
      <div style={{ padding: '6px 8px', fontSize: 12.5, color: T.muted, display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 10px' }}>
        {[['Copy / Paste', '⌘/Ctrl C · V'], ['Duplicate', '⌘/Ctrl D'], ['Undo / Redo', '⌘/Ctrl Z · ⇧Z'], ['Select all on page', '⌘/Ctrl A'], ['Delete', 'Del'], ['Nudge (10px)', 'Arrows (+⇧)'], ['Multi-select', '⇧ click / drag box'], ['Move to another page', 'drag across']].map(([a, b]) => <React.Fragment key={a}><span>{a}</span><span style={{ fontWeight: 600, color: T.text }}>{b}</span></React.Fragment>)}
      </div>
    </Dropdown>
  </div>;

  /* ── canvas ── */
  const canvas = <div ref={canvasRef} onScroll={onScroll} className="qh-esign-scroll" style={{ flex: 1, minWidth: 0, overflow: 'auto', background: '#ECEEF1', position: 'relative' }} data-testid="editor-canvas">
    <div style={{ padding: '22px 28px 120px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, minWidth: 680 * zoom + 56 }}>
      {documents.map((doc, di) => <React.Fragment key={doc.id}>
        <div style={{ width: 680 * zoom, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.muted, fontWeight: 600, marginTop: di ? 14 : 0 }}><Icon name="fileText" size={14} />{doc.name}<span style={{ color: T.faint, fontWeight: 500 }}>· {doc.pages.length} page{doc.pages.length === 1 ? '' : 's'}</span></div>
        {doc.pages.map((pg, pi) => {
          const key = `${doc.id}:${pi}`;
          const pageFields = fields.filter((f) => f.docId === doc.id && f.page === pi);
          return <div key={key} data-page={key} data-doc={doc.id} data-page-index={pi}
            onPointerDown={(e) => onPageDown(e, doc.id, pi)} onDragOver={(e) => { if (e.dataTransfer.types.includes('text/x-qh-field')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }} onDrop={(e) => onDrop(e, doc.id, pi)}
            style={{ position: 'relative', width: pg.w * zoom, height: pg.h * zoom, flex: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)', borderRadius: 2, cursor: armed ? 'crosshair' : 'default', touchAction: 'none' }}>
            <PageImage doc={doc} page={pi} eager={di === 0 && pi < 2} />
            {pageFields.map((f) => <FieldBox key={f.id} f={f} z={zoom} rec={recOf(f.recipientId)} selected={sel.includes(f.id)} single={sel.length === 1} fields={fields} onDown={onFieldDown} onHandle={onHandleDown} />)}
            {marquee && marquee.key === key && <div style={{ position: 'absolute', left: marquee.x * zoom, top: marquee.y * zoom, width: marquee.w * zoom, height: marquee.h * zoom, border: '1px solid #007AFF', background: 'rgba(0,122,255,0.08)', pointerEvents: 'none' }} />}
            <div style={{ position: 'absolute', right: -34, top: 0, fontSize: 10.5, color: T.faint, width: 28, textAlign: 'left' }}>{pi + 1}</div>
          </div>;
        })}
      </React.Fragment>)}
      {!documents.length && <div style={{ padding: 60, color: T.faint, fontSize: 13 }}>Add a document first.</div>}
    </div>
  </div>;

  /* ── property edits (radio/checkbox groups share some settings) ── */
  const patchOne = (f: Field, patch: Partial<Field>, history: boolean) => {
    const all = fieldsRef.current;
    if (f.type === 'radio' && f.group) {
      const grp = all.filter((x) => x.type === 'radio' && x.group === f.group).map((x) => x.id);
      if ('recipientId' in patch || 'required' in patch || 'group' in patch || 'conditional' in patch) { patchFields(grp, patch, history); return; }
      if ('value' in patch && patch.value) { commit(all.map((x) => (grp.includes(x.id) ? { ...x, value: x.id === f.id ? 'on' : '' } : x)), history); return; }
    }
    if (f.type === 'checkbox' && f.group && ('groupMin' in patch || 'groupMax' in patch)) { patchFields(all.filter((x) => x.type === 'checkbox' && x.group === f.group).map((x) => x.id), patch, history); return; }
    patchFields([f.id], patch, history);
  };

  /* ── right side: properties or thumbnails ── */
  const side = sel.length === 1 && selected[0]
    ? <FieldProps key={selected[0].id} f={selected[0]} fields={fields} recipients={fieldable} documents={documents} mergeData={p.mergeData}
      onPatch={(patch, history = true) => patchOne(selected[0], patch, history)}
      onBeginEdit={snapshot}
      onAddRadio={() => { const f = selected[0]; const grp = fields.filter((x) => x.type === 'radio' && x.group === f.group); const last = grp.reduce((a, b) => (b.y > a.y ? b : a), f); const nf: Field = { ...last, id: uid('f'), y: Math.min(pageDims(last.docId, last.page).h - last.h, last.y + 26), optionValue: `Option ${grp.length + 1}`, label: `${f.group} · Option ${grp.length + 1}`, value: '' }; commit([...fields, nf]); setSel([nf.id]); }}
      onDuplicate={() => pasteFrom(selected, 'dup')} onDelete={deleteSel} onClose={() => setSel([])} />
    : sel.length > 1 ? <MultiProps selected={selected} recipients={fieldable} onPatch={(patch: Partial<Field>) => patchFields(sel, patch)} onAlign={align} onDelete={deleteSel} onGroup={(name: string) => patchFields(sel.filter((id) => fields.find((f) => f.id === id)?.type === 'checkbox'), { group: name })} onClose={() => setSel([])} />
      : <PagesPanel documents={documents} fields={fields} cur={cur} onGo={goPage} />;

  const banner = p.issues && p.issues.length > 0 && <div role="alert" style={{ flex: 'none', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px', background: '#FFF4F3', borderBottom: '1px solid rgba(255,59,48,0.22)', color: '#B3261E', fontSize: 12.5 }}>
    <Icon name="alert" size={16} style={{ marginTop: 1 }} /><div style={{ flex: 1 }}><b>Fix these before sending:</b> {p.issues.join(' · ')}</div>
    {p.onDismissIssues && <IconButton icon="x" title="Dismiss" onClick={p.onDismissIssues} size={26} />}
  </div>;

  return <div style={{ position: 'fixed', inset: 0, zIndex: 85, background: '#F5F6F8', display: 'flex', flexDirection: 'column' }} data-testid="field-editor">
    <header style={{ height: 56, flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', background: '#fff', borderBottom: `1px solid ${T.hair}` }}>
      <Btn kind="plain" icon="arrowLeft" onClick={() => { flush(); p.onBack(); }} style={{ color: T.text, padding: '0 10px' }}>{p.backLabel || 'Back'}</Btn>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
        <div style={{ fontSize: 11.5, color: T.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.subtitle || `${documents.length} document${documents.length === 1 ? '' : 's'} · ${fields.length} field${fields.length === 1 ? '' : 's'}`}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>{recipients.slice(0, 5).map((r) => <span key={r.id} title={`${recName(r)} · ${fields.filter((f) => f.recipientId === r.id).length} fields`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 8px', borderRadius: 999, background: hexA(r.color, 0.1), color: r.color, fontSize: 11.5, fontWeight: 650, maxWidth: 140, overflow: 'hidden', whiteSpace: 'nowrap' }}><span style={{ width: 7, height: 7, borderRadius: 9, background: r.color, flex: 'none' }} />{width > 1280 ? recName(r) : fields.filter((f) => f.recipientId === r.id).length}</span>)}</div>
      {p.secondary}
      <Btn kind="primary" icon={p.primary.icon} onClick={() => { flush(); p.primary.onClick(); }} data-testid="editor-primary">{p.primary.label}</Btn>
    </header>
    {banner}
    {mode === 'correct' && <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'rgba(255,159,10,0.1)', borderBottom: '1px solid rgba(255,159,10,0.25)', fontSize: 12.5, color: '#8E5A00' }}><Icon name="lock" size={14} />Correcting a sent envelope. Fields of recipients who already signed are locked.</div>}
    {toolbar}
    <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
      {palette}
      {canvas}
      {narrow ? (sel.length > 0 && <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 300, background: '#fff', borderLeft: `1px solid ${T.hair}`, boxShadow: '-8px 0 30px rgba(0,0,0,0.12)', overflowY: 'auto', zIndex: 3 }}>{side}</div>)
        : <div style={{ width: 300, flex: 'none', borderLeft: `1px solid ${T.hair}`, background: '#fff', overflowY: 'auto' }}>{side}</div>}
    </div>
  </div>;
}

function Sep() { return <span style={{ width: 1, height: 20, background: T.hair, margin: '0 6px', flex: 'none' }} />; }

/* ───────────────────────── field box on the canvas ───────────────────────── */
function FieldBox({ f, z, rec, selected, single, fields, onDown, onHandle }: { f: Field; z: number; rec?: EditorRecipient; selected: boolean; single: boolean; fields: Field[]; onDown: (e: React.PointerEvent, f: Field) => void; onHandle: (e: React.PointerEvent, f: Field, dir: string) => void }) {
  const c = f.locked ? '#8E8E93' : rec?.color || '#8E8E93';
  const def = FIELD_DEFS[f.type];
  const tiny = f.type === 'checkbox' || f.type === 'radio';
  const fs = Math.max(7, (f.type === 'note' ? 10.5 : f.fontSize || 11) * z * 0.92);
  let face: React.ReactNode;
  if (tiny) face = f.type === 'radio' ? <span style={{ width: '70%', height: '70%', borderRadius: 99, border: `1.5px solid ${c}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{f.value ? <span style={{ width: '45%', height: '45%', borderRadius: 99, background: c }} /> : null}</span>
    : <span style={{ width: '72%', height: '72%', borderRadius: 3, border: `1.5px solid ${c}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c }}>{f.value ? <Icon name="check" size={Math.max(8, f.w * z * 0.6)} /> : null}</span>;
  else {
    const text = f.mergeKey ? (f.value || `{${mergeLabel(f.mergeKey)}}`)
      : f.type === 'note' ? (f.value || 'Note for the signer')
        : f.type === 'formula' ? `ƒx ${f.formula || 'Formula'}`
          : ['text', 'number', 'date', 'company', 'title'].includes(f.type) ? (f.value || f.label || def.label)
            : f.type === 'dropdown' ? (f.value || f.label || 'Dropdown')
              : f.type === 'signature' ? 'Sign' : f.type === 'initial' ? 'Initial' : def.label;
    const showIcon = f.h * z >= 16 && f.w * z >= 50;
    face = <>
      {showIcon && <Icon name={f.mergeKey ? 'zap' : def.icon} size={Math.min(14, Math.max(9, f.h * z * 0.45))} style={{ color: c, opacity: 0.9 }} />}
      <span style={{ flex: 1, minWidth: 0, whiteSpace: f.type === 'note' ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: fs, lineHeight: 1.2, fontWeight: f.type === 'signature' || f.type === 'initial' ? 700 : 550, color: f.mergeKey && f.value ? '#1D1D1F' : '#3A3A3C' }}>{text}</span>
      {f.type === 'dropdown' && <Icon name="chevronDown" size={10} style={{ color: c }} />}
    </>;
  }
  return <div data-field-id={f.id} data-field-type={f.type} onPointerDown={(e) => onDown(e, f)} title={`${def.label}${f.label ? ' — ' + f.label : ''}${rec ? ' · ' + recName(rec) : ''}${f.locked ? ' (locked)' : ''}`}
    style={{ position: 'absolute', left: f.x * z, top: f.y * z, width: f.w * z, height: f.h * z, boxSizing: 'border-box', borderRadius: tiny ? 3 : 4, border: `${selected ? 2 : 1}px ${f.conditional ? 'dashed' : 'solid'} ${selected ? c : hexA(c, 0.75)}`, background: f.locked ? 'linear-gradient(rgba(142,142,147,0.18),rgba(142,142,147,0.18)), rgba(255,255,255,0.94)' : `linear-gradient(${hexA(c, selected ? 0.22 : 0.15)},${hexA(c, selected ? 0.22 : 0.15)}), rgba(255,255,255,0.94)`, display: 'flex', alignItems: f.type === 'note' ? 'flex-start' : 'center', justifyContent: tiny ? 'center' : 'flex-start', gap: 4, padding: tiny ? 0 : `${f.type === 'note' ? 3 : 0}px ${Math.max(2, 5 * z)}px`, cursor: f.locked ? 'not-allowed' : 'move', userSelect: 'none', boxShadow: selected ? `0 0 0 3px ${hexA(c, 0.18)}` : 'none', touchAction: 'none', zIndex: selected ? 2 : 1 }}>
    {face}
    {f.required && !tiny && <span style={{ position: 'absolute', top: -1, right: 2, color: '#E5372C', fontSize: Math.max(9, 11 * z), fontWeight: 700, lineHeight: 1 }}>*</span>}
    {f.conditional && <span title="Conditional field" style={{ position: 'absolute', top: -9, left: -9, width: 16, height: 16, borderRadius: 99, background: '#fff', border: `1px solid ${c}`, color: c, fontSize: 8.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>if</span>}
    {f.locked && <span style={{ position: 'absolute', top: -8, right: -8, width: 16, height: 16, borderRadius: 99, background: '#8E8E93', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="lock" size={9} /></span>}
    {selected && single && !f.locked && <>
      <span onPointerDown={(e) => onHandle(e, f, 'e')} style={{ ...handle, right: -5, top: '50%', marginTop: -5, cursor: 'ew-resize', borderColor: c }} />
      <span onPointerDown={(e) => onHandle(e, f, 's')} style={{ ...handle, bottom: -5, left: '50%', marginLeft: -5, cursor: 'ns-resize', borderColor: c }} />
      <span onPointerDown={(e) => onHandle(e, f, 'se')} data-handle="se" style={{ ...handle, right: -5, bottom: -5, cursor: 'nwse-resize', borderColor: c }} />
    </>}
  </div>;
}
const handle: React.CSSProperties = { position: 'absolute', width: 10, height: 10, borderRadius: 3, background: '#fff', border: '2px solid', boxSizing: 'border-box', touchAction: 'none' };

/* ───────────────────────── properties panel ───────────────────────── */
const mini: React.CSSProperties = { ...inputStyle, height: 32, fontSize: 12.5, borderRadius: 8, padding: '0 9px' };
function Row({ label, children, hint }: any) { return <div style={{ marginBottom: 10 }}><div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600, marginBottom: 4 }}>{label}</div>{children}{hint && <div style={{ fontSize: 11, color: T.faint, marginTop: 3, lineHeight: 1.4 }}>{hint}</div>}</div>; }
function ToggleRow({ label, on, onChange, disabled, hint }: any) { return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0' }}><span style={{ fontSize: 12.5, color: T.text }}>{label}{hint && <span style={{ display: 'block', fontSize: 11, color: T.faint }}>{hint}</span>}</span><Toggle on={on} onChange={onChange} disabled={disabled} label={label} /></div>; }
function Section({ title, children, first }: any) { return <div style={{ padding: '12px 14px', borderTop: first ? 'none' : `1px solid ${T.hair}` }}><Label>{title}</Label>{children}</div>; }

function TextProp({ value, onChange, onBeginEdit, placeholder, area, disabled, testId }: any) {
  const common = { value: value ?? '', disabled, placeholder, onFocus: onBeginEdit, onChange: (e: any) => onChange(e.target.value), 'data-testid': testId };
  return area ? <textarea {...common} rows={3} style={{ ...mini, height: 'auto', padding: 8, resize: 'vertical', lineHeight: 1.45 }} /> : <input {...common} style={mini} />;
}
function NumProp({ value, onChange, onBeginEdit, disabled, placeholder }: any) {
  return <input type="number" value={value ?? ''} placeholder={placeholder} disabled={disabled} onFocus={onBeginEdit} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} style={mini} />;
}

function FieldProps({ f, fields, recipients, documents, mergeData, onPatch, onBeginEdit, onAddRadio, onDuplicate, onDelete, onClose }: { f: Field; fields: Field[]; recipients: EditorRecipient[]; documents: EDoc[]; mergeData?: Record<string, string>; onPatch: (p: Partial<Field>, history?: boolean) => void; onBeginEdit: () => void; onAddRadio: () => void; onDuplicate: () => void; onDelete: () => void; onClose: () => void }) {
  const def = FIELD_DEFS[f.type];
  const locked = !!f.locked;
  const live = (patch: Partial<Field>) => onPatch(patch, false); // text edits: snapshot taken on focus
  const rec = recipients.find((r) => r.id === f.recipientId);
  const textual = ['text', 'number', 'date', 'company', 'title', 'dropdown', 'formula', 'fullName', 'firstName', 'lastName', 'email', 'dateSigned'].includes(f.type);
  const group = f.group ? fields.filter((x) => x.type === f.type && x.group === f.group) : [];
  const parents = fields.filter((x) => x.id !== f.id && ['checkbox', 'radio', 'dropdown', 'text', 'number', 'date'].includes(x.type) && !(x.type === 'radio' && x.group && x.group === f.group) && x.conditional?.fieldId !== f.id);
  const dedupParents = parents.filter((x, i) => x.type !== 'radio' || parents.findIndex((y) => y.type === 'radio' && y.group === x.group) === i);
  const parent = f.conditional ? fields.find((x) => x.id === f.conditional!.fieldId) : undefined;
  const ops: { value: CondOp; label: string }[] = parent?.type === 'checkbox' ? [{ value: 'checked', label: 'is checked' }, { value: 'unchecked', label: 'is unchecked' }] : parent?.type === 'radio' || parent?.type === 'dropdown' ? [{ value: 'equals', label: 'is' }, { value: 'notEmpty', label: 'has any value' }] : [{ value: 'equals', label: 'equals' }, { value: 'notEmpty', label: 'is not empty' }];
  const parentOptions = parent?.type === 'radio' ? fields.filter((x) => x.type === 'radio' && x.group === parent.group).map((x) => x.optionValue || '') : parent?.type === 'dropdown' ? parent.options || [] : null;
  const docName = documents.find((d) => d.id === f.docId)?.name || '';
  const formulaPreview = f.type === 'formula' && f.formula ? evalFormula(f.formula, numericByLabel(fields, Object.fromEntries(fields.map((x) => [x.id, x.value])))) : null;

  return <div data-testid="field-props">
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', borderBottom: `1px solid ${T.hair}` }}>
      <span style={{ width: 28, height: 28, borderRadius: 8, background: hexA(rec?.color || '#8E8E93', 0.14), color: rec?.color || '#8E8E93', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={f.mergeKey ? 'zap' : def.icon} size={15} /></span>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{f.mergeKey ? 'Driver data' : def.label}</div><div style={{ fontSize: 11, color: T.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{docName} · page {f.page + 1}</div></div>
      <IconButton icon="layers" title="Duplicate" onClick={onDuplicate} disabled={locked} />
      <IconButton icon="trash" title="Delete" onClick={onDelete} disabled={locked} />
      <IconButton icon="x" title="Close" onClick={onClose} />
    </div>
    {locked && <div style={{ margin: '10px 14px 0', padding: '8px 10px', borderRadius: 8, background: '#F2F2F7', fontSize: 12, color: T.muted, display: 'flex', gap: 7 }}><Icon name="lock" size={13} />Already signed — this field can't be changed.</div>}
    <fieldset disabled={locked} style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
      <Section title="Recipient" first>
        <Select value={f.recipientId} onChange={(v: string) => onPatch({ recipientId: v })} options={recipients.length ? recipients.map((r) => ({ value: r.id, label: recName(r) })) : [{ value: '', label: 'No signers' }]} style={{ height: 34, fontSize: 12.5 }} />
        {def.kind !== 'display' && def.kind !== 'auto' && def.kind !== 'computed' && f.type !== 'decline' && <ToggleRow label="Required field" on={!!f.required} onChange={(v: boolean) => onPatch({ required: v })} />}
        {(def.kind === 'input' || def.kind === 'choice') && <ToggleRow label="Read only" hint="You fill it; the recipient can't change it" on={!!f.readOnly} onChange={(v: boolean) => onPatch({ readOnly: v })} />}
      </Section>

      {f.mergeKey && <Section title="Auto-filled from driver record">
        <div style={{ fontSize: 12.5, color: T.text, marginBottom: 6 }}><b>{mergeLabel(f.mergeKey)}</b></div>
        <div style={{ fontSize: 12, color: f.value ? T.muted : '#A05A00', marginBottom: 6 }}>{f.value ? `Current value: ${f.value}` : mergeData ? 'This driver record has no value yet — you can type one below.' : 'Filled when you choose a driver.'}</div>
        <Row label="Value"><TextProp value={f.value} onBeginEdit={onBeginEdit} onChange={(v: string) => live({ value: v })} placeholder={mergeData?.[f.mergeKey] || 'Filled from driver record'} /></Row>
        <ToggleRow label="Let recipient edit" on={!f.readOnly} onChange={(v: boolean) => onPatch({ readOnly: !v })} />
      </Section>}

      <Section title="Field">
        <Row label="Data label" hint="Shown in exports and used by formulas."><TextProp testId="prop-label" value={f.label} onBeginEdit={onBeginEdit} onChange={(v: string) => live({ label: v })} /></Row>
        {def.kind !== 'display' && <Row label="Tooltip"><TextProp value={f.tooltip} onBeginEdit={onBeginEdit} onChange={(v: string) => live({ tooltip: v })} placeholder="Help text the recipient sees" /></Row>}
        {f.type === 'note' && <Row label="Note text"><TextProp area value={f.value} onBeginEdit={onBeginEdit} onChange={(v: string) => live({ value: v })} placeholder="Instructions shown to the recipient" /></Row>}
        {['text', 'number', 'date', 'company', 'title'].includes(f.type) && !f.mergeKey && <Row label={f.readOnly ? 'Value' : 'Default value'}><TextProp testId="prop-default" value={f.value} onBeginEdit={onBeginEdit} onChange={(v: string) => live({ value: v })} placeholder={f.type === 'date' ? 'MM/DD/YYYY' : 'Optional'} /></Row>}
        {f.type === 'checkbox' && <ToggleRow label="Checked by default" on={!!f.value} onChange={(v: boolean) => onPatch({ value: v ? 'true' : '' })} />}
        {textual && f.type !== 'dateSigned' && <Row label="Font size"><Select value={String(f.fontSize || 11)} onChange={(v: string) => onPatch({ fontSize: Number(v) })} options={[8, 9, 10, 11, 12, 14, 16, 18, 20, 24].map((n) => ({ value: String(n), label: `${n} pt` }))} style={{ height: 32, fontSize: 12.5 }} /></Row>}
      </Section>

      {f.type === 'dropdown' && <Section title="Options">
        <OptionsEditor options={f.options || []} onChange={(options: string[]) => onPatch({ options, value: options.includes(f.value || '') ? f.value : '' })} />
        <Row label="Default selection"><Select value={f.value || ''} onChange={(v: string) => onPatch({ value: v })} options={[{ value: '', label: 'None' }, ...(f.options || []).map((o) => ({ value: o, label: o }))]} style={{ height: 32, fontSize: 12.5 }} /></Row>
      </Section>}

      {f.type === 'radio' && <Section title={`Radio group · ${group.length} buttons`}>
        <Row label="Group name"><TextProp value={f.group} onBeginEdit={onBeginEdit} onChange={(v: string) => live({ group: v })} /></Row>
        <Row label="This button's value"><TextProp testId="prop-radio-value" value={f.optionValue} onBeginEdit={onBeginEdit} onChange={(v: string) => live({ optionValue: v })} /></Row>
        <ToggleRow label="Selected by default" on={!!f.value} onChange={(v: boolean) => onPatch({ value: v ? 'on' : '' })} />
        <Btn size="sm" icon="plus" onClick={onAddRadio} data-testid="add-radio">Add button to group</Btn>
      </Section>}

      {f.type === 'checkbox' && <Section title="Checkbox group">
        <Row label="Group name" hint="Checkboxes with the same group share selection rules."><TextProp value={f.group} onBeginEdit={onBeginEdit} onChange={(v: string) => live({ group: v || undefined })} placeholder="None" /></Row>
        {f.group && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Row label="Select at least"><NumProp value={f.groupMin} onBeginEdit={onBeginEdit} onChange={(v: any) => onPatch({ groupMin: v }, false)} placeholder="0" /></Row>
          <Row label="Select at most"><NumProp value={f.groupMax} onBeginEdit={onBeginEdit} onChange={(v: any) => onPatch({ groupMax: v }, false)} placeholder="Any" /></Row>
        </div>}
      </Section>}

      {(f.type === 'text' || f.type === 'number') && !f.mergeKey && <Section title="Validation">
        {f.type === 'text' && <Row label="Format"><Select value={f.validation?.kind || 'none'} onChange={(v: any) => onPatch({ validation: { ...(f.validation || {}), kind: v } })} options={VALIDATIONS} style={{ height: 32, fontSize: 12.5 }} data-testid="prop-validation" /></Row>}
        {f.validation?.kind === 'regex' && <Row label="Pattern (regular expression)" hint="Example: [A-Z]{2}\d{6}"><TextProp value={f.validation?.pattern} onBeginEdit={onBeginEdit} onChange={(v: string) => live({ validation: { ...(f.validation || { kind: 'regex' }), pattern: v } })} /></Row>}
        {(f.type === 'number' || f.validation?.kind === 'number') && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Row label="Minimum"><NumProp value={f.validation?.min} onBeginEdit={onBeginEdit} onChange={(v: any) => onPatch({ validation: { kind: f.validation?.kind || 'none', ...(f.validation || {}), min: v } }, false)} /></Row>
          <Row label="Maximum"><NumProp value={f.validation?.max} onBeginEdit={onBeginEdit} onChange={(v: any) => onPatch({ validation: { kind: f.validation?.kind || 'none', ...(f.validation || {}), max: v } }, false)} /></Row>
        </div>}
        <Row label="Character limit"><NumProp value={f.validation?.maxLength} onBeginEdit={onBeginEdit} onChange={(v: any) => onPatch({ validation: { kind: f.validation?.kind || 'none', ...(f.validation || {}), maxLength: v } }, false)} placeholder="No limit" /></Row>
        {f.validation && f.validation.kind !== 'none' && <Row label="Error message"><TextProp value={f.validation?.message} onBeginEdit={onBeginEdit} onChange={(v: string) => live({ validation: { ...(f.validation as any), message: v } })} placeholder="Shown when the value is invalid" /></Row>}
      </Section>}

      {f.type === 'formula' && <Section title="Formula">
        <Row label="Expression" hint="Use data labels in brackets, e.g. [Miles] * [Rate per mile]."><TextProp value={f.formula} onBeginEdit={onBeginEdit} onChange={(v: string) => live({ formula: v })} placeholder="[Field A] + [Field B]" /></Row>
        <div style={{ fontSize: 12, color: f.formula && formulaPreview == null ? '#C62820' : T.muted }}>{f.formula ? (formulaPreview == null ? 'Check the expression — only + − × ÷ and brackets are allowed.' : `Preview with current defaults: ${formulaPreview}`) : 'Number fields: ' + (fields.filter((x) => x.type === 'number' && x.label).map((x) => `[${x.label}]`).join(', ') || 'none yet')}</div>
      </Section>}

      {def.kind !== 'auto' && f.type !== 'decline' && <Section title="Conditional logic">
        <ToggleRow label="Only show when…" on={!!f.conditional} disabled={!dedupParents.length} hint={!dedupParents.length ? 'Add a checkbox, radio, dropdown or text field first' : undefined} onChange={(v: boolean) => { if (!v) onPatch({ conditional: null }); else { const p0 = dedupParents[0]; onPatch({ conditional: { fieldId: p0.id, op: p0.type === 'checkbox' ? 'checked' : p0.type === 'radio' ? 'equals' : 'notEmpty', value: p0.type === 'radio' ? p0.optionValue : '' } }); } }} />
        {f.conditional && <div data-testid="conditional-editor">
          <Row label="Field"><Select value={f.conditional.fieldId} onChange={(v: string) => { const np = fields.find((x) => x.id === v); onPatch({ conditional: { fieldId: v, op: np?.type === 'checkbox' ? 'checked' : np?.type === 'radio' || np?.type === 'dropdown' ? 'equals' : 'notEmpty', value: np?.type === 'radio' ? np.optionValue : np?.type === 'dropdown' ? np.options?.[0] : '' } }); }} options={dedupParents.map((x) => ({ value: x.id, label: `${x.type === 'radio' ? x.group : x.label || FIELD_DEFS[x.type].label} (${FIELD_DEFS[x.type].label}, p.${x.page + 1})` }))} style={{ height: 32, fontSize: 12.5 }} data-testid="cond-field" /></Row>
          <Row label="Condition"><Select value={f.conditional.op} onChange={(v: any) => onPatch({ conditional: { ...f.conditional!, op: v } })} options={ops} style={{ height: 32, fontSize: 12.5 }} /></Row>
          {f.conditional.op === 'equals' && <Row label="Value">{parentOptions ? <Select value={f.conditional.value || ''} onChange={(v: string) => onPatch({ conditional: { ...f.conditional!, value: v } })} options={parentOptions.map((o) => ({ value: o, label: o || '(blank)' }))} style={{ height: 32, fontSize: 12.5 }} data-testid="cond-value" /> : <TextProp value={f.conditional.value} onBeginEdit={onBeginEdit} onChange={(v: string) => live({ conditional: { ...f.conditional!, value: v } })} />}</Row>}
          <div style={{ fontSize: 11.5, color: T.faint, lineHeight: 1.45 }}>Hidden fields are never required and are left off the completed document.</div>
        </div>}
      </Section>}

      <Section title="Position & size">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {(['x', 'y', 'w', 'h'] as const).map((k) => <label key={k} style={{ fontSize: 10.5, color: T.faint, fontWeight: 700 }}>{k.toUpperCase()}<input type="number" value={Math.round(f[k])} onFocus={onBeginEdit} onChange={(e) => live({ [k]: Math.max(k === 'w' || k === 'h' ? 8 : 0, Number(e.target.value) || 0) } as any)} style={{ ...mini, height: 28, padding: '0 6px', marginTop: 2 }} /></label>)}
        </div>
      </Section>
    </fieldset>
  </div>;
}

function OptionsEditor({ options, onChange }: { options: string[]; onChange: (o: string[]) => void }) {
  const [draft, setDraft] = React.useState('');
  return <div style={{ marginBottom: 10 }}>
    {options.map((o, i) => <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
      <input value={o} onChange={(e) => onChange(options.map((x, j) => (j === i ? e.target.value : x)))} style={{ ...mini, height: 30 }} aria-label={`Option ${i + 1}`} />
      <IconButton icon="arrowUp" title="Move up" size={30} disabled={i === 0} onClick={() => { const n = [...options]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); }} />
      <IconButton icon="x" title="Remove option" size={30} onClick={() => onChange(options.filter((_, j) => j !== i))} />
    </div>)}
    <div style={{ display: 'flex', gap: 4 }}>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) { onChange([...options, draft.trim()]); setDraft(''); } }} placeholder="Add an option and press Enter" style={{ ...mini, height: 30 }} data-testid="add-option" />
      <IconButton icon="plus" title="Add option" size={30} disabled={!draft.trim()} onClick={() => { onChange([...options, draft.trim()]); setDraft(''); }} />
    </div>
  </div>;
}

function MultiProps({ selected, recipients, onPatch, onAlign, onDelete, onGroup, onClose }: any) {
  const allCheck = selected.every((f: Field) => f.type === 'checkbox');
  const rid = selected.every((f: Field) => f.recipientId === selected[0].recipientId) ? selected[0].recipientId : '';
  return <div data-testid="multi-props">
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', borderBottom: `1px solid ${T.hair}` }}>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{selected.length} fields selected</div>
      <IconButton icon="trash" title="Delete" onClick={onDelete} /><IconButton icon="x" title="Clear selection" onClick={onClose} />
    </div>
    <Section title="Recipient" first><Select value={rid} onChange={(v: string) => onPatch({ recipientId: v })} options={[...(rid ? [] : [{ value: '', label: 'Mixed', disabled: true }]), ...recipients.map((r: EditorRecipient) => ({ value: r.id, label: recName(r) }))]} style={{ height: 34, fontSize: 12.5 }} />
      <ToggleRow label="Required" on={selected.every((f: Field) => f.required)} onChange={(v: boolean) => onPatch({ required: v })} /></Section>
    <Section title="Align">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {([['left', 'Left'], ['top', 'Top'], ['right', 'Right'], ['bottom', 'Bottom'], ['center', 'Center'], ['middle', 'Middle'], ['width', 'Same width'], ['height', 'Same height']] as const).map(([k, l]) => <Btn key={k} size="sm" onClick={() => onAlign(k)} data-testid={`align-${k}`}>{l}</Btn>)}
      </div>
    </Section>
    {allCheck && <Section title="Checkbox group"><Btn size="sm" icon="checkSquare" onClick={() => onGroup(`Checkbox group ${Math.floor(Math.random() * 900 + 100)}`)}>Group these checkboxes</Btn><div style={{ fontSize: 11.5, color: T.faint, marginTop: 6 }}>Then set "select at least / at most" on any of them.</div></Section>}
  </div>;
}

function PagesPanel({ documents, fields, cur, onGo }: any) {
  return <div>
    <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.hair}`, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="layers" size={15} style={{ color: T.muted }} /><span style={{ fontSize: 13.5, fontWeight: 700 }}>Pages</span><span style={{ fontSize: 12, color: T.faint }}>Select a field to edit its properties</span></div>
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {documents.map((d: EDoc) => <div key={d.id}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: T.muted, marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {d.pages.map((pg, i) => { const on = cur.docId === d.id && cur.page === i; const nf = fields.filter((f: Field) => f.docId === d.id && f.page === i).length; return <button key={i} type="button" onClick={() => onGo(d.id, i)} data-testid={`thumb-${i}`} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
            <div style={{ position: 'relative', width: '100%', aspectRatio: `${pg.w} / ${pg.h}`, borderRadius: 4, outline: on ? '2px solid #007AFF' : '1px solid rgba(0,0,0,0.1)', outlineOffset: on ? 1 : 0, overflow: 'hidden' }}>
              <PageImage doc={d} page={i} />
              {nf > 0 && <span style={{ position: 'absolute', right: 4, bottom: 4, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 99, background: '#007AFF', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{nf}</span>}
            </div>
            <div style={{ fontSize: 11, color: on ? '#007AFF' : T.faint, marginTop: 4, fontWeight: on ? 700 : 500 }}>{i + 1}</div>
          </button>; })}
        </div>
      </div>)}
    </div>
  </div>;
}
