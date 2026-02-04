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
  const fmt = n => (Number(n) || 0).toLocaleString('en-NG');

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

  // --- Modal open/close using ModalManager ---
  function openModal() {
    refreshOnModalOpen();
    if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
      // Clean any stale state first
      if (ModalManager.getOpenModals().includes(MM_MODAL_ID)) {
        console.warn('[fxgTransfer] Modal was already in stack — forcing clean close first');
        ModalManager.forceCloseModal?.(MM_MODAL_ID);
      }
      ModalManager.openModal(MM_MODAL_ID);
      console.log('[fxgTransfer] Successfully delegated open to ModalManager');
    } else {
      // Fallback
      console.warn('[fxgTransfer] ModalManager not found — using basic fallback open');
      const els = resolveEls();
      if (els.modal) {
        els.modal.classList.remove('hidden');
        els.modal.style.display = 'flex';
        els.modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
      }
    }
  }

  function closeModal() {
    if (window.ModalManager && typeof window.ModalManager.forceCloseModal === 'function') {
      window.ModalManager.forceCloseModal(MM_MODAL_ID);
    } else {
      // Fallback
      console.warn('[fxgTransfer] ModalManager not found — using basic fallback close');
      const els = resolveEls();
      if (els.modal) {
        els.modal.setAttribute('aria-hidden', 'true');
        els.modal.classList.remove('active');
        els.modal.style.display = 'none';
        document.body.classList.remove('modal-open');
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

    if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
      ModalManager.openModal('fxg-transfer-confirm-modal');
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
    if (window.ModalManager && typeof window.ModalManager.forceCloseModal === 'function') {
      window.ModalManager.forceCloseModal('fxg-transfer-confirm-modal');
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

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = 'Verifying...';
  }
  if (cancelBtn) cancelBtn.disabled = true;

  try {
    // 1. Close confirm modal first (smooth UX transition)
    closeConfirmModal();

    // 2. Require PIN/biometric verification
    const authSuccess = await verifyPinOrBiometric();
    if (!authSuccess) {
      console.log('[fxgTransfer] PIN verification failed or cancelled');
      showTransferReceipt(false, payload, 'Transfer cancelled during verification');
      return;
    }

    // 3. Show processing receipt immediately after PIN success
    showProcessingReceipt(payload);

    // 4. Fetch the JWT using your existing getSharedJWT function
    const token = await getSharedJWT();
    if (!token) {
      console.error('[fxgTransfer] Failed to obtain authentication token');
      throw new Error('Authentication token unavailable. Please log in again.');
    }

    console.log('[fxgTransfer] JWT fetched successfully (length: ' + token.length + ')');

    // 5. Make the actual transfer API call with Bearer token
    const res = await fetch(`${API_BASE}/api/wallet/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`   // ← This is the critical fix
      },
      body: JSON.stringify({
        recipient: payload.recipient,
        amount: payload.amount
      }),
      credentials: 'include'   // Keep this — sends session cookie too
    });

    let data;
    try {
      data = await res.json();
    } catch (jsonErr) {
      const text = await res.text().catch(() => 'No response body');
      console.error('[fxgTransfer] Response not JSON:', text);
      throw new Error('Invalid response from server');
    }

    if (!res.ok) {
      // Handle specific error cases
      if (data.error?.toLowerCase().includes('insufficient') || 
          data.code === 'INSUFFICIENT_BALANCE' || 
          data.message?.toLowerCase().includes('insufficient')) {
        updateReceiptToInsufficient('Insufficient balance for this transfer.', BALANCE);
      } else {
        const errorMsg = data.error || data.message || `Server error (${res.status})`;
        throw new Error(errorMsg);
      }
      return;
    }

    // 6. Success: update balance and show success receipt
    const newBalance = data.newBalance || 
                      data.balance || 
                      data.wallet_balance || 
                      data.new_balance || 
                      BALANCE;  // fallback to current if missing

    if (typeof newBalance === 'number' && !isNaN(newBalance)) {
      updateLocalBalance(newBalance);
      if (typeof window.updateAllBalances === 'function') {
        try {
          window.updateAllBalances(newBalance);
        } catch (e) {
          console.warn('[fxgTransfer] updateAllBalances failed', e);
        }
      }
    }

    updateReceiptToSuccess(payload, newBalance, data.reference || data.transaction_id || 'N/A');

  } catch (err) {
    console.error('[fxgTransfer] Transfer failed:', err);
    updateReceiptToFailed(payload, err.message || 'Transfer failed. Please try again.');
  } finally {
    // Restore UI buttons
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
    }
    if (cancelBtn) cancelBtn.disabled = false;
  }
}

  // ────────────────────────────────────────────────
  // Receipt modal functions (enhanced for smooth flow)
  // ────────────────────────────────────────────────
  function showProcessingReceipt(payload) {
    const backdrop = document.getElementById(RECEIPT_MODAL_ID);
    if (!backdrop) return console.error('[fxgTransfer] Receipt modal not found');

    // Use ModalManager for opening
    if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
      ModalManager.openModal('fxgReceiptModal');
    } else {
      backdrop.classList.remove('hidden');
      backdrop.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    }

    // Reset to processing
    const icon = document.getElementById('receipt-icon');
    if (icon) {
      icon.className = 'receipt-icon processing';
      icon.innerHTML = '<div class="spinner"></div>';
    }

    const statusEl = document.getElementById('receipt-status');
    if (statusEl) statusEl.textContent = 'Processing Transfer';

    const messageEl = document.getElementById('receipt-message');
    if (messageEl) messageEl.textContent = 'Please hold on while we process your transfer...';

    const detailsEl = document.getElementById('receipt-details');
    if (detailsEl) detailsEl.style.display = 'none';

    const actionsEl = document.getElementById('receipt-actions');
    if (actionsEl) actionsEl.style.display = 'none';

    // Store payload
    window._currentTransferPayload = payload;
  }

  function updateReceiptToSuccess(payload, newBalance, reference) {
    const icon = document.getElementById('receipt-icon');
    if (icon) {
      icon.className = 'receipt-icon success';
      icon.innerHTML = `
        <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
          <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
          <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
        </svg>
      `;
    }

    const statusEl = document.getElementById('receipt-status');
    if (statusEl) statusEl.textContent = 'Transfer Successful';

    const messageEl = document.getElementById('receipt-message');
    if (messageEl) messageEl.textContent = 'Your balance has been transferred successfully!';

    // Fill details
    const recipientEl = document.getElementById('receipt-recipient');
    if (recipientEl) recipientEl.textContent = `@${payload.recipient}`;

    const amountEl = document.getElementById('receipt-amount');
    if (amountEl) amountEl.textContent = `₦${fmt(payload.amount)}`;

    const balanceEl = document.getElementById('receipt-new-balance');
    if (balanceEl) balanceEl.textContent = `₦${fmt(newBalance)}`;

    const dateEl = document.getElementById('receipt-date');
    if (dateEl) dateEl.textContent = new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

    const refEl = document.getElementById('receipt-transaction-id');
    if (refEl) refEl.textContent = reference || 'N/A';

    const detailsEl = document.getElementById('receipt-details');
    if (detailsEl) detailsEl.style.display = 'block';

    const actionsEl = document.getElementById('receipt-actions');
    if (actionsEl) {
      actionsEl.style.display = 'flex';
      actionsEl.innerHTML = `
        <button id="receipt-done" style="flex:1; background:#333; color:white; border:none; border-radius:50px; padding:14px; font-weight:600;">
          Done
        </button>
      `;
      document.getElementById('receipt-done')?.addEventListener('click', () => {
        closeReceiptModal();
        resetTransferForm();
      });
    }
  }

  function updateReceiptToFailed(payload, errorMessage) {
    const icon = document.getElementById('receipt-icon');
    if (icon) {
      icon.className = 'receipt-icon failed';
      icon.innerHTML = `
        <svg class="cross" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
          <circle class="cross__circle" cx="26" cy="26" r="25" fill="none"/>
          <path class="cross__path" fill="none" d="M16 16 36 36"/>
          <path class="cross__path" fill="none" d="M16 36 36 16"/>
        </svg>
      `;
    }

    const statusEl = document.getElementById('receipt-status');
    if (statusEl) statusEl.textContent = 'Transfer Failed';

    const messageEl = document.getElementById('receipt-message');
    if (messageEl) messageEl.textContent = errorMessage;

    const detailsEl = document.getElementById('receipt-details');
    if (detailsEl) detailsEl.style.display = 'none';

    const actionsEl = document.getElementById('receipt-actions');
    if (actionsEl) {
      actionsEl.style.display = 'flex';
      actionsEl.innerHTML = `
        <button id="receipt-try-again" style="flex:1; background:linear-gradient(90deg,#00d4aa,#00bfa5); color:white; border:none; border-radius:50px; padding:14px; font-weight:600; margin-right:8px;">
          Try Again
        </button>
        <button id="receipt-done" style="flex:1; background:#333; color:white; border:none; border-radius:50px; padding:14px; font-weight:600;">
          Close
        </button>
      `;
      document.getElementById('receipt-try-again')?.addEventListener('click', () => {
        closeReceiptModal();
        openConfirmModal(payload);
      });
      document.getElementById('receipt-done')?.addEventListener('click', () => {
        closeReceiptModal();
        resetTransferForm();
      });
    }
  }

  function updateReceiptToInsufficient(message, currentBalance) {
    const icon = document.getElementById('receipt-icon');
    if (icon) {
      icon.className = 'receipt-icon failed';
      icon.innerHTML = `
        <svg class="cross" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
          <circle class="cross__circle" cx="26" cy="26" r="25" fill="none"/>
          <path class="cross__path" fill="none" d="M16 16 36 36"/>
          <path class="cross__path" fill="none" d="M16 36 36 16"/>
        </svg>
      `;
    }

    const statusEl = document.getElementById('receipt-status');
    if (statusEl) statusEl.textContent = 'Insufficient Balance';

    const messageEl = document.getElementById('receipt-message');
    if (messageEl) {
      messageEl.innerHTML = `
        ${message}<br><br>
        <strong>Current balance: ₦${fmt(currentBalance)}</strong><br><br>
        Please fund your wallet to complete this transfer.
      `;
    }

    const detailsEl = document.getElementById('receipt-details');
    if (detailsEl) detailsEl.style.display = 'none';

    const actionsEl = document.getElementById('receipt-actions');
    if (actionsEl) {
      actionsEl.style.display = 'flex';
      actionsEl.innerHTML = `
        <button id="receipt-fund-wallet" style="flex:1; background:linear-gradient(90deg,#00d4aa,#00bfa5); color:white; border:none; border-radius:50px; padding:14px; font-weight:600; margin-right:8px;">
          Fund Wallet
        </button>
        <button id="receipt-done" style="flex:1; background:#333; color:white; border:none; border-radius:50px; padding:14px; font-weight:600;">
          Close
        </button>
      `;
      document.getElementById('receipt-fund-wallet')?.addEventListener('click', () => {
        closeReceiptModal();
        if (window.ModalManager?.openModal) {
          window.ModalManager.openModal('addMoneyModal');
        }
      });
      document.getElementById('receipt-done')?.addEventListener('click', () => {
        closeReceiptModal();
        resetTransferForm();
      });
    }
  }

  function closeReceiptModal() {
    if (window.ModalManager && typeof window.ModalManager.forceCloseModal === 'function') {
      window.ModalManager.forceCloseModal('fxgReceiptModal');
    } else {
      const backdrop = document.getElementById(RECEIPT_MODAL_ID);
      if (backdrop) {
        backdrop.classList.add('hidden');
        backdrop.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
      }
    }
  }

  // Bind close events for receipt modal
  function bindReceiptModalEvents() {
    const wrapper = document.getElementById(RECEIPT_MODAL_ID);
    if (!wrapper || wrapper.dataset.eventsBound) return;

    const backdrop = wrapper.querySelector('.fxg-receipt-backdrop');

    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          closeReceiptModal();
        }
      });
    }

    wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeReceiptModal();
      }
    });

    wrapper.dataset.eventsBound = 'true';
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

      if (els.usernameErr) els.usernameErr.textContent = usernameOk || !username ? '' : 'Username too short';

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

        const formatted = raw ? Number(raw).toLocaleString('en-NG') : '';
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