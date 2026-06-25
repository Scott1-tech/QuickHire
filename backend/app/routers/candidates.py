"""/api/candidates/* routes (workdeck CRUD, checklist, docs, PEV, Molly)."""
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from .. import config
from ..ai import call_molly
from ..definitions import (
    CHECKLIST_STEPS,
    MAIN_DOCS,
    OTHER_DOCS,
    STEP_IDS,
    checklist_complete,
    empty_checklist,
    expiring_docs,
    is_stale,
    now_iso,
)
from ..deps import base_url, require_admin
from ..errors import error
from ..files import decode_and_save, resolve_file
from ..messaging import dispatch_link
from ..store import (
    add_activity,
    find_by_id,
    new_token,
    new_uuid,
    read_all,
    upsert,
)

router = APIRouter(dependencies=[Depends(require_admin)])

_ALL_DOCS = MAIN_DOCS + OTHER_DOCS
_ALL_DOC_IDS = [d["id"] for d in _ALL_DOCS]


def _file_stream(path: str, mime: str, filename: str) -> StreamingResponse:
    def it():
        with open(path, "rb") as fh:
            while chunk := fh.read(65536):
                yield chunk
    return StreamingResponse(it(), media_type=mime or "application/octet-stream",
                             headers={"Content-Disposition": f'inline; filename="{filename}"'})


@router.get("/api/candidates")
async def list_candidates(request: Request):
    all_ = await read_all()
    search = (request.query_params.get("search") or "").lower()
    stage_filter = request.query_params.get("stage") or ""
    filt = request.query_params.get("filter") or ""

    lst = all_
    if search:
        lst = [c for c in lst if search in (c.get("name") or "").lower() or search in (c.get("email") or "").lower()]
    if stage_filter:
        lst = [c for c in lst if c.get("stage") == stage_filter]
    if filt == "stale":
        lst = [c for c in lst if is_stale(c)]
    if filt == "docs_missing":
        lst = [c for c in lst if any(not (c.get("documents") or {}).get(d["id"]) for d in MAIN_DOCS)]
    if filt == "expiring":
        lst = [c for c in lst if len(expiring_docs(c)) > 0]

    out = [{
        "id": c.get("id"), "token": c.get("token"), "name": c.get("name"), "email": c.get("email"), "phone": c.get("phone"),
        "stage": c.get("stage"), "subStatus": c.get("subStatus"), "recruiter": c.get("recruiter"),
        "createdAt": c.get("createdAt"), "stageChangedAt": c.get("stageChangedAt"), "lastActivityAt": c.get("lastActivityAt"),
        "submittedAt": c.get("submittedAt"), "linkSentCount": c.get("linkSentCount"),
        "checklistProgress": len([sid for sid in STEP_IDS if ((c.get("checklist") or {}).get(sid) or {}).get("status") == "complete"]),
        "stale": is_stale(c),
        "expiringDocs": expiring_docs(c),
        "missingMainDocs": [d["label"] for d in MAIN_DOCS if not (c.get("documents") or {}).get(d["id"])],
    } for c in lst]
    out.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    return out


@router.post("/api/candidates")
async def create_candidate(request: Request):
    body = await request.json()
    name, email, phone = body.get("name"), body.get("email"), body.get("phone")
    if not name or not email:
        raise error(400, "Name and email are required.")

    all_ = await read_all()
    dup = next((c for c in all_ if (c.get("email") or "").lower() == email.lower() or (phone and c.get("phone") and c.get("phone") == phone)), None)
    if dup:
        raise error(409, f"Possible duplicate: {dup['name']} ({dup['email']})",
                    duplicate={"id": dup["id"], "name": dup["name"], "email": dup["email"], "stage": dup["stage"]})

    now = now_iso()
    candidate = {
        "id": new_uuid(),
        "token": new_token(),
        "name": str(name).strip(),
        "email": str(email).strip(),
        "phone": str(phone).strip() if phone else "",
        "stage": "Lead",
        "subStatus": "in_progress",
        "recruiter": "Admin",
        "createdAt": now, "stageChangedAt": now, "lastActivityAt": now,
        "linkSentCount": 0, "linkLastSentAt": None, "linkLastChannels": [], "linkLastStatus": None, "linkExpiresAt": None,
        "submittedAt": None, "consentCompletedAt": None,
        "application": None,
        "driverFiles": {}, "signature": None,
        "checklist": empty_checklist(),
        "documents": {},
        "pev": [],
        "activity": [{"id": new_uuid(), "type": "candidate_created", "by": "Admin", "at": now, "note": "Candidate added to pipeline at Lead."}],
    }

    dispatch = await dispatch_link(candidate, base_url(request), regenerate=False)
    await upsert(candidate)
    return {"id": candidate["id"], "link": dispatch["link"], "email": dispatch["email"], "sms": dispatch["sms"], "anySuccess": dispatch["anySuccess"]}


