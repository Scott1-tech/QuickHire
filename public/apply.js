// QuickHire — driver application logic
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const token = new URLSearchParams(location.search).get('token');

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

// ---- Central state --------------------------------------------------------
const state = {
  hasMinimumExperience: '', yearsExperience: '', equipmentTypes: [],
  firstName: '', lastName: '', dateOfBirth: '', email: '', phone: '',
  address: '', city: '', state: '', zipcode: '',
  cdlNumber: '', cdlState: '', cdlIssuedDate: '', cdlExpirationDate: '', endorsements: [],
  accidents3Years: '', duiConviction: '', sapProgram: '',
  positionType: '', referralSource: '',
  employers: [],
  consentPsp: false, consentMvr: false, consentEmployment: false,
};
const files = { cdlFront: null, cdlBack: null, medicalCard: null };
let signature = { mode: 'draw', dataUrl: null, name: '', confirmed: false };

// ---- Gate: validate token, prefill ----------------------------------------
async function gate() {
  if (!token) return showGateError('No application token in the link.');
  const res = await fetch('/api/apply/' + token);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    return showGateError(e.error);
  }
  const invite = await res.json();
  if (invite.status === 'submitted') {
    return showGateError('This application has already been submitted.');
  }
  // Prefill name + email from the invite
  const parts = (invite.name || '').trim().split(/\s+/);
  $('#firstName').value = parts.shift() || '';
  $('#lastName').value = parts.join(' ');
  $('#email').value = invite.email || '';
  $('#phone').value = invite.phone || '';
  syncInputsToState();

  $('#gateLoading').classList.add('hidden');
  $('#formWrap').classList.remove('hidden');
}
function showGateError(msg) {
  $('#gateLoading').classList.add('hidden');
  if (msg) $('#gateErrorMsg').textContent = msg;
  $('#gateError').classList.remove('hidden');
}

// ---- Populate state dropdowns ---------------------------------------------
$$('select[data-states]').forEach((sel) => {
  sel.innerHTML = '<option value="">Select…</option>' + US_STATES.map((s) => `<option>${s}</option>`).join('');
});

// ---- Plain inputs / selects -> state --------------------------------------
const SIMPLE_FIELDS = ['yearsExperience','firstName','lastName','dateOfBirth','email','phone','address','city','state','zipcode','cdlNumber','cdlState','cdlIssuedDate','cdlExpirationDate','referralSource'];
function syncInputsToState() {
  SIMPLE_FIELDS.forEach((id) => { const el = $('#' + id); if (el) state[id] = el.value; });
}
SIMPLE_FIELDS.forEach((id) => {
  const el = $('#' + id);
  if (el) el.addEventListener('input', () => { state[id] = el.value; });
});

// ---- Single-choice toggles (Yes/No, position type) ------------------------
$$('[data-toggle]').forEach((group) => {
  const key = group.dataset.toggle;
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    state[key] = btn.dataset.value;
    $$('button', group).forEach((b) => b.classList.toggle('selected', b === btn));
  });
});

// ---- Multi-select pills (equipment, endorsements) -------------------------
$$('[data-multi]').forEach((group) => {
  const key = group.dataset.multi;
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    const v = btn.dataset.value;
    const i = state[key].indexOf(v);
    if (i === -1) state[key].push(v);
    else state[key].splice(i, 1);
    btn.classList.toggle('selected', i === -1);
  });
});

// ---- File uploads ---------------------------------------------------------
$$('[data-upload]').forEach((wrap) => {
  const field = wrap.dataset.upload;
  const input = $('input[type=file]', wrap);
  const label = $('.filename', wrap);
  input.addEventListener('change', () => {
    const f = input.files[0];
    if (!f) { files[field] = null; label.textContent = 'No file chosen'; return; }
    const reader = new FileReader();
    reader.onload = () => { files[field] = { name: f.name, dataUrl: reader.result }; };
    reader.readAsDataURL(f);
    label.textContent = f.name;
    label.classList.add('text-green-600', 'font-medium');
  });
});

