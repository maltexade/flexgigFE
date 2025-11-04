/* resetPin.v5.debug.js
   Same behavior as v5 but with verbose debug logs around every step.
*/
(function rpWireResetFlow_v5_debug(){
  'use strict';

  const DEBUG = true;
  const log = (...args) => { if (DEBUG) console.debug('[RP-WIRE-v5-debug]', ...args); };

  log('script load — starting initialization');

  if (window.__rp_wire_reset_v5_installed) {
    log('already installed: re-wiring handlers instead of reinitting');
    if (window.__rp_wire_debug && typeof window.__rp_wire_debug.rewire === 'function') {
      log('calling existing rewire()');
      window.__rp_wire_debug.rewire();
    } else {
      log('no rewire() present on __rp_wire_debug; nothing else to do');
    }
    return;
  }
  window.__rp_wire_reset_v5_installed = true;
  log('marking installed flag');

  // IDs (matched to the HTML you posted)
  const TRIGGER_ID = 'resetPinBtn';
  const RESET_MODAL_ID = 'resetPinModal';
  const MASKED_EMAIL_ID = 'mp-masked-email';
  const FULL_EMAIL_ID = 'mp-full-email';
  const OTP_INPUT_SELECTOR = '.mp-otp-input';
  const RESEND_BTN_ID = 'mp-resend-btn';    // matches HTML
  const OPEN_EMAIL_BTN_ID = 'mp-open-email-btn';
  const VERIFY_BTN_ID = 'mp-reset-btn';     // Reset button inside OTP form
  const FORM_ID = 'mp-otp-form';

  // Server endpoints
  const API_BASE = (window.__SEC_API_BASE || '').replace(/\/$/, '') || '';
  const SERVER_RESEND_OTP = API_BASE ? `${API_BASE}/auth/resend-otp` : '/auth/resend-otp';
  const SERVER_VERIFY_OTP = API_BASE ? `${API_BASE}/auth/verify-otp` : '/auth/verify-otp';
  log('configured endpoints', { API_BASE, SERVER_RESEND_OTP, SERVER_VERIFY_OTP });

  // Resend persist key
  const RESEND_UNTIL_KEY = 'mp_resend_until'; // timestamp ms when resend unlocked

  // DOM helpers
  const $ = id => document.getElementById(id);
  const qsa = sel => Array.from(document.querySelectorAll(sel));

  window.__rp_handlers = window.__rp_handlers || {};
  log('handler storage ready', !!window.__rp_handlers);

  function getDevEmailFallback() {
    const fallback = localStorage.getItem('mockEmail') ||
           localStorage.getItem('__mock_email') ||
           localStorage.getItem('dev_email') ||
           null;
    log('getDevEmailFallback ->', fallback);
    return fallback;
  }

  async function getUserEmail() {
    log('getUserEmail: entry');
    try {
      const gs = window.getSession || (window.dashboard && window.dashboard.getSession) || window.getSessionFromDashboard;
      if (typeof gs === 'function') {
        log('getUserEmail: will call getSession()');
        try {
          const session = await gs();
          log('getUserEmail: getSession() result', session);
          if (session && session.email) { log('getUserEmail: found email at session.email'); return session.email; }
          if (session && session.user && session.user.email) { log('getUserEmail: found email at session.user.email'); return session.user.email; }
          if (session && session.data && session.data.user && session.data.user.email) { log('getUserEmail: found email at session.data.user.email'); return session.data.user.email; }
        } catch (err) {
          log('getUserEmail: getSession threw — will fallback', err);
        }
      } else {
        log('getUserEmail: no getSession function found in globals');
      }

      if (window.__SERVER_USER_DATA__ && window.__SERVER_USER_DATA__.email) {
        log('getUserEmail: using window.__SERVER_USER_DATA__ email');
        return window.__SERVER_USER_DATA__.email;
      }

      const fb = getDevEmailFallback();
      if (fb) {
        log('getUserEmail: using localStorage fallback', fb);
        return fb;
      }

      log('getUserEmail: no email found, returning empty string');
      return '';
    } catch (e) {
      console.error('getUserEmail error', e);
      return '';
    }
  }

  // small robust fetch wrapper (with logs)
  async function postJson(url, data, opts = {}) {
    const debugTag = '[postJsonDebug]';
    const method = opts.method || 'POST';
    const credentials = opts.credentials ?? 'include';
    log(debugTag, 'entry', { url, method, credentials, payload: data });

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

      log(debugTag, 'response', { url, status, headers, bodyText });

      const contentType = (headers['content-type'] || '').toLowerCase();
      if (contentType.includes('application/json')) {
        try { const parsed = JSON.parse(bodyText); log(debugTag, 'parsed JSON body', parsed); return { status, body: parsed, headers }; }
        catch (e) { log(debugTag, 'json parse failed, returning raw body'); return { status, body: bodyText, headers }; }
      }
      return { status, body: bodyText, headers };
    } catch (err) {
      console.error(`${debugTag} Network/fetch error`, err);
      return { status: 0, body: { error: err.message || String(err) }, headers: {} };
    }
  }

  // modal helpers
  function safeOpenModal(modalId) {
    log('safeOpenModal: entry', modalId);
    const modalEl = $(modalId);
    if (!modalEl) {
      log('safeOpenModal: modal element not found', modalId);
      try {
        if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
          log('safeOpenModal: trying ModalManager with selector', `#${modalId}`);
          window.ModalManager.openModal(`#${modalId}`);
          log('safeOpenModal: ModalManager.openModal called with selector');
          return true;
        }
      } catch(e){
        log('safeOpenModal: ModalManager call with selector threw', e);
      }
      return false;
    }

    try {
      if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
        log('safeOpenModal: calling ModalManager.openModal', modalId);
        window.ModalManager.openModal(modalId);
        return true;
      }
    } catch (e) { log('safeOpenModal: ModalManager.openModal threw', e); }

    try {
      log('safeOpenModal: using DOM fallback for', modalId);
      modalEl.classList.remove('hidden');
      modalEl.style.display = modalEl.dataset.hasPullHandle === 'true' ? 'block' : 'flex';
      modalEl.setAttribute('aria-hidden', 'false');
      modalEl.style.zIndex = 20000;
      modalEl.dispatchEvent(new CustomEvent('modal:opened', { bubbles: true }));
      log('safeOpenModal: DOM fallback succeeded for', modalId);
      return true;
    } catch (e) {
      console.error('safeOpenModal fallback failed', e);
      return false;
    }
  }

  function safeCloseModal(modalId) {
    log('safeCloseModal: entry', modalId);
    try {
      if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') {
        log('safeCloseModal: calling ModalManager.closeModal', modalId);
        window.ModalManager.closeModal(modalId);
        return;
      }
    } catch (e) { log('safeCloseModal: ModalManager.closeModal threw', e); }

    const modalEl = $(modalId);
    if (!modalEl) {
      log('safeCloseModal: element not found; nothing to close', modalId);
      return;
    }
    modalEl.classList.add('hidden');
    modalEl.style.display = 'none';
    modalEl.setAttribute('aria-hidden', 'true');
    log('safeCloseModal: DOM fallback applied for', modalId);
  }

  // OTP helpers
  function getOtpValue() {
    const inputs = qsa(OTP_INPUT_SELECTOR);
    log('getOtpValue: inputs found count', inputs.length);
    if (!inputs || inputs.length === 0) return '';
    if (inputs.length === 1) { log('getOtpValue: single input ->', inputs[0].value.trim()); return inputs[0].value.trim(); }
    const joined = inputs.map(i => i.value.trim()).join('');
    log('getOtpValue: multi inputs joined ->', joined);
    return joined;
  }
  function clearOtpInputs() { log('clearOtpInputs: clearing'); qsa(OTP_INPUT_SELECTOR).forEach(i => i.value = ''); }
  function blurOtpInputs() { log('blurOtpInputs: blurring'); qsa(OTP_INPUT_SELECTOR).forEach(i => { try { i.blur(); } catch(e){} }); }

  // Persisted resend countdown helpers
  let resendTimer = null;
  function enableResendButton(btn) {
    log('enableResendButton: entry', !!btn);
    if (!btn) return;
    btn.disabled = false;
    btn.removeAttribute('aria-disabled');
    const defaultText = btn.dataset.defaultText || btn.textContent || 'Resend OTP';
    btn.textContent = defaultText;
    log('enableResendButton: button enabled, text set to', defaultText);
  }
  function setResendUntilTimestamp(untilTs) {
    try { localStorage.setItem(RESEND_UNTIL_KEY, String(untilTs)); log('setResendUntilTimestamp: stored', untilTs); } catch(e){ log('setResendUntilTimestamp: storage failed', e); }
  }
  function getResendUntilTimestamp() {
    try { const s = localStorage.getItem(RESEND_UNTIL_KEY); log('getResendUntilTimestamp ->', s); return s ? parseInt(s, 10) : 0; } catch(e){ log('getResendUntilTimestamp: error', e); return 0; }
  }

  function startResendCountdown(durationSec = 60) {
    log('startResendCountdown: entry', durationSec);
    const btn = $(RESEND_BTN_ID);
    if (!btn) { log('startResendCountdown: no button found'); return; }
    clearInterval(resendTimer);

    const now = Date.now();
    const until = now + (durationSec * 1000);
    setResendUntilTimestamp(until);

    let remaining = Math.max(0, Math.ceil((until - now) / 1000));
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.dataset.defaultText = btn.dataset.defaultText || (btn.textContent || 'Resend OTP');

    btn.textContent = `Resend (${remaining}s)`;
    log('startResendCountdown: countdown started', { now, until, remaining });

    resendTimer = setInterval(() => {
      remaining = Math.ceil((until - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(resendTimer);
        try { localStorage.removeItem(RESEND_UNTIL_KEY); log('startResendCountdown: removed localStorage key'); } catch(e){ log('startResendCountdown: failed to remove key', e); }
        enableResendButton(btn);
        log('startResendCountdown: countdown finished - button re-enabled');
      } else {
        btn.textContent = `Resend (${remaining}s)`;
      }
    }, 900);
  }

  function restoreResendState() {
    log('restoreResendState: entry');
    const btn = $(RESEND_BTN_ID);
    if (!btn) { log('restoreResendState: resend button not found'); return; }
    const until = getResendUntilTimestamp();
    if (!until || until <= Date.now()) {
      log('restoreResendState: no pending countdown or already expired');
      enableResendButton(btn);
      return;
    }
    const remainingSec = Math.ceil((until - Date.now()) / 1000);
    log('restoreResendState: pending countdown found, remainingSec=', remainingSec);
    if (remainingSec > 0) startResendCountdown(remainingSec);
    else enableResendButton(btn);
  }

  // Open provider inbox where possible, fallback to mailto:
  function openEmailClient(email) {
    log('openEmailClient: entry', email);
    if (!email) { alert('No email known for this account.'); log('openEmailClient: no email provided'); return; }
    const domain = (email.split('@')[1] || '').toLowerCase();
    log('openEmailClient: domain parsed', domain);

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
          log('openEmailClient: matched provider, opening', p.url);
          window.open(p.url, '_blank');
          return;
        }
      } catch (e) { log('openEmailClient: providerMap test threw', e); }
    }

    try {
      log('openEmailClient: no provider match — opening mailto compose in new tab');
      window.open(`mailto:${encodeURIComponent(email)}`, '_blank');
    } catch (e) {
      log('openEmailClient: mailto open failed, fallback to google search', e);
      window.open(`https://www.google.com/search?q=${encodeURIComponent(domain + ' email')}`, '_blank');
    }
  }

  // Verify OTP and open the existing pin modal on success
  async function verifyOtpSubmit(evt) {
    log('verifyOtpSubmit: entry', !!evt);
    if (evt && evt.preventDefault) evt.preventDefault();

    const email = await getUserEmail();
    log('verifyOtpSubmit: resolved email', email);
    if (!email) { alert('No email detected. Please login or set mockEmail in localStorage for dev.'); log('verifyOtpSubmit: aborting - no email'); return; }

    const token = getOtpValue();
    log('verifyOtpSubmit: token length', token ? token.length : 0);
    if (!token || token.length < 6) { alert('Please enter the 6-digit OTP.'); log('verifyOtpSubmit: aborting - token too short'); return; }

    const verifyBtn = $(VERIFY_BTN_ID);
    if (verifyBtn) {
      verifyBtn.disabled = true;
      verifyBtn.dataset.orig = verifyBtn.textContent;
      verifyBtn.textContent = 'Verifying…';
      log('verifyOtpSubmit: verify button disabled and text set');
    }

    try {
      log('verifyOtpSubmit: calling server', SERVER_VERIFY_OTP, { email, token });
      const { status, body } = await postJson(SERVER_VERIFY_OTP, { email, token });
      log('verifyOtpSubmit: server returned', { status, body });
      if (status >= 200 && status < 300) {
        log('verifyOtpSubmit: success - opening pinModal and closing reset modal');
        const opened = safeOpenModal('pinModal');
        if (!opened) log('verifyOtpSubmit: could not open pinModal');
        safeCloseModal(RESET_MODAL_ID);
        clearOtpInputs();
        try { localStorage.removeItem(RESEND_UNTIL_KEY); log('verifyOtpSubmit: removed resend timestamp from storage'); } catch(e){ log('verifyOtpSubmit: remove storage failed', e); }
      } else {
        const errMsg = (body && body.error && body.error.message) ? body.error.message : (body && body.message) ? body.message : 'OTP verify failed';
        log('verifyOtpSubmit: failure path -', { status, errMsg });
        if (status === 400 || status === 403) {
          const errCode = body?.error?.code || null;
          if (errCode === 'otp_expired' || (errMsg && errMsg.toLowerCase().includes('expired'))) {
            alert('OTP expired. Please resend OTP and try again.');
            log('verifyOtpSubmit: otp expired condition');
          } else {
            alert('OTP verification failed: ' + errMsg);
            log('verifyOtpSubmit: OTP verification failed message shown');
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
        log('verifyOtpSubmit: verify button restored');
      }
    }
  }

  // Resend OTP: calls server and starts persistent countdown
  async function resendOtpHandler(evt) {
    log('resendOtpHandler: entry', !!evt);
    if (evt && evt.preventDefault) evt.preventDefault();
    const btn = $(RESEND_BTN_ID);
    if (!btn) { log('resendOtpHandler: no button found'); return; }
    if (btn.disabled) { log('resendOtpHandler: button is disabled; ignoring click'); return; }

    const email = await getUserEmail();
    log('resendOtpHandler: resolved email', email);
    if (!email) {
      alert('Unable to find your account email. For dev, run in console:\nlocalStorage.setItem("mockEmail","dev@example.com");\nwindow.__SERVER_USER_DATA__ = { email: "dev@example.com" };');
      log('resendOtpHandler: aborting - no email');
      return;
    }

    btn.disabled = true;
    btn.dataset.orig = btn.textContent;
    btn.textContent = 'Sending…';
    log('resendOtpHandler: sending request to server', SERVER_RESEND_OTP);

    try {
      const { status, body } = await postJson(SERVER_RESEND_OTP, { email });
      log('resendOtpHandler: server response', { status, body });
      if (status >= 200 && status < 300) {
        log('resendOtpHandler: success -> starting countdown');
        startResendCountdown(60);
      } else {
        const errMsg = body?.error?.message || body?.message || 'Failed to resend OTP';
        console.warn('resend-otp failed', status, body);
        alert('Resend failed: ' + errMsg);
        if (btn.dataset.orig) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig; }
        btn.disabled = false;
        log('resendOtpHandler: restored button after failure');
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
    log('wireOtpInputs: entry');
    const inputs = qsa(OTP_INPUT_SELECTOR);
    log('wireOtpInputs: found inputs count', inputs.length);
    if (!inputs || inputs.length === 0) { log('wireOtpInputs: no inputs found - returning'); return; }

    if (window.__rp_handlers.otpInputs && Array.isArray(window.__rp_handlers.otpInputs)) {
      log('wireOtpInputs: removing previous handlers for inputs');
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
        log('wireOtpInputs(single): input event, length=', v.length);
        if (v.length >= 6) {
          try { input.blur(); } catch(e){}
          log('wireOtpInputs(single): auto-submitting (6 digits)');
          setTimeout(() => verifyOtpSubmit(), 120);
        }
      };
      input.removeEventListener('input', onInput);
      input.addEventListener('input', onInput);
      window.__rp_handlers.otpInputs.push({ el: input, handlers: { input: onInput } });
      log('wireOtpInputs: single input wired');
      return;
    }

    inputs.forEach((inp, idx) => {
      inp.setAttribute('inputmode', 'numeric');
      inp.setAttribute('maxlength', '1');
      const onInput = () => {
        log('wireOtpInputs(multi): onInput index', idx, 'value', inp.value);
        const v = inp.value;
        if (v && idx < inputs.length - 1) inputs[idx + 1].focus();
        const all = inputs.map(i => i.value.trim()).join('');
        if (all.length === inputs.length) {
          blurOtpInputs();
          log('wireOtpInputs(multi): all filled -> auto-submit');
          setTimeout(() => verifyOtpSubmit(), 120);
        }
      };
      const onKeydown = (e) => {
        if (e.key === 'Backspace' && !inp.value && idx > 0) {
          log('wireOtpInputs(multi): backspace -> focusing previous index', idx - 1);
          inputs[idx - 1].focus();
        }
      };
      inp.removeEventListener('input', onInput);
      inp.removeEventListener('keydown', onKeydown);
      inp.addEventListener('input', onInput);
      inp.addEventListener('keydown', onKeydown);
      window.__rp_handlers.otpInputs.push({ el: inp, handlers: { input: onInput, keydown: onKeydown } });
    });
    log('wireOtpInputs: multi inputs wired');
  }

  // wire elements and events
  async function wire() {
    log('wire: entry - wiring all UI hooks');
    // trigger: reset pin (opens resend modal after server call)
    const trigger = $(TRIGGER_ID);
    if (trigger) {
      window.__rp_handlers.onTriggerClicked = window.__rp_handlers.onTriggerClicked || onTriggerClicked;
      trigger.removeEventListener('click', window.__rp_handlers.onTriggerClicked);
      trigger.addEventListener('click', window.__rp_handlers.onTriggerClicked);
      log('wire: trigger wired', TRIGGER_ID);
    } else log('wire: trigger not found', TRIGGER_ID);

    // resend button
    const resendBtn = $(RESEND_BTN_ID);
    if (resendBtn) {
      window.__rp_handlers.resendOtpHandler = window.__rp_handlers.resendOtpHandler || resendOtpHandler;
      resendBtn.removeEventListener('click', window.__rp_handlers.resendOtpHandler);
      resendBtn.addEventListener('click', window.__rp_handlers.resendOtpHandler);
      log('wire: resend button wired', RESEND_BTN_ID);
    } else log('wire: resend button not found', RESEND_BTN_ID);

    // open email app
    const openEmailBtn = $(OPEN_EMAIL_BTN_ID);
    if (openEmailBtn) {
      window.__rp_handlers.onOpenEmailClick = window.__rp_handlers.onOpenEmailClick || onOpenEmailClick;
      openEmailBtn.removeEventListener('click', window.__rp_handlers.onOpenEmailClick);
      openEmailBtn.addEventListener('click', window.__rp_handlers.onOpenEmailClick);
      log('wire: openEmail button wired', OPEN_EMAIL_BTN_ID);
    } else log('wire: openEmail button not found', OPEN_EMAIL_BTN_ID);

    // verify (use form submit if present)
    const form = $(FORM_ID);
    if (form) {
      window.__rp_handlers.formSubmit = window.__rp_handlers.formSubmit || verifyOtpSubmit;
      form.removeEventListener('submit', window.__rp_handlers.formSubmit);
      form.addEventListener('submit', window.__rp_handlers.formSubmit);
      log('wire: form submit wired', FORM_ID);
    } else {
      const verifyBtn = $(VERIFY_BTN_ID);
      if (verifyBtn) {
        window.__rp_handlers.verifyOtpSubmit = window.__rp_handlers.verifyOtpSubmit || verifyOtpSubmit;
        verifyBtn.removeEventListener('click', window.__rp_handlers.verifyOtpSubmit);
        verifyBtn.addEventListener('click', window.__rp_handlers.verifyOtpSubmit);
        log('wire: verify button wired (fallback)', VERIFY_BTN_ID);
      } else log('wire: no form or verify button found');
    }

    wireOtpInputs(); // wire OTP inputs
    restoreResendState(); // restore any running countdown

    // show full email
    const fullEmailEl = $(FULL_EMAIL_ID);
    const maskedEl = $(MASKED_EMAIL_ID);
    const email = await getUserEmail();
    log('wire: resolved email for display', email);
    if (email) {
      if (fullEmailEl) { fullEmailEl.textContent = email; log('wire: full-email element set'); }
      if (maskedEl) { maskedEl.textContent = email; log('wire: masked-email element set (raw email for dev)'); }
    } else {
      log('wire: no email to display');
    }

    log('wire: finished wiring');
  }

  // trigger click handler: calls resend endpoint then opens reset modal
  async function onTriggerClicked(evt) {
    log('onTriggerClicked: entry', evt && evt.currentTarget && evt.currentTarget.id);
    evt && evt.preventDefault && evt.preventDefault();
    const btn = evt && evt.currentTarget;
    if (!btn) { log('onTriggerClicked: no button (currentTarget)'); return; }
    if (btn.disabled) { log('onTriggerClicked: button disabled - ignoring'); return; }

    btn.disabled = true;
    if (!btn.dataset.orig) btn.dataset.orig = btn.textContent;
    btn.textContent = 'Preparing…';
    log('onTriggerClicked: preparing - button text saved', btn.dataset.orig);

    const email = await getUserEmail();
    log('onTriggerClicked: getUserEmail returned', email);
    if (!email) {
      btn.disabled = false;
      if (btn.dataset.orig) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig; }
      alert('Unable to find your account email. For dev, run in console:\n\nlocalStorage.setItem("mockEmail","devtester@example.com");\nwindow.__SERVER_USER_DATA__ = { email: "devtester@example.com" };\n\nThen refresh.');
      log('onTriggerClicked: aborting - no email');
      return;
    }

    // show full email in modal elements (masked + full)
    const maskedEl = $(MASKED_EMAIL_ID);
    const fullEl = $(FULL_EMAIL_ID);
    try {
      const parts = email.split('@');
      if (maskedEl) maskedEl.textContent = (parts.length === 2) ? (parts[0].slice(0,2) + '…@' + parts[1]) : email;
      if (fullEl) fullEl.textContent = email;
      log('onTriggerClicked: email elements updated', { masked: !!maskedEl, full: !!fullEl });
    } catch (err){ log('onTriggerClicked: error when setting email elements', err); }

    try {
      log('onTriggerClicked: calling SERVER_RESEND_OTP', SERVER_RESEND_OTP);
      const { status, body } = await postJson(SERVER_RESEND_OTP, { email });
      log('onTriggerClicked: resend response', { status, body });
      if (status >= 200 && status < 300) {
        log('onTriggerClicked: resend success -> open modal');
        const opened = safeOpenModal(RESET_MODAL_ID);
        if (!opened) {
          alert('Modal could not be opened automatically. Check console.');
          log('onTriggerClicked: safeOpenModal returned false');
        } else {
          log('onTriggerClicked: reset modal opened; wiring inputs after open');
          setTimeout(() => wireOtpInputs(), 40);
        }
        startResendCountdown(60);
      } else {
        const errMsg = body?.error?.message || body?.message || 'Failed to send OTP';
        alert('Resend OTP failed: ' + errMsg);
        log('onTriggerClicked: resend failed', { status, errMsg });
      }
    } catch (err) {
      console.error('onTriggerClicked: Failed to call resend otp', err);
      alert('Failed to send OTP. See console for details.');
      log('onTriggerClicked: exception during resend', err);
    } finally {
      btn.disabled = false;
      if (btn.dataset.orig) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig; }
      log('onTriggerClicked: restore trigger button state');
    }
  }

  // open email click handler (wired to 'Open Email App' button)
  async function onOpenEmailClick(evt) {
    log('onOpenEmailClick: entry', !!evt);
    evt && evt.preventDefault && evt.preventDefault();
    const email = await getUserEmail();
    log('onOpenEmailClick: resolved email', email);
    openEmailClient(email);
  }

  // auto-wire on DOM ready
  function initAutoWire() {
    log('initAutoWire: entry - document.readyState =', document.readyState);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { log('DOMContentLoaded fired — calling wire()'); wire(); });
    } else {
      log('document already loaded — calling wire() now');
      wire();
    }
  }
  initAutoWire();

  // public debug helpers
  window.__rp_wire_debug = Object.assign(window.__rp_wire_debug || {}, {
    getUserEmail,
    safeOpenModal,
    safeCloseModal,
    postJson,
    API_BASE,
    SERVER_RESEND_OTP,
    SERVER_VERIFY_OTP,
    openEmailClient,
    verifyOtpSubmit,
    wire,
    rewire: wire,
    _RESEND_UNTIL_KEY: RESEND_UNTIL_KEY,
    _debugFlag: DEBUG
  });

  log('initialization complete — debug helpers attached to window.__rp_wire_debug');

})(); // rpWireResetFlow_v5_debug
