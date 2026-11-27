/* Navigation bridge so the phone (mounted once, outside every page) can open a
   driver or lead profile. QuickHire registers the navigator; the recruiting
   board subscribes to "open this lead" requests with useLeadOpenRequests. */
import React from 'react';

export type Navigator = {
  openDriver: (id: string) => void;
  openLead: (id: string) => void;
  openSettings: () => void;
};

let nav: Navigator | null = null;
export function setPhoneNavigator(n: Navigator | null) { nav = n; }

export function openRecord(kind: 'lead' | 'driver', id: string): boolean {
  if (!nav || !id) return false;
  if (kind === 'driver') nav.openDriver(id); else nav.openLead(id);
  return true;
}
export function openPhoneSettings(): boolean { if (!nav) return false; nav.openSettings(); return true; }

/* lead-open requests: delivered to the mounted recruiting board, or held until it mounts */
let pendingLead: string | null = null;
const leadListeners = new Set<(id: string) => void>();

export function requestLeadOpen(id: string) {
  if (leadListeners.size) leadListeners.forEach((l) => l(id));
  else pendingLead = id;
}

/** Recruiting board hook: open a lead profile when the phone asks for one. */
export function useLeadOpenRequests(open: (id: string) => void) {
  const ref = React.useRef(open);
  ref.current = open;
  React.useEffect(() => {
    if (pendingLead) { const id = pendingLead; pendingLead = null; ref.current(id); }
    const l = (id: string) => ref.current(id);
    leadListeners.add(l);
    return () => { leadListeners.delete(l); };
  }, []);
}
