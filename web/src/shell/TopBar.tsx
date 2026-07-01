import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon, useToasts, ToastHost } from '../tasks/lib';
import { Modal, Field, Input, Textarea, Select, primaryBtn, ghostBtn } from '../esign/ui';
import { useShell, svc, fmtAgo } from './store';
import { addExternalTask, makeTask } from '../tasks/bus';
import { saveFile, openFile, fmtSize } from './files';

type Props = {
  go: (page: string) => void;
  openCandidate: (id: string) => void;
  openTasks: () => void;
  taskCount: number;
  drivers: any[];
  carriers: any[];
  toggleTheme: () => void;
  themeDark: boolean;
};

const NID = 'NP';

export function TopBar({ go, openCandidate, openTasks, taskCount, drivers, carriers, toggleTheme, themeDark }: Props) {
  const store = useShell();
  const { toasts, toast } = useToasts();
  const [menu, setMenu] = React.useState<'' | 'create' | 'notif' | 'account'>('');
  const [search, setSearch] = React.useState(false);
  const [modal, setModal] = React.useState<string>('');
  const fileRef = React.useRef<HTMLInputElement>(null);
  const unread = store.notifications.filter((n: any) => !n.read).length;

  const carrierOpts = carriers.map((c) => ({ value: c.name, label: c.name }));
  const driverOpts = drivers.map((d) => ({ value: d.id, label: `${d.name} · ${d.carrier}` }));

  const CREATE_ITEMS = [
    { key: 'candidate', label: 'Create Candidate', icon: 'userPlus' },
    { key: 'driver', label: 'Create Driver', icon: 'user' },
    { key: 'task', label: 'Create Task', icon: 'listChecks' },
    { key: 'note', label: 'Create Note', icon: 'message' },
    { key: 'document', label: 'Upload Document', icon: 'upload' },
    { key: 'application_sent', label: 'Send Application', icon: 'send' },
    { key: 'offer', label: 'Send Offer Package', icon: 'briefcase' },
    { key: 'envelope', label: 'Start DocuSign Envelope', icon: 'sign' },
    { key: 'truck_assignment', label: 'Add Truck Assignment', icon: 'truck' },
    { key: 'carrier_form', label: 'Add Carrier Form', icon: 'building' },
    { key: 'insurance_requirement', label: 'Add Insurance Requirement', icon: 'shield' },
  ];

  const onCreate = (key: string) => {
    setMenu('');
    if (key === 'document') { fileRef.current?.click(); return; }
    if (key === 'offer') { go('docusign'); toast('Choose a package to send', 'info'); return; }
    if (key === 'envelope') { go('docusign'); toast('Start an envelope in e-Signature', 'info'); return; }
    setModal(key);
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      const stored = await saveFile(f);
      svc.addRecord('document', { name: f.name, subtitle: `${fmtSize(f.size)} · uploaded`, fileId: stored.id });
      toast(`Uploaded ${f.name}${stored.persisted ? '' : ' (too large to persist — kept for this session)'}`, 'success');
    } catch { toast('Could not read that file', 'error'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  return <>
    <ToastHost toasts={toasts} />
    <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} />

    {/* search box */}
    <Hover as="button" onClick={() => setSearch(true)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: 340, maxWidth: '34vw', height: 38, padding: '0 12px', background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, cursor: 'text', color: T.faint }} hover={{ borderColor: 'rgba(0,0,0,0.16)' }}>
      <Icon name="search" size={17} />
      <span style={{ flex: 1, textAlign: 'left', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Search drivers, carriers, documents, tasks…</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: T.faint, background: '#F2F2F7', border: `1px solid ${T.hair}`, borderRadius: 6, padding: '2px 6px' }}>⌘K</span>
    </Hover>
    <div style={{ flex: 1 }} />

    {/* Create */}
    <div style={{ position: 'relative' }}>
      <Hover as="button" onClick={() => setMenu(menu === 'create' ? '' : 'create')} style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', background: '#007AFF', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }} hover={{ background: '#0066D6' }}><Icon name="plus" size={17} /><span>Create</span></Hover>
      {menu === 'create' && <Dropdown onClose={() => setMenu('')} width={250}>
        {CREATE_ITEMS.map((it) => <MenuRow key={it.key} icon={it.icon} label={it.label} onClick={() => onCreate(it.key)} />)}
      </Dropdown>}
    </div>

    {/* Tasks */}
    <Hover as="button" onClick={openTasks} title="Tasks" style={iconBtnBox} hover={{ background: 'rgba(0,0,0,0.03)' }}>
      <Icon name="list" size={18} />
      <span style={badge}>{taskCount}</span>
    </Hover>

    {/* Notifications */}
    <div style={{ position: 'relative' }}>
      <Hover as="button" onClick={() => setMenu(menu === 'notif' ? '' : 'notif')} title="Notifications" style={iconBtnBox} hover={{ background: 'rgba(0,0,0,0.03)' }}>
        <Icon name="bell" size={18} />
        {unread > 0 && <span style={{ position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: 999, background: '#FF3B30', border: '1.5px solid #fff' }} />}
      </Hover>
      {menu === 'notif' && <Dropdown onClose={() => setMenu('')} width={340} align="right">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 8px' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Notifications</span>
          {unread > 0 && <button onClick={() => svc.markAllRead()} style={{ border: 'none', background: 'transparent', color: '#007AFF', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Mark all read</button>}
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {store.notifications.length === 0 && <div style={{ fontSize: 12.5, color: T.faint, padding: 16, textAlign: 'center' }}>You're all caught up.</div>}
          {store.notifications.map((n: any) => <button key={n.id} onClick={() => svc.markRead(n.id)} style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', padding: '9px 8px', border: 'none', borderTop: `1px solid ${T.hair}`, background: n.read ? 'transparent' : 'rgba(0,122,255,0.04)', cursor: 'pointer', borderRadius: 8 }}>
            <span style={{ width: 28, height: 28, flex: 'none', borderRadius: 999, background: NOTIF[n.kind]?.bg || '#F2F2F7', color: NOTIF[n.kind]?.color || T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={NOTIF[n.kind]?.icon || 'bell'} size={14} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600 }}>{n.title}</div>{n.body && <div style={{ fontSize: 11.5, color: T.muted, marginTop: 1 }}>{n.body}</div>}<div style={{ fontSize: 10.5, color: T.faint, marginTop: 2 }}>{fmtAgo(n.at)}</div></div>
            {!n.read && <span style={{ width: 7, height: 7, flex: 'none', borderRadius: 999, background: '#007AFF', marginTop: 6 }} />}
          </button>)}
        </div>
      </Dropdown>}
    </div>

    {/* Account */}
    <div style={{ position: 'relative' }}>
      <Hover as="button" onClick={() => setMenu(menu === 'account' ? '' : 'account')} style={{ width: 36, height: 36, flex: 'none', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg,#007AFF,#4DA2FF)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 650, cursor: 'pointer' }} hover={{ opacity: 0.9 }}>{NID}</Hover>
      {menu === 'account' && <Dropdown onClose={() => setMenu('')} width={230} align="right">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 12px', borderBottom: `1px solid ${T.hair}`, marginBottom: 6 }}>
          <span style={{ width: 38, height: 38, borderRadius: 999, background: 'linear-gradient(135deg,#007AFF,#4DA2FF)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{NID}</span>
          <div><div style={{ fontSize: 13.5, fontWeight: 650 }}>Nina Patel</div><div style={{ fontSize: 11.5, color: T.faint }}>Recruiter · GRAND ONE LLC</div></div>
        </div>
        <MenuRow icon="user" label="My account" onClick={() => { setMenu(''); go('settings'); }} />
        <MenuRow icon="settings" label="Settings" onClick={() => { setMenu(''); go('settings'); }} />
        <MenuRow icon={themeDark ? 'eye' : 'layout'} label={themeDark ? 'Light sidebar' : 'Dark sidebar'} onClick={() => { setMenu(''); toggleTheme(); }} />
        <MenuRow icon="message" label="Help & support" onClick={() => { setMenu(''); toast('Support: support@quickhire.app', 'info'); }} />
        <div style={{ borderTop: `1px solid ${T.hair}`, margin: '6px 0' }} />
        <MenuRow icon="ban" label="Log out" danger onClick={() => { setMenu(''); toast('Logged out (simulated)', 'info'); }} />
      </Dropdown>}
    </div>

    {/* search overlay */}
    {search && <SearchOverlay onClose={() => setSearch(false)} drivers={drivers} carriers={carriers} onPick={(a: any) => {
      setSearch(false);
      if (a.kind === 'candidate') openCandidate(a.id);
      else if (a.kind === 'page') go(a.page);
      else if (a.kind === 'file') { if (!openFile(a.fileId)) toast('File unavailable', 'error'); }
    }} />}

    {/* create modals */}
    {modal && <CreateModal type={modal} carrierOpts={carrierOpts} driverOpts={driverOpts} drivers={drivers} go={go} toast={toast} onClose={() => setModal('')} />}
  </>;
}

const NOTIF: Record<string, any> = {
  action: { icon: 'alert', bg: 'rgba(255,159,10,0.16)', color: '#A05A00' },
  sign: { icon: 'sign', bg: 'rgba(0,122,255,0.12)', color: '#0066CC' },
  info: { icon: 'checkCircle', bg: 'rgba(52,199,89,0.14)', color: '#248A3D' },
};
const iconBtnBox: React.CSSProperties = { position: 'relative', width: 36, height: 36, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, color: '#3a3a3c', cursor: 'pointer' };
const badge: React.CSSProperties = { position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999, background: '#007AFF', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fff' };

function Dropdown({ children, onClose, width = 240, align = 'right' }: any) {
  return <><div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
    <div style={{ position: 'absolute', top: 46, [align]: 0, zIndex: 41, width, background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: '0 16px 40px rgba(0,0,0,0.16)', padding: 6 } as React.CSSProperties}>{children}</div></>;
}
function MenuRow({ icon, label, onClick, danger }: any) {
  return <Hover as="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '9px 10px', border: 'none', background: 'transparent', borderRadius: 9, fontSize: 13, cursor: 'pointer', color: danger ? '#C62820' : T.text }} hover={{ background: danger ? 'rgba(255,59,48,0.08)' : 'rgba(0,0,0,0.05)' }}><Icon name={icon} size={16} style={{ color: danger ? '#C62820' : T.muted }} />{label}</Hover>;
}

/* ───────────── create modals ───────────── */
function CreateModal({ type, carrierOpts, driverOpts, drivers, go, toast, onClose }: any) {
  const CFG: Record<string, any> = {
    candidate: { title: 'Create candidate', sub: 'Add a new applicant to the hiring pipeline.', fields: [['name', 'Full name', 'text'], ['phone', 'Phone', 'text'], ['email', 'Email', 'text'], ['carrier', 'Hiring carrier', 'select', carrierOpts], ['position', 'Position', 'select', [{ value: 'Company Driver', label: 'Company Driver' }, { value: 'Owner Operator', label: 'Owner Operator' }]]], after: () => go('pipeline') },
    driver: { title: 'Create driver', sub: 'Add a driver record.', fields: [['name', 'Full name', 'text'], ['phone', 'Phone', 'text'], ['email', 'Email', 'text'], ['carrier', 'Carrier', 'select', carrierOpts], ['cdl', 'CDL class', 'select', [{ value: 'A', label: 'Class A' }, { value: 'B', label: 'Class B' }, { value: 'C', label: 'Class C' }]]] },
    task: { title: 'Create task', sub: 'Add a task to the workdeck.', fields: [['title', 'Task title', 'text'], ['due', 'Due date', 'date'], ['priority', 'Priority', 'select', [{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }, { value: 'low', label: 'Low' }]], ['assignee', 'Assignee', 'text']] },
    note: { title: 'Create note', sub: 'Save a note to the activity log.', fields: [['title', 'Title', 'text'], ['detail', 'Note', 'area']] },
    application_sent: { title: 'Send application', sub: 'Email a driver application link.', fields: [['driver', 'Candidate', 'select', driverOpts], ['template', 'Template', 'select', [{ value: 'standard', label: 'Standard Application' }, { value: 'oo', label: 'Owner-Operator Application' }]]] },
    truck_assignment: { title: 'Add truck assignment', sub: 'Assign equipment to a driver.', fields: [['carrier', 'Carrier', 'select', carrierOpts], ['unit', 'Unit number', 'text'], ['vin', 'VIN', 'text'], ['plate', 'Plate', 'text'], ['trailer', 'Trailer (optional)', 'text']] },
    carrier_form: { title: 'Add carrier form', sub: 'Create a carrier folder entry.', fields: [['name', 'Carrier name', 'text'], ['dot', 'DOT number', 'text'], ['mc', 'MC number', 'text'], ['contact', 'Contact person', 'text'], ['email', 'Contact email', 'text']] },
    insurance_requirement: { title: 'Add insurance requirement', sub: 'Define a coverage rule for carrier eligibility.', fields: [['coverageType', 'Coverage type', 'select', [{ value: 'Auto Liability', label: 'Auto Liability' }, { value: 'Cargo', label: 'Cargo' }, { value: 'General Liability', label: 'General Liability' }, { value: 'Occupational Accident', label: 'Occupational Accident' }, { value: 'Physical Damage', label: 'Physical Damage' }, { value: 'Workers Comp', label: 'Workers Compensation' }]], ['provider', 'Provider', 'text'], ['amount', 'Coverage amount', 'text'], ['expiration', 'Expiration date', 'date']] },
  };
  const cfg = CFG[type];
  const [vals, setVals] = React.useState<any>(() => { const o: any = {}; cfg.fields.forEach((f: any) => { o[f[0]] = f[2] === 'select' ? (f[3]?.[0]?.value ?? '') : ''; }); return o; });
  const set = (k: string, v: any) => setVals((s: any) => ({ ...s, [k]: v }));

  const save = () => {
    if (type === 'task') {
      if (!vals.title?.trim()) { toast('Add a task title', 'error'); return; }
      addExternalTask(makeTask({ title: vals.title, due: vals.due || null, priority: vals.priority || 'normal', assignee: (vals.assignee || 'NP').slice(0, 2).toUpperCase(), createdBy: 'Nina Patel' }));
      svc.logActivity('task', `Task created — ${vals.title}`, vals.assignee ? `Assigned to ${vals.assignee}` : '');
      svc.notify('info', 'Task created', vals.title);
      toast('Task created', 'success'); onClose(); return;
    }
    if (type === 'note') {
      if (!vals.title?.trim() && !vals.detail?.trim()) { toast('Write a note', 'error'); return; }
      svc.logActivity('note', vals.title || 'Note', vals.detail || '');
      svc.notify('info', 'Note saved', vals.title || vals.detail?.slice(0, 40));
      toast('Note saved', 'success'); onClose(); return;
    }
    if (type === 'application_sent') {
      const d = drivers.find((x: any) => x.id === vals.driver);
      svc.addRecord('application_sent', { title: `Application — ${d?.name || 'driver'}`, subtitle: `${vals.template || 'standard'} template`, ...vals });
      toast('Application sent', 'success'); onClose(); return;
    }
    // generic record types
    const req = cfg.fields[0][0];
    if (!String(vals[req] || '').trim()) { toast(`${cfg.fields[0][1]} is required`, 'error'); return; }
    const title = vals.name || vals.title || vals.coverageType || vals.unit || cfg.title;
    svc.addRecord(type, { ...vals, title, subtitle: vals.carrier || vals.provider || vals.dot || '' });
    toast(`${cfg.title.replace(/^(Create|Add) /, '')} saved`, 'success');
    cfg.after?.();
    onClose();
  };

  return <Modal title={cfg.title} subtitle={cfg.sub} width={520} onClose={onClose}
    footer={<><Hover as="button" onClick={onClose} style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}>Cancel</Hover><Hover as="button" onClick={save} style={primaryBtn} hover={{ background: '#0066D6' }}>Save</Hover></>}>
    {cfg.fields.map((f: any) => <Field key={f[0]} label={f[1]}>
      {f[2] === 'select' ? <Select value={vals[f[0]]} onChange={(v: string) => set(f[0], v)} options={f[3]} />
        : f[2] === 'area' ? <Textarea rows={3} value={vals[f[0]]} onChange={(e: any) => set(f[0], e.target.value)} />
        : <Input type={f[2] === 'date' ? 'date' : 'text'} value={vals[f[0]]} onChange={(e: any) => set(f[0], e.target.value)} />}
    </Field>)}
  </Modal>;
}

/* ───────────── search overlay ───────────── */
function SearchOverlay({ onClose, drivers, carriers, onPick }: any) {
  const [q, setQ] = React.useState('');
  const results = svc.search(q, drivers, carriers);
  const groups = results.reduce((m: any, r: any) => { (m[r.group] = m[r.group] || []).push(r); return m; }, {});
  React.useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  return <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', justifyContent: 'center', paddingTop: '12vh' }}>
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(2px)' }} />
    <div style={{ position: 'relative', width: 620, maxWidth: '92vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${T.hair}` }}>
        <Icon name="search" size={18} style={{ color: T.faint }} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search drivers, carriers, agreements, documents…" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: T.text }} />
        <span style={{ fontSize: 11, color: T.faint, background: '#F2F2F7', borderRadius: 6, padding: '2px 7px' }}>Esc</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {!q.trim() ? <div style={{ fontSize: 13, color: T.faint, padding: 24, textAlign: 'center' }}>Type to search across drivers, carriers, agreements, documents and records.</div>
          : results.length === 0 ? <div style={{ fontSize: 13, color: T.faint, padding: 24, textAlign: 'center' }}>No matches for “{q}”.</div>
          : Object.entries(groups).map(([g, items]: any) => <div key={g} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.faint, padding: '8px 10px 4px' }}>{g}</div>
            {items.map((r: any, i: number) => <Hover key={i} as="button" onClick={() => onPick(r.action)} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '9px 10px', border: 'none', background: 'transparent', borderRadius: 9, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.05)' }}>
              <span style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: '#F2F2F7', color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={r.icon} size={15} /></span>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.title}</div><div style={{ fontSize: 11.5, color: T.faint }}>{r.sub}</div></div>
              <Icon name="arrowRight" size={14} style={{ color: '#C7C7CC' }} />
            </Hover>)}
          </div>)}
      </div>
    </div>
  </div>;
}
