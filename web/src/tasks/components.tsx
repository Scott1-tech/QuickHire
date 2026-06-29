import React from 'react';
import { Hover } from '../lib/dc';
import {
  T, Icon, Avatar, StatusChip, PriorityFlag, SourceChip, TagChip, CheckCircle, Btn, TruckStatusChip,
  StatusSelect, PrioritySelect, AssigneeSelect, Menu, MenuItem, FilterSelect,
  STATUS, STATUS_ORDER, PRIORITY_ORDER, PRIORITY, SOURCE, RELATED_ICON, dueInfo, fmtDate, iso, addDays,
  useTasksCtx,
} from './lib';
import { PEOPLE, nameOf, TAGS, CARRIERS, TRUCKS, CARRIER_MC } from './data';

/* ---- @mention rendering ---- */
function MentionText({ text }: { text: string }) {
  const names = PEOPLE.map((p) => p.name).sort((a, b) => b.length - a.length);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(@(?:' + names.map(esc).join('|') + '))', 'g');
  const parts = text.split(re);
  return <>{parts.map((p, i) => p.startsWith('@') && names.includes(p.slice(1))
    ? <span key={i} style={{ color: '#007AFF', fontWeight: 600, background: 'rgba(0,122,255,0.08)', borderRadius: 5, padding: '0 3px' }}>{p}</span>
    : <React.Fragment key={i}>{p}</React.Fragment>)}</>;
}

