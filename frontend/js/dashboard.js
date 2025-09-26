import { mtnAwoofPlans, mtnGiftingPlans, airtelAwoofPlans, airtelCgPlans, gloCgPlans, gloGiftingPlans, ninemobilePlans } from './dataPlans.js';

window.__SEC_API_BASE = 'https://api.flexgig.com.ng'

// Your project URL and anon key (get them from Supabase dashboard → Project Settings → API)
const SUPABASE_URL = 'https://bwmappzvptcjxlukccux.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3bWFwcHp2cHRjanhsdWtjY3V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0OTMzMjcsImV4cCI6MjA3MTA2OTMyN30.Ra7k6Br6nl1huQQi5DpDuOQSDE-6N1qlhUIvIset0mc';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


const updateProfileModal = document.getElementById('updateProfileModal');
if (updateProfileModal && updateProfileModal.classList.contains('active')) {
  openUpdateProfileModal();
}



// --- Fetch User Data ---
// --- Fetch User Data ---
// --- Robust getSession() with guarded updates and stable avatar handling ---
async function getSession() {
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

    // Fade out shimmer loaders smoothly
    [greetEl, firstnameEl, avatarEl].forEach(el => {
      if (el.firstChild && el.firstChild.classList?.contains('loading-blur')) {
        el.firstChild.classList.add('fade-out');
        setTimeout(() => (el.innerHTML = ''), 200); // remove after fade-out
      }
    });

    // Greeting text
    const hour = new Date().getHours();
    greetEl.textContent =
      hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    greetEl.classList.add('fade-in');

    // Display name
    const displayName = userObj.username || derivedFirstName || 'User';
    firstnameEl.textContent =
      displayName.charAt(0).toUpperCase() + displayName.slice(1);
    firstnameEl.classList.add('fade-in');

    // Avatar
    const profilePicture = userObj.profilePicture || '';
    if (isValidImageSource(profilePicture)) {
      avatarEl.innerHTML = `<img src="${profilePicture}" 
        alt="Profile Picture" 
        class="avatar-img fade-in" 
        style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
      avatarEl.removeAttribute('aria-label');
    } else {
      avatarEl.textContent = displayName.charAt(0).toUpperCase();
      avatarEl.classList.add('fade-in');
      avatarEl.setAttribute('aria-label', displayName);
    }
  }

  async function waitForDomReady(retries = 8, delay = 100) {
    for (let i = 0; i < retries; i++) {
      if (
        document.getElementById('greet') &&
        document.getElementById('firstname') &&
        document.getElementById('avatar')
      ) {
        return true;
      }
      await new Promise(r => setTimeout(r, delay));
    }
    return false;
  }

  try {
    // Show shimmer placeholders while loading
    const greetEl = document.getElementById('greet');
    const firstnameEl = document.getElementById('firstname');
    const avatarEl = document.getElementById('avatar');

    if (greetEl && firstnameEl && avatarEl) {
      greetEl.innerHTML = '<div class="loading-blur"></div>';
      firstnameEl.innerHTML = '<div class="loading-blur"></div>';
      avatarEl.innerHTML = '<div class="loading-blur avatar-loader"></div>';
    }

    console.log('[DEBUG] getSession: Initiating fetch', new Date().toISOString());
    let token = localStorage.getItem('authToken') || '';
    let res = await fetch('https://api.flexgig.com.ng/api/session', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('[DEBUG] getSession: Response status', res.status);

    if (res.status === 401 && token) {
      console.log('[DEBUG] getSession: Token expired, attempting refresh');
      const refreshRes = await fetch('https://api.flexgig.com.ng/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      if (refreshRes.ok) {
        const { token: newToken } = await refreshRes.json();
        localStorage.setItem('authToken', newToken);
        token = newToken;
        res = await fetch('https://api.flexgig.com.ng/api/session', {
          method: 'GET',
          credentials: 'include',
          headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
        });
      } else {
        console.error('[ERROR] getSession: Refresh failed', await refreshRes.text());
        return null;
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[ERROR] getSession: Session API returned error:', res.status, text);
      return null;
    }

    const { user = {}, token: newToken } = await res.json();
    console.log('[DEBUG] getSession: Raw user data', user, 'Token', newToken);

    let firstName = user.fullName?.split(' ')[0] || '';
    if (!firstName && user.email) {
      firstName = user.email
        .split('@')[0]
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/(\d+)/, '');
      firstName =
        (firstName && firstName.charAt(0).toUpperCase() + firstName.slice(1)) ||
        'User';
    }

    try {
      localStorage.setItem('userEmail', user.email || '');
      localStorage.setItem('firstName', firstName);
      localStorage.setItem('username', user.username || '');
      localStorage.setItem('phoneNumber', user.phoneNumber || '');
      localStorage.setItem('address', user.address || '');
      localStorage.setItem(
        'fullName',
        user.fullName || (user.email ? user.email.split('@')[0] : '')
      );
      localStorage.setItem('fullNameEdited', user.fullNameEdited ? 'true' : 'false');
      localStorage.setItem('lastUsernameUpdate', user.lastUsernameUpdate || '');
      localStorage.setItem('profilePicture', user.profilePicture || '');
      localStorage.setItem('authToken', newToken);
      localStorage.setItem(
        'authTokenData',
        JSON.stringify({ user, authToken: newToken })
      );
      console.log('[DEBUG] getSession: Stored authToken and authTokenData');
    } catch (err) {
      console.warn('[WARN] getSession: Failed to write some localStorage keys', err);
    }

    const domReady = await waitForDomReady();
    if (!domReady) {
      console.warn('[WARN] getSession: DOM elements not ready after waiting');
    }

    applySessionToDOM(user, firstName);

    if (typeof loadUserProfile === 'function') {
      try {
        const profileResult = await loadUserProfile();
        if (window.__lastSessionLoadId !== loadId) {
          console.log('[DEBUG] getSession: loadUserProfile result is stale, ignoring');
          return null;
        }
        const profileData =
          profileResult && typeof profileResult === 'object'
            ? profileResult
            : {
                profilePicture:
                  localStorage.getItem('profilePicture') || user.profilePicture || ''
              };
        const finalProfilePicture = isValidImageSource(profileData.profilePicture)
          ? profileData.profilePicture
          : isValidImageSource(user.profilePicture)
          ? user.profilePicture
          : '';
        if (
          finalProfilePicture &&
          finalProfilePicture !== (localStorage.getItem('profilePicture') || '')
        ) {
          try {
            localStorage.setItem('profilePicture', finalProfilePicture);
          } catch (err) {
            /* ignore */
          }
          applySessionToDOM({ ...user, profilePicture: finalProfilePicture }, firstName);
        } else {
          applySessionToDOM(
            { ...user, profilePicture: finalProfilePicture || user.profilePicture },
            firstName
          );
        }
      } catch (err) {
        console.warn(
          '[WARN] getSession: loadUserProfile failed, relying on session data',
          err && err.message
        );
        applySessionToDOM(user, firstName);
      }
    } else {
      applySessionToDOM(user, firstName);
    }

    console.log('[DEBUG] getSession: Completed (loadId=' + loadId + ')');
    return { user, authToken: newToken };
  } catch (err) {
    console.error('[ERROR] getSession: Failed to fetch session', err);
    return null;
  }
}

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

// Remove fetchUserData and consolidate into getSession
async function loadUserProfile(noCache = false) {
  try {
    console.log('[DEBUG] loadUserProfile: Initiating fetch, credentials: include, time:', new Date().toISOString());

    const headers = { 'Accept': 'application/json' };
    const token = localStorage.getItem('authToken');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      console.log('[DEBUG] loadUserProfile: Authorization header:', headers['Authorization']);
    } else {
      console.log('[DEBUG] loadUserProfile: No token found in localStorage');
    }

    let url = 'https://api.flexgig.com.ng/api/profile';
    if (noCache) {
      url += `?_${Date.now()}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers
    });

    console.log('[DEBUG] loadUserProfile: Response status', response.status, 'Headers', [...response.headers]);

    const rawText = await response.text().catch(() => '');
    let parsedData = null;
    try {
      parsedData = rawText ? JSON.parse(rawText) : null;
    } catch (e) {
      console.warn('[WARN] loadUserProfile: Response is not valid JSON');
    }

    if (!response.ok) {
      console.error('[ERROR] Profile update failed. Status:', response.status, 'Body:', parsedData || rawText);
      const serverMsg = (parsedData && (parsedData.error || parsedData.message)) || rawText || `HTTP ${response.status}`;
      throw new Error(serverMsg);
    }

    const data = parsedData || {};
    console.log('[DEBUG] loadUserProfile: Parsed response data', data);

    // Update localStorage with profile data only if it differs
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

    // Update DOM only if data has changed
    const firstnameEl = document.getElementById('firstname');
    const avatarEl = document.getElementById('avatar');
    if (!firstnameEl || !avatarEl) {
      console.error('[ERROR] loadUserProfile: Missing DOM elements', { firstnameEl: !!firstnameEl, avatarEl: !!avatarEl });
      return;
    }

    const firstName = data.fullName?.split(' ')[0] || localStorage.getItem('firstName') || 'User';
    const profilePicture = data.profilePicture || localStorage.getItem('profilePicture') || '';
    const isValidProfilePicture = profilePicture && /^(data:image\/|https?:\/\/|\/)/i.test(profilePicture);
    const displayName = data.username || firstName || 'User';

    if (firstnameEl.textContent !== displayName.charAt(0).toUpperCase() + displayName.slice(1)) {
      firstnameEl.textContent = displayName.charAt(0).toUpperCase() + displayName.slice(1);
    }

    if (isValidProfilePicture && avatarEl.innerHTML !== `<img src="${profilePicture}" alt="Profile Picture" class="avatar-img" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`) {
      avatarEl.innerHTML = `<img src="${profilePicture}" alt="Profile Picture" class="avatar-img" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
    } else if (!isValidProfilePicture && avatarEl.textContent !== displayName.charAt(0).toUpperCase()) {
      avatarEl.innerHTML = '';
      avatarEl.textContent = displayName.charAt(0).toUpperCase();
    }

    console.log('[DEBUG] loadUserProfile: DOM updated', { displayName, profilePicture });

    if (updateProfileModal.classList.contains('active')) {
      openUpdateProfileModal(data);
    }
  } catch (err) {
    console.error('[ERROR] loadUserProfile: Failed to fetch profile', err.message);

    const firstnameEl = document.getElementById('firstname');
    const avatarEl = document.getElementById('avatar');
    if (!firstnameEl || !avatarEl) {
      console.error('[ERROR] loadUserProfile: Missing DOM elements in catch block', { firstnameEl: !!firstnameEl, avatarEl: !!avatarEl });
      return;
    }

    const firstName = localStorage.getItem('firstName') || 'User';
    const profilePicture = localStorage.getItem('profilePicture') || '';
    const isValidProfilePicture = profilePicture && /^(data:image\/|https?:\/\/|\/)/i.test(profilePicture);
    const displayName = localStorage.getItem('username') || firstName || 'User';

    if (firstnameEl.textContent !== displayName.charAt(0).toUpperCase() + displayName.slice(1)) {
      firstnameEl.textContent = displayName.charAt(0).toUpperCase() + displayName.slice(1);
    }

    if (isValidProfilePicture && avatarEl.innerHTML !== `<img src="${profilePicture}" alt="Profile Picture" class="avatar-img" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`) {
      avatarEl.innerHTML = `<img src="${profilePicture}" alt="Profile Picture" class="avatar-img" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
    } else if (!isValidProfilePicture && avatarEl.textContent !== displayName.charAt(0).toUpperCase()) {
      avatarEl.innerHTML = '';
      avatarEl.textContent = displayName.charAt(0).toUpperCase();
    }
  }
}





