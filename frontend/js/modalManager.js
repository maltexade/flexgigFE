// /frontend/js/modalManager.js
(function () {
  'use strict';

  // Modal configuration
  const modals = {
    settingsModal: { element: document.getElementById('settingsModal'), hasPullHandle: false },
    helpSupportModal: { element: document.getElementById('helpSupportModal'), hasPullHandle: false },
    securityModal: { element: document.getElementById('securityModal'), hasPullHandle: false },
    securityPinModal: { element: document.getElementById('securityPinModal'), hasPullHandle: false },
    updateProfileModal: { element: document.getElementById('updateProfileModal'), hasPullHandle: true },
    pinModal: { element: document.getElementById('pinModal'), hasPullHandle: false },
    allPlansModal: { element: document.getElementById('allPlansModal'), hasPullHandle: true },
    checkoutModal: { element: document.getElementById('checkoutModal'), hasPullHandle: true },
    contactModal: { element: document.getElementById('contactModal'), hasPullHandle: false },
  };

  // Modal stack to track open modals
  const openModalsStack = [];
  let currentDepth = 0;
  let isProcessingPopstate = false;

  // Utility: Check if modal is visible
  function isModalVisible(modal) {
    if (!modal) {
      console.warn('[ModalManager] isModalVisible: Modal is null or undefined');
      return false;
    }
    const cs = window.getComputedStyle(modal);
    const ariaHidden = modal.getAttribute('aria-hidden') === 'true' ? false : true;
    const isVisible =
      cs.display !== 'none' &&
      cs.visibility !== 'hidden' &&
      !modal.classList.contains('hidden') &&
      ariaHidden;
    console.log(
      `[ModalManager] isModalVisible: Modal ${modal.id} is ${isVisible ? 'visible' : 'not visible'}, display: ${cs.display}, visibility: ${cs.visibility}, class: ${modal.classList}, aria-hidden: ${modal.getAttribute('aria-hidden')}`
    );
    return isVisible;
  }

  // Utility: Add transition effect
  // Modify applyTransition to handle the slide-in for profile modal
function applyTransition(modal, show, callback) {
  if (!modal) return callback?.();

  const isProfile = modal.id === 'updateProfileModal';
  modal.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  modal.style.opacity = show ? '0' : '1';
  modal.style.transform = show
    ? (isProfile ? 'translateX(-100%)' : 'translateY(20px)')
    : (isProfile ? 'translateX(0)' : 'translateY(0)');

  const onTransitionEnd = () => {
    modal.removeEventListener('transitionend', onTransitionEnd);
    if (!show) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      modal.setAttribute('inert', '');
    } else {
      modal.removeAttribute('inert');
    }
    callback?.();
  };

  modal.addEventListener('transitionend', onTransitionEnd);

  requestAnimationFrame(() => {
    modal.style.opacity = show ? '1' : '0';
    modal.style.transform = show
      ? (isProfile ? 'translateX(0)' : 'translateY(0)')
      : (isProfile ? 'translateX(-100%)' : 'translateY(20px)');
  });
}

  // Force close modal
  function forceCloseModal(modalId) {
    console.log(`[ModalManager] forceCloseModal: Forcing close of ${modalId}`);
    const modalConfig = modals[modalId];
    if (!modalConfig || !modalConfig.element) {
      console.error(`[ModalManager] forceCloseModal: Modal config or element not found for ${modalId}`);
      return;
    }
    const modal = modalConfig.element;
    if (!isModalVisible(modal)) {
      console.log(`[ModalManager] forceCloseModal: Modal ${modalId} already closed`);
      const idx = openModalsStack.findIndex((item) => item.id === modalId);
      if (idx !== -1) {
        openModalsStack.splice(idx, 1);
        currentDepth = openModalsStack.length;
      }
      return;
    }
    if (document.activeElement && modal.contains(document.activeElement)) {
      document.body.focus();
      console.log(`[ModalManager] forceCloseModal: Moved focus from ${modalId} to body`);
    }
    applyTransition(modal, false, () => {
      modal.classList.add('hidden');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      modal.setAttribute('inert', '');
      const idx = openModalsStack.findIndex((item) => item.id === modalId);
      if (idx !== -1) {
        openModalsStack.splice(idx, 1);
        currentDepth = openModalsStack.length;
        console.log(
          `[ModalManager] forceCloseModal: Modal ${modalId} closed, stack: ${openModalsStack
            .map((item) => item.id)
            .join(', ')}, depth: ${currentDepth}`
        );
      }
      const previousModal = openModalsStack[openModalsStack.length - 1];
      if (previousModal) {
        const focusable = previousModal.modal.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) {
          focusable.focus();
          console.log(`[ModalManager] forceCloseModal: Restored focus to ${previousModal.id}`);
        } else {
          console.warn(
            `[ModalManager] forceCloseModal: No focusable elements in previous modal ${previousModal.id}`
          );
        }
      } else {
        document.body.focus();
        console.log('[ModalManager] forceCloseModal: Restored focus to document body');
      }
    });
  }

  // Open modal
  // --------------------- Open modal ---------------------
