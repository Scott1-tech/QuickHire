"""DocuSign authentication (JWT Grant) + a thin authenticated fetch helper."""
import base64
import json
import time
from urllib.parse import urlencode

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from .config import account_base_path, config, is_configured

_cached: dict | None = None  # { accessToken, expiresAt(ms) }


def _b64url(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii").replace("=", "").replace("+", "-").replace("/", "_")


def _build_assertion() -> str:
    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    payload = {
        "iss": config["integrationKey"],
        "sub": config["userId"],
        "aud": config["oauthBase"],
        "iat": now,
        "exp": now + 3600,
        "scope": config["scopes"],
    }
    signing_input = f"{_b64url(json.dumps(header).encode())}.{_b64url(json.dumps(payload).encode())}"
    key = serialization.load_pem_private_key(config["privateKey"].encode(), password=None)
    signature = key.sign(signing_input.encode(), padding.PKCS1v15(), hashes.SHA256())
    return f"{signing_input}.{_b64url(signature)}"


def consent_url(redirect_uri: str = "https://www.docusign.com") -> str:
    params = urlencode({
        "response_type": "code",
        "scope": config["scopes"],
        "client_id": config["integrationKey"],
        "redirect_uri": redirect_uri,
    })
    return f"https://{config['oauthBase']}/oauth/auth?{params}"


async def get_access_token() -> str:
    global _cached
    if not is_configured():
        raise RuntimeError("DocuSign is not configured (missing integration key, user id, account id, or private key).")
    if _cached and _cached["expiresAt"] > time.time() * 1000 + 60_000:
        return _cached["accessToken"]

    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            f"https://{config['oauthBase']}/oauth/token",
            headers={"content-type": "application/x-www-form-urlencoded"},
            data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": _build_assertion()},
        )
    data = {}
    try:
        data = res.json()
    except Exception:  # noqa: BLE001
        pass
    if not res.is_success:
        if data.get("error") == "consent_required":
            raise RuntimeError(f"DocuSign consent required — grant it once at: {consent_url()}")
        raise RuntimeError(f"DocuSign token error {res.status_code}: {data.get('error', '')} {data.get('error_description', '')}".strip())
    _cached = {"accessToken": data["access_token"], "expiresAt": time.time() * 1000 + (float(data.get("expires_in", 3600)) * 1000)}
    return _cached["accessToken"]


def reset_token() -> None:
    global _cached
    _cached = None


async def api_fetch(path_after_account: str, opts: dict | None = None, raw: bool = False):
    opts = opts or {}
    token = await get_access_token()
    headers = {"authorization": f"Bearer {token}", **(opts.get("headers") or {})}
    body = opts.get("body")
    json_body = None
    content = None
    if body is not None and isinstance(body, (dict, list)):
        json_body = body
    elif body is not None:
        content = body

    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.request(
            opts.get("method", "GET"),
            f"{account_base_path()}{path_after_account}",
            headers=headers,
            json=json_body,
            content=content,
        )
    if raw:
        if not res.is_success:
            raise RuntimeError(f"DocuSign API {res.status_code} on {path_after_account}")
        return res
    data = {}
    try:
        data = res.json()
    except Exception:  # noqa: BLE001
        pass
    if not res.is_success:
        raise RuntimeError(f"DocuSign API {res.status_code} on {path_after_account}: {data.get('message') or data.get('errorCode') or ''}".strip())
    return data
