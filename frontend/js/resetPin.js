/* resetPin.js — updated with verbose logs, provider inbox handling, correct IDs
   - Matches HTML IDs: mp-resend-btn, mp-reset-btn, mp-otp-input (class .mp-otp-input)
   - Opens pinModal after successful verification
   - Provider-aware "Open Email" behavior (gmail/yahoo/outlook/icloud)
   - Heavy console logging at each step (console.log + console.debug)
*/
(function rpWireResetFlow_v5(){
  'use strict';

  // ---- CONFIG ----
  const DEBUG = true;
  const log = (...args) => { if (DEBUG) console.log('[RP-WIRE-v5]', ...args); };
  const dbg = (...args) => { if (DEBUG) console.debug('[RP-WIRE-v5]', ...args); };
  const warn = (...args) => { if (DEBUG) console.warn('[RP-WIRE-v5]', ...args); };
  const err = (...args) => { if (DEBUG) console.error('[RP-WIRE-v5]', ...args); };

  if (window.__rp_wire_reset_v5_installed) {
    log('rpWireResetFlow_v5 already installed — wiring refresh');
    if (window.__rp_wire_debug && typeof window.__rp_wire_debug.rewire === 'function') {
      try { window.__rp_wire_debug.rewire(); } catch(e){ dbg('rewire threw', e); }
    }
    return;
  }
  window.__rp_wire_reset_v5_installed = true;

  // ---- Selectors (kept in sync with your HTML) ----
  const TRIGGER_ID = 'resetPinBtn';          // "Reset now" button
  const RESET_MODAL_ID = 'resetPinModal';    // reset modal id
  const MASKED_EMAIL_ID = 'mp-masked-email'; // visible element in your modal
  const FULL_EMAIL_ID = 'mp-full-email';     // optional element if you add it later
  const OTP_INPUT_SELECTOR = '.mp-otp-input';// single input (class) or several inputs
  const RESEND_BTN_ID = 'mp-resend-btn';     // matches your HTML id
  const OPEN_EMAIL_BTN_ID = 'mp-open-email-btn';
  const VERIFY_BTN_ID = 'mp-reset-btn';      // your "Reset PIN" submit button
  const OTP_FORM_ID = 'mp-otp-form';         // OTP form id

  // ---- API endpoints (respect __SEC_API_BASE if present) ----
  const API_BASE = (window.__SEC_API_BASE || '').replace(/\/$/, '') || '';
  const SERVER_RESEND_OTP = API_BASE ? `${API_BASE}/auth/resend-otp` : '/auth/resend-otp';
  const SERVER_VERIFY_OTP = API_BASE ? `${API_BASE}/auth/verify-otp` : '/auth/verify-otp';

  // ---- Utilities ----
  const $ = id => document.getElementById(id);
  const qsa = sel => Array.from(document.querySelectorAll(sel));
  window.__rp_handlers = window.__rp_handlers || {};

  function getDevEmailFallback() {
    return localStorage.getItem('mockEmail') ||
           localStorage.getItem('__mock_email') ||
           localStorage.getItem('dev_email') ||
           null;
  }

  // Attempt to resolve email from known sources
  async function getUserEmail() {
    log('getUserEmail: resolving user email');
    try {
      const candidates = [
        window.getSession,
        (window.dashboard && window.dashboard.getSession),
        window.getSessionFromDashboard
      ];
      for (const fn of candidates) {
        if (typeof fn === 'function') {
          try {
            dbg('getUserEmail: calling session provider', fn.name || '(anonymous)');
            const session = await fn();
            dbg('getUserEmail: session result', session);
            if (!session) continue;
            if (session.email) { log('getUserEmail: found email in session.email', session.email); return session.email; }
            if (session.user && session.user.email) { log('getUserEmail: found email in session.user.email', session.user.email); return session.user.email; }
            if (session.data && session.data.user && session.data.user.email) { log('getUserEmail: found email in session.data.user.email', session.data.user.email); return session.data.user.email; }
          } catch (e) {
            warn('getUserEmail: session provider threw, continuing', e);
          }
        }
      }

      if (window.__SERVER_USER_DATA__ && window.__SERVER_USER_DATA__.email) {
        log('getUserEmail: found email in window.__SERVER_USER_DATA__', window.__SERVER_USER_DATA__.email);
        return window.__SERVER_USER_DATA__.email;
      }

      const fb = getDevEmailFallback();
      if (fb) {
        log('getUserEmail: using localStorage fallback', fb);
        return fb;
      }

      log('getUserEmail: no email found — returning empty string');
      return '';
    } catch (e) {
      err('getUserEmail: unexpected error', e);
      return '';
    }
  }

  // Fetch wrapper with robust logging
  async function postJson(url, payload = {}, opts = {}) {
    const tag = '[postJson]';
    dbg(`${tag} Request`, url, payload);
    try {
      const res = await fetch(url, {
        method: opts.method || 'POST',
        credentials: opts.credentials ?? 'include',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });

      const status = res.status;
      const headers = {};
      res.headers.forEach((v,k) => headers[k] = v);
      let text = '';
      try { text = await res.text(); } catch(e){ text = '<no body>'; }
      dbg(`${tag} Response status=${status}`, { headers, bodyText: text });

      const ct = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
      if (ct.includes('application/json')) {
        try {
          const json = JSON.parse(text);
          dbg(`${tag} parsed JSON`, json);
          return { status, body: json, headers };
        } catch (e) {
          warn(`${tag} failed to parse JSON — returning text`, e);
          return { status, body: text, headers };
        }
      }
      return { status, body: text, headers };
    } catch (e) {
      err(`${tag} network/fetch error`, e);
      return { status: 0, body: { error: e.message || String(e) }, headers: {} };
    }
  }

  // OTP helpers
  function getOtpValue() {
    const inputs = qsa(OTP_INPUT_SELECTOR);
    if (!inputs || inputs.length === 0) {
      dbg('getOtpValue: no inputs found for selector', OTP_INPUT_SELECTOR);
      return '';
    }
    if (inputs.length === 1) return inputs[0].value.trim();
    return inputs.map(i => i.value.trim()).join('');
  }

  function clearOtpInputs() {
    qsa(OTP_INPUT_SELECTOR).forEach(i => { i.value = ''; });
    dbg('clearOtpInputs: cleared');
  }

  function blurOtpInputs() {
    qsa(OTP_INPUT_SELECTOR).forEach(i => { try { i.blur(); } catch(e){} });
    dbg('blurOtpInputs: blurred');
  }

  // Resend countdown
  let resendTimer = null;
  function startResendCountdown(durationSec = 60) {
    const btn = $(RESEND_BTN_ID);
    if (!btn) { warn('startResendCountdown: button not found', RESEND_BTN_ID); return; }
    dbg('startResendCountdown: starting', durationSec);
    clearInterval(resendTimer);
    let remaining = Math.max(0, parseInt(durationSec, 10) || 60);
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.dataset._origText = btn.dataset._origText || btn.textContent || 'Resend OTP';
    btn.textContent = `Resend (${remaining}s)`;
    resendTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(resendTimer);
        resendTimer = null;
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
        btn.textContent = btn.dataset._origText || 'Resend OTP';
        delete btn.dataset._origText;
        log('startResendCountdown: finished, resend enabled');
      } else {
        btn.textContent = `Resend (${remaining}s)`;
      }
    }, 1000);
  }

  // Provider-aware "open inbox" (best-effort)
  function openEmailClient(email) {
    log('openEmailClient: trying to open inbox for', email);
    if (!email) { warn('openEmailClient: no email provided'); alert('No email known for this account.'); return; }
    const domain = (email.split('@')[1] || '').toLowerCase();
    try {
      if (domain === 'gmail.com' || domain.endsWith('googlemail.com')) {
        window.open('https://mail.google.com/mail/u/0/#inbox', '_blank');
        log('openEmailClient: opened Gmail inbox');
        return;
      }
      if (domain.endsWith('yahoo.com') || domain.endsWith('yahoo.co')) {
        window.open('https://mail.yahoo.com/d/folders/1', '_blank');
        log('openEmailClient: opened Yahoo Mail');
        return;
      }
      if (domain.endsWith('outlook.com') || domain.endsWith('hotmail.com') || domain.endsWith('live.com') || domain.endsWith('msn.com')) {
        window.open('https://outlook.live.com/mail/inbox', '_blank');
        log('openEmailClient: opened Outlook/Hotmail');
        return;
      }
      if (domain.endsWith('icloud.com') || domain.endsWith('me.com') || domain.endsWith('mac.com')) {
        window.open('https://www.icloud.com/mail', '_blank');
        log('openEmailClient: opened iCloud Mail');
        return;
      }
      // Generic fallback: open mailto in a new tab (compose, but better than navigating away)
      window.open(`mailto:${encodeURIComponent(email)}`, '_blank');
      log('openEmailClient: fallback mailto opened');
    } catch (e) {
      err('openEmailClient: error opening provider link', e);
      // fallback to location change (last resort)
      try { window.location.href = `mailto:${encodeURIComponent(email)}`; } catch(e2){ err('openEmailClient: fallback navigation also failed', e2); }
    }
  }

  // --- VERIFY OTP ---
  async function verifyOtpSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    log('verifyOtpSubmit: start');
    const email = await getUserEmail();
    log('verifyOtpSubmit: resolved email ->', email || '(none)');
    if (!email) {
      alert('No email detected. Please login or set mockEmail in localStorage for dev.');
      warn('verifyOtpSubmit: no email, aborting');
      return;
    }

    const token = getOtpValue();
    dbg('verifyOtpSubmit: token raw ->', token);
    if (!token || token.length < 6) {
      alert('Please enter the 6-digit OTP.');
      warn('verifyOtpSubmit: token too short', token);
      return;
    }

    const verifyBtn = $(VERIFY_BTN_ID);
    if (verifyBtn) {
      verifyBtn.disabled = true;
      verifyBtn.dataset._origText = verifyBtn.textContent;
      verifyBtn.textContent = 'Verifying…';
      dbg('verifyOtpSubmit: verify button disabled and labelled verifying');
    }

    try {
      const { status, body } = await postJson(SERVER_VERIFY_OTP, { email, token });
      log('verifyOtpSubmit: server responded', status, body);
      if (status >= 200 && status < 300) {
        log('verifyOtpSubmit: OTP verified success — opening pin modal and closing reset modal');
        // open your pin modal (use pinModal as your create PIN UI)
        const openedPin = (window.ModalManager && typeof window.ModalManager.openModal === 'function')
          ? (function(){ try { window.ModalManager.openModal('pinModal'); return true; } catch(e){ dbg('ModalManager.openModal(pinModal) threw', e); return false; } })()
          : (function(){ const el = $('pinModal'); if (el) { el.classList.remove('hidden'); el.style.display = 'flex'; el.setAttribute('aria-hidden','false'); return true; } return false; })();

        if (!openedPin) warn('verifyOtpSubmit: could not open pinModal automatically; check modal id or ModalManager');

        // close reset modal
        try { if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') window.ModalManager.closeModal(RESET_MODAL_ID); else safeCloseFallback(RESET_MODAL_ID); } catch(e){ dbg('close reset modal threw', e); }
        clearOtpInputs();
        // Optional: process returned body for tokens etc (log it)
        dbg('verifyOtpSubmit: success body', body);
      } else {
        // server returned error
        const errMsg = (body && body.error && body.error.message) ? body.error.message : (body && body.message) ? body.message : 'OTP verify failed';
        warn('verifyOtpSubmit: server returned failure', status, errMsg);
        if (status === 400 || status === 403) {
          const errCode = body?.error?.code || null;
          if (errCode === 'otp_expired' || (errMsg && String(errMsg).toLowerCase().includes('expired'))) {
            alert('OTP expired. Please resend OTP and try again.');
          } else {
            alert('OTP verification failed: ' + errMsg);
          }
        } else {
          alert('OTP verification failed: ' + errMsg);
        }
      }
    } catch (e) {
      err('verifyOtpSubmit: unexpected error', e);
      alert('Network error verifying OTP — check console for details.');
    } finally {
      if (verifyBtn) {
        verifyBtn.disabled = false;
        if (verifyBtn.dataset._origText) { verifyBtn.textContent = verifyBtn.dataset._origText; delete verifyBtn.dataset._origText; }
        dbg('verifyOtpSubmit: verify button restored');
      }
      log('verifyOtpSubmit: end');
    }
  }

  // safe fallback close if ModalManager not present
  function safeCloseFallback(modalId) {
    const el = $(modalId);
    if (!el) { dbg('safeCloseFallback: element not found', modalId); return; }
    el.classList.add('hidden');
    el.style.display = 'none';
    el.setAttribute('aria-hidden','true');
    dbg('safeCloseFallback: modal hidden by DOM fallback', modalId);
  }

  // --- RESEND OTP ---
  async function resendOtpHandler(e) {
    if (e && e.preventDefault) e.preventDefault();
    log('resendOtpHandler: start');
    const btn = $(RESEND_BTN_ID);
    if (!btn) { warn('resendOtpHandler: resend button not found'); return; }
    if (btn.disabled) { dbg('resendOtpHandler: button disabled - ignoring'); return; }

    const email = await getUserEmail();
    log('resendOtpHandler: email ->', email || '(none)');
    if (!email) {
      alert('Unable to find your account email. For dev, run in console:\nlocalStorage.setItem("mockEmail","dev@example.com");\nwindow.__SERVER_USER_DATA__ = { email: "dev@example.com" };');
      return;
    }

    btn.disabled = true;
    btn.dataset._origText = btn.textContent;
    btn.textContent = 'Sending…';

    try {
      const { status, body } = await postJson(SERVER_RESEND_OTP, { email });
      log('resendOtpHandler: server responded', status, body);
      if (status >= 200 && status < 300) {
        // start cooldown
        startResendCountdown(60);
        log('resendOtpHandler: OTP resent successfully to', email);
        // optionally show a small toast
      } else {
        const errMsg = body?.error?.message || body?.message || 'Failed to resend OTP';
        warn('resendOtpHandler: resend failed', status, errMsg);
        alert('Resend failed: ' + errMsg);
        // restore button
        btn.disabled = false;
        if (btn.dataset._origText) { btn.textContent = btn.dataset._origText; delete btn.dataset._origText; }
      }
    } catch (e) {
      err('resendOtpHandler: network error', e);
      alert('Network error sending OTP — check console for details.');
      btn.disabled = false;
      if (btn.dataset._origText) { btn.textContent = btn.dataset._origText; delete btn.dataset._origText; }
    } finally {
      log('resendOtpHandler: end');
    }
  }

  // OTP input wiring: handles single input (6 digits) or multi-input
  function wireOtpInputs() {
    const inputs = qsa(OTP_INPUT_SELECTOR);
    log('wireOtpInputs: found inputs count', inputs.length);
    if (!inputs || inputs.length === 0) {
      warn('wireOtpInputs: no OTP inputs found for selector', OTP_INPUT_SELECTOR);
      return;
    }

    // clean previous handlers
    if (Array.isArray(window.__rp_handlers.otpInputs)) {
      window.__rp_handlers.otpInputs.forEach(({el, handlers}) => {
        if (!el || !handlers) return;
        if (handlers.input) el.removeEventListener('input', handlers.input);
        if (handlers.keydown) el.removeEventListener('keydown', handlers.keydown);
      });
    }
    window.__rp_handlers.otpInputs = [];

    if (inputs.length === 1) {
      const input = inputs[0];
      input.setAttribute('inputmode','numeric');
      input.setAttribute('maxlength','6');
      const onInput = (e) => {
        const v = input.value.trim();
        dbg('wireOtpInputs(single): input value length', v.length);
        if (v.length >= 6) {
          try { input.blur(); } catch(_) {}
          setTimeout(() => { verifyOtpSubmit(); }, 120);
        }
      };
      input.removeEventListener('input', onInput);
      input.addEventListener('input', onInput);
      window.__rp_handlers.otpInputs.push({ el: input, handlers: { input: onInput } });
      log('wireOtpInputs: wired single input auto-submit');
      return;
    }

    // multi-input case
    inputs.forEach((inp, idx) => {
      inp.setAttribute('inputmode','numeric');
      inp.setAttribute('maxlength','1');

      const onInput = (e) => {
        const v = inp.value;
        if (v && idx < inputs.length - 1) {
          try { inputs[idx+1].focus(); } catch(e){ dbg('focus next failed', e); }
        }
        const all = inputs.map(i => i.value.trim()).join('');
        dbg('wireOtpInputs(multi): collected', all);
        if (all.length === inputs.length) {
          blurOtpInputs();
          setTimeout(() => { verifyOtpSubmit(); }, 120);
        }
      };

      const onKeydown = (e) => {
        if (e.key === 'Backspace' && !inp.value && idx > 0) {
          try { inputs[idx-1].focus(); } catch(e){ dbg('focus prev failed', e); }
        }
      };

      inp.removeEventListener('input', onInput);
      inp.removeEventListener('keydown', onKeydown);
      inp.addEventListener('input', onInput);
      inp.addEventListener('keydown', onKeydown);
      window.__rp_handlers.otpInputs.push({ el: inp, handlers: { input: onInput, keydown: onKeydown } });
    });
    log('wireOtpInputs: wired multi-input handlers');
  }

  // Wire up buttons/handlers
  async function wire() {
    log('wire: start wiring UI');
    // trigger button (Reset now)
    const trigger = $(TRIGGER_ID);
    if (trigger) {
      window.__rp_handlers.onTriggerClicked = window.__rp_handlers.onTriggerClicked || onTriggerClicked;
      trigger.removeEventListener('click', window.__rp_handlers.onTriggerClicked);
      trigger.addEventListener('click', window.__rp_handlers.onTriggerClicked);
      log('wire: bound trigger', TRIGGER_ID);
    } else {
      warn('wire: trigger not found', TRIGGER_ID);
    }

    // resend button
    const resendBtn = $(RESEND_BTN_ID);
    if (resendBtn) {
      window.__rp_handlers.resendOtpHandler = window.__rp_handlers.resendOtpHandler || resendOtpHandler;
      resendBtn.removeEventListener('click', window.__rp_handlers.resendOtpHandler);
      resendBtn.addEventListener('click', window.__rp_handlers.resendOtpHandler);
      log('wire: bound resend', RESEND_BTN_ID);
    } else {
      warn('wire: resend button not found', RESEND_BTN_ID);
    }

    // open email
    const openEmailBtn = $(OPEN_EMAIL_BTN_ID);
    if (openEmailBtn) {
      window.__rp_handlers.onOpenEmailClick = window.__rp_handlers.onOpenEmailClick || onOpenEmailClick;
      openEmailBtn.removeEventListener('click', window.__rp_handlers.onOpenEmailClick);
      openEmailBtn.addEventListener('click', window.__rp_handlers.onOpenEmailClick);
      log('wire: bound open email', OPEN_EMAIL_BTN_ID);
    } else {
      warn('wire: open email button not found', OPEN_EMAIL_BTN_ID);
    }

    // verify button (form submit)
    const verifyBtn = $(VERIFY_BTN_ID);
    const otpForm = $(OTP_FORM_ID);
    if (otpForm) {
      // prefer form submit so user pressing Enter works
      window.__rp_handlers.verifyOtpSubmit = window.__rp_handlers.verifyOtpSubmit || verifyOtpSubmit;
      otpForm.removeEventListener('submit', window.__rp_handlers.verifyOtpSubmit);
      otpForm.addEventListener('submit', window.__rp_handlers.verifyOtpSubmit);
      log('wire: bound otp form submit', OTP_FORM_ID);
    } else if (verifyBtn) {
      window.__rp_handlers.verifyOtpSubmit = window.__rp_handlers.verifyOtpSubmit || verifyOtpSubmit;
      verifyBtn.removeEventListener('click', window.__rp_handlers.verifyOtpSubmit);
      verifyBtn.addEventListener('click', window.__rp_handlers.verifyOtpSubmit);
      log('wire: bound verify button fallback', VERIFY_BTN_ID);
    } else {
      warn('wire: no verify button or otp form found', VERIFY_BTN_ID, OTP_FORM_ID);
    }

    // wire OTP input(s)
    wireOtpInputs();

    // show full/masked email
    const fullEl = $(FULL_EMAIL_ID);
    const maskedEl = $(MASKED_EMAIL_ID);
    const email = await getUserEmail();
    log('wire: user email for display ->', email || '(none)');

    if (fullEl && email) {
      fullEl.textContent = email;
      if (maskedEl) maskedEl.textContent = email;
      log('wire: wrote email to full-email element and masked element');
    } else if (maskedEl && email) {
      // prefer showing full email as requested
      maskedEl.textContent = email;
      log('wire: wrote email to masked element (as full)', MASKED_EMAIL_ID);
    } else {
      dbg('wire: no elements to display email or no email available');
    }

    log('wire: completed wiring');
  }

  // Trigger handler: send resend-otp and open modal
  async function onTriggerClicked(e) {
    e && e.preventDefault && e.preventDefault();
    log('onTriggerClicked: invoked');
    const btn = e && e.currentTarget ? e.currentTarget : $(TRIGGER_ID);
    if (!btn) { warn('onTriggerClicked: no button element'); return; }
    if (btn.disabled) { dbg('onTriggerClicked: button disabled'); return; }

    btn.disabled = true;
    if (!btn.dataset._origText) btn.dataset._origText = btn.textContent || '';
    btn.textContent = 'Preparing…';

    const email = await getUserEmail();
    log('onTriggerClicked: email ->', email || '(none)');
    if (!email) {
      btn.disabled = false;
      if (btn.dataset._origText) { btn.textContent = btn.dataset._origText; delete btn.dataset._origText; }
      alert('Unable to find your account email. Set mockEmail in localStorage for dev.');
      warn('onTriggerClicked: no email, abort');
      return;
    }

    // show email in modal if present
    const maskedEl = $(MASKED_EMAIL_ID);
    const fullEl = $(FULL_EMAIL_ID);
    try {
      const parts = email.split('@');
      if (maskedEl) maskedEl.textContent = email; // show full as requested
      if (fullEl) fullEl.textContent = email;
      dbg('onTriggerClicked: displayed email in modal elements', { masked: !!maskedEl, full: !!fullEl });
    } catch (e) { warn('onTriggerClicked: failed to display email', e); }

    // send request to server to resend OTP
    try {
      const { status, body } = await postJson(SERVER_RESEND_OTP, { email });
      log('onTriggerClicked: resend-otp response', status, body);
      if (status >= 200 && status < 300) {
        // open modal
        const opened = (window.ModalManager && typeof window.ModalManager.openModal === 'function')
          ? (function(){ try { window.ModalManager.openModal(RESET_MODAL_ID); return true; } catch(e){ dbg('ModalManager.openModal failed', e); return false; } })()
          : (function(){ const el = $(RESET_MODAL_ID); if (el) { el.classList.remove('hidden'); el.style.display = 'flex'; el.setAttribute('aria-hidden','false'); return true; } return false; })();

        if (!opened) {
          alert('Modal could not be opened automatically. Check console.');
          warn('onTriggerClicked: failed to open reset modal');
        } else {
          dbg('onTriggerClicked: reset modal opened; wiring OTP inputs after small delay');
          setTimeout(() => { try { wireOtpInputs(); } catch(e){ dbg('wireOtpInputs after open threw', e); } }, 40);
        }

        // start resend cooldown
        startResendCountdown(60);
      } else {
        const errMsg = body?.error?.message || body?.message || 'Failed to send OTP';
        alert('Resend OTP failed: ' + errMsg);
        warn('onTriggerClicked: resend failed', status, errMsg);
      }
    } catch (e) {
      err('onTriggerClicked: failed to call resend otp', e);
      alert('Failed to send OTP. See console for details.');
    } finally {
      btn.disabled = false;
      if (btn.dataset._origText) { btn.textContent = btn.dataset._origText; delete btn.dataset._origText; }
      log('onTriggerClicked: finished');
    }
  }

  // open-email button handler
  async function onOpenEmailClick(e) {
    e && e.preventDefault && e.preventDefault();
    log('onOpenEmailClick: start');
    const email = await getUserEmail();
    log('onOpenEmailClick: resolved email ->', email || '(none)');
    openEmailClient(email);
    log('onOpenEmailClick: end');
  }

  // Init wiring once DOM ready
  function initAutoWire() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wire);
      log('initAutoWire: waiting for DOMContentLoaded');
    } else {
      wire();
      log('initAutoWire: wired immediately (DOM ready)');
    }
  }
  initAutoWire();

  // Expose debug helpers
  window.__rp_wire_debug = Object.assign(window.__rp_wire_debug || {}, {
    getUserEmail,
    openEmailClient,
    postJson,
    SERVER_RESEND_OTP,
    SERVER_VERIFY_OTP,
    wire,
    rewire: wire,
    verifyOtpSubmit,
    resendOtpHandler,
    startResendCountdown
  });

  log('resetPin module v5 loaded');
})();
