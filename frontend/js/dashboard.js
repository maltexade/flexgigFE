const updateProfileModal = document.getElementById('updateProfileModal');
if (updateProfileModal && updateProfileModal.classList.contains('active')) {
  openUpdateProfileModal(data);
}



// --- Fetch User Data ---
// --- Fetch User Data ---
// --- Robust getSession() with guarded updates and stable avatar handling ---
async function getSession() {
  // Create a unique load-id so only the latest call can apply DOM updates
  const loadId = Date.now();
  window.__lastSessionLoadId = loadId;

  // Small helper: determine if a profile picture string is a usable image source
  function isValidImageSource(src) {
    if (!src) return false;
    // Accept data URIs, absolute http(s) URLs, or root-relative paths
    return /^(data:image\/|https?:\/\/|\/)/i.test(src);
  }

  // Helper: apply avatar + greeting + display name to DOM (idempotent)
  function applySessionToDOM(userObj, derivedFirstName) {
    // If another getSession started after this one, abort applying
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

    // Greeting based on time
    const hour = new Date().getHours();
    greetEl.textContent = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

    // Display name prefers username > firstName > fallback 'User'
    const displayName = (userObj.username || derivedFirstName || 'User');
    firstnameEl.textContent = displayName.charAt(0).toUpperCase() + displayName.slice(1);

    // Decide avatar: prefer userObj.profilePicture if valid, else fallback to initial
    const profilePicture = userObj.profilePicture || '';
    if (isValidImageSource(profilePicture)) {
      avatarEl.innerHTML = `<img src="${profilePicture}" alt="Profile Picture" class="avatar-img" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
      avatarEl.removeAttribute('aria-label');
    } else {
      avatarEl.innerHTML = '';
      avatarEl.textContent = displayName.charAt(0).toUpperCase();
      avatarEl.setAttribute('aria-label', displayName);
    }
  }

  // Helper: wait until essential DOM elements are available (small retry loop)
  async function waitForDomReady(retries = 8, delay = 100) {
    for (let i = 0; i < retries; i++) {
      if (document.getElementById('greet') &&
          document.getElementById('firstname') &&
          document.getElementById('avatar')) {
        return true;
      }
      await new Promise(r => setTimeout(r, delay));
    }
    return false;
  }

  try {
    console.log('[DEBUG] getSession: Initiating fetch, credentials: include, time:', new Date().toISOString());

    const res = await fetch('https://api.flexgig.com.ng/api/session', {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });

    console.log('[DEBUG] getSession: Response status', res.status);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[ERROR] getSession: Session API returned error:', res.status, text);
      if (res.status === 401) {
        // If unauthorized, send to login
        window.location.href = '/';
      } else {
        alert('Something went wrong while loading your session. Please try again.');
      }
      return;
    }

    const { user = {}, token } = await res.json();
    console.log('[DEBUG] getSession: Raw user data', user, 'Token', token);

    // Derive firstName
    let firstName = user.fullName?.split(' ')[0] || '';
    if (!firstName && user.email) {
      firstName = user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').replace(/(\d+)/, '');
      firstName = (firstName && firstName.charAt(0).toUpperCase() + firstName.slice(1)) || 'User';
    }

    // Write to localStorage early so other code that reads it has a value
    try {
      localStorage.setItem('userEmail', user.email || '');
      localStorage.setItem('firstName', firstName);
      localStorage.setItem('username', user.username || '');
      localStorage.setItem('phoneNumber', user.phoneNumber || '');
      localStorage.setItem('address', user.address || '');
      localStorage.setItem('fullName', user.fullName || (user.email ? user.email.split('@')[0] : ''));
      localStorage.setItem('fullNameEdited', user.fullNameEdited ? 'true' : 'false');
      localStorage.setItem('lastUsernameUpdate', user.lastUsernameUpdate || '');
      localStorage.setItem('profilePicture', user.profilePicture || '');
      if (token) {
        localStorage.setItem('authToken', token);
        console.log('[DEBUG] getSession: Stored authToken');
      }
    } catch (err) {
      console.warn('[WARN] getSession: Failed to write some localStorage keys', err);
    }

    // Wait briefly for DOM elements to appear (if needed)
    const domReady = await waitForDomReady();
    if (!domReady) {
      console.warn('[WARN] getSession: DOM elements not ready after waiting, will attempt to apply if they exist');
    }

    // Apply session data immediately to DOM (fast)
    applySessionToDOM(user, firstName);

    // Attempt to enrich with loadUserProfile() if available.
    // If loadUserProfile() provides a more complete profile (esp profilePicture),
    // use it — but only if this is still the latest getSession() call.
    if (typeof loadUserProfile === 'function') {
      try {
        const profileResult = await loadUserProfile(); // expect it to fetch remote profile and possibly update DOM
        // If loadUserProfile returned data, prefer its profile picture if valid
        if (window.__lastSessionLoadId !== loadId) {
          console.log('[DEBUG] getSession: loadUserProfile result is stale, ignoring');
          return;
        }

        // If loadUserProfile returns explicit data, merge it; otherwise read localStorage
        const profileData = profileResult && typeof profileResult === 'object' ? profileResult : {
          profilePicture: localStorage.getItem('profilePicture') || user.profilePicture || ''
        };

        // Prefer profileData.profilePicture > user.profilePicture
        const finalProfilePicture = isValidImageSource(profileData.profilePicture)
          ? profileData.profilePicture
          : (isValidImageSource(user.profilePicture) ? user.profilePicture : '');

        // If there's a better picture from profileData, update localStorage & DOM
        if (finalProfilePicture && finalProfilePicture !== (localStorage.getItem('profilePicture') || '')) {
          try { localStorage.setItem('profilePicture', finalProfilePicture); } catch (err) { /* ignore */ }
          // Apply with updated picture
          applySessionToDOM({ ...user, profilePicture: finalProfilePicture }, firstName);
        } else {
          // Ensure DOM still shows what we set earlier (re-apply in case loadUserProfile or other code changed it)
          applySessionToDOM({ ...user, profilePicture: finalProfilePicture || user.profilePicture }, firstName);
        }
      } catch (err) {
        console.warn('[WARN] getSession: loadUserProfile failed, relying on session data', err && err.message);
        // Re-apply session data to ensure it sticks
        applySessionToDOM(user, firstName);
      }
    } else {
      // No loadUserProfile function — ensure DOM remains with session info
      applySessionToDOM(user, firstName);
    }

    console.log('[DEBUG] getSession: Completed (loadId=' + loadId + ')');
  } catch (err) {
    console.error('[ERROR] getSession: Failed to fetch session', err && err.message ? err.message : err);
  }
}


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
async function loadUserProfile() {
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
    const response = await fetch('https://api.flexgig.com.ng/api/profile', {
      method: 'GET',
      credentials: 'include',
      headers
    });
    console.log('[DEBUG] loadUserProfile: Response status', response.status, 'Headers', [...response.headers]);
    const data = await response.json();
    console.log('[DEBUG] loadUserProfile: Raw response data', data);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${data.error || 'Unknown error'}`);
    }

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
    const isValidProfilePicture = profilePicture && profilePicture.startsWith('data:image/');
    const displayName = data.username || firstName || 'User';

    // Only update DOM if values differ from current
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

    // Update profile modal if open
    if (updateProfileModal.classList.contains('active')) {
      openUpdateProfileModal(data);
    }
  } catch (err) {
    console.error('[ERROR] loadUserProfile: Failed to fetch profile', err.message);
    // Fallback to localStorage, but only update if necessary
    const firstnameEl = document.getElementById('firstname');
    const avatarEl = document.getElementById('avatar');
    if (!firstnameEl || !avatarEl) {
      console.error('[ERROR] loadUserProfile: Missing DOM elements in catch block', { firstnameEl: !!firstnameEl, avatarEl: !!avatarEl });
      return;
    }
    const firstName = localStorage.getItem('firstName') || 'User';
    const profilePicture = localStorage.getItem('profilePicture') || '';
    const isValidProfilePicture = profilePicture && profilePicture.startsWith('data:image/');
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



// --- DATA PLANS DEFINITION ---
const mtnAwoofPlans = [
  { price: 50, data: '50MB', duration: '1 DAY' },
  { price: 100, data: '250MB', duration: '1 DAY' },
  { price: 200, data: '500MB', duration: '3 DAYS' },
  { price: 300, data: '1GB', duration: '7 DAYS' },
  { price: 400, data: '1.5GB', duration: '7 DAYS' },
  { price: 500, data: '2GB', duration: '14 DAYS' },
  { price: 800, data: '3GB', duration: '14 DAYS' },
  { price: 1000, data: '4.5GB', duration: '30 DAYS' },
  { price: 1200, data: '6GB', duration: '30 DAYS' },
  { price: 1500, data: '8GB', duration: '30 DAYS' }
];
const mtnGiftingPlans = [
  { price: 2000, data: '11GB', duration: '30 DAYS' },
  { price: 2500, data: '15GB', duration: '30 DAYS' },
  { price: 3000, data: '20GB', duration: '30 DAYS' },
  { price: 3500, data: '25GB', duration: '30 DAYS' },
  { price: 5000, data: '40GB', duration: '30 DAYS' },
  { price: 10000, data: '75GB', duration: '90 DAYS' },
  { price: 15000, data: '120GB', duration: '90 DAYS' },
  { price: 20000, data: '200GB', duration: '120 DAYS' },
  { price: 30000, data: '400GB', duration: '180 DAYS' },
  { price: 50000, data: '1TB', duration: '365 DAYS' }
];
const airtelAwoofPlans = [
  { price: 100, data: '200MB', duration: '1 DAY' },
  { price: 200, data: '500MB', duration: '2 DAYS' },
  { price: 300, data: '750MB', duration: '3 DAYS' },
  { price: 500, data: '1.5GB', duration: '7 DAYS' },
  { price: 1000, data: '3GB', duration: '14 DAYS' },
  { price: 1500, data: '6GB', duration: '30 DAYS' },
  { price: 2000, data: '9GB', duration: '30 DAYS' },
  { price: 2500, data: '12GB', duration: '30 DAYS' },
  { price: 3000, data: '15GB', duration: '30 DAYS' },
  { price: 3500, data: '20GB', duration: '30 DAYS' }
];
const airtelCgPlans = [
  { price: 4000, data: '24GB', duration: '30 DAYS' },
  { price: 5000, data: '40GB', duration: '30 DAYS' },
  { price: 8000, data: '75GB', duration: '60 DAYS' },
  { price: 10000, data: '120GB', duration: '90 DAYS' },
  { price: 15000, data: '200GB', duration: '90 DAYS' },
  { price: 20000, data: '280GB', duration: '120 DAYS' },
  { price: 25000, data: '400GB', duration: '180 DAYS' },
  { price: 30000, data: '500GB', duration: '180 DAYS' },
  { price: 40000, data: '1TB', duration: '365 DAYS' },
  { price: 50000, data: '2TB', duration: '365 DAYS' }
];
const gloCgPlans = [
  { price: 50, data: '50MB', duration: '1 DAY' },
  { price: 100, data: '150MB', duration: '1 DAY' },
  { price: 200, data: '500MB', duration: '2 DAYS' },
  { price: 300, data: '1GB', duration: '5 DAYS' },
  { price: 500, data: '2GB', duration: '7 DAYS' },
  { price: 800, data: '3GB', duration: '14 DAYS' },
  { price: 1000, data: '4GB', duration: '15 DAYS' },
  { price: 1500, data: '7GB', duration: '30 DAYS' },
  { price: 2000, data: '10GB', duration: '30 DAYS' },
  { price: 2500, data: '12GB', duration: '30 DAYS' }
];
const gloGiftingPlans = [
  { price: 3000, data: '18GB', duration: '30 DAYS' },
  { price: 4000, data: '24GB', duration: '30 DAYS' },
  { price: 5000, data: '32GB', duration: '30 DAYS' },
  { price: 8000, data: '55GB', duration: '60 DAYS' },
  { price: 10000, data: '75GB', duration: '90 DAYS' },
  { price: 15000, data: '150GB', duration: '90 DAYS' },
  { price: 20000, data: '250GB', duration: '120 DAYS' },
  { price: 30000, data: '500GB', duration: '180 DAYS' },
  { price: 40000, data: '800GB', duration: '365 DAYS' },
  { price: 50000, data: '1.5TB', duration: '365 DAYS' }
];
const ninemobilePlans = [
  { price: 100, data: '100MB', duration: '1 DAY' },
  { price: 200, data: '300MB', duration: '2 DAYS' },
  { price: 300, data: '500MB', duration: '3 DAYS' },
  { price: 500, data: '1GB', duration: '7 DAYS' },
  { price: 800, data: '2GB', duration: '14 DAYS' },
  { price: 1000, data: '3GB', duration: '14 DAYS' },
  { price: 1200, data: '4GB', duration: '30 DAYS' },
  { price: 1500, data: '5GB', duration: '30 DAYS' },
  { price: 2000, data: '7GB', duration: '30 DAYS' },
  { price: 2500, data: '10GB', duration: '30 DAYS' },
  { price: 3000, data: '12GB', duration: '30 DAYS' },
  { price: 3500, data: '15GB', duration: '30 DAYS' },
  { price: 4000, data: '20GB', duration: '30 DAYS' },
  { price: 5000, data: '30GB', duration: '30 DAYS' },
  { price: 8000, data: '50GB', duration: '60 DAYS' },
  { price: 10000, data: '80GB', duration: '90 DAYS' },
  { price: 15000, data: '150GB', duration: '90 DAYS' },
  { price: 20000, data: '250GB', duration: '120 DAYS' },
  { price: 30000, data: '400GB', duration: '180 DAYS' },
  { price: 50000, data: '1TB', duration: '365 DAYS' }
];


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
function updateGreetingAndAvatar(username, firstName) {
  const avatarEl = document.getElementById('avatar');
  const firstnameEl = document.getElementById('firstname');
  const greetEl = document.getElementById('greet');
  console.log('[DEBUG] updateGreetingAndAvatar: Checking DOM elements, time:', new Date().toISOString(), {
    avatarEl: !!avatarEl,
    firstnameEl: !!firstnameEl,
    greetEl: !!greetEl
  });

  if (!avatarEl || !firstnameEl || !greetEl) {
    console.error('[ERROR] updateGreetingAndAvatar: Missing DOM elements');
    return;
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
  greetEl.textContent = greeting;

  const profilePicture = localStorage.getItem('profilePicture') || '';
  const isValidProfilePicture = profilePicture && profilePicture.startsWith('data:image/');
  const displayName = username || firstName || 'User';

  if (isValidProfilePicture) {
    avatarEl.innerHTML = `<img src="${profilePicture}" alt="Profile Picture" class="avatar-img" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
  } else {
    avatarEl.innerHTML = '';
    avatarEl.textContent = displayName.charAt(0).toUpperCase();
  }
  firstnameEl.textContent = displayName.charAt(0).toUpperCase() + displayName.slice(1);

  console.log('[DEBUG] updateGreetingAndAvatar:', { greeting, username, firstName, displayName, profilePicture });
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
  const modal = document.getElementById('allPlansModal');
  const openBtn = document.querySelector('.see-all-plans');
  const closeBtn = modal.querySelector('.close-btn');
  const modalContent = modal.querySelector('.modal-content');
  const pullHandle = modal.querySelector('.pull-handle');
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

  // --- STATE PERSISTENCE ---
  function saveUserState() {
    const activeProvider = providerClasses.find(cls => slider.classList.contains(cls));
    const selectedPlan = plansRow.querySelector('.plan-box.selected');
    const phoneNumber = phoneInput.value;
    const rawNumber = normalizePhone(phoneNumber); // Normalize before saving
    if (!rawNumber) {
      console.warn('[WARN] saveUserState: Invalid phone number:', phoneNumber);
    }
    localStorage.setItem('userState', JSON.stringify({
      provider: activeProvider || '',
      planId: selectedPlan ? selectedPlan.getAttribute('data-id') : '',
      number: rawNumber || phoneNumber, // Fallback to formatted if invalid
      serviceIdx: [...serviceItems].findIndex(el => el.classList.contains('active')),
    }));
    console.log('[DEBUG] saveUserState: Saved state:', { 
      provider: activeProvider, 
      planId: selectedPlan?.getAttribute('data-id'), 
      number: rawNumber || phoneNumber 
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
      modal.querySelectorAll('.plan-box.selected').forEach(p => p.classList.remove('selected', ...providerClasses));

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
    const modal = document.getElementById('allPlansModal');
    if (!modal) return;

    const sectionMap = [
      { provider: 'mtn', subType: 'awoof', plans: mtnAwoofPlans, title: 'MTN AWOOF', svg: svgShapes.mtn },
      { provider: 'mtn', subType: 'gifting', plans: mtnGiftingPlans, title: 'MTN GIFTING', svg: svgShapes.mtn },
      { provider: 'airtel', subType: 'awoof', plans: airtelAwoofPlans, title: 'AIRTEL AWOOF', svg: svgShapes.airtel },
      { provider: 'airtel', subType: 'cg', plans: airtelCgPlans, title: 'AIRTEL CG', svg: svgShapes.airtel },
      { provider: 'glo', subType: 'cg', plans: gloCgPlans, title: 'GLO CG', svg: svgShapes.glo },
      { provider: 'glo', subType: 'gifting', plans: gloGiftingPlans, title: 'GLO GIFTING', svg: svgShapes.glo },
      { provider: 'ninemobile', subType: '', plans: ninemobilePlans, title: '9MOBILE', svg: svgShapes.ninemobile }
    ];

    const awoofSection = modal.querySelector('.plan-section.awoof-section');
    const giftingSection = modal.querySelector('.plan-section.gifting-section');

    if (giftingSection) {
      giftingSection.style.display = activeProvider === 'ninemobile' ? 'none' : 'block';
      console.log(`[DEBUG] renderModalPlans: Gifting section display set to ${giftingSection.style.display} for provider ${activeProvider}`);
    }
    if (awoofSection) {
      awoofSection.style.display = 'block';
      console.log(`[DEBUG] renderModalPlans: Awoof section display set to ${awoofSection.style.display} for provider ${activeProvider}`);
    }

    const providerSections = sectionMap.filter(s => s.provider === activeProvider);

    if (providerSections.length >= 1 && awoofSection) {
      const { provider, subType, plans, title, svg } = providerSections[0];
      awoofSection.setAttribute('data-provider', provider);
      const grid = awoofSection.querySelector('.plans-grid');
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
      const header = awoofSection.querySelector('.section-header');
      if (header) {
        const existingSvg = header.querySelector('svg');
        if (existingSvg) existingSvg.remove();
        header.insertAdjacentHTML('afterbegin', svg);
        const h2 = header.querySelector('h2');
        if (h2) h2.textContent = title;
      }
      console.log(`[DEBUG] renderModalPlans: Rendered ${title} section for ${provider}`);
    }

    if (providerSections.length >= 2 && giftingSection) {
      const { provider, subType, plans, title, svg } = providerSections[1];
      giftingSection.setAttribute('data-provider', provider);
      const grid = giftingSection.querySelector('.plans-grid');
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
      const header = giftingSection.querySelector('.section-header');
      if (header) {
        const existingSvg = header.querySelector('svg');
        if (existingSvg) existingSvg.remove();
        header.insertAdjacentHTML('afterbegin', svg);
        const h2 = header.querySelector('h2');
        if (h2) h2.textContent = title;
      }
      console.log(`[DEBUG] renderModalPlans: Rendered ${title} section for ${provider}`);
    }
  }

  // --- LOG PLAN IDs ---
  function logPlanIDs() {
    const dashboardPlanIDs = Array.from(plansRow.querySelectorAll('.plan-box')).map(p => p.getAttribute('data-id'));
    const modalPlanIDs = Array.from(modal.querySelectorAll('.plan-box')).map(p => p.getAttribute('data-id'));
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

    const modalPlan = modal.querySelector(`.plan-box[data-id="${id}"]`);
    if (modalPlan) {
      modalPlan.classList.add('selected', activeProvider);
      console.log('[RAW LOG] Modal plan selected for id:', id, modalPlan.textContent.trim());
    } else {
      console.log('[RAW LOG] No modal plan found for id:', id);
      const allModalPlans = Array.from(modal.querySelectorAll('.plan-box'));
      console.log('[RAW LOG] Modal plan IDs:', allModalPlans.map(p => p.getAttribute('data-id')));
    }

    document.querySelectorAll('.plan-box').forEach(p => {
      const amount = p.querySelector('.plan-amount');
      if (amount && !p.closest('.modal-content')) {
        if (p.classList.contains('selected')) {
          amount.classList.add('plan-price');
        } else {
          amount.classList.remove('plan-price');
        }
      }
      if (amount && p.closest('.modal-content')) {
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
    const isModalClick = plan.closest('.modal-content');
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

    modalContent.scrollTop = 0;
    console.log('[DEBUG] openModal: Scroll position reset to top for provider:', activeProvider);
    const awoofSection = modal.querySelector('.plan-section.awoof-section');
    const giftingSection = modal.querySelector('.plan-section.gifting-section');
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
      modal.querySelectorAll('.plan-box.selected').forEach(p => p.classList.remove('selected'));
      const modalPlan = modal.querySelector(`.plan-box[data-id="${id}"]`);
      if (modalPlan) {
        modalPlan.classList.add('selected');
        console.log('[RAW LOG] Modal plan selected on openModal. Plan ID:', id, 'Text:', modalPlan.textContent.trim());
      } else {
        console.log('[RAW LOG] openModal: No matching modal plan for ID', id);
        const allModalPlans = Array.from(modal.querySelectorAll('.plan-box'));
        console.log('[RAW LOG] openModal: Modal plan IDs:', allModalPlans.map(p => p.getAttribute('data-id')));
      }
    }
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    modal.focus();
    history.pushState({ popup: true }, '', location.href);
    setTimeout(() => {
      const modalSelected = modal.querySelector('.plan-box.selected');
      if (modalSelected) {
        modalSelected.scrollIntoView({ behavior: 'smooth', block: 'center' });
        console.log('[RAW LOG] Modal auto-scrolled to selected plan:', modalSelected.textContent.trim());
      }
    }, 50);
  }

  // --- CLOSE PLANS MODAL ---
  function closeModal() {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    modalContent.style.transform = 'translateY(0)';
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
    const modal = document.getElementById('checkoutModal');
    if (!modal) {
      console.error('[ERROR] openCheckoutModal: #checkoutModal not found in DOM');
      return;
    }
    const modalContent = modal.querySelector('.modal-content');
    if (!modalContent) {
      console.error('[ERROR] openCheckoutModal: .modal-content not found');
      return;
    }
    modal.style.display = 'none';
    modal.classList.remove('active');
    modalContent.style.transform = 'translateY(0)';
    renderCheckoutModal();
    setTimeout(() => {
      modal.style.display = 'flex';
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      modal.focus();
      history.pushState({ popup: true }, '', location.href);
      console.log('[DEBUG] openCheckoutModal: Modal opened, display:', modal.style.display, 'active:', modal.classList.contains('active'));
    }, 50);
  }

  // --- CLOSE CHECKOUT MODAL ---
  function closeCheckoutModal() {
    const modal = document.getElementById('checkoutModal');
    if (!modal) {
      console.error('[ERROR] closeCheckoutModal: #checkoutModal not found');
      return;
    }
    const modalContent = modal.querySelector('.modal-content');
    modal.classList.remove('active');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    modalContent.style.transform = 'translateY(100%)';
    if (history.state && history.state.popup) {
      history.back();
      console.log('[DEBUG] closeCheckoutModal: History state popped');
    }
    console.log('[DEBUG] closeCheckoutModal: Modal closed, display:', modal.style.display, 'active:', modal.classList.length);
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
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal();
  });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  let startY = 0, currentY = 0, translateY = 0, dragging = false;
  const pullThreshold = 120;

  function handleTouchStart(e) {
    if (modalContent.scrollTop > 0) return;
    dragging = true;
    startY = e.touches[0].clientY;
    translateY = 0;
    modalContent.style.transition = 'none';
  }

  function handleTouchMove(e) {
    if (!dragging) return;
    currentY = e.touches[0].clientY;
    let diff = currentY - startY;
    if (diff > 0) {
      let resistance = diff < 60 ? 1 : diff < 120 ? 0.8 : 0.6;
      translateY = diff * resistance;
      modalContent.style.transform = `translateY(${translateY}px)`;
      e.preventDefault();
    }
  }

  function handleTouchEnd() {
    if (!dragging) return;
    dragging = false;
    modalContent.style.transition = 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)';
    if (translateY > pullThreshold) {
      modalContent.style.transform = `translateY(100%)`;
      setTimeout(closeModal, 200);
    } else {
      modalContent.style.transform = 'translateY(0)';
    }
  }

  pullHandle?.addEventListener('touchstart', handleTouchStart);
  pullHandle?.addEventListener('touchmove', handleTouchMove, { passive: false });
  pullHandle?.addEventListener('touchend', handleTouchEnd);
  modalContent.addEventListener('touchstart', handleTouchStart);
  modalContent.addEventListener('touchmove', handleTouchMove, { passive: false });
  modalContent.addEventListener('touchend', handleTouchEnd);

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
  const setupPinBtn = document.querySelector('.card.pin');
  const pinModal = document.getElementById('pinModal');
  const closePinModal = document.getElementById('closePinModal');
  const pinTitle = pinModal.querySelector('.pin-header h2');
  const pinSubtitle = pinModal.querySelector('.firewall-icon p');
  const pinInputs = document.querySelectorAll('.pin-inputs input');
  const keypadButtons = document.querySelectorAll('.pin-keypad button');
  const deleteKey = document.getElementById('deleteKey');

  const pinAlert = document.getElementById('pinAlert');
  const pinAlertMsg = document.getElementById('pinAlertMsg');

  let currentPin = "";
  let firstPin = "";
  let step = "create"; // "create" | "confirm"

  // Reset PIN input boxes
  function resetInputs() {
    currentPin = "";
    pinInputs.forEach(input => input.classList.remove("filled"));
  }
  // Open PIN modal for re-authentication
  // In dashboard.js, modify openPinModalForReauth
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


  // Show custom alert
  function showAlert(message, autoClose = false) {
    pinAlertMsg.textContent = message;
    pinAlert.classList.remove("hidden");
    setTimeout(() => pinAlert.classList.add("show"), 10);
    if (autoClose) {
      setTimeout(() => {
        pinModal.classList.add('hidden');
        resetInputs();
      }, 1200);
    } else {
      setTimeout(() => {
        document.body.addEventListener("click", dismissAlert, { once: true });
      }, 300);
    }
  }


  // Hide alert
  function dismissAlert() {
    pinAlert.classList.remove("show");
    setTimeout(() => pinAlert.classList.add("hidden"), 300);
  }

  // Open modal
  setupPinBtn.addEventListener('click', () => {
    pinModal.classList.remove('hidden');
    step = "create";
    pinTitle.textContent = "Create PIN";
    pinSubtitle.textContent = "Create a 4-digit PIN";
    resetInputs();
  });

  // Close/back button
  closePinModal.addEventListener('click', () => {
    if (step === "confirm") {
      step = "create";
      pinTitle.textContent = "Create PIN";
      pinSubtitle.textContent = "Create a 4-digit PIN";
      resetInputs();
    } else {
      pinModal.classList.add('hidden');
      resetInputs();
    }
  });

  // Update PIN keypad logic to handle reauth step
  keypadButtons.forEach(btn => {
  btn.addEventListener('click', async () => {
    const val = btn.textContent.trim();
    if (!val || isNaN(val)) return;

    if (currentPin.length < 4) {
      currentPin += val;
      pinInputs[currentPin.length - 1].classList.add('filled');
      pinInputs[currentPin.length - 1].value = '*';
    }

    if (currentPin.length === 4) {
      if (step === 'create') {
        firstPin = currentPin;
        step = 'confirm';
        pinTitle.textContent = 'Confirm PIN';
        pinSubtitle.textContent = 'Confirm your 4-digit PIN';
        resetInputs();
      } else if (step === 'confirm') {
        if (currentPin === firstPin) {
          try {
            await fetch('https://api.flexgig.com.ng/api/save-pin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin: currentPin }),
              credentials: 'include',
            });
            localStorage.setItem('userPin', currentPin); // Mock storage
            console.log('[dashboard.js] PIN setup successfully:', currentPin);
            showAlert('PIN created successfully!', true);
            pinModal.classList.add('hidden');
            resetInputs();
          } catch (err) {
            console.error('[dashboard.js] PIN save error:', err);
            showAlert('Failed to save PIN. Please try again.');
            resetInputs();
          }
        } else {
          console.error('[dashboard.js] PIN mismatch');
          showAlert('Oops! The PINs do not match. Please try again.');
          step = 'create';
          pinTitle.textContent = 'Create PIN';
          pinSubtitle.textContent = 'Create a 4-digit PIN';
          resetInputs();
        }
      } else if (step === 'reauth') {
        try {
          const res = await fetch('https://api.flexgig.com.ng/api/verify-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: currentPin }),
            credentials: 'include',
          });
          if (!res.ok) {
            throw new Error('Invalid PIN');
          }
          const { user } = await res.json();
          localStorage.setItem('userEmail', user.email || '');
          localStorage.setItem('firstName', user.fullName?.split(' ')[0] || '');
          localStorage.setItem('username', user.username || '');
          localStorage.setItem('phoneNumber', user.phoneNumber || '');
          localStorage.setItem('address', user.address || '');
          localStorage.setItem('profilePicture', user.profilePicture || '');
          await updateGreetingAndAvatar(user.username, user.fullName?.split(' ')[0]);
          await loadUserProfile();
          updateBalanceDisplay();
          pinModal.classList.add('hidden');
          resetInputs();
          console.log('[dashboard.js] PIN re-auth: Session restored');
        } catch (err) {
          console.error('[dashboard.js] PIN re-auth error:', err);
          showAlert('Invalid PIN or session. Redirecting to login...');
          setTimeout(() => {
            window.location.href = '/';
          }, 1200);
        }
      }
    }
  });
});

  // Handle delete
  deleteKey.addEventListener('click', () => {
    if (currentPin.length > 0) {
      pinInputs[currentPin.length - 1].classList.remove("filled");
      currentPin = currentPin.slice(0, -1);
    }
  });


// --- Helper: get file from input safely and ensure FormData has it ---
function ensureFileInFormData(formData, inputEl, fieldName = 'profilePicture') {
  // If the input has a named file already, we assume it's included.
  try {
    const existing = formData.get(fieldName);
    if (existing instanceof File) return; // already present
  } catch (e) {
    // ignore
  }

  // Append file manually if input has files
  if (inputEl && inputEl.files && inputEl.files[0]) {
    formData.set(fieldName, inputEl.files[0], inputEl.files[0].name);
  }
}

// --- Updated submit handler (replace your existing one) ---
if (updateProfileForm) {
  updateProfileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!saveProfileBtn || saveProfileBtn.disabled) {
      console.log('[DEBUG] updateProfileForm: Aborted - submit disabled');
      return;
    }

    // Mark touched + validate
    Object.keys(fieldTouched).forEach(k => fieldTouched[k] = true);
    validateProfileForm(true);
    if (saveProfileBtn.disabled) {
      console.log('[DEBUG] updateProfileForm: Aborted - invalid after validation');
      return;
    }

    try {
      // Build FormData
      const formData = new FormData(updateProfileForm);

      // Ensure email present (disabled inputs aren't included automatically)
      formData.set('email', localStorage.getItem('userEmail') || '');

      // Clean phone
      const rawPhone = formData.get('phoneNumber') || '';
      const cleanedPhone = ('' + rawPhone).replace(/\s/g, '');
      formData.set('phoneNumber', cleanedPhone);

      // Make sure file is actually included even if input has no name attr
      ensureFileInFormData(formData, profilePictureInput, 'profilePicture');

      // DEBUG: print what we are about to send (without binary)
      const dump = {};
      for (const [k, v] of formData.entries()) {
        dump[k] = v instanceof File ? `File: ${v.name} (${v.type}, ${v.size})` : v;
      }
      console.log('[DEBUG] updateProfileForm: sending formData:', dump);

      // POST to update endpoint
      const response = await fetch('https://api.flexgig.com.ng/api/profile/update', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
          // IMPORTANT: Do NOT set Content-Type when sending FormData
        },
        body: formData,
        credentials: 'include'
      });

      // Parse response safely (try JSON, fallback to text)
      let data;
      let textBody = '';
      try {
        data = await response.clone().json();
      } catch (jsonErr) {
        textBody = await response.clone().text();
        console.warn('[DEBUG] updateProfileForm: response not JSON:', textBody);
      }

      if (!response.ok) {
        const serverMsg = (data && (data.error || data.message)) || textBody || `Status ${response.status}`;
        throw new Error(serverMsg);
      }

      // --- Success: prefer server-returned profile data to update UI immediately ---
      // Check common possible shapes:
      //  - { profile: { profilePicture: 'https://...' } }
      //  - { profilePicture: 'https://...' }
      //  - { data: { profilePicture: '...' } }
      let returnedProfilePicture = '';
      let returnedProfile = null;

      if (data) {
        if (data.profile && data.profile.profilePicture) {
          returnedProfilePicture = data.profile.profilePicture;
          returnedProfile = data.profile;
        } else if (data.profilePicture) {
          returnedProfilePicture = data.profilePicture;
        } else if (data.data && data.data.profilePicture) {
          returnedProfilePicture = data.data.profilePicture;
          returnedProfile = data.data;
        } else if (data.profile && data.profile.picture_url) {
          returnedProfilePicture = data.profile.picture_url;
          returnedProfile = data.profile;
        }
      }

      // If no returned picture but server returned other profile object, attempt to find any URL
      if (!returnedProfilePicture && data && data.profile) {
        // try to find first string that looks like image url
        for (const v of Object.values(data.profile)) {
          if (typeof v === 'string' && /^(https?:\/\/|\/|data:image\/)/i.test(v)) {
            returnedProfilePicture = v;
            break;
          }
        }
      }

      // Update localStorage using returned server data when available
      const newUsername = formData.get('username')?.trim() || localStorage.getItem('username') || '';
      const newFullName = formData.get('fullName')?.trim() || localStorage.getItem('fullName') || '';
      const newAddress = formData.get('address')?.trim() || localStorage.getItem('address') || '';
      const newPhone = cleanedPhone || localStorage.getItem('phoneNumber') || '';

      localStorage.setItem('username', newUsername);
      localStorage.setItem('firstName', newFullName.split(' ')[0] || '');
      localStorage.setItem('fullName', newFullName);
      localStorage.setItem('phoneNumber', newPhone);
      localStorage.setItem('address', newAddress);

      if (returnedProfilePicture) {
        // canonicalize relative URLs (if server sent relative path)
        let canonical = returnedProfilePicture;
        if (canonical.startsWith('/')) {
          canonical = `${location.protocol}//${location.host}${canonical}`;
        }
        localStorage.setItem('profilePicture', canonical);
      } else {
        // If server didn't return profilePicture, keep whatever we previewed (but prefer server next time)
        // Do nothing here to avoid overwriting with empty string
      }

      // Immediately update the DOM using your function (prefer POST response)
      updateGreetingAndAvatar(newUsername, newFullName.split(' ')[0] || '');

      // Show success
      const notification = document.getElementById('profileUpdateNotification');
      if (notification) {
        notification.classList.add('active');
        setTimeout(() => notification.classList.remove('active'), 3000);
      }

      closeUpdateProfileModal();

      // Finally: refresh server profile but bypass cache (avoid 304)
      if (typeof loadUserProfile === 'function') {
        try {
          // If loadUserProfile accepts options
          await loadUserProfile({ cacheBust: true });
        } catch (err) {
          // fallback: manual GET with no-store
          try {
            const r = await fetch(`/api/profile?ts=${Date.now()}`, { method: 'GET', credentials: 'include', headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' } });
            if (r.ok) {
              const d = await r.json();
              // normalize server response shape if needed:
              const pic = (d.profile && d.profile.profilePicture) || d.profilePicture || d.profile?.picture_url || '';
              if (pic) {
                const canonical = pic.startsWith('/') ? `${location.protocol}//${location.host}${pic}` : pic;
                localStorage.setItem('profilePicture', canonical);
                updateGreetingAndAvatar(newUsername, newFullName.split(' ')[0] || '');
              }
            }
          } catch (e) {
            console.warn('[WARN] updateProfileForm: fallback loadUserProfile failed', e);
          }
        }
      }

    } catch (err) {
      console.error('[ERROR] updateProfileForm:', err);
      // Friendly UI errors
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
    }
  });
}


