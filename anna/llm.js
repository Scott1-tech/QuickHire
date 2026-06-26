// anna/llm.js
// ─────────────────────────────────────────────────────────────────────────────
// Provider-agnostic LLM client so Anna can run on Claude (Anthropic, default &
// recommended) OR another provider (OpenAI) — whichever key the team configures.
//
// Exposes one uniform shape regardless of provider:
//   llmComplete(...) -> { text, toolCalls: [{ name, input }], raw }
//   llmJSON(...)     -> first JSON object/array parsed from the reply
//
// Tool definitions are written once in Anthropic's `{ name, description,
// input_schema }` form and translated to OpenAI's function schema as needed.
// (Document/vision scanning stays Anthropic-only — see normalize.js.)
// ─────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export const PROVIDERS = ['anthropic', 'openai'];

export const DEFAULT_MODELS = {
  anthropic: { fast: process.env.ANNA_FAST_MODEL || 'claude-haiku-4-5-20251001', smart: process.env.ANNA_SMART_MODEL || 'claude-opus-4-8' },
  openai: { fast: process.env.ANNA_OPENAI_FAST_MODEL || 'gpt-4o-mini', smart: process.env.ANNA_OPENAI_SMART_MODEL || 'gpt-4o' },
};

export function providerModel(provider = 'anthropic', tier = 'fast', override) {
  if (override) return override;
  return (DEFAULT_MODELS[provider] || DEFAULT_MODELS.anthropic)[tier] || DEFAULT_MODELS.anthropic.fast;
}

/**
 * @param {Object} p
 * @param {string} [p.provider='anthropic']
 * @param {string} p.apiKey
 * @param {string} [p.model]
 * @param {string} [p.system]
 * @param {Array}  p.messages  [{ role:'user'|'assistant', content:string }]
 * @param {Array}  [p.tools]   Anthropic-style tool defs.
 * @param {number} [p.maxTokens=1024]
 * @returns {Promise<{ text, toolCalls, raw }>}
 */
export async function llmComplete({ provider = 'anthropic', apiKey, model, system, messages = [], tools, maxTokens = 1024 } = {}) {
  if (!apiKey) throw new Error('No API key configured');
  if (provider === 'openai') return callOpenAI({ apiKey, model: providerModel('openai', 'fast', model), system, messages, tools, maxTokens });
  return callAnthropic({ apiKey, model: providerModel('anthropic', 'fast', model), system, messages, tools, maxTokens });
}

export async function llmJSON(opts) {
  const { text } = await llmComplete(opts);
  const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) throw new Error('LLM response contained no JSON');
  return JSON.parse(m[0]);
}

async function callAnthropic({ apiKey, model, system, messages, tools, maxTokens }) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, ...(system ? { system } : {}), ...(tools ? { tools } : {}), messages }),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const raw = await res.json();
  const text = (raw.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const toolCalls = (raw.content || []).filter((b) => b.type === 'tool_use').map((b) => ({ name: b.name, input: b.input || {} }));
  return { text, toolCalls, raw };
}

async function callOpenAI({ apiKey, model, system, messages, tools, maxTokens }) {
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  for (const m of messages) msgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') });
  const body = { model, max_tokens: maxTokens, messages: msgs };
  if (tools) body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const raw = await res.json();
  const msg = raw.choices?.[0]?.message || {};
  const toolCalls = (msg.tool_calls || []).map((tc) => ({ name: tc.function?.name, input: safeParse(tc.function?.arguments) }));
  return { text: msg.content || '', toolCalls, raw };
}

const safeParse = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
