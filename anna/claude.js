// anna/claude.js
// ─────────────────────────────────────────────────────────────────────────────
// Minimal Claude (Anthropic Messages API) client for Anna.
//
// Kept dependency-free (raw fetch) to match the existing server.js style and to
// avoid coupling the standalone module to a specific SDK version. Supports:
//   • a `system` prompt with optional prompt caching (cache the carrier spec /
//     domain instructions so repeated driver calls reuse it — the cost lever
//     called out in the blueprint),
//   • native image/PDF blocks for document scanning (Stage 2 / Stage 4),
//   • strict JSON extraction so callers get structured output.
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = 'https://api.anthropic.com/v1/messages';

// Latest-generation defaults. Override per-call or via env.
export const MODELS = {
  fast: process.env.ANNA_FAST_MODEL || 'claude-haiku-4-5-20251001', // intake/normalization
  smart: process.env.ANNA_SMART_MODEL || 'claude-opus-4-8',          // compliance reasoning
};

export function annaConfigured(apiKey = process.env.ANTHROPIC_API_KEY) {
  return Boolean(apiKey);
}

/**
 * Low-level call to the Messages API.
 * @param {Object} p
 * @param {string} [p.apiKey]
 * @param {string} [p.model]
 * @param {number} [p.maxTokens]
 * @param {string|Array} [p.system]  String, or content blocks (use cache flag for caching).
 * @param {Array}  p.messages
 * @param {boolean} [p.cacheSystem]  Wrap a string system prompt with cache_control.
 * @param {Array}  [p.tools]  Tool definitions for tool-use.
 * @returns {Promise<{ text, raw, usage }>}
 */
export async function callClaude({ apiKey = process.env.ANTHROPIC_API_KEY, model = MODELS.fast, maxTokens = 1024, system, messages, cacheSystem = false, tools } = {}) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  let systemField = system;
  if (typeof system === 'string' && cacheSystem) {
    systemField = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, ...(systemField ? { system: systemField } : {}), ...(tools ? { tools } : {}), messages }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const raw = await res.json();
  const text = (raw.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return { text, raw, usage: raw.usage || null };
}

/** Call Claude and parse the first JSON object/array from the response. */
export async function callClaudeJSON(opts) {
  const { text } = await callClaude(opts);
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error('Claude response contained no JSON');
  return JSON.parse(match[0]);
}

/**
 * Build a content block for a document (image or PDF) from a base64 data URL or
 * raw base64 + media type. Used for native document scanning.
 */
export function documentBlock({ dataUrl, base64, mediaType }) {
  let data = base64, mt = mediaType;
  if (dataUrl) {
    const m = /^data:(.+?);base64,(.*)$/.exec(dataUrl);
    if (m) { mt = m[1]; data = m[2]; }
  }
  if (!data || !mt) throw new Error('documentBlock requires a base64 data URL or (base64 + mediaType)');
  if (mt === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: mt, data } };
  return { type: 'image', source: { type: 'base64', media_type: mt, data } };
}
