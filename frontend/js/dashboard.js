import { mtnAwoofPlans, mtnGiftingPlans, airtelAwoofPlans, airtelCgPlans, gloCgPlans, gloGiftingPlans, ninemobilePlans } from './dataPlans.js';
import {
  openCheckoutModal,
  closeCheckoutModal,
  onPayClicked
} from '/frontend/js/checkout.js';

function saveCurrentAppState() {
  const state = {
    // ==================== MODALS – FIXED & BULLETPROOF ====================
    

openModal: (() => {
  // This will NOW work perfectly
  if (window.ModalManager && typeof window.ModalManager.getTopModal === 'function') {
    const top = window.ModalManager.getTopModal();
    if (top) {
      console.log('[StateSaver] Detected open modal via ModalManager:', top);
      return top;
    }
  }

  // Fallback (should never trigger now)
  const visible = document.querySelector('.modal.active, .modal[style*="flex"], .modal[style*="block"]');
  if (visible?.id) return visible.id;

  return null;
})(),



    // Form inputs
    phoneNumber: document.getElementById('phone-input')?.value || '',
    pinInputs: {
      current: document.getElementById('currentPin')?.value || '',
      new: document.getElementById('newPin')?.value || '',
      confirm: document.getElementById('confirmPin')?.value || '',
    },

    // Selection state
    selectedProvider: document.querySelector('.provider-box.active')?.className.match(/mtn|airtel|glo|ninemobile/)?.[0] || 'mtn',
    selectedPlanId: document.querySelector('.plan-box.selected')?.getAttribute('data-id') || '',

    // Scroll positions
    scrollPositions: {
      dashboard: window.scrollY,
      plansRow: document.querySelector('.plans-row')?.scrollLeft || 0,
      allPlansModal: document.getElementById('allPlansModalContent')?.scrollTop || 0,
    },

    // Extra
    timestamp: Date.now(),
    version: APP_VERSION || '1.0.0'
  };

  // Save in two places
  sessionStorage.setItem('__fg_app_state_v2', JSON.stringify(state));
  history.replaceState(state, '', location.href);

  console.log('[StateSaver] UI state saved → openModal:', state.openModal, state);
}



window.__SEC_API_BASE = 'https://api.flexgig.com.ng'

// Your project URL and anon key (get them from Supabase dashboard → Project Settings → API)
const SUPABASE_URL = 'https://bwmappzvptcjxlukccux.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3bWFwcHp2cHRjanhsdWtjY3V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0OTMzMjcsImV4cCI6MjA3MTA2OTMyN30.Ra7k6Br6nl1huQQi5DpDuOQSDE-6N1qlhUIvIset0mc';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let __backHandler = null;
// Ensure shared UI refs / flags are declared before any functions use them
let reauthModal = null;
let promptModal = null;
let reauthModalOpen = false;

// ----------------------
// Client helpers (paste once near other helpers)
// ----------------------
const REAUTH_GRACE_SECONDS = 20; // tune 15-30s as desired

function getLastPinReauthTs() {
  try { return Number(sessionStorage.getItem('lastPinReauthAt') || '0'); } catch (e) { return 0; }
}
function setLastPinReauthTs(ts = Date.now()) {
  try { sessionStorage.setItem('lastPinReauthAt', String(ts)); } catch (e) { /* ignore */ }
}
function inGraceWindow() {
  const ts = getLastPinReauthTs();
  return ts && (Date.now() - ts) < REAUTH_GRACE_SECONDS * 1000;
}


// Call this as early as practical (before container paints) - e.g., in onDashboardLoad() before manageDashboardCards() if possible.
async function renderDashboardCardsFromState({ preferServer = true } = {}) {
  const pinCard = document.getElementById('dashboardPinCard');
  const updateProfileCard = document.getElementById('dashboardUpdateProfileCard');

  if (!pinCard && !updateProfileCard) return;

  let hasPin = localStorage.getItem('hasPin') === 'true';
  let profileCompleted = localStorage.getItem('profileCompleted') === 'true';

  // optional: fetch session from server for authoritative state
  if (preferServer && typeof getSession === 'function') {
    try {
      const session = await getSession();
      if (session?.user) {
        hasPin = !!session.user.hasPin;
        profileCompleted = !!session.user.profileCompleted;

        localStorage.setItem('hasPin', hasPin);
        localStorage.setItem('profileCompleted', profileCompleted);
      }
    } catch (err) {
      console.warn("renderDashboardCardsFromState fallback to local flags", err);
    }
  }

  // --- Apply visibility rules ---
  if (pinCard) {
  if (!hasPin) {
    pinCard.classList.add("js-ready");
    pinCard.classList.remove("pin-hidden");
  } else {
    pinCard.classList.add("pin-hidden");
    pinCard.classList.remove("js-ready");
  }
}

if (updateProfileCard) {
  if (!profileCompleted) {
    updateProfileCard.classList.add("js-ready");
    updateProfileCard.classList.remove("update-profile-hidden");
  } else {
    updateProfileCard.classList.add("update-profile-hidden");
    updateProfileCard.classList.remove("js-ready");
  }
}


  // allow your existing dashboard logic to continue working
  if (typeof manageDashboardCards === "function") {
    try { manageDashboardCards(); } catch (e) {}
  }
}





async function scheduleHardIdleCheck() {
  if (hardIdleTimeout) clearTimeout(hardIdleTimeout);

  const now = Date.now();
  const last = Number(localStorage.getItem('lastActive') || now);
  const remaining = HARD_IDLE_MS - (now - last);

  hardIdleTimeout = setTimeout(async () => {
    console.log('🔥 [HARD IDLE] Timeout triggered - checking reauth status');
    
    // Local-first decision
    const localCheck = shouldReauthLocal('reauth');
    if (localCheck.needsReauth) {
      try { 
        console.log('🔒 [HARD IDLE] Local check: Reauth required - showing modal');
        await showReauthModal({ context: 'reauth', reason: 'hard-idle' }); 
        // 🚨 REMOVED: Auto-trigger biometrics call
      } catch(e) { 
        console.error('[hardIdle] showReauthModal failed', e); 
      }
    } else {
      // optionally call server async to update status
      try {
        console.log('🔒 [HARD IDLE] Local check passed - verifying with server');
        const serverCheck = await checkServerReauthStatus();
        if (serverCheck && (serverCheck.needsReauth || serverCheck.reauthRequired)) {
          console.log('🔒 [HARD IDLE] Server check: Reauth required - showing modal');
          await showReauthModal({ context: 'reauth', reason: 'hard-idle' });
          // 🚨 REMOVED: Auto-trigger biometrics call
        } else {
          console.log('✅ [HARD IDLE] Server check passed - no reauth needed');
        }
      } catch(e) { 
        console.warn('[hardIdle] server reauth check failed', e); 
      }
    }
  }, remaining > 0 ? remaining : 0);
}
// Replace the existing guardedHideReauthModal function in dashboard.js with this version.
// This removes the call to onSuccessfulReauth() inside guardedHideReauthModal to break the circular dependency.
// The onSuccessfulReauth() function should be called by the verification flows (e.g., after PIN or biometrics success)
// BEFORE attempting to hide the modal. This ensures clearing happens first, then safe hide.

// Guarded hide: only hide UI if canonical flag cleared.
// Use this everywhere instead of calling reauthModal.classList.add('hidden') directly.
async function guardedHideReauthModal() {
  try {
    // REMOVED: Do not call onSuccessfulReauth here to avoid circular calls.
    // Assume the caller has already run onSuccessfulReauth() to perform any necessary clearing/reset logic.

    // helper that reads canonical server/local flag
    function _isCanonicalPending() {
      try { return !!JSON.parse(localStorage.getItem('fg_reauth_required_v1') || 'null'); } catch (e) { return false; }
    }

    // only hide UI if canonical flag (fg_reauth_required_v1) is not present
    if (!_isCanonicalPending()) {
      try {
        if (reauthModal) {
          reauthModal.classList.add('hidden');
          try { reauthModal.removeAttribute('aria-modal'); } catch (e) {}
          try { reauthModal.removeAttribute('role'); } catch (e) {}
          if ('inert' in HTMLElement.prototype) {
            try { reauthModal.inert = false; } catch (e) {}
          } else {
            try { reauthModal.removeAttribute('aria-hidden'); reauthModal.style.pointerEvents = ''; } catch (e) {}
          }
        }
                // safe access to the DOM element; avoid referencing a possibly undeclared variable
        const _pm = (typeof document !== 'undefined') ? document.getElementById('promptModal') : null;
        if (_pm) {
          try {
            _pm.classList.add('hidden');
            _pm.removeAttribute('aria-hidden');
            _pm.style.pointerEvents = '';
          } catch (e) {}
        }

        reauthModalOpen = false;
        try { setReauthActive(false); } catch(e) {}
        try { localStorage.removeItem('fg_reauth_active_tab'); } catch(e) {}
      } catch (e) {
        console.warn('[reauth] guardedHideReauthModal UI hide error', e);
      }
    } else {
      console.debug('[reauth] guardedHideReauthModal: canonical flag still present; skipping hide');
    }
  } catch (err) {
    console.warn('[reauth] guardedHideReauthModal unexpected error', err);
    try { setReauthActive(false); } catch(e){}
  }
}

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

/**
 * Notify server that reauth is complete and clear the lock
 */
async function notifyReauthComplete() {
  try {
    const apiBase = window.__SEC_API_BASE || window.API_BASE || '';
    const url = `${apiBase}/reauth/complete`;
    
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!res.ok) {
      console.warn('[REAUTH] Failed to notify server of completion:', res.status);
      return false;
    }
    
    const data = await res.json();
    console.log('[REAUTH] ✅ Server lock cleared:', data);
    return data.ok || false;
    
  } catch (err) {
    console.error('[REAUTH] Failed to call /reauth/complete:', err);
    return false;
  }
}
window.notifyReauthComplete = notifyReauthComplete;

// ===== Sticky reauth bootstrap (drop near top of dashboard.js, BEFORE initFlow boot) =====
(function ensurePersistentReauthBootstrap(){
  try {
    // If the cross-tab module exists, call its init now (defensive)
    if (typeof initCrossTabReauth === 'function') {
      try { initCrossTabReauth(); } catch(e) { console.warn('early initCrossTabReauth failed', e); }
    }

    // Small helper to attempt showing modal even if DOM isn't ready yet
    const LOCAL_KEY = 'fg_reauth_required_v1';
    function readLocalKey() {
      try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch(e){ return null; }
    }

    const stored = readLocalKey();
    if (!stored) return;

    // Try to show modal as soon as possible, but wait for DOM wiring if needed.
    let attempts = 0;
    const maxAttempts = 20;
    const retryMs = 250;

    const tryShow = async () => {
      attempts++;
      try {
        // Prefer the local show helper if available
        if (typeof showReauthModalLocal === 'function') {
          showReauthModalLocal({ fromStorageObj: stored });
          return;
        }
        // Otherwise prefer the higher-level API
        if (window.__reauth && typeof window.__reauth.initReauthModal === 'function') {
          // try to init and show
          await window.__reauth.initReauthModal({ show: true, context: 'reauth' });
          return;
        }
        // Fallback: dispatch storage event to trigger other wiring
        window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_KEY, newValue: JSON.stringify(stored) }));
      } catch (e) {
        // swallow and retry
      }
      if (attempts < maxAttempts) setTimeout(tryShow, retryMs);
      else console.warn('ensurePersistentReauthBootstrap: giving up after attempts');
    };

    tryShow();

    // When tab becomes visible, re-check local key and force show if present
    document.addEventListener('visibilitychange', () => {
      try {
        if (document.visibilityState === 'visible') {
          const s = readLocalKey();
          if (s) {
            try {
              if (typeof showReauthModalLocal === 'function') showReauthModalLocal({ fromStorageObj: s });
              else if (window.__reauth && typeof window.__reauth.initReauthModal === 'function') window.__reauth.initReauthModal({ show: true, context: 'reauth' });
            } catch (e) {}
          }
        }
      } catch (e) {}
    }, { passive:true });

    // Before unload: keep the key in place (defensive; localStorage persists anyway)
    window.addEventListener('beforeunload', () => {
      try {
        const s = readLocalKey();
        if (s) localStorage.setItem(LOCAL_KEY, JSON.stringify(s));
      } catch (e) {}
    });
  } catch (err) {
    console.warn('ensurePersistentReauthBootstrap failed', err);
  }
})();

// ---------- Helpers (paste near other helper functions) ----------
function isCanonicalReauthPending() {
  console.log('❄️❄️❄️ isCanonicalReauthPending check');
  try {
    return !!JSON.parse(localStorage.getItem('fg_reauth_required_v1') || 'null');
  } catch (e) {
    return false;
  }
}

function clearCanonicalReauthFlag() {
  console.log('clearCanonicalReauthFlag called');
  try {
    // prefer the cross-tab/server API if available (fire-and-forget)
    if (window.fgReauth && typeof window.fgReauth.completeReauth === 'function') {
      try {
        const p = window.fgReauth.completeReauth();
        if (p && typeof p.then === 'function') p.catch(() => {/* swallow */});
      } catch (e) { /* ignore call errors */ }
    }
  } catch (e) {}
  try { localStorage.removeItem('fg_reauth_required_v1'); } catch (e) {}
  try { localStorage.removeItem('reauthPending'); } catch (e) {} // legacy
}




// ---------- helpers (add once near top-level) ----------
function normalizeB64Url(s) {
  if (s === null || s === undefined) return '';
  s = String(s);
  s = s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return s;
}
function bytesToB64Url(u8) {
  if (!u8 || !u8.length) return '';
  var bin = '';
  for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return normalizeB64Url(btoa(bin));
}
function ensureUint8FromMaybeObject(val) {
  if (val instanceof ArrayBuffer) return new Uint8Array(val);
  if (ArrayBuffer.isView(val)) return new Uint8Array(val.buffer || val);
  if (Array.isArray(val)) return new Uint8Array(val.map(n => Number(n) & 0xff));
  if (val && typeof val === 'object') {
    if (Array.isArray(val.data)) return new Uint8Array(val.data.map(n => Number(n) & 0xff));
    var keys = Object.keys(val).filter(k => /^\d+$/.test(k));
    if (keys.length) {
      var max = Math.max.apply(null, keys.map(Number));
      var out = new Uint8Array(max + 1);
      for (var k of keys) { out[Number(k)] = Number(val[k]) & 0xff; }
      return out;
    }
  }
  return null;
}
function challengeToB64Url(ch) {
  if (ch === null || ch === undefined) return '';
  if (typeof ch === 'string') {
    var s = ch.trim();
    if ((s[0] === '{' || s[0] === '[') && (s.indexOf(':') !== -1 || s.indexOf('[') === 0)) {
      try {
        var parsed = JSON.parse(s);
        var u = ensureUint8FromMaybeObject(parsed);
        if (u) return bytesToB64Url(u);
      } catch (e) { /* ignore */ }
    }
    return normalizeB64Url(ch);
  }
  var u8 = ensureUint8FromMaybeObject(ch);
  if (u8) return bytesToB64Url(u8);
  try { return normalizeB64Url(btoa(JSON.stringify(ch))); } catch (e) { return ''; }
}

// Try a single immediate navigator.credentials.get() with server-supplied freshOpts
// 🔒 NO AUTO-CALL: This function should only be called manually by user button clicks
async function tryImmediateReauthWithFreshOptions(freshOpts, attemptLimit = 1, context = {}) {
  // 🚨 REMOVED: All auto-call guards and hard idle checks
  // This function now only executes when explicitly called (e.g., user clicks bio button)
  
  console.log('[webauthn] tryImmediateReauth: Manual call initiated', context);
  
  // Safety: Check if biometrics are enabled and user has credentials
  const biometricsEnabled = localStorage.getItem('biometricsEnabled') === 'true';
  const credentialId = localStorage.getItem('credentialId') || localStorage.getItem('webauthn-cred-id');
  
  if (!biometricsEnabled || !credentialId) {
    console.log('[webauthn] tryImmediateReauth: Skipped (bio disabled or no cred)');
    return { ok: false, reason: 'biometrics-not-available' };
  }
  
  console.log('🔐 [webauthn] Calling biometric panel (manual trigger)');
  
  function b64UrlToUint8(s) {
    if (!s) return null;
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    try {
      const bin = atob(s);
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u;
    } catch (e) { return null; }
  }
  
  function ensureUint8(val) {
    if (val instanceof ArrayBuffer) return new Uint8Array(val);
    if (ArrayBuffer.isView(val)) return new Uint8Array(val.buffer || val);
    if (Array.isArray(val)) return new Uint8Array(val.map(n => Number(n) & 0xff));
    if (typeof val === 'string') {
      const maybe = val.trim();
      if (maybe && (maybe[0] === '{' || maybe[0] === '[')) {
        try { return ensureUint8FromMaybeObject(JSON.parse(maybe)); } catch (e) { /* ignore */ }
      }
      return b64UrlToUint8(val);
    }

    if (val && typeof val === 'object' && Array.isArray(val.data)) {
      return new Uint8Array(val.data.map(n => Number(n) & 0xff));
    }

    const keys = (val && typeof val === 'object') ? Object.keys(val).filter(k => /^\d+$/.test(k)) : [];
    if (keys.length) {
      const max = Math.max(...keys.map(Number));
      const out = new Uint8Array(max + 1);
      for (const k of keys) out[Number(k)] = Number(val[k]) & 0xff;
      return out;
    }
    return null;
  }

  const publicKey = {};
  publicKey.challenge = ensureUint8(freshOpts.challenge || freshOpts.challengeBase64 || freshOpts.challengeBytes || freshOpts.challenge_raw);
  if (freshOpts.rpId) publicKey.rpId = freshOpts.rpId;
  if (freshOpts.timeout) publicKey.timeout = freshOpts.timeout;
  if (freshOpts.userVerification) publicKey.userVerification = freshOpts.userVerification;

  const rawAllow = Array.isArray(freshOpts.allowCredentials) ? freshOpts.allowCredentials : [];
  publicKey.allowCredentials = rawAllow.map(c => {
    const id = ensureUint8(c.id) || (typeof c.id === 'string' ? b64UrlToUint8(c.id) : null);
    return { type: c.type || 'public-key', id: id || c.id, transports: c.transports || ['internal'] };
  }).filter(x => !!x.id);

  let attempt = 0;
  while (attempt < attemptLimit) {
    attempt++;
    try {
      console.log(`🔐 [webauthn] Attempt ${attempt}/${attemptLimit} - Calling navigator.credentials.get() (manual)`);
      const assertion = await navigator.credentials.get({ publicKey });
      if (assertion) {
        console.log('✅ [webauthn] Biometric success (manual)');
        return { ok: true, assertion };
      }
    } catch (err) {
      console.warn('[webauthn] Manual biometric attempt failed', err);
      break;
    }
  }
  return { ok: false, reason: 'get-failed' };
}
// ---------- end helpers ----------


// ---------- Loader (refcounted, idempotent) ----------
// PATCH FOR dashboard.js - Replace your existing loader section with this:

// ---------- Loader (refcounted, idempotent) - FIXED for Modal Manager ----------
(function () {
  let __loaderRefCount = 0;
  let __loaderSavedState = null;
  let __loaderBackHandlerInstalled = false;

  function _saveAndDisableInteractive() {
    __loaderSavedState = new Map();
    const els = Array.from(document.querySelectorAll('button, input, select, textarea, a'));
    els.forEach(el => {
      try {
        __loaderSavedState.set(el, !!el.disabled);
        el.disabled = true;
      } catch (e) { /* ignore elements that throw */ }
    });
  }

  function _restoreInteractive() {
    if (!__loaderSavedState) return;
    try {
      __loaderSavedState.forEach((wasDisabled, el) => {
        try {
          el.disabled = !!wasDisabled;
        } catch (e) { /* ignore */ }
      });
    } finally {
      __loaderSavedState = null;
    }
  }

  window.showLoader = function showLoader() {
    const loader = document.getElementById('appLoader');
    if (!loader) return;
    __loaderRefCount++;

    if (__loaderRefCount === 1) {
      loader.hidden = false;
      _saveAndDisableInteractive();

      // CRITICAL FIX: Only lock scroll if ModalManager isn't already locking it
      const modalManagerActive = window.ModalManager && window.ModalManager.isScrollLocked && window.ModalManager.isScrollLocked();
      if (!modalManagerActive) {
        // Loader can lock scroll (lightweight - just overflow)
        document.body.style.setProperty('--loader-scroll-lock', 'hidden', 'important');
        document.body.classList.add('loader-active');
      }

      if (!__loaderBackHandlerInstalled) {
        __backHandler = function () {
          history.pushState(null, '', location.href);
        };
        window.addEventListener('popstate', __backHandler);
        history.pushState(null, '', location.href);
        __loaderBackHandlerInstalled = true;
      }
    }
  };

  window.hideLoader = function hideLoader(forceReset = false) {
    const loader = document.getElementById('appLoader');
    if (!loader) return;

    if (forceReset) {
      __loaderRefCount = 0;
    } else {
      __loaderRefCount = Math.max(0, __loaderRefCount - 1);
    }

    if (__loaderRefCount === 0) {
      loader.hidden = true;
      _restoreInteractive();

      // CRITICAL FIX: Only unlock if ModalManager isn't using it
      const modalManagerActive = window.ModalManager && window.ModalManager.isScrollLocked && window.ModalManager.isScrollLocked();
      if (!modalManagerActive) {
        document.body.style.removeProperty('--loader-scroll-lock');
        document.body.classList.remove('loader-active');
      }

      if (__loaderBackHandlerInstalled && typeof __backHandler === 'function') {
        window.removeEventListener('popstate', __backHandler);
        __backHandler = null;
        __loaderBackHandlerInstalled = false;
      }
    }
  };
})();




async function withLoader(task) {
  const start = Date.now();

  // Try to extract caller info from the stack trace
  let callerInfo = 'unknown';
  try {
    const rawStack = (new Error()).stack || '';
    const lines = rawStack.split('\n').map(l => l.trim()).filter(Boolean);

    // Find the first stack frame that is NOT inside withLoader itself
    // The stack usually looks like:
    // Error
    // at withLoader (file:line:col)
    // at callerFunction (file:line:col)
    let callerLine = lines.find(l => !/withLoader/.test(l) && !/Error/.test(l));
    // Fallback to the second line if above didn't work
    if (!callerLine && lines.length >= 2) callerLine = lines[1];

    if (callerLine) {
      // Try to match common V8/Chromium stack frame: "at funcName (fileURL:line:col)"
      let m = callerLine.match(/at\s+(.*)\s+\((.*):(\d+):(\d+)\)/);
      if (m) {
        const func = m[1];
        const file = m[2].split('/').pop(); // keep filename for readability
        const line = m[3];
        const col = m[4];
        callerInfo = `${func} @ ${file}:${line}:${col}`;
      } else {
        // Try Firefox-like format: "funcName@fileURL:line:col"
        m = callerLine.match(/(.*)@(.+):(\d+):(\d+)/);
        if (m) {
          const func = m[1] || '(anonymous)';
          const file = m[2].split('/').pop();
          const line = m[3];
          const col = m[4];
          callerInfo = `${func} @ ${file}:${line}:${col}`;
        } else {
          // Last resort: just use the raw frame string
          callerInfo = callerLine;
        }
      }
    }
  } catch (e) {
    callerInfo = 'unknown';
  }

  console.log(`[DEBUG ⌛⌛⌛] withLoader: Starting task (called from ${callerInfo})`);
  showLoader();
  try {
    const result = await task();
    const duration = Date.now() - start;
    console.log(`[DEBUG ⌛⌛⌛] withLoader: Task completed (duration: ${duration}ms) (called from ${callerInfo})`);
    return result;
  } catch (err) {
    const duration = Date.now() - start;
    console.error(`[DEBUG ⌛⌛⌛] withLoader: Task failed after ${duration}ms (called from ${callerInfo})`, err);
    throw err;
  } finally {
    try { hideLoader(); } catch (e) { /* ignore */ }
  }
}
window.withLoader = window.withLoader || withLoader

// Robust error parser: returns { message, code, raw }
async function parseErrorResponse(res) {
  try {
    // clone in case the caller later wants to read the body too
    const clone = res.clone();
    // try JSON first
    const json = await clone.json().catch(() => null);
    if (json && (json.message || json.code || Object.keys(json).length)) {
      return { message: (json.message || JSON.stringify(json)), code: json.code || null, raw: json };
    }
  } catch (e) { /* ignore JSON parse error */ }

  try {
    const txt = await res.text();
    if (txt) return { message: txt, code: null, raw: txt };
  } catch (e) { /* ignore text parse error */ }

  return { message: res.status ? `${res.status} ${res.statusText || ''}`.trim() : 'Unknown error', code: null, raw: null };
}

// Safe fallback clear all pin inputs if older helper missing
if (typeof window.__fg_pin_clearAllInputs !== 'function') {
  window.__fg_pin_clearAllInputs = function __fg_pin_clearAllInputs_fallback() {
    try {
      const els = document.querySelectorAll('#currentPin, #newPin, #confirmPin');
      els.forEach(e => { try { e.value = ''; } catch (_) {} });
      if (els && els[0]) try { els[0].focus(); } catch (_) {}
    } catch (e) { /* swallow */ }
  };
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


// banner state (used to prevent pollStatus from stomping intentional broadcasts)
window.__fg_currentBanner = window.__fg_currentBanner || {
  id: null,            // server-provided notification id (if any)
  sticky: false,       // true = server asked that this not be auto-cleared
  clientSticky: false, // true = client/admin intentionally set a sticky broadcast
  message: ''          // current visible message
};



// 🚀 Global banner helpers
// Put this in your JS file (replace old showBanner)

function setBannerMessage(msg, repeatTimes = 6) {
  const repeated = String(msg).repeat(repeatTimes);
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

function showBanner(msg, opts = {}) {
  // opts: { type: 'info'|'error'|'warning', persistent: boolean, serverId: any, clientSticky: boolean }
  const STATUS_BANNER = document.getElementById('status-banner');
  if (!STATUS_BANNER) return;
  setBannerMessage(msg, 1);
  STATUS_BANNER.classList.remove('hidden');

  // Update global banner state
  try {
    window.__fg_currentBanner = window.__fg_currentBanner || { id: null, sticky: false, clientSticky: false, message: '' };
    window.__fg_currentBanner.message = String(msg || '');
    window.__fg_currentBanner.sticky = !!opts.persistent;
    window.__fg_currentBanner.id = opts.serverId || window.__fg_currentBanner.id || null;
    // If caller explicitly marks it clientSticky, set that (admin/manual broadcasts)
    if (opts.clientSticky) window.__fg_currentBanner.clientSticky = true;
    // If serverId provided and not clientSticky, ensure clientSticky is false (server banner)
    if (opts.serverId && !opts.clientSticky) window.__fg_currentBanner.clientSticky = false;
  } catch (e) { /* swallow */ }
}
// 🔥 MAKE BROADCAST ENGINE GLOBAL (required since dashboard.js is an ES module)
window.setBannerMessage = setBannerMessage;
window.showBanner = showBanner;
window.hideBanner = hideBanner;

window.setupBroadcastSubscription = setupBroadcastSubscription;
window.safeUnsubscribeChannel = safeUnsubscribeChannel;

window.fetchActiveBroadcasts = fetchActiveBroadcasts;
window.fetchWithAutoRefresh = fetchWithAutoRefresh;

window.handleBroadcast = handleBroadcast;

// Optional internal state (for debugging)
window.__fg_currentBanner = window.__fg_currentBanner || {};
window.__fg_broadcast_channel = window.__fg_broadcast_channel || null;


function hideBanner(force = false) {
  // If a sticky banner is present, do not hide unless force === true
  try {
    const state = window.__fg_currentBanner || {};
    if (!force && (state.sticky || state.clientSticky)) {
      // preserve sticky banner
      return;
    }
  } catch (e) { /* ignore */ }

  const STATUS_BANNER = document.getElementById('status-banner');
  if (STATUS_BANNER) STATUS_BANNER.classList.add('hidden');

  try {
    // clear state only when forced or not sticky
    if (force || !(window.__fg_currentBanner?.sticky || window.__fg_currentBanner?.clientSticky)) {
      window.__fg_currentBanner = { id: null, sticky: false, clientSticky: false, message: '' };
      localStorage.removeItem('active_broadcast_id');
    }
  } catch (e) {}
}

// idempotent, robust broadcast subscription that also fetches current state on subscribe
let __fg_broadcast_channel = null;

function safeUnsubscribeChannel() {
  try {
    if (__fg_broadcast_channel && typeof __fg_broadcast_channel.unsubscribe === 'function') {
      __fg_broadcast_channel.unsubscribe().catch(() => {});
    }
  } catch (e) { /* ignore */ }
  __fg_broadcast_channel = null;
}

function setupBroadcastSubscription(force = false) {
  try {
    // If already subscribed and not forced, do nothing
    if (__fg_broadcast_channel && !force) return __fg_broadcast_channel;

    // Unsubscribe previous channel if any
    safeUnsubscribeChannel();

    // Create a fresh channel: keep same topic you used
    __fg_broadcast_channel = supabaseClient.channel('public:broadcasts');

    // Helper: centralize showing logic so we consistently persist serverId
    function applyBroadcastRow(row) {
      if (!row) return;
      const now = new Date();
      const startsOk = !row.starts_at || new Date(row.starts_at) <= now;
      const notExpired = !row.expire_at || new Date(row.expire_at) > now;
      if (row.active && startsOk && notExpired) {
        const id = row.id != null ? String(row.id) : null;
        // Use same contract as pollStatus: set serverId and persist active id
        try {
          showBanner(row.message || '', { persistent: !!row.sticky, serverId: id });
        } catch (e) { console.warn('applyBroadcastRow showBanner failed', e); }
        try { 
          if (id != null) localStorage.setItem('active_broadcast_id', String(id));
          localStorage.setItem('active_broadcast_ts', String(Date.now()));
          window.__fg_currentBanner = window.__fg_currentBanner || {};
          window.__fg_currentBanner.serverId = id;
          window.__fg_currentBanner.id = id;
          window.__fg_currentBanner.message = row.message || '';
          window.__fg_currentBanner.sticky = !!row.sticky;
          window.__fg_currentBanner.clientSticky = false;
        } catch (e) {}
      } else {
        const showingId = localStorage.getItem('active_broadcast_id');
        if (showingId && String(showingId) === String(row.id)) {
          hideBanner();
          try {
            localStorage.removeItem('active_broadcast_id');
            localStorage.removeItem('active_broadcast_ts');
            if (window.__fg_currentBanner) {
              delete window.__fg_currentBanner.serverId;
              delete window.__fg_currentBanner.id;
            }
          } catch (e) {}
        }
      }
    }

    __fg_broadcast_channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'broadcasts' }, (payload) => {
        console.log('[BROADCAST INSERT]', payload);
        applyBroadcastRow(payload.new);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'broadcasts' }, (payload) => {
        console.log('[BROADCAST UPDATE]', payload);
        applyBroadcastRow(payload.new);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'broadcasts' }, (payload) => {
        console.log('[BROADCAST DELETE]', payload);
        const showingId = localStorage.getItem('active_broadcast_id');
        if (showingId && String(showingId) === String(payload.old.id)) {
          hideBanner();
          try {
            localStorage.removeItem('active_broadcast_id');
            localStorage.removeItem('active_broadcast_ts');
            if (window.__fg_currentBanner) {
              delete window.__fg_currentBanner.serverId;
              delete window.__fg_currentBanner.id;
            }
          } catch (e) {}
        }
      })
      .subscribe((status) => {
        console.log('[BROADCAST SUBSCRIBE STATUS]', status);
        if (status === 'SUBSCRIBED') {
          // IMPORTANT: Immediately fetch authoritative current broadcast(s) for this new subscriber.
          // Prefer calling your pollStatus() (which is already authoritative and deduped)
          if (typeof pollStatus === 'function') {
            try {
              // run fire-and-forget; wrapper dedupes
              pollStatus();
            } catch (e) { console.debug('setupBroadcastSubscription: pollStatus failed', e); }
          } else {
            // Fallback: request a direct endpoint that returns active broadcasts.
            (async () => {
              try {
                const apiBase = (window.__SEC_API_BASE || (typeof API_BASE !== 'undefined' ? API_BASE : ''));
                const url = apiBase ? `${apiBase}/api/broadcasts/active` : '/api/broadcasts/active';
                const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
                if (res.ok) {
                  const json = await res.json();
                  // accept either a single row or array
                  const row = Array.isArray(json) ? json[0] : json;
                  if (row) applyBroadcastRow(row);
                }
              } catch (e) { console.debug('setupBroadcastSubscription: fallback active fetch failed', e); }
            })();
          }
        }
      });

    return __fg_broadcast_channel;
  } catch (err) {
    console.warn('setupBroadcastSubscription failed', err);
    safeUnsubscribeChannel();
    return null;
  }
}





// Fetch active broadcasts on load and show the first applicable one
async function fetchActiveBroadcasts() {
  try {
    const res = await fetch(`${window.__SEC_API_BASE || ''}/api/broadcasts/active?_${Date.now()}`, { credentials: 'include', cache: 'no-store' });
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
// Global flags to prevent race conditions
window.__sessionLoading = false;
window.__sessionPromise = null;
window.__lastSessionLoadId = 0;
window.__INITIAL_SESSION_FETCHED = false;

async function getSession() {
  // Reuse in-flight request to prevent duplicate calls
  if (window.__sessionPromise) {
    console.log('[DEBUG] getSession: Reusing in-flight promise');
    return window.__sessionPromise;
  }

  const loadId = Date.now();
  window.__lastSessionLoadId = loadId;

  window.__sessionPromise = (async () => {
    try {
      console.log('[DEBUG] getSession: Starting (loadId=' + loadId + ')');

      // PHASE 1: Check for server initial data (FASTEST)
      if (!window.__INITIAL_SESSION_FETCHED) {
        console.log('[DEBUG] getSession: Fetching initial session data');
        try {
          const initialRes = await fetch(`${window.__SEC_API_BASE}/api/session/initial`, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
          });

          if (initialRes.ok) {
            const initialData = await initialRes.json();
            window.__INITIAL_SESSION_FETCHED = true;

            if (initialData.authenticated && initialData.user) {
              console.log('[DEBUG] getSession: Using initial session data');
              const user = initialData.user;
              applySessionToDOM(user);
              updateLocalStorageFromUser(user);
              return { user };
            }
          }
        } catch (err) {
          console.warn('[WARN] getSession: Initial fetch failed', err);
        }
      }

      // PHASE 2: Use cache if fresh (FAST)
      const cachedUserData = localStorage.getItem('userData');
      let cachedUser = null;
      
      if (cachedUserData) {
        try {
          const parsed = JSON.parse(cachedUserData);
          if (Date.now() - parsed.cachedAt < 60000) {
            console.log('[DEBUG] getSession: Using fresh cache');
            cachedUser = parsed;
            applySessionToDOM(cachedUser);
          }
        } catch (e) {
          console.warn('[WARN] getSession: Invalid cache', e);
        }
      }

      // PHASE 3: Fetch from API (AUTHORITATIVE)
      console.log('[DEBUG] getSession: Fetching from /api/session');
      
      let res = await fetch(`${window.__SEC_API_BASE}/api/session`, {
        method: 'GET',
        credentials: 'include',
        headers: { 
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (res.status === 401) {
        console.log('[DEBUG] getSession: 401, attempting refresh');
        const refreshRes = await fetch(`${window.__SEC_API_BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        });

        if (refreshRes.ok) {
          console.log('[DEBUG] getSession: Refresh succeeded, retrying');
          res = await fetch(`${window.__SEC_API_BASE}/api/session`, {
            method: 'GET',
            credentials: 'include',
            headers: { 
              'Accept': 'application/json',
              'Cache-Control': 'no-cache'
            }
          });
        } else {

          // change this later

          console.warn('[WARN] getSession: Refresh failed — not redirecting; dispatching session:missing');
          window.dispatchEvent(new CustomEvent('session:missing', {
            detail: { reason: 'refresh_failed', timestamp: Date.now() }
          }));
          return null;

        }
      }

      if (!res.ok) {
        console.error('[ERROR] getSession: API returned', res.status);
        if (cachedUser) {
          console.log('[DEBUG] getSession: Falling back to cache');
          return { user: cachedUser };
        }
        return null;
      }

      const payload = await res.json();
      if (!payload || !payload.user) {
        console.error('[ERROR] getSession: Invalid payload', payload);
        if (cachedUser) return { user: cachedUser };
        return null;
      }

      const { user } = payload;
      console.log('[DEBUG] getSession: API success', user);

      // Only update DOM if data changed
      if (!cachedUser || JSON.stringify(user) !== JSON.stringify(cachedUser)) {
        console.log('[DEBUG] getSession: Data changed, updating DOM');
        applySessionToDOM(user);
      }

      updateLocalStorageFromUser(user);

      console.log('[DEBUG] getSession: Complete (loadId=' + loadId + ')');
      return { user };

    } catch (err) {
      console.error('[ERROR] getSession: Failed', err);
      
      const cachedUserData = localStorage.getItem('userData');
      if (cachedUserData) {
        try {
          const cached = JSON.parse(cachedUserData);
          console.log('[DEBUG] getSession: Using cache as fallback');
          applySessionToDOM(cached);
          return { user: cached };
        } catch (e) {
          console.warn('[WARN] getSession: Cache parse failed', e);
        }
      }
      return null;
    } finally {
      window.__sessionPromise = null;
    }
  })();

  return window.__sessionPromise;
}

window.getSession = getSession;

// PRODUCTION-LEVEL REALTIME BALANCE (WebSocket + Polling Fallback)
// 🔥 MOVE THESE TO GLOBAL SCOPE (before the IIFE)
window.currentDisplayedBalance = 0;  // ✅ GLOBAL
window.isBalanceMasked = true;
let animationFrame = null;

// Restore preference
try {
  const saved = localStorage.getItem('balanceMasked');
  window.isBalanceMasked = saved === null ? true : saved === 'true';
} catch (e) {
  window.isBalanceMasked = true;
}

(function() {
  const uid = window.__USER_UID || localStorage.getItem('userId');
  if (!uid) return;

  let ws = null;
  let pollInterval = null;

  // ... WebSocket code stays the same ...

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  window.updateAllBalances = function (newBalance) {
    newBalance = Number(newBalance) || 0;

    if (animationFrame) cancelAnimationFrame(animationFrame);

    const startBalance = window.currentDisplayedBalance;  // ✅ Use global
    const endBalance = newBalance;
    const duration = Math.abs(endBalance - startBalance) < 5000 ? 800 : 1400;
    const startTime = performance.now();

    function animate(time) {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = startBalance + (endBalance - startBalance) * eased;
      window.currentDisplayedBalance = current;  // ✅ Use global

      const formatted = '₦' + current.toLocaleString('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

      // Update ALL real balance elements
      document.querySelectorAll('[data-balance], .balance-real').forEach(el => {
        if (el.textContent !== formatted) {
          el.textContent = formatted;
        }
      });

      // Update masked version
      document.querySelectorAll('.balance-masked').forEach(el => {
        el.textContent = window.isBalanceMasked ? '••••••' : formatted;  // ✅ Use global
      });

      // TOGGLE VISIBILITY
      document.querySelectorAll('.balance-real').forEach(el => {
        if (window.isBalanceMasked) {  // ✅ Use global
          el.style.display = 'none';
          el.style.opacity = '0';
        } else {
          el.style.display = 'inline';
          el.style.opacity = '1';
        }
      });

      document.querySelectorAll('.balance-masked').forEach(el => {
        el.style.display = window.isBalanceMasked ? 'inline' : 'none';  // ✅ Use global
      });

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        animationFrame = null;
      }
    }

    animationFrame = requestAnimationFrame(animate);
  };

  // Eye toggle handler
  document.addEventListener('click', function(e) {
    const eye = e.target.closest('.balance-eye-toggle');
    if (!eye) return;

    window.isBalanceMasked = !window.isBalanceMasked;  // ✅ Use global

    try {
      localStorage.setItem('balanceMasked', window.isBalanceMasked);
    } catch (e) {}

    eye.classList.toggle('open', !window.isBalanceMasked);
    eye.classList.toggle('closed', window.isBalanceMasked);

    document.querySelectorAll('.balance-real, [data-balance]').forEach(el => {
      el.style.display = window.isBalanceMasked ? 'none' : 'inline';
      el.style.opacity = window.isBalanceMasked ? '0' : '1';
    });

    document.querySelectorAll('.balance-masked').forEach(el => {
      el.style.display = window.isBalanceMasked ? 'inline' : 'none';
    });

    window.updateAllBalances(window.currentDisplayedBalance);  // ✅ Use global
  });

  // On load fix
  document.addEventListener('DOMContentLoaded', () => {
    const eye = document.querySelector('.balance-eye-toggle');
    const realSpans = document.querySelectorAll('.balance-real, [data-balance]');
    const maskedSpans = document.querySelectorAll('.balance-masked');

    if (eye) {
      if (window.isBalanceMasked) {  // ✅ Use global
        eye.classList.remove('open');
        eye.classList.add('closed');
      } else {
        eye.classList.remove('closed');
        eye.classList.add('open');
      }
    }

    realSpans.forEach(el => {
      if (window.isBalanceMasked) {  // ✅ Use global
        el.style.display = 'none';
        el.style.opacity = '0';
      } else {
        el.style.display = 'inline';
        el.style.opacity = '1';
      }
    });

    maskedSpans.forEach(el => {
      el.style.display = window.isBalanceMasked ? 'inline' : 'none';  // ✅ Use global
    });

    console.log('[Balance] DOM ready — waiting for session');
  });

  connectWS();
})();


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


// ADD THIS: Set initial balance without animation
if (user.wallet_balance !== undefined) {
  const newBalance = Number(user.wallet_balance) || 0;
  window.currentDisplayedBalance = newBalance; // ✅ Use window.currentDisplayedBalance
  
  const formatted = '₦' + newBalance.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  // Update all balance elements immediately
  document.querySelectorAll('[data-balance], .balance-real').forEach(el => {
    el.textContent = formatted;
  });
  
  document.querySelectorAll('.balance-masked').forEach(el => {
    el.textContent = window.isBalanceMasked ? '••••••' : formatted;  // ✅ Use window.isBalanceMasked
  });
}

// Helper: Update localStorage with user data
function updateLocalStorageFromUser(user) {
  try {
    const userData = {
      uid: user.uid || user.id || '',
      email: user.email || '',
      username: user.username || '',
      fullName: user.fullName || '',
      firstName: user.firstName || user.fullName?.split(' ')[0] || 'User',
      phoneNumber: user.phoneNumber || '',
      address: user.address || '',
      profilePicture: user.profilePicture || '',
      hasPin: user.hasPin || false,
      hasBiometrics: user.hasBiometrics || false,
      profileCompleted: user.profileCompleted || false,
      fullNameEdited: user.fullNameEdited || false,
      lastUsernameUpdate: user.lastUsernameUpdate || '',
      cachedAt: Date.now()
    };

    localStorage.setItem('userData', JSON.stringify(userData));
    localStorage.setItem('userEmail', user.email || '');
    localStorage.setItem('userId', user.uid || user.id || '');
    localStorage.setItem('firstName', userData.firstName);
    localStorage.setItem('username', user.username || '');
    localStorage.setItem('fullName', user.fullName || '');
    localStorage.setItem('phoneNumber', user.phoneNumber || '');
    localStorage.setItem('address', user.address || '');
    localStorage.setItem('profilePicture', user.profilePicture || '');
    localStorage.setItem('hasPin', user.hasPin ? 'true' : 'false');
    localStorage.setItem('biometricsEnabled', user.hasBiometrics ? 'true' : 'false');
    localStorage.setItem('profileCompleted', user.profileCompleted ? 'true' : 'false');
    localStorage.setItem('fullNameEdited', user.fullNameEdited ? 'true' : 'false');
    localStorage.setItem('lastUsernameUpdate', user.lastUsernameUpdate || '');

    console.log('[DEBUG] updateLocalStorageFromUser: Updated', {
      hasPin: user.hasPin,
      hasBiometrics: user.hasBiometrics,
      profileCompleted: user.profileCompleted
    });
  } catch (err) {
    console.warn('[WARN] updateLocalStorageFromUser: Failed', err);
  }
}








// 🔹 Sub-handler stubs (add these functions globally — simple local toggles)
// 🔹 Fixed Child Toggle Handlers (auto-disable parent when both children turn OFF)

// 🔹 Fixed Child Toggle Handlers (allow individual ON/OFF, auto-disable parent when both OFF)

async function handleBioLoginToggle(e) {
    e.preventDefault();
    const switchBtn = e.currentTarget;
    const currentlyOn = switchBtn.getAttribute('aria-checked') === 'true';
    const newState = !currentlyOn;
    
    console.log('[DEBUG] handleBioLoginToggle clicked:', { currentlyOn, newState });
    
    // Update this child's state
    switchBtn.setAttribute('aria-checked', newState.toString());
    if (newState) {
        switchBtn.classList.add('active');
        switchBtn.classList.remove('inactive');
    } else {
        switchBtn.classList.add('inactive');
        switchBtn.classList.remove('active');
    }
    localStorage.setItem('biometricForLogin', newState ? 'true' : 'false');
    
    // Update security module keys if they exist
    if (window.__sec_KEYS && window.__sec_KEYS.bioLogin) {
        localStorage.setItem(window.__sec_KEYS.bioLogin, newState ? '1' : '0');
    }
    
    // 🔥 CHECK: If BOTH children are now OFF, turn parent OFF
    const bioForTx = localStorage.getItem('biometricForTx') === 'true';
    if (!newState && !bioForTx) {
        console.log('[DEBUG] Both children OFF -> disabling parent');
        localStorage.setItem('biometricsEnabled', 'false');
        
        // Update security module parent key if exists
        if (window.__sec_KEYS && window.__sec_KEYS.biom) {
            localStorage.setItem(window.__sec_KEYS.biom, '0');
        }
        
        // Update parent UI
        const mainSwitch = document.getElementById('biometricsSwitch');
        if (mainSwitch) {
            mainSwitch.setAttribute('aria-checked', 'false');
            mainSwitch.classList.remove('active');
            mainSwitch.classList.add('inactive');
        }
        
        // Hide subgroup
        const subgroup = document.getElementById('biometricsOptions');
        if (subgroup) subgroup.hidden = true;
        
        if (typeof notify === 'function') {
            notify('Biometrics fully disabled (both options off)', 'info');
        }
    } else {
        if (typeof notify === 'function') {
            notify(newState ? 'Biometrics enabled for login' : 'Biometrics disabled for login', newState ? 'success' : 'info');
        }
    }
    
    console.log('[DEBUG] handleBioLoginToggle complete:', {
        bioForLogin: localStorage.getItem('biometricForLogin'),
        bioForTx: localStorage.getItem('biometricForTx'),
        biometricsEnabled: localStorage.getItem('biometricsEnabled')
    });
}

async function handleBioTxToggle(e) {
    e.preventDefault();
    const switchBtn = e.currentTarget;
    const currentlyOn = switchBtn.getAttribute('aria-checked') === 'true';
    const newState = !currentlyOn;
    
    console.log('[DEBUG] handleBioTxToggle clicked:', { currentlyOn, newState });
    
    // Update this child's state
    switchBtn.setAttribute('aria-checked', newState.toString());
    if (newState) {
        switchBtn.classList.add('active');
        switchBtn.classList.remove('inactive');
    } else {
        switchBtn.classList.add('inactive');
        switchBtn.classList.remove('active');
    }
    localStorage.setItem('biometricForTx', newState ? 'true' : 'false');
    
    // Update security module keys if they exist
    if (window.__sec_KEYS && window.__sec_KEYS.bioTx) {
        localStorage.setItem(window.__sec_KEYS.bioTx, newState ? '1' : '0');
    }
    
    // 🔥 CHECK: If BOTH children are now OFF, turn parent OFF
    const bioForLogin = localStorage.getItem('biometricForLogin') === 'true';
    if (!newState && !bioForLogin) {
        console.log('[DEBUG] Both children OFF -> disabling parent');
        localStorage.setItem('biometricsEnabled', 'false');
        
        // Update security module parent key if exists
        if (window.__sec_KEYS && window.__sec_KEYS.biom) {
            localStorage.setItem(window.__sec_KEYS.biom, '0');
        }
        
        // Update parent UI
        const mainSwitch = document.getElementById('biometricsSwitch');
        if (mainSwitch) {
            mainSwitch.setAttribute('aria-checked', 'false');
            mainSwitch.classList.remove('active');
            mainSwitch.classList.add('inactive');
        }
        
        // Hide subgroup
        const subgroup = document.getElementById('biometricsOptions');
        if (subgroup) subgroup.hidden = true;
        
        if (typeof notify === 'function') {
            notify('Biometrics fully disabled (both options off)', 'info');
        }
    } else {
        if (typeof notify === 'function') {
            notify(newState ? 'Biometrics enabled for transactions' : 'Biometrics disabled for transactions', newState ? 'success' : 'info');
        }
    }
    
    console.log('[DEBUG] handleBioTxToggle complete:', {
        bioForLogin: localStorage.getItem('biometricForLogin'),
        bioForTx: localStorage.getItem('biometricForTx'),
        biometricsEnabled: localStorage.getItem('biometricsEnabled')
    });
}

// 🔹 Optional: Main toggle stub (if not defined — calls register/disable)
async function handleBioToggle(e) {
  e.preventDefault();
  const mainSwitch = e.currentTarget;
  const currentlyEnabled = mainSwitch.getAttribute('aria-checked') === 'true';
  
  if (currentlyEnabled) {
    // Disable: Revoke + clear
    await disableBiometrics();  // Your disable func (if exists; else local clear)
    mainSwitch.setAttribute('aria-checked', 'false');
    mainSwitch.classList.remove('active');
    mainSwitch.classList.add('inactive');
    const subgroup = document.getElementById('biometricsOptions');
    if (subgroup) subgroup.hidden = true;
    notify('Biometrics disabled', 'info');
  } else {
    // Enable: Register
    const { success } = await registerBiometrics();  // Your register func
    if (success) {
      mainSwitch.setAttribute('aria-checked', 'true');
      mainSwitch.classList.add('active');
      mainSwitch.classList.remove('inactive');
      const subgroup = document.getElementById('biometricsOptions');
      if (subgroup) subgroup.hidden = false;
      // Default subs on (optional)
      localStorage.setItem('biometricForLogin', 'true');
      localStorage.setItem('biometricForTx', 'true');
      notify('Biometrics enabled', 'success');
    }
  }
}


// // === Safety shim: ensure pollStatus exists (place this near top, before onDashboardLoad runs) ===
if (typeof pollStatus === 'undefined') {
  // keep minimal global guards
  window.__fg_poll_inflight = window.__fg_poll_inflight || null;
  window.__fg_last_poll_ts = window.__fg_last_poll_ts || 0;
  window.FG_POLL_MIN_MS = window.FG_POLL_MIN_MS || 600;

  window.pollStatus = async function pollStatus() {
    const now = Date.now();

    // dedupe in-flight
    if (window.__fg_poll_inflight) {
      console.debug('pollStatus shim: reusing in-flight');
      return window.__fg_poll_inflight;
    }

    // throttle
    if (now - (window.__fg_last_poll_ts || 0) < (window.FG_POLL_MIN_MS || 600)) {
      console.debug('pollStatus shim: called too soon — skipping');
      return Promise.resolve();
    }

    window.__fg_poll_inflight = (async () => {
      try {
        if (typeof _pollStatus_internal === 'function') {
          // preferred: call your internal implementation
          return await _pollStatus_internal();
        }

        // fallback: simple processable fetch (keeps UI stable until real implementation available)
        try {
          const apiBase = (window.__SEC_API_BASE || (typeof API_BASE !== 'undefined' ? API_BASE : ''));
          const url = apiBase ? `${apiBase}/api/status` : '/api/status';
          const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
          let body = null;
          try {
            const ct = res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-type') : null;
            if (res.status !== 204 && ct && ct.toLowerCase().includes('application/json')) {
              body = await res.json();
            }
          } catch (e) { /* ignore parse */ }

          if (body && body.notification) {
            const notif = Array.isArray(body.notification) ? (body.notification[0] || null) : body.notification;
            if (notif) {
              try {
                showBanner(notif.message || '', { persistent: !!notif.sticky, serverId: notif.id });
                window.__fg_currentBanner = window.__fg_currentBanner || {};
                window.__fg_currentBanner.serverId = notif.id;
                localStorage.setItem('active_broadcast_id', String(notif.id));
              } catch (e) { console.warn('pollStatus shim: showBanner failed', e); }
            }
          }
          return res;
        } catch (e) {
          console.debug('pollStatus shim: fallback fetch failed', e);
          return null;
        }
      } finally {
        window.__fg_last_poll_ts = Date.now();
        window.__fg_poll_inflight = null;
      }
    })();

    return window.__fg_poll_inflight;
  };
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

  // --- SINGLE getSession() call (capture result) ---
  let session = null;
  try {
    session = await getSession(); // <-- only one call in the entire function
  } catch (err) {
    console.warn('[onDashboardLoad] getSession() failed:', err);
    session = null;
  }
  setupBroadcastSubscription();


  // 🔥 ADD THESE TWO LINES (after the single getSession)
  await renderDashboardCardsFromState({ preferServer: true });

  initializeSmartAccountPinButton();

  // fetch active broadcasts (separate; doesn't call getSession)
  try {
    const broadcasts = await fetchActiveBroadcasts(); // this already shows banner & sets active_broadcast_id
    console.debug('[BCAST] fetchActiveBroadcasts returned', broadcasts.length);
  } catch (err) {
    console.warn('[BCAST] fetchActiveBroadcasts failed at login', err);
  }

  // Securely sync PIN/bio flags to storage on load
  try {
    // 🔹 Force fresh fetch for flags (bypass 5min cache — add Cache-Control: no-cache to bust browser cache)
    const freshRes = await fetch(`${window.__SEC_API_BASE}/api/session`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'  // Ensure fresh server data
      }
    });
    if (!freshRes.ok) throw new Error(`Fresh session fetch failed: ${freshRes.status}`);
    const freshPayload = await freshRes.json();
    const freshSession = { user: freshPayload.user || {} };  // Mimic getSession structure

    // 🔹 DEBUG: Log raw fresh session for bio/pin (remove after fix)
    console.log('[DEBUG-SYNC-FRESH] Raw fresh session.user:', {
      hasPin: freshSession?.user?.hasPin,
      hasBiometrics: freshSession?.user?.hasBiometrics,
      uid: freshSession?.user?.uid,
      email: freshSession?.user?.email
    });

    const hasPin = freshSession?.user?.hasPin || localStorage.getItem('hasPin') === 'true' || false;
    localStorage.setItem('hasPin', hasPin ? 'true' : 'false');

    // 🔹 Align biometrics with fresh server fallback (uses backend's hasBiometrics count)
    const biometricsEnabled = freshSession?.user?.hasBiometrics || localStorage.getItem('biometricsEnabled') === 'true' || false;
    localStorage.setItem('biometricsEnabled', biometricsEnabled ? 'true' : 'false');

    // 🔹 DEBUG: Log post-sync localStorage (remove after fix)
    console.log('[DEBUG-SYNC-FRESH] Post-sync localStorage:', {
      hasPin: localStorage.getItem('hasPin'),
      biometricsEnabled: localStorage.getItem('biometricsEnabled'),
      credentialId: localStorage.getItem('credentialId')
    });

    if (biometricsEnabled) {
      const storedLogin = localStorage.getItem('biometricForLogin');
      const storedTx = localStorage.getItem('biometricForTx');

      if (storedLogin === null) localStorage.setItem('biometricForLogin', 'true');
      if (storedTx === null) localStorage.setItem('biometricForTx', 'true');

      console.log('[DEBUG-SYNC] Sub-flags preserved/defaulted:', {
        bioForLogin: localStorage.getItem('biometricForLogin') === 'true',
        bioForTx: localStorage.getItem('biometricForTx') === 'true'
      });
    }

    // If bio enabled and credentialId exists, prefetch immediately
    if (localStorage.getItem('biometricsEnabled') === 'true' && localStorage.getItem('credentialId')) {
      prefetchAuthOptions();
    }
    await restoreBiometricUI();

  } catch (err) {
    console.warn('[onDashboardLoad] Flag sync error', err);
    // Fallback: Use the single-session result captured earlier (if any),
    // otherwise leave localStorage as-is or apply conservative defaults.
    try {
      const useSession = session; // reuse single call result (may be null)
      const hasPin = useSession?.user?.hasPin || localStorage.getItem('hasPin') === 'true' || false;
      localStorage.setItem('hasPin', hasPin ? 'true' : 'false');

      const biometricsEnabled = useSession?.user?.hasBiometrics || localStorage.getItem('biometricsEnabled') === 'true' || false;
      localStorage.setItem('biometricsEnabled', biometricsEnabled ? 'true' : 'false');

      // When biometrics not enabled, don't leave children in an indeterminate state:
      if (!biometricsEnabled) {
        localStorage.setItem('biometricForLogin', 'false');
        localStorage.setItem('biometricForTx', 'false');
      }

      if (biometricsEnabled && localStorage.getItem('credentialId')) {
        prefetchAuthOptions();
      }
      await restoreBiometricUI();
    } catch (fallbackErr) {
      console.error('[onDashboardLoad] Fallback sync failed too', fallbackErr);
    }
  }


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

  // --------------------------
  // React to successful reauth
  // --------------------------
  (function(){
    let __fg_reauth_timer = null;
    const __fg_reauth_debounce_ms = 600; // slightly larger debounce to allow server to settle
    // Short-circuit: do not start a new poll if one started recently
    const MIN_REAUTH_POLL_MS = 700;
    let __fg_last_reauth_poll = 0;

    window.addEventListener('fg:reauth-success', (ev) => {
      try {
        if (typeof hideTinyReauthNotice === 'function') {
          try { hideTinyReauthNotice(); } catch (e) { /* swallow */ }
        }

        if (__fg_reauth_timer) clearTimeout(__fg_reauth_timer);
        __fg_reauth_timer = setTimeout(() => {
          __fg_reauth_timer = null;
          const now = Date.now();
          if (now - __fg_last_reauth_poll < MIN_REAUTH_POLL_MS) {
            console.debug('fg:reauth-success: recent poll already run — skipping immediate poll');
            return;
          }
          __fg_last_reauth_poll = now;
          try {
            if (typeof pollStatus === 'function') {
              pollStatus();
            }
          } catch (e) {
            console.warn('fg:reauth-success -> pollStatus failed', e);
          }
        }, __fg_reauth_debounce_ms);
      } catch (err) {
        console.warn('fg:reauth-success handler error', err);
      }
    }, { passive: true });
  })();

  // Boot-time: decide soft vs hard reauth using server authoritive check.
// If we were away long enough, ask server whether session is locked.
// If locked -> open the full reauth modal immediately. Otherwise fall back to soft prompt.
try {
  const IDLE_TIME = 30 * 60 * 1000; // 30 minutes
  const last = parseInt(localStorage.getItem('lastActive')) || 0;
  if (Date.now() - last > IDLE_TIME) {
    let reauthCheck = null;
    try {
      reauthCheck = await shouldReauth(); // shouldReauth talks to /reauth/status
    } catch (e) {
      console.warn('boot-time shouldReauth failed, falling back to soft prompt', e);
    }

    if (reauthCheck && reauthCheck.needsReauth) {
      // Server says reauth required -> open authoritative reauth modal immediately
      try {
        if (window.__reauth && typeof window.__reauth.showReauthModal === 'function') {
          await window.__reauth.showReauthModal('reauth');
        } else {
          await showReauthModal('reauth');
        }
      } catch (e) {
        console.warn('Failed to show reauth modal on boot; falling back to inactivity prompt', e);
        await showInactivityPrompt();
      }
    } else {
      // session still OK -> soft inactivity or just reset timer
      try { resetIdleTimer(); } catch (e) { console.warn('resetIdleTimer on boot failed', e); }
    }
  }
} catch (e) {
  console.warn('boot-time inactivity check failed', e);
}

  if (window.__idleDetection) {
    await window.__idleDetection.setup();
  }

  // Initial status fetch
if (typeof pollStatus === 'function') pollStatus();

// Start polling
setInterval(() => pollStatus(), 30000);


  // Rocket: register SW, start pollStatus, etc.
  async function registerSW() {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/service-worker.js');
        console.log('[DEBUG] SW registered', reg);
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                setTimeout(() => {
                  if (confirm('Update available! Reload for latest features?')) {
                    window.location.reload();
                  }
                }, 2000);
              } else {
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

  // Post-login re-sync
  if (localStorage.getItem('justLoggedIn') === 'true') {
    localStorage.removeItem('justLoggedIn');
    setupInactivity();
  }

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

  registerSW();
  checkForUpdates();
  pollStatus(); // Initial
  setInterval(pollStatus, 30000); // Every 30s


}


// ============================================
// SMART DASHBOARD CARDS (Setup Pin + Update Profile)
// ============================================

/**
 * Hides dashboard cards based on completion status from server
 * Call this after getSession() or on dashboard load
 */
// Updated manageDashboardCards(): Force server check + instant apply, with await for sync to ensure no flash/revert.
// Mirrors profile logic exactly (symmetric). Calls apply after sync completes, not in parallel.
// Added forceHide param for manual calls (e.g., after PIN setup success) to immediately hide if local/server confirms true.

// Enhanced manageDashboardCards() with VERBOSE LOGS: Trace every step (local reads, server fetch, updates, applies).
// Logs prefixed with [DC-TRACE] for easy grep. Run this, add PIN, check console for flow.
// Added timestamps for timing analysis (e.g., race detection).

// FIXED manageDashboardCards(): Symmetric server sync for BOTH cards.
// - Profile now explicitly awaits server.user.profileCompleted (like PIN's hasPin).
// - Fixed dispatch bug: Use oldProfileCompleted (not oldHasPin).
// - Enhanced logs for Profile sync (e.g., 'SYNC: Profile server value').
// - Ensures localStorage updated from server, then re-apply (no local-only fallback unless error).
// - On error, log but still apply from local (graceful).

async function manageDashboardCards(forceHidePin = false, forceShowProfile = false) {
    const traceId = `DC-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const log = (msg, data = {}) => {
        const ts = new Date().toISOString();
        console.log(`[DC-TRACE ${ts} #${traceId}] ${msg}`, data);
    };
    
    try {
        log('START: Checking cards visibility', { forceHidePin, forceShowProfile });
        
        // Helper to apply visibility to a card
        function applyToCard(cardId, shouldHide, cardType = 'generic') {
            const card = document.getElementById(cardId);
            if (!card) {
                log(`APPLY: ${cardType} card element NOT FOUND - check ID '${cardId}'`);
                return;
            }
            
            const hideClass = 'dashboard-card-hidden';
            const fadeClass = 'dashboard-card-fading';
            
            log(`APPLY: ${cardType} card - shouldHide: ${shouldHide}`, { id: cardId });
            
            if (shouldHide) {
                // Graceful: Fade first, then hide
                card.classList.add(fadeClass);
                setTimeout(() => {
                    card.classList.add(hideClass);
                    card.classList.remove(fadeClass);
                    log(`APPLY: ${cardType} fade-to-hide complete`);
                }, 200);
            } else {
                // Show: Remove classes, force flex inline (resets overrides)
                card.classList.remove(hideClass, fadeClass);
                card.style.display = 'flex';  // Inline restore - no !important needed
                log(`APPLY: ${cardType} show with inline flex`);
            }
            
            // Post-paint verification
            requestAnimationFrame(() => {
                const computed = getComputedStyle(card).display;
                log(`APPLY: ${cardType} post-paint check`, { 
                    shouldHide, 
                    computed, 
                    finalVisible: computed !== 'none',
                    classList: card.className 
                });
                
                // Force if mismatch
                if (shouldHide && computed !== 'none') {
                    log(`WARN: ${cardType} mismatch - forcing hide`);
                    card.classList.add(hideClass);
                    card.style.setProperty('display', 'none', 'important');
                } else if (!shouldHide && computed !== 'flex') {
                    log(`WARN: ${cardType} mismatch - forcing flex`);
                    card.style.setProperty('display', 'flex', 'important');
                }
            });
        }
        
        // 🔥 APPLY INSTANTLY from localStorage (initial render)
        log('PHASE1: Instant apply from localStorage');
        const localHasPin = localStorage.getItem('hasPin') === 'true';
        const localProfileCompleted = localStorage.getItem('profileCompleted') === 'true';
        
        // Apply to PIN card
        applyToCard('dashboardPinCard', localHasPin || forceHidePin, 'PIN');
        
        // Apply to Profile card (local first)
        applyToCard('dashboardUpdateProfileCard', localProfileCompleted || !forceShowProfile, 'Profile');
        
        // Listeners (unchanged)
        if (!window.__dashboardListenersAttached) {
            log('ATTACH: Adding global listeners');
            window.addEventListener('pin-status-changed', (e) => {
                log('EVENT: pin-status-changed');
                manageDashboardCards(true);
            });
            window.addEventListener('profile-status-changed', (e) => {
                log('EVENT: profile-status-changed');
                manageDashboardCards(false, true);  // Force show Profile
            });
            window.addEventListener('storage', (e) => {
                log('EVENT: storage changed', { key: e.key });
                if (e.key === 'hasPin') manageDashboardCards(true);
                if (e.key === 'profileCompleted') manageDashboardCards(false, true);
            });
            window.__dashboardListenersAttached = true;
        } else {
            log('ATTACH: Listeners already attached');
        }
        
        // 🔥 BACKGROUND SYNC: Await server for BOTH (authoritative - overrides local)
        log('PHASE2: Background server sync (await getSession for both PIN + Profile)');
        try {
            if (typeof getSession === 'function') {
                log('SYNC: Calling getSession()');
                const sessionStart = Date.now();
                const session = await getSession();  // Await fresh server data
                const sessionDuration = Date.now() - sessionStart;
                log('SYNC: getSession() complete', { durationMs: sessionDuration, sessionExists: !!session });
                
                if (session?.user) {
                    // PIN: Server check
                    const serverHasPin = session.user.hasPin || false;
                    log('SYNC: PIN server value', { serverHasPin });
                    
                    // Profile: Server check (symmetric)
                    const serverProfileCompleted = session.user.profileCompleted || false;
                    log('SYNC: Profile server value', { serverProfileCompleted });
                    
                    // Track old locals for dispatch
                    const oldHasPin = localHasPin;
                    const oldProfileCompleted = localProfileCompleted;
                    log('SYNC: Old local values', { oldHasPin, oldProfileCompleted });
                    
                    // Update localStorage from server (authoritative for both)
                    localStorage.setItem('hasPin', serverHasPin ? 'true' : 'false');
                    localStorage.setItem('profileCompleted', serverProfileCompleted ? 'true' : 'false');
                    log('SYNC: Updated localStorage from server', { newHasPin: serverHasPin, newProfileCompleted: serverProfileCompleted });
                    
                    // Re-apply to BOTH after update
                    log('SYNC: Re-applying to PIN after server sync');
                    applyToCard('dashboardPinCard', serverHasPin, 'PIN');
                    
                    log('SYNC: Re-applying to Profile after server sync');
                    applyToCard('dashboardUpdateProfileCard', serverProfileCompleted, 'Profile');
                    
                    // Dispatch if changed
                    if (serverHasPin !== oldHasPin) {
                        log('SYNC: Dispatching pin-status-changed');
                        window.dispatchEvent(new Event('pin-status-changed'));
                    }
                    if (serverProfileCompleted !== oldProfileCompleted) {
                        log('SYNC: Dispatching profile-status-changed');
                        window.dispatchEvent(new Event('profile-status-changed'));
                    }
                } else {
                    log('SYNC: No user in session - fallback to local');
                }
            } else {
                log('SYNC: getSession() not available - fallback to local');
            }
        } catch (e) {
            log('SYNC: Failed', { error: e.message });
            // Fallback: Re-apply from local (but log warning - server check failed)
            log('SYNC: Fallback re-apply from local (server error)');
            applyToCard('dashboardPinCard', localHasPin, 'PIN');
            applyToCard('dashboardUpdateProfileCard', localProfileCompleted, 'Profile');
        }
        
        log('END: manageDashboardCards complete');
        
    } catch (err) {
        log('ERROR: Unexpected', { error: err.message });
    }
}

function initializeSmartAccountPinButton() {
    try {
        // Find the Account Pin row in security modal
        const accountPinRow = document.getElementById('securityPinRow');
        const accountPinStatus = document.getElementById('accountPinStatus');    if (!accountPinRow || !accountPinStatus) {
        console.warn('[Smart PIN Button] Account Pin elements not found in security modal');
        return;
    }
    
    console.log('[Smart PIN Button] Found Account Pin row, setting up smart behavior');
    
    // Helper: Open a PIN modal with fallbacks + accessibility (DRY)
    async function openPinModal(mode = 'setup') {
        const modalId = mode === 'change' ? 'securityPinModal' : 'pinModal';
        
        if (typeof window.ModalManager !== 'undefined' && typeof window.ModalManager.openModal === 'function') {
            window.ModalManager.openModal(modalId);
            console.log(`[Smart PIN Button] Opened ${modalId} via ModalManager for ${mode}`);
        } else {
            // Direct fallback
            const modal = document.getElementById(modalId) || 
                          document.querySelector(`.${mode === 'change' ? 'pin-change-modal' : 'pin-setup-modal'}`);
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('active');
                modal.style.display = 'flex';
                console.log(`[Smart PIN Button] Direct open ${modalId} for ${mode}`);
            } else {
                console.error(`[Smart PIN Button] ${modalId} not found for ${mode}`);
                if (typeof notify === 'function') notify(`${mode.charAt(0).toUpperCase() + mode.slice(1)} PIN not available`, 'error');
                return false;
            }
        }
        setTimeout(() => focusFirstInput(mode), 100);
        return true;
    }
    
    // Helper: Focus first input in modal for accessibility
    function focusFirstInput(mode) {
        const modal = document.querySelector('.modal.active, .pin-modal:not(.hidden), #pinModal:not(.hidden), #securityPinModal:not(.hidden)');
        if (!modal) return;
        const firstInput = modal.querySelector('input[type="password"], input[autofocus], .pin-input, input[role="pin"]');
        
        // Avoid auto-focus on mobile devices (prevents keyboard show/hide flicker)
        const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
        if (!firstInput) {
            // fallback: focus the modal container title so screen readers get context without scroll
            try { modal.querySelector('h2, .modal-title, [role="banner"]')?.focus?.({ preventScroll: true }); } catch(e) {}
            return;
        }
        
        if (isMobile) {
            // On mobile, focus a non-input element to avoid keyboard instantly showing
            try { const title = modal.querySelector('.pin-header h2, .modal-title'); if (title) title.focus({ preventScroll: true }); } catch (e) {}
            return;
        }
        
        try {
            firstInput.focus({ preventScroll: true });
            firstInput.setAttribute('aria-label', mode === 'change' ? 'Enter current PIN' : 'Enter new PIN');
        } catch (e) {
            try { firstInput.focus(); } catch (e2) {}
        }
    }
    
    // Function to update button text based on PIN status
    function updateAccountPinButton() {
        const hasPin = localStorage.getItem('hasPin') === 'true';
        
        if (hasPin) {
            accountPinStatus.textContent = 'PIN set. You can change your PIN here';
            console.log('[Smart PIN Button] Updated to "change PIN" mode');
        } else {
            accountPinStatus.textContent = 'No PIN set. Setup PIN';
            console.log('[Smart PIN Button] Updated to "setup PIN" mode');
        }
    }
    
    // Update button text initially
    updateAccountPinButton();
    
    // Override click handler (CAPTURE PHASE: Blocks ModalManager early)
    accountPinRow.addEventListener('click', async function(e) {
        // BLOCK OVERLAP: Stop ALL propagation (ModalManager won't fire)
        e.stopImmediatePropagation();
        e.preventDefault();
        e.stopPropagation();
        
        const hasPin = localStorage.getItem('hasPin') === 'true';
        
        console.log('[Smart PIN Button] Clicked (blocked ModalManager), hasPin:', hasPin);
        
        const opened = await openPinModal(hasPin ? 'change' : 'setup');
        if (!opened) {
            console.warn('[Smart PIN Button] Failed to open modal');
            return;
        }
        
        // REMOVED: Manual close of security modal. Now handled by stack for proper back/close behavior.
    }, { capture: true, passive: false });  // Capture: Runs FIRST!
    
    // Listen for PIN status changes (e.g., after successful PIN setup)
    window.addEventListener('pin-status-changed', function() {
        console.log('[Smart PIN Button] PIN status changed, updating button');
        updateAccountPinButton();
        
        // Also refresh dashboard cards (if function exists and we're on dashboard)
        if (typeof manageDashboardCards === 'function') {
            manageDashboardCards();
        }
    });
    
    // Also listen for storage changes (cross-tab sync)
    window.addEventListener('storage', function(e) {
        if (e.key === 'hasPin') {
            console.log('[Smart PIN Button] hasPin changed in storage, updating button');
            updateAccountPinButton();
        }
    });
    
    console.log('[Smart PIN Button] Initialization complete');
    
} catch (err) {
    console.error('[Smart PIN Button] Initialization error:', err);
}}


// 🔹 Biometric UI Restoration (runs on load to persist state across reloads)
// 🔹 Biometric UI Restoration (runs on load to persist state across reloads)
// 🔹 Biometric UI Restoration (targets SETTINGS toggle: #biometricsSwitch + subs)
// 🔹 Biometric UI Restoration (with tighter guards + default subs on)
// ----------------- Fixed restoreBiometricUI (drop-in replacement) -----------------
// 🔹 Fixed Biometric UI Restoration (parent follows children rule)
// ----------------- Fixed restoreBiometricUI (handles reload correctly) -----------------
async function restoreBiometricUI() {
    // 🔥 READ VALUES FIRST - Don't let anything modify them yet
    const biometricsEnabledRaw = localStorage.getItem('biometricsEnabled');
    const credentialId = localStorage.getItem('credentialId') || localStorage.getItem('webauthn-cred-id');
    const hasPin = localStorage.getItem('hasPin') === 'true';
    const bioForLoginRaw = localStorage.getItem('biometricForLogin');
    const bioForTxRaw = localStorage.getItem('biometricForTx');
    
    console.log('[DEBUG-UI] restoreBiometricUI RAW localStorage reads:', {
        biometricsEnabled: biometricsEnabledRaw,
        credentialId: credentialId,
        bioForLogin: bioForLoginRaw,
        bioForTx: bioForTxRaw,
        hasPin
    });
    
    // Parse flags
    let biometricsEnabled = biometricsEnabledRaw === 'true';
    let bioForLogin = bioForLoginRaw === 'true';
    let bioForTx = bioForTxRaw === 'true';
    
    // 🔥 KEY RULE: Parent can only be ON if at least one child is ON
    const atLeastOneChildEnabled = bioForLogin || bioForTx;
    
    // Handle first-time setup (all keys are null)
    if (biometricsEnabledRaw === null && bioForLoginRaw === null && bioForTxRaw === null) {
        console.log('[DEBUG-UI] First-time setup detected, leaving all OFF');
        biometricsEnabled = false;
        bioForLogin = false;
        bioForTx = false;
    }
    // If biometricsEnabled is true but children keys are unset -> default them to true
    else if (biometricsEnabled && bioForLoginRaw === null && bioForTxRaw === null) {
        console.log('[DEBUG-UI] Bio enabled but children unset -> defaulting children to true');
        bioForLogin = true;
        bioForTx = true;
        localStorage.setItem('biometricForLogin', 'true');
        localStorage.setItem('biometricForTx', 'true');
    }
    // If biometricsEnabled is true but BOTH children are explicitly false -> turn parent OFF
    else if (biometricsEnabled && !bioForLogin && !bioForTx) {
        console.log('[DEBUG-UI] Both children OFF -> turning parent OFF');
        biometricsEnabled = false;
        localStorage.setItem('biometricsEnabled', 'false');
    }
    // If biometricsEnabled is false -> ensure children are false
    else if (!biometricsEnabled) {
        console.log('[DEBUG-UI] Parent OFF -> ensuring children OFF');
        bioForLogin = false;
        bioForTx = false;
        localStorage.setItem('biometricForLogin', 'false');
        localStorage.setItem('biometricForTx', 'false');
    }
    
    // Final state
    console.log('[DEBUG-UI] restoreBiometricUI FINAL state:', {
        biometricsEnabled,
        hasCred: !!credentialId,
        hasPin,
        bioForLogin,
        bioForTx,
        atLeastOneChildEnabled: bioForLogin || bioForTx
    });
    
    // Helper: Apply state to a switch button
    function applySwitchState(btn, checked) {
        if (!btn) return;
        try {
            btn.setAttribute('aria-checked', String(!!checked));
            if (checked) {
                btn.classList.add('active');
                btn.classList.remove('inactive');
            } else {
                btn.classList.add('inactive');
                btn.classList.remove('active');
            }
        } catch (e) {
            console.warn('applySwitchState failed', e);
        }
    }
    
    // Helper: Apply full state (main toggle + subs + subgroup)
    function applyFullState() {
        const mainSwitch = document.getElementById('biometricsSwitch');
        if (!mainSwitch) {
            console.warn('[WARN-UI] Main switch (#biometricsSwitch) not found');
            return false;
        }
        
        // 🔥 Parent state depends on: enabled flag + credential exists + at least one child enabled
        const shouldParentBeOn = biometricsEnabled && credentialId && (bioForLogin || bioForTx);
        
        console.log('[DEBUG-UI] Applying UI state:', {
            shouldParentBeOn,
            biometricsEnabled,
            hasCredential: !!credentialId,
            bioForLogin,
            bioForTx
        });
        
        if (shouldParentBeOn) {
            // Case A: Parent ON (at least one child is enabled + credential exists)
            applySwitchState(mainSwitch, true);
            const subgroup = document.getElementById('biometricsOptions');
            if (subgroup) subgroup.hidden = false;
            
            applySwitchState(document.getElementById('bioLoginSwitch'), bioForLogin);
            applySwitchState(document.getElementById('bioTxSwitch'), bioForTx);
            
            const setupCta = document.getElementById('biometricsSetupCta');
            if (setupCta) setupCta.hidden = true;
            
            console.log('[DEBUG-UI] ✅ Applied ACTIVE state (parent ON, children visible)');
            
        } else if (biometricsEnabled && !credentialId) {
            // Case B: Server says enabled but no local credential -> show setup CTA
            applySwitchState(mainSwitch, false);
            const subgroup = document.getElementById('biometricsOptions');
            if (subgroup) subgroup.hidden = true;
            
            const setupCta = document.getElementById('biometricsSetupCta');
            if (setupCta) {
                setupCta.hidden = false;
            }
            
            console.warn('[WARN-UI] biometricsEnabled true but credential missing; showing setup CTA');
            
        } else {
            // Case C: Parent OFF (either disabled OR both children off OR no credential)
            applySwitchState(mainSwitch, false);
            const subgroup = document.getElementById('biometricsOptions');
            if (subgroup) subgroup.hidden = true;
            
            const setupCta = document.getElementById('biometricsSetupCta');
            if (setupCta) setupCta.hidden = true;
            
            console.log('[DEBUG-UI] ⭕ Applied INACTIVE state (parent OFF, children hidden)');
        }
        
        // Re-attach main/sub handlers defensively
        if (!mainSwitch.__eventsAttached) {
            if (typeof handleBioToggle === 'function') {
                try { mainSwitch.addEventListener('click', handleBioToggle); } catch (e) {}
            }
            mainSwitch.__eventsAttached = true;
        }
        
        
        
        console.log('[DEBUG-UI] Final UI state - main aria-checked:', mainSwitch.getAttribute('aria-checked'));
        console.log('[DEBUG-UI] Final UI state - subgroup hidden:', document.getElementById('biometricsOptions')?.hidden);
        
        return true;
    }
    
    // Immediate apply (if DOM ready)
    if (applyFullState()) return;
    
    // If main switch not present yet, observe DOM until it appears
    const observer = new MutationObserver((mutations) => {
        if (applyFullState()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Safety timeout (stop after 5s)
    setTimeout(() => {
        observer.disconnect();
        if (!document.getElementById('biometricsSwitch')) {
            console.error('[ERROR-UI] Settings toggle (#biometricsSwitch) never found — check markup');
        }
    }, 5000);
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

// ====== PIN global bindings (must be at top-level, before any usage) ======
// Use `var` so the identifier exists as a global binding immediately (prevents ReferenceError)
var __fg_pin_inputCurrentEl = null;
var __fg_pin_inputNewEl = null;
var __fg_pin_inputConfirmEl = null;
var __fg_pin_changePinForm = null;
var __fg_pin_securityPinModal = null;
var __fg_pin_resetPinBtn = null;


// Defensive safe clear (override any other definition)
(function installSafeClear() {
  const previous = window.__fg_pin_clearAllInputs;
  window.__fg_pin_clearAllInputs = function __fg_pin_clearAllInputs_safe() {
    try {
      // Prefer the declared globals if available, fallback to DOM queries
      const cur = (typeof __fg_pin_inputCurrentEl !== 'undefined' && __fg_pin_inputCurrentEl) ? __fg_pin_inputCurrentEl : document.getElementById('currentPin');
      const neu = (typeof __fg_pin_inputNewEl !== 'undefined' && __fg_pin_inputNewEl) ? __fg_pin_inputNewEl : document.getElementById('newPin');
      const conf = (typeof __fg_pin_inputConfirmEl !== 'undefined' && __fg_pin_inputConfirmEl) ? __fg_pin_inputConfirmEl : document.getElementById('confirmPin');

      if (cur) try { cur.value = ''; } catch (e) {}
      if (neu) try { neu.value = ''; } catch (e) {}
      if (conf) try { conf.value = ''; } catch (e) {}

      if (cur && typeof cur.focus === 'function') try { cur.focus(); } catch(e) {}
    } catch (err) {
      console.warn('__fg_pin_clearAllInputs_safe failed', err);
      // If there was a previous implementation, call it (largest chance it's the intended logic)
      if (typeof previous === 'function') try { previous(); } catch (e) { /* swallow */ }
    }
  };
})();

// Instrument calls to locate who triggers the clear
(function traceClearCalls(){
  const orig = window.__fg_pin_clearAllInputs;
  window.__fg_pin_clearAllInputs = function tracedClear(...args){
    console.warn('TRACE: __fg_pin_clearAllInputs called — stack:');
    console.trace();
    if (typeof orig === 'function') {
      try { return orig.apply(this, args); } catch (e) { console.error('tracedClear orig failed', e); }
    }
  };
})();





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

// Defensive global override: clears PIN inputs safely (no ReferenceErrors)
window.__fg_pin_clearAllInputs = function __fg_pin_clearAllInputs_safe() {
  try {
    // Prefer cached globals if available, otherwise query DOM as a fallback
    const cur = (typeof __fg_pin_inputCurrentEl !== 'undefined' && __fg_pin_inputCurrentEl) ? __fg_pin_inputCurrentEl : document.getElementById('currentPin');
    const neu = (typeof __fg_pin_inputNewEl !== 'undefined' && __fg_pin_inputNewEl) ? __fg_pin_inputNewEl : document.getElementById('newPin');
    const conf = (typeof __fg_pin_inputConfirmEl !== 'undefined' && __fg_pin_inputConfirmEl) ? __fg_pin_inputConfirmEl : document.getElementById('confirmPin');

    if (cur) try { cur.value = ''; } catch (e) { /* ignore */ }
    if (neu) try { neu.value = ''; } catch (e) { /* ignore */ }
    if (conf) try { conf.value = ''; } catch (e) { /* ignore */ }

    // Focus the first input that exists
    if (cur && typeof cur.focus === 'function') {
      try { cur.focus(); } catch (e) { /* ignore */ }
    } else if (neu && typeof neu.focus === 'function') {
      try { neu.focus(); } catch (e) { /* ignore */ }
    }
  } catch (err) {
    // never let clearing inputs throw — the app must continue to surface server error messages
    console.warn('__fg_pin_clearAllInputs_safe failed', err);
  }
};


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


// temporary debug wrapper for fetch to /webauthn/auth/options
(function(){
  const orig = window.__origFetch || window.fetch;
  window.__debugFetchAuthOptions = true;
  window.fetch = async function(input, init) {
    try {
      const url = (typeof input === 'string') ? input : (input && input.url) || '';
      if (url.indexOf('/webauthn/auth/options') !== -1) {
        let body = null;
        try { body = init && init.body ? JSON.parse(init.body) : null; } catch(e){ body = init && init.body ? init.body : null; }
        console.log('[DEBUG POST] ->', url, 'body:', body);
        const start = Date.now();
        const res = await orig(input, init);
        const text = await res.text().catch(()=>'(no body)');
        console.log('[DEBUG RESP] <-', url, 'status:', res.status, 'durationMs:', Date.now()-start, 'text:', text);
        // re-create response for callers
        return new Response(text, { status: res.status, headers: {'Content-Type':'application/json'} });
      }
    } catch(e){ console.warn('debug fetch wrapper error', e); }
    return orig(input, init);
  };
})();



// --- MAIN EVENT LISTENERS ---

// --- WebAuthn: centralized TTL-backed fetch for /webauthn/auth/options ---
// --- WebAuthn: centralized TTL-backed fetch for /webauthn/auth/options (robust + verbose logging) ---
(function(){
  const AUTH_OPTIONS_TTL = 30 * 1000; // 30s

  // Simple structured logger for raw traces
  function mkLog(prefix) {
    return {
      d: (...args) => console.debug(`[${prefix}] ${new Date().toISOString()}`, ...args),
      i: (...args) => console.info(`[${prefix}] ${new Date().toISOString()}`, ...args),
      w: (...args) => console.warn(`[${prefix}] ${new Date().toISOString()}`, ...args),
      e: (...args) => console.error(`[${prefix}] ${new Date().toISOString()}`, ...args)
    };
  }
  const __webauthn_log = mkLog('webauthn');

  function cacheAuthOptions(opts) {
    try {
      window.__cachedAuthOptions = opts || null;
      window.__cachedAuthOptionsFetchedAt = opts ? Date.now() : 0;
      __webauthn_log.d('cacheAuthOptions set', { fresh: !!opts, ts: window.__cachedAuthOptionsFetchedAt });
    } catch (e) {
      __webauthn_log.e('cacheAuthOptions error', e);
    }
  }

  function cachedOptionsFresh() {
    try {
      return !!(window.__cachedAuthOptions && window.__cachedAuthOptionsFetchedAt && (Date.now() - window.__cachedAuthOptionsFetchedAt) <= AUTH_OPTIONS_TTL);
    } catch(e){
      return false;
    }
  }

  // --- Robust fromBase64Url (replace existing definition if missing) ---
  if (!window.fromBase64Url) {
    window.fromBase64Url = function (input) {
      try {
        // null / undefined -> empty ArrayBuffer
        if (input == null) return new ArrayBuffer(0);

        // If already an ArrayBuffer -> return as-is
        if (input instanceof ArrayBuffer) return input;

        // If a TypedArray (Uint8Array, etc.) -> return its buffer
        if (ArrayBuffer.isView(input)) return input.buffer;

        // Node Buffer-like object: { type: 'Buffer', data: [...] }
        if (typeof input === 'object' && Array.isArray(input.data)) {
          return new Uint8Array(input.data).buffer;
        }

        // Plain numeric-keyed object (JSON-decoded typed array), e.g. {0:12,1:34,...}
        if (typeof input === 'object') {
          const keys = Object.keys(input);
          const numericKeys = keys.filter(k => /^[0-9]+$/.test(k));
          if (numericKeys.length) {
            const maxIndex = Math.max(...numericKeys.map(k => parseInt(k, 10)));
            const arr = new Uint8Array(maxIndex + 1);
            for (let i = 0; i <= maxIndex; i++) {
              arr[i] = typeof input[i] === 'number' ? input[i] & 0xff : 0;
            }
            return arr.buffer;
          }
          // Fallback: if it's some other object, try to take Object.values if they look numeric
          const vals = Object.values(input);
          if (Array.isArray(vals) && vals.length && typeof vals[0] === 'number') {
            return new Uint8Array(vals.map(v => v & 0xff)).buffer;
          }
        }

        // If it's a string -> treat as base64url and decode
        if (typeof input === 'string') {
          let s = input.replace(/-/g, '+').replace(/_/g, '/');
          while (s.length % 4) s += '=';
          const raw = atob(s);
          const arr = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
          return arr.buffer;
        }

        // Unknown type: log and return empty buffer
        console.warn('[webauthn] fromBase64Url: unknown input type', typeof input, input);
        return new ArrayBuffer(0);
      } catch (err) {
        console.warn('[webauthn] fromBase64Url error', err, input);
        return new ArrayBuffer(0);
      }
    };
  }

  function convertOptionsFromServer(publicKey) {
    try {
      if (!publicKey) return publicKey;

      if (publicKey.challenge) {
        const ch = fromBase64Url(publicKey.challenge);
        if (ch) publicKey.challenge = new Uint8Array(ch);
      }

      if (Array.isArray(publicKey.allowCredentials)) {
        publicKey.allowCredentials = publicKey.allowCredentials.map(function(c){
          try {
            let idBuf = null;
            if (typeof c.id === 'string') {
              idBuf = fromBase64Url(c.id);
            } else if (c instanceof ArrayBuffer) {
              idBuf = c;
            } else if (ArrayBuffer.isView(c.id)) {
              idBuf = c.id.buffer;
            } else if (typeof c.id === 'object') {
              // object may be {type:'Buffer',data:[...]} or numeric keys
              const maybe = fromBase64Url(c.id);
              idBuf = maybe && (maybe instanceof ArrayBuffer) ? maybe : null;
              if (!idBuf) {
                const vals = Object.values(c.id || {});
                if (vals.length && typeof vals[0] === 'number') idBuf = new Uint8Array(vals.map(v=>v&0xff)).buffer;
              }
            }
            return Object.assign({}, c, { id: idBuf ? new Uint8Array(idBuf) : idBuf });
          } catch (e) {
            __webauthn_log.w('allowCredentials conversion failed for item', c, e);
            return c;
          }
        });
      }

      return publicKey;
    } catch (e) {
      __webauthn_log.w('convertOptionsFromServer error', e);
      return publicKey;
    }
  }

  // small helper: try parse cached user from localStorage
  function deriveUserIdFromLocalStorage() {
    try {
      const ud = localStorage.getItem('userData') || localStorage.getItem('user');
      if (!ud) return null;
      const parsed = JSON.parse(ud);
      return parsed?.id || parsed?.uid || parsed?.userId || null;
    } catch (e) {
      __webauthn_log.w('deriveUserIdFromLocalStorage parse failed', e);
      return null;
    }
  }

  // helper: await getSession but timeout quickly (non-blocking friendly)
  async function tryGetSessionUserId(timeoutMs = 600) {
    if (typeof getSession !== 'function') return null;
    let resolved = null;
    try {
      const p = (async () => {
        try {
          const s = await getSession();
          return s?.user?.id || s?.user?.uid || null;
        } catch (e) {
          return null;
        }
      })();
      const t = new Promise(r => setTimeout(() => r(null), timeoutMs));
      resolved = await Promise.race([p, t]);
      return resolved;
    } catch (e) {
      __webauthn_log.w('tryGetSessionUserId failed', e);
      return null;
    }
  }

  // Core: getAuthOptionsWithCache
  window.getAuthOptionsWithCache = window.getAuthOptionsWithCache || (async function({ credentialId=null, userId=null }={}) {
    __webauthn_log.d('getAuthOptionsWithCache entry', { credentialId, userId, cachedFresh: cachedOptionsFresh() });
    if (cachedOptionsFresh()) {
      try {
        __webauthn_log.d('Returning fresh cached options (fast-path)');
        return JSON.parse(JSON.stringify(window.__cachedAuthOptions));
      } catch(e){
        __webauthn_log.w('Cache deep-copy failed, returning raw');
        return window.__cachedAuthOptions;
      }
    }

    const apiBase = (window.__SEC_API_BASE || (typeof API_BASE!=='undefined' ? API_BASE : ''));
    // derive credentialId if not supplied
    const resolvedCred = credentialId || localStorage.getItem('credentialId') || localStorage.getItem('webauthn-cred-id') || null;

    // derive userId via multiple fallbacks (explicit arg > cached global > localStorage userData > try getSession)
    let resolvedUser = userId || window.__webauthn_userId || deriveUserIdFromLocalStorage();
    if (!resolvedUser) {
      __webauthn_log.d('No userId yet, attempting short getSession wait');
      resolvedUser = await tryGetSessionUserId(600); // wait up to 600ms for session
    }
    __webauthn_log.d('Resolved identity', { userId: !!resolvedUser, credentialId: !!resolvedCred });

    // Choose endpoint: prefer options endpoint when we have userId, otherwise try discover endpoint
    let triedDiscoverFallback = false;
    const tryFetch = async (endpoint, body, headers) => {
      const url = `${apiBase}${endpoint}`;
      const start = Date.now();
      __webauthn_log.d('POST ->', url, 'body:', body);
      const fetchImpl = (typeof window.__origFetch !== 'undefined') ? window.__origFetch : fetch.bind(window);
      const rawRes = await fetchImpl(url, { method:'POST', credentials:'include', headers: Object.assign({'Content-Type':'application/json'}, headers||{}), body: JSON.stringify(body) });
      const duration = Date.now() - start;
      let text = '';
      try { text = await rawRes.text(); } catch(e){ text = '(no body)'; }
      __webauthn_log.d('Fetch result', { url, status: rawRes.status, ok: rawRes.ok, durationMs: duration, rawTextSample: text && text.slice ? text.slice(0,300) : text });
      return { rawRes, text, duration };
    };

    // function that handles response parsing + conversion + cache
    const handleSuccess = (opts) => {
      const converted = convertOptionsFromServer(opts);
      cacheAuthOptions(converted);
      try { return JSON.parse(JSON.stringify(converted)); } catch(e){ return converted; }
    };

    // Primary attempt: if we have userId use '/webauthn/auth/options'
    try {
      if (resolvedUser) {
        const body = { credentialId: resolvedCred, userId: resolvedUser };
        const { rawRes, text } = await tryFetch('/webauthn/auth/options', body);
        if (!rawRes.ok) {
          __webauthn_log.w('Primary options endpoint returned non-ok, will inspect for fallback', { status: rawRes.status, text });
          if ((rawRes.status === 400 && /missing.*user/i.test(text || '')) || !resolvedUser) {
            __webauthn_log.i('Primary failed due to missing userId; will try discover fallback');
            triedDiscoverFallback = true;
            const { rawRes: dRes, text: dText } = await tryFetch('/webauthn/auth/options', { credentialId: resolvedCred });
            if (!dRes.ok) {
              __webauthn_log.e('Discover fallback failed', { status: dRes.status, text: dText });
              throw new Error(`Auth options discover failed: ${dText || dRes.status}`);
            }
            const opts = JSON.parse(dText || '{}');
            __webauthn_log.i('Discover fallback succeeded', { allowCount: opts.allowCredentials ? opts.allowCredentials.length : 0 });
            return handleSuccess(opts);
          }
          throw new Error(text || `HTTP ${rawRes.status}`);
        }
        const opts = JSON.parse(text || '{}');
        __webauthn_log.i('Primary options fetch successful', { allowCount: opts.allowCredentials ? opts.allowCredentials.length : 0 });
        return handleSuccess(opts);
      } else {
        // No userId: prefer discover endpoint (server supports discover)
        __webauthn_log.i('No userId resolved; calling discover endpoint to avoid Missing userId');
        const { rawRes, text } = await tryFetch('/webauthn/auth/options', { credentialId: resolvedCred });
        if (!rawRes.ok) {
          __webauthn_log.e('Discover endpoint failed', { status: rawRes.status, text });
          throw new Error(text || `HTTP ${rawRes.status}`);
        }
        const opts = JSON.parse(text || '{}');
        __webauthn_log.i('Discover options fetch successful', { allowCount: opts.allowCredentials ? opts.allowCredentials.length : 0 });
        return handleSuccess(opts);
      }
    } catch (err) {
      __webauthn_log.e('getAuthOptionsWithCache error', err);
      // clear cache on error to avoid stale partial states
      cacheAuthOptions(null);
      throw err;
    }
  });

  // Invalidate helper
  window.invalidateAuthOptionsCache = window.invalidateAuthOptionsCache || function(){ cacheAuthOptions(null); __webauthn_log.d('invalidateAuthOptionsCache called'); };

  // Prefetch helper used by UI (non-blocking)
  // Prefetch helper used by UI (non-blocking) — patched to respect in-use lock
if (!window.prefetchAuthOptions) window.prefetchAuthOptions = async function prefetchAuthOptions() {
  try {
    // If another prefetch is running, or an auth operation is currently using the cached options, skip.
    if (window.__prefetchInFlight) {
      console.debug('[prefetchAuthOptions] abort: prefetch already in flight');
      return;
    }
    if (window.__cachedAuthOptionsLock) {
      console.debug('[prefetchAuthOptions] abort: cached options locked (auth in progress)');
      return;
    }

    // If cache is fresh (short TTL) skip; keep your existing cachedOptionsFresh if present
    if (typeof cachedOptionsFresh === 'function' && cachedOptionsFresh()) {
      console.debug('[prefetchAuthOptions] cache fresh, skipping fetch');
      return;
    }

    window.__prefetchInFlight = true;

    const storedId = localStorage.getItem('credentialId') || localStorage.getItem('webauthn-cred-id');
    if (!storedId) {
      window.__prefetchInFlight = false;
      return;
    }

    const res = await fetch((window.__SEC_API_BASE || API_BASE) + '/webauthn/auth/options', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialId: storedId, userId: (window.__webauthn_userId || null) })
    });

    if (!res.ok) {
      console.warn('[prefetchAuthOptions] options fetch not ok', await res.text().catch(()=>'(no-body)'));
      window.__prefetchInFlight = false;
      return;
    }

    const publicKey = await res.json();

    try {
      if (publicKey.challenge && typeof publicKey.challenge === 'string' && typeof window.fromBase64Url === 'function') {
        const ch = window.fromBase64Url(publicKey.challenge);
        if (ch) publicKey.challenge = new Uint8Array(ch);
      }
      if (Array.isArray(publicKey.allowCredentials)) {
        publicKey.allowCredentials = publicKey.allowCredentials.map(function(c){
          try {
            const idVal = (typeof c.id === 'string') ? (window.fromBase64Url ? window.fromBase64Url(c.id) : null) : c.id;
            return {
              type: c.type || 'public-key',
              transports: c.transports || ['internal'],
              id: idVal ? new Uint8Array(idVal) : idVal
            };
          } catch (e) {
            return { type: c.type || 'public-key', transports: c.transports || ['internal'], id: c.id };
          }
        });
      }
    } catch (e) {
      console.warn('[prefetchAuthOptions] conversion error', e);
    }

    // store ready-to-use options only if no lock is active (double-check)
    if (window.__cachedAuthOptionsLock) {
      // Someone started an auth while we fetched; do not overwrite the in-use cached options.
      console.debug('[prefetchAuthOptions] fetched options but lock active — discarding to avoid race');
    } else {
      window.__cachedAuthOptions = publicKey;
      window.__cachedAuthOptionsFetchedAt = Date.now();
      console.log('[prefetchAuthOptions] cached auth options ready');
    }
  } catch (err) {
    console.warn('[prefetchAuthOptions] failed', err);
  } finally {
    window.__prefetchInFlight = false;
  }
};


  // Wrap existing fetch interception (keeps prior behavior but adds logs)
  if (!window.__webauthnFetchWrapped) {
    window.__webauthnFetchWrapped = true;
    if (typeof window.fetch === 'function') {
      // preserve original fetch so we can call into it safely
      window.__origFetch = window.fetch.bind(window);
      window.fetch = async function(input, init){
        try {
          const url = (typeof input === 'string') ? input : (input && input.url) || '';
          if (url && url.indexOf('/webauthn/auth/options') !== -1) {
            __webauthn_log.d('fetch wrapper intercept', { url, initBody: init && init.body ? (typeof init.body === 'string' ? init.body.slice(0,400) : '[non-string body]') : null });

            // Helper: robust header check (Headers instance / object / array)
            const headerHasBypass = (h) => {
              if (!h) return false;
              try {
                if (typeof h.get === 'function') {
                  return !!(h.get('X-Bypass-AuthCache') || h.get('x-bypass-authcache'));
                }
                if (Array.isArray(h)) {
                  for (const pair of h) {
                    if (Array.isArray(pair) && String(pair[0]).toLowerCase() === 'x-bypass-authcache') return true;
                  }
                } else if (typeof h === 'object') {
                  for (const k of Object.keys(h)) if (k.toLowerCase() === 'x-bypass-authcache') return true;
                }
              } catch(e){ /* ignore */ }
              // also allow a global flag
              if (window.__bypassAuthOptions) return true;
              return false;
            };

            // if caller explicitly asks to bypass the cached options -> do a real network call
            if (init && headerHasBypass(init.headers)) {
              __webauthn_log.i('fetch wrapper bypass header present - calling network directly');
              return window.__origFetch(input, init);
            }

            // otherwise, parse body for credentialId/userId and return cached (fast) options
            let credentialId = null, userId = null;
            try {
              const b = init && init.body ? JSON.parse(init.body) : null;
              if (b && typeof b === 'object') { credentialId = b.credentialId || null; userId = b.userId || null; }
            } catch(e){ __webauthn_log.w('fetch wrapper parse body failed', e); }

            // Try to obtain cached options via the canonical helper (this may fetch if not cached)
            try {
              const opts = await window.getAuthOptionsWithCache({ credentialId, userId });
              __webauthn_log.d('fetch wrapper returning cached options', { cached: !!opts });
              // Return a sanitized Response so consumers get a normal fetch response shape
              return new Response(JSON.stringify(opts), { status: 200, headers: { 'Content-Type': 'application/json' } });
            } catch (e) {
              __webauthn_log.w('fetch wrapper getAuthOptionsWithCache failed, falling back to network', e);
              // fallback to real network call
              return window.__origFetch(input, init);
            }
          }
        } catch(e){ __webauthn_log.w('fetch wrapper error', e); }
        return window.__origFetch(input, init);
      };
    }
  }

})();


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
      return { value: '', cursorOffset: 0, valid: false };
    }
    let cleaned = String(phone).replace(/[\s-]/g, '');
    let cursorOffset = 0;

    if (isInitialDigit && ['7','8','9'].includes(cleaned[0])) {
      cleaned = '0' + cleaned;
      cursorOffset = 1;
    }
    if (cleaned.startsWith('234') || cleaned.startsWith('+234')) {
      cleaned = '0' + cleaned.slice(3);
    }
    if (cleaned.length > 11) cleaned = cleaned.slice(0, 11);

    // ALWAYS produce progressive formatting
    let formatted;
    if (cleaned.length <= 4) formatted = cleaned;
    else if (cleaned.length <= 7) formatted = `${cleaned.slice(0,4)} ${cleaned.slice(4)}`;
    else formatted = `${cleaned.slice(0,4)} ${cleaned.slice(4,7)} ${cleaned.slice(7)}`;

    const isValid = cleaned.length === 11 && /^0[789][01]\d{8}$/.test(cleaned);

    return { value: formatted, cursorOffset, valid: !!isValid };
  } catch (error) {
    console.error('[ERROR] formatNigeriaNumber:', error);
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
  const selectedPlan = plansRow.querySelector('.plan-box.selected'); // ← MOVED INSIDE!
  const phoneNumber = phoneInput.value;
  const rawNumber = normalizePhone(phoneNumber);

  if (!rawNumber) {
    console.warn('[WARN] saveUserState: Invalid phone number:', phoneNumber);
  }

  localStorage.setItem('userState', JSON.stringify({
    provider: activeProvider || '',
    planId: selectedPlan ? selectedPlan.getAttribute('data-id') : '',
    number: rawNumber || '',
    serviceIdx: [...serviceItems].findIndex(el => el.classList.contains('active')),
  }));

  console.log('[DEBUG] saveUserState: Saved state:', {
    provider: activeProvider,
    planId: selectedPlan ? selectedPlan.getAttribute('data-id') : '(none)',
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
      saveCurrentAppState();

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
    ModalManager.openModal('allPlansModal');

    // Your old logic — runs right after ModalManager starts opening
    setTimeout(() => {
      const dashSelected = plansRow.querySelector('.plan-box.selected');
      const activeProvider = providerClasses.find(cls => slider.classList.contains(cls));

      allPlansModalContent.scrollTop = 0;

      const awoofSection = allPlansModal.querySelector('.plan-section.awoof-section');
      const giftingSection = allPlansModal.querySelector('.plan-section.gifting-section');
      if (giftingSection) giftingSection.style.display = activeProvider === 'ninemobile' ? 'none' : 'block';
      if (awoofSection) awoofSection.style.display = 'block';

      if (dashSelected) {
        const id = dashSelected.getAttribute('data-id');
        allPlansModal.querySelectorAll('.plan-box.selected').forEach(p => p.classList.remove('selected'));
        const modalPlan = allPlansModal.querySelector(`.plan-box[data-id="${id}"]`);
        if (modalPlan) {
          modalPlan.classList.add('selected');
          setTimeout(() => modalPlan.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
        }
      }
    }, 50);
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
    saveCurrentAppState();
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
      ModalManager.closeModal('allPlansModal'); 
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
      saveCurrentAppState();
      ModalManager.closeModal('allPlansModal'); 
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
      saveCurrentAppState();
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

  // // --- OPEN CHECKOUT MODAL ---
  // function openCheckoutModal() {
  //   const checkoutModal = document.getElementById('checkoutModal');
  //   if (!checkoutModal) {
  //     console.error('[ERROR] openCheckoutModal: #checkoutModal not found in DOM');
  //     return;
  //   }
  //   const checkoutModalContent = checkoutModal.querySelector('.modal-content');
  //   if (!checkoutModalContent) {
  //     console.error('[ERROR] openCheckoutModal: .modal-content not found');
  //     return;
  //   }
  //   checkoutModal.style.display = 'none';
  //   checkoutModal.classList.remove('active');
  //   checkoutModalContent.style.transform = 'translateY(0)';
  //   renderCheckoutModal();
  //   setTimeout(() => {
  //     checkoutModal.style.display = 'flex';
  //     checkoutModal.classList.add('active');
  //     checkoutModal.setAttribute('aria-hidden', 'false');
  //     document.body.classList.add('modal-open');
  //     checkoutModal.focus();
  //     history.pushState({ popup: true }, '', location.href);
  //     console.log('[DEBUG] openCheckoutModal: Modal opened, display:', checkoutModal.style.display, 'active:', checkoutModal.classList.contains('active'));
  //   }, 50);
  // }

  // // --- CLOSE CHECKOUT MODAL ---
  // function closeCheckoutModal() {
  //   const checkoutModal = document.getElementById('checkoutModal');
  //   if (!checkoutModal) {
  //     console.error('[ERROR] closeCheckoutModal: #checkoutModal not found');
  //     return;
  //   }
  //   const checkoutModalContent = checkoutModal.querySelector('.modal-content');
  //   checkoutModal.classList.remove('active');
  //   checkoutModal.style.display = 'none';
  //   checkoutModal.setAttribute('aria-hidden', 'true');
  //   document.body.classList.remove('modal-open');
  //   checkoutModalContent.style.transform = 'translateY(100%)';
  //   if (history.state && history.state.popup) {
  //     history.back();
  //     console.log('[DEBUG] closeCheckoutModal: History state popped');
  //   }
  //   console.log('[DEBUG] closeCheckoutModal: Modal closed, display:', checkoutModal.style.display, 'active:', checkoutModal.classList.length);
  // }

  // --- SERVICE SELECTION ---
  serviceItems.forEach((item, i) => {
    item.addEventListener('click', () => {
      serviceItems.forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      saveUserState();
      saveCurrentAppState();
    });
  });
  serviceItems[0].classList.add('active');

  // --- INITIAL PROVIDER SETUP ---
  // REPLACE your current initializeProviderFromState() with this version
function initializeProviderAndPlans() {
  let providerToUse = null;

  // 1. Try to restore from saved state
  if (history.state?.selectedProvider) {
    providerToUse = history.state.selectedProvider;
  } else if (sessionStorage.getItem('__fg_app_state_v2')) {
    try {
      const saved = JSON.parse(sessionStorage.getItem('__fg_app_state_v2'));
      if (saved.selectedProvider) providerToUse = saved.selectedProvider;
    } catch (e) {}
  } else if (localStorage.getItem('userState')) {
    try {
      const userState = JSON.parse(localStorage.getItem('userState'));
      if (userState.provider) providerToUse = userState.provider;
    } catch (e) {}
  }

  // 2. If NOTHING was restored → default to MTN (exactly like your old function did)
  if (!providerToUse) {
    providerToUse = 'mtn';
    console.log('[INIT] No saved provider → defaulting to MTN (first visit)');
  } else {
    console.log('[INIT] Restored provider from state:', providerToUse);
  }

  // 3. Now do the FULL initialization — same as your old setProviderOnLoad()
  const providerBox = document.querySelector(`.provider-box.${providerToUse}`);
  if (!providerBox) {
    console.error('[INIT] Provider box not found for:', providerToUse);
    return;
  }

  // Clear any existing active state
  providers.forEach(p => p.classList.remove('active'));
  providerBox.classList.add('active');

  // Update slider
  slider.className = `slider ${providerToUse}`;
  slider.innerHTML = `
    <img src="${svgPaths[providerToUse]}" alt="${providerToUse.toUpperCase()}" class="provider-icon" />
    <div class="provider-name">${providerToUse === 'ninemobile' ? '9MOBILE' : providerToUse.toUpperCase()}</div>
  `;
  moveSliderTo(providerBox);

  // Update plans row
  providerClasses.forEach(cls => plansRow.classList.remove(cls));
  plansRow.classList.add(providerToUse);

  // Clear old selections
  plansRow.querySelectorAll('.plan-box').forEach(plan =>
    plan.classList.remove('selected', ...providerClasses)
  );

  // Render plans & modal
  renderDashboardPlans(providerToUse);
  renderModalPlans(providerToUse);
  attachPlanListeners();
  logPlanIDs();

  console.log('[INIT] Provider fully initialized:', providerToUse);
}

function restoreEverything() {
  let state = null;

  console.log('[RestoreEverything] Starting restore process...');

  // 1. Try history.state first
  if (history.state && history.state.timestamp) {
    state = history.state;
    console.log('[RestoreEverything] Found state in history.state:', state);
  }
  // 2. Fallback to sessionStorage
  else if (sessionStorage.getItem('__fg_app_state_v2')) {
    try {
      state = JSON.parse(sessionStorage.getItem('__fg_app_state_v2'));
      console.log('[RestoreEverything] Found state in sessionStorage:', state);
    } catch(e) {
      console.error('[RestoreEverything] Failed to parse sessionStorage state', e);
    }
  }

  if (!state) {
    console.log('[RestoreEverything] No saved state found — nothing to restore');
    return;
  }

  console.log('[RestoreEverything] Full saved state:', state);

  requestAnimationFrame(() => {
    console.log('[RestoreEverything] DOM ready — starting restoration...');

    // 1. Phone number
    const phoneInput = document.getElementById('phone-input');
    if (phoneInput && state.phoneNumber) {
      phoneInput.value = state.phoneNumber;
      updateContactOrCancel();
      updateContinueState();
      console.log('[RestoreEverything] ✓ Phone number restored:', state.phoneNumber);
    } else {
      console.log('[RestoreEverything] ✗ Phone input not found or no saved number');
    }

    // 2. Provider + plan (already handled by initializeProviderAndPlans, but safe double-check)
    if (state.selectedProvider) {
      console.log('[RestoreEverything] Provider from state:', state.selectedProvider);
      selectProvider(state.selectedProvider);
      if (state.selectedPlanId) {
        setTimeout(() => {
          console.log('[RestoreEverything] Restoring plan ID:', state.selectedPlanId);
          selectPlanById(state.selectedPlanId);
        }, 400);
      }
    }

//     // 3. Scroll positions
//     if (state.scrollPositions) {
//       window.scrollTo(0, state.scrollPositions.dashboard);
//       document.querySelector('.plans-row')?.scrollTo(state.scrollPositions.plansRow, 0);
//       document.getElementById('allPlansModalContent')?.scrollTo(0, state.scrollPositions.allPlansModal || 0);
//       console.log('[RestoreEverything] ✓ Scroll positions restored');
//     }

//     // 4. MODALS — THE MOST IMPORTANT PART
//     if (state.openModal) {
//       console.log('[RestoreEverything] Found open modal to restore:', state.openModal);

//       setTimeout(() => {
//         console.log('[RestoreEverything] Attempting to re-open modal:', state.openModal);

//         // CRITICAL: Use ModalManager if it exists (even if in another file)
//         if (typeof window.ModalManager !== 'undefined' && window.ModalManager?.openModal) {
//           console.log('[RestoreEverything] ✓ Using ModalManager.openModal()');
//           window.ModalManager.openModal(state.openModal, true); // skipHistory = true
//         } 
//         // Fallback if ModalManager not loaded yet
//         else if (document.getElementById(state.openModal)) {
//           console.log('[RestoreEverything] ModalManager not ready — using direct DOM method');
//           const modal = document.getElementById(state.openModal);
//           modal.classList.remove('hidden');
//           modal.classList.add('active');
//           modal.style.display = 'flex';
//           modal.removeAttribute('aria-hidden');
//           modal.removeAttribute('inert');
//         } else {
//           console.error('[RestoreEverything] ✗ Modal element not found in DOM:', state.openModal);
//         }
//         if (state.openModal) {
//   console.log('[RestoreEverything] Found open modal to restore:', state.openModal);

//   setTimeout(() => {
//     const modal = document.getElementById(state.openModal);
//     if (!modal) {
//       console.error('[RestoreEverything] Modal element not found:', state.openModal);
//       return;
//     }

//     // FORCE EVERYTHING NEEDED FOR ANIMATION
//     modal.classList.remove('hidden');
//     modal.style.display = modal.dataset.hasPullHandle === 'true' ? 'block' : 'flex';  // ← CRITICAL
//     modal.style.opacity = '0';
//     modal.style.visibility = 'visible';
//     modal.style.transform = modal.id === 'allPlansModal' ? 'translateY(100%)' : 'translateY(20px)';
//     modal.style.zIndex = '10010'; // high enough
//     modal.removeAttribute('aria-hidden');
//     modal.removeAttribute('inert');

//     console.log('[RestoreEverything] Forced starting state for animation');

//     // Now trigger the real openModal (which has the animation logic)
//     if (window.ModalManager?.openModal) {
//       window.ModalManager.openModal(state.openModal, true);
//       console.log('[RestoreEverything] Called ModalManager.openModal()');
//     }

//     // Special case for checkout
//     if (state.openModal === 'checkoutModal') {
//       renderCheckoutModal();
//     }
//   }, 100);
// }

//         // Special case for checkout modal
//         if (state.openModal === 'checkoutModal') {
//           console.log('[RestoreEverything] Rendering checkout modal content');
//           renderCheckoutModal();
//         }
//       }, 200); // Slightly longer delay to ensure ModalManager is ready
//     } else {
//       console.log('[RestoreEverything] No modal was open — nothing to re-open');
//     }

    // Cleanup
    sessionStorage.removeItem('__fg_app_state_v2');
    console.log('[RestoreEverything] Restoration complete!');
  });
}



initializeProviderAndPlans();
restoreEverything(); 
updateContinueState();
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
    saveCurrentAppState();

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
    saveCurrentAppState();
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
    saveCurrentAppState();
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
  saveCurrentAppState();

  if (finalNormalized.length === 11 && isNigeriaMobile(finalNormalized)) {
    phoneInput.blur();
    console.log('[RAW LOG] phoneInput input: Keyboard closed, valid Nigeria number:', finalNormalized);
  }
}, 50));
phoneInput.maxLength = 13;  // 11 digits + 2 spaces in formatted value

  // --- CONTINUE BUTTON CLICK ---
  continueBtn.addEventListener('click', () => {
    if (!continueBtn.disabled) {
      window.openCheckoutModal();
      saveCurrentAppState()
      console.log('[DEBUG] continueBtn: Opening checkout modal');
    }
  });

  // --- MODAL EVENT LISTENERS ---
 

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
    // Remove this line if you have it:
    // allPlansModalContent.style.opacity = Math.max(1 - translateY / 500, 0.3);
    e.preventDefault();
  }
}

function handleTouchEnd() {
  if (!dragging) return;
  dragging = false;

  // Always reset transition so ModalManager can control it
  allPlansModalContent.style.transition = '';

  if (translateY > pullThreshold) {
    // Let ModalManager handle the close + animation + cleanup
    ModalManager.closeModal('allPlansModal');
  } else {
    // Just snap back — ModalManager will handle the rest
    allPlansModalContent.style.transform = 'translateY(0)';
  }

  // CRITICAL: Reset any inline styles that might linger
  setTimeout(() => {
    allPlansModalContent.style.opacity = '';
    allPlansModalContent.style.transform = '';
    allPlansModalContent.style.visibility = '';
  }, 100);
}

// Re-attach (in case ModalManager re-renders)
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
          <span class="dtx-status ${statusClass}">${tx.status === 'failed' ? 'Failed' : 'Successful'}</span>
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

// //   // --- CHECKOUT MODAL EVENT LISTENERS ---
//   const checkoutModal = document.getElementById('checkoutModal');
//   if (checkoutModal) {
//     const closeCheckoutBtn = checkoutModal.querySelector('.close-btn');
//     const checkoutModalContent = checkoutModal.querySelector('.modal-content');


//     window.addEventListener('keydown', e => {
//       if (e.key === 'Escape' && checkoutModal.classList.contains('active')) {
//         closeCheckoutModalLocal();
//         console.log('[DEBUG] keydown: ESC pressed');
//       }
//     });

//     // Inside checkoutModal event listeners
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
      onPayClicked(); // Trigger re-authentication

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
      saveCurrentAppState();

      window.showSlideNotification(`Payment of ₦${plan.price} for ${plan.data} (${plan.duration}) to ${formatNigeriaNumber(rawNumber).value} successful!`, 'success');
      closeCheckoutModal();
      console.log('[DEBUG] payBtn: Payment processed, new balance:', userBalance, 'Transaction:', transaction);
      payBtn.disabled = false;
      payBtn.textContent = 'Pay';
    }, 1000);
  }
});


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
      saveCurrentAppState();
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
      saveCurrentAppState();

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



/* ===========================================================
   REAL-TIME BALANCE FROM SUPABASE (WebSocket + Fallback Polling)
   =========================================================== */
(function () {
  const uid = window.__USER_UID || localStorage.getItem('userId');
  if (!uid) {
    console.warn('[Balance] No user ID found — skipping real-time balance');
    return;
  }

  let currentBalance = null;

  // Format balance consistently everywhere
  function formatBalance(amount) {
    if (amount === null || amount === undefined) return '₦–';
    return '₦' + Number(amount).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }



  // Initial load from session
  async function loadInitialBalance() {
    try {
      const session = await getSession();
      if (session?.user?.wallet_balance !== undefined) {
        console.log('[Balance] Initial balance from session:', session.user.wallet_balance);
        updateAllBalances(session.user.wallet_balance);
      }
    } catch (err) {
      console.warn('[Balance] Failed to load initial balance from session', err);
    }
  }

  // WebSocket connection
  function connectWebSocket() {
    try {
      const ws = new WebSocket('wss://api.flexgig.com.ng/ws/wallet');

      ws.onopen = () => {
        console.log('[Balance] WebSocket connected');
        ws.send(JSON.stringify({ type: 'subscribe', user_uid: uid }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'balance_update' && data.balance !== undefined) {
            console.log('[Balance] WebSocket update →', data.balance);
            updateAllBalances(data.balance);

            // Optional: show toast on credit
            if (data.amount > 0 && typeof window.notify === 'function') {
              window.notify(`₦${Number(data.amount).toLocaleString()} credited!`, 'success');
            }
          }
        } catch (e) {
          console.warn('[Balance] Invalid WS message', e);
        }
      };

      ws.onclose = () => {
        console.warn('[Balance] WebSocket closed → falling back to polling');
        startPolling();
      };

      ws.onerror = (err) => {
        console.error('[Balance] WebSocket error', err);
        ws.close();
      };

      return ws;
    } catch (err) {
      console.warn('[Balance] WebSocket failed to start', err);
      startPolling();
    }
  }

  // Fallback polling every 12 seconds
  let pollTimeout = null;
  function startPolling() {
    if (pollTimeout) clearTimeout(pollTimeout);

    const poll = async () => {
      try {
        const res = await fetch(`${window.__SEC_API_BASE}/api/session?light=true`, {
          credentials: 'include',
          cache: 'no-store'
        });
        if (res.ok) {
          const json = await res.json();
          const newBal = json.user?.wallet_balance;
          if (newBal !== undefined && newBal !== currentBalance) {
            console.log('[Balance] Polling update →', newBal);
            updateAllBalances(newBal);
          }
        }
      } catch (err) {
        console.warn('[Balance] Polling failed', err);
      } finally {
        pollTimeout = setTimeout(poll, 12000);
      }
    };

    poll();
  }

  // Start everything
  loadInitialBalance();
  connectWebSocket();

  // Also update on successful login/session restore
  window.addEventListener('fg:reauth-success', loadInitialBalance);
  window.addEventListener('session:restored', loadInitialBalance);

  console.log('[Balance] Real-time balance system initialized for UID:', uid);
})();




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
          saveCurrentAppState();
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
 renderRecentTransactions();

   payBtn.disabled = true;
 payBtn.textContent = 'Processing...';
 setTimeout(() => {
   // Payment logic
    payBtn.disabled = false;
    payBtn.textContent = 'Pay';
  }, 1000); 
  // // --- ADD MONEY HANDLER ---
  // const addMoneyBtn = document.querySelector('.card.add-money1');
  // addMoneyBtn.addEventListener('click', () => {
  //   const amount = prompt('Enter amount to fund (₦):', '1000');
  //   if (!amount || isNaN(amount) || amount <= 0) {
  //     alert('Please enter a valid amount.');
  //     console.error('[ERROR] addMoneyBtn: Invalid amount:', amount);
  //     return;
  //   }
  //   const fundAmount = parseFloat(amount);
  //   // Mock API call
  //   const mockResponse = { success: true, transactionId: `TX${Date.now()}` };
  //   console.log('[DEBUG] addMoneyBtn: Mock API response:', mockResponse);

  //   // Update balance
  //   userBalance += fundAmount;
  //   updateBalanceDisplay();

  //   // Add to transactions
  //   const transaction = {
  //     type: 'receive',
  //     description: 'Fund Wallet',
  //     amount: fundAmount,
  //     phone: null,
  //     provider: null,
  //     subType: null,
  //     data: null,
  //     duration: null,
  //     timestamp: new Date().toISOString(),
  //     status: 'success' // Mock success
  //   };
  //   transactions.push(transaction);
  //   renderTransactions();

  //   alert(`Successfully funded ₦${fundAmount}!`);
  //   console.log('[DEBUG] addMoneyBtn: Funding processed, new balance:', userBalance, 'Transaction:', transaction);
  // });

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
            z-index: 9999999;
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

  // animate in (existing behaviour)
  requestAnimationFrame(() => toast.classList.add('show'));

  // Helper to remove this toast: slide-out if it's the top visible notification,
  // otherwise fade and remove (no slide).
  const removeAfter = () => {
    try {
      // compute "top" relative to container's visual order.
      // Note: your container uses flex-direction: column; firstElementChild is the top-most.
      const isTop = container.firstElementChild === toast;

      if (isTop) {
        // Keep existing behaviour for top toast: remove .show so CSS handles transform (slide-out) + opacity
        toast.classList.remove('show');
        // Give CSS time to animate the slide-out (same 420ms you used before)
        setTimeout(() => {
          if (toast.parentNode) toast.remove();
        }, 420);
      } else {
        // Not the top: do a fade-only removal without triggering translateX reverse animation.
        // Force the toast to have no transform and only animate opacity.
        // Use inline style to override injected stylesheet.
        toast.style.transition = 'opacity .28s ease';
        toast.style.transform = 'none';
        // trigger reflow so the browser notices the style change before we set opacity to 0
        // (safe micro-yield)
        // eslint-disable-next-line no-unused-expressions
        toast.offsetHeight;
        toast.style.opacity = '0';
        setTimeout(() => {
          if (toast.parentNode) toast.remove();
        }, 320); // slightly shorter than slide duration
      }
    } catch (err) {
      // fallback: remove immediately if anything goes wrong
      if (toast.parentNode) toast.remove();
      console.warn('showToast removeAfter failed:', err);
    }
  };

  // schedule the removal
  setTimeout(removeAfter, duration);

  // return the element in case caller wants to manipulate it (optional)
  return toast;
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
      localStorage.setItem('hasPin', 'false'); // PIN not set
      return;
    }

    processing = true;
    return withLoader(async () => {
      try {
        // --- Build headers ---
        const headers = { 'Content-Type': 'application/json' };

        // Only include reset token if it exists AND is a reset flow
        const resetToken = (window.__rp_handlers && typeof window.__rp_handlers.getResetToken === 'function')
          ? window.__rp_handlers.getResetToken()
          : (window.__rp_reset_token || null);

        if (resetToken && step === 'confirmReset') { 
          headers['x-reset-token'] = resetToken; // only for reset PIN flow
        } else {
          // normal flow: use Authorization Bearer token if logged in
          const token = localStorage.getItem('token');
          if (token) headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch('https://api.flexgig.com.ng/api/save-pin', {
          method: 'POST',
          headers,
          body: JSON.stringify({ pin: currentPin }),
          credentials: 'include',
        });

        if (!res.ok) throw new Error('Save PIN failed');

        console.log('[dashboard.js] PIN setup successfully');
        localStorage.setItem('hasPin', 'true'); // PIN successfully set

        // --- CLEAR short-lived reset token ---
        try {
          if (window.__rp_reset_token) {
            delete window.__rp_reset_token;
          }
          if (window.__rp_handlers && typeof window.__rp_handlers.getResetToken === 'function') {
            window.__rp_handlers.getResetToken = () => null;
          }
        } catch (e) {
          console.debug('Error clearing __rp_reset_token', e);
        }

        onPinSetupSuccess();
        const dashboardPinCard = document.getElementById('dashboardPinCard');
        if (dashboardPinCard) dashboardPinCard.style.display = 'none';
        if (accountPinStatus) accountPinStatus.textContent = 'PIN set';
        showToast('PIN updated successfully', 'success', 2400);
        if (pinModal) pinModal.classList.add('hidden');
        resetInputs();

      } catch (err) {
        console.error('[dashboard.js] PIN save error:', err);
        showToast('Failed to save PIN. Try again.', 'error', 2200);
        localStorage.setItem('hasPin', 'false'); // PIN failed
        resetInputs();
      } finally {
        processing = false;
      }
    });
  }

  if (step === 'reauth') {
  return withLoader(async () => {
    processing = true;
    const tStart = performance.now();
    try {
      const res = await fetch('https://api.flexgig.com.ng/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: currentPin }),
        credentials: 'include',
      });
      console.log('[reauth] verify-pin status', res.status, 'ms', performance.now() - tStart);

      if (!res.ok) throw new Error('Invalid PIN');

      // Parse minimal payload only (server should return minimal user summary)
      const payload = await res.json(); // ideally: { user: { username, fullName, ... } }
      const user = payload.user || {};

      // Hide modal immediately for snappy UX
      if (pinModal) pinModal.classList.add('hidden');
      resetInputs();

      // Prepare userData from minimal payload, avoid extra fetches when possible
      const userData = {
        email: user.email || '',
        firstName: user.fullName?.split(' ')[0] || '',
        username: user.username || '',
        phoneNumber: user.phoneNumber || '',
        address: user.address || '',
        profilePicture: user.profilePicture || '',
      };

      // Fire non-blocking UI updates in parallel — don't await them before continuing
      Promise.allSettled([
        (typeof updateGreetingAndAvatar === 'function') ? updateGreetingAndAvatar(userData.username, userData.firstName) : Promise.resolve(),
        (typeof loadUserProfile === 'function') ? loadUserProfile(userData) : Promise.resolve(),
        (typeof updateBalanceDisplay === 'function') ? updateBalanceDisplay() : Promise.resolve()
      ]).then(results => {
        // log any failures but don't block user
        results.forEach((r, idx) => {
          if (r.status === 'rejected') {
            console.warn('[reauth] background update failed', idx, r.reason);
          }
        });
      });

      console.log('[dashboard.js] PIN re-auth: Session restored (client-side done)');

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

function onPinSetupSuccess() {
  console.log('[PIN Setup] Success - updating flags and UI');

  // First: clear any short-lived reset token (idempotent safety-net)
  try {
    if (window.__rp_reset_token) {
      delete window.__rp_reset_token;
    }
    if (window.__rp_handlers && typeof window.__rp_handlers.getResetToken === 'function') {
      window.__rp_handlers.getResetToken = () => null;
    }
    console.debug('onPinSetupSuccess: cleared __rp_reset_token');
  } catch (e) {
    console.debug('onPinSetupSuccess: error clearing __rp_reset_token', e);
  }

  // Update localStorage (instant + persistent)
  localStorage.setItem('hasPin', 'true');

  // Dispatch custom event so other components can react
  window.dispatchEvent(new CustomEvent('pin-status-changed', {
    detail: { hasPin: true }
  }));

  // Hide the dashboard Setup Pin card immediately
  const pinCard = document.getElementById('dashboardPinCard');
  if (pinCard) {
    pinCard.style.display = 'none';
  }

  // Update Account PIN status in security modal
  const accountPinStatusEl = document.getElementById('accountPinStatus');
  if (accountPinStatusEl) {
    accountPinStatusEl.textContent = 'PIN set. You can change your PIN here';
  }

  // Optionally notify user
  if (typeof notify === 'function') {
    notify('PIN set up successfully!', 'success');
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

    // --- persist hasPin locally & reinit inactivity ---
    try {
      localStorage.setItem('hasPin', 'true');
      if (typeof setupInactivity === 'function') setupInactivity();
    } catch(e) {
      console.warn('Failed to update hasPin locally', e);
    }

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
            //window.location.href = '/reset-pin.html';
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
            __fg_pin_clearAllInputs();
            return;
          }
        } catch (err) {
          __fg_pin_log.e('Error verifying PIN:', err);
          console.log('Current PIN is incorrect. Try again.', 'error');
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
      //window.location.href = '/reset-pin.html';
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
  // const payBtn = q('#payBtn');
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
  window.notify = window.notify || notify;

  // Get user ID from Supabase
  // Robust getUid: never throws for "no user yet" — returns null when no signed-in user
async function getUid({ waitForSession = true, waitMs = 500 } = {}) {
  try {
    // Prefer safeCall(getSession) if available
    let session = null;
    try {
      session = await safeCall(getSession);
    } catch (e) {
      session = null;
    }

    // If no session and a global session promise exists, await it briefly (helps on first load races)
    if (!session && waitForSession && typeof getOrCreateSessionPromise === 'function') {
      try {
        // Wait for the global session promise but with a small timeout so we don't hang forever
        const p = getOrCreateSessionPromise();
        session = await Promise.race([
          p,
          new Promise(resolve => setTimeout(() => resolve(null), waitMs))
        ]);
      } catch (e) {
        session = null;
      }
    }

    const uid = session?.user?.uid || session?.user?.id || localStorage.getItem('userId') || null;
    if (!uid) {
      // Prefer returning null (callers should check) rather than throwing
      console.debug('[PIN] getUid: No user yet — returning null (not throwing).');
      return null;
    }
    return { uid };
  } catch (err) {
    // Unexpected error — log and return null so callers don't get unhandled rejections
    console.error('[PIN] getUid unexpected error (returning null):', err);
    return null;
  }
}
window.getUid = window.getUid || getUid;


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


//   // Re-authenticate with PIN
//   async function reAuthenticateWithPin(uid, pin, callback) {
//   return withLoader(async () => {

//   try {
//     const found = await findStoredPin(uid);
//     if (!found) {
//       notify('No PIN set. Please set a PIN first.', 'error', pinVerifyAlert, pinVerifyAlertMsg);
//       return false;
//     }
//     const res = await fetch('https://api.flexgig.com.ng/api/verify-pin', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json'
//         // Removed Authorization
//       },
//       body: JSON.stringify({ userId: uid, pin }),
//       credentials: 'include',
//     });
//     if (!res.ok) {
//       const { error } = await res.json();
//       notify(error?.message || 'Incorrect PIN. Try again.', 'error', pinVerifyAlert, pinVerifyAlertMsg);
//       return false;
//     }
//     notify('PIN verified successfully', 'success', pinVerifyAlert, pinVerifyAlertMsg);
//     callback(true);
//     return true;
//   } catch (err) {
//     log.e('reAuthenticateWithPin error', err);
//     notify('Error verifying PIN. Please try again.', 'error', pinVerifyAlert, pinVerifyAlertMsg);
//     return false;
//   }
//   });
// }

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
            console.log('Current PIN is incorrect', 'error');
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
        //window.location.href = '/reset-pin.html';
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

  // 🔹 Delay + await global session before PIN check (eliminates race)
//   setTimeout(async () => {
//     try {
//       console.log('[BOOT] Starting PIN check...');
//       await getSession();  // Wait for session (global, no duplicate fetches)
      
//       // Now safe: Wrap with full catch
//       await new Promise((resolve, reject) => {
//         window.checkPinExists((hasPin) => {
//           try {
//             if (hasPin) {
//               window.ModalManager.openModal('pinVerifyModal');
//             }
//             resolve();
//           } catch (e) {
//             reject(e);
//           }
//         }, 'load');
//       }).catch(async (e) => {
//         console.error('[BOOT] PIN check failed first try:', e);
//         // No retry needed (global promise ensures session); log & skip
//       });
      
//       console.log('[BOOT] PIN check complete');
//     } catch (e) {
//       console.error('[BOOT] PIN check error', e);
//     }
//   }, 2000);  // 2s buffer (covers everything; adjust down if too slow)

 }

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  setTimeout(boot, 1000);
}
})(supabaseClient);









// --- UPDATE PROFILE MODAL ---
// --- UPDATE PROFILE MODAL ---
// --- UPDATE PROFILE MODAL ---
const updateProfileBtn = document.getElementById('updateProfileBtn'); // dashboard
const settingsUpdateBtn = document.getElementById('openUpdateProfile'); // settings
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


// ====== Force Profile Modal Open Above ModalManager ======
// if (settingsUpdateBtn) {
//   settingsUpdateBtn.addEventListener(
//     'click',
//     (event) => {
//       event.preventDefault();
//       event.stopImmediatePropagation();
//       lastModalSource = 'settings';
//       if (typeof openUpdateProfileModal === 'function') {
//         openUpdateProfileModal();
//         if (updateProfileModal) {
//           // Force active and remove hidden
//           updateProfileModal.classList.add('active');
//           updateProfileModal.classList.remove('hidden');
//           updateProfileModal.style.display = 'flex';
//           updateProfileModal.style.opacity = 1;
//           // CRITICAL: Push proper history state with modalDepth
//           // Get current depth from ModalManager if available
//           const currentDepth = window.ModalManager?.getCurrentDepth?.() || 1;
//           history.pushState(
//             { 
//               isModal: true,
//               modalId: 'updateProfileModal',
//               modalDepth: currentDepth + 1
//             }, 
//             '', 
//             '#updateProfileModal'
//           );
//           console.log('[INFO] updateProfileModal forced visible with history', {
//             classList: updateProfileModal.className,
//             display: updateProfileModal.style.display,
//             modalDepth: currentDepth + 1
//           });
//           // Run validation safely
//           setTimeout(() => validateProfileForm(true), 50);
//         }
//       }
//     },
//     true
//   );
// }




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
            // Parse response safely
      let rawText = '';
      let parsedData = null;
      try {
        rawText = await response.text();
        parsedData = rawText ? JSON.parse(rawText) : null;
      } catch (e) {
        console.warn('[WARN] updateProfileForm: Response is not valid JSON');
      }

      // Normalize server error/message into a readable string
      function extractServerMessage(obj, fallback) {
        if (!obj) return fallback || '';
        // if it's a string already
        if (typeof obj === 'string') return obj;
        // common shapes: { error: 'msg' } or { message: 'msg' } or { error: { message: 'msg' } }
        if (typeof obj.error === 'string') return obj.error;
        if (typeof obj.message === 'string') return obj.message;
        if (obj.error && typeof obj.error.message === 'string') return obj.error.message;
        if (obj.message && typeof obj.message === 'object' && typeof obj.message.message === 'string') return obj.message.message;
        // last resort: try to find a nested message field
        for (const k of ['error', 'errors', 'message', 'detail']) {
          const v = obj[k];
          if (typeof v === 'string') return v;
          if (v && typeof v.message === 'string') return v.message;
        }
        // nothing obvious — stringify safely (limit length)
        try {
          const s = JSON.stringify(obj);
          return s.length > 300 ? s.slice(0, 300) + '…' : s;
        } catch (e) {
          return fallback || String(obj);
        }
      }

      if (!response.ok) {
        console.error('[ERROR] updateProfileForm: Failed response', response.status, parsedData || rawText);
        const serverMsg = extractServerMessage(parsedData, rawText || `HTTP ${response.status}`);
        // throw a real Error with a normalized string message
        throw new Error(serverMsg || `HTTP ${response.status}`);
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
        onProfileUpdateSuccess();
        // after upload/update success:
invalidateProfileCache();             // allow next call to fetch fresh
loadProfileToSettings(true);          // force fresh fetch & UI update
// or simply loadProfileToSettings(true).catch(...)

        notification.classList.add('active');
        setTimeout(() => notification.classList.remove('active'), 3000);
      }

      closeUpdateProfileModal();

      // Fetch fresh server data and apply (will overwrite temp values if needed)
      await loadUserProfile(true);

        } catch (err) {
      console.error('[ERROR] updateProfileForm:', err);
      // ensure we have a readable message
      const readable = (err && (err.message || err.toString())) || String(err);
      if (readable.toLowerCase().includes('username')) {
        if (usernameError) {
          usernameError.textContent = 'Username is already taken';
          usernameError.classList.add('active');
          usernameInput.classList.add('invalid');
        }
      } else {
        const generalError = document.createElement('div');
        generalError.className = 'error-message active';
        generalError.textContent = `Failed to update profile: ${readable}`;
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

function onProfileUpdateSuccess() {
    console.log('[Profile Update] Success - updating flags and UI');
    
    // Update localStorage (instant + persistent)
    localStorage.setItem('profileCompleted', 'true');
    
    // Hide the dashboard Update Profile card immediately
    const profileCard = document.getElementById('dashboardUpdateProfileCard');
    if (profileCard) {
        profileCard.style.display = 'none';
    }
    
    // Optionally notify user
    if (typeof notify === 'function') {
        notify('Profile updated successfully!', 'success');
    }
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
  // Only skip if ModalManager doesn't know about it
  

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

  // Permanent lock: cannot change username after initial setup
  const lastUpdate = localStorage.getItem('lastUsernameUpdate');
  const currentUsername = localStorage.getItem('username') || '';
  if (value !== currentUsername && lastUpdate) {
    err = 'Username cannot be changed after initial setup';
    errorElement.textContent = err;
    errorElement.classList.add('active', 'error');
    inputElement.classList.add('invalid');
    isValid = false;
    break;
  }

  // Immediate client-side checks: (rest of your existing code unchanged)
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
  // (rest of your existing availability check code unchanged)
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




// ===== FINAL CLEAN VERSION — DELETE EVERYTHING BELOW THIS LINE IN YOUR FILE =====

// 1. Remove the entire openUpdateProfileModal() function
// 2. Remove closeUpdateProfileModal()
// 3. Remove the manual popstate listener
// 4. Remove all manual .active / display / aria-hidden manipulation

// → ONLY keep this: let ModalManager do 100% of the work

if (settingsUpdateBtn) {
  settingsUpdateBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    lastModalSource = 'settings';
    window.ModalManager?.openModal('updateProfileModal');

    // Run validation after transition (ModalManager uses 0.3s)
    setTimeout(() => validateProfileForm(true), 450);
  });
}

if (updateProfileBtn) {
  updateProfileBtn.addEventListener('click', () => {
    lastModalSource = 'dashboard';
    window.ModalManager?.openModal('updateProfileModal');
    setTimeout(() => validateProfileForm(true), 450);
  });
}

// Optional: If you have a dashboard card with class .card.update-profile
document.querySelector('.card.update-profile')?.addEventListener('click', () => {
  lastModalSource = 'dashboard';
  window.ModalManager?.openModal('updateProfileModal');
  setTimeout(() => validateProfileForm(true), 450);
});

// That's it. Nothing else needed.

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
  settingsModal.style.setProperty('display', 'none', 'important');

  document.documentElement.style.setProperty('overflow', '', 'important');
  document.body.style.setProperty('overflow', '', 'important');

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

// In-memory cache for profile to avoid multiple server calls
let _cachedProfilePromise = null;

// small helper to force browsers to re-request the avatar image
function addCacheBuster(url) {
  if (!url) return url;
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('cb', Date.now().toString());
    return u.toString();
  } catch (e) {
    // non-absolute URL fallback
    return url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
  }
}

// Call this when you want to force next call to fetch fresh data
function invalidateProfileCache() {
  _cachedProfilePromise = null;
}
window.invalidateProfileCache =  window.invalidateProfileCache || invalidateProfileCache;

// other tabs notify us when profile changed there
window.addEventListener('storage', (ev) => {
  if (ev.key === 'profile_refreshed_at') {
    // another tab updated profile -> invalidate and refresh silently
    invalidateProfileCache();
    // don't await here; just refresh in background
    loadProfileToSettings().catch(() => {});
  }
});

// loadProfileToSettings: prefer cache; fetch only when needed or forced
async function loadProfileToSettings(force = false) {
  const settingsAvatar = document.getElementById('settingsAvatar');
  const settingsUsername = document.getElementById('settingsUsername');
  const settingsEmail = document.getElementById('settingsEmail');

  if (!settingsAvatar || !settingsUsername || !settingsEmail) {
    console.error('[ERROR] loadProfileToSettings: Missing DOM elements');
    return;
  }

  // Read cached profile from localStorage (instant)
  const localProfile = {
    profilePicture: localStorage.getItem('profilePicture') || '',
    username: localStorage.getItem('username') || '',
    fullName: localStorage.getItem('fullName') || '',
    firstName: localStorage.getItem('firstName') || '',
    email: localStorage.getItem('userEmail') || '',
  };

  const hasUsefulCache = !!(localProfile.profilePicture || localProfile.username || localProfile.fullName || localProfile.email);

  // Render from cache immediately (no fetch)
  const displayName =
    localProfile.username ||
    localProfile.firstName ||
    (localProfile.email ? localProfile.email.split('@')[0] : 'User');

  const avatarUrl = localProfile.profilePicture || '/frontend/img/avatar-placeholder.png';
  const fallbackLetter = (displayName.charAt(0) || 'U').toUpperCase();

  // show cached avatar (no cache-buster here to avoid re-request)
  updateAvatar(settingsAvatar, avatarUrl, fallbackLetter);
  settingsUsername.textContent = displayName;
  settingsUsername.classList.add('fade-in');
  settingsEmail.textContent = localProfile.email || 'Not set';
  settingsEmail.classList.add('fade-in');

  // If we have cache and not forced, do NOT fetch now.
  // Instead, kick off a background fetch (non-blocking) that updates only if changed.
  if (hasUsefulCache && !force) {
    // Start background refresh but do not await it
    (async () => {
      try {
        // reuse your cached-promise logic to avoid duplicate server calls
        if (typeof _cachedProfilePromise === 'undefined' || _cachedProfilePromise === null) {
          // create the cached promise if absent
          _cachedProfilePromise = (async () => {
            try {
              const resp = await fetch(`https://api.flexgig.com.ng/api/profile?_${Date.now()}`, {
                credentials: 'include',
                headers: { Authorization: `Bearer ${localStorage.getItem('authToken') || ''}` },
                cache: 'no-store'
              });
              const serverProfile = resp.ok ? await resp.json().catch(() => ({})) : {};
              // Merge & save as your earlier logic (sync hasPin, etc.)
              const mergedProfile = {
                profilePicture:
                  serverProfile.profilePicture ||
                  serverProfile.profile_picture ||
                  serverProfile.avatar_url ||
                  localProfile.profilePicture ||
                  '',
                username: serverProfile.username || localProfile.username || '',
                fullName: serverProfile.fullName || serverProfile.full_name || localProfile.fullName || '',
                firstName:
                  (serverProfile.fullName && serverProfile.fullName.split(' ')[0]) ||
                  (serverProfile.full_name && serverProfile.full_name.split(' ')[0]) ||
                  localProfile.firstName ||
                  '',
                email: serverProfile.email || localProfile.email || '',
              };

              // Sync hasPin if present
              const serverHasPin = serverProfile.hasPin ?? serverProfile.has_pin ?? serverProfile.hasPIN ?? null;
              if (serverHasPin !== null) {
                localStorage.setItem('hasPin', serverHasPin ? 'true' : 'false');
                if (serverHasPin && typeof setupInactivity === 'function') {
                  try { setupInactivity(); } catch(e){ console.warn('setupInactivity failed', e); }
                }
              }

              // Save changed fields only
              try {
                if (mergedProfile.profilePicture && mergedProfile.profilePicture !== localProfile.profilePicture) {
                  localStorage.setItem('profilePicture', mergedProfile.profilePicture);
                }
                if (mergedProfile.username && mergedProfile.username !== localProfile.username) {
                  localStorage.setItem('username', mergedProfile.username);
                }
                if (mergedProfile.fullName && mergedProfile.fullName !== localProfile.fullName) {
                  localStorage.setItem('fullName', mergedProfile.fullName);
                  localStorage.setItem('firstName', (mergedProfile.fullName.split && mergedProfile.fullName.split(' ')[0]) || '');
                }
                if (mergedProfile.email && mergedProfile.email !== localProfile.email) {
                  localStorage.setItem('userEmail', mergedProfile.email);
                }
                try { localStorage.setItem('profile_refreshed_at', Date.now().toString()); } catch(_) {}
              } catch (e) { console.warn('Could not save mergedProfile to localStorage', e); }

              return mergedProfile;
            } catch (err) {
              console.warn('[background refresh] profile fetch failed', err);
              return localProfile;
            }
          })();
        }

        const finalProfile = await _cachedProfilePromise;

        // Only update UI if something changed vs what we already rendered
        const currentRendered = {
          profilePicture: localProfile.profilePicture || '',
          username: localProfile.username || '',
          email: localProfile.email || ''
        };

        const changed =
          (finalProfile.profilePicture || '') !== currentRendered.profilePicture ||
          (finalProfile.username || '') !== currentRendered.username ||
          (finalProfile.email || '') !== currentRendered.email;

        if (changed) {
          // update avatar with cache-buster so browser fetches the new image
          updateAvatar(settingsAvatar, addCacheBuster(finalProfile.profilePicture || '/frontend/img/avatar-placeholder.png'), (finalProfile.username || finalProfile.firstName || 'U').charAt(0).toUpperCase());
          settingsUsername.textContent = finalProfile.username || finalProfile.firstName || (finalProfile.email ? finalProfile.email.split('@')[0] : 'User');
          settingsEmail.textContent = finalProfile.email || 'Not set';
        }
      } catch (e) {
        // silent fail for background refresh
        console.debug('[background refresh] failed', e);
      }
    })();

    // Return early — do not await network call
    return localProfile;
  }

  // If here: either no cache or force === true => perform normal (blocking) fetch path
  if (force) _cachedProfilePromise = null; // clear any previous cached promise

  if (!_cachedProfilePromise) {
    _cachedProfilePromise = (async () => {
      try {
        const resp = await fetch(`https://api.flexgig.com.ng/api/profile?_${Date.now()}`, {
          credentials: 'include',
          headers: { Authorization: `Bearer ${localStorage.getItem('authToken') || ''}` },
          cache: 'no-store'
        });
        const serverProfile = resp.ok ? await resp.json().catch(() => ({})) : {};

        const mergedProfile = {
          profilePicture:
            serverProfile.profilePicture ||
            serverProfile.profile_picture ||
            serverProfile.avatar_url ||
            localProfile.profilePicture ||
            '',
          username: serverProfile.username || localProfile.username || '',
          fullName: serverProfile.fullName || serverProfile.full_name || localProfile.fullName || '',
          firstName:
            (serverProfile.fullName && serverProfile.fullName.split(' ')[0]) ||
            (serverProfile.full_name && serverProfile.full_name.split(' ')[0]) ||
            localProfile.firstName ||
            '',
          email: serverProfile.email || localProfile.email || '',
        };

        // Save to localStorage (only if changed)
        try {
          if (mergedProfile.profilePicture && mergedProfile.profilePicture !== localProfile.profilePicture) {
            localStorage.setItem('profilePicture', mergedProfile.profilePicture);
          }
          if (mergedProfile.username && mergedProfile.username !== localProfile.username) {
            localStorage.setItem('username', mergedProfile.username);
          }
          if (mergedProfile.fullName && mergedProfile.fullName !== localProfile.fullName) {
            localStorage.setItem('fullName', mergedProfile.fullName);
            localStorage.setItem('firstName', (mergedProfile.fullName.split && mergedProfile.fullName.split(' ')[0]) || '');
          }
          if (mergedProfile.email && mergedProfile.email !== localProfile.email) {
            localStorage.setItem('userEmail', mergedProfile.email);
          }
          try { localStorage.setItem('profile_refreshed_at', Date.now().toString()); } catch(_) {}
        } catch (e) {
          console.warn('Could not save mergedProfile to localStorage', e);
        }

        return mergedProfile;
      } catch (err) {
        console.error('[ERROR] loadProfileToSettings server fetch failed', err);
        return localProfile; // fallback
      }
    })();
  }

  const finalProfile = await _cachedProfilePromise;

  // update UI (blocking) — only update if different to avoid flicker
  const avatarChanged = (finalProfile.profilePicture || '') !== (localProfile.profilePicture || '');
  if (avatarChanged) {
    updateAvatar(settingsAvatar, addCacheBuster(finalProfile.profilePicture || '/frontend/img/avatar-placeholder.png'), (finalProfile.username || finalProfile.firstName || 'U').charAt(0).toUpperCase());
  }
  const nameChanged = (finalProfile.username || finalProfile.firstName || '') !== (localProfile.username || localProfile.firstName || '');
  if (nameChanged) {
    settingsUsername.textContent = finalProfile.username || finalProfile.firstName || (finalProfile.email ? finalProfile.email.split('@')[0] : 'User');
    settingsUsername.classList.add('fade-in');
  }
  const emailChanged = (finalProfile.email || '') !== (localProfile.email || '');
  if (emailChanged) {
    settingsEmail.textContent = finalProfile.email || 'Not set';
    settingsEmail.classList.add('fade-in');
  }

  return finalProfile;
}

window.loadProfileToSettings = window.loadProfileToSettings || loadProfileToSettings;


// initial load (safe to call multiple times)
loadProfileToSettings().catch(e => console.warn('loadProfileToSettings failed', e));



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



// ✅ IMPROVED: Logout button handler with better UX
if (logoutBtnModal) {
  logoutBtnModal.addEventListener('click', async (e) => {
    e.preventDefault();
    
    // Prevent double-clicks
    if (logoutBtnModal.disabled) return;
    logoutBtnModal.disabled = true;
    
    const originalText = logoutBtnModal.textContent;
    logoutBtnModal.textContent = 'Logging out...';
    
    showLoader();

    try {
      // Wait for full logout (server + client cleanup)
      await fullClientLogout();
      // Note: This line won't execute due to redirect, but kept for clarity
    } catch (err) {
      console.error('[modal logout] Full logout failed:', err);
      // Ensure we still redirect even if something breaks
      window.location.replace('/');
    } finally {
      // These won't execute due to redirect, but included for safety
      // in case redirect somehow fails
      try { 
        hideModal(); 
        hideLoader();
        logoutBtnModal.disabled = false;
        logoutBtnModal.textContent = originalText;
      } catch (_) {
        // Ignore cleanup errors
      }
    }
  });
}

// ✅ OPTIONAL: Add logout on window unload for extra security (optional)
window.addEventListener('beforeunload', () => {
  // Clear sensitive data even if user closes tab
  try {
    window.currentUser = null;
    window.currentEmail = null;
    window.__rp_reset_token = null;
  } catch (e) {}
});

// ✅ OPTIONAL: Auto-logout on token expiration (if you detect it elsewhere)
window.addEventListener('storage', (e) => {
  // If another tab cleared storage (logged out), logout this tab too
  if (e.key === null || e.key === 'token' || e.key === 'user') {
    if (!e.newValue && e.oldValue) {
      console.log('[storage event] Detected logout from another tab');
      window.location.replace('/');
    }
  }
});



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
  window.__sec_log = window.__sec_log || __sec_log; // expose for debugging

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
  window.__sec_KEYS = window.__sec_KEYS || __sec_KEYS; // expose for debugging

  /* Helpers */
  // Replace existing __sec_setChecked with this
// Replace existing __sec_setChecked with this improved version
const __sec_setChecked = (el, v) => {
  __sec_log.d('setChecked called for el:', el?.id || 'unknown', 'value:', v);
  if (!el) return;
  try {
    const boolV = !!v;

    // If it's a native input checkbox/radio, keep the native checked property in sync
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      try { el.checked = boolV; } catch (err) { __sec_log.w('setChecked: failed to set .checked', err); }
    }

    // aria state
    try { el.setAttribute('aria-checked', boolV ? 'true' : 'false'); } catch (err) { __sec_log.w('setChecked: aria set failed', err); }

    // Visual classes expected elsewhere ('active' / 'inactive')
    try {
      if (boolV) {
        el.classList.add('active');
        el.classList.remove('inactive');
      } else {
        el.classList.add('inactive');
        el.classList.remove('active');
      }
      // also maintain dataset flag for other code paths
      el.dataset.active = boolV ? 'true' : 'false';
    } catch (err) {
      __sec_log.w('setChecked: class toggling failed', err);
    }

    __sec_log.d('setChecked applied:', {
      aria: el.getAttribute('aria-checked'),
      checked: (el instanceof HTMLInputElement) ? el.checked : undefined,
      classActive: !!(el.classList && el.classList.contains && el.classList.contains('active'))
    });
  } catch (err) {
    __sec_log.e('setChecked top-level error', err);
  }
};


  // Replace existing __sec_isChecked with this robust reader
// Replace existing __sec_isChecked with this robust reader
const __sec_isChecked = (el) => {
  if (!el) return false;
  try {
    // Prefer native checked for inputs
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      const c = !!el.checked;
      __sec_log.d('isChecked (input) for', el.id || 'unknown', c);
      return c;
    }
    // Fallback: aria-checked attribute
    const aria = el.getAttribute && el.getAttribute('aria-checked');
    if (aria === 'true' || aria === 'false') {
      const c = aria === 'true';
      __sec_log.d('isChecked (aria) for', el.id || 'unknown', c);
      return c;
    }
    // Last fallback: CSS class presence
    const hasActive = el.classList && el.classList.contains && el.classList.contains('active');
    __sec_log.d('isChecked (class fallback) for', el.id || 'unknown', hasActive);
    return !!hasActive;
  } catch (err) {
    __sec_log.e('isChecked error', err);
    return false;
  }
};


  // Replace existing __sec_toggleSwitch with this
// Replace existing __sec_toggleSwitch with this
function __sec_toggleSwitch(el, forced) {
  __sec_log.d('toggleSwitch entry:', { el: el?.id || 'unknown', forced });
  if (!el) { 
    __sec_log.w('toggleSwitch: no element'); 
    return false; 
  }
  try {
    const cur = __sec_isChecked(el);
    const next = (typeof forced === 'boolean') ? forced : !cur;
    // Apply the visual + attribute change
    __sec_setChecked(el, next);
    __sec_log.d('toggleSwitch exit:', { cur, next });
    // emit a small custom event so any other listeners update too (defensive)
    try {
      const ev = new CustomEvent('sec:switch-change', { detail: { id: el.id, checked: next } });
      el.dispatchEvent(ev);
    } catch (evErr) {
      __sec_log.d('toggleSwitch: event dispatch failed', evErr);
    }
    return next;
  } catch (err) {
    __sec_log.e('toggleSwitch error', err);
    return false;
  }
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
  window.__sec_getCurrentUser = window.__sec_getCurrentUser || __sec_getCurrentUser;


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

  // Update UI
  __sec_setChecked(__sec_parentSwitch, parentOn);

  // Persist to both key namespaces (new secure keys + legacy keys used elsewhere)
  try {
    // new namespaced keys (existing)
    localStorage.setItem(__sec_KEYS.biom, parentOn ? '1' : '0');
    // legacy boolean flags (used by other code paths)
    localStorage.setItem('biometricsEnabled', parentOn ? 'true' : 'false');
    __sec_log.d('setBiometrics: stored keys', { [__sec_KEYS.biom]: parentOn ? '1' : '0', biometricsEnabled: parentOn ? 'true' : 'false' });
  } catch (e) {
    __sec_log.e('setBiometrics: storage error', e);
  }

  // Force children when parent activated
  if (parentOn) {
    if (__sec_bioLogin) {
      __sec_setChecked(__sec_bioLogin, true);
      try { localStorage.setItem(__sec_KEYS.bioLogin, '1'); localStorage.setItem('biometricForLogin', 'true'); } catch(e){ __sec_log.e('setBiometrics: bioLogin storage', e); }
    }
    if (__sec_bioTx) {
      __sec_setChecked(__sec_bioTx, true);
      try { localStorage.setItem(__sec_KEYS.bioTx, '1'); localStorage.setItem('biometricForTx', 'true'); } catch(e){ __sec_log.e('setBiometrics: bioTx storage', e); }
    }
    if (__sec_bioOptions) {
  // Reveal child rows and ensure options container visible (no external dependency)
  __sec_revealChildrenNoAnimate();

  try {
    __sec_bioOptions.classList.add('show');
    __sec_bioOptions.hidden = false;
    // If original implementation used inline display style:
    __sec_bioOptions.style.display = '';
    // Make children rows visible similarly to reveal function (defensive)
    const rows = Array.from(__sec_bioOptions.querySelectorAll('.setting-row'));
    rows.forEach(r => {
      r.classList.add('visible');
      // clear any stray transition delays when toggling programmatically
      r.style.transitionDelay = '';
    });
  } catch (e) {
    __sec_log.w('setBiometrics: enable options UI failed', e);
  }
}


    __sec_log.i('biom ON', { animate });
  } else {
    // Turn children off too
    if (__sec_bioLogin) {
      __sec_setChecked(__sec_bioLogin, false);
      try { localStorage.setItem(__sec_KEYS.bioLogin, '0'); localStorage.setItem('biometricForLogin', 'false'); } catch(e){ __sec_log.e('setBiometrics: bioLogin storage', e); }
    }
    if (__sec_bioTx) {
      __sec_setChecked(__sec_bioTx, false);
      try { localStorage.setItem(__sec_KEYS.bioTx, '0'); localStorage.setItem('biometricForTx', 'false'); } catch(e){ __sec_log.e('setBiometrics: bioTx storage', e); }
    }
    if (__sec_bioOptions) {
      __sec_bioOptions.classList.remove('show');
      __sec_bioOptions.hidden = true;
      const rows = Array.from(__sec_bioOptions.querySelectorAll('.setting-row'));
      rows.forEach(r => { r.classList.remove('visible'); r.style.transitionDelay = ''; });
    }
    __sec_log.i('biom OFF', { animate });
  }

  __sec_log.d('setBiometrics exit');
}


/* If both child switches are off, turn the parent off */
// ----------------- Debounced __sec_beDisableParentIfChildrenOff (drop-in) -----------------
// Replace existing __sec_maybeDisableParentIfChildrenOff with this debounced version
// Replace existing __sec_maybeDisableParentIfChildrenOff with this debounced version
let __sec_maybeDisableTimer = null;
function __sec_maybeDisableParentIfChildrenOff() {
  __sec_log.d('maybeDisableParentIfChildrenOff entry (debounced)');

  const DEBOUNCE_MS = 200; // adjust if you prefer longer

  if (__sec_maybeDisableTimer) clearTimeout(__sec_maybeDisableTimer);
  __sec_maybeDisableTimer = setTimeout(() => {
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

      // If both children OFF and parent currently ON => flip parent OFF
      if (!loginOn && !txOn && __sec_isChecked(__sec_parentSwitch)) {
        __sec_log.i('Both biometric children off — turning parent OFF (debounced)');
        if (typeof __sec_setBiometrics === 'function') {
          try {
            __sec_setBiometrics(false, true);
          } catch (e) {
            __sec_log.e('maybeDisableParentIfChildrenOff: __sec_setBiometrics threw', e);
            // fallback: update storage + UI
            try {
              localStorage.setItem(__sec_KEYS.biom, '0');
              localStorage.setItem('biometricsEnabled', 'false');
            } catch (ee) { __sec_log.e('maybeDisableParentIfChildrenOff: persist fallback failed', ee); }
            if (__sec_parentSwitch) __sec_setChecked(__sec_parentSwitch, false);
            if (__sec_bioOptions) { __sec_bioOptions.classList.remove('show'); __sec_bioOptions.hidden = true; }
          }
        } else {
          // fallback: update storage + UI
          try {
            localStorage.setItem(__sec_KEYS.biom, '0');
            localStorage.setItem('biometricsEnabled', 'false');
          } catch (e) { __sec_log.e('maybeDisableParentIfChildrenOff fallback storage failed', e); }
          if (__sec_parentSwitch) __sec_setChecked(__sec_parentSwitch, false);
          if (__sec_bioOptions) { __sec_bioOptions.classList.remove('show'); __sec_bioOptions.hidden = true; }
        }
      } else {
        __sec_log.d('maybeDisableParentIfChildrenOff: no action needed');
      }
    } catch (err) {
      __sec_log.e('maybeDisableParentIfChildrenOff error', err);
    } finally {
      __sec_log.d('maybeDisableParentIfChildrenOff exit');
    }
  }, DEBOUNCE_MS);
}



async function reconcileBiometricState() {
  __sec_log.d('reconcileBiometricState entry');

  // find a credentialId if present (several possible keys)
  const cred = (
    localStorage.getItem('credentialId') ||
    localStorage.getItem('webauthn-cred-id') ||
    localStorage.getItem('webauthn_cred') ||
    localStorage.getItem('__sec_credentialId') ||
    ''
  );

  // Quick local-only rule: if no local credential at all, treat as NOT available.
  if (!cred) {
    __sec_log.i('reconcile: no local credential found — clearing biometric flags');
    try {
      localStorage.setItem(__sec_KEYS.biom, '0');
      localStorage.setItem('biometricsEnabled', 'false');
      localStorage.setItem(__sec_KEYS.bioLogin, '0');
      localStorage.setItem(__sec_KEYS.bioTx, '0');
      localStorage.setItem('biometricForLogin', 'false');
      localStorage.setItem('biometricForTx', 'false');
    } catch (e) { __sec_log.e('reconcile: local clear failed', e); }
    // Update UI to off
    if (__sec_parentSwitch) __sec_setChecked(__sec_parentSwitch, false);
    if (__sec_bioOptions) { __sec_bioOptions.classList.remove('show'); __sec_bioOptions.hidden = true; }
    return;
  }

  // If we have a local credential, confirm server still recognizes it
  try {
    __sec_log.d('reconcile: have local cred, will check server only if we can resolve userId', { credentialIdSample: (cred && cred.slice ? cred.slice(0,20) : cred) });

    // Helper: safely call getSession with timeout
    const safeGetSessionUserId = async (timeoutMs = 800) => {
      if (typeof getSession !== 'function') return null;
      try {
        const p = (async () => {
          try {
            const s = await getSession();
            return s && s.user && (s.user.id || s.user.uid || null);
          } catch (e) { return null; }
        })();
        const t = new Promise(r => setTimeout(() => r(null), timeoutMs));
        return await Promise.race([p, t]);
      } catch (e) {
        __sec_log.w('safeGetSessionUserId error', e);
        return null;
      }
    };

    // Try to obtain userId (short wait). If none, do NOT call server.
    const resolvedUserId = await getOrCreateSessionPromise(); // wait up to 4000ms for session
    if (!resolvedUserId) {
      // 🔥 FIX: Don't clear flags when userId unavailable - it's just a timing issue!
      // The user's biometric settings should persist across reloads.
      __sec_log.i('reconcile: no userId available after short wait — skipping server check but preserving existing flags');
      
      // Just restore the UI from existing localStorage (don't modify flags)
      try {
        const existingBiomEnabled = localStorage.getItem('biometricsEnabled') === 'true';
        const existingBioLogin = localStorage.getItem('biometricForLogin') === 'true';
        const existingBioTx = localStorage.getItem('biometricForTx') === 'true';
        
        __sec_log.d('reconcile: preserving existing state', { 
          existingBiomEnabled, 
          existingBioLogin, 
          existingBioTx 
        });
        
        // Restore UI based on existing flags
        if (existingBiomEnabled && (existingBioLogin || existingBioTx)) {
          if (__sec_parentSwitch) __sec_setChecked(__sec_parentSwitch, true);
          if (__sec_bioOptions) {
            __sec_revealChildrenNoAnimate();
            if (__sec_bioLogin) __sec_setChecked(__sec_bioLogin, existingBioLogin);
            if (__sec_bioTx) __sec_setChecked(__sec_bioTx, existingBioTx);
          }
        } else {
          if (__sec_parentSwitch) __sec_setChecked(__sec_parentSwitch, false);
          if (__sec_bioOptions) { 
            __sec_bioOptions.classList.remove('show'); 
            __sec_bioOptions.hidden = true; 
          }
        }
      } catch (e) { 
        __sec_log.e('reconcile: UI restore failed', e); 
      }
      
      return; // skip server call (will validate on next attempt when userId is available)
    }

    // We have a userId — call the server with both credentialId and userId
    __sec_log.d('reconcile: resolved userId, calling /webauthn/auth/options', { userIdSample: resolvedUserId && resolvedUserId.slice ? resolvedUserId.slice(0,12) : resolvedUserId });
    const apiBase = (window.__SEC_API_BASE || (typeof API_BASE !== 'undefined' ? API_BASE : ''));
    const res = await (typeof window.__origFetch !== 'undefined' ? window.__origFetch : fetch)(apiBase + '/webauthn/auth/options', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialId: cred, userId: resolvedUserId })
    });
    const text = await res.text().catch(()=> '');
    if (!res.ok) {
      __sec_log.w('reconcile: /webauthn/auth/options returned non-ok — clearing flags', { status: res.status, textSample: (text||'').slice(0,300) });
      // Clear local flags and UI (server rejected the credential)
      try {
        localStorage.setItem(__sec_KEYS.biom, '0');
        localStorage.setItem('biometricsEnabled', 'false');
        localStorage.setItem(__sec_KEYS.bioLogin, '0');
        localStorage.setItem(__sec_KEYS.bioTx, '0');
        localStorage.setItem('biometricForLogin', 'false');
        localStorage.setItem('biometricForTx', 'false');
      } catch (e) { __sec_log.e('reconcile: persist clear failed', e); }
      if (__sec_parentSwitch) __sec_setChecked(__sec_parentSwitch, false);
      if (__sec_bioOptions) { __sec_bioOptions.classList.remove('show'); __sec_bioOptions.hidden = true; }
      // If server gave useful JSON error, rethrow for logging; otherwise throw generic error
      try { throw new Error(text || `HTTP ${res.status}`); } catch(e) { throw e; }
    }

    // success -> server validated credential: mark enabled
    const opts = text ? JSON.parse(text) : {};
    __sec_log.i('reconcile: server confirmed credential - marking biometrics enabled', { allowCount: opts.allowCredentials ? opts.allowCredentials.length : 0 });
    try {
      localStorage.setItem(__sec_KEYS.biom, '1');
      localStorage.setItem('biometricsEnabled', 'true');
      if (typeof restoreBiometricUI === 'function') restoreBiometricUI();
      if (typeof safeCall === 'function' && typeof notify === 'function') {
        safeCall(notify, 'Fingerprint set up successfully!', 'success');
      }
      
      // 🔥 FIX: Only set children to 'true' if they're currently unset (null)
      // Don't override explicit user choices!
      const currentLogin = localStorage.getItem('biometricForLogin');
      const currentTx = localStorage.getItem('biometricForTx');
      
      if (currentLogin === null) {
        localStorage.setItem(__sec_KEYS.bioLogin, '1');
        localStorage.setItem('biometricForLogin', 'true');
      }
      if (currentTx === null) {
        localStorage.setItem(__sec_KEYS.bioTx, '1');
        localStorage.setItem('biometricForTx', 'true');
      }
    } catch (e) { __sec_log.e('reconcile: persist enabled flags failed', e); }
    
    if (__sec_parentSwitch) __sec_setChecked(__sec_parentSwitch, true);
    if (__sec_bioOptions) {
      __sec_revealChildrenNoAnimate();
      if (__sec_bioLogin) __sec_setChecked(__sec_bioLogin, localStorage.getItem('biometricForLogin') === 'true');
      if (__sec_bioTx) __sec_setChecked(__sec_bioTx, localStorage.getItem('biometricForTx') === 'true');
    }
  } catch (err) {
    __sec_log.w('reconcileBiometricState error', err);
    // flags/UI already cleared in error flows above
  }
}


/* Initialize from storage */
async function __sec_initFromStorage() {
  __sec_log.d('initFromStorage entry (reconciled)');
  try {
    // read both key namespaces
    const rawBiom = localStorage.getItem(__sec_KEYS.biom); // '1' | '0' | null
    const rawLogin = localStorage.getItem(__sec_KEYS.bioLogin);
    const rawTx = localStorage.getItem(__sec_KEYS.bioTx);

    const legacyBiom = localStorage.getItem('biometricsEnabled');
    const legacyLogin = localStorage.getItem('biometricForLogin');
    const legacyTx = localStorage.getItem('biometricForTx');

    // Normalize - prefer explicit '1' or 'true' where present
    const biomStored = (rawBiom === '1') || (legacyBiom === 'true');
    const loginStored = (rawLogin === '1') || (legacyLogin === 'true');
    const txStored = (rawTx === '1') || (legacyTx === 'true');

    __sec_log.d('initFromStorage parsed:', { rawBiom, legacyBiom, rawLogin, legacyLogin, rawTx, legacyTx });

    // Apply UI per local preferred state (we will reconcile with server next)
    if (__sec_parentSwitch) { __sec_setChecked(__sec_parentSwitch, !!biomStored); }
    if (__sec_bioOptions) {
      if (biomStored) {
        __sec_revealChildrenNoAnimate();
        if (__sec_bioLogin) __sec_setChecked(__sec_bioLogin, !!loginStored);
        if (__sec_bioTx) __sec_setChecked(__sec_bioTx, !!txStored);
      } else {
        if (__sec_bioLogin) __sec_setChecked(__sec_bioLogin, false);
        if (__sec_bioTx) __sec_setChecked(__sec_bioTx, false);
        __sec_bioOptions.classList.remove('show');
        __sec_bioOptions.hidden = true;
      }
    }

    // Reconcile with server / local credential id to avoid stale mismatch
    try {
      await reconcileBiometricState(); // defined next — updates both key namespaces and UI
    } catch (re) {
      __sec_log.w('reconcileBiometricState failed (non-fatal)', re);
    }

    __sec_log.d('initFromStorage complete', { biomStored, loginStored, txStored });
  } catch (err) {
    __sec_log.e('initFromStorage error', err);
  }
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
window.showSlideNotification = window.showSlideNotification || showSlideNotification;



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
  // Robust notify: always deliver a plain string to UI and log raw input for debugging.
// Keeps slide/toast preferences but normalizes message shape.
// Replace existing __sec_pin_notify with this robust version.
// Paste this into the same scope as other helpers.
const PIN_DEBUG = true; // set false when done debugging

function __sec_pin_notify(raw, type = 'info', duration = (type === 'error' ? 4000 : 2000)) {
  function dlog(...args) { if (!PIN_DEBUG) return; try { console.debug('[pin-notify]', ...args); } catch(_){} }

  // 1) Normalize raw -> msg (plain string)
  let msg = '';
  try {
    if (raw instanceof Error) msg = raw.message || String(raw);
    else if (raw == null) msg = '';
    else if (typeof raw === 'string') msg = raw;
    else if (typeof raw === 'object') {
      if (typeof raw.message === 'string' && raw.message.trim()) msg = raw.message;
      else if (raw.error && typeof raw.error === 'object' && typeof raw.error.message === 'string') msg = raw.error.message;
      else if (raw.error && typeof raw.error === 'string') {
        try { const p = JSON.parse(raw.error); if (p?.message) msg = p.message; else msg = raw.error; } catch(e){ msg = raw.error; }
      } else if (Array.isArray(raw.errors) && raw.errors[0] && raw.errors[0].message) msg = raw.errors[0].message;
      else {
        try { msg = JSON.stringify(raw); } catch(e){ msg = String(raw); }
      }
    } else msg = String(raw);
  } catch (e) {
    msg = 'An error occurred. Try again.';
  }

  // unwrap one level of double-encoded JSON strings like '{"error":{"message":"Invalid PIN"}}'
  try {
    const t = (typeof msg === 'string' ? msg.trim() : msg);
    if (t && (t.startsWith('{') || t.startsWith('[') || (t.startsWith('"') && t.endsWith('"')))) {
      try {
        const parsed = JSON.parse(t);
        if (parsed && typeof parsed === 'object') {
          if (parsed.message) msg = parsed.message;
          else if (parsed.error && parsed.error.message) msg = parsed.error.message;
          else msg = JSON.stringify(parsed);
        } else if (typeof parsed === 'string') {
          msg = parsed;
        }
      } catch (e) { /* ignore parse failure */ }
    }
  } catch (e) { /* ignore */ }

  // final cleanup
  msg = (typeof msg === 'string' ? msg.trim() : String(msg));
  if (!msg) msg = (type === 'error' ? 'An error occurred. Try again.' : '');

  dlog('__sec_pin_notify: normalized msg:', msg, 'type:', type, 'duration:', duration, 'rawPreview:', raw);

  // 2) Gentle cleanup of non-sticky old toasts (do not aggressively remove sticky server banners)
  try {
    const container = document.querySelector('#flexgig_slide_container') || document.querySelector('#toast_container');
    if (container) {
      Array.from(container.children).forEach((el) => {
        const isSticky = el.dataset?.serverId || el.classList?.contains('sticky');
        if (!isSticky) try { el.remove(); } catch (e) { dlog('failed to remove toast child', e); }
      });
    } else {
      // minimal fallback: remove some known transient classes
      document.querySelectorAll('.flexgig-toast, .toast, .slide-notification').forEach(el => {
        if (!el.classList.contains('sticky')) try { el.remove(); } catch(e) { dlog('removal fallback failed', e); }
      });
    }
  } catch (e) {
    dlog('notify cleanup error', e);
  }

  // 3) Deliver to UI: try safe signatures for both slide and toast helpers.
  // We'll attempt message-first signature first because that's common, then object-style.
  let delivered = false;

  // Helper to try a call and catch failures
  function tryCall(fn, args, label) {
    try {
      fn.apply(null, args);
      dlog('notify: used', label, 'args:', args);
      return true;
    } catch (err) {
      dlog('notify: call failed for', label, 'error:', err);
      return false;
    }
  }

  // Try slide notification (message-first signature)
  try {
    if (typeof showSlideNotification === 'function') {
      // attempt common signature: (message, type, duration, opts)
      delivered = tryCall(showSlideNotification, [msg, type, duration, { position: 'top-right' }], 'showSlideNotification(message, type, duration, opts)');
      if (!delivered) {
        // attempt object signature: ({ message, type, duration, position })
        delivered = tryCall(showSlideNotification, [{ message: msg, type, duration, position: 'top-right' }], 'showSlideNotification({message,...})');
      }
      if (delivered) return;
    }
  } catch (e) { dlog('showSlideNotification path error', e); }

  // Try toast helper
  try {
    if (typeof showToast === 'function') {
      // try common signature (message, type, duration)
      delivered = tryCall(showToast, [msg, type, duration], 'showToast(message, type, duration)');
      if (!delivered) {
        // try object style
        delivered = tryCall(showToast, [{ message: msg, type, duration }], 'showToast({message,...})');
      }
      if (delivered) return;
    }
  } catch (e) { dlog('showToast path error', e); }

  // 4) Final fallback: build a simple DOM toast inline (guarantee string usage)
  try {
    const fallbackId = '__fg_notify_fallback';
    let fallbackContainer = document.getElementById(fallbackId);
    if (!fallbackContainer) {
      fallbackContainer = document.createElement('div');
      fallbackContainer.id = fallbackId;
      fallbackContainer.style.position = 'fixed';
      fallbackContainer.style.top = '20px';
      fallbackContainer.style.right = '20px';
      fallbackContainer.style.zIndex = '13000';
      document.body.appendChild(fallbackContainer);
    }

    const el = document.createElement('div');
    el.textContent = msg; // textContent ensures object->String handled correctly
    el.style.background = (type === 'error' ? '#e53935' : '#333');
    el.style.color = '#fff';
    el.style.padding = '10px 14px';
    el.style.borderRadius = '8px';
    el.style.marginTop = '8px';
    el.style.maxWidth = '360px';
    el.style.boxShadow = '0 6px 18px rgba(0,0,0,0.18)';
    fallbackContainer.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch(_) {} }, duration || 3000);
    dlog('notify: used fallback DOM toast');
    return;
  } catch (e) {
    // last resort: console
    console[type === 'error' ? 'error' : 'log'](msg);
    dlog('notify fallback to console, msg:', msg, 'error:', e);
    return;
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

  // Hardened token helper (does NOT log the token)
// ===== Helper: hardened token lookup + fetchWithAuth (add once globally, near top of file) =====
function getAuthToken() {
  try {
    if (typeof window.__SEC_AUTH_TOKEN === 'string' && window.__SEC_AUTH_TOKEN) return window.__SEC_AUTH_TOKEN;
    const keys = ['authToken','token','idToken','sessionToken','accessToken','__fg_token','__SEC_AUTH_TOKEN'];
    for (const k of keys) {
      try { const v = localStorage.getItem(k); if (v) return v; } catch (_) {}
    }
    const sess = window.__SEC_SESSION || window.__session || null;
    if (sess) {
      if (typeof sess === 'string') {
        try { const parsed = JSON.parse(sess); if (parsed?.token) return parsed.token; } catch(_) {}
      } else {
        if (sess?.token) return sess.token;
        if (sess?.user?.token) return sess.user.token;
      }
    }
  } catch (err) { /* swallow */ }
  return '';
}

async function fetchWithAuth(url, opts = {}) {
  // Try cookie-based first (safer)
  const baseOpts = Object.assign({}, opts, { credentials: 'include' });
  let res = await fetch(url, baseOpts);
  if (res.status === 401 || res.status === 403) {
    const token = getAuthToken();
    if (!token) return res; // no fallback token available
    const headers = Object.assign({}, opts.headers || {}, { Authorization: `Bearer ${token}` });
    res = await fetch(url, Object.assign({}, opts, { headers, credentials: 'include' }));
  }
  return res;
}

// ===== Replacement: Pin modal wiring (use named handlers so we can remove them safely) =====
function __sec_pin_wireHandlers() {
  const __sec_CHANGE_FORM   = __sec_q('#changePinForm');
  const __sec_RESET_BTN     = __sec_q('#resetPinBtn');
  const __sec_PIN_CURRENT   = __sec_q('#currentPin');
  const __sec_PIN_NEW       = __sec_q('#newPin');
  const __sec_PIN_CONFIRM   = __sec_q('#confirmPin');

  if (!__sec_CHANGE_FORM || !__sec_PIN_CURRENT || !__sec_PIN_NEW || !__sec_PIN_CONFIRM) {
    __sec_log.d('PIN elements not found, skipping wiring');
    return;
  }

  __sec_pin_bindStrictInputs();

  // Named handler for confirm input (so it can be removed later)
  let confirmDebounceId = null;
  function confirmInputHandler(e) {
    if (confirmDebounceId) clearTimeout(confirmDebounceId);
    confirmDebounceId = setTimeout(() => {
      const newPin = __sec_PIN_NEW.value;
      if (e.target.value !== newPin && e.target.value.length === 4) {
        console.log('PINs do not match. Please retype.', 'warning', 1500);
      }
    }, 300);
  }
  __sec_PIN_CONFIRM.addEventListener('input', confirmInputHandler);

  // Named submit handler so we can remove if modal closed/cleanup required
  async function onChangePinSubmit(e) {
    e.preventDefault();
    e.stopPropagation();

    const currentPin = __sec_PIN_CURRENT.value.trim();
    const newPin = __sec_PIN_NEW.value.trim();
    const confirmPin = __sec_PIN_CONFIRM.value.trim();

    toggleKeypadProcessing(true);

    try {
      await withLoader(async () => {
        // sync validation
        if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin) || !/^\d{4}$/.test(confirmPin)) {
          throw new Error('All fields must be exactly 4 digits.');
        }
        if (newPin === currentPin) throw new Error('New PIN must be different from current PIN.');
        if (newPin !== confirmPin) throw new Error('Confirm PIN does not match new PIN.');

        const uid = await __sec_pin_getUid();
        if (!uid) throw new Error('Unable to retrieve account. Please refresh.');

        // use fetchWithAuth to avoid missing auth header/cookies
        // verify current PIN
const verifyRes = await fetchWithAuth(`${window.__SEC_API_BASE}/api/verify-pin`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pin: currentPin, userId: uid })
});
if (!verifyRes.ok) {
  const body = await parseErrorResponse(verifyRes);
  // Log structured server reason for debugging
  console.warn('[PIN][warn] current PIN verification failed', body);

  // Notify user with server-provided message if available
  __sec_pin_notify('Current PIN is incorrect. Try again.', 'error');

  // clear inputs safely (uses the fallback or your existing helper)
  try { window.__fg_pin_clearAllInputs(); } catch (_) { 
    // final fallback local reset
    document.querySelectorAll('#currentPin, #newPin, #confirmPin').forEach(el => { try { el.value = ''; } catch(_){} });
    const first = document.querySelector('#currentPin'); if (first) try { first.focus(); } catch(_){} 
  }

  // throw to stop the success path and let outer catch handle logs/state
  throw new Error(body.message || `Verify PIN failed (${verifyRes.status})`);
}

// save new PIN
const saveRes = await fetchWithAuth(`${window.__SEC_API_BASE}/api/save-pin`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pin: newPin, userId: uid })
});
if (!saveRes.ok) {
  const body = await parseErrorResponse(saveRes);
  console.warn('[PIN][warn] save PIN failed', body);
  __sec_pin_notify('Failed to update PIN. Try again.', 'error');
  throw new Error(body.message || `Save PIN failed (${saveRes.status})`);
}


        // Success: update state
        localStorage.setItem('hasPin', 'true');
        window.dispatchEvent(new CustomEvent('pin-status-changed'));

        // Reset input fields
        __sec_PIN_CURRENT.value = '';
        __sec_PIN_NEW.value = '';
        __sec_PIN_CONFIRM.value = '';
        __sec_PIN_CURRENT.focus();

        // Close modal using ModalManager if available (keeps a11y & state consistent)
        try {
          if (typeof ModalManager !== 'undefined' && typeof ModalManager.closeModal === 'function') {
            ModalManager.closeModal('securityPinModal');
            __sec_log.d('[PinModal] Closed via ModalManager');
          } else {
            const modal = __sec_q('#securityPinModal');
            if (modal) modal.style.display = 'none';
          }
        } catch (e) {
          // swallow – don't block success UX
          __sec_log.d('[PinModal] close modal fallback used', e);
          const modal = __sec_q('#securityPinModal');
          if (modal) modal.style.display = 'none';
        }

        // Show success notify after we gave the browser a frame to paint (modal hidden)
        requestAnimationFrame(() => {
          console.log('PIN updated successfully!', 'success');
        });
      });
    } catch (error) {
      // friendly error mapping
      console.error('PIN change error:', error);
      let msg = error.message || 'Failed to change PIN.';
      if (/incorrect/i.test(msg) || msg.includes('INCORRECT_PIN')) {
        console.log('Incorrect current PIN. Please try again.');
      } else if (msg.includes('TOO_MANY_ATTEMPTS')) {
        msg = 'Too many attempts. Account locked temporarily.';
        try { localStorage.setItem('pinLockUntil', new Date(Date.now() + 5*60*1000).toISOString()); } catch (_) {}
      }
      __sec_pin_notify(msg, 'error');

      // small shake on inputs
      document.querySelectorAll('#currentPin, #newPin, #confirmPin').forEach(el => {
        el.classList.add('shake');
        setTimeout(() => el.classList.remove('shake'), 300);
      });
      __sec_PIN_CURRENT.focus();
    } finally {
      toggleKeypadProcessing(false);
    }
  }

  // Attach the named submit handler
  __sec_CHANGE_FORM.addEventListener('submit', onChangePinSubmit);

  // Reset button wiring
  if (__sec_RESET_BTN) {
    __sec_RESET_BTN.addEventListener('click', (ev) => {
      ev.preventDefault();
      //window.location.href = '/reset-pin.html';
    });
  }

  // Cleanup hook: if you want to remove listeners when modal fully closed, provide a cleanup function
  // (optional; call this when modal destroyed to avoid duplicate listeners if modal is reopened)
  __sec_pin_wireHandlers.cleanup = function cleanupPinHandlers() {
    try {
      __sec_PIN_CONFIRM.removeEventListener('input', confirmInputHandler);
    } catch (e) { /* ignore */ }
    try {
      __sec_CHANGE_FORM.removeEventListener('submit', onChangePinSubmit);
    } catch (e) { /* ignore */ }
  };

  __sec_log.d('PIN modal controls wired successfully');
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

    // PIN submodule bindings (now safe—no 'e' arg)
    __sec_pin_bindStrictInputs();
    __sec_pin_wireHandlers();  // Wires listeners without error

    __sec_log.i('security module booted (with WebAuthn & PIN integration)');
  } catch (err) {
    __sec_log.e('boot error', err);
  }
  // ... other wiring ...
initializeSmartAccountPinButton();  // ← This line exists (or add if missing)
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
    const optUrl = `${apiBase}/webauthn/auth/options`;
    __sec_log.d('startAuthentication: Fetching options from', optUrl);
    const optRes = await fetch(optUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (!optRes.ok) {
  const txt = await optRes.text().catch(()=>'');
  __sec_log.w('verifyBiometrics: auth/options returned non-ok', { status: optRes.status, txtSample: (txt||'').slice(0,300) });
  if (optRes.status === 404 || /no authenticators found/i.test(txt || '')) {
    // clear local flags (mirror reconcile logic)
    localStorage.setItem(__sec_KEYS.biom, '0');
    localStorage.setItem('biometricsEnabled', 'false');
    localStorage.setItem(__sec_KEYS.bioLogin, '0');
    localStorage.setItem(__sec_KEYS.bioTx, '0');
    localStorage.setItem('biometricForLogin', 'false');
    localStorage.setItem('biometricForTx', 'false');
    // set UI off
    if (__sec_parentSwitch) __sec_setChecked(__sec_parentSwitch, false);
    if (__sec_bioOptions) { __sec_bioOptions.classList.remove('show'); __sec_bioOptions.hidden = true; }
  }
  throw new Error('Auth options fetch failed: ' + txt);
}

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

// expose for other modules that call startAuthentication()
window.startAuthentication = window.startAuthentication || startAuthentication;



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
      // Replace the original __sec_parentHandler definition with this one
const __sec_parentHandler = async () => {
  __sec_log.d('__sec_parentHandler: Starting');

  return withLoader(async () => {
    // mark busy spinner on the control
    try { __sec_setBusy(__sec_parentSwitch, true); } catch (e) { __sec_log.w('setBusy failed', e); }

    // Determine desired state (we DO NOT flip UI yet)
    // Use __sec_isChecked (exists in your code) to read current checked state
    let wantOn = true;
    try {
      const currentlyChecked = !!(__sec_parentSwitch && __sec_isChecked(__sec_parentSwitch));
      wantOn = !currentlyChecked; // if currently off -> we want ON, and vice versa
      __sec_log.d('__sec_parentHandler: wantOn computed', { currentlyChecked, wantOn });
    } catch (e) {
      __sec_log.w('__sec_parentHandler: could not read current checked state, assuming ON request', e);
      wantOn = true;
    }

    // Ensure valid session / user exists before continuing
    const currentUser = await __sec_getCurrentUser();
    __sec_log.d('__sec_parentHandler: Retrieved currentUser', { hasUser: !!currentUser?.user });

    if (!currentUser || !currentUser.user || !currentUser.user.uid) {
      __sec_log.e('__sec_parentHandler: No current user or invalid session');
      try { __sec_setChecked(__sec_parentSwitch, false); } catch (e) {}
      try { __sec_setBusy(__sec_parentSwitch, false); } catch (e) {}
      alert('You must be signed in to enable biometrics. Please try logging in again.');
      window.location.href = '/';
      return;
    }

    const { user } = currentUser;
    __sec_log.d('__sec_parentHandler: Extracted user', { userId: user.uid });

    // If user requested turning ON, require PIN BEFORE doing any UI changes or network work
    if (wantOn) {
      // Check localStorage first for quick live response; fall back to server session flag if present
      let hasPin = false;
      try {
        hasPin = localStorage.getItem('hasPin') === 'true';
      } catch (e) { __sec_log.w('localStorage.hasPin read failed', e); }

      // fallback to server-side session user flag if local false/undefined
      if (!hasPin && (user && (user.hasPin || user.pin))) {
        hasPin = true;
      }

      if (!hasPin) {
        __sec_log.i('__sec_parentHandler: PIN not present, blocking biometric enable');
        // Notify user, keep switch visually off and clear busy state
        try { showSlideNotification('Please set a PIN first before enabling biometrics', 'info'); } catch(e){}
        try { __sec_setChecked(__sec_parentSwitch, false); } catch (e) {}
        try { __sec_setBusy(__sec_parentSwitch, false); } catch (e) {}
        return; // abort early — no flinch, no network calls
      }

      // At this point: PIN present; proceed to revoke existing authenticators and register new one
      __sec_log.i('Parent toggle ON requested — will revoke existing authenticators (best-effort) then register new');

      try {
        // Try to revoke all existing authenticators (best-effort)
        const auths = await __sec_listAuthenticators(user.uid).catch(err => {
          __sec_log.w('__sec_parentHandler: listAuthenticators failed', err);
          return [];
        });

        __sec_log.d('__sec_parentHandler: Authenticators found before ON', auths);

        if (Array.isArray(auths) && auths.length > 0) {
          for (const a of auths) {
            const credential_id = a.credential_id || a.credentialID || a.credentialId;
            if (!credential_id) {
              __sec_log.w('__sec_parentHandler: skipping invalid credential id', a);
              continue;
            }
            try {
              await __sec_revokeAuthenticator(user.uid, credential_id);
              __sec_log.i('__sec_parentHandler: revoked', credential_id);
            } catch (revokeErr) {
              __sec_log.w('__sec_parentHandler: revoke failed for', credential_id, revokeErr);
            }
          }
        } else {
          // still call revoke endpoint (server may have stale entries) — pass null credential id to request full reset
          try {
            await __sec_revokeAuthenticator(user.uid, null);
            __sec_log.i('__sec_parentHandler: called revoke with null to ensure server reset');
          } catch (e) {
            __sec_log.w('__sec_parentHandler: revoke-with-null failed', e);
          }
        }
      } catch (err) {
        __sec_log.w('__sec_parentHandler: failed listing/revoking pre-existing authenticators (non-fatal)', err);
      }

      // Now proceed to registration flow (always attempt to register fresh)
      try {
        __sec_log.i('Starting fresh registration flow after revoke');
        const regResult = await startRegistration(user.uid, user.email || user.username || user.uid, user.fullName || user.email || user.uid);
        __sec_log.d('__sec_parentHandler: Registration result', regResult);

        // Only after successful registration set biometrics on and UI checked
        __sec_setBiometrics(true, true);

        try { __sec_setChecked(__sec_parentSwitch, true); } catch(e){}
        __sec_log.i('Registration successful (parent ON)');
      } catch (err) {
        __sec_log.e('Registration failed after revoke', { err, uid: user.uid });
        try { __sec_setChecked(__sec_parentSwitch, false); } catch(e){}
        __sec_setBiometrics(false, false);
        alert('Biometric registration failed: ' + (err.message || 'unknown error'));
      } finally {
        try { __sec_setBusy(__sec_parentSwitch, false); } catch(e){}
      }

    } else {
      // wantOn === false -> disabling
      __sec_log.i('Parent toggle OFF requested — revoking and disabling biometrics');

      try {
        // call revoke (await) — if it throws we'll still clean up locally
        try {
          await __sec_revokeAuthenticator(user.uid, null);
        } catch (e) {
          __sec_log.w('__sec_parentHandler: revoke during disable returned error', e);
        }

        // update state locally
        __sec_setBiometrics(false, false);
        try { __sec_setChecked(__sec_parentSwitch, false); } catch(e){}
        try { localStorage.removeItem('credentialId'); } catch(e){}
        try { invalidateAuthOptionsCache && invalidateAuthOptionsCache(); } catch(e){}

        __sec_log.i('Biometrics disabled (parent OFF)');
      } catch (err) {
        __sec_log.e('__sec_parentHandler: disabling failed', err);
        try { __sec_setChecked(__sec_parentSwitch, false); } catch(e){}
        __sec_setBiometrics(false, false);
      } finally {
        try { __sec_setBusy(__sec_parentSwitch, false); } catch(e){}
      }
    }

    __sec_log.d('__sec_parentHandler: Exit');
  }); // end withLoader
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


/* ====== Defensive capture listeners to prevent flinch/no-PIN registration ======
   Paste this after __sec_wireEvents() runs (or at end of the function).
   It prevents any click/key handlers from firing if there's no PIN.        */
(function installPinGuard() {
  try {
    if (typeof __sec_parentSwitch === 'undefined') {
      console.warn('installPinGuard: __sec_parentSwitch not present yet');
      return;
    }

    function hasPin() {
      try { return localStorage.getItem('hasPin') === 'true'; } catch (e) { return false; }
    }

    function blockAndNotify(e, msg) {
      try {
        e.preventDefault();
        e.stopImmediatePropagation(); // ensure we stop other handlers
      } catch (err) {}
      // keep switch visually OFF
      try { __sec_setChecked(__sec_parentSwitch, false); } catch (err) {}
      try { showSlideNotification(msg || 'Please set a PIN first before enabling biometrics', 'info'); } catch (err) { console.log(msg || 'Please set a PIN first before enabling biometrics'); }
      return false;
    }

    // Parent switch: capture-phase guard
    __sec_parentSwitch.addEventListener('click', function (e) {
      if (!hasPin()) {
        return blockAndNotify(e, 'Please set a PIN first before enabling biometrics.');
      }
      // else allow normal flow to continue
    }, { capture: true, passive: false });

    __sec_parentSwitch.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') {
        if (!hasPin()) {
          return blockAndNotify(e, 'Please set a PIN first before enabling biometrics.');
        }
      }
    }, { capture: true, passive: false });

    // Child switches: prevent them from calling the parent handler (they attempted to auto-enable)
    const childGuards = [__sec_bioLogin, __sec_bioTx].filter(Boolean);
    childGuards.forEach((childEl) => {
      childEl.addEventListener('click', function (e) {
        try {
          // if parent is not checked and no pin -> block and notify
          const parentChecked = __sec_parentSwitch && __sec_isChecked && __sec_isChecked(__sec_parentSwitch);
          if (!parentChecked && !hasPin()) {
            return blockAndNotify(e, 'Please set a PIN first to enable biometric options.');
          }
        } catch (err) {}
      }, { capture: true, passive: false });

      childEl.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Enter') {
          const parentChecked = __sec_parentSwitch && __sec_isChecked && __sec_isChecked(__sec_parentSwitch);
          if (!parentChecked && !hasPin()) {
            return blockAndNotify(e, 'Please set a PIN first to enable biometric options.');
          }
        }
      }, { capture: true, passive: false });
    });

    console.debug('installPinGuard: guard installed for parent and child switches');
  } catch (err) {
    console.error('installPinGuard failed', err);
  }
})();

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

/* Open Forget PIN flow (send OTP first, then open Reset PIN modal) */
async function openForgetPinFlow() {
  try {
    // 1️⃣ Preferred: delegate to resetPin.js if loaded
    if (window.__rp_handlers && typeof window.__rp_handlers.onTrigger === 'function') {
      await window.__rp_handlers.onTrigger();
      return;
    }

    // 2️⃣ Alternative handler name
    if (window.__rp_handlers && typeof window.__rp_handlers.onTriggerClicked === 'function') {
      await window.__rp_handlers.onTriggerClicked();
      return;
    }

    // 3️⃣ Manual fallback — replicate resend-OTP then open modal
    const email = (window.currentUser?.email) ||
                  localStorage.getItem('userEmail') ||
                  prompt('Enter your account email to receive OTP:');
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      alert('Valid email required to send OTP.');
      return;
    }

    const endpoint = `${window.API_BASE || 'https://api.flexgig.com.ng'}/auth/resend-otp`;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email }),
    });
    const body = await resp.json();
    if (!resp.ok) throw new Error(body.error?.message || body.message || 'Failed to send OTP');

    // Notify success
    if (window.notify) window.notify('success', `OTP sent to ${email}`, { title: 'OTP sent' });
    else alert(`OTP sent to ${email}`);

    // 4️⃣ Open the Reset PIN modal
    if (window.ModalManager && typeof window.ModalManager.openModal === 'function') {
      ModalManager.openModal('resetPinModal');
      return;
    }
    const modal = document.getElementById('resetPinModal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
    } else {
      alert('OTP sent, but could not open Reset PIN modal.');
    }
  } catch (err) {
    console.error('openForgetPinFlow error:', err);
    if (window.notify) window.notify('error', err.message, { title: 'Reset PIN error' });
    else alert(err.message || 'Error starting reset-PIN flow.');
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
  window.safeCall = window.safeCall || safeCall; // expose globally if needed

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

// --- PIN globals (added) ---
let __fg_pin_securityPinModal = null;
let __fg_pin_changePinForm = null;
let __fg_pin_resetPinBtn = null;
let __fg_pin_inputCurrentEl = null;
let __fg_pin_inputNewEl = null;
let __fg_pin_inputConfirmEl = null;
// -----------------------------

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

  // ---- PIN-specific refs (new) ----
  // Uses safeQuery so missing elements won't throw.
  __fg_pin_securityPinModal = safeQuery('securityPinModal');
  __fg_pin_changePinForm   = safeQuery('changePinForm');
  __fg_pin_resetPinBtn      = safeQuery('resetPinBtn');
  __fg_pin_inputCurrentEl   = safeQuery('currentPin');
  __fg_pin_inputNewEl       = safeQuery('newPin');
  __fg_pin_inputConfirmEl   = safeQuery('confirmPin');
  // ----------------------------------

  console.log(
    'Cached refs - pinView:', !!pinView,
    'deleteReauthKey:', !!deleteReauthKey,
    'pinModal:', !!__fg_pin_securityPinModal,
    'pinForm:', !!__fg_pin_changePinForm
  );
}
window.cacheDomRefs = window.cacheDomRefs || cacheDomRefs; // expose if needed


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

  // Helper: Safely disable/enable keypad during processing
    const keypadButtons = Array.from(document.querySelectorAll('.pin-keypad button'));
function toggleKeypadProcessing(disabled) {
  console.log('toggleKeypadProcessing:', disabled);
  keypadButtons.forEach(btn => { btn.disabled = disabled; btn.style.opacity = disabled ? '0.5' : '1'; });
  if (deleteReauthKey) { deleteReauthKey.disabled = disabled; deleteReauthKey.style.opacity = disabled ? '0.5' : '1'; }
  const inputs = getReauthInputs();
  inputs.forEach(i => { i.disabled = disabled; });
}
window.toggleKeypadProcessing = window.toggleKeypadProcessing || toggleKeypadProcessing; // expose if needed

// PIN completion handler (server verification)
// ----- Updated implementation with proper reauth flow -----
// ----------------------
// Replace your existing handlePinCompletion with this function
// ----------------------
async function handlePinCompletion() {
  console.log('handlePinCompletion started (new robust flow)');

  // Prevent duplicate processing
  if (processing) {
    console.log('Already processing — ignoring');
    return;
  }

  const pin = currentPin;
  if (!/^\d{4}$/.test(pin)) {
    console.log('Invalid PIN length:', pin && pin.length);
    showTopNotifier('PIN must be 4 digits', 'error');
    return;
  }

  // Fast client-side grace path (UX-only, short window)
  if (inGraceWindow()) {
    console.log('Using local reauth grace window — skipping server round-trip');
    try {
      // run the same success UI flow but mark origin as 'local-grace'
      if (typeof onSuccessfulReauth === 'function') {
        await onSuccessfulReauth({ code: 'SUCCESS', token: null, meta: { method: 'pin', grace: true } });
      }
      if (typeof guardedHideReauthModal === 'function') {
        await guardedHideReauthModal();
      }
      if (typeof resetReauthInputs === 'function') resetReauthInputs();
      try {
        window.dispatchEvent(new CustomEvent('fg:reauth-success', { detail: { method: 'pin', grace: true } }));
      } catch (e) { console.debug('fg:reauth-success dispatch failed', e); }
    } catch (e) {
      console.warn('Local grace post-success flow error', e);
      showTopNotifier('Error completing authentication. Please try again.', 'error');
    } finally {
      processing = false;
      toggleKeypadProcessing(false);
    }
    return;
  }

  // Visual lock + processing flag
  processing = true;
  toggleKeypadProcessing(true); // Disable UI immediately

  // AbortController for fetch and a separate timeout fallback (30s)
  const controller = new AbortController();
  const TIMEOUT_MS = 30000;
  const timeoutId = setTimeout(() => {
    try { controller.abort(); } catch (e) {}
  }, TIMEOUT_MS);

  // Timeout wrapper to keep older logic that shows friendly message on overall timeout
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Reauth timeout')), TIMEOUT_MS + 50)
  );

  // Main work wrapped by withLoader to preserve your existing loader UX
  const workPromise = withLoader(async () => {
    try {
      // Slightly reduced wait for session load for snappier common-case behavior
      const uidInfo = await getUid({ waitForSession: true, waitMs: 500 }) || {};
      const userId = uidInfo?.uid || localStorage.getItem('userId') || null;
      if (!userId) {
        console.warn('handlePinCompletion: userId not available yet (session loading).');
        showTopNotifier('Session still loading — please try PIN again in a moment', 'error');
        return; // finally will handle unlock
      }

      // Perform fetch with AbortController
      let res;
      try {
        res = await fetch('https://api.flexgig.com.ng/api/reauth-pin', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
          },
          body: JSON.stringify({ userId, pin }),
          signal: controller.signal
        });
      } catch (fetchErr) {
        if (fetchErr && fetchErr.name === 'AbortError') {
          // Timeout / aborted
          throw new Error('Reauth timeout');
        }
        throw fetchErr;
      }

      // Try to parse JSON body if server returned JSON
      let payload = null;
      try { payload = await res.json(); } catch (e) { payload = null; }

      if (res.ok) {
        // Successful path
        console.log('[DEBUG] PIN verification successful');

        // Mark short client-side grace so repeated opens are snappy
        try { setLastPinReauthTs(); } catch (e) { /* ignore */ }

        try {
          if (typeof onSuccessfulReauth === 'function') {
            await onSuccessfulReauth(payload);
          }
          if (typeof guardedHideReauthModal === 'function') {
            await guardedHideReauthModal();
          }
          if (typeof resetReauthInputs === 'function') resetReauthInputs();
          try {
            window.dispatchEvent(new CustomEvent('fg:reauth-success', { detail: { method: 'pin' } }));
          } catch (e) { console.debug('fg:reauth-success dispatch failed', e); }
          try { localStorage.removeItem('pin_lockout_until'); } catch (e) {}
        } catch (e) {
          console.warn('Post-PIN verification error', e);
          showTopNotifier('Error completing authentication. Please try again.', 'error');
        }
        return;
      }

      // --- Error handling (structured JSON preferred) ---
      const serverMsg = (payload && (payload.message || payload.error)) || (await res.text().catch(() => '')) || `HTTP ${res.status}`;
      const serverCode = payload && payload.code ? payload.code : null;
      const meta = payload && payload.meta ? payload.meta : {};

      console.warn('PIN verify server error', { status: res.status, code: serverCode, msg: serverMsg, meta });

      // Handle server codes similarly to existing logic
      switch (serverCode) {
        case 'INCORRECT_PIN_ATTEMPT': {
          const left = meta?.attemptsLeft ?? null;
          showTopNotifier(left ? `Incorrect PIN — ${left} attempt(s) left` : (payload?.message || 'Incorrect PIN'), 'error');
          const wrap = document.querySelector('.reauthpin-inputs');
          if (wrap) {
            wrap.classList.add('fg-shake');
            setTimeout(() => wrap.classList.remove('fg-shake'), 400);
          }
          break;
        }
        case 'TOO_MANY_ATTEMPTS':
        case 'TOO_MANY_ATTEMPTS_EMAIL': {
          let untilIso = meta?.lockoutUntil || null;
          if (!untilIso) {
            const ra = res.headers.get('Retry-After');
            if (ra) {
              const sec = parseInt(ra, 10);
              if (!isNaN(sec)) untilIso = new Date(Date.now() + sec * 1000).toISOString();
            }
          }
          if (untilIso) {
            persistLockout(untilIso);
            disableReauthInputs(true);
            showTopNotifier(payload?.message || 'Too many incorrect PINs — locked', 'error', { autoHide: false, countdownUntil: untilIso });
          } else {
            showTopNotifier(payload?.message || 'Too many incorrect PINs — locked', 'error', { autoHide: false });
          }
          break;
        }
        case 'PIN_ENTRY_LIMIT_EXCEEDED': {
          showTopNotifier(payload?.message || 'PIN entry limit reached — use Forget PIN', 'error', { autoHide: false });
          setTimeout(() => openForgetPinFlow(), 800);
          break;
        }
        default: {
          showTopNotifier(payload?.message || serverMsg || 'PIN verification failed', 'error');
        }
      }

      // Clear inputs visually so user can try again (but not when locked)
      if (!['TOO_MANY_ATTEMPTS', 'TOO_MANY_ATTEMPTS_EMAIL', 'PIN_ENTRY_LIMIT_EXCEEDED'].includes(serverCode)) {
        if (typeof resetReauthInputs === 'function') resetReauthInputs();
        currentPin = '';
      } else {
        if (meta?.lockoutUntil) {
          persistLockout(meta.lockoutUntil);
          disableReauthInputs(true);
        }
      }
    } catch (err) {
      // Network or parsing or explicit timeout
      console.error('handlePinCompletion network/error', err);
      const msg = (err && err.message === 'Reauth timeout') ? 'Request timed out — please try again' : 'Network error. Please try again.';
      showTopNotifier(msg, 'error');
      if (typeof resetReauthInputs === 'function') resetReauthInputs();
      currentPin = '';
    } finally {
      // Nothing here re: unlocking; top-level finally handles visual unlock
    }
  });

  // Race the work against the timeout Promise so we always run final cleanup
  try {
    await Promise.race([workPromise, timeoutPromise]);
    console.log('handlePinCompletion resolved successfully');
  } catch (err) {
    console.error('handlePinCompletion timed out or errored:', err);
    // If it was the explicit timeout error, show specific text (we already handle abort inside)
    if (err && err.message === 'Reauth timeout') {
      showTopNotifier('Request timed out — please try again', 'error');
    } else {
      // other unexpected errors already handled/logged inside workPromise
    }
  } finally {
    // cleanup
    clearTimeout(timeoutId);
    processing = false;
    toggleKeypadProcessing(false);
  }
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
    // after: const localDelete = pinView.querySelector('#deleteReauthKey');
deleteReauthKey = localDelete; // expose to module/global so other helpers can use it

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
    // Helper: refresh inputs UI from global currentPin (debounced to avoid spam)
function refreshInputsUI() {
  console.log('refreshInputsUI called, currentPin:', currentPin, 'inputs length:', inputs.length);
  
  // DEBOUNCE: Ignore if called <50ms ago (prevents rapid-type spam)
  if (pinView.__lastRefresh && (Date.now() - pinView.__lastRefresh) < 50) {
    console.log('refreshInputsUI debounced (too soon)');
    return;
  }
  pinView.__lastRefresh = Date.now();

  // ALWAYS USE FALLBACK: Ignore existing updatePinInputs() to avoid clearing bug
  // (If you fix your app's updatePinInputs later, uncomment the if-block below)
  /*
  if (typeof updatePinInputs === 'function') {
    try { 
      console.log('Calling existing updatePinInputs');
      updatePinInputs(); 
      return; 
    } catch (e) {
      console.error('Error in updatePinInputs:', e);
    }
  }
  */
  
  // Fallback: draw masked digits from currentPin
  inputs.forEach((inp, idx) => {
    console.log(`Updating input ${idx}: value='${inp.value}', setting to ${currentPin && idx < currentPin.length ? '•' : ''}`);
    if (currentPin && idx < currentPin.length) {
      inp.value = '•';
      inp.classList.add('filled');
    } else {
      inp.value = '';
      inp.classList.remove('filled');
    }
  });
  console.log('UI refreshed for inputs (fallback masking)');
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
    if (deleteReauthKey) {
      console.log('Setting up explicit delete click');
      deleteReauthKey.onclick = () => {
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
    // Keyboard support: attach once (fixed — only active while modal truly visible)
if (!pinView.__keydownHandler) {
  console.log('Attaching keyboard handler (visibility-guarded)');

  // Helper: is the reauth modal actually visible to the user?
  function isReauthModalVisible() {
    try {
      if (!reauthModal) return false;
      // if a manual flag exists, trust it (you set it when showing/hiding modal)
      if (typeof reauthModalOpen !== 'undefined') {
        if (reauthModalOpen) return true;
        // if explicitly false, fast-return
        if (!reauthModalOpen) return false;
      }
      // class-based hidden check
      if (reauthModal.classList && reauthModal.classList.contains('hidden')) return false;
      // style-based display check
      const cs = getComputedStyle(reauthModal);
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0')) return false;
      // layout check: offsetParent is null when element (or ancestor) display:none
      if (reauthModal.offsetParent === null) return false;
      return true;
    } catch (err) {
      // if anything goes wrong, be conservative and treat as not visible
      return false;
    }
  }

  pinView.__keydownHandler = (e) => {
    // Only handle keyboard when the modal is actually visible
    if (!isReauthModalVisible()) return;

    // If the active element is outside the modal, ignore to avoid hijacking global inputs
    try {
      const active = document.activeElement;
      if (active && reauthModal && !reauthModal.contains(active)) {
        // allow Enter if you specifically want it to submit when focus outside — currently we ignore
        return;
      }
    } catch (err) {
      // ignore and continue if safe checks fail
    }

    // Now handle digits/backspace/enter exactly as before
    if (/^[0-9]$/.test(e.key)) {
      if (typeof inputDigit === 'function') {
        try { inputDigit(e.key); } catch (err) { /* swallow */ }
        try { refreshInputsUI(); } catch (err) {}
      } else {
        if (currentPin.length < 4) {
          currentPin += e.key;
          try { refreshInputsUI(); } catch (err) {}
          if (currentPin.length === 4) {
            handlePinCompletion();
          }
        }
      }
    } else if (e.key === 'Backspace') {
      if (typeof handleDelete === 'function') {
        try { handleDelete(); } catch (err) {}
      } else {
        if (currentPin.length > 0) {
          currentPin = currentPin.slice(0, -1);
          try { refreshInputsUI(); } catch (err) {}
        }
      }
    } else if (e.key === 'Enter') {
      handlePinCompletion();
    }
  };

  // attach once
  document.addEventListener('keydown', pinView.__keydownHandler, true);
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

  



async function initReauthModal({ show = false, context = 'reauth' } = {}) {

console.debug('BOOT LOG: initReauthModal start (show=' + String(show) + ')'); // at top of initReauthModal

  console.debug('initReauthModal called', { show, context });
  cacheDomRefs();

  // Defensive: if localStorage indicates reauth pending, force show and avoid hiding on boot.
// Place this at the top of initReauthModal(...)
try {
  const LOCAL_KEY = 'fg_reauth_required_v1';
  const pending = localStorage.getItem(LOCAL_KEY);
  if (pending && (typeof show === 'undefined' || show === false)) {
    console.debug('initReauthModal: local reauth pending -> forcing show');
    show = true;
  }
} catch (e) {
  /* ignore localStorage errors */
}


  // helper: safe parse userData or build from session
  async function buildUser() {
    try {
      const cached = localStorage.getItem('userData');
      if (cached) {
        try { return JSON.parse(cached); } catch (e) { console.warn('userData parse failed', e); }
      }
      const session = await safeCall(__sec_getCurrentUser) || {};
      const sUser = session.user || {};
      const userObj = {
        username: sUser.username || sUser.email || '',
        fullName: sUser.fullName || '',
        profilePicture: sUser.profilePicture || '',
        id: sUser.uid || sUser.id || '',
        hasPin: !!(sUser.hasPin || sUser.pin || (localStorage.getItem('hasPin') || '').toLowerCase() === 'true'),
        cachedAt: Date.now()
      };
      try { localStorage.setItem('userData', JSON.stringify(userObj)); } catch(e){ console.warn('Could not cache userData', e); }
      return userObj;
    } catch (err) {
      console.error('buildUser failed', err);
      return { username: 'User', fullName: '', profilePicture: '', id: '', hasPin: false };
    }
  }

  const user = await buildUser();

  // --- BIOMETRIC HANDLING: prefetch-on-gesture + synchronous use of cached options ---
  // pointerdown/pointerenter should call prefetchAuthOptions to warm cache.
  // click handler MUST use cached options synchronously; fetching inside click risks losing gesture.
  function attachPrefetchOnGesture(el) {
    if (!el) return;
    if (el.__prefetchBound) return;
    const prefetch = () => {
      try { window.prefetchAuthOptions && window.prefetchAuthOptions(); } catch (e) { /* noop */ }
    };
    el.addEventListener('pointerdown', prefetch, { passive: true });
    el.addEventListener('mouseenter', prefetch, { passive: true });
    el.__prefetchBound = true;
  }

  // Convert stored id string to an ArrayBuffer/Uint8Array for allowCredentials
  function idToUint8(storedId) {
    if (!storedId) return null;
    try {
      if (typeof storedId === 'string') {
        return (window.fromBase64Url ? window.fromBase64Url(storedId) : (function(s){
          // fallback base64url -> Uint8Array
          s = s.replace(/-/g, '+').replace(/_/g, '/');
          while (s.length % 4) s += '=';
          const bin = atob(s);
          const arr = new Uint8Array(bin.length);
          for (let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
          return arr;
        })(storedId));
      } else if (ArrayBuffer.isView(storedId)) {
        return new Uint8Array(storedId.buffer || storedId);
      } else if (storedId instanceof ArrayBuffer) {
        return new Uint8Array(storedId);
      }
    } catch (e) { console.warn('idToUint8 conversion failed', e); }
    return null;
  }

  // Synchronously attempt biometric auth using cached options (must be user gesture)
  // Replace tryBiometricWithCachedOptions with this version
async function tryBiometricWithCachedOptions() {
  // Prefer a cached publicKey object
  const raw = window.__cachedAuthOptions || null;
  if (!raw) return { ok: false, reason: 'no-cache' };

  // helpers --------------------------------------------------------------
  const storedId = localStorage.getItem('credentialId') || localStorage.getItem('webauthn-cred-id') || localStorage.getItem('webauthn_cred') || '';

  function base64UrlToUint8(s) {
    if (!s) return null;
    try {
      // prefer app helpers if present
      if (typeof window.idToUint8 === 'function') return window.idToUint8(s);
      if (typeof window.fromBase64Url === 'function') {
        const v = window.fromBase64Url(s);
        return (v instanceof Uint8Array) ? v : new Uint8Array(v);
      }
      // fallback decode base64url -> atob -> Uint8Array
      const pad = (4 - (s.length % 4)) % 4;
      const base64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
      const bin = atob(base64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch (e) {
      console.warn('[tryBiometricWithCachedOptions] base64UrlToUint8 failed', e);
      return null;
    }
  }

  function numericObjectToUint8(obj) {
    try {
      // detect numeric-key shaped objects like {0:143,1:209,...}
      const keys = Object.keys(obj);
      if (!keys.length) return null;
      // find the maximum numeric index
      let max = -1;
      for (let k of keys) {
        const n = parseInt(k, 10);
        if (!Number.isNaN(n)) max = Math.max(max, n);
      }
      if (max < 0) return null;
      const out = new Uint8Array(max + 1);
      for (let i = 0; i <= max; i++) out[i] = typeof obj[i] === 'number' ? obj[i] & 0xff : 0;
      return out;
    } catch (e) {
      return null;
    }
  }

  function ensureUint8(value) {
    if (!value) return null;
    // already typed
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value) && value.buffer) return new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength || value.length);
    if (typeof value === 'string') return base64UrlToUint8(value);
    // node-ish object like { data: [...] }
    try {
      if (value && Array.isArray(value.data)) return new Uint8Array(value.data);
    } catch (e) {}
    // numeric-key object
    try {
      const conv = numericObjectToUint8(value);
      if (conv) return conv;
    } catch (e) {}
    return null;
  }

  // Build a fresh publicKey object explicitly (avoid Object.assign on raw)
  const publicKey = {};
  // copy primitive top-level props that matter
  if ('rpId' in raw) publicKey.rpId = raw.rpId;
  if ('timeout' in raw) publicKey.timeout = raw.timeout;
  if ('userVerification' in raw) publicKey.userVerification = raw.userVerification;
  if ('extensions' in raw) publicKey.extensions = raw.extensions;

  // convert challenge (string, numeric-object, ArrayBuffer, Uint8Array)
  try {
    const ch = ensureUint8(raw.challenge);
    if (ch) {
      publicKey.challenge = ch;
    } else if (raw.challenge && typeof raw.challenge === 'object') {
      // if it's unexpectedly shaped, try numeric-object conversion
      const n = numericObjectToUint8(raw.challenge);
      if (n) publicKey.challenge = n;
      else publicKey.challenge = raw.challenge; // will be caught by validation below
    } else {
      // last resort: attempt base64url from string
      publicKey.challenge = (typeof raw.challenge === 'string') ? base64UrlToUint8(raw.challenge) : raw.challenge;
    }
  } catch (e) {
    console.warn('[tryBiometricWithCachedOptions] challenge conversion failed', e);
    publicKey.challenge = null;
  }

  // normalize allowCredentials -> ensure id is Uint8Array where possible
  try {
    const rawAllow = Array.isArray(raw.allowCredentials) ? raw.allowCredentials : [];
    const allow = [];

    for (let i = 0; i < rawAllow.length; i++) {
      const c = rawAllow[i];
      if (!c) continue;
      const item = {};
      item.type = c.type || 'public-key';
      item.transports = c.transports || (c.transports === undefined ? ['internal'] : c.transports);
      const idBuf = ensureUint8(c.id) || (typeof c.id === 'string' ? base64UrlToUint8(c.id) : null);
      if (idBuf) item.id = idBuf;
      else item.id = c.id; // keep as-is if we can't convert (fallback)
      allow.push(item);
    }

    // ensure storedId present as a typed id if allow is empty or doesn't match
    if ((!allow || allow.length === 0) && storedId) {
      const idBuf = ensureUint8(storedId);
      if (idBuf) allow.push({ type: 'public-key', id: idBuf, transports: ['internal'] });
    } else if (storedId && allow.length) {
      // best-effort ensure storedId is in allow
      try {
        const idBuf = ensureUint8(storedId);
        if (idBuf) {
          let found = false;
          for (const a of allow) {
            const aId = ensureUint8(a.id);
            if (!aId) continue;
            if (aId.length === idBuf.length) {
              let eq = true;
              for (let j = 0; j < aId.length; j++) if (aId[j] !== idBuf[j]) { eq = false; break; }
              if (eq) { found = true; break; }
            }
          }
          if (!found) allow.unshift({ type: 'public-key', id: idBuf, transports: ['internal'] });
        }
      } catch (e) { /* ignore equality errors */ }
    }

    publicKey.allowCredentials = allow;
  } catch (e) {
    console.warn('[tryBiometricWithCachedOptions] allowCredentials normalization failed', e);
    publicKey.allowCredentials = raw.allowCredentials || [];
  }

  // sanity check: challenge must be ArrayBuffer/Uint8Array
  if (!publicKey.challenge || !(publicKey.challenge instanceof Uint8Array || publicKey.challenge instanceof ArrayBuffer || (ArrayBuffer.isView(publicKey.challenge) && publicKey.challenge.buffer))) {
    console.warn('[tryBiometricWithCachedOptions] invalid challenge type after conversion', publicKey.challenge);
    return { ok: false, reason: 'bad-challenge', debug: publicKey.challenge };
  }

  // Acquire the in-use lock so prefetch won't update server challenge while we are calling the authenticator.
  window.__cachedAuthOptionsLock = true;
  window.__cachedAuthOptionsLockSince = Date.now();

  try {
    // Call the authenticator with the prepared publicKey object
    const assertion = await navigator.credentials.get({ publicKey });
    return { ok: true, assertion };
  } catch (err) {
    console.warn('navigator.credentials.get failed with cached options', err);
    return { ok: false, reason: 'get-failed', error: err };
  } finally {
    // release lock after a short grace window to avoid immediate prefetch racing
    setTimeout(() => {
      try { window.__cachedAuthOptionsLock = false; window.__cachedAuthOptionsLockSince = 0; } catch (e) {}
    }, 80);
  }
}


  // Attach biometric click handler for the PIN modal's biometric button
// Attach biometric click handler for the PIN modal's biometric button
// ----- Corrected implementation: Fixed syntax/logic in guard condition and cached getSession -----
// Replace the existing bindPinBiometricBtn function with this corrected version
(function bindPinBiometricBtn() {
  const bioBtn = document.getElementById('pinBiometricBtn');
  if (!bioBtn) return;

  // Helper: Check if biometrics are properly enabled
  function isBiometricLoginEnabled() {
    const webAuthnSupported = ('PublicKeyCredential' in window);
    if (!webAuthnSupported) return false;

    const storedCred = localStorage.getItem('credentialId') || 
                       localStorage.getItem('webauthn-cred-id') || 
                       localStorage.getItem('webauthn_cred') || '';
    if (!storedCred) return false;

    const biomKey = (window.__sec_KEYS && window.__sec_KEYS.biom) || 'biometricsEnabled';
    const mainBiomFlag = localStorage.getItem(biomKey);
    const isBiomEnabled = mainBiomFlag === '1' || mainBiomFlag === 'true';
    if (!isBiomEnabled) return false;

    const bioLoginKey = (window.__sec_KEYS && window.__sec_KEYS.bioLogin) || 'biometricForLogin';
    const bioLoginFlag = localStorage.getItem(bioLoginKey) || 
                         localStorage.getItem('__sec_bioLogin') || 
                         localStorage.getItem('security_bio_login') || '';
    const isBioLoginEnabled = ['true', '1', 'yes'].includes(bioLoginFlag.toLowerCase());

    return isBioLoginEnabled;
  }

  // Set initial visibility
  const isEnabled = isBiometricLoginEnabled();
  try { 
    bioBtn.style.display = isEnabled ? 'inline-flex' : 'none'; 
    console.debug('[reauth] Biometric button visibility:', isEnabled, {
      hasCredential: !!(localStorage.getItem('credentialId') || localStorage.getItem('webauthn-cred-id')),
      biometricsEnabled: localStorage.getItem('biometricsEnabled'),
      biometricForLogin: localStorage.getItem('biometricForLogin')
    });
  } catch (e) {}

  if (bioBtn.__bound) {
    attachPrefetchOnGesture(bioBtn);
    return;
  }

  attachPrefetchOnGesture(bioBtn);

  // minimal util: buffer -> base64url
  function bufToB64Url(buf) {
    return (window.toBase64Url ? window.toBase64Url(buf) : (function(b){
      var bytes = new Uint8Array(b);
      var str = '';
      for (var i=0;i<bytes.length;i++) str += String.fromCharCode(bytes[i]);
      return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    })(buf));
  }

  bioBtn.addEventListener('click', async (ev) => {
    ev.preventDefault();
    console.debug('[reauth] pinBiometricBtn clicked');

    // Re-check enablement at click time
    if (!isBiometricLoginEnabled()) {
      console.warn('[reauth] biometric not fully enabled at click time', {
        hasCredential: !!(localStorage.getItem('credentialId') || localStorage.getItem('webauthn-cred-id')),
        biometricsEnabled: localStorage.getItem('biometricsEnabled'),
        biometricForLogin: localStorage.getItem('biometricForLogin')
      });
      if (typeof safeCall === 'function' && typeof notify === 'function') {
        safeCall(notify, 'Biometric login not available – use PIN', 'warn', reauthAlert, reauthAlertMsg);
      }
      return;
    }

    // 🔥 SHOW LOADER + UI FEEDBACK IMMEDIATELY (before bio prompt)
    showLoader(); // Instant!
    
    try {
      if (typeof safeCall === 'function' && typeof notify === 'function') {
        safeCall(notify, 'Touch your fingerprint sensor...', 'info', reauthAlert, reauthAlertMsg);
      }
    } catch (e) {}

    // Open PIN modal and simulate entry BEFORE biometric prompt
    try {
      if (typeof openPinModalForReauth === 'function') {
        safeCall(openPinModalForReauth);
      } else if (reauthModal && reauthModal.classList) {
        reauthModal.classList.remove('hidden');
      }
    } catch (e) {}

    try {
      if (typeof enableReauthInputs === 'function') {
        enableReauthInputs();
      } else {
        const inputs = Array.from(document.querySelectorAll('.reauthpin-inputs input'));
        inputs.forEach(i => { try { i.disabled = false; } catch(e){} });
      }
    } catch (e) {}

    // 🔥 SIMULATE PIN ENTRY IMMEDIATELY (shows instant feedback)
    try {
      if (typeof simulatePinEntry === 'function') {
        simulatePinEntry({ stagger:0, expectedCount:4, fillAll:true });
      }
    } catch(e) {}

    // Now try biometric authentication (user sees loader already)
    const cachedAttempt = await tryBiometricWithCachedOptions();
    
    if (!cachedAttempt.ok) {
      hideLoader(); // Hide on failure
      
      // 🔥 Clear simulated PIN on failure
      try {
        if (typeof clearReauthInputs === 'function') {
          clearReauthInputs();
        } else {
          // Fallback: manually clear inputs
          const inputs = Array.from(document.querySelectorAll('.reauthpin-inputs input'));
          inputs.forEach(i => { 
            try { 
              i.value = ''; 
              i.classList.remove('filled');
            } catch(e){} 
          });
        }
      } catch(e) {}
      
      try { window.prefetchAuthOptions && window.prefetchAuthOptions(); } catch(e){}
      if (typeof safeCall === 'function' && typeof notify === 'function') {
        safeCall(notify, 'Preparing biometric auth – please try again (or use PIN)', 'info', reauthAlert, reauthAlertMsg);
      }
      try {
        const firstInput = getReauthInputs()[0];
        if (firstInput && typeof firstInput.focus === 'function') firstInput.focus();
      } catch(e){}
      return;
    }

    // Update message after successful bio scan
    try {
      if (typeof safeCall === 'function' && typeof notify === 'function') {
        safeCall(notify, 'Verifying fingerprint – logging you in...', 'info', reauthAlert, reauthAlertMsg);
      }
    } catch (e) {}

    const assertion = cachedAttempt.assertion;
    const payload = {
      id: assertion.id,
      rawId: bufToB64Url(assertion.rawId),
      type: assertion.type,
      response: {
        authenticatorData: bufToB64Url(assertion.response.authenticatorData),
        clientDataJSON: bufToB64Url(assertion.response.clientDataJSON),
        signature: bufToB64Url(assertion.response.signature),
        userHandle: assertion.response.userHandle ? bufToB64Url(assertion.response.userHandle) : null
      }
    };

    // Cache session data
    let sessionData = null;
    try {
      sessionData = await safeCall(getSession);
    } catch (e) {
      console.warn('[reauth] getSession error during biometrics', e);
    }
    const userId = sessionData?.user?.uid || sessionData?.user?.id || null;

    // 🔥 NO withLoader() wrapper - loader already showing!
    let verifyRes;
    try {
      verifyRes = await fetch((window.__SEC_API_BASE || (typeof API_BASE !== 'undefined' ? API_BASE : '')) + '/webauthn/auth/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          userId: userId
        })
      });
    } catch (err) {
      console.error('[reauth] network error during verify', err);
      hideLoader(); // Clean up
      
      // 🔥 Clear simulated PIN
      try {
        if (typeof clearReauthInputs === 'function') {
          clearReauthInputs();
        } else {
          const inputs = Array.from(document.querySelectorAll('.reauthpin-inputs input'));
          inputs.forEach(i => { 
            try { 
              i.value = ''; 
              i.classList.remove('filled');
            } catch(e){} 
          });
        }
      } catch(e) {}
      
      if (typeof safeCall === 'function' && typeof notify === 'function') {
        safeCall(notify, 'Verification failed – network error. Please try again.', 'error', reauthAlert, reauthAlertMsg);
      }
      return;
    }

    if (!verifyRes) {
      console.error('[reauth] verifyRes falsy after fetch');
      hideLoader();
      
      // 🔥 Clear simulated PIN
      try {
        if (typeof clearReauthInputs === 'function') {
          clearReauthInputs();
        } else {
          const inputs = Array.from(document.querySelectorAll('.reauthpin-inputs input'));
          inputs.forEach(i => { 
            try { 
              i.value = ''; 
              i.classList.remove('filled');
            } catch(e){} 
          });
        }
      } catch(e) {}
      
      if (typeof safeCall === 'function' && typeof notify === 'function') {
        safeCall(notify, 'Verification failed – no response from server.', 'error', reauthAlert, reauthAlertMsg);
      }
      return;
    }

    if (!verifyRes.ok) {
      const errText = await verifyRes.text().catch(() => verifyRes.statusText || `HTTP ${verifyRes.status}`);
      console.warn('[reauth] server responded non-OK:', verifyRes.status, errText);
      hideLoader();

      // 🔥 Clear simulated PIN
      try {
        if (typeof clearReauthInputs === 'function') {
          clearReauthInputs();
        } else {
          const inputs = Array.from(document.querySelectorAll('.reauthpin-inputs input'));
          inputs.forEach(i => { 
            try { 
              i.value = ''; 
              i.classList.remove('filled');
            } catch(e){} 
          });
        }
      } catch(e) {}

      const mismatchDetected = /no stored challenge|challenge.*mismatch|unexpected.*challenge|invalid.*challenge/i.test(errText);
      if (mismatchDetected) {
        console.debug('[reauth] challenge mismatch reported by server');
        if (typeof safeCall === 'function' && typeof notify === 'function') {
          safeCall(notify, 'Biometric challenge expired – please try your fingerprint again or use PIN.', 'warning', reauthAlert, reauthAlertMsg);
        }
      } else {
        if (typeof safeCall === 'function' && typeof notify === 'function') {
          safeCall(notify, `Biometric verification failed: ${errText || 'Server error'}`, 'error', reauthAlert, reauthAlertMsg);
        }
      }
      try { 
        if (typeof invalidateAuthOptionsCache === 'function') invalidateAuthOptionsCache(); 
        if (window.prefetchAuthOptions) window.prefetchAuthOptions(); 
      } catch(e){}
      return;
    }

    // Parse success
    let verifyData;
    try {
      verifyData = await verifyRes.json().catch(() => ({}));
    } catch (err) {
      console.warn('[reauth] failed to parse verify JSON', err);
      hideLoader();
      
      // 🔥 Clear simulated PIN
      try {
        if (typeof clearReauthInputs === 'function') {
          clearReauthInputs();
        } else {
          const inputs = Array.from(document.querySelectorAll('.reauthpin-inputs input'));
          inputs.forEach(i => { 
            try { 
              i.value = ''; 
              i.classList.remove('filled');
            } catch(e){} 
          });
        }
      } catch(e) {}
      
      if (typeof safeCall === 'function' && typeof notify === 'function') {
        safeCall(notify, 'Verification failed – invalid server response.', 'error', reauthAlert, reauthAlertMsg);
      }
      return;
    }

    if (verifyData && verifyData.verified) {
      console.log('[DEBUG] Biometrics verification successful');
      console.debug('[reauth] verification successful');
      
      // Keep loader visible during cleanup
      try {
        if (typeof safeCall === 'function' && typeof __sec_getCurrentUser === 'function') {
          safeCall(__sec_getCurrentUser);
        }
      } catch (e) {
        console.warn('[reauth] __sec_getCurrentUser error', e);
      }
      
      try {
        if (typeof onSuccessfulReauth === 'function') {
          await onSuccessfulReauth();
        }
        if (typeof guardedHideReauthModal === 'function') {
          await guardedHideReauthModal();
        }
        console.log('[DEBUG] Reauth modal hidden after successful biometrics verification');
      } catch (err) {
        console.warn('[reauth] Post-biometrics verification error', err);
        if (typeof safeCall === 'function' && typeof notify === 'function') {
          safeCall(notify, 'Error completing authentication. Please try again.', 'error', reauthAlert, reauthAlertMsg);
        }
      } finally {
        hideLoader(); // Always hide at the end
      }
      return;
    } else {
      console.warn('[reauth] verify returned ok but not verified', verifyData);
      hideLoader();
      
      // 🔥 Clear simulated PIN
      try {
        if (typeof clearReauthInputs === 'function') {
          clearReauthInputs();
        } else {
          const inputs = Array.from(document.querySelectorAll('.reauthpin-inputs input'));
          inputs.forEach(i => { 
            try { 
              i.value = ''; 
              i.classList.remove('filled');
            } catch(e){} 
          });
        }
      } catch(e) {}
      
      if (typeof safeCall === 'function' && typeof notify === 'function') {
        safeCall(notify, 'Biometric verification failed', 'error', reauthAlert, reauthAlertMsg);
      }
      return;
    }
  });

  bioBtn.__bound = true;
  console.debug('[reauth] pinBiometricBtn bound');

  // Listen for storage changes to update button visibility
  window.addEventListener('storage', (e) => {
    if (['biometricsEnabled', 'biometricForLogin', 'credentialId'].includes(e.key)) {
      const isEnabled = isBiometricLoginEnabled();
      try { 
        bioBtn.style.display = isEnabled ? 'inline-flex' : 'none';
        console.debug('[reauth] Biometric button visibility updated:', isEnabled);
      } catch (e) {}
    }
  });
})();



  // --- VISUALS: set display name and avatar safely ---
  try {
    const displayName = user.username || (user.fullName || '').split(' ')[0] || 'User';
    if (reauthName) reauthName.textContent = displayName.charAt(0).toUpperCase() + displayName.slice(1);
    const profilePicture = user.profilePicture || localStorage.getItem('profilePicture') || '';
    if (reauthAvatar) {
      if (isValidImageSource(profilePicture)) {
        reauthAvatar.src = `${profilePicture}?v=${Date.now()}`;
        reauthAvatar.style.display = '';
      } else {
        reauthAvatar.style.display = 'none';
      }
    }
  } catch (e) { console.warn('avatar/name set failed', e); }

  // --- Decide whether reauth is needed; if not, close and call success handler ---
// ----- Updated implementation with proper reauth flow -----
const reauthStatus = await shouldReauth(context);
if (!reauthStatus.needsReauth) {
  console.log('[DEBUG] No reauth needed; proceeding with success flow');
  try {
    // 1. Call onSuccessfulReauth to clear flags, reset timers, and handle session state (no payload needed here)
    if (typeof onSuccessfulReauth === 'function') {
      await onSuccessfulReauth();
    }
    // 2. Call guardedHideReauthModal to safely hide the modal only if flags are cleared
    if (typeof guardedHideReauthModal === 'function') {
      await guardedHideReauthModal();
    }
    console.log('[DEBUG] Reauth modal hidden (no reauth needed)');
  } catch (err) {
    console.warn('[reauth] Post-reauth check success error', err);
    // Optionally show an error to the user, but continue (non-fatal)
    if (typeof showBanner === 'function') {
      showBanner('Authentication completed, but an internal error occurred. Please refresh if issues persist.');
    }
  }
  return true;
}



  // FORCE PIN VIEW (you requested no view switching)
  try {
    if (biometricView) biometricView.style.display = 'none';
    if (pinView) pinView.style.display = 'block';
    if (switchToBiometric) switchToBiometric.style.display = 'none';
    if (switchToPin) switchToPin.style.display = 'none';
  } catch (e) { console.warn('force pin view failed', e); }

  // Resume lockout if any
  try { typeof resumeLockoutIfAny === 'function' && resumeLockoutIfAny(); } catch (e){}

  // Bind PIN inputs & submit
  try {
    const inputs = getReauthInputs();
    if (typeof bindPinInputs === 'function') {
      safeCall(bindPinInputs, inputs, pinView, reauthModal, reauthAlert, reauthAlertMsg);
    }
    if (pinView && !pinView.__reauthSubmitBound) {
      pinView.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const inputs = getReauthInputs();
        const pin = inputs.map(i => i.value).join('');
        if (!/^\d{4}$/.test(pin)) {
          safeCall(notify, 'Invalid PIN', 'error', reauthAlert, reauthAlertMsg);
          return;
        }
        const uidInfo = await safeCall(__sec_getCurrentUser) || {};
        if (!uidInfo || !uidInfo.user || !uidInfo.user.uid) {
          safeCall(notify, 'Session error', 'error', reauthAlert, reauthAlertMsg);
          setTimeout(() => window.location.href = '/', 1500);
          return;
        }
        await safeCall(reAuthenticateWithPin, uidInfo.user.uid, pin, async (success) => {
  if (success) {
    resetReauthInputs();
    safeCall(__sec_getCurrentUser);
    try { await Promise.resolve(onSuccessfulReauth && onSuccessfulReauth()); } catch (err) {
      console.warn('[reauth] onSuccessfulReauth failed', err);
    }
    await guardedHideReauthModal();
  } else {
    resetReauthInputs();
    safeCall(notify, 'PIN authentication failed', 'error', reauthAlert, reauthAlertMsg);
  }
});


      });
      pinView.__reauthSubmitBound = true;
    }
  } catch (e) { console.error('PIN bind error', e); }

  // delete key binding (unchanged)
  try {
    if (deleteReauthKey && !deleteReauthKey.__bound) {
      deleteReauthKey.addEventListener('click', () => {
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
  } catch (e) { console.warn('delete key bind failed', e); }

  // Bind biometric verify button (manual fallback that triggers prefetch + opt to retry)
  try {
    if (verifyBiometricBtn && !verifyBiometricBtn.__bound) {
      attachPrefetchOnGesture(verifyBiometricBtn);
      verifyBiometricBtn.addEventListener('click', async () => {
        // Start by trying cached path (must be user gesture)
        const cachedAttempt = await tryBiometricWithCachedOptions();
        if (cachedAttempt.ok) {
          // reuse the same verification code as above (avoid duplication by reusing flow)
          bioVerifyAndFinalize(cachedAttempt.assertion).catch(err => {
            console.error('bioVerifyAndFinalize error', err);
            safeCall(notify, 'Biometric verification failed', 'error');
          });
          return;
        }
        // otherwise warm cache and ask user to try again
        window.prefetchAuthOptions && window.prefetchAuthOptions();
        safeCall(notify, 'Preparing biometric auth — try again (or use PIN)', 'info');
      });
      verifyBiometricBtn.__bound = true;
      console.debug('verifyBiometricBtn bound');
    }
  } catch (e) { console.warn('verifyBiometricBtn bind failed', e); }

// helper to post verification payload to server (used by verify button path)
// ----- Updated implementation with proper reauth flow -----
async function bioVerifyAndFinalize(assertion) {
  try {
    // util: buf -> base64url
    function bufToB64Url(buf) {
      return (window.toBase64Url ? window.toBase64Url(buf) : (function(b){
        var bytes = new Uint8Array(b);
        var str = '';
        for (var i=0;i<bytes.length;i++) str += String.fromCharCode(bytes[i]);
        return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      })(buf));
    }

    // build payload from assertion
    const buildPayloadFromAssertion = (a) => ({
      id: a.id,
      rawId: bufToB64Url(a.rawId),
      type: a.type,
      response: {
        authenticatorData: bufToB64Url(a.response.authenticatorData),
        clientDataJSON: bufToB64Url(a.response.clientDataJSON),
        signature: bufToB64Url(a.response.signature),
        userHandle: a.response.userHandle ? bufToB64Url(a.response.userHandle) : null
      }
    });

    // fetch fresh options helper (unchanged)
    async function fetchFreshOptions(uid, storedId) {
      try {
        const res = await fetch((window.__SEC_API_BASE || API_BASE) + '/webauthn/auth/options', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
          body: JSON.stringify({ userId: uid, credentialId: storedId, context: 'reauth' })
        });
        if (!res.ok) {
          console.warn('[webauthn] fresh options fetch failed', res.status);
          return null;
        }
        return await res.json();
      } catch (err) {
        console.warn('[webauthn] fresh options fetch error', err);
        return null;
      }
    }

    // convert options to publicKey for navigator.credentials.get (reused)
    function buildPublicKeyFromOpts(freshOpts) {
      const publicKey = {};
      if ('rpId' in freshOpts) publicKey.rpId = freshOpts.rpId;
      if ('userVerification' in freshOpts) publicKey.userVerification = freshOpts.userVerification;
      if ('timeout' in freshOpts) publicKey.timeout = freshOpts.timeout;
      if ('extensions' in freshOpts) publicKey.extensions = freshOpts.extensions;

      // challenge -> Uint8Array
      let rawCh = freshOpts.challenge || freshOpts.challengeBase64 || freshOpts.challengeBytes || freshOpts.challenge_raw || freshOpts.challengeValue || null;
      const chU8 = ensureUint8FromMaybeObject(rawCh) || (typeof rawCh === 'string' ? (function(s){
        try {
          if (!s) return null;
          let t = s.replace(/-/g,'+').replace(/_/g,'/');
          while (t.length % 4) t += '=';
          const bin = atob(t);
          const out = new Uint8Array(bin.length);
          for (let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
          return out;
        } catch(e) { return null; }
      })(rawCh) : null);
      if (!chU8) return null;
      publicKey.challenge = chU8;

      // allowCredentials normalization
      const rawAllow = Array.isArray(freshOpts.allowCredentials) ? freshOpts.allowCredentials : (freshOpts.allow || []);
      const allow = [];
      for (let c of rawAllow) {
        if (!c) continue;
        const item = { type: c.type || 'public-key', transports: c.transports || ['internal'] };
        const idU8 = ensureUint8FromMaybeObject(c.id) || (typeof c.id === 'string' ? (function(s){
          try {
            let t = s.replace(/-/g,'+').replace(/_/g,'/');
            while (t.length % 4) t += '=';
            const bin = atob(t);
            const out = new Uint8Array(bin.length);
            for (let j=0;j<bin.length;j++) out[j] = bin.charCodeAt(j);
            return out;
          } catch(e) { return null; }
        })(c.id) : null);
        if (idU8) item.id = idU8;
        else item.id = c.id;
        allow.push(item);
      }
      publicKey.allowCredentials = allow;
      return publicKey;
    }

    // Try conditional mediation (best-effort, may be silent)
    async function tryConditionalAuth(freshOpts) {
      try {
        if (!('credentials' in navigator) || typeof navigator.credentials.get !== 'function') {
          return { ok: false, reason: 'no-credentials-api' };
        }
        const publicKey = buildPublicKeyFromOpts(freshOpts);
        if (!publicKey) return { ok: false, reason: 'bad-publickey' };

        // Conditional mediation is experimental — attempt it and hope for silent result.
        const getOpts = { publicKey, mediation: 'conditional' };
        try {
          const res = await navigator.credentials.get(getOpts);
          if (!res) return { ok: false, reason: 'no-credential-returned' };
          return { ok: true, assertion: res, conditional: true };
        } catch (err) {
          // Some browsers throw for unsupported mediation values; swallow and return failure
          console.debug('[webauthn] conditional mediation failed or unsupported', err && err.message);
          return { ok: false, reason: 'conditional-failed', error: err };
        }
      } catch (e) {
        console.warn('[webauthn] tryConditionalAuth error', e);
        return { ok: false, reason: 'exception', error: e };
      }
    }

    // fallback immediate prompt (only when we truly need a fresh fingerprint)
    async function doImmediateGetFromFreshOpts(freshOpts) {
      try {
        const publicKey = buildPublicKeyFromOpts(freshOpts);
        if (!publicKey) return { ok: false, reason: 'bad-publickey' };

        // acquire lock to prevent prefetch interference
        window.__cachedAuthOptionsLock = true;
        window.__cachedAuthOptionsLockSince = Date.now();

        try {
          const newAssertion = await navigator.credentials.get({ publicKey });
          return { ok: true, assertion: newAssertion };
        } finally {
          setTimeout(() => {
            try { window.__cachedAuthOptionsLock = false; window.__cachedAuthOptionsLockSince = 0; } catch (e) {}
          }, 80);
        }
      } catch (err) {
        console.warn('[webauthn] immediate navigator.credentials.get failed', err);
        return { ok: false, error: err };
      }
    }

    // session + storedId
    const session = await safeCall(getSession);
    const uid = session?.user?.uid || session?.user?.id || null;
    if (!uid) {
      console.warn('[bio] no session uid found before verify');
      safeCall(notify, 'Unable to find your session. Please try again.', 'error');
      return false;
    }
    const storedId = localStorage.getItem('credentialId') || localStorage.getItem('webauthn-cred-id') || null;
    if (!storedId) {
      console.warn('[bio] no stored credentialId');
      safeCall(notify, 'No biometric credential found. Please use PIN.', 'error');
      return false;
    }

    // initial assertion payload
    let currentPayload = buildPayloadFromAssertion(assertion);

    // We'll try at most 1 automatic retry (initial verify + one conditional/intentional retry)
    let attempt = 0;
    const maxAttempts = 2;

    while (attempt < maxAttempts) {
      attempt++;

      // Server verify
      let verifyRes;
      try {
        verifyRes = await withLoader(async () => {
          showSlideNotification('Verifying fingerprint — logging you in...', 'info');
          return await fetch((window.__SEC_API_BASE || API_BASE) + '/webauthn/auth/verify', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...currentPayload, userId: uid })
          });
        });
      } catch (err) {
        console.error('[bio] network/withLoader error during verify', err);
        safeCall(notify, 'Verification failed — network error. Please try again.', 'error');
        return false;
      }

      if (!verifyRes) {
        console.error('[bio] verifyRes falsy after fetch');
        safeCall(notify, 'Verification failed — no response from server.', 'error');
        return false;
      }

      if (!verifyRes.ok) {
        const errText = await verifyRes.text().catch(() => verifyRes.statusText || `HTTP ${verifyRes.status}`);
        console.warn('[bio] server responded non-OK:', verifyRes.status, errText);

        const mismatchDetected = /no stored challenge|challenge.*mismatch|unexpected.*challenge|invalid.*challenge/i.test(errText);

        // If it's a challenge mismatch and we have attempts left, try conditional mediation first (silent on supported browsers),
        // otherwise fall back to showing a single retry prompt (so user sees only one biometric panel).
        if (mismatchDetected && attempt < maxAttempts) {
          console.debug('[bio] server reported challenge mismatch; attempting conditional (silent) retry if available');

          const freshOpts = await fetchFreshOptions(uid, storedId);
          if (!freshOpts) {
            console.warn('[webauthn] failed to fetch fresh options for retry');
            safeCall(notify, 'Unable to refresh biometric challenge. Please try again.', 'error');
            return false;
          }

          // Try conditional mediation (best-effort, may be silent)
          const cond = await tryConditionalAuth(freshOpts);
          if (cond.ok && cond.assertion) {
            console.debug('[webauthn] conditional mediation supplied assertion; retrying verify');
            currentPayload = buildPayloadFromAssertion(cond.assertion);
            // loop will retry server verify
            continue;
          }

          // If conditional unsuccessful, we avoid automatically calling navigator.credentials.get() to prevent immediate second prompt.
          // Instead: politely ask the user to re-try fingerprint once (single UI flow).
          safeCall(notify, 'Please touch your fingerprint sensor again to retry biometric authentication.', 'info');

          // Give caller/UI a chance to re-trigger the biometric flow (for example, keep modal open and allow user to tap "Try again").
          // If you want the code to programmatically prompt, uncomment the block below — NOTE: this will show the biometric prompt immediately.
          /*
          const immediateResult = await doImmediateGetFromFreshOpts(freshOpts);
          if (immediateResult.ok && immediateResult.assertion) {
            currentPayload = buildPayloadFromAssertion(immediateResult.assertion);
            continue; // retry verify
          } else {
            safeCall(notify, 'Biometric authentication failed — please try again or use PIN.', 'error');
            return false;
          }
          */

          // Stop automatic retrying — let the UI/modal remain and user perform the fingerprint again.
          return false;
        }

        // If not a mismatch, or maxAttempts reached
        safeCall(notify, `Biometric verification failed: ${errText || 'Server error'}`, 'error');
        return false;
      }

      // parse success
      let verifyData;
      try {
        verifyData = await verifyRes.json();
      } catch (err) {
        console.warn('[bio] failed to parse verify JSON', err);
        safeCall(notify, 'Verification failed — invalid server response.', 'error');
        return false;
      }

      if (verifyData?.verified) {
        // Successful server-side verification of the assertion
        console.log('[DEBUG] Biometrics verification successful in bioVerifyAndFinalize');
        try {
          // First, attempt to clear the authoritative reauth lock (server + broadcast to other tabs)
          if (window.fgReauth && typeof window.fgReauth.completeReauth === 'function') {
            try {
              // await completion so server state is cleared before we resume UI
              await window.fgReauth.completeReauth();
            } catch (err) {
              // non-fatal: log for debugging but continue to restore UI locally
              console.warn('[bio] fgReauth.completeReauth failed, proceeding to restore UI', err);
            }
          }

          // Refresh current user & run your success flows
          try { safeCall(__sec_getCurrentUser); } catch (e) { /* ignore */ }

          // 1. Call onSuccessfulReauth to clear flags, reset timers, and handle session state
          if (typeof onSuccessfulReauth === 'function') {
            await onSuccessfulReauth();
          }

          // 2. Call guardedHideReauthModal to safely hide the modal only if flags are cleared
          if (typeof guardedHideReauthModal === 'function') {
            await guardedHideReauthModal();
          }
          console.log('[DEBUG] Reauth modal hidden after successful biometrics verification in bioVerifyAndFinalize');

          // Hide loader (force reset to be safe in edge cases)
          try {
            if (typeof hideLoader === 'function') hideLoader(true);
          } catch (e) { /* ignore */ }

          return true;
        } catch (err) {
          // Last-resort fallback: ensure UI gets restored even on unexpected errors
          try { setReauthActive(false); } catch (e) {}
          try { if (typeof hideLoader === 'function') hideLoader(true); } catch (e) {}
          console.error('[bio] unexpected error in verify success path', err);
          // Optionally show an error to the user
          if (typeof safeCall === 'function' && typeof notify === 'function') {
            safeCall(notify, 'Error completing authentication. Please try again.', 'error');
          }
          return false;
        }
      } else {
        console.warn('[bio] verify returned ok but not verified', verifyData);
        safeCall(notify, 'Biometric verification failed.', 'error');
        return false;
      }
    }

    // max attempts reached (shouldn't usually be reachable here)
    console.warn('[bio] max retry attempts reached');
    try { invalidateAuthOptionsCache && invalidateAuthOptionsCache(); window.prefetchAuthOptions && window.prefetchAuthOptions(); } catch(e) {}
    safeCall(notify, 'Biometric authentication failed — please try again or use PIN.', 'error');
    return false;

  } catch (err) {
    console.error('[bio] bioVerifyAndFinalize error', err);
    safeCall(notify, 'Biometric verification error.', 'error');
    return false;
  }
}




  // disable view switches
  try { if (switchToPin) switchToPin.style.display = 'none'; if (switchToBiometric) switchToBiometric.style.display = 'none'; } catch(e){}

// ✅ IMPROVED: Logout and forget links with better error handling
try {
  // Logout links (bio and pin sections)
  [logoutLinkBio, logoutLinkPin].forEach((link) => {
    if (!link || link.__bound) return;

    link.addEventListener('click', async (ev) => {
      ev.preventDefault();
      
      // Prevent double-clicks
      if (link.classList.contains('logging-out')) return;
      link.classList.add('logging-out');
      
      const originalText = link.textContent;
      link.textContent = 'Logging out...';
      
      showLoader();

      try {
        await fullClientLogout();
        // Note: redirect happens in fullClientLogout, so code below won't run
      } catch (err) {
        console.error('[logout link] Full logout failed:', err);
        // Force fallback redirect
        window.location.replace('/');
      } finally {
        // Cleanup (won't execute due to redirect, but kept for safety)
        try {
          hideLoader();
          link.classList.remove('logging-out');
          link.textContent = originalText;
        } catch (_) {}
      }
    });
    
    link.__bound = true;
  });

  // ✅ IMPROVED: Forget PIN links with better email resolution and validation
  [forgetPinLinkBio, forgetPinLinkPin].forEach((link) => {
    if (!link || link.__bound) return;

    link.addEventListener('click', async (ev) => {
      ev.preventDefault();
      
      // Prevent double-clicks
      if (link.classList.contains('processing')) return;
      link.classList.add('processing');
      
      const originalText = link.textContent;
      link.textContent = 'Processing...';

      try {
        // Clear any pending reauth state
        try {
          localStorage.removeItem('reauthPending');
        } catch (_) {}

        // ✅ Improved email resolution with better fallbacks
        const resolveEmail = async () => {
          // Priority 1: currentEmail global
          try {
            if (typeof currentEmail === 'string' && currentEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentEmail)) {
              return currentEmail;
            }
          } catch (_) {}

          // Priority 2: window.currentUser
          try {
            if (window.currentUser?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(window.currentUser.email)) {
              return window.currentUser.email;
            }
          } catch (_) {}

          // Priority 3: Server-embedded data
          try {
            if (window.__SERVER_USER_DATA__?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(window.__SERVER_USER_DATA__.email)) {
              return window.__SERVER_USER_DATA__.email;
            }
          } catch (_) {}

          // Priority 4: LocalStorage
          try {
            const sources = [
              localStorage.getItem('userEmail'),
              localStorage.getItem('email'),
              localStorage.getItem('currentEmail')
            ];
            
            // Try loginState object
            try {
              const loginState = JSON.parse(localStorage.getItem('loginState') || '{}');
              if (loginState.email) sources.push(loginState.email);
            } catch (_) {}

            for (const email of sources) {
              if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return email;
              }
            }
          } catch (_) {}

          // Priority 5: Check session endpoint as last resort
          try {
            const base = (window.API_BASE || window.__SEC_API_BASE || 'https://api.flexgig.com.ng').replace(/\/$/, '');
            const sessionResp = await fetch(`${base}/api/session`, {
              method: 'GET',
              credentials: 'include',
              headers: { 'Accept': 'application/json' }
            });

            if (sessionResp.ok) {
              const sessionData = await sessionResp.json();
              if (sessionData.user?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sessionData.user.email)) {
                return sessionData.user.email;
              }
            }
          } catch (_) {}

          return '';
        };

        let emailToUse = await resolveEmail();

        // If email still not found, prompt user
        if (!emailToUse || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToUse)) {
          const promptMsg = 'Enter your account email to receive OTP for PIN reset:';
          const userInput = prompt(promptMsg);
          
          if (!userInput) {
            // User cancelled
            return;
          }

          const trimmedInput = userInput.trim().toLowerCase();
          
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedInput)) {
            if (typeof notify === 'function') {
              notify('warn', 'Please enter a valid email address', { title: 'Invalid Email' });
            } else {
              alert('Please enter a valid email address');
            }
            return;
          }
          
          emailToUse = trimmedInput;
        }

        console.log('[forgetPin] Sending OTP to:', emailToUse);

        // Check if handler exists first
        if (window.__rp_handlers?.onTrigger) {
          try {
            await window.__rp_handlers.onTrigger(ev);
            console.log('[forgetPin] Handler onTrigger executed successfully');
            return;
          } catch (e) {
            console.debug('[forgetPin] Handler onTrigger failed, falling back:', e);
          }
        }

        if (window.__rp_handlers?.onTriggerClicked) {
          try {
            await window.__rp_handlers.onTriggerClicked(ev);
            console.log('[forgetPin] Handler onTriggerClicked executed successfully');
            return;
          } catch (e) {
            console.debug('[forgetPin] Handler onTriggerClicked failed, falling back:', e);
          }
        }

        // Send OTP
        const base = (window.API_BASE || window.__SEC_API_BASE || 'https://api.flexgig.com.ng').replace(/\/$/, '');
        
        const resp = await fetch(`${base}/auth/resend-otp`, {
          method: 'POST',
          credentials: 'include',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ email: emailToUse })
        });

        // Parse response safely
        let body;
        try {
          const contentType = resp.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            body = await resp.json();
          } else {
            body = await resp.text();
          }
        } catch (parseErr) {
          console.error('[forgetPin] Response parse error:', parseErr);
          body = null;
        }

        if (!resp.ok) {
          const errorMsg = (body?.error?.message || body?.message || body || `Failed to send OTP (${resp.status})`);
          console.error('[forgetPin] OTP send failed:', errorMsg);
          
          if (typeof notify === 'function') {
            notify('error', errorMsg, { title: 'Failed to Send OTP' });
          } else {
            alert(`Failed to send OTP: ${errorMsg}`);
          }
          return;
        }

        console.log('[forgetPin] OTP sent successfully');

        // ✅ Open reset modal with multiple fallback methods
        let modalOpened = false;

        // Method 1: ModalManager
        try {
          if (window.ModalManager?.openModal) {
            window.ModalManager.openModal('resetPinModal');
            modalOpened = true;
            console.log('[forgetPin] Modal opened via ModalManager');
          }
        } catch (e) {
          console.debug('[forgetPin] ModalManager.openModal failed:', e);
        }

        // Method 2: Direct DOM manipulation
        if (!modalOpened) {
          try {
            const modal = document.getElementById('resetPinModal');
            if (modal) {
              modal.classList.remove('hidden');
              modal.style.display = 'flex';
              modal.setAttribute('aria-hidden', 'false');
              
              // Ensure modal is visible (z-index)
              modal.style.zIndex = '9999';
              
              modalOpened = true;
              console.log('[forgetPin] Modal opened via DOM manipulation');
            }
          } catch (e) {
            console.debug('[forgetPin] DOM modal open failed:', e);
          }
        }

        // Method 3: Bootstrap modal (if using Bootstrap)
        if (!modalOpened) {
          try {
            const modal = document.getElementById('resetPinModal');
            if (modal && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
              const bsModal = new bootstrap.Modal(modal);
              bsModal.show();
              modalOpened = true;
              console.log('[forgetPin] Modal opened via Bootstrap');
            }
          } catch (e) {
            console.debug('[forgetPin] Bootstrap modal open failed:', e);
          }
        }

        // Wire up modal handlers if opened
        if (modalOpened) {
          try {
            if (window.__rp_handlers?.wire) {
              window.__rp_handlers.wire();
              console.log('[forgetPin] Modal handlers wired');
            }
          } catch (e) {
            console.debug('[forgetPin] Modal wire failed:', e);
          }
        } else {
          console.warn('[forgetPin] Failed to open modal - no method succeeded');
        }

        // Show success notification
        if (typeof notify === 'function') {
          notify('success', `OTP sent to ${emailToUse}. Please check your email.`, { 
            title: 'OTP Sent',
            duration: 5000 
          });
        } else {
          alert(`OTP sent to ${emailToUse}. Please check your email.`);
        }

      } catch (e) {
        console.error('[forgetPin] Unexpected error:', e);
        
        if (typeof notify === 'function') {
          notify('error', e.message || 'Failed to start PIN reset flow', { 
            title: 'Error' 
          });
        } else {
          alert(e.message || 'Failed to start PIN reset flow');
        }
      } finally {
        // Restore link state
        try {
          link.classList.remove('processing');
          link.textContent = originalText;
        } catch (_) {}
      }
    });
    
    link.__bound = true;
  });

} catch (e) {
  console.error('[logout/forget setup] Fatal error:', e);
}

// ✅ OPTIONAL: Add global logout handler for programmatic calls
window.performLogout = async function() {
  try {
    await logoutFlow();
  } catch (e) {
    console.error('[performLogout] Error:', e);
    // Force redirect as absolute fallback
    window.location.replace('/');
  }
};

// ✅ OPTIONAL: Auto-cleanup on page visibility change (security)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Clear sensitive in-memory data when tab is hidden
    try {
      window.__rp_reset_token = null;
      // Don't clear user data here as it's needed when tab becomes visible
    } catch (_) {}
  }
});


  // keypad init
// keypad init (guarded)
if (!pinView || pinView.__keypadBound) {
  console.log('Skipping keypad init (already bound or no pinView)');
} else {
  try { initReauthKeypad(); } catch (e) { console.warn('initReauthKeypad failed', e); }
}

// modal show/hide and focus (inside initReauthModal)
try {
  if (!show) {
  // If canonical key says reauth pending, do not hide on boot.
  if (isCanonicalReauthPending()) {
    console.debug('initReauthModal: skip hide because canonical reauth pending');
    return true;
  }

  // safe DOM lookup for reauthModal
  const _rm = (typeof document !== 'undefined') ? document.getElementById('reauthModal') : null;
  try { if (_rm) _rm.classList.add('hidden'); } catch (e) {}

  reauthModalOpen = false;

  // safe DOM lookup for promptModal (avoid referencing promptModal binding)
  const _pm = (typeof document !== 'undefined') ? document.getElementById('promptModal') : null;
  try { if (_pm) _pm.classList.add('hidden'); } catch (e) {}

  return true;
}




    try { localStorage.setItem('reauthPending', Date.now().toString()); } catch(e){}

    if (reauthModal) {
      reauthModal.classList.remove('hidden');
      reauthModalOpen = true;
      try { if (idleTimeout) { clearTimeout(idleTimeout); idleTimeout = null; } } catch(e){}
      reauthModal.setAttribute('aria-modal', 'true');
      reauthModal.setAttribute('role', 'dialog');
      const firstInput = getReauthInputs()[0];
      if (firstInput && firstInput.focus) try { firstInput.focus(); } catch(e){}
      try { trapFocus && trapFocus(reauthModal); } catch(e){}
    }
  } catch (e) { console.warn('modal visibility handling failed', e); }

  console.debug('initReauthModal completed');
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

      restoreBiometricUI();

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
  console.log('disableBiometrics (optimistic update) called');

  try {
    localStorage.removeItem('credentialId');
    localStorage.removeItem('webauthn-cred-id');
    localStorage.setItem('biometricForLogin', 'false');

    try {
      var bioBtn = document.getElementById('bioBtn') || document.querySelector('.biometric-button');
      if (bioBtn) bioBtn.style.display = 'none';
    } catch (e) { /* ignore UI errors */ }

    safeCall(notify, 'Biometric disabled locally — revoking on server...', 'info');
  } catch (e) {
    console.warn('Local clear failed', e);
  }

  (async function(){
    try {
      var session = await safeCall(getSession);
      var uid = session && (session.user && (session.user.id || session.user.uid));
      if (!uid) {
        safeCall(notify, 'Could not revoke on server: missing session', 'error');
        return;
      }

      var apiBase = window.__SEC_API_BASE || API_BASE || '';

      var res = await fetch(apiBase + '/webauthn/authenticators/' + encodeURIComponent(uid) + '/revoke', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId: null })
      });

      if (!res.ok) {
        var txt = await res.text();
        console.error('[disableBiometrics] revoke failed', txt);
        safeCall(notify, 'Server revoke failed: ' + (txt || res.statusText), 'error');
        return;
      }

      var data = await res.json();
      safeCall(notify, 'Biometric revoked on server', 'success');
      restoreBiometricUI();
      console.log('[disableBiometrics] revoke response', data);
    } catch (err) {
      console.error('[disableBiometrics] background revoke error', err);
      safeCall(notify, 'Server revoke failed (network)', 'error');
    }
  })();

  return { success: true };
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
  // persist the legacy boolean key (true/false)
  try { localStorage.setItem(key, val ? 'true' : 'false'); } catch (e) { console.warn('writeFlag: legacy write failed', e); }

  // if secure namespaced keys exist, mirror the values there as well
  // __sec_KEYS may not be defined at early load; guard it
  try {
    if (window.__sec_KEYS && typeof window.__sec_KEYS === 'object') {
      if (key === 'biometricsEnabled' && __sec_KEYS.biom) {
        localStorage.setItem(__sec_KEYS.biom, val ? '1' : '0');
      } else if (key === 'biometricForLogin' && __sec_KEYS.bioLogin) {
        localStorage.setItem(__sec_KEYS.bioLogin, val ? '1' : '0');
      } else if (key === 'biometricForTx' && __sec_KEYS.bioTx) {
        localStorage.setItem(__sec_KEYS.bioTx, val ? '1' : '0');
      }
    }
  } catch (e) {
    console.warn('writeFlag: secure-ns write failed', e);
  }

  // Immediately update UI in this tab (storage event doesn't fire in same tab)
  try { if (typeof syncFromStorage === 'function') setTimeout(syncFromStorage, 0); } catch (e) {}
}


  function setSwitch(btn, on) {
  if (!btn) return;
  // avoid noisy reflows if already in desired state
  const current = btn.getAttribute('aria-checked') === 'true';
  if (current === Boolean(on)) return;

  btn.setAttribute('aria-checked', on ? 'true' : 'false');
  btn.classList.toggle('active', !!on);
  btn.classList.toggle('inactive', !on);

  // if this is the parent switch, adjust the options container
  try {
    const id = btn.id || '';
    if (id === 'biometricsSwitch') {
      const opts = document.getElementById('biometricsOptions');
      if (opts) opts.hidden = !on;
    }
  } catch (e) {}

  // small hook for other modules to react immediately
  try {
    btn.dispatchEvent(new CustomEvent('fg:switch-changed', { detail: { id: btn.id, checked: !!on }, bubbles: true }));
  } catch (e) {}
}


  function syncFromStorage() {
  // defensive: ensure __sec_KEYS exists shape
  const secKeys = (window.__sec_KEYS && typeof window.__sec_KEYS === 'object') ? window.__sec_KEYS : { biom:'', bioLogin:'', bioTx:'' };

  const secureBiom = secKeys.biom ? localStorage.getItem(secKeys.biom) === '1' : false;
  const legacyBiom = readFlag('biometricsEnabled');
  const enabled = secureBiom || legacyBiom;

  try {
    if (secKeys.biom) localStorage.setItem(secKeys.biom, enabled ? '1' : '0');
    localStorage.setItem('biometricsEnabled', enabled ? 'true' : 'false');
  } catch (e) { console.warn('syncFromStorage: write failed', e); }

  setSwitch(parent, enabled);
  setOptionsVisible(enabled);

  if (enabled) {
    const secureLogin = secKeys.bioLogin ? localStorage.getItem(secKeys.bioLogin) === '1' : false;
    const secureTx = secKeys.bioTx ? localStorage.getItem(secKeys.bioTx) === '1' : false;

    const login = secureLogin || readFlag('biometricForLogin');
    const tx = secureTx || readFlag('biometricForTx');

    // persist merged children flags into both namespaces
    try {
      if (secKeys.bioLogin) localStorage.setItem(secKeys.bioLogin, login ? '1' : '0');
      if (secKeys.bioTx) localStorage.setItem(secKeys.bioTx, tx ? '1' : '0');
      localStorage.setItem('biometricForLogin', login ? 'true' : 'false');
      localStorage.setItem('biometricForTx', tx ? 'true' : 'false');
    } catch(e) { console.warn('syncFromStorage child persist failed', e); }

    setSwitch(childLogin, login);
    setSwitch(childTx, tx);
  } else {
    // parent disabled -> force children off in UI + storage
    setSwitch(childLogin, false);
    setSwitch(childTx, false);
    try {
      if (secKeys.bioLogin) localStorage.setItem(secKeys.bioLogin, '0');
      if (secKeys.bioTx) localStorage.setItem(secKeys.bioTx, '0');
      localStorage.setItem('biometricForLogin', 'false');
      localStorage.setItem('biometricForTx', 'false');
    } catch(e) {}
  }
}



  // Replace your existing handleParentToggle with this version.
// PIN-check is done *before* entering withLoader (no flinch / no server call without PIN).
async function handleParentToggle(wantOn) {
  if (parent.__bioProcessing) return;
  parent.__bioProcessing = true;

  // Prevent rapid clicks immediately
  parent.disabled = true;

  try {
    // ENFORCE PIN presence before doing anything when enabling
    if (wantOn) {
      const hasPin = localStorage.getItem('hasPin') === 'true';
      if (!hasPin) {
        // Inform user and keep UI unchanged (no "flinch")
        notify && notify('Please set a PIN first before enabling biometrics.', 'info');
        try { setSwitch(parent, false); } catch (e) {}
        return;
      }
    }

    // Proceed to the loader-wrapped network work only after PIN check
    await withLoader(async () => {
      if (wantOn) {
        // Register flow (awaited)
        let res;
        try {
          res = await registerBiometrics();
        } catch (err) {
          console.error('registerBiometrics threw', err);
          writeFlag && writeFlag('biometricsEnabled', false);
          try { setSwitch(parent, false); } catch (e) {}
          setOptionsVisible && setOptionsVisible(false);
          safeCall(notify, 'Biometric setup failed (network/server error)', 'error');
          return;
        }

        if (res && res.success) {
          // Persist flags
          writeFlag && writeFlag('biometricsEnabled', true);
          writeFlag && writeFlag('biometricForLogin', true);
          writeFlag && writeFlag('biometricForTx', true);

          // Persist credentialId before prefetch
          if (res.credentialId) {
            try { localStorage.setItem('credentialId', String(res.credentialId)); } catch (e) { console.warn('storing credentialId failed', e); }
          }

          // Update UI now that registration succeeded
          try { setSwitch(parent, true); } catch (e) {}
          try { setSwitch(childLogin, true); } catch (e) {}
          try { setSwitch(childTx, true); } catch (e) {}
          setOptionsVisible && setOptionsVisible(true);

          // Prefetch once
          try { window.prefetchAuthOptions && window.prefetchAuthOptions(); } catch (e) { console.warn('prefetchAuthOptions failed', e); }

          safeCall(notify, 'Biometrics enabled', 'success');
        } else {
          // registration failed/cancelled — revert flags/UI
          writeFlag && writeFlag('biometricsEnabled', false);
          writeFlag && writeFlag('biometricForLogin', false);
          writeFlag && writeFlag('biometricForTx', false);

          try { setSwitch(parent, false); } catch (e) {}
          try { setSwitch(childLogin, false); } catch (e) {}
          try { setSwitch(childTx, false); } catch (e) {}
          setOptionsVisible && setOptionsVisible(false);

          const msg = res?.cancelled ? 'Biometric setup cancelled' : (res?.error || 'Biometric setup failed');
          safeCall(notify, msg, 'info');
        }
      } else {
        // DISABLE path: await server revoke and clean up locally
        try {
          await disableBiometrics();
        } catch (err) {
          console.error('disableBiometrics error', err);
          safeCall(notify, `Failed to disable biometrics: ${err?.message || err}`, 'error');
          // continue to cleanup locally anyway
        }

        writeFlag && writeFlag('biometricsEnabled', false);
        writeFlag && writeFlag('biometricForLogin', false);
        writeFlag && writeFlag('biometricForTx', false);

        try { localStorage.removeItem('credentialId'); } catch (e) { console.warn('remove credentialId failed', e); }
        try { invalidateAuthOptionsCache && invalidateAuthOptionsCache(); } catch (e) {}

        try { setSwitch(parent, false); } catch (e) {}
        try { setSwitch(childLogin, false); } catch (e) {}
        try { setSwitch(childTx, false); } catch (e) {}
        setOptionsVisible && setOptionsVisible(false);

        safeCall(notify, 'Biometrics disabled', 'info');
      }
    }); // end withLoader
  } catch (err) {
    console.error('Parent toggle error (outer):', err);
    writeFlag && writeFlag('biometricsEnabled', false);
    try { setSwitch(parent, false); } catch (e) {}
    setOptionsVisible && setOptionsVisible(false);
    safeCall(notify, `Toggle failed: ${err?.message || err}`, 'error');
  } finally {
    parent.__bioProcessing = false;
    parent.disabled = false;
    try { syncFromStorage && syncFromStorage(); } catch (e) { console.warn('syncFromStorage failed', e); }
  }
}

function maybeDisableParentIfChildrenOff() {
  try {
    const p = document.getElementById('biometricsSwitch');
    const c1 = document.getElementById('bioLoginSwitch');
    const c2 = document.getElementById('bioTxSwitch');

    if (!p || !c1 || !c2) return false;

    const loginOn = c1.getAttribute('aria-checked') === 'true';
    const txOn    = c2.getAttribute('aria-checked') === 'true';

    // If both children are OFF and parent is ON -> auto-disable parent (and clear credential)
    const parentOn = p.getAttribute('aria-checked') === 'true';
    if (!loginOn && !txOn && parentOn) {
      // Use canonical parent flow if available so server state & cleanup run
      if (typeof handleParentToggle === 'function') {
        // call the disable path (server + local cleanup)
        // Use next tick to avoid re-entrancy inside click handlers
        setTimeout(() => { try { handleParentToggle(false); } catch (e) { console.warn('handleParentToggle(false) failed', e); } }, 0);
      } else {
        // fallback: local-only cleanup
        writeFlag('biometricsEnabled', false);
        try { localStorage.removeItem('credentialId'); } catch (e) {}
        setSwitch(p, false);
        const opts = document.getElementById('biometricsOptions');
        if (opts) opts.hidden = true;
        safeCall(notify, 'Biometrics disabled because all options were turned off', 'info');
      }
      return true;
    }
    return false;
  } catch (e) {
    console.warn('maybeDisableParentIfChildrenOff error', e);
    return false;
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
      // try enabling parent via the canonical flow:
      if (typeof handleParentToggle === 'function') {
        handleParentToggle(true);
      }
      return;
    }

    // Update UI immediately
    setSwitch(btn, wantOn);

    // Persist to both namespaces via writeFlag helper (now mirrors secure keys)
    writeFlag(key, wantOn);

    // Extra: if toggled OFF, check the "two children off => disable parent" rule
    // run asynchronously to let immediate UI settle
    setTimeout(() => {
      try { maybeDisableParentIfChildrenOff(); } catch (err) { console.warn('maybeDisableParentIfChildrenOff failed', err); }
    }, 0);

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
  if (['biometricsEnabled', 'biometricForLogin', 'biometricForTx', 'credentialId', 'hasPin'].includes(e.key)) {
    setTimeout(syncFromStorage, 50); // Existing sync
    // Restart inactivity if flags changed
    setupInactivity();
    // Prefetch if bio/cred changed
    if (['biometricsEnabled', 'credentialId'].includes(e.key) && localStorage.getItem('biometricsEnabled') === 'true') {
      prefetchAuthOptions();
    }
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

const PROMPT_TIMEOUT = 5000;
const PROMPT_AUTO_CLOSE = true;
let reauthModalOpen = false; // Track if reauth is open to pause idle
try { localStorage.setItem('lastActive', String(lastActive)); } catch (e) {}

let lastResetCall = 0;
// ⚡ Loosen debounce for mobile — 500ms safer
const RESET_DEBOUNCE_MS = /Mobi|Android/i.test(navigator.userAgent) ? 500 : 150;
let __inactivitySetupDone = false;


// Full replacement for shouldReauth (unchanged from yours)
// Local-first check for fast rendering
function shouldReauthLocal(context = 'reauth') {
  const storedHasPin = String(localStorage.getItem('hasPin') || '').toLowerCase() === 'true';
  const storedBiometricsEnabled = String(localStorage.getItem('biometricsEnabled') || '').toLowerCase() === 'true';
  const storedBioLogin = String(localStorage.getItem('biometricForLogin') || '').toLowerCase() === 'true';
  const storedBioTx = String(localStorage.getItem('biometricForTx') || '').toLowerCase() === 'true';
  const storedCredentialId = localStorage.getItem('credentialId') || '';

  const webAuthnSupported = typeof window !== 'undefined' && ('PublicKeyCredential' in window);
  const hasBiometricFlag = storedBiometricsEnabled && webAuthnSupported && storedCredentialId.length > 0;

  const isBioApplicable = hasBiometricFlag && (
    (context === 'login' && storedBioLogin) ||
    (context === 'transaction' && storedBioTx) ||
    (context === 'reauth' && (storedBioLogin || storedBioTx))
  );

  const hasPin = storedHasPin;
  const needsReauth = Boolean(hasPin || isBioApplicable);
  const method = isBioApplicable ? 'biometric' : (hasPin ? 'pin' : null);

  return { needsReauth, method };
}

// Original async shouldReauth kept for server sync/fallback
async function shouldReauth(context = 'reauth') {
  const localCheck = shouldReauthLocal(context);
  if (localCheck.needsReauth) return localCheck; // return immediately if localStorage triggers reauth

  try {
    const session = await safeCall(getSession);
    const sessionHasPin = !!(session && session.user && (session.user.hasPin || session.user.pin));
    const hasPin = sessionHasPin || localCheck.method === 'pin';
    const needsReauth = Boolean(hasPin || localCheck.method === 'biometric');
    const method = localCheck.method === 'biometric' ? 'biometric' : (hasPin ? 'pin' : null);
    return { needsReauth, method };
  } catch (err) {
    return localCheck; // fallback to local-only decision if server fails
  }
}

window.shouldReauth = window.shouldReauth || shouldReauth; // expose globally if needed


// === Inactivity helpers (full drop-in update) ===



// local-first keys & helpers
const FG_EXPECTED_KEY = 'fg_expected_reauth_at';
const FG_REAUTH_FLAG = 'fg_reauth_required_v1'; // cross-tab canonical key

function setExpectedReauthAt(ts) {
  try { localStorage.setItem(FG_EXPECTED_KEY, String(ts)); } catch (e) {}
}
function clearExpectedReauthAt() {
  try { localStorage.removeItem(FG_EXPECTED_KEY); } catch (e) {}
}
function getExpectedReauthAt() {
  try { return Number(localStorage.getItem(FG_EXPECTED_KEY) || 0); } catch (e) { return 0; }
}
function hasCanonicalLocalFlag() {
  try { return !!localStorage.getItem(FG_REAUTH_FLAG); } catch (e) { return false; }
}

// state


try { localStorage.setItem('lastActive', String(lastActive)); } catch (e) {}

let __reauthPromptShowing = false;
const INTERACTION_EVENTS = ['mousemove','keydown','click','scroll','touchstart','touchend','touchmove','pointerdown'];

// ============================================
// CONSOLIDATED IDLE DETECTION SYSTEM
// Single source of truth - no duplicates
// ============================================

(function() {
  'use strict';
  
  // ============================================
  // CONSTANTS
  // ============================================
  const SOFT_IDLE_MS = 2 * 60 * 1000;  // 2 minutes (user inactive while visible)
  const HARD_IDLE_MS = 30 * 60 * 1000; // 30 minutes (tab hidden)
  const RESET_DEBOUNCE_MS = /Mobi|Android/i.test(navigator.userAgent) ? 500 : 150;
  
  // Storage keys
  const KEYS = {
    LAST_ACTIVE: 'lastActive',
    PAGE_HIDDEN_AT: 'pageHiddenAt',
    EXPECTED_REAUTH_AT: 'fg_expected_reauth_at',
    REAUTH_REQUIRED: 'fg_reauth_required_v1'
  };
  
  // ============================================
  // STATE (encapsulated in closure)
  // ============================================
  let softIdleTimeout = null;
  let hardIdleTimeout = null;
  let promptTimeout = null; // Track prompt auto-dismiss timeout
  let lastActivityTimestamp = Date.now();
  let pageHiddenTimestamp = null;
  let lastResetCall = 0;
  let setupComplete = false;
  let promptShowing = false;
  
  // Activity events that reset soft idle
  const ACTIVITY_EVENTS = [
    'mousedown', 'mousemove', 'keydown', 'scroll', 
    'touchstart', 'touchend', 'touchmove', 'click'
  ];
  
  // ============================================
  // STORAGE HELPERS
  // ============================================
  function setItem(key, value) {
    try { 
      localStorage.setItem(key, String(value)); 
    } catch (e) { 
      console.warn(`[IDLE] Failed to set ${key}`, e); 
    }
  }
  
  function getItem(key, defaultValue = 0) {
    try { 
      return Number(localStorage.getItem(key)) || defaultValue; 
    } catch (e) { 
      return defaultValue; 
    }
  }
  
  function removeItem(key) {
    try { 
      localStorage.removeItem(key); 
    } catch (e) {}
  }
  
  function setExpectedReauthAt(timestamp) {
    setItem(KEYS.EXPECTED_REAUTH_AT, timestamp);
  }
  
  function getExpectedReauthAt() {
    return getItem(KEYS.EXPECTED_REAUTH_AT, 0);
  }
  
  function clearExpectedReauthAt() {
    removeItem(KEYS.EXPECTED_REAUTH_AT);
  }
  
  function hasCanonicalReauthFlag() {
    try {
      return !!JSON.parse(localStorage.getItem(KEYS.REAUTH_REQUIRED) || 'null');
    } catch (e) {
      return false;
    }
  }
  
  // ============================================
  // REAUTH MODAL STATE CHECKER
  // ============================================
  function isReauthModalOpen() {
    // Check multiple possible flags
    if (window.__reauthModalOpen === true) return true;
    if (window.reauthModalOpen === true) return true;
    
    // Check DOM for visible reauth modal
    const reauthModal = document.getElementById('reauthModal') || 
                        document.querySelector('.reauth-modal') ||
                        document.querySelector('[data-reauth-modal]');
    
    if (reauthModal && !reauthModal.classList.contains('hidden')) {
      return true;
    }
    
    return false;
  }
  
  // ============================================
  // SOFT IDLE TIMER (user inactive while visible)
  // ============================================
  function startSoftIdleTimer() {
    // Clear existing timer
    if (softIdleTimeout) {
      clearTimeout(softIdleTimeout);
      softIdleTimeout = null;
    }
    
    // Don't start if page is hidden
    if (document.visibilityState !== 'visible') {
      console.log('[IDLE] Soft timer NOT started (page hidden)');
      return;
    }
    
    // Don't start if reauth modal is already open
    if (isReauthModalOpen()) {
      console.log('[IDLE] Soft timer NOT started (reauth modal open)');
      return;
    }
    
    console.log('[IDLE] Soft timer started (1 min countdown)');
    
    softIdleTimeout = setTimeout(async () => {
      console.log('⏰ [SOFT IDLE] 1 minute of inactivity');
      
      // Double-check reauth modal isn't open before showing prompt
      if (isReauthModalOpen()) {
        console.log('[SOFT IDLE] Reauth modal already open, skipping prompt');
        return;
      }
      
      // Show inactivity prompt (NOT full reauth modal)
      try {
        await showInactivityPrompt();
      } catch (e) {
        console.error('[SOFT IDLE] Failed to show prompt', e);
      }
    }, SOFT_IDLE_MS);
  }
  
  function stopSoftIdleTimer() {
    if (softIdleTimeout) {
      clearTimeout(softIdleTimeout);
      softIdleTimeout = null;
      console.log('[IDLE] Soft timer STOPPED');
    }
  }
  
  // ============================================
  // HARD IDLE TIMER (tab hidden for 2 minutes)
  // ============================================
  function scheduleHardIdleCheck() {
    if (hardIdleTimeout) {
      clearTimeout(hardIdleTimeout);
      hardIdleTimeout = null;
    }
    
    const hiddenAt = getItem(KEYS.PAGE_HIDDEN_AT, Date.now());
    const elapsed = Date.now() - hiddenAt;
    const remaining = Math.max(0, HARD_IDLE_MS - elapsed);
    
    console.log(`[IDLE] Hard idle scheduled for ${Math.round(remaining / 1000 / 60)} minutes`);
    
    hardIdleTimeout = setTimeout(async () => {
      console.log('🔥 [HARD IDLE] 2 minutes threshold reached');
      
      // Only trigger if page is STILL hidden
      if (document.visibilityState === 'hidden') {
        console.log('[HARD IDLE] Page still hidden - will show reauth when visible');
        return;
      }
      
      // Page is visible - show reauth modal
      try {
        await triggerHardIdleReauth();
      } catch (e) {
        console.error('[HARD IDLE] Failed to trigger reauth', e);
      }
    }, remaining);
  }

  // ============================================
// HELPER: CREATE SERVER LOCK IN BACKGROUND
// ============================================
function createServerLockInBackground(reason) {
  // Fire-and-forget (don't block UI)
  const apiBase = window.__SEC_API_BASE || window.API_BASE || '';
  
  fetch(`${apiBase}/reauth/require`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  })
    .then(res => {
      if (res.ok) {
        return res.json();
      }
      throw new Error(`Server returned ${res.status}`);
    })
    .then(data => {
      console.log(`[LOCK] ✅ Server lock created (reason: ${reason}):`, data);
    })
    .catch(err => {
      console.error(`[LOCK] ❌ Failed to create server lock (reason: ${reason}):`, err);
    });
}
  
  // ============================================
// HARD IDLE TIMER (tab hidden for 30 minutes)
// ============================================
async function triggerHardIdleReauth() {
  console.log('🔒 [HARD IDLE] Triggering reauth modal');
  
  // Stop all timers
  stopSoftIdleTimer();
  if (promptTimeout) {
    clearTimeout(promptTimeout);
    promptTimeout = null;
  }
  
  // Check local first (fast)
  const localCheck = shouldReauthLocal('reauth');
  if (localCheck.needsReauth) {
    // ✅ SHOW MODAL FIRST (instant UX)
    await showReauthModalSafe({ context: 'reauth', reason: 'hard-idle' });
    
    // ✅ CREATE SERVER LOCK IN BACKGROUND (non-blocking)
    createServerLockInBackground('hard_idle_timeout');
    return;
  }
  
  // Fallback: server check
  try {
    const serverCheck = await checkServerReauthStatus();
    if (serverCheck && (serverCheck.needsReauth || serverCheck.reauthRequired)) {
      // ✅ SHOW MODAL FIRST
      await showReauthModalSafe({ context: 'reauth', reason: 'hard-idle' });
      
      // ✅ CREATE LOCK IN BACKGROUND
      createServerLockInBackground('hard_idle_timeout');
    }
  } catch (e) {
    console.warn('[HARD IDLE] Server check failed', e);
  }
}
  // ============================================
  // USER ACTIVITY HANDLER (resets soft idle)
  // ============================================
  function onUserActivity() {
    // Only count activity if page is visible
    if (document.visibilityState !== 'visible') {
      return;
    }
    
    // Don't reset timer if reauth modal is open
    if (isReauthModalOpen()) {
      return;
    }
    
    // Debounce for performance
    const now = Date.now();
    if (now - lastResetCall < RESET_DEBOUNCE_MS) {
      return;
    }
    lastResetCall = now;
    
    // Update last activity timestamp
    lastActivityTimestamp = now;
    setItem(KEYS.LAST_ACTIVE, now);
    
    // Reset soft idle timer
    startSoftIdleTimer();
  }
  
  // ============================================
  // VISIBILITY CHANGE HANDLER
  // ============================================
  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      console.log('[IDLE] Page HIDDEN - starting hard idle tracking');
      
      // Stop soft idle (no point counting while hidden)
      stopSoftIdleTimer();
      
      // Stop prompt timeout if active
      if (promptTimeout) {
        clearTimeout(promptTimeout);
        promptTimeout = null;
      }
      
      // Record when page was hidden
      pageHiddenTimestamp = Date.now();
      setItem(KEYS.PAGE_HIDDEN_AT, pageHiddenTimestamp);
      
      // Set expected reauth time (for instant check on return)
      setExpectedReauthAt(pageHiddenTimestamp + HARD_IDLE_MS);
      
      // Schedule hard idle check
      scheduleHardIdleCheck();
      
    } else if (document.visibilityState === 'visible') {
      console.log('[IDLE] Page VISIBLE - checking thresholds');
      
      // Check if we need to trigger hard idle reauth
      checkHardIdleOnVisible();
      
      // Resume soft idle timer (if no reauth needed and modal not open)
      if (!hasCanonicalReauthFlag() && !isReauthModalOpen()) {
        startSoftIdleTimer();
      }
    }
  }
  
  // ============================================
// VISIBILITY CHANGE: CHECK ON RETURN
// ============================================
async function checkHardIdleOnVisible() {
  // Check canonical flag first (authoritative)
  if (hasCanonicalReauthFlag()) {
    console.log('[IDLE] Canonical reauth flag present - showing modal');
    await showReauthModalSafe({ context: 'reauth', reason: 'hard-idle' });
    
    // Create lock in background
    createServerLockInBackground('hard_idle_on_return');
    return;
  }
  
  // Check expected reauth timestamp (local prediction)
  const expected = getExpectedReauthAt();
  if (expected && Date.now() >= expected) {
    console.log('[IDLE] Expected reauth time exceeded - showing modal');
    
    // ✅ SHOW MODAL FIRST (instant UX)
    await showReauthModalSafe({ context: 'reauth', reason: 'hard-idle' });
    
    // ✅ CREATE LOCK IN BACKGROUND
    createServerLockInBackground('hard_idle_on_return');
    return;
  }
  
  // Fallback: calculate idle time manually
  const hiddenAt = getItem(KEYS.PAGE_HIDDEN_AT, 0);
  if (hiddenAt) {
    const awayTime = Date.now() - hiddenAt;
    console.log(`[IDLE] User was away for ${Math.round(awayTime / 1000 / 60)} minutes`);
    
    if (awayTime >= HARD_IDLE_MS) {
      console.log('🔥 [HARD IDLE] Threshold exceeded on return');
      
      // Clear timestamps
      removeItem(KEYS.PAGE_HIDDEN_AT);
      clearExpectedReauthAt();
      pageHiddenTimestamp = null;
      
      // ✅ SHOW MODAL FIRST (instant UX)
      await showReauthModalSafe({ context: 'reauth', reason: 'hard-idle' });
      
      // ✅ CREATE LOCK IN BACKGROUND
      createServerLockInBackground('hard_idle_exceeded');
      return;
    }
    
    // Threshold not exceeded - clear timestamps
    console.log('✅ [IDLE] Threshold not exceeded - resuming normally');
    removeItem(KEYS.PAGE_HIDDEN_AT);
    clearExpectedReauthAt();
    pageHiddenTimestamp = null;
  }
}
  
  // ============================================
// INACTIVITY PROMPT (soft idle notification)
// ============================================
async function showInactivityPrompt() {
  if (promptShowing) {
    console.log('[PROMPT] Already showing, skipping');
    return;
  }
  
  // Critical check: Never show if reauth modal is open
  if (isReauthModalOpen()) {
    console.log('[PROMPT] Reauth modal is open, skipping prompt');
    return;
  }
  
  promptShowing = true;
  
  try {
    // Double-check that reauth is actually needed
    const localCheck = shouldReauthLocal('reauth');
    if (!localCheck.needsReauth) {
      console.log('[PROMPT] Reauth not needed, skipping');
      promptShowing = false;
      return;
    }
    
    // Check server authority
    try {
      const serverCheck = await checkServerReauthStatus();
      if (serverCheck && (serverCheck.needsReauth || serverCheck.reauthRequired)) {
        // Server says full reauth required - skip prompt, go straight to modal
        console.log('[PROMPT] Server requires immediate reauth - skipping prompt');
        await showReauthModalSafe({ context: 'reauth', reason: 'server-required' });
        return;
      }
    } catch (e) {
      console.warn('[PROMPT] Server check failed', e);
    }
    
    // Show the soft prompt UI
    console.log('[PROMPT] Showing inactivity prompt (5s countdown to reauth)');
    
    const promptModal = document.getElementById('inactivityPrompt');
    
    if (!promptModal) {
      console.warn('[PROMPT] Prompt modal not found - showing reauth modal instead');
      await showReauthModalSafe({ context: 'inactivity' });
      return;
    }
    
    console.log('[PROMPT] Found prompt modal:', promptModal.id || promptModal.className);
    
    // Show prompt
    promptModal.classList.remove('hidden');
    promptModal.setAttribute('aria-modal', 'true');
    promptModal.setAttribute('role', 'dialog');
    
    // Focus "Yes" button if it exists
    const yesBtn = promptModal.querySelector('#yesActiveBtn, .yes-btn, [data-yes]');
    if (yesBtn) {
      try { yesBtn.focus(); } catch(e) {}
    }
    
    // Auto-dismiss after 5 seconds and show reauth modal
    promptTimeout = setTimeout(async () => {
      console.log('[PROMPT] 5 seconds elapsed - showing reauth modal');
      
      // Hide prompt
      promptModal.classList.add('hidden');
      promptModal.removeAttribute('aria-modal');
      promptModal.removeAttribute('role');
      
      // Reset flag
      promptShowing = false;
      
      // Stop soft idle timer (reauth modal will be shown)
      stopSoftIdleTimer();
      
      // ✅ SHOW MODAL FIRST (instant UX)
      try {
        await showReauthModalSafe({ context: 'reauth', reason: 'soft-idle-timeout' });
      } catch (e) {
        console.error('[PROMPT] Failed to show reauth modal after timeout', e);
      }
      
      // ✅ CREATE SERVER LOCK IN BACKGROUND (non-blocking)
      createServerLockInBackground('soft_idle_timeout');
      
    }, 5000); // 5 seconds
    
    // Setup close handlers (only once)
    if (!promptModal.__handlersAttached) {
      if (yesBtn) {
        yesBtn.addEventListener('click', () => {
          console.log('[PROMPT] User clicked "Yes, I\'m here" - dismissing prompt');
          
          // Clear timeout
          if (promptTimeout) {
            clearTimeout(promptTimeout);
            promptTimeout = null;
          }
          
          // Hide prompt
          promptModal.classList.add('hidden');
          promptModal.removeAttribute('aria-modal');
          promptModal.removeAttribute('role');
          
          // Reset flag
          promptShowing = false;
          
          // Resume soft idle timer
          startSoftIdleTimer();
        });
      }
      
      promptModal.__handlersAttached = true;
    }
    
    console.log('[PROMPT] Prompt visible - will show reauth modal in 5 seconds if no response');
    
  } catch (err) {
    console.error('[PROMPT] Error showing prompt', err);
  } finally {
    // Only reset flag if timeout wasn't set (error case)
    if (!promptTimeout) {
      promptShowing = false;
    }
  }
}
  
  // ============================================
  // REAUTH MODAL HELPERS (safe wrappers)
  // ============================================
    async function showReauthModalSafe(options = {}) {
    try {
      // Stop all idle timers when showing reauth modal
      console.log('[IDLE] Stopping all timers - reauth modal will be shown');
      stopSoftIdleTimer();
      if (hardIdleTimeout) {
        clearTimeout(hardIdleTimeout);
        hardIdleTimeout = null;
      }
      if (promptTimeout) {
        clearTimeout(promptTimeout);
        promptTimeout = null;
      }

      // --- NEW: set persistent reauth lock BEFORE showing modal (if available) ---
      try {
        if (window.__persistentReauthLock && typeof window.__persistentReauthLock.setLock === 'function') {
          console.log('[IDLE] Setting persistent reauth lock, reason:', options.reason || 'reauth-required');
          window.__persistentReauthLock.setLock(options.reason || 'reauth-required');
        }
      } catch (e) {
        console.warn('[IDLE] Failed to set persistent reauth lock (continuing):', e);
      }
      // -----------------------------------------------------------------------
      
      // Try multiple APIs in order of preference
      if (window.__reauth && typeof window.__reauth.showReauthModal === 'function') {
        await window.__reauth.showReauthModal(options.context || 'reauth');
      } else if (typeof showReauthModal === 'function') {
        await showReauthModal(options.context || 'reauth');
      } else if (typeof initReauthModal === 'function') {
        await initReauthModal({ show: true, context: options.context || 'reauth' });
      } else {
        console.error('[IDLE] No reauth modal function available');
      }
    } catch (e) {
      console.error('[IDLE] Failed to show reauth modal', e);
    }
  }

  
  function shouldReauthLocal(context = 'reauth') {
    try {
      if (typeof window.shouldReauthLocal === 'function') {
        return window.shouldReauthLocal(context);
      }
      
      // Fallback: manual check
      const hasPin = localStorage.getItem('hasPin') === 'true';
      const biometricsEnabled = localStorage.getItem('biometricsEnabled') === 'true';
      const credentialId = localStorage.getItem('credentialId') || '';
      
      const needsReauth = hasPin || (biometricsEnabled && credentialId);
      const method = (biometricsEnabled && credentialId) ? 'biometric' : (hasPin ? 'pin' : null);
      
      return { needsReauth, method };
    } catch (e) {
      return { needsReauth: false, method: null };
    }
  }
  
  async function checkServerReauthStatus() {
    try {
      if (typeof window.checkServerReauthStatus === 'function') {
        return await window.checkServerReauthStatus();
      }
      
      // Fallback: direct fetch
      const apiBase = window.__SEC_API_BASE || window.API_BASE || '';
      const url = `${apiBase}/reauth/status`;
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
      });
      
      if (!res.ok) return { needsReauth: false };
      
      const data = await res.json();
      return data || { needsReauth: false };
    } catch (e) {
      console.warn('[IDLE] Server check failed', e);
      return { needsReauth: false };
    }
  }
  
  // ============================================
  // SETUP FUNCTION (call once on dashboard load)
  // ============================================
  async function setupInactivity() {
    if (setupComplete) {
      console.log('[IDLE] Already initialized, skipping');
      return;
    }
    
    console.log('[IDLE] Initializing idle detection system');
    
    // Quick check: skip if user doesn't need reauth
    try {
      const check = shouldReauthLocal('reauth');
      if (!check.needsReauth) {
        console.log('[IDLE] No reauth needed (no PIN/bio) - skipping setup');
        return;
      }
    } catch (e) {
      console.warn('[IDLE] Pre-check failed, continuing anyway', e);
    }
    
    // Initialize timestamps
    lastActivityTimestamp = Date.now();
    setItem(KEYS.LAST_ACTIVE, lastActivityTimestamp);
    
    // Attach activity event listeners
    ACTIVITY_EVENTS.forEach(eventType => {
      try {
        document.addEventListener(eventType, onUserActivity, { passive: true, capture: true });
      } catch (e) {
        // Fallback without options
        try {
          document.addEventListener(eventType, onUserActivity);
        } catch (e2) {
          console.warn(`[IDLE] Failed to attach ${eventType}`, e2);
        }
      }
    });
    
    // Attach visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });
    
    // Check if we need to show reauth on load (user left for 2+ minutes)
    await checkHardIdleOnVisible();
    
    // Start soft idle timer if page is visible and modal not open
    if (document.visibilityState === 'visible' && !hasCanonicalReauthFlag() && !isReauthModalOpen()) {
      startSoftIdleTimer();
    }
    
    setupComplete = true;
    console.log('[IDLE] Setup complete');
  }
  
  // ============================================
  // RESET FUNCTION (call after successful reauth)
  // ============================================
  function resetIdleTimer() {
    console.log('[IDLE] Resetting all timers');
    
    const now = Date.now();
    lastActivityTimestamp = now;
    lastResetCall = now;
    
    // Update storage
    setItem(KEYS.LAST_ACTIVE, now);
    removeItem(KEYS.PAGE_HIDDEN_AT);
    clearExpectedReauthAt();
    
    // Clear state
    pageHiddenTimestamp = null;
    promptShowing = false;
    
    // Clear ALL timers
    stopSoftIdleTimer();
    if (hardIdleTimeout) {
      clearTimeout(hardIdleTimeout);
      hardIdleTimeout = null;
    }
    if (promptTimeout) {
      clearTimeout(promptTimeout);
      promptTimeout = null;
    }
    
    // Restart soft timer if visible and modal not open
    if (document.visibilityState === 'visible' && !isReauthModalOpen()) {
      startSoftIdleTimer();
    }
  }
  
  // ============================================
  // CLEANUP FUNCTION (call on logout)
  // ============================================
  function cleanupInactivity() {
    console.log('[IDLE] Cleaning up');
    
    // Remove event listeners
    ACTIVITY_EVENTS.forEach(eventType => {
      document.removeEventListener(eventType, onUserActivity, { capture: true });
    });
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    
    // Clear timers
    stopSoftIdleTimer();
    if (hardIdleTimeout) {
      clearTimeout(hardIdleTimeout);
      hardIdleTimeout = null;
    }
    if (promptTimeout) {
      clearTimeout(promptTimeout);
      promptTimeout = null;
    }
    
    // Clear storage
    removeItem(KEYS.LAST_ACTIVE);
    removeItem(KEYS.PAGE_HIDDEN_AT);
    clearExpectedReauthAt();
    
    setupComplete = false;
    promptShowing = false;
  }
  
  // ============================================
  // EXPOSE PUBLIC API
  // ============================================
  window.__idleDetection = {
    setup: setupInactivity,
    reset: resetIdleTimer,
    cleanup: cleanupInactivity,
    
    // Getters for debugging
    getState: () => ({
      softIdleActive: !!softIdleTimeout,
      hardIdleActive: !!hardIdleTimeout,
      promptActive: !!promptTimeout,
      promptShowing: promptShowing,
      lastActivity: lastActivityTimestamp,
      pageHidden: pageHiddenTimestamp,
      reauthModalOpen: isReauthModalOpen(),
      setupComplete
    })
  };
  
  // Legacy compatibility (if other code expects these globals)
  window.setupInactivity = setupInactivity;
  window.resetIdleTimer = resetIdleTimer;
  window.showInactivityPrompt = showInactivityPrompt;
  
})();

// ============================================
// AUTO-INITIALIZE (call after dependencies loaded)
// ============================================
(function autoInit() {
  // Wait for dependencies (reauth modal, etc.)
  function tryInit() {
    if (typeof window.shouldReauthLocal === 'function' || 
        typeof window.shouldReauth === 'function') {
      
      // Initialize on DOM ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          if (window.__idleDetection) {
            window.__idleDetection.setup();
          }
        });
      } else {
        // DOM already ready
        if (window.__idleDetection) {
          window.__idleDetection.setup();
        }
      }
    } else {
      // Dependencies not ready, retry
      setTimeout(tryInit, 100);
    }
  }
  
  tryInit();
})();

// ============================================
// PERSISTENT REAUTH LOCK SYSTEM
// Survives reload, hard reload, and tab switching
// ============================================

(function() {
  'use strict';
  
  // ============================================
  // CONSTANTS
  // ============================================
  const LOCK_KEY = 'fg_reauth_lock_v2'; // Persistent lock flag
  const BROADCAST_CHANNEL_NAME = 'fg-reauth-sync';
  const STALE_LOCK_MS = 10 * 60 * 1000; // Consider lock stale after 10 minutes (safety)
  
  // ============================================
  // STATE
  // ============================================
  let broadcastChannel = null;
  let lockCheckInterval = null;
  
  // ============================================
  // SERVER SYNC
  // ============================================
  
  /**
   * Check server for active reauth lock
   */
  async function checkServerLock() {
    try {
      const apiBase = window.__SEC_API_BASE || window.API_BASE || '';
      const url = `${apiBase}/reauth/status`;
      
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache' 
        }
      });
      
      if (!res.ok) {
        console.warn('[REAUTH-LOCK] Server check returned', res.status);
        return null;
      }
      
      const data = await res.json();
      
      // Server returns { reauthRequired: true/false, token?, reason? }
      if (data && data.reauthRequired) {
        return {
          locked: true,
          reason: data.reason || 'server-timeout',
          token: data.token || null
        };
      }
      
      return null;
    } catch (e) {
      console.error('[REAUTH-LOCK] Failed to check server lock:', e);
      return null;
    }
  }
  
  /**
   * Notify server to set reauth lock
   */
  async function setServerLock(reason = 'client-idle') {
    try {
      const apiBase = window.__SEC_API_BASE || window.API_BASE || '';
      const url = `${apiBase}/reauth/require`;
      
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      
      if (!res.ok) {
        console.warn('[REAUTH-LOCK] Server lock set failed:', res.status);
        return null;
      }
      
      const data = await res.json();
      console.log('[REAUTH-LOCK] Server lock set successfully:', data);
      return data;
    } catch (e) {
      console.error('[REAUTH-LOCK] Failed to set server lock:', e);
      return null;
    }
  }
  
  /**
   * Notify server to clear reauth lock
   */
  async function clearServerLock() {
    try {
      const apiBase = window.__SEC_API_BASE || window.API_BASE || '';
      const url = `${apiBase}/reauth/complete`;
      
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!res.ok) {
        console.warn('[REAUTH-LOCK] Server lock clear failed:', res.status);
        return false;
      }
      
      const data = await res.json();
      console.log('[REAUTH-LOCK] Server lock cleared successfully:', data);
      return data.ok || false;
    } catch (e) {
      console.error('[REAUTH-LOCK] Failed to clear server lock:', e);
      return false;
    }
  }
  
  // ============================================
  // LOCK MANAGEMENT (updated to sync with server)
  // ============================================
  
  /**
   * Create a lock object with metadata
   */
  function createLock(reason = 'unknown') {
    return {
      locked: true,
      reason: reason,
      timestamp: Date.now(),
      token: generateToken()
    };
  }
  
  /**
   * Generate unique token for lock
   */
  function generateToken() {
    try {
      if (crypto && crypto.randomUUID) {
        return crypto.randomUUID();
      }
    } catch (e) {}
    
    return `lock_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
  
  /**
   * Set reauth lock (persist to localStorage)
   */
  function setReauthLock(reason = 'reauth-required') {
    try {
      const lock = createLock(reason);
      localStorage.setItem(LOCK_KEY, JSON.stringify(lock));
      console.log('[REAUTH-LOCK] Lock set:', lock);
      
      // Broadcast to other tabs
      broadcastLockChange('lock', lock);
      
      // Also set the canonical flag for compatibility
      try {
        localStorage.setItem('fg_reauth_required_v1', JSON.stringify(lock));
      } catch (e) {}
      
      return lock;
    } catch (e) {
      console.error('[REAUTH-LOCK] Failed to set lock:', e);
      return null;
    }
  }
  
  /**
   * Clear reauth lock
   */
  function clearReauthLock() {
    try {
      const oldLock = getReauthLock();
      localStorage.removeItem(LOCK_KEY);
      console.log('[REAUTH-LOCK] Lock cleared');
      
      // Broadcast to other tabs
      broadcastLockChange('unlock', null);
      
      // Also clear canonical flag
      try {
        localStorage.removeItem('fg_reauth_required_v1');
        localStorage.removeItem('reauthPending');
      } catch (e) {}
      
      return oldLock;
    } catch (e) {
      console.error('[REAUTH-LOCK] Failed to clear lock:', e);
      return null;
    }
  }
  
  /**
   * Get current reauth lock
   */
  function getReauthLock() {
    try {
      const raw = localStorage.getItem(LOCK_KEY);
      if (!raw) return null;
      
      const lock = JSON.parse(raw);
      
      // Check if lock is stale
      if (Date.now() - lock.timestamp > STALE_LOCK_MS) {
        console.warn('[REAUTH-LOCK] Lock is stale, removing');
        clearReauthLock();
        return null;
      }
      
      return lock;
    } catch (e) {
      console.error('[REAUTH-LOCK] Failed to get lock:', e);
      return null;
    }
  }
  
  /**
   * Check if reauth is locked
   */
  function isReauthLocked() {
    const lock = getReauthLock();
    return !!(lock && lock.locked);
  }
  
  // ============================================
  // CROSS-TAB COMMUNICATION
  // ============================================
  
  /**
   * Initialize BroadcastChannel for cross-tab sync
   */
  function initBroadcastChannel() {
    try {
      if (typeof BroadcastChannel === 'undefined') {
        console.warn('[REAUTH-LOCK] BroadcastChannel not supported');
        return;
      }
      
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      
      broadcastChannel.onmessage = (event) => {
        try {
          const { type, lock } = event.data;
          console.log('[REAUTH-LOCK] Received broadcast:', type, lock);
          
          if (type === 'lock') {
            // Another tab set lock - show modal
            handleLockReceived(lock);
          } else if (type === 'unlock') {
            // Another tab cleared lock - hide modal
            handleUnlockReceived();
          }
        } catch (e) {
          console.error('[REAUTH-LOCK] Broadcast message error:', e);
        }
      };
      
      console.log('[REAUTH-LOCK] BroadcastChannel initialized');
    } catch (e) {
      console.error('[REAUTH-LOCK] Failed to init BroadcastChannel:', e);
    }
  }
  
  /**
   * Broadcast lock change to other tabs
   */
  function broadcastLockChange(type, lock) {
    try {
      if (!broadcastChannel) return;
      
      broadcastChannel.postMessage({ type, lock });
      console.log('[REAUTH-LOCK] Broadcasted:', type);
    } catch (e) {
      console.error('[REAUTH-LOCK] Failed to broadcast:', e);
    }
  }
  
  /**
   * Handle lock received from another tab
   */
  async function handleLockReceived(lock) {
    console.log('[REAUTH-LOCK] Lock received from another tab');
    
    // Show reauth modal if not already showing
    if (!isReauthModalVisible()) {
      try {
        await showReauthModalSafe({ 
          context: 'reauth', 
          reason: lock?.reason || 'cross-tab-lock' 
        });
      } catch (e) {
        console.error('[REAUTH-LOCK] Failed to show modal on lock receive:', e);
      }
    }
  }
  
  /**
   * Handle unlock received from another tab
   */
  function handleUnlockReceived() {
    console.log('[REAUTH-LOCK] Unlock received from another tab');
    
    // Hide reauth modal if showing
    if (isReauthModalVisible()) {
      try {
        hideReauthModalSafe();
      } catch (e) {
        console.error('[REAUTH-LOCK] Failed to hide modal on unlock receive:', e);
      }
    }
  }
  
  // ============================================
  // STORAGE EVENT LISTENER (fallback for cross-tab)
  // ============================================
  
  /**
   * Listen for storage events (fallback if BroadcastChannel not available)
   */
  function initStorageListener() {
    window.addEventListener('storage', (event) => {
      if (event.key !== LOCK_KEY) return;
      
      console.log('[REAUTH-LOCK] Storage event detected:', event.newValue);
      
      if (event.newValue) {
        // Lock was set
        try {
          const lock = JSON.parse(event.newValue);
          handleLockReceived(lock);
        } catch (e) {
          console.error('[REAUTH-LOCK] Failed to parse lock from storage event:', e);
        }
      } else {
        // Lock was cleared
        handleUnlockReceived();
      }
    });
    
    console.log('[REAUTH-LOCK] Storage listener initialized');
  }
  
  // ============================================
  // PAGE LIFECYCLE HANDLERS
  // ============================================
  
  /**
   * Check lock on page load (with server sync)
   */
  async function checkLockOnLoad() {
    console.log('[REAUTH-LOCK] Checking lock on page load (client + server)');
    
    // 1. Check local lock first (fast)
    const localLock = getReauthLock();
    
    if (localLock && localLock.locked) {
      console.log('[REAUTH-LOCK] Found local lock, showing modal:', localLock);
      
      // Show reauth modal immediately
      try {
        await showReauthModalSafe({ 
          context: 'reauth', 
          reason: localLock.reason || 'persisted-lock' 
        });
      } catch (e) {
        console.error('[REAUTH-LOCK] Failed to show modal on load:', e);
      }
      return; // Local lock found, no need to check server
    }
    
    // 2. No local lock - check server (survives cookie/cache clear)
    console.log('[REAUTH-LOCK] No local lock, checking server...');
    
    try {
      const serverLock = await checkServerLock();
      
      if (serverLock && serverLock.locked) {
        console.log('[REAUTH-LOCK] Server lock found, syncing to client:', serverLock);
        
        // Sync server lock to client
        const lock = setReauthLock(serverLock.reason || 'server-lock');
        
        // Show modal
        try {
          await showReauthModalSafe({ 
            context: 'reauth', 
            reason: serverLock.reason || 'server-lock' 
          });
        } catch (e) {
          console.error('[REAUTH-LOCK] Failed to show modal after server sync:', e);
        }
      } else {
        console.log('[REAUTH-LOCK] No lock found (client or server)');
      }
    } catch (e) {
      console.error('[REAUTH-LOCK] Failed to check server lock:', e);
      // Continue without server lock (degrade gracefully)
    }
  }
  
  /**
   * Check lock on visibility change (tab switch)
   */
  async function checkLockOnVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    
    console.log('[REAUTH-LOCK] Checking lock on visibility change');
    
    const lock = getReauthLock();
    
    if (lock && lock.locked && !isReauthModalVisible()) {
      console.log('[REAUTH-LOCK] Lock exists but modal not visible, showing:', lock);
      
      try {
        await showReauthModalSafe({ 
          context: 'reauth', 
          reason: lock.reason || 'visibility-check' 
        });
      } catch (e) {
        console.error('[REAUTH-LOCK] Failed to show modal on visibility:', e);
      }
    }
  }
  
  /**
   * Periodic lock check (safety net)
   */
  function startLockCheckInterval() {
    if (lockCheckInterval) {
      clearInterval(lockCheckInterval);
    }
    
    // Track how many times modal is visible without lock (to allow grace period)
    let modalVisibleWithoutLockCount = 0;
    
    lockCheckInterval = setInterval(() => {
      const lock = getReauthLock();
      const modalVisible = isReauthModalVisible();
      
      // If lock exists but modal not visible -> show modal
      if (lock && lock.locked && !modalVisible) {
        console.warn('[REAUTH-LOCK] Lock/modal mismatch detected - showing modal');
        modalVisibleWithoutLockCount = 0; // Reset counter
        showReauthModalSafe({ 
          context: 'reauth', 
          reason: lock.reason || 'periodic-check' 
        });
      }
      
      // If no lock but modal visible -> only hide after 3 consecutive checks (15 seconds grace)
      // This prevents hiding modal if lock is being set asynchronously
      if (!lock && modalVisible) {
        modalVisibleWithoutLockCount++;
        console.warn(`[REAUTH-LOCK] Modal visible without lock (count: ${modalVisibleWithoutLockCount}/3)`);
        
        if (modalVisibleWithoutLockCount >= 3) {
          console.warn('[REAUTH-LOCK] Modal visible without lock for 15+ seconds - hiding');
          hideReauthModalSafe();
          modalVisibleWithoutLockCount = 0;
        }
      } else {
        // Reset counter if lock exists or modal not visible
        modalVisibleWithoutLockCount = 0;
      }
    }, 5000); // Check every 5 seconds
    
    console.log('[REAUTH-LOCK] Periodic lock check started');
  }
  
  function stopLockCheckInterval() {
    if (lockCheckInterval) {
      clearInterval(lockCheckInterval);
      lockCheckInterval = null;
      console.log('[REAUTH-LOCK] Periodic lock check stopped');
    }
  }
  
  // ============================================
  // MODAL HELPERS
  // ============================================
  
  /**
   * Check if reauth modal is visible
   */
  function isReauthModalVisible() {
    // Check global flags
    if (window.__reauthModalOpen === true) return true;
    if (window.reauthModalOpen === true) return true;
    
    // Check DOM
    const reauthModal = document.getElementById('reauthModal') || 
                        document.querySelector('.reauth-modal') ||
                        document.querySelector('[data-reauth-modal]');
    
    if (reauthModal && !reauthModal.classList.contains('hidden')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Show reauth modal (safe wrapper)
   */
  async function showReauthModalSafe(options) {
    try {
      console.log('[REAUTH-LOCK] Showing reauth modal');
      
      // Try multiple APIs
      if (window.__reauth && typeof window.__reauth.showReauthModal === 'function') {
        await window.__reauth.showReauthModal(options.context || 'reauth');
      } else if (typeof showReauthModal === 'function') {
        await showReauthModal(options.context || 'reauth');
      } else if (typeof initReauthModal === 'function') {
        await initReauthModal({ show: true, context: options.context || 'reauth' });
      } else {
        console.error('[REAUTH-LOCK] No reauth modal function available');
      }
    } catch (e) {
      console.error('[REAUTH-LOCK] Failed to show reauth modal:', e);
    }
  }
  
  /**
   * Hide reauth modal (safe wrapper)
   */
  function hideReauthModalSafe() {
    try {
      console.log('[REAUTH-LOCK] Hiding reauth modal');
      
      // Try multiple APIs
      if (typeof guardedHideReauthModal === 'function') {
        guardedHideReauthModal();
      } else if (window.__reauth && typeof window.__reauth.hideReauthModal === 'function') {
        window.__reauth.hideReauthModal();
      } else {
        // Fallback: direct DOM manipulation
        const reauthModal = document.getElementById('reauthModal');
        if (reauthModal) {
          reauthModal.classList.add('hidden');
        }
      }
    } catch (e) {
      console.error('[REAUTH-LOCK] Failed to hide reauth modal:', e);
    }
  }
  
  // ============================================
  // INTEGRATION WITH IDLE SYSTEM
  // ============================================
  
  /**
   * Trigger reauth lock (call this when reauth is needed)
   */
  function triggerReauthLock(reason = 'reauth-required') {
    console.log('[REAUTH-LOCK] Triggering reauth lock, reason:', reason);
    
    // Set lock
    const lock = setReauthLock(reason);
    
    // Show modal
    showReauthModalSafe({ context: 'reauth', reason });
    
    // Stop idle timers
    if (window.__idleDetection && typeof window.__idleDetection.reset === 'function') {
      // Note: Don't restart timer, just clear them
      if (window.__idleDetection.getState) {
        const state = window.__idleDetection.getState();
        console.log('[REAUTH-LOCK] Idle detection state:', state);
      }
    }
    
    return lock;
  }
  
  /**
   * Clear reauth lock after successful authentication
   */
  function completeReauthUnlock() {
    console.log('[REAUTH-LOCK] Completing reauth unlock');
    
    // Clear lock
    clearReauthLock();
    
    // Hide modal
    hideReauthModalSafe();
    
    // Restart idle timers
    if (window.__idleDetection && typeof window.__idleDetection.reset === 'function') {
      window.__idleDetection.reset();
    }
    
    // Dispatch event for other systems
    try {
      window.dispatchEvent(new CustomEvent('reauth:unlocked', {
        detail: { timestamp: Date.now() }
      }));
    } catch (e) {}
  }
  
  // ============================================
  // INITIALIZATION
  // ============================================
  
  function initPersistentReauthLock() {
    console.log('[REAUTH-LOCK] Initializing persistent reauth lock system');
    
    // Initialize cross-tab communication
    initBroadcastChannel();
    initStorageListener();
    
    // Check lock on load
    checkLockOnLoad();
    
    // Listen for visibility changes
    document.addEventListener('visibilitychange', checkLockOnVisibilityChange, { passive: true });
    
    // Listen for pageshow (handles bfcache)
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        console.log('[REAUTH-LOCK] Page restored from bfcache');
        checkLockOnLoad();
      }
    }, { passive: true });
    
    // Start periodic check
    startLockCheckInterval();
    
    console.log('[REAUTH-LOCK] Initialization complete');
  }
  
  // ============================================
  // EXPOSE PUBLIC API
  // ============================================
  
  window.__persistentReauthLock = {
    // Core functions
    setLock: setReauthLock,
    clearLock: clearReauthLock,
    getLock: getReauthLock,
    isLocked: isReauthLocked,
    
    // High-level functions
    trigger: triggerReauthLock,
    complete: completeReauthUnlock,
    
    // State checking
    isModalVisible: isReauthModalVisible,
    
    // Debug helpers
    getState: () => ({
      locked: isReauthLocked(),
      lock: getReauthLock(),
      modalVisible: isReauthModalVisible(),
      broadcastChannelActive: !!broadcastChannel
    })
  };
  
  // Backward compatibility aliases
  window.setReauthLock = setReauthLock;
  window.clearReauthLock = clearReauthLock;
  window.isReauthLocked = isReauthLocked;
  
  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPersistentReauthLock);
  } else {
    initPersistentReauthLock();
  }
  
})();




// global cache
window.__cachedAuthOptions = null;

async function prefetchAuthOptionsFor(uid, context = 'reauth') {
  try {
    const apiBase = window.__SEC_API_BASE || '';
    const credentialId = localStorage.getItem('credentialId') || null;
    const endpoint = credentialId ? '/webauthn/auth/options' : '/webauthn/auth/options';
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


// ===== Prefetch helpers & safe base64 helpers for biometric flow =====
(function(){
  if (!window.fromBase64Url) {
    window.fromBase64Url = function (b64url) {
      try {
        if (b64url == null) return new ArrayBuffer(0);

        // Already a buffer or typed array — return its buffer
        if (b64url instanceof ArrayBuffer) return b64url;
        if (ArrayBuffer.isView(b64url)) return b64url.buffer;

        // Some servers may send {type:'Buffer', data:[...]}
        if (typeof b64url === 'object' && Array.isArray(b64url.data)) {
          return new Uint8Array(b64url.data).buffer;
        }

        // If it's not a string, don't try to convert — just return it
        if (typeof b64url !== 'string') {
          console.warn('[webauthn] fromBase64Url expected string, got', typeof b64url, b64url);
          return b64url;
        }

        // Normal string decode path
        let s = b64url.replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        const str = atob(s);
        const arr = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
        return arr.buffer;
      } catch (err) {
        console.warn('[webauthn] fromBase64Url error', err, b64url);
        return new ArrayBuffer(0);
      }
    };
  }

  if (!window.toBase64Url) {
    window.toBase64Url = function (buffer) {
      if (!buffer) return '';
      const bytes = new Uint8Array(buffer);
      let str = '';
      for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
      return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
  }




// ===== WebAuthn session init: cache userId for fast auth/options requests =====
(function(){
  (async function initWebAuthnSession(){
    try {
      // Try to get session early and cache user id for quick POST body
      if (typeof getSession === 'function') {
        var sess = await safeCall(getSession);
        var uid = sess && sess.user && (sess.user.uid || sess.user.id);
        if (uid) {
          window.__webauthn_userId = uid;
        }
      }
      // If we have a uid and a stored cred, prefetch options immediately
      var stored = localStorage.getItem('credentialId') || localStorage.getItem('webauthn-cred-id');
      if ((window.__webauthn_userId) && stored) {
        try { window.prefetchAuthOptions && window.prefetchAuthOptions(); } catch(e){}
      }
    } catch (e) {
      console.warn('[initWebAuthnSession] failed', e);
    }
  })();
})();


  window.prefetchAuthOptions = window.prefetchAuthOptions || (async function prefetchAuthOptions() {
    try {
      if (window.__prefetchInFlight) return;
      window.__prefetchInFlight = true;

      const storedId = localStorage.getItem('credentialId') || localStorage.getItem('webauthn-cred-id');
      if (!storedId) {
        window.__prefetchInFlight = false;
        return;
      }

      const res = await fetch((window.__SEC_API_BASE || API_BASE) + '/webauthn/auth/options', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId: storedId, userId: (window.__webauthn_userId || null) })
      });

      if (!res.ok) {
        console.warn('[prefetchAuthOptions] options fetch not ok', await res.text());
        window.__prefetchInFlight = false;
        return;
      }

      const publicKey = await res.json();

      try {
        if (publicKey.challenge && typeof publicKey.challenge === 'string') {
          const ch = window.fromBase64Url(publicKey.challenge);
          if (ch) publicKey.challenge = new Uint8Array(ch);
        }
        if (Array.isArray(publicKey.allowCredentials)) {
          publicKey.allowCredentials = publicKey.allowCredentials.map(function(c){
            try {
              const idVal = (typeof c.id === 'string') ? window.fromBase64Url(c.id) : (ArrayBuffer.isView(c.id) ? c.id.buffer : (c.id instanceof ArrayBuffer ? c.id : null));
              return {
                type: c.type || 'public-key',
                transports: c.transports || ['internal'],
                id: idVal ? new Uint8Array(idVal) : idVal
              };
            } catch (e) {
              return { type: c.type || 'public-key', transports: c.transports || ['internal'], id: c.id };
            }
          });
        }

      } catch (e) {
        console.warn('[prefetchAuthOptions] conversion error', e);
      }

      window.__cachedAuthOptions = publicKey;
      window.__cachedAuthOptionsFetchedAt = Date.now();
      console.log('[prefetchAuthOptions] cached auth options ready');
    } catch (err) {
      console.warn('[prefetchAuthOptions] failed', err);
    } finally {
      window.__prefetchInFlight = false;
    }
  });

  try {
    var bioBtnEl = document.getElementById('bioBtn') || document.querySelector('.biometric-button') || document.querySelector('[data-bio-button]');
    if (bioBtnEl) {
      // debounce to avoid multiple in-flight prefetch calls on fast interactions
      const debouncedPrefetch = (function(){
        let locked = false;
        return function(){
          if (locked) return;
          locked = true;
          try {
            console.log('[prefetchAuthOptions] debounced trigger');
            window.prefetchAuthOptions && window.prefetchAuthOptions();
          } catch(e){
            console.warn('[prefetchAuthOptions] debounced call failed', e);
          }
          // keep short lock window to avoid spamming when user mashes button
          setTimeout(()=> { locked = false; }, 250);
        };
      })();

      // bind to a variety of events to be defensive for touch/click/keyboard/fast modal opens
      ['pointerdown','mouseenter','click','touchstart','focus'].forEach(function(ev){
        try { bioBtnEl.addEventListener(ev, debouncedPrefetch, { passive: true }); } catch(e){
          // older browsers may not accept options object
          try { bioBtnEl.addEventListener(ev, debouncedPrefetch); } catch(err){ /* ignore */ }
        }
      });

      // also prefetch when the reauth modal opens (defensive)
      try {
        document.addEventListener('modal:reauth:open', function(){ 
          try {
            console.log('[prefetchAuthOptions] modal open trigger');
            window.prefetchAuthOptions && window.prefetchAuthOptions();
          } catch(e){ console.warn('prefetchAuthOptions on modal open failed', e); }
        }, { passive: true });
      } catch(e) {
        // fallback if addEventListener options not supported
        try {
          document.addEventListener('modal:reauth:open', function(){ 
            try {
              console.log('[prefetchAuthOptions] modal open trigger');
              window.prefetchAuthOptions && window.prefetchAuthOptions();
            } catch(e){ console.warn('prefetchAuthOptions on modal open failed', e); }
          });
        } catch(err){}
      }
    }
    if (localStorage.getItem('credentialId') || localStorage.getItem('webauthn-cred-id')) {
      setTimeout(function(){ 
        try { 
          console.log('[prefetchAuthOptions] timed initial prefetch');
          window.prefetchAuthOptions(); 
        } catch(e){ console.warn('initial prefetch failed', e); }
      }, 200);
    }
  } catch (e) {
    console.warn('bindPrefetchToBioBtn error', e);
  }
})();





// 🔹 Main verifyBiometrics (robust: fresh challenge + withLoader + debug logs + safe PIN simulation)
// 🔹 Main verifyBiometrics (always fresh: invalidate cache + fetch new + debug + safe PIN fallback)
// Updated verifyBiometrics function
// ----- Updated implementation with proper reauth flow -----
async function verifyBiometrics(uid, context = 'reauth') {
  console.log('%c[verifyBiometrics] Called (always fresh)', 'color:#0ff;font-weight:bold');

  try {
    // Resolve userId if not provided
    let userId = uid;
    if (!userId) {
      const session = await safeCall(getSession);
      userId = session?.user?.id || session?.user?.uid;
      if (!userId) throw new Error('No user ID available');
    }

    // Always invalidate cache for fresh challenge (fix stale prefetch issue)
    window.__cachedAuthOptions = null;
    window.__cachedAuthOptionsFetchedAt = 0;
    console.log('[verifyBiometrics] Cache invalidated—fetching fresh options');

    // Fetch fresh options (include credentialId for specific allowCredentials)
    const storedId = localStorage.getItem('credentialId') || localStorage.getItem('webauthn-cred-id');
    if (!storedId) throw new Error('No stored credential ID—biometrics not registered?');

    const optRes = await fetch(`${window.__SEC_API_BASE}/webauthn/auth/options`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, credentialId: storedId, context })
    });

    if (!optRes.ok) {
      const errText = await optRes.text();
      console.error('[verifyBiometrics] Options fetch failed', optRes.status, errText);
      throw new Error(`Options fetch failed: ${errText}`);
    }

    const publicKey = await optRes.json();
    console.log('[verifyBiometrics] Fresh options received', { challenge: publicKey.challenge?.slice?.(0, 10) + '...', allowCredCount: publicKey.allowCredentials?.length || 0 });

    // Convert base64url to buffers (using your fromBase64Url helper)
    publicKey.challenge = fromBase64Url(publicKey.challenge);
    if (Array.isArray(publicKey.allowCredentials)) {
      publicKey.allowCredentials = publicKey.allowCredentials.map(c => ({
        ...c,
        id: fromBase64Url(c.id)
      }));
    }
    publicKey.userVerification = 'required';
    publicKey.timeout = 60000;

    // Prompt user for biometrics
    const assertion = await navigator.credentials.get({ publicKey });
    if (!assertion) throw new Error('No assertion from authenticator');

    // Show loader during verify
    return await withLoader(async () => {
      // Build payload with base64url encoding (using your toBase64Url)
      const payload = {
        id: assertion.id,
        rawId: toBase64Url(assertion.rawId),
        type: assertion.type,
        response: {
          authenticatorData: toBase64Url(assertion.response.authenticatorData),
          clientDataJSON: toBase64Url(assertion.response.clientDataJSON),
          signature: toBase64Url(assertion.response.signature),
          userHandle: assertion.response.userHandle ? toBase64Url(assertion.response.userHandle) : null
        },
        userId  // Include for server
      };

      const verifyRes = await fetch(`${window.__SEC_API_BASE}/webauthn/auth/verify`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!verifyRes.ok) {
        const errText = await verifyRes.text();
        console.error('[verifyBiometrics] Verify failed', verifyRes.status, errText);
        throw new Error(`Server verify failed: ${errText}`);
      }

      const verifyData = await verifyRes.json();
      console.log('[verifyBiometrics] Verify success', verifyData);

      // Handle success (e.g., close modal)
      console.log('[DEBUG] Biometrics verification successful in verifyBiometrics');
      try {
        // 1. Call onSuccessfulReauth to clear flags, reset timers, and handle session state
        if (typeof onSuccessfulReauth === 'function') {
          await onSuccessfulReauth();
        }
        // 2. Call guardedHideReauthModal to safely hide the modal only if flags are cleared
        if (typeof guardedHideReauthModal === 'function') {
          await guardedHideReauthModal();
        }
        console.log('[DEBUG] Reauth modal hidden after successful biometrics verification in verifyBiometrics');

        // Notify user of success
        if (typeof notify === 'function') {
          notify('Authentication successful', 'success');
        }

        // --- NEW: Immediately refresh status/UI but preserve sticky broadcasts ---
        try {
          // hide any tiny reauth hint (non-destructive)
          if (typeof hideTinyReauthNotice === 'function') {
            try { hideTinyReauthNotice(); } catch (e) {}
          }
          // dispatch event so other modules can react
          try {
  // dispatch canonical event and let the fg:reauth-success handler trigger the debounced poll.
  window.dispatchEvent(new CustomEvent('fg:reauth-success', { detail: { method: 'biometrics' } }));
} catch (e) {
  console.debug('verifyBiometrics: dispatch fg:reauth-success failed', e);
}

        } catch (e) {
          console.warn('[verifyBiometrics] post-success UI refresh failed', e);
        }

      } catch (err) {
        console.warn('[reauth] Post-biometrics verification error in verifyBiometrics', err);
        // Optionally show an error to the user
        if (typeof notify === 'function') {
          notify('Error completing authentication. Please try again.', 'error');
        }
      }
      return { success: true, data: verifyData };
    });
  } catch (err) {
    console.error('[verifyBiometrics] Error', err);
    if (typeof notify === 'function') {
      notify(`Biometric error: ${err.message}`, 'error');
    }
    // Fallback to PIN view
    switchViews(false);  // Show PIN
    return { success: false, error: err.message };
  }
}


// 🔹 Improved simulatePinEntry with verbose debug logs and Promise-based completion
// ---- REPLACE existing simulatePinEntry(...) with this improved version ----
function simulatePinEntry(opts = {}) {
  const stagger = typeof opts.stagger === 'number' ? opts.stagger : 150;
  const expectedCount = typeof opts.expectedCount === 'number' ? opts.expectedCount : 4;
  const fillAll = !!opts.fillAll; // new flag: fill all inputs at once
  const debugTag = '[DEBUG-BIO simulatePinEntry]';

  console.log(`${debugTag} start; options:`, { stagger, expectedCount, fillAll });

  return new Promise((resolve) => {
    try {
      const selectors = [
        '.reauthpin-inputs input',
        '.pin-input',
        'input.pin',
        '.pin > input',
        '.pin-inputs input',
        'input[id^="pin"]',
      ];
      let inputs = [];
      for (const s of selectors) {
        inputs = Array.from(document.querySelectorAll(s));
        if (inputs && inputs.length) {
          console.log(`${debugTag} found inputs with selector "${s}" (count=${inputs.length})`);
          break;
        }
      }

      if (!inputs || inputs.length === 0) {
        console.warn(`${debugTag} No PIN inputs found; trying visible input fallback`);
        inputs = Array.from(document.querySelectorAll('input')).filter(i => i.offsetParent !== null).slice(0, expectedCount);
      }

      if (!inputs || inputs.length === 0) {
        console.warn(`${debugTag} still no inputs found; aborting simulatePinEntry`);
        resolve(false);
        return;
      }

      if (inputs.length !== expectedCount) {
        console.warn(`${debugTag} unexpected PIN input count: ${inputs.length} (expected ${expectedCount})`);
      }

      // ensure visible
      try { inputs[0] && inputs[0].scrollIntoView && inputs[0].scrollIntoView({ block: 'center' }); } catch(e){}

      // aria-live debug node (non-intrusive)
      let liveNode = null;
      try {
        liveNode = document.getElementById('__debug_pin_live') || (() => {
          const n = document.createElement('div');
          n.id = '__debug_pin_live';
          n.setAttribute('aria-live', 'polite');
          n.style.position = 'fixed';
          n.style.left = '-9999px';
          n.style.width = '1px';
          n.style.height = '1px';
          document.body.appendChild(n);
          return n;
        })();
      } catch (e) { liveNode = null; }

      // synchronous immediate fill (all at once)
      if (fillAll || stagger <= 0) {
        try {
          inputs.forEach((input, index) => {
            try { input.disabled = false; } catch(e){}
            try { input.style.visibility = input.style.visibility || 'visible'; } catch(e){}
            input.classList.add('filled', 'simulated-pin');
            try { input.value = '•'; } catch(e){}
            try {
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            } catch(e){}
            if (liveNode) liveNode.textContent = `Simulated PIN: ${index + 1}/${inputs.length} filled`;
          });
          console.log(`${debugTag} filled all inputs synchronously`);
        } catch (e) {
          console.warn(`${debugTag} synchronous fill error`, e);
        }
        // small visual settle
        setTimeout(() => {
          if (liveNode) try { liveNode.textContent = 'Simulated PIN complete'; } catch(e){}
          resolve(true);
        }, 50);
        return;
      }

      // fallback: staggered fill (existing behavior)
      inputs.forEach((input, index) => {
        setTimeout(() => {
          try {
            try { input.disabled = false; } catch (e) {}
            try { input.style.visibility = input.style.visibility || 'visible'; } catch (e) {}
            input.classList.add('filled', 'simulated-pin');
            try { input.value = '•'; } catch (e) {}
            try {
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              try { input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' })); } catch(e){}
            } catch (e) { console.warn(`${debugTag} event dispatch failed`, e); }
            if (liveNode) liveNode.textContent = `Simulated PIN: ${index + 1}/${inputs.length} filled`;
            console.log(`${debugTag} filled input[${index}] id="${input.id || '(no-id)'}"`);
          } catch (err) {
            console.warn(`${debugTag} simulate error for index ${index}`, err);
          }
        }, index * stagger);
      });

      const totalDelay = Math.max(0, (inputs.length - 1) * stagger) + 120;
      setTimeout(() => {
        if (liveNode) try { liveNode.textContent = 'Simulated PIN complete'; } catch(e){}
        console.log(`${debugTag} complete after ${totalDelay}ms`);
        resolve(true);
      }, totalDelay);
    } catch (err) {
      console.error(`${debugTag} unexpected error`, err);
      resolve(false);
    }
  });
}






// Expose small debugging helpers to console
window.dumpCredentialStorage = dumpCredentialStorage;
window.persistCredentialId = persistCredentialId;



  

 

  // Full showReauthModal (explicit called flow)
// Full showReauthModal (explicit called flow)
// ----- Updated implementation with NO automatic biometric calls -----
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
      try {
        if (typeof onSuccessfulReauth === 'function') {
          await onSuccessfulReauth();
        }
        if (typeof guardedHideReauthModal === 'function') {
          await guardedHideReauthModal();
        }
      } catch (err) {
        console.warn('[reauth] Post-reauth check success error', err);
        if (typeof showBanner === 'function') {
          showBanner('Authentication completed, but an internal error occurred. Please refresh if issues persist.');
        }
      }
      return;
    }

    // If biometric is allowed, do NOT automatically verify.
    // Only inform UI that biometric is available.
    if (reauthStatus.method === 'biometric') {
      console.log('showReauthModal: biometric available (manual only, no auto trigger)');
      await initReauthModal({ show: true, context, biometricAvailable: true });
      return;
    }

    // Default: PIN modal only
    await initReauthModal({ show: true, context });

  } catch (err) {
    console.error('showReauthModal unexpected error', err);
    if (typeof guardedHideReauthModal === 'function') {
      await guardedHideReauthModal();
    }
  }
}


/* ---------------------------
   Reauth cross-tab sync module
   - uses BroadcastChannel + storage event fallback
   - persists reauth state across reloads / hard reloads
   - expects server endpoints: /reauth/status and /reauth/complete (see server snippet)
----------------------------*/
(function () {
  const LOCAL_KEY = 'fg_reauth_required_v1';       // storage key
  const BC_NAME = 'fg-reauth';                     // BroadcastChannel name
  const CHECK_STATUS_INTERVAL_MS = 5000;           // optional background poll
  const STALE_MS = 1000 * 60 * 10;                 // consider stale after 10min (tunable)

  // try BroadcastChannel if available
  let bc = null;
  try { if (typeof BroadcastChannel !== 'undefined') bc = new BroadcastChannel(BC_NAME); } catch(e){ bc = null; }

  // small helper to create token
  function makeToken() {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 't_' + String(Math.floor(Math.random() * 1e9)) + '_' + Date.now();
  }

  // canonicalize stored object
  function buildStoredObj({ token=null, ts=null, reason=null } = {}) {
    return { token: token || makeToken(), ts: ts || Date.now(), reason: reason || 'unknown' };
  }

  function writeLocal(obj) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(obj)); } catch (e) {}
    // broadcast
    try { if (bc) bc.postMessage({ type: 'require', payload: obj }); } catch (e) {}
    // storage event fallback (other tabs will pick this up)
    try { window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_KEY, newValue: JSON.stringify(obj) })); } catch(e){}
  }

  function clearLocal(token) {
    // if token provided, only clear if matches (prevents races)
    try {
      const cur = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
      if (!cur) { localStorage.removeItem(LOCAL_KEY); }
      else if (!token || String(cur.token) === String(token)) localStorage.removeItem(LOCAL_KEY);
    } catch (e) { try { localStorage.removeItem(LOCAL_KEY); } catch(e){} }
    try { if (bc) bc.postMessage({ type: 'clear', payload: { token } }); } catch (e) {}
    try { window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_KEY, newValue: null })); } catch(e){}
  }

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch (e) { return null; }
  }

  // show the modal and set reauth active state in this tab
  async function showReauthModalLocal({ fromStorageObj } = {}) {
    try {
      // only open once in this tab
      cacheDomRefs();
      // ensure our modal wiring is initialized
      if (typeof initReauthModal === 'function') {
        await initReauthModal({ show: true, context: 'reauth' });
      } else {
        // fallback: directly unhide modal
        if (reauthModal && reauthModal.classList) reauthModal.classList.remove('hidden');
      }
      // mark active in-memory (ensures keydown handler will attach)
      try { reauthModalOpen = true; setReauthActive(true); } catch (e) {}
      // store a pending marker to help other tabs see we are reauth-ing
      try { localStorage.setItem('fg_reauth_active_tab', (fromStorageObj && fromStorageObj.token) || makeToken()); } catch(e){}
    } catch (e) {}
  }

  // hide the modal UI in this tab
  function hideReauthModalLocal() {
  try {
    // prefer the canonical async success flow + guarded hide
    (async () => {
      try { await guardedHideReauthModal(); } catch (e) { console.warn('[reauth] hideReauthModalLocal guard error', e); }
    })();
  } catch (e) { console.warn('[reauth] hideReauthModalLocal error', e); }
}



  // When reauth is required: set local + server (server optional)
async function requireReauth(reason) {
  // Create token + write local state
  const obj = buildStoredObj({ reason });
  writeLocal(obj);

  // 💡 NEW: mark local expected reauth timestamp so hard-idle logic knows immediately
  try { setExpectedReauthAt(Date.now()); } catch (e) { /* ignore */ }

  // Optionally notify server to set authoritative session flag (recommended)
  try {
    await fetch((window.__SEC_API_BASE || API_BASE) + '/reauth/require', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, token: obj.token })
    }).catch(()=>{});
  } catch (e) {}

  // Immediately show in this tab (if not already shown)
  showReauthModalLocal({ fromStorageObj: obj });
}


  // call this after a successful reauth in the current tab
async function completeReauth() {
  // call server to clear session flag
  let ok = false;
  try {
    const res = await fetch((window.__SEC_API_BASE || API_BASE) + '/reauth/complete', {
      method: 'POST',
      credentials: 'include',
      headers: {'Content-Type':'application/json'}
    });
    ok = res && res.ok;
  } catch (e) { ok = false; }

  // clear local state and broadcast clear
  const stored = readLocal();
  clearLocal(stored && stored.token);

  // **important**: clear the expected reauth timestamp so we don't retrigger hard reauth locally
  try { clearExpectedReauthAt(); } catch (e) { /* ignore */ }

  // hide this tab modal UI
  hideReauthModalLocal();
  return ok;
}


  // react to storage events (fallback) and broadcast messages
  function onStorageEvent(e) {
    if (e.key !== LOCAL_KEY) return;
    const newVal = e.newValue ? JSON.parse(e.newValue) : null;
    if (newVal) {
      // require: show modal
      showReauthModalLocal({ fromStorageObj: newVal });
    } else {
      // cleared: hide modal
      hideReauthModalLocal();
    }
  }

  function onBroadcastMessage(m) {
    try {
      if (!m || !m.data) return;
      const { type, payload } = m.data;
      if (type === 'require') {
        showReauthModalLocal({ fromStorageObj: payload });
      } else if (type === 'clear') {
        hideReauthModalLocal();
      }
    } catch (e) {}
  }

  // on load: if localStorage says reauth required show modal.
  async function initCrossTabReauth() {
    console.debug('BOOT LOG: initCrossTabReauth init'); // at top of initCrossTabReauth
    window.addEventListener('storage', onStorageEvent, false);
    if (bc) bc.onmessage = onBroadcastMessage;

    // immediate localStorage check
    const stored = readLocal();
    if (stored) {
      // If token is stale, optionally verify with server
      if (Date.now() - (stored.ts || 0) > STALE_MS) {
        // check server for authoritative decision
        try {
          const res = await fetch((window.__SEC_API_BASE || API_BASE) + '/reauth/status', { credentials: 'include' });
          if (res && res.ok) {
            const j = await res.json().catch(()=>null);
            if (j && j.reauthRequired) {
              writeLocal(buildStoredObj({ token: j.token || stored.token, ts: j.ts || stored.ts, reason: j.reason || stored.reason }));
              showReauthModalLocal({ fromStorageObj: j });
              return;
            }
          }
        } catch (e) {}
        // If server unreachable, keep local instruction (safer)
      }
      showReauthModalLocal({ fromStorageObj: stored });
    }

    // Optional: poll server to detect reauthRequired cleared by other factors (tune as desired)
    setInterval(async () => {
      try {
        const storedNow = readLocal();
        // if nothing local, no need to poll
        if (!storedNow) return;
        const res = await fetch((window.__SEC_API_BASE || API_BASE) + '/reauth/status', { credentials: 'include' });
        if (!res) return;
        const j = await res.json().catch(()=>null);
        if (j && !j.reauthRequired) {
          // server says cleared -> perform local clear
          clearLocal(j.token);
          hideReauthModalLocal();
        }
      } catch (e) {}
    }, CHECK_STATUS_INTERVAL_MS);
  }

  // expose API hooks for your code
  window.fgReauth = {
    requireReauth,    // call to set the lock (optionally call server /reauth/require)
    completeReauth,   // call after reauth success (will call server /reauth/complete and clear local)
    isReauthRequired: () => !!readLocal()
  };

  // start
  try { initCrossTabReauth(); } catch (e) {}
})();






  async function forceInactivityCheck() {
    console.log('forceInactivityCheck called');
    if (idleTimeout) {
      clearTimeout(idleTimeout);
      idleTimeout = null;
    }
    await showInactivityPrompt();
  }

// Robust async onSuccessfulReauth — updated: clears fg_expected_reauth_at appropriately
async function onSuccessfulReauth() {
    // Clear persistent lock first
  if (window.__persistentReauthLock) {
    window.__persistentReauthLock.clearLock();
    console.log('[reauth] persistent reauth lock cleared');
  }
  try {
    // mark modal closed locally (UI state)
    reauthModalOpen = false;

    // Ensure DOM refs are current (defensive)
    try { cacheDomRefs(); } catch (e) {}

    // Read canonical token (if any) so we can avoid races
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem('fg_reauth_required_v1') || 'null'); } catch (e) { stored = null; }
    const token = stored && stored.token ? String(stored.token) : null;

    // Attempt to clear authoritative (server + broadcast) state first.
    // Prefer window.fgReauth.completeReauth() if present (cross-tab helper).
    let serverCleared = false;
    try {
      if (window.fgReauth && typeof window.fgReauth.completeReauth === 'function') {
        // await so we know server/session is cleared before touching local canonical flag
        const p = window.fgReauth.completeReauth();
        if (p && typeof p.then === 'function') {
          // await promise and interpret truthy result as success when possible
          try {
            const r = await p.catch(() => null);
            serverCleared = (r === true || r === undefined || r === null) ? true : Boolean(r);
          } catch (e) { serverCleared = false; }
        } else {
          // it's not a promise, assume it attempted to clear (best-effort)
          serverCleared = true;
        }
      } else {
        // fallback: call the server endpoint directly (best-effort)
        try {
          const res = await fetch((window.__SEC_API_BASE || API_BASE) + '/reauth/complete', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
          });
          serverCleared = !!(res && res.ok);
        } catch (e) {
          serverCleared = false;
        }
      }
    } catch (e) {
      serverCleared = false;
    }

    // Clear the local expected reauth timestamp - user just reauthenticated.
    // Do this regardless of whether server cleared canonical state, so we don't auto-trigger hard reauth now.
    try { clearExpectedReauthAt(); } catch (e) { /* ignore */ }

    // If server cleared the authoritative flag, remove the canonical local marker.
    // If server clearing failed, KEEP the canonical flag so other tabs / reloads still show modal.
    if (serverCleared) {
      try {
        // only remove canonical key if token matches (defensive against races)
        const cur = JSON.parse(localStorage.getItem('fg_reauth_required_v1') || 'null');
        if (!token || !cur || String(cur.token) === String(token)) {
          try { localStorage.removeItem('fg_reauth_required_v1'); } catch (e) {}
          try { localStorage.removeItem('reauthPending'); } catch (e) {}
          // broadcast fallback (if you have cross-tab code expecting it)
          try { if (typeof window.BroadcastChannel !== 'undefined') { const bc = new BroadcastChannel('fg-reauth'); bc.postMessage({ type: 'clear', payload: { token } }); } } catch(e){}
          try { window.dispatchEvent(new StorageEvent('storage', { key: 'fg_reauth_required_v1', newValue: null })); } catch(e){}
        } else {
          // token mismatch — do not clear; another require may have replaced the token
          console.warn('[reauth] canonical token mismatch; skipping local clear to avoid race');
        }
      } catch (e) {
        // if any error removing, just log and continue; keep canonical
        console.warn('[reauth] failed to clear local canonical flag', e);
      }
    } else {
      // If we could not clear server state, do not remove local flag — keep modal persistently visible across reloads
      console.debug('[reauth] server clear failed or unreachable — keeping canonical local flag so modal remains persistent');
    }

    // Now hide UI only if canonical key is no longer present
    function isCanonicalPending() {
      try { return !!JSON.parse(localStorage.getItem('fg_reauth_required_v1') || 'null'); } catch (e) { return false; }
    }

    try {
      if (!isCanonicalPending()) {
        if (reauthModal) {
          reauthModal.classList.add('hidden');
          try { reauthModal.removeAttribute('aria-modal'); } catch (e) {}
          try { reauthModal.removeAttribute('role'); } catch (e) {}
          if ('inert' in HTMLElement.prototype) {
            try { reauthModal.inert = false; } catch (e) {}
          } else {
            try { reauthModal.removeAttribute('aria-hidden'); reauthModal.style.pointerEvents = ''; } catch (e) {}
          }
        }
        // simple and safe: don't touch the promptModal binding, read from the DOM
        const _pm = (typeof document !== 'undefined') ? document.getElementById('promptModal') : null;
        if (_pm) {
          try {
            _pm.classList.add('hidden');
            _pm.removeAttribute('aria-hidden');
            _pm.style.pointerEvents = '';
          } catch (e) { /* ignore DOM errors */ }
        }

        reauthModalOpen = false;
      } else {
        console.debug('[reauth] canonical still present — not hiding modal locally');
      }
    } catch (e) {
      console.warn('[reauth] UI hide error', e);
    }

    // turn off global reauth active state
    try { setReauthActive(false); } catch (e) {}

    // cleanup timers / locks (same as before)
    try {
      if (window.__cachedAuthOptionsLock) { window.__cachedAuthOptionsLock = false; window.__cachedAuthOptionsLockSince = 0; }
    } catch (e) {}
    try {
      if (window.__simulatePinInterval) { clearInterval(window.__simulatePinInterval); window.__simulatePinInterval = null; }
      if (window.__simulatePinTimeout) { clearTimeout(window.__simulatePinTimeout); window.__simulatePinTimeout = null; }
    } catch (e) {}

    // Reset / clear PIN UI and re-enable inputs
    try { if (typeof resetReauthInputs === 'function') resetReauthInputs(); } catch (e) {}
    try { if (typeof disableReauthInputs === 'function') disableReauthInputs(false); } catch (e) {}

    // Hide any loader that may be left showing
    try { if (typeof hideLoader === 'function') hideLoader(); } catch (e) {}

    // Restart idle timer
    if (window.__idleDetection) {
    window.__idleDetection.reset();
  }
    try { if (typeof resetIdleTimer === 'function') resetIdleTimer(); } catch (e) {}

    // restore focus to main app
    try {
      const appRoot = document.querySelector('main') || document.body;
      if (appRoot && typeof appRoot.focus === 'function') appRoot.focus();
    } catch (e) {}

    return true;
  } catch (err) {
    // fail-safe: ensure active state is off and idle timer restarted
    try { setReauthActive(false); } catch (e) {}
    try { if (typeof resetIdleTimer === 'function') resetIdleTimer(); } catch (e) {}
    console.warn('[reauth] onSuccessfulReauth unexpected error', err);
    return false;
  }
}



  /* -----------------------
     Boot sequence
     ----------------------- */
  (async function initFlow() {
    console.debug('BOOT LOG: initFlow starting'); // at initFlow start
    console.log('initFlow started');
    try {
      {
  let pending = false;
  try { pending = !!JSON.parse(localStorage.getItem('fg_reauth_required_v1') || 'null'); } catch(e) {}
  await initReauthModal({ show: pending });
}

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

  // ---- Stable non-destructive live phone formatter (safe to place anywhere) ----
(function attachStablePhoneFormatter_Last(){
  // do not mark global attached until we've actually attached
  if (window.__phoneLiveFormatterInstalled) {
    // already installed (but not necessarily attached to element)
    return;
  }
  // mark installer so we don't run this setup twice
  window.__phoneLiveFormatterInstalled = true;

  function formatProgressiveNG(digits){
    if (digits.length <= 4) return digits;
    if (digits.length <= 7) return digits.replace(/(\d{4})(\d+)/, '$1 $2');
    return digits.replace(/(\d{4})(\d{3})(\d+)/, '$1 $2 $3');
  }

  function getPhoneEl() {
    return document.getElementById('phone-input');
  }

  function attachTo(el){
    if (!el) return false;
    // avoid re-attaching to the same element
    if (el.__stableFormatterAttached) return true;
    el.__stableFormatterAttached = true;

    // now that we actually attached, set the global "attached" flag
    try { window.__phoneLiveFormatterAttached = true; } catch(e){}
    console.log('%c📱 Phone Formatter Active', 'color: lime; font-weight: bold;');

    var composing = false;

    el.addEventListener('compositionstart', function(){ composing = true; }, false);
    el.addEventListener('compositionend', function(){ composing = false; scheduleFormat(); }, false);

    var scheduled = null;
    function scheduleFormat(){
      if (composing) return;
      if (scheduled) return;
      scheduled = setTimeout(function(){
        scheduled = null;
        try { applyFormatting(el); } catch(err){ console.error('phone format err', err); }
      }, 0);
    }

    function applyFormatting(inputEl){
      var selStart = inputEl.selectionStart || 0;
      var rawBefore = (inputEl.value.slice(0, selStart).match(/\d/g) || []).join('');
      var allDigits = (inputEl.value.match(/\d/g) || []).join('');
      var formatted = formatProgressiveNG(allDigits);

      if (formatted === inputEl.value){
        try{ inputEl.dataset.raw = allDigits; }catch(e){}
        return;
      }

      inputEl.value = formatted;
      try{ inputEl.dataset.raw = allDigits; }catch(e){}

      var dcount = 0, newPos = 0;
      if (rawBefore.length === 0) newPos = 0;
      else {
        for (var i=0;i<formatted.length;i++){
          if (/\d/.test(formatted[i])) dcount++;
          newPos = i + 1;
          if (dcount >= rawBefore.length) break;
        }
      }
      if (newPos > formatted.length) newPos = formatted.length;
      try { inputEl.setSelectionRange(newPos, newPos); } catch(e){}
    }

    el.addEventListener('input', scheduleFormat, false);
    el.addEventListener('blur', function(){ if(!composing) applyFormatting(el); }, false);

    var watch = null;
    el.addEventListener('focus', function(){
      scheduleFormat();
      if (watch) clearInterval(watch);
      watch = setInterval(function(){
        try {
          var digits = (el.value.match(/\d/g) || []).join('');
          var expected = formatProgressiveNG(digits);
          if (expected !== el.value) applyFormatting(el);
        } catch(e){}
      }, 180);
    }, false);

    el.addEventListener('blur', function(){
      if (watch){ clearInterval(watch); watch = null; }
    }, false);

    // If input element is replaced later, reattach to new one
    var mo = new MutationObserver(function(muts){
      muts.forEach(function(m){
        m.addedNodes && Array.prototype.forEach.call(m.addedNodes, function(node){
          if (node && node.id === 'phone-input' && node !== el){
            try { attachTo(node); } catch(e){}
          }
        });
      });
    });
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });

    return true;
  }
  

  // Try attach immediately or wait a bit (safe on early script execution)
  (function tryAttach(count){
    var el = getPhoneEl();
    if (el) { attachTo(el); return; }
    if (count > 60) {
      console.warn('Phone formatter: element #phone-input not found, giving up after attempts');
      return;
    }
    setTimeout(function(){ tryAttach(count+1); }, 200);
  })(0);

})();

// Ensure modal reappears on reload/back-forward (pageshow) and on visibility changes.
// Put near the bottom of dashboard.js (after initCrossTabReauth / bootstrap)
// REPLACEMENT SNIPPET: Replace the existing attachPageshowRecheck() block in dashboard.js
// Root cause: the previous pageshow re-check attempted to call `showReauthModalLocal`
// which is scoped inside the cross-tab IIFE and not exposed globally. On reload that
// left the reauth modal hidden. This snippet uses the exposed APIs (window.__reauth / fgReauth)
// and falls back to legacy functions if necessary.

(function attachPageshowRecheck_fixed(){
  const LOCAL_KEY = 'fg_reauth_required_v1';

  async function recheckShow() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return;
      let obj = null;
      try { obj = JSON.parse(raw); } catch (e) { obj = { token: raw, ts: Date.now(), reason: 'unknown' }; }

      console.debug('pageshow/visibility recheck: re-opening reauth modal (found local key)', obj);

      // Prefer the exported reauth API if available
      if (window.__reauth && typeof window.__reauth.showReauthModal === 'function') {
        try {
          // call showReauthModal in a best-effort way; it accepts either a context string or options
          await window.__reauth.showReauthModal('reauth');
          return;
        } catch (e) {
          console.warn('window.__reauth.showReauthModal failed', e);
        }
      }

      // Fallback: ask canonical cross-tab module to show (best-effort)
      if (window.fgReauth && typeof window.fgReauth.requireReauth === 'function') {
        try {
          window.fgReauth.requireReauth(obj.reason || 'pageshow');
          return;
        } catch (e) {
          console.warn('window.fgReauth.requireReauth failed', e);
        }
      }

      // Last fallback: if a local helper was somehow left in scope, call it
      if (typeof showReauthModalLocal === 'function') {
        try {
          showReauthModalLocal({ fromStorageObj: obj });
          return;
        } catch (e) {
          console.warn('showReauthModalLocal call failed', e);
        }
      }

      // If none are available, leave a debug message (no destructive action)
      console.warn('No reauth-show API available on pageshow. Reauth modal could not be re-opened automatically.');
    } catch (err) {
      console.error('pageshow recheck error', err);
    }
  }

  window.addEventListener('pageshow', recheckShow, { passive: true });
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recheckShow();
  }, { passive: true });
})();

// Event listeners for card updates
window.addEventListener('pin-status-changed', function() {
  console.log('[DEBUG] pin-status-changed: Refreshing dashboard cards');
  manageDashboardCards();
});

window.addEventListener('profile-status-changed', function() {
  console.log('[DEBUG] profile-status-changed: Refreshing dashboard cards');
  manageDashboardCards();
});

window.addEventListener('storage', function(e) {
  if (e.key === 'hasPin' || e.key === 'profileCompleted') {
    console.log('[DEBUG] storage event: Refreshing dashboard cards');
    manageDashboardCards();
  }
});

/* Balance sync V3 — pinned-position friendly (no layout moves, opacity-only, single-state) */
(function () {
  const STORAGE_KEY = 'fg_show_balance';
  const TOGGLE_SELECTORS = ['#balanceSwitch', '.balance-eye-toggle', '.security-balance-toggle', '[data-balance-toggle]'];
  const BALANCE_CARD_SELECTOR = '.balance';
  const MASK_SEL = '.balance-masked';
  const REAL_SEL = '.balance-real';

  // internal state
  let state = true;       // visible by default
  let updating = false;   // lock while applying update
  const ANIM_MS = 420;    // animation length (ms)

  function readStored() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === null) return true;
      return v === 'true';
    } catch (e) { return true; }
  }
  function writeStored(v) {
    try { localStorage.setItem(STORAGE_KEY, v ? 'true' : 'false'); } catch (e) {}
  }

  function allToggles() {
    const els = [];
    TOGGLE_SELECTORS.forEach(sel => {
      try { document.querySelectorAll(sel).forEach(el => { if (!els.includes(el)) els.push(el); }); } catch (_) {}
    });
    return els;
  }

  // Reserve min-width for balance wrapper so toggling opacity doesn't change layout
  function reserveWidths() {
    document.querySelectorAll(BALANCE_CARD_SELECTOR).forEach(card => {
      try {
        const wrapper = card.querySelector('p') || card;
        const real = card.querySelector(REAL_SEL);
        if (!wrapper || !real) return;
        // ensure wrapper is inline-block so minWidth applies
        const prevDisplay = wrapper.style.display;
        wrapper.style.display = wrapper.style.display || 'inline-block';

        // Make sure real is visible to measure accurately (temporarily)
        const prevRealOpacity = real.style.opacity;
        real.style.opacity = '1';
        // measure required width
        const needed = wrapper.offsetWidth || real.offsetWidth || 0;
        if (needed) wrapper.style.minWidth = wrapper.style.minWidth || `${needed}px`;
        // restore
        real.style.opacity = prevRealOpacity || (state ? '1' : '0');
        // Defensive: ensure mask has initial opacity (if not set)
        const mask = card.querySelector(MASK_SEL);
        if (mask && (mask.style.opacity === '')) mask.style.opacity = state ? '0' : '1';
      } catch (e) { /* ignore measurement failures */ }
    });
  }

  function animateEyeBtn(btn, visible) {
    if (!btn) return;
    const openSvg = btn.querySelector('.eye-open-svg');
    const closedSvg = btn.querySelector('.eye-closed-svg');
    if (openSvg && closedSvg) {
      openSvg.style.transition = openSvg.style.transition || 'transform 420ms cubic-bezier(.2,.9,.3,1), opacity 320ms ease';
      closedSvg.style.transition = closedSvg.style.transition || 'transform 420ms cubic-bezier(.2,.9,.3,1), opacity 320ms ease';
      requestAnimationFrame(() => {
        if (visible) {
          openSvg.style.transform = 'translate(-50%,-50%) scaleY(1)'; openSvg.style.opacity = '1';
          closedSvg.style.transform = 'translate(-50%,-50%) scaleY(.25)'; closedSvg.style.opacity = '0';
        } else {
          openSvg.style.transform = 'translate(-50%,-50%) scaleY(.25)'; openSvg.style.opacity = '0';
          closedSvg.style.transform = 'translate(-50%,-50%) scaleY(1)'; closedSvg.style.opacity = '1';
        }
      });
    } else {
      if (visible) btn.classList.remove('eye-closed'); else btn.classList.add('eye-closed');
    }
  }

  function applyToAllToggles(visible) {
    const toggles = allToggles();
    toggles.forEach(btn => {
      try {
        if (btn.id === 'balanceSwitch') {
          btn.setAttribute('aria-checked', visible ? 'true' : 'false');
          if (visible) btn.classList.remove('off'); else btn.classList.add('off');
        } else {
          btn.setAttribute('aria-pressed', visible ? 'false' : 'true');
          btn.setAttribute('data-balance-visible', visible ? 'true' : 'false');
        }
        animateEyeBtn(btn, visible);
      } catch (e) {}
    });
  }

  // Core: toggle opacity only — NO display changes, NO positioning changes
  function applyToBalances(visible) {
    const cards = Array.from(document.querySelectorAll(BALANCE_CARD_SELECTOR));
    cards.forEach(card => {
      try {
        const mask = card.querySelector(MASK_SEL);
        const real = card.querySelector(REAL_SEL);

        if (real && mask) {
          // Ensure transitions present (only opacity)
          real.style.transition = real.style.transition || `opacity ${ANIM_MS}ms ease`;
          mask.style.transition = mask.style.transition || `opacity ${Math.floor(ANIM_MS * 0.66)}ms ease`;

          // Do not change display/layout. Only animate opacity and pointer-events.
          if (visible) {
            // Make real visible (opacity), mask hidden (opacity 0)
            real.style.opacity = '1';
            mask.style.opacity = '0';
            // pointer events toggled after a short delay so immediate clicks don't hit hidden element
            setTimeout(() => { real.style.pointerEvents = ''; mask.style.pointerEvents = 'none'; }, 30);
          } else {
            mask.style.opacity = '1';
            real.style.opacity = '0';
            setTimeout(() => { mask.style.pointerEvents = ''; real.style.pointerEvents = 'none'; }, 30);
          }
        } else {
          // fallback: toggle visibility property for safety (keeps layout)
          const valueEl = card.querySelector('[data-balance]') || card.querySelector('.amount') || card.querySelector('p');
          if (valueEl) {
            valueEl.style.visibility = visible ? 'visible' : 'hidden';
          }
        }
      } catch (e) {}
    });
  }

  // authoritative updater — idempotent
  function updateAll(visible, source = 'program') {
    if (state === !!visible) return;
    state = !!visible;
    updating = true;

    // Apply reserved widths only once (helps prevent jumps)
    reserveWidths();

    // optimistically apply UI
    applyToAllToggles(state);
    applyToBalances(state);

    // persist new state
    writeStored(state);

    // small reapply to override other handlers
    setTimeout(() => { applyToAllToggles(state); applyToBalances(state); }, 40);

    // unlock after animations expected to complete
    setTimeout(() => { updating = false; }, ANIM_MS + 60);

    // notify others
    try { window.dispatchEvent(new CustomEvent('fg:balance-visibility-changed', { detail: { visible: state, source } })); } catch(e) {}
  }

  // capture-phase UI handler to prevent conflicting handlers
  function uiHandler(e) {
    if (e.button && e.button !== 0) return;
    try { e.stopImmediatePropagation(); } catch (err) {}
    e.preventDefault();

    if (updating) return;
    const next = !state;
    updateAll(next, 'user');
  }

  function wire() {
    const toggles = allToggles();
    toggles.forEach(el => {
      if (el.__balanceSyncBound) return;
      el.addEventListener('click', uiHandler, { passive: false, capture: true });
      el.addEventListener('keydown', (ev) => {
        if (ev.key === ' ' || ev.key === 'Enter') {
          try { ev.stopImmediatePropagation(); } catch(_) {}
          ev.preventDefault();
          if (!updating) updateAll(!state, 'keyboard');
        }
      }, { passive: false, capture: true });
      el.__balanceSyncBound = true;
    });
  }

  function init() {
    // measure and reserve widths after fonts.ready if available
    const start = () => {
      reserveWidths();
      state = readStored();
      applyToAllToggles(state);
      applyToBalances(state);
      wire();

      // observe dynamic inserts
      const mo = new MutationObserver((mutations) => {
        let needsReserve = false, needsWire = false;
        for (const m of mutations) {
          if (!m.addedNodes) continue;
          for (const n of m.addedNodes) {
            if (n.nodeType !== 1) continue;
            try {
              if (n.matches && n.matches(BALANCE_CARD_SELECTOR)) needsReserve = true;
              if (n.querySelector && n.querySelector(BALANCE_CARD_SELECTOR)) needsReserve = true;
              if (TOGGLE_SELECTORS.some(s => { try { return n.matches && n.matches(s); } catch(_) { return false; } })) needsWire = true;
              if (n.querySelector && TOGGLE_SELECTORS.some(s => n.querySelector(s))) needsWire = true;
            } catch (_) {}
          }
        }
        if (needsReserve) setTimeout(reserveWidths, 30);
        if (needsWire) setTimeout(wire, 30);
      });
      try { mo.observe(document.body, { subtree: true, childList: true }); } catch (e) {}
    };

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(start).catch(start);
    } else {
      setTimeout(start, 20);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 10);

  // public API
  window.__fg_balance_visibility = {
    isVisible: () => state,
    set: (v) => updateAll(!!v, 'api'),
    toggle: () => { if (!updating) updateAll(!state, 'api-toggle'); }
  };
})();

updateContinueState();





})();