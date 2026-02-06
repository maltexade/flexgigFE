/* checkout.js - Production-ready checkout modal handler
   Handles checkout modal display, payment processing, and authentication
   Integrates with dashboard.js for user state and biometric/PIN verification
*/

console.log('[checkout] Module loaded 🛒');

'use strict';
// ==================== STATE ====================
let checkoutData = null; // Stores current checkout information

// ======= SAFE USER STATE ACCESS (use window.getUserState if defined) =======
const safeGetUserState = () => {
  try {
    if (typeof window.getUserState === 'function') {
      return window.getUserState() || {};
    }
    const raw = localStorage.getItem('userState');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('[checkout] safeGetUserState parse error', e);
    return {};
  }
};


// Synchronous PIN check using localStorage
function checkPinExists(context = 'checkout') {
  try {
    const hasPin = localStorage.getItem('hasPin');
    // localStorage stores everything as strings, so convert to boolean
    return hasPin === 'true';
  } catch (err) {
    console.error('[checkout] Failed to read PIN from localStorage:', err);
    return false; // fail-safe: assume no PIN
  }
}

// Usage example
if (checkPinExists()) {
  console.log('PIN exists, proceed.');
} else {
  console.log('No PIN found, prompt user.');
}






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
      showToast('Please select a network provider', 'error');
      return null;
    }

    let provider = ['mtn', 'airtel', 'glo', 'ninemobile'].find(p => selectedProvider.classList.contains(p));
    if (provider === 'ninemobile') provider = '9mobile';
    if (!provider) {
      showToast('Invalid provider selected', 'error');
      return null;
    }

    // Phone
    const phoneInput = document.getElementById('phone-input');
    const number = phoneInput?.value.trim() || '';
    if (!number || number.length < 10) {
      showToast('Please enter a valid phone number', 'error');
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
      showToast('Please select a data plan', 'error');
      return null;
    }

    if (selectedPlan.price <= 0) {
      showToast('Invalid plan price', 'error');
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
    showToast('Failed to prepare checkout', 'error');
    return null;
  }
}



// ==================== DOM READY ====================
function domReady(cb) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cb);
  } else cb();
}




const hasPin = () => {
  try {
    const state = getUserState();
    return !!(state.pin && state.pin.length === 4);
  } catch (e) {
    return false;
  }
};

