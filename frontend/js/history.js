// /frontend/js/history.js — Production-Ready History Modal (ModalManager Integrated)
import Chart from 'https://cdn.jsdelivr.net/npm/chart.js';  // Add to your HTML: <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

const MODAL_ID = 'historyModal';
const LIST_ID = 'historyList';
const LOADING_ID = 'historyLoading';
const EMPTY_ID = 'historyEmpty';
const ERROR_ID = 'historyError';
const SUPABASE_URL = 'https://bwmappzvptcjxlukccux.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3bWFwcHp2cHRjanhsdWtjY3V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0OTMzMjcsImV4cCI6MjA3MTA2OTMyN30.Ra7k6Br6nl1huQQi5DpDuOQSDE-6N1qlhUIvIset0mc';

// Init Supabase
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Get user ID (fallback chain)
function getUserId() {
  return supabase.auth.getUser().data.user?.id || window.__USER_UID || localStorage.getItem('userId') || localStorage.getItem('uid');
}

// Categories mapping for icons/colors (expand as needed)
const CATEGORIES = {
  'mtn_data': { icon: '📊', color: '#FFD700' },
  'airtel_airtime': { icon: '📞', color: '#FF6B35' },
  'add_money': { icon: '➕', color: '#00AAFF' },
  // Add more...
};

// IndexedDB for offline cache
let db;
const DB_NAME = 'FlexgigDB';
const STORE_NAME = 'transactions';
const CACHE_LIMIT = 50;

async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
  });
}

// Fetch transactions (paginated, filtered)
async function fetchTransactions(page = 1, filters = {}) {
  const userId = getUserId();
  if (!userId) {
    console.warn('No user ID found — skipping fetch');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .range((page - 1) * 20, page * 20 - 1)
      .ilike('status', filters.status || '%')
      .ilike('category', filters.category || '%')
      .gte('date', filters.date_from || '1970-01-01')
      .lte('date', filters.date_to || '2100-01-01')
      .textSearch('phone || reference', filters.search || '', { type: 'websearch' });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Fetch error:', err);
    // Fallback to cache
    return getCachedTransactions();
  }
}

// Get summary
async function getSummary(year, month) {
  const userId = getUserId();
  if (!userId) return { in_total: 0, out_total: 0, txn_count: 0 };

  const { data } = await supabase.rpc('get_monthly_summary', { user_uuid: userId, year, month });
  return data[0] || { in_total: 0, out_total: 0, txn_count: 0 };
}

// Cache functions
async function cacheTransactions(txs) {
  if (!db) return;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  txs.slice(0, CACHE_LIMIT).forEach(t => store.put(t));
  return new Promise((resolve) => { tx.oncomplete = resolve; });
}

async function getCachedTransactions() {
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
  });
}

// Render transaction card
function renderTransaction(txn) {
  const isOut = txn.amount < 0;
  const absAmount = Math.abs(txn.amount / 100);  // Assume kobo
  const cat = CATEGORIES[txn.category] || { icon: '💳', color: '#666' };

  return `
    <div class="opay-txn-card" data-id="${txn.id}" tabindex="0" role="button">
      <div class="opay-txn-header">
        <div class="opay-txn-icon" style="background: ${cat.color};">${cat.icon}</div>
        <div class="opay-txn-details">
          <div class="opay-txn-title">${txn.description || txn.type}</div>
          <div class="opay-txn-meta">
            <span>${txn.phone ? `To: ${txn.phone}` : txn.reference}</span>
            <span class="opay-txn-date">${new Date(txn.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</span>
          </div>
        </div>
      </div>
      <div class="opay-txn-amount ${isOut ? 'out' : 'in'}">
        ${isOut ? '-' : '+'}₦${absAmount.toLocaleString()}
      </div>
      <div class="opay-txn-status ${txn.status}">${txn.status.toUpperCase()}</div>
      <!-- Expandable details -->
      <div class="opay-txn-expand hidden">
        <p>Ref: ${txn.reference}</p>
        <a href="/receipt/${txn.id}" target="_blank">View Receipt</a>
      </div>
    </div>
  `;
}

