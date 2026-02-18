// --- API helper ---
window.__SEC_API_BASE = window.__SEC_API_BASE || 'https://api.flexgig.com.ng';

async function apiFetch(path, opts = {}) {
  const base = window.__SEC_API_BASE.replace(/\/+$/, '');
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  const { method = 'GET', headers = {}, body = null, timeout = 10000, retries = 2, retryDelay = 500 } = opts;
  headers['Accept'] = headers['Accept'] || 'application/json';
  if (body && !(body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  let attempt = 0;
  while (true) {
    attempt++;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { method, headers, body: body && !(body instanceof FormData) ? JSON.stringify(body) : body, signal: controller.signal, credentials: 'include' });
      clearTimeout(id);
      let payload = null;
      const text = await res.text();
      try { payload = text ? JSON.parse(text) : null; } catch (e) { payload = text; }
      if (res.ok) return { ok: true, status: res.status, data: payload };
      if (res.status >= 500 && attempt <= retries + 1) { await new Promise(r => setTimeout(r, retryDelay * Math.pow(2, attempt - 1))); continue; }
      return { ok: false, status: res.status, error: payload || { message: res.statusText } };
    } catch (err) {
      clearTimeout(id);
      if (err.name === 'AbortError') {
        if (attempt <= retries + 1) { await new Promise(r => setTimeout(r, retryDelay * Math.pow(2, attempt - 1))); continue; }
        return { ok: false, error: { message: 'Request timed out' } };
      }
      if (attempt <= retries + 1) { await new Promise(r => setTimeout(r, retryDelay * Math.pow(2, attempt - 1))); continue; }
      return { ok: false, error: { message: err.message || 'Network error' } };
    }
  }
}

// --- Global countdown timer reference ---
let countdownTimerInterval = null;

// --- Modal Elements ---
const addMoneyModal = document.getElementById('addMoneyModal');

// ─────────────────────────────────────────────────────────────
// KYC STATE — persisted in localStorage
// ─────────────────────────────────────────────────────────────
const KYC_STATE_KEY = 'flexgig.kyc_verified';

