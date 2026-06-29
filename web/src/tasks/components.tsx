import React from 'react';
import { Hover } from '../lib/dc';
import {
  T, Icon, Avatar, StatusChip, PriorityFlag, SourceChip, TagChip, CheckCircle, Btn,
  StatusSelect, PrioritySelect, AssigneeSelect, Menu, MenuItem, FilterSelect,
  STATUS, STATUS_ORDER, PRIORITY_ORDER, PRIORITY, SOURCE, RELATED_ICON, dueInfo, fmtDate, iso, addDays,
  useTasksCtx,
} from './lib';
import { PEOPLE, nameOf, TAGS, CARRIERS } from './data';

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
  const [comment, setComment] = React.useState('');
  const [newCheck, setNewCheck] = React.useState('');
  const [newSub, setNewSub] = React.useState('');
  React.useEffect(() => { setTitle(task.title); setDesc(task.description || ''); }, [task.id]);

  const update = (patch: any) => ctx.updateTask(task.id, patch);
  const checkDone = task.checklist.filter((c: any) => c.done).length;
  const info = dueInfo(task);

  const dueOpts = [['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7], ['No date', null]] as any[];

  return <>
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.22)', backdropFilter: 'blur(3px)', animation: 'qhFade .18s ease' }} />
    <aside onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 560, maxWidth: '100vw', zIndex: 121, background: '#fff', borderLeft: `1px solid ${T.border}`, boxShadow: '-12px 0 40px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', animation: 'qhSheetIn .22s ease' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${T.hair}`, flex: 'none' }}>
        <CheckCircle done={task.status === 'complete'} onClick={() => ctx.toggleComplete(task.id)} size={20} />
        <StatusSelect value={task.status} onChange={(v: string) => update({ status: v })} />
        <div style={{ flex: 1 }} />
        <Menu align="right" width={200} trigger={<Hover as="button" style={{ width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 9, color: T.muted, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="more" size={18} /></Hover>}>
          {(close: any) => <>
            <MenuItem icon="copy" label="Duplicate" onClick={() => { ctx.duplicateTask(task.id); close(); }} />
            <MenuItem icon="user" label="Open related" onClick={() => { ctx.toast('Opening ' + (task.related || 'record'), 'info'); close(); }} />
            <MenuItem icon="snooze" label="Snooze 1 day" onClick={() => { update({ due: iso(addDays(task.due ? new Date(task.due) : new Date(), 1)) }); ctx.toast('Snoozed 1 day', 'info'); close(); }} />
            <div style={{ height: 1, background: T.hair, margin: '6px 4px' }} />
            <MenuItem icon="trash" label="Delete" danger onClick={() => { ctx.deleteTask(task.id); close(); }} />
          </>}
        </Menu>
        <Hover as="button" onClick={onClose} style={{ width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 9, color: T.muted, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="x" size={18} /></Hover>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 28px' }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== task.title && update({ title })} style={{ width: '100%', border: 'none', outline: 'none', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: T.text, fontFamily: 'inherit', marginBottom: 16 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 18 }}>
          <Row icon="user" label="Assignee"><AssigneeSelect value={task.assignee} people={PEOPLE} onChange={(v: string) => update({ assignee: v })} size={24} /></Row>
          <Row icon="flag" label="Priority"><PrioritySelect value={task.priority} onChange={(v: string) => update({ priority: v })} /></Row>
          <Row icon="calendar" label="Due date">
            <Menu width={180} trigger={<Hover as="span" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 8px', borderRadius: 8, cursor: 'pointer', color: info.label ? info.color : T.faint, fontWeight: 600 }} hover={{ background: 'rgba(0,0,0,0.04)' }}>{info.label || 'Set date'}</Hover>}>
              {(close: any) => dueOpts.map(([l, n]: any) => <MenuItem key={l} label={l} onClick={() => { update({ due: n === null ? null : iso(addDays(new Date(), n)) }); close(); }} />)}
            </Menu>
          </Row>
          <Row icon={task.relatedType ? RELATED_ICON[task.relatedType] : 'link'} label="Related to">{task.related ? <span style={{ fontWeight: 600 }}>{task.related}</span> : <span style={{ color: T.faint }}>—</span>}</Row>
          <Row icon="building" label="Carrier">{task.carrier || <span style={{ color: T.faint }}>—</span>}</Row>
          <Row icon="zap" label="Source"><SourceChip source={task.source} /></Row>
          <Row icon="tag" label="Tags">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {task.tags.map((tg: string) => <TagChip key={tg} label={tg} />)}
              <TagPicker value={task.tags} onChange={(v: string[]) => update({ tags: v })} trigger={<Hover as="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 8px', borderRadius: 999, border: `1px dashed rgba(0,0,0,0.18)`, background: 'transparent', color: T.muted, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.03)' }}><Icon name="plus" size={11} />Tag</Hover>} />
            </div>
          </Row>
          <Row icon="user" label="Created by"><span style={{ color: T.muted }}>{task.createdBy} · {fmtDate(task.createdDate)}</span></Row>
        </div>

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
        <div style={{ marginBottom: 22 }}>
          {task.attachments.length === 0 ? <div style={{ color: T.faint, fontSize: 12.5 }}>No attachments.</div> : task.attachments.map((a: any) => <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 6 }}>
            <span style={{ color: '#007AFF' }}><Icon name={a.type || 'fileText'} size={16} /></span>
            <span style={{ flex: 1, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
            <Hover as="button" onClick={() => update({ attachments: task.attachments.filter((x: any) => x.id !== a.id) })} style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 7, color: T.faint, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.06)' }}><Icon name="x" size={14} /></Hover>
          </div>)}
        </div>

        {/* comments */}
        <SectionTitle>Comments</SectionTitle>
        <div style={{ marginBottom: 12 }}>
          {task.comments.map((c: any) => <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <Avatar name={c.author} size={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{c.author}</span><span style={{ fontSize: 11.5, color: T.faint }}>{fmtDate(c.time)}</span></div>
              <div style={{ fontSize: 13.5, color: '#3a3a3c', marginTop: 2, lineHeight: 1.45 }}>{c.text}</div>
            </div>
          </div>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (!comment.trim()) return; ctx.addComment(task.id, comment.trim()); setComment(''); }} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment…" style={{ flex: 1, resize: 'none', height: 42, maxHeight: 120, padding: '11px 13px', fontFamily: 'inherit', fontSize: 13.5, background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, outline: 'none' }} />
          <button type="submit" style={{ width: 42, height: 42, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#007AFF', border: 'none', borderRadius: 12, color: '#fff', cursor: 'pointer' }}><Icon name="send" size={17} /></button>
        </form>

        {/* activity */}
        <div style={{ marginTop: 24 }}>
          <SectionTitle>Activity</SectionTitle>
          {task.activity.map((a: any) => <div key={a.id} style={{ display: 'flex', gap: 11, padding: '8px 0' }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: '#C7C7CC', marginTop: 6, flex: 'none' }} />
            <div style={{ fontSize: 12.5, color: '#3a3a3c' }}><span style={{ fontWeight: 600 }}>{a.who}</span> {a.text} <span style={{ color: T.faint }}>· {fmtDate(a.time)}</span></div>
          </div>)}
        </div>
      </div>

      {/* footer actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderTop: `1px solid ${T.hair}`, flex: 'none', flexWrap: 'wrap' }}>
        <Btn variant={task.status === 'complete' ? 'secondary' : 'primary'} icon="check" style={{ background: task.status === 'complete' ? '#fff' : '#34C759', color: task.status === 'complete' ? T.text : '#fff', border: task.status === 'complete' ? '1px solid rgba(0,0,0,0.12)' : 'none' }} onClick={() => ctx.toggleComplete(task.id)}>{task.status === 'complete' ? 'Reopen' : 'Complete'}</Btn>
        <Menu width={210} trigger={<Btn variant="secondary" icon="userPlus">Reassign</Btn>}>
          {(close: any) => PEOPLE.map((p) => <Hover key={p.initials} as="button" onClick={() => { update({ assignee: p.initials }); ctx.toast('Reassigned to ' + p.name, 'success'); close(); }} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', height: 34, padding: '0 10px', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', fontSize: 13 }} hover={{ background: 'rgba(0,0,0,0.05)' }}><Avatar name={p.name} size={22} />{p.name}</Hover>)}
        </Menu>
        <Btn variant="ghost" icon="copy" onClick={() => ctx.duplicateTask(task.id)}>Duplicate</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="danger" icon="trash" onClick={() => ctx.deleteTask(task.id)}>Delete</Btn>
      </div>
    </aside>
  </>;
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
