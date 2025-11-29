// --- API helper (put near top of your client script) ---
window.__SEC_API_BASE = window.__SEC_API_BASE || 'https://api.flexgig.com.ng';

async function apiFetch(path, opts = {}) {
  const base = window.__SEC_API_BASE.replace(/\/+$/, ''); // trim trailing slash
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;

  const {
    method = 'GET',
    headers = {},
    body = null,
    timeout = 10000,     // ms
    retries = 2,         // retry count on network failures / 5xx
    retryDelay = 500     // initial retry delay (ms) - exponential backoff
  } = opts;

  // attach auth header if you store token in localStorage (adjust if you use cookie)

  headers['Accept'] = headers['Accept'] || 'application/json';
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  let attempt = 0;
  while (true) {
    attempt++;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body && !(body instanceof FormData) ? JSON.stringify(body) : body,
        signal: controller.signal,
        credentials: 'include' // use if your API relies on cookies; remove if not
      });
      clearTimeout(id);

      // Parse JSON safely
      let payload = null;
      const text = await res.text();
      try { payload = text ? JSON.parse(text) : null; } catch (e) { payload = text; }

      if (res.ok) return { ok: true, status: res.status, data: payload };
      // handle 4xx/5xx
      if (res.status >= 500 && attempt <= retries + 1) {
        // server error -> retry
        const wait = retryDelay * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      // client error - return error info
      return { ok: false, status: res.status, error: payload || { message: res.statusText } };

    } catch (err) {
      clearTimeout(id);
      // AbortError or network error
      if (err.name === 'AbortError') {
        if (attempt <= retries + 1) {
          const wait = retryDelay * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        return { ok: false, error: { message: 'Request timed out' } };
      }

      // other network errors - retry if attempts remain
      if (attempt <= retries + 1) {
        const wait = retryDelay * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      return { ok: false, error: { message: err.message || 'Network error' } };
    }
  }
}

// --- Global countdown timer reference ---
let countdownTimerInterval = null;

// --- Modal Elements ---
const addMoneyModal = document.getElementById('addMoneyModal');


// AUTO-CLOSE FUND MODAL + SUCCESS TOAST WHEN PAYMENT ARRIVES
(function() {
  const MODAL_ID = 'addMoneyModal';
  let hasShownSuccess = false;

  // Listen for balance update from WebSocket
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'balance_update') {
      const { balance, amount } = e.data;

      // Only trigger once per session
      if (hasShownSuccess) return;
      hasShownSuccess = true;

      // 1. Close modal using ModalManager (your system)
      if (window.modalManager && typeof window.modalManager.closeModal === 'function') {
        window.modalManager.closeModal(MODAL_ID);
      } else if (document.getElementById(MODAL_ID)) {
        document.getElementById(MODAL_ID).style.transform = 'translateY(100%)';
      }

      // 2. Show beautiful success toast
      showSuccessToast(`₦${Number(amount).toLocaleString()} received!`, `Wallet updated to ₦${Number(balance).toLocaleString()}`);

      // 3. Play subtle sound (optional)
      try {
        const audio = new Audio('frontend/sound/success.mp3');
        audio.volume = 0.9;
        audio.play().catch(() => {});
      } catch (e) {}

      // 4. Reset flag after 30s (allow next payment)
      setTimeout(() => { hasShownSuccess = false; }, 30000);
    }
  });

  // Also listen for WebSocket directly (fallback)
  if (window.WebSocket) {
    const oldHandler = window.onmessage;
    window.onmessage = (e) => {
      if (oldHandler) oldHandler(e);
      if (e.data && typeof e.data === 'string') {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed.type === 'balance_update') {
            window.dispatchEvent(new MessageEvent('message', { data: parsed }));
          }
        } catch (e) {}
      }
    };
  }

  // BEAUTIFUL SUCCESS TOAST
  function showSuccessToast(title, subtitle = '') {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;
      padding: 16px 24px;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(16, 156, 103, 0.4);
      z-index: 99999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center;
      animation: slideDown 0.5s ease, fadeOut 0.6s 3s forwards;
      max-width: 90%;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.2);
    `;

    toast.innerHTML = `
      <div style="font-size: 18px; font-weight: 800; margin-bottom: 4px;">
        ✓ ${title}
      </div>
      ${subtitle ? `<div style="font-size: 14px; opacity: 0.9;">${subtitle}</div>` : ''}
    `;

    document.body.appendChild(toast);

    // Auto-remove
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  }

  // Animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from { transform: translateX(-50%) translateY(-100px); opacity: 0; }
      to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
    @keyframes fadeOut {
      to { opacity: 0; transform: translateX(-50%) translateY(-20px); }
    }
  `;
  document.head.appendChild(style);
})();



