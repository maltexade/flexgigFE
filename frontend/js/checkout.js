/* checkout.js - Production-ready checkout modal handler
   Handles checkout modal display, payment processing, and authentication
   Integrates with dashboard.js for user state and biometric/PIN verification
*/

console.log('[checkout] Module loaded 🛒');

'use strict';

// ==================== STATE ====================
let checkoutData = null; // Stores current checkout information

// ==================== PROVIDER SVG SHAPES ====================
const svgShapes = {
  mtn: `<svg class="yellow-circle-icon" width="25" height="25" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; display: inline-block;"><circle cx="12" cy="12" r="10" fill="#FFD700"/></svg>`,
  airtel: `<svg class="airtel-rect-icon" width="25" height="25" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; display: inline-block;"><rect x="4" y="6" width="20" height="12" rx="4" fill="#e4012b"/></svg>`,
  glo: `<svg class="glo-diamond-icon" width="25" height="25" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; display: inline-block;"><polygon points="12,2 22,12 12,22 2,12" fill="#00B13C"/></svg>`,
  ninemobile: `<svg class="ninemobile-triangle-icon" width="25" height="25" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; display: inline-block;"><polygon points="12,3 21,21 3,21" fill="#7DB700"/></svg>`,
  receive: `<svg class="bank-icon" width="25" height="25" viewBox="0 0 24 24" fill="none"><path d="M4 9v9h16V9l-8-5-8 5zm4 4h8v2H8v-2zm0 4h4v2H8v-2z" fill="#00cc00" stroke="#fff" stroke-width="1"/></svg>`
};

// ==================== HELPER: GATHER CHECKOUT DATA ====================
function gatherCheckoutData() {
  try {
    const state = getUserState();

    // Provider (keep your existing logic)
    let selectedProvider = document.querySelector('.provider-box.selected');
    if (!selectedProvider) {
      const slider = document.querySelector('.slider');
      if (slider) {
        const classes = slider.className.split(' ');
        const providerClass = classes.find(c => ['mtn', 'airtel', 'glo', 'ninemobile'].includes(c.toLowerCase()));
        if (providerClass) selectedProvider = document.querySelector(`.provider-box.${providerClass}`);
      }
    }

    if (!selectedProvider) {
      safeNotify('Please select a network provider', 'error');
      return null;
    }

    let provider = ['mtn', 'airtel', 'glo', 'ninemobile'].find(p => selectedProvider.classList.contains(p));
    if (provider === 'ninemobile') provider = '9mobile';
    if (!provider) {
      safeNotify('Invalid provider selected', 'error');
      return null;
    }

    // Phone
    const phoneInput = document.getElementById('phone-input');
    const number = phoneInput?.value.trim() || '';
    if (!number || number.length < 10) {
      safeNotify('Please enter a valid phone number', 'error');
      return null;
    }

    // Plan — use real data-plan-id
    let selectedPlan = state.selectedPlan;

    if (!selectedPlan) {
      const selectedBox = document.querySelector('.plan-box.selected');
      if (selectedBox && selectedBox.dataset.planId) {
        selectedPlan = {
          planId: selectedBox.dataset.planId,
          price: parseFloat(selectedBox.dataset.price || 0),
          dataAmount: selectedBox.dataset.dataAmount || selectedBox.querySelectorAll('div')[1]?.textContent?.trim() || 'N/A',
          validity: selectedBox.dataset.validity || selectedBox.querySelectorAll('div')[2]?.textContent?.trim() || 'N/A',
          type: selectedBox.dataset.type || 'GIFTING'
        };
      }
    }

    // Fallback to last saved
    if (!selectedPlan || !selectedPlan.planId) {
      try {
        const saved = localStorage.getItem('lastSelectedPlan');
        if (saved) selectedPlan = JSON.parse(saved);
      } catch (e) {}
    }

    if (!selectedPlan || !selectedPlan.planId) {
      safeNotify('Please select a data plan', 'error');
      return null;
    }

    if (selectedPlan.price <= 0) {
      safeNotify('Invalid plan price', 'error');
      return null;
    }

    const checkoutInfo = {
      provider: provider.toUpperCase(),
      planId: selectedPlan.planId,
      planName: `${selectedPlan.dataAmount} (${selectedPlan.validity})`,
      dataAmount: selectedPlan.dataAmount,
      validity: selectedPlan.validity,
      price: selectedPlan.price,
      number: number,
      rawNumber: number.replace(/\s/g, ''),
      planType: selectedPlan.type
    };

    console.log('[checkout] Gathered real checkout data:', checkoutInfo);
    return checkoutInfo;

  } catch (err) {
    console.error('[checkout] Error gathering data:', err);
    safeNotify('Failed to prepare checkout', 'error');
    return null;
  }
}

