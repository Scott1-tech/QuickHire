// QuickHire — Driver Application Form
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const token = new URLSearchParams(location.search).get('token');

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  hasMinimumExperience:'', yearsExperience:'', equipmentTypes:[],
  firstName:'', lastName:'', dateOfBirth:'', email:'', phone:'',
  address:'', city:'', state:'', zipcode:'',
  cdlNumber:'', cdlState:'', cdlClass:'', cdlIssuedDate:'', cdlExpirationDate:'', medicalCardExpiration:'',
  endorsements:[], restrictions:[],
  accidents3Years:'', duiConviction:'', sapProgram:'',
  positionType:'', referralSource:'',
  employers:[],
  consentPsp:false, consentMvr:false, consentEmployment:false,
};
const files = { cdlFront:null, cdlBack:null, medicalCard:null };
let sig = { mode:'draw', dataUrl:null, name:'', confirmed:false };

// ── Gate / prefill ─────────────────────────────────────────────────────────
async function gate() {
  if (!token) return showGateError('No application token provided. Use the link from your invitation email.');
  const res = await fetch('/api/apply/' + token);
  if (!res.ok) { const e = await res.json().catch(()=>({})); return showGateError(e.error); }
  const invite = await res.json();
  if (invite.status === 'submitted') return showGateError('This application has already been submitted. Contact the company if you believe this is an error.');
  const parts = (invite.name || '').trim().split(/\s+/);
  $('#firstName').value = parts.shift() || '';
  $('#lastName').value = parts.join(' ');
  $('#email').value = invite.email || '';
  $('#phone').value = invite.phone || '';
  syncSimpleInputs();
  $('#gateLoading').classList.add('hidden');
  $('#formWrap').classList.remove('hidden');
}
function showGateError(msg) {
  $('#gateLoading').classList.add('hidden');
  if (msg) $('#gateErrorMsg').textContent = msg;
  $('#gateError').classList.remove('hidden');
}

// ── Populate state dropdowns ─────────────────────────────────────────────────
$$('select[data-states]').forEach(sel => {
  sel.innerHTML = '<option value="">Select…</option>' + US_STATES.map(s => `<option>${s}</option>`).join('');
});

// ── Simple inputs ─────────────────────────────────────────────────────────────
const SIMPLE_FIELDS = ['yearsExperience','firstName','lastName','dateOfBirth','email','phone',
  'address','city','state','zipcode','cdlNumber','cdlState','cdlClass',
  'cdlIssuedDate','cdlExpirationDate','medicalCardExpiration','referralSource'];

function syncSimpleInputs() {
  SIMPLE_FIELDS.forEach(id => { const el = $('#' + id); if (el) state[id] = el.value; });
}
SIMPLE_FIELDS.forEach(id => {
  const el = $('#' + id);
  if (el) el.addEventListener('input', () => { state[id] = el.value; });
});

// ── Toggle buttons (Yes/No, position type) ───────────────────────────────────
$$('[data-toggle]').forEach(group => {
  const key = group.dataset.toggle;
  group.addEventListener('click', e => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    state[key] = btn.dataset.value;
    $$('button', group).forEach(b => b.classList.toggle('selected', b === btn));
  });
});

// ── Multi-select pills ────────────────────────────────────────────────────────
$$('[data-multi]').forEach(group => {
  const key = group.dataset.multi;
  group.addEventListener('click', e => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    const v = btn.dataset.value;
    const i = state[key].indexOf(v);
    if (i === -1) state[key].push(v); else state[key].splice(i, 1);
    btn.classList.toggle('selected', i === -1);
  });
});

// ── File uploads ──────────────────────────────────────────────────────────────
$$('[data-upload]').forEach(wrap => {
  const field = wrap.dataset.upload;
  const input = $('input[type=file]', wrap);
  const lbl = $('.filename', wrap);
  input.addEventListener('change', () => {
    const f = input.files[0];
    if (!f) { files[field] = null; lbl.textContent = 'No file chosen'; lbl.className = 'filename text-xs text-gray-500 mt-2 truncate'; return; }
    const reader = new FileReader();
    reader.onload = () => {
      files[field] = { name: f.name, dataUrl: reader.result };
      if (field === 'cdlFront') runOcr(reader.result);
    };
    reader.readAsDataURL(f);
    lbl.textContent = f.name;
    lbl.className = 'filename text-xs text-green-600 font-medium mt-2 truncate';
  });
});

