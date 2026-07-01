"""Universal lead intake — one canonical pipe, many source adapters.

External lead apps (Meta/Facebook Lead Ads, Indeed, ZipRecruiter, any tool wired
through Zapier/Make, CSV exports…) all deliver leads in different shapes. Rather
than special-case each one across the app, every source gets a small **adapter**
that does exactly two things:

  1. ``verify(request, raw)`` — prove the request really came from that source
     (per-source secret / HMAC signature).
  2. ``normalize(payload)`` — map the source's raw payload into ONE canonical
     lead shape.

Everything after normalization is shared: dedup (email/phone/sourceId), create a
``Candidate`` at stage ``Lead`` with ``subStatus="new_unreviewed"`` (the review
inbox), attribute the source, and log to the activity trail. New apps = one new
adapter, no pipeline changes.

Following the rest of QuickHire: credentials come from env vars, and with none
set each adapter runs in a safe **demo mode** (accepts the call so the UI works).
Leads are NEVER auto-contacted here — a recruiter converts them from the inbox,
which is when the application link is dispatched. That keeps cold-lead SMS on the
right side of TCPA.
"""
import hashlib
import hmac
import json
import os
import re

import httpx

from .definitions import empty_checklist, now_iso
from .store import add_activity, new_token, new_uuid, read_all, upsert

# ── Canonical lead field extraction ──────────────────────────────────────────
# Apps name the same field a dozen ways. We look leads up by a list of aliases
# and also understand Meta's ``field_data`` array-of-objects format.
_NAME_KEYS = ("full_name", "fullname", "name", "full name", "applicant_name", "candidate_name")
_FIRST_KEYS = ("first_name", "firstname", "first name", "given_name", "fname")
_LAST_KEYS = ("last_name", "lastname", "last name", "family_name", "surname", "lname")
_EMAIL_KEYS = ("email", "email_address", "emailaddress", "e-mail", "work_email")
_PHONE_KEYS = ("phone", "phone_number", "phonenumber", "mobile", "mobile_number", "cell", "telephone", "tel")
_CAMPAIGN_KEYS = ("campaign", "campaign_name", "ad_name", "adset_name", "form_name", "job_title", "job", "source_campaign")


def _flatten(payload: dict) -> dict:
    """Collapse a lead payload into a flat lowercased key→value dict.

    Handles three common encodings at once:
      * flat JSON (Zapier, most webhooks): ``{"full_name": "...", "email": "..."}``
      * Meta ``field_data``: ``[{"name": "email", "values": ["a@b.com"]}, …]``
      * one level of nesting (``applicant``/``lead``/``data``/``fields``).
    """
    out: dict = {}

    def put(k, v):
        if k is None or v is None:
            return
        k = str(k).strip().lower()
        if isinstance(v, (str, int, float)) and str(v).strip() != "":
            out.setdefault(k, str(v).strip())

    def walk(node, depth=0):
        if depth > 3 or node is None:
            return
        if isinstance(node, dict):
            # Meta single field entry: {"name": "email", "values": ["x"]}
            if "name" in node and ("values" in node or "value" in node):
                vals = node.get("values") or node.get("value")
                val = vals[0] if isinstance(vals, list) and vals else vals
                put(node.get("name"), val)
                return
            for k, v in node.items():
                if isinstance(v, (dict, list)):
                    walk(v, depth + 1)
                else:
                    put(k, v)
        elif isinstance(node, list):
            for item in node:
                walk(item, depth + 1)

    walk(payload)
    return out


def _pick(flat: dict, keys) -> str | None:
    for k in keys:
        if flat.get(k):
            return flat[k]
    return None


def to_canonical(payload: dict, *, source: str, source_id: str | None = None) -> dict:
    """Map any source payload to the canonical lead shape."""
    flat = _flatten(payload)
    name = _pick(flat, _NAME_KEYS)
    if not name:
        first, last = _pick(flat, _FIRST_KEYS), _pick(flat, _LAST_KEYS)
        name = " ".join(p for p in (first, last) if p) or None
    email = _pick(flat, _EMAIL_KEYS)
    phone = _pick(flat, _PHONE_KEYS)
    campaign = _pick(flat, _CAMPAIGN_KEYS)

    known = set(_NAME_KEYS + _FIRST_KEYS + _LAST_KEYS + _EMAIL_KEYS + _PHONE_KEYS + _CAMPAIGN_KEYS)
    custom = {k: v for k, v in flat.items() if k not in known}

    return {
        "name": name,
        "email": (email or "").strip().lower() or None,
        "phone": phone,
        "source": source,
        "sourceId": source_id or flat.get("id") or flat.get("lead_id") or flat.get("leadgen_id"),
        "campaign": campaign,
        "customFields": custom,
        "raw": payload,
    }


