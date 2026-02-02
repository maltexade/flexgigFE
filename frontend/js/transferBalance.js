// frontend/js/transferBalance.js

(function () {
  'use strict';

const BALANCE_INITIAL = Number(localStorage.getItem('fxgUserBalance')) || 0;
  // ModalManager modal id (this is the key you added to modals)
  const MM_MODAL_ID = 'fxgTransferModal'; // internal manager key
  const DOM_MODAL_ID = 'fxg-transfer-modal'; // actual DOM id of the modal element

  // Utility helpers
  const onlyDigits = s => (s || '').toString().replace(/[^\d]/g, '');
  const fmt = n => (Number(n) || 0).toLocaleString();

  // Elements (will resolve lazily)
  function $(id) { return document.getElementById(id); }

  // Resolve elements - safe if DOM not yet ready
  function resolveEls() {
    return {
      modal: $(DOM_MODAL_ID),
      trigger: $('fxg-open-transfer-modal'),
      closeBtn: $('fxg-close-btn'),
      backdrop: (document.getElementById(DOM_MODAL_ID) || {}).querySelector ? document.getElementById(DOM_MODAL_ID).querySelector('.fxg-backdrop') : null,
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

  // Local state
  let BALANCE = BALANCE_INITIAL;

  // Fallback open/close if ModalManager not present / not configured
  function fallbackOpen(modalEl) {
    if (!modalEl) return;
    modalEl.style.display = 'block';
    // animate in by adding show class like previous behavior
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

  // Open via manager if possible, else fallback
  function openModal() {
    if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
      try {
        window.ModalManager.openModal(MM_MODAL_ID);
        return;
      } catch (e) { /* fallback below */ }
    }
    // fallback: show our modal directly
    const els = resolveEls();
    fallbackOpen(els.modal);
    // ensure focus
    setTimeout(() => { els.usernameEl && els.usernameEl.focus(); }, 160);
  }

  function closeModal() {
    if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') {
      try {
        window.ModalManager.closeModal(MM_MODAL_ID);
        return;
      } catch (e) { /* fallback below */ }
    }
    // fallback close
    const els = resolveEls();
    fallbackClose(els.modal);
  }

  // Initialize UI wiring (idempotent)
  function initUI() {
    const els = resolveEls();
    if (!els.modal) {
      console.warn('[fxg] transfer: modal element not found');
      return;
    }

    // Ensure balance shown
if (els.balanceEl) {
  // Re-load from storage in case it changed elsewhere
  BALANCE = Number(localStorage.getItem('fxgUserBalance')) || BALANCE;
  els.balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
}

    // Prevent double binding
    if (els.trigger && !els.trigger._fxg_bound) {
      els.trigger.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
      });
      els.trigger._fxg_bound = true;
    }

    // close button: always call manager close if available, else fallback
    if (els.closeBtn && !els.closeBtn._fxg_bound) {
      els.closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal();
      });
      els.closeBtn._fxg_bound = true;
    }

    // backdrop click (if exists)
    if (els.backdrop && !els.backdrop._fxg_bound) {
      els.backdrop.addEventListener('click', () => closeModal());
      els.backdrop._fxg_bound = true;
    }

    // Input formatting & validation
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

    // Input handlers
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

    // Form submit
    if (els.form && !els.form._fxg_bound) {
      els.form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (!validate()) return;

        const payload = {
          recipient: (els.usernameEl.value || '').trim(),
          amount: Number(onlyDigits(els.amountEl.value)),
          timestamp: new Date().toISOString()
        };

        // UI busy state
        els.continueBtn.classList.add('loading');
        els.continueBtn.disabled = true;
        const textNode = els.continueBtn.querySelector('.fxg-btn-text');
        if (textNode) textNode.textContent = 'Sending';

        // TODO: replace with real network call (fetch/axios). For now simulate:
        setTimeout(() => {
          // success UX
          els.continueBtn.classList.remove('loading');
          if (textNode) textNode.textContent = 'Sent';
          if (els.successEl) els.successEl.hidden = false;

          // update balance client-side
          BALANCE = Math.max(0, BALANCE - payload.amount);
          if (els.balanceEl) els.balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
          localStorage.setItem('fxgUserBalance', BALANCE.toString());

          // close after short delay
          setTimeout(() => {
            closeModal();
          }, 800);
        }, 700);

        console.log('[fxg] transfer payload', payload);
      });
      els.form._fxg_bound = true;
    }

    // Re-focus first input when manager opens modal (listen for manager's event)
    // ModalManager dispatches "modalOpened" with detail = modalId
    if (window.ModalManager && !initUI._modalOpenedListener) {
      window.addEventListener('modalOpened', function (ev) {
        try {
          if (ev && ev.detail === MM_MODAL_ID) {
            // small delay for animation
            setTimeout(() => {
              const el = resolveEls();
              el.usernameEl && el.usernameEl.focus();
              // ensure success panel hidden
              el.successEl && (el.successEl.hidden = true);
            }, 150);
          }
        } catch (e) { /* ignore */ }
      });
      initUI._modalOpenedListener = true;
    }

    // If ModalManager is not present, also watch for manual show (class 'show' applied)
    if (!window.ModalManager && !initUI._mutationObserver) {
      const el = els.modal;
      if (el) {
        const mo = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.attributeName === 'class') {
              if (el.classList.contains('show')) {
                // opened
                setTimeout(() => els.usernameEl && els.usernameEl.focus(), 140);
                if (els.successEl) els.successEl.hidden = true;
              }
            }
          }
        });
        mo.observe(el, { attributes: true, attributeFilter: ['class'] });
        initUI._mutationObserver = mo;
      }
    }
  } // end initUI

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initUI, 80));
  } else {
    setTimeout(initUI, 80);
  }

  // Also try to init again once ModalManager is ready (in case it resolves element lazily)
  if (window.ModalManager && typeof window.ModalManager.getOpenModals === 'function') {
    // small delay so manager.initialize() can run first
    setTimeout(initUI, 300);
  }

  // Expose helpers to global for debugging if needed
  window.fxgTransfer = {
    open: openModal,
    close: closeModal,
    getBalance: () => BALANCE,
    setBalance: (v) => { BALANCE = Number(v) || 0; const be = $('fxg-balance'); if (be) be.textContent = `Balance: ₦${fmt(BALANCE)}`; }
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