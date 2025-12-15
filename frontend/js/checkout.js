/* checkout.js - Production-ready checkout modal handler
   Handles checkout modal display, payment processing, and authentication
   Integrates with dashboard.js for user state and biometric/PIN verification
*/

console.log('[checkout] Module loaded 🛒');

'use strict';

// ==================== STATE ====================
let checkoutData = null;

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

    // === PROVIDER ===
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

    // === PHONE NUMBER ===
    const phoneInput = document.getElementById('phone-input');
    const number = phoneInput?.value.trim() || '';
    if (!number || number.length < 10) {
      safeNotify('Please enter a valid phone number', 'error');
      return null;
    }

    // === SELECTED PLAN (REAL DATA FROM data-plan-id) ===
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

    // Fallback to last saved real plan
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

// ==================== UTILITIES ====================
const safeNotify = (msg, type = 'info') => {
  if (typeof window.notify === 'function') window.notify(msg, type);
  else console.log('[notify]', type, msg);
};

const getUserState = () => {
  try {
    return JSON.parse(localStorage.getItem('userState') || '{}');
  } catch (e) {
    return {};
  }
};

function getAvailableBalance() {
  const el = document.querySelector('.balance-real');
  if (el) return parseFloat(el.textContent.replace(/[₦,\s]/g, '')) || 0;
  const state = getUserState();
  return parseFloat(state.balance) || 0;
}

function saveSelectedPlan(plan) {
  const state = getUserState();
  state.selectedPlan = plan;
  localStorage.setItem('userState', JSON.stringify(state));
  localStorage.setItem('lastSelectedPlan', JSON.stringify(plan));
}

