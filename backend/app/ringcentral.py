"""RingCentral integration — SMS send, call logging, communication history.

Set these env vars to enable:
  RINGCENTRAL_CLIENT_ID, RINGCENTRAL_CLIENT_SECRET,
  RINGCENTRAL_JWT_TOKEN  (preferred) or RINGCENTRAL_USERNAME / RINGCENTRAL_PASSWORD,
  RINGCENTRAL_ACCOUNT_ID (default: ~), RINGCENTRAL_FROM (your RC phone/ext number),
  RINGCENTRAL_SERVER (default: https://platform.ringcentral.com)
"""
import os

import httpx

SERVER = os.environ.get("RINGCENTRAL_SERVER", "https://platform.ringcentral.com")
CLIENT_ID = os.environ.get("RINGCENTRAL_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("RINGCENTRAL_CLIENT_SECRET", "")
JWT_TOKEN = os.environ.get("RINGCENTRAL_JWT_TOKEN", "")
RC_FROM = os.environ.get("RINGCENTRAL_FROM", "")
ACCOUNT_ID = os.environ.get("RINGCENTRAL_ACCOUNT_ID", "~")

_cached_token: dict = {}


def is_configured() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET and (JWT_TOKEN) and RC_FROM)


async def _get_access_token() -> str:
    """Obtain a short-lived access token via JWT grant."""
    global _cached_token
    import time
    if _cached_token.get("token") and _cached_token.get("expires_at", 0) > time.time() + 60:
        return _cached_token["token"]

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{SERVER}/restapi/oauth/token",
            data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": JWT_TOKEN},
            auth=(CLIENT_ID, CLIENT_SECRET),
        )
        r.raise_for_status()
        data = r.json()
    import time
    _cached_token = {"token": data["access_token"], "expires_at": time.time() + data.get("expires_in", 3600)}
    return _cached_token["token"]


async def send_sms(to: str, text: str) -> dict:
    """Send an SMS via RingCentral."""
    if not is_configured():
        return {"ok": False, "error": "RingCentral not configured"}
    token = await _get_access_token()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            f"{SERVER}/restapi/v1.0/account/{ACCOUNT_ID}/extension/~/sms",
            json={"from": {"phoneNumber": RC_FROM}, "to": [{"phoneNumber": to}], "text": text},
            headers={"Authorization": f"Bearer {token}"},
        )
        r.raise_for_status()
        data = r.json()
    return {"ok": True, "messageId": data.get("id"), "status": data.get("messageStatus")}


async def log_call(to: str, result: str, duration: int = 0, notes: str = "") -> dict:
    """Log a manual call record (internal only — no RC API needed)."""
    from .definitions import now_iso
    return {
        "type": "call_log",
        "to": to,
        "result": result,
        "duration": duration,
        "notes": notes,
        "loggedAt": now_iso(),
        "source": "ringcentral",
    }


async def get_call_history(extension: str = "~", date_from: str = "") -> list:
    """Fetch recent call log entries from RingCentral."""
    if not is_configured():
        return []
    try:
        token = await _get_access_token()
        params = {"perPage": 50, "direction": "Outbound"}
        if date_from:
            params["dateFrom"] = date_from
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(
                f"{SERVER}/restapi/v1.0/account/{ACCOUNT_ID}/extension/{extension}/call-log",
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )
            r.raise_for_status()
            data = r.json()
        return data.get("records") or []
    except Exception:  # noqa: BLE001
        return []


async def list_phone_numbers() -> list:
    """Fetch the account's provisioned phone numbers with SMS/voice features."""
    if not is_configured():
        return []
    try:
        token = await _get_access_token()
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(
                f"{SERVER}/restapi/v1.0/account/{ACCOUNT_ID}/phone-number",
                params={"perPage": 1000},
                headers={"Authorization": f"Bearer {token}"},
            )
            r.raise_for_status()
            data = r.json()
    except Exception:  # noqa: BLE001
        return []
    out = []
    for rec in data.get("records") or []:
        feats = rec.get("features") or []
        ext = rec.get("extension") or {}
        out.append({
            "phoneNumber": rec.get("phoneNumber", ""),
            "label": rec.get("label") or ext.get("name") or (rec.get("usageType") or "Number").replace("Number", " Number"),
            "extensionId": str(ext.get("id") or ext.get("extensionNumber") or ""),
            "smsEnabled": "SmsSender" in feats or "A2PSmsSender" in feats,
            "callsEnabled": "VoiceUser" in feats or rec.get("type") in (None, "VoiceFax", "Voice"),
            "assignedUser": ext.get("name") or "",
        })
    return out
