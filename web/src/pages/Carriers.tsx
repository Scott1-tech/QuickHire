import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { PageHeader, Pill } from '@/ui';
import { DRIVERS, CANDIDATES, TRUCKS } from '@/data/mock';

export default function Carriers() {
  const s = useStore();
  const nav = useNavigate();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <>
      <PageHeader crumbs={[{ label: 'Carriers' }]}
        actions={<button onClick={() => setShowAdd(true)} className="btn-primary">＋ Add Carrier</button>} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {s.carriers.map((c) => {
            const drivers = DRIVERS.filter((d) => d.carrierId === c.id).length;
            const trucks = TRUCKS.filter((t) => t.carrierId === c.id).length;
            const cands = CANDIDATES.filter((x) => x.carrierId === c.id).length;
            return (
              <div key={c.id} className="card p-5 hover:shadow-card transition cursor-pointer"
                onClick={() => { s.setCurrentCarrierId(c.id); nav(`/carriers/${c.id}`); }}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[15px] font-extrabold text-ink uppercase">{c.name}</div>
                    <div className="text-xs text-muted mt-1">USDOT {c.dot} · {c.mc.join(', ')}</div>
                  </div>
                  <Pill kind={c.authority === 'active' ? 'active' : 'pending'}>{c.authority}</Pill>
                </div>
                <div className="flex gap-4 mt-4 text-center">
                  <div><div className="text-lg font-bold text-ink">{drivers}</div><div className="text-[11px] text-muted">Drivers</div></div>
                  <div><div className="text-lg font-bold text-ink">{trucks}</div><div className="text-[11px] text-muted">Trucks</div></div>
                  <div><div className="text-lg font-bold text-ink">{cands}</div><div className="text-[11px] text-muted">Candidates</div></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showAdd && <AddCarrier onClose={() => setShowAdd(false)} />}
    </>
  );
}

function AddCarrier({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="card p-6 w-[440px] max-w-full shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-extrabold text-ink mb-4">Add Carrier</div>
        {['Company Name', 'USDOT Number', 'MC Number', 'Address', 'Phone'].map((f) => (
          <div key={f} className="mb-3"><label className="field-label">{f}</label><input className="input" /></div>
        ))}
        <div className="mb-1"><label className="field-label">Authority Status</label>
          <select className="input"><option>active</option><option>pending</option><option>inactive</option></select></div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-primary flex-1">Create Carrier</button>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
        <p className="text-[11px] text-muted mt-3">// TODO: connect to API — POST /carriers</p>
      </div>
    </div>
  );
}
