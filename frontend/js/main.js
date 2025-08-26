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
      const res = await fetch(`${BACKEND_URL}/api/session`, { credentials: 'include' });
      if (!res.ok) {
        const text = await res.text();
        console.error('Session API returned error:', res.status, text);
        if (res.status === 401) { window.location.href = '/frontend/html/login.html'; }
        else { alert('Something went wrong while loading your session. Please try again.'); }
        return null;
      }
      const data = await res.json();
      return data.user;
    } catch (err) {
      console.error('Session fetch error:', err);
      alert('Unable to reach the server. Please check your internet connection and try again.');
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
      console.error('ensureSignedInFromSession error:', err);
      setErrorUI(err);
      return null;
    } finally { setLoading(false); }
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
    if (!window.Navigo) { console.error('Navigo is not defined.'); return; }
    router = new Navigo('/', { hash: false });
    router
      .on({
        '/': () => console.log('Routing to home'),
        '/auth/email': () => window.location.href = '/frontend/html/login.html',
        '/dashboard': async () => {
          console.log('Routing to dashboard');
          const user = await ensureSignedInFromSession();
          if (user) loadContent('/frontend/html/dashboard.html');
        },
      })
      .notFound(() => { qs('#content').innerHTML = '<p>Page not found</p>'; })
      .resolve();
  }

  async function loadContent(url) {
    const content = qs('#content');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
      content.innerHTML = await res.text();
      console.log(`Loaded content from ${url}`);
    } catch (error) {
      console.error('Error loading content:', error);
      content.innerHTML = '<p>Error loading page</p>';
    }
  }

  // -----------------------------
  // Actions
  // -----------------------------
  function goToGoogleAuth() { location.href = `${BACKEND_URL}/auth/google`; }

  async function logoutFlow() {
    setLoading(true, 'Signing out...');
    try { await fetch(`${BACKEND_URL}/logout`, { method: 'POST', credentials: 'include' }); }
    catch (e) { console.warn('logout error:', e); }
    finally { setLoading(false); localStorage.clear(); location.href = '/'; }
  }

  // -----------------------------
  // PWA / Install modal
  // -----------------------------
  let deferredPrompt = null;
  let modalMode = null;

  function isDesktopOrTablet() { return window.matchMedia('(min-width: 768px)').matches; }

  function showInstallModal() {
    modalMode = isDesktopOrTablet() ? 'desktop' : 'mobile';
    const modal = document.getElementById('install-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    updateModalBox();
    hideInstallSuccessUI();
  }

  function hideInstallModal() {
    const modalBackdrop = document.getElementById('install-modal');
    const desk = document.getElementById('install-modal-desktop');
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    hideInstallSuccessUI();
    if (modalMode === 'desktop' && desk) { desk.classList.remove('show'); setTimeout(() => { if(modalBackdrop) modalBackdrop.classList.add('hidden'); modalMode=null; }, 300); }
    else setTimeout(() => { if(modalBackdrop) modalBackdrop.classList.add('hidden'); modalMode=null; }, 300);
  }

  function updateModalBox() {
    const mob = document.getElementById('install-modal-mobile');
    const desk = document.getElementById('install-modal-desktop');
    if (modalMode==='desktop') { if(mob) mob.classList.add('hidden'); if(desk){ desk.classList.remove('hidden'); desk.classList.add('flex'); setTimeout(()=>desk.classList.add('show'),10); } }
    else { if(desk){ desk.classList.add('hidden'); desk.classList.remove('flex'); desk.classList.remove('show'); } if(mob) mob.classList.remove('hidden'); }
  }

  function showInstallProgress(show) {
    const progress = document.getElementById('install-progress');
    const confirmDesktop = document.getElementById('install-app-confirm-desktop');
    const cancelDesktop = document.getElementById('install-app-cancel-desktop');
    const confirmMobile = document.getElementById('install-app-confirm-mobile');
    if(progress) progress.classList.toggle('hidden', !show);
    if(confirmDesktop) confirmDesktop.classList.toggle('hidden', show);
    if(cancelDesktop) cancelDesktop.classList.toggle('hidden', show);
    if(confirmMobile) confirmMobile.classList.toggle('hidden', show);
  }

  function showInstallSuccess() { const progress = document.getElementById('install-progress'); const success = document.getElementById('install-success'); if(progress) progress.classList.add('hidden'); if(success) success.classList.remove('hidden'); }
  function hideInstallSuccessUI() { const progress = document.getElementById('install-progress'); const success = document.getElementById('install-success'); const confirmDesktop = document.getElementById('install-app-confirm-desktop'); const cancelDesktop = document.getElementById('install-app-cancel-desktop'); const confirmMobile = document.getElementById('install-app-confirm-mobile'); if(progress) progress.classList.add('hidden'); if(success) success.classList.add('hidden'); if(confirmDesktop) confirmDesktop.classList.remove('hidden'); if(cancelDesktop) cancelDesktop.classList.remove('hidden'); if(confirmMobile) confirmMobile.classList.remove('hidden'); }

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; showInstallModal(); });

  // -----------------------------
  // Bind events
  // -----------------------------
  function bindEvents() {
    if(UI.loginBtn) UI.loginBtn.addEventListener('click', e => { e.preventDefault(); goToGoogleAuth(); });
    if(UI.logoutBtn) UI.logoutBtn.addEventListener('click', e => { e.preventDefault(); logoutFlow(); });

    const confirmDesktop = document.getElementById('install-app-confirm-desktop');
    const cancelDesktop = document.getElementById('install-app-cancel-desktop');
    const confirmMobile = document.getElementById('install-app-confirm-mobile');
    const closeBtns = qsa('.install-modal-close');

    if(confirmDesktop) confirmDesktop.addEventListener('click', async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); const choice = await deferredPrompt.userChoice; deferredPrompt=null; showInstallProgress(true); setTimeout(()=>{ showInstallSuccess(); },500); }});
    if(confirmMobile) confirmMobile.addEventListener('click', async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); const choice = await deferredPrompt.userChoice; deferredPrompt=null; showInstallProgress(true); setTimeout(()=>{ showInstallSuccess(); },500); }});
    if(cancelDesktop) cancelDesktop.addEventListener('click', hideInstallModal);
    closeBtns.forEach(b=>b.addEventListener('click', hideInstallModal));
    window.addEventListener('resize', updateModalBox);
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

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', boot); }
  else { boot(); }

  // Expose API
  window.AppAuth = { goToGoogleAuth, logout: logoutFlow, getSession, showInstallModal, hideInstallModal };
})();
