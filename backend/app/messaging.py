"""Email (Resend → SMTP) + SMS (Twilio) sending, invite templates, and the
unified link dispatchers. Ported from the email/SMS section of server.js.
"""
import base64
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

from . import config
from .store import add_activity, add_optout, is_opted_out, new_token, norm_phone, read_all, remove_optout, upsert

EMAIL_SUBJECT = f"Complete Your Driver Application — {config.COMPANY_NAME}"


def _first_name(name) -> str:
    parts = str(name or "").strip().split()
    return parts[0] if parts else "there"


# ── Invite templates ─────────────────────────────────────────────────────────
def invite_html(name, link) -> str:
    return f"""<div style="font-family:'Inter',Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:8px">
    <div style="border-bottom:3px solid #b01d30;padding-bottom:12px;margin-bottom:20px">
      <h2 style="color:#b01d30;margin:0">{config.COMPANY_NAME}</h2>
    </div>
    <p>Hi {_first_name(name)},</p>
    <p>Thank you for your interest in driving with {config.COMPANY_NAME}. The next step is to complete
       your driver qualification application — it only takes a few minutes.</p>
    <p style="margin:28px 0;text-align:center">
      <a href="{link}" style="background:#b01d30;color:#fff;padding:14px 32px;border-radius:10px;
         text-decoration:none;font-weight:600;display:inline-block;font-size:16px">Complete My Application</a>
    </p>
    <p style="font-size:13px;color:#6b7280">If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="{link}" style="color:#b01d30;word-break:break-all">{link}</a></p>
    <p style="font-size:13px;color:#6b7280">For your security, this link expires in {config.LINK_TTL_DAYS} days.
       If it expires before you finish, just reply to this email and we'll send you a new one.</p>
    <p style="font-size:13px;color:#6b7280">Questions? Reply to this email or contact us at {config.SUPPORT_CONTACT}.</p>
    <p style="margin-top:24px">Safe travels,<br><strong>{config.COMPANY_NAME} — Driver Recruiting</strong></p>
  </div>"""


def invite_text(name, link) -> str:
    return (
        f"Hi {_first_name(name)},\n\n"
        f"Thank you for your interest in driving with {config.COMPANY_NAME}. The next step is to complete your driver qualification application.\n\n"
        f"Complete your application here:\n{link}\n\n"
        f"For your security, this link expires in {config.LINK_TTL_DAYS} days. If it expires before you finish, just reply to this email and we'll send you a new one.\n\n"
        f"Questions? Reply to this email or contact us at {config.SUPPORT_CONTACT}.\n\n"
        f"Safe travels,\n{config.COMPANY_NAME} — Driver Recruiting"
    )


def invite_sms(name, link) -> str:
    return f"{config.COMPANY_NAME}: Hi {_first_name(name)}, please complete your driver application here: {link} (expires in {config.LINK_TTL_DAYS} days). Reply STOP to opt out."


def _smtp_send(to, subject, html, text=None, reply_to=None) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = config.EMAIL_FROM
    msg["To"] = to
    if reply_to:
        msg["Reply-To"] = reply_to
    if text:
        msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))
    if config.SMTP_SECURE:
        server = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=20)
    else:
        server = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=20)
    try:
        if not config.SMTP_SECURE:
            try:
                server.starttls()
            except smtplib.SMTPException:
                pass
        if config.SMTP_USER:
            server.login(config.SMTP_USER, config.SMTP_PASS)
        server.sendmail(config.EMAIL_FROM, [to], msg.as_string())
    finally:
        server.quit()


async def _resend_send(payload: dict) -> httpx.Response:
    async with httpx.AsyncClient(timeout=30) as client:
        return await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {config.RESEND_API_KEY}", "Content-Type": "application/json"},
            json=payload,
        )


