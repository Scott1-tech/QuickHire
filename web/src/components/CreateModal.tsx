import { useState, type ReactNode } from 'react';
import { useStore } from '@/store';
import RecordModal, { TitleInput, PropRow } from '@/components/RecordModal';

export type CreateKind = 'carrier' | 'driver' | 'candidate' | 'truck' | 'employee';

const META: Record<CreateKind, { icon: string; tint: string; accent: string; typeLabel: string }> = {
  carrier:   { icon: 'building',       tint: '#EEF2FF', accent: '#6366F1', typeLabel: 'Carrier' },
  driver:    { icon: 'wheel',          tint: '#F0FDF4', accent: '#16A34A', typeLabel: 'Driver' },
  candidate: { icon: 'clipboardCheck', tint: '#EDE9FE', accent: '#8B5CF6', typeLabel: 'Candidate' },
  truck:     { icon: 'truck',          tint: '#FFF7ED', accent: '#D97706', typeLabel: 'Truck' },
  employee:  { icon: 'users',          tint: '#EFF6FF', accent: '#2563EB', typeLabel: 'Employee' },
};

/** Single entry point: <CreateModal kind="driver" open onClose /> — opens the
 * matching ClickUp-style record modal, fully wired to the store. */
export default function CreateModal({ kind, open, onClose }: {
  kind: CreateKind; open: boolean; onClose: () => void;
}) {
  const s = useStore();
  const m = META[kind];
  const context = kind === 'carrier' ? 'New MC/DOT authority' : s.currentCarrier?.name;
  return (
    <RecordModal open={open} onClose={onClose} icon={m.icon} tint={m.tint} accent={m.accent} typeLabel={m.typeLabel} context={context}>
      {kind === 'carrier'   && <CarrierForm onClose={onClose} />}
      {kind === 'driver'    && <DriverForm onClose={onClose} />}
      {kind === 'candidate' && <CandidateForm onClose={onClose} />}
      {kind === 'truck'     && <TruckForm onClose={onClose} />}
      {kind === 'employee'  && <EmployeeForm onClose={onClose} />}
    </RecordModal>
  );
}

