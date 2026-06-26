# QuickHire — Python Backend (FastAPI + Postgres)

A full rewrite of the original Node/Express `server.js` to **Python + FastAPI**,
backed by **PostgreSQL**. It serves the exact same HTTP API the existing
frontend (`../public`) consumes, so it is a drop-in replacement for the Node
backend — same routes, same request/response shapes, same `{ "error": ... }`
error bodies.

## What's ported (full parity)

- **Candidates / workdeck** — invite, list (with search/stage/stale/docs/expiring
  filters), detail, stage transitions (Onboarding gated on a complete checklist),
  notes/activity trail, bulk actions, resend link.
- **Checklist** — 10-step compliance checklist with ordered gating + Molly AI
  summaries (Anthropic).
- **Documents & PEV** — base64 upload/serve/delete (stored on disk under
  `DATA_DIR/uploads`), signature serving, previous-employer verification.
- **Driver apply flow** — token-gated public application (expiry, auto-copy of
  CDL/medical to documents, consent capture, PEV sync from employers).
- **Carriers** — requirements questionnaire (recruiter "self" fill or carrier
  "invite"), public intake page, resend, progress tracking.
- **Anna** — driver-qualification agent: lead normalization, free-text carrier
  spec parsing, deterministic hard-gate/soft-score matching, portfolios, consent
  gate + MVR/PSP/Clearinghouse pulls, compliance verdicts, conversational chat.
- **DocuSign** — offer letters & consents with auto-filled, editable tabs;
  simulated mode by default and live JWT-Grant mode when `DOCUSIGN_*` is set;
  webhooks, embedded signing, void, download.
- **Messaging** — Resend (primary) → SMTP (fallback) email, Twilio SMS,
  TCPA STOP/START opt-out registry, Telegram send, driver screening.

## Storage

Records (candidates, carriers, Anna portfolios, SMS opt-outs) live in Postgres.
Each entity is one row with a JSONB `data` column holding the full nested record
(the same shape the frontend expects), plus indexed `id`/`token` columns. Uploaded
files remain on disk under `DATA_DIR/uploads` (set `DATA_DIR`, e.g. a Railway
Volume). Tables are created automatically on startup.

## Run locally

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

# Point at a Postgres instance (defaults to localhost/quickhire):
export DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/quickhire

uvicorn app.main:app --host 0.0.0.0 --port 3000
```

Open `http://localhost:3000` — the workdeck dashboard, driver application,
carriers, Anna and DocuSign consoles are all served from `../public`.

## Configuration

All environment variables from the project's [`../.env.example`](../.env.example)
apply unchanged (`ADMIN_PASSWORD`, `PUBLIC_URL`, `RESEND_API_KEY`, `TWILIO_*`,
`ANTHROPIC_API_KEY`, `DOCUSIGN_*`, `TELEGRAM_*`, `LINK_TTL_DAYS`, …) plus one
addition:

- `DATABASE_URL` — Postgres connection string. `postgres://` / `postgresql://`
  URLs are accepted and upgraded to the async `asyncpg` driver automatically.

## Layout

```
backend/app/
  main.py          FastAPI app, error shape, static + SPA serving
  config.py        env vars            db.py / models.py   Postgres engine + tables
  store.py         data layer (read_all/upsert/find_by_*)  definitions.py  checklist/docs/carrier-form
  messaging.py     email/SMS/dispatch  ai.py   Molly + screening   files.py  uploads
  routers/         config, candidates, apply, carriers, misc, anna, docusign
  anna/            spec, matcher, normalize, carrier, portfolio, integrations, queue, chat, claude
  docusign/        config, client, documents, envelopes, templates, embedded, webhooks, service
```
