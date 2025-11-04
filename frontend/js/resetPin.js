/* resetPin.improved.js
   - Shows full email
   - Opens provider-specific inbox if possible (Gmail, Outlook/Hotmail/Live, Yahoo, iCloud, ProtonMail)
   - Resend countdown persisted in localStorage so it survives modal reopen/reload
   - Wires correct IDs from your HTML (mp-resend-btn, mp-reset-btn, mp-otp-form)
*/
(function rpWireResetFlow_v5(){
  'use strict';

  const DEBUG = true;
  const log = (...args) => { if (DEBUG) console.debug('[RP-WIRE-v5]', ...args); };

  if (window.__rp_wire_reset_v5_installed) {
    log('rpWireResetFlow_v5 already installed — re-wiring handlers');
    if (window.__rp_wire_debug && typeof window.__rp_wire_debug.rewire === 'function') {
      window.__rp_wire_debug.rewire();
    }
    return;
  }
  window.__rp_wire_reset_v5_installed = true;

  // IDs (matched to the HTML you posted)
  const TRIGGER_ID = 'resetPinBtn';
  const RESET_MODAL_ID = 'resetPinModal';
  const MASKED_EMAIL_ID = 'mp-masked-email';
  const FULL_EMAIL_ID = 'mp-full-email';
  const OTP_INPUT_SELECTOR = '.mp-otp-input';
  const RESEND_BTN_ID = 'mp-resend-btn';    // <-- matches your HTML
  const OPEN_EMAIL_BTN_ID = 'mp-open-email-btn';
  const VERIFY_BTN_ID = 'mp-reset-btn';     // <-- submit button in your HTML
  const FORM_ID = 'mp-otp-form';

  // Server endpoints
  const API_BASE = (window.__SEC_API_BASE || '').replace(/\/$/, '') || '';
  const SERVER_RESEND_OTP = API_BASE ? `${API_BASE}/auth/resend-otp` : '/auth/resend-otp';
  const SERVER_VERIFY_OTP = API_BASE ? `${API_BASE}/auth/verify-otp` : '/auth/verify-otp';

  // Resend persist key
  const RESEND_UNTIL_KEY = 'mp_resend_until'; // timestamp ms when resend unlocked

  // DOM helpers
  const $ = id => document.getElementById(id);
  const qsa = sel => Array.from(document.querySelectorAll(sel));

  window.__rp_handlers = window.__rp_handlers || {};

  function getDevEmailFallback() {
    return localStorage.getItem('mockEmail') ||
           localStorage.getItem('__mock_email') ||
           localStorage.getItem('dev_email') ||
           null;
  }

  async function getUserEmail() {
    try {
      const gs = window.getSession || (window.dashboard && window.dashboard.getSession) || window.getSessionFromDashboard;
      if (typeof gs === 'function') {
        try {
          log('getUserEmail: calling getSession()');
          const session = await gs();
          log('getUserEmail: getSession() result', session);
          if (session && session.email) return session.email;
          if (session && session.user && session.user.email) return session.user.email;
          if (session && session.data && session.data.user && session.data.user.email) return session.data.user.email;
        } catch (err) {
          log('getUserEmail: getSession() threw, falling back', err);
        }
      }

      if (window.__SERVER_USER_DATA__ && window.__SERVER_USER_DATA__.email) {
        log('getUserEmail: using window.__SERVER_USER_DATA__');
        return window.__SERVER_USER_DATA__.email;
      }

      const fb = getDevEmailFallback();
      if (fb) {
        log('getUserEmail: using localStorage fallback', fb);
        return fb;
      }

      log('getUserEmail: no email found');
      return '';
    } catch (e) {
      console.error('getUserEmail error', e);
      return '';
    }
  }

  // small robust fetch wrapper
  async function postJson(url, data, opts = {}) {
    const debugTag = '[postJsonDebug]';
    const method = opts.method || 'POST';
    const credentials = opts.credentials ?? 'include';
    console.debug(`${debugTag} Request ➜`, url, { method, credentials, payload: data });

    try {
      const res = await fetch(url, {
        method,
        credentials,
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(data)
      });

      const status = res.status;
      const headers = {};
      res.headers.forEach((v,k) => headers[k] = v);

      let bodyText = '';
      try { bodyText = await res.text(); } catch(e) { bodyText = '<no body>'; }

      console.debug(`${debugTag} Response ◀ ${status}  — ${url}`);
      console.debug(`${debugTag} Headers:`, headers);
      console.debug(`${debugTag} Body:`, bodyText);

      const contentType = (headers['content-type'] || '').toLowerCase();
      if (contentType.includes('application/json')) {
        try { return { status, body: JSON.parse(bodyText), headers }; } catch (e) { return { status, body: bodyText, headers }; }
      }
      return { status, body: bodyText, headers };
    } catch (err) {
      console.error(`${debugTag} Network/fetch error`, err);
      return { status: 0, body: { error: err.message || String(err) }, headers: {} };
    }
  }

  // modal helpers (ModalManager fallback + DOM fallback)
  function safeOpenModal(modalId) {
    const modalEl = $(modalId);
    if (!modalEl) {
      log('safeOpenModal: modal element not found', modalId);
      try {
        if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
          window.ModalManager.openModal(`#${modalId}`);
          return true;
        }
      } catch(e){}
      return false;
    }

    try {
      if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
        window.ModalManager.openModal(modalId);
        return true;
      }
    } catch (e) { log('safeOpenModal: ModalManager.openModal threw', e); }

    try {
      modalEl.classList.remove('hidden');
      modalEl.style.display = modalEl.dataset.hasPullHandle === 'true' ? 'block' : 'flex';
      modalEl.setAttribute('aria-hidden', 'false');
      modalEl.style.zIndex = 20000;
      modalEl.dispatchEvent(new CustomEvent('modal:opened', { bubbles: true }));
      return true;
    } catch (e) {
      console.error('safeOpenModal fallback failed', e);
      return false;
    }
  }

  function safeCloseModal(modalId) {
    try {
      if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') {
        window.ModalManager.closeModal(modalId);
        return;
      }
    } catch (e) { /* ignore */ }
    const modalEl = $(modalId);
    if (!modalEl) return;
    modalEl.classList.add('hidden');
    modalEl.style.display = 'none';
    modalEl.setAttribute('aria-hidden', 'true');
  }

  // OTP helpers
  function getOtpValue() {
    const inputs = qsa(OTP_INPUT_SELECTOR);
    if (!inputs || inputs.length === 0) return '';
    if (inputs.length === 1) return inputs[0].value.trim();
    return inputs.map(i => i.value.trim()).join('');
  }
  function clearOtpInputs() { qsa(OTP_INPUT_SELECTOR).forEach(i => i.value = ''); }
  function blurOtpInputs() { qsa(OTP_INPUT_SELECTOR).forEach(i => { try { i.blur(); } catch(e){} }); }

  // Persisted resend countdown helpers
  let resendTimer = null;
  function enableResendButton(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.removeAttribute('aria-disabled');
    const defaultText = btn.dataset.defaultText || btn.textContent || 'Resend OTP';
    btn.textContent = defaultText;
  }
  function setResendUntilTimestamp(untilTs) {
    try { localStorage.setItem(RESEND_UNTIL_KEY, String(untilTs)); } catch(e){ log('setResendUntilTimestamp storage failed', e); }
  }
  function getResendUntilTimestamp() {
    try { const s = localStorage.getItem(RESEND_UNTIL_KEY); return s ? parseInt(s, 10) : 0; } catch(e){ return 0; }
  }

  function startResendCountdown(durationSec = 60) {
    const btn = $(RESEND_BTN_ID);
    if (!btn) return;
    clearInterval(resendTimer);

    const now = Date.now();
    const until = now + (durationSec * 1000);
    setResendUntilTimestamp(until);

    let remaining = Math.max(0, Math.ceil((until - now) / 1000));
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.dataset.defaultText = btn.dataset.defaultText || (btn.textContent || 'Resend OTP');

    // immediate update
    btn.textContent = `Resend (${remaining}s)`;

    resendTimer = setInterval(() => {
      remaining = Math.ceil((until - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(resendTimer);
        try { localStorage.removeItem(RESEND_UNTIL_KEY); } catch(e){}
        enableResendButton(btn);
      } else {
        btn.textContent = `Resend (${remaining}s)`;
      }
    }, 900); // run slightly under 1s for snappier UI
  }

  function restoreResendState() {
    const btn = $(RESEND_BTN_ID);
    if (!btn) return;
    const until = getResendUntilTimestamp();
    if (!until || until <= Date.now()) {
      // nothing pending, ensure button enabled
      enableResendButton(btn);
      return;
    }
    // compute remaining and start timer using the remaining seconds
    const remainingSec = Math.ceil((until - Date.now()) / 1000);
    if (remainingSec > 0) startResendCountdown(remainingSec);
    else enableResendButton(btn);
  }

  // Open provider inbox where possible, fallback to mailto:
  function openEmailClient(email) {
    if (!email) {
      alert('No email known for this account.');
      return;
    }
    const domain = (email.split('@')[1] || '').toLowerCase();

    // mapping for common providers -> inbox URLs
    const providerMap = [
      { test: d => d === 'gmail.com' || d.endsWith('googlemail.com'), url: 'https://mail.google.com/mail/u/0/#inbox' },
      { test: d => /outlook\.|hotmail\.|live\.|msn\./i.test(d), url: 'https://outlook.live.com/mail/0/inbox' },
      { test: d => d.endsWith('yahoo.com') || d.endsWith('yahoo.co'), url: 'https://mail.yahoo.com/d/folders/1' },
      { test: d => d.endsWith('icloud.com') || d.endsWith('me.com'), url: 'https://www.icloud.com/mail' },
      { test: d => d.endsWith('protonmail.com') || d.endsWith('pm.me'), url: 'https://mail.proton.me/u/0/inbox' }
    ];

    for (const p of providerMap) {
      try {
        if (p.test(domain)) {
          window.open(p.url, '_blank');
          return;
        }
      } catch (e) { /* continue to fallback */ }
    }

    // As a robust fallback, open a mailto: (this opens compose, not inbox — but it's the best generic action)
    try {
      window.open(`mailto:${encodeURIComponent(email)}`, '_blank');
    } catch (e) {
      // final fallback: open a search for the provider's mail
      window.open(`https://www.google.com/search?q=${encodeURIComponent(domain + ' email')}`, '_blank');
    }
  }

  // Verify OTP and open the existing pin modal on success
  async function verifyOtpSubmit(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();

    const email = await getUserEmail();
    if (!email) { alert('No email detected. Please login or set mockEmail in localStorage for dev.'); return; }

    const token = getOtpValue();
    if (!token || token.length < 6) { alert('Please enter the 6-digit OTP.'); return; }

    const verifyBtn = $(VERIFY_BTN_ID);
    if (verifyBtn) {
      verifyBtn.disabled = true;
      verifyBtn.dataset.orig = verifyBtn.textContent;
      verifyBtn.textContent = 'Verifying…';
    }

    try {
      const { status, body } = await postJson(SERVER_VERIFY_OTP, { email, token });
      if (status >= 200 && status < 300) {
        log('verifyOtp: success', body);
        // open your existing pin modal
        const opened = safeOpenModal('pinModal');
        if (!opened) {
          console.warn('Could not open pinModal automatically — check element id "pinModal" or ModalManager.');
        }
        safeCloseModal(RESET_MODAL_ID);
        clearOtpInputs();
        // optionally remove resend timestamp (OTP used)
        try { localStorage.removeItem(RESEND_UNTIL_KEY); } catch(e){}
      } else {
        const errMsg = (body && body.error && body.error.message) ? body.error.message : (body && body.message) ? body.message : 'OTP verify failed';
        console.warn('verifyOtp error', status, body);
        if (status === 400 || status === 403) {
          const errCode = body?.error?.code || null;
          if (errCode === 'otp_expired' || (errMsg && errMsg.toLowerCase().includes('expired'))) {
            alert('OTP expired. Please resend OTP and try again.');
          } else {
            alert('OTP verification failed: ' + errMsg);
          }
        } else {
          alert('OTP verification failed: ' + errMsg);
        }
      }
    } catch (err) {
      console.error('verifyOtpSubmit error', err);
      alert('Network error verifying OTP — check console for details.');
    } finally {
      if (verifyBtn) {
        verifyBtn.disabled = false;
        if (verifyBtn.dataset.orig) { verifyBtn.textContent = verifyBtn.dataset.orig; delete verifyBtn.dataset.orig; }
      }
    }
  }

  // Resend OTP: calls server and starts persistent countdown
  async function resendOtpHandler(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    const btn = $(RESEND_BTN_ID);
    if (!btn || btn.disabled) return;

    const email = await getUserEmail();
    if (!email) {
      alert('Unable to find your account email. For dev, run in console:\nlocalStorage.setItem("mockEmail","dev@example.com");\nwindow.__SERVER_USER_DATA__ = { email: "dev@example.com" };');
      return;
    }

    btn.disabled = true;
    btn.dataset.orig = btn.textContent;
    btn.textContent = 'Sending…';

    try {
      const { status, body } = await postJson(SERVER_RESEND_OTP, { email });
      if (status >= 200 && status < 300) {
        log('resend-otp success', body);
        // persist countdown until timestamp and start countdown
        startResendCountdown(60);
      } else {
        const errMsg = body?.error?.message || body?.message || 'Failed to resend OTP';
        console.warn('resend-otp failed', status, body);
        alert('Resend failed: ' + errMsg);
        // restore button text
        if (btn.dataset.orig) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig; }
        btn.disabled = false;
      }
    } catch (err) {
      console.error('resendOtpHandler error', err);
      alert('Network error sending OTP — check console for details.');
      if (btn.dataset.orig) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig; }
      btn.disabled = false;
    }
  }

  // wire OTP inputs (single input or many). auto-submit on 6 digits.
  function wireOtpInputs() {
    const inputs = qsa(OTP_INPUT_SELECTOR);
    if (!inputs || inputs.length === 0) { log('wireOtpInputs: no inputs'); return; }

    if (window.__rp_handlers.otpInputs && Array.isArray(window.__rp_handlers.otpInputs)) {
      window.__rp_handlers.otpInputs.forEach(({el, handlers}) => {
        if (!el) return;
        if (handlers && handlers.input) el.removeEventListener('input', handlers.input);
        if (handlers && handlers.keydown) el.removeEventListener('keydown', handlers.keydown);
      });
    }
    window.__rp_handlers.otpInputs = [];

    if (inputs.length === 1) {
      const input = inputs[0];
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('maxlength', '6');
      const onInput = () => {
        const v = input.value.trim();
        if (v.length >= 6) {
          try { input.blur(); } catch(e){}
          setTimeout(() => verifyOtpSubmit(), 120);
        }
      };
      input.removeEventListener('input', onInput);
      input.addEventListener('input', onInput);
      window.__rp_handlers.otpInputs.push({ el: input, handlers: { input: onInput } });
      return;
    }

    // multiple single-char boxes
    inputs.forEach((inp, idx) => {
      inp.setAttribute('inputmode', 'numeric');
      inp.setAttribute('maxlength', '1');
      const onInput = () => {
        const v = inp.value;
        if (v && idx < inputs.length - 1) inputs[idx + 1].focus();
        const all = inputs.map(i => i.value.trim()).join('');
        if (all.length === inputs.length) {
          blurOtpInputs();
          setTimeout(() => verifyOtpSubmit(), 120);
        }
      };
      const onKeydown = (e) => {
        if (e.key === 'Backspace' && !inp.value && idx > 0) inputs[idx - 1].focus();
      };
      inp.removeEventListener('input', onInput);
      inp.removeEventListener('keydown', onKeydown);
      inp.addEventListener('input', onInput);
      inp.addEventListener('keydown', onKeydown);
      window.__rp_handlers.otpInputs.push({ el: inp, handlers: { input: onInput, keydown: onKeydown } });
    });
  }

  // wire elements and events
  async function wire() {
    // trigger: reset pin (opens resend modal after server call)
    const trigger = $(TRIGGER_ID);
    if (trigger) {
      window.__rp_handlers.onTriggerClicked = window.__rp_handlers.onTriggerClicked || onTriggerClicked;
      trigger.removeEventListener('click', window.__rp_handlers.onTriggerClicked);
      trigger.addEventListener('click', window.__rp_handlers.onTriggerClicked);
    } else log('wire: trigger not found', TRIGGER_ID);

    // resend button
    const resendBtn = $(RESEND_BTN_ID);
    if (resendBtn) {
      window.__rp_handlers.resendOtpHandler = window.__rp_handlers.resendOtpHandler || resendOtpHandler;
      resendBtn.removeEventListener('click', window.__rp_handlers.resendOtpHandler);
      resendBtn.addEventListener('click', window.__rp_handlers.resendOtpHandler);
    } else log('wire: resend button not found', RESEND_BTN_ID);

    // open email app
    const openEmailBtn = $(OPEN_EMAIL_BTN_ID);
    if (openEmailBtn) {
      window.__rp_handlers.onOpenEmailClick = window.__rp_handlers.onOpenEmailClick || onOpenEmailClick;
      openEmailBtn.removeEventListener('click', window.__rp_handlers.onOpenEmailClick);
      openEmailBtn.addEventListener('click', window.__rp_handlers.onOpenEmailClick);
    }

    // verify (use form submit if present)
    const form = $(FORM_ID);
    if (form) {
      window.__rp_handlers.formSubmit = window.__rp_handlers.formSubmit || verifyOtpSubmit;
      form.removeEventListener('submit', window.__rp_handlers.formSubmit);
      form.addEventListener('submit', window.__rp_handlers.formSubmit);
    } else {
      // fallback: wire the button id too if you want
      const verifyBtn = $(VERIFY_BTN_ID);
      if (verifyBtn) {
        window.__rp_handlers.verifyOtpSubmit = window.__rp_handlers.verifyOtpSubmit || verifyOtpSubmit;
        verifyBtn.removeEventListener('click', window.__rp_handlers.verifyOtpSubmit);
        verifyBtn.addEventListener('click', window.__rp_handlers.verifyOtpSubmit);
      }
    }

    wireOtpInputs(); // wire OTP inputs
    restoreResendState(); // restore any running countdown

    // show full email
    const fullEmailEl = $(FULL_EMAIL_ID);
    const maskedEl = $(MASKED_EMAIL_ID);
    const email = await getUserEmail();
    if (email) {
      if (fullEmailEl) fullEmailEl.textContent = email;
      if (maskedEl) maskedEl.textContent = email; // developer visibility; change masking logic here if required
    }

    log('rpWireResetFlow_v5 wired. APIs:', SERVER_RESEND_OTP, SERVER_VERIFY_OTP);
  }

  // trigger click handler: calls resend endpoint then opens reset modal
  async function onTriggerClicked(evt) {
    evt && evt.preventDefault && evt.preventDefault();
    const btn = evt && evt.currentTarget;
    if (!btn) return;
    if (btn.disabled) return;

    btn.disabled = true;
    if (!btn.dataset.orig) btn.dataset.orig = btn.textContent;
    btn.textContent = 'Preparing…';

    const email = await getUserEmail();
    if (!email) {
      btn.disabled = false;
      if (btn.dataset.orig) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig; }
      alert('Unable to find your account email. For dev, run in console:\n\nlocalStorage.setItem(\"mockEmail\",\"devtester@example.com\");\nwindow.__SERVER_USER_DATA__ = { email: \"devtester@example.com\" };\n\nThen refresh.');
      return;
    }

    // show full email in modal elements (masked + full)
    const maskedEl = $(MASKED_EMAIL_ID);
    const fullEl = $(FULL_EMAIL_ID);
    try {
      const parts = email.split('@');
      if (maskedEl) maskedEl.textContent = (parts.length === 2) ? (parts[0].slice(0,2) + '…@' + parts[1]) : email;
      if (fullEl) fullEl.textContent = email;
    } catch (err){}

    try {
      const { status, body } = await postJson(SERVER_RESEND_OTP, { email });
      if (status >= 200 && status < 300) {
        log('resend-otp response', body);
        const opened = safeOpenModal(RESET_MODAL_ID);
        if (!opened) {
          alert('Modal could not be opened automatically. Check console.');
        } else {
          // wire inputs after modal opens (small delay)
          setTimeout(() => wireOtpInputs(), 40);
        }
        startResendCountdown(60);
      } else {
        const errMsg = body?.error?.message || body?.message || 'Failed to send OTP';
        alert('Resend OTP failed: ' + errMsg);
      }
    } catch (err) {
      console.error('Failed to call resend otp', err);
      alert('Failed to send OTP. See console for details.');
    } finally {
      btn.disabled = false;
      if (btn.dataset.orig) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig; }
    }
  }

  // open email click handler (wired to 'Open Email App' button)
  async function onOpenEmailClick(evt) {
    evt && evt.preventDefault && evt.preventDefault();
    const email = await getUserEmail();
    openEmailClient(email);
  }

  // auto-wire on DOM ready
  function initAutoWire() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wire);
    } else {
      wire();
    }
  }
  initAutoWire();

  // public debug helpers
  window.__rp_wire_debug = Object.assign(window.__rp_wire_debug || {}, {
    getUserEmail,
    safeOpenModal,
    postJson,
    API_BASE,
    SERVER_RESEND_OTP,
    SERVER_VERIFY_OTP,
    openEmailClient,
    verifyOtpSubmit,
    wire,
    rewire: wire,
    _RESEND_UNTIL_KEY: RESEND_UNTIL_KEY
  });

})(); // rpWireResetFlow_v5
