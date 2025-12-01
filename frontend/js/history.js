/* transaction-history.js
   Production-ready JS for transaction history modal.
   Usage:
     - Include this script after your HTML/CSS.
     - Optionally set window.TRANSACTIONS_API = '/api/transactions' (default path used below).
     - Optionally set window.APP_TOKEN = 'Bearer ...' for authenticated requests.
*/

(() => {
  'use strict';

  /* -------------------------- CONFIG -------------------------- */
  const CONFIG = {
    apiEndpoint: 'https://api.flexgig.com.ng', // backend endpoint
    pageSize: 30,                 // items to request per page
    chunkRenderSize: 12,          // items to render per animation chunk for smoothness
    useBackend: true,             // set false for TEST_MODE local data
    authHeader: () => window.APP_TOKEN ? { Authorization: window.APP_TOKEN } : {},
    dateLocale: 'en-GB',          // use this for month/year formatting
    currencySymbol: '₦',
    maxCachedPages: 10
  };

  /* -------------------------- DOM -------------------------- */
  const modal = document.getElementById('historyModal');
  const panel = modal.querySelector('.opay-panel');
  const backdrop = modal.querySelector('.opay-backdrop');
  const closeButtons = modal.querySelectorAll('[data-close]');
  const historyList = document.getElementById('historyList');
  const loadingEl = document.getElementById('historyLoading');
  const emptyEl = document.getElementById('historyEmpty');
  const errorEl = document.getElementById('historyError');
  const downloadBtn = document.getElementById('downloadHistory');
  const monthSelector = modal.querySelector('.opay-month-selector span');
  const inEl = modal.querySelector('.opay-in strong');
  const outEl = modal.querySelector('.opay-out strong');

  /* -------------------------- STATE -------------------------- */
  let state = {
    open: false,
    page: 1,
    isLoading: false,
    done: false,
    items: [],          // all loaded items
    grouped: [],        // grouped by day/month for rendering
    sort: { by: 'time', dir: 'desc' },
    filters: {},
    searchTerm: '',
    lastRenderIndex: 0, // for chunked rendering
    cachePages: new Map()
  };

  /* -------------------------- UTIL -------------------------- */

  function formatCurrency(amount) {
    // Always format to two decimals and include thousands separators
    try {
      const n = Number(amount) || 0;
      return CONFIG.currencySymbol + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (e) {
      return CONFIG.currencySymbol + amount;
    }
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(CONFIG.dateLocale, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
    } catch (e) {
      return iso;
    }
  }

  function groupTransactions(items) {
    // Group by day (YYYY-MM-DD) so UI displays day headings
    const map = new Map();
    for (const tx of items) {
      const day = new Date(tx.time).toISOString().slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(tx);
    }
    // Convert to array sorted by date desc
    const arr = Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    return arr.map(([day, txs]) => ({
      day,
      prettyDay: new Date(day).toLocaleDateString(CONFIG.dateLocale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
      txs
    }));
  }

  function setState(newState) {
    Object.assign(state, newState);
  }

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function safeFetch(url, opts = {}) {
    const headers = Object.assign({}, opts.headers || {}, CONFIG.authHeader());
    const o = Object.assign({}, opts, { headers });
    return fetch(url, o).then(res => {
      if (!res.ok) {
        const err = new Error('Network response was not ok');
        err.status = res.status;
        throw err;
      }
      return res.json();
    });
  }

  /* -------------------------- RENDER -------------------------- */

  function makeTxNode(tx) {
    // tx expected shape: { id, type: 'credit'|'debit'|'transfer'|'fee'|'interest', amount, description, time, status, target }
    const item = document.createElement('div');
    item.className = 'tx-item';
    item.dataset.id = tx.id;

    const icon = document.createElement('div');
    icon.className = 'tx-icon ' + (tx.type === 'credit' ? 'incoming' : (tx.type === 'debit' ? 'outgoing' : 'targets'));
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = (tx.type === 'credit' ? '+' : (tx.type === 'debit' ? '−' : '⇄'));

    const content = document.createElement('div');
    content.className = 'tx-content';

    const desc = document.createElement('div');
    desc.className = 'tx-desc';
    desc.title = tx.description || '';
    desc.textContent = tx.description || (tx.type + ' transaction');

    const time = document.createElement('div');
    time.className = 'tx-time';
    time.textContent = formatTime(tx.time);

    const amountWrap = document.createElement('div');
    amountWrap.style.minWidth = '120px';
    amountWrap.style.textAlign = 'right';

    const amount = document.createElement('div');
    amount.className = 'tx-amount ' + (tx.type === 'credit' ? 'credit' : 'debit');
    amount.textContent = (tx.type === 'credit' ? '+' : '−') + ' ' + formatCurrency(Math.abs(Number(tx.amount) || 0));

    amountWrap.appendChild(amount);

    content.appendChild(desc);
    content.appendChild(time);

    // optional status badge
    if (tx.status) {
      const status = document.createElement('div');
      status.className = 'tx-status';
      status.textContent = tx.status.toUpperCase();
      content.appendChild(status);
    }

    item.appendChild(icon);
    item.appendChild(content);
    item.appendChild(amountWrap);

    // interaction: click to copy JSON or open details
    item.addEventListener('click', (e) => {
      // open small details popover (simple: use alert in production replace with nicer UI)
      const details = {
        id: tx.id,
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        time: tx.time,
        status: tx.status,
        target: tx.target || null
      };
      // copy to clipboard on long-press or ctrl+click; on normal click open detail overlay (left as integration point)
      if (e.ctrlKey || e.metaKey) {
        navigator.clipboard?.writeText(JSON.stringify(details, null, 2)).then(() => {
          // small unobtrusive toast? using console for now
          console.log('Transaction details copied to clipboard');
        }).catch(() => {});
      } else {
        // simple modal fallback: you can replace with your details drawer
        alert(`Transaction\n\n${JSON.stringify(details, null, 2)}`);
      }
    });

    return item;
  }

  function renderChunked(grouped) {
    // Clear existing and render in chunks (non-blocking)
    historyList.innerHTML = '';
    state.lastRenderIndex = 0;

    // Build a flattened array with section markers for rendering order: {type:'section',...} or {type:'tx', tx:...}
    const flat = [];
    for (const group of grouped) {
      flat.push({ type: 'section', day: group.prettyDay });
      for (const tx of group.txs) flat.push({ type: 'tx', tx });
    }
    state.flatList = flat;

    function renderNextChunk() {
      const start = state.lastRenderIndex;
      const end = Math.min(flat.length, start + CONFIG.chunkRenderSize);
      for (let i = start; i < end; i++) {
        const nodeData = flat[i];
        if (nodeData.type === 'section') {
          const hd = document.createElement('div');
          hd.style.padding = '8px 16px';
          hd.style.fontSize = '13px';
          hd.style.fontWeight = '700';
          hd.style.color = '#aaa';
          hd.textContent = nodeData.day;
          historyList.appendChild(hd);
        } else {
          historyList.appendChild(makeTxNode(nodeData.tx));
        }
      }
      state.lastRenderIndex = end;
      if (end < flat.length) {
        // schedule next chunk
        requestAnimationFrame(renderNextChunk);
      }
    }

    renderNextChunk();
  }

  function computeSummary(items) {
    let totalIn = 0, totalOut = 0;
    for (const tx of items) {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'credit') totalIn += amt;
      else totalOut += Math.abs(amt);
    }
    inEl.textContent = formatCurrency(totalIn);
    outEl.textContent = formatCurrency(totalOut);
  }

  function showStateUI() {
    hide(loadingEl); hide(emptyEl); hide(errorEl);
    if (state.isLoading) show(loadingEl);
    else if (state.items.length === 0) show(emptyEl);
  }

  /* -------------------------- DATA -------------------------- */

  async function fetchPage(page = 1) {
    if (state.cachePages.has(page)) {
      return state.cachePages.get(page);
    }

    if (!CONFIG.useBackend) {
      // TEST MODE fallback (local synthetic data)
      const synthetic = [];
      for (let i = 0; i < CONFIG.pageSize; i++) {
        const id = `local-${page}-${i}`;
        const when = new Date(Date.now() - ((page - 1) * CONFIG.pageSize + i) * 60 * 60 * 1000).toISOString();
        synthetic.push({
          id,
          type: (i % 3 === 0 ? 'credit' : 'debit'),
          amount: (Math.random() * 20000).toFixed(2),
          description: (i % 3 === 0 ? 'Salary/payment' : 'Purchase/transfer'),
          time: when,
          status: (i % 4 === 0 ? 'pending' : 'successful'),
          target: i % 2 === 0 ? 'Merchant A' : 'Wallet B'
        });
      }
      const pageObj = { items: synthetic, page, totalPages: 10 };
      state.cachePages.set(page, pageObj);
      return Promise.resolve(pageObj);
    }

    const url = new URL(CONFIG.apiEndpoint, window.location.origin);
    url.searchParams.set('page', page);
    url.searchParams.set('limit', CONFIG.pageSize);

    try {
      const json = await safeFetch(url.href, { method: 'GET' });
      // Expect backend to return { items: [...], page, totalPages } or similar
      const pageObj = {
        items: Array.isArray(json.items) ? json.items : (Array.isArray(json) ? json : []),
        page: json.page || page,
        totalPages: json.totalPages || (json.total_pages || null)
      };
      // cache page
      state.cachePages.set(page, pageObj);
      // keep cache map small
      if (state.cachePages.size > CONFIG.maxCachedPages) {
        const firstKey = state.cachePages.keys().next().value;
        state.cachePages.delete(firstKey);
      }
      return pageObj;
    } catch (err) {
      throw err;
    }
  }

  async function loadMore() {
    if (state.isLoading || state.done) return;
    state.isLoading = true;
    showStateUI();

    try {
      const pageObj = await fetchPage(state.page);
      const newItems = pageObj.items || [];
      if (newItems.length === 0 || (pageObj.totalPages && state.page >= pageObj.totalPages)) {
        state.done = true;
      }
      state.items = state.items.concat(newItems);
      state.page += 1;
      // after fetch, perform sorting/filtering/search in-memory
      applyTransformsAndRender();
    } catch (err) {
      console.error('Failed to fetch transactions', err);
      show(errorEl);
    } finally {
      state.isLoading = false;
      showStateUI();
    }
  }

  function applyTransformsAndRender() {
    // apply search, filters, sort
    let items = state.items.slice();

    if (state.searchTerm) {
      const s = state.searchTerm.toLowerCase();
      items = items.filter(tx => (tx.description || '').toLowerCase().includes(s) || (tx.id || '').toLowerCase().includes(s) || (tx.target || '').toLowerCase().includes(s));
    }

    // TODO: apply other filters (status, category) if UI expands

    // sort
    items.sort((a, b) => {
      const dir = state.sort.dir === 'asc' ? 1 : -1;
      if (state.sort.by === 'amount') {
        return dir * (Number(a.amount || 0) - Number(b.amount || 0));
      }
      // default: time
      return dir * (new Date(a.time).getTime() - new Date(b.time).getTime());
    });

    const grouped = groupTransactions(items);
    setState({ grouped });
    renderChunked(grouped);

    // update summary
    computeSummary(items);

    // states
    if (items.length === 0) show(emptyEl); else hide(emptyEl);
  }

  /* -------------------------- EVENTS -------------------------- */

  // open modal API
  function openModal() {
    modal.classList.add('open');
    modal.classList.remove('hidden');
    modal.style.pointerEvents = 'auto';
    setState({ open: true });
    // reset if first open
    if (state.items.length === 0) {
      state.page = 1;
      state.done = false;
      state.items = [];
      state.cachePages.clear();
      loadMore();
    } else {
      applyTransformsAndRender();
    }
    trapFocus();
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.classList.add('hidden');
    modal.style.pointerEvents = 'none';
    setState({ open: false });
    releaseFocusTrap();
  }

  closeButtons.forEach(btn => btn.addEventListener('click', closeModal));
  backdrop.addEventListener('click', closeModal);

  // keyboard handling
  function handleKey(e) {
    if (!state.open) return;
    if (e.key === 'Escape') closeModal();
    // arrow keys for scrolling
    if (e.key === 'ArrowDown') historyList.scrollBy({ top: 120, behavior: 'smooth' });
    if (e.key === 'ArrowUp') historyList.scrollBy({ top: -120, behavior: 'smooth' });
  }
  document.addEventListener('keydown', handleKey);

  // infinite scroll
  historyList.addEventListener('scroll', () => {
    const scrollBottom = historyList.scrollTop + historyList.clientHeight;
    const threshold = historyList.scrollHeight - 300;
    if (scrollBottom >= threshold && !state.isLoading && !state.done) {
      loadMore();
    }
  }, { passive: true });

  // Download button - CSV & JSON dropdown fallback
  downloadBtn.addEventListener('click', async (e) => {
    // simple menu: ask which format (prompt for simplicity). Replace with custom dropdown in production.
    const fmt = prompt('Download format: "csv" or "json"', 'csv');
    if (!fmt) return;
    if (fmt.toLowerCase() === 'json') {
      const blob = new Blob([JSON.stringify(state.items, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `transactions-${Date.now()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } else {
      // build CSV
      const cols = ['id', 'time', 'description', 'type', 'amount', 'status', 'target'];
      const rows = [cols.join(',')].concat(state.items.map(tx => cols.map(c => {
        const v = tx[c] === undefined || tx[c] === null ? '' : String(tx[c]).replace(/"/g, '""');
        return `"${v}"`;
      }).join(',')));
      const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `transactions-${Date.now()}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    }
  });

  // search - not in your HTML yet, but easy to wire if you add an input with id 'historySearch'
  const searchInput = document.getElementById('historySearch');
  if (searchInput) {
    let t;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.searchTerm = e.target.value.trim();
        applyTransformsAndRender();
      }, 250);
    });
  }

  /* -------------------------- FOCUS TRAP -------------------------- */
  let previouslyFocused = null;
  function trapFocus() {
    previouslyFocused = document.activeElement;
    // find focusable elements in panel
    const focusables = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (first) first.focus();

    function keyListener(e) {
      if (e.key !== 'Tab') return;
      if (!first) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    panel.__focusTrap = keyListener;
    panel.addEventListener('keydown', keyListener);
  }
  function releaseFocusTrap() {
    if (panel && panel.__focusTrap) {
      panel.removeEventListener('keydown', panel.__focusTrap);
      delete panel.__focusTrap;
    }
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
  }

  /* -------------------------- TOUCH SWIPE TO DISMISS (mobile friendly) -------------------------- */
  (function addSwipeToClose(el) {
    let startY = 0, currentY = 0, touching = false;
    el.addEventListener('touchstart', (ev) => {
      if (!state.open) return;
      touching = true;
      startY = ev.touches[0].clientY;
      el.style.transition = '';
    }, { passive: true });
    el.addEventListener('touchmove', (ev) => {
      if (!touching) return;
      currentY = ev.touches[0].clientY - startY;
      if (currentY > 0) el.style.transform = `translateY(${currentY}px)`;
    }, { passive: true });
    el.addEventListener('touchend', (ev) => {
      touching = false;
      el.style.transition = 'transform 200ms ease';
      if (currentY > 120) {
        el.style.transform = `translateY(100vh)`;
        setTimeout(closeModal, 180);
      } else {
        el.style.transform = '';
      }
      startY = currentY = 0;
    }, { passive: true });
  })(panel);

  /* -------------------------- INIT / EXPOSE -------------------------- */

  // Public API to open modal with optional options
  window.TransactionHistory = {
    open: openModal,
    close: closeModal,
    reload: () => {
      state.page = 1; state.items = []; state.done = false; state.cachePages.clear();
      loadMore();
    },
    setApi: (url) => { CONFIG.apiEndpoint = url; },
    setAuthToken: (token) => { window.APP_TOKEN = token; },
    setUseBackend: (v) => { CONFIG.useBackend = !!v; },
    addItems: (items) => { // manually add items (useful for initial hydration)
      state.items = state.items.concat(items);
      applyTransformsAndRender();
    },
    getAll: () => state.items.slice()
  };

  // auto-wires to any element with data-open-history attribute
  document.addEventListener('click', (e) => {
    const target = e.target.closest && e.target.closest('[data-open-history]');
    if (target) {
      openModal();
    }
  });

  // initial render for TEST_MODE
  const TEST_MODE = !CONFIG.useBackend;
  if (TEST_MODE) {
    // allow immediate testing by calling open
    console.info('TransactionHistory: running in TEST_MODE (no backend). Call TransactionHistory.open() to view.');
  }

  // ensure state UI initially reflects empty
  showStateUI();

  // Expose small helper to format server response (if backend returns different keys) — replace as needed
  window.TransactionHistory.normalizeBackendTx = function(raw) {
    // default normalization; adapt to your backend fields
    return {
      id: raw.id || raw.tx_id || raw.reference,
      type: (raw.type || raw.direction || '').toLowerCase() === 'in' ? 'credit' : (raw.type || raw.direction || '').toLowerCase() === 'out' ? 'debit' : (raw.type || raw.direction || 'transfer'),
      amount: (raw.amount !== undefined ? raw.amount : raw.value) || 0,
      description: raw.description || raw.narration || raw.notes || '',
      time: raw.time || raw.timestamp || raw.created_at || new Date().toISOString(),
      status: raw.status || raw.state || 'successful',
      target: raw.target || raw.counterparty || ''
    };
  };

  // Listen for real-time transaction updates (from balance_update or dedicated event)
document.addEventListener('transaction_update', async (e) => {
  const modal = document.getElementById('historyModal');
  if (!modal || !modal.classList.contains('open')) return; // only refresh if modal is open

  console.log('New transaction detected → refreshing history');
  await loadHistory(true); // true = full refresh from page 1
});

  // recommended minimal backend response shape:
  // GET /api/transactions?page=1&limit=30
  // returns {
  //   items: [ { id, type, amount, description, time, status, target }, ... ],
  //   page: 1,
  //   totalPages: 12
  // }

})();
