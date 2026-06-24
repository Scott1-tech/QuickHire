# DocuSign e-Signature module

Sends QuickHire documents (offer letters, DOT consents) to drivers for electronic
signature, and tracks them back on the candidate record. Mirrors the rest of the
codebase: **live when configured, clearly-flagged simulated otherwise.**

## The key UX — auto-fill

QuickHire already collected the driver's details during the application, so every
contract is **pre-filled** from that data (name, DOB, address, CDL #/state/class,
expiration, phone, email). The driver only **reviews and corrects** — they never
retype what we already know. Fields we don't have (e.g. SSN) render blank but
**editable**, and the console flags them so a recruiter knows what's outstanding.

Under the hood this is DocuSign **prefilled text tabs** (`value` set, `locked:'false'`)
anchored into each document, alongside the usual Sign/Date/Name tabs.

## Files

| File | Responsibility |
|------|----------------|
| `config.js` | Reads `DOCUSIGN_*` env vars; `isConfigured()` / `mode()`. |
| `client.js` | JWT-Grant auth → access token (cached) + authenticated `apiFetch`. |
| `documents.js` | Auto-fill mapping (`driverProfile`), HTML contract builders, signer tabs, a minimal PDF generator for simulated downloads. |
| `envelopes.js` | Low-level Envelopes API (create / get / void / download). |
| `templates.js` | Templates API (list / send-from-template). |
| `embeddedSigning.js` | Recipient-view (embedded/captive signing) URLs. |
| `webhooks.js` | DocuSign Connect HMAC verification + event parsing. |
| `index.js` | Public façade `server.js` imports — picks live/simulated, normalizes envelope records, exposes `status / preview / send / refresh / recipientView / download / templates / voidEnvelope / simulateAdvance / handleWebhook`. |

## Flow

```
Recruiter (console)                    Driver                         DocuSign / sim
  │ preview (auto-fill) ─┐
  │ send  ───────────────┴─► envelope created ─────────────────────►  envelope (sent)
  │                                   │ review & correct prefilled fields
  │                                   │ sign ──────────────────────►  completed
  │ ◄── Connect webhook / refresh ────────────────────────────────┘
  ▼ candidate.activity += docusign_completed
    checklist "Offer Letter Sent/Signed" → complete
```

## API (mounted in `server.js`)

```
GET  /api/docusign/status
POST /api/docusign/candidates/:id/preview     # auto-filled contract + field map
POST /api/docusign/candidates/:id/send        # { docType, fields, embedded }
GET  /api/docusign/candidates/:id/envelopes
GET  /api/docusign/envelopes                   # console overview (all candidates)
POST /api/docusign/envelopes/:id/refresh       # re-poll live status
GET  /api/docusign/envelopes/:id/signing-url   # embedded signing URL
GET  /api/docusign/envelopes/:id/document.html # rendered (auto-filled) contract
GET  /api/docusign/envelopes/:id/document      # completed PDF
POST /api/docusign/envelopes/:id/void
POST /api/docusign/envelopes/:id/simulate      # simulated mode only
POST /api/docusign/webhook                      # DocuSign Connect callback
GET  /docusign                                  # recruiter console (UI)
```

## Going live

Set the `DOCUSIGN_*` env vars (see `.env.example`), grant the integration consent
once (the server logs the URL on first auth failure), and `mode()` flips to `live`.
No code changes — the same console and endpoints then create real, legally-binding
envelopes.
