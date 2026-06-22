import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Icon from '@/components/Icon';

// ClickUp-style right-hand slide-over panel. Opens in place over the dashboard
// (nothing navigates away) and carries a "hint" footer linking to the full page.
export default function Drawer({
  open, onClose, icon, tint = '#EEF2FF', accent = '#6366F1', title, subtitle, children, hint,
}: {
  open: boolean;
  onClose: () => void;
  icon: string;
  tint?: string;
  accent?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  hint?: { to: string; label: string };
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 animate-[fadeIn_.15s_ease]" onClick={onClose} />
      <div
        role="dialog" aria-modal="true"
        className="absolute right-0 top-0 h-full w-[460px] max-w-full bg-surface border-l border-line shadow-pop flex flex-col animate-[slideIn_.2s_cubic-bezier(.16,1,.3,1)]"
      >
        <header className="flex items-center gap-3 px-5 py-4 border-b border-line">
          <div className="w-9 h-9 rounded-[10px] grid place-items-center flex-shrink-0" style={{ background: tint, color: accent }}>
            <Icon name={icon} size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-extrabold text-ink truncate">{title}</div>
            {subtitle && <div className="text-xs text-muted truncate">{subtitle}</div>}
          </div>
          <button
            onClick={onClose} title="Close"
            className="ml-auto grid place-items-center w-8 h-8 rounded-lg text-muted hover:bg-[var(--surface-hover)] hover:text-ink transition"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">{children}</div>

        {hint && (
          <div className="border-t border-line px-5 py-3.5 bg-[var(--surface-hover)]">
            <Link to={hint.to} onClick={onClose} className="flex items-center gap-2 text-[13px] font-semibold text-primary hover:gap-3 transition-all">
              {hint.label}
              <Icon name="arrowRight" size={16} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