/* ---- comment composer with @mentions ---- */
function CommentComposer({ onSubmit, onCancel, placeholder = 'Write a comment…', autoFocus, compact }: any) {
  const [text, setText] = React.useState('');
  const [mq, setMq] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);

  const onChange = (e: any) => {
    const v = e.target.value; setText(v);
    const upto = v.slice(0, e.target.selectionStart);
    const m = upto.match(/(?:^|\s)@(\w*)$/);
    setMq(m ? m[1] : null);
  };
  const pick = (p: any) => {
    const el = ref.current!; const caret = el.selectionStart;
    const upto = text.slice(0, caret).replace(/(^|\s)@(\w*)$/, (_f, pre) => pre + '@' + p.name + ' ');
    const nv = upto + text.slice(caret); setText(nv); setMq(null);
    setTimeout(() => { el.focus(); el.setSelectionRange(upto.length, upto.length); }, 0);
  };
  const submit = () => { if (!text.trim()) return; const mentions = PEOPLE.filter((p) => text.includes('@' + p.name)).map((p) => p.name); onSubmit(text.trim(), mentions); setText(''); setMq(null); };
  const insertAt = () => { const el = ref.current!; const c = el.selectionStart; const nv = text.slice(0, c) + '@' + text.slice(c); setText(nv); setMq(''); setTimeout(() => { el.focus(); el.setSelectionRange(c + 1, c + 1); }, 0); };
  const filtered = mq != null ? PEOPLE.filter((p) => p.name.toLowerCase().includes(mq.toLowerCase())) : [];

  return <div style={{ position: 'relative', border: `1px solid ${T.border}`, borderRadius: 12, background: '#fff', boxShadow: compact ? 'none' : '0 1px 2px rgba(0,0,0,0.03)' }}>
    {mq != null && filtered.length > 0 && <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 30, width: 230, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.14)', padding: 6 }}>
      {filtered.map((p) => <Hover key={p.initials} as="button" onClick={() => pick(p)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', height: 34, padding: '0 8px', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', fontSize: 13 }} hover={{ background: 'rgba(0,0,0,0.05)' }}><Avatar name={p.name} size={22} />{p.name}</Hover>)}
    </div>}
    <textarea ref={ref} value={text} onChange={onChange} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }} placeholder={placeholder} style={{ width: '100%', resize: 'none', minHeight: compact ? 38 : 44, maxHeight: 140, padding: '11px 13px 4px', border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.5, background: 'transparent', color: T.text, display: 'block' }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '4px 8px 6px' }}>
      <Hover as="button" title="Mention" onClick={insertAt} style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 8, color: T.faint, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.06)' }}><Icon name="atSign" size={16} /></Hover>
      <Hover as="button" title="Attach" style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 8, color: T.faint, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.06)' }}><Icon name="paperclip" size={16} /></Hover>
      <Hover as="button" title="Emoji" style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 8, color: T.faint, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.06)' }}><Icon name="smile" size={16} /></Hover>
      <div style={{ flex: 1 }} />
      {onCancel && <Hover as="button" onClick={onCancel} style={{ height: 30, padding: '0 11px', border: 'none', background: 'transparent', borderRadius: 8, color: T.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.06)' }}>Cancel</Hover>}
      <button onClick={submit} disabled={!text.trim()} style={{ width: 32, height: 32, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: text.trim() ? '#007AFF' : '#E5E5EA', border: 'none', borderRadius: 9, color: '#fff', cursor: text.trim() ? 'pointer' : 'default', transition: 'background .15s' }}><Icon name="send" size={15} /></button>
    </div>
  </div>;
}

/* ---- a comment with reactions + threaded replies ---- */
function CommentBubble({ c }: any) {
  return <div style={{ flex: 1, minWidth: 0 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{c.author}</span><span style={{ fontSize: 11.5, color: T.faint }}>{fmtDate(c.time)}</span></div>
    <div style={{ fontSize: 13.5, color: '#3a3a3c', marginTop: 3, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}><MentionText text={c.text} /></div>
    {c.image && <div style={{ marginTop: 8, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', maxWidth: 280 }}><img src={c.image} alt="" style={{ display: 'block', width: '100%' }} /></div>}
  </div>;
}
function CommentCard({ comment, onReply }: any) {
  const [replying, setReplying] = React.useState(false);
  const replies = comment.replies || [];
  return <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
    <div style={{ display: 'flex', gap: 11 }}>
      <Avatar name={comment.author} size={30} />
      <CommentBubble c={comment} />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${T.hair}` }}>
      <Hover as="button" title="Like" style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 7, color: T.faint, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.06)', color: '#007AFF' }}><Icon name="thumbsUp" size={15} /></Hover>
      <Hover as="button" title="React" style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 7, color: T.faint, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.06)' }}><Icon name="smile" size={15} /></Hover>
      <div style={{ flex: 1 }} />
      <Hover as="button" onClick={() => setReplying((r) => !r)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', border: 'none', background: 'transparent', borderRadius: 8, color: T.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.06)' }}><Icon name="cornerDownRight" size={14} />Reply</Hover>
    </div>
    {replies.length > 0 && <div style={{ marginTop: 10, paddingLeft: 14, borderLeft: `2px solid ${T.hair}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {replies.map((r: any) => <div key={r.id} style={{ display: 'flex', gap: 10 }}><Avatar name={r.author} size={26} /><CommentBubble c={r} /></div>)}
    </div>}
    {replying && <div style={{ marginTop: 10, paddingLeft: 14 }}><CommentComposer compact autoFocus placeholder={`Reply to ${comment.author}…`} onCancel={() => setReplying(false)} onSubmit={(t: string, m: string[]) => { onReply(comment.id, t, m); setReplying(false); }} /></div>}
  </div>;
}

/* ---- carrier → truck picker ---- */
function TruckAssign({ task }: any) {
  const ctx = useTasksCtx();
  const [carrier, setCarrier] = React.useState(task.carrier && CARRIER_MC[task.carrier] ? task.carrier : CARRIERS[0]);
  const trucks = TRUCKS.filter((t) => t.carrier === carrier);
  const selectedUnit = task.relatedType === 'truck' ? task.related : null;
  const pick = (tr: any) => { ctx.updateTask(task.id, { carrier, relatedType: 'truck', related: 'Unit ' + tr.unit }); ctx.toast(`Assigned Unit ${tr.unit} · ${carrier}`, 'success'); };
  return <div style={{ border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 22 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: `1px solid ${T.hair}` }}>
      <span style={{ width: 32, height: 32, flex: 'none', borderRadius: 9, background: 'rgba(0,122,255,0.10)', color: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="truck" size={17} /></span>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 650 }}>Assign Truck</div><div style={{ fontSize: 11.5, color: T.faint }}>{CARRIER_MC[carrier] || ''} · {trucks.length} units</div></div>
      <Menu align="right" width={240} trigger={<Hover as="div" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 11px', borderRadius: 9, border: '1px solid rgba(0,0,0,0.10)', background: '#fff', color: '#3a3a3c', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', maxWidth: 200 }} hover={{ borderColor: 'rgba(0,0,0,0.18)' }}><Icon name="building" size={14} /><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{carrier}</span><Icon name="chevronDown" size={14} /></Hover>}>
        {(close: any) => CARRIERS.map((c) => <MenuItem key={c} label={c} onClick={() => { setCarrier(c); close(); }} trailing={c === carrier ? <Icon name="check" size={14} style={{ color: '#007AFF' }} /> : null} />)}
      </Menu>
    </div>
    <div style={{ maxHeight: 224, overflowY: 'auto' }}>
      {trucks.map((tr) => { const sel = selectedUnit === 'Unit ' + tr.unit; return (
        <Hover key={tr.unit} onClick={() => pick(tr)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 14px', borderTop: `1px solid ${T.hair}`, cursor: 'pointer', background: sel ? 'rgba(0,122,255,0.05)' : '#fff' }} hover={{ background: sel ? 'rgba(0,122,255,0.07)' : T.hover }}>
          <span style={{ width: 18, height: 18, flex: 'none', borderRadius: 999, border: `1.5px solid ${sel ? '#007AFF' : 'rgba(0,0,0,0.25)'}`, background: sel ? '#007AFF' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>{sel && <Icon name="check" size={12} />}</span>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 650 }}>Unit #{tr.unit}</div><div style={{ fontSize: 11.5, color: T.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr.driver === '—' ? 'Unassigned' : tr.driver}</div></div>
          <TruckStatusChip status={tr.status} />
        </Hover>); })}
    </div>
  </div>;
}

function Row({ icon, label, children }: any) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 38 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, width: 140, flex: 'none', color: T.faint, fontSize: 12.5 }}>{icon && <Icon name={icon} size={15} />}{label}</div>
    <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.text }}>{children}</div>
  </div>;
}
function SectionTitle({ children, right }: any) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 10px' }}><div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.faint }}>{children}</div>{right}</div>;
}
function TagPicker({ value, onChange, trigger }: any) {
  return <Menu width={200} trigger={trigger}>
    {() => TAGS.map((tg) => { const on = value.includes(tg); return <MenuItem key={tg} label={tg} onClick={() => onChange(on ? value.filter((x: string) => x !== tg) : [...value, tg])} trailing={on ? <Icon name="check" size={14} style={{ color: '#007AFF' }} /> : null} />; })}
  </Menu>;
}

/* ============================ TASK DETAIL DRAWER ============================ */
export function TaskDetail({ task, onClose }: any) {
  const ctx = useTasksCtx();
  const [title, setTitle] = React.useState(task.title);
  const [desc, setDesc] = React.useState(task.description || '');
  const [newCheck, setNewCheck] = React.useState('');
  const [newSub, setNewSub] = React.useState('');
  const [showHistory, setShowHistory] = React.useState(false);
  const [narrow, setNarrow] = React.useState(typeof window !== 'undefined' && window.innerWidth < 880);
  React.useEffect(() => { setTitle(task.title); setDesc(task.description || ''); }, [task.id]);
  React.useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  React.useEffect(() => { const h = () => setNarrow(window.innerWidth < 880); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);

  const update = (patch: any) => ctx.updateTask(task.id, patch);
  const checkDone = task.checklist.filter((c: any) => c.done).length;
  const info = dueInfo(task);
  const dueOpts = [['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7], ['No date', null]] as any[];
  const commentCount = task.comments.reduce((n: number, c: any) => n + 1 + (c.replies ? c.replies.length : 0), 0);
  const DueField = (
    <Menu width={180} trigger={<Hover as="span" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 8px', borderRadius: 8, cursor: 'pointer', color: info.label ? info.color : T.faint, fontWeight: 600 }} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="calendar" size={13} />{info.label || 'Set date'}</Hover>}>
      {(close: any) => dueOpts.map(([l, n]: any) => <MenuItem key={l} label={l} onClick={() => { update({ due: n === null ? null : iso(addDays(new Date(), n)) }); close(); }} />)}
    </Menu>
  );

  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: narrow ? 0 : '3vh 2vw', animation: 'qhFade .16s ease' }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: narrow ? '100vw' : 'min(1180px, 96vw)', height: narrow ? '100vh' : 'min(880px, 94vh)', background: '#fff', borderRadius: narrow ? 0 : 16, boxShadow: '0 40px 100px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'qhScaleIn .18s ease' }}>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 52, flex: 'none', padding: '0 14px', borderBottom: `1px solid ${T.hair}` }}>
        <CheckCircle done={task.status === 'complete'} onClick={() => ctx.toggleComplete(task.id)} size={20} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12.5, fontWeight: 600, color: T.muted }}><Icon name="listChecks" size={14} />Task</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: T.faint, fontSize: 12.5 }}><Icon name="message" size={14} />{commentCount}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: T.faint, fontSize: 12.5 }}><Icon name="paperclip" size={14} />{task.attachments.length}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: T.faint }}>Created {fmtDate(task.createdDate)}</span>
        <Menu align="right" width={200} trigger={<Hover as="button" style={{ width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 9, color: T.muted, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="more" size={18} /></Hover>}>
          {(close: any) => <>
            <MenuItem icon="checkCircle" label={task.status === 'complete' ? 'Reopen' : 'Mark complete'} onClick={() => { ctx.toggleComplete(task.id); close(); }} />
            <MenuItem icon="copy" label="Duplicate" onClick={() => { ctx.duplicateTask(task.id); close(); }} />
            <MenuItem icon="user" label="Open related" onClick={() => { ctx.toast('Opening ' + (task.related || 'record'), 'info'); close(); }} />
            <MenuItem icon="snooze" label="Snooze 1 day" onClick={() => { update({ due: iso(addDays(task.due ? new Date(task.due) : new Date(), 1)) }); ctx.toast('Snoozed 1 day', 'info'); close(); }} />
            <div style={{ height: 1, background: T.hair, margin: '6px 4px' }} />
            <MenuItem icon="trash" label="Delete" danger onClick={() => { ctx.deleteTask(task.id); close(); }} />
          </>}
        </Menu>
        <Hover as="button" onClick={onClose} style={{ width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 9, color: T.muted, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="x" size={18} /></Hover>
      </div>

      {/* body: two panes */}
      <div style={{ flex: 1, display: 'flex', flexDirection: narrow ? 'column' : 'row', minHeight: 0, overflowY: narrow ? 'auto' : 'visible' }}>
        {/* LEFT — task content */}
        <div style={{ flex: 1, minWidth: 0, overflowY: narrow ? 'visible' : 'auto', padding: '24px 30px 40px' }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== task.title && update({ title })} style={{ width: '100%', border: 'none', outline: 'none', fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: T.text, fontFamily: 'inherit', marginBottom: 14 }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', background: '#F7F7F9', borderRadius: 10, color: T.muted, fontSize: 13, marginBottom: 20 }}><Icon name="sparkles" size={15} style={{ color: '#5856D6' }} />Ask AI to draft an update, summary, or reply.</div>

          <div style={{ display: 'flex', gap: 30, marginBottom: 22, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Row icon="circle" label="Status"><StatusSelect value={task.status} onChange={(v: string) => update({ status: v })} /></Row>
              <Row icon="calendar" label="Dates"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ color: T.faint }}>Start</span><Icon name="arrowRight" size={13} style={{ color: T.faint }} />{DueField}</span></Row>
              <Row icon="clock" label="Time estimate"><span style={{ color: T.faint }}>Empty</span></Row>
              <Row icon="tag" label="Tags"><div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{task.tags.map((tg: string) => <TagChip key={tg} label={tg} />)}<TagPicker value={task.tags} onChange={(v: string[]) => update({ tags: v })} trigger={<Hover as="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 8px', borderRadius: 999, border: `1px dashed rgba(0,0,0,0.18)`, background: 'transparent', color: T.muted, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.03)' }}><Icon name="plus" size={11} />Tag</Hover>} /></div></Row>
              <Row icon="building" label="Carrier">{task.carrier || <span style={{ color: T.faint }}>—</span>}</Row>
            </div>
            <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Row icon="user" label="Assignee"><AssigneeSelect value={task.assignee} people={PEOPLE} onChange={(v: string) => update({ assignee: v })} size={24} /></Row>
              <Row icon="flag" label="Priority"><PrioritySelect value={task.priority} onChange={(v: string) => update({ priority: v })} /></Row>
              <Row icon="clock" label="Track time"><Hover as="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 9px', borderRadius: 8, border: 'none', background: 'transparent', color: T.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="clock" size={14} />Start</Hover></Row>
              <Row icon={task.relatedType ? RELATED_ICON[task.relatedType] : 'link'} label="Related to">{task.related ? <span style={{ fontWeight: 600 }}>{task.related}</span> : <span style={{ color: T.faint }}>—</span>}</Row>
              <Row icon="zap" label="Source"><SourceChip source={task.source} /></Row>
            </div>
          </div>

          <div style={{ height: 1, background: T.hair, marginBottom: 22 }} />

        {/* truck assignment */}
        <SectionTitle>Truck Assignment</SectionTitle>
        <TruckAssign task={task} />

        {/* description */}
        <SectionTitle>Description</SectionTitle>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== task.description && update({ description: desc })} placeholder="Add a description…" style={{ width: '100%', minHeight: 70, resize: 'vertical', border: `1px solid ${T.border}`, borderRadius: 12, padding: '11px 13px', fontSize: 13.5, lineHeight: 1.5, fontFamily: 'inherit', outline: 'none', color: T.text, background: '#fff', marginBottom: 22 }} />

        {/* checklist */}
        <SectionTitle right={task.checklist.length > 0 ? <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{checkDone}/{task.checklist.length}</span> : null}>Checklist</SectionTitle>
        {task.checklist.length > 0 && <div style={{ height: 6, background: '#F2F2F7', borderRadius: 999, overflow: 'hidden', marginBottom: 10 }}><div style={{ height: '100%', width: `${Math.round((checkDone / task.checklist.length) * 100)}%`, background: '#34C759', borderRadius: 999 }} /></div>}
        <div style={{ marginBottom: 8 }}>
          {task.checklist.map((c: any) => <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <CheckCircle done={c.done} onClick={() => update({ checklist: task.checklist.map((x: any) => x.id === c.id ? { ...x, done: !x.done } : x) })} size={17} />
            <span style={{ flex: 1, fontSize: 13.5, textDecoration: c.done ? 'line-through' : 'none', color: c.done ? T.faint : T.text }}>{c.text}</span>
            <Hover as="button" onClick={() => update({ checklist: task.checklist.filter((x: any) => x.id !== c.id) })} style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 7, color: T.faint, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.06)' }}><Icon name="x" size={14} /></Hover>
          </div>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (!newCheck.trim()) return; update({ checklist: [...task.checklist, { id: 'c' + Date.now(), text: newCheck.trim(), done: false }] }); setNewCheck(''); }} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
          <Icon name="plus" size={15} style={{ color: T.faint }} />
          <input value={newCheck} onChange={(e) => setNewCheck(e.target.value)} placeholder="Add checklist item" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13.5, fontFamily: 'inherit', background: 'transparent', color: T.text }} />
        </form>

        {/* subtasks */}
        <SectionTitle>Subtasks</SectionTitle>
        <div style={{ marginBottom: 8 }}>
          {task.subtasks.map((s: any) => <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 6 }}>
            <CheckCircle done={s.done} onClick={() => update({ subtasks: task.subtasks.map((x: any) => x.id === s.id ? { ...x, done: !x.done } : x) })} size={17} />
            <span style={{ flex: 1, fontSize: 13, textDecoration: s.done ? 'line-through' : 'none', color: s.done ? T.faint : T.text }}>{s.title}</span>
            {s.due && <span style={{ fontSize: 11.5, color: T.faint }}>{fmtDate(s.due)}</span>}
            <Avatar name={nameOf(s.assignee || task.assignee)} size={22} />
          </div>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (!newSub.trim()) return; update({ subtasks: [...task.subtasks, { id: 's' + Date.now(), title: newSub.trim(), assignee: task.assignee, due: null, done: false }] }); setNewSub(''); }} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
          <Icon name="plus" size={15} style={{ color: T.faint }} />
          <input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Add subtask" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13.5, fontFamily: 'inherit', background: 'transparent', color: T.text }} />
        </form>

        {/* attachments */}
        <SectionTitle right={<Menu align="right" width={200} trigger={<Hover as="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 9px', border: `1px solid ${T.border}`, borderRadius: 8, background: '#fff', color: T.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="plus" size={13} />Add</Hover>}>
          {(close: any) => <>
            {[['Upload file', 'fileText'], ['Link document', 'link'], ['Link signed PDF', 'sign'], ['Link CDL / medical card', 'fileText']].map(([l, ic]: any) => <MenuItem key={l} icon={ic} label={l} onClick={() => { update({ attachments: [...task.attachments, { id: 'at' + Date.now(), name: l.replace('Link ', '').replace('Upload ', '') + '.pdf', type: ic }] }); ctx.toast('Attachment added', 'success'); close(); }} />)}
          </>}
        </Menu>}>Attachments</SectionTitle>
        <Menu width={210} trigger={<Hover style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px', border: `1.5px dashed rgba(0,0,0,0.16)`, borderRadius: 12, color: T.muted, fontSize: 13, cursor: 'pointer', marginBottom: 12 }} hover={{ background: 'rgba(0,0,0,0.02)', borderColor: 'rgba(0,122,255,0.4)' }}><Icon name="upload" size={16} />Drop your files here to <span style={{ color: '#007AFF', fontWeight: 600 }}>upload</span></Hover>}>
          {(close: any) => <>
            {[['Upload file', 'fileText'], ['Link document', 'link'], ['Link signed PDF', 'sign'], ['Link CDL / medical card', 'fileText']].map(([l, ic]: any) => <MenuItem key={l} icon={ic} label={l} onClick={() => { update({ attachments: [...task.attachments, { id: 'at' + Date.now(), name: l.replace('Link ', '').replace('Upload ', '') + '.pdf', type: ic }] }); ctx.toast('Attachment added', 'success'); close(); }} />)}
          </>}
        </Menu>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 22 }}>
          {task.attachments.map((a: any) => <div key={a.id} style={{ position: 'relative', border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
            <div style={{ height: 92, background: '#F7F7F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8E8E93' }}>{a.image ? <img src={a.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name={a.type || 'fileText'} size={28} />}</div>
            <div style={{ padding: '8px 10px', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
            <Hover as="button" onClick={() => update({ attachments: task.attachments.filter((x: any) => x.id !== a.id) })} style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'rgba(255,255,255,0.9)', borderRadius: 7, color: T.muted, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} hover={{ background: '#fff', color: '#C62820' }}><Icon name="x" size={13} /></Hover>
          </div>)}
        </div>

        </div>

        {/* RIGHT — activity */}
        <div style={{ width: narrow ? 'auto' : 400, flex: 'none', borderLeft: narrow ? 'none' : `1px solid ${T.hair}`, borderTop: narrow ? `1px solid ${T.hair}` : 'none', background: '#FCFCFD', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', flex: 'none' }}>
            <div style={{ fontSize: 15, fontWeight: 650 }}>Activity</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: T.faint }}><Icon name="search" size={15} /></span>
              <span style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: T.faint }}><Icon name="bell" size={15} /></span>
              <span style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: T.faint }}><Icon name="filter" size={15} /></span>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: narrow ? 'visible' : 'auto', padding: '6px 18px 14px', minHeight: narrow ? 220 : 0 }}>
            {task.comments.length === 0 && <div style={{ color: T.faint, fontSize: 12.5, padding: '8px 0' }}>No messages yet. Leave a comment to start the thread.</div>}
            {task.comments.map((c: any) => <CommentCard key={c.id} comment={c} onReply={(cid: string, text: string, mentions: string[]) => ctx.addReply(task.id, cid, text, mentions)} />)}
            <Hover as="button" onClick={() => setShowHistory((s) => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 4px', border: 'none', background: 'transparent', color: T.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginTop: 4 }} hover={{ color: T.text }}><Icon name={showHistory ? 'chevronDown' : 'chevronRight'} size={14} />{showHistory ? 'Hide activity log' : 'Show more'}</Hover>
            {showHistory && <div style={{ marginTop: 6, paddingTop: 8, borderTop: `1px solid ${T.hair}` }}>
              {task.activity.map((a: any) => <div key={a.id} style={{ display: 'flex', gap: 10, padding: '6px 0' }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: '#C7C7CC', marginTop: 6, flex: 'none' }} />
                <div style={{ fontSize: 12, color: '#6E6E73' }}><span style={{ fontWeight: 600, color: '#3a3a3c' }}>{a.who}</span> {a.text} <span style={{ color: T.faint }}>· {fmtDate(a.time)}</span></div>
              </div>)}
            </div>}
          </div>
          <div style={{ flex: 'none', padding: '12px 16px', borderTop: `1px solid ${T.hair}`, background: '#fff' }}>
            <CommentComposer placeholder="Write a message…  use @ to mention" onSubmit={(text: string, mentions: string[]) => ctx.addComment(task.id, text, mentions)} />
          </div>
        </div>
      </div>
    </div>
  </div>;
}

