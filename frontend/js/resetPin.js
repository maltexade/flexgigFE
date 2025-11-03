// rp-reset-pin-v4.js
// Updated: show full email, auto-blur OTP on 6 digits, robust email detection, improved Open Email App behavior
(function rpResetPinModule_v4(){
  'use strict';

  const DEBUG = true;
  const log = (...args) => { if (DEBUG) console.debug('[RP-RESET-v4]', ...args); };

  // --- CONFIG ---
  const TRIGGER_ID = 'resetPinBtn';
  const RESET_MODAL_ID = 'resetPinModal';
  const MASKED_EMAIL_ID = 'mp-masked-email'; // we'll place full email here
  const MP_RESEND_BTN_ID = 'mp-resend-btn';
  const MP_OTP_FORM_ID = 'mp-otp-form';
  const MP_OTP_INPUT_ID = 'mp-otp-input';
  const MP_OPEN_EMAIL_BTN_ID = 'mp-open-email-btn';
  const MP_RESET_BTN_ID = 'mp-reset-btn';
  const DEFAULT_RESEND_SECONDS = 60;

  const API_BASE = (window.__SEC_API_BASE || '').replace(/\/$/, '');
  const ENDPOINTS = {
    resendOtp: API_BASE ? `${API_BASE}/auth/resend-otp` : '/auth/resend-otp',
    verifyOtp: API_BASE ? `${API_BASE}/auth/verify-otp` : '/auth/verify-otp'
  };

  // --- notifier detection (same as before) ---
  function detectNotifier() {
    const tries = ['notify','toast','toastr','iziToast','Flash','appNotify','showToast','showNotification','__notify'];
    for (const name of tries) {
      const fn = window[name];
      if (typeof fn === 'function') return { name, fn };
      if (window[name] && typeof window[name].info === 'function') return { name, fn: window[name].info.bind(window[name]) };
    }
    if (window.App && typeof window.App.notify === 'function') return { name: 'App.notify', fn: window.App.notify.bind(window.App) };
    if (window.dashboard && typeof window.dashboard.notify === 'function') return { name: 'dashboard.notify', fn: window.dashboard.notify.bind(window.dashboard) };
    return null;
  }
  const detectedNotifier = detectNotifier();
  function notify(message, type = 'info', opts = {}) {
    if (detectedNotifier && typeof detectedNotifier.fn === 'function') {
      try {
        detectedNotifier.fn(message, { type, ...opts });
        return;
      } catch (e) { console.warn('[RP-RESET] notifier error', e); }
    }
    inlineToast(message, type);
  }
  function inlineToast(message, type='info'){
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
      el.style.pointerEvents = 'auto';
      el.style.marginTop = '8px';
      el.style.background = (type === 'error' ? '#8b1e1e' : type === 'success' ? '#157f41' : '#243b5a');
      el.style.color = '#fff';
      el.style.padding = '10px 14px';
      el.style.borderRadius = '10px';
      el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
      el.textContent = message;
      holder.appendChild(el);
      setTimeout(()=>{ el.style.transition = 'transform .28s ease, opacity .28s ease'; el.style.opacity = '0'; el.style.transform = 'translateY(-8px)'; }, 3000);
      setTimeout(()=>{ try{ holder.removeChild(el); }catch(e){} }, 3400);
    } catch (e) { try { alert(message); } catch(e){} }
  }

  // --- helpers ---
  const $ = id => document.getElementById(id);
  function openModal(modalId){
    if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
      try { window.ModalManager.openModal(modalId); return true; } catch(e) { log('ModalManager.openModal threw', e); }
    }
    const el = $(modalId);
    if (!el) return false;
    el.classList.remove('hidden');
    el.style.display = el.dataset.hasPullHandle === 'true' ? 'block' : 'flex';
    el.setAttribute('aria-hidden','false');
    el.style.zIndex = 12000;
    return true;
  }
  function closeModal(modalId){
    if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') {
      try { window.ModalManager.closeModal(modalId); return true; } catch(e) { log('ModalManager.closeModal threw', e); }
    }
    const el = $(modalId);
    if (!el) return false;
    el.classList.add('hidden');
    el.style.display = 'none';
    el.setAttribute('aria-hidden','true');
    return true;
  }
  // Verbose POST JSON helper - use instead of postJson for debugging
