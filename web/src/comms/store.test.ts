import { describe, expect, it } from 'vitest';
import { fmtWhen, fmtClock } from './store';

const agoMinutes = (mins: number) => new Date(Date.now() - mins * 60000).toISOString();

describe('fmtWhen', () => {
  it('shows "now" for under a minute', () => {
    expect(fmtWhen(agoMinutes(0))).toBe('now');
  });

  it('shows minutes under an hour', () => {
    expect(fmtWhen(agoMinutes(5))).toBe('5m');
  });

  it('shows hours under a day', () => {
    expect(fmtWhen(agoMinutes(120))).toBe('2h');
  });

  it('shows days under a week', () => {
    expect(fmtWhen(agoMinutes(60 * 24 * 2))).toBe('2d');
  });

  it('falls back to a "Mon D" calendar label past a week', () => {
    const old = new Date('2023-03-15T12:00:00Z').toISOString();
    expect(fmtWhen(old)).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});

describe('fmtClock', () => {
  it('renders a 12-hour clock with am/pm', () => {
    // Timezone-independent assertion: just the shape, not the exact hour.
    expect(fmtClock(new Date().toISOString())).toMatch(/^\d{1,2}:\d{2} (am|pm)$/);
  });
});
