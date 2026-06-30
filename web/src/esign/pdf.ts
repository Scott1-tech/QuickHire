/* PDF upload + rasterization for the e-sign editor.
   Renders each page of an uploaded PDF to a PNG data URL at a fixed display
   width so fields can be placed over real document pages. Uses pdfjs-dist
   (already a dependency); the worker is emitted by Vite via the ?url import. */
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore — Vite resolves ?url to the emitted worker asset URL.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export const PDF_DISPLAY_W = 680; // matches the editor page width

export type RenderedPdf = { name: string; pages: { dataUrl: string; w: number; h: number }[]; width: number; totalHeight: number };

function readArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}

/** Render every page of a PDF File into data-URL images at PDF_DISPLAY_W wide. */
export async function renderPdf(file: File): Promise<RenderedPdf> {
  const data = await readArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: RenderedPdf['pages'] = [];
  let totalHeight = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = PDF_DISPLAY_W / base.width;
    const viewport = page.getViewport({ scale: scale * 1.5 }); // 1.5x for crisp raster, modest size
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; // JPEG has no alpha — paint a white page first
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    const dispH = Math.round(PDF_DISPLAY_W * (base.height / base.width));
    pages.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.82), w: PDF_DISPLAY_W, h: dispH });
    totalHeight += dispH;
  }
  try { await pdf.destroy(); } catch { /* noop */ }
  return { name: file.name.replace(/\.pdf$/i, ''), pages, width: PDF_DISPLAY_W, totalHeight };
}
