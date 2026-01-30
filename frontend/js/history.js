/* transaction-history.js - FULLY FIXED VERSION
   - Clear hardcoded HTML on init
   - Default to current month
   - Uses existing HTML month header structure
   - Sticky month headers that push each other
   - Accurate month filtering from server data
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

  /* -------------------------- FAKE DATA GENERATOR (FOR TESTING) -------------------------- */
const USE_FAKE_DATA = false;  // Set to false to use real API

function generateFakeTransactions() {
  const transactions = [];
  const now = new Date();
  
  // Network options for variety
  const networks = ['MTN', 'Airtel', 'GLO', '9Mobile'];
  const types = ['credit', 'debit'];
  const statuses = ['success', 'failed', 'pending', 'refund'];
  
  const descriptions = [
    'MTN 2.0GB Data',
    'Airtel 1.5GB Data',
    'GLO 3.0GB Data',
    '9Mobile 5.0GB Data',
    'Received From Opay',
    'Bank Transfer',
    'Wallet Funding',
    'SafeBox Interest',
    'OWealth Interest Earned',
    'Failed Transaction Refund',
    'Mobile Data Purchase',
    'Airtime Purchase',
    'Cable TV Subscription',
    'Electricity Bill Payment'
  ];
  
  // Generate 3 months of data
  for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
    // Generate 10 transactions per month
    for (let i = 0; i < 10; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - monthOffset, Math.floor(Math.random() * 28) + 1);
      date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0);
      
      const isCredit = Math.random() > 0.6; // 40% credit, 60% debit
      const amount = isCredit 
        ? (Math.random() * 10000 + 100).toFixed(2)  // Credits: 100 - 10,100
        : (Math.random() * 5000 + 500).toFixed(2);   // Debits: 500 - 5,500
      
      const desc = descriptions[Math.floor(Math.random() * descriptions.length)];
      const status = statuses[Math.floor(Math.random() * (i === 0 ? 1 : 4))]; // First tx always success
      
      transactions.push({
        id: `fake-tx-${monthOffset}-${i}-${Date.now()}`,
        reference: `REF${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        type: isCredit ? 'credit' : 'debit',
        amount: amount,
        description: desc + (isCredit ? '' : ` - 0${Math.floor(Math.random() * 90000000 + 8010000000)}`),
        time: date.toISOString(),
        created_at: date.toISOString(),
        status: status.toUpperCase()
      });
    }
  }
  
  // Sort by date (newest first)
  return transactions.sort((a, b) => new Date(b.time) - new Date(a.time));
}

  /* -------------------------- DOM -------------------------- */
  const modal = document.getElementById('historyModal');
  const panel = modal?.querySelector('.opay-panel');
  const backdrop = modal?.querySelector('.opay-backdrop');
  const historyList = document.getElementById('historyList');
  const loadingEl = document.getElementById('historyLoading');
  const emptyEl = document.getElementById('historyEmpty');
  const errorEl = document.getElementById('historyError');
  const downloadBtn = document.getElementById('downloadHistory');


  if (!modal || !panel) {
    console.error('[TransactionHistory] Modal elements not found - check your HTML');
    return;
  }

  /* -------------------------- CLEAR HARDCODED HTML ON INIT -------------------------- */
  if (historyList) {
    historyList.innerHTML = '';
    console.log('[TransactionHistory] Cleared hardcoded HTML from historyList');
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
    filters: {
      category: 'all',
      status: 'all'
    },
    searchTerm: '',
    lastRenderIndex: 0,
    cachePages: new Map(),
    fullHistoryLoaded: false,
    accurateTotalsCalculated: false,
    preloaded: false,
    preloadingInProgress: false
  };

  if (modal) {
  const modalObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const isHidden = modal.classList.contains('hidden');
        if (!isHidden && !state.open) {
          console.log('[TransactionHistory] Modal shown via observer → handling open');
          handleModalOpened();
        } else if (isHidden && state.open) {
          console.log('[TransactionHistory] Modal hidden via observer → setting state.open = false');
          state.open = false;
        }
      }
    });
  });

  modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });

  // Initial check (if modal already open on load)
  if (!modal.classList.contains('hidden')) {
    console.log('[TransactionHistory] Modal already open on init → handling');
    handleModalOpened();
  }
}

  /* -------------------------- MONTH FILTER STATE - DEFAULT TO CURRENT MONTH -------------------------- */
  const today = new Date();
  let selectedMonth = null; // No filter by default

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

  /* -------------------------- FILTER FUNCTIONS -------------------------- */
function applyFilters(items) {
  let filtered = items.slice();

  // Category filter (currently only data)
  if (state.filters.category === 'data') {
    filtered = filtered.filter(tx => {
      const desc = (tx.description || '').toLowerCase();
      return desc.includes('data') || desc.includes('gb') || desc.includes('mb');
    });
  }

  // Status filter
  if (state.filters.status !== 'all') {
    filtered = filtered.filter(tx => {
      const status = (tx.status || 'success').toLowerCase();
      const desc = (tx.description || '').toLowerCase();
      const provider = (tx.provider || '').toLowerCase();

      switch (state.filters.status) {
        case 'success':
          return status === 'success' || status === 'successful' || status === 'true';
        
        case 'failed':
          return status.includes('fail');
        
        case 'pending':
          return status.includes('pending') || status.includes('processing');
        
        case 'refunded':
          return status.includes('refund');
        
        case 'credit':
          return tx.type === 'credit';
        
        case 'mtn':
          return desc.includes('mtn') || provider.includes('mtn');
        
        case 'airtel':
          return desc.includes('airtel') || provider.includes('airtel');
        
        case 'glo':
          return desc.includes('glo') || provider.includes('glo');
        
        case '9mobile':
          return desc.includes('9mobile') || desc.includes('etisalat') || 
                 desc.includes('nine') || provider.includes('9mobile');
        
        default:
          return true;
      }
    });
  }

  return filtered;
}

/* -------------------------- INFINITE SCROLL PAGINATION (OPTIMIZED) -------------------------- */
let isLoadingMore = false;
let currentPage = 1;
let hasMorePages = true;

async function loadMoreTransactions() {
  if (isLoadingMore || !hasMorePages || !state.open) return;

  isLoadingMore = true;
  currentPage++;

  console.log('[Tx Pagination] Loading page', currentPage);

  // Show loading indicator at bottom
  const loadingIndicator = document.createElement('div');
  loadingIndicator.id = 'loadMoreIndicator';
  loadingIndicator.style.cssText = `
    padding: 20px;
    text-align: center;
    color: #999;
    font-size: 14px;
  `;
  loadingIndicator.innerHTML = `
    <div style="display:inline-flex;align-items:center;gap:10px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
        <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="0.75"/>
      </svg>
      Loading more transactions...
    </div>
    <style>
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  `;
  historyList.appendChild(loadingIndicator);

  try {
    const data = await safeFetch(`${CONFIG.apiEndpoint}?limit=50&page=${currentPage}`);
    const apiItems = data.items || [];

    console.log('[Tx Pagination] Fetched', apiItems.length, 'items from page', currentPage);

    if (apiItems.length === 0) {
      hasMorePages = false;
      loadingIndicator.innerHTML = `
        <div style="padding:20px;text-align:center;color:#666;font-size:14px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 12px;opacity:0.3;">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6M12 16h.01"/>
          </svg>
          <div style="font-weight:600;margin-bottom:4px;">You've reached the end</div>
          <div style="font-size:12px;color:#888;">No more transactions to load</div>
        </div>
      `;
      isLoadingMore = false;
      return;
    }

    const existingIds = new Set(state.items.map(tx => tx.id));
    const newTransactions = [];

    apiItems.forEach(raw => {
      const id = raw.id || raw.reference;
      if (!id || existingIds.has(id)) return;

      const normalized = {
        id,
        reference: raw.reference || raw.id,
        type: raw.type || (Number(raw.amount) > 0 ? 'credit' : 'debit'),
        amount: Math.abs(Number(raw.amount || 0)),
        description: (raw.description || raw.narration || 'Transaction').trim(),
        time: raw.created_at || raw.time || new Date().toISOString(),
        status: (raw.status || 'SUCCESS').toUpperCase(),
        provider: raw.provider,
        phone: raw.phone
      };

      newTransactions.push(normalized);
      existingIds.add(id);
    });

    if (newTransactions.length > 0) {
      // Add to state
      state.items.push(...newTransactions);
      
      // Sort only if needed (new items should already be in order)
      state.items.sort((a, b) => new Date(b.time) - new Date(a.time));

      console.log('[Tx Pagination] Added', newTransactions.length, 'new transactions');

      // OPTIMIZED: Only render the new items, don't re-render everything
      appendNewTransactions(newTransactions);
    }

    loadingIndicator.remove();

    // Check if we're at the end
    if (apiItems.length < 50) {
      hasMorePages = false;
      
      const endMessage = document.createElement('div');
      endMessage.style.cssText = `
        padding: 30px 20px;
        text-align: center;
        color: #666;
        font-size: 14px;
      `;
      endMessage.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 12px;opacity:0.3;">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        <div style="font-weight:600;margin-bottom:4px;">All transactions loaded</div>
        <div style="font-size:12px;color:#888;">You've seen all ${state.items.length} transactions</div>
      `;
      historyList.appendChild(endMessage);
    }

  } catch (err) {
    console.error('[Tx Pagination] Failed:', err);
    loadingIndicator.innerHTML = '<div style="color:#ff3b30;padding:10px;cursor:pointer;">Failed to load more. Tap to retry.</div>';
    loadingIndicator.onclick = () => {
      loadingIndicator.remove();
      currentPage--; // Reset page counter
      isLoadingMore = false;
      loadMoreTransactions();
    };
  } finally {
    isLoadingMore = false;
  }
}

