import { useState } from 'react';
import { useStore } from '@/store';
import Icon from '@/components/Icon';
import { stagePillClass } from '@/lib/pipeline';
import { STAGE_COLORS, type StageColor } from '@/types';

/** Full-access pipeline editor: add, rename, recolor, reorder, or remove the
 * board's hiring stages (columns). Changes apply to the whole Hiring board and
 * every candidate's pipeline view. */
export default function CustomizePipeline({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState<StageColor>('blue');

  const add = () => { if (name.trim()) { s.addStage(name.trim(), color); setName(''); } };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/50 animate-[fadeIn_.15s_ease]" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl shadow-pop border border-line w-[640px] max-w-full max-h-[88vh] flex flex-col overflow-hidden animate-[popIn_.18s_cubic-bezier(.16,1,.3,1)]">
        <header className="flex items-center gap-2 px-5 py-3 border-b border-line">
          <span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold bg-primary-light text-primary"><Icon name="clipboardCheck" size={14} /> Customize Pipeline</span>
          <button onClick={onClose} className="ml-auto w-8 h-8 grid place-items-center rounded-lg text-muted hover:bg-[var(--surface-hover)]"><Icon name="close" size={18} /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
          <p className="text-[13px] text-muted mb-4">Add, rename, recolor, reorder, or remove the stages on your hiring board. Use ◄ ► to change the column order. Candidates in a removed stage move to the first stage.</p>

          <div className="card divide-y divide-line/60 mb-4">
            {s.pipeline.map((stage, i) => (
              <div key={stage.id} className="flex items-center gap-2 px-3 py-2.5">
                <span className={`pill ${stagePillClass(stage.color)} shrink-0`}>{i + 1}</span>
                <input value={stage.name} onChange={(e) => s.renameStage(stage.id, e.target.value)}
                  className="input flex-1 !py-1.5 text-[13.5px]" />
                <ColorPicker value={stage.color} onChange={(c) => s.setStageColor(stage.id, c)} />
                <button onClick={() => s.reorderStage(stage.id, 'left')} disabled={i === 0}
                  className="text-muted hover:text-primary px-1 disabled:opacity-25" title="Move left">◄</button>
                <button onClick={() => s.reorderStage(stage.id, 'right')} disabled={i === s.pipeline.length - 1}
                  className="text-muted hover:text-primary px-1 disabled:opacity-25" title="Move right">►</button>
                <button onClick={() => s.removeStage(stage.id)} disabled={s.pipeline.length <= 1}
                  className="text-muted hover:text-danger px-1.5 text-lg leading-none disabled:opacity-25" title="Remove stage">×</button>
              </div>
            ))}
          </div>

          <div className="card p-3">
            <div className="text-[12px] font-bold text-muted uppercase mb-2">Add a stage</div>
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
                placeholder="Stage name, e.g. Interview" className="input flex-1" />
              <ColorPicker value={color} onChange={setColor} />
              <button onClick={add} className="btn-primary">Add</button>
            </div>
          </div>
        </div>

        <footer className="border-t border-line px-5 py-3 bg-[var(--surface-hover)] flex items-center">
          <button onClick={() => { if (confirm('Reset the pipeline to the default 5 stages?')) s.resetPipeline(); }}
            className="btn-ghost text-[13px]">Reset to default</button>
          <button onClick={onClose} className="btn-primary ml-auto">Done</button>
        </footer>
      </div>
    </div>
  );
}

/** A compact swatch row for picking a stage colour. */
function ColorPicker({ value, onChange }: { value: StageColor; onChange: (c: StageColor) => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {STAGE_COLORS.map((c) => (
        <button key={c} onClick={() => onChange(c)} title={c}
          className={`w-4 h-4 rounded-full pill ${stagePillClass(c)} ${value === c ? 'ring-2 ring-offset-1 ring-primary' : ''}`} />
      ))}
    </div>
  );
}
