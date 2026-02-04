/* transferBalance.js - Production-ready balance transfer handler
   Handles transfer modal display, PIN verification, and recipient transfers
   Integrates with dashboard.js for user state and checkout.js for PIN verification
*/

console.log('[transfer] Module loaded 💸');

'use strict';

// ==================== CONSTANTS ====================
const MM_MODAL_ID = 'fxgTransferModal';
const DOM_MODAL_ID = 'fxg-transfer-modal';
const CONFIRM_MODAL_ID = 'fxg-transfer-confirm-modal';
const RECEIPT_MODAL_ID = 'fxgReceiptModal';
const FXG_STORAGE_KEY = 'fxgUserBalance';
const API_BASE = window.__SEC_API_BASE || 'https://api.flexgig.com.ng';

// ==================== STATE ====================
let currentTransferData = null;
let BALANCE = 0;

// ==================== HELPERS ====================
const onlyDigits = s => (s || '').toString().replace(/[^\d]/g, '');
const fmt = n => (Number(n) || 0).toLocaleString('en-US');
const $ = id => document.getElementById(id);

// ==================== BALANCE MANAGEMENT ====================
function getAvailableBalance() {
  // Try multiple sources in priority order
  
  // 1. Check dashboard balance element (most reliable)
  const balanceReal = document.querySelector('.balance-real');
  if (balanceReal && balanceReal.textContent) {
    const bal = parseFloat(balanceReal.textContent.replace(/[₦,\s]/g, ''));
    if (!isNaN(bal) && bal >= 0) {
      console.log('[transfer] Balance from .balance-real:', bal);
      return bal;
    }
  }

  // 2. Check window.currentDisplayedBalance
  if (typeof window.currentDisplayedBalance === 'number' && !isNaN(window.currentDisplayedBalance)) {
    console.log('[transfer] Balance from window.currentDisplayedBalance:', window.currentDisplayedBalance);
    return window.currentDisplayedBalance;
  }

  // 3. Check getUserState function
  if (typeof window.getUserState === 'function') {
    try {
      const state = window.getUserState();
      if (state && typeof state.balance !== 'undefined') {
        const bal = parseFloat(state.balance);
        if (!isNaN(bal) && bal >= 0) {
          console.log('[transfer] Balance from getUserState:', bal);
          return bal;
        }
      }
    } catch (e) {
      console.warn('[transfer] getUserState error:', e);
    }
  }

  // 4. Check localStorage userState
  try {
    const userState = localStorage.getItem('userState');
    if (userState) {
      const parsed = JSON.parse(userState);
      if (parsed && typeof parsed.balance !== 'undefined') {
        const bal = parseFloat(parsed.balance);
        if (!isNaN(bal) && bal >= 0) {
          console.log('[transfer] Balance from localStorage userState:', bal);
          return bal;
        }
      }
    }
  } catch (e) {
    console.warn('[transfer] localStorage userState error:', e);
  }

  // 5. Check localStorage userData
  try {
    const userData = localStorage.getItem('userData');
    if (userData) {
      const parsed = JSON.parse(userData);
      if (parsed && typeof parsed.wallet_balance !== 'undefined') {
        const bal = parseFloat(parsed.wallet_balance);
        if (!isNaN(bal) && bal >= 0) {
          console.log('[transfer] Balance from localStorage userData:', bal);
          return bal;
        }
      }
    }
  } catch (e) {
    console.warn('[transfer] localStorage userData error:', e);
  }

  // 6. Fallback to stored FXG balance
  try {
    const stored = localStorage.getItem(FXG_STORAGE_KEY);
    if (stored !== null) {
      const bal = parseFloat(stored);
      if (!isNaN(bal) && bal >= 0) {
        console.log('[transfer] Balance from FXG storage:', bal);
        return bal;
      }
    }
  } catch (e) {
    console.warn('[transfer] FXG storage error:', e);
  }

  console.warn('[transfer] No balance found, defaulting to 0');
  return 0;
}

