/* transferBalance.js - Production-ready balance transfer handler
   Handles wallet-to-wallet transfers with smooth modal transitions
   Integrates with ModalManager and checkout.js PIN verification
*/

console.log('[transfer] Module loaded 💸');

'use strict';

// ==================== STATE ====================
let transferData = null;
const TRANSFER_MODAL_ID = 'fxgTransferModal';
const TRANSFER_CONFIRM_MODAL_ID = 'fxg-transfer-confirm-modal';
const TRANSFER_RECEIPT_MODAL_ID = 'fxg-transfer-receipt-modal';

// ==================== HELPER FUNCTIONS ====================
const onlyDigits = s => (s || '').toString().replace(/[^\d]/g, '');
const fmt = n => (Number(n) || 0).toLocaleString('en-US');

function safeGetUserState() {
  try {
    if (typeof window.getUserState === 'function') {
      return window.getUserState() || {};
    }
    const raw = localStorage.getItem('userState');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('[transfer] safeGetUserState error', e);
    return {};
  }
}

function getAvailableBalance() {
  const balanceReal = document.querySelector('.balance-real');
  if (balanceReal && balanceReal.textContent) {
    return parseFloat(balanceReal.textContent.replace(/[₦,\s]/g, '')) || 0;
  }
  const state = safeGetUserState();
  return parseFloat(state.balance) || 0;
}

function updateLocalBalanceDisplay(balance) {
  const els = {
    balanceEl: document.getElementById('fxg-balance'),
    modalBalanceEl: document.getElementById('transfer-balance-amount')
  };
  
  if (els.balanceEl) {
    els.balanceEl.textContent = `₦${fmt(balance)}`;
  }
  if (els.modalBalanceEl) {
    els.modalBalanceEl.textContent = `₦${fmt(balance)}`;
  }
}

// ==================== TRANSFER MODAL HANDLERS ====================
function openTransferModal() {
  console.log('[transfer] Opening transfer modal');
  
  // Update balance display
  const balance = getAvailableBalance();
  updateLocalBalanceDisplay(balance);
  
  // Reset form
  resetTransferForm();
  
  // Open with ModalManager for smooth transitions
  if (window.ModalManager?.openModal) {
    ModalManager.openModal(TRANSFER_MODAL_ID);
  } else {
    const modal = document.getElementById('fxg-transfer-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
    }
  }
}

