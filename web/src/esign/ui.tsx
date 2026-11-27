import React from 'react';
import ReactDOM from 'react-dom';
import { Hover } from '../lib/dc';
import { T, Icon as BaseIcon } from '../tasks/lib';
import { STATUS_META } from './model';

/* Light neutral workspace surface per the design spec. */
export const BG = '#F5F6F8';
export const BLUE = '#007AFF';

/* ───────────────────────── icons (extends the shared lucide set) ───────────────────────── */
const EXTRA: Record<string, string> = {
  initial: '<path d="M4 20h16"/><path d="M7 16V6l4 10V6"/><path d="M15 16V6h3.5a2.5 2.5 0 0 1 0 5H15"/>',
  stamp: '<path d="M5 22h14"/><path d="M19.27 13.73A2.5 2.5 0 0 0 17.5 13h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.5c0-.66-.26-1.3-.73-1.77Z"/><path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13"/>',
  text: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
  hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  checkSquare: '<rect width="18" height="18" x="3" y="3" rx="3"/><path d="m8 12 3 3 5-6"/>',
  radio: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
  sigma: '<path d="M18 7V4H6l6 8-6 8h12v-3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  alignLeft: '<line x1="4" x2="4" y1="3" y2="21"/><rect x="8" y="6" width="12" height="4" rx="1"/><rect x="8" y="14" width="7" height="4" rx="1"/>',
  alignTop: '<line x1="3" x2="21" y1="4" y2="4"/><rect x="6" y="8" width="4" height="12" rx="1"/><rect x="14" y="8" width="4" height="7" rx="1"/>',
  zoomIn: '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>',
  zoomOut: '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  folderPlus: '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  clipboard: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  filePlus: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/>',
  fileCheck: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  rotateCcw: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  table: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  logOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
};
export function Icon({ name, size = 18, style }: { name: string; size?: number; style?: React.CSSProperties }) {
  if (EXTRA[name]) return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', ...style }} dangerouslySetInnerHTML={{ __html: EXTRA[name] }} />;
  return <BaseIcon name={name} size={size} style={{ flex: 'none', ...style }} />;
}

/** Escape-to-close, registered once. Re-registering on every render would drop
    the key press when another window listener re-renders React mid-dispatch
    (browsers drain microtasks between listeners for trusted events). */
export function useEscape(onClose?: () => void) {
  const ref = React.useRef(onClose); ref.current = onClose;
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') ref.current?.(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
}

/* ───────────────────────── existing primitives (shared across QuickHire) ───────────────────────── */
export function Card({ children, style, onClick, hover }: any) {
  const base: React.CSSProperties = { background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(0,0,0,0.03)', ...style };
  if (onClick) return <Hover as="div" onClick={onClick} style={{ ...base, cursor: 'pointer' }} hover={hover || { boxShadow: '0 6px 20px rgba(0,0,0,0.07)', borderColor: 'rgba(0,0,0,0.12)' }}>{children}</Hover>;
  return <div style={base}>{children}</div>;
}

export function StatusPill({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const m = STATUS_META[status] || STATUS_META.draft;
  const h = size === 'sm' ? 20 : 22;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: h, padding: '0 9px', borderRadius: 999, background: m.bg, color: m.color, fontSize: size === 'sm' ? 11 : 11.5, fontWeight: 650, whiteSpace: 'nowrap' }}><span style={{ width: 6, height: 6, borderRadius: 999, background: m.color }} />{m.label}</span>;
}

