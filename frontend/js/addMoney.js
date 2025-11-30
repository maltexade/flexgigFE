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

  // UNIFIED handler for balance updates
  function handleBalanceUpdate(data) {
    console.log('[Balance Update Received]', data); // Debug log
    
    if (!data || data.type !== 'balance_update') return;
    
    const { balance, amount } = data;
    
    // Only trigger once per session
    if (hasShownSuccess) {
      console.log('[Balance Update] Already shown, ignoring');
      return;
    }
    hasShownSuccess = true;

      try {
    if (typeof removePendingTxFromStorage === 'function') {
      removePendingTxFromStorage();
      console.log('[Balance] Cleared local pending tx storage');
    } else {
      localStorage.removeItem('flexgig.pending_fund_tx');
      console.log('[Balance] Cleared local pending tx storage (direct)');
    }
  } catch (e) {
    console.warn('[handleBalanceUpdate] failed to clear pending tx storage', e);
  }

    console.log('[Balance Update] Processing...'); // Debug log

    // 1. Close modal using ModalManager (your system)
    if (window.modalManager && typeof window.modalManager.closeModal === 'function') {
      window.modalManager.closeModal(MODAL_ID);
      console.log('[Balance Update] Modal closed via modalManager');
    } else {
      const modal = document.getElementById(MODAL_ID);
      if (modal) {
        modal.style.transform = 'translateY(100%)';
        modal.classList.add('hidden'); // Also add hidden class
        console.log('[Balance Update] Modal closed via style');
      }
    }

    // 2. Show beautiful success toast + PLAY THE DING!
showSuccessToast(`₦${Number(amount).toLocaleString()} received!`, 
                `Wallet updated to ₦${Number(balance).toLocaleString()}`);

if (typeof window.playSuccessSound === 'function') {
  window.playSuccessSound();   // CHA-CHING!
}

    // 3. Reset flag after 30s (allow next payment)
    setTimeout(() => { 
      hasShownSuccess = false;
      console.log('[Balance Update] Flag reset');
    }, 30000);
  }

  // 🔥 PRIMARY LISTENER: Custom event from WebSocket (works on mobile!)
  window.addEventListener('balance_update', (e) => {
    console.log('[Custom Event] balance_update received', e.detail);
    handleBalanceUpdate(e.detail);
  });

  // MOBILE FIX: Expose global handler for direct calls
  window.__handleBalanceUpdate = handleBalanceUpdate;

  // BEAUTIFUL SUCCESS TOAST
  function showSuccessToast(title, subtitle = '') {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 20px);
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;
      padding: 16px 24px;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(16, 156, 103, 0.4);
      z-index: 999999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center;
      animation: toastSlideDown 0.45s ease-out, toastFadeOut 0.6s 3s forwards;
      max-width: min(92%, 380px);
      width: max-content;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.25);
      pointer-events: auto;
      touch-action: none;
    `;

    toast.innerHTML = `
      <div style="font-size: 18px; font-weight: 800; margin-bottom: 4px;">
        ✓ ${title}
      </div>
      ${subtitle ? `<div style="font-size: 14px; opacity: 0.9;">${subtitle}</div>` : ''}
    `;

    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 6600);
    
    console.log('[Toast] Displayed successfully');
  }

  // Animations
  const style = document.createElement("style");
  style.textContent = `
    @keyframes toastSlideDown {
      from { opacity: 0; transform: translate(-50%, -40px); }
      to   { opacity: 1; transform: translate(-50%, 0); }
    }

    @keyframes toastFadeOut {
      to { opacity: 0; transform: translate(-50%, -20px); }
    }
  `;
  document.head.appendChild(style);

})();

// --- GLOBAL PENDING TRANSACTION TOAST (always outside modal) ---
window.showPendingTxToast = function(message = "Please complete your pending transaction") {
  // Remove old if exists
  document.querySelectorAll('.global-pending-toast').forEach(el => el.remove());

  const toast = document.createElement('div');
  toast.className = 'global-pending-toast';
  toast.style.cssText = `
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 22px);
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: white;
    padding: 18px 26px;
    border-radius: 18px;
    font-weight: 800;
    font-size: 16px;
    text-align: center;
    box-shadow: 0 14px 35px rgba(217, 119, 6, 0.45);
    z-index: 2147483647; /* Always above all modals */
    max-width: min(92%, 420px);
    width: max-content;
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.28);
    animation: pendingGlobalSlide 0.45s ease-out;
    pointer-events: none;
    user-select: none;
  `;

  toast.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 8v4m0 4h.01"></path>
      </svg>
      ${message}
    </div>
  `;

  document.body.appendChild(toast);

  // Stay longer — 3 seconds
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(-20px)";
    setTimeout(() => toast.remove(), 600);
  }, 3000);

  // Animations
  if (!document.getElementById('pending-global-style')) {
    const style = document.createElement('style');
    style.id = 'pending-global-style';
    style.textContent = `
      @keyframes pendingGlobalSlide {
        from { opacity: 0; transform: translateX(-50%) translateY(-50px) scale(0.9); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }
};


// Global listener to clear pending tx whenever a balance_update event fires
window.addEventListener('balance_update', (e) => {
  try {
    removePendingTxFromStorage();
    console.log('[global] balance_update received — cleared pending tx');
  } catch (err) {
    console.warn('[global] failed to clear pending tx on balance_update', err);
  }
});


// Sync UI across tabs: when pending tx is removed elsewhere, reopen fresh add-money form
window.addEventListener('storage', (ev) => {
  try {
    if (ev.key === PENDING_TX_KEY && ev.newValue === null) {
      console.log('[storage] pending tx removed in another tab — updating UI');
      // If addMoney modal is open with a generated account, replace it with the fresh form
      openAddMoneyModalContent();
    }
  } catch (e) { /* ignore */ }
});




// --- Helper: check server for pending transaction (read-only) ---
async function fetchPendingTransaction() {
  try {
    const res = await apiFetch('/api/fund-wallet/pending', { method: 'GET' });
    if (res.ok && res.data && res.data.reference) return { ok: true, data: res.data };
    return { ok: false };
  } catch (e) {
    console.error('[fetchPendingTransaction] error', e);
    return { ok: false };
  }
}

// --- Helper: show notification (uses your window.notify or a fallback) ---
function showLocalNotify(message, type = 'info') {
  if (typeof window.notify === 'function') {
    try { window.notify(message, type); return; } catch (e) { /* fallback below */ }
  }

  // Minimal toast fallback
  const bg = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#f59e0b');
  const t = Object.assign(document.createElement('div'), {
    textContent: message,
    style: `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:${bg};color:white;padding:12px 20px;border-radius:12px;z-index:999999;font-weight:700;opacity:0;transition:all .3s;`
  });
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform += ' translateY(6px)'; });
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, 3000);
}




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
async function openAddMoneyModalContent() {
  // Clear any existing countdown
  if (countdownTimerInterval) {
    clearInterval(countdownTimerInterval);
    countdownTimerInterval = null;
  }

  const contentContainer = addMoneyModal.querySelector('.addMoney-modal-content');

  // Try localStorage first
const pending = getPendingTxFromStorage();
if (pending) {
  // Show quick "Getting your pending transaction..." UI briefly
  contentContainer.innerHTML = `
    <div style="padding:18px; text-align:center;">
      <div style="font-weight:700; margin-bottom:6px;">Getting your pending transaction...</div>
      <div style="opacity:0.85; font-size:13px;">Loading your unpaid account — it hasn't expired yet.</div>
    </div>
  `;

    // Use the REAL global toast instead
  window.showPendingTxToast("Please complete your pending transaction.");

  // Load the pending account UI after brief delay
  setTimeout(() => showGeneratedAccount(pending), 150);
  return;
}


  // No local pending -> render normal form
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

/* 3) When a balance update arrives (payment completed), clear localStorage so modal won't show old tx */
(function patchBalanceUpdateClear() {
  const origHandle = window.__handleBalanceUpdate;
  window.__handleBalanceUpdate = function(data) {
    try {
      if (data && data.type === 'balance_update') {
        // clear local pending tx on successful payment
        removePendingTxFromStorage();
      }
    } catch (e) { /* ignore */ }

    if (typeof origHandle === 'function') {
      try { origHandle(data); } catch (e) { console.error('[handleBalanceUpdate] wrapped handler error', e); }
    } else {
      // keep existing handler behavior if none existed
      handleBalanceUpdate(data);
    }
  };
})();
window.openAddMoneyModalContent = window.openAddMoneyModalContent || openAddMoneyModalContent;

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
  let isFundingInProgress = false;

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

  // 1) If localStorage has a pending tx
  const localPending = getPendingTxFromStorage();
  if (localPending) {
    window.showPendingTxToast("Please complete your pending transaction.");
    showGeneratedAccount(localPending);
    return;
  }

  // 2) No local pending → check server
  isFundingInProgress = true;
  fundBtn.disabled = true;
  fundBtn.textContent = 'Checking…';

  try {
    // --- WITHLOADER ADDED HERE ---
    const check = window.withLoader
      ? await window.withLoader(() => fetchPendingTransaction())
      : await fetchPendingTransaction();

    if (check.ok && check.data) {
      showGeneratedAccount(check.data);
      window.showPendingTxToast("Please complete your pending transaction.");
      return;
    }

    // 3) No pending → create new transaction
    fundBtn.textContent = 'Processing...';

    const res = window.withLoader
      ? await window.withLoader(() =>
          apiFetch('/api/fund-wallet', {
            method: 'POST',
            body: { amount }
          })
        )
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
    isFundingInProgress = false;
    fundBtn.disabled = false;
    fundBtn.textContent = 'Fund Wallet';
  }
});

}

/* ---------- localStorage helpers ---------- */
const PENDING_TX_KEY = 'flexgig.pending_fund_tx';

function savePendingTxToStorage(tx) {
  try {
    // Normalize stored shape: accountNumber, bankName, reference, orderNo, amount, expiresAt, status
    const store = {
      accountNumber: tx.accountNumber,
      bankName: tx.bankName,
      reference: tx.reference,
      orderNo: tx.orderNo,
      amount: Number(tx.amount),
      expiresAt: tx.expiresAt, // ISO string expected
      status: tx.status || 'pending',
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(PENDING_TX_KEY, JSON.stringify(store));
    console.log('[localStorage] Saved pending tx', store);
  } catch (e) {
    console.warn('[localStorage] Save failed', e);
  }
}

function removePendingTxFromStorage() {
  try {
    localStorage.removeItem(PENDING_TX_KEY);
    console.log('[localStorage] Removed pending tx');
  } catch (e) {
    console.warn('[localStorage] Remove failed', e);
  }
}

function getPendingTxFromStorage() {
  try {
    const raw = localStorage.getItem(PENDING_TX_KEY);
    if (!raw) return null;
    const tx = JSON.parse(raw);

    if (!tx || !tx.expiresAt || !tx.reference) return null;

    // Validate expiry
    const now = Date.now();
    const expiry = new Date(tx.expiresAt).getTime();
    if (Number.isNaN(expiry) || expiry <= now) {
      // expired -> cleanup
      removePendingTxFromStorage();
      return null;
    }

    // only return when status is pending
    if ((tx.status || '').toLowerCase() !== 'pending') {
      removePendingTxFromStorage();
      return null;
    }

    return tx;
  } catch (e) {
    console.warn('[localStorage] Read failed', e);
    return null;
  }
}

// --- Show Generated Bank Account ---
function showGeneratedAccount(data) {
  // Save to localStorage immediately so reloads show it
  try {
    // ensure expiresAt is ISO (backend already sends ISO), but normalize if needed
    if (data.expiresAt && typeof data.expiresAt === 'string') {
      // ok
    } else if (data.expiresAt instanceof Date) {
      data.expiresAt = data.expiresAt.toISOString();
    } else if (data.expiresAt && typeof data.expiresAt === 'number') {
      // timestamp ms
      data.expiresAt = new Date(data.expiresAt).toISOString();
    }
    savePendingTxToStorage({
      accountNumber: data.accountNumber,
      bankName: data.bankName,
      reference: data.reference,
      orderNo: data.orderNo,
      amount: data.amount,
      expiresAt: data.expiresAt,
      status: data.status || 'pending'
    });
  } catch (e) {
    console.warn('[showGeneratedAccount] could not save to localStorage', e);
  }

  // Clear any existing countdown
  if (countdownTimerInterval) {
    clearInterval(countdownTimerInterval);
    countdownTimerInterval = null;
  }

  // Calculate initial countdown in seconds
  let countdown;
  if (data.expiresAt) {
    const expiryDate = new Date(data.expiresAt);
    const now = new Date();
    countdown = Math.floor((expiryDate - now) / 1000);
    if (countdown < 0) countdown = 0;
  } else {
    countdown = 30 * 60; // default 30 minutes
  }

  const modalContent = document.createElement('div');
  modalContent.classList.add('addMoney-generated-content');

  modalContent.innerHTML = `
    <div class="addMoney-generated-body" style="padding:14px; background:#111010ff; border-radius:16px; color:#ffffff; min-height:55vh; max-height:60vh; overflow-y:auto; display:block; text-align:left; box-sizing:border-box;">
      <p style="margin:0; font-size:10px; opacity:0.75; text-transform: uppercase;">Amount to Pay</p>
      <div style="font-size:20px; font-weight:700; margin:6px 0 14px;">₦${Number(data.amount).toLocaleString()}</div>

      <div style="margin-bottom:12px;">
        <p style="margin:0; font-size:10px; opacity:0.75; text-transform: uppercase;">Bank</p>
        <img src="/frontend/img/opay-logo.png" alt="Bank Logo" onerror="this.style.display='none'" style="width:auto; height:36px; margin-top:6px; object-fit:contain;">
      </div>

      <div style="margin-bottom:12px;">
        <p style="margin:0; font-size:10px; opacity:0.75; text-transform: uppercase;">Account Name</p>
        <div style="font-size:15px; font-weight:600; margin-top:4px;">Flexgig Digital Network</div>
      </div>

      <div style="margin-bottom:14px;">
        <p style="margin:0; font-size:10px; opacity:0.75; text-transform: uppercase;">Account Number</p>
        <div style="display:flex; align-items:center; gap:10px; margin-top:6px; flex-wrap: wrap;">
          <span style="font-size:18px; font-weight:700; letter-spacing:1px; word-break: break-all;">${data.accountNumber}</span>
          <button class="copy-btn" data-copy="${data.accountNumber}" style="border:none; background:#3b82f6; padding:8px 10px; border-radius:8px; cursor:pointer;">
            <svg width="18px" height="18px" viewBox="0 0 24 24" fill="none">
              <path d="M6 11C6 8.17157 6 6.75736 6.87868 5.87868C7.75736 5 9.17157 5 12 5H15C17.8284 5 19.2426 5 20.1213 5.87868C21 6.75736 21 8.17157 21 11V16C21 18.8284 21 20.2426 20.1213 21.1213C19.2426 22 17.8284 22 15 22H12C9.17157 22 7.75736 22 6.87868 21.1213C6 20.2426 6 18.8284 6 16V11Z" stroke="#ffffff" stroke-width="1.3"></path>
              <path opacity="0.5" d="M6 19C4.34315 19 3 17.6569 3 16V10C3 6.22876 3 4.34315 4.17157 3.17157C5.34315 2 7.22876 2 11 2H15C16.6569 2 18 3.34315 18 5" stroke="#ffffff" stroke-width="1.3"></path>
            </svg>
          </button>
        </div>
      </div>

      <div style="margin-bottom:10px;">
        <p style="margin:0; font-size:10px; opacity:0.75; text-transform: uppercase;">Expires In</p>
        <div style="margin-top:6px; background:#10b981; padding:6px 12px; border-radius:10px; font-size:18px; font-weight:700; display:inline-block;">
          <span id="genCountdown">30:00</span>
        </div>
      </div>

      <div style="margin-top:18px; display:flex; justify-content:center;">
        <button id="cancelTransactionBtn" class="addMoney-cancel-btn" style="background:transparent; border:1px solid rgba(255,255,255,0.12); color:#fff; padding:10px 14px; border-radius:12px; font-weight:700; cursor:pointer; width:100%;">Cancel transaction</button>
      </div>
    </div>
  `;

  // Replace modal content
  const contentContainer = addMoneyModal.querySelector('.addMoney-modal-content');
  contentContainer.innerHTML = '';
  contentContainer.appendChild(modalContent);

  // --- Copy Account Number ---
    const copyBtn = modalContent.querySelector('.copy-btn');

  copyBtn?.addEventListener('click', async e => {
  const text = e.currentTarget.dataset.copy;
  await navigator.clipboard.writeText(text);
  const t = Object.assign(document.createElement('div'), {
    textContent: `✓ ${text} copied!`,
    style: `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#10b981;color:white;padding:16px 28px;border-radius:16px;font-weight:bold;z-index:999999;box-shadow:0 10px 30px rgba(0,0,0,0.3);opacity:0;transition:opacity .3s,transform .4s`
  });
  document.body.appendChild(t);
  requestAnimationFrame(() => (t.style.opacity = '1', t.style.transform += ' translateY(10px)'));
  setTimeout(() => (t.style.opacity = '0', setTimeout(() => t.remove(), 400)), 2800);
});

  // --- Countdown + Expire Handling ---
  const countdownEl = modalContent.querySelector('#genCountdown');
  const updateCountdown = () => {
    if (!countdownEl) return;
    const minutes = Math.floor(countdown / 60);
    const seconds = countdown % 60;
    countdownEl.textContent = countdown > 0
      ? `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`
      : 'EXPIRED';

    if (countdown <= 0) {
      countdownEl.parentElement.style.background = '#ef4444';
    }
  };

  if (countdownTimerInterval) clearInterval(countdownTimerInterval);
  countdownTimerInterval = setInterval(() => {
    countdown--;
    updateCountdown();
    if (countdown < 0) {
      removePendingTxFromStorage();
      handleTransactionCancelOrExpire(data.reference);
    }
  }, 1000);
  updateCountdown();

  // --- Cancel Button ---
  const cancelBtn = modalContent.querySelector('#cancelTransactionBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      removePendingTxFromStorage();
      handleTransactionCancelOrExpire(data.reference);
    });
  }

  // --- Close Button (optional) ---
  const closeBtn = modalContent.querySelector('.addMoney-modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (window.modalManager?.closeModal) window.modalManager.closeModal('addMoneyModal');
      else addMoneyModal.style.transform = 'translateY(100%)';
      if (countdownTimerInterval) {
        clearInterval(countdownTimerInterval);
        countdownTimerInterval = null;
      }
    });
  }
}