function closeTransferModal() {
  console.log('[transfer] Closing transfer modal');
  
  if (window.ModalManager?.closeModal) {
    ModalManager.closeModal(TRANSFER_MODAL_ID);
  } else {
    const modal = document.getElementById('fxg-transfer-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
  }
  
  resetTransferForm();
}

function resetTransferForm() {
  const usernameInput = document.getElementById('fxg-username');
  const amountInput = document.getElementById('fxg-amount');
  const continueBtn = document.getElementById('fxg-continue');
  
  if (usernameInput) usernameInput.value = '';
  if (amountInput) amountInput.value = '';
  if (continueBtn) {
    continueBtn.disabled = true;
    continueBtn.textContent = 'Continue';
  }
  
  // Clear errors
  document.getElementById('fxg-username-error')?.classList.remove('show');
  document.getElementById('fxg-amount-error')?.classList.remove('show');
}

// ==================== VALIDATION & FORMATTING ====================
function validateTransferForm() {
  const username = document.getElementById('fxg-username')?.value.trim() || '';
  const amountRaw = onlyDigits(document.getElementById('fxg-amount')?.value || '');
  const amount = Number(amountRaw);
  const balance = getAvailableBalance();
  const continueBtn = document.getElementById('fxg-continue');
  
  const usernameError = document.getElementById('fxg-username-error');
  const amountError = document.getElementById('fxg-amount-error');
  
  // Reset errors
  if (usernameError) usernameError.classList.remove('show');
  if (amountError) amountError.classList.remove('show');
  
  // Validate username
  const usernameValid = username.length >= 2;
  if (!usernameValid && username) {
    if (usernameError) {
      usernameError.textContent = 'Username must be at least 2 characters';
      usernameError.classList.add('show');
    }
  }
  
  // Validate amount
  let amountValid = true;
  if (!amountRaw) {
    amountValid = false;
  } else if (amount <= 0) {
    amountValid = false;
    if (amountError) {
      amountError.textContent = 'Amount must be greater than 0';
      amountError.classList.add('show');
    }
  } else if (amount > balance) {
    amountValid = false;
    if (amountError) {
      amountError.textContent = `Insufficient balance. Available: ₦${fmt(balance)}`;
      amountError.classList.add('show');
    }
  } else if (amount < 100) {
    amountValid = false;
    if (amountError) {
      amountError.textContent = 'Minimum transfer amount is ₦100';
      amountError.classList.add('show');
    }
  }
  
  // Update continue button
  if (continueBtn) {
    continueBtn.disabled = !(usernameValid && amountValid);
  }
  
  return usernameValid && amountValid;
}

// Format amount input
function setupAmountFormatting() {
  const amountInput = document.getElementById('fxg-amount');
  if (!amountInput) return;
  
  amountInput.addEventListener('input', function(e) {
    const cursorPos = e.target.selectionStart;
    const rawValue = onlyDigits(this.value);
    
    // Format with commas
    const formatted = rawValue ? Number(rawValue).toLocaleString('en-US') : '';
    
    // Update value
    this.value = formatted;
    
    // Restore cursor position
    const diff = formatted.length - rawValue.length;
    const newPos = cursorPos + diff;
    e.target.setSelectionRange(newPos, newPos);
    
    // Validate
    validateTransferForm();
  });
}

// ==================== CONFIRM MODAL ====================
function openConfirmModal() {
  if (!validateTransferForm()) return;
  
  const username = document.getElementById('fxg-username')?.value.trim() || '';
  const amountRaw = onlyDigits(document.getElementById('fxg-amount')?.value || '');
  const amount = Number(amountRaw);
  
  // Store transfer data
  transferData = {
    recipient: username,
    amount: amount,
    timestamp: new Date().toISOString()
  };
  
  // Update confirm modal content
  document.getElementById('fxg-transfer-confirm-modal-amount').textContent = `₦${fmt(amount)}`;
  document.getElementById('fxg-transfer-confirm-modal-recipient').textContent = `@${username}`;
  document.getElementById('fxg-transfer-confirm-balance').textContent = `₦${fmt(getAvailableBalance() - amount)}`;
  
  // Open confirm modal with ModalManager
  if (window.ModalManager?.openModal) {
    ModalManager.openModal(TRANSFER_CONFIRM_MODAL_ID);
  } else {
    const modal = document.getElementById(TRANSFER_CONFIRM_MODAL_ID);
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
    }
  }
}

function closeConfirmModal() {
  if (window.ModalManager?.closeModal) {
    ModalManager.closeModal(TRANSFER_CONFIRM_MODAL_ID);
  } else {
    const modal = document.getElementById(TRANSFER_CONFIRM_MODAL_ID);
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
  }
}

// ==================== PIN VERIFICATION ====================
async function verifyPinForTransfer() {
  return new Promise((resolve) => {
    window._checkoutPinResolve = (success) => {
      delete window._checkoutPinResolve;
      resolve(success);
    };

    if (typeof window.showCheckoutPinModal === 'function') {
      window.showCheckoutPinModal();
    } else {
      console.error('[transfer] showCheckoutPinModal not available');
      resolve(false);
    }
  });
}

// ==================== TRANSFER PROCESSING ====================
async function processTransfer() {
  if (!transferData) {
    throw new Error('No transfer data');
  }
  
  const { recipient, amount } = transferData;
  
  try {
    // Get auth token
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Not authenticated');
    
    // Call transfer API
    const response = await fetch('https://api.flexgig.com.ng/api/wallet/transfer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        recipient: recipient,
        amount: amount
      })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || result.message || 'Transfer failed');
    }
    
    return {
      success: true,
      data: result,
      newBalance: result.newBalance,
      reference: result.reference
    };
    
  } catch (error) {
    console.error('[transfer] Process error:', error);
    throw error;
  }
}

