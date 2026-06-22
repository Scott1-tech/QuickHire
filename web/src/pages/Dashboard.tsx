import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store';
import { PageHeader, Pill, timeAgo } from '@/ui';
import { CARRIERS, DRIVERS, CANDIDATES } from '@/data/mock';
import Icon from '@/components/Icon';
import Drawer from '@/components/Drawer';

type Panel =
  | 'add-carrier' | 'add-driver' | 'add-candidate' | 'add-truck' | 'add-employee'
  | 'list-carriers' | 'list-drivers' | 'list-trucks' | 'list-candidates'
  | null;

export default function Dashboard() {
  const s = useStore();
  const [panel, setPanel] = useState<Panel>(null);
  const close = () => setPanel(null);

  const carrierName = (id: string) => CARRIERS.find((c) => c.id === id)?.name ?? id;
  const recent = [...CANDIDATES].sort((a, b) => +new Date(b.stageEnteredAt) - +new Date(a.stageEnteredAt)).slice(0, 6);
  const activeDrivers = DRIVERS.filter((d) => d.status === 'active');
  const availableTrucks = s.trucks.filter((t) => t.status === 'Available');

  // Quick actions — each opens a slide-over panel (never navigates away first).
  const quick = [
    { key: 'add-carrier' as const, icon: 'building', title: 'Add Carrier', sub: 'Register a new MC/DOT', accent: '#6366F1', tint: '#EEF2FF' },
    { key: 'add-driver' as const, icon: 'wheel', title: 'Add Driver', sub: 'Onboard a new driver', accent: '#16A34A', tint: '#F0FDF4' },
    { key: 'add-candidate' as const, icon: 'clipboardCheck', title: 'Add Candidate', sub: 'Start hiring pipeline', accent: '#8B5CF6', tint: '#EDE9FE' },
    { key: 'add-truck' as const, icon: 'truck', title: 'Add Truck', sub: 'Register fleet unit', accent: '#D97706', tint: '#FFF7ED' },
    { key: 'add-employee' as const, icon: 'users', title: 'Add Employee', sub: 'Invite a team member', accent: '#2563EB', tint: '#EFF6FF' },
  ];

  // Stat cards — each is clickable and opens a list preview with a hint to its page.
  const stats = [
    { key: 'list-carriers' as const, icon: 'building', value: CARRIERS.length, label: 'Total Carriers', accent: '#6366F1', tint: '#EEF2FF' },
    { key: 'list-drivers' as const, icon: 'wheel', value: activeDrivers.length, label: 'Active Drivers', accent: '#16A34A', tint: '#F0FDF4' },
    { key: 'list-trucks' as const, icon: 'truck', value: availableTrucks.length, label: 'Available Trucks', accent: '#D97706', tint: '#FFF7ED' },
    { key: 'list-candidates' as const, icon: 'clipboardCheck', value: s.candidates.length, label: 'Pending Candidates', accent: '#8B5CF6', tint: '#EDE9FE' },
  ];

  return (
    <>
      <PageHeader crumbs={[{ label: 'FleetView' }, { label: 'Dashboard' }]} />
      <div className="flex-1 overflow-y-auto p-6">
        <h1 className="text-[22px] font-extrabold text-ink">Welcome back, {s.role}</h1>
        <p className="text-sm text-muted mb-6">Here's your fleet at a glance.</p>

        {/* Quick actions */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5 mb-7">
          {quick.map((q) => (
            <button key={q.key} onClick={() => setPanel(q.key)}
              className="card p-5 flex items-center gap-3.5 text-left hover:shadow-card hover:-translate-y-0.5 transition">
              <div className="w-10 h-10 rounded-[10px] grid place-items-center flex-shrink-0" style={{ background: q.tint, color: q.accent }}>
                <Icon name={q.icon} size={20} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-ink">{q.title}</div>
                <div className="text-xs text-muted truncate">{q.sub}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Stat cards (clickable) */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3.5 mb-7">
          {stats.map((st) => (
            <button key={st.key} onClick={() => setPanel(st.key)}
              className="card p-4 flex items-center gap-4 shadow-card text-left hover:shadow-pop hover:-translate-y-0.5 transition group">
              <div className="w-11 h-11 rounded-[10px] grid place-items-center flex-shrink-0" style={{ background: st.tint, color: st.accent }}>
                <Icon name={st.icon} size={22} />
              </div>
              <div>
                <div className="text-2xl font-extrabold text-ink leading-none">{st.value}</div>
                <div className="text-xs text-muted mt-1">{st.label}</div>
              </div>
              <span className="ml-auto self-start text-muted opacity-0 group-hover:opacity-100 transition">
                <Icon name="arrowRight" size={16} />
              </span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-line flex items-center">
              <span className="text-base font-bold text-ink">Recent Candidates</span>
              <Link to={`/carriers/${s.currentCarrierId}/hiring`} className="ml-auto text-[12.5px] text-primary font-semibold">View all →</Link>
            </div>
            {recent.map((c) => (
              <Link key={c.id} to={`/carriers/${c.carrierId}/hiring/${c.id}`}
                className="flex items-center gap-3 px-5 py-3 border-b border-line/60 hover:bg-[var(--surface-hover)]">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple grid place-items-center text-[13px] font-bold text-white">{c.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-bold text-ink">{c.name}</div>
                  <div className="text-xs text-muted">{carrierName(c.carrierId)}</div>
                </div>
                <Pill kind={c.stage}>{c.stage}</Pill>
                <span className="text-xs text-muted w-16 text-right">{timeAgo(c.stageEnteredAt)}</span>
              </Link>
            ))}
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 text-[15px] font-bold text-ink mb-3">
              <span className="text-warn"><Icon name="calendar" size={18} /></span>
              Upcoming Expirations
            </div>
            <div className="grid place-items-center text-center py-10 px-4">
              <div className="w-12 h-12 rounded-full bg-[#F0FDF4] text-success grid place-items-center mb-3"><Icon name="shield" size={24} /></div>
              <div className="text-base font-bold text-ink">No upcoming expirations</div>
              <div className="text-sm text-muted mt-1">Registration, inspection, insurance & medical look good.</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick-action panels ───────────────────────────────────────────── */}
      <Drawer open={panel === 'add-carrier'} onClose={close} icon="building" tint="#EEF2FF" accent="#6366F1"
        title="Add Carrier" subtitle="Register a new MC/DOT authority"
        hint={{ to: '/carriers', label: 'Manage all carriers' }}>
        <AddCarrierForm onDone={close} />
      </Drawer>

      <Drawer open={panel === 'add-driver'} onClose={close} icon="wheel" tint="#F0FDF4" accent="#16A34A"
        title="Add Driver" subtitle={s.currentCarrier.name}
        hint={{ to: `/carriers/${s.currentCarrierId}/drivers`, label: 'Open the Drivers roster' }}>
        <AddDriverForm onDone={close} />
      </Drawer>

      <Drawer open={panel === 'add-candidate'} onClose={close} icon="clipboardCheck" tint="#EDE9FE" accent="#8B5CF6"
        title="Add Candidate" subtitle="Start the hiring pipeline"
        hint={{ to: `/carriers/${s.currentCarrierId}/hiring`, label: 'Open the Hiring pipeline' }}>
        <AddCandidateForm onDone={close} />
      </Drawer>

      <Drawer open={panel === 'add-truck'} onClose={close} icon="truck" tint="#FFF7ED" accent="#D97706"
        title="Add Truck" subtitle={s.currentCarrier.name}
        hint={{ to: `/carriers/${s.currentCarrierId}/trucks`, label: 'Open the Trucks fleet' }}>
        <AddTruckForm onDone={close} />
      </Drawer>

      <Drawer open={panel === 'add-employee'} onClose={close} icon="users" tint="#EFF6FF" accent="#2563EB"
        title="Add Employee" subtitle="Invite a team member"
        hint={{ to: '/employees', label: 'Open the Employees directory' }}>
        <AddEmployeeForm onDone={close} />
      </Drawer>

      {/* ── Stat list panels ──────────────────────────────────────────────── */}
      <Drawer open={panel === 'list-carriers'} onClose={close} icon="building" tint="#EEF2FF" accent="#6366F1"
        title="Total Carriers" subtitle={`${CARRIERS.length} carriers under management`}
        hint={{ to: '/carriers', label: 'Go to the Carriers page' }}>
        <div className="flex flex-col gap-2.5">
          {CARRIERS.map((c) => (
            <Link key={c.id} to={`/carriers/${c.id}`} onClick={() => { s.setCurrentCarrierId(c.id); close(); }}
              className="card p-3.5 flex items-center gap-3 hover:shadow-card transition">
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-bold text-ink uppercase truncate">{c.name}</div>
                <div className="text-xs text-muted">USDOT {c.dot} · {c.mc.join(', ')}</div>
              </div>
              <Pill kind={c.authority === 'active' ? 'active' : 'pending'}>{c.authority}</Pill>
            </Link>
          ))}
        </div>
      </Drawer>

      <Drawer open={panel === 'list-drivers'} onClose={close} icon="wheel" tint="#F0FDF4" accent="#16A34A"
        title="Active Drivers" subtitle={`${activeDrivers.length} drivers currently active`}
        hint={{ to: `/carriers/${s.currentCarrierId}/drivers`, label: 'Go to the Drivers page' }}>
        <ListOrEmpty empty={activeDrivers.length === 0} label="No active drivers yet.">
          {activeDrivers.map((d) => (
            <Link key={d.id} to={`/carriers/${d.carrierId}/drivers/${d.id}`} onClick={close}
              className="card p-3.5 flex items-center gap-3 hover:shadow-card transition">
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-bold text-ink uppercase truncate">{d.name}</div>
                <div className="text-xs text-muted">{carrierName(d.carrierId)} · {d.type === 'company' ? 'Company' : 'Owner Operator'}</div>
              </div>
              {d.driverStatus && <Pill kind={d.driverStatus}>{d.driverStatus}</Pill>}
            </Link>
          ))}
        </ListOrEmpty>
      </Drawer>

      <Drawer open={panel === 'list-trucks'} onClose={close} icon="truck" tint="#FFF7ED" accent="#D97706"
        title="Available Trucks" subtitle={`${availableTrucks.length} ready to dispatch`}
        hint={{ to: `/carriers/${s.currentCarrierId}/trucks`, label: 'Go to the Trucks page' }}>
        <ListOrEmpty empty={availableTrucks.length === 0} label="No available trucks right now.">
          {availableTrucks.map((t) => (
            <Link key={t.id} to={`/carriers/${t.carrierId}/trucks/${t.id}`} onClick={close}
              className="card p-3.5 flex items-center gap-3 hover:shadow-card transition">
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-bold text-ink truncate">#{t.unit} · {t.make} {t.model}</div>
                <div className="text-xs text-muted">{t.year} · {t.plate}</div>
              </div>
              <Pill kind={t.status}>{t.status}</Pill>
            </Link>
          ))}
        </ListOrEmpty>
      </Drawer>

      <Drawer open={panel === 'list-candidates'} onClose={close} icon="clipboardCheck" tint="#EDE9FE" accent="#8B5CF6"
        title="Pending Candidates" subtitle={`${s.candidates.length} in the hiring pipeline`}
        hint={{ to: `/carriers/${s.currentCarrierId}/hiring`, label: 'Go to the Hiring page' }}>
        <ListOrEmpty empty={s.candidates.length === 0} label="No candidates in the pipeline.">
          {s.candidates.map((c) => (
            <Link key={c.id} to={`/carriers/${c.carrierId}/hiring/${c.id}`} onClick={close}
              className="card p-3.5 flex items-center gap-3 hover:shadow-card transition">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple grid place-items-center text-[13px] font-bold text-white flex-shrink-0">{c.name[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-bold text-ink uppercase truncate">{c.name}</div>
                <div className="text-xs text-muted truncate">{c.email}</div>
              </div>
              <Pill kind={c.stage}>{c.stage}</Pill>
            </Link>
          ))}
        </ListOrEmpty>
      </Drawer>
    </>
  );
}

/* ── Shared form pieces ──────────────────────────────────────────────────── */

function ListOrEmpty({ empty, label, children }: { empty: boolean; label: string; children: React.ReactNode }) {
  if (empty) return <div className="text-center text-sm text-muted py-10">{label}</div>;
  return <div className="flex flex-col gap-2.5">{children}</div>;
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input className="input" value={value} type={type} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Banner({ msg }: { msg: string }) {
  if (!msg) return null;
  const err = /required|error|unreachable|duplicate/i.test(msg);
  return <div className={`text-[12.5px] mt-3 ${err ? 'text-danger' : 'text-success'}`}>{msg}</div>;
}

function Submit({ onClick, busy, children }: { onClick: () => void; busy?: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} disabled={busy} className="btn-primary w-full mt-5 disabled:opacity-50">{children}</button>;
}

/* ── Forms ───────────────────────────────────────────────────────────────── */

function AddCarrierForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: '', dot: '', mc: '', address: '', phone: '', authority: 'active' });
  const [msg, setMsg] = useState('');
  const save = () => {
    if (!f.name || !f.dot) { setMsg('Company name and USDOT number are required.'); return; }
    setMsg(`${f.name} registered. Connect to the API to persist (POST /carriers).`);
    setTimeout(onDone, 1300);
  };
  return (
    <div className="flex flex-col gap-3">
      <Field label="Company Name *" value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="e.g. Grand One LLC" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="USDOT Number *" value={f.dot} onChange={(v) => setF({ ...f, dot: v })} placeholder="1234567" />
        <Field label="MC Number" value={f.mc} onChange={(v) => setF({ ...f, mc: v })} placeholder="MC-123456" />
      </div>
      <Field label="Address" value={f.address} onChange={(v) => setF({ ...f, address: v })} />
      <Field label="Phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
      <div>
        <label className="field-label">Authority Status</label>
        <select className="input" value={f.authority} onChange={(e) => setF({ ...f, authority: e.target.value })}>
          <option value="active">active</option><option value="pending">pending</option><option value="inactive">inactive</option>
        </select>
      </div>
      <Banner msg={msg} />
      <Submit onClick={save}>Create Carrier</Submit>
    </div>
  );
}

function AddDriverForm({ onDone }: { onDone: () => void }) {
  const s = useStore();
  const [f, setF] = useState({ name: '', license: '', state: '', phone: '', email: '', type: 'company' });
  const [msg, setMsg] = useState('');
  const save = () => {
    if (!f.name || !f.license) { setMsg('Driver name and license number are required.'); return; }
    setMsg(`${f.name.toUpperCase()} added to ${s.currentCarrier.name}.`);
    setTimeout(onDone, 1300);
  };
  return (
    <div className="flex flex-col gap-3">
      <Field label="Driver Name *" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="License # *" value={f.license} onChange={(v) => setF({ ...f, license: v })} />
        <Field label="State" value={f.state} onChange={(v) => setF({ ...f, state: v })} placeholder="TX" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
        <Field label="Email" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
      </div>
      <div>
        <label className="field-label">Type</label>
        <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="company">Company</option><option value="owner-operator">Owner Operator</option>
        </select>
      </div>
      <Banner msg={msg} />
      <Submit onClick={save}>Save Driver</Submit>
    </div>
  );
}

// Adds a candidate to the board and sends the application link via the backend
// (mirrors the Hiring page flow).
function AddCandidateForm({ onDone }: { onDone: () => void }) {
  const s = useStore();
  const [carrierId, setCarrierId] = useState(s.currentCarrierId);
  const [f, setF] = useState({ name: '', email: '', phone: '', owner: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const isSuper = s.role === 'Super Admin';

  const submit = async () => {
    if (!f.name || !f.email) { setMsg('Name and email are required.'); return; }
    setBusy(true);
    s.addCandidate({ ...f, carrierId, ownerUserId: f.owner || undefined });
    const company = s.carriers.find((c) => c.id === carrierId)?.name;
    try {
      const res = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': localStorage.getItem('qh_admin') ?? '' },
        body: JSON.stringify({ name: f.name, email: f.email, phone: f.phone, carrierId }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg(`Added under ${company}. ${data.link ? 'Application link sent.' : 'Saved.'}`);
      } else {
        setMsg(`Added under ${company} (board only — backend returned ${res.status}).`);
      }
    } catch {
      setMsg(`Added under ${company} (board only — backend unreachable).`);
    } finally {
      setBusy(false);
      setTimeout(onDone, 1500);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {isSuper && (
        <div>
          <label className="field-label">Company (MC carrier) *</label>
          <select className="input" value={carrierId} onChange={(e) => setCarrierId(e.target.value)}>
            {s.carriers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.mc.join(', ')}</option>)}
          </select>
        </div>
      )}
      <Field label="Driver Name *" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email *" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
        <Field label="Phone (for SMS)" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
      </div>
      <div>
        <label className="field-label">Assign hiring user</label>
        <select className="input" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}>
          <option value="">Unassigned</option><option value="u1">Nina Patel (Recruiter)</option><option value="u2">Dana Reed (Owner)</option>
        </select>
      </div>
      <Banner msg={msg} />
      <Submit onClick={submit} busy={busy}>{busy ? 'Sending…' : 'Add & Send Link'}</Submit>
    </div>
  );
}

function AddTruckForm({ onDone }: { onDone: () => void }) {
  const s = useStore();
  const [f, setF] = useState({ unit: '', make: '', model: '', year: '', plate: '', vin: '', state: '', ownership: 'company' });
  const [msg, setMsg] = useState('');
  const save = () => {
    if (!f.unit || !f.make) { setMsg('Unit number and make are required.'); return; }
    setMsg(`Truck #${f.unit} registered to ${s.currentCarrier.name}.`);
    setTimeout(onDone, 1300);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unit # *" value={f.unit} onChange={(v) => setF({ ...f, unit: v })} placeholder="105" />
        <Field label="Year" value={f.year} onChange={(v) => setF({ ...f, year: v })} placeholder="2024" type="number" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Make *" value={f.make} onChange={(v) => setF({ ...f, make: v })} placeholder="Peterbilt" />
        <Field label="Model" value={f.model} onChange={(v) => setF({ ...f, model: v })} placeholder="389" />
      </div>
      <Field label="VIN" value={f.vin} onChange={(v) => setF({ ...f, vin: v })} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Plate" value={f.plate} onChange={(v) => setF({ ...f, plate: v })} />
        <Field label="State" value={f.state} onChange={(v) => setF({ ...f, state: v })} placeholder="TX" />
      </div>
      <div>
        <label className="field-label">Ownership</label>
        <select className="input" value={f.ownership} onChange={(e) => setF({ ...f, ownership: e.target.value })}>
          <option value="company">Company</option><option value="owner-operator">Owner Operator</option>
        </select>
      </div>
      <Banner msg={msg} />
      <Submit onClick={save}>Create Truck</Submit>
    </div>
  );
}

function AddEmployeeForm({ onDone }: { onDone: () => void }) {
  const s = useStore();
  const [f, setF] = useState({ first: '', last: '', email: '', phone: '', role: 'dispatcher', shift: 'Main shift' });
  const [msg, setMsg] = useState('');
  const save = () => {
    if (!f.first || !f.last) { setMsg('First and last name are required.'); return; }
    setMsg(`Invite sent to ${f.first} ${f.last} for ${s.currentCarrier.name}.`);
    setTimeout(onDone, 1300);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First Name *" value={f.first} onChange={(v) => setF({ ...f, first: v })} />
        <Field label="Last Name *" value={f.last} onChange={(v) => setF({ ...f, last: v })} />
      </div>
      <Field label="Email" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
      <Field label="Phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Role</label>
          <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="dispatcher">Dispatcher</option><option value="recruiter">Recruiter</option>
            <option value="accounting">Accounting</option><option value="fleet_management">Fleet Management</option>
            <option value="hr">HR</option><option value="updater">Updater</option>
          </select>
        </div>
        <div>
          <label className="field-label">Shift</label>
          <select className="input" value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })}>
            <option value="Main shift">Main shift</option><option value="Night shift">Night shift</option><option value="Afterhours shift">Afterhours shift</option>
          </select>
        </div>
      </div>
      <Banner msg={msg} />
      <Submit onClick={save}>Send Invite</Submit>
    </div>
  );
}
