/* Built-in QuickHire onboarding documents. Each is laid out on a US Letter page
   with fixed form rows and signature blocks so default field placements line
   up exactly with the generated PDF (pdfgen.ts draws the same layout). */
import { Field, FieldType, FIELD_DEFS, PT_TO_PX, LETTER, PAGE_W, uid, Validation } from './model';

export type CatalogRow = { label: string; merge?: string; input?: { label: string; validation?: Validation; type?: FieldType } };
export interface CatalogDoc {
  name: string;
  category: string;
  rows: CatalogRow[];
  body: (carrier: string) => string[];
  signers: string[];          // signature block labels, by role index
  initials?: boolean;
  checks?: string[];          // acknowledgement checkboxes for the first signer
}

const ID_ROWS: CatalogRow[] = [
  { label: 'Driver name', merge: 'driver.name' }, { label: 'CDL #', merge: 'driver.cdlNumber' },
  { label: 'Phone', merge: 'driver.phone' }, { label: 'CDL state', merge: 'driver.cdlState' },
];

export const CATALOG: Record<string, CatalogDoc> = {
  offer_letter: {
    name: 'Offer Letter', category: 'Onboarding', signers: ['Driver', 'Carrier Representative'],
    rows: [{ label: 'Driver name', merge: 'driver.name' }, { label: 'Position', merge: 'emp.position' }, { label: 'Pay rate', merge: 'emp.payRate' }, { label: 'Start date', merge: 'emp.startDate' }],
    body: (c) => [
      `${c} ("Company") is pleased to offer you the position listed above, subject to the terms of this letter.`,
      'This offer is contingent on successful completion of DOT pre-employment screening, including a pre-employment drug test, a Motor Vehicle Record review, a Clearinghouse query, a valid DOT medical certificate, and verification of your driving history.',
      'Your compensation and start date are shown above. Benefits eligibility, home-time policy and equipment assignment are described in the Company Driver Handbook, which will be provided at orientation.',
      'Employment with the Company is at will. This letter does not create a contract for any specific term.',
      'Please sign below to accept this offer. The offer expires if not accepted within the time shown in your invitation.',
    ],
    checks: ['I have read and accept the terms of this offer.'],
  },
  company_driver_agreement: {
    name: 'Company Driver Agreement', category: 'Onboarding', signers: ['Driver'], initials: true, rows: ID_ROWS,
    body: (c) => [
      `This agreement is entered into between ${c} ("Company") and the driver named above ("Driver").`,
      'Driver agrees to operate commercial motor vehicles in compliance with all Federal Motor Carrier Safety Regulations (49 CFR Parts 382–399), applicable state laws, Company safety policies and hours-of-service rules, and to keep an accurate electronic log at all times.',
      'Driver will promptly report any accident, citation, license suspension, or change in medical qualification. Driver consents to random, post-accident and reasonable-suspicion drug and alcohol testing.',
      'Driver shall conduct pre-trip and post-trip inspections, secure all cargo, and protect Company equipment. Personal passengers are not permitted without written authorization.',
      'Either party may end this agreement at any time with notice. Sections relating to safety reporting and return of Company property survive termination.',
    ],
    checks: ['I have received the Company Driver Handbook.', 'I understand the hours-of-service and ELD policy.'],
  },
  mvr_consent: {
    name: 'MVR Consent', category: 'Compliance', signers: ['Driver'], rows: [...ID_ROWS, { label: 'Date of birth', input: { label: 'Date of birth', type: 'date' } }],
    body: (c) => [
      `I authorize ${c} and its agents to obtain my Motor Vehicle Record (MVR) from any state in which I have held a driver's license, for employment screening and annual review purposes under the Fair Credit Reporting Act and 49 CFR §391.23 and §391.25.`,
      'I understand that this information will be used to determine my qualification to operate a commercial motor vehicle and that this authorization remains valid during my application and employment.',
    ],
  },
  psp_consent: {
    name: 'PSP Consent', category: 'Compliance', signers: ['Driver'], rows: ID_ROWS,
    body: (c) => [
      `In connection with my application for employment, I authorize ${c} to access the FMCSA Pre-Employment Screening Program (PSP) system to obtain my crash data for the previous five years and inspection history for the previous three years.`,
      'I understand that I am not required to sign this release as a condition of the application, and that I may review my PSP record and challenge its accuracy through the FMCSA DataQs system.',
      'I release the Company and FMCSA from any liability related to the authorized use of this information for employment screening.',
    ],
  },
  w9: {
    name: 'W-9 Tax Form', category: 'Tax', signers: ['Driver'],
    rows: [
      { label: 'Legal name', merge: 'driver.name' }, { label: 'Business name', input: { label: 'Business name' } },
      { label: 'Address', merge: 'driver.address' }, { label: 'ZIP code', input: { label: 'ZIP code', validation: { kind: 'zip' } } },
      { label: 'SSN / EIN', input: { label: 'SSN or EIN', validation: { kind: 'regex', pattern: '\\d{3}-?\\d{2}-?\\d{4}|\\d{2}-?\\d{7}', message: 'Enter a 9-digit SSN or EIN.' } } }, { label: 'Tax class', input: { label: 'Tax classification', type: 'dropdown' } },
    ],
    body: () => [
      'Request for Taxpayer Identification Number and Certification. This summary collects the information your carrier needs to issue an IRS Form 1099 or W-2. Your carrier may also ask you to complete the official IRS Form W-9.',
      'Under penalties of perjury, I certify that: (1) the number shown on this form is my correct taxpayer identification number; (2) I am not subject to backup withholding; and (3) I am a U.S. citizen or other U.S. person.',
    ],
  },
  clearinghouse_consent: {
    name: 'Clearinghouse Consent', category: 'Compliance', signers: ['Driver'], rows: ID_ROWS,
    body: (c) => [
      `I hereby provide consent to ${c} to conduct a limited query of the FMCSA Commercial Driver's License Drug and Alcohol Clearinghouse to determine whether drug or alcohol violation information about me exists in the Clearinghouse, as required by 49 CFR Part 382.`,
      'I understand that if the limited query shows information about me exists, FMCSA will not disclose it to the employer without first obtaining my electronic consent for a full query through the Clearinghouse.',
      'This consent is valid for the duration of my employment and for one year after it ends.',
    ],
  },
  owner_operator_agreement: {
    name: 'Owner Operator Agreement', category: 'Onboarding', signers: ['Owner-Operator', 'Carrier Representative'], initials: true,
    rows: [...ID_ROWS, { label: 'Unit #', input: { label: 'Unit number' } }, { label: 'Settlement %', input: { label: 'Settlement percent', type: 'number' } }],
    body: (c) => [
      `This Independent Contractor Operating Agreement is made between ${c} ("Carrier") and the Owner-Operator named above, in accordance with the federal leasing regulations at 49 CFR Part 376.`,
      'Owner-Operator will provide the equipment identified above with a qualified driver, and Carrier will have exclusive possession, control and use of the equipment for the duration of this lease as required by 49 CFR §376.12.',
      'Carrier will pay Owner-Operator the settlement percentage shown above within 15 days of receipt of required paperwork. Chargebacks, escrow and insurance deductions are itemized on each settlement statement.',
      'Owner-Operator is responsible for fuel, maintenance, tolls and permits unless otherwise agreed in writing. Either party may terminate on 30 days written notice.',
    ],
  },
  equipment_lease: {
    name: 'Equipment Lease', category: 'Onboarding', signers: ['Lessee', 'Lessor'], initials: true,
    rows: [{ label: 'Lessee', merge: 'driver.name' }, { label: 'Unit #', input: { label: 'Unit number' } }, { label: 'VIN', input: { label: 'VIN', validation: { kind: 'regex', pattern: '[A-HJ-NPR-Z0-9]{17}', message: 'Enter the 17-character VIN.' } } }, { label: 'Plate', input: { label: 'Plate' } }],
    body: (c) => [
      `Equipment Lease Agreement between ${c} ("Lessor") and the Lessee named above for the tractor identified by the unit number and VIN above.`,
      'Lessee agrees to the weekly lease payment schedule, preventive maintenance intervals and physical damage insurance requirements provided at signing. Lessee will return the equipment in the same condition, normal wear excepted.',
      'Late payments may be deducted from settlements. Lessor may recover the equipment immediately if Lessee abandons it or operates it unsafely.',
    ],
  },
  drug_testing_consent: {
    name: 'Drug Testing Consent', category: 'Compliance', signers: ['Driver'], rows: ID_ROWS,
    body: (c) => [
      `I consent to pre-employment, random, post-accident, reasonable-suspicion, return-to-duty and follow-up drug and alcohol testing as required by ${c} policy and 49 CFR Parts 40 and 382.`,
      'I understand that a verified positive result, an adulterated or substituted specimen, or a refusal to test will remove me from safety-sensitive functions and may disqualify me from employment.',
      'I authorize the release of my test results to the Company, its Medical Review Officer and the FMCSA Clearinghouse as required by law.',
    ],
  },
};
export const CATALOG_KEYS = Object.keys(CATALOG);