async function executeTransfer() {
  const sendBtn = document.getElementById('fxg-transfer-confirm-modal-send');
  const originalText = sendBtn?.textContent;
  
  try {
    // Update UI
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Verifying...';
    }
    
    // Close confirm modal smoothly
    closeConfirmModal();
    
    // Show processing receipt
    showTransferReceipt('processing');
    
    // Verify PIN
    const pinVerified = await verifyPinForTransfer();
    if (!pinVerified) {
      showTransferReceipt('cancelled');
      return;
    }
    
    // Update receipt to sending state
    updateReceiptStatus('sending');
    
    // Process transfer
    const result = await processTransfer();
    
    // Update balance display globally
    if (result.newBalance && typeof window.updateAllBalances === 'function') {
      window.updateAllBalances(result.newBalance);
    }
    
    // Show success receipt
    showTransferReceipt('success', {
      recipient: transferData.recipient,
      amount: transferData.amount,
      newBalance: result.newBalance,
      reference: result.reference
    });
    
  } catch (error) {
    console.error('[transfer] Execute error:', error);
    showTransferReceipt('failed', {
      error: error.message,
      recipient: transferData.recipient,
      amount: transferData.amount
    });
  } finally {
    // Reset send button
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = originalText;
    }
  }
}

// ==================== RECEIPT MODAL ====================
function showTransferReceipt(status, data = {}) {
  const receiptModal = document.getElementById(TRANSFER_RECEIPT_MODAL_ID);
  if (!receiptModal) return;
  
  // Hide all receipt states
  document.querySelectorAll('.receipt-state').forEach(el => {
    el.style.display = 'none';
  });
  
  // Show appropriate state
  const stateElement = document.getElementById(`transfer-receipt-${status}`);
  if (stateElement) {
    stateElement.style.display = 'block';
  }
  
  // Update content based on status
  switch (status) {
    case 'processing':
      // No additional content needed
      break;
      
    case 'sending':
      document.getElementById('transfer-receipt-sending-amount').textContent = `₦${fmt(data.amount || 0)}`;
      document.getElementById('transfer-receipt-sending-recipient').textContent = `@${data.recipient || ''}`;
      break;
      
    case 'success':
      document.getElementById('transfer-receipt-success-amount').textContent = `₦${fmt(data.amount || 0)}`;
      document.getElementById('transfer-receipt-success-recipient').textContent = `@${data.recipient || ''}`;
      document.getElementById('transfer-receipt-success-new-balance').textContent = `₦${fmt(data.newBalance || 0)}`;
      document.getElementById('transfer-receipt-success-reference').textContent = data.reference || 'N/A';
      document.getElementById('transfer-receipt-success-time').textContent = 
        new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
      break;
      
    case 'failed':
      document.getElementById('transfer-receipt-failed-error').textContent = data.error || 'Transfer failed';
      document.getElementById('transfer-receipt-failed-amount').textContent = `₦${fmt(data.amount || 0)}`;
      document.getElementById('transfer-receipt-failed-recipient').textContent = `@${data.recipient || ''}`;
      break;
      
    case 'cancelled':
      // No additional content needed
      break;
  }
  
  // Open with ModalManager
  if (window.ModalManager?.openModal) {
    ModalManager.openModal(TRANSFER_RECEIPT_MODAL_ID);
  } else {
    receiptModal.classList.remove('hidden');
    receiptModal.style.display = 'flex';
    receiptModal.setAttribute('aria-hidden', 'false');
  }
}

function updateReceiptStatus(status) {
  const receiptModal = document.getElementById(TRANSFER_RECEIPT_MODAL_ID);
  if (!receiptModal) return;
  
  // Only update if receipt modal is open
  if (receiptModal.getAttribute('aria-hidden') === 'true') return;
  
  // Hide all states
  document.querySelectorAll('.receipt-state').forEach(el => {
    el.style.display = 'none';
  });
  
  // Show new state
  const stateElement = document.getElementById(`transfer-receipt-${status}`);
  if (stateElement) {
    stateElement.style.display = 'block';
  }
}

function closeTransferReceipt() {
  if (window.ModalManager?.closeModal) {
    ModalManager.closeModal(TRANSFER_RECEIPT_MODAL_ID);
  } else {
    const modal = document.getElementById(TRANSFER_RECEIPT_MODAL_ID);
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
  }
  
  // Reset transfer data
  transferData = null;
  resetTransferForm();
}

