/* resetPin.js — cleaned + fixes
   - fixes: 6-digit guard, consistent safeOpenModal usage,
     robust fetch error handling, deduped handlers, rewire support,
     safer mailto behavior, better logging/debug helpers
*/
(function rpWireResetFlow_v4(){
  'use strict';

  const DEBUG = true;
  const log = (...args) => { if (DEBUG) console.debug('[RP-WIRE-v4]', ...args); };

  // Guard: allow re-wire if script is already present
  if (window.__rp_wire_reset_v4_installed) {
    log('rpWireResetFlow_v4 already installed — re-wiring handlers');
    if (window.__rp_wire_debug && typeof window.__rp_wire_debug.rewire === 'function') {
      window.__rp_wire_debug.rewire();
    }
    return;
  }
  window.__rp_wire_reset_v4_installed = true;

  // IDs / selectors used in your HTML
  const TRIGGER_ID = 'resetPinBtn';       // Button that starts flow
  const RESET_MODAL_ID = 'resetPinModal'; // Reset modal container
  const MASKED_EMAIL_ID = 'mp-masked-email';
  const FULL_EMAIL_ID = 'mp-full-email';  // element to show full email
  const OTP_INPUT_SELECTOR = '.mp-otp-input'; // either single input or inputs
  const RESEND_BTN_ID = 'mp-resend-otp';
  const OPEN_EMAIL_BTN_ID = 'mp-open-email-btn';
  const VERIFY_BTN_ID = 'mp-verify-otp-btn';

  // API base
  const API_BASE = (window.__SEC_API_BASE || '').replace(/\/$/, '') || '';
  const SERVER_RESEND_OTP = API_BASE ? `${API_BASE}/auth/resend-otp` : '/auth/resend-otp';
  const SERVER_VERIFY_OTP = API_BASE ? `${API_BASE}/auth/verify-otp` : '/auth/verify-otp';

  // Utility short-hands
  const $ = id => document.getElementById(id);
  const qs = sel => document.querySelector(sel);
  const qsa = sel => Array.from(document.querySelectorAll(sel));

  // ensure handler storage lives on window so removeEventListener works reliably
  window.__rp_handlers = window.__rp_handlers || {};

  // Dev fallback keys
  function getDevEmailFallback() {
    return localStorage.getItem('mockEmail') ||
           localStorage.getItem('__mock_email') ||
           localStorage.getItem('dev_email') ||
           null;
  }

  // Prefer dashboard.getSession if available; otherwise fallbacks
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

  // Enhanced fetch wrapper with debug info. returns parsed JSON or error object.
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
        try {
          return { status, body: JSON.parse(bodyText), headers };
        } catch (e) {
          return { status, body: bodyText, headers };
        }
      }
      return { status, body: bodyText, headers };
    } catch (err) {
      console.error(`${debugTag} Network/fetch error`, err);
      return { status: 0, body: { error: err.message || String(err) }, headers: {} };
    }
  }

  // Show modal (tries ModalManager then fallback)
  function safeOpenModal(modalId) {
    const modalEl = $(modalId);
    if (!modalEl) {
      log('safeOpenModal: modal element not found', modalId);
      // If ModalManager might accept something else, try calling with selector
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
        log('safeOpenModal: calling ModalManager.openModal', modalId);
        window.ModalManager.openModal(modalId);
        return true;
      }
    } catch (e) {
      log('safeOpenModal: ModalManager.openModal threw', e);
    }

    // DOM fallback
    try {
      modalEl.classList.remove('hidden');
      modalEl.style.display = modalEl.dataset.hasPullHandle === 'true' ? 'block' : 'flex';
      modalEl.setAttribute('aria-hidden', 'false');
      modalEl.style.zIndex = 20000;
      modalEl.dispatchEvent(new CustomEvent('modal:opened', { bubbles: true }));
      log('safeOpenModal: fallback shown via DOM for', modalId);
      return true;
    } catch (e) {
      console.error('safeOpenModal fallback failed', e);
      return false;
    }
  }

  // Close modal (tries ModalManager then fallback)
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

  // Helpers for OTP UI behavior
  function getOtpValue() {
    const inputs = qsa(OTP_INPUT_SELECTOR);
    if (!inputs || inputs.length === 0) return '';
    if (inputs.length === 1) return inputs[0].value.trim();
    return inputs.map(i => i.value.trim()).join('');
  }

  function clearOtpInputs() {
    qsa(OTP_INPUT_SELECTOR).forEach(i => { i.value = ''; });
  }

  function blurOtpInputs() {
    qsa(OTP_INPUT_SELECTOR).forEach(i => { try { i.blur(); } catch(e){} });
  }

  // Resend timer logic
  let resendTimer = null;
  function startResendCountdown(durationSec = 60) {
    const btn = $(RESEND_BTN_ID);
    if (!btn) return;
    clearInterval(resendTimer);
    let remaining = durationSec;
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    const origText = btn.dataset.origText ?? btn.textContent;
    btn.dataset.origText = origText;
    btn.textContent = `Resend (${remaining}s)`;

    resendTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(resendTimer);
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
        btn.textContent = origText || 'Resend OTP';
        delete btn.dataset.origText;
      } else {
        btn.textContent = `Resend (${remaining}s)`;
      }
    }, 1000);
  }

  // "Open email" action — open Gmail inbox for gmail addresses, fallback to mailto:
  function openEmailClient(email) {
    if (!email) {
      alert('No email known for this account.');
      return;
    }
    const domain = (email.split('@')[1] || '').toLowerCase();
    if (domain === 'gmail.com' || domain.endsWith('googlemail.com')) {
      window.open('https://mail.google.com/mail/u/0/#inbox', '_blank');
      return;
    }
    // fallback to mailto opened in a new tab/window (less likely to navigate away)
    window.open(`mailto:${encodeURIComponent(email)}`, '_blank');
  }

  // OTP verify handler — sends { email, token } as server expects
  async function verifyOtpSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    const email = await getUserEmail();
    if (!email) {
      alert('No email detected. Please login or set mockEmail in localStorage for dev.');
      return;
    }

    const token = getOtpValue();
    if (!token || token.length < 6) {
      alert('Please enter the 6-digit OTP.');
      return;
    }

    // show some UI state
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
        // Open create-pin modal (centralized)
        const opened = safeOpenModal('createPinModal');
        if (!opened) {
          console.warn('Could not open createPinModal automatically — check element id or ModalManager.');
        }
        // Close reset modal and clean inputs
        safeCloseModal(RESET_MODAL_ID);
        clearOtpInputs();
        // optional: process returned body (token/user) per app needs
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

  // Resend OTP handler
  async function resendOtpHandler(e) {
    if (e && e.preventDefault) e.preventDefault();
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
        startResendCountdown(60); // start 60s cooldown
        // show masked email or toast
      } else {
        const errMsg = body?.error?.message || body?.message || 'Failed to resend OTP';
        console.warn('resend-otp failed', status, body);
        alert('Resend failed: ' + errMsg);
        btn.disabled = false;
        if (btn.dataset.orig) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig; }
      }
    } catch (err) {
      console.error('resendOtpHandler error', err);
      alert('Network error sending OTP — check console for details.');
      btn.disabled = false;
      if (btn.dataset.orig) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig; }
    }
  }

  // Wire OTP input handlers for auto-blur and auto-submit when 6 digits entered
  function wireOtpInputs() {
    const inputs = qsa(OTP_INPUT_SELECTOR);
    if (!inputs || inputs.length === 0) {
      log('wireOtpInputs: no OTP inputs found for selector', OTP_INPUT_SELECTOR);
      return;
    }

    // cleanup: remove existing handlers if previously added
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
      const onInput = async (e) => {
        const v = input.value.trim();
        if (v.length >= 6) {
          try { input.blur(); } catch(e) {}
          setTimeout(() => { verifyOtpSubmit(); }, 120);
        }
      };
      input.removeEventListener('input', onInput);
      input.addEventListener('input', onInput);
      window.__rp_handlers.otpInputs.push({ el: input, handlers: { input: onInput } });
      return;
    }

    // multiple inputs case
    inputs.forEach((inp, idx) => {
      inp.setAttribute('inputmode', 'numeric');
      inp.setAttribute('maxlength', '1');

      const onInput = (e) => {
        const v = inp.value;
        if (v && idx < inputs.length - 1) {
          inputs[idx + 1].focus();
        }
        const all = inputs.map(i => i.value.trim()).join('');
        if (all.length === inputs.length) {
          blurOtpInputs();
          setTimeout(() => { verifyOtpSubmit(); }, 120);
        }
      };
      const onKeydown = (e) => {
        if (e.key === 'Backspace' && !inp.value && idx > 0) {
          inputs[idx - 1].focus();
        }
      };

      inp.removeEventListener('input', onInput);
      inp.removeEventListener('keydown', onKeydown);
      inp.addEventListener('input', onInput);
      inp.addEventListener('keydown', onKeydown);

      window.__rp_handlers.otpInputs.push({ el: inp, handlers: { input: onInput, keydown: onKeydown } });
    });
  }

  // Wire UI and triggers
  async function wire() {
    // TRIGGER
    const trigger = $(TRIGGER_ID);
    if (trigger) {
      // store handler so removeEventListener works
      window.__rp_handlers.onTriggerClicked = window.__rp_handlers.onTriggerClicked || onTriggerClicked;
      trigger.removeEventListener('click', window.__rp_handlers.onTriggerClicked);
      trigger.addEventListener('click', window.__rp_handlers.onTriggerClicked);
    } else {
      log('wire: trigger not found', TRIGGER_ID);
    }

    // RESEND
    const resendBtn = $(RESEND_BTN_ID);
    if (resendBtn) {
      window.__rp_handlers.resendOtpHandler = window.__rp_handlers.resendOtpHandler || resendOtpHandler;
      resendBtn.removeEventListener('click', window.__rp_handlers.resendOtpHandler);
      resendBtn.addEventListener('click', window.__rp_handlers.resendOtpHandler);
    }

    // OPEN EMAIL
    const openEmailBtn = $(OPEN_EMAIL_BTN_ID);
    if (openEmailBtn) {
      window.__rp_handlers.onOpenEmailClick = window.__rp_handlers.onOpenEmailClick || onOpenEmailClick;
      openEmailBtn.removeEventListener('click', window.__rp_handlers.onOpenEmailClick);
      openEmailBtn.addEventListener('click', window.__rp_handlers.onOpenEmailClick);
    }

    // VERIFY
    const verifyBtn = $(VERIFY_BTN_ID);
    if (verifyBtn) {
      window.__rp_handlers.verifyOtpSubmit = window.__rp_handlers.verifyOtpSubmit || verifyOtpSubmit;
      verifyBtn.removeEventListener('click', window.__rp_handlers.verifyOtpSubmit);
      verifyBtn.addEventListener('click', window.__rp_handlers.verifyOtpSubmit);
    }

    wireOtpInputs();

    // Display full email in modal if element present
    const fullEmailEl = $(FULL_EMAIL_ID);
    const maskedEl = $(MASKED_EMAIL_ID);
    const email = await getUserEmail();
    if (fullEmailEl && email) {
      fullEmailEl.textContent = email;
      if (maskedEl) maskedEl.textContent = email; // developer visibility
    } else if (maskedEl && email) {
      maskedEl.textContent = email;
    }

    log('Wired reset trigger to send OTP then open modal. API:', SERVER_RESEND_OTP, SERVER_VERIFY_OTP);
  }

  // When reset pin button clicked: send resend-otp then open modal
  async function onTriggerClicked(e) {
    e.preventDefault && e.preventDefault();
    const btn = e.currentTarget;
    if (!btn) return;
    if (btn.disabled) return;

    btn.disabled = true;
    if (!btn.dataset.orig) btn.dataset.orig = btn.textContent;
    btn.textContent = 'Preparing…';

    const email = await getUserEmail();
    if (!email) {
      btn.disabled = false;
      if (btn.dataset.orig) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig; }
      alert('Unable to find your account email. For dev, run in console:\n\nlocalStorage.setItem("mockEmail","devtester@example.com");\nwindow.__SERVER_USER_DATA__ = { email: "devtester@example.com" };\n\nThen refresh.');
      return;
    }

    // show masked + full email
    const maskedEl = $(MASKED_EMAIL_ID);
    const fullEl = $(FULL_EMAIL_ID);
    try {
      const parts = email.split('@');
      if (maskedEl) maskedEl.textContent = (parts.length === 2) ? (parts[0].slice(0,2) + '…@' + parts[1]) : email;
      if (fullEl) fullEl.textContent = email;
    } catch (err){}

    // send resend OTP request
    try {
      const { status, body } = await postJson(SERVER_RESEND_OTP, { email });
      if (status >= 200 && status < 300) {
        log('resend-otp response', body);
        // open modal
        const opened = safeOpenModal(RESET_MODAL_ID);
        if (!opened) {
          alert('Modal could not be opened automatically. Check console.');
        } else {
          // ensure OTP inputs are wired now that modal is visible
          setTimeout(() => { wireOtpInputs(); }, 40);
        }
        // start resend countdown
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

  // open email click handler
  async function onOpenEmailClick(e) {
    e.preventDefault && e.preventDefault();
    const email = await getUserEmail();
    openEmailClient(email);
  }

  // If DOM is ready, wire up
  function initAutoWire() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wire);
    } else {
      wire();
    }
  }
  initAutoWire();

  // Expose debug helpers (and rewire)
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
    rewire: wire
  });

})(); // rpWireResetFlow_v4
