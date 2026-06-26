// docusign/documents.js
// ─────────────────────────────────────────────────────────────────────────────
// Pure builders (no network) for the things that go *inside* an envelope:
//   • The documents themselves (HTML — DocuSign renders HTML documents to PDF).
//   • Signer "tabs": the signature/date/name fields AND the prefilled data
//     fields (SSN, CDL, address, …).
//   • A catalog mapping QuickHire document types → ready-to-send documents.
//
// AUTO-FILL (the key UX): QuickHire already collected the driver's details during
// the application, so every contract is PRE-FILLED from that data. The driver
// only reviews and corrects — they never retype what we already know. This is
// implemented with DocuSign prefilled text tabs carrying a `value` and
// `locked:'false'`, so each field shows the known value but stays editable.
//
// Anchor strings (rendered in 1px near-white text — invisible to humans, found
// by DocuSign's anchor-tab placement):
//   /sn1/ Sign Here   /ds1/ Date Signed   /fn1/ Full Name
//   /f_*/ one per auto-filled data field (see DATA_FIELDS)
// ─────────────────────────────────────────────────────────────────────────────

const COMPANY = process.env.COMPANY_NAME || 'National Carrier Xpress Corp';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const anchor = (tok) => `<span style="color:#fffffe;font-size:1px">${tok}</span>`;

// ── Driver data we can auto-fill ─────────────────────────────────────────────
// Each field maps a QuickHire application value onto an editable DocuSign tab.
// `key` is the normalized profile key; `anchor` is where the tab lands.
export const DATA_FIELDS = [
  { key: 'fullName',  label: 'Full Legal Name', anchor: '/f_name/',  required: true },
  { key: 'dob',       label: 'Date of Birth',   anchor: '/f_dob/' },
  { key: 'ssn',       label: 'SSN',             anchor: '/f_ssn/' },
  { key: 'address',   label: 'Street Address',  anchor: '/f_addr/' },
  { key: 'city',      label: 'City',            anchor: '/f_city/' },
  { key: 'state',     label: 'State',           anchor: '/f_state/' },
  { key: 'zip',       label: 'ZIP',             anchor: '/f_zip/' },
  { key: 'phone',     label: 'Phone',           anchor: '/f_phone/' },
  { key: 'email',     label: 'Email',           anchor: '/f_email/' },
  { key: 'cdlNumber', label: 'CDL Number',      anchor: '/f_cdln/',  required: true },
  { key: 'cdlState',  label: 'CDL State',       anchor: '/f_cdls/' },
  { key: 'cdlClass',  label: 'CDL Class',       anchor: '/f_cdlc/' },
  { key: 'cdlExp',    label: 'CDL Expiration',  anchor: '/f_cdle/' },
];

/**
 * Normalize a QuickHire candidate (+ their submitted application) into the flat
 * profile the contract fields auto-fill from. Missing values become '' so the
 * field renders blank-but-editable (e.g. SSN, which QuickHire doesn't collect).
 */
export function driverProfile(candidate = {}) {
  const a = candidate.application || {};
  const name = candidate.name || [a.firstName, a.lastName].filter(Boolean).join(' ').trim();
  return {
    fullName: name || '',
    dob: a.dateOfBirth || a.dob || '',
    ssn: a.ssn || a.socialSecurityNumber || '',
    address: a.address || a.street || '',
    city: a.city || '',
    state: a.state || '',
    zip: a.zipcode || a.zip || a.postalCode || '',
    phone: candidate.phone || a.phone || '',
    email: candidate.email || a.email || '',
    cdlNumber: a.cdlNumber || '',
    cdlState: a.cdlState || '',
    cdlClass: a.cdlClass || '',
    cdlExp: a.cdlExpirationDate || a.cdlExp || '',
  };
}

/** Which auto-fill fields are still blank (so the UI can warn the recruiter). */
export function missingFields(profile) {
  return DATA_FIELDS.filter((f) => !String(profile[f.key] || '').trim()).map((f) => f.label);
}

