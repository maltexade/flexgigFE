// balance.js
// Safe companion version — works with dashboard.js without conflict

(function () {
  // ----------------------
  // Internal state (numeric only)
  // ----------------------
  let _userBalance = parseFloat(localStorage.getItem('userBalance')) || 0;

  // ----------------------
  // ONLY update the global numeric value
  // Let dashboard.js handle ALL DOM updates, animation, eye sync, toasts, etc.
  // ----------------------
  function setBalanceValue(newBalance) {
    newBalance = Number(newBalance) || 0;
    if (newBalance === _userBalance) return;

    _userBalance = Number(newBalance.toFixed(2));

    // Persist locally
    try {
      localStorage.setItem('userBalance', _userBalance);
    } catch (e) {}

    // CRITICAL: Use dashboard.js's main updater if available
    if (typeof window.updateAllBalances === 'function') {
      window.updateAllBalances(_userBalance);
    } else {
      // Fallback: trigger custom event that dashboard.js listens to
      window.dispatchEvent(new CustomEvent('balance_update', {
        detail: { balance: _userBalance }
      }));
    }

    console.debug('[balance.js] Balance updated → delegated to dashboard.js', _userBalance);
  }

  // ----------------------
  // Expose safe getter/setter
  // ----------------------
  if (!Object.prototype.hasOwnProperty.call(window, 'userBalance')) {
    Object.defineProperty(window, 'userBalance', {
      configurable: true,
      enumerable: true,
      get() { return _userBalance; },
      set(v) { setBalanceValue(v); }
    });
  }

  // ----------------------
  // Helpers
  // ----------------------
  window.getUserBalance = () => _userBalance;
  window.setUserBalance = (v) => { window.userBalance = v; };

  // Optional: keep your own server fetch as backup
  async function fetchBalanceFromServer() {
    try {
      const res = await fetch('/api/wallet/balance', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');

      const data = await res.json();
      if (typeof data.balance !== 'undefined') {
        setBalanceValue(data.balance);
      }
    } catch (err) {
      console.warn('[balance.js] fetch failed, using cached', err);
    }
  }

  // Optional: keep your own WS if you want redundancy
  function initBalanceWebSocket() {
    try {
      const token = window.__JWT || window.__AUTH_TOKEN || null;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = token
        ? `${proto}://${location.host}/ws?t=${encodeURIComponent(token)}`
        : `${proto}://${location.host}/ws`;

      const ws = new WebSocket(url);

      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg?.type === 'balance_update' && typeof msg.balance !== 'undefined') {
            const currentUid = window.__USER_UID || localStorage.getItem('userId');
            if (!msg.user_uid || msg.user_uid === currentUid) {
              setBalanceValue(msg.balance);
            }
          }
        } catch (e) {
          console.warn('[balance.js] WS parse error', e);
        }
      });

      ws.addEventListener('open', () => console.debug('[balance.js] Backup WS connected'));
      ws.addEventListener('error', () => console.debug('[balance.js] Backup WS error'));
      ws.addEventListener('close', () => console.debug('[balance.js] Backup WS closed'));
    } catch (e) {
      console.warn('[balance.js] WS init failed', e);
    }
  }

  // ----------------------
  // Public API (safe)
  // ----------------------
  window.syncBalance = fetchBalanceFromServer;
  window.initBalanceWebSocket = initBalanceWebSocket;

  // ----------------------
  // Init
  // ----------------------
  (function init() {
    // Apply current cached value via main system
    if (typeof window.updateAllBalances === 'function') {
      window.updateAllBalances(_userBalance, true); // skip animation on load
    }

    // Optional: fetch fresh + start backup WS
    fetchBalanceFromServer();
    initBalanceWebSocket();
  })();

  console.log('[balance.js] Loaded safely — delegates to dashboard.js');
})();