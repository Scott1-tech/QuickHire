// QuickHire — company workdeck logic
const $ = (s) => document.querySelector(s);
const TOKEN_KEY = 'quickhire_admin_token';

let requiresPassword = false;

function adminHeaders() {
  const t = localStorage.getItem(TOKEN_KEY);
  return t ? { 'x-admin-token': t } : {};
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...adminHeaders(), ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
    throw new Error('Unauthorized');
  }
  return res;
}

function showLogin() {
  $('#loginView').classList.remove('hidden');
  $('#appView').classList.add('hidden');
  $('#logoutBtn').classList.add('hidden');
}
function showApp() {
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  if (requiresPassword) $('#logoutBtn').classList.remove('hidden');
  loadApplications();
}

async function init() {
  const cfg = await (await fetch('/api/config')).json();
  requiresPassword = cfg.requiresPassword;
  if (cfg.companyName) $('#companyName').textContent = cfg.companyName;

  if (!requiresPassword) return showApp();
  if (localStorage.getItem(TOKEN_KEY)) return showApp();
  showLogin();
}

// ---- Login ----------------------------------------------------------------
$('#loginBtn').addEventListener('click', doLogin);
$('#passwordInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
async function doLogin() {
  const password = $('#passwordInput').value;
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const { ok } = await res.json();
  if (ok) {
    localStorage.setItem(TOKEN_KEY, password);
    $('#loginError').classList.add('hidden');
    showApp();
  } else {
    $('#loginError').classList.remove('hidden');
  }
}
$('#logoutBtn').addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  showLogin();
});

// ---- Invite ---------------------------------------------------------------
$('#inviteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#inviteBtn');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  const data = Object.fromEntries(new FormData(e.target).entries());
  try {
    const res = await api('/api/invites', { method: 'POST', body: JSON.stringify(data) });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || 'Failed');
    $('#inviteLink').value = out.link;
    const emailMsg = out.email?.sent ? 'Email sent ✓' : `Email not sent (${out.email?.reason || 'n/a'})`;
    const smsMsg = out.sms?.sent ? ' · SMS sent ✓' : (data.phone ? ` · SMS not sent (${out.sms?.reason || 'n/a'})` : '');
    $('#inviteStatus').textContent = emailMsg + smsMsg + '. Share the link below if needed.';
    $('#inviteResult').classList.remove('hidden');
    e.target.reset();
    loadApplications();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send invite';
  }
});

$('#copyLink').addEventListener('click', () => {
  const el = $('#inviteLink');
  el.select();
  navigator.clipboard?.writeText(el.value);
  $('#copyLink').textContent = 'Copied!';
  setTimeout(() => ($('#copyLink').textContent = 'Copy'), 1500);
});

// ---- Applications table ---------------------------------------------------
$('#refreshBtn').addEventListener('click', loadApplications);

function statusBadge(status) {
  const map = {
    invited: 'bg-amber-100 text-amber-700',
    submitted: 'bg-green-100 text-green-700',
  };
  const label = status === 'submitted' ? 'Submitted' : 'Invited';
  return `<span class="px-2.5 py-1 rounded-full text-xs font-semibold ${map[status] || 'bg-gray-100 text-gray-600'}">${label}</span>`;
}

function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

async function loadApplications() {
  const body = $('#appsBody');
  body.innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center text-gray-400">Loading…</td></tr>`;
  try {
    const list = await (await api('/api/admin/applications')).json();
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center text-gray-400">No applications yet. Invite a driver to get started.</td></tr>`;
      return;
    }
    body.innerHTML = list
      .map(
        (r) => `
      <tr class="border-t border-gray-100 hover:bg-gray-50">
        <td class="px-6 py-3 font-medium">${esc(r.name)}</td>
        <td class="px-6 py-3 text-gray-600">${esc(r.email)}</td>
        <td class="px-6 py-3">${statusBadge(r.status)}</td>
        <td class="px-6 py-3 text-gray-500">${fmt(r.submittedAt || r.createdAt)}</td>
        <td class="px-6 py-3 text-right">
          ${
            r.status === 'submitted'
              ? `<button data-id="${r.id}" class="viewBtn text-accent-600 hover:text-accent-700 font-semibold">View</button>`
              : `<button data-link="${location.origin}/apply.html?token=${r.token}" class="copyRowLink text-gray-500 hover:text-gray-700 font-semibold">Copy link</button>`
          }
        </td>
      </tr>`
      )
      .join('');

    body.querySelectorAll('.viewBtn').forEach((b) =>
      b.addEventListener('click', () => openDetail(b.dataset.id))
    );
    body.querySelectorAll('.copyRowLink').forEach((b) =>
      b.addEventListener('click', () => {
        navigator.clipboard?.writeText(b.dataset.link);
        b.textContent = 'Copied!';
        setTimeout(() => (b.textContent = 'Copy link'), 1500);
      })
    );
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center text-red-500">${esc(err.message)}</td></tr>`;
  }
}

