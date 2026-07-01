import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon, Btn, Toggle, Menu, MenuItem, useToasts, ToastHost } from '../tasks/lib';
import { useComms, svc, fmtWhen } from './store';
import { FmcsaResearch } from './fmcsa';
import { api } from './api';

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
  if (section === 'leadsources') return <LeadSources />;
  return null;
}

/* ============================ LEAD SOURCES ============================ */
const SOURCE_META: Record<string, { mark: string; bg: string; fg: string; blurb: string }> = {
  generic: { mark: 'ZP', bg: '#FF4A0014', fg: '#FF4A00', blurb: 'Zapier / Make / any webhook. Native connectors for Meta, Indeed, ZipRecruiter, Google & TikTok forms — point their webhook here.' },
  meta: { mark: 'f', bg: '#1877F214', fg: '#1877F2', blurb: 'Facebook & Instagram Lead Ads. Real-time leadgen webhook; full lead data fetched from the Graph API.' },
  indeed: { mark: 'in', bg: '#2557A714', fg: '#2557A7', blurb: 'Indeed Apply (approved ATS/partner push). Applicants land straight in the inbox.' },
};

function LeadSources() {
  const { toasts, toast } = useToasts();
  const [status, setStatus] = React.useState<any>(null);
  const [inbox, setInbox] = React.useState<any[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const [s, ib] = await Promise.all([api.leadsStatus().catch(() => null), api.leadInbox().catch(() => [])]);
    if (s) setStatus(s);
    setInbox(Array.isArray(ib) ? ib : []);
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);

  const intakeUrl = (src: string) => (status?.intakeUrlTemplate || '/api/leads/intake/{source}').replace('{source}', src);
  const copy = (text: string) => { try { navigator.clipboard?.writeText(text); toast('Webhook URL copied', 'success'); } catch { toast('Copy failed', 'warning'); } };

  const sendTest = async (src: string) => {
    setBusy('test:' + src);
    try { const r = await api.testLead(src); toast(r.created ? 'Test lead added to inbox' : 'Test lead merged into an existing candidate', 'success'); await refresh(); }
    catch { toast('Test leads need the live backend', 'warning'); }
    finally { setBusy(null); }
  };
  const convert = async (id: string, name: string) => {
    setBusy('conv:' + id);
    try { const r = await api.convertLead(id, {}); toast(r.anySuccess ? `Application link sent to ${name}` : `${name}: no channel delivered — check email/SMS setup`, r.anySuccess ? 'success' : 'warning'); await refresh(); }
    catch { toast('Convert failed — backend not reachable', 'warning'); }
    finally { setBusy(null); }
  };
  const dismiss = async (id: string, name: string) => {
    setBusy('dis:' + id);
    try { await api.dismissLead(id, {}); toast(`Lead dismissed: ${name}`, 'info'); await refresh(); }
    catch { toast('Dismiss failed — backend not reachable', 'warning'); }
    finally { setBusy(null); }
  };

  const sources = status?.sources || [
    { type: 'generic', label: 'Generic webhook', status: 'demo' },
    { type: 'meta', label: 'Meta Lead Ads', status: 'demo' },
    { type: 'indeed', label: 'Indeed Apply', status: 'demo' },
  ];

  return <div style={{ maxWidth: 980 }}>
    <ToastHost toasts={toasts} />
    <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Lead Sources</h1>
    <p style={{ margin: '0 0 20px', fontSize: 14, color: T.muted }}>
      Connect Meta, Indeed and any lead app. New leads land in the <strong>Lead Inbox</strong> below for review — they're never
      auto-contacted, so cold-lead texting stays TCPA-safe. Convert a lead to send the application link.
    </p>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
      {sources.map((s: any) => {
        const m = SOURCE_META[s.type] || { mark: (s.type || '?').slice(0, 2).toUpperCase(), bg: '#8E8E9314', fg: '#8E8E93', blurb: '' };
        return <Card key={s.type}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: m.bg, color: m.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flex: 'none' }}>{m.mark}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 650 }}>{s.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}><StatusDot status={s.status} /><span style={{ fontSize: 12.5, color: T.faint }}>{s.status === 'connected' ? 'Connected — live' : 'Demo mode'}</span></div>
            </div>
            <Btn variant="secondary" onClick={() => sendTest(s.type)}>{busy === 'test:' + s.type ? 'Sending…' : 'Send test lead'}</Btn>
          </div>
          {m.blurb && <p style={{ margin: '12px 0 0', fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>{m.blurb}</p>}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.hair}` }}>
            <div style={{ ...labelStyle, marginBottom: 4 }}>Webhook URL</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: '#F7F7F8', border: `1px solid ${T.hair}`, borderRadius: 8, padding: '7px 9px' }}>{intakeUrl(s.type)}</code>
              <Btn variant="secondary" onClick={() => copy(intakeUrl(s.type))}>Copy</Btn>
            </div>
            {(s.envKeys && s.envKeys.length > 0) && <div style={{ fontSize: 11.5, color: T.faint, marginTop: 8 }}>Env: {s.envKeys.join(', ')}{s.type === 'generic' ? ' — send as X-QuickHire-Secret header' : ''}</div>}
          </div>
        </Card>;
      })}
    </div>

    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>Lead Inbox <span style={{ fontSize: 13, fontWeight: 600, color: T.faint }}>· {inbox.length} awaiting review</span></h2>
      <Btn variant="secondary" onClick={refresh}>Refresh</Btn>
    </div>

    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {inbox.length === 0 && <div style={{ padding: '28px 18px', textAlign: 'center', fontSize: 13.5, color: T.faint }}>No leads waiting. Try “Send test lead” above, or point a source's webhook at its URL.</div>}
      {inbox.map((l: any, i: number) => (
        <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderTop: i ? `1px solid ${T.hair}` : 'none' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name || 'Unnamed lead'}</div>
            <div style={{ fontSize: 12, color: T.faint, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {[l.email, l.phone].filter(Boolean).join(' · ') || 'no contact'}
            </div>
          </div>
          {l.source && <span style={{ fontSize: 11, fontWeight: 600, color: (SOURCE_META[l.source]?.fg) || '#8E8E93', background: (SOURCE_META[l.source]?.bg) || '#8E8E9314', borderRadius: 999, padding: '3px 9px', flex: 'none', textTransform: 'capitalize' }}>{l.source}</span>}
          {l.campaign && <span style={{ fontSize: 12, color: T.faint, flex: 'none', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.campaign}</span>}
          <span style={{ fontSize: 12, color: T.faint, flex: 'none' }}>{fmtWhen(l.createdAt)} ago</span>
          <Btn variant="primary" onClick={() => convert(l.id, l.name)}>{busy === 'conv:' + l.id ? 'Sending…' : 'Convert'}</Btn>
          <Hover as="button" onClick={() => dismiss(l.id, l.name)} style={{ height: 32, padding: '0 12px', fontSize: 12.5, fontWeight: 600, color: '#C62820', background: 'transparent', border: 'none', borderRadius: 9, cursor: 'pointer' }} hover={{ background: 'rgba(255,59,48,0.08)' }}>Dismiss</Hover>
        </div>
      ))}
    </Card>
  </div>;
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
