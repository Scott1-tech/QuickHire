import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon } from '../tasks/lib';
import { STATUS_META } from './store';

/* Light neutral workspace surface per the design spec. */
export const BG = '#F5F6F8';

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

export function Modal({ title, subtitle, onClose, children, footer, width = 520 }: any) {
  return <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(2px)' }} />
    <div style={{ position: 'relative', width, maxWidth: '94vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 22px', borderBottom: `1px solid ${T.hair}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{subtitle}</div>}
        </div>
        <Hover as="button" onClick={onClose} style={{ width: 32, height: 32, flex: 'none', borderRadius: 8, border: 'none', background: T.segBg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted }} hover={{ background: 'rgba(0,0,0,0.08)' }}><Icon name="x" size={16} /></Hover>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 22 }}>{children}</div>
      {footer && <div style={{ flex: 'none', display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 22px', borderTop: `1px solid ${T.hair}`, background: '#FCFCFD' }}>{footer}</div>}
    </div>
  </div>;
}

export function Field({ label, hint, children }: any) {
  return <label style={{ display: 'block', marginBottom: 14 }}>
    <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase', color: T.faint, marginBottom: 6 }}>{label}</div>
    {children}
    {hint && <div style={{ fontSize: 11.5, color: T.faint, marginTop: 5 }}>{hint}</div>}
  </label>;
}

export const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 38, borderRadius: 10, border: `1px solid ${T.border}`, padding: '0 12px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit', color: T.text };
export const areaStyle: React.CSSProperties = { ...inputStyle, height: 'auto', padding: 10, resize: 'vertical', lineHeight: 1.5 };

export function Input(props: any) { return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />; }
export function Textarea(props: any) { return <textarea {...props} style={{ ...areaStyle, ...(props.style || {}) }} />; }

export function Select({ value, onChange, options, style }: any) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, appearance: 'none', backgroundImage: 'none', cursor: 'pointer', ...style }}>
    {options.map((o: any) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
  </select>;
}

export function Confirm({ title, body, confirmLabel = 'Confirm', danger, onConfirm, onClose }: any) {
  return <Modal title={title} onClose={onClose} width={420} footer={<>
    <Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover>
    <Hover as="button" onClick={() => { onConfirm(); onClose(); }} style={{ ...primaryBtn, background: danger ? '#FF3B30' : '#007AFF' }} hover={{ background: danger ? '#E0301F' : '#0066D6' }}>{confirmLabel}</Hover>
  </>}>
    <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.55 }}>{body}</div>
  </Modal>;
}

export const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 10, border: 'none', background: '#007AFF', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
export const ghostBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, border: `1px solid ${T.border}`, background: '#fff', color: T.text, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };

export function EmptyState({ icon, title, body, action }: any) {
  return <div style={{ textAlign: 'center', padding: '54px 20px', color: T.faint }}>
    <Icon name={icon} size={30} style={{ color: '#C7C7CC' }} />
    <div style={{ marginTop: 12, fontSize: 15, fontWeight: 650, color: T.muted }}>{title}</div>
    {body && <div style={{ fontSize: 13, marginTop: 4, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>{body}</div>}
    {action && <div style={{ marginTop: 16 }}>{action}</div>}
  </div>;
}

export function Toggle({ on, onChange }: any) {
  return <button onClick={(e) => { e.stopPropagation(); onChange(!on); }} style={{ width: 42, height: 25, flex: 'none', borderRadius: 999, border: 'none', cursor: 'pointer', background: on ? '#34C759' : '#E3E3E8', position: 'relative', transition: 'background .15s', padding: 0 }}>
    <span style={{ position: 'absolute', top: 2, left: on ? 19 : 2, width: 21, height: 21, borderRadius: 999, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left .15s' }} />
  </button>;
}

export function SettingRow({ label, desc, children }: any) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderTop: `1px solid ${T.hair}` }}>
    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>{desc && <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>{desc}</div>}</div>
    <div style={{ flex: 'none' }}>{children}</div>
  </div>;
}
