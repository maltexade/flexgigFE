// rp-reset-pin.js
// Reset PIN wiring + OTP verification + nice notifications
// Drop this after your ModalManager + dashboard scripts
(function rpResetPinModule(){
  'use strict';

  const DEBUG = true;
  const log = (...args) => { if (DEBUG) console.debug('[RP-RESET]', ...args); };

  // --- CONFIG ---
  const TRIGGER_ID = 'resetPinBtn';        // button inside securityPinModal
  const RESET_MODAL_ID = 'resetPinModal';  // id of the reset modal container
  const MASKED_EMAIL_ID = 'mp-masked-email';
  const MP_RESEND_BTN_ID = 'mp-resend-btn';
  const MP_OTP_FORM_ID = 'mp-otp-form';
  const MP_OTP_INPUT_ID = 'mp-otp-input';
  const MP_OPEN_EMAIL_BTN_ID = 'mp-open-email-btn';
  const MP_RESET_BTN_ID = 'mp-reset-btn';

  // Api base - set window.__SEC_API_BASE = 'https://api.flexgig.com.ng' before load
  const API_BASE = (window.__SEC_API_BASE || '').replace(/\/$/, '');
  const ENDPOINTS = {
    resendOtp: API_BASE ? `${API_BASE}/auth/resend-otp` : '/auth/resend-otp',
    verifyOtp: API_BASE ? `${API_BASE}/auth/verify-otp` : '/auth/verify-otp'
  };

  // --- NOTIFICATION DETECTION / WRAPPER ---
  // Attempts to detect common global notifiers and use them; returns the name used.
  function detectNotifier() {
    const tries = [
      'notify',         // custom
      'toast',          // generic
      'toastr',         // toastr
      'iziToast',       // iziToast
      'Flash',          // some apps
      'appNotify',      // custom
      'showToast',      // custom
      'showNotification',// generic
      '__notify',       // custom
      'windowNotify'    // hypothetical
    ];
    for (const name of tries) {
      const fn = window[name];
      if (typeof fn === 'function') return { name, fn };
      // some libs attach objects like toastr.info(...)
      if (window[name] && typeof window[name].info === 'function') return { name, fn: window[name].info.bind(window[name]) };
    }
    // try a common pattern: window.App && App.notify
    if (window.App && typeof window.App.notify === 'function') return { name: 'App.notify', fn: window.App.notify.bind(window.App) };
    if (window.dashboard && typeof window.dashboard.notify === 'function') return { name: 'dashboard.notify', fn: window.dashboard.notify.bind(window.dashboard) };
    return null;
  }

  const detectedNotifier = detectNotifier();
  function notify(message, type = 'info', opts = {}) {
    // type can be 'info','success','error','warn'
    if (detectedNotifier && typeof detectedNotifier.fn === 'function') {
      try {
        // attempt common signatures
        // toastr-like: toastr[type](message)
        if (detectedNotifier.name === 'toastr' || detectedNotifier.name === 'iziToast') {
          if (typeof window[detectedNotifier.name][type] === 'function') {
            window[detectedNotifier.name][type](message);
            return;
          }
        }
        // toast-like single arg
        detectedNotifier.fn(message, { type, ...opts });
        return;
      } catch (e) {
        console.warn('[RP-RESET] notifier invoked but errored', e);
      }
    }

    // fallback to simple UI: small inline toast element (if not available) or alert
    if (opts.fallbackToInline !== false) {
      inlineToast(message, type);
      return;
    }
    // last resort
    alert(message);
  }

  // small inline toast fallback (temporary)
  function inlineToast(message, type = 'info') {
    try {
      let holder = document.getElementById('__rp_inline_toast_holder');
      if (!holder) {
        holder = document.createElement('div');
        holder.id = '__rp_inline_toast_holder';
        holder.style.position = 'fixed';
        holder.style.right = '16px';
        holder.style.top = '16px';
        holder.style.zIndex = 65535;
        holder.style.pointerEvents = 'none';
        document.body.appendChild(holder);
      }
      const el = document.createElement('div');
      el.className = '__rp_inline_toast';
      el.style.pointerEvents = 'auto';
      el.style.marginTop = '8px';
      el.style.background = (type === 'error' ? '#662222' : type === 'success' ? '#1a7f3a' : '#253858');
      el.style.color = '#fff';
      el.style.padding = '10px 14px';
      el.style.borderRadius = '10px';
      el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
      el.textContent = message;
      holder.appendChild(el);
      setTimeout(()=> {
        el.style.transition = 'transform .28s ease, opacity .28s ease';
        el.style.opacity = '0';
        el.style.transform = 'translateY(-8px)';
      }, 3000);
      setTimeout(()=>holder.removeChild(el), 3400);
    } catch (e) {
      console.error('[RP-RESET] inlineToast failed', e);
      try { alert(message); } catch (er) {}
    }
  }

  // expose notifier detection result
  window.__rp_reset_notifier = {
    detected: !!detectedNotifier,
    name: detectedNotifier ? detectedNotifier.name : null
  };
  if (DEBUG) log('Notifier:', window.__rp_reset_notifier);

  // --- UTILITIES ---
  const $ = id => document.getElementById(id);

  function maskEmail(email) {
    if (!email) return '';
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const name = parts[0];
    const domain = parts[1];
    return (name.length <= 2 ? name : name.slice(0,2) + '…') + '@' + domain;
  }

  function openModal(modalId) {
    if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
      try { window.ModalManager.openModal(modalId); return true; } catch(e) { log('ModalManager.openModal threw', e); }
    }
    // fallback direct DOM
    const el = $(modalId);
    if (!el) return false;
    el.classList.remove('hidden');
    el.style.display = el.dataset.hasPullHandle === 'true' ? 'block' : 'flex';
    el.setAttribute('aria-hidden', 'false');
    el.style.zIndex = 12000;
    return true;
  }

  function closeModal(modalId) {
    if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') {
      try { window.ModalManager.closeModal(modalId); return true; } catch(e) { log('ModalManager.closeModal threw', e); }
    }
    const el = $(modalId);
    if (!el) return false;
    el.classList.add('hidden');
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
    return true;
  }

  async function postJson(url, data) {
    log('POST', url, data);
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    const txt = await res.text();
    try { return JSON.parse(txt); } catch(e) { return txt; }
  }

  // --- TIMER / RESEND UI ---
  const timerState = { timerId: null, remaining: 0 };

  function startResendTimer(seconds = 60) {
    const btn = $(MP_RESEND_BTN_ID);
    if (!btn) return;
    stopResendTimer();
    timerState.remaining = seconds;
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.textContent = `Resend OTP (${timerState.remaining}s)`;
    timerState.timerId = setInterval(() => {
      timerState.remaining -= 1;
      if (timerState.remaining <= 0) {
        stopResendTimer();
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
        btn.textContent = 'Resend OTP';
        return;
      }
      btn.textContent = `Resend OTP (${timerState.remaining}s)`;
    }, 1000);
  }

  function stopResendTimer() {
    if (timerState.timerId) {
      clearInterval(timerState.timerId);
      timerState.timerId = null;
      timerState.remaining = 0;
    }
  }

  // --- EMAIL OPEN HELPERS ---
  function openEmailApp() {
    // Modern: try mailto: for email app;
    // For dev/testing on mobile it may prompt to open Gmail/TMail
    const email = window.__SERVER_USER_DATA__?.email || localStorage.getItem('mockEmail') || '';
    const mailto = `mailto:${email}`;
    try {
      window.location.href = mailto;
      return;
    } catch (e) {
      // fallback: copy email to clipboard and notify user
      try {
        navigator.clipboard.writeText(email || '');
        notify('Email copied to clipboard. Open your email app and paste to search.', 'info');
      } catch (err) {
        notify('Unable to open email app. Please check your device.', 'error');
      }
    }
  }

  // --- MAIN FLOW HANDLERS ---
  async function getUserEmail() {
    // Try dashboard getSession() if available and returns an object
    try {
      const gs = window.getSession || (window.dashboard && window.dashboard.getSession);
      if (typeof gs === 'function') {
        try {
          const session = await gs();
          if (session) {
            if (session.email) return session.email;
            if (session.user && session.user.email) return session.user.email;
            if (session.data && session.data.user && session.data.user.email) return session.data.user.email;
          }
        } catch (e) {
          log('getSession() call failed', e);
        }
      }
    } catch (e) { /* ignore */ }

    if (window.__SERVER_USER_DATA__ && window.__SERVER_USER_DATA__.email) return window.__SERVER_USER_DATA__.email;
    const fb = localStorage.getItem('mockEmail') || localStorage.getItem('__mock_email') || localStorage.getItem('dev_email');
    if (fb) return fb;
    return '';
  }

  async function onTriggerClicked(e) {
    e.preventDefault();
    const btn = e.currentTarget || $(TRIGGER_ID);
    if (!btn) return;
    if (btn.disabled) return;

    try {
      btn.disabled = true;
      btn.dataset.origText = btn.textContent;
      btn.textContent = 'Preparing…';

      const email = await getUserEmail();
      if (!email) {
        notify('Unable to locate account email. For dev: localStorage.setItem(\"mockEmail\",\"you@dev.com\");', 'error');
        btn.disabled = false;
        if (btn.dataset.origText) btn.textContent = btn.dataset.origText;
        return;
      }

      // mask email in modal
      const maskedEl = $(MASKED_EMAIL_ID);
      if (maskedEl) maskedEl.textContent = maskEmail(email);

      btn.textContent = 'Sending OTP…';

      // call resend endpoint
      const resp = await postJson(ENDPOINTS.resendOtp, { email });
      log('resend response', resp);

      // handle response heuristics
      if (resp && (resp.success === true || resp.status === 'ok' || resp.code === 200)) {
        notify('OTP sent to your email', 'success');
      } else {
        // some backends return message object etc
        if (resp && resp.message) notify(resp.message, 'info'); else notify('OTP request completed (check email).', 'info');
      }

      // open modal
      const opened = openModal(RESET_MODAL_ID);
      if (!opened) {
        notify('Could not open reset modal automatically.', 'error');
      } else {
        // start resend timer (60s default)
        startResendTimer(60);
      }
    } catch (err) {
      console.error('[RP-RESET] onTriggerClicked error', err);
      notify('Failed to send OTP — see console', 'error');
    } finally {
      // restore trigger
      const btnEl = $(TRIGGER_ID);
      if (btnEl) {
        btnEl.disabled = false;
        if (btnEl.dataset.origText) { btnEl.textContent = btnEl.dataset.origText; delete btnEl.dataset.origText; }
      }
    }
  }

  async function onResendClicked(e) {
    e.preventDefault();
    const btn = e.currentTarget || $(MP_RESEND_BTN_ID);
    if (!btn || btn.disabled) return;
    try {
      btn.disabled = true;
      btn.textContent = 'Resending…';
      const email = await getUserEmail();
      if (!email) {
        notify('Cannot find account email for resend', 'error');
        return;
      }
      const r = await postJson(ENDPOINTS.resendOtp, { email });
      log('resend result', r);
      notify('OTP resent. Check your email.', 'success');
      startResendTimer(60);
    } catch (err) {
      console.error('Resend failed', err);
      notify('Failed to resend OTP', 'error');
      btn.disabled = false;
      btn.textContent = 'Resend OTP';
    }
  }

  async function onOpenEmailClicked(e) {
    e.preventDefault();
    openEmailApp();
  }

  async function onOtpSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget || $(MP_OTP_FORM_ID);
    if (!form) return;
    const input = $(MP_OTP_INPUT_ID);
    if (!input) return;
    const otp = (input.value || '').trim();
    if (!otp) {
      notify('Please enter the OTP', 'error');
      return;
    }

    // Attempt verify endpoint
    try {
      const payload = { otp, reason: 'reset_pin' }; // backend may accept reason
      const resp = await postJson(ENDPOINTS.verifyOtp, payload);
      log('verify resp', resp);

      // Heuristic response handling - adjust to your backend shape
      if (resp && (resp.success === true || resp.verified === true || resp.status === 'ok')) {
        notify('OTP verified. You may now reset your PIN.', 'success');
        // optionally close modal or proceed — here we close modal as verification passed
        closeModal(RESET_MODAL_ID);
        stopResendTimer();
        // dispatch an event so other code can continue the reset flow
        document.dispatchEvent(new CustomEvent('rp:otp-verified', { detail: { otp, resp } }));
      } else {
        // Show wrong OTP message specifically
        const msg = (resp && resp.message) ? resp.message : 'Invalid OTP. Please try again.';
        notify(msg, 'error');
        // animate input (shake)
        try {
          input.classList.remove('rp-shake');
          // force reflow
          void input.offsetWidth;
          input.classList.add('rp-shake');
          setTimeout(()=>input.classList.remove('rp-shake'), 600);
        } catch (e) {}
      }
    } catch (err) {
      console.error('OTP verify failed', err);
      notify('Failed to verify OTP — see console', 'error');
    }
  }

  // --- WIRING ---
  function wire() {
    // trigger
    const trigger = $(TRIGGER_ID);
    if (trigger) {
      trigger.removeEventListener('click', onTriggerClicked);
      trigger.addEventListener('click', onTriggerClicked);
      log('Wired trigger', TRIGGER_ID);
    } else {
      log('Trigger not found:', TRIGGER_ID);
    }

    // resend
    const resendBtn = $(MP_RESEND_BTN_ID);
    if (resendBtn) {
      resendBtn.removeEventListener('click', onResendClicked);
      resendBtn.addEventListener('click', onResendClicked);
      log('Wired resend', MP_RESEND_BTN_ID);
    } else {
      log('Resend button not found:', MP_RESEND_BTN_ID);
    }

    // open email
    const openEmailBtn = $(MP_OPEN_EMAIL_BTN_ID);
    if (openEmailBtn) {
      openEmailBtn.removeEventListener('click', onOpenEmailClicked);
      openEmailBtn.addEventListener('click', onOpenEmailClicked);
      log('Wired open email', MP_OPEN_EMAIL_BTN_ID);
    } else {
      log('Open email button not found:', MP_OPEN_EMAIL_BTN_ID);
    }

    // OTP form submit
    const otpForm = $(MP_OTP_FORM_ID);
    if (otpForm) {
      otpForm.removeEventListener('submit', onOtpSubmit);
      otpForm.addEventListener('submit', onOtpSubmit);
      log('Wired OTP form', MP_OTP_FORM_ID);
    } else {
      log('OTP form not found:', MP_OTP_FORM_ID);
    }

    // small style for input shake
    if (!document.getElementById('__rp_reset_styles')) {
      const s = document.createElement('style');
      s.id = '__rp_reset_styles';
      s.textContent = `
        .rp-shake { animation: rp-shake 0.5s; }
        @keyframes rp-shake {
          0%{ transform: translateX(0) } 20%{ transform: translateX(-6px) } 40%{ transform: translateX(6px) } 60%{ transform: translateX(-4px) } 80%{ transform: translateX(4px) } 100%{ transform: translateX(0) }
        }
      `;
      document.head.appendChild(s);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }

  // Expose debug helpers
  window.__rp_reset = {
    wire,
    startResendTimer,
    stopResendTimer,
    openModal: () => openModal(RESET_MODAL_ID),
    closeModal: () => closeModal(RESET_MODAL_ID),
    getDetectedNotifier: () => window.__rp_reset_notifier,
    endpoints: ENDPOINTS
  };

  log('module loaded', window.__rp_reset_notifier, ENDPOINTS);
})();