function getKYCState() {
  try { const raw = localStorage.getItem(KYC_STATE_KEY); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}

function saveKYCState(accounts) {
  try { localStorage.setItem(KYC_STATE_KEY, JSON.stringify({ verified: true, accounts })); }
  catch (e) { console.warn('[KYC] Save state failed', e); }
}

// ─────────────────────────────────────────────────────────────
// PERMANENT ACCOUNTS DATA (fake for testing)
// ─────────────────────────────────────────────────────────────
const PERMANENT_ACCOUNTS = [
  { bankName: 'PalmPay',  accountName: 'Flexgig Digital Network', accountNumber: '8031234567', logo: '/frontend/img/palmpay.png', logoFallback: 'PP', accentColor: '#00c853' },
  { bankName: '9PSB',     accountName: 'Flexgig Digital Network', accountNumber: '9010987654', logo: '/frontend/img/9PSB.png',    logoFallback: '9P', accentColor: '#0077ff' }
];

// ─────────────────────────────────────────────────────────────
// INJECT STYLES (once)
// ─────────────────────────────────────────────────────────────
(function injectPermStyles() {
  if (document.getElementById('perm-acct-styles')) return;
  const s = document.createElement('style');
  s.id = 'perm-acct-styles';
  s.textContent = `
    @keyframes permSlideUp {
      from { opacity: 0; transform: translateY(22px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes permBadgePop {
      0%   { transform: scale(0.6); opacity: 0; }
      70%  { transform: scale(1.1); }
      100% { transform: scale(1);   opacity: 1; }
    }
    @keyframes permCheckPop {
      0%   { transform: scale(0); opacity: 0; }
      60%  { transform: scale(1.2); }
      100% { transform: scale(1); opacity: 1; }
    }
    .perm-acct-card {
      animation: permSlideUp 0.38s cubic-bezier(.22,.68,0,1.2) both;
    }
    .perm-acct-card:nth-child(2) { animation-delay: 0.08s; }
    .perm-badge-anim { animation: permBadgePop 0.45s cubic-bezier(.22,.68,0,1.2) 0.25s both; }
    .perm-check-anim { animation: permCheckPop 0.4s cubic-bezier(.22,.68,0,1.2) 0.1s both; }
    .perm-copy-btn { transition: transform 0.15s, background 0.2s, border-color 0.2s; border: none; }
    .perm-copy-btn:active { transform: scale(0.88); }
  `;
  document.head.appendChild(s);
})();

// ─────────────────────────────────────────────────────────────
// BUILD COMPACT ACCOUNT CARDS (no-scroll layout)
// ─────────────────────────────────────────────────────────────
function buildAccountCards(accounts, container) {
  accounts.forEach(acct => {
    const card = document.createElement('div');
    card.className = 'perm-acct-card';
    card.style.cssText = `
      background:#1c1c1e; border:1px solid rgba(255,255,255,0.08);
      border-radius:14px; padding:12px 14px;
      position:relative; overflow:hidden;
    `;
    card.innerHTML = `
      <!-- Glow -->
      <div style="position:absolute;top:-20px;right:-20px;width:75px;height:75px;border-radius:50%;
        background:radial-gradient(circle,${acct.accentColor}18,transparent 70%);pointer-events:none;"></div>

      <!-- Bank + Account Name row -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:36px;height:36px;border-radius:9px;background:#252525;flex-shrink:0;
          display:flex;align-items:center;justify-content:center;overflow:hidden;">
          <img src="${acct.logo}" alt="${acct.bankName}"
            style="width:100%;height:100%;object-fit:contain;"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
          <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;
            font-size:10px;font-weight:800;color:${acct.accentColor};">${acct.logoFallback}</div>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:9px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;">Bank</div>
          <div style="font-size:13px;font-weight:700;color:#fff;">${acct.bankName}</div>
        </div>
      </div>

      <!-- Account Name -->
      <div style="margin-bottom:8px;">
        <div style="font-size:9px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Account Name</div>
        <div style="font-size:13px;font-weight:600;color:#fff;">${acct.accountName}</div>
      </div>

      <!-- Account Number + Copy -->
      <div>
        <div style="font-size:9px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">Account Number</div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:18px;font-weight:800;color:#fff;letter-spacing:2px;font-variant-numeric:tabular-nums;">${acct.accountNumber}</span>
          <button class="perm-copy-btn"
            data-copy="${acct.accountNumber}" data-bank="${acct.bankName}" data-accent="${acct.accentColor}"
            style="background:${acct.accentColor}1a;border:1px solid ${acct.accentColor}44 !important;
              padding:7px 9px;border-radius:9px;cursor:pointer;
              display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:auto;">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M6 11C6 8.17157 6 6.75736 6.87868 5.87868C7.75736 5 9.17157 5 12 5H15C17.8284 5 19.2426 5 20.1213 5.87868C21 6.75736 21 8.17157 21 11V16C21 18.8284 21 20.2426 20.1213 21.1213C19.2426 22 17.8284 22 15 22H12C9.17157 22 7.75736 22 6.87868 21.1213C6 20.2426 6 18.8284 6 16V11Z" stroke="${acct.accentColor}" stroke-width="1.5"/>
              <path opacity="0.5" d="M6 19C4.34315 19 3 17.6569 3 16V10C3 6.22876 3 4.34315 4.17157 3.17157C5.34315 2 7.22876 2 11 2H15C16.6569 2 18 3.34315 18 5" stroke="${acct.accentColor}" stroke-width="1.5"/>
            </svg>
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  // Copy handlers
  container.querySelectorAll('.perm-copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy, bank = btn.dataset.bank, accent = btn.dataset.accent;
      try { await navigator.clipboard.writeText(text); } catch {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      btn.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      btn.style.background = '#10b98122'; btn.style.borderColor = '#10b98144';

      const toast = document.createElement('div');
      toast.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);
        background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:13px 20px;
        border-radius:13px;font-weight:700;font-size:13px;z-index:999999999;
        box-shadow:0 10px 30px rgba(16,185,129,0.35);opacity:0;transition:opacity .3s,transform .35s;
        max-width:min(90%,340px);text-align:center;pointer-events:none;`;
      toast.textContent = `✓ ${bank} — ${text} copied!`;
      document.body.appendChild(toast);
      requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform += ' translateY(8px)'; });
      setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 350); }, 2200);

      setTimeout(() => {
        btn.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M6 11C6 8.17157 6 6.75736 6.87868 5.87868C7.75736 5 9.17157 5 12 5H15C17.8284 5 19.2426 5 20.1213 5.87868C21 6.75736 21 8.17157 21 11V16C21 18.8284 21 20.2426 20.1213 21.1213C19.2426 22 17.8284 22 15 22H12C9.17157 22 7.75736 22 6.87868 21.1213C6 20.2426 6 18.8284 6 16V11Z" stroke="${accent}" stroke-width="1.5"/>
          <path opacity="0.5" d="M6 19C4.34315 19 3 17.6569 3 16V10C3 6.22876 3 4.34315 4.17157 3.17157C5.34315 2 7.22876 2 11 2H15C16.6569 2 18 3.34315 18 5" stroke="${accent}" stroke-width="1.5"/>
        </svg>`;
        btn.style.background = `${accent}1a`; btn.style.borderColor = `${accent}44`;
      }, 1800);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// RENDER PERMANENT ACCOUNTS inside .kyc-modal-body
// Used both after verification AND on subsequent opens via addMoneyBtn
// showVerifiedBadge = true only right after submitting BVN/NIN
// ─────────────────────────────────────────────────────────────
function renderPermAccountsInKYCBody(showVerifiedBadge = false) {
  const kycModalBody = document.querySelector('#kycVerifyModal .kyc-modal-body');
  const kycTitle     = document.querySelector('#kycVerifyModal .kyc-modal-title');
  if (!kycModalBody) return;

  if (kycTitle) kycTitle.textContent = 'Add Money';

  kycModalBody.innerHTML = `
    ${showVerifiedBadge ? `
    <!-- KYC Verified header — full original style, shown only right after verify -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
      <div class="perm-check-anim" style="
        width:38px;height:38px;border-radius:50%;flex-shrink:0;
        background:linear-gradient(135deg,#10b981,#059669);
        display:flex;align-items:center;justify-content:center;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div style="flex:1;">
        <div style="font-size:15px;font-weight:800;color:#fff;line-height:1.2;">KYC Verified!</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;">Your permanent accounts are ready</div>
      </div>
      <div class="perm-badge-anim" style="
        background:linear-gradient(135deg,#10b981,#059669);color:#fff;
        font-size:10px;font-weight:800;padding:4px 10px;border-radius:20px;
        letter-spacing:0.5px;text-transform:uppercase;white-space:nowrap;">Permanent</div>
    </div>` : ''}

    <!-- Cards -->
    <div id="kycPermList" style="display:flex;flex-direction:column;gap:10px;"></div>

    <!-- Info note -->
    <div style="margin-top:12px;padding:10px 13px;background:rgba(255,255,255,0.04);
      border-radius:11px;border:1px solid rgba(255,255,255,0.07);
      display:flex;align-items:flex-start;gap:8px;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;margin-top:1px;">
        <circle cx="12" cy="12" r="10" stroke="#f59e0b" stroke-width="2"/>
        <path d="M12 8v4m0 4h.01" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <div style="font-size:11px;color:rgba(255,255,255,0.7);line-height:1.5;">
        These accounts are <strong style="color:#fff;">permanently assigned</strong> to you.
        Transfers reflect in your wallet instantly.
      </div>
    </div>
  `;

  const list = document.getElementById('kycPermList');
  buildAccountCards(PERMANENT_ACCOUNTS, list);
}

// ─────────────────────────────────────────────────────────────
// AUTO-CLOSE FUND MODAL + SUCCESS TOAST
// ─────────────────────────────────────────────────────────────
(function() {
  const MODAL_ID = 'addMoneyModal';
  function handleBalanceUpdate(data) {
    if (!data || data.type !== 'balance_update') return;
    const { balance, amount } = data;
    try { if (typeof removePendingTxFromStorage === 'function') removePendingTxFromStorage(); else localStorage.removeItem('flexgig.pending_fund_tx'); } catch (e) {}
    if (window.ModalManager?.closeModal) window.ModalManager.closeModal(MODAL_ID);
    else { const m = document.getElementById(MODAL_ID); if (m) { m.style.transform = 'translateY(100%)'; m.classList.add('hidden'); } }
    showSuccessToast(`₦${Number(amount).toLocaleString()} received!`, `Wallet updated to ₦${Number(balance).toLocaleString()}`);
    if (typeof window.playSuccessSound === 'function') window.playSuccessSound();
    setTimeout(() => openAddMoneyModalContent(), 500);
  }
  window.addEventListener('balance_update', (e) => handleBalanceUpdate(e.detail));
  window.__handleBalanceUpdate = handleBalanceUpdate;

  function showSuccessToast(title, subtitle = '') {
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed;top:calc(env(safe-area-inset-top,0px) + 20px);left:50%;transform:translateX(-50%);
      background:linear-gradient(135deg,#10b981,#059669);color:white;padding:16px 24px;border-radius:16px;
      box-shadow:0 10px 30px rgba(16,156,103,0.4);z-index:999999999;text-align:center;
      animation:toastSlideDown 0.45s ease-out,toastFadeOut 0.6s 3s forwards;
      max-width:min(92%,380px);width:max-content;backdrop-filter:blur(10px);
      border:1px solid rgba(255,255,255,0.25);pointer-events:auto;`;
    toast.innerHTML = `<div style="font-size:18px;font-weight:800;margin-bottom:4px;">✓ ${title}</div>${subtitle ? `<div style="font-size:14px;opacity:0.9;">${subtitle}</div>` : ''}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6600);
  }
  const s = document.createElement('style');
  s.textContent = `@keyframes toastSlideDown{from{opacity:0;transform:translate(-50%,-40px)}to{opacity:1;transform:translate(-50%,0)}}@keyframes toastFadeOut{to{opacity:0;transform:translate(-50%,-20px)}}`;
  document.head.appendChild(s);
})();

window.showPendingTxToast = function(message = 'Please complete your pending transaction') {
  document.querySelectorAll('.global-pending-toast').forEach(el => el.remove());
  const toast = document.createElement('div');
  toast.className = 'global-pending-toast';
  toast.style.cssText = `position:fixed;top:calc(env(safe-area-inset-top,0px) + 22px);left:50%;transform:translateX(-50%);
    background:linear-gradient(135deg,#f59e0b,#d97706);color:white;padding:18px 26px;border-radius:18px;
    font-weight:800;font-size:16px;text-align:center;box-shadow:0 14px 35px rgba(217,119,6,0.45);
    z-index:2147483647;max-width:min(92%,420px);width:max-content;backdrop-filter:blur(12px);
    border:1px solid rgba(255,255,255,0.28);animation:pendingGlobalSlide 0.45s ease-out;pointer-events:none;`;
  toast.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;gap:10px;">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>${message}</div>`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(-50%) translateY(-20px)'; setTimeout(() => toast.remove(), 600); }, 3000);
  if (!document.getElementById('pending-global-style')) {
    const s = document.createElement('style'); s.id = 'pending-global-style';
    s.textContent = `@keyframes pendingGlobalSlide{from{opacity:0;transform:translateX(-50%) translateY(-50px) scale(0.9)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}`;
    document.head.appendChild(s);
  }
};

window.addEventListener('balance_update', () => { try { removePendingTxFromStorage(); } catch (e) {} });
window.addEventListener('storage', (ev) => { try { if (ev.key === PENDING_TX_KEY && ev.newValue === null) openAddMoneyModalContent(); } catch (e) {} });

async function fetchPendingTransaction() {
  try { const res = await apiFetch('/api/fund-wallet/pending', { method: 'GET' }); if (res.ok && res.data?.reference) return { ok: true, data: res.data }; return { ok: false }; }
  catch (e) { return { ok: false }; }
}

function showLocalNotify(message, type = 'info') {
  if (typeof window.notify === 'function') { try { window.notify(message, type); return; } catch (e) {} }
  const bg = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#f59e0b');
  const t = Object.assign(document.createElement('div'), { textContent: message, style: `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:${bg};color:white;padding:12px 20px;border-radius:12px;z-index:999999;font-weight:700;opacity:0;transition:all .3s;` });
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform += ' translateY(6px)'; });
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, 3000);
}

