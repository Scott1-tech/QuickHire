import { describe, it, expect } from 'vitest';
import {
  Field, Recipient, Envelope, Template, currentRoutingOrder, activeRecipients, advanceRouting, deriveStatus, routingSteps,
  isVisible, validateValue, completion, fillMerge, fillText, instantiateTemplate, evalFormula, numericByLabel,
  parseRecipientsCsv, parseCsv, formDataCsv, migrateEnvelopeV1, migrateTemplateV1, validateForSend, inView, statusLine,
  readingOrder, parseDate, autoValue, cloneFields, isExpiringSoon,
} from './model';

const f = (p: Partial<Field>): Field => ({ id: p.id || 'f' + Math.random().toString(36).slice(2, 7), docId: 'd1', page: 0, x: 0, y: 0, w: 100, h: 20, type: 'text', recipientId: 'r1', required: false, ...p });
const r = (p: Partial<Recipient>): Recipient => ({ id: p.id || 'r', name: 'A', email: 'a@x.com', action: 'sign', order: 1, color: '#000', status: 'created', ...p });
const env = (p: Partial<Envelope>): Envelope => ({
  id: 'env_1', title: 'T', status: 'sent', documents: [{ id: 'd1', name: 'Doc', source: 'catalog', pages: [{ w: 680, h: 880 }] }], recipients: [], fields: [], subject: 'S', message: '',
  signingOrder: true, reminders: { enabled: false, everyDays: 3 }, remindersSent: 0, maxReminders: 3, expireDays: 14, expiresAt: new Date(Date.now() + 10 * 864e5).toISOString(), warnDays: 3,
  driverName: '', carrier: '', createdAt: '', updatedAt: '', lastActivity: '', audit: [], comments: [], sender: { name: 'Nina', email: 'nina@qh.app' }, version: 2, ...p,
});

describe('routing order resolution', () => {
  it('sequential: only the lowest pending order is active', () => {
    const e = env({ recipients: [r({ id: 'a', order: 1 }), r({ id: 'b', order: 2 })] });
    expect(currentRoutingOrder(e)).toBe(1);
    advanceRouting(e);
    expect(e.recipients[0].status).toBe('sent');
    expect(e.recipients[1].status).toBe('created');
    expect(activeRecipients(e).map((x) => x.id)).toEqual(['a']);
    e.recipients[0].status = 'signed';
    expect(currentRoutingOrder(e)).toBe(2);
    advanceRouting(e);
    expect(activeRecipients(e).map((x) => x.id)).toEqual(['b']);
  });
  it('same number routes in parallel', () => {
    const e = env({ recipients: [r({ id: 'a', order: 1 }), r({ id: 'b', order: 1 }), r({ id: 'c', order: 2 })] });
    advanceRouting(e);
    expect(activeRecipients(e).map((x) => x.id).sort()).toEqual(['a', 'b']);
    e.recipients[0].status = 'signed';
    expect(activeRecipients(e).map((x) => x.id)).toEqual(['b']);
    expect(routingSteps(e).map(([o, rs]) => [o, rs.length])).toEqual([[1, 2], [2, 1]]);
  });
  it('signing order off makes everyone parallel', () => {
    const e = env({ signingOrder: false, recipients: [r({ id: 'a', order: 1 }), r({ id: 'b', order: 5 })] });
    advanceRouting(e);
    expect(activeRecipients(e)).toHaveLength(2);
  });
  it('CC gets its copy when routing reaches it and completion is reported', () => {
    const e = env({ recipients: [r({ id: 'a', order: 1 }), r({ id: 'cc', action: 'cc', order: 2 }), r({ id: 'b', order: 3 })] });
    advanceRouting(e);
    expect(e.recipients[1].status).toBe('created');
    e.recipients[0].status = 'signed';
    advanceRouting(e);
    expect(e.recipients[1].status).toBe('completed');
    e.recipients[2].status = 'signed';
    const res = advanceRouting(e);
    expect(res.complete).toBe(true);
    expect(deriveStatus(e)).toBe('completed');
  });
  it('derives in-progress and declined statuses', () => {
    const e = env({ recipients: [r({ id: 'a', status: 'signed' }), r({ id: 'b', order: 2, status: 'sent' })] });
    expect(deriveStatus(e)).toBe('partially_signed');
    e.recipients[1].status = 'declined';
    expect(deriveStatus(e)).toBe('declined');
    expect(advanceRouting(e).complete).toBe(false);
  });
});

