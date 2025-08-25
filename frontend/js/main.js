const BACKEND_URL = 'https://api.flexgig.com.ng';

(() => {
  'use strict';

  // -----------------------------
  // Configuration helpers
  // -----------------------------
  function getFirebaseConfig() {
    if (window.__FIREBASE_CONFIG__ && typeof window.__FIREBASE_CONFIG__ === 'object') {
      return window.__FIREBASE_CONFIG__;
    }
    const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';
    const cfg = {
      apiKey: meta('firebase-api-key'),
      authDomain: meta('firebase-auth-domain'),
      projectId: meta('firebase-project-id'),
      appId: meta('firebase-app-id'),
      databaseURL: meta('firebase-database-url'),
      storageBucket: meta('firebase-storage-bucket'),
      messagingSenderId: meta('firebase-messaging-sender-id'),
      measurementId: meta('firebase-measurement-id'),
    };
    if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId) {
      console.error('[main.js] Missing Firebase config.');
      throw new Error('Firebase config not found');
    }
    return cfg;
  }

  // -----------------------------
  // Firebase loader
  // -----------------------------
  const FIREBASE_SCRIPTS = [
    'https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.4/firebase-analytics-compat.js',
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => {
        console.log(`[main.js] Loaded script: ${src}`);
        resolve();
      };
      s.onerror = () => {
        console.error(`[main.js] Failed to load script: ${src}`);
        reject(new Error(`Failed to load ${src}`));
      };
      document.head.appendChild(s);
    });
  }

  async function ensureFirebaseLoaded() {
    if (window.firebase?.apps) {
      console.log('[main.js] Firebase already loaded');
      return;
    }
    try {
      for (const src of FIREBASE_SCRIPTS) {
        const already = Array.from(document.scripts).some((t) => t.src === src);
        if (!already) await loadScript(src);
      }
      console.log('[main.js] All Firebase scripts loaded');
    } catch (error) {
      console.error('[main.js] Error loading Firebase scripts:', error);
      throw error;
    }
  }

  // -----------------------------
  // Firebase initialization
  // -----------------------------
  let firebaseApp = null;
  let firebaseAuth = null;
  let idTokenListenerUnsub = null;

  async function initFirebase() {
    await ensureFirebaseLoaded();
    if (!window.firebase) throw new Error('Firebase failed to load');
    if (!firebaseApp) {
      try {
        firebaseApp = firebase.initializeApp(getFirebaseConfig());
        firebaseAuth = firebase.auth ? firebase.auth() : null;
        if (firebaseAuth) {
          await firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
          console.log('[main.js] Firebase persistence set to LOCAL');
        }
      } catch (error) {
        console.error('[main.js] Firebase init error:', error);
        throw error;
      }
    }
    return { app: firebaseApp, auth: firebaseAuth };
  }

  async function fetchSessionToken() {
    try {
      const res = await fetch('https://api.flexgig.com.ng/api/session', { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Session fetch failed: ${res.status} ${await res.text()}`);
      }
      const data = await res.json();
      // Store access token or user data as needed
      localStorage.setItem('accessToken', data.token);
      return data.user; // Return user data for frontend use
    } catch (err) {
      console.error('[main.js] fetchSessionToken error:', err);
      // Optional: Show user-friendly message before redirect
      alert('Session expired. Please log in again.');
      window.location.href = '/';
      throw err;
    }
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
    const current = auth.currentUser;
    if (current) {
      try {
        await current.getIdToken(true);
        console.log('[main.js] Existing user token refreshed');
        return current;
      } catch {
        // Continue to sign in fresh
      }
    }
    const cred = await auth.signInWithCustomToken(token);
    console.log('[main.js] Signed in with custom token:', cred.user.uid);
    return cred.user;
  }

  async function ensureSignedInFromSession() {
    setLoading(true, 'Checking authentication...');
    try {
      const { ok, token, status } = await fetchSessionToken();
      if (!ok) {
        console.log('[main.js] No server session, setting unauthenticated UI');
        setUnauthenticatedUI();
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
    if (!firebaseAuth) return;
    if (idTokenListenerUnsub) idTokenListenerUnsub();
    idTokenListenerUnsub = firebaseAuth.onIdTokenChanged(async (user) => {
      if (!user) return;
      try {
        const idToken = await user.getIdToken(false);
        window.__ID_TOKEN__ = idToken;
        console.log('[main.js] ID token updated');
      } catch (e) {
        console.warn('[main.js] onIdTokenChanged error:', e?.message || e);
      }
    });
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
      window.location.href = '/frontend/html/login.html'; // Fallback
      return;
    }
    router = new Navigo('/', { hash: false });
    router
      .on({
        '/': () => {
          console.log('[main.js] Routing to home');
          // index.html is already loaded
        },
        '/auth/email': () => {
          console.log('[main.js] Routing to email login');
          window.location.href = '/frontend/html/login.html';
        },
        '/dashboard': () => {
          console.log('[main.js] Routing to dashboard');
          if (!localStorage.getItem('accessToken')) {
            console.log('[main.js] No token, redirecting to login');
            window.location.href = '/frontend/html/login.html';
          } else {
            loadContent('/frontend/html/dashboard.html');
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
      if (firebaseAuth?.currentUser) {
        await firebaseAuth.signOut();
        console.log('[main.js] Firebase sign-out successful');
      }
      try {
        await fetch('/logout', { method: 'POST', credentials: 'include' });
        console.log('[main.js] Server session ended');
      } catch {
        console.warn('[main.js] Server logout endpoint not available');
      }
    } catch (e) {
      console.warn('[main.js] logout error:', e?.message || e);
    } finally {
      setLoading(false);
      location.href = '/';
    }
  }

  // -----------------------------
  // PWA and modal handling
  // -----------------------------
  let deferredPrompt = null;
  let modalMode = null;

  function showInstallProgress(show) {
    console.log(`[main.js] Toggling install progress: ${show}`);
    const progress = document.getElementById('install-progress');
    const confirmDesktop = document.getElementById('install-app-confirm-desktop');
    const cancelDesktop = document.getElementById('install-app-cancel-desktop');
    const confirmMobile = document.getElementById('install-app-confirm-mobile');
    if (progress) progress.classList.toggle('hidden', !show);
    if (confirmDesktop) confirmDesktop.classList.toggle('hidden', show);
    if (cancelDesktop) cancelDesktop.classList.toggle('hidden', show);
    if (confirmMobile) confirmMobile.classList.toggle('hidden', show);
  }

  function showInstallSuccess() {
    console.log('[main.js] Showing install success');
    const progress = document.getElementById('install-progress');
    const success = document.getElementById('install-success');
    if (progress) progress.classList.add('hidden');
    if (success) success.classList.remove('hidden');
  }

  function hideInstallSuccessUI() {
    console.log('[main.js] Hiding install success UI');
    const progress = document.getElementById('install-progress');
    const success = document.getElementById('install-success');
    const confirmDesktop = document.getElementById('install-app-confirm-desktop');
    const cancelDesktop = document.getElementById('install-app-cancel-desktop');
    const confirmMobile = document.getElementById('install-app-confirm-mobile');
    if (progress) progress.classList.add('hidden');
    if (success) success.classList.add('hidden');
    if (confirmDesktop) confirmDesktop.classList.remove('hidden');
    if (cancelDesktop) cancelDesktop.classList.remove('hidden');
    if (confirmMobile) confirmMobile.classList.remove('hidden');
  }

  function isDesktopOrTablet() {
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    console.log(`[main.js] isDesktopOrTablet: ${isDesktop}`);
    return isDesktop;
  }

  function updateModalBox() {
    console.log(`[main.js] Updating modal box to ${modalMode}`);
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
    console.log('[main.js] Showing install modal');
    modalMode = isDesktopOrTablet() ? 'desktop' : 'mobile';
    const modal = document.getElementById('install-modal');
    if (modal) {
      modal.classList.remove('hidden');
      document.body.classList.add('modal-open');
      document.body.style.overflow = 'hidden';
      updateModalBox();
      hideInstallSuccessUI();
    }
  }

  function hideInstallModal() {
    console.log('[main.js] Hiding install modal');
    const modalBackdrop = document.getElementById('install-modal');
    const desk = document.getElementById('install-modal-desktop');
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    hideInstallSuccessUI();
    if (modalMode === 'desktop' && desk) {
      desk.classList.remove('show');
      setTimeout(() => {
        if (modalBackdrop) modalBackdrop.classList.add('hidden');
        modalMode = null;
      }, 300);
    } else {
      setTimeout(() => {
        if (modalBackdrop) modalBackdrop.classList.add('hidden');
        modalMode = null;
      }, 300);
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
          console.warn('[main.js] Router not initialized, falling back to direct navigation');
          window.location.href = '/frontend/html/login.html';
        }
      });
    }
    const openBtn = document.querySelector('.install-app-button');
    if (openBtn) {
      console.log('[main.js] Setting install button display to flex');
      openBtn.style.display = 'flex';
      openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('[main.js] Install button clicked');
        showInstallModal();
      });
    }
    const modalBackdrop = document.getElementById('install-modal');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) {
          console.log('[main.js] Modal backdrop clicked, closing modal');
          hideInstallModal();
        }
      });
    }
    const confirmBtnMobile = document.getElementById('install-app-confirm-mobile');
    if (confirmBtnMobile) {
      confirmBtnMobile.addEventListener('click', async () => {
        console.log('[main.js] Mobile confirm clicked, deferredPrompt:', deferredPrompt);
        if (!('serviceWorker' in navigator && 'BeforeInstallPromptEvent' in window)) {
          console.error('[main.js] Browser does not support PWA installation');
          alert('This browser does not support app installation. Try Chrome or Edge on an HTTPS connection.');
          return;
        }
        if (deferredPrompt) {
          console.log('[main.js] Showing install prompt');
          showInstallProgress(true);
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          console.log('[main.js] Install prompt outcome:', outcome);
          deferredPrompt = null;
          setTimeout(() => {
            showInstallProgress(false);
            if (outcome === 'accepted') {
              console.log('[main.js] User accepted install prompt');
              showInstallSuccess();
            } else {
              console.log('[main.js] User dismissed install prompt');
            }
          }, 600);
        } else {
          console.error('[main.js] No deferredPrompt available');
          alert('Installation not available. Please try again or ensure you are using Chrome with HTTPS.');
        }
      });
    }
    const confirmBtnDesktop = document.getElementById('install-app-confirm-desktop');
    if (confirmBtnDesktop) {
      confirmBtnDesktop.addEventListener('click', async () => {
        console.log('[main.js] Desktop confirm clicked, deferredPrompt:', deferredPrompt);
        if (!('serviceWorker' in navigator && 'BeforeInstallPromptEvent' in window)) {
          console.error('[main.js] Browser does not support PWA installation');
          alert('This browser does not support app installation. Try Chrome or Edge on an HTTPS connection.');
          return;
        }
        if (deferredPrompt) {
          console.log('[main.js] Showing install prompt');
          showInstallProgress(true);
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          console.log('[main.js] Install prompt outcome:', outcome);
          deferredPrompt = null;
          setTimeout(() => {
            showInstallProgress(false);
            if (outcome === 'accepted') {
              console.log('[main.js] User accepted install prompt');
              showInstallSuccess();
            } else {
              console.log('[main.js] User dismissed install prompt');
            }
          }, 600);
        } else {
          console.error('[main.js] No deferredPrompt available');
          alert('Installation not available. Please try again or ensure you are using Chrome with HTTPS.');
        }
      });
    }
    const cancelBtnDesktop = document.getElementById('install-app-cancel-desktop');
    if (cancelBtnDesktop) {
      cancelBtnDesktop.addEventListener('click', () => {
        console.log('[main.js] Desktop cancel clicked');
        hideInstallModal();
      });
    }
    const box = document.getElementById('install-modal-mobile');
    const handle = document.getElementById('modal-drag-handle');
    if (handle && box) {
      let startY = null, isDragging = false;
      handle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        console.log('[main.js] Touch start:', e.touches[0].clientY);
        isDragging = true;
        startY = e.touches[0].clientY;
        box.style.transition = 'none';
      });
      handle.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        let dy = Math.max(0, e.touches[0].clientY - startY);
        console.log('[main.js] Touch move:', dy);
        box.style.transform = `translateY(${dy}px)`;
      });
      handle.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        let dy = Math.max(0, e.changedTouches[0].clientY - startY);
        console.log('[main.js] Touch end:', dy);
        isDragging = false;
        box.style.transition = 'transform .25s';
        if (dy > 100) {
          console.log('[main.js] Drag-to-close triggered');
          hideInstallModal();
          setTimeout(() => { box.style.transform = ''; }, 250);
        } else {
          console.log('[main.js] Resetting mobile modal transform');
          box.style.transform = '';
        }
      });
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('[main.js] beforeinstallprompt event fired:', e);
      e.preventDefault();
      deferredPrompt = e;
      const openBtn = document.querySelector('.install-app-button');
      if (openBtn) {
        console.log('[main.js] Setting install button display to flex');
        openBtn.style.display = 'flex';
      }
    });
    window.addEventListener('appinstalled', () => {
      console.log('[main.js] PWA installed successfully');
      deferredPrompt = null;
    });
    window.addEventListener('resize', () => {
      const modal = document.getElementById('install-modal');
      if (modal && !modal.classList.contains('hidden')) {
        console.log('[main.js] Window resized, updating modal box');
        updateModalBox();
      }
    });
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
    getCurrentUser: () => firebaseAuth?.currentUser || null,
    getIdToken: async (force = false) => {
      if (!firebaseAuth?.currentUser) return null;
      return firebaseAuth.currentUser.getIdToken(!!force);
    },
  };
})();