function showGeneratedError(message = 'Failed to generate account. Try again.') {
  if (countdownTimerInterval) { clearInterval(countdownTimerInterval); countdownTimerInterval = null; }
  const contentContainer = addMoneyModal.querySelector('.addMoney-modal-content');
  contentContainer.innerHTML = `<div class="addMoney-generated-error">
    <button class="addMoney-modal-close" data-close>&times;</button>
    <h3 class="addMoney-modal-title">Oops!</h3>
    <p>${message}</p>
    <button class="addMoney-fund-btn" id="retryFundBtn">Retry</button>
  </div>`;
  contentContainer.querySelector('.addMoney-modal-close').addEventListener('click', () => openAddMoneyModalContent());
  document.getElementById('retryFundBtn').addEventListener('click', () => openAddMoneyModalContent());
}

// ─────────────────────────────────────────────────────────────
// OPEN ADD MONEY MODAL CONTENT
// If KYC verified → close addMoneyModal, open kycVerifyModal (full screen) instead
// ─────────────────────────────────────────────────────────────
async function openAddMoneyModalContent() {
  if (countdownTimerInterval) { clearInterval(countdownTimerInterval); countdownTimerInterval = null; }

  const kycState = getKYCState();
  if (kycState && kycState.verified) {
    // Close the bottom-sheet addMoneyModal first (if it's open or being opened)
    if (window.ModalManager) {
      // Small delay so the current open animation doesn't fight the close
      setTimeout(() => {
        window.ModalManager.closeModal('addMoneyModal');
        // Open the full-screen KYC modal with permanent accounts (no badge on re-open)
        setTimeout(() => {
          renderPermAccountsInKYCBody(false);
          window.ModalManager.openModal('kycVerifyModal');
        }, 120);
      }, 60);
    }
    return;
  }

  // Not verified — render normal deposit form inside addMoneyModal
  const contentContainer = addMoneyModal.querySelector('.addMoney-modal-content');
  const pending = getPendingTxFromStorage();
  if (pending) {
    contentContainer.innerHTML = `<div style="padding:18px;text-align:center;">
      <div style="font-weight:700;margin-bottom:6px;">Getting your pending transaction...</div>
      <div style="opacity:0.85;font-size:13px;">Loading your unpaid account — it hasn't expired yet.</div>
    </div>`;
    window.showPendingTxToast('Please complete your pending transaction.');
    setTimeout(() => showGeneratedAccount(pending), 150);
    return;
  }

  contentContainer.innerHTML = `
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
    <div class="addMoney-instant-label">Instant Deposit</div>
    <div class="addMoney-amount-section">
      <input type="tel" id="addMoneyAmountInput" class="addMoney-amount-input"
        autocomplete="off" inputmode="decimal" pattern="[0-9]*" placeholder="₦ Enter amount"/>
    </div>
    <div class="addMoney-quick-amounts">
      <button class="addMoney-quick-btn">₦500</button>
      <button class="addMoney-quick-btn">₦1,000</button>
      <button class="addMoney-quick-btn">₦2,000</button>
      <button class="addMoney-quick-btn">₦3,000</button>
      <button class="addMoney-quick-btn">₦5,000</button>
      <button class="addMoney-quick-btn">₦10,000</button>
    </div>
    <button id="addMoneyFundBtn" class="addMoney-fund-btn">Fund Wallet</button>
  `;
  assignAddMoneyEvents();
}
window.openAddMoneyModalContent = window.openAddMoneyModalContent || openAddMoneyModalContent;