// --- Show Error Screen ---
function showGeneratedError(message = 'Failed to generate account. Try again.') {
  // Clear any existing countdown
  if (countdownTimerInterval) {
    clearInterval(countdownTimerInterval);
    countdownTimerInterval = null;
  }

  const contentContainer = addMoneyModal.querySelector('.addMoney-modal-content');
  contentContainer.innerHTML = `
    <div class="addMoney-generated-error">
      <button class="addMoney-modal-close" data-close>&times;</button>
      <h3 class="addMoney-modal-title">Oops!</h3>
      <p>${message}</p>
      <button class="addMoney-fund-btn" id="retryFundBtn">Retry</button>
    </div>
  `;

  // Close button
  contentContainer.querySelector('.addMoney-modal-close')
    .addEventListener('click', () => {
      openAddMoneyModalContent();
    });

  // Retry button
  document.getElementById('retryFundBtn').addEventListener('click', () => {
    openAddMoneyModalContent();
  });
}

// --- Open Original Add Money Modal Content ---
function openAddMoneyModalContent() {
  // Clear any existing countdown
  if (countdownTimerInterval) {
    clearInterval(countdownTimerInterval);
    countdownTimerInterval = null;
  }

  const contentContainer = addMoneyModal.querySelector('.addMoney-modal-content');
  contentContainer.innerHTML = `
    <!-- KYC / Bank Card -->
    <div class="addMoney-account-section">
      <div class="addMoney-account-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M3 10l9-6 9 6v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10z"
                stroke="#00AAFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="addMoney-account-text">
        <h4>Get a permanent bank account</h4>
        <span class="addMoney-account-subtitle">Complete KYC</span>
      </div>
    </div>

    <!-- Instant Deposit Label -->
    <div class="addMoney-instant-label">Instant Deposit</div>

    <!-- Amount Input -->
    <div class="addMoney-amount-section">
      <input type="text" id="addMoneyAmountInput"
             class="addMoney-amount-input"
             autocomplete="off"
             placeholder="₦ Enter amount" />
    </div>

    <!-- Quick Amount Buttons -->
    <div class="addMoney-quick-amounts">
      <button class="addMoney-quick-btn">₦500</button>
      <button class="addMoney-quick-btn">₦1,000</button>
      <button class="addMoney-quick-btn">₦2,000</button>
      <button class="addMoney-quick-btn">₦3,000</button>
      <button class="addMoney-quick-btn">₦5,000</button>
      <button class="addMoney-quick-btn">₦10,000</button>
    </div>

    <!-- Fund Wallet Button -->
    <button id="addMoneyFundBtn" class="addMoney-fund-btn">Fund Wallet</button>
  `;

  // Reassign elements and events after restoring content
  assignAddMoneyEvents();
}

// --- Assign Events to Add Money Modal ---
function assignAddMoneyEvents() {
  const amountInput = document.getElementById('addMoneyAmountInput');
  const quickBtns = document.querySelectorAll('.addMoney-quick-btn');
  const fundBtn = document.getElementById('addMoneyFundBtn');

  if (!amountInput || !fundBtn) return;

  let rawAmount = "";

  // Amount input formatting
  amountInput.addEventListener("input", () => {
    let v = amountInput.value.replace(/[^0-9]/g, "");
    rawAmount = v;
    amountInput.value = v ? "₦" + Number(v).toLocaleString() : "";
    quickBtns.forEach(b => b.classList.remove("selected"));
  });

  // Quick buttons
  quickBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      quickBtns.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      const value = btn.textContent.replace(/[^0-9]/g, "");
      rawAmount = value;
      amountInput.value = "₦" + Number(value).toLocaleString();
    });
  });

  // Fund wallet button
 let isFundingInProgress = false; // ← This is the magic line

