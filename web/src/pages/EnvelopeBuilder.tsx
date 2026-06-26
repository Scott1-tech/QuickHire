import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { previewDoc, sendDoc, type DocType, type CandidateLite, type PreviewResult, type PlacedField } from '@/lib/docusignApi';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ArrayBuffer → base64 (for sending an uploaded PDF to the backend).
function abToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf); let binary = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

// Full-screen DocuSign-style envelope builder: Set Up Envelope → Add Fields → Send.

const RECIPIENT_COLORS = [
  { bg: '#D1FAE5', border: '#10B981', solid: '#10B981', pill: '#A7F3D0' }, // green
  { bg: '#CFFAFE', border: '#06B6D4', solid: '#06B6D4', pill: '#A5F3FC' }, // cyan
  { bg: '#EDE9FE', border: '#8B5CF6', solid: '#8B5CF6', pill: '#DDD6FE' }, // purple
  { bg: '#FEF3C7', border: '#F59E0B', solid: '#F59E0B', pill: '#FDE68A' }, // amber
  { bg: '#FCE7F3', border: '#EC4899', solid: '#EC4899', pill: '#FBCFE8' }, // pink
];
const color = (i: number) => RECIPIENT_COLORS[i % RECIPIENT_COLORS.length];

type FType = 'signature' | 'initial' | 'date' | 'name' | 'email' | 'company' | 'title' | 'text' | 'number' | 'checkbox' | 'formula' | 'attachment';
const PALETTE: { section: string; items: { type: FType; label: string; icon: string }[] }[] = [
  { section: 'Signature', items: [{ type: 'signature', label: 'Signature', icon: '✒' }, { type: 'initial', label: 'Initial', icon: 'AZ' }, { type: 'date', label: 'Date Signed', icon: '📅' }] },
  { section: 'Contact Information', items: [{ type: 'name', label: 'Name', icon: '👤' }, { type: 'email', label: 'Email', icon: '✉' }, { type: 'company', label: 'Company', icon: '🏢' }, { type: 'title', label: 'Title', icon: '🪪' }] },
  { section: 'Inputs', items: [{ type: 'text', label: 'Text', icon: 'T' }, { type: 'number', label: 'Number', icon: '#' }, { type: 'checkbox', label: 'Checkbox', icon: '☑' }] },
  { section: 'Other', items: [{ type: 'formula', label: 'Formula', icon: 'ƒx' }, { type: 'attachment', label: 'Attachment', icon: '📎' }] },
];
const DEFAULTS: Record<FType, { label: string; w: number }> = {
  signature: { label: 'Sign', w: 150 }, initial: { label: 'Initial', w: 64 }, date: { label: 'Date Signed', w: 96 },
  name: { label: 'Full Name', w: 120 }, email: { label: 'Email', w: 150 }, company: { label: 'Company', w: 120 },
  title: { label: 'Title', w: 100 }, text: { label: 'Text', w: 120 }, number: { label: 'Number', w: 84 },
  checkbox: { label: '', w: 22 }, formula: { label: 'ƒx', w: 84 }, attachment: { label: 'Attach', w: 110 },
};
const uid = () => 'f' + Math.random().toString(36).slice(2, 9);
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const initials = (n?: string) => (n || '?').split(' ').map((x) => x[0]).slice(0, 2).join('');

// Field-property option lists (match DocuSign).
const FONTS = ['Arial', 'Calibri', 'Courier New', 'Lucida Console', 'Tahoma', 'Times New Roman', 'Trebuchet', 'Verdana', 'MS Gothic', 'MS Mincho'];
const FONT_SIZES = ['7', '8', '9', '10', '11', '12', '14', '16', '18', '20', '22', '24', '26', '28', '36', '48', '72'];
const COLORS = ['Black', 'White', 'Red', 'Green', 'Blue', 'Purple'];
const VALIDATIONS = ['None', 'SSN', 'Email', 'Numbers', 'Letters', 'Date', 'ZIP+4', 'ZIP', 'Custom'];
const PDF_W = 612, PDF_H = 792; // DocuSign US-Letter point space (matches backend tab mapping)

interface Recip { id: string; name: string; email: string; colorIdx: number }