describe('conditional logic', () => {
  const cb = f({ id: 'cb', type: 'checkbox' });
  const txt = f({ id: 't', conditional: { fieldId: 'cb', op: 'checked' }, required: true });
  const dd = f({ id: 'dd', type: 'dropdown', options: ['CDL-A', 'CDL-B'] });
  const dep = f({ id: 'dep', conditional: { fieldId: 'dd', op: 'equals', value: 'cdl-a' } });
  const ra = f({ id: 'ra', type: 'radio', group: 'g', optionValue: 'Yes' });
  const rb = f({ id: 'rb', type: 'radio', group: 'g', optionValue: 'No' });
  const rdep = f({ id: 'rdep', conditional: { fieldId: 'rb', op: 'equals', value: 'Yes' } });
  const nested = f({ id: 'n', conditional: { fieldId: 't', op: 'notEmpty' } });
  const all = [cb, txt, dd, dep, ra, rb, rdep, nested];
  it('shows a field when a checkbox is checked', () => {
    expect(isVisible(txt, all, {})).toBe(false);
    expect(isVisible(txt, all, { cb: 'true' })).toBe(true);
  });
  it('equals is case-insensitive for dropdowns', () => {
    expect(isVisible(dep, all, { dd: 'CDL-A' })).toBe(true);
    expect(isVisible(dep, all, { dd: 'CDL-B' })).toBe(false);
  });
  it('radio conditions use the group value from any button', () => {
    expect(isVisible(rdep, all, { ra: 'on' })).toBe(true);
    expect(isVisible(rdep, all, { rb: 'on' })).toBe(false);
  });
  it('cascades: hidden parent hides the child', () => {
    expect(isVisible(nested, all, { t: 'x' })).toBe(false);
    expect(isVisible(nested, all, { t: 'x', cb: 'true' })).toBe(true);
  });
  it('survives cycles', () => {
    const a = f({ id: 'a', conditional: { fieldId: 'b', op: 'notEmpty' } });
    const b = f({ id: 'b', conditional: { fieldId: 'a', op: 'notEmpty' } });
    expect(isVisible(a, [a, b], { a: '1', b: '1' })).toBe(false);
  });
});

describe('validation rules', () => {
  it('email / number / date / ssn / zip / phone', () => {
    expect(validateValue({ type: 'text', validation: { kind: 'email' } }, 'a@b.co')).toBeNull();
    expect(validateValue({ type: 'text', validation: { kind: 'email' } }, 'nope')).toMatch(/email/);
    expect(validateValue({ type: 'number' }, '1,250.50')).toBeNull();
    expect(validateValue({ type: 'number' }, '12a')).toMatch(/number/);
    expect(validateValue({ type: 'text', validation: { kind: 'number', min: 1, max: 10 } }, '11')).toMatch(/10 or less/);
    expect(validateValue({ type: 'date' }, '02/30/2026')).toMatch(/date/);
    expect(validateValue({ type: 'date' }, '2026-02-28')).toBeNull();
    expect(validateValue({ type: 'text', validation: { kind: 'ssn' } }, '123-45-6789')).toBeNull();
    expect(validateValue({ type: 'text', validation: { kind: 'ssn' } }, '12345')).toMatch(/SSN/);
    expect(validateValue({ type: 'text', validation: { kind: 'zip' } }, '75201-1234')).toBeNull();
    expect(validateValue({ type: 'text', validation: { kind: 'zip' } }, '7520')).toMatch(/ZIP/);
    expect(validateValue({ type: 'text', validation: { kind: 'phone' } }, '+1 (214) 555-0101')).toBeNull();
  });
  it('regex, custom message and character limit', () => {
    expect(validateValue({ type: 'text', validation: { kind: 'regex', pattern: '[A-Z]{2}\\d{6}', message: 'Use DL format' } }, 'TX123456')).toBeNull();
    expect(validateValue({ type: 'text', validation: { kind: 'regex', pattern: '[A-Z]{2}\\d{6}', message: 'Use DL format' } }, 'tx1')).toBe('Use DL format');
    expect(validateValue({ type: 'text', validation: { kind: 'none', maxLength: 3 } }, 'abcd')).toMatch(/3 characters/);
    expect(validateValue({ type: 'text', validation: { kind: 'regex', pattern: '(' } }, 'x')).toBeNull();
  });
  it('empty values are left to required checks', () => {
    expect(validateValue({ type: 'text', validation: { kind: 'email' } }, '')).toBeNull();
  });
  it('parses common date formats', () => {
    expect(parseDate('1/5/26')?.getFullYear()).toBe(2026);
    expect(parseDate('13/01/2026')).toBeNull();
  });
});

