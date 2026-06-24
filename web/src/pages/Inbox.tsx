import { useMemo, useState } from 'react';
import { useStore } from '@/store';
import { PageHeader, Pill, Empty } from '@/ui';
import Icon from '@/components/Icon';
import TaskModal from '@/components/TaskModal';

type Channel = 'email' | 'sms' | 'phone';
type ContactType = 'Driver' | 'Candidate' | 'Carrier' | 'Guest';
interface Msg { id: string; from: 'me' | 'them'; text: string; time: string; call?: boolean }
interface Conv {
  id: number;
  channel: Channel;
  name: string;
  preview: string;
  time: string;
  pending: boolean;
  carrier: string;
  label: ContactType;
  contact: ContactType;
  mine: boolean;        // assigned to the signed-in user
  unread: boolean;
  unattended: boolean;  // awaiting a reply from us
  archived: boolean;
  messages: Msg[];
}

const CHANNEL_ICON: Record<Channel, string> = { email: '📧', sms: '💬', phone: '📞' };

const SEED: Conv[] = [
  {
    id: 1, channel: 'email', name: 'ROBERT JOHNSON', preview: 'Thanks, I just submitted my application…',
    time: '2h', pending: true, carrier: 'GRAND ONE LLC', label: 'Candidate', contact: 'Candidate',
    mine: true, unread: true, unattended: true, archived: false,
    messages: [
      { id: 'm1', from: 'them', text: 'Hi, is the OTR driver position still open?', time: '3h' },
      { id: 'm2', from: 'me', text: 'Yes it is! Here is the application link: quickhire.app/a/rj', time: '3h' },
      { id: 'm3', from: 'them', text: 'Thanks, I just submitted my application.', time: '2h' },
    ],
  },
  {
    id: 2, channel: 'sms', name: '+1 (555) 010-2233', preview: 'Got the link, filling it out now',
    time: '4h', pending: false, carrier: 'GRAND ONE LLC', label: 'Candidate', contact: 'Candidate',
    mine: true, unread: false, unattended: false, archived: false,
    messages: [
      { id: 'm1', from: 'me', text: 'Here is your application link: quickhire.app/a/xv3', time: '5h' },
      { id: 'm2', from: 'them', text: 'Got the link, filling it out now', time: '4h' },
    ],
  },
  {
    id: 3, channel: 'phone', name: 'MARIA GARCIA', preview: 'Missed call · 3m',
    time: '1d', pending: false, carrier: 'GRAND ONE LLC', label: 'Driver', contact: 'Driver',
    mine: true, unread: false, unattended: true, archived: false,
    messages: [
      { id: 'm1', from: 'them', text: 'Missed call · 3m', time: '1d', call: true },
      { id: 'm2', from: 'me', text: 'Outgoing call · 5m', time: '1d', call: true },
    ],
  },
  {
    id: 4, channel: 'email', name: 'DAVID LEE', preview: 'I have a clean MVR and 4 years OTR experience.',
    time: '6h', pending: true, carrier: 'GRAND ONE LLC', label: 'Candidate', contact: 'Candidate',
    mine: false, unread: true, unattended: true, archived: false,
    messages: [
      { id: 'm1', from: 'them', text: 'I have a clean MVR and 4 years OTR experience. Are you hiring?', time: '6h' },
    ],
  },
  {
    id: 5, channel: 'email', name: 'SUNRISE LOGISTICS', preview: 'Confirming our lane rates for next week.',
    time: '2d', pending: false, carrier: 'GRAND ONE LLC', label: 'Carrier', contact: 'Carrier',
    mine: false, unread: false, unattended: false, archived: true,
    messages: [
      { id: 'm1', from: 'them', text: 'Confirming our lane rates for next week.', time: '2d' },
      { id: 'm2', from: 'me', text: 'Got it, thanks — looks good on our end.', time: '2d' },
    ],
  },
];

const PRIO: Record<string, string> = { Urgent: 'action', High: 'pending', Normal: 'not_started' };

