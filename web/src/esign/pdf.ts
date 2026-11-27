/* PDF reading + page rendering (pdfjs-dist). Documents are rendered lazily,
   page by page, into cached object URLs; a small queue keeps big packets from
   freezing the UI. The original PDF bytes stay the source of truth. */
import React from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore — Vite resolves ?url to the emitted worker asset URL.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { EDoc, PAGE_W } from './model';
import { getDocBytes } from './pdfgen';
import { getBlob, dataUrlToBytes } from './blobs';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export const PDF_DISPLAY_W = PAGE_W;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function readArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result as ArrayBuffer); r.onerror = () => reject(r.error); r.readAsArrayBuffer(file); });
}

export class PdfError extends Error { code: string; constructor(code: string, msg: string) { super(msg); this.code = code; } }

/** Read an uploaded PDF: bytes + page geometry (display units). Throws PdfError with a friendly message. */
export async function readPdfFile(file: File): Promise<{ name: string; bytes: Uint8Array; pages: { w: number; h: number }[]; size: number }> {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new PdfError('type', `${file.name} is not a PDF.`);
  if (file.size > MAX_UPLOAD_BYTES) throw new PdfError('size', `${file.name} is larger than 25 MB.`);
  const bytes = new Uint8Array(await readArrayBuffer(file));
  let pdf: any;
  try { pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise; }
  catch (e: any) { throw new PdfError(e?.name === 'PasswordException' ? 'password' : 'read', e?.name === 'PasswordException' ? `${file.name} is password-protected.` : `${file.name} could not be read.`); }
  const pages: { w: number; h: number }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) { const vp = (await pdf.getPage(i)).getViewport({ scale: 1 }); pages.push({ w: PAGE_W, h: Math.round(PAGE_W * (vp.height / vp.width)) }); }
  try { await pdf.destroy(); } catch { /* noop */ }
  return { name: file.name.replace(/\.pdf$/i, ''), bytes, pages, size: file.size };
}

/* ── render cache ── */
const docCache = new Map<string, Promise<any>>();
const urlCache = new Map<string, Promise<string>>();
const docKey = (d: EDoc) => `${d.id}|${d.blobId || ''}|${d.catalogKey || ''}|${d.carrier || ''}`;

function loadPdfjs(doc: EDoc) {
  const k = docKey(doc);
  if (!docCache.has(k)) docCache.set(k, getDocBytes(doc).then((b) => pdfjsLib.getDocument({ data: b.slice() }).promise));
  return docCache.get(k)!;
}

let active = 0; const waiters: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((r) => waiters.push(r));
  active++;
  try { return await fn(); } finally { active--; waiters.shift()?.(); }
}

/** Object URL for one rendered page (cached). */
export function pageUrl(doc: EDoc, pageIndex: number): Promise<string> {
  const k = `${docKey(doc)}#${pageIndex}`;
  if (urlCache.has(k)) return urlCache.get(k)!;
  const p = slot(async () => {
    if (doc.source === 'images') {
      const id = doc.imageBlobIds?.[pageIndex];
      if (id) { const b = await getBlob(id); if (b) return URL.createObjectURL(new Blob([b.bytes as BlobPart], { type: b.type })); }
      const legacy = doc.legacyImages?.[pageIndex];
      if (legacy) { const { bytes, type } = dataUrlToBytes(legacy); return URL.createObjectURL(new Blob([bytes as BlobPart], { type })); }
      throw new Error('Page image missing');
    }
    const pdf = await loadPdfjs(doc);
    const page = await pdf.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const scale = (PAGE_W * Math.min(2, Math.max(1.5, window.devicePixelRatio || 1))) / base.width;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b || new Blob()), 'image/jpeg', 0.88));
    canvas.width = canvas.height = 0;
    return URL.createObjectURL(blob);
  });
  urlCache.set(k, p);
  p.catch(() => urlCache.delete(k));
  return p;
}

/** Lazily renders a page when it scrolls near the viewport. */
export function usePageUrl(doc: EDoc | undefined, pageIndex: number, ref: React.RefObject<HTMLElement>, eager = false) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [err, setErr] = React.useState(false);
  const [near, setNear] = React.useState(eager);
  React.useEffect(() => {
    if (near || !ref.current || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: '800px 0px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ref, near]);
  React.useEffect(() => {
    if (!doc || !near) return;
    let live = true;
    setErr(false);
    pageUrl(doc, pageIndex).then((u) => { if (live) setUrl(u); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [doc && docKey(doc), pageIndex, near]);
  return { url, err };
}

/** Render a full PDF into data URLs (legacy helper kept for callers of the v1 API). */
export async function renderPdf(file: File) {
  const info = await readPdfFile(file);
  return { name: info.name, pages: info.pages.map((p) => ({ dataUrl: '', w: p.w, h: p.h })), width: PAGE_W, totalHeight: info.pages.reduce((n, p) => n + p.h, 0), bytes: info.bytes };
}

export function downloadBytes(bytes: Uint8Array | string, filename: string, type = 'application/pdf') {
  const blob = new Blob([typeof bytes === 'string' ? bytes : (bytes as BlobPart)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export const safeFilename = (s: string) => String(s || 'document').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 90) || 'document';
