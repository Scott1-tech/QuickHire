"""Data-access layer — a thin async mirror of server.js's JSON helpers.

Every function opens its own short transaction (like the old read-file /
write-file helpers), so callers don't have to thread a session through deep
call chains (e.g. the DocuSign reconcile logic).
"""
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select

from .db import async_session
from .definitions import empty_checklist, now_iso
from .models import Candidate, Carrier, OptOut, Portfolio


def new_uuid() -> str:
    return str(uuid.uuid4())


def new_token() -> str:
    return uuid.uuid4().hex + uuid.uuid4().hex[:16]  # 48 hex chars ≈ 24 random bytes


# ── SMS opt-out registry (TCPA STOP handling) ───────────────────────────────
def norm_phone(p) -> str:
    digits = re.sub(r"[^0-9]", "", str(p or ""))
    return re.sub(r"^1(\d{10})$", r"\1", digits)


async def is_opted_out(phone) -> bool:
    n = norm_phone(phone)
    if not n:
        return False
    async with async_session() as s:
        row = await s.get(OptOut, n)
        return row is not None


async def add_optout(phone) -> None:
    n = norm_phone(phone)
    if not n:
        return
    async with async_session() as s:
        if not await s.get(OptOut, n):
            s.add(OptOut(phone=n))
            await s.commit()


async def remove_optout(phone) -> None:
    n = norm_phone(phone)
    async with async_session() as s:
        await s.execute(delete(OptOut).where(OptOut.phone == n))
        await s.commit()


# ── Candidate migration (parity with legacy import) ─────────────────────────
def _copy_driver_docs(driver_files: dict) -> dict:
    docs = {}
    for src in ("cdlFront", "cdlBack", "medicalCard"):
        if driver_files.get(src):
            docs[src] = {**driver_files[src], "uploadedAt": now_iso(), "uploadedBy": "Driver"}
    return docs


def migrate(r: dict) -> dict:
    if r.get("stage"):
        return r
    app = r.get("application") or {}
    consent_done = app.get("consentPsp") and app.get("consentMvr") and app.get("consentEmployment")
    out = {
        **r,
        "stage": "Lead",
        "subStatus": "in_progress",
        "recruiter": "Admin",
        "stageChangedAt": r.get("createdAt"),
        "lastActivityAt": r.get("submittedAt") or r.get("createdAt"),
        "linkSentCount": 1,
        "linkLastSentAt": r.get("createdAt"),
        "linkLastChannels": ["email"],
        "linkLastStatus": "sent",
        "linkExpiresAt": r.get("linkExpiresAt"),
        "consentCompletedAt": r.get("submittedAt") if consent_done else None,
        "driverFiles": r.get("files") or {},
        "signature": r.get("signature"),
        "checklist": empty_checklist(),
        "documents": _copy_driver_docs(r.get("files") or {}),
        "pev": [{"companyName": e.get("companyName", ""), "status": "not_started", "notes": "", "verifiedDate": None} for e in (app.get("employers") or [])],
        "activity": ([{"id": new_uuid(), "type": "application_submitted", "by": "Driver", "at": r.get("submittedAt"), "note": "Driver submitted their application."}] if r.get("submittedAt") else []),
    }
    out.pop("status", None)
    out.pop("files", None)
    return out


def add_activity(candidate: dict, type_: str, by: str, note: str, **meta) -> None:
    candidate.setdefault("activity", [])
    candidate["activity"].append({"id": new_uuid(), "type": type_, "by": by, "at": now_iso(), "note": note, **meta})
    candidate["lastActivityAt"] = now_iso()


# ── Candidate data layer ─────────────────────────────────────────────────────
async def read_all() -> list[dict]:
    async with async_session() as s:
        rows = (await s.execute(select(Candidate))).scalars().all()
    return [migrate(r.data) for r in rows]


async def find_by_id(cid: str) -> dict | None:
    async with async_session() as s:
        row = await s.get(Candidate, cid)
    return migrate(row.data) if row else None


async def find_by_token(token: str) -> dict | None:
    async with async_session() as s:
        row = (await s.execute(select(Candidate).where(Candidate.token == token))).scalars().first()
    return migrate(row.data) if row else None


async def upsert(record: dict) -> dict:
    async with async_session() as s:
        row = await s.get(Candidate, record["id"])
        if row:
            row.data = record
            row.token = record.get("token")
        else:
            s.add(Candidate(id=record["id"], token=record.get("token"), data=record))
        await s.commit()
    return record


# ── Carrier data layer ───────────────────────────────────────────────────────
async def read_carriers() -> list[dict]:
    async with async_session() as s:
        rows = (await s.execute(select(Carrier))).scalars().all()
    return [r.data for r in rows]


async def find_carrier_by_id(cid: str) -> dict | None:
    async with async_session() as s:
        row = await s.get(Carrier, cid)
    return row.data if row else None


async def find_carrier_by_token(token: str) -> dict | None:
    async with async_session() as s:
        row = (await s.execute(select(Carrier).where(Carrier.token == token))).scalars().first()
    return row.data if row else None


async def upsert_carrier(carrier: dict) -> dict:
    async with async_session() as s:
        row = await s.get(Carrier, carrier["id"])
        if row:
            row.data = carrier
            row.token = carrier.get("token")
        else:
            s.add(Carrier(id=carrier["id"], token=carrier.get("token"), data=carrier))
        await s.commit()
    return carrier


async def delete_carrier(cid: str) -> bool:
    async with async_session() as s:
        row = await s.get(Carrier, cid)
        if not row:
            return False
        await s.delete(row)
        await s.commit()
    return True


# ── Portfolio data layer ─────────────────────────────────────────────────────
async def read_portfolios() -> list[dict]:
    async with async_session() as s:
        rows = (await s.execute(select(Portfolio))).scalars().all()
    return [r.data for r in rows]


async def find_portfolio(pid: str) -> dict | None:
    async with async_session() as s:
        row = await s.get(Portfolio, pid)
    return row.data if row else None


async def upsert_portfolio(p: dict) -> dict:
    async with async_session() as s:
        row = await s.get(Portfolio, p["id"])
        if row:
            row.data = p
        else:
            s.add(Portfolio(id=p["id"], data=p))
        await s.commit()
    return p
