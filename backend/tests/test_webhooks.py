"""DocuSign Connect webhook: HMAC verification + event normalization."""
import base64
import hashlib
import hmac

import app.docusign.config as dconf
from app.docusign.webhooks import parse_event, verify_signature


def _sign(secret: str, body: bytes) -> str:
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()


def test_verify_fails_closed_when_no_secret_configured(monkeypatch):
    # No secret => caller cannot be authenticated => reject.
    monkeypatch.setitem(dconf.config, "webhookSecret", "")
    assert verify_signature(b"{}", None) is False
    assert verify_signature(b"{}", "anything") is False


def test_verify_accepts_valid_signature(monkeypatch):
    monkeypatch.setitem(dconf.config, "webhookSecret", "shh")
    body = b'{"x":1}'
    assert verify_signature(body, _sign("shh", body)) is True


def test_verify_rejects_bad_or_missing_signature(monkeypatch):
    monkeypatch.setitem(dconf.config, "webhookSecret", "shh")
    assert verify_signature(b'{"x":1}', "bogus") is False
    assert verify_signature(b'{"x":1}', None) is False


def test_verify_handles_str_body(monkeypatch):
    monkeypatch.setitem(dconf.config, "webhookSecret", "shh")
    assert verify_signature("hello", _sign("shh", b"hello")) is True


def test_parse_event_envelope_summary_shape():
    ev = parse_event({
        "data": {
            "envelopeId": "E1",
            "envelopeSummary": {
                "status": "envelope-completed",
                "completedDateTime": "2026-01-01",
                "recipients": {"signers": [
                    {"email": "a@b.c", "name": "A", "status": "completed", "signedDateTime": "2026-01-01"},
                ]},
            },
        },
    })
    assert ev["envelopeId"] == "E1"
    assert ev["status"] == "completed"   # "envelope-" prefix stripped
    assert ev["recipients"][0]["email"] == "a@b.c"


def test_parse_event_flat_shape_lowercases_status():
    ev = parse_event({"envelopeId": "E2", "status": "Sent"})
    assert ev["envelopeId"] == "E2"
    assert ev["status"] == "sent"


def test_parse_event_returns_none_for_unrecognized():
    assert parse_event(None) is None
    assert parse_event({"foo": "bar"}) is None