function initBalanceFromSources() {
  BALANCE = getAvailableBalance();
  persistFxgBalance(BALANCE);
  console.log('[transfer] ✓ Balance initialized:', BALANCE);
}

function persistFxgBalance(n) {
  try {
    localStorage.setItem(FXG_STORAGE_KEY, String(Number(n) || 0));
  } catch (e) {
    console.warn('[transfer] Failed to persist balance:', e);
  }
}

function updateLocalBalance(n) {
  n = Number(n) || 0;
  BALANCE = n;
  persistFxgBalance(n);

  const balanceEl = $('fxg-balance');
  if (balanceEl) {
    balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
  }

  console.log('[transfer] Balance updated to:', BALANCE);
}

function refreshBalanceOnModalOpen() {
  console.log('[transfer] Refreshing balance on modal open');
  
  // Get fresh balance from all sources
  BALANCE = getAvailableBalance();
  persistFxgBalance(BALANCE);

  // Update display
  const balanceEl = $('fxg-balance');
  if (balanceEl) {
    balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
    console.log('[transfer] ✓ Balance display updated:', balanceEl.textContent);
  } else {
    console.warn('[transfer] Balance element not found');
  }
}

// ==================== BALANCE SYNC PATCHES ====================
function patchUpdateAllBalances() {
  try {
    if (!window.updateAllBalances || window.__fxg_updateAllBalances_patched) return;

    const original = window.updateAllBalances;
    window.updateAllBalances = function (newBalance, skipAnimation) {
      try {
        const res = original.apply(this, arguments);
        if (typeof newBalance !== 'undefined' && newBalance !== null) {
          const bal = Number(newBalance) || 0;
          updateLocalBalance(bal);
          console.log('[transfer] Balance synced via updateAllBalances:', bal);
        } else if (typeof window.currentDisplayedBalance === 'number') {
          updateLocalBalance(window.currentDisplayedBalance);
        }
        return res;
      } catch (e) {
        console.warn('[transfer] Patched updateAllBalances error:', e);
        try {
          return original.apply(this, arguments);
        } catch (err) {
          console.error('[transfer] Original updateAllBalances failed:', err);
        }
      }
    };

    window.__fxg_updateAllBalances_patched = true;
    console.log('[transfer] ✓ Patched window.updateAllBalances');
  } catch (e) {
    console.warn('[transfer] Failed to patch updateAllBalances:', e);
  }
}

function bindBalanceUpdateEvent() {
  if (bindBalanceUpdateEvent._bound) return;

  window.addEventListener('balance_update', (ev) => {
    try {
      if (ev?.detail?.balance !== undefined) {
        const bal = Number(ev.detail.balance) || 0;
        updateLocalBalance(bal);
        console.log('[transfer] Balance synced via event:', bal);
      }
    } catch (e) {
      console.warn('[transfer] balance_update event error:', e);
    }
  });

  bindBalanceUpdateEvent._bound = true;
  console.log('[transfer] ✓ Bound balance_update event');
}

function bindStorageEvents() {
  if (bindStorageEvents._bound) return;

  window.addEventListener('storage', (ev) => {
    if (!ev || !ev.newValue) return;
    
    try {
      if (ev.key === 'userData') {
        const parsed = JSON.parse(ev.newValue);
        if (parsed?.wallet_balance !== undefined) {
          const bal = Number(parsed.wallet_balance) || 0;
          updateLocalBalance(bal);
          console.log('[transfer] Balance synced via storage (userData):', bal);
        }
      } else if (ev.key === 'userState') {
        const parsed = JSON.parse(ev.newValue);
        if (parsed?.balance !== undefined) {
          const bal = Number(parsed.balance) || 0;
          updateLocalBalance(bal);
          console.log('[transfer] Balance synced via storage (userState):', bal);
        }
      }
    } catch (e) {
      console.warn('[transfer] storage event error:', e);
    }
  });

  bindStorageEvents._bound = true;
  console.log('[transfer] ✓ Bound storage events');
}

