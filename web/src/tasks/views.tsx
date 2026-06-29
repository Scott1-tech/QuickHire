import React from 'react';
import { Hover } from '../lib/dc';
import {
  T, Icon, Avatar, StatusChip, StatusRing, PriorityFlag, SourceChip, TagChip, CheckCircle, Toggle,
  StatusSelect, PrioritySelect, AssigneeSelect, Menu, MenuItem, SegTabs, Btn,
  STATUS, STATUS_ORDER, PRIORITY, SOURCE, RELATED_ICON, PALETTE, dueInfo, fmtDate, iso, addDays, startOfDay,
  metaOf, columnKeys, useTasksCtx,
} from './lib';
import { PEOPLE, nameOf } from './data';

/* ============================ shared cells ============================ */
function RelatedCell({ task }: any) {
  if (!task.related) return <span style={{ color: T.faint }}>—</span>;
  const ic = RELATED_ICON[task.relatedType] || 'link';
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
    <span style={{ color: T.faint, flex: 'none' }}><Icon name={ic} size={14} /></span>
    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.related}</span>
  </span>;
}
function NameMeta({ task }: any) {
  const sub = task.subtasks.length, com = task.comments.length, att = task.attachments.length;
  if (!sub && !com && !att) return null;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: T.faint, fontSize: 11.5, flex: 'none' }}>
    {sub > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="listChecks" size={12} />{task.subtasks.filter((s: any) => s.done).length}/{sub}</span>}
    {com > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="message" size={12} />{com}</span>}
    {att > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="paperclip" size={12} />{att}</span>}
  </span>;
}
function DueEditor({ task }: any) {
  const ctx = useTasksCtx();
  const info = dueInfo(task);
  const opts = [['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7], ['No date', null]] as any[];
  return <Menu width={180} trigger={
    <Hover as="div" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 8px', borderRadius: 8, cursor: 'pointer', color: info.label ? info.color : T.faint, fontSize: 12.5, fontWeight: 600 }} hover={{ background: 'rgba(0,0,0,0.04)' }}>
      <Icon name="calendar" size={13} />{info.label || 'Set date'}
    </Hover>}>
    {(close: any) => opts.map(([l, n]: any) => <MenuItem key={l} label={l} onClick={() => { ctx.updateTask(task.id, { due: n === null ? null : iso(addDays(new Date(), n)) }); close(); }} />)}
  </Menu>;
}
function RowActions({ task }: any) {
  const ctx = useTasksCtx();
  return <Menu align="right" width={190} trigger={<Hover as="span" style={{ display: 'inline-flex', width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8, color: T.muted, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.06)' }}><Icon name="more" size={16} /></Hover>}>
    {(close: any) => <>
      <MenuItem icon="arrowRight" label="Open" onClick={() => { ctx.openTask(task.id); close(); }} />
      <MenuItem icon="snooze" label="Snooze 1 day" onClick={() => { ctx.updateTask(task.id, { due: iso(addDays(task.due ? new Date(task.due) : new Date(), 1)) }); ctx.toast('Snoozed 1 day', 'info'); close(); }} />
      <MenuItem icon="checkCircle" label={task.status === 'complete' ? 'Reopen' : 'Complete'} onClick={() => { ctx.toggleComplete(task.id); close(); }} />
      <div style={{ height: 1, background: T.hair, margin: '6px 4px' }} />
      <MenuItem icon="trash" label="Delete" danger onClick={() => { ctx.deleteTask(task.id); close(); }} />
    </>}
  </Menu>;
}

/* ============================ LIST VIEW ============================ */
const COLS = '34px minmax(230px,2.2fr) 158px 60px 116px 124px 168px 150px 132px 150px 96px 64px';
const HEAD = ['', 'Task Name', 'Status', 'Assignee', 'Priority', 'Due Date', 'Related To', 'Carrier', 'Source', 'Tags', 'Last Activity', ''];

function groupTasks(tasks: any[], grouping: string) {
  if (grouping === 'status') return columnKeys().map((k) => { const m = metaOf(k); return { key: k, label: m.label, dot: m.dot, items: tasks.filter((t: any) => t.status === k) }; }).filter((g) => g.items.length);
  if (grouping === 'assignee') { const map: any = {}; tasks.forEach((t) => { (map[t.assignee] ||= []).push(t); }); return Object.keys(map).map((k) => ({ key: k, label: nameOf(k), items: map[k] })); }
  if (grouping === 'carrier') { const map: any = {}; tasks.forEach((t) => { const k = t.carrier || 'No carrier'; (map[k] ||= []).push(t); }); return Object.keys(map).map((k) => ({ key: k, label: k, items: map[k] })); }
  if (grouping === 'none') return [{ key: 'all', label: 'All Tasks', items: tasks }];
  // due (default)
  const order = [['overdue', 'Overdue', '#C62820'], ['today', 'Today', '#0066CC'], ['tomorrow', 'Tomorrow', '#5856D6'], ['week', 'This Week', '#6E6E73'], ['later', 'Later', '#6E6E73'], ['none', 'No Due Date', '#8E8E93']] as any[];
  return order.map(([k, label, color]) => ({ key: k, label, color, items: tasks.filter((t) => dueInfo(t).group === k) })).filter((g) => g.items.length);
}

export function ListView({ tasks, grouping, selected, onToggle, onToggleMany }: any) {
  const ctx = useTasksCtx();
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const groups = groupTasks(tasks, grouping);
  const allIds = tasks.map((t: any) => t.id);
  const allSel = allIds.length > 0 && allIds.every((id: string) => selected.has(id));

  const Square = ({ on, onClick }: any) => <button onClick={(e) => { e.stopPropagation(); onClick(); }} style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${on ? '#007AFF' : 'rgba(0,0,0,0.25)'}`, background: on ? '#007AFF' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, color: '#fff', flex: 'none' }}>{on && <Icon name="check" size={12} />}</button>;

  return <div style={{ overflowX: 'auto' }}>
    <div style={{ minWidth: 1320, background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
      {/* header */}
      <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center', padding: '0 16px', height: 42, background: '#FAFAFA', borderBottom: `1px solid ${T.hair}`, fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint }}>
        <Square on={allSel} onClick={() => onToggleMany(allIds, !allSel)} />
        {HEAD.slice(1).map((h, i) => <span key={i} style={{ textAlign: i === HEAD.length - 2 ? 'right' : 'left' }}>{h}</span>)}
      </div>
      {groups.map((g: any) => {
        const open = !collapsed[g.key];
        return <div key={g.key}>
          <Hover style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 16px', height: 38, background: '#FCFCFD', borderBottom: `1px solid ${T.hair}`, cursor: 'pointer' }} hover={{ background: '#F7F7F9' }} onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}>
            <Icon name={open ? 'chevronDown' : 'chevronRight'} size={15} style={{ color: T.faint }} />
            {g.dot && <span style={{ width: 8, height: 8, borderRadius: 999, background: g.dot }} />}
            <span style={{ fontSize: 13, fontWeight: 650, color: g.color || T.text }}>{g.label}</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: T.muted, background: '#F2F2F7', borderRadius: 999, padding: '1px 8px' }}>{g.items.length}</span>
          </Hover>
          {open && g.items.map((t: any) => {
            const done = t.status === 'complete';
            const sel = selected.has(t.id);
            return <Hover key={t.id} onClick={() => ctx.openTask(t.id)} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center', padding: '0 16px', height: 52, borderBottom: `1px solid ${T.hair}`, background: sel ? 'rgba(0,122,255,0.04)' : '#fff', cursor: 'pointer', fontSize: 13 }} hover={{ background: sel ? 'rgba(0,122,255,0.06)' : T.hover }}>
              <Square on={sel} onClick={() => onToggle(t.id)} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
                <CheckCircle done={done} onClick={() => ctx.toggleComplete(t.id)} />
                <span onClick={() => ctx.openTask(t.id)} style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: done ? 'line-through' : 'none', color: done ? T.faint : T.text, cursor: 'pointer' }}>{t.title}</span>
                <NameMeta task={t} />
              </span>
              <span onClick={(e) => e.stopPropagation()}><StatusSelect value={t.status} onChange={(v: string) => ctx.updateTask(t.id, { status: v })} /></span>
              <span onClick={(e) => e.stopPropagation()}><AssigneeSelect value={t.assignee} people={PEOPLE} onChange={(v: string) => ctx.updateTask(t.id, { assignee: v })} /></span>
              <span onClick={(e) => e.stopPropagation()}><PrioritySelect value={t.priority} onChange={(v: string) => ctx.updateTask(t.id, { priority: v })} /></span>
              <span onClick={(e) => e.stopPropagation()}><DueEditor task={t} /></span>
              <span style={{ minWidth: 0, color: '#3a3a3c' }}><RelatedCell task={t} /></span>
              <span style={{ color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.carrier || '—'}</span>
              <span><SourceChip source={t.source} /></span>
              <span style={{ display: 'inline-flex', gap: 5, overflow: 'hidden' }}>{t.tags.slice(0, 2).map((tg: string) => <TagChip key={tg} label={tg} />)}{t.tags.length > 2 && <span style={{ color: T.faint, fontSize: 11.5, fontWeight: 600 }}>+{t.tags.length - 2}</span>}</span>
              <span style={{ color: T.faint, fontSize: 12 }}>{fmtDate(t.activity[t.activity.length - 1]?.time)}</span>
              <span style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}><RowActions task={t} /></span>
            </Hover>;
          })}
        </div>;
      })}
    </div>
  </div>;
}

/* ============================ BOARD VIEW ============================ */
function ColumnMenu({ col, onRename, onRecolor, onRemove }: any) {
  return <Menu align="right" width={240} trigger={<Hover as="span" style={{ display: 'inline-flex', width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 7, color: T.faint, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.06)' }}><Icon name="more" size={15} /></Hover>}>
    {(close: any) => <div onClick={(e: any) => e.stopPropagation()} style={{ padding: '2px 4px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint, padding: '4px 6px' }}>Column name</div>
      <input defaultValue={col.label} onChange={(e) => onRename(col.key, e.target.value)} style={{ width: '100%', height: 32, border: `1px solid ${T.border}`, borderRadius: 8, padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: T.faint, padding: '10px 6px 4px' }}>Color</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, padding: '2px 6px 8px' }}>
        {PALETTE.map((c) => <button key={c} onClick={() => onRecolor(col.key, c)} style={{ width: 22, height: 22, borderRadius: 999, background: c, border: col.color === c ? '2px solid #1D1D1F' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />)}
      </div>
      <div style={{ height: 1, background: T.hair, margin: '4px 4px' }} />
      <MenuItem icon="trash" label="Delete column" danger onClick={() => { onRemove(col.key); close(); }} />
    </div>}
  </Menu>;
}

export function BoardView({ tasks, columns, onAdd, onRename, onRecolor, onRemove, onAddTask }: any) {
  const ctx = useTasksCtx();
  const onDrop = (e: any, status: string) => { e.preventDefault(); const id = e.dataTransfer.getData('text'); if (id) ctx.updateTask(id, { status }); };
  const total = columns.length;
  return <div style={{ overflowX: 'auto', paddingBottom: 12 }}>
    <div style={{ display: 'flex', gap: 14, minWidth: 'max-content', alignItems: 'flex-start' }}>
      {columns.map((col: any, idx: number) => {
        const items = tasks.filter((t: any) => t.status === col.key);
        const fill = total > 1 ? idx / (total - 1) : 1;
        return <div key={col.key} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, col.key)} style={{ width: 300, flex: 'none', background: '#F9FAFB', border: `1px solid ${T.hair}`, borderRadius: 14, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px 10px' }}>
            <StatusRing fill={fill} color={col.color} size={16} />
            <span style={{ fontSize: 13, fontWeight: 650, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.label}</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: T.muted, background: '#fff', border: `1px solid ${T.border}`, borderRadius: 999, padding: '1px 8px' }}>{items.length}</span>
            <ColumnMenu col={col} onRename={onRename} onRecolor={onRecolor} onRemove={onRemove} />
          </div>
          <div style={{ padding: '4px 10px 12px', display: 'flex', flexDirection: 'column', gap: 9, minHeight: 60 }}>
            {items.map((t: any) => {
              const done = t.subtasks.filter((x: any) => x.done).length, totalS = t.subtasks.length;
              return <Hover key={t.id} draggable onDragStart={(e: any) => e.dataTransfer.setData('text', t.id)} onClick={() => ctx.openTask(t.id)} style={{ position: 'relative', background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, cursor: 'pointer', transition: 'box-shadow .16s, transform .16s', overflow: 'hidden' }} hover={{ boxShadow: '0 6px 18px rgba(0,0,0,0.08)', transform: 'translateY(-1px)' }}>
                <span style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: col.color }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                  <span style={{ marginTop: 1 }}><StatusRing fill={fill} color={col.color} size={18} /></span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 650, lineHeight: 1.3 }}>{t.title}</span>
                  <PriorityFlag priority={t.priority} />
                </div>
                {t.related && <div style={{ marginTop: 7, paddingLeft: 27 }}><RelatedCell task={t} /></div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, flexWrap: 'wrap', paddingLeft: 27 }}>
                  <SourceChip source={t.source} />
                  {t.tags.filter((tg: string) => SOURCE[t.source]?.label !== tg).slice(0, 1).map((tg: string) => <TagChip key={tg} label={tg} />)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 11, paddingTop: 10, borderTop: `1px solid ${T.hair}` }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: T.faint, fontSize: 11.5 }}>
                    {t.due && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: dueInfo(t).color, fontWeight: 600 }}><Icon name="calendar" size={12} />{dueInfo(t).label}</span>}
                    {totalS > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="listChecks" size={12} />{done}/{totalS}</span>}
                    {t.comments.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="message" size={12} />{t.comments.length}</span>}
                  </span>
                  <Avatar name={nameOf(t.assignee)} size={22} />
                </div>
              </Hover>;
            })}
            <Hover as="button" onClick={() => onAddTask(col.key)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 9, fontSize: 12.5, fontWeight: 600, color: T.muted, background: 'transparent', border: '1px dashed rgba(0,0,0,0.14)', borderRadius: 10, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.03)', color: T.text }}><Icon name="plus" size={14} />Add task</Hover>
          </div>
        </div>;
      })}
      <Hover as="button" onClick={onAdd} style={{ width: 168, flex: 'none', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 46, fontSize: 13, fontWeight: 600, color: T.muted, background: '#F9FAFB', border: `1px dashed rgba(0,0,0,0.16)`, borderRadius: 14, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.03)', color: T.text }}><Icon name="plus" size={15} />Add status</Hover>
    </div>
  </div>;
}

/* ============================ CALENDAR VIEW ============================ */
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const startOfWeek = (d: Date) => addDays(d, -d.getDay());

export function CalendarView({ tasks }: any) {
  const ctx = useTasksCtx();
  const [mode, setMode] = React.useState('month');
  const [anchor, setAnchor] = React.useState(startOfDay(new Date()));
  const byDay: Record<string, any[]> = {};
  tasks.forEach((t: any) => { if (t.due) (byDay[t.due] ||= []).push(t); });
  const todayIso = iso(new Date());

  const move = (n: number) => setAnchor((a) => mode === 'month' ? addDays(new Date(a.getFullYear(), a.getMonth() + n, 1), 0) : addDays(a, n * (mode === 'week' ? 7 : 1)));
  const title = mode === 'month' ? `${MN[anchor.getMonth()]} ${anchor.getFullYear()}` : mode === 'week' ? `Week of ${fmtDate(iso(startOfWeek(anchor)))}` : `${WD[anchor.getDay()]}, ${fmtDate(iso(anchor))}`;

  const Pill = ({ t }: any) => <div onClick={(e) => { e.stopPropagation(); ctx.openTask(t.id); }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 6px', borderRadius: 6, background: 'rgba(0,0,0,0.03)', cursor: 'pointer', fontSize: 11.5, marginBottom: 3 }}>
    <span style={{ width: 6, height: 6, borderRadius: 999, background: PRIORITY[t.priority].color, flex: 'none' }} />
    <span style={{ width: 6, height: 6, borderRadius: 999, background: metaOf(t.status).dot, flex: 'none' }} />
    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
  </div>;

  let body: React.ReactNode = null;
  if (mode === 'month') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    body = <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>{WD.map((d) => <div key={d} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', color: T.faint }}>{d}</div>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridAutoRows: '1fr' }}>
        {days.map((d, i) => { const dIso = iso(d); const items = byDay[dIso] || []; const inMonth = d.getMonth() === anchor.getMonth(); const isToday = dIso === todayIso; return (
          <div key={i} style={{ minHeight: 104, padding: 8, borderTop: `1px solid ${T.hair}`, borderLeft: i % 7 ? `1px solid ${T.hair}` : 'none', background: inMonth ? '#fff' : '#FBFBFD' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 22, borderRadius: 999, fontSize: 12, fontWeight: 600, color: isToday ? '#fff' : inMonth ? T.text : T.faint, background: isToday ? '#007AFF' : 'transparent', marginBottom: 4 }}>{d.getDate()}</div>
            {items.slice(0, 3).map((t: any) => <Pill key={t.id} t={t} />)}
            {items.length > 3 && <div style={{ fontSize: 11, color: T.faint, fontWeight: 600 }}>+{items.length - 3} more</div>}
          </div>); })}
      </div>
    </div>;
  } else if (mode === 'week') {
    const ws = startOfWeek(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    body = <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
      {days.map((d, i) => { const items = byDay[iso(d)] || []; const isToday = iso(d) === todayIso; return (
        <div key={i} style={{ minHeight: 380, padding: 10, borderLeft: i ? `1px solid ${T.hair}` : 'none' }}>
          <div style={{ marginBottom: 8 }}><div style={{ fontSize: 11, color: T.faint, fontWeight: 600 }}>{WD[d.getDay()]}</div><div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 24, height: 24, borderRadius: 999, fontSize: 13, fontWeight: 700, color: isToday ? '#fff' : T.text, background: isToday ? '#007AFF' : 'transparent' }}>{d.getDate()}</div></div>
          {items.map((t: any) => <Pill key={t.id} t={t} />)}
        </div>); })}
    </div>;
  } else {
    const items = byDay[iso(anchor)] || [];
    body = <div style={{ padding: 18 }}>{items.length === 0 ? <div style={{ color: T.faint, fontSize: 13, padding: 20, textAlign: 'center' }}>No tasks due this day.</div> : items.map((t: any) => (
      <Hover key={t.id} onClick={() => ctx.openTask(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: `1px solid ${T.hair}`, cursor: 'pointer' }} hover={{ background: T.hover }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: metaOf(t.status).dot }} />
        <span style={{ flex: 1, fontWeight: 600 }}>{t.title}</span>
        <RelatedCell task={t} /><PriorityFlag priority={t.priority} /><Avatar name={nameOf(t.assignee)} size={24} />
      </Hover>))}</div>;
  }

  return <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${T.hair}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Hover as="button" onClick={() => move(-1)} style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 8, color: T.muted, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="chevronLeft" size={16} /></Hover>
        <Hover as="button" onClick={() => move(1)} style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 8, color: T.muted, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.05)' }}><Icon name="chevronRight" size={16} /></Hover>
      </div>
      <Btn variant="secondary" style={{ height: 32 }} onClick={() => setAnchor(startOfDay(new Date()))}>Today</Btn>
      <div style={{ fontSize: 16, fontWeight: 650 }}>{title}</div>
      <div style={{ flex: 1 }} />
      <SegTabs value={mode} onChange={setMode} tabs={[{ key: 'month', label: 'Month' }, { key: 'week', label: 'Week' }, { key: 'day', label: 'Day' }]} />
    </div>
    {body}
  </div>;
}

/* ============================ TIMELINE VIEW ============================ */
export function TimelineView({ tasks }: any) {
  const ctx = useTasksCtx();
  const COLW = 132, DAYW = COLW / 7, WEEKS = 9;
  const winStart = addDays(startOfWeek(new Date()), -7);
  const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(winStart, i * 7));
  const winEnd = addDays(winStart, WEEKS * 7);
  const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
  const rows = tasks.filter((t: any) => t.due).map((t: any) => {
    const due = startOfDay(new Date(t.due));
    const start = t.start ? startOfDay(new Date(t.start)) : due;
    return { t, start, due };
  }).filter((r: any) => r.due >= winStart && r.start < winEnd);
  const todayLeft = daysBetween(winStart, startOfDay(new Date())) * DAYW;

  return <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden', display: 'flex' }}>
    <div style={{ width: 280, flex: 'none', borderRight: `1px solid ${T.hair}` }}>
      <div style={{ height: 44, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: `1px solid ${T.hair}`, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', color: T.faint, background: '#FAFAFA' }}>Task</div>
      {rows.map((r: any) => <Hover key={r.t.id} onClick={() => ctx.openTask(r.t.id)} style={{ height: 48, display: 'flex', alignItems: 'center', gap: 9, padding: '0 16px', borderBottom: `1px solid ${T.hair}`, cursor: 'pointer' }} hover={{ background: T.hover }}>
        <Avatar name={nameOf(r.t.assignee)} size={24} />
        <div style={{ minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.t.title}</div><div style={{ fontSize: 11, color: T.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.t.related || '—'}</div></div>
      </Hover>)}
      {rows.length === 0 && <div style={{ padding: 20, color: T.faint, fontSize: 13 }}>No scheduled tasks.</div>}
    </div>
    <div style={{ flex: 1, overflowX: 'auto' }}>
      <div style={{ position: 'relative', width: WEEKS * COLW }}>
        <div style={{ display: 'flex', height: 44, borderBottom: `1px solid ${T.hair}`, background: '#FAFAFA' }}>
          {weeks.map((w, i) => <div key={i} style={{ width: COLW, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 12px', borderLeft: i ? `1px solid ${T.hair}` : 'none', fontSize: 11.5, fontWeight: 600, color: T.muted }}>{fmtDate(iso(w))}</div>)}
        </div>
        <div style={{ position: 'relative' }}>
          {/* week gridlines + today marker */}
          {weeks.map((_, i) => <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: i * COLW, width: 1, background: T.hair }} />)}
          {todayLeft >= 0 && todayLeft <= WEEKS * COLW && <div style={{ position: 'absolute', top: 0, bottom: 0, left: todayLeft, width: 2, background: 'rgba(0,122,255,0.5)', zIndex: 1 }} />}
          {rows.map((r: any) => {
            const left = Math.max(0, daysBetween(winStart, r.start)) * DAYW;
            const span = Math.max(1, daysBetween(r.start, r.due) + 1);
            const width = Math.min(span * DAYW, WEEKS * COLW - left);
            const s = metaOf(r.t.status);
            return <div key={r.t.id} style={{ height: 48, borderBottom: `1px solid ${T.hair}`, position: 'relative' }}>
              <Hover onClick={() => ctx.openTask(r.t.id)} style={{ position: 'absolute', top: 11, left: left + 4, width: Math.max(width - 8, 20), height: 26, borderRadius: 8, background: s.bg, border: `1px solid ${s.dot}33`, display: 'flex', alignItems: 'center', gap: 6, padding: '0 9px', cursor: 'pointer', overflow: 'hidden' }} hover={{ filter: 'brightness(0.97)' }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: s.dot, flex: 'none' }} />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: s.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.t.title}</span>
              </Hover>
            </div>;
          })}
        </div>
      </div>
    </div>
  </div>;
}

/* ============================ MY WORK VIEW ============================ */
export function MyWorkView({ tasks, me }: any) {
  const ctx = useTasksCtx();
  const mine = tasks.filter((t: any) => t.assignee === me.initials);
  const sections = [
    { key: 'overdue', label: 'Overdue', items: mine.filter((t: any) => dueInfo(t).group === 'overdue' && t.status !== 'complete') },
    { key: 'today', label: 'Today', items: mine.filter((t: any) => dueInfo(t).group === 'today' && t.status !== 'complete') },
    { key: 'upcoming', label: 'Upcoming', items: mine.filter((t: any) => ['tomorrow', 'week', 'later'].includes(dueInfo(t).group) && t.status !== 'complete') },
    { key: 'waiting', label: 'Waiting on Others', items: mine.filter((t: any) => t.status === 'waiting') },
    { key: 'watching', label: 'Watching', items: tasks.filter((t: any) => t.watching) },
    { key: 'done', label: 'Completed Recently', items: mine.filter((t: any) => t.status === 'complete') },
  ];
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(380px,1fr))', gap: 16, alignItems: 'start' }}>
    {sections.map((sec) => <div key={sec.key} style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px 10px' }}>
        <span style={{ fontSize: 14, fontWeight: 650 }}>{sec.label}</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: T.muted, background: '#F2F2F7', borderRadius: 999, padding: '1px 8px' }}>{sec.items.length}</span>
      </div>
      {sec.items.length === 0 ? <div style={{ padding: '4px 16px 16px', color: T.faint, fontSize: 12.5 }}>{sec.key === 'overdue' ? "Nothing overdue. You're caught up." : 'Nothing here.'}</div> : sec.items.map((t: any) => (
        <Hover key={t.id} onClick={() => ctx.openTask(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 16px', borderTop: `1px solid ${T.hair}`, cursor: 'pointer' }} hover={{ background: T.hover }}>
          <CheckCircle done={t.status === 'complete'} onClick={() => ctx.toggleComplete(t.id)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: t.status === 'complete' ? 'line-through' : 'none', color: t.status === 'complete' ? T.faint : T.text }}>{t.title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, fontSize: 11.5, color: T.faint }}>{t.related || '—'}{t.due && <span style={{ color: dueInfo(t).color, fontWeight: 600 }}>· {dueInfo(t).label}</span>}</div>
          </div>
          <Hover as="button" onClick={(e: any) => { e.stopPropagation(); ctx.toggleComplete(t.id); ctx.toast(t.status === 'complete' ? 'Reopened' : 'Completed', 'success'); }} style={{ height: 30, padding: '0 11px', fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9, cursor: 'pointer', flex: 'none' }} hover={{ background: 'rgba(0,0,0,0.04)' }}>{t.status === 'complete' ? 'Reopen' : 'Done'}</Hover>
        </Hover>))}
    </div>)}
  </div>;
}

/* ============================ AUTOMATIONS VIEW ============================ */
export function AutomationsView({ automations, onToggle }: any) {
  const ctx = useTasksCtx();
  return <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div><div style={{ fontSize: 16, fontWeight: 650 }}>Automation Rules</div><div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>Tasks are created automatically when these conditions are met.</div></div>
      <div style={{ flex: 1 }} />
      <Btn variant="secondary" icon="plus" onClick={() => ctx.toast('New automation', 'info')}>New Automation</Btn>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(420px,1fr))', gap: 14 }}>
      {automations.map((a: any) => <div key={a.id} style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ width: 36, height: 36, flex: 'none', borderRadius: 10, background: a.enabled ? 'rgba(88,86,214,0.12)' : '#F2F2F7', color: a.enabled ? '#5856D6' : T.faint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="zap" size={18} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#3F3BB8', background: 'rgba(88,86,214,0.10)', borderRadius: 999, padding: '2px 9px' }}>When {a.trigger}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, color: T.muted, fontSize: 12.5 }}><Icon name="filter" size={13} />{a.condition}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, color: '#3a3a3c', fontSize: 12.5 }}><Icon name="arrowRight" size={13} />{a.action}</div>
          </div>
          <Toggle on={a.enabled} onChange={() => onToggle(a.id)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.hair}` }}>
          <span style={{ fontSize: 12, color: T.faint }}>{a.enabled ? `Last run ${fmtDate(a.lastRun)}` : 'Disabled'}</span>
          <Hover as="button" onClick={() => ctx.toast('Edit automation', 'info')} style={{ height: 30, padding: '0 12px', fontSize: 12.5, fontWeight: 600, background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9, cursor: 'pointer' }} hover={{ background: 'rgba(0,0,0,0.04)' }}>Edit</Hover>
        </div>
      </div>)}
    </div>
  </div>;
}
