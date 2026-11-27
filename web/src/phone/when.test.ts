import { describe, expect, it } from 'vitest';
import { parseWhen, defaultFollowUp, describeWhen, isoDay } from './when';

// Wednesday, Nov 26 2025, 3:20 PM local time
const NOW = new Date(2025, 10, 26, 15, 20, 0);
const at = (y: number, mo: number, d: number, h = 10, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
const p = (s: string) => parseWhen(s, NOW)?.getTime() ?? null;

describe('parseWhen', () => {
  it('handles the spec examples', () => {
    expect(p('tomorrow 10am')).toBe(at(2025, 11, 27, 10));
    expect(p('friday 2pm')).toBe(at(2025, 11, 28, 14));
  });

  it('defaults a bare day to 10:00', () => {
    expect(p('tomorrow')).toBe(at(2025, 11, 27, 10));
    expect(p('Monday')).toBe(at(2025, 12, 1, 10));
    expect(p('next week')).toBe(at(2025, 12, 1, 10));
  });

  it('understands many time spellings', () => {
    expect(p('tomorrow at 9:30')).toBe(at(2025, 11, 27, 9, 30));
    expect(p('tomorrow 9:30 p.m.')).toBe(at(2025, 11, 27, 21, 30));
    expect(p('tmrw 14:00')).toBe(at(2025, 11, 27, 14));
    expect(p('tomorrow noon')).toBe(at(2025, 11, 27, 12));
    expect(p('tomorrow morning')).toBe(at(2025, 11, 27, 9));
    expect(p('fri at 3')).toBe(at(2025, 11, 28, 15));
    expect(p('friday 2')).toBe(at(2025, 11, 28, 14));
    expect(p('thurs 8am')).toBe(at(2025, 11, 27, 8));
  });

  it('resolves a time alone to the next occurrence', () => {
    expect(p('4:30pm')).toBe(at(2025, 11, 26, 16, 30)); // later today
    expect(p('9am')).toBe(at(2025, 11, 27, 9));         // already past → tomorrow
    expect(p('eod')).toBe(at(2025, 11, 26, 17));
    expect(p('this afternoon')).toBe(at(2025, 11, 27, 14)); // 2pm already passed
  });

  it('handles weekdays relative to today', () => {
    expect(p('wednesday 5pm')).toBe(at(2025, 11, 26, 17)); // today, still ahead
    expect(p('wednesday 9am')).toBe(at(2025, 12, 3, 9));  // today but past → next week
    expect(p('next wed')).toBe(at(2025, 12, 3, 10));
  });

  it('handles relative offsets', () => {
    expect(p('in 2 hours')).toBe(at(2025, 11, 26, 17, 20));
    expect(p('in 30 min')).toBe(at(2025, 11, 26, 15, 50));
    expect(p('in an hour')).toBe(at(2025, 11, 26, 16, 20));
    expect(p('in 3 days')).toBe(at(2025, 11, 29, 10));
    expect(p('2 weeks')).toBe(at(2025, 12, 10, 10));
  });

  it('handles explicit dates', () => {
    expect(p('11/28 3pm')).toBe(at(2025, 11, 28, 15));
    expect(p('12/1')).toBe(at(2025, 12, 1, 10));
    expect(p('2025-12-05 9:15am')).toBe(at(2025, 12, 5, 9, 15));
    expect(p('dec 3')).toBe(at(2025, 12, 3, 10));
    expect(p('3 dec 4pm')).toBe(at(2025, 12, 3, 16));
    expect(p('december 3rd')).toBe(at(2025, 12, 3, 10));
    expect(p('1/15')).toBe(at(2026, 1, 15, 10)); // past month/day → next year
  });

  it('returns null for nonsense or impossible dates', () => {
    expect(p('')).toBeNull();
    expect(p('whenever')).toBeNull();
    expect(p('2/30')).toBeNull();
    expect(p('banana 5pm')).toBeNull();
    expect(p('13pm')).toBeNull();
  });
});

describe('helpers', () => {
  it('default follow-up is tomorrow 10:00', () => {
    expect(defaultFollowUp(NOW).getTime()).toBe(at(2025, 11, 27, 10));
  });
  it('describes dates relative to now', () => {
    expect(describeWhen(new Date(at(2025, 11, 27, 10)), NOW)).toMatch(/^Tomorrow · 10:00\sAM$/);
    expect(describeWhen(new Date(at(2025, 11, 26, 16, 30)), NOW)).toMatch(/^Today · 4:30\sPM$/);
    expect(describeWhen(new Date(at(2025, 11, 28, 14)), NOW)).toMatch(/^Fri, Nov 28 · 2:00\sPM$/);
  });
  it('isoDay uses the local calendar date', () => {
    expect(isoDay(new Date(at(2025, 12, 1, 23, 59)))).toBe('2025-12-01');
  });
});
