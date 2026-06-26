"""Driver-facing apply routes (public, token-gated) + legacy admin compat."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from .. import config
from ..definitions import now_iso
from ..deps import require_admin
from ..errors import error
from ..files import decode_and_save, resolve_file
from ..messaging import send_plain_email
from ..store import _copy_driver_docs as copy_driver_docs
from ..store import add_activity, find_by_id, find_by_token, read_all, upsert

router = APIRouter()

EXPIRED_MSG = f"This link has expired. Please contact {config.COMPANY_NAME} at {config.SUPPORT_CONTACT} for a new one."


def _link_expired(c: dict) -> bool:
    exp = c.get("linkExpiresAt")
    if not exp:
        return False
    try:
        return datetime.fromisoformat(str(exp).replace("Z", "+00:00")) < datetime.now(timezone.utc)
    except ValueError:
        return False


@router.get("/api/apply/{token}")
async def get_apply(token: str):
    c = await find_by_token(token)
    if not c:
        raise error(404, "This application link is not valid. Please contact the company for a new one.")
    if c.get("submittedAt"):
        return {"name": c.get("name"), "email": c.get("email"), "phone": c.get("phone"), "status": "submitted", "companyName": config.COMPANY_NAME}
    if _link_expired(c):
        raise error(410, EXPIRED_MSG, expired=True)
    return {"name": c.get("name"), "email": c.get("email"), "phone": c.get("phone"), "status": "pending", "companyName": config.COMPANY_NAME, "expiresAt": c.get("linkExpiresAt")}


@router.post("/api/apply/{token}")
async def submit_apply(token: str, request: Request):
    c = await find_by_token(token)
    if not c:
        raise error(404, "This application link is not valid. Please contact the company for a new one.")
    if c.get("submittedAt"):
        raise error(409, "Already submitted.")
    if _link_expired(c):
        raise error(410, EXPIRED_MSG, expired=True)

    body = await request.json()
    application = body.get("application")
    files = body.get("files")
    signature = body.get("signature")
    if not application:
        raise error(400, "Missing application data.")

    directory = c["id"]
    driver_files = {}
    for field in ("cdlFront", "cdlBack", "medicalCard"):
        if (files or {}).get(field):
            s = decode_and_save(directory, field, files[field])
            if s:
                driver_files[field] = s
    if (signature or {}).get("dataUrl"):
        s = decode_and_save(directory, "signature", signature)
        if s:
            driver_files["signature"] = s

    c["application"] = application
    c["signature"] = {"mode": signature.get("mode"), "name": signature.get("name") or ""} if signature else None
    c["driverFiles"] = driver_files
    c["documents"] = {**copy_driver_docs(driver_files), **(c.get("documents") or {})}
    c["submittedAt"] = now_iso()
    c["lastActivityAt"] = c["submittedAt"]
    employers = application.get("employers") or []
    existing_pev = c.get("pev") or []
    c["pev"] = [
        existing_pev[i] if i < len(existing_pev) and existing_pev[i] else {"companyName": e.get("companyName") or "", "status": "not_started", "notes": "", "verifiedDate": None}
        for i, e in enumerate(employers)
    ]
    c["consentCompletedAt"] = c["submittedAt"] if (application.get("consentPsp") and application.get("consentMvr") and application.get("consentEmployment")) else None
    add_activity(c, "application_submitted", "Driver", "Driver submitted their application.")
    await upsert(c)

    if config.NOTIFY_EMAIL:
        try:
            await send_plain_email(config.NOTIFY_EMAIL, f"New driver application — {c['name']}",
                                   f"<p><strong>{c['name']}</strong> ({c['email']}) submitted their driver application.</p><p>View it in the QuickHire workdeck dashboard.</p>")
        except Exception:  # noqa: BLE001
            pass
    return {"ok": True}


# ── Legacy compat ────────────────────────────────────────────────────────────
@router.get("/api/admin/applications", dependencies=[Depends(require_admin)])
async def legacy_applications():
    return [{
        "id": c.get("id"), "name": c.get("name"), "email": c.get("email"),
        "status": "submitted" if c.get("submittedAt") else "invited",
        "createdAt": c.get("createdAt"), "submittedAt": c.get("submittedAt"), "token": c.get("token"),
    } for c in await read_all()]


@router.get("/api/admin/applications/{cid}", dependencies=[Depends(require_admin)])
async def legacy_application(cid: str):
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    return c


@router.get("/api/admin/files/{cid}/{field}", dependencies=[Depends(require_admin)])
async def legacy_file(cid: str, field: str):
    c = await find_by_id(cid)
    meta = ((c or {}).get("driverFiles") or {}).get(field) or ((c or {}).get("documents") or {}).get(field)
    path = resolve_file((meta or {}).get("stored"))
    if not path:
        raise error(404, "Not found")

    def it():
        with open(path, "rb") as fh:
            while chunk := fh.read(65536):
                yield chunk
    return StreamingResponse(it(), media_type=meta.get("mime") or "application/octet-stream",
                             headers={"Content-Disposition": f'inline; filename="{meta.get("name")}"'})