// ── OCR (Tesseract.js) ────────────────────────────────────────────────────────
async function runOcr(dataUrl) {
  if (!window.Tesseract) return; // library not loaded yet — skip silently
  const statusWrap = $('#ocrStatus');
  const statusText = $('#ocrStatusText');
  statusWrap.classList.remove('hidden');
  statusText.textContent = 'Reading CDL…';
  try {
    const { data } = await Tesseract.recognize(dataUrl, 'eng', {
      logger: m => { if (m.status === 'recognizing text') statusText.textContent = `Reading CDL… ${Math.round((m.progress||0)*100)}%`; },
    });
    statusText.textContent = 'CDL read — applying auto-fill…';
    applyOcrFields(data.text, data.words || []);
    setTimeout(() => statusWrap.classList.add('hidden'), 2000);
  } catch (e) {
    statusText.textContent = 'OCR could not read the image — please fill fields manually.';
    setTimeout(() => statusWrap.classList.add('hidden'), 3000);
  }
}

function applyOcrFields(text, words) {
  // Normalize text: collapse whitespace, upper-case for matching
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const upper = text.toUpperCase();

  // Helper to check a word's confidence
  const lowConf = (wordText) => {
    const w = words.find(w => w.text.replace(/[^A-Z0-9]/gi,'').toLowerCase() === wordText.replace(/[^A-Z0-9]/gi,'').toLowerCase());
    return w ? w.confidence < 70 : true;
  };
  const flagField = (id) => {
    const el = $('#' + id);
    if (el) el.classList.add('ocr-warn');
    const warn = $('#warn-' + id);
    if (warn) warn.classList.add('show');
  };
  const fill = (id, value, confidence = 80) => {
    const el = $('#' + id);
    if (!el || !value) return;
    el.value = value;
    state[id] = value;
    if (confidence < 70) flagField(id);
  };

  // CDL State: often in header (e.g. "NORTH CAROLINA DRIVER LICENSE")
  const stateAbbr = extractState(lines);
  if (stateAbbr) { fill('cdlState', stateAbbr, 90); fill('state', stateAbbr, 90); }

  // CDL Number: look for "DL ", "LIC ", "NO.", or a standalone alphanumeric code
  const dlNum = extractDlNumber(text);
  if (dlNum) fill('cdlNumber', dlNum, lowConf(dlNum) ? 60 : 85);

  // CDL Class: look for "CLASS A", "CLASS B", "CLASS C"
  const cls = upper.match(/CLASS\s+([ABC])/);
  if (cls) fill('cdlClass', cls[1], 85);

  // DOB: look for "DOB", "DATE OF BIRTH", followed by a date
  const dob = extractDate(text, /DOB[:\s]+(.{6,12})|DATE OF BIRTH[:\s]+(.{6,12})/i);
  if (dob) fill('dateOfBirth', dob, 75);

  // Issue date: "ISS", "ISSUED"
  const issued = extractDate(text, /ISS(?:UED)?[:\s]+(.{6,12})/i);
  if (issued) fill('cdlIssuedDate', issued, 75);

  // Expiration date: "EXP", "EXPIRES", "EXPIRATION"
  const exp = extractDate(text, /EXP(?:IRES|IRATION)?[:\s]+(.{6,12})/i);
  if (exp) fill('cdlExpirationDate', exp, 75);

  // Name: many CDLs have "LN FN" or just the name on the first or second line
  const name = extractName(lines);
  if (name) {
    const parts = name.split(/,|\s+/);
    const last = parts[0]?.trim();
    const first = parts.slice(1).join(' ').trim() || parts[0];
    if (first && !$('#firstName').value) fill('firstName', toTitle(first), 70);
    if (last && !$('#lastName').value) fill('lastName', toTitle(last), 70);
  }

  // Endorsements from CDL (look for "ENDORSEMENTS" followed by codes)
  const endLine = lines.find(l => /ENDORSEMENTS?/i.test(l));
  if (endLine) {
    const codes = endLine.match(/[HNPSTX]/g) || [];
    codes.forEach(code => {
      const key = 'endorsements';
      if (!state[key].includes(code)) {
        state[key].push(code);
        $$(`[data-multi="endorsements"] button[data-value="${code}"]`).forEach(b => b.classList.add('selected'));
      }
    });
  }

  // Restrictions from CDL
  const restLine = lines.find(l => /RESTRICT/i.test(l));
  if (restLine) {
    const codes = restLine.match(/[BCEFGKLMNOVWX]/g) || [];
    codes.forEach(code => {
      const key = 'restrictions';
      if (!state[key].includes(code)) {
        state[key].push(code);
        $$(`[data-multi="restrictions"] button[data-value="${code}"]`).forEach(b => b.classList.add('selected'));
      }
    });
  }
}