/* -------------------------- APPEND NEW TRANSACTIONS (NO FULL RE-RENDER) -------------------------- */
function appendNewTransactions(newTxs) {
  // Apply current filters to new transactions
  let filtered = applyFilters(newTxs);
  
  if (selectedMonth) {
    filtered = filterBySelectedMonth(filtered);
  }

  if (filtered.length === 0) {
    console.log('[Tx Pagination] No new transactions match current filters');
    return;
  }

  // Group by month
  const grouped = groupTransactions(filtered);

  // Append to existing DOM (don't clear everything)
  grouped.forEach(monthGroup => {
    const monthKey = monthGroup.monthKey;
    
    // Find existing month header
    let monthHeader = document.querySelector(`[data-month-key="${monthKey}"]`);
    
    if (!monthHeader) {
      // Create new month section
      monthHeader = makeMonthDivider(monthGroup);
      historyList.appendChild(monthHeader);
    }

    // Append transactions to this month
    monthGroup.txs.forEach(tx => {
      const txNode = makeTxNode(tx);
      
      // Insert after month header
      let insertPoint = monthHeader.nextElementSibling;
      while (insertPoint && !insertPoint.classList.contains('month-section-header')) {
        insertPoint = insertPoint.nextElementSibling;
      }
      
      if (insertPoint) {
        historyList.insertBefore(txNode, insertPoint);
      } else {
        historyList.appendChild(txNode);
      }
    });
  });

  // Update dashboard if visible
  renderDashboardRecent();
}

/* -------------------------- RESET PAGINATION HELPER -------------------------- */
function resetPagination() {
  currentPage = 1;
  hasMorePages = true;
  console.log('[Tx Pagination] Reset to page 1');
}

// Attach scroll listener with debouncing
if (historyList) {
  let scrollTimeout;
  
  historyList.addEventListener('scroll', () => {
    if (!state.open || !hasMorePages || isLoadingMore) return;

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const scrollTop = historyList.scrollTop;
      const scrollHeight = historyList.scrollHeight;
      const clientHeight = historyList.clientHeight;

      // Trigger when user scrolls to 85% of the list
      if (scrollTop + clientHeight >= scrollHeight * 0.85) {
        loadMoreTransactions();
      }
    }, 150); // Debounce by 150ms
  });
}

// Expose for manual calls
window.loadMoreTransactions = loadMoreTransactions;
window.resetPagination = resetPagination;

function getTxIcon(tx) {
  const statusRaw = (tx.status || '').toLowerCase().trim();

  // Highest priority: Refund status always gets refund icon (regardless of description)
  if (statusRaw.includes('refund') || statusRaw === 'refunded') {
    return { 
      cls: 'refund incoming', 
      img: '/frontend/svg/refund.svg', 
      alt: 'Refund' 
    };
  }

  // Then check description/provider (only if not refund)
  let text = '';
  if (tx.description) text += tx.description.toLowerCase() + ' ';
  if (tx.narration) text += tx.narration.toLowerCase() + ' ';
  if (tx.provider) text += tx.provider.toLowerCase() + ' ';
  if (tx.service) text += tx.service.toLowerCase() + ' ';

  if (text.includes('opay'))      return { cls: 'incoming',       img: '/frontend/svg/bank.svg',      alt: 'Opay' };
  if (text.includes('mtn'))       return { cls: 'mtn targets',    img: '/frontend/img/mtn.svg',       alt: 'MTN' };
  if (text.includes('airtel'))    return { cls: 'airtel targets', img: '/frontend/svg/airtel-icon.svg', alt: 'Airtel' };
  if (text.includes('glo'))       return { cls: 'glo targets',    img: '/frontend/svg/GLO-icon.svg',  alt: 'GLO' };
  if (text.includes('9mobile') || text.includes('etisalat') || text.includes('nine')) {
    return { cls: 'nine-mobile targets', img: '/frontend/svg/9mobile-icon.svg', alt: '9Mobile' };
  }

  // Fallback
  return { cls: tx.type === 'credit' ? 'incoming' : 'outgoing', img: '', alt: '' };
}

  // Add this array to collect any pending waiters
let preloadWaiters = [];

// Modify the early return in preloadHistoryForInstantOpen():
if (state.preloadingInProgress) {
  return new Promise((resolve) => {
    preloadWaiters.push(resolve);  // Collect the resolver
  });
}

// Then add this helper function:
function resolvePreloadWaiters() {
  preloadWaiters.forEach(resolve => resolve());
  preloadWaiters = []; // Clear for next time
}
window.resolvePreloadWaiters = resolvePreloadWaiters; // optional for debugging

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
        prettyMonth: date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
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
    
    let maxChars = 25;
    const width = window.innerWidth;

    if (width >= 640 && width < 1024) maxChars = 30;
    else if (width >= 1024) maxChars = 40;

    return text.length > maxChars ? text.slice(0, maxChars) + '…' : text;
  }

  function makeTxNode(tx) {
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
      item.setAttribute('role', 'listitem');

      const isCredit = tx.type === 'credit';
      const icon = getTxIcon(tx);

      const rawDesc = tx.description || tx.narration || tx.type || 'Transaction';
      const truncatedDesc = safeTruncate(rawDesc);
      const amountObj = formatAmountDisplay(tx.amount);
      const formattedDateTime = fmtDateTime(tx.time || tx.created_at);

// === STATUS HANDLING (IMPROVED FOR REAL SERVER DATA) ===
const statusRaw = (tx.status || 'success').toString().toLowerCase().trim();
let statusClass = 'success';
let statusText = 'SUCCESS';

if (statusRaw.includes('fail') || statusRaw.includes('failed')) {
  statusClass = 'failed';
  statusText = 'FAILED';
} else if (statusRaw.includes('refund')) {
  statusClass = 'refund';
  statusText = 'REFUNDED';
} else if (statusRaw.includes('pending')) {
  statusClass = 'pending';
  statusText = 'PENDING';
} else if (statusRaw.includes('success') || statusRaw === 'successful' || statusRaw === 'true') {
  statusClass = 'success';
  statusText = 'SUCCESS';
}
// Any other unknown status → treat as pending/suspicious
else {
  statusClass = 'pending';
  statusText = statusRaw.toUpperCase() || 'UNKNOWN';
}

      item.innerHTML = `
        <div class="tx-icon ${icon.cls}" aria-hidden="true">
          ${icon.img 
            ? `<div class="tx-svg" aria-hidden="true"><img class="tx-img" src="${icon.img}" alt="${icon.alt}" /></div>`
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
  <div class="tx-time">${formattedDateTime}</div>
  <div class="tx-status" data-status="${statusClass}" title="${tx.status || 'SUCCESS'}">
    ${statusText}
  </div>
</div>
        </div>
      `;

      item.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();

  // Reuse the same logic but show beautiful receipt instead
  showTransactionReceipt(tx);
});

      return item;

    } catch (err) {
      console.error('FATAL RENDER ERROR in makeTxNode:', err, tx);
      const fallback = document.createElement('div');
      fallback.className = 'tx-item';
      fallback.textContent = 'Could not render transaction';
      return fallback;
    }
  }

