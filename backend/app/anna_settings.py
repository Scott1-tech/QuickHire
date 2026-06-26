"""Anna's effective AI provider + key — UI-provided (stored server-side) or env.

Ported from server.js: a provider + key entered in the app's Anna Settings is
stored server-side (the KV table) and takes precedence over ANTHROPIC_API_KEY.
Supports Claude (Anthropic, default) or OpenAI. Only a masked hint is ever
returned to the client.

Two notions of "key":
- ``effective_key()`` — the key for the *selected* provider (powers chat / the
  free-form assistant via the provider-agnostic LLM client).
- ``anthropic_key()`` — an Anthropic key specifically, for the Anthropic-only
  flows (document scanning, carrier-spec extraction, compliance narration).
"""
from . import config
from .anna.llm import PROVIDERS
from .store import kv_delete, kv_get, kv_set

_KV_KEY = "anna.anthropicApiKey"  # kept for backward compat with previously stored keys
_KV_PROVIDER = "anna.provider"
_KV_MODEL = "anna.model"


async def stored_key() -> str | None:
    return await kv_get(_KV_KEY)


async def stored_provider() -> str | None:
    return await kv_get(_KV_PROVIDER)


async def stored_model() -> str | None:
    return await kv_get(_KV_MODEL)


async def effective_provider() -> str:
    return (await stored_provider()) or "anthropic"


async def effective_key() -> str:
    """Key for the currently selected provider (the env key only applies to Anthropic)."""
    k = await stored_key()
    if k:
        return k
    if (await effective_provider()) == "anthropic":
        return config.ANTHROPIC_API_KEY or ""
    return ""


async def anthropic_key() -> str:
    """An Anthropic key for the Anthropic-only flows, regardless of selected provider."""
    if (await effective_provider()) == "anthropic":
        return (await stored_key()) or config.ANTHROPIC_API_KEY or ""
    # OpenAI is selected: only an env Anthropic key can still power Anthropic-only features.
    return config.ANTHROPIC_API_KEY or ""


async def effective_model() -> str | None:
    return (await stored_model()) or None


async def key_source() -> str | None:
    if await stored_key():
        return "ui"
    if (await effective_provider()) == "anthropic" and config.ANTHROPIC_API_KEY:
        return "env"
    return None


def mask_key(k: str | None) -> str | None:
    if k and len(k) > 12:
        return f"{k[:6]}…{k[-4:]}"
    return "••••" if k else None


async def set_settings(*, provider: str, api_key: str, model: str | None = None) -> None:
    await kv_set(_KV_KEY, api_key)
    await kv_set(_KV_PROVIDER, provider if provider in PROVIDERS else "anthropic")
    if model:
        await kv_set(_KV_MODEL, model)
    else:
        await kv_delete(_KV_MODEL)


async def clear_settings() -> None:
    await kv_delete(_KV_KEY)
    await kv_delete(_KV_PROVIDER)
    await kv_delete(_KV_MODEL)