async function openPinModalForReauth() {
  try {
    const res = await fetch('https://api.flexgig.com.ng/api/session', {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) {
      console.error('[dashboard.js] openPinModalForReauth: Session invalid');
      window.location.href = '/'; // Redirect if session is invalid
      return;
    }
    const { user } = await res.json();
    if (!user.pin) {
      console.log('[dashboard.js] No PIN set, redirecting to PIN creation');
      pinModal.classList.remove('hidden');
      pinTitle.textContent = 'Create PIN';
      pinSubtitle.textContent = 'Create a 4-digit PIN';
      step = 'create';
      resetInputs();
    } else {
      pinModal.classList.remove('hidden');
      pinTitle.textContent = 'Re-enter PIN';
      pinSubtitle.textContent = 'Enter your 4-digit PIN to continue';
      resetInputs();
      step = 'reauth';
    }
    console.log('[dashboard.js] PIN modal opened for:', user.pin ? 're-authentication' : 'PIN creation');
  } catch (err) {
    console.error('[dashboard.js] openPinModalForReauth error:', err);
    window.location.href = '/';
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


  // --- BALANCE MANAGEMENT ---
  let userBalance = parseFloat(localStorage.getItem('userBalance')) || 50000; // Initialize to ₦50,000
  const balanceEl = document.querySelector('.balance p');

  function updateBalanceDisplay() {
      // Format with commas + 2 decimal places
    balanceEl.textContent = `₦${userBalance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    localStorage.setItem('userBalance', userBalance);
    console.log('[DEBUG] updateBalanceDisplay: Balance updated:', userBalance);
  }

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
  }

  if (step === 'reauth') {
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
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`, // Assumes token is stored temporarily during session
      },
      credentials: 'include',
    });
    if (!res.ok) {
      __fg_pin_log.e('Error checking PIN existence:', await res.text());
      return null;
    }
    const { hasPin } = await res.json();
    if (hasPin) {
      __fg_pin_log.d('PIN found in users.pin');
      return { table: 'users', column: 'pin' }; // Standardize to users(pin)
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !user.id) throw new Error('No signed-in user');
      return { uid: user.id, email: user.email };
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
        'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
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
  async function updateStoredPin(uid, newPin) {
  try {
    const response = await fetch('https://api.flexgig.com.ng/api/save-pin', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ pin: newPin }),
    });
    if (!response.ok) {
      const { error } = await response.json();
      console.error('[PinModal] PIN update failed:', error?.message || await response.text());
      return { ok: false, error: error?.message || 'Failed to update PIN' };
    }
    console.log('[PinModal] PIN updated successfully');
    return { ok: true };
  } catch (err) {
    console.error('[PinModal] Error updating PIN:', err);
    return { ok: false, error: err.message };
  }
}

  // Re-authenticate with PIN
  async function reAuthenticateWithPin(uid, pin, callback) {
  try {
    const found = await findStoredPin(uid);
    if (!found) {
      notify('No PIN set. Please set a PIN first.', 'error', pinVerifyAlert, pinVerifyAlertMsg);
      return false;
    }
    const res = await fetch('https://api.flexgig.com.ng/api/verify-pin', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pin }),
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

  // Inactivity handling
  function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    clearTimeout(inactivityPopupTimer);
    inactivityTimer = setTimeout(() => {
      window.ModalManager.openModal('inactivityModal');
      inactivityPopupTimer = setTimeout(() => {
        window.ModalManager.closeModal('inactivityModal');
        window.checkPinExists((hasPin) => {
          if (hasPin) {
            window.ModalManager.openModal('pinVerifyModal');
          } else {
            window.ModalManager.openModal('pinModal');
          }
        }, 'inactivity');
      }, 30 * 1000);
    }, 10 * 60 * 1000);
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
  const upd = await updateStoredPin(info.uid, found.table, found.column, pin);
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
        if (found.value !== currentPin) {
          notify('Current PIN is incorrect', 'error');
          return;
        }
        notify('Updating PIN...', 'info');
        const upd = await updateStoredPin(info.uid, found.table, found.column, newPin);
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
  function initInactivity() {
    const events = ['click', 'keypress', 'scroll', 'mousemove', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, resetInactivityTimer, { passive: true });
    });
    resetInactivityTimer();
    if (inactivityConfirmBtn) {
      inactivityConfirmBtn.addEventListener('click', () => {
        window.ModalManager.closeModal('inactivityModal');
        clearTimeout(inactivityPopupTimer);
        resetInactivityTimer();
      });
    }
  }

  // Initialize on page load
  function boot() {
    log.d('Booting PIN and security module');
    initPinModal();
    initPinVerifyModal();
    initSecurityPinModal();
    initCheckoutPin();
    initInactivity();

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
    saveProfileBtn.innerHTML = '<div class="loader"></div>'; // Replace with spinner (CSS required)

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
  };

  updateProfileForm.addEventListener('submit', 
updateProfileForm.__submitHandler);
}

// Profile-specific phone number functions
function isNigeriaMobileProfile(phone) {
  const cleaned = phone.replace(/\s/g, '');
  return /^0[789][01]\d{8}$/.test(cleaned) && Object.values(providerPrefixes).flat().includes(cleaned.slice(0, 4));
}

function normalizePhoneProfile(input) {
  if (!input) return '';
  const digits = input.replace(/\D/g, '');
  if (/^234[789]/.test(digits)) return '0' + digits.slice(3);
  if (/^\+234[789]/.test(digits)) return '0' + digits.slice(4);
  if (/^[789]/.test(digits)) return '0' + digits;
  return digits;
}