function showTransactionReceipt(tx) {
  const existing = document.getElementById('receiptModal');
  if (existing) existing.remove();

  const icon = getTxIcon(tx);
  
  const networkInfo = (() => {
    const desc = (tx.description || '').toLowerCase();
    const provider = (tx.provider || '').toLowerCase();
    
    if (desc.includes('mtn') || provider.includes('mtn')) return { name: 'MTN', color: '#FFC107' };
    if (desc.includes('airtel') || provider.includes('airtel')) return { name: 'Airtel', color: '#E4002B' };
    if (desc.includes('glo') || provider.includes('glo')) return { name: 'GLO', color: '#6FBF48' };
    if (desc.includes('9mobile') || desc.includes('etisalat') || provider.includes('9mobile')) return { name: '9Mobile', color: '#00A650' };
    if (desc.includes('opay')) return { name: 'Opay', color: '#1E3225' };
    if (desc.includes('refund')) return { name: 'Refund', color: '#fb923c' };
    return { name: 'Transaction', color: '#6c757d' };
  })();

  const amount = formatCurrency(Math.abs(Number(tx.amount || 0)));
  const date = new Date(tx.time || tx.created_at);
  const formattedDate = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const formattedTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  // IMPROVED DATA EXTRACTION
  const fullDesc = tx.description || tx.narration || '';
  
  // Extract phone number (11 digits starting with 0, or 10 digits)
  const phoneMatch = fullDesc.match(/\b0\d{10}\b|\b[7-9]\d{9}\b/);
  const recipientPhone = phoneMatch ? phoneMatch[0] : (tx.phone || null);
  
  // Extract data bundle (GB, MB, or Days)
  const dataMatch = fullDesc.match(/(\d+\.?\d*)\s*(GB|MB)|(\d+\.?\d*)\s*(Days?|Hrs?)/gi);
  const dataBundle = dataMatch ? dataMatch.join(', ') : null;
  
  // Extract account info for credits
  const accountNumberMatch = fullDesc.match(/\b\d{10}\b/);
  const accountNumber = accountNumberMatch ? accountNumberMatch[0] : null;
  
  // Better name extraction (look for capitalized words)
  const nameMatch = fullDesc.match(/(?:from|via|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
  const accountName = nameMatch ? nameMatch[1].trim() : null;

  const statusConfig = {
    success: { text: 'Successful', color: '#00D4AA' },
    failed: { text: 'Failed', color: '#FF3B30' },
    pending: { text: 'Pending', color: '#FF9500' },
    refund: { text: 'Refunded', color: '#00D4AA' }
  };

  const statusKey = (tx.status || 'success').toLowerCase();
  const status = statusConfig[
    statusKey.includes('fail') ? 'failed' : 
    statusKey.includes('refund') ? 'refund' : 
    statusKey.includes('pending') ? 'pending' : 
    'success'
  ];

  // Determine transaction category
  const isDataPurchase = fullDesc.toLowerCase().includes('data') || dataBundle;
  const isAirtimePurchase = fullDesc.toLowerCase().includes('airtime');
  const isCreditTransaction = tx.type === 'credit';

  const modalHTML = `
    <div id="receiptModal" style="position:fixed;inset:0;z-index:100000;background:#000;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div class="opay-backdrop" onclick="this.parentElement.remove()" style="position:absolute;inset:0;"></div>
      
      <!-- Top Header Bar -->
      <div style="background:#1e1e1e;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;position:relative;z-index:10;">
        <button onclick="this.closest('#receiptModal').remove()" style="background:none;border:none;color:#aaa;cursor:pointer;padding:8px;border-radius:50%;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h2 style="margin:0;color:white;font-size:17px;font-weight:700;letter-spacing:-0.2px;">Transaction Details</h2>
        <div style="width:40px;"></div>
      </div>
      
      <div style="flex:1;display:flex;flex-direction:column;background:#121212;margin-top:env(safe-area-inset-top);overflow-y:auto;transform:translateZ(0);padding:16px;gap:24px;">
        
        <!-- Amount & Status Card -->
        <div style="background:#1e1e1e;border-radius:16px;padding:32px 24px 24px;display:flex;flex-direction:column;align-items:center;position:relative;margin-top:35px;">
          
          <!-- Floating Logo Circle -->
          <div class="tx-icon ${icon.cls}" style="
            width:50px; height:50px; border-radius:50%;
            display:flex; align-items:center; justify-content:center;
            position:absolute; top:-25px; left:50%; transform:translateX(-50%);
            background:${networkInfo.color}; box-shadow:0 6px 16px rgba(0,0,0,0.5);
          ">
            ${icon.img
              ? `<img src="${icon.img}" alt="${icon.alt}" class="tx-img" style="width:28px;height:28px;object-fit:contain;image-rendering:crisp-edges;">`
              : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                   ${tx.type === 'credit' 
                      ? '<path d="M12 19V5M5 12l7 7 7-7"/>' 
                      : '<path d="M12 5v14M19 12l-7-7-7 7"/>'}
                 </svg>`
            }
          </div>

          <!-- Amount -->
          <div style="font-size:32px;font-weight:800;color:white;margin-top:32px;margin-bottom:8px;line-height:1;letter-spacing:-1px;">${amount}</div>

          <!-- Status -->
          <div style="color:${status.color};font-size:16px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:7px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 12l2 2 4-4"/>
            </svg>
            ${status.text}
          </div>
        </div>

        <!-- Details Card -->
        <div style="background:#1e1e1e;border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:14px;">
          <h3 style="margin:0 0 8px;color:#ccc;font-size:16px;font-weight:600;letter-spacing:0.2px;">Transaction Details</h3>
          
          ${isDataPurchase && recipientPhone ? `
            <div class="detail-row">
              <span>Recipient Number</span>
              <strong style="font-family:ui-monospace,monospace;letter-spacing:0.5px;">${recipientPhone}</strong>
            </div>
          ` : ''}
          
          ${isDataPurchase && dataBundle ? `
            <div class="detail-row">
              <span>Data Bundle</span>
              <strong>${dataBundle}</strong>
            </div>
          ` : ''}
          
          ${isDataPurchase && networkInfo.name !== 'Transaction' ? `
            <div class="detail-row">
              <span>Network Provider</span>
              <strong>${networkInfo.name}</strong>
            </div>
          ` : ''}

          ${isCreditTransaction && accountName ? `
            <div class="detail-row">
              <span>Source Name</span>
              <strong>${accountName}</strong>
            </div>
          ` : ''}
          
          ${isCreditTransaction && accountNumber ? `
            <div class="detail-row">
              <span>Account Number</span>
              <strong style="font-family:ui-monospace,monospace;letter-spacing:0.5px;">${accountNumber}</strong>
            </div>
          ` : ''}

          <div class="detail-row">
            <span>Transaction Type</span>
            <strong>${
              isDataPurchase ? 'Mobile Data' : 
              isAirtimePurchase ? 'Airtime Top-up' : 
              isCreditTransaction ? 'Wallet Credit' : 
              'Debit'
            }</strong>
          </div>

          ${!isCreditTransaction ? `
            <div class="detail-row">
              <span>Payment Method</span>
              <strong>Wallet Balance</strong>
            </div>
          ` : ''}

          <div class="detail-row">
            <span>Transaction No.</span>
            <div style="display:flex;align-items:center;gap:10px;">
              <strong style="font-family:ui-monospace,monospace;font-size:12px;letter-spacing:0.8px;">${tx.reference || tx.id || '—'}</strong>
              <button onclick="navigator.clipboard.writeText('${tx.reference || tx.id}');this.innerHTML='✓';setTimeout(()=>this.innerHTML=copySvg,1500)" style="background:none;border:none;color:#00d4aa;cursor:pointer;padding:4px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
            </div>
          </div>

          <div class="detail-row">
            <span>Transaction Date</span>
            <strong>${formattedDate} · ${formattedTime}</strong>
          </div>
          
          ${fullDesc ? `
            <div class="detail-row" style="flex-direction:column;align-items:flex-start;gap:6px;">
              <span>Description</span>
              <strong style="color:#ccc;font-weight:400;font-size:13px;line-height:1.5;">${fullDesc}</strong>
            </div>
          ` : ''}
        </div>

        <!-- Action Buttons -->
        <div style="display:flex;gap:12px;margin-top:auto;padding-bottom:env(safe-area-inset-bottom);">
          <button onclick="reportTransactionIssue('${tx.id || tx.reference}')" style="flex:1;background:#2c2c2c;color:#00d4aa;border:1.5px solid #00d4aa;border-radius:50px;padding:14px;font-weight:600;cursor:pointer;font-size:14px;">Report Issue</button>
          <button onclick="shareReceipt(this.closest('#receiptModal'), '${(tx.reference || tx.id || '').replace(/'/g, "\\'")}', '${amount.replace(/'/g, "\\'")}', '${fullDesc.replace(/'/g, "\\'")}', '${formattedDate}', '${formattedTime}', '${status.text}', '${networkInfo.name}', '${networkInfo.color}', '${icon.img || ''}', '${tx.type}')" style="flex:1;background:linear-gradient(90deg,#00d4aa,#00bfa5);color:white;border:none;border-radius:50px;padding:14px;font-weight:600;cursor:pointer;font-size:14px;">Share Receipt</button>
        </div>

      </div>
    </div>

    <style>
      #receiptModal * { 
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
        box-sizing: border-box;
      }
      .detail-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: #e0e0e0;
        font-size: 14px;
      }
      .detail-row span { 
        color: #999; 
        font-weight: 500;
      }
      .detail-row strong { 
        color: white; 
        font-weight: 600;
      }
      .detail-row button svg { transition: all 0.2s; }
      .detail-row button:active svg { transform: scale(0.9); }
    </style>

    <script>
      const copySvg = \`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>\`;
    </script>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function reportTransactionIssue(txId) {
  alert(`Report issue for transaction ${txId}\n\nThis will open support chat in production`);
  // Later: open WhatsApp, email, or in-app support
  document.getElementById('receiptModal')?.remove();
}

window.reportTransactionIssue = reportTransactionIssue;
window.shareReceipt = shareReceipt;

/**
 * shareReceipt - Generates receipt matching the EXACT minimalist design
 * Clean white card, properly centered, with smart credit transaction handling
 */
function shareReceipt(modalEl, ref, amount, desc, date, time, statusText, networkName, networkColor, logoImg, txType) {
  
  // ====================
  // 1. INTELLIGENT DATA EXTRACTION
  // ====================
  
  const dataBundle = desc.match(/\d+\.?\d*\s?GB|[\d.]+\s?Days?/gi)?.join(' ') || null;
  const phoneNumber = desc.match(/0?\d{10,11}/)?.[0] || null;
  
  // Extract credit/funding source info
  const fromMatch = desc.match(/(?:from|via)\s+([A-Za-z0-9\s]+)/i);
  const accountNumberMatch = desc.match(/\b\d{10}\b/); // 10-digit account number
  const accountNameMatch = desc.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)/); // Name pattern
  
  const fundingSource = fromMatch ? fromMatch[1].trim() : 'External Source';
  const accountNumber = accountNumberMatch ? accountNumberMatch[0] : null;
  const accountName = accountNameMatch ? accountNameMatch[0] : null;
  
  // Determine transaction category
  const isDataPurchase = desc.toLowerCase().includes('data') || dataBundle;
  const isAirtimePurchase = desc.toLowerCase().includes('airtime');
  const isCreditTransaction = txType === 'credit';
  const isRefund = desc.toLowerCase().includes('refund');
  const isWalletFunding = desc.toLowerCase().includes('fund') || desc.toLowerCase().includes('deposit');
  
  // Provider type detection
  const providerType = desc.toLowerCase().includes('sme') ? 'SME' 
    : desc.toLowerCase().includes('direct') ? 'Direct Data'
    : desc.toLowerCase().includes('gifting') ? 'Gifting'
    : desc.toLowerCase().includes('corporate') ? 'Corporate'
    : isAirtimePurchase ? 'VTU'
    : 'Standard';

  // ====================
  // 2. DYNAMIC HEADLINE
  // ====================
  
  let headline = '';
  if (isCreditTransaction || isWalletFunding) {
    headline = amount; // Show amount for credits (e.g., "₦5,000")
  } else if (isDataPurchase && dataBundle) {
    headline = dataBundle; // "3.5GB"
  } else if (isAirtimePurchase) {
    headline = amount; // "₦500"
  } else if (isRefund) {
    headline = 'Refund';
  } else {
    headline = amount; // Fallback
  }

  // ====================
  // 3. DYNAMIC METADATA ROWS
  // ====================
  
  const metadataRows = [];
  
  // FOR CREDIT TRANSACTIONS - Show funding source details
  if (isCreditTransaction || isWalletFunding) {
    metadataRows.push({ label: 'Source', value: fundingSource });
    
    if (accountNumber) {
      metadataRows.push({ label: 'Account Number', value: accountNumber });
    }
    
    if (accountName) {
      metadataRows.push({ label: 'Account Name', value: accountName });
    }
    
    // Determine bank/platform from description
    let platform = 'Bank Transfer';
    if (desc.toLowerCase().includes('opay')) platform = 'Opay';
    else if (desc.toLowerCase().includes('palmpay')) platform = 'PalmPay';
    else if (desc.toLowerCase().includes('kuda')) platform = 'Kuda Bank';
    else if (desc.toLowerCase().includes('gtbank') || desc.toLowerCase().includes('gtb')) platform = 'GTBank';
    
    metadataRows.push({ label: 'Via', value: platform });
  }
  // FOR DATA/AIRTIME PURCHASES
  else if (isDataPurchase || isAirtimePurchase) {
    if (networkName && networkName !== 'Transaction') {
      metadataRows.push({ label: 'Network', value: networkName });
    }
    
    if (providerType !== 'Standard') {
      metadataRows.push({ label: 'Type', value: providerType });
    }
    
    if (phoneNumber) {
      metadataRows.push({ label: 'Phone Number', value: phoneNumber });
    }
    
    if (isDataPurchase && dataBundle) {
      metadataRows.push({ label: 'Plan Duration', value: `${dataBundle} Monthly` });
    }
  }
  
  // Amount (always show)
  metadataRows.push({ label: 'Amount', value: amount });

  // ====================
  // 4. BUILD HTML - PERFECTLY CENTERED
  // ====================
  
  const receiptHTML = `
    <div style="
      background: #f5f5f5;
      padding: 20px;
      min-height: 100vh;
      box-sizing: border-box;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-font-smoothing: antialiased;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      
      <div style="max-width: 360px; width: 100%;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 20px 4px; margin-bottom: 10px;">
          <div style="display: flex; align-items: center;">
            <img src="https://flexgig.com.ng/frontend/svg/logo.svg" 
                 alt="Flexgig logo" 
                 style="width: 38px; margin-right: 8px; display: block;"
                 crossorigin="anonymous">
            <span style="font-size: 22px; font-weight: 700; color: #0a52ff;">Flexgig</span>
          </div>
          <div style="font-size: 13px; color: #aaa;">Transaction Receipt</div>
        </div>

        <!-- Receipt Card -->
        <div style="
          background: #fff;
          padding: 24px;
          border-radius: 16px;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
          position: relative;
        ">
          
          <!-- Dotted top edge (receipt style) -->
          <div style="
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 10px;
            background: repeating-linear-gradient(90deg, transparent 0 6px, rgba(0,0,0,0.03) 6px 8px);
            border-top-left-radius: 12px;
            border-top-right-radius: 12px;
          "></div>

          <!-- Headline -->
          <div style="
            font-size: 26px;
            font-weight: 800;
            text-align: center;
            margin: 16px 0 6px;
            color: #000;
            line-height: 1;
          ">${headline}</div>

          <!-- Status -->
          <div style="
            display: block;
            text-align: center;
            font-size: 16px;
            margin-top: 6px;
            color: ${statusText === 'Successful' ? '#1fbf7a' : statusText === 'Failed' ? '#ff3b30' : '#ff9500'};
            font-weight: 600;
          ">${statusText}</div>

          <!-- Timestamp -->
          <div style="
            font-size: 13px;
            color: #555;
            text-align: center;
            margin-top: 6px;
            margin-bottom: 16px;
          ">${date} ${time}</div>

          <!-- Divider -->
          <div style="height: 1px; background: #eee; margin: 16px 0;"></div>

          <!-- Metadata Rows -->
          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
            ${metadataRows.map(row => `
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="color: #666; font-size: 13px;">${row.label}</div>
                <div style="
                  color: #555;
                  font-size: 14px;
                  font-weight: 600;
                  text-align: right;
                  max-width: 60%;
                  word-break: break-word;
                  ${row.label === 'Phone Number' || row.label === 'Account Number' ? 'font-family: monospace; letter-spacing: 0.5px;' : ''}
                ">${row.value}</div>
              </div>
            `).join('')}
          </div>

          <!-- Transaction Number -->
          <div style="font-size: 14px; color: #444; line-height: 1.8; margin-top: 8px;">
            <strong style="font-weight: 700;">Transaction No.:</strong> ${ref}
          </div>

          <!-- Divider -->
          <div style="height: 1px; background: #eee; margin: 16px 0;"></div>

          <!-- Footer -->
          <p style="
            font-size: 13px;
            color: #888;
            text-align: center;
            line-height: 1.4;
            margin: 14px 0 0;
          ">
            Flexgig is built for you — fast, secure and always reliable.<br>
            Join the Flexgig family today and enjoy more.
          </p>

        </div>
      </div>
    </div>
  `;

  // ====================
  // 5. RENDER & CAPTURE
  // ====================
  
  const tempContainer = document.createElement('div');
  tempContainer.innerHTML = receiptHTML;
  tempContainer.style.cssText = 'position: fixed; top: -99999px; left: -99999px; width: 400px;';
  document.body.appendChild(tempContainer);

  // Wait for logo to load
  const logo = tempContainer.querySelector('img[alt="Flexgig logo"]');
  const logoPromise = new Promise(resolve => {
    if (logo && logo.complete) {
      resolve();
    } else if (logo) {
      logo.onload = resolve;
      logo.onerror = resolve;
    } else {
      resolve();
    }
  });

  logoPromise.then(() => {
    // Capture the entire centered container
    const mainDiv = tempContainer.firstElementChild;
    
    html2canvas(mainDiv, {
      scale: 2,
      backgroundColor: '#f5f5f5',
      logging: false,
      useCORS: true,
      allowTaint: false,
      width: 400,
      height: mainDiv.scrollHeight
    }).then(canvas => {
      canvas.toBlob(blob => {
        const filename = `FlexGig-Receipt-${ref.replace(/[^a-zA-Z0-9]/g, '-')}.png`;
        const file = new File([blob], filename, { type: 'image/png' });
        
        // Share or download
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({
            files: [file],
            title: 'FlexGig Transaction Receipt',
            text: `Transaction Receipt - ${headline}`
          }).catch(err => {
            if (err.name !== 'AbortError') {
              console.log('Share failed, downloading instead');
              downloadImage(blob, filename);
            }
          });
        } else {
          downloadImage(blob, filename);
        }
        
        tempContainer.remove();
      }, 'image/png');
    }).catch(err => {
      console.error('Canvas generation failed:', err);
      alert('Failed to generate receipt image. Please try again.');
      tempContainer.remove();
    });
  });

  // Helper function for downloading
  function downloadImage(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // Close modal
  if (modalEl) modalEl.remove();
}


  window.addEventListener('resize', () => {
    document.querySelectorAll('.tx-desc').forEach(descEl => {
      const fullText = descEl.getAttribute('title') || descEl.textContent;
      descEl.textContent = truncateDescription(fullText);
    });
  });

  /* -------------------------- STICKY MONTH DIVIDERS (matching HTML structure) -------------------------- */
/* -------------------------- STICKY MONTH DIVIDERS (Opay-style with full header) -------------------------- */
function makeMonthDivider(month) {
  const container = document.createElement('div');
  container.className = 'month-section-header';
  container.dataset.monthKey = month.monthKey;
  
  container.style.cssText = `
    position: sticky;
    top: 0;
    z-index: 10;
    background: #1e1e1e;
    margin: 0;
    padding: 0;
    transform: translateZ(0);
    backface-visibility: hidden;
    border-top-left-radius: 10px;
    border-top-right-radius: 10px;
    overflow: hidden;
  `;
  
  // Create the full Opay-style header with month selector and totals
  container.innerHTML = `
  <div class="opay-month-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 12px; background: #1e1e1e; gap: 12px;">
    <div class="opay-month-selector" style="display: inline-flex; align-items: center; gap: 6px; font-size: 16px; font-weight: 600; color: white; cursor: pointer; flex: 1;">
      <span>${month.prettyMonth}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </div>
  </div>
    
    <div class="opay-summary" style="display: flex; justify-content: space-between; padding: 12px 12px; background: #1e1e1e; font-size: 14px; color: #999; gap: 16px; border-bottom: none;">
      <div>In: <strong style="color: white; font-weight: 600; margin-left: 4px;">${formatCurrency(month.totalIn)}</strong></div>
      <div>Out: <strong style="color: white; font-weight: 600; margin-left: 4px;">${formatCurrency(month.totalOut)}</strong></div>
    </div>
  `;
  
  // Make the month selector clickable to open month picker
  const monthSelector = container.querySelector('.opay-month-selector');
  if (monthSelector) {
    monthSelector.addEventListener('click', (e) => {
      e.stopPropagation();
      // Extract year and month from the month object
      const [year, monthNum] = month.monthKey.split('-');
      selectedMonth = { year: parseInt(year), month: parseInt(monthNum) };
      window.currentMonthPickerYear = parseInt(year);
      
      // Open month picker modal
      createMonthPickerModal();
      const modalEl = document.getElementById('monthFilterModal');
      modalEl.classList.remove('hidden');
      generateMonthGrid();

      setTimeout(() => {
        const panel = modalEl.querySelector('.opay-panel');
        if (panel) {
          panel.style.transform = 'scale(1)';
          panel.style.opacity = '1';
        }
      }, 10);
    });
  }
  
  return container;
}

/* -------------------------- RENDER WITH MONTH DIVIDERS -------------------------- */
  /* -------------------------- RENDER WITH MONTH DIVIDERS -------------------------- */
function renderChunked(groupedMonths) {
  historyList.innerHTML = '';
  state.lastRenderIndex = 0;

  const flat = [];

  groupedMonths.forEach(month => {
    // Always push the month divider (even if empty)
    flat.push({ type: 'month-divider', month });

    // If month has transactions → push them
    if (month.txs.length > 0) {
      month.txs.forEach(tx => flat.push({ type: 'tx', tx }));
    } else {
      // Empty month → push a special "no transactions" entry
      flat.push({ type: 'no-tx', month });
    }
  });

  function renderNextChunk() {
    const start = state.lastRenderIndex;
    const end = Math.min(flat.length, start + CONFIG.chunkRenderSize);
    const fragment = document.createDocumentFragment();

    for (let i = start; i < end; i++) {
      const entry = flat[i];

      if (entry.type === 'month-divider') {
        fragment.appendChild(makeMonthDivider(entry.month));
      } 
      else if (entry.type === 'tx') {
        fragment.appendChild(makeTxNode(entry.tx));
      }
      else if (entry.type === 'no-tx') {
        // Create "No transactions" placeholder
        const noTxEl = document.createElement('div');
        noTxEl.className = 'no-transactions-placeholder';
        noTxEl.style.cssText = `
          padding: 40px 20px;
          text-align: center;
          color: #999;
          font-size: 15px;
          background: transparent;
          margin-bottom: 20px;
        `;
        noTxEl.textContent = `No transactions in ${entry.month.prettyMonth}`;
        fragment.appendChild(noTxEl);
      }
    }

    historyList.appendChild(fragment);
    state.lastRenderIndex = end;

    // Re-apply bottom margin to last item of each month (including no-tx placeholder)
    const monthSections = document.querySelectorAll('.month-section-header');
    monthSections.forEach(section => {
      let lastItem = null;
      let next = section.nextElementSibling;

      while (next && !next.classList.contains('month-section-header')) {
        if (next.classList.contains('tx-item') || next.classList.contains('no-transactions-placeholder')) {
          next.style.marginBottom = '0';
          lastItem = next;
        }
        next = next.nextElementSibling;
      }
      if (lastItem) lastItem.style.marginBottom = '20px';
    });

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

  // ────────────────────────────────────────────────
// LOAD INITIAL USER TOTALS FROM DATABASE
// ────────────────────────────────────────────────

async function loadInitialUserTotals() {
  try {
    const uid = window.__USER_UID || 
                localStorage.getItem('userId') || 
                JSON.parse(localStorage.getItem('userData') || '{}')?.uid;
    
    if (!uid || !uid.includes('-')) {
      console.warn('[User Totals] No valid UID - skipping load');
      return;
    }

    console.log('[User Totals] Loading initial totals for:', uid);

    const token = await getSharedJWT(true);
    if (!token) throw new Error('No JWT available');

    const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { 
        autoRefreshToken: false, 
        persistSession: false,
        storageKey: 'flexgig_totals_temp_jwt'
      }
    });

    await tempClient.auth.setSession({
      access_token: token,
      refresh_token: token
    });

    const { data, error } = await tempClient
      .from('users')
      .select('all_time_in, all_time_out, total_data_tx_count')
      .eq('id', uid)
      .single();

    if (error) throw error;

    // Store in localStorage
    localStorage.setItem('allTimeIn', data.all_time_in || 0);
    localStorage.setItem('allTimeOut', data.all_time_out || 0);
    localStorage.setItem('totalDataTxCount', data.total_data_tx_count || 0);

    console.log('[User Totals] ✅ Loaded:', {
      allTimeIn: data.all_time_in,
      allTimeOut: data.all_time_out,
      totalTxCount: data.total_data_tx_count
    });

    // Update dashboard immediately
    updateDashboardTotals();

  } catch (err) {
    console.error('[User Totals] Failed to load initial totals:', err);
  }
}

window.loadInitialUserTotals = loadInitialUserTotals;

/* -------------------------- FALLBACK: LOAD FROM API ONLY IF REALTIME FAILS -------------------------- */
/* -------------------------- FALLBACK: LOAD FROM API ONLY IF REALTIME FAILS -------------------------- */
async function loadLatestHistoryAsFallback() {
  console.log('[Tx Fallback] Loading initial history from API (limit 200, page 1)');

  show(loadingEl);
  hide(emptyEl);

  let allTx = state.items.slice(); // Start with whatever realtime already gave us

  try {
    const data = await safeFetch(`${CONFIG.apiEndpoint}?limit=200&page=1`);
    const apiItems = data.items || [];

    console.log('[Tx Fallback] API returned', apiItems.length, 'items');

    if (apiItems.length > 0) {
      const existingIds = new Set(allTx.map(tx => tx.id));

      apiItems.forEach(raw => {
        const id = raw.id || raw.reference;
        if (!id) {
          console.warn('[Tx Fallback] Skipping row with no ID/reference:', raw);
          return;
        }

        let normalized = {
          id,
          reference: raw.reference || raw.id,
          type: raw.type || (Number(raw.amount) > 0 ? 'credit' : 'debit'),
          amount: Math.abs(Number(raw.amount || 0)),
          description: (raw.description || raw.narration || 'Transaction')
            .replace(/\s*\(pending\)\s*/gi, '')
            .trim(),
          time: raw.time || raw.created_at || new Date().toISOString(),
          status: (raw.status || 'SUCCESS').toUpperCase(),
          provider: raw.provider,
          phone: raw.phone
        };

        const statusLower = normalized.status.toLowerCase();

        if (statusLower.includes('refund') || statusLower === 'refunded') {
          normalized.type = 'credit';
          normalized.description = 'Refund for Failed Data';
        }

        if (!existingIds.has(id)) {
          allTx.push(normalized); // Use push instead of unshift (we'll sort after)
          existingIds.add(id);
        }
      });
    }

    // Final sort: newest first
    allTx.sort((a, b) => new Date(b.time) - new Date(a.time));

    state.items = allTx;
    state.preloaded = true;
    
    // DON'T set fullHistoryLoaded - let infinite scroll handle it
    // state.fullHistoryLoaded = true; // ← REMOVED

    // Initialize pagination
    currentPage = 1; // Start at page 1
    hasMorePages = apiItems.length >= 200; // If we got 200, there might be more

    applyTransformsAndRender();
    renderDashboardRecent();
    console.log('[Tx Fallback] Success — total items:', state.items.length);
  } catch (err) {
    console.error('[Tx Fallback] API fetch failed:', err.message || err);
  } finally {
    hide(loadingEl);
  }
}

window.loadLatestHistoryAsFallback = loadLatestHistoryAsFallback;

  /* -------------------------- MONTH FILTER FUNCTIONS -------------------------- */
  function formatMonthYear(date) {
    return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }

function updateMonthDisplay() {
  // This function is no longer needed since each month header shows its own date
  console.log('[TransactionHistory] Month display updated in individual headers');
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

  // Update will happen in the month headers themselves
  console.log(`[TransactionHistory] Total In: ${formatCurrency(totalIn)}, Total Out: ${formatCurrency(totalOut)}`);
}

  function applyMonthFilterAndRender() {
  resetPagination(); // Reset pagination when month changes
  
  let itemsToRender;
  
  if (!selectedMonth) {
    itemsToRender = state.items;
  } else {
    itemsToRender = filterBySelectedMonth(state.items);
  }

  const grouped = groupTransactions(itemsToRender);
  setState({ grouped });
  renderChunked(grouped);
  computeFilteredSummary(itemsToRender);

  if (itemsToRender.length === 0) {
    const emptyMonth = {
      monthKey: `${selectedMonth.year}-${selectedMonth.month}`,
      prettyMonth: new Date(selectedMonth.year, selectedMonth.month).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      totalIn: 0,
      totalOut: 0,
      txs: []
    };
    renderChunked([emptyMonth]);
    hide(emptyEl);
  } else {
    const grouped = groupTransactions(itemsToRender);
    renderChunked(grouped);
    hide(emptyEl);
  }
}

  function applyTransformsAndRender() {
  let items = state.items.slice();

  // Apply search
  if (state.searchTerm) {
    const s = state.searchTerm.toLowerCase();
    items = items.filter(tx =>
      (tx.description || '').toLowerCase().includes(s) ||
      (tx.id || '').toLowerCase().includes(s)
    );
  }

  // Apply category and status filters
  items = applyFilters(items);

  // Apply month filter
  if (selectedMonth) {
    items = filterBySelectedMonth(items);
  }

  const groupedMonths = groupTransactions(items);
  setState({ grouped: groupedMonths });
  renderChunked(groupedMonths);

  computeFilteredSummary(items);

  // Handle empty state
  if (items.length === 0) {
    if (selectedMonth || state.filters.category !== 'all' || state.filters.status !== 'all') {
      // User applied filters but got no results
      const emptyMonth = selectedMonth ? {
        monthKey: `${selectedMonth.year}-${selectedMonth.month}`,
        prettyMonth: new Date(selectedMonth.year, selectedMonth.month).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
        totalIn: 0,
        totalOut: 0,
        txs: []
      } : null;
      
      if (emptyMonth) {
        renderChunked([emptyMonth]);
      } else {
        // Show filter-specific empty message
        historyList.innerHTML = `
          <div style="padding: 60px 20px; text-align: center; color: #999;">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 16px; opacity: 0.3;">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">No transactions found</div>
            <div style="font-size: 14px;">Try adjusting your filters</div>
          </div>
        `;
      }
    } else {
      // Truly no transactions ever
      show(emptyEl);
    }
  } else {
    renderChunked(groupedMonths);
    hide(emptyEl);
  }
}

  window.applyTransformsAndRender = applyTransformsAndRender;

  /* -------------------------- CUSTOM DROPDOWN FUNCTIONALITY -------------------------- */
function initCustomDropdowns() {
  const categoryTrigger = document.getElementById('categoryTrigger');
  const categoryDropdown = document.getElementById('categoryDropdown');
  const statusTrigger = document.getElementById('statusTrigger');
  const statusDropdown = document.getElementById('statusDropdown');

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-select-wrapper')) {
      categoryDropdown?.classList.remove('show');
      statusDropdown?.classList.remove('show');
      categoryTrigger?.classList.remove('active');
      statusTrigger?.classList.remove('active');
    }
  });

  // Category dropdown
  if (categoryTrigger && categoryDropdown) {
    categoryTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      statusDropdown?.classList.remove('show');
      statusTrigger?.classList.remove('active');
      categoryDropdown.classList.toggle('show');
      categoryTrigger.classList.toggle('active');
    });

    categoryDropdown.querySelectorAll('.dropdown-option').forEach(option => {
      option.addEventListener('click', (e) => {
        const value = e.currentTarget.getAttribute('data-value');
        const text = e.currentTarget.textContent.trim();
        
        categoryTrigger.querySelector('.selected-value').textContent = text;
        categoryDropdown.querySelectorAll('.dropdown-option').forEach(opt => 
          opt.classList.remove('active')
        );
        e.currentTarget.classList.add('active');
        
        state.filters.category = value;
        resetPagination(); // Reset pagination when category changes
        console.log('[TransactionHistory] Category filter changed to:', value);
        applyTransformsAndRender();
        
        categoryDropdown.classList.remove('show');
        categoryTrigger.classList.remove('active');
      });
    });
  }

  // Status dropdown
  if (statusTrigger && statusDropdown) {
    statusTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      categoryDropdown?.classList.remove('show');
      categoryTrigger?.classList.remove('active');
      statusDropdown.classList.toggle('show');
      statusTrigger.classList.toggle('active');
    });

    statusDropdown.querySelectorAll('.dropdown-option').forEach(option => {
      option.addEventListener('click', (e) => {
        const value = e.currentTarget.getAttribute('data-value');
        const text = e.currentTarget.textContent.trim();
        
        statusTrigger.querySelector('.selected-value').textContent = text;
        statusDropdown.querySelectorAll('.dropdown-option').forEach(opt => 
          opt.classList.remove('active')
        );
        e.currentTarget.classList.add('active');
        
        state.filters.status = value;
        resetPagination(); // Reset pagination when status changes
        console.log('[TransactionHistory] Status filter changed to:', value);
        applyTransformsAndRender();
        
        statusDropdown.classList.remove('show');
        statusTrigger.classList.remove('active');
      });
    });
  }
}

// Call this after your modal initialization
initCustomDropdowns();

  /* -------------------------- MONTH PICKER MODAL -------------------------- */
function createMonthPickerModal() {
  const existing = document.getElementById('monthFilterModal');
  if (existing) existing.remove();

  // Track current year being displayed in the grid
  window.currentMonthPickerYear = window.currentMonthPickerYear || new Date().getFullYear();

  const modalHTML = `
    <div id="monthFilterModal" class="opay-modal hidden" style="position: fixed; inset: 0; z-index: 10000000; display: flex; align-items: center; justify-content: center; font-family: 'Inter', sans-serif;">
      <div class="opay-backdrop" data-close-month style="position: absolute; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);"></div>
      
      <div class="opay-panel" style="position: relative; max-width: 380px; width: 90%; background: #fff; border-radius: 10px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); overflow: hidden; transform: scale(0.9); opacity: 0; transition: all 0.3s ease-in-out;">
        
        <div class="opay-header" style="padding: 18px 16px; border-bottom: 1px solid #eee; font-weight: 600; text-align: center; position: relative; color: #222; font-size: 18px;">
          <button data-close-month style="position: absolute; left: 16px; background: transparent; border: none; font-size: 24px; cursor: pointer; color: #999;">×</button>
          Select Month
        </div>

        <!-- YEAR NAVIGATION -->
        <div style="padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; background: #f8f9fa; border-bottom: 1px solid #eee;">
          <button id="prevYearBtn" style="background:none; border:none; font-size:28px; cursor:pointer; color:#00d4aa; padding:4px 8px;">‹</button>
          <div id="currentYearDisplay" style="font-weight:700; font-size:18px; color:#222;">${window.currentMonthPickerYear}</div>
          <button id="nextYearBtn" style="background:none; border:none; font-size:28px; cursor:pointer; color:#00d4aa; padding:4px 8px;">›</button>
        </div>
        
        <div id="monthGrid" style="padding: 24px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;"></div>
        
        <div style="padding: 16px; border-top: 1px solid #eee; display: flex; gap: 12px; justify-content: center;">
          <button id="allTimeBtn" style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; cursor: pointer;">All Time</button>
          <button id="confirmMonthBtn" style="background: linear-gradient(90deg,#00d4aa,#00bfa5); color: white; border: none; padding: 12px 32px; border-radius: 10px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 10px rgba(0,212,170,0.3);">Confirm</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const modalEl = document.getElementById('monthFilterModal');

  // Year navigation
  modalEl.querySelector('#prevYearBtn').onclick = () => {
    window.currentMonthPickerYear--;
    generateMonthGrid();
    modalEl.querySelector('#currentYearDisplay').textContent = window.currentMonthPickerYear;
  };

  modalEl.querySelector('#nextYearBtn').onclick = () => {
    window.currentMonthPickerYear++;
    generateMonthGrid();
    modalEl.querySelector('#currentYearDisplay').textContent = window.currentMonthPickerYear;
  };

  // Confirm / All Time / Close
  modalEl.querySelector('#confirmMonthBtn').onclick = () => {
    applyMonthFilterAndRender();
    modalEl.classList.add('hidden');
  };

  modalEl.querySelector('#allTimeBtn').onclick = () => {
    selectedMonth = null;
    applyMonthFilterAndRender();
    modalEl.classList.add('hidden');
  };

  modalEl.querySelectorAll('[data-close-month]').forEach(el => {
    el.onclick = () => modalEl.classList.add('hidden');
  });

  modalEl.querySelector('.opay-backdrop').onclick = () => modalEl.classList.add('hidden');
}

  function generateMonthGrid() {
  const grid = document.getElementById('monthGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const year = window.currentMonthPickerYear || new Date().getFullYear();

  for (let month = 0; month < 12; month++) {
    const date = new Date(year, month, 1);
    const pretty = date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

    const btn = document.createElement('button');
    btn.textContent = date.toLocaleDateString('en-GB', { month: 'short' });
    btn.style.cssText = `
      padding: 16px 8px; border: 1px solid #ddd; border-radius: 8px; background: white;
      font-size: 15px; font-weight: 500; cursor: pointer; transition: all 0.2s;
    `;

    // Highlight selected month
    const isSelected = selectedMonth &&
      selectedMonth.year === year &&
      selectedMonth.month === month;

    if (isSelected) {
      btn.style.background = '#00d4aa';
      btn.style.color = 'white';
      btn.style.borderColor = '#00d4aa';
    }

    // Highlight current month (today)
    const today = new Date();
    if (year === today.getFullYear() && month === today.getMonth()) {
      if (!isSelected) btn.style.fontWeight = '700';
    }

    btn.addEventListener('click', () => {
      selectedMonth = { year, month };
      generateMonthGrid(); // Re-render to update highlight
    });

    grid.appendChild(btn);
  }
}

  /* -------------------------- MODAL OPEN/CLOSE -------------------------- */
  document.addEventListener('modalOpened', (e) => {
    if (e.detail === 'historyModal') {
      console.log('[TransactionHistory] Modal opened by ModalManager');
      handleModalOpened();
      resetPagination();
    }
  });

  async function handleModalOpened() {
  state.open = true;
  selectedMonth = null;

  // Fast open: no loading spinner, show empty or "connecting" state
  hide(loadingEl);
  if (state.items.length === 0) {
    show(emptyEl); // or show a custom "Connecting realtime..." element if you add one
  }

  // Force realtime retry (in case it failed earlier)
  subscribeToTransactions(true);
  // NO loadLatestHistory() call here anymore

  applyTransformsAndRender();
  console.log('[TransactionHistory] Modal opened → rendered current state (items:', state.items.length, ')');
}
const container = document.getElementById('historyList');

function updateHeaders() {
  const headers = container.querySelectorAll('.month-section-header');
  
  headers.forEach((header, i) => {
    const nextHeader = headers[i + 1];
    const headerRect = header.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    if (nextHeader) {
      const nextRect = nextHeader.getBoundingClientRect();
      let offset = 0;

      if (nextRect.top - containerRect.top <= header.offsetHeight) {
        offset = nextRect.top - containerRect.top - header.offsetHeight;
      }

      header.style.transform = `translateY(${offset}px)`;
    }
  });
}


  /* -------------------------- EVENT LISTENERS -------------------------- */
  document.addEventListener('keydown', e => {
    if (!state.open) return;
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
          tx.status || 'SUCCESS'
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

  // REAL-TIME TRANSACTION UPDATES — INSTANT, NO RELOAD
// REAL-TIME TRANSACTION UPDATES — WORKS EVEN WHEN CLOSED
document.addEventListener('transaction_update', (e) => {
  const newTx = e?.detail;

  if (!newTx) {
    console.warn('[TransactionHistory] transaction_update received but no detail');
    return;
  }

  console.log('[TransactionHistory] New transaction received via WS', newTx);

  // Normalize the transaction format
  const normalizedTx = {
    id: newTx.id || newTx.reference || `ws-${Date.now()}`,
    reference: newTx.reference || newTx.id,
    type: newTx.type || (newTx.amount > 0 ? 'credit' : 'debit'),
    amount: Math.abs(Number(newTx.amount || 0)),
    description: newTx.description || newTx.narration || 'Transaction',
    time: newTx.time || newTx.created_at || new Date().toISOString(),
    status: newTx.status || 'SUCCESS',
    provider: newTx.provider,
    phone: newTx.phone
  };

  // ✅ Add to state even if modal is closed (keeps preload fresh)
  state.items.unshift(normalizedTx);
  console.log('[TransactionHistory] Transaction added to state (total:', state.items.length, ')');

  // ✅ Only re-render if modal is currently open
  if (state.open) {
    console.log('[TransactionHistory] Modal is open → re-rendering with new transaction');
    applyTransformsAndRender();
    
    // Scroll to top to show the new transaction
    historyList.scrollTop = 0;
  } else {
    console.log('[TransactionHistory] Modal closed → transaction stored for next open');
  }
});

// ────────────────────────────────────────────────
// REAL-TIME TRANSACTIONS SUBSCRIPTION – WALLET-STYLE (PROVEN)
// ────────────────────────────────────────────────

let txRealtimeChannel = null;
let txIsSubscribing = false;
let txRetryTimer = null;
let lastTxHealthy = 0;
let realtimeFailedCount = 0;

const TX_RETRY_MS = 15000;
const TX_HEALTHY_THRESHOLD = 5000;

async function subscribeToTransactions(force = false) {
  const now = Date.now();
  console.log(`[Tx Realtime] subscribeToTransactions called | force=${force} | ts=${now}`);

  if (txIsSubscribing) {
    console.debug('[Tx Realtime] Already subscribing — skip');
    return;
  }

  if (!force && now - lastTxHealthy < TX_HEALTHY_THRESHOLD) {
    console.debug('[Tx Realtime] Recently healthy — skip');
    return;
  }

  txIsSubscribing = true;

  try {
    // 1. Get UID (same sources as wallet)
    let uid =
      window.__USER_UID ||
      localStorage.getItem('userId') ||
      JSON.parse(localStorage.getItem('userData') || '{}')?.uid ||
      (await getSession())?.user?.uid ||
      null;

    console.log('[Tx Realtime DEBUG] UID sources:', {
      __USER_UID: window.__USER_UID,
      local_userId: localStorage.getItem('userId'),
      local_userData: JSON.parse(localStorage.getItem('userData') || '{}')?.uid,
      getSession: (await getSession())?.user?.uid,
      final: uid
    });

    if (!uid || !uid.includes('-')) {
      console.error('[Tx Realtime] INVALID UID — aborting', uid);
      return;
    }

    console.log('[Tx Realtime] Using UID:', uid);



    // REPLACE JWT FETCH SECTION WITH:
    console.log('[Tx Realtime] Fetching JWT...');
    const token = await getSharedJWT(force); // force refresh if force=true

    if (!token) {
      console.error('[Tx Realtime] Failed to get JWT');
      scheduleTxRetry();
      return;
    }

    console.log('[Tx Realtime] JWT acquired (length):', token.length);



    // 3. Create temp client (same as wallet – no global headers)
    const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { 
        autoRefreshToken: false, 
        persistSession: false, 
        storageKey: 'flexgig_tx_private_jwt_v1'
      }
    });
    console.log('[Tx Realtime] Temp client created');

    // 4. Set session with fresh JWT (THIS FIXES THE RACE CONDITION)
    console.log('[Tx Realtime] Setting session with JWT...');
    const { data: sessionData, error: sessionError } = await tempClient.auth.setSession({
      access_token: token,
      refresh_token: token
    });

    if (sessionError) {
      console.error('[Tx Realtime] setSession FAILED:', sessionError.message);
      scheduleTxRetry();
      return;
    }

    console.log('[Tx Realtime] ✅ Session set successfully');
    console.log('[Tx Realtime] Session user ID:', sessionData.user?.id);

    // 5. Quick visibility test (like wallet)
    console.log('[Tx Realtime] Testing SELECT visibility...');
    const { data: testRow, error: testErr } = await tempClient
      .from('transactions')
      .select('id, user_id, reference')
      .eq('user_id', uid)
      .limit(1);

    if (testErr) {
      console.error('[Tx Realtime] SELECT TEST FAILED (likely RLS):', testErr.message);
    } else {
      console.log('[Tx Realtime] SELECT TEST OK — can see rows');
    }

    // 6. Create & subscribe channel
    const channelName = `tx:${uid}`;
    txRealtimeChannel = tempClient.channel(channelName);
    console.log('[Tx Realtime] Channel created:', channelName);

    txRealtimeChannel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${uid}`   // ← using user_id as confirmed
        },
        (payload) => {
  console.log('[Tx Realtime] 🔔 EVENT RECEIVED:', payload.eventType);

  if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;

  const raw = payload.new;

  let normalized = {
    id: raw.id || raw.reference || `rt-${Date.now()}`,
    reference: raw.reference || raw.id,
    type: raw.type || (Number(raw.amount || 0) > 0 ? 'credit' : 'debit'),
    amount: Math.abs(Number(raw.amount || 0)),
    description: (raw.description || raw.narration || 'Transaction').trim(),
    time: raw.created_at || raw.date || new Date().toISOString(),
    status: (raw.status || 'SUCCESS').toUpperCase(),
    provider: raw.provider?.toUpperCase() || '',
    phone: raw.phone
  };

  const txId = normalized.id;

  // Special refund handling (force credit + fixed description)
  if (normalized.status.toLowerCase().includes('refund') || normalized.status.toLowerCase() === 'refunded') {
    normalized.type = 'credit';
    normalized.description = 'Refund for Failed Data';
    console.log('[Tx Realtime] Refund → forced credit + fixed desc');
  }

  const existingIndex = state.items.findIndex(t => t.id === txId);

  if (existingIndex !== -1) {
    // UPDATE: keep most fields, but upgrade description on final status
    const existingTx = state.items[existingIndex];
    console.log('[Tx Realtime] Updating tx:', txId, 'new status:', normalized.status);

    let finalDescription = existingTx.description;

    // Upgrade description only when moving from pending to final (success/failed)
    const oldStatus = existingTx.status.toLowerCase();
    const newStatus = normalized.status.toLowerCase();

    if ((oldStatus.includes('pending') || oldStatus.includes('processing')) &&
        (newStatus === 'success' || newStatus === 'failed')) {

      // Reconstruct clean final description
      const bundleMatch = existingTx.description.match(/\d+\.?\d* ?(?:GB|MB|Days?|hrs?)/gi);
      const bundle = bundleMatch ? bundleMatch[0] : '';
      const network = existingTx.provider?.toUpperCase() || 
                      existingTx.description.match(/mtn|airtel|glo|9mobile/i)?.[0]?.toUpperCase() || '';

      if (bundle) {
        finalDescription = network 
          ? `${network} ${bundle} Data Purchase`
          : `${bundle} Data Purchase`;
        console.log('[Tx Realtime] Upgraded description to final:', finalDescription);
      }
    }

    state.items[existingIndex] = {
      ...existingTx,
      status: normalized.status,
      description: finalDescription,     // controlled upgrade
      type: normalized.type,             // allow refund to force credit
    };

    if (state.open) {
      applyTransformsAndRender();
    }
    renderDashboardRecent();
  } else if (payload.eventType === 'INSERT') {
    console.log('[Tx Realtime] Adding new tx:', normalized.reference);
    state.items.unshift(normalized);

    if (state.open) {
      applyTransformsAndRender();
      historyList.scrollTop = 0;
    }
  }

  window.dispatchEvent(new CustomEvent('transaction_update', { detail: normalized }));
}
      )
            .subscribe((status, err) => {
        console.log('[Tx Realtime] SUBSCRIBE STATUS:', status);
        if (err) console.error('[Tx Realtime] SUBSCRIBE ERROR:', err?.message || err);

        if (status === 'SUBSCRIBED') {
          console.log('[Tx Realtime] ✅ SUBSCRIBED & LISTENING');
          lastTxHealthy = Date.now();
          realtimeFailedCount = 0;          // Reset failure count on success
          if (txRetryTimer) clearTimeout(txRetryTimer);
        } 
        else if (['CLOSED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) {
          realtimeFailedCount++;
          console.warn('[Tx Realtime] Channel failed - attempt:', realtimeFailedCount);

          if (realtimeFailedCount >= 3 && state.open) {
            console.warn('[Tx Realtime] Max failures reached → falling back to API');
            loadLatestHistoryAsFallback();   // ← This is where you add the fallback
          } else {
            scheduleTxRetry();
          }
        }
      });

    window.__txRealtimeChannel = txRealtimeChannel;

  } catch (err) {
    console.error('[Tx Realtime] CRASH:', err);
    scheduleTxRetry();
  } finally {
    txIsSubscribing = false;
  }
}

function scheduleTxRetry() {
  if (txRetryTimer) return;
  txRetryTimer = setTimeout(() => {
    txRetryTimer = null;
    subscribeToTransactions(true);
  }, TX_RETRY_MS);
}

// Expose globally
window.subscribeToTransactions = subscribeToTransactions;

// Call it early (will skip if no uid/session)
subscribeToTransactions();



  /* -------------------------- INITIALIZATION -------------------------- */

  showStateUI();
  updateMonthDisplay();
  console.log('[TransactionHistory] READY - Controlled by ModalManager');



  function trunTx() {
    const rows = document.querySelectorAll('.tx-row');

    rows.forEach(row => {
      const desc = row.querySelector('.tx-desc');
      if (!desc) return;

      if (!desc.dataset.fullText) {
        desc.dataset.fullText = desc.textContent;
      }

      let fullText = desc.dataset.fullText;
      let maxChars = 25;

      const width = window.innerWidth;

      if (width >= 640 && width < 1024) {
        maxChars = 30;
      } else if (width >= 1024) {
        maxChars = 40;
      }

      if (fullText.length > maxChars) {
        desc.textContent = fullText.slice(0, maxChars) + '…';
      } else {
        desc.textContent = fullText;
      }
    }); 
  }
  window.trunTx = window.trunTx || trunTx;

  window.trunTx();
  window.addEventListener('resize', window.trunTx);

  

 // ────────────────────────────────────────────────
  // DASHBOARD – 10 MOST RECENT TRANSACTIONS + TOTALS
  // ────────────────────────────────────────────────

  function renderDashboardRecent() {
    const listEl   = document.getElementById('dbRecentTransactionsHolder');  // ← CHANGED
    const emptyEl  = document.getElementById('dbNoRecentActivity');

    // ✅ CRITICAL: Exit safely if elements don't exist (not on dashboard page)
    if (!listEl) {
      console.log('[Dashboard] dashboardRecentTxList not found - skipping render');
      return;
    }

    listEl.innerHTML = '';

    if (state.items.length === 0) {
      emptyEl?.classList.remove('hidden');
      updateDashboardTotals(0, 0, 0);
      return;
    }

    emptyEl?.classList.add('hidden');

    // Take newest 10
    const recent10 = state.items.slice(0, 10);

    const fragment = document.createDocumentFragment();

    recent10.forEach(tx => {
      const node = makeTxNode(tx);

      // Make it more compact for dashboard
      const timeEl = node.querySelector('.tx-time');
      if (timeEl) timeEl.style.fontSize = '12px';

      const descEl = node.querySelector('.tx-desc');
      if (descEl) descEl.style.fontSize = '14px';

      const amountEl = node.querySelector('.tx-amount');
      if (amountEl) amountEl.style.fontSize = '15px';

      // Keep click to show receipt
      node.addEventListener('click', (e) => {
        e.preventDefault();
        showTransactionReceipt(tx);
      });

      fragment.appendChild(node);
    });

    listEl.appendChild(fragment);

    // Compute totals from ALL items (not just 10)
    let totalIn    = 0;
    let totalOut   = 0;
    let totalCount = state.items.length;

    state.items.forEach(tx => {
      const amt = Math.abs(Number(tx.amount) || 0);
      if (tx.type === 'credit') totalIn  += amt;
      else                     totalOut += amt;
    });

    updateDashboardTotals(totalIn, totalOut, totalCount);
  }

  // REAL-TIME DASHBOARD SUBSCRIPTION (SEPARATE FROM HISTORY)
  

  let userRealtimeChannel = null;
let userIsSubscribing = false;
let userRetryTimer = null;
let lastUserHealthy = 0;
let userRealtimeFailedCount = 0;

const USER_RETRY_MS = 15000;
const USER_HEALTHY_THRESHOLD = 5000;

async function subscribeToUserRealtime(force = false) {
  const now = Date.now();
  console.log(`[User Realtime] subscribe called | force=${force} | ts=${now}`);

  if (userIsSubscribing) {
    console.debug('[User Realtime] Already subscribing — skip');
    return;
  }

  if (!force && now - lastUserHealthy < USER_HEALTHY_THRESHOLD) {
    console.debug('[User Realtime] Recently healthy — skip');
    return;
  }

  userIsSubscribing = true;

  try {
    // 1️⃣ Resolve UID (same sources as tx realtime)
    let uid =
      window.__USER_UID ||
      localStorage.getItem('userId') ||
      JSON.parse(localStorage.getItem('userData') || '{}')?.uid ||
      (await getSession())?.user?.uid ||
      null;

    console.log('[User Realtime DEBUG] UID resolved:', uid);

    if (!uid || !uid.includes('-')) {
      console.error('[User Realtime] INVALID UID — aborting', uid);
      return;
    }

    // 2️⃣ Get shared JWT
    console.log('[User Realtime] Fetching JWT...');
    const token = await getSharedJWT(force);

    if (!token) {
      console.error('[User Realtime] Failed to get JWT');
      scheduleUserRetry();
      return;
    }

    // 3️⃣ Temp client (no global auth bleed)
    const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        storageKey: 'flexgig_user_private_jwt_v1'
      }
    });

    // 4️⃣ Set session (critical)
    const { error: sessionError } = await tempClient.auth.setSession({
      access_token: token,
      refresh_token: token
    });

    if (sessionError) {
      console.error('[User Realtime] setSession FAILED:', sessionError.message);
      scheduleUserRetry();
      return;
    }

    console.log('[User Realtime] ✅ Session set');

    // 5️⃣ Visibility test (RLS sanity check)
    const { error: testErr } = await tempClient
      .from('users')
      .select('id')
      .eq('id', uid)
      .limit(1);

    if (testErr) {
      console.error('[User Realtime] SELECT TEST FAILED:', testErr.message);
    } else {
      console.log('[User Realtime] SELECT TEST OK');
    }

    // 6️⃣ Subscribe
    const channelName = `user:${uid}`;
    userRealtimeChannel = tempClient.channel(channelName);

    console.log('[User Realtime] Channel created:', channelName);

    userRealtimeChannel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${uid}`
        },
        (payload) => {
          console.log('[User Realtime] 🔔 UPDATE RECEIVED');

          const raw = payload.new;
          if (!raw) return;

          // 🔄 Normalize + persist
          const allTimeIn = Number(raw.all_time_in || 0);
          const allTimeOut = Number(raw.all_time_out || 0);
          const totalTxCount = Number(raw.total_data_tx_count || 0);

          localStorage.setItem('allTimeIn', allTimeIn);
          localStorage.setItem('allTimeOut', allTimeOut);
          localStorage.setItem('totalDataTxCount', totalTxCount);

          console.log('[User Realtime] Storage updated:', {
            allTimeIn,
            allTimeOut,
            totalTxCount
          });

          // 🖥️ Update dashboard instantly
          updateDashboardTotals();

          window.dispatchEvent(
            new CustomEvent('user_totals_update', {
              detail: { allTimeIn, allTimeOut, totalTxCount }
            })
          );
        }
      )
      .subscribe((status, err) => {
        console.log('[User Realtime] SUBSCRIBE STATUS:', status);

        if (err) {
          console.error('[User Realtime] SUBSCRIBE ERROR:', err.message || err);
        }

        if (status === 'SUBSCRIBED') {
          console.log('[User Realtime] ✅ SUBSCRIBED & LISTENING');
          lastUserHealthy = Date.now();
          userRealtimeFailedCount = 0;
          if (userRetryTimer) clearTimeout(userRetryTimer);
        } else if (['CLOSED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) {
          userRealtimeFailedCount++;
          console.warn('[User Realtime] Channel failed:', userRealtimeFailedCount);

          if (userRealtimeFailedCount >= 3) {
            console.warn('[User Realtime] Max failures → fallback refresh');
            refreshUserTotalsFromAPI?.();
          } else {
            scheduleUserRetry();
          }
        }
      });

    window.__userRealtimeChannel = userRealtimeChannel;

  } catch (err) {
    console.error('[User Realtime] CRASH:', err);
    scheduleUserRetry();
  } finally {
    userIsSubscribing = false;
  }
}