describe('merge-field fill', () => {
  it('fills known keys, reports missing and keeps defaults', () => {
    const fields = [f({ id: 'a', mergeKey: 'driver.name' }), f({ id: 'b', mergeKey: 'driver.cdlNumber', value: 'default' }), f({ id: 'c' })];
    const out = fillMerge(fields, { 'driver.name': 'Mike Okafor', 'driver.cdlNumber': '' });
    expect(out.fields[0].value).toBe('Mike Okafor');
    expect(out.fields[1].value).toBe('default');
    expect(out.missing).toEqual(['driver.cdlNumber']);
    expect(fields[0].value).toBeUndefined(); // pure
  });
  it('fills subject placeholders', () => {
    expect(fillText('Hi {first} — {carrier}', { 'driver.firstName': 'Mike', 'carrier.name': 'GRAND ONE LLC' })).toBe('Hi Mike — GRAND ONE LLC');
  });
  it('instantiates templates with remapped recipients, docs and conditions', () => {
    const t: Template = {
      id: 't', name: 'Packet', description: '', category: 'Onboarding', documents: [{ id: 'td', name: 'Offer', source: 'catalog', catalogKey: 'offer_letter', pages: [{ w: 680, h: 880 }] }],
      roles: [{ id: 'role1', roleName: 'Driver', name: '', email: '', action: 'sign', order: 1, color: '#007AFF' }, { id: 'role2', roleName: 'Carrier', name: 'Ops', email: 'ops@c.com', action: 'sign', order: 2, color: '#FF9500' }],
      fields: [f({ id: 'x1', docId: 'td', recipientId: 'role1', type: 'checkbox' }), f({ id: 'x2', docId: 'td', recipientId: 'role1', mergeKey: 'driver.name', conditional: { fieldId: 'x1', op: 'checked' } })],
      subject: 'Sign {driver}', message: '', signingOrder: true, reminders: { enabled: true, everyDays: 3 }, expireDays: 14, status: 'active', usageCount: 0, createdAt: '', updatedAt: '',
    };
    const out = instantiateTemplate(t, { role1: { name: 'Mike Okafor', email: 'mike@x.com' } }, { 'driver.name': 'Mike Okafor' });
    expect(out.recipients.map((x) => [x.name, x.order])).toEqual([['Mike Okafor', 1], ['Ops', 2]]);
    expect(out.fields.every((x) => x.recipientId === out.recipients[0].id)).toBe(true);
    expect(out.fields[1].value).toBe('Mike Okafor');
    expect(out.fields[1].conditional?.fieldId).toBe(out.fields[0].id);
    expect(out.fields[0].docId).toBe(out.documents[0].id);
    expect(out.subject).toBe('Sign Mike Okafor');
  });
  it('cloneFields remaps conditional references', () => {
    const a = f({ id: 'a', type: 'checkbox' }); const b = f({ id: 'b', conditional: { fieldId: 'a', op: 'checked' } });
    const [ca, cb] = cloneFields([a, b]);
    expect(ca.id).not.toBe('a');
    expect(cb.conditional?.fieldId).toBe(ca.id);
  });
});