function formatNigeriaNumberProfile(input, isInitialDigit = false, isPaste = false) {
  const normalized = normalizePhoneProfile(input);
  if (!normalized) return { value: '', cursorOffset: 0 };
  let formatted = normalized;
  if (isInitialDigit && !normalized.startsWith('0')) {
    formatted = '0' + normalized;
  }
  if (formatted.length > 11) {
    formatted = formatted.slice(0, 11);
  }
  if (formatted.length > 3) {
    formatted = formatted.slice(0, 4) + ' ' + formatted.slice(4);
  }
  if (formatted.length > 8) {
    formatted = formatted.slice(0, 8) + ' ' + formatted.slice(8);
  }
  return { value: formatted, cursorOffset: isPaste ? formatted.length : 0 };
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

async function checkUsernameAvailability(username) {
  if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    isUsernameAvailable = false;
    return false;
  }

  try {
    const response = await fetch('https://api.flexgig.com.ng/api/profile/check-username', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
      },
      body: JSON.stringify({ username }),
      credentials: 'include',
    });

    let rawText = '';
    let parsedData = null;
    try {
      rawText = await response.text();
      parsedData = rawText ? JSON.parse(rawText) : null;
    } catch (e) {
      console.warn('[WARN] checkUsernameAvailability: Response is not valid JSON');
    }

    if (!response.ok) {
      console.error('[ERROR] checkUsernameAvailability: Failed response', response.status, parsedData || rawText);
      const serverMsg = (parsedData && (parsedData.error || parsedData.message)) || rawText || `HTTP ${response.status}`;
      throw new Error(serverMsg);
    }

    const data = parsedData || {};
    isUsernameAvailable = !!data.available;
    console.log('[DEBUG] checkUsernameAvailability:', { username, available: isUsernameAvailable });
    return isUsernameAvailable;

  } catch (err) {
    console.error('[ERROR] checkUsernameAvailability:', err.message || err);
    isUsernameAvailable = false;
    return false;
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
    case 'fullName':
      if (value.trim().length < 2 || !/^[a-zA-Z\s]{2,}$/.test(value)) {
        errorElement.textContent = 'Full name must be at least 2 characters and contain only letters';
        errorElement.classList.add('active');
        inputElement.classList.add('invalid');
        isValid = false;
      } else {
        errorElement.textContent = '';
        errorElement.classList.remove('active');
        inputElement.classList.remove('invalid');
      }
      break;
    case 'username':
      const lastUpdate = localStorage.getItem('lastUsernameUpdate');
      const currentUsername = localStorage.getItem('username') || '';
      if (value !== currentUsername && lastUpdate) {
        const daysSinceUpdate = (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate < 90) {
          errorElement.textContent = `You can update your username again in ${Math.ceil(90 - daysSinceUpdate)} days`;
          errorElement.classList.add('active');
          inputElement.classList.add('invalid');
          isValid = false;
          break;
        }
      }
      if (value.trim().length < 3 || !/^[a-zA-Z0-9_]{3,20}$/.test(value)) {
        errorElement.textContent = 'Username must be 3-20 characters and contain only letters, numbers, or underscores';
        errorElement.classList.add('active');
        inputElement.classList.add('invalid');
        isValid = false;
      } else if (!isUsernameAvailable) {
        errorElement.textContent = 'Username is already taken or invalid';
        errorElement.classList.add('active');
        inputElement.classList.add('invalid');
        isValid = false;
      } else {
        errorElement.textContent = '';
        errorElement.classList.remove('active');
        inputElement.classList.remove('invalid');
      }
      break;
    case 'phoneNumber':
      const cleaned = value.replace(/\s/g, '');
      if (cleaned && !isNigeriaMobileProfile(cleaned)) {
        errorElement.textContent = 'Please enter a valid Nigerian phone number';
        errorElement.classList.add('active');
        inputElement.classList.add('invalid');
        isValid = false;
      } else {
        errorElement.textContent = '';
        errorElement.classList.remove('active');
        inputElement.classList.remove('invalid');
      }
      break;
    case 'address': {
      const trimmed = value.trim();

      // Empty address is allowed (until user types something or on submit you want to enforce)
      if (!trimmed) {
        errorElement.textContent = '';
        errorElement.classList.remove('active');
        inputElement.classList.remove('invalid');
        break;
      }

      // If non-empty, run validation rules
      if (trimmed.length < 5) {
        errorElement.textContent = 'Address must be at least 5 characters long';
        errorElement.classList.add('active');
        inputElement.classList.add('invalid');
        isValid = false;
      } else if (!/^[a-zA-Z0-9\s,.\-#]+$/.test(trimmed)) {
        // note: allow comma, dot, dash, hash
        errorElement.textContent = 'Address contains invalid characters';
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
  if (fullNameInput && !fullNameInput.disabled) {
    const fullNameHandler = (e) => {
      fieldTouched.fullName = true;
      const value = (fullNameInput.value || '').trim();
      let error = '';

      if (value.length > 0) {
        if (!/^[a-zA-Z\s'-]+$/.test(value)) {
          error = 'Full name can only contain letters, spaces, hyphens, or apostrophes';
        } else if (value.length < 2) {
          error = 'Full name must be at least 2 characters';
        } else if (value.length > 50) {
          error = 'Full name cannot exceed 50 characters';
        }
      }

      if (error) {
        fullNameError && fullNameError.classList.add('active') && (fullNameError.textContent = error);
        fullNameInput.classList.add('invalid');
      } else {
        fullNameError && (fullNameError.textContent = ''), fullNameError && fullNameError.classList.remove('active');
        fullNameInput.classList.remove('invalid');
      }
      validateProfileForm(true);
    };
    fullNameInput.addEventListener('input', fullNameHandler);
    fullNameInput.__profileHandlers = { ...(fullNameInput.__profileHandlers || {}), input: fullNameHandler };
  }

  // --- username (debounced availability check) ---
  if (usernameInput && !usernameInput.disabled) {
    const usernameHandler = debounce(async (e) => {
      fieldTouched.username = true;
      const val = (usernameInput.value || '').trim();
      validateField('username');

      // only check if looks like a valid username and different from stored username
      const currentUsername = localStorage.getItem('username') || '';
      if (val && val !== currentUsername) {
        try {
          await checkUsernameAvailability(val);
          if (!isUsernameAvailable) {
            if (usernameError) {
              usernameError.textContent = 'Username is already taken';
              usernameError.classList.add('active');
              usernameInput.classList.add('invalid');
            }
          } else {
            if (usernameError) {
              usernameError.textContent = '';
              usernameError.classList.remove('active');
              usernameInput.classList.remove('invalid');
            }
          }
        } catch (err) {
          console.warn('username availability check error', err);
        }
      }
      validateProfileForm(true);
    }, 300);

    usernameInput.addEventListener('input', usernameHandler);
    usernameInput.__profileHandlers = { ...(usernameInput.__profileHandlers || {}), input: usernameHandler };
  }

  // --- phone number: paste + input handlers (same logic you had inline) ---
  if (phoneNumberInput && !phoneNumberInput.disabled) {
    const pasteHandler = (ev) => {
      const pasted = (ev.clipboardData || window.clipboardData).getData('text') || '';
      const digits = pasted.replace(/\D/g, '').slice(0, 11); // 11 raw digits
      if (!digits.length) {
        ev.preventDefault();
        return;
      }
      ev.preventDefault();
      const start = phoneNumberInput.selectionStart ?? phoneNumberInput.value.length;
      const end = phoneNumberInput.selectionEnd ?? phoneNumberInput.value.length;
      const newRaw = (phoneNumberInput.value.slice(0, start) + digits + phoneNumberInput.value.slice(end)).replace(/\D/g, '').slice(0, 11);
      const { value: formatted } = formatNigeriaNumberProfile(newRaw, true, true);
      phoneNumberInput.value = formatted;
      phoneNumberInput.setSelectionRange(formatted.length, formatted.length);
      fieldTouched.phoneNumber = true;
      validateField('phoneNumber');
      validateProfileForm(true);
    };

    const phoneInputHandler = debounce((e) => {
      const cursorPosition = phoneNumberInput.selectionStart;
      const rawInput = (phoneNumberInput.value || '').replace(/\s/g, '');
      const isInitialDigit = rawInput.length === 1 && /^[789]$/.test(rawInput);
      const isDelete = e && (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward');

      if (!rawInput && isDelete) {
        phoneNumberInput.classList.remove('invalid');
        if (phoneNumberError) { phoneNumberError.textContent = ''; phoneNumberError.classList.remove('active'); }
        validateProfileForm(true);
        return;
      }

      const normalized = normalizePhoneProfile(rawInput);
      if (!normalized && rawInput) {
        phoneNumberInput.value = rawInput;
        phoneNumberInput.classList.add('invalid');
        if (phoneNumberError) {
          phoneNumberError.textContent = 'Invalid phone number';
          phoneNumberError.classList.add('active');
        }
        validateProfileForm(true);
        return;
      }

      let finalNormalized = normalized || '';
      if (finalNormalized.length > 11) finalNormalized = finalNormalized.slice(0, 11);

      const { value: formatted } = formatNigeriaNumberProfile(finalNormalized, isInitialDigit, false);
      phoneNumberInput.value = formatted;

      const prefix = finalNormalized.slice(0, 4);
      const validPrefixes = Object.values(providerPrefixes).flat();
      const prefixError = finalNormalized.length >= 4 && !validPrefixes.includes(prefix);
      phoneNumberInput.classList.toggle('invalid', !!prefixError);

      if (phoneNumberError) {
        phoneNumberError.textContent = prefixError ? (finalNormalized.length === 4 ? 'Invalid phone number prefix' : 'Invalid phone number') : '';
        phoneNumberError.classList.toggle('active', !!prefixError);
      }

      fieldTouched.phoneNumber = true;
      validateField('phoneNumber');
      validateProfileForm(true);

      if (finalNormalized.length === 11 && isNigeriaMobileProfile(finalNormalized)) {
        phoneNumberInput.blur();
      }
    }, 50);

    phoneNumberInput.addEventListener('paste', pasteHandler);
    phoneNumberInput.addEventListener('input', phoneInputHandler);
    phoneNumberInput.__profileHandlers = { ...(phoneNumberInput.__profileHandlers || {}), paste: pasteHandler, input: phoneInputHandler };

    // keep maxLength for formatted value (11 digits + 2 spaces)
    phoneNumberInput.maxLength = 13;
  }

  // --- address (simple debounce validation) ---
  if (addressInput && !addressInput.disabled) {
    const addressHandler = debounce(() => {
      fieldTouched.address = true;
      validateField('address');
      validateProfileForm(true);
    }, 150);
    addressInput.addEventListener('input', addressHandler);
    addressInput.__profileHandlers = { ...(addressInput.__profileHandlers || {}), input: addressHandler };
  }

  // Note: There's a global profilePicture change handler already wired outside the modal.
  // See your global handler at the bottom of the file — if you move that into this attach function,
  // remove the global one to avoid duplication. (Global handler location: see file). :contentReference[oaicite:1]{index=1}
}




function openUpdateProfileModal(profile) {
  if (!updateProfileModal || !updateProfileForm) {
    console.error('[ERROR] openUpdateProfileModal: Modal or form not found');
    return;
  }
  updateProfileModal.style.display = 'block';
  setTimeout(() => {
    updateProfileModal.classList.add('active');
    updateProfileModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }, 10);

  // Set form fields
  const fullName = profile?.fullName || localStorage.getItem('fullName') || localStorage.getItem('userEmail')?.split('@')[0] || '';
  const username = profile?.username || localStorage.getItem('username') || '';
  const phoneNumber = profile?.phoneNumber || localStorage.getItem('phoneNumber') || '';
  const email = profile?.email || localStorage.getItem('userEmail') || '';
  if (fullNameInput) fullNameInput.value = fullName;
  if (usernameInput) usernameInput.value = username;
  if (phoneNumberInput) phoneNumberInput.value = phoneNumber ? formatNigeriaNumberProfile(phoneNumber).value : '';
  if (emailInput) emailInput.value = email;
  if (addressInput) addressInput.value = profile?.address || localStorage.getItem('address') || '';

  // Disable fields based on server rules
  if (fullNameInput) fullNameInput.disabled = localStorage.getItem('fullNameEdited') === 'true';
  if (phoneNumberInput) phoneNumberInput.disabled = !!phoneNumber;
  if (emailInput) emailInput.disabled = true;
  if (addressInput) addressInput.disabled = !!(profile?.address || localStorage.getItem('address')?.trim());
  if (profilePictureInput) profilePictureInput.disabled = false; // Always editable

  // Set avatar
  const profilePicture = localStorage.getItem('profilePicture');
  const isValidProfilePicture = profilePicture && (profilePicture.startsWith('data:image/') || profilePicture.startsWith('https://'));
  const displayName = username || fullName.split(' ')[0] || 'User';
  if (profilePicturePreview) {
    if (isValidProfilePicture) {
      profilePicturePreview.innerHTML = `<img src="${profilePicture}" alt="Profile Picture" class="avatar-img" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
    } else {
      profilePicturePreview.innerHTML = '';
      profilePicturePreview.textContent = displayName.charAt(0).toUpperCase();
    }
  }

  // Reset error messages, touched states, and invalid classes
  [fullNameError, usernameError, phoneNumberError, addressError, profilePictureError].forEach(error => {
    if (error) {
      error.textContent = '';
      error.classList.remove('active');
    }
  });
  [fullNameInput, usernameInput, phoneNumberInput, addressInput].forEach(input => {
    if (input) input.classList.remove('invalid');
  });
  Object.keys(fieldTouched).forEach(key => fieldTouched[key] = false);

  // remove previously attached handlers (reliable)
  detachProfileListeners();

  // attach modal-specific handlers (single source of truth)
  attachProfileListeners();


  // Add input listeners for live validation
  // Add input listeners for live validation
if (fullNameInput) {
  const fullNameAlreadySet = localStorage.getItem('fullNameEdited') === 'true';
  if (fullNameAlreadySet) {
    fullNameInput.disabled = true;
    // No error message
  } else {
    fullNameInput.disabled = false;
    fullNameInput.addEventListener('input', () => {
      fieldTouched.fullName = true;
      const value = fullNameInput.value.trim();
      let error = '';

      // Only validate if user typed something
      if (value.length > 0) {
        // First, check for invalid characters
        if (!/^[a-zA-Z\s'-]+$/.test(value)) {
          error = 'Full name can only contain letters, spaces, hyphens, or apostrophes';
        }
        // Then check length
        else if (value.length < 2) {
          error = 'Full name must be at least 2 characters';
        } else if (value.length > 50) {
          error = 'Full name cannot exceed 50 characters';
        }
      }

      // Update error display
      if (error) {
        fullNameError.textContent = error;
        fullNameError.classList.add('active');
        fullNameInput.classList.add('invalid');
      } else {
        fullNameError.textContent = '';
        fullNameError.classList.remove('active');
        fullNameInput.classList.remove('invalid');
      }

      validateProfileForm(true);
    });
  }
}



  if (usernameInput) {
    const lastUpdate = localStorage.getItem('lastUsernameUpdate');
    const currentUsername = localStorage.getItem('username') || '';
    let usernameLocked = false;
    if (lastUpdate && currentUsername) {
      const daysSinceUpdate = (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 90) {
        usernameLocked = true;
        usernameInput.disabled = true;
        if (usernameError) {
          usernameError.textContent = `You can update your username again in ${Math.ceil(90 - daysSinceUpdate)} days`;
          usernameError.classList.add('active');
        }
      }
    }

    if (!usernameLocked) {
      usernameInput.disabled = false;
      usernameInput.addEventListener('input', debounce(async () => {
        fieldTouched.username = true;
        const value = usernameInput.value.trim();
        const errorEl = usernameError;

        // Reset classes
        if (errorEl) errorEl.classList.remove('error', 'checking', 'available');

        if (!value) {
          if (errorEl) errorEl.textContent = '';
          validateProfileForm(true);
          return;
        }

        if (/^\d/.test(value)) {
          if (errorEl) {
            errorEl.textContent = 'Username cannot start with a number';
            errorEl.classList.add('error', 'active'); // red
          }
          usernameInput.classList.add('invalid');
          isUsernameAvailable = false;
          validateProfileForm(true);
          return;
        }

        // --- Validation checks ---
        if (value.length < 3) {
          if (errorEl) {
            errorEl.textContent = 'Username must have at least 3 characters';
            errorEl.classList.add('error', 'active'); // red
          }
          usernameInput.classList.add('invalid');
          isUsernameAvailable = false;
          validateProfileForm(true);
          return;
        }

        if (value.length > 20) {
          if (errorEl) {
            errorEl.textContent = 'Username cannot exceed 20 characters';
            errorEl.classList.add('error', 'active'); // red
          }
          usernameInput.classList.add('invalid');
          isUsernameAvailable = false;
          validateProfileForm(true);
          return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(value)) {
          if (errorEl) {
            errorEl.textContent = 'Username can only contain letters, numbers, or underscores';
            errorEl.classList.add('error', 'active'); // red
          }
          usernameInput.classList.add('invalid');
          isUsernameAvailable = false;
          validateProfileForm(true);
          return;
        }

        // Passed all validations → check availability
        if (errorEl) {
          errorEl.textContent = 'Checking availability...';
          errorEl.classList.add('checking', 'active'); // white
        }
        usernameInput.classList.remove('invalid');

        // --- Supabase availability check ---
        const isAvailable = await checkUsernameAvailability(value);

        if (isAvailable) {
          if (errorEl) {
            errorEl.textContent = `${value} is available`;
            errorEl.classList.add('available', 'active'); // green
          }
          usernameInput.classList.remove('invalid');
        } else {
          if (errorEl) {
            errorEl.textContent = 'Username is already taken';
            errorEl.classList.add('error', 'active'); // red
          }
          usernameInput.classList.add('invalid');
        }

        validateProfileForm(true);
      }, 300));
    }
  }


  if (addressInput) {
  const addressAlreadySet = !!(profile?.address || localStorage.getItem('address')?.trim());
  if (addressAlreadySet) {
    addressInput.disabled = true;
    // No error message
  } else {
    addressInput.disabled = false;
    if (!addressInput.dataset.listenerAttached) {
      const addressHandler = () => {
        fieldTouched.address = true;
        validateField('address');
        validateProfileForm(true);
      };
      addressInput.addEventListener('input', addressHandler);
      addressInput.addEventListener('paste', (e) => {
        setTimeout(addressHandler, 0);
      });
      addressInput.dataset.listenerAttached = '1';
    }
  }
}



  if (profilePictureInput) {
    profilePictureInput.addEventListener('change', () => {
      fieldTouched.profilePicture = true;
      validateField('profilePicture');
      validateProfileForm(true);
    });
  }

  // Nigerian phone number validation and formatting for profile modal
  if (phoneNumberInput && !phoneNumberInput.disabled) {
    phoneNumberInput.addEventListener('keypress', (e) => {
      if (e.key === '+') {
        e.preventDefault();
        console.log('[DEBUG] phoneNumberInput keypress: Blocked + key');
      }
    });

    phoneNumberInput.addEventListener('beforeinput', (e) => {
      const rawInput = phoneNumberInput.value.replace(/\s/g, '');

      // Case: First digit typed is 7/8/9 → auto prepend 0
      if (rawInput.length === 0 && e.data && /^[789]$/.test(e.data)) {
        e.preventDefault(); // stop default typing
        phoneNumberInput.value = '0' + e.data;

        // Place cursor at the very end (after 7/8/9)
        requestAnimationFrame(() => {
          phoneNumberInput.setSelectionRange(phoneNumberInput.value.length, phoneNumberInput.value.length);
        });
        return;
      }

      // Block non-digits
      if (e.data && !/^\d$/.test(e.data)) {
        e.preventDefault();
      }
    });


    phoneNumberInput.addEventListener('keydown', (e) => {
      const allowedKeys = [
        'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter',
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
      ];
      if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v'].includes(e.key.toLowerCase())) {
        return;
      }
      if (!allowedKeys.includes(e.key)) {
        e.preventDefault();
        console.log('[DEBUG] phoneNumberInput keydown: Blocked non-allowed key:', e.key);
      }
    });

    phoneNumberInput.addEventListener('paste', (e) => {
      e.preventDefault();
      const pastedData = (e.clipboardData || window.clipboardData).getData('text').trim();
      console.log('[DEBUG] phoneNumberInput paste: Raw pasted data:', pastedData);

      const normalized = normalizePhoneProfile(pastedData);
      if (!normalized) {
        phoneNumberInput.classList.add('invalid');
        if (phoneNumberError) {
          phoneNumberError.textContent = 'Please paste a valid Nigerian phone number';
          phoneNumberError.classList.add('active');
        }
        console.log('[DEBUG] phoneNumberInput paste: Blocked invalid number:', pastedData);
        return;
      }

      const { value: formatted, cursorOffset } = formatNigeriaNumberProfile(normalized, false, true);
      if (!formatted) {
        phoneNumberInput.classList.add('invalid');
        if (phoneNumberError) {
          phoneNumberError.textContent = 'Invalid phone number format';
          phoneNumberError.classList.add('active');
        }
        console.log('[DEBUG] phoneNumberInput paste: Invalid formatted number:', normalized);
        return;
      }

      phoneNumberInput.value = formatted;
      console.log('[DEBUG] phoneNumberInput paste: Accepted and formatted:', formatted);

      const newCursorPosition = formatted.length;
      phoneNumberInput.setSelectionRange(newCursorPosition, newCursorPosition);

      const prefix = normalized.slice(0, 4);
      const validPrefixes = Object.values(providerPrefixes).flat();
      phoneNumberInput.classList.toggle('invalid', normalized.length >= 4 && !validPrefixes.includes(prefix));
      if (phoneNumberError) {
        phoneNumberError.textContent = normalized.length >= 4 && !validPrefixes.includes(prefix)
          ? 'Invalid phone number prefix'
          : '';
        phoneNumberError.classList.toggle('active', normalized.length >= 4 && !validPrefixes.includes(prefix));
      }

      fieldTouched.phoneNumber = true;
      validateField('phoneNumber');
      validateProfileForm(true);

      if (normalized.length === 11 && isNigeriaMobileProfile(normalized)) {
        phoneNumberInput.blur();
        console.log('[RAW LOG] phoneNumberInput paste: Keyboard closed, valid Nigeria number:', normalized);
      }
    });

    phoneNumberInput.addEventListener('input', debounce((e) => {
      const cursorPosition = phoneNumberInput.selectionStart;
      const rawInput = phoneNumberInput.value.replace(/\s/g, '');
      const isInitialDigit = rawInput.length === 1 && /^[789]$/.test(rawInput);
      const isDelete = e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward';

      if (!rawInput && isDelete) {
        phoneNumberInput.classList.remove('invalid');
        if (phoneNumberError) {
          phoneNumberError.textContent = '';
          phoneNumberError.classList.remove('active');
        }
        validateProfileForm(true);
        console.log('[DEBUG] phoneNumberInput input: Input cleared, no validation');
        return;
      }

      const normalized = normalizePhoneProfile(rawInput);
      if (!normalized && rawInput) {
        phoneNumberInput.value = rawInput;
        phoneNumberInput.classList.add('invalid');
        if (phoneNumberError) {
          phoneNumberError.textContent = 'Invalid phone number';
          phoneNumberError.classList.add('active');
        }
        console.log('[DEBUG] phoneNumberInput input: Invalid number, keeping raw input:', rawInput);
        validateProfileForm(true);
        return;
      }

      let finalNormalized = normalized;
      if (normalized.length > 11) {
        finalNormalized = normalized.slice(0, 11);
        console.log('[DEBUG] phoneNumberInput input: Truncated to 11 digits:', finalNormalized);
      }

      const { value: formatted, cursorOffset } = formatNigeriaNumberProfile(finalNormalized, isInitialDigit, false);
      phoneNumberInput.value = formatted;

      let newCursorPosition = cursorPosition;
      if (isInitialDigit) {
        newCursorPosition = 2;
      } else if (finalNormalized.length >= 4 && finalNormalized.length <= 7) {
        if (cursorPosition > 4) newCursorPosition += 1;
      } else if (finalNormalized.length > 7) {
        if (cursorPosition > 4) newCursorPosition += 1;
        if (cursorPosition > 7) newCursorPosition += 1;
      }
      newCursorPosition = Math.min(newCursorPosition, formatted.length);
      phoneNumberInput.setSelectionRange(newCursorPosition, newCursorPosition);

      const prefix = finalNormalized.slice(0, 4);
      const validPrefixes = Object.values(providerPrefixes).flat();

      let errorMessage = '';

      if (finalNormalized.length >= 4) {
        if (!validPrefixes.includes(prefix)) {
          // If exactly 4 digits → prefix error
          if (finalNormalized.length === 4) {
            errorMessage = 'Invalid phone number prefix';
          } else {
            // More than 4 digits → general error
            errorMessage = 'Invalid phone number';
          }
        }
      }

      phoneNumberInput.classList.toggle('invalid', !!errorMessage);

      if (phoneNumberError) {
        phoneNumberError.textContent = errorMessage;
        phoneNumberError.classList.toggle('active', !!errorMessage);
      }


      fieldTouched.phoneNumber = true;
      validateField('phoneNumber');
      validateProfileForm(true);

      if (finalNormalized.length === 11 && isNigeriaMobileProfile(finalNormalized)) {
        phoneNumberInput.blur();
        console.log('[RAW LOG] phoneNumberInput input: Keyboard closed, valid Nigeria number:', finalNormalized);
      }
    }, 50));
    if (phoneNumberInput) phoneNumberInput.maxLength = 13; // 11 digits + 2 spaces
  }

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
      try {
        await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
      } catch (err) {
        console.warn('Logout API error (continuing client-side)', err);
      }
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('profile');
      hideModal();
      window.location.href = '/frontend/html/login.html';
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
    try { return document.querySelector(sel); }
    catch (err) { __sec_log.e('bad selector', sel, err); return null; }
  };

  /* Elements — use your IDs */
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

  __sec_log.d('Modal elements:', {
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

  /* Helpers */
  const __sec_setChecked = (el, v) => { if (!el) return; el.setAttribute('aria-checked', v ? 'true' : 'false'); };
  const __sec_isChecked = (el) => !!el && el.getAttribute('aria-checked') === 'true';
  function __sec_toggleSwitch(el, forced) {
    if (!el) return false;
    const cur = __sec_isChecked(el);
    const next = (typeof forced === 'boolean') ? forced : !cur;
    __sec_setChecked(el, next);
    __sec_log.d('toggle', el && el.id, { cur, next });
    return next;
  }

  /* UI lock helpers for async ops */
  function __sec_setBusy(el, busy = true) {
    if (!el) return;
    try { el.disabled = !!busy; } catch (e) {}
    if (busy) el.setAttribute('aria-busy', 'true'); else el.removeAttribute('aria-busy');
  }

  /* Async: get current user (use stored authToken and sync with custom API) */
  async function __sec_getCurrentUser() {
    try {
      __sec_log.d('__sec_getCurrentUser: Starting');
      let sessionData = JSON.parse(localStorage.getItem('authTokenData') || '{}');
      __sec_log.d('__sec_getCurrentUser: Retrieved authTokenData', sessionData);
      let user = sessionData.user;
      let authToken = sessionData.authToken;

      // Check if token is expired (parse JWT to get exp)
      if (authToken) {
        try {
          const payload = authToken.split('.')[1];
          const decoded = JSON.parse(atob(payload));
          __sec_log.d('__sec_getCurrentUser: Decoded JWT', { iat: decoded.iat, exp: decoded.exp });
          if (decoded.exp * 1000 < Date.now()) {
            __sec_log.w('Stored token expired, attempting refresh', { exp: decoded.exp });
            authToken = null; // Force refresh
          }
        } catch (err) {
          __sec_log.e('__sec_getCurrentUser: Failed to parse JWT', err);
          authToken = null;
        }
      } else {
        __sec_log.w('__sec_getCurrentUser: No authToken in sessionData');
      }

      if (!user || !authToken) {
        __sec_log.w('Stored authTokenData missing or invalid', { user: !!user, authToken: !!authToken });
        if (typeof window.getSession === 'function') {
          __sec_log.d('__sec_getCurrentUser: Attempting window.getSession');
          const session = await window.getSession();
          __sec_log.d('__sec_getCurrentUser: window.getSession result', session);
          if (session && session.user && session.authToken) {
            user = session.user;
            authToken = session.authToken;
            localStorage.setItem('authTokenData', JSON.stringify({ user, authToken }));
            __sec_log.i('Retrieved session from getSession', { user, authToken });
            return { user, authToken };
          } else {
            __sec_log.w('No valid session from getSession', session);
          }
        } else {
          __sec_log.w('window.getSession not available');
        }

        // Fallback: Try /api/session with stored authToken
        const token = localStorage.getItem('authToken');
        __sec_log.d('__sec_getCurrentUser: Retrieved authToken from localStorage', token);
        if (token) {
          __sec_log.d('__sec_getCurrentUser: Fetching /api/session with token');
          const res = await fetch('https://api.flexgig.com.ng/api/session', {
            method: 'GET',
            credentials: 'include',
            headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
          });
          __sec_log.d('__sec_getCurrentUser: /api/session response', { status: res.status, ok: res.ok });
          if (res.ok) {
            const { user: fetchedUser, token: newToken } = await res.json();
            user = fetchedUser;
            authToken = newToken;
            localStorage.setItem('authTokenData', JSON.stringify({ user, authToken: newToken }));
            __sec_log.i('Retrieved session from /api/session', { user, authToken });
            return { user, authToken };
          } else if (res.status === 401) {
            __sec_log.i('Token expired, attempting refresh');
            const refreshRes = await fetch('https://api.flexgig.com.ng/auth/refresh', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Accept': 'application/json' }
            });
            __sec_log.d('__sec_getCurrentUser: /auth/refresh response', { status: refreshRes.status, ok: refreshRes.ok });
            if (refreshRes.ok) {
              const { token: newToken } = await refreshRes.json();
              localStorage.setItem('authToken', newToken);
              __sec_log.d('__sec_getCurrentUser: Refreshed token', newToken);
              const retryRes = await fetch('https://api.flexgig.com.ng/api/session', {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${newToken}` }
              });
              __sec_log.d('__sec_getCurrentUser: Retry /api/session response', { status: retryRes.status, ok: retryRes.ok });
              if (retryRes.ok) {
                const { user: fetchedUser, token: finalToken } = await retryRes.json();
                user = fetchedUser;
                authToken = finalToken;
                localStorage.setItem('authTokenData', JSON.stringify({ user, authToken: finalToken }));
                __sec_log.i('Retrieved session after refresh', { user, authToken });
                return { user, authToken };
              } else {
                __sec_log.e('Failed to retrieve session after refresh', await retryRes.text());
              }
            } else {
              __sec_log.e('Refresh failed', await refreshRes.text());
            }
          } else {
            __sec_log.e('Failed to fetch session', { status: res.status, text: await res.text() });
          }
        } else {
          __sec_log.w('No authToken in localStorage');
        }
      }

      if (!user || !authToken) {
        __sec_log.e('No valid session available', { user: !!user, authToken: !!authToken });
        return null;
      }

      __sec_log.i('Returning valid session', { user, authToken });
      return { user, authToken };
    } catch (err) {
      __sec_log.e('Failed to get current user', err.message);
      return null;
    }
  }

  /* Animation helpers */
  let __sec_hideTimer = null;
  function __sec_clearHideTimer() { if (__sec_hideTimer) { clearTimeout(__sec_hideTimer); __sec_hideTimer = null; } }

  function __sec_revealChildrenAnimated() {
    if (!__sec_bioOptions) return;
    __sec_clearHideTimer();
    __sec_bioOptions.classList.remove('no-animate');
    __sec_bioOptions.hidden = false;
    requestAnimationFrame(() => __sec_bioOptions.classList.add('show'));
    const rows = Array.from(__sec_bioOptions.querySelectorAll('.setting-row'));
    rows.forEach((row, i) => {
      row.classList.remove('visible');
      row.style.transitionDelay = `${i * 80}ms`;
    });
    requestAnimationFrame(() => rows.forEach(row => row.classList.add('visible')));
  }

  function __sec_hideChildrenAnimated() {
    if (!__sec_bioOptions) return;
    __sec_clearHideTimer();
    const rows = Array.from(__sec_bioOptions.querySelectorAll('.setting-row'));
    rows.slice().reverse().forEach((row, idx) => {
      row.style.transitionDelay = `${idx * 60}ms`;
      row.classList.remove('visible');
    });
    const longest = rows.length * 60 + 220;
    __sec_hideTimer = setTimeout(() => {
      __sec_bioOptions.classList.remove('show');
      rows.forEach(r => { r.style.transitionDelay = ''; });
      __sec_bioOptions.hidden = true;
      __sec_hideTimer = null;
    }, longest);
  }

  function __sec_revealChildrenNoAnimate() {
    if (!__sec_bioOptions) return;
    __sec_clearHideTimer();
    __sec_bioOptions.classList.remove('show');
    __sec_bioOptions.classList.add('no-animate');
    __sec_bioOptions.hidden = false;
    const rows = Array.from(__sec_bioOptions.querySelectorAll('.setting-row'));
    rows.forEach(row => { row.classList.add('visible'); row.style.transitionDelay = ''; });
    requestAnimationFrame(() => __sec_bioOptions.classList.add('show'));
    setTimeout(() => __sec_bioOptions.classList.remove('no-animate'), 60);
  }

  /* Set biometric UI state */
  /* Set biometric UI state (fixed defaulting & no `|| true` bug) */
