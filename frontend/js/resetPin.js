// resetPin.js
// v6 — Updated: closes all modals after PIN set, notification UI, and improved resend OTP flow.
// Integrates with ModalManager.closeAll(), dispatches 'pin-status-changed', and falls back to an in-DOM toast.

(function () {
  'use strict';

  const LOG_TAG = '[RP-WIRE-v6]';

  function log(...args) {
    try { console.log(LOG_TAG, ...args); } catch (e) {}
  }

  // ---------- Notification helper ----------
  // Prefers existing app notifier (common names tried). Falls back to a simple toast so UX is not lost.
  function showNotification(message = '', type = 'info', opts = {}) {
    // try a few common global notifiers
    const candidates = [
      window.notify,
      window.__notify,
      window.appNotify,
      window.toaster,
      window.__toaster,
      window._notify,
    ];

    for (const fn of candidates) {
      if (typeof fn === 'function') {
        try { fn({ message, type, ...opts }); return; } catch (e) { /* ignore and fallback */ }
      }
    }

    // Fallback: simple toast inserted into DOM
    (function createToast() {
      const id = 'rp-wire-toast';
      let wrapper = document.getElementById(id);
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = id;
        wrapper.style.position = 'fixed';
        wrapper.style.zIndex = 12000;
        wrapper.style.right = '16px';
        wrapper.style.top = '16px';
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '8px';
        document.body.appendChild(wrapper);
      }

      const toast = document.createElement('div');
      toast.className = `rp-toast rp-toast-${type}`;
      toast.style.minWidth = '180px';
      toast.style.padding = '10px 14px';
      toast.style.borderRadius = '10px';
      toast.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
      toast.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
      toast.style.fontSize = '13px';
      toast.style.lineHeight = '1.2';
      toast.style.background = (type === 'error') ? '#ffe6e6' : (type === 'success') ? '#e9ffef' : '#fff9e6';
      toast.style.color = '#111';
      toast.style.border = '1px solid rgba(0,0,0,0.06)';
      toast.textContent = message;

      wrapper.appendChild(toast);
      // auto remove
      setTimeout(() => {
        toast.style.transition = 'opacity 220ms ease, transform 220ms ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-6px)';
        setTimeout(() => toast.remove(), 260);
      }, opts.duration || 4000);
    })();
  }

  // ---------- Resend OTP timer manager ----------
  const defaultCountdownSeconds = 60;
  let countdownTimer = null;
  let countdownRemaining = 0;

  // selectors (try to be flexible)
  const resetModalId = 'resetPinModal';
  const resetModal = () => document.getElementById(resetModalId);
  const resendBtnSelectorCandidates = [
    '#resendOtpBtn',
    '[data-resend-otp]',
    '.resend-otp-btn'
  ];

  function findResendEl() {
    const modal = resetModal();
    if (!modal) return null;
    for (const sel of resendBtnSelectorCandidates) {
      const el = modal.querySelector(sel) || document.querySelector(sel);
      if (el) return el;
    }
    // last resort: look for element with text 'Resend'
    const fallback = Array.from(modal.querySelectorAll('button, a, span')).find(n => /resend/i.test(n.textContent));
    return fallback || null;
  }

  function formatResendText(sec) {
    // while counting show "Resend OTP · 60s" (or similar). When finished, show "Resend OTP".
    if (sec > 0) return `Resend OTP · ${sec}s`;
    return 'Resend OTP';
  }

  function updateResendUI(sec) {
    const el = findResendEl();
    if (!el) return;
    // Prefer setting textContent; if it's a button with children, try a small span
    if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'SPAN') {
      el.textContent = formatResendText(sec);
      // set disabled state while counting
      if (sec > 0) {
        el.setAttribute('aria-disabled', 'true');
        el.disabled = true;
        el.classList && el.classList.add('disabled');
      } else {
        el.removeAttribute('aria-disabled');
        el.disabled = false;
        el.classList && el.classList.remove('disabled');
      }
    } else {
      // fallback: set dataset for CSS
      el.dataset.resendText = formatResendText(sec);
    }
  }

  function startResendCountdown(seconds = defaultCountdownSeconds) {
    stopResendCountdown(); // ensure no duplicate timers
    countdownRemaining = Math.max(0, Math.floor(seconds));
    updateResendUI(countdownRemaining);
    if (countdownRemaining <= 0) {
      // immediate ready state
      updateResendUI(0);
      return;
    }

    countdownTimer = setInterval(() => {
      countdownRemaining = Math.max(0, countdownRemaining - 1);
      updateResendUI(countdownRemaining);
      if (countdownRemaining <= 0) {
        stopResendCountdown();
        updateResendUI(0);
        log('startResendCountdown: finished, resend enabled');
      }
    }, 1000);
  }

  function stopResendCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    countdownRemaining = 0;
  }

  // ---------- OTP send/verify helpers ----------
  // Use data attributes on the modal if present to avoid hardcoding endpoints.
  function getResetModalEndpoint(name, fallback) {
    const modal = resetModal();
    if (!modal) return fallback;
    const attr = modal.dataset && modal.dataset[name];
    return attr || fallback;
  }

  async function sendOtp(email) {
    const endpoint = getResetModalEndpoint('resendEndpoint', '/api/auth/resend-otp');
    log('sendOtp: sending OTP to', email, 'via', endpoint);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body && body.message ? body.message : `Failed to resend OTP (${res.status})`;
        showNotification(msg, 'error');
        return false;
      }
      showNotification('OTP resent', 'success');
      // restart countdown
      startResendCountdown(defaultCountdownSeconds);
      return true;
    } catch (err) {
      log('sendOtp: error', err);
      showNotification('Network error while resending OTP', 'error');
      return false;
    }
  }

  // Resolve user's email from session or fallback fields (non-invasive: don't force a session refresh)
  function getUserEmail() {
    try {
      // try common session locations
      if (window.session && window.session.user && window.session.user.email) return window.session.user.email;
      if (window.__session && window.__session.user && window.__session.user.email) return window.__session.user.email;
      // fallback to a global 'user' object
      if (window.user && window.user.email) return window.user.email;
      // try to find a hidden field inside modal
      const modal = resetModal();
      if (modal) {
        const hidden = modal.querySelector('input[type="hidden"][name="email"], input[data-email]');
        if (hidden) return hidden.value || hidden.dataset.email || null;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // Wire click on Resend UI
  function wireResendClick() {
    const el = findResendEl();
    if (!el) return;
    // remove previous handler if any
    if (el._rp_resendHandler) el.removeEventListener('click', el._rp_resendHandler);
    const handler = async (e) => {
      e.preventDefault();
      // if countdown active, ignore
      if (countdownRemaining > 0) {
        log('resend click ignored while counting', countdownRemaining);
        return;
      }
      const email = getUserEmail();
      if (!email) {
        showNotification('Cannot find email to resend OTP', 'error');
        return;
      }
      await sendOtp(email);
    };
    el._rp_resendHandler = handler;
    el.addEventListener('click', handler);
  }

  // ---------- OTP inputs wiring (supports single-field auto-submit or multi-digit boxes) ----------
  function wireOtpInputs(modalEl) {
    if (!modalEl) modalEl = resetModal();
    if (!modalEl) return;

    // strategy: look for inputs with class "otp-input" OR inputs inside a container .otp-group
    const inputs = Array.from(modalEl.querySelectorAll('input.otp-input, .otp-group input, input[data-otp]'));
    if (inputs.length === 0) {
      // single field fallback
      const single = modalEl.querySelector('input[type="text"].otp, input[name="otp"], input[id*="otp"]');
      if (single) {
        single.addEventListener('input', function onAutoSubmit() {
          // auto-submit if length >= 4 (or 6) — try to be lenient
          const v = (this.value || '').trim();
          if (v.length >= 4) {
            this.removeEventListener('input', onAutoSubmit);
            // delegate to submit handler
            const submitBtn = modalEl.querySelector('button[type="submit"], button[data-submit-otp]');
            if (submitBtn) submitBtn.click();
            else verifyOtpSubmit(v);
          }
        });
        log('wireOtpInputs: wired single input auto-submit');
        return;
      }
      log('wireOtpInputs: no otp inputs found in modal');
      return;
    }

    // If multiple inputs: wire navigation & auto-join
    inputs.forEach((input, idx) => {
      input.maxLength = 1;
      input.setAttribute('inputmode', 'numeric');
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && input.value === '') {
          const prev = inputs[idx - 1];
          if (prev) { prev.focus(); prev.select(); e.preventDefault(); }
        }
      });
      input.addEventListener('input', () => {
        if (input.value.length > 0) {
          const next = inputs[idx + 1];
          if (next) { next.focus(); next.select(); }
        }
        // auto-submit if all filled
        const joined = inputs.map(i => i.value || '').join('');
        if (joined.length >= inputs.length && inputs.length > 1) {
          verifyOtpSubmit(joined);
        }
      });
    });

    log('wireOtpInputs: count', inputs.length);
  }

  // ---------- OTP verify (submit) ----------
  async function verifyOtpSubmit(otpValue) {
    log('verifyOtpSubmit: start');

    const modal = resetModal();
    let otp = otpValue;
    if (!otp) {
      // try to collect from inputs
      if (modal) {
        const multi = Array.from(modal.querySelectorAll('input.otp-input, .otp-group input, input[data-otp]')).map(i => i.value || '').join('');
        otp = multi || modal.querySelector('input[name="otp"]')?.value;
      }
    }

    if (!otp || otp.length < 3) {
      showNotification('Enter the OTP first', 'error');
      log('verifyOtpSubmit: missing OTP');
      return;
    }

    // resolve email (non-invasive)
    const email = getUserEmail();
    if (!email) {
      showNotification('Missing email — cannot verify OTP', 'error');
      return;
    }

    const endpoint = getResetModalEndpoint('verifyEndpoint', '/api/auth/verify-reset-otp');
    log('verifyOtpSubmit: posting to', endpoint, 'email:', email);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, otp }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = payload.message || `OTP verify failed (${res.status})`;
        showNotification(msg, 'error');
        log('verifyOtpSubmit: server error', payload);
        return;
      }

      // OTP verified; server may return token/user
      log('verifyOtpSubmit: server 200', payload);
      showNotification(payload.message || 'OTP verified', 'success');

      // dispatch an event so other modules can respond if they want
      document.dispatchEvent(new CustomEvent('reset-pin:otp-verified', { detail: payload }));

      // open pin modal (if exists), and close reset modal
      if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
        // Open PIN modal (lazy)
        try { window.ModalManager.openModal('pinModal'); } catch (e) { log('open pinModal failed', e); }
      } else {
        // fallback: try to reveal element with id "pinModal"
        const pm = document.getElementById('pinModal');
        if (pm) {
          pm.classList.remove('hidden');
          pm.style.display = 'flex';
          pm.setAttribute('aria-hidden', 'false');
        }
      }

      // close this reset modal
      if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') {
        try { window.ModalManager.forceCloseModal ? window.ModalManager.forceCloseModal('resetPinModal') : window.ModalManager.closeModal('resetPinModal'); } catch (e) { log('close reset modal failed', e); }
      } else if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
      }

      // let the PIN modal handle the remaining flow (user enters new pin).
      // We'll listen for a custom event 'reset-pin:pin-created' dispatched by the PIN modal logic
      // (If not present, we'll still provide a public helper that PIN-setup code SHOULD call).
      log('verifyOtpSubmit: end');

    } catch (err) {
      log('verifyOtpSubmit: network/exception', err);
      showNotification('Network error while verifying OTP', 'error');
    }
  }

  // ---------- Handler for when the actual PIN has been set ----------
  // This function should be invoked by the PIN setup logic after it successfully set the user's new PIN.
  // We'll close all modals, dispatch pin-status-changed, and show a notification — all smoothly.
  async function handlePinSetupSuccess(payload = {}) {
    log('handlePinSetupSuccess: entry', payload);

    // close all modals (stack cleaned by your ModalManager)
    try {
      if (window.ModalManager && typeof window.ModalManager.closeAll === 'function') {
        window.ModalManager.closeAll();
      } else if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') {
        // fallback: manually close known modal ids
        ['pinModal', 'resetPinModal', 'securityPinModal', 'securityModal', 'settingsModal'].forEach(id => {
          try { window.ModalManager.forceCloseModal ? window.ModalManager.forceCloseModal(id) : window.ModalManager.closeModal(id); } catch (e) {}
        });
      } else {
        // last resort: hide any element with role=dialog inside body
        document.querySelectorAll('.modal, [role="dialog"], .pin-modal').forEach(el => {
          el.classList.add('hidden');
          el.style.display = 'none';
          el.setAttribute('aria-hidden', 'true');
        });
      }
    } catch (e) { log('handlePinSetupSuccess: closeAll failed', e); }

    // notify the app that the pin status changed (your dashboard listens to 'pin-status-changed')
    try {
      document.dispatchEvent(new CustomEvent('pin-status-changed', { detail: { source: 'resetPin', payload } }));
      log('handlePinSetupSuccess: dispatched pin-status-changed');
    } catch (e) { log('handlePinSetupSuccess: dispatch failed', e); }

    // show a friendly notification
    showNotification('PIN successfully updated — all set!', 'success');

    // Optionally set a small visual focus on the dashboard area (if your app has a #dashboard element)
    try {
      const dash = document.getElementById('dashboard') || document.querySelector('.dashboard-main');
      if (dash) {
        // subtle focus for screen readers & keyboard users
        dash.setAttribute('tabindex', '-1');
        dash.focus({ preventScroll: true });
        setTimeout(() => dash.removeAttribute('tabindex'), 800);
      }
    } catch (e) { /* ignore */ }
  }

  // Provide a public API for the PIN modal code to call after successful PIN setup.
  // Example: window.ResetPin && window.ResetPin.onPinCreated()
  window.ResetPin = window.ResetPin || {};
  window.ResetPin.onPinCreated = function (payload) {
    // payload may contain server response
    handlePinSetupSuccess(payload);
  };

  // If the PIN setup code already dispatches an event, wire to it:
  document.addEventListener('reset-pin:pin-created', (e) => {
    handlePinSetupSuccess(e && e.detail ? e.detail : {});
  });

  // ---------- Initialization ----------
  function initializeResetPin() {
    log('initialize: start');

    // wire resend button
    wireResendClick();

    // start default countdown only when modal is opened (listen for modal open)
    const modal = resetModal();
    if (modal) {
      // if modal contains attribute data-auto-start="true" start immediately
      if (modal.dataset && modal.dataset.autoStart === 'true') {
        startResendCountdown(defaultCountdownSeconds);
      }

      // start countdown when modal becomes visible via MutationObserver (so it reacts to open)
      const mo = new MutationObserver(() => {
        if (!modal) return;
        const visible = modal.getAttribute('aria-hidden') === 'false' || !modal.classList.contains('hidden');
        if (visible && countdownRemaining === 0) {
          // start only if not already counting
          startResendCountdown(defaultCountdownSeconds);
        }
      });
      mo.observe(modal, { attributes: true, attributeFilter: ['class', 'aria-hidden', 'style'] });
      // no need to store mo reference unless you want to disconnect later
    }

    // wire OTP inputs if modal already present
    wireOtpInputs(modal);

    // wire submit buttons inside modal to call verifyOtpSubmit()
    if (modal) {
      const submitBtn = modal.querySelector('button[type="submit"], button[data-submit-otp]');
      if (submitBtn) {
        submitBtn.addEventListener('click', (e) => {
          e.preventDefault();
          verifyOtpSubmit();
        });
      }
    }

    // also wire any forms
    document.addEventListener('submit', (ev) => {
      const form = ev.target;
      if (!form) return;
      if (form.closest && form.closest(`#${resetModalId}`)) {
        ev.preventDefault();
        verifyOtpSubmit();
      }
    }, true);

    // Final: wire a global cleanup on unload
    window.addEventListener('beforeunload', () => {
      stopResendCountdown();
    });

    log('initialize: done');
  }

  // Auto-run initialize on DOM ready (or immediately if DOM is already ready)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeResetPin);
  } else {
    initializeResetPin();
  }

  // Expose small utilities for debugging
  window.ResetPin._startResendCountdown = startResendCountdown;
  window.ResetPin._stopResendCountdown = stopResendCountdown;
  window.ResetPin._verifyOtpSubmit = verifyOtpSubmit;

})();
