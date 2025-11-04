/* resetPin.diagnostic.js
   Diagnostic / verbose logging version for trouble-shooting:
   - on-page debug panel + console logs
   - fetch & getSession wrappers to log network activity
   - MutationObserver for profile fields
   - modal event hooks and extensive flow logs
   Paste/replace into your app (keep a backup).
*/
(function rpWireResetFlow_diagnostic(){
  'use strict';

  const PREFIX = '[RP-DIAG]';
  const TIMESTAMP = () => new Date().toISOString();
  const DEBUG = true;

  // console + on-page logger
  function consoleLog(...args) {
    if (DEBUG) console.debug(PREFIX, ...args);
    try { appendPanelLog(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')); } catch(e){ /* ignore */ }
  }

  // create an on-page debug panel (if not present)
  let panel = null;
  function createDebugPanel() {
    if (panel) return panel;
    try {
      panel = document.createElement('div');
      panel.id = '__rp_diag_panel';
      Object.assign(panel.style, {
        position: 'fixed',
        right: '12px',
        bottom: '12px',
        width: '360px',
        maxHeight: '38vh',
        overflow: 'auto',
        zIndex: '99999',
        background: 'rgba(12,12,14,0.92)',
        color: '#e6eef6',
        fontSize: '12px',
        fontFamily: 'monospace',
        borderRadius: '8px',
        padding: '8px',
        boxShadow: '0 8px 28px rgba(0,0,0,0.5)'
      });
      const title = document.createElement('div');
      title.textContent = 'RP DEBUG';
      Object.assign(title.style, { fontWeight: '700', fontSize: '13px', marginBottom: '6px', color: '#ffd966' });
      panel.appendChild(title);
      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'Clear';
      Object.assign(clearBtn.style, { position: 'absolute', right: '8px', top: '6px', background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer' });
      clearBtn.onclick = () => { panel.querySelectorAll('.rp-log').forEach(n => n.remove()); };
      panel.appendChild(clearBtn);
      const inner = document.createElement('div');
      inner.id = '__rp_diag_panel_inner';
      panel.appendChild(inner);
      document.body.appendChild(panel);
    } catch(e){ /* DOM might not be ready */ panel = null; }
    return panel;
  }

  function appendPanelLog(text) {
    const p = createDebugPanel();
    if (!p) return;
    const inner = p.querySelector('#__rp_diag_panel_inner');
    if (!inner) return;
    const node = document.createElement('div');
    node.className = 'rp-log';
    node.textContent = `${TIMESTAMP()} ${text}`;
    node.style.marginBottom = '6px';
    node.style.lineHeight = '1.1';
    inner.appendChild(node);
    // keep last few logs visible
    if (inner.childNodes.length > 200) inner.removeChild(inner.firstChild);
    inner.scrollTop = inner.scrollHeight;
  }

  // immediate startup log
  consoleLog('script load — starting diagnostic resetPin (attach logs)');

  // Helper DOM selectors (match your HTML)
  const TRIGGER_ID = 'resetPinBtn';
  const RESET_MODAL_ID = 'resetPinModal';
  const MASKED_EMAIL_ID = 'mp-masked-email';
  const FULL_EMAIL_ID = 'mp-full-email';
  const OTP_INPUT_SELECTOR = '.mp-otp-input';
  const RESEND_BTN_ID = 'mp-resend-btn';    // html shows mp-resend-btn
  const OPEN_EMAIL_BTN_ID = 'mp-open-email-btn';
  const VERIFY_BTN_ID = 'mp-reset-btn';     // Reset button in otp form
  const FORM_ID = 'mp-otp-form';

  // endpoints
  const API_BASE = (window.__SEC_API_BASE || '').replace(/\/$/, '') || '';
  const SERVER_RESEND_OTP = API_BASE ? `${API_BASE}/auth/resend-otp` : '/auth/resend-otp';
  const SERVER_VERIFY_OTP = API_BASE ? `${API_BASE}/auth/verify-otp` : '/auth/verify-otp';

  consoleLog('endpoints', { SERVER_RESEND_OTP, SERVER_VERIFY_OTP });

  // keep handlers container (to allow re-wire)
  window.__rp_diag_handlers = window.__rp_diag_handlers || {};

  // small helpers
  const $ = id => document.getElementById(id);
  const qsa = sel => Array.from(document.querySelectorAll(sel));

  // persist key for resend
  const RESEND_UNTIL_KEY = 'mp_resend_until';

  // ---- monkeypatch fetch to log every network call ----
  (function wrapFetch() {
    try {
      if (!window.fetch) { consoleLog('wrapFetch: window.fetch not present'); return; }
      if (window.__rp_diag_fetch_wrapped) { consoleLog('wrapFetch: already wrapped'); return; }
      const origFetch = window.fetch.bind(window);
      window.fetch = async function(...args) {
        try {
          consoleLog('fetch ->', args[0], args[1] ? { method: args[1].method } : {});
          const res = await origFetch(...args);
          // clone for reading body safely
          let clone;
          try { clone = res.clone(); } catch(e){ consoleLog('fetch: clone failed', e); return res; }
          clone.text().then(bodyText => {
            // log only limited size
            const snippet = typeof bodyText === 'string' && bodyText.length > 2000 ? bodyText.slice(0,2000) + '…(truncated)' : bodyText;
            consoleLog('fetch <-', args[0], 'status', res.status, 'bodySnippet:', snippet);
          }).catch(e => consoleLog('fetch clone text failed', e));
          return res;
        } catch (err) {
          consoleLog('fetch error ->', err);
          throw err;
        }
      };
      window.__rp_diag_fetch_wrapped = true;
      consoleLog('fetch wrapper installed');
    } catch(e) {
      consoleLog('wrapFetch failed', e);
    }
  })();

  // ---- wrap getSession if present (best-effort) ----
  (function wrapGetSession() {
    try {
      const candidates = ['getSession', 'getSessionFromDashboard'];
      for (const name of candidates) {
        const fn = window[name];
        if (typeof fn === 'function' && !fn.__rp_diag_wrapped) {
          consoleLog('wrapping', name);
          const orig = fn.bind(window);
          window[name] = async function(...args) {
            consoleLog(`${name}: called`, { args });
            try {
              const r = await orig(...args);
              consoleLog(`${name}: returned`, r);
              return r;
            } catch (e) {
              consoleLog(`${name}: threw`, e);
              throw e;
            }
          };
          window[name].__rp_diag_wrapped = true;
        }
      }
      consoleLog('getSession wrappers applied (if available)');
    } catch(e) { consoleLog('wrapGetSession failed', e); }
  })();

  // ---- utility: robust fetch wrapper used by flow (keeps behaviour) ----
  async function postJson(url, data, opts = {}) {
    const method = opts.method || 'POST';
    const credentials = opts.credentials ?? 'include';
    consoleLog('postJson: sending', { url, method, credentials, data });
    try {
      const res = await fetch(url, {
        method,
        credentials,
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(data)
      });
      const status = res.status;
      let bodyText = '';
      try { bodyText = await res.text(); } catch(e){ bodyText = '<no body>'; }
      let body;
      try { body = JSON.parse(bodyText); } catch(e) { body = bodyText; }
      consoleLog('postJson: response', { url, status, body });
      return { status, body, headers: (() => { const h={}; res.headers.forEach((v,k)=>h[k]=v); return h; })() };
    } catch (err) {
      consoleLog('postJson: network error', err);
      return { status: 0, body: { error: String(err) }, headers: {} };
    }
  }

  // ---- getUserEmail (same approach but logs) ----
  function getDevEmailFallback() {
    const fb = localStorage.getItem('mockEmail') || localStorage.getItem('__mock_email') || localStorage.getItem('dev_email') || null;
    consoleLog('getDevEmailFallback ->', fb);
    return fb;
  }

  async function getUserEmail() {
    consoleLog('getUserEmail: entry');
    try {
      const gs = window.getSession || (window.dashboard && window.dashboard.getSession) || window.getSessionFromDashboard;
      if (typeof gs === 'function') {
        consoleLog('getUserEmail: will call getSession function (wrapped if applicable)');
        try {
          const session = await gs();
          consoleLog('getUserEmail: getSession result', session);
          if (session && session.email) return session.email;
          if (session && session.user && session.user.email) return session.user.email;
          if (session && session.data && session.data.user && session.data.user.email) return session.data.user.email;
        } catch (err) {
          consoleLog('getUserEmail: getSession threw', err);
        }
      }
      if (window.__SERVER_USER_DATA__ && window.__SERVER_USER_DATA__.email) {
        consoleLog('getUserEmail: using window.__SERVER_USER_DATA__');
        return window.__SERVER_USER_DATA__.email;
      }
      const fb = getDevEmailFallback();
      if (fb) return fb;
      consoleLog('getUserEmail: none found => returning empty string');
      return '';
    } catch(e) { consoleLog('getUserEmail: unexpected error', e); return ''; }
  }

  // ---- resume previous debug-resend state helper ----
  function setResendUntil(ts) { try { localStorage.setItem(RESEND_UNTIL_KEY, String(ts)); consoleLog('setResendUntil', ts); } catch(e){ consoleLog('setResendUntil failed', e); } }
  function getResendUntil() { try { return parseInt(localStorage.getItem(RESEND_UNTIL_KEY) || '0', 10); } catch(e){ consoleLog('getResendUntil failed', e); return 0; } }

  // ---- OTP helpers & resend timer (preserves behavior) ----
  function getOtpValue() {
    const inputs = qsa(OTP_INPUT_SELECTOR);
    if (!inputs || inputs.length === 0) return '';
    if (inputs.length === 1) return inputs[0].value.trim();
    return inputs.map(i => i.value.trim()).join('');
  }
  function clearOtpInputs() { qsa(OTP_INPUT_SELECTOR).forEach(i => i.value=''); }
  function blurOtpInputs() { qsa(OTP_INPUT_SELECTOR).forEach(i => { try { i.blur(); } catch(e){} }); }

  let resendTimer = null;
  function startResendCountdown(durationSec = 60) {
    consoleLog('startResendCountdown', durationSec);
    const btn = $(RESEND_BTN_ID);
    if (!btn) { consoleLog('startResendCountdown: no button'); return; }
    clearInterval(resendTimer);
    const until = Date.now() + durationSec * 1000;
    setResendUntil(until);
    btn.disabled = true;
    btn.setAttribute('aria-disabled','true');
    const orig = btn.dataset.origText = btn.dataset.origText || btn.textContent;
    const tick = () => {
      const remaining = Math.ceil((until - Date.now())/1000);
      if (remaining <= 0) {
        clearInterval(resendTimer);
        try { localStorage.removeItem(RESEND_UNTIL_KEY); consoleLog('startResendCountdown: cleared localStorage key'); } catch(e){ consoleLog('startResendCountdown: remove key failed', e); }
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
        btn.textContent = orig || 'Resend OTP';
        consoleLog('startResendCountdown: finished');
      } else {
        btn.textContent = `Resend (${remaining}s)`;
      }
    };
    tick();
    resendTimer = setInterval(tick, 900);
  }
  function restoreResend() {
    const until = getResendUntil();
    if (!until || until <= Date.now()) {
      const btn = $(RESEND_BTN_ID);
      if (btn) { btn.disabled = false; btn.removeAttribute('aria-disabled'); consoleLog('restoreResend: enabled'); }
      return;
    }
    const remaining = Math.ceil((until - Date.now())/1000);
    consoleLog('restoreResend: found pending remaining', remaining);
    startResendCountdown(remaining);
  }

  // ---- open email provider heuristics (logs) ----
  function openEmailClient(email) {
    consoleLog('openEmailClient', email);
    if (!email) { alert('No email known for this account.'); consoleLog('openEmailClient: no email'); return; }
    const domain = (email.split('@')[1] || '').toLowerCase();
    const providerMap = [
      { test: d => d === 'gmail.com' || d.endsWith('googlemail.com'), url: 'https://mail.google.com/mail/u/0/#inbox' },
      { test: d => /outlook\.|hotmail\.|live\.|msn\./i.test(d), url: 'https://outlook.live.com/mail/0/inbox' },
      { test: d => d.endsWith('yahoo.com') || d.endsWith('yahoo.co'), url: 'https://mail.yahoo.com/d/folders/1' },
      { test: d => d.endsWith('icloud.com') || d.endsWith('me.com'), url: 'https://www.icloud.com/mail' },
      { test: d => d.endsWith('protonmail.com') || d.endsWith('pm.me'), url: 'https://mail.proton.me/u/0/inbox' }
    ];
    for (const p of providerMap) { try { if (p.test(domain)) { consoleLog('openEmailClient: matched provider', p.url); window.open(p.url, '_blank'); return; } } catch(e){ consoleLog('openEmailClient provider test error', e); } }
    try { consoleLog('openEmailClient: no match -> opening mailto'); window.open(`mailto:${encodeURIComponent(email)}`, '_blank'); } catch(e){ consoleLog('openEmailClient: mailto failed, fallback search', e); window.open(`https://www.google.com/search?q=${encodeURIComponent(domain + ' email')}`, '_blank'); }
  }

  // ---- mutation observer: watch profile fields for unexpected changes ----
  (function observeProfileFields() {
    try {
      const ids = ['fullName', 'fullNameInput', 'username', 'userName', 'firstname', 'firstnameInput']; // common possibilities
      const elements = ids.map(id => $(id)).filter(Boolean);
      if (!elements.length) { consoleLog('observeProfileFields: no known profile elements found yet; will attach later'); }
      const attach = (el) => {
        consoleLog('observeProfileFields: attaching observer to', el.id || el);
        const mo = new MutationObserver(muts => {
          muts.forEach(m => {
            consoleLog('Profile Mutation:', { target: m.target.id || m.target.nodeName, type: m.type, attributeName: m.attributeName, oldValue: m.oldValue, newValue: m.target.textContent || m.target.value });
            // also snapshot session if getSession exists
            if (typeof window.getSession === 'function') {
              window.getSession().then(s => consoleLog('Profile Mutation -> current getSession result', s)).catch(e => consoleLog('getSession read failed', e));
            }
          });
        });
        mo.observe(el, { attributes: true, characterData: true, subtree: true, childList: true, attributeOldValue: true });
        // store so we can disconnect later
        window.__rp_diag_handlers[`mo_${el.id || el.tagName}`] = mo;
      };
      elements.forEach(attach);
      // also watch the whole document for later additions of those ids:
      const docMo = new MutationObserver((muts) => {
        muts.forEach(m => {
          if (m.addedNodes && m.addedNodes.length) {
            Array.from(m.addedNodes).forEach(node => {
              if (!node.querySelector) return;
              ids.forEach(id => {
                const el = node.querySelector(`#${id}`) || $(id);
                if (el && !window.__rp_diag_handlers[`mo_${id}`]) attach(el);
              });
            });
          }
        });
      });
      docMo.observe(document.documentElement || document.body, { childList: true, subtree: true });
      window.__rp_diag_handlers.mutationDoc = docMo;
      consoleLog('observeProfileFields: document observer installed');
    } catch(e) { consoleLog('observeProfileFields failed', e); }
  })();

  // ---- modal event hooks (listens to custom events + ModalManager calls) ----
  (function observeModals() {
    try {
      document.addEventListener('modal:opened', (e) => consoleLog('modal:opened event', e && e.target && e.target.id));
      document.addEventListener('modal:closed', (e) => consoleLog('modal:closed event', e && e.target && e.target.id));
      // best-effort monkeypatch ModalManager if exists
      if (window.ModalManager && typeof window.ModalManager.openModal === 'function' && !window.ModalManager.__rp_diag_wrapped) {
        const origOpen = window.ModalManager.openModal.bind(window.ModalManager);
        window.ModalManager.openModal = function(idOrSelector) { consoleLog('ModalManager.openModal called', idOrSelector); return origOpen(idOrSelector); };
        const origClose = window.ModalManager.closeModal.bind(window.ModalManager);
        window.ModalManager.closeModal = function(idOrSelector) { consoleLog('ModalManager.closeModal called', idOrSelector); return origClose(idOrSelector); };
        window.ModalManager.__rp_diag_wrapped = true;
        consoleLog('ModalManager hooks attached');
      }
    } catch(e) { consoleLog('observeModals failed', e); }
  })();

  // ---- wiring + OTP flow (heavily logged) ----
  function wireOtpInputs() {
    consoleLog('wireOtpInputs: entry');
    const inputs = qsa(OTP_INPUT_SELECTOR);
    consoleLog('wireOtpInputs: found', inputs.length);
    if (!inputs.length) return;
    // remove old handlers
    if (window.__rp_diag_handlers.otpInputs) {
      window.__rp_diag_handlers.otpInputs.forEach(({el, handlers}) => {
        if (!el) return;
        if (handlers.input) el.removeEventListener('input', handlers.input);
        if (handlers.keydown) el.removeEventListener('keydown', handlers.keydown);
      });
    }
    window.__rp_diag_handlers.otpInputs = [];

    if (inputs.length === 1) {
      const input = inputs[0];
      input.setAttribute('inputmode','numeric');
      input.setAttribute('maxlength','6');
      const onInput = (e) => {
        const v = input.value.trim();
        consoleLog('otp single input event length', v.length);
        if (v.length >= 6) {
          try { input.blur(); } catch(e){}
          consoleLog('otp single -> auto-submitting');
          setTimeout(() => verifyOtpSubmit(), 120);
        }
      };
      input.addEventListener('input', onInput);
      window.__rp_diag_handlers.otpInputs.push({ el: input, handlers: { input: onInput } });
      consoleLog('wireOtpInputs: single input wired');
      return;
    }

    inputs.forEach((inp, idx) => {
      inp.setAttribute('inputmode','numeric');
      inp.setAttribute('maxlength','1');
      const onInput = () => {
        consoleLog('otp multi input idx', idx, 'val', inp.value);
        if (inp.value && idx < inputs.length - 1) inputs[idx+1].focus();
        const all = inputs.map(i => i.value.trim()).join('');
        if (all.length === inputs.length) {
          blurOtpInputs();
          consoleLog('otp multi: all filled -> auto-submit');
          setTimeout(()=> verifyOtpSubmit(), 120);
        }
      };
      const onKeydown = (e) => {
        if (e.key === 'Backspace' && !inp.value && idx > 0) {
          consoleLog('otp multi: backspace -> focus prev', idx-1); inputs[idx-1].focus();
        }
      };
      inp.addEventListener('input', onInput);
      inp.addEventListener('keydown', onKeydown);
      window.__rp_diag_handlers.otpInputs.push({ el: inp, handlers: { input: onInput, keydown: onKeydown } });
    });
    consoleLog('wireOtpInputs: multi wired');
  }

  async function verifyOtpSubmit(evt) {
    consoleLog('verifyOtpSubmit: entry', !!evt);
    if (evt && evt.preventDefault) evt.preventDefault();
    const email = await getUserEmail();
    consoleLog('verifyOtpSubmit: resolved email', email);
    if (!email) { alert('No email detected (dev: set mockEmail or __SERVER_USER_DATA__)'); return; }
    const token = getOtpValue();
    consoleLog('verifyOtpSubmit: token length', token ? token.length : 0);
    if (!token || token.length < 6) { alert('Please enter the 6-digit OTP.'); return; }
    const btn = $(VERIFY_BTN_ID);
    if (btn) { btn.disabled = true; btn.dataset.orig = btn.textContent; btn.textContent = 'Verifying…'; consoleLog('verifyOtpSubmit: verify button disabled'); }
    try {
      consoleLog('verifyOtpSubmit: posting to', SERVER_VERIFY_OTP, { email, token });
      const { status, body } = await postJson(SERVER_VERIFY_OTP, { email, token });
      consoleLog('verifyOtpSubmit: server returned', { status, body });
      if (status >= 200 && status < 300) {
        consoleLog('verifyOtpSubmit: success -> opening pin modal (existing #pinModal)');
        const opened = (function openPin() {
          try {
            if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
              consoleLog('verifyOtpSubmit: calling ModalManager.openModal(pinModal)');
              window.ModalManager.openModal('pinModal');
              return true;
            }
          } catch(e){ consoleLog('verifyOtpSubmit: ModalManager.openModal threw', e); }
          const el = $('pinModal');
          if (el) { el.classList.remove('hidden'); el.style.display = 'flex'; el.setAttribute('aria-hidden','false'); el.dispatchEvent(new CustomEvent('modal:opened',{bubbles:true})); return true; }
          return false;
        })();
        consoleLog('verifyOtpSubmit: pinModal opened?', opened);
        // close reset modal (best-effort)
        try { const r = $('resetPinModal'); if (r) { r.classList.add('hidden'); r.style.display='none'; r.setAttribute('aria-hidden','true'); r.dispatchEvent(new CustomEvent('modal:closed',{bubbles:true})); consoleLog('verifyOtpSubmit: resetPinModal closed via DOM fallback'); } } catch(e){ consoleLog('verifyOtpSubmit: close resetPinModal failed', e); }
        clearOtpInputs();
        try { localStorage.removeItem(RESEND_UNTIL_KEY); consoleLog('verifyOtpSubmit: removed resend local key'); } catch(e){ consoleLog('verifyOtpSubmit: remove key failed', e); }
      } else {
        consoleLog('verifyOtpSubmit: server returned error status', status, body);
        const errMsg = (body && body.error && body.error.message) ? body.error.message : (body && body.message) ? body.message : 'OTP verify failed';
        if (status === 400 || status === 403) {
          if ((body && body.error && body.error.code === 'otp_expired') || (errMsg && errMsg.toLowerCase().includes('expired'))) {
            alert('OTP expired. Please resend OTP and try again.');
            consoleLog('verifyOtpSubmit: otp expired');
          } else {
            alert('OTP verification failed: ' + errMsg);
            consoleLog('verifyOtpSubmit: OTP verification failed message shown', errMsg);
          }
        } else {
          alert('OTP verification failed: ' + errMsg);
        }
      }
    } catch (err) {
      consoleLog('verifyOtpSubmit: unexpected error', err);
      alert('Network error verifying OTP — check console for details.');
    } finally {
      if (btn) { btn.disabled = false; if (btn.dataset.orig) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig; } consoleLog('verifyOtpSubmit: restored verify button'); }
    }
  }

  // resend
  async function resendOtpHandler(evt) {
    consoleLog('resendOtpHandler: entry', !!evt);
    if (evt && evt.preventDefault) evt.preventDefault();
    const btn = $(RESEND_BTN_ID);
    if (!btn) return consoleLog('resendOtpHandler: no button');
    if (btn.disabled) return consoleLog('resendOtpHandler: button disabled');
    const email = await getUserEmail();
    consoleLog('resendOtpHandler: resolved email', email);
    if (!email) { alert('Unable to find your account email (dev fallback available)'); return; }
    btn.disabled = true; btn.dataset.orig = btn.textContent; btn.textContent = 'Sending…';
    try {
      const { status, body } = await postJson(SERVER_RESEND_OTP, { email });
      consoleLog('resendOtpHandler: server returned', { status, body });
      if (status >= 200 && status < 300) {
        consoleLog('resendOtpHandler: success -> starting countdown');
        startResendCountdown(60);
      } else {
        const errMsg = body?.error?.message || body?.message || 'Failed to resend OTP';
        alert('Resend failed: ' + errMsg);
        btn.disabled = false;
        if (btn.dataset.orig) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig; }
        consoleLog('resendOtpHandler: restored button after error');
      }
    } catch(e) {
      consoleLog('resendOtpHandler: exception', e);
      alert('Network error sending OTP — check console for details.');
      btn.disabled = false;
      if (btn.dataset.orig) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig; }
    }
  }

  // wire UI
  async function wire() {
    consoleLog('wire: entry');
    const trigger = $(TRIGGER_ID);
    if (trigger) {
      window.__rp_diag_handlers.onTriggerClicked = window.__rp_diag_handlers.onTriggerClicked || onTriggerClicked;
      trigger.removeEventListener('click', window.__rp_diag_handlers.onTriggerClicked);
      trigger.addEventListener('click', window.__rp_diag_handlers.onTriggerClicked);
      consoleLog('wire: trigger wired', TRIGGER_ID);
    } else consoleLog('wire: trigger not found', TRIGGER_ID);

    const resendBtn = $(RESEND_BTN_ID);
    if (resendBtn) {
      window.__rp_diag_handlers.resendOtpHandler = window.__rp_diag_handlers.resendOtpHandler || resendOtpHandler;
      resendBtn.removeEventListener('click', window.__rp_diag_handlers.resendOtpHandler);
      resendBtn.addEventListener('click', window.__rp_diag_handlers.resendOtpHandler);
      consoleLog('wire: resend button wired', RESEND_BTN_ID);
    } else consoleLog('wire: resend button not found', RESEND_BTN_ID);

    const openEmailBtn = $(OPEN_EMAIL_BTN_ID);
    if (openEmailBtn) {
      window.__rp_diag_handlers.onOpenEmailClick = window.__rp_diag_handlers.onOpenEmailClick || onOpenEmailClick;
      openEmailBtn.removeEventListener('click', window.__rp_diag_handlers.onOpenEmailClick);
      openEmailBtn.addEventListener('click', window.__rp_diag_handlers.onOpenEmailClick);
      consoleLog('wire: open email button wired', OPEN_EMAIL_BTN_ID);
    } else consoleLog('wire: open email button not found', OPEN_EMAIL_BTN_ID);

    const form = $(FORM_ID);
    if (form) {
      window.__rp_diag_handlers.formSubmit = window.__rp_diag_handlers.formSubmit || verifyOtpSubmit;
      form.removeEventListener('submit', window.__rp_diag_handlers.formSubmit);
      form.addEventListener('submit', window.__rp_diag_handlers.formSubmit);
      consoleLog('wire: form submit wired', FORM_ID);
    } else {
      const verifyBtn = $(VERIFY_BTN_ID);
      if (verifyBtn) {
        window.__rp_diag_handlers.verifyOtpSubmit = window.__rp_diag_handlers.verifyOtpSubmit || verifyOtpSubmit;
        verifyBtn.removeEventListener('click', window.__rp_diag_handlers.verifyOtpSubmit);
        verifyBtn.addEventListener('click', window.__rp_diag_handlers.verifyOtpSubmit);
        consoleLog('wire: verify button wired fallback', VERIFY_BTN_ID);
      } else consoleLog('wire: no verify button found', VERIFY_BTN_ID);
    }

    wireOtpInputs();
    restoreResend();

    // display email in modal fields
    try {
      const email = await getUserEmail();
      consoleLog('wire: resolved email for display', email);
      const fullEl = $(FULL_EMAIL_ID);
      const maskedEl = $(MASKED_EMAIL_ID);
      if (fullEl && email) { fullEl.textContent = email; consoleLog('wire: full email displayed'); }
      if (maskedEl && email) { maskedEl.textContent = email; consoleLog('wire: masked email displayed (dev)'); }
    } catch(e) { consoleLog('wire: error resolving/displaying email', e); }

    consoleLog('wire: finished');
  }

  // trigger click: send resend then open reset modal
  async function onTriggerClicked(evt) {
    consoleLog('onTriggerClicked: entry', evt && evt.currentTarget && evt.currentTarget.id);
    try {
      evt && evt.preventDefault && evt.preventDefault();
      const btn = evt && evt.currentTarget;
      if (!btn) { consoleLog('onTriggerClicked: no currentTarget'); return; }
      if (btn.disabled) { consoleLog('onTriggerClicked: button disabled'); return; }
      btn.disabled = true; if (!btn.dataset.orig) btn.dataset.orig = btn.textContent; btn.textContent = 'Preparing…';
      const email = await getUserEmail();
      consoleLog('onTriggerClicked: resolved email', email);
      if (!email) {
        alert('Unable to find your account email. For dev, set localStorage mockEmail or window.__SERVER_USER_DATA__');
        btn.disabled = false; if (btn.dataset.orig) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig; }
        return;
      }
      // show email
      try { const parts = email.split('@'); const maskedEl = $(MASKED_EMAIL_ID); const fullEl = $(FULL_EMAIL_ID); if (maskedEl) maskedEl.textContent = (parts.length===2 ? parts[0].slice(0,2)+'…@'+parts[1] : email); if (fullEl) fullEl.textContent = email; consoleLog('onTriggerClicked: email shown in modal fields'); } catch(e){ consoleLog('onTriggerClicked: show email failed', e); }

      consoleLog('onTriggerClicked: calling resend endpoint', SERVER_RESEND_OTP);
      const { status, body } = await postJson(SERVER_RESEND_OTP, { email });
      consoleLog('onTriggerClicked: resend response', { status, body });
      if (status >= 200 && status < 300) {
        consoleLog('onTriggerClicked: resend success - opening reset modal');
        // try ModalManager first
        let opened = false;
        try {
          if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
            window.ModalManager.openModal(RESET_MODAL_ID);
            opened = true;
            consoleLog('onTriggerClicked: ModalManager.openModal called', RESET_MODAL_ID);
          }
        } catch(e) { consoleLog('onTriggerClicked: ModalManager.openModal threw', e); }
        if (!opened) {
          const el = $(RESET_MODAL_ID);
          if (el) { el.classList.remove('hidden'); el.style.display = 'flex'; el.setAttribute('aria-hidden','false'); el.dispatchEvent(new CustomEvent('modal:opened',{bubbles:true})); opened = true; consoleLog('onTriggerClicked: reset modal opened via DOM fallback'); }
        }
        // wire OTP inputs after showing
        setTimeout(()=> wireOtpInputs(), 40);
        // start countdown
        startResendCountdown(60);
      } else {
        const errMsg = body?.error?.message || body?.message || 'Failed to send OTP';
        alert('Resend OTP failed: ' + errMsg);
        consoleLog('onTriggerClicked: resend failed', { status, errMsg });
      }
    } catch(e) {
      consoleLog('onTriggerClicked: unexpected error', e);
      alert('Failed to send OTP. See console/panel for details.');
    } finally {
      try { const btn = evt && evt.currentTarget; if (btn) { btn.disabled = false; if (btn.dataset.orig) { btn.textContent = btn.dataset.orig; delete btn.dataset.orig; } } } catch(e){ consoleLog('onTriggerClicked finally restore failed', e); }
      consoleLog('onTriggerClicked: finished');
    }
  }

  // open email button handler
  async function onOpenEmailClick(evt) {
    consoleLog('onOpenEmailClick: entry');
    evt && evt.preventDefault && evt.preventDefault();
    const email = await getUserEmail();
    consoleLog('onOpenEmailClick: resolved email', email);
    openEmailClient(email);
  }

  // auto-wire on DOM ready
  function initAutoWire() {
    consoleLog('initAutoWire: document.readyState', document.readyState);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { consoleLog('DOMContentLoaded fired: calling wire'); wire(); });
    } else {
      consoleLog('document already loaded - calling wire now');
      wire();
    }
  }
  initAutoWire();

  // expose debug helpers
  window.__rp_diag = Object.assign(window.__rp_diag || {}, {
    wire,
    verifyOtpSubmit,
    resendOtpHandler,
    openEmailClient,
    postJson,
    getUserEmail,
    appendPanelLog,
    _RESEND_UNTIL_KEY: RESEND_UNTIL_KEY
  });

  consoleLog('diagnostic resetPin script initialized and attached at window.__rp_diag');

})();