function __sec_setBiometrics(parentOn, animate = true) {
  if (!__sec_parentSwitch) { __sec_log.w('parent switch element missing'); return; }
  __sec_setChecked(__sec_parentSwitch, parentOn);
  try { localStorage.setItem(__sec_KEYS.biom, parentOn ? '1' : '0'); } catch (e) {}

  if (parentOn) {
    // Read raw stored values so we can distinguish "missing" (null) vs set '0'/'1'
    const rawLogin = localStorage.getItem(__sec_KEYS.bioLogin); // '1' | '0' | null
    const rawTx = localStorage.getItem(__sec_KEYS.bioTx);

    // If there's no stored preference, default children to true (first-time enabling).
    const defaultLogin = rawLogin === null ? true : (rawLogin === '1');
    const defaultTx = rawTx === null ? true : (rawTx === '1');

    if (animate) {
      __sec_revealChildrenAnimated();
      setTimeout(() => {
        __sec_setChecked(__sec_bioLogin, defaultLogin);
        __sec_setChecked(__sec_bioTx, defaultTx);

        // Persist whichever value we actually applied (defensive).
        try {
          localStorage.setItem(__sec_KEYS.bioLogin, __sec_isChecked(__sec_bioLogin) ? '1' : '0');
          localStorage.setItem(__sec_KEYS.bioTx, __sec_isChecked(__sec_bioTx) ? '1' : '0');
        } catch (e) {}
      }, 60);
    } else {
      __sec_revealChildrenNoAnimate();
      __sec_setChecked(__sec_bioLogin, defaultLogin);
      __sec_setChecked(__sec_bioTx, defaultTx);
      try {
        localStorage.setItem(__sec_KEYS.bioLogin, __sec_isChecked(__sec_bioLogin) ? '1' : '0');
        localStorage.setItem(__sec_KEYS.bioTx, __sec_isChecked(__sec_bioTx) ? '1' : '0');
      } catch (e) {}
    }
    __sec_log.i('biom ON', { rawLogin, rawTx, animate });
  } else {
    try {
      localStorage.setItem(__sec_KEYS.bioLogin, '0');
      localStorage.setItem(__sec_KEYS.bioTx, '0');
    } catch (e) {}
    if (__sec_bioLogin) __sec_setChecked(__sec_bioLogin, false);
    if (__sec_bioTx) __sec_setChecked(__sec_bioTx, false);
    if (animate) __sec_hideChildrenAnimated();
    else {
      if (__sec_bioOptions) {
        __sec_bioOptions.classList.remove('show');
        __sec_bioOptions.hidden = true;
        const rows = Array.from(__sec_bioOptions.querySelectorAll('.setting-row'));
        rows.forEach(r => { r.classList.remove('visible'); r.style.transitionDelay = ''; });
      }
    }
    __sec_log.i('biom OFF', { animate });
  }
}

  /* If both child switches are off, turn the parent off */
  function __sec_maybeDisableParentIfChildrenOff() {
    try {
      if (!__sec_parentSwitch) return;
      if (!__sec_bioLogin || !__sec_bioTx) return;
      const loginOn = __sec_isChecked(__sec_bioLogin);
      const txOn = __sec_isChecked(__sec_bioTx);
      if (!loginOn && !txOn && __sec_isChecked(__sec_parentSwitch)) {
        __sec_log.i('Both biometric children off — turning parent OFF');
        __sec_setBiometrics(false, true);
      }
    } catch (err) {
      __sec_log.e('maybeDisableParentIfChildrenOff error', err);
    }
  }

  /* Initialize from storage */
  function __sec_initFromStorage() {
  try {
    const rawBiom = localStorage.getItem(__sec_KEYS.biom); // '1' | '0' | null
    const rawLogin = localStorage.getItem(__sec_KEYS.bioLogin);
    const rawTx = localStorage.getItem(__sec_KEYS.bioTx);
    const rawBalance = localStorage.getItem(__sec_KEYS.balance); // '1' | '0' | null

    const biomStored = rawBiom === '1';
    // For child switches: default false if no stored value (so we don't accidentally enable them)
    // If you'd rather default them to true when parent is enabled for first time, keep the logic in setBiometrics.
    const loginStored = rawLogin === '1';
    const txStored = rawTx === '1';
    // Balance: default to visible (true) when missing; change if you want opposite.
    const balanceStored = rawBalance === null ? true : (rawBalance === '1');

    if (__sec_parentSwitch) __sec_setChecked(__sec_parentSwitch, biomStored);

    if (__sec_bioOptions) {
      if (biomStored) {
        __sec_revealChildrenNoAnimate();
        if (__sec_bioLogin) __sec_setChecked(__sec_bioLogin, loginStored);
        if (__sec_bioTx) __sec_setChecked(__sec_bioTx, txStored);
      } else {
        __sec_bioOptions.hidden = true;
        __sec_bioOptions.classList.remove('show');
        if (__sec_bioLogin) __sec_setChecked(__sec_bioLogin, false);
        if (__sec_bioTx) __sec_setChecked(__sec_bioTx, false);
      }
    }

    if (__sec_balanceSwitch) __sec_setChecked(__sec_balanceSwitch, balanceStored);

    __sec_log.d('initFromStorage', { rawBiom, rawLogin, rawTx, rawBalance, biomStored, loginStored, txStored, balanceStored });
  } catch (err) {
    __sec_log.e('initFromStorage error', err);
  }
}

