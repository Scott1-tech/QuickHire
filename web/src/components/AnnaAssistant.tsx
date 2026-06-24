import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '@/store';

// Anna — the app-wide AI assistant. A floating launcher (every page) opens a chat
// panel where users can ask questions about the app, get summaries, jump to any
// profile, and assign tasks. The backend (/api/anna/chat) answers and may return
// actions (navigate / open_profile / create_task) which we apply here.

type Msg = { role: 'user' | 'assistant'; content: string };
type Store = ReturnType<typeof useStore>;

const GREETING: Msg = {
  role: 'assistant',
  content: "Hi, I'm Anna 👋 Ask me anything about the app, say “open driver John Doe” to jump to a profile, “summarize this driver”, or “assign a task to Jenna…”.",
};

const lc = (x: unknown) => String(x ?? '').toLowerCase();

function findEntity(s: Store, type: string, name: string) {
  const n = lc(name).trim();
  const pick = <T,>(arr: T[], label: (x: T) => string) => arr.find((x) => lc(label(x)) === n) || arr.find((x) => lc(label(x)).includes(n));
  if (type === 'driver') return pick(s.allDrivers, (d) => d.name);
  if (type === 'candidate') return pick(s.allCandidates, (c) => c.name);
  if (type === 'carrier') return pick(s.carriers, (c) => c.name);
  if (type === 'truck') return pick(s.allTrucks, (t) => `unit ${t.unit} ${t.make} ${t.model}`) || s.allTrucks.find((t) => lc(t.unit) === n);
  return undefined;
}

function routeForEntity(type: string, e: { id: string; carrierId?: string }): string | null {
  switch (type) {
    case 'driver': return `/carriers/${e.carrierId}/drivers/${e.id}`;
    case 'candidate': return `/carriers/${e.carrierId}/hiring/${e.id}`;
    case 'truck': return `/carriers/${e.carrierId}/trucks/${e.id}`;
    case 'carrier': return `/carriers/${e.id}`;
    default: return null;
  }
}

function pageRoute(page: string, s: Store): string {
  const cid = s.currentCarrierId;
  const map: Record<string, string> = {
    dashboard: '/dashboard', carriers: '/carriers', tasks: '/tasks', inbox: '/inbox',
    notifications: '/notifications', settings: '/settings',
    drivers: `/carriers/${cid}/drivers`, trucks: `/carriers/${cid}/trucks`, hiring: `/carriers/${cid}/hiring`,
  };
  return map[page] || '/dashboard';
}

// Identify the record the user is currently viewing, for "summarize this …".
function resolveFocus(pathname: string, s: Store): Record<string, unknown> | null {
  let m;
  if ((m = pathname.match(/\/carriers\/[^/]+\/drivers\/([^/]+)$/))) { const d = s.allDrivers.find((x) => x.id === m![1]); return d ? { entityType: 'driver', ...d } : null; }
  if ((m = pathname.match(/\/carriers\/[^/]+\/hiring\/([^/]+)$/))) { const c = s.allCandidates.find((x) => x.id === m![1]); return c ? { entityType: 'candidate', ...c } : null; }
  if ((m = pathname.match(/\/carriers\/[^/]+\/trucks\/([^/]+)$/))) { const t = s.allTrucks.find((x) => x.id === m![1]); return t ? { entityType: 'truck', ...t } : null; }
  if ((m = pathname.match(/\/carriers\/(?:profile\/)?([^/]+)$/))) { const c = s.carriers.find((x) => x.id === m![1]); return c ? { entityType: 'carrier', ...c } : null; }
  return null;
}

function buildDirectory(s: Store) {
  return {
    drivers: s.allDrivers.slice(0, 40).map((d) => ({ name: d.name, status: d.status, type: d.type, license: d.license, state: d.state })),
    carriers: s.carriers.slice(0, 40).map((c) => ({ name: c.name, dot: c.dot, authority: c.authority })),
    candidates: s.allCandidates.slice(0, 40).map((c) => ({ name: c.name, stage: c.stage, email: c.email })),
    trucks: s.allTrucks.slice(0, 40).map((t) => ({ unit: t.unit, make: t.make, model: t.model, year: t.year, status: t.status })),
  };
}

function matchEmployee(s: Store, name?: string): string | undefined {
  if (!name) return undefined;
  const n = lc(name).trim();
  const e = s.allEmployees.find((emp) => lc(`${emp.firstName} ${emp.lastName}`).includes(n) || lc(emp.firstName) === n);
  return e ? `${e.firstName} ${e.lastName}` : name;
}

const loadMsgs = (): Msg[] => { try { const v = JSON.parse(sessionStorage.getItem('anna_chat') || ''); return Array.isArray(v) && v.length ? v : [GREETING]; } catch { return [GREETING]; } };

