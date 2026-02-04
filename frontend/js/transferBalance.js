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

// Resolve elements lazily
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

// ==================== BALANCE MANAGEMENT ====================
function initBalanceFromSources() {
  console.log('[transfer] Initializing balance from sources');
  
  // 1. Try window.currentDisplayedBalance first
  if (typeof window.currentDisplayedBalance === 'number' && !Number.isNaN(window.currentDisplayedBalance)) {
    BALANCE = Number(window.currentDisplayedBalance);
    persistFxgBalance(BALANCE);
    console.log('[transfer] ✓ Balance from window.currentDisplayedBalance:', BALANCE);
    return;
  }
  
  // 2. Try userData from localStorage
  try {
    const userData = localStorage.getItem('userData');
    if (userData) {
      const parsed = JSON.parse(userData);
      if (parsed && typeof parsed.wallet_balance !== 'undefined') {
        BALANCE = Number(parsed.wallet_balance) || 0;
        persistFxgBalance(BALANCE);
        console.log('[transfer] ✓ Balance from userData:', BALANCE);
        return;
      }
    }
  } catch (e) {
    console.warn('[transfer] Failed to parse userData:', e);
  }
  
  // 3. Try FXG storage key
  try {
    const prev = localStorage.getItem(FXG_STORAGE_KEY);
    if (prev !== null) {
      BALANCE = Number(prev) || 0;
      console.log('[transfer] ✓ Balance from FXG storage:', BALANCE);
      return;
    }
  } catch (e) {
    console.warn('[transfer] Failed to read FXG storage:', e);
  }
  
  // 4. Default to 0
  BALANCE = 0;
  console.log('[transfer] ⚠ Balance defaulted to 0');
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
  
  const els = resolveEls();
  if (els.balanceEl) {
    els.balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
  }
  
  console.log('[transfer] ✓ Balance updated to:', BALANCE);
}

function refreshOnModalOpen() {
  console.log('[transfer] Refreshing balance on modal open');
  initBalanceFromSources();
  
  const els = resolveEls();
  if (els.balanceEl) {
    els.balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
    console.log('[transfer] ✓ Balance display updated:', els.balanceEl.textContent);
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
          updateLocalBalance(Number(newBalance) || 0);
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
        updateLocalBalance(Number(ev.detail.balance) || 0);
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
    if (!ev || ev.key !== 'userData' || !ev.newValue) return;
    try {
      const parsed = JSON.parse(ev.newValue);
      if (parsed?.wallet_balance !== undefined) {
        updateLocalBalance(Number(parsed.wallet_balance) || 0);
      }
    } catch (e) {
      console.warn('[transfer] storage event error:', e);
    }
  });
  
  bindStorageEvents._bound = true;
  console.log('[transfer] ✓ Bound storage events');
}

// ==================== MAIN TRANSFER MODAL ====================
function openModal() {
  console.log('[transfer] Opening main modal');
  
  refreshOnModalOpen();
  
  if (window.ModalManager?.openModal) {
    window.ModalManager.openModal(MM_MODAL_ID);
    console.log('[transfer] ✓ Opened via ModalManager');
  } else {
    console.warn('[transfer] ModalManager not available, using fallback');
    const els = resolveEls();
    if (els.modal) {
      els.modal.style.display = 'block';
      els.modal.classList.add('show');
      els.modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    }
  }
}

function closeModal() {
  console.log('[transfer] Closing main modal');
  
  if (window.ModalManager?.closeModal) {
    window.ModalManager.closeModal(MM_MODAL_ID);
  } else {
    console.warn('[transfer] ModalManager not available, using fallback');
    const els = resolveEls();
    if (els.modal) {
      els.modal.classList.remove('show');
      els.modal.setAttribute('aria-hidden', 'true');
      setTimeout(() => {
        els.modal.style.display = 'none';
        document.body.classList.remove('modal-open');
      }, 300);
    }
  }
  
  currentTransferData = null;
}

