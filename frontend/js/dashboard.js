import { mtnAwoofPlans, mtnGiftingPlans, airtelAwoofPlans, airtelCgPlans, gloCgPlans, gloGiftingPlans, ninemobilePlans } from './dataPlans.js';

window.__SEC_API_BASE = 'https://api.flexgig.com.ng'

// Your project URL and anon key (get them from Supabase dashboard → Project Settings → API)
const SUPABASE_URL = 'https://bwmappzvptcjxlukccux.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3bWFwcHp2cHRjanhsdWtjY3V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0OTMzMjcsImV4cCI6MjA3MTA2OTMyN30.Ra7k6Br6nl1huQQi5DpDuOQSDE-6N1qlhUIvIset0mc';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let __backHandler = null;

function showLoader() {
  const loader = document.getElementById('appLoader');
  if (!loader) return;

  loader.hidden = false;

  // 🔹 Disable all interactive elements
  document.querySelectorAll('button, input, select, textarea, a').forEach(el => {
    el.setAttribute('data-prev-disabled', el.disabled);
    el.disabled = true;
  });

  // 🔹 Lock back button
  __backHandler = () => {
    history.pushState(null, '', location.href);
  };
  window.addEventListener('popstate', __backHandler);
  history.pushState(null, '', location.href);
}

function hideLoader() {
  const loader = document.getElementById('appLoader');
  if (!loader) return;

  loader.hidden = true;

  // 🔹 Restore original disabled state
  document.querySelectorAll('[data-prev-disabled]').forEach(el => {
    const prev = el.getAttribute('data-prev-disabled') === 'true';
    el.disabled = prev;
    el.removeAttribute('data-prev-disabled');
  });

  // 🔹 Unlock back button
  if (__backHandler) {
    window.removeEventListener('popstate', __backHandler);
    __backHandler = null;
  }
}

async function withLoader(task) {
  console.log('[DEBUG ⌛⌛⌛] withLoader: Starting task with loader');
  showLoader();
  try {
    return await task();
  } finally {
    hideLoader();
  }
}


// ---------- STORAGE INSTRUMENTATION (paste once near top of script) ----------
(function instrumentStorage() {
  try {
    const origRemove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function(key) {
      if (key === 'credentialId') {
        console.log('[STORAGE TRACE] removeItem called for', key, 'time:', new Date().toISOString());
        console.trace();
      }
      return origRemove.apply(this, arguments);
    };

    window.addEventListener('storage', (e) => {
      if (e.key === 'credentialId') {
        console.log('[STORAGE EVENT] storage event for credentialId:', {
          oldValue: e.oldValue,
          newValue: e.newValue,
          url: e.url,
          time: new Date().toISOString()
        });
      }
    });

    window.addEventListener('beforeunload', () => {
      try {
        console.log('[STORAGE TRACE] beforeunload — credentialId currently:', localStorage.getItem('credentialId'), 'time:', new Date().toISOString());
      } catch (err) {
        console.error('[STORAGE TRACE] beforeunload read error', err);
      }
    });

    console.log('[STORAGE TRACE] Instrumentation installed');
  } catch (e) {
    console.error('[STORAGE TRACE] Failed to install instrumentation', e);
  }
})();





// 🚀 Global banner helpers
// Put this in your JS file (replace old showBanner)

function setBannerMessage(msg, repeatTimes = 6) {
  const repeated = msg.repeat(repeatTimes);
  document.querySelectorAll('.banner-msg').forEach(el => {
    el.textContent = repeated;
  });
  const inner = document.querySelector('.scroll-inner');
  if (inner) {
    inner.style.animation = 'none';
    void inner.offsetWidth;
    inner.style.animation = '';
  }
}

function showBanner(msg) {
  const STATUS_BANNER = document.getElementById('status-banner');
  if (!STATUS_BANNER) return;
  setBannerMessage(msg, 1); // Ensure long repeat for scrolling
  STATUS_BANNER.classList.remove('hidden');
}

function hideBanner() {
  const STATUS_BANNER = document.getElementById('status-banner');
  if (STATUS_BANNER) STATUS_BANNER.classList.add('hidden');
}

// close button
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'banner-close') hideBanner();
});

// Fetch active broadcasts on load and show the first applicable one
async function fetchActiveBroadcasts() {
  try {
    const res = await fetch(`${window.__SEC_API_BASE || ''}/api/broadcasts/active`, { credentials: 'include' });
    if (!res.ok) {
      console.warn('[BCAST] /api/broadcasts/active returned', res.status);
      return [];
    }
    const json = await res.json();
    const broadcasts = json.broadcasts || [];
    // If you want the latest/highest priority first, sort here (by starts_at asc or created_at)
    broadcasts.sort((a,b) => {
      const aStart = a.starts_at ? new Date(a.starts_at).getTime() : 0;
      const bStart = b.starts_at ? new Date(b.starts_at).getTime() : 0;
      return aStart - bStart;
    });

    if (broadcasts.length > 0) {
      // Show the first one (you can render multiple if you like)
      const b = broadcasts[0];
      // defensive: check expiry on client too
      if (!b.expire_at || new Date(b.expire_at) > new Date()) {
        showBanner(b.message || '');
        // store visible broadcast id if you need to reference later
        localStorage.setItem('active_broadcast_id', b.id);
      } else {
        hideBanner();
        localStorage.removeItem('active_broadcast_id');
      }
    } else {
      hideBanner();
      localStorage.removeItem('active_broadcast_id');
    }
    return broadcasts;
  } catch (err) {
    console.error('[BCAST] fetchActiveBroadcasts error', err);
    return [];
  }
}





// Optional: centralize fetch-with-refresh for reuse (call other APIs with this)
async function fetchWithAutoRefresh(url, opts = {}) {
  opts.credentials = 'include';
  opts.headers = opts.headers || { 'Accept': 'application/json' };
  let res = await fetch(url, opts);
  if (res.status === 401) {
    console.log('[DEBUG] fetchWithAutoRefresh: 401, attempting /auth/refresh');
    const refresh = await fetch(`${window.__SEC_API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    if (refresh.ok) {
      console.log('[DEBUG] fetchWithAutoRefresh: Refresh succeeded, retrying');
      res = await fetch(url, opts);
    } else {
      console.warn('[WARN] fetchWithAutoRefresh: Refresh failed');
    }
  }
  return res;
}

// 🚀 NEW: App Version (BUMP ON EACH DEPLOY, e.g., '1.0.1')
const APP_VERSION = '1.0.0';


const updateProfileModal = document.getElementById('updateProfileModal');
if (updateProfileModal && updateProfileModal.classList.contains('active')) {
  openUpdateProfileModal();
}



// --- Fetch User Data ---
// --- Fetch User Data ---
// --- Robust getSession() with guarded updates and stable avatar handling ---
// --- Robust getSession() with cache-first rendering ---
// --- Robust getSession() with cache-first rendering ---
async function getSession() {
  if (window.__sessionLoading) return;
  window.__sessionLoading = true;
  const loadId = Date.now();
  window.__lastSessionLoadId = loadId;

  function isValidImageSource(src) {
    if (!src) return false;
    return /^(data:image\/|https?:\/\/|\/)/i.test(src);
  }

  function applySessionToDOM(userObj, derivedFirstName) {
    if (window.__lastSessionLoadId !== loadId) {
      console.log('[DEBUG] getSession: stale loadId, abort DOM apply');
      return;
    }

    const greetEl = document.getElementById('greet');
    const firstnameEl = document.getElementById('firstname');
    const avatarEl = document.getElementById('avatar');

    if (!(greetEl && firstnameEl && avatarEl)) {
      console.warn('[WARN] getSession: DOM elements not found when applying session');
      return;
    }

    [greetEl, firstnameEl, avatarEl].forEach(el => {
      if (el.firstChild && el.firstChild.classList?.contains('loading-blur')) {
        el.firstChild.classList.add('fade-out');
        setTimeout(() => (el.innerHTML = ''), 150);
      }
    });

    const hour = new Date().getHours();
    greetEl.textContent = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    greetEl.classList.add('fade-in');

    const displayName = userObj.username || derivedFirstName || 'User';
    firstnameEl.textContent = displayName.charAt(0).toUpperCase() + displayName.slice(1);
    firstnameEl.classList.add('fade-in');

    const profilePicture = userObj.profilePicture || '';
    if (isValidImageSource(profilePicture)) {
      avatarEl.innerHTML = `<img src="${profilePicture}" alt="Profile Picture" class="avatar-img fade-in" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
      avatarEl.removeAttribute('aria-label');
    } else {
      avatarEl.textContent = displayName.charAt(0).toUpperCase();
      avatarEl.classList.add('fade-in');
      avatarEl.setAttribute('aria-label', displayName);
    }
  }

  async function waitForDomReady(retries = 8, delay = 100) {
    for (let i = 0; i < retries; i++) {
      if (document.getElementById('greet') && document.getElementById('firstname') && document.getElementById('avatar')) {
        return true;
      }
      await new Promise(r => setTimeout(r, delay));
    }
    return false;
  }

  // Cache-first render
  const cachedUserData = localStorage.getItem('userData');
  let cachedUser = null;
  let derivedFirstName = 'User';
  if (cachedUserData) {
    try {
      const parsed = JSON.parse(cachedUserData);
      if (Date.now() - parsed.cachedAt < 300000) { // 5min TTL
        cachedUser = parsed;
        derivedFirstName = parsed.fullName?.split(' ')[0] || 'User';
        console.log('[DEBUG] getSession: Using fresh cache for instant render');
        const domReady = await waitForDomReady();
        if (domReady) applySessionToDOM(cachedUser, derivedFirstName);
      }
    } catch (e) {
      console.warn('[WARN] getSession: Invalid cache', e);
    }
  }

  // Background fetch (cookie-first)
  try {
    if (!cachedUser) {
      const greetEl = document.getElementById('greet');
      const firstnameEl = document.getElementById('firstname');
      const avatarEl = document.getElementById('avatar');
      if (greetEl && firstnameEl && avatarEl) {
        greetEl.innerHTML = '<div class="loading-blur"></div>';
        firstnameEl.innerHTML = '<div class="loading-blur"></div>';
        avatarEl.innerHTML = '<div class="loading-blur avatar-loader"></div>';
      }
    }

    console.log('[DEBUG] getSession: Initiating /api/session fetch', new Date().toISOString());

    // IMPORTANT: Do NOT attach localStorage authToken as a Bearer header.
    // Allow cookies (token + rt) to be sent automatically by the browser.
    let res = await fetch(`${window.__SEC_API_BASE}/api/session`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });

    // If server responds 401 -> attempt refresh endpoint (server will rotate cookies)
    if (res.status === 401) {
      console.log('[DEBUG] getSession: /api/session returned 401, attempting /auth/refresh');
      const refreshRes = await fetch(`${window.__SEC_API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      if (refreshRes.ok) {
        console.log('[DEBUG] getSession: /auth/refresh succeeded, retrying /api/session');
        // cookies (token + rt) were rotated/set by server; retry session
        res = await fetch(`${window.__SEC_API_BASE}/api/session`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        });
      } else {
        // refresh failed -> user must re-login
        console.warn('[WARN] getSession: refresh failed', await refreshRes.text().catch(()=>'(no body)'));
        // Optionally clear client-side cache / redirect to login
        // localStorage.removeItem('userData'); // optional
        window.__sessionLoading = false;
        return null;
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[ERROR] getSession: Session API returned error:', res.status, text);
      // fallback to cache if available
      if (cachedUser) applySessionToDOM(cachedUser, derivedFirstName);
      window.__sessionLoading = false;
      return null;
    }

    let payload = null;
    try {
      // prefer .json() but guard for empty body / invalid json
      const txt = await res.text();
      payload = txt ? JSON.parse(txt) : null;
    } catch (e) {
      console.warn('[WARN] getSession: Response not valid JSON or empty');
      payload = null;
    }
    if (!payload || !payload.user) {
      console.error('[ERROR] getSession: invalid payload from /api/session', payload);
      if (cachedUser) applySessionToDOM(cachedUser, derivedFirstName);
      window.__sessionLoading = false;
      return null;
    }

    const { user, token: newToken } = payload;
    console.log('[DEBUG] getSession: Raw user data', user);

    let firstName = user.fullName?.split(' ')[0] || '';
    if (!firstName && user.email) {
      firstName = user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').replace(/(\d+)/, '');
      firstName = (firstName && firstName.charAt(0).toUpperCase() + firstName.slice(1)) || 'User';
    }

    // Update cache with user info but DO NOT persist access token to localStorage
    const userData = {
      username: user.username || '',
      fullName: user.fullName || '',
      profilePicture: user.profilePicture || '',
      id: user.uid || user.id || '',
      hasPin: user.hasPin || false,
      cachedAt: Date.now()
    };
    try {
      localStorage.setItem('userData', JSON.stringify(userData));
      // Still store convenient user bits
      localStorage.setItem('userEmail', user.email || '');
      localStorage.setItem('firstName', firstName);
      localStorage.setItem('username', user.username || '');
      localStorage.setItem('phoneNumber', user.phoneNumber || '');
      localStorage.setItem('address', user.address || '');
      localStorage.setItem('fullName', user.fullName || (user.email ? user.email.split('@')[0] : ''));
      localStorage.setItem('fullNameEdited', user.fullNameEdited ? 'true' : 'false');
      localStorage.setItem('lastUsernameUpdate', user.lastUsernameUpdate || '');
      localStorage.setItem('profilePicture', user.profilePicture || '');
      // Remove any old stored authToken to avoid stale usage
      try { localStorage.removeItem('authToken'); } catch (e) {}
    } catch (err) {
      console.warn('[WARN] getSession: Failed to write some localStorage keys', err);
    }

    const domReady = await waitForDomReady();
    if (!domReady) {
      console.warn('[WARN] getSession: DOM elements not ready after waiting');
    }
    applySessionToDOM(user, firstName);

    if (typeof loadUserProfile === 'function' && !cachedUser) {
      try {
        const profileResult = await loadUserProfile(true);
        if (window.__lastSessionLoadId !== loadId) {
          console.log('[DEBUG] getSession: loadUserProfile result is stale, ignoring');
          window.__sessionLoading = false;
          return null;
        }
        const profileData = profileResult && typeof profileResult === 'object' ? profileResult : {
          profilePicture: localStorage.getItem('profilePicture') || user.profilePicture || ''
        };
        const finalProfilePicture = isValidImageSource(profileData.profilePicture)
          ? profileData.profilePicture
          : isValidImageSource(user.profilePicture) ? user.profilePicture : '';
        if (finalProfilePicture && finalProfilePicture !== (localStorage.getItem('profilePicture') || '')) {
          try {
            localStorage.setItem('profilePicture', finalProfilePicture);
            userData.profilePicture = finalProfilePicture;
            localStorage.setItem('userData', JSON.stringify(userData));
          } catch (err) { /* ignore */ }
          applySessionToDOM({ ...user, profilePicture: finalProfilePicture }, firstName);
        } else {
          applySessionToDOM({ ...user, profilePicture: finalProfilePicture || user.profilePicture }, firstName);
        }
      } catch (err) {
        console.warn('[WARN] getSession: loadUserProfile failed, relying on session data', err?.message);
        applySessionToDOM(user, firstName);
      }
    }

    console.log('[DEBUG] getSession: Completed (loadId=' + loadId + ')');
    window.__sessionLoading = false;
    return { user /* DO NOT return access token for client storage */ };
  } catch (err) {
    console.error('[ERROR] getSession: Failed to fetch session', err);
    if (cachedUser) applySessionToDOM(cachedUser, derivedFirstName);
    window.__sessionLoading = false;
    return null;
  }
}

// Make globally accessible
window.getSession = getSession;


// Make globally accessible
window.getSession = getSession;



// --- Safe wrapper with retries ---
function safeGetSession(retries = 5) {
  const greetEl = document.getElementById('greet');
  const firstnameEl = document.getElementById('firstname');
  const avatarEl = document.getElementById('avatar');

  if (greetEl && firstnameEl && avatarEl) {
    getSession();
  } else if (retries > 0) {
    console.warn('[WARN] safeGetSession: Elements not ready, retrying...');
    setTimeout(() => safeGetSession(retries - 1), 300);
  } else {
    console.error('[ERROR] safeGetSession: Elements never appeared');
  }
}

// Run observer only on dashboard
if (window.location.pathname.includes('dashboard.html')) {
  window.addEventListener('load', () => { // Or 'DOMContentLoaded' if preferred
    console.log('[DEBUG] window.load: Starting MutationObserver');
    observeForElements();
    onDashboardLoad();
  });
}

// --- Observer to wait for elements ---
function observeForElements() {
  const targetNode = document.body; // Or a specific parent like document.querySelector('.user-greeting')
  const config = { childList: true, subtree: true }; // Watch for added/removed nodes

  const observer = new MutationObserver((mutations, obs) => {
    const greetEl = document.getElementById('greet');
    const firstnameEl = document.getElementById('firstname');
    const avatarEl = document.getElementById('avatar');

    if (greetEl && firstnameEl && avatarEl) {
      console.log('[DEBUG] MutationObserver: Elements detected, running getSession');
      const cachedUserData = localStorage.getItem('userData');
      if (cachedUserData) {
        try {
          const parsed = JSON.parse(cachedUserData);
          const firstName = parsed.fullName?.split(' ')[0] || 'User';
          applySessionToDOM(parsed, firstName);
        } catch (e) { /* ignore */ }
      }
      getSession(); // Call directly (no need for safeGetSession retries here)
      obs.disconnect(); // Stop observing once elements are found
    }
  });

  observer.observe(targetNode, config);
  console.log('[DEBUG] MutationObserver: Started watching for elements');
  
  // Fallback: If elements already exist, call immediately
  const greetEl = document.getElementById('greet');
  const firstnameEl = document.getElementById('firstname');
  const avatarEl = document.getElementById('avatar');
  if (greetEl && firstnameEl && avatarEl) {
    console.log('[DEBUG] MutationObserver: Elements already present');
    getSession();
    observer.disconnect();
  }
}

// After getSession succeeds
// After getSession succeeds (now cache-first)
async function onDashboardLoad() {
  // Instant cache render first
  const cachedUserData = localStorage.getItem('userData');
  if (cachedUserData) {
    try {
      const parsed = JSON.parse(cachedUserData);
      if (Date.now() - parsed.cachedAt < 300000) {
        const firstName = parsed.fullName?.split(' ')[0] || 'User';
        const domReady = await waitForDomReady(); // Reuse your func
        if (domReady) applySessionToDOM(parsed, firstName);
      }
    } catch (e) { /* ignore */ }
  }

  // Then background refresh
  await getSession(); // This will update if needed
  setupBroadcastSubscription();
  if (window.__reauth && typeof window.__reauth.initReauthModal === 'function') {
  await window.__reauth.initReauthModal();
} else {
  console.warn('initReauthModal not available - skipping');
}
  if (window.__reauth && typeof window.__reauth.setupInactivity === 'function') {
  window.__reauth.setupInactivity();
} else {
  console.warn('setupInactivity not available - skipping');
}

  // Your existing inactivity check...
  const last = parseInt(localStorage.getItem('lastActive')) || 0;
  if (Date.now() - last > IDLE_TIME && await shouldReauth()) {
    showInactivityPrompt();
  }



  // 🚀 NEW: Automatic Updates & Notifications
  const STATUS_BANNER = document.getElementById('status-banner');
  const BANNER_MSG = document.querySelector('.banner-msg');

  async function pollStatus() {
    try {
      const res = await fetch('/api/status', { credentials: 'include' });
      if (!res.ok) throw new Error('Status fetch failed');
      const { status, message } = await res.json();
      if (status === 'down' && message) {
        showBanner(message);
      } else {
        hideBanner();
      }
    } catch (err) {
      showBanner('Network downtime detected. Retrying...');
    }
  }



// Subscribe to Supabase Realtime channel for instant updates
const channel = supabaseClient.channel('network-status');
channel
  .on('broadcast', { event: 'network-update' }, ({ payload }) => {
    console.log('[DEBUG] Realtime push received:', payload);
    if (payload.status === 'down' && payload.message) {
      showBanner(payload.message);  // Instant display
    } else {
      hideBanner();  // Instant hide
    }
  })
  .subscribe((status) => {
    console.log('[DEBUG] Realtime subscription status:', status);
    if (status === 'SUBSCRIBED') {
      // Optional: Fetch initial status via API if needed
      fetch(`${window.__SEC_API_BASE}/api/status`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          if (data.status === 'down' && data.message) showBanner(data.message);
        })
        .catch(() => showBanner('Network issue detected. Checking...'));
    }
  });

// Network listeners (fallback for offline)
window.addEventListener('online', hideBanner);
window.addEventListener('offline', () => showBanner('You are offline. Working with cached data.'));

  // SW Registration & Update Listener
  async function registerSW() {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/service-worker.js');
        console.log('[DEBUG] SW registered', reg);

        // Listen for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // New content available; reload after 2s
                console.log('[DEBUG] New SW version available. Reloading...');
                setTimeout(() => {
                  if (confirm('Update available! Reload for latest features?')) {
                    window.location.reload();
                  }
                }, 2000);
              } else {
                // First install
                console.log('[DEBUG] SW installed, page reload needed');
                window.location.reload();
              }
            }
          });
        });

        reg.addEventListener('activated', (e) => {
          if (e.isUpdate) console.log('[DEBUG] SW activated - new cache loaded');
        });
      } catch (err) {
        console.warn('[WARN] SW registration failed', err);
      }
    }
  }

  // Version check (fetches manifest to detect deploy)
  async function checkForUpdates() {
    try {
      const res = await fetch(`/frontend/pwa/manifest.json?v=${APP_VERSION}`);
      if (!res.ok) throw new Error('Version check failed');
      console.log('[DEBUG] App up-to-date');
    } catch (err) {
      console.log('[DEBUG] Version mismatch - triggering reload');
      window.location.reload();
    }
  }

  // 🚀 Integrate: Register SW, check updates, start polling
  registerSW();
  checkForUpdates();
  pollStatus(); // Initial
  setInterval(pollStatus, 30000); // Every 30s


}

// 🚀 Setup broadcast subscription
function handleBroadcast(payload) {
  console.log('[BROADCAST RECEIVED]', payload);

  // Your Supabase broadcast already has message & url at the root
  const { message, url } = payload;

  if (message) {
    showBanner(message);

    // Optional: forward to SW for push-style notif
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'BROADCAST_NOTIFICATION',
        payload: { message, url }
      });
    }
  }
}




function setupBroadcastSubscription() {
  function handleBroadcastRow(row) {
    if (!row) return;
    const now = new Date();
    const startsOk = !row.starts_at || new Date(row.starts_at) <= now;
    const notExpired = !row.expire_at || new Date(row.expire_at) > now;
    if (row.active && startsOk && notExpired) {
      showBanner(row.message || '');
      localStorage.setItem('active_broadcast_id', row.id);
    } else {
      const showingId = localStorage.getItem('active_broadcast_id');
      if (showingId && String(showingId) === String(row.id)) {
        hideBanner();
        localStorage.removeItem('active_broadcast_id');
      }
    }
  }

  supabaseClient
    .channel('public:broadcasts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'broadcasts' }, (payload) => {
      console.log('[BROADCAST INSERT]', payload);
      handleBroadcastRow(payload.new);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'broadcasts' }, (payload) => {
      console.log('[BROADCAST UPDATE]', payload);
      handleBroadcastRow(payload.new);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'broadcasts' }, (payload) => {
      console.log('[BROADCAST DELETE]', payload);
      const showingId = localStorage.getItem('active_broadcast_id');
      if (showingId && String(showingId) === String(payload.old.id)) {
        hideBanner();
        localStorage.removeItem('active_broadcast_id');
      }
    })
    .subscribe();
}






// Call in load: onDashboardLoad();

// Remove fetchUserData and consolidate into getSession
// --- Lazy loadUserProfile with cache check ---
async function loadUserProfile(noCache = false) {
  // NEW: Early bail if cache is fresh and not forced
  const cachedUserData = localStorage.getItem('userData');
  if (!noCache && cachedUserData) {
    try {
      const parsed = JSON.parse(cachedUserData);
      if (Date.now() - parsed.cachedAt < 300000) { // 5min TTL
        console.log('[DEBUG] loadUserProfile: Fresh cache, skipping fetch');
        return parsed; // Return cache instead of fetching
      }
    } catch (e) {
      console.warn('[WARN] loadUserProfile: Invalid cache, proceeding to fetch');
    }
  }

  try {
    console.log('[DEBUG] loadUserProfile: Initiating fetch, credentials: include, time:', new Date().toISOString());

    // Cookie-first: do not use localStorage tokens. Browser will send httpOnly cookies automatically.
    const headers = { 'Accept': 'application/json' };

    let url = 'https://api.flexgig.com.ng/api/profile';
    if (noCache) {
      url += `?_${Date.now()}`;
    }

    // Use helper for auto-refresh on 401
    const response = await fetchWithAutoRefresh(url, { method: 'GET', headers });

    console.log('[DEBUG] loadUserProfile: Response status', response.status, 'Headers', [...response.headers]);

    let parsedData = null;
    try {
      // prefer .json() but guard for empty body / invalid json
      const txt = await response.text();
      parsedData = txt ? JSON.parse(txt) : null;
    } catch (e) {
      console.warn('[WARN] loadUserProfile: Response not valid JSON or empty');
      parsedData = null;
    }

    if (!response.ok) {
      const serverMsg = (parsedData && (parsedData.error || parsedData.message)) || `HTTP ${response.status}`;
      console.error('[ERROR] Profile update failed.', serverMsg);
      throw new Error(serverMsg);
    }

    const data = parsedData || {};
    console.log('[DEBUG] loadUserProfile: Parsed response data', data);

    // Your existing localStorage updates (only if changed)...
    const currentUsername = localStorage.getItem('username') || '';
    const currentProfilePicture = localStorage.getItem('profilePicture') || '';
    if (data.username && data.username !== currentUsername) {
      localStorage.setItem('username', data.username);
    }
    if (data.phoneNumber) {
      localStorage.setItem('phoneNumber', data.phoneNumber);
    }
    if (data.address) {
      localStorage.setItem('address', data.address);
    }
    if (data.profilePicture && data.profilePicture !== currentProfilePicture) {
      localStorage.setItem('profilePicture', data.profilePicture);
    }
    if (data.fullName) {
      localStorage.setItem('fullName', data.fullName);
      localStorage.setItem('fullNameEdited', data.fullNameEdited ? 'true' : 'false');
      localStorage.setItem('firstName', data.fullName.split(' ')[0] || localStorage.getItem('firstName') || 'User');
    }
    if (data.lastUsernameUpdate) {
      localStorage.setItem('lastUsernameUpdate', data.lastUsernameUpdate);
    }

    // Update userData cache with new profile info
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    userData.username = data.username || userData.username;
    userData.fullName = data.fullName || userData.fullName;
    userData.profilePicture = data.profilePicture || userData.profilePicture;
    userData.cachedAt = Date.now();
    localStorage.setItem('userData', JSON.stringify(userData));

    // Your existing DOM update logic (only if changed)...
    const firstnameEl = document.getElementById('firstname');
    const avatarEl = document.getElementById('avatar');
    if (!firstnameEl || !avatarEl) {
      console.error('[ERROR] loadUserProfile: Missing DOM elements', { firstnameEl: !!firstnameEl, avatarEl: !!avatarEl });
      return data;
    }

    const firstName = data.fullName?.split(' ')[0] || localStorage.getItem('firstName') || 'User';
    const profilePicture = data.profilePicture || localStorage.getItem('profilePicture') || '';
    const isValidProfilePicture = profilePicture && /^(data:image\/|https?:\/\/|\/)/i.test(profilePicture);
    const displayName = data.username || firstName || 'User';

    // Diff and update only if changed (your logic, but tighter checks)
    const currentDisplay = firstnameEl.textContent?.toLowerCase() || '';
    const newDisplay = (displayName.charAt(0).toUpperCase() + displayName.slice(1)).toLowerCase();
    if (currentDisplay !== newDisplay) {
      firstnameEl.textContent = displayName.charAt(0).toUpperCase() + displayName.slice(1);
    }

    const currentAvatarHTML = avatarEl.innerHTML;
    const newAvatarHTML = isValidProfilePicture 
      ? `<img src="${profilePicture}" alt="Profile Picture" class="avatar-img" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
      : displayName.charAt(0).toUpperCase();
    if (currentAvatarHTML !== newAvatarHTML) {
      avatarEl.innerHTML = newAvatarHTML;
      if (isValidProfilePicture) {
        avatarEl.removeAttribute('aria-label');
      } else {
        avatarEl.setAttribute('aria-label', displayName);
      }
    }

    return data;
  } catch (err) {
    console.error('[ERROR] loadUserProfile: Fetch failed', err);
    // Fallback: return cached data if available
    if (cachedUserData) {
      try {
        return JSON.parse(cachedUserData);
      } catch (e) {
        console.warn('[WARN] loadUserProfile: Cache invalid on error fallback');
      }
    }
    throw err; // Re-throw if no fallback
  }
}









let userEmail = localStorage.getItem('userEmail') || '';
let firstName = localStorage.getItem('firstName') || '';




// In dashboard.js
const deleteKey = document.getElementById('deleteKey');
deleteKey.addEventListener('click', () => {
  if (currentPin.length > 0) {
    currentPin = currentPin.slice(0, -1);
    pinInputs[currentPin.length].classList.remove('filled');
    pinInputs[currentPin.length].value = '';
  }
});

// document.addEventListener('DOMContentLoaded', fetchUserData);

// Update DOM with greeting and avatar
// Updates the dashboard greeting and avatar based on user data
// Helper: robust image source check (re-usable)
function isValidImageSource(src) {
  if (!src) return false;
  return /^(data:image\/|https?:\/\/|\/)/i.test(src);
}

function updateGreetingAndAvatar(username, firstName, imageUrl) {
  const avatarEl = document.getElementById('avatar');
  const firstnameEl = document.getElementById('firstname');
  const greetEl = document.getElementById('greet');

  if (!avatarEl || !firstnameEl || !greetEl) return;

  const hour = new Date().getHours();
  greetEl.textContent = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  const profilePicture = (imageUrl !== undefined ? imageUrl : localStorage.getItem('profilePicture')) || '';
  const displayName = (username || firstName || 'User').toString();
  const displayNameCapitalized = displayName.charAt(0).toUpperCase() + displayName.slice(1);

  // If image URL is valid show <img>, otherwise show initial
  if (isValidImageSource(profilePicture)) {
    // Append cache-bust token so browser reloads the image when needed.
    const cacheSrc = profilePicture.includes('?') ? `${profilePicture}&v=${Date.now()}` : `${profilePicture}?v=${Date.now()}`;
    avatarEl.innerHTML = `<img src="${cacheSrc}" alt="Profile Picture" class="avatar-img" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    avatarEl.removeAttribute('aria-label');
  } else {
    avatarEl.innerHTML = '';
    avatarEl.textContent = displayName.charAt(0).toUpperCase();
    avatarEl.setAttribute('aria-label', displayNameCapitalized);
  }

  firstnameEl.textContent = displayNameCapitalized;
}


let recentTransactions = JSON.parse(localStorage.getItem('recentTransactions')) || [];

// --- SVG IMAGE PATHS FOR PROVIDERS ---
const svgPaths = {
  mtn: '/frontend/svg/MTN-icon.svg',
  airtel: '/frontend/svg/airtel-icon.svg',
  glo: '/frontend/svg/GLO-icon.svg',
  ninemobile: '/frontend/svg/9mobile-icon.svg'
};
const svgShapes = {
  mtn: `<svg class="yellow-circle-icon" width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#FFD700"/></svg>`,
  airtel: `<svg class="airtel-rect-icon" width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="4" y="6" width="20" height="12" rx="4" fill="#e4012b"/></svg>`,
  glo: `<svg class="glo-diamond-icon" width="28" height="28" viewBox="0 0 24 24" fill="none"><polygon points="12,2 22,12 12,22 2,12" fill="#00B13C"/></svg>`,
  ninemobile: `<svg class="ninemobile-triangle-icon" width="28" height="28" viewBox="0 0 24 24" fill="none"><polygon points="12,3 21,21 3,21" fill="#7DB700"/></svg>`,
  receive: `<svg class="bank-icon" width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M4 9v9h16V9l-8-5-8 5zm4 4h8v2H8v-2zm0 4h4v2H8v-2z" fill="#00cc00" stroke="#fff" stroke-width="1"/></svg>`
};

// --- MAIN EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
  const providerClasses = ['mtn', 'airtel', 'glo', 'ninemobile'];
  const serviceItems = document.querySelectorAll('.short-item');
  const providers = document.querySelectorAll('.provider-box');
  const plansRow = document.querySelector('.plans-row');
  const continueBtn = document.getElementById('continueBtn');
  const phoneInput = document.getElementById('phone-input');
  const contactBtn = document.querySelector('.contact-btn');
  const allPlansModal = document.getElementById('allPlansModal');
  const openBtn = document.querySelector('.see-all-plans');
  const allPlansModalContent = allPlansModal.querySelector('.plan-modal-content');
  const pullHandle = allPlansModal.querySelector('.pull-handle');
  const slider = document.querySelector('.provider-grid .slider');

  // --- DEBOUNCE FUNCTION ---
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // --- PROVIDER DETECTION ---
  const providerPrefixes = {
    mtn: ['0703', '0706', '0803', '0806', '0810', '0813', '0814', '0816', '0903', '0906', '0913', '0916', '0702', '0704', '0810'],
    glo: ['0705', '0805', '0807', '0811', '0815', '0905', '0915'],
    airtel: ['0701', '0708', '0802', '0808', '0812', '0901', '0902', '0904', '0907', '0912', '0911'],
    ninemobile: ['0809', '0817', '0818', '0908', '0909']
  };

  function detectProvider(phone) {
    let normalized = phone.replace(/^\+234/, '0');
    if (!normalized.startsWith('0')) normalized = '0' + normalized;
    const prefix = normalized.slice(0, 4);
    for (const [provider, prefixes] of Object.entries(providerPrefixes)) {
      if (prefixes.includes(prefix)) {
        return provider === 'ninemobile' ? '9mobile' : provider.charAt(0).toUpperCase() + provider.slice(1);
      }
    }
    return null;
  }

  // --- PHONE NUMBER FORMATTING ---
  // --- PHONE NUMBER FORMATTING ---
// --- PHONE NUMBER FORMATTING ---
function formatNigeriaNumber(phone, isInitialDigit = false, isPaste = false) {
  try {
    if (!phone) {
      console.warn('[WARN] formatNigeriaNumber: Empty phone input');
      return { value: '', cursorOffset: 0, valid: false };
    }
    let cleaned = phone.replace(/[\s-]/g, '');
    let cursorOffset = 0;
    if (isInitialDigit && ['7', '8', '9'].includes(cleaned[0])) {
      cleaned = '0' + cleaned;
      cursorOffset = 1;
    }
    if (cleaned.startsWith('234') || cleaned.startsWith('+234')) {
      cleaned = '0' + cleaned.slice(3);
    }
    if (cleaned.length > 11) {
      cleaned = cleaned.slice(0, 11);
    }
    const isValid = cleaned.length === 11 && /^0[789][01]\d{8}$/.test(cleaned);
    if (!isValid) {
      console.warn('[WARN] formatNigeriaNumber: Invalid phone number:', cleaned);
      return { value: cleaned, cursorOffset, valid: false };
    }
    if (cleaned.length >= 4) {
      if (cleaned.length <= 7) {
        return { value: `${cleaned.slice(0, 4)} ${cleaned.slice(4)}`, cursorOffset, valid: true };
      }
      return { value: `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`, cursorOffset, valid: true };
    }
    return { value: cleaned, cursorOffset, valid: cleaned.length === 11 };
  } catch (error) {
    console.error('[ERROR] formatNigeriaNumber:', error.message);
    return { value: '', cursorOffset: 0, valid: false };
  }
}

  // --- VALIDATION HELPERS ---
  function isNigeriaMobile(val) {
    const cleaned = val.replace(/\s/g, '');
    const prefix = cleaned.slice(0, 4);
    return cleaned.length === 11 && cleaned.startsWith('0') && Object.values(providerPrefixes).flat().includes(prefix);
  }

  function isValidPhone(val) {
    const cleaned = val.replace(/\s/g, '');
    return /^0\d{10}$/.test(cleaned);
  }

  function isProviderSelected() {
    return !!providerClasses.find(cls => slider.classList.contains(cls));
  }

  function isPlanSelected() {
    return !!plansRow.querySelector('.plan-box.selected');
  }

  function saveUserState() {
    const activeProvider = providerClasses.find(cls => slider.classList.contains(cls));
    const selectedPlan = plansRow.querySelector('.plan-box.selected');
    const phoneNumber = phoneInput.value;
    const rawNumber = normalizePhone(phoneNumber);

    if (!rawNumber) {
      console.warn('[WARN] saveUserState: Invalid phone number:', phoneNumber);
      // Do not save invalid phone numbers
    }

    localStorage.setItem('userState', JSON.stringify({
      provider: activeProvider || '',
      planId: selectedPlan ? selectedPlan.getAttribute('data-id') : '',
      number: rawNumber || '',   // Save empty string instead of invalid
      serviceIdx: [...serviceItems].findIndex(el => el.classList.contains('active')),
    }));

    console.log('[DEBUG] saveUserState: Saved state:', {
      provider: activeProvider,
      planId: selectedPlan ? selectedPlan.getAttribute('data-id') : '',
      number: rawNumber,
    });
  }


  // --- CUSTOM SMOOTH SCROLL ---
  function smoothScroll(element, target, duration) {
    const start = element.scrollLeft;
    const change = target - start;
    let startTime = null;

    function animateScroll(currentTime) {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 0.5 - 0.5 * Math.cos(progress * Math.PI);
      element.scrollLeft = start + change * ease;
      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      }
    }
    requestAnimationFrame(animateScroll);
  }

  // --- SLIDER MOVEMENT ---
  function moveSliderTo(box) {
    const boxRect = box.getBoundingClientRect();
    const gridRect = box.parentElement.getBoundingClientRect();
    const scrollContainer = box.closest('.provider-grid');
    const scrollLeft = scrollContainer.scrollLeft;

    const left = boxRect.left - gridRect.left + scrollLeft;
    const top = boxRect.top - gridRect.top;

    slider.style.width = `${boxRect.width}px`;
    slider.style.height = `${boxRect.height}px`;
    slider.style.left = `${left}px`;
    slider.style.top = `${top}px`;
    slider.style.transition = 'all 0.3s ease';

    console.log('[DEBUG] moveSliderTo: Slider moved to', {
      provider: box.classList,
      left: left,
      top: top,
      width: boxRect.width,
      height: boxRect.height,
      scrollLeft: scrollLeft
    });
  }

  // --- HANDLE RESIZE ---
  function handleResize() {
    const activeProvider = document.querySelector('.provider-box.active');
    if (activeProvider) {
      moveSliderTo(activeProvider);
      console.log('[DEBUG] handleResize: Slider re-aligned to active provider:', activeProvider.classList);
    }
  }

  const debouncedHandleResize = debounce(handleResize, 100);
  window.addEventListener('resize', debouncedHandleResize);

  // --- PROVIDER SELECTION ---
  let providerTransitioning = false;
  let pendingProvider = null;

  function selectProvider(providerClass) {
    const providerBox = document.querySelector(`.provider-box.${providerClass}`);
    const currentActive = document.querySelector('.provider-box.active');
    const currentProvider = providerClasses.find(cls => currentActive?.classList.contains(cls));

    if (!providerBox || currentProvider === providerClass) return;

    if (providerTransitioning) {
      pendingProvider = providerClass;
      return;
    }

    providerTransitioning = true;
    pendingProvider = null;

    if (currentActive) currentActive.classList.remove('active');

    slider.style.transition = 'transform 0.5s ease, opacity 0.5s ease, box-shadow 0.5s ease';
    slider.style.transformOrigin = 'left center';
    slider.style.transform = 'rotateY(90deg) scale(0.8)';
    slider.style.opacity = '0';
    slider.style.boxShadow = '5px 5px 20px rgba(0,0,0,0.2)';

    const providerGrid = providerBox.closest('.provider-grid') || providerBox.closest('.provider-row');
    if (providerGrid) {
      const scrollContainer = providerGrid;
      const boxRect = providerBox.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const gap = 12;
      const scrollTarget = boxRect.left + scrollContainer.scrollLeft - containerRect.left
        - (containerRect.width - boxRect.width) / 2
        + (gap * providerClasses.indexOf(providerClass));
      smoothScroll(scrollContainer, scrollTarget, 350);
    }

    const providerNames = { mtn: 'MTN', airtel: 'AIRTEL', glo: 'GLO', ninemobile: '9MOBILE' };

    moveSliderTo(providerBox);

    const handleTransitionEnd = (e) => {
      if (!['left', 'top', 'width', 'height', 'transform', 'opacity'].includes(e.propertyName)) return;

      slider.removeEventListener('transitionend', handleTransitionEnd);

      slider.className = `slider ${providerClass}`;
      slider.innerHTML = `
        <img src="${svgPaths[providerClass]}" alt="${providerNames[providerClass]}" class="provider-icon" />
        <div class="provider-name">${providerNames[providerClass]}</div>
      `;

      slider.style.transition = 'none';
      slider.style.transformOrigin = 'right center';
      slider.style.transform = 'rotateY(90deg) scale(0.8)';
      slider.style.opacity = '0';
      slider.style.boxShadow = '5px 5px 20px rgba(0,0,0,0.2)';

      requestAnimationFrame(() => {
        slider.style.transition = 'transform 0.5s ease, opacity 0.5s ease, box-shadow 0.5s ease';
        slider.style.transform = 'rotateY(0deg) scale(1)';
        slider.style.opacity = '1';
        slider.style.boxShadow = '0px 5px 20px rgba(0,0,0,0.2)';
      });

      providerBox.classList.add('active');

      plansRow.classList.remove(...providerClasses);
      plansRow.classList.add(providerClass);
      plansRow.querySelectorAll('.plan-box').forEach(plan => {
        plan.classList.remove(...providerClasses);
        if (plan.classList.contains('selected')) plan.classList.add(providerClass);
      });
      allPlansModal.querySelectorAll('.plan-box.selected').forEach(p => p.classList.remove('selected', ...providerClasses));

      renderDashboardPlans(providerClass);
      renderModalPlans(providerClass);
      attachPlanListeners();
      logPlanIDs();
      updateContinueState();
      saveUserState();

      providerTransitioning = false;

      if (pendingProvider && pendingProvider !== providerClass) {
        selectProvider(pendingProvider);
      }
    };

    slider.addEventListener('transitionend', handleTransitionEnd);
  }

  // --- PLAN ID GENERATOR ---
  function generatePlanId(provider, subType, plan) {
    return `${provider}${subType ? subType : ''}${plan.price}${plan.data.replace(/\W/g, '')}${plan.duration.replace(/\W/g, '')}`.toLowerCase();
  }

  // --- RENDER DASHBOARD PLANS ---
  function renderDashboardPlans(provider) {
    const plansRow = document.querySelector('.plans-row');
    if (!plansRow) return;
    Array.from(plansRow.querySelectorAll('.plan-box')).forEach(p => p.remove());
    let plansToShow = [];
    if (provider === 'mtn') {
      if (mtnAwoofPlans[0]) plansToShow.push({ subType: 'awoof', plan: mtnAwoofPlans[0] });
      if (mtnGiftingPlans[0]) plansToShow.push({ subType: 'gifting', plan: mtnGiftingPlans[0] });
    } else if (provider === 'airtel') {
      if (airtelAwoofPlans[0]) plansToShow.push({ subType: 'awoof', plan: airtelAwoofPlans[0] });
      if (airtelCgPlans[0]) plansToShow.push({ subType: 'cg', plan: airtelCgPlans[0] });
    } else if (provider === 'glo') {
      if (gloCgPlans[0]) plansToShow.push({ subType: 'cg', plan: gloCgPlans[0] });
      if (gloGiftingPlans[0]) plansToShow.push({ subType: 'gifting', plan: gloGiftingPlans[0] });
    } else if (provider === 'ninemobile') {
      if (ninemobilePlans[0]) plansToShow.push({ subType: '', plan: ninemobilePlans[0] });
      if (ninemobilePlans[1]) plansToShow.push({ subType: '', plan: ninemobilePlans[1] });
    }
    const seeAllBtn = plansRow.querySelector('.see-all-plans');
    plansToShow.forEach(item => {
      const { plan, subType } = item;
      const box = document.createElement('div');
      box.className = `plan-box ${provider}`;
      box.setAttribute('data-id', generatePlanId(provider, subType, plan));
      const tag = subType && provider !== 'ninemobile' ? `<span class="plan-type-tag">${subType.charAt(0).toUpperCase() + subType.slice(1)}</span>` : '';
      box.innerHTML = `
        <div class="plan-price plan-amount">₦${plan.price}</div>
        <div class="plan-data plan-gb">${plan.data}</div>
        <div class="plan-duration">${plan.duration}</div>
        ${tag}
      `;
      plansRow.insertBefore(box, seeAllBtn);
    });
  }

  // --- RENDER MODAL PLANS ---
function renderModalPlans(activeProvider) {
  const allPlansModal = document.getElementById('allPlansModal');
  if (!allPlansModal) return;

  const sectionMap = [
    { provider: 'mtn', subType: 'awoof', plans: mtnAwoofPlans, title: 'MTN AWOOF', svg: svgShapes.mtn },
    { provider: 'mtn', subType: 'gifting', plans: mtnGiftingPlans, title: 'MTN GIFTING', svg: svgShapes.mtn },
    { provider: 'airtel', subType: 'awoof', plans: airtelAwoofPlans, title: 'AIRTEL AWOOF', svg: svgShapes.airtel },
    { provider: 'airtel', subType: 'cg', plans: airtelCgPlans, title: 'AIRTEL CG', svg: svgShapes.airtel },
    { provider: 'glo', subType: 'cg', plans: gloCgPlans, title: 'GLO CG', svg: svgShapes.glo },
    { provider: 'glo', subType: 'gifting', plans: gloGiftingPlans, title: 'GLO GIFTING', svg: svgShapes.glo },
    { provider: 'ninemobile', subType: '', plans: ninemobilePlans, title: '9MOBILE', svg: svgShapes.ninemobile }
  ];

  const awoofSection = allPlansModal.querySelector('.plan-section.awoof-section');
  const giftingSection = allPlansModal.querySelector('.plan-section.gifting-section');

  if (giftingSection) {
    giftingSection.style.display = activeProvider === 'ninemobile' ? 'none' : 'block';
  }
  if (awoofSection) {
    awoofSection.style.display = 'block';
  }

  const providerSections = sectionMap.filter(s => s.provider === activeProvider);

  // Render first section (awoof/cg/…)
  if (providerSections.length >= 1 && awoofSection) {
    const { provider, subType, plans, title, svg } = providerSections[0];
    fillPlanSection(awoofSection, provider, subType, plans, title, svg);
  }

  // Render second section (gifting/…)
  if (providerSections.length >= 2 && giftingSection) {
    const { provider, subType, plans, title, svg } = providerSections[1];
    fillPlanSection(giftingSection, provider, subType, plans, title, svg);
  }

  console.log(`[DEBUG] renderModalPlans: Populated modal sections for ${activeProvider}`);
}

// helper: fill a modal section
function fillPlanSection(sectionEl, provider, subType, plans, title, svg) {
  sectionEl.setAttribute('data-provider', provider);
  const grid = sectionEl.querySelector('.plans-grid');
  if (grid) {
    grid.innerHTML = '';
    plans.forEach(plan => {
      const box = document.createElement('div');
      box.className = `plan-box ${provider}`;
      box.setAttribute('data-id', generatePlanId(provider, subType, plan));
      box.innerHTML = `
        <div class="plan-amount">₦${plan.price}</div>
        <div class="plan-data">${plan.data}</div>
        <div class="plan-days">${plan.duration}</div>
      `;
      grid.appendChild(box);
    });
  }
  const header = sectionEl.querySelector('.section-header');
  if (header) {
    const existingSvg = header.querySelector('svg');
    if (existingSvg) existingSvg.remove();
    header.insertAdjacentHTML('afterbegin', svg);
    const h2 = header.querySelector('h2');
    if (h2) h2.textContent = title;
  }
}
const seeAllBtn = document.querySelector('.see-all-plans');
if (seeAllBtn) {
  seeAllBtn.addEventListener('click', () => {
    if (window.ModalManager && typeof ModalManager.openModal === 'function') {
      ModalManager.openModal('allPlansModal');
      console.log('[DEBUG] See All Plans: Modal opened via ModalManager');
    } else {
      if (allPlansModal) {
        allPlansModal.classList.remove('hidden');
        allPlansModal.classList.add('active');
        allPlansModal.style.display = 'flex';
        allPlansModal.setAttribute('aria-hidden', 'false');
      }
    }
  });
}



  // --- LOG PLAN IDs ---
  function logPlanIDs() {
    const dashboardPlanIDs = Array.from(plansRow.querySelectorAll('.plan-box')).map(p => p.getAttribute('data-id'));
    const modalPlanIDs = Array.from(allPlansModal.querySelectorAll('.plan-box')).map(p => p.getAttribute('data-id'));
    console.log('[RAW LOG] Dashboard plan IDs:', dashboardPlanIDs);
    console.log('[RAW LOG] Modal plan IDs:', modalPlanIDs);
  }

  // --- PLAN SELECTION ---
  function selectPlanById(id) {
    document.querySelectorAll('.plan-box.selected').forEach(p => 
      p.classList.remove('selected', 'mtn', 'airtel', 'glo', 'ninemobile'));

    const activeProvider = providerClasses.find(cls => slider.classList.contains(cls));

    const dashPlan = plansRow.querySelector(`.plan-box[data-id="${id}"]`);
    if (dashPlan) {
      dashPlan.classList.add('selected', activeProvider);
      console.log('[RAW LOG] Dashboard plan selected for id:', id, dashPlan.textContent.trim());
    } else {
      console.log('[RAW LOG] No dashboard plan found for id:', id);
    }

    const modalPlan = allPlansModal.querySelector(`.plan-box[data-id="${id}"]`);
    if (modalPlan) {
      modalPlan.classList.add('selected', activeProvider);
      console.log('[RAW LOG] Modal plan selected for id:', id, modalPlan.textContent.trim());
    } else {
      console.log('[RAW LOG] No modal plan found for id:', id);
      const allModalPlans = Array.from(allPlansModal.querySelectorAll('.plan-box'));
      console.log('[RAW LOG] Modal plan IDs:', allModalPlans.map(p => p.getAttribute('data-id')));
    }

    document.querySelectorAll('.plan-box').forEach(p => {
      const amount = p.querySelector('.plan-amount');
      if (amount && !p.closest('.plan-modal-content')) {
        if (p.classList.contains('selected')) {
          amount.classList.add('plan-price');
        } else {
          amount.classList.remove('plan-price');
        }
      }
      if (amount && p.closest('.plan-modal-content')) {
        amount.classList.remove('plan-price');
        amount.classList.add('plan-amount');
      }
    });

    updateContinueState();
    saveUserState();
  }

  // --- ATTACH PLAN LISTENERS ---
  function attachPlanListeners() {
    document.querySelectorAll('.plan-box').forEach(p => {
      p.removeEventListener('click', handlePlanClick);
      p.addEventListener('click', handlePlanClick);
    });
  }

  // --- PLAN CLICK HANDLER ---
  function handlePlanClick(e) {
    const plan = e.currentTarget;
    const id = plan.getAttribute('data-id');
    const isModalClick = plan.closest('.plan-modal-content');
    const activeProvider = providerClasses.find(cls => slider.classList.contains(cls));

    const dashPlan = plansRow.querySelector(`.plan-box[data-id="${id}"]`);
    const isDashSelected = dashPlan && dashPlan.classList.contains('selected');

    if (isModalClick && isDashSelected) {
      e.stopPropagation();
      closeModal();
      console.log('[DEBUG] handlePlanClick: Reselected same plan, modal closed, ID:', id);
    } else if (isModalClick) {
      const dashPlans = Array.from(plansRow.querySelectorAll('.plan-box'));
      const sameAsFirst = dashPlans.length && dashPlans[0].getAttribute('data-id') === id;
      selectPlanById(id);
      if (!sameAsFirst) {
        const cloneForDashboard = plan.cloneNode(true);
        cloneForDashboard.classList.add(activeProvider);
        let subType = '';
        if (activeProvider === 'mtn') {
          subType = id.includes('awoof') ? 'awoof' : id.includes('gifting') ? 'gifting' : '';
        } else if (activeProvider === 'airtel') {
          subType = id.includes('awoof') ? 'awoof' : id.includes('cg') ? 'cg' : '';
        } else if (activeProvider === 'glo') {
          subType = id.includes('cg') ? 'cg' : id.includes('gifting') ? 'gifting' : '';
        }
        if (subType && activeProvider !== 'ninemobile') {
          const tag = document.createElement('span');
          tag.className = 'plan-type-tag';
          tag.textContent = subType.charAt(0).toUpperCase() + subType.slice(1);
          cloneForDashboard.appendChild(tag);
        }
        plansRow.insertBefore(cloneForDashboard, plansRow.firstChild);
        const allDashPlans = Array.from(plansRow.querySelectorAll('.plan-box'));
        if (allDashPlans.length > 2) {
          plansRow.removeChild(allDashPlans[2]);
        }
        cloneForDashboard.addEventListener('click', handlePlanClick);
        console.log('[DEBUG] handlePlanClick: Cloned modal plan to dashboard, ID:', id);
      } else {
        dashPlans[0].classList.add('selected', activeProvider);
        console.log('[DEBUG] handlePlanClick: Selected first dashboard plan, no cloning needed, ID:', id);
      }
      saveUserState();
      closeModal();
    } else {
      selectPlanById(id);
    }
  }

  // --- UPDATE CONTACT/CANCEL BUTTON ---
  function updateContactOrCancel() {
    if (phoneInput.value.length > 0) {
      contactBtn.innerHTML = cancelSVG;
      const cancelBtn = contactBtn.querySelector('.cancel-btn');
      if (cancelBtn) {
        cancelBtn.removeEventListener('mousedown', handleCancelClick);
        cancelBtn.addEventListener('mousedown', handleCancelClick);
      }
    } else {
      contactBtn.innerHTML = contactSVG;
    }

    function handleCancelClick(e) {
      e.preventDefault();
      phoneInput.value = '';
      contactBtn.innerHTML = contactSVG;
      phoneInput.focus();
      updateContinueState();
      saveUserState();
    }
  }

  // --- UPDATE CONTINUE BUTTON ---
  function updateContinueState() {
    const phoneValid = isValidPhone(phoneInput.value);
    if (phoneValid && isProviderSelected() && isPlanSelected()) {
      continueBtn.disabled = false;
      continueBtn.classList.add('active');
    } else {
      continueBtn.disabled = true;
      continueBtn.classList.remove('active');
    }
  }

  // --- OPEN PLANS MODAL ---
  function openModal() {
    const dashSelected = plansRow.querySelector('.plan-box.selected');
    const activeProvider = providerClasses.find(cls => slider.classList.contains(cls));

    allPlansModalContent.scrollTop = 0;
    console.log('[DEBUG] openModal: Scroll position reset to top for provider:', activeProvider);
    const awoofSection = allPlansModal.querySelector('.plan-section.awoof-section');
    const giftingSection = allPlansModal.querySelector('.plan-section.gifting-section');
    if (giftingSection) {
      giftingSection.style.display = activeProvider === 'ninemobile' ? 'none' : 'block';
      console.log(`[DEBUG] openModal: Gifting section display set to ${giftingSection.style.display} for provider ${activeProvider}`);
    }
    if (awoofSection) {
      awoofSection.style.display = 'block';
      console.log(`[DEBUG] openModal: Awoof section display set to ${awoofSection.style.display} for provider ${activeProvider}`);
    }

    if (dashSelected) {
      const id = dashSelected.getAttribute('data-id');
      allPlansModal.querySelectorAll('.plan-box.selected').forEach(p => p.classList.remove('selected'));
      const modalPlan = allPlansModal.querySelector(`.plan-box[data-id="${id}"]`);
      if (modalPlan) {
        modalPlan.classList.add('selected');
        console.log('[RAW LOG] Modal plan selected on openModal. Plan ID:', id, 'Text:', modalPlan.textContent.trim());
      } else {
        console.log('[RAW LOG] openModal: No matching modal plan for ID', id);
        const allModalPlans = Array.from(allPlansModal.querySelectorAll('.plan-box'));
        console.log('[RAW LOG] openModal: Modal plan IDs:', allModalPlans.map(p => p.getAttribute('data-id')));
      }
    }
    allPlansModal.classList.add('active');
    allPlansModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    allPlansModal.focus();
    history.pushState({ popup: true }, '', location.href);
    setTimeout(() => {
      const modalSelected = allPlansModal.querySelector('.plan-box.selected');
      if (modalSelected) {
        modalSelected.scrollIntoView({ behavior: 'smooth', block: 'center' });
        console.log('[RAW LOG] Modal auto-scrolled to selected plan:', modalSelected.textContent.trim());
      }
    }, 50);
  }

  // --- CLOSE PLANS MODAL ---
  function closeModal() {
    allPlansModal.classList.remove('active');
    allPlansModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    allPlansModalContent.style.transform = 'translateY(0)';
    if (history.state && history.state.popup) history.back();
  }

  // --- FIND PLAN BY ID ---
  function findPlanById(planId, provider) {
    const plansMap = {
      mtn: [...mtnAwoofPlans.map(p => ({ ...p, subType: 'awoof' })), ...mtnGiftingPlans.map(p => ({ ...p, subType: 'gifting' }))],
      airtel: [...airtelAwoofPlans.map(p => ({ ...p, subType: 'awoof' })), ...airtelCgPlans.map(p => ({ ...p, subType: 'cg' }))],
      glo: [...gloCgPlans.map(p => ({ ...p, subType: 'cg' })), ...gloGiftingPlans.map(p => ({ ...p, subType: 'gifting' }))],
      ninemobile: ninemobilePlans.map(p => ({ ...p, subType: '' }))
    };
    return plansMap[provider]?.find(p => generatePlanId(provider, p.subType, p) === planId);
  }

  // Full triggerCheckoutReauth - call this from your checkout flow
async function triggerCheckoutReauth() {
  console.log('triggerCheckoutReauth called');
  try {
    const reauthStatus = await shouldReauth();
    console.log('triggerCheckoutReauth: reauthStatus', reauthStatus);

    if (!reauthStatus.needsReauth) {
      console.log('triggerCheckoutReauth: no reauth needed for checkout');
      return { success: true };
    }

    if (reauthStatus.method === 'biometric') {
  const session = await safeCall(getSession) || {};
  const uid = session.user ? (session.user.uid || session.user.id) : null;
  if (!uid) {
    console.warn('triggerCheckoutReauth: no uid, opening modal for PIN/fallback');
    await showReauthModal('checkout');
    return { success: false, requiresModal: true };
  }

  // Client-side guard: ensure biometrics enabled globally and for transactions
  const isBiometricsEnabled = localStorage.getItem('biometricsEnabled') === 'true';
  const bioTxEnabled = localStorage.getItem('biometricForTx') === 'true';
  if (!isBiometricsEnabled || !bioTxEnabled) {
    // fallback to modal / PIN flow
    await showReauthModal('checkout');
    return { success: false, requiresModal: true, error: 'biometrics-disabled-for-transaction' };
  }

  // Use 'transaction' so it matches your shouldReauth/server checks
  const { success, result, error } = await verifyBiometrics(uid, 'transaction');
  if (success) {
    console.log('triggerCheckoutReauth: biometric success for checkout');
    return { success: true, result };
  }
  console.log('triggerCheckoutReauth: biometric failed for checkout, opening modal');
  await showReauthModal('checkout');
  return { success: false, requiresModal: true, error };
}


    // PIN path: show modal (will handle the PIN flow)
    await showReauthModal('checkout');
    return { success: false, requiresModal: true };
  } catch (err) {
    console.error('triggerCheckoutReauth error:', err);
    await showReauthModal('checkout');
    return { success: false, requiresModal: true, error: err.message };
  }
}


  // --- RENDER CHECKOUT MODAL ---
  function renderCheckoutModal() {
  const state = JSON.parse(localStorage.getItem('userState') || '{}');
  const { provider, planId, number } = state;
  if (!provider || !planId || !number) {
    console.log('[DEBUG] renderCheckoutModal: Missing required state:', { provider, planId, number });
    return;
  }

  const plan = findPlanById(planId, provider);
  if (!plan) {
    console.log('[DEBUG] renderCheckoutModal: No plan found for ID:', planId);
    return;
  }

  const phoneEl = document.getElementById('checkout-phone');
  const priceEl = document.getElementById('checkout-price');
  const dataEl = document.getElementById('checkout-data');
  const providerEl = document.getElementById('checkout-provider');
  const payBtn = document.getElementById('payBtn');

  if (phoneEl) {
    const rawNumber = normalizePhone(number); // Ensure raw number is valid
    const formattedNumber = formatNigeriaNumber(rawNumber).value; // Get formatted number
    if (!rawNumber || rawNumber.length !== 11 || !formattedNumber) {
      console.warn('[WARN] renderCheckoutModal: Invalid number - Raw:', rawNumber, 'Formatted:', formattedNumber, 'Original:', number);
      phoneEl.textContent = ''; // Fallback to empty if invalid
    } else {
      phoneEl.textContent = formattedNumber;
      // Inline styles to prevent cutoff of 13-character formatted number
      phoneEl.style.whiteSpace = 'nowrap';
      phoneEl.style.overflow = 'visible';
      phoneEl.style.textOverflow = 'initial';
      phoneEl.style.maxWidth = 'none';
      phoneEl.style.width = 'auto';
      phoneEl.style.display = 'inline-block';
      console.log('[DEBUG] renderCheckoutModal: Phone number set:', formattedNumber, 'Length:', formattedNumber.length, 'Raw:', rawNumber);
    }
  }
  if (priceEl) priceEl.textContent = `₦${plan.price}`;
  if (dataEl) dataEl.textContent = `${plan.data} (${plan.duration})`;
  if (providerEl) {
    const displayName = provider === 'ninemobile' ? '9mobile' : provider.charAt(0).toUpperCase() + provider.slice(1);
    providerEl.innerHTML = `${svgShapes[provider]} ${displayName}`;
    console.log('[DEBUG] renderCheckoutModal: Provider set with SVG:', displayName);
  }
  if (payBtn) {
    payBtn.disabled = false;
    payBtn.classList.add('active');
  }
  console.log('[DEBUG] renderCheckoutModal: Rendered for provider:', provider, 'planId:', planId, 'number:', number);
}

  // --- OPEN CHECKOUT MODAL ---
  function openCheckoutModal() {
    const checkoutModal = document.getElementById('checkoutModal');
    if (!checkoutModal) {
      console.error('[ERROR] openCheckoutModal: #checkoutModal not found in DOM');
      return;
    }
    const checkoutModalContent = checkoutModal.querySelector('.modal-content');
    if (!checkoutModalContent) {
      console.error('[ERROR] openCheckoutModal: .modal-content not found');
      return;
    }
    checkoutModal.style.display = 'none';
    checkoutModal.classList.remove('active');
    checkoutModalContent.style.transform = 'translateY(0)';
    renderCheckoutModal();
    setTimeout(() => {
      checkoutModal.style.display = 'flex';
      checkoutModal.classList.add('active');
      checkoutModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      checkoutModal.focus();
      history.pushState({ popup: true }, '', location.href);
      console.log('[DEBUG] openCheckoutModal: Modal opened, display:', checkoutModal.style.display, 'active:', checkoutModal.classList.contains('active'));
    }, 50);
  }

  // --- CLOSE CHECKOUT MODAL ---
  function closeCheckoutModal() {
    const checkoutModal = document.getElementById('checkoutModal');
    if (!checkoutModal) {
      console.error('[ERROR] closeCheckoutModal: #checkoutModal not found');
      return;
    }
    const checkoutModalContent = checkoutModal.querySelector('.modal-content');
    checkoutModal.classList.remove('active');
    checkoutModal.style.display = 'none';
    checkoutModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    checkoutModalContent.style.transform = 'translateY(100%)';
    if (history.state && history.state.popup) {
      history.back();
      console.log('[DEBUG] closeCheckoutModal: History state popped');
    }
    console.log('[DEBUG] closeCheckoutModal: Modal closed, display:', checkoutModal.style.display, 'active:', checkoutModal.classList.length);
  }

  // --- SERVICE SELECTION ---
  serviceItems.forEach((item, i) => {
    item.addEventListener('click', () => {
      serviceItems.forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      saveUserState();
    });
  });
  serviceItems[0].classList.add('active');

  // --- INITIAL PROVIDER SETUP ---
  function setProviderOnLoad() {
    const mtnProvider = document.querySelector('.provider-box.mtn');
    if (mtnProvider) {
      providers.forEach(p => p.classList.remove('active'));
      mtnProvider.classList.add('active');
      slider.className = 'slider mtn';
      slider.innerHTML = `
        <img src="${svgPaths.mtn}" alt="MTN" class="provider-icon" />
        <div class="provider-name">MTN</div>
      `;
      moveSliderTo(mtnProvider);
      providerClasses.forEach(cls => plansRow.classList.remove(cls));
      plansRow.classList.add('mtn');
      plansRow.querySelectorAll('.plan-box').forEach(plan =>
        plan.classList.remove('selected', ...providerClasses));
      renderDashboardPlans('mtn');
      renderModalPlans('mtn');
      attachPlanListeners();
      logPlanIDs();
      console.log('[DEBUG] setProviderOnLoad: Initialized slider on MTN');
    }
  }
  setProviderOnLoad();

  // --- PROVIDER BOX CLICK ---
  let touchStartX = 0, touchStartY = 0, isScrolling = false;

  const debouncedSelectProvider = debounce((providerClass) => {
    if (!isScrolling) {
      console.log('[DEBUG] debouncedSelectProvider: Triggered for provider:', providerClass);
      selectProvider(providerClass);
    }
  }, 300);

  providers.forEach(box => {
    box.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      isScrolling = false;
      console.log('[DEBUG] provider-box touchstart: Start X:', touchStartX, 'Y:', touchStartY);
    });

    box.addEventListener('touchmove', (e) => {
      const touchX = e.touches[0].clientX;
      const touchY = e.touches[0].clientY;
      const deltaX = Math.abs(touchX - touchStartX);
      const deltaY = Math.abs(touchY - touchStartY);
      if (deltaX > 10 || deltaY > 10) {
        isScrolling = true;
        console.log('[DEBUG] provider-box touchmove: Detected scrolling, deltaX:', deltaX, 'deltaY:', deltaY);
      }
    });

    box.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isScrolling) {
        const selectedProvider = providerClasses.find(cls => box.classList.contains(cls));
        if (selectedProvider) {
          debouncedSelectProvider(selectedProvider);
          console.log('[DEBUG] provider-box touchend: Provider tapped:', selectedProvider);
        }
      }
    });

    box.addEventListener('click', (e) => {
      e.stopPropagation();
      const selectedProvider = providerClasses.find(cls => box.classList.contains(cls));
      if (selectedProvider) {
        debouncedSelectProvider(selectedProvider);
        console.log('[DEBUG] provider-box click: Provider clicked:', selectedProvider);
      }
    });
  });

  // --- PHONE INPUT HANDLING ---
  phoneInput.addEventListener('keypress', (e) => {
    if (e.key === '+') {
      e.preventDefault();
      console.log('[DEBUG] phoneInput keypress: Blocked + key');
    }
  });

  phoneInput.addEventListener('beforeinput', (e) => {
  const rawInput = phoneInput.value.replace(/\s/g, '');
  const willPrependZero = rawInput.length === 0 && e.data && /^[789]$/.test(e.data);
  if ((rawInput.length >= 11 || (rawInput.length >= 10 && willPrependZero)) && e.data && /\d/.test(e.data)) {
    e.preventDefault();
    console.log('[DEBUG] phoneInput beforeinput: Blocked input beyond 11 digits, current:', rawInput, 'willPrependZero:', willPrependZero);
    return;
  }
  if (e.data && !/^\d$/.test(e.data)) {
    e.preventDefault();
    console.log('[DEBUG] phoneInput beforeinput: Blocked non-digit input:', e.data);
  }
});

  phoneInput.addEventListener('keydown', (e) => {
    const allowedKeys = [
      'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter',
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
    ];
    if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v'].includes(e.key.toLowerCase())) {
      return;
    }
    if (!allowedKeys.includes(e.key)) {
      e.preventDefault();
      console.log('[DEBUG] phoneInput keydown: Blocked non-allowed key:', e.key);
    }
  });

  function normalizePhone(input) {
    let cleaned = input.replace(/[\s-]/g, '').replace(/^\+234/, '234');
    if (cleaned.startsWith('234')) {
      cleaned = '0' + cleaned.slice(3);
    }
    if (cleaned.length <= 1 && /^[789]/.test(cleaned)) {
      cleaned = '0' + cleaned;
    }
    if (cleaned.length === 10 && /^(90|91|80|81|70|71)/.test(cleaned)) {
      cleaned = '0' + cleaned;
    }
    if (cleaned.length > 11) {
      return null;
    }
    return cleaned;
  }

  phoneInput.addEventListener('paste', (e) => {
    e.preventDefault();
    const pastedData = (e.clipboardData || window.clipboardData).getData('text').trim();
    console.log('[DEBUG] phoneInput paste: Raw pasted data:', pastedData);

    const normalized = normalizePhone(pastedData);
    if (!normalized) {
      phoneInput.classList.add('invalid');
      console.log('[DEBUG] phoneInput paste: Blocked invalid number:', pastedData);
      alert('Please paste a valid Nigerian phone number (e.g., +2348031234567 or 08031234567).');
      return;
    }

    const { value: formatted, cursorOffset } = formatNigeriaNumber(normalized, false, true);
    if (!formatted) {
      phoneInput.classList.add('invalid');
      console.log('[DEBUG] phoneInput paste: Invalid formatted number:', normalized);
      alert('Invalid phone number format. Please paste a valid Nigerian number.');
      return;
    }

    phoneInput.value = formatted;
    console.log('[DEBUG] phoneInput paste: Accepted and formatted:', formatted);

    const newCursorPosition = formatted.length;
    phoneInput.setSelectionRange(newCursorPosition, newCursorPosition);

    if (normalized.length >= 4) {
      const provider = detectProvider(normalized);
      if (provider) {
        const providerClass = provider.toLowerCase() === '9mobile' ? 'ninemobile' : provider.toLowerCase();
        selectProvider(providerClass);
        console.log('[DEBUG] phoneInput paste: Detected provider:', provider, 'Class:', providerClass);
      }
    }

    const prefix = normalized.slice(0, 4);
    const validPrefixes = Object.values(providerPrefixes).flat();
    phoneInput.classList.toggle('invalid', normalized.length >= 4 && !validPrefixes.includes(prefix));

    updateContactOrCancel();
    updateContinueState();
    saveUserState();

    if (normalized.length === 11 && isNigeriaMobile(normalized)) {
      phoneInput.blur();
      console.log('[RAW LOG] phoneInput paste: Keyboard closed, valid Nigeria number:', normalized);
    }
  });

  phoneInput.addEventListener('input', debounce((e) => {
  const cursorPosition = phoneInput.selectionStart;
  const rawInput = phoneInput.value.replace(/\s/g, '');
  const isInitialDigit = rawInput.length === 1 && /^[789]$/.test(rawInput);
  const isDelete = e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward';

  if (!rawInput && isDelete) {
    phoneInput.classList.remove('invalid');
    updateContactOrCancel();
    updateContinueState();
    saveUserState();
    console.log('[DEBUG] phoneInput input: Input cleared, no validation');
    return;
  }

  const normalized = normalizePhone(rawInput);
  if (!normalized && rawInput) {
    phoneInput.value = rawInput;
    phoneInput.classList.add('invalid');
    console.log('[DEBUG] phoneInput input: Invalid number, keeping raw input:', rawInput);
    updateContactOrCancel();
    updateContinueState();
    saveUserState();
    return;
  }

  // Enforce 11-digit limit after normalization
  let finalNormalized = normalized;
  if (normalized.length > 11) {
    finalNormalized = normalized.slice(0, 11);
    console.log('[DEBUG] phoneInput input: Truncated to 11 digits:', finalNormalized);
  }

  const { value: formatted, cursorOffset } = formatNigeriaNumber(finalNormalized, isInitialDigit, false);
  phoneInput.value = formatted;

  let newCursorPosition = cursorPosition;
  if (isInitialDigit) {
    newCursorPosition = 2; // Place cursor after '07', '08', or '09'
  } else if (finalNormalized.length >= 4 && finalNormalized.length <= 7) {
    if (cursorPosition > 4) newCursorPosition += 1;
  } else if (finalNormalized.length > 7) {
    if (cursorPosition > 4) newCursorPosition += 1;
    if (cursorPosition > 7) newCursorPosition += 1;
  }
  newCursorPosition = Math.min(newCursorPosition, formatted.length);
  phoneInput.setSelectionRange(newCursorPosition, newCursorPosition);

  if (finalNormalized.length >= 4) {
    const provider = detectProvider(finalNormalized);
    if (provider) {
      const providerClass = provider.toLowerCase() === '9mobile' ? 'ninemobile' : provider.toLowerCase();
      selectProvider(providerClass);
      console.log('[DEBUG] phoneInput input: Detected provider:', provider, 'Class:', providerClass);
    }
  }

  const prefix = finalNormalized.slice(0, 4);
  const validPrefixes = Object.values(providerPrefixes).flat();
  phoneInput.classList.toggle('invalid', finalNormalized.length >= 4 && !validPrefixes.includes(prefix));

  updateContactOrCancel();
  updateContinueState();
  saveUserState();

  if (finalNormalized.length === 11 && isNigeriaMobile(finalNormalized)) {
    phoneInput.blur();
    console.log('[RAW LOG] phoneInput input: Keyboard closed, valid Nigeria number:', finalNormalized);
  }
}, 50));
phoneInput.maxLength = 13;  // 11 digits + 2 spaces in formatted value

  // --- CONTINUE BUTTON CLICK ---
  continueBtn.addEventListener('click', () => {
    if (!continueBtn.disabled) {
      openCheckoutModal();
      console.log('[DEBUG] continueBtn: Opening checkout modal');
    }
  });

  // --- MODAL EVENT LISTENERS ---
  openBtn.addEventListener('click', openModal);
 allPlansModal.addEventListener('click', e => {
    if (e.target === allPlansModal) closeModal();
  });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  let startY = 0, currentY = 0, translateY = 0, dragging = false;
  const pullThreshold = 120;

  function handleTouchStart(e) {
    if (allPlansModalContent.scrollTop > 0) return;
    dragging = true;
    startY = e.touches[0].clientY;
    translateY = 0;
    allPlansModalContent.style.transition = 'none';
  }

  function handleTouchMove(e) {
    if (!dragging) return;
    currentY = e.touches[0].clientY;
    let diff = currentY - startY;
    if (diff > 0) {
      let resistance = diff < 60 ? 1 : diff < 120 ? 0.8 : 0.6;
      translateY = diff * resistance;
      allPlansModalContent.style.transform = `translateY(${translateY}px)`;
      e.preventDefault();
    }
  }

  function handleTouchEnd() {
    if (!dragging) return;
    dragging = false;
    allPlansModalContent.style.transition = 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)';
    if (translateY > pullThreshold) {
      allPlansModalContent.style.transform = `translateY(100%)`;
      setTimeout(closeModal, 200);
    } else {
      allPlansModalContent.style.transform = 'translateY(0)';
    }
  }

  pullHandle?.addEventListener('touchstart', handleTouchStart);
  pullHandle?.addEventListener('touchmove', handleTouchMove, { passive: false });
  pullHandle?.addEventListener('touchend', handleTouchEnd);
  allPlansModalContent.addEventListener('touchstart', handleTouchStart);
  allPlansModalContent.addEventListener('touchmove', handleTouchMove, { passive: false });
  allPlansModalContent.addEventListener('touchend', handleTouchEnd);

  // --- TRANSACTIONS RENDERING ---
// --- TRANSACTIONS RENDERING ---
// --- TRANSACTIONS RENDERING ---
const transactionsContainer = document.querySelector('.transactions-list');
const noTxDiv = document.querySelector('.no-transactions');
const viewAllLink = document.querySelector('.view-all-link');
const transactions = JSON.parse(localStorage.getItem('transactions')) || [];

function renderTransactions() {
  transactionsContainer.innerHTML = '';
  if (transactions.length === 0) {
    noTxDiv.hidden = false;
    viewAllLink.style.display = 'none';
    console.log('[DEBUG] renderTransactions: No transactions, showing SVG');
  } else {
    noTxDiv.hidden = true;
    viewAllLink.style.display = 'inline-block';
    const maxDisplay = 10; // Limit to 10 transactions
    const transactionsToShow = transactions.slice(-maxDisplay).reverse(); // Show latest at top
    transactionsToShow.forEach(tx => {
      const txDiv = document.createElement('div');
      txDiv.className = `transaction-item ${tx.type}`;
      const displayName = tx.provider === 'ninemobile' ? '9mobile' : tx.provider ? tx.provider.charAt(0).toUpperCase() + tx.provider.slice(1) : 'Opay';
      const planType = tx.subType ? `${displayName} ${tx.subType.toUpperCase()}` : displayName;
      const dateTime = tx.timestamp ? new Date(tx.timestamp).toLocaleString('en-NG', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
      }).replace(',', ' --') : 'Unknown';
      const statusClass = tx.status === 'failed' ? 'failed' : 'success';
      const amountSign = tx.type === 'receive' ? '+' : '-';
      txDiv.innerHTML = `
        <div class="tx-left">
          <div class="tx-icon">${svgShapes[tx.type === 'receive' ? 'receive' : tx.provider]}</div>
          <div class="tx-details">
            <span class="tx-plan">${tx.type === 'receive' ? 'Received from Opay' : `${tx.description} to ${tx.phone}`}</span>
            <span class="tx-datetime">${dateTime}</span>
          </div>
        </div>
        <div class="tx-right">
          <span class="tx-amount">${amountSign}₦${tx.amount}</span>
          <span class="tx-status ${statusClass}">${tx.status === 'failed' ? 'Failed' : 'Successful'}</span>
        </div>
      `;
      transactionsContainer.appendChild(txDiv);
    });
    console.log('[DEBUG] renderTransactions: Rendered', transactionsToShow.length, 'transactions', transactionsToShow);
  }
  localStorage.setItem('transactions', JSON.stringify(transactions));
}

renderTransactions();

viewAllLink.addEventListener('click', (e) => {
  e.preventDefault();
  alert('Redirect to all transactions page.');
});

  // --- CHECKOUT MODAL EVENT LISTENERS ---
  const checkoutModal = document.getElementById('checkoutModal');
  if (checkoutModal) {
    const closeCheckoutBtn = checkoutModal.querySelector('.close-btn');
    const checkoutModalContent = checkoutModal.querySelector('.modal-content');
    const checkoutPullHandle = checkoutModal.querySelector('.pull-handle');

    closeCheckoutBtn.addEventListener('click', () => {
      closeCheckoutModal();
      console.log('[DEBUG] closeCheckoutBtn: Clicked');
    });
    checkoutModal.addEventListener('click', e => {
      if (e.target === checkoutModal) {
        closeCheckoutModal();
        console.log('[DEBUG] checkoutModal: Backdrop clicked');
      }
    });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && checkoutModal.classList.contains('active')) {
        closeCheckoutModal();
        console.log('[DEBUG] keydown: ESC pressed');
      }
    });

    let startY = 0, translateY = 0, dragging = false;

    function handleCheckoutTouchStart(e) {
      dragging = true;
      startY = e.touches[0].clientY;
      checkoutModalContent.style.transition = 'none';
      console.log('[DEBUG] handleCheckoutTouchStart: Drag started, startY:', startY);
    }

    function handleCheckoutTouchMove(e) {
      if (!dragging) return;
      translateY = Math.max(0, e.touches[0].clientY - startY);
      checkoutModalContent.style.transform = `translateY(${translateY}px)`;
      console.log('[DEBUG] handleCheckoutTouchMove: translateY:', translateY);
    }

    function handleCheckoutTouchEnd() {
      if (!dragging) return;
      dragging = false;
      checkoutModalContent.style.transition = 'transform 0.4s ease';
      if (translateY > 100) {
        closeCheckoutModal();
        console.log('[DEBUG] handleCheckoutTouchEnd: Modal closed via drag');
      } else {
        checkoutModalContent.style.transform = 'translateY(0)';
        console.log('[DEBUG] handleCheckoutTouchEnd: Modal reset');
      }
    }

    checkoutPullHandle.addEventListener('touchstart', handleCheckoutTouchStart);
    checkoutPullHandle.addEventListener('touchmove', handleCheckoutTouchMove);
    checkoutPullHandle.addEventListener('touchend', handleCheckoutTouchEnd);
    checkoutModalContent.addEventListener('touchstart', handleCheckoutTouchStart);
    checkoutModalContent.addEventListener('touchmove', handleCheckoutTouchMove);
    checkoutModalContent.addEventListener('touchend', handleCheckoutTouchEnd);

    // Inside checkoutModal event listeners
const payBtn = document.getElementById('payBtn');
payBtn.addEventListener('click', () => {
  if (!payBtn.disabled) {
    payBtn.disabled = true;
    payBtn.textContent = 'Processing...';
    setTimeout(() => {
      const state = JSON.parse(localStorage.getItem('userState') || '{}');
      const { provider, planId, number } = state;
      const rawNumber = normalizePhone(number);
      if (!rawNumber || rawNumber.length !== 11) {
        console.error('[ERROR] payBtn: Invalid phone number:', rawNumber, 'Original:', number);
        alert('Invalid phone number. Please enter a valid Nigerian number.');
        payBtn.disabled = false;
        payBtn.textContent = 'Pay';
        return;
      }
      const plan = findPlanById(planId, provider);
      if (!plan) {
        console.error('[ERROR] payBtn: No plan found for ID:', planId);
        alert('Invalid plan selected. Please try again.');
        payBtn.disabled = false;
        payBtn.textContent = 'Pay';
        return;
      }
      if (userBalance < plan.price) {
        console.error('[ERROR] payBtn: Insufficient balance:', userBalance, 'Required:', plan.price);
        alert('Insufficient balance. Please add funds.');
        payBtn.disabled = false;
        payBtn.textContent = 'Pay';
        return;
      }

      // Mock API call
      const mockResponse = { success: true, transactionId: `TX${Date.now()}` };
      console.log('[DEBUG] payBtn: Mock API response:', mockResponse);

      // Update balance
      userBalance -= plan.price;
      updateBalanceDisplay();

      // Determine subType for plan type display
      let subType = '';
      if (provider === 'mtn') {
        subType = planId.includes('awoof') ? 'AWOOF' : 'GIFTING';
      } else if (provider === 'airtel') {
        subType = planId.includes('awoof') ? 'AWOOF' : 'CG';
      } else if (provider === 'glo') {
        subType = planId.includes('cg') ? 'CG' : 'GIFTING';
      }

      // Add to transactions
      const transaction = {
        type: 'data',
        description: 'Data Purchase',
        amount: plan.price,
        phone: rawNumber,
        provider,
        subType,
        data: plan.data,
        duration: plan.duration,
        timestamp: new Date().toISOString(),
        status: 'success' // Mock success
      };
      transactions.push(transaction);
      recentTransactions.push(transaction);
      localStorage.setItem('recentTransactions', JSON.stringify(recentTransactions));
      renderTransactions();
      renderRecentTransactions();

      // Clear phone number, reset provider to MTN, and clear plan selection
      phoneInput.value = '';
      document.querySelectorAll('.plan-box.selected').forEach(p => p.classList.remove('selected'));
      selectProvider('mtn');
      updateContactOrCancel();
      updateContinueState();
      saveUserState();

      alert(`Payment of ₦${plan.price} for ${plan.data} (${plan.duration}) to ${formatNigeriaNumber(rawNumber).value} successful!`);
      closeCheckoutModal();
      console.log('[DEBUG] payBtn: Payment processed, new balance:', userBalance, 'Transaction:', transaction);
      payBtn.disabled = false;
      payBtn.textContent = 'Pay';
    }, 1000);
  }
});
  }

  // --- CONTACT/CANCEL BUTTON ICONS ---
  const contactSVG = `<img src="/frontend/svg/contact-icon.svg" alt="Contact Icon" class="contact-btn contact-btn-svg" />`;
  const cancelSVG = `<button class="cancel-btn" type="button" aria-label="Clear number" tabindex="0" style="background: none; border: none; padding: 0; margin: 0;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#bfc7d3"/><path d="M8 8l8 8M16 8l-8 8" stroke="#021827" stroke-width="2" stroke-linecap="round"/></svg></button>`;

  // --- CONTACT PICKER API HANDLER ---
  contactBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    if (!phoneInput) {
      console.error('[ERROR] contactBtn: #phone-input not found in DOM');
      alert('Error: Phone input field not found. Please check the DOM.');
      return;
    }

    if (!contactBtn) {
      console.error('[ERROR] contactBtn: .contact-btn not found in DOM');
      alert('Error: Contact button not found. Please check the DOM.');
      return;
    }

    if (contactBtn.querySelector('.cancel-btn')) {
      phoneInput.value = '';
      contactBtn.innerHTML = contactSVG;
      phoneInput.focus();
      updateContactOrCancel();
      updateContinueState();
      saveUserState();
      console.log('[DEBUG] contactBtn: Cancel button clicked, input cleared');
      return;
    }

    const isSupported = 'contacts' in navigator && 'ContactsManager' in window;
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isSecure = window.location.protocol === 'https:';
    console.log('[DEBUG] contactBtn: Feature detection - Supported:', isSupported, 'Android:', isAndroid, 'Secure:', isSecure);

    if (!isSecure) {
      alert('The Contact Picker API requires HTTPS. Please serve the site over HTTPS.');
      console.log('[DEBUG] contactBtn: Non-secure context detected');
      return;
    }

    if (!isSupported) {
      alert('The Contact Picker API is not supported in this browser. Please use Chrome 80 or later on an Android device.');
      console.log('[DEBUG] contactBtn: Contact Picker API not supported');
      return;
    }

    if (!isAndroid) {
      alert('The Contact Picker API is only supported on Android devices.');
      console.log('[DEBUG] contactBtn: Not detected as Android device');
      return;
    }

    try {
      const supportedProperties = await navigator.contacts.getProperties();
      console.log('[DEBUG] contactBtn: Supported properties:', supportedProperties);

      if (!supportedProperties.includes('tel')) {
        console.log('[DEBUG] contactBtn: Telephone property not supported');
        alert('The Contact Picker API does not support telephone numbers on this device.');
        return;
      }

      const props = ['tel'];
      const opts = { multiple: false };
      const contacts = await navigator.contacts.select(props, opts);
      console.log('[DEBUG] contactBtn: Contacts selected:', contacts);

      if (contacts.length === 0) {
        console.log('[DEBUG] contactBtn: Contact selection cancelled');
        return;
      }

      const contact = contacts[0];
      if (!contact.tel || contact.tel.length === 0) {
        console.log('[DEBUG] contactBtn: No phone number selected in contact:', contact);
        alert('No phone number found for the selected contact.');
        return;
      }

      const rawPhone = contact.tel[0];
      console.log('[DEBUG] contactBtn: Raw phone number from contact:', rawPhone);
      const normalized = normalizePhone(rawPhone);
      console.log('[DEBUG] contactBtn: Normalized phone number:', normalized);

      if (!normalized) {
        console.log('[DEBUG] contactBtn: Invalid phone number:', rawPhone);
        alert('Please select a valid Nigerian phone number (e.g., +234 or 0 followed by a valid prefix).');
        return;
      }

      const { value: formatted, cursorOffset } = formatNigeriaNumber(normalized, false, true);
      console.log('[DEBUG] contactBtn: Formatted phone number:', formatted, 'Cursor offset:', cursorOffset);

      if (!formatted) {
        console.log('[DEBUG] contactBtn: Formatted phone number is empty or invalid');
        alert('Invalid phone number format. Please select a valid Nigerian number.');
        return;
      }

      phoneInput.value = formatted;
      console.log('[DEBUG] contactBtn: Set phoneInput.value to:', formatted);

      const newCursorPosition = formatted.length;
      phoneInput.setSelectionRange(newCursorPosition, newCursorPosition);
      console.log('[DEBUG] contactBtn: Cursor set to position:', newCursorPosition);

      if (normalized.length >= 4) {
        const provider = detectProvider(normalized);
        console.log('[DEBUG] contactBtn: Detected provider:', provider);
        if (provider) {
          const providerClass = provider.toLowerCase() === '9mobile' ? 'ninemobile' : provider.toLowerCase();
          debounce(() => {
            selectProvider(providerClass);
            console.log('[DEBUG] contactBtn: Provider selected:', providerClass);
          }, 100)();
        }
      }

      const prefix = normalized.slice(0, 4);
      const validPrefixes = Object.values(providerPrefixes).flat();
      phoneInput.classList.toggle('invalid', normalized.length >= 4 && !validPrefixes.includes(prefix));
      console.log('[DEBUG] contactBtn: Phone validation - Prefix:', prefix, 'Valid:', validPrefixes.includes(prefix));

      updateContactOrCancel();
      updateContinueState();
      saveUserState();

      if (normalized.length === 11 && isNigeriaMobile(normalized)) {
        phoneInput.blur();
        console.log('[RAW LOG] contactBtn: Keyboard closed, valid Nigeria number:', normalized);
      }
    } catch (err) {
      console.error('[ERROR] contactBtn: Error in contact selection:', err.name, err.message);
      if (err.name === 'NotAllowedError') {
        alert('Contact access denied. Please enable contact permissions in Android Settings > Apps > Chrome > Permissions > Contacts.');
      } else {
        alert(`Failed to access contacts: ${err.message}. Ensure contact permissions are enabled and try again.`);
      }
    }
  });

  updateContactOrCancel();
  updateContinueState();
  handleResize();



/* --- BALANCE MANAGEMENT (keep original globals intact) --- */
// keep same global names so other functions still work
let userBalance = parseFloat(localStorage.getItem('userBalance')) || 50000; // Initialize to ₦50,000
const balanceEl = document.querySelector('.balance p'); // same selector you used before

// helper: format number as Naira with commas & 2 decimals
function formatBalance(n) {
  try {
    return '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch (e) {
    return '₦' + Number(n).toFixed(2);
  }
}

// attempt to find the masked/real spans (preferred)
const maskedSpan = document.querySelector('.balance-masked');
const realSpan = document.querySelector('.balance-real');

// update function (keeps localStorage like your original)
function updateBalanceDisplay() {
  const formatted = formatBalance(userBalance);

  // if page includes the .balance-real span, update it (preserves masking)
  if (realSpan) {
    realSpan.textContent = formatted;
  } else if (balanceEl) {
    // fallback: match your old behavior and write directly to <p>
    balanceEl.textContent = formatted;
  }

  try { localStorage.setItem('userBalance', String(userBalance)); } catch (e) { /* ignore storage errors */ }
  console.log('[DEBUG] updateBalanceDisplay: Balance updated:', formatted);
}

// expose setter so other modules can update the balance (keeps same global var)
window.setUserBalance = function(amount) {
  const parsed = parseFloat(amount);
  if (isNaN(parsed)) return;
  userBalance = parsed;
  updateBalanceDisplay();
};

// initialize balance display (same as your previous code)
updateBalanceDisplay();

/* --- VISIBILITY / EYE TOGGLE (uses existing DOM ids/classes) --- */
(function () {
  const container = document.querySelector('.balance');
  if (!container) return;

  const toggle = container.querySelector('.balance-eye-toggle');
  const eyeOpen = toggle && toggle.querySelector('.eye-open-svg');
  const eyeClosed = toggle && toggle.querySelector('.eye-closed-svg');
  const masked = maskedSpan || container.querySelector('.balance-masked'); // reuse found earlier
  const real = realSpan || container.querySelector('.balance-real');
  const p = balanceEl; // use your original reference

  // read saved visibility (default: masked/hidden)
  let visible = localStorage.getItem('balanceVisible') === 'true';

  // prepare svg default styles if present (ensures smooth transitions)
  if (eyeOpen) {
    eyeOpen.style.transformOrigin = eyeOpen.style.transformOrigin || '50% 50%';
    if (!eyeOpen.style.transform) eyeOpen.style.transform = 'translate(-50%,-50%) scaleY(.25)';
    if (!eyeOpen.style.transition) eyeOpen.style.transition = 'transform 650ms cubic-bezier(.2,.9,.3,1), opacity 420ms ease';
    eyeOpen.style.left = eyeOpen.style.left || '50%';
    eyeOpen.style.top = eyeOpen.style.top || '50%';
  }
  if (eyeClosed) {
    eyeClosed.style.transformOrigin = eyeClosed.style.transformOrigin || '50% 50%';
    if (!eyeClosed.style.transform) eyeClosed.style.transform = 'translate(-50%,-50%) scaleY(1)';
    if (!eyeClosed.style.transition) eyeClosed.style.transition = 'transform 520ms cubic-bezier(.2,.9,.3,1), opacity 320ms ease';
    eyeClosed.style.left = eyeClosed.style.left || '50%';
    eyeClosed.style.top = eyeClosed.style.top || '50%';
  }

  // animation helpers (match your centered transforms)
  function animateToOpen() {
    if (!eyeOpen || !eyeClosed) return;
    eyeOpen.style.opacity = '1';
    eyeOpen.style.transform = 'translate(-50%,-50%) scaleY(1) translateY(0)';
    eyeClosed.style.opacity = '0';
    eyeClosed.style.transform = 'translate(-50%,-50%) scaleY(.3) translateY(0)';
  }
  function animateToClosed() {
    if (!eyeOpen || !eyeClosed) return;
    eyeClosed.style.opacity = '1';
    eyeClosed.style.transform = 'translate(-50%,-50%) scaleY(1) translateY(0)';
    eyeOpen.style.opacity = '0';
    eyeOpen.style.transform = 'translate(-50%,-50%) scaleY(.25) translateY(0)';
  }

  // single setter to update UI + persist state
  function setState(v) {
    visible = !!v;

    if (visible) {
      // show real amount
      if (masked) masked.style.display = 'none';
      if (real) {
        real.style.display = 'inline';
        setTimeout(() => { real.style.opacity = '1'; }, 10);
      } else if (p) {
        // if no .balance-real, update p text to formatted value (we already do that via updateBalanceDisplay)
        p.style.opacity = '1';
      }

      setTimeout(animateToOpen, 60);
      if (toggle) { toggle.setAttribute('aria-pressed', 'true'); toggle.setAttribute('aria-label', 'Hide balance'); }
    } else {
      // animate close then mask
      animateToClosed();

      if (real) {
        real.style.opacity = '0';
        setTimeout(() => {
          real.style.display = 'none';
          if (masked) masked.style.display = 'inline';
        }, 360);
      } else if (p) {
        // fallback: fade the p content (keeping old behavior)
        p.style.opacity = '0';
        setTimeout(() => { p.style.opacity = '1'; if (masked) masked.style.display = 'inline'; }, 360);
      }

      if (toggle) { toggle.setAttribute('aria-pressed', 'false'); toggle.setAttribute('aria-label', 'Show balance'); }
    }

    try { localStorage.setItem('balanceVisible', visible); } catch (e) { /* ignore storage errors */ }
  }

  // wire toggle handlers
  if (toggle) {
    toggle.addEventListener('click', () => setState(!visible));
    toggle.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setState(!visible);
      }
    });
  }

  // initialize UI based on stored visibility
  setState(visible);

  // If other code modifies the global userBalance variable directly (older approach),
  // call updateBalanceDisplay() afterwards or use window.setUserBalance(newAmount).
})();



  // Initialize balance display
  updateBalanceDisplay();

  // --- RECENT TRANSACTIONS ---
  // --- RECENT TRANSACTIONS ---
  // --- RECENT TRANSACTIONS ---
  const recentTransactionsList = document.querySelector('.recent-transactions-list');
  const recentTransactionsSection = document.querySelector('.recent-transactions');
  const recentTransactions = JSON.parse(localStorage.getItem('recentTransactions')) || [];

  function renderRecentTransactions() {
    recentTransactionsList.innerHTML = '';
    if (recentTransactions.length === 0) {
      recentTransactionsSection.classList.remove('active');
      console.log('[DEBUG] renderRecentTransactions: Section hidden, no transactions');
    } else {
      recentTransactionsSection.classList.add('active');
      const maxRecent = 5; // Show last 5 transactions
      const recentToShow = recentTransactions.slice(-maxRecent).reverse(); // Show latest at top
      recentToShow.forEach(tx => {
        const txDiv = document.createElement('div');
        txDiv.className = 'recent-transaction-item';
        const displayName = tx.provider === 'ninemobile' ? '9mobile' : tx.provider.charAt(0).toUpperCase() + tx.provider.slice(1);
        txDiv.innerHTML = `
          <span class="tx-desc">${tx.phone} - ${tx.data}</span>
          <span class="tx-provider">${svgShapes[tx.provider]} ${displayName}</span>
        `;
        txDiv.setAttribute('role', 'button');
        txDiv.setAttribute('aria-label', `Reuse transaction for ${tx.phone} on ${displayName}`);
        txDiv.addEventListener('click', () => {
          const phoneInput = document.getElementById('phone-input');
          if (!phoneInput) {
            console.error('[ERROR] recentTransaction click: #phone-input not found in DOM');
            alert('Error: Phone input field not found.');
            return;
          }
          const formattedNumber = formatNigeriaNumber(tx.phone);
          if (!formattedNumber.valid) {
            console.error('[ERROR] recentTransaction click: Invalid phone number:', tx.phone);
            alert('Invalid phone number in transaction. Please try another.');
            return;
          }
          phoneInput.value = formattedNumber.value; // Set formatted number (e.g., "0803 123 4567")
          selectProvider(tx.provider); // Select provider
          updateContactOrCancel();
          updateContinueState();
          saveUserState();
          if (formattedNumber.valid && tx.phone.length === 11 && isNigeriaMobile(tx.phone)) {
            phoneInput.blur(); // Close the keyboard immediately
            console.log('[RAW LOG] recentTransaction click: Keyboard closed, valid Nigeria number:', tx.phone);
          }
          console.log('[DEBUG] recentTransaction click: Set phone:', formattedNumber.value, 'Raw:', tx.phone, 'Provider:', tx.provider);
        });
        recentTransactionsList.appendChild(txDiv);
      });
      console.log('[DEBUG] renderRecentTransactions: Rendered', recentToShow.length, 'recent transactions', recentToShow);
    }
    localStorage.setItem('recentTransactions', JSON.stringify(recentTransactions));
  }

  // Initialize recent transactions
 // renderRecentTransactions();

   // payBtn.disabled = true;
//  payBtn.textContent = 'Processing...';
//  setTimeout(() => {
  //  // Payment logic
    //payBtn.disabled = false;
    //payBtn.textContent = 'Pay';
  //}, 1000); 
  // --- ADD MONEY HANDLER ---
  const addMoneyBtn = document.querySelector('.card.add-money');
  addMoneyBtn.addEventListener('click', () => {
    const amount = prompt('Enter amount to fund (₦):', '1000');
    if (!amount || isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount.');
      console.error('[ERROR] addMoneyBtn: Invalid amount:', amount);
      return;
    }
    const fundAmount = parseFloat(amount);
    // Mock API call
    const mockResponse = { success: true, transactionId: `TX${Date.now()}` };
    console.log('[DEBUG] addMoneyBtn: Mock API response:', mockResponse);

    // Update balance
    userBalance += fundAmount;
    updateBalanceDisplay();

    // Add to transactions
    const transaction = {
      type: 'receive',
      description: 'Fund Wallet',
      amount: fundAmount,
      phone: null,
      provider: null,
      subType: null,
      data: null,
      duration: null,
      timestamp: new Date().toISOString(),
      status: 'success' // Mock success
    };
    transactions.push(transaction);
    renderTransactions();

    alert(`Successfully funded ₦${fundAmount}!`);
    console.log('[DEBUG] addMoneyBtn: Funding processed, new balance:', userBalance, 'Transaction:', transaction);
  });

/* ===========================================================
   PIN modal — unified keypad + keyboard input + toast system
   =========================================================== */
(function () {
  // Init once DOM is ready
  function init() {
    // -- Elements (graceful guards) --
    const setupPinBtn = document.querySelector('.card.pin'); // Dashboard pin card
    const pinModal = document.getElementById('pinModal');
    const closePinModal = document.getElementById('closePinModal');
    const accountPinStatus = document.getElementById('accountPinStatus');

    if (!pinModal) {
      console.warn('[PIN] pinModal not found — PIN flow disabled.');
      return;
    }
    const pinTitleEl = pinModal.querySelector('.pin-header h2');
    const pinSubtitleEl = pinModal.querySelector('.firewall-icon p');
    const pinInputs = Array.from(document.querySelectorAll('.pin-inputs input'));
    const keypadButtons = Array.from(document.querySelectorAll('.pin-keypad button'));
    const deleteKey = document.getElementById('deleteKey');

    // If key elements missing, warn but continue if possible
    if (!pinTitleEl || !pinSubtitleEl || pinInputs.length === 0) {
      console.warn('[PIN] Some modal sub-elements are missing. Check selectors.');
    }

    // -- State --
    let currentPin = "";
    let firstPin = "";
    let step = "create"; // "create" | "confirm" | "reauth"
    let processing = false; // prevents double submits

    // ---------------------
    // Toast (top-right) system
    // ---------------------
    const toastContainerId = 'flexgig_toast_container';
    function ensureToastStylesAndContainer() {
      if (!document.getElementById(toastContainerId + '_style')) {
        const style = document.createElement('style');
        style.id = toastContainerId + '_style';
        style.textContent = `
          #${toastContainerId} {
            position: fixed;
            top: 20px;
            right: 20px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            z-index: 11000;
            pointer-events: none;
          }
          .flexgig-toast {
            pointer-events: auto;
            min-width: 240px;
            max-width: 360px;
            padding: 12px 16px;
            border-radius: 10px;
            color: #fff;
            font-weight: 600;
            box-shadow: 0 6px 18px rgba(0,0,0,0.15);
            transform: translateX(120%);
            opacity: 0;
            transition: transform .36s cubic-bezier(.22,.9,.32,1), opacity .28s ease;
            font-size: 14px;
          }
          .flexgig-toast.show { transform: translateX(0); opacity: 1; }
          .flexgig-toast.success { background: linear-gradient(135deg,#4caf50,#43a047); }
          .flexgig-toast.error   { background: linear-gradient(135deg,#f44336,#e53935); }
          .flexgig-toast.info    { background: linear-gradient(135deg,#2196f3,#1e88e5); }
          `;
        document.head.appendChild(style);
      }
      let container = document.getElementById(toastContainerId);
      if (!container) {
        container = document.createElement('div');
        container.id = toastContainerId;
        document.body.appendChild(container);
      }
      return container;
    }

    function showToast(message, type = 'success', duration = 2800) {
      const container = ensureToastStylesAndContainer();
      const toast = document.createElement('div');
      toast.className = `flexgig-toast ${type}`;
      toast.textContent = message;
      container.appendChild(toast);

      // animate in
      requestAnimationFrame(() => toast.classList.add('show'));

      // remove after duration
      const removeAfter = () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 420);
      };
      setTimeout(removeAfter, duration);
    }

    // ---------------------
    // Helpers for input UI
    // ---------------------
    function updatePinInputs() {
      pinInputs.forEach((inp, idx) => {
        if (idx < currentPin.length) {
          inp.classList.add('filled');
          inp.value = '*';
        } else {
          inp.classList.remove('filled');
          inp.value = '';
        }
      });
    }

    function resetInputs() {
      currentPin = "";
      pinInputs.forEach(input => {
        input.classList.remove("filled");
        input.value = "";
      });
    }

    function openModalAsCreate() {
      pinModal.classList.remove('hidden');
      step = 'create';
      if (pinTitleEl) pinTitleEl.textContent = 'Create PIN';
      if (pinSubtitleEl) pinSubtitleEl.textContent = 'Create a 4-digit PIN';
      resetInputs();
    }

    // ---------------------
    // Server/Session helper
    // ---------------------
    async function openPinModalForReauth() {
      try {
        const res = await fetch('https://api.flexgig.com.ng/api/session', {
          method: 'GET',
          credentials: 'include',
        });
        if (!res.ok) {
          console.error('[dashboard.js] openPinModalForReauth: Session invalid');
          window.location.href = '/';
          return;
        }
        const { user } = await res.json();
        pinModal.classList.remove('hidden');

        if (!user.pin) {
          if (pinTitleEl) pinTitleEl.textContent = 'Create PIN';
          if (pinSubtitleEl) pinSubtitleEl.textContent = 'Create a 4-digit PIN';
          step = 'create';
        } else {
          if (pinTitleEl) pinTitleEl.textContent = 'Re-enter PIN';
          if (pinSubtitleEl) pinSubtitleEl.textContent = 'Enter your 4-digit PIN to continue';
          step = 'reauth';
        }
        resetInputs();
        console.log('[dashboard.js] PIN modal opened for:', user.pin ? 're-authentication' : 'PIN creation');
      } catch (err) {
        console.error('[dashboard.js] openPinModalForReauth error:', err);
        window.location.href = '/';
      }
    }

    // ---------------------
    // Close/back button
    // ---------------------
    if (closePinModal) {
      closePinModal.addEventListener('click', () => {
        if (step === 'confirm') {
          step = 'create';
          if (pinTitleEl) pinTitleEl.textContent = 'Create PIN';
          if (pinSubtitleEl) pinSubtitleEl.textContent = 'Create a 4-digit PIN';
          resetInputs();
        } else {
          pinModal.classList.add('hidden');
          resetInputs();
        }
        processing = false;
      });
    }

    // ---------------------
    // Input actions
    // ---------------------
    function inputDigit(digit) {
      if (processing) return;
      if (!/^[0-9]$/.test(digit)) return;
      if (currentPin.length >= 4) return;
      currentPin += digit;
      updatePinInputs();
      if (currentPin.length === 4) {
        handlePinCompletion();
      }
    }

    function handleDelete() {
      if (processing) return;
      if (currentPin.length === 0) return;
      currentPin = currentPin.slice(0, -1);
      updatePinInputs();
    }

    // ---------------------
    // Completion logic
    // ---------------------
    async function handlePinCompletion() {
  if (processing) return;
  if (currentPin.length !== 4) return;

  if (step === 'create') {
    firstPin = currentPin;
    step = 'confirm';
    if (pinTitleEl) pinTitleEl.textContent = 'Confirm PIN';
    if (pinSubtitleEl) pinSubtitleEl.textContent = 'Confirm your 4-digit PIN';
    resetInputs();
    return;
  }

  if (step === 'confirm') {
    if (currentPin !== firstPin) {
      console.warn('[PIN] mismatch on confirmation');
      showToast('PINs do not match — try again', 'error');
      step = 'create';
      if (pinTitleEl) pinTitleEl.textContent = 'Create PIN';
      if (pinSubtitleEl) pinSubtitleEl.textContent = 'Create a 4-digit PIN';
      resetInputs();
      return;
    }

    processing = true;
    return withLoader(async () => {

    try {
      const res = await fetch('https://api.flexgig.com.ng/api/save-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: currentPin }),
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Save PIN failed');

      console.log('[dashboard.js] PIN setup successfully');
      // Removed: localStorage.setItem('userPin', currentPin);

      const dashboardPinCard = document.getElementById('dashboardPinCard');
      if (dashboardPinCard) dashboardPinCard.style.display = 'none';
      if (accountPinStatus) accountPinStatus.textContent = 'PIN set';

      showToast('PIN updated successfully', 'success', 2400);
      pinModal.classList.add('hidden');
      resetInputs();
    } catch (err) {
      console.error('[dashboard.js] PIN save error:', err);
      showToast('Failed to save PIN. Try again.', 'error', 2200);
      resetInputs();
    } finally {
      processing = false;
    }
    return;
  });
  }

  if (step === 'reauth') {
    return withLoader(async () => {

    processing = true;
    try {
      const res = await fetch('https://api.flexgig.com.ng/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: currentPin }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Invalid PIN');

      const { user } = await res.json();
      // Removed: localStorage.setItem calls for userEmail, firstName, username, phoneNumber, address, profilePicture
      // Fetch user data on-demand when needed instead of storing in localStorage
      const userData = {
        email: user.email || '',
        firstName: user.fullName?.split(' ')[0] || '',
        username: user.username || '',
        phoneNumber: user.phoneNumber || '',
        address: user.address || '',
        profilePicture: user.profilePicture || '',
      };

      if (typeof updateGreetingAndAvatar === 'function') {
        await updateGreetingAndAvatar(userData.username, userData.firstName);
      }
      if (typeof loadUserProfile === 'function') {
        await loadUserProfile(userData); // Pass userData to function
      }
      if (typeof updateBalanceDisplay === 'function') {
        await updateBalanceDisplay();
      }

      pinModal.classList.add('hidden');
      resetInputs();
      console.log('[dashboard.js] PIN re-auth: Session restored');
    } catch (err) {
      console.error('[dashboard.js] PIN re-auth error:', err);
      showToast('Invalid PIN or session. Redirecting to login...', 'error', 1800);
      setTimeout(() => (window.location.href = '/'), 1200);
    } finally {
      processing = false;
    }
  });
  }
  
}

    // ---------------------
    // Wire keypad buttons
    // ---------------------
    keypadButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const raw = (btn.dataset.value ?? btn.textContent).trim().toLowerCase();
        if (btn.id === 'deleteKey' || raw === 'del' || raw === 'delete' || raw === '⌫') {
          handleDelete();
          return;
        }
        if (/^[0-9]$/.test(raw)) {
          inputDigit(raw);
        }
      });
    });

    if (deleteKey) {
      deleteKey.addEventListener('click', handleDelete);
    }

    // ---------------------
    // Keyboard handler
    // ---------------------
    document.addEventListener('keydown', (e) => {
      if (pinModal.classList.contains('hidden')) return;

      if (/^[0-9]$/.test(e.key)) {
        inputDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Enter') {
        if (currentPin.length === 4) handlePinCompletion();
      }
    });

    // ---------------------
    // Open modal from dashboard card
    // ---------------------
    if (setupPinBtn) {
      setupPinBtn.addEventListener('click', openModalAsCreate);
    }

    console.log('[PIN] initialized — modal found, inputs:', pinInputs.length, 'keypad buttons:', keypadButtons.length);
  } // end init()

  // Run init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


function __fg_pin_clearAllInputs() {
  if (__fg_pin_inputCurrentEl) __fg_pin_inputCurrentEl.value = '';
  if (__fg_pin_inputNewEl) __fg_pin_inputNewEl.value = '';
  if (__fg_pin_inputConfirmEl) __fg_pin_inputConfirmEl.value = '';
}





// --- SECURITY PIN MODAL (integrated, strict, Supabase-aware, auto-jump & auto-submit) ---
// --- SECURITY PIN MODAL (integrated, strict, Supabase-aware, auto-jump & auto-submit) ---
// --- SECURITY PIN MODAL (integrated, strict, Supabase-aware, auto-jump & auto-submit) ---
// --- SECURITY PIN MODAL (integrated, strict, Supabase-aware, auto-jump & auto-submit) ---
// --- SECURITY PIN MODAL (integrated, strict, Supabase-aware, auto-jump & auto-submit) ---
(() => {
  // Local logger (keeps messages compact)
  const __fg_pin_log = {
    d: (...a) => console.debug('[PIN][debug]', ...a),
    i: (...a) => console.info('[PIN][info]', ...a),
    w: (...a) => console.warn('[PIN][warn]', ...a),
    e: (...a) => console.error('[PIN][error]', ...a),
  };

  // Elements (IDs must exist in DOM)
  const __fg_pin_securityPinModal = document.getElementById('securityPinModal');
  const __fg_pin_changePinForm = document.getElementById('changePinForm');
  const __fg_pin_resetPinBtn = document.getElementById('resetPinBtn');
  const __fg_pin_inputCurrentEl = document.getElementById('currentPin');
  const __fg_pin_inputNewEl = document.getElementById('newPin');
  const __fg_pin_inputConfirmEl = document.getElementById('confirmPin');

  // Timing variables
  const __fg_pin_nextFocusDelay = 60; // ms delay before focusing next input after auto-jump
  const __fg_pin_autoSubmitBlurDelay = 80; // ms delay after blur before auto-submitting

  function __fg_pin_notify(message, type = 'info', duration = 3200) {
    try {
      __fg_pin_log.i('[PIN notify]', { message, type });
      if (typeof window.showSlideNotification === 'function') {
        window.showSlideNotification(message, type, duration);
        return;
      }
    } catch (err) {
      __fg_pin_log.e('[notifyPin] error', err);
    }
  }

  // Inline field error helper
  function __fg_pin_showFieldError(field, message) {
    if (!field) return;
    __fg_pin_hideFieldError(field);
    const span = document.createElement('div');
    span.className = 'pin-field-error';
    span.setAttribute('role', 'alert');
    span.style.color = '#ffcccc';
    span.style.fontSize = '12px';
    span.style.marginTop = '6px';
    span.textContent = message;
    field.classList.add('pin-invalid');
    field.setAttribute('aria-invalid', 'true');
    if (field.parentNode) field.parentNode.insertBefore(span, field.nextSibling);
  }

  function __fg_pin_hideFieldError(field) {
    if (!field || !field.parentNode) return;
    const next = field.nextSibling;
    if (next && next.classList && next.classList.contains('pin-field-error')) {
      next.remove();
    }
    field.classList.remove('pin-invalid');
    field.removeAttribute('aria-invalid');
  }

  function __fg_pin_clearAllFieldErrors() {
    [__fg_pin_inputCurrentEl, __fg_pin_inputNewEl, __fg_pin_inputConfirmEl].forEach(
      (f) => {
        if (f) __fg_pin_hideFieldError(f);
      }
    );
  }

  // Utility to get current signed-in uid
  async function __fg_pin_getCurrentUid() {
  try {
    if (typeof window.getSession === 'function') {
      const s = await window.getSession();
      __fg_pin_log.d('getSession result', s);
      if (s && s.user && s.user.uid) return { uid: s.user.uid, session: s };
    }
    // Removed: localStorage fallbacks for authTokenData and user
    // Fetch UID from server-side session endpoint as a fallback
    const res = await fetch('https://api.flexgig.com.ng/api/session', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) {
      __fg_pin_log.w('session fetch failed', await res.text());
      return null;
    }
    const { user } = await res.json();
    if (user && user.uid) {
      __fg_pin_log.d('session API used', user);
      return { uid: user.uid, session: user };
    }
    __fg_pin_log.w('no session/uid found');
    return null;
  } catch (err) {
    __fg_pin_log.e('getPinCurrentUid error', err);
    return null;
  }
}

  // Find stored PIN value in Supabase
  const __fg_pin_TRY_TABLES = ['profiles', 'users', 'accounts'];
  const __fg_pin_TRY_COLUMNS = [
    'pin',
    'account_pin',
    'accountPin',
    'pinCode',
    'pin_hash',
    'pin_hash_text',
  ];
  async function __fg_pin_findStoredPin({ uid }) {
  if (!uid) {
    __fg_pin_log.w('No uid for findStoredPin');
    return null;
  }

  try {
    const res = await fetch('https://api.flexgig.com.ng/api/check-pin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // Removed Authorization
      },
      credentials: 'include',
      body: JSON.stringify({ userId: uid })  // Pass for verification
    });
    if (!res.ok) {
      __fg_pin_log.e('Error checking PIN existence:', await res.text());
      return null;
    }
    const { hasPin } = await res.json();
    if (hasPin) {
      __fg_pin_log.d('PIN found in users.pin');
      return { table: 'users', column: 'pin' };
    }
    __fg_pin_log.w('No stored PIN found');
    return null;
  } catch (err) {
    __fg_pin_log.e('Error checking PIN:', err);
    return null;
  }
}

  // Update stored PIN in Supabase
  async function __fg_pin_updateStoredPin(uid, table, column, newPin) {
  if (table !== 'users' || column !== 'pin') {
    __fg_pin_log.e('Invalid updateStoredPin params', { table, column });
    return { ok: false, error: 'invalid_params' };
  }
  try {
    const res = await fetch('https://api.flexgig.com.ng/api/save-pin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
      },
      body: JSON.stringify({ pin: newPin }),
      credentials: 'include',
    });
    if (!res.ok) {
      const { error } = await res.json();
      __fg_pin_log.e('Error saving PIN:', error?.message || await res.text());
      return { ok: false, error: error?.message || 'Failed to save PIN' };
    }
    __fg_pin_log.i('PIN updated successfully');
    return { ok: true };
  } catch (err) {
    __fg_pin_log.e('Error updating PIN:', err);
    return { ok: false, error: err.message };
  }
}

  // Strict PIN input restrictions + auto-jump + auto-submit
  function __fg_pin_bindStrictPinInputs() {
    const maxLen = 4;
    const inputs = [
      __fg_pin_inputCurrentEl,
      __fg_pin_inputNewEl,
      __fg_pin_inputConfirmEl,
    ].filter(Boolean);
    if (!inputs.length) {
      __fg_pin_log.d('bindStrictPinInputs: no inputs present yet');
      return;
    }

    function __fg_pin_nextInputOf(el) {
      if (!el) return null;
      if (el === __fg_pin_inputCurrentEl) return __fg_pin_inputNewEl;
      if (el === __fg_pin_inputNewEl) return __fg_pin_inputConfirmEl;
      return null;
    }

    inputs.forEach((el) => {
      if (!el) return;
      if (el.__fg_pin_bound) return;
      el.__fg_pin_bound = true;

      el.setAttribute('inputmode', 'numeric');
      el.setAttribute('pattern', '[0-9]*');
      el.setAttribute('maxlength', String(maxLen));
      el.setAttribute('autocomplete', 'off');

      el.addEventListener('input', (ev) => {
        const before = el.value || '';
        const cleaned = before.replace(/\D/g, '').slice(0, maxLen);
        if (before !== cleaned) {
          __fg_pin_log.d('input sanitized', { id: el.id, before, cleaned });
          el.value = cleaned;
        }
        __fg_pin_hideFieldError(el);

        if (cleaned.length === maxLen) {
          const next = __fg_pin_nextInputOf(el);
          if (next) {
            setTimeout(() => {
              try {
                next.focus();
                next.select && next.select();
              } catch (e) {
                __fg_pin_log.d('next.focus failed', e);
              }
            }, __fg_pin_nextFocusDelay);
          } else if (el === __fg_pin_inputConfirmEl) {
            try {
              __fg_pin_inputConfirmEl.blur();
              __fg_pin_inputNewEl && __fg_pin_inputNewEl.blur && __fg_pin_inputNewEl.blur();
              __fg_pin_inputCurrentEl &&
                __fg_pin_inputCurrentEl.blur &&
                __fg_pin_inputCurrentEl.blur();
              __fg_pin_log.d('confirm filled -> blurred inputs to hide keyboard before submit');
            } catch (berr) {
              __fg_pin_log.d('blur error', berr);
            }

            setTimeout(() => {
              __fg_pin_autoSubmitIfValid();
            }, __fg_pin_autoSubmitBlurDelay);
          }
        }
      });

      el.addEventListener('keypress', (ev) => {
        if (!/^[0-9]$/.test(ev.key)) {
          __fg_pin_log.d('keypress blocked non-digit', { id: el.id, key: ev.key });
          ev.preventDefault();
        }
      });

      el.addEventListener('paste', (ev) => {
        const pasted = (ev.clipboardData || window.clipboardData).getData('text') || '';
        const digits = pasted.replace(/\D/g, '').slice(0, maxLen);
        if (!digits.length) {
          __fg_pin_log.d('paste blocked no digits', { id: el.id, pasted });
          ev.preventDefault();
          return;
        }
        ev.preventDefault();
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        const newVal = (el.value.slice(0, start) + digits + el.value.slice(end))
          .replace(/\D/g, '')
          .slice(0, maxLen);
        el.value = newVal;
        const caret = Math.min(start + digits.length, maxLen);
        el.setSelectionRange(caret, caret);
        __fg_pin_log.d('paste accepted', { id: el.id, digits, newVal });
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });

      __fg_pin_log.i('bound strict PIN handlers to', el.id);
    });
  }

  // Auto-submit if valid
  function __fg_pin_autoSubmitIfValid() {
    if (!__fg_pin_changePinForm) return;
    const cur = String((__fg_pin_inputCurrentEl && __fg_pin_inputCurrentEl.value) || '').trim();
    const neu = String((__fg_pin_inputNewEl && __fg_pin_inputNewEl.value) || '').trim();
    const conf = String((__fg_pin_inputConfirmEl && __fg_pin_inputConfirmEl.value) || '').trim();

    if (!/^\d{4}$/.test(cur)) {
      __fg_pin_showFieldError(__fg_pin_inputCurrentEl, 'Enter current 4-digit PIN');
      __fg_pin_notify('Enter your current 4-digit PIN', 'error');
      return;
    }
    if (!/^\d{4}$/.test(neu)) {
      __fg_pin_showFieldError(__fg_pin_inputNewEl, 'New PIN must be 4 digits');
      __fg_pin_notify('New PIN must be 4 digits', 'error');
      return;
    }
    if (neu === cur) {
      __fg_pin_showFieldError(__fg_pin_inputNewEl, 'New PIN must be different');
      __fg_pin_notify('New PIN must be different from current PIN', 'error');
      return;
    }
    if (neu !== conf) {
      __fg_pin_showFieldError(__fg_pin_inputConfirmEl, 'Confirm PIN does not match');
      __fg_pin_notify('New PIN and confirm PIN do not match', 'error');
      return;
    }

    try {
      __fg_pin_inputConfirmEl && __fg_pin_inputConfirmEl.blur && __fg_pin_inputConfirmEl.blur();
      __fg_pin_inputNewEl && __fg_pin_inputNewEl.blur && __fg_pin_inputNewEl.blur();
      __fg_pin_inputCurrentEl &&
        __fg_pin_inputCurrentEl.blur &&
        __fg_pin_inputCurrentEl.blur();
      __fg_pin_log.d('autoSubmitIfValid: blurred inputs to hide keyboard');
    } catch (b) {
      __fg_pin_log.d('autoSubmit blur error', b);
    }

    setTimeout(() => {
      try {
        if (typeof __fg_pin_changePinForm.requestSubmit === 'function')
          __fg_pin_changePinForm.requestSubmit();
        else __fg_pin_changePinForm.dispatchEvent(new Event('submit', { cancelable: true }));
        __fg_pin_log.d('autoSubmitIfValid: requestSubmit invoked');
      } catch (err) {
        __fg_pin_log.e('autoSubmitIfValid error', err);
      }
    }, __fg_pin_autoSubmitBlurDelay);
  }

  // Main change PIN handler
  if (__fg_pin_changePinForm) {
  __fg_pin_changePinForm.addEventListener(
    'submit',
    async (ev) => {
      try {
        ev.preventDefault();
        __fg_pin_log.d('Change PIN submit handler started');

        __fg_pin_clearAllFieldErrors();

        const cur = String((__fg_pin_inputCurrentEl && __fg_pin_inputCurrentEl.value) || '').trim();
        const neu = String((__fg_pin_inputNewEl && __fg_pin_inputNewEl.value) || '').trim();
        const conf = String((__fg_pin_inputConfirmEl && __fg_pin_inputConfirmEl.value) || '').trim();

        __fg_pin_log.d('submitted values', { cur, neu, conf });

        if (!/^\d{4}$/.test(cur)) {
          __fg_pin_log.w('current pin invalid format');
          __fg_pin_showFieldError(__fg_pin_inputCurrentEl, 'Enter your current 4-digit PIN');
          __fg_pin_notify('Enter your current 4-digit PIN', 'error');
          return;
        }
        if (!/^\d{4}$/.test(neu)) {
          __fg_pin_log.w('new pin invalid format');
          __fg_pin_showFieldError(__fg_pin_inputNewEl, 'New PIN must be 4 digits');
          __fg_pin_notify('New PIN must be 4 digits', 'error');
          return;
        }
        if (neu === cur) {
          __fg_pin_log.w('new equals current');
          __fg_pin_showFieldError(__fg_pin_inputNewEl, 'New PIN must be different');
          __fg_pin_notify('New PIN must be different from current PIN', 'error');
          return;
        }
        if (neu !== conf) {
          __fg_pin_log.w('confirm does not match new');
          __fg_pin_showFieldError(__fg_pin_inputConfirmEl, 'Confirm PIN does not match');
          __fg_pin_notify('New PIN and confirm PIN do not match', 'error');
          return;
        }

        const sessionInfo = await __fg_pin_getCurrentUid();
        if (!sessionInfo || !sessionInfo.uid) {
          __fg_pin_log.e('no user session available to change PIN');
          __fg_pin_notify('You must be signed in to change PIN', 'error');
          return;
        }
        const uid = sessionInfo.uid;
        __fg_pin_log.d('session uid', uid);

        __fg_pin_notify('Verifying current PIN...', 'info');
        const found = await __fg_pin_findStoredPin({ uid }); // Note: Pass object { uid }
        if (!found) {
          __fg_pin_log.w('no stored pin record located');
          __fg_pin_notify(
            'No existing PIN found. Redirecting to reset...',
            'error'
          );
          setTimeout(() => {
            window.location.href = '/reset-pin.html';
          }, 1200);
          return;
        }

        // Verify current PIN using /api/verify-pin
        try {
          const verifyRes = await fetch('https://api.flexgig.com.ng/api/verify-pin', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
            },
            body: JSON.stringify({ pin: cur }),
            credentials: 'include',
          });
          if (!verifyRes.ok) {
            const { error } = await verifyRes.json();
            __fg_pin_log.w('current PIN verification failed', error);
            __fg_pin_showFieldError(__fg_pin_inputCurrentEl, error?.message || 'Current PIN is incorrect');
            __fg_pin_notify(error?.message || 'Current PIN is incorrect', 'error');
            __fg_pin_clearAllInputs();
            return;
          }
        } catch (err) {
          __fg_pin_log.e('Error verifying PIN:', err);
          __fg_pin_notify('Failed to verify PIN. Try again.', 'error');
          return;
        }

        __fg_pin_notify('Updating PIN...', 'info');
        const upd = await __fg_pin_updateStoredPin(uid, found.table, found.column, neu);
        if (upd && upd.ok) {
          __fg_pin_log.i('pin update succeeded');
          __fg_pin_notify('PIN changed successfully', 'success');
          try {
            __fg_pin_inputConfirmEl &&
              __fg_pin_inputConfirmEl.blur &&
              __fg_pin_inputConfirmEl.blur();
            __fg_pin_inputNewEl && __fg_pin_inputNewEl.blur && __fg_pin_inputNewEl.blur();
            __fg_pin_inputCurrentEl &&
              __fg_pin_inputCurrentEl.blur &&
              __fg_pin_inputCurrentEl.blur();
            __fg_pin_log.d('blurred inputs after update success');
          } catch (b) {
            __fg_pin_log.d('blur after update error', b);
          }

          if (__fg_pin_inputCurrentEl) __fg_pin_inputCurrentEl.value = '';
          if (__fg_pin_inputNewEl) __fg_pin_inputNewEl.value = '';
          if (__fg_pin_inputConfirmEl) __fg_pin_inputConfirmEl.value = '';
          // Close modal using ModalManager
          if (window.ModalManager && typeof window.ModalManager.closeModal === 'function') {
            window.ModalManager.closeModal('securityPinModal');
            __fg_pin_log.i('Closed PIN modal via ModalManager');
          } else {
            __fg_pin_securityPinModal?.classList.remove('active');
            __fg_pin_securityPinModal?.setAttribute('aria-hidden', 'true');
            __fg_pin_log.w('ModalManager not available, closed PIN modal directly');
          }
        } else {
          __fg_pin_log.e('pin update failed', upd && upd.error);
          __fg_pin_notify('Failed to update PIN. Please try again later.', 'error');
        }
      } catch (err) {
        __fg_pin_log.e('Change PIN submit error', err);
        __fg_pin_notify('Unexpected error while changing PIN', 'error');
      }
    },
    { passive: false }
  );
    __fg_pin_log.i('Change PIN form handler attached (strict)');
  } else {
    __fg_pin_log.d('changePinForm not present on page yet');
  }

  // Reset PIN action
  if (__fg_pin_resetPinBtn) {
    __fg_pin_resetPinBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      __fg_pin_log.i('resetPinBtn clicked - redirecting to reset flow');
      __fg_pin_notify('Redirecting to PIN reset flow', 'info');
      window.location.href = '/reset-pin.html';
    });
  }

  // Bind strict inputs when modal opens via custom event
  document.addEventListener('security:pin-modal-opened', () => {
    try {
      __fg_pin_bindStrictPinInputs();
      __fg_pin_log.i('Bound strict PIN inputs on security:pin-modal-opened event');
    } catch (e) {
      __fg_pin_log.d('bindStrictPinInputs error on modal open', e);
    }
  });

  // Expose debug helpers
  window.__fg_debugPinModule = {
    __fg_pin_findStoredPin,
    __fg_pin_updateStoredPin,
    __fg_pin_bindStrictPinInputs,
    __fg_pin_notify,
    __fg_pin_autoSubmitIfValid,
  };

  __fg_pin_log.i('Security PIN integration loaded');
})();


/* Dashboard PIN and Security Integration */
(function (supabase) {
  // Debugging setup
  const DEBUG = true;
  const log = {
    d: (...a) => { if (DEBUG) console.debug('[PIN][debug]', ...a); },
    i: (...a) => { if (DEBUG) console.info('[PIN][info]', ...a); },
    w: (...a) => { if (DEBUG) console.warn('[PIN][warn]', ...a); },
    e: (...a) => { if (DEBUG) console.error('[PIN][error]', ...a); },
  };

  // Utility function for querying elements
  const q = (sel, base = document) => base.querySelector(sel);

  // Elements
  const pinModal = q('#pinModal');
  const securityPinModal = q('#securityPinModal');
  const pinForm = q('#pinForm');
  const changePinForm = q('#changePinForm');
  const pinInputs = pinModal?.querySelectorAll('input[data-fg-pin]');
  const pinAlert = q('#pinAlert');
  const pinAlertMsg = q('#pinAlertMsg');
  const securityPinRow = q('#securityPinRow');
  const securityModal = q('#securityModal');
  const pinVerifyModal = q('#pinVerifyModal');
  const pinVerifyForm = q('#pinVerifyForm');
  const pinVerifyInputs = pinVerifyModal?.querySelectorAll('input[data-fg-pin]');
  const pinVerifyAlert = q('#pinVerifyAlert');
  const pinVerifyAlertMsg = q('#pinVerifyAlertMsg');
  const payBtn = q('#payBtn');
  const inactivityModal = q('#inactivityModal');
  const inactivityConfirmBtn = q('#inactivityConfirmBtn');

  let lastModalSource = null; // Track context (e.g., 'security', 'checkout', 'inactivity')
  let inactivityTimer = null; // Timer for 10-minute inactivity
  let inactivityPopupTimer = null; // Timer for 30-second popup

  // Debounce utility for keyboard flicker fix
  function debounce(fn, ms) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), ms);
    };
  }

  // Notify function for alerts
  function notify(msg, type = 'info', target = pinAlert, msgEl = pinAlertMsg) {
    if (target && msgEl) {
      target.classList.remove('hidden');
      target.classList.remove('success', 'error', 'info');
      target.classList.add(type);
      msgEl.textContent = msg;
      setTimeout(() => target.classList.add('hidden'), 3000);
    }
  }

  // Get user ID from Supabase
  async function getUid() {
  try {
    const s = await window.getSession();
    log.d('getSession result', s);
    if (s && s.user && s.user.uid) return { uid: s.user.uid, session: s };
    // No fallback - rely on cookies/session
    throw new Error('No signed-in user');
  } catch (err) {
    log.e('getUid error', err);
    return null;
  }
}

  // Find stored PIN in Supabase
  async function findStoredPin(uid) {
  try {
    const response = await fetch('https://api.flexgig.com.ng/api/check-pin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // Removed Authorization
      },
      credentials: 'include',
      body: JSON.stringify({ userId: uid })  // Pass for verification
    });
    if (!response.ok) {
      console.error('[PinModal] Failed to check PIN:', await response.text());
      return null;
    }
    const { hasPin } = await response.json();
    if (hasPin) {
      console.log('[PinModal] PIN found in users.pin');
      return { table: 'users', column: 'pin' };
    }
    console.log('[PinModal] No PIN found');
    return null;
  } catch (err) {
    console.error('[PinModal] Error checking PIN:', err);
    return null;
  }
}

  // Update PIN in Supabase
  // Update PIN in Supabase
async function updateStoredPin(uid, newPin) {
  console.log('[DEBUG] updateStoredPin CALLED with uid:', uid, 'pin:', newPin);
  return withLoader(async () => {
    try {
      const response = await fetch('https://api.flexgig.com.ng/api/save-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // Removed Authorization
        },
        credentials: 'include',
        body: JSON.stringify({ userId: uid, pin: newPin })  // Pass userId
      });

      if (!response.ok) {
        let errorMsg = 'Failed to update PIN';
        try {
          const { error } = await response.json();
          if (error?.message) errorMsg = error.message;
        } catch (_) {}
        console.error('[PinModal] PIN update failed:', errorMsg);
        return { ok: false, error: errorMsg };
      }

      console.log('[PinModal] PIN updated successfully');
      return { ok: true };
    } catch (err) {
      console.error('[PinModal] Error updating PIN:', err);
      return { ok: false, error: err.message };
    }
  });
}


  // Re-authenticate with PIN
  async function reAuthenticateWithPin(uid, pin, callback) {
  return withLoader(async () => {

  try {
    const found = await findStoredPin(uid);
    if (!found) {
      notify('No PIN set. Please set a PIN first.', 'error', pinVerifyAlert, pinVerifyAlertMsg);
      return false;
    }
    const res = await fetch('https://api.flexgig.com.ng/api/verify-pin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // Removed Authorization
      },
      body: JSON.stringify({ userId: uid, pin }),
      credentials: 'include',
    });
    if (!res.ok) {
      const { error } = await res.json();
      notify(error?.message || 'Incorrect PIN. Try again.', 'error', pinVerifyAlert, pinVerifyAlertMsg);
      return false;
    }
    notify('PIN verified successfully', 'success', pinVerifyAlert, pinVerifyAlertMsg);
    callback(true);
    return true;
  } catch (err) {
    log.e('reAuthenticateWithPin error', err);
    notify('Error verifying PIN. Please try again.', 'error', pinVerifyAlert, pinVerifyAlertMsg);
    return false;
  }
  });
}

  // Reusable PIN check function
  window.checkPinExists = async function (callback, context = null) {
    const info = await getUid();
    if (!info || !info.uid) {
      notify('You must be signed in to perform this action', 'error');
      return false;
    }
    const pinExists = await findStoredPin(info.uid);
    lastModalSource = context;
    if (!pinExists) {
      window.ModalManager.openModal('pinModal');
      pinForm?.addEventListener('submit', function onPinSet() {
        pinForm.removeEventListener('submit', onPinSet);
        callback(false); // PIN was just set
      }, { once: true });
      return false;
    }
    callback(true);
    return true;
  };

  // Bind PIN inputs for both pinModal and pinVerifyModal
  function bindPinInputs(inputs, form, modal, alert, alertMsg) {
    const maxLen = 1;
    const pinLength = 4;
    const debounceFocus = debounce((input, next) => {
      if (next && input.value.length >= maxLen) next.focus();
    }, 50);

    inputs.forEach((input, i) => {
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('pattern', '[0-9]*');
      input.setAttribute('maxlength', maxLen);
      input.autocomplete = 'one-time-code';

      input.addEventListener('input', () => {
        const before = input.value || '';
        const cleaned = before.replace(/\D/g, '').slice(0, maxLen);
        if (before !== cleaned) {
          input.value = cleaned;
          log.d('[input]', input.dataset.fgPin, { before, cleaned });
        }
        const next = i < inputs.length - 1 ? inputs[i + 1] : null;
        debounceFocus(input, next);
      });

      input.addEventListener('input', () => {
        const allFilled = Array.from(inputs).every(inp => inp.value.length === maxLen);
        if (allFilled && i === inputs.length - 1) {
          form.requestSubmit();
          inputs.forEach(inp => inp.blur());
        }
      });

      input.addEventListener('keypress', (ev) => {
        if (!/^[0-9]$/.test(ev.key)) {
          ev.preventDefault();
          log.d('[keypress] blocked', input.dataset.fgPin, ev.key);
        }
      });

      input.addEventListener('paste', (ev) => {
        ev.preventDefault();
        const pasted = (ev.clipboardData || window.clipboardData).getData('text');
        const digits = pasted.replace(/\D/g, '').slice(0, pinLength);
        if (digits.length) {
          for (let j = 0; j < digits.length && i + j < inputs.length; j++) {
            inputs[i + j].value = digits[j];
          }
          const target = digits.length >= pinLength ? inputs[inputs.length - 1] : inputs[i + digits.length];
          target?.focus();
          if (digits.length >= pinLength) {
            form.requestSubmit();
            inputs.forEach(inp => inp.blur());
          }
        }
      });
    });

    // Keypad buttons
    const keypadButtons = modal.querySelectorAll('.pin-keypad button[data-key]');
    keypadButtons.forEach(button => {
      button.addEventListener('click', () => {
        const key = button.dataset.key;
        const activeInput = Array.from(inputs).find(inp => !inp.value);
        if (activeInput) {
          activeInput.value = key;
          const event = new Event('input', { bubbles: true });
          activeInput.dispatchEvent(event);
        }
      });
    });

    const deleteKey = modal.querySelector('#deleteKey, #deleteVerifyKey');
    if (deleteKey) {
      deleteKey.addEventListener('click', () => {
        const lastFilled = Array.from(inputs).filter(inp => inp.value).pop();
        if (lastFilled) {
          lastFilled.value = '';
          lastFilled.focus();
        }
      });
    }
  }


  // Initialize PIN modal
  function initPinModal() {
    if (pinForm && pinInputs.length) {
      bindPinInputs(pinInputs, pinForm, pinModal, pinAlert, pinAlertMsg);
      pinForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const pin = Array.from(pinInputs).map(input => input.value).join('');
  if (!/^\d{4}$/.test(pin)) {
    notify('PIN must be 4 digits', 'error');
    pinInputs.forEach(inp => inp.value = ''); // Clear inputs on error
    return;
  }
  const info = await getUid();
  if (!info || !info.uid) {
    notify('You must be signed in to set PIN', 'error');
    pinInputs.forEach(inp => inp.value = ''); // Clear inputs on error
    return;
  }
  const found = await findStoredPin(info.uid) || { table: 'profiles', column: 'pin' };
  notify('Setting PIN...', 'info');
  const upd = await updateStoredPin(info.uid, pin);  // Updated call (removed table/column if not needed)
  if (upd.ok) {
    notify('PIN set successfully', 'success');
    pinInputs.forEach(inp => inp.value = '');
    window.ModalManager.closeModal('pinModal');
    if (lastModalSource === 'security') {
      window.ModalManager.openModal('securityModal');
    } else if (lastModalSource === 'checkout') {
      window.ModalManager.openModal('pinVerifyModal');
    }
  } else {
    notify('Failed to set PIN. Try again.', 'error');
    pinInputs.forEach(inp => inp.value = ''); // Clear inputs on error
  }
});
    }
  }

  // Initialize PIN verification modal
  function initPinVerifyModal() {
    if (pinVerifyForm && pinVerifyInputs.length) {
      bindPinInputs(pinVerifyInputs, pinVerifyForm, pinVerifyModal, pinVerifyAlert, pinVerifyAlertMsg);
      pinVerifyForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const pin = Array.from(pinVerifyInputs).map(input => input.value).join('');
  if (!/^\d{4}$/.test(pin)) {
    notify('PIN must be 4 digits', 'error', pinVerifyAlert, pinVerifyAlertMsg);
    pinVerifyInputs.forEach(inp => inp.value = ''); // Clear inputs on error
    return;
  }
  const info = await getUid();
  if (!info || !info.uid) {
    notify('You must be signed in to verify PIN', 'error', pinVerifyAlert, pinVerifyAlertMsg);
    pinVerifyInputs.forEach(inp => inp.value = ''); // Clear inputs on error
    return;
  }
  await reAuthenticateWithPin(info.uid, pin, (success) => {
    if (success) {
      pinVerifyInputs.forEach(inp => inp.value = '');
      window.ModalManager.closeModal('pinVerifyModal');
      if (lastModalSource === 'checkout') {
        notify('Payment processing...', 'info');
        // Add your payment logic here
      }
    } else {
      notify('Incorrect PIN. Please try again.', 'error', pinVerifyAlert, pinVerifyAlertMsg);
      pinVerifyInputs.forEach(inp => inp.value = ''); // Clear inputs on error
    }
  });
});
    }
  }

  // Initialize security PIN modal
  function initSecurityPinModal() {
    if (securityPinRow) {
      securityPinRow.addEventListener('click', async () => {
        const info = await getUid();
        if (!info || !info.uid) {
          notify('You must be signed in to manage PIN', 'error');
          return;
        }
        lastModalSource = 'security';
        await window.checkPinExists((hasPin) => {
          if (hasPin) {
            window.ModalManager.openModal('securityPinModal');
          }
        }, 'security');
      });
    }
    if (changePinForm) {
      changePinForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const currentPin = q('#currentPin').value.trim();
        const newPin = q('#newPin').value.trim();
        const confirmPin = q('#confirmPin').value.trim();
        if (!/^\d{4}$/.test(currentPin)) {
          notify('Current PIN must be 4 digits', 'error');
          return;
        }
        if (!/^\d{4}$/.test(newPin)) {
          notify('New PIN must be 4 digits', 'error');
          return;
        }
        if (newPin === currentPin) {
          notify('New PIN must be different from current PIN', 'error');
          return;
        }
        if (newPin !== confirmPin) {
          notify('New PIN and confirm PIN do not match', 'error');
          return;
        }
        const info = await getUid();
        if (!info || !info.uid) {
          notify('You must be signed in to change PIN', 'error');
          return;
        }
        const found = await findStoredPin(info.uid);
        if (!found) {
          notify('Cannot verify PIN. Use Reset PIN.', 'error');
          return;
        }
        // Note: Assuming backend verify-pin can check currentPin; if found.value is hashed, use reAuthenticateWithPin for current
        await reAuthenticateWithPin(info.uid, currentPin, async (success) => {
          if (!success) {
            notify('Current PIN is incorrect', 'error');
            return;
          }
          notify('Updating PIN...', 'info');
          const upd = await updateStoredPin(info.uid, newPin);
          if (upd.ok) {
            notify('PIN changed successfully', 'success');
            q('#currentPin').value = '';
            q('#newPin').value = '';
            q('#confirmPin').value = '';
            window.ModalManager.closeModal('securityPinModal');
            if (lastModalSource === 'security') {
              window.ModalManager.openModal('securityModal');
            }
          } else {
            notify('Failed to update PIN. Try again.', 'error');
          }
        });
      });
    }
    const resetPinBtn = q('#resetPinBtn');
    if (resetPinBtn) {
      resetPinBtn.addEventListener('click', () => {
        notify('Redirecting to PIN reset flow', 'info');
        window.location.href = '/reset-pin.html';
      });
    }
  }

  // Initialize checkout PIN verification
  function initCheckoutPin() {
    if (payBtn) {
      payBtn.addEventListener('click', async () => {
        const info = await getUid();
        if (!info || !info.uid) {
          notify('You must be signed in to proceed with payment', 'error');
          return;
        }
        await window.checkPinExists((hasPin) => {
          if (hasPin) {
            window.ModalManager.openModal('pinVerifyModal');
          }
        }, 'checkout');
      });
    }
  }

  // Initialize inactivity handling
  // function initInactivity() {
  //   const events = ['click', 'keypress', 'scroll', 'mousemove', 'touchstart'];
  //   events.forEach(event => {
  //     document.addEventListener(event, resetInactivityTimer, { passive: true });
  //   });
  //   resetInactivityTimer();
  //   if (inactivityConfirmBtn) {
  //     inactivityConfirmBtn.addEventListener('click', () => {
  //       window.ModalManager.closeModal('inactivityModal');
  //       clearTimeout(inactivityPopupTimer);
  //       resetInactivityTimer();
  //     });
  //   }
  // }

  // Initialize on page load
  function boot() {
    log.d('Booting PIN and security module');
    initPinModal();
    initPinVerifyModal();
    initSecurityPinModal();
    initCheckoutPin();
    if (window.__reauth && typeof window.__reauth.setupInactivity === 'function') {
  window.__reauth.setupInactivity();
}

    // Check PIN on page load
    window.checkPinExists((hasPin) => {
      if (hasPin) {
        window.ModalManager.openModal('pinVerifyModal');
      }
    }, 'load');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 0);
  }
})(supabaseClient);









// --- UPDATE PROFILE MODAL ---
// --- UPDATE PROFILE MODAL ---
// --- UPDATE PROFILE MODAL ---
const updateProfileBtn = document.getElementById('updateProfileBtn'); // dashboard
const settingsUpdateBtn = document.getElementById('settingsUpdateBtn'); // settings
const updateProfileModal = document.getElementById('updateProfileModal');
const updateProfileForm = document.getElementById('updateProfileForm');
const profilePictureInput = document.getElementById('profilePicture');
const profilePicturePreview = document.getElementById('profilePicturePreview');
const fullNameInput = document.getElementById('fullName');
const usernameInput = document.getElementById('username');
const phoneNumberInput = document.getElementById('phoneNumber');
const emailInput = document.getElementById('email');
const addressInput = document.getElementById('address');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const fullNameError = document.getElementById('fullNameError');
const usernameError = document.getElementById('usernameError');
const phoneNumberError = document.getElementById('phoneNumberError');
const addressError = document.getElementById('addressError');
const profilePictureError = document.getElementById('profilePictureError');
let isUsernameAvailable = false;
let lastModalSource = null; // can be 'dashboard' or 'settings'


// Validate DOM elements
const requiredElements = {
  updateProfileModal,
  updateProfileForm,
  profilePictureInput,
  profilePicturePreview,
  fullNameInput,
  usernameInput,
  phoneNumberInput,
  emailInput,
  addressInput,
  saveProfileBtn,
  fullNameError,
  usernameError,
  phoneNumberError,
  addressError,
  profilePictureError
};

for (const [key, element] of Object.entries(requiredElements)) {
  if (!element) {
    console.error(`[ERROR] Missing DOM element: ${key}`);
  }
}

if (updateProfileBtn) {
  updateProfileBtn.addEventListener('click', () => {
    lastModalSource = 'dashboard';
    openUpdateProfileModal();
  });
}

if (settingsUpdateBtn) {
  settingsUpdateBtn.addEventListener('click', () => {
    lastModalSource = 'settings';
    openUpdateProfileModal();
  });
}


const updateProfileCard = document.querySelector('.card.update-profile');
if (updateProfileCard) {
  updateProfileCard.addEventListener('click', () => {
    console.log('[DEBUG] Update Profile card clicked');
    openUpdateProfileModal({});
  });
}

// --- Helper: get file from input safely and ensure FormData has it ---
// --- Helper: ensure file is in FormData ---
function ensureFileInFormData(formData, inputEl, fieldName = 'profilePicture') {
  try {
    const existing = formData.get(fieldName);
    if (existing instanceof File) return; // already included
  } catch (e) { /* ignore */ }

  if (inputEl && inputEl.files && inputEl.files[0]) {
    formData.set(fieldName, inputEl.files[0], inputEl.files[0].name);
  }
}

// --- SINGLE consolidated submit handler for updateProfileForm ---
if (updateProfileForm) {
  // Remove previous listener if any (defensive)
  updateProfileForm.removeEventListener && 
  updateProfileForm.removeEventListener('submit', 
  updateProfileForm.__submitHandler);

  updateProfileForm.__submitHandler = async function (e) {
    e.preventDefault();

    if (!saveProfileBtn || saveProfileBtn.disabled) {
      console.log('[DEBUG] updateProfileForm: submit aborted (disabled)');
      return;
    }

    // Mark fields touched & validate
    Object.keys(fieldTouched).forEach(key => {
      const inputMap = {
        fullName: fullNameInput,
        username: usernameInput,
        phoneNumber: phoneNumberInput,
        address: addressInput,
        profilePicture: profilePictureInput
      };
      const el = inputMap[key];
      // Only mark as touched if element exists and is not disabled.
      fieldTouched[key] = !!(el && !el.disabled);
    });

    validateProfileForm(true);
    if (saveProfileBtn.disabled) {
      console.log('[DEBUG] updateProfileForm: invalid after validation');
      return;
    }

    const originalBtnContent = saveProfileBtn.innerHTML; // Save original button content
    saveProfileBtn.disabled = true;

    withLoader(async () => {

    try {
      // Build FormData
      const formData = new FormData(updateProfileForm);

      // Include disabled email field value from localStorage
      formData.set('email', localStorage.getItem('userEmail') || '');

      // Full name & username: prefer input value, otherwise fall back to localStorage
      const fullNameVal = (fullNameInput && fullNameInput.value.trim()) || 
      localStorage.getItem('fullName') || '';
      const usernameVal = (usernameInput && usernameInput.value.trim()) || 
      localStorage.getItem('username') || '';
      const addressVal = (addressInput && addressInput.value.trim()) || 
      localStorage.getItem('address') || '';

      // Phone: prefer input value then localStorage; remove formatting spaces
      let phoneRaw = '';
      if (phoneNumberInput && phoneNumberInput.value) phoneRaw = 
      phoneNumberInput.value.replace(/\s/g, '');
      else phoneRaw = (localStorage.getItem('phoneNumber') || '').replace(/\s/g, 
      '');

      formData.set('fullName', fullNameVal);
      formData.set('username', usernameVal);
      formData.set('address', addressVal);
      formData.set('phoneNumber', phoneRaw);

      // Ensure file is appended even if input[name] missing
      if (profilePictureInput && profilePictureInput.files[0]) {
        formData.set('profilePicture', profilePictureInput.files[0]);
      }

      // Debug: print entries (no binary)
      const debugObj = {};
      for (const [k, v] of formData.entries()) {
        debugObj[k] = v instanceof File ? `File: ${v.name} (${v.type}, ${v.size})` : v;
      }
      console.log('[DEBUG] updateProfileForm: sending', debugObj);

      // POST (do NOT set Content-Type when sending FormData)
      const response = await 
fetch('https://api.flexgig.com.ng/api/profile/update', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
        },
        body: formData,
        credentials: 'include'
      });

      // Parse response safely
      let rawText = '';
      let parsedData = null;
      try {
        rawText = await response.text();
        parsedData = rawText ? JSON.parse(rawText) : null;
      } catch (e) {
        console.warn('[WARN] updateProfileForm: Response is not valid JSON');
      }

      if (!response.ok) {
        console.error('[ERROR] updateProfileForm: Failed response', response.status, parsedData || rawText);
        const serverMsg = (parsedData && (parsedData.error || 
parsedData.message)) || rawText || `HTTP ${response.status}`;
        throw new Error(serverMsg);
      }

      // Immediate localStorage and DOM update with submitted values for quick feedback
      localStorage.setItem('fullName', fullNameVal);
      localStorage.setItem('username', usernameVal);
      localStorage.setItem('phoneNumber', phoneRaw);
      localStorage.setItem('address', addressVal);
      localStorage.setItem('firstName', fullNameVal.split(' ')[0] || 'User');

      // If a new picture file was uploaded, temporarily set a local data URI for instant display
      let tempProfilePicture = localStorage.getItem('profilePicture') || '';
      if (profilePictureInput && profilePictureInput.files[0]) {
        tempProfilePicture = URL.createObjectURL(profilePictureInput.files[0]);
        localStorage.setItem('profilePicture', tempProfilePicture); // Temporary; server fetch will overwrite
      }

      // Update DOM immediately
      const firstnameEl = document.getElementById('firstname');
      const avatarEl = document.getElementById('avatar');
      if (firstnameEl && avatarEl) {
        const displayName = usernameVal || (fullNameVal.split(' ')[0] || 'User');
        firstnameEl.textContent = displayName.charAt(0).toUpperCase() + displayName.slice(1);

        const isValidTempPicture = tempProfilePicture && /^(data:image\/|https?:\/\/|\/|blob:)/i.test(tempProfilePicture); // Allow blob: for local URL
        if (isValidTempPicture) {
          avatarEl.innerHTML = `<img src="${tempProfilePicture}" alt="Profile Picture" class="avatar-img" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else {
          avatarEl.innerHTML = '';
          avatarEl.textContent = displayName.charAt(0).toUpperCase();
        }
      }

      // Show success notification
      const notification = document.getElementById('notification') || document.getElementById('profileUpdateNotification');
      if (notification) {
        notification.textContent = 'Profile updated successfully!';
        notification.classList.add('active');
        setTimeout(() => notification.classList.remove('active'), 3000);
      }

      closeUpdateProfileModal();

      // Fetch fresh server data and apply (will overwrite temp values if needed)
      await loadUserProfile(true);

    } catch (err) {
      console.error('[ERROR] updateProfileForm:', err);
      if (err.message && err.message.toLowerCase().includes('username')) {
        if (usernameError) {
          usernameError.textContent = 'Username is already taken';
          usernameError.classList.add('active');
          usernameInput.classList.add('invalid');
        }
      } else {
        const generalError = document.createElement('div');
        generalError.className = 'error-message active';
        generalError.textContent = `Failed to update profile: ${err.message || err}`;
        updateProfileForm.prepend(generalError);
        setTimeout(() => generalError.remove(), 4000);
      }
    } finally {
      // Always reset button after operation
      saveProfileBtn.disabled = false;
      saveProfileBtn.innerHTML = originalBtnContent; // Restore original content
    }
  });
  };

  updateProfileForm.addEventListener('submit', 
updateProfileForm.__submitHandler);
}

// Profile-specific phone number functions
function isValidPrefixPartial(cleaned) {
  if (!cleaned) return true;
  const allPrefixes = Object.values(providerPrefixes || {}).flat();
  if (!allPrefixes.length) return true;

  const first3 = cleaned.slice(0, 3);
  const first4 = cleaned.slice(0, 4);

  if (cleaned.length >= 4) {
    return allPrefixes.includes(first4);
  }
  if (cleaned.length === 3) {
    return allPrefixes.some(p => p.slice(0, 3) === first3);
  }
  return true;
}

// Stronger final mobile check: requires 11 digits, starts 0[7|8|9], and 4-digit prefix exist
function isNigeriaMobileProfile(phone) {
  const cleaned = (phone || '').replace(/\s/g, '');
  if (!/^\d{11}$/.test(cleaned)) return false;
  if (!/^0[789]/.test(cleaned)) return false;
  const prefix4 = cleaned.slice(0, 4);
  const allPrefixes = Object.values(providerPrefixes || {}).flat();
  return allPrefixes.includes(prefix4);
}

// Normalizes various inputs to local 0-prefixed form where appropriate
function normalizePhoneProfile(input) {
  if (!input) return '';
  const digits = input.replace(/\D/g, '');
  if (/^234[789]/.test(digits)) return '0' + digits.slice(3, 14);
  if (/^[789]/.test(digits)) return '0' + digits;
  return digits;
}

// Formatting: "0XXX XXXX XXXX" (with spaces)
function formatNigeriaNumberProfile(input, isInitialDigit = false, isPaste = false) {
  const normalized = normalizePhoneProfile(input);
  if (!normalized) return { value: '', cursorOffset: 0 };
  let formatted = normalized;
  if (isInitialDigit && !normalized.startsWith('0')) formatted = '0' + normalized;
  if (formatted.length > 11) formatted = formatted.slice(0, 11);

  const parts = formatted.replace(/\s/g, '');
  if (parts.length <= 4) return { value: parts, cursorOffset: isPaste ? parts.length : 0 };
  if (parts.length <= 8) return { value: parts.slice(0, 4) + ' ' + parts.slice(4), cursorOffset: isPaste ? parts.length + 1 : 0 };
  return { value: parts.slice(0, 4) + ' ' + parts.slice(4, 8) + ' ' + parts.slice(8), cursorOffset: isPaste ? parts.length + 2 : 0 };
}

// Validate phone number field but only show length/prefix errors if touched or blurred
function validatePhoneNumberField(inputElement, errorElement) {
  const raw = (inputElement.value || '').replace(/\s/g, '');
  let error = '';

  // show final (length/prefix) errors only when touched or on blur (not while actively typing)
  const showFinalErrors = !!fieldTouched.phoneNumber || document.activeElement !== inputElement;

  // quick non-digit guard
  if (raw && !/^\d*$/.test(raw)) {
    error = 'Phone number must contain only digits';
  } else {
    // If the input starts with the country code "234"
    const startsWith234 = raw.startsWith('234');

    // If the user only typed "234" (country code alone), treat it as allowed while typing
    if (startsWith234 && raw.length === 3) {
      // Clear UI and return valid (do not mark touched)
      if (errorElement) { errorElement.textContent = ''; errorElement.classList.remove('active'); }
      if (inputElement) inputElement.classList.remove('invalid');
      return true;
    }

    // Build normalized value for checks:
    // - If startsWith234 and has more chars, normalize to local "0..." form
    // - Otherwise, use raw as-is (local form or partial)
    let normalizedForChecks = raw;
    if (startsWith234 && raw.length > 3) {
      normalizedForChecks = '0' + raw.slice(3); // e.g. 234803... -> 0803...
    }

    const normLen = normalizedForChecks.length;
    const rawLen = raw.length;

    // 1) Specific immediate single-digit starts (exact messages)
    if (rawLen === 1 && /^[1456]$/.test(raw)) {
      error = `Phone number cannot start with ${raw}`;
    } else if (startsWith234 && rawLen >= 4 && /^[1456]$/.test(normalizedForChecks[1])) {
      // normalizedForChecks[1] is the local first digit (normalized begins with '0')
      error = `Phone number cannot start with ${normalizedForChecks[1]}`;
    } else {
      // For normal local input (not country-code), check "0[1456]" pattern as soon as second char exists
      if (!startsWith234) {
        if (normLen >= 2 && /^0[1456]/.test(normalizedForChecks)) {
          error = `Phone number cannot start with ${normalizedForChecks[1]}`;
        }
      }
    }

    // 2) Prefix validity using normalizedForChecks (but only when we have enough digits)
    if (!error) {
      // Only run partial/full prefix checks if we have at least 3 normalized digits (or 4 to be strict)
      if (normLen >= 3 && !isValidPrefixPartial(normalizedForChecks)) {
        if (showFinalErrors || normLen >= 4) {
          error = 'Invalid Nigerian phone number prefix';
        }
      }
    }

    // 3) Length error: only show after touched or blur
    if (!error && showFinalErrors) {
      if (normLen > 0 && normLen < 11) {
        error = 'Phone number must be 11 digits';
      }
    }

    // 4) Full-length final validity check
    if (!error && normLen === 11 && !isNigeriaMobileProfile(normalizedForChecks)) {
      error = 'Invalid Nigerian phone number';
    }
  }

  // Render UI
  if (errorElement) {
    errorElement.textContent = error;
    errorElement.classList.toggle('active', !!error);
  }
  if (inputElement) {
    inputElement.classList.toggle('invalid', !!error);
  }
  return !error;
}




// Debounce function
// Debounce (kept simple)
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// keep a module-level AbortController reference to cancel previous checks
let __usernameAvailabilityController = null;

/**
 * checkUsernameAvailability(username, { signal })
 * returns boolean
 */
async function checkUsernameAvailability(username, signal = undefined) {
  // Only accept validated username strings of 3..15 chars and allowed chars
  if (!username || !/^[a-zA-Z0-9_]{3,15}$/.test(username)) {
    isUsernameAvailable = false;
    return false;
  }

  // Cancel previous inflight request
  try { if (__usernameAvailabilityController) __usernameAvailabilityController.abort(); } catch (e) { /* ignore */ }
  __usernameAvailabilityController = new AbortController();
  const controller = __usernameAvailabilityController;
  const fetchSignal = signal || controller.signal;

  try {
    const resp = await fetch('https://api.flexgig.com.ng/api/profile/check-username', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
      },
      body: JSON.stringify({ username }),
      signal: fetchSignal
    });

    const text = await resp.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { /* ignore */ }

    if (!resp.ok) {
      console.warn('[WARN] checkUsernameAvailability: non-OK', resp.status, text);
      isUsernameAvailable = false;
      return false;
    }

    const available = !!(data && data.available);
    isUsernameAvailable = available;
    return available;
  } catch (err) {
    if (err && err.name === 'AbortError') {
      // aborted — that's fine
      return false;
    }
    console.error('[ERROR] checkUsernameAvailability:', err && err.message ? err.message : err);
    isUsernameAvailable = false;
    return false;
  } finally {
    // if this controller is the current one, clear it (so next call creates a new controller)
    if (controller === __usernameAvailabilityController) __usernameAvailabilityController = null;
  }
}


const fieldTouched = {
  fullName: false,
  username: false,
  phoneNumber: false,
  address: false,
  profilePicture: false
};

function validateProfileForm(showErrors = true) {
  // Guard: Skip if modal is not active
  if (!updateProfileModal || !updateProfileModal.classList.contains('active')) {
    console.log('[DEBUG] validateProfileForm: Skipped - modal not active');
    return true;
  }

  const isFullNameValid = !fieldTouched.fullName || validateField('fullName');
  const isUsernameValid = !fieldTouched.username || validateField('username');
  const isPhoneNumberValid = !fieldTouched.phoneNumber || validateField('phoneNumber');
  const isAddressValid = !fieldTouched.address || validateField('address');
  const isProfilePictureValid = !fieldTouched.profilePicture || validateField('profilePicture');

  const isFormValid = isFullNameValid && isUsernameValid && isPhoneNumberValid && isAddressValid && isProfilePictureValid;
  if (saveProfileBtn) {
    saveProfileBtn.disabled = !isFormValid;
  }

  console.log('[DEBUG] validateProfileForm:', { isFormValid, showErrors, fieldTouched });
}

function validateField(field) {
  // Map of inputs and error elements
  const inputMap = {
    fullName: fullNameInput,
    username: usernameInput,
    phoneNumber: phoneNumberInput,
    address: addressInput,
    profilePicture: profilePictureInput
  };
  const errorMap = {
    fullName: fullNameError,
    username: usernameError,
    phoneNumber: phoneNumberError,
    address: addressError,
    profilePicture: profilePictureError
  };

  // If the field hasn't been touched, consider it valid
  if (!fieldTouched[field]) return true;

  const inputElement = inputMap[field];
  const errorElement = errorMap[field];

  // NEW: If input element is disabled (locked by server rules), skip validation and treat as valid
  if (inputElement && inputElement.disabled) {
    // Clear any previous errors just in case
    if (errorElement) {
      errorElement.textContent = '';
      errorElement.classList.remove('active');
    }
    if (inputElement) inputElement.classList.remove('invalid');
    return true;
  }

  // Safeguard: Skip if elements missing (modal may not be open)
  if (!inputElement || !errorElement) {
    console.warn(`[WARN] validateField: Skipping validation for ${field} - elements not found (modal may not be open)`);
    return true;
  }

  const value = inputElement?.value || '';

  // FIX: Declare and initialize isValid here to avoid ReferenceError.
  // Default to true (valid) unless proven otherwise in the switch cases.
  let isValid = true;

  // ... continue with your existing switch (fullName, username, phoneNumber, address, profilePicture) ...

  switch (field) {
    // inside validateField(field) -> switch(field) { ... }
case 'fullName': {
  // value trimmed for validation (we don't mutate the input here)
  const trimmed = (inputElement.value || '').trim();
  let error = '';

  // If empty -> no error (hide errors while empty)
  if (!trimmed) {
    errorElement.textContent = '';
    errorElement.classList.remove('active');
    inputElement.classList.remove('invalid');
    break;
  }

  // Immediate: invalid characters show right away
  if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) {
    error = 'Full name must contain only letters';
  }
  // Length: show only after blur/submit or if input is not active
  else if (
    trimmed.length > 0 &&
    trimmed.length < 2 &&
    (fieldTouched.fullName || document.activeElement !== inputElement)
  ) {
    error = 'Full name must be at least 2 characters';
  }

  if (error) {
    errorElement.textContent = error;
    errorElement.classList.add('active');
    inputElement.classList.add('invalid');
    isValid = false;
  } else {
    errorElement.textContent = '';
    errorElement.classList.remove('active');
    inputElement.classList.remove('invalid');
  }
  break;
}




    case 'username': {
  const raw = (inputElement.value || '');
  const value = raw.trim(); // validation uses trimmed form
  let err = '';

  // If empty -> no error (errors appear on blur/submit or if invalid immediate)
  if (!value) {
    errorElement.textContent = '';
    errorElement.classList.remove('active', 'error', 'available');
    inputElement.classList.remove('invalid');
    isValid = true;
    break;
  }

  // server lock (if present)
  const lastUpdate = localStorage.getItem('lastUsernameUpdate');
  const currentUsername = localStorage.getItem('username') || '';
  if (value !== currentUsername && lastUpdate) {
    const daysSinceUpdate = (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate < 90) {
      err = `You can update your username again in ${Math.ceil(90 - daysSinceUpdate)} days`;
      errorElement.textContent = err;
      errorElement.classList.add('active', 'error');
      inputElement.classList.add('invalid');
      isValid = false;
      break;
    }
  }

  // Immediate client-side checks:
  if (/^\d/.test(value)) {
    err = 'Username cannot start with a number';
  } else if (/^_/.test(value)) {
    err = 'Username cannot start with underscore';
  } else if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    err = 'Username can only contain letters, numbers, or underscores';
  } else if (value.length > 15) {
    err = 'Username cannot exceed 15 characters';
  } else if (value.length < 3 && (fieldTouched.username || document.activeElement !== inputElement)) {
    // Minimum length only shown on blur/submit (or if already marked touched)
    err = 'Username must be at least 3 characters';
  }

  if (err) {
    errorElement.textContent = err;
    errorElement.classList.add('active', 'error');
    inputElement.classList.add('invalid');
    isValid = false;
    break;
  }

  // Passed client-side syntactic checks — now consider availability state
  // If we already have an availability result (isUsernameAvailable) we reflect it here,
  // otherwise we just clear errors (the debounced availability check will set isUsernameAvailable).
  if (value === currentUsername) {
    // unchanged username -> treat as available
    errorElement.textContent = '';
    errorElement.classList.remove('active', 'error', 'available');
    inputElement.classList.remove('invalid');
    isValid = true;
  } else {
    if (isUsernameAvailable === true) {
      errorElement.textContent = `${value} is available`;
      errorElement.classList.add('active', 'available');
      errorElement.classList.remove('error');
      inputElement.classList.remove('invalid');
      isValid = true;
    } else if (isUsernameAvailable === false) {
      // known not available
      errorElement.textContent = `${value} is already taken`;
      errorElement.classList.add('active', 'error');
      inputElement.classList.add('invalid');
      isValid = false;
    } else {
      // unknown availability (inflight or not checked yet) -> clear availability UI
      errorElement.textContent = '';
      errorElement.classList.remove('active', 'error', 'available', 'checking');
      inputElement.classList.remove('invalid');
      // do not flip isValid here — keep as true for the syntactic checks (so form enabling depends on full validation later)
      isValid = true;
    }
  }
  break;
}

    case 'phoneNumber': {
  const cleaned = value.replace(/\s/g, '');
  let error = '';

  if (cleaned && (fieldTouched.phoneNumber || document.activeElement !== inputElement)) {
    if (!/^\d*$/.test(cleaned)) {
      error = 'Phone number must contain only digits';
    } else if (/^0[1456]/.test(cleaned)) {
      error = 'Nigerian phone numbers cannot start with 1, 4, 5, or 6';
    } else if (cleaned.length >= 4 && !Object.values(providerPrefixes).flat().includes(cleaned.slice(0, 4))) {
      error = 'Invalid Nigerian phone number prefix';
    } else if (cleaned.length > 0 && cleaned.length < 11) {
      error = 'Phone number must be 11 digits';
    } else if (cleaned.length === 11 && !isNigeriaMobileProfile(cleaned)) {
      error = 'Invalid Nigerian phone number';
    }
  }

  errorElement.textContent = error;
  errorElement.classList.toggle('active', !!error);
  inputElement.classList.toggle('invalid', !!error);
  isValid = !error;
  break;
}
    case 'address': {
  const raw = inputElement.value || '';
  const trimmed = raw.trim();
  const showFinalErrors = !!fieldTouched.address || document.activeElement !== inputElement;

  // Allowed chars: letters, numbers, spaces, comma, dot, dash, hash
  const allowedRe = /^[a-zA-Z0-9\s,.\-#]*$/;

  let error = '';

  // 1) Reject space as first character
  if (raw.startsWith(' ')) {
    error = 'Address cannot start with a space';
  }
  // 2) Invalid characters (specific list)
  else if (raw && !allowedRe.test(raw)) {
    const invalid = raw.split('').filter(ch => !/[a-zA-Z0-9\s,.\-#]/.test(ch));
    const uniq = [...new Set(invalid)];
    error = `Address contains invalid character${uniq.length > 1 ? 's' : ''}: ${uniq.join('')}`;
  }
  // 3) Length check (after blur/submit only)
  else if (showFinalErrors && trimmed && trimmed.length < 5) {
    error = 'Address must be at least 5 characters long';
  }

  // Render result
  if (error) {
    errorElement.textContent = error;
    errorElement.classList.add('active');
    inputElement.classList.add('invalid');
    isValid = false;
  } else {
    errorElement.textContent = '';
    errorElement.classList.remove('active');
    inputElement.classList.remove('invalid');
    isValid = true;
  }
  break;
}


    case 'profilePicture':
      // DP is optional: only validate if a file was selected
      if (inputElement.files && inputElement.files.length > 0) {
        const file = inputElement.files[0];
        if (!file.type.startsWith('image/')) {
          errorElement.textContent = 'Profile picture must be an image';
          errorElement.classList.remove('hidden');
          isValid = false;
        } else if (file.size > 2 * 1024 * 1024) { // e.g. 2MB limit
          errorElement.textContent = 'Profile picture must be less than 2MB';
          errorElement.classList.remove('hidden');
          isValid = false;
        } else {
          errorElement.textContent = '';
          errorElement.classList.add('hidden');
        }
      } else {
        // No new file selected → still valid
        errorElement.textContent = '';
        errorElement.classList.add('hidden');
      }
      break;
  }
  return isValid;
}

// --- Helpers: attach / detach profile modal listeners ---
function detachProfileListeners() {
  const inputs = [fullNameInput, usernameInput, phoneNumberInput, addressInput /* profilePictureInput not included because you have a global change handler */];
  inputs.forEach((el) => {
    if (!el) return;
    const handlers = el.__profileHandlers || {};
    Object.entries(handlers).forEach(([type, fn]) => {
      try {
        if (typeof fn === 'function') el.removeEventListener(type, fn);
      } catch (err) {
        console.warn('detachProfileListeners: removeEventListener failed', el, type, err);
      }
    });
    el.__profileHandlers = {}; // reset
  });

  // If you ever attach a submit handler specifically for the modal and stored it,
  // remove it the same way. (Your form submit handler is already stored as updateProfileForm.__submitHandler elsewhere.)
  if (updateProfileForm && updateProfileForm.__submitHandlerAttached) {
    updateProfileForm.removeEventListener('submit', updateProfileForm.__submitHandler);
    updateProfileForm.__submitHandlerAttached = false;
  }
}

function attachProfileListeners() {
  // Defensive: ensure duplicates are removed before re-attaching.
  detachProfileListeners();

  // --- fullName ---
  // --- fullName (attachProfileListeners) ---
// --- fullName (attachProfileListeners) ---
if (fullNameInput && !fullNameInput.disabled) {
  // Input handler — show only character-related errors while typing

  try {
    const prev = fullNameInput.__profileHandlers || {};
    if (prev.input) fullNameInput.removeEventListener('input', prev.input);
    if (prev.blur) fullNameInput.removeEventListener('blur', prev.blur);
  } catch (e) { /* ignore */ }
  
  const fullNameInputHandler = () => {
    // Strip leading spaces while preserving caret
    const before = fullNameInput.value || '';
    if (/^\s+/.test(before)) {
      const caret = fullNameInput.selectionStart || 0;
      const newVal = before.replace(/^\s+/, '');
      fullNameInput.value = newVal;
      const shift = before.length - newVal.length;
      const newCaret = Math.max(0, caret - shift);
      fullNameInput.setSelectionRange(newCaret, newCaret);
    }

    const trimmed = (fullNameInput.value || '').trim();

    // If empty -> clear errors and class (no validation while empty)
    if (!trimmed) {
      if (fullNameError) {
        fullNameError.textContent = '';
        fullNameError.classList.remove('active');
      }
      fullNameInput.classList.remove('invalid');
      // Do not set fieldTouched here (we want blur/submit to mark it)
      validateProfileForm(false);
      return;
    }

    // Live character rule
    if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) {
      if (fullNameError) {
        fullNameError.textContent = 'Full name must contain only letters';
        fullNameError.classList.add('active');
      }
      fullNameInput.classList.add('invalid');
    } else {
      // Clear live char error; length error will be checked on blur/submit
      if (fullNameError && !fieldTouched.fullName) {
        fullNameError.textContent = '';
        fullNameError.classList.remove('active');
      }
      fullNameInput.classList.remove('invalid');
    }

    validateProfileForm(false);
  };

  // Blur handler — mark touched and run full validation (including length)
  const fullNameBlurHandler = () => {
    // On blur we mark touched and run the full validation (including length)
    fieldTouched.fullName = true;
    // Also trim the input value (so we store clean data)
    fullNameInput.value = (fullNameInput.value || '').trim();
    validateField('fullName');
    validateProfileForm(true);
  };

  fullNameInput.addEventListener('input', fullNameInputHandler);
  fullNameInput.addEventListener('blur', fullNameBlurHandler);

  fullNameInput.__profileHandlers = {
    ...(fullNameInput.__profileHandlers || {}),
    input: fullNameInputHandler,
    blur: fullNameBlurHandler
  };
}



  // --- username (debounced availability check) ---
  // --- username (attachProfileListeners) ---
// --- username (attachProfileListeners) ---
// --- username (attachProfileListeners) ---
if (usernameInput && !usernameInput.disabled) {
  // Defensive cleanup of any previous handlers
  try {
    const prev = usernameInput.__profileHandlers || {};
    if (prev.input) usernameInput.removeEventListener('input', prev.input);
    if (prev.blur) usernameInput.removeEventListener('blur', prev.blur);
    if (prev.focus) usernameInput.removeEventListener('focus', prev.focus);
  } catch (e) { /* ignore */ }

  // Ensure max length attribute (prevents most over-length typing)
  try { usernameInput.maxLength = 15; } catch (e) {}

  const errEl = usernameError;
  let pendingSeq = 0; // incremental sequence to ignore stale responses

  // Helper to cancel pending checks (by bumping sequence)
  function cancelPendingCheck() {
    pendingSeq++;
  }

  // Helper to show "Checking..." UI immediately
  function showCheckingUI() {
    if (!errEl) return;
    errEl.textContent = 'Checking availability...';
    errEl.classList.remove('error', 'available');
    errEl.classList.add('checking', 'active');
    usernameInput.classList.remove('invalid', 'valid');
    isUsernameAvailable = null;
  }

  // Debounced availability check — will ignore stale responses using sequence id
  const runAvailabilityCheck = debounce(async () => {
    const mySeq = ++pendingSeq; // this run's id
    const valueNow = (usernameInput.value || '').trim();

    // Safety: if empty or too short, don't call backend
    if (!valueNow || valueNow.length < 3) return;

    // If somehow length > 15 (paste scenario), treat as immediate error and don't call backend
    if (valueNow.length > 15) {
      cancelPendingCheck();
      if (errEl) {
        errEl.textContent = 'Username cannot exceed 15 characters';
        errEl.classList.remove('checking', 'available');
        errEl.classList.add('error', 'active');
      }
      usernameInput.classList.add('invalid');
      isUsernameAvailable = false;
      return;
    }

    // Call your existing helper to check availability
    let ok = false;
    try {
      ok = await checkUsernameAvailability(valueNow);
    } catch (e) {
      ok = false;
    }

    // If input changed (or another check started), ignore this result
    if (mySeq !== pendingSeq) return;

    if (ok) {
      isUsernameAvailable = true;
      if (errEl) {
        errEl.textContent = `${valueNow} is available`;
        errEl.classList.remove('error', 'checking');
        errEl.classList.add('available', 'active');
      }
      usernameInput.classList.remove('invalid');
      usernameInput.classList.add('valid');
    } else {
      isUsernameAvailable = false;
      if (errEl) {
        errEl.textContent = `${valueNow} is already taken`;
        errEl.classList.remove('checking', 'available');
        errEl.classList.add('error', 'active');
      }
      usernameInput.classList.remove('valid');
      usernameInput.classList.add('invalid');
    }

    validateProfileForm(false);
  }, 300); // tweak debounce delay as desired

  // Immediate input handler: runs on each keystroke (no debounce)
  const usernameImmediateHandler = (e) => {
    // strip leading spaces while preserving caret
    const before = usernameInput.value || '';
    if (/^\s+/.test(before)) {
      const caret = usernameInput.selectionStart || 0;
      const newVal = before.replace(/^\s+/, '');
      usernameInput.value = newVal;
      const shift = before.length - newVal.length;
      const newCaret = Math.max(0, caret - shift);
      usernameInput.setSelectionRange(newCaret, newCaret);
    }

    const raw = usernameInput.value || '';
    const val = raw.trim();

    // Reset status classes (we will re-add below as needed)
    if (errEl) errEl.classList.remove('error', 'checking', 'available');

    // empty -> clear UI and cancel checks
    if (!val) {
      cancelPendingCheck();
      if (errEl) { errEl.textContent = ''; errEl.classList.remove('active'); }
      usernameInput.classList.remove('invalid', 'valid');
      isUsernameAvailable = null;
      validateProfileForm(false);
      return;
    }

    // PRIORITY: length > 15 should win immediately (cancel backend)
    if (val.length > 15) {
      cancelPendingCheck();
      if (errEl) {
        errEl.textContent = 'Username cannot exceed 15 characters';
        errEl.classList.remove('checking', 'available');
        errEl.classList.add('error', 'active');
      }
      usernameInput.classList.add('invalid');
      isUsernameAvailable = false;
      validateProfileForm(false);
      return;
    }

    // Immediate syntactic rules (these also cancel backend checks)
    if (/^\d/.test(val)) {
      cancelPendingCheck();
      if (errEl) { errEl.textContent = 'Username cannot start with a number'; errEl.classList.add('active', 'error'); }
      usernameInput.classList.add('invalid');
      isUsernameAvailable = false;
      validateProfileForm(false);
      return;
    }
    if (/^_/.test(val)) {
      cancelPendingCheck();
      if (errEl) { errEl.textContent = 'Username cannot start with underscore'; errEl.classList.add('active', 'error'); }
      usernameInput.classList.add('invalid');
      isUsernameAvailable = false;
      validateProfileForm(false);
      return;
    }
    if (!/^[a-zA-Z0-9_]*$/.test(val)) {
      cancelPendingCheck();
      if (errEl) { errEl.textContent = 'Username can only contain letters, numbers, or underscores'; errEl.classList.add('active', 'error'); }
      usernameInput.classList.add('invalid');
      isUsernameAvailable = false;
      validateProfileForm(false);
      return;
    }

    // Min-length: only show on blur/submit. While typing, we don't show "too short" messages.
    if (val.length < 3 && !(fieldTouched.username || document.activeElement !== usernameInput)) {
      // hide min-length message while still focused & not touched
      if (errEl) { errEl.textContent = ''; errEl.classList.remove('active', 'error'); }
      usernameInput.classList.remove('invalid');
      isUsernameAvailable = null;
      cancelPendingCheck();
      validateProfileForm(false);
      return;
    }

    // Passed client-side syntactic checks and within length:
    // Show "Checking availability..." immediately and schedule backend check (debounced).
    showCheckingUI();
    runAvailabilityCheck();
  };

  // Attach handlers
  usernameInput.addEventListener('input', usernameImmediateHandler);

  // focus: show helper note (optional)
  usernameInput.addEventListener('focus', () => {
    const note = document.getElementById('usernameNote');
    if (note) {
      note.classList.add('active');
      setTimeout(() => note.classList.remove('active'), 2500);
    }
  });

  // blur: mark touched and run final validation + availability check (if value >= 3)
  usernameInput.addEventListener('blur', async () => {
    fieldTouched.username = true;
    validateField('username'); // will show min-length error if needed

    const val = (usernameInput.value || '').trim();
    const currentUsername = localStorage.getItem('username') || '';

    if (val && /^[a-zA-Z0-9_]{3,15}$/.test(val) && val !== currentUsername) {
      // run a final immediate availability check (no debounce)
      const mySeq = ++pendingSeq;
      let ok = false;
      try {
        ok = await checkUsernameAvailability(val);
      } catch (e) {
        ok = false;
      }
      if (mySeq !== pendingSeq) return; // stale
      if (ok) {
        isUsernameAvailable = true;
        if (errEl) { errEl.textContent = `${val} is available`; errEl.classList.remove('error','checking'); errEl.classList.add('available','active'); }
        usernameInput.classList.remove('invalid'); usernameInput.classList.add('valid');
      } else {
        isUsernameAvailable = false;
        if (errEl) { errEl.textContent = `${val} is already taken`; errEl.classList.remove('checking','available'); errEl.classList.add('error','active'); }
        usernameInput.classList.remove('valid'); usernameInput.classList.add('invalid');
      }
    }

    validateProfileForm(true);
  });

  usernameInput.__profileHandlers = {
    ...(usernameInput.__profileHandlers || {}),
    input: usernameImmediateHandler
  };
}




  // --- phone number: paste + input handlers (same logic you had inline) ---
  // --- phone number: paste + input handlers ---
// --- phone number: paste + input handlers ---
if (phoneNumberInput && !phoneNumberInput.disabled) {
  // paste handler: normalize, set value, mark touched (pastes are likely final), validate and optionally blur
  const phonePasteHandler = (ev) => {
    ev.preventDefault();
    const pasted = (ev.clipboardData || window.clipboardData).getData('text') || '';
    const digits = pasted.replace(/\D/g, '').slice(0, 14);
    if (!digits) return;

    const normalized = normalizePhoneProfile(digits).slice(0, 11);
    const formatted = formatNigeriaNumberProfile(normalized, false, true).value;
    phoneNumberInput.value = formatted;
    phoneNumberInput.setSelectionRange(formatted.length, formatted.length);

    fieldTouched.phoneNumber = true;
    validatePhoneNumberField(phoneNumberInput, phoneNumberError);
    validateProfileForm(false);

    if (normalized.length === 11 && isNigeriaMobileProfile(normalized)) {
      phoneNumberInput.blur();
    }
  };

  // input handler (debounced) — does NOT set touched; doesn't show length error while typing
  const phoneInputHandler = debounce((e) => {
    const rawNoSpaces = (phoneNumberInput.value || '').replace(/\s/g, '');
    const isDelete = e && (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward');

    // If completely empty, clear UI and return
    if (!rawNoSpaces) {
      phoneNumberInput.classList.remove('invalid');
      if (phoneNumberError) { phoneNumberError.textContent = ''; phoneNumberError.classList.remove('active'); }
      validateProfileForm(false);
      return;
    }

    // Immediate, specific single-digit start errors for 1/4/5/6
    if (/^[1456]$/.test(rawNoSpaces)) {
      phoneNumberInput.classList.add('invalid');
      if (phoneNumberError) {
        phoneNumberError.textContent = `Phone number cannot start with ${rawNoSpaces}`;
        phoneNumberError.classList.add('active');
      }
      validateProfileForm(false);
      return;
    }

    // Normalize and cap to 11 digits for display
    const normalized = normalizePhoneProfile(rawNoSpaces) || rawNoSpaces;
    const finalNormalized = normalized.slice(0, 11);
    const formatted = formatNigeriaNumberProfile(finalNormalized, /^[789]$/.test(rawNoSpaces), false).value;

    // Preserve caret reasonably: set to end (simpler & robust for most edits)
    phoneNumberInput.value = formatted;
    phoneNumberInput.setSelectionRange(formatted.length, formatted.length);

    // If there's a clear prefix mismatch at 3+ or 4 digits, show prefix error (but avoid length error here)
    if (finalNormalized.length >= 3 && !isValidPrefixPartial(finalNormalized)) {
      phoneNumberInput.classList.add('invalid');
      if (phoneNumberError) {
        phoneNumberError.textContent = 'Invalid Nigerian phone number prefix';
        phoneNumberError.classList.add('active');
      }
      validateProfileForm(false);
      return;
    }

    // Clear errors while user is typing (no forced length error)
    phoneNumberInput.classList.remove('invalid');
    if (phoneNumberError) { phoneNumberError.textContent = ''; phoneNumberError.classList.remove('active'); }

    // If user finished typing 11 digits, run final validation and mark touched
    if (finalNormalized.length === 11) {
      fieldTouched.phoneNumber = true;
      validatePhoneNumberField(phoneNumberInput, phoneNumberError);
      validateProfileForm(false);
      if (isNigeriaMobileProfile(finalNormalized)) {
        phoneNumberInput.blur();
      }
    } else {
      // Not final yet — don't mark touched; keep quiet about length
      validateProfileForm(false);
    }
  }, 60);

  // restrict non-digits (but allow leading + for paste handling)
  const phoneBeforeInput = (e) => {
    if (e.data && !/^\d$/.test(e.data)) {
      if (!(e.data === '+' && phoneNumberInput.selectionStart === 0)) {
        e.preventDefault();
      }
    }
    if (e.data === '+' && phoneNumberInput.value.length === 0) {
      e.preventDefault();
      phoneNumberInput.value = '0';
      phoneNumberInput.setSelectionRange(1, 1);
    }
  };

  const phoneKeydown = (e) => {
    const allowed = [
      'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'
    ];
    if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v'].includes(e.key.toLowerCase())) return;
    // numeric keys are allowed naturally; block other non-control keys
    if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) e.preventDefault();
  };

  // wire handlers
  phoneNumberInput.addEventListener('beforeinput', phoneBeforeInput);
  phoneNumberInput.addEventListener('keydown', phoneKeydown);
  phoneNumberInput.addEventListener('paste', phonePasteHandler);
  phoneNumberInput.addEventListener('input', phoneInputHandler);
  phoneNumberInput.addEventListener('blur', () => {
    fieldTouched.phoneNumber = true;
    validatePhoneNumberField(phoneNumberInput, phoneNumberError);
    validateProfileForm(true);
  });

  // for detachProfileListeners mapping
  phoneNumberInput.__profileHandlers = {
    beforeinput: phoneBeforeInput,
    keydown: phoneKeydown,
    paste: phonePasteHandler,
    input: phoneInputHandler,
    blur: null
  };

  phoneNumberInput.maxLength = 13; // allow for spaces in formatting
}

  // --- address (simple debounce validation) ---
  // --- address (live character check; length only on blur/submit) ---
// --- address (live char + no leading space; length only on blur/submit) ---
if (addressInput && !addressInput.disabled) {
  const liveHandler = () => {
    const v = addressInput.value || '';
    const allowedRe = /^[a-zA-Z0-9\s,.\-#]*$/;
    let error = '';

    if (v.startsWith(' ')) {
      error = 'Address cannot start with a space';
    } else if (!allowedRe.test(v)) {
      const invalid = v.split('').filter(ch => !/[a-zA-Z0-9\s,.\-#]/.test(ch));
      const uniq = [...new Set(invalid)];
      error = `Address contains invalid character${uniq.length > 1 ? 's' : ''}: ${uniq.join('')}`;
    }

    if (error) {
      if (addressError) {
        addressError.textContent = error;
        addressError.classList.add('active');
      }
      addressInput.classList.add('invalid');
    } else {
      if (addressError && !fieldTouched.address) {
        addressError.textContent = '';
        addressError.classList.remove('active');
      }
      addressInput.classList.remove('invalid');
    }

    validateProfileForm(false); // do not force length errors here
  };

  const blurHandler = () => {
    fieldTouched.address = true;
    addressInput.value = (addressInput.value || '').trim();
    validateField('address');
    validateProfileForm(true);
  };

  const debouncedHandler = debounce(liveHandler, 120);
  addressInput.addEventListener('input', debouncedHandler);
  addressInput.addEventListener('blur', blurHandler);

  addressInput.__profileHandlers = {
    ...(addressInput.__profileHandlers || {}),
    input: debouncedHandler,
    blur: blurHandler
  };
}



  // Note: There's a global profilePicture change handler already wired outside the modal.
  // See your global handler at the bottom of the file — if you move that into this attach function,
  // remove the global one to avoid duplication. (Global handler location: see file). :contentReference[oaicite:1]{index=1}
}




function openUpdateProfileModal(profile = {}) {
  if (!updateProfileModal || !updateProfileForm) {
    console.error('[ERROR] openUpdateProfileModal: Modal or form not found');
    return;
  }

  // show modal
  updateProfileModal.style.display = 'block';
  setTimeout(() => {
    updateProfileModal.classList.add('active');
    updateProfileModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }, 10);

  // --- Populate form fields (prefer provided profile, then localStorage as fallback) ---
  const fullName = profile?.fullName || localStorage.getItem('fullName') || (localStorage.getItem('userEmail') || '').split('@')[0] || '';
  const username = profile?.username || localStorage.getItem('username') || '';
  const phoneNumber = profile?.phoneNumber || localStorage.getItem('phoneNumber') || '';
  const email = profile?.email || localStorage.getItem('userEmail') || '';
  const address = profile?.address || localStorage.getItem('address') || '';

  if (fullNameInput) fullNameInput.value = fullName;
  if (usernameInput) usernameInput.value = username;
  if (phoneNumberInput) phoneNumberInput.value = phoneNumber ? formatNigeriaNumberProfile(phoneNumber).value : '';
  if (emailInput) emailInput.value = email;
  if (addressInput) addressInput.value = address;

  // --- Field enable/disable rules (server-driven) ---
  if (fullNameInput) fullNameInput.disabled = localStorage.getItem('fullNameEdited') === 'true';
  if (phoneNumberInput) phoneNumberInput.disabled = !!phoneNumber;
  if (emailInput) emailInput.disabled = true;
  if (addressInput) addressInput.disabled = !!(profile?.address || localStorage.getItem('address')?.trim());
  if (profilePictureInput) profilePictureInput.disabled = false; // always editable

  // --- Avatar / preview ---
  const profilePicture = localStorage.getItem('profilePicture') || '';
  const isValidProfilePicture = !!profilePicture && /^(data:image\/|https?:\/\/|\/|blob:)/i.test(profilePicture);
  const displayName = username || (fullName.split(' ')[0] || 'User');

  if (profilePicturePreview) {
    if (isValidProfilePicture) {
      profilePicturePreview.innerHTML = `<img src="${profilePicture}" alt="Profile Picture" class="avatar-img" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
      profilePicturePreview.innerHTML = '';
      profilePicturePreview.textContent = displayName.charAt(0).toUpperCase();
    }
  }

  // --- Reset error UI, invalid classes and touched flags ---
  [fullNameError, usernameError, phoneNumberError, addressError, profilePictureError].forEach(errEl => {
    if (errEl) {
      errEl.textContent = '';
      errEl.classList.remove('active', 'error', 'checking', 'available');
    }
  });

  [fullNameInput, usernameInput, phoneNumberInput, addressInput].forEach(inp => {
    if (inp) inp.classList.remove('invalid');
  });

  Object.keys(fieldTouched).forEach(k => fieldTouched[k] = false);

  // --- Ensure no duplicate listeners: detach previous, then attach fresh handlers ---
  detachProfileListeners();
  attachProfileListeners(); // attachProfileListeners should add input/blur/paste handlers for fullName/username/phone/address/profilePicture

  // NOTE: Do NOT add inline input listeners for validation here.
  // The attachProfileListeners() function is the single source of truth and
  // is responsible for adding the input + blur handlers that follow the
  // "live rules vs blur-on-length" pattern (so length errors only show on blur/submit).

  // Re-run initial validation to set the save button state correctly
  validateProfileForm(false);

  console.log('[DEBUG] openUpdateProfileModal: Modal opened', { fullName, username, phoneNumber, email });
}


function closeUpdateProfileModal() {
    if (!updateProfileModal) return;
    detachProfileListeners();
    updateProfileModal.classList.remove('active');
    updateProfileModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    setTimeout(() => {
        updateProfileModal.style.display = 'none';
    }, 400);
    console.log('[DEBUG] closeUpdateProfileModal: Modal closed');

    // Ensure settings-tab is active
    const tabs = document.querySelectorAll('.nav-link');
    const settingsTab = document.getElementById('settings-tab');
    tabs.forEach(t => t.classList.remove('active'));
    if (settingsTab) settingsTab.classList.add('active');

    // Reopen settings modal if source was settings
    if (lastModalSource === 'settings') {
        const settingsModal = document.getElementById('settingsModal') || document.getElementById('settings');
        if (settingsModal) {
            settingsModal.style.display = 'flex';
            document.documentElement.style.overflow = 'hidden';
            const settingsBtn = document.getElementById('settingsBtn');
            if (settingsBtn) settingsBtn.classList.add('active');
        }
    } else {
        // Activate dashboard tab
        const homeTab = document.getElementById('home-tab');
        if (homeTab) homeTab.classList.add('active');
    }

    lastModalSource = null;
}

// Initialize modal event listeners
if (updateProfileModal) {
  const closeModalBtn = updateProfileModal.querySelector('.close-btn');
  const backBtn = updateProfileModal.querySelector('.back-btn');
  closeModalBtn?.addEventListener('click', closeUpdateProfileModal);
  backBtn?.addEventListener('click', closeUpdateProfileModal);
}

// Handle popstate to close modal
window.addEventListener('popstate', (event) => {
  if (!event.state || event.state.modal !== 'updateProfile') {
    closeUpdateProfileModal();
  }
});

if (profilePictureInput && profilePicturePreview) {
  profilePictureInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (profilePictureError) {
      profilePictureError.textContent = '';
      profilePictureError.classList.remove('active');
    }
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        if (profilePictureError) {
          profilePictureError.textContent = 'File size must be less than 2MB';
          profilePictureError.classList.add('active');
        }
        profilePicturePreview.innerHTML = '';
        profilePicturePreview.textContent = (usernameInput?.value || fullNameInput?.value.split(' ')[0] || 'User').charAt(0).toUpperCase();
        return;
      }
      if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
        if (profilePictureError) {
          profilePictureError.textContent = 'Only JPG, PNG, or GIF files are allowed';
          profilePictureError.classList.add('active');
        }
        profilePicturePreview.innerHTML = '';
        profilePicturePreview.textContent = (usernameInput?.value || fullNameInput?.value.split(' ')[0] || 'User').charAt(0).toUpperCase();
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        profilePicturePreview.innerHTML = `<img src="${reader.result}" alt="Profile Picture" class="avatar-img" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
      };
      reader.readAsDataURL(file);
    } else {
      const displayName = usernameInput?.value || fullNameInput?.value.split(' ')[0] || 'User';
      profilePicturePreview.innerHTML = '';
      profilePicturePreview.textContent = displayName.charAt(0).toUpperCase();
    }
    fieldTouched.profilePicture = true;
    validateField('profilePicture');
    validateProfileForm(true);
  });
}

// --- Profile Update Form Submission ---



    // --- SVG INJECTION FOR ICONS ---
    document.querySelectorAll('.svg-inject').forEach(el =>
    fetch(el.src)
      .then(r => r.text())
      .then(svg => {
        el.outerHTML = svg;
      })
    );

// ---------- Settings modal behavior ----------
(function () {
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const settingsBack = document.getElementById('settingsBack');
  const closeSettings = document.getElementById('closeSettings');
  const openUpdateProfile = document.getElementById('openUpdateProfile');
  const logoutBtnModal = document.getElementById('logoutBtnModal');
  const helpSupportBtn = document.getElementById('helpSupportBtn');
  const securityBtn = document.getElementById('securityBtn');
  const referralsBtn = document.getElementById('referralsBtn');
  const themeToggle = document.getElementById('themeToggle');
  const settingsAvatar = document.getElementById('settingsAvatar');
  const settingsUsername = document.getElementById('settingsUsername');
  const settingsEmail = document.getElementById('settingsEmail');

  if (!settingsModal) return;

  // open/close helpers
  function showModal() {
    settingsModal.style.display = 'flex';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden'; // Ensure body is also locked
    if (settingsBtn) settingsBtn.classList.add('active');
    console.log('[SettingsModal] showModal: Modal opened, scroll locked');
  }

  function hideModal() {
    settingsModal.style.display = 'none';
    document.documentElement.style.overflow = ''; // Restore scroll
    document.body.style.overflow = ''; // Ensure body scroll is restored
    if (settingsBtn) settingsBtn.classList.remove('active');
    console.log('[SettingsModal] hideModal: Modal closed, scroll restored');
  }

  // button → open
  if (settingsBtn) settingsBtn.addEventListener('click', showModal);

  // close buttons
  if (settingsBack) settingsBack.addEventListener('click', hideModal);
  if (closeSettings) closeSettings.addEventListener('click', hideModal);

  // prevent closing when clicking inside modal content
  const settingsModalContent = settingsModal.querySelector('.settings-content');
  if (settingsModalContent) {
    settingsModalContent.addEventListener('click', (e) => e.stopPropagation());
  }

  // close on outside click
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) hideModal();
  });

  // Ensure scroll is restored if modal is hidden by external means (e.g., modalManager.js)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (
        mutation.attributeName === 'style' &&
        settingsModal.style.display === 'none'
      ) {
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        console.log(
          '[SettingsModal] MutationObserver: Modal hidden externally, scroll restored'
        );
      }
    });
  });
  observer.observe(settingsModal, { attributes: true, attributeFilter: ['style'] });

  // Handle browser back button or modalManager.js closing
  window.addEventListener('popstate', () => {
    if (settingsModal.style.display === 'flex') {
      hideModal();
      console.log('[SettingsModal] popstate: Modal closed due to back navigation');
    }
  });

  // helper to update avatar without flicker
function updateAvatar(el, newUrl, fallbackLetter) {
  if (!isValidImageSource(newUrl)) {
    el.innerHTML = fallbackLetter;
    el.classList.add('fade-in');
    return;
  }

  // If same image already exists → don’t reload
  const currentImg = el.querySelector('img');
  if (currentImg && currentImg.src === newUrl) {
    return; // ✅ stays stable
  }

  // Preload new image before swapping
  const img = new Image();
  img.src = newUrl.startsWith('/')
    ? `${location.protocol}//${location.host}${newUrl}`
    : newUrl;
  img.alt = "Profile";
  img.className = "avatar-img";
  img.style.cssText =
    "width:100%;height:100%;border-radius:50%;object-fit:cover;opacity:0;transition:opacity .3s ease;";

  img.onload = () => {
    el.innerHTML = "";
    el.appendChild(img);
    requestAnimationFrame(() => {
      img.style.opacity = "1"; // fade-in after insert
    });
  };

  img.onerror = () => {
    el.innerHTML = fallbackLetter;
    el.classList.add("fade-in");
  };
}

// populate user info
async function loadProfileToSettings() {
  const settingsAvatar = document.getElementById('settingsAvatar');
  const settingsUsername = document.getElementById('settingsUsername');
  const settingsEmail = document.getElementById('settingsEmail');

  if (!settingsAvatar || !settingsUsername || !settingsEmail) {
    console.error('[ERROR] loadProfileToSettings: Missing DOM elements');
    return;
  }

  // Load from localStorage first (instant display)
  const localProfile = {
    profilePicture: localStorage.getItem('profilePicture') || '',
    username: localStorage.getItem('username') || '',
    fullName: localStorage.getItem('fullName') || '',
    firstName: localStorage.getItem('firstName') || '',
    email: localStorage.getItem('userEmail') || '',
  };

  const hasLocalData =
    localProfile.username || localProfile.firstName || localProfile.email;

  if (hasLocalData) {
    // Instant display from local
    const avatarUrl =
      localProfile.profilePicture || '/frontend/img/avatar-placeholder.png';
    const fallbackLetter = (
      localProfile.username?.charAt(0) ||
      localProfile.firstName?.charAt(0) ||
      'U'
    ).toUpperCase();

    updateAvatar(settingsAvatar, avatarUrl, fallbackLetter);

    const displayName =
      localProfile.username ||
      localProfile.firstName ||
      (localProfile.email ? localProfile.email.split('@')[0] : 'User');

    settingsUsername.textContent = displayName;
    settingsUsername.classList.add('fade-in');

    settingsEmail.textContent = localProfile.email || 'Not set';
    settingsEmail.classList.add('fade-in');

    console.log('[DEBUG] loadProfileToSettings: Loaded from local instantly', {
      avatarUrl,
      displayName,
      email: localProfile.email,
    });
  } else {
    // No local data → shimmer blur
    settingsUsername.innerHTML = '<div class="loading-blur"></div>';
    settingsEmail.innerHTML = '<div class="loading-blur"></div>';
    settingsAvatar.innerHTML =
      '<div class="loading-blur settings-avatar"></div>';
  }

  try {
    // Fetch fresh data
    const resp = await fetch(
      `https://api.flexgig.com.ng/api/profile?_${Date.now()}`,
      {
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`,
        },
      }
    );

    let rawText = await resp.text();
    let serverProfile = {};

    try {
      serverProfile = rawText ? JSON.parse(rawText) : {};
    } catch (e) {
      console.warn(
        '[WARN] loadProfileToSettings: Response is not valid JSON',
        rawText
      );
    }

    // Merge with local fallback
    const mergedProfile = {
      profilePicture:
        serverProfile.profilePicture ||
        serverProfile.profile_picture ||
        serverProfile.avatar_url ||
        localProfile.profilePicture ||
        '',
      username: serverProfile.username || localProfile.username || '',
      fullName: serverProfile.fullName || localProfile.fullName || '',
      firstName:
        serverProfile.fullName?.split(' ')[0] || localProfile.firstName || '',
      email: serverProfile.email || localProfile.email || '',
    };

    // Save back to localStorage
    if (
      mergedProfile.profilePicture &&
      mergedProfile.profilePicture !== localProfile.profilePicture
    ) {
      localStorage.setItem('profilePicture', mergedProfile.profilePicture);
    }
    if (
      mergedProfile.username &&
      mergedProfile.username !== localProfile.username
    ) {
      localStorage.setItem('username', mergedProfile.username);
    }
    if (
      mergedProfile.fullName &&
      mergedProfile.fullName !== localProfile.fullName
    ) {
      localStorage.setItem('fullName', mergedProfile.fullName);
      localStorage.setItem(
        'firstName',
        mergedProfile.fullName.split(' ')[0] || ''
      );
    }
    if (mergedProfile.email && mergedProfile.email !== localProfile.email) {
      localStorage.setItem('userEmail', mergedProfile.email);
    }

    // Clear shimmer
    settingsUsername.innerHTML = '';
    settingsEmail.innerHTML = '';
    settingsAvatar.innerHTML = '';

    // Avatar update (stable + fade-in)
    const newAvatarUrl =
      mergedProfile.profilePicture || '/frontend/img/avatar-placeholder.png';
    const fallbackLetter = (
      mergedProfile.username?.charAt(0) ||
      mergedProfile.firstName?.charAt(0) ||
      'U'
    ).toUpperCase();

    updateAvatar(settingsAvatar, newAvatarUrl, fallbackLetter);

    // Username + email
    const newDisplayName =
      mergedProfile.username ||
      mergedProfile.firstName ||
      (mergedProfile.email ? mergedProfile.email.split('@')[0] : 'User');

    settingsUsername.textContent = newDisplayName;
    settingsUsername.classList.add('fade-in');

    const newEmail = mergedProfile.email || 'Not set';
    settingsEmail.textContent = newEmail;
    settingsEmail.classList.add('fade-in');

    console.log('[DEBUG] loadProfileToSettings: Updated from server', {
      avatarUrl: newAvatarUrl,
      displayName: newDisplayName,
      email: newEmail,
    });
  } catch (err) {
    console.error('[ERROR] Failed to load profile to settings', err);

    // Fallback: clear shimmer, show local/fallback
    settingsUsername.innerHTML = '';
    settingsEmail.innerHTML = '';
    settingsAvatar.innerHTML = '';

    settingsUsername.textContent =
      localProfile.username || localProfile.firstName || 'User';
    settingsUsername.classList.add('fade-in');

    settingsEmail.textContent = localProfile.email || 'Not set';
    settingsEmail.classList.add('fade-in');

    settingsAvatar.textContent = (
      localProfile.username?.charAt(0) ||
      localProfile.firstName?.charAt(0) ||
      'U'
    ).toUpperCase();
    settingsAvatar.classList.add('fade-in');
  }
}

loadProfileToSettings();


  // Edit profile action
  if (openUpdateProfile) {
    openUpdateProfile.addEventListener('click', () => {
      lastModalSource = 'settings';
      openUpdateProfileModal();
      hideModal(); // Ensure scroll is restored when opening another modal
    });
  }

  // Get the profile open button and update profile modal
  const profileOpenBtn = document.getElementById('profileopenbtn');
  if (profileOpenBtn) {
    const updateProfileModal = new bootstrap.Modal(
      document.getElementById('updateprofile')
    );
    profileOpenBtn.addEventListener('click', function () {
      updateProfileModal.show();
      hideModal(); // Ensure scroll is restored
    });
  }

  // Referrals
  if (referralsBtn)
    referralsBtn.addEventListener('click', () => {
      window.location.href = '/referrals.html';
    });

  // Logout (modal)
if (logoutBtnModal) {
  logoutBtnModal.addEventListener('click', async (e) => {
    e.preventDefault();
    showLoader();
    try {
      // Tell backend to clear refresh cookie
      await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.warn('Logout API error (continuing client-side)', err);
    }

    try {
      // Clear local + session storage
      localStorage.clear();
      sessionStorage.clear();

      // Clear IndexedDB (all databases)
      if (window.indexedDB) {
        const dbs = await indexedDB.databases();
        dbs.forEach(db => {
          if (db.name) {
            indexedDB.deleteDatabase(db.name);
          }
        });
      }

      // Clear client cookies (non-HttpOnly)
      document.cookie.split(';').forEach(c => {
        document.cookie = c
          .replace(/^ +/, '')
          .replace(/=.*/, `=;expires=${new Date(0).toUTCString()};path=/`);
      });
    } catch (err) {
      console.error('Error during logout cleanup:', err);
    }

    // Hide modal if function exists
    try { hideModal(); } catch (_) {}
    hideLoader();

    // Redirect to login
    window.location.href = '/';
  });
}


  // Theme toggle
  function setDarkMode(enabled) {
    if (enabled) document.documentElement.classList.add('dark-mode');
    else document.documentElement.classList.remove('dark-mode');
    if (themeToggle) themeToggle.setAttribute('aria-pressed', !!enabled);
    localStorage.setItem('dark_mode', enabled ? '1' : '0');
  }

  const stored = localStorage.getItem('dark_mode');
  setDarkMode(stored === '1');

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isDark = document.documentElement.classList.contains('dark-mode');
      setDarkMode(!isDark);
    });
  }

  // when the modal opens, refresh profile
  const obs = new MutationObserver(() => {
    if (settingsModal.style.display === 'flex') loadProfileToSettings();
  });
  obs.observe(settingsModal, { attributes: true, attributeFilter: ['style'] });
})();

// ---------- Help & Support (inside settings modal) ----------
const helpSupportBtn = document.getElementById('helpSupportBtn');
const helpSupportModal = document.getElementById('helpSupportModal');
const helpCloseBtn = helpSupportModal?.querySelector('.help-modal-close');
const settingsModal = document.getElementById('settingsModal');

if (helpSupportBtn && helpSupportModal) {
  helpSupportBtn.addEventListener('click', () => {
    console.log('Help & Support clicked');

    // show help modal with animation
    helpSupportModal.classList.add('active');
    document.body.classList.add('modal-open');
  });
}

// close help modal
if (helpCloseBtn) {
  helpCloseBtn.addEventListener('click', () => {
    console.log('Help & Support closed');
    helpSupportModal.classList.remove('active');
    document.body.classList.remove('modal-open');

    // re-show settings modal
    if (settingsModal) {
      settingsModal.style.display = 'flex';
    }
  });
}

// optional: click background to close
helpSupportModal?.addEventListener('click', (e) => {
  if (e.target === helpSupportModal) {
    helpCloseBtn?.click();
  }
});

// disable right-click on contact boxes
document.querySelectorAll('.contact-box').forEach((box) => {
  box.addEventListener('contextmenu', (e) => e.preventDefault());
});



/* ---------- Security modal behavior + WebAuthn integration ---------- */
/* ---------- Security modal behavior + WebAuthn integration ---------- */
/* ---------- Security modal behavior + WebAuthn integration ---------- */
/* ---------- Security modal behavior + WebAuthn integration ---------- */
(function (supabase) {
  /* Unique-scoped security modal module (prefix __sec_) */
  const __sec_DEBUG = true;
  const __sec_log = {
    d: (...a) => { if (__sec_DEBUG) console.debug('[__sec][debug]', ...a); },
    i: (...a) => { if (__sec_DEBUG) console.info('[__sec][info]', ...a); },
    w: (...a) => { if (__sec_DEBUG) console.warn('[__sec][warn]', ...a); },
    e: (...a) => { if (__sec_DEBUG) console.error('[__sec][error]', ...a); },
  };

  __sec_log.d('Security module initializing with supabase:', !!supabase);

  const __sec_q = (sel) => {
    __sec_log.d('Querying selector:', sel);
    try { 
      const result = document.querySelector(sel);
      __sec_log.d('Query result for', sel, !!result);
      return result;
    }
    catch (err) { 
      __sec_log.e('bad selector', sel, err); 
      return null; 
    }
  };

  /* Elements — use your IDs */
  __sec_log.d('Querying all security elements');
  const __sec_modal = __sec_q('#securityModal');
  const __sec_closeBtn = __sec_q('#securityCloseBtn');
  const __sec_parentSwitch = __sec_q('#biometricsSwitch');
  const __sec_bioOptions = __sec_q('#biometricsOptions');
  const __sec_bioLogin = __sec_q('#bioLoginSwitch');
  const __sec_bioTx = __sec_q('#bioTxSwitch');
  const __sec_pinBtn = __sec_q('#pinToggleBtn');
  const __sec_pwdBtn = __sec_q('#changePwdBtn');
  const __sec_balanceSwitch = __sec_q('#balanceSwitch');
  const __sec_launcherBtn = __sec_q('#securityBtn');

  __sec_log.d('Modal elements queried:', {
    modal: !!__sec_modal,
    closeBtn: !!__sec_closeBtn,
    launcherBtn: !!__sec_launcherBtn,
    parentSwitch: !!__sec_parentSwitch
  });

  /* Storage keys */
  const __sec_KEYS = {
    biom: 'security_biom_enabled',
    bioLogin: 'security_bio_login',
    bioTx: 'security_bio_tx',
    balance: 'security_balance_visible'
  };
  __sec_log.d('Storage keys defined:', __sec_KEYS);

  /* Helpers */
  const __sec_setChecked = (el, v) => { 
    __sec_log.d('setChecked called for el:', el?.id || 'unknown', 'value:', v);
    if (!el) return; 
    el.setAttribute('aria-checked', v ? 'true' : 'false');
    __sec_log.d('setChecked applied:', el.getAttribute('aria-checked'));
  };
  const __sec_isChecked = (el) => { 
    const checked = !!el && el.getAttribute('aria-checked') === 'true';
    __sec_log.d('isChecked for el:', el?.id || 'unknown', 'result:', checked);
    return checked;
  };
  function __sec_toggleSwitch(el, forced) {
    __sec_log.d('toggleSwitch entry:', { el: el?.id || 'unknown', forced });
    if (!el) { 
      __sec_log.w('toggleSwitch: no element'); 
      return false; 
    }
    const cur = __sec_isChecked(el);
    const next = (typeof forced === 'boolean') ? forced : !cur;
    __sec_setChecked(el, next);
    __sec_log.d('toggleSwitch exit:', { cur, next });
    return next;
  }

  /* UI lock helpers for async ops */
  function __sec_setBusy(el, busy = true) {
    __sec_log.d('setBusy called:', { el: el?.id || 'unknown', busy });
    if (!el) return;
    try { 
      el.disabled = !!busy; 
      __sec_log.d('setBusy disabled:', el.disabled);
    } catch (e) { 
      __sec_log.e('setBusy disable error:', e);
    }
    if (busy) { 
      el.setAttribute('aria-busy', 'true'); 
      __sec_log.d('setBusy aria-busy true');
    } else { 
      el.removeAttribute('aria-busy'); 
      __sec_log.d('setBusy aria-busy removed');
    }
  }

  /* Async: get current user (use stored authToken and sync with custom API) */
  async function __sec_getCurrentUser() {
    __sec_log.d('__sec_getCurrentUser: Starting');

    if (typeof window.getSession === 'function') {
      __sec_log.d('__sec_getCurrentUser: Attempting window.getSession');
      const session = await window.getSession();
      __sec_log.d('__sec_getCurrentUser: window.getSession result (raw)', session);
      if (session && session.user) {
        __sec_log.i('Retrieved session from getSession', session.user);
        return { user: session.user };
      } else {
        __sec_log.w('No valid session from getSession', session);
      }
    }

    __sec_log.d('__sec_getCurrentUser: Fetching /api/session with cookies');
    const res = await fetch('https://api.flexgig.com.ng/api/session', {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    const raw = await res.text();
    __sec_log.d('__sec_getCurrentUser: /api/session raw body', raw);

    let parsed = null;
    try { 
      parsed = JSON.parse(raw); 
      __sec_log.d('__sec_getCurrentUser: JSON parse success');
    } catch (e) { 
      __sec_log.e('parse error', e); 
    }
    __sec_log.d('__sec_getCurrentUser: parsed', parsed);

    if (res.ok && parsed && parsed.user) {
      __sec_log.i('Retrieved session from /api/session', parsed.user);
      return { user: parsed.user };
    }

    if (res.status === 401) {
      __sec_log.i('Session expired, attempting refresh');
      const refreshRes = await fetch('https://api.flexgig.com.ng/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      const rawRefresh = await refreshRes.text();
      __sec_log.d('__sec_getCurrentUser: /auth/refresh raw body', rawRefresh);

      if (refreshRes.ok) {
        __sec_log.d('__sec_getCurrentUser: Refresh successful, retrying session');
        const retryRes = await fetch('https://api.flexgig.com.ng/api/session', {
          method: 'GET',
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        });
        const retryRaw = await retryRes.text();
        __sec_log.d('__sec_getCurrentUser: Retry raw body', retryRaw);
        let retryParsed = null;
        try { 
          retryParsed = JSON.parse(retryRaw); 
          __sec_log.d('__sec_getCurrentUser: Retry JSON parse success');
        } catch (e) { 
          __sec_log.e('Retry parse error', e); 
        }
        if (retryRes.ok && retryParsed && retryParsed.user) {
          __sec_log.i('Retrieved session after refresh', retryParsed.user);
          return { user: retryParsed.user };
        }
      } else {
        __sec_log.e('Refresh failed raw', rawRefresh);
      }
    }

    __sec_log.e('No valid session available');
    return null;
  }

  /* Animation helpers */
  let __sec_hideTimer = null;
  function __sec_clearHideTimer() { 
    __sec_log.d('clearHideTimer called, timer exists:', !!__sec_hideTimer);
    if (__sec_hideTimer) { 
      clearTimeout(__sec_hideTimer); 
      __sec_hideTimer = null; 
      __sec_log.d('clearHideTimer: cleared');
    }
  }

  function __sec_revealChildrenAnimated() {
    __sec_log.d('revealChildrenAnimated entry');
    if (!__sec_bioOptions) { 
      __sec_log.w('revealChildrenAnimated: bioOptions missing'); 
      return; 
    }
    __sec_clearHideTimer();
    __sec_log.d('revealChildrenAnimated: removing no-animate, setting hidden false');
    __sec_bioOptions.classList.remove('no-animate');
    __sec_bioOptions.hidden = false;
    requestAnimationFrame(() => {
      __sec_log.d('revealChildrenAnimated: adding show class');
      __sec_bioOptions.classList.add('show');
    });
    const rows = Array.from(__sec_bioOptions.querySelectorAll('.setting-row'));
    __sec_log.d('revealChildrenAnimated: rows found', rows.length);
    rows.forEach((row, i) => {
      row.classList.remove('visible');
      row.style.transitionDelay = `${i * 80}ms`;
    });
    requestAnimationFrame(() => {
      rows.forEach(row => row.classList.add('visible'));
      __sec_log.d('revealChildrenAnimated: visible class added to rows');
    });
  }

  function __sec_hideChildrenAnimated() {
    __sec_log.d('hideChildrenAnimated entry');
    if (!__sec_bioOptions) { 
      __sec_log.w('hideChildrenAnimated: bioOptions missing'); 
      return; 
    }
    __sec_clearHideTimer();
    const rows = Array.from(__sec_bioOptions.querySelectorAll('.setting-row'));
    __sec_log.d('hideChildrenAnimated: rows found', rows.length);
    rows.slice().reverse().forEach((row, idx) => {
      row.style.transitionDelay = `${idx * 60}ms`;
      row.classList.remove('visible');
    });
    const longest = rows.length * 60 + 220;
    __sec_log.d('hideChildrenAnimated: setting timeout', longest);
    __sec_hideTimer = setTimeout(() => {
      __sec_log.d('hideChildrenAnimated: timeout fired, removing show');
      __sec_bioOptions.classList.remove('show');
      rows.forEach(r => { r.style.transitionDelay = ''; });
      __sec_bioOptions.hidden = true;
      __sec_hideTimer = null;
    }, longest);
  }

  function __sec_revealChildrenNoAnimate() {
    __sec_log.d('revealChildrenNoAnimate entry');
    if (!__sec_bioOptions) { 
      __sec_log.w('revealChildrenNoAnimate: bioOptions missing'); 
      return; 
    }
    __sec_clearHideTimer();
    __sec_log.d('revealChildrenNoAnimate: removing show, adding no-animate');
    __sec_bioOptions.classList.remove('show');
    __sec_bioOptions.classList.add('no-animate');
    __sec_bioOptions.hidden = false;
    const rows = Array.from(__sec_bioOptions.querySelectorAll('.setting-row'));
    __sec_log.d('revealChildrenNoAnimate: rows found', rows.length);
    rows.forEach(row => { 
      row.classList.add('visible'); 
      row.style.transitionDelay = ''; 
    });
    requestAnimationFrame(() => {
      __sec_log.d('revealChildrenNoAnimate: adding show');
      __sec_bioOptions.classList.add('show');
    });
    setTimeout(() => {
      __sec_log.d('revealChildrenNoAnimate: removing no-animate');
      __sec_bioOptions.classList.remove('no-animate');
    }, 60);
  }

  /* Set biometric UI state */
  /* Set biometric UI state (fixed defaulting & no `|| true` bug) */
/* Set biometric UI state */
/* Set biometric UI state */
function __sec_setBiometrics(parentOn, animate = true) {
  __sec_log.d('setBiometrics entry:', { parentOn, animate });
  if (!__sec_parentSwitch) { 
    __sec_log.w('setBiometrics: parent switch element missing'); 
    return; 
  }
  __sec_setChecked(__sec_parentSwitch, parentOn);
  try { 
    localStorage.setItem(__sec_KEYS.biom, parentOn ? '1' : '0'); 
    __sec_log.d('setBiometrics: stored biom', parentOn ? '1' : '0');
  } catch (e) { 
    __sec_log.e('setBiometrics: storage error', e);
  }

  if (parentOn) {
    __sec_log.d('setBiometrics: parentOn true, revealing children');
    if (animate) {
      __sec_revealChildrenAnimated();
    } else {
      __sec_revealChildrenNoAnimate();
    }

    // Always force both children on when parent is activated
    if (__sec_bioLogin) {
      __sec_setChecked(__sec_bioLogin, true);
      try { 
        localStorage.setItem(__sec_KEYS.bioLogin, '1'); 
        __sec_log.d('setBiometrics: stored bioLogin 1');
      } catch (e) { 
        __sec_log.e('setBiometrics: bioLogin storage error', e);
      }
    }
    if (__sec_bioTx) {
      __sec_setChecked(__sec_bioTx, true);
      try { 
        localStorage.setItem(__sec_KEYS.bioTx, '1'); 
        __sec_log.d('setBiometrics: stored bioTx 1');
      } catch (e) { 
        __sec_log.e('setBiometrics: bioTx storage error', e);
      }
    }
    __sec_log.i('biom ON', { animate });
  } else {
    __sec_log.d('setBiometrics: parentOn false, hiding children');
    try {
      localStorage.setItem(__sec_KEYS.bioLogin, '0');
      localStorage.setItem(__sec_KEYS.bioTx, '0');
      __sec_log.d('setBiometrics: stored bioLogin/bioTx 0');
    } catch (e) { 
      __sec_log.e('setBiometrics: children storage error', e);
    }
    if (__sec_bioLogin) { 
      __sec_setChecked(__sec_bioLogin, false); 
    }
    if (__sec_bioTx) { 
      __sec_setChecked(__sec_bioTx, false); 
    }
    if (animate) { 
      __sec_hideChildrenAnimated(); 
    }
    else {
      if (__sec_bioOptions) {
        __sec_log.d('setBiometrics: no animate hide');
        __sec_bioOptions.classList.remove('show');
        __sec_bioOptions.hidden = true;
        const rows = Array.from(__sec_bioOptions.querySelectorAll('.setting-row'));
        rows.forEach(r => { 
          r.classList.remove('visible'); 
          r.style.transitionDelay = ''; 
        });
      }
    }
    __sec_log.i('biom OFF', { animate });
  }
  __sec_log.d('setBiometrics exit');
}

/* If both child switches are off, turn the parent off */
function __sec_maybeDisableParentIfChildrenOff() {
  __sec_log.d('maybeDisableParentIfChildrenOff entry');
  try {
    if (!__sec_parentSwitch) { 
      __sec_log.w('maybeDisableParentIfChildrenOff: parent missing'); 
      return; 
    }
    if (!__sec_bioLogin || !__sec_bioTx) { 
      __sec_log.w('maybeDisableParentIfChildrenOff: children missing'); 
      return; 
    }
    const loginOn = __sec_isChecked(__sec_bioLogin);
    const txOn = __sec_isChecked(__sec_bioTx);
    __sec_log.d('maybeDisableParentIfChildrenOff: children state', { loginOn, txOn });
    if (!loginOn && !txOn && __sec_isChecked(__sec_parentSwitch)) {
      __sec_log.i('Both biometric children off — turning parent OFF');
      __sec_setBiometrics(false, true);
    } else {
      __sec_log.d('maybeDisableParentIfChildrenOff: no action needed');
    }
  } catch (err) {
    __sec_log.e('maybeDisableParentIfChildrenOff error', err);
  }
  __sec_log.d('maybeDisableParentIfChildrenOff exit');
}


/* Initialize from storage */
function __sec_initFromStorage() {
  __sec_log.d('initFromStorage entry');
  try {
    const rawBiom = localStorage.getItem(__sec_KEYS.biom); // '1' | '0' | null
    const rawLogin = localStorage.getItem(__sec_KEYS.bioLogin);
    const rawTx = localStorage.getItem(__sec_KEYS.bioTx);
    const rawBalance = localStorage.getItem(__sec_KEYS.balance); // '1' | '0' | null

    const biomStored = rawBiom === '1';
    const loginStored = rawLogin === '1';
    const txStored = rawTx === '1';
    const balanceStored = rawBalance === null ? true : (rawBalance === '1');

    __sec_log.d('initFromStorage raw values:', { rawBiom, rawLogin, rawTx, rawBalance });
    __sec_log.d('initFromStorage parsed:', { biomStored, loginStored, txStored, balanceStored });

    if (__sec_parentSwitch) { 
      __sec_setChecked(__sec_parentSwitch, biomStored); 
    }

    if (__sec_bioOptions) {
      if (biomStored) {
        __sec_log.d('initFromStorage: biomStored true, revealing');
        __sec_revealChildrenNoAnimate();
        if (__sec_bioLogin) { 
          __sec_setChecked(__sec_bioLogin, loginStored); 
        }
        if (__sec_bioTx) { 
          __sec_setChecked(__sec_bioTx, txStored); 
        }
        __sec_maybeDisableParentIfChildrenOff();  // Add: handle inconsistent states
      } else {
        __sec_log.d('initFromStorage: biomStored false, hiding');
        __sec_bioOptions.hidden = true;
        __sec_bioOptions.classList.remove('show');
        if (__sec_bioLogin) { 
          __sec_setChecked(__sec_bioLogin, false); 
        }
        if (__sec_bioTx) { 
          __sec_setChecked(__sec_bioTx, false); 
        }
      }
    }

    if (__sec_balanceSwitch) { 
      __sec_setChecked(__sec_balanceSwitch, balanceStored); 
    }

    __sec_log.d('initFromStorage complete', { rawBiom, rawLogin, rawTx, rawBalance, biomStored, loginStored, txStored, balanceStored });
  } catch (err) {
    __sec_log.e('initFromStorage error', err);
  }
  __sec_log.d('initFromStorage exit');
}

__sec_log.d('Adding beforeunload listener');
window.addEventListener('beforeunload', () => {
  __sec_log.d('beforeunload triggered');
  try {
    if (__sec_parentSwitch) { 
      const val = __sec_isChecked(__sec_parentSwitch) ? '1' : '0';
      localStorage.setItem(__sec_KEYS.biom, val);
      __sec_log.d('beforeunload: stored biom', val);
    }
    if (__sec_bioLogin) { 
      const val = __sec_isChecked(__sec_bioLogin) ? '1' : '0';
      localStorage.setItem(__sec_KEYS.bioLogin, val);
      __sec_log.d('beforeunload: stored bioLogin', val);
    }
    if (__sec_bioTx) { 
      const val = __sec_isChecked(__sec_bioTx) ? '1' : '0';
      localStorage.setItem(__sec_KEYS.bioTx, val);
      __sec_log.d('beforeunload: stored bioTx', val);
    }
    if (__sec_balanceSwitch) { 
      const val = __sec_isChecked(__sec_balanceSwitch) ? '1' : '0';
      localStorage.setItem(__sec_KEYS.balance, val);
      __sec_log.d('beforeunload: stored balance', val);
    }
  } catch (e) { 
    __sec_log.e('beforeunload storage error', e);
  }
});


/* ========== Slide-in Notification ========== */
function showSlideNotification(message, type = "info") {
  __sec_log.d('showSlideNotification entry:', { message, type });
  let box = document.createElement("div");
  box.className = "slide-notification " + type;
  box.innerText = message;
  document.body.appendChild(box);
  __sec_log.d('showSlideNotification: box created and appended');

  requestAnimationFrame(() => {
    __sec_log.d('showSlideNotification: adding show class');
    box.classList.add("show");
  });

  setTimeout(() => {
    __sec_log.d('showSlideNotification: removing show class');
    box.classList.remove("show");
    setTimeout(() => {
      __sec_log.d('showSlideNotification: removing box');
      box.remove();
    }, 500);
  }, 3000);
  __sec_log.d('showSlideNotification exit');
}

/* =========================
   PIN Submodule (integrated)
   ========================= */

  // Elements for PIN modal (IDs from your top-of-script)
  const __sec_PIN_ROW        = __sec_q('#securityPinRow');
  const __sec_PIN_MODAL      = __sec_q('#securityPinModal');
  const __sec_PIN_CLOSE_BTN  = __sec_q('#securityPinCloseBtn');
  const __sec_CHANGE_FORM    = __sec_q('#changePinForm');
  const __sec_RESET_BTN      = __sec_q('#resetPinBtn');
  const __sec_PIN_CURRENT    = __sec_q('#currentPin');
  const __sec_PIN_NEW        = __sec_q('#newPin');
  const __sec_PIN_CONFIRM    = __sec_q('#confirmPin');

  // notify helper (prefer slide notification)
  function __sec_pin_notify(msg, type = 'info') {
    __sec_log.i('[PIN notify]', msg, type);
    if (typeof showSlideNotification === 'function') {
      showSlideNotification(msg, type);
    } else if (typeof showToast === 'function') {
      showToast(msg, type === 'error' ? 'error' : (type === 'success' ? 'success' : 'info'));
    } else {
      if (type === 'error') console.error('[PIN]', msg); else console.log('[PIN]', msg);
    }
  }

  // small helper: get uid from session or local storage
  async function __sec_pin_getUid() {
    try {
      if (typeof window.getSession === 'function') {
        const s = await window.getSession();
        __sec_log.d('[PIN] getSession', s);
        if (s && s.user && s.user.uid) return { uid: s.user.uid, session: s };
      }
      const stored = JSON.parse(localStorage.getItem('authTokenData') || '{}');
      if (stored && stored.user && stored.user.uid) return { uid: stored.user.uid, session: stored };
      const altUser = JSON.parse(localStorage.getItem('user') || 'null');
      if (altUser && altUser.uid) return { uid: altUser.uid, session: altUser };
      __sec_log.w('[PIN] no uid found');
      return null;
    } catch (err) {
      __sec_log.e('[PIN] getUid error', err);
      return null;
    }
  }

  // Common tables/columns to try (safe client read only when plain digits)
  const __sec_PIN_TRY_TABLES  = ['profiles','users','accounts'];
  const __sec_PIN_TRY_COLUMNS = ['pin','account_pin','accountPin','pinCode','pin_hash','pin_hash_text'];

  async function __sec_pin_findStored(uid) {
  try {
    const response = await fetch('https://api.flexgig.com.ng/api/check-pin', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });
    if (!response.ok) {
      console.error('[SecurityPin] Failed to check PIN:', await response.text());
      return null;
    }
    const { hasPin } = await response.json();
    return hasPin ? { table: 'users', column: 'pin' } : null;
  } catch (err) {
    console.error('[SecurityPin] Error checking PIN:', err);
    return null;
  }
}

  async function __sec_pin_updateStored(uid, newPin) {
  try {
    const response = await fetch('https://api.flexgig.com.ng/api/save-pin', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ pin: newPin }),
    });
    if (!response.ok) {
      console.error('[SecurityPin] PIN update failed:', await response.text());
      return { ok: false, error: 'Failed to update PIN' };
    }
    console.log('[SecurityPin] PIN updated successfully');
    return { ok: true };
  } catch (err) {
    console.error('[SecurityPin] Error updating PIN:', err);
    return { ok: false, error: err.message };
  }
}

  // Strict pin input binding (digit-only, length 4)
  function __sec_pin_bindStrictInputs() {
    try {
      const maxLen = 4;
      const fields = [__sec_PIN_CURRENT, __sec_PIN_NEW, __sec_PIN_CONFIRM].filter(Boolean);
      if (!fields.length) {
        __sec_log.d('[PIN] no input fields found when binding');
        return;
      }
      fields.forEach((el) => {
        if (!el) return;
        if (el.__sec_pin_bound) return;
        el.__sec_pin_bound = true;
        el.setAttribute('inputmode','numeric');
        el.setAttribute('pattern','[0-9]*');
        el.setAttribute('maxlength', String(maxLen));
        el.autocomplete = 'one-time-code';

        el.addEventListener('input', () => {
          const before = el.value || '';
          const cleaned = before.replace(/\D/g,'').slice(0, maxLen);
          if (before !== cleaned) {
            __sec_log.d('[PIN] sanitized input', { id: el.id, before, cleaned });
            el.value = cleaned;
          }
        });

        el.addEventListener('keypress', (ev) => {
          if (!/^[0-9]$/.test(ev.key)) {
            __sec_log.d('[PIN] keypress blocked', { id: el.id, key: ev.key });
            ev.preventDefault();
          }
        });

        el.addEventListener('paste', (ev) => {
          const pasted = (ev.clipboardData || window.clipboardData).getData('text') || '';
          const digits = pasted.replace(/\D/g,'').slice(0, maxLen);
          if (!digits.length) {
            __sec_log.d('[PIN] paste blocked (no digits)', { id: el.id, pasted });
            ev.preventDefault();
            return;
          }
          ev.preventDefault();
          const start = el.selectionStart ?? el.value.length;
          const end = el.selectionEnd ?? el.value.length;
          const newVal = (el.value.slice(0, start) + digits + el.value.slice(end)).replace(/\D/g,'').slice(0, maxLen);
          el.value = newVal;
          const caret = Math.min(start + digits.length, maxLen);
          el.setSelectionRange(caret, caret);
          __sec_log.d('[PIN] paste accepted', { id: el.id, digits, newVal });
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });

        __sec_log.i('[PIN] bound strict handlers to', el.id);
      });
    } catch (err) {
      __sec_log.e('[PIN] bindStrictInputs error', err);
    }
  }

  /* ========== Wire PIN modal controls ========== */
/* ========== Wire PIN modal controls ========== */
function __sec_pin_wireHandlers() {
  if (__sec_CHANGE_FORM) {
    __sec_CHANGE_FORM.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    __sec_log.d('[PIN] submit started');
    const cur = String((__sec_PIN_CURRENT && __sec_PIN_CURRENT.value) || '').trim();
    const neu = String((__sec_PIN_NEW && __sec_PIN_NEW.value) || '').trim();
    const conf = String((__sec_PIN_CONFIRM && __sec_PIN_CONFIRM.value) || '').trim();
    __sec_log.d('[PIN] submitted values', { cur, neu, conf });

    // Helper to clear inputs
    const clearInputs = () => {
      if (__sec_PIN_CURRENT) __sec_PIN_CURRENT.value = '';
      if (__sec_PIN_NEW) __sec_PIN_NEW.value = '';
      if (__sec_PIN_CONFIRM) __sec_PIN_CONFIRM.value = '';
    };

    // === Input validation ===
    if (!/^\d{4}$/.test(cur)) {
      __sec_pin_notify('Enter your current 4-digit PIN', 'error');
      __sec_log.w('[PIN] current invalid');
      clearInputs();
      return;
    }
    if (!/^\d{4}$/.test(neu)) {
      __sec_pin_notify('New PIN must be 4 digits', 'error');
      __sec_log.w('[PIN] new invalid');
      clearInputs();
      return;
    }
    if (neu === cur) {
      __sec_pin_notify('New PIN must be different from current PIN', 'error');
      __sec_log.w('[PIN] new equals current');
      clearInputs();
      return;
    }
    if (neu !== conf) {
      __sec_pin_notify('New PIN and confirmation do not match', 'error');
      __sec_log.w('[PIN] confirm mismatch');
      clearInputs();
      return;
    }

    // === Get user ID ===
    const info = await __sec_pin_getUid();
    if (!info || !info.uid) {
      __sec_pin_notify('You must be signed in to change PIN', 'error');
      __sec_log.e('[PIN] no signed-in user');
      clearInputs();
      return;
    }
    const uid = info.uid;
    __sec_log.d('[PIN] uid obtained', uid);

    // === Verify current PIN with API ===
    __sec_pin_notify('Verifying current PIN...', 'info');
    const verifyResponse = await fetch('https://api.flexgig.com.ng/api/verify-pin', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ pin: cur }),
    });

    if (!verifyResponse.ok) {
      const errText = await verifyResponse.text();
      console.error('[SecurityPin] PIN verification failed:', errText);
      __sec_pin_notify('Current PIN is incorrect', 'error');
      clearInputs();
      return;
    }
    __sec_log.i('[PIN] current PIN verified by API');

    // === Update PIN ===
    __sec_pin_notify('Updating PIN...', 'info');
    const upd = await __sec_pin_updateStored(uid, neu);
    if (upd && upd.ok) {
      __sec_pin_notify('PIN changed successfully', 'success');
      __sec_log.i('[PIN] update succeeded');

      clearInputs();

      if (window.ModalManager?.closeModal) {
        window.ModalManager.closeModal('securityPinModal');
        __sec_log.i('[PIN] closed securityPinModal via ModalManager');
      } else {
        __sec_PIN_MODAL?.classList.remove('active');
        __sec_PIN_MODAL?.setAttribute('aria-hidden', 'true');
        __sec_log.w('[PIN] ModalManager not found, closed directly');
      }
    } else {
      __sec_log.e('[PIN] update failed', upd?.error);
      __sec_pin_notify('Failed to update PIN. Please try again later.', 'error');
      clearInputs();
    }
  } catch (err) {
    __sec_log.e('[PIN] submit error', err);
    __sec_pin_notify('Unexpected error while changing PIN', 'error');
    if (__sec_PIN_CURRENT) __sec_PIN_CURRENT.value = '';
    if (__sec_PIN_NEW) __sec_PIN_NEW.value = '';
    if (__sec_PIN_CONFIRM) __sec_PIN_CONFIRM.value = '';
  }
}, { passive: false });
    __sec_log.i('[PIN] change form handler attached');
  } else {
    __sec_log.d('[PIN] change form not present yet');
  }

  if (__sec_RESET_BTN) {
    __sec_RESET_BTN.addEventListener('click', (ev) => {
      ev.preventDefault();
      __sec_log.i('[PIN] reset requested - redirecting to reset flow');
      __sec_pin_notify('Redirecting to PIN reset flow', 'info');
      window.location.href = '/reset-pin.html';
    });
  }
}


  /* ========== Convert rows to chevron buttons ========== */
function __sec_convertRowsToChevron() {
  if (__sec_pwdBtn) {
    __sec_pwdBtn.classList.add('chev-btn');
    __sec_pwdBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    __sec_pwdBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      __sec_log.i('change-password row clicked');
      if (typeof window.openChangePasswordModal === 'function') {
        try {
          window.openChangePasswordModal();
        } catch (err) {
          __sec_log.e('openChangePasswordModal threw', err);
          window.dispatchEvent(new CustomEvent('security:open-change-password'));
        }
      } else {
        window.dispatchEvent(new CustomEvent('security:open-change-password'));
      }
    });
  } else __sec_log.d('#changePwdBtn not present');
}

  /* ========== Init / Boot ========== */
  async function __sec_boot() {
    try {
      __sec_log.d('Booting security module');
      // Ensure session is available before wiring things that rely on it
      if (typeof window.getSession === 'function') {
        try { await window.getSession(); } catch (e) { __sec_log.d('getSession during boot failed', e); }
      }

      // Wire UI pieces
      __sec_convertRowsToChevron();
      __sec_initFromStorage();
      __sec_wireEvents();

      // PIN submodule bindings
      __sec_pin_bindStrictInputs();
      __sec_pin_wireHandlers();

      __sec_log.i('security module booted (with WebAuthn & PIN integration)');
    } catch (err) {
      __sec_log.e('boot error', err);
    }
  }

  /* Initialize: reuse existing boot wiring */
  if (document.readyState === 'loading') {
    __sec_log.d('DOM not ready, waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', __sec_boot);
  } else {
    __sec_log.d('DOM ready, booting immediately');
    setTimeout(__sec_boot, 0);
  }

/* ---- WebAuthn register/authenticate flows ---- */
/* ---- WebAuthn utilities ---- */
function base64urlToArrayBuffer(base64url) {
  __sec_log.d('base64urlToArrayBuffer entry', { input: base64url });
  try {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob(base64 + padding);
    const buffer = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buffer[i] = raw.charCodeAt(i);
    __sec_log.d('base64urlToArrayBuffer success', { input: base64url, outputLength: buffer.length });
    return buffer.buffer;
  } catch (err) {
    __sec_log.e('base64urlToArrayBuffer error', { input: base64url, err });
    throw new Error(`Failed to decode base64url: ${err.message}`);
  }
}

function arrayBufferToBase64url(buffer) {
  __sec_log.d('arrayBufferToBase64url entry', { bufferLength: buffer.byteLength });
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const result = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  __sec_log.d('arrayBufferToBase64url success', { inputLength: buffer.byteLength, outputLength: result.length });
  return result;
}

function uuidToArrayBuffer(uuid) {
  __sec_log.d('uuidToArrayBuffer entry', { uuid });
  const clean = uuid.replace(/-/g, '');
  if (clean.length !== 32) throw new Error(`Invalid UUID: ${uuid}`);
  const buffer = new Uint8Array(16);
  for (let i = 0; i < 16; i++) buffer[i] = parseInt(clean.substr(i * 2, 2), 16);
  __sec_log.d('uuidToArrayBuffer success', { input: uuid, outputLength: buffer.length });
  return buffer.buffer;
}

/* ---- Registration flow (instrumented + persists to localStorage immediately) ---- */
async function startRegistration(userId, username, displayName) {
  __sec_log.d('startRegistration entry', { userId, username, displayName });
  try {
    // Get user for UID (no token needed)
    const currentUser = await __sec_getCurrentUser();
    __sec_log.d('startRegistration: Retrieved currentUser', { hasUser: !!currentUser?.user });
    if (!currentUser || !currentUser.user || !currentUser.user.uid) {
      throw new Error('No valid user session');
    }

    const apiBase = window.__SEC_API_BASE || "https://api.flexgig.com.ng";
    const optUrl = `${apiBase}/webauthn/register/options`;
    __sec_log.d('startRegistration: Fetching options from', optUrl);

    const optRes = await fetch(optUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, username, displayName }),
    });

    const optRaw = await optRes.text();
    __sec_log.d('startRegistration: Options response', { status: optRes.status, ok: optRes.ok, raw: optRaw });
    if (!optRes.ok) throw new Error(`Options failed: ${optRaw}`);

    const options = JSON.parse(optRaw);
    __sec_log.d('startRegistration: Parsed options', options);

    // Convert challenge
    __sec_log.d('startRegistration: Converting challenge');
    options.challenge = new Uint8Array(base64urlToArrayBuffer(options.challenge));
    __sec_log.d('startRegistration: Challenge converted', { challengeLength: options.challenge.length });

    // Convert user.id (server might send uuid or base64url)
    if (options.user?.id) {
      __sec_log.d('startRegistration: Converting user.id');
      try {
        options.user.id = new Uint8Array(base64urlToArrayBuffer(options.user.id));
        __sec_log.d('startRegistration: user.id base64url converted', { idLength: options.user.id.length });
      } catch (convErr) {
        __sec_log.w('startRegistration: base64url failed, trying uuid');
        options.user.id = new Uint8Array(uuidToArrayBuffer(userId));
        __sec_log.d('startRegistration: user.id uuid converted', { idLength: options.user.id.length });
      }
    }

    if (options.excludeCredentials) {
      __sec_log.d('startRegistration: Converting excludeCredentials', { count: options.excludeCredentials.length });
      options.excludeCredentials = options.excludeCredentials.map(c => {
        const converted = {
          ...c,
          id: new Uint8Array(base64urlToArrayBuffer(c.id))
        };
        __sec_log.d('startRegistration: Converted excludeCredential', { idLength: converted.id.length });
        return converted;
      });
    }

    __sec_log.d('startRegistration: Final publicKey options before create', {
      challengeLength: options.challenge?.length,
      userIdLength: options.user?.id?.length,
      excludeCount: options.excludeCredentials?.length || 0
    });

    // Create credential
    __sec_log.i('startRegistration: Calling navigator.credentials.create');
    const cred = await navigator.credentials.create({ publicKey: options });
    __sec_log.d('startRegistration: Credential created', { id: cred?.id, type: cred?.type });
    console.log('[REG] credential created id:', cred.id);
    try {
      const transports = cred.response.getTransports ? cred.response.getTransports() : null;
      console.log('[REG] transports:', transports);
    } catch(e) {
      console.warn('[REG] getTransports threw', e);
    }
    console.log('[REG] rawId hex:', (function bufToHex(b){ const u=new Uint8Array(b); return Array.from(u).map(x=>x.toString(16).padStart(2,'0')).join(''); })(cred.rawId));

    if (!cred) throw new Error('No credential returned');

    // Build prepared credential for server
    const credential = {
      id: cred.id,
      rawId: arrayBufferToBase64url(cred.rawId),
      type: cred.type,
      response: {
        clientDataJSON: arrayBufferToBase64url(cred.response.clientDataJSON),
        attestationObject: arrayBufferToBase64url(cred.response.attestationObject),
        transports: cred.response.getTransports ? cred.response.getTransports() : []
      }
    };
    __sec_log.d('startRegistration: Prepared credential for verify', { id: credential.id, rawIdLength: credential.rawId.length });

    // --- IMMEDIATE LOCAL PERSIST (pre-verify fallback) ---
    try {
      // Save the rawId fallback immediately so reloads/unloads won't lose it
      localStorage.setItem('credentialId', credential.rawId);
      localStorage.setItem('credentialSavedAt', new Date().toISOString());
      console.log('[CRED DEBUG] pre-verify setItem credentialId ->', localStorage.getItem('credentialId'));
      console.log('[CRED DEBUG] origin/domain:', location.origin, document.domain);
      console.trace('[CRED DEBUG] pre-verify write trace');
      // sanity assert
      console.assert(localStorage.getItem('credentialId') === credential.rawId, 'Pre-verify credentialId not persisted!');
      __sec_log.d('startRegistration: Pre-verify credentialId saved to localStorage', { rawIdLen: credential.rawId.length });
    } catch (e) {
      __sec_log.e('startRegistration: Failed to persist pre-verify credentialId to localStorage', { error: (e && e.message) || e });
    }

    // Send to server for canonical verify
    const verifyUrl = `${apiBase}/webauthn/register/verify`;
    __sec_log.d('startRegistration: Verifying at', verifyUrl);
    const verifyRes = await fetch(verifyUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, credential }),
    });

    const verifyRaw = await verifyRes.text();
    __sec_log.d('startRegistration: Verify response', { status: verifyRes.status, ok: verifyRes.ok, raw: verifyRaw });
    if (!verifyRes.ok) {
      // If server verify fails, keep the pre-verify fallback in storage for debugging
      __sec_log.e('startRegistration: Verify failed — pre-verify value retained for inspection', { preverify: localStorage.getItem('credentialId') });
      throw new Error(`Verify failed: ${verifyRaw}`);
    }

    const verifyResult = JSON.parse(verifyRaw);
    __sec_log.i('startRegistration: Verify success', verifyResult);

    // Overwrite local storage with canonical server credentialId if present
    try {
      const serverId = verifyResult?.credentialId;
      if (serverId) {
        localStorage.setItem('credentialId', serverId);
        localStorage.setItem('credentialSavedAt', new Date().toISOString());
        console.log('[CRED DEBUG] post-verify setItem credentialId ->', localStorage.getItem('credentialId'));
        console.trace('[CRED DEBUG] post-verify write trace');
        console.assert(localStorage.getItem('credentialId') === serverId, 'Post-verify credentialId not persisted!');
        __sec_log.d('startRegistration: Server credentialId saved to localStorage', { serverId });
      } else {
        __sec_log.w('startRegistration: Server did not return credentialId — keeping pre-verify fallback', { fallback: localStorage.getItem('credentialId') });
      }
    } catch (e) {
      __sec_log.e('startRegistration: Failed to write server credentialId to localStorage', { error: (e && e.message) || e });
    }

    return verifyResult;
  } catch (err) {
    __sec_log.e('startRegistration error', {
      message: err.message,
      stack: err.stack,
      userId,
      username
    });
    // Ensure we still surface the pre-verify fallback for debugging
    try {
      const fallback = localStorage.getItem('credentialId');
      __sec_log.d('startRegistration: fallback credentialId (from localStorage) after error', { fallback });
    } catch (e) {
      __sec_log.e('startRegistration: reading fallback failed', { err: (e && e.message) || e });
    }
    throw err;
  } finally {
    __sec_log.d('startRegistration exit');
  }
}

/* ---- Authentication flow ---- */
async function startAuthentication(userId) {
  __sec_log.d('startAuthentication entry', { userId });
  try {
    // Get user for UID (no token needed)
    const currentUser = await __sec_getCurrentUser();
    __sec_log.d('startAuthentication: Retrieved currentUser', { hasUser: !!currentUser?.user });
    if (!currentUser || !currentUser.user || !currentUser.user.uid) {
      throw new Error('No valid user session');
    }

    const apiBase = window.__SEC_API_BASE || "https://api.flexgig.com.ng";
    const optUrl = `${apiBase}/webauthn/auth/options/discover`;
    __sec_log.d('startAuthentication: Fetching options from', optUrl);
    const optRes = await fetch(optUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const optRaw = await optRes.text();
    __sec_log.d('startAuthentication: Options response', { status: optRes.status, ok: optRes.ok, raw: optRaw });
    if (!optRes.ok) throw new Error(`Auth options failed: ${optRaw}`);

    const options = JSON.parse(optRaw);
    __sec_log.d('startAuthentication: Parsed options', options);

    __sec_log.d('startAuthentication: Converting challenge');
    options.challenge = new Uint8Array(base64urlToArrayBuffer(options.challenge));
    __sec_log.d('startAuthentication: Challenge converted', { challengeLength: options.challenge.length });

    if (options.allowCredentials) {
      __sec_log.d('startAuthentication: Converting allowCredentials', { count: options.allowCredentials.length });
      options.allowCredentials = options.allowCredentials.map(c => {
        const converted = {
          ...c,
          id: new Uint8Array(base64urlToArrayBuffer(c.id))
        };
        __sec_log.d('startAuthentication: Converted allowCredential', { idLength: converted.id.length });
        return converted;
      });
    }

    __sec_log.d('startAuthentication: Final publicKey options before get', {
      challengeLength: options.challenge?.length,
      allowCount: options.allowCredentials?.length || 0
    });

    __sec_log.i('startAuthentication: Calling navigator.credentials.get');
    const assertion = await navigator.credentials.get({ publicKey: options });
    __sec_log.d('startAuthentication: Assertion received', { id: assertion?.id, type: assertion?.type });
    if (!assertion) throw new Error('No assertion returned');

    const credential = {
      id: assertion.id,
      rawId: arrayBufferToBase64url(assertion.rawId),
      type: assertion.type,
      response: {
        clientDataJSON: arrayBufferToBase64url(assertion.response.clientDataJSON),
        authenticatorData: arrayBufferToBase64url(assertion.response.authenticatorData),
        signature: arrayBufferToBase64url(assertion.response.signature),
        userHandle: assertion.response.userHandle ? arrayBufferToBase64url(assertion.response.userHandle) : null
      }
    };
    __sec_log.d('startAuthentication: Prepared credential for verify', { id: credential.id, rawIdLength: credential.rawId.length });

    const verifyUrl = `${apiBase}/webauthn/auth/verify`;
    __sec_log.d('startAuthentication: Verifying at', verifyUrl);
    const verifyRes = await fetch(verifyUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, credential }),
    });
    const verifyRaw = await verifyRes.text();
    __sec_log.d('startAuthentication: Verify response', { status: verifyRes.status, ok: verifyRes.ok, raw: verifyRaw });
    if (!verifyRes.ok) throw new Error(`Auth verify failed: ${verifyRaw}`);

    const verifyResult = JSON.parse(verifyRaw);
    __sec_log.i('startAuthentication: Verify success', verifyResult);
    return verifyResult;
  } catch (err) {
    __sec_log.e('startAuthentication error', {
      message: err.message,
      stack: err.stack,
      userId
    });
    throw err;
  }
  __sec_log.d('startAuthentication exit');
}

/* ---- WebAuthn helper calls to server (list/revoke) ---- */
async function __sec_listAuthenticators(userId) {
  __sec_log.d('listAuthenticators entry', { userId });
  try {
    const currentUser = await __sec_getCurrentUser();
    __sec_log.d('listAuthenticators: Retrieved currentUser', { hasUser: !!currentUser?.user });
    if (!currentUser || !currentUser.user || !currentUser.user.uid) {
      __sec_log.w('listAuthenticators: No valid user session');
      return null;
    }

    const apiBase = window.__SEC_API_BASE || "https://api.flexgig.com.ng";
    const url = `${apiBase}/webauthn/authenticators/${encodeURIComponent(userId)}`;
    __sec_log.d('listAuthenticators: Fetching from', url);
    const r = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    const rRaw = await r.text();
    __sec_log.d('listAuthenticators: Response', { status: r.status, ok: r.ok, raw: rRaw });

    if (!r.ok) {
      __sec_log.w('listAuthenticators failed', r.status);
      return null;
    }

    const j = JSON.parse(rRaw);
    __sec_log.d('listAuthenticators success', j);
    return j;
  } catch (err) {
    __sec_log.e('listAuthenticators error', { err, userId });
    return null;
  }
  __sec_log.d('listAuthenticators exit');
}

async function __sec_revokeAuthenticator(userId, credentialID) {
  __sec_log.d('revokeAuthenticator entry', { userId, credentialID });
  try {
    const currentUser = await __sec_getCurrentUser();
    __sec_log.d('revokeAuthenticator: Retrieved currentUser', { hasUser: !!currentUser?.user });
    if (!currentUser || !currentUser.user || !currentUser.user.uid) {
      __sec_log.w('revokeAuthenticator: No valid user session');
      return false;
    }

    const apiBase = window.__SEC_API_BASE || "https://api.flexgig.com.ng";
    const url = `${apiBase}/webauthn/authenticators/${encodeURIComponent(userId)}/revoke`;
    __sec_log.d('revokeAuthenticator: Posting to', url);
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialID }),
    });

    const rRaw = await r.text();
    __sec_log.d('revokeAuthenticator: Response', { status: r.status, ok: r.ok, raw: rRaw });

    if (!r.ok) {
      __sec_log.w('revokeAuthenticator failed', credentialID, r.status);
      return false;
    }

    __sec_log.i('revokeAuthenticator success', credentialID);
    return true;
  } catch (err) {
    __sec_log.e('revokeAuthenticator error', { err, userId, credentialID });
    return false;
  }
  __sec_log.d('revokeAuthenticator exit');
}

/* Wire events (with WebAuthn integration) */
function __sec_wireEvents() {
  __sec_log.d('wireEvents entry');
  try {
    if (__sec_launcherBtn) {
      __sec_log.d('wireEvents: Wiring launcher (#securityBtn)');
      __sec_launcherBtn.addEventListener('click', (ev) => {
        __sec_log.d('launcher click event');
        ev.preventDefault();
        __sec_openModal();
      });
      __sec_log.d('launcher wired (#securityBtn)');
    } else {
      __sec_log.w('no launcher (#securityBtn) found; use controller.open() to open');
    }

    if (__sec_closeBtn) {
      __sec_log.d('wireEvents: Wiring close (#securityCloseBtn)');
      __sec_closeBtn.addEventListener('click', __sec_closeModal);
      __sec_log.d('close button wired (#securityCloseBtn)');
    } else {
      __sec_log.w('no close button (#securityCloseBtn) found');
    }
    if (__sec_closeBtn && __sec_modal) {
      __sec_log.d('wireEvents: Wiring modal close');
      __sec_closeBtn.addEventListener('click', (e) => {
        __sec_log.d('Security modal close button clicked');
        e.preventDefault();
        __sec_log.i('Security modal close button clicked');
        __sec_modal.classList.remove('show');
        __sec_modal.setAttribute('aria-hidden', 'true');
      });
    }

    document.addEventListener('keydown', (e) => {
      __sec_log.d('keydown event', { key: e.key, modalActive: __sec_modal && __sec_modal.classList.contains('active') });
      if (e.key === 'Escape' && __sec_modal && __sec_modal.classList.contains('active')) {
        __sec_log.i('Escape key pressed, closing modal');
        __sec_closeModal();
      }
    });

    if (__sec_parentSwitch) {
      __sec_log.d('wireEvents: Wiring parent switch (#biometricsSwitch)');
      const __sec_parentHandler = async () => {
        __sec_log.d('__sec_parentHandler: Starting');
        return withLoader(async () => {
          __sec_setBusy(__sec_parentSwitch, true);
          const uiOn = __sec_toggleSwitch(__sec_parentSwitch);
          __sec_log.d('__sec_parentHandler: Toggle state', { uiOn });

          const currentUser = await __sec_getCurrentUser();
          __sec_log.d('__sec_parentHandler: Retrieved currentUser', { hasUser: !!currentUser?.user });

          if (!currentUser || !currentUser.user || !currentUser.user.uid) {
            __sec_log.e('__sec_parentHandler: No current user or invalid session');
            __sec_setChecked(__sec_parentSwitch, false);
            __sec_setBusy(__sec_parentSwitch, false);
            alert('You must be signed in to enable biometrics. Please try logging in again.');
            window.location.href = '/';
            return;
          }

          const { user } = currentUser;
          __sec_log.d('__sec_parentHandler: Extracted user', { userId: user.uid });

          const uid = user.uid;
          __sec_log.d('__sec_parentHandler: Proceeding with uid', uid);

          if (uiOn) {
            __sec_log.i('Parent toggle ON requested — checking existing authenticators for user', uid);
            const auths = await __sec_listAuthenticators(uid);
            __sec_log.d('__sec_parentHandler: Authenticators', auths);
            if (Array.isArray(auths) && auths.length > 0) {
              __sec_log.i('Existing authenticators found — showing children without registering new one');
              __sec_setBiometrics(true, true);
              __sec_setBusy(__sec_parentSwitch, false);
              return;
            }

            try {
              __sec_log.i('No authenticators found — starting registration flow');
              const regResult = await startRegistration(uid, user.email || user.username || uid, user.fullName || user.email || uid);
              __sec_log.d('__sec_parentHandler: Registration result', regResult);
              __sec_setBiometrics(true, true);
              __sec_log.i('Registration successful');
            } catch (err) {
              __sec_log.e('Registration failed', { err, uid });
              __sec_setChecked(__sec_parentSwitch, false);
              __sec_setBiometrics(false, false);
              alert('Biometric registration failed: ' + (err.message || 'unknown error'));
            } finally {
              __sec_setBusy(__sec_parentSwitch, false);
            }
          } else {
            try {
              __sec_log.i('Parent toggle OFF requested — revoking authenticators for user', uid);
              const auths = await __sec_listAuthenticators(uid);
              __sec_log.d('__sec_parentHandler: Authenticators to revoke', auths);
              if (Array.isArray(auths) && auths.length > 0) {
                for (const a of auths) {
                  const credential_id = a.credential_id || a.credentialID || a.credentialId;
                  __sec_log.d('__sec_parentHandler: Attempting revoke for', credential_id);
                  if (!credential_id) {
                    __sec_log.w('__sec_parentHandler: Skipping invalid credential_id', a);
                    continue;
                  }
                  const ok = await __sec_revokeAuthenticator(uid, credential_id);
                  __sec_log.d('revoke result', credential_id, ok);
                }
              } else {
                __sec_log.d('No authenticators to revoke for user', uid);
              }
              __sec_setBiometrics(false, true);
            } catch (err) {
              __sec_log.e('Error revoking authenticators', { err, uid });
              __sec_setBiometrics(false, true);
              alert('Warning: failed to revoke authenticator(s) on server. Check console.');
            } finally {
              __sec_setBusy(__sec_parentSwitch, false);
            }
          }
          __sec_log.d('__sec_parentHandler: Exit');
        });
      };

      __sec_parentSwitch.addEventListener('click', (e) => {
        __sec_log.d('parentSwitch click event');
        e.preventDefault();
        __sec_parentHandler();
      });
      __sec_parentSwitch.addEventListener('keydown', (e) => {
        __sec_log.d('parentSwitch keydown', { key: e.key });
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          __sec_parentHandler();
        }
      });
    } else {
      __sec_log.w('no parent switch (#biometricsSwitch) found');
    }

    if (__sec_bioLogin) {
      __sec_log.d('wireEvents: Wiring bioLogin (#bioLoginSwitch)');
      __sec_bioLogin.addEventListener('click', async (e) => {
        __sec_log.d('bioLogin click event');
        e.preventDefault();
        if (!__sec_parentSwitch || !__sec_isChecked(__sec_parentSwitch)) {
          __sec_log.d('bioLogin click ignored; parent OFF');
          showSlideNotification('Biometrics must be enabled first', 'info');
          __sec_parentHandler(); // Auto-enable parent
          return;
        }
        __sec_setBusy(__sec_bioLogin, true);
        const newState = __sec_toggleSwitch(__sec_bioLogin);
        __sec_log.d('bioLogin: New state', { newState });
        try {
          localStorage.setItem(__sec_KEYS.bioLogin, newState ? '1' : '0');
          __sec_log.i(`bioLogin ${newState ? 'enabled' : 'disabled'} (local only)`);
          showSlideNotification(`Login biometrics ${newState ? 'enabled' : 'disabled'}`, newState ? 'success' : 'info');
          if (!newState) __sec_maybeDisableParentIfChildrenOff();
        } catch (err) {
          __sec_log.e('bioLogin: Storage error', { err, newState });
          __sec_setChecked(__sec_bioLogin, false);
          localStorage.setItem(__sec_KEYS.bioLogin, '0');
          showSlideNotification('Failed to update login biometrics', 'error');
        } finally {
          __sec_setBusy(__sec_bioLogin, false);
        }
        __sec_log.d('bioLogin click handler exit');
      });

      __sec_bioLogin.addEventListener('keydown', (e) => {
        __sec_log.d('bioLogin keydown', { key: e.key });
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          __sec_bioLogin.click();
        }
      });
    } else {
      __sec_log.w('no bioLogin switch (#bioLoginSwitch) found');
    }

    if (__sec_bioTx) {
      __sec_log.d('wireEvents: Wiring bioTx (#bioTxSwitch)');
      __sec_bioTx.addEventListener('click', async (e) => {
        __sec_log.d('bioTx click event');
        e.preventDefault();
        if (!__sec_parentSwitch || !__sec_isChecked(__sec_parentSwitch)) {
          __sec_log.d('bioTx click ignored; parent OFF');
          showSlideNotification('Biometrics must be enabled first', 'info');
          __sec_parentHandler(); // Auto-enable parent
          return;
        }
        __sec_setBusy(__sec_bioTx, true);
        const newState = __sec_toggleSwitch(__sec_bioTx);
        __sec_log.d('bioTx: New state', { newState });
        try {
          localStorage.setItem(__sec_KEYS.bioTx, newState ? '1' : '0');
          __sec_log.i(`bioTx ${newState ? 'enabled' : 'disabled'} (local only)`);
          showSlideNotification(`Transaction biometrics ${newState ? 'enabled' : 'disabled'}`, newState ? 'success' : 'info');
          if (!newState) __sec_maybeDisableParentIfChildrenOff();
        } catch (err) {
          __sec_log.e('bioTx: Storage error', { err, newState });
          __sec_setChecked(__sec_bioTx, false);
          localStorage.setItem(__sec_KEYS.bioTx, '0');
          showSlideNotification('Failed to update transaction biometrics', 'error');
        } finally {
          __sec_setBusy(__sec_bioTx, false);
        }
        __sec_log.d('bioTx click handler exit');
      });

      __sec_bioTx.addEventListener('keydown', (e) => {
        __sec_log.d('bioTx keydown', { key: e.key });
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          __sec_bioTx.click();
        }
      });
    } else {
      __sec_log.w('no bioTx switch (#bioTxSwitch) found');
    }

    if (__sec_balanceSwitch) {
      __sec_log.d('wireEvents: Wiring balance (#balanceSwitch)');
      const __sec_balanceHandler = () => {
        __sec_log.d('balanceHandler entry');
        const on = __sec_toggleSwitch(__sec_balanceSwitch);
        try {
          localStorage.setItem(__sec_KEYS.balance, on ? '1' : '0');
          __sec_log.d('balanceHandler: Stored', on ? '1' : '0');
        } catch (e) {
          __sec_log.e('balanceHandler: Storage error', e);
        }
        window.dispatchEvent(new CustomEvent('security:balance-visibility-changed', { detail: { visible: on } }));
        __sec_log.i('balanceSwitch ->', on);
        __sec_log.d('balanceHandler exit');
      };
      __sec_balanceSwitch.addEventListener('click', __sec_balanceHandler);
      __sec_balanceSwitch.addEventListener('keydown', (e) => {
        __sec_log.d('balance keydown', { key: e.key });
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          __sec_balanceHandler();
        }
      });
    } else {
      __sec_log.w('no balance switch (#balanceSwitch) found');
    }

    __sec_log.i('events wired (with WebAuthn integration)');
  } catch (err) {
    __sec_log.e('wireEvents error', { err });
  }
  __sec_log.d('wireEvents exit');
}

/* Open/close modal with focus handling */
let __sec_lastActiveElement = null;
function __sec_openModal() {
  if (!__sec_modal) {
    __sec_log.e('openModal: #securityModal not found');
    return;
  }
  __sec_lastActiveElement = document.activeElement;
  __sec_modal.classList.add('active');
  __sec_modal.setAttribute('aria-hidden', 'false');
  try { __sec_modal.scrollTop = 0; } catch (e) {}
  if (__sec_parentSwitch && typeof __sec_parentSwitch.focus === 'function') {
    __sec_parentSwitch.focus();
  }
  __sec_log.i('modal opened');
}

function __sec_closeModal() {
  if (!__sec_modal) return;
  __sec_modal.classList.remove('active');
  __sec_modal.setAttribute('aria-hidden', 'true');
  if (__sec_lastActiveElement && typeof __sec_lastActiveElement.focus === 'function') {
    __sec_lastActiveElement.focus();
  }
  __sec_log.i('modal closed');
}

/* Expose safe controller */
window.__secModalController = {
  open: __sec_openModal,
  close: __sec_closeModal,
  getState: () => ({
    biom: localStorage.getItem(__sec_KEYS.biom),
    bioLogin: localStorage.getItem(__sec_KEYS.bioLogin),
    bioTx: localStorage.getItem(__sec_KEYS.bioTx),
    balance: localStorage.getItem(__sec_KEYS.balance)
  })
};
})(supabaseClient);


/* ---------------------------
   Top slide-in notifier utils
   --------------------------- */
function ensureTopNotifier() {
  if (document.getElementById('fg-top-notifier')) return document.getElementById('fg-top-notifier');
  const el = document.createElement('div');
  el.id = 'fg-top-notifier';
  el.innerHTML = `<div class="msg" aria-live="polite"></div>
                  <div class="countdown" style="display:none"></div>
                  <div class="close" title="Dismiss">✕</div>`;
  document.body.appendChild(el);
  el.querySelector('.close').addEventListener('click', () => hideTopNotifier());
  return el;
}

// make sure message is a string (safe)
function stringifyMessage(m) {
  if (m == null) return '';
  if (typeof m === 'string') return m;
  try {
    // If it's an object with useful fields, show them nicely
    if (m.message || m.error) return (m.message || m.error) + (m.meta ? ` — ${JSON.stringify(m.meta)}` : '');
    return typeof m.toString === 'function' ? m.toString() : JSON.stringify(m);
  } catch (e) {
    return JSON.stringify(m);
  }
}

function showTopNotifier(message, type = 'info', { autoHide = true, duration = 6000, countdownUntil = null } = {}) {
  const n = ensureTopNotifier();
  n.className = ''; // reset classes
  n.classList.add(type);
  n.querySelector('.msg').textContent = stringifyMessage(message);
  const countdownEl = n.querySelector('.countdown');
  if (countdownUntil) {
    countdownEl.style.display = '';
    updateCountdownDisplay(countdownEl, countdownUntil);
    startGlobalLockoutTicker(countdownEl, countdownUntil);
  } else {
    countdownEl.style.display = 'none';
  }
  requestAnimationFrame(() => n.classList.add('show'));
  if (autoHide && !countdownUntil) {
    setTimeout(() => hideTopNotifier(), duration);
  }
}


function hideTopNotifier() {
  const n = document.getElementById('fg-top-notifier');
  if (!n) return;
  n.classList.remove('show');
  // stop ticker if any
  if (window.__fg_top_notifier_interval) {
    clearInterval(window.__fg_top_notifier_interval);
    window.__fg_top_notifier_interval = null;
  }
}

/* ---------------------------
   Lockout countdown helpers
   --------------------------- */
function updateCountdownDisplay(el, untilIso) {
  const until = new Date(untilIso);
  const diff = Math.max(0, until - Date.now());
  if (diff <= 0) {
    el.textContent = '';
    return;
  }
  const s = Math.floor(diff / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  el.textContent = `${mm}m ${String(ss).padStart(2,'0')}s`;
}

function startGlobalLockoutTicker(countdownEl, untilIso) {
  // clear previous
  if (window.__fg_top_notifier_interval) {
    clearInterval(window.__fg_top_notifier_interval);
  }
  window.__fg_top_notifier_interval = setInterval(() => {
    updateCountdownDisplay(countdownEl, untilIso);
    if (new Date(untilIso) <= new Date()) {
      clearInterval(window.__fg_top_notifier_interval);
      window.__fg_top_notifier_interval = null;
      hideTopNotifier();
      // remove persisted lockout
      try { localStorage.removeItem('pin_lockout_until'); } catch(e){}
      // Re-enable inputs if you stored a disabling state
      enableReauthInputs(true);
    }
  }, 1000);
}

/* Simple helpers to disable/enable PIN inputs + keypad */
function disableReauthInputs(disabled = true) {
  try {
    const inputs = document.querySelectorAll('.reauthpin-inputs input');
    const keys = document.querySelectorAll('.reauthpin-keypad button');
    inputs.forEach(i => i.disabled = disabled);
    keys.forEach(k => k.disabled = disabled);
  } catch (e) { /* ignore */ }
}

function enableReauthInputs() { disableReauthInputs(false); }

/* Persist lockout until */
function persistLockout(untilIso) {
  try { localStorage.setItem('pin_lockout_until', untilIso); } catch(e){}
}

/* When page / modal opens, call this to resume any lockout countdown */
function resumeLockoutIfAny() {
  try {
    const untilIso = localStorage.getItem('pin_lockout_until');
    if (!untilIso) return;
    const until = new Date(untilIso);
    if (until > new Date()) {
      // show notifier and disable inputs
      disableReauthInputs(true);
      showTopNotifier('Too many incorrect PINs — locked until', 'error', { autoHide: false, countdownUntil: untilIso });
    } else {
      localStorage.removeItem('pin_lockout_until');
      enableReauthInputs();
    }
  } catch(e){ console.error('resumeLockoutIfAny', e); }
}

/* Open Forget PIN modal (try existing links / ModalManager) */
function openForgetPinFlow() {
  // If there is a cached DOM ref (your init caches forgetPinLinkPin) try to click it:
  try {
    if (typeof forgetPinLinkPin !== 'undefined' && forgetPinLinkPin) {
      forgetPinLinkPin.click();
      return;
    }
    if (window.ModalManager && typeof ModalManager.openModal === 'function') {
      ModalManager.openModal('forgetPinModal');
      return;
    }
    // fallback: open a simple modal or show an alert
    alert('Please use the "Forget PIN" button in the app to reset your PIN.');
  } catch (e) {
    console.error('openForgetPinFlow error', e);
    alert('Please use the "Forget PIN" button in the app to reset your PIN.');
  }
}




/* -----------------------------
   Reauth + Inactivity (perfected version)
   - NO logs (console or on-screen)
   - Resilient shouldReauth fallback
   - Debounced mobile events
   - Defensive safeCall usage
   - Biometrics registration/disable added
   - ARIA/accessibility boosts
   - Prod IDLE_TIME (10 min)
   - Backend-aligned fetches (userId body)
----------------------------- */
(function () {
  // Safe wrappers
  function safeQuery(id) {
    try {
      return document.getElementById(id);
    } catch (e) {
      return null;
    }
  }

  function isValidImageSource(src) {
    return !!src && /^(data:image\/|https?:\/\/|\/|blob:)/i.test(src);
  }

  function safeCall(fn, ...args) {
    try {
      if (typeof fn === 'function') return fn(...args);
    } catch (e) {}
    return undefined;
  }

  // Cached DOM refs — (re)cached when needed
  let reauthModal,
      biometricView,
      pinView,
      reauthAvatar,
      reauthName,
      reauthAlert,
      reauthAlertMsg,
      deleteReauthKey,
      verifyBiometricBtn,
      switchToPin,
      switchToBiometric,
      logoutLinkBio,
      logoutLinkPin,
      forgetPinLinkBio,
      forgetPinLinkPin,
      promptModal,
      yesBtn;

  function cacheDomRefs() {
    console.log('cacheDomRefs called');
    reauthModal = safeQuery('reauthModal');
    biometricView = safeQuery('biometricView');
    pinView = safeQuery('pinView');
    reauthAvatar = safeQuery('reauthAvatar');
    reauthName = safeQuery('reauthName');
    reauthAlert = safeQuery('reauthAlert');
    reauthAlertMsg = safeQuery('reauthAlertMsg');
    deleteReauthKey = safeQuery('deleteReauthKey');
    verifyBiometricBtn = safeQuery('verifyBiometricBtn');
    switchToPin = safeQuery('switchToPin');
    switchToBiometric = safeQuery('switchToBiometric');
    logoutLinkBio = safeQuery('logoutLinkBio');
    logoutLinkPin = safeQuery('logoutLinkPin');
    forgetPinLinkBio = safeQuery('forgetPinLinkBio');
    forgetPinLinkPin = safeQuery('forgetPinLinkPin');
    promptModal = safeQuery('inactivityPrompt');
    yesBtn = safeQuery('yesActiveBtn');
    console.log('Cached refs - pinView:', !!pinView, 'deleteReauthKey:', !!deleteReauthKey);
  }

    // --------------------
  // PIN state (shared)
  // --------------------
  let currentPin = '';     // Optional global used by some PIN handlers
  let firstPin = '';
  let step = 'reauth';     // 'create' | 'confirm' | 'reauth'
  let processing = false;


    function getReauthInputs() {
    console.log('getReauthInputs called');
    try {
      // Use the inputs under .reauthpin-inputs (you said you won't change HTML)
      if (pinView && pinView.querySelectorAll) {
        const inputs = Array.from(pinView.querySelectorAll('.reauthpin-inputs input'));
        console.log('Found inputs:', inputs.length);
        return inputs;
      }
    } catch (e) {
      console.error('Error in getReauthInputs:', e);
    }
    console.log('No inputs found');
    return [];
  }

  // PIN completion handler (server verification)
  // ----- Replace (or drop in) this handlePinCompletion implementation -----
async function handlePinCompletion() {
  console.log('handlePinCompletion started (new robust flow)');
  if (processing) { console.log('Already processing'); return; }
  const pin = currentPin;
  if (!/^\d{4}$/.test(pin)) {
    showTopNotifier('PIN must be 4 digits', 'error');
    return;
  }
  processing = true;
    return withLoader(async () => {

  try {
    const session = await safeCall(getSession) || {};
    const userId = session.user?.id || session.user?.uid || localStorage.getItem('userId');
    if (!userId) throw new Error('No user ID');

    const res = await fetch('https://api.flexgig.com.ng/api/reauth-pin', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
      },
      body: JSON.stringify({ userId, pin })
    });

    // Try to parse JSON body if possible
    let payload = null;
    try {
      payload = await res.json();
    } catch (e) {
      payload = null;
    }

    if (res.ok) {
      // success path
      // call your existing success handler
      if (typeof onSuccessfulReauth === 'function') {
        try { await onSuccessfulReauth(payload); } catch(e){ console.warn('onSuccessfulReauth error', e); }
      }
      // clear inputs
      if (typeof resetReauthInputs === 'function') resetReauthInputs();
      // clear any stored lockout
      try { localStorage.removeItem('pin_lockout_until'); } catch(e){}
      processing = false;
      return;
    }

    // --- Error handling: prefer structured JSON, fallback to text ---
    const serverMsg = (payload && (payload.message || payload.error)) || (await res.text().catch(()=>'')) || `HTTP ${res.status}`;
    const serverCode = payload && payload.code ? payload.code : null;
    const meta = payload && payload.meta ? payload.meta : {};

    console.warn('PIN verify server error', { status: res.status, code: serverCode, msg: serverMsg, meta });

    // Special handling by code
    switch (serverCode) {
      case 'INCORRECT_PIN_ATTEMPT': {
        // meta.attemptsLeft expected from server
        const left = meta?.attemptsLeft ?? null;
        showTopNotifier(left ? `Incorrect PIN — ${left} attempt(s) left` : (payload?.message || 'Incorrect PIN'), 'error');
        // small shake animation on inputs (optional)
        const wrap = document.querySelector('.reauthpin-inputs');
        if (wrap) {
          wrap.classList.add('fg-shake');
          setTimeout(()=>wrap.classList.remove('fg-shake'), 400);
        }
        break;
      }
      case 'TOO_MANY_ATTEMPTS':
      case 'TOO_MANY_ATTEMPTS_EMAIL': {
        // server should include lockoutUntil in meta.lockoutUntil or we can check Retry-After header
        let untilIso = meta?.lockoutUntil || null;
        if (!untilIso) {
          const ra = res.headers.get('Retry-After');
          if (ra) {
            const sec = parseInt(ra, 10);
            if (!isNaN(sec)) untilIso = new Date(Date.now() + sec * 1000).toISOString();
          }
        }
        if (untilIso) {
          // persist and show countdown
          persistLockout(untilIso);
          disableReauthInputs(true);
          showTopNotifier(payload?.message || 'Too many incorrect PINs — locked', 'error', { autoHide: false, countdownUntil: untilIso });
        } else {
          showTopNotifier(payload?.message || 'Too many incorrect PINs — locked', 'error', { autoHide: false });
        }
        break;
      }
      case 'PIN_ENTRY_LIMIT_EXCEEDED': {
        // final path: instruct user to use Forget PIN flow
        showTopNotifier(payload?.message || 'PIN entry limit reached — use Forget PIN', 'error', { autoHide: false });
        // call forget-pin handler to open modal (client flow)
        setTimeout(() => openForgetPinFlow(), 800);
        break;
      }
      default: {
        // fallback generic message
        showTopNotifier(payload?.message || serverMsg || 'PIN verification failed', 'error');
      }
    }

    // Clear inputs visually so user can try again (but only if not locked)
    if (!['TOO_MANY_ATTEMPTS','TOO_MANY_ATTEMPTS_EMAIL','PIN_ENTRY_LIMIT_EXCEEDED'].includes(serverCode)) {
      if (typeof resetReauthInputs === 'function') resetReauthInputs();
      currentPin = '';
    } else {
      // locked -> persist lockout (if server provided lockout meta)
      if (meta?.lockoutUntil) {
        persistLockout(meta.lockoutUntil);
        disableReauthInputs(true);
      }
    }
  } catch (err) {
    console.error('handlePinCompletion network/error', err);
    showTopNotifier('Network error. Please try again.', 'error');
    if (typeof resetReauthInputs === 'function') resetReauthInputs();
  } finally {
    processing = false;
  }
    });
}


    function initReauthKeypad() {
    console.log('initReauthKeypad started');
    cacheDomRefs(); // ensure pinView & deleteReauthKey are up-to-date
    if (!pinView) {
      console.error('pinView not found in initReauthKeypad');
      return;
    }
    console.log('pinView found');

    const inputs = getReauthInputs(); // four readonly inputs in your HTML
    const keypadButtons = pinView.querySelectorAll('.reauthpin-keypad button');
    console.log('Keypad buttons found:', keypadButtons.length);
    const localDelete = pinView.querySelector('#deleteReauthKey');
    console.log('Local delete found:', !!localDelete);

    // If already bound, just reset display (no re-binding)
    if (pinView.__keypadBound) {
      console.log('Keypad already bound, resetting');
      try { resetReauthInputs(); } catch (e) {
        console.error('Error resetting in bound check:', e);
        // fallback: clear inputs UI
        inputs.forEach(i => { i.value = ''; i.classList.remove('filled'); });
      }
      return;
    }
    pinView.__keypadBound = true;
    console.log('Binding keypad');

    // Helper: refresh inputs UI from global currentPin (if your code uses it),
    // or just use inputs' own values (if your handlers update them).
    function refreshInputsUI() {
      console.log('refreshInputsUI called, currentPin:', currentPin);
      // If existing updatePinInputs() is available, prefer it
      if (typeof updatePinInputs === 'function') {
        try { 
          console.log('Calling existing updatePinInputs');
          updatePinInputs(); 
          return; 
        } catch (e) {
          console.error('Error in updatePinInputs:', e);
        }
      }
      // fallback: draw masked digits from global currentPin
      inputs.forEach((inp, idx) => {
        if (currentPin && idx < currentPin.length) {
          inp.value = '•';
          inp.classList.add('filled');
        } else {
          inp.value = '';
          inp.classList.remove('filled');
        }
      });
      console.log('UI refreshed for inputs');
    }

    // Button click wiring (overwrite handlers to avoid stacking)
    keypadButtons.forEach((btn, index) => {
      console.log('Setting up button', index, 'text:', btn.textContent.trim());
      btn.onclick = () => {
        console.log('Button clicked, index:', index);
        const raw = (btn.getAttribute('data-key') || btn.dataset.value || btn.textContent || '').trim();
        const action = (btn.getAttribute('data-action') || btn.dataset.action || '').trim();
        console.log('Button raw:', raw, 'action:', action);

        // Clear action
        if (action === 'clear' || raw.toLowerCase() === 'c') {
          console.log('Clear action');
          // prefer existing resetReauthInputs() / resetInputs if available
          if (typeof resetReauthInputs === 'function') {
            try { resetReauthInputs(); } catch (e) {
              console.error('Error in resetReauthInputs:', e);
            }
          } else if (typeof resetInputs === 'function') {
            try { resetInputs(); } catch (e) {
              console.error('Error in resetInputs:', e);
            }
          } else {
            currentPin = '';
            refreshInputsUI();
          }
          return;
        }

        // Back/delete action
        if (action === 'back' || btn.id === 'deleteReauthKey' || raw === '⌫' || raw.toLowerCase() === 'del') {
          console.log('Delete action');
          if (typeof handleDelete === 'function') {
            try { handleDelete(); } catch (e) {
              console.error('Error in handleDelete:', e);
            }
          } else {
            // fallback: remove last filled input
            if (currentPin && currentPin.length > 0) {
              currentPin = currentPin.slice(0, -1);
              console.log('CurrentPin after delete fallback:', currentPin);
              refreshInputsUI();
            } else {
              // fallback: clear last non-empty input
              const filled = Array.from(inputs).filter(i => i.value);
              if (filled.length) {
                const last = filled[filled.length - 1];
                last.value = '';
                last.classList.remove('filled');
                console.log('Cleared last input fallback');
              }
            }
          }
          return;
        }

        // Digit pressed
        if (/^[0-9]$/.test(raw)) {
          console.log('Digit pressed:', raw);
          // If your app exposes inputDigit() (that updates shared currentPin), call it
          if (typeof inputDigit === 'function') {
            try { 
              console.log('Calling existing inputDigit');
              inputDigit(raw); 
            } catch (e) { 
              console.error('Error in inputDigit:', e);
            }
            // inputDigit should call updatePinInputs() in your app; if not, refresh
            refreshInputsUI();
          } else {
            // fallback: manage currentPin locally (then try to call completion)
            if (currentPin.length < 4) {
              currentPin += raw;
              console.log('CurrentPin after add fallback:', currentPin);
              refreshInputsUI();
              if (currentPin.length === 4) {
                console.log('PIN complete in fallback, calling handlePinCompletion');
                handlePinCompletion(); // Now defined
              }
            } else {
              console.log('PIN already full, ignoring');
            }
          }
        } else {
          console.log('Non-digit button clicked:', raw);
        }
      };
    });

    // Delete key explicit click (if separate)
    if (localDelete) {
      console.log('Setting up explicit delete click');
      localDelete.onclick = () => {
        console.log('Explicit delete clicked');
        if (typeof handleDelete === 'function') {
          try { handleDelete(); } catch (e) {
            console.error('Error in explicit handleDelete:', e);
          }
        } else {
          if (currentPin.length > 0) {
            currentPin = currentPin.slice(0, -1);
            console.log('CurrentPin after explicit delete:', currentPin);
          }
          refreshInputsUI();
        }
      };
    }

    // Keyboard support: attach once
    if (!pinView.__keydownHandler) {
      console.log('Attaching keyboard handler');
      pinView.__keydownHandler = (e) => {
        console.log('Keydown in keypad:', e.key, 'pinView hidden?', pinView.classList.contains('hidden'));
        if (pinView.classList.contains('hidden')) return;
        if (/^[0-9]$/.test(e.key)) {
          console.log('Keyboard digit:', e.key);
          if (typeof inputDigit === 'function') {
            try { inputDigit(e.key); } catch (err) {
              console.error('Error in keyboard inputDigit:', err);
            }
            refreshInputsUI();
          } else {
            if (currentPin.length < 4) {
              currentPin += e.key;
              console.log('CurrentPin after keyboard add:', currentPin);
              refreshInputsUI();
              if (currentPin.length === 4) {
                handlePinCompletion(); // Now defined
              }
            }
          }
        } else if (e.key === 'Backspace') {
          console.log('Keyboard backspace');
          if (typeof handleDelete === 'function') {
            try { handleDelete(); } catch (err) {
              console.error('Error in keyboard handleDelete:', err);
            }
          } else {
            if (currentPin.length > 0) {
              currentPin = currentPin.slice(0, -1);
              console.log('CurrentPin after keyboard delete:', currentPin);
            }
            refreshInputsUI();
          }
        } else if (e.key === 'Enter') {
          console.log('Keyboard enter');
          handlePinCompletion(); // Now defined
        }
      };
      document.addEventListener('keydown', pinView.__keydownHandler);
    }

    // initial render/reset
    console.log('Initial reset in initReauthKeypad');
    try {
      if (typeof resetReauthInputs === 'function') {
        console.log('Calling existing resetReauthInputs');
        resetReauthInputs();
      }
      else {
        console.log('Defining fallback resetReauthInputs');
        resetReauthInputs = function () { 
          console.log('Fallback resetReauthInputs called');
          inputs.forEach(i => { i.value = ''; i.classList.remove('filled'); }); 
        };
      }
    } catch (e) {
      console.error('Error in initial reset:', e);
      inputs.forEach(i => { i.value = ''; i.classList.remove('filled'); });
    }
    refreshInputsUI();
    console.log('initReauthKeypad completed');
  }

  



/* -----------------------
   initReauthModal (prepares modal, binds events)
   - Prioritizes biometric login if security_bio_login is enabled
   - Instant sync: Queries localStorage directly (no reload needed)
   - Falls back to PIN if biometric not enabled or fails
   ----------------------- */
async function initReauthModal({ show = false, context = 'reauth' } = {}) {
  console.log('initReauthModal called', { show, context });
  cacheDomRefs();

  // Populate user info
  let user = null;
  try {
    const cachedUserData = localStorage.getItem('userData');
    if (cachedUserData) {
      try {
        user = JSON.parse(cachedUserData);
      } catch (e) {
        console.warn('Could not parse cached userData:', e);
      }
    }

    if (!user) {
      const session = await safeCall(__sec_getCurrentUser) || {};
      const sUser = session.user || {};
      user = {
        username: sUser.username || sUser.email || '',
        fullName: sUser.fullName || '',
        profilePicture: sUser.profilePicture || '',
        id: sUser.uid || sUser.id || '',
        hasPin: !!(sUser.hasPin || sUser.pin || localStorage.getItem('hasPin')?.toLowerCase() === 'true'),
        cachedAt: Date.now()
      };
      try { localStorage.setItem('userData', JSON.stringify(user)); } catch (e) { console.warn('Could not cache userData:', e); }
      console.log('Fresh user data populated and cached');
    }


    // bind this directly to the biometric button
async function handleBiometricButtonClick(uid, context='reauth') {
  console.log('[BIOMETRIC CLICK] handler invoked', { uid, time: new Date().toISOString(), visible: document.visibilityState });
  // MUST be immediate in user gesture: use cached options
  const opts = window.__cachedAuthOptions;
  if (!opts) {
    console.warn('[BIOMETRIC CLICK] No cached auth options — consider prefetchAuthOptionsFor() when showing modal');
    // Optionally: fall back to fetching then call get() (may fail due to lost gesture)
    return;
  }
  try {
    // Call get() synchronously in the click handler (no awaits before it)
    const assertion = await navigator.credentials.get({ publicKey: opts });
    console.log('[BIOMETRIC CLICK] navigator.credentials.get() returned', assertion);
    // then perform your normal verify flow (send assertion to server)
    // (perform verification async now)
    // --- example: process and send to /webauthn/auth/verify ---
  } catch (e) {
    console.error('[BIOMETRIC CLICK] navigator.credentials.get() error', e);
  }
}

// 🔹 Biometric button in PIN view (reauth)
setTimeout(() => {
  const bioBtn = document.getElementById('pinBiometricBtn');
  if (!bioBtn) return;

  // 🔸 Determine if biometrics enabled for login (client-side only)
  const bioLoginEnabled = ['true', '1', 'yes'].includes(
  (
    localStorage.getItem('biometricForLogin') ||
    localStorage.getItem('__sec_bioLogin') ||
    localStorage.getItem('security_bio_login') || ''
  ).toLowerCase()
);


  // Hide button if biometric not enabled
  bioBtn.style.display = bioLoginEnabled ? 'inline-flex' : 'none';
  console.log(`[reauth] Biometric button visibility: ${bioLoginEnabled ? 'shown' : 'hidden'}`);

  if (bioBtn.__bound) return; // prevent double-binding
  bioBtn.addEventListener('click', async () => {
    console.log('[reauth] Biometric button clicked (PIN modal)');

    if (!bioLoginEnabled) {
      console.warn('[reauth] Biometric login not enabled locally.');
      if (typeof safeCall === 'function' && typeof notify === 'function') {
        safeCall(notify, 'Biometric login not enabled', 'warn');
      } else {
        console.warn('Biometric login not enabled');
      }
      return;
    }

    const session = await safeCall(getSession);
    const uid = session?.user?.uid || session?.user?.id;
    if (!uid) {
      console.error('[reauth] No valid user ID for biometric reauth.');
      if (typeof safeCall === 'function' && typeof notify === 'function') {
        safeCall(notify, 'Session expired - please log in again', 'error');
      } else {
        console.error('Session expired - please log in again');
      }
      return;
    }

    try {
      console.log('[reauth] Starting biometric verification for reauth...');
      const result = await verifyBiometrics(uid, 'reauth');
      if (result?.success) {
        console.log('[reauth] Biometric verified successfully');
        if (typeof hideReauthModal === 'function') hideReauthModal();
        if (typeof onSuccessfulReauth === 'function') onSuccessfulReauth();
      } else {
        console.warn('[reauth] Biometric verification failed or cancelled', result);
        if (typeof safeCall === 'function' && typeof notify === 'function') {
          safeCall(notify, 'Biometric verification failed', 'error');
        }
      }
    } catch (err) {
      console.error('[reauth] Biometric verification error:', err);
      if (typeof safeCall === 'function' && typeof notify === 'function') {
        safeCall(notify, 'Biometric verification failed', 'error');
      }
    }
  });
  bioBtn.__bound = true;
  console.log('[reauth] pinBiometricBtn bound successfully');
}, 300);



    const displayName = user.username || (user.fullName || '').split(' ')[0] || 'User';
    if (reauthName) reauthName.textContent = displayName.charAt(0).toUpperCase() + displayName.slice(1);
    const profilePicture = user.profilePicture || localStorage.getItem('profilePicture') || '';
    if (reauthAvatar) {
      if (isValidImageSource(profilePicture)) {
        reauthAvatar.src = `${profilePicture}?v=${Date.now()}`;
        reauthAvatar.style.display = '';
        console.log('Avatar set');
      } else {
        reauthAvatar.style.display = 'none';
        console.log('Avatar hidden');
      }
    }
  } catch (e) {
    console.error('Error populating user info:', e);
  }

  // Check reauth requirements (prioritize biometric login)
  const reauthStatus = await shouldReauth(context);
  console.log('initReauthModal: Reauth status', reauthStatus);

  if (!reauthStatus.needsReauth) {
    console.log('No reauth needed');
    try { if (reauthModal) reauthModal.classList.add('hidden'); } catch (e) {}
    onSuccessfulReauth();
    return true;
  }

  // Set up views (instant sync from localStorage)
  const isBioApplicable = reauthStatus.method === 'biometric';
  try {
    if (biometricView) biometricView.style.display = isBioApplicable ? 'block' : 'none';
    if (pinView) pinView.style.display = isBioApplicable ? 'none' : 'block';
    if (switchToBiometric) switchToBiometric.style.display = localStorage.getItem('security_biom_enabled') === '1' && ('PublicKeyCredential' in window) ? '' : 'none';
    if (switchToPin) switchToPin.style.display = '';
    console.log('Views set - biometric display:', biometricView?.style.display, 'pin display:', pinView?.style.display);
  } catch (e) {
    console.error('Error setting views:', e);
  }

  // Resume lockout countdowns
  try {
    if (typeof resumeLockoutIfAny === 'function') {
      resumeLockoutIfAny();
    }
  } catch (e) {
    console.error('Error calling resumeLockoutIfAny:', e);
  }

  // Bind PIN inputs
  try {
    console.log('Binding PIN inputs');
    const inputs = getReauthInputs();
    if (typeof bindPinInputs === 'function') {
      safeCall(bindPinInputs, inputs, pinView, reauthModal, reauthAlert, reauthAlertMsg);
    } else {
      console.log('No bindPinInputs found — keypad init will be used');
    }
  } catch (e) {
    console.error('Error binding PIN inputs:', e);
  }

  // PIN form submit
  try {
    console.log('Setting up PIN form submit');
    if (pinView && !pinView.__reauthSubmitBound) {
      pinView.addEventListener('submit', async (ev) => {
        console.log('PIN form submit triggered');
        ev.preventDefault();
        const inputs = getReauthInputs();
        const pin = inputs.map(i => i.value).join('');
        if (!/^\d{4}$/.test(pin)) {
          console.log('Invalid PIN format');
          safeCall(notify, 'Invalid PIN', 'error', reauthAlert, reauthAlertMsg);
          return;
        }

        const uidInfo = await safeCall(__sec_getCurrentUser) || {};
        if (!uidInfo || !uidInfo.user || !uidInfo.user.uid) {
          console.log('No UID, forcing logout');
          safeCall(notify, 'Session error', 'error', reauthAlert, reauthAlertMsg);
          setTimeout(() => window.location.href = '/', 1500);
          return;
        }

        console.log('Calling reAuthenticateWithPin with UID:', uidInfo.user.uid);
        await safeCall(reAuthenticateWithPin, uidInfo.user.uid, pin, (success) => {
          console.log('reAuthenticateWithPin callback, success:', success);
          if (success) {
            try { if (reauthModal) reauthModal.classList.add('hidden'); } catch (e) { console.error(e); }
            resetReauthInputs();
            safeCall(__sec_getCurrentUser);
            onSuccessfulReauth();
          } else {
            resetReauthInputs();
            safeCall(notify, 'PIN authentication failed', 'error', reauthAlert, reauthAlertMsg);
          }
        });
      });
      pinView.__reauthSubmitBound = true;
      console.log('PIN submit bound');
    }
  } catch (e) {
    console.error('Error setting up PIN submit:', e);
  }

  // Delete key
  try {
    console.log('Setting up delete key');
    if (deleteReauthKey && !deleteReauthKey.__bound) {
      deleteReauthKey.addEventListener('click', () => {
        console.log('Delete key clicked');
        const inputs = getReauthInputs();
        for (let i = inputs.length - 1; i >= 0; i--) {
          if (inputs[i].value) {
            inputs[i].value = '';
            const prev = inputs[i - 1];
            if (prev && prev.focus) prev.focus();
            else inputs[i].focus();
            break;
          }
        }
      });
      deleteReauthKey.__bound = true;
    }
  } catch (e) {
    console.error('Error setting up delete key:', e);
  }

  // Biometric verify button (manual fallback)
  try {
    console.log('Setting up biometric verify button');
    if (verifyBiometricBtn && !verifyBiometricBtn.__bound) {
      verifyBiometricBtn.addEventListener('click', async () => {
        console.log('Biometric verify clicked in reauth modal');
        try {
          const session = await safeCall(__sec_getCurrentUser) || {};
          const uid = session.user ? (session.user.uid || session.user.id) : null;
          if (!uid) throw new Error('No UID available for biometric auth');

          showSlideNotification('Please authenticate with biometrics', 'info');
          const res = await startAuthentication(uid);
          if (res && res.success) {
            showSlideNotification('Biometric authentication successful', 'success');
            try { if (reauthModal) reauthModal.classList.add('hidden'); } catch (e) {}
            safeCall(__sec_getCurrentUser);
            onSuccessfulReauth();
            return;
          }
          showSlideNotification('Biometric verification failed or cancelled', 'error');
          switchViews(false);
        } catch (err) {
          console.error('Biometric error in reauth:', err);
          showSlideNotification('Biometric not available — please use PIN', 'error');
          try { if (switchToPin) switchToPin.click(); else switchViews(false); } catch (e) { console.error(e); }
        }
      });
      verifyBiometricBtn.__bound = true;
      console.log('Biometric verify button bound');
    }
  } catch (e) {
    console.error('Error setting up biometric verify button:', e);
  }

  // Switch views
  try {
    console.log('Setting up view switches');
    if (switchToPin && !switchToPin.__bound) {
      switchToPin.addEventListener('click', (ev) => { ev.preventDefault(); switchViews(false); });
      switchToPin.__bound = true;
    }
    if (switchToBiometric && !switchToBiometric.__bound) {
      switchToBiometric.addEventListener('click', (ev) => { ev.preventDefault(); switchViews(true); });
      switchToBiometric.__bound = true;
    }
  } catch (e) {
    console.error('Error setting up view switches:', e);
  }

  // Logout & forget links
  try {
    console.log('Setting up logout and forget links');
    [logoutLinkBio, logoutLinkPin].forEach((link) => {
      if (link && !link.__bound) {
        link.addEventListener('click', async (ev) => {
          ev.preventDefault();
          showLoader();
          try {
            await fetch('https://api.flexgig.com.ng/auth/logout', {
              method: 'POST',
              credentials: 'include'
            }).catch(() => {});
            localStorage.clear();
            sessionStorage.clear();
            if (window.indexedDB) {
              const dbs = await indexedDB.databases();
              dbs.forEach(db => {
                if (db.name) indexedDB.deleteDatabase(db.name);
              });
            }
            document.cookie.split(';').forEach(c => {
              document.cookie = c
                .replace(/^ +/, '')
                .replace(/=.*/, `=;expires=${new Date(0).toUTCString()};path=/`);
            });
          } catch (err) {
            console.error('Error during logout cleanup:', err);
          }
          hideLoader();
          window.location.href = '/';
        });
        link.__bound = true;
      }
    });

    [forgetPinLinkBio, forgetPinLinkPin].forEach((link) => {
      if (link && !link.__bound) {
        link.addEventListener('click', (ev) => {
          ev.preventDefault();
          try { localStorage.removeItem('reauthPending'); } catch (e) {}
          window.location.href = '/reset-pin.html';
        });
        link.__bound = true;
      }
    });
  } catch (e) {
    console.error('Error setting up logout/forget links:', e);
  }

  // Ensure keypad init
  try {
    initReauthKeypad();
  } catch (e) {
    console.error('Error calling initReauthKeypad:', e);
  }

  // Modal visibility and auto-biometric attempt (instant sync from localStorage)
  try {
    console.log('Handling modal visibility, show:', show);
    if (!show) {
      try { if (reauthModal) reauthModal.classList.add('hidden'); } catch (e) {}
      try { if (promptModal) promptModal.classList.add('hidden'); } catch (e) {}
      console.log('Modal hidden');
      return true;
    }

    try {
      localStorage.setItem('reauthPending', Date.now().toString());
    } catch (e) { console.warn('Could not set reauthPending:', e); }

    if (reauthModal) {
      reauthModal.classList.remove('hidden');
      reauthModalOpen = true;
      try { if (idleTimeout) { clearTimeout(idleTimeout); idleTimeout = null; } } catch (e) {}
      reauthModal.setAttribute('aria-modal', 'true');
      reauthModal.setAttribute('role', 'dialog');

      if (isBioApplicable) {
        // Auto-attempt biometric if enabled (instant check from localStorage)
        (async () => {
          try {
            const session = await safeCall(__sec_getCurrentUser) || {};
            const uid = session.user ? (session.user.uid || session.user.id) : null;
            if (!uid) {
              console.warn('No uid for auto-biometric verify; showing PIN fallback');
              showSlideNotification('Session expired, please log in', 'error');
              setTimeout(() => window.location.href = '/', 1500);
              return;
            }

            showSlideNotification('Please authenticate with biometrics', 'info');
            const res = await startAuthentication(uid);
            if (res && res.success) {
              console.log('Auto biometric verify success');
              showSlideNotification('Biometric authentication successful', 'success');
              try { if (reauthModal) reauthModal.classList.add('hidden'); } catch (e) {}
              safeCall(__sec_getCurrentUser);
              onSuccessfulReauth();
              return;
            }
            console.log('Auto biometric verify failed — switching to PIN');
            showSlideNotification('Biometric verification failed or cancelled', 'error');
            switchViews(false);
          } catch (err) {
            console.error('Auto biometric attempt error:', err);
            showSlideNotification('Biometric not available — please use PIN', 'error');
            try { if (switchToPin) switchToPin.click(); else switchViews(false); } catch (e) { console.error(e); }
          }
        })();
      } else {
        // Direct fallback to PIN if no biometric
        if (biometricView) biometricView.style.display = 'none';
        if (pinView) pinView.style.display = 'block';
        const firstInput = getReauthInputs()[0];
        if (firstInput) firstInput.focus();
        console.log('Showing PIN view and focusing first input');
      }

      try { trapFocus(reauthModal); } catch (e) { console.warn('trapFocus failed:', e); }
    }
    console.log('Reauth modal opened: inactivity halted');
  } catch (e) {
    console.error('Error handling visibility:', e);
  }

  console.log('initReauthModal completed');
}


  /* -----------------------
     Focus Trap for Modals (new!)
     - Prevents tab out of modal
     ----------------------- */
  function trapFocus(modal) {
    console.log('trapFocus called for modal');
    if (!modal) {
      console.log('No modal for trapFocus');
      return;
    }
    const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    console.log('Focusable elements in trap:', focusable.length);

    modal.addEventListener('keydown', (ev) => {
      if (ev.key === 'Tab') {
        if (ev.shiftKey) {
          if (document.activeElement === first) {
            ev.preventDefault();
            last.focus();
            console.log('Shift-tab wrapped to last');
          }
        } else {
          if (document.activeElement === last) {
            ev.preventDefault();
            first.focus();
            console.log('Tab wrapped to first');
          }
        }
      }
    });
  }

/* -----------------------
   Enhanced registerBiometrics (replace existing)
   - Uses server options (server.js already changed)
   - Defensive client-side enforcement (platform + required UV)
   - Persists credentialId, biometricsEnabled, biometricForLogin, biometricForTx
----------------------- */
// 🔹 NEW: Biometrics Registration (full flow)
/* -----------------------
   Register Biometrics (debug)
   ----------------------- */
// ---- Utilities used by both functions ----
function base64UrlToBuffer(base64Url) {
  let base64 = (base64Url || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) base64 += '='.repeat(4 - pad);
  const str = atob(base64);
  const buf = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
  return buf.buffer;
}
function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i] & 0xff);
  let b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Robust storage helper — writes to localStorage, sessionStorage and cookie (best-effort)
function persistCredentialId(id) {
  try {
    console.log('[CRED DEBUG] persistCredentialId: Attempting to store credentialId ->', id);
    localStorage.setItem('credentialId', id);
    sessionStorage.setItem('credentialId', id);
    // cookie fallback (expires in 1 hour), readable by same origin JS
    document.cookie = `fg_credentialId=${encodeURIComponent(id)};path=/;max-age=${60*60};SameSite=Lax`;
    const reads = {
      local: (() => { try { return localStorage.getItem('credentialId'); } catch(e){return `ERR:${e.message}`;} })(),
      session: (() => { try { return sessionStorage.getItem('credentialId'); } catch(e){return `ERR:${e.message}`;} })(),
      cookie: (() => { try { return (document.cookie.match(/(?:^|;\s*)fg_credentialId=([^;]+)/)||[])[1] || null } catch(e){return `ERR:${e.message}`;} })()
    };
    console.log('[CRED DEBUG] persistCredentialId: reads after write:', reads);
    try {
      console.assert(reads.local === id, 'localStorage did not persist credentialId!');
      console.assert(reads.session === id, 'sessionStorage did not persist credentialId!');
    } catch (assertErr) {
      console.warn('[CRED DEBUG] persistCredentialId: assertion failed (expected persistence):', assertErr);
    }
    return reads;
  } catch (err) {
    console.error('[CRED DEBUG] persistCredentialId: Unexpected storage error', err);
    return { error: err.message };
  }
}

// single helper to dump current credentialId in all locations
function dumpCredentialStorage() {
  try {
    const local = (() => { try { return localStorage.getItem('credentialId'); } catch(e){return `ERR:${e.message}`;} })();
    const session = (() => { try { return sessionStorage.getItem('credentialId'); } catch(e){return `ERR:${e.message}`;} })();
    const cookie = (() => { try { return (document.cookie.match(/(?:^|;\s*)fg_credentialId=([^;]+)/)||[])[1] || null } catch(e){return `ERR:${e.message}`;} })();
    console.log('[CRED DEBUG] dumpCredentialStorage ->', { local, session, cookie, origin: location.origin, host: location.host, time: new Date().toISOString() });
    return { local, session, cookie };
  } catch (err) {
    console.error('[CRED DEBUG] dumpCredentialStorage error', err);
    return null;
  }
}

// ---- registerBiometrics ----
async function registerBiometrics() {
  console.log('%c[registerBiometrics] CALLED', 'color:#0ff;font-weight:bold');
  return withLoader(async () => {
    try {
      if (!('PublicKeyCredential' in window)) throw new Error('WebAuthn not supported by this browser');

      console.log('[registerBiometrics] fetching session for UID...');
      const session = await safeCall(getSession);
      const uid = session?.user?.id || session?.user?.uid;
      console.log('[registerBiometrics] session =>', session ? { uid: session.user?.id || session.user?.uid, email: session.user?.email } : null);
      if (!uid) throw new Error('No user id available (session empty)');

      const apiBase = window.__SEC_API_BASE || '';
      console.log('[registerBiometrics] POST ->', `${apiBase}/webauthn/register/options`, 'body:', { userId: uid });

      const optRes = await fetch(`${apiBase}/webauthn/register/options`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid })
      });

      console.log('[registerBiometrics] Options fetch status:', optRes.status, optRes.statusText);
      const optText = await optRes.text();
      let options;
      try {
        options = JSON.parse(optText);
      } catch (e) {
        console.error('[registerBiometrics] Failed to parse options JSON:', optText);
        throw new Error('Invalid options JSON from server');
      }
      console.log('[registerBiometrics] RAW options:', options);

      if (!options.challenge) throw new Error('No challenge returned from server');

      // convert challenge + user.id + exclude credentials
      options.challenge = base64UrlToBuffer(options.challenge);
      if (options.user && options.user.id) {
        try {
          options.user.id = base64UrlToBuffer(options.user.id);
        } catch (e) {
          console.warn('[registerBiometrics] user.id conversion failed, leaving as-is', e);
        }
      }
      if (Array.isArray(options.excludeCredentials)) {
        console.log('[registerBiometrics] excludeCredentials count', options.excludeCredentials.length);
        options.excludeCredentials = options.excludeCredentials.map(c => ({ ...c, id: base64UrlToBuffer(c.id) }));
      }
      options.timeout = options.timeout || 60000;
      console.log('[registerBiometrics] Final publicKey options prepared (challenge bytes, excludeCount):', {
        challengeLen: options.challenge ? options.challenge.byteLength : null,
        excludeCount: Array.isArray(options.excludeCredentials) ? options.excludeCredentials.length : 0,
        authenticatorSelection: options.authenticatorSelection || null
      });

      console.log('%c[registerBiometrics] calling navigator.credentials.create()', 'color:yellow');
      const credential = await navigator.credentials.create({ publicKey: options });
      console.log('[registerBiometrics] navigator.credentials.create() returned:', credential);
      if (!credential) throw new Error('navigator.credentials.create() returned null');

      // build payload for server
      const credToSend = {
        id: credential.id,
        rawId: bufferToBase64Url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: bufferToBase64Url(credential.response.clientDataJSON),
          attestationObject: bufferToBase64Url(credential.response.attestationObject)
        },
        transports: credential.response.getTransports ? credential.response.getTransports() : []
      };
      console.log('[registerBiometrics] credToSend (sanitized):', {
        id: credToSend.id,
        rawIdLen: credToSend.rawId.length,
        transports: credToSend.transports
      });

      console.log('[registerBiometrics] POST ->', `${apiBase}/webauthn/register/verify`);
      const verifyRes = await fetch(`${apiBase}/webauthn/register/verify`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, credential: credToSend })
      });

      console.log('[registerBiometrics] Verify response status:', verifyRes.status);
      const verifyText = await verifyRes.text();
      let verifyJson;
      try {
        verifyJson = JSON.parse(verifyText);
      } catch (e) {
        console.error('[registerBiometrics] Failed to parse verify JSON:', verifyText);
        throw new Error('Invalid verify response from server');
      }
      console.log('[registerBiometrics] Verify server result:', verifyJson);

      // store credentialId robustly and show reads
      if (verifyJson && verifyJson.credentialId) {
        const id = verifyJson.credentialId;
        const reads = persistCredentialId(id);
        console.log('%c[registerBiometrics] STORED credentialId (server gave):', 'color:lime', id, 'readsAfter:', reads);
      } else {
        console.warn('[registerBiometrics] Server did not return credentialId');
      }

      safeCall(notify, 'Biometric registration successful!', 'success');

      // OPTIONAL: do not automatically reload in dev — comment out if causing flakiness
      // setTimeout(() => window.location.reload(), 1000);

      console.log('%c[registerBiometrics] DONE', 'color:lime');
      return { success: true, result: verifyJson };
    } catch (err) {
      console.error('%c[registerBiometrics] ERROR:', 'color:red', err);
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        return { success: false, cancelled: true, error: err.message };
      }
      safeCall(notify, `Registration failed: ${err.message || err}`, 'error');
      return { success: false, error: err.message || String(err) };
    }
  });
}



/* -----------------------
   Disable Biometrics (new!)
   - Call from settings: __reauth.disableBiometrics()
   - Revokes server-side, clears local
   ----------------------- */
  // 🔹 NEW: Disable/Revoke Biometrics
async function disableBiometrics() {
  console.log('disableBiometrics called');
  const storedId = localStorage.getItem('credentialId');
  if (!storedId) {
    console.log('disableBiometrics: No stored credentialId, nothing to revoke');
    return { success: true };
  }

  return withLoader(async () => {
    try {
      const session = await safeCall(getSession);
      const uid = session?.user?.id || session?.user?.uid;
      if (!uid) {
        console.error('disableBiometrics: no UID available');
        safeCall(notify, 'Session error - please log in again', 'error');
        setTimeout(() => window.location.href = '/', 1500);
        return { success: false };
      }

      const apiBase = window.__SEC_API_BASE || '';

      const res = await fetch(`${apiBase}/webauthn/authenticators/${uid}/revoke`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialID: storedId })
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('disableBiometrics: revoke failed', res.status, errText);
        throw new Error(errText || `Revoke failed (${res.status})`);
      }

      const result = await res.json();
      console.log('disableBiometrics: success', result);
      safeCall(notify, 'Biometrics disabled successfully', 'success');
      console.log('[DEBUG] About to remove credentialId (caller: disableBiometrics or toggle) at', new Date().toISOString());
      localStorage.removeItem('credentialId');
      return { success: true };

    } catch (err) {
      console.error('disableBiometrics error:', err);
      safeCall(notify, `Failed to disable biometrics: ${err.message || err}`, 'error');
      return { success: false, error: err.message || 'Disable failed' };
    }
  });
}

/* -----------------------
   bindBiometricSettings for role="switch" buttons
   Call: bindBiometricSettings({
     parentSelector:'#biometricsSwitch',
     childLoginSelector:'#bioLoginSwitch',
     childTxSelector:'#bioTxSwitch',
     optionsContainerSelector:'#biometricsOptions'
   });
----------------------- */
// 🔹 Bind Biometric Settings (unchanged, but now uses full register/disable)
// 🔹 Bind Biometric Settings (children = pure client-side flags, NO server/verify on toggle)
function bindBiometricSettings({
  parentSelector = '#biometricsSwitch',
  childLoginSelector = '#bioLoginSwitch',
  childTxSelector = '#bioTxSwitch',
  optionsContainerSelector = '#biometricsOptions'
} = {}) {
  const parent = document.querySelector(parentSelector);
  const childLogin = document.querySelector(childLoginSelector);
  const childTx = document.querySelector(childTxSelector);
  const optionsContainer = document.querySelector(optionsContainerSelector);

  if (!parent || !childLogin || !childTx || !optionsContainer) {
    console.warn('Biometric elements not found');
    return null;
  }

  function setOptionsVisible(visible) {
    optionsContainer.style.display = visible ? 'block' : 'none';
  }

  function readFlag(key) {
    return localStorage.getItem(key) === 'true';
  }

  function writeFlag(key, val) {
    localStorage.setItem(key, val ? 'true' : 'false');
  }

  function setSwitch(btn, on) {
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    btn.classList.toggle('active', on);
  }

  function syncFromStorage() {
    const enabled = readFlag('biometricsEnabled');
    setSwitch(parent, enabled);
    setOptionsVisible(enabled);
    if (enabled) {
      setSwitch(childLogin, readFlag('biometricForLogin'));
      setSwitch(childTx, readFlag('biometricForTx'));
    } else {
      setSwitch(childLogin, false);
      setSwitch(childTx, false);
    }
  }

  // Parent handler: Enabler (server register/revoke, auto-sets child flags)
  async function handleParentToggle(wantOn) {
    if (parent.__bioProcessing) return;
    parent.__bioProcessing = true;
    setSwitch(parent, wantOn);
    parent.disabled = true;

    try {
      await withLoader(async () => {
        if (wantOn) {
          const res = await registerBiometrics();  // Server call only here
          if (res && res.success) {
            writeFlag('biometricsEnabled', true);
            writeFlag('biometricForLogin', true);  // Auto-enable children flags
            writeFlag('biometricForTx', true);
            if (res.credentialId) {
              localStorage.setItem('credentialId', res.credentialId);
            }
            setSwitch(childLogin, true);
            setSwitch(childTx, true);
            setOptionsVisible(true);
            safeCall(notify, 'Biometrics enabled', 'success');
          } else {
            writeFlag('biometricsEnabled', false);
            setSwitch(parent, false);
            setOptionsVisible(false);
            safeCall(notify, res?.cancelled ? 'Setup cancelled' : 'Setup failed', 'info');
          }
        } else {
          const res = await disableBiometrics();  // Server revoke only here
          writeFlag('biometricsEnabled', false);
          writeFlag('biometricForLogin', false);  // Auto-disable children flags
          writeFlag('biometricForTx', false);
          console.log('[DEBUG] About to remove credentialId (caller: disableBiometrics or toggle) at', new Date().toISOString());
          localStorage.removeItem('credentialId');
          setSwitch(childLogin, false);
          setSwitch(childTx, false);
          setOptionsVisible(false);
          safeCall(notify, 'Biometrics disabled', 'info');
        }
      });
    } catch (err) {
      console.error('Parent toggle error:', err);
      writeFlag('biometricsEnabled', false);
      setSwitch(parent, false);
      setOptionsVisible(false);
      safeCall(notify, `Toggle failed: ${err.message || err}`, 'error');
    } finally {
      parent.__bioProcessing = false;
      parent.disabled = false;
      syncFromStorage();  // Refresh UI
    }
  }

  // 🔹 FIXED Child handler: Pure client-side flag toggle (NO server, NO verify, NO prompt)
  function bindChild(btn, key, label) {
    if (!btn || btn.__bioBound) return;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const cur = btn.getAttribute('aria-checked') === 'true';
      const wantOn = !cur;

      // Gate: Require parent enabled (auto-trigger if off)
      if (wantOn && !readFlag('biometricsEnabled')) {
        safeCall(notify, `${label} requires biometrics enabled first`, 'info');
        handleParentToggle(true);  // Auto-enables parent (server call here, not child)
        return;
      }

      // 🔹 PURE CLIENT-SIDE: Instant flag toggle/save (no server/verify)
      setSwitch(btn, wantOn);
      writeFlag(key, wantOn);
      console.log(`[bio] ${key} toggled to ${wantOn ? 'ON' : 'OFF'} (local only)`);
      safeCall(notify, `${label} biometrics ${wantOn ? 'enabled' : 'disabled'}`, wantOn ? 'success' : 'info');
    });

    btn.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        btn.click();
      }
    });

    btn.__bioBound = true;
  }

  // Wire parent
  if (!parent.__bioBound) {
    parent.addEventListener('click', (e) => {
      e.preventDefault();
      const currently = parent.getAttribute('aria-checked') === 'true';
      handleParentToggle(!currently);
    });
    parent.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        parent.click();
      }
    });
    parent.__bioBound = true;
  }

  // Wire children (flags only)
  bindChild(childLogin, 'biometricForLogin', 'Login');
  bindChild(childTx, 'biometricForTx', 'Transaction');

  // Sync on storage change
  window.addEventListener('storage', (e) => {
    if (['biometricsEnabled', 'biometricForLogin', 'biometricForTx', 'credentialId'].includes(e.key)) {
      setTimeout(syncFromStorage, 50);
    }
  });

  // Initial sync
  syncFromStorage();

  return { parent, childLogin, childTx, optionsContainer, syncFromStorage };
}


/* -----------------------
   Call on DOMContentLoaded with your selectors
----------------------- */
document.addEventListener('DOMContentLoaded', () => {
  // Bind using your exact IDs from the markup you pasted
  bindBiometricSettings({
    parentSelector: '#biometricsSwitch',
    childLoginSelector: '#bioLoginSwitch',
    childTxSelector: '#bioTxSwitch',
    optionsContainerSelector: '#biometricsOptions'
  });
});


  /* -----------------------
     Small helpers
     ----------------------- */
  function switchViews(toBiometric = false) {
    console.log('switchViews called, toBiometric:', toBiometric);
    try {
      if (toBiometric) {
        if (biometricView) biometricView.style.display = 'block';
        if (pinView) pinView.style.display = 'none';
        verifyBiometricBtn.focus();
        console.log('Switched to biometric');
      } else {
        if (biometricView) biometricView.style.display = 'none';
        if (pinView) pinView.style.display = 'block';
        const firstInput = getReauthInputs()[0];
        if (firstInput) firstInput.focus();
        console.log('Switched to PIN');
        // Ensure keypad is initialized on switch to PIN
        initReauthKeypad();
      }
    } catch (e) {
      console.error('Error in switchViews:', e);
    }
    resetReauthInputs();
  }

  function resetReauthInputs() {
    console.log('resetReauthInputs called');
    currentPin = ''; // Reset global PIN
    try {
      const inputs = getReauthInputs();
      inputs.forEach(inp => {
        inp.value = '';
        inp.classList.remove('filled');
      });
      console.log('Inputs reset');
    } catch (e) {
      console.error('Error in resetReauthInputs:', e);
    }
  }

  /* -----------------------
   Inactivity logic (Mobile + Desktop)
   ----------------------- */
let idleTimeout = null;
const IDLE_TIME = 15 * 1000; // 10 min in prod
const PROMPT_TIMEOUT = 5000;
const PROMPT_AUTO_CLOSE = true;
let lastActive = Date.now();
let reauthModalOpen = false; // Track if reauth is open to pause idle
try { localStorage.setItem('lastActive', String(lastActive)); } catch (e) {}

let lastResetCall = 0;
// ⚡ Loosen debounce for mobile — 500ms safer
const RESET_DEBOUNCE_MS = /Mobi|Android/i.test(navigator.userAgent) ? 500 : 150;
let __inactivitySetupDone = false;

// Reset timer
function resetIdleTimer() {
  const now = Date.now();
  if (now - lastResetCall < RESET_DEBOUNCE_MS) return;
  lastResetCall = now;

  lastActive = now;
  try { localStorage.setItem('lastActive', String(lastActive)); } catch (e) {}
  if (idleTimeout) clearTimeout(idleTimeout);

  if (!reauthModalOpen) {
    idleTimeout = setTimeout(() => {
      showInactivityPrompt();
    }, IDLE_TIME);
  }
}

// Full replacement for shouldReauth (unchanged from yours)
async function shouldReauth(context = 'reauth') {
  console.log('shouldReauth called with context:', context);
  try {
    const session = await safeCall(getSession);
    const sessionHasPin = !!(session && session.user && (session.user.hasPin || session.user.pin));
    const hasBioFlag = localStorage.getItem('biometricsEnabled')?.toLowerCase() === 'true';
    const webAuthnSupported = ('PublicKeyCredential' in window);
    const hasBio = hasBioFlag && webAuthnSupported;

    // Check context-specific biometric flags
    const bioLoginEnabled = ['true', '1', 'yes'].includes(
  (
    localStorage.getItem('biometricForLogin') ||
    localStorage.getItem('__sec_bioLogin') ||
    localStorage.getItem('security_bio_login') || ''
  ).toLowerCase()
);

    const bioTxEnabled = ['true', '1', 'yes'].includes(
      (
        localStorage.getItem('biometricForTx') ||
        localStorage.getItem('__sec_bioTx') ||
        localStorage.getItem('security_bio_tx') || ''
      ).toLowerCase()
    );
    const isBioApplicable = hasBio && (
      (context === 'login' && bioLoginEnabled) ||
      (context === 'transaction' && bioTxEnabled) ||
      (context === 'reauth' && (bioLoginEnabled || bioTxEnabled))
    );

    if (!session) {
      const fallbackHasPin = localStorage.getItem('hasPin') === 'true';
      const needs = fallbackHasPin || isBioApplicable;
      const method = isBioApplicable ? 'biometric' : (fallbackHasPin ? 'pin' : null);
      return { needsReauth: !!needs, method };
    }

    const needs = sessionHasPin || isBioApplicable;
    const method = isBioApplicable ? 'biometric' : (sessionHasPin ? 'pin' : null);
    return { needsReauth: !!needs, method };
  } catch (err) {
    console.error('shouldReauth error fallback:', err);
    const hasBio = localStorage.getItem('biometricsEnabled')?.toLowerCase() === 'true' && ('PublicKeyCredential' in window);
    const bioLoginEnabled = ['true', '1', 'yes'].includes(
      (
        localStorage.getItem('biometricForLogin') ||
        localStorage.getItem('__sec_bioLogin') ||
        localStorage.getItem('security_bio_login') || ''
      ).toLowerCase()
    );
    const bioTxEnabled = ['true', '1', 'yes'].includes(
      (
        localStorage.getItem('biometricForTx') ||
        localStorage.getItem('__sec_bioTx') ||
        localStorage.getItem('security_bio_tx') || ''
      ).toLowerCase()
    );
    const isBioApplicable = hasBio && (
      (context === 'login' && bioLoginEnabled) ||
      (context === 'transaction' && bioTxEnabled) ||
      (context === 'reauth' && (bioLoginEnabled || bioTxEnabled))
    );
    const fallbackHasPin = localStorage.getItem('hasPin')?.toLowerCase() === 'true';
    const needs = isBioApplicable || fallbackHasPin;
    const method = isBioApplicable ? 'biometric' : (fallbackHasPin ? 'pin' : null);
    return { needsReauth: !!needs, method };
  }
}

// One-time inactivity setup
async function setupInactivity() {
  if (__inactivitySetupDone) return;
  const reauthCheck = await shouldReauth();
  if (!reauthCheck.needsReauth) return;

  __inactivitySetupDone = true;

  // Events for desktop + mobile
  const events = ['mousemove', 'keydown', 'click', 'scroll'];
  const mobileEvents = ['touchstart', 'touchend', 'touchmove'];

  events.forEach(evt => document.addEventListener(evt, resetIdleTimer, { passive: true }));
  mobileEvents.forEach(evt => document.addEventListener(evt, resetIdleTimer, { passive: false }));

  // On resume, check if they expired
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const last = Number(localStorage.getItem('lastActive') || 0);
      if (Date.now() - last > IDLE_TIME) {
        showInactivityPrompt();
      } else {
        resetIdleTimer();
      }
    }
  });

  resetIdleTimer(); // start timer immediately
}

// global cache
window.__cachedAuthOptions = null;

async function prefetchAuthOptionsFor(uid, context = 'reauth') {
  try {
    const apiBase = window.__SEC_API_BASE || '';
    const credentialId = localStorage.getItem('credentialId') || null;
    const endpoint = credentialId ? '/webauthn/auth/options' : '/webauthn/auth/options/discover';
    const body = credentialId ? { userId: uid, credentialId, context } : { userId: uid, context };

    const res = await fetch(`${apiBase}${endpoint}`, {
      method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Options fetch failed ${res.status}`);

    const opts = await res.json();

    // convert challenge
    opts.challenge = (function base64ToBuf(s){
      let b = s.replace(/-/g,'+').replace(/_/g,'/');
      const pad = b.length % 4; if (pad) b += '='.repeat(4-pad);
      const str = atob(b);
      const arr = new Uint8Array(str.length);
      for(let i=0;i<str.length;i++) arr[i]=str.charCodeAt(i);
      return arr.buffer;
    })(opts.challenge);

    // convert allowCredentials if present
    if (Array.isArray(opts.allowCredentials) && opts.allowCredentials.length) {
      opts.allowCredentials = opts.allowCredentials.map(c => ({ ...c, id: (function base64ToBuf(s){
        let b = s.replace(/-/g,'+').replace(/_/g,'/');
        const pad = b.length % 4; if (pad) b += '='.repeat(4-pad);
        const str = atob(b);
        const arr = new Uint8Array(str.length);
        for(let i=0;i<str.length;i++) arr[i]=str.charCodeAt(i);
        return arr.buffer;
      })(c.id) }));
    } else {
      delete opts.allowCredentials; // ensure discoverable behavior
    }

    opts.userVerification = opts.userVerification || 'required';
    opts.timeout = opts.timeout || 60000;

    // store ready-to-use options
    window.__cachedAuthOptions = opts;
    console.log('[PREFETCH] cached auth options ready', {
      rpId: opts.rpId, allowCount: opts.allowCredentials ? opts.allowCredentials.length : 'omitted', time: new Date().toISOString()
    });
    return opts;
  } catch (e) {
    console.error('[PREFETCH] failed to fetch auth options', e);
    window.__cachedAuthOptions = null;
    throw e;
  }
}



/* -----------------------
   Verify Biometrics (new!)
   - Performs WebAuthn authentication for login or checkout
   ----------------------- */
// Full verifyBiometrics - performs navigator.credentials.get + server verify
/* -----------------------
   Verify Biometrics (patched)
   - Ensures all verifications reuse the same credential created by the parent
   - Prevents browser from prompting for “new passkey”
   ----------------------- */
/* -----------------------
   Verify Biometrics (patched)
   - Ensures all verifications reuse the same credential created by the parent
   - Prevents browser from prompting for “new passkey”
   ----------------------- */
// 🔹 Verify Biometrics (with fallback for direct prompt)
// 🔹 Verify Biometrics (fixed for direct fingerprint - conditional mediation + preventSilentAccess)
// - Uses 'conditional' mediation: auto-direct if possible, prompt otherwise (no null hangs)
// - Adds preventSilentAccess() for immediate check: forces prompt if no silent possible
// - Stores credentialId from options for specific calls next time
// - Respects all existing: discover fallback, 404 retry, conversions, server verify, errors
// 🔹 Verify Biometrics (fixed - remove preventSilentAccess to avoid hangs)
// - Uses 'conditional' mediation: auto-direct fingerprint if possible, prompt otherwise
// - Stores credentialId from options for specific calls next time
// - Respects all existing: discover fallback, 404 retry, conversions, server verify, errors
/* -----------------------
   Verify Biometrics (debug)
   ----------------------- */
// ---- verifyBiometrics ----
async function verifyBiometrics(uid, context = 'reauth') {
  console.log('%c[verifyBiometrics] CALLED', 'color:#0ff;font-weight:bold', { uid, context, origin: location.origin, time: new Date().toISOString() });
  return withLoader(async () => {
    try {
      if (!('PublicKeyCredential' in window)) throw new Error('WebAuthn not supported');
      if (!uid) throw new Error('No user ID');

      const apiBase = window.__SEC_API_BASE || '';
      // robust read
      let stored = null;
      try {
        stored = localStorage.getItem('credentialId');
      } catch (e) {
        console.warn('[verifyBiometrics] localStorage read error', e);
      }
      console.log('[verifyBiometrics] credentialId raw read:', stored, 'origin:', location.origin, 'time:', new Date().toISOString());

      let usedEndpoint = '/webauthn/auth/options';
      let body = JSON.stringify({ userId: uid, context });
      if (!stored) {
        console.warn('[verifyBiometrics] No stored credentialId — using discover endpoint');
        usedEndpoint = '/webauthn/auth/options';
        body = JSON.stringify({ userId: uid, context });
      }

      console.log('[verifyBiometrics] Fetching options from:', `${apiBase}${usedEndpoint}`, 'body:', JSON.parse(body));
      let optRes = await fetch(`${apiBase}${usedEndpoint}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body
      });

      // retry discover on 404 if we tried specific
      if (!optRes.ok && stored) {
        console.warn('[verifyBiometrics] specific options failed; retrying discover...');
        usedEndpoint = '/webauthn/auth/options';
        body = JSON.stringify({ userId: uid, context });
        optRes = await fetch(`${apiBase}${usedEndpoint}`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body
        });
      }

      if (!optRes.ok) {
        const txt = await optRes.text();
        throw new Error(`Options request failed: ${optRes.status} ${txt}`);
      }
      const options = await optRes.json();
      console.log('[verifyBiometrics] RAW server options:', options);

      // If server sent a credentialId in allowCredentials, persist it if we didn't have one
      if (!stored && options.allowCredentials && options.allowCredentials.length > 0) {
        try {
          const idFromServer = options.allowCredentials[0].id; // base64url string
          console.log('[verifyBiometrics] No stored credentialId — server suggested:', idFromServer);
          persistCredentialId(idFromServer);
          stored = idFromServer;
        } catch (e) {
          console.warn('[verifyBiometrics] failed to persist id suggested by server', e);
        }
      }

      // convert challenge and allowCredentials to ArrayBuffers
      options.challenge = base64UrlToBuffer(options.challenge);
      if (Array.isArray(options.allowCredentials) && options.allowCredentials.length) {
        options.allowCredentials = options.allowCredentials.map(c => ({ ...c, id: base64UrlToBuffer(c.id) }));
        console.log('[verifyBiometrics] Transformed allowCredentials (count):', options.allowCredentials.map(a => ({ type: a.type, idLen: a.id.byteLength })));
      } else {
        console.warn('[verifyBiometrics] No allowCredentials (discoverable path)');
        delete options.allowCredentials;
      }

      // enforce UV + timeout
      options.userVerification = 'required';
      options.timeout = options.timeout || 60000;

      // Try conditional mediation first (silent/direct if supported), then fallback to prompt
      const tryOptions = (mediation) => {
        const copy = { ...options };
        if (mediation) copy.mediation = mediation;
        return copy;
      };

      // Log final options summary
      console.log('[verifyBiometrics] Final options summary for get():', {
        challengeLen: options.challenge ? options.challenge.byteLength : null,
        allowCredentials: options.allowCredentials ? options.allowCredentials.length : 'omitted',
        userVerification: options.userVerification,
        rpId: options.rpId,
        mediation: 'conditional (first attempt)',
      });

      let assertion = null;
      // attempt 1: conditional (silent/direct)
      try {
        console.log('[verifyBiometrics] Attempting navigator.credentials.get() — conditional (silent/direct if supported)');
        assertion = await navigator.credentials.get({ publicKey: tryOptions('conditional') });
        console.log('[verifyBiometrics] conditional get() returned:', assertion);
      } catch (e) {
        console.warn('[verifyBiometrics] conditional get() threw:', e);
      }

      // if conditional yielded nothing, attempt interactive prompt (no mediation)
      if (!assertion) {
        try {
          console.log('[verifyBiometrics] Attempting navigator.credentials.get() — fallback with prompt (no mediation)');
          assertion = await navigator.credentials.get({ publicKey: tryOptions(undefined) });
          console.log('[verifyBiometrics] fallback prompt get() returned:', assertion);
        } catch (e) {
          console.error('[verifyBiometrics] Prompt attempt threw:', e);
          // final error
          throw e;
        }
      }

      if (!assertion) {
        throw new Error('No assertion returned');
      }

      // parse fields
      const credential = {
        id: assertion.id,
        rawId: bufferToBase64Url(assertion.rawId),
        type: assertion.type,
        response: {
          clientDataJSON: bufferToBase64Url(assertion.response.clientDataJSON),
          authenticatorData: bufferToBase64Url(assertion.response.authenticatorData),
          signature: bufferToBase64Url(assertion.response.signature),
          userHandle: assertion.response.userHandle ? bufferToBase64Url(assertion.response.userHandle) : null
        }
      };

      console.log('[verifyBiometrics] Processed assertion ->', {
        id: credential.id,
        rawIdLen: credential.rawId.length,
        userHandlePresent: !!credential.response.userHandle
      });

      // Send to server
      const verifyRes = await fetch(`${apiBase}/webauthn/auth/verify`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, credential, context })
      });
      console.log('[verifyBiometrics] Server verify status:', verifyRes.status);
      if (!verifyRes.ok) {
        const txt = await verifyRes.text();
        throw new Error(`Server verify failed: ${verifyRes.status} ${txt}`);
      }
      const result = await verifyRes.json();
      console.log('[verifyBiometrics] Server verification result:', result);
      showSlideNotification(notify, 'Biometric authentication successful!', 'success');
      return { success: true, result };
    } catch (err) {
      console.error('[verifyBiometrics] ERROR:', err);
      const message = err.message || 'Verification failed';
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        // NotAllowedError occurs when prompt is blocked, or user cancels, or silent attempt refused
        return { success: false, error: message };
      }
      showSlideNotification(notify, `Verification failed: ${message}`, 'error');
      return { success: false, error: message };
    }
  });
}

// Expose small debugging helpers to console
window.dumpCredentialStorage = dumpCredentialStorage;
window.persistCredentialId = persistCredentialId;



  async function setupInactivity() {
  console.log('setupInactivity called');
  if (__inactivitySetupDone) {
    console.log('Inactivity already setup');
    return;
  }

  // Check if needed *before* setting flag
  if (!(await shouldReauth())) {
    console.log('No reauth needed for inactivity');
    return;
  }

  // Only set flag and proceed if reauth is needed
  __inactivitySetupDone = true;

  const events = ['mousemove', 'keydown', 'touchstart', 'touchend', 'click', 'scroll'];
  events.forEach(evt => {
    document.addEventListener(evt, resetIdleTimer, { passive: true });
  });
  console.log('Inactivity events added');

  let lastVisibilityChange = 0;
  document.addEventListener('visibilitychange', () => {
    const now = Date.now();
    if (now - lastVisibilityChange < RESET_DEBOUNCE_MS) return;
    lastVisibilityChange = now;

    console.log('Visibility changed to:', document.visibilityState);
    if (document.visibilityState === 'visible') {
      const last = Number(localStorage.getItem('lastActive') || 0);
      if (Date.now() - last > IDLE_TIME && !reauthModalOpen) { // Don't trigger if modal open
        console.log('Idle on visible, showing prompt');
        showInactivityPrompt().catch(() => {});
      } else {
        resetIdleTimer();
      }
    } else {
      try {
        localStorage.setItem('lastHiddenAt', String(Date.now()));
      } catch (e) {
        console.error('Error setting lastHiddenAt:', e);
      }
    }
  });

  resetIdleTimer();
  console.log('setupInactivity completed');
}

  function resetIdleTimer() {
    const now = Date.now();
    if (now - lastResetCall < RESET_DEBOUNCE_MS) {
      console.log('Reset debounced');
      return;
    }
    lastResetCall = now;
    console.log('resetIdleTimer called');

    if (idleTimeout) {
      clearTimeout(idleTimeout);
      idleTimeout = null;
    }
    lastActive = now;
    try {
      localStorage.setItem('lastActive', String(lastActive));
    } catch (e) {
      console.error('Error setting lastActive:', e);
    }

    if (!reauthModalOpen) { // Only restart if no modal open
      idleTimeout = setTimeout(() => {
        console.log('Idle timeout fired');
        showInactivityPrompt().catch(() => {});
      }, IDLE_TIME);
    }
  }

  // Full showReauthModal (explicit called flow)
async function showReauthModal(context = 'reauth') {
  console.log('showReauthModal called', { context });
  cacheDomRefs();
  if (!reauthModal) {
    console.error('showReauthModal: reauthModal missing');
    return;
  }

  try {
    const reauthStatus = await shouldReauth(context);
    console.log('showReauthModal: reauthStatus', reauthStatus);

    if (!reauthStatus.needsReauth) {
      console.log('showReauthModal: no reauth required - calling success handler');
      onSuccessfulReauth();
      return;
    }

    if (reauthStatus.method === 'biometric') {
      const session = await safeCall(getSession) || {};
      const uid = session.user ? (session.user.uid || session.user.id) : null;
      if (uid) {
        const { success } = await verifyBiometrics(uid, context);
        if (success) {
          console.log('showReauthModal: biometric success');
          onSuccessfulReauth();
          return;
        }
        console.log('showReauthModal: biometric failed -> fallback to PIN modal');
        await initReauthModal({ show: true, context });
        return;
      } else {
        console.warn('showReauthModal: no session uid for biometric -> open PIN modal');
        await initReauthModal({ show: true, context });
        return;
      }
    }

    // PIN path
    await initReauthModal({ show: true, context });
  } catch (err) {
    console.error('showReauthModal error:', err);
    // Best-effort: open modal PIN view
    try {
      await initReauthModal({ show: true, context });
    } catch (e) { console.error('showReauthModal fallback error', e); }
  }
}


  async function showInactivityPrompt() {
    console.log('showInactivityPrompt called');
    if (reauthModalOpen) {
      console.log('Inactivity prompt skipped: reauth modal active');
      return;
    }
    if (!(await shouldReauth())) {
      console.log('No reauth for prompt');
      return;
    }
    cacheDomRefs();
    if (!promptModal || !yesBtn) {
      console.log('No promptModal or yesBtn, showing reauth');
      await showReauthModal();
      return;
    }
    if (!promptModal.classList.contains('hidden')) {
      console.log('Prompt already shown');
      return;
    }

    promptModal.classList.remove('hidden');
    promptModal.setAttribute('aria-modal', 'true');
    promptModal.setAttribute('role', 'dialog');
    yesBtn.focus();
    trapFocus(promptModal); // Focus trap
    console.log('Prompt shown');

    let promptTimeout = null;
    const yesHandler = () => {
      console.log('Yes handler called');
      try {
        promptModal.classList.add('hidden');
        if (promptTimeout) clearTimeout(promptTimeout);
        try {
          yesBtn.removeEventListener('click', yesHandler);
        } catch (e) {}
        resetIdleTimer();
      } catch (e) {
        console.error('Error in yesHandler:', e);
      }
    };

    try {
      yesBtn.addEventListener('click', yesHandler, { once: true });
    } catch (e) {
      console.error('Error adding yes click:', e);
    }

    // Escape key closes prompt (UX)
    const escHandler = (ev) => {
      if (ev.key === 'Escape') {
        console.log('Escape pressed in prompt');
        yesHandler();
      }
    };
    document.addEventListener('keydown', escHandler, { once: true });

    if (PROMPT_AUTO_CLOSE) {
      promptTimeout = setTimeout(async () => {
        console.log('Prompt auto-close timeout');
        if (!promptModal.classList.contains('hidden')) {
          promptModal.classList.add('hidden');
          try {
            yesBtn.removeEventListener('click', yesHandler);
          } catch (e) {}
          document.removeEventListener('keydown', escHandler);
          await showReauthModal();
        }
      }, PROMPT_TIMEOUT);
    }
  }

  async function forceInactivityCheck() {
    console.log('forceInactivityCheck called');
    if (idleTimeout) {
      clearTimeout(idleTimeout);
      idleTimeout = null;
    }
    await showInactivityPrompt();
  }

  function onSuccessfulReauth() {
    console.log('Reauth modal closed: inactivity resumed');
    console.log('onSuccessfulReauth called');
    reauthModalOpen = false; // Resume idle
    localStorage.removeItem('reauthPending'); // Clear pending flag
    try {
      cacheDomRefs();
      if (reauthModal) reauthModal.classList.add('hidden');
      if (promptModal) promptModal.classList.add('hidden');
    } catch (e) {
      console.error('Error hiding modals on success:', e);
    }
    resetIdleTimer(); // Restart idle timer
  }

  /* -----------------------
     Boot sequence
     ----------------------- */
  (async function initFlow() {
    console.log('initFlow started');
    try {
      await initReauthModal({ show: false });
    } catch (e) {
      console.error('Error in initReauthModal boot:', e);
    }
    try {
      await setupInactivity();
    } catch (e) {
      console.error('Error in setupInactivity boot:', e);
    }
    console.log('initFlow completed');
  })();

  // Expose to global scope
  // Ensure window.__reauth is an object before assigning into it
window.__reauth = window.__reauth || {};

Object.assign(window.__reauth, {
  initReauthModal,
  setupInactivity,
  forceInactivityCheck,
  onSuccessfulReauth,
  showReauthModal,
  registerBiometrics,
  disableBiometrics, // New!
  verifyBiometrics,
  triggerCheckoutReauth,
  shouldReauth
});

// Attach to window if not present (keeps your existing try/catches)
try { if (!window.initReauthModal) window.initReauthModal = initReauthModal; } catch (e) {}
try { if (!window.setupInactivity) window.setupInactivity = setupInactivity; } catch (e) {}
try { if (!window.forceInactivityCheck) window.forceInactivityCheck = forceInactivityCheck; } catch (e) {}
try { if (!window.showReauthModal) window.showReauthModal = showReauthModal; } catch (e) {}
try { if (!window.onSuccessfulReauth) window.onSuccessfulReauth = onSuccessfulReauth; } catch (e) {}
try { if (!window.registerBiometrics) window.registerBiometrics = registerBiometrics; } catch (e) {}
try { if (!window.disableBiometrics) window.disableBiometrics = disableBiometrics; } catch (e) {}

})();








  



    










  // Watch your steps
});




