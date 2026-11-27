/* Navigation bridge so the phone (mounted once, outside every page) can open a
   driver or lead profile. QuickHire registers the navigator; the Pipelines
   page picks up "open this lead" requests with takePendingLead. */

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

/* lead-open requests: held until the Pipelines page picks them up. The page
   reads the request right after it resets for a navigation, so a request made
   together with go('recruiting') is never wiped by that reset. */
let pendingLead: string | null = null;

export function requestLeadOpen(id: string) { pendingLead = id || null; }

/** Pipelines page: take (and clear) the lead the phone asked to open, if any. */
export function takePendingLead(): string | null { const id = pendingLead; pendingLead = null; return id; }
