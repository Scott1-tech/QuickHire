import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Carrier, Candidate, Driver, Truck, Role, Stage } from '@/types';
import { CARRIERS, CANDIDATES, DRIVERS, TRUCKS } from '@/data/mock';

interface Store {
  role: Role;
  setRole: (r: Role) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  carriers: Carrier[];
  currentCarrierId: string;
  setCurrentCarrierId: (id: string) => void;
  currentCarrier: Carrier;
  // scoped collections
  candidates: Candidate[];
  drivers: Driver[];
  trucks: Truck[];
  // mutations
  moveCandidate: (id: string, stage: Stage) => void;
  addCandidate: (c: Partial<Candidate>) => Candidate;
  assignTruck: (candidateId: string, truckId: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('Super Admin');
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
  );
  const [currentCarrierId, setCurrentCarrierId] = useState<string>(CARRIERS[0].id);

  // mutable mock collections
  const [candidates, setCandidates] = useState<Candidate[]>(CANDIDATES);
  const [drivers] = useState<Driver[]>(DRIVERS);
  const [trucks, setTrucks] = useState<Truck[]>(TRUCKS);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const currentCarrier = useMemo(
    () => CARRIERS.find((c) => c.id === currentCarrierId) ?? CARRIERS[0],
    [currentCarrierId],
  );

  const value: Store = {
    role,
    setRole,
    theme,
    toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    carriers: CARRIERS,
    currentCarrierId,
    setCurrentCarrierId,
    currentCarrier,
    candidates: candidates.filter((c) => c.carrierId === currentCarrierId),
    drivers: drivers.filter((d) => d.carrierId === currentCarrierId),
    trucks: trucks.filter((t) => t.carrierId === currentCarrierId),
    moveCandidate: (id, stage) =>
      setCandidates((prev) =>
        prev.map((c) => (c.id === id ? { ...c, stage, stageEnteredAt: new Date().toISOString() } : c)),
      ),
    addCandidate: (c) => {
      const created: Candidate = {
        id: 'p' + Date.now(),
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
      setCandidates((prev) => [...prev, created]);
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
