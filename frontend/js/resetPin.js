import { withLoader } from "./dashboard";

/* resetPin.js – v7
   - FIXED: closeAll() modals after PIN creation (smooth transition to dashboard)
   - FIXED: Resend counter now shows "Resend OTP" cleanly after countdown
   - FIXED: No profile data interference - only handles PIN reset flow
   - Smooth notification on success with auto-focus to dashboard
*/
(function rpWireResetFlow_v7(){
  'use strict';

  // ---- CONFIG / LOGGING ----
  const DEBUG = true;
  const tag = '[RP-WIRE-v7]';
  const log = (...args) => { if (DEBUG) console.log(tag, ...args); };
  const dbg = (...args) => { if (DEBUG) console.debug(tag, ...args); };
  const warn = (...args) => { if (DEBUG) console.warn(tag, ...args); };
  const err = (...args) => { if (DEBUG) console.error(tag, ...args); };

  if (window.__rp_wire_reset_v7_installed) {
    log('already installed – rewire requested');
    if (window.__rp_wire_debug && typeof window.__rp_wire_debug.rewire === 'function') {
      try { window.__rp_wire_debug.rewire(); } catch(e){ dbg('rewire error', e); }
    }
    return;
  }
  window.__rp_wire_reset_v7_installed = true;

  // ---- Selectors & Endpoints ----
  const TRIGGER_ID = 'resetPinBtn';
  const RESET_MODAL_ID = 'resetPinModal';
  const MASKED_EMAIL_ID = 'mp-masked-email';
  const FULL_EMAIL_ID = 'mp-full-email';
  const OTP_INPUT_SELECTOR = '.mp-otp-input';
  const RESEND_BTN_ID = 'mp-resend-btn';
  const OPEN_EMAIL_BTN_ID = 'mp-open-email-btn';
  const VERIFY_BTN_ID = 'mp-reset-btn';
  const OTP_FORM_ID = 'mp-otp-form';

  const API_BASE = (window.__SEC_API_BASE || '').replace(/\/$/, '') || '';
  const SERVER_RESEND_OTP = API_BASE ? `${API_BASE}/auth/resend-otp` : '/auth/resend-otp';
  const SERVER_VERIFY_OTP = API_BASE ? `${API_BASE}/auth/verify-otp` : '/auth/verify-otp';

  const $ = id => document.getElementById(id);
  const qsa = sel => Array.from(document.querySelectorAll(sel));
  window.__rp_handlers = window.__rp_handlers || {};

  // ---- Notification helper ----
  function notify({ type = 'info', title = '', message = '', duration = 4500 } = {}) {
    dbg('notify:', { type, title, message, duration });

    // 1) prefer global app-level notifiers if present
    try {
      if (typeof window.notify === 'function') { window.notify(type, message, { title, timeout: duration }); return; }
      if (typeof window.appNotify === 'function') { window.appNotify({ type, title, message, duration }); return; }
      if (window.toastr && typeof window.toastr[type] === 'function') { window.toastr[type](message, title); return; }
      if (window.Toastify && typeof window.Toastify === 'function') { window.Toastify({ text: (title ? title + ' – ' : '') + message, duration }).showToast(); return; }
      if (window.Notyf && (window._notyf instanceof window.Notyf)) { window._notyf.open({ type, message }); return; }
    } catch (e) {
      dbg('notify: app-level notify attempt failed', e);
    }

    // 2) Try Web Notifications (permission required) – use sparingly
    try {
      if (window.Notification && Notification.permission === 'granted') {
        new Notification(title || 'Notification', { body: message });
        return;
      }
    } catch (e) {
      dbg('notify: web Notification attempt failed', e);
    }

    // 3) Inline toast fallback
    try {
      let container = document.getElementById('__rp_toast_container');
      if (!container) {
        container = document.createElement('div');
        container.id = '__rp_toast_container';
        container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
        document.body.appendChild(container);
      }

      const toast = document.createElement('div');
      toast.className = '__rp_toast';
      toast.style.cssText = 'pointer-events:auto;min-width:220px;max-width:380px;padding:10px 14px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,0.12);font-family:system-ui,Segoe UI,Roboto,Arial;color:#fff;opacity:0;transform:translateY(-6px);transition:opacity .22s ease,transform .22s ease;';
      // color by type
      const bg = type === 'error' ? '#e53935' : type === 'warn' ? '#ffb300' : type === 'success' ? '#2e7d32' : '#1976d2';
      toast.style.background = bg;
      if (title) {
        const t = document.createElement('div'); t.style.fontWeight = '600'; t.style.marginBottom = '4px'; t.textContent = title; toast.appendChild(t);
      }
      const p = document.createElement('div'); p.style.fontSize = '13px'; p.textContent = message || ''; toast.appendChild(p);
      container.appendChild(toast);
      // animate in
      requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });

      const rm = () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-6px)';
        setTimeout(() => { try { toast.remove(); } catch(_){} }, 220);
      };
      setTimeout(rm, duration);
    } catch (e) {
      dbg('notify: inline fallback failed', e);
      console.log(tag, 'notify fallback:', title, message);
    }
  }

  // ---- Email resolution helpers ----
  function getDevEmailFallback() {
    return localStorage.getItem('mockEmail') || localStorage.getItem('__mock_email') || localStorage.getItem('dev_email') || null;
  }

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
            dbg('getUserEmail: calling', fn.name || '(anonymous)');
            const session = await fn();
            dbg('getUserEmail: session', session);
            if (session && session.email) { log('getUserEmail: found', session.email); return session.email; }
            if (session && session.user && session.user.email) { log('getUserEmail: found', session.user.email); return session.user.email; }
            if (session && session.data && session.data.user && session.data.user.email) { log('getUserEmail: found', session.data.user.email); return session.data.user.email; }
          } catch (e) {
            dbg('getUserEmail: provider threw', e);
          }
        }
      }

      if (window.__SERVER_USER_DATA__ && window.__SERVER_USER_DATA__.email) {
        log('getUserEmail: found in __SERVER_USER_DATA__', window.__SERVER_USER_DATA__.email);
        return window.__SERVER_USER_DATA__.email;
      }

      const fb = getDevEmailFallback();
      if (fb) { log('getUserEmail: using fallback', fb); return fb; }

      log('getUserEmail: none found – returning empty string');
      return '';
    } catch (e) {
      err('getUserEmail unexpected error', e);
      return '';
    }
  }

  // ---- Fetch wrapper ----
  async function postJson(url, payload = {}, opts = {}) {
    const TAG = '[postJson]';
    dbg(TAG, 'request', url, payload);
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
      try { text = await res.text(); } catch(e){ text = '<no-body>'; }
      dbg(TAG, 'response', { status, headers, bodyText: text });
      const ct = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
      if (ct.includes('application/json')) {
        try { return { status, body: JSON.parse(text), headers }; } catch (e) { return { status, body: text, headers }; }
      }
      return { status, body: text, headers };
    } catch (e) {
      err(TAG, 'network error', e);
      return { status: 0, body: { error: e.message || String(e) }, headers: {} };
    }
  }

  // ---- OTP helpers ----
  function getOtpValue() {
    const inputs = qsa(OTP_INPUT_SELECTOR);
    if (!inputs || inputs.length === 0) { dbg('getOtpValue: no inputs'); return ''; }
    if (inputs.length === 1) return inputs[0].value.trim();
    return inputs.map(i => i.value.trim()).join('');
  }
  function clearOtpInputs(){ qsa(OTP_INPUT_SELECTOR).forEach(i => i.value = ''); dbg('clearOtpInputs'); }
  function blurOtpInputs(){ qsa(OTP_INPUT_SELECTOR).forEach(i => { try { i.blur(); } catch(e){} }); dbg('blurOtpInputs'); }

  // ---- Resend countdown (FIXED: Clean display after countdown) ----
