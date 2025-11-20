// ============= YOUR CLEANED UP history.js SHOULD LOOK LIKE THIS =============

// ✅ KEEP THIS - Your original history.js WITHOUT the duplicate active state code
(() => {
  const modal = document.getElementById('historyModal');
  if (!modal) return;

  const listEl = document.getElementById('historyList');
  const loadingEl = document.getElementById('historyLoading');
  const emptyEl = document.getElementById('historyEmpty');
  const errorEl = document.getElementById('historyError');

  let historyFetched = false;

  const fmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format;

  const getIconType = (desc, type, amount) => {
    if (desc?.includes('Targets Deposit')) return 'targets';
    if (desc?.includes('Interest Earned')) return 'interest';
    if (desc?.includes('Electronic Money Transfer Levy')) return 'levy';
    return amount >= 0 ? 'incoming' : 'outgoing';
  };

  const getInitials = (text) => {
    return text ? text.trim().split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase() : 'TX';
  };

  const renderTx = (tx) => {
    const div = document.createElement('div');
    div.className = 'tx-item';

    const isCredit = Number(tx.amount) >= 0;
    const iconType = getIconType(tx.description, tx.type, tx.amount);
    const arrow = isCredit ? '↓' : '↑';
    const initials = getInitials(tx.description || tx.type);

    div.innerHTML = `
      <div class="tx-icon ${iconType}">${arrow}</div>
      <div class="tx-content">
        <div class="tx-desc">${tx.description || tx.type || 'Transaction'}</div>
        <div class="tx-time">${new Date(tx.created_at).toLocaleString('en-NG', {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        })}</div>
        ${tx.status ? `<div class="tx-status">${tx.status}</div>` : ''}
      </div>
      <div class="tx-amount ${isCredit ? 'credit' : 'debit'}">
        ${isCredit ? '+' : '-'}₦${Math.abs(tx.amount).toLocaleString('en-NG', {minimumFractionDigits: 2})}
      </div>
    `;
    return div;
  };

  const fetchAndRender = async () => {
    if (historyFetched) return;
    historyFetched = true;

    loadingEl.classList.remove('hidden');
    listEl.innerHTML = '';
    emptyEl.classList.add('hidden');
    errorEl.classList.add('hidden');

    try {
      const res = await fetch('/api/user/transactions', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) throw new Error('Failed');

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        emptyEl.classList.remove('hidden');
        return;
      }

      // Sort newest first
      data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      data.forEach(tx => listEl.appendChild(renderTx(tx)));

    } catch (err) {
      console.error(err);
      errorEl.classList.remove('hidden');
    } finally {
      loadingEl.classList.add('hidden');
    }
  };

  // ✅ KEEP THESE - Simple open/close without active state management
  const open = () => {
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('open'), 10);
    fetchAndRender();
  };

  const close = () => {
    modal.classList.remove('open');
    setTimeout(() => modal.classList.add('hidden'), 350);
  };

  // Events
  document.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', close));
  
  // ✅ KEEP THIS - Let modal manager handle the opening
  document.getElementById('historyNavLink')?.addEventListener('click', e => {
    e.preventDefault(); 
    open();
  });

  // Download placeholder
  document.getElementById('downloadHistory')?.addEventListener('click', () => {
    alert('Download feature coming soon!');
  });

  // Expose
  window.historyModal = { open, close, refresh: fetchAndRender };
})();