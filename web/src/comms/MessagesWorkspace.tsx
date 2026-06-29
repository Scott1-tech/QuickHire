import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon, Btn, Menu, MenuItem, Avatar, Toggle, useToasts, ToastHost, avatarColor, initials } from '../tasks/lib';
import { useComms, svc, fmtWhen, fmtClock, CALL_OUTCOMES, MSG_STATUS } from './store';

const WARN = '#FF9500', OK = '#34C759', ERR = '#FF3B30', PRI = '#007AFF';
const ME = 'Nina Patel';
const CHAN: Record<string, any> = {
  sms: { icon: 'message', color: PRI, label: 'SMS' },
  email: { icon: 'mail', color: '#5856D6', label: 'Email' },
  call: { icon: 'phone', color: OK, label: 'Call' },
  voicemail: { icon: 'voicemail', color: '#5856D6', label: 'Voicemail' },
  internal_note: { icon: 'pencil', color: '#8E8E93', label: 'Note' },
};
const fillTpl = (s: string, c: any, sig = '') => (s || '').replace(/{name}/g, c?.name?.split(' ')[0] || '').replace(/{recruiter}/g, ME).replace(/{doc}/g, c?.missing?.[0] || 'document').replace(/{link}/g, `https://quickhire.app/u/${c?.id}`).replace(/{signature}/g, sig);

