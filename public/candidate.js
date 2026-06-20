// QuickHire — Candidate Detail Page
const TOKEN_KEY = 'qh_admin';
const id = new URLSearchParams(location.search).get('id');
let candidate = {};
let cfg = {};
let pendingDocUpload = null; // { docType, label }

const STAGES = ['Lead','Screening','Background Check','Offer','Onboarding'];
const STAGE_COLORS = { Lead:'bg-gray-100 text-gray-700', Screening:'bg-blue-100 text-blue-700', 'Background Check':'bg-purple-100 text-purple-700', Offer:'bg-amber-100 text-amber-700', Onboarding:'bg-green-100 text-green-700', Rejected:'bg-red-100 text-red-600' };
const PEV_STATUS = ['not_started','in_progress','verified','unable_to_verify'];
const PEV_LABELS = { not_started:'Not Started', in_progress:'In Progress', verified:'Verified', unable_to_verify:'Unable to Verify' };
const PEV_COLORS = { not_started:'bg-gray-100 text-gray-600', in_progress:'bg-blue-100 text-blue-700', verified:'bg-green-100 text-green-700', unable_to_verify:'bg-red-100 text-red-700' };
const ACTIVITY_ICONS = { stage_change:'🔄', application_submitted:'📋', note_added:'📝', link_resent:'📨', checklist_complete:'✅', molly_summary:'🤖', document_uploaded:'📎', document_removed:'🗑', pev_updated:'🔍', candidate_created:'👤' };

function esc(s) { return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmt(d) { return d ? new Date(d).toLocaleString() : '—'; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString() : '—'; }
function adminHeaders() {
  const t = localStorage.getItem(TOKEN_KEY);
  return t ? { 'x-admin-token': t, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { ...adminHeaders(), ...(opts.headers||{}) } });
  if (res.status === 401) { location.href = '/login.html'; throw new Error('Unauthorized'); }
  return res;
}

// ── Load ─────────────────────────────────────────────────────────────────────
async function init() {
  if (!id) { location.href = '/'; return; }
  [cfg] = await Promise.all([
    fetch('/api/config').then(r => r.json()),
  ]);
  if (cfg.requiresPassword && !localStorage.getItem(TOKEN_KEY)) { location.href = '/login.html'; return; }
  document.getElementById('bcCompany').textContent = cfg.companyName?.replace('National Carrier Xpress Corp','NCX') || 'NCX';
  await reload();
}

async function reload() {
  const res = await api(`/api/candidates/${id}`);
  if (!res.ok) { alert('Candidate not found'); location.href='/'; return; }
  candidate = await res.json();
  renderAll();
}

// ── Render all ───────────────────────────────────────────────────────────────
function renderAll() {
  const c = candidate;
  document.title = `${c.name} — QuickHire`;
  document.getElementById('candName').textContent = c.name;
  document.getElementById('candEmail').innerHTML = c.email ? `✉ ${esc(c.email)}` : '';
  document.getElementById('candPhone').innerHTML = c.phone ? `📞 ${esc(c.phone)}` : '';
  document.getElementById('stageBadge').className = `pill ${STAGE_COLORS[c.stage]||'bg-gray-100 text-gray-600'}`;
  document.getElementById('stageBadge').textContent = c.stage;
  document.getElementById('staleBadge').classList.toggle('hidden', !c.stale);

  renderComplianceDots();
  renderPipelineJourney();
  renderSidebar();
  renderChecklist();
  renderApplication();
  renderPev();
  renderActivity();
  renderDocuments();
}

// Compliance dots
function renderComplianceDots() {
  const c = candidate;
  const cl = c.checklist || {};
  const dots = [
    { label:'MVR', id:'mvrCheck' }, { label:'BGC', id:'backgroundCheck' },
    { label:'Drug Test', id:'drugTest' }, { label:'CDL', id:'cdlVerification' },
    { label:'Clearinghouse', id:'clearinghouseQuery' },
  ];
  document.getElementById('complianceDots').innerHTML = dots.map(d => {
    const s = cl[d.id]?.status || 'not_started';
    const r = cl[d.id]?.result || '';
    const color = s === 'complete' && r !== 'flagged' ? 'text-green-600' : s === 'complete' ? 'text-red-600' : 'text-gray-400';
    const label2 = s === 'complete' ? (r || 'Complete') : 'Pending';
    return `<span class="${color}">● ${d.label}: <span class="text-gray-600">${label2}</span></span>`;
  }).join('');
}

