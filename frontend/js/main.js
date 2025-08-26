const BACKEND_URL = 'https://api.flexgig.com.ng';

(() => {
  'use strict';

  // -----------------------------
  // Session helpers
  // -----------------------------
  async function getSession() {
    if (!window.location.pathname.includes('/dashboard')) {
      console.log('[main.js] getSession: Skipped on non-dashboard page:', window.location.pathname);
      return null;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/session`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Session fetch failed: ${res.status} ${await safeParseError(res)}`);
      }
      const data = await res.json();
      localStorage.setItem('accessToken', data.token);
      console.log('[main.js] getSession: Session fetched, token:', data.token);
      return data.user;
    } catch (err) {
      console.error('[main.js] getSession error:', err);
      if (window.location.pathname.includes('/dashboard')) {
        openPinModalForReauth();
      }
      throw err;
    }
  }

  function openPinModalForReauth() {
    const event = new CustomEvent('openPinModalForReauth');
    document.dispatchEvent(event);
  }

  async function safeParseError(res) {
    try {
      const t = await res.text();
      return t.slice(0, 200);
    } catch {
      return '';
    }
  }

  async function ensureSignedInFromSession() {
    setLoading(true, 'Checking authentication...');
    try {
      const user = await getSession();
      if (!user) {
        console.log('[main.js] No session, setting unauthenticated UI');
        setUnauthenticatedUI();
        return null;
      }
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

  // -----------------------------
  // DOM helpers and state
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

  function show(el) {
    if (el) el.style.display = '';
  }
  function hide(el) {
    if (el) el.style.display = 'none';
  }
  function text(el, v) {
    if (el) el.textContent = v ?? '';
  }
  function setImg(el, url, alt = '') {
    if (!el) return;
    if (url) {
      el.src = url;
      el.alt = alt;
      show(el);
    } else {
      el.removeAttribute('src');
      el.alt = '';
      hide(el);
    }
  }

  function setLoading(loading, label = '') {
    if (loading) {
      show(UI.spinner);
      text(UI.statusText, label || 'Loading...');
    } else {
      hide(UI.spinner);
      text(UI.statusText, '');
    }
  }

  // -----------------------------
  // UI states
  // -----------------------------
  function setAuthenticatedUI(user) {
    hide(UI.unauthSection);
    show(UI.authedSection);
    const name = user.username || user.fullName || 'Signed in';
    const email = user.email || '';
    const photo = user.profilePicture || '';
    text(UI.userName, name);
    text(UI.userEmail, email);
    setImg(UI.userPhoto, photo, name);
    text(UI.statusText, `Welcome${name ? `, ${name}` : ''}!`);
  }

  function setUnauthenticatedUI() {
    show(UI.unauthSection);
    hide(UI.authedSection);
    setImg(UI.userPhoto, '');
    text(UI.userName, '');
    text(UI.userEmail, '');
    text(UI.statusText, 'You are not signed in.');
  }

  function setErrorUI(err) {
    show(UI.unauthSection);
    hide(UI.authedSection);
    const msg = err?.message || String(err) || 'Unknown error';
    text(UI.statusText, `Error: ${msg}`);
  }

  // -----------------------------
  // Router
  // -----------------------------
  let router = null;

  async function loadContent(url) {
    const content = qs('#content');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
      content.innerHTML = await res.text();
      console.log(`[main.js] Loaded content from ${url}`);
    } catch (error) {
      console.error('[main.js] Error loading content:', error);
      content.innerHTML = '<p>Error loading page</p>';
    }
  }

  function setupRouter() {
    if (!window.Navigo) {
      console.error('[main.js] Navigo is not defined. Ensure Navigo is loaded via CDN.');
      window.location.href = '/frontend/html/login.html';
      return;
    }
    router = new Navigo('/', { hash: false });
    router
      .on({
        '/': () => {
          console.log('[main.js] Routing to home');
        },
        '/auth/email': () => {
          console.log('[main.js] Routing to email login');
          window.location.href = '/frontend/html/login.html';
        },
        '/dashboard': async () => {
          console.log('[main.js] Routing to dashboard');
          try {
            const user = await getSession();
            if (!user) {
              console.log('[main.js] No session, redirecting to login');
              window.location.href = '/frontend/html/login.html';
              return;
            }
            loadContent('/frontend/html/dashboard.html');
          } catch (err) {
            console.error('[main.js] Dashboard route error:', err);
            window.location.href = '/frontend/html/login.html';
          }
        },
      })
      .notFound(() => {
        console.log('[main.js] Route not found');
        qs('#content').innerHTML = '<p>Page not found</p>';
      })
      .resolve();
  }

  // -----------------------------
  // Actions
  // -----------------------------
  function goToGoogleAuth() {
    console.log('[main.js] Initiating Google auth redirect');
    location.href = `${BACKEND_URL}/auth/google`;
  }

  async function logoutFlow() {
    setLoading(true, 'Signing out...');
    try {
      await fetch(`${BACKEND_URL}/logout`, { method: 'POST', credentials: 'include' });
      console.log('[main.js] Server session ended');
    } catch (e) {
      console.warn('[main.js] logout error:', e?.message || e);
    } finally {
      setLoading(false);
      location.href = '/';
    }
  }

  // -----------------------------
  // Event bindings
  // -----------------------------
  function bindEvents() {
    if (UI.loginBtn) {
      UI.loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        goToGoogleAuth();
      });
    }
    if (UI.logoutBtn) {
      UI.logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logoutFlow();
      });
    }
    const emailNavBtn = document.getElementById('emailLoginBtn');
    if (emailNavBtn) {
      emailNavBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('[main.js] Email login button clicked, navigating to /auth/email');
        if (router) {
          router.navigate('/auth/email');
        } else {
          window.location.href = '/frontend/html/login.html';
        }
      });
    }
  }

  // -----------------------------
  // Initialization on page load
  // -----------------------------
  async function boot() {
    cacheUI();
    bindEvents();
    setupRouter();
    if (!UI.authedSection && !UI.unauthSection) {
      const bar = document.createElement('div');
      bar.id = 'auth-container';
      bar.style.cssText = 'padding:10px;margin:10px 0;border:1px solid #ddd;border-radius:6px;font-family:system-ui, sans-serif;';
      const span = document.createElement('span');
      span.setAttribute('id', 'statusText');
      bar.appendChild(span);
      document.body.insertBefore(bar, document.body.firstChild);
      UI.statusText = span;
    }
    if (!UI.spinner) {
      const sp = document.createElement('div');
      sp.textContent = '⏳';
      sp.style.cssText = 'display:none;margin:8px 0;';
      sp.setAttribute('id', 'spinner');
      UI.spinner = sp;
      (UI.statusText?.parentElement || document.body).appendChild(sp);
    }
    await ensureSignedInFromSession();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // -----------------------------
  // Expose minimal API
  // -----------------------------
  window.AppAuth = {
    goToGoogleAuth,
    logout: logoutFlow,
    getSession,
  };
})();