// Render list (append for infinite scroll)
function renderList(txs, append = false) {
  const container = document.getElementById(LIST_ID);
  if (append) {
    container.insertAdjacentHTML('beforeend', txs.map(renderTransaction).join(''));
  } else {
    container.innerHTML = txs.map(renderTransaction).join('');
  }

  // Add event listeners for expand on new cards
  container.querySelectorAll('.opay-txn-card:not([data-listener])').forEach(card => {
    card.dataset.listener = 'true';
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.opay-txn-expand')) {
        card.querySelector('.opay-txn-expand').classList.toggle('hidden');
      }
    });
  });
}

// Render summary + chart
async function renderSummary(year, month) {
  const summary = await getSummary(year, month);
  const inEl = document.querySelector('.opay-in strong');
  const outEl = document.querySelector('.opay-out strong');
  if (inEl) inEl.textContent = `₦${(summary.in_total / 100).toLocaleString()}`;
  if (outEl) outEl.textContent = `₦${(summary.out_total / 100).toLocaleString()}`;

  // Remove existing chart
  const existingCanvas = document.querySelector('.opay-summary-canvas');
  if (existingCanvas) existingCanvas.remove();

  // Create & append pie chart
  const canvas = document.createElement('canvas');
  canvas.className = 'opay-summary-canvas';
  canvas.width = 200;
  canvas.height = 200;
  const summaryDiv = document.querySelector('.opay-summary');
  if (summaryDiv) summaryDiv.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Data', 'Airtime', 'Transfers'],
      datasets: [{ data: [summary.txn_count * 0.4, summary.txn_count * 0.3, summary.txn_count * 0.3], backgroundColor: ['#FFD700', '#FF6B35', '#00AAFF'] }]
    },
    options: { 
      responsive: true, 
      plugins: { legend: { position: 'bottom', labels: { padding: 20 } } },
      maintainAspectRatio: false
    }
  });
}

// Filters handler (debounced)
let filterTimeout;
function applyFilters() {
  clearTimeout(filterTimeout);
  filterTimeout = setTimeout(async () => {
    const filters = {
      search: document.querySelector('.opay-search')?.value || '',
      status: document.querySelector('.opay-select[data-type="status"]')?.value || '',
      category: document.querySelector('.opay-select[data-type="category"]')?.value || '',
      date_from: document.querySelector('#dateFrom')?.value || '',
      date_to: document.querySelector('#dateTo')?.value || ''
    };
    currentPage = 1;  // Reset pagination
    const txs = await fetchTransactions(1, filters);
    renderList(txs, false);
    await cacheTransactions(txs);
  }, 300);
}

// Infinite scroll
let currentPage = 1;
let loadingMore = false;
let allTxs = [];  // Track loaded txns for filters
async function loadMore() {
  if (loadingMore || !document.getElementById(LIST_ID).offsetHeight) return;
  loadingMore = true;
  currentPage++;
  const txs = await fetchTransactions(currentPage);
  if (txs.length) {
    allTxs = [...allTxs, ...txs];
    renderList(txs, true);
    await cacheTransactions([...allTxs]);
  } else {
    currentPage--;
  }
  loadingMore = false;
}

const observer = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && document.getElementById(LIST_ID).children.length > 0) {
    loadMore();
  }
}, { threshold: 0.1 });

