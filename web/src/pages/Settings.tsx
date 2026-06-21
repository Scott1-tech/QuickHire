import { useState } from 'react';
import { useStore } from '@/store';
import { PageHeader, Pill } from '@/ui';

const TABS = ['Profile', 'Security', 'Integrations', 'Notifications', 'Appearance'];

export default function Settings() {
  const s = useStore();
  const [tab, setTab] = useState('Profile');

  return (
    <>
      <PageHeader crumbs={[{ label: 'Settings' }]} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex gap-1 mb-5 border-b border-line">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-[13px] font-medium -mb-px border-b-2 ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}>{t}</button>
          ))}
        </div>

        <div className="max-w-xl">
          {tab === 'Profile' && (
            <div className="card p-5">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-purple grid place-items-center text-2xl font-bold text-white">{s.role[0]}</div>
                <div><div className="text-lg font-extrabold text-ink">Fleet Admin</div><Pill kind="Submitted">{s.role}</Pill></div>
                <button className="ml-auto btn-ghost py-1.5 text-[12px]">Edit</button>
              </div>
              <div className="mb-3"><label className="field-label">Name</label><input defaultValue="Fleet Admin" className="input" /></div>
              <div className="mb-3"><label className="field-label">Email</label><input defaultValue="admin@fleetview.app" className="input" /></div>
              <div className="border-t border-line mt-5 pt-5">
                <div className="text-[12px] font-bold text-muted uppercase mb-2">Account</div>
                <button className="px-4 py-2 rounded-[10px] bg-danger/10 text-danger font-semibold text-sm">Sign out</button>
              </div>
            </div>
          )}

          {tab === 'Integrations' && (
            <div className="card p-5">
              <div className="text-base font-bold text-ink mb-3">Integrations</div>
              <div className="border border-line rounded-xl p-4">
                <div className="font-semibold text-ink mb-1">Email & SMS</div>
                <p className="text-[13px] text-muted mb-3">Application links are sent via email (Resend) and SMS (Twilio), configured per carrier.</p>
                <Pill kind="active">Connected</Pill>
              </div>
              <p className="text-[12px] text-muted mt-3">Telegram is not used in this platform.</p>
            </div>
          )}

          {tab === 'Appearance' && (
            <div className="card p-5">
              <div className="text-base font-bold text-ink mb-3">Appearance</div>
              <label className="flex items-center gap-3 text-[14px] text-ink">
                <input type="checkbox" checked={s.theme === 'dark'} onChange={s.toggleTheme} /> Dark mode
              </label>
            </div>
          )}

          {(tab === 'Security' || tab === 'Notifications') && (
            <div className="card p-5"><div className="text-base font-bold text-ink mb-2">{tab}</div><p className="text-[13px] text-muted">// TODO: connect to API</p></div>
          )}
        </div>
      </div>
    </>
  );
}
