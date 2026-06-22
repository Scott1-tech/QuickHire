import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Carrier, Candidate, Driver, Truck, Employee, Role, Stage } from '@/types';
import { CARRIERS, CANDIDATES, DRIVERS, TRUCKS, EMPLOYEES } from '@/data/mock';

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
  // full collections (global views like the dashboard)
  allCandidates: Candidate[];
  allDrivers: Driver[];
  allTrucks: Truck[];
  allEmployees: Employee[];
  // mutations
  moveCandidate: (id: string, stage: Stage) => void;
  addCandidate: (c: Partial<Candidate>) => Candidate;
  addDriver: (d: Partial<Driver>) => Driver;
  addTruck: (t: Partial<Truck>) => Truck;
  addCarrier: (c: Partial<Carrier>) => Carrier;
  addEmployee: (e: Partial<Employee>) => Employee;
  assignTruck: (candidateId: string, truckId: string) => void;
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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

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
    allCandidates: candidates,
    allDrivers: drivers,
    allTrucks: trucks,
    allEmployees: employees,
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
    assignTruck: (candidateId, truckId) => {
      setCandidates((prev) => prev.map((c) => (c.id === candidateId ? { ...c, assignedTruckId: truckId } : c)));
      setTrucks((prev) => prev.map((t) => (t.id === truckId ? { ...t, status: 'Assigned' } : t)));
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}