describe('required-field completion', () => {
  it('counts required inputs, signatures and radio groups once', () => {
    const fields = [
      f({ id: 's', type: 'signature', required: true }),
      f({ id: 't', type: 'text', required: true }),
      f({ id: 'o', type: 'text', required: false }),
      f({ id: 'ra', type: 'radio', group: 'g', optionValue: 'Y', required: true }),
      f({ id: 'rb', type: 'radio', group: 'g', optionValue: 'N', required: true }),
      f({ id: 'd', type: 'dateSigned', required: true }),
      f({ id: 'other', type: 'text', required: true, recipientId: 'r2' }),
    ];
    let c = completion(fields, 'r1', {});
    expect(c.total).toBe(3);
    expect(c.missing.map((x) => x.id)).toEqual(['s', 't', 'ra']);
    c = completion(fields, 'r1', { s: 'signed', t: 'hello', rb: 'on' });
    expect(c.complete).toBe(true);
    expect(c.done).toBe(3);
  });
  it('ignores hidden conditional fields and read-only fields', () => {
    const fields = [f({ id: 'cb', type: 'checkbox' }), f({ id: 't', required: true, conditional: { fieldId: 'cb', op: 'checked' } }), f({ id: 'ro', required: true, readOnly: true })];
    expect(completion(fields, 'r1', {}).complete).toBe(true);
    expect(completion(fields, 'r1', { cb: 'true' }).missing.map((x) => x.id)).toEqual(['t']);
  });
  it('enforces checkbox group min/max', () => {
    const g = (id: string) => f({ id, type: 'checkbox', group: 'endorse', groupMin: 1, groupMax: 2 });
    const fields = [g('a'), g('b'), g('c')];
    expect(completion(fields, 'r1', {}).complete).toBe(false);
    expect(completion(fields, 'r1', { a: 'true' }).complete).toBe(true);
    const over = completion(fields, 'r1', { a: 'true', b: 'true', c: 'true' });
    expect(over.complete).toBe(false);
    expect(over.errors[0].message).toMatch(/no more than 2/);
  });
  it('validation errors block completion', () => {
    const fields = [f({ id: 'e', required: true, validation: { kind: 'email' } })];
    const c = completion(fields, 'r1', { e: 'bad' });
    expect(c.missing).toHaveLength(0);
    expect(c.complete).toBe(false);
  });
});

