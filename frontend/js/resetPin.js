/* resetPin.js — full file
   - Sends correct payload { email, token } to /auth/verify-otp
   - Debuggable request/response logging
   - Auto-blur after entering 6 digits
   - Resend timer + open-email improved behavior
   - Expects modal with id="resetPinModal", OTP input(s) with class "mp-otp-input" (single input OK),
     masked email container id="mp-masked-email" and full-email container id="mp-full-email"
*/

(function rpWireResetFlow_v4(){
  'use strict';

  const DEBUG = true;
  const log = (...args) => { if (DEBUG) console.debug('[RP-WIRE-v4]', ...args); };

  // IDs / selectors used in your HTML
  const TRIGGER_ID = 'resetPinBtn';       // Button that starts flow
  const RESET_MODAL_ID = 'resetPinModal'; // Reset modal container
  const MASKED_EMAIL_ID = 'mp-masked-email';
  const FULL_EMAIL_ID = 'mp-full-email';  // new — element to show full email (create in modal)
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
      // Prefer a global getSession if available
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

      // Next fallback: server-injected global
      if (window.__SERVER_USER_DATA__ && window.__SERVER_USER_DATA__.email) {
        log('getUserEmail: using window.__SERVER_USER_DATA__');
        return window.__SERVER_USER_DATA__.email;
      }

      // localStorage dev fallback
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

  // Enhanced fetch wrapper with debug info. returns parsed JSON or throws.
  async function postJson(url, data, opts = {}) {
    const debugTag = '[postJsonDebug]';
    const method = opts.method || 'POST';
    const credentials = opts.credentials ?? 'include'; // include cookies by default
    console.debug(`${debugTag} Request ➜`, url);
    console.debug(`${debugTag} URL:`, url);
    console.debug(`${debugTag} Method:`, method);
    console.debug(`${debugTag} Credentials:`, credentials);
    console.debug(`${debugTag} Payload:`, data);

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
    try {
      bodyText = await res.text();
    } catch(e) {
      bodyText = '<no body>';
    }

    console.debug(`${debugTag} Response ◀ ${status}  — ${url}`);
    console.debug(`${debugTag} Status:`, status);
    console.debug(`${debugTag} Headers:`, headers);
    console.debug(`${debugTag} Body:`, bodyText);

    const contentType = headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      try {
        return { status, body: JSON.parse(bodyText), headers };
      } catch (e) {
        return { status, body: bodyText, headers };
      }
    }
    return { status, body: bodyText, headers };
  }

  // Show modal (tries ModalManager then fallback)
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
    } catch (e) {
      log('safeOpenModal: ModalManager.openModal threw', e);
    }

    // DOM fallback
    try {
      modalEl.classList.remove('hidden');
      modalEl.style.display = modalEl.dataset.hasPullHandle === 'true' ? 'block' : 'flex';
      modalEl.setAttribute('aria-hidden', 'false');
      // bring to front a bit
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
    // If multiple inputs exist, join them; otherwise return single input value
    const inputs = qsa(OTP_INPUT_SELECTOR);
    if (inputs.length === 0) return '';
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
    let remaining = durationSec;
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.textContent = `Resend (${remaining}s)`;

    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(resendTimer);
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
        btn.textContent = 'Resend OTP';
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
      // open Gmail web inbox
      window.open('https://mail.google.com/mail/u/0/#inbox', '_blank');
      return;
    }
    // fallback to mailto (will open compose; reliably opening inbox is not possible cross-platform)
    window.location.href = `mailto:${encodeURIComponent(email)}`;
  }

  // OTP verify handler — sends { email, token } as server expects
  async function verifyOtpSubmit() {
    const email = await getUserEmail();
    if (!email) {
      alert('No email detected. Please login or set mockEmail in localStorage for dev.');
      return;
    }

    const token = getOtpValue();
    if (!token || token.length < 4) {
      // small guard
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
        // call app-specific success flows — typically server returns token + user
        // open the pin modal
if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
  window.ModalManager.openModal('pinModal');
} else {
  // fallback
  const el = document.getElementById('pinModal');
  if (el) { el.classList.remove('hidden'); el.style.display='flex'; el.setAttribute('aria-hidden','false'); }
}

        // optional: close modal
        safeCloseModal(RESET_MODAL_ID);
        clearOtpInputs();
        // TODO: process returned token/body as your app expects
      } else {
        // server returned error payload — show helpful message
        const errMsg = (body && body.error && body.error.message) ? body.error.message : (body && body.message) ? body.message : 'OTP verify failed';
        console.warn('verifyOtp error', status, body);
        if (status === 400 || status === 403) {
          // If Supabase returns otp_expired, show resend suggestion
          const errCode = body?.error?.code || body?.error?.code || null;
          if (errCode === 'otp_expired' || errMsg.toLowerCase().includes('expired')) {
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
  async function resendOtpHandler() {
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
        alert('OTP resent to ' + email);
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

    // If a single input (most common), watch value length
    if (inputs.length === 1) {
      const input = inputs[0];
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('maxlength', '6');
      input.addEventListener('input', async (e) => {
        const v = input.value.trim();
        // show full email if masked element exists
        if (v.length >= 6) {
          // auto-blur to close keyboard
          try { input.blur(); } catch(e) {}
          // auto-submit (short delay to let keyboard close)
          setTimeout(() => { verifyOtpSubmit(); }, 120);
        }
      });
      return;
    }

    // Multiple inputs: when all filled, join and submit
    inputs.forEach((inp, idx) => {
      inp.setAttribute('inputmode', 'numeric');
      inp.setAttribute('maxlength', '1');
      inp.addEventListener('input', (e) => {
        const v = inp.value;
        if (v && idx < inputs.length - 1) {
          inputs[idx + 1].focus();
        }
        // if all filled
        const all = inputs.map(i => i.value.trim()).join('');
        if (all.length === inputs.length) {
          blurOtpInputs();
          setTimeout(() => { verifyOtpSubmit(); }, 120);
        }
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !inp.value && idx > 0) {
          inputs[idx - 1].focus();
        }
      });
    });
  }

  // Wire UI and triggers
  async function wire() {
    const trigger = $(TRIGGER_ID);
    if (trigger) {
      trigger.removeEventListener('click', onTriggerClicked);
      trigger.addEventListener('click', onTriggerClicked);
    } else {
      log('wire: trigger not found', TRIGGER_ID);
    }

    const resendBtn = $(RESEND_BTN_ID);
    if (resendBtn) {
      resendBtn.removeEventListener('click', resendOtpHandler);
      resendBtn.addEventListener('click', resendOtpHandler);
    }

    const openEmailBtn = $(OPEN_EMAIL_BTN_ID);
    if (openEmailBtn) {
      openEmailBtn.removeEventListener('click', onOpenEmailClick);
      openEmailBtn.addEventListener('click', onOpenEmailClick);
    }

    const verifyBtn = $(VERIFY_BTN_ID);
    if (verifyBtn) {
      verifyBtn.removeEventListener('click', verifyOtpSubmit);
      verifyBtn.addEventListener('click', verifyOtpSubmit);
    }

    wireOtpInputs();

    // Display full email in modal if element present
    const fullEmailEl = $(FULL_EMAIL_ID);
    const maskedEl = $(MASKED_EMAIL_ID);
    const email = await getUserEmail();
    if (fullEmailEl && email) {
      fullEmailEl.textContent = email;
      if (maskedEl) maskedEl.textContent = email; // show full for dev, you can mask if you want
    } else if (maskedEl && email) {
      maskedEl.textContent = email;
    }

    log('Wired reset trigger to send OTP then open modal. API:', SERVER_RESEND_OTP, SERVER_VERIFY_OTP);
  }

  // When reset pin button clicked: send resend-otp then open modal
  async function onTriggerClicked(e) {
    e.preventDefault();
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
      if (fullEl) fullEl.textContent = email; // full visible as requested
    } catch (err){}

    // send resend OTP request
    try {
      const { status, body } = await postJson(SERVER_RESEND_OTP, { email });
      if (status >= 200 && status < 300) {
        log('resend-otp response', body);
        // open modal
        const opened = safeOpenModal(RESET_MODAL_ID);
        if (!opened) alert('Modal could not be opened automatically. Check console.');
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
    e.preventDefault();
    const email = await getUserEmail();
    openEmailClient(email);
  }

  // If DOM is ready, wire up
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }

  // Expose debug helpers
  window.__rp_wire_debug = {
    getUserEmail,
    safeOpenModal,
    postJson,
    API_BASE,
    SERVER_RESEND_OTP,
    SERVER_VERIFY_OTP,
    openEmailClient,
    verifyOtpSubmit
  };

})(); // rpWireResetFlow_v4
