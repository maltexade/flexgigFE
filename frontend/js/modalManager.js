(function () {
  'use strict';

  // Toggle for dev logs (set to false in prod)
  const DEBUG_LOGS = true;

  // Debug overlay config
  const DEBUG_MAX_LINES = 600;
  let debugOverlay = null;
  let debugVisible = false;
  let debugLines = 0;

  // Track elements we've intentionally modified recently to differentiate external changes
  const recentModifications = new WeakMap();
  const MODIFICATION_GRACE_MS = 600;

  // Create debug overlay and controls
  function createDebugOverlay() {
    
  }

  function updateCounter() {
    const counter = document.getElementById('mm-debug-counter');
    const toggle = document.getElementById('mm-debug-toggle');
    if (!counter || !toggle) return;
    counter.style.display = debugVisible ? 'none' : 'block';
    counter.textContent = `${debugLines} logs`;
  }

  function appendDebugLine(msg, color = null, cssClass = '') {
    if (!DEBUG_LOGS) return;
    try {
      if (!debugOverlay) createDebugOverlay();
      // respect paused state
      if (debugOverlay && debugOverlay.dataset.paused === 'true') return;

      // Cap lines
      if (debugLines >= DEBUG_MAX_LINES) {
        // remove oldest third
        const nodes = debugOverlay.querySelectorAll('.mm-debug-line');
        const removeCount = Math.max(1, Math.floor(nodes.length / 3));
        for (let i = 0; i < removeCount; i++) {
          if (nodes[i]) nodes[i].remove();
        }
        debugLines = debugOverlay.querySelectorAll('.mm-debug-line').length;
      }

      const line = document.createElement('div');
      line.className = `mm-debug-line ${cssClass}`.trim();
      if (color) line.style.color = color;
      line.textContent = msg;
      // insert at end
      debugOverlay.appendChild(line);
      debugOverlay.scrollTop = debugOverlay.scrollHeight;
      debugLines++;
      updateCounter();
    } catch (e) {
      // ignore overlay errors
    }
  }

  function safeStringify(obj) {
    try {
      return JSON.stringify(obj, (k, v) => {
        if (typeof v === 'function') return '[Function]';
        return v;
      }, 2);
    } catch (e) {
      try {
        return String(obj);
      } catch (e2) {
        return '[unserializable]';
      }
    }
  }

  function timestamp() {
    const d = new Date();
    return d.toISOString().replace('T', ' ').replace('Z', '');
  }

  function log(type, msg, data = {}) {
    if (!DEBUG_LOGS) return;
    const formatted = `${timestamp()} [${type}] ${msg}${data && Object.keys(data).length ? ' ' + safeStringify(data) : ''}`;
    // console
    if (console && console[type]) {
      try { console[type](`[ModalManager] ${msg}`, data); } catch (e) { console.log(`[ModalManager] ${msg}`, data); }
    } else {
      console.log(`[ModalManager] ${msg}`, data);
    }

    // overlay: color based on type and special class for error/alert
    let color = null;
    let cssClass = '';
    if (type === 'error') { color = '#ff6b6b'; cssClass = 'mm-debug-err'; }
    else if (type === 'warn') { color = '#ffd166'; cssClass = 'mm-debug-warn'; }
    else if (type === 'info') { color = '#8ecae6'; cssClass = 'mm-debug-info'; }
    else { color = '#cbd5e1'; cssClass = ''; }

    appendDebugLine(formatted, color, cssClass);
  }

  // Add an assert helper that highlights alerts (flashing red) in the overlay
  function assert(condition, msg, data = {}) {
    if (condition) {
      log('debug', `ASSERT OK: ${msg}`, data);
      return true;
    }
    const formatted = `${timestamp()} [ASSERT FAIL] ${msg}${data && Object.keys(data).length ? ' ' + safeStringify(data) : ''}`;
    if (console && console.error) console.error('[ModalManager] ASSERT FAIL:', msg, data);
    appendDebugLine(formatted, '#ffb4b4', 'mm-debug-alert');
    log('error', `ASSERT FAIL: ${msg}`, data);
    return false;
  }

  // Retrieve raw logs (plain text) from overlay
  function getRawLogs() {
    if (!debugOverlay) return '';
    const lines = debugOverlay.querySelectorAll('.mm-debug-line');
    const out = [];
    lines.forEach(n => {
      out.push(n.textContent.trim());
    });
    return out.join('\n');
  }

  function downloadRawLogs() {
    try {
      const data = getRawLogs();
      const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const name = `modal-manager-logs-${new Date().toISOString().replace(/[:.]/g,'-')}.log`;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      appendDebugLine(`${timestamp()} [info] Downloaded logs as ${name}`, '#8ecae6');
    } catch (e) {
      appendDebugLine(`${timestamp()} [error] Failed to download logs: ${e}`, '#ff6b6b');
    }
  }

  async function copyRawLogs() {
    try {
      const data = getRawLogs();
      if (!navigator.clipboard) {
        appendDebugLine(`${timestamp()} [warn] Clipboard API not available`, '#ffd166');
        return;
      }
      await navigator.clipboard.writeText(data);
      appendDebugLine(`${timestamp()} [info] Copied logs to clipboard`, '#8ecae6');
    } catch (e) {
      appendDebugLine(`${timestamp()} [error] Failed to copy logs: ${e}`, '#ff6b6b');
    }
  }

  async function sendRawLogsTo(url) {
    try {
      const data = getRawLogs();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: data,
      });
      if (!res.ok) {
        appendDebugLine(`${timestamp()} [warn] Sending logs returned ${res.status}`, '#ffd166');
      } else {
        appendDebugLine(`${timestamp()} [info] Sent logs to ${url}`, '#8ecae6');
      }
    } catch (e) {
      appendDebugLine(`${timestamp()} [error] Failed to send logs: ${e}`, '#ff6b6b');
    }
  }

  // capture stack + snapshot for an element and reason
  function captureStackForElement(el, reason = 'external') {
    try {
      const stack = (new Error(`captureStackForElement: ${reason}`)).stack || '(no stack)';
      const outer = el && el.outerHTML ? el.outerHTML.slice(0, 2000) : '(no outerHTML)';
      const desc = describeElement(el);
      const txt = `${timestamp()} [trace] ${reason} detected on ${desc}\nouterHTML: ${outer}\nstack:\n${stack}`;
      appendDebugLine(txt, '#ffb4b4', 'mm-debug-alert');
      // console.warn('[ModalManager] captureStackForElement', { reason, desc, stack });
    } catch (e) {
      console.warn('captureStackForElement failed', e);
    }
  }

  // Modal stack to track open modals
  const openModalsStack = [];
  let currentDepth = 0;
  let isProcessingPopstate = false;

  // compute next/top z-index for a modal so it always appears above any existing modal
  function getNextModalZIndex() {
    const BASE = 10000;
    let max = BASE;
    openModalsStack.forEach(item => {
      try {
        const el = item.modal;
        const inline = el && el.style && el.style.zIndex ? parseInt(el.style.zIndex, 10) : NaN;
        const computed = el ? parseInt(window.getComputedStyle(el).zIndex, 10) : NaN;
        const candidate = (!isNaN(inline) ? inline : (!isNaN(computed) ? computed : 0));
        if (candidate > max) max = candidate;
      } catch (e) { /* ignore parse issues */ }
    });
    return max + 10;
  }

// ===== Active State Management =====

