// QuickHire — Hiring Dashboard
const TOKEN_KEY = 'qh_admin';
const STAGES = ['Lead', 'Screening', 'Background Check', 'Offer', 'Onboarding'];
const STAGE_COLORS = { Lead:'bg-gray-100 text-gray-700', Screening:'bg-blue-100 text-blue-700', 'Background Check':'bg-purple-100 text-purple-700', Offer:'bg-amber-100 text-amber-700', Onboarding:'bg-green-100 text-green-700', Rejected:'bg-red-100 text-red-600' };

let cfg = {};
let allCandidates = [];
let currentView = 'board';
let currentFilter = '';
let searchQuery = '';
let sortField = 'createdAt'; let sortDir = -1;
let selectedIds = new Set();
let dragId = null;

function adminHeaders() {
  const t = localStorage.getItem(TOKEN_KEY);
  return t ? { 'x-admin-token': t, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { ...adminHeaders(), ...(opts.headers || {}) } });
  if (res.status === 401) { location.href = '/login.html'; throw new Error('Unauthorized'); }
  return res;
}

// ── Init ────────────────────────────────────────────────────────────────────
async function init() {
  cfg = await (await fetch('/api/config')).json();
  if (cfg.requiresPassword && !localStorage.getItem(TOKEN_KEY)) { location.href = '/login.html'; return; }
  document.getElementById('bcCompany').textContent = cfg.companyName?.replace('National Carrier Xpress Corp', 'NCX') || 'NCX';
  document.title = `${cfg.companyName} — Hiring`;
  // Populate bulk stage select
  const bss = document.getElementById('bulkStageSelect');
  STAGES.forEach(s => bss.appendChild(Object.assign(document.createElement('option'), { value: s, textContent: s })));
  await load();
  setInterval(load, 30000); // auto-refresh every 30s
}

async function load() {
  const params = new URLSearchParams();
  if (searchQuery) params.set('search', searchQuery);
  if (currentFilter) params.set('filter', currentFilter);
  const res = await api('/api/candidates?' + params);
  allCandidates = await res.json();
  render();
}

// ── Render ───────────────────────────────────────────────────────────────────
function render() {
  if (currentView === 'board') renderBoard();
  else renderTable();
}

