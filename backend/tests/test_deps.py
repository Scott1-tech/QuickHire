"""Admin auth dependency (constant-time token compare + open-when-unset)."""
import pytest
from fastapi import HTTPException

import app.config as cfg
from app.deps import require_admin


async def test_open_when_no_password_configured(monkeypatch):
    monkeypatch.setattr(cfg, "ADMIN_PASSWORD", "")
    await require_admin(None)  # must not raise


async def test_accepts_matching_token(monkeypatch):
    monkeypatch.setattr(cfg, "ADMIN_PASSWORD", "s3cret")
    await require_admin("s3cret")  # must not raise


async def test_rejects_wrong_token(monkeypatch):
    monkeypatch.setattr(cfg, "ADMIN_PASSWORD", "s3cret")
    with pytest.raises(HTTPException) as exc:
        await require_admin("nope")
    assert exc.value.status_code == 401


async def test_rejects_missing_token_without_crashing(monkeypatch):
    # None must not blow up hmac.compare_digest; it should be a clean 401.
    monkeypatch.setattr(cfg, "ADMIN_PASSWORD", "s3cret")
    with pytest.raises(HTTPException):
        await require_admin(None)
