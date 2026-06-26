"""Provider-agnostic LLM client so Anna can run on Claude (Anthropic, default &
recommended) OR OpenAI — whichever key the team configures in Settings → Anna AI.

Python port of anna/llm.js. Exposes one uniform shape regardless of provider:

    llm_complete(...) -> {"text", "toolCalls": [{"name", "input"}], "raw"}
    llm_json(...)     -> first JSON object/array parsed from the reply

Tool definitions are written once in Anthropic's ``{name, description,
input_schema}`` form and translated to OpenAI's function schema as needed.
(Document/vision scanning stays Anthropic-only — see normalize.py / claude.py.)
"""
import json
import os
import re

import httpx

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"

PROVIDERS = ["anthropic", "openai"]

DEFAULT_MODELS = {
    "anthropic": {
        "fast": os.environ.get("ANNA_FAST_MODEL") or "claude-haiku-4-5-20251001",
        "smart": os.environ.get("ANNA_SMART_MODEL") or "claude-opus-4-8",
    },
    "openai": {
        "fast": os.environ.get("ANNA_OPENAI_FAST_MODEL") or "gpt-4o-mini",
        "smart": os.environ.get("ANNA_OPENAI_SMART_MODEL") or "gpt-4o",
    },
}

_JSON_RE = re.compile(r"\{[\s\S]*\}|\[[\s\S]*\]")


def provider_model(provider: str = "anthropic", tier: str = "fast", override: str | None = None) -> str:
    if override:
        return override
    models = DEFAULT_MODELS.get(provider) or DEFAULT_MODELS["anthropic"]
    return models.get(tier) or DEFAULT_MODELS["anthropic"]["fast"]


async def llm_complete(
    *,
    provider: str = "anthropic",
    api_key: str | None = None,
    model: str | None = None,
    system=None,
    messages: list | None = None,
    tools=None,
    max_tokens: int = 1024,
) -> dict:
    """Uniform completion across providers → {text, toolCalls, raw}."""
    if not api_key:
        raise RuntimeError("No API key configured")
    messages = messages or []
    if provider == "openai":
        return await _call_openai(
            api_key=api_key, model=provider_model("openai", "fast", model),
            system=system, messages=messages, tools=tools, max_tokens=max_tokens,
        )
    return await _call_anthropic(
        api_key=api_key, model=provider_model("anthropic", "fast", model),
        system=system, messages=messages, tools=tools, max_tokens=max_tokens,
    )


async def llm_json(**opts) -> object:
    out = await llm_complete(**opts)
    m = _JSON_RE.search(out["text"])
    if not m:
        raise RuntimeError("LLM response contained no JSON")
    return json.loads(m.group(0))


async def _call_anthropic(*, api_key, model, system, messages, tools, max_tokens) -> dict:
    body = {"model": model, "max_tokens": max_tokens, "messages": messages}
    if system:
        body["system"] = system
    if tools:
        body["tools"] = tools
    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            ANTHROPIC_URL,
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json=body,
        )
    if not res.is_success:
        raise RuntimeError(f"Anthropic API error {res.status_code}: {res.text[:200]}")
    raw = res.json()
    blocks = raw.get("content") or []
    text = "\n".join(b["text"] for b in blocks if b.get("type") == "text")
    tool_calls = [{"name": b.get("name"), "input": b.get("input") or {}} for b in blocks if b.get("type") == "tool_use"]
    return {"text": text, "toolCalls": tool_calls, "raw": raw}


async def _call_openai(*, api_key, model, system, messages, tools, max_tokens) -> dict:
    msgs = []
    if system:
        msgs.append({"role": "system", "content": system})
    for m in messages:
        role = "assistant" if m.get("role") == "assistant" else "user"
        msgs.append({"role": role, "content": str(m.get("content") or "")})
    body = {"model": model, "max_tokens": max_tokens, "messages": msgs}
    if tools:
        body["tools"] = [
            {"type": "function", "function": {"name": t["name"], "description": t.get("description"), "parameters": t.get("input_schema")}}
            for t in tools
        ]
    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            OPENAI_URL,
            headers={"authorization": f"Bearer {api_key}", "content-type": "application/json"},
            json=body,
        )
    if not res.is_success:
        raise RuntimeError(f"OpenAI API error {res.status_code}: {res.text[:200]}")
    raw = res.json()
    msg = ((raw.get("choices") or [{}])[0]).get("message") or {}
    tool_calls = [
        {"name": (tc.get("function") or {}).get("name"), "input": _safe_parse((tc.get("function") or {}).get("arguments"))}
        for tc in (msg.get("tool_calls") or [])
    ]
    return {"text": msg.get("content") or "", "toolCalls": tool_calls, "raw": raw}


def _safe_parse(s) -> dict:
    try:
        return json.loads(s or "{}")
    except Exception:  # noqa: BLE001
        return {}