window.addEventListener('beforeunload', () => {
  try {
    if (__sec_parentSwitch) localStorage.setItem(__sec_KEYS.biom, __sec_isChecked(__sec_parentSwitch) ? '1' : '0');
    if (__sec_bioLogin) localStorage.setItem(__sec_KEYS.bioLogin, __sec_isChecked(__sec_bioLogin) ? '1' : '0');
    if (__sec_bioTx) localStorage.setItem(__sec_KEYS.bioTx, __sec_isChecked(__sec_bioTx) ? '1' : '0');
    if (__sec_balanceSwitch) localStorage.setItem(__sec_KEYS.balance, __sec_isChecked(__sec_balanceSwitch) ? '1' : '0');
  } catch (e) { /* ignore */ }
});


/* ========== Slide-in Notification ========== */
function showSlideNotification(message, type = "info") {
  let box = document.createElement("div");
  box.className = "slide-notification " + type;
  box.innerText = message;
  document.body.appendChild(box);

  requestAnimationFrame(() => box.classList.add("show"));

  setTimeout(() => {
    box.classList.remove("show");
    setTimeout(() => box.remove(), 500);
  }, 3000);
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
  // Utility to convert base64url string to ArrayBuffer
/* ---- WebAuthn utilities ---- */
/* ---- WebAuthn utilities ---- */
function base64urlToArrayBuffer(base64url) {
  try {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob(base64 + padding);
    const buffer = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buffer[i] = raw.charCodeAt(i);
    return buffer.buffer;
  } catch (err) {
    __sec_log.e('base64urlToArrayBuffer error', { input: base64url, err });
    throw new Error(`Failed to decode base64url: ${err.message}`);
  }
}

function arrayBufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function uuidToArrayBuffer(uuid) {
  const clean = uuid.replace(/-/g, '');
  if (clean.length !== 32) throw new Error(`Invalid UUID: ${uuid}`);
  const buffer = new Uint8Array(16);
  for (let i = 0; i < 16; i++) buffer[i] = parseInt(clean.substr(i * 2, 2), 16);
  return buffer.buffer;
}

/* ---- Registration flow ---- */
async function startRegistration(userId, username, displayName) {
  try {
    __sec_log.d('startRegistration', { userId, username, displayName });
    const { authToken } = await __sec_getCurrentUser() || {};
    if (!authToken) throw new Error('No auth token');

    const optRes = await fetch(`${window.__SEC_API_BASE || "https://api.flexgig.com.ng"}/webauthn/register/options`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userId, username, displayName }),
    });
    if (!optRes.ok) throw new Error(`Options failed: ${await optRes.text()}`);
    const options = await optRes.json();

    // Convert challenge
    options.challenge = new Uint8Array(base64urlToArrayBuffer(options.challenge));

    // Convert user.id (server might send uuid or base64url)
    if (options.user?.id) {
      try {
        options.user.id = new Uint8Array(base64urlToArrayBuffer(options.user.id));
      } catch {
        options.user.id = new Uint8Array(uuidToArrayBuffer(userId));
      }
    }

    if (options.excludeCredentials) {
      options.excludeCredentials = options.excludeCredentials.map(c => ({
        ...c, id: new Uint8Array(base64urlToArrayBuffer(c.id))
      }));
    }

    // Create credential
    const cred = await navigator.credentials.create({ publicKey: options });
    if (!cred) throw new Error('No credential returned');

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

    const verifyRes = await fetch(`${window.__SEC_API_BASE || "https://api.flexgig.com.ng"}/webauthn/register/verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userId, credential }),
    });
    if (!verifyRes.ok) throw new Error(`Verify failed: ${await verifyRes.text()}`);
    return await verifyRes.json();
  } catch (err) {
    __sec_log.e('startRegistration error', err);
    throw err;
  }
}

/* ---- Authentication flow ---- */
async function startAuthentication(userId) {
  try {
    __sec_log.d('startAuthentication', { userId });
    const { authToken } = await __sec_getCurrentUser() || {};
    if (!authToken) throw new Error('No auth token');

    const optRes = await fetch(`${window.__SEC_API_BASE || "https://api.flexgig.com.ng"}/webauthn/auth/options`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userId }),
    });
    if (!optRes.ok) throw new Error(`Auth options failed: ${await optRes.text()}`);
    const options = await optRes.json();

    options.challenge = new Uint8Array(base64urlToArrayBuffer(options.challenge));
    if (options.allowCredentials) {
      options.allowCredentials = options.allowCredentials.map(c => ({
        ...c, id: new Uint8Array(base64urlToArrayBuffer(c.id))
      }));
    }

    const assertion = await navigator.credentials.get({ publicKey: options });
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

    const verifyRes = await fetch(`${window.__SEC_API_BASE || "https://api.flexgig.com.ng"}/webauthn/auth/verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userId, credential }),
    });
    if (!verifyRes.ok) throw new Error(`Auth verify failed: ${await verifyRes.text()}`);
    return await verifyRes.json();
  } catch (err) {
    __sec_log.e('startAuthentication error', err);
    throw err;
  }
}