@router.get("/api/candidates/{cid}")
async def get_candidate(cid: str):
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    return {**c, "stale": is_stale(c), "expiringDocs": expiring_docs(c), "checklistSteps": CHECKLIST_STEPS}


@router.patch("/api/candidates/{cid}")
async def update_candidate(cid: str, request: Request):
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    body = await request.json()
    stage, sub_status, recruiter, notes = body.get("stage"), body.get("subStatus"), body.get("recruiter"), body.get("notes")
    now = now_iso()

    if stage and stage != c.get("stage"):
        if stage == "Onboarding" and not checklist_complete(c):
            outstanding = [next((s["label"] for s in CHECKLIST_STEPS if s["id"] == sid), None)
                           for sid in STEP_IDS if ((c.get("checklist") or {}).get(sid) or {}).get("status") != "complete"]
            raise error(422, "Cannot advance to Onboarding — checklist incomplete.", outstanding=outstanding)
        add_activity(c, "stage_change", "Admin", f"Stage changed from {c.get('stage')} to {stage}.", **{"from": c.get("stage"), "to": stage})
        c["stage"] = stage
        c["stageChangedAt"] = now
    if sub_status is not None:
        c["subStatus"] = sub_status
    if recruiter is not None:
        c["recruiter"] = recruiter
    if notes is not None:
        add_activity(c, "note_added", "Admin", notes)
    c["lastActivityAt"] = now
    await upsert(c)
    return {"ok": True, "stage": c.get("stage")}


@router.post("/api/candidates/{cid}/resend")
async def resend_link(cid: str, request: Request):
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    dispatch = await dispatch_link(c, base_url(request), regenerate=True)
    await upsert(c)
    return {"link": dispatch["link"], "email": dispatch["email"], "sms": dispatch["sms"], "anySuccess": dispatch["anySuccess"]}


@router.post("/api/candidates/{cid}/activity")
async def add_candidate_activity(cid: str, request: Request):
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    body = await request.json()
    note = body.get("note")
    if not note or not note.strip():
        raise error(400, "Note is required.")
    add_activity(c, "note_added", "Admin", note.strip())
    await upsert(c)
    return {"ok": True}


@router.post("/api/candidates/bulk")
async def bulk_candidates(request: Request):
    body = await request.json()
    ids, action, stage = body.get("ids"), body.get("action"), body.get("stage")
    if not ids:
        raise error(400, "No candidates selected.")
    results = []
    for cid in ids:
        c = await find_by_id(cid)
        if not c:
            continue
        if action == "stage_change" and stage:
            if stage == "Onboarding" and not checklist_complete(c):
                results.append({"id": cid, "ok": False, "error": "Checklist incomplete"})
                continue
            add_activity(c, "stage_change", "Admin", f"Bulk stage change to {stage}.", **{"from": c.get("stage"), "to": stage})
            c["stage"] = stage
            c["stageChangedAt"] = now_iso()
            await upsert(c)
            results.append({"id": cid, "ok": True})
        elif action == "resend":
            dispatch = await dispatch_link(c, base_url(request), regenerate=True)
            await upsert(c)
            results.append({"id": cid, "ok": dispatch["anySuccess"], "channels": dispatch["channelsDelivered"]})
    return results


