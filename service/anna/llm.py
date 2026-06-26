"""Provider-agnostic LLM client — Python port of anna/llm.js (Anthropic + OpenAI).

Uses urllib (stdlib) so the service has no extra runtime deps for LLM calls.
Network calls run in a thread to stay async-friendly under FastAPI.
"""
from __future__ import annotations
import os
import json
import re
import asyncio
import urllib.request
import urllib.error

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
PROVIDERS = ["anthropic", "openai"]

DEFAULT_MODELS = {
    "anthropic": {"fast": os.environ.get("ANNA_FAST_MODEL", "claude-haiku-4-5-20251001"),
                  "smart": os.environ.get("ANNA_SMART_MODEL", "claude-opus-4-8")},
    "openai": {"fast": os.environ.get("ANNA_OPENAI_FAST_MODEL", "gpt-4o-mini"),
               "smart": os.environ.get("ANNA_OPENAI_SMART_MODEL", "gpt-4o")},
}


def provider_model(provider="anthropic", tier="fast", override=None):
    if override:
        return override
    return DEFAULT_MODELS.get(provider, DEFAULT_MODELS["anthropic"]).get(tier) or DEFAULT_MODELS["anthropic"]["fast"]


def _post(url, headers, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="ignore")[:200]
        raise RuntimeError(f"{url.split('/')[2]} API error {e.code}: {body}")


def _anthropic(api_key, model, system, messages, tools, max_tokens):
    payload = {"model": model, "max_tokens": max_tokens, "messages": messages}
    if system:
        payload["system"] = system
    if tools:
        payload["tools"] = tools
    raw = _post(ANTHROPIC_URL, {"x-api-key": api_key, "anthropic-version": "2023-06-01",
                                "content-type": "application/json"}, payload)
    content = raw.get("content") or []
    text = "\n".join(b.get("text", "") for b in content if b.get("type") == "text")
    tool_calls = [{"name": b.get("name"), "input": b.get("input") or {}} for b in content if b.get("type") == "tool_use"]
    return {"text": text, "toolCalls": tool_calls, "raw": raw}


def _openai(api_key, model, system, messages, tools, max_tokens):
    msgs = ([{"role": "system", "content": system}] if system else []) + [
        {"role": ("assistant" if m["role"] == "assistant" else "user"), "content": str(m.get("content") or "")}
        for m in messages
    ]
    payload = {"model": model, "max_tokens": max_tokens, "messages": msgs}
    if tools:
        payload["tools"] = [{"type": "function", "function": {"name": t["name"], "description": t.get("description"),
                                                              "parameters": t["input_schema"]}} for t in tools]
    raw = _post(OPENAI_URL, {"authorization": f"Bearer {api_key}", "content-type": "application/json"}, payload)
    msg = (raw.get("choices") or [{}])[0].get("message") or {}
    tool_calls = []
    for tc in (msg.get("tool_calls") or []):
        try:
            args = json.loads((tc.get("function") or {}).get("arguments") or "{}")
        except Exception:
            args = {}
        tool_calls.append({"name": (tc.get("function") or {}).get("name"), "input": args})
    return {"text": msg.get("content") or "", "toolCalls": tool_calls, "raw": raw}


async def llm_complete(provider="anthropic", apiKey=None, model=None, system=None, messages=None, tools=None, maxTokens=1024):
    if not apiKey:
        raise RuntimeError("No API key configured")
    messages = messages or []
    fn = _openai if provider == "openai" else _anthropic
    mdl = provider_model(provider, "fast", model)
    return await asyncio.to_thread(fn, apiKey, mdl, system, messages, tools, maxTokens)


async def llm_json(**opts):
    res = await llm_complete(**opts)
    m = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", res.get("text") or "")
    if not m:
        raise RuntimeError("LLM response contained no JSON")
    return json.loads(m.group())