// ==================== FORM VALIDATION ====================
function validate() {
  const els = resolveEls();
  if (!els.usernameEl || !els.amountEl || !els.continueBtn) return false;

  const username = (els.usernameEl.value || '').trim();
  const raw = onlyDigits(els.amountEl.value);
  const amt = Number(raw);

  const usernameOk = username.length >= 2;
  const amountOk = raw.length > 0 && amt > 0 && amt <= BALANCE;

  els.usernameErr.textContent = usernameOk || !username ? '' : 'Username must be at least 2 characters';

  if (els.amountErr) {
    if (!raw) {
      els.amountErr.textContent = '';
    } else if (amt <= 0) {
      els.amountErr.textContent = 'Amount must be greater than 0';
    } else if (amt > BALANCE) {
      els.amountErr.textContent = `Insufficient balance. Max: ₦${fmt(BALANCE)}`;
    } else {
      els.amountErr.textContent = '';
    }
  }

  const valid = usernameOk && amountOk;
  els.continueBtn.disabled = !valid;
  
  return valid;
}

function resetTransferForm() {
  console.log('[transfer] Resetting form');
  
  const els = resolveEls();
  if (els.usernameEl) els.usernameEl.value = '';
  if (els.amountEl) els.amountEl.value = '';
  if (els.continueBtn) {
    const text = els.continueBtn.querySelector('.fxg-btn-text') || els.continueBtn;
    text.textContent = 'Continue';
    els.continueBtn.disabled = true;
  }
  if (els.usernameErr) els.usernameErr.textContent = '';
  if (els.amountErr) els.amountErr.textContent = '';
  if (els.successEl) els.successEl.hidden = true;
  
  closeModal();
  currentTransferData = null;
}

// ==================== CONFIRM MODAL ====================
function openConfirmModal(payload) {
  console.log('[transfer] Opening confirm modal with payload:', payload);
  
  currentTransferData = payload;
  
  const amountEl = $('fxg-transfer-confirm-modal-amount');
  const recipientEl = $('fxg-transfer-confirm-modal-recipient');
  
  if (amountEl) amountEl.textContent = `₦${fmt(payload.amount)}`;
  if (recipientEl) recipientEl.textContent = `@${payload.recipient}`;

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

  // Bind send button
  const sendBtn = $('fxg-transfer-confirm-modal-send');
  if (sendBtn && !sendBtn._fxg_confirm_bound) {
    sendBtn.addEventListener('click', () => confirmSend(payload));
    sendBtn._fxg_confirm_bound = true;
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
    if (failedDiv) failedDiv.style.display = 'none';
    if (successDiv) successDiv.style.display = 'block';

    const recipientEl = $('receipt-recipient');
    const amountEl = $('receipt-amount');
    const newBalanceEl = $('receipt-new-balance');
    const dateEl = $('receipt-date');

    if (recipientEl) recipientEl.textContent = `@${payload.recipient}`;
    if (amountEl) amountEl.textContent = `₦${fmt(payload.amount)}`;
    if (newBalanceEl) newBalanceEl.textContent = `₦${fmt(balanceOrError)}`;
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleString('en-NG', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
    }

    const doneBtn = $('receipt-done-btn');
    if (doneBtn) {
      doneBtn.onclick = () => {
        closeReceiptModal();
        resetTransferForm();
      };
    }

  } else {
    if (successDiv) successDiv.style.display = 'none';
    if (failedDiv) failedDiv.style.display = 'block';

    const errorMsgEl = $('receipt-error-message');
    const failedRecipientEl = $('receipt-failed-recipient');
    const failedAmountEl = $('receipt-failed-amount');

    if (errorMsgEl) errorMsgEl.textContent = balanceOrError || 'Transfer failed. Please try again.';
    if (failedRecipientEl) failedRecipientEl.textContent = `@${payload.recipient}`;
    if (failedAmountEl) failedAmountEl.textContent = `₦${fmt(payload.amount)}`;

    const tryAgainBtn = $('receipt-try-again-btn');
    if (tryAgainBtn) {
      tryAgainBtn.onclick = () => {
        closeReceiptModal();
        openConfirmModal(payload);
      };
    }

    const closeBtn = $('receipt-close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => {
        closeReceiptModal();
        resetTransferForm();
      };
    }
  }

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
function bindConfirmModalEvents() {
  const wrapper = $(CONFIRM_MODAL_ID);
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
  console.log('[transfer] ✓ Bound confirm modal events');
}