let resendTimer = null;
function startResendCountdown(durationSec = 60) {
  const btn = $(RESEND_BTN_ID);
  if (!btn) { warn('startResendCountdown: missing button'); return; }

  dbg('startResendCountdown', durationSec);
  clearInterval(resendTimer);

  let remaining = Math.max(0, parseInt(durationSec, 10) || 60);

  // Store clean original text (strip any existing countdown)
  if (!btn.dataset._origText) {
    btn.dataset._origText = (btn.textContent || '').replace(/\s*\(\d+s\)\s*$/, '').trim() || 'Resend OTP';
  }

  btn.disabled = true;
  btn.setAttribute('aria-disabled', 'true');
  btn.textContent = `${btn.dataset._origText} (${remaining}s)`;

  resendTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(resendTimer);
      resendTimer = null;

      btn.disabled = false;
      btn.removeAttribute('aria-disabled');

      // Restore clean text without countdown
      btn.textContent = btn.dataset._origText || 'Resend OTP';
      log('startResendCountdown: finished - restored text:', btn.textContent);
    } else {
      btn.textContent = `${btn.dataset._origText} (${remaining}s)`;
    }
  }, 1000);
}


  // ---- Email client opener ----
  function openEmailClient(email) {
    log('openEmailClient', email);
    if (!email) { notify({ type: 'warn', title: 'No email', message: 'No email known for this account.' }); return; }
    const domain = (email.split('@')[1] || '').toLowerCase();
    try {
      if (domain === 'gmail.com' || domain.endsWith('googlemail.com')) { window.open('https://mail.google.com/mail/u/0/#inbox', '_blank'); return; }
      if (domain.endsWith('yahoo.com')) { window.open('https://mail.yahoo.com/d/folders/1', '_blank'); return; }
      if (domain.endsWith('outlook.com') || domain.endsWith('hotmail.com') || domain.endsWith('live.com')) { window.open('https://outlook.live.com/mail/inbox', '_blank'); return; }
      if (domain.endsWith('icloud.com') || domain.endsWith('me.com')) { window.open('https://www.icloud.com/mail', '_blank'); return; }
      window.open(`mailto:${encodeURIComponent(email)}`, '_blank');
    } catch (e) {
      dbg('openEmailClient fallback', e);
      try { window.location.href = `mailto:${encodeURIComponent(email)}`; } catch(e2){ dbg('openEmailClient final fallback failed', e2); }
    }
  }

  // ---- OTP verify handler (FIXED: Close all modals smoothly) ----
  async function verifyOtpSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    log('verifyOtpSubmit: start');
    const email = await getUserEmail();
    dbg('verifyOtpSubmit: email', email);
    if (!email) {
      notify({ type: 'error', title: 'Email missing', message: 'No email detected. Please login or set mockEmail in localStorage for dev.' });
      warn('verifyOtpSubmit abort: no email');
      return;
    }

    const token = getOtpValue();
    dbg('verifyOtpSubmit token', token);
    if (!token || token.length < 6) {
      notify({ type: 'warn', title: 'Invalid OTP', message: 'Please enter the 6-digit OTP.' });
      return;
    }

    const verifyBtn = $(VERIFY_BTN_ID);
    if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.dataset._origText = verifyBtn.textContent; verifyBtn.textContent = 'Verifying…'; }

    try {
      const { status, body } = await withLoader(() =>
        postJson(SERVER_VERIFY_OTP, { email, token })
      );
      log('verifyOtpSubmit: server', status, body);
      if (status >= 200 && status < 300) {
        notify({ type: 'info', title: 'OTP Verified', message: 'OTP verified. Please create your new PIN.' });
        
        // Open pin modal (create-pin). If ModalManager present, use it.
        let opened = false;
        if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
          try { window.ModalManager.openModal('pinModal'); opened = true; dbg('verifyOtpSubmit: opened pinModal via ModalManager'); } catch(e){ dbg('ModalManager.openModal error', e); }
        }
        if (!opened) {
          const el = $('pinModal');
          if (el) { el.classList.remove('hidden'); el.style.display = 'flex'; el.setAttribute('aria-hidden','false'); opened = true; dbg('verifyOtpSubmit: opened pinModal via DOM fallback'); }
        }
        
        // Close reset modal if open
        try { 
          if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') {
            window.ModalManager.closeModal(RESET_MODAL_ID); 
          } else { 
            const r = $(RESET_MODAL_ID); 
            if (r) { r.classList.add('hidden'); r.style.display='none'; r.setAttribute('aria-hidden','true'); } 
          } 
        } catch(e){ dbg('closing reset modal failed', e); }
        
        clearOtpInputs();

        // FIXED: Setup one-time listener for final pin setup success – close ALL modals smoothly
        const onPinStatusChanged = (ev) => {
          log('onPinStatusChanged: PIN setup complete event received', ev && ev.detail);
          
          try {
            // FIXED: Use ModalManager.closeAll() for smooth modal closure
            if (window.ModalManager && typeof window.ModalManager.closeAll === 'function') {
              log('onPinStatusChanged: Calling ModalManager.closeAll() to smoothly close all modals');
              window.ModalManager.closeAll();
              dbg('onPinStatusChanged: All modals closed via ModalManager');
            } else {
              // Fallback: Close known modals manually
              log('onPinStatusChanged: ModalManager.closeAll not available - using DOM fallback');
              const known = ['pinModal','resetPinModal','securityPinModal','securityModal','settingsModal','updateProfileModal'];
              known.forEach(id => {
                const el = document.getElementById(id);
                if (el) { 
                  el.classList.add('hidden'); 
                  el.style.display = 'none'; 
                  el.setAttribute('aria-hidden','true'); 
                  el.setAttribute('inert', '');
                }
              });
              // Remove any .modal-backdrop elements
              document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
              dbg('onPinStatusChanged: Modals closed via DOM fallback');
            }
          } catch (e) {
            err('onPinStatusChanged: error during closeAll', e);
          } finally {
            // FIXED: Success notification AFTER modals are closed
            notify({ 
              type: 'success', 
              title: 'PIN Reset Complete', 
              message: 'Your new PIN has been created successfully!',
              duration: 5000 
            });
            
            // Remove this one-time listener
            try { 
              document.removeEventListener('pin-status-changed', onPinStatusChanged); 
              delete window.__rp_handlers._pinStatusHandler;
              dbg('onPinStatusChanged: Removed one-time listener'); 
            } catch(e){ dbg('removeEventListener threw', e); }
            
            // Give dashboard a moment to settle, then focus main content
            setTimeout(() => { 
              try { 
                const main = document.querySelector('main, #dashboard, [role="main"]'); 
                if (main) {
                  main.focus(); 
                  window.scrollTo({ top: 0, behavior: 'smooth' }); 
                  log('onPinStatusChanged: Focused dashboard and scrolled to top');
                }
              } catch(e){ dbg('focus/scroll error', e); } 
            }, 100);
          }
        };

        // Attach one-time listener (in case pin is created by user on the pinModal)
        document.removeEventListener('pin-status-changed', window.__rp_handlers._pinStatusHandler);
        window.__rp_handlers._pinStatusHandler = onPinStatusChanged;
        document.addEventListener('pin-status-changed', onPinStatusChanged);
        dbg('verifyOtpSubmit: Attached pin-status-changed listener to close all modals on completion');
        // 🆕 ADDED — Force close all modals if this was a PIN update (user already had a PIN)
