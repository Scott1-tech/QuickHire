/* <PhoneLink> — a phone number that calls when clicked, everywhere in the app.
   Hover (or keyboard focus) reveals a copy button. Renders a real tel: link so
   right-click "copy link" and screen readers behave; the click is intercepted
   and routed to the in-app phone. Stops propagation so it is safe inside
   clickable cards (e.g. the recruiting board). */
import React from 'react';
import { Icon } from '../tasks/lib';
import { callNumber, type RecordKind } from './store';
import { formatPhone, normalizePhone } from './number';

type Props = {
  phone: string;
  name?: string;
  recordId?: string;
  kind?: RecordKind | 'candidate';
  /** Show the raw stored text instead of the normalised display format. */
  raw?: boolean;
  style?: React.CSSProperties;
};

export function PhoneLink({ phone, name, recordId, kind, raw, style }: Props) {
  const [hover, setHover] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const n = normalizePhone(phone);
  if (!phone) return null;
  const text = raw ? phone : formatPhone(phone);
  if (!n.dialable) return <span style={style}>{phone}</span>;
  const k: RecordKind | undefined = kind === 'lead' ? 'lead' : kind ? 'driver' : undefined;

  const call = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    callNumber(phone, { name, recordId, kind: k });
  };
  const copy = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    try { await navigator.clipboard.writeText(n.e164 || text); setCopied(true); setTimeout(() => setCopied(false), 1400); }
    catch { /* clipboard blocked — the tel: link is still selectable */ }
  };

  return <span
    onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
    onFocus={() => setHover(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHover(false); }}
    onClick={(e) => e.stopPropagation()}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...style }}>
    <a href={`tel:${n.e164 || n.digits}`} onClick={call} draggable={false} title={`Call ${name ? name + ' · ' : ''}${text}`}
      data-phone-link=""
      style={{ color: hover ? '#007AFF' : 'inherit', textDecoration: 'none', cursor: 'pointer', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', transition: 'color .12s' }}>
      {text}
    </a>
    <button type="button" onClick={copy} aria-label={`Copy ${text}`} title={copied ? 'Copied' : 'Copy number'} tabIndex={0}
      style={{ width: 20, height: 20, padding: 0, border: 'none', borderRadius: 5, background: hover ? 'rgba(0,0,0,0.05)' : 'transparent', color: copied ? '#248A3D' : '#8E8E93', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: hover || copied ? 1 : 0, transition: 'opacity .12s', flex: 'none' }}>
      <Icon name={copied ? 'check' : 'copy'} size={12} />
    </button>
  </span>;
}

export default PhoneLink;