// Inside your modalManager.js, modify the openModal function like this:

function openModal(modalId, skipHistory = false) {
  console.log(`[ModalManager] openModal: Attempting to open ${modalId}`);

  const modalConfig = modals[modalId];
  if (!modalConfig || !modalConfig.element) {
    console.error(`[ModalManager] openModal: Modal config or element not found for ${modalId}`);
    return;
  }

  const modal = modalConfig.element;
  const isVisible = isModalVisible(modal);

  if (isVisible) {
    if (!openModalsStack.some((item) => item.id === modalId)) {
      openModalsStack.push({ modal, id: modalId });
      currentDepth++;
    } else {
      return;
    }
  }

  modal.classList.remove('hidden');
  modal.style.display = modalConfig.hasPullHandle ? 'block' : 'flex';
  modal.setAttribute('aria-hidden', 'false');
  modal.removeAttribute('inert');

  // --- Special slide-in for updateProfileModal ---
  if (modalId === 'updateProfileModal') {
    modal.style.transform = 'translateX(-100%)'; // Start off-screen
    modal.style.opacity = '0';
  } else {
    modal.style.transform = 'translateY(20px)'; // Default for other modals
    modal.style.opacity = '0';
  }

  applyTransition(modal, true, () => {
    if (!openModalsStack.some((item) => item.id === modalId)) {
      openModalsStack.push({ modal, id: modalId });
      currentDepth++;
    }

    if (!skipHistory) {
      history.pushState({ modalId }, "", `#${modalId}`);
    }

    // Focus handling (same as before)
    let focusTarget = modal.querySelector(
      'input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) || modal.querySelector('button:not([data-close])');

    if (modalId === "securityPinModal") {
      const title = modal.querySelector('#pinTitle');
      if (title) focusTarget = title;
    }

    if (focusTarget) {
      focusTarget.setAttribute('tabindex', '-1'); 
      focusTarget.focus();
    }

    trapFocus(modal);
  });
}



  // Close modal
function closeModal(modalId) {
  console.log(`[ModalManager] closeModal: Attempting to close ${modalId}`);
  const modalConfig = modals[modalId];
  if (!modalConfig || !modalConfig.element) {
    console.error(`[ModalManager] closeModal: Modal config or element not found for ${modalId}`);
    return;
  }
  const modal = modalConfig.element;
  if (!isModalVisible(modal)) {
    console.warn(`[ModalManager] closeModal: Modal ${modalId} is not visible`);
    return;
  }

  // Check if history state matches and trigger back to let popstate handle the close
  if (history.state && history.state.modalId === modalId) {
  history.back();
  console.log(`[ModalManager] closeModal: Triggered history.back for ${modalId}`);
  // ✅ Don’t return immediately — let fallback handle the close if needed
}


  // Fallback close logic if history state doesn't match
  if (document.activeElement && modal.contains(document.activeElement)) {
    document.body.focus();
    console.log(`[ModalManager] closeModal: Moved focus from ${modalId} to body`);
  }

  applyTransition(modal, false, () => {
    modal.classList.add('hidden');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('inert', '');
    const idx = openModalsStack.findIndex((item) => item.id === modalId);
    if (idx !== -1) {
      openModalsStack.splice(idx, 1);
      currentDepth = openModalsStack.length;
      console.log(
        `[ModalManager] closeModal: Modal ${modalId} closed, stack: ${openModalsStack
          .map((item) => item.id)
          .join(', ')}, depth: ${currentDepth}`
      );
    } else {
      console.warn(`[ModalManager] closeModal: Modal ${modalId} not found in stack`);
    }

    const previousModal = openModalsStack[openModalsStack.length - 1];
    if (previousModal) {
      const focusable = previousModal.modal.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) {
        focusable.focus();
        console.log(`[ModalManager] closeModal: Restored focus to ${previousModal.id}`);
      } else {
        console.warn(
          `[ModalManager] closeModal: No focusable elements in previous modal ${previousModal.id}`
        );
      }
    } else {
      document.body.focus();
      console.log('[ModalManager] closeModal: Restored focus to document body');
    }
  });
}

  // Focus trap for accessibility
  function trapFocus(modal) {
    if (!modal) {
      console.error('[ModalManager] trapFocus: Modal is null or undefined');
      return;
    }
    const focusableElements = modal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    if (!firstFocusable || !lastFocusable) {
      console.warn(`[ModalManager] trapFocus: No focusable elements in modal ${modal.id}`);
      return;
    }

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
          console.log(`[ModalManager] trapFocus: Tabbed back to last focusable in ${modal.id}`);
        } else if (!e.shiftKey && document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
          console.log(`[ModalManager] trapFocus: Tabbed forward to first focusable in ${modal.id}`);
        }
      }
    });
    console.log(`[ModalManager] trapFocus: Focus trap set for ${modal.id}`);
  }

  // Handle device back button (popstate)
  function handlePopstate(e) {
    if (isProcessingPopstate) {
      console.log('[ModalManager] handlePopstate: Skipping, already processing popstate');
      return;
    }
    isProcessingPopstate = true;
    console.log('[ModalManager] handlePopstate: Popstate event triggered', e.state);

    // Close the top modal if it exists
    const topModal = openModalsStack[openModalsStack.length - 1];
    if (topModal) {
      console.log(`[ModalManager] handlePopstate: Closing top modal ${topModal.id}`);
      forceCloseModal(topModal.id);
    }

    if (e.state && e.state.isModal && e.state.modalDepth && e.state.modalId) {
      console.log(
        `[ModalManager] handlePopstate: Processing modal state, depth: ${e.state.modalDepth}, modalId: ${e.state.modalId}`
      );
      while (openModalsStack.length > e.state.modalDepth) {
        const { modal, id } = openModalsStack.pop();
        forceCloseModal(id);
        console.log(`[ModalManager] handlePopstate: Closed modal ${id}`);
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
        applyTransition(newTopModal.modal, true);
        trapFocus(newTopModal.modal);
        console.log(`[ModalManager] handlePopstate: Restored modal ${newTopModal.id}`);
      }
    } else if (openModalsStack.length > 0) {
      console.log('[ModalManager] handlePopstate: No modal state, closing top modal only');
      const { modal, id } = openModalsStack.pop();
      forceCloseModal(id);
      console.log(`[ModalManager] handlePopstate: Closed modal ${id}`);
      // Restore previous modal if any
      const previousModal = openModalsStack[openModalsStack.length - 1];
      if (previousModal && !isModalVisible(previousModal.modal)) {
        previousModal.modal.classList.remove('hidden');
        previousModal.modal.style.display = modals[previousModal.id].hasPullHandle ? 'block' : 'flex';
        previousModal.modal.setAttribute('aria-hidden', 'false');
        previousModal.modal.removeAttribute('inert');
        applyTransition(previousModal.modal, true);
        trapFocus(previousModal.modal);
        console.log(`[ModalManager] handlePopstate: Restored previous modal ${previousModal.id}`);
      }
    }

    currentDepth = openModalsStack.length;
    console.log(
      `[ModalManager] handlePopstate: Updated stack: ${openModalsStack
        .map((item) => item.id)
        .join(', ')}, depth: ${currentDepth}`
    );
    if (openModalsStack.length === 0) {
      history.replaceState({ isModal: false }, '', window.location.href);
      console.log('[ModalManager] handlePopstate: Reset history state');
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
      console.log('[ModalManager] handlePopstate: Updated history state for modal stack');
    }

    setTimeout(() => {
      isProcessingPopstate = false;
      console.log('[ModalManager] handlePopstate: Popstate processing complete');
    }, 50);
  }

  // Initialize
  // Initialize