function scheduleUserRetry() {
  if (userRetryTimer) return;

  userRetryTimer = setTimeout(() => {
    userRetryTimer = null;
    subscribeToUserRealtime(true);
  }, USER_RETRY_MS);
}
window.subscribeToUserRealtime = subscribeToUserRealtime;


  function updateDashboardTotals() {
  const fmt = (n) =>
    '₦' + Number(n).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  // 🔹 Read from localStorage
  const allTimeIn = Number(localStorage.getItem('allTimeIn')) || 0;
  const allTimeOut = Number(localStorage.getItem('allTimeOut')) || 0;
  const totalTxCount = Number(localStorage.getItem('totalDataTxCount')) || 0;

  // 🔹 Elements
  const totalFundedEl = document.getElementById('dbTotalFundedDisplay');
  const totalSpentEl = document.getElementById('dbTotalSpentDisplay');
  const totalTxCountEl = document.getElementById('dbTotalTxCountDisplay');

  // 🔹 Update UI
  if (totalFundedEl) totalFundedEl.textContent = fmt(allTimeIn);
  if (totalSpentEl) totalSpentEl.textContent = fmt(allTimeOut);
  if (totalTxCountEl)
    totalTxCountEl.textContent = totalTxCount.toLocaleString('en-NG');
}

  // ✅ CRITICAL: Only call if we're on the dashboard page
  function initDashboard() {
    if (document.getElementById('dashboardRecentTxList')) {
      console.log('[Dashboard] Initializing dashboard view');
      renderDashboardRecent();
    } else {
      console.log('[Dashboard] Not on dashboard page - skipping initial render');
    }
  }

  // Run once on load (with safety check)
  initDashboard();

  // Auto-update when new transaction arrives
  document.addEventListener('transaction_update', () => {
    // Only render if we're on dashboard
    if (document.getElementById('dashboardRecentTxList')) {
      renderDashboardRecent();
    }
  });

  // Also update after full history load / filter change
  window.addEventListener('transactionHistoryUpdated', () => {
    if (document.getElementById('dashboardRecentTxList')) {
      renderDashboardRecent();
    }
  });

  // Expose for manual calls if needed
  window.renderDashboardRecent = renderDashboardRecent;
  window.initDashboard = initDashboard;
  window.resetPagination = window.resetPagination || resetPagination;


})();