// Pipeline journey
function renderPipelineJourney() {
  const c = candidate;
  const curIdx = STAGES.indexOf(c.stage);
  const start = Math.max(0, curIdx - 1);
  const visible = STAGES.slice(start, start + 4);
  document.getElementById('pipelineJourney').innerHTML = visible.map((s, i) => {
    const isActive = s === c.stage;
    const isPast = STAGES.indexOf(s) < curIdx;
    const dot = isActive ? 'bg-accent-500 ring-4 ring-accent-100' : isPast ? 'bg-green-500' : 'bg-gray-200';
    const label = `<span class="text-[10px] font-medium ${isActive ? 'text-accent-600' : isPast ? 'text-green-600' : 'text-gray-400'}">${s}</span>`;
    const line = i < visible.length - 1 ? '<div class="h-0.5 w-4 bg-gray-200 flex-shrink-0"></div>' : '';
    return `<div class="flex flex-col items-center gap-1"><div class="w-3 h-3 rounded-full ${dot} flex-shrink-0"></div>${label}</div>${line}`;
  }).join('');
}

// Sidebar
function renderSidebar() {
  const c = candidate;
  // Advance button
  const curIdx = STAGES.indexOf(c.stage);
  const nextStage = curIdx >= 0 && curIdx < STAGES.length - 1 ? STAGES[curIdx + 1] : null;
  const advBtn = document.getElementById('advanceBtn');
  if (nextStage) { advBtn.textContent = `Advance to ${nextStage}`; advBtn.disabled = false; }
  else { advBtn.textContent = c.stage === 'Rejected' ? 'Rejected' : 'Final Stage'; advBtn.disabled = true; }

  // Consents
  const consentDone = c.consentCompletedAt;
  document.getElementById('consentBadge').className = `pill ${consentDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`;
  document.getElementById('consentBadge').textContent = consentDone ? 'Submitted' : 'Not Submitted';
  document.getElementById('consentDetail').innerHTML = `
    ${consentDone ? '<p>✓ Consents completed</p>' : '<p>Consents not yet completed</p>'}
    <p>Sent ${c.linkSentCount || 0} time(s). Last: ${fmtDate(c.linkLastSentAt)}</p>
    ${consentDone && c.driverFiles?.signature ? `<a href="/api/candidates/${c.id}/signature" target="_blank" class="text-accent-600 underline">View Signature</a>` : ''}`;

  // Application card
  const appDone = Boolean(c.submittedAt);
  document.getElementById('appBadge').className = `pill ${appDone ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`;
  document.getElementById('appBadge').textContent = appDone ? 'Submitted' : 'Not Submitted';
  const pct = appCompletionPct(c.application);
  document.getElementById('appProgress').style.width = pct + '%';
  document.getElementById('appProgressPct').textContent = `${pct}% complete`;
  document.getElementById('appCardDetail').innerHTML = `
    <p>Last active: ${fmtDate(c.lastActivityAt)}</p>
    <p>Sent ${c.linkSentCount || 0} time(s). Last: ${fmtDate(c.linkLastSentAt)}</p>`;
}

function appCompletionPct(app) {
  if (!app) return 0;
  const fields = ['hasMinimumExperience','firstName','lastName','dateOfBirth','email','phone','address','city','state','cdlNumber','cdlState','accidents3Years','positionType'];
  const filled = fields.filter(f => app[f] && String(app[f]).trim()).length;
  return Math.round((filled / fields.length) * 100);
}

