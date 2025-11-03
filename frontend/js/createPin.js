/* createPin.js
   Handles: UI validation, server call to set new PIN, inline notifications,
   closing all modals and refreshing dashboard on success.
*/
(function createPinFlow_v1(){
  'use strict';

  const DEBUG = true;
  const log = (...a) => { if (DEBUG) console.debug('[CREATE-PIN]', ...a); };

  const MODAL_ID = 'createPinModal';
  const INPUT_NEW = 'cp-new-pin';
  const INPUT_CONFIRM = 'cp-confirm-pin';
  const SUBMIT_BTN = 'cp-submit-btn';
  const NOTICE_ID = 'cp-notice';

  const API_BASE = (window.__SEC_API_BASE || '').replace(/\/$/, '') || '';
  // adjust endpoint name if your server uses different route
  const SERVER_SET_PIN = API_BASE ? `${API_BASE}/auth/save-pin` : '/auth/save-pin';

  const $ = id => document.getElementById(id);

  // getUserEmail: try to reuse other code if exposed, otherwise fallback
  async function getUserEmail() {
    try {
      if (window.__rp_wire_debug && typeof window.__rp_wire_debug.getUserEmail === 'function') {
        const e = await window.__rp_wire_debug.getUserEmail();
        if (e) return e;
      }
      // try page/session getSession
      const gs = window.getSession || (window.dashboard && window.dashboard.getSession) || window.getSessionFromDashboard;
      if (typeof gs === 'function') {
        try {
          const session = await gs();
          if (session && session.email) return session.email;
          if (session && session.user && session.user.email) return session.user.email;
        } catch(e) { log('getSession failed', e); }
      }
      if (window.__SERVER_USER_DATA__ && window.__SERVER_USER_DATA__.email) return window.__SERVER_USER_DATA__.email;
      const fallback = localStorage.getItem('mockEmail') || localStorage.getItem('__mock_email') || localStorage.getItem('dev_email');
      return fallback || '';
    } catch (e) {
      console.error('getUserEmail error', e);
      return '';
    }
  }

  async function postJson(url, data) {
    log('postJson', url, data);
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    const text = await res.text();
    try { return { status: res.status, body: JSON.parse(text) }; } catch(e) { return { status: res.status, body: text }; }
  }

  function showNotice(msg, type = 'error') {
    const n = $(NOTICE_ID);
    if (!n) return;
    n.classList.remove('error','success');
    if (type === 'success') n.classList.add('success');
    else n.classList.add('error');
    n.textContent = msg;
  }

  function clearNotice() {
    const n = $(NOTICE_ID);
    if (!n) return;
    n.textContent = '';
    n.classList.remove('error','success');
  }

  // form validation: 4 digits numeric and both match
  function validatePins(n, c) {
    if (!n || !c) return { ok:false, msg: 'Both fields are required.' };
    if (n.length !== 4 || c.length !== 4) return { ok:false, msg: 'PIN must be 4 digits.' };
    if (!/^\d{4}$/.test(n) || !/^\d{4}$/.test(c)) return { ok:false, msg: 'PIN must contain digits only.' };
    if (n !== c) return { ok:false, msg: 'PINs do not match.' };
    return { ok: true };
  }

  async function submitNewPin(e) {
    e && e.preventDefault && e.preventDefault();
    clearNotice();

    const newPinEl = $(INPUT_NEW);
    const confirmEl = $(INPUT_CONFIRM);
    const submitBtn = $(SUBMIT_BTN);

    if (!newPinEl || !confirmEl || !submitBtn) {
      console.warn('createPin: required elements missing');
      return;
    }

    const newPin = newPinEl.value.trim();
    const confirmPin = confirmEl.value.trim();

    const v = validatePins(newPin, confirmPin);
    if (!v.ok) {
      showNotice(v.msg, 'error');
      return;
    }

    submitBtn.disabled = true;
    const origText = submitBtn.textContent;
    submitBtn.textContent = 'Setting PIN…';

    try {
      const email = await getUserEmail();
      if (!email) {
        showNotice('Unable to determine your email. Please re-login and try again.', 'error');
        return;
      }

      const { status, body } = await postJson(SERVER_SET_PIN, { email, pin: newPin });

      if (status >= 200 && status < 300) {
        // server succeeded
        showNotice('PIN created successfully. Redirecting…', 'success');

        // close all modals and refresh dashboard/session
        try {
          if (window.ModalManager && typeof window.ModalManager.closeAll === 'function') {
            window.ModalManager.closeAll();
          } else {
            // fallback: try to close just this modal
            const el = document.getElementById(MODAL_ID);
            if (el) { el.classList.add('hidden'); el.style.display='none'; el.setAttribute('aria-hidden','true'); }
          }
        } catch(err) { log('error closing modals', err); }

        // Try to refresh session first, else full reload
        setTimeout(async () => {
          try {
            if (typeof window.getSession === 'function') {
              await window.getSession();
              // optionally you could call a dashboard render function here if available
            } else if (window.dashboard && typeof window.dashboard.refresh === 'function') {
              await window.dashboard.refresh();
            } else {
              // fallback to reload so dashboard reflects new PIN state
              window.location.reload();
            }
          } catch(e) {
            // final fallback
            window.location.reload();
          }
        }, 700);

      } else {
        // show server error message
        const serverMsg = (body && (body.error?.message || body.message)) ? (body.error?.message || body.message) : JSON.stringify(body);
        showNotice('Failed to set PIN: ' + serverMsg, 'error');
      }

    } catch (err) {
      console.error('createPin submit error', err);
      showNotice('Network error. Check console and try again.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = origText || 'Reset PIN';
    }
  }

  // Setup wiring
  function wireCreatePin() {
    const submitBtn = $(SUBMIT_BTN);
    if (submitBtn) {
      submitBtn.removeEventListener('click', submitNewPin);
      submitBtn.addEventListener('click', submitNewPin);
    }

    // allow pressing Enter on confirm input to submit
    const confirmInput = $(INPUT_CONFIRM);
    if (confirmInput) {
      confirmInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          submitNewPin(e);
        }
      });
    }

    // optional: focus the first input when modal opens; uses ModalManager mutation/event
    document.addEventListener('modal:opened', (ev) => {
      if (!ev?.target) return;
      if (ev.target.id === MODAL_ID) {
        setTimeout(() => {
          const first = $(INPUT_NEW);
          if (first) {
            first.focus();
            first.select && first.select();
          }
        }, 80);
      }
    }, { capture: true });
  }

  // init after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireCreatePin);
  } else {
    wireCreatePin();
  }

  // expose helper for debugging
  window.__createPin_debug = {
    submitNewPin,
    validatePins
  };
})();
