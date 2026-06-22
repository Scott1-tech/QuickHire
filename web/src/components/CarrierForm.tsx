import type { CarrierSection } from '@/lib/carrierApi';

/**
 * Renders the carrier requirements questionnaire from the server-provided
 * schema. Controlled — the parent owns the answers map. Used by the recruiter
 * to fill a profile in (or edit one) using the very same questions the carrier
 * sees on their public intake page.
 */
export default function CarrierForm({
  sections, value, onChange,
}: {
  sections: CarrierSection[];
  value: Record<string, string>;
  onChange: (id: string, v: string) => void;
}) {
  return (
    <div className="space-y-5">
      {sections.map((s, i) => (
        <section key={s.id} className="card p-5">
          <div className="mb-4 pb-3 border-b border-line/70">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary-light text-primary text-xs font-bold grid place-items-center">{i + 1}</span>
              <h3 className="text-[15px] font-bold text-ink">{s.title}</h3>
            </div>
            {s.intro && <p className="text-xs text-muted mt-1.5 ml-8">{s.intro}</p>}
          </div>
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3.5">
            {s.fields.map((f) => {
              const v = value[f.id] ?? '';
              const wide = f.type === 'area' ? 'sm:col-span-2' : '';
              return (
                <div key={f.id} className={wide}>
                  <label className="field-label">{f.label}</label>
                  {f.type === 'area' ? (
                    <textarea className="input" rows={2} placeholder={f.placeholder}
                      value={v} onChange={(e) => onChange(f.id, e.target.value)} />
                  ) : f.type === 'yesno' ? (
                    <select className="input" value={v} onChange={(e) => onChange(f.id, e.target.value)}>
                      <option value="">— Select —</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                      <option value="N/A">N/A</option>
                    </select>
                  ) : (
                    <input className="input" placeholder={f.placeholder}
                      value={v} onChange={(e) => onChange(f.id, e.target.value)} />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
