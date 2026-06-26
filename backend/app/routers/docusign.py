"""/api/docusign/* — e-signature console + public/simulated signing + webhook."""
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, Response

from ..definitions import now_iso
from ..deps import base_url, require_admin
from ..docusign import service as docusign
from ..docusign.documents import DOC_TEMPLATES
from ..errors import error
from ..store import add_activity, find_by_id, read_all, upsert

router = APIRouter()
admin = Depends(require_admin)


def _strip_html(e: dict) -> dict:
    return {k: v for k, v in e.items() if k != "documentHtml"}


def _candidate_envelopes(c: dict) -> list:
    return (c.get("docusign") or {}).get("envelopes") or []


def _save_envelope(c: dict, record: dict) -> None:
    c.setdefault("docusign", {"envelopes": []})
    envs = c["docusign"].setdefault("envelopes", [])
    idx = next((i for i, e in enumerate(envs) if e.get("envelopeId") == record.get("envelopeId")), -1)
    if idx == -1:
        envs.insert(0, record)
    else:
        envs[idx] = record


async def _find_envelope_global(envelope_id: str):
    for c in await read_all():
        e = next((x for x in _candidate_envelopes(c) if x.get("envelopeId") == envelope_id), None)
        if e:
            return {"candidate": c, "record": e}
    return None


def _reconcile_envelope(c: dict, prev: dict, updated: dict) -> None:
    label = (DOC_TEMPLATES.get(updated.get("docType")) or {}).get("label") or "Document"
    if updated.get("status") == "completed" and prev.get("status") != "completed":
        if updated.get("docType") == "offer_letter" and (c.get("checklist") or {}).get("offerLetter"):
            step = c["checklist"]["offerLetter"]
            step["status"] = "complete"
            step["completedAt"] = step.get("completedAt") or now_iso()
            step["completedBy"] = "DocuSign"
            step["result"] = step.get("result") or "signed"
        add_activity(c, "docusign_completed", (updated.get("signer") or {}).get("name") or "Signer",
                     f"{label} e-signed via DocuSign{' (simulated)' if updated.get('simulated') else ''}.",
                     channel="docusign", envelopeId=updated.get("envelopeId"), docType=updated.get("docType"))
    if updated.get("status") == "declined" and prev.get("status") != "declined":
        add_activity(c, "docusign_declined", (updated.get("signer") or {}).get("name") or "Signer",
                     f"{label} was declined in DocuSign.", channel="docusign", envelopeId=updated.get("envelopeId"))


@router.get("/api/docusign/status", dependencies=[admin])
async def ds_status():
    return docusign.status()


@router.get("/api/docusign/templates", dependencies=[admin])
async def ds_templates():
    try:
        return await docusign.templates()
    except Exception as e:  # noqa: BLE001
        raise error(502, str(e))


@router.get("/api/docusign/envelopes", dependencies=[admin])
async def ds_envelopes():
    rows = []
    for c in await read_all():
        for e in _candidate_envelopes(c):
            rows.append({**_strip_html(e), "candidateId": c["id"], "candidateName": c.get("name")})
    rows.sort(key=lambda r: r.get("createdAt") or "", reverse=True)
    return rows


@router.get("/api/docusign/candidates/{cid}/envelopes", dependencies=[admin])
async def ds_candidate_envelopes(cid: str):
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    return [_strip_html(e) for e in _candidate_envelopes(c)]


@router.post("/api/docusign/candidates/{cid}/preview", dependencies=[admin])
async def ds_preview(cid: str, request: Request):
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    body = await request.json()
    try:
        return docusign.preview(candidate=c, doc_type=body.get("docType"), fields=body.get("fields") or {})
    except Exception as e:  # noqa: BLE001
        raise error(400, str(e))


@router.post("/api/docusign/candidates/{cid}/send", dependencies=[admin])
async def ds_send(cid: str, request: Request):
    c = await find_by_id(cid)
    if not c:
        raise error(404, "Not found")
    body = await request.json()
    try:
        record = await docusign.send(
            candidate=c, doc_type=body.get("docType"), fields=body.get("fields"), signer=body.get("signer"),
            embedded_signing=bool(body.get("embedded")),
            return_url=f"{base_url(request)}/docusign.html?signed=1",
            email_subject=body.get("emailSubject"), message=body.get("message"),
            recipients=body.get("recipients"), placed_fields=body.get("placedFields"), uploaded_pdf=body.get("uploadedPdf"),
        )
        _save_envelope(c, record)
        if record.get("docType") == "offer_letter" and ((c.get("checklist") or {}).get("offerLetter") or {}).get("status") == "not_started":
            c["checklist"]["offerLetter"]["status"] = "in_progress"
        add_activity(c, "docusign_sent", "Admin",
                     f"{(DOC_TEMPLATES.get(record.get('docType')) or {}).get('label') or 'Document'} sent for e-signature to {record['signer']['email']} via DocuSign{' (simulated)' if record.get('simulated') else ''}.",
                     channel="docusign", envelopeId=record.get("envelopeId"), docType=record.get("docType"), simulated=record.get("simulated"))
        await upsert(c)
        return _strip_html(record)
    except Exception as e:  # noqa: BLE001
        raise error(400, str(e))