// ==================== MODAL FUNCTIONS ====================
function openCheckoutModal(passedData) {
  let info = passedData && passedData.planId ? passedData : gatherCheckoutData();
  if (!info) return;

  checkoutData = info;

  const modal = document.getElementById('checkoutModal');
  if (!modal) return;

  // Populate modal
  document.getElementById('checkout-price')?.textContent = `₦${info.price.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

  document.getElementById('checkout-service')?.textContent = 'Mobile Data';

  const providerEl = document.getElementById('checkout-provider');
  if (providerEl) {
    const key = info.provider.toLowerCase() === '9mobile' ? 'ninemobile' : info.provider.toLowerCase();
    providerEl.innerHTML = (svgShapes[key] || '') + ' ' + info.provider;
  }

  document.getElementById('checkout-phone')?.textContent = info.number;
  document.getElementById('checkout-data')?.textContent = `${info.dataAmount} / ${info.validity}`;

  modal.querySelectorAll('.info-row:last-child .value').forEach(el => {
    el.textContent = `₦${info.price.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  });

  document.getElementById('checkout-balance')?.textContent = `₦${getAvailableBalance().toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

  modal.style.display = 'flex';
  modal.classList.add('active');
  document.body.classList.add('modal-open');
  history.pushState({ modal: 'checkout' }, '', location.href);
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkoutModal');
  if (!modal) return;

  modal.classList.remove('active');
  modal.style.display = 'none';
  document.body.classList.remove('modal-open');
  checkoutData = null;

  if (history.state?.modal === 'checkout') history.back();
}

// Clear UI after successful purchase
function resetCheckoutUI() {
  document.getElementById('phone-input')?.value = '';
  document.querySelectorAll('.plan-box.selected').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.provider-box.selected').forEach(el => el.classList.remove('selected'));
  document.querySelector('.provider-box.mtn')?.classList.add('selected'); // default to MTN

  // Clear saved plan
  const state = getUserState();
  delete state.selectedPlan;
  localStorage.setItem('userState', JSON.stringify(state));
  localStorage.removeItem('lastSelectedPlan');
}

// Add transaction locally (replicates your old mock behavior)
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

  // Assuming these globals exist in dashboard.js
  if (typeof transactions !== 'undefined') transactions.unshift(transaction);
  if (typeof recentTransactions !== 'undefined') recentTransactions.unshift(transaction);
  localStorage.setItem('recentTransactions', JSON.stringify(recentTransactions.slice(0, 50)));

  if (typeof renderTransactions === 'function') renderTransactions();
  if (typeof renderRecentTransactions === 'function') renderRecentTransactions();
}

// ==================== AUTH & PAYMENT ====================
async function triggerCheckoutAuthWithDedicatedModal() {
  return new Promise(resolve => {
    window._checkoutPinResolve = resolve;
    if (typeof window.showCheckoutPinModal === 'function') {
      window.showCheckoutPinModal();
    } else {
      resolve(false);
    }
  });
}

async function processPayment() {
  if (!checkoutData) throw new Error('No checkout data');

  const payload = {
    plan_id: checkoutData.planId,
    phone: checkoutData.rawNumber,
    provider: checkoutData.provider.toLowerCase()
  };

  return await withLoader(async () => {
    const res = await fetch('https://api.flexgig.com.ng/api/purchase-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include'
    });

    const result = await res.json();

    if (!res.ok) {
      if (result.error === 'insufficient_balance') throw new Error(`Insufficient balance: ₦${result.current_balance || '0'}`);
      if (result.error === 'delivery_failed') throw new Error('Data delivery failed. Amount refunded.');
      throw new Error(result.message || 'Purchase failed');
    }

    if (result.new_balance !== undefined) {
      window.updateAllBalances?.(result.new_balance);
    }

    if (typeof renderTransactions === 'function') setTimeout(renderTransactions, 500);

    return { ok: true, new_balance: result.new_balance };
  });
}

async function onPayClicked() {
  const payBtn = document.getElementById('payBtn');
  if (!payBtn || payBtn.disabled) return;

  const originalText = payBtn.textContent;
  payBtn.disabled = true;
  payBtn.textContent = 'Processing...';

  try {
    checkoutData = gatherCheckoutData();
    if (!checkoutData) throw new Error('Invalid data');

    const authOk = await triggerCheckoutAuthWithDedicatedModal();
    if (!authOk) {
      safeNotify('Purchase cancelled', 'info');
      return;
    }

    const result = await processPayment();
    if (result.ok) {
      addLocalTransaction(checkoutData);
      resetCheckoutUI();
      safeNotify('Data purchased successfully! ✓', 'success');
      setTimeout(closeCheckoutModal, 800);
    }
  } catch (err) {
    console.error('[checkout] Error:', err);
    safeNotify(err.message || 'Purchase failed', 'error');
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

  // Keyboard support
  document.addEventListener('keydown', (e) => {
    if (modal.classList.contains('hidden')) return;

    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      if (currentPin.length < 4) {
        currentPin += e.key;
        updateInputs();
        if (currentPin.length === 4) {
          setTimeout(() => verifyPin(currentPin), 300);
        }
      }
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      currentPin = currentPin.slice(0, -1);
      updateInputs();
    } else if (e.key === 'Escape') {
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
        const res = await fetch('https://api.flexgig.com.ng/api/verify-pin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({ pin })
        });

        if (res.ok) {
          hideCheckoutPinModal();
          if (window._checkoutPinResolve) {
            window._checkoutPinResolve(true);
          }
        } else {
          const data = await res.json().catch(() => ({}));
          safeNotify(data.message || 'Invalid PIN. Please try again.', 'error');
          resetPin();
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

  const payBtn = document.getElementById('payBtn');
  if (payBtn) {
    payBtn.addEventListener('click', onPayClicked);
  }

  const closeBtns = document.querySelectorAll('#checkoutModal [data-close], #checkoutModal .close-btn');
  closeBtns.forEach(btn => btn.addEventListener('click', closeCheckoutModal));

  document.getElementById('checkoutModal')?.addEventListener('click', e => {
    if (e.target.id === 'checkoutModal') closeCheckoutModal();
  });

  window.addEventListener('popstate', () => {
    if (document.getElementById('checkoutModal')?.classList.contains('active')) {
      closeCheckoutModal();
    }
  });
});

// ==================== EXPORTS ====================
window.openCheckoutModal = openCheckoutModal;
window.closeCheckoutModal = closeCheckoutModal;
window.gatherCheckoutData = gatherCheckoutData;
window.saveSelectedPlan = saveSelectedPlan;

export { openCheckoutModal, closeCheckoutModal, onPayClicked, gatherCheckoutData };