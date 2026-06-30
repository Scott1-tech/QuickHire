"""API integration tests (FastAPI TestClient over an isolated SQLite DB).

Covers the public driver-facing apply lifecycle end to end plus the link-expiry
helper. The admin candidate routes are reachable because conftest leaves
ADMIN_PASSWORD unset (open dashboard), mirroring local/dev.
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import config as cfg
from app.routers.apply import _link_expired


@pytest.fixture(scope="session", autouse=True)
def _create_schema():
    # Create tables synchronously (no event loop) so the async aiosqlite engine
    # — used only inside the TestClient's loop — never has to create them.
    from sqlalchemy import create_engine

    from app import models  # noqa: F401  (registers tables on Base.metadata)
    from app.db import Base

    sync_url = cfg.DATABASE_URL.replace("+aiosqlite", "")
    eng = create_engine(sync_url)
    Base.metadata.create_all(eng)
    eng.dispose()


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


def _make_candidate(client, name, email):
    created = client.post("/api/candidates", json={"name": name, "email": email})
    assert created.status_code == 200, created.text
    cid = created.json()["id"]
    token = client.get(f"/api/candidates/{cid}").json()["token"]
    return cid, token


def test_healthz_ok(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_apply_unknown_token_is_404(client):
    r = client.get("/api/apply/not-a-real-token")
    assert r.status_code == 404


def test_apply_full_lifecycle(client):
    _cid, token = _make_candidate(client, "Test Driver", "td@example.com")

    pending = client.get(f"/api/apply/{token}")
    assert pending.status_code == 200
    assert pending.json()["status"] == "pending"

    submit = client.post(f"/api/apply/{token}", json={"application": {"firstName": "Test"}})
    assert submit.status_code == 200
    assert submit.json()["ok"] is True

    after = client.get(f"/api/apply/{token}")
    assert after.json()["status"] == "submitted"

    # Second submit is rejected as already-submitted.
    again = client.post(f"/api/apply/{token}", json={"application": {"firstName": "Test"}})
    assert again.status_code == 409


def test_apply_missing_application_data_is_400(client):
    _cid, token = _make_candidate(client, "No App", "noapp@example.com")
    r = client.post(f"/api/apply/{token}", json={})
    assert r.status_code == 400


def test_create_candidate_requires_name_and_email(client):
    r = client.post("/api/candidates", json={"name": "Nameless"})
    assert r.status_code == 400


def test_link_expired_helper():
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    assert _link_expired({"linkExpiresAt": past}) is True
    assert _link_expired({"linkExpiresAt": future}) is False
    assert _link_expired({}) is False                       # no expiry set
    assert _link_expired({"linkExpiresAt": "garbage"}) is False
