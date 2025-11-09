/* ===== production-ready referral modal JS with raw logs =====
   Logging: console + on-page debug panel (#ref-debug-log)
   Toggle verbose: window.__REF_MODAL_VERBOSE = true/false (default true)
*/

(() => {
  // toggle verbose from console if needed
  if (window.__REF_MODAL_VERBOSE === undefined) window.__REF_MODAL_VERBOSE = true;

  // create a small on-page log panel for raw logs (helps on mobile/inspector-less devices)
  function ensureLogPanel() {
    if (document.getElementById('ref-debug-log')) return document.getElementById('ref-debug-log');
    const panel = document.createElement('div');
    panel.id = 'ref-debug-log';
    Object.assign(panel.style, {
      position: 'fixed',
      right: '12px',
      bottom: '12px',
      width: '320px',
      maxHeight: '40vh',
      overflow: 'auto',
      background: 'rgba(0,0,0,0.7)',
      color: '#fff',
      padding: '8px',
      fontSize: '12px',
      zIndex: 16000,
      borderRadius: '8px',
      boxShadow: '0 6px 24px rgba(0,0,0,0.6)'
    });
    const title = document.createElement('div');
    title.textContent = 'RefModal Logs';
    Object.assign(title.style, { fontWeight: 700, marginBottom: '6px', fontSize: '13px' });
    panel.appendChild(title);
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    Object.assign(clearBtn.style, { position: 'absolute', right: '8px', top: '6px', fontSize: '11px' });
    clearBtn.addEventListener('click', () => { panel.querySelectorAll('.ref-log-line').forEach(n => n.remove()); });
    panel.appendChild(clearBtn);
    document.body.appendChild(panel);
    return panel;
  }

  function writeToPanel(level, text) {
    try {
      const panel = ensureLogPanel();
      const line = document.createElement('div');
      line.className = 'ref-log-line';
      const ts = new Date().toISOString();
      line.textContent = `[${ts}] ${level.toUpperCase()}: ${text}`;
      Object.assign(line.style, { marginBottom: '6px', whiteSpace: 'pre-wrap' });
      panel.appendChild(line);
      // keep recent only
      const lines = panel.querySelectorAll('.ref-log-line');
      if (lines.length > 200) lines[0].remove();
    } catch (e) {
      // ignore panel errors
      console.warn('[ref-log] panel write failed', e);
    }
  }

  function logRaw(level, ...args) {
    if (!window.__REF_MODAL_VERBOSE) return;
    // console
    if (level === 'error') console.error(...args);
    else if (level === 'warn') console.warn(...args);
    else if (level === 'info') console.info(...args);
    else console.log(...args);

    // stringify args for panel
    try {
      const payload = args.map(a => {
        try { return (typeof a === 'string') ? a : JSON.stringify(a, getCircularReplacer(), 2); } catch { return String(a); }
      }).join(' ');
      writeToPanel(level, payload);
    } catch (e) {
      console.warn('[ref-log] stringify failed', e);
    }
  }

  // helper to safely stringify circular objects
  function getCircularReplacer() {
    const seen = new WeakSet();
    return (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    };
  }

  // cached DOM (we'll log presence)
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

  logRaw('info', 'DOM lookup results:',
    {
      tabs: tabs.length,
      views: views.length,
      refEarningsEl: !!refEarningsEl,
      refCodeEl: !!refCodeEl,
      refLinkInput: !!refLinkInput,
      copyLinkBtn: !!copyLinkBtn,
      shareWhatsAppBtn: !!shareWhatsAppBtn,
      shareOtherBtn: !!shareOtherBtn,
      moveToWalletBtn: !!moveToWalletBtn,
      referralsListEl: !!referralsListEl,
      viewHistoryBtn: !!viewHistoryBtn
    });

  // small UI helpers
  function formatCurrency(n) {
    try { return Number(n).toLocaleString(); } catch { return String(n); }
  }
  function formatDateISO(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return iso || '—'; }
  }

  // Toast notifications (simple, accessible)
  function showToast(msg, { type = 'info', duration = 3000 } = {}) {
    logRaw('info', `TOAST (${type}): ${msg}`);
    const id = `toast-${Date.now()}`;
    const container = document.createElement('div');
    container.id = id;
    container.className = `ref-toast ref-toast-${type}`;
    container.textContent = msg;
    document.body.appendChild(container);
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
    logRaw('info', `apiFetch start: ${path}`, { opts, retryOnAuth });
    const defaultHeaders = { 'Content-Type': 'application/json' };
    const fetchOpts = Object.assign({
      credentials: 'include',
      headers: Object.assign({}, defaultHeaders, opts.headers || {}),
      method: opts.method || 'GET',
    }, opts.body ? { body: JSON.stringify(opts.body) } : {});
    logRaw('debug', 'fetch options:', fetchOpts);

    let res;
    try {
      res = await fetch(path, fetchOpts);
      logRaw('info', `apiFetch response status: ${res.status} for ${path}`);
    } catch (netErr) {
      logRaw('error', `Network error during fetch ${path}`, netErr);
      throw netErr;
    }

    // If unauthenticated, try refresh once (server provides /auth/refresh)
    if (res.status === 401 && retryOnAuth) {
      logRaw('warn', `${path} returned 401 — attempting token refresh (/auth/refresh)`);
      try {
        const refreshRes = await fetch('/auth/refresh', { method: 'POST', credentials: 'include' });
        logRaw('info', '/auth/refresh status', refreshRes.status);
      } catch (refreshErr) {
        logRaw('error', 'Token refresh failed', refreshErr);
      }
      // retry once
      try {
        res = await fetch(path, fetchOpts);
        logRaw('info', `Retry fetch status: ${res.status} for ${path}`);
      } catch (retryErr) {
        logRaw('error', `Retry fetch failed for ${path}`, retryErr);
        throw retryErr;
      }
    }

    let json = null;
    try {
      // attempt to parse json; if not json, leave as null and continue
      const text = await res.text();
      logRaw('debug', `Raw response text for ${path}:`, text ? (text.length > 2000 ? text.slice(0,2000) + '... (truncated)' : text) : '(empty)');
      try { json = text ? JSON.parse(text) : null; }
      catch (e) { logRaw('debug', `Response not JSON for ${path}`); json = null; }
    } catch (e) {
      logRaw('warn', `Error reading response text for ${path}`, e);
    }

    if (!res.ok) {
      const errMsg = json?.error?.message || json?.message || res.statusText || 'Request failed';
      logRaw('error', `apiFetch non-ok: ${res.status} ${errMsg}`, { path, json });
      const err = new Error(errMsg);
      err.status = res.status;
      err.body = json;
      throw err;
    }

    logRaw('info', `apiFetch success for ${path}`, json);
    return json;
  }

  // API convenience functions (use server endpoints where available)
  const API = {
    profile: () => apiFetch('/api/profile'),
    getReferrals: () => apiFetch('/api/referrals').catch(e => {
      logRaw('warn', '/api/referrals error fallback', e);
      if (e.status === 404 || e.status === 405) return { referrals: [] };
      throw e;
    }),
    getReferralHistory: () => apiFetch('/api/referrals/history').catch(e => {
      logRaw('warn', '/api/referrals/history error fallback', e);
      if (e.status === 404) return { history: [] };
      throw e;
    }),
    moveToWallet: () => apiFetch('/api/referrals/move-to-wallet', { method: 'POST' }),
    getEarnings: async () => {
      logRaw('info', 'API.getEarnings called');
      try {
        const res = await apiFetch('/api/referrals/earnings');
        if (res && typeof res.total === 'number') {
          logRaw('info', '/api/referrals/earnings returned', res);
          return res.total;
        }
      } catch (e) {
        logRaw('debug', '/api/referrals/earnings unavailable, falling back', e);
      }
      const r = await API.getReferrals();
      const list = r.referrals || r || [];
      const total = (list.reduce((s, it) => s + Number(it.amountEarned || it.amount || 0), 0) || 0);
      logRaw('info', 'Earnings computed from referrals list', { total, count: list.length });
      return total;
    }
  };

  // derive site base (use server injected WEB_BASE if available; fallback to location.origin)
  const WEB_BASE = (window.__SERVER_CONFIG__ && window.__SERVER_CONFIG__.WEB_BASE) || location.origin;
  logRaw('info', 'WEB_BASE determined', WEB_BASE);

  // ---------- UI actions ----------
  async function loadCampaign() {
    logRaw('info', 'loadCampaign start');
    try {
      // Prefer embedded server data if available (server injects __SERVER_USER_DATA__)
      const serverUser = window.__SERVER_USER_DATA__ || null;
      let profile;
      if (serverUser && serverUser.username !== undefined) {
        profile = serverUser;
        logRaw('info', 'Using server injected user data', { serverUser });
      } else {
        logRaw('info', 'Fetching profile from API');
        profile = await API.profile();
        logRaw('info', 'Profile fetched', profile);
      }

      // Calculate earnings (server endpoint or compute)
      const earnings = await API.getEarnings();
      logRaw('info', 'Earnings resolved', earnings);
      if (refEarningsEl) {
        refEarningsEl.textContent = `₦${formatCurrency(earnings)}`;
        logRaw('info', 'Updated DOM: refEarningsEl', refEarningsEl.textContent);
      } else logRaw('warn', 'refEarningsEl not found');

      // referral code: prefer username; fallback to uid-based stable code.
      let referralCode;
      if (profile && profile.username) {
        referralCode = `FG-${sanitizeCode(profile.username)}`;
        logRaw('info', 'Referral code from username', referralCode);
      } else if (profile && (profile.uid || profile.id)) {
        referralCode = `FG-${shortHash(profile.uid || profile.id)}`;
        logRaw('info', 'Referral code from uid', referralCode);
      } else {
        referralCode = `FG-${shortHash(navigator.userAgent + Date.now())}`;
        logRaw('warn', 'Referral code fallback (random)', referralCode);
      }

      if (refCodeEl) {
        refCodeEl.textContent = referralCode;
        logRaw('info', 'Updated DOM: refCodeEl', referralCode);
      } else {
        logRaw('error', 'refCodeEl element missing — cannot set referral code');
      }

      const link = `${WEB_BASE.replace(/\/$/, '')}/signup?ref=${encodeURIComponent(referralCode)}`;
      if (refLinkInput) {
        refLinkInput.value = link;
        logRaw('info', 'Updated DOM: refLinkInput', link);
      } else {
        logRaw('error', 'refLinkInput element missing — cannot set referral link', link);
      }

      logRaw('info', 'loadCampaign finished');
      return { referralCode, link, earnings };
    } catch (err) {
      logRaw('error', '[referral] loadCampaign error', err);
      showToast('Failed to load referral data', { type: 'error' });
      throw err;
    }
  }

  // small sanitizers
  function sanitizeCode(str) {
    return String(str || '').trim().replace(/\s+/g, '').replace(/[^A-Za-z0-9\-_]/g, '').toUpperCase().slice(0, 20);
  }
  function shortHash(input) {
    let h = 0;
    for (let i = 0; i < input.length; i++) h = (h << 5) - h + input.charCodeAt(i) | 0;
    return Math.abs(h).toString(36).slice(0, 8).toUpperCase();
  }

  // copy link
  copyLinkBtn?.addEventListener('click', async () => {
    logRaw('info', 'copyLinkBtn clicked');
    try {
      if (!refLinkInput) throw new Error('refLinkInput missing');
      await navigator.clipboard.writeText(refLinkInput.value);
      showToast('Link copied', { type: 'success' });
      logRaw('info', 'referral link copied', refLinkInput.value);
    } catch (e) {
      logRaw('error', 'copy failed', e);
      showToast('Copy failed', { type: 'error' });
    }
  });

  // whatsapp share
  shareWhatsAppBtn?.addEventListener('click', () => {
    logRaw('info', 'shareWhatsAppBtn clicked');
    try {
      const text = `${refCodeEl?.textContent || '[no-code]'} — ${refLinkInput?.value || '[no-link]'}\nJoin Flexgig and get great data deals!`;
      const encoded = encodeURIComponent(text);
      const url = `https://wa.me/?text=${encoded}`;
      logRaw('info', 'Opening WhatsApp URL', url);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      logRaw('error', 'WhatsApp share failed', e);
      showToast('Cannot open WhatsApp share.', { type: 'error' });
    }
  });

  // "More" share: Web Share API first, fallback to share sheet
  shareOtherBtn?.addEventListener('click', async () => {
    logRaw('info', 'shareOtherBtn clicked');
    const title = 'Join Flexgig';
    const text = `Use my referral code ${refCodeEl?.textContent || '[no-code]'} to sign up — ${refLinkInput?.value || '[no-link]'}`;
    const url = refLinkInput?.value || window.location.href;
    logRaw('debug', 'share payload', { title, text, url });

    if (navigator.share) {
      try {
        logRaw('info', 'Using Web Share API', { title, text, url });
        await navigator.share({ title, text, url });
        showToast('Shared', { type: 'success' });
        logRaw('info', 'Web Share API success');
        return;
      } catch (e) {
        logRaw('warn', 'Web Share API failed or cancelled', e);
      }
    }

    // Fallback prompt
    try {
      const choice = prompt('Share via:\n1) Email\n2) Telegram\n3) Twitter\n4) SMS\nEnter 1-4');
      logRaw('info', 'User share choice', choice);
      const encodedText = encodeURIComponent(text);
      const encodedUrl = encodeURIComponent(url);
      if (!choice) {
        logRaw('info', 'User cancelled share prompt');
        return;
      }
      switch (choice.trim()) {
        case '1':
          logRaw('info', 'Sharing via Email');
          window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodedText}`, '_blank', 'noopener');
          break;
        case '2':
          logRaw('info', 'Sharing via Telegram');
          window.open(`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`, '_blank', 'noopener');
          break;
        case '3':
          logRaw('info', 'Sharing via Twitter');
          window.open(`https://twitter.com/intent/tweet?text=${encodedText}%20-%20${encodedUrl}`, '_blank', 'noopener');
          break;
        case '4':
          logRaw('info', 'Sharing via SMS');
          window.open(`sms:?body=${encodedText} ${encodedUrl}`, '_blank', 'noopener');
          break;
        default:
          logRaw('warn', 'Unknown choice, falling back to copy');
          try { await navigator.clipboard.writeText(url); showToast('Link copied'); logRaw('info', 'Fallback: link copied', url); }
          catch { showToast('Could not share', { type: 'error' }); logRaw('error', 'Fallback copy failed'); }
      }
    } catch (e) {
      logRaw('error', 'shareOther fallback error', e);
    }
  });

  // move earnings to wallet — confirmation + server call
  moveToWalletBtn?.addEventListener('click', async () => {
    logRaw('info', 'moveToWalletBtn clicked');
    try {
      const currentText = refEarningsEl?.textContent || '₦0';
      logRaw('info', 'current earnings text', currentText);
      const confirmMsg = `Move ${currentText} to your wallet?`;
      if (!confirm(confirmMsg)) {
        logRaw('info', 'User cancelled move to wallet');
        return;
      }

      moveToWalletBtn.disabled = true;
      moveToWalletBtn.textContent = 'Moving...';

      logRaw('info', 'Calling API.moveToWallet()');
      const res = await API.moveToWallet();
      logRaw('info', 'moveToWallet response', res);

      if (res && (res.moved || res.amountMoved)) {
        const moved = res.moved || res.amountMoved;
        refEarningsEl.textContent = `₦${formatCurrency(res.remaining || 0)}`;
        showToast(`Moved ₦${formatCurrency(moved)} to wallet`, { type: 'success' });
        logRaw('info', `Moved ${moved} to wallet, remaining: ${res.remaining || 0}`);
      } else {
        const earnings = await API.getEarnings();
        refEarningsEl.textContent = `₦${formatCurrency(earnings)}`;
        showToast('Moved to wallet', { type: 'success' });
        logRaw('info', 'Moved to wallet but server returned no moved amount, refreshed earnings', earnings);
      }
    } catch (err) {
      logRaw('error', 'moveToWallet error', err);
      showToast(err.message || 'Failed to move to wallet', { type: 'error' });
    } finally {
      moveToWalletBtn.disabled = false;
      moveToWalletBtn.textContent = 'Move referral bonus to wallet';
    }
  });

  // load referral list
  async function loadReferrals() {
    logRaw('info', 'loadReferrals start');
    if (referralsListEl) referralsListEl.innerHTML = '<div class="referral-modal-small">Loading…</div>';
    try {
      const payload = await API.getReferrals();
      logRaw('info', 'getReferrals returned', payload);
      const list = payload.referrals || payload || [];
      if (!list.length) {
        if (referralsListEl) referralsListEl.innerHTML = '<div class="referral-modal-small">No referrals yet. Share your link to start earning.</div>';
        logRaw('info', 'No referrals found');
        return;
      }
      if (referralsListEl) referralsListEl.innerHTML = ''; // clear
      for (const r of list) {
        logRaw('debug', 'render referral item', r);
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
          <div class="referral-modal-ref-amount">₦${formatCurrency(r.amountEarned || r.amount || 0)}</div>
        `;
        referralsListEl.appendChild(item);
      }
      logRaw('info', `Rendered ${list.length} referrals`);
    } catch (err) {
      logRaw('error', 'loadReferrals error', err);
      if (referralsListEl) referralsListEl.innerHTML = '<div class="referral-modal-small">Failed to load referrals.</div>';
    }
  }

  // referral history modal rendering (in-modal)
  async function viewReferralHistory() {
    logRaw('info', 'viewReferralHistory start');
    try {
      const histPayload = await API.getReferralHistory();
      logRaw('info', 'getReferralHistory returned', histPayload);
      const hist = histPayload.history || histPayload || [];
      if (!hist.length) {
        showToast('No referral history yet');
        logRaw('info', 'No referral history found');
        return;
      }

      const panel = document.createElement('div');
      panel.className = 'referral-modal-history-panel';
      Object.assign(panel.style, { padding: '12px', maxHeight: '60vh', overflowY: 'auto' });

      for (const h of hist) {
        logRaw('debug', 'render history row', h);
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

      const body = document.querySelector('.referral-modal-body');
      const existing = document.querySelector('.referral-modal-history-panel');
      if (existing) existing.remove();
      if (body) {
        body.appendChild(panel);
        panel.scrollIntoView({ behavior: 'smooth' });
        logRaw('info', 'History panel appended to modal body');
      } else {
        logRaw('warn', 'Modal body not found - opening history in new window');
        const w = window.open('', '_blank', 'noopener,width=420,height=600');
        w.document.write(`<pre style="font-family:system-ui,monospace;padding:12px">${JSON.stringify(hist, getCircularReplacer(), 2)}</pre>`);
      }
    } catch (err) {
      logRaw('error', 'viewReferralHistory error', err);
      showToast('Failed to load history', { type: 'error' });
    }
  }

  // Tab switching (preserve user IDs/classes) - log events
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      logRaw('info', 'tab click', tab.dataset.tab);
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      views.forEach(view => {
        const show = view.dataset.view === target;
        view.style.display = show ? '' : 'none';
      });
      if (target === 'campaign') loadCampaign();
      if (target === 'referrals') loadReferrals();
    });
  });

  // attach history button
  if (viewHistoryBtn) {
    viewHistoryBtn.addEventListener('click', viewReferralHistory);
    logRaw('info', 'viewHistoryBtn attached');
  } else {
    logRaw('warn', 'viewHistoryBtn missing, cannot attach history handler');
  }

  // auto-load campaign initially (if campaign tab active)
  (async () => {
    try {
      const active = document.querySelector('.referral-modal-tab.active')?.dataset?.tab || 'campaign';
      logRaw('info', 'Initial active tab', active);
      if (active === 'campaign') await loadCampaign();
      if (active === 'referrals') await loadReferrals();
    } catch (e) {
      logRaw('error', 'Initial load error', e);
    }
  })();

  // Expose a tiny debug helper (optional)
  window.__RefModal = {
    reloadCampaign: async () => { logRaw('info', '__RefModal.reloadCampaign called'); return loadCampaign(); },
    reloadReferrals: async () => { logRaw('info', '__RefModal.reloadReferrals called'); return loadReferrals(); },
    viewReferralHistory: async () => { logRaw('info', '__RefModal.viewReferralHistory called'); return viewReferralHistory(); },
    rawLog: (lvl, ...args) => logRaw(lvl || 'info', ...args)
  };

  logRaw('info', 'Referral modal script initialized. Verbose:', window.__REF_MODAL_VERBOSE);

})();
