import { iso } from './lib';

// Lightweight cross-module bus so integrations (RingCentral / Email / FMCSA /
// phone calls) can push real tasks into the Tasks workspace.
type Listener = (t: any) => void;
const listeners = new Set<Listener>();
// Every task pushed this session (oldest first). Replayed to each subscriber so
// tasks created while the workspace is closed — or before it was last
// unmounted — are still there when it opens again. The workspace dedupes by id.
const history: any[] = [];
const HISTORY_MAX = 500;
let _n = 0;

export function makeTask(p: any) {
  const now = iso(new Date());
  return {
    id: 'ext' + Date.now() + '_' + (_n++), title: '', description: '', status: 'todo', assignee: 'NP',
    priority: 'normal', due: null, start: null, relatedType: null, related: null, carrier: null,
    source: 'automation', tags: [], checklist: [], subtasks: [], comments: [], attachments: [], watching: false,
    createdBy: 'Automation', createdDate: now, activity: [{ id: 'a0', text: 'created this task', who: 'Automation', time: now }],
    ...p,
  };
}

export function addExternalTask(t: any) {
  const task = t.id ? t : makeTask(t);
  history.push(task);
  if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);
  listeners.forEach((l) => l(task));
  return task;
}

export function subscribeTasks(l: Listener) {
  history.forEach((t) => l(t));
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Tasks pushed through the bus this session (e.g. to count a person's open follow-ups). */
export function externalTasks(): any[] { return history.slice(); }