// --- Cancel / Expire Transaction Helper ---
async function handleTransactionCancelOrExpire(reference) {
  // 1. Stop timer
  countdownTimerInterval && clearInterval(countdownTimerInterval);

  // 2. Close modal FIRST (with nice animation)
  window.ModalManager?.closeModal?.('addMoneyModal') ||
    (document.getElementById('addMoneyModal').style.transform = 'translateY(100%)');

  // ⭐ Toast must appear IMMEDIATELY after modal starts closing
  const t = Object.assign(document.createElement('div'), {
    textContent: reference ? 'Transaction cancelled' : 'Session expired',
    style: `
      position:fixed;
      top:20px;
      left:50%;
      transform:translateX(-50%);
      background:#f59e0b;
      color:white;
      padding:16px 28px;
      border-radius:16px;
      font-weight:bold;
      z-index:999999;
      box-shadow:0 10px 30px rgba(0,0,0,0.3);
      opacity:0;
      transition:all .4s;
    `
  });

  // ⭐ Append & animate immediately
  document.body.appendChild(t);
  requestAnimationFrame(() => {
    t.style.opacity = '1';
    t.style.transform += ' translateY(10px)';
  });

  // Remove later
  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 400);
  }, 2500);

  // 3. Handle backend cancel AFTER modal animation
  setTimeout(async () => {
    if (reference) {
      try {
        await apiFetch(`/api/fund-wallet/cancel/${reference}`, { method:'POST' });
      } catch (e) {
        console.error('Cancel failed:', e);
      }
    }

    // 5. Reopen fresh Add Money form
    openAddMoneyModalContent();
  }, 400); // match close animation
}