// ── Checklist ────────────────────────────────────────────────────────────────
function renderChecklist() {
  const c = candidate;
  const steps = cfg.checklistSteps || [];
  const complete = steps.filter(s => c.checklist?.[s.id]?.status === 'complete').length;
  const total = steps.length;
  const circumference = 2 * Math.PI * 32;
  const offset = circumference * (1 - complete / total);
  document.getElementById('ringProg').style.strokeDashoffset = offset;
  document.getElementById('ringNum').textContent = `${complete}/${total}`;
  document.getElementById('ringSubtitle').textContent = complete === total ? 'All steps complete — ready for Onboarding' : `${total - complete} step${total - complete !== 1 ? 's' : ''} remaining`;

  // Group by category
  const categories = {};
  steps.forEach(s => { (categories[s.category] = categories[s.category]||[]).push(s); });

  const wrap = document.getElementById('checklistWrap');
  wrap.innerHTML = '';
  let globalIdx = 0;
  Object.entries(categories).forEach(([cat, catSteps]) => {
    const catDone = catSteps.filter(s => c.checklist?.[s.id]?.status === 'complete').length;
    const h = document.createElement('div');
    h.className = 'pt-2';
    h.innerHTML = `<div class="flex items-center justify-between mb-2">
      <h3 class="font-semibold text-sm text-gray-700">${esc(cat)}</h3>
      <span class="text-xs text-gray-400">${catDone}/${catSteps.length}</span></div>`;
    wrap.appendChild(h);

    catSteps.forEach(step => {
      const stepData = c.checklist?.[step.id] || {};
      const locked = globalIdx > 0 && c.checklist?.[steps[globalIdx - 1]?.id]?.status !== 'complete';
      wrap.appendChild(buildChecklistRow(step, stepData, locked, globalIdx));
      globalIdx++;
    });
  });
}

function buildChecklistRow(step, data, locked, idx) {
  const el = document.createElement('div');
  el.className = 'checklist-row border border-gray-200 rounded-xl overflow-hidden';
  el.dataset.step = step.id;

  const statusColors = { complete:'bg-green-50 border-green-400', in_progress:'bg-amber-50 border-amber-400', not_started:'bg-white border-transparent' };
  const pillColors = { complete:'bg-green-100 text-green-700', in_progress:'bg-amber-100 text-amber-700', not_started:'bg-gray-100 text-gray-500' };
  const pillLabels = { complete:'Complete', in_progress:'In Progress', not_started:'Not Started' };
  const leftBorder = data.status === 'complete' ? 'border-l-4 border-l-green-500' : data.status === 'in_progress' ? 'border-l-4 border-l-amber-400' : 'border-l-4 border-l-gray-200';

  el.innerHTML = `
    <div class="flex items-center gap-3 px-4 py-3 cursor-pointer select-none ${statusColors[data.status||'not_started']} ${leftBorder}" data-toggle-row>
      <span class="text-lg">${locked ? '🔒' : data.status === 'complete' ? '✅' : data.status === 'in_progress' ? '🔄' : '⚪'}</span>
      <div class="flex-1 min-w-0">
        <div class="font-medium text-sm ${locked ? 'text-gray-400' : ''}">${esc(step.label)}</div>
        ${locked ? '<div class="text-xs text-gray-400">Complete the previous step first</div>' : ''}
      </div>
      <span class="pill ${pillColors[data.status||'not_started']} flex-shrink-0">${pillLabels[data.status||'not_started']}</span>
      <span class="text-gray-400 text-sm transition-transform expand-chevron">▼</span>
    </div>
    <div class="step-detail hidden px-4 py-4 bg-gray-50 border-t border-gray-100 space-y-3 ${locked ? 'pointer-events-none opacity-50' : ''}">
      <p class="text-sm text-gray-600">${esc(step.description)}</p>
      ${buildStepResult(step, data)}
      ${buildStepActions(step, data)}
      ${buildMollySection(step, data)}
      ${data.status === 'complete' ? `<button data-undone="${step.id}" class="text-xs text-gray-400 hover:text-red-600 underline">Mark as Undone</button>` : ''}
    </div>`;

  // Toggle expand/collapse
  el.querySelector('[data-toggle-row]').addEventListener('click', () => {
    const detail = el.querySelector('.step-detail');
    const chevron = el.querySelector('.expand-chevron');
    const open = !detail.classList.contains('hidden');
    detail.classList.toggle('hidden', open);
    chevron.style.transform = open ? '' : 'rotate(180deg)';
  });

  // Undone
  el.querySelector('[data-undone]')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('Mark this step as Not Started?')) return;
    await api(`/api/candidates/${id}/checklist/${step.id}`, { method:'PATCH', body: JSON.stringify({ status:'not_started', result:null }) });
    await reload();
  });

  // Result + notes form
  el.querySelector('[data-step-result]')?.addEventListener('change', async (e) => {
    await api(`/api/candidates/${id}/checklist/${step.id}`, { method:'PATCH', body: JSON.stringify({ result: e.target.value }) });
  });
  el.querySelector('[data-step-notes]')?.addEventListener('change', async (e) => {
    await api(`/api/candidates/${id}/checklist/${step.id}`, { method:'PATCH', body: JSON.stringify({ notes: e.target.value }) });
  });

  // Action buttons (query, mark complete/in-progress)
  el.querySelectorAll('[data-step-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.stepAction;
      if (action === 'complete') {
        const notesEl = el.querySelector('[data-step-notes]');
        const resultEl = el.querySelector('[data-step-result]');
        const payload = { status: 'complete' };
        if (notesEl) payload.notes = notesEl.value;
        if (resultEl) payload.result = resultEl.value;
        const res = await api(`/api/candidates/${id}/checklist/${step.id}`, { method:'PATCH', body: JSON.stringify(payload) });
        const d = await res.json();
        if (!res.ok) { alert(d.error); return; }
        await reload();
      } else if (action === 'in_progress') {
        await api(`/api/candidates/${id}/checklist/${step.id}`, { method:'PATCH', body: JSON.stringify({ status:'in_progress' }) });
        await reload();
      } else if (action === 'molly') {
        btn.textContent = 'Asking Molly…'; btn.disabled = true;
        const res = await api(`/api/candidates/${id}/molly/${step.id}`, { method:'POST', body:'{}' });
        const d = await res.json();
        if (!res.ok) { alert(d.error); btn.textContent = 'Ask Molly Again'; btn.disabled = false; return; }
        await reload();
      }
    });
  });

  return el;
}

