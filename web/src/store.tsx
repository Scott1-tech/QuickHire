import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Carrier, Candidate, Driver, Truck, Employee, Task, ChecklistStep, Role, Stage, PipelineStage, StageColor } from '@/types';
import { DEFAULT_PIPELINE } from '@/types';
import { setStageColorRegistry } from '@/lib/pipeline';
import { CARRIERS, CANDIDATES, DRIVERS, TRUCKS, EMPLOYEES, TASKS, CHECKLIST_TEMPLATE } from '@/data/mock';

interface Store {
  role: Role;
  setRole: (r: Role) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  carriers: Carrier[];
  currentCarrierId: string;
  setCurrentCarrierId: (id: string) => void;
  currentCarrier: Carrier;
  // collections scoped to the active carrier
  candidates: Candidate[];
  drivers: Driver[];
  trucks: Truck[];
  employees: Employee[];
  tasks: Task[];
  // full collections (global views like the dashboard)
  allCandidates: Candidate[];
  allDrivers: Driver[];
  allTrucks: Truck[];
  allEmployees: Employee[];
  allTasks: Task[];
  // the signed-in user (for "assigned to me" / inbox)
  currentUser: string;
  // hiring pipeline checklist template (customizable by full-access users)
  checklistTemplate: ChecklistStep[];
  reorderChecklist: (id: string, dir: 'up' | 'down') => void;
  addChecklistStep: (step: { name: string; group: ChecklistStep['group']; description?: string }) => void;
  removeChecklistStep: (id: string) => void;
  // hiring pipeline stages (board columns) — fully customizable by full-access users
  pipeline: PipelineStage[];
  addStage: (name: string, color?: StageColor) => void;
  renameStage: (id: string, name: string) => void;
  setStageColor: (id: string, color: StageColor) => void;
  reorderStage: (id: string, dir: 'left' | 'right') => void;
  removeStage: (id: string) => void;
  resetPipeline: () => void;
  // mutations
  moveCandidate: (id: string, stage: Stage) => void;
  addCandidate: (c: Partial<Candidate>) => Candidate;
  addDriver: (d: Partial<Driver>) => Driver;
  addTruck: (t: Partial<Truck>) => Truck;
  addCarrier: (c: Partial<Carrier>) => Carrier;
  addEmployee: (e: Partial<Employee>) => Employee;
  addTask: (t: Partial<Task>) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  assignTruck: (candidateId: string, truckId: string) => void;
  assignTruckToCandidate: (candidateId: string, truckId: string | null) => void;
  assignDriverToTruck: (truckId: string, driverId: string | null) => void;
}

