import { useEffect, type ReactNode } from 'react';
import Icon from '@/components/Icon';

/**
 * Centered, ClickUp-style record modal. Opens in the middle of the screen (not a
 * side slide-over) with a type chip + context breadcrumb in the header, a large
 * scrollable body for the record's fields, and an optional sticky footer.
 */
export default function RecordModal({
  open, onClose, icon, tint = '#EEF2FF', accent = '#6366F1',
  typeLabel, context, children, footer, width = 720,
}: {
  open: boolean;
  onClose: () => void;
  icon: string;
  tint?: string;
  accent?: string;
  typeLabel: string;
  context?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/50 animate-[fadeIn_.15s_ease]" onClick={onClose} />
      <div
        role="dialog" aria-modal="true"
        style={{ width }}
        className="relative max-w-full max-h-[90vh] bg-surface rounded-2xl shadow-pop border border-line flex flex-col overflow-hidden animate-[popIn_.18s_cubic-bezier(.16,1,.3,1)]"
      >
        {/* Header — type chip + context, like ClickUp's breadcrumb bar */}
        <header className="flex items-center gap-2.5 px-5 py-3 border-b border-line">
          <span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold"
            style={{ background: tint, color: accent }}>
            <Icon name={icon} size={14} /> {typeLabel}
          </span>
          {context && <span className="text-[12px] text-muted truncate">/ {context}</span>}
          <button onClick={onClose} title="Close"
            className="ml-auto grid place-items-center w-8 h-8 rounded-lg text-muted hover:bg-[var(--surface-hover)] hover:text-ink transition">
            <Icon name="close" size={18} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">{children}</div>

        {/* Footer */}
        {footer && (
          <footer className="border-t border-line px-6 py-3.5 bg-[var(--surface-hover)] flex items-center gap-2">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/* ── Building blocks for ClickUp-style record forms ──────────────────────────── */

/** The big editable record title at the top of the modal body (like "Gym"). */
export function TitleInput({ value, onChange, placeholder, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean;
}) {
  return (
    <input
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-[26px] leading-tight font-extrabold text-ink bg-transparent outline-none placeholder:text-muted/40 mb-5"
    />
  );
}

/** A labelled property row (icon + label on the left, control on the right). */
export function PropRow({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className="flex items-center gap-2 w-40 flex-shrink-0 text-[13px] text-muted pt-2">
        <Icon name={icon} size={15} /> {label}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