// Map of modalId → primary trigger element ID (used only for finding triggers)
const modalTriggerMap = {
  home: 'homeNavLink',
  historyModal: 'historyNavLink',
  settingsModal: 'settingsBtn',
  securityModal: 'securityBtn',
  helpSupportModal: 'helpSupportBtn',
  referralModal: 'referralsBtn',
  allPlansModal: 'see-all-plans',
  pinModal: 'dashboardPinCard',
  updateProfileModal: 'dashboardUpdateProfileCard',
  changePwdModal: 'changePWD',
  checkoutModal: 'continueBtn',
  addMoneyModal: 'addMoneyBtn',
  'fxg-transfer-modal': 'fxg-open-transfer-modal',
  'fxg-transfer-confirm-modal': 'fxg-continue',
  // Add new triggers here as needed
};

// THESE ARE THE ONLY MODALS THAT SHOULD EVER HIGHLIGHT A MAIN NAVIGATION TAB
// If a modal is not in this list → it will NOT manage .active / aria-current on nav items
const NAV_LINKED_MODALS = ['historyModal', 'settingsModal'];

// Helper: does this modal correspond to a main navigation tab?
function shouldManageActiveState(modalId) {
  return NAV_LINKED_MODALS.includes(modalId);
}
  // Helper: find all possible trigger elements for a modal id.
  function findTriggerElements(modalId) {
    const found = new Set();

    // 1) Try mapped id (legacy)
    const mapped = modalTriggerMap[modalId];
    if (mapped) {
      const byId = document.getElementById(mapped);
      if (byId) found.add(byId);
      // also try as selector if someone put a selector string in the map
      try {
        const sel = document.querySelectorAll(mapped);
        if (sel) sel.forEach(e => found.add(e));
      } catch (e) {
        // not a selector; ignore
      }
    }

    // 2) Common fallback selectors used in different codebases / mobile navs
    const fallbackSelectors = [
      `[data-modal-trigger="${modalId}"]`,
      `[data-trigger="${modalId}"]`,
      `[data-target="#${modalId}"]`,
      `[href="#${modalId}"]`,
      `.nav-item[data-modal="${modalId}"]`,
      `#${modalId}Trigger`,
      `#${modalId}Btn`,
      `.${modalId}-trigger`,
      `.nav-item.${modalId}`,
    ];

    fallbackSelectors.forEach(sel => {
      try { document.querySelectorAll(sel).forEach(el => found.add(el)); } catch (e) {}
    });

    // 3) If nothing found, try to guess based on modalId string (safe fail)
    if (found.size === 0) {
      const guess = document.querySelectorAll('.nav-item, [class*="nav-"], [class*="tab-"], a, button');
      guess.forEach(el => {
        try {
          if (
            el.getAttribute &&
            (
              el.getAttribute('data-modal') === modalId ||
              el.getAttribute('data-target') === `#${modalId}` ||
              el.getAttribute('href') === `#${modalId}` ||
              el.dataset?.modal === modalId ||
              el.id === modalTriggerMap[modalId]
            )
          ) {
            found.add(el);
          }
        } catch (e) { /* ignore */ }
      });
    }

    return Array.from(found);
  }

  // safe resolver: returns the modal element from the modals map or by id
function getModalElement(modalId) {
  try {
    if (modals && modals[modalId] && modals[modalId].element) return modals[modalId].element;
  } catch (e) {}
  return document.getElementById(modalId) || null;
}


  function markRecentModification(el) {
    try {
      recentModifications.set(el, Date.now());
    } catch (e) { /* ignore */ }
  }

  function wasRecentlyModified(el) {
    try {
      const t = recentModifications.get(el);
      return !!t && (Date.now() - t) < MODIFICATION_GRACE_MS;
    } catch (e) { return false; }
  }

  function clearActiveFromElement(el) {
    if (!el) return;
    el.classList.remove('active', 'selected', 'current', 'nav-active', 'tab-active');
    try {
      el.removeAttribute('aria-current');
      el.removeAttribute('aria-pressed');
      // record modification
      markRecentModification(el);
    } catch (e) { /* ignore */ }
  }
  window.clearActiveFromElement = window.clearActiveFromElement || clearActiveFromElement; // expose for modals to call on open/close

  // Describe element succinctly for logs
  function describeElement(el) {
    if (!el) return '(null)';
    try {
      const id = el.id ? `#${el.id}` : '';
      const cls = el.className ? `.${el.className.toString().replace(/\s+/g,'.')}` : '';
      const tag = el.tagName ? el.tagName.toLowerCase() : 'el';
      const href = el.getAttribute && el.getAttribute('href') ? ` href="${el.getAttribute('href')}"` : '';
      return `${tag}${id}${cls}${href}`;
    } catch (e) {
      return String(el);
    }
  }

  // Set or remove 'active' on triggers and verify results; if mismatch, assert and highlight
  function setTriggerActive(modalId, active = true) {
  const triggers = findTriggerElements(modalId);

  // Case 1: No real trigger exists (checkoutModal, allPlansModal, etc.)
  if (!triggers || triggers.length === 0) {
    log('debug', `setTriggerActive: No trigger elements found for ${modalId}.`);

    // Only when deactivating and no trigger exists → defensive global cleanup
    if (!active) {
      log('debug', `setTriggerActive: No trigger + deactivating → global fallback cleanup for ${modalId}`);
      const strayActives = document.querySelectorAll(
        '.nav-item.active, .current, .nav-active, .tab-active, [aria-current="true"], [aria-pressed="true"]'
      );
      strayActives.forEach(item => {
        clearActiveFromElement(item);
        markRecentModification(item);
      });
    }
    return;
  }

  // Debug info about found triggers
  const trgInfo = triggers.map(t => {
    try {
      return `${t.tagName.toLowerCase()}#${t.id || '(no-id)'}.${(t.className || '').replace(/\s+/g, '.')}`;
    } catch (e) {
      return String(t);
    }
  });
  log('debug', `setTriggerActive: Found ${triggers.length} trigger(s) for ${modalId}`, { triggers: trgInfo });

  if (active) {
    // 1. Clear navigation-related active states globally (safe, doesn't touch plan .selected)
    const navItems = document.querySelectorAll('.nav-item, [role="tab"], [aria-current], [aria-pressed]');
    navItems.forEach(item => {
      item.classList.remove('active', 'current', 'nav-active', 'tab-active');
      item.removeAttribute('aria-current');
      item.removeAttribute('aria-pressed');
      markRecentModification(item);
    });

    // 2. Activate the real triggers
    triggers.forEach(trigger => {
      trigger.classList.add('active');
      trigger.setAttribute('aria-current', 'true');
      markRecentModification(trigger);

      // Verify
      if (!trigger.classList.contains('active')) {
        assert(false, `Failed to add 'active' class to trigger for ${modalId}`, {
          trigger: trigger.id || trigger.className || trigger.tagName
        });
      }
    });

    log('debug', `setTriggerActive: Activated triggers for ${modalId}`, { modalId, triggers: trgInfo });
  } 
  else {
    // Deactivate ONLY the real triggers
    triggers.forEach(trigger => {
      const hadActive = trigger.classList.contains('active');

      // Fixed typo: was duplicated 'nav-active,' with a comma inside the string
      trigger.classList.remove('active', 'current', 'nav-active', 'tab-active');
      trigger.removeAttribute('aria-current');
      trigger.removeAttribute('aria-pressed');
      markRecentModification(trigger);

      // Forensic check if it somehow stayed active
      if (trigger.classList.contains('active')) {
        assert(false, `Active class still present after removal for ${modalId}`, {
          trigger: trigger.id || trigger.className || trigger.tagName,
          hadBefore: hadActive
        });
        captureStackForElement(trigger, 'active-still-present-after-removal');
      }
    });

    log('debug', `setTriggerActive: Deactivated triggers for ${modalId}`, { modalId, triggers: trgInfo });
  }
}
window.setTriggerActive = window.setTriggerActive || setTriggerActive; // expose for modals to call on open/close

  function setHomeActive() {
    const homeLink = document.getElementById('homeNavLink') || document.querySelector('[data-home-nav], .home-nav, a.home');
    if (!homeLink) {
      log('warn', 'setHomeActive: Home nav link not found; clearing all nav active classes as fallback');
      // fallback: clear all nav active classes
      const navItems = document.querySelectorAll('.nav-item, [class*="nav-"], [class*="tab-"], a, button');
      navItems.forEach(item => {
        item.classList.remove('active', 'selected', 'current', 'nav-active', 'tab-active');
        try { item.removeAttribute('aria-current'); item.removeAttribute('aria-pressed'); } catch (e) {}
      });
      return;
    }

    // Remove active from all nav items
    const navItems = document.querySelectorAll('.nav-item, [class*="nav-"], [class*="tab-"], a, button');
    navItems.forEach(item => {
      item.classList.remove('active', 'selected', 'current', 'nav-active', 'tab-active');
      try { item.removeAttribute('aria-current'); item.removeAttribute('aria-pressed'); } catch (e) {}
    });

    // Add active to home
    homeLink.classList.add('active');
    try { homeLink.setAttribute('aria-current', 'true'); } catch (e) {}
    markRecentModification(homeLink);
    log('debug', 'setHomeActive: Set home as active');
  }

  // Modal configuration
  const modals = {
    spwModal: { id: 'spwModal', element: null, hasPullHandle: false },
    resetPinModal: { id: 'resetPinModal', element: null, hasPullHandle: false },
    settingsModal: { id: 'settingsModal', element: null, hasPullHandle: false },
    helpSupportModal: { id: 'helpSupportModal', element: null, hasPullHandle: false },
    securityModal: { id: 'securityModal', element: null, hasPullHandle: false },
    securityPinModal: { id: 'securityPinModal', element: null, hasPullHandle: false },
    updateProfileModal: { id: 'updateProfileModal', element: null, hasPullHandle: false },
    pinModal: { id: 'pinModal', element: null, hasPullHandle: false },
    allPlansModal: { id: 'allPlansModal', element: null, hasPullHandle: true },
    contactModal: { id: 'contactModal', element: null, hasPullHandle: false },
    changePwdModal: { id: 'changePwdModal', element: null, hasPullHandle: false },
    rpResetModal: { id: 'rpResetModal', element: null, hasPullHandle: false },
    referralModal: { id: 'referralModal', element: null, hasPullHandle: false },
    checkoutModal: { id: 'checkoutModal', element: null, hasPullHandle: false },
    historyModal: { id: 'historyModal', element: null, hasPullHandle: false },
    addMoneyModal: {id: 'addMoneyModal', element: null, hasPullHandle: true},
    fxgTransferModal: { id: 'fxg-transfer-modal', element: null, hasPullHandle: false },
    'fxg-transfer-confirm-modal': {
      id: 'fxg-transfer-confirm-modal',
      element: null,
      hasPullHandle: false
    },
    fxgReceiptModal: { id: 'fxg-transfer-receipt-modal', element: null, hasPullHandle: false },
      receiptModal: { 
    id: 'receiptModal', 
    element: null, 
    hasPullHandle: false 
  },
  kycVerifyModal: { id: 'kycVerifyModal', element: null, hasPullHandle: false },
  };

  // ─────────────────────────────────────────────────────────────