(function patchBalanceUpdateClear() {
  const origHandle = window.__handleBalanceUpdate;
  window.__handleBalanceUpdate = function(data) {
    try { if (data?.type === 'balance_update') removePendingTxFromStorage(); } catch (e) {}
    if (typeof origHandle === 'function') { try { origHandle(data); } catch (e) {} }
  };
})();

// --- Assign Events to Add Money Modal ---
function assignAddMoneyEvents() {
  const amountInput = document.getElementById('addMoneyAmountInput');
  const quickBtns   = document.querySelectorAll('.addMoney-quick-btn');
  const fundBtn     = document.getElementById('addMoneyFundBtn');
  if (!amountInput || !fundBtn) return;

  let rawAmount = '';
  amountInput.addEventListener('input', () => {
    let v = amountInput.value.replace(/[^0-9]/g, '');
    rawAmount = v; amountInput.value = v ? '₦' + Number(v).toLocaleString() : '';
    quickBtns.forEach(b => b.classList.remove('selected'));
  });
  quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      quickBtns.forEach(b => b.classList.remove('selected')); btn.classList.add('selected');
      const value = btn.textContent.replace(/[^0-9]/g, ''); rawAmount = value;
      amountInput.value = '₦' + Number(value).toLocaleString();
    });
  });

  let isFundingInProgress = false;
  fundBtn.addEventListener('click', async () => {
    if (isFundingInProgress) return;
    const amount = parseInt(amountInput.value.replace(/[^0-9]/g, ''), 10);
    if (!amount || amount <= 0) { window.notify?.('Please enter a valid amount.', 'error'); return; }
    const localPending = getPendingTxFromStorage();
    if (localPending) { window.showPendingTxToast('Please complete your pending transaction.'); showGeneratedAccount(localPending); return; }
    isFundingInProgress = true; fundBtn.disabled = true; fundBtn.textContent = 'Checking…';
    try {
      const check = window.withLoader ? await window.withLoader(() => fetchPendingTransaction()) : await fetchPendingTransaction();
      if (check.ok && check.data) { showGeneratedAccount(check.data); window.showPendingTxToast('Please complete your pending transaction.'); return; }
      fundBtn.textContent = 'Processing...';
      const res = window.withLoader
        ? await window.withLoader(() => apiFetch('/api/fund-wallet', { method: 'POST', body: { amount } }))
        : await apiFetch('/api/fund-wallet', { method: 'POST', body: { amount } });
      if (res.ok) showGeneratedAccount(res.data);
      else showGeneratedError(res.error?.message || 'Failed to generate account.');
    } catch (err) { showGeneratedError('Network error. Try again.'); }
    finally { isFundingInProgress = false; fundBtn.disabled = false; fundBtn.textContent = 'Fund Wallet'; }
  });
}