fundBtn.addEventListener('click', async () => {
  // PREVENT DOUBLE-CLICK / DOUBLE-EXECUTION
  if (isFundingInProgress) {
    console.log('[Fund Wallet] Already processing — ignoring duplicate click');
    return;
  }

  const amount = parseInt(amountInput.value.replace(/[^0-9]/g, ""), 10);
  if (!amount || amount <= 0) {
    window.notify?.('Please enter a valid amount.', 'error');
    return;
  }

  // Mark as in progress + disable button
  isFundingInProgress = true;
  fundBtn.disabled = true;
  fundBtn.textContent = 'Processing...';

  try {
    // This keeps your loading spinner exactly as before
    const res = window.withLoader
      ? await window.withLoader(() => apiFetch('/api/fund-wallet', {
          method: 'POST',
          body: { amount }
        }))
      : await apiFetch('/api/fund-wallet', {
          method: 'POST',
          body: { amount }
        });

    if (res.ok) {
      showGeneratedAccount(res.data);
    } else {
      showGeneratedError(res.error?.message || 'Failed to generate account.');
    }
  } catch (err) {
    console.error('[Fund Wallet Error]', err);
    showGeneratedError('Network error. Try again.');
  } finally {
    // Always reset — even if error
    isFundingInProgress = false;
    fundBtn.disabled = false;
    fundBtn.textContent = 'Fund Wallet';
  }
});
}

// --- Show Generated Bank Account ---
function showGeneratedAccount(data) {
  if (countdownTimerInterval) clearInterval(countdownTimerInterval);

  let countdown;
  if (data.expiresAt) {
    const expiryDate = new Date(data.expiresAt);
    countdown = Math.floor((expiryDate - new Date()) / 1000);
    if (countdown < 0) countdown = 0;
  } else {
    countdown = 30 * 60; // default 30 min
  }

  const modalContent = document.createElement('div');
  modalContent.classList.add('addMoney-generated-content');

  modalContent.innerHTML = `
    <div class="addMoney-generated-body" style="padding:14px; background:#111010ff; border-radius:16px; color:#fff; min-height:55vh; max-height:60vh; overflow-y:auto;">
      <p style="margin:0; font-size:10px; opacity:0.75;">Amount to Pay</p>
      <div style="font-size:20px; font-weight:700; margin:6px 0 14px;">₦${Number(data.amount).toLocaleString()}</div>

      <div style="margin-bottom:12px;">
        <p style="margin:0; font-size:10px; opacity:0.75;">Bank</p>
        <img src="/frontend/img/opay-logo.png" alt="Bank Logo" onerror="this.style.display='none'" style="width:auto; height:36px; margin-top:6px; object-fit:contain;">
      </div>

      <div style="margin-bottom:12px;">
        <p style="margin:0; font-size:10px; opacity:0.75;">Account Name</p>
        <div style="font-size:15px; font-weight:600; margin-top:4px;">Flexgig Digital Network</div>
      </div>

      <div style="margin-bottom:14px;">
        <p style="margin:0; font-size:10px; opacity:0.75;">Account Number</p>
        <div style="display:flex; align-items:center; gap:10px; margin-top:6px; flex-wrap: wrap;">
          <span style="font-size:18px; font-weight:700; letter-spacing:1px; word-break: break-all;">${data.accountNumber}</span>
          <button class="copy-btn" data-copy="${data.accountNumber}" style="border:none; background:#3b82f6; padding:8px 10px; border-radius:8px; cursor:pointer;">Copy</button>
        </div>
      </div>

      <div style="margin-bottom:10px;">
        <p style="margin:0; font-size:10px; opacity:0.75;">Expires In</p>
        <div style="margin-top:6px; background:#10b981; padding:6px 12px; border-radius:10px; font-size:18px; font-weight:700; display:inline-block;">
          <span id="genCountdown">30:00</span>
        </div>
      </div>

      <div style="margin-top:18px; display:flex; justify-content:center;">
        <button id="cancelTransactionBtn" style="background:transparent; border:1px solid rgba(255,255,255,0.12); color:#fff; padding:10px 14px; border-radius:12px; font-weight:700; cursor:pointer; width:100%;">Cancel transaction</button>
      </div>
    </div>
  `;

  const contentContainer = addMoneyModal.querySelector('.addMoney-modal-content');
  contentContainer.innerHTML = '';
  contentContainer.appendChild(modalContent);

  // --- Copy Account Number ---
  const copyBtn = modalContent.querySelector('.copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', e => {
      const accountNum = e.currentTarget.dataset.copy;
      navigator.clipboard.writeText(accountNum)
        .then(() => window.notify?.('Account number copied!', 'success') || alert('Account number copied!'))
        .catch(() => alert('Failed to copy. Please copy manually: ' + accountNum));
    });
  }

  // --- Countdown + Expire Handling ---
  const countdownEl = modalContent.querySelector('#genCountdown');
  const updateCountdown = () => {
    if (!countdownEl) return;
    countdownEl.textContent = countdown > 0
      ? `${String(Math.floor(countdown/60)).padStart(2,'0')}:${String(countdown%60).padStart(2,'0')}`
      : 'EXPIRED';
    if (countdown <= 0) countdownEl.parentElement.style.background = '#ef4444';
  };

  countdownTimerInterval = setInterval(() => {
    countdown--;
    updateCountdown();
    if (countdown < 0) handleTransactionCancelOrExpire(data.transactionId);
  }, 1000);
  updateCountdown();

  // --- Cancel Button ---
  const cancelBtn = modalContent.querySelector('#cancelTransactionBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => handleTransactionCancelOrExpire(data.transactionId));

  // --- Close Button ---
  const closeBtn = modalContent.querySelector('.addMoney-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', () => {
    if (window.modalManager?.closeModal) window.modalManager.closeModal('addMoneyModal');
    else addMoneyModal.style.transform = 'translateY(100%)';
    if (countdownTimerInterval) clearInterval(countdownTimerInterval);
  });
}

