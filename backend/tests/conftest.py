"""Test bootstrap.

These env vars MUST be set before any ``app.*`` module is imported, because
``app.config`` computes ``DATABASE_URL`` (and ``app.db`` binds the engine to it)
at import time. Pytest loads this conftest before collecting test modules, so
setting them here guarantees the app talks to an isolated, throwaway SQLite DB.
"""
import os
import tempfile

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="quickhire-tests-")
os.environ.pop("DATABASE_URL", None)        # force the SQLite fallback
os.environ["ADMIN_PASSWORD"] = ""           # keep admin routes open in tests
os.environ.pop("ANTHROPIC_API_KEY", None)   # Anna stays deterministic