@router.post("/api/docusign/envelopes/{envelope_id}/refresh", dependencies=[admin])
async def ds_refresh(envelope_id: str):
    found = await _find_envelope_global(envelope_id)
    if not found:
        raise error(404, "Envelope not found")
    try:
        updated = await docusign.refresh(found["record"])
        _reconcile_envelope(found["candidate"], found["record"], updated)
        _save_envelope(found["candidate"], updated)
        await upsert(found["candidate"])
        return _strip_html(updated)
    except Exception as e:  # noqa: BLE001
        raise error(502, str(e))


@router.get("/api/docusign/envelopes/{envelope_id}/signing-url", dependencies=[admin])
async def ds_signing_url(envelope_id: str, request: Request):
    found = await _find_envelope_global(envelope_id)
    if not found:
        raise error(404, "Envelope not found")
    try:
        return await docusign.recipient_view(found["record"], return_url=f"{base_url(request)}/docusign.html?signed=1")
    except Exception as e:  # noqa: BLE001
        raise error(502, str(e))


@router.get("/api/docusign/envelopes/{envelope_id}/document.html", dependencies=[admin])
async def ds_document_html(envelope_id: str):
    found = await _find_envelope_global(envelope_id)
    if not found:
        return HTMLResponse("Not found", status_code=404)
    return HTMLResponse(found["record"].get("documentHtml") or "<p>No preview available.</p>")


@router.get("/api/docusign/envelopes/{envelope_id}/document", dependencies=[admin])
async def ds_document(envelope_id: str):
    found = await _find_envelope_global(envelope_id)
    if not found:
        raise error(404, "Envelope not found")
    try:
        out = await docusign.download(found["record"])
        return Response(content=out["buffer"], media_type=out["contentType"],
                        headers={"Content-Disposition": f'inline; filename="{out["filename"]}"'})
    except Exception as e:  # noqa: BLE001
        raise error(502, str(e))


@router.post("/api/docusign/envelopes/{envelope_id}/void", dependencies=[admin])
async def ds_void(envelope_id: str, request: Request):
    found = await _find_envelope_global(envelope_id)
    if not found:
        raise error(404, "Envelope not found")
    body = {}
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        pass
    try:
        updated = await docusign.void_envelope(found["record"], (body or {}).get("reason") or "Voided by recruiter")
        _save_envelope(found["candidate"], updated)
        add_activity(found["candidate"], "docusign_voided", "Admin", f"DocuSign envelope voided: {updated.get('voidedReason')}", channel="docusign", envelopeId=updated.get("envelopeId"))
        await upsert(found["candidate"])
        return _strip_html(updated)
    except Exception as e:  # noqa: BLE001
        raise error(502, str(e))


async def _advance_simulated(envelope_id: str, to_status: str):
    found = await _find_envelope_global(envelope_id)
    if not found:
        return {"error": 404}
    if not found["record"].get("simulated"):
        return {"error": 400}
    updated = docusign.simulate_advance(found["record"], to_status)
    _reconcile_envelope(found["candidate"], found["record"], updated)
    _save_envelope(found["candidate"], updated)
    await upsert(found["candidate"])
    return {"updated": updated}


@router.post("/api/docusign/envelopes/{envelope_id}/simulate", dependencies=[admin])
async def ds_simulate(envelope_id: str, request: Request):
    body = {}
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        pass
    r = await _advance_simulated(envelope_id, (body or {}).get("status") or "completed")
    if r.get("error") == 404:
        raise error(404, "Envelope not found")
    if r.get("error") == 400:
        raise error(400, "Only simulated envelopes can be advanced manually. Configure DocuSign for live signing.")
    return _strip_html(r["updated"])


@router.post("/api/docusign/public/{envelope_id}/sign")
async def ds_public_sign(envelope_id: str):
    r = await _advance_simulated(envelope_id, "completed")
    if r.get("error"):
        raise error(404, "Not found")
    return {"ok": True, "status": r["updated"]["status"]}


@router.get("/api/docusign/public/{envelope_id}")
async def ds_public_get(envelope_id: str):
    found = await _find_envelope_global(envelope_id)
    if not found or not found["record"].get("simulated"):
        raise error(404, "Not found")
    r = found["record"]
    return {"envelopeId": r.get("envelopeId"), "status": r.get("status"), "documentName": r.get("documentName"),
            "signer": {"name": (r.get("signer") or {}).get("name")}, "documentHtml": r.get("documentHtml")}


@router.post("/api/docusign/webhook")
async def ds_webhook(request: Request):
    raw = await request.body()
    parsed = None
    try:
        parsed = json.loads(raw.decode("utf-8")) if raw else None
    except Exception:  # noqa: BLE001
        pass
    result = docusign.handle_webhook(raw, parsed, request.headers.get("X-DocuSign-Signature-1"))
    if not result["ok"]:
        raise error(401, "Invalid signature")
    event = result.get("event")
    if event and event.get("envelopeId"):
        found = await _find_envelope_global(event["envelopeId"])
        if found:
            updated = docusign.apply_webhook_event(found["record"], event)
            _reconcile_envelope(found["candidate"], found["record"], updated)
            _save_envelope(found["candidate"], updated)
            await upsert(found["candidate"])
    return {"ok": True}
