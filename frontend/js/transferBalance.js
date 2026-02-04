// frontend/js/transferBalance.js
(function () {
  'use strict';

  const MM_MODAL_ID = 'fxgTransferModal';
  const DOM_MODAL_ID = 'fxg-transfer-modal';
  const FXG_STORAGE_KEY = 'fxgUserBalance';
  const CONFIRM_MODAL_ID = 'fxg-transfer-confirm-modal';
  const RECEIPT_MODAL_ID = 'fxg-transfer-receipt-modal';
  const API_BASE = window.__SEC_API_BASE || 'https://api.flexgig.com.ng';

  // helpers
  const onlyDigits = s => (s || '').toString().replace(/[^\d]/g, '');
  const fmt = n => (Number(n) || 0).toLocaleString('en-US');

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

  // --- Balance init & sync ---
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
      console.debug('[fxgTransfer] Patched window.updateAllBalances');
    } catch (e) {
      console.warn('[fxgTransfer] Failed to patch updateAllBalances', e);
    }
  }

  function bindBalanceUpdateEvent() {
    if (bindBalanceUpdateEvent._bound) return;
    window.addEventListener('balance_update', (ev) => {
      try {
        if (ev?.detail?.balance !== undefined) {
          updateLocalBalance(Number(ev.detail.balance) || 0);
        }
      } catch (e) {}
    });
    bindBalanceUpdateEvent._bound = true;
  }

  function bindStorageEvents() {
    if (bindStorageEvents._bound) return;
    window.addEventListener('storage', (ev) => {
      if (!ev || ev.key !== 'userData' || !ev.newValue) return;
      try {
        const parsed = JSON.parse(ev.newValue);
        if (parsed?.wallet_balance !== undefined) {
          updateLocalBalance(Number(parsed.wallet_balance) || 0);
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

  function openModal() {
    if (window.ModalManager?.openModal) {
      window.ModalManager.openModal('fxgTransferModal');
    } else {
      console.warn('[fxgTransfer] ModalManager.openModal not available');
      const els = resolveEls();
      if (els.modal) {
        els.modal.style.display = 'block';
        els.modal.classList.add('show');
        document.body.style.overflow = 'hidden';
      }
    }
  }

  function closeModal() {
    if (window.ModalManager?.closeModal) {
      window.ModalManager.closeModal('fxgTransferModal');
    } else {
      console.warn('[fxgTransfer] ModalManager.closeModal not available');
      const els = resolveEls();
      if (els.modal) {
        els.modal.classList.remove('show');
        setTimeout(() => {
          els.modal.style.display = 'none';
          document.body.style.overflow = '';
        }, 300);
      }
    }
  }

  // ────────────────────────────────────────────────
  // Confirm modal functions
  // ────────────────────────────────────────────────
  function openConfirmModal(payload) {
    const amountEl = document.getElementById('fxg-transfer-confirm-modal-amount');
    const recipientEl = document.getElementById('fxg-transfer-confirm-modal-recipient');
    if (amountEl) amountEl.textContent = `₦${fmt(payload.amount)}`;
    if (recipientEl) recipientEl.textContent = `@${payload.recipient}`;

    if (window.ModalManager?.openModal) {
      window.ModalManager.openModal('fxg-transfer-confirm-modal');
    } else {
      const wrapper = document.getElementById(CONFIRM_MODAL_ID);
      if (wrapper) {
        wrapper.style.display = 'flex';
        wrapper.classList.add('show');
        wrapper.setAttribute('aria-hidden', 'false');
      }
    }

    // Bind send button
    const sendBtn = document.getElementById('fxg-transfer-confirm-modal-send');
    if (sendBtn && !sendBtn._fxg_confirm_bound) {
      sendBtn.addEventListener('click', () => confirmSend(payload));
      sendBtn._fxg_confirm_bound = true;
    }
  }

  function closeConfirmModal() {
    if (window.ModalManager?.closeModal) {
      window.ModalManager.closeModal('fxg-transfer-confirm-modal');
    } else {
      const wrapper = document.getElementById(CONFIRM_MODAL_ID);
      if (wrapper) {
        wrapper.classList.remove('show');
        wrapper.setAttribute('aria-hidden', 'true');
        wrapper.style.display = 'none';
      }
    }
  }

  // Bind close events for confirm modal
  function bindConfirmModalEvents() {
    const wrapper = document.getElementById('fxg-transfer-confirm-modal');
    if (!wrapper || wrapper.dataset.eventsBound) return;

    const backdrop = wrapper.querySelector('[data-fxg-confirm-close]');
    const closeBtn = wrapper.querySelector('.fxg-confirm-close');
    const cancelBtn = wrapper.querySelector('.fxg-confirm-cancel');

    const handler = (e) => {
      e.preventDefault();
      closeConfirmModal();
    };

    [backdrop, closeBtn, cancelBtn].forEach(el => {
      if (el) el.addEventListener('click', handler);
    });

    wrapper.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeConfirmModal();
      }
    });

    wrapper.dataset.eventsBound = 'true';
  }

  // --- PIN verification using checkout modal ---
  async function verifyPinOrBiometric() {
    return new Promise((resolve) => {
      window._checkoutPinResolve = (success) => {
        delete window._checkoutPinResolve;
        resolve(success);
      };

      if (typeof window.showCheckoutPinModal === 'function') {
        window.showCheckoutPinModal();
      } else {
        console.error('[fxgTransfer] showCheckoutPinModal not available');
        resolve(false);
      }
    });
  }

  // --- Real transfer logic ---
  async function confirmSend(payload) {
    const wrapper = document.getElementById('fxg-transfer-confirm-modal');
    const sendBtn = document.getElementById('fxg-transfer-confirm-modal-send');
    const cancelBtn = wrapper?.querySelector('.fxg-confirm-cancel');
    let errNode = wrapper?.querySelector('.fxg-confirm-error');

    if (sendBtn) sendBtn.disabled = true;
    if (sendBtn) sendBtn.textContent = 'Verifying...';
    if (cancelBtn) cancelBtn.disabled = true;

    try {
      // 1. Close confirm modal first
      closeConfirmModal();

      // 2. Require PIN/biometric verification
      const authSuccess = await verifyPinOrBiometric();
      if (!authSuccess) {
        // User cancelled or failed PIN
        console.log('[fxgTransfer] PIN verification failed or cancelled');
        showTransferReceipt(false, payload, 'Transfer cancelled during verification');
        return;
      }

      // 3. Get auth token
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token');

      // 4. Update button to show sending
      // Note: Since confirm modal is closed, no need to update sendBtn here

      // 5. Call API
      const res = await fetch(`${API_BASE}/api/wallet/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          recipient: payload.recipient,
          amount: payload.amount
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Transfer failed');
      }

      // 6. Success: update balance
      const newBalance = data.newBalance;
      updateLocalBalance(newBalance);

      if (typeof window.updateAllBalances === 'function') {
        try { window.updateAllBalances(newBalance); } catch {}
      }

      // 7. Show success receipt
      showTransferReceipt(true, payload, newBalance, data.reference);

    } catch (err) {
      console.error('[fxgTransfer] Transfer failed', err);
      showTransferReceipt(false, payload, err.message || 'Transfer failed. Please try again.');
    }
  }

  // --- Receipt modal functions ---
  function showTransferReceipt(isSuccess, payload, balanceOrError, reference) {
    const modal = document.getElementById(RECEIPT_MODAL_ID);
    if (!modal) return console.warn('[fxgTransfer] Receipt modal not found');

    const successDiv = document.getElementById('fxg-receipt-success');
    const failedDiv = document.getElementById('fxg-receipt-failed');

    if (isSuccess) {
      failedDiv.style.display = 'none';
      successDiv.style.display = 'block';

      document.getElementById('receipt-recipient').textContent = `@${payload.recipient}`;
      document.getElementById('receipt-amount').textContent = `₦${fmt(payload.amount)}`;
      document.getElementById('receipt-new-balance').textContent = `₦${fmt(balanceOrError)}`;
      document.getElementById('receipt-date').textContent = new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

      // Done button closes modal + resets form
      const doneBtn = document.getElementById('receipt-done-btn');
      doneBtn.onclick = () => {
        closeReceiptModal();
        resetTransferForm();
      };
    } else {
      successDiv.style.display = 'none';
      failedDiv.style.display = 'block';

      document.getElementById('receipt-error-message').textContent = balanceOrError || 'Transfer failed. Please try again.';
      document.getElementById('receipt-failed-recipient').textContent = `@${payload.recipient}`;
      document.getElementById('receipt-failed-amount').textContent = `₦${fmt(payload.amount)}`;

      // Try Again button closes receipt + re-opens confirm
      const tryAgainBtn = document.getElementById('receipt-try-again-btn');
      tryAgainBtn.onclick = () => {
        closeReceiptModal();
        openConfirmModal(payload);  // Retry with same payload
      };

      // Close button closes receipt + resets form
      const closeBtn = document.getElementById('receipt-close-btn');
      closeBtn.onclick = () => {
        closeReceiptModal();
        resetTransferForm();
      };
    }

    // Show the modal
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeReceiptModal() {
    const modal = document.getElementById(RECEIPT_MODAL_ID);
    if (modal) {
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function resetTransferForm() {
    const els = resolveEls();
    if (els.usernameEl) els.usernameEl.value = '';
    if (els.amountEl) els.amountEl.value = '';
    if (els.continueBtn) {
      const text = els.continueBtn.querySelector('.fxg-btn-text') || els.continueBtn;
      text.textContent = 'Continue';
      els.continueBtn.disabled = true;
    }
    if (els.successEl) els.successEl.hidden = true;
    closeModal();  // Close main transfer modal
  }

  // --- Main UI init ---
  function initUI() {
    const els = resolveEls();
    if (!els.modal) {
      console.warn('[fxgTransfer] Transfer modal element not found');
      return;
    }

    // Bind trigger
    if (els.trigger && !els.trigger._fxg_bound) {
      els.trigger.addEventListener('click', e => {
        e.preventDefault();
        refreshOnModalOpen();
        openModal();
      });
      els.trigger._fxg_bound = true;
    }

    // Bind close
    if (els.closeBtn && !els.closeBtn._fxg_bound) {
      els.closeBtn.addEventListener('click', e => {
        e.preventDefault();
        closeModal();
      });
      els.closeBtn._fxg_bound = true;
    }

    if (els.backdrop && !els.backdrop._fxg_bound) {
      els.backdrop.addEventListener('click', e => {
        if (e.target === els.backdrop) closeModal();
      });
      els.backdrop._fxg_bound = true;
    }

    // Validation
    function validate() {
      if (!els.usernameEl || !els.amountEl || !els.continueBtn) return false;

      const username = (els.usernameEl.value || '').trim();
      const raw = onlyDigits(els.amountEl.value);
      const amt = Number(raw);

      const usernameOk = username.length >= 2;
      const amountOk = raw.length > 0 && amt > 0 && amt <= BALANCE;

      els.usernameErr.textContent = usernameOk || !username ? '' : 'Username too short';

      if (els.amountErr) {
        if (!raw) els.amountErr.textContent = '';
        else if (amt <= 0) els.amountErr.textContent = 'Invalid amount';
        else if (amt > BALANCE) els.amountErr.textContent = `Max ₦${fmt(BALANCE)}`;
        else els.amountErr.textContent = '';
      }

      const valid = usernameOk && amountOk;
      els.continueBtn.disabled = !valid;
      return valid;
    }

    // Amount input
    if (els.amountEl && !els.amountEl._fxg_bound) {
      let prevFormatted = '';
      els.amountEl.addEventListener('input', e => {
        const cursor = e.target.selectionStart;
        let raw = onlyDigits(e.target.value);
        if (raw.length > 1 && raw.startsWith('0')) raw = raw.replace(/^0+/, '') || '0';

        const formatted = raw ? Number(raw).toLocaleString('en-US') : '';
        if (formatted !== prevFormatted) {
          prevFormatted = formatted;
          e.target.value = formatted;
          const added = formatted.length - raw.length;
          const newPos = cursor + added;
          e.target.setSelectionRange(newPos, newPos);
        }
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
      els.form.addEventListener('submit', ev => {
        ev.preventDefault();
        if (!validate()) return;

        const payload = {
          recipient: (els.usernameEl.value || '').trim(),
          amount: Number(onlyDigits(els.amountEl.value)),
          timestamp: new Date().toISOString()
        };

        openConfirmModal(payload);
      });
      els.form._fxg_bound = true;
    }

    // Reset on modal open
    window.addEventListener('modalOpened', ev => {
      if (ev?.detail === 'fxgTransferModal') {
        refreshOnModalOpen();
        const els = resolveEls();
        if (els.successEl) els.successEl.hidden = true;
        validate();
      }
    });

    // Bind events
    bindConfirmModalEvents();
    bindReceiptModalEvents();
  }

  // Bind receipt events
  function bindReceiptModalEvents() {
    const wrapper = document.getElementById(RECEIPT_MODAL_ID);
    if (!wrapper || wrapper.dataset.eventsBound) return;

    const backdrop = wrapper.querySelector('.fxg-receipt-backdrop');
    const handler = (e) => {
      if (e.target === backdrop) closeReceiptModal();
    };
    backdrop.addEventListener('click', handler);

    wrapper.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeReceiptModal();
    });

    wrapper.dataset.eventsBound = 'true';
  }

  // Bootstrap
  function bootstrap() {
    initBalanceFromSources();
    patchUpdateAllBalances();
    bindBalanceUpdateEvent();
    bindStorageEvents();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(initUI, 80));
    } else {
      setTimeout(initUI, 80);
    }

    setTimeout(() => {
      const be = $('fxg-balance');
      if (be) be.textContent = `Balance: ₦${fmt(BALANCE)}`;
    }, 600);
  }

  bootstrap();

  // Debug helpers
  window.fxgTransfer = window.fxgTransfer || {};
  window.fxgTransfer.getBalance = () => BALANCE;
  window.fxgTransfer.setBalance = v => {
    updateLocalBalance(Number(v) || 0);
    if (typeof window.updateAllBalances === 'function') {
      try { window.updateAllBalances(BALANCE); } catch {}
    }
  };

})();