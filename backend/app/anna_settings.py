"""Anna's effective Anthropic API key — UI-provided (stored server-side) or env.

Ported from server.js: a key entered in the app's Anna Settings is stored
server-side (the KV table) and takes precedence over ANTHROPIC_API_KEY. Only a
masked hint is ever returned to the client.
"""
from . import config
from .store import kv_delete, kv_get, kv_set

_KV_KEY = "anna.anthropicApiKey"


async def stored_key() -> str | None:
    return await kv_get(_KV_KEY)


async def effective_key() -> str:
    return (await stored_key()) or config.ANTHROPIC_API_KEY or ""


async def key_source() -> str | None:
    if await stored_key():
        return "ui"
    return "env" if config.ANTHROPIC_API_KEY else None


def mask_key(k: str | None) -> str | None:
    if k and len(k) > 12:
        return f"{k[:6]}…{k[-4:]}"
    return "••••" if k else None


async def set_key(api_key: str) -> None:
    await kv_set(_KV_KEY, api_key)


async def clear_key() -> None:
    await kv_delete(_KV_KEY)