window.handleTransactionCancelOrExpire = window.handleTransactionCancelOrExpire || handleTransactionCancelOrExpire; 


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
  input.setAttribute('inputmode', 'none');
  input.style.pointerEvents = 'none';
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
    }, 300);
  });
});

// --- Cleanup countdown on page unload ---
window.addEventListener('beforeunload', () => {
  if (countdownTimerInterval) {
    clearInterval(countdownTimerInterval);
  }
});

// --- MOBILE DEBUG: Test balance update manually ---
window.testBalanceUpdate = function(amount = 5000, balance = 50000) {
  console.log('[TEST] Triggering balance update...');
  
  // Test via global handler
  if (window.__handleBalanceUpdate) {
    window.__handleBalanceUpdate({
      type: 'balance_update',
      amount: amount,
      balance: balance
    });
  }
  
  // Also dispatch custom event
  window.dispatchEvent(new CustomEvent('balance_update', {
    detail: {
      type: 'balance_update',
      amount: amount,
      balance: balance
    }
  }));
  
  console.log('[TEST] Balance update dispatched');
  alert('Test balance update sent! Check console for logs.');
};

// 🔥 MOBILE DEBUG: WebSocket status indicator
window.getWebSocketStatus = function() {
  const status = {
    userID: window.__USER_UID || localStorage.getItem('userId'),
    wsState: 'Not connected',
    listenerRegistered: !!window.__handleBalanceUpdate,
    modalExists: !!document.getElementById('addMoneyModal')
  };
  
  console.table(status);
  alert(JSON.stringify(status, null, 2));
  return status;
};

