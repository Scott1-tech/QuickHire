/* QuickHire hooks for e-Sign: driver directory + merge data, activity log,
   notifications (incl. 48h unsigned alerts), filing completed PDFs into the
   driver's documents and the `qh:esign-completed` pipeline hand-off.
   Kept out of store.ts so the e-sign store has no import cycle with the
   hire/recruit/shell stores (shell/store imports esign/store). */
import { onEsignEvent, svc, store as esignStore, migrateLegacyBlobs, EsignEvent } from './store';
import { Person, STATUS_META, Envelope } from './model';
import { store as hireStore, svc as hireSvc } from '../hire/store';
import { store as recruitStore, svc as recruitSvc } from '../recruit/store';
import { svc as shellSvc } from '../shell/store';
import { saveFile } from '../shell/files';
import { flattenEnvelope } from './pdfgen';
import { sha256Hex } from './blobs';

/* ── people directory ── */
export function personFromDriver(d: any): Person {
  const c = d.carrier ? hireSvc.carrierByName(d.carrier) : null;
  return {
    kind: 'driver', id: d.id, name: d.name, email: d.email, phone: d.phone, address: d.address || d.location || '',
    cdlNumber: d.cdlNumber || d.application?.cdlNumber || '', cdlState: d.cdlState || '', cdlClass: d.cdlClass || '',
    position: d.position || '', payRate: d.application?.payRate || '', startDate: d.application?.startDate || '',
    carrier: d.carrier || '', carrierInfo: c ? { name: c.name, dot: c.dot, mc: c.mc, address: c.address } : { name: d.carrier || '' },
  };
}
export function personFromLead(l: any): Person {
  return { kind: 'lead', id: l.id, name: l.name, email: l.email, phone: l.phone, address: l.location || '', cdlClass: String(l.licenseType || '').replace(/^Class\s*/i, ''), carrier: l.carrier || '', carrierInfo: { name: l.carrier || '' } };
}
export function listPeople(): Person[] {
  const drivers = (hireStore.drivers || []).filter((d: any) => !d.archived).map(personFromDriver);
  const names = new Set(drivers.map((d: Person) => d.name.toLowerCase()));
  const leads = (recruitStore.leads || []).filter((l: any) => !l.archived && !names.has(String(l.name).toLowerCase())).map(personFromLead);
  return [...drivers, ...leads];
}
export function findPerson(id?: string): Person | null {
  if (!id) return null;
  const d = hireSvc.driver(id); if (d) return personFromDriver(d);
  const l = recruitSvc.lead(id); return l ? personFromLead(l) : null;
}
export function personForEnvelope(env: Pick<Envelope, 'driverId' | 'leadId'>): Person | null { return findPerson(env.driverId || env.leadId); }

/* ── activity + notifications ── */
const LABEL: Record<string, string> = { sent: 'sent for signature', viewed: 'delivered', partially_signed: 'partially signed', completed: 'completed', declined: 'declined', voided: 'voided', expired: 'expired', correcting: 'being corrected' };
function log(env: Envelope, title: string, detail = '') {
  const entity = { type: 'envelope', id: env.id };
  if (env.driverId && hireSvc.driver(env.driverId)) hireSvc.log(env.driverId, 'docusign', title, detail);
  else shellSvc.logActivity('docusign', env.driverName ? `${env.driverName}: ${title}` : title, detail, entity);
}

function handle(e: EsignEvent) {
  const env = e.env;
  switch (e.type) {
    case 'status':
      if (e.to && LABEL[e.to]) log(env, `e-Sign "${env.title}" ${LABEL[e.to]}`, `${STATUS_META[e.from || '']?.label || e.from} → ${STATUS_META[e.to]?.label || e.to}`);
      if (e.to === 'declined') shellSvc.notify('action', `${env.title} was declined`, env.declineReason || 'A recipient declined to sign.');
      if (e.to === 'expired') shellSvc.notify('action', `${env.title} expired`, 'Resend or clone it to collect signatures.');
      break;
    case 'signed': if (e.recipient) log(env, `${e.recipient.name} ${e.recipient.action === 'view' ? 'reviewed' : e.recipient.action === 'approve' ? 'approved' : 'signed'} "${env.title}"`); break;
    case 'reminded': log(env, `e-Sign reminder sent for "${env.title}"`, e.detail === 'auto' ? 'Automatic reminder' : 'Manual reminder'); break;
    case 'delegated': if (e.recipient) log(env, `"${env.title}" reassigned to ${e.recipient.name}`); break;
    case 'corrected': log(env, `"${env.title}" corrected and re-sent`); break;
    case 'stale': shellSvc.notify('sign', `${env.title} unsigned for 48h`, `Still waiting for ${e.detail || 'a recipient'} — send a reminder or call the driver.`); break;
    case 'completed': shellSvc.notify('sign', `${env.title} completed`, env.driverName ? `Signed PDF filed to ${env.driverName}'s documents.` : 'All recipients signed.'); fileCompleted(env.id).catch((err) => console.warn('[esign] filing failed', err)); break;
  }
}

