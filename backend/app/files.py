"""Base64 file decode/save + safe file serving (ported from server.js)."""
import base64
import os
import re

from . import config

os.makedirs(config.UPLOAD_DIR, exist_ok=True)

_DATAURL_RE = re.compile(r"^data:(.+?);base64,(.*)$", re.DOTALL)


def decode_and_save(sub_dir: str, field: str, payload: dict | None) -> dict | None:
    if not payload or not payload.get("dataUrl"):
        return None
    m = _DATAURL_RE.match(payload["dataUrl"])
    if not m:
        return None
    mime = m.group(1)
    ext = re.sub(r"[^a-z0-9]", "", (mime.split("/")[1] if "/" in mime else "bin"), flags=re.IGNORECASE) or "bin"
    stored = os.path.join(sub_dir, f"{field}.{ext}")
    os.makedirs(os.path.join(config.UPLOAD_DIR, sub_dir), exist_ok=True)
    with open(os.path.join(config.UPLOAD_DIR, stored), "wb") as fh:
        fh.write(base64.b64decode(m.group(2)))
    return {"name": payload.get("name") or f"{field}.{ext}", "mime": mime, "stored": stored}


def resolve_file(stored: str | None) -> str | None:
    """Return the absolute path for a stored file, or None if invalid/missing."""
    if not stored:
        return None
    full = os.path.normpath(os.path.join(config.UPLOAD_DIR, stored))
    if not full.startswith(os.path.normpath(config.UPLOAD_DIR)):
        return None
    if not os.path.exists(full):
        return None
    return full
