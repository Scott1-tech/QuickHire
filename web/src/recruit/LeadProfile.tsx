import React from 'react';
import { Hover } from '../lib/dc';
import { T, Icon } from '../tasks/lib';
import { Card, Field, Input, Select, Textarea, primaryBtn, ghostBtn } from '../esign/ui';
import { svc as hireSvc } from '../hire/store';
import { pickAndSave, openFile } from '../shell/files';
import {
  useRecruit, svc, USERS, SOURCES, SCORE_META, INTEREST,
  isOverdue, daysInStage, stageByName, fmtAgo, fmtDate, dueLabel,
} from './store';

const BG = '#F5F5F7';
const owner = (id: string) => USERS.find((u) => u.id === id);
const sourceMeta = (k: string) => SOURCES.find((s) => s.key === k) || SOURCES[1];
const ACT_ICON: Record<string, string> = { lead: 'plus', anna: 'sparkles', comm: 'phone', note: 'fileText', stage: 'arrowRight', assignment: 'users', document: 'fileText', task: 'listChecks', decision: 'checkCircle', archive: 'ban', consent: 'shield', system: 'alert' };
const initials = (n: string) => (n || '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

/* Full-page recruiting lead profile — activity in the middle, like the hiring profile. */
export function LeadProfile({ id, go, onClose, toast, setModal }: any) {
  const store = useRecruit(); void store;
  const l = svc.lead(id); if (!l) return <div style={{ padding: 40 }}>Lead not found.</div>;
  const sm = SCORE_META[l.scoreLabel]; const st = stageByName(l.stageName);

  const comm = (channel: string, direction: string, outcome?: string) => { const r = svc.logComm(id, { channel, direction, outcome }); if ((r as any)?.blocked) toast('Blocked — Do-Not-Contact', 'error'); else toast('Logged', 'success'); };

  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: BG }}>
    {/* header */}
    <div style={{ flex: 'none', background: '#fff', borderBottom: `1px solid ${T.hair}`, padding: '14px 24px' }}>
      <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: T.muted, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12 }}><Icon name="chevronLeft" size={15} />Pipeline</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 54, height: 54, flex: 'none', borderRadius: 999, background: '#007AFF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 650 }}>{initials(l.name)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{l.name}</h1>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: sm.bg, color: sm.color }}>{l.scoreLabel} · {l.score}</span>
            {l.consent?.doNotContact && <span style={{ fontSize: 11, fontWeight: 600, color: '#C62820', background: 'rgba(255,69,58,0.1)', borderRadius: 999, padding: '3px 9px' }}>Do-Not-Contact</span>}
            <button onClick={() => setModal({ kind: 'editLead', id })} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="pencil" size={13} /></button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 6, fontSize: 12.5, color: T.muted }}>
            <Meta icon="phone" v={l.phone} /><Meta icon="mapPin" v={l.location} /><Meta icon="sign" v={l.licenseType} /><Meta icon="briefcase" v={`${l.experienceYears} yrs`} /><Meta icon={sourceMeta(l.source).icon} v={sourceMeta(l.source).label} /><Meta icon="arrowRight" v={`${l.stageName} · ${daysInStage(l)}d`} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['phone', 'Call', () => comm('call', 'outbound', 'connected')], ['message', 'SMS', () => comm('sms', 'outbound')], ['mail', 'Email', () => comm('email', 'outbound')], ['arrowRight', 'Stage', () => setModal({ kind: 'moveStage', id })], ['listChecks', 'Task', () => setModal({ kind: 'nextAction', id })]].map(([icon, label, fn]: any) =>
            <Hover key={label} as="button" onClick={fn} title={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: 54, padding: '8px 0', borderRadius: 10, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', color: T.text }} hover={{ background: T.hover }}><Icon name={icon} size={16} /><span style={{ fontSize: 10, fontWeight: 600, color: T.muted }}>{label}</span></Hover>)}
        </div>
      </div>
      {l.previousApplication && <div style={{ marginTop: 10, padding: '8px 11px', borderRadius: 10, background: 'rgba(255,159,10,0.12)', fontSize: 12, color: '#A05A00' }}><Icon name="refresh" size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Previous application — closed “{l.previousApplication.closeReason || '—'}” ({fmtDate(l.previousApplication.archivedAt)})</div>}
    </div>

    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      {/* LEFT: score / AI / consent / next action */}
      <div style={{ width: 300, flex: 'none', borderRight: `1px solid ${T.hair}`, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card style={{ padding: 16, borderColor: 'rgba(0,122,255,0.18)', background: 'linear-gradient(180deg,#F7FAFF,#FFFFFF)' }}>
          <Label>Driver score</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Ring score={l.score} color={sm.color} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: sm.bg, color: sm.color }}>{l.scoreLabel}</span>
              <div style={{ fontSize: 11.5, color: T.faint, marginTop: 5 }}>Interest: {INTEREST[l.interest]?.label || l.interest}</div>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>{l.annaSummary || 'No Anna conversation summary yet.'}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <Mini label="Edit summary" onClick={() => setModal({ kind: 'annaSummary', id })} />
            <Mini label="Escalate" onClick={() => { svc.escalate(id, 'Recruiter requested review'); toast('Escalated', 'info'); }} />
            <Mini label="Flag no-response" onClick={() => { svc.flagNoResponse(id); toast('Flagged', 'info'); }} />
          </div>
        </Card>

        <Card style={{ padding: 14 }}>
          <Label>Consent (TCPA)</Label>
          <div style={{ fontSize: 12.5, color: l.consent?.doNotContact ? '#C62820' : T.muted, marginBottom: 8 }}>{l.consent?.status === 'in' ? 'Opted In' : l.consent?.status === 'out' ? 'Opted Out — Do-Not-Contact' : 'Not yet asked'}{l.consent?.at ? ` · ${fmtDate(l.consent.at)}` : ''}</div>
          <Select value={l.consent?.status || 'not_asked'} onChange={(v: string) => { svc.setConsent(id, v); toast('Consent updated', 'success'); }} options={[{ value: 'not_asked', label: 'Not asked' }, { value: 'in', label: 'Opted In' }, { value: 'out', label: 'Opted Out' }]} style={{ height: 34 }} />
        </Card>

        <Card style={{ padding: 14 }}>
          <Label right={<button onClick={() => setModal({ kind: 'nextAction', id })} style={linkBtn}>Set</button>}>Next action</Label>
          {l.nextAction && l.nextAction.status !== 'done' ? <div style={{ padding: '10px 12px', borderRadius: 10, background: isOverdue(l) ? 'rgba(255,69,58,0.07)' : '#F2F2F7' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{l.nextAction.title}</div>
            <div style={{ fontSize: 11.5, color: isOverdue(l) ? '#C62820' : T.faint, marginTop: 2 }}>{owner(l.nextAction.assignee)?.name} · {dueLabel(l.nextAction.due)} · {l.nextAction.priority}</div>
            <Hover as="button" onClick={() => { svc.completeNextAction(id); toast('Done', 'success'); }} style={{ ...ghostBtn, height: 30, padding: '0 11px', fontSize: 12, marginTop: 8 }} hover={{ background: 'rgba(0,0,0,0.04)' }}>Mark done</Hover>
          </div> : <div style={{ fontSize: 12.5, color: T.faint }}>No open next action.</div>}
        </Card>
      </div>

      {/* MIDDLE: activity */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <ActivityCenter l={l} id={id} toast={toast} />
      </div>

      {/* RIGHT: source / screening / documents / decision */}
      <div style={{ width: 328, flex: 'none', borderLeft: `1px solid ${T.hair}`, background: '#fff', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <Label>Source & assignment</Label>
          <KV k="Source" v={sourceMeta(l.source).label} />
          <RowSel k="Owner" value={l.ownerId} onChange={(v: string) => { svc.assign(id, v); toast('Reassigned', 'success'); }} options={USERS.map((u) => ({ value: u.id, label: u.name }))} />
          <RowSel k="Interest" value={l.interest} onChange={(v: string) => svc.update(id, { interest: v })} options={Object.keys(INTEREST).map((key) => ({ value: key, label: INTEREST[key].label }))} />
          <KV k="Stage" v={`${l.stageName}${st?.maxDays ? ` · ${daysInStage(l)}/${st.maxDays}d` : ''}`} />
        </div>
        <div style={{ borderTop: `1px solid ${T.hair}`, paddingTop: 12 }}>
          <Label>Screening</Label>
          {['cdlValid', 'mvrClear', 'medical'].map((k) => <RowSel key={k} k={k.replace(/([A-Z])/g, ' $1').replace(/^\w/, (c) => c.toUpperCase())} value={String(l.screening?.[k] ?? '')} onChange={(v: string) => svc.update(id, { screening: { ...l.screening, [k]: v === '' ? null : v === 'true' } })} options={[{ value: '', label: '—' }, { value: 'true', label: 'Pass' }, { value: 'false', label: 'Fail' }]} />)}
        </div>
        <div style={{ borderTop: `1px solid ${T.hair}`, paddingTop: 12 }}>
          <Label>Documents</Label>
          {l.documents.map((d: any) => <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
            <span title={d.fileName || d.name} style={{ fontSize: 12.5, color: T.muted, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{d.name}{d.fileName && <Icon name="paperclip" size={11} style={{ color: '#007AFF', flex: 'none' }} />}</span>
            <button title={d.fileId ? 'View file' : 'Upload file'} onClick={() => { if (d.fileId) { if (!openFile(d.fileId)) toast('File unavailable', 'error'); } else pickAndSave('application/pdf,image/*', (f) => { svc.setDocFile(id, d.name, f.id, f.name); toast(`${d.name} uploaded — ${f.name}`, 'success'); }, (m) => toast(m, 'error')); }} style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', color: d.fileId ? '#007AFF' : T.muted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={d.fileId ? 'eye' : 'upload'} size={13} /></button>
            <Select value={d.status} onChange={(v: string) => svc.setDoc(id, d.name, v)} options={[{ value: 'missing', label: 'Missing' }, { value: 'requested', label: 'Requested' }, { value: 'received', label: 'Received' }]} style={{ width: 118, height: 32 }} />
          </div>)}
        </div>
        <div style={{ borderTop: `1px solid ${T.hair}`, paddingTop: 12 }}>
          <Label>Final decision & archive</Label>
          <KV k="Decision" v={l.decision ? l.decision.replace(/_/g, ' ') : '—'} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <Mini label="Approve" onClick={() => { svc.close(id, 'acceptable', 'Approved for hire', true); toast('Approved', 'success'); }} />
            <Mini label="Reject" onClick={() => setModal({ kind: 'close', id, decision: 'not_acceptable' })} />
            <Mini label="Refused" onClick={() => setModal({ kind: 'close', id, decision: 'refused' })} />
            <Mini label="Archive" onClick={() => setModal({ kind: 'archive', id })} />
          </div>
          {l.stageName === 'Hired' && <Hover as="button" onClick={() => { hireSvc.addDriver({ name: l.name, phone: l.phone, email: l.email, carrier: l.carrier, position: 'Company Driver' }, 'Onboarding'); toast('Sent to onboarding', 'success'); go && go('pipeline'); }} style={{ ...primaryBtn, marginTop: 10, width: '100%', justifyContent: 'center' }} hover={{ background: '#0066D6' }}><Icon name="arrowRight" size={15} />Send to Onboarding</Hover>}
        </div>
      </div>
    </div>
  </div>;
}

function ActivityCenter({ l, id, toast }: any) {
  const [chan, setChan] = React.useState('note');
  const [body, setBody] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const types = ['all', ...Array.from(new Set(l.activities.map((a: any) => a.type)))] as string[];
  const items = l.activities.filter((a: any) => filter === 'all' || a.type === filter);
  const submit = () => {
    if (!body.trim() && chan !== 'call') return;
    if (chan === 'note') svc.addNote(id, body);
    else { const r = svc.logComm(id, { channel: chan, direction: 'outbound', outcome: chan === 'call' ? 'connected' : 'sent', note: body }); if ((r as any)?.blocked) { toast('Blocked — Do-Not-Contact', 'error'); return; } }
    setBody(''); toast(chan === 'note' ? 'Note added' : 'Logged', 'success');
  };
  return <>
    <div style={{ flex: 'none', padding: '16px 20px 10px', borderBottom: `1px solid ${T.hair}` }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Activity</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Select value={chan} onChange={setChan} options={[{ value: 'note', label: 'Note' }, { value: 'call', label: 'Call log' }, { value: 'sms', label: 'SMS' }, { value: 'email', label: 'Email' }]} style={{ width: 120, height: 38 }} />
        <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder={chan === 'note' ? 'Write a note…' : chan === 'call' ? 'Call outcome / notes…' : `Message to ${l.name.split(' ')[0]}…`} style={{ flex: 1, height: 38, borderRadius: 10, border: `1px solid ${T.border}`, padding: '0 12px', fontSize: 13.5, outline: 'none' }} />
        <Hover as="button" onClick={submit} style={{ ...primaryBtn, height: 38 }} hover={{ background: '#0066D6' }}><Icon name="send" size={15} />Log</Hover>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {types.map((t) => <button key={t} onClick={() => setFilter(t)} style={{ height: 26, padding: '0 10px', borderRadius: 999, border: `1px solid ${filter === t ? '#007AFF' : T.border}`, background: filter === t ? 'rgba(0,122,255,0.08)' : '#fff', color: filter === t ? '#007AFF' : T.muted, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>)}
      </div>
    </div>
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 20px 28px', maxWidth: 720 }}>
      {items.length === 0 ? <div style={{ fontSize: 12.5, color: T.faint }}>No activity.</div> : items.map((a: any, i: number) => <div key={a.id} style={{ display: 'flex', gap: 12, padding: '11px 0', borderTop: i ? `1px solid ${T.hair}` : 'none' }}>
        <span style={{ width: 28, height: 28, flex: 'none', borderRadius: 999, background: a.user === 'Anna' ? 'rgba(0,122,255,0.1)' : '#F2F2F7', color: a.user === 'Anna' ? '#007AFF' : T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={ACT_ICON[a.type] || 'circle'} size={13} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5 }}>{a.title}{a.outcome ? ` · ${a.outcome}` : ''}{a.duration ? ` · ${a.duration}s` : ''}</div>
          {a.detail && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{a.detail}</div>}
          <div style={{ fontSize: 11, color: T.faint, marginTop: 3 }}>{a.user}{a.channel ? ` · ${a.direction} ${a.channel}` : ''} · {fmtAgo(a.at)}</div>
        </div>
      </div>)}
    </div>
  </>;
}

function Meta({ icon, v }: any) { return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name={icon} size={13} style={{ color: '#C7C7CC' }} />{v}</span>; }
function Label({ children, right }: any) { return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}><span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.faint }}>{children}</span>{right}</div>; }
function KV({ k, v }: any) { return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', fontSize: 12.5 }}><span style={{ color: T.faint }}>{k}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span></div>; }
function RowSel({ k, value, onChange, options }: any) { return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 0' }}><span style={{ fontSize: 12.5, color: T.muted, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k}</span><Select value={value} onChange={onChange} options={options} style={{ width: 130, height: 32 }} /></div>; }
function Mini({ label, onClick }: any) { return <Hover as="button" onClick={onClick} style={{ height: 30, padding: '0 11px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: T.text }} hover={{ background: T.hover }}>{label}</Hover>; }
const linkBtn: React.CSSProperties = { border: 'none', background: 'transparent', color: '#007AFF', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' };
function Ring({ score, color }: any) { const r = 23, c = 2 * Math.PI * r; return <div style={{ position: 'relative', width: 52, height: 52, flex: 'none' }}><svg width={52} height={52} style={{ transform: 'rotate(-90deg)' }}><circle cx={26} cy={26} r={r} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={5} /><circle cx={26} cy={26} r={r} fill="none" stroke={color} strokeWidth={5} strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} strokeLinecap="round" /></svg><div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color }}>{score}</div></div>; }