function buildStepResult(step, data) {
  return `<div class="grid sm:grid-cols-2 gap-3">
    <div>
      <label class="lbl">Result</label>
      <select data-step-result class="field text-sm" value="${data.result||''}">
        <option value="">— Select —</option>
        <option value="clear" ${data.result==='clear'?'selected':''}>Clear / Pass</option>
        <option value="flagged" ${data.result==='flagged'?'selected':''}>Flagged / Fail</option>
        <option value="pending" ${data.result==='pending'?'selected':''}>Pending</option>
        <option value="n_a" ${data.result==='n_a'?'selected':''}>N/A</option>
      </select>
    </div>
    <div>
      <label class="lbl">Notes</label>
      <input data-step-notes class="field text-sm" value="${esc(data.notes||'')}" placeholder="Reference #, date, notes…"/>
    </div>
  </div>
  ${data.result === 'clear' ? '<div class="px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">✓ Result: Clear / Pass</div>' : data.result === 'flagged' ? '<div class="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">⚠ Result: Flagged / Fail — review required</div>' : ''}
  ${data.completedAt ? `<p class="text-xs text-gray-400">Completed ${fmt(data.completedAt)} by ${esc(data.completedBy||'Admin')}</p>` : ''}`;
}

function buildStepActions(step, data) {
  const queryBtns = (step.queryButtons||[]).map(q =>
    `<button class="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 font-medium">${esc(q)}</button>`
  ).join('');
  const mainBtn = data.status !== 'complete'
    ? `<button data-step-action="complete" class="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm font-semibold">Mark Complete</button>
       <button data-step-action="in_progress" class="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50">In Progress</button>`
    : '';
  return `<div class="flex flex-wrap gap-2">${queryBtns}${mainBtn}</div>`;
}

function buildMollySection(step, data) {
  const mollyBtn = `<button data-step-action="molly" class="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold">🤖 Ask Molly Again</button>`;
  if (!data.mollySummary) return cfg.hasMolly ? mollyBtn : '';
  const m = data.mollySummary;
  const badgeColor = m.badge === 'Pass' ? 'bg-green-100 text-green-700' : m.badge === 'Fail' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600';
  return `<div class="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-2">
    <div class="flex items-center gap-2 text-xs font-semibold text-purple-700">
      🤖 Molly Summary · ${fmtDate(m.generatedAt)} · <span class="pill ${badgeColor}">${m.badge||'Pending'}</span>
    </div>
    <p class="text-sm font-medium">${esc(m.oneLine)}</p>
    <ul class="text-xs text-gray-600 space-y-1">${(m.bullets||[]).map(b=>`<li>• ${esc(b)}</li>`).join('')}</ul>
  </div>${cfg.hasMolly ? mollyBtn : ''}`;
}

