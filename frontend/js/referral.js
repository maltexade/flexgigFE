// ReferralModule — production-ready client for referral modal (updated: site link + username-only code + native WhatsApp)
(() => {
  const LOG_PREFIX = '[REF-MOD]';
  const API_BASE = (window.__SEC_API_BASE || (window.API_BASE || location.origin)).replace(/\/$/, '');
  const SITE_BASE = (window.__SITE_BASE || window.__SITE_URL || 'https://flexgig.com.ng').replace(/\/$/, '');

  // helpers: use dashboard fetchWithAutoRefresh if present (it handles /auth/refresh)
  async function doFetch(url, opts = {}) {
    const full = url.startsWith('http') ? url : `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
    if (typeof fetchWithAutoRefresh === 'function') {
      console.debug(`${LOG_PREFIX} doFetch -> fetchWithAutoRefresh`, full, opts.method || 'GET');
      return fetchWithAutoRefresh(full, opts);
    }
    console.debug(`${LOG_PREFIX} doFetch -> fetch`, full, opts.method || 'GET');
    return fetch(full, Object.assign({ credentials: 'include' }, opts));
  }

  // UI elements (preserve original IDs/classes)
  const refEarningsEl = document.getElementById('referral-modal-refEarnings');
  const refCodeEl = document.getElementById('referral-modal-refCode');
  const refLinkInput = document.getElementById('referral-modal-refLinkInput');
  const copyLinkBtn = document.getElementById('referral-modal-copyLinkBtn');
  const shareWhatsAppBtn = document.getElementById('referral-modal-shareWhatsApp');
  const shareOtherBtn = document.getElementById('referral-modal-shareOther');
  const moveToWalletBtn = document.getElementById('referral-modal-moveToWallet');
  const referralsListEl = document.getElementById('referral-modal-referralsList');
  const viewHistoryBtn = document.getElementById('referral-modal-viewHistory');
  const tabs = Array.from(document.querySelectorAll('.referral-modal-tab') || []);
  const views = Array.from(document.querySelectorAll('[data-view]') || []);

  // small formatting
  const fmt = n => { try { return Number(n || 0).toLocaleString(); } catch { return String(n || 0); } };
  const fmtDate = d => { try { return new Date(d).toLocaleString(); } catch { return d || '—'; } };

  // sanitizers & shortHash (deterministic client-side)
  function sanitizeUsername(s) {
    // allow lowercase letters, numbers, dot, dash, underscore; trim and lowercase
    return String(s || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9._-]/g, '').slice(0, 40) || null;
  }
  function shortHash(input) {
    let h = 0;
    const s = String(input || '');
    for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
    return Math.abs(h).toString(36).slice(0, 8);
  }

  // loader wrapper (use your withLoader if available for consistent UX)
  async function runWithLoader(fn) {
    if (typeof withLoader === 'function') {
      return withLoader(fn);
    }
    return fn();
  }

  // Build referral code (username-only). If username missing, fallback to short hash.
  function buildReferralCode(profile) {
    if (profile && profile.username) {
      const u = sanitizeUsername(profile.username);
      if (u) return u;
    }
    if (profile && (profile.uid || profile.id)) return shortHash(profile.uid || profile.id);
    return shortHash(navigator.userAgent + Date.now());
  }

  // Load campaign (profile + earnings)
  async function loadCampaign() {
    console.info(`${LOG_PREFIX} loadCampaign start`);
    try {
      // Prefer server injected data
      const serverUser = window.__SERVER_USER_DATA__ || null;
      let profile = null;
      if (serverUser && (serverUser.username || serverUser.uid)) {
        profile = serverUser;
        console.debug(`${LOG_PREFIX} loadCampaign: using __SERVER_USER_DATA__`);
      } else {
        // try getSession if available (returns { user })
        try {
          if (typeof getSession === 'function') {
            const sess = await getSession();
            profile = sess?.user || null;
            console.debug(`${LOG_PREFIX} loadCampaign: getSession used`);
          }
        } catch (e) {
          console.debug(`${LOG_PREFIX} loadCampaign: getSession failed, will fallback to /api/profile`, e);
        }

        if (!profile) {
          // fallback to direct profile endpoint
          try {
            const res = await doFetch('/api/profile', { method: 'GET' });
            if (res.ok) {
              profile = await res.json();
              console.debug(`${LOG_PREFIX} loadCampaign: /api/profile fetched`);
            } else {
              console.debug(`${LOG_PREFIX} /api/profile returned`, res.status);
            }
          } catch (e) {
            console.debug(`${LOG_PREFIX} /api/profile fetch failed`, e);
          }
        }
      }

      // earnings: try dedicated endpoint, otherwise compute from referrals
      let earnings = 0;
      try {
        const res = await doFetch('/api/referrals/earnings', { method: 'GET' });
        if (res.ok) {
          const j = await res.json();
          if (j && typeof j.total === 'number') earnings = j.total;
          console.debug(`${LOG_PREFIX} earnings from /api/referrals/earnings`, j);
        } else {
          console.debug(`${LOG_PREFIX} /api/referrals/earnings missing or returned ${res.status}`);
        }
      } catch (e) {
        console.debug(`${LOG_PREFIX} /api/referrals/earnings error, will fallback`, e);
      }

      if (!earnings) {
        // fallback: compute from referrals list
        try {
          const res = await doFetch('/api/referrals', { method: 'GET' });
          if (res.ok) {
            const j = await res.json();
            const list = Array.isArray(j.referrals) ? j.referrals : (Array.isArray(j) ? j : (j.referrals || []));
            earnings = list.reduce((s, it) => s + Number(it.amountEarned || it.amount || 0), 0);
            console.debug(`${LOG_PREFIX} earnings computed from referrals list. count=${list.length}`);
          } else {
            console.debug(`${LOG_PREFIX} /api/referrals returned`, res.status);
          }
        } catch (e) {
          console.debug(`${LOG_PREFIX} fallback /api/referrals error`, e);
        }
      }

      // set UI
      if (refEarningsEl) refEarningsEl.textContent = `₦${fmt(earnings)}`;
      const code = buildReferralCode(profile || {});
      if (refCodeEl) refCodeEl.textContent = code;
      const link = `${SITE_BASE}/r/${encodeURIComponent(code)}`;
      if (refLinkInput) refLinkInput.value = link;

      console.info(`${LOG_PREFIX} loadCampaign done — code=${code} link=${link} earnings=₦${fmt(earnings)}`);
      return { code, link, earnings, profile };
    } catch (err) {
      console.error(`${LOG_PREFIX} loadCampaign error`, err);
      throw err;
    }
  }

  // Copy link
  async function copyLink() {
    try {
      const text = refLinkInput?.value || '';
      if (!text) {
        console.warn(`${LOG_PREFIX} copyLink: no link present`);
        return;
      }
      await navigator.clipboard.writeText(text);
      console.info(`${LOG_PREFIX} Link copied to clipboard`);
    } catch (err) {
      console.error(`${LOG_PREFIX} copyLink failed`, err);
    }
  }

  // WhatsApp share - prefer native app, fallback to wa.me
  function shareWhatsApp() {
    try {
      const code = (refCodeEl?.textContent || '').trim();
      const link = (refLinkInput?.value || '').trim();
      const message = `${code} — ${link}\nJoin Flexgig for great data deals!`;
      const encoded = encodeURIComponent(message);

      const appUri = `whatsapp://send?text=${encoded}`;
      const webUri = `https://wa.me/?text=${encoded}`;

      // Try to open native app (most mobile platforms will try to open)
      const newWin = window.open(appUri, '_blank');

      // After short delay, fallback to web link (prevents user stuck)
      setTimeout(() => {
        try {
          // Some browsers block window.open for custom protocols; always open fallback
          window.open(webUri, '_blank', 'noopener');
          console.info(`${LOG_PREFIX} whatsapp fallback opened wa.me`);
        } catch (e) {
          console.debug(`${LOG_PREFIX} whatsapp fallback error`, e);
        }
      }, 900);

      console.info(`${LOG_PREFIX} shareWhatsApp attempted appUri`, appUri);
    } catch (err) {
      console.error(`${LOG_PREFIX} shareWhatsApp error`, err);
      // final fallback
      const fallback = `https://wa.me/?text=${encodeURIComponent('Join Flexgig: ' + SITE_BASE)}`;
      window.open(fallback, '_blank', 'noopener');
    }
  }

  // More share: Web Share API preferred, fallbacks to manual links
  async function shareMore() {
    const code = (refCodeEl?.textContent || '').trim();
    const link = (refLinkInput?.value || '').trim();
    const title = 'Join Flexgig';
    const text = `Use my referral code ${code} to sign up — ${link}`;
    const url = link;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        console.info(`${LOG_PREFIX} Shared via navigator.share`);
        return;
      } catch (e) {
        console.debug(`${LOG_PREFIX} navigator.share failed or cancelled`, e);
      }
    }

    // fallback choices (open in new window)
    const options = {
      email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
    };

    try {
      const choice = prompt('Share via:\n1) Email\n2) Telegram\n3) Twitter\nEnter 1,2,3');
      if (!choice) { console.info(`${LOG_PREFIX} shareMore cancelled`); return; }
      const idx = String(choice).trim();
      if (idx === '1') window.open(options.email, '_blank', 'noopener');
      else if (idx === '2') window.open(options.telegram, '_blank', 'noopener');
      else if (idx === '3') window.open(options.twitter, '_blank', 'noopener');
      else {
        await navigator.clipboard.writeText(url);
        console.info(`${LOG_PREFIX} Link copied as fallback`);
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} shareMore error`, err);
    }
  }

  // Move earnings to wallet
  async function moveToWallet() {
    console.info(`${LOG_PREFIX} moveToWallet start`);
    try {
      if (!confirm('Move your referral earnings to wallet?')) {
        console.info(`${LOG_PREFIX} moveToWallet cancelled by user`);
        return;
      }

      await runWithLoader(async () => {
        const res = await doFetch('/api/referrals/move-to-wallet', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(`move-to-wallet failed ${res.status} ${t}`);
        }
        const json = await res.json().catch(() => null);
        // Expect { moved: number, remaining: number } or similar
        const moved = json?.moved || json?.amountMoved || json?.movedAmount || null;
        const remaining = json?.remaining || 0;
        // Refresh display
        if (refEarningsEl) refEarningsEl.textContent = `₦${fmt(remaining)}`;
        console.info(`${LOG_PREFIX} moveToWallet success`, { moved, remaining });
      });
    } catch (err) {
      console.error(`${LOG_PREFIX} moveToWallet failed`, err);
    }
  }

  // Load referrals list
  async function loadReferrals() {
    console.info(`${LOG_PREFIX} loadReferrals start`);
    try {
      console.debug(`${LOG_PREFIX} requesting /api/referrals`);
      const res = await doFetch('/api/referrals', { method: 'GET' });
      if (!res.ok) {
        if (res.status === 404) {
          console.info(`${LOG_PREFIX} /api/referrals not found (404) — no referrals endpoint on server`);
          if (referralsListEl) referralsListEl.innerHTML = '<div class="referral-modal-small">No referrals yet.</div>';
          return [];
        }
        const txt = await res.text().catch(()=>'');
        throw new Error(`referrals fetch failed ${res.status} ${txt}`);
      }
      const j = await res.json().catch(() => null);
      const list = Array.isArray(j.referrals) ? j.referrals : (Array.isArray(j) ? j : (j.referrals || []));
      console.info(`${LOG_PREFIX} loadReferrals success — count=${list.length}`);

      if (!referralsListEl) return list;
      referralsListEl.innerHTML = '';
      if (!list.length) {
        referralsListEl.innerHTML = '<div class="referral-modal-small">No referrals yet. Share your link to start earning.</div>';
        return list;
      }

      list.sort((a, b) => (Number(b.amountEarned || b.amount || 0) - Number(a.amountEarned || a.amount || 0)));

      for (const r of list) {
        const el = document.createElement('div');
        el.className = 'referral-modal-ref-item';
        el.innerHTML = `
          <div class="referral-modal-ref-left">
            <div class="referral-modal-ref-avatar">${((r.username||r.email||'U').charAt(0)||'U').toUpperCase()}</div>
            <div class="referral-modal-ref-meta">
              <div style="font-weight:600">${r.username || r.email || 'Unknown'}</div>
              <div class="referral-modal-muted">Joined: ${fmtDate(r.joined || r.created_at || r.registered_at)}</div>
            </div>
          </div>
          <div class="referral-modal-ref-amount">₦${fmt(r.amountEarned || r.amount || 0)}</div>
        `;
        referralsListEl.appendChild(el);
      }
      return list;
    } catch (err) {
      console.error(`${LOG_PREFIX} loadReferrals error`, err);
      if (referralsListEl) referralsListEl.innerHTML = '<div class="referral-modal-small">Failed to load referrals.</div>';
      return [];
    }
  }

  // View referral history (renders into modal-body area as a panel)
  async function viewReferralHistory() {
    console.info(`${LOG_PREFIX} viewReferralHistory start`);
    try {
      const res = await doFetch('/api/referrals/history', { method: 'GET' });
      if (!res.ok) {
        console.debug(`${LOG_PREFIX} /api/referrals/history returned`, res.status);
        alert('No referral history available.');
        return;
      }
      const j = await res.json().catch(() => null);
      const hist = Array.isArray(j.history) ? j.history : (Array.isArray(j) ? j : (j.history || []));
      if (!hist.length) { console.info(`${LOG_PREFIX} empty history`); alert('No referral history yet.'); return; }

      const body = document.querySelector('.referral-modal-body');
      if (!body) {
        console.warn(`${LOG_PREFIX} viewReferralHistory: modal body not found`);
        return;
      }
      const existing = document.querySelector('.referral-modal-history-panel');
      if (existing) existing.remove();

      const panel = document.createElement('div');
      panel.className = 'referral-modal-history-panel';
      panel.style.padding = '12px';
      panel.style.maxHeight = '55vh';
      panel.style.overflowY = 'auto';
      panel.style.background = 'rgba(255,255,255,0.02)';
      panel.style.borderRadius = '8px';
      panel.style.marginTop = '12px';

      for (const h of hist) {
        const row = document.createElement('div');
        row.className = 'ref-history-row';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.padding = '10px 0';
        row.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
        const left = document.createElement('div');
        left.innerHTML = `<div style="font-weight:600">${h.type === 'move' ? 'Moved to wallet' : 'Referral earned'}</div><div class="referral-modal-muted" style="font-size:12px">${fmtDate(h.date || h.created_at)}</div>`;
        const right = document.createElement('div');
        right.innerHTML = `<div style="font-weight:700">₦${fmt(h.amount)}</div>`;
        row.appendChild(left);
        row.appendChild(right);
        panel.appendChild(row);
      }

      body.appendChild(panel);
      panel.scrollIntoView({ behavior: 'smooth' });
      console.info(`${LOG_PREFIX} viewReferralHistory rendered (${hist.length} rows)`);
    } catch (err) {
      console.error(`${LOG_PREFIX} viewReferralHistory error`, err);
      alert('Failed to load history.');
    }
  }

  // Tab wiring (preserve your tab classes/data attributes)
  function wireTabs() {
    if (!tabs.length) return;
    tabs.forEach(tab => {
      tab.addEventListener('click', async () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        views.forEach(view => view.style.display = (view.dataset.view === target) ? '' : 'none');
        if (target === 'campaign') await loadCampaign();
        if (target === 'referrals') await loadReferrals();
      });
    });
  }

  // Attach events
  if (copyLinkBtn) copyLinkBtn.addEventListener('click', copyLink);
  if (shareWhatsAppBtn) shareWhatsAppBtn.addEventListener('click', shareWhatsApp);
  if (shareOtherBtn) shareOtherBtn.addEventListener('click', shareMore);
  if (moveToWalletBtn) moveToWalletBtn.addEventListener('click', moveToWallet);
  if (viewHistoryBtn) viewHistoryBtn.addEventListener('click', viewReferralHistory);

  // initial load: campaign by default or the active tab
  async function init() {
    console.info(`${LOG_PREFIX} init start`);
    wireTabs();
    const activeTab = document.querySelector('.referral-modal-tab.active')?.dataset?.tab || 'campaign';
    try {
      if (activeTab === 'campaign') await loadCampaign();
      else if (activeTab === 'referrals') await loadReferrals();
      console.info(`${LOG_PREFIX} init done (activeTab=${activeTab})`);
    } catch (err) {
      console.error(`${LOG_PREFIX} init error`, err);
    }
  }

  // Expose module for debugging and programmatic calls
  window.ReferralModule = {
    init,
    reloadCampaign: loadCampaign,
    reloadReferrals: loadReferrals,
    viewReferralHistory,
    moveToWallet
  };

  // Auto init after DOM ready (defensive)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { setTimeout(init, 30); });
  } else {
    setTimeout(init, 30);
  }

  console.info(`${LOG_PREFIX} module loaded — SITE_BASE=${SITE_BASE} API_BASE=${API_BASE}`);
})();
