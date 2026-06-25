// QuickHire — DocuSign e-Signature Console
const TOKEN_KEY = 'qh_admin';
let cfg = {};
let candidates = [];
let docTypes = [];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

function adminHeaders() {
  const t = localStorage.getItem(TOKEN_KEY);
  return t ? { 'x-admin-token': t, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { ...adminHeaders(), ...(opts.headers || {}) } });
  if (res.status === 401) { location.href = '/login.html'; throw new Error('Unauthorized'); }
  return res;
}

const STATUS_COLORS = {
  sent: 'bg-blue-100 text-blue-700', delivered: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-green-100 text-green-700', declined: 'bg-red-100 text-red-700',
  voided: 'bg-gray-200 text-gray-600', created: 'bg-amber-100 text-amber-700',
};
const statusPill = (s) => `<span class="pill ${STATUS_COLORS[s] || 'bg-gray-100 text-gray-600'}">${esc(s)}</span>`;

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  cfg = await fetch('/api/config').then((r) => r.json());
  if (cfg.requiresPassword && !localStorage.getItem(TOKEN_KEY)) { location.href = '/login.html'; return; }

  const ds = cfg.docusign || { mode: 'simulated', documents: [] };
  docTypes = ds.documents || [];
  renderMode(ds);

  // Populate document dropdown
  document.getElementById('docTypeSel').innerHTML = docTypes.map((d) => `<option value="${d.type}">${esc(d.label)}</option>`).join('');
  onDocTypeChange();

  // Load candidates
  const list = await api('/api/candidates').then((r) => r.json()).catch(() => []);
  candidates = list;
  document.getElementById('candidateSel').innerHTML = list.length
    ? list.map((c) => `<option value="${c.id}">${esc(c.name)} — ${esc(c.email)}${c.submittedAt ? '' : ' (no application yet)'}</option>`).join('')
    : '<option value="">No drivers in the pipeline yet</option>';
  // Deep-link support: /docusign.html?candidate=<id> preselects that driver.
  const pre = new URLSearchParams(location.search).get('candidate');
  if (pre && list.some((c) => c.id === pre)) document.getElementById('candidateSel').value = pre;

  // Wire events
  document.getElementById('docTypeSel').onchange = onDocTypeChange;
  document.getElementById('previewBtn').onclick = doPreview;
  document.getElementById('sendBtn').onclick = doSend;
  document.getElementById('reloadEnv').onclick = loadEnvelopes;

  await loadEnvelopes();
  if (ds.mode === 'live') loadTemplates();
}

function renderMode(ds) {
  const badge = document.getElementById('modeBadge');
  const live = ds.mode === 'live';
  badge.textContent = live ? '● Live' : '● Simulated';
  badge.className = `pill ${live ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`;

  document.getElementById('statusBanner').innerHTML = live
    ? `<span class="font-semibold text-green-700">DocuSign is live.</span> Connected to account
       <code class="text-xs bg-gray-100 px-1 py-0.5 rounded">${esc(ds.accountId || '')}</code>.
       Documents are sent for real, legally-binding e-signature${ds.hasWebhookSecret ? ' · Connect webhook verification enabled' : ''}.`
    : `<span class="font-semibold text-amber-700">Simulated mode.</span> DocuSign credentials aren't configured, so envelopes
       are created locally and clearly flagged — the full send → review → sign → complete flow is fully demonstrable.
       Set the <code class="text-xs bg-gray-100 px-1 py-0.5 rounded">DOCUSIGN_*</code> env vars to go live.`;
}

function onDocTypeChange() {
  const type = document.getElementById('docTypeSel').value;
  const def = docTypes.find((d) => d.type === type);
  document.getElementById('docDesc').textContent = def?.description || '';
  document.getElementById('offerFields').classList.toggle('hidden', type !== 'offer_letter');
}

function offerFieldValues() {
  if (document.getElementById('docTypeSel').value !== 'offer_letter') return {};
  const g = (id) => document.getElementById(id).value.trim();
  const f = {};
  if (g('f_position')) f.position = g('f_position');
  if (g('f_payRate')) f.payRate = g('f_payRate');
  if (g('f_startDate')) f.startDate = g('f_startDate');
  if (g('f_supervisor')) f.supervisor = g('f_supervisor');
  return f;
}

// ── Preview (auto-fill) ──────────────────────────────────────────────────────
async function doPreview() {
  const id = document.getElementById('candidateSel').value;
  if (!id) return;
  const docType = document.getElementById('docTypeSel').value;
  const res = await api(`/api/docusign/candidates/${id}/preview`, { method: 'POST', body: JSON.stringify({ docType, fields: offerFieldValues() }) });
  const data = await res.json();
  if (!res.ok) { return showSend(false, data.error || 'Preview failed.'); }

  document.getElementById('previewEmpty').classList.add('hidden');
  document.getElementById('previewBody').classList.remove('hidden');
  const lbl = document.getElementById('previewLabel');
  lbl.textContent = data.label; lbl.classList.remove('hidden');

  document.getElementById('fieldChips').innerHTML = data.fields.map((f) =>
    `<span class="fieldchip ${f.value ? '' : 'miss'}" title="${esc(f.label)}">${esc(f.label)}: ${f.value ? esc(f.value) : 'missing'}</span>`
  ).join('') + (data.missing.length ? `<span class="text-xs text-red-600 w-full mt-1">⚠ ${data.missing.length} field(s) blank — the driver can fill these in when reviewing.</span>` : '');

  document.getElementById('docFrame').srcdoc = data.html;
}

