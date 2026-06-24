import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '@/store';

// Anna — the app-wide AI assistant. A floating launcher (every page) opens a chat
// panel where users can ask questions and assign tasks in natural language. The
// backend (/api/anna/chat) answers and may return actions (e.g. create_task),
// which we apply to the store here.

type Msg = { role: 'user' | 'assistant'; content: string };

const GREETING: Msg = {
  role: 'assistant',
  content: "Hi, I'm Anna 👋 Ask me about driver qualification, compliance, or the app — or just tell me to assign a task (e.g. “Assign a task to Jenna: call John about his MVR”).",
};

function matchEmployee(s: ReturnType<typeof useStore>, name?: string): string | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  const e = s.allEmployees.find(
    (emp) => `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(n) || emp.firstName.toLowerCase() === n,
  );
  return e ? `${e.firstName} ${e.lastName}` : name;
}

export default function AnnaAssistant() {
  const s = useStore();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, open]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

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
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          context: {
            page: loc.pathname,
            carrier: s.currentCarrier?.name,
            counts: { drivers: s.drivers.length, candidates: s.candidates.length, openTasks: s.tasks.filter((t) => t.status !== 'COMPLETE').length },
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      for (const a of data.actions || []) {
        if (a.type === 'create_task' && a.task?.title) {
          s.addTask({
            title: a.task.title,
            assignee: matchEmployee(s, a.task.assignee),
            priority: a.task.priority,
            due: a.task.due,
            description: a.task.description,
            source: 'Anna',
          });
        }
      }
      setMsgs((m) => [...m, { role: 'assistant', content: data.reply || 'Done.' }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: '⚠ ' + ((e as Error).message || 'Something went wrong.') }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      {/* Launcher (above the New Task button) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Ask Anna (AI assistant)"
          className="fixed bottom-24 right-6 z-40 flex items-center gap-2 bg-primary text-white font-semibold rounded-full pl-3 pr-4 py-3 shadow-pop hover:-translate-y-0.5 transition"
        >
          <span className="text-lg leading-none">🤖</span> Ask Anna
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[92vw] h-[540px] max-h-[80vh] flex flex-col bg-surface border border-line rounded-2xl shadow-pop overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-line bg-primary text-white">
            <span className="w-7 h-7 grid place-items-center rounded-full bg-white/20 text-base">🤖</span>
            <div className="flex-1">
              <div className="text-sm font-bold leading-tight">Anna</div>
              <div className="text-[11px] opacity-80 leading-tight">AI assistant</div>
            </div>
            <a href="/anna" title="Open the full Anna workspace" className="text-[11px] underline opacity-90 hover:opacity-100">Workspace</a>
            <button onClick={() => setOpen(false)} className="ml-1 text-white/90 hover:text-white text-xl leading-none">×</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary text-white rounded-br-sm' : 'bg-primary-light text-ink rounded-bl-sm'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {busy && <div className="flex justify-start"><div className="px-3 py-2 rounded-2xl bg-primary-light text-muted text-sm">Anna is thinking…</div></div>}
            <div ref={endRef} />
          </div>

          {/* Quick actions */}
          {msgs.length <= 1 && (
            <div className="px-3 pb-1 flex flex-wrap gap-1.5">
              {['Assign a task to me to review pending drivers', 'What disqualifies a driver under FMCSA?', 'How does driver matching work?'].map((q) => (
                <button key={q} onClick={() => send(q)} className="text-[11px] px-2 py-1 rounded-full border border-line text-muted hover:bg-[var(--surface-hover)]">{q}</button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-2.5 border-t border-line flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="Ask a question or assign a task…"
              className="flex-1 bg-transparent outline-none text-sm text-ink px-2 py-1.5 border border-line rounded-lg"
            />
            <button onClick={() => send()} disabled={busy || !input.trim()} className="bg-primary text-white rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40">Send</button>
          </div>
        </div>
      )}
    </>
  );
}
