const BACKEND_URL = 'https://api.flexgig.com.ng';

(() => {
  'use strict';

  // -----------------------------
  // DOM helpers and UI state
  // -----------------------------
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  const UI = {
    loginBtn: null,
    logoutBtn: null,
    userName: null,
    userEmail: null,
    userPhoto: null,
    authedSection: null,
    unauthSection: null,
    statusText: null,
    spinner: null,
  };

  function cacheUI() {
    UI.loginBtn = qs('[data-action="login"], #loginBtn, #googleLoginBtn');
    UI.logoutBtn = qs('[data-action="logout"], #logoutBtn');
    UI.userName = qs('[data-user="name"], #userName');
    UI.userEmail = qs('[data-user="email"], #userEmail');
    UI.userPhoto = qs('[data-user="photo"], #userPhoto');
    UI.authedSection = qs('[data-section="authed"], #authed');
    UI.unauthSection = qs('[data-section="unauth"], #unauth');
    UI.statusText = qs('[data-status], #statusText');
    UI.spinner = qs('[data-spinner], #spinner');
  }

  function show(el) { if (el) el.style.display = ''; }
  function hide(el) { if (el) el.style.display = 'none'; }
  function text(el, v) { if (el) el.textContent = v ?? ''; }
  function setImg(el, url, alt = '') {
    if (!el) return;
    if (url) { el.src = url; el.alt = alt; show(el); }
    else { el.removeAttribute('src'); el.alt = ''; hide(el); }
  }

  function setLoading(loading, label = '') {
    if (loading) { show(UI.spinner); text(UI.statusText, label || 'Loading...'); }
    else { hide(UI.spinner); text(UI.statusText, ''); }
  }

  // -----------------------------
  // Session helpers
  // -----------------------------
  async function getSession() {
    try {
      console.log('[DEBUG] main.js: getSession: Initiating fetch');
      const res = await fetch(`${BACKEND_URL}/api/session`, { credentials: 'include' });
      console.log('[DEBUG] main.js: getSession: Response status', res.status, 'Headers', [...res.headers]);
      if (!res.ok) {
        const text = await res.text();
        console.error('[main.js] Session API returned error:', res.status, text);
        if (res.status === 401) {
          return null; // Not signed in
        } else {
          alert('Something went wrong while loading your session. Please try again.');
        }
        return null;
      }
      const data = await res.json();
      console.log('[main.js] getSession: User data:', data.user);
      return data.user;
    } catch (err) {
      console.error('[main.js] Session fetch error:', err);
      if (!qs('#content')) {
        console.error('[ERROR] main.js: #content element not found in getSession');
        alert('Error: Page not fully loaded. Please refresh the page.');
      } else {
        console.log('Unable to reach the server. Please check your internet connection and try again.');
      }
      return null;
    }
  }

  async function ensureSignedInFromSession() {
    setLoading(true, 'Checking authentication...');
    try {
      const user = await getSession();
      if (!user) { setUnauthenticatedUI(); return null; }
      setAuthenticatedUI(user);
      return user;
    } catch (err) {
      console.error('[main.js] ensureSignedInFromSession error:', err);
      setErrorUI(err);
      return null;
    } finally {
      setLoading(false);
    }
  }

  function setAuthenticatedUI(user) {
    hide(UI.unauthSection); show(UI.authedSection);
    const name = user.username || user.fullName || 'Signed in';
    text(UI.userName, name);
    text(UI.userEmail, user.email || '');
    setImg(UI.userPhoto, user.profilePicture || '', name);
    text(UI.statusText, `Welcome${name ? `, ${name}` : ''}!`);
  }

  function setUnauthenticatedUI() {
    show(UI.unauthSection); hide(UI.authedSection);
    text(UI.userName, ''); text(UI.userEmail, '');
    setImg(UI.userPhoto, '');
    text(UI.statusText, 'You are not signed in.');
  }

  function setErrorUI(err) {
    show(UI.unauthSection); hide(UI.authedSection);
    text(UI.statusText, `Error: ${err?.message || String(err)}`);
  }

  // -----------------------------
  // Router
  // -----------------------------
  let router = null;

  function setupRouter() {
    if (!window.Navigo) {
      console.error('[main.js] Navigo is not defined.');
      return;
    }
    // Patch Navigo to ignore modal history states
    window.addEventListener("popstate", (e) => {
      if (e.state && e.state.modal) {
        console.log("[DEBUG] Navigo ignored modal popstate", e.state);
        return; // 🚫 do not let Navigo handle this one
      }
    });

    router = new Navigo('/', { hash: false });
    console.log('[DEBUG] main.js: Router initialized', { path: window.location.pathname });

    router
      .on({
        '/': async () => {
          console.log('[DEBUG] main.js: Routing to / (homepage)');
          // Check session: if signed in, auto-redirect to dashboard
          const user = await getSession();
          if (user) {
            console.log('[DEBUG] main.js: User signed in on homepage, redirecting to dashboard');
            window.location.href = '/frontend/html/dashboard.html';
            return;
          }
          // Otherwise, show homepage as-is (unauthenticated UI will be set if needed)
          await ensureSignedInFromSession();
        },
        '/auth/email': () => {
          console.log('[DEBUG] main.js: Routing to /auth/email');
          window.location.href = '/frontend/html/login.html';
        },
        '/dashboard': async () => {
          console.log('[DEBUG] main.js: Routing to /dashboard');
          // Load dashboard.html content if needed, or let browser handle
          if (!window.location.pathname.includes('dashboard.html')) {
            await loadContent('/frontend/html/dashboard.html');
          }
          // Ensure session is checked after content loads
          await ensureSignedInFromSession();
        },
        '/frontend/html/dashboard.html': async () => {
          console.log('[DEBUG] main.js: Routing to /frontend/html/dashboard.html');
          // Dashboard is already loaded by browser, just check session
          await ensureSignedInFromSession();
        }
      })
      .notFound(() => {
        console.log('[DEBUG] main.js: Not found route triggered', {
          path: window.location.pathname,
          search: window.location.search
        });
        // Only show 404 if not on dashboard
        if (!window.location.pathname.includes('dashboard.html')) {
          document.body.innerHTML = '<p>Page not found</p>';
        } else {
          console.log('[DEBUG] main.js: Skipping 404 for dashboard.html');
        }
      })
      .resolve();
  }

  // 🔹 Keep loadContent in case you use it for smaller includes later
  async function loadContent(url) {
    try {
      console.log('[DEBUG] main.js: Loading content from', url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
      document.body.innerHTML = await res.text();
      console.log('[main.js] Loaded content from', url);
    } catch (error) {
      console.error('[main.js] Error loading content:', error);
      document.body.innerHTML = '<p>Error loading page</p>';
    }
  }

  // -----------------------------
  // Actions
  // -----------------------------
  function goToGoogleAuth() { location.href = `${BACKEND_URL}/auth/google`; }
// ✅ IMPROVED: Complete client-side logout with better error handling
async function fullClientLogout() {
  try {
    console.log('[fullClientLogout] Starting complete logout process...');

    // 1️⃣ Call backend to fully logout
    try {
      const res = await fetch(`${BACKEND_URL}/auth/logout`, { 
        method: 'POST', 
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        console.warn('[fullClientLogout] Server logout failed, proceeding with client cleanup anyway');
      } else {
        const data = await res.json();
        console.log('[fullClientLogout] Server logout response:', data);
      }
    } catch (fetchErr) {
      console.error('[fullClientLogout] Server logout request failed:', fetchErr);
      // Continue with client-side cleanup regardless
    }

    // 2️⃣ Clear all frontend state
    try {
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear global variables
      window.currentUser = null;
      window.currentEmail = null;
      window.__rp_reset_token = null;
      window.__SERVER_USER_DATA__ = null; // Clear server-embedded data
      
      console.log('[fullClientLogout] Cleared storage and global state');
    } catch (storageErr) {
      console.error('[fullClientLogout] Storage clearing failed:', storageErr);
    }

    // 3️⃣ Clear IndexedDB
    try {
      if (window.indexedDB) {
        if (indexedDB.databases) {
          const dbs = await indexedDB.databases();
          for (const db of dbs) {
            if (db.name) {
              indexedDB.deleteDatabase(db.name);
              console.log('[fullClientLogout] Deleted IndexedDB:', db.name);
            }
          }
        } else {
          // Fallback for browsers that don't support indexedDB.databases()
          // Clear known database names if you have any
          const knownDBs = ['flexgig-db', 'webauthn-credentials']; // Add your DB names
          for (const dbName of knownDBs) {
            indexedDB.deleteDatabase(dbName);
          }
        }
      }
    } catch (idbErr) {
      console.error('[fullClientLogout] IndexedDB clearing failed:', idbErr);
    }

    // 4️⃣ Clear client-accessible cookies (non-HttpOnly)
    try {
      const cookies = document.cookie.split(';');
      for (let cookie of cookies) {
        const eqPos = cookie.indexOf('=');
        const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
        
        // Clear cookie for all possible paths and domains
        const domains = [
          window.location.hostname,
          '.flexgig.com.ng',
          'flexgig.com.ng',
          '.localhost',
          'localhost'
        ];
        
        const paths = ['/', '/dashboard', '/api', '/auth'];
        
        for (const domain of domains) {
          for (const path of paths) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=${path};domain=${domain}`;
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=${path}`;
          }
        }
      }
      console.log('[fullClientLogout] Cleared client-accessible cookies');
    } catch (cookieErr) {
      console.error('[fullClientLogout] Cookie clearing failed:', cookieErr);
    }

    // 5️⃣ Clear Service Workers cache (if you have any)
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
          console.log('[fullClientLogout] Unregistered service worker');
        }
      }

      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('[fullClientLogout] Cleared cache storage');
      }
    } catch (swErr) {
      console.error('[fullClientLogout] Service worker/cache clearing failed:', swErr);
    }

    // 6️⃣ Clear WebAuthn credentials from memory (if stored)
    try {
      if (window.webauthnCredentials) {
        window.webauthnCredentials = null;
      }
      console.log('[fullClientLogout] Cleared WebAuthn memory state');
    } catch (webauthnErr) {
      console.error('[fullClientLogout] WebAuthn clearing failed:', webauthnErr);
    }

    console.log('[fullClientLogout] Logout complete, redirecting to login...');

    // 7️⃣ Redirect to login (use replace to prevent back button issues)
    window.location.replace('/');

  } catch (err) {
    console.error('[fullClientLogout] Critical error during logout:', err);
    // Force redirect even if everything fails
    window.location.replace('/');
  }
}