/* ---------- localStorage helpers ---------- */
const PENDING_TX_KEY = 'flexgig.pending_fund_tx';

function savePendingTxToStorage(tx) {
  try { localStorage.setItem(PENDING_TX_KEY, JSON.stringify({ accountNumber: tx.accountNumber, bankName: tx.bankName, reference: tx.reference, orderNo: tx.orderNo, amount: Number(tx.amount), expiresAt: tx.expiresAt, status: tx.status || 'pending', savedAt: new Date().toISOString() })); } catch (e) {}
}
function removePendingTxFromStorage() { try { localStorage.removeItem(PENDING_TX_KEY); } catch (e) {} }
function getPendingTxFromStorage() {
  try {
    const raw = localStorage.getItem(PENDING_TX_KEY); if (!raw) return null;
    const tx = JSON.parse(raw); if (!tx?.expiresAt || !tx?.reference) return null;
    const expiry = new Date(tx.expiresAt).getTime();
    if (Number.isNaN(expiry) || expiry <= Date.now()) { removePendingTxFromStorage(); return null; }
    if ((tx.status || '').toLowerCase() !== 'pending') { removePendingTxFromStorage(); return null; }
    return tx;
  } catch (e) { return null; }
}

// --- Show Generated Bank Account (temporary) ---
function showGeneratedAccount(data) {
  try {
    if (data.expiresAt instanceof Date) data.expiresAt = data.expiresAt.toISOString();
    else if (typeof data.expiresAt === 'number') data.expiresAt = new Date(data.expiresAt).toISOString();
    savePendingTxToStorage({ accountNumber: data.accountNumber, bankName: data.bankName, reference: data.reference, orderNo: data.orderNo, amount: data.amount, expiresAt: data.expiresAt, status: data.status || 'pending' });
  } catch (e) {}

  if (countdownTimerInterval) { clearInterval(countdownTimerInterval); countdownTimerInterval = null; }
  let countdown = data.expiresAt ? Math.max(0, Math.floor((new Date(data.expiresAt) - new Date()) / 1000)) : 30 * 60;

  const modalContent = document.createElement('div');
  modalContent.classList.add('addMoney-generated-content');
  modalContent.innerHTML = `
    <div class="addMoney-generated-body" style="padding:7px 14px 14px 14px;background:#111010ff;border-radius:16px;color:#ffffff;min-height:55vh;max-height:60vh;overflow-y:auto;display:block;text-align:left;box-sizing:border-box;">
      <p style="margin:0;font-size:10px;opacity:0.75;text-transform:uppercase;">Amount to Pay</p>
      <div style="font-size:20px;font-weight:700;margin:6px 0 14px;">₦${Number(data.amount).toLocaleString()}</div>
      <div style="margin-bottom:12px;">
        <p style="margin:0;font-size:10px;opacity:0.75;text-transform:uppercase;">Bank</p>
        <img src="/frontend/img/9PSB.png" alt="9PSB" onerror="this.style.display='none'" style="width:auto;height:36px;margin-top:6px;object-fit:contain;">
      </div>
      <div style="margin-bottom:12px;">
        <p style="margin:0;font-size:10px;opacity:0.75;text-transform:uppercase;">Account Name</p>
        <div style="font-size:15px;font-weight:600;margin-top:4px;">Flexgig Digital Network</div>
      </div>
      <div style="margin-bottom:10px;">
        <p style="margin:0;font-size:10px;opacity:0.75;text-transform:uppercase;">Account Number</p>
        <div style="display:flex;align-items:center;gap:10px;margin-top:6px;flex-wrap:wrap;">
          <span style="font-size:18px;font-weight:700;letter-spacing:1px;word-break:break-all;">${data.accountNumber}</span>
          <button class="copy-btn" data-copy="${data.accountNumber}" style="border:none;background:#3b82f6;padding:8px 10px;border-radius:8px;cursor:pointer;">
            <svg width="18px" height="18px" viewBox="0 0 24 24" fill="none">
              <path d="M6 11C6 8.17157 6 6.75736 6.87868 5.87868C7.75736 5 9.17157 5 12 5H15C17.8284 5 19.2426 5 20.1213 5.87868C21 6.75736 21 8.17157 21 11V16C21 18.8284 21 20.2426 20.1213 21.1213C19.2426 22 17.8284 22 15 22H12C9.17157 22 7.75736 22 6.87868 21.1213C6 20.2426 6 18.8284 6 16V11Z" stroke="#ffffff" stroke-width="1.3"/>
              <path opacity="0.5" d="M6 19C4.34315 19 3 17.6569 3 16V10C3 6.22876 3 4.34315 4.17157 3.17157C5.34315 2 7.22876 2 11 2H15C16.6569 2 18 3.34315 18 5" stroke="#ffffff" stroke-width="1.3"/>
            </svg>
          </button>
        </div>
      </div>
      <p style="margin:0;font-size:10px;opacity:0.75;text-transform:uppercase;">Expires In</p>
      <div class="generated-countdown-row">
        <div><div class="countdown-box"><span id="genCountdown">30:00</span></div></div>
        <button id="iHavePaidBtn" class="verify-btn">I Have Paid</button>
      </div>
      <div style="margin-top:18px;display:flex;justify-content:center;">
        <button id="cancelTransactionBtn" class="addMoney-cancel-btn" style="background:transparent;border:1px solid rgba(255,255,255,0.12);color:#fff;padding:10px 14px;border-radius:12px;font-weight:700;cursor:pointer;width:100%;">Cancel transaction</button>
      </div>
    </div>`;

  const iHavePaidBtn = modalContent.querySelector('#iHavePaidBtn');
  if (iHavePaidBtn) {
    iHavePaidBtn.addEventListener('click', async () => {
      iHavePaidBtn.disabled = true; iHavePaidBtn.textContent = 'Verifying...'; iHavePaidBtn.style.background = '#6b7280';
      try {
        const res = await apiFetch('/api/fund-wallet/verify-pending', { method: 'POST', body: { reference: data.reference } });
        const resData = res.data || {}, status = resData?.status || (res.ok ? 'unknown' : 'error');
        const message = resData?.message || res.error?.message || JSON.stringify(resData);
        const colors = { completed: '#10b981', pending: '#f59e0b', failed: '#ef4444', error: '#ef4444' };
        const toast = document.createElement('div');
        toast.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:${colors[status]||'#3b82f6'};color:white;padding:14px 22px;border-radius:14px;font-weight:700;font-size:14px;z-index:999999999;box-shadow:0 10px 30px rgba(0,0,0,0.3);text-align:center;max-width:min(90%,380px);transition:opacity .4s;`;
        toast.textContent = `[${status.toUpperCase()}] ${message}`;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 4000);
        if (status === 'completed') {
          removePendingTxFromStorage();
          const amt = resData?.amount ?? data.amount ?? 0, bal = resData?.balance ?? 0;
          if (typeof window.__handleBalanceUpdate === 'function') window.__handleBalanceUpdate({ type: 'balance_update', amount: amt, balance: bal });
          else window.dispatchEvent(new CustomEvent('balance_update', { detail: { type: 'balance_update', amount: amt, balance: bal } }));
        }
      } catch (err) { showLocalNotify('Network error. Please try again.', 'error'); }
      finally { iHavePaidBtn.disabled = false; iHavePaidBtn.textContent = 'I Have Paid'; iHavePaidBtn.style.background = '#3b82f6'; }
    });
  }

  const contentContainer = addMoneyModal.querySelector('.addMoney-modal-content');
  contentContainer.innerHTML = ''; contentContainer.appendChild(modalContent);

  modalContent.querySelector('.copy-btn')?.addEventListener('click', async e => {
    const text = e.currentTarget.dataset.copy;
    await navigator.clipboard.writeText(text);
    const t = Object.assign(document.createElement('div'), { textContent: `✓ ${text} copied!`, style: `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#10b981;color:white;padding:16px 28px;border-radius:16px;font-weight:bold;z-index:999999;box-shadow:0 10px 30px rgba(0,0,0,0.3);opacity:0;transition:opacity .3s,transform .4s` });
    document.body.appendChild(t);
    requestAnimationFrame(() => (t.style.opacity = '1', t.style.transform += ' translateY(10px)'));
    setTimeout(() => (t.style.opacity = '0', setTimeout(() => t.remove(), 400)), 2800);
  });

  const countdownEl = modalContent.querySelector('#genCountdown');
  const updateCountdown = () => {
    if (!countdownEl) return;
    countdownEl.textContent = countdown > 0 ? `${String(Math.floor(countdown/60)).padStart(2,'0')}:${String(countdown%60).padStart(2,'0')}` : 'EXPIRED';
    if (countdown <= 0) countdownEl.parentElement.style.background = '#ef4444';
  };
  if (countdownTimerInterval) clearInterval(countdownTimerInterval);
  countdownTimerInterval = setInterval(() => { countdown--; updateCountdown(); if (countdown < 0) { removePendingTxFromStorage(); handleTransactionCancelOrExpire(data.reference); } }, 1000);
  updateCountdown();

  modalContent.querySelector('#cancelTransactionBtn')?.addEventListener('click', () => { removePendingTxFromStorage(); handleTransactionCancelOrExpire(data.reference); });
}

async function handleTransactionCancelOrExpire(reference) {
  countdownTimerInterval && clearInterval(countdownTimerInterval);
  window.ModalManager?.closeModal?.('addMoneyModal') || (document.getElementById('addMoneyModal').style.transform = 'translateY(100%)');
  const t = Object.assign(document.createElement('div'), { textContent: reference ? 'Transaction cancelled' : 'Session expired', style: `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#f59e0b;color:white;padding:16px 28px;border-radius:16px;font-weight:bold;z-index:999999;box-shadow:0 10px 30px rgba(0,0,0,0.3);opacity:0;transition:all .4s;` });
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform += ' translateY(10px)'; });
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2500);
  setTimeout(async () => {
    if (reference) { try { await apiFetch(`/api/fund-wallet/cancel/${reference}`, { method: 'POST' }); } catch (e) {} }
    openAddMoneyModalContent();
  }, 400);
}
window.handleTransactionCancelOrExpire = window.handleTransactionCancelOrExpire || handleTransactionCancelOrExpire;

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => { if (addMoneyModal) assignAddMoneyEvents(); }); }
else { if (addMoneyModal) assignAddMoneyEvents(); }

