/* Settings → RingCentral → In-app calling.
   Client ID (enables RingCentral Embeddable), calling mode, default caller ID,
   live connection status, and quick actions to open/test the phone. */
import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon, SegTabs } from '../tasks/lib';
import { usePhone, setConfig, syncFromBackend, openPanel, simulateIncoming, showRcWidget, isRcMode, callerIdOptions, effectiveCallerId } from './store';
import { isValidClientId } from './rc';
import { formatPhone } from './number';

export function PhoneCallingSettings() {
  const s = usePhone();
  const [clientId, setClientId] = React.useState(s.config.clientId);
  const [err, setErr] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { syncFromBackend().then((ok) => { if (ok) setClientId(s.config.clientId); }); }, []); // eslint-disable-line
  React.useEffect(() => { setClientId(s.config.clientId); }, [s.config.clientId]);

  const rcOn = isRcMode();
  const dirty = clientId.trim() !== s.config.clientId;
  const save = async () => {
    const v = clientId.trim();
    if (v && !isValidClientId(v)) { setErr('That doesn’t look like a RingCentral Client ID (letters, numbers, - and _ only).'); return; }
    setErr(''); setSaving(true);
    await setConfig({ clientId: v });
    setSaving(false);
  };
  const callerOpts = callerIdOptions();

  let dot = '#FF9500', status = 'Demo mode — no Client ID yet', detail = 'Calls, the screen pop and wrap-up work with a simulated phone until you connect RingCentral.';
  if (rcOn) {
    if (s.rc.status === 'loading') { dot = '#C7C7CC'; status = 'Loading RingCentral…'; detail = 'Fetching the RingCentral phone.'; }
    else if (s.rc.status === 'error') { dot = '#FF3B30'; status = 'Couldn’t load RingCentral'; detail = s.rc.error || 'Check your network or the Client ID.'; }
    else if (s.rc.loggedIn) { dot = '#34C759'; status = `Signed in${s.rc.loginNumber ? ' as ' + formatPhone(s.rc.loginNumber) : ''}`; detail = s.rc.webphone ? `Browser phone: ${s.rc.webphone.replace(/^connectionStatus-/, '')}` : 'Ready to call.'; }
    else { dot = '#FF9500'; status = 'Connected — waiting for sign-in'; detail = 'Each recruiter signs in once with their own RingCentral login.'; }
  }
  const syncText = s.sync.state === 'synced' ? 'Saved for your whole workspace' : s.sync.state === 'syncing' ? 'Saving…' : s.sync.state === 'error' ? 'Saved on this browser — the server didn’t accept it (admin access needed)' : 'Saved on this browser';

  return <div data-qh-phone-settings="" style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, marginBottom: 16 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span style={{ width: 40, height: 40, flex: 'none', borderRadius: 10, background: 'rgba(52,199,89,0.12)', color: '#248A3D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="phone" size={19} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 650 }}>In-app calling</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3, fontSize: 12.5, color: T.muted }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, flex: 'none' }} /><span data-qh-rc-status="">{status}</span>
        </div>
        <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>{detail}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <Btn onClick={() => { if (rcOn) showRcWidget(true); else openPanel('dialer'); }} icon="phone">Open phone</Btn>
        <Btn onClick={() => simulateIncoming()} icon="phoneIncoming">Simulate incoming call</Btn>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 18, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.hair}` }}>
      <div>
        <Label>RingCentral Client ID</Label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={clientId} onChange={(e) => { setClientId(e.target.value); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            placeholder="Paste the Client ID of your RingCentral app" spellCheck={false} autoComplete="off" aria-label="RingCentral Client ID" data-qh-client-id=""
            style={{ flex: 1, minWidth: 0, height: 38, border: `1px solid ${err ? 'rgba(255,59,48,0.5)' : T.border}`, borderRadius: 10, padding: '0 12px', fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', outline: 'none', background: '#fff' }} />
          <Hover as="button" onClick={save} disabled={!dirty || saving} data-qh-save-client-id=""
            style={{ height: 38, padding: '0 16px', borderRadius: 10, border: 'none', background: dirty ? '#007AFF' : '#E5E5EA', color: dirty ? '#fff' : '#8E8E93', fontSize: 13.5, fontWeight: 600, cursor: dirty ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
            hover={dirty ? { background: '#0066D6' } : {}}>{saving ? 'Saving…' : clientId.trim() || !s.config.clientId ? 'Save' : 'Remove'}</Hover>
        </div>
        <div style={{ fontSize: 11.5, marginTop: 6, color: err ? '#C62820' : T.faint }}>{err || (s.config.updatedAt ? syncText : 'Leave empty to keep using demo mode.')}</div>

        <Label style={{ marginTop: 16 }}>Calling mode</Label>
        <SegTabs value={s.config.mode} onChange={(m: any) => setConfig({ mode: m })} tabs={[{ key: 'browser', label: 'Browser' }, { key: 'ringout', label: 'RingOut' }]} />
        <div style={{ fontSize: 12, color: T.muted, marginTop: 7, lineHeight: 1.45 }}>
          {s.config.mode === 'browser' ? 'Talk through your computer’s headset — answer, mute, hold and record right in QuickHire.' : 'RingCentral rings your desk or mobile phone first, then connects the driver. Good for recruiters without a headset.'}
        </div>

        <Label style={{ marginTop: 16 }}>Default caller ID</Label>
        <select value={effectiveCallerId()} onChange={(e) => setConfig({ callerId: e.target.value })} aria-label="Default caller ID"
          style={{ width: '100%', height: 38, borderRadius: 10, border: `1px solid ${T.border}`, padding: '0 10px', fontSize: 13.5, background: '#fff', fontFamily: 'inherit', color: T.text }}>
          {callerOpts.length === 0 && <option value="">Sync numbers below first</option>}
          {callerOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 6 }}>Drivers see this number. Recruiters can switch it in the dialer.</div>
      </div>

      <div style={{ background: '#F7F7F9', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 8 }}>Set up in 3 steps</div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
          <li>In the RingCentral Developer Console, create a <b style={{ color: T.text, fontWeight: 600 }}>client-side web app</b> with VoIP Calling, Call Control, Read Call Log, Read Messages, SMS and WebSocket Subscriptions.</li>
          <li>Paste its <b style={{ color: T.text, fontWeight: 600 }}>Client ID</b> here and save. No secret is needed.</li>
          <li>Each recruiter clicks <b style={{ color: T.text, fontWeight: 600 }}>Open phone</b> and signs in once.</li>
        </ol>
        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 8 }}>Full guide: docs/CONNECTING_INTEGRATIONS.md → In-app calling.</div>
      </div>
    </div>
  </div>;
}

function Label({ children, style }: any) { return <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint, marginBottom: 6, ...style }}>{children}</div>; }
function Btn({ children, onClick, icon }: any) {
  return <Hover as="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)', background: '#fff', color: T.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }} hover={{ background: 'rgba(0,0,0,0.04)' }}>
    {icon && <Icon name={icon} size={15} />}{children}
  </Hover>;
}