// BOTTOM SHEET MODALS — prevent background scroll when open
// ─────────────────────────────────────────────────────────────
const bottomSheetModals = [
  'addMoneyModal',
  'historyModal',
  'allPlansModal',
  'fxg-transfer-modal',
  'fxg-transfer-confirm-modal',
  'fxgReceiptModal',
  'receiptModal',
  'kycVerifyModal'
];

function lockBodyScroll(lock = true) {
  if (lock) {
    // Store the current scroll position
    const scrollY = window.pageYOffset;
    
    // Lock scrolling without disturbing the background's position
    document.body.style.overflow = 'hidden';  // Prevent scrolling
    document.body.dataset.scrollY = scrollY + '';  // Store scroll position
  } else {
    // Retrieve the scroll position after unlocking
    const scrollY = parseInt(document.body.dataset.scrollY || '0', 10);
    
    // Unlock scrolling without disturbing the current scroll position
    document.body.style.overflow = '';  // Allow scrolling again
    
    // Restore the previous scroll position (but do not force scroll to 0)
    if (scrollY !== 0) {
      window.scrollTo(0, scrollY);
    }

    delete document.body.dataset.scrollY;  // Remove the stored scroll position
  }
}

// Modals that use CSS class-based animation (.open for slide-in)
const classAnimatedModals = ['fxg-transfer-modal', 'fxg-transfer-confirm-modal'];

  // Utility: Check if modal is visible
  function isModalVisible(modal) {
    if (!modal) {
      log('warn', 'isModalVisible: Modal is null or undefined');
      return false;
    }
    const cs = window.getComputedStyle(modal);
    const ariaHidden = modal.getAttribute('aria-hidden') === 'true' ? false : true;
    const isVisible =
      cs.display !== 'none' &&
      cs.visibility !== 'hidden' &&
      !modal.classList.contains('hidden') &&
      ariaHidden;
    if (isVisible !== (modal.dataset._lastVisible || false)) {
      log('debug', `isModalVisible: ${modal.id} now ${isVisible ? 'visible' : 'hidden'}`, {
        display: cs.display,
        visibility: cs.visibility,
        class: modal.className,
        'aria-hidden': modal.getAttribute('aria-hidden')
      });
      modal.dataset._lastVisible = isVisible;
    }
    return isVisible;
  }

// Replacement for applyTransition function
function applyTransition(modal, show, callback) {
  if (!modal) return callback?.();

  const isAllPlans = modal.id === 'allPlansModal';
  const isProfile = modal.id === 'updateProfileModal';
  const isTransfer = modal.id === 'fxg-transfer-modal';  // ADD THIS LINE
  const isConfirm = modal.id === 'fxg-transfer-confirm-modal';



  modal.style.transition = isAllPlans || isTransfer || isConfirm
  ? 'transform 0.28s cubic-bezier(0.18, 0.9, 0.32, 1), opacity 0.22s ease'
  : 'opacity 0.26s ease, transform 0.26s ease';

  let onTransitionEndCalled = false;

  const onTransitionEnd = () => {
    onTransitionEndCalled = true;
    modal.removeEventListener('transitionend', onTransitionEnd);

    if (!show) {
      // Only remove .active AFTER the exit animation finishes
      if (isAllPlans) modal.classList.remove('active');
      if (isTransfer || isConfirm) modal.classList.remove('show');  // ADD THIS LINE

      modal.classList.add('hidden');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      modal.setAttribute('inert', '');
    } else {
      modal.removeAttribute('inert');
      if (isAllPlans) modal.classList.add('active'); // ensure it's present
      if (isTransfer || isConfirm) modal.classList.add('show');  // ADD THIS LINE
    }

    if (!isProcessingPopstate) {
      log('debug', `applyTransition: ${modal.id} ${show ? 'shown' : 'hidden'}`);
    }
    callback?.();
  };

  modal.addEventListener('transitionend', onTransitionEnd);

  requestAnimationFrame(() => {
    if (show) {
      modal.style.opacity = '1';
      modal.style.visibility = 'visible';
      modal.style.transform = 'translateY(0)';
    } else {
      modal.style.opacity = '0';
      modal.style.visibility = 'visible'; // keep visible during animation

      if (isProfile) {
        modal.style.transform = 'translateX(-100%)';
      } else if (isAllPlans) {
        modal.style.transform = 'translateY(100%)';   // slide down
      } else {
        modal.style.transform = 'translateY(20px)';
      }
    }
  });

  // Failsafe timeout if transitionend missed (e.g., no style change detected)
  setTimeout(() => {
    if (!onTransitionEndCalled) {
      onTransitionEndCalled = true;
      onTransitionEnd();
      log('warn', `applyTransition: Forced onTransitionEnd for ${modal.id} (event missed)`);
    }
  }, 400);  // > transition duration
}