const hasExistingPin = localStorage.getItem('hasPin') === 'true';
if (hasExistingPin) {
  log('Existing PIN detected → force-closing all modals');
  try {
    if (window.ModalManager?.closeAll) {
      window.ModalManager.closeAll();
    } else {
      // fallback: manually hide all modals and backdrops
      document.querySelectorAll('.modal, .modal-backdrop').forEach(el => {
        el.style.display = 'none';
        el.classList.add('hidden');
        el.setAttribute('aria-hidden','true');
      });
    }
  } catch (e) {
    warn('force close error', e);
  }
}

        
      } else {
        const errMsg = (body && body.error && body.error.message) ? body.error.message : (body && body.message) ? body.message : 'OTP verification failed';
        warn('verifyOtpSubmit server error', status, errMsg);
        if (status === 400 || status === 403) {
          const errCode = body?.error?.code || null;
          if (errCode === 'otp_expired' || (errMsg && String(errMsg).toLowerCase().includes('expired'))) {
            notify({ type: 'warn', title: 'OTP expired', message: 'OTP expired. Please resend OTP and try again.' });
          } else {
            notify({ type: 'error', title: 'Verification failed', message: errMsg });
          }
        } else {
          notify({ type: 'error', title: 'Verification failed', message: errMsg });
        }
      }
    } catch (e) {
      err('verifyOtpSubmit unexpected error', e);
      notify({ type: 'error', title: 'Network error', message: 'Network error verifying OTP – check console.' });
    } finally {
      if (verifyBtn) {
        verifyBtn.disabled = false;
        if (verifyBtn.dataset._origText) { verifyBtn.textContent = verifyBtn.dataset._origText; delete verifyBtn.dataset._origText; }
      }
      log('verifyOtpSubmit: end');
    }
  }

  // ---- Resend handler (FIXED: Restart countdown on resend) ----
  async function resendOtpHandler(e) {
    if (e && e.preventDefault) e.preventDefault();
    log('resendOtpHandler: start');
    const btn = $(RESEND_BTN_ID);
    if (!btn) { warn('resendOtpHandler: missing button'); return; }
    if (btn.disabled) { dbg('resendOtpHandler: button disabled'); return; }
    
    const email = await getUserEmail();
    dbg('resendOtpHandler email', email);
    if (!email) {
      notify({ type: 'warn', title: 'Email missing', message: 'Unable to find your account email. For dev: localStorage.setItem("mockEmail","dev@example.com")' });
      return;
    }
    
    btn.disabled = true;
    const origText = btn.dataset._origText || btn.textContent;
    btn.textContent = 'Sending…';
    
    try {
      const { status, body } = await withLoader(() =>
        postJson(SERVER_RESEND_OTP, { email })
      );
      dbg('resendOtpHandler response', status, body);
      if (status >= 200 && status < 300) {
        notify({ type: 'info', title: 'OTP sent', message: `OTP sent to ${email}` });
        // FIXED: Restart countdown with clean button text
        btn.dataset._origText = origText;
        startResendCountdown(60);
      } else {
        const errMsg = body?.error?.message || body?.message || 'Failed to resend OTP';
        warn('resendOtpHandler server error', status, errMsg);
        notify({ type: 'error', title: 'Resend failed', message: errMsg });
        btn.disabled = false;
        btn.textContent = origText;
      }
    } catch (e) {
      err('resendOtpHandler network error', e);
      notify({ type: 'error', title: 'Network error', message: 'Network error sending OTP – check console.' });
      btn.disabled = false;
      btn.textContent = origText;
    } finally {
      log('resendOtpHandler: end');
    }
  }

  // ---- OTP input wiring ----
  function wireOtpInputs() {
    const inputs = qsa(OTP_INPUT_SELECTOR);
    log('wireOtpInputs: count', inputs.length);
    if (!inputs || inputs.length === 0) { warn('no otp inputs found'); return; }

    // cleanup old handlers
    if (Array.isArray(window.__rp_handlers.otpInputs)) {
      window.__rp_handlers.otpInputs.forEach(({ el, handlers }) => {
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
        dbg('single input length', v.length);
        if (v.length >= 6) { try { input.blur(); } catch(_){}; setTimeout(() => verifyOtpSubmit(), 120); }
      };
      input.removeEventListener('input', onInput);
      input.addEventListener('input', onInput);
      window.__rp_handlers.otpInputs.push({ el: input, handlers: { input: onInput } });
      log('wireOtpInputs: wired single input auto-submit');
      return;
    }

    inputs.forEach((inp, idx) => {
      inp.setAttribute('inputmode','numeric');
      inp.setAttribute('maxlength','1');
      const onInput = (e) => {
        const v = inp.value;
        if (v && idx < inputs.length - 1) {
          try { inputs[idx+1].focus(); } catch(e){ dbg('focus next failed', e); }
        }
        const all = inputs.map(i => i.value.trim()).join('');
        dbg('multi inputs collected', all);
        if (all.length === inputs.length) { blurOtpInputs(); setTimeout(() => verifyOtpSubmit(), 120); }
      };
      const onKeydown = (e) => {
        if (e.key === 'Backspace' && !inp.value && idx > 0) { try { inputs[idx-1].focus(); } catch(e){ dbg('focus prev failed', e); } }
      };
      inp.removeEventListener('input', onInput);
      inp.removeEventListener('keydown', onKeydown);
      inp.addEventListener('input', onInput);
      inp.addEventListener('keydown', onKeydown);
      window.__rp_handlers.otpInputs.push({ el: inp, handlers: { input: onInput, keydown: onKeydown } });
    });
    log('wireOtpInputs: wired multi inputs');
  }

  // ---- Wire UI handlers ----
  async function wire() {
    log('wire: wiring UI elements');
    const trigger = $(TRIGGER_ID);
    if (trigger) {
      window.__rp_handlers.onTriggerClicked = window.__rp_handlers.onTriggerClicked || onTriggerClicked;
      trigger.removeEventListener('click', window.__rp_handlers.onTriggerClicked);
      trigger.addEventListener('click', window.__rp_handlers.onTriggerClicked);
      log('wire: bound trigger', TRIGGER_ID);
    } else { warn('wire: trigger not found', TRIGGER_ID); }

    const resendBtn = $(RESEND_BTN_ID);
    if (resendBtn) {
      window.__rp_handlers.resendOtpHandler = window.__rp_handlers.resendOtpHandler || resendOtpHandler;
      resendBtn.removeEventListener('click', window.__rp_handlers.resendOtpHandler);
      resendBtn.addEventListener('click', window.__rp_handlers.resendOtpHandler);
      log('wire: bound resend', RESEND_BTN_ID);
    } else { warn('wire: resend not found', RESEND_BTN_ID); }

    const openEmailBtn = $(OPEN_EMAIL_BTN_ID);
    if (openEmailBtn) {
      window.__rp_handlers.onOpenEmailClick = window.__rp_handlers.onOpenEmailClick || onOpenEmailClick;
      openEmailBtn.removeEventListener('click', window.__rp_handlers.onOpenEmailClick);
      openEmailBtn.addEventListener('click', window.__rp_handlers.onOpenEmailClick);
      log('wire: bound open-email', OPEN_EMAIL_BTN_ID);
    } else { warn('wire: open-email not found', OPEN_EMAIL_BTN_ID); }

    const otpForm = $(OTP_FORM_ID);
    const verifyBtn = $(VERIFY_BTN_ID);
    if (otpForm) {
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
      warn('wire: no verify button or form found');
    }

    wireOtpInputs();

    // Display full email if element exists
    const fullEl = $(FULL_EMAIL_ID), maskedEl = $(MASKED_EMAIL_ID);
    const email = await getUserEmail();
    log('wire: display email', email);
    if (fullEl && email) { fullEl.textContent = email; if (maskedEl) maskedEl.textContent = email; log('wire: wrote full email'); }
    else if (maskedEl && email) { maskedEl.textContent = email; log('wire: wrote masked element with full email'); }
    else dbg('wire: no place to show email or no email');

    log('wire: complete');
  }

  // ---- Trigger clicked: send resend + show modal ----
  async function onTriggerClicked(e) {
    e && e.preventDefault && e.preventDefault();
    log('onTriggerClicked: start');
    const btn = e && e.currentTarget ? e.currentTarget : $(TRIGGER_ID);
    if (!btn) { warn('onTriggerClicked: missing btn'); return; }
    if (btn.disabled) { dbg('onTriggerClicked: disabled'); return; }
    btn.disabled = true;
    btn.dataset._origText = btn.dataset._origText || btn.textContent || '';
    btn.textContent = 'Preparing…';

    const email = await getUserEmail();
    dbg('onTriggerClicked email', email);
    if (!email) {
      notify({ type: 'warn', title: 'Email missing', message: 'Unable to find your account email. For dev: localStorage.setItem("mockEmail","dev@example.com")' });
      btn.disabled = false;
      if (btn.dataset._origText) { btn.textContent = btn.dataset._origText; delete btn.dataset._origText; }
      return;
    }

    // show email
    try {
      const maskedEl = $(MASKED_EMAIL_ID), fullEl = $(FULL_EMAIL_ID);
      if (maskedEl) maskedEl.textContent = email;
      if (fullEl) fullEl.textContent = email;
      dbg('onTriggerClicked: email displayed in modal elements');
    } catch (e) { dbg('onTriggerClicked display email failed', e); }

    // call resend API and open modal
    try {
      const { status, body } = await withLoader(() =>
  postJson(SERVER_RESEND_OTP, { email })
);

      dbg('onTriggerClicked resend response', status, body);
      if (status >= 200 && status < 300) {
        // open reset modal
        let opened = false;
        if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
          try { window.ModalManager.openModal(RESET_MODAL_ID); opened = true; dbg('onTriggerClicked opened reset modal via manager'); } catch(e){ dbg('ModalManager.openModal threw', e); }
        }
        if (!opened) {
          const el = $(RESET_MODAL_ID);
          if (el) { el.classList.remove('hidden'); el.style.display = 'flex'; el.setAttribute('aria-hidden','false'); opened = true; dbg('onTriggerClicked opened reset modal via DOM fallback'); }
        }
        if (opened) setTimeout(() => { try { wireOtpInputs(); } catch(e){ dbg('wireOtpInputs after open failed', e); } }, 40);
        startResendCountdown(60);
        notify({ type: 'info', title: 'OTP sent', message: `OTP sent to ${email}` });
      } else {
        const errMsg = body?.error?.message || body?.message || 'Failed to send OTP';
        notify({ type: 'error', title: 'Resend failed', message: errMsg });
      }
    } catch (e) {
      err('onTriggerClicked resend OTP network error', e);
      notify({ type: 'error', title: 'Network error', message: 'Failed to send OTP – check console.' });
    } finally {
      btn.disabled = false;
      if (btn.dataset._origText) { btn.textContent = btn.dataset._origText; delete btn.dataset._origText; }
      log('onTriggerClicked: end');
    }
  }

  async function onOpenEmailClick(e) { e && e.preventDefault && e.preventDefault(); log('onOpenEmailClick'); const email = await getUserEmail(); openEmailClient(email); }

  // Auto wire
  function initAutoWire() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wire);
      log('initAutoWire: waiting DOMContentLoaded');
    } else {
      wire();
      log('initAutoWire: wired immediately');
    }
  }
  initAutoWire();

  // Expose debug helpers
  window.__rp_wire_debug = Object.assign(window.__rp_wire_debug || {}, {
    getUserEmail, openEmailClient, postJson, SERVER_RESEND_OTP, SERVER_VERIFY_OTP,
    wire, rewire: wire, verifyOtpSubmit, resendOtpHandler, startResendCountdown, notify
  });

  log('resetPin module v7 loaded – PIN reset flow ready');

})();

/* change-password.js
   Merged: robust changePWD visibility controller + Change Password modal logic (validation + toasts)
   Assumes you set: window.__SEC_API_BASE or API_BASE constant before this runs (or uses relative paths).
*/

/* change-password.js
   Merged: visibility controller + full-screen change password modal logic
   - Adds eye toggles for current/new/confirm inputs
   - Auto-submit when confirm matches new OR when confirm length == new length (debounced)
   - Reset button acts as "forgot/reset"
   - Change button pinned to bottom
   Include after modalManager.js and after any window.__SEC_API_BASE definition.
*/

const API_BASE = (window.__SEC_API_BASE || '').replace(/\/$/, '') || (typeof API_BASE !== 'undefined' ? API_BASE : '');

