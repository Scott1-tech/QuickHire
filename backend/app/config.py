"""Central configuration read from the environment.

Mirrors the constants at the top of the original ``server.js`` so the Python
backend honours the exact same env vars documented in ``.env.example``.
"""
import os

PORT = int(os.environ.get("PORT", "3000"))
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
PUBLIC_URL = os.environ.get("PUBLIC_URL", "").rstrip("/")
COMPANY_NAME = os.environ.get("COMPANY_NAME", "National Carrier Xpress Corp")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

# Link sending
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
EMAIL_FROM = os.environ.get("EMAIL_FROM") or os.environ.get("SMTP_FROM") or f"{COMPANY_NAME} <onboarding@resend.dev>"
REPLY_TO_EMAIL = os.environ.get("REPLY_TO_EMAIL", "")
SUPPORT_CONTACT = os.environ.get("SUPPORT_CONTACT", "safety@ncxpress.com")
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM = os.environ.get("TWILIO_FROM", "")
LINK_TTL_DAYS = int(os.environ.get("LINK_TTL_DAYS", "14"))

NOTIFY_EMAIL = os.environ.get("NOTIFY_EMAIL", "")

# SMTP (fallback)
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_SECURE = os.environ.get("SMTP_SECURE", "false") == "true"
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")

# AI / screening
SCREENING_MODEL = os.environ.get("SCREENING_MODEL", "claude-opus-4-8")
ANNA_CONCURRENCY = int(os.environ.get("ANNA_CONCURRENCY", "4"))

# Storage
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/
_PROJECT_DIR = os.path.dirname(_BASE_DIR)
DATA_DIR = os.environ.get("DATA_DIR") or os.path.join(_PROJECT_DIR, "data")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")

# Static assets (the existing frontend lives in ../public)
PUBLIC_DIR = os.path.join(_PROJECT_DIR, "public")

# Postgres. asyncpg driver. Override with DATABASE_URL in production (e.g. Railway).
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/quickhire",
)
# Allow plain postgres:// URLs (Railway/Heroku style) by upgrading the driver.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)


def email_enabled() -> bool:
    return bool(RESEND_API_KEY or SMTP_HOST)


def sms_enabled() -> bool:
    return bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM)
