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
    
    let selectedProvider = document.querySelector('.provider-box.selected');
    
    if (!selectedProvider) {
      const slider = document.querySelector('.slider');
      if (slider) {
        const sliderClasses = slider.className.split(' ');
        const providerClass = sliderClasses.find(c => 
          ['mtn', 'airtel', 'glo', 'ninemobile'].includes(c.toLowerCase())
        );
        if (providerClass) {
          selectedProvider = document.querySelector(`.provider-box.${providerClass}`);
        }
      }
    }
    
    if (!selectedProvider) {
      console.warn('[checkout] No provider selected');
      safeNotify('Please select a network provider', 'error');
      return null;
    }
    
    const providerClasses = selectedProvider.className.split(' ');
    let provider = providerClasses.find(c => 
      ['mtn', 'airtel', 'glo', 'ninemobile'].includes(c.toLowerCase())
    );
    
    if (provider === 'ninemobile') {
      provider = '9mobile';
    }
    
    if (!provider) {
      console.warn('[checkout] Could not determine provider from:', providerClasses);
      safeNotify('Please select a network provider', 'error');
      return null;
    }

    const phoneInput = document.getElementById('phone-input');
    const number = phoneInput ? phoneInput.value.trim() : '';
    
    if (!number) {
      console.warn('[checkout] No phone number entered');
      safeNotify('Please enter a phone number', 'error');
      return null;
    }

    if (number.length < 10) {
      console.warn('[checkout] Invalid phone number:', number);
      safeNotify('Please enter a valid phone number', 'error');
      return null;
    }

    let selectedPlan = state.selectedPlan;
    
    if (!selectedPlan) {
      const planBoxes = document.querySelectorAll('.plan-box');
      for (const box of planBoxes) {
        if (box.classList.contains('selected') || box.style.border || box.style.outline) {
          const planDivs = box.querySelectorAll('div');
          if (planDivs.length >= 3) {
            selectedPlan = {
              planId: `${provider}-${Date.now()}`,
              dataAmount: planDivs[1].textContent || 'N/A',
              validity: planDivs[2].textContent || '30 Days',
              price: planDivs[0].textContent || '0',
              type: 'GIFTING'
            };
          }
          break;
        }
      }
    }

    if (!selectedPlan) {
      try {
        const lastPlan = localStorage.getItem('lastSelectedPlan');
        if (lastPlan) {
          selectedPlan = JSON.parse(lastPlan);
        }
      } catch (e) {
        console.warn('[checkout] Error reading lastSelectedPlan:', e);
      }
    }

    if (!selectedPlan || !selectedPlan.planId) {
      console.warn('[checkout] No plan selected');
      safeNotify('Please select a data plan', 'error');
      return null;
    }

    let price = selectedPlan.price;
    if (typeof price === 'string') {
      price = price.replace(/[₦,\s]/g, '').replace(/[^\d.]/g, '');
      price = parseFloat(price);
    }
    price = parseFloat(price) || 0;

    if (price <= 0) {
      console.warn('[checkout] Invalid price:', selectedPlan.price);
      safeNotify('Invalid plan price', 'error');
      return null;
    }

    const checkoutInfo = {
      provider: provider.toUpperCase(),
      planId: selectedPlan.planId || selectedPlan.id || `${provider}-${Date.now()}`,
      planName: selectedPlan.planName || `${selectedPlan.dataAmount} Plan`,
      dataAmount: selectedPlan.dataAmount || 'N/A',
      validity: selectedPlan.validity || '30 Days',
      price: price,
      number: number,
      rawNumber: number.replace(/\s/g, ''),
      planType: selectedPlan.type || 'GIFTING'
    };

    console.log('[checkout] Gathered data successfully:', checkoutInfo);
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
    if (priceEl) priceEl.textContent = `₦${parseFloat(data.price).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const serviceEl = document.getElementById('checkout-service');
    if (serviceEl) serviceEl.textContent = 'Mobile Data';

    const providerEl = document.getElementById('checkout-provider');
    if (providerEl) {
      let providerKey = data.provider.toLowerCase();
      if (providerKey === '9mobile') providerKey = 'ninemobile';
      const svg = svgShapes[providerKey] || '';
      providerEl.innerHTML = svg + ' ' + data.provider;
    }

    const phoneEl = document.getElementById('checkout-phone');
    if (phoneEl) phoneEl.textContent = data.number;

    const dataEl = document.getElementById('checkout-data');
    if (dataEl) dataEl.textContent = `${data.dataAmount || data.planName || 'N/A'} / ${data.validity || 'N/A'}`;

    const amountEls = modal.querySelectorAll('.info-row:last-child .value');
    amountEls.forEach(el => {
      el.textContent = `₦${parseFloat(data.price).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  const token = localStorage.getItem('token');
  if (!token) {
    throw new Error('Authentication token missing');
  }

  // Wrap the entire backend call in withLoader
  return await withLoader(async () => {
    const response = await fetch('https://api.flexgig.com.ng/api/purchase-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
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

    // Optional: Update balance if backend returns new_balance
    if (result.new_balance !== undefined) {
      window.updateAllBalances?.(result.new_balance);
    }

    // Refresh transactions if needed
    if (typeof renderTransactions === 'function') {
      setTimeout(renderTransactions, 500);
    }

    return { ok: true, new_balance: result.new_balance };
  });
}

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
    if (!authSuccess) throw new Error('Authentication cancelled or failed');

    const result = await processPayment();

    if (result && result.ok) {
      safeNotify('Data purchased successfully! ✓', 'success');
      setTimeout(() => closeCheckoutModal(), 800);
    }
  } catch (err) {
    console.error('[checkout] Payment failed:', err);
    let message = err.message || 'Purchase failed. Please try again.';
    if (err.message?.includes('Insufficient')) message = err.message;
    if (err.message?.includes('refunded')) message = err.message;

    safeNotify(message, 'error');
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
          try {
            await processPayment();
            if (window._checkoutPinResolve) window._checkoutPinResolve(true);
          } catch (err) {
            safeNotify(err.message || 'Purchase failed after biometric', 'error');
            if (window._checkoutPinResolve) window._checkoutPinResolve(false);
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
        try {
          await processPayment();
          if (window._checkoutPinResolve) window._checkoutPinResolve(true);
        } catch (err) {
          safeNotify(err.message || 'Purchase failed after PIN', 'error');
          if (window._checkoutPinResolve) window._checkoutPinResolve(false);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        safeNotify(data.message || 'Invalid PIN', 'error');
        resetPin();
      }
    } catch (err) {
      safeNotify('PIN verification failed', 'error');
      resetPin();
    }
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

// ==================== EXPORTS ====================
window.openCheckoutModal = openCheckoutModal;
window.closeCheckoutModal = closeCheckoutModal;
window.gatherCheckoutData = gatherCheckoutData;

export { openCheckoutModal, closeCheckoutModal, onPayClicked, gatherCheckoutData };