@router.patch("/api/candidates/{cid}/checklist/{step_id}")
async def update_checklist(cid: str, step_id: str, request: Request):
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    if step_id not in STEP_IDS:
        raise error(400, "Unknown step")
    body = await request.json()
    status_v, result, notes = body.get("status"), body.get("result"), body.get("notes")
    step_index = STEP_IDS.index(step_id)

    if status_v == "complete" and step_index > 0:
        prev_id = STEP_IDS[step_index - 1]
        if ((c.get("checklist") or {}).get(prev_id) or {}).get("status") != "complete":
            raise error(422, f'"{CHECKLIST_STEPS[step_index - 1]["label"]}" must be completed first.')

    step = c["checklist"][step_id]
    if status_v:
        step["status"] = status_v
    if result is not None:
        step["result"] = result
    if notes is not None:
        step["notes"] = notes
    if status_v == "complete" and not step.get("completedAt"):
        step["completedAt"] = now_iso()
        step["completedBy"] = "Admin"
        add_activity(c, "checklist_complete", "Admin", f'Checklist step "{CHECKLIST_STEPS[step_index]["label"]}" marked complete.', stepId=step_id)
    if status_v == "not_started":
        step["completedAt"] = None
        step["completedBy"] = None
        step["mollySummary"] = None
    c["lastActivityAt"] = now_iso()
    await upsert(c)
    return {"ok": True, "step": step}


@router.post("/api/candidates/{cid}/molly/{step_id}")
async def molly_summary(cid: str, step_id: str):
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    step_def = next((s for s in CHECKLIST_STEPS if s["id"] == step_id), None)
    if not step_def:
        raise error(400, "Unknown step")
    try:
        summary = await call_molly(step_def, (c.get("checklist") or {}).get(step_id) or {}, c.get("name"))
        c["checklist"][step_id]["mollySummary"] = {**summary, "generatedAt": now_iso()}
        add_activity(c, "molly_summary", "Admin", f'Molly AI summary generated for "{step_def["label"]}".', stepId=step_id)
        await upsert(c)
        return c["checklist"][step_id]["mollySummary"]
    except Exception as e:  # noqa: BLE001
        raise error(500, str(e))


@router.post("/api/candidates/{cid}/documents/{doc_type}")
async def upload_document(cid: str, doc_type: str, request: Request):
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    if doc_type not in _ALL_DOC_IDS:
        raise error(400, "Unknown document type")
    body = await request.json()
    saved = decode_and_save(c["id"], doc_type, {"dataUrl": body.get("dataUrl"), "name": body.get("name")})
    if not saved:
        raise error(400, "Invalid file data")
    c.setdefault("documents", {})
    c["documents"][doc_type] = {**saved, "uploadedAt": now_iso(), "uploadedBy": "Admin"}
    label = next((d["label"] for d in _ALL_DOCS if d["id"] == doc_type), doc_type)
    add_activity(c, "document_uploaded", "Admin", f'Document "{label}" uploaded.', docType=doc_type)
    await upsert(c)
    return {"ok": True}


@router.get("/api/candidates/{cid}/documents/{doc_type}/file")
async def get_document_file(cid: str, doc_type: str):
    c = await find_by_id(cid)
    meta = ((c or {}).get("documents") or {}).get(doc_type) or ((c or {}).get("driverFiles") or {}).get(doc_type)
    path = resolve_file((meta or {}).get("stored"))
    if not path:
        raise error(404, "Not found")
    return _file_stream(path, meta.get("mime") or "application/octet-stream", meta.get("name"))


@router.delete("/api/candidates/{cid}/documents/{doc_type}")
async def delete_document(cid: str, doc_type: str):
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    if (c.get("documents") or {}).get(doc_type) is not None:
        c["documents"].pop(doc_type, None)
    add_activity(c, "document_removed", "Admin", f'Document "{doc_type}" removed.')
    await upsert(c)
    return {"ok": True}


@router.get("/api/candidates/{cid}/signature")
async def get_signature(cid: str):
    c = await find_by_id(cid)
    meta = ((c or {}).get("driverFiles") or {}).get("signature")
    path = resolve_file((meta or {}).get("stored"))
    if not path:
        raise error(404, "Not found")
    return _file_stream(path, meta.get("mime") or "image/png", "signature.png")


@router.patch("/api/candidates/{cid}/pev/{index}")
async def update_pev(cid: str, index: int, request: Request):
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    pev = c.get("pev") or []
    if index < 0 or index >= len(pev) or not pev[index]:
        raise error(404, "PEV entry not found")
    body = await request.json()
    status_v, notes, verified_date = body.get("status"), body.get("notes"), body.get("verifiedDate")
    if status_v is not None:
        pev[index]["status"] = status_v
    if notes is not None:
        pev[index]["notes"] = notes
    if verified_date is not None:
        pev[index]["verifiedDate"] = verified_date
    add_activity(c, "pev_updated", "Admin", f"PEV updated for {pev[index].get('companyName')}: {status_v or 'notes updated'}.")
    await upsert(c)
    return {"ok": True}
