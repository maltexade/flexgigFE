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
/**
 * Gathers checkout data from current dashboard state
 * @returns {Object|null} Checkout data object or null if incomplete
 */
function gatherCheckoutData() {
  try {
    const state = getUserState();
    
    // Get selected provider - check both .provider-box.selected and the slider
    let selectedProvider = document.querySelector('.provider-box.selected');
    
    // If no selected provider box, check for slider position
    if (!selectedProvider) {
      const slider = document.querySelector('.slider');
      if (slider) {
        // The slider has classes like 'slider mtn' - extract the provider
        const sliderClasses = slider.className.split(' ');
        const providerClass = sliderClasses.find(c => 
          ['mtn', 'airtel', 'glo', 'ninemobile'].includes(c.toLowerCase())
        );
        if (providerClass) {
          // Find the corresponding provider box
          selectedProvider = document.querySelector(`.provider-box.${providerClass}`);
        }
      }
    }
    
    if (!selectedProvider) {
      console.warn('[checkout] No provider selected');
      safeNotify('Please select a network provider', 'error');
      return null;
    }
    
    // Extract provider name from classes
    const providerClasses = selectedProvider.className.split(' ');
    let provider = providerClasses.find(c => 
      ['mtn', 'airtel', 'glo', 'ninemobile'].includes(c.toLowerCase())
    );
    
    // Handle 9mobile special case
    if (provider === 'ninemobile') {
      provider = '9mobile';
    }
    
    if (!provider) {
      console.warn('[checkout] Could not determine provider from:', providerClasses);
      safeNotify('Please select a network provider', 'error');
      return null;
    }

    // Get phone number
    const phoneInput = document.getElementById('phone-input');
    const number = phoneInput ? phoneInput.value.trim() : '';
    
    if (!number) {
      console.warn('[checkout] No phone number entered');
      safeNotify('Please enter a phone number', 'error');
      return null;
    }

    // Validate phone number format (basic check)
    if (number.length < 10) {
      console.warn('[checkout] Invalid phone number:', number);
      safeNotify('Please enter a valid phone number', 'error');
      return null;
    }

    // Get selected plan from userState first
    let selectedPlan = state.selectedPlan;
    
    // If not in state, try to find from the plan boxes on dashboard
    if (!selectedPlan) {
      const planBoxes = document.querySelectorAll('.plan-box');
      for (const box of planBoxes) {
        if (box.classList.contains('selected') || box.style.border || box.style.outline) {
          // Try to extract plan data from the plan box
          // Assuming structure: div[0]=price, div[1]=dataAmount, div[2]=validity
          const planDivs = box.querySelectorAll('div');
          if (planDivs.length >= 3) {
            selectedPlan = {
              planId: `${provider}-${Date.now()}`, // Generate temp ID
              dataAmount: planDivs[1].textContent || 'N/A',
              validity: planDivs[2].textContent || '30 Days',
              price: planDivs[0].textContent || '0',
              type: 'GIFTING' // Default, adjust based on dashboard logic if needed
            };
          }
          break;
        }
      }
    }

    // If still no plan, check localStorage for last selected plan
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

    // Parse price - handle both string and number formats
    let price = selectedPlan.price;
    if (typeof price === 'string') {
      // Remove ₦, commas, and other non-numeric characters except decimal point
      price = price.replace(/[₦,\s]/g, '').replace(/[^\d.]/g, '');
      price = parseFloat(price);
    }
    price = parseFloat(price) || 0;

    if (price <= 0) {
      console.warn('[checkout] Invalid price:', selectedPlan.price);
      safeNotify('Invalid plan price', 'error');
      return null;
    }

    // Build checkout data
    const checkoutInfo = {
      provider: provider.toUpperCase(),
      planId: selectedPlan.planId || selectedPlan.id || `${provider}-${Date.now()}`,
      planName: selectedPlan.planName || `${selectedPlan.dataAmount} Plan`,
      dataAmount: selectedPlan.dataAmount || 'N/A',
      validity: selectedPlan.validity || '30 Days',
      price: price,
      number: number,
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

// ==================== HELPER: GET BALANCE FROM DOM OR STATE ====================
function getAvailableBalance() {
  // Prefer DOM if visible and available
  const balanceReal = document.querySelector('.balance-real');
  if (balanceReal && balanceReal.textContent) {
    return parseFloat(balanceReal.textContent.replace(/[₦,\s]/g, '')) || 0;
  }
  // Fallback to state
  const state = getUserState();
  return parseFloat(state.balance) || 0;
}

// ==================== CHECKOUT MODAL FUNCTIONS ====================

/**
 * Opens the checkout modal with provided data
 * @param {Object} data - Checkout data (optional - will gather from DOM if not provided)
 * @param {string} data.provider - Network provider (MTN, AIRTEL, etc)
 * @param {string} data.planId - Plan identifier
 * @param {string} data.planName - Display name of the plan
 * @param {string} data.dataAmount - Data amount (e.g., "2GB")
 * @param {string} data.validity - Plan validity (e.g., "30 Days")
 * @param {number} data.price - Price in Naira
 * @param {string} data.number - Recipient phone number
 * @param {string} data.planType - Type of plan (AWOOF, GIFTING, etc)
 */
function openCheckoutModal(data) {
  console.log('[checkout] Opening modal with data:', data);
  
  let checkoutInfo;

  // PRIORITY 1: Use explicitly passed data (new reliable path)
  if (data && data.provider && data.planId && data.price && data.number) {
    checkoutInfo = {
      provider: data.provider.toUpperCase(),
      planId: data.planId,
      planName: data.planName || `${data.dataAmount} Plan`,
      dataAmount: data.dataAmount || 'N/A',
      validity: data.validity || '30 Days',
      price: parseFloat(data.price) || 0,

      // 👇 BOTH versions stored
      number: data.number, // formatted (UI)
      rawNumber: data.rawNumber || data.number.replace(/\s/g, ''), // clean (API)

      planType: data.planType || 'GIFTING'
    };

    console.log('[checkout] Using explicitly passed data (recommended)');
  } else {
    // FALLBACK: Old fragile gathering (keep for legacy, but log warning)
    console.warn('[checkout] No data passed — falling back to DOM scraping');
    checkoutInfo = gatherCheckoutData();
  }

  if (!checkoutInfo || !checkoutInfo.provider || !checkoutInfo.price || !checkoutInfo.number) {
    console.error('[checkout] Invalid checkout data:', checkoutInfo);
    safeNotify('Missing checkout information. Please try again.', 'error');
    return;
  }

  // Store and populate modal
  checkoutData = checkoutInfo;


  // Get modal and elements
  const modal = document.getElementById('checkoutModal');
  const payBtn = document.getElementById('payBtn');
  
  if (!modal) {
    console.error('[checkout] Modal not found');
    safeNotify('Checkout modal not available', 'error');
    return;
  }

  // Populate modal with dynamic data
  try {
    // Price (main display)
    const priceEl = document.getElementById('checkout-price');
    if (priceEl) priceEl.textContent = `₦${parseFloat(data.price).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Service name (always "Mobile Data")
    const serviceEl = document.getElementById('checkout-service');
    if (serviceEl) serviceEl.textContent = 'Mobile Data';

    // Provider with SVG icon
    const providerEl = document.getElementById('checkout-provider');
    if (providerEl) {
      let providerKey = data.provider.toLowerCase();
      if (providerKey === '9mobile') providerKey = 'ninemobile';
      const svg = svgShapes[providerKey] || '';
      providerEl.innerHTML = svg + ' ' + data.provider;
    }

    // Phone number
    const phoneEl = document.getElementById('checkout-phone');
    if (phoneEl) phoneEl.textContent = data.number;

    // Data bundle with duration (no price here)
    const dataEl = document.getElementById('checkout-data');
    if (dataEl) dataEl.textContent = `${data.dataAmount || data.planName || 'N/A'} / ${data.validity || 'N/A'}`;

    // Amount (duplicate in info section)
    const amountEls = modal.querySelectorAll('.info-row:last-child .value');
    amountEls.forEach(el => {
      el.textContent = `₦${parseFloat(data.price).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    });

    // Available balance from DOM or state
    const balance = getAvailableBalance();
    const balanceEl = document.getElementById('checkout-balance');
    if (balanceEl) balanceEl.textContent = `₦${balance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Enable pay button
    if (payBtn) {
      payBtn.disabled = false;
      payBtn.classList.add('active');
    }

    // Show modal
    modal.style.display = 'flex';
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    
    // Push state for back button
    history.pushState({ popup: true, modal: 'checkout' }, '', location.href);
    
    console.log('[checkout] Modal opened successfully');
    
  } catch (err) {
    console.error('[checkout] Error populating modal:', err);
    safeNotify('Failed to load checkout details', 'error');
  }
}

/**
 * Closes the checkout modal
 */
function closeCheckoutModal() {
  const modal = document.getElementById('checkoutModal');
  if (!modal) return;

  try {
    modal.classList.remove('active');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    
    // Clear checkout data
    checkoutData = null;

    // Handle history
    if (history.state && history.state.popup && history.state.modal === 'checkout') {
      history.back();
    }
  } catch (err) {
    console.error('[checkout] Error closing modal:', err);
  }
}

/**
 * Triggers biometric authentication if enabled, otherwise falls back to PIN
 * @returns {Promise<boolean>} Success status
 */
async function triggerCheckoutAuth() {
  console.log('[checkout] Triggering authentication');

  // Check if profile is complete
  if (!isProfileComplete()) {
    safeNotify('Please complete your profile first', 'error');
    // Try to open update profile modal if available
    try {
      const updateProfileModal = document.getElementById('updateProfileModal');
      if (updateProfileModal && typeof window.openUpdateProfileModal === 'function') {
        setTimeout(() => window.openUpdateProfileModal(), 500);
      }
    } catch (e) {
      console.warn('[checkout] Could not open profile modal:', e);
    }
    return false;
  }

  // Check if PIN is set
  if (!hasPin()) {
    safeNotify('Please set up your PIN first', 'error');
    // Try to open PIN setup modal
    try {
      const pinModal = document.getElementById('pinModal');
      if (pinModal) {
        setTimeout(() => {
          closeCheckoutModal();
          pinModal.classList.remove('hidden');
          pinModal.setAttribute('aria-hidden', 'false');
        }, 500);
      }
    } catch (e) {
      console.warn('[checkout] Could not open PIN modal:', e);
    }
    return false;
  }

  // Check biometric settings
  let bioSettings = {};
  try {
    bioSettings = JSON.parse(localStorage.getItem('biometricSettings') || '{}');
  } catch (e) {
    console.warn('[checkout] Error parsing biometric settings:', e);
  }
  
  const bioForTx = bioSettings.enabled && bioSettings.forTransactions;

  if (bioForTx && typeof window.triggerBiometric === 'function') {
    console.log('[checkout] Attempting biometric authentication');
    try {
      const bioResult = await window.triggerBiometric('authenticate', 'Confirm your purchase');
      if (bioResult && bioResult.success) {
        console.log('[checkout] Biometric authentication successful');
        return true;
      } else {
        console.log('[checkout] Biometric failed, falling back to PIN');
      }
    } catch (err) {
      console.error('[checkout] Biometric error:', err);
    }
  }

  // Fallback to PIN verification
  console.log('[checkout] Using PIN authentication');
  if (typeof window.openReauthModal === 'function') {
    return new Promise((resolve) => {
      // Set callback for reauth modal
      window._reauthCallback = (success) => {
        console.log('[checkout] PIN verification result:', success);
        delete window._reauthCallback;
        resolve(success);
      };
      
      try {
        window.openReauthModal();
      } catch (e) {
        console.error('[checkout] Error opening reauth modal:', e);
        resolve(false);
      }
    });
  }

  // If no auth method available, show a simple confirm
  console.warn('[checkout] No auth method available, using confirm dialog');
  return confirm('Confirm this purchase?');
}

/**
 * Processes the real payment via backend
 */
async function processPayment() {
  if (!checkoutData) {
    throw new Error('No checkout data available');
  }

  const payload = {
    plan_id: checkoutData.planId,
    phone: checkoutData.rawNumber || checkoutData.number.replace(/\s/g, ''), // raw 11-digit
    provider: checkoutData.provider.toLowerCase(), // mtn, airtel, glo, 9mobile
  };

  console.log('[checkout] Sending to backend:', payload);

  const token = localStorage.getItem('token'); // or however you store JWT
  if (!token) {
    throw new Error('Authentication token missing');
  }

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
    // Handle known errors
    if (result.error === 'insufficient_balance') {
      throw new Error(`Insufficient balance: ₦${result.current_balance?.toLocaleString() || '0'}`);
    }
    if (result.error === 'delivery_failed') {
      // Money was refunded
      throw new Error('Data delivery failed. Amount has been refunded.');
    }
    throw new Error(result.error || result.message || 'Payment failed');
  }

  // SUCCESS
  console.log('[checkout] Payment success:', result);

  // Update balance in UI (backend already updated DB)
  window.updateAllBalances?.(result.new_balance);

  // Optional: refresh transactions
  if (typeof renderTransactions === 'function') {
    setTimeout(renderTransactions, 500);
  }

  return { ok: true, new_balance: result.new_balance };
}

/**
 * Pay button click handler - UPDATED FOR REAL BACKEND
 */
async function onPayClicked(ev) {
  console.log('[checkout] Pay button clicked');

  const payBtn = document.getElementById('payBtn');
  if (!payBtn || payBtn.disabled) return;

  const originalText = payBtn.textContent;
  payBtn.disabled = true;
  payBtn.textContent = 'Processing...';

  try {
    // Step 1: Require authentication (biometric or PIN)
    const authSuccess = await triggerCheckoutAuth();
    if (!authSuccess) {
      throw new Error('Authentication required');
    }

    // Step 2: Call real backend
    const result = await processPayment();

    if (result && result.ok) {
      safeNotify('Data purchased successfully! ✓', 'success');

      // Optional: play success sound, confetti, etc.

      // Close modal after short delay
      setTimeout(() => closeCheckoutModal(), 800);
    }

  } catch (err) {
    console.error('[checkout] Payment failed:', err);

    let message = err.message || 'Purchase failed. Please try again.';

    // Special handling for known cases
    if (err.message.includes('Insufficient')) {
      message = err.message;
    } else if (err.message.includes('refunded')) {
      message = err.message;
      // Optionally refresh balance to show refund
      if (typeof window.refreshDashboard === 'function') {
        window.refreshDashboard();
      }
    }

    safeNotify(message, 'error');
  } finally {
    // Always re-enable button
    payBtn.disabled = false;
    payBtn.textContent = originalText;
  }
}

// ==================== INITIALIZATION ====================
domReady(() => {
  console.log('[checkout] Initializing');

  const modal = document.getElementById('checkoutModal');
  if (!modal) {
    console.warn('[checkout] Modal not found');
    return;
  }

  // Pay button
  const payBtn = document.getElementById('payBtn');
  if (payBtn) {
    payBtn.removeEventListener('click', onPayClicked);
    payBtn.addEventListener('click', onPayClicked);
  }

  // Close buttons
  const closeBtns = modal.querySelectorAll('[data-close], .close-btn');
  closeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      closeCheckoutModal();
    });
  });

  // Modal backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeCheckoutModal();
    }
  });

  // Browser back button
  window.addEventListener('popstate', (e) => {
    if (modal.classList.contains('active')) {
      closeCheckoutModal();
    }
  });

  console.log('[checkout] Initialized ✓');
});

// ==================== EXPORTS ====================
// Expose functions globally for dashboard.js to use
window.openCheckoutModal = openCheckoutModal;
window.closeCheckoutModal = closeCheckoutModal;
window.gatherCheckoutData = gatherCheckoutData;

export { openCheckoutModal, closeCheckoutModal, onPayClicked, gatherCheckoutData };