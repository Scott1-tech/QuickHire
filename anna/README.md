# Anna — Driver Qualification AI Agent

Anna is the AI "employee" from the Fleetmule blueprint: she normalizes incoming
driver leads, matches each driver against every carrier's hiring requirements,
scans documents, builds a review portfolio, runs the compliance check, and hands
a recruiter an approve/reject recommendation with reasons.

**Built as a standalone module** (`anna/`) with clean inputs/outputs — no Express,
no database coupling. The host app (QuickHire/Fleetmule backend) calls these
functions and persists results however it likes. Integration into `server.js`
comes later, deliberately decoupled.

## Design principles

- **Deterministic decisions, AI normalization.** The *scoring* (gates + ranking)
  is plain arithmetic — fast, free, auditable, unit-testable. Claude is used only
  to turn messy input (free-text leads, document images/PDFs) into the structured
  `DriverProfile` the engine consumes. So every verdict is explainable
  (`failed gate mvr.maxDUI: 1 > 0`) and the module runs without an API key.
- **Two-layer matching.** Hard gates (pass/fail disqualifiers) decide
  eligibility; soft weights only *rank* carriers a driver already qualifies for.
  Missing data is `NEEDS_DATA`, never an auto-reject.
- **Async by default.** API-bound steps run through a concurrency-limited queue
  with retry/backoff (the blueprint's scale model).
- **Latest models, prompt caching.** Defaults to Haiku 4.5 for intake and
  Opus 4.8 for compliance reasoning; carrier specs can be sent as cached system
  context to cut input cost.

## Module map

| File | Stage | Responsibility |
|------|-------|----------------|
| `spec.js` | Carrier onboarding | Compile a carrier's `requirements` → hard gates + soft weights (versioned, declarative). |
| `matcher.js` | 1 — Matching | `evaluateGates`, `scoreSoft`, `matchDriver` (rank across all carriers), `suggestRematch`. |
| `normalize.js` | 1 / 2 — Intake & scanning | `normalizeDriver` (lead → profile), `extractFromDocument` (license/cert vision). |
| `portfolio.js` | 3 / 4 — Portfolio & compliance | `buildPortfolio` (+ recruiter assignment), `writeCompliance` (approve/reject). |
| `integrations.js` | 4 — Compliance pull | MVR/PSP/Clearinghouse adapters behind a **consent gate**; real provider calls when configured, flagged simulated pulls otherwise. |
| `queue.js` | cross-cutting | In-process job queue: bounded concurrency + exponential backoff. |
| `claude.js` | cross-cutting | Dependency-free Anthropic Messages client (system caching, image/PDF blocks, JSON). |
| `index.js` | — | Public API + `processLead` orchestrator (normalize → match → portfolio). |

## Data contract

A `DriverProfile` (and the matching carrier `requirements`) use this nested
shape, identical to QuickHire's existing screening shape:

```js
{
  name, age, phone, email,
  cdl: { class: 'A'|'B'|'C', endorsements: ['H','N','T','X','P','S'],
         experienceYears, type: 'company'|'owner-operator', expiresInDays },
  mvr: { movingViolations, accidents, dui },
  psp: { crashes, oosInspections },
  insurance: { autoLiability, hasCargo, cargo },
}
```

Carrier `requirements` mirror it with caps/minimums:
`cdl.minExperienceYears`, `mvr.maxDUI`, `insurance.minAutoLiability`,
`eligibility.minAge`, etc. Blank fields produce no gate.

## Usage

```js
import { processLead, matchDriver, writeCompliance, normalizeDriver } from './anna/index.js';

// Stage 1–3: normalize a lead, match all carriers, build a portfolio.
const { profile, match, portfolio } = await processLead({
  lead,                 // raw FB/TikTok/form payload
  carriers,             // array of carrier records (with .requirements)
  opts: { recruiterPool: ['Jenna', 'Marco'], minScore: 0 },
});

// Stage 4: after a carrier is chosen, pull MVR/PSP/Clearinghouse and verdict.
const compliance = await writeCompliance({
  carrier,
  driver: profile,
  records: { mvr: { dui: 1 }, psp: { crashes: 0 }, clearinghouse: { prohibited: false } },
  opts: { narrate: true },   // optional Claude-written summary
});
// => { flag: 'approve'|'reject'|'review', categories, reasons, summary }
```

## Environment

| Var | Purpose |
|-----|---------|
| `ANTHROPIC_API_KEY` | Enables AI normalization/scanning/narration. Without it, deterministic fallbacks run. |
| `ANNA_FAST_MODEL` | Intake/normalization model (default `claude-haiku-4-5-20251001`). |
| `ANNA_SMART_MODEL` | Compliance reasoning model (default `claude-opus-4-8`). |
| `ANNA_CONCURRENCY` | Default queue concurrency (default 4). |
| `MVR_API_URL` / `MVR_API_KEY` | MVR provider; both set ⇒ live pulls, else simulated. |
| `PSP_API_URL` / `PSP_API_KEY` | PSP provider. |
| `CLEARINGHOUSE_API_URL` / `CLEARINGHOUSE_API_KEY` | Clearinghouse provider. |

## Tests

```bash
node anna/test/run.js
```

35 assertions covering the spec compiler, hard-gate pass/fail/unknown, soft
scoring, cross-carrier ranking, near-miss/re-match, the heuristic normalizer,
portfolio assignment, compliance verdicts, and the queue. No API key required.

## HTTP API (wired into `server.js`)

All routes require the admin token (`x-admin-token`) and live under `/api/anna`.
Carrier free-text requirements are parsed into structured specs on first use and
cached on the carrier record (`structuredRequirements`). Portfolios persist to
`anna-portfolios.json` in `DATA_DIR`.

| Method & path | Purpose |
|---|---|
| `POST /api/anna/match` | Normalize a `driver`/`lead` and rank it against all carriers (no persistence). |
| `POST /api/anna/leads` | Stage 1→3: normalize → match → persist a portfolio for the best fit. |
| `POST /api/anna/scan` | Scan a document (`dataUrl`, `docType`) → extracted fields (needs API key). |
| `POST /api/anna/rematch` | Suggest other carriers for a `driver` (`excludeCarrierIds`). |
| `GET /api/anna/portfolios` | List portfolio summaries. |
| `GET /api/anna/portfolios/:id` | Full portfolio. |
| `POST /api/anna/portfolios/:id/compliance` | Stage 4: `pull:true` + `consent` pulls MVR/PSP/Clearinghouse (consent enforced → 403 if missing), or pass `records` manually → approve/reject verdict (records supersede self-reported data). |
| `POST /api/anna/portfolios/:id/decision` | Stage 5: `decision` (`approved`/`rejected`) + `reason`; rejection returns re-match suggestions. |

## Not yet wired (next steps)

- Real provider request/response mapping in `integrations.js` (the `pull()` seam
  is generic — adjust identity fields + `mapResponse` to each provider's contract).
- Driver-facing consent capture wired to the application flow (the gate is
  enforced server-side today; consent is passed per request).
