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
    btn.disabled = true;
    btn.setAttribute('aria-disabled','true');
    
    // Store original text if not already stored
    if (!btn.dataset._origText) {
      btn.dataset._origText = btn.textContent || 'Resend OTP';
    }
    
    btn.textContent = `Resend (${remaining}s)`;
    
    resendTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(resendTimer);
        resendTimer = null;
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
        // FIXED: Show clean "Resend OTP" text without seconds
        btn.textContent = btn.dataset._origText || 'Resend OTP';
        log('startResendCountdown: finished - button now shows:', btn.textContent);
      } else {
        btn.textContent = `Resend (${remaining}s)`;
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
      const { status, body } = await postJson(SERVER_VERIFY_OTP, { email, token });
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
      const { status, body } = await postJson(SERVER_RESEND_OTP, { email });
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
      const { status, body } = await postJson(SERVER_RESEND_OTP, { email });
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

  // submit
  let isSubmitting = false;
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

      const text = await resp.text();
      let json;
      try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { raw: text }; }

      if (!resp.ok) {
        const msg = (json && (json.message || json.error)) ? (json.message || json.error) : `Server error (${resp.status})`;
        showToast(msg, 'error', 5000);
        console.error('[changePWD] change failed', resp.status, json);
        isSubmitting = false;
        return;
      }

      showToast((json && json.message) ? json.message : 'Password changed successfully.', 'success', 3500);
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
      if (err.name === 'AbortError') showToast('Request timed out. Try again.', 'error', 4500);
      else showToast('Failed to change password. Check connection.', 'error', 4500);
      isSubmitting = false;
    }
  }

  // reset handler (forgot password)
  function handleResetPassword(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    showToast('Reset password flow started. Check your email/phone.', 'info', 4000);
    // Call your reset endpoint or open reset modal here
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
  let autoSubmitTimer = null;
  function scheduleAutoSubmitIfNeeded() {
    // cancel previous
    if (autoSubmitTimer) clearTimeout(autoSubmitTimer);
    autoSubmitTimer = setTimeout(() => {
      const newV = $('newPwd')?.value || '';
      const confV = $('confirmPwd')?.value || '';
      const curV = $('currentPwd')?.value || '';

      if (!newV || !confV || !curV) return;

      // condition A: exact match
      if (newV === confV) {
        // validation will pass for new vs confirm but will still check current != new on submit
        submitChangePassword();
        return;
      }

      // condition B: same length (user requested)
      if (newV.length === confV.length) {
        // attempt submit (validation will fail if they are different)
        submitChangePassword();
        return;
      }
    }, 220); // 220ms debounce
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
    btn.disabled = true; btn.setAttribute('aria-disabled','true');
    if (!btn.dataset._origText) btn.dataset._origText = btn.textContent || 'Resend OTP';
    btn.textContent = `Resend (${remaining}s)`;
    resendTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(resendTimer); resendTimer = null;
        btn.disabled = false; btn.removeAttribute('aria-disabled');
        btn.textContent = btn.dataset._origText || 'Resend OTP';
      } else {
        btn.textContent = `Resend (${remaining}s)`;
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
    if (!email) { notify({ type:'error', title:'Email missing', message:'No email detected. Please login or set mockEmail in localStorage for dev.' }); return; }
    const token = getOtpValue();
    if (!token || token.length < 6) { notify({ type:'warn', title:'Invalid OTP', message:'Please enter the 6-digit OTP.' }); return; }

    const verifyBtn = $(VERIFY_BTN_ID);
    if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.dataset._origText = verifyBtn.textContent; verifyBtn.textContent = 'Verifying…'; }

    try {
      const { status, body } = await postJson(SERVER_VERIFY_OTP, { email, token });
      dbg('verifyOtpSubmit server', status, body);
      if (status >= 200 && status < 300) {
        notify({ type:'info', title:'OTP Verified', message:'OTP verified. Proceed to change your password.' });

        // close reset modal
        try {
          if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
            // optionally open change-password modal if you have it (common flow)
            if (typeof window.ModalManager.openModal === 'function') {
              try { window.ModalManager.openModal('changePwdModal'); } catch(e){ dbg('open changePwdModal failed', e); }
            }
            // close this modal
            try { window.ModalManager.closeModal(RESET_MODAL_ID); } catch(e){ dbg('close reset modal via ModalManager failed', e); }
          } else {
            const r = $(RESET_MODAL_ID); if (r) { r.setAttribute('aria-hidden','true'); r.style.display='none'; }
          }
        } catch(e){ dbg('modal open/close flow failed', e); }

        clearOtpInputs();
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
      const { status, body } = await postJson(SERVER_RESEND_OTP, { email });
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
      const { status, body } = await postJson(SERVER_RESEND_OTP, { email });
      dbg('onTrigger resend', status, body);
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
