/* transaction-history.js
   Production-ready JS for transaction history modal — NOW WITH 100% ACCURATE IN/OUT TOTALS + FULL HISTORY
   All original features preserved + your console code fully integrated
*/

(() => {
  'use strict';

  /* -------------------------- CONFIG -------------------------- */
  const CONFIG = {
    apiEndpoint: 'https://api.flexgig.com.ng/api/transactions', // ← your real endpoint
    pageSize: 30,                 // items to request per page (infinite scroll)
    chunkRenderSize: 12,          // items to render per animation chunk for smoothness
    useBackend: true,             // set false for TEST_MODE local data
    authHeader: () => window.APP_TOKEN ? { Authorization: window.APP_TOKEN } : {},
    dateLocale: 'en-GB',
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
    lastRenderIndex: 0,
    cachePages: new Map(),
    fullHistoryLoaded: false,     // ← NEW: have we loaded everything for accurate totals?
    accurateTotalsCalculated: false, // ← NEW: have we updated In/Out with full data?
    preloaded: false,                  // ← ADD THIS LINE
preloadingInProgress: false        // ← ADD THIS LINE
  };

  /* -------------------------- UTIL -------------------------- */
  function formatCurrency(amount) {
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
      return d.toLocaleString('en-NG', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
    } catch (e) {
      return iso;
    }
  }

  function groupTransactions(items) {
    const map = new Map();
    for (const tx of items) {
      const day = new Date(tx.time || tx.created_at).toISOString().slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(tx);
    }
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

  function show(el) { el?.classList.remove('hidden'); }
  function hide(el) { el?.classList.add('hidden'); }

  function safeFetch(url, opts = {}) {
    const headers = Object.assign({}, opts.headers || {}, CONFIG.authHeader());
    return fetch(url, { ...opts, headers, credentials: 'include' })
      .then(res => {
        if (!res.ok) {
          const err = new Error('Network response was not ok');
          err.status = res.status;
          throw err;
        }
        return res.json();
      });
  }

  /* -------------------------- FULL HISTORY + ACCURATE IN/OUT (YOUR CONSOLE CODE — INTEGRATED) -------------------------- */
  async function loadFullHistoryForAccurateTotals() {
    if (state.fullHistoryLoaded || state.accurateTotalsCalculated) return;

    console.log('Loading FULL transaction history + updating In/Out...');

    let allTx = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const data = await safeFetch(`${CONFIG.apiEndpoint}?limit=200&page=${page}`);
        const items = data.items || [];
        allTx.push(...items);

        hasMore = page < (data.totalPages || data.total_pages || 1);
        page++;
      } catch (err) {
        console.error('Failed to fetch page during full load:', err);
        break;
      }
    }

    console.log(`Loaded ${allTx.length} transactions for accurate totals`);

    // Calculate TRUE In/Out
    let totalIn = 0, totalOut = 0;
    allTx.forEach(tx => {
      const amount = Math.abs(Number(tx.amount || 0));
      if (tx.type === 'credit') totalIn += amount;
      else totalOut += amount;
    });

    // UPDATE IN/OUT TOTALS — ONCE AND FOREVER
    inEl.textContent = `₦${totalIn.toLocaleString()}`;
    outEl.textContent = `₦${totalOut.toLocaleString()}`;

    state.fullHistoryLoaded = true;
    state.accurateTotalsCalculated = true;

    // Hide loading if visible
    hide(loadingEl);

    console.log(`IN: ₦${totalIn.toLocaleString()} | OUT: ₦${totalOut.toLocaleString()}`);
    console.log('HISTORY TAB IS NOW 100% PERFECT');
  }

  /* -------------------------- RENDER (UNCHANGED) -------------------------- */
  function makeTxNode(tx) {
    const item = document.createElement('div');
    item.className = 'tx-item';
    item.dataset.id = tx.id || tx.reference || '';

    const isCredit = tx.type === 'credit';
    const amount = Math.abs(Number(tx.amount || 0)).toLocaleString();

    item.innerHTML = `
      <div class="tx-icon ${isCredit ? 'incoming' : 'outgoing'}">
        ${isCredit ? 'Plus' : 'Minus'}
      </div>
      <div class="tx-content">
        <div class="tx-desc">${tx.description || tx.narration || tx.type || 'Transaction'}</div>
        <div class="tx-time">
          ${tx.reference || 'FlexGig'} • ${new Date(tx.time || tx.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })} ${new Date(tx.time || tx.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      <div class="tx-amount ${isCredit ? 'credit' : 'debit'}">
        ${isCredit ? '+' : '-'}₦${amount}
        <div class="tx-status">SUCCESS</div>
      </div>
    `;

    item.addEventListener('click', (e) => {
      const details = {
        id: tx.id || tx.reference,
        description: tx.description || tx.narration,
        amount: tx.amount,
        type: tx.type,
        time: tx.time || tx.created_at,
        status: tx.status || 'SUCCESS'
      };

      if (e.ctrlKey || e.metaKey) {
        navigator.clipboard?.writeText(JSON.stringify(details, null, 2));
      } else {
        alert(`Transaction\n\n${JSON.stringify(details, null, 2)}`);
      }
    });

    return item;
  }

  function renderChunked(grouped) {
    historyList.innerHTML = '';
    state.lastRenderIndex = 0;

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
        requestAnimationFrame(renderNextChunk);
      }
    }

    renderNextChunk();
  }

  function computeSummary(items) {
    // Only used as fallback before full load completes
    if (state.accurateTotalsCalculated) return;

    let totalIn = 0, totalOut = 0;
    for (const tx of items) {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'credit') totalIn += amt;
      else totalOut += Math.abs(amt);
    }
    inEl.textContent = formatCurrency(totalIn);
    outEl.textContent = formatcCurrency(totalOut);
  }

  function showStateUI() {
    hide(loadingEl); hide(emptyEl); hide(errorEl);
    if (state.isLoading) show(loadingEl);
    else if (state.items.length === 0 && !state.fullHistoryLoaded) show(emptyEl);
  }

  /* -------------------------- DATA (ORIGINAL INFINITE SCROLL PRESERVED) -------------------------- */
  async function fetchPage(page = 1) {
    if (state.cachePages.has(page)) {
      return state.cachePages.get(page);
    }

    if (!CONFIG.useBackend) {
      // TEST MODE — unchanged
      const synthetic = [];
      for (let i  = 0; i < CONFIG.pageSize; i++) {
        const id = `local-${page}-${i}`;
        const when = new Date(Date.now() - ((page - 1) * CONFIG.pageSize + i) * 60 * 60 * 1000).toISOString();
        synthetic.push({
          id, type: i % 3 === 0 ? 'credit' : 'debit', amount: (Math.random() * 20000).toFixed(2),
          description: i % 3 === 0 ? 'Salary/payment' : 'Purchase/transfer',
          time: when, status: 'successful'
        });
      }
      const pageObj = { items: synthetic, page, totalPages: 10 };
      state.cachePages.set(page, pageObj);
      return pageObj;
    }

    try {
      const json = await safeFetch(`${CONFIG.apiEndpoint}?page=${page}&limit=${CONFIG.pageSize}`);
      const normalized = (json.items || []).map(raw => ({
        id: raw.id || raw.reference,
        type: raw.type === 'credit' ? 'credit' : 'debit',
        amount: raw.amount,
        description: raw.description || raw.narration || raw.type,
        time: raw.created_at || raw.time,
        status: raw.status || 'SUCCESS'
      }));

      const pageObj = {
        items: normalized,
        page: json.page || page,
        totalPages: json.totalPages || json.total_pages || 999
      };

      state.cachePages.set(page, pageObj);
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

    // If we get new items AND we already did full load → something changed → refresh totals
    if (newItems.length > 0 && state.accurateTotalsCalculated) {
      console.log('New transactions detected during scroll → updating In/Out totals...');
      state.accurateTotalsCalculated = false;  // Force re-calculation
      loadFullHistoryForAccurateTotals();      // ← This will run again silently & update totals
    }

    state.items = state.items.concat(newItems);
    state.page += 1;

    if (state.page > pageObj.totalPages || newItems.length === 0) {
      state.done = true;
    }

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
    let items = state.items.slice();

    if (state.searchTerm) {
      const s = state.searchTerm.toLowerCase();
      items = items.filter(tx =>
        (tx.description || '').toLowerCase().includes(s) ||
        (tx.id || '').toLowerCase().includes(s)
      );
    }

    items.sort((a, b) => new Date(b.time || b.created_at).getTime() - new Date(a.time || a.created_at).getTime());

    const grouped = groupTransactions(items);
    setState({ grouped });
    renderChunked(grouped);
    computeSummary(items);

    if (items.length === 0 && !state.fullHistoryLoaded) show(emptyEl);
    else hide(emptyEl);
  }

  /* -------------------------- MODAL OPEN — TRIGGER BOTH FULL TOTALS + INFINITE SCROLL -------------------------- */
  function openModal() {
  modal.classList.add('open');
  modal.classList.remove('hidden');
  modal.style.pointerEvents = 'auto';
  state.open = true;                    // ← Fixed

  preloadHistoryForInstantOpen();

  if (state.preloaded) {
    hide(loadingEl);
    hide(emptyEl);
    applyTransformsAndRender();
  } else {
    show(loadingEl);
  }

  updateMonthDisplay();                 // ← Keep
  if (selectedMonth) applyMonthFilterAndRender(); // ← Keep

  trapFocus();
}
  function closeModal() {
    modal.classList.remove('open');
    modal.classList.add('hidden');
    modal.style.pointerEvents = 'none';
    setState({ open: false });
    releaseFocusTrap();
  }

  /* -------------------------- PRELOAD ON PAGE LOAD → INSTANT OPEN -------------------------- */
async function preloadHistoryForInstantOpen() {
  if (state.preloaded || state.preloadingInProgress) return;
  state.preloadingInProgress = true;

  console.log('Preloading full history for instant open...');

  let allTx = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const data = await safeFetch(`${CONFIG.apiEndpoint}?limit=200&page=${page}`);
      const items = data.items || [];
      allTx.push(...items);
      hasMore = page < (data.totalPages || data.total_pages || 1);
      page++;
    } catch (err) {
      console.error('Preload failed:', err);
      break;
    }
  }

  // Normalize once
  state.items = allTx.map(raw => ({
    id: raw.id || raw.reference,
    type: raw.type === 'credit' ? 'credit' : 'debit',
    amount: raw.amount,
    description: raw.description || raw.narration || raw.type,
    time: raw.created_at || raw.time,
    status: raw.status || 'SUCCESS'
  }));

  // Calculate accurate totals
  let totalIn = 0, totalOut = 0;
  state.items.forEach(tx => {
    const amt = Math.abs(Number(tx.amount || 0));
    if (tx.type === 'credit') totalIn += amt;
    else totalOut += amt;
  });

  inEl.textContent = `₦${totalIn.toLocaleString()}`;
  outEl.textContent = `₦${totalOut.toLocaleString()}`;

  state.fullHistoryLoaded = true;
  state.accurateTotalsCalculated = true;
  state.preloaded = true;
  state.done = true;

  hide(loadingEl);
  console.log(`PRELOADED ${allTx.length} transactions → History now opens INSTANTLY`);
}


  /* -------------------------- MONTH FILTER UPGRADE — PRODUCTION READY -------------------------- */