function timeInStage(c) {
  const ms = Date.now() - new Date(c.stageChangedAt || c.createdAt).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
function timeInStageColor(c) {
  const days = (Date.now() - new Date(c.stageChangedAt || c.createdAt).getTime()) / 86400000;
  if (days > 7) return 'text-red-600';
  if (days > 3) return 'text-amber-600';
  return 'text-gray-400';
}
function stageBadge(stage) {
  return `<span class="pill ${STAGE_COLORS[stage] || 'bg-gray-100 text-gray-600'}">${stage}</span>`;
}
function staleBadge(c) {
  return c.stale ? `<span class="pill bg-amber-100 text-amber-700 ml-1">Stale</span>` : '';
}
function expiringBadge(c) {
  return c.expiringDocs?.length ? `<span class="pill bg-orange-100 text-orange-700 ml-1">Exp. ${c.expiringDocs[0].type}</span>` : '';
}
function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fmt(d) { return d ? new Date(d).toLocaleDateString() : '—'; }

// Board -----------------------------------------------------------------------
function renderBoard() {
  const cols = document.getElementById('boardCols');
  cols.innerHTML = '';
  STAGES.forEach(stage => {
    const cards = allCandidates.filter(c => c.stage === stage);
    const col = document.createElement('div');
    col.className = 'board-col w-64 flex-shrink-0';
    col.dataset.stage = stage;
    col.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <span class="font-bold text-sm">${stage}</span>
        <span class="w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center">${cards.length}</span>
      </div>
      <div class="space-y-2 card-list" data-stage="${stage}">
        ${cards.map(c => boardCard(c)).join('')}
        ${cards.length === 0 ? '<div class="text-xs text-gray-300 text-center py-6">No candidates</div>' : ''}
      </div>`;
    cols.appendChild(col);
  });
  // Wire drag events
  cols.querySelectorAll('.card').forEach(wireCardDrag);
  cols.querySelectorAll('.card-list').forEach(wireDropZone);
  cols.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => location.href = `/candidate.html?id=${card.dataset.id}`);
  });
}

function boardCard(c) {
  return `<div class="card bg-white rounded-xl border border-gray-200 p-3 shadow-sm hover:shadow-md hover:border-accent-200 transition-all select-none"
    data-id="${c.id}" data-stage="${c.stage}">
    <div class="flex items-start justify-between gap-1">
      <span class="font-semibold text-sm leading-snug">${esc(c.name)}</span>
      <button class="text-gray-300 hover:text-gray-500 flex-shrink-0 text-lg leading-none mt-0.5">⋯</button>
    </div>
    <div class="flex items-center gap-1 mt-1.5">
      <span class="text-xs ${timeInStageColor(c)} flex items-center gap-1">🕐 ${timeInStage(c)}</span>
      ${staleBadge(c)}${expiringBadge(c)}
    </div>
    <div class="mt-2 flex items-center gap-1 flex-wrap">
      <span class="pill bg-gray-100 text-gray-600">${esc(c.subStatus || 'in_progress')}</span>
      ${c.submittedAt ? '<span class="pill bg-green-50 text-green-700">App ✓</span>' : '<span class="pill bg-amber-50 text-amber-600">Pending</span>'}
    </div>
    <div class="mt-2 text-xs text-gray-400">${c.checklistProgress}/10 steps</div>
  </div>`;
}

function wireCardDrag(card) {
  card.draggable = true;
  card.addEventListener('dragstart', e => { dragId = card.dataset.id; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
  card.addEventListener('dragend', () => { dragId = null; card.classList.remove('dragging'); document.querySelectorAll('.col-drop-target').forEach(el => el.classList.remove('col-drop-target')); });
}
function wireDropZone(zone) {
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('col-drop-target'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('col-drop-target'));
  zone.addEventListener('drop', async e => {
    e.preventDefault();
    zone.classList.remove('col-drop-target');
    if (!dragId) return;
    const newStage = zone.dataset.stage;
    const candidate = allCandidates.find(c => c.id === dragId);
    if (!candidate || candidate.stage === newStage) return;
    const res = await api(`/api/candidates/${dragId}`, { method: 'PATCH', body: JSON.stringify({ stage: newStage }) });
    const data = await res.json();
    if (!res.ok) {
      let msg = data.error || 'Error';
      if (data.outstanding?.length) msg += '\n\nOutstanding steps:\n• ' + data.outstanding.join('\n• ');
      alert(msg);
    }
    await load();
  });
}

// Table -----------------------------------------------------------------------
function renderTable() {
  let list = [...allCandidates];
  if (sortField === 'name') list.sort((a, b) => sortDir * a.name.localeCompare(b.name));
  else if (sortField === 'stageTime') list.sort((a, b) => sortDir * (new Date(a.stageChangedAt) - new Date(b.stageChangedAt)));
  else list.sort((a, b) => sortDir * (new Date(a.createdAt) - new Date(b.createdAt)));

  const tb = document.getElementById('tableBody');
  if (!list.length) { tb.innerHTML = `<tr><td colspan="8" class="px-4 py-10 text-center text-gray-400">No candidates found.</td></tr>`; return; }

  tb.innerHTML = list.map(c => `
    <tr class="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" data-id="${c.id}">
      <td class="px-4 py-3"><input type="checkbox" class="row-check rounded" data-id="${c.id}" ${selectedIds.has(c.id) ? 'checked' : ''} onclick="event.stopPropagation()"/></td>
      <td class="px-4 py-3 font-medium">${esc(c.name)}${staleBadge(c)}${expiringBadge(c)}</td>
      <td class="px-4 py-3">${stageBadge(c.stage)}</td>
      <td class="px-4 py-3 text-gray-500 text-xs">${esc(c.subStatus || '')}</td>
      <td class="px-4 py-3 text-xs ${timeInStageColor(c)}">${timeInStage(c)}</td>
      <td class="px-4 py-3 text-gray-500">${esc(c.recruiter || '')}</td>
      <td class="px-4 py-3 text-gray-500">${fmt(c.createdAt)}</td>
      <td class="px-4 py-3 text-right">
        <a href="/candidate.html?id=${c.id}" class="text-accent-600 hover:text-accent-700 font-semibold text-xs" onclick="event.stopPropagation()">View</a>
      </td>
    </tr>`).join('');

  tb.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => location.href = `/candidate.html?id=${row.dataset.id}`);
  });
  tb.querySelectorAll('.row-check').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) selectedIds.add(cb.dataset.id); else selectedIds.delete(cb.dataset.id);
      updateBulkBar();
    });
    if (selectedIds.has(cb.dataset.id)) cb.checked = true;
  });
  document.getElementById('selectAll').checked = list.length > 0 && list.every(c => selectedIds.has(c.id));
}

function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  if (selectedIds.size === 0) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  document.getElementById('bulkCount').textContent = `${selectedIds.size} selected`;
}

// ── Event wiring ─────────────────────────────────────────────────────────────
document.getElementById('toggleBoard').addEventListener('click', () => {
  currentView = 'board';
  document.getElementById('boardView').classList.remove('hidden');
  document.getElementById('tableView').classList.add('hidden');
  document.getElementById('toggleBoard').className = 'px-3 py-1.5 rounded-md font-medium bg-white shadow-sm text-gray-800';
  document.getElementById('toggleTable').className = 'px-3 py-1.5 rounded-md font-medium text-gray-500';
  render();
});
document.getElementById('toggleTable').addEventListener('click', () => {
  currentView = 'table';
  document.getElementById('tableView').classList.remove('hidden');
  document.getElementById('boardView').classList.add('hidden');
  document.getElementById('toggleBoard').className = 'px-3 py-1.5 rounded-md font-medium text-gray-500';
  document.getElementById('toggleTable').className = 'px-3 py-1.5 rounded-md font-medium bg-white shadow-sm text-gray-800';
  render();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.className = b.dataset.filter === currentFilter
        ? 'filter-btn px-2.5 py-1.5 rounded-lg bg-accent-500 text-white font-semibold text-xs'
        : 'filter-btn px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 text-xs';
    });
    load();
  });
});

let searchTimer;
document.getElementById('searchInput').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { searchQuery = e.target.value; load(); }, 250);
});

document.querySelectorAll('th[data-sort]').forEach(th => {
  th.addEventListener('click', () => { if (sortField === th.dataset.sort) sortDir *= -1; else { sortField = th.dataset.sort; sortDir = 1; } render(); });
});

document.getElementById('selectAll').addEventListener('change', e => {
  allCandidates.forEach(c => { if (e.target.checked) selectedIds.add(c.id); else selectedIds.delete(c.id); });
  updateBulkBar();
  render();
});

document.getElementById('bulkClear').addEventListener('click', () => { selectedIds.clear(); updateBulkBar(); render(); });

document.querySelector('[data-bulk="resend"]').addEventListener('click', async () => {
  if (!confirm(`Resend application links to ${selectedIds.size} driver(s)?`)) return;
  await api('/api/candidates/bulk', { method: 'POST', body: JSON.stringify({ ids: [...selectedIds], action: 'resend' }) });
  selectedIds.clear(); updateBulkBar(); await load();
});

document.querySelector('[data-bulk="stage"]').addEventListener('click', async () => {
  const stage = document.getElementById('bulkStageSelect').value;
  if (!stage) return alert('Select a stage first.');
  if (!confirm(`Move ${selectedIds.size} driver(s) to "${stage}"?`)) return;
  const results = await (await api('/api/candidates/bulk', { method: 'POST', body: JSON.stringify({ ids: [...selectedIds], action: 'stage_change', stage }) })).json();
  const failed = results.filter(r => !r.ok);
  if (failed.length) alert(`${failed.length} candidate(s) could not be moved (checklist incomplete).`);
  selectedIds.clear(); updateBulkBar(); await load();
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const rows = [['Name','Email','Phone','Stage','Sub-status','Recruiter','Added','Submitted']];
  allCandidates.forEach(c => rows.push([c.name,c.email,c.phone,c.stage,c.subStatus,c.recruiter,c.createdAt,c.submittedAt||'']));
  const csv = rows.map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = 'candidates.csv'; a.click();
});

document.getElementById('logoutBtn').addEventListener('click', () => { localStorage.removeItem(TOKEN_KEY); location.href='/login.html'; });

// Add Candidate modal
document.getElementById('addCandidateBtn').addEventListener('click', () => {
  document.getElementById('addModal').classList.remove('hidden');
  document.getElementById('addName').focus();
  document.getElementById('addDupWarning').classList.add('hidden');
  document.getElementById('addResult').classList.remove('hidden');
  document.getElementById('addResult').classList.add('hidden');
  document.getElementById('addName').value = '';
  document.getElementById('addEmail').value = '';
  document.getElementById('addPhone').value = '';
  document.getElementById('addSubmitBtn').textContent = 'Send Invite';
  document.getElementById('addSubmitBtn').disabled = false;
});
document.getElementById('closeAddModal').addEventListener('click', () => document.getElementById('addModal').classList.add('hidden'));
document.getElementById('addCancelBtn').addEventListener('click', () => document.getElementById('addModal').classList.add('hidden'));
document.getElementById('addModal').addEventListener('click', e => { if (e.target === document.getElementById('addModal')) document.getElementById('addModal').classList.add('hidden'); });

document.getElementById('addSubmitBtn').addEventListener('click', async () => {
  const name = document.getElementById('addName').value.trim();
  const email = document.getElementById('addEmail').value.trim();
  const phone = document.getElementById('addPhone').value.trim();
  if (!name || !email) return alert('Name and email are required.');
  const btn = document.getElementById('addSubmitBtn');
  btn.disabled = true; btn.textContent = 'Creating…';
  document.getElementById('addDupWarning').classList.add('hidden');
  try {
    const res = await api('/api/candidates', { method: 'POST', body: JSON.stringify({ name, email, phone }) });
    const data = await res.json();
    if (res.status === 409) {
      const w = document.getElementById('addDupWarning');
      w.textContent = `Possible duplicate found: ${data.duplicate?.name} (${data.duplicate?.email}, stage: ${data.duplicate?.stage}). Check before adding.`;
      w.classList.remove('hidden');
      btn.textContent = 'Add Anyway'; btn.disabled = false;
      btn.onclick = async () => {
        // Allow duplicate on second click by calling with force (we just proceed, duplicate check already warned)
        await proceedCreate(name, email, phone);
      };
      return;
    }
    if (!res.ok) throw new Error(data.error || 'Error');
    await proceedCreate(name, email, phone, data);
  } catch (err) { alert(err.message); btn.disabled = false; btn.textContent = 'Send Invite'; }
});

async function proceedCreate(name, email, phone, existingData) {
  const btn = document.getElementById('addSubmitBtn');
  let data = existingData;
  if (!data) {
    const res = await api('/api/candidates', { method: 'POST', body: JSON.stringify({ name, email, phone }) });
    data = await res.json();
  }
  const emailStatus = data.email?.sent ? 'Email sent ✓' : `Email not sent (${data.email?.reason || 'n/a'}) — share the link below`;
  const smsStatus = data.sms?.sent ? ' · SMS sent ✓' : (phone ? ` · SMS: ${data.sms?.reason || 'n/a'}` : '');
  const r = document.getElementById('addResult');
  r.innerHTML = `<p class="font-semibold mb-1">Candidate added!</p><p class="mb-1">${emailStatus}${smsStatus}</p>
    <div class="flex gap-2 mt-2"><input value="${data.link||''}" readonly class="flex-1 text-xs px-2 py-1 border rounded bg-white"/>
    <button onclick="navigator.clipboard?.writeText('${data.link||''}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)" class="text-xs px-2 py-1 bg-gray-100 rounded">Copy</button></div>`;
  r.classList.remove('hidden');
  btn.textContent = 'Done';
  await load();
}

init();
