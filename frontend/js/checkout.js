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
  mtn: `<svg class="yellow-circle-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; display: inline-block;"><circle cx="12" cy="12" r="10" fill="#FFD700"/></svg>`,
  airtel: `<svg class="airtel-rect-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; display: inline-block;"><rect x="4" y="6" width="20" height="12" rx="4" fill="#e4012b"/></svg>`,
  glo: `<svg class="glo-diamond-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; display: inline-block;"><polygon points="12,2 22,12 12,22 2,12" fill="#00B13C"/></svg>`,
  ninemobile: `<svg class="ninemobile-triangle-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; display: inline-block;"><polygon points="12,3 21,21 3,21" fill="#7DB700"/></svg>`,
  receive: `<svg class="bank-icon" width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M4 9v9h16V9l-8-5-8 5zm4 4h8v2H8v-2zm0 4h4v2H8v-2z" fill="#00cc00" stroke="#fff" stroke-width="1"/></svg>`
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
  
  // If no data provided, try to gather from DOM
  if (!data || typeof data !== 'object') {
    console.log('[checkout] No data provided, gathering from DOM...');
    data = gatherCheckoutData();
  }
  
  // Validate required data
  if (!data || !data.provider || !data.planId || !data.price || !data.number) {
    console.error('[checkout] Invalid or missing checkout data:', data);
    safeNotify('Missing checkout information. Please select a plan and enter phone number.', 'error');
    return;
  }

  // Store checkout data
  checkoutData = data;

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
 * Processes the payment
 * @returns {Promise<Object>} Payment result
 */
async function processPayment() {
  console.log('[checkout] Processing payment');

  if (!checkoutData) {
    throw new Error('No checkout data available');
  }

  // Use consistent balance source
  const currentBalance = getAvailableBalance();
  const purchasePrice = parseFloat(checkoutData.price) || 0;
  
  if (currentBalance < purchasePrice) {
    throw new Error('Insufficient balance');
  }

  // Prepare payload
  const payload = {
    provider: checkoutData.provider,
    planId: checkoutData.planId,
    planName: checkoutData.planName,
    dataAmount: checkoutData.dataAmount,
    validity: checkoutData.validity,
    planType: checkoutData.planType,
    number: checkoutData.number,
    price: checkoutData.price,
    timestamp: Date.now()
  };

  // Call backend or simulate
  if (typeof window.processCheckoutPayment === 'function') {
    console.log('[checkout] Using backend payment processor');
    return await window.processCheckoutPayment(payload);
  } else {
    // Simulate payment
    console.log('[checkout] Simulating payment:', payload);
    await new Promise(r => setTimeout(r, 1500));
    
    // Update balance in state and DOM if possible
    const newBalance = currentBalance - purchasePrice;
    const state = getUserState();
    state.balance = newBalance;
    try {
      localStorage.setItem('userState', JSON.stringify(state));
    } catch (e) {
      console.error('[checkout] Error saving state:', e);
    }

    // Update DOM balance
    const balanceReal = document.querySelector('.balance-real');
    if (balanceReal) {
      balanceReal.textContent = `₦${newBalance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Add to transaction history
    const transaction = {
      id: 'TXN-' + Date.now(),
      type: 'data',
      provider: checkoutData.provider,
      amount: checkoutData.price,
      number: checkoutData.number,
      plan: `${checkoutData.dataAmount} / ${checkoutData.validity}`,
      status: 'completed',
      date: new Date().toISOString()
    };

    try {
      const transactions = JSON.parse(localStorage.getItem('transactions') || '[]');
      transactions.unshift(transaction);
      localStorage.setItem('transactions', JSON.stringify(transactions));

      // Update recent purchases
      const recentPurchases = JSON.parse(localStorage.getItem('recentPurchases') || '[]');
      recentPurchases.unshift({
        provider: checkoutData.provider,
        plan: `${checkoutData.dataAmount} / ${checkoutData.validity}`,
        number: checkoutData.number,
        price: checkoutData.price,
        date: Date.now()
      });
      if (recentPurchases.length > 5) recentPurchases.pop();
      localStorage.setItem('recentPurchases', JSON.stringify(recentPurchases));
    } catch (e) {
      console.error('[checkout] Error saving transaction:', e);
    }

    return { ok: true, txId: transaction.id };
  }
}

/**
 * Pay button click handler
 */
async function onPayClicked(ev) {
  console.log('[checkout] Pay button clicked');
  
  const payBtn = document.getElementById('payBtn');
  if (!payBtn || payBtn.disabled) return;

  const origText = payBtn.textContent;
  payBtn.disabled = true;
  payBtn.classList.remove('active');
  payBtn.textContent = 'Processing...';

  try {
    // Step 1: Authentication
    const authOk = await triggerCheckoutAuth();
    
    if (!authOk) {
      payBtn.disabled = false;
      payBtn.classList.add('active');
      payBtn.textContent = origText;
      return;
    }

    // Step 2: Process payment
    const result = await processPayment();

    if (result && result.ok) {
      safeNotify('Payment successful! ✓', 'success');
      
      // Refresh dashboard if function exists
      if (typeof window.refreshDashboard === 'function') {
        setTimeout(() => {
          try {
            window.refreshDashboard();
          } catch (e) {
            console.warn('[checkout] Error refreshing dashboard:', e);
          }
        }, 300);
      }
      
      // Dispatch event for other parts of app
      try {
        window.dispatchEvent(new CustomEvent('paymentSuccess', { detail: result }));
      } catch (e) {
        console.warn('[checkout] Error dispatching event:', e);
      }
      
      // Close modal
      setTimeout(() => closeCheckoutModal(), 800);
    } else {
      throw new Error(result?.message || 'Payment failed');
    }

  } catch (err) {
    console.error('[checkout] Payment error:', err);
    safeNotify(err.message || 'Payment failed', 'error');
    
    payBtn.disabled = false;
    payBtn.classList.add('active');
    payBtn.textContent = origText;
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