async def send_email(to, name, link) -> dict:
    """Invite email: Resend primary, SMTP fallback."""
    if config.RESEND_API_KEY:
        try:
            payload = {
                "from": config.EMAIL_FROM, "to": [to], "subject": EMAIL_SUBJECT,
                "html": invite_html(name, link), "text": invite_text(name, link),
            }
            if config.REPLY_TO_EMAIL:
                payload["reply_to"] = config.REPLY_TO_EMAIL
            r = await _resend_send(payload)
            if r.is_success:
                return {"sent": True, "provider": "resend"}
            return {"sent": False, "provider": "resend", "reason": f"Resend {r.status_code}: {r.text[:120]}"}
        except Exception as e:  # noqa: BLE001
            return {"sent": False, "provider": "resend", "reason": "Resend error: " + str(e)}
    if config.SMTP_HOST:
        try:
            _smtp_send(to, EMAIL_SUBJECT, invite_html(name, link), invite_text(name, link), config.REPLY_TO_EMAIL or None)
            return {"sent": True, "provider": "smtp"}
        except Exception as e:  # noqa: BLE001
            return {"sent": False, "provider": "smtp", "reason": "SMTP error: " + str(e)}
    return {"sent": False, "reason": "Email not configured"}


async def send_plain_email(to, subject, html) -> dict:
    """Plain transactional email (admin notifications)."""
    if config.RESEND_API_KEY:
        try:
            r = await _resend_send({"from": config.EMAIL_FROM, "to": [to], "subject": subject, "html": html})
            return {"sent": True} if r.is_success else {"sent": False, "reason": f"Resend {r.status_code}"}
        except Exception as e:  # noqa: BLE001
            return {"sent": False, "reason": str(e)}
    if config.SMTP_HOST:
        try:
            _smtp_send(to, subject, html)
            return {"sent": True}
        except Exception as e:  # noqa: BLE001
            return {"sent": False, "reason": str(e)}
    return {"sent": False, "reason": "Email not configured"}


async def _twilio_send(to, body) -> dict:
    try:
        auth = base64.b64encode(f"{config.TWILIO_ACCOUNT_SID}:{config.TWILIO_AUTH_TOKEN}".encode()).decode()
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{config.TWILIO_ACCOUNT_SID}/Messages.json",
                headers={"Authorization": "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded"},
                data={"To": to, "From": config.TWILIO_FROM, "Body": body},
            )
        data = {}
        try:
            data = r.json()
        except Exception:  # noqa: BLE001
            pass
        if r.is_success:
            return {"sent": True, "provider": "twilio", "sid": data.get("sid")}
        return {"sent": False, "provider": "twilio", "reason": f"Twilio {r.status_code}: {str(data.get('message') or '')[:120]}"}
    except Exception as e:  # noqa: BLE001
        return {"sent": False, "provider": "twilio", "reason": "Twilio error: " + str(e)}


async def send_sms(to, name, link) -> dict:
    if not config.sms_enabled():
        return {"sent": False, "reason": "Twilio not configured"}
    if await is_opted_out(to):
        return {"sent": False, "reason": "Recipient has opted out of SMS (STOP)"}
    return await _twilio_send(to, invite_sms(name, link))


# ── Carrier invite (generic deliver helpers) ─────────────────────────────────
async def deliver_email(to, subject, html, text=None) -> dict:
    if config.RESEND_API_KEY:
        try:
            payload = {"from": config.EMAIL_FROM, "to": [to], "subject": subject, "html": html, "text": text}
            if config.REPLY_TO_EMAIL:
                payload["reply_to"] = config.REPLY_TO_EMAIL
            r = await _resend_send(payload)
            if r.is_success:
                return {"sent": True, "provider": "resend"}
            return {"sent": False, "provider": "resend", "reason": f"Resend {r.status_code}: {r.text[:120]}"}
        except Exception as e:  # noqa: BLE001
            return {"sent": False, "provider": "resend", "reason": "Resend error: " + str(e)}
    if config.SMTP_HOST:
        try:
            _smtp_send(to, subject, html, text, config.REPLY_TO_EMAIL or None)
            return {"sent": True, "provider": "smtp"}
        except Exception as e:  # noqa: BLE001
            return {"sent": False, "provider": "smtp", "reason": "SMTP error: " + str(e)}
    return {"sent": False, "reason": "Email not configured"}