// ── Application tab ──────────────────────────────────────────────────────────
function renderApplication() {
  const app = candidate.application;
  if (!app) { document.getElementById('appNotSubmitted').classList.remove('hidden'); document.getElementById('appData').innerHTML=''; return; }
  document.getElementById('appNotSubmitted').classList.add('hidden');
  const row = (label, value) => {
    if (Array.isArray(value)) value = value.join(', ');
    if (!value) value = '—';
    return `<div class="flex justify-between gap-3 py-1.5 border-b border-gray-100 text-sm">
      <span class="text-gray-500">${esc(label)}</span><span class="font-medium text-right">${esc(String(value))}</span></div>`;
  };
  const sec = (title, html) => `<div><h4 class="font-bold text-accent-600 text-sm mb-2">${esc(title)}</h4>${html}</div>`;
  document.getElementById('appData').innerHTML = [
    sec('Experience', row('1+ yr CDL experience',app.hasMinimumExperience)+row('Years',app.yearsExperience)+row('Equipment types',app.equipmentTypes)+row('CDL Class',app.cdlClass)+row('Restrictions',app.restrictions)),
    sec('Personal', row('First name',app.firstName)+row('Last name',app.lastName)+row('DOB',app.dateOfBirth)+row('Email',app.email)+row('Phone',app.phone)),
    sec('Address', row('Street',app.address)+row('City',app.city)+row('State',app.state)+row('Zip',app.zipcode)),
    sec('CDL Info', row('CDL #',app.cdlNumber)+row('CDL State',app.cdlState)+row('Issued',app.cdlIssuedDate)+row('Expires',app.cdlExpirationDate)+row('Endorsements',app.endorsements)),
    sec('Compliance', row('Accidents 3yr',app.accidents3Years)+row('DUI/DWI',app.duiConviction)+row('SAP',app.sapProgram)),
    sec('Position', row('Position type',app.positionType)+row('Referral',app.referralSource)),
    ...(app.employers||[]).map((e,i)=>sec(`Employer ${i+1}`,row('Company',e.companyName)+row('DOT #',e.dotNumber)+row('MC #',e.mcNumber)+row('Phone',e.phone)+row('Position',e.positionHeld)+row('From',e.fromDate)+row('To',e.toDate)+row('Reason',e.reasonForLeaving))),
    sec('Consents', row('PSP',app.consentPsp?'✓ Agreed':'No')+row('MVR',app.consentMvr?'✓ Agreed':'No')+row('Employment',app.consentEmployment?'✓ Agreed':'No')),
    candidate.driverFiles?.signature ? `<div>${sec('Signature','')}<img src="/api/candidates/${id}/signature" class="max-h-24 border rounded-lg bg-white"/></div>` : '',
  ].join('<hr class="border-gray-100">');
}

// ── PEV tab ──────────────────────────────────────────────────────────────────
function renderPev() {
  const c = candidate;
  const pev = c.pev || [];
  document.getElementById('pevEmpty').classList.toggle('hidden', pev.length > 0);
  document.getElementById('pevWrap').innerHTML = '';
  pev.forEach((entry, idx) => {
    const el = document.createElement('div');
    el.className = 'border border-gray-200 rounded-xl p-4';
    el.innerHTML = `<div class="flex items-center justify-between mb-3 flex-wrap gap-2">
      <span class="font-semibold">${esc(entry.companyName||'Unknown Employer')}</span>
      <span class="pill ${PEV_COLORS[entry.status||'not_started']}">${PEV_LABELS[entry.status||'not_started']}</span>
    </div>
    <div class="grid sm:grid-cols-2 gap-3">
      <div><label class="lbl">Status</label>
        <select data-pev-status="${idx}" class="field text-sm">
          ${PEV_STATUS.map(s=>`<option value="${s}" ${entry.status===s?'selected':''}>${PEV_LABELS[s]}</option>`).join('')}
        </select></div>
      <div><label class="lbl">Verified Date</label>
        <input type="date" data-pev-date="${idx}" class="field text-sm" value="${entry.verifiedDate||''}"/></div>
      <div class="sm:col-span-2"><label class="lbl">Notes</label>
        <textarea data-pev-notes="${idx}" rows="2" class="field text-sm resize-none">${esc(entry.notes||'')}</textarea></div>
    </div>
    <button data-pev-save="${idx}" class="mt-3 px-4 py-1.5 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm font-semibold">Save</button>`;
    document.getElementById('pevWrap').appendChild(el);
    el.querySelector(`[data-pev-save="${idx}"]`).addEventListener('click', async () => {
      await api(`/api/candidates/${id}/pev/${idx}`, { method:'PATCH', body: JSON.stringify({
        status: el.querySelector(`[data-pev-status="${idx}"]`).value,
        notes: el.querySelector(`[data-pev-notes="${idx}"]`).value,
        verifiedDate: el.querySelector(`[data-pev-date="${idx}"]`).value || null,
      })});
      await reload();
    });
  });
}

