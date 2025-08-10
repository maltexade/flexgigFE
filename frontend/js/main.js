/* main.js — Client auth flow using Firebase Custom Token from your Express session.
   Pairs with server.js that:
   - Uses Passport Google OAuth
   - Creates a Firebase custom token with Admin SDK
   - Stores it in the session and exposes /api/session

   How config is resolved:
   - Prefer window.__FIREBASE_CONFIG__ injected in your HTML
   - Else try meta tags (see getFirebaseConfig())
*/

(() => {
  'use strict';

  // -----------------------------
  // Configuration helpers
  // -----------------------------
  function getFirebaseConfig() {
    // Preferred: inject in your HTML before main.js:
    // <script>window.__FIREBASE_CONFIG__ = { apiKey:'', authDomain:'', projectId:'', appId:'', ... };</script>
    if (window.__FIREBASE_CONFIG__ && typeof window.__FIREBASE_CONFIG__ === 'object') {
      return window.__FIREBASE_CONFIG__;
    }

    // Fallback: read from meta tags if present
    // Example:
    // <meta name="firebase-api-key" content="...">
    // <meta name="firebase-auth-domain" content="...">
    // <meta name="firebase-project-id" content="...">
    // <meta name="firebase-app-id" content="...">
    const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';
    const cfg = {
      apiKey: meta('firebase-api-key'),
      authDomain: meta('firebase-auth-domain'),
      projectId: meta('firebase-project-id'),
      appId: meta('firebase-app-id'),
      // Optional:
      databaseURL: meta('firebase-database-url'),
      storageBucket: meta('firebase-storage-bucket'),
      messagingSenderId: meta('firebase-messaging-sender-id'),
      measurementId: meta('firebase-measurement-id'),
    };

    // Basic sanity check
    if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId) {
      console.error('[main.js] Missing Firebase config. Provide window.__FIREBASE_CONFIG__ or meta tags.');
      throw new Error('Firebase config not found');
    }
    return cfg;
  }

  // -----------------------------
  // Firebase loader (compat CDN)
  // -----------------------------
  // Loads compat SDK if not already present. Works with <script type="module"> or plain <script>.
  const FIREBASE_SCRIPTS = [
    'https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth-compat.js',
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function ensureFirebaseLoaded() {
    if (window.firebase?.apps) return;
    for (const src of FIREBASE_SCRIPTS) {
      // Avoid double-loading if already present
      const already = Array.from(document.scripts).some((t) => t.src === src);
      if (!already) {
        await loadScript(src);
      }
    }
  }

  // -----------------------------
  // DOM helpers and state
  // -----------------------------
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));
  const isDashboard = () => /\/dashboard(\.html)?$/i.test(location.pathname);

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
    UI.loginBtn = qs('[data-action="login"], #loginBtn');
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
  // Session + Firebase auth flow
  // -----------------------------
  let firebaseApp = null;
  let firebaseAuth = null;
  let idTokenListenerUnsub = null;

  async function initFirebase() {
    await ensureFirebaseLoaded();
    if (!window.firebase) throw new Error('Firebase failed to load');
    if (!firebaseApp) {
      firebaseApp = firebase.initializeApp(getFirebaseConfig());
      firebaseAuth = firebase.auth();
      // Prefer persistent login
      try {
        await firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      } catch (e) {
        console.warn('[main.js] setPersistence failed, defaulting to in-memory:', e?.message || e);
      }
    }
    return { app: firebaseApp, auth: firebaseAuth };
  }

  async function fetchSessionToken() {
    const res = await fetch('/api/session', {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
    });
    if (res.status === 401) return { ok: false, status: 401 };
    if (!res.ok) {
      const msg = await safeParseError(res);
      throw new Error(`Session fetch failed: ${res.status} ${msg}`);
    }
    const data = await res.json();
    if (!data?.token) throw new Error('No token in session response');
    return { ok: true, token: data.token };
  }

  async function safeParseError(res) {
    try {
      const t = await res.text();
      return t.slice(0, 200);
    } catch {
      return '';
    }
  }

  async function signInWithCustomToken(token) {
    const { auth } = await initFirebase();
    // If already signed in with same user, skip
    const current = auth.currentUser;
    if (current) {
      try {
        // Attempt to refresh to ensure validity
        await current.getIdToken(true);
        return current;
      } catch {
        // Continue to sign in fresh
      }
    }
    const cred = await auth.signInWithCustomToken(token);
    return cred.user;
  }

  async function ensureSignedInFromSession() {
    setLoading(true, 'Signing you in...');
    try {
      const { ok, token, status } = await fetchSessionToken();
      if (!ok) {
        // Not authenticated on server
        setUnauthenticatedUI();
        // On dashboard, bounce to /
        if (isDashboard()) {
          // Small delay for any UI hint before redirect
          setTimeout(() => (location.href = '/'), 400);
        }
        return null;
      }
      const user = await signInWithCustomToken(token);
      setAuthenticatedUI(user);
      subscribeIdTokenUpdates();
      return user;
    } catch (err) {
      console.error('[main.js] ensureSignedInFromSession error:', err);
      setErrorUI(err);
      return null;
    } finally {
      setLoading(false);
    }
  }

  function subscribeIdTokenUpdates() {
    const { auth } = (firebaseAuth ? { auth: firebaseAuth } : firebase);
    if (!auth) return;
    if (idTokenListenerUnsub) {
      idTokenListenerUnsub();
      idTokenListenerUnsub = null;
    }
    idTokenListenerUnsub = auth.onIdTokenChanged(async (user) => {
      if (!user) return;
      try {
        // If you need fresh token for API calls:
        const idToken = await user.getIdToken(/* forceRefresh= */ false);
        // Example: store in memory; do NOT store in localStorage for security-sensitive apps.
        window.__ID_TOKEN__ = idToken;
      } catch (e) {
        console.warn('[main.js] onIdTokenChanged error:', e?.message || e);
      }
    });
  }

  // -----------------------------
  // UI states
  // -----------------------------
  function setAuthenticatedUI(user) {
    hide(UI.unauthSection);
    show(UI.authedSection);
    const name = user.displayName || 'Signed in';
    const email = user.email || '';
    const photo = user.photoURL || '';

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
  // Actions
  // -----------------------------
  function goToGoogleAuth() {
    // Let the server handle the OAuth dance
    location.href = '/auth/google';
  }

  async function logoutFlow() {
    setLoading(true, 'Signing out...');
    try {
      // 1) Firebase sign-out (client)
      await initFirebase();
      if (firebaseAuth?.currentUser) {
        await firebaseAuth.signOut();
      }

      // 2) Try to end server session (if you add a /logout route on server)
      // This is optional-safe; will ignore failures (e.g., route not present)
      try {
        await fetch('/logout', { method: 'POST', credentials: 'include' });
      } catch {
        // no-op
      }
    } catch (e) {
      console.warn('[main.js] logout error:', e?.message || e);
    } finally {
      setLoading(false);
      // Send user to home
      location.href = '/';
    }
  }

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
  }

  // -----------------------------
  // Initialization on page load
  // -----------------------------
  async function boot() {
    cacheUI();
    bindEvents();

    // If the page has no dedicated sections, create a minimal default experience
    if (!UI.authedSection && !UI.unauthSection) {
      // Create minimal indicators
      const bar = document.createElement('div');
      bar.style.cssText = 'padding:10px;margin:10px 0;border:1px solid #ddd;border-radius:6px;font-family:system-ui, sans-serif;';
      const span = document.createElement('span');
      span.setAttribute('id', 'statusText');
      bar.appendChild(span);
      document.body.insertBefore(bar, document.body.firstChild);
      UI.statusText = span;
    }

    // Spinner default
    if (!UI.spinner) {
      const sp = document.createElement('div');
      sp.textContent = '⏳';
      sp.style.cssText = 'display:none;margin:8px 0;';
      sp.setAttribute('id', 'spinner');
      UI.spinner = sp;
      (UI.statusText?.parentElement || document.body).appendChild(sp);
    }

    // Try to sign in using session
    await ensureSignedInFromSession();
  }

  // Kick off after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // -----------------------------
  // Expose minimal API (optional)
  // -----------------------------
  window.AppAuth = {
    goToGoogleAuth,
    logout: logoutFlow,
    getCurrentUser: () => firebaseAuth?.currentUser || null,
    getIdToken: async (force = false) => {
      if (!firebaseAuth?.currentUser) return null;
      return firebaseAuth.currentUser.getIdToken(!!force);
    },
  };
})();








