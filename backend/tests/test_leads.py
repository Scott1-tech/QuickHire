"""Universal lead-intake tests: normalization, dedup, the webhook, inbox+convert.

Runs against the isolated SQLite DB set up by conftest, with ADMIN_PASSWORD unset
so the admin lead routes are reachable (mirrors local/dev).
"""
import pytest
from fastapi.testclient import TestClient

from app.leads import to_canonical


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


# ── Normalization: the same canonical shape from very different payloads ──────
def test_normalize_flat_zapier_payload():
    lead = to_canonical({"full_name": "Jane Roads", "Email": "JANE@EX.com",
                         "phone_number": "512-555-0100", "ad_name": "CDL-A Q3",
                         "years_experience": "4"}, source="generic")
    assert lead["name"] == "Jane Roads"
    assert lead["email"] == "jane@ex.com"          # lowercased
    assert lead["phone"] == "512-555-0100"
    assert lead["campaign"] == "CDL-A Q3"
    assert lead["customFields"].get("years_experience") == "4"


def test_normalize_first_last_and_meta_field_data():
    lead = to_canonical({"first_name": "Sam", "last_name": "Pike",
                         "email_address": "sam@ex.com"}, source="generic")
    assert lead["name"] == "Sam Pike"

    meta = to_canonical({"field_data": [
        {"name": "full_name", "values": ["Meta Driver"]},
        {"name": "email", "values": ["m@ex.com"]},
        {"name": "phone_number", "values": ["+15125550111"]},
    ], "campaign_name": "FB Drivers"}, source="meta", source_id="lg_1")
    assert meta["name"] == "Meta Driver"
    assert meta["email"] == "m@ex.com"
    assert meta["sourceId"] == "lg_1"
    assert meta["campaign"] == "FB Drivers"


# ── Webhook intake creates a review-inbox candidate (never auto-contacts) ─────
def test_generic_webhook_creates_unreviewed_lead(client):
    r = client.post("/api/leads/intake/generic",
                    json={"full_name": "Webhook Wanda", "email": "wanda@ex.com", "phone": "+15125550150"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] == 1 and body["merged"] == 0
    cid = body["results"][0]["candidateId"]

    c = client.get(f"/api/candidates/{cid}").json()
    assert c["stage"] == "Lead"
    assert c["subStatus"] == "new_unreviewed"
    assert c["source"] == "generic"
    assert c["linkSentCount"] == 0                 # NOT contacted on intake
    assert any(a["type"] == "lead_received" for a in c["activity"])


def test_inbox_lists_then_convert_sends_link(client):
    client.post("/api/leads/intake/generic",
                json={"full_name": "Inbox Ian", "email": "ian@ex.com", "phone": "+15125550160"})
    inbox = client.get("/api/leads/inbox").json()
    ian = next(x for x in inbox if x["email"] == "ian@ex.com")

    conv = client.post(f"/api/leads/{ian['id']}/convert", json={"recruiter": "Nina"})
    assert conv.status_code == 200, conv.text
    assert "link" in conv.json()

    c = client.get(f"/api/candidates/{ian['id']}").json()
    assert c["subStatus"] == "in_progress"
    assert c["recruiter"] == "Nina"
    assert c["linkSentCount"] == 1                 # contacted only after review


# ── Dedup / idempotency ──────────────────────────────────────────────────────
def test_duplicate_email_merges_source_not_creates(client):
    client.post("/api/leads/intake/generic", json={"full_name": "Dup Dan", "email": "dan@ex.com"})
    r2 = client.post("/api/leads/intake/indeed", json={"full_name": "Dup Dan", "email": "dan@ex.com"})
    assert r2.json()["created"] == 0
    assert r2.json()["merged"] == 1

    matches = [c for c in client.get("/api/candidates").json() if c["email"] == "dan@ex.com"]
    assert len(matches) == 1
    full = client.get(f"/api/candidates/{matches[0]['id']}").json()
    assert len(full["sources"]) == 2               # both sources recorded


def test_same_source_id_is_idempotent(client):
    payload = {"field_data": [{"name": "email", "values": ["retry@ex.com"]},
                              {"name": "full_name", "values": ["Retry Rita"]}],
               "leadgen_id": "lg_retry_9"}
    meta_body = {"entry": [{"changes": [{"value": payload}]}]}
    a = client.post("/api/leads/intake/meta", json=meta_body)
    b = client.post("/api/leads/intake/meta", json=meta_body)   # webhook retry
    assert a.json()["created"] == 1
    assert b.json()["created"] == 0
    matches = [c for c in client.get("/api/candidates").json() if c["email"] == "retry@ex.com"]
    assert len(matches) == 1


def test_lead_without_contact_is_skipped(client):
    r = client.post("/api/leads/intake/generic", json={"full_name": "No Contact"})
    assert r.json()["created"] == 0 and r.json()["skipped"] == 1


# ── Secret enforcement + status ──────────────────────────────────────────────
def test_generic_secret_enforced_when_configured(client, monkeypatch):
    monkeypatch.setenv("LEAD_WEBHOOK_SECRET", "s3cret")
    bad = client.post("/api/leads/intake/generic", json={"email": "x@ex.com"})
    assert bad.status_code == 401
    ok = client.post("/api/leads/intake/generic", headers={"X-QuickHire-Secret": "s3cret"},
                     json={"full_name": "Auth Amy", "email": "amy@ex.com"})
    assert ok.status_code == 200 and ok.json()["created"] == 1


def test_status_lists_sources_and_intake_url(client):
    s = client.get("/api/leads/status").json()
    types = {src["type"] for src in s["sources"]}
    assert {"generic", "meta", "indeed"} <= types
    assert "/api/leads/intake/" in s["intakeUrlTemplate"]


def test_meta_get_verification_echoes_challenge(client):
    r = client.get("/api/leads/intake/meta", params={"hub.challenge": "abc123"})
    assert r.status_code == 200 and r.text == "abc123"


def test_unknown_source_404(client):
    assert client.post("/api/leads/intake/tiktok-nope", json={}).status_code == 404