(function () {
  'use strict';
  console.log('[changePWD] ▶️ init merged controller + modal (full-screen + eye toggles + auto-submit)');

  /* ---------------------------
     SECTION A: Visibility Controller (unchanged)
     --------------------------- */
  const resolvedBase = API_BASE || '';
  const endpoints = [
    resolvedBase ? `${resolvedBase}/api/profile` : '/api/profile',
    resolvedBase ? `${resolvedBase}/profile` : '/profile',
    resolvedBase ? `${resolvedBase}/auth/profile` : '/auth/profile'
  ];
  function hideAllChangeControls() {
    const list = document.querySelectorAll('#changePWD');
    list.forEach(el => {
      el.style.display = 'none';
      const wrap = el.nextElementSibling && el.nextElementSibling.id === 'pwdFormWrap'
        ? el.nextElementSibling
        : document.getElementById('pwdFormWrap');
      if (wrap) wrap.hidden = true;
    });
  }
  function showAllChangeControls() {
    const list = document.querySelectorAll('#changePWD');
    list.forEach(el => {
      el.style.display = '';
      const wrap = el.nextElementSibling && el.nextElementSibling.id === 'pwdFormWrap'
        ? el.nextElementSibling
        : document.getElementById('pwdFormWrap');
      if (wrap) wrap.hidden = false;
    });
  }
  hideAllChangeControls();
  const globalObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (!m.addedNodes || !m.addedNodes.length) continue;
      for (const node of m.addedNodes) {
        try {
          if (node.nodeType !== 1) continue;
          if (node.id === 'changePWD') {
            node.style.display = 'none';
            const wrap = document.getElementById('pwdFormWrap');
            if (wrap) wrap.hidden = true;
            console.log('[changePWD] 🔍 New #changePWD injected — hidden (awaiting server confirmation).');
          }
          const inside = node.querySelector && node.querySelector('#changePWD');
          if (inside) {
            inside.style.display = 'none';
            const wrap = document.getElementById('pwdFormWrap');
            if (wrap) wrap.hidden = true;
            console.log('[changePWD] 🔍 #changePWD found inside new node — hidden (awaiting server).');
          }
        } catch (err) {
          console.warn('[changePWD] observer error', err);
        }
      }
    }
  });
  globalObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });

  // fetch with timeout helper
  async function fetchWithTimeout(url, opts = {}, ms = 7000) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const resp = await fetch(url, Object.assign({}, opts, { signal: c.signal }));
      clearTimeout(t);
      return resp;
    } catch (err) {
      clearTimeout(t);
      throw err;
    }
  }

  async function probeProfile() {
    for (let i = 0; i < endpoints.length; i++) {
      const url = endpoints[i];
      try {
        const resp = await fetchWithTimeout(url, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        }, 8000);

        if (resp.status === 401 || resp.status === 403) {
          return { ok: false, reason: `auth(${resp.status})` };
        }
        const text = await resp.text();
        if (!text) return { ok: false, reason: 'empty' };
        try {
          const payload = JSON.parse(text);
          return { ok: true, hasPassword: payload?.hasPassword === true, payload };
        } catch (jErr) {
          return { ok: false, reason: 'json-parse-failed', raw: text };
        }
      } catch (err) {
        // try next endpoint
      }
    }
    return { ok: false, reason: 'all-failed' };
  }

  async function evaluateOnce() {
    const r = await probeProfile();
    if (r.ok && r.hasPassword === true) {
      showAllChangeControls();
    } else {
      hideAllChangeControls();
    }
  }
  evaluateOnce().catch(err => { hideAllChangeControls(); });
  window.__changePWDControl = { recheck: evaluateOnce, revealNow: showAllChangeControls, hideNow: hideAllChangeControls };

  /* ---------------------------
     SECTION B: Modal + Validation + Toasts + Eye toggles + Auto-submit
     --------------------------- */
  function $(id) { return document.getElementById(id); }

  // Toasts container
  const toastContainerId = 'cp-toast-container';
  function ensureToastContainer() {
    let c = document.getElementById(toastContainerId);
    if (!c) {
      c = document.createElement('div');
      c.id = toastContainerId;
      Object.assign(c.style, {
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: 35000,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        pointerEvents: 'none'
      });
      document.body.appendChild(c);
    }
    return c;
  }
  function showToast(message, type = 'info', ttl = 3500) {
    const container = ensureToastContainer();
    const t = document.createElement('div');
    t.className = `cp-toast ${type}`;
    Object.assign(t.style, {
      minWidth: '220px', maxWidth: '360px', padding: '10px 12px',
      borderRadius: '8px', color: '#fff', fontSize: '0.95rem',
      boxShadow: '0 10px 30px rgba(0,0,0,0.5)', pointerEvents: 'auto',
      opacity: '0', transform: 'translateY(-6px)', transition: 'opacity .25s ease, transform .25s ease'
    });
    if (type === 'success') t.style.background = 'linear-gradient(90deg,#2bbf7a,#1f9f66)';
    else if (type === 'error') t.style.background = 'linear-gradient(90deg,#ff6b6b,#e85a5a)';
    else t.style.background = 'linear-gradient(90deg,#2c7ef3,#1160d9)';
    t.textContent = message;
    container.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
    setTimeout(() => {
      t.style.opacity = '0'; t.style.transform = 'translateY(-6px)';
      setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 260);
    }, ttl);
    return t;
  }

  // validation
  function validatePasswordsFromDOM() {
    const current = $('currentPwd')?.value || '';
    const nw = $('newPwd')?.value || '';
    const conf = $('confirmPwd')?.value || '';
    if (!current.trim() || !nw.trim() || !conf.trim()) return { ok: false, reason: 'All fields are required.' };
    if (current === nw) return { ok: false, reason: 'New password must be different from current password.' };
    if (nw !== conf) return { ok: false, reason: 'New password and confirmation do not match.' };
    return { ok: true, data: { current, new: nw } };
  }

    // submit (REPLACEMENT) - robust response parsing and friendlier messages
  let isSubmitting = false;

  // helper: parse response body (json preferred, fallback to text)
  async function parseResponseBody(resp) {
    try {
      const ct = (resp.headers && resp.headers.get) ? (resp.headers.get('content-type') || '') : '';
      if (ct.toLowerCase().includes('application/json')) {
        // safe json parse
        return await resp.json();
      }
    } catch (e) {
      // ignore and fall through to text
      console.warn('[changePWD] parseResponseBody: json parse failed', e);
    }

    try {
      const text = await resp.text();
      // try to parse as JSON anyway
      try { return JSON.parse(text); } catch (_) { return text || ''; }
    } catch (e) {
      console.warn('[changePWD] parseResponseBody: text read failed', e);
      return '';
    }
  }

    async function submitChangePassword(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (isSubmitting) return;
    const formEl = $('changePwdForm');
    if (!formEl) { showToast('Change password form not found.', 'error'); return; }

    const validation = validatePasswordsFromDOM();
    if (!validation.ok) {
      showToast(validation.reason, 'error');
      const reason = (validation.reason || '').toLowerCase();
      if (reason.includes('confirmation')) $('confirmPwd')?.focus();
      else if (reason.includes('different')) $('newPwd')?.focus();
      else $('currentPwd')?.focus();
      return;
    }

    // ---- BLUR inputs to close soft keyboard / remove focus immediately ----
    try {
      const toBlur = ['currentPwd', 'newPwd', 'confirmPwd'];
      toBlur.forEach(id => { const el = document.getElementById(id); if (el && typeof el.blur === 'function') el.blur(); });
      // fallback: blur activeElement if still an input/textarea
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
        try { document.activeElement.blur(); } catch(_) { /* ignore */ }
      }
    } catch (e) {
      console.warn('[changePWD] blur fallback failed', e);
    }
    // --------------------------------------------------------------------

    isSubmitting = true;
    showToast('Changing password…', 'info', 2000);
    const endpoint = (API_BASE ? `${API_BASE}/api/change-password` : '/api/change-password');

    try {
      const resp = await fetchWithTimeout(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ currentPassword: validation.data.current, newPassword: validation.data.new })
      }, 10000);

      // parse body robustly
      const body = await parseResponseBody(resp);
      console.debug('[changePWD] submitChangePassword response', { status: resp.status, body });

      if (!resp.ok) {
        const serverMsg =
          (body && (body.message || (body.error && body.error.message) || body.error || body.msg || body.detail)) ||
          (typeof body === 'string' && body) ||
          `Server error (${resp.status})`;
        const preview = (typeof body === 'object' && body !== null && !serverMsg) ? JSON.stringify(body) : null;
        showToast(serverMsg || preview || `Server error (${resp.status})`, 'error', 6000);
        console.error('[changePWD] change failed', resp.status, body);
        isSubmitting = false;
        return;
      }

      const successMsg = (body && (body.message || body.msg || body.success)) || 'Password changed successfully.';
      showToast(successMsg, 'success', 3500);
      formEl.reset();
      isSubmitting = false;

      if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') {
        try { window.ModalManager.closeModal('changePwdModal'); }
        catch (err) { console.warn('[changePWD] ModalManager close failed', err); }
      } else {
        const modal = $('changePwdModal'); if (modal) modal.style.display = 'none';
      }
    } catch (err) {
      console.error('[changePWD] change request error', err);
      if (err && err.name === 'AbortError') showToast('Request timed out. Try again.', 'error', 4500);
      else showToast('Failed to change password. Check connection.', 'error', 4500);
      isSubmitting = false;
    }
  }



  // reset handler (forgot password)
  // --- Add/replace these helpers in your change-password.js ---

// Try to resolve the user's email from embedded server data or profile endpoint
async function getEmailForReset() {
  // 1) prefer server-embedded user data (fast)
  try {
    const s = window.__SERVER_USER_DATA__;
    if (s && s.email && typeof s.email === 'string') return s.email;
  } catch (e) { /* ignore */ }

  // 2) try to call profile endpoints used by probe (best-effort)
  const probeUrls = [
    (API_BASE ? `${API_BASE}/api/profile` : '/api/profile'),
    (API_BASE ? `${API_BASE}/profile` : '/profile'),
    (API_BASE ? `${API_BASE}/auth/profile` : '/auth/profile')
  ];

  for (const url of probeUrls) {
    try {
      const r = await fetchWithTimeout(url, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      }, 6000);
      if (!r.ok) continue;
      const txt = await r.text();
      if (!txt) continue;
      try {
        const j = JSON.parse(txt);
        // common shapes: { email }, { user: { email } }, etc.
        if (j.email) return j.email;
        if (j.user && j.user.email) return j.user.email;
        if (j.payload && j.payload.email) return j.payload.email;
      } catch (_) {
        // try next
      }
    } catch (_) { /* ignore and try next probe url */ }
  }

  // 3) last resort: look for an input or meta tag, or return empty
  const meta = document.querySelector('meta[name="user-email"]');
  if (meta && meta.content) return meta.content;
  return '';
}