export function Modal({ title, subtitle, onClose, children, footer, width = 520, zIndex = 120, bodyStyle }: any) {
  useEscape(onClose);
  return <div style={{ position: 'fixed', inset: 0, zIndex, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(17,24,39,0.32)', backdropFilter: 'blur(2px)', animation: 'qhFade .15s ease' }} />
    <div style={{ position: 'relative', width, maxWidth: '100%', maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,0.28)', overflow: 'hidden', animation: 'qhScaleIn .16s ease' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${T.hair}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2, lineHeight: 1.45 }}>{subtitle}</div>}
        </div>
        <Hover as="button" aria-label="Close" onClick={onClose} style={{ width: 32, height: 32, flex: 'none', borderRadius: 8, border: 'none', background: T.segBg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted }} hover={{ background: 'rgba(0,0,0,0.08)' }}><Icon name="x" size={16} /></Hover>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 20, ...bodyStyle }}>{children}</div>
      {footer && <div style={{ flex: 'none', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '12px 20px', borderTop: `1px solid ${T.hair}`, background: '#FCFCFD', flexWrap: 'wrap' }}>{footer}</div>}
    </div>
  </div>;
}

export function Field({ label, hint, children, style }: any) {
  return <label style={{ display: 'block', marginBottom: 14, ...style }}>
    <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase', color: T.faint, marginBottom: 6 }}>{label}</div>
    {children}
    {hint && <div style={{ fontSize: 11.5, color: T.faint, marginTop: 5, lineHeight: 1.45 }}>{hint}</div>}
  </label>;
}

export const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 38, borderRadius: 10, border: `1px solid rgba(0,0,0,0.12)`, padding: '0 12px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit', color: T.text, background: '#fff' };
export const areaStyle: React.CSSProperties = { ...inputStyle, height: 'auto', padding: 10, resize: 'vertical', lineHeight: 1.5 };

export const Input = React.forwardRef<HTMLInputElement, any>(function Input(props, ref) { return <input ref={ref} {...props} style={{ ...inputStyle, ...(props.style || {}) }} />; });
export function Textarea(props: any) { return <textarea {...props} style={{ ...areaStyle, ...(props.style || {}) }} />; }

export function Select({ value, onChange, options, style, ...rest }: any) {
  return <span style={{ position: 'relative', display: 'block', ...(style?.width ? { width: style.width } : {}) }}>
    <select value={value} onChange={(e) => onChange(e.target.value)} {...rest} style={{ ...inputStyle, appearance: 'none', backgroundImage: 'none', cursor: 'pointer', paddingRight: 30, ...style }}>
      {options.map((o: any) => <option key={o.value ?? o} value={o.value ?? o} disabled={o.disabled}>{o.label ?? o}</option>)}
    </select>
    <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: T.faint, display: 'flex' }}><Icon name="chevronDown" size={14} /></span>
  </span>;
}

export function Confirm({ title, body, confirmLabel = 'Confirm', danger, onConfirm, onClose }: any) {
  return <Modal title={title} onClose={onClose} width={420} footer={<>
    <Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover>
    <Hover as="button" onClick={() => { onConfirm(); onClose(); }} style={{ ...primaryBtn, background: danger ? '#FF3B30' : '#007AFF' }} hover={{ background: danger ? '#E0301F' : '#0066D6' }}>{confirmLabel}</Hover>
  </>}>
    <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.55 }}>{body}</div>
  </Modal>;
}

export const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 10, border: 'none', background: '#007AFF', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' };
export const ghostBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, border: `1px solid rgba(0,0,0,0.12)`, background: '#fff', color: T.text, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' };
export const dangerBtn: React.CSSProperties = { ...primaryBtn, background: '#FF3B30' };
export const linkBtn: React.CSSProperties = { border: 'none', background: 'transparent', color: '#007AFF', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0, fontFamily: 'inherit' };