// ==================== MAIN TRANSFER MODAL ====================
function openTransferModal() {
  console.log('[transfer] Opening main modal');

  // CRITICAL: Refresh balance before opening
  refreshBalanceOnModalOpen();

  if (window.ModalManager?.openModal) {
    window.ModalManager.openModal(MM_MODAL_ID);
    console.log('[transfer] ✓ Opened via ModalManager');
  } else {
    console.warn('[transfer] ModalManager not available, using fallback');
    const modal = $(DOM_MODAL_ID);
    if (modal) {
      modal.style.display = 'flex';
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    }
  }

  // Reset form state
  validateTransferForm();
}

function closeTransferModal() {
  console.log('[transfer] Closing main modal');

  if (window.ModalManager?.closeModal) {
    window.ModalManager.closeModal(MM_MODAL_ID);
  } else {
    console.warn('[transfer] ModalManager not available, using fallback');
    const modal = $(DOM_MODAL_ID);
    if (modal) {
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      setTimeout(() => {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
      }, 300);
    }
  }

  currentTransferData = null;
}

// ==================== FORM VALIDATION ====================
function validateTransferForm() {
  const usernameEl = $('fxg-username');
  const amountEl = $('fxg-amount');
  const continueBtn = $('fxg-continue');
  const usernameErr = $('fxg-username-error');
  const amountErr = $('fxg-amount-error');

  if (!usernameEl || !amountEl || !continueBtn) return false;

  const username = (usernameEl.value || '').trim();
  const raw = onlyDigits(amountEl.value);
  const amt = Number(raw);

  // Refresh balance from live sources during validation
  const currentBalance = getAvailableBalance();
  if (currentBalance !== BALANCE) {
    BALANCE = currentBalance;
    const balanceEl = $('fxg-balance');
    if (balanceEl) {
      balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
    }
  }

  // Username validation
  const usernameOk = username.length >= 2;
  if (usernameErr) {
    usernameErr.textContent = usernameOk || !username ? '' : 'Username must be at least 2 characters';
  }

  // Amount validation
  const amountOk = raw.length > 0 && amt > 0 && amt <= BALANCE;
  if (amountErr) {
    if (!raw) {
      amountErr.textContent = '';
    } else if (amt <= 0) {
      amountErr.textContent = 'Amount must be greater than 0';
    } else if (amt > BALANCE) {
      amountErr.textContent = `Insufficient balance. Max: ₦${fmt(BALANCE)}`;
    } else {
      amountErr.textContent = '';
    }
  }

  const valid = usernameOk && amountOk;
  continueBtn.disabled = !valid;

  return valid;
}

function resetTransferForm() {
  console.log('[transfer] Resetting form');

  const usernameEl = $('fxg-username');
  const amountEl = $('fxg-amount');
  const continueBtn = $('fxg-continue');
  const usernameErr = $('fxg-username-error');
  const amountErr = $('fxg-amount-error');

  if (usernameEl) usernameEl.value = '';
  if (amountEl) amountEl.value = '';
  if (continueBtn) {
    const text = continueBtn.querySelector('.fxg-btn-text') || continueBtn;
    text.textContent = 'Continue';
    continueBtn.disabled = true;
  }
  if (usernameErr) usernameErr.textContent = '';
  if (amountErr) amountErr.textContent = '';

  currentTransferData = null;
}

// ==================== CONFIRM MODAL ====================
function openConfirmModal(payload) {
  console.log('[transfer] Opening confirm modal with payload:', payload);

  currentTransferData = payload;

  // Populate confirm modal
  const amountEl = $('fxg-transfer-confirm-modal-amount');
  const recipientEl = $('fxg-transfer-confirm-modal-recipient');

  if (amountEl) amountEl.textContent = `₦${fmt(payload.amount)}`;
  if (recipientEl) recipientEl.textContent = `@${payload.recipient}`;

  // Clear any previous error
  const errNode = $('fxg-confirm-error');
  if (errNode) errNode.textContent = '';

  if (window.ModalManager?.openModal) {
    window.ModalManager.openModal(CONFIRM_MODAL_ID);
    console.log('[transfer] ✓ Confirm modal opened via ModalManager');
  } else {
    console.warn('[transfer] ModalManager not available for confirm modal');
    const wrapper = $(CONFIRM_MODAL_ID);
    if (wrapper) {
      wrapper.style.display = 'flex';
      wrapper.classList.add('show');
      wrapper.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    }
  }
}