// Replace handleResetPassword with this function
async function handleResetPassword(ev) {
  if (ev && ev.preventDefault) ev.preventDefault();

  const triggerBtn = ev && ev.currentTarget ? ev.currentTarget : document.getElementById('resetPwdBtn');
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.dataset._origText = triggerBtn.dataset._origText || triggerBtn.textContent || '';
    triggerBtn.textContent = 'Sending…';
  }

  showToast('Sending OTP to your email…', 'info', 2500);

  const email = (await getEmailForReset()) || '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('Unable to determine your account email. Please check your profile.', 'error', 5000);
    if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = triggerBtn.dataset._origText || 'Reset password'; }
    return;
  }

  const endpoint = API_BASE ? `${API_BASE}/auth/resend-otp` : '/auth/resend-otp';

  try {
    const resp = await fetchWithTimeout(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email })
    }, 10000);

    const body = await (async () => {
      try { return resp.headers && resp.headers.get && resp.headers.get('content-type') && resp.headers.get('content-type').includes('application/json') ? await resp.json() : await resp.text(); }
      catch (e) { try { return await resp.text(); } catch (_) { return null; } }
    })();

    if (!resp.ok) {
      const errMsg = (body && (body.message || (body.error && body.error.message) || body.error)) || `Failed to send OTP (${resp.status})`;
      showToast(errMsg, 'error', 6000);
      console.error('[changePWD] resend-otp failed', resp.status, body);
      if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = triggerBtn.dataset._origText || 'Reset password'; }
      return;
    }

    // success: open reset modal only after server confirms OTP send
    showToast((body && (body.message || body.status === 'sent' ? 'OTP sent to your email.' : body)) || 'OTP sent to your email.', 'success', 2500);

    let opened = false;
    if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
      try { window.ModalManager.openModal('rpResetModal'); opened = true; }
      catch (e) { console.warn('[changePWD] ModalManager.openModal failed', e); }
    }
    if (!opened) {
      const el = document.getElementById('rpResetModal');
      if (el) { el.setAttribute('aria-hidden', 'false'); el.style.display = 'flex'; opened = true; }
    }

    // start robust countdown for the reset modal's button id 'mp-resend-btn' (your reset markup)
    try {
      if (window.__resendCountdown && typeof window.__resendCountdown.start === 'function') {
        window.__resendCountdown.start('mp-resend-btn', 60);
      } else if (window.__rp_wire_debug && typeof window.__rp_wire_debug.startResendCountdown === 'function') {
        window.__rp_wire_debug.startResendCountdown(60);
      } else {
        // fallback: update button directly if present
        const btn = document.getElementById('mp-resend-btn') || document.getElementById('rp-resend-btn');
        if (btn) {
          btn.disabled = true;
          btn.setAttribute('aria-disabled','true');
          btn.dataset._origText = btn.dataset._origText || btn.textContent || 'Resend OTP';
          btn.textContent = 'Resend (60s)';
          // lightweight fallback timer (cleans itself)
          let rem = 60;
          const tid = setInterval(() => {
            rem--;
            if (rem <= 0) {
              clearInterval(tid);
              try { btn.disabled = false; btn.removeAttribute('aria-disabled'); btn.textContent = btn.dataset._origText || 'Resend OTP'; } catch(_) {}
            } else {
              try { btn.textContent = `Resend (${rem}s)`; } catch(_) {}
            }
          }, 1000);
        }
      }
    } catch (e) {
      console.warn('[changePWD] startResendCountdown failed', e);
    }

  } catch (err) {
    console.error('[changePWD] resend-otp request error', err);
    showToast('Network error while sending OTP. Try again.', 'error', 5000);
  } finally {
    if (triggerBtn) {
      // restore trigger button text (the reset button in the change modal should go back to its label)
      triggerBtn.disabled = false;
      triggerBtn.textContent = triggerBtn.dataset._origText || 'Reset password';
    }
  }
}



  /* Eye toggle logic */
  function togglePasswordVisibility(targetId, btn) {
    const input = document.getElementById(targetId);
    if (!input) return;
    const isPwd = input.type === 'password';
    input.type = isPwd ? 'text' : 'password';
    // swap icons
    const openSvg = btn.querySelector('.eye-open');
    const closedSvg = btn.querySelector('.eye-closed');
    if (openSvg && closedSvg) {
      if (isPwd) { openSvg.style.display = 'none'; closedSvg.style.display = 'inline'; }
      else { openSvg.style.display = 'inline'; closedSvg.style.display = 'none'; }
    }
  }

  /* Auto-submit behavior (debounced) */
  // Auto-submit (fixed)
let autoSubmitTimer = null;
function scheduleAutoSubmitIfNeeded() {
  if (autoSubmitTimer) clearTimeout(autoSubmitTimer);
  autoSubmitTimer = setTimeout(() => {
    const newV = $('newPwd')?.value || '';
    const confV = $('confirmPwd')?.value || '';
    const curV = $('currentPwd')?.value || '';

    // nothing to do until user typed something in all fields
    if (!newV || !confV || !curV) return;

    // sync visual validation (keeps outline logic consistent)
    try {
      const newInput = $('newPwd'), confirmInput = $('confirmPwd');
      if (newInput && confirmInput) {
        if (newV !== confV) confirmInput.style.outline = '2px solid rgba(255,120,120,0.18)';
        else confirmInput.style.outline = '2px solid rgba(80,220,140,0.14)';
      }
    } catch (e) { /* ignore visual sync errors */ }

    // Condition A: exact match (auto-submit immediately)
    if (newV === confV) {
      // blur inputs to close keyboard
      try {
        ['currentPwd','newPwd','confirmPwd'].forEach(id => { const el = document.getElementById(id); if (el && typeof el.blur === 'function') el.blur(); });
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
          try { document.activeElement.blur(); } catch(_) {}
        }
      } catch (e) { /* ignore */ }

      submitChangePassword();
      return;
    }

    // Condition B: same length AND new password long enough to avoid accidental submits
    const MIN_AUTO_SUBMIT_LENGTH = 8; // adjust to your policy
    if (newV.length === confV.length && newV.length >= MIN_AUTO_SUBMIT_LENGTH) {
      try {
        ['currentPwd','newPwd','confirmPwd'].forEach(id => { const el = document.getElementById(id); if (el && typeof el.blur === 'function') el.blur(); });
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
          try { document.activeElement.blur(); } catch(_) {}
        }
      } catch (e) { /* ignore */ }

      submitChangePassword();
      return;
    }

    // otherwise, do nothing (user still typing)
  }, 220);
}


  // live inline check visuals & attach auto-submit
  function attachLiveChecksAndAutoSubmit() {
    const newInput = $('newPwd'); const confirmInput = $('confirmPwd');
    if (!newInput || !confirmInput) return;

    const syncValidation = () => {
      if (!newInput.value || !confirmInput.value) {
        newInput.style.outline = ''; confirmInput.style.outline = ''; return;
      }
      if (newInput.value !== confirmInput.value) {
        confirmInput.style.outline = '2px solid rgba(255,120,120,0.18)';
      } else {
        confirmInput.style.outline = '2px solid rgba(80,220,140,0.14)';
      }
    };

    newInput.addEventListener('input', (e) => {
      syncValidation();
      scheduleAutoSubmitIfNeeded();
    });
    confirmInput.addEventListener('input', (e) => {
      syncValidation();
      scheduleAutoSubmitIfNeeded();
    });
  }

  // Wire up events (works if modal inserted later)
  function wireModalEventsOnce() {
    const form = $('changePwdForm');
    if (form && !form.__changePwdWired) {
      form.addEventListener('submit', submitChangePassword);
      form.__changePwdWired = true;
    }

    const resetBtn = $('resetPwdBtn');
    if (resetBtn && !resetBtn.__wiredReset) {
      resetBtn.addEventListener('click', handleResetPassword);
      resetBtn.__wiredReset = true;
    }

    // wire eye toggles
    const toggles = document.querySelectorAll('.pwd-toggle');
    toggles.forEach(btn => {
      if (btn.__wired) return;
      const target = btn.getAttribute('data-target');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        togglePasswordVisibility(target, btn);
      });
      btn.__wired = true;
    });

    attachLiveChecksAndAutoSubmit();
  }

  // initial attempt to wire
  try { wireModalEventsOnce(); } catch (e) { /* continue */ }

  // observe for modal/form injection to wire later if needed
  const modalObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (!m.addedNodes || !m.addedNodes.length) continue;
      for (const node of m.addedNodes) {
        try {
          if (node.nodeType !== 1) continue;
          if (node.id === 'changePwdModal' || (node.querySelector && node.querySelector('#changePwdForm'))) {
            setTimeout(wireModalEventsOnce, 40);
            return;
          }
        } catch (err) { /* ignore */ }
      }
    }
  });
  modalObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });

  /* Dev helpers */
  window.__changePwdHelpers = {
    showToast,
    validatePasswords: validatePasswordsFromDOM,
    openForTest: () => {
      if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
        try { window.ModalManager.openModal('changePwdModal'); }
        catch (err) { console.warn('[changePWD] ModalManager open failed', err); }
      } else {
        const m = $('changePwdModal'); if (m) m.style.display = '';
      }
      setTimeout(wireModalEventsOnce, 60);
    }
  };

  console.log('[changePWD] Module ready. Helpers: window.__changePWDControl, window.__changePwdHelpers');
})();








/* reset-password.js — Reset Password OTP flow (rp- prefix)
   - OTP resend + countdown
   - OTP verify
   - Open email app helper
   - Uses endpoints: /auth/resend-otp and /auth/verify-otp (prefixable via __SEC_API_BASE)
   - Exposes debug helpers at window.__rp_pwd_debug
   - Works with ModalManager (openModal / closeModal / closeAll)
*/