export function EmptyState({ icon, title, body, action }: any) {
  return <div style={{ textAlign: 'center', padding: '54px 20px', color: T.faint }}>
    <Icon name={icon} size={30} style={{ color: '#C7C7CC' }} />
    <div style={{ marginTop: 12, fontSize: 15, fontWeight: 650, color: T.muted }}>{title}</div>
    {body && <div style={{ fontSize: 13, marginTop: 4, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>{body}</div>}
    {action && <div style={{ marginTop: 16 }}>{action}</div>}
  </div>;
}

export function Toggle({ on, onChange, label, disabled }: any) {
  return <button type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(!on); }} style={{ width: 42, height: 25, flex: 'none', borderRadius: 999, border: 'none', cursor: disabled ? 'default' : 'pointer', background: on ? '#34C759' : '#E3E3E8', position: 'relative', transition: 'background .15s', padding: 0, opacity: disabled ? 0.5 : 1 }}>
    <span style={{ position: 'absolute', top: 2, left: on ? 19 : 2, width: 21, height: 21, borderRadius: 999, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left .15s' }} />
  </button>;
}

export function SettingRow({ label, desc, children }: any) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderTop: `1px solid ${T.hair}` }}>
    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>{desc && <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>{desc}</div>}</div>
    <div style={{ flex: 'none' }}>{children}</div>
  </div>;
}

/* ───────────────────────── new e-sign primitives ───────────────────────── */
export function Btn({ kind = 'ghost', icon, children, style, size = 'md', ...rest }: any) {
  const base = kind === 'primary' ? primaryBtn : kind === 'danger' ? dangerBtn : kind === 'plain' ? { ...ghostBtn, border: 'none', background: 'transparent', color: T.muted } : ghostBtn;
  const h = size === 'sm' ? { height: 32, padding: children ? '0 11px' : 0, width: children ? undefined : 32, fontSize: 12.5, borderRadius: 9 } : {};
  const hov = kind === 'primary' ? { background: '#0066D6' } : kind === 'danger' ? { background: '#E0301F' } : { background: 'rgba(0,0,0,0.045)' };
  const disabled = rest.disabled;
  return <Hover as="button" type="button" {...rest} style={{ ...base, ...h, ...(disabled ? { opacity: 0.45, cursor: 'not-allowed' } : {}), ...style }} hover={disabled ? {} : hov}>{icon && <Icon name={icon} size={size === 'sm' ? 14 : 15} />}{children}</Hover>;
}

export function IconButton({ icon, title, onClick, active, disabled, size = 32, style }: any) {
  return <Hover as="button" type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} style={{ width: size, height: size, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: active ? 'rgba(0,122,255,0.12)' : 'transparent', color: disabled ? '#C7C7CC' : active ? BLUE : T.muted, cursor: disabled ? 'default' : 'pointer', ...style }} hover={disabled ? {} : { background: active ? 'rgba(0,122,255,0.16)' : 'rgba(0,0,0,0.055)' }}><Icon name={icon} size={16} /></Hover>;
}

/** Dropdown rendered in a portal so it is never clipped by scroll containers. */
export function Dropdown({ trigger, children, align = 'left', width = 220, placement = 'bottom' }: any) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number; up: boolean }>({ top: 0, left: 0, up: false });
  const tref = React.useRef<HTMLSpanElement>(null);
  const mref = React.useRef<HTMLDivElement>(null);
  const place = () => {
    const r = tref.current?.getBoundingClientRect(); if (!r) return;
    const up = placement === 'top' || (r.bottom + 320 > window.innerHeight && r.top > 340);
    let left = align === 'right' ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left, up });
  };
  React.useEffect(() => {
    if (!open) return;
    const h = (e: any) => { if (!tref.current?.contains(e.target) && !mref.current?.contains(e.target)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const s = () => setOpen(false);
    document.addEventListener('mousedown', h); window.addEventListener('keydown', k); window.addEventListener('resize', s);
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('keydown', k); window.removeEventListener('resize', s); };
  }, [open]);
  const close = () => setOpen(false);
  return <span ref={tref} style={{ display: 'inline-flex' }} onClick={(e) => { e.stopPropagation(); place(); setOpen((o) => !o); }}>
    {trigger}
    {open && ReactDOM.createPortal(<div ref={mref} onClick={(e) => e.stopPropagation()} role="menu" style={{ position: 'fixed', top: pos.up ? undefined : pos.top, bottom: pos.up ? window.innerHeight - pos.top : undefined, left: pos.left, width, zIndex: 400, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, boxShadow: '0 14px 36px rgba(0,0,0,0.16)', padding: 6, maxHeight: 360, overflowY: 'auto', animation: 'qhFade .12s ease' }}>{typeof children === 'function' ? children(close) : children}</div>, document.body)}
  </span>;
}
export function MenuItem({ icon, label, hint, onClick, danger, disabled, checked }: any) {
  return <Hover as="button" type="button" role="menuitem" disabled={disabled} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', minHeight: 34, padding: '6px 10px', border: 'none', background: 'transparent', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', fontSize: 13, color: disabled ? '#C7C7CC' : danger ? '#C62820' : T.text, fontFamily: 'inherit' }} hover={disabled ? {} : { background: danger ? 'rgba(255,59,48,0.08)' : 'rgba(0,0,0,0.05)' }}>
    {icon && <Icon name={icon} size={15} style={{ color: disabled ? '#D1D1D6' : danger ? '#C62820' : T.muted }} />}
    <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block' }}>{label}</span>{hint && <span style={{ display: 'block', fontSize: 11.5, color: T.faint, marginTop: 1 }}>{hint}</span>}</span>
    {checked && <Icon name="check" size={14} style={{ color: BLUE }} />}
  </Hover>;
}
export function MenuSep() { return <div style={{ height: 1, background: T.hair, margin: '5px 4px' }} />; }