// ✅ IMPROVED: Robust logout flow with retry and fallback
async function logoutFlow() {
  const maxRetries = 2;
  let attempt = 0;

  setLoading(true, 'Signing out...');

  while (attempt < maxRetries) {
    try {
      console.log(`[logoutFlow] Attempt ${attempt + 1}/${maxRetries}`);
      
      await fullClientLogout(); // Wait for full cleanup
      
      // If we reach here, logout succeeded
      console.log('[logoutFlow] Logout successful');
      return;
      
    } catch (e) {
      attempt++;
      console.error(`[logoutFlow] Attempt ${attempt} failed:`, e);
      
      if (attempt >= maxRetries) {
        console.error('[logoutFlow] All retry attempts exhausted');
        // Force redirect as last resort
        try {
          setLoading(false);
        } catch (_) {}
        window.location.replace('/');
        return;
      }
      
      // Wait briefly before retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}




  function bindEvents() {
    if (UI.loginBtn) UI.loginBtn.addEventListener('click', e => { e.preventDefault(); goToGoogleAuth(); });
    if (UI.logoutBtn) UI.logoutBtn.addEventListener('click', e => { e.preventDefault(); logoutFlow(); });
  }

  // -----------------------------
  // Initialization
  // -----------------------------
  async function boot() {
    cacheUI();
    bindEvents();
    setupRouter();
    // On homepage, check session immediately for auto-redirect
    if (window.location.pathname === '/' || window.location.pathname === '') {
      await ensureSignedInFromSession();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose API
  window.AppAuth = { goToGoogleAuth, logout: logoutFlow, getSession };
})();