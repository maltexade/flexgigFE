// balance.js
// Minimal: manages numeric balance with proper global exposure, WS updates, and server sync.

(function () {
  // ----------------------
  // Internal state
  // ----------------------
  let _userBalance = parseFloat(localStorage.getItem('userBalance')) || 0;
  let __ws = null;

  // DOM node for the authoritative balance display
  const realSpan = document.querySelector('.balance-real');

  // ----------------------
  // Formatting
  // ----------------------
  function formatBalance(n) {
    const num = Number(n) || 0;
    try {
      return '₦' + num.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (e) {
      return '₦' + num.toFixed(2);
    }
  }

  // ----------------------
  // Update DOM & localStorage
  // ----------------------
  function updateBalanceDisplay() {
    const formatted = formatBalance(_userBalance);

    // 1) Update primary span
    if (realSpan) realSpan.textContent = formatted;

    // 2) Update other targets
    try {
      document.querySelectorAll('[data-balance]').forEach(el => {
        if ('value' in el) el.value = formatted;
        else el.textContent = formatted;
      });
    } catch {}

    try {
      document.querySelectorAll('.balance-value').forEach(el => {
        if ('value' in el) el.value = formatted;
        else el.textContent = formatted;
      });
    } catch {}

    try {
      const tb = document.getElementById('topbar-balance');
      if (tb) {
        if ('value' in tb) tb.value = formatted;
        else tb.textContent = formatted;
      }
    } catch {}

    // 3) Persist locally
    try { localStorage.setItem('userBalance', _userBalance); } catch(e) {}

    // 4) Emit event
    try {
      const ev = new CustomEvent('balance:updated', { detail: { balance: _userBalance, formatted }});
      window.dispatchEvent(ev);
    } catch {}

    console.debug('[balance.js] updateBalanceDisplay ->', { raw: _userBalance, formatted });
  }

  // ----------------------
  // Expose as global getter/setter
  // ----------------------
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

  // ----------------------
  // Helpers
  // ----------------------
  window.getUserBalance = window.getUserBalance || (() => _userBalance);
  window.setUserBalance = window.setUserBalance || ((v) => { window.userBalance = v; });

  async function fetchBalanceFromServer() {
    try {
      const res = await fetch('/api/wallet/balance', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');

      const data = await res.json();
      if (typeof data.balance !== 'undefined') {
        window.userBalance = Number(data.balance);
      } else {
        console.warn('[balance.js] /api/wallet/balance returned unexpected body', data);
      }
    } catch (err) {
      console.error('[balance.js] fetchBalanceFromServer error', err);
      window.userBalance = parseFloat(localStorage.getItem('userBalance')) || 0;
    }
  }

  async function createVirtualAccount(amount) {
    if (!amount || Number(amount) <= 0) throw new Error('Invalid amount');
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
    return await res.json();
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
      window.__balanceWS = window.__balanceWS || ws;

      ws.addEventListener('open', () => console.debug('[balance.js] ws open'));
      ws.addEventListener('close', () => console.debug('[balance.js] ws closed'));
      ws.addEventListener('error', (e) => console.error('[balance.js] ws error', e));
      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg?.type === 'balance_update') {
            const currentUid = window.__USER_UID || localStorage.getItem('userId') || null;
            if (!msg.user_uid || !currentUid || msg.user_uid === currentUid) {
              if (typeof msg.balance !== 'undefined') window.userBalance = Number(msg.balance);
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

  // ----------------------
  // Public API
  // ----------------------
  window.syncBalance = window.syncBalance || fetchBalanceFromServer;
  window.createVirtualAccount = window.createVirtualAccount || createVirtualAccount;
  window.initBalanceWebSocket = window.initBalanceWebSocket || initBalanceWebSocket;

  // ----------------------
  // Init
  // ----------------------
  (function init() {
    updateBalanceDisplay();      // show local/0 quickly
    fetchBalanceFromServer();    // fetch authoritative balance
    initBalanceWebSocket();      // open WS
  })();

})();