// --- UPDATE PROFILE MODAL ---
// --- UPDATE PROFILE MODAL ---
// --- UPDATE PROFILE MODAL ---
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

const updateProfileCard = document.querySelector('.card.update-profile');
if (updateProfileCard) {
  updateProfileCard.addEventListener('click', () => {
    console.log('[DEBUG] Update Profile card clicked');
    openUpdateProfileModal({});
  });
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
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// --- Username Availability Check ---
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
    const data = await response.json();
    isUsernameAvailable = response.ok && data.available;
    console.log('[DEBUG] checkUsernameAvailability:', { username, available: isUsernameAvailable });
    return isUsernameAvailable;
  } catch (err) {
    console.error('[ERROR] checkUsernameAvailability:', err);
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
  if (!fieldTouched[field]) return true;

  let isValid = true;
  const inputElement = window[`${field}Input`];
  const errorElement = window[`${field}Error`];

  // Safeguard: Skip if elements are missing (e.g., modal not open)
  if (!inputElement || !errorElement) {
    console.warn(`[WARN] validateField: Skipping validation for ${field} - elements not found (modal may not be open)`);
    return true; // Treat as valid to avoid blocking form
  }

  const value = inputElement?.value || '';

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
      const file = profilePictureInput.files[0];
      if (file && !['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
        errorElement.textContent = 'Please upload a valid image (JPEG, PNG, or GIF)';
        errorElement.classList.add('active');
        isValid = false;
      } else if (file && file.size > 2 * 1024 * 1024) {
        errorElement.textContent = 'File size must be less than 2MB';
        errorElement.classList.add('active');
        isValid = false;
      } else {
        errorElement.textContent = '';
        errorElement.classList.remove('active');
      }
      break;
  }
  return isValid;
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

  // Remove existing input listeners to prevent duplicates
  const inputs = [fullNameInput, usernameInput, phoneNumberInput, addressInput, profilePictureInput];
  inputs.forEach(input => {
    if (input) {
      input.removeEventListener('input', () => {});
      input.removeEventListener('change', () => {});
      input.removeEventListener('keypress', () => {});
      input.removeEventListener('beforeinput', () => {});
      input.removeEventListener('keydown', () => {});
      input.removeEventListener('paste', () => {});
    }
  });

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
  updateProfileModal.classList.remove('active');
  updateProfileModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  
  setTimeout(() => {
    updateProfileModal.style.display = 'none';
  }, 400); // Match CSS transition duration
  console.log('[DEBUG] closeUpdateProfileModal: Modal closed');
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
if (updateProfileForm) {
  updateProfileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!saveProfileBtn || saveProfileBtn.disabled) {
      console.log('[DEBUG] updateProfileForm: Form invalid or button disabled, submission aborted');
      return;
    }

    // Mark all fields as touched and validate before submission
    // This ensures errors are shown if any fields are invalid.
    Object.keys(fieldTouched).forEach(key => fieldTouched[key] = true);
    validateProfileForm(true);
    if (saveProfileBtn.disabled) {
      console.log('[DEBUG] updateProfileForm: Form invalid after validation, submission aborted');
      return;
    }

    // Prepare FormData for submission (includes file if uploaded)
    const formData = new FormData(updateProfileForm);
    // Ensure email is included (from localStorage, as it's disabled)
    formData.set('email', localStorage.getItem('userEmail') || '');
    // Clean phone number: remove spaces for server consistency
    const phoneNumber = formData.get('phoneNumber')?.replace(/\s/g, '');
    formData.set('phoneNumber', phoneNumber || '');

    // Get current values for restriction checks
    const currentUsername = localStorage.getItem('username') || '';
    const newUsername = formData.get('username')?.trim() || '';
    const currentPhoneNumber = localStorage.getItem('phoneNumber') || '';
    const currentFullName = localStorage.getItem('fullName') || '';
    const newFullName = formData.get('fullName')?.trim() || '';
    const currentAddress = localStorage.getItem('address')?.trim() || '';
    const newAddress = formData.get('address')?.trim() || '';

    // Enforce edit restrictions (e.g., phone/address can't be changed if set)
    if (currentPhoneNumber && phoneNumber !== currentPhoneNumber) return;
    if (localStorage.getItem('fullNameEdited') === 'true' && newFullName !== currentFullName) return;
    if (currentAddress && newAddress !== currentAddress) return;

    // Username change cooldown (90 days)
    const lastUpdate = localStorage.getItem('lastUsernameUpdate');
    if (currentUsername && newUsername !== currentUsername && lastUpdate) {
      const daysSinceUpdate = (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 90) {
        if (usernameError) {
          usernameError.textContent = `You can update your username again in ${Math.ceil(90 - daysSinceUpdate)} days`;
          usernameError.classList.add('active');
          usernameInput.classList.add('invalid');
        }
        return;
      }
    }

    try {
      // Debug: Log form data being sent (without file contents)
      const formDataObj = {};
      for (const [key, value] of formData.entries()) {
        formDataObj[key] = value instanceof File ? `File: ${value.name}` : value;
      }
      console.log('[DEBUG] updateProfileForm: Submitting form data:', formDataObj);

      // Submit to server (server handles file upload and returns updated profile with URL)
      const response = await fetch('https://api.flexgig.com.ng/api/profile/update', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
        },
        body: formData,
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update profile');

      // Update localStorage with server data (ensures consistency)
      const fullName = newFullName;
      localStorage.setItem('username', newUsername);
      localStorage.setItem('firstName', fullName.split(' ')[0] || '');
      localStorage.setItem('fullName', fullName);
      localStorage.setItem('phoneNumber', phoneNumber || '');
      localStorage.setItem('address', newAddress);
      localStorage.setItem(
        'fullNameEdited',
        localStorage.getItem('fullNameEdited') === 'true' || fullName !== currentFullName ? 'true' : 'false'
      );
      if (newUsername !== currentUsername) {
        localStorage.setItem('lastUsernameUpdate', new Date().toISOString());
      }

      // Key fix: Set profile picture from server response (URL, not base64)
      // This ensures the dashboard uses the persistent server-hosted image.
      localStorage.setItem('profilePicture', data.profile.profilePicture || '');

      // Immediately update dashboard avatar with the new picture
      updateGreetingAndAvatar(newUsername, fullName.split(' ')[0]);

      // Show success notification
      const notification = document.getElementById('profileUpdateNotification');
      if (notification) {
        notification.classList.add('active');
        setTimeout(() => notification.classList.remove('active'), 3000);
      }

      // Close modal and reload profile for full sync
      closeUpdateProfileModal();
      await loadUserProfile();  // Ensures any other server changes are pulled (e.g., if server modifies something)
    } catch (err) {
      console.error('[ERROR] updateProfileForm:', err);
      if (err.message.includes('Username already taken')) {
        if (usernameError) {
          usernameError.textContent = 'Username is already taken';
          usernameError.classList.add('active');
          usernameInput.classList.add('invalid');
        }
      } else {
        const generalError = document.createElement('div');
        generalError.className = 'error-message active';
        generalError.textContent = `Failed to update profile: ${err.message}`;
        updateProfileForm.prepend(generalError);
        setTimeout(() => generalError.remove(), 3000);
      }
    }
  });
}


    // --- SVG INJECTION FOR ICONS ---
    document.querySelectorAll('.svg-inject').forEach(el =>
    fetch(el.src)
      .then(r => r.text())
      .then(svg => {
        el.outerHTML = svg;
      })
    );
  



    










  // Watch your steps
});




