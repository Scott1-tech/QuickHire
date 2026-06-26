# QuickHire — Driver Qualification Workdeck

A full-stack CDL driver hiring portal for **National Carrier Xpress Corp**.

A company representative invites a driver (name + email, optional phone). The driver
receives a secure link by email/SMS, fills out the two-step qualification application,
and the company sees every submission in one place — a "workdeck" dashboard.

## How it works

```
Company rep  ──invite (name/email/phone)──►  Driver gets link (email/SMS)
     ▲                                                  │
     │                                                  ▼
Workdeck dashboard  ◄──────── completed application ── Driver fills 2-step form
(view all in one place)
```

## Stack

- **Backend:** Node.js + Express (`server.js`)
- **Storage:** simple JSON file store + uploaded files on disk (`data/`) — no external DB needed
- **Email:** Nodemailer (optional SMTP) · **SMS:** Twilio REST (optional)
- **Frontend:** static HTML + vanilla JS + Tailwind (CDN), Inter font, brand color `#b01d30`

## Pages

| Route | Purpose |
|-------|---------|
| `/` | **Workdeck dashboard** — invite drivers, see all applications, open submitted details (incl. uploaded docs + signature). |
| `/apply.html?token=…` | **Driver application** — Step 1 (qualification) + Step 2 (consents & signature). Only reachable with a valid invite token. |
| `/docusign` | **DocuSign console** — send offer letters & DOT consents for e-signature. Contracts **auto-fill** from the driver's application (CDL, address, DOB…); the driver only reviews & corrects. Falls back to a fully-demoable simulated mode until `DOCUSIGN_*` is configured. |

## Run locally

```bash
npm install
npm start          # http://localhost:3000
```

Open `http://localhost:3000`, invite a driver, copy the generated link, open it in another
tab, complete the form, then watch it appear as **Submitted** in the dashboard.

> Without SMTP configured, invite emails aren't sent — the link is shown in the dashboard
> for you to copy/share. Configure SMTP/Twilio (see `.env.example`) to send automatically.

## Deploy to Railway

1. Connect the repo to Railway (it auto-detects Node via `railway.json` / Nixpacks).
2. Set environment variables (see `.env.example`) — at minimum `ADMIN_PASSWORD` and `PUBLIC_URL`.
3. **Add a Volume** mounted at `/app/data` (set `DATA_DIR=/app/data`) so submissions and
   uploaded files persist across deploys (Railway's normal filesystem is ephemeral).
4. Add SMTP vars to send invite emails, and Twilio vars to send SMS (both optional).

## Application link sending (email + SMS)

When an admin adds a candidate, the system sends a **unique, non-guessable link**
tied to that candidate's record. Submissions automatically tie back to the right
candidate — no manual matching.

- **Email:** [Resend](https://resend.com) (primary). Set `RESEND_API_KEY` + a verified
  `EMAIL_FROM`. Falls back to SMTP (`SMTP_*`) if Resend isn't configured.
- **SMS:** [Twilio](https://twilio.com). Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_FROM`.
- **Both provided → both sent.** Sending to every available channel also acts as
  cross-channel fallback, so one failing channel never leaves the driver with nothing.
- **Links expire after `LINK_TTL_DAYS` (default 14).** Expired links show a friendly
  "contact us for a new one" message instead of a broken form.
- **Resend Link** (candidate detail page) generates a *fresh* token + expiry and re-sends
  — works any time, including after expiration. The old link is invalidated.
- Every send attempt (channel, status, timestamp) is logged to the **Activity tab**, and
  the latest status shows on the detail-page sidebar ("Sent N time(s) via email & sms…").

### SMS compliance (TCPA) — action may be required

- The SMS includes **"Reply STOP to opt out."** STOP/START replies are honored: point
  your Twilio number's inbound Messaging webhook at `<PUBLIC_URL>/api/twilio/inbound`
  (HTTP POST). Opted-out numbers are skipped on future sends.
- ⚠️ **A2P 10DLC registration:** Twilio generally requires registering a Brand +
  Campaign before it will reliably deliver business SMS to US numbers. Complete this in
  the Twilio console — flagging it since delivery may be blocked/throttled until done.

## Environment variables

See [`.env.example`](./.env.example). Key ones:

- `ADMIN_PASSWORD` — protects the workdeck dashboard (leave blank only for local dev).
- `PUBLIC_URL` — your deployed URL, used to build invite links.
- `DATA_DIR` — where applications/uploads/opt-outs are stored (point at a Railway Volume).
- `RESEND_API_KEY`, `EMAIL_FROM`, `REPLY_TO_EMAIL` — email invites via Resend.
- `SMTP_*` — email fallback if Resend isn't set. `NOTIFY_EMAIL` — new-submission alerts.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` — SMS invites.
- `LINK_TTL_DAYS` — link expiry window (default 14). `SUPPORT_CONTACT` — shown to drivers.
- `ANTHROPIC_API_KEY` — Molly AI summaries. `TELEGRAM_*` — Documents-tab Telegram send.

## DocuSign e-Signature (offer letters & consents)

Send a driver their offer letter or DOT consent forms for legally-binding
e-signature, tracked back on the candidate record.

- **Auto-fill:** every contract is pre-populated from the data QuickHire already
  collected (name, DOB, address, CDL number/state/class/expiration, phone, email).
  The driver only **reviews and corrects** — they never retype. Missing fields
  (e.g. SSN, which we don't collect) render blank-but-editable and are flagged in
  the console. Implemented with DocuSign prefilled, editable text tabs.
- **Connected to the pipeline:** when an offer letter is signed, the
  "Offer Letter Sent/Signed" checklist step auto-completes and the event lands in
  the candidate's Activity trail. Status updates arrive via DocuSign Connect
  webhooks (or a manual refresh).
- **Simulated by default:** with no `DOCUSIGN_*` env vars set, envelopes are
  created locally and clearly flagged `simulated` so the full
  send → review → sign → complete flow works in dev. Set the env vars (JWT Grant
  auth — see `.env.example`) to flip to real, live signing with no code changes.
- See [`docusign/README.md`](./docusign/README.md) for the module layout and API.

## Notes

- The Step 1 form uses native, fully-working controls (date pickers, dropdowns), multi-select
  pills (equipment/endorsements), Yes/No toggles, real file uploads, and dynamically
  add/remove previous employers.
- Step 2 has independent consent checkboxes and a working signature pad (draw or type);
  **Submit** stays disabled until all consents are checked and the signature is confirmed.
- FMCSA SAFER/QC auto-fill is **not** integrated (it requires a paid, credentialed
  connection). Employer fields are manual entry, and the UI says so.