// ==================== DOM READY ====================
function domReady(cb) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cb);
  } else cb();
}

// ==================== UTILITY FUNCTIONS ====================
const safeNotify = (msg, type = 'info') => {
  if (typeof window.notify === 'function') {
    return window.notify(msg, type);
  } else if (typeof notify === 'function') {
    return notify(msg, type);
  }
  console.log('[notify]', type, msg);
};

const getUserState = () => {
  try {
    const state = localStorage.getItem('userState');
    return state ? JSON.parse(state) : {};
  } catch (e) {
    console.error('[checkout] Error parsing userState:', e);
    return {};
  }
};

const hasPin = () => {
  try {
    const state = getUserState();
    return !!(state.pin && state.pin.length === 4);
  } catch (e) {
    return false;
  }
};

const isProfileComplete = () => {
  try {
    const state = getUserState();
    return !!(state.fullName && state.username && state.phoneNumber);
  } catch (e) {
    return false;
  }
};

function getAvailableBalance() {
  const balanceReal = document.querySelector('.balance-real');
  if (balanceReal && balanceReal.textContent) {
    return parseFloat(balanceReal.textContent.replace(/[₦,\s]/g, '')) || 0;
  }
  const state = getUserState();
  return parseFloat(state.balance) || 0;
}

function saveSelectedPlan(plan) {
  const state = getUserState();
  state.selectedPlan = plan;
  localStorage.setItem('userState', JSON.stringify(state));
  localStorage.setItem('lastSelectedPlan', JSON.stringify(plan));
}
window.saveSelectedPlan = saveSelectedPlan;

