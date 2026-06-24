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

import { callClaude, MODELS, annaConfigured } from './claude.js';

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

function systemPrompt(context = {}) {
  return [
    'You are Anna, the AI assistant inside QuickHire/Fleetmule — a driver-staffing platform for the trucking industry (the app is also branded "FleetView").',
    'The app has these sections: Dashboard, Hiring (candidate pipeline), Drivers, Trucks, Carriers, Tasks, Inbox, Notifications, Settings, and the Anna workspace (driver qualification & carrier matching).',
    'You can: (1) answer questions about how the app works and about driver qualification / FMCSA compliance (MVR, PSP, Clearinghouse) / carrier requirements; (2) SUMMARIZE a driver, carrier, candidate, or truck using the context provided to you; (3) NAVIGATE the user to a profile (open_profile) or a page (navigate); (4) create/assign tasks (create_task).',
    'When the user asks to go to / open / pull up a specific record, call open_profile. When they ask to go to a section, call navigate. When they ask to summarize or "tell me about" a record, write a concise summary from the provided context (do not invent fields you were not given). Keep answers short and practical.',
    'Use ONLY the data in the context below; if a record is not present, say you could not find it.',
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

  const { raw } = await callClaude({
    apiKey: opts.apiKey,
    model: opts.model || MODELS.fast,
    maxTokens: 900,
    system: systemPrompt(context),
    tools: TOOLS,
    messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') })),
  });

  let reply = '';
  const actions = [];
  for (const block of raw.content || []) {
    if (block.type === 'text') reply += block.text;
    else if (block.type === 'tool_use') {
      if (block.name === 'create_task') actions.push({ type: 'create_task', task: sanitizeTask(block.input) });
      else if (block.name === 'open_profile') actions.push({ type: 'open_profile', entityType: block.input.entityType, name: String(block.input.name || '') });
      else if (block.name === 'navigate') actions.push({ type: 'navigate', page: block.input.page });
    }
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