export default function EnvelopeBuilder({ preset, candidates, docTypes, mode, onClose, onSent }: {
  preset: { candidateId?: string; docType?: string }; candidates: CandidateLite[]; docTypes: DocType[];
  mode: 'live' | 'simulated'; onClose: () => void; onSent: () => void;
}) {
  const cand = candidates.find((c) => c.id === preset.candidateId) || candidates[0];
  const [docType, setDocType] = useState(preset.docType || docTypes[0]?.type || 'offer_letter');
  const docLabel = docTypes.find((d) => d.type === docType)?.label || 'Document';

  const [step, setStep] = useState<'setup' | 'fields'>('setup');
  const [recipients, setRecipients] = useState<Recip[]>(
    cand ? [{ id: uid(), name: cand.name, email: cand.email, colorIdx: 1 }] : [{ id: uid(), name: '', email: '', colorIdx: 1 }],
  );
  const [subject, setSubject] = useState(`Complete with Docusign: ${docLabel}.pdf`);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('');
  const [reminders, setReminders] = useState('');

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [tool, setTool] = useState<string | null>(null); // FType, or "af:<key>" for an auto-fill field
  const [curRecip, setCurRecip] = useState(recipients[0]?.id || '');
  const [zoom, setZoom] = useState(1);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');

  // Uploaded PDF (rendered with pdf.js for accurate, page-by-page tagging).
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfPages, setPdfPages] = useState<{ w: number; h: number }[]>([]);
  const [uploadName, setUploadName] = useState('');
  const pdfBytes = useRef<Uint8Array | null>(null);
  const uploadB64 = useRef('');

  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  const [docHeight, setDocHeight] = useState(1056);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const fieldsRef = useRef(fields);
  useEffect(() => { fieldsRef.current = fields; }, [fields]);
  const hist = useRef<{ stack: PlacedField[][]; idx: number }>({ stack: [[]], idx: 0 });

  // Auto-fill values keyed by field type, from the driver's record.
  const prefill = useMemo(() => {
    const m: Partial<Record<FType, string>> = { date: new Date().toLocaleDateString() };
    preview?.fields.forEach((f) => {
      if (f.key === 'fullName') { m.name = f.value; }
      if (f.key === 'email') m.email = f.value;
    });
    if (cand) { m.name = m.name || cand.name; m.email = m.email || cand.email; }
    return m;
  }, [preview, cand]);

  useEffect(() => {
    if (!cand || uploadName) return; // an uploaded PDF replaces the generated contract
    previewDoc(cand.id, docType).then(setPreview).catch(() => setPreview(null));
    setSubject(`Complete with Docusign: ${docLabel}.pdf`);
  }, [docType, cand?.id, uploadName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load an uploaded PDF and measure each page (in points).
  async function handleUpload(file: File) {
    if (!file) return;
    if (file.type !== 'application/pdf') { setErr('Please choose a PDF file.'); return; }
    setErr('');
    const buf = await file.arrayBuffer();
    uploadB64.current = abToBase64(buf);
    pdfBytes.current = new Uint8Array(buf);
    setUploadName(file.name);
    setSubject(`Complete with Docusign: ${file.name}`);
    setFields([]); hist.current = { stack: [[]], idx: 0 };
    try {
      const doc = await pdfjsLib.getDocument({ data: pdfBytes.current.slice(0) }).promise;
      const sizes: { w: number; h: number }[] = [];
      for (let i = 1; i <= doc.numPages; i++) { const pg = await doc.getPage(i); const v = pg.getViewport({ scale: 1 }); sizes.push({ w: v.width, h: v.height }); }
      setPdfDoc(doc); setPdfPages(sizes);
    } catch { setErr('Could not read that PDF.'); }
  }
  const clearUpload = () => { setPdfDoc(null); setPdfPages([]); setUploadName(''); uploadB64.current = ''; pdfBytes.current = null; setFields([]); hist.current = { stack: [[]], idx: 0 }; };

  // ── field history (drag commits the latest via fieldsRef, not a stale closure) ──
  const pushHistory = (next: PlacedField[]) => { const h = hist.current; h.stack = h.stack.slice(0, h.idx + 1); h.stack.push(next); h.idx = h.stack.length - 1; };
  const commit = (next: PlacedField[]) => { setFields(next); pushHistory(next); };
  const undo = () => { const h = hist.current; if (h.idx > 0) { h.idx--; setFields(h.stack[h.idx]); } };
  const redo = () => { const h = hist.current; if (h.idx < h.stack.length - 1) { h.idx++; setFields(h.stack[h.idx]); } };

  const recipColor = (id: string) => color(recipients.find((r) => r.id === id)?.colorIdx ?? 0);
  const selected = fields.find((f) => f.id === selId) || null;

  const addField = (type: FType, page: number, xPct: number, yPct: number) => {
    const f: PlacedField = {
      id: uid(), type, xPct: clamp(xPct), yPct: clamp(yPct), page, recipientId: curRecip,
      label: DEFAULTS[type].label, required: type !== 'checkbox', value: prefill[type] || '',
    };
    commit([...fieldsRef.current, f]); setSelId(f.id); setTool(null);
  };
  const updateField = (id: string, patch: Partial<PlacedField>) => commit(fieldsRef.current.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const removeField = (id: string) => { commit(fieldsRef.current.filter((f) => f.id !== id)); if (selId === id) setSelId(null); };
  const dupField = (id: string) => { const f = fieldsRef.current.find((x) => x.id === id); if (!f) return; const n = { ...f, id: uid(), xPct: clamp(f.xPct + 0.02), yPct: clamp(f.yPct + 0.04) }; commit([...fieldsRef.current, n]); setSelId(n.id); };

  // Driver-profile fields available for one-click auto-fill (name, CDL, address…).
  const autofillFields = preview?.fields ?? [];
  // Place either a standard field (FType) or an auto-fill field ("af:<key>").
  const placeAt = (spec: string, page: number, xPct: number, yPct: number) => {
    if (spec.startsWith('af:')) {
      const af = autofillFields.find((a) => a.key === spec.slice(3));
      if (!af) return;
      const w = Math.max(120, Math.min(280, (af.value || af.label).length * 7 + 28));
      const f: PlacedField = {
        id: uid(), type: 'text', xPct: clamp(xPct), yPct: clamp(yPct), page, recipientId: curRecip,
        label: af.label, value: af.value, required: Boolean(af.required), autofill: true, dataKey: af.key, readOnly: false, w,
      };
      commit([...fieldsRef.current, f]); setSelId(f.id); setTool(null);
    } else {
      addField(spec as FType, page, xPct, yPct);
    }
  };

  // Coordinates relative to a specific page (works at any zoom via the live rect).
  const xyIn = (page: number, clientX: number, clientY: number) => {
    const r = pageRefs.current[page]?.getBoundingClientRect();
    if (!r) return { xPct: 0, yPct: 0 };
    return { xPct: (clientX - r.left) / r.width, yPct: (clientY - r.top) / r.height };
  };

  const doSend = async () => {
    setErr(''); if (!cand) { setErr('No driver selected.'); return; }
    setSending(true);
    try {
      await sendDoc(cand.id, {
        docType, emailSubject: subject, message,
        recipients: recipients.map((r) => ({ id: r.id, name: r.name, email: r.email, colorIdx: r.colorIdx })),
        placedFields: fields,
        ...(uploadName && uploadB64.current ? { uploadedPdf: { name: uploadName, base64: uploadB64.current } } : {}),
      });
      onSent();
    } catch (e) { setErr((e as Error).message); setSending(false); }
  };

  // Pages to render: an uploaded PDF (per page) or the single generated contract.
  const pages = pdfDoc
    ? pdfPages.map((sz, i) => ({ kind: 'pdf' as const, num: i + 1, w: sz.w * 1.3333, h: sz.h * 1.3333 }))
    : [{ kind: 'html' as const, num: 1, w: 816, h: docHeight }];
  const docName = uploadName || `${docLabel} (2).pdf`;

  // ── render ──
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ color: '#130032' }}>
      {step === 'setup'
        ? <SetupHeader onClose={onClose} onNext={() => setStep('fields')} onSendNow={doSend} sending={sending} />
        : <FieldsHeader onClose={onClose} onBack={() => setStep('setup')} onSend={doSend} sending={sending} />}

      {step === 'setup' ? (
        <Setup
          recipients={recipients} setRecipients={setRecipients} docType={docType} setDocType={setDocType} docTypes={docTypes}
          subject={subject} setSubject={setSubject} message={message} setMessage={setMessage}
          category={category} setCategory={setCategory} reminders={reminders} setReminders={setReminders}
          driverName={cand?.name || ''} docLabel={docLabel} err={err}
          uploadName={uploadName} onUpload={handleUpload} onClearUpload={clearUpload} pageCount={pdfPages.length}
        />
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* LEFT: palette or properties */}
          <div className="w-[300px] border-r flex flex-col" style={{ borderColor: '#eceef2' }}>
            {selected
              ? <Properties field={selected} recipients={recipients} onChange={(p) => updateField(selected.id, p)} onDelete={() => removeField(selected.id)} onBack={() => setSelId(null)} onRecip={(rid) => updateField(selected.id, { recipientId: rid })} />
              : <Palette recipients={recipients} curRecip={curRecip} setCurRecip={setCurRecip} tool={tool} setTool={setTool} onEditRecipients={() => setStep('setup')} autofillFields={autofillFields} />}
          </div>

          {/* CENTER: canvas */}
          <div className="flex-1 flex flex-col min-w-0" style={{ background: '#f3f4f6' }}>
            <CanvasToolbar zoom={zoom} setZoom={setZoom} onUndo={undo} onRedo={redo} onClear={() => commit([])} fieldCount={fields.length} />
            <div className="flex-1 overflow-auto p-8 flex flex-col items-center gap-6">
              {pages.map((pg) => (
                <div key={pg.num} ref={(el) => { pageRefs.current[pg.num] = el; }} className="relative bg-white shadow-lg flex-shrink-0"
                  style={{ width: pg.w * zoom, height: pg.h * zoom }}>
                  {pg.kind === 'html'
                    ? <div style={{ width: pg.w, height: pg.h, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                        <iframe title="doc" srcDoc={preview?.html || ''} onLoad={(e) => { try { const h = e.currentTarget.contentWindow?.document.body.scrollHeight; if (h) setDocHeight(h + 120); } catch { /* noop */ } }}
                          style={{ width: pg.w, height: pg.h, border: 0, pointerEvents: 'none' }} />
                      </div>
                    : <PdfPage doc={pdfDoc!} pageNum={pg.num} cssW={pg.w * zoom} cssH={pg.h * zoom} />}
                  {/* per-page overlay */}
                  <div className="absolute inset-0" style={{ cursor: tool ? 'copy' : 'default' }}
                    onClick={(e) => { if (!tool) { setSelId(null); return; } const { xPct, yPct } = xyIn(pg.num, e.clientX, e.clientY); placeAt(tool, pg.num, xPct, yPct); }}
                    onDrop={(e) => { e.preventDefault(); const t = e.dataTransfer.getData('ftype'); if (!t) return; const { xPct, yPct } = xyIn(pg.num, e.clientX, e.clientY); placeAt(t, pg.num, xPct, yPct); }}
                    onDragOver={(e) => e.preventDefault()}>
                    {fields.filter((f) => f.page === pg.num).map((f) => (
                      <FieldTag key={f.id} f={f} c={recipColor(f.recipientId)} selected={selId === f.id} zoom={zoom}
                        onPointerDown={(e) => { e.stopPropagation(); (e.target as HTMLElement).setPointerCapture(e.pointerId); setSelId(f.id); dragRef.current = { id: f.id, moved: false }; }}
                        onPointerMove={(e) => { if (dragRef.current?.id !== f.id) return; const { xPct, yPct } = xyIn(f.page, e.clientX, e.clientY); dragRef.current.moved = true; setFields((p) => p.map((x) => (x.id === f.id ? { ...x, xPct: clamp(xPct), yPct: clamp(yPct) } : x))); }}
                        onPointerUp={() => { if (dragRef.current?.moved) pushHistory(fieldsRef.current); dragRef.current = null; }}
                        onDup={() => dupField(f.id)} onDel={() => removeField(f.id)}
                        onResize={(w, h) => updateField(f.id, { w, h })}
                        recipients={recipients} onRecip={(rid) => updateField(f.id, { recipientId: rid })} onReq={(v) => updateField(f.id, { required: v })} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: documents */}
          <div className="w-[230px] border-l p-4 overflow-y-auto" style={{ borderColor: '#eceef2' }}>
            <div className="flex items-center justify-between mb-3"><span className="font-semibold text-sm">Documents</span><span className="text-gray-400">⚙</span></div>
            <div className="text-[13px] font-medium leading-tight break-words">{docName}</div>
            <div className="text-[11px] text-gray-400 mb-3">{pages.length} page{pages.length > 1 ? 's' : ''}</div>
            <div className="space-y-3">
              {pages.map((pg) => (
                <div key={pg.num} className="border rounded-lg overflow-hidden relative" style={{ borderColor: '#d6d9e0', height: 120 }}>
                  {pg.kind === 'html'
                    ? <iframe title="thumb" srcDoc={preview?.html || ''} style={{ width: 816, height: 1056, border: 0, transform: 'scale(0.232)', transformOrigin: 'top left', pointerEvents: 'none' }} />
                    : <PdfPage doc={pdfDoc!} pageNum={pg.num} cssW={198} cssH={198 * (pg.h / pg.w)} />}
                  <div className="absolute top-1 left-1 right-1 flex justify-between items-center">
                    {fields.filter((f) => f.page === pg.num).length > 0 && <span className="text-[9px] bg-emerald-500 text-white px-1 rounded">{fields.filter((f) => f.page === pg.num).length} field</span>}
                    <span className="text-[10px] text-gray-500 ml-auto bg-white/80 px-1 rounded">{pg.num}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {err && step === 'fields' && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg">{err}</div>}
    </div>
  );
}

// Renders one PDF page to a canvas at retina resolution, displayed at cssW×cssH.
function PdfPage({ doc, pageNum, cssW, cssH }: { doc: PDFDocumentProxy; pageNum: number; cssW: number; cssH: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false; let task: { promise: Promise<void>; cancel(): void } | null = null;
    (async () => {
      const page = await doc.getPage(pageNum);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: (cssW / base.width) * 2 });
      const canvas = ref.current; if (!canvas) return;
      canvas.width = vp.width; canvas.height = vp.height;
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      task = page.render({ canvasContext: ctx, viewport: vp });
      try { await task.promise; } catch { /* cancelled */ }
      if (cancelled) return;
    })();
    return () => { cancelled = true; try { task?.cancel(); } catch { /* noop */ } };
  }, [doc, pageNum, cssW]);
  return <canvas ref={ref} style={{ width: cssW, height: cssH, display: 'block', pointerEvents: 'none' }} />;
}

// ── Headers ──────────────────────────────────────────────────────────────────
function SetupHeader({ onClose, onNext, onSendNow, sending }: { onClose: () => void; onNext: () => void; onSendNow: () => void; sending: boolean }) {
  return (
    <div className="h-14 flex items-center gap-3 px-4 border-b" style={{ borderColor: '#eceef2' }}>
      <button onClick={onClose} className="w-7 h-7 grid place-items-center text-gray-500 hover:bg-gray-100 rounded">✕</button>
      <span className="font-semibold">Set Up Envelope</span>
      <div className="flex-1" />
      <span className="text-gray-400 text-lg">?</span><span className="text-gray-400 text-lg">⚙</span>
      <button onClick={onSendNow} disabled={sending} className="px-3 py-1.5 text-sm border rounded-md font-medium disabled:opacity-50" style={{ borderColor: '#d6d9e0' }}>{sending ? 'Sending…' : 'Send Now ▾'}</button>
      <button onClick={onNext} className="px-4 py-2 text-sm rounded-md font-semibold text-white" style={{ background: '#130032' }}>Next: Add Fields</button>
    </div>
  );
}
function FieldsHeader({ onClose, onBack, onSend, sending }: { onClose: () => void; onBack: () => void; onSend: () => void; sending: boolean }) {
  return (
    <div className="h-14 flex items-center gap-3 px-4 border-b" style={{ borderColor: '#eceef2' }}>
      <button onClick={onClose} className="w-7 h-7 grid place-items-center text-gray-500 hover:bg-gray-100 rounded">✕</button>
      <button onClick={onBack} className="w-7 h-7 grid place-items-center text-gray-500 hover:bg-gray-100 rounded">←</button>
      <span className="text-sm"><button onClick={onBack} className="text-violet-600 hover:underline">Set Up Envelope</button> <span className="text-gray-400">›</span> <span className="font-semibold">Add Fields</span></span>
      <div className="flex-1" />
      <span className="text-gray-400 text-lg">?</span><span className="text-gray-400 text-lg">⚙</span>
      <button className="px-3 py-1.5 text-sm border rounded-md font-medium" style={{ borderColor: '#d6d9e0' }}>Preview</button>
      <button onClick={onSend} disabled={sending} className="px-5 py-2 text-sm rounded-md font-semibold text-white disabled:opacity-50" style={{ background: '#130032' }}>{sending ? 'Sending…' : 'Send ▾'}</button>
    </div>
  );
}

// ── Setup step ───────────────────────────────────────────────────────────────
function Setup(p: {
  recipients: Recip[]; setRecipients: (r: Recip[]) => void; docType: string; setDocType: (t: string) => void; docTypes: DocType[];
  subject: string; setSubject: (s: string) => void; message: string; setMessage: (s: string) => void;
  category: string; setCategory: (s: string) => void; reminders: string; setReminders: (s: string) => void;
  driverName: string; docLabel: string; err: string;
  uploadName: string; onUpload: (f: File) => void; onClearUpload: () => void; pageCount: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const addRecipient = () => p.setRecipients([...p.recipients, { id: uid(), name: '', email: '', colorIdx: p.recipients.length % RECIPIENT_COLORS.length }]);
  const upd = (id: string, patch: Partial<Recip>) => p.setRecipients(p.recipients.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const del = (id: string) => p.setRecipients(p.recipients.filter((r) => r.id !== id));
  const draftAI = () => p.setMessage(`Hi ${p.driverName.split(' ')[0] || 'there'},\n\nPlease review and sign your ${p.docLabel}. Most fields are already filled in from the information you gave us — just confirm everything is correct and add your signature. Reach out if anything looks off.\n\nThank you!`);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1000px] mx-auto px-6 py-6">
        <div className="mb-5">
          <label className="block text-sm font-medium mb-1 text-gray-600">Document</label>
          {p.uploadName ? (
            <div className="flex items-center gap-3 border rounded-lg px-4 py-3 max-w-md" style={{ borderColor: '#d6d9e0' }}>
              <span className="text-2xl">📄</span>
              <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{p.uploadName}</div><div className="text-[11px] text-gray-400">{p.pageCount || '…'} page{p.pageCount === 1 ? '' : 's'} · uploaded PDF</div></div>
              <button onClick={p.onClearUpload} className="text-xs text-red-500 hover:underline">Remove</button>
            </div>
          ) : (
            <>
              <select value={p.docType} onChange={(e) => p.setDocType(e.target.value)} className="w-full max-w-md border rounded-md px-3 py-2 text-sm" style={{ borderColor: '#d6d9e0' }}>
                {p.docTypes.map((d) => <option key={d.type} value={d.type}>{d.label}</option>)}
              </select>
              <div className="text-xs text-gray-400 my-2">— or upload your own document —</div>
              <div onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) p.onUpload(f); }}
                className="max-w-md border-2 border-dashed rounded-lg px-4 py-7 text-center cursor-pointer transition"
                style={{ borderColor: dragOver ? '#4c00ff' : '#d6d9e0', background: dragOver ? '#faf5ff' : '#fafbfc' }}>
                <div className="text-2xl mb-1">⬆️</div>
                <div className="text-sm font-medium">Upload a PDF</div>
                <div className="text-[12px] text-gray-400">Drag & drop a PDF here, or click to browse</div>
              </div>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onUpload(f); e.target.value = ''; }} />
            </>
          )}
        </div>

        {p.recipients.map((r, i) => (
          <div key={r.id} className="flex gap-3 mb-3">
            <div className="w-1.5 rounded" style={{ background: color(r.colorIdx).solid }} />
            <div className="flex-1 border rounded-lg p-4" style={{ borderColor: '#eceef2' }}>
              <div className="flex items-center gap-2 mb-3"><span className="text-gray-400">⋮⋮</span><span className="text-xs font-semibold text-gray-500">RECIPIENT {i + 1}{i === 0 ? ' · signer' : ''}</span>{p.recipients.length > 1 && <button onClick={() => del(r.id)} className="ml-auto text-xs text-red-500">Remove</button>}</div>
              <label className="block text-sm font-medium mb-1">Name <span className="text-red-500">*</span></label>
              <input value={r.name} onChange={(e) => upd(r.id, { name: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm mb-3" style={{ borderColor: '#d6d9e0' }} />
              <label className="block text-sm font-medium mb-1">Email <span className="text-red-500">*</span></label>
              <input value={r.email} onChange={(e) => upd(r.id, { email: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" style={{ borderColor: '#d6d9e0' }} />
            </div>
          </div>
        ))}

        <button onClick={addRecipient} className="inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm font-medium mb-6" style={{ borderColor: '#d6d9e0' }}>
          <span>👤 Add Recipient</span><span className="text-gray-400">▾</span>
        </button>

        <hr style={{ borderColor: '#eceef2' }} />

        <div className="py-5">
          <h3 className="text-lg font-bold mb-4">Add message</h3>
          <label className="block text-sm font-medium mb-1">Subject <span className="text-red-500">*</span></label>
          <input value={p.subject} onChange={(e) => p.setSubject(e.target.value.slice(0, 100))} className="w-full border rounded-md px-3 py-2 text-sm" style={{ borderColor: '#d6d9e0' }} />
          <div className="text-right text-xs text-gray-400 mb-3">{p.subject.length}/100</div>

          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">Message</label>
            <span className="text-xs font-medium inline-flex items-center gap-1" style={{ color: '#4c00ff' }}>✦ AI-Assisted</span>
          </div>
          <textarea value={p.message} onChange={(e) => p.setMessage(e.target.value.slice(0, 10000))} rows={5} placeholder="Add a message or use AI to summarize your agreement and draft a message for your recipients…" className="w-full border rounded-md px-3 py-2 text-sm" style={{ borderColor: '#d6d9e0' }} />
          <div className="text-right text-xs text-gray-400">{p.message.length}/10000</div>
          <button onClick={draftAI} className="inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm font-medium mt-2" style={{ borderColor: '#d6d9e0' }}><span style={{ color: '#4c00ff' }}>✦</span> Draft with AI</button>
        </div>

        <hr style={{ borderColor: '#eceef2' }} />
        <div className="py-5 grid grid-cols-2 gap-6 max-w-2xl">
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select value={p.category} onChange={(e) => p.setCategory(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" style={{ borderColor: '#d6d9e0' }}>
              <option value="">-- Select --</option><option>Onboarding</option><option>Compliance</option><option>Owner-Operator</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-400">Frequency of reminders</label>
            <select value={p.reminders} onChange={(e) => p.setReminders(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" style={{ borderColor: '#d6d9e0' }}>
              <option value="">--</option><option>Daily</option><option>Every 3 days</option><option>Weekly</option>
            </select>
          </div>
        </div>
        {p.err && <div className="text-sm text-red-600 pb-4">{p.err}</div>}
      </div>
    </div>
  );
}

// ── Palette ──────────────────────────────────────────────────────────────────
function Palette({ recipients, curRecip, setCurRecip, tool, setTool, onEditRecipients, autofillFields }: {
  recipients: Recip[]; curRecip: string; setCurRecip: (id: string) => void; tool: string | null; setTool: (t: string | null) => void; onEditRecipients: () => void;
  autofillFields: { key: string; label: string; value: string; required: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const cur = recipients.find((r) => r.id === curRecip) || recipients[0];
  const c = color(cur?.colorIdx ?? 0);
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-3"><span className="font-bold text-lg">Fields</span><span className="text-gray-400">🔍</span></div>

      {/* recipient selector */}
      <div className="relative mb-3">
        <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium" style={{ background: c.pill }}>
          <span className="w-6 h-6 rounded-full grid place-items-center text-white text-[11px] font-bold" style={{ background: c.solid }}>{(cur?.name || '?').split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
          <span className="flex-1 text-left truncate">{cur?.name || 'Recipient'}</span><span>▾</span>
        </button>
        {open && (
          <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg py-1" style={{ borderColor: '#eceef2' }} onMouseLeave={() => setOpen(false)}>
            <div className="px-3 py-2 flex items-center gap-2 hover:bg-gray-50 cursor-pointer">
              <span className="w-6 h-6 rounded-full grid place-items-center bg-gray-200 text-[11px]">⚙</span>
              <div><div className="text-sm">Sender</div><div className="text-[11px] text-gray-400">Pre-fill fields before sending</div></div>
              <span className="ml-auto text-[10px] bg-gray-900 text-white px-1.5 py-0.5 rounded">New</span>
            </div>
            {recipients.map((r) => {
              const rc = color(r.colorIdx);
              return (
                <div key={r.id} onClick={() => { setCurRecip(r.id); setOpen(false); }} className="px-3 py-2 flex items-center gap-2 hover:bg-gray-50 cursor-pointer">
                  <span className="w-6 h-6 rounded-full grid place-items-center text-white text-[11px] font-bold" style={{ background: rc.solid }}>{(r.name || '?').split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                  <span className="text-sm font-medium flex-1 truncate">{r.name || 'Recipient'}</span>
                  {r.id === curRecip && <span className="text-emerald-600">✓</span>}
                </div>
              );
            })}
            <div onClick={onEditRecipients} className="px-3 py-2 text-sm text-violet-600 hover:bg-gray-50 cursor-pointer">Edit Recipients</div>
          </div>
        )}
      </div>

      <button className="w-full flex items-center gap-2 px-3 py-2 border rounded-lg text-sm mb-4" style={{ borderColor: '#d6d9e0' }}>📖 Standard Fields <span className="ml-auto">▾</span></button>

      {/* Auto-fill from the driver's profile. Placing one pre-populates the value;
          it stays editable so the signer can correct it if anything is wrong. */}
      {autofillFields.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: '#4c00ff' }}>✦ Auto-fill from driver profile</div>
          <div className="grid grid-cols-2 gap-2">
            {autofillFields.map((af) => {
              const spec = `af:${af.key}`;
              return (
                <button key={af.key} draggable onDragStart={(e) => e.dataTransfer.setData('ftype', spec)} onClick={() => setTool(tool === spec ? null : spec)}
                  title={af.value ? `Auto-fills: ${af.value}` : 'No value on file — signer can complete it'}
                  className={`flex flex-col items-start px-2.5 py-1.5 border rounded-lg text-left transition ${tool === spec ? 'ring-2' : 'hover:bg-violet-50'}`}
                  style={{ borderColor: tool === spec ? '#4c00ff' : '#e6e8ee', background: '#faf5ff' }}>
                  <span className="text-[12px] font-medium truncate w-full">{af.label}</span>
                  <span className="text-[10px] truncate w-full" style={{ color: af.value ? '#4c00ff' : '#b91c1c' }}>{af.value || '— empty —'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {PALETTE.map((grp) => (
        <div key={grp.section} className="mb-4">
          <div className="text-xs font-semibold text-gray-400 mb-2">{grp.section}</div>
          <div className="grid grid-cols-2 gap-2">
            {grp.items.map((it) => (
              <button key={it.type} draggable onDragStart={(e) => e.dataTransfer.setData('ftype', it.type)} onClick={() => setTool(tool === it.type ? null : it.type)}
                className={`flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm text-left transition ${tool === it.type ? 'ring-2' : 'hover:bg-gray-50'}`}
                style={{ borderColor: '#e6e8ee', ...(tool === it.type ? { borderColor: '#4c00ff' } : {}) }}>
                <span className="w-5 text-center text-[13px] text-violet-600">{it.icon}</span><span className="truncate">{it.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-gray-400 mt-4">Drag a field onto the document, or click a field then click where it goes.</p>
    </div>
  );
}

// ── Properties ───────────────────────────────────────────────────────────────
function Toggle({ on, set }: { on?: boolean; set: (v: boolean) => void }) {
  return <button onClick={() => set(!on)} className="w-10 h-5 rounded-full relative transition flex-shrink-0" style={{ background: on ? '#4c00ff' : '#cbd2dc' }}><span className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition" style={{ left: on ? 22 : 2 }} /></button>;
}
function Label({ children }: { children: ReactNode }) { return <label className="block text-[12px] font-medium text-gray-500 mb-1 mt-2">{children}</label>; }
function Pick({ value, options, onChange, className }: { value: string; options: string[]; onChange: (v: string) => void; className?: string }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className={`border rounded-md px-2 py-2 text-sm w-full ${className || ''}`} style={{ borderColor: '#d6d9e0' }}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
}
function CheckRow({ label, on, set }: { label: string; on?: boolean; set: (v: boolean) => void }) {
  return <label className="flex items-center gap-2 py-1.5 text-sm cursor-pointer"><input type="checkbox" checked={!!on} onChange={(e) => set(e.target.checked)} className="w-4 h-4" />{label}</label>;
}
function Collapse({ title, children, defaultOpen }: { title: string; children?: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-t" style={{ borderColor: '#eceef2' }}>
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full py-3 text-sm font-medium"><span>{title}</span><span className="text-gray-400">{open ? '▴' : '▾'}</span></button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}
function BIU({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} className="w-9 h-9 grid place-items-center border rounded-md text-sm font-bold flex-shrink-0" style={{ borderColor: active ? '#4c00ff' : '#d6d9e0', background: active ? '#ede9fe' : '#fff' }}>{children}</button>;
}
const inp = { className: 'w-full border rounded-md px-2 py-2 text-sm', style: { borderColor: '#d6d9e0' } };

function Properties({ field, recipients, onChange, onDelete, onBack, onRecip }: {
  field: PlacedField; recipients: Recip[]; onChange: (p: Partial<PlacedField>) => void; onDelete: () => void; onBack: () => void; onRecip: (id: string) => void;
}) {
  const [rOpen, setROpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const isInput = ['text', 'number', 'email', 'company', 'title'].includes(field.type);
  const isCheckbox = field.type === 'checkbox';
  const title = isCheckbox ? 'Checkbox Group' : field.type === 'name' ? 'Name' : field.type.charAt(0).toUpperCase() + field.type.slice(1);
  const cur = recipients.find((r) => r.id === field.recipientId);
  const rc = color(cur?.colorIdx ?? 0);
  const cv = field.checkboxValues?.length ? field.checkboxValues : ['', ''];

  const Formatting = (
    <Collapse title="Formatting" defaultOpen>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Font</Label><Pick value={field.font || 'Arial'} options={FONTS} onChange={(v) => onChange({ font: v })} /></div>
        <div><Label>Font size</Label><Pick value={field.fontSize || '10'} options={FONT_SIZES} onChange={(v) => onChange({ fontSize: v })} /></div>
      </div>
      <Label>Color</Label>
      <div className="flex items-center gap-1.5">
        <Pick value={field.color || 'Black'} options={COLORS} onChange={(v) => onChange({ color: v })} className="flex-1" />
        <BIU active={field.bold} onClick={() => onChange({ bold: !field.bold })}>B</BIU>
        <BIU active={field.italic} onClick={() => onChange({ italic: !field.italic })}><i>I</i></BIU>
        <BIU active={field.underline} onClick={() => onChange({ underline: !field.underline })}><u>U</u></BIU>
      </div>
      <CheckRow label="Fixed width" on={field.fixedWidth} set={(v) => onChange({ fixedWidth: v })} />
      <CheckRow label="Hide text with asterisks" on={field.hideAsterisks} set={(v) => onChange({ hideAsterisks: v })} />
    </Collapse>
  );
  const Location = (
    <Collapse title="Location and Autoplace" defaultOpen>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Pixels from left</Label><input type="number" value={Math.round(field.xPct * PDF_W)} onChange={(e) => onChange({ xPct: clamp(Number(e.target.value) / PDF_W) })} {...inp} /></div>
        <div><Label>Pixels from top</Label><input type="number" value={Math.round(field.yPct * PDF_H)} onChange={(e) => onChange({ yPct: clamp(Number(e.target.value) / PDF_H) })} {...inp} /></div>
      </div>
      <button className="w-full mt-2 py-2 border rounded-md text-sm" style={{ borderColor: '#d6d9e0', background: '#f6f7f9' }}>Set Up Autoplace</button>
    </Collapse>
  );
  const ConditionalLogic = <Collapse title="Conditional Logic"><button className="w-full py-2 border rounded-md text-sm font-medium" style={{ borderColor: '#d6d9e0' }}>Create Rule</button></Collapse>;

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-3"><span className="font-bold text-lg">{title}</span><button onClick={onBack} className="text-gray-500 text-lg">←</button></div>

      {/* recipient pill */}
      <div className="relative mb-3">
        <button onClick={() => setROpen(!rOpen)} className="w-full flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium" style={{ background: rc.pill }}>
          <span className="w-6 h-6 rounded-full grid place-items-center text-white text-[11px] font-bold" style={{ background: rc.solid }}>{initials(cur?.name)}</span>
          <span className="flex-1 text-left truncate">{cur?.name || 'Recipient'}</span><span>▾</span>
        </button>
        {rOpen && <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg py-1" style={{ borderColor: '#eceef2' }} onMouseLeave={() => setROpen(false)}>
          {recipients.map((r) => <button key={r.id} onClick={() => { onRecip(r.id); setROpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50"><span className="w-5 h-5 rounded-full" style={{ background: color(r.colorIdx).solid }} />{r.name || 'Recipient'}</button>)}
        </div>}
      </div>

      {isCheckbox ? (
        <>
          <div className="flex items-center justify-between py-2"><span className="text-sm">Read only</span><Toggle on={field.readOnly} set={(v) => onChange({ readOnly: v })} /></div>
          {cv.map((val, i) => (
            <div key={i} className="flex items-center gap-2 mb-2"><input type="checkbox" className="w-4 h-4" /><input value={val} placeholder="Checkbox value" onChange={(e) => { const next = [...cv]; next[i] = e.target.value; onChange({ checkboxValues: next }); }} {...inp} /></div>
          ))}
          <button onClick={() => onChange({ checkboxValues: [...cv, ''] })} className="text-sm text-violet-600 mb-3">+ Add option</button>
          <Label>Group label</Label>
          <textarea value={field.groupLabel ?? `Checkbox Group ${field.id}`} onChange={(e) => onChange({ groupLabel: e.target.value })} rows={2} {...inp} />
          {ConditionalLogic}{Formatting}{Location}
          <Collapse title="Validation" defaultOpen>
            <Label>Select at least</Label>
            <Pick value={field.selectRule || 'Select at least'} options={['Select at least', 'Select at most', 'Select exactly']} onChange={(v) => onChange({ selectRule: v })} />
            <Label>Number</Label>
            <Pick value={String(field.selectNumber ?? 0)} options={['0', '1', '2', '3', '4']} onChange={(v) => onChange({ selectNumber: Number(v) })} />
          </Collapse>
        </>
      ) : field.type === 'name' ? (
        <>
          <Label>Name Type</Label>
          <Pick value={field.nameType || 'Full Name'} options={['Full Name', 'First Name', 'Last Name']} onChange={(v) => onChange({ nameType: v, label: v })} />
          {Formatting}{Location}<Collapse title="Advanced" />
        </>
      ) : isInput ? (
        <>
          <div className="flex items-center justify-between py-2"><span className="text-sm">Read only</span><Toggle on={field.readOnly} set={(v) => onChange({ readOnly: v })} /></div>
          <div className="flex items-center justify-between py-2"><span className="text-sm">Required</span><Toggle on={field.required} set={(v) => onChange({ required: v })} /></div>
          <Label>Default text</Label>
          <textarea value={field.value || ''} onChange={(e) => onChange({ value: e.target.value })} rows={2} {...inp} />
          <Label>Character limit</Label>
          <input type="number" value={field.charLimit ?? 4000} onChange={(e) => onChange({ charLimit: Number(e.target.value) })} {...inp} />
          {ConditionalLogic}{Formatting}
          <Collapse title="Validation" defaultOpen>
            <Label>Require a specific format for this field</Label>
            <Pick value={field.validation || 'None'} options={VALIDATIONS} onChange={(v) => onChange({ validation: v })} />
            {field.validation === 'Custom' && <>
              <Label>Custom pattern</Label>
              <input value={field.customPattern || ''} onChange={(e) => onChange({ customPattern: e.target.value })} placeholder="Ex: ^[2-9]\d{2}-\d{3}-\d{4}" {...inp} />
              <Label>Error message</Label>
              <input value={field.errorMessage || ''} onChange={(e) => onChange({ errorMessage: e.target.value })} placeholder="Ex: Use the format ###-###" {...inp} />
            </>}
            <div className="flex items-center justify-between py-2 mt-1"><span className="text-sm">Allow recipients to collaborate</span><Toggle on={field.collaborate} set={(v) => onChange({ collaborate: v })} /></div>
          </Collapse>
          {Location}<Collapse title="Collaboration" /><Collapse title="Advanced" />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between py-2"><span className="text-sm">Required</span><Toggle on={field.required} set={(v) => onChange({ required: v })} /></div>
          {Location}<Collapse title="Advanced" />
        </>
      )}

      <button onClick={() => {
        try {
          const list = JSON.parse(localStorage.getItem('qh_ds_custom_fields') || '[]');
          list.push({ type: field.type, label: field.label, font: field.font, fontSize: field.fontSize, required: field.required });
          localStorage.setItem('qh_ds_custom_fields', JSON.stringify(list.slice(-50)));
        } catch { /* ignore */ }
        setSaved(true); setTimeout(() => setSaved(false), 1500);
      }} className="w-full mt-4 py-2.5 border rounded-md text-sm font-medium" style={{ borderColor: saved ? '#10B981' : '#d6d9e0', color: saved ? '#059669' : undefined }}>{saved ? 'Saved ✓' : 'Save As Custom Field'}</button>
      <button onClick={onDelete} className="w-full mt-2 py-2.5 rounded-md text-sm font-semibold text-white" style={{ background: '#c8102e' }}>Delete</button>
    </div>
  );
}

// ── Canvas toolbar ───────────────────────────────────────────────────────────
function CanvasToolbar({ zoom, setZoom, onUndo, onRedo, onClear, fieldCount }: { zoom: number; setZoom: (z: number) => void; onUndo: () => void; onRedo: () => void; onClear: () => void; fieldCount: number }) {
  const [actions, setActions] = useState(false);
  return (
    <div className="h-12 border-b flex items-center gap-2 px-4 bg-white" style={{ borderColor: '#eceef2' }}>
      <span className="text-gray-400">⧉</span>
      <div className="flex-1" />
      <button onClick={onUndo} className="w-8 h-8 grid place-items-center rounded hover:bg-gray-100" title="Undo">↶</button>
      <button onClick={onRedo} className="w-8 h-8 grid place-items-center rounded hover:bg-gray-100" title="Redo">↷</button>
      <span className="text-gray-300">|</span>
      <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="border rounded-md px-2 py-1 text-sm" style={{ borderColor: '#d6d9e0' }}>
        <option value={1}>100%</option><option value={1.35}>135%</option><option value={2.03}>203%</option>
      </select>
      <div className="relative">
        <button onClick={() => setActions(!actions)} className="px-3 py-1.5 text-sm rounded hover:bg-gray-100">Actions ▾</button>
        {actions && (
          <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg py-1 z-10 w-40" style={{ borderColor: '#eceef2' }} onMouseLeave={() => setActions(false)}>
            <button onClick={() => { onClear(); setActions(false); }} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Clear all fields {fieldCount > 0 && `(${fieldCount})`}</button>
          </div>
        )}
      </div>
      <span className="text-gray-300">|</span>
      <span className="text-gray-400">▤</span><span className="text-gray-400">💬</span>
    </div>
  );
}

// ── Field tag ────────────────────────────────────────────────────────────────
function FieldTag({ f, c, selected, zoom, onPointerDown, onPointerMove, onPointerUp, onDup, onDel, onResize, recipients, onRecip, onReq }: {
  f: PlacedField; c: { bg: string; border: string; solid: string }; selected: boolean; zoom: number;
  onPointerDown: (e: React.PointerEvent) => void; onPointerMove: (e: React.PointerEvent) => void; onPointerUp: (e: React.PointerEvent) => void;
  onDup: () => void; onDel: () => void; onResize: (w: number, h: number) => void; recipients: Recip[]; onRecip: (id: string) => void; onReq: (v: boolean) => void;
}) {
  const isCheckbox = f.type === 'checkbox';
  const baseW = f.w ?? DEFAULTS[f.type as FType]?.w ?? 110;
  const baseH = f.h ?? (isCheckbox ? 22 : ['signature', 'initial'].includes(f.type) ? 30 : 26);
  const boxW = (isCheckbox ? 22 : baseW) * zoom;
  const boxH = (isCheckbox ? 22 : baseH) * zoom;
  const [menu, setMenu] = useState(false);
  const resizing = useRef<{ sx: number; sy: number; w: number; h: number } | null>(null);
  // Auto-fill fields show the value they pulled from the driver; others show a label.
  const text = isCheckbox ? '' : (f.value || f.label || f.type);
  return (
    <div className="absolute" style={{ left: `${f.xPct * 100}%`, top: `${f.yPct * 100}%` }} onClick={(e) => e.stopPropagation()}>
      {selected && (
        <div className="absolute left-0 flex items-center gap-1 bg-white border rounded-lg shadow px-1.5 py-1 z-20" style={{ top: -36, borderColor: '#e6e8ee' }} onClick={(e) => e.stopPropagation()}>
          <div className="relative">
            <button onClick={() => setMenu(!menu)} className="w-5 h-5 rounded-full grid place-items-center text-white text-[9px] font-bold" style={{ background: c.solid }}>{recipients.find((r) => r.id === f.recipientId)?.name?.split(' ').map((x) => x[0]).slice(0, 2).join('') || '?'}</button>
            {menu && <div className="absolute top-6 left-0 bg-white border rounded-lg shadow-lg py-1 z-30 w-40" style={{ borderColor: '#eceef2' }} onMouseLeave={() => setMenu(false)}>
              {recipients.map((r) => <button key={r.id} onClick={() => { onRecip(r.id); setMenu(false); }} className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-gray-50"><span className="w-4 h-4 rounded-full" style={{ background: color(r.colorIdx).solid }} />{r.name || 'Recipient'}</button>)}
            </div>}
          </div>
          <span className="text-gray-300">▾</span>
          {['text', 'number', 'email', 'company', 'title'].includes(f.type) && (
            <button onClick={() => onReq(!f.required)} className="flex items-center gap-1 text-[11px] px-1"><span className="w-7 h-4 rounded-full relative" style={{ background: f.required ? '#4c00ff' : '#cbd2dc' }}><span className="absolute top-0.5 w-3 h-3 bg-white rounded-full" style={{ left: f.required ? 16 : 2 }} /></span>Required</button>
          )}
          <button onClick={onDup} className="w-6 h-6 grid place-items-center hover:bg-gray-100 rounded" title="Duplicate">⧉</button>
          <button onClick={onDel} className="w-6 h-6 grid place-items-center hover:bg-gray-100 rounded text-red-500" title="Delete">🗑</button>
          <button className="w-6 h-6 grid place-items-center hover:bg-gray-100 rounded" title="Settings">⚙</button>
        </div>
      )}
      <div style={{ position: 'relative', width: boxW, height: boxH }}>
        <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          className="w-full h-full flex items-center overflow-hidden whitespace-nowrap select-none touch-none"
          style={{ padding: isCheckbox ? 0 : `0 ${4 * zoom}px`, background: c.bg, border: `1.5px solid ${selected ? c.solid : c.border}`, borderRadius: 4, cursor: 'move', color: '#0b3b2e', fontSize: Math.max(8, 11 * zoom), justifyContent: isCheckbox ? 'center' : 'flex-start', boxShadow: selected ? `0 0 0 2px ${c.solid}44` : 'none' }}>
          {isCheckbox ? <span style={{ fontSize: Math.max(10, 14 * zoom) }}>☐</span> : <span className="truncate">{text}</span>}
        </div>
        {/* resize handle — drag to adjust the field size */}
        {selected && !isCheckbox && (
          <div onPointerDown={(e) => { e.stopPropagation(); (e.target as HTMLElement).setPointerCapture(e.pointerId); resizing.current = { sx: e.clientX, sy: e.clientY, w: baseW, h: baseH }; }}
            onPointerMove={(e) => { if (!resizing.current) return; const dw = (e.clientX - resizing.current.sx) / zoom; const dh = (e.clientY - resizing.current.sy) / zoom; onResize(Math.max(40, Math.round(resizing.current.w + dw)), Math.max(16, Math.round(resizing.current.h + dh))); }}
            onPointerUp={(e) => { resizing.current = null; try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ } }}
            className="absolute rounded-sm bg-white" style={{ right: -5, bottom: -5, width: 10, height: 10, border: `2px solid ${c.solid}`, cursor: 'nwse-resize' }} />
        )}
      </div>
      {/* add-to-group affordance for a selected checkbox */}
      {selected && isCheckbox && (
        <button onClick={(e) => { e.stopPropagation(); onDup(); }} title="Add to group"
          className="absolute left-1/2 -translate-x-1/2 w-5 h-5 rounded grid place-items-center text-white text-[13px] leading-none" style={{ top: boxH + 4, background: '#4c00ff' }}>+</button>
      )}
    </div>
  );
}
