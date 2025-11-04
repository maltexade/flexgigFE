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