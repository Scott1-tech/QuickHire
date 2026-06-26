"""Low-level wrappers around the DocuSign Envelopes API (live calls)."""
from .client import api_fetch


async def create_envelope(envelope_definition: dict) -> dict:
    return await api_fetch("/envelopes", {"method": "POST", "body": envelope_definition})


async def get_envelope(envelope_id: str) -> dict:
    return await api_fetch(f"/envelopes/{envelope_id}", {"method": "GET"})


async def get_recipients(envelope_id: str) -> dict:
    return await api_fetch(f"/envelopes/{envelope_id}/recipients", {"method": "GET"})


async def void_envelope(envelope_id: str, voided_reason: str) -> dict:
    return await api_fetch(f"/envelopes/{envelope_id}", {"method": "PUT", "body": {"status": "voided", "voidedReason": voided_reason}})


async def download_combined(envelope_id: str) -> bytes:
    res = await api_fetch(f"/envelopes/{envelope_id}/documents/combined", {"method": "GET", "headers": {"accept": "application/pdf"}}, True)
    return res.content


async def list_status_changes(from_date: str) -> dict:
    from urllib.parse import quote
    return await api_fetch(f"/envelopes?from_date={quote(from_date)}", {"method": "GET"})
