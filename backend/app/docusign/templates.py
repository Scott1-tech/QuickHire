"""Wrappers around the DocuSign Templates API (live calls)."""
from .client import api_fetch


async def list_templates() -> dict:
    return await api_fetch("/templates", {"method": "GET"})


async def get_template(template_id: str) -> dict:
    return await api_fetch(f"/templates/{template_id}", {"method": "GET"})


async def send_from_template(*, template_id: str, email_subject: str, roles: list) -> dict:
    return await api_fetch("/envelopes", {
        "method": "POST",
        "body": {
            "templateId": template_id,
            "emailSubject": email_subject,
            "status": "sent",
            "templateRoles": [{
                "roleName": r.get("roleName"), "name": r.get("name"), "email": r.get("email"),
                **({"clientUserId": r["clientUserId"]} if r.get("clientUserId") else {}),
            } for r in roles],
        },
    })