/* ---- WebAuthn helper calls to server (list/revoke) ---- */
async function __sec_listAuthenticators(userId) {
  try {
    __sec_log.d('listAuthenticators: starting', { userId });
    const currentUser = await __sec_getCurrentUser();
    if (!currentUser || !currentUser.authToken) {
      __sec_log.w('No auth token for listing authenticators');
      return null;
    }
    const token = currentUser.authToken;

    const r = await fetch(
      `${window.__SEC_API_BASE}/webauthn/authenticators/${encodeURIComponent(userId)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }
    );

    if (!r.ok) {
      __sec_log.w('listAuthenticators failed', r.status);
      return null;
    }

    const j = await r.json();
    __sec_log.d('listAuthenticators success', j);
    return j;
  } catch (err) {
    __sec_log.e('listAuthenticators error', err);
    return null;
  }
}

async function __sec_revokeAuthenticator(userId, credentialID) {
  try {
    __sec_log.d('revokeAuthenticator: starting', { userId, credentialID });
    const currentUser = await __sec_getCurrentUser();
    if (!currentUser || !currentUser.authToken) {
      __sec_log.w('No auth token for revoking authenticator');
      return false;
    }
    const token = currentUser.authToken;

    const r = await fetch(
      `${window.__SEC_API_BASE}/webauthn/authenticators/${encodeURIComponent(userId)}/revoke`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ credentialID }),
      }
    );

    if (!r.ok) {
      __sec_log.w('revokeAuthenticator failed', credentialID, r.status);
      return false;
    }

    __sec_log.i('revokeAuthenticator success', credentialID);
    return true;
  } catch (err) {
    __sec_log.e('revokeAuthenticator error', err);
    return false;
  }
}

/* Wire events (with WebAuthn integration) */
function __sec_wireEvents() {
  try {
    if (__sec_launcherBtn) {
      __sec_launcherBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        __sec_openModal();
      });
      __sec_log.d('launcher wired (#securityBtn)');
    } else {
      __sec_log.w('no launcher (#securityBtn) found; use controller.open() to open');
    }

    if (__sec_closeBtn) {
      __sec_closeBtn.addEventListener('click', __sec_closeModal);
      __sec_log.d('close button wired (#securityCloseBtn)');
    } else {
      __sec_log.w('no close button (#securityCloseBtn) found');
    }
    if (__sec_closeBtn && __sec_modal) {
      __sec_closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        __sec_log.i('Security modal close button clicked');
        __sec_modal.classList.remove('show'); // or whatever class shows it
        __sec_modal.setAttribute('aria-hidden', 'true');
      });
    }


    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && __sec_modal && __sec_modal.classList.contains('active')) {
        __sec_closeModal();
      }
    });

    if (__sec_parentSwitch) {
      const __sec_parentHandler = async () => {
        __sec_log.d('__sec_parentHandler: Starting');
        __sec_setBusy(__sec_parentSwitch, true);
        const uiOn = __sec_toggleSwitch(__sec_parentSwitch);
        __sec_log.d('__sec_parentHandler: Toggle state', { uiOn });

        const currentUser = await __sec_getCurrentUser();
        __sec_log.d('__sec_parentHandler: Retrieved currentUser', currentUser);

        if (!currentUser) {
          __sec_log.e('__sec_parentHandler: No current user object returned');
          __sec_setChecked(__sec_parentSwitch, false);
          __sec_setBusy(__sec_parentSwitch, false);
          alert('You must be signed in to enable biometrics. Please try logging in again.');
          window.location.href = '/frontend/html/login.html';
          return;
        }

        const { user, authToken } = currentUser;
        __sec_log.d('__sec_parentHandler: Extracted user and authToken', { user, authToken });

        if (!user || !user.uid) {
          __sec_log.e('__sec_parentHandler: Invalid user or missing uid', { user });
          __sec_setChecked(__sec_parentSwitch, false);
          __sec_setBusy(__sec_parentSwitch, false);
          alert('You must be signed in to enable biometrics. Please try logging in again.');
          window.location.href = '/frontend/html/login.html';
          return;
        }

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
            await startRegistration(uid, user.email || user.username || uid, user.fullName || user.email || uid);
            __sec_setBiometrics(true, true);
            __sec_log.i('Registration successful');
          } catch (err) {
            __sec_log.e('Registration failed', err);
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
                if (!credential_id) continue;
                const ok = await __sec_revokeAuthenticator(uid, credential_id);
                __sec_log.d('revoke result', credential_id, ok);
              }
            } else {
              __sec_log.d('No authenticators to revoke for user', uid);
            }
            __sec_setBiometrics(false, true);
          } catch (err) {
            __sec_log.e('Error revoking authenticators', err);
            __sec_setBiometrics(false, true);
            alert('Warning: failed to revoke authenticator(s) on server. Check console.');
          } finally {
            __sec_setBusy(__sec_parentSwitch, false);
          }
        }
      };

      __sec_parentSwitch.addEventListener('click', (e) => { e.preventDefault(); __sec_parentHandler(); });
      __sec_parentSwitch.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); __sec_parentHandler(); } });
    } else {
      __sec_log.w('no parent switch (#biometricsSwitch) found');
    }

    if (__sec_bioLogin) {
      __sec_bioLogin.addEventListener('click', async () => {
        if (!__sec_parentSwitch || !__sec_isChecked(__sec_parentSwitch)) {
          __sec_log.d('bioLogin click ignored; parent OFF');
          return;
        }
        __sec_setBusy(__sec_bioLogin, true);
        const newState = __sec_toggleSwitch(__sec_bioLogin);
        try {
          const currentUser = await __sec_getCurrentUser();
          if (!currentUser || !currentUser.user || !currentUser.user.uid) throw new Error('Not signed in');
          const user = currentUser.user;

          if (newState) {
            __sec_log.i('bioLogin enabling: performing authentication test');
            await startAuthentication(user.uid);
            localStorage.setItem(__sec_KEYS.bioLogin, '1');
            __sec_log.i('bioLogin enabled and verified');
          } else {
            localStorage.setItem(__sec_KEYS.bioLogin, '0');
            __sec_maybeDisableParentIfChildrenOff();
          }
        } catch (err) {
          __sec_log.e('bioLogin error or verification failed', err);
          __sec_setChecked(__sec_bioLogin, false);
          try { localStorage.setItem(__sec_KEYS.bioLogin, '0'); } catch (e) {}
          alert('Biometric verification failed: ' + (err.message || 'unknown'));
        } finally {
          __sec_setBusy(__sec_bioLogin, false);
        }
      });

      __sec_bioLogin.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); __sec_bioLogin.click(); } });
    } else {
      __sec_log.w('no bioLogin switch (#bioLoginSwitch) found');
    }

    if (__sec_bioTx) {
      __sec_bioTx.addEventListener('click', async () => {
        if (!__sec_parentSwitch || !__sec_isChecked(__sec_parentSwitch)) {
          __sec_log.d('bioTx click ignored; parent OFF');
          return;
        }
        __sec_setBusy(__sec_bioTx, true);
        const newState = __sec_toggleSwitch(__sec_bioTx);
        try {
          const currentUser = await __sec_getCurrentUser();
          if (!currentUser || !currentUser.user || !currentUser.user.uid) throw new Error('Not signed in');
          const user = currentUser.user;

          if (newState) {
            __sec_log.i('bioTx enabling: performing authentication test');
            await startAuthentication(user.uid);
            localStorage.setItem(__sec_KEYS.bioTx, '1');
            __sec_log.i('bioTx enabled and verified');
          } else {
            localStorage.setItem(__sec_KEYS.bioTx, '0');
            __sec_maybeDisableParentIfChildrenOff();
          }
        } catch (err) {
          __sec_log.e('bioTx error or verification failed', err);
          __sec_setChecked(__sec_bioTx, false);
          try { localStorage.setItem(__sec_KEYS.bioTx, '0'); } catch (e) {}
          alert('Biometric verification failed: ' + (err.message || 'unknown'));
        } finally {
          __sec_setBusy(__sec_bioTx, false);
        }
      });

      __sec_bioTx.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); __sec_bioTx.click(); } });
    } else {
      __sec_log.w('no bioTx switch (#bioTxSwitch) found');
    }

    if (__sec_balanceSwitch) {
      const __sec_balanceHandler = () => {
        const on = __sec_toggleSwitch(__sec_balanceSwitch);
        try { localStorage.setItem(__sec_KEYS.balance, on ? '1' : '0'); } catch (e) {}
        window.dispatchEvent(new CustomEvent('security:balance-visibility-changed', { detail: { visible: on } }));
        __sec_log.i('balanceSwitch ->', on);
      };
      __sec_balanceSwitch.addEventListener('click', __sec_balanceHandler);
      __sec_balanceSwitch.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); __sec_balanceHandler(); } });
    } else {
      __sec_log.w('no balance switch (#balanceSwitch) found');
    }

    __sec_log.i('events wired (with WebAuthn integration)');
  } catch (err) {
    __sec_log.e('wireEvents error', err);
  }
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












  



    










  // Watch your steps
});




