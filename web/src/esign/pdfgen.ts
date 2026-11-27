/* PDF generation with pdf-lib (lazy-loaded so it never weighs on first paint):
   - built-in catalog documents rendered as real Letter-size PDFs
   - legacy rasterized uploads rebuilt as PDFs
   - flattening: field values, signatures and attachments burned onto the
     original pages (handles CropBox offsets and 90/180/270 page rotation)
   - Certificate of Completion with recipient evidence and the audit trail. */
import type { PDFDocument as PDFDocT, PDFFont, PDFPage, RGB } from 'pdf-lib';
import { Envelope, EDoc, Field, FIELD_DEFS, PAGE_W, LETTER, isVisible, isChecked, evalFormula, numericByLabel, fmtDateTime, actionLabel, Values, Recipient, STATUS_META, splitName } from './model';
import { CATALOG, L, rowPos, sigYs, bodyTop, checksTop } from './catalog';
import { getBlob, dataUrlToBytes, sha256Hex } from './blobs';
import { getFile } from '../shell/files';

type PL = typeof import('pdf-lib');
let plp: Promise<PL> | null = null;
export const pdfLib = () => (plp ||= import('pdf-lib'));

/* ── text helpers ── */
const charsets = new WeakMap<PDFFont, Set<number>>();
/** pdf-lib standard fonts are WinAnsi — replace anything they cannot encode. */
export function safeText(font: PDFFont, s: string) {
  let cs = charsets.get(font);
  if (!cs) { cs = new Set(font.getCharacterSet()); charsets.set(font, cs); }
  let out = '';
  for (const ch of String(s ?? '').replace(/[\r\n\t]+/g, ' ')) {
    const cp = ch.codePointAt(0)!;
    if (cs.has(cp)) out += ch;
    else if (ch === '✓' || ch === '✔') out += 'X';
    else out += (ch.normalize('NFD').replace(/[̀-ͯ]/g, '').split('').every((c) => cs!.has(c.codePointAt(0)!)) ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : '?');
  }
  return out;
}
function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const words = safeText(font, text).split(/\s+/).filter(Boolean);
  const lines: string[] = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (font.widthOfTextAtSize(t, size) <= width || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/* ── catalog documents ── */
const catalogCache = new Map<string, Promise<Uint8Array>>();
export function buildCatalogPdf(key: string, carrier = 'GRAND ONE LLC'): Promise<Uint8Array> {
  const ck = key + '|' + carrier;
  if (!catalogCache.has(ck)) catalogCache.set(ck, buildCatalogPdfUncached(key, carrier));
  return catalogCache.get(ck)!;
}
async function buildCatalogPdfUncached(key: string, carrier: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await pdfLib();
  const def = CATALOG[key];
  const pdf = await PDFDocument.create();
  pdf.setTitle(def?.name || key); pdf.setProducer('QuickHire e-Sign'); pdf.setCreator('QuickHire');
  const page = pdf.addPage([LETTER.w, LETTER.h]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const H = LETTER.h;
  const ink = rgb(0.11, 0.11, 0.12), muted = rgb(0.42, 0.42, 0.45), line = rgb(0.55, 0.55, 0.6);
  const text = (s: string, x: number, yTop: number, size: number, font = reg, color = ink) => page.drawText(safeText(font, s), { x, y: H - yTop, size, font, color });
  if (!def) { text('Document unavailable', 60, 80, 16, bold); return pdf.save(); }
  const title = def.name.toUpperCase();
  text(title, (LETTER.w - bold.widthOfTextAtSize(title, 15)) / 2, L.titleY, 15, bold);
  const sub = carrier;
  text(sub, (LETTER.w - reg.widthOfTextAtSize(safeText(reg, sub), 9.5)) / 2, L.subY, 9.5, reg, muted);
  page.drawLine({ start: { x: 60, y: H - 104 }, end: { x: LETTER.w - 60, y: H - 104 }, thickness: 0.6, color: rgb(0.85, 0.85, 0.88) });
  def.rows.forEach((row, i) => {
    const p = rowPos(i);
    text(row.label, p.x, p.y, 8.5, bold, muted);
    page.drawLine({ start: { x: p.x + L.labelW, y: H - p.y - 2 }, end: { x: p.x + L.labelW + L.lineW, y: H - p.y - 2 }, thickness: 0.6, color: line });
  });
  // body paragraphs (shrink to fit the fixed region)
  const limit = (def.checks?.length ? checksTop(def) - 24 : sigYs(def.signers.length)[0] - 52);
  let size = 10.5;
  const paras = def.body(carrier);
  const measure = (sz: number) => paras.reduce((h, p) => h + wrap(reg, p, sz, LETTER.w - 120).length * sz * 1.45 + 8, 0);
  while (size > 7.5 && bodyTop(def) + 14 + measure(size) > limit) size -= 0.25;
  let y = bodyTop(def) + 14;
  for (const p of paras) { for (const ln of wrap(reg, p, size, LETTER.w - 120)) { text(ln, 60, y, size); y += size * 1.45; } y += 8; }
  (def.checks || []).forEach((c, i) => {
    const cy = checksTop(def) + i * 20;
    page.drawRectangle({ x: 60, y: H - cy - 1, width: 9.9, height: 9.9, borderColor: line, borderWidth: 0.8 });
    text(c, 78, cy + 7, 9.5);
  });
  const ys = sigYs(def.signers.length);
  def.signers.forEach((label, i) => {
    const sy = ys[i];
    page.drawLine({ start: { x: 60, y: H - sy }, end: { x: 60 + L.sigLineW, y: H - sy }, thickness: 0.8, color: ink });
    page.drawLine({ start: { x: L.dateX, y: H - sy }, end: { x: L.dateX + L.dateW, y: H - sy }, thickness: 0.8, color: ink });
    text(`${label} signature`, 60, sy + 12, 8, reg, muted);
    text('Date', L.dateX, sy + 12, 8, reg, muted);
  });
  if (def.initials) { text('Initials', L.initials.x, L.initials.y, 8, reg, muted); page.drawLine({ start: { x: L.initials.x + 44, y: H - L.initials.y - 2 }, end: { x: L.initials.x + 100, y: H - L.initials.y - 2 }, thickness: 0.6, color: line }); }
  text(`${def.name} · ${carrier}`, 60, 770, 7, reg, muted);
  return pdf.save();
}

/* ── legacy rasterized uploads → PDF ── */
async function buildImagesPdf(doc: EDoc): Promise<Uint8Array> {
  const { PDFDocument } = await pdfLib();
  const pdf = await PDFDocument.create();
  const n = Math.max(doc.legacyImages?.length || 0, doc.imageBlobIds?.length || 0);
  for (let i = 0; i < n; i++) {
    let img: { bytes: Uint8Array; type: string } | null = null;
    if (doc.imageBlobIds?.[i]) img = await getBlob(doc.imageBlobIds[i]);
    if (!img && doc.legacyImages?.[i]) img = dataUrlToBytes(doc.legacyImages[i]);
    if (!img) continue;
    const emb = img.type.includes('png') ? await pdf.embedPng(img.bytes) : await pdf.embedJpg(img.bytes);
    const ph = LETTER.w * ((doc.pages[i]?.h || 880) / PAGE_W);
    const page = pdf.addPage([LETTER.w, ph]);
    page.drawImage(emb, { x: 0, y: 0, width: LETTER.w, height: ph });
  }
  if (!n) pdf.addPage([LETTER.w, LETTER.h]);
  return pdf.save();
}

/** Bytes of a document's original PDF, whatever its source. */
export async function getDocBytes(doc: EDoc): Promise<Uint8Array> {
  if (doc.source === 'pdf') { const b = await getBlob(doc.blobId); if (!b) throw new Error('Document file is missing on this device'); return b.bytes; }
  if (doc.source === 'catalog') return buildCatalogPdf(doc.catalogKey || '', doc.carrier || 'GRAND ONE LLC');
  return buildImagesPdf(doc);
}

/* ── coordinate mapping (display px → PDF user space) ── */
type PageGeo = { x0: number; y0: number; W: number; H: number; rot: number; s: number };
function geo(page: PDFPage): PageGeo {
  const box = (page as any).getCropBox ? page.getCropBox() : { x: 0, y: 0, ...page.getSize() };
  const rot = (((page.getRotation().angle || 0) % 360) + 360) % 360;
  const dispW = rot === 90 || rot === 270 ? box.height : box.width;
  return { x0: box.x, y0: box.y, W: box.width, H: box.height, rot, s: dispW / PAGE_W };
}
function toPdf(g: PageGeo, xd: number, yd: number) {
  const x = xd * g.s, y = yd * g.s; // display points
  switch (g.rot) {
    case 90: return { x: g.x0 + y, y: g.y0 + x };
    case 180: return { x: g.x0 + g.W - x, y: g.y0 + y };
    case 270: return { x: g.x0 + g.W - y, y: g.y0 + g.H - x };
    default: return { x: g.x0 + x, y: g.y0 + g.H - y };
  }
}

/* ── flattening ── */
export interface FlattenOpts { includeCertificate?: boolean; values?: Values; draft?: boolean }

function fieldText(f: Field, values: Values, env: Envelope): string {
  const v = values[f.id] ?? f.value ?? '';
  if (f.type === 'formula') { const n = evalFormula(f.formula || '', numericByLabel(env.fields, values)); return n == null ? '' : String(n); }
  if (f.type === 'approve') return v ? 'Approved' : '';
  if (f.type === 'attachment') { if (!v) return ''; try { return 'Attachment: ' + (JSON.parse(v).name || 'file'); } catch { return 'Attachment'; } }
  return String(v);
}

export async function flattenEnvelope(env: Envelope, opts: FlattenOpts = {}): Promise<Uint8Array> {
  const PLm = await pdfLib();
  const { PDFDocument, StandardFonts, rgb, degrees } = PLm;
  const values: Values = { ...Object.fromEntries(env.fields.map((f) => [f.id, f.value])), ...(opts.values || {}) };
  const out = await PDFDocument.create();
  out.setTitle(env.title); out.setSubject(env.subject || env.title); out.setProducer('QuickHire e-Sign'); out.setCreator('QuickHire'); out.setKeywords([`envelope:${env.id}`]);
  const font = await out.embedFont(StandardFonts.Helvetica);
  let italFont: PDFFont | null = null;
  const imgCache = new Map<string, any>();
  const embedImg = async (dataUrl: string) => {
    if (imgCache.has(dataUrl)) return imgCache.get(dataUrl);
    const { bytes, type } = dataUrlToBytes(dataUrl);
    const img = type.includes('png') ? await out.embedPng(bytes) : await out.embedJpg(bytes);
    imgCache.set(dataUrl, img); return img;
  };
  const byId = (id: string) => env.recipients.find((r) => r.id === id);
  const attachments: { name: string; type: string; dataUrl: string }[] = [];

  for (const doc of env.documents) {
    const src = await PDFDocument.load(await getDocBytes(doc), { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    for (let pi = 0; pi < pages.length; pi++) {
      const page = pages[pi]; const g = geo(page);
      const rotate = degrees(g.rot);
      // envelope id stamp (top-left of the displayed page)
      const stamp = toPdf(g, 8, 10);
      page.drawText(`QuickHire e-Sign Envelope ID: ${env.id.replace(/^env_/, '').toUpperCase()}`, { x: stamp.x, y: stamp.y, size: 5.5 * g.s, font, color: rgb(0.45, 0.45, 0.5), rotate });
      for (const f of env.fields.filter((x) => x.docId === doc.id && x.page === pi)) {
        if (!isVisible(f, env.fields, values)) continue;
        const r = byId(f.recipientId);
        const kind = FIELD_DEFS[f.type]?.kind;
        const anchor = (dx: number, dy: number) => toPdf(g, f.x + dx, f.y + dy);
        const S = g.s;
        if (f.type === 'signature' || f.type === 'initial' || f.type === 'stamp') {
          const v = values[f.id]; if (!v) continue;
          const sig = r?.signature;
          const url = f.type === 'initial' ? sig?.iniUrl : f.type === 'stamp' ? (sig?.stampUrl || sig?.sigUrl) : sig?.sigUrl;
          const dataUrl = String(v).startsWith('data:') ? String(v) : url;
          if (!dataUrl) {
            const name = f.type === 'initial' ? (sig?.initials || initialsOf(r?.name || '')) : (sig?.name || r?.name || '');
            if (!name) continue;
            const ital = italFont || (italFont = await out.embedFont(StandardFonts.HelveticaOblique));
            let sz = f.h * 0.55 * S; const t = safeText(ital, name);
            while (sz > 5 && ital.widthOfTextAtSize(t, sz) > f.w * S * 0.95) sz -= 0.5;
            const a = anchor(2, f.h * 0.68);
            page.drawText(t, { x: a.x, y: a.y, size: sz, font: ital, color: rgb(0.08, 0.13, 0.24), rotate });
            const cap0 = anchor(0, -1.5);
            page.drawText(`e-Signed · ${env.id.replace(/^env_/, '').slice(0, 8).toUpperCase()}`, { x: cap0.x, y: cap0.y, size: 4.6 * S, font, color: rgb(0.12, 0.37, 0.84), rotate });
            continue;
          }
          const img = await embedImg(dataUrl);
          const boxW = f.w, boxH = f.h * 0.86;
          const ratio = Math.min(boxW / img.width, boxH / img.height);
          const iw = img.width * ratio, ih = img.height * ratio;
          const a = anchor(0, f.h * 0.04 + (boxH + ih) / 2);
          page.drawImage(img, { x: a.x, y: a.y, width: iw * S, height: ih * S, rotate });
          const cap = anchor(0, -1.5);
          page.drawText(`e-Signed ${f.filledAt ? new Date(f.filledAt).toISOString().slice(0, 10) : ''} · ${env.id.replace(/^env_/, '').slice(0, 8).toUpperCase()}`, { x: cap.x, y: cap.y, size: 4.6 * S, font, color: rgb(0.12, 0.37, 0.84), rotate });
          continue;
        }
        if (f.type === 'drawing') { const v = values[f.id]; if (!v || !String(v).startsWith('data:')) continue; const img = await embedImg(String(v)); const a = anchor(0, f.h); page.drawImage(img, { x: a.x, y: a.y, width: f.w * S, height: f.h * S, rotate }); continue; }
        if (f.type === 'checkbox') {
          const a = anchor(0, f.h); const dark = rgb(0.1, 0.1, 0.12);
          page.drawRectangle({ x: a.x, y: a.y, width: f.w * S, height: f.h * S, borderColor: rgb(0.35, 0.35, 0.4), borderWidth: 0.7, rotate });
          if (isChecked(values[f.id])) {
            const p1 = anchor(f.w * 0.2, f.h * 0.52), p2 = anchor(f.w * 0.42, f.h * 0.76), p3 = anchor(f.w * 0.82, f.h * 0.24);
            page.drawLine({ start: p1, end: p2, thickness: Math.max(0.9, f.w * S * 0.13), color: dark });
            page.drawLine({ start: p2, end: p3, thickness: Math.max(0.9, f.w * S * 0.13), color: dark });
          }
          continue;
        }
        if (f.type === 'radio') {
          const c = anchor(f.w / 2, f.h / 2); const rad = (Math.min(f.w, f.h) / 2) * S;
          page.drawCircle({ x: c.x, y: c.y, size: rad, borderColor: rgb(0.35, 0.35, 0.4), borderWidth: 0.7 });
          if (isChecked(values[f.id])) page.drawCircle({ x: c.x, y: c.y, size: rad * 0.5, color: rgb(0.1, 0.1, 0.12) });
          continue;
        }
        if (f.type === 'attachment') { const v = values[f.id]; if (v) { try { const a = JSON.parse(String(v)); const rec = a?.fileId ? getFile(a.fileId) : null; const dataUrl = a?.dataUrl || rec?.dataUrl; if (dataUrl) attachments.push({ name: a.name || rec?.name || 'attachment', type: a.type || rec?.type || '', dataUrl }); } catch { /* ignore */ } } }
        if (kind === 'display' || f.type === 'decline') continue;
        let txt = fieldText(f, values, env);
        if (!txt && f.type === 'fullName' && r) txt = r.name;
        if (!txt) continue;
        txt = safeText(font, txt);
        let size = (f.fontSize || 11) * 0.9 * S;
        const maxW = (f.w - 4) * S;
        while (size > 5 && font.widthOfTextAtSize(txt, size) > maxW) size -= 0.25;
        while (txt.length > 1 && font.widthOfTextAtSize(txt, size) > maxW) txt = txt.slice(0, -1);
        const base = anchor(2, f.h / 2 + (size / S) * 0.36);
        page.drawText(txt, { x: base.x, y: base.y, size, font, color: rgb(0.08, 0.08, 0.1), rotate });
      }
    }
  }
  // attachments appended after the documents
  for (const a of attachments) {
    try {
      const { bytes, type } = dataUrlToBytes(a.dataUrl);
      if (type === 'application/pdf') { const src = await PDFDocument.load(bytes, { ignoreEncryption: true }); (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p)); }
      else if (/png|jpe?g/.test(type)) {
        const img = type.includes('png') ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        const page = out.addPage([LETTER.w, LETTER.h]);
        const ratio = Math.min((LETTER.w - 80) / img.width, (LETTER.h - 120) / img.height, 1);
        page.drawText(safeText(font, `Attachment: ${a.name}`), { x: 40, y: LETTER.h - 50, size: 10, font });
        page.drawImage(img, { x: 40, y: LETTER.h - 70 - img.height * ratio, width: img.width * ratio, height: img.height * ratio });
      }
    } catch { /* skip unreadable attachment */ }
  }
  if (opts.draft) {
    for (const p of out.getPages()) { const { width, height } = p.getSize(); p.drawText('PREVIEW — NOT COMPLETED', { x: width / 2 - 150, y: height / 2, size: 26, font, color: rgb(0.85, 0.2, 0.2), opacity: 0.18, rotate: degrees(30) }); }
  }
  if (opts.includeCertificate) {
    const cert = await PDFDocument.load(await buildCertificate(env));
    (await out.copyPages(cert, cert.getPageIndices())).forEach((p) => out.addPage(p));
  }
  return out.save();
}

/* ── Certificate of Completion ── */
const SIG_KIND: Record<string, string> = { typed: 'Pre-selected style', drawn: 'Drawn on device', uploaded: 'Uploaded image' };
export async function documentHashes(env: Envelope): Promise<{ name: string; pages: number; sha256: string }[]> {
  const out = [];
  for (const d of env.documents) { let h = d.sha256 || ''; if (!h) { try { h = await sha256Hex(await getDocBytes(d)); } catch { h = ''; } } out.push({ name: d.name, pages: d.pages.length, sha256: h }); }
  return out;
}

export async function buildCertificate(env: Envelope): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await pdfLib();
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificate of Completion — ${env.title}`); pdf.setProducer('QuickHire e-Sign');
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const W = LETTER.w, H = LETTER.h, M = 48;
  let page = pdf.addPage([W, H]); let y = 0;
  const ink = rgb(0.11, 0.11, 0.12), muted = rgb(0.43, 0.43, 0.46), blue = rgb(0, 0.42, 0.85), hair: RGB = rgb(0.88, 0.88, 0.9);
  const header = () => {
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: blue });
    page.drawText('QuickHire e-Sign', { x: M, y: H - 34, size: 9, font: bold, color: blue });
    page.drawText(safeText(reg, `Envelope ID: ${env.id.replace(/^env_/, '').toUpperCase()}`), { x: W - M - reg.widthOfTextAtSize(`Envelope ID: ${env.id.replace(/^env_/, '').toUpperCase()}`, 8), y: H - 34, size: 8, font: reg, color: muted });
    y = 58;
  };
  const ensure = (need: number) => { if (y + need > H - 54) { page = pdf.addPage([W, H]); header(); } };
  const txt = (s: string, x: number, size = 9, font = reg, color = ink) => page.drawText(safeText(font, s), { x, y: H - y, size, font, color });
  const kv = (k: string, v: string, x = M, kw = 120) => { txt(k, x, 8.5, reg, muted); const lines = wrap(reg, v || '—', 8.5, W / 2 - kw - 20 + (x === M ? 0 : 0)); lines.forEach((ln, i) => page.drawText(ln, { x: x + kw, y: H - y - i * 11, size: 8.5, font: reg, color: ink })); return lines.length; };
  const section = (t: string) => { ensure(40); y += 14; txt(t.toUpperCase(), M, 8, bold, muted); y += 6; page.drawLine({ start: { x: M, y: H - y }, end: { x: W - M, y: H - y }, thickness: 0.6, color: hair }); y += 14; };
  header();
  txt('Certificate of Completion', M, 18, bold); y += 26;
  const hashes = await documentHashes(env);
  const signers = env.recipients.filter((r) => r.action !== 'cc');
  const rows: [string, string][] = [
    ['Subject', env.subject || env.title], ['Status', STATUS_META[env.status]?.label || env.status], ['Envelope originator', env.sender.name], ['Originator email', env.sender.email],
    ['Documents', `${env.documents.length} (${env.documents.reduce((n, d) => n + d.pages.length, 0)} pages)`], ['Signatures', String(env.fields.filter((f) => f.type === 'signature' && f.value).length)],
    ['Initials', String(env.fields.filter((f) => f.type === 'initial' && f.value).length)], ['Recipients', String(env.recipients.length)],
    ['Created', fmtDateTime(env.createdAt)], ['Sent', fmtDateTime(env.sentAt)], ['Completed', fmtDateTime(env.completedAt)],
    ['Time zone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local'], ['Driver / carrier', [env.driverName, env.carrier].filter(Boolean).join(' · ') || '—'],
  ];
  for (let i = 0; i < rows.length; i += 2) { ensure(16); const a = kv(rows[i][0], rows[i][1]); const b = rows[i + 1] ? kv(rows[i + 1][0], rows[i + 1][1], W / 2 + 6, 100) : 1; y += Math.max(a, b) * 11 + 4; }

  section('Document integrity');
  for (const h of hashes) { ensure(30); txt(`${h.name} — ${h.pages} page${h.pages === 1 ? '' : 's'}`, M, 9, bold); y += 12; page.drawText(`SHA-256 ${h.sha256 || 'unavailable'}`, { x: M, y: H - y, size: 7.2, font: mono, color: muted }); y += 14; }
  if (env.certificate?.docHash) { ensure(24); txt('Signed PDF (flattened, before this certificate)', M, 9, bold); y += 12; page.drawText(`SHA-256 ${env.certificate.docHash}`, { x: M, y: H - y, size: 7.2, font: mono, color: muted }); y += 14; }

  section('Recipient events');
  for (const r of env.recipients) {
    ensure(110);
    const top = y;
    txt(r.name || r.roleName || 'Recipient', M, 10, bold); y += 12;
    txt(r.email, M, 8.5, reg, muted); y += 11;
    txt(`${actionLabel(r.action)}${env.signingOrder ? ` · Routing order ${r.order}` : ''}`, M, 8.5, reg, muted); y += 11;
    const sec = ['Email notification', r.accessCode ? 'Access code' : '', r.smsAuth ? 'SMS code (flagged)' : '', r.action === 'in_person' ? `In person, hosted by ${r.hostName || 'sender'}` : ''].filter(Boolean).join(' + ');
    txt(`Authentication: ${sec}`, M, 8, reg, muted); y += 11;
    if (r.signature) {
      txt(`Signature adoption: ${SIG_KIND[r.signature.kind] || r.signature.kind}`, M, 8, reg, muted); y += 11;
      try { const { bytes } = dataUrlToBytes(r.signature.sigUrl); const img = await pdf.embedPng(bytes); const ratio = Math.min(150 / img.width, 34 / img.height); page.drawImage(img, { x: M, y: H - y - img.height * ratio, width: img.width * ratio, height: img.height * ratio }); y += img.height * ratio + 4; } catch { /* no image */ }
    }
    if (r.userAgent) { const lines = wrap(reg, `Device: ${r.userAgent}`, 7, W / 2 - M - 10); lines.slice(0, 3).forEach((ln) => { txt(ln, M, 7, reg, muted); y += 9; }); }
    if (r.delegatedFrom) { txt(`Assigned by ${r.delegatedFrom.name} (${r.delegatedFrom.email})`, M, 8, reg, muted); y += 11; }
    // right column: timestamps
    let ry = top;
    const ts: [string, string | undefined][] = [['Sent', r.sentAt], ['Viewed', r.deliveredAt], ['Consent to e-records', r.consentAt], ['Access verified', r.authAt], [r.status === 'declined' ? 'Declined' : r.action === 'view' || r.action === 'cc' ? 'Completed' : 'Signed', r.status === 'declined' ? r.declinedAt : r.signedAt || r.completedAt]];
    for (const [k, v] of ts) { if (!v && k === 'Access verified') continue; page.drawText(k, { x: W / 2 + 6, y: H - ry, size: 8, font: reg, color: muted }); page.drawText(safeText(reg, v ? fmtDateTime(v) : '—'), { x: W / 2 + 116, y: H - ry, size: 8, font: reg, color: ink }); ry += 12; }
    if (r.declineReason) { page.drawText(safeText(reg, `Reason: ${r.declineReason}`.slice(0, 80)), { x: W / 2 + 6, y: H - ry, size: 8, font: reg, color: rgb(0.78, 0.16, 0.13) }); ry += 12; }
    y = Math.max(y, ry) + 10;
    page.drawLine({ start: { x: M, y: H - y + 4 }, end: { x: W - M, y: H - y + 4 }, thickness: 0.4, color: hair });
    y += 8;
  }

  section('Envelope history');
  for (const a of [...env.audit].sort((p, q) => +new Date(p.at) - +new Date(q.at))) {
    const lines = wrap(reg, a.detail || a.event, 8, W - M - 280);
    ensure(12 * lines.length + 4);
    page.drawText(safeText(reg, fmtDateTime(a.at)), { x: M, y: H - y, size: 7.8, font: reg, color: muted });
    page.drawText(safeText(bold, a.event.replace(/_/g, ' ')), { x: M + 118, y: H - y, size: 7.8, font: bold, color: ink });
    page.drawText(safeText(reg, a.actor || ''), { x: M + 196, y: H - y, size: 7.8, font: reg, color: muted });
    lines.forEach((ln, i) => page.drawText(ln, { x: M + 290 - 10, y: H - y - i * 10, size: 7.8, font: reg, color: ink }));
    y += 10 * lines.length + 4;
  }

  section('Electronic record and signature disclosure');
  const consented = signers.filter((r) => r.consentAt).map((r) => `${r.name} (${fmtDateTime(r.consentAt)})`).join('; ') || '—';
  for (const ln of wrap(reg, `Accepted by: ${consented}. Each signer agreed to conduct this transaction electronically under the U.S. ESIGN Act and UETA before viewing the documents.`, 8.5, W - 2 * M)) { ensure(12); txt(ln, M, 8.5); y += 11; }
  y += 6;
  for (const ln of wrap(reg, 'Integrity note: hashes and timestamps on this certificate were produced by the QuickHire web client. Server-side sealing (trusted timestamp + tamper-evident digital signature) is applied when the envelope is processed by the QuickHire backend.', 7.5, W - 2 * M)) { ensure(10); txt(ln, M, 7.5, reg, muted); y += 10; }
  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - M - 50, y: 30, size: 7.5, font: reg, color: muted }));
  return pdf.save();
}

/** Build the PNG for a typed signature or initials in the chosen web font. */
export async function renderTypedSignature(text: string, font: string, opts: { height?: number; color?: string } = {}): Promise<string> {
  const h = opts.height || 120;
  const fam = `"${font}", cursive`;
  try { await (document as any).fonts?.load?.(`${Math.round(h * 0.62)}px ${fam}`); } catch { /* font may be offline */ }
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = `${Math.round(h * 0.62)}px ${fam}`;
  const w = Math.max(h, Math.ceil(ctx.measureText(text || ' ').width + h * 0.5));
  c.width = w; c.height = h;
  ctx.font = `${Math.round(h * 0.62)}px ${fam}`;
  ctx.fillStyle = opts.color || '#14213D';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, h * 0.25, h * 0.55);
  return c.toDataURL('image/png');
}

/** Trim transparent/white margins from a canvas-drawn or uploaded image and cap its size. */
export async function normalizeSignatureImage(src: string, maxW = 600, maxH = 200, whiteToAlpha = false): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
  const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4; const a = data.data[i + 3];
    const white = data.data[i] > 235 && data.data[i + 1] > 235 && data.data[i + 2] > 235;
    if (whiteToAlpha && white) { data.data[i + 3] = 0; continue; }
    if (a > 16 && !(whiteToAlpha && white)) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  }
  if (whiteToAlpha) ctx.putImageData(data, 0, 0);
  if (x1 < 0) return src;
  const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(c.width - 1, x1 + pad); y1 = Math.min(c.height - 1, y1 + pad);
  const tw = x1 - x0 + 1, th = y1 - y0 + 1; const r = Math.min(1, maxW / tw, maxH / th);
  const o = document.createElement('canvas'); o.width = Math.max(1, Math.round(tw * r)); o.height = Math.max(1, Math.round(th * r));
  o.getContext('2d')!.drawImage(c, x0, y0, tw, th, 0, 0, o.width, o.height);
  return o.toDataURL('image/png');
}

/** A simple generated stamp (company seal) when the signer has no stamp image. */
export function renderStamp(company: string, name: string): string {
  const c = document.createElement('canvas'); c.width = 360; c.height = 190;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#B3261E'; ctx.fillStyle = '#B3261E'; ctx.lineWidth = 6;
  ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(8, 8, 344, 174, 18) : ctx.rect(8, 8, 344, 174); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeRect(20, 20, 320, 150);
  ctx.textAlign = 'center'; ctx.font = 'bold 30px Helvetica, Arial, sans-serif';
  ctx.fillText((company || 'APPROVED').toUpperCase().slice(0, 22), 180, 78);
  ctx.font = '20px Helvetica, Arial, sans-serif'; ctx.fillText(name.slice(0, 30), 180, 116);
  ctx.font = '16px Helvetica, Arial, sans-serif'; ctx.fillText(new Date().toLocaleDateString(), 180, 146);
  return c.toDataURL('image/png');
}

export function initialsOf(name: string) { const { first, last } = splitName(name); return ((first[0] || '') + (last[0] || '')).toUpperCase() || (name[0] || '').toUpperCase(); }
export type { Recipient };