// Replacement for forceCloseModal function
function forceCloseModal(modalId) {
const allPlansModalEl = getModalElement('allPlansModal');
const allPlansModalContent = allPlansModalEl ? allPlansModalEl.querySelector('.plan-modal-content') : null;

  log('debug', `forceCloseModal: Forcing close of ${modalId}`);
  const modalConfig = modals[modalId];
  if (!modalConfig || !modalConfig.element) {
    log('error', `forceCloseModal: Modal config or element not found for ${modalId}`);
    return;
  }
  const modal = modalConfig.element;
  if (!isModalVisible(modal)) {
    log('debug', `forceCloseModal: Modal ${modalId} already closed`);
    const idx = openModalsStack.findIndex((item) => item.id === modalId);
    if (idx !== -1) {
      openModalsStack.splice(idx, 1);
      currentDepth = openModalsStack.length;
    }
    return;
  }
  if (document.activeElement && modal.contains(document.activeElement)) {
    // prefer to restore focus to a real content area
    const main = document.getElementById('mainContent') || document.querySelector('main') || document.body;
    try { main.focus(); } catch (e) { document.body.focus(); }
    log('debug', `forceCloseModal: Moved focus from ${modalId} to ${describeElement(main)}`);
  }
  
  // REMOVE ACTIVE STATE from closing modal BEFORE transition (defensive)
  if (modalId !== 'allPlansModal') {
    setTriggerActive(modalId, false);
    log('debug', `forceCloseModal: Removed active state from ${modalId}`);
  }
    if (modalId === 'allPlansModal') {
  allPlansModalContent.scrollTop = 0;  // Optional scroll reset when closing
}

  
  applyTransition(modal, false, () => {
    // cleanup focus trap if present
    try {
      if (modal._trapHandler) {
        modal.removeEventListener('keydown', modal._trapHandler);
        delete modal._trapHandler;
        log('debug', `forceCloseModal: Removed trapHandler from ${modalId}`);
      }
    } catch (e) { /* ignore */ }

    // restore body scroll if some other code locked it
    try {
      document.body.style.overflow = '';
      document.body.classList.remove('modal-open');
    } catch (e) {}

    modal.classList.add('hidden');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('inert', '');
    const idx = openModalsStack.findIndex((item) => item.id === modalId);
    if (idx !== -1) {
      openModalsStack.splice(idx, 1);
      currentDepth = openModalsStack.length;
      log('debug', `forceCloseModal: Modal ${modalId} closed, stack: ${openModalsStack.map((item) => item.id).join(', ')}, depth: ${currentDepth}`);
    }
    
    // For modals that were pushed onto history (fragments) - clear it so close-button doesn't leave a stale fragment
          // For modals that were pushed onto history (fragments)
    try {
      if (modalId === 'allPlansModal') {
        history.replaceState({ isModal: false }, '', window.location.pathname);
        log('debug', `forceCloseModal: Cleared history fragment for ${modalId}`);
      }
    } catch (e) {}

    // Check if there are any remaining modals
    const previousModal = openModalsStack[openModalsStack.length - 1];
    if (previousModal) {
      // Restore active state for previous modal
      if (previousModal.id !== 'allPlansModal') {
        setTriggerActive(previousModal.id, true);
      }
      const focusable = previousModal.modal.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) {
        focusable.focus();
        log('debug', `forceCloseModal: Restored focus to ${previousModal.id}`);
      } else {
        log('warn', `forceCloseModal: No focusable elements in previous modal ${previousModal.id}`);
      }
    } else {
      // No more modals - determine which tab should be active
      const wasNavModal = ['historyModal'].includes(modalId);
      
      if (wasNavModal) {
        // Closing a nav modal = go to home
        setHomeActive();
        log('debug', 'forceCloseModal: Closed nav modal, set home active');
      } else {
        const currentActive = document.querySelector('.nav-item.active, .active, [aria-current="true"]');
        if (!currentActive) {
          setHomeActive();
          log('debug', 'forceCloseModal: No active nav, set home active');
        } else {
          log('debug', 'forceCloseModal: Keeping current active tab');
        }
      }
        if (bottomSheetModals.includes(modalId)) {
  lockBodyScroll(false);
}

  // ADD THIS: Remove CSS animation class
if (classAnimatedModals.includes(modalId)) {
  modal.classList.remove('open');
  log('debug', `closeModal: Removed .open class for ${modalId}`);
}

      
      // final focus fallback
      const main = document.getElementById('mainContent') || document.querySelector('main') || document.body;
      try { main.focus(); } catch (e) { document.body.focus(); }
    }
  });
}