/* Fixed layout (PDF points, origin top-left). */
export const L = {
  margin: 60, titleY: 72, subY: 92, rowY0: 132, rowH: 28, colX: [60, 330], labelW: 92, lineW: 158,
  sigY1: [652], sigY2: [606, 692], sigLineW: 240, dateX: 360, dateW: 160, initials: { x: 470, y: 752 },
};
export function rowPos(i: number) { return { x: L.colX[i % 2], y: L.rowY0 + Math.floor(i / 2) * L.rowH }; }
export function sigYs(n: number) { return n > 1 ? L.sigY2 : L.sigY1; }
export function bodyTop(doc: CatalogDoc) { return L.rowY0 + Math.ceil(doc.rows.length / 2) * L.rowH + 10; }
export function checksTop(doc: CatalogDoc) { return sigYs(doc.signers.length)[0] - 46 - (doc.checks?.length || 0) * 20; }

export const catalogPages = () => [{ w: PAGE_W, h: Math.round(LETTER.h * PT_TO_PX) }];
const px = (n: number) => Math.round(n * PT_TO_PX * 10) / 10;

/** Default fields for a catalog document. roleIds[i] receives signature block i; roleIds[0] gets form rows. */
export function catalogFields(key: string, docId: string, roleIds: string[]): Field[] {
  const doc = CATALOG[key]; if (!doc) return [];
  const first = roleIds[0];
  const out: Field[] = [];
  const mk = (p: Partial<Field> & { type: FieldType }): Field => ({ id: uid('f'), docId, page: 0, x: 0, y: 0, w: FIELD_DEFS[p.type].w, h: FIELD_DEFS[p.type].h, recipientId: first, required: true, ...p });
  doc.rows.forEach((row, i) => {
    const p = rowPos(i);
    const geo = { x: px(p.x + L.labelW), y: px(p.y - 15), w: px(L.lineW), h: px(18) };
    if (row.merge) out.push(mk({ type: 'text', ...geo, mergeKey: row.merge, readOnly: true, required: false, label: row.label }));
    else if (row.input) {
      const t = row.input.type || 'text';
      out.push(mk({ type: t, ...geo, label: row.input.label, validation: row.input.validation, options: t === 'dropdown' ? ['Individual / sole proprietor', 'C corporation', 'S corporation', 'Partnership', 'LLC'] : undefined }));
    }
  });
  const ys = sigYs(doc.signers.length);
  doc.signers.forEach((_label, i) => {
    const rid = roleIds[i] || roleIds[roleIds.length - 1] || first;
    out.push(mk({ type: 'signature', recipientId: rid, x: px(L.margin), y: px(ys[i] - 32), w: px(L.sigLineW), h: px(30), label: `${doc.signers[i]} signature` }));
    out.push(mk({ type: 'dateSigned', recipientId: rid, x: px(L.dateX), y: px(ys[i] - 17), w: px(L.dateW), h: px(16), label: `${doc.signers[i]} date` }));
  });
  if (doc.initials) out.push(mk({ type: 'initial', x: px(L.initials.x + 46), y: px(L.initials.y - 24), w: px(56), h: px(28), label: 'Initials' }));
  (doc.checks || []).forEach((_c, i) => out.push(mk({ type: 'checkbox', x: px(L.margin), y: px(checksTop(doc) + i * 20 - 10), w: px(11), h: px(11), label: `Acknowledgement ${i + 1}` })));
  return out;
}
