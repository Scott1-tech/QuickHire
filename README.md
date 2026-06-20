# QuickHire

A driver qualification / job-application portal, recreating the **National Carrier Xpress** apply flow.

## Pages

| File | Purpose |
|------|---------|
| `index.html` | **Step 1 — Qualification.** Experience, equipment types (Dry Van, Reefer, Tanker, Hazmat, etc.), CDL endorsements, document uploads (CDL front/back, medical card), and personal/CDL details. |
| `consents.html` | **Step 2 — Consents & Authorizations.** FMCSA / FCRA background-check authorizations, signature pad (draw or type), and final submit. |

## Design

- Single-file static pages — **no build step required**.
- Styling is compiled **Tailwind CSS** embedded in an inline `<style>` block (fully self-contained).
- Fonts: **Inter** (Google Fonts).
- Brand accent color: `#b01d30`, with semantic `primary` / `accent` color scales.

## Running locally

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

Click **Next Step** on Step 1 to advance to the consents page; the back button returns to Step 1.

## Notes

The pages are an exact copy of the provided source markup and styling. A small,
self-contained navigation script was added at the bottom of each page to link the
two steps together (the original site's application JavaScript — field toggles,
validation, uploads, live signature capture, and form submission — was not part of
the saved HTML and can be rebuilt on request).