// ── HTML document shell ──────────────────────────────────────────────────────
function page(title, inner) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.55;max-width:720px;margin:0 auto;padding:32px}
  h1{color:#b01d30;font-size:22px;margin:0 0 4px}
  h2{font-size:15px;margin:24px 0 6px}
  .muted{color:#6b7280;font-size:12px;font-weight:400}
  .sigline{margin-top:44px;border-top:1px solid #9ca3af;width:280px;padding-top:6px;font-size:13px;color:#6b7280}
  table{border-collapse:collapse;width:100%;margin:10px 0}
  td{padding:7px 9px;border:1px solid #e5e7eb;font-size:14px;vertical-align:top}
  td.k{background:#f9fafb;font-weight:600;width:38%}
  .blank{display:inline-block;min-width:200px;border-bottom:1px solid #cbd5e1}
  .review-note{background:#fef2f4;border:1px solid #f7c4cc;color:#8f1727;border-radius:8px;padding:10px 12px;font-size:12.5px;margin:8px 0}
</style></head><body>
  <h1>${esc(COMPANY)}</h1>
  <div class="muted">${esc(title)}</div>
  ${inner}
  <div class="sigline">Signature: ${anchor('/sn1/')}</div>
  <div class="muted" style="margin-top:8px">Name: ${anchor('/fn1/')} &nbsp;&nbsp; Date: ${anchor('/ds1/')}</div>
</body></html>`;
}

const kv = (rows) => `<table>${rows.filter(Boolean).map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;

/**
 * The "Driver Information" review block — every auto-filled field.
 * @param simulated  true → render the actual values inline (preview / sim mode);
 *                    false → render the invisible anchor only (the live DocuSign
 *                    editable tab overlays it with the prefilled value).
 */
function reviewBlock(profile, simulated) {
  const rows = DATA_FIELDS.map((f) => {
    const val = profile[f.key] || '';
    const cell = simulated
      ? (val ? `<strong>${esc(val)}</strong>` : '<span style="color:#b91c1c">— please complete —</span>')
      : `<span class="blank">${anchor(f.anchor)}</span>`;
    return `<tr><td class="k">${esc(f.label)}</td><td>${cell}</td></tr>`;
  }).join('');
  return `<h2>Driver Information <span class="muted">(auto-filled from your application — review &amp; correct anything that's wrong)</span></h2>
    <div class="review-note">These details were filled in from the information you already gave us. Please confirm each one is correct; tap any field to edit it before signing.</div>
    <table>${rows}</table>`;
}

// ── Document templates ───────────────────────────────────────────────────────
// build(candidate, fields, review) — `review` is the prebuilt auto-fill block.
export const DOC_TEMPLATES = {
  offer_letter: {
    label: 'Offer Letter',
    description: 'Formal offer of employment for the driver to review, correct and sign.',
    build: (c, f = {}, review = '') => page('Offer of Employment — Professional Driver', `
      <p>Dear ${esc(c.name)},</p>
      <p>We are pleased to offer you a position as a <strong>${esc(f.position || 'Company Driver (CDL-A)')}</strong>
         with ${esc(COMPANY)}. We were impressed with your qualifications and look forward to having you on the team.</p>
      ${kv([
        ['Position', f.position || 'Company Driver (CDL-A)'],
        ['Compensation', f.payRate || 'Per company pay schedule'],
        ['Start / Orientation Date', f.startDate || 'To be scheduled'],
        ['Reports To', f.supervisor || 'Safety & Driver Management'],
        ['Employment Type', f.employmentType || 'Full-time'],
      ])}
      ${review}
      <h2>Acceptance</h2>
      <p>This offer is contingent on successful completion of DOT pre-employment requirements
         (MVR, PSP, Clearinghouse query, drug screen, and background check). By signing below,
         you accept this offer and confirm the information above is accurate.</p>`),
  },
  mvr_consent: {
    label: 'MVR Consent Form',
    description: 'Driver authorization to pull the Motor Vehicle Record.',
    build: (c, _f, review = '') => page('Motor Vehicle Record (MVR) Consent & Authorization', `
      <p>I authorize ${esc(COMPANY)} to obtain my Motor Vehicle Record (MVR) from any state
         Department of Motor Vehicles to evaluate my qualifications for employment as a commercial
         driver, in accordance with 49 CFR Part 391.</p>
      ${review}
      <p>I understand this authorization remains valid throughout my employment for ongoing
         driver-qualification monitoring.</p>`),
  },
  psp_consent: {
    label: 'PSP Consent Form',
    description: 'FMCSA Pre-Employment Screening Program disclosure & authorization.',
    build: (c, _f, review = '') => page('PSP Disclosure & Authorization (FMCSA)', `
      <p>In connection with my application with ${esc(COMPANY)}, I authorize the company to access
         my FMCSA Pre-Employment Screening Program (PSP) report, which contains my federal crash
         and roadside-inspection history.</p>
      ${review}
      <p>I have read and understand this disclosure and authorize the release of the PSP report.</p>`),
  },
  drug_test_consent: {
    label: 'Drug & Alcohol Testing Consent',
    description: 'Consent to DOT pre-employment and ongoing drug & alcohol testing.',
    build: (c, _f, review = '') => page('DOT Drug & Alcohol Testing Consent', `
      <p>I consent to pre-employment, random, post-accident, reasonable-suspicion, and
         return-to-duty drug and alcohol testing as required under 49 CFR Part 382, as a condition
         of employment with ${esc(COMPANY)}.</p>
      ${review}`),
  },
  employment_application: {
    label: 'Driver Application for Employment',
    description: 'Certification of the Driver Application for Employment (49 CFR 391.21).',
    build: (c, _f, review = '') => page('Driver Application for Employment — Certification', `
      <p>I certify that the information below and in my Driver Application for Employment is true and
         complete to the best of my knowledge, and that any misrepresentation or omission may be
         grounds for rejection or termination.</p>
      ${review}`),
  },
  clearinghouse_consent: {
    label: 'Clearinghouse Query Consent',
    description: 'Consent for an FMCSA Drug & Alcohol Clearinghouse query.',
    build: (c, _f, review = '') => page('FMCSA Clearinghouse — Query Consent', `
      <p>I give ${esc(COMPANY)} consent to query the FMCSA Drug & Alcohol Clearinghouse to determine
         whether drug or alcohol violation information exists about me, as required by 49 CFR Part 382,
         Subpart G.</p>
      ${review}`),
  },
  owner_operator_agreement: {
    label: 'Owner-Operator Agreement',
    description: 'Independent Contractor (owner-operator) lease & operating agreement.',
    build: (c, f = {}, review = '') => page('Independent Contractor Agreement — Owner-Operator', `
      <p>This Independent Contractor Agreement is entered into between ${esc(COMPANY)} ("Carrier") and the
         contractor identified below ("Contractor") for the lease of equipment and provision of
         transportation services under the Carrier's operating authority.</p>
      ${kv([
        ['Settlement / Pay', f.payRate || 'Percentage of line-haul per settlement schedule'],
        ['Equipment', f.equipment || 'Contractor-provided tractor'],
        ['Term', f.term || 'At-will, 30-day written termination'],
      ])}
      ${review}
      <h2>Agreement</h2>
      <p>By signing, the Contractor agrees to operate as an independent contractor under 49 CFR Part 376,
         maintain required insurance and qualifications, and confirms the information above is accurate.</p>`),
  },
  company_driver_agreement: {
    label: 'Company Driver Agreement',
    description: 'Employment agreement for a company (W-2) CDL driver.',
    build: (c, f = {}, review = '') => page('Company Driver Agreement', `
      <p>This agreement sets the terms of employment between ${esc(COMPANY)} and the driver named below as a
         company (W-2) commercial driver.</p>
      ${kv([
        ['Pay', f.payRate || 'Per company pay schedule'],
        ['Run Type', f.runType || 'OTR'],
        ['Start Date', f.startDate || 'To be scheduled'],
      ])}
      ${review}
      <h2>Acceptance</h2>
      <p>By signing, the driver accepts employment on the terms above, agrees to company safety and DOT
         policies, and confirms the information is accurate.</p>`),
  },
  lease_agreement: {
    label: 'Equipment Lease Agreement',
    description: 'Lease of a tractor/trailer between the carrier and driver.',
    build: (c, f = {}, review = '') => page('Equipment Lease Agreement', `
      <p>${esc(COMPANY)} agrees to lease the equipment described below to the lessee named herein, subject to
         the terms of this agreement and 49 CFR Part 376.</p>
      ${kv([
        ['Equipment', f.equipment || 'Tractor (unit # to be assigned)'],
        ['Lease Rate', f.payRate || 'Per lease schedule'],
        ['Term', f.term || 'Month-to-month'],
      ])}
      ${review}`),
  },
};

/** Catalog for UIs: [{ type, label, description }]. */
export function documentCatalog() {
  return Object.entries(DOC_TEMPLATES).map(([type, t]) => ({ type, label: t.label, description: t.description }));
}

/**
 * Build the HTML for a given document type, auto-filled from the candidate.
 * @param {boolean} opts.simulated  render values inline (preview/sim) vs anchors (live).
 */
export function buildDocumentHtml(docType, candidate, fields = {}, { simulated = true } = {}) {
  const tpl = DOC_TEMPLATES[docType];
  if (!tpl) throw new Error(`Unknown DocuSign document type: ${docType}`);
  const profile = driverProfile(candidate);
  return tpl.build(candidate || {}, fields, reviewBlock(profile, simulated));
}

/** Wrap HTML into a DocuSign `documents[]` entry (DocuSign converts HTML → PDF). */
export function htmlDocument({ name, html, documentId = '1' }) {
  return {
    documentBase64: Buffer.from(html, 'utf8').toString('base64'),
    name,
    fileExtension: 'html',
    documentId: String(documentId),
  };
}

/**
 * All signer tabs for one recipient: the prefilled (editable) data fields plus
 * the signature/name/date tabs. `profile` supplies the auto-filled values.
 */
export function buildSignerTabs(profile = {}) {
  const at = (anchorString, extra = {}) => ({ anchorString, anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-6', ...extra });
  return {
    signHereTabs: [at('/sn1/')],
    fullNameTabs: [at('/fn1/')],
    dateSignedTabs: [at('/ds1/')],
    // Prefilled, EDITABLE data fields → the driver reviews & corrects, never retypes.
    textTabs: DATA_FIELDS.map((f) => at(f.anchor, {
      tabLabel: f.key,
      value: profile[f.key] || '',
      width: 210,
      locked: 'false',                 // editable
      required: f.required ? 'true' : 'false',
      font: 'arial',
      fontSize: 'size10',
      anchorXOffset: '2',
      anchorYOffset: '-9',
    })),
  };
}

// ── Free-placed fields → DocuSign tabs ───────────────────────────────────────
// The envelope builder lets a sender drop fields anywhere on the document. Each
// placed field carries page-relative coordinates (0..1); map them to DocuSign's
// absolute tab positions (points, 612×792 US-Letter) for the live API.
const FIELD_TAB_GROUP = {
  signature: 'signHereTabs', initial: 'initialHereTabs', date: 'dateSignedTabs',
  name: 'fullNameTabs', title: 'titleTabs', company: 'companyTabs',
  email: 'textTabs', text: 'textTabs', number: 'numberTabs', checkbox: 'checkboxTabs',
};
// Named format presets → regex, matching the builder's Validation dropdown.
const VALIDATION_PATTERNS = {
  SSN: '\\d{3}-\\d{2}-\\d{4}', Email: '[^@]+@[^.]+\\..+', Numbers: '\\d+', Letters: '[A-Za-z]+',
  Date: '\\d{1,2}/\\d{1,2}/\\d{4}', 'ZIP+4': '\\d{5}-\\d{4}', ZIP: '\\d{5}',
};
export function placedFieldsToTabs(placed = [], { pageW = 612, pageH = 792 } = {}) {
  const tabs = {};
  for (const f of placed) {
    const group = FIELD_TAB_GROUP[f.type] || 'textTabs';
    const tab = {
      xPosition: String(Math.round((f.xPct || 0) * pageW)),
      yPosition: String(Math.round((f.yPct || 0) * pageH)),
      pageNumber: String(f.page || 1),
      documentId: '1',
      tabLabel: f.label || f.type,
      ...(f.required ? { required: 'true' } : {}),
      ...(f.readOnly ? { locked: 'true' } : {}),
      ...(f.value ? { value: String(f.value) } : {}),
      // Formatting
      ...(f.font ? { font: f.font.replace(/\s+/g, '') } : {}),
      ...(f.fontSize ? { fontSize: `size${f.fontSize}` } : {}),
      ...(f.color ? { fontColor: f.color } : {}),
      ...(f.bold ? { bold: 'true' } : {}),
      ...(f.italic ? { italic: 'true' } : {}),
      ...(f.underline ? { underline: 'true' } : {}),
      ...(f.hideAsterisks ? { concealValueOnDocument: 'true' } : {}),
    };
    // Validation applies to free-text tabs.
    if (group === 'textTabs') {
      const pat = f.validation === 'Custom' ? f.customPattern : VALIDATION_PATTERNS[f.validation];
      if (pat) { tab.validationPattern = pat; if (f.errorMessage) tab.validationMessage = f.errorMessage; }
    }
    (tabs[group] = tabs[group] || []).push(tab);
  }
  return tabs;
}
/** Concatenate two tab maps (e.g. anchored auto-fill + free-placed) by group. */
export function mergeTabs(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = [...(out[k] || []), ...v];
  return out;
}

// ── Minimal PDF generator (SIMULATED completed-document download) ─────────────
export function simplePdf(title, lines = []) {
  const escPdf = (s) => String(s).replace(/([\\()])/g, '\\$1');
  const parts = [`BT /F1 18 Tf 72 730 Td (${escPdf(title)}) Tj ET`];
  let y = 700;
  for (const line of lines) { parts.push(`BT /F1 11 Tf 72 ${y} Td (${escPdf(line)}) Tj ET`); y -= 18; }
  const stream = parts.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => { pdf += `${String(off).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}
