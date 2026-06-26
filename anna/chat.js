// anna/chat.js
// ─────────────────────────────────────────────────────────────────────────────
// Anna as a conversational in-app assistant.
//
// Anna can: answer questions about the app and the trucking hiring/compliance
// domain; summarize a driver / carrier / candidate / truck from the context the
// UI sends; navigate the user to any profile or page; and create/assign tasks.
//
// Actions (navigate, open_profile, create_task) are returned to the caller and
// executed by the frontend (it owns routing and the store). Without an API key
// Anna falls back to lightweight intent parsing + templated summaries so the
// core actions still work offline.
// ─────────────────────────────────────────────────────────────────────────────

import { annaConfigured } from './claude.js';
import { llmComplete } from './llm.js';

const PAGES = ['dashboard', 'carriers', 'drivers', 'trucks', 'hiring', 'tasks', 'inbox', 'notifications', 'settings', 'anna'];
const ENTITY_TYPES = ['driver', 'carrier', 'candidate', 'truck'];

const TOOLS = [
  {
    name: 'create_task',
    description: 'Create and assign a task in the workdeck. Use when the user asks to create, add, assign, schedule, or remind about a task or follow-up.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        assignee: { type: 'string', description: 'Recruiter/employee name, if stated.' },
        priority: { type: 'string', enum: ['Urgent', 'High', 'Normal', 'Low'] },
        due: { type: 'string', description: 'YYYY-MM-DD if stated.' },
        description: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'open_profile',
    description: 'Open a specific record\'s profile page by name when the user wants to go to / view / pull up a driver, carrier, candidate, or truck.',
    input_schema: {
      type: 'object',
      properties: {
        entityType: { type: 'string', enum: ENTITY_TYPES },
        name: { type: 'string', description: 'Name (or truck unit #) to look up.' },
      },
      required: ['entityType', 'name'],
    },
  },
  {
    name: 'navigate',
    description: 'Open a top-level page/section of the app when the user asks to go there.',
    input_schema: { type: 'object', properties: { page: { type: 'string', enum: PAGES } }, required: ['page'] },
  },
];

// Concise how-to guide so Anna can answer "how do I…" / "where is…" from any page.
const APP_GUIDE = `
APP GUIDE (how to use FleetView/QuickHire):
- Dashboard: overview of activity and counts.
- Carriers: the companies you staff for. Open a carrier to edit its hiring requirements (age, experience, violations, endorsements, insurance) — Anna parses these into match rules. You work "in" one carrier; its drivers/trucks/hiring are scoped to it.
- Hiring: the candidate pipeline (Lead → Screening → … stages). Open a candidate for their record; use "Run AI Screening", or the "Anna" tab to get best-fit carrier offers with reasons and create a send-offer task.
- Drivers: hired drivers for the current carrier; open one for their record, truck assignment, status.
- Trucks: fleet units; assign a driver, see status.
- Tasks: your to-dos; create via the floating "New Task" button (works anywhere) or by asking Anna ("assign a task to Jenna …").
- Inbox / Notifications: messages and alerts.
- DocuSign — e-Sign: send offer letters / consent forms to drivers for signature (auto-fills from their application).
- Settings → Anna AI: connect an AI provider key (Claude or OpenAI) to enable Anna's full answers. Settings → Driver Screening configures screening.
- Anna workspace (/anna): the driver-qualification queue — a lead is normalized, ranked against every carrier (with "why this fits"), the recruiter SELECTS a carrier, records consent, pulls MVR/PSP/Clearinghouse → verdict, approves/rejects, then records the outcome (which tunes future matching). Export a compliance packet anytime; see ROI under 📊 Metrics.
- Ask Anna (this panel): on every page — ask questions, get summaries, jump to records, assign tasks.
Qualification basics: a driver must clear a carrier's hard gates (min age, experience, violation/DUI caps, endorsements, insurance); missing data = "needs data", not a rejection. Anna recommends a ranked list; a human picks the carrier and advances.`;

function systemPrompt(context = {}) {
  return [
    'You are Anna, the AI assistant inside QuickHire/Fleetmule — a driver-staffing platform for the trucking industry (also branded "FleetView").',
    'You help recruiters and owners on EVERY page: answer how-to questions about any feature, troubleshoot ("how do I…", "where do I…", "why can\'t I…"), explain driver qualification / FMCSA compliance (MVR, PSP, Clearinghouse) and carrier requirements, summarize records, navigate, and create tasks.',
    'Capabilities: (1) answer app + domain questions using the APP GUIDE below; (2) SUMMARIZE a driver/carrier/candidate/truck from the provided context; (3) NAVIGATE via open_profile (a record) or navigate (a section); (4) create/assign tasks via create_task.',
    'When the user asks to open/pull up a record, call open_profile. To go to a section, call navigate. To summarize, use the provided context only — never invent fields. For how-to questions, answer from the APP GUIDE and offer to take them there. Keep answers short and practical.',
    APP_GUIDE,
    context.focus ? `The user is currently viewing: ${JSON.stringify(context.focus)}.` : '',
    context.directory ? `Known records (for lookup/summary): ${JSON.stringify(context.directory).slice(0, 6000)}.` : '',
    context.counts ? `Counts: ${JSON.stringify(context.counts)}.` : '',
  ].filter(Boolean).join(' ');
}

/**
 * Run one assistant turn.
 * @param {Object} p
 * @param {Array}  p.messages  [{ role:'user'|'assistant', content:string }]
 * @param {Object} [p.context] { page, focus, directory, counts }
 * @param {Object} [p.opts]    { apiKey, model }
 * @returns {Promise<{ reply, actions, engine }>}
 */
