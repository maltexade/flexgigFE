// frontend/js/transferBalance.js
(function () {
  'use strict';

  const MM_MODAL_ID = 'fxgTransferModal';
  const DOM_MODAL_ID = 'fxg-transfer-modal';
  const FXG_STORAGE_KEY = 'fxgUserBalance';
  const CONFIRM_MODAL_ID = 'fxg-transfer-confirm-modal';

  // helpers
  const onlyDigits = s => (s || '').toString().replace(/[^\d]/g, '');
  const fmt = n => (Number(n) || 0).toLocaleString();

  function $(id) { return document.getElementById(id); }

  // resolve elements lazily
  function resolveEls() {
    const modalEl = $(DOM_MODAL_ID);
    return {
      modal: modalEl,
      trigger: $('fxg-open-transfer-modal'),
      closeBtn: $('fxg-close-btn'),
      backdrop: modalEl ? modalEl.querySelector('.fxg-backdrop') : null,
      balanceEl: $('fxg-balance'),
      form: $('fxg-form'),
      usernameEl: $('fxg-username'),
      amountEl: $('fxg-amount'),
      continueBtn: $('fxg-continue'),
      usernameErr: $('fxg-username-error'),
      amountErr: $('fxg-amount-error'),
      successEl: $('fxg-success')
    };
  }

  // Local authoritative balance
  let BALANCE = 0;

  // --- Balance init & sync (unchanged logic) ---
  function initBalanceFromSources() {
    if (typeof window.currentDisplayedBalance === 'number' && !Number.isNaN(window.currentDisplayedBalance)) {
      BALANCE = Number(window.currentDisplayedBalance);
      persistFxgBalance(BALANCE);
      return;
    }
    try {
      const userData = localStorage.getItem('userData');
      if (userData) {
        const parsed = JSON.parse(userData);
        if (parsed && typeof parsed.wallet_balance !== 'undefined') {
          BALANCE = Number(parsed.wallet_balance) || 0;
          persistFxgBalance(BALANCE);
          return;
        }
      }
    } catch (e) {}
    try {
      const prev = localStorage.getItem(FXG_STORAGE_KEY);
      if (prev !== null) {
        BALANCE = Number(prev) || 0;
        return;
      }
    } catch (e) {}
    BALANCE = 0;
  }

  function persistFxgBalance(n) {
    try { localStorage.setItem(FXG_STORAGE_KEY, String(Number(n) || 0)); } catch (e) {}
  }

  function updateLocalBalance(n) {
    n = Number(n) || 0;
    BALANCE = n;
    persistFxgBalance(n);
    const els = resolveEls();
    if (els.balanceEl) {
      els.balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
    }
  }

  function patchUpdateAllBalances() {
    try {
      if (!window.updateAllBalances || window.__fxg_updateAllBalances_patched) return;
      const original = window.updateAllBalances;
      window.updateAllBalances = function (newBalance, skipAnimation) {
        try {
          const res = original.apply(this, arguments);
          if (typeof newBalance !== 'undefined' && newBalance !== null) {
            updateLocalBalance(Number(newBalance) || 0);
          } else if (typeof window.currentDisplayedBalance === 'number') {
            updateLocalBalance(window.currentDisplayedBalance);
          }
          return res;
        } catch (e) {
          try { return original.apply(this, arguments); } catch (err) { console.warn('patched updateAllBalances error', err); }
        }
      };
      window.__fxg_updateAllBalances_patched = true;
      console.debug('[fxgTransfer] Patched window.updateAllBalances to sync local BALANCE');
    } catch (e) {
      console.warn('[fxgTransfer] Failed to patch updateAllBalances', e);
    }
  }

  function bindBalanceUpdateEvent() {
    if (bindBalanceUpdateEvent._bound) return;
    window.addEventListener('balance_update', (ev) => {
      try {
        if (ev && ev.detail && typeof ev.detail.balance !== 'undefined') {
          updateLocalBalance(Number(ev.detail.balance) || 0);
          console.debug('[fxgTransfer] Received balance_update event', ev.detail.balance);
        }
      } catch (e) {}
    });
    bindBalanceUpdateEvent._bound = true;
  }

  function bindStorageEvents() {
    if (bindStorageEvents._bound) return;
    window.addEventListener('storage', (ev) => {
      try {
        if (!ev) return;
        if (ev.key === 'userData' && ev.newValue) {
          try {
            const parsed = JSON.parse(ev.newValue);
            if (parsed && typeof parsed.wallet_balance !== 'undefined') {
              updateLocalBalance(Number(parsed.wallet_balance) || 0);
            }
          } catch (e) {}
        }
      } catch (e) {}
    });
    bindStorageEvents._bound = true;
  }

  function refreshOnModalOpen() {
    initBalanceFromSources();
    const els = resolveEls();
    if (els.balanceEl) els.balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
  }

  // --- Fallback open/close for transfer modal (unchanged) ---
  function fallbackOpen(modalEl) {
    if (!modalEl) return;
    modalEl.style.display = 'block';
    requestAnimationFrame(() => modalEl.classList.add('show'));
    document.body.style.overflow = 'hidden';
  }
  function fallbackClose(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('show');
    setTimeout(() => {
      modalEl.style.display = 'none';
      document.body.style.overflow = '';
    }, 260);
  }

  function openModal() {
    if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
      try { window.ModalManager.openModal(MM_MODAL_ID); return; } catch (e) {}
    }
    const els = resolveEls();
    fallbackOpen(els.modal);
  }
  function closeModal() {
    if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') {
      try { window.ModalManager.closeModal(MM_MODAL_ID); return; } catch (e) {}
    }
    const els = resolveEls();
    fallbackClose(els.modal);
  }

  // --- Confirm modal creation + UI ---
  function ensureConfirmModalExists() {
    if ($(CONFIRM_MODAL_ID)) return;

    // inject styles for confirm modal (scoped)
    const css = `
#${CONFIRM_MODAL_ID} { position: fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:110000; pointer-events:none; }
#${CONFIRM_MODAL_ID} .fxg-confirm-backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.65); backdrop-filter: blur(4px); pointer-events:auto; }
#${CONFIRM_MODAL_ID} .fxg-confirm-sheet { position:relative; width:100%; max-width:520px; background:#000; border-radius:14px; color:#fff; box-shadow:0 30px 80px rgba(0,0,0,0.6); pointer-events:auto; overflow:hidden; transform:translateY(24px); opacity:0; transition:transform .28s cubic-bezier(.18,.9,.32,1), opacity .22s ease; }
@media (max-width:720px) {
  #${CONFIRM_MODAL_ID} .fxg-confirm-sheet { height:60vh; max-height:60vh; border-radius:12px 12px 0 0; width:100%; margin:0 8px 8px 8px; align-self:flex-end; transform:translateY(16px); }
}
#${CONFIRM_MODAL_ID}.show .fxg-confirm-sheet { transform:translateY(0); opacity:1; }
.fxg-confirm-header { display:flex; align-items:center; justify-content:space-between; padding:16px; border-bottom:1px solid rgba(255,255,255,0.04); }
.fxg-confirm-title { font-weight:800; font-size:16px; display:flex; align-items:center; gap:10px; }
.fxg-confirm-body { padding:16px; display:flex; flex-direction:column; gap:12px; color:#c9d6e3; font-size:15px; }
.fxg-confirm-row { display:flex; justify-content:space-between; align-items:center; gap:12px; }
.fxg-confirm-label { color:#9fbbe8; font-weight:700; font-size:13px; }
.fxg-confirm-value { color:#ffffff; font-weight:800; }
.fxg-confirm-footer { padding:14px 16px; border-top:1px solid rgba(255,255,255,0.02); display:flex; gap:10px; justify-content:flex-end; }
.fxg-confirm-btn { background:linear-gradient(90deg,#1ea0ff,#0b67ff); color:#fff; border:none; padding:10px 14px; border-radius:10px; font-weight:800; cursor:pointer; min-width:110px; }
.fxg-confirm-btn[disabled] { opacity:.5; cursor:not-allowed; }
.fxg-confirm-cancel { background:transparent; color:#cfe6ff; border:1px solid rgba(255,255,255,0.04); padding:9px 12px; border-radius:10px; cursor:pointer; }
    `.trim();

    const style = document.createElement('style');
    style.setAttribute('data-fxg-confirm-style', 'true');
    style.textContent = css;
    document.head.appendChild(style);

    // build DOM
    const wrapper = document.createElement('div');
    wrapper.id = CONFIRM_MODAL_ID;
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.innerHTML = `
      <div class="fxg-confirm-backdrop" data-fxg-confirm-close></div>
      <div class="fxg-confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="${CONFIRM_MODAL_ID}-title" tabindex="-1">
        <header class="fxg-confirm-header">
          <div class="fxg-confirm-title"><span>Confirm Transfer</span></div>
          <button class="fxg-confirm-close" aria-label="Close confirm" style="background:transparent;border:none;color:#fff;font-weight:700;cursor:pointer">✕</button>
        </header>
        <div class="fxg-confirm-body">
          <div class="fxg-confirm-row"><div class="fxg-confirm-label">Product</div><div class="fxg-confirm-value">Transfer</div></div>
          <div class="fxg-confirm-row"><div class="fxg-confirm-label">Amount</div><div class="fxg-confirm-value" id="${CONFIRM_MODAL_ID}-amount">₦0</div></div>
          <div class="fxg-confirm-row"><div class="fxg-confirm-label">Sender</div><div class="fxg-confirm-value" id="${CONFIRM_MODAL_ID}-sender">You</div></div>
          <div style="color:var(--fxg-muted,#9fbbe8);font-size:13px">Please confirm the details before sending. Transfers are instant.</div>
        </div>
        <footer class="fxg-confirm-footer">
          <button class="fxg-confirm-cancel">Cancel</button>
          <button class="fxg-confirm-btn" id="${CONFIRM_MODAL_ID}-send">Send</button>
        </footer>
      </div>
    `;
    document.body.appendChild(wrapper);

    // event bindings
    const backdrop = wrapper.querySelector('[data-fxg-confirm-close]');
    const closeBtn = wrapper.querySelector('.fxg-confirm-close');
    const cancelBtn = wrapper.querySelector('.fxg-confirm-cancel');
    [backdrop, closeBtn, cancelBtn].forEach(el => {
      if (!el) return;
      el.addEventListener('click', () => closeConfirmModal());
    });

    // escape closes
    wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeConfirmModal();
    });
  }

  function openConfirmModal(payload) {
    ensureConfirmModalExists();
    const wrapper = $(CONFIRM_MODAL_ID);
    if (!wrapper) return;

    // populate details
    const amountEl = $(`${CONFIRM_MODAL_ID}-amount`);
    const senderEl = $(`${CONFIRM_MODAL_ID}-sender`);
    const username = getCurrentUsername() || 'You';
    if (amountEl) amountEl.textContent = `₦${fmt(payload.amount)}`;
    if (senderEl) senderEl.textContent = username;

    // show
    wrapper.classList.add('show');
    wrapper.setAttribute('aria-hidden', 'false');

    // focus send button
    const sendBtn = $(`${CONFIRM_MODAL_ID}-send`);
    if (sendBtn) {
      sendBtn.focus();
      // remove any previous handlers and add new one
      sendBtn.onclick = () => confirmSend(payload);
    }

    // trap focus very simply
    setTimeout(() => {
      const sheet = wrapper.querySelector('.fxg-confirm-sheet');
      if (sheet) sheet.focus();
    }, 60);
  }

  function closeConfirmModal() {
    const wrapper = $(CONFIRM_MODAL_ID);
    if (!wrapper) return;
    wrapper.classList.remove('show');
    wrapper.setAttribute('aria-hidden', 'true');
    // tidy: remove send onclick to avoid leaks
    const sendBtn = $(`${CONFIRM_MODAL_ID}-send`);
    if (sendBtn) sendBtn.onclick = null;
  }

  // helper: try to read current user's username from localStorage.userData
  function getCurrentUsername() {
    try {
      const userData = localStorage.getItem('userData');
      if (!userData) return null;
      const parsed = JSON.parse(userData);
      return (parsed && (parsed.username || parsed.firstName || parsed.fullName)) || null;
    } catch (e) { return null; }
  }

  // confirm send action (perform transfer here)
  async function confirmSend(payload) {
    const wrapper = $(CONFIRM_MODAL_ID);
    const sendBtn = $(`${CONFIRM_MODAL_ID}-send`);
    const cancelBtn = wrapper ? wrapper.querySelector('.fxg-confirm-cancel') : null;
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';
    }
    if (cancelBtn) cancelBtn.disabled = true;

    try {
      // --- Replace this simulation with your real network call ---
      // Example:
      // const res = await fetch('/api/transfer', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      // if (!res.ok) throw new Error('Transfer failed');
      await new Promise(r => setTimeout(r, 700)); // simulate network

      // On success: update balances and show success panel in transfer modal (do NOT auto-close transfer modal)
      BALANCE = Math.max(0, BALANCE - payload.amount);
      updateLocalBalance(BALANCE);

      // Sync dashboard (authoritative visual)
      if (typeof window.updateAllBalances === 'function') {
        try { window.updateAllBalances(BALANCE); } catch (e) {}
      }

      // close confirm modal and show success in transfer modal
      closeConfirmModal();

      const els = resolveEls();
      if (els.successEl) {
        els.successEl.hidden = false;
        // add/ensure manual close button in success area
        let btn = els.successEl.querySelector('.fxg-success-close');
        if (!btn) {
          btn = document.createElement('button');
          btn.textContent = 'Close';
          btn.className = 'fxg-success-close';
          btn.style.marginTop = '12px';
          // style slightly
          btn.style.background = 'linear-gradient(90deg,#1ea0ff,#0b67ff)';
          btn.style.color = '#fff';
          btn.style.border = 'none';
          btn.style.padding = '8px 12px';
          btn.style.borderRadius = '8px';
          btn.style.fontWeight = '700';
          els.successEl.appendChild(btn);
        }
        btn.onclick = () => {
          // Prefer ModalManager close if available
          if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') {
            try { window.ModalManager.closeModal(MM_MODAL_ID); return; } catch (e) {}
          }
          // fallback
          closeModal();
        };
      }

      // update continue button text to 'Sent' to reflect success inside transfer modal
      if (els && els.continueBtn) {
        const textNode = els.continueBtn.querySelector('.fxg-btn-text');
        if (textNode) textNode.textContent = 'Sent';
      }

    } catch (err) {
      console.error('[fxgTransfer] confirmSend failed', err);
      // show an inline error on confirm sheet (simple)
      if (wrapper) {
        let errNode = wrapper.querySelector('.fxg-confirm-error');
        if (!errNode) {
          errNode = document.createElement('div');
          errNode.className = 'fxg-confirm-error';
          errNode.style.color = '#ff8a8a';
          errNode.style.padding = '0 16px 8px 16px';
          wrapper.querySelector('.fxg-confirm-body').appendChild(errNode);
        }
        errNode.textContent = `Transfer failed: ${err && err.message ? err.message : 'unknown'}`;
      }
      // re-enable buttons
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send'; }
      if (cancelBtn) cancelBtn.disabled = false;
    }
  }

  // --- Main UI init (integrates confirm modal) ---
  function initUI() {
    const els = resolveEls();
    if (!els.modal) { console.warn('[fxg] transfer: modal element not found'); return; }

    // Trigger open
    if (els.trigger && !els.trigger._fxg_bound) {
      els.trigger.addEventListener('click', (e) => {
        e.preventDefault();
        refreshOnModalOpen();
        openModal();
        setTimeout(() => { els.usernameEl && els.usernameEl.focus(); }, 160);
      });
      els.trigger._fxg_bound = true;
    }

    // Close button
    if (els.closeBtn && !els.closeBtn._fxg_bound) {
      els.closeBtn.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });
      els.closeBtn._fxg_bound = true;
    }

    // Backdrop
    if (els.backdrop && !els.backdrop._fxg_bound) {
      els.backdrop.addEventListener('click', closeModal);
      els.backdrop._fxg_bound = true;
    }

    // Initial balance
    if (els.balanceEl) refreshOnModalOpen();

    // validation
    function validate() {
      if (!els.usernameEl || !els.amountEl || !els.continueBtn) return false;
      els.usernameErr && (els.usernameErr.textContent = '');
      els.amountErr && (els.amountErr.textContent = '');

      const u = (els.usernameEl.value || '').trim();
      const amt = Number(onlyDigits(els.amountEl.value));
      let ok = true;

      if (!u || u.length < 2) {
        ok = false;
        if (els.usernameEl.value.length > 0) els.usernameErr.textContent = 'Username too short';
      }
      if (!amt || amt <= 0) {
        ok = false;
        if (els.amountEl.value.length > 0) els.amountErr.textContent = 'Enter a valid amount';
      } else if (amt > BALANCE) {
        ok = false;
        els.amountErr.textContent = `Amount exceeds balance (₦${fmt(BALANCE)})`;
      }

      els.continueBtn.disabled = !ok;
      return ok;
    }

    // Inputs handlers
    if (els.amountEl && !els.amountEl._fxg_bound) {
      els.amountEl.addEventListener('input', function (e) {
        const raw = onlyDigits(e.target.value);
        e.target.value = raw ? Number(raw).toLocaleString() : '';
        validate();
      });
      els.amountEl._fxg_bound = true;
    }
    if (els.usernameEl && !els.usernameEl._fxg_bound) {
      els.usernameEl.addEventListener('input', validate);
      els.usernameEl._fxg_bound = true;
    }

    // Form submit -> open confirm modal (instead of immediate send)
    if (els.form && !els.form._fxg_bound) {
      els.form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (!validate()) return;

        const payload = {
          recipient: (els.usernameEl.value || '').trim(),
          amount: Number(onlyDigits(els.amountEl.value)),
          timestamp: new Date().toISOString()
        };

        // show confirm modal
        openConfirmModal(payload);
      });
      els.form._fxg_bound = true;
    }

    // Refresh on ModalManager open
    if (!initUI._modalOpenedListener) {
      window.addEventListener('modalOpened', function (ev) {
        if (ev && ev.detail === MM_MODAL_ID) {
          refreshOnModalOpen();
          const el = resolveEls();
          el.successEl && (el.successEl.hidden = true);
          setTimeout(() => el.usernameEl && el.usernameEl.focus(), 160);
        }
      });
      initUI._modalOpenedListener = true;
    }
  }

  // Bootstrapping
  function bootstrap() {
    initBalanceFromSources();
    patchUpdateAllBalances();
    bindBalanceUpdateEvent();
    bindStorageEvents();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(initUI, 60));
    } else {
      setTimeout(initUI, 60);
    }

    setTimeout(() => {
      patchUpdateAllBalances();
      initBalanceFromSources();
      const be = document.getElementById('fxg-balance');
      if (be) be.textContent = `Balance: ₦${fmt(BALANCE)}`;
    }, 400);
  }

  bootstrap();

  // Debug helpers
  window.fxgTransfer = window.fxgTransfer || {};
  window.fxgTransfer.getBalance = () => BALANCE;
  window.fxgTransfer.setBalance = (v) => {
    updateLocalBalance(Number(v) || 0);
    if (typeof window.updateAllBalances === 'function') try { window.updateAllBalances(BALANCE); } catch (e) {}
  };

})();


















