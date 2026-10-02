/*
 * Campbell Plumbing and Rooter lead form -> CRM (https://crm.campbellplumbingandrooter.com/leads/campbell)
 *
 * Handles <form class="lead-form">. SMS consent is two separate OPTIONAL checkboxes (A2P):
 *   sms_transactional / sms_marketing (booleans) + consent_text_transactional / consent_text_marketing (exact wording).
 * Submitting without checking either box is allowed and does not enroll the person in texting.
 * Also sends page_url, form_name and first-touch attribution (UTMs, gclid, fbclid) remembered for 30 days.
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://crm.campbellplumbingandrooter.com/leads/campbell';
  var STORE_KEY = 'campbell_attribution';
  var ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
  var MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  function safeStorage() {
    try { var s = window.localStorage; s.setItem('__t', '1'); s.removeItem('__t'); return s; } catch (e) { return null; }
  }

  function readAttribution() {
    var store = safeStorage(), saved = null;
    if (store) {
      try { saved = JSON.parse(store.getItem(STORE_KEY) || 'null'); } catch (e) { saved = null; }
      if (saved && (Date.now() - (saved.ts || 0)) > MAX_AGE_MS) saved = null;
    }
    var params = new URLSearchParams(window.location.search), fresh = {}, hasFresh = false;
    ATTR_KEYS.forEach(function (k) { var v = params.get(k); if (v) { fresh[k] = v.slice(0, 200); hasFresh = true; } });
    if (hasFresh || !saved) {
      saved = { ts: Date.now(), landing_page: window.location.href.slice(0, 500), data: fresh };
      if (store) { try { store.setItem(STORE_KEY, JSON.stringify(saved)); } catch (e) { /* ignore */ } }
    }
    var out = {};
    ATTR_KEYS.forEach(function (k) { if (saved.data && saved.data[k]) out[k] = saved.data[k]; });
    if (!out.gclid) {
      var m = document.cookie.match(/(?:^|;\s*)_gcl_aw=([^;]+)/);
      if (m) { var parts = decodeURIComponent(m[1]).split('.'); if (parts.length >= 3) out.gclid = parts.slice(2).join('.'); }
    }
    out.landing_page = saved.landing_page;
    return out;
  }

  var attribution = readAttribution();

  function showError(form, text) {
    var box = form.querySelector('.lead-error');
    if (!box) return;
    box.textContent = text;
    box.hidden = false;
  }

  function textOf(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }

  function setup(form) {
    var button = form.querySelector('button[type="submit"]');
    var buttonText = button ? button.textContent : '';
    var sending = false;

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (sending) return;
      var errBox = form.querySelector('.lead-error');
      if (errBox) errBox.hidden = true;

      var phone = form.querySelector('[name="phone"]');
      var digits = phone ? phone.value.replace(/\D/g, '') : '';
      if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
      if (digits.length !== 10) { showError(form, 'Please enter a valid 10-digit phone number.'); if (phone) phone.focus(); return; }

      var payload = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || el.disabled || el.type === 'submit') return;
        if (el.type === 'checkbox') { payload[el.name] = el.checked; return; }
        var v = (el.value || '').trim();
        if (v !== '' || el.name === 'website') payload[el.name] = v;
      });
      payload.consent_text_transactional = textOf(form.querySelector('[data-consent="transactional"] .lead-consent-text'));
      payload.consent_text_marketing = textOf(form.querySelector('[data-consent="marketing"] .lead-consent-text'));
      payload.page_url = window.location.href;
      payload.form_name = form.getAttribute('data-form-name') || 'website';
      Object.keys(attribution).forEach(function (k) { if (attribution[k] && !payload[k]) payload[k] = attribution[k]; });

      sending = true;
      if (button) { button.disabled = true; button.textContent = 'Sending...'; }

      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) { return { status: res.status, body: body }; });
        })
        .then(function (r) {
          if (r.status === 200 && r.body && r.body.ok) {
            var ok = form.parentNode.querySelector('.lead-success');
            form.hidden = true;
            if (ok) { ok.hidden = false; ok.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
            try { (window.dataLayer = window.dataLayer || []).push({ event: 'campbell_lead', form_name: payload.form_name }); } catch (e) { /* ignore */ }
            return;
          }
          showError(form, (r.body && r.body.error) ? r.body.error : 'Something went wrong sending your request. Please call (520) 313-0403.');
        })
        .catch(function () { showError(form, 'Something went wrong sending your request. Please call (520) 313-0403.'); })
        .then(function () { sending = false; if (button) { button.disabled = false; button.textContent = buttonText; } });
    });
  }

  function init() { Array.prototype.forEach.call(document.querySelectorAll('form.lead-form'), setup); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