// ── Activity tab ─────────────────────────────────────────────────────────────
function renderActivity() {
  const activity = (candidate.activity || []).slice().reverse();
  document.getElementById('activityList').innerHTML = activity.length
    ? activity.map(a => `<div class="flex gap-3 text-sm py-2 border-b border-gray-100">
        <span class="text-lg flex-shrink-0">${ACTIVITY_ICONS[a.type]||'•'}</span>
        <div class="flex-1 min-w-0">
          <p>${esc(a.note)}</p>
          <p class="text-xs text-gray-400 mt-0.5">${fmt(a.at)} — ${esc(a.by||'System')}</p>
        </div></div>`).join('')
    : '<p class="text-gray-400 text-sm">No activity yet.</p>';
}

document.getElementById('addNoteBtn').addEventListener('click', async () => {
  const note = document.getElementById('noteInput').value.trim();
  if (!note) return;
  await api(`/api/candidates/${id}/activity`, { method:'POST', body: JSON.stringify({note}) });
  document.getElementById('noteInput').value = '';
  await reload();
});
document.getElementById('noteInput').addEventListener('keydown', e => { if (e.key==='Enter') document.getElementById('addNoteBtn').click(); });

// ── Documents tab ─────────────────────────────────────────────────────────────
function renderDocuments() {
  const c = candidate;
  const mainDefs = cfg.mainDocs || [];
  const otherDefs = cfg.otherDocs || [];
  const missing = mainDefs.filter(d => !c.documents?.[d.id]).length;
  const otherCount = otherDefs.filter(d => c.documents?.[d.id]).length;
  document.getElementById('missingCount').textContent = missing;
  document.getElementById('otherCount').textContent = otherCount;
  document.getElementById('mainDocs').innerHTML = mainDefs.map(d => docCard(d, c.documents?.[d.id])).join('');
  document.getElementById('otherDocs').innerHTML = otherDefs.map(d => docCard(d, c.documents?.[d.id])).join('');
  document.querySelectorAll('[data-upload-doc]').forEach(btn => {
    btn.addEventListener('click', () => { pendingDocUpload = { docType: btn.dataset.uploadDoc, label: btn.dataset.label }; document.getElementById('docUploadInput').click(); });
  });
  document.querySelectorAll('[data-view-doc]').forEach(btn => {
    btn.addEventListener('click', () => window.open(`/api/candidates/${id}/documents/${btn.dataset.viewDoc}/file`, '_blank'));
  });
  document.querySelectorAll('[data-remove-doc]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this document?')) return;
      await api(`/api/candidates/${id}/documents/${btn.dataset.removeDoc}`, { method:'DELETE', body:'{}' });
      await reload();
    });
  });
}

