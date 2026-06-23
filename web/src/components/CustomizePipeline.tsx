import { useState } from 'react';
import { useStore } from '@/store';
import Icon from '@/components/Icon';
import type { ChecklistStep } from '@/types';

const GROUPS: ChecklistStep['group'][] = ['Compliance & Eligibility', 'Risk Screening', 'Health & Safety', 'Employment Setup'];

/** Full-access pipeline editor: reorder, add, or remove the hiring checklist
 * steps. Changes apply to every candidate's pipeline. */
export default function CustomizePipeline({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState('');
  const [group, setGroup] = useState<ChecklistStep['group']>('Compliance & Eligibility');

  const add = () => { if (name.trim()) { s.addChecklistStep({ name: name.trim(), group }); setName(''); } };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/50 animate-[fadeIn_.15s_ease]" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl shadow-pop border border-line w-[640px] max-w-full max-h-[88vh] flex flex-col overflow-hidden animate-[popIn_.18s_cubic-bezier(.16,1,.3,1)]">
        <header className="flex items-center gap-2 px-5 py-3 border-b border-line">
          <span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold bg-primary-light text-primary"><Icon name="clipboardCheck" size={14} /> Customize Pipeline</span>
          <button onClick={onClose} className="ml-auto w-8 h-8 grid place-items-center rounded-lg text-muted hover:bg-[var(--surface-hover)]"><Icon name="close" size={18} /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
          <p className="text-[13px] text-muted mb-4">Reorder, add, or remove the hiring checklist steps. Changes apply to every candidate's pipeline. Use ▲ ▼ to order steps within a section.</p>

          {GROUPS.map((g) => {
            const items = s.checklistTemplate.filter((x) => x.group === g);
            return (
              <div key={g} className="mb-4">
                <div className="text-[12px] font-bold text-muted uppercase mb-2">{g}</div>
                <div className="card divide-y divide-line/60">
                  {items.map((step, i) => (
                    <div key={step.id} className="flex items-center gap-1 px-3 py-2">
                      <span className="text-[13.5px] text-ink flex-1">{step.name}</span>
                      <button onClick={() => s.reorderChecklist(step.id, 'up')} disabled={i === 0}
                        className="text-muted hover:text-primary px-1.5 disabled:opacity-25" title="Move up">▲</button>
                      <button onClick={() => s.reorderChecklist(step.id, 'down')} disabled={i === items.length - 1}
                        className="text-muted hover:text-primary px-1.5 disabled:opacity-25" title="Move down">▼</button>
                      <button onClick={() => s.removeChecklistStep(step.id)} className="text-muted hover:text-danger px-1.5 text-lg leading-none" title="Remove step">×</button>
                    </div>
                  ))}
                  {items.length === 0 && <div className="px-3 py-2 text-[12px] text-muted">No steps in this section.</div>}
                </div>
              </div>
            );
          })}

          <div className="card p-3 mt-2">
            <div className="text-[12px] font-bold text-muted uppercase mb-2">Add a step</div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
                placeholder="Step name, e.g. Reference Check" className="input flex-1" />
              <select value={group} onChange={(e) => setGroup(e.target.value as ChecklistStep['group'])} className="input sm:w-52">
                {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <button onClick={add} className="btn-primary">Add</button>
            </div>
          </div>
        </div>

        <footer className="border-t border-line px-5 py-3 bg-[var(--surface-hover)]">
          <button onClick={onClose} className="btn-primary">Done</button>
        </footer>
      </div>
    </div>
  );
}
