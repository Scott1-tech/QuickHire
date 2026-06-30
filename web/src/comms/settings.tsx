import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon, Btn, Toggle, Menu, MenuItem, useToasts, ToastHost } from '../tasks/lib';
import { useComms, svc, fmtWhen } from './store';
import { FmcsaResearch } from './fmcsa';

const OK = '#34C759', WARN = '#FF9500', PRI = '#007AFF';

function StatusDot({ status }: any) {
  const map: any = { connected: OK, demo: WARN, disconnected: '#C7C7CC', error: '#FF3B30', active: OK };
  return <span style={{ width: 8, height: 8, borderRadius: 999, background: map[status] || '#C7C7CC', flex: 'none' }} />;
}
function Card({ children, style }: any) { return <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, ...style }}>{children}</div>; }
function Field({ label, children }: any) { return <div><div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint, marginBottom: 4 }}>{label}</div><div style={{ fontSize: 13.5, fontWeight: 600 }}>{children}</div></div>; }
function ToggleCell({ on, onClick }: any) { return <div onClick={onClick} style={{ display: 'flex', justifyContent: 'center' }}><Toggle on={on} onChange={onClick} /></div>; }

export function IntegrationSettings({ section }: { section: string }) {
  // Pull live connection status + provisioned numbers/inboxes from the backend
  // when a real deployment is serving the SPA (no-op in the static preview).
  React.useEffect(() => { svc.hydrate(); }, []);
  if (section === 'ringcentral') return <RingCentralSettings />;
  if (section === 'email') return <EmailSettings />;
  if (section === 'fmcsa') return <FmcsaSettings />;
  return null;
}

