(function rpWireResetFlow_v3(){
  'use strict';

  const DEBUG = true;
  const log = (...args) => { if (DEBUG) console.debug('[RP-WIRE-v3]', ...args); };

  // IDs used in your HTML (adjust only if you renamed elements)
  const TRIGGER_ID = 'resetPinBtn';        // button inside securityPinModal
  const RESET_MODAL_ID = 'resetPinModal';  // id of the reset modal container
  const MASKED_EMAIL_ID = 'mp-masked-email';

  // API base (must be set on window)
  const API_BASE = (window.__SEC_API_BASE || '').replace(/\/$/, '');
  const SERVER_RESEND_OTP = API_BASE ? `${API_BASE}/auth/resend-otp` : '/auth/resend-otp';

  // utility
  const $ = id => document.getElementById(id);

  // Dev fallback keys
  function getDevEmailFallback() {
    return localStorage.getItem('mockEmail') ||
           localStorage.getItem('__mock_email') ||
           localStorage.getItem('dev_email') ||
           null;
  }

  // Try to get email from server session (via getSession) -> then server-injected global -> localStorage
  async function getUserEmail() {
    try {
      // If dashboard exposes getSession() as a global function, prefer it.
      const gs = window.getSession || (window.dashboard && window.dashboard.getSession);
      if (typeof gs === 'function') {
        try {
          log('getUserEmail: calling getSession()');
          const session = await gs(); // assume this returns session object or throws
          log('getUserEmail: getSession() result', session);
          if (session && session.email) return session.email;
          // Some implementations return { data: { session: { user: {...} } } } — try to be tolerant:
          if (session && session.user && session.user.email) return session.user.email;
          if (session && session.data && session.data.email) return session.data.email;
          if (session && session.data && session.data.user && session.data.user.email) return session.data.user.email;
        } catch (err) {
          log('getUserEmail: getSession() threw, falling back', err);
        }
      }

      // Next fallback: server-injected global the page may set
      if (window.__SERVER_USER_DATA__ && window.__SERVER_USER_DATA__.email) {
        log('getUserEmail: using window.__SERVER_USER_DATA__');
        return window.__SERVER_USER_DATA__.email;
      }

      // Dev fallback in localStorage
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

  // POST JSON helper (uses full SERVER_RESEND_OTP)
  async function postJson(url, data) {
    log('postJson', url, data);
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include', // include cookies for cross-origin sessions
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch(e) { return text; }
  }

  // Show modal fallback (direct DOM) if ModalManager isn't aware of it
  function safeOpenModal(modalId) {
    const modalEl = $(modalId);
    if (!modalEl) {
      log('safeOpenModal: modal element not found', modalId);
      return false;
    }

    // Try ModalManager first
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

    // Fallback: show modal directly (matches modal markup pattern)
    try {
      modalEl.classList.remove('hidden');
      modalEl.style.display = modalEl.dataset.hasPullHandle === 'true' ? 'block' : 'flex';
      modalEl.setAttribute('aria-hidden', 'false');
      modalEl.style.zIndex = 2000;
      modalEl.dispatchEvent(new CustomEvent('modal:opened', { bubbles: true }));
      log('safeOpenModal: fallback shown via DOM for', modalId);
      return true;
    } catch (e) {
      console.error('safeOpenModal fallback failed', e);
      return false;
    }
  }

  // Provide clear UI feedback on trigger button
  function setTriggerLoading(buttonEl, on, text) {
    if (!buttonEl) return;
    if (on) {
      if (!buttonEl.dataset.origText) buttonEl.dataset.origText = buttonEl.textContent;
      buttonEl.disabled = true;
      buttonEl.classList.add('disabled');
      buttonEl.textContent = text || 'Sending OTP…';
    } else {
      buttonEl.disabled = false;
      buttonEl.classList.remove('disabled');
      if (buttonEl.dataset.origText) { buttonEl.textContent = buttonEl.dataset.origText; delete buttonEl.dataset.origText; }
    }
  }

  // Main handler for reset-flow click
  async function onTriggerClicked(e) {
    e.preventDefault();
    const btn = e.currentTarget;
    if (!btn) return;
    if (btn.disabled) return;

    setTriggerLoading(btn, true, 'Preparing…');

    // Prefer server session email (via getSession) — works even if page didn't inject __SERVER_USER_DATA__
    const email = await getUserEmail();
    if (!email) {
      setTriggerLoading(btn, false);
      alert('Unable to find your account email. For dev, run in console:\n\nlocalStorage.setItem("mockEmail","devtester@example.com");\nwindow.__SERVER_USER_DATA__ = { email: "devtester@example.com" };\n\nThen refresh.');
      return;
    }

    // populate the masked email inside modal (so dev sees it)
    try {
      const maskedEl = $(MASKED_EMAIL_ID);
      if (maskedEl) {
        const parts = email.split('@');
        maskedEl.textContent = (parts.length === 2) ? (parts[0].slice(0,2) + '…@' + parts[1]) : email;
      }
    } catch (err) { log('mask email failed', err); }

    setTriggerLoading(btn, true, 'Sending OTP…');

    // call server to request/send OTP
    try {
      const resp = await postJson(SERVER_RESEND_OTP, { email });
      log('resend-otp response', resp);

      // success handling: open modal and start modal timer (if provided)
      const opened = safeOpenModal(RESET_MODAL_ID);
      if (!opened) {
        // fallback message
        alert('Modal could not be opened automatically. Check console for details.');
        setTriggerLoading(btn, false);
        return;
      }

      // If modal helper exposes startTimer, call it (previous modal code exposes __mp_resetModal.startTimer)
      try {
        if (window.__mp_resetModal && typeof window.__mp_resetModal.startTimer === 'function') {
          window.__mp_resetModal.startTimer(60);
        }
      } catch (err) {
        log('startTimer call failed', err);
      }

      // done, slightly delay resetting the trigger state so UI feels smooth
      setTimeout(() => setTriggerLoading(btn, false), 300);
    } catch (err) {
      console.error('Failed to call resend otp', err);
      alert('Failed to send OTP. See console for details.');
      setTriggerLoading(btn, false);
    }
  }

  // Wire up once DOM ready
  function wire() {
    const trigger = $(TRIGGER_ID);
    if (!trigger) {
      log('Trigger not found in DOM:', TRIGGER_ID);
      return;
    }
    trigger.removeEventListener('click', onTriggerClicked);
    trigger.addEventListener('click', onTriggerClicked);
    log('Wired reset trigger to send OTP then open modal. API:', SERVER_RESEND_OTP);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }

  // debug helpers exposed for convenience
  window.__rp_wire_debug = {
    getUserEmail,
    safeOpenModal,
    postJson,
    API_BASE,
    SERVER_RESEND_OTP
  };

})(); // rpWireResetFlow_v3

