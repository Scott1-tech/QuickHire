import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon, Btn, Menu, MenuItem, SegTabs, useToasts, ToastHost } from '../tasks/lib';
import { useComms, svc, fmtWhen } from './store';

const OK = '#34C759', WARN = '#FF9500', ERR = '#FF3B30', PRI = '#007AFF';

export function riskLevel(snap: any) {
  if (!snap) return { label: 'Unknown', color: '#8E8E93' };
  if (snap.authorityStatus !== 'Active' || ['Conditional', 'Unsatisfactory'].includes(snap.safetyRating)) return { label: 'High', color: ERR };
  if (snap.safetyRating === 'None') return { label: 'Medium', color: WARN };
  return { label: 'Low', color: OK };
}
function authChip(status: string) {
  const ok = status === 'Active';
  const c = ok ? OK : status === 'Pending' ? WARN : ERR;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: c, background: c + '1f', borderRadius: 999, padding: '2px 10px' }}><span style={{ width: 6, height: 6, borderRadius: 999, background: c }} />{status}</span>;
}

/* ============================ RESULT CARD ============================ */
function ResultCard({ snap, onAction }: any) {
  const fields: any[] = [['Legal name', snap.legalName], ['DBA name', snap.dbaName || '—'], ['DOT number', snap.dotNumber], ['MC number', snap.mcNumber], ['Operating status', snap.operatingStatus], ['Physical address', snap.physicalAddress], ['Mailing address', snap.mailingAddress], ['Phone', snap.phone], ['Power units', snap.powerUnits], ['Drivers', snap.drivers], ['Safety rating', snap.safetyRating], ['MCS-150 date', snap.mcs150Date]];
  const risk = riskLevel(snap);
  return <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: `1px solid ${T.hair}` }}>
      <span style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(0,122,255,0.10)', color: PRI, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name="building" size={20} /></span>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 700 }}>{snap.legalName}</div><div style={{ fontSize: 12.5, color: T.faint }}>DOT {snap.dotNumber} · {snap.mcNumber} · {snap.state}</div></div>
      {authChip(snap.authorityStatus)}
      <span style={{ fontSize: 12, fontWeight: 600, color: risk.color, background: risk.color + '1f', borderRadius: 999, padding: '2px 10px' }}>{risk.label} risk</span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px', padding: '14px 18px' }}>
      {fields.map(([l, v]) => <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', fontSize: 13, borderBottom: `1px solid ${T.hair}` }}><span style={{ color: T.faint }}>{l}</span><span style={{ fontWeight: 550, textAlign: 'right' }}>{v}</span></div>)}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderTop: `1px solid ${T.hair}`, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11.5, color: T.faint, marginRight: 'auto' }}>{snap.source} · fetched {fmtWhen(snap.fetchedAt)} ago</span>
      <Btn variant="secondary" icon="externalLink" onClick={() => onAction('open')}>Open carrier</Btn>
      <Btn variant="secondary" icon="plus" onClick={() => onAction('create')}>Create carrier</Btn>
      <Btn variant="secondary" icon="check" onClick={() => onAction('apply')}>Apply to existing</Btn>
      <Btn variant="secondary" icon="listChecks" onClick={() => onAction('task')}>Create task</Btn>
      <Btn variant="primary" icon="eye" onClick={() => onAction('watch')}>Add to watchlist</Btn>
    </div>
  </div>;
}

/* ============================ RESEARCH OVERLAY ============================ */
export function FmcsaResearch({ onClose }: any) {
  const store = useComms();
  const { toasts, toast } = useToasts();
  const [tab, setTab] = React.useState('search');
  const [q, setQ] = React.useState('');
  const [state, setState] = React.useState('');
  const [result, setResult] = React.useState<any>(null);
  const [searched, setSearched] = React.useState(false);

  React.useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);

  const run = (kind: string) => {
    const query: any = kind === 'dot' ? { dot: q } : kind === 'mc' ? { mc: q } : { q, state };
    const r = svc.fmcsaLookup(query); setResult(r); setSearched(true);
    toast(r ? 'Carrier found · ' + r.legalName : 'No carrier found', r ? 'success' : 'warning');
  };
  const onAction = (a: string) => {
    if (!result) return;
    if (a === 'watch') { svc.addWatch(result); toast('Added to watchlist', 'success'); }
    else if (a === 'task') { svc._task({ title: `Review FMCSA carrier — ${result.legalName}`, related: result.legalName, relatedType: 'carrier', carrier: result.legalName, tags: ['Carrier Setup', 'Compliance'] }); toast('Task created', 'success'); }
    else if (a === 'create') toast('Carrier created from FMCSA data', 'success');
    else if (a === 'open') toast('Opening carrier profile…', 'info');
    else if (a === 'apply') toast('Apply to a carrier from its profile → Apply FMCSA Data', 'info');
  };

  const tabs = [{ key: 'search', label: 'Carrier Search', icon: 'search' }, { key: 'dot', label: 'DOT Lookup', icon: 'shield' }, { key: 'mc', label: 'MC Lookup', icon: 'fileText' }, { key: 'recent', label: 'Recent Searches', icon: 'clock' }, { key: 'watch', label: 'Watchlist', icon: 'eye' }];

  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 140, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3vh 2vw', animation: 'qhFade .16s ease' }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(900px, 96vw)', height: 'min(800px, 94vh)', background: T.bg, borderRadius: 16, boxShadow: '0 40px 100px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 56, flex: 'none', padding: '0 18px', background: '#fff', borderBottom: `1px solid ${T.border}` }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: '#1F4E9614', color: '#1F4E96', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="shield" size={17} /></span>
        <div style={{ fontSize: 16, fontWeight: 700 }}>FMCSA Research</div>
        <div style={{ flex: 1 }} />
        <Hover as="button" onClick={onClose} style={{ width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 9, color: T.muted, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="x" size={18} /></Hover>
      </div>
      <div style={{ padding: '14px 18px 0' }}><SegTabs value={tab} onChange={setTab} tabs={tabs} /></div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        {(tab === 'search' || tab === 'dot' || tab === 'mc') && <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, height: 42, padding: '0 14px', background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12 }}>
              <Icon name="search" size={16} style={{ color: T.faint }} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run(tab)} placeholder={tab === 'dot' ? 'Enter DOT number, e.g. 998812' : tab === 'mc' ? 'Enter MC number, e.g. MC-998812' : 'Search by name, DOT, MC, or phone'} style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, fontFamily: 'inherit' }} />
              {tab === 'search' && <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" style={{ width: 64, border: 'none', borderLeft: `1px solid ${T.hair}`, paddingLeft: 10, outline: 'none', fontSize: 13, fontFamily: 'inherit' }} />}
            </div>
            <Btn variant="primary" icon="search" style={{ height: 42 }} onClick={() => run(tab)}>Look Up</Btn>
          </div>
          {result ? <ResultCard snap={result} onAction={onAction} /> : searched ? <Empty icon="search" title="No carrier found" text="Check the DOT/MC number and try again." /> : <Empty icon="shield" title="Search FMCSA" text="Look up carriers by DOT, MC, name, or phone using public SAFER data." />}
          <p style={{ fontSize: 11.5, color: T.faint, marginTop: 14, lineHeight: 1.5 }}>Carrier authority and SAFER data are public. PSP and Clearinghouse require driver consent and authorized access and are not part of this lookup.</p>
        </>}

        {tab === 'recent' && <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
          {store.recentSearches.length === 0 ? <Empty icon="clock" title="No recent searches" text="Your FMCSA lookups will appear here." /> : store.recentSearches.map((r) => <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${T.hair}` }}>
            <span style={{ color: r.found ? OK : WARN }}><Icon name={r.found ? 'check' : 'search'} size={15} /></span>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 12, color: T.faint }}>“{r.term}” · {fmtWhen(r.at)} ago</div></div>
            {r.found && <Hover as="button" onClick={() => { const res = svc.fmcsaLookup({ dot: r.dot }); setResult(res); setTab(res ? 'search' : 'recent'); setSearched(true); }} style={{ height: 30, padding: '0 12px', fontSize: 12.5, fontWeight: 600, background: '#fff', border: `1px solid ${T.border}`, borderRadius: 9, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.04)' }}>View</Hover>}
          </div>)}
        </div>}

        {tab === 'watch' && <div>
          {store.watchlist.length === 0 ? <Empty icon="eye" title="Watchlist is empty" text="Add carriers from a search result to monitor authority, safety rating, and fleet-size changes." /> : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {store.watchlist.map((w) => <div key={w.id} style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: 14.5, fontWeight: 650 }}>{w.name}</div><div style={{ fontSize: 12, color: T.faint }}>DOT {w.dotNumber} · {w.mcNumber} · checked {fmtWhen(w.lastChecked)} ago</div></div>
                {authChip(w.authorityStatus)}
                <Hover as="button" onClick={() => { const ch = svc.checkWatch(w.id); toast(ch ? `Change detected: ${ch.field}` : 'No change', ch ? 'warning' : 'success'); }} style={{ height: 32, padding: '0 12px', fontSize: 12.5, fontWeight: 600, background: '#fff', border: `1px solid ${T.border}`, borderRadius: 9, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.04)' }}>Check now</Hover>
                <Hover as="button" onClick={() => svc.removeWatch(w.id)} style={{ width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 8, color: T.faint, cursor: 'pointer' }} hover={{ background: 'rgba(255,59,48,0.08)', color: ERR }}><Icon name="trash" size={15} /></Hover>
              </div>
              {w.change && <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.hair}`, fontSize: 12.5, color: '#A05A00', background: 'rgba(255,149,0,0.08)', borderRadius: 10, padding: '9px 12px' }}><Icon name="alert" size={14} />{w.change.field}: <b>{w.change.before}</b><Icon name="arrowRight" size={12} /><b>{w.change.after}</b> · task created</div>}
            </div>)}
          </div>}
        </div>}
      </div>
    </div>
    <ToastHost toasts={toasts} />
  </div>;
}

