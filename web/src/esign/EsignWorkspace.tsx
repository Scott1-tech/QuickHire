/* e-Signature page: Home · Manage · Templates · Settings, with a single
   "Start" primary action (send an envelope, use a template, sign yourself,
   bulk send). Every flow opens as a full-screen layer over the page. */
import React from 'react';
import { T } from '../tasks/lib';
import { svc, store, useEsign, flushPersist } from './store';
import { inView, statusLine, fmtAgo, IN_FLIGHT, STATUS_META } from './model';
import './integrations';
import { SendFlow, BuilderKind } from './builder';
import { SigningSession } from './signing';
import { ManageView, EnvelopeDrawer, ManageApi, SessionReq, primaryAction } from './manage';
import { TemplatesView, UseTemplateModal, BulkSendModal, TemplatesApi } from './templates';
import { EsignStyles } from './pages';
import { BG, Card, Icon, Btn, Dropdown, MenuItem, MenuSep, Segmented, StatusPill, ToastHost, useEToasts, Input, Textarea, Select, Toggle, SettingRow, EmptyState, Label, useWidth, Field as FormField } from './ui';

type Flow = { kind: BuilderKind; id: string; startAt?: 'setup' | 'prepare' } | null;

export default function EsignWorkspace({ drivers = [], go }: { drivers?: any[]; go?: (page: string) => void }) {
  const st = useEsign();
  const { toasts, toast, dismiss } = useEToasts();
  const width = useWidth();
  const [tab, setTab] = React.useState<'home' | 'manage' | 'templates' | 'settings'>('home');
  const [view, setView] = React.useState('sent');
  const [flow, setFlow] = React.useState<Flow>(null);
  const [drawer, setDrawer] = React.useState<string | null>(null);
  const [session, setSession] = React.useState<SessionReq | null>(null);
  const [useTpl, setUseTpl] = React.useState<{ id?: string } | null>(null);
  const [bulk, setBulk] = React.useState<{ id?: string } | null>(null);
  void drivers; void go;

  React.useEffect(() => () => flushPersist(), []);

  const sendEnvelope = () => { const env = svc.createEnvelope({ message: '' }); setDrawer(null); setFlow({ kind: 'envelope', id: env.id }); };
  const signYourself = () => { const me = svc.me(); const env = svc.createEnvelope({ title: 'Untitled document', selfSign: true, subject: 'Signed by ' + me.name, recipients: [{ id: 'r_' + Math.random().toString(36).slice(2, 10), name: me.name, email: me.email, action: 'sign', order: 1, color: '#007AFF', status: 'created' }] }); setFlow({ kind: 'self', id: env.id }); };
  const openManage = (v: string) => { setView(v); setTab('manage'); };

  const manageApi: ManageApi = {
    openDetails: (id) => setDrawer(id),
    editDraft: (id) => { setDrawer(null); setFlow({ kind: svc.envelope(id)?.selfSign ? 'self' : 'envelope', id }); },
    correct: (id) => { const e = svc.envelope(id); if (!e) return; if (e.status !== 'correcting' && !svc.beginCorrect(id)) { toast('This envelope can no longer be corrected', 'warning'); return; } setDrawer(null); setFlow({ kind: 'correct', id }); },
    openSession: (s) => setSession(s),
    toast, start: sendEnvelope,
  };
  const tplApi: TemplatesApi = {
    toast,
    edit: (id) => setFlow({ kind: 'template', id }),
    create: () => { const t = svc.createTemplate({ name: 'Untitled template' }); setFlow({ kind: 'template', id: t.id }); },
    use: (id) => setUseTpl({ id }),
    bulk: (id) => setBulk({ id }),
    openSession: (s) => setSession(s),
    openManage,
  };

  const startMenu = <Dropdown align="right" width={280} trigger={<Btn kind="primary" icon="plus" data-testid="start-button">Start<Icon name="chevronDown" size={14} /></Btn>}>
    {(close: any) => <>
      <MenuItem icon="send" label="Send an envelope" hint="Upload documents, add recipients, place fields" onClick={() => { close(); sendEnvelope(); }} />
      <MenuItem icon="copy" label="Use a template" hint="Carrier packets and saved templates" onClick={() => { close(); setUseTpl({}); }} />
      <MenuItem icon="sign" label="Sign a document yourself" hint="Upload, place your fields and sign" onClick={() => { close(); signYourself(); }} />
      <MenuSep />
      <MenuItem icon="layers" label="Bulk send" hint="One envelope per driver, merge fields filled" onClick={() => { close(); setBulk({}); }} />
      <MenuItem icon="plus" label="Create a template" onClick={() => { close(); tplApi.create(); }} />
    </>}
  </Dropdown>;

  return <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', background: BG }} data-testid="esign-workspace">
    <EsignStyles />
    <div style={{ flex: 'none', padding: width < 700 ? '16px 14px 0' : '22px 28px 0' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ width: 42, height: 42, flex: 'none', borderRadius: 12, background: 'linear-gradient(135deg,#007AFF,#4DA2FF)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="sign" size={21} /></span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 23, fontWeight: 700, letterSpacing: '-0.02em' }}>e-Signature</h1>
              {st.settings.simulationMode && <span title="Email/SMS delivery is simulated on this device" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: '#A05A00', background: 'rgba(255,159,10,0.14)', borderRadius: 999, padding: '3px 10px' }}><span style={{ width: 6, height: 6, borderRadius: 999, background: '#FF9F0A' }} />Simulation mode</span>}
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 13.5, color: T.muted }}>Send, sign and track driver onboarding documents.</p>
          </div>
          {startMenu}
        </div>
        <div style={{ marginTop: 16 }}><Segmented value={tab} onChange={setTab} options={[{ value: 'home', label: 'Home', icon: 'layout' }, { value: 'manage', label: 'Manage', icon: 'inbox', count: svc.counts().action || undefined }, { value: 'templates', label: 'Templates', icon: 'copy' }, { value: 'settings', label: 'Settings', icon: 'settings' }]} /></div>
        {st.storageWarning && <div role="alert" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 12, background: '#FFF4F3', color: '#B3261E', fontSize: 13 }}>{st.storageWarning}</div>}
      </div>
    </div>
    <div style={{ flex: 1, padding: width < 700 ? '16px 14px 40px' : '18px 28px 40px' }}>
      {tab === 'home' && <Home api={manageApi} onView={openManage} onStart={sendEnvelope} onTemplate={() => setUseTpl({})} onSelf={signYourself} onBulk={() => setBulk({})} />}
      {tab === 'manage' && <ManageView api={manageApi} initialView={view} />}
      {tab === 'templates' && <TemplatesView api={tplApi} />}
      {tab === 'settings' && <SettingsView toast={toast} />}
    </div>

    {drawer && <EnvelopeDrawer id={drawer} api={manageApi} onClose={() => setDrawer(null)} />}
    {flow && <SendFlow key={flow.kind + flow.id} kind={flow.kind} id={flow.id} startAt={flow.startAt} toast={toast} onClose={() => { setFlow(null); if (flow.kind !== 'template') setTab((t) => (t === 'home' ? t : 'manage')); }} onOpenEnvelope={(id) => { setTab('manage'); setDrawer(id); }} />}
    {session && <SigningSession key={session.envId + session.rid} envId={session.envId} recipientId={session.rid} mode={session.mode} toast={toast} onClose={() => setSession(null)} />}
    {useTpl && <UseTemplateModal tplId={useTpl.id} toast={toast} onClose={() => setUseTpl(null)} onCreated={(id) => { setUseTpl(null); setFlow({ kind: 'envelope', id }); }} />}
    {bulk && <BulkSendModal tplId={bulk.id} api={tplApi} onClose={() => setBulk(null)} />}
    <ToastHost toasts={toasts} dismiss={dismiss} />
  </div>;
}

