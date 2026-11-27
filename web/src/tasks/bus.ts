import { iso } from './lib';

// Lightweight cross-module bus so integrations (RingCentral / Email / FMCSA /
// Pipelines) can push real tasks into the Tasks workspace. Pushed tasks are
// persisted (localStorage) and replayed whenever the workspace mounts, so they
// survive navigation and reloads; the workspace de-duplicates by id.
type Listener = (t: any) => void;
const listeners = new Set<Listener>();
let _n = 0;

const LS = 'qh_ext_tasks_v1';
const MAX = 300;
function load(): any[] { try { const r = localStorage.getItem(LS); const v = r ? JSON.parse(r) : []; return Array.isArray(v) ? v : []; } catch { return []; } }
function save() { try { localStorage.setItem(LS, JSON.stringify(pushed.slice(0, MAX))); } catch { /* quota */ } }
let pushed: any[] = load(); // newest first

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
  pushed = [task, ...pushed.filter((x) => x.id !== task.id)];
  save();
  listeners.forEach((l) => l(task));
  return task;
}

/** Withdraw pushed tasks (e.g. when the action that created them is undone). */
export function removeExternalTasks(ids: string[]) {
  if (!ids.length) return;
  const drop = new Set(ids);
  pushed = pushed.filter((x) => !drop.has(x.id));
  save();
}

/** All tasks pushed through the bus, newest first. */
export function externalTasks() { return pushed.slice(); }

export function subscribeTasks(l: Listener) {
  // replay everything pushed so far (oldest first so the newest lands on top)
  pushed.slice().reverse().forEach((t) => l(t));
  listeners.add(l);
  return () => { listeners.delete(l); };
}
