# Deterministic build for Railway: the Python/FastAPI backend (backend/) serving
# the prebuilt React SPA + static frontend in public/. Requires a Postgres
# service (set DATABASE_URL). The web/ SPA is prebuilt and committed to public/app,
# so the image only needs Python runtime deps.
FROM python:3.11-slim

WORKDIR /app

# Install backend dependencies first for better layer caching.
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy the rest of the app (backend/ and public/ including the prebuilt SPA).
COPY . .

# The app serves ../public relative to backend/, so run from there.
WORKDIR /app/backend

# Do NOT hardcode/EXPOSE a port: Railway injects its own $PORT and routes the
# public domain + healthcheck to it. Binding $PORT (with a 3000 fallback for
# local dev) keeps the app and Railway's router on the same port.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-3000}"]