// ---- Previous employers (dynamic) -----------------------------------------
const employersEl = $('#employers');
function employerTemplate(i) {
  const el = document.createElement('div');
  el.className = 'border border-gray-200 rounded-xl p-4 space-y-3';
  el.dataset.employer = i;
  el.innerHTML = `
    <div class="flex items-center justify-between">
      <h3 class="font-semibold">Employer ${i + 1}</h3>
      ${i > 0 ? `<button type="button" class="removeEmp text-sm text-red-500 hover:text-red-700">Remove</button>` : ''}
    </div>
    <div class="grid sm:grid-cols-2 gap-3">
      <div class="sm:col-span-2"><label class="lbl">Company Name</label><input data-f="companyName" class="field" /></div>
      <div><label class="lbl">DOT #</label><input data-f="dotNumber" class="field" /></div>
      <div><label class="lbl">MC #</label><input data-f="mcNumber" class="field" /></div>
      <div><label class="lbl">Phone</label><input data-f="phone" class="field" /></div>
      <div><label class="lbl">Position Held</label><input data-f="positionHeld" class="field" /></div>
      <div><label class="lbl">From</label><input data-f="fromDate" type="date" class="field" /></div>
      <div><label class="lbl">To</label><input data-f="toDate" type="date" class="field" /></div>
      <div class="sm:col-span-2"><label class="lbl">Reason for Leaving</label><input data-f="reasonForLeaving" class="field" /></div>
    </div>`;
  return el;
}
function collectEmployers() {
  state.employers = $$('[data-employer]', employersEl).map((block) => {
    const obj = {};
    $$('input[data-f]', block).forEach((inp) => { obj[inp.dataset.f] = inp.value; });
    return obj;
  });
}
function addEmployer() {
  const i = $$('[data-employer]', employersEl).length;
  const el = employerTemplate(i);
  employersEl.appendChild(el);
  el.addEventListener('input', collectEmployers);
  const rm = $('.removeEmp', el);
  if (rm) rm.addEventListener('click', () => { el.remove(); renumberEmployers(); collectEmployers(); });
}
function renumberEmployers() {
  $$('[data-employer]', employersEl).forEach((b, idx) => {
    b.dataset.employer = idx;
    $('h3', b).textContent = `Employer ${idx + 1}`;
  });
}
$('#addEmployer').addEventListener('click', addEmployer);
addEmployer(); // start with Employer 1

// ---- Step navigation ------------------------------------------------------
function setStep(n) {
  $('#step1').classList.toggle('hidden', n !== 1);
  $('#step2').classList.toggle('hidden', n !== 2);
  $('#stepLabel').textContent = n === 1 ? 'Step 1 of 2 · Qualification' : 'Step 2 of 2 · Consents & Signature';
  $('#stepPct').textContent = n === 1 ? '50%' : '100%';
  $('#progressBar').style.width = n === 1 ? '50%' : '100%';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('#toStep2').addEventListener('click', () => {
  collectEmployers();
  const missing = validateStep1();
  if (missing) { alert('Please complete: ' + missing); return; }
  setStep(2);
});
$('#backToStep1').addEventListener('click', () => setStep(1));

function validateStep1() {
  const req = [];
  if (!state.hasMinimumExperience) req.push('CDL experience question');
  if (!$('#firstName').value.trim()) req.push('First name');
  if (!$('#lastName').value.trim()) req.push('Last name');
  if (!$('#dateOfBirth').value) req.push('Date of birth');
  if (!$('#email').value.trim()) req.push('Email');
  if (!$('#phone').value.trim()) req.push('Phone');
  if (!state.accidents3Years) req.push('Accidents question');
  if (!state.duiConviction) req.push('DUI/DWI question');
  if (!state.sapProgram) req.push('SAP program question');
  if (!state.positionType) req.push('Position type');
  return req.length ? req.join(', ') : null;
}

// ---- Signature ------------------------------------------------------------
const canvas = $('#sigCanvas');
const ctx = canvas.getContext('2d');
ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#111827';
let drawing = false, hasDrawn = false;

function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  const p = e.touches ? e.touches[0] : e;
  return { x: (p.clientX - r.left) * (canvas.width / r.width), y: (p.clientY - r.top) * (canvas.height / r.height) };
}
function startDraw(e) { e.preventDefault(); drawing = true; const { x, y } = canvasPos(e); ctx.beginPath(); ctx.moveTo(x, y); }
function moveDraw(e) { if (!drawing) return; e.preventDefault(); const { x, y } = canvasPos(e); ctx.lineTo(x, y); ctx.stroke(); hasDrawn = true; }
function endDraw() { drawing = false; }