/* ============================ RINGCENTRAL ============================ */
function RingCentralSettings() {
  const store = useComms();
  const { toasts, toast } = useToasts();
  const acc: any = svc.status('ringcentral');
  return <div style={{ maxWidth: 980 }}>
    <ToastHost toasts={toasts} />
    <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>RingCentral</h1>
    <p style={{ margin: '0 0 20px', fontSize: 14, color: T.muted }}>Phone, SMS, voicemail and call logging across multiple numbers.</p>

    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: '#FF6B0014', color: '#FF6B00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>RC</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 650 }}><StatusDot status={acc.status} />{acc.status === 'connected' ? 'Connected' : acc.status}</div>
          <div style={{ fontSize: 12.5, color: T.faint, marginTop: 2 }}>Last sync {fmtWhen(acc.lastSyncAt)} ago</div>
        </div>
        <Btn variant="secondary" icon="message" onClick={() => { svc.testSms('rc1'); toast('Test SMS sent from Recruiting Main', 'success'); }}>Test SMS</Btn>
        <Btn variant="secondary" icon="refresh" onClick={() => { svc.syncNumbers(); toast('Numbers synced', 'success'); }}>Sync numbers</Btn>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.hair}` }}>
        <Field label="Account ID">{acc.accountId}</Field>
        <Field label="Extension ID">{acc.extensionId}</Field>
        <Field label="Webhook"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><StatusDot status={acc.webhookStatus} />{acc.webhookStatus}</span></Field>
        <Field label="Last sync">{fmtWhen(acc.lastSyncAt)} ago</Field>
      </div>
    </Card>

    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', fontSize: 15, fontWeight: 650 }}>Phone Numbers</div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 920 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.4fr 0.7fr 0.7fr 0.8fr 0.8fr 0.8fr 0.7fr 0.8fr', gap: 8, padding: '10px 18px', background: '#FAFAFA', borderTop: `1px solid ${T.hair}`, borderBottom: `1px solid ${T.hair}`, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint, textAlign: 'center' }}>
            <span style={{ textAlign: 'left' }}>Number</span><span style={{ textAlign: 'left' }}>Assigned</span><span>SMS</span><span>Calls</span><span>Recv SMS</span><span>Recv calls</span><span>Shared</span><span>Default</span><span>Active</span>
          </div>
          {store.rcNumbers.map((n) => <div key={n.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.4fr 0.7fr 0.7fr 0.8fr 0.8fr 0.8fr 0.7fr 0.8fr', gap: 8, padding: '12px 18px', borderBottom: `1px solid ${T.hair}`, alignItems: 'center', fontSize: 13 }}>
            <div><div style={{ fontWeight: 650 }}>{n.label}</div><div style={{ fontSize: 12, color: T.faint }}>{n.phoneNumber}</div></div>
            <div><div style={{ fontSize: 12.5 }}>{n.assignedUser}</div><div style={{ fontSize: 11.5, color: T.faint }}>{n.assignedTeam}</div></div>
            <div style={{ textAlign: 'center' }}>{cap(n.smsEnabled)}</div>
            <div style={{ textAlign: 'center' }}>{cap(n.callsEnabled)}</div>
            <ToggleCell on={n.receiveSms} onClick={() => svc.patchNumber(n.id, { receiveSms: !n.receiveSms })} />
            <ToggleCell on={n.receiveCalls} onClick={() => svc.patchNumber(n.id, { receiveCalls: !n.receiveCalls })} />
            <ToggleCell on={n.sharedInbox} onClick={() => svc.patchNumber(n.id, { sharedInbox: !n.sharedInbox })} />
            <ToggleCell on={n.defaultOutbound} onClick={() => store.rcNumbers.forEach((x) => svc.patchNumber(x.id, { defaultOutbound: x.id === n.id }))} />
            <ToggleCell on={n.active} onClick={() => svc.patchNumber(n.id, { active: !n.active })} />
          </div>)}
        </div>
      </div>
    </Card>
  </div>;
}

/* ============================ EMAIL ============================ */
function EmailSettings() {
  const store = useComms();
  const { toasts, toast } = useToasts();
  const acc: any = svc.status('email');
  const def = store.emailInboxes.find((i) => i.defaultOutbound) || store.emailInboxes[0];
  return <div style={{ maxWidth: 980 }}>
    <ToastHost toasts={toasts} />
    <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Email</h1>
    <p style={{ margin: '0 0 20px', fontSize: 14, color: T.muted }}>Multi-inbox email for recruiting, safety, compliance and dispatch.</p>

    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: '#EA433514', color: '#EA4335', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="mail" size={20} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 650 }}><StatusDot status={acc.status} />Connected</div>
          <div style={{ fontSize: 12.5, color: T.faint, marginTop: 2 }}>{store.emailInboxes.length} inboxes · last sync {fmtWhen(acc.lastSyncAt)} ago</div>
        </div>
        <Menu width={200} trigger={<Btn variant="secondary" icon="settings">Provider: {acc.provider}</Btn>}>
          {(close: any) => ['Gmail', 'Outlook', 'SMTP', 'Resend', 'Custom'].map((p) => <MenuItem key={p} label={p} onClick={() => { acc.provider = p; close(); toast('Provider set to ' + p, 'success'); }} />)}
        </Menu>
        <Btn variant="secondary" icon="send" onClick={() => { svc.testEmail('em1'); toast('Test email sent', 'success'); }}>Test email</Btn>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.hair}` }}>
        <Field label="Default sender">{def?.emailAddress}</Field>
        <Field label="Connected inboxes">{store.emailInboxes.length}</Field>
        <Field label="Signature">{def?.signature?.slice(0, 28)}…</Field>
      </div>
    </Card>

    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', fontSize: 15, fontWeight: 650 }}>Inboxes</div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 940 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr 0.9fr 0.9fr 0.8fr 0.8fr 0.7fr', gap: 8, padding: '10px 18px', background: '#FAFAFA', borderTop: `1px solid ${T.hair}`, borderBottom: `1px solid ${T.hair}`, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint, textAlign: 'center' }}>
            <span style={{ textAlign: 'left' }}>Inbox</span><span style={{ textAlign: 'left' }}>Provider</span><span style={{ textAlign: 'left' }}>Assigned</span><span>Receive</span><span>Send</span><span>Shared</span><span>Default</span><span>Active</span>
          </div>
          {store.emailInboxes.map((n) => <div key={n.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr 0.9fr 0.9fr 0.8fr 0.8fr 0.7fr', gap: 8, padding: '12px 18px', borderBottom: `1px solid ${T.hair}`, alignItems: 'center', fontSize: 13 }}>
            <div><div style={{ fontWeight: 650 }}>{n.label}</div><div style={{ fontSize: 12, color: T.faint }}>{n.emailAddress}</div></div>
            <div style={{ fontSize: 12.5 }}>{n.provider}</div>
            <div><div style={{ fontSize: 12.5 }}>{n.assignedUser}</div><div style={{ fontSize: 11.5, color: T.faint }}>{n.assignedTeam}</div></div>
            <ToggleCell on={n.receiveEmails} onClick={() => svc.patchInbox(n.id, { receiveEmails: !n.receiveEmails })} />
            <ToggleCell on={n.sendEmails} onClick={() => svc.patchInbox(n.id, { sendEmails: !n.sendEmails })} />
            <ToggleCell on={n.sharedInbox} onClick={() => svc.patchInbox(n.id, { sharedInbox: !n.sharedInbox })} />
            <ToggleCell on={n.defaultOutbound} onClick={() => store.emailInboxes.forEach((x) => svc.patchInbox(x.id, { defaultOutbound: x.id === n.id }))} />
            <ToggleCell on={n.active} onClick={() => svc.patchInbox(n.id, { active: !n.active })} />
          </div>)}
        </div>
      </div>
    </Card>
  </div>;
}