// ==================== CHECKOUT MODAL FUNCTIONS ====================
function openCheckoutModal(data) {
  console.log('[checkout] Opening modal with data:', data);
  
  let checkoutInfo;

  if (data && data.provider && data.planId && data.price && data.number) {
    checkoutInfo = {
      provider: data.provider.toUpperCase(),
      planId: data.planId,
      planName: data.planName || `${data.dataAmount} Plan`,
      dataAmount: data.dataAmount || 'N/A',
      validity: data.validity || '30 Days',
      price: parseFloat(data.price) || 0,
      number: data.number,
      rawNumber: data.rawNumber || data.number.replace(/\s/g, ''),
      planType: data.planType || 'GIFTING'
    };
    console.log('[checkout] Using explicitly passed data (recommended)');
  } else {
    console.warn('[checkout] No data passed — falling back to DOM scraping');
    checkoutInfo = gatherCheckoutData();
  }

  if (!checkoutInfo || !checkoutInfo.provider || !checkoutInfo.price || !checkoutInfo.number) {
    console.error('[checkout] Invalid checkout data:', checkoutInfo);
    safeNotify('Missing checkout information. Please try again.', 'error');
    return;
  }

  checkoutData = checkoutInfo;

  const modal = document.getElementById('checkoutModal');
  const payBtn = document.getElementById('payBtn');
  
  if (!modal) {
    console.error('[checkout] Modal not found');
    safeNotify('Checkout modal not available', 'error');
    return;
  }

  try {
        const priceEl = document.getElementById('checkout-price');
    if (priceEl) priceEl.textContent = `₦${checkoutInfo.price.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

    const serviceEl = document.getElementById('checkout-service');
    if (serviceEl) serviceEl.textContent = 'Mobile Data';

    const providerEl = document.getElementById('checkout-provider');
    if (providerEl) {
      let providerKey = checkoutInfo.provider.toLowerCase() === '9mobile' ? 'ninemobile' : checkoutInfo.provider.toLowerCase();
      const svg = svgShapes[providerKey] || '';
      providerEl.innerHTML = svg + ' ' + checkoutInfo.provider;
    }

    const phoneEl = document.getElementById('checkout-phone');
    if (phoneEl) phoneEl.textContent = checkoutInfo.number;

    const dataEl = document.getElementById('checkout-data');
    if (dataEl) dataEl.textContent = `${checkoutInfo.dataAmount} / ${checkoutInfo.validity}`;

    const amountEls = modal.querySelectorAll('.info-row:last-child .value');
    amountEls.forEach(el => {
      el.textContent = `₦${checkoutInfo.price.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
    });

    const balance = getAvailableBalance();
    const balanceEl = document.getElementById('checkout-balance');
    if (balanceEl) balanceEl.textContent = `₦${balance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (payBtn) {
      payBtn.disabled = false;
      payBtn.classList.add('active');
    }

    modal.style.display = 'flex';
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    
    history.pushState({ popup: true, modal: 'checkout' }, '', location.href);
    
    console.log('[checkout] Modal opened successfully');
    
  } catch (err) {
    console.error('[checkout] Error populating modal:', err);
    safeNotify('Failed to load checkout details', 'error');
  }
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkoutModal');
  if (!modal) return;

  try {
    modal.classList.remove('active');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    
    checkoutData = null;

    if (history.state && history.state.popup && history.state.modal === 'checkout') {
      history.back();
    }
  } catch (err) {
    console.error('[checkout] Error closing modal:', err);
  }
}

// Reset UI after successful purchase (fixed version)
function resetCheckoutUI() {
  // Clear phone input
  const phoneInput = document.getElementById('phone-input');
  if (phoneInput) phoneInput.value = '';

  // Remove 'selected' from all plan boxes
  document.querySelectorAll('.plan-box.selected').forEach(el => {
    if (el) el.classList.remove('selected');
  });

  // Remove 'selected' from all provider boxes
  document.querySelectorAll('.provider-box.selected').forEach(el => {
    if (el) el.classList.remove('selected');
  });

  // Re-select MTN as default provider
  const mtnProvider = document.querySelector('.provider-box.mtn');
  if (mtnProvider) mtnProvider.classList.add('selected');

  // Clear selected plan from localStorage properly
  try {
    const rawState = localStorage.getItem('userState');
    if (rawState) {
      const state = JSON.parse(rawState);
      delete state.selectedPlan;
      localStorage.setItem('userState', JSON.stringify(state));
    }
    localStorage.removeItem('lastSelectedPlan');
  } catch (err) {
    console.warn('[checkout] Failed to clear selected plan from storage:', err);
  }
}

// Add local transaction (same as your old mock)
// Add local transaction (safe version — no ReferenceError)
function addLocalTransaction(info) {
  let subType = 'GIFTING';
  if (info.provider.toLowerCase() === 'mtn' && info.planId.toLowerCase().includes('awoof')) subType = 'AWOOF';
  if (info.provider.toLowerCase() === 'airtel' && info.planId.toLowerCase().includes('awoof')) subType = 'AWOOF';
  if (info.provider.toLowerCase() === 'glo' && info.planId.toLowerCase().includes('cg')) subType = 'CG';

  const transaction = {
    type: 'data',
    description: 'Data Purchase',
    amount: info.price,
    phone: info.rawNumber,
    provider: info.provider,
    subType,
    data: info.dataAmount,
    duration: info.validity,
    timestamp: new Date().toISOString(),
    status: 'success'
  };

  // Safely get or create recentTransactions from localStorage
  let recentTransactions = [];
  try {
    const stored = localStorage.getItem('recentTransactions');
    if (stored) recentTransactions = JSON.parse(stored);
  } catch (e) {
    console.warn('[checkout] Failed to parse recentTransactions from storage', e);
  }

  // Add new transaction
  recentTransactions.unshift(transaction);

  // Keep only last 50
  if (recentTransactions.length > 50) recentTransactions = recentTransactions.slice(0, 50);

  // Save back
  try {
    localStorage.setItem('recentTransactions', JSON.stringify(recentTransactions));
  } catch (e) {
    console.warn('[checkout] Failed to save recentTransactions', e);
  }

  // Trigger UI update if functions exist
  if (typeof window.renderRecentTransactions === 'function') {
    window.renderRecentTransactions();
  }
  if (typeof window.renderTransactions === 'function') {
    window.renderTransactions();
  }

  console.log('[checkout] Local transaction added:', transaction);
}

// ==================== AUTHENTICATION WITH DEDICATED PIN MODAL ====================
async function triggerCheckoutAuthWithDedicatedModal() {
  return new Promise((resolve) => {
    window._checkoutPinResolve = (success) => {
      delete window._checkoutPinResolve;
      resolve(success);
    };

    if (typeof window.showCheckoutPinModal === 'function') {
      window.showCheckoutPinModal();
    } else {
      console.error('[checkout] showCheckoutPinModal not available');
      resolve(false);
    }
  });
}

// ==================== REAL PAYMENT PROCESSING (WITH LOADER) ====================
// ==================== REAL PAYMENT PROCESSING (NO LOADER OVERLAY) ====================
async function processPayment() {
  if (!checkoutData) {
    throw new Error('No checkout data available');
  }

  const payload = {
    plan_id: checkoutData.planId,
    phone: checkoutData.rawNumber || checkoutData.number.replace(/\s/g, ''),
    provider: checkoutData.provider.toLowerCase(),
  };

  console.log('[checkout] Sending to backend:', payload);

  // Fetch without withLoader – receipt modal handles UI
  const response = await fetch('https://api.flexgig.com.ng/api/purchase-data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    credentials: 'include',
  });

  const result = await response.json();

  if (!response.ok) {
    if (result.error === 'insufficient_balance') {
      throw new Error(`Insufficient balance: ₦${result.current_balance?.toLocaleString() || '0'}`);
    }
    if (result.error === 'delivery_failed') {
      throw new Error('Data delivery failed. Amount has been refunded.');
    }
    throw new Error(result.error || result.message || 'Payment failed');
  }

  console.log('[checkout] Payment success:', result);

  if (result.new_balance !== undefined) {
    window.updateAllBalances?.(result.new_balance);
  }

  if (typeof renderTransactions === 'function') {
    setTimeout(renderTransactions, 500);
  }

  return result;  // Return full result for message, reference, etc.
}

// ==================== MAIN PAY BUTTON HANDLER ====================
// ==================== MAIN PAY BUTTON HANDLER ====================
async function onPayClicked(ev) {
  console.log('[checkout] Pay button clicked');

  const payBtn = document.getElementById('payBtn');
  if (!payBtn || payBtn.disabled) return;

  const originalText = payBtn.textContent;
  payBtn.disabled = true;
  payBtn.textContent = 'Processing...';

  try {
    checkoutData = gatherCheckoutData();
    if (!checkoutData) throw new Error('Invalid checkout data');

    const authSuccess = await triggerCheckoutAuthWithDedicatedModal();
    if (!authSuccess) {
      safeNotify('Purchase cancelled', 'info');
      return;
    }

    // Show processing receipt immediately
    showProcessingReceipt(checkoutData);

    const result = await processPayment();

    addLocalTransaction(checkoutData);
    resetCheckoutUI();

    // Update to success with full details
    updateReceiptToSuccess(result);

    closeCheckoutModal();

  } catch (err) {
    console.error('[checkout] Payment failed:', err);

    let message = err.message || 'Purchase failed. Please try again.';
    if (err.message?.includes('Insufficient')) message = err.message;
    if (err.message?.includes('refunded')) message = err.message;

    // Update to failed
    updateReceiptToFailed(message);

    closeCheckoutModal();

  } finally {
    payBtn.disabled = false;
    payBtn.textContent = originalText;
  }
}

// ==================== DEDICATED CHECKOUT PIN MODAL LOGIC ====================
(function() {
  const modal = document.getElementById('checkout-pin-modal');
  if (!modal) {
    console.warn('[checkout-pin] Modal element not found');
    return;
  }

  const inputs = modal.querySelectorAll('.checkout-pin-digit');
  const biometricBtn = document.getElementById('checkout-biometric-btn');
  const deleteBtn = document.getElementById('checkout-delete-btn');
  const forgotLink = document.getElementById('checkout-forgot-pin-link');
  const closeBtn = modal.querySelector('.checkout-close-btn');

  let currentPin = '';

  function isBiometricEnabledForTx() {
    return localStorage.getItem('biometricForTx') === 'true' ||
           localStorage.getItem('biometricForCheckout') === 'true' ||
           localStorage.getItem('biometricForTransactions') === 'true';
  }

  function updateBiometricButton() {
    if (biometricBtn) {
      biometricBtn.style.display = isBiometricEnabledForTx() ? 'flex' : 'none';
    }
  }

  function updateInputs() {
  inputs.forEach((input, i) => {
    if (currentPin[i]) {
      input.classList.add('filled');
      input.value = '';  // Keep empty — we hide text completely
    } else {
      input.classList.remove('filled');
      input.value = '';
    }
  });
}

  function resetPin() {
    currentPin = '';
    updateInputs();
  }

  function showCheckoutPinModal() {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    updateBiometricButton();
    resetPin();
    inputs[0]?.focus();
  }

  function hideCheckoutPinModal() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    resetPin();
  }

  // Keypad
  modal.querySelectorAll('[data-digit]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentPin.length >= 4) return;
      currentPin += btn.dataset.digit;
      updateInputs();
      if (currentPin.length === 4) {
        setTimeout(() => verifyPin(currentPin), 300);
      }
    });
  });

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      currentPin = currentPin.slice(0, -1);
      updateInputs();
    });
  }
    // === LAPTOP / PHYSICAL KEYBOARD SUPPORT ===
  document.addEventListener('keydown', (e) => {
    if (modal.classList.contains('hidden')) return; // Only when modal is open

    // Allow digits 0-9
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault(); // Prevent default input behavior
      if (currentPin.length < 4) {
        currentPin += e.key;
        updateInputs();
        if (currentPin.length === 4) {
          setTimeout(() => verifyPin(currentPin), 300);
        }
      }
    }
    // Backspace to delete last digit
    else if (e.key === 'Backspace') {
      e.preventDefault();
      currentPin = currentPin.slice(0, -1);
      updateInputs();
    }
    // Escape to close modal (cancel)
    else if (e.key === 'Escape') {
      hideCheckoutPinModal();
      if (window._checkoutPinResolve) window._checkoutPinResolve(false);
    }
  });

  // Biometric
  if (biometricBtn) {
  biometricBtn.addEventListener('click', async () => {
    try {
      const result = await (verifyBiometrics?.() || startAuthentication?.() || { success: false });
      if (result && result.success) {
        hideCheckoutPinModal();
        // Only resolve — do not call processPayment here
        if (window._checkoutPinResolve) {
          window._checkoutPinResolve(true);
        }
      } else {
        safeNotify('Biometric authentication failed', 'error');
      }
    } catch (err) {
      safeNotify('Biometric error', 'error');
    }
  });
}

  // Forgot PIN
  if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      hideCheckoutPinModal();
      if (typeof openForgetPinFlow === 'function') openForgetPinFlow();
      if (window._checkoutPinResolve) window._checkoutPinResolve(false);
    });
  }

  // Close
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      hideCheckoutPinModal();
      if (window._checkoutPinResolve) window._checkoutPinResolve(false);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      hideCheckoutPinModal();
      if (window._checkoutPinResolve) window._checkoutPinResolve(false);
    }
  });

  // PIN verification
  async function verifyPin(pin) {
  return await withLoader(async () => {
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('https://api.flexgig.com.ng/api/verify-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ pin })
      });

      if (res.ok) {
        hideCheckoutPinModal();
        // DO NOT call processPayment() here
        // Just resolve success — the main flow will handle payment
        if (window._checkoutPinResolve) {
          window._checkoutPinResolve(true);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        safeNotify(data.message || 'Invalid PIN. Please try again.', 'error');
        resetPin();
        // Do NOT resolve — let user try again
      }
    } catch (err) {
      safeNotify('PIN verification failed. Check your connection.', 'error');
      resetPin();
    }
  });
}

  window.showCheckoutPinModal = showCheckoutPinModal;
  window.hideCheckoutPinModal = hideCheckoutPinModal;
})();

// ==================== INITIALIZATION ====================
domReady(() => {
  console.log('[checkout] Initializing');

  const modal = document.getElementById('checkoutModal');
  if (!modal) {
    console.warn('[checkout] Modal not found');
    return;
  }

  const payBtn = document.getElementById('payBtn');
  if (payBtn) {
    payBtn.removeEventListener('click', onPayClicked);
    payBtn.addEventListener('click', onPayClicked);
  }

  const closeBtns = modal.querySelectorAll('[data-close], .close-btn');
  closeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      closeCheckoutModal();
    });
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeCheckoutModal();
    }
  });

  window.addEventListener('popstate', (e) => {
    if (modal.classList.contains('active')) {
      closeCheckoutModal();
    }
  });

  console.log('[checkout] Initialized ✓');
});

// ==================== SMART RECEIPT MODAL FUNCTIONS ====================

// ==================== SMART RECEIPT MODAL FUNCTIONS ====================

function showProcessingReceipt(data) {
  const backdrop = document.getElementById('smart-receipt-backdrop');
  if (!backdrop) return console.error('[checkout] Receipt modal not found');

  backdrop.classList.remove('hidden');

  // Reset to processing
  const icon = document.getElementById('receipt-icon');
  icon.className = 'receipt-icon processing';
  icon.innerHTML = '<div class="spinner"></div>';

  document.getElementById('receipt-status').textContent = 'Processing Transaction';
  document.getElementById('receipt-message').textContent = 'Please wait while we deliver your data...';
  document.getElementById('receipt-details').style.display = 'none';
  document.getElementById('receipt-actions').style.display = 'none';

  // Store data
  window._currentCheckoutData = data;
}

function updateReceiptToSuccess(result) {
  const icon = document.getElementById('receipt-icon');
  icon.className = 'receipt-icon success';
  icon.innerHTML = `
    <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
      <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
      <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
    </svg>
  `;

  document.getElementById('receipt-status').textContent = 'Transaction Successful';
  document.getElementById('receipt-message').textContent = result.message || 'Your data has been delivered successfully!';

  const data = window._currentCheckoutData;
  if (data) {
    const providerKey = data.provider.toLowerCase() === '9mobile' ? 'ninemobile' : data.provider.toLowerCase();
    const svg = svgShapes[providerKey] || '';
    document.getElementById('receipt-provider').innerHTML = `${svg} ${data.provider.toUpperCase()}`;

    document.getElementById('receipt-phone').textContent = data.number;

    // Extract data amount & validity from server description or fallback to local
    let dataAmount = 'N/A';
    let validity = 'N/A';
    if (result.description) {
      const match = result.description.match(/Success:\s*(.+)/);
      if (match) {
        const parts = match[1].trim().split(' ');
        dataAmount = parts[0]; // e.g., 200GB
        validity = parts.slice(1).join(' '); // e.g., (120 Days) or just empty
      }
    }
    // Fallback to local data if server doesn't have it
    if (dataAmount === 'N/A') dataAmount = data.dataAmount || 'N/A';
    if (validity === 'N/A') validity = data.validity || '';

    document.getElementById('receipt-plan').textContent = `${dataAmount} / ${validity}`;

    document.getElementById('receipt-amount').textContent = `₦${Number(data.price).toLocaleString()}`;

    // Real Transaction ID from server
    document.getElementById('receipt-transaction-id').textContent = 
      result.reference || 'N/A';

    document.getElementById('receipt-balance').textContent = 
      `₦${Number(result.new_balance || 0).toLocaleString()}`;

    document.getElementById('receipt-time').textContent = 
      new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
  }

  document.getElementById('receipt-details').style.display = 'block';
  document.getElementById('receipt-actions').style.display = 'flex';
}

function updateReceiptToFailed(errorMessage) {
  const icon = document.getElementById('receipt-icon');
  icon.className = 'receipt-icon failed';
  icon.innerHTML = `
    <svg class="cross" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
      <circle class="cross__circle" cx="26" cy="26" r="25" fill="none"/>
      <path class="cross__path" fill="none" d="M16 16 36 36"/>
      <path class="cross__path" fill="none" d="M16 36 36 16"/>
    </svg>
  `;

  document.getElementById('receipt-status').textContent = 'Transaction Failed';
  document.getElementById('receipt-message').textContent = errorMessage;

  document.getElementById('receipt-details').style.display = 'none';  // Hide details on failure
  document.getElementById('receipt-actions').style.display = 'flex';
  document.getElementById('receipt-buy-again').textContent = 'Try Again';
}

// Close & Buy Again handlers (unchanged)
document.getElementById('receipt-done')?.addEventListener('click', () => {
  document.getElementById('smart-receipt-backdrop')?.classList.add('hidden');
});

document.getElementById('receipt-buy-again')?.addEventListener('click', () => {
  const backdrop = document.getElementById('smart-receipt-backdrop');
  backdrop?.classList.add('hidden');

  const data = window._currentCheckoutData;
  if (data) openCheckoutModal(data);
});

// ==================== EXPORTS ====================
window.openCheckoutModal = openCheckoutModal;
window.closeCheckoutModal = closeCheckoutModal;
window.gatherCheckoutData = gatherCheckoutData;

export { openCheckoutModal, closeCheckoutModal, onPayClicked, gatherCheckoutData };