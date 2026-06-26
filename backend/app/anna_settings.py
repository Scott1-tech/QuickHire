"""Anna's effective AI provider + API key — UI-provided (server-side) or env.

Supports Claude (Anthropic, default) or OpenAI. A key entered in the app's Anna
Settings is stored server-side (KV table) and takes precedence over
ANTHROPIC_API_KEY (which only applies when the provider is Anthropic). Only a
masked hint is ever returned to the client.
"""
from . import config
from .store import kv_delete, kv_get, kv_set

# Back-compat: the original single-key store used "anna.anthropicApiKey".
_KEY = "anna.apiKey"
_LEGACY_KEY = "anna.anthropicApiKey"
_PROVIDER = "anna.provider"
_MODEL = "anna.model"

PROVIDERS = ["anthropic", "openai"]


async def provider() -> str:
    return (await kv_get(_PROVIDER)) or "anthropic"


async def stored_key() -> str | None:
    return (await kv_get(_KEY)) or (await kv_get(_LEGACY_KEY))


async def model() -> str | None:
    return await kv_get(_MODEL)


async def effective_key() -> str:
    k = await stored_key()
    if k:
        return k
    return config.ANTHROPIC_API_KEY if (await provider()) == "anthropic" else ""


async def key_source() -> str | None:
    if await stored_key():
        return "ui"
    return "env" if (await provider()) == "anthropic" and config.ANTHROPIC_API_KEY else None


def mask_key(k: str | None) -> str | None:
    if k and len(k) > 12:
        return f"{k[:6]}…{k[-4:]}"
    return "••••" if k else None


async def set_settings(prov: str, api_key: str, model_override: str | None = None) -> None:
    await kv_set(_PROVIDER, prov)
    await kv_set(_KEY, api_key)
    if model_override:
        await kv_set(_MODEL, model_override)
    else:
        await kv_delete(_MODEL)
    await kv_delete(_LEGACY_KEY)  # migrate off the old key


async def clear_settings() -> None:
    await kv_delete(_KEY)
    await kv_delete(_LEGACY_KEY)
    await kv_delete(_PROVIDER)
    await kv_delete(_MODEL)