(function rpResetPasswordModule(){
  'use strict';

  // ---- config ----
  const DEBUG = true;
  const tag = '[RP-PWD]';
  const log = (...a) => { if (DEBUG) console.log(tag, ...a); };
  const dbg = (...a) => { if (DEBUG) console.debug(tag, ...a); };
  const warn = (...a) => { if (DEBUG) console.warn(tag, ...a); };
  const err = (...a) => { if (DEBUG) console.error(tag, ...a); };

  // guard against multiple installs
  if (window.__rp_pwd_installed) {
    log('already installed');
    return;
  }
  window.__rp_pwd_installed = true;

  // IDs & selectors (rp- prefix)
  const RESET_MODAL_ID = 'rpResetModal';
  const MASKED_EMAIL_ID = 'rp-masked-email';
  const OTP_INPUT_SELECTOR = '.rp-otp-input';
  const RESEND_BTN_ID = 'rp-resend-btn';
  const OPEN_EMAIL_BTN_ID = 'rp-open-email-btn';
  const VERIFY_BTN_ID = 'rp-reset-btn';
  const OTP_FORM_ID = 'rp-otp-form';
  const TRIGGER_ID = 'rpTriggerResetPassword'; // optional trigger id in your page (not required)

  const API_BASE = (window.__SEC_API_BASE || '').replace(/\/$/, '') || '';
  const SERVER_RESEND_OTP = API_BASE ? `${API_BASE}/auth/resend-otp` : '/auth/resend-otp';
  const SERVER_VERIFY_OTP = API_BASE ? `${API_BASE}/auth/verify-otp` : '/auth/verify-otp';

  const $ = id => document.getElementById(id);
  const qsa = sel => Array.from(document.querySelectorAll(sel));

  // ---- Notification helper (prefers app notify) ----
  function notify({ type = 'info', title = '', message = '', duration = 4500 } = {}) {
    dbg('notify:', { type, title, message, duration });
    try {
      if (typeof window.notify === 'function') { window.notify(type, message, { title, timeout: duration }); return; }
      if (typeof window.appNotify === 'function') { window.appNotify({ type, title, message, duration }); return; }
      if (window.toastr && typeof window.toastr[type] === 'function') { window.toastr[type](message, title); return; }
      if (window.Toastify && typeof window.Toastify === 'function') { window.Toastify({ text: (title ? title + ' – ' : '') + message, duration }).showToast(); return; }
    } catch (e) { dbg('app-notify failed', e); }

    // inline fallback
    try {
      let container = document.getElementById('__rp_pwd_toast');
      if (!container) {
        container = document.createElement('div');
        container.id = '__rp_pwd_toast';
        container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
        document.body.appendChild(container);
      }
      const toast = document.createElement('div');
      toast.style.cssText = 'pointer-events:auto;min-width:220px;max-width:380px;padding:10px 14px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,0.12);font-family:system-ui,Segoe UI,Roboto,Arial;color:#fff;opacity:0;transform:translateY(-6px);transition:opacity .22s ease,transform .22s ease;';
      const bg = type === 'error' ? '#e53935' : type === 'warn' ? '#ffb300' : type === 'success' ? '#2e7d32' : '#1976d2';
      toast.style.background = bg;
      if (title) {
        const t = document.createElement('div'); t.style.fontWeight = '600'; t.style.marginBottom = '4px'; t.textContent = title; toast.appendChild(t);
      }
      const p = document.createElement('div'); p.style.fontSize = '13px'; p.textContent = message || ''; toast.appendChild(p);
      container.appendChild(toast);
      requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });
      setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-6px)'; setTimeout(()=>toast.remove(),220); }, duration);
    } catch (e) {
      dbg('notify fallback error', e);
      console.log(tag, title, message);
    }
  }

  // ---- email resolution helpers ----
  function getDevEmailFallback() {
    return localStorage.getItem('mockEmail') || localStorage.getItem('__mock_email') || localStorage.getItem('dev_email') || null;
  }

  async function getUserEmail() {
    dbg('getUserEmail: resolving');
    // try known session getters non-exceptionally
    const candidates = [ window.getSession, (window.dashboard && window.dashboard.getSession), window.getSessionFromDashboard ];
    for (const fn of candidates) {
      if (typeof fn === 'function') {
        try {
          const session = await fn();
          if (session && session.email) return session.email;
          if (session && session.user && session.user.email) return session.user.email;
          if (session && session.data && session.data.user && session.data.user.email) return session.data.user.email;
        } catch (e) { dbg('session provider threw', e); }
      }
    }
    if (window.__SERVER_USER_DATA__ && window.__SERVER_USER_DATA__.email) return window.__SERVER_USER_DATA__.email;
    const fb = getDevEmailFallback(); if (fb) return fb;
    return '';
  }

  // ---- network helpers ----
  async function postJson(url, payload = {}, opts = {}) {
    dbg('[postJson] request', url, payload);
    try {
      const res = await fetch(url, {
        method: opts.method || 'POST',
        credentials: opts.credentials ?? 'include',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      const status = res.status;
      let text = '';
      try { text = await res.text(); } catch(e){ text = ''; }
      dbg('[postJson] response', { status, text });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('application/json')) {
        try { return { status, body: JSON.parse(text), headers: res.headers }; } catch(e) { return { status, body: text, headers: res.headers }; }
      }
      return { status, body: text, headers: res.headers };
    } catch (e) {
      err('[postJson] network error', e);
      return { status: 0, body: { error: e.message || String(e) }, headers: {} };
    }
  }

  // ---- OTP helpers ----
  function getOtpValue() {
    const inputs = qsa(OTP_INPUT_SELECTOR);
    if (!inputs || inputs.length === 0) return '';
    if (inputs.length === 1) return inputs[0].value.trim();
    return inputs.map(i => i.value.trim()).join('');
  }
  function clearOtpInputs(){ qsa(OTP_INPUT_SELECTOR).forEach(i => i.value = ''); }
  function blurOtpInputs(){ qsa(OTP_INPUT_SELECTOR).forEach(i => { try { i.blur(); } catch(e){} }); }

  // ---- resend countdown ----
  let resendTimer = null;
function startResendCountdown(durationSec = 60) {
  const btn = $(RESEND_BTN_ID);
  if (!btn) { warn('startResendCountdown: no button'); return; }

  clearInterval(resendTimer);
  let remaining = Math.max(0, parseInt(durationSec, 10) || 60);

  // Store original text (strip any leftover "(..s)" if present)
  if (!btn.dataset._origText) {
    btn.dataset._origText = (btn.textContent || '').replace(/\s*\(\d+s\)\s*$/, '').trim() || 'Resend OTP';
  }

  btn.disabled = true;
  btn.setAttribute('aria-disabled', 'true');
  btn.textContent = `${btn.dataset._origText} (${remaining}s)`;

  resendTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(resendTimer);
      resendTimer = null;
      btn.disabled = false;
      btn.removeAttribute('aria-disabled');
      // restore original text without the countdown
      btn.textContent = btn.dataset._origText;
    } else {
      btn.textContent = `${btn.dataset._origText} (${remaining}s)`;
    }
  }, 1000);
}


  // ---- open email client helper ----
  function openEmailClient(email) {
    if (!email) { notify({ type:'warn', title:'No email', message:'No email known for this account.' }); return; }
    const domain = (email.split('@')[1] || '').toLowerCase();
    try {
      if (domain === 'gmail.com' || domain.endsWith('googlemail.com')) { window.open('https://mail.google.com/mail/u/0/#inbox', '_blank'); return; }
      if (domain.endsWith('yahoo.com')) { window.open('https://mail.yahoo.com/d/folders/1', '_blank'); return; }
      if (domain.endsWith('outlook.com') || domain.endsWith('hotmail.com') || domain.endsWith('live.com')) { window.open('https://outlook.live.com/mail/inbox', '_blank'); return; }
      if (domain.endsWith('icloud.com') || domain.endsWith('me.com')) { window.open('https://www.icloud.com/mail', '_blank'); return; }
      window.open(`mailto:${encodeURIComponent(email)}`, '_blank');
    } catch (e) {
      dbg('openEmailClient fallback', e);
      try { window.location.href = `mailto:${encodeURIComponent(email)}`; } catch(e2){ dbg('final fallback failed', e2); }
    }
  }

  // ---- verify OTP submit ----
  async function verifyOtpSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  log('verifyOtpSubmit start');

  const email = await getUserEmail();
  if (!email) {
    notify({ type:'error', title:'Email missing', message:'No email detected. Please login or set mockEmail in localStorage for dev.' });
    return;
  }

  const token = getOtpValue();
  if (!token || token.length < 6) {
    notify({ type:'warn', title:'Invalid OTP', message:'Please enter the 6-digit OTP.' });
    return;
  }

  const verifyBtn = $(VERIFY_BTN_ID);
  if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.dataset._origText = verifyBtn.textContent; verifyBtn.textContent = 'Verifying…'; }

  try {
const { status, body } = await withLoader(() =>
        postJson(SERVER_VERIFY_OTP, { email, token })
      );
    dbg('verifyOtpSubmit server', status, body);

    if (status >= 200 && status < 300) {
      notify({ type:'info', title:'OTP Verified', message:'OTP verified. Proceed to set your password.' });

      // clear inputs (best-effort)
      clearOtpInputs();

      // === Defensive modal handling: close reset modal and other possible modals first ===
      try {
        if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') {
          try { window.ModalManager.closeModal(RESET_MODAL_ID); } catch(e){ dbg('close reset via ModalManager failed', e); }
          try { window.ModalManager.closeModal('pinModal'); } catch(_) {}
          try { window.ModalManager.closeModal('changePwdModal'); } catch(_) {}
        } else {
          const r = document.getElementById(RESET_MODAL_ID);
          if (r) { r.setAttribute('aria-hidden','true'); r.style.display = 'none'; }
          ['pinModal','changePwdModal'].forEach(id => {
            const m = document.getElementById(id);
            if (m) { m.setAttribute('aria-hidden','true'); m.style.display = 'none'; }
          });
        }
      } catch (closeErr) { dbg('modal close defensive errs', closeErr); }

      // === Open the Set Password modal (spwModal) ===
      let opened = false;

      // 1) ModalManager.openModal if present
      try {
        if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
          try {
            window.ModalManager.openModal('spwModal');
            opened = true;
          } catch (e) { dbg('ModalManager.openModal spwModal failed', e); }
        }
      } catch (e) { dbg('ModalManager check failed', e); }

      // 2) __spw_helpers.open() if available
      if (!opened && window.__spw_helpers && typeof window.__spw_helpers.open === 'function') {
        try {
          window.__spw_helpers.open();
          opened = true;
        } catch (e) { dbg('window.__spw_helpers.open() failed', e); }
      }

      // 3) DOM fallback
      if (!opened) {
        try {
          const spw = document.getElementById('spwModal');
          if (spw) {
            spw.setAttribute('aria-hidden','false');
            spw.style.display = 'flex';
            opened = true;
          }
        } catch (e) { dbg('DOM fallback open spwModal failed', e); }
      }

      // if opened, focus first input and wire things (best-effort)
      if (opened) {
        setTimeout(() => {
          try {
            const first = document.getElementById('spw-newPwd') || document.getElementById('spw-new-password');
            if (first && typeof first.focus === 'function') first.focus();
            // wire spw helpers if present (they normally auto-wire, but call defensively)
            if (window.__spw_helpers && typeof window.__spw_helpers.open === 'function') {
              try { /* already called */ } catch (e) { dbg('spw_helpers.open call ignored', e); }
            }
          } catch (e) { dbg('focus spw input failed', e); }
        }, 60);
      } else {
        dbg('failed to open spwModal by any method');
      }

    } else {
      const errMsg = (body && (body.error?.message || body.message)) || 'OTP verification failed';
      if (status === 400 || status === 403) {
        const errCode = body?.error?.code || null;
        if (errCode === 'otp_expired' || (errMsg && String(errMsg).toLowerCase().includes('expired'))) {
          notify({ type:'warn', title:'OTP expired', message:'OTP expired. Please resend OTP and try again.' });
        } else {
          notify({ type:'error', title:'Verification failed', message: errMsg });
        }
      } else {
        notify({ type:'error', title:'Verification failed', message: errMsg });
      }
    }
  } catch (e) {
    err('verifyOtpSubmit error', e);
    notify({ type:'error', title:'Network error', message:'Network error verifying OTP – check console.' });
  } finally {
    if (verifyBtn) {
      verifyBtn.disabled = false;
      if (verifyBtn.dataset._origText) { verifyBtn.textContent = verifyBtn.dataset._origText; delete verifyBtn.dataset._origText; }
    }
    log('verifyOtpSubmit end');
  }
}


  // ---- resend handler ----
  async function resendOtpHandler(e) {
    if (e && e.preventDefault) e.preventDefault();
    log('resendOtpHandler start');
    const btn = $(RESEND_BTN_ID);
    if (!btn) return;
    if (btn.disabled) { dbg('resend disabled'); return; }
    const email = await getUserEmail();
    if (!email) { notify({ type:'warn', title:'Email missing', message:'Unable to find your account email. For dev: localStorage.setItem(\"mockEmail\",\"dev@example.com\")' }); return; }
    btn.disabled = true;
    const origText = btn.dataset._origText || btn.textContent;
    btn.textContent = 'Sending…';
    try {
const { status, body } = await withLoader(() =>
        postJson(SERVER_RESEND_OTP, { email })
      );      
      dbg('resend response', status, body);
      if (status >= 200 && status < 300) {
        notify({ type:'info', title:'OTP sent', message:`OTP sent to ${email}` });
        btn.dataset._origText = origText;
        startResendCountdown(60);
      } else {
        const errMsg = body?.error?.message || body?.message || 'Failed to resend OTP';
        notify({ type:'error', title:'Resend failed', message: errMsg });
        btn.disabled = false; btn.textContent = origText;
      }
    } catch (e) {
      err('resendOtpHandler error', e);
      notify({ type:'error', title:'Network error', message:'Network error sending OTP – check console.' });
      btn.disabled = false; btn.textContent = origText;
    } finally { log('resendOtpHandler end'); }
  }

  // ---- OTP input wiring (supports single or multi inputs) ----
  window.__rp_pwd_handlers = window.__rp_pwd_handlers || {};
  function wireOtpInputs() {
    const inputs = qsa(OTP_INPUT_SELECTOR);
    dbg('wireOtpInputs count', inputs.length);
    // cleanup old handlers
    if (Array.isArray(window.__rp_pwd_handlers.otpInputs)) {
      window.__rp_pwd_handlers.otpInputs.forEach(({ el, handlers }) => {
        if (!el || !handlers) return;
        if (handlers.input) el.removeEventListener('input', handlers.input);
        if (handlers.keydown) el.removeEventListener('keydown', handlers.keydown);
      });
    }
    window.__rp_pwd_handlers.otpInputs = [];

    if (inputs.length === 0) { warn('no otp inputs'); return; }

    if (inputs.length === 1) {
      const input = inputs[0];
      input.setAttribute('inputmode','numeric');
      input.setAttribute('maxlength','6');
      const onInput = () => {
        const v = input.value.trim();
        dbg('single input value length', v.length);
        if (v.length >= 6) { try { input.blur(); } catch(_){}; setTimeout(() => verifyOtpSubmit(), 120); }
      };
      input.addEventListener('input', onInput);
      window.__rp_pwd_handlers.otpInputs.push({ el: input, handlers: { input: onInput } });
      dbg('wired single input auto-submit');
      return;
    }

    inputs.forEach((inp, idx) => {
      inp.setAttribute('inputmode','numeric');
      inp.setAttribute('maxlength','1');
      const onInput = () => {
        const v = inp.value;
        if (v && idx < inputs.length - 1) { try { inputs[idx+1].focus(); } catch(e){ dbg('focus next failed', e); } }
        const all = inputs.map(i => i.value.trim()).join('');
        dbg('multi inputs', all);
        if (all.length === inputs.length) { blurOtpInputs(); setTimeout(() => verifyOtpSubmit(), 120); }
      };
      const onKeydown = (e) => {
        if (e.key === 'Backspace' && !inp.value && idx > 0) { try { inputs[idx-1].focus(); } catch(e){ dbg('focus prev failed', e); } }
      };
      inp.addEventListener('input', onInput);
      inp.addEventListener('keydown', onKeydown);
      window.__rp_pwd_handlers.otpInputs.push({ el: inp, handlers: { input: onInput, keydown: onKeydown } });
    });
    dbg('wired multi inputs');
  }

  // ---- UI wiring ----
  async function wire() {
    log('wire: start');
    // optional trigger
    const trigger = $(TRIGGER_ID);
    if (trigger) {
      window.__rp_pwd_handlers.onTrigger = window.__rp_pwd_handlers.onTrigger || onTriggerClicked;
      trigger.removeEventListener('click', window.__rp_pwd_handlers.onTrigger);
      trigger.addEventListener('click', window.__rp_pwd_handlers.onTrigger);
    }

    const resendBtn = $(RESEND_BTN_ID);
    if (resendBtn) {
      window.__rp_pwd_handlers.resend = window.__rp_pwd_handlers.resend || resendOtpHandler;
      resendBtn.removeEventListener('click', window.__rp_pwd_handlers.resend);
      resendBtn.addEventListener('click', window.__rp_pwd_handlers.resend);
    }

    const openEmailBtn = $(OPEN_EMAIL_BTN_ID);
    if (openEmailBtn) {
      window.__rp_pwd_handlers.openEmail = window.__rp_pwd_handlers.openEmail || (async (e)=>{ e && e.preventDefault(); const em = await getUserEmail(); openEmailClient(em); });
      openEmailBtn.removeEventListener('click', window.__rp_pwd_handlers.openEmail);
      openEmailBtn.addEventListener('click', window.__rp_pwd_handlers.openEmail);
    }

    const otpForm = $(OTP_FORM_ID);
    const verifyBtn = $(VERIFY_BTN_ID);
    if (otpForm) {
      window.__rp_pwd_handlers.verifySubmit = window.__rp_pwd_handlers.verifySubmit || verifyOtpSubmit;
      otpForm.removeEventListener('submit', window.__rp_pwd_handlers.verifySubmit);
      otpForm.addEventListener('submit', window.__rp_pwd_handlers.verifySubmit);
    } else if (verifyBtn) {
      window.__rp_pwd_handlers.verifySubmit = window.__rp_pwd_handlers.verifySubmit || verifyOtpSubmit;
      verifyBtn.removeEventListener('click', window.__rp_pwd_handlers.verifySubmit);
      verifyBtn.addEventListener('click', window.__rp_pwd_handlers.verifySubmit);
    }

    wireOtpInputs();

    // show email in modal masks
    const maskedEl = $(MASKED_EMAIL_ID);
    const email = await getUserEmail();
    dbg('wire: email', email);
    if (maskedEl && email) maskedEl.textContent = email;

    log('wire: done');
  }

  // optional: trigger flow to resend OTP then open modal (similar to your resetPin flow)
  async function onTriggerClicked(e) {
    e && e.preventDefault && e.preventDefault();
    log('onTriggerClicked');
    const btn = e && e.currentTarget ? e.currentTarget : $(TRIGGER_ID);
    if (!btn) { warn('no trigger'); return; }
    if (btn.disabled) { dbg('trigger disabled'); return; }
    btn.disabled = true; btn.dataset._origText = btn.dataset._origText || btn.textContent || ''; btn.textContent = 'Preparing…';
    const email = await getUserEmail();
    if (!email) { notify({ type:'warn', title:'Email missing', message:'Unable to find your account email.' }); btn.disabled = false; if (btn.dataset._origText) { btn.textContent = btn.dataset._origText; delete btn.dataset._origText; } return; }
    try {
const { status, body } = await withLoader(() =>
  postJson(SERVER_RESEND_OTP, { email })
);      dbg('onTrigger resend', status, body);
      if (status >=200 && status < 300) {
        // open modal
        let opened = false;
        if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
          try { window.ModalManager.openModal(RESET_MODAL_ID); opened = true; } catch(e){ dbg('ModalManager.openModal failed', e); }
        }
        if (!opened) {
          const el = $(RESET_MODAL_ID);
          if (el) { el.setAttribute('aria-hidden','false'); el.style.display = 'flex'; opened = true; }
        }
        if (opened) { setTimeout(() => { wireOtpInputs(); }, 40); }
        startResendCountdown(60);
        notify({ type:'info', title:'OTP sent', message:`OTP sent to ${email}` });
      } else {
        const errMsg = body?.error?.message || body?.message || 'Failed to send OTP';
        notify({ type:'error', title:'Resend failed', message: errMsg });
      }
    } catch (e) {
      err('onTriggerClicked error', e);
      notify({ type:'error', title:'Network error', message:'Failed to send OTP – check console.' });
    } finally {
      btn.disabled = false; if (btn.dataset._origText) { btn.textContent = btn.dataset._origText; delete btn.dataset._origText; }
    }
  }

  // ---- auto-wire on DOM ready, and also observe insertions ----
  function initAutoWire() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wire);
    } else wire();
  }
  initAutoWire();

  // also attempt to wire if modal inserted later
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (!m.addedNodes || !m.addedNodes.length) continue;
      for (const n of m.addedNodes) {
        try {
          if (n.nodeType !== 1) continue;
          if (n.id === RESET_MODAL_ID || (n.querySelector && n.querySelector(OTP_INPUT_SELECTOR))) {
            setTimeout(() => { try { wire(); } catch(e){ dbg('wire after insert failed', e); } }, 40);
            return;
          }
        } catch (e) {}
      }
    }
  });
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });

  // expose debug helpers
  window.__rp_pwd_debug = Object.assign(window.__rp_pwd_debug || {}, {
    getUserEmail, openEmailClient, postJson, SERVER_RESEND_OTP, SERVER_VERIFY_OTP,
    wire, verifyOtpSubmit, resendOtpHandler, startResendCountdown, notify
  });

  log('rp reset-password module ready');
})();


