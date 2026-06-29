import React from 'react';
import { Hover } from '../lib/dc';

/* ============================ Design tokens ============================ */
export const T = {
  bg: '#F5F5F7',
  panel: '#FFFFFF',
  border: 'rgba(0,0,0,0.07)',
  hair: 'rgba(0,0,0,0.06)',
  primary: '#007AFF',
  primaryHover: '#0066D6',
  text: '#1D1D1F',
  muted: '#6E6E73',
  faint: '#8E8E93',
  segBg: '#F2F2F7',
  hover: 'rgba(0,0,0,0.025)',
};

/* ============================ Status / priority / source ============================ */
export const STATUS: Record<string, any> = {
  todo: { key: 'todo', label: 'To Do', bg: '#F2F2F7', text: '#6E6E73', dot: '#8E8E93' },
  inprogress: { key: 'inprogress', label: 'In Progress', bg: 'rgba(0,122,255,0.12)', text: '#0066CC', dot: '#007AFF' },
  waiting: { key: 'waiting', label: 'Waiting', bg: 'rgba(255,159,10,0.14)', text: '#A05A00', dot: '#FF9F0A' },
  review: { key: 'review', label: 'Review Needed', bg: 'rgba(88,86,214,0.12)', text: '#3F3BB8', dot: '#5856D6' },
  blocked: { key: 'blocked', label: 'Blocked', bg: 'rgba(255,59,48,0.12)', text: '#C62820', dot: '#FF3B30' },
  complete: { key: 'complete', label: 'Complete', bg: 'rgba(52,199,89,0.12)', text: '#248A3D', dot: '#34C759' },
};
export const STATUS_ORDER = ['todo', 'inprogress', 'waiting', 'review', 'blocked', 'complete'];

export const PRIORITY: Record<string, any> = {
  urgent: { key: 'urgent', label: 'Urgent', color: '#FF3B30' },
  high: { key: 'high', label: 'High', color: '#FF9F0A' },
  normal: { key: 'normal', label: 'Normal', color: '#007AFF' },
  low: { key: 'low', label: 'Low', color: '#8E8E93' },
};
export const PRIORITY_ORDER = ['urgent', 'high', 'normal', 'low'];

export const SOURCE: Record<string, any> = {
  manual: { label: 'Manual' }, automation: { label: 'Automation' }, candidate: { label: 'Candidate' },
  compliance: { label: 'Compliance' }, docusign: { label: 'DocuSign' }, message: { label: 'Message' },
  carrier: { label: 'Carrier' }, truck: { label: 'Truck' }, pev: { label: 'Employment Verification' },
  integration: { label: 'Integration' },
};

export const RELATED_ICON: Record<string, string> = {
  candidate: 'user', driver: 'truck', carrier: 'building', truck: 'truck', document: 'fileText', docusign: 'sign',
};

// Palette for custom column colors.
export const PALETTE = ['#8E8E93', '#007AFF', '#FF9F0A', '#5856D6', '#34C759', '#FF3B30', '#0FB5AE', '#AF52DE', '#FF2D55', '#A05A00'];

/* ---- status registry: lets the configurable Board columns drive status
   labels/colors across the whole workspace without prop-threading ---- */