/* ── shared bits ─────────────────────────────────────────────────────────────── */
function Banner({ msg }: { msg: string }) {
  if (!msg) return null;
  const err = /required|error|unreachable|invalid/i.test(msg);
  return <div className={`text-[12.5px] mt-3 ${err ? 'text-danger' : 'text-success'}`}>{msg}</div>;
}
function Actions({ onSave, onClose, busy, label }: { onSave: () => void; onClose: () => void; busy?: boolean; label: string }) {
  return (
    <div className="flex gap-2 mt-6 pt-4 border-t border-line/70">
      <button onClick={onSave} disabled={busy} className="btn-primary disabled:opacity-50">{label}</button>
      <button onClick={onClose} className="btn-ghost">Cancel</button>
    </div>
  );
}
function Sel({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: ReactNode }) {
  return <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>;
}
function Inp({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input className="input" value={value} type={type} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}
// Carrier picker — only shown to Super Admin (who manages multiple carriers).
function CarrierPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const s = useStore();
  if (s.role !== 'Super Admin') return null;
  return (
    <PropRow icon="building" label="Carrier">
      <Sel value={value} onChange={onChange}>
        {s.carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Sel>
    </PropRow>
  );
}

/* ── Carrier ─────────────────────────────────────────────────────────────────── */
function CarrierForm({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [f, setF] = useState({ name: '', dot: '', mc: '', address: '', phone: '', authority: 'active' });
  const [msg, setMsg] = useState('');
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const save = () => {
    if (!f.name.trim() || !f.dot.trim()) { setMsg('Company name and USDOT number are required.'); return; }
    s.addCarrier({ name: f.name, dot: f.dot, mc: f.mc ? f.mc.split(',').map((x) => x.trim()).filter(Boolean) : [],
      authority: f.authority as 'active' | 'pending' | 'inactive', address: f.address, phone: f.phone });
    onClose();
  };
  return (
    <div>
      <TitleInput autoFocus value={f.name} onChange={set('name')} placeholder="Company name, e.g. Grand One LLC" />
      <PropRow icon="hash" label="USDOT Number *"><Inp value={f.dot} onChange={set('dot')} placeholder="1234567" /></PropRow>
      <PropRow icon="hash" label="MC Number(s)"><Inp value={f.mc} onChange={set('mc')} placeholder="MC-123456, MC-123457" /></PropRow>
      <PropRow icon="circleDot" label="Authority"><Sel value={f.authority} onChange={set('authority')}>
        <option value="active">Active</option><option value="pending">Pending</option><option value="inactive">Inactive</option>
      </Sel></PropRow>
      <PropRow icon="mapPin" label="Address"><Inp value={f.address} onChange={set('address')} placeholder="1200 Fleet Ave, Dallas, TX" /></PropRow>
      <PropRow icon="phone" label="Phone"><Inp value={f.phone} onChange={set('phone')} placeholder="(214) 555-0100" /></PropRow>
      <Banner msg={msg} />
      <Actions onSave={save} onClose={onClose} label="Create Carrier" />
    </div>
  );
}

/* ── Driver ──────────────────────────────────────────────────────────────────── */
function DriverForm({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [carrierId, setCarrierId] = useState(s.currentCarrierId);
  const [f, setF] = useState({ name: '', license: '', state: '', phone: '', email: '', type: 'company' });
  const [msg, setMsg] = useState('');
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const save = () => {
    if (!f.name.trim() || !f.license.trim()) { setMsg('Driver name and license number are required.'); return; }
    s.addDriver({ name: f.name, license: f.license, state: f.state, phone: f.phone, email: f.email,
      type: f.type as 'company' | 'owner-operator', carrierId });
    onClose();
  };
  return (
    <div>
      <TitleInput autoFocus value={f.name} onChange={set('name')} placeholder="Driver name" />
      <CarrierPicker value={carrierId} onChange={setCarrierId} />
      <PropRow icon="idCard" label="License # *"><Inp value={f.license} onChange={set('license')} placeholder="TX12345678" /></PropRow>
      <PropRow icon="mapPin" label="State"><Inp value={f.state} onChange={set('state')} placeholder="TX" /></PropRow>
      <PropRow icon="tag" label="Type"><Sel value={f.type} onChange={set('type')}>
        <option value="company">Company</option><option value="owner-operator">Owner Operator</option>
      </Sel></PropRow>
      <PropRow icon="phone" label="Phone"><Inp value={f.phone} onChange={set('phone')} placeholder="(214) 555-1001" /></PropRow>
      <PropRow icon="mail" label="Email"><Inp value={f.email} onChange={set('email')} placeholder="driver@example.com" /></PropRow>
      <Banner msg={msg} />
      <Actions onSave={save} onClose={onClose} label="Save Driver" />
    </div>
  );
}

/* ── Candidate (also sends the application link via the backend) ──────────────── */
function CandidateForm({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [carrierId, setCarrierId] = useState(s.currentCarrierId);
  const [f, setF] = useState({ name: '', email: '', phone: '', owner: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const submit = async () => {
    if (!f.name.trim() || !f.email.trim()) { setMsg('Name and email are required.'); return; }
    setBusy(true);
    s.addCandidate({ ...f, carrierId, ownerUserId: f.owner || undefined });
    const company = s.carriers.find((c) => c.id === carrierId)?.name;
    try {
      const res = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': localStorage.getItem('qh_admin') ?? '' },
        body: JSON.stringify({ name: f.name, email: f.email, phone: f.phone, carrierId }),
      });
      setMsg(res.ok ? `Added under ${company}. Application link sent.` : `Added under ${company} (board only — backend ${res.status}).`);
    } catch {
      setMsg(`Added under ${company} (board only — backend unreachable).`);
    } finally {
      setBusy(false);
      setTimeout(onClose, 1100);
    }
  };
  return (
    <div>
      <TitleInput autoFocus value={f.name} onChange={set('name')} placeholder="Driver name" />
      <CarrierPicker value={carrierId} onChange={setCarrierId} />
      <PropRow icon="mail" label="Email *"><Inp value={f.email} onChange={set('email')} placeholder="driver@example.com" /></PropRow>
      <PropRow icon="phone" label="Phone (SMS)"><Inp value={f.phone} onChange={set('phone')} placeholder="(555) 010-0101" /></PropRow>
      <PropRow icon="user" label="Assign hiring user"><Sel value={f.owner} onChange={set('owner')}>
        <option value="">Unassigned</option><option value="u1">Nina Patel (Recruiter)</option><option value="u2">Dana Reed (Owner)</option>
      </Sel></PropRow>
      <Banner msg={msg} />
      <Actions onSave={submit} onClose={onClose} busy={busy} label={busy ? 'Sending…' : 'Add & Send Link'} />
    </div>
  );
}

/* ── Truck ───────────────────────────────────────────────────────────────────── */
function TruckForm({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [carrierId, setCarrierId] = useState(s.currentCarrierId);
  const [f, setF] = useState({ unit: '', make: '', model: '', year: '', plate: '', vin: '', state: '', ownership: 'company' });
  const [msg, setMsg] = useState('');
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const save = () => {
    if (!f.unit.trim() || !f.make.trim()) { setMsg('Unit number and make are required.'); return; }
    s.addTruck({ unit: f.unit, make: f.make, model: f.model, year: f.year ? Number(f.year) : undefined,
      plate: f.plate, vin: f.vin, state: f.state, ownership: f.ownership as 'company' | 'owner-operator', carrierId });
    onClose();
  };
  return (
    <div>
      <TitleInput autoFocus value={f.unit} onChange={set('unit')} placeholder="Unit number, e.g. 105" />
      <CarrierPicker value={carrierId} onChange={setCarrierId} />
      <PropRow icon="truck" label="Make *"><Inp value={f.make} onChange={set('make')} placeholder="Peterbilt" /></PropRow>
      <PropRow icon="truck" label="Model"><Inp value={f.model} onChange={set('model')} placeholder="389" /></PropRow>
      <PropRow icon="calendar" label="Year"><Inp value={f.year} onChange={set('year')} placeholder="2024" type="number" /></PropRow>
      <PropRow icon="hash" label="Plate"><Inp value={f.plate} onChange={set('plate')} placeholder="TX-ABC123" /></PropRow>
      <PropRow icon="hash" label="VIN"><Inp value={f.vin} onChange={set('vin')} placeholder="1XPBD49X1MD123456" /></PropRow>
      <PropRow icon="mapPin" label="State"><Inp value={f.state} onChange={set('state')} placeholder="TX" /></PropRow>
      <PropRow icon="tag" label="Ownership"><Sel value={f.ownership} onChange={set('ownership')}>
        <option value="company">Company</option><option value="owner-operator">Owner Operator</option>
      </Sel></PropRow>
      <Banner msg={msg} />
      <Actions onSave={save} onClose={onClose} label="Create Truck" />
    </div>
  );
}

/* ── Employee ────────────────────────────────────────────────────────────────── */
function EmployeeForm({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [carrierId, setCarrierId] = useState(s.currentCarrierId);
  const [f, setF] = useState({ name: '', email: '', phone: '', role: 'dispatcher', shift: 'Main shift', kind: 'employee' });
  const [msg, setMsg] = useState('');
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const save = () => {
    if (!f.name.trim()) { setMsg('Name is required.'); return; }
    const parts = f.name.trim().split(/\s+/);
    s.addEmployee({
      firstName: parts[0], lastName: parts.slice(1).join(' ') || '',
      email: f.email, phone: f.phone,
      role: f.role as 'accounting' | 'fleet_management' | 'hr' | 'updater' | 'dispatcher' | 'recruiter',
      shift: f.shift as 'Night shift' | 'Main shift' | 'Afterhours shift',
      kind: f.kind as 'employee' | 'dispatcher', carrierId,
    });
    onClose();
  };
  return (
    <div>
      <TitleInput autoFocus value={f.name} onChange={set('name')} placeholder="Full name, e.g. Dana Reed" />
      <CarrierPicker value={carrierId} onChange={setCarrierId} />
      <PropRow icon="mail" label="Email"><Inp value={f.email} onChange={set('email')} placeholder="dana@grandone.com" /></PropRow>
      <PropRow icon="phone" label="Phone"><Inp value={f.phone} onChange={set('phone')} placeholder="(214) 555-2001" /></PropRow>
      <PropRow icon="briefcase" label="Role"><Sel value={f.role} onChange={set('role')}>
        <option value="dispatcher">Dispatcher</option><option value="recruiter">Recruiter</option>
        <option value="accounting">Accounting</option><option value="fleet_management">Fleet Management</option>
        <option value="hr">HR</option><option value="updater">Updater</option>
      </Sel></PropRow>
      <PropRow icon="tag" label="Type"><Sel value={f.kind} onChange={set('kind')}>
        <option value="employee">Employee</option><option value="dispatcher">Dispatcher</option>
      </Sel></PropRow>
      <PropRow icon="clock" label="Shift"><Sel value={f.shift} onChange={set('shift')}>
        <option value="Main shift">Main shift</option><option value="Night shift">Night shift</option><option value="Afterhours shift">Afterhours shift</option>
      </Sel></PropRow>
      <Banner msg={msg} />
      <Actions onSave={save} onClose={onClose} label="Send Invite" />
    </div>
  );
}
