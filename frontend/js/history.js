/* transaction-history.js - SUPABASE REALTIME FIRST VERSION
   - Subscribes to Supabase realtime on init
   - No loading spinner on open (instant display from cache/realtime)
   - Falls back to API only if Supabase fails
   - Real-time updates automatically refresh UI
*/

(() => {
  'use strict';

  /* -------------------------- CONFIG -------------------------- */
  const CONFIG = {
    apiEndpoint: 'https://api.flexgig.com.ng/api/transactions',
    pageSize: 30,
    chunkRenderSize: 12,
    dateLocale: 'en-GB',
    currencySymbol: '₦',
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

  if (!modal || !panel) {
    console.error('[TransactionHistory] Modal elements not found');
    return;
  }

  /* -------------------------- CLEAR HARDCODED HTML -------------------------- */
  if (historyList) {
    historyList.innerHTML = '';
  }

  /* -------------------------- STATE -------------------------- */
  let state = {
    open: false,
    isLoading: false,
    items: [],
    grouped: [],
    searchTerm: '',
    lastRenderIndex: 0,
    realtimeSubscription: null,
    supabaseReady: false
  };

  let selectedMonth = null;

  /* -------------------------- UTILITY FUNCTIONS -------------------------- */
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
    let text = '';
    if (tx.description) text += tx.description.toLowerCase() + ' ';
    if (tx.narration) text += tx.narration.toLowerCase() + ' ';
    if (tx.provider) text += tx.provider.toLowerCase() + ' ';

    if (text.includes('opay')) return { cls: 'incoming', img: '/frontend/svg/bank.svg', alt: 'Opay' };
    if (text.includes('mtn')) return { cls: 'mtn targets', img: '/frontend/img/mtn.svg', alt: 'MTN' };
    if (text.includes('airtel')) return { cls: 'airtel targets', img: '/frontend/svg/airtel-icon.svg', alt: 'Airtel' };
    if (text.includes('glo')) return { cls: 'glo targets', img: '/frontend/svg/GLO-icon.svg', alt: 'GLO' };
    if (text.includes('9mobile') || text.includes('etisalat')) return { cls: 'nine-mobile targets', img: '/frontend/svg/9mobile-icon.svg', alt: '9Mobile' };
    if (text.includes('refund')) return { cls: 'refund incoming', img: '/frontend/svg/refund.svg', alt: 'Refund' };

    return { cls: tx.type === 'credit' ? 'incoming' : 'outgoing', img: '', alt: '' };
  }

  function groupTransactions(items) {
    const monthMap = new Map();

    items.forEach(tx => {
      const date = new Date(tx.time || tx.created_at || tx.date);
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
        txs: data.txs.sort((a, b) => new Date(b.time || b.created_at || b.date) - new Date(a.time || a.created_at || a.date))
      };
    });
  }

  function show(el) { el?.classList.remove('hidden'); }
  function hide(el) { el?.classList.add('hidden'); }

  function truncateDescription(text) {
    if (!text) return '';
    let maxChars = 25;
    const width = window.innerWidth;
    if (width >= 640 && width < 1024) maxChars = 30;
    else if (width >= 1024) maxChars = 40;
    return text.length > maxChars ? text.slice(0, maxChars) + '…' : text;
  }

  /* -------------------------- SUPABASE REALTIME FUNCTIONS -------------------------- */
  
  async function fetchFromSupabase() {
    const supabase = window.supabaseClient;
    
    if (!supabase) {
      console.warn('[TransactionHistory] Supabase client not available');
      return null;
    }

    try {
      console.log('%c[TransactionHistory] Fetching from Supabase...', 'color:cyan;font-weight:bold');

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      console.log(`%c[TransactionHistory] ✅ Got ${data.length} transactions from Supabase`, 'color:lime;font-weight:bold');
      return data;

    } catch (err) {
      console.error('[TransactionHistory] Supabase fetch failed:', err);
      return null;
    }
  }

  async function fetchFromAPI() {
    try {
      console.log('%c[TransactionHistory] Falling back to API...', 'color:orange;font-weight:bold');

      const response = await fetch(`${CONFIG.apiEndpoint}?limit=200&page=1`, {
        credentials: 'include',
        headers: window.APP_TOKEN ? { Authorization: window.APP_TOKEN } : {}
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const items = data.items || [];

      console.log(`%c[TransactionHistory] ✅ Got ${items.length} transactions from API`, 'color:lime;font-weight:bold');
      return items;

    } catch (err) {
      console.error('[TransactionHistory] API fetch failed:', err);
      return null;
    }
  }

  function normalizeTransaction(tx) {
    return {
      id: tx.id || tx.reference || `tx-${Date.now()}`,
      reference: tx.reference || tx.id,
      type: tx.type || (Number(tx.amount) > 0 ? 'credit' : 'debit'),
      amount: Math.abs(Number(tx.amount || 0)),
      description: (tx.description || tx.narration || 'Transaction').replace(/\s*\(pending\)\s*/gi, '').trim(),
      time: tx.time || tx.created_at || tx.date || new Date().toISOString(),
      status: tx.status || 'SUCCESS',
      provider: tx.provider,
      phone: tx.phone,
      category: tx.category
    };
  }

  async function loadTransactions() {
    // Try Supabase first
    let data = await fetchFromSupabase();

    // Fallback to API if Supabase fails
    if (!data || data.length === 0) {
      data = await fetchFromAPI();
    }

    // Fallback to cache if both fail
    if (!data || data.length === 0) {
      const cached = localStorage.getItem('cached_transactions');
      if (cached) {
        try {
          data = JSON.parse(cached);
          console.log('[TransactionHistory] Using cached transactions');
        } catch (e) {
          console.warn('[TransactionHistory] Failed to parse cache');
        }
      }
    }

    if (data && data.length > 0) {
      // Normalize and update state
      state.items = data.map(normalizeTransaction);

      // Save to cache
      try {
        localStorage.setItem('cached_transactions', JSON.stringify(data));
      } catch (e) {
        console.warn('[TransactionHistory] Failed to cache transactions');
      }

      applyTransformsAndRender();
      hide(emptyEl);
    } else {
      show(emptyEl);
    }

    hide(loadingEl);
  }

  function subscribeToRealtimeUpdates() {
    const supabase = window.supabaseClient;

    if (!supabase) {
      console.warn('[TransactionHistory] Supabase not available for realtime');
      setTimeout(subscribeToRealtimeUpdates, 2000); // Retry
      return;
    }

    if (state.realtimeSubscription) {
      state.realtimeSubscription.unsubscribe();
    }

    console.log('%c[TransactionHistory] 🔴 Subscribing to realtime updates...', 'color:cyan;font-weight:bold');

    state.realtimeSubscription = supabase
      .channel('transactions-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions'
        },
        (payload) => {
          console.log('%c[TransactionHistory] 🔔 Realtime change detected!', 'color:lime;font-weight:bold', payload.eventType);

          if (payload.eventType === 'INSERT' && payload.new) {
            const normalized = normalizeTransaction(payload.new);
            
            // Add to top of list (avoid duplicates)
            const exists = state.items.some(tx => tx.id === normalized.id);
            if (!exists) {
              state.items.unshift(normalized);
              console.log('[TransactionHistory] Added new transaction');
              
              // Update cache
              try {
                localStorage.setItem('cached_transactions', JSON.stringify(state.items));
              } catch (e) {}

              // Re-render if modal is open
              if (state.open) {
                applyTransformsAndRender();
                historyList.scrollTop = 0; // Scroll to top to show new transaction
              }
            }
          } 
          else if (payload.eventType === 'UPDATE' && payload.new) {
            const index = state.items.findIndex(tx => tx.id === payload.new.id);
            if (index !== -1) {
              state.items[index] = normalizeTransaction(payload.new);
              console.log('[TransactionHistory] Updated transaction');

              if (state.open) {
                applyTransformsAndRender();
              }
            }
          } 
          else if (payload.eventType === 'DELETE' && payload.old) {
            state.items = state.items.filter(tx => tx.id !== payload.old.id);
            console.log('[TransactionHistory] Deleted transaction');

            if (state.open) {
              applyTransformsAndRender();
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('%c[TransactionHistory] ✅ Realtime subscription active!', 'color:lime;font-weight:bold');
          state.supabaseReady = true;
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[TransactionHistory] ❌ Realtime subscription error');
        }
      });

    window.transactionRealtimeSubscription = state.realtimeSubscription;
  }

  // The rest of your rendering functions (makeTxNode, showTransactionReceipt, etc.) remain the same
  // I'll include the key rendering function:

  function makeTxNode(tx) {
    try {
      const item = document.createElement('article');
      item.className = 'tx-item';
      item.setAttribute('role', 'listitem');

      const isCredit = tx.type === 'credit';
      const icon = getTxIcon(tx);

      const rawDesc = tx.description || tx.narration || tx.type || 'Transaction';
      const truncatedDesc = truncateDescription(rawDesc);
      const amount = formatCurrency(tx.amount);
      const date = new Date(tx.time || tx.created_at);
      const formattedDateTime = date.toLocaleString('en-NG', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit'
      });

      const statusRaw = (tx.status || 'success').toString().toLowerCase().trim();
      let statusClass = 'success';
      let statusText = 'SUCCESS';

      if (statusRaw.includes('fail')) {
        statusClass = 'failed';
        statusText = 'FAILED';
      } else if (statusRaw.includes('refund')) {
        statusClass = 'refund';
        statusText = 'REFUNDED';
      } else if (statusRaw.includes('pending')) {
        statusClass = 'pending';
        statusText = 'PENDING';
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
            <div class="tx-amount ${isCredit ? 'credit' : 'debit'}" title="${amount}">
              ${isCredit ? '+' : '-'} ${amount}
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
        if (window.showTransactionReceipt) {
          window.showTransactionReceipt(tx);
        }
      });

      return item;

    } catch (err) {
      console.error('Error rendering transaction:', err, tx);
      const fallback = document.createElement('div');
      fallback.className = 'tx-item';
      fallback.textContent = 'Could not render transaction';
      return fallback;
    }
  }

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
      border-top-left-radius: 10px;
      border-top-right-radius: 10px;
    `;
    
    container.innerHTML = `
      <div class="opay-month-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #1e1e1e; gap: 12px;">
        <div class="opay-month-selector" style="display: inline-flex; align-items: center; gap: 6px; font-size: 16px; font-weight: 600; color: white; cursor: pointer;">
          <span>${month.prettyMonth}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
      </div>
      
      <div class="opay-summary" style="display: flex; justify-content: space-between; padding: 12px; background: #1e1e1e; font-size: 14px; color: #999; gap: 16px;">
        <div>In: <strong style="color: white; font-weight: 600; margin-left: 4px;">${formatCurrency(month.totalIn)}</strong></div>
        <div>Out: <strong style="color: white; font-weight: 600; margin-left: 4px;">${formatCurrency(month.totalOut)}</strong></div>
      </div>
    `;
    
    return container;
  }

  function renderChunked(groupedMonths) {
    historyList.innerHTML = '';
    state.lastRenderIndex = 0;

    const flat = [];

    groupedMonths.forEach(month => {
      flat.push({ type: 'month-divider', month });

      if (month.txs.length > 0) {
        month.txs.forEach(tx => flat.push({ type: 'tx', tx }));
      } else {
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
          const noTxEl = document.createElement('div');
          noTxEl.className = 'no-transactions-placeholder';
          noTxEl.style.cssText = `padding: 40px 20px; text-align: center; color: #999; font-size: 15px;`;
          noTxEl.textContent = `No transactions in ${entry.month.prettyMonth}`;
          fragment.appendChild(noTxEl);
        }
      }

      historyList.appendChild(fragment);
      state.lastRenderIndex = end;

      if (end < flat.length) {
        requestAnimationFrame(renderNextChunk);
      }
    }

    renderNextChunk();
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
      const { year, month } = selectedMonth;
      items = items.filter(tx => {
        const txDate = new Date(tx.time || tx.created_at);
        return txDate.getFullYear() === year && txDate.getMonth() === month;
      });
    }

    const groupedMonths = groupTransactions(items);
    state.grouped = groupedMonths;
    renderChunked(groupedMonths);

    if (items.length === 0) {
      show(emptyEl);
    } else {
      hide(emptyEl);
    }
  }

  /* -------------------------- MODAL OPEN -------------------------- */
  document.addEventListener('modalOpened', (e) => {
    if (e.detail === 'historyModal') {
      console.log('[TransactionHistory] Modal opened');
      state.open = true;
      
      // No loading spinner - just render what we have
      if (state.items.length > 0) {
        applyTransformsAndRender();
      } else {
        // First time opening - load data
        loadTransactions();
      }
    }
  });

  /* -------------------------- INITIALIZE -------------------------- */
  console.log('[TransactionHistory] Initializing with Supabase Realtime...');

  // Subscribe to realtime immediately
  subscribeToRealtimeUpdates();

  // Load initial data (Supabase → API → Cache)
  loadTransactions();

  // Listen for legacy transaction_update events (from WebSocket)
  document.addEventListener('transaction_update', (e) => {
    const newTx = e?.detail;
    if (!newTx) return;

    const normalized = normalizeTransaction(newTx);
    const exists = state.items.some(tx => tx.id === normalized.id);
    
    if (!exists) {
      state.items.unshift(normalized);
      if (state.open) {
        applyTransformsAndRender();
        historyList.scrollTop = 0;
      }
    }
  });

  window.TransactionHistory = {
    reload: loadTransactions,
    getAll: () => state.items.slice()
  };

  console.log('%c[TransactionHistory] ✅ Ready with Realtime!', 'color:lime;font-weight:bold');

})();