function initialize() {
  console.log('[ModalManager] initialize: Starting initialization');
  Object.entries(modals).forEach(([modalId, { element }]) => {
    if (!element) {
      console.error(`[ModalManager] initialize: Modal element not found for ${modalId}`);
    } else {
      console.log(`[ModalManager] initialize: Modal ${modalId} found`);
      if (element.getAttribute('aria-hidden') === null || element.getAttribute('aria-hidden') === 'true') {
        console.warn(`[ModalManager] initialize: Modal ${modalId} has null or true aria-hidden, setting to true`);
        element.setAttribute('aria-hidden', 'true');
        element.setAttribute('inert', '');
        element.classList.add('hidden');
        element.style.display = 'none';
      }
    }
  });

  Object.entries(modals).forEach(([modalId, { element }]) => {
    if (!element) return;
    const closeBtn = element.querySelector('[data-close]');
    if (closeBtn) {
      const closeHandler = (e) => {
        e.preventDefault();
        console.log(`[ModalManager] Close button clicked or touched for ${modalId}`);
        closeModal(modalId); // Explicitly pass the modalId
      };
      // Remove existing listeners to prevent duplicates
      closeBtn.removeEventListener('click', closeBtn._closeHandler);
      closeBtn.removeEventListener('touchend', closeBtn._closeHandler);
      // Store the handler for future removal
      closeBtn._closeHandler = closeHandler;
      closeBtn.addEventListener('click', closeHandler);
      closeBtn.addEventListener('touchend', closeHandler);
      console.log(`[ModalManager] initialize: Bound close button for ${modalId}`);
    } else {
      console.warn(`[ModalManager] initialize: No close button found for ${modalId}`);
    }
  });

  const triggers = {
    dashboardPinCard: 'pinModal',
    dashboardUpdateProfileCard: 'updateProfileModal',
    settingsBtn: 'settingsModal',
    openUpdateProfile: 'updateProfileModal',
    securityBtn: 'securityModal',
    securityPinRow: 'securityPinModal',
    helpSupportBtn: 'helpSupportModal',
    'see-all-plans': 'allPlansModal',
    
  };

  // --- Bind triggers to open modals ---
// --- Bind triggers to open modals ---
Object.entries(triggers).forEach(([triggerId, modalId]) => {
  const trigger = document.getElementById(triggerId);

  if (trigger) {
    if (triggerId === "securityPinRow") {
      // Special handling for Security PIN modal
      trigger.addEventListener("click", (e) => {
        e.preventDefault();

        // 🚫 Ignore clicks inside the modal itself
        if (e.target.closest("#securityPinModal")) {
          console.log("[ModalManager][GUARD] Ignored click inside securityPinModal", {
            clickedTag: e.target.tagName,
            clickedClass: e.target.className
          });
          return; // Do not re-open the modal
        }

        console.log(`[ModalManager] Trigger clicked: ${triggerId} to open ${modalId}`);
        openModal(modalId);
      });

      // ✅ Optional: Also ignore clicks on inputs/buttons inside modal
      const secModal = document.getElementById("securityPinModal");
      if (secModal) {
        secModal.addEventListener("click", (e) => {
          if (
            e.target.closest("form") ||
            e.target.tagName === "INPUT" ||
            e.target.tagName === "BUTTON"
          ) {
            e.stopPropagation();
            console.log("[ModalManager][GUARD] Click inside securityPinModal ignored for reopening", {
              tag: e.target.tagName,
              class: e.target.className
            });
          }
        });
      }

    } else {
      // Normal handling for all other triggers
      trigger.addEventListener("click", (e) => {
        e.preventDefault();
        console.log(`[ModalManager] Trigger clicked: ${triggerId} to open ${modalId}`);
        openModal(modalId);
      });
    }

    console.log(`[ModalManager] initialize: Bound trigger ${triggerId} to ${modalId}`);
  } else {
    console.error(`[ModalManager] initialize: Trigger element not found for ${triggerId}`);
  }
});



  window.addEventListener('popstate', handlePopstate);
  console.log('[ModalManager] initialize: Popstate listener added');

  Object.entries(modals).forEach(([modalId, { element }]) => {
    if (!element) return;
    const observer = new MutationObserver(() => {
      if (isProcessingPopstate) {
        console.log(`[ModalManager] MutationObserver: Skipping for ${modalId} during popstate`);
        return;
      }
      console.log(`[ModalManager] MutationObserver: Detected change in ${modalId}`);
      clearTimeout(observer._timer);
      observer._timer = setTimeout(() => {
        const visible = isModalVisible(element);
        const inStack = openModalsStack.some((item) => item.id === modalId);
        if (visible && !inStack) {
          console.log(`[ModalManager] MutationObserver: ${modalId} became visible, opening`);
          openModal(modalId);
        } else if (!visible && inStack) {
          console.log(`[ModalManager] MutationObserver: ${modalId} became hidden, closing`);
          closeModal(modalId);
        }
      }, 100);
    });
    observer.observe(element, {
      attributes: true,
      attributeFilter: ['style', 'class', 'aria-hidden'],
      subtree: false,
    });
    console.log(`[ModalManager] initialize: MutationObserver set for ${modalId}`);
  });

  window.ModalManager = {
    openModal,
    closeModal,
    forceCloseModal,
    getOpenModals: () => {
      const openModals = openModalsStack.map((item) => item.id);
      console.log(`[ModalManager] getOpenModals: ${openModals.join(', ') || 'none'}`);
      return openModals;
    },
    getCurrentDepth: () => {
      console.log(`[ModalManager] getCurrentDepth: ${currentDepth}`);
      return currentDepth;
    },
    closeAll: () => {
      console.log('[ModalManager] closeAll: Closing all modals');
      while (openModalsStack.length > 0) {
        const { modal, id } = openModalsStack.pop();
        forceCloseModal(id);
        console.log(`[ModalManager] closeAll: Closed modal ${id}`);
      }
      currentDepth = 0;
      history.replaceState({ isModal: false }, '', window.location.href);
      console.log('[ModalManager] closeAll: All modals closed, reset history state');
    },
  };
  
  console.log('[ModalManager] initialize: Initialization complete');
}

  document.addEventListener('DOMContentLoaded', initialize);
  console.log('[ModalManager] Registered DOMContentLoaded listener');

  window.addEventListener('unload', () => {
    console.log('[ModalManager] unload: Cleaning up listeners');
    window.removeEventListener('popstate', handlePopstate);
    Object.values(modals).forEach(({ element }) => {
      if (element) {
        element.removeEventListener('keydown', trapFocus);
      }
    });
  });
})();