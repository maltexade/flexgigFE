// frontend/js/transferBalance.js
(function () {
  'use strict';

  const MM_MODAL_ID = 'fxgTransferModal';
  const DOM_MODAL_ID = 'fxg-transfer-modal';
  const FXG_STORAGE_KEY = 'fxgUserBalance';

  // helpers
  const onlyDigits = s => (s || '').toString().replace(/[^\d]/g, '');
  const fmt = n => (Number(n) || 0).toLocaleString();

  function $(id) { return document.getElementById(id); }

  // resolve elements lazily
  function resolveEls() {
    const modalEl = document.getElementById(DOM_MODAL_ID);
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

  // Local authoritative balance for this module
  let BALANCE = 0;

  // Initialize BALANCE from best available source:
  function initBalanceFromSources() {
    // 1) Prefer window.currentDisplayedBalance (dashboard sets this via updateAllBalances)
    if (typeof window.currentDisplayedBalance === 'number' && !Number.isNaN(window.currentDisplayedBalance)) {
      BALANCE = Number(window.currentDisplayedBalance);
      persistFxgBalance(BALANCE);
      return;
    }

    // 2) Try reading userData in localStorage (server-provided session)
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
    } catch (e) { /* ignore parse errors */ }

    // 3) Try previously persisted fxg key
    try {
      const prev = localStorage.getItem(FXG_STORAGE_KEY);
      if (prev !== null) {
        BALANCE = Number(prev) || 0;
        return;
      }
    } catch (e) { /* ignore */ }

    // fallback to 0
    BALANCE = 0;
  }

  function persistFxgBalance(n) {
    try { localStorage.setItem(FXG_STORAGE_KEY, String(Number(n) || 0)); } catch (e) {}
  }

  // Update our local copy and DOM element (safe, idempotent)
  function updateLocalBalance(n) {
    n = Number(n) || 0;
    BALANCE = n;
    persistFxgBalance(n);

    // Update modal balance display if present
    const els = resolveEls();
    if (els.balanceEl) {
      els.balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
    }
  }

  // Patch window.updateAllBalances to mirror inbound authoritative updates
  function patchUpdateAllBalances() {
    try {
      if (!window.updateAllBalances || window.__fxg_updateAllBalances_patched) return;
      const original = window.updateAllBalances;
      window.updateAllBalances = function (newBalance, skipAnimation) {
        try {
          // call original first (preserves UI animation)
          const res = original.apply(this, arguments);
          // then mirror to our BALANCE
          if (typeof newBalance !== 'undefined' && newBalance !== null) {
            updateLocalBalance(Number(newBalance) || 0);
          } else if (typeof window.currentDisplayedBalance === 'number') {
            updateLocalBalance(window.currentDisplayedBalance);
          }
          return res;
        } catch (e) {
          // if anything breaks, fallback to calling original
          try { return original.apply(this, arguments); } catch (err) { console.warn('patched updateAllBalances error', err); }
        }
      };
      window.__fxg_updateAllBalances_patched = true;
      console.debug('[fxgTransfer] Patched window.updateAllBalances to sync local BALANCE');
    } catch (e) {
      console.warn('[fxgTransfer] Failed to patch updateAllBalances', e);
    }
  }

  // Listen for custom balance_update event dispatched by balance.js fallback
  function bindBalanceUpdateEvent() {
    if (bindBalanceUpdateEvent._bound) return;
    window.addEventListener('balance_update', (ev) => {
      try {
        if (ev && ev.detail && typeof ev.detail.balance !== 'undefined') {
          updateLocalBalance(Number(ev.detail.balance) || 0);
          console.debug('[fxgTransfer] Received balance_update event', ev.detail.balance);
        }
      } catch (e) { /* ignore */ }
    });
    bindBalanceUpdateEvent._bound = true;
  }

  // Monitor localStorage.userData changes from other tabs / scripts
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

  // Called when modal opens — refresh from best sources then render
  function refreshOnModalOpen() {
    initBalanceFromSources();
    const els = resolveEls();
    if (els.balanceEl) els.balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
  }

  // Fallback open/close (same as before)
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

  // prefer ModalManager if present
  function openModal() {
    if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
      try {
        window.ModalManager.openModal(MM_MODAL_ID);
        return;
      } catch (e) { /* fallback */ }
    }
    const els = resolveEls();
    fallbackOpen(els.modal);
  }
  function closeModal() {
    if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') {
      try {
        window.ModalManager.closeModal(MM_MODAL_ID);
        return;
      } catch (e) { /* fallback */ }
    }
    const els = resolveEls();
    fallbackClose(els.modal);
  }

  // Main UI init (keeps most of your original behavior)
  function initUI() {
    const els = resolveEls();
    if (!els.modal) {
      console.warn('[fxg] transfer: modal element not found');
      return;
    }

    // Wire triggers once
    if (els.trigger && !els.trigger._fxg_bound) {
      els.trigger.addEventListener('click', (e) => {
        e.preventDefault();
        refreshOnModalOpen(); // refresh from global/session
        openModal();
        // focus username after a short delay
        setTimeout(() => { els.usernameEl && els.usernameEl.focus(); }, 160);
      });
      els.trigger._fxg_bound = true;
    }

    // Close button
    if (els.closeBtn && !els.closeBtn._fxg_bound) {
      els.closeBtn.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });
      els.closeBtn._fxg_bound = true;
    }

    // backdrop
    if (els.backdrop && !els.backdrop._fxg_bound) {
      els.backdrop.addEventListener('click', closeModal);
      els.backdrop._fxg_bound = true;
    }

    // Display initial balance in modal if present
    if (els.balanceEl) {
      refreshOnModalOpen();
    }

    // Form/inputs/validation/submit behavior (kept mostly same)
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

    if (els.form && !els.form._fxg_bound) {
      els.form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (!validate()) return;

        const payload = {
          recipient: (els.usernameEl.value || '').trim(),
          amount: Number(onlyDigits(els.amountEl.value)),
          timestamp: new Date().toISOString()
        };

        // UI busy
        els.continueBtn.classList.add('loading');
        els.continueBtn.disabled = true;
        const textNode = els.continueBtn.querySelector('.fxg-btn-text');
        if (textNode) textNode.textContent = 'Sending';

        // Replace with real fetch to /api/transfer
        // For demo we simulate success:
        setTimeout(() => {
          els.continueBtn.classList.remove('loading');
          if (textNode) textNode.textContent = 'Sent';
          if (els.successEl) els.successEl.hidden = false;

          // Update local lines: reduce BALANCE and persist
          BALANCE = Math.max(0, BALANCE - payload.amount);
          updateLocalBalance(BALANCE); // will update modal display & localStorage

          // If dashboard/code listens to updateAllBalances, call it to sync global UI
          if (typeof window.updateAllBalances === 'function') {
            try { window.updateAllBalances(BALANCE); } catch (e) { /* ignore */ }
          }

          setTimeout(() => closeModal(), 800);
        }, 700);

        console.log('[fxg] transfer payload', payload);
      });
      els.form._fxg_bound = true;
    }

    // Make sure we listen for modalOpened so we refresh when ModalManager opens it
    if (!initUI._modalOpenedListener) {
      window.addEventListener('modalOpened', function (ev) {
        if (ev && ev.detail === MM_MODAL_ID) {
          refreshOnModalOpen();
          // hide success panel
          const el = resolveEls();
          el.successEl && (el.successEl.hidden = true);
          setTimeout(() => el.usernameEl && el.usernameEl.focus(), 160);
        }
      });
      initUI._modalOpenedListener = true;
    }
  } // end initUI

  // Bootstrapping
  function bootstrap() {
    // 1) Initialize BALANCE value from best sources
    initBalanceFromSources();

    // 2) Monkey-patch and bind listeners so we keep in sync with dashboard
    patchUpdateAllBalances();
    bindBalanceUpdateEvent();
    bindStorageEvents();

    // 3) Init UI wiring soon after DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(initUI, 60));
    } else {
      setTimeout(initUI, 60);
    }

    // 4) Try again after a short delay in case dashboard initialized later
    setTimeout(() => {
      patchUpdateAllBalances();
      initBalanceFromSources();
      // update modal display if present
      const be = document.getElementById('fxg-balance');
      if (be) be.textContent = `Balance: ₦${fmt(BALANCE)}`;
    }, 400);
  }

  bootstrap();

  // Debug helpers
  window.fxgTransfer = window.fxgTransfer || {};
  window.fxgTransfer.getBalance = () => BALANCE;
  window.fxgTransfer.setBalance = (v) => { updateLocalBalance(Number(v) || 0); if (typeof window.updateAllBalances === 'function') try { window.updateAllBalances(BALANCE); } catch (e) {} };

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