async def deliver_sms(to, body) -> dict:
    if not config.sms_enabled():
        return {"sent": False, "reason": "Twilio not configured"}
    if await is_opted_out(to):
        return {"sent": False, "reason": "Recipient has opted out of SMS (STOP)"}
    return await _twilio_send(to, body)


def carrier_invite_html(c, link) -> str:
    who = _first_name(c.get("ownerName")) if c.get("ownerName") else "there"
    name = c.get("name") or "your company"
    return f"""<div style="font-family:'Inter',Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:8px">
    <div style="border-bottom:3px solid #b01d30;padding-bottom:12px;margin-bottom:20px">
      <h2 style="color:#b01d30;margin:0">{config.COMPANY_NAME}</h2>
    </div>
    <p>Hi {who},</p>
    <p>We work with drivers looking for a great carrier like <strong>{name}</strong>. To match the right
       drivers to you, please complete your carrier requirements profile — it covers your pre-qualifications, pay and
       equipment. It only takes a few minutes and you can save it any time.</p>
    <p style="margin:28px 0;text-align:center">
      <a href="{link}" style="background:#b01d30;color:#fff;padding:14px 32px;border-radius:10px;
         text-decoration:none;font-weight:600;display:inline-block;font-size:16px">Complete Our Requirements</a>
    </p>
    <p style="font-size:13px;color:#6b7280">If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="{link}" style="color:#b01d30;word-break:break-all">{link}</a></p>
    <p style="font-size:13px;color:#6b7280">For your security, this link expires in {config.LINK_TTL_DAYS} days.</p>
    <p style="font-size:13px;color:#6b7280">Questions? Reply to this email or contact us at {config.SUPPORT_CONTACT}.</p>
    <p style="margin-top:24px">Thank you,<br><strong>{config.COMPANY_NAME} — Driver Recruiting</strong></p>
  </div>"""


def carrier_invite_text(c, link) -> str:
    who = _first_name(c.get("ownerName")) if c.get("ownerName") else "there"
    name = c.get("name") or "your company"
    return (
        f"Hi {who},\n\n"
        f"Please complete your carrier requirements profile for {name} so we can match the right drivers to you. It covers your pre-qualifications, pay and equipment.\n\n"
        f"Complete it here:\n{link}\n\n"
        f"This link expires in {config.LINK_TTL_DAYS} days. Questions? Contact us at {config.SUPPORT_CONTACT}.\n\n"
        f"Thank you,\n{config.COMPANY_NAME} — Driver Recruiting"
    )


def carrier_invite_sms(c, link) -> str:
    name = c.get("name") or "your company"
    return f"{config.COMPANY_NAME}: Please complete your carrier requirements for {name} here: {link} (expires in {config.LINK_TTL_DAYS} days). Reply STOP to opt out."


def _expiry_iso() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=config.LINK_TTL_DAYS)).isoformat()