/* set-password.js
   Wires the Set Password modal (spw- prefix).
   - Requires your spw HTML (ids/classes used in the HTML you already inserted).
   - Uses showToast() if present, otherwise falls back to rp notify().
*/
(function spwModule(){
  'use strict';
  if (window.__spw_installed) return;
  window.__spw_installed = true;

  const API_BASE = (window.__SEC_API_BASE || '').replace(/\/$/, '') || (typeof API_BASE !== 'undefined' ? API_BASE : '');
    // use same endpoints as login.html
  const SET_ENDPOINT = API_BASE ? `${API_BASE}/auth/set-password` : '/auth/set-password';
  const CHANGE_ENDPOINT = API_BASE ? `${API_BASE}/auth/change-password` : '/auth/change-password';


  const $ = id => document.getElementById(id);
  const qsa = s => Array.from(document.querySelectorAll(s));

  // Prefer your existing showToast, otherwise fallback to notify from rpResetPasswordModule
  function toast(msg, type = 'info', ttl = 3500) {
    if (typeof showToast === 'function') return showToast(msg, type, ttl);
    if (window.__rp_pwd_debug && typeof window.__rp_pwd_debug.notify === 'function') {
      const t = type === 'error' ? 'error' : type === 'success' ? 'success' : (type === 'warn' ? 'warn' : 'info');
      try { window.__rp_pwd_debug.notify({ type: t, message: msg, title: '' , duration: ttl}); return; } catch(e) { /* ignore */ }
    }
    // minimal fallback
    try { alert((type.toUpperCase()? type + ': ' : '') + msg); } catch(e){ console.log(type, msg); }
  }

  // small fetch-with-timeout helper (safe fallback if not defined)
  async function fetchWithTimeoutLocal(url, opts = {}, ms = 10000) {
    const c = new AbortController();
    const id = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(url, Object.assign({}, opts, { signal: c.signal }));
      clearTimeout(id);
      return r;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  // DOM references
  const MODAL_ID = 'spwModal';
  const FORM_ID = 'spwForm';
  const NEW_ID = 'spw-newPwd';
  const CONFIRM_ID = 'spw-confirmPwd';
  const CREATE_BTN_ID = 'spwCreateBtn';
  const CLOSE_BTN_SELECTOR = '.spw-close-btn';
  const PWD_TOGGLE_SELECTOR = '.spw-pwd-toggle';

  // helper to safely open/close modals (tries ModalManager if available)
  function safeOpenModal(id) {
    try {
      if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
        return window.ModalManager.openModal(id);
      }
    } catch (e) { console.warn('[spw] ModalManager.openModal failed', e); }
    const el = $(id);
    if (el) { el.setAttribute('aria-hidden','false'); el.style.display = 'flex'; }
  }
  function safeCloseModal(id) {
    try {
      if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') {
        return window.ModalManager.closeModal(id);
      }
    } catch (e) { console.warn('[spw] ModalManager.closeModal failed', e); }
    const el = $(id);
    if (el) { el.setAttribute('aria-hidden','true'); el.style.display = 'none'; }
  }
  function safeCloseAll() {
    try {
      if (window.ModalManager && typeof window.ModalManager.closeAll === 'function') {
        return window.ModalManager.closeAll();
      }
    } catch (e) { /* ignore */ }
  }

  // toggle eyes
  function wireEyeToggles() {
    qsa(PWD_TOGGLE_SELECTOR).forEach(btn => {
      if (btn.__wired) return;
      const target = btn.getAttribute('data-target');
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const input = document.getElementById(target);
        if (!input) return;
        const isPwd = input.type === 'password';
        input.type = isPwd ? 'text' : 'password';
        const openSvg = btn.querySelector('.eye-open');
        const closedSvg = btn.querySelector('.eye-closed');
        if (openSvg && closedSvg) {
          if (isPwd) { openSvg.style.display = 'none'; closedSvg.style.display = 'inline'; }
          else { openSvg.style.display = 'inline'; closedSvg.style.display = 'none'; }
        }
      }, { passive: false });
      btn.__wired = true;
    });
  }

  // blur inputs to close soft keyboard
  function blurInputs() {
    try {
      [NEW_ID, CONFIRM_ID].forEach(id => {
        const el = document.getElementById(id);
        if (el && typeof el.blur === 'function') el.blur();
      });
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
        try { document.activeElement.blur(); } catch(_) {}
      }
    } catch (e) { /* ignore */ }
  }

  // validation
  function validateSetPassword(newPwd, confirmPwd) {
    if (!newPwd || !confirmPwd) return { ok:false, reason: 'All fields are required.' };
    if (newPwd.length < 8) return { ok:false, reason: 'Password must be at least 8 characters.' };
    if (newPwd !== confirmPwd) return { ok:false, reason: 'Passwords do not match.' };
    return { ok:true };
  }

  // attempt to POST to set endpoint, fallback to change endpoint on 404
  async function postPassword(newPwd) {
    const payload = { newPassword: newPwd };
    const timeout = 12000;
    try {
      // try set-password first
      let resp = await fetchWithTimeoutLocal(SET_ENDPOINT, {
        method: 'POST', credentials: 'include',
        headers: {'Content-Type':'application/json','Accept':'application/json'},
        body: JSON.stringify(payload)
      }, timeout);

      if (resp.status === 404) {
        // fallback to change-password
        resp = await fetchWithTimeoutLocal(CHANGE_ENDPOINT, {
          method: 'POST', credentials: 'include',
          headers: {'Content-Type':'application/json','Accept':'application/json'},
          body: JSON.stringify({ currentPassword: '', newPassword: newPwd }) // some servers require current; expected to error but we'll try
        }, timeout);
      }

      // parse response sensibly
      let body = null;
      try {
        const ct = resp.headers && resp.headers.get ? (resp.headers.get('content-type') || '') : '';
        if (ct.toLowerCase().includes('application/json')) body = await resp.json();
        else body = await resp.text();
      } catch (e) { body = null; }

      return { ok: resp.ok, status: resp.status, body };
    } catch (err) {
      return { ok:false, status: 0, error: err };
    }
  }

  // handle form submit
  async function onSpwSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    const btn = $(CREATE_BTN_ID);
    const newPwd = $(NEW_ID)?.value || '';
    const confirmPwd = $(CONFIRM_ID)?.value || '';

    const v = validateSetPassword(newPwd, confirmPwd);
    if (!v.ok) { toast(v.reason, 'error', 4500); try { if (v.reason.toLowerCase().includes('match')) $(CONFIRM_ID).focus(); else $(NEW_ID).focus(); } catch(e){}; return; }

    // blur to close keyboard
    blurInputs();

    // disable UI
    if (btn) { btn.disabled = true; btn.dataset._orig = btn.textContent; btn.textContent = 'Creating…'; }

    toast('Creating password…', 'info', 2500);

    const res = await postPassword(newPwd);

    if (!res.ok) {
      const body = res.body;
      const msg = (body && (body.message || body.error || body.msg)) || (res.status ? `Server error (${res.status})` : 'Network error');
      toast(msg, 'error', 6000);
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset._orig || 'Create password'; }
      return;
    }

    // success
    const successMsg = (res.body && (res.body.message || res.body.msg || res.body.status)) || 'Password created successfully.';
    toast(successMsg, 'success', 3500);

    // clear form and close modal
    try {
      const form = $(FORM_ID); if (form) form.reset();
    } catch(e){/*ignore*/}

    // close reset modal if open to avoid duplicates (defensive)
    try { safeCloseModal('rpResetModal'); } catch(e){}

    // close this modal
    try { safeCloseModal(MODAL_ID); } catch(e){}

    // cleanup UI
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset._orig || 'Create password'; delete btn.dataset._orig; }

    // optional: call a global hook if app needs it (e.g. refresh session)
    try { if (typeof window.onPasswordSet === 'function') window.onPasswordSet(newPwd); } catch(e){/*ignore*/}
  }

  // wire close button to close modal
  function wireCloseButtons() {
    qsa(CLOSE_BTN_SELECTOR).forEach(b => {
      if (b.__spwCloseWired) return;
      b.addEventListener('click', (ev) => {
        ev && ev.preventDefault && ev.preventDefault();
        safeCloseModal(MODAL_ID);
      });
      b.__spwCloseWired = true;
    });
  }

  // wire create button + form
  function wireForm() {
    const form = $(FORM_ID);
    const btn = $(CREATE_BTN_ID);
    if (form && !form.__spwFormWired) {
      form.addEventListener('submit', onSpwSubmit);
      form.__spwFormWired = true;
    }
    if (btn && !btn.__spwBtnWired) {
      // clicking the button will submit the form thanks to form="spwForm" attribute in your HTML
      btn.addEventListener('click', (e) => { /* let form handler run */ }, { passive: true });
      btn.__spwBtnWired = true;
    }
  }

  // expose helper to open modal programmatically (closes other modals to avoid duplicates)
  function openSpwModal() {
    // close potential modals that might open automatically (defensive)
    try { safeCloseModal('changePwdModal'); } catch (e) {}
    try { safeCloseModal('rpResetModal'); } catch (e) {}
    safeOpenModal(MODAL_ID);
    setTimeout(() => {
      // focus first input
      try { const el = $(NEW_ID); if (el) { el.focus(); } } catch(e){}
    }, 60);
    // wire eye toggles and form (in case modal was injected after)
    wireEyeToggles();
    wireCloseButtons();
    wireForm();
  }

  // auto-wire on DOM ready or if modal inserted later
  function initAutoWire() {
    // wire anything already present
    wireEyeToggles();
    wireCloseButtons();
    wireForm();

    // observe for modal insertion so we can wire later
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (!m.addedNodes || !m.addedNodes.length) continue;
        for (const n of m.addedNodes) {
          try {
            if (n.nodeType !== 1) continue;
            if (n.id === MODAL_ID || (n.querySelector && (n.querySelector(`#${FORM_ID}`) || n.querySelector(PWD_TOGGLE_SELECTOR)))) {
              setTimeout(() => { wireEyeToggles(); wireCloseButtons(); wireForm(); }, 40);
              return;
            }
          } catch (e) {}
        }
      }
    });
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  // expose debug helpers
  window.__spw_helpers = {
    open: openSpwModal,
    close: () => safeCloseModal(MODAL_ID),
    validate: validateSetPassword,
    postPassword,
    SET_ENDPOINT, CHANGE_ENDPOINT
  };

  // kick off
  initAutoWire();
  console.log('[spw] set-password module ready. Helpers: window.__spw_helpers');
})();