/* ============================ NEW TASK MODAL ============================ */
export function NewTaskModal({ onClose, onCreate }: any) {
  const [f, setF] = React.useState<any>({ title: '', description: '', relatedType: '', related: '', carrier: '', assignee: 'NP', status: 'todo', priority: 'normal', due: null, tags: [], checklist: [] as any[] });
  const [check, setCheck] = React.useState('');
  const set = (patch: any) => setF((s: any) => ({ ...s, ...patch }));
  const dueOpts = [{ value: null, label: 'No date' }, { value: iso(addDays(new Date(), 0)), label: 'Today' }, { value: iso(addDays(new Date(), 1)), label: 'Tomorrow' }, { value: iso(addDays(new Date(), 3)), label: 'In 3 days' }, { value: iso(addDays(new Date(), 7)), label: 'Next week' }];

  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,0.24)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8vh', animation: 'qhFade .16s ease' }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: '94vw', maxHeight: '84vh', overflowY: 'auto', background: '#fff', borderRadius: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.3)', animation: 'qhScaleIn .18s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 0' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>New Task</h2>
        <Hover as="button" onClick={onClose} style={{ width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 8, color: T.muted, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.06)' }}><Icon name="x" size={17} /></Hover>
      </div>
      <div style={{ padding: '16px 22px 0' }}>
        <input autoFocus value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Task title" style={{ width: '100%', height: 42, border: `1px solid ${T.border}`, borderRadius: 12, padding: '0 14px', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', outline: 'none', marginBottom: 10 }} />
        <textarea value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Description (optional)" style={{ width: '100%', minHeight: 64, resize: 'vertical', border: `1px solid ${T.border}`, borderRadius: 12, padding: '11px 13px', fontSize: 13.5, lineHeight: 1.5, fontFamily: 'inherit', outline: 'none', marginBottom: 14 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <FilterSelect icon="zap" label="Related type" value={f.relatedType} onChange={(v: string) => set({ relatedType: v })} options={[{ value: '', label: 'No related' }, { value: 'candidate', label: 'Candidate' }, { value: 'driver', label: 'Driver' }, { value: 'carrier', label: 'Carrier' }, { value: 'truck', label: 'Truck' }, { value: 'document', label: 'Document' }, { value: 'docusign', label: 'DocuSign envelope' }]} />
          <input value={f.related} onChange={(e) => set({ related: e.target.value })} placeholder="Related name" style={{ height: 34, border: `1px solid ${T.border}`, borderRadius: 10, padding: '0 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
          <Menu width={210} trigger={<Hover as="div" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px', borderRadius: 10, border: `1px solid rgba(0,0,0,0.10)`, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#3a3a3c' }} hover={{ borderColor: 'rgba(0,0,0,0.18)' }}><Avatar name={nameOf(f.assignee)} size={22} />{nameOf(f.assignee)}<Icon name="chevronDown" size={14} style={{ marginLeft: 'auto' }} /></Hover>}>
            {(close: any) => PEOPLE.map((p) => <Hover key={p.initials} as="button" onClick={() => { set({ assignee: p.initials }); close(); }} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', height: 34, padding: '0 10px', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', fontSize: 13 }} hover={{ background: 'rgba(0,0,0,0.05)' }}><Avatar name={p.name} size={22} />{p.name}</Hover>)}
          </Menu>
          <FilterSelect icon="building" label="Carrier" value={f.carrier} onChange={(v: string) => set({ carrier: v })} options={[{ value: '', label: 'No carrier' }, ...CARRIERS.map((c) => ({ value: c, label: c }))]} />
          <FilterSelect icon="flag" label="Priority" value={f.priority} onChange={(v: string) => set({ priority: v })} options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY[p].label }))} />
          <FilterSelect icon="calendar" label="Due date" value={f.due} onChange={(v: any) => set({ due: v })} options={dueOpts} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <TagPicker value={f.tags} onChange={(v: string[]) => set({ tags: v })} trigger={<Hover as="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 11px', borderRadius: 999, border: `1px solid ${T.border}`, background: '#fff', color: T.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.04)' }}><Icon name="tag" size={13} />Add tags</Hover>} />
          {f.tags.map((tg: string) => <TagChip key={tg} label={tg} />)}
        </div>

        <div style={{ marginBottom: 6 }}>
          {f.checklist.map((c: any, i: number) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0' }}><span style={{ width: 16, height: 16, borderRadius: 999, border: '1.5px solid rgba(0,0,0,0.25)', flex: 'none' }} /><span style={{ flex: 1, fontSize: 13.5 }}>{c}</span><Hover as="button" onClick={() => set({ checklist: f.checklist.filter((_: any, j: number) => j !== i) })} style={{ width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 6, color: T.faint, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.06)' }}><Icon name="x" size={13} /></Hover></div>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (!check.trim()) return; set({ checklist: [...f.checklist, check.trim()] }); setCheck(''); }} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <Icon name="plus" size={15} style={{ color: T.faint }} />
          <input value={check} onChange={(e) => setCheck(e.target.value)} placeholder="Add checklist item" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13.5, fontFamily: 'inherit', background: 'transparent' }} />
        </form>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px 20px', borderTop: `1px solid ${T.hair}` }}>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon="plus" onClick={() => { if (!f.title.trim()) return; onCreate({ ...f, title: f.title.trim(), checklist: f.checklist.map((c: string, i: number) => ({ id: 'c' + i, text: c, done: false })) }); }}>Create Task</Btn>
      </div>
    </div>
  </div>;
}