(function() {
  'use strict';

  // Config - adjust IDs/classes if needed
  const modalId = 'fxg-transfer-modal';
  const triggerId = 'fxg-open-transfer-modal';  // Your open button ID
  const closeSelector = '[data-fxg-close], .fxg-close';  // Close button + backdrop

  // Utility: Lock/unlock body scroll (copied from your code for independence)
  function lockBodyScroll(lock = true) {
    if (lock) {
      const scrollY = window.pageYOffset;
      document.body.style.overflow = 'hidden';
      document.body.dataset.scrollY = scrollY + '';
    } else {
      const scrollY = parseInt(document.body.dataset.scrollY || '0', 10);
      document.body.style.overflow = '';
      if (scrollY !== 0) window.scrollTo(0, scrollY);
      delete document.body.dataset.scrollY;
    }
  }

  // Utility: Focus trap for accessibility
  function trapFocus(modal) {
    const focusable = modal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (!first || !last) return;

    const handler = (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    modal._fxgTrapHandler = handler;
    modal.addEventListener('keydown', handler);
  }

  // Remove focus trap
  function removeTrap(modal) {
    if (modal._fxgTrapHandler) {
      modal.removeEventListener('keydown', modal._fxgTrapHandler);
      delete modal._fxgTrapHandler;
    }
  }

  // Open handler
  function openFxgModal() {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.style.display = 'block';  // Or 'flex' if needed
    modal.setAttribute('aria-hidden', 'false');
    modal.removeAttribute('inert');

    // Trigger CSS animation
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });

    lockBodyScroll(true);
    trapFocus(modal);

    // Focus first input or button
    const focusTarget = modal.querySelector('input, button');
    if (focusTarget) focusTarget.focus();
  }

  // Close handler
  function closeFxgModal() {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Trigger CSS exit animation
    modal.classList.remove('show');

    // Wait for animation end
    setTimeout(() => {
      modal.classList.add('hidden');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      modal.setAttribute('inert', '');

      removeTrap(modal);
      lockBodyScroll(false);

      // Restore focus to body or main content
      document.body.focus();
    }, 360);  // Match your transition duration (360ms)
  }

  // Initialize bindings on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    const trigger = document.getElementById(triggerId);
    if (trigger) {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        openFxgModal();
      });
    }

    // Bind close events (backdrop + close button)
    document.addEventListener('click', (e) => {
      if (e.target.closest(closeSelector)) {
        e.preventDefault();
        closeFxgModal();
      }
    });
  });

})();