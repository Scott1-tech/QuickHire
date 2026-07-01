"""DocuSign Connect (webhooks): verify HMAC + normalize the event shape."""
import base64
import hashlib
import hmac

from .config import config


def verify_signature(raw_body: bytes | str, signature_header: str | None) -> bool:
    # Fail closed: with no configured secret we cannot authenticate the caller,
    # so reject rather than trust an unverifiable webhook.
    if not config["webhookSecret"]:
        return False
    if not signature_header:
        return False
    body = raw_body.encode() if isinstance(raw_body, str) else (raw_body or b"")
    computed = base64.b64encode(hmac.new(config["webhookSecret"].encode(), body, hashlib.sha256).digest()).decode()
    return hmac.compare_digest(computed, str(signature_header))


def parse_event(body: dict | None) -> dict | None:
    if not body or not isinstance(body, dict):
        return None

    data = body.get("data")
    if isinstance(data, dict) and (data.get("envelopeId") or data.get("envelopeSummary")):
        summary = data.get("envelopeSummary") or {}
        status = str(summary.get("status") or body.get("event") or "").lower()
        if status.startswith("envelope-"):
            status = status[len("envelope-"):]
        signers = ((summary.get("recipients") or {}).get("signers")) or []
        return {
            "envelopeId": data.get("envelopeId") or summary.get("envelopeId"),
            "status": status,
            "completedAt": summary.get("completedDateTime"),
            "recipients": [{"email": s.get("email"), "name": s.get("name"), "status": s.get("status"), "signedAt": s.get("signedDateTime")} for s in signers],
            "raw": body,
        }

    if body.get("envelopeId"):
        return {
            "envelopeId": body.get("envelopeId"),
            "status": str(body.get("status") or "").lower(),
            "completedAt": body.get("completedDateTime") or body.get("completedAt"),
            "recipients": body.get("recipients") or [],
            "raw": body,
        }
    return None