function docCard(def, meta) {
  if (meta) {
    return `<div class="border border-green-200 bg-green-50 rounded-xl p-3 text-sm">
      <p class="font-semibold mb-1 text-green-800 truncate">${esc(def.label)}</p>
      <p class="text-xs text-gray-500 mb-2 truncate">${esc(meta.name)}</p>
      <p class="text-xs text-gray-400 mb-3">${fmtDate(meta.uploadedAt)}</p>
      <div class="flex gap-2">
        <button data-view-doc="${def.id}" class="text-xs px-2 py-1 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-100">View</button>
        <button data-upload-doc="${def.id}" data-label="${esc(def.label)}" class="text-xs px-2 py-1 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Replace</button>
        <button data-remove-doc="${def.id}" class="text-xs px-2 py-1 text-red-500 hover:text-red-700">✕</button>
      </div>
    </div>`;
  }
  return `<div class="border-2 border-dashed border-gray-200 rounded-xl p-3 text-sm text-center">
    <span class="text-red-500 font-bold block mb-1">Missing</span>
    <p class="font-medium text-gray-700 mb-3">${esc(def.label)}</p>
    <button data-upload-doc="${def.id}" data-label="${esc(def.label)}" class="text-xs px-3 py-1.5 bg-accent-500 hover:bg-accent-600 text-white rounded-lg font-semibold">Upload</button>
  </div>`;
}

// File upload handler
document.getElementById('docUploadInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !pendingDocUpload) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const res = await api(`/api/candidates/${id}/documents/${pendingDocUpload.docType}`, {
      method: 'POST', body: JSON.stringify({ dataUrl: reader.result, name: file.name }),
    });
    if (!res.ok) { const d = await res.json(); alert(d.error||'Upload failed'); }
    else await reload();
    e.target.value = '';
    pendingDocUpload = null;
  };
  reader.readAsDataURL(file);
});

// Doc sub-tabs
document.getElementById('docTabMain').addEventListener('click', () => {
  document.getElementById('mainDocs').classList.remove('hidden');
  document.getElementById('otherDocs').classList.add('hidden');
  document.getElementById('docTabMain').className = 'px-3 py-1.5 rounded-md font-medium bg-white shadow-sm text-gray-800';
  document.getElementById('docTabOther').className = 'px-3 py-1.5 rounded-md font-medium text-gray-500';
});
document.getElementById('docTabOther').addEventListener('click', () => {
  document.getElementById('otherDocs').classList.remove('hidden');
  document.getElementById('mainDocs').classList.add('hidden');
  document.getElementById('docTabOther').className = 'px-3 py-1.5 rounded-md font-medium bg-white shadow-sm text-gray-800';
  document.getElementById('docTabMain').className = 'px-3 py-1.5 rounded-md font-medium text-gray-500';
});

// Telegram
document.getElementById('telegramBtn').addEventListener('click', async () => {
  const res = await api(`/api/telegram/${id}`, { method:'POST', body:'{}' });
  const d = await res.json();
  if (!res.ok) alert(d.error||'Telegram error');
  else alert('Sent to Telegram ✓');
});

// ── Sidebar actions ───────────────────────────────────────────────────────────
document.getElementById('advanceBtn').addEventListener('click', async () => {
  const curIdx = STAGES.indexOf(candidate.stage);
  if (curIdx < 0 || curIdx >= STAGES.length - 1) return;
  const nextStage = STAGES[curIdx + 1];
  const notes = document.getElementById('sideNotes').value.trim();
  const err = document.getElementById('advanceError');
  err.classList.add('hidden');
  const res = await api(`/api/candidates/${id}`, { method:'PATCH', body: JSON.stringify({ stage: nextStage, notes: notes || undefined }) });
  const d = await res.json();
  if (!res.ok) {
    let msg = d.error || 'Error';
    if (d.outstanding?.length) msg += '\n\nOutstanding:\n• ' + d.outstanding.join('\n• ');
    err.textContent = msg; err.classList.remove('hidden'); return;
  }
  document.getElementById('sideNotes').value = '';
  await reload();
});

document.getElementById('resendBtn').addEventListener('click', async () => {
  const res = await api(`/api/candidates/${id}/resend`, { method:'POST', body:'{}' });
  const d = await res.json();
  alert(d.link ? `Link resent. Share: ${d.link}` : 'Resent.');
  await reload();
});

document.getElementById('rejectBtn').addEventListener('click', async () => {
  if (!confirm(`Mark ${candidate.name} as Rejected?`)) return;
  await api(`/api/candidates/${id}`, { method:'PATCH', body: JSON.stringify({ stage:'Rejected' }) });
  await reload();
});

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    ['pipeline','application','pev','activity','documents'].forEach(t => {
      document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
    });
  });
});

init();