/** Right-side panel for details (one primary action, details in side panels). */
export function Drawer({ title, subtitle, onClose, children, footer, width = 520, headerRight }: any) {
  useEscape(onClose);
  return <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', justifyContent: 'flex-end' }}>
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(17,24,39,0.24)', animation: 'qhFade .15s ease' }} />
    <aside style={{ position: 'relative', width, maxWidth: '100vw', height: '100%', background: '#fff', boxShadow: '-10px 0 40px rgba(0,0,0,0.16)', display: 'flex', flexDirection: 'column', animation: 'qhSheetIn .2s ease' }}>
      <div style={{ flex: 'none', padding: '16px 18px', borderBottom: `1px solid ${T.hair}`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}>{title}</div>{subtitle && <div style={{ marginTop: 6 }}>{subtitle}</div>}</div>
        {headerRight}
        <IconButton icon="x" title="Close" onClick={onClose} style={{ background: T.segBg }} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 }}>{children}</div>
      {footer && <div style={{ flex: 'none', padding: '12px 18px', borderTop: `1px solid ${T.hair}`, display: 'flex', gap: 8, flexWrap: 'wrap', background: '#FCFCFD' }}>{footer}</div>}
    </aside>
  </div>;
}

export function Segmented({ value, onChange, options, size = 'md' }: any) {
  return <div role="tablist" style={{ display: 'inline-flex', gap: 2, padding: 3, background: T.segBg, borderRadius: 10, maxWidth: '100%', overflowX: 'auto' }}>
    {options.map((o: any) => { const on = o.value === value; return <button key={o.value} type="button" role="tab" aria-selected={on} onClick={() => onChange(o.value)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: size === 'sm' ? 26 : 30, padding: size === 'sm' ? '0 10px' : '0 13px', fontSize: size === 'sm' ? 12 : 13, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap', background: on ? '#fff' : 'transparent', color: on ? T.text : T.muted, boxShadow: on ? '0 1px 2px rgba(0,0,0,0.10)' : 'none', fontFamily: 'inherit' }}>{o.icon && <Icon name={o.icon} size={14} />}{o.label}{o.count != null && <span style={{ fontSize: 11, color: T.faint, fontWeight: 600 }}>{o.count}</span>}</button>; })}
  </div>;
}

export function Chip({ children, color = T.muted, bg = 'rgba(0,0,0,0.045)', icon, style }: any) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 8px', borderRadius: 999, background: bg, color, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', ...style }}>{icon && <Icon name={icon} size={12} />}{children}</span>;
}

export function Dot({ color, size = 8 }: any) { return <span style={{ width: size, height: size, borderRadius: 999, background: color, flex: 'none', display: 'inline-block' }} />; }

export function RecipientAvatar({ r, size = 28 }: any) {
  const ini = String(r?.name || r?.roleName || '?').split(' ').map((s: string) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return <span style={{ width: size, height: size, flex: 'none', borderRadius: 999, background: r?.color || '#8E8E93', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.38), fontWeight: 700 }}>{ini}</span>;
}

export function SectionCard({ title, desc, icon, right, children, style }: any) {
  return <section style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(0,0,0,0.03)', ...style }}>
    <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${T.hair}` }}>
      {icon && <span style={{ width: 30, height: 30, flex: 'none', borderRadius: 9, background: 'rgba(0,122,255,0.1)', color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={16} /></span>}
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 700 }}>{title}</div>{desc && <div style={{ fontSize: 12, color: T.faint, marginTop: 1 }}>{desc}</div>}</div>
      {right}
    </header>
    <div style={{ padding: 18 }}>{children}</div>
  </section>;
}

export function Label({ children, style }: any) { return <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.faint, marginBottom: 8, ...style }}>{children}</div>; }

export function Checkbox({ checked, onChange, label, disabled, style }: any) {
  return <label style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 9, cursor: disabled ? 'default' : 'pointer', fontSize: 13, color: T.text, lineHeight: 1.45, ...style }}>
    <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: 17, height: 17, margin: '1px 0 0', accentColor: BLUE, flex: 'none', cursor: 'inherit' }} />
    <span>{label}</span>
  </label>;
}

/* ───────────────────────── toasts with Undo ───────────────────────── */
export type Toast = { id: string; title: string; kind: string; action?: { label: string; run: () => void } };
export function useEToasts() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const toast = React.useCallback((title: string, kind = 'success', action?: Toast['action']) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, title, kind, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6500 : 3200);
  }, []);
  const dismiss = React.useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  return { toasts, toast, dismiss };
}
export function ToastHost({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  const conf: any = { success: ['rgba(52,199,89,0.16)', '#248A3D', 'check'], info: ['rgba(0,122,255,0.14)', '#0066CC', 'checkCircle'], warning: ['rgba(255,159,10,0.18)', '#A05A00', 'alert'], error: ['rgba(255,59,48,0.14)', '#C62820', 'alert'], danger: ['rgba(255,59,48,0.14)', '#C62820', 'alert'] };
  return ReactDOM.createPortal(<div aria-live="polite" style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 'min(440px, calc(100vw - 24px))', pointerEvents: 'none' }}>
    {toasts.map((t) => { const c = conf[t.kind] || conf.success; return <div key={t.id} style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 10px 14px', background: '#1D1D1F', color: '#fff', borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.25)', animation: 'qhSlideUp .2s ease', width: 'fit-content', maxWidth: '100%' }}>
      <span style={{ width: 20, height: 20, flex: 'none', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c[0], color: t.kind === 'error' ? '#FF6961' : t.kind === 'warning' ? '#FFB340' : '#5BD67A' }}><Icon name={c[2]} size={12} /></span>
      <div style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 }}>{t.title}</div>
      {t.action && <button type="button" onClick={() => { t.action!.run(); dismiss(t.id); }} style={{ border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>{t.action.label}</button>}
    </div>; })}
  </div>, document.body);
}

/* Screen-size hook for responsive layouts. */
export function useWidth() {
  const [w, setW] = React.useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  React.useEffect(() => { const h = () => setW(window.innerWidth); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return w;
}

export function Kbd({ children }: any) { return <kbd style={{ display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 5px', borderRadius: 5, border: '1px solid rgba(0,0,0,0.14)', background: '#fff', fontSize: 10.5, fontFamily: 'inherit', color: T.muted, fontWeight: 600 }}>{children}</kbd>; }

export function hexA(hex: string, a: number) { const h = String(hex || '#007AFF').replace('#', ''); const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h; const n = parseInt(f, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