# ── Source adapters ──────────────────────────────────────────────────────────
class Adapter:
    """Base adapter. Subclasses override verify()/normalize() as needed.

    ``env_keys`` lists the env vars whose presence flips the source from demo to
    live (used by the Settings status cards).
    """

    source = "generic"
    label = "Generic webhook"
    env_keys: tuple[str, ...] = ("LEAD_WEBHOOK_SECRET",)
    #: When to display the intake URL/secret in Settings (all but Meta/Indeed
    #: native are configured by pasting a webhook URL somewhere).
    shows_webhook_url = True

    def configured(self) -> bool:
        return all(os.environ.get(k) for k in self.env_keys)

    def _secret(self) -> str:
        return os.environ.get(self.env_keys[0], "") if self.env_keys else ""

    async def verify(self, request, raw: bytes) -> bool:
        """Shared-secret check via ``X-QuickHire-Secret`` header or ``?secret=``.

        Demo mode (no secret configured) accepts so the flow is testable, exactly
        like the rest of QuickHire's integrations.
        """
        secret = self._secret()
        if not secret:
            return True  # demo mode
        provided = request.headers.get("x-quickhire-secret") or request.query_params.get("secret") or ""
        return hmac.compare_digest(provided, secret)

    async def normalize(self, payload) -> list[dict]:
        if isinstance(payload, list):
            return [to_canonical(p, source=self.source) for p in payload]
        # Some senders wrap a batch under "leads"/"entries".
        batch = payload.get("leads") or payload.get("entries") if isinstance(payload, dict) else None
        if isinstance(batch, list) and batch:
            return [to_canonical(p, source=self.source) for p in batch]
        return [to_canonical(payload, source=self.source)]


class MetaAdapter(Adapter):
    """Meta (Facebook / Instagram) Lead Ads.

    Category: webhook-carries-an-id. Meta POSTs ``leadgen_id`` and you fetch the
    real field data from the Graph API with a Page token. We also accept payloads
    that already carry ``field_data`` (e.g. relayed via Zapier) so the source
    works before Graph access is fully approved.
    """

    source = "meta"
    label = "Meta Lead Ads (Facebook/Instagram)"
    env_keys = ("META_APP_SECRET", "META_PAGE_TOKEN")
    shows_webhook_url = False

    def configured(self) -> bool:
        # App-secret alone lets us verify signatures; page token enables fetch.
        return bool(os.environ.get("META_APP_SECRET"))

    async def verify(self, request, raw: bytes) -> bool:
        app_secret = os.environ.get("META_APP_SECRET", "")
        if not app_secret:
            return True  # demo mode
        sig = request.headers.get("x-hub-signature-256", "")
        if not sig.startswith("sha256="):
            return False
        expected = "sha256=" + hmac.new(app_secret.encode(), raw, hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig, expected)

    async def _fetch_leadgen(self, leadgen_id: str) -> dict | None:
        token = os.environ.get("META_PAGE_TOKEN", "")
        if not token or not leadgen_id:
            return None
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(
                    f"https://graph.facebook.com/v19.0/{leadgen_id}",
                    params={"access_token": token, "fields": "field_data,campaign_name,ad_name,form_id,created_time"},
                )
            return r.json() if r.is_success else None
        except Exception:  # noqa: BLE001
            return None

    async def normalize(self, payload) -> list[dict]:
        leads: list[dict] = []
        entries = payload.get("entry") if isinstance(payload, dict) else None
        if isinstance(entries, list):
            for entry in entries:
                for change in entry.get("changes") or []:
                    value = change.get("value") or {}
                    leadgen_id = value.get("leadgen_id")
                    if value.get("field_data"):
                        leads.append(to_canonical(value, source="meta", source_id=leadgen_id))
                    elif leadgen_id:
                        fetched = await self._fetch_leadgen(leadgen_id)
                        if fetched:
                            leads.append(to_canonical(fetched, source="meta", source_id=leadgen_id))
                        else:
                            # Can't fetch (no token / not approved) — keep a stub
                            # so nothing is silently dropped; recruiter sees it.
                            leads.append({**to_canonical(value, source="meta", source_id=leadgen_id),
                                          "name": f"Meta lead {leadgen_id}"})
            if leads:
                return leads
        # Relayed / flat payload (Zapier, manual test).
        return await super().normalize(payload)


