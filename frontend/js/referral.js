/* ===== production-ready referral modal JS =====
   Requires:
   - /api/profile (GET) -> returns profile (you already have this in server.js). :contentReference[oaicite:1]{index=1}
   - /auth/refresh (POST) -> rotates tokens (your server implements this)
   Optional (recommended):
   - GET  /api/referrals                -> list of referred users
   - GET  /api/referrals/history        -> referral earnings & move events
   - POST /api/referrals/move-to-wallet -> moves referral balance to wallet
   If those optional endpoints are missing the client falls back to sensible defaults.
*/

(() => {
  // cached DOM
  const tabs = document.querySelectorAll('.referral-modal-tab');
  const views = document.querySelectorAll('[data-view]');
  const refEarningsEl = document.getElementById('referral-modal-refEarnings');
  const refCodeEl = document.getElementById('referral-modal-refCode');
  const refLinkInput = document.getElementById('referral-modal-refLinkInput');
  const copyLinkBtn = document.getElementById('referral-modal-copyLinkBtn');
  const shareWhatsAppBtn = document.getElementById('referral-modal-shareWhatsApp');
  const shareOtherBtn = document.getElementById('referral-modal-shareOther');
  const moveToWalletBtn = document.getElementById('referral-modal-moveToWallet');
  const referralsListEl = document.getElementById('referral-modal-referralsList');
  const viewHistoryBtn = document.getElementById('referral-modal-viewHistory');

  // small UI helpers
  function formatCurrency(n) {
    try { return Number(n).toLocaleString(); } catch { return String(n); }
  }
  function formatDateISO(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return iso || '—'; }
  }

  // Toast notifications (simple, accessible)
  function showToast(msg, { type = 'info', duration = 3000 } = {}) {
    const id = `toast-${Date.now()}`;
    const container = document.createElement('div');
    container.id = id;
    container.className = `ref-toast ref-toast-${type}`;
    container.textContent = msg;
    document.body.appendChild(container);
    // basic styles (if your CSS already has toasts, remove the inline styles)
    Object.assign(container.style, {
      position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '8px 14px',
      borderRadius: '10px', zIndex: 14000, fontSize: '13px'
    });
    setTimeout(() => {
      container.style.transition = 'opacity .28s ease';
      container.style.opacity = '0';
      setTimeout(() => container.remove(), 300);
    }, duration);
  }

  // Safe fetch wrapper: uses credentials, auto-refreshes token once if 401
  async function apiFetch(path, opts = {}, { retryOnAuth = true } = {}) {
    const defaultHeaders = { 'Content-Type': 'application/json' };
    const fetchOpts = Object.assign({
      credentials: 'include',
      headers: Object.assign({}, defaultHeaders, opts.headers || {}),
      method: opts.method || 'GET',
    }, opts.body ? { body: JSON.stringify(opts.body) } : {});
    let res = await fetch(path, fetchOpts);
    // If unauthenticated, try refresh once (server provides /auth/refresh)
    if (res.status === 401 && retryOnAuth) {
      try {
        await fetch('/auth/refresh', { method: 'POST', credentials: 'include' });
      } catch (_) {
        // refresh failed
      }
      // retry once
      res = await fetch(path, fetchOpts);
    }
    let json = null;
    try { json = await res.json(); } catch (e) { /* non-json response */ }
    if (!res.ok) {
      const errMsg = json?.error?.message || json?.message || res.statusText || 'Request failed';
      const err = new Error(errMsg);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  }

  // API convenience functions (use server endpoints where available)
  const API = {
    profile: () => apiFetch('/api/profile'),
    getReferrals: () => apiFetch('/api/referrals').catch(e => {
      // return fallback empty list if endpoint missing
      if (e.status === 404 || e.status === 405) return { referrals: [] };
      throw e;
    }),
    getReferralHistory: () => apiFetch('/api/referrals/history').catch(e => {
      if (e.status === 404) return { history: [] };
      throw e;
    }),
    moveToWallet: () => apiFetch('/api/referrals/move-to-wallet', { method: 'POST' }),
    getEarnings: async () => {
      // try dedicated endpoint first; otherwise compute from referrals list
      try {
        const res = await apiFetch('/api/referrals/earnings');
        if (res && typeof res.total === 'number') return res.total;
      } catch (e) { /* ignore and fallback */ }
      // fallback: compute from referrals list
      const r = await API.getReferrals();
      const list = r.referrals || r || [];
      return (list.reduce((s, it) => s + Number(it.amountEarned || 0), 0) || 0);
    }
  };

  // derive site base (use server injected WEB_BASE if available; fallback to location.origin)
  const WEB_BASE = (window.__SERVER_CONFIG__ && window.__SERVER_CONFIG__.WEB_BASE) || location.origin;

  // ---------- UI actions ----------
  async function loadCampaign() {
    try {
      // Prefer embedded server data if available (server injects __SERVER_USER_DATA__)
      const serverUser = window.__SERVER_USER_DATA__ || null;
      let profile;
      if (serverUser && serverUser.username !== undefined) {
        profile = serverUser;
      } else {
        profile = await API.profile();
      }

      // Calculate earnings (server endpoint or compute)
      const earnings = await API.getEarnings();
      refEarningsEl.textContent = `₦${formatCurrency(earnings)}`;

      // referral code: prefer username; fallback to uid-based stable code.
      // Use a short hash of uid to avoid leaking full uid
      let referralCode;
      if (profile && profile.username) {
        referralCode = `FG-${sanitizeCode(profile.username)}`;
      } else if (profile && profile.uid) {
        referralCode = `FG-${shortHash(profile.uid)}`;
      } else {
        // last resort: generate in-memory random (not persisted)
        referralCode = `FG-${shortHash(navigator.userAgent + Date.now())}`;
      }

      refCodeEl.textContent = referralCode;
      const link = `${WEB_BASE.replace(/\/$/, '')}/signup?ref=${encodeURIComponent(referralCode)}`;
      refLinkInput.value = link;

    } catch (err) {
      console.error('[referral] loadCampaign error', err);
      showToast('Failed to load referral data', { type: 'error' });
    }
  }

  // small sanitizers
  function sanitizeCode(str) {
    return String(str || '').trim().replace(/\s+/g, '').replace(/[^A-Za-z0-9\-_]/g, '').toUpperCase().slice(0, 20);
  }
  function shortHash(input) {
    // simple deterministic short hash (not crypto). Use server-side persisted code if you need absolute security.
    let h = 0;
    for (let i = 0; i < input.length; i++) h = (h << 5) - h + input.charCodeAt(i) | 0;
    return Math.abs(h).toString(36).slice(0, 8).toUpperCase();
  }

  // copy link
  copyLinkBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(refLinkInput.value);
      showToast('Link copied', { type: 'success' });
    } catch (e) {
      console.error('copy failed', e);
      showToast('Copy failed', { type: 'error' });
    }
  });

  // whatsapp share
  shareWhatsAppBtn?.addEventListener('click', () => {
    const text = `${refCodeEl.textContent} — ${refLinkInput.value}\nJoin Flexgig and get great data deals!`;
    const encoded = encodeURIComponent(text);
    // Use wa.me link (works both mobile & desktop)
    const url = `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank', 'noopener');
  });

  // "More" share: Web Share API first, fallback to share sheet
  shareOtherBtn?.addEventListener('click', async () => {
    const title = 'Join Flexgig';
    const text = `Use my referral code ${refCodeEl.textContent} to sign up — ${refLinkInput.value}`;
    const url = refLinkInput.value;

    // Use native share if available
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        showToast('Shared', { type: 'success' });
        return;
      } catch (e) {
        // user cancelled or share failed — fall back
        console.info('Web Share API not completed', e);
      }
    }

    // Fallback: show a small prompt UI using window.prompt / custom choices
    const choice = prompt('Share via:\n1) Email\n2) Telegram\n3) Twitter\n4) SMS\nEnter 1-4');
    const encodedText = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(url);
    if (!choice) return;
    switch (choice.trim()) {
      case '1':
        window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodedText}`, '_blank', 'noopener');
        break;
      case '2':
        window.open(`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`, '_blank', 'noopener');
        break;
      case '3':
        window.open(`https://twitter.com/intent/tweet?text=${encodedText}%20-%20${encodedUrl}`, '_blank', 'noopener');
        break;
      case '4':
        window.open(`sms:?body=${encodedText} ${encodedUrl}`, '_blank', 'noopener');
        break;
      default:
        // fallback copy
        try { await navigator.clipboard.writeText(url); showToast('Link copied'); }
        catch { showToast('Could not share', { type: 'error' }); }
    }
  });

  // move earnings to wallet — confirmation + server call
  moveToWalletBtn?.addEventListener('click', async () => {
    try {
      // get current earnings
      const currentText = refEarningsEl.textContent || '₦0';
      const confirmMsg = `Move ${currentText} to your wallet?`;
      if (!confirm(confirmMsg)) return;

      moveToWalletBtn.disabled = true;
      moveToWalletBtn.textContent = 'Moving...';

      // call server endpoint
      const res = await API.moveToWallet();
      // Expect server to return { moved: number, remaining: number } or similar
      if (res && (res.moved || res.amountMoved)) {
        const moved = res.moved || res.amountMoved;
        refEarningsEl.textContent = `₦${formatCurrency(res.remaining || 0)}`;
        showToast(`Moved ₦${formatCurrency(moved)} to wallet`, { type: 'success' });
      } else {
        // Server returned success without details; refresh earnings
        const earnings = await API.getEarnings();
        refEarningsEl.textContent = `₦${formatCurrency(earnings)}`;
        showToast('Moved to wallet', { type: 'success' });
      }
    } catch (err) {
      console.error('moveToWallet error', err);
      showToast(err.message || 'Failed to move to wallet', { type: 'error' });
    } finally {
      moveToWalletBtn.disabled = false;
      moveToWalletBtn.textContent = 'Move referral bonus to wallet';
    }
  });

  // load referral list
  async function loadReferrals() {
    referralsListEl.innerHTML = '<div class="referral-modal-small">Loading…</div>';
    try {
      const payload = await API.getReferrals();
      const list = payload.referrals || payload || [];
      if (!list.length) {
        referralsListEl.innerHTML = '<div class="referral-modal-small">No referrals yet. Share your link to start earning.</div>';
        return;
      }
      referralsListEl.innerHTML = ''; // clear
      for (const r of list) {
        const item = document.createElement('div');
        item.className = 'referral-modal-ref-item';
        item.innerHTML = `
          <div class="referral-modal-ref-left">
            <div class="referral-modal-ref-avatar">${(r.username || 'U').charAt(0).toUpperCase()}</div>
            <div class="referral-modal-ref-meta">
              <div style="font-weight:600">${r.username || r.email || 'Unknown'}</div>
              <div class="referral-modal-muted">Joined: ${formatDateISO(r.joined || r.created_at || r.registered_at)}</div>
            </div>
          </div>
          <div class="referral-modal-ref-amount">₦${formatCurrency(r.amountEarned || 0)}</div>
        `;
        referralsListEl.appendChild(item);
      }
    } catch (err) {
      console.error('loadReferrals error', err);
      referralsListEl.innerHTML = '<div class="referral-modal-small">Failed to load referrals.</div>';
    }
  }

  // referral history modal rendering (in-modal)
  async function viewReferralHistory() {
    // prefer to render in place rather than alert
    try {
      const histPayload = await API.getReferralHistory();
      const hist = histPayload.history || histPayload || [];
      if (!hist.length) {
        // small inline message
        showToast('No referral history yet');
        return;
      }

      // Build a minimal modal view: we'll reuse the referrals view area
      const panel = document.createElement('div');
      panel.className = 'referral-modal-history-panel';
      Object.assign(panel.style, { padding: '12px', maxHeight: '60vh', overflowY: 'auto' });

      for (const h of hist) {
        const row = document.createElement('div');
        row.className = 'ref-history-row';
        Object.assign(row.style, { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' });
        const left = document.createElement('div');
        left.innerHTML = `<div style="font-weight:600">${h.type === 'move' ? 'Moved to wallet' : 'Referral earned'}</div>
                          <div class="referral-modal-muted" style="font-size:12px">${formatDateISO(h.date || h.created_at)}</div>`;
        const right = document.createElement('div');
        right.innerHTML = `<div style="font-weight:700">₦${formatCurrency(h.amount)}</div>`;
        row.appendChild(left);
        row.appendChild(right);
        panel.appendChild(row);
      }

      // show panel in a small overlay inside modal-body
      const body = document.querySelector('.referral-modal-body');
      // remove existing panels
      const existing = document.querySelector('.referral-modal-history-panel');
      if (existing) existing.remove();
      body.appendChild(panel);
      // scroll into view
      panel.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
      console.error('viewReferralHistory error', err);
      showToast('Failed to load history', { type: 'error' });
    }
  }

  // Tab switching (preserve user IDs/classes)
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      views.forEach(view => {
        view.style.display = view.dataset.view === target ? '' : 'none';
      });
      if (target === 'campaign') loadCampaign();
      if (target === 'referrals') loadReferrals();
    });
  });

  // attach history button
  viewHistoryBtn?.addEventListener('click', viewReferralHistory);

  // auto-load campaign initially (if campaign tab active)
  (async () => {
    const active = document.querySelector('.referral-modal-tab.active')?.dataset?.tab || 'campaign';
    if (active === 'campaign') await loadCampaign();
    if (active === 'referrals') await loadReferrals();
  })();

  // Expose a tiny debug helper (optional)
  window.__RefModal = {
    reloadCampaign: loadCampaign,
    reloadReferrals: loadReferrals,
    viewReferralHistory
  };
})();
