import { iso } from './lib';

// Lightweight cross-module bus so integrations (RingCentral / Email / FMCSA)
// can push real tasks into the Tasks workspace.
type Listener = (t: any) => void;
const listeners = new Set<Listener>();
const queued: any[] = [];
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
  if (listeners.size) listeners.forEach((l) => l(task));
  else queued.push(task);
  return task;
}

export function subscribeTasks(l: Listener) {
  // flush anything queued before the workspace mounted
  if (queued.length) { const c = queued.splice(0); c.forEach((t) => l(t)); }
  listeners.add(l);
  return () => { listeners.delete(l); };
}
