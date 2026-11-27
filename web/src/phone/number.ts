/* Phone number normalisation + matching for in-app calling.

   Recruiting data arrives in every format imaginable ("(469) 555-0188",
   "+1 469-555-0188", "469.555.0188 x12", "tel:+14695550188"). Everything here is
   pure so it can be unit-tested and reused by the dialer, screen pop and the
   click-to-call links. North American numbers are the default region; any
   number written with a leading "+" or "00" is treated as international. */

export type NormalizedPhone = {
  /** Raw input, trimmed. */
  raw: string;
  /** All digits of the number itself (extension removed). */
  digits: string;
  /** E.164 form ("+14695550188") when the number is complete, else null. */
  e164: string | null;
  /** Ten-digit NANP national number when this is a US/CA number, else null. */
  national: string | null;
  /** Extension digits, if the input carried one ("x12", "ext. 12"). */
  ext: string;
  /** True when the string can be dialed: a full number or a short internal extension. */
  dialable: boolean;
};

const EXT_RE = /\s*(?:;\s*ext=|ext\.?|extension|x|#)\s*(\d{1,6})\s*$/i;

/** Normalise any human-entered phone string. Never throws. */
export function normalizePhone(input: unknown): NormalizedPhone {
  let raw = typeof input === 'string' ? input.trim() : typeof input === 'number' ? String(input) : '';
  raw = raw.replace(/^tel:/i, '').replace(/^callto:/i, '');
  let body = raw;
  let ext = '';
  const m = body.match(EXT_RE);
  // Only treat a trailing "x123" as an extension when a full number precedes it.
  if (m && body.slice(0, m.index).replace(/\D/g, '').length >= 7) { ext = m[1]; body = body.slice(0, m.index); }
  const plus = /^\s*\+/.test(body);
  let digits = body.replace(/\D/g, '');
  let intl = plus;
  if (!plus && digits.startsWith('00') && digits.length > 9) { digits = digits.slice(2); intl = true; }
  if (!plus && digits.startsWith('011') && digits.length > 10) { digits = digits.slice(3); intl = true; }

  let e164: string | null = null;
  let national: string | null = null;
  if (intl) {
    if (digits.length >= 8 && digits.length <= 15) e164 = '+' + digits;
    if (digits.length === 11 && digits.startsWith('1')) national = digits.slice(1);
  } else if (digits.length === 10) {
    national = digits; e164 = '+1' + digits;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    national = digits.slice(1); e164 = '+' + digits;
  } else if (digits.length > 11 && digits.length <= 15) {
    e164 = '+' + digits; // pasted international number without the "+"
  }
  const shortExt = !intl && digits.length >= 2 && digits.length <= 6 && digits === body.replace(/\s/g, '');
  return { raw, digits, e164, national, ext, dialable: !!e164 || shortExt };
}

/** The key two numbers are compared on: the NANP ten digits, else all digits. */
export function phoneKey(input: unknown): string {
  const n = normalizePhone(input);
  if (n.national) return n.national;
  return n.digits.length >= 7 ? n.digits : '';
}

/** True when two strings refer to the same phone line, regardless of formatting. */
export function samePhone(a: unknown, b: unknown): boolean {
  const na = normalizePhone(a), nb = normalizePhone(b);
  if (!na.digits || !nb.digits) return false;
  // Two complete numbers: exact comparison (+44 20… is not +1 20…).
  if (na.e164 && nb.e164) return na.e164 === nb.e164;
  const ka = phoneKey(a), kb = phoneKey(b);
  if (ka && kb && ka === kb) return true;
  // One side stored without its country code: identical last ten digits.
  if (na.digits.length >= 10 && nb.digits.length >= 10) return na.digits.slice(-10) === nb.digits.slice(-10);
  return false;
}

/** Friendly display: "(469) 555-0188" for NANP numbers, E.164 ("+442079460958")
    for other countries (grouping rules differ per country), raw text otherwise. */
export function formatPhone(input: unknown): string {
  const n = normalizePhone(input);
  if (!n.digits) return n.raw;
  const out = n.national ? `(${n.national.slice(0, 3)}) ${n.national.slice(3, 6)}-${n.national.slice(6)}` : n.e164 || n.raw;
  return n.ext ? `${out} ext. ${n.ext}` : out;
}

/** Live formatting for the dialer input: keeps partial numbers readable. */
export function formatAsTyped(input: string): string {
  const s = input.replace(/[^\d+*#]/g, '');
  if (s.startsWith('+') || /[*#]/.test(s)) return s;
  const d = s.startsWith('1') && s.length > 1 ? s.slice(1) : s;
  const lead = s.startsWith('1') && s.length > 1 ? '1 ' : '';
  if (d.length <= 3) return lead + d;
  if (d.length <= 6) return `${lead}(${d.slice(0, 3)}) ${d.slice(3)}`;
  if (d.length <= 10) return `${lead}(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return s;
}

/* ───────────────────────── matching ───────────────────────── */
export type PhoneRecord = {
  kind: 'lead' | 'driver';
  id: string;
  name: string;
  phone: string;
  archived?: boolean;
};

export type PhoneIndex = Map<string, PhoneRecord[]>;

/** Index records by phone key (plus last-10 digits) for O(1) lookups at scale. */
export function buildPhoneIndex(records: PhoneRecord[]): PhoneIndex {
  const idx: PhoneIndex = new Map();
  const put = (k: string, r: PhoneRecord) => { if (!k) return; const arr = idx.get(k); if (arr) { if (!arr.includes(r)) arr.push(r); } else idx.set(k, [r]); };
  for (const r of records) {
    if (!r || !r.phone) continue;
    const n = normalizePhone(r.phone);
    put(phoneKey(r.phone), r);
    if (n.digits.length >= 10) put('t10:' + n.digits.slice(-10), r);
  }
  return idx;
}

const rank = (r: PhoneRecord) => (r.archived ? 2 : 0) + (r.kind === 'driver' ? 0 : 1);

/** All records whose phone matches `phone`, best first: active before archived,
    hiring drivers before recruiting leads (a hired lead becomes a driver). */
export function matchPhone(phone: unknown, source: PhoneRecord[] | PhoneIndex): PhoneRecord[] {
  const n = normalizePhone(phone);
  if (n.digits.length < 7) return [];
  let hits: PhoneRecord[];
  if (source instanceof Map) {
    const set = new Set<PhoneRecord>();
    (source.get(phoneKey(phone)) || []).forEach((r) => set.add(r));
    if (n.digits.length >= 10) (source.get('t10:' + n.digits.slice(-10)) || []).forEach((r) => set.add(r));
    hits = [...set].filter((r) => samePhone(r.phone, phone)); // index narrows, samePhone decides
  } else {
    hits = source.filter((r) => r && r.phone && samePhone(r.phone, phone));
  }
  return hits.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r);
}