export default function AnnaAssistant() {
  const s = useStore();
  const loc = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(() => sessionStorage.getItem('anna_open') === '1');
  const [msgs, setMsgs] = useState<Msg[]>(loadMsgs);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { sessionStorage.setItem('anna_chat', JSON.stringify(msgs.slice(-30))); }, [msgs]);
  useEffect(() => { sessionStorage.setItem('anna_open', open ? '1' : '0'); }, [open]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, open]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  // Apply an action returned by Anna. Returns an optional extra note to append.
  const applyAction = (a: { type: string; [k: string]: unknown }): string | null => {
    if (a.type === 'create_task' && (a.task as { title?: string })?.title) {
      const t = a.task as { title: string; assignee?: string; priority?: string; due?: string; description?: string };
      s.addTask({ title: t.title, assignee: matchEmployee(s, t.assignee), priority: t.priority as never, due: t.due, description: t.description, source: 'Anna' });
      return null;
    }
    if (a.type === 'navigate') { nav(pageRoute(String(a.page), s)); return null; }
    if (a.type === 'open_profile') {
      const e = findEntity(s, String(a.entityType), String(a.name));
      if (!e) return `I couldn't find a ${a.entityType} named “${a.name}”.`;
      const route = routeForEntity(String(a.entityType), e as { id: string; carrierId?: string });
      if (route) { nav(route); return null; }
    }
    return null;
  };

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: text }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/anna/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': localStorage.getItem('qh_admin') ?? '' },
        body: JSON.stringify({
          messages: next.slice(-12).map((m) => ({ role: m.role, content: m.content })),
          context: {
            page: loc.pathname,
            focus: resolveFocus(loc.pathname, s),
            directory: buildDirectory(s),
            counts: { drivers: s.allDrivers.length, candidates: s.allCandidates.length, carriers: s.carriers.length, trucks: s.allTrucks.length, openTasks: s.allTasks.filter((t) => t.status !== 'COMPLETE').length },
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      const notes: string[] = [];
      for (const a of data.actions || []) { const note = applyAction(a); if (note) notes.push(note); }
      setMsgs((m) => [...m, { role: 'assistant', content: [data.reply, ...notes].filter(Boolean).join('\n\n') || 'Done.' }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: '⚠ ' + ((e as Error).message || 'Something went wrong.') }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const reset = () => { setMsgs([GREETING]); sessionStorage.removeItem('anna_chat'); };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} title="Ask Anna (AI assistant)"
          className="fixed bottom-24 right-6 z-40 flex items-center gap-2 bg-primary text-white font-semibold rounded-full pl-3 pr-4 py-3 shadow-pop hover:-translate-y-0.5 transition">
          <span className="text-lg leading-none">🤖</span> Ask Anna
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[92vw] h-[560px] max-h-[82vh] flex flex-col bg-surface border border-line rounded-2xl shadow-pop overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-line bg-primary text-white">
            <span className="w-7 h-7 grid place-items-center rounded-full bg-white/20 text-base">🤖</span>
            <div className="flex-1">
              <div className="text-sm font-bold leading-tight">Anna</div>
              <div className="text-[11px] opacity-80 leading-tight">AI assistant</div>
            </div>
            <button onClick={reset} title="New conversation" className="text-white/90 hover:text-white text-sm mr-1">⟳</button>
            <a href="/anna" title="Open the full Anna workspace" className="text-[11px] underline opacity-90 hover:opacity-100">Workspace</a>
            <button onClick={() => setOpen(false)} className="ml-1 text-white/90 hover:text-white text-xl leading-none">×</button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary text-white rounded-br-sm' : 'bg-primary-light text-ink rounded-bl-sm'}`}>{m.content}</div>
              </div>
            ))}
            {busy && <div className="flex justify-start"><div className="px-3 py-2 rounded-2xl bg-primary-light text-muted text-sm">Anna is thinking…</div></div>}
            <div ref={endRef} />
          </div>

          {msgs.length <= 1 && (
            <div className="px-3 pb-1 flex flex-wrap gap-1.5">
              {['Summarize this page', 'Open the Tasks page', 'What disqualifies a driver under FMCSA?'].map((q) => (
                <button key={q} onClick={() => send(q)} className="text-[11px] px-2 py-1 rounded-full border border-line text-muted hover:bg-[var(--surface-hover)]">{q}</button>
              ))}
            </div>
          )}

          <div className="p-2.5 border-t border-line flex items-center gap-2">
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="Ask, summarize, open a profile, assign a task…"
              className="flex-1 bg-transparent outline-none text-sm text-ink px-2 py-1.5 border border-line rounded-lg" />
            <button onClick={() => send()} disabled={busy || !input.trim()} className="bg-primary text-white rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40">Send</button>
          </div>
        </div>
      )}
    </>
  );
}
