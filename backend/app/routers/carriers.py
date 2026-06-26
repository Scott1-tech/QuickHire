"""/api/carriers/*, /api/carrier-intake/*, /api/carrier-form."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request

from .. import config
from ..definitions import CARRIER_FIELD_IDS, CARRIER_FORM, now_iso
from ..deps import base_url, require_admin
from ..errors import error
from ..messaging import deliver_email, dispatch_carrier_link
from ..store import (
    add_activity,
    delete_carrier,
    find_carrier_by_id,
    find_carrier_by_token,
    new_uuid,
    read_carriers,
    upsert_carrier,
)

router = APIRouter()


def _clean_requirements(input_: dict | None = None) -> dict:
    input_ = input_ or {}
    out = {}
    for fid in CARRIER_FIELD_IDS:
        v = input_.get(fid)
        if v is not None and str(v).strip() != "":
            out[fid] = str(v).strip()
    return out


def _carrier_progress(c: dict) -> dict:
    reqs = c.get("requirements") or {}
    filled = len([fid for fid in CARRIER_FIELD_IDS if reqs.get(fid)])
    return {"filled": filled, "total": len(CARRIER_FIELD_IDS)}


def _carrier_summary(c: dict) -> dict:
    return {
        "id": c.get("id"), "name": c.get("name"), "ownerName": c.get("ownerName") or "", "email": c.get("email") or "", "phone": c.get("phone") or "",
        "status": c.get("status"), "filledBy": c.get("filledBy"), "mode": c.get("mode"),
        "createdAt": c.get("createdAt"), "updatedAt": c.get("updatedAt"), "submittedAt": c.get("submittedAt"),
        "linkSentCount": c.get("linkSentCount") or 0, "linkLastSentAt": c.get("linkLastSentAt"),
        "linkLastStatus": c.get("linkLastStatus"), "linkExpiresAt": c.get("linkExpiresAt"),
        "progress": _carrier_progress(c),
    }


def _link_expired(c: dict) -> bool:
    exp = c.get("linkExpiresAt")
    if not exp:
        return False
    try:
        return datetime.fromisoformat(str(exp).replace("Z", "+00:00")) < datetime.now(timezone.utc)
    except ValueError:
        return False


EXPIRED_MSG = f"This link has expired. Please contact {config.COMPANY_NAME} at {config.SUPPORT_CONTACT} for a new one."


@router.get("/api/carrier-form")
async def carrier_form():
    return {"sections": CARRIER_FORM}


@router.get("/api/carriers", dependencies=[Depends(require_admin)])
async def list_carriers(request: Request):
    search = (request.query_params.get("search") or "").lower()
    lst = [_carrier_summary(c) for c in await read_carriers()]
    if search:
        lst = [c for c in lst if search in (c.get("name") or "").lower() or search in (c.get("email") or "").lower()]
    lst.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    return lst


@router.post("/api/carriers", dependencies=[Depends(require_admin)])
async def create_carrier(request: Request):
    body = await request.json()
    name = body.get("name")
    if not name or not str(name).strip():
        raise error(400, "Company name is required.")
    m = "self" if body.get("mode") == "self" else "invite"
    if m == "invite" and not body.get("email") and not body.get("phone"):
        raise error(400, "Add an email or phone so we can send the carrier their link.")

    now = now_iso()
    carrier = {
        "id": new_uuid(),
        "token": None,
        "name": str(name).strip(),
        "ownerName": str(body.get("ownerName")).strip() if body.get("ownerName") else "",
        "email": str(body.get("email")).strip() if body.get("email") else "",
        "phone": str(body.get("phone")).strip() if body.get("phone") else "",
        "mode": m,
        "status": "completed" if m == "self" else "awaiting_carrier",
        "filledBy": "recruiter" if m == "self" else None,
        "requirements": _clean_requirements(body.get("requirements")) if m == "self" else {},
        "createdAt": now, "updatedAt": now, "submittedAt": now if m == "self" else None,
        "linkSentCount": 0, "linkLastSentAt": None, "linkLastChannels": [], "linkLastStatus": None, "linkExpiresAt": None,
        "activity": [{"id": new_uuid(), "type": "carrier_created", "by": "Recruiter", "at": now,
                      "note": f"Carrier profile created ({'filled by recruiter' if m == 'self' else 'invite sent to carrier'})."}],
    }

    dispatch = None
    if m == "invite":
        dispatch = await dispatch_carrier_link(carrier, base_url(request), regenerate=True)
    await upsert_carrier(carrier)

    return {
        "id": carrier["id"],
        "status": carrier["status"],
        "link": (dispatch or {}).get("link"),
        "email": (dispatch or {}).get("email"),
        "sms": (dispatch or {}).get("sms"),
        "anySuccess": (dispatch or {}).get("anySuccess"),
    }


@router.get("/api/carriers/{cid}", dependencies=[Depends(require_admin)])
async def get_carrier(cid: str):
    c = await find_carrier_by_id(cid)
    if not c:
        raise error(404, "Not found")
    safe = {k: v for k, v in c.items() if k != "token"}
    return {**safe, "sections": CARRIER_FORM, "progress": _carrier_progress(c), "hasLink": bool(c.get("token"))}


@router.patch("/api/carriers/{cid}", dependencies=[Depends(require_admin)])
async def update_carrier(cid: str, request: Request):
    c = await find_carrier_by_id(cid)
    if not c:
        raise error(404, "Not found")
    body = await request.json()
    now = now_iso()
    if body.get("name") is not None:
        c["name"] = str(body["name"]).strip()
    if body.get("ownerName") is not None:
        c["ownerName"] = str(body["ownerName"]).strip()
    if body.get("email") is not None:
        c["email"] = str(body["email"]).strip()
    if body.get("phone") is not None:
        c["phone"] = str(body["phone"]).strip()
    if body.get("requirements") is not None:
        c["requirements"] = _clean_requirements(body["requirements"])
        c["status"] = "completed"
        if not c.get("submittedAt"):
            c["submittedAt"] = now
        if not c.get("filledBy"):
            c["filledBy"] = "recruiter"
        add_activity(c, "requirements_updated", "Recruiter", "Requirements updated by recruiter.")
    c["updatedAt"] = now
    await upsert_carrier(c)
    return {"ok": True, "status": c.get("status"), "progress": _carrier_progress(c)}


@router.post("/api/carriers/{cid}/resend", dependencies=[Depends(require_admin)])
async def resend_carrier(cid: str, request: Request):
    c = await find_carrier_by_id(cid)
    if not c:
        raise error(404, "Not found")
    body = await request.json()
    if body.get("email") is not None:
        c["email"] = str(body["email"]).strip()
    if body.get("phone") is not None:
        c["phone"] = str(body["phone"]).strip()
    if not c.get("email") and not c.get("phone"):
        raise error(400, "Add an email or phone first.")
    dispatch = await dispatch_carrier_link(c, base_url(request), regenerate=True)
    if c.get("status") != "completed":
        c["status"] = "awaiting_carrier"
    await upsert_carrier(c)
    return {"link": dispatch["link"], "email": dispatch["email"], "sms": dispatch["sms"], "anySuccess": dispatch["anySuccess"]}


@router.delete("/api/carriers/{cid}", dependencies=[Depends(require_admin)])
async def remove_carrier(cid: str):
    if not await delete_carrier(cid):
        raise error(404, "Not found")
    return {"ok": True}


@router.get("/api/carrier-intake/{token}")
async def carrier_intake(token: str):
    c = await find_carrier_by_token(token)
    if not c:
        raise error(404, "This link is not valid. Please contact us for a new one.")
    if _link_expired(c):
        raise error(410, EXPIRED_MSG, expired=True)
    return {
        "name": c.get("name"), "ownerName": c.get("ownerName") or "", "companyName": config.COMPANY_NAME,
        "status": c.get("status"), "sections": CARRIER_FORM, "requirements": c.get("requirements") or {},
        "expiresAt": c.get("linkExpiresAt"),
    }


@router.post("/api/carrier-intake/{token}")
async def carrier_intake_submit(token: str, request: Request):
    c = await find_carrier_by_token(token)
    if not c:
        raise error(404, "This link is not valid. Please contact us for a new one.")
    if _link_expired(c):
        raise error(410, EXPIRED_MSG, expired=True)
    body = await request.json()
    requirements = body.get("requirements")
    if not requirements or not isinstance(requirements, dict):
        raise error(400, "Missing requirements.")

    first_time = c.get("status") != "completed"
    c["requirements"] = _clean_requirements(requirements)
    c["status"] = "completed"
    c["filledBy"] = "carrier"
    c["submittedAt"] = now_iso()
    c["updatedAt"] = c["submittedAt"]
    add_activity(c, "requirements_submitted", "Carrier", f"Carrier {'submitted' if first_time else 'updated'} their requirements.")
    await upsert_carrier(c)

    if config.NOTIFY_EMAIL:
        try:
            await deliver_email(config.NOTIFY_EMAIL, f"Carrier requirements received — {c['name']}",
                                f"<p><strong>{c['name']}</strong> {'completed' if first_time else 'updated'} their carrier requirements profile.</p><p>View it in the QuickHire carriers dashboard.</p>", "")
        except Exception:  # noqa: BLE001
            pass
    return {"ok": True}