function bindReceiptModalEvents() {
  const wrapper = $(RECEIPT_MODAL_ID);
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
  console.log('[transfer] ✓ Bound receipt modal events');
}

// ==================== INITIALIZATION ====================
function initUI() {
  console.log('[transfer] Initializing UI');
  
  const els = resolveEls();
  if (!els.modal) {
    console.warn('[transfer] Transfer modal element not found');
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
    console.log('[transfer] ✓ Bound trigger button');
  }

  // Bind close
  if (els.closeBtn && !els.closeBtn._fxg_bound) {
    els.closeBtn.addEventListener('click', e => {
      e.preventDefault();
      closeModal();
    });
    els.closeBtn._fxg_bound = true;
    console.log('[transfer] ✓ Bound close button');
  }

  // Bind backdrop
  if (els.backdrop && !els.backdrop._fxg_bound) {
    els.backdrop.addEventListener('click', e => {
      if (e.target === els.backdrop) closeModal();
    });
    els.backdrop._fxg_bound = true;
    console.log('[transfer] ✓ Bound backdrop click');
  }

  // Amount input with formatting
  if (els.amountEl && !els.amountEl._fxg_bound) {
    let prevFormatted = '';
    els.amountEl.addEventListener('input', e => {
      const cursor = e.target.selectionStart;
      let raw = onlyDigits(e.target.value);
      if (raw.length > 1 && raw.startsWith('0')) {
        raw = raw.replace(/^0+/, '') || '0';
      }

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
    console.log('[transfer] ✓ Bound amount input');
  }

  // Username input
  if (els.usernameEl && !els.usernameEl._fxg_bound) {
    els.usernameEl.addEventListener('input', validate);
    els.usernameEl._fxg_bound = true;
    console.log('[transfer] ✓ Bound username input');
  }

  // Form submit
  if (els.form && !els.form._fxg_bound) {
    els.form.addEventListener('submit', ev => {
      ev.preventDefault();
      if (!validate()) {
        console.warn('[transfer] Form validation failed');
        return;
      }

      const payload = {
        recipient: (els.usernameEl.value || '').trim(),
        amount: Number(onlyDigits(els.amountEl.value)),
        timestamp: new Date().toISOString()
      };

      console.log('[transfer] Form submitted with payload:', payload);
      openConfirmModal(payload);
    });
    els.form._fxg_bound = true;
    console.log('[transfer] ✓ Bound form submit');
  }

  // Reset on modal open
  window.addEventListener('modalOpened', ev => {
    if (ev?.detail === MM_MODAL_ID) {
      console.log('[transfer] Modal opened event received');
      refreshOnModalOpen();
      const els = resolveEls();
      if (els.successEl) els.successEl.hidden = true;
      validate();
    }
  });

  // Bind other modals
  bindConfirmModalEvents();
  bindReceiptModalEvents();

  console.log('[transfer] ✓ UI initialized');
}

function bootstrap() {
  console.log('[transfer] Bootstrapping');
  
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
    if (be) {
      be.textContent = `Balance: ₦${fmt(BALANCE)}`;
      console.log('[transfer] ✓ Balance display updated:', be.textContent);
    }
  }, 600);
  
  console.log('[transfer] ✓ Bootstrap complete');
}

// ==================== EXPORTS & DEBUG ====================
window.fxgTransfer = window.fxgTransfer || {};
window.fxgTransfer.getBalance = () => BALANCE;
window.fxgTransfer.setBalance = v => {
  updateLocalBalance(Number(v) || 0);
  if (typeof window.updateAllBalances === 'function') {
    try {
      window.updateAllBalances(BALANCE);
    } catch (e) {
      console.warn('[transfer] Failed to call updateAllBalances:', e);
    }
  }
};

// Start the module
bootstrap();