export default function MessagesWorkspace() {
  const store = useComms();
  const { toasts, toast } = useToasts();
  const [filter, setFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [sel, setSel] = React.useState<string>(store.contacts[0]?.id);
  const [tab, setTab] = React.useState<'sms' | 'email' | 'internal_note' | 'call'>('sms');
  const [fromRc, setFromRc] = React.useState<string>('');
  const [fromEmail, setFromEmail] = React.useState<string>('');
  const [smsBody, setSmsBody] = React.useState('');
  const [emailSubject, setEmailSubject] = React.useState('');
  const [emailBody, setEmailBody] = React.useState('');
  const [note, setNote] = React.useState('');
  const [callNote, setCallNote] = React.useState('');
  const [followUp, setFollowUp] = React.useState(false);
  const threadRef = React.useRef<HTMLDivElement>(null);

  const c = store.contacts.find((x) => x.id === sel) || store.contacts[0];
  const smsNumbers = store.rcNumbers.filter((n) => n.active);
  const defaultRc = store.rcNumbers.find((n) => n.defaultOutbound && n.smsEnabled) || smsNumbers.find((n) => n.smsEnabled);
  const sendInboxes = store.emailInboxes.filter((n) => n.active && n.sendEmails);
  const defaultInbox = store.emailInboxes.find((n) => n.defaultOutbound && n.sendEmails) || sendInboxes[0];
  const rc = store.rcNumbers.find((n) => n.id === (fromRc || defaultRc?.id)) || defaultRc;
  const ib = store.emailInboxes.find((n) => n.id === (fromEmail || defaultInbox?.id)) || defaultInbox;

  React.useEffect(() => { if (c) svc.markRead(c.id); }, [sel]);
  React.useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [sel, store.messages.length]);

  const convos = store.contacts.map((ct) => { const msgs = svc.messagesFor(ct.id); return { ct, msgs, last: msgs[msgs.length - 1], unread: msgs.some((m) => !m.read && m.direction === 'inbound'), needsReply: msgs.some((m) => m.needsReply) }; }).filter((x) => x.last);
  convos.sort((a, b) => +new Date(b.last.time) - +new Date(a.last.time));
  const matchFilter = (cv: any) => {
    if (search && !cv.ct.name.toLowerCase().includes(search.toLowerCase())) return false;
    switch (filter) {
      case 'sms': return cv.msgs.some((m: any) => m.channel === 'sms');
      case 'email': return cv.msgs.some((m: any) => m.channel === 'email');
      case 'calls': return cv.msgs.some((m: any) => m.channel === 'call');
      case 'voicemail': return cv.msgs.some((m: any) => m.channel === 'voicemail');
      case 'notes': return cv.msgs.some((m: any) => m.channel === 'internal_note');
      case 'unread': return cv.unread;
      case 'needs': return cv.needsReply;
      case 'mine': return cv.ct.recruiter === ME;
      default: return true;
    }
  };
  const list = convos.filter(matchFilter);
  const msgs = svc.messagesFor(c?.id);

  const filters = [['all', 'All'], ['sms', 'SMS'], ['email', 'Email'], ['calls', 'Calls'], ['voicemail', 'Voicemail'], ['notes', 'Notes'], ['unread', 'Unread'], ['needs', 'Needs reply'], ['mine', 'Assigned to me']];

  const doSms = (sim = false) => { if (!smsBody.trim()) return toast('Type a message first', 'warning'); svc.sendSms(c.id, rc!.id, smsBody.trim(), { followUp, simulateFail: sim, recruiter: ME }); setSmsBody(''); setFollowUp(false); toast(sim ? 'SMS failed — alert + task created' : 'SMS sent', sim ? 'danger' : 'success'); };
  const doEmail = () => { if (!emailSubject.trim() && !emailBody.trim()) return toast('Add a subject or body', 'warning'); svc.sendEmail(c.id, ib!.id, emailSubject.trim() || '(no subject)', emailBody.trim(), { followUp, recruiter: ME }); setEmailSubject(''); setEmailBody(''); setFollowUp(false); toast('Email sent', 'success'); };
  const doNote = () => { if (!note.trim()) return; svc.saveNote(c.id, note.trim(), { recruiter: ME }); setNote(''); toast('Note saved', 'success'); };
  const doCall = (outcome: string) => { svc.logCall(c.id, rc!.id, outcome, callNote.trim(), { recruiter: ME }); setCallNote(''); const o = CALL_OUTCOMES.find((x) => x.key === outcome); toast(`Call logged · ${o?.label}`, 'success'); };

  const chip = (active: boolean) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 11px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', flex: 'none', border: active ? '1px solid #007AFF' : '1px solid rgba(0,0,0,0.10)', background: active ? 'rgba(0,122,255,0.08)' : '#fff', color: active ? '#007AFF' : '#6E6E73' });

  return <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: T.bg }}>
    {/* ============ LEFT: conversation list ============ */}
    <div style={{ width: 312, flex: 'none', borderRight: `1px solid ${T.border}`, background: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>Messages</h1><Icon name="inbox" size={18} style={{ color: T.faint }} /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 11px', marginTop: 12, background: '#F2F2F7', borderRadius: 10 }}>
          <Icon name="search" size={15} style={{ color: T.faint }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontFamily: 'inherit' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 10px', overflowX: 'auto' }}>
        {filters.map(([k, l]) => <button key={k} onClick={() => setFilter(k)} style={chip(filter === k)}>{l}</button>)}
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {list.length === 0 && <div style={{ color: T.faint, fontSize: 13, padding: 20, textAlign: 'center' }}>No conversations.</div>}
        {list.map((cv) => { const via = cv.last.channel === 'email' ? store.emailInboxes.find((i) => i.id === cv.last.via)?.label : store.rcNumbers.find((n) => n.id === cv.last.via)?.label; const ch = CHAN[cv.last.channel]; const active = cv.ct.id === sel; return (
          <button key={cv.ct.id} onClick={() => setSel(cv.ct.id)} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', borderLeft: active ? '3px solid #007AFF' : '3px solid transparent', background: active ? 'rgba(0,122,255,0.05)' : 'transparent', cursor: 'pointer' }}>
            <Avatar name={cv.ct.name} size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}><span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cv.ct.name}</span><span style={{ fontSize: 11, color: T.faint, flex: 'none' }}>{fmtWhen(cv.last.time)}</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, color: ch.color, flex: 'none' }}><Icon name={ch.icon} size={11} /></span>
                <span style={{ fontSize: 12, color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cv.last.channel === 'internal_note' ? 'Note: ' : ''}{cv.last.subject ? cv.last.subject + ' — ' : ''}{cv.last.body}</span>
                {cv.unread && <span style={{ width: 8, height: 8, borderRadius: 999, background: PRI, flex: 'none' }} />}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                {via && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600, color: T.faint, background: '#F2F2F7', borderRadius: 6, padding: '1px 7px' }}><Icon name={cv.last.channel === 'email' ? 'inbox' : 'phone'} size={10} />{via}</span>}
                {cv.needsReply && <span style={{ fontSize: 10.5, fontWeight: 600, color: WARN, background: 'rgba(255,149,0,0.12)', borderRadius: 6, padding: '1px 7px' }}>Needs reply</span>}
                {cv.ct.optOut && <span style={{ fontSize: 10.5, fontWeight: 600, color: WARN, background: 'rgba(255,149,0,0.12)', borderRadius: 6, padding: '1px 7px' }}>Opted out</span>}
              </div>
            </div>
          </button>); })}
      </div>
    </div>

    {/* ============ CENTER: thread + composer ============ */}
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: T.bg }}>
      {c && <>
        <div style={{ height: 60, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', background: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${T.border}` }}>
          <Avatar name={c.name} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 650 }}>{c.name}</div><div style={{ fontSize: 12, color: T.faint }}>{c.phone} · {c.email}</div></div>
          <Hover as="button" onClick={() => { setTab('call'); doCall('connected'); }} title="Call" style={iconBtn} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="phone" size={17} /></Hover>
          <Hover as="button" onClick={() => setTab('sms')} title="SMS" style={iconBtn} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="message" size={17} /></Hover>
          <Hover as="button" onClick={() => setTab('email')} title="Email" style={iconBtn} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="mail" size={17} /></Hover>
        </div>

        <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {msgs.map((m: any) => <ThreadItem key={m.id} m={m} store={store} />)}
        </div>

        {/* composer */}
        <div style={{ flex: 'none', borderTop: `1px solid ${T.border}`, background: '#fff', padding: '12px 18px 16px' }}>
          <div style={{ display: 'flex', gap: 2, padding: 3, background: '#F2F2F7', borderRadius: 10, width: 'fit-content', marginBottom: 12 }}>
            {[['sms', 'SMS', 'message'], ['email', 'Email', 'mail'], ['internal_note', 'Internal Note', 'pencil'], ['call', 'Call', 'phone']].map(([k, l, ic]: any) => { const on = tab === k; return <button key={k} onClick={() => setTab(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 13px', fontSize: 12.5, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer', background: on ? '#fff' : 'transparent', color: on ? T.text : T.muted, boxShadow: on ? '0 1px 2px rgba(0,0,0,0.10)' : 'none' }}><Icon name={ic} size={14} />{l}</button>; })}
          </div>

          {tab === 'sms' && <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: T.faint }}>From</span>
              <Menu width={300} trigger={<Hover as="div" style={fromBtn} hover={{ borderColor: 'rgba(0,0,0,0.18)' }}><Icon name="phone" size={14} /><b style={{ fontWeight: 650 }}>{rc?.label}</b><span style={{ color: T.faint }}>{rc?.phoneNumber}</span><Icon name="chevronDown" size={14} /></Hover>}>
                {(close: any) => store.rcNumbers.map((n) => <MenuItem key={n.id} onClick={() => { if (n.smsEnabled && n.active) { setFromRc(n.id); close(); } }} label={<span style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: n.smsEnabled && n.active ? 1 : 0.45 }}><span style={{ fontWeight: 600 }}>{n.label}</span><span style={{ color: T.faint, fontSize: 12 }}>{n.phoneNumber}</span>{!n.smsEnabled && <span style={{ fontSize: 10.5, color: WARN, marginLeft: 'auto' }}>No SMS</span>}</span>} trailing={n.id === rc?.id ? <Icon name="check" size={14} style={{ color: PRI }} /> : null} />)}
              </Menu>
              <Icon name="arrowRight" size={13} style={{ color: T.faint }} />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.name} <span style={{ color: T.faint, fontWeight: 400 }}>{c.phone}</span></span>
            </div>
            {c.optOut && <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: WARN, background: 'rgba(255,149,0,0.10)', borderRadius: 8, padding: '8px 11px', marginBottom: 9 }}><Icon name="ban" size={14} />This contact replied STOP and is opted out of SMS.</div>}
            <textarea value={smsBody} onChange={(e) => setSmsBody(e.target.value)} placeholder="Write an SMS…" style={composerBox} />
            <ComposerBar onTemplate={(b: string) => setSmsBody(fillTpl(b, c))} templates={store.smsTemplates} followUp={followUp} setFollowUp={setFollowUp} onSend={() => doSms(false)} extra={<Hover as="button" onClick={() => doSms(true)} title="Simulate failed SMS" style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.05)' }}>Test fail</Hover>} />
          </div>}

          {tab === 'email' && <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: T.faint }}>From</span>
              <Menu width={320} trigger={<Hover as="div" style={fromBtn} hover={{ borderColor: 'rgba(0,0,0,0.18)' }}><Icon name="mail" size={14} /><b style={{ fontWeight: 650 }}>{ib?.label}</b><span style={{ color: T.faint }}>{ib?.emailAddress}</span><Icon name="chevronDown" size={14} /></Hover>}>
                {(close: any) => store.emailInboxes.filter((n) => n.sendEmails).map((n) => <MenuItem key={n.id} onClick={() => { setFromEmail(n.id); close(); }} label={<span><b style={{ fontWeight: 600 }}>{n.label}</b> <span style={{ color: T.faint, fontSize: 12 }}>{n.emailAddress}</span></span>} trailing={n.id === ib?.id ? <Icon name="check" size={14} style={{ color: PRI }} /> : null} />)}
              </Menu>
              <Icon name="arrowRight" size={13} style={{ color: T.faint }} />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.name} <span style={{ color: T.faint, fontWeight: 400 }}>{c.email}</span></span>
            </div>
            <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Subject" style={{ width: '100%', height: 38, border: `1px solid ${T.border}`, borderRadius: 10, padding: '0 12px', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }} />
            <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder="Write an email…" style={{ ...composerBox, minHeight: 96 }} />
            <ComposerBar onTemplate={(tpl: any) => { setEmailSubject(fillTpl(tpl.subject, c)); setEmailBody(fillTpl(tpl.body, c, ib?.signature)); }} templates={store.emailTemplates} emailMode followUp={followUp} setFollowUp={setFollowUp} onSend={doEmail} sendLabel="Send Email" />
          </div>}

          {tab === 'internal_note' && <div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note (not sent to the driver)…" style={{ ...composerBox, background: 'rgba(255,149,0,0.05)' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}><Btn variant="primary" icon="pencil" onClick={doNote}>Save Note</Btn></div>
          </div>}

          {tab === 'call' && <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: T.faint }}>From</span>
              <Menu width={300} trigger={<Hover as="div" style={fromBtn} hover={{ borderColor: 'rgba(0,0,0,0.18)' }}><Icon name="phone" size={14} /><b style={{ fontWeight: 650 }}>{rc?.label}</b><Icon name="chevronDown" size={14} /></Hover>}>
                {(close: any) => store.rcNumbers.filter((n) => n.callsEnabled).map((n) => <MenuItem key={n.id} onClick={() => { setFromRc(n.id); close(); }} label={`${n.label} · ${n.phoneNumber}`} trailing={n.id === rc?.id ? <Icon name="check" size={14} style={{ color: PRI }} /> : null} />)}
              </Menu>
              <Icon name="arrowRight" size={13} style={{ color: T.faint }} />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.name} <span style={{ color: T.faint, fontWeight: 400 }}>{c.phone}</span></span>
            </div>
            <input value={callNote} onChange={(e) => setCallNote(e.target.value)} placeholder="Call notes (optional)" style={{ width: '100%', height: 36, border: `1px solid ${T.border}`, borderRadius: 10, padding: '0 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 10 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Btn variant="primary" icon="phone" onClick={() => doCall('connected')}>Call driver</Btn>
              {CALL_OUTCOMES.map((o) => <Hover key={o.key} as="button" onClick={() => doCall(o.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, border: `1px solid ${T.border}`, background: '#fff', color: o.color, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.03)' }}><Icon name={o.icon} size={14} />{o.label}</Hover>)}
            </div>
          </div>}
        </div>
      </>}
    </div>

    {/* ============ RIGHT: contact info ============ */}
    {c && <div style={{ width: 288, flex: 'none', borderLeft: `1px solid ${T.border}`, background: '#fff', overflowY: 'auto', padding: '22px 18px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingBottom: 16, borderBottom: `1px solid ${T.hair}` }}>
        <Avatar name={c.name} size={58} />
        <div style={{ fontSize: 15, fontWeight: 650, marginTop: 10 }}>{c.name}</div>
        <div style={{ fontSize: 12, color: T.faint, marginTop: 3 }}>{c.kind === 'driver' ? 'Driver' : 'Candidate'} · {c.stage}</div>
        <div style={{ marginTop: 8 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: '#0066CC', background: 'rgba(0,122,255,0.10)', borderRadius: 999, padding: '3px 10px' }}>Recruiter · {c.recruiter}</span></div>
      </div>

      <Section title="Missing Documents">
        {c.missing.length === 0 ? <Line ok>All documents collected</Line> : c.missing.map((d: string) => <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '5px 0', color: '#C62820' }}><Icon name="alert" size={14} />{d}</div>)}
      </Section>

      <Section title="Communication Status">
        <Row label="Last contact" value={msgs.length ? fmtWhen(msgs[msgs.length - 1].time) + ' ago' : '—'} />
        <Row label="SMS opt-out" value={c.optOut ? 'Yes' : 'No'} color={c.optOut ? WARN : undefined} />
        <Row label="DocuSign" value={c.docusign} />
        <Row label="Assigned number" value={store.rcNumbers.find((n) => n.id === c.rcNumberId)?.label || '—'} />
        <Row label="Assigned inbox" value={store.emailInboxes.find((n) => n.id === c.inboxId)?.label || '—'} />
      </Section>

      <Section title="DocuSign">
        <div style={{ display: 'flex', gap: 8 }}>
          <Hover as="button" onClick={() => { svc.docusignReminder(c.id, 'sms'); toast('DocuSign reminder sent by SMS', 'success'); }} style={qaBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="message" size={14} />Remind SMS</Hover>
          <Hover as="button" onClick={() => { svc.docusignReminder(c.id, 'email'); toast('DocuSign reminder sent by email', 'success'); }} style={qaBtn} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="mail" size={14} />Remind Email</Hover>
        </div>
      </Section>

      <Section title="Quick Actions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Hover as="button" onClick={() => { svc.sendSms(c.id, rc!.id, fillTpl('Hi {name}, we still need your {doc}. Upload here: {link}', c), { followUp: true }); toast('Document request sent + follow-up task', 'success'); }} style={qaWide} hover={{ background: 'rgba(0,0,0,0.04)' }}>Request documents</Hover>
          <Hover as="button" onClick={() => { svc._task({ title: `Follow up — ${c.name}`, contactId: c.id }); toast('Follow-up task created', 'success'); }} style={qaWide} hover={{ background: 'rgba(0,0,0,0.04)' }}>Create follow-up task</Hover>
          <Hover as="button" onClick={() => { svc.markOptOut(c.id); toast('Marked SMS opt-out', 'warning'); }} style={qaWide} hover={{ background: 'rgba(0,0,0,0.04)' }}>Mark STOP / opt-out</Hover>
        </div>
      </Section>
    </div>}
    <ToastHost toasts={toasts} />
  </div>;
}

/* ---- thread item renderers ---- */
function ThreadItem({ m, store }: any) {
  if (m.channel === 'sms') {
    const me = m.direction === 'outbound';
    const st = MSG_STATUS[m.status] || {};
    return <div style={{ display: 'flex', flexDirection: 'column', alignItems: me ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '72%', padding: '10px 14px', borderRadius: me ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: me ? (m.status === 'failed' ? '#FFE8E6' : '#007AFF') : '#fff', color: me ? (m.status === 'failed' ? '#C62820' : '#fff') : '#1D1D1F', border: me ? 'none' : '1px solid rgba(0,0,0,0.08)' }}><div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{m.body}</div></div>
      <div style={{ fontSize: 11, color: m.status === 'failed' ? '#C62820' : '#8E8E93', marginTop: 4, display: 'flex', gap: 6 }}>{fmtClock(m.time)} · {me ? st.label : 'Received'}{m.via ? ` · ${store.rcNumbers.find((n: any) => n.id === m.via)?.label || ''}` : ''}</div>
    </div>;
  }
  if (m.channel === 'internal_note') {
    return <div style={{ background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.2)', borderRadius: 12, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: '#A05A00', marginBottom: 3 }}><Icon name="pencil" size={12} />Internal note · {m.recruiter} · {fmtClock(m.time)}</div>
      <div style={{ fontSize: 13.5, color: '#3a3a3c' }}>{m.body}</div>
    </div>;
  }
  if (m.channel === 'email') {
    const me = m.direction === 'outbound';
    return <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: 14, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(88,86,214,0.12)', color: '#5856D6', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name="mail" size={14} /></span>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 650 }}>{m.subject}</div><div style={{ fontSize: 11.5, color: T.faint }}>{m.from} → {m.to}</div></div>
        <div style={{ fontSize: 11, color: me ? (MSG_STATUS[m.status]?.color) : T.faint }}>{fmtClock(m.time)} · {me ? MSG_STATUS[m.status]?.label : 'Received'}</div>
      </div>
      <div style={{ fontSize: 13, color: '#3a3a3c', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.body}</div>
      <div style={{ fontSize: 11, color: T.faint, marginTop: 6 }}>{store.emailInboxes.find((i: any) => i.id === m.via)?.label} inbox</div>
    </div>;
  }
  // call / voicemail
  const o = CALL_OUTCOMES.find((x) => x.key === m.callOutcome) || { label: m.callOutcome, icon: 'phone', color: '#8E8E93' };
  const vm = m.channel === 'voicemail';
  return <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '11px 14px', alignSelf: m.direction === 'outbound' ? 'flex-end' : 'flex-start', maxWidth: '72%' }}>
    <span style={{ width: 32, height: 32, borderRadius: 999, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: vm ? 'rgba(88,86,214,0.12)' : (m.status === 'missed' ? 'rgba(255,59,48,0.12)' : 'rgba(52,199,89,0.12)'), color: vm ? '#5856D6' : (m.status === 'missed' ? '#FF3B30' : '#34C759') }}><Icon name={vm ? 'voicemail' : (m.status === 'missed' ? 'phoneMissed' : 'phone')} size={15} /></span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{vm ? 'Voicemail' : (m.direction === 'inbound' ? 'Incoming call' : 'Outgoing call')} · {o.label}</div>
      <div style={{ fontSize: 12, color: T.faint }}>{m.body}{m.durationSec ? ` · ${Math.floor(m.durationSec / 60)}:${String(m.durationSec % 60).padStart(2, '0')}` : ''}</div>
    </div>
    <div style={{ fontSize: 11, color: T.faint, flex: 'none' }}>{fmtClock(m.time)}</div>
  </div>;
}

function ComposerBar({ onTemplate, templates, emailMode, followUp, setFollowUp, onSend, sendLabel = 'Send', extra }: any) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
    <Menu width={260} trigger={<Hover as="button" style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="fileText" size={14} />Template</Hover>}>
      {(close: any) => templates.map((t: any) => <MenuItem key={t.id} label={t.name} onClick={() => { onTemplate(emailMode ? t : t.body); close(); }} />)}
    </Menu>
    {emailMode && <Hover as="button" style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="paperclip" size={14} />Attach file</Hover>}
    <Hover as="button" style={ghostBtn} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="link" size={14} />Attach link</Hover>
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: T.muted, cursor: 'pointer' }}><span onClick={() => setFollowUp(!followUp)} style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${followUp ? '#007AFF' : 'rgba(0,0,0,0.25)'}`, background: followUp ? '#007AFF' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>{followUp && <Icon name="check" size={12} />}</span>Create follow-up task</label>
    <div style={{ flex: 1 }} />
    {extra}
    <Btn variant="primary" icon="send" onClick={onSend}>{sendLabel}</Btn>
  </div>;
}

const iconBtn: React.CSSProperties = { width: 36, height: 36, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 9, color: '#3a3a3c', cursor: 'pointer' };
const fromBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 11px', borderRadius: 9, border: '1px solid rgba(0,0,0,0.12)', background: '#fff', color: '#3a3a3c', fontSize: 12.5, cursor: 'pointer' };
const composerBox: React.CSSProperties = { width: '100%', minHeight: 56, maxHeight: 160, resize: 'vertical', border: `1px solid ${T.border}`, borderRadius: 12, padding: '11px 13px', fontSize: 13.5, lineHeight: 1.5, fontFamily: 'inherit', outline: 'none', color: T.text };
const ghostBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 11px', borderRadius: 9, border: 'none', background: 'transparent', color: T.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };
const qaBtn: React.CSSProperties = { flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, borderRadius: 9, border: `1px solid ${T.border}`, background: '#fff', color: '#1D1D1F', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };
const qaWide: React.CSSProperties = { width: '100%', height: 36, borderRadius: 10, border: `1px solid ${T.border}`, background: '#fff', color: '#1D1D1F', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center' };

function Section({ title, children }: any) { return <div style={{ padding: '16px 0', borderBottom: `1px solid ${T.hair}` }}><div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.faint, marginBottom: 10 }}>{title}</div>{children}</div>; }
function Row({ label, value, color }: any) { return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', fontSize: 12.5 }}><span style={{ color: T.faint }}>{label}</span><span style={{ fontWeight: 600, color: color || T.text, textAlign: 'right' }}>{value}</span></div>; }
function Line({ children, ok }: any) { return <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: ok ? '#248A3D' : T.text }}><Icon name="check" size={14} />{children}</div>; }
