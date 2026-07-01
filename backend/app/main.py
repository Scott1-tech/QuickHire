"""FastAPI application entrypoint — the Python equivalent of server.js.

Wires every router, preserves the ``{ error: ... }`` JSON error shape, and serves
the existing static frontend from ../public (including the /app/* SPA fallback).
"""
import asyncio
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
from .routers import integrations as integrations_router
from .routers import leads as leads_router
from .routers import misc as misc_router


async def _init_db_with_retry() -> None:
    """Create tables in the background, retrying transient failures.

    Crucially this does NOT block application startup. Right after a Railway
    deploy the Postgres service can be briefly unreachable (DNS/private
    networking still settling), and ``asyncpg`` may *hang* on connect rather
    than refuse. If we awaited that inside the lifespan, Uvicorn would never
    finish startup, never bind the port, and Railway would report
    "Application failed to respond". So we bind first and converge the DB after.
    """
    for attempt in range(1, 6):
        try:
            await asyncio.wait_for(init_db(), timeout=15)
            print("Database initialized.")
            return
        except Exception as e:  # noqa: BLE001
            delay = min(2 ** attempt, 30)
            print(f"WARNING: database init failed ({e}); retrying in {delay}s (attempt {attempt}/5).")
            await asyncio.sleep(delay)
    print("ERROR: database init did not succeed after 5 attempts. "
          "Check DATABASE_URL points to a reachable Postgres; DB-backed API calls will fail until it recovers.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Kick off DB init without awaiting it, so the HTTP server binds immediately.
    db_task = asyncio.create_task(_init_db_with_retry())
    if not config.ADMIN_PASSWORD:
        print("WARNING: ADMIN_PASSWORD not set — dashboard is open.")
    print(f"Email: {'Resend' if config.RESEND_API_KEY else ('SMTP fallback' if config.SMTP_HOST else 'NOT configured (links shown in dashboard)')}")
    print(f"SMS:   {'Twilio' if config.sms_enabled() else 'NOT configured'}")
    if not config.ANTHROPIC_API_KEY:
        print("NOTE: ANTHROPIC_API_KEY not set — Molly AI disabled; Anna runs in deterministic mode.")
    print(f"Link TTL: {config.LINK_TTL_DAYS} days")
    yield
    db_task.cancel()


app = FastAPI(title="QuickHire", lifespan=lifespan)


@app.get("/healthz")
async def healthz():
    """Liveness probe — returns 200 as soon as the server is bound, with no
    dependency on the database, so Railway can confirm the app is up."""
    return {"status": "ok"}


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
app.include_router(integrations_router.router)
app.include_router(leads_router.router)


# ── Page redirects (parity with server.js) ───────────────────────────────────
@app.get("/anna")
async def anna_redirect():
    return RedirectResponse("/anna.html")


@app.get("/docusign")
async def docusign_redirect():
    return RedirectResponse("/docusign.html")


# ── Build marker — open /version in a browser to confirm what's deployed. ─────
BUILD_VERSION = "spa-rebuilt-pdfjs-2026-06-27"


@app.get("/version")
async def version():
    return {"version": BUILD_VERSION, "ok": True}


# ── SPA built assets: mount explicitly BEFORE the catch-all so JS/CSS/worker
#    files are always served by StaticFiles with their correct MIME type. ──────
_app_assets_dir = os.path.join(config.PUBLIC_DIR, "app", "assets")
if os.path.isdir(_app_assets_dir):
    app.mount("/app/assets", StaticFiles(directory=_app_assets_dir), name="app_assets")


# ── SPA fallback for the FleetView React app under /app/* ─────────────────────
@app.get("/app/{rest:path}")
async def spa_fallback(rest: str):
    app_root = os.path.join(config.PUBLIC_DIR, "app")
    # Serve a real built asset (JS/CSS/worker) with its correct MIME type if it
    # exists — otherwise this catch-all would return index.html (text/html) for
    # /app/assets/*.js and the browser rejects the module script (blank page).
    if rest:
        candidate = os.path.normpath(os.path.join(app_root, rest))
        if candidate.startswith(app_root + os.sep) and os.path.isfile(candidate):
            return FileResponse(candidate)
    # Otherwise it's a client-side route (/app/dashboard, …) → serve the SPA shell.
    index = os.path.join(app_root, "index.html")
    if os.path.exists(index):
        return FileResponse(index)
    return JSONResponse(status_code=404, content={"error": "Not found"})


# ── Static frontend (mounted last; serves index.html at /) ───────────────────
if os.path.isdir(config.PUBLIC_DIR):
    app.mount("/", StaticFiles(directory=config.PUBLIC_DIR, html=True), name="static")
