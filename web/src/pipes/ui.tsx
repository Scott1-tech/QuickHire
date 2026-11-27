import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon, Avatar } from '../tasks/lib';
import { SLA_COLORS, SlaLevel } from './lifecycle';

export const BG = '#F5F6F8';
export const BLUE = '#007AFF';

/** Window width (re-renders on resize) for the few responsive switches. */
export function useViewportWidth() {
  const [w, setW] = React.useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth));
  React.useEffect(() => { const h = () => setW(window.innerWidth); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return w;
}

export function SlaChip({ days, level, title }: { days: number; level: SlaLevel; title?: string }) {
  const c = SLA_COLORS[level];
  return <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 20, padding: '0 7px', borderRadius: 999, background: c.bg, color: c.fg, fontSize: 11, fontWeight: 650, whiteSpace: 'nowrap', flex: 'none' }}>
    {level !== 'none' && <span style={{ width: 6, height: 6, borderRadius: 999, background: c.fg }} />}{days}d
  </span>;
}

export function Pill({ children, color = T.muted, bg = '#F2F2F7', title, style }: any) {
  return <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 20, padding: '0 8px', borderRadius: 999, background: bg, color, fontSize: 11, fontWeight: 650, whiteSpace: 'nowrap', ...style }}>{children}</span>;
}

export function ReadyBadge({ to }: { to?: string | null }) {
  return <Pill color="#248A3D" bg="rgba(52,199,89,0.13)" title={to ? `Exit checklist complete — ready for ${to}` : 'Exit checklist complete'}><Icon name="check" size={11} />Ready</Pill>;
}

export function ExampleTag() { return <Pill color="#8E8E93" bg="transparent" style={{ border: '1px dashed rgba(0,0,0,0.18)', height: 18 }} title="Example data — remove from the ⋯ menu">Example</Pill>; }

export function PersonAvatar({ name, size = 30 }: { name: string; size?: number }) { return <Avatar name={name} size={size} />; }

export function IconButton({ icon, label, onClick, size = 30, tone, disabled }: { icon: string; label: string; onClick: (e: any) => void; size?: number; tone?: 'danger' | 'primary'; disabled?: boolean }) {
  const color = tone === 'danger' ? '#C62820' : tone === 'primary' ? BLUE : T.muted;
  return <Hover as="button" type="button" aria-label={label} title={label} disabled={disabled} onClick={(e: any) => { e.stopPropagation(); if (!disabled) onClick(e); }}
    style={{ width: size, height: size, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'transparent', color, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1 }}
    hover={{ background: 'rgba(0,0,0,0.06)' }}><Icon name={icon} size={Math.round(size * 0.52)} /></Hover>;
}

export function SmallBtn({ label, icon, onClick, tone = 'default', style }: { label: string; icon?: string; onClick: (e: any) => void; tone?: 'default' | 'primary' | 'danger' | 'success'; style?: React.CSSProperties }) {
  const tones: any = {
    default: [{ background: '#fff', color: T.text, border: `1px solid rgba(0,0,0,0.10)` }, { background: 'rgba(0,0,0,0.04)' }],
    primary: [{ background: BLUE, color: '#fff', border: '1px solid ' + BLUE }, { background: '#0066D6' }],
    danger: [{ background: '#fff', color: '#C62820', border: '1px solid rgba(255,59,48,0.3)' }, { background: 'rgba(255,59,48,0.06)' }],
    success: [{ background: '#34C759', color: '#fff', border: '1px solid #34C759' }, { background: '#2DB24E' }],
  };
  const [base, hov] = tones[tone];
  return <Hover as="button" type="button" onClick={(e: any) => { e.stopPropagation(); onClick(e); }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 30, padding: '0 11px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', ...base, ...style }} hover={hov}>{icon && <Icon name={icon} size={14} />}{label}</Hover>;
}

/** Single bottom snackbar for all feedback; carries Undo when the action can be
    reverted (undo instead of confirm). A new message replaces the previous one. */