console.log('main.js: Starting execution');

try {
  console.log('main.js: Initializing Firebase');
  // Using firebaseConfig from getFirebaseConfig()
  try {
    if (typeof firebase !== 'undefined') {
      firebase.initializeApp(firebaseConfig);
      console.log('main.js: Firebase initialized successfully');
    } else {
      console.error('main.js: Firebase SDK not loaded');
    }
  } catch (error) {
    console.error('main.js: Firebase init error:', error);
  }

  let deferredPrompt = null;
  let modalMode = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    console.log('main.js: beforeinstallprompt event fired:', e);
    e.preventDefault();
    deferredPrompt = e;
    const openBtn = document.querySelector('.install-app-button');
    if (openBtn) {
      console.log('main.js: Setting install button display to flex');
      openBtn.style.display = 'flex';
    }
  });

  window.addEventListener('appinstalled', () => {
    console.log('main.js: PWA installed successfully');
    deferredPrompt = null;
  });

  function showInstallProgress(show) {
    console.log(`main.js: Toggling install progress: ${show}`);
    document.getElementById('install-progress').classList.toggle('hidden', !show);
    document.getElementById('install-app-confirm-desktop')?.classList.toggle('hidden', show);
    document.getElementById('install-app-cancel-desktop')?.classList.toggle('hidden', show);
    document.getElementById('install-app-confirm-mobile')?.classList.toggle('hidden', show);
  }

  function showInstallSuccess() {
    console.log('main.js: Showing install success');
    document.getElementById('install-progress').classList.add('hidden');
    document.getElementById('install-success').classList.remove('hidden');
  }

  function hideInstallSuccessUI() {
    console.log('main.js: Hiding install success UI');
    document.getElementById('install-progress').classList.add('hidden');
    document.getElementById('install-success').classList.add('hidden');
    document.getElementById('install-app-confirm-desktop')?.classList.remove('hidden');
    document.getElementById('install-app-cancel-desktop')?.classList.remove('hidden');
    document.getElementById('install-app-confirm-mobile')?.classList.remove('hidden');
  }

  function isDesktopOrTablet() {
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    console.log(`main.js: isDesktopOrTablet: ${isDesktop}`);
    return isDesktop;
  }

  function updateModalBox() {
    console.log(`main.js: Updating modal box to ${modalMode}`);
    const mob = document.getElementById('install-modal-mobile');
    const desk = document.getElementById('install-modal-desktop');
    if (modalMode === 'desktop') {
      if (mob) mob.classList.add('hidden');
      if (desk) {
        desk.classList.remove('hidden');
        desk.classList.add('flex');
        setTimeout(() => desk.classList.add('show'), 10);
      }
    } else {
      if (desk) {
        desk.classList.add('hidden');
        desk.classList.remove('flex');
        desk.classList.remove('show');
      }
      if (mob) mob.classList.remove('hidden');
    }
  }

  function showInstallModal() {
    console.log('main.js: Showing install modal');
    modalMode = isDesktopOrTablet() ? 'desktop' : 'mobile';
    document.getElementById('install-modal').classList.remove('hidden');
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    updateModalBox();
    hideInstallSuccessUI();
  }

  function hideInstallModal() {
    console.log('main.js: Hiding install modal');
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    hideInstallSuccessUI();
    const modalBackdrop = document.getElementById('install-modal');
    if (modalMode === 'desktop') {
      const desk = document.getElementById('install-modal-desktop');
      desk.classList.remove('show');
      setTimeout(() => {
        modalBackdrop.classList.add('hidden');
        modalMode = null;
      }, 300);
    } else {
      setTimeout(() => {
        modalBackdrop.classList.add('hidden');
        modalMode = null;
      }, 300);
    }
  }

  function showEmailLoginModal() {
    console.log('main.js: Showing email login modal');
    document.getElementById('email-login-modal').classList.remove('hidden');
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
  }

  function hideEmailLoginModal() {
    console.log('main.js: Hiding email login modal');
    document.getElementById('email-login-modal').classList.add('hidden');
    document.getElementById('email-error').classList.add('hidden');
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
  }

  document.addEventListener('DOMContentLoaded', () => {
    console.log('main.js: DOMContentLoaded fired');

    const openBtn = document.querySelector('.install-app-button');
    if (openBtn) {
      console.log('main.js: Setting install button display to flex');
      openBtn.style.display = 'flex';
      openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('main.js: Install button clicked');
        showInstallModal();
      });
    } else {
      console.error('main.js: Install button not found');
    }

    const emailLoginBtn = document.getElementById('email-login-button');
    if (emailLoginBtn) {
      emailLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('main.js: Email login button clicked');
        showEmailLoginModal();
      });
    } else {
      console.error('main.js: Email login button not found');
    }

    const emailLoginForm = document.getElementById('email-login-form');
    if (emailLoginForm) {
      emailLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('main.js: Email login form submitted');
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorElement = document.getElementById('email-error');
        try {
          if (typeof firebase !== 'undefined' && firebase.auth) {
            console.log('main.js: Attempting Firebase email sign-in');
            const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
            console.log('main.js: Email sign-in successful:', userCredential.user.uid);
            hideEmailLoginModal();
            window.location.href = '/dashboard.html?token=' + await userCredential.user.getIdToken();
          } else {
            console.error('main.js: Firebase auth not loaded');
            errorElement.textContent = 'Authentication service unavailable. Please try again later.';
            errorElement.classList.remove('hidden');
          }
        } catch (error) {
          console.error('main.js: Email sign-in error:', error);
          errorElement.textContent = error.message;
          errorElement.classList.remove('hidden');
        }
      });
    }

    const emailCancelBtn = document.getElementById('email-login-cancel');
    if (emailCancelBtn) {
      emailCancelBtn.addEventListener('click', () => {
        console.log('main.js: Email login cancel clicked');
        hideEmailLoginModal();
      });
    }

    const modalBackdrop = document.getElementById('install-modal');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) {
          console.log('main.js: Modal backdrop clicked, closing modal');
          hideInstallModal();
        }
      });
    }

    const confirmBtnMobile = document.getElementById('install-app-confirm-mobile');
    if (confirmBtnMobile) {
      confirmBtnMobile.addEventListener('click', async () => {
        console.log('main.js: Mobile confirm clicked, deferredPrompt:', deferredPrompt);
        if (!('serviceWorker' in navigator && 'BeforeInstallPromptEvent' in window)) {
          console.error('main.js: Browser does not support PWA installation');
          alert('This browser does not support app installation. Try Chrome or Edge on an HTTPS connection.');
          return;
        }
        if (deferredPrompt) {
          console.log('main.js: Showing install prompt');
          showInstallProgress(true);
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          console.log('main.js: Install prompt outcome:', outcome);
          deferredPrompt = null;
          setTimeout(() => {
            showInstallProgress(false);
            if (outcome === 'accepted') {
              console.log('main.js: User accepted install prompt');
              showInstallSuccess();
            } else {
              console.log('main.js: User dismissed install prompt');
            }
          }, 600);
        } else {
          console.error('main.js: No deferredPrompt available');
          alert('Installation not available. Please try again or ensure you are using Chrome with HTTPS.');
        }
      });
    }

    const confirmBtnDesktop = document.getElementById('install-app-confirm-desktop');
    if (confirmBtnDesktop) {
      confirmBtnDesktop.addEventListener('click', async () => {
        console.log('main.js: Desktop confirm clicked, deferredPrompt:', deferredPrompt);
        if (!('serviceWorker' in navigator && 'BeforeInstallPromptEvent' in window)) {
          console.error('main.js: Browser does not support PWA installation');
          alert('This browser does not support app installation. Try Chrome or Edge on an HTTPS connection.');
          return;
        }
        if (deferredPrompt) {
          console.log('main.js: Showing install prompt');
          showInstallProgress(true);
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          console.log('main.js: Install prompt outcome:', outcome);
          deferredPrompt = null;
          setTimeout(() => {
            showInstallProgress(false);
            if (outcome === 'accepted') {
              console.log('main.js: User accepted install prompt');
              showInstallSuccess();
            } else {
              console.log('main.js: User dismissed install prompt');
            }
          }, 600);
        } else {
          console.error('main.js: No deferredPrompt available');
          alert('Installation not available. Please try again or ensure you are using Chrome with HTTPS.');
        }
      });
    }

    const cancelBtnDesktop = document.getElementById('install-app-cancel-desktop');
    if (cancelBtnDesktop) {
      cancelBtnDesktop.addEventListener('click', () => {
        console.log('main.js: Desktop cancel clicked');
        hideInstallModal();
      });
    }

    const box = document.getElementById('install-modal-mobile');
    const handle = document.getElementById('modal-drag-handle');
    if (handle && box) {
      let startY = null, isDragging = false;
      handle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        console.log('main.js: Touch start:', e.touches[0].clientY);
        isDragging = true;
        startY = e.touches[0].clientY;
        box.style.transition = 'none';
      });
      handle.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        let dy = Math.max(0, e.touches[0].clientY - startY);
        console.log('main.js: Touch move:', dy);
        box.style.transform = `translateY(${dy}px)`;
      });
      handle.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        let dy = Math.max(0, e.changedTouches[0].clientY - startY);
        console.log('main.js: Touch end:', dy);
        isDragging = false;
        box.style.transition = 'transform .25s';
        if (dy > 100) {
          console.log('main.js: Drag-to-close triggered');
          hideInstallModal();
          setTimeout(() => { box.style.transform = ''; }, 250);
        } else {
          console.log('main.js: Resetting mobile modal transform');
          box.style.transform = '';
        }
      });
    }
  });

  window.addEventListener('resize', () => {
    const modal = document.getElementById('install-modal');
    if (!modal.classList.contains('hidden')) {
      console.log('main.js: Window resized, updating modal box');
      updateModalBox();
    }
  });
} catch (error) {
  console.error('main.js: Uncaught error:', error);
}