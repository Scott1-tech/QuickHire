"""Embedded ("captive") signing — recipient/sender view URLs (live calls)."""
from .client import api_fetch


async def create_recipient_view(*, envelope_id: str, return_url: str, email: str, user_name: str, client_user_id: str, recipient_id: str = "1") -> dict:
    return await api_fetch(f"/envelopes/{envelope_id}/views/recipient", {
        "method": "POST",
        "body": {
            "returnUrl": return_url,
            "authenticationMethod": "none",
            "email": email,
            "userName": user_name,
            "clientUserId": client_user_id,
            "recipientId": recipient_id,
        },
    })


async def create_sender_view(*, envelope_id: str, return_url: str) -> dict:
    return await api_fetch(f"/envelopes/{envelope_id}/views/sender", {"method": "POST", "body": {"returnUrl": return_url}})