function Empty({ icon, title, text }: any) {
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 20px', textAlign: 'center', background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14 }}>
    <span style={{ width: 52, height: 52, borderRadius: 15, background: '#F2F2F7', color: T.faint, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon name={icon} size={24} /></span>
    <div style={{ fontSize: 16, fontWeight: 650, marginBottom: 5 }}>{title}</div>
    <div style={{ fontSize: 13, color: T.muted, maxWidth: 340 }}>{text}</div>
  </div>;
}

/* ============================ APPLY MODAL ============================ */
const FIELD_MAP: any[] = [
  ['name', 'Legal name', 'legalName'], ['dba', 'DBA name', 'dbaName'], ['dot', 'DOT number', 'dotNumber'], ['mc', 'MC number', 'mcNumber'], ['phone', 'Phone', 'phone'], ['address', 'Address', 'physicalAddress'],
];
export function ApplyFmcsaModal({ carrier, snap, onClose, onApplied }: any) {
  const [picked, setPicked] = React.useState<Record<string, boolean>>(() => { const o: any = {}; FIELD_MAP.forEach(([k]) => { o[k] = String(carrier[k] || '').trim().toLowerCase() !== String(snap[FIELD_MAP.find((f) => f[0] === k)![2]] || '').trim().toLowerCase(); }); return o; });
  const apply = (all: boolean) => {
    FIELD_MAP.forEach(([k, , src]) => { if (all || picked[k]) { if (k === 'name') carrier.name = snap.legalName; else if (k === 'dba') carrier.dba = snap.dbaName || '—'; else if (k === 'dot') carrier.dot = snap.dotNumber; else if (k === 'mc') carrier.mc = snap.mcNumber; else carrier[k] = snap[src]; } });
    carrier.auth = snap.authorityStatus === 'Active' ? 'active' : 'pending';
    svc.applyFmcsa(carrier.id, { ...snap });
    onApplied && onApplied(); onClose();
  };
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4vh 2vw', animation: 'qhFade .16s ease' }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(620px, 95vw)', maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderRadius: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 0' }}>
        <div><h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Apply FMCSA Data</h2><div style={{ fontSize: 12.5, color: T.faint, marginTop: 3 }}>Review changes before applying to {carrier.name}</div></div>
        <Hover as="button" onClick={onClose} style={{ width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 8, color: T.muted, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.06)' }}><Icon name="x" size={17} /></Hover>
      </div>
      <div style={{ padding: '16px 22px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '24px 1.4fr 1.4fr', gap: 8, gridColumn: '1 / -1', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', color: T.faint, padding: '0 0 6px' }}><span /><span>Current</span><span>FMCSA</span></div>
          {FIELD_MAP.map(([k, label, src]) => { const cur = k === 'dba' ? carrier.dba : carrier[k]; const fm = src === 'dbaName' ? (snap.dbaName || '—') : snap[src]; const diff = String(cur || '').trim().toLowerCase() !== String(fm || '').trim().toLowerCase(); return (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '24px 1.4fr 1.4fr', gap: 8, gridColumn: '1 / -1', alignItems: 'center', padding: '9px 0', borderTop: `1px solid ${T.hair}` }}>
              <button onClick={() => diff && setPicked((p) => ({ ...p, [k]: !p[k] }))} style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${picked[k] ? '#007AFF' : 'rgba(0,0,0,0.25)'}`, background: picked[k] ? '#007AFF' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: diff ? 'pointer' : 'default', opacity: diff ? 1 : 0.35 }}>{picked[k] && <Icon name="check" size={12} />}</button>
              <div><div style={{ fontSize: 10.5, color: T.faint }}>{label}</div><div style={{ fontSize: 13, fontWeight: 550 }}>{cur || '—'}</div></div>
              <div style={{ background: diff ? 'rgba(0,122,255,0.06)' : 'transparent', borderRadius: 8, padding: '4px 8px' }}><div style={{ fontSize: 10.5, color: T.faint }}>{label}</div><div style={{ fontSize: 13, fontWeight: 600, color: diff ? '#0066CC' : T.text }}>{fm || '—'}</div></div>
            </div>); })}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px 20px', borderTop: `1px solid ${T.hair}` }}>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn variant="secondary" onClick={() => apply(false)}>Apply selected</Btn>
        <Btn variant="primary" icon="check" onClick={() => apply(true)}>Apply all</Btn>
      </div>
    </div>
  </div>;
}

/* ============================ CARRIER PROFILE PANEL ============================ */
export function CarrierFmcsaPanel({ carrier, onChange }: any) {
  const store = useComms();
  const { toasts, toast } = useToasts();
  const [apply, setApply] = React.useState<any>(null);
  const snap = svc.snapshotFor(carrier.id);
  const mismatches = snap ? svc.detectMismatches(carrier, snap) : [];
  const risk = riskLevel(snap);

  const lookupAndApply = () => {
    const r = svc.fmcsaLookup({ dot: carrier.dot }) || svc.fmcsaLookup({ name: carrier.name });
    if (!r) return toast('Carrier not found in FMCSA', 'warning');
    setApply(r);
  };

  return <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
    <ToastHost toasts={toasts} />
    {apply && <ApplyFmcsaModal carrier={carrier} snap={apply} onClose={() => setApply(null)} onApplied={() => { toast('FMCSA data applied', 'success'); onChange && onChange(); }} />}
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${T.hair}` }}>
      <span style={{ width: 30, height: 30, borderRadius: 8, background: '#1F4E9614', color: '#1F4E96', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="shield" size={16} /></span>
      <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 650 }}>FMCSA Compliance</div><div style={{ fontSize: 11.5, color: T.faint }}>{snap ? `Last FMCSA update ${snap.mcs150Date} · checked ${fmtWhen(snap.fetchedAt)} ago` : 'No FMCSA snapshot yet'}</div></div>
      <Btn variant="primary" icon="refresh" onClick={lookupAndApply}>Apply FMCSA Data</Btn>
    </div>

    {snap ? <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '2px 18px', padding: '14px 18px' }}>
        <Stat label="DOT status" value={snap.operatingStatus} />
        <Stat label="Authority" value={snap.authorityStatus} color={snap.authorityStatus === 'Active' ? OK : WARN} />
        <Stat label="Safety rating" value={snap.safetyRating} />
        <Stat label="Power units" value={snap.powerUnits} />
        <Stat label="Drivers" value={snap.drivers} />
        <Stat label="Risk level" value={risk.label} color={risk.color} />
      </div>
      {mismatches.length > 0 && <div style={{ borderTop: `1px solid ${T.hair}`, padding: '12px 18px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', color: T.faint, marginBottom: 8 }}>{mismatches.length} mismatch{mismatches.length > 1 ? 'es' : ''} detected</div>
        {mismatches.map((m: any) => <div key={m.field} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: `1px solid ${T.hair}` }}>
          <span style={{ color: m.severity === 'error' ? ERR : WARN }}><Icon name="alert" size={15} /></span>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</div><div style={{ fontSize: 11.5, color: T.faint }}>QuickHire: {m.currentValue || '—'} · FMCSA: {m.fmcsaValue}</div></div>
          <Hover as="button" onClick={() => { svc.createMismatchTask(carrier.name, m); toast('Mismatch task created', 'success'); }} style={{ height: 30, padding: '0 11px', fontSize: 12, fontWeight: 600, background: '#fff', border: `1px solid ${T.border}`, borderRadius: 9, cursor: 'pointer', flex: 'none' }} hover={{ background: 'rgba(0,0,0,0.04)' }}>Create task</Hover>
        </div>)}
      </div>}
    </> : <div style={{ padding: '18px', fontSize: 13, color: T.muted }}>Pull verified carrier details, authority status, safety rating and fleet size from FMCSA. Click <b>Apply FMCSA Data</b> to fetch and compare.</div>}
  </div>;
}
function Stat({ label, value, color }: any) { return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', fontSize: 13, borderBottom: `1px solid ${T.hair}` }}><span style={{ color: T.faint }}>{label}</span><span style={{ fontWeight: 650, color: color || T.text }}>{value}</span></div>; }
