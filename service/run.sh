#!/usr/bin/env bash
# Run Anna's Python backend. Shares DATA_DIR with the Node app so carriers.json is read.
cd "$(dirname "$0")"
export DATA_DIR="${DATA_DIR:-$(cd .. && pwd)/data}"
exec python3 -m uvicorn main:app --host 0.0.0.0 --port "${ANNA_PORT:-8000}"
