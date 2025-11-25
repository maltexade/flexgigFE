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
  const token = localStorage.getItem('token'); // or fetch from cookie/session
  if (token) headers['Authorization'] = `Bearer ${token}`;

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
  // Clear any existing countdown
  if (countdownTimerInterval) {
    clearInterval(countdownTimerInterval);
    countdownTimerInterval = null;
  }

  // Calculate expiration time in seconds
  let countdown;
  if (data.expiresAt) {
    // If backend sends ISO timestamp
    const expiryDate = new Date(data.expiresAt);
    const now = new Date();
    countdown = Math.floor((expiryDate - now) / 1000); // seconds remaining
    
    if (countdown < 0) countdown = 0; // Already expired
  } else {
    // Default: 30 minutes
    countdown = 30 * 60;
  }

  console.log('[Generated Account]', data);
  console.log('[Countdown]', countdown, 'seconds');

  const modalContent = document.createElement('div');
  modalContent.classList.add('addMoney-generated-content');

  modalContent.innerHTML = `
    <div class="addMoney-generated-body" style="
  padding: 20px;
  background: #111010ff;
  border-radius: 20px;
  color: #ffffff;
  min-height: 70vh;
  max-height: 90vh;
  overflow-y: auto;
  display: block;                    /* ← THIS IS THE KEY FIX */
  text-align: left;                  /* ← Force left alignment */
  box-sizing: border-box;
">
  <!-- All your content below — no changes needed -->
  
  <!-- LABEL: Amount to Pay -->
  <p style="margin:0; font-size:11px; opacity:0.75; text-transform: uppercase; letter-spacing: 0.5px;">
    Amount to Pay
  </p>

  <!-- VALUE -->
  <div style="font-size:24px; font-weight:700; margin:8px 0 24px;">
    ₦${Number(data.amount).toLocaleString()}
  </div>

  <!-- BANK SECTION -->
  <div style="margin-bottom:24px;">
    <p style="margin:0; font-size:11px; opacity:0.75; text-transform: uppercase; letter-spacing: 0.5px;">Bank</p>
    <div style="font-size:18px; font-weight:600; margin-top:6px;">
      ${data.bankName || 'OPay'}
    </div>
    <img src="/frontend/img/opay-image.png"
         alt="Bank Logo"
         onerror="this.style.display='none'"
         style="width:65px; height:20px; margin-top:10px; object-fit: contain;">
  </div>

  <!-- ACCOUNT NUMBER -->
  <div style="margin-bottom:24px;">
    <p style="margin:0; font-size:11px; opacity:0.75; text-transform: uppercase; letter-spacing: 0.5px;">Account Number</p>
    <div style="display:flex; align-items:center; gap:12px; margin-top:8px; flex-wrap: wrap;">
      <span style="font-size:22px; font-weight:700; letter-spacing:1.5px; word-break: break-all;">
        ${data.accountNumber}
      </span>
      <button class="copy-btn" data-copy="${data.accountNumber}"
        style="border:none; background:#3b82f6; padding:10px 12px; border-radius:10px; cursor:pointer;">
        <svg width="20px" height="20px" viewBox="0 0 24 24" fill="none">
          <path d="M6 11C6 8.17157 6 6.75736 6.87868 5.87868C7.75736 5 9.17157 5 12 5H15C17.8284 5 19.2426 5 20.1213 5.87868C21 6.75736 21 8.17157 21 11V16C21 18.8284 21 20.2426 20.1213 21.1213C19.2426 22 17.8284 22 15 22H12C9.17157 22 7.75736 22 6.87868 21.1213C6 20.2426 6 18.8284 6 16V11Z" stroke="#ffffff" stroke-width="1.5"></path>
          <path opacity="0.5" d="M6 19C4.34315 19 3 17.6569 3 16V10C3 6.22876 3 4.34315 4.17157 3.17157C5.34315 2 7.22876 2 11 2H15C16.6569 2 18 3.34315 18 5" stroke="#ffffff" stroke-width="1.5"></path>
        </svg>
      </button>
    </div>
  </div>

  <!-- EXPIRES IN -->
  <div style="margin-bottom:20px;">
    <p style="margin:0; font-size:11px; opacity:0.75; text-transform: uppercase; letter-spacing: 0.5px;">Expires In</p>
    <div style="margin-top:10px; background:#10b981; padding:16px 20px; border-radius:14px; font-size:26px; font-weight:700; color:#fff; display:inline-block; box-shadow:0 4px 12px rgba(16,185,129,0.4);">
      <span id="genCountdown">30:00</span>
    </div>
  </div>

  <!-- INSTRUCTION -->
  <p style="margin-top:20px; font-size:14px; line-height:1.7; opacity:0.8;">
    Transfer the exact amount to this account. Your wallet will be credited instantly once payment is confirmed.
  </p>

  <!-- Reference Info -->
  <div style="margin-top:24px; padding:14px; background:#1f2937; border-radius:10px; font-size:12px; opacity:0.7;">
    <strong>Reference:</strong> ${data.reference || data.orderNo || 'N/A'}
  </div>
</div>
  `;

  // Replace modal content
  const contentContainer = addMoneyModal.querySelector('.addMoney-modal-content');
  contentContainer.innerHTML = '';
  contentContainer.appendChild(modalContent);

  // Close button handler
  const closeBtn = modalContent.querySelector('.addMoney-modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (window.modalManager && window.modalManager.closeModal) {
        window.modalManager.closeModal('addMoneyModal');
      } else {
        addMoneyModal.style.transform = 'translateY(100%)';
      }
      // Clear countdown when closing
      if (countdownTimerInterval) {
        clearInterval(countdownTimerInterval);
        countdownTimerInterval = null;
      }
    });
  }

  // Copy account number
  const copyBtn = modalContent.querySelector('.copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', (e) => {
      const accountNum = e.currentTarget.dataset.copy;
      navigator.clipboard.writeText(accountNum).then(() => {
        if (window.notify) {
          window.notify('Account number copied!', 'success');
        } else {
          alert('Account number copied!');
        }
      }).catch(() => {
        alert('Failed to copy. Please copy manually: ' + accountNum);
      });
    });
  }

  // Countdown timer - FIXED
  const countdownEl = modalContent.querySelector('#genCountdown');
  if (countdownEl) {
    // Update immediately
    const updateCountdown = () => {
      if (countdown < 0) {
        countdownEl.textContent = 'EXPIRED';
        countdownEl.parentElement.style.background = '#ef4444';
        if (countdownTimerInterval) {
          clearInterval(countdownTimerInterval);
          countdownTimerInterval = null;
        }
        return;
      }

      const minutes = Math.floor(countdown / 60);
      const seconds = countdown % 60;
      countdownEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    // Initial display
    updateCountdown();

    // Start countdown
    countdownTimerInterval = setInterval(() => {
      countdown--;
      updateCountdown();
    }, 1000);
  }
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

// --- Redirect focus away from amount input when Add Money modal opens ---
document.addEventListener("modalOpened", (e) => {
  const amountInput = document.getElementById('addMoneyAmountInput');
  if (amountInput && e.detail === "addMoneyModal") {
    setTimeout(() => {
      amountInput.blur();
      amountInput.setAttribute("readonly", true);
      
      const guard = document.getElementById("addMoneyFocusGuard");
      if (guard) guard.focus();
    }, 20);
  }
});

// --- Cleanup countdown on page unload ---
window.addEventListener('beforeunload', () => {
  if (countdownTimerInterval) {
    clearInterval(countdownTimerInterval);
  }
});