# ── Unified link dispatchers ─────────────────────────────────────────────────
async def dispatch_link(c: dict, base: str, regenerate: bool = False) -> dict:
    if regenerate or not c.get("token"):
        c["token"] = new_token()
    c["linkExpiresAt"] = _expiry_iso()
    link = f"{base}/apply.html?token={c['token']}"

    email = sms = None
    if c.get("email"):
        email = await send_email(c["email"], c.get("name"), link)
        add_activity(c, "link_sent", "Admin",
                     f"Application link {'sent' if email['sent'] else 'FAILED'} via email to {c['email']}{'' if email['sent'] else ' — ' + str(email.get('reason'))}.",
                     channel="email", status="sent" if email["sent"] else "failed", reason=email.get("reason"))
    if c.get("phone"):
        sms = await send_sms(c["phone"], c.get("name"), link)
        add_activity(c, "link_sent", "Admin",
                     f"Application link {'sent' if sms['sent'] else 'FAILED'} via SMS to {c['phone']}{'' if sms['sent'] else ' — ' + str(sms.get('reason'))}.",
                     channel="sms", status="sent" if sms["sent"] else "failed", reason=sms.get("reason"))

    channels_tried = [ch for ch in (("email" if c.get("email") else None), ("sms" if c.get("phone") else None)) if ch]
    channels_delivered = [ch for ch in (("email" if email and email.get("sent") else None), ("sms" if sms and sms.get("sent") else None)) if ch]
    any_success = len(channels_delivered) > 0

    c["linkSentCount"] = (c.get("linkSentCount") or 0) + 1
    stamp = datetime.now(timezone.utc).isoformat()
    c["linkLastSentAt"] = stamp
    c["linkLastChannels"] = channels_delivered or channels_tried
    c["linkLastStatus"] = "delivered" if any_success else "failed"
    c["lastActivityAt"] = stamp

    return {"link": link, "email": email, "sms": sms, "anySuccess": any_success, "channelsDelivered": channels_delivered}


async def dispatch_carrier_link(c: dict, base: str, regenerate: bool = False) -> dict:
    if regenerate or not c.get("token"):
        c["token"] = new_token()
    c["linkExpiresAt"] = _expiry_iso()
    link = f"{base}/carrier-intake.html?token={c['token']}"

    email = sms = None
    if c.get("email"):
        email = await deliver_email(c["email"], f"Carrier requirements — {c.get('name') or config.COMPANY_NAME}", carrier_invite_html(c, link), carrier_invite_text(c, link))
        add_activity(c, "link_sent", "Recruiter",
                     f"Requirements link {'sent' if email['sent'] else 'FAILED'} via email to {c['email']}{'' if email['sent'] else ' — ' + str(email.get('reason'))}.",
                     channel="email", status="sent" if email["sent"] else "failed", reason=email.get("reason"))
    if c.get("phone"):
        sms = await deliver_sms(c["phone"], carrier_invite_sms(c, link))
        add_activity(c, "link_sent", "Recruiter",
                     f"Requirements link {'sent' if sms['sent'] else 'FAILED'} via SMS to {c['phone']}{'' if sms['sent'] else ' — ' + str(sms.get('reason'))}.",
                     channel="sms", status="sent" if sms["sent"] else "failed", reason=sms.get("reason"))

    channels_tried = [ch for ch in (("email" if c.get("email") else None), ("sms" if c.get("phone") else None)) if ch]
    channels_delivered = [ch for ch in (("email" if email and email.get("sent") else None), ("sms" if sms and sms.get("sent") else None)) if ch]
    any_success = len(channels_delivered) > 0

    c["linkSentCount"] = (c.get("linkSentCount") or 0) + 1
    stamp = datetime.now(timezone.utc).isoformat()
    c["linkLastSentAt"] = stamp
    c["linkLastChannels"] = channels_delivered or channels_tried
    c["linkLastStatus"] = "delivered" if any_success else "failed"
    c["updatedAt"] = stamp

    return {"link": link, "email": email, "sms": sms, "anySuccess": any_success, "channelsDelivered": channels_delivered}


async def mark_optout_activity(phone, opted_out: bool) -> None:
    n = norm_phone(phone)
    if not n:
        return
    for c in await read_all():
        if norm_phone(c.get("phone")) == n:
            add_activity(c, "sms_optout", "Driver",
                         "Driver replied STOP — opted out of SMS." if opted_out else "Driver replied START — opted back in to SMS.",
                         channel="sms", status="opted_out" if opted_out else "opted_in")
            await upsert(c)
            return
