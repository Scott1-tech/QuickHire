"""FastAPI application entrypoint — the Python equivalent of server.js.

Wires every router, preserves the ``{ error: ... }`` JSON error shape, and serves
the existing static frontend from ../public (including the /app/* SPA fallback).
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import config
from .db import init_db
from .routers import anna as anna_router
from .routers import apply as apply_router
from .routers import candidates as candidates_router
from .routers import carriers as carriers_router
from .routers import config as config_router
from .routers import docusign as docusign_router
from .routers import misc as misc_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_db()
    except Exception as e:  # noqa: BLE001
        print(f"WARNING: database init failed ({e}). Set DATABASE_URL to a reachable Postgres.")
    if not config.ADMIN_PASSWORD:
        print("WARNING: ADMIN_PASSWORD not set — dashboard is open.")
    print(f"Email: {'Resend' if config.RESEND_API_KEY else ('SMTP fallback' if config.SMTP_HOST else 'NOT configured (links shown in dashboard)')}")
    print(f"SMS:   {'Twilio' if config.sms_enabled() else 'NOT configured'}")
    if not config.ANTHROPIC_API_KEY:
        print("NOTE: ANTHROPIC_API_KEY not set — Molly AI disabled; Anna runs in deterministic mode.")
    print(f"Link TTL: {config.LINK_TTL_DAYS} days")
    yield


app = FastAPI(title="QuickHire", lifespan=lifespan)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc: StarletteHTTPException):
    """Match server.js: errors are JSON ``{ error: ... }`` (or the raw dict detail)."""
    detail = exc.detail
    if isinstance(detail, dict):
        body = detail
    else:
        body = {"error": detail}
    return JSONResponse(status_code=exc.status_code, content=body, headers=getattr(exc, "headers", None))


# ── API routers (registered before static so they take precedence) ───────────
app.include_router(config_router.router)
app.include_router(candidates_router.router)
app.include_router(apply_router.router)
app.include_router(carriers_router.router)
app.include_router(misc_router.router)
app.include_router(anna_router.router)
app.include_router(docusign_router.router)


# ── Page redirects (parity with server.js) ───────────────────────────────────
@app.get("/anna")
async def anna_redirect():
    return RedirectResponse("/anna.html")


@app.get("/docusign")
async def docusign_redirect():
    return RedirectResponse("/docusign.html")


# ── SPA fallback for the FleetView React app under /app/* ─────────────────────
@app.get("/app/{rest:path}")
async def spa_fallback(rest: str):
    index = os.path.join(config.PUBLIC_DIR, "app", "index.html")
    if os.path.exists(index):
        return FileResponse(index)
    return JSONResponse(status_code=404, content={"error": "Not found"})


# ── Static frontend (mounted last; serves index.html at /) ───────────────────
if os.path.isdir(config.PUBLIC_DIR):
    app.mount("/", StaticFiles(directory=config.PUBLIC_DIR, html=True), name="static")