/* ── filing the completed PDF ── */
const DOC_MATCH: Record<string, string[]> = {
  offer_letter: ['Offer Letter'], company_driver_agreement: ['Driver Agreement'], owner_operator_agreement: ['Driver Agreement'],
  w9: ['W-9'], drug_testing_consent: ['Drug Test Consent'], clearinghouse_consent: ['Clearinghouse Consent'],
  equipment_lease: ['Truck Assignment Form'],
};
const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function matchingDocNames(env: Envelope, available: string[]): string[] {
  const hits = new Set<string>();
  for (const d of env.documents) {
    for (const n of (d.catalogKey && DOC_MATCH[d.catalogKey]) || []) if (available.includes(n)) hits.add(n);
    const dn = norm(d.name);
    for (const n of available) { const an = norm(n); if (an.length > 2 && (dn.includes(an) || an.includes(dn))) hits.add(n); }
  }
  return [...hits];
}

const filing = new Set<string>();
export async function fileCompleted(envId: string) {
  const env = svc.envelope(envId);
  if (!env || env.status !== 'completed' || env.signedFileId || filing.has(envId)) return;
  filing.add(envId);
  try {
    const signed = await flattenEnvelope(env);
    const hash = await sha256Hex(signed);
    if (env.certificate) env.certificate.docHash = hash;
    const full = await flattenEnvelope(env, { includeCertificate: true });
    const name = `${env.title.replace(/[\\/:*?"<>|]+/g, '')} (signed).pdf`;
    const rec = await saveFile(new File([full as BlobPart], name, { type: 'application/pdf' }));
    svc.setSignedFile(env.id, rec.id, hash);
    if (env.driverId) {
      const d = hireSvc.driver(env.driverId);
      if (d) {
        const names = matchingDocNames(env, (d.documents || []).map((x: any) => x.name));
        if (names.length) names.forEach((n) => { const doc = d.documents.find((x: any) => x.name === n); if (doc) hireSvc.setDocFile(d.id, doc.key, rec.id, rec.name); });
        else hireSvc.addDocument(d.id, `${env.title} (signed)`, 'collected', rec.id, rec.name);
      }
    }
    if (env.leadId) {
      const l = recruitSvc.lead(env.leadId);
      if (l) matchingDocNames(env, (l.documents || []).map((x: any) => x.name)).forEach((n) => recruitSvc.setDocFile(l.id, n, rec.id, rec.name));
    }
    window.dispatchEvent(new CustomEvent('qh:esign-completed', { detail: { driverName: env.driverName, driverId: env.driverId || env.leadId || null, envelopeId: env.id, title: env.title, fileId: rec.id } }));
  } finally { filing.delete(envId); }
}

/* ── boot ── */
let booted = false;
export function bootEsignIntegrations() {
  if (booted || typeof window === 'undefined') return;
  booted = true;
  onEsignEvent(handle);
  setTimeout(() => {
    try { svc.tick(); } catch (err) { console.warn('[esign] tick failed', err); }
    migrateLegacyBlobs().catch(() => {});
    // completed envelopes from before this build (or a closed tab) still get filed
    esignStore.envelopes.filter((x) => x.status === 'completed' && !x.signedFileId && x.driverId && x.recipients.some((r) => r.signature?.sigUrl)).slice(0, 5).forEach((x) => fileCompleted(x.id).catch(() => {}));
  }, 1200);
  setInterval(() => { try { svc.tick(); } catch { /* ignore */ } }, 60_000);
}
bootEsignIntegrations();
