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
  function fxgTransfer_resolveElements() {
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
  function fxgTransfer_initBalanceFromSources() {
    if (typeof window.currentDisplayedBalance === 'number' && !Number.isNaN(window.currentDisplayedBalance)) {
      BALANCE = Number(window.currentDisplayedBalance);
      fxgTransfer_persistBalance(BALANCE);
      return;
    }
    try {
      const userData = localStorage.getItem('userData');
      if (userData) {
        const parsed = JSON.parse(userData);
        if (parsed && typeof parsed.wallet_balance !== 'undefined') {
          BALANCE = Number(parsed.wallet_balance) || 0;
          fxgTransfer_persistBalance(BALANCE);
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

  function fxgTransfer_persistBalance(n) {
    try { localStorage.setItem(FXG_STORAGE_KEY, String(Number(n) || 0)); } catch (e) {}
  }

  function fxgTransfer_updateLocalBalance(n) {
    n = Number(n) || 0;
    BALANCE = n;
    fxgTransfer_persistBalance(n);
    const els = fxgTransfer_resolveElements();
    if (els.balanceEl) {
      els.balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
    }
  }

  function fxgTransfer_patchUpdateAllBalances() {
    try {
      if (!window.updateAllBalances || window.__fxg_updateAllBalances_patched) return;
      const original = window.updateAllBalances;
      window.updateAllBalances = function (newBalance, skipAnimation) {
        try {
          const res = original.apply(this, arguments);
          if (typeof newBalance !== 'undefined' && newBalance !== null) {
            fxgTransfer_updateLocalBalance(Number(newBalance) || 0);
          } else if (typeof window.currentDisplayedBalance === 'number') {
            fxgTransfer_updateLocalBalance(window.currentDisplayedBalance);
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

  function fxgTransfer_bindBalanceUpdateEvent() {
    if (fxgTransfer_bindBalanceUpdateEvent._bound) return;
    window.addEventListener('balance_update', (ev) => {
      try {
        if (ev?.detail?.balance !== undefined) {
          fxgTransfer_updateLocalBalance(Number(ev.detail.balance) || 0);
        }
      } catch (e) {}
    });
    fxgTransfer_bindBalanceUpdateEvent._bound = true;
  }

  function fxgTransfer_bindStorageEvents() {
    if (fxgTransfer_bindStorageEvents._bound) return;
    window.addEventListener('storage', (ev) => {
      if (!ev || ev.key !== 'userData' || !ev.newValue) return;
      try {
        const parsed = JSON.parse(ev.newValue);
        if (parsed?.wallet_balance !== undefined) {
          fxgTransfer_updateLocalBalance(Number(parsed.wallet_balance) || 0);
        }
      } catch (e) {}
    });
    fxgTransfer_bindStorageEvents._bound = true;
  }

  function fxgTransfer_refreshOnModalOpen() {
    fxgTransfer_initBalanceFromSources();
    const els = fxgTransfer_resolveElements();
    if (els.balanceEl) els.balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
  }

  // --- Modal open/close using ModalManager ---
  function fxgTransfer_openModal() {
    fxgTransfer_refreshOnModalOpen();
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
      const els = fxgTransfer_resolveElements();
      if (els.modal) {
        els.modal.classList.remove('hidden');
        els.modal.style.display = 'flex';
        els.modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
      }
    }
  }

  function fxgTransfer_closeModal() {
    if (window.ModalManager && typeof window.ModalManager.forceCloseModal === 'function') {
      window.ModalManager.forceCloseModal(MM_MODAL_ID);
    } else {
      // Fallback
      console.warn('[fxgTransfer] ModalManager not found — using basic fallback close');
      const els = fxgTransfer_resolveElements();
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
  function fxgTransfer_openConfirmModal(payload) {
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
      sendBtn.addEventListener('click', () => fxgTransfer_confirmSend(payload));
      sendBtn._fxg_confirm_bound = true;
    }
  }

  function fxgTransfer_closeConfirmModal() {
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
  function fxgTransfer_bindConfirmModalEvents() {
    const wrapper = document.getElementById('fxg-transfer-confirm-modal');
    if (!wrapper || wrapper.dataset.eventsBound) return;

    const backdrop = wrapper.querySelector('[data-fxg-confirm-close]');
    const closeBtn = wrapper.querySelector('.fxg-confirm-close');
    const cancelBtn = wrapper.querySelector('.fxg-confirm-cancel');

    const handler = (e) => {
      e.preventDefault();
      fxgTransfer_closeConfirmModal();
    };

    [backdrop, closeBtn, cancelBtn].forEach(el => {
      if (el) el.addEventListener('click', handler);
    });

    wrapper.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        fxgTransfer_closeConfirmModal();
      }
    });

    wrapper.dataset.eventsBound = 'true';
  }

  // --- GET shared JWT (session token) ---
  async function fxgTransfer_getSharedJWT() {
    // Attempts to fetch session token from /api/session (based on your console test).
    // Returns token string or null.
    try {
      const sessionRes = await fetch(`${API_BASE}/api/session`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (!sessionRes.ok) {
        console.error('[fxgTransfer] Failed to fetch session:', sessionRes.status);
        return null;
      }
      const sessionData = await sessionRes.json().catch(() => null);
      const token = sessionData?.token || sessionData?.accessToken || null;
      if (token) {
        console.debug('[fxgTransfer] Obtained token (len:', token.length, ')');
        return token;
      } else {
        console.warn('[fxgTransfer] No token present in session response', sessionData);
        return null;
      }
    } catch (err) {
      console.error('[fxgTransfer] getSharedJWT error', err);
      return null;
    }
  }

  // --- PIN verification using checkout modal (wired to your /api/verify-pin) ---
  async function fxgTransfer_verifyPinOrBiometric() {
    return new Promise((resolve) => {
      // Set up the callback that the PIN modal will call
      window._checkoutPinResolve = (result) => {
        try { 
          delete window._checkoutPinResolve; 
        } catch {}
        
        // Immediately hide the PIN modal
        if (typeof window.hideCheckoutPinModal === 'function') {
          window.hideCheckoutPinModal();
        }
        
        resolve(result);
      };

      // Show the PIN modal
      if (typeof window.showCheckoutPinModal === 'function') {
        // Small delay to ensure smooth transition from confirm modal to PIN modal
        requestAnimationFrame(() => {
          window.showCheckoutPinModal();
        });
      } else {
        console.error('[fxgTransfer] showCheckoutPinModal not available');
        resolve({ success: false, reason: 'modal_unavailable' });
      }
    }).then((modalResult) => {
      // modalResult should be { success: true, pinToken: '...' } or { success: true, biometricToken: '...' }
      if (!modalResult || modalResult.success !== true) {
        return { success: false, reason: modalResult?.reason || 'cancelled' };
      }

      // Extract token from modal result
      const token = modalResult.pinToken || modalResult.biometricToken || null;

      if (!token) {
        console.error('[fxgTransfer] Modal returned success but no token');
        return { success: false, reason: 'no_token' };
      }

      return {
        success: true,
        token: token
      };
    });
  }

  async function fxgTransfer_confirmSend(payload) {
    const wrapper = document.getElementById('fxg-transfer-confirm-modal');
    const sendBtn = document.getElementById('fxg-transfer-confirm-modal-send');
    const cancelBtn = wrapper?.querySelector('.fxg-confirm-cancel');

    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Verifying...';
    }
    if (cancelBtn) cancelBtn.disabled = true;

    try {
      // 1. Close confirm modal FIRST (before any async operations)
      fxgTransfer_closeConfirmModal();
      
      // Small delay to let confirm modal close animation finish
      await new Promise(resolve => setTimeout(resolve, 100));

      // 2. Fetch session JWT
      const sessionToken = await fxgTransfer_getSharedJWT();
      if (!sessionToken) {
        console.error('[fxgTransfer] Failed to obtain session token');
        fxgTransfer_showProcessingReceipt(payload);
        await new Promise(resolve => setTimeout(resolve, 200));
        fxgTransfer_updateReceiptToFailed(payload, 'Authentication token unavailable. Please log in again.');
        return;
      }

      // 3. Prompt for PIN/biometric and verify server-side
      // This will show the PIN modal immediately
      const verification = await fxgTransfer_verifyPinOrBiometric();
      
      if (!verification || !verification.success) {
        console.log('[fxgTransfer] PIN verification failed or cancelled:', verification?.reason || verification);
        // Don't show receipt for user cancellation
        if (verification?.reason === 'cancelled') {
          return;
        }
        fxgTransfer_showProcessingReceipt(payload);
        await new Promise(resolve => setTimeout(resolve, 200));
        fxgTransfer_updateReceiptToFailed(payload, 'Transfer cancelled during verification');
        return;
      }

      const pinVerifiedToken = verification.token;
      if (!pinVerifiedToken) {
        console.error('[fxgTransfer] verify-pin returned no token');
        fxgTransfer_showProcessingReceipt(payload);
        await new Promise(resolve => setTimeout(resolve, 200));
        fxgTransfer_updateReceiptToFailed(payload, 'Verification failed (no token)');
        return;
      }

      // 4. Show processing receipt IMMEDIATELY after PIN verification (before API call)
      fxgTransfer_showProcessingReceipt(payload);
      
      // Small delay to ensure processing state is visible
      await new Promise(resolve => setTimeout(resolve, 300));

      // 5. Make the transfer API call
      const res = await fetch(`${API_BASE}/api/wallet/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
          'X-PIN-TOKEN': pinVerifiedToken
        },
        body: JSON.stringify({
          recipient: payload.recipient,
          amount: payload.amount
        }),
        credentials: 'include'
      });

      // 6. Safe response handling
      let data = null;
      let rawText = null;
      try {
        rawText = await res.text();
        data = rawText ? JSON.parse(rawText) : null;
      } catch (parseErr) {
        console.warn('[fxgTransfer] Response not valid JSON:', rawText || '(empty)');
      }

      if (!res.ok) {
        const errorMsg = data?.error ||
                         data?.message ||
                         (rawText && rawText.length < 300 ? rawText : `Server error (${res.status})`);

        console.error('[fxgTransfer] API failed:', res.status, errorMsg);

        if (res.status === 401) {
          throw new Error('Session expired or unauthorized. Please log in again.');
        }

        if (errorMsg?.toLowerCase().includes('insufficient') ||
            data?.code === 'INSUFFICIENT_BALANCE') {
          fxgTransfer_updateReceiptToInsufficient('Insufficient balance for this transfer.', BALANCE);
        } else {
          throw new Error(errorMsg || 'Transfer failed');
        }
        return;
      }

      // 7. Success path
      const newBalance = data?.newBalance ||
                        data?.balance ||
                        data?.wallet_balance ||
                        data?.new_balance ||
                        BALANCE;

      if (typeof newBalance === 'number' && !isNaN(newBalance)) {
        fxgTransfer_updateLocalBalance(newBalance);
        if (typeof window.updateAllBalances === 'function') {
          try { window.updateAllBalances(newBalance); } catch (e) {}
        }
      }

      fxgTransfer_updateReceiptToSuccess(payload, newBalance, data?.reference || data?.transaction_id || 'N/A');

    } catch (err) {
      console.error('[fxgTransfer] Transfer failed:', err);
      fxgTransfer_updateReceiptToFailed(payload, err.message || 'Transfer failed. Please try again.');
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
      }
      if (cancelBtn) cancelBtn.disabled = false;
    }
  }

  function fxgTransfer_closeReceiptModal() {
    if (window.ModalManager?.closeModal) {
      window.ModalManager.closeModal('fxgReceiptModal');
    } else {
      console.warn('[fxgTransfer] ModalManager.closeModal not available for receipt');
    }
  }

  function fxgTransfer_resetTransferForm() {
    const els = fxgTransfer_resolveElements();
    if (els.usernameEl) els.usernameEl.value = '';
    if (els.amountEl) els.amountEl.value = '';
    if (els.continueBtn) {
      const text = els.continueBtn.querySelector('.fxg-btn-text') || els.continueBtn;
      text.textContent = 'Continue';
      els.continueBtn.disabled = true;
    }
    if (els.successEl) els.successEl.hidden = true;
    fxgTransfer_closeModal();  // Close main transfer modal
  }

  // ────────────────────────────────────────────────
  // Receipt modal functions
  // ────────────────────────────────────────────────
 function fxgTransfer_showProcessingReceipt(payload) {
  const modal = document.getElementById(RECEIPT_MODAL_ID);
  if (!modal) {
    console.error('[fxgTransfer] Receipt modal not found in DOM');
    return;
  }

  // Store payload
  window._currentTransferPayload = payload;

  // Open the modal FIRST using ModalManager
  if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
    // Close any other modals first (except receipt)
    const openModals = window.ModalManager.getOpenModals();
    openModals.forEach(id => {
      if (id !== 'fxgReceiptModal' && id !== 'fxg-transfer-receipt-modal') {
        window.ModalManager.closeModal(id);
      }
    });
    
    window.ModalManager.openModal('fxgReceiptModal');
  } else {
    // Fallback if ModalManager unavailable
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  // THEN: Set the processing state content (after modal is open)
  requestAnimationFrame(() => {
    const icon = document.getElementById('receipt-icon');
    if (icon) {
      icon.className = 'fxg-receipt-icon processing'; // Note: Add CSS for .processing if needed (e.g., animation)
      icon.innerHTML = '<div class="spinner"></div>'; // Add CSS for .spinner (e.g., rotating loader)
    } else {
      console.warn('[fxgTransfer] Missing receipt-icon element');
    }
    
    modal.classList.add('show');

    const statusEl = document.getElementById('receipt-status');
    if (statusEl) statusEl.textContent = 'Processing Transfer';
    else console.warn('[fxgTransfer] Missing receipt-status element');

    const messageEl = document.getElementById('receipt-message');
    if (messageEl) {
      messageEl.className = 'fxg-receipt-note'; // Neutral class
      messageEl.innerHTML = `
        Transferring <strong>₦${fmt(payload.amount)}</strong> to <strong>@${payload.recipient}</strong>...<br><br>
        Please hold on while we process your transfer.
      `;
    } else console.warn('[fxgTransfer] Missing receipt-message element');

    const detailsEl = document.getElementById('receipt-details');
    if (detailsEl) detailsEl.style.display = 'none';
    else console.warn('[fxgTransfer] Missing receipt-details element');

    const actionsEl = document.getElementById('receipt-actions');
    if (actionsEl) actionsEl.style.display = 'none';
    else console.warn('[fxgTransfer] Missing receipt-actions element');
  });
}

window.fxgTransfer_updateReceiptToSuccess = fxgTransfer_updateReceiptToSuccess;
window.fxgTransfer_updateReceiptToFailed = fxgTransfer_updateReceiptToFailed;
window.fxgTransfer_updateReceiptToInsufficient = fxgTransfer_updateReceiptToInsufficient;
window.fxgTransfer_showProcessingReceipt = fxgTransfer_showProcessingReceipt;

function fxgTransfer_updateReceiptToSuccess(payload, newBalance, reference) {
  const icon = document.getElementById('receipt-icon');
  if (icon) {
    icon.className = 'fxg-receipt-icon success';
    icon.innerHTML = `
      <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
        <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
        <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
      </svg>
    `;
  } else console.warn('[fxgTransfer] Missing receipt-icon element');

  const statusEl = document.getElementById('receipt-status');
  if (statusEl) statusEl.textContent = 'Transfer Successful';
  else console.warn('[fxgTransfer] Missing receipt-status element');

  const messageEl = document.getElementById('receipt-message');
  if (messageEl) {
    messageEl.className = 'fxg-receipt-note'; // Neutral class for success
    messageEl.textContent = 'Your balance has been transferred successfully!';
  } else console.warn('[fxgTransfer] Missing receipt-message element');

  // Fill details
  const recipientEl = document.getElementById('receipt-recipient');
  if (recipientEl) recipientEl.textContent = `@${payload.recipient}`;

  const amountEl = document.getElementById('receipt-amount');
  if (amountEl) amountEl.textContent = `₦${fmt(payload.amount)}`;

  const balanceEl = document.getElementById('receipt-new-balance');
  if (balanceEl) balanceEl.textContent = `₦${fmt(newBalance)}`;

  const dateEl = document.getElementById('receipt-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

  // Removed refEl since no #receipt-transaction-id; add row to HTML if needed: <div class="fxg-receipt-row"><span class="label">Transaction ID</span><span class="value" id="receipt-transaction-id">N/A</span></div>

  const detailsEl = document.getElementById('receipt-details');
  if (detailsEl) detailsEl.style.display = 'block';
  else console.warn('[fxgTransfer] Missing receipt-details element');

  const actionsEl = document.getElementById('receipt-actions');
  if (actionsEl) {
    actionsEl.style.display = 'flex';
    actionsEl.innerHTML = `
      <button id="receipt-done" style="flex:1; background:#333; color:white; border:none; border-radius:50px; padding:14px; font-weight:600;">
        Done
      </button>
    `;
    document.getElementById('receipt-done')?.addEventListener('click', () => {
      fxgTransfer_closeReceiptModal();
      fxgTransfer_resetTransferForm();
    });
  } else console.warn('[fxgTransfer] Missing receipt-actions element');
}

function fxgTransfer_updateReceiptToFailed(payload, errorMessage) {
  const icon = document.getElementById('receipt-icon');
  if (icon) {
    icon.className = 'fxg-receipt-icon failed';
    icon.innerHTML = `
      <svg class="cross" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
        <circle class="cross__circle" cx="26" cy="26" r="25" fill="none"/>
        <path class="cross__path" fill="none" d="M16 16 36 36"/>
        <path class="cross__path" fill="none" d="M16 36 36 16"/>
      </svg>
    `;
  } else console.warn('[fxgTransfer] Missing receipt-icon element');

  const statusEl = document.getElementById('receipt-status');
  if (statusEl) statusEl.textContent = 'Transfer Failed';
  else console.warn('[fxgTransfer] Missing receipt-status element');

  const messageEl = document.getElementById('receipt-message');
  if (messageEl) {
    messageEl.className = 'fxg-receipt-error'; // Error class for failed
    messageEl.textContent = errorMessage;
  } else console.warn('[fxgTransfer] Missing receipt-message element');

  // Optionally fill shared details for context in failed
  const recipientEl = document.getElementById('receipt-recipient');
  if (recipientEl) recipientEl.textContent = `@${payload.recipient}`;

  const amountEl = document.getElementById('receipt-amount');
  if (amountEl) amountEl.textContent = `₦${fmt(payload.amount)}`;

  const detailsEl = document.getElementById('receipt-details');
  if (detailsEl) detailsEl.style.display = 'none'; // Hide details in failed (or set to 'block' if you want partial details)
  else console.warn('[fxgTransfer] Missing receipt-details element');

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
      fxgTransfer_closeReceiptModal();
      fxgTransfer_openConfirmModal(payload);
    });
    document.getElementById('receipt-done')?.addEventListener('click', () => {
      fxgTransfer_closeReceiptModal();
      fxgTransfer_resetTransferForm();
    });
  } else console.warn('[fxgTransfer] Missing receipt-actions element');
}

function fxgTransfer_updateReceiptToInsufficient(message, currentBalance) {
  const icon = document.getElementById('receipt-icon');
  if (icon) {
    icon.className = 'fxg-receipt-icon failed';
    icon.innerHTML = `
      <svg class="cross" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
        <circle class="cross__circle" cx="26" cy="26" r="25" fill="none"/>
        <path class="cross__path" fill="none" d="M16 16 36 36"/>
        <path class="cross__path" fill="none" d="M16 36 36 16"/>
      </svg>
    `;
  } else console.warn('[fxgTransfer] Missing receipt-icon element');

  const statusEl = document.getElementById('receipt-status');
  if (statusEl) statusEl.textContent = 'Insufficient Balance';
  else console.warn('[fxgTransfer] Missing receipt-status element');

  const messageEl = document.getElementById('receipt-message');
  if (messageEl) {
    messageEl.className = 'fxg-receipt-error'; // Error class
    messageEl.innerHTML = `
      ${message}<br><br>
      <strong>Current balance: ₦${fmt(currentBalance)}</strong><br><br>
      Please fund your wallet to complete this transfer.
    `;
  } else console.warn('[fxgTransfer] Missing receipt-message element');

  // Optionally fill shared details
  const recipientEl = document.getElementById('receipt-recipient');
  if (recipientEl) recipientEl.textContent = `@${payload.recipient}`; // Assuming payload is available; adjust if needed

  const amountEl = document.getElementById('receipt-amount');
  if (amountEl) amountEl.textContent = `₦${fmt(payload.amount)}`; // Assuming payload

  const detailsEl = document.getElementById('receipt-details');
  if (detailsEl) detailsEl.style.display = 'none';
  else console.warn('[fxgTransfer] Missing receipt-details element');

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
      fxgTransfer_closeReceiptModal();
      if (window.ModalManager?.openModal) {
        window.ModalManager.openModal('addMoneyModal');
      }
    });
    document.getElementById('receipt-done')?.addEventListener('click', () => {
      fxgTransfer_closeReceiptModal();
      fxgTransfer_resetTransferForm();
    });
  } else console.warn('[fxgTransfer] Missing receipt-actions element');
}

  window.fxgTransfer_updateReceiptToSuccess = fxgTransfer_updateReceiptToSuccess;
  window.fxgTransfer_updateReceiptToFailed = fxgTransfer_updateReceiptToFailed;
  window.fxgTransfer_updateReceiptToInsufficient = fxgTransfer_updateReceiptToInsufficient;
  window.fxgTransfer_showProcessingReceipt = fxgTransfer_showProcessingReceipt;

  function fxgTransfer_updateReceiptToSuccess(payload, newBalance, reference) {
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
        fxgTransfer_closeReceiptModal();
        fxgTransfer_resetTransferForm();
      });
    }
  }

  function fxgTransfer_updateReceiptToFailed(payload, errorMessage) {
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
        fxgTransfer_closeReceiptModal();
        fxgTransfer_openConfirmModal(payload);
      });
      document.getElementById('receipt-done')?.addEventListener('click', () => {
        fxgTransfer_closeReceiptModal();
        fxgTransfer_resetTransferForm();
      });
    }
  }

  function fxgTransfer_updateReceiptToInsufficient(message, currentBalance) {
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
        fxgTransfer_closeReceiptModal();
        if (window.ModalManager?.openModal) {
          window.ModalManager.openModal('addMoneyModal');
        }
      });
      document.getElementById('receipt-done')?.addEventListener('click', () => {
        fxgTransfer_closeReceiptModal();
        fxgTransfer_resetTransferForm();
      });
    }
  }

  // Bind close events for receipt modal
  function fxgTransfer_bindReceiptModalEvents() {
    const wrapper = document.getElementById(RECEIPT_MODAL_ID);
    if (!wrapper || wrapper.dataset.eventsBound) return;

    const backdrop = wrapper.querySelector('.fxg-receipt-backdrop');

    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          fxgTransfer_closeReceiptModal();
        }
      });
    }

    wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        fxgTransfer_closeReceiptModal();
      }
    });

    wrapper.dataset.eventsBound = 'true';
  }

  // --- Main UI init ---
  function fxgTransfer_initUI() {
    const els = fxgTransfer_resolveElements();
    if (!els.modal) {
      console.warn('[fxgTransfer] Transfer modal element not found');
      return;
    }

    // Bind trigger
    if (els.trigger && !els.trigger._fxg_bound) {
      els.trigger.addEventListener('click', e => {
        e.preventDefault();
        fxgTransfer_openModal();
      });
      els.trigger._fxg_bound = true;
    }

    // Bind close
    if (els.closeBtn && !els.closeBtn._fxg_bound) {
      els.closeBtn.addEventListener('click', e => {
        e.preventDefault();
        fxgTransfer_closeModal();
      });
      els.closeBtn._fxg_bound = true;
    }

    if (els.backdrop && !els.backdrop._fxg_bound) {
      els.backdrop.addEventListener('click', e => {
        if (e.target === els.backdrop) fxgTransfer_closeModal();
      });
      els.backdrop._fxg_bound = true;
    }

    // Validation
    function fxgTransfer_validate() {
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
        fxgTransfer_validate();
      });
      els.amountEl._fxg_bound = true;
    }

    if (els.usernameEl && !els.usernameEl._fxg_bound) {
      els.usernameEl.addEventListener('input', fxgTransfer_validate);
      els.usernameEl._fxg_bound = true;
    }

    // Form submit
    if (els.form && !els.form._fxg_bound) {
      els.form.addEventListener('submit', ev => {
        ev.preventDefault();
        if (!fxgTransfer_validate()) return;

        const payload = {
          recipient: (els.usernameEl.value || '').trim(),
          amount: Number(onlyDigits(els.amountEl.value)),
          timestamp: new Date().toISOString()
        };

        fxgTransfer_openConfirmModal(payload);
      });
      els.form._fxg_bound = true;
    }

    // Reset on modal open
    window.addEventListener('modalOpened', ev => {
      if (ev?.detail === 'fxgTransferModal') {
        fxgTransfer_refreshOnModalOpen();
        const els = fxgTransfer_resolveElements();
        if (els.successEl) els.successEl.hidden = true;
        fxgTransfer_validate();
      }
    });

    // Bind events
    fxgTransfer_bindConfirmModalEvents();
    fxgTransfer_bindReceiptModalEvents();
  }

  // Bootstrap
  function fxgTransfer_bootstrap() {
    fxgTransfer_initBalanceFromSources();
    fxgTransfer_patchUpdateAllBalances();
    fxgTransfer_bindBalanceUpdateEvent();
    fxgTransfer_bindStorageEvents();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(fxgTransfer_initUI, 80));
    } else {
      setTimeout(fxgTransfer_initUI, 80);
    }

    setTimeout(() => {
      const be = $('fxg-balance');
      if (be) be.textContent = `Balance: ₦${fmt(BALANCE)}`;
    }, 600);
  }

  fxgTransfer_bootstrap();

  // Debug helpers (preserves your console IIFE as a callable function)
  window.fxgTransfer = window.fxgTransfer || {};
  window.fxgTransfer.getBalance = () => BALANCE;
  window.fxgTransfer.setBalance = v => {
    fxgTransfer_updateLocalBalance(Number(v) || 0);
    if (typeof window.updateAllBalances === 'function') {
      try { window.updateAllBalances(BALANCE); } catch {}
    }
  };

  // original console tester now available as a helper:
  window.fxgTransfer.runConsoleTest = async function runConsoleTest({ recipient = 'Enitan', amount = 200000 } = {}) {
    try {
      console.log('%c=== Starting Transfer Test ===', 'color: cyan; font-weight: bold; font-size: 16px;');

      // Step 1: Get fresh session + token
      console.log('Fetching session token...');
      const sessionToken = await fxgTransfer_getSharedJWT();
      if (!sessionToken) {
        console.error('No session token found');
        return;
      }
      console.log('✅ Got fresh session token (length:', sessionToken.length, ')');

      // Step 2: Prepare transfer payload
      const payload = { recipient, amount };
      console.log('Sending transfer with payload:', payload);

      // Step 3: Trigger PIN modal and verify on server
      const verification = await fxgTransfer_verifyPinOrBiometric({ sessionToken, payload });
      if (!verification?.success) {
        console.error('Verification failed:', verification?.reason || verification);
        return;
      }
      console.log('Received pin-verified token (len):', (verification.token || '').length);

      // Step 4: Call the transfer endpoint with the pin-verified JWT
      const transferRes = await fetch(`${API_BASE}/api/wallet/transfer`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${verification.token}`
        },
        body: JSON.stringify(payload)
      });

      console.log('Transfer response status:', transferRes.status);

      let transferText = await transferRes.text();
      console.log('Raw response body:', transferText);

      let transferData = null;
      try {
        transferData = JSON.parse(transferText);
        console.log('Parsed response:', transferData);
      } catch (e) {
        console.warn('Response was not valid JSON');
      }

      if (transferRes.ok) {
        console.log('%cTRANSFER SUCCESS!', 'color: lime; font-size: 18px; font-weight: bold');
        console.log('Result:', transferData);
        if (transferData?.newBalance && typeof window.updateAllBalances === 'function') {
          window.updateAllBalances(transferData.newBalance);
          console.log('Balance UI refreshed');
        }
      } else {
        console.error('%cTRANSFER FAILED', 'color: red; font-size: 18px; font-weight: bold');
        console.error('Error message:', transferData?.error || transferText || 'Unknown');
      }

    } catch (err) {
      console.error('%cTest crashed:', 'color: orange; font-weight: bold', err);
    } finally {
      console.log('%c=== Test Finished ===', 'color: cyan; font-weight: bold;');
    }
  };

})();