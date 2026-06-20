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

## Environment variables

See [`.env.example`](./.env.example). Key ones:

- `ADMIN_PASSWORD` — protects the workdeck dashboard (leave blank only for local dev).
- `PUBLIC_URL` — your deployed URL, used to build invite links.
- `DATA_DIR` — where applications/uploads are stored (point at a Railway Volume).
- `SMTP_*`, `NOTIFY_EMAIL` — email invites + new-submission notifications.
- `TWILIO_*` — SMS invites.

## Notes

- The Step 1 form uses native, fully-working controls (date pickers, dropdowns), multi-select
  pills (equipment/endorsements), Yes/No toggles, real file uploads, and dynamically
  add/remove previous employers.
- Step 2 has independent consent checkboxes and a working signature pad (draw or type);
  **Submit** stays disabled until all consents are checked and the signature is confirmed.
- FMCSA SAFER/QC auto-fill is **not** integrated (it requires a paid, credentialed
  connection). Employer fields are manual entry, and the UI says so.