document.addEventListener('modalOpened', (e) => {
  if (e.detail !== 'addMoneyModal') return;
  const input = document.getElementById('addMoneyAmountInput');
  if (!input) return;
  input.setAttribute('readonly','readonly'); input.setAttribute('inputmode','none'); input.style.pointerEvents = 'none'; input.blur();
  requestAnimationFrame(() => { setTimeout(() => {
    input.style.pointerEvents = ''; input.removeAttribute('readonly'); input.removeAttribute('inputmode');
    const enable = () => { input.focus(); input.removeEventListener('click', enable); input.removeEventListener('touchstart', enable); };
    input.addEventListener('click', enable); input.addEventListener('touchstart', enable);
  }, 300); });
});

window.addEventListener('beforeunload', () => { if (countdownTimerInterval) clearInterval(countdownTimerInterval); });

window.testBalanceUpdate = function(amount = 5000, balance = 50000) {
  if (window.__handleBalanceUpdate) window.__handleBalanceUpdate({ type: 'balance_update', amount, balance });
  window.dispatchEvent(new CustomEvent('balance_update', { detail: { type: 'balance_update', amount, balance } }));
};
window.getWebSocketStatus = function() {
  const s = { userID: window.__USER_UID || localStorage.getItem('userId'), wsState: 'Not connected', listenerRegistered: !!window.__handleBalanceUpdate, modalExists: !!document.getElementById('addMoneyModal') };
  console.table(s); return s;
};