/* ============================ FMCSA ============================ */
function FmcsaSettings() {
  const store = useComms();
  const { toasts, toast } = useToasts();
  const acc: any = svc.status('fmcsa');
  const [, force] = React.useReducer((x) => x + 1, 0);
  const [research, setResearch] = React.useState(false);
  const set = (patch: any) => { Object.assign(acc, patch); force(); };
  return <div style={{ maxWidth: 880 }}>
    <ToastHost toasts={toasts} />
    {research && <FmcsaResearch onClose={() => setResearch(false)} />}
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
      <div><h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>FMCSA</h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: T.muted }}>DOT/MC lookup, carrier auto-fill, compliance and employer verification.</p></div>
      <Btn variant="primary" icon="search" onClick={() => setResearch(true)}>Open Research</Btn>
    </div>

    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: '#1F4E9614', color: '#1F4E96', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="shield" size={20} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 650 }}><StatusDot status={acc.status} />{acc.dataMode === 'demo' ? 'Demo mode (public dataset)' : acc.dataMode === 'api' ? 'API connected' : 'Public dataset'}</div>
          <div style={{ fontSize: 12.5, color: T.faint, marginTop: 2 }}>Last sync {fmtWhen(acc.lastSyncAt)} ago · PSP & Clearinghouse require authorized consent</div>
        </div>
        <Btn variant="secondary" icon="search" onClick={() => { const r = svc.testLookup(); toast(r ? 'Lookup OK · ' + r.legalName : 'Lookup failed', r ? 'success' : 'danger'); }}>Test lookup</Btn>
      </div>
    </Card>

    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div><div style={labelStyle}>API key / webKey</div><input value={acc.webKey} onChange={(e) => set({ webKey: e.target.value })} placeholder="Enter FMCSA webKey" style={input} /></div>
        <div><div style={labelStyle}>Data mode</div>
          <Menu width={220} trigger={<Hover as="div" style={{ ...input, display: 'flex', alignItems: 'center', cursor: 'pointer' }} hover={{ borderColor: 'rgba(0,0,0,0.18)' }}><span style={{ flex: 1, textTransform: 'capitalize' }}>{acc.dataMode}</span><Icon name="chevronDown" size={14} /></Hover>}>
            {(close: any) => [['api', 'API'], ['public', 'Public dataset'], ['demo', 'Demo']].map(([k, l]) => <MenuItem key={k} label={l} onClick={() => { set({ dataMode: k }); close(); }} />)}
          </Menu>
        </div>
        <div><div style={labelStyle}>Cache duration (hours)</div><input type="number" value={acc.cacheHours} onChange={(e) => set({ cacheHours: +e.target.value })} style={input} /></div>
        <div><div style={labelStyle}>Last sync</div><div style={{ ...input, display: 'flex', alignItems: 'center', color: T.muted }}>{fmtWhen(acc.lastSyncAt)} ago</div></div>
      </div>
    </Card>

    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {[['autoFill', 'Enable auto-fill', 'Apply FMCSA data to carrier profiles'], ['mismatchTasks', 'Enable mismatch tasks', 'Create a task when FMCSA data differs from QuickHire'], ['watchlistChecks', 'Enable watchlist checks', 'Watch carriers for authority / safety / size changes']].map(([k, label, desc], i) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '15px 18px', borderTop: i ? `1px solid ${T.hair}` : 'none' }}>
          <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div><div style={{ fontSize: 12.5, color: T.faint, marginTop: 2 }}>{desc}</div></div>
          <Toggle on={acc[k as string]} onChange={() => set({ [k as string]: !acc[k as string] })} />
        </div>))}
    </Card>
  </div>;
}

const cap = (on: boolean) => <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: on ? '#248A3D' : '#8E8E93' }}><Icon name={on ? 'check' : 'x'} size={13} /></span>;
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint, marginBottom: 6 };
const input: React.CSSProperties = { width: '100%', height: 38, border: `1px solid ${T.border}`, borderRadius: 10, padding: '0 12px', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', background: '#fff' };
