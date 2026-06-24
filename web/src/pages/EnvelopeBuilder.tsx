import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { previewDoc, sendDoc, type DocType, type CandidateLite, type PreviewResult, type PlacedField } from '@/lib/docusignApi';

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
  const [tool, setTool] = useState<FType | null>(null);
  const [curRecip, setCurRecip] = useState(recipients[0]?.id || '');
  const [zoom, setZoom] = useState(1.35);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');

  const pageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  const [docHeight, setDocHeight] = useState(1056);
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
    if (!cand) return;
    previewDoc(cand.id, docType).then(setPreview).catch(() => setPreview(null));
    setSubject(`Complete with Docusign: ${docLabel}.pdf`);
  }, [docType, cand?.id]);

  // ── field history ──
  const commit = (next: PlacedField[]) => {
    setFields(next);
    const h = hist.current; h.stack = h.stack.slice(0, h.idx + 1); h.stack.push(next); h.idx = h.stack.length - 1;
  };
  const undo = () => { const h = hist.current; if (h.idx > 0) { h.idx--; setFields(h.stack[h.idx]); } };
  const redo = () => { const h = hist.current; if (h.idx < h.stack.length - 1) { h.idx++; setFields(h.stack[h.idx]); } };

  const recipColor = (id: string) => color(recipients.find((r) => r.id === id)?.colorIdx ?? 0);
  const selected = fields.find((f) => f.id === selId) || null;

  const addField = (type: FType, xPct: number, yPct: number) => {
    const f: PlacedField = {
      id: uid(), type, xPct: clamp(xPct), yPct: clamp(yPct), page: 1, recipientId: curRecip,
      label: DEFAULTS[type].label, required: type !== 'checkbox', value: prefill[type] || '',
    };
    commit([...fields, f]); setSelId(f.id); setTool(null);
  };
  const updateField = (id: string, patch: Partial<PlacedField>) => commit(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const removeField = (id: string) => { commit(fields.filter((f) => f.id !== id)); if (selId === id) setSelId(null); };
  const dupField = (id: string) => { const f = fields.find((x) => x.id === id); if (!f) return; const n = { ...f, id: uid(), xPct: clamp(f.xPct + 0.02), yPct: clamp(f.yPct + 0.03) }; commit([...fields, n]); setSelId(n.id); };

  // page interactions
  const pageXY = (clientX: number, clientY: number) => {
    const r = pageRef.current!.getBoundingClientRect();
    return { xPct: (clientX - r.left) / r.width, yPct: (clientY - r.top) / r.height };
  };
  const onCanvasClick = (e: React.MouseEvent) => {
    if (!tool) { setSelId(null); return; }
    const { xPct, yPct } = pageXY(e.clientX, e.clientY); addField(tool, xPct, yPct);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('ftype') as FType; if (!type) return;
    const { xPct, yPct } = pageXY(e.clientX, e.clientY); addField(type, xPct, yPct);
  };

  const doSend = async () => {
    setErr(''); if (!cand) { setErr('No driver selected.'); return; }
    setSending(true);
    try {
      const env = await sendDoc(cand.id, {
        docType, emailSubject: subject, message,
        recipients: recipients.map((r) => ({ id: r.id, name: r.name, email: r.email, colorIdx: r.colorIdx })),
        placedFields: fields,
      });
      void env; onSent();
    } catch (e) { setErr((e as Error).message); setSending(false); }
  };

  // ── render ──
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ color: '#1a1a2e' }}>
      {step === 'setup'
        ? <SetupHeader onClose={onClose} onNext={() => setStep('fields')} onSendNow={doSend} sending={sending} />
        : <FieldsHeader onClose={onClose} onBack={() => setStep('setup')} onSend={doSend} sending={sending} />}

      {step === 'setup' ? (
        <Setup
          recipients={recipients} setRecipients={setRecipients} docType={docType} setDocType={setDocType} docTypes={docTypes}
          subject={subject} setSubject={setSubject} message={message} setMessage={setMessage}
          category={category} setCategory={setCategory} reminders={reminders} setReminders={setReminders}
          driverName={cand?.name || ''} docLabel={docLabel} err={err}
        />
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* LEFT: palette or properties */}
          <div className="w-[300px] border-r flex flex-col" style={{ borderColor: '#eceef2' }}>
            {selected
              ? <Properties field={selected} recipients={recipients} onChange={(p) => updateField(selected.id, p)} onDelete={() => removeField(selected.id)} onBack={() => setSelId(null)} onRecip={(rid) => updateField(selected.id, { recipientId: rid })} />
              : <Palette recipients={recipients} curRecip={curRecip} setCurRecip={setCurRecip} tool={tool} setTool={setTool} onEditRecipients={() => setStep('setup')} />}
          </div>

          {/* CENTER: canvas */}
          <div className="flex-1 flex flex-col min-w-0" style={{ background: '#f3f4f6' }}>
            <CanvasToolbar zoom={zoom} setZoom={setZoom} onUndo={undo} onRedo={redo} onClear={() => commit([])} fieldCount={fields.length} />
            <div className="flex-1 overflow-auto p-8 flex justify-center">
              <div style={{ width: 816 * zoom, height: docHeight * zoom, flex: '0 0 auto' }}>
                <div ref={pageRef} className="relative bg-white shadow-lg" style={{ width: 816, height: docHeight, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                  <iframe title="doc" srcDoc={preview?.html || ''} onLoad={(e) => { try { const h = e.currentTarget.contentWindow?.document.body.scrollHeight; if (h) setDocHeight(h + 120); } catch { /* noop */ } }}
                    style={{ width: 816, height: docHeight, border: 0, pointerEvents: 'none' }} />
                  {/* overlay */}
                  <div className="absolute inset-0" style={{ cursor: tool ? 'copy' : 'default' }} onClick={onCanvasClick} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
                    {fields.map((f) => (
                      <FieldTag key={f.id} f={f} c={recipColor(f.recipientId)} selected={selId === f.id} zoom={zoom}
                        onPointerDown={(e) => { e.stopPropagation(); (e.target as HTMLElement).setPointerCapture(e.pointerId); setSelId(f.id); dragRef.current = { id: f.id, moved: false }; }}
                        onPointerMove={(e) => { if (dragRef.current?.id !== f.id) return; const { xPct, yPct } = pageXY(e.clientX, e.clientY); dragRef.current.moved = true; setFields((p) => p.map((x) => (x.id === f.id ? { ...x, xPct: clamp(xPct), yPct: clamp(yPct) } : x))); }}
                        onPointerUp={() => { if (dragRef.current?.moved) commit(fields); dragRef.current = null; }}
                        onDup={() => dupField(f.id)} onDel={() => removeField(f.id)}
                        recipients={recipients} onRecip={(rid) => updateField(f.id, { recipientId: rid })} onReq={(v) => updateField(f.id, { required: v })} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: documents */}
          <div className="w-[230px] border-l p-4 overflow-y-auto" style={{ borderColor: '#eceef2' }}>
            <div className="flex items-center justify-between mb-3"><span className="font-semibold text-sm">Documents</span><span className="text-gray-400">⚙</span></div>
            <div className="text-[13px] font-medium leading-tight">{docLabel} (2).pdf</div>
            <div className="text-[11px] text-gray-400 mb-3">1 page</div>
            <div className="border rounded-lg overflow-hidden relative" style={{ borderColor: '#d6d9e0' }}>
              <iframe title="thumb" srcDoc={preview?.html || ''} style={{ width: 816, height: 1056, border: 0, transform: 'scale(0.232)', transformOrigin: 'top left', pointerEvents: 'none' }} />
              <div style={{ height: 1056 * 0.232 }} />
              <div className="absolute top-1 left-1 right-1 flex justify-between items-center">
                {fields.length > 0 && <span className="text-[9px] bg-emerald-500 text-white px-1 rounded">{fields.length} field{fields.length > 1 ? 's' : ''}</span>}
                <span className="text-[10px] text-gray-500 ml-auto bg-white/80 px-1 rounded">1</span>
              </div>
            </div>
          </div>
        </div>
      )}
      {err && step === 'fields' && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg">{err}</div>}
    </div>
  );
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
      <button onClick={onNext} className="px-4 py-2 text-sm rounded-md font-semibold text-white" style={{ background: '#1a1a2e' }}>Next: Add Fields</button>
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
      <button onClick={onSend} disabled={sending} className="px-5 py-2 text-sm rounded-md font-semibold text-white disabled:opacity-50" style={{ background: '#1a1a2e' }}>{sending ? 'Sending…' : 'Send ▾'}</button>
    </div>
  );
}

// ── Setup step ───────────────────────────────────────────────────────────────
function Setup(p: {
  recipients: Recip[]; setRecipients: (r: Recip[]) => void; docType: string; setDocType: (t: string) => void; docTypes: DocType[];
  subject: string; setSubject: (s: string) => void; message: string; setMessage: (s: string) => void;
  category: string; setCategory: (s: string) => void; reminders: string; setReminders: (s: string) => void;
  driverName: string; docLabel: string; err: string;
}) {
  const addRecipient = () => p.setRecipients([...p.recipients, { id: uid(), name: '', email: '', colorIdx: p.recipients.length % RECIPIENT_COLORS.length }]);
  const upd = (id: string, patch: Partial<Recip>) => p.setRecipients(p.recipients.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const del = (id: string) => p.setRecipients(p.recipients.filter((r) => r.id !== id));
  const draftAI = () => p.setMessage(`Hi ${p.driverName.split(' ')[0] || 'there'},\n\nPlease review and sign your ${p.docLabel}. Most fields are already filled in from the information you gave us — just confirm everything is correct and add your signature. Reach out if anything looks off.\n\nThank you!`);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1000px] mx-auto px-6 py-6">
        <div className="mb-5">
          <label className="block text-sm font-medium mb-1 text-gray-600">Document</label>
          <select value={p.docType} onChange={(e) => p.setDocType(e.target.value)} className="w-full max-w-md border rounded-md px-3 py-2 text-sm" style={{ borderColor: '#d6d9e0' }}>
            {p.docTypes.map((d) => <option key={d.type} value={d.type}>{d.label}</option>)}
          </select>
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
            <span className="text-xs font-medium inline-flex items-center gap-1" style={{ color: '#7c3aed' }}>✦ AI-Assisted</span>
          </div>
          <textarea value={p.message} onChange={(e) => p.setMessage(e.target.value.slice(0, 10000))} rows={5} placeholder="Add a message or use AI to summarize your agreement and draft a message for your recipients…" className="w-full border rounded-md px-3 py-2 text-sm" style={{ borderColor: '#d6d9e0' }} />
          <div className="text-right text-xs text-gray-400">{p.message.length}/10000</div>
          <button onClick={draftAI} className="inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm font-medium mt-2" style={{ borderColor: '#d6d9e0' }}><span style={{ color: '#7c3aed' }}>✦</span> Draft with AI</button>
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
function Palette({ recipients, curRecip, setCurRecip, tool, setTool, onEditRecipients }: {
  recipients: Recip[]; curRecip: string; setCurRecip: (id: string) => void; tool: FType | null; setTool: (t: FType | null) => void; onEditRecipients: () => void;
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

      {PALETTE.map((grp) => (
        <div key={grp.section} className="mb-4">
          <div className="text-xs font-semibold text-gray-400 mb-2">{grp.section}</div>
          <div className="grid grid-cols-2 gap-2">
            {grp.items.map((it) => (
              <button key={it.type} draggable onDragStart={(e) => e.dataTransfer.setData('ftype', it.type)} onClick={() => setTool(tool === it.type ? null : it.type)}
                className={`flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm text-left transition ${tool === it.type ? 'ring-2' : 'hover:bg-gray-50'}`}
                style={{ borderColor: '#e6e8ee', ...(tool === it.type ? { borderColor: '#7c3aed' } : {}) }}>
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
  return <button onClick={() => set(!on)} className="w-10 h-5 rounded-full relative transition flex-shrink-0" style={{ background: on ? '#3b1d82' : '#cbd2dc' }}><span className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition" style={{ left: on ? 22 : 2 }} /></button>;
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
  return <button onClick={onClick} className="w-9 h-9 grid place-items-center border rounded-md text-sm font-bold flex-shrink-0" style={{ borderColor: active ? '#3b1d82' : '#d6d9e0', background: active ? '#ede9fe' : '#fff' }}>{children}</button>;
}
const inp = { className: 'w-full border rounded-md px-2 py-2 text-sm', style: { borderColor: '#d6d9e0' } };

function Properties({ field, recipients, onChange, onDelete, onBack, onRecip }: {
  field: PlacedField; recipients: Recip[]; onChange: (p: Partial<PlacedField>) => void; onDelete: () => void; onBack: () => void; onRecip: (id: string) => void;
}) {
  const [rOpen, setROpen] = useState(false);
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

      <button className="w-full mt-4 py-2.5 border rounded-md text-sm font-medium" style={{ borderColor: '#d6d9e0' }}>Save As Custom Field</button>
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
function FieldTag({ f, c, selected, onPointerDown, onPointerMove, onPointerUp, onDup, onDel, recipients, onRecip, onReq }: {
  f: PlacedField; c: { bg: string; border: string; solid: string }; selected: boolean; zoom: number;
  onPointerDown: (e: React.PointerEvent) => void; onPointerMove: (e: React.PointerEvent) => void; onPointerUp: (e: React.PointerEvent) => void;
  onDup: () => void; onDel: () => void; recipients: Recip[]; onRecip: (id: string) => void; onReq: (v: boolean) => void;
}) {
  const isCheckbox = f.type === 'checkbox';
  const w = DEFAULTS[f.type as FType]?.w ?? 110;
  const [menu, setMenu] = useState(false);
  return (
    <div className="absolute" style={{ left: `${f.xPct * 100}%`, top: `${f.yPct * 100}%` }}>
      {selected && (
        <div className="absolute -top-9 left-0 flex items-center gap-1 bg-white border rounded-lg shadow px-1.5 py-1 z-20" style={{ borderColor: '#e6e8ee' }} onClick={(e) => e.stopPropagation()}>
          <div className="relative">
            <button onClick={() => setMenu(!menu)} className="w-5 h-5 rounded-full grid place-items-center text-white text-[9px] font-bold" style={{ background: c.solid }}>{recipients.find((r) => r.id === f.recipientId)?.name?.split(' ').map((x) => x[0]).slice(0, 2).join('') || '?'}</button>
            {menu && <div className="absolute top-6 left-0 bg-white border rounded-lg shadow-lg py-1 z-30 w-40" style={{ borderColor: '#eceef2' }} onMouseLeave={() => setMenu(false)}>
              {recipients.map((r) => <button key={r.id} onClick={() => { onRecip(r.id); setMenu(false); }} className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-gray-50"><span className="w-4 h-4 rounded-full" style={{ background: color(r.colorIdx).solid }} />{r.name || 'Recipient'}</button>)}
            </div>}
          </div>
          <span className="text-gray-300">▾</span>
          {['text', 'number', 'email', 'company', 'title'].includes(f.type) && (
            <button onClick={() => onReq(!f.required)} className="flex items-center gap-1 text-[11px] px-1"><span className="w-7 h-4 rounded-full relative" style={{ background: f.required ? '#3b1d82' : '#cbd2dc' }}><span className="absolute top-0.5 w-3 h-3 bg-white rounded-full" style={{ left: f.required ? 16 : 2 }} /></span>Required</button>
          )}
          <button onClick={onDup} className="w-6 h-6 grid place-items-center hover:bg-gray-100 rounded" title="Duplicate">⧉</button>
          <button onClick={onDel} className="w-6 h-6 grid place-items-center hover:bg-gray-100 rounded text-red-500" title="Delete">🗑</button>
          <button className="w-6 h-6 grid place-items-center hover:bg-gray-100 rounded" title="Settings">⚙</button>
        </div>
      )}
      <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        className="grid place-items-center text-[11px] font-medium select-none touch-none"
        style={{ width: isCheckbox ? 22 : w, height: isCheckbox ? 22 : 24, background: c.bg, border: `1.5px solid ${selected ? c.solid : c.border}`, borderRadius: 3, cursor: 'move', color: '#0f3d2e', outline: selected ? `2px solid ${c.solid}55` : 'none' }}>
        {isCheckbox ? '☐' : (f.label || f.type)}
      </div>
      {/* add-to-group affordance for a selected checkbox */}
      {selected && isCheckbox && (
        <button onClick={(e) => { e.stopPropagation(); onDup(); }} title="Add to group"
          className="absolute left-1/2 -translate-x-1/2 w-5 h-5 rounded grid place-items-center text-white text-[13px] leading-none" style={{ top: 26, background: '#7c3aed' }}>+</button>
      )}
    </div>
  );
}