export async function chat({ messages = [], context = {}, opts = {} } = {}) {
  if (!annaConfigured(opts.apiKey)) return heuristicChat(messages, context);

  const { text, toolCalls } = await llmComplete({
    provider: opts.provider,
    apiKey: opts.apiKey,
    model: opts.model,
    maxTokens: 900,
    system: systemPrompt(context),
    tools: TOOLS,
    messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') })),
  });

  let reply = text || '';
  const actions = [];
  for (const call of toolCalls || []) {
    if (call.name === 'create_task') actions.push({ type: 'create_task', task: sanitizeTask(call.input) });
    else if (call.name === 'open_profile') actions.push({ type: 'open_profile', entityType: call.input.entityType, name: String(call.input.name || '') });
    else if (call.name === 'navigate') actions.push({ type: 'navigate', page: call.input.page });
  }
  if (!reply.trim() && actions.length) reply = confirmAction(actions[0]);
  return { reply: reply.trim() || "I'm not sure how to help with that yet.", actions, engine: 'ai' };
}

function sanitizeTask(input = {}) {
  const PRI = ['Urgent', 'High', 'Normal', 'Low'];
  return {
    title: String(input.title || 'New task').slice(0, 200),
    assignee: input.assignee ? String(input.assignee) : undefined,
    priority: PRI.includes(input.priority) ? input.priority : undefined,
    due: input.due ? String(input.due) : undefined,
    description: input.description ? String(input.description) : undefined,
  };
}

function confirmAction(a) {
  if (a.type === 'create_task') return `Created the task "${a.task.title}"${a.task.assignee ? ` and assigned it to ${a.task.assignee}` : ''}.`;
  if (a.type === 'open_profile') return `Opening ${a.name}'s profile…`;
  if (a.type === 'navigate') return `Opening the ${a.page} page…`;
  return 'Done.';
}

// ── Deterministic fallback (no API key) ──────────────────────────────────────
export function heuristicChat(messages, context = {}) {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const text = String(last?.content || '').trim();

  // 1) Task intent
  const task = parseTaskIntent(text);
  if (task) return { reply: confirmAction({ type: 'create_task', task }), actions: [{ type: 'create_task', task }], engine: 'heuristic' };

  // 2) Summary intent — template from the viewed record (focus) when available
  if (/\b(summar|tell me about|overview of|brief on)/i.test(text)) {
    if (context.focus) return { reply: summarize(context.focus), actions: [], engine: 'heuristic' };
    return { reply: 'Open the record (or tell me to open it) and I\'ll summarize it. Connect an Anthropic API key for richer, free-form answers.', actions: [], engine: 'heuristic' };
  }

  // 3) Navigation intent
  const navIntent = parseNavIntent(text);
  if (navIntent) return { reply: confirmAction(navIntent), actions: [navIntent], engine: 'heuristic' };

  return {
    reply: "I can open records (“open driver John Doe”), summarize what you're viewing, assign tasks (“assign a task to Jenna…”), and navigate the app. Connect an Anthropic API key to enable full free-form Q&A.",
    actions: [],
    engine: 'heuristic',
  };
}

function summarize(focus = {}) {
  const f = focus;
  const skip = new Set(['id', 'carrierId', 'name', 'entityType']);
  const bits = Object.entries(f)
    .filter(([k, v]) => !skip.has(k) && v != null && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  const title = f.name || (f.unit ? `Unit ${f.unit}` : (f.entityType || 'Record'));
  const kind = f.entityType ? `${f.entityType} ` : '';
  return `${kind}${title} — ${bits.slice(0, 10).join(' · ') || 'no details available'}.`;
}

function parseNavIntent(text) {
  if (!/\b(open|go to|show|view|pull up|take me to|navigate)\b/i.test(text)) return null;
  const lower = text.toLowerCase();
  // Page navigation
  for (const page of PAGES) if (new RegExp(`\\b${page}\\b`).test(lower)) return { type: 'navigate', page };
  if (/\bdashboard|home\b/.test(lower)) return { type: 'navigate', page: 'dashboard' };
  // Profile open: "open driver <name>" / "open carrier <name>"
  const m = text.match(/\b(driver|carrier|candidate|truck)\s+(.+)$/i);
  if (m) return { type: 'open_profile', entityType: m[1].toLowerCase(), name: m[2].replace(/['"?.]/g, '').trim() };
  return null;
}

function parseTaskIntent(text) {
  if (!text) return null;
  if (!/\b(task|assign|remind|to-?do|follow[\s-]?up|schedule)\b/i.test(text)) return null;
  if (/\b(open|go to|navigate|summar)\b/i.test(text)) return null; // not a task command
  let assignee;
  const m = text.match(/\b(?:assign(?:ed)?\s+to|to|for)\s+([A-Z][a-zA-Z]+)\b/);
  if (m) assignee = m[1];
  let title = text
    .replace(/^\s*(please\s+)?(can you\s+)?(create|add|make|set\s*up|schedule|assign|remind\s+\w+\s+to)\s+(a\s+|an\s+)?(task|reminder|follow[\s-]?up)?\s*(to\s+[A-Z][a-zA-Z]+)?\s*[:\-]?\s*/i, '')
    .replace(/\b(?:assign(?:ed)?\s+to|to|for)\s+[A-Z][a-zA-Z]+\b/, '')
    .trim();
  if (!title) title = text.trim();
  const due = (text.match(/\b(\d{4}-\d{2}-\d{2})\b/) || [])[1];
  const priority = /\burgent\b/i.test(text) ? 'Urgent' : /\bhigh priority\b/i.test(text) ? 'High' : undefined;
  return { title: title.slice(0, 200), assignee, due, priority };
}
