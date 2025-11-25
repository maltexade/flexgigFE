// balance.js
// Minimal: only manages the numeric balance value (no eye/toggle logic).
// Expects server endpoints:
//   GET  /api/wallet/balance
//   POST /api/fund-wallet
// WS endpoint: /ws (server should authenticate and attach user_uid to socket if needed)

(function () {
  let _userBalance = 0;
  let __ws = null;

  // Back-compat: if an existing global userBalance or saved value exists, prefer it
  window._userBalance = window._userBalance || _userBalance || userBalance;

  // DOM node for the real balance value (we do not control masking/toggle)
  const realSpan = document.querySelector('.balance-real');

  function formatBalance(n) {
    const num = Number(n) || 0;
    try {
      return '₦' + num.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (e) {
      return '₦' + num.toFixed(2);
    }
  }

  // --- Replace your updateBalanceDisplay() with this ---
function updateBalanceDisplay() {
  const formatted = formatBalance(_userBalance);

  // 1) Update the authoritative ".balance-real" span (keeps mask module in control of visibility)
  if (realSpan) realSpan.textContent = formatted;

  // 2) Update other visible balance targets in the app so the user actually sees the change.
  //    We update elements that commonly hold balances in your dashboard:
  //    - any element with attribute [data-balance]
  //    - any element with class ".balance-value"
  //    - any element with id "topbar-balance" (common custom id)
  try {
    document.querySelectorAll('[data-balance]').forEach(el => {
      // if element is input-like, set value, else set textContent
      if ('value' in el) el.value = formatted;
      else el.textContent = formatted;
    });
  } catch (e) { /* ignore */ }

  try {
    document.querySelectorAll('.balance-value').forEach(el => {
      if ('value' in el) el.value = formatted;
      else el.textContent = formatted;
    });
  } catch (e) {}

  try {
    const tb = document.getElementById('topbar-balance');
    if (tb) {
      if ('value' in tb) tb.value = formatted;
      else tb.textContent = formatted;
    }
  } catch (e) {}

  // 3) Persist fallback copy locally
  try { localStorage.setItem('userBalance', String(_userBalance)); } catch (e) {}

  // 4) Emit an event so other modules (toaster, toggle, analytics) can react
  try {
    const ev = new CustomEvent('balance:updated', { detail: { balance: _userBalance, formatted }});
    window.dispatchEvent(ev);
  } catch (e) {}

  // 5) Debug log (leave in for a bit to confirm behavior)
  console.debug('[balance.js] updateBalanceDisplay ->', { raw: _userBalance, formatted });
}


  // expose updateBalanceDisplay if not already present
  window.updateBalanceDisplay = window.updateBalanceDisplay || updateBalanceDisplay;

  // Backwards-compatible global property window.userBalance (reads/writes to internal state)
  if (typeof window !== 'undefined') {
    // if a property already exists, preserve it; otherwise define it
    if (!Object.prototype.hasOwnProperty.call(window, 'userBalance')) {
      Object.defineProperty(window, 'userBalance', {
        configurable: true,
        enumerable: true,
        get() { return _userBalance; },
        set(v) {
          const n = Number(v);
          if (!Number.isNaN(n)) {
            _userBalance = Number(n.toFixed(2));
            updateBalanceDisplay();
          }
        }
      });
    }
  }

  // --- Named helpers (declare first, attach after) ---

  function getUserBalance() {
    return Number(_userBalance);
  }

  function setUserBalance(amount) {
    const n = Number(amount);
    if (Number.isNaN(n)) return;
    _userBalance = Number(n.toFixed(2));
    updateBalanceDisplay();
  }

  async function fetchBalanceFromServer() {
    try {
      const res = await fetch('/api/wallet/balance', { credentials: 'include' });
      if (!res.ok) {
        // fallback to localStorage
        _userBalance = parseFloat(localStorage.getItem('userBalance')) || 0;
        updateBalanceDisplay();
        return;
      }
      const data = await res.json();
      if (typeof data.balance !== 'undefined') {
        _userBalance = Number(data.balance);
        updateBalanceDisplay();
      } else {
        console.warn('[balance.js] /api/wallet/balance returned unexpected body', data);
      }
    } catch (err) {
      console.error('[balance.js] fetchBalanceFromServer error', err);
      _userBalance = parseFloat(localStorage.getItem('userBalance')) || 0;
      updateBalanceDisplay();
    }
  }

  async function createVirtualAccount(amount) {
    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      throw new Error('Invalid amount');
    }
    const res = await fetch('/api/fund-wallet', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(amount) })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.message || `Fund wallet failed (${res.status})`);
    }
    return await res.json(); // virtual account details
  }

  function initBalanceWebSocket() {
    try {
      if (window.__balanceWS && window.__balanceWS.readyState === 1) {
        __ws = window.__balanceWS;
        return;
      }

      const token = window.__JWT || window.__AUTH_TOKEN || null;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = token
        ? `${proto}://${location.host}/ws?t=${encodeURIComponent(token)}`
        : `${proto}://${location.host}/ws`;

      const ws = new WebSocket(url);
      __ws = ws;
      // expose the socket reference (but only set if not already present)
      window.__balanceWS = window.__balanceWS || ws;

      ws.addEventListener('open', () => console.debug('[balance.js] ws open'));
      ws.addEventListener('close', () => console.debug('[balance.js] ws closed'));
      ws.addEventListener('error', (e) => console.error('[balance.js] ws error', e));
      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg && msg.type === 'balance_update') {
            const currentUid = window.__USER_UID || localStorage.getItem('userId') || null;
            if (!msg.user_uid || !currentUid || msg.user_uid === currentUid) {
              if (typeof msg.balance !== 'undefined') {
                _userBalance = Number(msg.balance);
                updateBalanceDisplay();
                console.debug('[balance.js] balance updated via ws ->', _userBalance);
              }
            }
          }
        } catch (e) {
          console.warn('[balance.js] ws message parse error', e);
        }
      });
    } catch (e) {
      console.error('[balance.js] initBalanceWebSocket failed', e);
    }
  }

  // --- Attach public API to window, but preserve existing definitions if present ---

  window.getUserBalance = window.getUserBalance || getUserBalance;
  window.setUserBalance = window.setUserBalance || setUserBalance;
  window.syncBalance = window.syncBalance || fetchBalanceFromServer;
  window.createVirtualAccount = window.createVirtualAccount || createVirtualAccount;
  window.initBalanceWebSocket = window.initBalanceWebSocket || initBalanceWebSocket;

  // Also ensure a global alias for the ws reference exists (preserve if present)
  window.__balanceWS = window.__balanceWS || __ws;

  // Init: show stored/zero quickly, then fetch authoritative balance & open WS
  (function init() {
    _userBalance = parseFloat(localStorage.getItem('userBalance')) || 0;
    updateBalanceDisplay();
    // attach initial _userBalance to window as well (without overwriting if already set)
    window._userBalance = window._userBalance || _userBalance;
    // fetch authoritative balance & open websocket
    fetchBalanceFromServer();
    initBalanceWebSocket();
  })();

})();