function isProfileComplete() {
  const state = safeGetUserState();

  // Checkout phone input
  const checkoutPhone =
    document.getElementById('phone-input')?.value?.trim() ||
    state.number; // fallback if already saved

  return !!(
    checkoutPhone &&
    checkoutPhone.length >= 10
  );
}



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

  // ────────────────────────────────────────────────
  // 1. Gather and validate checkout data
  // ────────────────────────────────────────────────
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
    showToast('Missing checkout information. Please try again.', 'error');
    return;
  }

  // Save reference
  checkoutData = checkoutInfo;

  // Save price debug/info
  localStorage.setItem('lastCheckoutPrice', checkoutInfo.price.toString());
  console.log('[PRICE DEBUG] Saved to localStorage:', {
    price: checkoutInfo.price,
    savedValue: localStorage.getItem('lastCheckoutPrice'),
    isSpecial: checkoutInfo.planId.includes('special') || 
               checkoutInfo.planName?.toLowerCase().includes('special')
  });

  // ────────────────────────────────────────────────
  // 2. Get modal element early
  // ────────────────────────────────────────────────
  const modal = document.getElementById('checkoutModal');
  if (!modal) {
    console.error('[checkout] Modal element not found');
    showToast('Checkout modal not available', 'error');
    return;
  }

  const payBtn = document.getElementById('payBtn');

  try {
    // ────────────────────────────────────────────────
    // 3. Populate content BEFORE showing (critical for perceived speed)
    // ────────────────────────────────────────────────
    const priceEl = document.getElementById('checkout-price');
    if (priceEl) {
      priceEl.textContent = `₦${checkoutInfo.price.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
    }

    const serviceEl = document.getElementById('checkout-service');
    if (serviceEl) serviceEl.textContent = 'Mobile Data';

    const providerEl = document.getElementById('checkout-provider');
    if (providerEl) {
      let providerKey = checkoutInfo.provider.toLowerCase() === '9mobile' 
        ? 'ninemobile' 
        : checkoutInfo.provider.toLowerCase();
      const svg = svgShapes?.[providerKey] || '';
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
    if (balanceEl) {
      balanceEl.textContent = `₦${balance.toLocaleString('en-NG', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`;
    }

    if (payBtn) {
      payBtn.disabled = false;
      payBtn.classList.add('active');
    }

    console.log('[checkout] Modal content populated successfully');

    // ────────────────────────────────────────────────
    // 4. Let ModalManager handle visibility, animation, stack, history, focus trap
    // ────────────────────────────────────────────────
    if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
      // Optional: clean any stale state first
      if (ModalManager.getOpenModals().includes('checkoutModal')) {
        console.warn('[checkout] checkoutModal was already in stack — forcing clean close first');
        ModalManager.forceCloseModal?.('checkoutModal');
      }

      ModalManager.openModal('checkoutModal');
      console.log('[checkout] Successfully delegated open to ModalManager');
    } else {
      // Very safe fallback only if ModalManager is completely missing
      console.warn('[checkout] ModalManager not found — using basic fallback open');
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    }

  } catch (err) {
    console.error('[checkout] Error preparing or opening checkout modal:', err);
    showToast('Failed to load checkout details', 'error');
  }
}


function requireTransactionReady() {
  try {
    // 1. Profile check
    const profileCompleted = localStorage.getItem('profileCompleted') === 'true';
    if (!profileCompleted) {
      showToast('Please complete your profile before making transactions.', 'error');

      if (typeof window.openUpdateProfileModal === 'function') {
        window.openUpdateProfileModal();
        ModalManager.openModal('updateProfileModal');
        console.log('open modals:', ModalManager.getOpenModals());
      } else if (typeof window.openProfileModal === 'function') {
        window.openProfileModal();
      }
      return false;
    }

    // 2. PIN check
    const hasPin = localStorage.getItem('hasPin') === 'true';
    if (!hasPin) {
      showToast('Please set up your transaction PIN before proceeding.', 'error');

      // Delay opening modal slightly for smooth animation
      setTimeout(() => {
        ModalManager.openModal('pinModal');
      }, 300);

      // STOP further execution until user sets PIN
      return false;
    }

    // All checks passed
    return true;
  } catch (err) {
    console.error('[checkout] requireTransactionReady error:', err);
    showToast('Security check failed. Please reload the page.', 'error');
    return false;
  }
}




// Extracted payment logic so we can call it after security checks
async function continueCheckoutFlow() {
  const payBtn = document.getElementById('payBtn');
  if (!payBtn) return;

  const originalText = payBtn.textContent;
  payBtn.disabled = true;
  payBtn.textContent = 'Processing...';

  try {
    checkoutData = gatherCheckoutData();
    if (!checkoutData) throw new Error('Invalid checkout data');

    // Trigger dedicated PIN modal for verification (if used)
    const authSuccess = await triggerCheckoutAuthWithDedicatedModal();
    if (!authSuccess) {
      // User cancelled PIN entry
      showToast('Payment cancelled', 'info');
      return;
    }

    // Force-save price again (extra safety)
if (checkoutData && checkoutData.price && !isNaN(checkoutData.price)) {
  localStorage.setItem('lastCheckoutPrice', checkoutData.price.toString());
  console.log('[PRICE LOCK] Re-saved price before receipt:', checkoutData.price);
}
    showProcessingReceipt(checkoutData);

    const result = await processPayment();

    // Keep Processing spinner — poll will handle switching
    pollForFinalStatus(result.reference);

  } catch (err) {
    console.error('[checkout] Payment failed:', err);

    if (err.message && err.message.includes('Insufficient balance')) {
      const match = err.message.match(/₦([\d,]+)/);
      const currentBal = match ? parseFloat(match[1].replace(/,/g, '')) : 0;
      updateReceiptToInsufficient('You do not have enough balance to complete this purchase.', currentBal);
    } else {
      updateReceiptToFailed(err.message || 'Purchase failed. Please try again.');
    }
    closeCheckoutModal();
  } finally {
    // restore UI
    const payBtnFinal = document.getElementById('payBtn');
    if (payBtnFinal) {
      payBtnFinal.disabled = false;
      payBtnFinal.textContent = originalText;
    }
  }
}





// Replacement for closeCheckoutModal function in checkout.js
function closeCheckoutModal() {
  const modalId = 'checkoutModal';
  const modal = document.getElementById(modalId);
  if (!modal) return;

  try {
    // Stop biometric
    if (typeof window.stopModalBiometricRewarming === 'function') {
      window.stopModalBiometricRewarming();
    }

    // Let ModalManager close
    if (window.ModalManager && typeof window.ModalManager.forceCloseModal === 'function') {
      window.ModalManager.forceCloseModal(modalId);
    } else {
      // Fallback
      modal.setAttribute('aria-hidden', 'true');
      modal.classList.remove('active');
      modal.style.display = 'none';
      document.body.classList.remove('modal-open');
    }

    // Extra force-remove active + clear data
    modal.classList.remove('active');
    checkoutData = null;
    history.replaceState({ isModal: false }, '', window.location.pathname);

    console.log('[checkout] Close completed with extra cleanup');
  } catch (err) {
    console.error('[checkout] Close error:', err);
  }
}


// Reset UI after successful purchase (FULL CLEAN RESET TO MTN)
// Replace your resetCheckoutUI() function (lines 185-248) with this:
function resetCheckoutUI() {
  console.log('[checkout] 🧹 Performing full UI reset after successful purchase');

  // 1. Clear phone input
  const phoneInput = document.getElementById('phone-input');
  if (phoneInput) {
    phoneInput.value = '';
    phoneInput.classList.remove('invalid');
    console.log('[checkout] ✓ Phone cleared');
  }

  // 2. Remove .selected from ALL plan boxes (dashboard + modal) + remove provider classes
  const providerClasses = ['mtn', 'airtel', 'glo', 'ninemobile'];
  document.querySelectorAll('.plan-box.selected').forEach(el => {
    el.classList.remove('selected', ...providerClasses);
    // Also remove the price styling
    const amount = el.querySelector('.plan-amount');
    if (amount) amount.classList.remove('plan-price');
  });
  console.log('[checkout] ✓ All selected plans cleared');

  // 3. Remove active from all provider boxes
  document.querySelectorAll('.provider-box').forEach(el => {
    el.classList.remove('active', 'selected');
  });

  // 4. Set MTN as active provider
  const mtnBox = document.querySelector('.provider-box.mtn');
  if (mtnBox) {
    mtnBox.classList.add('active');
    console.log('[checkout] ✓ MTN set as active');
  }

  // 5. Move slider to MTN (call dashboard function if available, else do it manually)
  const slider = document.querySelector('.provider-grid .slider, .slider');
  if (slider && mtnBox) {
    // Try to use dashboard's function first
    if (typeof window.moveSliderTo === 'function') {
      window.moveSliderTo(mtnBox);
      console.log('[checkout] ✓ Slider moved via moveSliderTo()');
    } else {
      // Manual fallback
      slider.className = 'slider mtn';
      const svgPaths = {
        mtn: '/frontend/svg/MTN-icon.svg'
      };
      slider.innerHTML = `
        <img src="${svgPaths.mtn}" alt="MTN" class="provider-icon" />
        <div class="provider-name">MTN</div>
      `;
      
      // Position slider on MTN box
      const boxRect = mtnBox.getBoundingClientRect();
      const gridRect = mtnBox.parentElement.getBoundingClientRect();
      const scrollContainer = mtnBox.closest('.provider-grid');
      const scrollLeft = scrollContainer?.scrollLeft || 0;
      const left = boxRect.left - gridRect.left + scrollLeft;
      const top = boxRect.top - gridRect.top;
      
      slider.style.left = `${left}px`;
      slider.style.top = `${top}px`;
      slider.style.width = `${boxRect.width}px`;
      slider.style.height = `${boxRect.height}px`;
      slider.style.transition = 'all 0.3s ease';
      
      console.log('[checkout] ✓ Slider moved manually');
    }
  }

  // 6. Reset plans row to MTN
  const plansRow = document.querySelector('.plans-row');
  if (plansRow) {
    plansRow.classList.remove(...providerClasses);
    plansRow.classList.add('mtn');
    console.log('[checkout] ✓ Plans row set to MTN');
  }

  // 7. Re-render MTN plans (critical - ensures fresh MTN plans are shown)
  if (typeof window.renderDashboardPlans === 'function') {
    window.renderDashboardPlans('mtn');
    console.log('[checkout] ✓ MTN plans re-rendered');
  }
  
  if (typeof window.renderModalPlans === 'function') {
    window.renderModalPlans('mtn');
    console.log('[checkout] ✓ Modal plans re-rendered');
  }

  // 8. Re-attach plan listeners
  if (typeof window.attachPlanListeners === 'function') {
    window.attachPlanListeners();
    console.log('[checkout] ✓ Plan listeners re-attached');
  }

  // 9. Clear saved state completely
  try {
    // Clear userState but keep user info
    const rawState = localStorage.getItem('userState');
    if (rawState) {
      const state = JSON.parse(rawState);
      // Only clear transaction-related data
      delete state.selectedPlan;
      delete state.planId;
      delete state.provider;
      delete state.number;
      localStorage.setItem('userState', JSON.stringify(state));
    }
    
    // Remove specific checkout keys
    localStorage.removeItem('lastSelectedPlan');
    
    // Clear session state (prevents restoreEverything from bringing back old data)
    sessionStorage.removeItem('__fg_app_state_v2');
    
    // Clear provider-specific plan tracking
    if (typeof window.selectedPlanByProvider === 'object') {
      Object.keys(window.selectedPlanByProvider).forEach(key => {
        delete window.selectedPlanByProvider[key];
      });
    }
    
    console.log('[checkout] ✓ All saved states cleared');
  } catch (err) {
    console.warn('[checkout] Failed to clear storage during reset:', err);
  }

  // 10. Update UI state (continue button, contact/cancel button)
  if (typeof window.updateContinueState === 'function') {
    window.updateContinueState();
    console.log('[checkout] ✓ Continue button updated');
  }
  
  if (typeof window.updateContactOrCancel === 'function') {
    window.updateContactOrCancel();
    console.log('[checkout] ✓ Contact/cancel button updated');
  }

  // 11. Save the clean state
  if (typeof window.saveUserState === 'function') {
    window.saveUserState();
    console.log('[checkout] ✓ Clean state saved');
  }
  
  if (typeof window.saveCurrentAppState === 'function') {
    window.saveCurrentAppState();
    console.log('[checkout] ✓ App state saved');
  }

  console.log('[checkout] ✅ Full reset complete — fresh MTN state restored');
}

// ==================== AUTHENTICATION WITH DEDICATED PIN MODAL ====================
async function triggerCheckoutAuthWithDedicatedModal() {
  return new Promise((resolve) => {
    window._checkoutPinResolve = (authResult) => {
  delete window._checkoutPinResolve;
  resolve(authResult);
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
  if (!checkoutData) throw new Error('No checkout data');

  const payload = {
    plan_id: checkoutData.planId,
    phone: checkoutData.rawNumber || checkoutData.number.replace(/\s/g, ''),
    provider: checkoutData.provider.toLowerCase(),
  };

  const response = await fetch('https://api.flexgig.com.ng/api/purchase-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
  });

  const result = await response.json();

  if (!response.ok) {
    if (result.error === 'insufficient_balance') {
      throw new Error(`Insufficient balance: ₦${result.current_balance?.toLocaleString() || '0'}`);
    }
    throw new Error(result.message || 'Purchase failed');
  }

  // Save for later use
  checkoutData.reference = result.reference;
  checkoutData.new_balance = result.new_balance;

  return result;  // Contains status: 'success', 'pending', or 'failed'
}




// Main pay handler - minimal wrapper to run security checks first
async function onPayClicked(ev) {
  console.log('[checkout] Pay button clicked');
  ev?.preventDefault?.();

  // Do not disable the button until security checks pass
  const ready = await requireTransactionReady();
  if (!ready) {
    console.log('[checkout] Transaction guard failed or user needs to complete setup');
    return;
  }

  // If we get here, profile + PIN are OK — proceed
  await continueCheckoutFlow();
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
  window.isBiometricEnabledForTx = isBiometricEnabledForTx;

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
        verifyPin(currentPin);

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
          verifyPin(currentPin);

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
// === BIOMETRIC AUTH HANDLER (UPDATED) ===
if (biometricBtn) {
  biometricBtn.addEventListener('click', async () => {
    await handleBiometricAuth();  // Reuse the same function for button and auto-trigger
  });
}

function showCheckoutPinModal() {
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  updateBiometricButton();
  resetPin();

  // Always show PIN keypad first
  // User must tap biometric button manually
  inputs[0]?.focus();

}

// === SHARED BIOMETRIC AUTH FUNCTION ===
async function handleBiometricAuth() {

  try {
    biometricBtn.disabled = true;
    biometricBtn.classList.add('loading'); // optional visual state

    let result = { success: false };

try {
  if (typeof verifyBiometrics === 'function') {
    result = await verifyBiometrics();
  } else if (typeof startAuthentication === 'function') {
    result = await startAuthentication();
  }
} catch (e) {
  console.warn('[checkout-pin] Biometric failed:', e);
}


    if (result?.success) {
  console.log('[checkout-pin] Biometric success');

  hideCheckoutPinModal();
  window._checkoutPinResolve?.({
  success: true,
  biometricToken: result.token // issued by backend
});

  return;
}


    showToast('Biometric failed or cancelled. Enter your PIN', 'info');
    inputs[0]?.focus();

  } catch (err) {
    console.warn('[checkout-pin] Biometric error:', err);
    showToast('Biometric unavailable. Use your PIN', 'info');
    inputs[0]?.focus();

  } finally {
    biometricBtn.disabled = false;
    biometricBtn.classList.remove('loading');
  }
}

  // Forgot PIN
  if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof openForgetPinFlow === 'function') openForgetPinFlow();
      if (window._checkoutPinResolve) window._checkoutPinResolve(false);
    });
  }
  /* Global Forget PIN Flow — works from checkout, dashboard, anywhere */
window.openForgetPinFlow = async function openForgetPinFlow() {
  return await withLoader(async () => {

    // Find the link that triggered it (if any)
    const triggerLink =
      document.activeElement ||
      document.querySelector('#checkout-forgot-pin-link') ||
      document.querySelector('[href="#forget-pin"]');

    let originalText = '';
    if (triggerLink) {
      originalText = triggerLink.textContent;
      triggerLink.textContent = 'Processing...';
      triggerLink.classList.add('processing');
      triggerLink.disabled = true;
    }

    try {
      // === RESOLVE EMAIL SMARTLY ===
      let email =
        window.currentUser?.email ||
        window.__SERVER_USER_DATA__?.email ||
        localStorage.getItem('userEmail') ||
        localStorage.getItem('email');

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        email = prompt('Enter your registered email to receive OTP:');
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          throw new Error('Valid email required');
        }
        email = email.trim().toLowerCase();
      }

      // === SEND OTP ===
      const resp = await fetch('https://api.flexgig.com.ng/auth/resend-otp', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const result = await resp.json();

      if (!resp.ok) {
        throw new Error(result.message || 'Failed to send OTP');
      }

      showToast(`OTP sent to ${email}`, 'success');

      // === OPEN RESET PIN MODAL ===
      const modal = document.getElementById('resetPinModal');
      if (modal) {
        hideCheckoutPinModal();
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        const emailInput = modal.querySelector(
          'input[type="email"], #reset-pin-email'
        );
        if (emailInput) emailInput.value = email;

        modal.querySelector('input, button')?.focus();
      } else {
        showToast(
          'OTP sent! Please check your email and reset PIN from profile.',
          'info'
        );
      }

    } catch (err) {
      console.error('openForgetPinFlow error:', err);
      showToast(err.message || 'Failed to start PIN reset', 'error');
      throw err; // ⬅ ensures loader closes properly
    } finally {
      if (triggerLink) {
        triggerLink.textContent = originalText || 'Forgot PIN?';
        triggerLink.classList.remove('processing');
        triggerLink.disabled = false;
      }
    }
  });
};


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
async function verifyPin(pin) {
  return await withLoader(async () => {
    let raw = '';
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

      // ✅ Read raw response as text first
      raw = await res.text();
      let data = {};

      // ✅ Try parse JSON safely
      try {
        data = raw ? JSON.parse(raw) : {};
        // Handle nested error object
        if (data.error) {
          data.code = data.error.code;
          data.message = data.error.message;
        }
      } catch (_) {
        console.warn('[verifyPin] JSON parse failed, raw:', raw);
      }

      // ✅ Log full info for debugging
      console.warn('[PIN VERIFY RESPONSE]', {
        status: res.status,
        code: data.code,
        message: data.message,
        raw
      });

      // ✅ Success path
      if (res.ok && data.pinToken) {
  hideCheckoutPinModal();
  window._checkoutPinResolve?.({
    success: true,
    pinToken: data.pinToken
  });
  return;
}


      // ❌ Error handling based on real server code/message
      switch (data.code) {
        case 'WRONG_PIN':
          showToast('Incorrect PIN. Try again.', 'error');
          resetPin();
          break;

        case 'PIN_NOT_SET':
          showToast('You have not set a PIN yet.', 'warning');
          hideCheckoutPinModal();
          break;

        case 'PIN_RATE_LIMITED':
          showToast('Too many attempts. Please wait.', 'error');
          break;

        case 'INVALID_SESSION':
          showToast('Session expired. Please login again.', 'error');
          forceLogout?.();
          break;

        case 'PIN_SERVICE_UNAVAILABLE':
          showToast('Network issue. Try again shortly.', 'error');
          break;

        default:
          showToast(data.message || 'PIN verification failed.', 'error');
          resetPin();
      }

    } catch (err) {
      console.error('[verifyPin] fetch error:', err);
      console.log('RAW PIN RESPONSE:', raw);
      showToast('Unable to verify PIN. Check your connection.', 'error');
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

// ==================== SMART RECEIPT SCROLL LOCK ====================
function lockScrollForReceiptModal(backdropEl, lock = true) {
  if (!backdropEl) return;

  if (lock) {
    const scrollY = window.scrollY;

    backdropEl.dataset.scrollY = scrollY;

    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
  } else {
    const scrollY = parseInt(backdropEl.dataset.scrollY || '0', 10);

    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.overflow = '';

    window.scrollTo(0, scrollY);
    delete backdropEl.dataset.scrollY;
  }
}


// ==================== SMART RECEIPT MODAL FUNCTIONS ====================

// ==================== SMART RECEIPT MODAL FUNCTIONS ====================

function showProcessingReceipt(data) {
  const backdrop = document.getElementById('smart-receipt-backdrop');
  if (!backdrop) return console.error('[checkout] Receipt modal not found');

  backdrop.classList.remove('hidden');
    backdrop.setAttribute('aria-hidden', 'false');


    lockScrollForReceiptModal(backdrop, true);


  // Reset to processing
  const icon = document.getElementById('receipt-icon');
  icon.className = 'receipt-icon processing';
  icon.innerHTML = '<div class="spinner"></div>';

  document.getElementById('receipt-status').textContent = 'Processing Transaction';
  document.getElementById('receipt-message').textContent = 'Please hold on while we deliver your data...';
  document.getElementById('receipt-details').style.display = 'none';
  document.getElementById('receipt-actions').style.display = 'none';

  // Store data
  window._currentCheckoutData = data;
}

async function updateReceiptToSuccess(result) {
  const icon = document.getElementById('receipt-icon');
  icon.className = 'receipt-icon success';
  icon.innerHTML = `
    <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
      <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
      <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
    </svg>
  `;

  document.getElementById('receipt-status').textContent = 'Transaction Successful';
  document.getElementById('receipt-message').textContent = 'Your data has been delivered successfully!';

  const data = window._currentCheckoutData;
  let transactionRef = 'Unavailable';

  // === FETCH LATEST TRANSACTION & GET REFERENCE ===
  try {
    const res = await fetch('https://api.flexgig.com.ng/api/transactions?limit=20', {
      credentials: 'include'
    });
    const json = await res.json();
    const txs = json.items || json || [];

    const match = txs.find(tx => 
      Math.abs(tx.amount - data.price) <= 10 &&
      tx.reference &&
      tx.reference.startsWith('data_') &&
      tx.reference.includes('bcee735e')
    );

    if (match?.reference) {
      transactionRef = match.reference;
    } else {
      const fallback = txs.find(tx => tx.reference?.startsWith('data_'));
      transactionRef = fallback?.reference || 'Unavailable';
    }
  } catch (e) {
    console.warn('Failed to fetch transaction reference:', e);
  }

  const displayAmount = result?.amount ?? data?.price ?? 0;

  // === FILL RECEIPT DETAILS ===
  if (data) {
    const providerKey = data.provider.toLowerCase() === '9mobile' ? 'ninemobile' : data.provider.toLowerCase();
    const svg = svgShapes[providerKey] || '';
    document.getElementById('receipt-provider').innerHTML = `${svg} ${data.provider.toUpperCase()}`;
    
    document.getElementById('receipt-phone').textContent = data.number;
    document.getElementById('receipt-plan').textContent = `${data.dataAmount} / ${data.validity}`;
    document.getElementById('receipt-amount').textContent = 
      `₦${Number(displayAmount).toLocaleString()}`;
    document.getElementById('receipt-transaction-id').textContent = transactionRef;
    document.getElementById('receipt-balance').textContent = 
      `₦${Number(result?.new_balance ?? data?.new_balance ?? 0).toLocaleString()}`;
    document.getElementById('receipt-time').textContent = new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
  }

  document.getElementById('receipt-details').style.display = 'block';
  document.getElementById('receipt-actions').style.display = 'flex';

  // === AUTO-UPDATE RECENT TRANSACTIONS LIST INSTANTLY ===
  if (typeof window.renderRecentTransactions === 'function') {
    try {
      // Manually add the new data tx (consistent instant update)
      const newTx = {
        id: transactionRef, // Use ref as ID if available
        phone: data.number,
        provider: data.provider,
        data: data.dataAmount, // Explicit GB
        description: ` ${data.dataAmount} Data Purchase`, // Ensure regex match
        status: 'success',
        timestamp: new Date().toISOString(),
        amount: data.price
      };

      let currentRecent = [];
      try {
        const stored = localStorage.getItem('recentTransactions');
        if (stored) currentRecent = JSON.parse(stored);
      } catch (e) {}

      // Dedupe and add new
      currentRecent = currentRecent.filter(tx => 
        tx.phone !== newTx.phone || tx.amount !== newTx.amount
      );
      currentRecent.unshift(newTx);
      currentRecent = currentRecent.slice(0, 5);

      localStorage.setItem('recentTransactions', JSON.stringify(currentRecent));

      // Render immediately
      window.renderRecentTransactions(currentRecent);
      console.log('[checkout] Recent transactions auto-updated after success (manual add)');
    } catch (err) {
      console.warn('[checkout] Failed to auto-refresh recent transactions:', err);
    }
  }
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

  document.getElementById('receipt-details').style.display = 'none';

  const actions = document.getElementById('receipt-actions');
  actions.style.display = 'flex';
  actions.innerHTML = `
    <button id="receipt-done" style="flex:1; background:#333; color:white; border:none; border-radius:50px; padding:14px; font-weight:600;">
      Close
    </button>
  `;

  // Reattach close handler
  document.getElementById('receipt-done')?.addEventListener('click', () => {
    const backdrop = document.getElementById('smart-receipt-backdrop');
    if (backdrop) {
      backdrop.classList.add('hidden');
      backdrop.setAttribute('aria-hidden', 'true');
      lockScrollForReceiptModal(backdrop, false);
      closeCheckoutModal();
    }
  });
}

function updateReceiptToInsufficient(message, currentBalance = 0) {
  const icon = document.getElementById('receipt-icon');
  icon.className = 'receipt-icon failed';
  icon.innerHTML = `
    <svg class="cross" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
      <circle class="cross__circle" cx="26" cy="26" r="25" fill="none"/>
      <path class="cross__path" fill="none" d="M16 16 36 36"/>
      <path class="cross__path" fill="none" d="M16 36 36 16"/>
    </svg>
  `;

  document.getElementById('receipt-status').textContent = 'Insufficient Balance';
  document.getElementById('receipt-message').innerHTML = `
    ${message}<br><br>
    <strong>Current balance: ₦${Number(currentBalance).toLocaleString()}</strong><br><br>
    Please fund your wallet to complete this purchase.
  `;

  document.getElementById('receipt-details').style.display = 'none';

  const actions = document.getElementById('receipt-actions');
  actions.style.display = 'flex';
  actions.innerHTML = `
    <button id="receipt-fund-wallet" style="flex:1; background:linear-gradient(90deg,#00d4aa,#00bfa5); color:white; border:none; border-radius:50px; padding:14px; font-weight:600; margin-right:8px;">
      Fund Wallet
    </button>
    <button id="receipt-done" style="flex:1; background:#333; color:white; border:none; border-radius:50px; padding:14px; font-weight:600;">
      Close
    </button>
  `;

  // Add click handler for Fund Wallet
   document.getElementById('receipt-fund-wallet')?.addEventListener('click', () => {
    // Close the receipt modal properly
    const backdrop = document.getElementById('smart-receipt-backdrop');
    if (backdrop) {
      backdrop.classList.add('hidden');
      backdrop.setAttribute('aria-hidden', 'true');
      lockScrollForReceiptModal(backdrop, false);
    }

    // Now open fund wallet modal
    if (window.ModalManager?.openModal) {
      window.ModalManager.openModal('addMoneyModal');
      console.log('✓ Fund modal opened', 'success');
    } else {
      console.warn('⚠️ ModalManager not available');
      // Fallback: redirect to fund page if needed
      // window.location.href = '/wallet';
    }
  });

  document.getElementById('receipt-done')?.addEventListener('click', () => {
    const backdrop = document.getElementById('smart-receipt-backdrop');
    backdrop?.classList.add('hidden');
    backdrop?.setAttribute('aria-hidden', 'true');
    lockScrollForReceiptModal(backdrop, false);
  });
}


function updateReceiptToPending(tx = null) {
  const icon = document.getElementById('receipt-icon');
  icon.className = 'receipt-icon pending';
  icon.innerHTML = `
    <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
      <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none" stroke="#FF9500" stroke-width="2"/>
      <path d="M26 16V26L32 32" stroke="#FF9500" stroke-width="3" stroke-linecap="round"/>
    </svg>
  `;

  document.getElementById('receipt-status').textContent = 'Pending Delivery';
  document.getElementById('receipt-message').textContent = 'Your data is being delivered. This may take a few minutes due to network. Money safe - auto refund on fail.';

  const data = window._currentCheckoutData;

  
  const displayAmount = tx?.amount ?? data?.price ?? 0;
  const displayBalance = tx?.new_balance ?? data?.new_balance ?? 0;
  const transactionRef = tx?.reference ?? data?.reference ?? 'N/A';


  const providerKey = data.provider.toLowerCase() === '9mobile' ? 'ninemobile' : data.provider.toLowerCase();
  const svg = svgShapes[providerKey] || '';
  document.getElementById('receipt-provider').innerHTML = `${svg} ${data.provider.toUpperCase()}`;
  document.getElementById('receipt-phone').textContent = data.number;
  document.getElementById('receipt-plan').textContent = `${data.dataAmount} / ${data.validity}`;
  document.getElementById('receipt-amount').textContent = 
    `₦${Number(displayAmount).toLocaleString('en-NG')}`;

  document.getElementById('receipt-balance').textContent = 
    `₦${Number(displayBalance).toLocaleString('en-NG')}`;

  document.getElementById('receipt-transaction-id').textContent = transactionRef;
  document.getElementById('receipt-time').textContent = new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

  document.getElementById('receipt-details').style.display = 'block';

  const actions = document.getElementById('receipt-actions');
  actions.style.display = 'flex';
  actions.innerHTML = `
    <button id="receipt-done" style="width:100%; background:#333; color:white; border:none; border-radius:50px; padding:14px; font-weight:600;">
      OK
    </button>
  `;

  document.getElementById('receipt-done')?.addEventListener('click', () => {
    const backdrop = document.getElementById('smart-receipt-backdrop');
    if (backdrop) {
      backdrop.classList.add('hidden');
      backdrop.setAttribute('aria-hidden', 'true');
      lockScrollForReceiptModal(backdrop, false);
      closeCheckoutModal();
    }
  });
}
async function pollForFinalStatus(reference) {
  let attempts = 0;
  const maxAttempts = 60;
  let showedPending = false;
  let showedFailed = false;

  while (attempts < maxAttempts) {
    try {
      const res = await fetch('https://api.flexgig.com.ng/api/transactions?limit=10', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        const tx = json.items.find(t => t.reference === reference);

        if (tx) {
          const status = tx.status.toLowerCase();

          // Immediate success
          if (status === 'success') {
            await updateReceiptToSuccess(tx);
            resetCheckoutUI();
            closeCheckoutModal();
            return;
          }

          // Final failure — show only once
          if ((status === 'failed' || status === 'refund') && !showedFailed) {
            showedFailed = true;

            if (showedPending) {
              updateReceiptToFailed('Data delivery failed. Amount has been refunded instantly.');
            } else {
              // First attempt failed and no retries succeeded — show Pending with fail message
              updateReceiptToPending();
              document.getElementById('receipt-status').textContent = 'Delivery Failed';
              document.getElementById('receipt-message').textContent = 'Data delivery failed. Amount has been refunded instantly.';
            }
            closeCheckoutModal();
            return;
          }

          // Still pending — after ~30s (2 polls) → first attempt failed → show Pending once
          if (!showedPending && attempts >= 2) {
            showedPending = true;
            updateReceiptToPending(tx);
          }
        }
      }
    } catch (e) {
      console.warn('[checkout] Poll error:', e);
    }

    attempts++;
    await new Promise(r => setTimeout(r, 15000));
  }

  // Timeout
  if (!showedFailed) {
    showedFailed = true;
    if (showedPending) {
      document.getElementById('receipt-message').textContent = 'Taking longer than expected. Check history later.';
    } else {
      updateReceiptToPending(null);
      document.getElementById('receipt-message').textContent = 'Delivery taking longer than expected. Check history.';
    }
  }
}
// Close & Buy Again handlers (unchanged)
document.getElementById('receipt-done')?.addEventListener('click', () => {
  const backdrop = document.getElementById('smart-receipt-backdrop');
  backdrop?.classList.add('hidden');
  backdrop?.setAttribute('aria-hidden', 'true');

  // 🔓 UNLOCK SCROLL HERE
  lockScrollForReceiptModal(backdrop, false);
});




// ==================== EXPORTS ====================
window.openCheckoutModal = openCheckoutModal;
window.closeCheckoutModal = closeCheckoutModal;
window.gatherCheckoutData = gatherCheckoutData;
window.onPayClicked = onPayClicked;

