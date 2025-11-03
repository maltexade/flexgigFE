/* pinModal-wires.js
   Wires the #pinModal keypad, create-mode, submit to /save-pin/.
   Drop this after your ModalManager and pinModal HTML.
*/
(function pinModalWires(){
  'use strict';

  const DEBUG = true;
  const log = (...args) => { if (DEBUG) console.debug('[PIN-WIRE]', ...args); };

  // config
  const MODAL_ID = 'pinModal';
  const INPUT_SELECTOR = '.pin-inputs input';
  const KEYPAD_SELECTOR = '.pin-keypad';
  const DELETE_BTN_ID = 'deleteKey';
  const PIN_ALERT_ID = 'pinAlert';
  const PIN_ALERT_MSG_ID = 'pinAlertMsg';
  const CENTER_ALERT_ID = 'centerAlert';
  const CENTER_ALERT_MSG_ID = 'centerAlertMsg';
  const API_BASE = (window.__SEC_API_BASE || '').replace(/\/$/, '');
  const SAVE_PIN_ENDPOINT = API_BASE ? `${API_BASE}/save-pin/` : '/save-pin/';

  // state
  let pinDigits = []; // stores digits as strings
  let isSubmitting = false;

  // helpers
  const $ = id => document.getElementById(id);
  const q = (sel, root=document) => (root || document).querySelector(sel);
  const qAll = (sel, root=document) => Array.from((root || document).querySelectorAll(sel));

  function showAlert(msg, {center=false, timeout=4000} = {}) {
    try {
      if (center) {
        const c = $(CENTER_ALERT_ID);
        const cm = $(CENTER_ALERT_MSG_ID);
        if (cm) cm.textContent = msg;
        if (c) { c.classList.remove('hidden'); c.style.display = ''; }
        if (timeout > 0) setTimeout(()=>{ if (c) { c.classList.add('hidden'); c.style.display='none'; } }, timeout);
      } else {
        const a = $(PIN_ALERT_ID);
        const am = $(PIN_ALERT_MSG_ID);
        if (am) am.textContent = msg;
        if (a) { a.classList.remove('hidden'); a.style.display = ''; }
        if (timeout > 0) setTimeout(()=>{ if (a) { a.classList.add('hidden'); a.style.display='none'; } }, timeout);
      }
    } catch (e) { console.error('showAlert error', e); }
  }

  function clearAlerts() {
    const a = $(PIN_ALERT_ID); if (a) { a.classList.add('hidden'); a.style.display='none'; }
    const c = $(CENTER_ALERT_ID); if (c) { c.classList.add('hidden'); c.style.display='none'; }
  }

  function updateInputsFromState() {
    const inputs = qAll(INPUT_SELECTOR, $(MODAL_ID));
    inputs.forEach((inp, idx) => {
      inp.value = pinDigits[idx] ? pinDigits[idx] : '';
      // keep them readonly; masking is automatic for password fields
    });
  }

  function resetPinState() {
    pinDigits = [];
    updateInputsFromState();
    clearAlerts();
  }

  function disableKeypad(disabled) {
    const modal = $(MODAL_ID);
    if (!modal) return;
    const buttons = qAll(`${KEYPAD_SELECTOR} button`, modal);
    buttons.forEach(b => b.disabled = !!disabled);
  }

  // Submit to server
  async function submitPin() {
    if (isSubmitting) return;
    if (pinDigits.length !== 4) return;
    const pin = pinDigits.join('');

    isSubmitting = true;
    disableKeypad(true);
    showAlert('Saving PIN…', { center: true, timeout: 0 });

    try {
      const url = SAVE_PIN_ENDPOINT;
      log('POST', url, { pin });
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });

      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch(e) { body = text; }

      log('save-pin response', res.status, body);
      if (res.ok) {
        // success: close all modals and go to dashboard
        showAlert('PIN created successfully. Redirecting…', { center: true, timeout: 800 });
        try {
          if (window.ModalManager && typeof window.ModalManager.closeAll === 'function') {
            window.ModalManager.closeAll();
          } else {
            // fallback: hide known modals
            const pm = $(MODAL_ID);
            if (pm) { pm.classList.add('hidden'); pm.style.display = 'none'; pm.setAttribute('aria-hidden','true'); }
            if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') {
              window.ModalManager.closeModal(MODAL_ID);
            }
          }
        } catch(e){ log('closeAll failed', e); }

        // give a small delay to let close animation play
        setTimeout(() => {
          // try to refresh session if available, else navigate to root/dashboard
          if (typeof window.getSession === 'function') {
            try {
              window.getSession().then(()=> { window.location.href = '/'; }).catch(()=> { window.location.href = '/'; });
            } catch(e) {
              window.location.href = '/';
            }
          } else {
            window.location.href = '/';
          }
        }, 600);

        return;
      }

      // non-ok: show server error message
      const errMsg = (body && (body.error?.message || body.message)) || (typeof body === 'string' ? body : `Error ${res.status}`);
      showAlert(errMsg || 'Failed to save PIN', { center: false, timeout: 5000 });
      // reset inputs so user can retry safely
      pinDigits = [];
      updateInputsFromState();
    } catch (err) {
      console.error('save-pin error', err);
      showAlert('Network error saving PIN. Try again.', { center: false, timeout: 5000 });
      pinDigits = [];
      updateInputsFromState();
    } finally {
      isSubmitting = false;
      disableKeypad(false);
      // remove center 'Saving PIN...' if present
      clearAlerts();
    }
  }

  // Key handler when digits are pressed
  function onDigitPress(digit) {
    if (isSubmitting) return;
    if (!/^\d$/.test(digit)) return;
    if (pinDigits.length >= 4) return;
    pinDigits.push(String(digit));
    updateInputsFromState();

    if (pinDigits.length === 4) {
      // small delay to allow UI update
      setTimeout(() => submitPin(), 150);
    }
  }

  function onDeletePress() {
    if (isSubmitting) return;
    if (pinDigits.length === 0) return;
    pinDigits.pop();
    updateInputsFromState();
  }

  // Setup DOM wiring
  function wireUp() {
    const modal = $(MODAL_ID);
    if (!modal) {
      log('pinModal not found in DOM:', MODAL_ID);
      return;
    }

    // keypad buttons
    const keypad = q(KEYPAD_SELECTOR, modal);
    if (keypad) {
      keypad.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        // delete key
        if (btn.id === DELETE_BTN_ID) {
          onDeletePress();
          return;
        }
        // numeric buttons — textContent should be the digit
        const txt = (btn.textContent || '').trim();
        if (/^\d$/.test(txt)) {
          onDigitPress(txt);
        }
      });
    } else {
      log('no keypad found');
    }

    // keyboard accessibility: also support physical keyboard numbers and Backspace when modal focused
    modal.addEventListener('keydown', (e) => {
      if (isSubmitting) return;
      if (/^\d$/.test(e.key)) {
        onDigitPress(e.key);
        e.preventDefault();
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        onDeletePress();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        // close modal if desired
        try { if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') window.ModalManager.closeModal(MODAL_ID); } catch(_) {}
      }
    });

    // Close button (back arrow) already has data-close and ModalManager will wire it.
    // But ensure that when modal opens we reset state if create-mode
    const observer = new MutationObserver(() => {
      const hidden = modal.getAttribute('aria-hidden') === 'true' || modal.classList.contains('hidden');
      if (!hidden) {
        // opened
        // if modal has create flag then treat as create flow
        resetPinState();
        clearAlerts();
        // focus for keyboard accessibility
        setTimeout(() => { try { modal.focus(); } catch(e){} }, 50);
      } else {
        // modal closed — clear state
        resetPinState();
        if (modal.dataset.createMode) delete modal.dataset.createMode;
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['aria-hidden','class'] });

    // set tabindex so modal can receive keydowns
    if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');

    // hide alert containers initially if present
    clearAlerts();

    // expose helper to open create modal externally
    window.openCreatePinModal = function openCreatePinModal() {
      const pm = $(MODAL_ID);
      if (!pm) { log('openCreatePinModal: modal missing'); return false; }
      pm.dataset.createMode = 'true';
      // prefer ModalManager
      try {
        if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
          window.ModalManager.openModal(MODAL_ID);
        } else {
          // fallback direct show
          pm.classList.remove('hidden');
          pm.style.display = pm.dataset.hasPullHandle === 'true' ? 'block' : 'flex';
          pm.setAttribute('aria-hidden', 'false');
          pm.dispatchEvent(new CustomEvent('modal:opened', { bubbles: true }));
        }
        return true;
      } catch (e) {
        console.error('openCreatePinModal error', e);
        return false;
      }
    };

    log('wired pinModal keypad and submit');
  }

  // auto-wire after DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireUp);
  } else {
    wireUp();
  }

})();
