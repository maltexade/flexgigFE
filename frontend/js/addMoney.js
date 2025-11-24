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


// --- Modal Elements ---
const addMoneyModal = document.getElementById('addMoneyModal');
const amountInput = document.getElementById('addMoneyAmountInput');
const quickBtns = document.querySelectorAll('.addMoney-quick-btn');
const fundBtn = document.getElementById('addMoneyFundBtn');

// Keep raw value for backend
let rawAmount = "";

amountInput.addEventListener("input", () => {
  let v = amountInput.value.replace(/[^0-9]/g, ""); // numbers only
  rawAmount = v;

  if (!v) {
    amountInput.value = "";
    return;
  }

  amountInput.value = "₦" + Number(v).toLocaleString();
});

// Quick amount buttons click
document.querySelectorAll(".addMoney-quick-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const value = btn.textContent.replace(/[^0-9]/g, "");
    rawAmount = value;
    amountInput.value = "₦" + Number(value).toLocaleString();
  });
});

// --- Quick amount buttons ---
// --- Quick Amount Buttons ---
quickBtns.forEach(btn => {
  btn.addEventListener("click", () => {

    // Remove previously selected
    quickBtns.forEach(b => b.classList.remove("selected"));

    // Mark this button as selected
    btn.classList.add("selected");

    // Get value
    const value = btn.textContent.replace(/[^0-9]/g, "");
    rawAmount = value;
    amountInput.value = "₦" + Number(value).toLocaleString();
  });
});

// --- Remove selection ONLY when typing ---
amountInput.addEventListener("input", () => {
  quickBtns.forEach(b => b.classList.remove("selected"));
});

function parseAmountFromInputEl(inputEl) {
  if (!inputEl) return 0;
  const digits = (inputEl.value || '').replace(/[^0-9]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}


// --- Fund Wallet Button ---
// inside assignAddMoneyEvents() where you handle fundBtn click:


// if the modal HTML is already present on page load:
assignAddMoneyEvents();



function showGeneratedError(message = 'Failed to generate account. Try again.') {
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
    // Reopen the original Add Money modal content
    openAddMoneyModalContent();
  });
}
function openAddMoneyModalContent() {
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

function assignAddMoneyEvents() {
  const amountInput = document.getElementById('addMoneyAmountInput');
  const quickBtns = document.querySelectorAll('.addMoney-quick-btn');
  const fundBtn = document.getElementById('addMoneyFundBtn');

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
  fundBtn.addEventListener('click', async () => {
    const amount = parseInt(amountInput.value.replace(/[^0-9]/g,""));
    if (!amount || amount <= 0) return window.notify('Please enter a valid amount.', 'error');

    fundBtn.disabled = true;
    
    fundBtn.textContent = 'Processing...';
    return window.withLoader(async () => {
    try {
      const res = await apiFetch('/api/fund-wallet', {
  method: 'POST',
  body: { amount }
});


      if (res.ok) showGeneratedAccount(res.data);
      else showGeneratedError(res.error?.message  || 'Failed to generate account. Try again.');
    } catch (err) {
      console.error(err);
      showGeneratedError('Network error, try again.');
    } finally {
      fundBtn.disabled = false;
    
      fundBtn.textContent = 'Fund Wallet';
    }
   });
  });
}



// --- Show Generated Bank Account ---
function showGeneratedAccount(data) {
  // Start 30-minute countdown
  let countdown = 30 * 60; // 30 minutes in seconds

  const modalContent = document.createElement('div');
  modalContent.classList.add('addMoney-generated-content');

  modalContent.innerHTML = `
    <div class="addMoney-generated-header">
      <button class="addMoney-modal-close" data-close>&times;</button>
      <h3 class="addMoney-modal-title">Amount to Pay</h3>
    </div>

    <div class="addMoney-generated-body">
      <p><strong>₦${Number(data.amount).toLocaleString()}</strong></p>
      <p>Bank: OPay <img src="/images/opay-logo.svg" alt="Opay" class="addMoney-bank-logo" /></p>

      <div class="addMoney-account-details">
        <p>Account Number: <strong id="genAccountNumber">${data.accountNumber}</strong>
          <button class="copy-btn" data-copy="${data.accountNumber}">📋</button>
        </p>
        <p>Account Name: <strong>Flexgig Digital Network</strong></p>
        <p>Expires in: <span id="genCountdown">30:00</span></p>
      </div>

      <p class="addMoney-instruction">
        Use this account to deposit and your wallet will be funded instantly.
      </p>
    </div>
  `;

  // Replace modal content
  const contentContainer = addMoneyModal.querySelector('.addMoney-modal-content');
  contentContainer.innerHTML = '';
  contentContainer.appendChild(modalContent);

  // Close button
  modalContent.querySelector('.addMoney-modal-close').addEventListener('click', () => {
    modalManager.closeModal('addMoneyModal');
  });

  // Copy account number
  modalContent.querySelector('.copy-btn').addEventListener('click', (e) => {
    const accountNum = e.currentTarget.dataset.copy;
    navigator.clipboard.writeText(accountNum).then(() => {
      alert('Account number copied!');
    });
  });

  // Countdown timer
  const countdownEl = modalContent.querySelector('#genCountdown');
  const timerInterval = setInterval(() => {
    const minutes = Math.floor(countdown / 60);
    const seconds = countdown % 60;
    countdownEl.textContent = `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
    countdown--;
    if (countdown < 0) clearInterval(timerInterval);
  }, 1000);
}


// Redirect focus away from amount input when Add Money modal opens
document.addEventListener("modalOpened", (e) => {
    amountInput.blur();     // forcefully remove focus
amountInput.setAttribute("readonly", true); // block browser from focusing

  if (e.detail === "addMoneyModal") {
    setTimeout(() => {
      const guard = document.getElementById("addMoneyFocusGuard");
      if (guard) guard.focus(); // <-- Focus here instead of the input
    }, 20);
  }
});


// --- Optional: open modal function ---
function openAddMoneyModal() {
  addMoneyModal.style.transform = 'translateY(0)';
}

// --- Optional: close modal function ---
function closeAddMoneyModal() {
  addMoneyModal.style.transform = 'translateY(100%)';
}