(function ensureAddMoneyModalPreloads() {
  function prepareAddMoneyModal() { try { if (typeof openAddMoneyModalContent === 'function') openAddMoneyModalContent(); } catch (e) {} }
  const clickSelectors = ['[data-open-modal="addMoneyModal"]','.open-add-money-btn','#openAddMoneyBtn'];
  clickSelectors.forEach(sel => { document.addEventListener('click', (ev) => { const el = ev.target.closest?.(sel); if (!el) return; prepareAddMoneyModal(); }); });
  if (window.ModalManager?.openModal) {
    const origOpen = window.ModalManager.openModal.bind(window.ModalManager);
    window.ModalManager.openModal = function(name, ...args) { if (name === 'addMoneyModal') prepareAddMoneyModal(); return origOpen(name, ...args); };
  }
  document.addEventListener('modalOpened', (e) => { if (e?.detail === 'addMoneyModal') prepareAddMoneyModal(); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const active = document.activeElement;
    if (active?.matches && clickSelectors.some(sel => active.matches(sel))) prepareAddMoneyModal();
  });
})();

(function addPaymentSuccessSound() {
  const successAudio = new Audio('/frontend/sound/paymentReceived.wav');
  successAudio.preload = 'auto'; successAudio.volume = 0.65;
  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    successAudio.play().catch(() => {}); successAudio.pause(); successAudio.currentTime = 0; audioUnlocked = true;
    document.body.removeEventListener('touchstart', unlockAudio); document.body.removeEventListener('click', unlockAudio);
  }
  document.body.addEventListener('touchstart', unlockAudio, { once: true });
  document.body.addEventListener('click', unlockAudio, { once: true });
  window.playSuccessSound = function() {
    if (!audioUnlocked) { successAudio.play().catch(() => {}); return; }
    successAudio.currentTime = 0; successAudio.play().catch(e => console.warn('Success sound failed:', e));
  };
})();

// ─────────────────────────────────────────────────────────────
// KYC MODAL LOGIC
// ─────────────────────────────────────────────────────────────
(function initKYCModal() {
  const kycModalBody  = document.querySelector('#kycVerifyModal .kyc-modal-body');
  const kycTitle      = document.querySelector('#kycVerifyModal .kyc-modal-title');
  const submitBtn     = document.getElementById('kycSubmitBtn');
  if (!kycModalBody) return;

  let activeType = 'BVN';
  const originalFormHTML = kycModalBody.innerHTML;

  // On every open: if KYC already verified → show permanent accounts (no badge)
  // If not verified → restore the form
  document.addEventListener('modalOpened', (e) => {
    if (e.detail !== 'kycVerifyModal') return;
    const kycState = getKYCState();
    if (kycState?.verified) {
      // Opened via addMoneyBtn redirect — show accounts, no verified badge
      renderPermAccountsInKYCBody(false);
    } else {
      restoreKYCForm();
      activeType = 'BVN';
      setActiveType('BVN');
      if (kycTitle) kycTitle.textContent = 'Complete KYC';
    }
  });

  function restoreKYCForm() {
    kycModalBody.innerHTML = originalFormHTML;
    document.getElementById('kycBtnBVN')?.addEventListener('click', () => setActiveType('BVN'));
    document.getElementById('kycBtnNIN')?.addEventListener('click', () => setActiveType('NIN'));
    document.getElementById('kycSubmitBtn')?.addEventListener('click', handleSubmit);
  }

  function setActiveType(type) {
    activeType = type;
    const _b = document.getElementById('kycBtnBVN'), _n = document.getElementById('kycBtnNIN');
    const _l = document.getElementById('kycInputLabel'), _h = document.getElementById('kycInputHint');
    const _i = document.getElementById('kycNumberInput'), _s = document.getElementById('kycSubmitBtn');
    _b?.classList.toggle('kyc-type-btn--active', type === 'BVN');
    _n?.classList.toggle('kyc-type-btn--active', type === 'NIN');
    if (_l) _l.textContent = `Enter your ${type}`;
    if (_s) _s.textContent = `Submit ${type}`;
    if (_h) { _h.textContent = type === 'BVN' ? 'Your 11-digit BVN — dial *565*0# on any network to retrieve it.' : 'Your 11-digit NIN — check your NIN slip or dial *346# to retrieve it.'; _h.classList.remove('kyc-input-hint--error'); }
    if (_i) { _i.classList.remove('kyc-number-input--error'); _i.value = ''; }
  }

  document.getElementById('kycBtnBVN')?.addEventListener('click', () => setActiveType('BVN'));
  document.getElementById('kycBtnNIN')?.addEventListener('click', () => setActiveType('NIN'));

  async function handleSubmit() {
    const _input = document.getElementById('kycNumberInput'), _hint = document.getElementById('kycInputHint'), _submit = document.getElementById('kycSubmitBtn');
    const value = _input?.value.replace(/\D/g, '') ?? '';
    if (value.length !== 11) {
      _input?.classList.add('kyc-number-input--error'); _hint?.classList.add('kyc-input-hint--error');
      if (_hint) _hint.textContent = `Please enter a valid 11-digit ${activeType}.`;
      setTimeout(() => {
        _input?.classList.remove('kyc-number-input--error'); _hint?.classList.remove('kyc-input-hint--error');
        if (_hint) _hint.textContent = activeType === 'BVN' ? 'Your 11-digit BVN — dial *565*0# on any network to retrieve it.' : 'Your 11-digit NIN — check your NIN slip or dial *346# to retrieve it.';
      }, 2500);
      return;
    }

    // ── TESTING PHASE ──
    if (_submit) { _submit.disabled = true; _submit.textContent = 'Verifying…'; }
    await new Promise(r => setTimeout(r, 900));
    if (_submit) { _submit.disabled = false; _submit.textContent = `Submit ${activeType}`; }

    saveKYCState(PERMANENT_ACCOUNTS);
    // Show full verified header — user just completed KYC for the first time
    renderPermAccountsInKYCBody(true);

    // ── PRODUCTION: remove testing block above, uncomment this ──
    // try {
    //   const res = await apiFetch('/api/kyc/submit', { method:'POST', body:{ type:activeType, number:value } });
    //   if (res.ok) { saveKYCState(res.data.accounts); renderPermAccountsInKYCBody(true); }
    //   else { if (_hint) { _hint.classList.add('kyc-input-hint--error'); _hint.textContent = res.error?.message || 'Submission failed.'; } setTimeout(() => _hint?.classList.remove('kyc-input-hint--error'), 3000); }
    // } catch (e) {
    //   if (_hint) { _hint.classList.add('kyc-input-hint--error'); _hint.textContent = 'Network error. Try again.'; } setTimeout(() => _hint?.classList.remove('kyc-input-hint--error'), 3000);
    // } finally { if (_submit) { _submit.disabled = false; _submit.textContent = `Submit ${activeType}`; } }
  }

  submitBtn?.addEventListener('click', handleSubmit);
})();