// ---- Detail modal ---------------------------------------------------------
$('#closeDetail').addEventListener('click', () => $('#detailModal').classList.add('hidden'));
$('#detailModal').addEventListener('click', (e) => {
  if (e.target === $('#detailModal')) $('#detailModal').classList.add('hidden');
});

function row(label, value) {
  if (value === undefined || value === null || value === '') value = '—';
  if (Array.isArray(value)) value = value.length ? value.join(', ') : '—';
  return `<div class="flex justify-between gap-4 py-1.5 border-b border-gray-100">
    <span class="text-gray-500">${esc(label)}</span>
    <span class="font-medium text-right">${esc(String(value))}</span></div>`;
}

function section(title, html) {
  return `<div><h4 class="font-bold text-accent-600 mb-2">${esc(title)}</h4><div class="text-sm">${html}</div></div>`;
}

async function openDetail(id) {
  const modal = $('#detailModal');
  $('#detailBody').innerHTML = `<p class="text-gray-400">Loading…</p>`;
  modal.classList.remove('hidden');
  const r = await (await api('/api/admin/applications/' + id)).json();
  const a = r.application || {};
  $('#detailTitle').textContent = `${r.name} — Application`;

  const fileLink = (field, label) =>
    r.files?.[field]
      ? `<a href="/api/admin/files/${id}/${field}" target="_blank" class="text-accent-600 underline">${label}</a>`
      : '—';

  const employers = (a.employers || [])
    .map(
      (emp, i) => section(
        `Employer ${i + 1}`,
        row('Company', emp.companyName) + row('DOT #', emp.dotNumber) + row('MC #', emp.mcNumber) +
        row('Phone', emp.phone) + row('Position', emp.positionHeld) +
        row('From', emp.fromDate) + row('To', emp.toDate) + row('Reason for leaving', emp.reasonForLeaving)
      )
    )
    .join('');

  $('#detailBody').innerHTML = [
    section('Experience',
      row('1+ yr CDL experience', a.hasMinimumExperience) +
      row('Years of experience', a.yearsExperience) +
      row('Equipment types', a.equipmentTypes)),
    section('Documents',
      row('CDL Front', fileLink('cdlFront', 'View file')) +
      row('CDL Back', fileLink('cdlBack', 'View file')) +
      row('Medical Card', fileLink('medicalCard', 'View file'))),
    section('Personal',
      row('First name', a.firstName) + row('Last name', a.lastName) +
      row('Date of birth', a.dateOfBirth) + row('Email', a.email) + row('Phone', a.phone)),
    section('Address',
      row('Address', a.address) + row('City', a.city) + row('State', a.state) + row('Zip', a.zipcode)),
    section('CDL Information',
      row('CDL number', a.cdlNumber) + row('CDL state', a.cdlState) +
      row('Issued', a.cdlIssuedDate) + row('Expires', a.cdlExpirationDate) +
      row('Endorsements', a.endorsements)),
    section('Compliance',
      row('Accidents (3 yrs)', a.accidents3Years) +
      row('DUI/DWI conviction', a.duiConviction) +
      row('SAP program completed', a.sapProgram)),
    section('Position & Referral',
      row('Position type', a.positionType) + row('Heard about us', a.referralSource)),
    employers,
    section('Consents',
      row('PSP Disclosure', a.consentPsp ? 'Agreed' : 'No') +
      row('MVR Disclosure', a.consentMvr ? 'Agreed' : 'No') +
      row('Employment Verification', a.consentEmployment ? 'Agreed' : 'No')),
    section('Signature',
      row('Mode', r.signature?.mode) +
      (r.files?.signature
        ? `<div class="mt-2"><img src="/api/admin/files/${id}/signature" class="border rounded-lg max-h-32 bg-white" /></div>`
        : row('Typed name', r.signature?.name))),
    `<p class="text-xs text-gray-400">Submitted ${fmt(r.submittedAt)}</p>`,
  ].join('<hr class="border-gray-100">');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

init();
