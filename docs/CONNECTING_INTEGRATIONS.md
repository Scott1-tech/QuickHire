# Connecting QuickHire integrations

QuickHire reads all integration credentials from **environment variables** on
the server (Railway → *Variables*, or `docker run --env-file`). The backend does
**not** read a `.env` file at runtime, so set them in your deployment
environment and redeploy. With no variables set, every integration runs in a
safe **demo mode** (simulated sends, sample FMCSA data) so the UI keeps working.

After setting variables and redeploying, open **Settings** in the app — each
integration card shows a green **Connected** dot when its variables are
detected. The status is pulled live from the backend when the page loads.

---

## 1. Connect your RingCentral numbers (SMS, calls, voicemail)

QuickHire uses RingCentral's **JWT (server-to-server) auth** — no interactive
login, ideal for a backend.

### Get the credentials
1. Sign in at <https://developers.ringcentral.com> with your RingCentral admin
   account.
2. **Console → Apps → Create App → REST API App.**
   - Auth type: **JWT auth flow**
   - Scopes: **SMS**, **Read Messages**, **Read Call Log**, **Read Accounts**
     (add **Webhook Subscriptions** if you want inbound messages).
3. After creating it, copy the **Client ID** and **Client Secret**.
4. **Credentials → JWT** (or *Console → Credentials*) → **Create JWT** for your
   user, scoped to this app → copy the JWT token.
5. Note the RingCentral phone number you'll send from, in E.164 format
   (e.g. `+12145551000`).

### Set these variables, then redeploy
| Variable | Value |
|---|---|
| `RINGCENTRAL_CLIENT_ID` | App Client ID |
| `RINGCENTRAL_CLIENT_SECRET` | App Client Secret |
| `RINGCENTRAL_JWT_TOKEN` | The JWT you created |
| `RINGCENTRAL_FROM` | Your sending number, E.164 (`+1...`) |
| `RINGCENTRAL_ACCOUNT_ID` | `~` (default — your own account) |
| `RINGCENTRAL_SERVER` | `https://platform.ringcentral.com` (production) or `https://platform.devtest.ringcentral.com` (sandbox) |

All four of CLIENT_ID, CLIENT_SECRET, JWT_TOKEN and FROM must be present for the
card to show **Connected**.

### Pull in your numbers
1. Go to **Settings → RingCentral**.
2. Click **Sync numbers**. QuickHire calls RingCentral, lists every provisioned
   number on the account, and detects which ones are SMS- and voice-enabled.
   - Existing per-number routing toggles (Receive SMS / Receive calls / default
     outbound) are preserved by phone number.
   - If RingCentral isn't configured yet, Sync leaves the demo numbers in place
     and tells you the env vars are missing.
3. For each number, set **Receive SMS / Receive calls**, assign a user/team, and
   pick one **Default outbound** number. That's the number used when you text or
   call a driver from the Messages page.

### (Optional) Inbound SMS & STOP handling
Add a webhook in RingCentral pointing to:
```
https://YOUR-DOMAIN/api/ringcentral/webhook
```
Inbound texts then appear in **Messages**, and `STOP`/`UNSUBSCRIBE` replies
auto-flag the driver as opted-out.

### Test it
**Settings → RingCentral → Test SMS** sends a real message when connected
(simulated in demo mode).

---

## 2. Connect your email inboxes

Pick **one** sending provider. **Resend** is the simplest; **SMTP** works with
Google Workspace, Microsoft 365, or any mailbox.

### Option A — Resend (recommended)
1. Create an account at <https://resend.com> and verify your sending domain
   (add the DKIM/SPF DNS records they give you).
2. **API Keys → Create** → copy the key (`re_...`).
3. Set:

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | `re_...` |
| `EMAIL_FROM` | `recruiting@yourdomain.com` (must be on the verified domain) |
| `REPLY_TO_EMAIL` | where replies should land (optional) |

### Option B — SMTP (Google Workspace / Microsoft 365 / other)
| Variable | Example |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` / `smtp.office365.com` |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` for 587 (STARTTLS), `true` for 465 |
| `SMTP_USER` | full mailbox address |
| `SMTP_PASS` | **app password**, not your normal password |
| `SMTP_FROM` | the From address (often same as `SMTP_USER`) |

> Gmail/Workspace: enable 2-Step Verification, then create an **App Password**
> and use that for `SMTP_PASS`. Microsoft 365: create an app password or use a
> licensed mailbox that allows SMTP AUTH.

Redeploy. **Settings → Email** then shows **Connected**.

### Manage senders & test
- **Settings → Email** lists your sending inboxes — set the default sender,
  signature, and per-inbox toggles.
- **Test send** delivers a real email when connected.
- Unlike phone numbers, mailboxes don't have a "list all inboxes" API, so the
  inbox list here is configured in-app; the provider above is what actually
  delivers the mail.

---

## 3. Is FMCSA working?

Yes. FMCSA lookups run against the official **FMCSA QCMobile / SAFER** API.

- **Without a key:** demo mode returns realistic sample carriers so the UI works.
- **With a key:** real, live carrier data (authority status, safety rating,
  power units, address, phone) by **DOT** or **MC** number.

### Turn on live data
1. Get a free **webKey** at
   <https://mobile.fmcsa.dot.gov/QCDevsite/docs/getStarted> (FMCSA QCMobile).
2. Set:

| Variable | Value |
|---|---|
| `FMCSA_API_KEY` | your QCMobile webKey |

3. Redeploy. **Settings → FMCSA** shows **Connected / API mode**.
4. Verify with **Settings → FMCSA → Test lookup** (queries DOT 998812 live).

The backend correctly reads the nested QCMobile response (`content.carrier`,
fields like `phyZipcode`, `totalPowerUnits`, `allowedToOperate`), so authority
status, address and fleet size populate carrier records and the PEV flow.

> **PSP and the Drug & Alcohol Clearinghouse are *not* part of this** — they
> require the driver's signed consent and separate FMCSA authorization. Public
> SAFER/QCMobile carrier lookup is what's wired here.

---

## 4. PEV — knowing exactly which company you're sending to

When you send a Previous Employment Verification (FMCSA §391.23) from a driver's
profile, the **Send verification** dialog makes the recipient unmistakable:

1. **Recipient card at the top** shows the company you picked from FMCSA — its
   **legal name**, a **Verified** badge, **DOT / MC number**, and **physical
   address** pulled from FMCSA. This is the exact carrier the driver listed and
   the one the request goes to.
2. **"Sending to" line** is channel-aware:
   - **Email** → the destination email address (or a prompt to add one).
   - **SMS** → the phone number on the FMCSA record (or a notice that none is on
     file).
   - **Tenstreet** → routed through the Tenstreet network.
3. **Send is blocked** until the chosen channel has a valid destination, so you
   can't accidentally send into the void.

Because the company is selected via FMCSA DOT/MC lookup, the name, authority and
address are the verified FMCSA record — not free text — so there's no ambiguity
about which employer is being contacted.

---

## Quick reference — what makes each card "Connected"

| Integration | Required variables |
|---|---|
| RingCentral | `RINGCENTRAL_CLIENT_ID` + `RINGCENTRAL_CLIENT_SECRET` + `RINGCENTRAL_JWT_TOKEN` + `RINGCENTRAL_FROM` |
| Email (Resend) | `RESEND_API_KEY` + `EMAIL_FROM` |
| Email (SMTP) | `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` + `SMTP_FROM` |
| FMCSA | `FMCSA_API_KEY` |

Set them in your host's environment, redeploy, then open **Settings** to
confirm the green dots.