// Replacement for openModal function
  // Open modal
  function openModal(modalId, skipHistory = false) {
const allPlansModalEl = getModalElement('allPlansModal');
const allPlansModalContent = allPlansModalEl ? allPlansModalEl.querySelector('.plan-modal-content') : null;

    
    log('debug', `openModal: Attempting to open ${modalId}`);

    const modalConfig = modals[modalId];
    
    if (modalConfig && !modalConfig.element) {
      modalConfig.element = document.getElementById(modalConfig.id || modalId) || null;
      if (modalConfig.element) {
        log('debug', `openModal: Lazily resolved element for ${modalId}`);
      } else {
        log('error', `openModal: Element not found for ${modalId} on open attempt`);
      }
    }

    if (!modalConfig || !modalConfig.element) {
      log('error', `openModal: Modal config or element not found for ${modalId}`);
      return;
    }

    const modal = modalConfig.element;
    const isVisible = isModalVisible(modal);

    if (isVisible) {
      if (!openModalsStack.some((item) => item.id === modalId)) {
        openModalsStack.push({ modal, id: modalId });
        currentDepth++;
      } else {
        log('debug', `openModal: ${modalId} already open, skipping`);
        return;
      }
    }
      if (modalId === 'allPlansModal') {
    allPlansModalContent.scrollTop = 0;  // Optional scroll reset when closing
  }

    modal.classList.remove('hidden');
    modal.style.display = modalConfig.hasPullHandle ? 'block' : 'flex';
    modal.setAttribute('aria-hidden', 'false');
    modal.removeAttribute('inert');
    modal.style.visibility = 'visible';   // ← ADD THIS
    modal.style.zIndex = getNextModalZIndex();
    
    // Special handling for All Plans modal — use CSS class for animation (your old way)
// Special handling for modals that use .active class for animation
if (modalId === 'allPlansModal' || modalId === 'checkoutModal') {
  // Let your CSS handle the starting position and animation
  modal.style.transform = '';           // Remove any conflicting inline transform
  modal.style.opacity = '';             // Remove conflicting inline opacity
  modal.classList.add('active');        // This triggers YOUR CSS: translateY(0) + opacity 1
  log('debug', `openModal: Added .active class for ${modalId} (CSS-driven animation)`);
} else if (modalId === 'updateProfileModal') {
  modal.style.transform = 'translateX(-100%)';
  modal.style.opacity = '0';
} else {
  modal.style.transform = 'translateY(20px)';
  modal.style.opacity = '0';
}


if (skipHistory && document.getElementById(modalId)) {
    const modal = document.getElementById(modalId);
    modal.style.opacity = '0';
    modal.style.transform = modalId === 'allPlansModal' ? 'translateY(100%)' : 'translateY(20px)';
    console.log('[ModalManager] Forced animation start for restored modal:', modalId);
  }


    // 1. Immediately activate the nav tab — instant feedback!
if (shouldManageActiveState(modalId)) {
  setTriggerActive(modalId, true);
  log('debug', `openModal: Instantly activated nav trigger for ${modalId}`);
}

// 2. Then start the modal animation
applyTransition(modal, true, () => {
  // Push to stack only after animation completes (keeps stack accurate)
  if (!openModalsStack.some(item => item.id === modalId)) {
    openModalsStack.push({ modal, id: modalId });
    currentDepth++;
  }

  if (bottomSheetModals.includes(modalId)) {
    lockBodyScroll(true);
  }

  if (!skipHistory) {
    history.pushState({ modalId }, '', `#${modalId}`);
  }



  


// Best minimal fix — just let [data-close] buttons be focusable
let focusTarget = modal.querySelector('h2, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
if (focusTarget) {
  focusTarget.focus();
}

      if (modalId === 'securityPinModal') {
        const title = modal.querySelector('#pinTitle');
        if (title) focusTarget = title;
        document.dispatchEvent(new CustomEvent('security:pin-modal-opened'));
        log('debug', 'openModal: Dispatched security:pin-modal-opened for securityPinModal');
      }

      // --- Special rule for Add Money Modal to prevent input auto-focus ---
if (modalId === 'addMoneyModal') {
  const amt = document.getElementById('addMoneyAmountInput');
  const guard = document.getElementById('addMoneyFocusGuard');

  if (amt) {
    amt.blur();                            // prevent ghost focus
    amt.setAttribute("readonly", true);    // block auto keyboard
    setTimeout(() => amt.removeAttribute("readonly"), 250); // re-enable after animation
  }

  if (guard) guard.focus();                // force focus elsewhere
}


      if (focusTarget) {
        focusTarget.setAttribute('tabindex', '-1');
        focusTarget.focus();
      }

      trapFocus(modal);
      // ADD THIS: Trigger CSS animation for class-based modals
if (classAnimatedModals.includes(modalId)) {
  modal.classList.add('open');
  log('debug', `openModal: Added .open class for CSS animation on ${modalId}`);
}

      document.dispatchEvent(new CustomEvent("modalOpened", { detail: modalId }));

    });
  }

// Replacement for closeModal function
function closeModal(modalId) {
  const allPlansModalEl = getModalElement('allPlansModal');
  const allPlansModalContent = allPlansModalEl ? allPlansModalEl.querySelector('.plan-modal-content') : null;

  log('debug', `closeModal: Attempting to close ${modalId}`);
  const modalConfig = modals[modalId];
  if (!modalConfig || !modalConfig.element) {
    log('error', `closeModal: Modal config or element not found for ${modalId}`);
    return;
  }
  
  const modal = modalConfig.element;
  if (!isModalVisible(modal)) {
    log('warn', `closeModal: Modal ${modalId} is not visible`);
    return;
  }

  if (document.activeElement && modal.contains(document.activeElement)) {
    const main = document.getElementById('mainContent') || document.querySelector('main') || document.body;
    try { main.focus(); } catch (e) { document.body.focus(); }
    log('debug', `closeModal: Moved focus from ${modalId} to ${describeElement(main)}`);
  }
    if (modalId === 'allPlansModal') {
  allPlansModalContent.scrollTop = 0;  // Optional scroll reset when closing
}

  applyTransition(modal, false, () => {
    // cleanup focus trap if present
    try {
      if (modal._trapHandler) {
        modal.removeEventListener('keydown', modal._trapHandler);
        delete modal._trapHandler;
        log('debug', `closeModal: Removed trapHandler from ${modalId}`);
      }
    } catch (e) { /* ignore */ }

    // restore body scroll if some other code locked it
    try {
      document.body.style.overflow = '';
      document.body.classList.remove('modal-open');
    } catch (e) {}

    modal.classList.add('hidden');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('inert', '');
    
    const idx = openModalsStack.findIndex((item) => item.id === modalId);
    if (idx !== -1) {
      openModalsStack.splice(idx, 1);
      currentDepth = openModalsStack.length;
      log('debug', `closeModal: Modal ${modalId} closed, stack: ${openModalsStack.map((item) => item.id).join(', ')}, depth: ${currentDepth}`);
    }

    // Remove active state - but NOT for allPlansModal
    // Remove active state ONLY for nav-linked modals
if (shouldManageActiveState(modalId)) {
  setTriggerActive(modalId, false);
}
 else {
      // ← allPlansModal specific cleanup
      modal.classList.remove('active'); // triggers CSS exit animation
      history.replaceState({ isModal: false }, '', window.location.pathname);
      log('debug', `closeModal: Removed .active + cleared URL fragment for allPlansModal`);
    }

    // Updated cleanup for class-animated modals
    if (modalId === 'allPlansModal' || modalId === 'checkoutModal') {
      modal.classList.remove('active');
      history.replaceState({ isModal: false }, '', window.location.pathname);
      log('debug', `closeModal: Removed .active + cleared URL fragment for ${modalId}`);
    }

    const previousModal = openModalsStack[openModalsStack.length - 1];
    if (previousModal) {
      const prevEl = previousModal.modal;
      
      // Restore active state for previous modal - but NOT for allPlansModal
      if (previousModal.id !== 'allPlansModal') {
        setTriggerActive(previousModal.id, true);
      }
      
      const focusable = prevEl.querySelector(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) {
        setTimeout(() => focusable.focus(), 100);
        log('debug', `closeModal: Restored focus to ${previousModal.id}`);
      }
    } else {
      // No more modals - determine which tab should be active based on where we came from
      const wasNavModal = ['historyModal'].includes(modalId);
      
      if (wasNavModal) {
        // Closing a nav modal with no stack = go to home
        setHomeActive();
        log('debug', 'closeModal: Closed nav modal, set home active');
      } else {
        const currentActive = document.querySelector('.nav-item.active, .active, [aria-current="true"]');
        if (!currentActive) {
          setHomeActive();
          log('debug', 'closeModal: No active nav, set home active');
        } else {
          log('debug', 'closeModal: Keeping current active tab');
        }
      }
        if (bottomSheetModals.includes(modalId)) {
  lockBodyScroll(false);
}

  // ADD THIS: Remove CSS animation class
if (classAnimatedModals.includes(modalId)) {
  modal.classList.remove('open');
  log('debug', `closeModal: Removed .open class for ${modalId}`);
}

      
      const main = document.getElementById('mainContent') || document.querySelector('main') || document.body;
      try { main.focus(); } catch (e) { document.body.focus(); }
    }
    // ── Final safety net: when no modals remain → home MUST be active ────────────
if (openModalsStack.length === 0) {
    setTimeout(() => {
        // Check current reality (after all classList changes have had time to apply)
        const anyNavActive = document.querySelector(
            '#homeNavLink.active, .nav-item.active, [aria-current="true"]'
        );

        if (!anyNavActive) {
            log('warn', 
                'Safety net triggered: modal stack empty but NO active nav found → forcing home active'
            );
            setHomeActive();
            
            // Optional: extra strong version that clears everything first
            // document.querySelectorAll('.nav-item, [aria-current]').forEach(el => {
            //     clearActiveFromElement(el);
            // });
            // setHomeActive();
        } else if (!anyNavActive.id?.includes('home') && !anyNavActive.classList.contains('home')) {
            log('debug', 
                'Safety net: stack empty, but active state is on non-home → correcting to home'
            );
            setHomeActive();
        }
    }, 80);   // small delay — enough for DOM/classList to settle, not noticeable to user
}
  });

 
}
window.closeModal = window.closeModal || closeModal; // expose for modals to call on close
window.openModal = window.openModal || openModal;
window.forceCloseModal = window.forceCloseModal || forceCloseModal;
  

  // Focus trap for accessibility
  function trapFocus(modal) {
    if (!modal) {
      log('error', 'trapFocus: Modal is null or undefined');
      return;
    }
    const focusableElements = modal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    if (!firstFocusable || !lastFocusable) {
      log('warn', `trapFocus: No focusable elements in modal ${modal.id}`);
      return;
    }

    const keydownHandler = (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
          log('debug', `trapFocus: Tabbed back to last focusable in ${modal.id}`);
        } else if (!e.shiftKey && document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
          log('debug', `trapFocus: Tabbed forward to first focusable in ${modal.id}`);
        }
      }
    };

    modal._trapHandler = keydownHandler;
    modal.addEventListener('keydown', keydownHandler);
    log('debug', `trapFocus: Focus trap set for ${modal.id}`);
  }

  // Handle device back button (popstate)
  function handlePopstate(e) {
    
    if (isProcessingPopstate) {
      log('debug', 'handlePopstate: Skipping, already processing popstate');
      return;
    }
    isProcessingPopstate = true;
    log('debug', 'handlePopstate: Popstate event triggered', e.state);

    

    // EXTRA DIAGNOSTIC LOGS (insert in handlePopstate)
log('debug', 'handlePopstate: window.location.hash', { hash: window.location.hash });
log('debug', 'handlePopstate: openModalsStack snapshot', { stack: openModalsStack.map(s => s.id), depth: openModalsStack.length });


    const topModal = openModalsStack[openModalsStack.length - 1];
    if (topModal) {
      if (topModal.id === 'settingsModal') {
        log('debug', 'handlePopstate: Back button triggered, simulating home logic directly for settings (not triggering home button click)');
        // Directly close all modals without transition
        while (openModalsStack.length > 0) {
          const { id } = openModalsStack.pop();
          const modalConfig = modals[id];
          if (modalConfig && modalConfig.element) {
            const modalEl = modalConfig.element;
            if (id !== 'allPlansModal') {
              setTriggerActive(id, false);
            }
            modalEl.classList.add('hidden');
            modalEl.style.display = 'none';
            modalEl.setAttribute('aria-hidden', 'true');
            modalEl.setAttribute('inert', '');
            log('debug', `handlePopstate: Directly closed modal ${id} during settings simulation`);
          }
        }
        currentDepth = 0;
        setHomeActive();
        history.replaceState({ isModal: false }, '', window.location.pathname);
        setTimeout(() => {
          isProcessingPopstate = false;
          log('debug', 'handlePopstate: Popstate processing complete');
        }, 50);
        return; // Skip the rest of the processing
      } else {
        log('debug', `handlePopstate: Closing top modal ${topModal.id}`);
        
        // Remove active state from closing modal
        if (topModal.id !== 'allPlansModal') {
          setTriggerActive(topModal.id, false);
        }
        
        forceCloseModal(topModal.id);
      }
    }

    if (e.state && e.state.isModal && e.state.modalDepth && e.state.modalId) {
      log('debug', `handlePopstate: Processing modal state, depth: ${e.state.modalDepth}, modalId: ${e.state.modalId}`);
      while (openModalsStack.length > e.state.modalDepth) {
        const { modal, id } = openModalsStack.pop();
        
        // Remove active state from each closing modal
        if (id !== 'allPlansModal') {
          setTriggerActive(id, false);
        }
        
        forceCloseModal(id);
        log('debug', `handlePopstate: Closed modal ${id}`);
      }
      const newTopModal = openModalsStack[openModalsStack.length - 1];
      if (
        newTopModal &&
        newTopModal.id === e.state.modalId &&
        !isModalVisible(newTopModal.modal)
      ) {
        newTopModal.modal.classList.remove('hidden');
        newTopModal.modal.style.display = modals[newTopModal.id].hasPullHandle ? 'block' : 'flex';
        newTopModal.modal.setAttribute('aria-hidden', 'false');
        newTopModal.modal.removeAttribute('inert');
        newTopModal.modal.style.zIndex = getNextModalZIndex() + (openModalsStack.length * 10);
        applyTransition(newTopModal.modal, true);
        trapFocus(newTopModal.modal);
        
        // Restore active state for the modal we're going back to
        if (newTopModal.id !== 'allPlansModal') {
          setTriggerActive(newTopModal.id, true);
        }
        
        log('debug', `handlePopstate: Restored modal ${newTopModal.id}`);
      }
    } else if (openModalsStack.length > 0) {
      log('debug', 'handlePopstate: No modal state, closing top modal only');
      const { modal, id } = openModalsStack.pop();
      
      // Remove active state from closing modal
      if (id !== 'allPlansModal') {
        setTriggerActive(id, false);
      }
      
      forceCloseModal(id);
      log('debug', `handlePopstate: Closed modal ${id}`);
      const previousModal = openModalsStack[openModalsStack.length - 1];
      if (previousModal && !isModalVisible(previousModal.modal)) {
        previousModal.modal.classList.remove('hidden');
        previousModal.modal.style.display = modals[previousModal.id].hasPullHandle ? 'block' : 'flex';
        previousModal.modal.setAttribute('aria-hidden', 'false');
        previousModal.modal.removeAttribute('inert');
        previousModal.modal.style.zIndex = getNextModalZIndex() + (openModalsStack.length * 10);
        applyTransition(previousModal.modal, true);
        trapFocus(previousModal.modal);
        
        // Restore active state for previous modal
        if (previousModal.id !== 'allPlansModal') {
          setTriggerActive(previousModal.id, true);
        }
        
        log('debug', `handlePopstate: Restored previous modal ${previousModal.id}`);
      }
    }

    currentDepth = openModalsStack.length;
    log('debug', `handlePopstate: Updated stack: ${openModalsStack.map((item) => item.id).join(', ')}, depth: ${currentDepth}`);
    if (openModalsStack.length === 0) {
      history.replaceState({ isModal: false }, '', window.location.href);
      setHomeActive();
      log('debug', 'handlePopstate: Reset history state and set home active');
    } else {
      history.replaceState(
        {
          isModal: true,
          modalDepth: currentDepth,
          modalId: openModalsStack[openModalsStack.length - 1]?.id,
        },
        '',
        window.location.href
      );
      log('debug', 'handlePopstate: Updated history state for modal stack');
    }

    setTimeout(() => {
      isProcessingPopstate = false;
      log('debug', 'handlePopstate: Popstate processing complete');
    }, 50);
  }

  function getPreviousModal(id) {
  const stack = openModalsStack.map(m => m.id);
  const idx = stack.lastIndexOf(id);
  return (idx > 0) ? stack[idx - 1] : null;
}


  // Initialize
  function initialize() {
    log('info', 'initialize: Starting initialization');

    // create overlay, show on mobile by default
    try {
      createDebugOverlay();
      // show overlay by default for touch devices or narrow screens
      const shouldShow = ('ontouchstart' in window) || window.matchMedia('(max-width: 820px)').matches;
      debugVisible = !!shouldShow;
      if (debugOverlay) debugOverlay.style.display = debugVisible ? 'block' : 'none';
      const toggle = document.getElementById('mm-debug-toggle');
      if (toggle) toggle.style.display = 'block';
      const counter = document.getElementById('mm-debug-counter');
      if (counter) counter.style.display = debugVisible ? 'none' : 'block';
      log('info', `initialize: Debug overlay created, visible=${debugVisible}`);
    } catch (e) {
      console.warn('ModalManager: Failed to create debug overlay', e);
    }
    
    // Resolve element references
    Object.entries(modals).forEach(([modalId, cfg]) => {
      if (!cfg) return;
      if (!cfg.element) {
        cfg.element = document.getElementById(cfg.id || modalId) || null;
      }
      if (!cfg.element) {
        log('warn', `initialize: Modal element not found for ${modalId} (expected id="${cfg.id || modalId}")`);
      } else {
        log('debug', `initialize: Modal ${modalId} resolved to element`, { id: cfg.element.id });
        if (cfg.element.getAttribute('aria-hidden') === null || cfg.element.getAttribute('aria-hidden') === 'true') {
          cfg.element.setAttribute('aria-hidden', 'true');
          cfg.element.setAttribute('inert', '');
          cfg.element.classList.add('hidden');
          cfg.element.style.display = 'none';
        }
      }
    });

    // Bind close buttons
    Object.entries(modals).forEach(([modalId, { element }]) => {
      if (!element) return;
      const closeBtn = element.querySelector('[data-close]');
      if (closeBtn) {
        const closeHandler = (e) => {
          e.preventDefault();
          if (modalId === 'settingsModal') {
            log('debug', `Close button clicked for ${modalId} - simulating home logic directly (not triggering home button click)`);
            // Directly close all modals without transition
            while (openModalsStack.length > 0) {
              const { id } = openModalsStack.pop();
              const modalConfig = modals[id];
              if (modalConfig && modalConfig.element) {
                const modalEl = modalConfig.element;
                if (id !== 'allPlansModal') {
                  setTriggerActive(id, false);
                }
                modalEl.classList.add('hidden');
                modalEl.style.display = 'none';
                modalEl.setAttribute('aria-hidden', 'true');
                modalEl.setAttribute('inert', '');
                log('debug', `Close button: Directly closed modal ${id} during settings simulation`);
              }
            }
            currentDepth = 0;
            history.replaceState({ isModal: false }, '', window.location.pathname);
            setHomeActive();
          } else {
            log('debug', `Close button clicked for ${modalId}`);
            closeModal(modalId);
          }
        };
        closeBtn.removeEventListener('click', closeBtn._closeHandler);
        closeBtn.removeEventListener('touchend', closeBtn._closeHandler);
        closeBtn._closeHandler = closeHandler;
        closeBtn.addEventListener('click', closeHandler);
        closeBtn.addEventListener('touchend', closeHandler);
        log('debug', `initialize: Bound close button for ${modalId}`);
      } else {
        log('warn', `initialize: No close button found for ${modalId}`);
      }
    });

    // Triggers - NOTE: homeNavLink is NOT here
    const triggers = {
      dashboardPinCard: 'pinModal',
      dashboardUpdateProfileCard: 'updateProfileModal',
      settingsBtn: 'settingsModal',
      openUpdateProfile: 'updateProfileModal',
      securityBtn: 'securityModal',
      securityPinRow: 'securityPinModal',
      helpSupportBtn: 'helpSupportModal',
      'see-all-plans': 'allPlansModal',
      changePWD: 'changePwdModal',
      referralsBtn: 'referralModal',
      continueBtn: 'checkoutModal',
      historyNavLink: 'historyModal',
      addMoneyBtn: 'addMoneyModal',
      'fxg-open-transfer-modal': 'fxgTransferModal',
      'kycVerifyModal': 'kycVerifyModal',
    };

    // Bind triggers to open modals
    Object.entries(triggers).forEach(([triggerId, modalId]) => {
      const trigger = document.getElementById(triggerId);

      if (trigger) {
        if (triggerId === "securityPinRow") {
          trigger.addEventListener("click", (e) => {
            if (trigger.dataset.skipModal === 'true' || window.__smartPinHandled) {
              log('debug', `[GUARD] Ignored ${triggerId} click – Smart Button handled`);
              e.stopImmediatePropagation();
              return;
            }

            e.preventDefault();

            if (e.target.closest("#securityPinModal")) {
              log('debug', `[GUARD] Ignored click inside securityPinModal`, {
                clickedTag: e.target.tagName,
                clickedClass: e.target.className
              });
              return;
            }

            log('debug', `Trigger clicked: ${triggerId} to open ${modalId}`);
            openModal(modalId);
          });

          const secModal = document.getElementById("securityPinModal");
          if (secModal) {
            secModal.addEventListener("click", (e) => {
              if (
                e.target.closest("form") ||
                e.target.tagName === "INPUT" ||
                e.target.tagName === "BUTTON"
              ) {
                e.stopPropagation();
                log('debug', `[GUARD] Click inside securityPinModal ignored for reopening`, {
                  tag: e.target.tagName,
                  class: e.target.className
                });
              }
            });
          }

        } else {
          trigger.addEventListener("click", (e) => {
            e.preventDefault();
            log('debug', `Trigger clicked: ${triggerId} to open ${modalId}`);
            openModal(modalId);
          });
        }

        log('debug', `initialize: Bound trigger ${triggerId} to ${modalId}`);
      } else {
        log('error', `initialize: Trigger element not found for ${triggerId}`);
      }
    });

    // Add this in initialize() or after all other setup
document.addEventListener('click', function(e) {
  // Find closest [data-close] (handles dynamic elements)
  const closeBtn = e.target.closest('[data-close]');
  if (!closeBtn) return;

  // Prevent default if it's a button/link
  e.preventDefault();

  // Find the nearest modal (receiptModal or any other)
  const modal = closeBtn.closest('.hidden, [aria-hidden="true"], #receiptModal, .opay-modal, .modal');
  if (!modal) return;

  const modalId = modal.id || 'unknown';

  if (modalId && ModalManager.closeModal) {
    console.log(`[ModalManager] Closing modal via delegated data-close: ${modalId}`);
    ModalManager.closeModal(modalId);
  } else {
    // Fallback: just hide it
    modal.classList.add('hidden');
    modal.style.display = 'none';
    console.warn('[ModalManager] Closed via fallback (no closeModal found)');
  }
}, true);  // true = capture phase — catches before other handlers

// KYC card delegation — fires when user taps "Get a permanent bank account"
document.addEventListener('click', (e) => {
  if (e.target.closest('.addMoney-account-section')) {
    e.preventDefault();
    log('debug', 'KYC card clicked — opening kycVerifyModal');
    openModal('kycVerifyModal');
  }
});


    // HOME BUTTON HANDLER - Separate from other triggers
    const homeNavLink = document.getElementById('homeNavLink');
    if (homeNavLink) {
      homeNavLink.addEventListener('click', (e) => {
        e.preventDefault();
        log('debug', 'Home button clicked directly - closing all modals');
        
        if (openModalsStack.length > 0) {
          while (openModalsStack.length > 0) {
            const { modal, id } = openModalsStack.pop();
            const modalConfig = modals[id];
            if (modalConfig && modalConfig.element) {
              const modalEl = modalConfig.element;
              
              modalEl.classList.add('hidden');
              modalEl.style.display = 'none';
              modalEl.setAttribute('aria-hidden', 'true');
              modalEl.setAttribute('inert', '');
              
              log('debug', `Home: Closed modal ${id}`);
            }
          }
          currentDepth = 0;
          history.replaceState({ isModal: false }, '', window.location.pathname);
        }
        
        setHomeActive();
      });
      
      log('debug', 'initialize: Bound home button to close all modals');
    } else {
      log('error', 'initialize: Home nav link not found');
    }

    window.addEventListener('popstate', handlePopstate);
    log('debug', 'initialize: Popstate listener added');

    // EXTRA SAFETY NET FOR HISTORY BACK BUTTON
const historyModal = document.getElementById('historyModal');
if (historyModal) {
  historyModal.querySelectorAll('[data-close]').forEach(btn => {
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      log('debug', 'History close button clicked (safety net)');
      closeModal('historyModal');
    };
    btn.addEventListener('click', handler);
    btn.addEventListener('touchend', handler);
  });
}

    // MutationObserver to detect external modifications to nav active classes (the likely culprit)
    // Observe the whole document for class changes to nav items; ignore ones we did intentionally
    const navObserver = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        if (!m.target) return;
        // interested in class/aria-current changes
        if (m.attributeName !== 'class' && m.attributeName !== 'aria-current') return;
        try {
          const el = m.target;
          const hasActive = (el.classList && (el.classList.contains('active') || el.classList.contains('nav-active'))) || el.getAttribute && el.getAttribute('aria-current') === 'true';
          if (hasActive && !wasRecentlyModified(el)) {
            // This element gained active class but we didn't modify it recently -> suspicious
            captureStackForElement(el, 'external-active-added-by-mutationobserver');
            appendDebugLine(`${timestamp()} [alert] External code added 'active' to ${describeElement(el)}`, '#ffb4b4', 'mm-debug-alert');
            // console.warn('[ModalManager] External active set detected on', el);
          }
        } catch (e) { /* ignore */ }
      });
    });

    try {
      navObserver.observe(document, {
        attributes: true,
        attributeFilter: ['class', 'aria-current'],
        subtree: true,
        childList: false,
      });
      log('debug', 'initialize: nav mutation observer added (detects external active changes)');
    } catch (e) {
      log('warn', 'initialize: failed to attach nav mutation observer', { error: String(e) });
    }

    // Replacement for MutationObserver setup in initialize() function