canvas.addEventListener('pointerdown', startDraw);
canvas.addEventListener('pointermove', moveDraw);
window.addEventListener('pointerup', endDraw);

function setSigMode(mode) {
  signature.mode = mode;
  $('#sigModeDraw').classList.toggle('bg-accent-500', mode === 'draw');
  $('#sigModeDraw').classList.toggle('text-white', mode === 'draw');
  $('#sigModeDraw').classList.toggle('text-gray-700', mode !== 'draw');
  $('#sigModeType').classList.toggle('bg-accent-500', mode === 'type');
  $('#sigModeType').classList.toggle('text-white', mode === 'type');
  $('#sigModeType').classList.toggle('text-gray-700', mode !== 'type');
  $('#sigDrawWrap').classList.toggle('hidden', mode !== 'draw');
  $('#sigTypeWrap').classList.toggle('hidden', mode !== 'type');
  unconfirmSignature();
}
$('#sigModeDraw').addEventListener('click', () => setSigMode('draw'));
$('#sigModeType').addEventListener('click', () => setSigMode('type'));
$('#sigTypeInput').addEventListener('input', unconfirmSignature);

function clearSignature() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hasDrawn = false;
  $('#sigTypeInput').value = '';
  unconfirmSignature();
}
$('#sigClear').addEventListener('click', clearSignature);

function unconfirmSignature() {
  signature.confirmed = false;
  signature.dataUrl = null;
  $('#sigConfirmed').classList.add('hidden');
  refreshSubmitState();
}

$('#sigConfirm').addEventListener('click', () => {
  if (signature.mode === 'draw') {
    if (!hasDrawn) { alert('Please draw your signature first.'); return; }
    signature.dataUrl = canvas.toDataURL('image/png');
    signature.name = '';
  } else {
    const name = $('#sigTypeInput').value.trim();
    if (!name) { alert('Please type your name first.'); return; }
    // Render typed name to an image so it stores like a signature
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "48px 'Dancing Script', cursive";
    ctx.fillStyle = '#111827';
    ctx.fillText(name, 20, 110);
    signature.dataUrl = canvas.toDataURL('image/png');
    signature.name = name;
  }
  signature.confirmed = true;
  $('#sigConfirmed').classList.remove('hidden');
  refreshSubmitState();
});

// ---- Consents -> state + submit gating ------------------------------------
['consentPsp', 'consentMvr', 'consentEmployment'].forEach((id) => {
  $('#' + id).addEventListener('change', (e) => { state[id] = e.target.checked; refreshSubmitState(); });
});

function readyToSubmit() {
  return state.consentPsp && state.consentMvr && state.consentEmployment && signature.confirmed;
}
function refreshSubmitState() {
  const btn = $('#submitApp');
  const ready = readyToSubmit();
  btn.disabled = !ready;
  btn.className = ready
    ? 'flex-1 px-8 py-4 rounded-xl font-semibold text-lg transition-colors bg-primary-500 hover:bg-primary-600 text-white shadow-lg shadow-primary-500/25'
    : 'flex-1 px-8 py-4 rounded-xl font-semibold text-lg transition-colors bg-gray-200 text-gray-400 cursor-not-allowed';
  const hints = [];
  if (!(state.consentPsp && state.consentMvr && state.consentEmployment)) hints.push('agree to all three consents');
  if (!signature.confirmed) hints.push('confirm your signature');
  $('#submitHint').textContent = hints.length ? 'To submit, please ' + hints.join(' and ') + '.' : '';
}

// ---- Submit ---------------------------------------------------------------
$('#submitApp').addEventListener('click', async () => {
  if (!readyToSubmit()) return;
  syncInputsToState();
  collectEmployers();
  const btn = $('#submitApp');
  btn.disabled = true;
  btn.textContent = 'Submitting…';
  try {
    const res = await fetch('/api/apply/' + token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application: state, files, signature: { mode: signature.mode, name: signature.name, dataUrl: signature.dataUrl } }),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || 'Submission failed');
    $('#step2').classList.add('hidden');
    $('#step1').classList.add('hidden');
    $('#successView').classList.remove('hidden');
    $('#stepPct').textContent = 'Done';
    $('#progressBar').style.width = '100%';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
    btn.textContent = 'Submit Application';
  }
});

// ---- Init -----------------------------------------------------------------
setSigMode('draw');
refreshSubmitState();
gate();
