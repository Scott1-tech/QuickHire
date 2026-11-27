"""In-app calling: RingCentral Embeddable config, call-log fields, and the
webhook attaching a call recording to the matching call log."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session", autouse=True)
def _create_schema():
    from sqlalchemy import create_engine

    from app import config as cfg
    from app import models  # noqa: F401
    from app.db import Base

    eng = create_engine(cfg.DATABASE_URL.replace("+aiosqlite", ""))
    Base.metadata.create_all(eng)
    eng.dispose()


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


def test_embed_config_defaults_to_demo(client, monkeypatch):
    monkeypatch.delenv("RINGCENTRAL_EMBED_CLIENT_ID", raising=False)
    r = client.get("/api/ringcentral/embed-config")
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"clientId", "mode", "callerId", "updatedAt"}
    assert body["mode"] in ("browser", "ringout")


def test_embed_config_round_trip(client):
    r = client.put("/api/ringcentral/embed-config", json={"clientId": "AbC123_def-456", "mode": "ringout", "callerId": "+12145551000"})
    assert r.status_code == 200, r.text
    saved = r.json()
    assert saved["clientId"] == "AbC123_def-456"
    assert saved["mode"] == "ringout"
    assert saved["callerId"] == "+12145551000"
    assert saved["updatedAt"]
    assert client.get("/api/ringcentral/embed-config").json() == saved
    # snake_case keys are accepted too; clearing the client id goes back to demo
    r = client.put("/api/ringcentral/embed-config", json={"client_id": "", "mode": "browser"})
    assert r.status_code == 200
    assert r.json()["clientId"] == "" and r.json()["mode"] == "browser"


@pytest.mark.parametrize("payload", [
    {"clientId": "bad id with spaces", "mode": "browser"},
    {"clientId": "abc", "mode": "browser"},                      # too short
    {"clientId": "x" * 65, "mode": "browser"},                   # too long
    {"clientId": "https://evil.example/x", "mode": "browser"},   # URL smuggling
    {"clientId": "AbC123_def-456", "mode": "carrier-pigeon"},
    {"clientId": "AbC123_def-456", "mode": "browser", "callerId": "1" * 40},
])
def test_embed_config_rejects_invalid(client, payload):
    r = client.put("/api/ringcentral/embed-config", json=payload)
    assert r.status_code == 400, r.text
    assert "error" in r.json()


def test_embed_config_requires_admin(client, monkeypatch):
    from app import config

    monkeypatch.setattr(config, "ADMIN_PASSWORD", "s3cret")
    assert client.get("/api/ringcentral/embed-config").status_code == 401
    assert client.put("/api/ringcentral/embed-config", json={"clientId": "", "mode": "browser"}).status_code == 401
    ok = client.get("/api/ringcentral/embed-config", headers={"X-Admin-Token": "s3cret"})
    assert ok.status_code == 200


def test_call_log_keeps_in_app_call_fields(client):
    r = client.post("/api/drivers/p1/call-log", json={
        "to": "+15550100101", "outcome": "connected", "notes": "Talked pay", "durationSec": 74.6,
        "direction": "outbound", "callId": "sess-123", "recordKind": "driver", "source": "demo",
    })
    assert r.status_code == 200, r.text
    m = r.json()["message"]
    assert m["callOutcome"] == "connected" and m["durationSec"] == 74 and m["callId"] == "sess-123"
    missed = client.post("/api/drivers/p1/call-log", json={"outcome": "missed", "direction": "inbound", "durationSec": "x"}).json()["message"]
    assert missed["status"] == "missed" and missed["direction"] == "inbound" and missed["durationSec"] == 0


def test_webhook_attaches_recording_to_matching_call(client):
    client.post("/api/drivers/p2/call-log", json={"to": "+15550100102", "outcome": "connected", "callId": "tel-sess-777"})
    event = {"event": "/restapi/v1.0/account/~/extension/~/telephony/sessions", "body": {
        "telephonySessionId": "tel-sess-777",
        "parties": [{"recordings": [{"id": "rec-42", "active": False}]}],
    }}
    r = client.post("/api/ringcentral/webhook", json=event)
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "recordingAttached": True}
    msgs = client.get("/api/drivers/p2/messages").json()
    call = next(m for m in msgs if m.get("callId") == "tel-sess-777")
    assert call["recording"] == {"id": "rec-42", "url": ""}
    # no SMS was fabricated from the telephony event
    assert not any(m["channel"] == "sms" and m["direction"] == "inbound" and m["body"] == "" for m in msgs)


def test_webhook_recording_for_unknown_call_is_safe(client):
    r = client.post("/api/ringcentral/webhook", json={"body": {"sessionId": "nope", "recording": {"id": "r1", "contentUri": "javascript:alert(1)"}}})
    assert r.status_code == 200
    assert r.json()["recordingAttached"] is False


def test_webhook_still_handles_inbound_sms(client):
    r = client.post("/api/ringcentral/webhook", json={"body": {"subject": "Is the job still open?", "from": {"phoneNumber": "+14695550188"}}})
    assert r.status_code == 200 and r.json() == {"ok": True}


def test_webhook_verification_token_is_enforced_when_configured(client, monkeypatch):
    monkeypatch.setenv("RINGCENTRAL_WEBHOOK_TOKEN", "tok")
    body = {"body": {"subject": "hi", "from": {"phoneNumber": "+14695550188"}}}
    assert client.post("/api/ringcentral/webhook", json=body).status_code == 401
    assert client.post("/api/ringcentral/webhook", json=body, headers={"Verification-Token": "tok"}).status_code == 200
    # the subscription handshake is always answered
    hs = client.post("/api/ringcentral/webhook", headers={"Validation-Token": "abc"})
    assert hs.status_code == 200 and hs.headers.get("validation-token") == "abc"


def test_spa_shell_sets_backend_marker_cookie(client):
    import os

    from app import config

    if not os.path.exists(os.path.join(config.PUBLIC_DIR, "app", "index.html")):
        pytest.skip("SPA build not present")
    r = client.get("/app/")
    assert r.status_code == 200
    assert "qh_backend=1" in r.headers.get("set-cookie", "")
    # built assets don't carry it
    assets = os.path.join(config.PUBLIC_DIR, "app", "assets")
    js = next((f for f in os.listdir(assets) if f.endswith(".js")), None) if os.path.isdir(assets) else None
    if js:
        assert "qh_backend" not in client.get(f"/app/assets/{js}").headers.get("set-cookie", "")
