import { describe, expect, it } from 'vitest';
import { normalizePhone, phoneKey, samePhone, formatPhone, formatAsTyped, matchPhone, buildPhoneIndex, type PhoneRecord } from './number';

describe('normalizePhone', () => {
  it.each([
    ['(469) 555-0188', '+14695550188'],
    ['469-555-0188', '+14695550188'],
    ['469.555.0188', '+14695550188'],
    ['4695550188', '+14695550188'],
    ['1 469 555 0188', '+14695550188'],
    ['+1 469-555-0188', '+14695550188'],
    ['+14695550188', '+14695550188'],
    ['tel:+14695550188', '+14695550188'],
    ['  +1 (469) 555-0188  ', '+14695550188'],
    ['001 469 555 0188', '+14695550188'],
  ])('%s → %s', (input, e164) => {
    const n = normalizePhone(input);
    expect(n.e164).toBe(e164);
    expect(n.national).toBe('4695550188');
    expect(n.dialable).toBe(true);
  });

  it('keeps international numbers in E.164', () => {
    const n = normalizePhone('+44 20 7946 0958');
    expect(n.e164).toBe('+442079460958');
    expect(n.national).toBeNull();
    expect(normalizePhone('011 44 20 7946 0958').e164).toBe('+442079460958');
  });

  it('splits off extensions', () => {
    for (const s of ['469-555-0188 x12', '469-555-0188 ext. 12', '(469) 555-0188 #12', '+14695550188;ext=12']) {
      const n = normalizePhone(s);
      expect(n.e164).toBe('+14695550188');
      expect(n.ext).toBe('12');
    }
  });

  it('treats short digit strings as internal extensions, not phone numbers', () => {
    const n = normalizePhone('101');
    expect(n.e164).toBeNull();
    expect(n.dialable).toBe(true);
  });

  it('rejects garbage and partial numbers', () => {
    expect(normalizePhone('').dialable).toBe(false);
    expect(normalizePhone('call me').dialable).toBe(false);
    expect(normalizePhone('555-01').dialable).toBe(false);
    expect(normalizePhone(undefined).digits).toBe('');
    expect(normalizePhone(null).dialable).toBe(false);
  });
});

describe('samePhone / phoneKey', () => {
  it('matches across formats and country-code presence', () => {
    expect(samePhone('(555) 010-0101', '+1 555-010-0101')).toBe(true);
    expect(samePhone('5550100101', '+15550100101')).toBe(true);
    expect(samePhone('555.010.0101 x9', '1-555-010-0101')).toBe(true);
    expect(phoneKey('+1 (555) 010-0101')).toBe('5550100101');
  });
  it('does not match different numbers or empties', () => {
    expect(samePhone('(555) 010-0101', '(555) 010-0102')).toBe(false);
    expect(samePhone('', '')).toBe(false);
    expect(samePhone('+442079460958', '+12079460958')).toBe(false);
  });
});

describe('formatting', () => {
  it('formats NANP numbers for display', () => {
    expect(formatPhone('+14695550188')).toBe('(469) 555-0188');
    expect(formatPhone('469-555-0188 x7')).toBe('(469) 555-0188 ext. 7');
    expect(formatPhone('+442079460958')).toBe('+442079460958');
    expect(formatPhone('not a number')).toBe('not a number');
  });
  it('formats as you type', () => {
    expect(formatAsTyped('469')).toBe('469');
    expect(formatAsTyped('46955')).toBe('(469) 55');
    expect(formatAsTyped('4695550188')).toBe('(469) 555-0188');
    expect(formatAsTyped('14695550188')).toBe('1 (469) 555-0188');
    expect(formatAsTyped('+4420')).toBe('+4420');
  });
});

describe('matchPhone', () => {
  const recs: PhoneRecord[] = [
    { kind: 'lead', id: 'l1', name: 'Marcus Bell', phone: '+1 469-555-0188' },
    { kind: 'driver', id: 'd1', name: 'Robert Johnson', phone: '(555) 010-0101' },
    { kind: 'lead', id: 'l2', name: 'Robert J (old)', phone: '555-010-0101', archived: true },
    { kind: 'lead', id: 'l3', name: 'Robert Lead', phone: '+15550100101' },
    { kind: 'driver', id: 'd2', name: 'No Phone', phone: '' },
  ];

  it('finds records whatever the formatting, best match first', () => {
    const hits = matchPhone('5550100101', recs);
    expect(hits.map((h) => h.id)).toEqual(['d1', 'l3', 'l2']); // driver, active lead, archived lead
    expect(matchPhone('(469) 555 0188', recs)[0].id).toBe('l1');
  });

  it('gives identical results from the index (used at scale)', () => {
    const idx = buildPhoneIndex(recs);
    for (const q of ['5550100101', '+1 469 555 0188', '1-469-555-0188', '+15550100101', '(555) 010-0199']) {
      expect(matchPhone(q, idx).map((h) => h.id)).toEqual(matchPhone(q, recs).map((h) => h.id));
    }
  });

  it('returns nothing for unknown or too-short numbers', () => {
    expect(matchPhone('(214) 555-0000', recs)).toEqual([]);
    expect(matchPhone('0101', recs)).toEqual([]);
  });

  it('indexes 50k records quickly', () => {
    const many: PhoneRecord[] = Array.from({ length: 50000 }, (_, i) => ({ kind: 'lead', id: 'x' + i, name: 'L' + i, phone: `+1 214-${String(Math.floor(i / 10000) + 300)}-${String(i % 10000).padStart(4, '0')}` }));
    const t0 = Date.now();
    const idx = buildPhoneIndex(many);
    const hit = matchPhone('(214) 304-2345', idx);
    expect(hit[0]?.id).toBe('x42345');
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