console.log('[Fund Wallet] Script loaded.');
console.log('[Fund Wallet] Test balance update: testBalanceUpdate(5000, 50000)');
console.log('[Fund Wallet] Check WebSocket: getWebSocketStatus()');

/* ---------- Ensure add-money modal reads localStorage before opening ---------- */
// Paste this once (e.g. near the bottom of your addmoney.js)
(function ensureAddMoneyModalPreloads() {
  // Helper: safe call to prepare modal content
  function prepareAddMoneyModal() {
    try {
      if (typeof openAddMoneyModalContent === 'function') {
        openAddMoneyModalContent();
        console.log('[preload] addMoney modal content prepared from localStorage');
      } else {
        console.warn('[preload] openAddMoneyModalContent not available');
      }
    } catch (e) {
      console.warn('[preload] failed to prepare addMoney modal', e);
    }
  }

  // 1) Intercept clicks on common openers (data attribute, class, id)
  const clickSelectors = [
    '[data-open-modal="addMoneyModal"]', // generic data attribute pattern
    '.open-add-money-btn',               // optional class usage
    '#openAddMoneyBtn'                   // optional id usage
  ];
  clickSelectors.forEach(sel => {
    document.addEventListener('click', (ev) => {
      const el = ev.target.closest && ev.target.closest(sel);
      if (!el) return;
      // prepare content first (no await needed)
      prepareAddMoneyModal();
      // allow other click handlers (and modal open) to run
    });
  });

  // 2) If your app uses a ModalManager with openModal(name) — wrap it so it prepares first
  if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
    const origOpen = window.ModalManager.openModal.bind(window.ModalManager);
    window.ModalManager.openModal = function(name, ...args) {
      if (name === 'addMoneyModal') {
        prepareAddMoneyModal();
      }
      return origOpen(name, ...args);
    };
  }

  // 3) If your app dispatches a custom 'modalOpened' event after open, also prepare on it.
  //    This is safe: openAddMoneyModalContent is idempotent.
  document.addEventListener('modalOpened', (e) => {
    if (e?.detail === 'addMoneyModal') {
      prepareAddMoneyModal();
    }
  });

  // 4) For extra safety, if someone programmatically focuses the add-money button via keyboard,
  //    handle keydown Enter/Space on those openers (same selectors).
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const active = document.activeElement;
    if (!active) return;
    if (active.matches && clickSelectors.some(sel => active.matches(sel))) {
      prepareAddMoneyModal();
    }
  });

  // 5) Optional: if you want the modal content prepared immediately on page load
  //    (so the first click has zero delay), call prepareAddMoneyModal() here — uncomment if desired:


})();
// ─────────────────────────────────────────────────────────────
// SUCCESS SOUND – “Ding!” when payment is received
// Just place your file at: /sounds/success-ding.wav (or change the path below)
// ─────────────────────────────────────────────────────────────
(function addPaymentSuccessSound() {
  // Change this path if you put the file somewhere else
  const SOUND_URL = '/frontend/sound/paymentReceived.wav';

  // Create the audio element once (reuse it forever
  const successAudio = new Audio(SOUND_URL);
  successAudio.preload = 'auto';
  successAudio.volume = 0.65; // feels perfect on mobile & desktop

  // Fix iOS/Android silent-mode issues – we “unlock” audio on first user touch
  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    successAudio.play().catch(() => {}); // empty play → unlocks audio context
    successAudio.pause();
    successAudio.currentTime = 0;
    audioUnlocked = true;

    // Remove listeners after first real interaction
    document.body.removeEventListener('touchstart', unlockAudio);
    document.body.removeEventListener('click', unlockAudio);
  }
  document.body.addEventListener('touchstart', unlockAudio, { once: true });
  document.body.addEventListener('click', unlockAudio, { once: true });

  // Public function you can call anywhere
  window.playSuccessSound = function () {
    if (!audioUnlocked) {
      // If somehow not unlocked yet, try once more
      successAudio.play().catch(() => {});
      return;
    }
    successAudio.currentTime = 0; // rewind
    successAudio.play().catch(e => console.warn('Success sound failed:', e));
  };
})();