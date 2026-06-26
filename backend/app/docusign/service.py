"""Public façade for the DocuSign integration — LIVE vs SIMULATED per call."""
import hashlib
import re
import uuid
from datetime import datetime, timezone

from . import embedded, envelopes as env, templates as templates_api, webhooks
from .client import consent_url  # noqa: F401  (re-exported for parity)
from .config import config, is_configured, mode
from .documents import (
    DATA_FIELDS,
    DOC_TEMPLATES,
    build_document_html,
    build_signer_tabs,
    document_catalog,
    driver_profile,
    html_document,
    merge_tabs,
    missing_fields,
    placed_fields_to_tabs,
    simple_pdf,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def preview(*, candidate: dict, doc_type: str, fields: dict | None = None) -> dict:
    fields = fields or {}
    if doc_type not in DOC_TEMPLATES:
        raise ValueError(f'Unknown document type "{doc_type}".')
    profile = driver_profile(candidate)
    return {
        "docType": doc_type,
        "label": DOC_TEMPLATES[doc_type]["label"],
        "html": build_document_html(doc_type, candidate, fields, simulated=True),
        "profile": profile,
        "fields": [{"key": f["key"], "label": f["label"], "value": profile.get(f["key"]) or "", "required": bool(f.get("required"))} for f in DATA_FIELDS],
        "missing": missing_fields(profile),
    }


def status() -> dict:
    return {
        "configured": is_configured(),
        "mode": mode(),
        "accountId": config["accountId"] or None,
        "apiBase": config["apiBase"],
        "hasWebhookSecret": bool(config["webhookSecret"]),
        "documents": document_catalog(),
    }


def _normalize(partial: dict) -> dict:
    return {
        "envelopeId": partial.get("envelopeId"),
        "status": partial.get("status") or "sent",
        "mode": "simulated" if partial.get("simulated") else "live",
        "simulated": bool(partial.get("simulated")),
        "docType": partial.get("docType"),
        "documentName": partial.get("documentName"),
        "emailSubject": partial.get("emailSubject"),
        "message": partial.get("message"),
        "embedded": bool(partial.get("embedded")),
        "returnUrl": partial.get("returnUrl"),
        "signer": partial.get("signer"),
        "recipients": partial.get("recipients"),
        "placedFields": partial.get("placedFields") or [],
        "uploadedPdf": bool(partial.get("uploadedPdf")),
        "documentHtml": partial.get("documentHtml"),
        "createdAt": partial.get("createdAt") or _now(),
        "sentAt": partial.get("sentAt") or _now(),
        "deliveredAt": partial.get("deliveredAt"),
        "completedAt": partial.get("completedAt"),
        "declinedAt": partial.get("declinedAt"),
        "voidedAt": partial.get("voidedAt"),
        "voidedReason": partial.get("voidedReason"),
        "statusHistory": partial.get("statusHistory") or [{"status": partial.get("status") or "sent", "at": _now()}],
    }


def _push_status(record: dict, st: str, extra: dict | None = None) -> dict:
    if record.get("status") != st:
        record.setdefault("statusHistory", []).append({"status": st, "at": _now(), **(extra or {})})
    record["status"] = st
    if st == "delivered":
        record["deliveredAt"] = record.get("deliveredAt") or _now()
    if st == "completed":
        record["completedAt"] = record.get("completedAt") or _now()
    if st == "declined":
        record["declinedAt"] = record.get("declinedAt") or _now()
    if st == "voided":
        record["voidedAt"] = record.get("voidedAt") or _now()
    return record


async def send(*, candidate: dict, doc_type: str, fields: dict | None = None, signer: dict | None = None,
               embedded_signing: bool = False, return_url: str | None = None, email_subject: str | None = None,
               message: str | None = None, recipients=None, placed_fields: list | None = None, uploaded_pdf: dict | None = None) -> dict:
    import os
    fields = fields or {}
    placed_fields = placed_fields or []
    if doc_type not in DOC_TEMPLATES:
        raise ValueError(f'Unknown document type "{doc_type}".')
    who = {
        "name": (signer or {}).get("name") or (candidate or {}).get("name"),
        "email": (signer or {}).get("email") or (candidate or {}).get("email"),
    }
    if not who["name"] or not who["email"]:
        raise ValueError("Signer name and email are required.")

    label = DOC_TEMPLATES[doc_type]["label"]
    subject = email_subject or f"Please sign: {label} — {os.environ.get('COMPANY_NAME', 'QuickHire')}"
    profile = driver_profile(candidate or who)
    live_html = build_document_html(doc_type, candidate or who, fields, simulated=False)
    preview_html = build_document_html(doc_type, candidate or who, fields, simulated=True)

    use_pdf = bool(uploaded_pdf and uploaded_pdf.get("base64"))
    document_name = (uploaded_pdf.get("name") or "Document.pdf") if use_pdf else f"{label}.pdf"
    document = (
        {"documentBase64": uploaded_pdf["base64"], "name": document_name, "fileExtension": "pdf", "documentId": "1"}
        if use_pdf else html_document(document_name, live_html, "1")
    )
    tabs = (
        placed_fields_to_tabs(placed_fields) if use_pdf
        else merge_tabs(build_signer_tabs(profile), placed_fields_to_tabs(placed_fields))
    )
    client_user_id = None
    if embedded_signing:
        client_user_id = (candidate or {}).get("id") or hashlib.sha1(who["email"].encode()).hexdigest()[:16]

    signer_record = {
        "name": who["name"], "email": who["email"], "recipientId": "1",
        "clientUserId": client_user_id, "status": "sent", "signedAt": None,
    }

    if is_configured():
        definition = {
            "emailSubject": subject,
            "emailBlurb": message or None,
            "status": "sent",
            "documents": [document],
            "recipients": {"signers": [{
                "email": who["email"], "name": who["name"], "recipientId": "1", "routingOrder": "1",
                **({"clientUserId": client_user_id} if client_user_id else {}),
                "tabs": tabs,
            }]},
            **({"brandId": config["brandId"]} if config["brandId"] else {}),
        }
        created = await env.create_envelope(definition)
        return _normalize({
            "envelopeId": created.get("envelopeId"),
            "status": created.get("status") or "sent",
            "simulated": False,
            "docType": doc_type, "documentName": document_name, "emailSubject": subject, "message": message,
            "embedded": embedded_signing, "returnUrl": return_url,
            "signer": signer_record, "recipients": recipients, "placedFields": placed_fields, "uploadedPdf": use_pdf,
            "documentHtml": None if use_pdf else preview_html,
        })

    return _normalize({
        "envelopeId": f"sim-{uuid.uuid4()}",
        "status": "sent",
        "simulated": True,
        "docType": doc_type, "documentName": document_name, "emailSubject": subject, "message": message,
        "embedded": embedded_signing, "returnUrl": return_url,
        "signer": signer_record, "recipients": recipients, "placedFields": placed_fields, "uploadedPdf": use_pdf,
        "documentHtml": None if use_pdf else preview_html,
    })


async def refresh(record: dict) -> dict:
    if record.get("simulated"):
        return record
    live = await env.get_envelope(record["envelopeId"])
    nxt = {**record}
    _push_status(nxt, str(live.get("status") or record.get("status")).lower())
    try:
        r = await env.get_recipients(record["envelopeId"])
        signer = (r.get("signers") or [None])[0]
        if signer:
            nxt["signer"] = {**(nxt.get("signer") or {}), "status": signer.get("status"), "signedAt": signer.get("signedDateTime") or (nxt.get("signer") or {}).get("signedAt")}
    except Exception:  # noqa: BLE001
        pass
    return nxt


async def recipient_view(record: dict, *, return_url: str | None = None) -> dict:
    from urllib.parse import quote
    ret = return_url or record.get("returnUrl") or config["returnUrl"] or "https://www.docusign.com"
    if record.get("simulated"):
        return {"url": f"/docusign-sign.html?envelopeId={quote(str(record['envelopeId']))}", "simulated": True, "returnUrl": ret}
    signer = record.get("signer") or {}
    view = await embedded.create_recipient_view(
        envelope_id=record["envelopeId"], return_url=ret, email=signer.get("email"),
        user_name=signer.get("name"), client_user_id=signer.get("clientUserId"), recipient_id=signer.get("recipientId") or "1",
    )
    return {"url": view.get("url"), "simulated": False, "returnUrl": ret}


async def download(record: dict) -> dict:
    filename = re.sub(r"[^\w.-]+", "_", record.get("documentName") or "document.pdf")
    if record.get("simulated"):
        signed = record.get("status") == "completed"
        signer = record.get("signer") or {}
        signed_note = f" (signed {record.get('completedAt')})" if signed else ""
        buffer = simple_pdf(DOC_TEMPLATES.get(record.get("docType"), {}).get("label", "Document"), [
            f"Signer: {signer.get('name') or ''} <{signer.get('email') or ''}>",
            f"Envelope: {record.get('envelopeId')}",
            f"Status: {record.get('status')}{signed_note}",
            "",
            "This is a SIMULATED DocuSign document generated by QuickHire because",
            "DocuSign credentials are not configured. Configure DOCUSIGN_* env vars",
            "for real, legally-binding e-signatures.",
        ])
        return {"buffer": buffer, "filename": filename, "contentType": "application/pdf"}
    buffer = await env.download_combined(record["envelopeId"])
    return {"buffer": buffer, "filename": filename, "contentType": "application/pdf"}


async def templates() -> dict:
    if not is_configured():
        return {"simulated": True, "templates": []}
    data = await templates_api.list_templates()
    return {"simulated": False, "templates": [{"templateId": t.get("templateId"), "name": t.get("name"), "shared": t.get("shared"), "description": t.get("description")} for t in (data.get("envelopeTemplates") or [])]}


async def void_envelope(record: dict, reason: str = "Voided by recruiter") -> dict:
    if not record.get("simulated"):
        await env.void_envelope(record["envelopeId"], reason)
    nxt = {**record, "voidedReason": reason}
    return _push_status(nxt, "voided", {"reason": reason})


def simulate_advance(record: dict, to_status: str = "completed") -> dict:
    if not record.get("simulated"):
        return record
    nxt = {**record, "signer": {**(record.get("signer") or {})}}
    if to_status == "completed":
        nxt["signer"]["status"] = "completed"
        nxt["signer"]["signedAt"] = _now()
        _push_status(nxt, "delivered")
    return _push_status(nxt, to_status)


def apply_webhook_event(record: dict, event: dict) -> dict:
    nxt = {**record, "signer": {**(record.get("signer") or {})}, "statusHistory": [*(record.get("statusHistory") or [])]}
    if event.get("completedAt"):
        nxt["completedAt"] = event["completedAt"]
    sig = (event.get("recipients") or [None])[0]
    if sig:
        nxt["signer"]["status"] = sig.get("status") or nxt["signer"].get("status")
        nxt["signer"]["signedAt"] = sig.get("signedAt") or nxt["signer"].get("signedAt")
    return _push_status(nxt, str(event.get("status") or nxt.get("status")).lower())


def handle_webhook(raw_body, parsed_body, signature_header) -> dict:
    ok = webhooks.verify_signature(raw_body, signature_header)
    if not ok:
        return {"ok": False, "event": None}
    return {"ok": True, "event": webhooks.parse_event(parsed_body)}
