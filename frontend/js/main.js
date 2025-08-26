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
        window.location.href = '/frontend/html/login.html';
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
      alert('Unable to reach the server. Please check your internet connection and try again.');
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
  router = new Navigo('/', { hash: false });
  console.log('[DEBUG] main.js: Router initialized', { path: window.location.pathname });

  router
    .on({
      '/': () => {
        console.log('[DEBUG] main.js: Routing to /');
        const content = qs('#content');
        if (!content) {
          console.error('[ERROR] main.js: #content element not found for / route');
          document.body.innerHTML = '<p>Error: Content container not found</p>';
          return;
        }
        loadContent('/frontend/html/login.html');
      },
      '/auth/email': () => {
        console.log('[DEBUG] main.js: Routing to /auth/email');
        window.location.href = '/frontend/html/login.html';
      },
      '/dashboard': async () => {
        console.log('[DEBUG] main.js: Routing to /dashboard');
        const content = qs('#content');
        if (!content) {
          console.error('[ERROR] main.js: #content element not found for /dashboard');
          document.body.innerHTML = '<p>Error: Content container not found</p>';
          return;
        }
        const user = await ensureSignedInFromSession();
        if (user) {
          await loadContent('/frontend/html/dashboard.html');
          document.addEventListener('contentLoaded', () => {
            console.log('[DEBUG] main.js: contentLoaded event triggered for dashboard');
            if (window.getSession) {
              window.getSession();
            } else {
              console.warn('[WARN] main.js: window.getSession not found');
            }
          }, { once: true });
        } else {
          console.log('[DEBUG] main.js: No user session, redirecting to login');
          window.location.href = '/frontend/html/login.html';
        }
      },
      '/frontend/html/dashboard.html': () => {
        console.log('[DEBUG] main.js: Routing to /frontend/html/dashboard.html (fallback)');
        router.navigate('/dashboard');
      }
    })
    .notFound(() => {
      console.log('[DEBUG] main.js: Not found route triggered', { path: window.location.pathname, search: window.location.search });
      const content = qs('#content');
      if (content) {
        content.innerHTML = '<p>Page not found</p>';
      } else {
        console.error('[main.js] #content element not found for notFound route');
        if (window.location.pathname.includes('dashboard.html')) {
          console.log('[DEBUG] main.js: Redirecting to /dashboard for dashboard.html');
          router.navigate('/dashboard');
        } else {
          document.body.innerHTML = '<p>Page not found</p>';
        }
      }
    })
    .resolve();
}

  async function loadContent(url) {
  const content = qs('#content');
  if (!content) {
    console.error('[main.js] loadContent: #content element not found');
    document.body.innerHTML = '<p>Error: Content container not found</p>';
    return;
  }
  try {
    console.log('[DEBUG] main.js: Loading content from', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    content.innerHTML = await res.text();
    console.log('[main.js] Loaded content from', url);
    // Dispatch event to signal content load
    document.dispatchEvent(new Event('contentLoaded'));
  } catch (error) {
    console.error('[main.js] Error loading content:', error);
    content.innerHTML = '<p>Error loading page</p>';
  }
}

  // -----------------------------
  // Actions
  // -----------------------------
  function goToGoogleAuth() { location.href = `${BACKEND_URL}/auth/google`; }

  async function logoutFlow() {
    setLoading(true, 'Signing out...');
    try {
      await fetch(`${BACKEND_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (e) {
      console.warn('[main.js] logout error:', e);
    } finally {
      setLoading(false);
      localStorage.clear();
      location.href = '/';
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
    await ensureSignedInFromSession();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose API
  window.AppAuth = { goToGoogleAuth, logout: logoutFlow, getSession };
})();