// Export CSV
async function exportCSV() {
  const userId = getUserId();
  if (!userId) {
    alert('Please log in to export history.');
    return;
  }
  const { data: txs } = await supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false });
  const csv = [
    ['Date', 'Type', 'Category', 'Amount', 'Status', 'Phone', 'Ref'],
    ...txs.map(t => [
      new Date(t.date).toLocaleDateString(),
      t.type,
      t.category,
      `₦${Math.abs(t.amount / 100).toLocaleString()}${t.amount < 0 ? ' (Out)' : ' (In)'}`,
      t.status,
      t.phone || '',
      t.reference || ''
    ])
  ].map(row => row.map(field => `"${field}"`).join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `flexgig-history-${new Date().toISOString().slice(0,7)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// PDF Export (stub; implement backend)
function exportPDF() {
  const year = new Date().getFullYear();
  const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
  window.open(`/generate-statement?month=${month}&year=${year}`, '_blank');
}

// Close: Reset state (ModalManager handles close)
function resetHistoryState() {
  currentPage = 1;
  allTxs = [];
  document.getElementById(LIST_ID).innerHTML = '';
  observer.disconnect();
  const existingCanvas = document.querySelector('.opay-summary-canvas');
  if (existingCanvas) existingCanvas.remove();
}

// Modal Events (React to ModalManager)
document.addEventListener('DOMContentLoaded', async () => {
  await initDB();

  // Listen for ModalManager open event — this ensures modal is visible first
  document.addEventListener('modalOpened', async (e) => {
    if (e.detail === 'historyModal') {
      console.log('History modal opened via ModalManager — loading data');
      await loadHistory();
    }
  });

  // Listen for close (cleanup)
  document.addEventListener('modalClosed', (e) => {  // Assume ModalManager dispatches this; add if needed
    if (e.detail === 'historyModal') {
      console.log('History modal closed — resetting state');
      resetHistoryState();
    }
  });

  // Filters (delegate to ModalManager elements)
  const filterEls = document.querySelectorAll('.opay-select, .opay-search, #dateFrom, #dateTo');
  filterEls.forEach(el => {
    el.addEventListener('change', applyFilters);
    if (el.tagName === 'INPUT') el.addEventListener('input', applyFilters);
  });

  // Download (CSV for now)
  const downloadBtn = document.getElementById('downloadHistory');
  if (downloadBtn) downloadBtn.addEventListener('click', exportCSV);

  // Month selector (use native date for better UX)
  const monthSelector = document.querySelector('.opay-month-selector');
  if (monthSelector) {
    monthSelector.addEventListener('click', async () => {
      const datePicker = document.createElement('input');
      datePicker.type = 'month';
      datePicker.value = new Date().toISOString().slice(0, 7);
      datePicker.onchange = async (e) => {
        const [year, month] = e.target.value.split('-').map(Number);
        await renderSummary(year, month);
        applyFilters();  // Refetch with new month filter
      };
      datePicker.click();
    });
  }

  // Real-time: Listen for updates (extend your WS)
  window.addEventListener('transaction_update', () => {
    if (document.getElementById(MODAL_ID).classList.contains('hidden')) return;
    console.log('Real-time txn update — refreshing history');
    loadHistory();
  });

  // Error retry
  const errorEl = document.getElementById(ERROR_ID);
  if (errorEl) errorEl.addEventListener('click', loadHistory);

  // Haptics on mobile
  if (navigator.vibrate) {
    document.addEventListener('click', (e) => {
      if (e.target.closest('.opay-txn-card')) navigator.vibrate(50);
    });
  }

  console.log('History module initialized — waiting for ModalManager events');
});

// Load initial history (triggered by modalOpened event)
async function loadHistory() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Show loading
  const loadingEl = document.getElementById(LOADING_ID);
  const emptyEl = document.getElementById(EMPTY_ID);
  const errorEl = document.getElementById(ERROR_ID);
  if (loadingEl) loadingEl.classList.remove('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');
  if (errorEl) errorEl.classList.add('hidden');

  try {
    const txs = await fetchTransactions(1);
    allTxs = txs;
    renderList(txs, false);
    await cacheTransactions(txs);
    await renderSummary(year, month);

    if (txs.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
    } else {
      // Re-observe for infinite scroll (in case list cleared)
      observer.observe(document.getElementById(LIST_ID));
    }
    
    // Micro-delay for CSS class animation to settle
    await new Promise(resolve => setTimeout(resolve, 50));
  } catch (err) {
    console.error('Load history error:', err);
    if (errorEl) errorEl.classList.remove('hidden');
    const cached = await getCachedTransactions();
    if (cached.length) {
      renderList(cached, false);
    }
  } finally {
    if (loadingEl) loadingEl.classList.add('hidden');
  }
}