(function () {
  const KYC_STATE_KEY = 'flexgig.kyc_verified';
  const ADD_MONEY_BUTTON_SELECTORS = [
    '[data-modal="addMoneyModal"]',
    '#addMoneyBtn',
    '.add-money-btn'
  ];

  function getKYCState() {
    try {
      return JSON.parse(localStorage.getItem(KYC_STATE_KEY));
    } catch {
      return null;
    }
  }

  function patchAddMoneyButton(btn) {
    if (!btn || btn.dataset.kycPatched) return;
    btn.dataset.kycPatched = 'true';

    // Remove old modal triggers
    btn.removeAttribute('data-modal');
    btn.removeAttribute('onclick');
    btn.removeAttribute('href');

    // Attach KYC modal
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('[KYC] Opening KYC modal directly');

      // Render account cards with animation
      if (typeof renderPermAccountsInKYCBody === 'function') {
        renderPermAccountsInKYCBody(false);
        const cards = document.querySelectorAll(
          '#kycVerifyModal .perm-acct-card'
        );
        cards.forEach((card, i) => {
          card.style.transform = 'translateY(30px)';
          card.style.opacity = '0';
          card.style.transition = 'transform 0.5s ease, opacity 0.5s ease';
          setTimeout(() => {
            card.style.transform = 'translateY(0)';
            card.style.opacity = '1';
          }, 50 + i * 80);
        });
      }

      // Open KYC modal
      if (window.ModalManager?.openModal) {
        ModalManager.openModal('kycVerifyModal');
      } else {
        const modal = document.querySelector('#kycVerifyModal');
        if (modal) {
          modal.classList.add('active');
          modal.style.display = 'block';
        }
      }
    });

    console.log('[KYC] Add Money button successfully relinked');
  }

  function init() {
    const kycState = getKYCState();
    if (!kycState?.verified) {
      console.log('[KYC] Not verified, no changes applied');
      return;
    }

    console.log('[KYC] Verified user detected');

    // Observe DOM to catch button dynamically
    const observer = new MutationObserver(() => {
      for (const sel of ADD_MONEY_BUTTON_SELECTORS) {
        const btn = document.querySelector(sel);
        if (btn) patchAddMoneyButton(btn);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Run once immediately in case button is already in DOM
    for (const sel of ADD_MONEY_BUTTON_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn) patchAddMoneyButton(btn);
    }
  }

  init();
})();

(function () {
  if (!window.renderPermAccountsInKYCBody) return;

  // Patch renderPermAccountsInKYCBody to prevent card glitches
  window.renderPermAccountsInKYCBody = (function (originalFunc) {
    let renderedOnce = false;

    return function (showVerifiedBadge = false) {
      const kycModalBody = document.querySelector('#kycVerifyModal .kyc-modal-body');
      if (!kycModalBody) return;

      // Only render the account cards once
      if (!renderedOnce) {
        renderedOnce = true;
        originalFunc.call(this, showVerifiedBadge);

        // Optional: animate cards on first render
        const cards = kycModalBody.querySelectorAll('.perm-acct-card');
        cards.forEach((card, i) => {
          card.style.transform = 'translateY(30px)';
          card.style.opacity = '0';
          card.style.transition = 'transform 0.5s ease, opacity 0.5s ease';
          setTimeout(() => {
            card.style.transform = 'translateY(0)';
            card.style.opacity = '1';
          }, 50 + i * 80);
        });
      } else {
        // Only toggle verified badge if already rendered
        const badge = kycModalBody.querySelector('.perm-check-anim');
        if (badge) badge.style.display = showVerifiedBadge ? 'flex' : 'none';
      }
    };
  })(window.renderPermAccountsInKYCBody);

  // Safe immediate render; will only build cards once
  window.renderPermAccountsInKYCBody(false);

  console.log('[KYC] renderPermAccountsInKYCBody patched and ready');
})();