type Folder = 'all' | 'unreads' | 'unattended' | 'archived';
const FOLDERS: { key: Folder; label: string }[] = [
  { key: 'all', label: '📥 All conversations' },
  { key: 'unreads', label: '● Unreads' },
  { key: 'unattended', label: '⏳ Unattended' },
  { key: 'archived', label: '🗄 Archived' },
];
const LABELS: ContactType[] = ['Driver', 'Candidate', 'Carrier'];
const CONTACTS: (ContactType | 'Blocked')[] = ['Carrier', 'Driver', 'Candidate', 'Guest', 'Blocked'];

const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export default function Inbox() {
  const s = useStore();
  const [tab, setTab] = useState<'messages' | 'tasks'>('messages');
  const [filter, setFilter] = useState<'mine' | 'unassigned' | 'all'>('mine');
  const [folder, setFolder] = useState<Folder>('all');
  const [labelFilter, setLabelFilter] = useState<ContactType | null>(null);
  const [contactFilter, setContactFilter] = useState<ContactType | 'Blocked' | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [convs, setConvs] = useState<Conv[]>(SEED);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  // Tasks assigned to the signed-in user show up right here in their inbox.
  const myTasks = s.allTasks.filter((t) => t.assignee === s.currentUser && t.status !== 'COMPLETE');

  // Apply the Mine/Unassigned/All tab, the folder, and any label/contact filter.
  const visible = useMemo(() => convs.filter((c) => {
    if (filter === 'mine' && !c.mine) return false;
    if (filter === 'unassigned' && c.mine) return false;
    if (folder === 'archived') { if (!c.archived) return false; }
    else if (c.archived) return false;
    if (folder === 'unreads' && !c.unread) return false;
    if (folder === 'unattended' && !c.unattended) return false;
    if (labelFilter && c.label !== labelFilter) return false;
    if (contactFilter && contactFilter !== 'Blocked' && c.contact !== contactFilter) return false;
    if (contactFilter === 'Blocked') return false; // no blocked contacts in demo
    return true;
  }), [convs, filter, folder, labelFilter, contactFilter]);

  const counts = {
    all: convs.filter((c) => !c.archived).length,
    unreads: convs.filter((c) => c.unread && !c.archived).length,
    unattended: convs.filter((c) => c.unattended && !c.archived).length,
    archived: convs.filter((c) => c.archived).length,
  };

  const selected = convs.find((c) => c.id === selectedId) ?? null;

  const openConv = (c: Conv) => {
    setSelectedId(c.id);
    if (c.unread) setConvs((prev) => prev.map((x) => (x.id === c.id ? { ...x, unread: false } : x)));
  };

  const send = () => {
    if (!draft.trim() || !selected) return;
    const msg: Msg = { id: uid('m'), from: 'me', text: draft.trim(), time: 'now' };
    setConvs((prev) => prev.map((c) =>
      c.id === selected.id
        ? { ...c, messages: [...c.messages, msg], preview: msg.text, time: 'now', unattended: false, pending: false }
        : c,
    ));
    setDraft('');
  };

  const toggleArchive = () => {
    if (!selected) return;
    setConvs((prev) => prev.map((c) => (c.id === selected.id ? { ...c, archived: !c.archived } : c)));
    setSelectedId(null);
  };

  const folderBtn = (active: boolean) =>
    `px-2.5 py-2 rounded-lg text-[13px] flex items-center justify-between cursor-pointer ${active ? 'bg-primary-light text-primary font-semibold' : 'hover:bg-[var(--surface-hover)]'}`;
  const pillBtn = (active: boolean) =>
    `px-2.5 py-2 rounded-lg text-[13px] cursor-pointer ${active ? 'bg-primary-light text-primary font-semibold' : 'hover:bg-[var(--surface-hover)]'}`;

  return (
    <>
      <PageHeader crumbs={[{ label: 'Inbox' }]}
        actions={<button onClick={() => setShowSettings(true)} className="btn-ghost">⚙ Inbox Settings</button>} />
      <div className="flex-1 overflow-hidden p-6 flex flex-col">
        {/* Messages / Tasks switch */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex gap-1 bg-bg border border-line rounded-[10px] p-1">
            <button onClick={() => setTab('messages')} className={`px-3 py-1.5 text-[12.5px] font-semibold rounded-lg ${tab === 'messages' ? 'bg-primary-light text-primary' : 'text-muted'}`}>Messages</button>
            <button onClick={() => setTab('tasks')} className={`px-3 py-1.5 text-[12.5px] font-semibold rounded-lg flex items-center gap-1.5 ${tab === 'tasks' ? 'bg-primary-light text-primary' : 'text-muted'}`}>
              My Tasks {myTasks.length > 0 && <span className="text-[10px] font-bold bg-danger text-white rounded-full px-1.5">{myTasks.length}</span>}
            </button>
          </div>
          {tab === 'messages' && ([['mine', 'Mine'], ['unassigned', 'Unassigned'], ['all', `All (${counts.all})`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setFilter(k); setSelectedId(null); }} className={`px-3 py-1.5 text-[12.5px] font-semibold rounded-lg ${filter === k ? 'bg-primary-light text-primary' : 'text-muted'}`}>{l}</button>
          ))}
        </div>

        {tab === 'messages' ? (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[200px_320px_1fr] border border-line rounded-xl overflow-hidden bg-surface">
            <div className="border-r border-line p-3 bg-bg overflow-y-auto hidden lg:block">
              {FOLDERS.map((f) => (
                <div key={f.key} onClick={() => { setFolder(f.key); setSelectedId(null); }} className={folderBtn(folder === f.key)}>
                  <span>{f.label}</span>
                  {counts[f.key] > 0 && <span className="text-[11px] text-muted font-semibold">{counts[f.key]}</span>}
                </div>
              ))}
              <div className="text-[10.5px] font-bold text-muted uppercase px-2 mt-4 mb-1.5">Labels</div>
              {LABELS.map((x) => (
                <div key={x} onClick={() => { setLabelFilter(labelFilter === x ? null : x); setSelectedId(null); }} className={pillBtn(labelFilter === x)}>● {x}</div>
              ))}
              <div className="text-[10.5px] font-bold text-muted uppercase px-2 mt-4 mb-1.5">Contacts</div>
              {CONTACTS.map((x) => (
                <div key={x} onClick={() => { setContactFilter(contactFilter === x ? null : x); setSelectedId(null); }} className={pillBtn(contactFilter === x)}>{x}</div>
              ))}
            </div>
            <div className="border-r border-line overflow-y-auto hidden lg:block">
              {visible.length === 0 ? (
                <Empty icon="📭" title="No conversations" sub="Nothing matches the current filters." />
              ) : visible.map((c) => (
                <div key={c.id} onClick={() => openConv(c)} className={`flex gap-2.5 px-3.5 py-3 border-b border-line/60 cursor-pointer ${selectedId === c.id ? 'bg-primary-light' : 'hover:bg-[var(--surface-hover)]'}`}>
                  <div className="text-lg relative">
                    {CHANNEL_ICON[c.channel]}
                    {c.unread && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5"><span className={`text-[13px] text-ink ${c.unread ? 'font-extrabold' : 'font-bold'}`}>{c.name}</span>{c.pending && <Pill kind="pending">pending</Pill>}<span className="text-[11px] text-muted ml-auto">{c.time}</span></div>
                    <div className="text-[12.5px] text-muted truncate my-0.5">{c.preview}</div>
                    <div className="flex gap-1.5 items-center"><span className="text-[10.5px] text-muted">{c.carrier}</span><Pill kind={c.label === 'Driver' ? 'active' : 'Submitted'}>{c.label}</Pill></div>
                  </div>
                </div>
              ))}
            </div>
            {selected ? (
              <div className="flex flex-col min-h-0">
                {/* Thread header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
                  <div className="text-xl">{CHANNEL_ICON[selected.channel]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold text-ink truncate">{selected.name}</div>
                    <div className="text-[11.5px] text-muted">{selected.carrier} · {selected.label}</div>
                  </div>
                  <button onClick={toggleArchive} className="btn-ghost text-[12px]">{selected.archived ? 'Unarchive' : '🗄 Archive'}</button>
                </div>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5 bg-bg">
                  {selected.messages.map((m) => (
                    m.call ? (
                      <div key={m.id} className="self-center text-[11.5px] text-muted flex items-center gap-1.5 my-1">
                        <Icon name="phone" size={12} /> {m.text} · {m.time}
                      </div>
                    ) : (
                      <div key={m.id} className={`max-w-[75%] ${m.from === 'me' ? 'self-end' : 'self-start'}`}>
                        <div className={`px-3 py-2 rounded-2xl text-[13px] ${m.from === 'me' ? 'bg-primary text-white rounded-br-sm' : 'bg-surface border border-line text-ink rounded-bl-sm'}`}>{m.text}</div>
                        <div className={`text-[10.5px] text-muted mt-0.5 ${m.from === 'me' ? 'text-right' : ''}`}>{m.time}</div>
                      </div>
                    )
                  ))}
                </div>
                {/* Composer */}
                <div className="border-t border-line p-3 flex items-center gap-2">
                  {selected.channel === 'phone' && (
                    <button className="btn-ghost text-[12px] flex items-center gap-1.5"><Icon name="phone" size={14} /> Call back</button>
                  )}
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                    placeholder={selected.channel === 'email' ? 'Write a reply…' : 'Type a message…'}
                    className="input flex-1" />
                  <button onClick={send} disabled={!draft.trim()} className="btn-primary flex items-center gap-1.5 disabled:opacity-50"><Icon name="send" size={15} /> Send</button>
                </div>
              </div>
            ) : (
              <Empty icon="💬" title="Select a conversation" sub="Choose a conversation from the list to start messaging." />
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {myTasks.length === 0 ? (
              <Empty icon="✓" title="No tasks assigned to you" sub="When someone assigns you a task, it shows up here." />
            ) : (
              <div className="flex flex-col gap-2.5 max-w-3xl">
                {myTasks.map((t) => (
                  <div key={t.id} onClick={() => setOpenTaskId(t.id)} className="card p-4 flex items-center gap-3 cursor-pointer hover:shadow-card transition">
                    <span className="w-9 h-9 rounded-[10px] grid place-items-center bg-primary-light text-primary flex-shrink-0"><Icon name="clipboardCheck" size={18} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-semibold text-ink truncate">{t.title}</div>
                      <div className="text-[12px] text-muted flex items-center gap-2 mt-0.5">
                        <Pill kind={t.status === 'IN PROGRESS' ? 'pending' : 'ready'}>{t.status}</Pill>
                        {t.due && <span className="flex items-center gap-1"><Icon name="calendar" size={12} /> {new Date(t.due).toLocaleDateString()}</span>}
                        {s.carriers.find((c) => c.id === t.carrierId)?.name}
                      </div>
                    </div>
                    {t.priority && <Pill kind={PRIO[t.priority]}>{t.priority}</Pill>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showSettings && (
        <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={() => setShowSettings(false)}>
          <div className="card p-6 w-[440px] max-w-full shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-extrabold text-ink mb-4">Create inbox</div>
            <label className="field-label">Carrier</label>
            <select className="input mb-4">{s.carriers.map((c) => <option key={c.id}>{c.name}</option>)}</select>
            <div className="flex gap-1 bg-bg border border-line rounded-[10px] p-1 mb-4">
              <button className="flex-1 py-1.5 text-[13px] font-semibold rounded-lg bg-primary-light text-primary">📧 Email</button>
              <button className="flex-1 py-1.5 text-[13px] font-semibold rounded-lg text-muted">📞 Phone</button>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" defaultChecked /> Use system default configuration</label>
            <div className="flex gap-2 mt-5"><button onClick={() => setShowSettings(false)} className="btn-primary flex-1">Create inbox</button><button onClick={() => setShowSettings(false)} className="btn-ghost">Cancel</button></div>
          </div>
        </div>
      )}

      {openTaskId && <TaskModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </>
  );
}