async function postJson(url, data, opts = {}) {
  const debugTag = '[postJsonDebug]';
  try {
    console.groupCollapsed(`${debugTag} Request ➜ ${url}`);
    console.log('URL:', url);
    console.log('Method: POST');
    console.log('Credentials:', opts.credentials || 'default');
    console.log('Payload:', data);
    console.groupEnd();

    const res = await fetch(url, {
      method: 'POST',
      credentials: opts.credentials || 'include', // include cookies by default for auth flows
      headers: Object.assign({'Content-Type':'application/json'}, opts.headers || {}),
      body: JSON.stringify(data),
      mode: opts.mode || undefined,
      cache: opts.cache || undefined,
    });

    // clone so we can read the text even if caller wants JSON
    const clone = res.clone();
    const text = await clone.text().catch(() => '<body-read-error>');
    let parsed;
    try { parsed = JSON.parse(text); } catch(e) { parsed = text; }

    console.groupCollapsed(`${debugTag} Response ◀ ${res.status} ${res.statusText} — ${url}`);
    console.log('Status:', res.status, res.statusText);
    console.log('Headers:');
    for (const h of res.headers.entries()) console.log('  ', h[0], ':', h[1]);
    console.log('Body:', parsed);
    console.groupEnd();

    // return parsed (if JSON) or text
    try { return parsed; } catch (e) { return text; }
  } catch (err) {
    console.error('[postJsonDebug] Network/Fetch error:', err);
    throw err;
  }
}


  // --- robust email detection & caching ---
  let cachedEmail = null;
  async function getUserEmail() {
    if (cachedEmail) return cachedEmail;
    // 1) try dashboard getSession (if exposed)
    try {
      const gs = window.getSession || (window.dashboard && window.dashboard.getSession);
      if (typeof gs === 'function') {
        try {
          const session = await gs();
          if (session) {
            if (session.email) { cachedEmail = session.email; log('email from getSession()', cachedEmail); return cachedEmail; }
            if (session.user && session.user.email) { cachedEmail = session.user.email; log('email from getSession().user', cachedEmail); return cachedEmail; }
            if (session.data && session.data.user && session.data.user.email) { cachedEmail = session.data.user.email; log('email from getSession() nested', cachedEmail); return cachedEmail; }
          }
        } catch (e) { log('getSession() failed', e); }
      }
    } catch (e) { /* ignore */ }

    // 2) server-injected global variable
    if (window.__SERVER_USER_DATA__ && window.__SERVER_USER_DATA__.email) {
      cachedEmail = window.__SERVER_USER_DATA__.email;
      log('email from __SERVER_USER_DATA__', cachedEmail);
      return cachedEmail;
    }

    // 3) common localStorage dev keys
    const devKeys = ['mockEmail','__mock_email','dev_email','email','user_email'];
    for (const k of devKeys) {
      const v = localStorage.getItem(k);
      if (v) {
        cachedEmail = v;
        log('email from localStorage', k, cachedEmail);
        return cachedEmail;
      }
    }

    // 4) try DOM locations commonly used to inject email (optional)
    try {
      const el = document.querySelector('[data-user-email], meta[name="user-email"], #userEmail');
      if (el) {
        const val = el.getAttribute ? (el.getAttribute('data-user-email') || el.content || el.textContent) : el.textContent;
        if (val) { cachedEmail = val; log('email from DOM element', val); return cachedEmail; }
      }
    } catch(e){}

    // none found
    log('getUserEmail: no email found');
    return '';
  }

  // allow developer to set email in console during dev
  window.__rp_reset = window.__rp_reset || {};
  window.__rp_reset.setEmailForDev = function(email){
    cachedEmail = email;
    localStorage.setItem('mockEmail', email);
    log('Dev email set to', email);
  };

  // --- resend timer ---
  const timerState = { timerId: null, remaining: 0 };
  function startResendTimer(seconds = DEFAULT_RESEND_SECONDS) {
    const btn = $(MP_RESEND_BTN_ID);
    if (!btn) return;
    stopResendTimer();
    timerState.remaining = seconds;
    btn.disabled = true;
    btn.setAttribute('aria-disabled','true');
    btn.textContent = `Resend OTP (${timerState.remaining}s)`;
    timerState.timerId = setInterval(() => {
      timerState.remaining -= 1;
      if (timerState.remaining <= 0) {
        stopResendTimer();
        if (btn) { btn.disabled = false; btn.removeAttribute('aria-disabled'); btn.textContent = 'Resend OTP'; }
        return;
      }
      if (btn) btn.textContent = `Resend OTP (${timerState.remaining}s)`;
    }, 1000);
  }
  function stopResendTimer() {
    if (timerState.timerId) clearInterval(timerState.timerId);
    timerState.timerId = null;
    timerState.remaining = 0;
  }

  // --- open email app (try inbox schemes then fallback) ---
  function tryOpenUrl(url, fallbackTimeout = 1200) {
    // attempt to open url and fallback to callback if not opened. This is heuristic on browsers
    return new Promise((resolve) => {
      let opened = false;
      const start = Date.now();
      // create iframe for older browsers? we will use location assignment for simplicity
      try {
        window.location.href = url;
        opened = true;
        resolve(true);
      } catch (e) {
        // if assignment throws, resolve false
        resolve(false);
      }
      // Note: assignment to window.location doesn't throw on many browsers; we can't reliably detect success.
    });
  }

  async function openEmailApp() {
    const email = await getUserEmail();
    if (!email) {
      notify('No account email found to open email app.', 'error');
      return;
    }

    // Try platform-specific deep links that aim to open inbox (best-effort; behavior depends on device)
    const ua = navigator.userAgent || '';
    log('openEmailApp userAgent', ua);

    // Android: try intent to Gmail (opens app if installed)
    if (/Android/i.test(ua)) {
      try {
        const intentUrl = `intent://inbox#Intent;package=com.google.android.gm;end`;
        log('Trying Android Gmail intent', intentUrl);
        window.location.href = intentUrl;
        return;
      } catch(e) {
        log('Android intent failed', e);
      }
    }

    // iOS: try Gmail URL scheme
    if (/iPhone|iPad|iPod/i.test(ua)) {
      try {
        const gmailUrl = `googlegmail://`;
        log('Trying iOS Gmail url', gmailUrl);
        window.location.href = gmailUrl;
        return;
      } catch(e) {
        log('iOS gmail scheme failed', e);
      }
    }

    // Generic attempt: try mailto: with no subject/body - many platforms open compose; we prefer inbox, but fallback
    try {
      // as a fallback, copy email to clipboard and notify user (so they can search in their mail app)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(email);
        notify('Email address copied to clipboard — open your mail app and search for it.', 'info');
        return;
      }
    } catch(e){ log('clipboard failed', e); }

    // final fallback: open mailto (will start compose)
    try {
      window.location.href = `mailto:${email}`;
    } catch(e) {
      notify('Unable to open email app on this device.', 'error');
    }
  }

  // --- OTP input behavior (auto-blur on 6 digits) ---
  function wireOtpInputAutoBlur() {
    const input = $(MP_OTP_INPUT_ID);
    if (!input) return;
    // ensure maxlength=6 for safety
    try { input.setAttribute('maxlength', '6'); } catch(e){}
    input.removeEventListener('input', otpInputHandler);
    input.addEventListener('input', otpInputHandler);

    function otpInputHandler(e) {
      const v = (e.target.value || '').replace(/\D/g,''); // digits only
      // keep only first 6 digits
      if (v.length !== e.target.value.length) e.target.value = v;
      if (v.length >= 6) {
        // blur to close keyboard on mobile
        try {
          e.target.blur();
        } catch (err) { /* ignore */ }
        // optionally auto-submit the form
        try {
          const form = $(MP_OTP_FORM_ID);
          if (form) form.dispatchEvent(new Event('submit', { cancelable: true }));
        } catch (err) { log('auto-submit failed', err); }
      }
    }
  }

  // --- main click/flow handlers ---
  async function onTriggerClicked(e) {
    e.preventDefault();
    const btn = e.currentTarget || $(TRIGGER_ID);
    if (!btn) return;
    if (btn.disabled) return;
    try {
      btn.disabled = true;
      if (!btn.dataset.origText) btn.dataset.origText = btn.textContent;
      btn.textContent = 'Preparing…';

      const email = await getUserEmail();
      if (!email) {
        notify('Unable to find account email. Run:\nlocalStorage.setItem(\"mockEmail\",\"you@dev.com\");', 'error');
        btn.disabled = false;
        if (btn.dataset.origText) { btn.textContent = btn.dataset.origText; delete btn.dataset.origText; }
        return;
      }

      // put full email into UI (user asked)
      const maskedEl = $(MASKED_EMAIL_ID);
      if (maskedEl) maskedEl.textContent = email;

      btn.textContent = 'Sending OTP…';
      const resp = await postJson(ENDPOINTS.resendOtp, { email });
      log('resend-otp response', resp);

      // heuristics: look for success flags
      if (resp && (resp.success === true || resp.status === 'ok' || resp.code === 200 || resp.message && /sent/i.test(String(resp.message)))) {
        notify('OTP sent to your email', 'success');
      } else {
        // still open modal so dev can debug; show server message if any
        const msg = resp && resp.message ? resp.message : 'OTP request completed — check your email';
        notify(msg, 'info');
      }

      // open modal
      const opened = openModal(RESET_MODAL_ID);
      if (!opened) {
        notify('Could not open reset modal automatically.', 'error');
      } else {
        // ensure OTP input auto-blur is wired
        wireOtpInputAutoBlur();
        startResendTimer(DEFAULT_RESEND_SECONDS);
      }
    } catch (err) {
      console.error('[RP-RESET] onTriggerClicked error', err);
      notify('Failed to request OTP. See console.', 'error');
    } finally {
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
      if (!email) { notify('No account email to resend to.', 'error'); btn.disabled=false; btn.textContent='Resend OTP'; return; }
      const resp = await postJson(ENDPOINTS.resendOtp, { email });
      log('resend result', resp);
      notify('OTP resent. Check your email.', 'success');
      startResendTimer(DEFAULT_RESEND_SECONDS);
    } catch (err) {
      console.error('Resend failed', err);
      notify('Failed to resend OTP', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Resend OTP'; }
    }
  }

  async function onOpenEmailClicked(e) {
    e.preventDefault();
    await openEmailApp();
  }

  async function onOtpSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget || $(MP_OTP_FORM_ID);
    if (!form) return;
    const input = $(MP_OTP_INPUT_ID);
    if (!input) return;
    const otp = (input.value || '').trim();
    if (!otp) { notify('Please enter the OTP', 'error'); return; }

    try {
      const payload = { otp, reason: 'reset_pin' };
      const resp = await postJson(ENDPOINTS.verifyOtp, payload);
      log('verifyOtp resp', resp);
      if (resp && (resp.success === true || resp.verified === true || resp.status === 'ok')) {
        notify('OTP verified. Proceed to reset your PIN.', 'success');
        stopResendTimer();
        closeModal(RESET_MODAL_ID);
        document.dispatchEvent(new CustomEvent('rp:otp-verified', { detail: { otp, resp } }));
      } else {
        const msg = resp && resp.message ? resp.message : 'Invalid OTP. Please try again.';
        notify(msg, 'error');
        // shake input
        input.classList.remove('rp-shake'); void input.offsetWidth; input.classList.add('rp-shake');
        setTimeout(()=>input.classList.remove('rp-shake'), 600);
      }
    } catch (err) {
      console.error('verifyOtp error', err);
      notify('Failed to verify OTP — see console', 'error');
    }
  }

  // --- wiring ---
  function wire() {
    const trigger = $(TRIGGER_ID);
    if (trigger) {
      trigger.removeEventListener('click', onTriggerClicked);
      trigger.addEventListener('click', onTriggerClicked);
      log('Wired trigger', TRIGGER_ID);
    } else log('Trigger not found:', TRIGGER_ID);

    const resend = $(MP_RESEND_BTN_ID);
    if (resend) {
      resend.removeEventListener('click', onResendClicked);
      resend.addEventListener('click', onResendClicked);
      log('Wired resend', MP_RESEND_BTN_ID);
    } else log('Resend not found:', MP_RESEND_BTN_ID);

    const openEmailBtn = $(MP_OPEN_EMAIL_BTN_ID);
    if (openEmailBtn) {
      openEmailBtn.removeEventListener('click', onOpenEmailClicked);
      openEmailBtn.addEventListener('click', onOpenEmailClicked);
      log('Wired open email', MP_OPEN_EMAIL_BTN_ID);
    } else log('Open email not found:', MP_OPEN_EMAIL_BTN_ID);

    const otpForm = $(MP_OTP_FORM_ID);
    if (otpForm) {
      otpForm.removeEventListener('submit', onOtpSubmit);
      otpForm.addEventListener('submit', onOtpSubmit);
      log('Wired otp form', MP_OTP_FORM_ID);
    } else log('OTP form not found:', MP_OTP_FORM_ID);

    // style for shake
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();

  // expose helpers for testing
  window.__rp_reset = window.__rp_reset || {};
  Object.assign(window.__rp_reset, {
    wire,
    openModal: () => openModal(RESET_MODAL_ID),
    closeModal: () => closeModal(RESET_MODAL_ID),
    startResendTimer,
    stopResendTimer,
    getUserEmail,
    setEmailForDev: (email) => { cachedEmail = email; localStorage.setItem('mockEmail', email); },
    endpoints: ENDPOINTS,
    detectedNotifier: detectedNotifier ? detectedNotifier.name : null
  });

  log('rp-reset-v4 loaded', { endpoints: ENDPOINTS, notifier: window.__rp_reset.detectedNotifier });
})();
