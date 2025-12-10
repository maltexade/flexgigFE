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
const USE_FAKE_DATA = true;  // Set to false to use real API

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
    filters: {},
    searchTerm: '',
    lastRenderIndex: 0,
    cachePages: new Map(),
    fullHistoryLoaded: false,
    accurateTotalsCalculated: false,
    preloaded: false,
    preloadingInProgress: false
  };

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

  function getTxIcon(tx) {
    const desc = (tx.description || tx.narration || '').toLowerCase();
    
    if (desc.includes('opay')) return { cls: 'incoming', img: '/frontend/svg/bank.svg', alt: 'Opay' };
    if (desc.includes('mtn')) return { cls: 'mtn targets', img: '/frontend/img/mtn.svg', alt: 'MTN' };
    if (desc.includes('airtel')) return { cls: 'airtel targets', img: '/frontend/svg/airtel-icon.svg', alt: 'Airtel' };
    if (desc.includes('glo')) return { cls: 'glo targets', img: '/frontend/svg/glo-icon.svg', alt: 'GLO' };
    if (desc.includes('9mobile') || desc.includes('nine-mobile')) return { cls: 'nine-mobile targets', img: '/frontend/svg/9mobile-icon.svg', alt: '9Mobile' };
    if (desc.includes('refund')) return { cls: 'refund incoming', img: '/frontend/svg/refund.svg', alt: 'Refund' };

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

      const statusRaw = (tx.status || 'success').toString().toLowerCase();
      const statusText = (tx.status || 'success').toUpperCase();
      let statusClass = 'success';
      if (statusRaw.includes('fail') || statusRaw.includes('failed')) statusClass = 'failed';
      else if (statusRaw.includes('refund')) statusClass = 'refund';
      else if (statusRaw.includes('pending')) statusClass = 'pending';

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

  const networkInfo = (() => {
    const desc = (tx.description || '').toLowerCase();
    if (desc.includes('mtn')) return { name: 'MTN', color: '#FFC107', logo: '/frontend/img/mtn.svg' };
    if (desc.includes('airtel')) return { name: 'Airtel', color: '#E4002B', logo: '/frontend/svg/airtel-icon.svg' };
    if (desc.includes('glo')) return { name: 'GLO', color: '#6FBF48', logo: '/frontend/svg/glo-icon.svg' };
    if (desc.includes('9mobile') || desc.includes('etisalat')) return { name: '9Mobile', color: '#00A650', logo: '/frontend/svg/9mobile-icon.svg' };
    return { name: 'FlexGig', color: '#00D4AA', logo: '/frontend/svg/logo.svg' };
  })();

  const amount = formatCurrency(Math.abs(Number(tx.amount || 0)));
  const date = new Date(tx.time || tx.created_at);
  const formattedDate = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const formattedTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const recipientPhone = tx.description?.match(/\d{11}/)?.[0] || null;
  const dataBundle = tx.description?.match(/\d+\.?\d* ?GB|[\d.]+ ?Days?/gi)?.join(' ') || null;

  const statusConfig = {
    success: { text: 'Successful', color: '#00D4AA' },
    failed: { text: 'Failed', color: '#FF3B30' },
    pending: { text: 'Pending', color: '#FF9500' },
    refund: { text: 'Refunded', color: '#00D4AA' }
  };

  const statusKey = (tx.status || 'success').toLowerCase();
  const status = statusConfig[statusKey.includes('fail') ? 'failed' : statusKey.includes('refund') ? 'refund' : statusKey.includes('pending') ? 'pending' : 'success'];

  const modalHTML = `
    <div id="receiptModal" style="position:fixed;inset:0;z-index:999999;background:#000;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div class="opay-backdrop" onclick="this.parentElement.remove()" style="position:absolute;inset:0;cursor:pointer;"></div>
      
      <!-- Header -->
      <div style="background:#1e1e1e;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;position:relative;z-index:10;">
        <button onclick="this.closest('#receiptModal').remove()" style="background:none;border:none;color:#aaa;cursor:pointer;padding:8px;border-radius:50%;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h2 style="margin:0;color:white;font-size:17px;font-weight:700;letter-spacing:-0.2px;">Transaction Details</h2>
        <div style="width:40px;"></div>
      </div>

      <div style="flex:1;display:flex;flex-direction:column;background:#121212;margin-top:env(safe-area-inset-top);overflow:hidden;padding:16px;gap:30px;">
        
        <!-- Floating Logo + Amount Card -->
        <div style="background:#1e1e1e;border-radius:16px;padding:32px 24px 24px;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;margin-top:35px;">
          
          <!-- Floating Network Logo -->
          <div style="width:50px;height:50px;background:${networkInfo.color};border-radius:50%;display:flex;align-items:center;justify-content:center;position:absolute;top:-25px;left:50%;transform:translateX(-50%);box-shadow:0 6px 16px rgba(0,0,0,0.6);z-index:10;">
            ${networkInfo.logo ? `<img src="${networkInfo.logo}" style="width:28px;height:28px;object-fit:contain;image-rendering:crisp-edges;">` : ''}
          </div>

          <!-- Amount -->
          <div style="font-size:32px;font-weight:800;color:white;margin-top:32px;margin-bottom:8px;line-height:1;letter-spacing:-1px;">
            ${amount}
          </div>

          <!-- Status -->
          <div style="color:${status.color};font-size:16px;font-weight:600;display:flex;align-items:center;gap:7px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              ${statusKey.includes('fail') ? `<path d="M15 9l-6 6M9 9l6 6"/>` : 
                statusKey.includes('pending') ? `<path d="M12 8v4l3 3"/>` : 
                `<path d="M8 12l2 2 4-4"/>`}
            </svg>
            ${status.text}
          </div>
        </div>

        <!-- Transaction Details Card -->
        <div style="background:#1e1e1e;border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:12px;">
          <h3 style="margin:0 0 8px;color:#ccc;font-size:16px;font-weight:600;">Transaction Details</h3>
          
          ${recipientPhone ? `<div class="detail-row"><span>Recipient Mobile</span><strong>${recipientPhone}</strong></div>` : ''}
          ${dataBundle ? `<div class="detail-row"><span>Data Bundle</span><strong>${dataBundle}</strong></div>` : ''}
          
          <div class="detail-row">
            <span>Transaction Type</span>
            <strong>${tx.description.includes('Data') ? 'Mobile Data' : tx.description.includes('Airtime') ? 'Airtime Top-up' : tx.type === 'credit' ? 'Credit' : 'Debit'}</strong>
          </div>

          ${tx.type !== 'credit' ? `<div class="detail-row"><span>Payment Method</span><strong>Wallet Balance</strong></div>` : ''}

          <div class="detail-row" style="align-items:center;">
            <span>Transaction No.</span>
            <div style="display:flex;align-items:center;gap:10px;">
              <strong>${tx.reference || tx.id || '—'}</strong>
              <button onclick="navigator.clipboard.writeText('${tx.reference || tx.id}');this.innerHTML='Copied';setTimeout(()=>this.innerHTML=copySvg,1500)" style="background:none;border:none;color:#00d4aa;cursor:pointer;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
            </div>
          </div>

          <div class="detail-row">
            <span>Transaction Date</span>
            <strong>${formattedDate} ${formattedTime}</strong>
          </div>
        </div>

        <!-- Action Buttons -->
        <div style="display:flex;gap:12px;margin-top:auto;">
          <button onclick="reportTransactionIssue('${tx.id || tx.reference}')" 
                  style="flex:1;background:#2c2c2c;color:#00d4aa;border:1.5px solid #00d4aa;border-radius:50px;padding:14px;font-weight:600;font-size:15px;cursor:pointer;">
            Report Issue
          </button>
          <button onclick="shareReceipt(this.closest('#receiptModal'), '${tx.reference || tx.id}', '${amount}', '${tx.description}', '${formattedDate} ${formattedTime}')" 
                  style="flex:1;background:linear-gradient(90deg,#00d4aa,#00bfa5);color:white;border:none;border-radius:50px;padding:14px;font-weight:600;font-size:15px;cursor:pointer;box-shadow:0 6px 20px rgba(0,212,170,0.4);">
            Share Receipt
          </button>
        </div>
      </div>
    </div>

    <style>
      #receiptModal * { -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; text-rendering:optimizeLegibility; box-sizing:border-box; }
      .detail-row { display:flex; justify-content:space-between; align-items:center; color:#e0e0e0; font-size:13px; }
      .detail-row span { color:#aaa; font-weight:500; }
      .detail-row strong { color:white; font-weight:600; }
    </style>

    <script>
      const copySvg = \`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>\`;
    </script>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function reportTransactionIssue(txId) {
  alert(`Report issue for transaction ${txId}\n\nThis will open support chat in production`);
  // Later: open WhatsApp, email, or in-app support
  document.getElementById('receiptModal')?.remove();
}

function shareReceipt(modalEl, ref, amount, desc, date) {
  const text = `FlexGig Transaction Receipt\n\nAmount: ${amount}\nDescription: ${desc}\nReference: ${ref}\nDate: ${date}\n\nPowered by FlexGig`;
  
  if (navigator.share) {
    navigator.share({ title: 'Transaction Receipt', text });
  } else {
    navigator.clipboard.writeText(text);
    alert('Receipt copied to clipboard!');
  }
  
  modalEl.remove();
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

  /* -------------------------- PRELOAD FULL HISTORY -------------------------- */
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
  console.log('[TransactionHistory] Preloading full history...');

  let allTx = [];
  
  // USE FAKE DATA FOR TESTING
  if (USE_FAKE_DATA) {
    console.log('[TransactionHistory] Using FAKE data for testing');
    allTx = generateFakeTransactions();
    
    // Simulate network delay for realism
    await new Promise(resolve => setTimeout(resolve, 500));
  } else {
    // Real API call
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
  }

  state.items = USE_FAKE_DATA ? allTx : allTx.map(raw => ({
    id: raw.id || raw.reference,
    reference: raw.reference,
    type: raw.type === 'credit' ? 'credit' : 'debit',
    amount: raw.amount,
    description: raw.description || raw.narration || raw.type,
    time: raw.created_at || raw.time,
    status: raw.status || 'SUCCESS'
  }));

  state.fullHistoryLoaded = true;
  state.accurateTotalsCalculated = true;
  state.preloaded = true;
  state.done = true;
  state.preloadingInProgress = false;

  hide(loadingEl);
  console.log(`[TransactionHistory] PRELOADED ${allTx.length} transactions`);
}

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

    // In applyMonthFilterAndRender()
if (itemsToRender.length === 0) {
  // Show month header + "No transactions" message
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

    computeFilteredSummary(items);

    // In applyTransformsAndRender() — replace the final if/else
if (items.length === 0) {
  if (selectedMonth) {
    // User selected a month with no tx → show month header + empty message
    const emptyMonth = {
      monthKey: `${selectedMonth.year}-${selectedMonth.month}`,
      prettyMonth: new Date(selectedMonth.year, selectedMonth.month).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      totalIn: 0,
      totalOut: 0,
      txs: []
    };
    renderChunked([emptyMonth]);
  } else {
    // Truly no transactions ever → show global empty state
    show(emptyEl);
  }
} else {
  const groupedMonths = groupTransactions(items);
  renderChunked(groupedMonths);
  hide(emptyEl);
}
  }

  window.applyTransformsAndRender = applyTransformsAndRender;

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
    }
  });

  async function handleModalOpened() {
  state.open = true;
  
  // Set to All Time by default
  selectedMonth = null;  // Changed from specific current month
  
  show(loadingEl);
  hide(emptyEl);
  
  await preloadHistoryForInstantOpen();

  if (state.preloaded && state.items.length > 0) {
    hide(loadingEl);
    applyMonthFilterAndRender();
  } else if (state.items.length === 0) {
    hide(loadingEl);
    show(emptyEl);
  }
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

  document.addEventListener('transaction_update', () => {
    if (state.open) {
      console.log('[TransactionHistory] New transaction → refreshing history');
      window.TransactionHistory.reload();
    }
  });

  showStateUI();
  updateMonthDisplay();
  console.log('[TransactionHistory] READY - Controlled by ModalManager');

  preloadHistoryForInstantOpen();

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

})();