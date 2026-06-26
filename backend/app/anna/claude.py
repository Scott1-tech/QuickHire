"""Minimal Claude (Anthropic Messages API) client for Anna."""
import json
import os
import re

import httpx

API_URL = "https://api.anthropic.com/v1/messages"

MODELS = {
    "fast": os.environ.get("ANNA_FAST_MODEL") or "claude-haiku-4-5-20251001",
    "smart": os.environ.get("ANNA_SMART_MODEL") or "claude-opus-4-8",
}

_JSON_RE = re.compile(r"\{[\s\S]*\}|\[[\s\S]*\]")


def anna_configured(api_key: str | None = None) -> bool:
    return bool(api_key if api_key is not None else os.environ.get("ANTHROPIC_API_KEY"))


async def call_claude(
    *,
    api_key: str | None = None,
    model: str | None = None,
    max_tokens: int = 1024,
    system=None,
    messages: list,
    cache_system: bool = False,
    tools=None,
) -> dict:
    key = api_key if api_key is not None else os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY not configured")

    system_field = system
    if isinstance(system, str) and cache_system:
        system_field = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]

    body = {"model": model or MODELS["fast"], "max_tokens": max_tokens, "messages": messages}
    if system_field is not None:
        body["system"] = system_field
    if tools is not None:
        body["tools"] = tools

    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            API_URL,
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json=body,
        )
    if not res.is_success:
        raise RuntimeError(f"Anthropic API error {res.status_code}: {res.text[:300]}")
    raw = res.json()
    text = "\n".join(b["text"] for b in (raw.get("content") or []) if b.get("type") == "text")
    return {"text": text, "raw": raw, "usage": raw.get("usage")}


async def call_claude_json(**opts):
    out = await call_claude(**opts)
    m = _JSON_RE.search(out["text"])
    if not m:
        raise RuntimeError("Claude response contained no JSON")
    return json.loads(m.group(0))


def document_block(*, data_url: str | None = None, base64_data: str | None = None, media_type: str | None = None) -> dict:
    data, mt = base64_data, media_type
    if data_url:
        m = re.match(r"^data:(.+?);base64,(.*)$", data_url, re.DOTALL)
        if m:
            mt, data = m.group(1), m.group(2)
    if not data or not mt:
        raise RuntimeError("document_block requires a base64 data URL or (base64 + media_type)")
    if mt == "application/pdf":
        return {"type": "document", "source": {"type": "base64", "media_type": mt, "data": data}}
    return {"type": "image", "source": {"type": "base64", "media_type": mt, "data": data}}
