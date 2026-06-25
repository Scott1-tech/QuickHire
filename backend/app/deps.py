"""Shared FastAPI dependencies: admin auth + request base URL."""
from fastapi import Header, HTTPException, Request

from . import config


async def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    """Mirror server.js requireAdmin: open when no password set, else match header."""
    if not config.ADMIN_PASSWORD:
        return
    if x_admin_token == config.ADMIN_PASSWORD:
        return
    raise HTTPException(status_code=401, detail="Unauthorized")


def base_url(request: Request) -> str:
    if config.PUBLIC_URL:
        return config.PUBLIC_URL
    # Honour proxy headers when present, else fall back to the request URL.
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}"
