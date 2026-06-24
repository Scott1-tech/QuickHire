/* Carrier requirements intake — the carrier owner fills this out from the link
   we email/text them. The questions come straight from the server so they are
   always identical to what the recruiter sees. */
(function () {
  'use strict';

  var token = new URLSearchParams(location.search).get('token') || '';
  var sections = [];
  var answers = {};

  var $ = function (id) { return document.getElementById(id); };
  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function gateError(msg) {
    hide('gateLoading'); hide('formWrap'); hide('gateDone');
    $('gateErrorMsg').textContent = msg || 'This link is not valid.';
    show('gateError');
  }

  if (!token) { gateError('This link is missing its access token. Please use the link we sent you.'); return; }

  // ── Load ───────────────────────────────────────────────────────────────────
  fetch('/api/carrier-intake/' + encodeURIComponent(token))
    .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, status: r.status, body: b }; }); })
    .then(function (res) {
      if (!res.ok) return gateError(res.body && res.body.error ? res.body.error : 'This link is not valid.');
      sections = res.body.sections || [];
      answers = res.body.requirements || {};
      $('hdrCompany').textContent = res.body.name || 'Carrier Requirements';
      $('introName').textContent = res.body.name || 'your company';
      $('doneName').textContent = res.body.name || 'your company';
      if (res.body.status === 'completed') {
        var b = $('hdrStatus');
        b.textContent = 'Already submitted — you can update below';
        b.className = 'ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700';
        $('submitBtn').textContent = 'Save changes';
      }
      render();
      hide('gateLoading'); show('formWrap');
    })
    .catch(function () { gateError('We had trouble loading the form. Please check your connection and try again.'); });

  // ── Render ─────────────────────────────────────────────────────────────────
  function fieldControl(f) {
    var val = answers[f.id] != null ? answers[f.id] : '';
    var ph = f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '';
    if (f.type === 'area') {
      return '<textarea class="field" rows="2" data-fid="' + f.id + '"' + ph + '>' + esc(val) + '</textarea>';
    }
    if (f.type === 'yesno') {
      var opts = ['', 'Yes', 'No', 'N/A'];
      return '<select class="field" data-fid="' + f.id + '">' + opts.map(function (o) {
        var label = o === '' ? '— Select —' : o;
        return '<option value="' + esc(o) + '"' + (String(val) === o ? ' selected' : '') + '>' + esc(label) + '</option>';
      }).join('') + '</select>';
    }
    return '<input type="text" class="field" data-fid="' + f.id + '" value="' + esc(val) + '"' + ph + ' />';
  }

  function render() {
    // section quick-nav
    $('secNav').innerHTML = sections.map(function (s, i) {
      return '<button type="button" data-sec="sec-' + i + '" class="sec-nav-btn text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 bg-white text-gray-600 hover:border-accent-500 hover:text-accent-600 transition">' + esc(s.title) + '</button>';
    }).join('');

    $('reqForm').innerHTML = sections.map(function (s, i) {
      var fields = s.fields.map(function (f) {
        var wide = (f.type === 'area') ? ' sm:col-span-2' : '';
        return '<div class="' + wide + '"><label class="lbl">' + esc(f.label) + '</label>' + fieldControl(f) + '</div>';
      }).join('');
      return '<section id="sec-' + i + '" class="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm scroll-mt-20">'
        + '<div class="mb-4 pb-3 border-b border-gray-100">'
        + '<div class="flex items-center gap-2"><span class="w-6 h-6 rounded-full bg-accent-50 text-accent-600 text-xs font-bold flex items-center justify-center">' + (i + 1) + '</span>'
        + '<h2 class="text-base font-bold text-gray-900">' + esc(s.title) + '</h2></div>'
        + (s.intro ? '<p class="text-xs text-gray-500 mt-1.5 ml-8">' + esc(s.intro) + '</p>' : '')
        + '</div>'
        + '<div class="grid sm:grid-cols-2 gap-x-5 gap-y-4">' + fields + '</div>'
        + '</section>';
    }).join('');

    Array.prototype.forEach.call(document.querySelectorAll('.sec-nav-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var el = $(btn.getAttribute('data-sec'));
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // ── Collect & submit ───────────────────────────────────────────────────────
  function collect() {
    var out = {};
    Array.prototype.forEach.call(document.querySelectorAll('[data-fid]'), function (el) {
      var v = el.value != null ? String(el.value).trim() : '';
      if (v) out[el.getAttribute('data-fid')] = v;
    });
    return out;
  }

  $('submitBtn').addEventListener('click', function () {
    var btn = $('submitBtn');
    btn.disabled = true;
    $('saveMsg').textContent = 'Submitting…';
    fetch('/api/carrier-intake/' + encodeURIComponent(token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirements: collect() }),
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body && res.body.error ? res.body.error : 'Submission failed.');
        hide('formWrap'); show('gateDone');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch(function (e) {
        btn.disabled = false;
        $('saveMsg').textContent = e.message || 'Something went wrong. Please try again.';
        $('saveMsg').className = 'text-sm text-red-600';
      });
  });
})();