// Replace the entire Object.entries(modals).forEach block starting around line 1420

Object.entries(modals).forEach(([modalId, { element }]) => {
  if (!element) return;
  if (modalId === 'checkoutModal') return;  // Skip observer for checkoutModal to prevent re-open loops

  const observer = new MutationObserver((mutations) => {
    if (isProcessingPopstate || element.dataset._mutating) return;  // Existing + stronger guard

    element.dataset._mutating = 'true';  // Flag to prevent recursion
    clearTimeout(observer._debounceTimer);
    observer._debounceTimer = setTimeout(() => {
      const visible = isModalVisible(element);
      const inStack = openModalsStack.some((item) => item.id === modalId);
      
      if (visible && !inStack) {
        log('debug', `MutationObserver: ${modalId} became visible, opening`);
        openModal(modalId);
      } else if (!visible && inStack) {
        log('debug', `MutationObserver: ${modalId} became hidden, closing`);
        closeModal(modalId);
      }
      delete element.dataset._mutating;  // Clear flag after
    }, 400);  // Increased debounce > transition time (0.26s) to avoid races
  });
  observer.observe(element, {
    attributes: true,
    attributeFilter: ['style', 'class', 'aria-hidden'],
    subtree: false,
  });
  log('debug', `initialize: MutationObserver set for ${modalId}`);
});

    // Monkeypatch DOMTokenList.add to capture exact stack when "active" class is added programmatically
    (function patchClassListAdd() {
      try {
        if (DOMTokenList.prototype._mm_patched_add) {
          log('debug', 'patchClassListAdd: already patched');
          return;
        }
        const originalAdd = DOMTokenList.prototype.add;
        DOMTokenList.prototype.add = function (...tokens) {
          // call original first to keep behavior
          const result = originalAdd.apply(this, tokens);
          try {
            if (tokens.some(t => t === 'active' || /active/.test(String(t)))) {
              // try to find owner element by comparing classList references (best-effort)
              let owner = null;
              try {
                // scope down search to likely navs to be less costly, fallback to document.getElementsByTagName('*')
                const candidates = document.querySelectorAll('.nav-item, a, button, [role="tab"], [role="button"]');
                for (let i = 0; i < candidates.length; i++) {
                  const el = candidates[i];
                  if (el.classList === this) { owner = el; break; }
                }
                if (!owner) {
                  const all = document.getElementsByTagName('*');
                  for (let i = 0; i < all.length; i++) {
                    const el = all[i];
                    if (el.classList === this) { owner = el; break; }
                  }
                }
              } catch (e) {
                // fallback later if needed
              }
              // capture stack & snapshot
              captureStackForElement(owner || null, 'classList.add-active');
              const info = {
                tokenAdded: tokens,
                owner: owner ? describeElement(owner) : '(owner-not-found)',
                id: owner && owner.id ? owner.id : null,
              };
              appendDebugLine(`${timestamp()} [class-add] active added - ${safeStringify(info)}`, '#ffb4b4', 'mm-debug-alert');
              // console.warn('[ModalManager] classList.add detected active', info);
            }
          } catch (e) {
            console.warn('classList.add wrapper error', e);
          }
          return result;
        };
        DOMTokenList.prototype._mm_patched_add = true;
        log('debug', 'patchClassListAdd: DOMTokenList.add patched to capture "active" additions');
      } catch (e) {
        log('warn', 'patchClassListAdd: Failed to patch DOMTokenList.add', { error: String(e) });
      }
    })();

    window.ModalManager = {
      openModal,
      closeModal,
      forceCloseModal,
      getOpenModals: () => openModalsStack.map((item) => item.id),
      getCurrentDepth: () => currentDepth,
      getRawLogs,
      downloadRawLogs,
      copyRawLogs,
      getPreviousModal,
      sendRawLogsTo,
      closeAll: () => {
        log('info', 'closeAll: Closing all modals');
        while (openModalsStack.length > 0) {
          const { modal, id } = openModalsStack.pop();
          forceCloseModal(id);
        }
        currentDepth = 0;
        history.replaceState({ isModal: false }, '', window.location.href);
        setHomeActive();
        log('info', 'closeAll: All modals closed, home is now active');
      },
    };

    // Set home as active on page load if no modals are open
    if (openModalsStack.length === 0) {
      setHomeActive();
      log('debug', 'initialize: Set home as active on page load');
    }
    
    log('info', 'initialize: Initialization complete');
  }

  // Add click protection for nested modals and register DOMContentLoaded
  Object.entries(modals).forEach(([modalId, { element }]) => {
    if (!element) return;
    
    element.addEventListener('click', (e) => {
      if (e.target === element || e.target.closest('.modal-content')) {
        e.stopPropagation();
      }
    });
    
    log('debug', `Added click protection for ${modalId}`);
  });

  document.addEventListener('DOMContentLoaded', initialize);
  log('debug', 'Registered DOMContentLoaded listener');

  window.addEventListener('unload', () => {
    log('debug', 'unload: Cleaning up listeners');
    window.removeEventListener('popstate', handlePopstate);
    Object.values(modals).forEach(({ element }) => {
      if (element && element._trapHandler) {
        element.removeEventListener('keydown', element._trapHandler);
      }
    });
  });

  

})();