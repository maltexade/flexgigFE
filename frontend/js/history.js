/* transaction-history.js - INTEGRATED WITH MODAL MANAGER
   Now fully controlled by ModalManager for open/close/navigation
*/

(() => {
  'use strict';

  /* -------------------------- CONFIG -------------------------- */
  const CONFIG = {
    apiEndpoint: 'https://api.flexgig.com.ng/api/transactions',
    pageSize: 30,
    chunkRenderSize: 12,
    useBackend: true,
    authHeader: () => window.APP_TOKEN ? { Authorization: window.APP_TOKEN } : {},
    dateLocale: 'en-GB',
    currencySymbol: '₦',
    maxCachedPages: 10
  };

  /* -------------------------- DOM -------------------------- */
  const modal = document.getElementById('historyModal');
  const panel = modal?.querySelector('.opay-panel');
  const backdrop = modal?.querySelector('.opay-backdrop');
  const historyList = document.getElementById('historyList');
  const loadingEl = document.getElementById('historyLoading');
  const emptyEl = document.getElementById('historyEmpty');
  const errorEl = document.getElementById('historyError');
  const downloadBtn = document.getElementById('downloadHistory');
  const monthSelector = modal?.querySelector('.opay-month-selector span');
  const inEl = modal?.querySelector('.opay-in strong');
  const outEl = modal?.querySelector('.opay-out strong');

  if (!modal || !panel) {
    console.error('[TransactionHistory] Modal elements not found - check your HTML');
    return;
  }

  /* -------------------------- STATE -------------------------- */
  let state = {
    open: false,
    page: 1,
    isLoading: false,
    done: false,
    items: [],
    grouped: [],
    sort: { by: 'time', dir: 'desc' },
    filters: {},
    searchTerm: '',
    lastRenderIndex: 0,
    cachePages: new Map(),
    fullHistoryLoaded: false,
    accurateTotalsCalculated: false,
    preloaded: false,
    preloadingInProgress: false
  };

  /* -------------------------- MONTH FILTER STATE -------------------------- */
  let selectedMonth = null; // null = show all months

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


  function getTxIcon(tx) {
  const desc = (tx.description || tx.narration || '').toLowerCase();
  
  if (desc.includes('opay')) return { cls: 'incoming', img: '/frontend/svg/bank.svg', alt: 'Opay' };
  if (desc.includes('mtn')) return { cls: 'mtn targets', img: '/frontend/img/mtn.svg', alt: 'MTN' };
  if (desc.includes('airtel')) return { cls: 'airtel targets', img: '/frontend/svg/airtel-icon.svg', alt: 'Airtel' };
  if (desc.includes('glo')) return { cls: 'glo targets', img: '/frontend/svg/glo-icon.svg', alt: 'GLO' };
  if (desc.includes('9mobile') || desc.includes('nine-mobile')) return { cls: 'nine-mobile targets', img: '/frontend/svg/9mobile-icon.svg', alt: '9Mobile' };
  if (desc.includes('refund')) return { cls: 'refund incoming', img: '/frontend/svg/refund.svg', alt: 'Refund' };

  // default
  return { cls: tx.type === 'credit' ? 'incoming' : 'outgoing', img: '', alt: '' };
}


  function groupTransactions(items) {
    const monthMap = new Map();

    items.forEach(tx => {
      const date = new Date(tx.time || tx.created_at);
      const key = `${date.getFullYear()}-${date.getMonth()}`;

      if (!monthMap.has(key)) {
        monthMap.set(key, { txs: [], totalIn: 0, totalOut: 0 });
      }

      const group = monthMap.get(key);
      group.txs.push(tx);

      const amt = Math.abs(Number(tx.amount || 0));
      if (tx.type === 'credit') group.totalIn += amt;
      else group.totalOut += amt;
    });

    const sorted = Array.from(monthMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));

    return sorted.map(([key, data]) => {
      const [year, month] = key.split('-');
      const date = new Date(year, month);
      return {
        monthKey: key,
        prettyMonth: date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        totalIn: data.totalIn,
        totalOut: data.totalOut,
        txs: data.txs.sort((a, b) => new Date(b.time || b.created_at) - new Date(a.time || a.created_at))
      };
    });
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

    function truncateDescription(text) {
  if (!text) return '';
  
  let maxChars = 25; // default for mobile
  const width = window.innerWidth;

  if (width >= 640 && width < 1024) maxChars = 30; // tablet
  else if (width >= 1024) maxChars = 40; // desktop

  return text.length > maxChars ? text.slice(0, maxChars) + '…' : text;
}


function makeTxNode(tx) {
  console.group('%cmakeTxNode START', 'color: #0f0; font-weight: bold;');
  console.log('Raw TX Received:', tx);

  try {
    const safeTruncate = (text) => {
      if (typeof truncateDescription === 'function') return truncateDescription(text);
      const w = window.innerWidth;
      const max = w >= 1024 ? 40 : w >= 640 ? 30 : 25;
      return text && text.length > max ? text.slice(0, max) + '…' : text || '';
    };

    const formatAmountDisplay = (v) => {
      const n = Math.abs(Number(v) || 0);
      const full = '₦' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return { display: full, full };
    };

    const fmtDateTime = (iso) => {
      const d = new Date(iso || Date.now());
      const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `${dateStr} · ${timeStr}`;
    };

    const item = document.createElement('article');
    item.className = 'tx-item';
    item.dataset.txId = tx.id || tx.reference || '';
    item.setAttribute('role', 'listitem');

    const isCredit = tx.type === 'credit';
    const icon = getTxIcon(tx);

    const rawDesc = tx.description || tx.narration || tx.type || 'Transaction';
    const truncatedDesc = safeTruncate(rawDesc);
    const amountObj = formatAmountDisplay(tx.amount);
    const formattedDateTime = fmtDateTime(tx.time || tx.created_at);
    const refPart = tx.reference ? `${tx.reference} • ` : '';

    // STATUS BADGE — FINAL WORKING LOGIC
    const statusRaw = (tx.status || 'success').toString().toLowerCase();
    const statusText = (tx.status || 'success').toUpperCase();
    let statusClass = 'success';
    if (statusRaw.includes('fail') || statusRaw.includes('failed')) statusClass = 'failed';
    else if (statusRaw.includes('refund')) statusClass = 'refund';
    else if (statusRaw.includes('pending')) statusClass = 'pending';

    item.innerHTML = `
      <div class="tx-icon ${icon.cls}" aria-hidden="true">
        ${icon.img 
          ? `<div class="tx-svg"><img class="tx-img" src="${icon.img}" alt="${icon.alt}" /></div>`
          : (isCredit ? 'Down Arrow' : 'Up Arrow')
        }
      </div>
      <div class="tx-content">
        <div class="tx-row">
          <div class="tx-desc" title="${rawDesc}">${truncatedDesc}</div>
          <div class="tx-amount ${isCredit ? 'credit' : 'debit'}" title="${amountObj.full}">
            ${isCredit ? '+' : '-'} ${amountObj.display}
          </div>
        </div>
        <div class="tx-row meta">
          <div class="tx-time" title="${tx.reference || ''}">${refPart}${formattedDateTime}</div>
          <div class="tx-status" data-status="${statusClass}" title="${tx.status || 'SUCCESS'}">
            ${statusText}
          </div>
        </div>
      </div>
    `;

    item.addEventListener('click', (e) => {
      console.log('Clicked TX:', tx);
      const details = {
        id: tx.id || tx.reference,
        reference: tx.reference,
        description: rawDesc,
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

    console.groupEnd();
    return item;

  } catch (err) {
    console.error('FATAL RENDER ERROR in makeTxNode:', err, tx);
    console.groupEnd();
    const fallback = document.createElement('div');
    fallback.className = 'tx-item';
    fallback.textContent = 'Could not render transaction';
    return fallback;
  }
}

window.addEventListener('resize', () => {
  document.querySelectorAll('.tx-desc').forEach(descEl => {
    const fullText = descEl.getAttribute('title') || descEl.textContent;
    descEl.textContent = truncateDescription(fullText);
  });
});


  /* ============================================================= */
/* 2. renderChunked(groupedMonths) — FULLY FIXED + SELF-CONTAINED */
/* ============================================================= */
function renderChunked(groupedMonths) {
  historyList.innerHTML = '';
  state.lastRenderIndex = 0;

  const flat = [];
  groupedMonths.forEach(month => {
    flat.push({ type: 'month-header', month });
    month.txs.forEach(tx => flat.push({ type: 'tx', tx }));
  });

  function renderNextChunk() {
  const start = state.lastRenderIndex;
  const end = Math.min(flat.length, start + CONFIG.chunkRenderSize);
  const fragment = document.createDocumentFragment();

  for (let i = start; i < end; i++) {
    const entry = flat[i];

    if (entry.type === 'month-header') {
      // Skip month headers completely
      continue;
    } else {
      fragment.appendChild(makeTxNode(entry.tx));
    }
  }

  historyList.appendChild(fragment);
  state.lastRenderIndex = end;

  if (end < flat.length) {
    requestAnimationFrame(renderNextChunk);
  } else {
    window.trunTx?.();
  }
}

renderNextChunk();
}



  function showStateUI() {
    hide(loadingEl); hide(emptyEl); hide(errorEl);
    if (state.isLoading) show(loadingEl);
    else if (state.items.length === 0 && !state.fullHistoryLoaded) show(emptyEl);
  }

  /* -------------------------- PRELOAD ON PAGE LOAD → INSTANT OPEN -------------------------- */
  async function preloadHistoryForInstantOpen() {
    if (state.preloaded) return;
    if (state.preloadingInProgress) {
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (state.preloaded || !state.preloadingInProgress) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
    }
    
    state.preloadingInProgress = true;
    console.log('[TransactionHistory] Preloading full history for instant open...');

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
        console.error('[TransactionHistory] Preload failed:', err);
        break;
      }
    }

    state.items = allTx.map(raw => ({
      id: raw.id || raw.reference,
      type: raw.type === 'credit' ? 'credit' : 'debit',
      amount: raw.amount,
      description: raw.description || raw.narration || raw.type,
      time: raw.created_at || raw.time,
      status: raw.status || 'SUCCESS'
    }));

    let totalIn = 0, totalOut = 0;
    state.items.forEach(tx => {
      const amt = Math.abs(Number(tx.amount || 0));
      if (tx.type === 'credit') totalIn += amt;
      else totalOut += amt;
    });

    if (inEl) inEl.textContent = `₦${totalIn.toLocaleString()}`;
    if (outEl) outEl.textContent = `₦${totalOut.toLocaleString()}`;

    state.fullHistoryLoaded = true;
    state.accurateTotalsCalculated = true;
    state.preloaded = true;
    state.done = true;
    state.preloadingInProgress = false;

    hide(loadingEl);
    console.log(`[TransactionHistory] PRELOADED ${allTx.length} transactions → History now opens INSTANTLY`);
  }

  /* -------------------------- MONTH FILTER FUNCTIONS -------------------------- */
  function formatMonthYear(date) {
    return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }

  function updateMonthDisplay() {
    if (!monthSelector) return;
    if (selectedMonth) {
      const date = new Date(selectedMonth.year, selectedMonth.month);
      monthSelector.textContent = formatMonthYear(date);
    } else {
      monthSelector.textContent = 'All Time';
    }
  }

  function filterBySelectedMonth(items) {
    if (!selectedMonth) return items;

    const { year, month } = selectedMonth;
    return items.filter(tx => {
      const txDate = new Date(tx.time || tx.created_at);
      return txDate.getFullYear() === year && txDate.getMonth() === month;
    });
  }

  function computeFilteredSummary(filteredItems) {
    let totalIn = 0, totalOut = 0;
    filteredItems.forEach(tx => {
      const amt = Math.abs(Number(tx.amount || 0));
      if (tx.type === 'credit') totalIn += amt;
      else totalOut += amt;
    });

    if (inEl) inEl.textContent = `₦${totalIn.toLocaleString()}`;
    if (outEl) outEl.textContent = `₦${totalOut.toLocaleString()}`;
  }

  function applyMonthFilterAndRender() {
    if (!selectedMonth) {
      const grouped = groupTransactions(state.items);
      setState({ grouped });
      renderChunked(grouped);
      
      let totalIn = 0, totalOut = 0;
      state.items.forEach(tx => {
        const amt = Math.abs(Number(tx.amount || 0));
        if (tx.type === 'credit') totalIn += amt;
        else totalOut += amt;
      });
      if (inEl) inEl.textContent = `₦${totalIn.toLocaleString()}`;
      if (outEl) outEl.textContent = `₦${totalOut.toLocaleString()}`;
      
      hide(emptyEl);
      return;
    }

    const filtered = filterBySelectedMonth(state.items);
    const grouped = groupTransactions(filtered);
    setState({ grouped });
    renderChunked(grouped);
    computeFilteredSummary(filtered);

    if (filtered.length === 0) {
      show(emptyEl);
    } else {
      hide(emptyEl);
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

    if (selectedMonth) {
      items = filterBySelectedMonth(items);
    }

    const groupedMonths = groupTransactions(items);
    setState({ grouped: groupedMonths });
    renderChunked(groupedMonths);

    if (selectedMonth || state.searchTerm) {
      computeFilteredSummary(items);
    }

    if (items.length === 0) {
      show(emptyEl);
    } else {
      hide(emptyEl);
      hide(loadingEl);
    }
  }

  window.applyTransformsAndRender = applyTransformsAndRender;

  /* -------------------------- MONTH PICKER MODAL -------------------------- */
  function createMonthPickerModal() {
    const existing = document.getElementById('monthFilterModal');
    if (existing) existing.remove();

    const modalHTML = `
  <div id="monthFilterModal" class="opay-modal hidden" style="position: fixed; inset: 0; z-index: 10000000; display: flex; align-items: center; justify-content: center; font-family: 'Inter', sans-serif;">
  <div class="opay-backdrop" data-close-month style="position: absolute; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);"></div>
  
  <div class="opay-panel" style="position: relative; max-width: 380px; width: 90%; background: #fff; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); overflow: hidden; transform: scale(0.9); opacity: 0; transition: all 0.3s ease-in-out;">
    
    <div class="opay-header" style="padding: 18px 16px; border-bottom: 1px solid #eee; font-weight: 600; text-align: center; position: relative; color: #222; font-size: 18px;">
      <button data-close-month style="position: absolute; left: 16px; background: transparent; border: none; font-size: 24px; cursor: pointer; color: #999; transition: color 0.2s;">×</button>
      Select Month
    </div>
    
    <div id="monthGrid" style="padding: 24px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;">
      <!-- Example months -->
      <button class="month-btn">Jan</button>
      <button class="month-btn">Feb</button>
      <button class="month-btn">Mar</button>
      <button class="month-btn">Apr</button>
      <button class="month-btn">May</button>
      <button class="month-btn">Jun</button>
      <button class="month-btn">Jul</button>
      <button class="month-btn">Aug</button>
      <button class="month-btn">Sep</button>
      <button class="month-btn">Oct</button>
      <button class="month-btn">Nov</button>
      <button class="month-btn">Dec</button>
    </div>
    
    <div style="padding: 16px; border-top: 1px solid #eee; display: flex; gap: 12px; justify-content: center;">
      <button id="allTimeBtn" style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; cursor: pointer; transition: background 0.2s;">All Time</button>
      <button id="confirmMonthBtn" style="background: linear-gradient(90deg,#00d4aa,#00bfa5); color: white; border: none; padding: 12px 32px; border-radius: 10px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 10px rgba(0,212,170,0.3); transition: all 0.2s;">Confirm</button>
    </div>
  </div>
</div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

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

      if (selectedMonth && selectedMonth.year === year && selectedMonth.month === month) {
        btn.style.background = '#00d4aa';
        btn.style.color = 'white';
        btn.style.borderColor = '#00d4aa';
      }

      if (i === 0) {
        btn.style.fontWeight = '600';
        if (!selectedMonth) {
          btn.style.background = '#e6f7f7';
          btn.style.borderColor = '#00d4aa';
        }
      }

      btn.addEventListener('click', () => {
        selectedMonth = { year, month };
        generateMonthGrid();
      });

      grid.appendChild(btn);
    }
  }

  if (monthSelector) {
    monthSelector.addEventListener('click', () => {
      createMonthPickerModal();
      const modalEl = document.getElementById('monthFilterModal');
      modalEl.classList.remove('hidden');
      generateMonthGrid();

      modalEl.querySelector('#confirmMonthBtn').onclick = () => {
        updateMonthDisplay();
        applyMonthFilterAndRender();
        modalEl.classList.add('hidden');
      };

      modalEl.querySelector('#allTimeBtn').onclick = () => {
        selectedMonth = null;
        updateMonthDisplay();
        applyMonthFilterAndRender();
        modalEl.classList.add('hidden');
      };

      modalEl.querySelectorAll('[data-close-month], .opay-backdrop').forEach(el => {
        el.onclick = () => modalEl.classList.add('hidden');
      });
    });
  }

  /* -------------------------- MODAL OPEN/CLOSE (MANAGED BY MODAL MANAGER) -------------------------- */
  // Listen for Modal Manager events
  document.addEventListener('modalOpened', (e) => {
    if (e.detail === 'historyModal') {
      console.log('[TransactionHistory] Modal opened by ModalManager');
      handleModalOpened();
    }
  });

  async function handleModalOpened() {
    state.open = true;
    selectedMonth = null;
    updateMonthDisplay();
    
    // Show loading while preloading
    show(loadingEl);
    hide(emptyEl);
    
    // Wait for preload to complete
    await preloadHistoryForInstantOpen();

    // Now render the transactions
    if (state.preloaded && state.items.length > 0) {
      hide(loadingEl);
      applyTransformsAndRender();
    } else if (state.items.length === 0) {
      hide(loadingEl);
      show(emptyEl);
    }
  }

  /* -------------------------- EVENT LISTENERS -------------------------- */
  // NOTE: Close buttons are now handled by Modal Manager
  // Remove manual close button handlers to avoid conflicts

  document.addEventListener('keydown', e => {
    if (!state.open) return;
    // Let Modal Manager handle Escape key
    if (e.key === 'ArrowDown') historyList.scrollBy({ top: 120, behavior: 'smooth' });
    if (e.key === 'ArrowUp') historyList.scrollBy({ top: -120, behavior: 'smooth' });
  });

  downloadBtn?.addEventListener('click', async () => {
    const fmt = prompt('Download format: "csv" or "json"', 'csv');
    if (!fmt) return;

    if (fmt.toLowerCase() === 'json') {
      const blob = new Blob([JSON.stringify(state.items, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-${Date.now()}.json`;
      a.click();
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
      const a = document.createElement('a');
      a.href = url;
      a.download = `flexgig-transactions-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
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

  /* -------------------------- PUBLIC API -------------------------- */
  window.TransactionHistory = {
    reload: () => {
      state.items = [];
      state.page = 1;
      state.done = false;
      state.cachePages.clear();
      state.fullHistoryLoaded = false;
      state.accurateTotalsCalculated = false;
      state.preloaded = false;
      state.preloadingInProgress = false;
      if (state.open) handleModalOpened();
    },
    setApi: (url) => { CONFIG.apiEndpoint = url; },
    setAuthToken: (token) => { window.APP_TOKEN = token; },
    setUseBackend: (v) => { CONFIG.useBackend = !!v; },
    addItems: (items) => {
      state.items = state.items.concat(items);
      applyTransformsAndRender();
    },
    getAll: () => state.items.slice()
  };

  document.addEventListener('transaction_update', () => {
    if (state.open) {
      console.log('[TransactionHistory] New transaction → refreshing history');
      window.TransactionHistory.reload();
    }
  });

  showStateUI();
  updateMonthDisplay();
  console.log('[TransactionHistory] READY - Controlled by ModalManager');

  // Preload on page load
  preloadHistoryForInstantOpen();

    function trunTx() {
  const rows = document.querySelectorAll('.tx-row');

  rows.forEach(row => {
    const desc = row.querySelector('.tx-desc');
    if (!desc) return;

    // store full text
    if (!desc.dataset.fullText) {
      desc.dataset.fullText = desc.textContent;
    }

    let fullText = desc.dataset.fullText;
    let maxChars = 25; // default for small devices

    const width = window.innerWidth;

    if (width >= 640 && width < 1024) {
      maxChars = 30; // tablets
    } else if (width >= 1024) {
      maxChars = 40; // desktop
    }

    if (fullText.length > maxChars) {
      desc.textContent = fullText.slice(0, maxChars) + '…';
    } else {
      desc.textContent = fullText;
    }
  }); 
}
window.trunTx = window.trunTx || trunTx;

// Run initially
window.trunTx();

// Run on resize
window.addEventListener('resize', window.trunTx);

  

})();