/* ───────────────────────── HOME ───────────────────────── */
function Home({ api, onView, onStart, onTemplate, onSelf, onBulk }: { api: ManageApi; onView: (v: string) => void; onStart: () => void; onTemplate: () => void; onSelf: () => void; onBulk: () => void }) {
  const st = useEsign();
  const width = useWidth();
  const c = svc.counts();
  const cards = [
    { key: 'action', label: 'Action required', desc: 'Your signature or an in-person session', icon: 'alert', color: '#FF9500' },
    { key: 'waiting', label: 'Waiting for others', desc: 'Sent and in progress', icon: 'clock', color: '#007AFF' },
    { key: 'expiring', label: 'Expiring soon', desc: 'Within the warning window', icon: 'snooze', color: '#FF3B30' },
    { key: 'completed', label: 'Completed', desc: 'Fully signed and filed', icon: 'checkCircle', color: '#34C759' },
  ];
  const recent = [...st.envelopes].filter((e) => !e.deletedAt).sort((a, b) => +new Date(b.lastActivity) - +new Date(a.lastActivity)).slice(0, 7);
  const attention = st.envelopes.filter((e) => inView(e, 'action') || inView(e, 'expiring')).slice(0, 4);
  const cols = width < 640 ? 1 : width < 1000 ? 2 : 4;
  return <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }} data-testid="esign-home">
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 14 }}>
      {cards.map((k) => <Card key={k.key} onClick={() => onView(k.key)} style={{ padding: 18 }} hover={{ boxShadow: '0 8px 24px rgba(0,0,0,0.08)', borderColor: k.color }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: k.color + '1c', color: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={k.icon} size={18} /></span>
          <Icon name="chevronRight" size={16} style={{ color: '#C7C7CC' }} />
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, marginTop: 10, letterSpacing: '-0.02em' }} data-testid={`count-${k.key}`}>{c[k.key]}</div>
        <div style={{ fontSize: 13.5, fontWeight: 650 }}>{k.label}</div>
        <div style={{ fontSize: 12, color: T.faint, marginTop: 1 }}>{k.desc}</div>
      </Card>)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: width < 1000 ? '1fr' : '2fr 1fr', gap: 18, alignItems: 'start' }}>
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px 10px' }}><div style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Recent activity</div><Btn size="sm" kind="plain" onClick={() => onView('sent')}>View all</Btn></div>
        {recent.length === 0 ? <EmptyState icon="fileText" title="No envelopes yet" body="Send your first document for signature." action={<Btn kind="primary" icon="plus" onClick={onStart}>Send an envelope</Btn>} />
          : recent.map((e) => { const pa = primaryAction(e); return <div key={e.id} onClick={() => api.openDetails(e.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderTop: `1px solid ${T.hair}`, cursor: 'pointer' }} data-testid="home-row">
            <Icon name="fileText" size={16} style={{ color: T.faint }} />
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</div><div style={{ fontSize: 12, color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{statusLine(e)}</div></div>
            {width > 560 && <StatusPill status={e.status} size="sm" />}
            <span style={{ fontSize: 11.5, color: T.faint, width: 60, textAlign: 'right' }}>{fmtAgo(e.lastActivity)}</span>
            {pa && width > 760 && <span onClick={(ev) => ev.stopPropagation()}><Btn size="sm" onClick={() => pa.run(api)}>{pa.label}</Btn></span>}
          </div>; })}
      </Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Start</div>
          {[{ icon: 'send', label: 'Send an envelope', run: onStart }, { icon: 'copy', label: 'Use a template', run: onTemplate }, { icon: 'sign', label: 'Sign a document yourself', run: onSelf }, { icon: 'layers', label: 'Bulk send to drivers', run: onBulk }].map((q) => <MenuItem key={q.label} icon={q.icon} label={q.label} onClick={q.run} />)}
        </Card>
        {attention.length > 0 && <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Needs attention</div>
          {attention.map((e) => <div key={e.id} onClick={() => api.openDetails(e.id)} style={{ padding: '8px 0', borderTop: `1px solid ${T.hair}`, cursor: 'pointer' }}><div style={{ fontSize: 13, fontWeight: 600 }}>{e.title}</div><div style={{ fontSize: 11.5, color: inView(e, 'expiring') ? '#C62820' : '#A05A00' }}>{inView(e, 'action') ? statusLine(e) : 'Expiring soon'}</div></div>)}
        </Card>}
      </div>
    </div>
  </div>;
}

/* ───────────────────────── SETTINGS ───────────────────────── */
function SettingsView({ toast }: { toast: any }) {
  const st = useEsign();
  const s = st.settings;
  const set = (path: string, v: any) => svc.setSetting(path, v);
  return <div style={{ maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }} data-testid="esign-settings">
    <Card style={{ padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Sender</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <FormField label="Name"><Input value={s.sender.name} onChange={(e: any) => set('sender.name', e.target.value)} /></FormField>
        <FormField label="Email"><Input value={s.sender.email} onChange={(e: any) => set('sender.email', e.target.value)} /></FormField>
        <FormField label="Company"><Input value={s.sender.company} onChange={(e: any) => set('sender.company', e.target.value)} /></FormField>
      </div>
      <FormField label="Default message" hint="{first}, {driver}, {carrier} are filled from the driver record."><Textarea rows={2} value={s.defaultMessage} onChange={(e: any) => set('defaultMessage', e.target.value)} /></FormField>
    </Card>
    <Card style={{ padding: '6px 20px 14px' }}>
      <div style={{ fontSize: 15, fontWeight: 700, padding: '14px 0 6px' }}>Defaults</div>
      <SettingRow label="Automatic reminders" desc="For new envelopes"><Toggle on={s.reminders.enabled} onChange={(v: boolean) => set('reminders.enabled', v)} /></SettingRow>
      <SettingRow label="Remind every (days)"><Input type="number" value={s.reminders.everyDays} onChange={(e: any) => set('reminders.everyDays', Math.max(1, +e.target.value || 1))} style={{ width: 90 }} /></SettingRow>
      <SettingRow label="Maximum reminders"><Input type="number" value={s.reminders.maxCount} onChange={(e: any) => set('reminders.maxCount', Math.max(0, +e.target.value || 0))} style={{ width: 90 }} /></SettingRow>
      <SettingRow label="Expire after (days)"><Input type="number" value={s.expiration.days} onChange={(e: any) => set('expiration.days', Math.max(1, +e.target.value || 1))} style={{ width: 90 }} /></SettingRow>
      <SettingRow label="Warn before expiring (days)"><Input type="number" value={s.expiration.warnDays} onChange={(e: any) => set('expiration.warnDays', Math.max(0, +e.target.value || 0))} style={{ width: 90 }} /></SettingRow>
      <SettingRow label="Unsigned alert (hours)" desc="Raise a QuickHire notification when nobody has signed"><Input type="number" value={s.staleHours} onChange={(e: any) => set('staleHours', Math.max(1, +e.target.value || 48))} style={{ width: 90 }} /></SettingRow>
      <SettingRow label="Simulation mode" desc="Email/SMS delivery is simulated; you can open recipient sessions on this device"><Toggle on={s.simulationMode} onChange={(v: boolean) => set('simulationMode', v)} /></SettingRow>
    </Card>
    <Card style={{ padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Electronic Record and Signature Disclosure</div>
      <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 10 }}>Every signer must accept this before viewing documents (ESIGN Act / UETA).</div>
      <Textarea rows={8} value={s.ersd} onChange={(e: any) => set('ersd', e.target.value)} />
    </Card>
    <Card style={{ padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="shield" size={16} />Legal validity checklist</div>
      <div style={{ fontSize: 12.5, color: '#3A3A3C', lineHeight: 1.6 }}>
        <div>✓ Consent to electronic records captured per signer, with timestamp</div>
        <div>✓ Intent to sign (adopt signature) and per-field timestamps</div>
        <div>✓ Audit trail and Certificate of Completion with SHA-256 document hashes</div>
        <div style={{ color: '#A05A00', marginTop: 6 }}>Requires the QuickHire backend for production: real email/SMS delivery and signing links, server-side identity evidence (IP address), trusted timestamps, tamper-evident PDF sealing (digital signature) and server-held audit logs.</div>
      </div>
    </Card>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Btn icon="refresh" onClick={() => { svc.resetDemo(); toast('Demo data reset', 'info'); }}>Reset demo data</Btn>
      <span style={{ fontSize: 12, color: T.faint }}>Settings save automatically</span>
    </div>
  </div>;
}