// ==================== EVENT HANDLERS ====================
function setupEventListeners() {
  // Open transfer modal button
  document.querySelectorAll('[data-open-transfer]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openTransferModal();
    });
  });
  
  // Transfer modal close buttons
  document.querySelectorAll('[data-close-transfer]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      closeTransferModal();
    });
  });
  
  // Transfer modal backdrop
  const transferModal = document.getElementById('fxg-transfer-modal');
  if (transferModal) {
    transferModal.addEventListener('click', (e) => {
      if (e.target === transferModal) {
        closeTransferModal();
      }
    });
  }
  
  // Continue button in transfer modal
  const continueBtn = document.getElementById('fxg-continue');
  if (continueBtn) {
    continueBtn.addEventListener('click', openConfirmModal);
  }
  
  // Confirm modal buttons
  const confirmModal = document.getElementById(TRANSFER_CONFIRM_MODAL_ID);
  if (confirmModal) {
    // Backdrop
    confirmModal.addEventListener('click', (e) => {
      if (e.target === confirmModal) {
        closeConfirmModal();
      }
    });
    
    // Close buttons
    confirmModal.querySelectorAll('[data-close-confirm]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        closeConfirmModal();
      });
    });
    
    // Cancel button
    const cancelBtn = confirmModal.querySelector('.fxg-confirm-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeConfirmModal();
      });
    }
    
    // Send button
    const sendBtn = confirmModal.querySelector('.fxg-confirm-send');
    if (sendBtn) {
      sendBtn.addEventListener('click', (e) => {
        e.preventDefault();
        executeTransfer();
      });
    }
  }
  
  // Receipt modal buttons
  const receiptModal = document.getElementById(TRANSFER_RECEIPT_MODAL_ID);
  if (receiptModal) {
    // Backdrop
    receiptModal.addEventListener('click', (e) => {
      if (e.target === receiptModal) {
        closeTransferReceipt();
      }
    });
    
    // Close buttons
    receiptModal.querySelectorAll('[data-close-receipt]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        closeTransferReceipt();
      });
    });
    
    // Done button
    const doneBtn = receiptModal.querySelector('.receipt-done');
    if (doneBtn) {
      doneBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeTransferReceipt();
        closeTransferModal();
      });
    }
    
    // Try again button
    const tryAgainBtn = receiptModal.querySelector('.receipt-try-again');
    if (tryAgainBtn) {
      tryAgainBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeTransferReceipt();
        openConfirmModal();
      });
    }
  }
  
  // Form validation on input
  const usernameInput = document.getElementById('fxg-username');
  const amountInput = document.getElementById('fxg-amount');
  
  if (usernameInput) {
    usernameInput.addEventListener('input', validateTransferForm);
  }
  
  if (amountInput) {
    amountInput.addEventListener('input', validateTransferForm);
    setupAmountFormatting();
  }
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Escape closes open modals
    if (e.key === 'Escape') {
      const openModals = ModalManager?.getOpenModals?.() || [];
      
      if (openModals.includes(TRANSFER_RECEIPT_MODAL_ID)) {
        closeTransferReceipt();
      } else if (openModals.includes(TRANSFER_CONFIRM_MODAL_ID)) {
        closeConfirmModal();
      } else if (openModals.includes(TRANSFER_MODAL_ID)) {
        closeTransferModal();
      }
    }
  });
}

// ==================== INITIALIZATION ====================
function initTransferModule() {
  console.log('[transfer] Initializing');
  
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupEventListeners();
      updateLocalBalanceDisplay(getAvailableBalance());
    });
  } else {
    setupEventListeners();
    updateLocalBalanceDisplay(getAvailableBalance());
  }
  
  // Listen for balance updates
  window.addEventListener('balance_update', (event) => {
    if (event.detail?.balance) {
      updateLocalBalanceDisplay(event.detail.balance);
    }
  });
  
  console.log('[transfer] Initialized ✓');
}

// ==================== EXPORTS ====================
window.openTransferModal = openTransferModal;
window.closeTransferModal = closeTransferModal;
window.resetTransferForm = resetTransferForm;

// Start the module
initTransferModule();