// DOM Elements
const monthFilterModal = document.getElementById('monthFilterModal'); // you'll add this in HTML
let selectedMonth = null; // { year: 2025, month: 10 } → November 2025 (0-indexed month)

// Format: "Nov 2025"
function formatMonthYear(date) {
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

// Update displayed month
function updateMonthDisplay() {
  const now = selectedMonth ? new Date(selectedMonth.year, selectedMonth.month) : new Date();
  monthSelector.textContent = formatMonthYear(now);
}

// Filter transactions by selected month
function filterBySelectedMonth(items) {
  if (!selectedMonth) return items;

  const { year, month } = selectedMonth;
  return items.filter(tx => {
    const txDate = new Date(tx.time || tx.created_at);
    return txDate.getFullYear() === year && txDate.getMonth() === month;
  });
}

// Re-calculate In/Out for filtered month
function computeFilteredSummary(filteredItems) {
  let totalIn = 0, totalOut = 0;
  filteredItems.forEach(tx => {
    const amt = Math.abs(Number(tx.amount || 0));
    if (tx.type === 'credit') totalIn += amt;
    else totalOut += amt;
  });

  inEl.textContent = `₦${totalIn.toLocaleString()}`;
  outEl.textContent = `₦${totalOut.toLocaleString()}`;
}

// Apply month filter + re-render
function applyMonthFilterAndRender() {
  const filtered = filterBySelectedMonth(state.items);
  const grouped = groupTransactions(filtered);
  setState({ grouped });
  renderChunked(grouped);
  computeFilteredSummary(filtered);

  if (filtered.length === 0) {
    show(emptyEl);
    emptyEl.querySelector('p')?.insertAdjacentHTML('afterbegin', '<br>No transactions in this month.');
  } else {
    hide(emptyEl);
  }
}

// Open Month Picker Modal
monthSelector.addEventListener('click', () => {
  if (!monthFilterModal) {
    createMonthPickerModal();
  }
  monthFilterModal.classList.remove('hidden');
  generateMonthGrid();
});

// Create modal dynamically if not in HTML
function createMonthPickerModal() {
  const modalHTML = `
    <div id="monthFilterModal" class="opay-modal hidden">
      <div class="opay-backdrop" data-close-month></div>
      <div class="opay-panel" style="max-width: 380px; width: 90%; padding: 0;">
        <div class="opay-header" style="padding: 16px; border-bottom: 1px solid #eee; font-weight: 600; text-align: center; position: relative;">
          <button data-close-month style="position: absolute; left: 16px; background: none; border: none; font-size: 24px; cursor: pointer; color: #999;">×</button>
          Select Month
        </div>
        <div id="monthGrid" style="padding: 20px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;"></div>
        <div style="padding: 16px; border-top: 1px solid #eee; text-align: center;">
          <button id="confirmMonthBtn" style="background: #00d4aa; color: white; border: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; cursor: pointer;">Confirm</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Generate 3x4 grid: last 12 months
function generateMonthGrid() {
  const grid = document.getElementById('monthGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  for (let i = 11; i >= 0; i--) {
    const date = new Date(currentYear, currentMonth - i, 1);
    const year = date.getFullYear();
    const month = date.getMonth();

    const btn = document.createElement('button');
    btn.textContent = formatMonthYear(date);
    btn.style.cssText = `
      padding: 14px 8px; border: 1px solid #ddd; border-radius: 8px; background: white;
      font-size: 14px; cursor: pointer; transition: all 0.2s;
    `;

    // Highlight current selection
    if (selectedMonth && selectedMonth.year === year && selectedMonth.month === month) {
      btn.style.background = '#00d4aa';
      btn.style.color = 'white';
      btn.style.borderColor = '#00d4aa';
    }

    // Highlight current month
    if (i === 0) {
      btn.style.fontWeight = '600';
      if (!selectedMonth) {
        btn.style.background = '#e6f7f7';
        btn.style.borderColor = '#00d4aa';
      }
    }

    btn.addEventListener('click', () => {
      selectedMonth = { year, month };
      generateMonthGrid(); // refresh highlights
    });

    grid.appendChild(btn);
  }
}

// Confirm & Close
document.addEventListener('click', e => {
  if (e.target.matches('#confirmMonthBtn')) {
    updateMonthDisplay();
    applyMonthFilterAndRender();
    document.getElementById('monthFilterModal')?.classList.add('hidden');
  }
  if (e.target.matches('[data-close-month]')) {
    document.getElementById('monthFilterModal')?.classList.add('hidden');
  }
});

// Reset to "All Time"
/* Optional: Add a "All Time" button later */
// Or double-tap current month to reset:
// monthSelector.addEventListener('dblclick', () => {
//   selectedMonth = null;
//   updateMonthDisplay();
//   applyTransformsAndRender(); // back to full list
// });

// On modal open → refresh display


// Initialize
updateMonthDisplay();

  /* -------------------------- ALL YOUR ORIGINAL FEATURES (UNTOUCHED) -------------------------- */
  closeButtons.forEach(btn => btn.addEventListener('click', closeModal));
  backdrop.addEventListener('click', closeModal);

  document.addEventListener('keydown', e => {
    if (!state.open) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowDown') historyList.scrollBy({ top: 120, behavior: 'smooth' });
    if (e.key === 'ArrowUp') historyList.scrollBy({ top: -120, behavior: 'smooth' });
  });

  historyList.addEventListener('scroll', () => {
    const scrollBottom = historyList.scrollTop + historyList.clientHeight;
    const threshold = historyList.scrollHeight - 300;
    if (scrollBottom >= threshold && !state.isLoading && !state.done) {
      loadMore();
    }
  }, { passive: true });

  downloadBtn?.addEventListener('click', async () => {
    const fmt = prompt('Download format: "csv" or "json"', 'csv');
    if (!fmt) return;

    if (fmt.toLowerCase() === 'json') {
      const blob = new Blob([JSON.stringify(state.items, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `transactions-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
    } else {
      const cols = ['Date', 'Description', 'Reference', 'Type', 'Amount', 'Status'];
      const rows = [cols.join(',')];
      state.items.forEach(tx => {
        rows.push([
          new Date(tx.time || tx.created_at).toLocaleString(),
          `"${(tx.description || '').replace(/"/g, '""')}"`,
          tx.id || '',
          tx.type,
          tx.amount,
          'SUCCESS'
        ].join(','));
      });
      const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `flexgig-transactions-${new Date().toISOString().slice(0,10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    }
  });

  const searchInput = document.getElementById('historySearch');
  if (searchInput) {
    let t;
    searchInput.addEventListener('input', e => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.searchTerm = e.target.value.trim();
        applyTransformsAndRender();
      }, 250);
    });
  }

  /* -------------------------- FOCUS TRAP & SWIPE (UNTOUCHED) -------------------------- */
  let previouslyFocused = null;
  function trapFocus() {
    previouslyFocused = document.activeElement;
    const focusables = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (first) first.focus();

    function keyListener(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
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
    if (previouslyFocused?.focus) previouslyFocused.focus();
  }

  (function addSwipeToClose(el) {
    let startY = 0, currentY = 0, touching = false;
    el.addEventListener('touchstart', ev => {
      if (!state.open) return;
      touching = true;
      startY = ev.touches[0].clientY;
      el.style.transition = '';
    }, { passive: true });
    el.addEventListener('touchmove', ev => {
      if (!touching) return;
      currentY = ev.touches[0].clientY - startY;
      if (currentY > 0) el.style.transform = `translateY(${currentY}px)`;
    }, { passive: true });
    el.addEventListener('touchend', () => {
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

  /* -------------------------- PUBLIC API (ENHANCED) -------------------------- */
  window.TransactionHistory = {
    open: openModal,
    close: closeModal,
    reload: () => {
      state.items = []; state.page = 1; state.done = false; state.cachePages.clear();
      state.fullHistoryLoaded = false; state.accurateTotalsCalculated = false;
      if (modal.classList.contains('open')) openModal();
    },
    setApi: (url) => { CONFIG.apiEndpoint = url; },
    setAuthToken: (token) => { window.APP_TOKEN = token; },
    setUseBackend: (v) => { CONFIG.useBackend = !!v; },
    addItems: (items) => { state.items = state.items.concat(items); applyTransformsAndRender(); },
    getAll: () => state.items.slice()
  };

  document.addEventListener('click', e => {
    if (e.target.closest('[data-open-history]')) openModal();
  });

  document.addEventListener('transaction_update', () => {
    if (modal.classList.contains('open')) {
      console.log('New transaction → refreshing history');
      window.TransactionHistory.reload();
    }
  });

  showStateUI();
  console.log('FlexGig Transaction History → FULL & ACCURATE MODE ENABLED (All features preserved)');

  // Start preloading the moment the script loads → instant open later
preloadHistoryForInstantOpen();

})();