/* ============================ TEMPLATES DRAWER ============================ */
export function TemplatesDrawer({ templates, onClose, onUse }: any) {
  return <>
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.22)', backdropFilter: 'blur(3px)', animation: 'qhFade .18s ease' }} />
    <aside onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, maxWidth: '100vw', zIndex: 121, background: '#fff', borderLeft: `1px solid ${T.border}`, boxShadow: '-12px 0 40px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', animation: 'qhSheetIn .22s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: `1px solid ${T.hair}` }}>
        <div><div style={{ fontSize: 18, fontWeight: 700 }}>Task Templates</div><div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>Start work from a saved checklist.</div></div>
        <Hover as="button" onClick={onClose} style={{ width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 8, color: T.muted, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.06)' }}><Icon name="x" size={17} /></Hover>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {templates.map((tpl: any) => <div key={tpl.id} style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ width: 36, height: 36, flex: 'none', borderRadius: 10, background: 'rgba(0,122,255,0.10)', color: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="listChecks" size={18} /></span>
              <div><div style={{ fontSize: 14.5, fontWeight: 650 }}>{tpl.name}</div><div style={{ fontSize: 12, color: T.faint, marginTop: 1 }}>{tpl.category} · {tpl.checklist.length} steps · {nameOf(tpl.assignee)}</div></div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: '12px 0' }}>
            {tpl.checklist.slice(0, 4).map((c: string, i: number) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#3a3a3c' }}><Icon name="check" size={13} style={{ color: '#34C759' }} />{c}</div>)}
            {tpl.checklist.length > 4 && <div style={{ fontSize: 12, color: T.faint, paddingLeft: 21 }}>+{tpl.checklist.length - 4} more</div>}
          </div>
          <Btn variant="primary" style={{ width: '100%', justifyContent: 'center', height: 38 }} onClick={() => onUse(tpl)}>Use Template</Btn>
        </div>)}
      </div>
    </aside>
  </>;
}