class IndeedAdapter(Adapter):
    """Indeed Apply. Category: approved-partner push. Payload carries the
    applicant under ``applicant``/``lead``; normalization handles the nesting."""

    source = "indeed"
    label = "Indeed Apply"
    env_keys = ("INDEED_WEBHOOK_SECRET",)
    shows_webhook_url = True


ADAPTERS: dict[str, Adapter] = {
    a.source: a for a in (Adapter(), MetaAdapter(), IndeedAdapter())
}
# Friendly aliases so "/api/leads/intake/facebook" etc. also work.
_ALIASES = {"facebook": "meta", "fb": "meta", "instagram": "meta", "ig": "meta",
            "zapier": "generic", "make": "generic", "webhook": "generic"}


def get_adapter(source: str) -> Adapter | None:
    key = (source or "").strip().lower()
    return ADAPTERS.get(_ALIASES.get(key, key))


def sources_status() -> list[dict]:
    """Settings-card status for every source (mirrors the other integrations)."""
    return [{"type": a.source, "label": a.label,
             "connected": a.configured(),
             "status": "connected" if a.configured() else "demo",
             "showsWebhookUrl": a.shows_webhook_url,
             "envKeys": list(a.env_keys)}
            for a in ADAPTERS.values()]


# ── Canonical lead → Candidate ───────────────────────────────────────────────
def _blank_candidate(name: str, email: str, phone: str) -> dict:
    now = now_iso()
    return {
        "id": new_uuid(),
        "token": new_token(),
        "name": name, "email": email, "phone": phone or "",
        "stage": "Lead",
        "subStatus": "new_unreviewed",
        "recruiter": "Unassigned",
        "createdAt": now, "stageChangedAt": now, "lastActivityAt": now,
        "linkSentCount": 0, "linkLastSentAt": None, "linkLastChannels": [], "linkLastStatus": None, "linkExpiresAt": None,
        "submittedAt": None, "consentCompletedAt": None,
        "application": None,
        "driverFiles": {}, "signature": None,
        "checklist": empty_checklist(),
        "documents": {},
        "pev": [],
        "activity": [],
    }


def _source_block(lead: dict) -> dict:
    return {"channel": lead.get("source"), "sourceId": lead.get("sourceId"),
            "campaign": lead.get("campaign"), "receivedAt": now_iso(),
            "customFields": lead.get("customFields") or {}, "raw": lead.get("raw")}


async def ingest_lead(lead: dict) -> dict:
    """Create (or dedupe-merge) a Candidate from one canonical lead.

    Dedup precedence: same sourceId (webhook retry) → same email → same phone.
    Duplicates are merged (a new source is appended + logged) rather than
    creating a second record. Returns ``{created, candidateId, duplicate}``.
    """
    email = (lead.get("email") or "").strip().lower()
    phone = lead.get("phone") or ""
    source_id = lead.get("sourceId")
    src = lead.get("source") or "generic"

    all_ = await read_all()

    def matches(c: dict) -> bool:
        if source_id and any((s or {}).get("sourceId") == source_id for s in (c.get("sources") or [])):
            return True
        if email and (c.get("email") or "").lower() == email:
            return True
        if phone and c.get("phone") and c.get("phone") == phone:
            return True
        return False

    existing = next((c for c in all_ if matches(c)), None)
    block = _source_block(lead)

    if existing:
        # Idempotent on webhook retries: same sourceId already recorded → no-op.
        if source_id and any((s or {}).get("sourceId") == source_id for s in (existing.get("sources") or [])):
            return {"created": False, "duplicate": True, "candidateId": existing["id"], "idempotent": True}
        existing.setdefault("sources", []).append(block)
        add_activity(existing, "lead_received", src,
                     f"Duplicate lead from {src} matched existing candidate — source recorded"
                     + (f" (campaign: {lead['campaign']})" if lead.get("campaign") else "") + ".",
                     channel=src, campaign=lead.get("campaign"))
        await upsert(existing)
        return {"created": False, "duplicate": True, "candidateId": existing["id"]}

    if not (email or phone):
        raise ValueError("Lead has no email or phone — cannot create a candidate.")

    candidate = _blank_candidate(lead.get("name") or "Unnamed lead", email, phone)
    candidate["sources"] = [block]
    candidate["source"] = src  # primary source (first touch)
    add_activity(candidate, "lead_received", src,
                 f"Lead received from {src}"
                 + (f" (campaign: {lead['campaign']})" if lead.get("campaign") else "")
                 + " — added to Lead Inbox for review.",
                 channel=src, campaign=lead.get("campaign"))
    await upsert(candidate)
    return {"created": True, "duplicate": False, "candidateId": candidate["id"]}