export interface SnackItem { id: string; text: string; canUndo: boolean; kind?: 'success' | 'info' | 'warning' | 'danger'; extra?: { label: string; onClick: () => void } }
const SNACK_ICON: Record<string, [string, string]> = { success: ['check', '#30D158'], info: ['checkCircle', '#64D2FF'], warning: ['alert', '#FFD60A'], danger: ['alert', '#FF6961'], error: ['alert', '#FF6961'] };
export function UndoBar({ item, onUndo, onClose }: { item: SnackItem | null; onUndo: () => void; onClose: () => void }) {
  React.useEffect(() => { if (!item) return; const t = setTimeout(onClose, item.canUndo ? 7000 : 3800); return () => clearTimeout(t); }, [item?.id]); // eslint-disable-line
  if (!item) return null;
  const [icon, color] = SNACK_ICON[item.kind || 'success'] || SNACK_ICON.success;
  return <div style={{ position: 'fixed', left: 16, right: 16, bottom: 22, zIndex: 120, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
    <div role="status" aria-live="polite" data-undo-bar style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 12, maxWidth: '100%', padding: '10px 10px 10px 16px', borderRadius: 12, background: 'rgba(29,29,31,0.94)', color: '#fff', boxShadow: '0 14px 40px rgba(0,0,0,0.28)', fontSize: 13.5, animation: 'qhSlideUp .2s ease' }}>
      <Icon name={icon} size={15} style={{ color, flex: 'none' }} />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.text}</span>
      {item.extra && <button type="button" onClick={item.extra.onClick} style={{ flex: 'none', height: 30, padding: '0 10px', borderRadius: 8, border: 'none', background: 'transparent', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{item.extra.label}</button>}
      {item.canUndo && <button type="button" onClick={onUndo} style={{ flex: 'none', height: 30, padding: '0 12px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#64D2FF', fontSize: 13, fontWeight: 650, cursor: 'pointer' }}>Undo</button>}
      <button type="button" aria-label="Dismiss" onClick={onClose} style={{ flex: 'none', width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={14} /></button>
    </div>
  </div>;
}

/** Small anchored popover menu (used for "Move to…" and the overflow menu). */
export function Popover({ open, onClose, children, align = 'right', width = 220, top = 'calc(100% + 6px)' }: any) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', down), 0);
    document.addEventListener('keydown', key);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]); // eslint-disable-line
  if (!open) return null;
  return <div ref={ref} role="menu" onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top, [align]: 0, zIndex: 90, width, maxHeight: 360, overflowY: 'auto', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, boxShadow: '0 14px 36px rgba(0,0,0,0.16)', padding: 6 } as any}>{children}</div>;
}
export function MenuRow({ icon, label, onClick, hint, danger, active, dot, disabled }: any) {
  return <Hover as="button" type="button" role="menuitem" disabled={disabled} onClick={(e: any) => { e.stopPropagation(); if (!disabled) onClick(); }} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', minHeight: 34, padding: '6px 10px', border: 'none', background: active ? 'rgba(0,122,255,0.07)' : 'transparent', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', fontSize: 13, color: danger ? '#C62820' : disabled ? T.faint : T.text }} hover={disabled ? {} : { background: danger ? 'rgba(255,59,48,0.07)' : 'rgba(0,0,0,0.05)' }}>
    {dot && <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, flex: 'none' }} />}
    {icon && <Icon name={icon} size={15} style={{ color: danger ? '#C62820' : T.muted, flex: 'none' }} />}
    <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
    {hint && <span style={{ fontSize: 11.5, color: T.faint, flex: 'none' }}>{hint}</span>}
    {active && <Icon name="check" size={14} style={{ color: BLUE, flex: 'none' }} />}
  </Hover>;
}
export const MenuLabel = ({ children }: any) => <div style={{ padding: '6px 10px 4px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.faint }}>{children}</div>;
export const MenuSep = () => <div style={{ height: 1, background: T.hair, margin: '5px 4px' }} />;

export function SectionLabel({ children, right }: any) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '0 0 8px' }}>
    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.faint }}>{children}</span>{right}
  </div>;
}
