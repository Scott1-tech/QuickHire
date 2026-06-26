# Anna — Python (FastAPI) backend

A full Python port of Anna's backend. It owns the entire `/api/anna/*` API
(matching, carrier-spec parsing, consent + compliance, portfolios, outcomes +
learning, chat assistant, metrics, compliance packet, settings/keys). The Node
app keeps serving the web UI and the non-Anna APIs (carriers, candidates, email/
SMS, DocuSign).

## Run

```bash
cd service
pip install -r requirements.txt        # fastapi + uvicorn
DATA_DIR=../data ADMIN_PASSWORD=yourpw ./run.sh   # serves on :8000
# or: uvicorn main:app --port 8000
```

It shares `DATA_DIR` with the Node app so it reads the same `carriers.json`.
Anna's own state lives in `anna-portfolios.json`, `anna-settings.json`,
`anna-learning.json` in that dir.

Tests (deterministic core, no server/keys needed):

```bash
python3 test_core.py    # 25 assertions
```

## Pointing the web UI at it

Two ways (no UI rebuild needed for the first):

1. **Reverse proxy (recommended).** Route `/api/anna/*` to this service at the
   same origin (e.g. Nginx/Caddy, or Railway path-based routing). The existing
   UI calls `/api/anna/*` unchanged.

   ```
   location /api/anna/ { proxy_pass http://anna-python:8000; }
   ```

2. **Direct (cross-origin).** Set the UI's Anna API base to this service's URL
   (CORS is open here). The page calls the Python service directly.

Until you cut over, the Node app's own `/api/anna/*` routes still work, so
nothing breaks during migration.

## Config / keys

- `ADMIN_PASSWORD` — same value as the Node app; the UI sends `x-admin-token`.
- `ANTHROPIC_API_KEY` — optional env fallback (Anthropic only).
- AI provider + key are normally set in the app: **Settings → Anna AI** (Claude
  or OpenAI). Stored server-side in `anna-settings.json`, never returned in full.
- Compliance providers go "live" when `MVR_API_URL`/`MVR_API_KEY` (and PSP /
  CLEARINGHOUSE) env vars are set; otherwise pulls are clearly flagged simulated.

## Parity with the Node module

Same data shapes and endpoints as `anna/` (Node), so the UI is compatible:
`spec · matcher · learning · carrier · integrations · portfolio · normalize ·
metrics · chat · llm`. Document scanning is Anthropic-only (Claude vision).