// --- Cancel / Expire Transaction Helper ---
async function handleTransactionCancelOrExpire(transactionId) {
  if (countdownTimerInterval) {
    clearInterval(countdownTimerInterval);
    countdownTimerInterval = null;
  }

  if (transactionId) {
    try {
      await apiFetch(`/api/cancel-transaction/${transactionId}`, { method: 'POST' });
      console.log('Transaction cancelled/expired:', transactionId);
    } catch (err) {
      console.error('Error cancelling transaction:', err);
    }
  }

  if (window.modalManager?.closeModal) window.modalManager.closeModal('addMoneyModal');
  else document.getElementById('addMoneyModal').style.transform = 'translateY(100%)';

  openAddMoneyModalContent(); // reset modal
}



// --- Initialize when DOM is ready ---
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (addMoneyModal) {
      assignAddMoneyEvents();
    }
  });
} else {
  if (addMoneyModal) {
    assignAddMoneyEvents();
  }
}

// FINAL — ZERO FLASH + USER CAN STILL TYPE PERFECTLY
document.addEventListener("modalOpened", (e) => {
  if (e.detail !== "addMoneyModal") return;

  const input = document.getElementById('addMoneyAmountInput');
  if (!input) return;

  // Step 1: Make it temporarily untouchable + kill keyboard
  input.setAttribute('readonly', 'readonly');
  input.setAttribute('inputmode', 'none');        // kills keyboard
  input.style.pointerEvents = 'none';             // prevents accidental focus
  input.blur();

  // Step 2: After modal is fully visible, re-enable ONLY on real user tap
  requestAnimationFrame(() => {
    setTimeout(() => {
      input.style.pointerEvents = '';
      input.removeAttribute('readonly');
      input.removeAttribute('inputmode');

      // Now enable input when user actually taps
      const enable = () => {
        input.focus();
        input.removeEventListener('click', enable);
        input.removeEventListener('touchstart', enable);
      };

      input.addEventListener('click', enable);
      input.addEventListener('touchstart', enable);
    }, 300); // 300ms = after slide-up animation finishes
  });
});

// --- Cleanup countdown on page unload ---
window.addEventListener('beforeunload', () => {
  if (countdownTimerInterval) {
    clearInterval(countdownTimerInterval);
  }
});


