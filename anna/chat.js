// anna/chat.js
// ─────────────────────────────────────────────────────────────────────────────
// Anna as a conversational in-app assistant.
//
// Users can ask questions (trucking hiring/compliance domain + how the app
// works) and assign tasks in natural language from anywhere in the app. Anna
// answers with Claude when configured, and can emit structured ACTIONS that the
// frontend applies to the app (today: create_task). Without an API key she falls
// back to a lightweight intent parser so "assign a task to Jenna…" still works.
//
// Actions are returned to the caller rather than executed here — the task list
// lives in the SPA's store, so the frontend performs the mutation and Anna stays
// decoupled from the app's state.
// ─────────────────────────────────────────────────────────────────────────────

import { callClaude, MODELS, annaConfigured } from './claude.js';

// Tools Anna can call. Keep inputs simple and frontend-applicable.
const TOOLS = [
  {
    name: 'create_task',
    description: 'Create and assign a task in the QuickHire workdeck. Use whenever the user asks to create, add, assign, schedule, or remind about a task or follow-up.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short task title.' },
        assignee: { type: 'string', description: 'Person to assign to (a recruiter/employee name), if stated.' },
        priority: { type: 'string', enum: ['Urgent', 'High', 'Normal', 'Low'] },
        due: { type: 'string', description: 'Due date in YYYY-MM-DD if stated.' },
        description: { type: 'string', description: 'Optional details.' },
      },
      required: ['title'],
    },
  },
];

function systemPrompt(context = {}) {
  return [
    'You are Anna, the AI assistant built into QuickHire/Fleetmule — a driver-staffing platform for the trucking industry.',
    'You help recruiters and owners: answer questions about driver qualification, FMCSA compliance (MVR, PSP, Clearinghouse), carrier requirements, and how to use the app; and you create/assign tasks on request.',
    'Be concise and practical. When the user asks to create or assign a task or follow-up, call the create_task tool (infer a clear title; include assignee/priority/due only if stated).',
    'Do not invent driver, carrier, or record data you were not given. If asked to do something you cannot, say so briefly.',
    context && Object.keys(context).length ? `Current app context: ${JSON.stringify(context)}.` : '',
  ].filter(Boolean).join(' ');
}

/**
 * Run one assistant turn.
 * @param {Object} p
 * @param {Array}  p.messages  [{ role:'user'|'assistant', content:string }]
 * @param {Object} [p.context] Lightweight UI context (current page, carrier, counts).
 * @param {Object} [p.opts]    { apiKey, model }
 * @returns {Promise<{ reply, actions, engine }>}
 */
export async function chat({ messages = [], context = {}, opts = {} } = {}) {
  if (!annaConfigured(opts.apiKey)) return heuristicChat(messages, context);

  const { raw } = await callClaude({
    apiKey: opts.apiKey,
    model: opts.model || MODELS.fast,
    maxTokens: 800,
    system: systemPrompt(context),
    tools: TOOLS,
    messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') })),
  });

  let reply = '';
  const actions = [];
  for (const block of raw.content || []) {
    if (block.type === 'text') reply += block.text;
    else if (block.type === 'tool_use' && block.name === 'create_task') actions.push({ type: 'create_task', task: sanitizeTask(block.input) });
  }
  if (!reply.trim() && actions.length) reply = confirmTask(actions[0].task);
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

const confirmTask = (t) => `Created the task "${t.title}"${t.assignee ? ` and assigned it to ${t.assignee}` : ''}${t.due ? ` (due ${t.due})` : ''}.`;

// ── Deterministic fallback (no API key) ──────────────────────────────────────
// Parses simple task-assignment intents; otherwise returns a helpful message.
export function heuristicChat(messages, context) {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const text = String(last?.content || '').trim();
  const task = parseTaskIntent(text);
  if (task) return { reply: confirmTask(task), actions: [{ type: 'create_task', task }], engine: 'heuristic' };
  return {
    reply: "I can create and assign tasks for you, and answer questions about driver qualification and the app. Try: “Assign a task to Jenna: call driver John about his MVR.” (Connect an Anthropic API key to enable full Q&A.)",
    actions: [],
    engine: 'heuristic',
  };
}

function parseTaskIntent(text) {
  if (!text) return null;
  if (!/\b(task|assign|remind|to-?do|follow[\s-]?up|schedule)\b/i.test(text)) return null;
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
