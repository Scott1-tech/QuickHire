/* Lazily rendered document pages shared by the editor, signing session and
   manage previews. */
import React from 'react';
import { EDoc } from './model';
import { usePageUrl } from './pdf';
import { Icon } from './ui';

export function PageImage({ doc, page, eager = false, label }: { doc: EDoc; page: number; eager?: boolean; label?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { url, err } = usePageUrl(doc, page, ref, eager);
  return <div ref={ref} aria-label={label || `${doc.name}, page ${page + 1}`} role="img" style={{ position: 'absolute', inset: 0, background: '#fff', overflow: 'hidden' }}>
    {url ? <img src={url} alt="" draggable={false} style={{ display: 'block', width: '100%', height: '100%', userSelect: 'none', pointerEvents: 'none' }} />
      : !err && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,#FAFAFB 0%,#F1F2F4 50%,#FAFAFB 100%)', backgroundSize: '200% 100%', animation: 'qhShimmer 1.2s linear infinite' }} />}
    {err && <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#8E8E93', fontSize: 12.5 }}><Icon name="alert" size={20} />This page could not be displayed on this device.</div>}
  </div>;
}

/** One-time global keyframes used by e-sign surfaces. */
export function EsignStyles() {
  return <style>{`
    @keyframes qhShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
    @keyframes qhGlow { 0%,100% { filter: drop-shadow(0 1px 2px rgba(0,0,0,0.18)); } 50% { filter: drop-shadow(0 0 7px rgba(255,190,0,0.95)); } }
    .qh-esign-field:focus-visible { outline: 2px solid #007AFF; outline-offset: 1px; }
    .qh-esign-scroll { scrollbar-gutter: stable; }
  `}</style>;
}
