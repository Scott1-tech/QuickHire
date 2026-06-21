import { useState } from 'react';
import { useStore } from '@/store';
import { PageHeader, Pill } from '@/ui';

const TABS = ['Automations', 'Team', 'Activity Log', 'Carrier Settings'];

const AUTOMATIONS = [
  { name: 'Prompt truck selection at Onboarding', when: 'Candidate reaches Onboarding', then: 'Open Select-Truck', on: true },
  { name: 'Create task on stage change', when: 'Candidate stage changes', then: 'Create review task', on: true },
  { name: 'Document expiry reminders', when: 'Doc expires in ≤ 30 days', then: 'Notify recruiter', on: false },
];
const TEAM = [
  { name: 'Fleet Admin', role: 'Owner', you: true },
  { name: 'Nina Patel', role: 'Recruiter', you: false },
  { name: 'Dana Reed', role: 'Admin', you: false },
];
const LOG = [
  { actor: 'Dana Reed', event: 'advanced Sarah Chen to Offer', time: '2h ago' },
  { actor: 'Nina Patel', event: 'uploaded CDL Front for Robert Johnson', time: '5h ago' },
  { actor: 'System', event: 'Truck #104 → Shop', time: '1d ago' },
];

export default function Administration() {
  const s = useStore();
  const [tab, setTab] = useState('Automations');
  const c = s.currentCarrier;

  return (
    <>
      <PageHeader crumbs={[{ label: 'Carriers' }, { label: c.name }, { label: 'Administration' }]} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex gap-1 mb-5 border-b border-line">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-[13px] font-medium -mb-px border-b-2 ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}>{t}</button>
          ))}
        </div>

        {tab === 'Automations' && (
          <div className="card divide-y divide-line/60">
            {AUTOMATIONS.map((a) => (
              <div key={a.name} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1">
                  <div className="text-[14px] font-semibold text-ink">{a.name}</div>
                  <div className="text-[12px] text-muted">When {a.when} → {a.then}</div>
                </div>
                <Pill kind={a.on ? 'active' : 'inactive'}>{a.on ? 'On' : 'Off'}</Pill>
              </div>
            ))}
          </div>
        )}

        {tab === 'Team' && (
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-line flex items-center">
              <span className="text-base font-bold text-ink">Carrier Access</span>
              <button className="ml-auto btn-primary py-1.5 text-[12px]">＋ Invite Member</button>
            </div>
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-line">{['Member', 'Role', ''].map((h) => <th key={h} className="text-left px-5 py-3 text-[11px] font-bold text-muted uppercase">{h}</th>)}</tr></thead>
              <tbody>
                {TEAM.map((m) => (
                  <tr key={m.name} className="border-b border-line/60">
                    <td className="px-5 py-3 text-[13px] font-semibold text-ink">{m.name}{m.you && <span className="text-muted font-normal"> (you)</span>}</td>
                    <td className="px-5 py-3"><Pill kind={m.role === 'Owner' ? 'Submitted' : m.role === 'Admin' ? 'Screening' : 'slate'}>{m.role}</Pill></td>
                    <td className="px-5 py-3 text-right"><button className="text-[12px] text-muted hover:text-danger">{m.you ? '' : 'Remove'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-muted px-5 py-3">This pool feeds the Add-Candidate hiring-user picker.</p>
          </div>
        )}

        {tab === 'Activity Log' && (
          <div className="card divide-y divide-line/60">
            {LOG.map((l, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-8 h-8 rounded-full bg-primary text-white text-[12px] grid place-items-center">{l.actor[0]}</div>
                <div className="flex-1 text-[13px] text-ink"><b>{l.actor}</b> {l.event}</div>
                <span className="text-[12px] text-muted">{l.time}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'Carrier Settings' && (
          <div className="card p-5 max-w-xl">
            <div className="text-base font-bold text-ink mb-4">Carrier Information</div>
            {[['Company Name', c.name], ['USDOT Number', c.dot], ['MC Number(s)', c.mc.join(', ')], ['Address', c.address ?? '—']].map(([k, v]) => (
              <div key={k} className="mb-3"><label className="field-label">{k}</label><input defaultValue={v} className="input" /></div>
            ))}
            <div className="mb-4"><label className="field-label">Authority Status</label><div><Pill kind="active">active</Pill></div></div>
            <button className="btn-primary">Save Changes</button>
            <p className="text-[11px] text-muted mt-3">// TODO: connect to API — PATCH /carriers/{c.id}</p>
          </div>
        )}
      </div>
    </>
  );
}