let _statusReg: ((k: string) => any) | null = null;
export function setStatusRegistry(fn: (k: string) => any) { _statusReg = fn; }
let _colsReg: any[] | null = null;
export function setColumnsRegistry(arr: any[]) { _colsReg = arr; }
export function columnList(): any[] { return _colsReg || STATUS_ORDER.map((k) => ({ key: k, label: STATUS[k].label, color: STATUS[k].dot })); }
export function columnKeys(): string[] { return columnList().map((c) => c.key); }
export function hexToRgba(hex: string, a: number) { const h = hex.replace('#', ''); const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h; const n = parseInt(f, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
export function deriveMeta(key: string, label: string, color: string) { return { key, label, dot: color, bg: hexToRgba(color, 0.13), text: color }; }
export function metaOf(key: string): any { if (_statusReg) { const m = _statusReg(key); if (m) return m; } return STATUS[key] || { key, label: key, bg: '#F2F2F7', text: '#6E6E73', dot: '#8E8E93' }; }

/* ============================ Helpers ============================ */
const AVATAR_COLORS = ['#007AFF', '#5856D6', '#34C759', '#FF9F0A', '#AF52DE', '#0FB5AE', '#FF2D55'];
export function avatarColor(name = '') { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }
export function initials(name = '') { return name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase(); }

export const startOfDay = (d: Date | string) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d: Date | string, n: number) => { const x = startOfDay(d); x.setDate(x.getDate() + n); return x; };
export const iso = (d: Date | string) => { const x = startOfDay(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
export const parseISO = (s?: string | null) => (s ? startOfDay(new Date(s + 'T00:00:00')) : null);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const fmtDate = (s?: string | null) => { const d = parseISO(s || undefined); return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}` : ''; };

export function dueGroup(s?: string | null): string {
  const d = parseISO(s || undefined); if (!d) return 'none';
  const diff = Math.round((d.getTime() - startOfDay(new Date()).getTime()) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 7) return 'week';
  return 'later';
}
export function dueInfo(task: any) {
  const g = dueGroup(task.due);
  const overdue = g === 'overdue' && task.status !== 'complete';
  let label = fmtDate(task.due);
  if (g === 'today') label = 'Today'; else if (g === 'tomorrow') label = 'Tomorrow';
  else if (g === 'week') { const d = parseISO(task.due)!; label = WEEKDAYS[d.getDay()]; }
  else if (g === 'none') label = '';
  const color = overdue ? '#C62820' : g === 'today' ? '#A05A00' : '#6E6E73';
  return { group: g, label, color, overdue };
}

/* ============================ Icons (lucide paths) ============================ */
const ICONS: Record<string, string> = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="M20 6 9 17l-4-4"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 18.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  sign: '<path d="M3 17c3.5 0 4-6 7.5-6S14 17 17.5 17"/><path d="M19 21H5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  columns: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  gantt: '<path d="M8 6h10"/><path d="M6 12h9"/><path d="M11 18h7"/><path d="M3 4v16"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  circle: '<circle cx="12" cy="12" r="10"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  listChecks: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/>',
  snooze: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 1"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2 2 0 0 0 2.828 0l6.58-6.58a2 2 0 0 0 0-2.828z"/><circle cx="7.5" cy="7.5" r=".75" fill="currentColor"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  grip: '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  mapPin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  layout: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  atSign: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
  thumbsUp: '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
  cornerDownRight: '<polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  phoneMissed: '<line x1="22" x2="16" y1="2" y2="8"/><line x1="16" x2="22" y1="2" y2="8"/><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  phoneIncoming: '<polyline points="16 2 16 8 22 8"/><line x1="22" x2="16" y1="2" y2="8"/><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  voicemail: '<circle cx="6" cy="12" r="4"/><circle cx="18" cy="12" r="4"/><line x1="6" x2="18" y1="16" y2="16"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  externalLink: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
};

/* ============================ Truck status ============================ */
export const TRUCK_STATUS: Record<string, any> = {
  Available: { label: 'Available', bg: 'rgba(52,199,89,0.12)', text: '#248A3D', dot: '#34C759' },
  Assigned: { label: 'Assigned', bg: 'rgba(0,122,255,0.12)', text: '#0066CC', dot: '#007AFF' },
  'In-Transit': { label: 'In-Transit', bg: 'rgba(0,122,255,0.12)', text: '#0066CC', dot: '#007AFF' },
  Shop: { label: 'In Shop', bg: 'rgba(255,159,10,0.14)', text: '#A05A00', dot: '#FF9F0A' },
  'Out of Service': { label: 'Out of Service', bg: 'rgba(255,59,48,0.12)', text: '#C62820', dot: '#FF3B30' },
};
export function TruckStatusChip({ status }: { status: string }) {
  const s = TRUCK_STATUS[status] || TRUCK_STATUS.Available;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 22, padding: '0 9px', borderRadius: 999, background: s.bg, color: s.text, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}><span style={{ width: 6, height: 6, borderRadius: 999, background: s.dot, flex: 'none' }} />{s.label}</span>;
}

export function Icon({ name, size = 18, style }: { name: string; size?: number; style?: React.CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style} dangerouslySetInnerHTML={{ __html: ICONS[name] || '' }} />;
}

/* ============================ Primitive components ============================ */
export function Btn({ variant = 'secondary', icon, children, onClick, style, ...rest }: any) {
  const base: any = { primary: { background: T.primary, color: '#fff', border: 'none' }, secondary: { background: '#fff', color: T.text, border: '1px solid rgba(0,0,0,0.12)' }, ghost: { background: 'transparent', color: T.muted, border: 'none' }, danger: { background: 'transparent', color: '#C62820', border: 'none' } };
  const hov: any = { primary: { background: T.primaryHover }, secondary: { background: 'rgba(0,0,0,0.04)' }, ghost: { background: 'rgba(0,0,0,0.05)' }, danger: { background: 'rgba(255,59,48,0.06)' } };
  return <Hover as="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', ...base[variant], ...style }} hover={hov[variant]} {...rest}>{icon && <Icon name={icon} size={16} />}{children}</Hover>;
}

export function IconBtn({ name, size = 34, icon = 16, title, onClick, active }: any) {
  return <Hover as="button" title={title} onClick={onClick} style={{ width: size, height: size, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: 'none', background: active ? 'rgba(0,122,255,0.10)' : 'transparent', color: active ? '#007AFF' : T.muted, cursor: 'pointer' }} hover={{ background: active ? 'rgba(0,122,255,0.14)' : 'rgba(0,0,0,0.05)' }}><Icon name={name} size={icon} /></Hover>;
}

export function StatusChip({ status }: { status: string }) {
  const s = metaOf(status);
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', borderRadius: 999, background: s.bg, color: s.text, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}><span style={{ width: 7, height: 7, borderRadius: 999, background: s.dot, flex: 'none' }} />{s.label}</span>;
}

// Pie-style status ring: empty → quarter → half → three-quarter → full, by column.
export function StatusRing({ fill = 0, color = '#8E8E93', size = 18 }: { fill?: number; color?: string; size?: number }) {
  const r = size / 2, ri = r - 3;
  let wedge: any = null;
  if (fill >= 1) wedge = <circle cx={r} cy={r} r={ri} fill={color} />;
  else if (fill > 0) { const a = fill * 2 * Math.PI; const x = r + ri * Math.sin(a); const y = r - ri * Math.cos(a); const large = fill > 0.5 ? 1 : 0; wedge = <path d={`M ${r} ${r} L ${r} ${r - ri} A ${ri} ${ri} 0 ${large} 1 ${x} ${y} Z`} fill={color} />; }
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: 'none' }}><circle cx={r} cy={r} r={r - 1.25} fill="none" stroke={color} strokeOpacity={0.3} strokeWidth={2} />{wedge}</svg>;
}

export function PriorityFlag({ priority, withLabel }: { priority: string; withLabel?: boolean }) {
  const p = PRIORITY[priority];
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: p.color, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}><Icon name="flag" size={14} />{withLabel ? p.label : null}</span>;
}

export function SourceChip({ source }: { source: string }) {
  const s = SOURCE[source]; if (!s) return null;
  return <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 999, background: '#F2F2F7', color: T.muted, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.label}</span>;
}

export function TagChip({ label }: { label: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 999, background: 'rgba(0,0,0,0.04)', color: T.muted, fontSize: 11.5, fontWeight: 600, border: '1px solid rgba(0,0,0,0.06)', whiteSpace: 'nowrap' }}>{label}</span>;
}

export function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  return <span title={name} style={{ width: size, height: size, borderRadius: 999, background: avatarColor(name), color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.42), fontWeight: 650, flex: 'none' }}>{initials(name)}</span>;
}

export function CheckCircle({ done, onClick, size = 18 }: any) {
  return <button onClick={(e: any) => { e.stopPropagation(); onClick && onClick(e); }} title={done ? 'Mark incomplete' : 'Mark complete'} style={{ width: size, height: size, flex: 'none', borderRadius: 999, border: `1.5px solid ${done ? '#34C759' : 'rgba(0,0,0,0.25)'}`, background: done ? '#34C759' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, color: '#fff' }}>{done && <Icon name="check" size={Math.round(size * 0.66)} />}</button>;
}

export function Toggle({ on, onChange }: any) {
  return <button onClick={onChange} style={{ width: 40, height: 24, flex: 'none', borderRadius: 999, border: 'none', cursor: 'pointer', padding: 2, background: on ? '#34C759' : '#E5E5EA', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', transition: 'background .2s' }}><span style={{ width: 20, height: 20, borderRadius: 999, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} /></button>;
}

export function SegTabs({ tabs, value, onChange }: any) {
  return <div style={{ display: 'inline-flex', gap: 2, padding: 3, background: T.segBg, borderRadius: 10 }}>
    {tabs.map((t: any) => {
      const on = t.key === value;
      return <button key={t.key} onClick={() => onChange(t.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 30, padding: '0 13px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer', background: on ? '#fff' : 'transparent', color: on ? T.text : T.muted, boxShadow: on ? '0 1px 2px rgba(0,0,0,0.10)' : 'none' }}>{t.icon && <Icon name={t.icon} size={15} />}{t.label}</button>;
    })}
  </div>;
}

export const menuItemStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', height: 34, padding: '0 10px', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: T.text };

export function MenuItem({ icon, label, onClick, danger, trailing }: any) {
  return <Hover as="button" onClick={onClick} style={{ ...menuItemStyle, color: danger ? '#C62820' : T.text }} hover={{ background: danger ? 'rgba(255,59,48,0.08)' : 'rgba(0,0,0,0.05)' }}>{icon && <Icon name={icon} size={15} style={{ color: danger ? '#C62820' : T.muted }} />}<span style={{ flex: 1 }}>{label}</span>{trailing}</Hover>;
}

export function Menu({ trigger, children, align = 'left', width = 200 }: any) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: any) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
    <span onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} style={{ display: 'inline-flex' }}>{trigger}</span>
    {open && <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 6px)', [align]: 0, zIndex: 60, minWidth: width, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.14)', padding: 6, maxHeight: 320, overflowY: 'auto' } as any}>{typeof children === 'function' ? children(() => setOpen(false)) : children}</div>}
  </span>;
}

export function FilterSelect({ icon, label, value, options, onChange, width = 220 }: any) {
  const active = value && value !== 'all' && value !== '';
  const cur = options.find((o: any) => o.value === value);
  return <Menu width={width} trigger={
    <Hover as="div" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 12px', borderRadius: 10, border: `1px solid ${active ? 'rgba(0,122,255,0.4)' : 'rgba(0,0,0,0.10)'}`, background: active ? 'rgba(0,122,255,0.06)' : '#fff', color: active ? '#0066CC' : '#3a3a3c', fontSize: 13, fontWeight: 600, cursor: 'pointer' }} hover={{ borderColor: 'rgba(0,0,0,0.18)' }}>
      {icon && <Icon name={icon} size={15} />}{cur ? cur.label : label}<Icon name="chevronDown" size={14} />
    </Hover>}>
    {(close: any) => options.map((o: any) => <MenuItem key={String(o.value)} label={o.label} onClick={() => { onChange(o.value); close(); }} trailing={o.value === value ? <Icon name="check" size={14} style={{ color: '#007AFF' }} /> : null} />)}
  </Menu>;
}

/* ---- inline editors ---- */
export function StatusSelect({ value, onChange }: any) {
  return <Menu width={184} trigger={<span style={{ cursor: 'pointer' }}><StatusChip status={value} /></span>}>
    {(close: any) => columnKeys().map((k) => <MenuItem key={k} label={<StatusChip status={k} />} onClick={() => { onChange(k); close(); }} trailing={k === value ? <Icon name="check" size={14} style={{ color: '#007AFF' }} /> : null} />)}
  </Menu>;
}
export function PrioritySelect({ value, onChange }: any) {
  return <Menu width={150} trigger={<span style={{ cursor: 'pointer' }}><PriorityFlag priority={value} withLabel /></span>}>
    {(close: any) => PRIORITY_ORDER.map((k) => <MenuItem key={k} label={<PriorityFlag priority={k} withLabel />} onClick={() => { onChange(k); close(); }} trailing={k === value ? <Icon name="check" size={14} style={{ color: '#007AFF' }} /> : null} />)}
  </Menu>;
}
export function AssigneeSelect({ value, onChange, people, size = 26 }: any) {
  const name = (people.find((p: any) => p.initials === value) || { name: value })?.name;
  return <Menu width={210} trigger={<span style={{ cursor: 'pointer' }}><Avatar name={name} size={size} /></span>}>
    {(close: any) => people.map((p: any) => <Hover key={p.initials} as="button" onClick={() => { onChange(p.initials); close(); }} style={{ ...menuItemStyle, gap: 9 }} hover={{ background: 'rgba(0,0,0,0.05)' }}><Avatar name={p.name} size={22} /><span style={{ flex: 1 }}>{p.name}</span>{p.initials === value && <Icon name="check" size={14} style={{ color: '#007AFF' }} />}</Hover>)}
  </Menu>;
}

/* ============================ Toasts ============================ */
export function useToasts() {
  const [toasts, setToasts] = React.useState<any[]>([]);
  const toast = React.useCallback((title: string, kind = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, title, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);
  return { toasts, toast };
}
export function ToastHost({ toasts }: any) {
  const conf: any = { success: ['rgba(52,199,89,0.16)', '#248A3D', 'check'], info: ['rgba(0,122,255,0.14)', '#0066CC', 'checkCircle'], warning: ['rgba(255,159,10,0.18)', '#A05A00', 'alert'], danger: ['rgba(255,59,48,0.14)', '#C62820', 'alert'] };
  return <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 200, display: 'flex', flexDirection: 'column', gap: 10, width: 320, maxWidth: '90vw', pointerEvents: 'none' }}>
    {toasts.map((t: any) => { const c = conf[t.kind] || conf.success; return (
      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(20px)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 13, boxShadow: '0 12px 30px rgba(0,0,0,0.12)', animation: 'qhToastIn .24s ease' }}>
        <span style={{ width: 22, height: 22, flex: 'none', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c[0], color: c[1] }}><Icon name={c[2]} size={14} /></span>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.title}</div>
      </div>); })}
  </div>;
}

/* ============================ Context ============================ */
export const TasksCtx = React.createContext<any>(null);
export const useTasksCtx = () => React.useContext(TasksCtx);