function closeConfirmModal() {
  console.log('[transfer] Closing confirm modal');

  if (window.ModalManager?.closeModal) {
    window.ModalManager.closeModal(CONFIRM_MODAL_ID);
  } else {
    console.warn('[transfer] ModalManager not available for confirm close');
    const wrapper = $(CONFIRM_MODAL_ID);
    if (wrapper) {
      wrapper.classList.remove('show');
      wrapper.setAttribute('aria-hidden', 'true');
      setTimeout(() => {
        wrapper.style.display = 'none';
        document.body.classList.remove('modal-open');
      }, 300);
    }
  }
}

// ==================== PIN VERIFICATION ====================
async function verifyPinOrBiometric() {
  console.log('[transfer] Requesting PIN verification');

  return new Promise((resolve) => {
    window._checkoutPinResolve = (success) => {
      delete window._checkoutPinResolve;
      console.log('[transfer] PIN verification result:', success);
      resolve(success);
    };

    if (typeof window.showCheckoutPinModal === 'function') {
      window.showCheckoutPinModal();
    } else {
      console.error('[transfer] showCheckoutPinModal not available');
      showToast('PIN verification unavailable. Please reload the page.', 'error');
      resolve(false);
    }
  });
}

// ==================== TRANSFER PROCESSING ====================
async function confirmSend(payload) {
  console.log('[transfer] Processing transfer:', payload);

  const wrapper = $(CONFIRM_MODAL_ID);
  const sendBtn = $('fxg-transfer-confirm-modal-send');
  const cancelBtn = wrapper?.querySelector('.fxg-confirm-cancel');

  // Disable buttons
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = 'Verifying...';
  }
  if (cancelBtn) cancelBtn.disabled = true;

  try {
    // 1. Close confirm modal
    closeConfirmModal();

    // 2. Verify PIN
    const authSuccess = await verifyPinOrBiometric();
    if (!authSuccess) {
      console.log('[transfer] PIN verification failed or cancelled');
      showTransferReceipt(false, payload, 'Transfer cancelled during verification');
      return;
    }

    // 3. Get auth token
    if (!window.supabaseClient) {
      throw new Error('Authentication not available. Please reload the page.');
    }

    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      throw new Error('No authentication token. Please login again.');
    }

    console.log('[transfer] Sending transfer request to API');

    // 4. Call transfer API
    const res = await fetch(`${API_BASE}/api/wallet/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      credentials: 'include',
      body: JSON.stringify({
        recipient: payload.recipient,
        amount: payload.amount
      })
    });

    const data = await res.json();

    if (!res.ok) {
      // Handle specific error cases
      if (data.error === 'insufficient_balance') {
        throw new Error(`Insufficient balance. Current: ₦${fmt(data.current_balance || BALANCE)}`);
      }
      if (data.error === 'recipient_not_found') {
        throw new Error(`User @${payload.recipient} not found`);
      }
      throw new Error(data.error || data.message || 'Transfer failed');
    }

    console.log('[transfer] Transfer successful:', data);

    // 5. Update balance
    const newBalance = data.newBalance || data.new_balance;
    if (typeof newBalance !== 'undefined') {
      updateLocalBalance(newBalance);

      // Also update global balance if function exists
      if (typeof window.updateAllBalances === 'function') {
        try {
          window.updateAllBalances(newBalance);
        } catch (e) {
          console.warn('[transfer] Failed to call updateAllBalances:', e);
        }
      }
    }

    // 6. Show success receipt
    showTransferReceipt(true, payload, newBalance, data.reference);

  } catch (err) {
    console.error('[transfer] Transfer failed:', err);
    showTransferReceipt(false, payload, err.message || 'Transfer failed. Please try again.');
  } finally {
    // Re-enable buttons (in case modal is still open)
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send Money';
    }
    if (cancelBtn) cancelBtn.disabled = false;
  }
}

// ==================== RECEIPT MODAL ====================
function showTransferReceipt(isSuccess, payload, balanceOrError, reference) {
  console.log('[transfer] Showing receipt:', { isSuccess, payload, balanceOrError, reference });

  const modal = $(RECEIPT_MODAL_ID);
  if (!modal) {
    console.error('[transfer] Receipt modal not found');
    return;
  }

  const successDiv = $('fxg-receipt-success');
  const failedDiv = $('fxg-receipt-failed');

  if (isSuccess) {
    // Success state
    if (failedDiv) failedDiv.style.display = 'none';
    if (successDiv) successDiv.style.display = 'block';

    const recipientEl = $('receipt-recipient');
    const amountEl = $('receipt-amount');
    const newBalanceEl = $('receipt-new-balance');
    const dateEl = $('receipt-date');
    const referenceEl = $('receipt-reference');

    if (recipientEl) recipientEl.textContent = `@${payload.recipient}`;
    if (amountEl) amountEl.textContent = `₦${fmt(payload.amount)}`;
    if (newBalanceEl) newBalanceEl.textContent = `₦${fmt(balanceOrError)}`;
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleString('en-NG', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
    }
    if (referenceEl && reference) {
      referenceEl.textContent = reference;
    }

    // Bind done button
    const doneBtn = $('receipt-done-btn');
    if (doneBtn && !doneBtn._transfer_bound) {
      doneBtn.addEventListener('click', () => {
        closeReceiptModal();
        resetTransferForm();
        closeTransferModal();
      });
      doneBtn._transfer_bound = true;
    }

  } else {
    // Failed state
    if (successDiv) successDiv.style.display = 'none';
    if (failedDiv) failedDiv.style.display = 'block';

    const errorMsgEl = $('receipt-error-message');
    const failedRecipientEl = $('receipt-failed-recipient');
    const failedAmountEl = $('receipt-failed-amount');

    if (errorMsgEl) errorMsgEl.textContent = balanceOrError || 'Transfer failed. Please try again.';
    if (failedRecipientEl) failedRecipientEl.textContent = `@${payload.recipient}`;
    if (failedAmountEl) failedAmountEl.textContent = `₦${fmt(payload.amount)}`;

    // Bind try again button
    const tryAgainBtn = $('receipt-try-again-btn');
    if (tryAgainBtn && !tryAgainBtn._transfer_bound) {
      tryAgainBtn.addEventListener('click', () => {
        closeReceiptModal();
        openConfirmModal(payload);
      });
      tryAgainBtn._transfer_bound = true;
    }

    // Bind close button
    const closeBtn = $('receipt-close-btn');
    if (closeBtn && !closeBtn._transfer_bound) {
      closeBtn.addEventListener('click', () => {
        closeReceiptModal();
        resetTransferForm();
        closeTransferModal();
      });
      closeBtn._transfer_bound = true;
    }
  }

  // Open receipt modal via ModalManager
  if (window.ModalManager?.openModal) {
    window.ModalManager.openModal(RECEIPT_MODAL_ID);
    console.log('[transfer] ✓ Receipt modal opened via ModalManager');
  } else {
    console.warn('[transfer] ModalManager not available for receipt');
    modal.style.display = 'flex';
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }
}

function closeReceiptModal() {
  console.log('[transfer] Closing receipt modal');

  if (window.ModalManager?.closeModal) {
    window.ModalManager.closeModal(RECEIPT_MODAL_ID);
  } else {
    console.warn('[transfer] ModalManager not available for receipt close');
    const modal = $(RECEIPT_MODAL_ID);
    if (modal) {
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      setTimeout(() => {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
      }, 300);
    }
  }
}

// ==================== EVENT BINDINGS ====================
function bindMainModalEvents() {
  const trigger = $('fxg-open-transfer-modal');
  const modal = $(DOM_MODAL_ID);
  const closeBtn = $('fxg-close-btn');
  const backdrop = modal?.querySelector('.fxg-backdrop');

  // Trigger button
  if (trigger && !trigger._transfer_bound) {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      openTransferModal();
    });
    trigger._transfer_bound = true;
    console.log('[transfer] ✓ Bound trigger button');
  }

  // Close button
  if (closeBtn && !closeBtn._transfer_bound) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeTransferModal();
    });
    closeBtn._transfer_bound = true;
    console.log('[transfer] ✓ Bound close button');
  }

  // Backdrop click
  if (backdrop && !backdrop._transfer_bound) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeTransferModal();
      }
    });
    backdrop._transfer_bound = true;
    console.log('[transfer] ✓ Bound backdrop click');
  }

  // Escape key
  if (modal && !modal._transfer_escape_bound) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('show')) {
        closeTransferModal();
      }
    });
    modal._transfer_escape_bound = true;
    console.log('[transfer] ✓ Bound escape key');
  }
}

function bindFormEvents() {
  const usernameEl = $('fxg-username');
  const amountEl = $('fxg-amount');
  const form = $('fxg-form');

  // Username input
  if (usernameEl && !usernameEl._transfer_bound) {
    usernameEl.addEventListener('input', validateTransferForm);
    usernameEl._transfer_bound = true;
    console.log('[transfer] ✓ Bound username input');
  }

  // Amount input with formatting
  if (amountEl && !amountEl._transfer_bound) {
    let prevFormatted = '';

    amountEl.addEventListener('input', (e) => {
      const cursor = e.target.selectionStart;
      let raw = onlyDigits(e.target.value);

      // Remove leading zeros
      if (raw.length > 1 && raw.startsWith('0')) {
        raw = raw.replace(/^0+/, '') || '0';
      }

      const formatted = raw ? Number(raw).toLocaleString('en-US') : '';

      if (formatted !== prevFormatted) {
        prevFormatted = formatted;
        e.target.value = formatted;

        // Maintain cursor position
        const added = formatted.length - raw.length;
        const newPos = cursor + added;
        e.target.setSelectionRange(newPos, newPos);
      }

      validateTransferForm();
    });

    amountEl._transfer_bound = true;
    console.log('[transfer] ✓ Bound amount input');
  }

  // Form submit
  if (form && !form._transfer_bound) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      if (!validateTransferForm()) {
        console.warn('[transfer] Form validation failed');
        return;
      }

      const payload = {
        recipient: (usernameEl.value || '').trim(),
        amount: Number(onlyDigits(amountEl.value)),
        timestamp: new Date().toISOString()
      };

      console.log('[transfer] Form submitted with payload:', payload);
      openConfirmModal(payload);
    });

    form._transfer_bound = true;
    console.log('[transfer] ✓ Bound form submit');
  }
}

function bindConfirmModalEvents() {
  const wrapper = $(CONFIRM_MODAL_ID);
  if (!wrapper || wrapper.dataset.eventsBound) return;

  const backdrop = wrapper.querySelector('[data-fxg-confirm-close]');
  const closeBtn = wrapper.querySelector('.fxg-confirm-close');
  const cancelBtn = wrapper.querySelector('.fxg-confirm-cancel');
  const sendBtn = $('fxg-transfer-confirm-modal-send');

  const closeHandler = (e) => {
    e.preventDefault();
    closeConfirmModal();
  };

  // Close events
  [backdrop, closeBtn, cancelBtn].forEach(el => {
    if (el && !el._transfer_bound) {
      el.addEventListener('click', closeHandler);
      el._transfer_bound = true;
    }
  });

  // Send button
  if (sendBtn && !sendBtn._transfer_bound) {
    sendBtn.addEventListener('click', () => {
      if (currentTransferData) {
        confirmSend(currentTransferData);
      }
    });
    sendBtn._transfer_bound = true;
  }

  // Escape key
  wrapper.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeConfirmModal();
    }
  });

  wrapper.dataset.eventsBound = 'true';
  console.log('[transfer] ✓ Bound confirm modal events');
}

function bindReceiptModalEvents() {
  const wrapper = $(RECEIPT_MODAL_ID);
  if (!wrapper || wrapper.dataset.eventsBound) return;

  const backdrop = wrapper.querySelector('.fxg-receipt-backdrop');

  // Backdrop click
  if (backdrop && !backdrop._transfer_bound) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeReceiptModal();
      }
    });
    backdrop._transfer_bound = true;
  }

  // Escape key
  wrapper.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeReceiptModal();
    }
  });

  wrapper.dataset.eventsBound = 'true';
  console.log('[transfer] ✓ Bound receipt modal events');
}

function bindModalManagerEvents() {
  window.addEventListener('modalOpened', (ev) => {
    if (ev?.detail === MM_MODAL_ID) {
      console.log('[transfer] Modal opened event received');
      refreshBalanceOnModalOpen();
      validateTransferForm();
    }
  });

  console.log('[transfer] ✓ Bound ModalManager events');
}

// ==================== INITIALIZATION ====================
function initUI() {
  console.log('[transfer] Initializing UI');

  const modal = $(DOM_MODAL_ID);
  if (!modal) {
    console.warn('[transfer] Transfer modal element not found');
    return;
  }

  // Bind all events
  bindMainModalEvents();
  bindFormEvents();
  bindConfirmModalEvents();
  bindReceiptModalEvents();
  bindModalManagerEvents();

  // Initial balance display
  setTimeout(() => {
    const balanceEl = $('fxg-balance');
    if (balanceEl) {
      balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
      console.log('[transfer] ✓ Initial balance display set:', balanceEl.textContent);
    }
  }, 100);

  // Initial validation state
  validateTransferForm();

  console.log('[transfer] ✓ UI initialized');
}

function bootstrap() {
  console.log('[transfer] Bootstrapping');

  // Initialize balance
  initBalanceFromSources();

  // Patch global functions
  patchUpdateAllBalances();

  // Bind global events
  bindBalanceUpdateEvent();
  bindStorageEvents();

  // Initialize UI when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initUI, 80);
    });
  } else {
    setTimeout(initUI, 80);
  }

  // Update balance display after delays to catch late updates
  setTimeout(() => {
    BALANCE = getAvailableBalance();
    const balanceEl = $('fxg-balance');
    if (balanceEl) {
      balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
      console.log('[transfer] ✓ Bootstrap balance update:', balanceEl.textContent);
    }
  }, 600);

  // Additional check after 1 second
  setTimeout(() => {
    BALANCE = getAvailableBalance();
    const balanceEl = $('fxg-balance');
    if (balanceEl) {
      balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
      console.log('[transfer] ✓ Delayed balance update:', balanceEl.textContent);
    }
  }, 1000);

  console.log('[transfer] ✓ Bootstrap complete');
}

// ==================== EXPORTS & DEBUG ====================
window.fxgTransfer = {
  openModal: openTransferModal,
  closeModal: closeTransferModal,
  getBalance: () => BALANCE,
  refreshBalance: () => {
    BALANCE = getAvailableBalance();
    const balanceEl = $('fxg-balance');
    if (balanceEl) {
      balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
    }
    return BALANCE;
  },
  setBalance: (v) => {
    updateLocalBalance(Number(v) || 0);
    if (typeof window.updateAllBalances === 'function') {
      try {
        window.updateAllBalances(BALANCE);
      } catch (e) {
        console.warn('[transfer] Failed to call updateAllBalances:', e);
      }
    }
  },
  resetForm: resetTransferForm
};

// Start the module
bootstrap();