"""Helper to raise HTTP errors with the same JSON body shape as server.js.

The original Express handlers respond ``{ error: "...", ...extra }``. ``error()``
builds an HTTPException whose ``detail`` is that exact dict; the app-level
handler in main.py serialises ``detail`` straight through as the body.
"""
from fastapi import HTTPException


def error(status: int, message: str, **extra) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": message, **extra})
