// resetPin.js  — rpWireResetFlow_v4
(function rpWireResetFlow_v4(){
  'use strict';

  const DEBUG = true;
  const log = (...a) => { if (DEBUG) console.debug('[RP-WIRE-v4]', ...a); };

  // IDs used in your HTML (do not change unless you changed HTML)
  const TRIGGER_ID = 'resetPinBtn';
  const RESET_MODAL_ID = 'resetPinModal';
  const MASKED_EMAIL_ID = 'mp-masked-email';
  const OTP_INPUT_ID = 'mp-otp-input';
  const RESEND_BTN_ID = 'mp-resend-btn';
  const OPEN_EMAIL_BTN_ID = 'mp-open-email-btn';
  const VERIFY_BTN_ID = 'mp-reset-btn';
  const OTP_FORM_ID = 'mp-otp-form';

  // API base (must be set on window)
  const API_BASE = (window.__SEC_API_BASE || '').replace(/\/$/, '');
  const SERVER_RESEND_OTP = API_BASE ? `${API_BASE}/auth/resend-otp` : '/auth/resend-otp';
  const SERVER_VERIFY_OTP = API_BASE ? `${API_BASE}/auth/verify-otp` : '/auth/verify-otp';

  // small element helper
  const $ = id => document.getElementById(id);

  // --------- Dev fallback keys ----------
  function getDevEmailFallback() {
    return localStorage.getItem('mockEmail') ||
           localStorage.getItem('__mock_email') ||
           localStorage.getItem('dev_email') ||
           null;
  }

  // --------- Get user email (tries dashboard.getSession, window injection, localStorage) ----------
  async function getUserEmail() {
    try {
      // Try getSession exposed by dashboard (if available)
      const gs = window.getSession || (window.dashboard && window.dashboard.getSession) || null;
      if (typeof gs === 'function') {
        try {
          log('getUserEmail: calling getSession()');
          const session = await gs();
          log('getUserEmail: getSession() returned', session);
          if (session && session.email) return session.email;
          if (session && session.user && session.user.email) return session.user.email;
          if (session && session.data && session.data.email) return session.data.email;
          if (session && session.data && session.data.user && session.data.user.email) return session.data.user.email;
        } catch (err) {
          log('getUserEmail: getSession threw, falling back', err);
        }
      }

      // page-injected server data
      if (window.__SERVER_USER_DATA__ && window.__SERVER_USER_DATA__.email) {
        log('getUserEmail: using window.__SERVER_USER_DATA__');
        return window.__SERVER_USER_DATA__.email;
      }

      // localStorage dev fallback
      const fb = getDevEmailFallback();
      if (fb) {
        log('getUserEmail: using localStorage fallback');
        return fb;
      }

      log('getUserEmail: no email found');
      return '';
    } catch (e) {
      console.error('getUserEmail error', e);
      return '';
    }
  }

  // --------- POST JSON helper with debug ----------
  async function postJsonDebug(url, data, opts = {}) {
    log('[postJsonDebug] Request ➜', url);
    log('URL:', url);
    log('Method: POST');
    log('Credentials:', opts.credentials || 'default');
    log('Payload:', data);

    const res = await fetch(url, {
      method: 'POST',
      credentials: opts.credentials || 'same-origin',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data),
    });

    const text = await res.text();
    let parsed = text;
    try { parsed = JSON.parse(text); } catch(e) { /* keep text */ }

    log('[postJsonDebug] Response ◀', res.status, '—', url);
    log('Status:', res.status);
    log('Headers:');
    // iterate headers for debug
    try {
      for (const [k,v] of res.headers.entries()) {
        log(`   ${k} : ${v}`);
      }
    } catch(e){}

    log('Body:', parsed);
    return { status: res.status, ok: res.ok, body: parsed, rawText: text };
  }

  // --------- Safe modal open (ModalManager preferred) ----------
  function safeOpenModal(modalId) {
    const modalEl = $(modalId);
    if (!modalEl) {
      log('safeOpenModal: modal element not found', modalId);
      return false;
    }
    try {
      if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
        log('safeOpenModal: calling ModalManager.openModal', modalId);
        window.ModalManager.openModal(modalId);
        return true;
      }
      log('safeOpenModal: ModalManager not available, falling back to DOM show');
    } catch (e) {
      log('safeOpenModal: ModalManager.openModal threw', e);
    }

    // DOM fallback
    try {
      modalEl.classList.remove('hidden');
      modalEl.style.display = modalEl.dataset.hasPullHandle === 'true' ? 'block' : 'flex';
      modalEl.setAttribute('aria-hidden', 'false');
      modalEl.style.zIndex = 20000; // ensure on top
      modalEl.dispatchEvent(new CustomEvent('modal:opened', { bubbles: true }));
      log('safeOpenModal: fallback shown via DOM for', modalId);
      return true;
    } catch (e) {
      console.error('safeOpenModal fallback failed', e);
      return false;
    }
  }

  // --------- Resend timer logic ----------
  let resendTimer = null;
  function startResendCountdown(seconds = 60) {
    const btn = $(RESEND_BTN_ID);
    if (!btn) return;
    clearInterval(resendTimer);
    let remaining = seconds;
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.textContent = `Resend OTP (${remaining}s)`;

    resendTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(resendTimer);
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
        btn.textContent = 'Resend OTP';
        return;
      }
      btn.textContent = `Resend OTP (${remaining}s)`;
    }, 1000);
  }

  // --------- Try open email app (best-effort) ----------
  function openEmailAppPreferInbox() {
    // Try to open Gmail app inbox on Android via intent; fallback to Gmail web inbox; final fallback to mailto
    try {
      // On Android Chrome: intent URL to open Gmail app (inbox)
      const intentUrl = 'intent://mail.google.com/#Intent;package=com.google.android.gm;scheme=https;end';
      window.location.href = intentUrl;
      // If the above doesn't open (or on desktop) the next lines may still run; open web Gmail as fallback
      setTimeout(() => {
        // Desktop / web fallback to Gmail inbox
        window.open('https://mail.google.com/mail/u/0/#inbox', '_blank');
      }, 700);
    } catch (e) {
      // fallback to mailto (may open compose)
      window.open('mailto:', '_self');
    }
  }

  // --------- Helper: show notification area or alert ----------
  function showUserMessage(msg, type = 'info') {
    // Attempt to use your dashboard's notify helper if present
    try {
      if (window.notify) {
        window.notify({ message: msg, type });
        return;
      }
      if (window.__notify) {
        window.__notify(msg, type);
        return;
      }
    } catch (e) {}
    // fallback
    if (type === 'error') alert(`Error: ${msg}`);
    else alert(msg);
  }

  // --------- Wire OTP form submit (VERIFY OTP) ----------
  async function onOtpSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const otpInput = $(OTP_INPUT_ID);
    if (!otpInput) { log('onOtpSubmit: otp input missing'); return; }
    const otp = (otpInput.value || '').trim();
    if (!otp || otp.length < 4) {
      showUserMessage('Please enter the 6-digit OTP sent to your email', 'error');
      return;
    }

    // get email (we should have it prefilled when resend was called)
    let email = $(MASKED_EMAIL_ID)?.dataset?.fullEmail || '';
    if (!email) {
      email = await getUserEmail();
    }
    if (!email) {
      showUserMessage('Unable to find your account email. Please refresh and try again.', 'error');
      return;
    }

    // prepare payload matching server: { email, token }
    const payload = { email, token: otp };

    // debug / send
    let resp;
    try {
      resp = await postJsonDebug(SERVER_VERIFY_OTP, payload, { credentials: 'include' });
    } catch (err) {
      console.error('onOtpSubmit: network error verifying OTP', err);
      showUserMessage('Network error while verifying OTP. Check console.', 'error');
      return;
    }

    // handle server response
    if (!resp.ok) {
      // best-effort display error message from server body
      const body = resp.body || {};
      let msg = 'OTP verification failed';
      if (body && body.error && body.error.message) msg = body.error.message;
      else if (body && body.message) msg = body.message;
      log('verify-otp failed', resp);
      showUserMessage(msg, 'error');
      return;
    }

    // success -> server probably returned user session or status
    log('verify-otp success', resp.body);
    showUserMessage('OTP verified — you may now reset your PIN.', 'info');

    // blur OTP input to close keyboard on mobile
    try { otpInput.blur(); } catch(e){}

    // optionally close modal or proceed to PIN reset UI (you said next step is reset-pin button)
    // Here we leave modal open so user can press Reset PIN; you can close if desired:
    // safeCloseModal(RESET_MODAL_ID) or window.ModalManager.closeModal(...)
  }

  // --------- OTP input handler (auto blur on full length) ----------
  function otpInputHandler(e) {
    const el = e.currentTarget;
    const v = el.value || '';
    const max = parseInt(el.getAttribute('maxlength') || '6', 10) || 6;
    // strip non-digits
    el.value = (v.replace(/[^\d]/g,'')).slice(0, max);
    if (el.value.length >= max) {
      // close keyboard on mobile by blurring
      try { el.blur(); } catch(e){}
      // optionally auto-submit form
      const form = $(OTP_FORM_ID);
      if (form) {
        // small delay so user sees last digit
        setTimeout(()=> form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })), 150);
      }
    }
  }

  // --------- Resend button click ----------
  async function onResendClicked(e) {
    e.preventDefault();
    const btn = e.currentTarget;
    if (!btn || btn.disabled) return;

    // get email
    const maskedEl = $(MASKED_EMAIL_ID);
    let email = maskedEl?.dataset?.fullEmail || '';
    if (!email) email = await getUserEmail();
    if (!email) {
      showUserMessage('Unable to find email for resend. For dev: set localStorage mockEmail then refresh.', 'error');
      return;
    }

    // visual feedback
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.textContent = 'Sending…';

    // call resend
    let resp;
    try {
      resp = await postJsonDebug(SERVER_RESEND_OTP, { email }, { credentials: 'include' });
    } catch (err) {
      console.error('Resend OTP network error', err);
      showUserMessage('Network error. See console.', 'error');
      btn.disabled = false;
      btn.removeAttribute('aria-disabled');
      btn.textContent = 'Resend OTP';
      return;
    }

    if (!resp.ok) {
      log('resend-otp failed', resp);
      const body = resp.body || {};
      const msg = (body && body.error && body.error.message) ? body.error.message : 'Failed to resend OTP';
      showUserMessage(msg, 'error');
      btn.disabled = false;
      btn.removeAttribute('aria-disabled');
      btn.textContent = 'Resend OTP';
      return;
    }

    // success -> start countdown
    startResendCountdown(60);
    showUserMessage('OTP resent to your email', 'info');
    // store full email into masked element dataset so verify will use the same
    if (maskedEl) maskedEl.dataset.fullEmail = email;
  }

  // --------- Open Email App handler ----------
  function onOpenEmailClicked(e) {
    e.preventDefault();
    openEmailAppPreferInbox();
  }

  // --------- Trigger click (Reset now) ----------
  async function onTriggerClicked(e) {
    e.preventDefault();
    const btn = e.currentTarget;
    if (!btn || btn.disabled) return;

    setButtonLoading(btn, true, 'Preparing…');

    // obtain email
    const email = await getUserEmail();
    if (!email) {
      setButtonLoading(btn, false);
      alert('Unable to find your account email. For dev, run in console:\n\nlocalStorage.setItem("mockEmail","devtester@example.com");\nwindow.__SERVER_USER_DATA__ = { email: "devtester@example.com" };\n\nThen refresh.');
      return;
    }

    // show the email plainly (you asked to be fully visible)
    const maskedEl = $(MASKED_EMAIL_ID);
    if (maskedEl) {
      maskedEl.textContent = email;
      maskedEl.dataset.fullEmail = email;
    }

    setButtonLoading(btn, true, 'Sending OTP…');

    // call resend endpoint
    let resp;
    try {
      resp = await postJsonDebug(SERVER_RESEND_OTP, { email }, { credentials: 'include' });
    } catch (err) {
      console.error('resend-otp network error', err);
      showUserMessage('Network error sending OTP. See console.', 'error');
      setButtonLoading(btn, false);
      return;
    }

    if (!resp.ok) {
      log('resend-otp failed', resp);
      const body = resp.body || {};
      const msg = (body && body.error && body.error.message) ? body.error.message : 'Failed to send OTP';
      showUserMessage(msg, 'error');
      setButtonLoading(btn, false);
      return;
    }

    // open modal and start countdown
    const opened = safeOpenModal(RESET_MODAL_ID);
    if (!opened) {
      showUserMessage('Could not open reset modal automatically — check console.', 'error');
      setButtonLoading(btn, false);
      return;
    }

    startResendCountdown(60);
    setButtonLoading(btn, false);
    showUserMessage('OTP sent. Check your email.', 'info');
  }

  // small helper to show loading text on trigger button
  function setButtonLoading(buttonEl, on, text) {
    if (!buttonEl) return;
    if (on) {
      if (!buttonEl.dataset.origText) buttonEl.dataset.origText = buttonEl.textContent;
      buttonEl.disabled = true;
      buttonEl.classList.add('disabled');
      buttonEl.textContent = text || 'Working…';
    } else {
      buttonEl.disabled = false;
      buttonEl.classList.remove('disabled');
      if (buttonEl.dataset.origText) { buttonEl.textContent = buttonEl.dataset.origText; delete buttonEl.dataset.origText; }
    }
  }

  // ----- Wire up handlers when DOM ready -----
  function wire() {
    // trigger (Reset now inside securityPinModal)
    const trigger = $(TRIGGER_ID);
    if (trigger) {
      trigger.removeEventListener('click', onTriggerClicked);
      trigger.addEventListener('click', onTriggerClicked);
      log('Wired reset trigger to send OTP then open modal. API:', SERVER_RESEND_OTP);
    } else {
      log('Trigger not found in DOM:', TRIGGER_ID);
    }

    // resend
    const resendBtn = $(RESEND_BTN_ID);
    if (resendBtn) {
      resendBtn.removeEventListener('click', onResendClicked);
      resendBtn.addEventListener('click', onResendClicked);
    }

    // open email
    const openEmailBtn = $(OPEN_EMAIL_BTN_ID);
    if (openEmailBtn) {
      openEmailBtn.removeEventListener('click', onOpenEmailClicked);
      openEmailBtn.addEventListener('click', onOpenEmailClicked);
    }

    // otp input
    const otpInput = $(OTP_INPUT_ID);
    if (otpInput) {
      otpInput.removeEventListener('input', otpInputHandler);
      otpInput.addEventListener('input', otpInputHandler);
    }

    // otp form
    const otpForm = $(OTP_FORM_ID);
    if (otpForm) {
      otpForm.removeEventListener('submit', onOtpSubmit);
      otpForm.addEventListener('submit', onOtpSubmit);
    }

    log('resetPin: wired UI');
  }

  // auto-wire on DOM ready
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  // expose for debugging
  window.__rp_wire_v4 = {
    getUserEmail,
    safeOpenModal,
    postJsonDebug,
    startResendCountdown,
    SERVER_RESEND_OTP,
    SERVER_VERIFY_OTP
  };

})(); // rpWireResetFlow_v4
