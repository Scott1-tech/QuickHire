/* Natural-language follow-up time parser for the call wrap-up.

   Understands the phrases recruiters actually type: "tomorrow 10am",
   "friday 2pm", "in 2 hours", "mon 9:30", "next week", "11/28 3pm",
   "nov 28", "eod", "this afternoon". Pure and deterministic (pass `now`), so it
   is unit-tested. Returns null when the text can't be understood. */

export const DEFAULT_HOUR = 10; // a day without a time means 10:00 AM

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const WEEKDAY_ALIASES: Record<string, string> = { tues: 'tuesday', weds: 'wednesday', thur: 'thursday', thurs: 'thursday' };
function weekdayIndex(w: string): number {
  const s = WEEKDAY_ALIASES[w.toLowerCase()] || w.toLowerCase();
  if (s.length < 3) return -1;
  return WEEKDAYS.findIndex((d) => d.startsWith(s));
}
function monthIndex(m: string): number {
  const s = m.toLowerCase().replace(/\.$/, '');
  if (s.length < 3) return -1;
  return MONTHS.findIndex((x) => x.startsWith(s));
}
const atTime = (d: Date, h: number, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

type TimeOfDay = { h: number; m: number; explicit: boolean } | null;

/** Pull a time-of-day out of the text; returns the time and the text without it. */
function extractTime(text: string): { time: TimeOfDay; rest: string } {
  let t = text;
  const named: Record<string, [number, number]> = { noon: [12, 0], midday: [12, 0], midnight: [0, 0], morning: [9, 0], afternoon: [14, 0], evening: [18, 0], tonight: [19, 0], eod: [17, 0], 'end of day': [17, 0], lunch: [12, 0] };
  for (const [k, [h, m]] of Object.entries(named)) {
    const re = new RegExp(`\\b(?:this |in the |at )?${k}\\b`);
    if (re.test(t)) return { time: { h, m, explicit: true }, rest: t.replace(re, ' ') };
  }
  // 10am, 10 am, 10:30pm, 10.30 p.m.
  let m = t.match(/\b(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|a|p)\b/);
  if (m) {
    let h = +m[1]; const min = m[2] ? +m[2] : 0; const pm = m[3].startsWith('p');
    if (h >= 1 && h <= 12 && min < 60) { if (h === 12) h = 0; if (pm) h += 12; return { time: { h, m: min, explicit: true }, rest: t.replace(m[0], ' ') }; }
  }
  // 14:00, 9:30, at 3:15
  m = t.match(/\b(?:at\s+)?([01]?\d|2[0-3])[:h]([0-5]\d)\b/);
  if (m) {
    let h = +m[1]; const min = +m[2];
    if (h >= 1 && h <= 7 && !/^0/.test(m[1])) h += 12; // "at 3:30" during business hours means pm
    return { time: { h, m: min, explicit: true }, rest: t.replace(m[0], ' ') };
  }
  // "at 3" — bare hour needs the "at" so it isn't confused with a date
  m = t.match(/\bat\s+(\d{1,2})\b/);
  if (m) {
    let h = +m[1];
    if (h >= 1 && h <= 12) { if (h <= 7) h += 12; else if (h === 12) h = 12; return { time: { h, m: 0, explicit: true }, rest: t.replace(m[0], ' ') }; }
  }
  return { time: null, rest: t };
}

/** Parse `text` relative to `now`. Returns the follow-up Date or null. */
export function parseWhen(text: string, now: Date = new Date()): Date | null {
  const input = (text || '').toLowerCase().replace(/\b([ap])\.m\.?/g, '$1m').replace(/[,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!input) return null;

  // relative offsets: "in 2 hours", "in 30 min", "in a day", "2 days", "in 1 week"
  const rel = input.match(/^(?:in\s+)?(an?|\d+(?:\.\d+)?)\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|wk|wks|weeks?)(?:\s+from now)?$/);
  if (rel) {
    const n = rel[1].startsWith('a') ? 1 : parseFloat(rel[1]);
    const u = rel[2][0];
    const ms = u === 'm' ? 6e4 : u === 'h' ? 36e5 : u === 'd' ? 864e5 : 7 * 864e5;
    const d = new Date(now.getTime() + n * ms);
    if (u === 'd' || u === 'w') return atTime(d, DEFAULT_HOUR);
    d.setSeconds(0, 0);
    return d;
  }

  const extracted = extractTime(input);
  let time = extracted.time;
  let words = extracted.rest.replace(/\b(on|at|by|the|this|coming)\b/g, ' ').replace(/\s+/g, ' ').trim();
  // "friday 2" / "tomorrow 9": a bare trailing hour after a day word (not "nov 28")
  if (!time) {
    const bare = words.match(/^([a-z][a-z ]*?)\s+(\d{1,2})$/);
    if (bare && monthIndex(bare[1].split(' ').pop() || '') < 0 && +bare[2] >= 1 && +bare[2] <= 12) {
      const h = +bare[2];
      time = { h: h <= 7 ? h + 12 : h, m: 0, explicit: true };
      words = bare[1].trim();
    }
  }
  const withTime = (day: Date) => (time ? atTime(day, time.h, time.m) : atTime(day, DEFAULT_HOUR));

  if (!words) {
    if (!time) return null;
    // time only: today if still ahead, else tomorrow
    const today = atTime(now, time.h, time.m);
    return today.getTime() > now.getTime() ? today : addDays(today, 1);
  }
  if (/^(today|tonight|now)$/.test(words)) return time ? withTime(now) : (input.includes('tonight') ? atTime(now, 19) : roundUpHour(now));
  if (/^(tomorrow|tmrw|tmr|tom|tomorow)$/.test(words)) return withTime(addDays(now, 1));
  if (/^(day after tomorrow|overmorrow)$/.test(words)) return withTime(addDays(now, 2));
  if (/^next week$/.test(words)) { const d = addDays(now, ((8 - now.getDay()) % 7) || 7); return withTime(d); }
  if (/^(end of week|eow)$/.test(words)) { const d = addDays(now, (5 - now.getDay() + 7) % 7); return time ? withTime(d) : atTime(d, 16); }

  // weekday: "friday", "next fri", "mon"
  const wd = words.match(/^(next\s+)?([a-z]+)$/);
  if (wd) {
    const idx = weekdayIndex(wd[2]);
    if (idx >= 0) {
      let diff = (idx - now.getDay() + 7) % 7;
      const candidate = withTime(addDays(now, diff));
      if (diff === 0 && (wd[1] || candidate.getTime() <= now.getTime())) diff = 7;
      return withTime(addDays(now, diff));
    }
  }

  // explicit dates: 11/28, 11/28/2026, 2026-11-28, nov 28, 28 nov, november 28th
  let y = now.getFullYear(), mo = -1, da = -1, yearGiven = false;
  let m = words.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) { y = +m[1]; mo = +m[2] - 1; da = +m[3]; yearGiven = true; }
  if (!m && (m = words.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/))) { mo = +m[1] - 1; da = +m[2]; if (m[3]) { y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; yearGiven = true; } }
  if (!m && (m = words.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?$/))) { mo = monthIndex(m[1]); da = +m[2]; if (m[3]) { y = +m[3]; yearGiven = true; } }
  if (!m && (m = words.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?(?:\s+(\d{4}))?$/))) { mo = monthIndex(m[2]); da = +m[1]; if (m[3]) { y = +m[3]; yearGiven = true; } }
  if (mo >= 0 && mo < 12 && da >= 1 && da <= 31) {
    let d = new Date(y, mo, da);
    if (d.getMonth() !== mo) return null; // Feb 30 etc.
    d = withTime(d);
    // "11/3" typed in December means next year's November 3rd
    if (!yearGiven && d.getTime() < now.getTime() - 864e5) d = withTime(new Date(y + 1, mo, da));
    return d;
  }
  return null;
}

function roundUpHour(now: Date) { const d = new Date(now); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d; }

/** The default follow-up slot: tomorrow at 10:00. */
export function defaultFollowUp(now: Date = new Date()): Date { return atTime(addDays(now, 1), DEFAULT_HOUR); }

/** "Today · 4:30 PM", "Tomorrow · 10:00 AM", "Fri, Nov 28 · 2:00 PM". */
export function describeWhen(d: Date, now: Date = new Date()): string {
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  const diff = Math.round((dd.getTime() - day0.getTime()) / 864e5);
  const day = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  return `${day} · ${time}`;
}

/** Local calendar date "YYYY-MM-DD" (the Tasks workspace's due format). */
export function isoDay(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