const Ctx = createContext<Store | null>(null);
const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('Super Admin');
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
  );

  // mutable collections (seeded from mock data)
  const [carriers, setCarriers] = useState<Carrier[]>(CARRIERS);
  const [currentCarrierId, setCurrentCarrierId] = useState<string>(CARRIERS[0].id);
  const [candidates, setCandidates] = useState<Candidate[]>(CANDIDATES);
  const [drivers, setDrivers] = useState<Driver[]>(DRIVERS);
  const [trucks, setTrucks] = useState<Truck[]>(TRUCKS);
  const [employees, setEmployees] = useState<Employee[]>(EMPLOYEES);
  const [tasks, setTasks] = useState<Task[]>(TASKS);
  const [checklistTemplate, setChecklistTemplate] = useState<ChecklistStep[]>(CHECKLIST_TEMPLATE);
  const [pipeline, setPipeline] = useState<PipelineStage[]>(DEFAULT_PIPELINE);
  const currentUser = 'Fleet Admin';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Keep the shared name→colour registry in sync so <Pill> shows stage colours.
  useEffect(() => {
    setStageColorRegistry(pipeline);
  }, [pipeline]);

  const currentCarrier = useMemo(
    () => carriers.find((c) => c.id === currentCarrierId) ?? carriers[0],
    [carriers, currentCarrierId],
  );

  const value: Store = {
    role,
    setRole,
    theme,
    toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    carriers,
    currentCarrierId,
    setCurrentCarrierId,
    currentCarrier,
    candidates: candidates.filter((c) => c.carrierId === currentCarrierId),
    drivers: drivers.filter((d) => d.carrierId === currentCarrierId),
    trucks: trucks.filter((t) => t.carrierId === currentCarrierId),
    employees: employees.filter((e) => e.carrierId === currentCarrierId),
    tasks: tasks.filter((t) => t.carrierId === currentCarrierId),
    allCandidates: candidates,
    allDrivers: drivers,
    allTrucks: trucks,
    allEmployees: employees,
    allTasks: tasks,
    currentUser,
    checklistTemplate,
    reorderChecklist: (id, dir) => setChecklistTemplate((prev) => {
      const idx = prev.findIndex((x) => x.id === id);
      if (idx < 0) return prev;
      const group = prev[idx].group;
      let swap = -1;
      if (dir === 'up') { for (let i = idx - 1; i >= 0; i--) if (prev[i].group === group) { swap = i; break; } }
      else { for (let i = idx + 1; i < prev.length; i++) if (prev[i].group === group) { swap = i; break; } }
      if (swap < 0) return prev;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    }),
    addChecklistStep: (step) => setChecklistTemplate((prev) => [
      ...prev, { id: uid('ck'), name: step.name, group: step.group, status: 'action', description: step.description },
    ]),
    removeChecklistStep: (id) => setChecklistTemplate((prev) => prev.filter((x) => x.id !== id)),
    pipeline,
    addStage: (name, color = 'slate') => {
      const clean = name.trim();
      if (!clean) return;
      setPipeline((prev) => prev.some((s) => s.name.toLowerCase() === clean.toLowerCase())
        ? prev
        : [...prev, { id: uid('st'), name: clean, color }]);
    },
    renameStage: (id, name) => {
      const clean = name.trim();
      if (!clean) return;
      setPipeline((prev) => {
        const target = prev.find((s) => s.id === id);
        if (!target || target.name === clean) return prev;
        const from = target.name;
        // Move every candidate sitting in the old stage name onto the new one.
        setCandidates((cs) => cs.map((c) => (c.stage === from ? { ...c, stage: clean } : c)));
        return prev.map((s) => (s.id === id ? { ...s, name: clean } : s));
      });
    },
    setStageColor: (id, color) => setPipeline((prev) => prev.map((s) => (s.id === id ? { ...s, color } : s))),
    reorderStage: (id, dir) => setPipeline((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const swap = dir === 'left' ? idx - 1 : idx + 1;
      if (idx < 0 || swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    }),
    removeStage: (id) => setPipeline((prev) => {
      if (prev.length <= 1) return prev; // keep at least one column
      const removed = prev.find((s) => s.id === id);
      const next = prev.filter((s) => s.id !== id);
      // Candidates in the removed stage fall back to the first remaining stage.
      if (removed) setCandidates((cs) => cs.map((c) => (c.stage === removed.name ? { ...c, stage: next[0].name } : c)));
      return next;
    }),
    resetPipeline: () => setPipeline(DEFAULT_PIPELINE),
    moveCandidate: (id, stage) =>
      setCandidates((prev) =>
        prev.map((c) => (c.id === id ? { ...c, stage, stageEnteredAt: new Date().toISOString() } : c)),
      ),
    addCandidate: (c) => {
      const created: Candidate = {
        id: uid('p'),
        carrierId: c.carrierId ?? currentCarrierId,
        name: (c.name ?? 'New Candidate').toUpperCase(),
        stage: 'Lead',
        email: c.email ?? '',
        phone: c.phone,
        statusTag: 'not_started',
        stageEnteredAt: new Date().toISOString(),
        winProb: 10,
        amount: 5000,
        appProgress: 0,
        ownerUserId: c.ownerUserId,
      };
      setCandidates((prev) => [created, ...prev]);
      return created;
    },
    addDriver: (d) => {
      const created: Driver = {
        id: uid('d'),
        carrierId: d.carrierId ?? currentCarrierId,
        name: (d.name ?? 'New Driver').toUpperCase(),
        score: d.score ?? 0,
        license: d.license ?? '',
        state: d.state ?? '',
        status: d.status ?? 'active',
        type: d.type ?? 'company',
        mc: d.mc,
        phone: d.phone,
        email: d.email,
        driverStatus: d.driverStatus ?? 'Available',
        assignedTruckId: d.assignedTruckId ?? null,
        hireDate: d.hireDate ?? new Date().toISOString().slice(0, 10),
        isNew: true,
      };
      setDrivers((prev) => [created, ...prev]);
      return created;
    },
    addTruck: (t) => {
      const created: Truck = {
        id: uid('t'),
        carrierId: t.carrierId ?? currentCarrierId,
        unit: t.unit ?? '000',
        make: t.make ?? '',
        model: t.model ?? '',
        year: t.year ?? new Date().getFullYear(),
        plate: t.plate ?? '',
        vin: t.vin ?? '',
        state: t.state ?? '',
        mc: t.mc,
        status: t.status ?? 'Available',
        ownership: t.ownership ?? 'company',
        owner: t.owner,
        operatorDriverId: t.operatorDriverId ?? null,
      };
      setTrucks((prev) => [created, ...prev]);
      return created;
    },
    addCarrier: (c) => {
      const created: Carrier = {
        id: uid('c'),
        name: (c.name ?? 'New Carrier').toUpperCase(),
        dot: c.dot ?? '',
        mc: c.mc ?? [],
        authority: c.authority ?? 'active',
        address: c.address,
        phone: c.phone,
      };
      setCarriers((prev) => [...prev, created]);
      return created;
    },
    addEmployee: (e) => {
      const created: Employee = {
        id: uid('e'),
        carrierId: e.carrierId ?? currentCarrierId,
        firstName: e.firstName ?? 'New',
        lastName: e.lastName ?? 'Employee',
        status: 'ACTIVE',
        nickname: e.nickname,
        phone: e.phone,
        email: e.email,
        shift: e.shift,
        role: e.role ?? 'dispatcher',
        kind: e.kind ?? 'employee',
      };
      setEmployees((prev) => [created, ...prev]);
      return created;
    },
    addTask: (t) => {
      const now = new Date().toISOString();
      const created: Task = {
        id: uid('tk'),
        carrierId: t.carrierId ?? currentCarrierId,
        title: t.title ?? 'New Task',
        status: t.status ?? 'TO DO',
        assignee: t.assignee,
        start: t.start,
        due: t.due,
        priority: t.priority,
        tags: t.tags ?? [],
        description: t.description ?? '',
        timeEstimate: t.timeEstimate,
        checklist: t.checklist ?? [],
        commentList: t.commentList ?? [],
        reviewer: t.reviewer,
        comments: 0,
        attachments: 0,
        createdBy: t.createdBy ?? currentUser,
        source: t.source,
        createdAt: now,
      };
      setTasks((prev) => [created, ...prev]);
      return created;
    },
    updateTask: (id, patch) => setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t))),
    assignTruck: (candidateId, truckId) => {
      setCandidates((prev) => prev.map((c) => (c.id === candidateId ? { ...c, assignedTruckId: truckId } : c)));
      setTrucks((prev) => prev.map((t) => (t.id === truckId ? { ...t, status: 'Assigned' } : t)));
    },
    assignTruckToCandidate: (candidateId, truckId) => {
      const prevTruckId = candidates.find((c) => c.id === candidateId)?.assignedTruckId ?? null;
      setCandidates((prev) => prev.map((c) => (c.id === candidateId ? { ...c, assignedTruckId: truckId } : c)));
      setTrucks((prev) => prev.map((t) => {
        if (truckId && t.id === truckId) return { ...t, status: 'Assigned' as const };
        if (t.id === prevTruckId && prevTruckId !== truckId) return { ...t, status: 'Available' as const };
        return t;
      }));
    },
    assignDriverToTruck: (truckId, driverId) => {
      setTrucks((prev) => prev.map((t) => {
        if (t.id === truckId) return { ...t, operatorDriverId: driverId, status: driverId ? 'Assigned' : 'Available' };
        if (driverId && t.operatorDriverId === driverId) return { ...t, operatorDriverId: null, status: 'Available' };
        return t;
      }));
      setDrivers((prev) => prev.map((d) => {
        if (driverId && d.id === driverId) return { ...d, assignedTruckId: truckId };
        if (d.assignedTruckId === truckId && d.id !== driverId) return { ...d, assignedTruckId: null };
        return d;
      }));
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}