describe('formulas, CSV and views', () => {
  it('evaluates formulas safely', () => {
    expect(evalFormula('[Miles] * [Rate] + 10', { Miles: 100, Rate: 0.6 })).toBe(70);
    expect(evalFormula('([a] + 2) / 4', { a: 2 })).toBe(1);
    expect(evalFormula('1 / 0', {})).toBeNull();
    expect(evalFormula('alert(1)', {})).toBeNull();
    const nums = numericByLabel([f({ id: 'a', label: 'Miles' }), f({ id: 'b', type: 'checkbox', label: 'Bonus' })], { a: '1,000', b: 'true' });
    expect(nums).toEqual({ Miles: 1000, Bonus: 1 });
  });
  it('parses recipient CSV with or without header', () => {
    const rows = parseRecipientsCsv('Name,Email,Phone\n"Okafor, Mike",mike@x.com,555\nBad,nope,\n');
    expect(rows[0]).toMatchObject({ name: 'Okafor, Mike', email: 'mike@x.com', phone: '555' });
    expect(rows[1].error).toBe('Invalid email');
    expect(parseRecipientsCsv('A B,a@b.co')[0].name).toBe('A B');
    expect(parseCsv('a,"b ""q"""\r\nc,d')).toEqual([['a', 'b "q"'], ['c', 'd']]);
  });
  it('exports form data in reading order', () => {
    const e = env({ recipients: [r({ id: 'r1', name: 'Mike' })], fields: [f({ id: 'b', y: 100, label: 'Second', value: 'v2' }), f({ id: 'a', y: 10, label: 'First', value: 'v, 1' })] });
    const csv = formDataCsv(e).split('\r\n');
    expect(csv[1]).toContain('First');
    expect(csv[1]).toContain('"v, 1"');
    expect(readingOrder(e.fields, ['d1'])[0].id).toBe('a');
  });
  it('sorts envelopes into manage views', () => {
    const waiting = env({ recipients: [r({ id: 'a', status: 'sent' })] });
    const mine = env({ recipients: [r({ id: 'a', status: 'sent', email: 'nina@qh.app' })] });
    expect(inView(waiting, 'waiting')).toBe(true);
    expect(inView(mine, 'action')).toBe(true);
    expect(inView(mine, 'inbox')).toBe(true);
    expect(inView({ ...waiting, deletedAt: 'x' }, 'sent')).toBe(false);
    expect(inView({ ...waiting, deletedAt: 'x' }, 'deleted')).toBe(true);
    expect(isExpiringSoon({ ...waiting, expiresAt: new Date(Date.now() + 2 * 864e5).toISOString() })).toBe(true);
    expect(statusLine(waiting)).toBe('Waiting for A');
  });
  it('blocks sending incomplete envelopes', () => {
    const errs = validateForSend(env({ recipients: [r({ id: 'a', email: 'bad' })], fields: [] }));
    expect(errs.join(' ')).toMatch(/valid email/);
    expect(errs.join(' ')).toMatch(/no signature field/);
  });
  it('auto values come from the recipient', () => {
    expect(autoValue(f({ type: 'lastName' }), { name: 'Mike van Okafor', email: '' })).toBe('Okafor');
    expect(autoValue(f({ type: 'dateSigned' }), { name: '', email: '' }, '2026-03-04T12:00:00Z')).toMatch(/03\/0[34]\/2026/);
  });
});

describe('v1 migration', () => {
  it('converts stacked upload coordinates to page-relative ones', () => {
    const v1 = {
      id: 'env_old', title: 'Old', status: 'viewed', documentKeys: ['upload_a', 'offer_letter'], driverName: 'Sarah', carrier: 'GRAND ONE LLC',
      uploads: { upload_a: { name: 'Lease', pages: [{ dataUrl: 'data:image/jpeg;base64,AA', h: 880 }, { dataUrl: 'data:image/jpeg;base64,BB', h: 880 }] } },
      recipients: [{ id: 'r1', name: 'Sarah', email: 's@x.com', role: 'signer', status: 'viewed' }],
      fields: [{ id: 'f1', docKey: 'upload_a', type: 'signature', x: 10, y: 900, w: 180, h: 44, recipientId: 'r1', required: true }, { id: 'f2', docKey: 'offer_letter', type: 'autofill', autofill: 'driver.cdl', x: 1, y: 2, w: 3, h: 4, recipientId: 'r1' }],
      audit: [{ event: 'created', at: '2026-01-01T00:00:00Z', actor: 'Nina', detail: 'x' }],
    };
    const out = migrateEnvelopeV1(v1, { offer_letter: { name: 'Offer Letter' } }, { name: 'Nina', email: 'n@x.com' });
    expect(out.version).toBe(2);
    expect(out.documents[0]).toMatchObject({ source: 'images', name: 'Lease' });
    expect(out.documents[0].legacyImages).toHaveLength(2);
    expect(out.fields[0]).toMatchObject({ page: 1, y: 20, docId: 'upload_a' });
    expect(out.fields[1]).toMatchObject({ type: 'text', mergeKey: 'driver.cdlNumber', readOnly: true });
    expect(out.recipients[0]).toMatchObject({ action: 'sign', status: 'delivered' });
    expect(out.status).toBe('viewed');
  });
  it('turns packages into multi-document templates', () => {
    const t = migrateTemplateV1({ name: 'Pkg', documentKeys: ['a', 'b'] }, { a: { name: 'A' }, b: { name: 'B' } }, true);
    expect(t.documents.map((d) => d.name)).toEqual(['A', 'B']);
    expect(t.roles[0].roleName).toBe('Driver');
  });
});