// ── Send ─────────────────────────────────────────────────────────────────────
async function doSend() {
  const id = document.getElementById('candidateSel').value;
  if (!id) return showSend(false, 'Pick a driver first.');
  const docType = document.getElementById('docTypeSel').value;
  const embedded = document.getElementById('embeddedChk').checked;
  const btn = document.getElementById('sendBtn');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const res = await api(`/api/docusign/candidates/${id}/send`, { method: 'POST', body: JSON.stringify({ docType, fields: offerFieldValues(), embedded }) });
    const data = await res.json();
    if (!res.ok) { showSend(false, data.error || 'Send failed.'); return; }
    const how = embedded ? 'ready for in-app signing' : (data.simulated ? 'created (simulated — no email actually sent)' : 'emailed to the driver');
    showSend(true, `${data.documentName} ${how}. Envelope ${data.envelopeId.slice(0, 16)}…`);
    await loadEnvelopes();
    if (embedded) openSigning(data.envelopeId);
  } finally { btn.disabled = false; btn.textContent = 'Send for signature'; }
}

function showSend(ok, msg) {
  const el = document.getElementById('sendMsg');
  el.className = `text-sm mt-3 ${ok ? 'text-green-700' : 'text-red-600'}`;
  el.textContent = msg; el.classList.remove('hidden');
}

// ── Envelopes table ──────────────────────────────────────────────────────────
async function loadEnvelopes() {
  const rows = await api('/api/docusign/envelopes').then((r) => r.json()).catch(() => []);
  const tb = document.getElementById('envRows');
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="6" class="text-gray-400 text-sm py-4">No envelopes yet.</td></tr>'; return; }
  tb.innerHTML = rows.map((e) => {
    const updated = e.completedAt || e.voidedAt || e.sentAt || e.createdAt;
    const acts = [];
    acts.push(`<button class="btn btn-ghost text-xs py-1" onclick="viewDoc('${e.envelopeId}')">View</button>`);
    if (!e.simulated) acts.push(`<button class="btn btn-ghost text-xs py-1" onclick="refreshEnv('${e.envelopeId}')">↻</button>`);
    if (e.status !== 'completed' && e.status !== 'voided') {
      acts.push(`<button class="btn btn-ghost text-xs py-1" onclick="openSigning('${e.envelopeId}')">Sign</button>`);
      if (e.simulated) acts.push(`<button class="btn btn-ghost text-xs py-1" onclick="completeSim('${e.envelopeId}')">✔ Complete</button>`);
      acts.push(`<button class="btn btn-ghost text-xs py-1 text-red-600" onclick="voidEnv('${e.envelopeId}')">Void</button>`);
    }
    if (e.status === 'completed') acts.push(`<button class="btn btn-ghost text-xs py-1" onclick="downloadDoc('${e.envelopeId}')">⬇ PDF</button>`);
    return `<tr>
      <td><a href="/candidate.html?id=${e.candidateId}" class="text-accent-600 hover:underline font-medium">${esc(e.candidateName)}</a></td>
      <td>${esc(e.documentName || '')}${e.simulated ? ' <span class="text-[10px] text-amber-600">sim</span>' : ''}</td>
      <td>${statusPill(e.status)}</td>
      <td class="text-xs text-gray-500">${esc(e.signer?.name || '')}<br>${esc(e.signer?.email || '')}</td>
      <td class="text-xs text-gray-500">${fmt(updated)}</td>
      <td><div class="flex flex-wrap gap-1">${acts.join('')}</div></td>
    </tr>`;
  }).join('');
}

async function refreshEnv(id) { await api(`/api/docusign/envelopes/${id}/refresh`, { method: 'POST' }); await loadEnvelopes(); }
async function completeSim(id) { await api(`/api/docusign/envelopes/${id}/simulate`, { method: 'POST', body: JSON.stringify({ status: 'completed' }) }); await loadEnvelopes(); }
async function voidEnv(id) {
  const reason = prompt('Reason for voiding this envelope?', 'No longer required');
  if (reason === null) return;
  await api(`/api/docusign/envelopes/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) });
  await loadEnvelopes();
}
async function openSigning(id) {
  const data = await api(`/api/docusign/envelopes/${id}/signing-url`).then((r) => r.json());
  if (data.url) window.open(data.url, '_blank');
}
// Fetch with admin header → open in a new tab (works even when a password is set).
async function viewDoc(id) {
  const res = await api(`/api/docusign/envelopes/${id}/document.html`);
  const html = await res.text();
  const w = window.open('', '_blank'); w.document.write(html); w.document.close();
}
async function downloadDoc(id) {
  const res = await api(`/api/docusign/envelopes/${id}/document`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'signed-document.pdf'; a.click();
  URL.revokeObjectURL(url);
}

// ── Templates (live mode) ────────────────────────────────────────────────────
async function loadTemplates() {
  const data = await api('/api/docusign/templates').then((r) => r.json()).catch(() => null);
  if (!data || data.simulated) return;
  const card = document.getElementById('templatesCard');
  card.classList.remove('hidden');
  document.getElementById('templatesBody').innerHTML = data.templates.length
    ? data.templates.map((t) => `<div class="py-1.5 border-b border-gray-100">${esc(t.name)} <span class="text-xs text-gray-400">${esc(t.templateId)}</span></div>`).join('')
    : 'No templates in this DocuSign account yet.';
}

window.refreshEnv = refreshEnv; window.completeSim = completeSim; window.voidEnv = voidEnv;
window.openSigning = openSigning; window.viewDoc = viewDoc; window.downloadDoc = downloadDoc;
init();