function extractState(lines) {
  const stateNames = { 'NORTH CAROLINA':'NC','SOUTH CAROLINA':'SC','TEXAS':'TX','CALIFORNIA':'CA','FLORIDA':'FL','NEW YORK':'NY','GEORGIA':'GA','VIRGINIA':'VA','TENNESSEE':'TN','OHIO':'OH','ILLINOIS':'IL','PENNSYLVANIA':'PA','MICHIGAN':'MI','ARIZONA':'AZ','COLORADO':'CO','WASHINGTON':'WA','OREGON':'OR','NEVADA':'NV','UTAH':'UT','MINNESOTA':'MN','WISCONSIN':'WI','INDIANA':'IN','MISSOURI':'MO','KENTUCKY':'KY','ALABAMA':'AL','LOUISIANA':'LA','ARKANSAS':'AR','MISSISSIPPI':'MS','IOWA':'IA','KANSAS':'KS','OKLAHOMA':'OK','NEW MEXICO':'NM','IDAHO':'ID','MONTANA':'MT','WYOMING':'WY','NORTH DAKOTA':'ND','SOUTH DAKOTA':'SD','NEBRASKA':'NE','ALASKA':'AK','HAWAII':'HI','NEW JERSEY':'NJ','CONNECTICUT':'CT','MASSACHUSETTS':'MA','RHODE ISLAND':'RI','VERMONT':'VT','NEW HAMPSHIRE':'NH','MAINE':'ME','DELAWARE':'DE','MARYLAND':'MD','WEST VIRGINIA':'WV' };
  for (const line of lines.slice(0, 4)) {
    const upper = line.toUpperCase().replace(/DRIVER.*/,'').trim();
    if (stateNames[upper]) return stateNames[upper];
    // Try 2-letter abbreviation match
    const m = line.match(/\b([A-Z]{2})\b/);
    if (m && US_STATES.includes(m[1])) return m[1];
  }
  return null;
}
function extractDlNumber(text) {
  // Common CDL number patterns
  const patterns = [/\bDL[:\s#]+([A-Z0-9]{5,15})/i, /\bLIC(?:ENSE)?[:\s#]+([A-Z0-9]{5,15})/i, /\bNO\.[:\s]+([A-Z0-9]{5,15})/i];
  for (const p of patterns) { const m = text.match(p); if (m) return m[1]; }
  return null;
}
function extractDate(text, pattern) {
  const m = text.match(pattern);
  if (!m) return null;
  const raw = (m[1] || m[2] || '').trim();
  return parseDate(raw);
}
function parseDate(raw) {
  // Try MM/DD/YYYY, MM-DD-YYYY, MMDDYYYY patterns
  const clean = raw.replace(/[^0-9/\-]/g, '');
  const patterns = [
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
    /^(\d{2})(\d{2})(\d{4})$/,
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/,
  ];
  for (const p of patterns) {
    const m = clean.match(p);
    if (m) {
      let [, mo, dy, yr] = m;
      if (yr.length === 2) yr = parseInt(yr) > 30 ? '19' + yr : '20' + yr;
      if (parseInt(mo) > 12) [mo, dy] = [dy, mo]; // swap if month > 12
      return `${yr}-${mo.padStart(2,'0')}-${dy.padStart(2,'0')}`;
    }
  }
  return null;
}
function extractName(lines) {
  // CDL typically has NAME: or LN, FN MI format
  for (const line of lines) {
    if (/^NAME|^LN\b|^LAST/i.test(line)) {
      return line.replace(/^NAME[:\s]*/i, '').replace(/^LN[:\s]*/i, '').trim();
    }
  }
  // Heuristic: a line of only capitalized words, 2-4 tokens
  for (const line of lines.slice(1, 8)) {
    if (/^[A-Z][A-Z ,\-]+$/.test(line) && line.split(/\s+/).length >= 2) return line;
  }
  return null;
}
function toTitle(s) { return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '); }

// ── Previous employers ────────────────────────────────────────────────────────
const employersEl = $('#employers');
function employerBlock(i) {
  const el = document.createElement('div');
  el.className = 'border border-gray-200 rounded-xl p-4 space-y-3';
  el.dataset.employer = i;
  el.innerHTML = `
    <div class="flex items-center justify-between">
      <h3 class="font-semibold text-sm">Employer ${i + 1}</h3>
      ${i > 0 ? `<button type="button" class="rmv text-sm text-red-500 hover:text-red-700">Remove</button>` : ''}
    </div>
    <div class="grid sm:grid-cols-2 gap-3">
      <div class="sm:col-span-2"><label class="lbl">Company Name</label><input data-f="companyName" class="field"/></div>
      <div><label class="lbl">DOT #</label><input data-f="dotNumber" class="field"/></div>
      <div><label class="lbl">MC #</label><input data-f="mcNumber" class="field"/></div>
      <div><label class="lbl">Phone</label><input data-f="phone" class="field"/></div>
      <div><label class="lbl">Position Held</label><input data-f="positionHeld" class="field"/></div>
      <div><label class="lbl">From</label><input data-f="fromDate" type="date" class="field"/></div>
      <div><label class="lbl">To</label><input data-f="toDate" type="date" class="field"/></div>
      <div class="sm:col-span-2"><label class="lbl">Reason for Leaving</label><input data-f="reasonForLeaving" class="field"/></div>
    </div>`;
  return el;
}
function collectEmployers() {
  state.employers = $$('[data-employer]', employersEl).map(block => {
    const obj = {};
    $$('input[data-f]', block).forEach(inp => { obj[inp.dataset.f] = inp.value; });
    return obj;
  });
}
function renumber() {
  $$('[data-employer]', employersEl).forEach((b, i) => { b.dataset.employer = i; $('h3', b).textContent = `Employer ${i + 1}`; });
}
function addEmployer() {
  const i = $$('[data-employer]', employersEl).length;
  const el = employerBlock(i);
  employersEl.appendChild(el);
  el.addEventListener('input', collectEmployers);
  el.querySelector('.rmv')?.addEventListener('click', () => { el.remove(); renumber(); collectEmployers(); });
}
$('#addEmployer').addEventListener('click', addEmployer);
addEmployer();

// ── Step navigation ───────────────────────────────────────────────────────────
function setStep(n) {
  $('#step1').classList.toggle('hidden', n !== 1);
  $('#step2').classList.toggle('hidden', n !== 2);
  $('#stepLabel').textContent = n === 1 ? 'Step 1 of 2 · Qualification' : 'Step 2 of 2 · Consents & Signature';
  $('#stepPct').textContent = n === 1 ? '50%' : '100%';
  $('#progressBar').style.width = n === 1 ? '50%' : '100%';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('#toStep2').addEventListener('click', () => {
  syncSimpleInputs(); collectEmployers();
  const err = validateStep1();
  if (err) { alert('Please complete the following required fields:\n\n• ' + err.join('\n• ')); return; }
  setStep(2);
});
$('#backToStep1').addEventListener('click', () => setStep(1));

function validateStep1() {
  const req = [];
  if (!state.hasMinimumExperience) req.push('CDL experience question (Yes/No)');
  if (!$('#firstName').value.trim()) req.push('First name');
  if (!$('#lastName').value.trim()) req.push('Last name');
  if (!$('#dateOfBirth').value) req.push('Date of birth');
  if (!$('#email').value.trim()) req.push('Email address');
  if (!$('#phone').value.trim()) req.push('Phone number');
  if (!state.accidents3Years) req.push('Accidents in past 3 years (Yes/No)');
  if (!state.duiConviction) req.push('DUI/DWI conviction (Yes/No)');
  if (!state.sapProgram) req.push('SAP program question (Yes/No)');
  if (!state.positionType) req.push('Position type');
  return req.length ? req : null;
}

// ── Signature ─────────────────────────────────────────────────────────────────
const canvas = $('#sigCanvas');
const ctx = canvas.getContext('2d');
ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#111827';
let drawing = false, hasDrawn = false;

function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  const p = e.touches ? e.touches[0] : e;
  return { x: (p.clientX - r.left) * (canvas.width / r.width), y: (p.clientY - r.top) * (canvas.height / r.height) };
}
canvas.addEventListener('pointerdown', e => { e.preventDefault(); drawing = true; const {x,y} = canvasPos(e); ctx.beginPath(); ctx.moveTo(x,y); });
canvas.addEventListener('pointermove', e => { if (!drawing) return; e.preventDefault(); const {x,y} = canvasPos(e); ctx.lineTo(x,y); ctx.stroke(); hasDrawn = true; });
window.addEventListener('pointerup', () => { drawing = false; });

function setSigMode(mode) {
  sig.mode = mode;
  $('#sigModeDraw').className = `px-3 py-1.5 rounded-md font-medium ${mode==='draw' ? 'bg-accent-500 text-white' : 'text-gray-700 hover:text-gray-900'}`;
  $('#sigModeType').className = `px-3 py-1.5 rounded-md font-medium ${mode==='type' ? 'bg-accent-500 text-white' : 'text-gray-700 hover:text-gray-900'}`;
  $('#sigDrawWrap').classList.toggle('hidden', mode !== 'draw');
  $('#sigTypeWrap').classList.toggle('hidden', mode !== 'type');
  unconfirmSig();
}
$('#sigModeDraw').addEventListener('click', () => setSigMode('draw'));
$('#sigModeType').addEventListener('click', () => setSigMode('type'));
$('#sigTypeInput').addEventListener('input', unconfirmSig);

function unconfirmSig() {
  sig.confirmed = false; sig.dataUrl = null;
  $('#sigConfirmed').classList.add('hidden');
  refreshSubmit();
}
$('#sigClear').addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hasDrawn = false;
  $('#sigTypeInput').value = '';
  unconfirmSig();
});

$('#sigConfirm').addEventListener('click', () => {
  if (sig.mode === 'draw') {
    if (!hasDrawn) { alert('Please draw your signature first.'); return; }
    sig.dataUrl = canvas.toDataURL('image/png');
    sig.name = '';
  } else {
    const name = $('#sigTypeInput').value.trim();
    if (!name) { alert('Please type your name first.'); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "48px 'Dancing Script', cursive";
    ctx.fillStyle = '#111827';
    ctx.fillText(name, 20, 110);
    sig.dataUrl = canvas.toDataURL('image/png');
    sig.name = name;
  }
  sig.confirmed = true;
  $('#sigConfirmed').classList.remove('hidden');
  refreshSubmit();
});

// ── Consents ──────────────────────────────────────────────────────────────────
['consentPsp','consentMvr','consentEmployment'].forEach(id => {
  $('#' + id).addEventListener('change', e => { state[id] = e.target.checked; refreshSubmit(); });
});

function readyToSubmit() {
  return state.consentPsp && state.consentMvr && state.consentEmployment && sig.confirmed;
}
function refreshSubmit() {
  const btn = $('#submitApp');
  const ready = readyToSubmit();
  btn.disabled = !ready;
  btn.className = ready
    ? 'flex-1 px-8 py-4 rounded-xl font-semibold text-lg bg-primary-500 hover:bg-primary-600 text-white shadow-lg shadow-primary-500/25 transition-colors'
    : 'flex-1 px-8 py-4 rounded-xl font-semibold text-lg bg-gray-200 text-gray-400 cursor-not-allowed';
  const hints = [];
  if (!(state.consentPsp && state.consentMvr && state.consentEmployment)) hints.push('agree to all three consents');
  if (!sig.confirmed) hints.push('confirm your signature');
  $('#submitHint').textContent = hints.length ? 'To submit, please ' + hints.join(' and ') + '.' : '';
}

// ── Submit ────────────────────────────────────────────────────────────────────
$('#submitApp').addEventListener('click', async () => {
  if (!readyToSubmit()) return;
  syncSimpleInputs(); collectEmployers();
  const btn = $('#submitApp');
  btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    const res = await fetch('/api/apply/' + token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application: state,
        files,
        signature: { mode: sig.mode, name: sig.name, dataUrl: sig.dataUrl },
      }),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || 'Submission failed');
    $('#step1').classList.add('hidden');
    $('#step2').classList.add('hidden');
    $('#successName').textContent = state.firstName || 'Driver';
    $('#successView').classList.remove('hidden');
    $('#progressBar').style.width = '100%';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    alert(err.message);
    btn.disabled = false; btn.textContent = 'Submit Application';
    refreshSubmit();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
setSigMode('draw');
refreshSubmit();
gate();
