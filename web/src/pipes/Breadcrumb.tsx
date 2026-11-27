import React from 'react';
import { T, Icon } from '../tasks/lib';
import { PipeKey, PIPE_ORDER } from './stages';
import { PIPE_META } from './lifecycle';

const LABEL: Record<PipeKey, string> = { leads: 'Lead', hiring: 'Hiring', active: 'Active', inactive: 'Inactive' };

/** Lead → Hiring → Active → Inactive, current step highlighted. */
export function LifecycleBreadcrumb({ current, reached, stage, style }: { current: PipeKey; reached: PipeKey[]; stage?: string; style?: React.CSSProperties }) {
  return <nav aria-label="Driver lifecycle" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', ...style }}>
    {PIPE_ORDER.map((p, i) => {
      const on = p === current; const done = reached.includes(p) && !on; const m = PIPE_META[p];
      return <React.Fragment key={p}>
        {i > 0 && <Icon name="chevronRight" size={12} style={{ color: '#C7C7CC' }} />}
        <span aria-current={on ? 'step' : undefined} title={on ? `Currently in ${m.label}${stage ? ' · ' + stage : ''}` : done ? `Was in ${m.label}` : `Not yet in ${m.label}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 9px', borderRadius: 999, fontSize: 11.5, fontWeight: on ? 700 : 600, whiteSpace: 'nowrap',
            background: on ? m.color : done ? 'rgba(0,0,0,0.05)' : 'transparent', color: on ? '#fff' : done ? T.text : '#AEAEB2', border: on || done ? 'none' : '1px dashed rgba(0,0,0,0.14)' }}>
          {done && <Icon name="check" size={11} style={{ color: '#34C759' }} />}{LABEL[p]}{on && stage ? ` · ${stage}` : ''}
        </span>
      </React.Fragment>;
    })}
  </nav>;
}
