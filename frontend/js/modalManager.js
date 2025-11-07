(function () {
  'use strict';

  // compute next/top z-index for a modal so it always appears above any existing modal
function getNextModalZIndex() {
  const BASE = 10000; // high base to play nicely with modal CSS that uses 1000+ ranges
  let max = BASE;
  // consider both inline style and computed style for each modal
  openModalsStack.forEach(item => {
    try {
      const el = item.modal;
      // prefer inline style if set, otherwise computed style
      const inline = el && el.style && el.style.zIndex ? parseInt(el.style.zIndex, 10) : NaN;
      const computed = el ? parseInt(window.getComputedStyle(el).zIndex, 10) : NaN;
      const candidate = (!isNaN(inline) ? inline : (!isNaN(computed) ? computed : 0));
      if (candidate > max) max = candidate;
    } catch (e) { /* ignore parse issues */ }
  });
  return max + 10;
}

// ===== Backdrop helpers (insert right after getNextModalZIndex) =====
function ensureBackdrop(modal) {
  if (!modal) return null;
  let backdrop = modal.querySelector('.modal-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    // initial styles - not all must be here if your CSS already styles .modal-backdrop
    backdrop.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.5);
      opacity: 0;
      transition: opacity 0.25s ease;
      pointer-events: auto;
    `;
    modal.insertBefore(backdrop, modal.firstChild);
    log('debug', `ensureBackdrop: created backdrop for ${modal.id || '(unknown)'}`);
  }

  // compute backdrop z-index to be just under modal
  try {
    // prefer inline style zIndex (set by manager), then computed style, then fallback
    const inlineZ = modal.style && modal.style.zIndex ? parseInt(modal.style.zIndex, 10) : NaN;
    const computedZ = parseInt(window.getComputedStyle(modal).zIndex, 10);
    const modalZ = !isNaN(inlineZ) ? inlineZ : (!isNaN(computedZ) ? computedZ : getNextModalZIndex());
    backdrop.style.zIndex = (modalZ - 1).toString();
  } catch (e) {
    backdrop.style.zIndex = '9999';
  }

  return backdrop;
}

function showBackdrop(modal) {
  const backdrop = ensureBackdrop(modal);
  if (!backdrop) return;
  // ensure visible by forcing a frame then switching opacity
  requestAnimationFrame(() => {
    backdrop.style.opacity = '1';
  });
}

function hideBackdrop(modal) {
  if (!modal) return;
  const backdrop = modal.querySelector('.modal-backdrop');
  if (!backdrop) return;
  // fade out, but leave the element (so observers can read it). If you prefer, remove it after fade.
  backdrop.style.opacity = '0';
  // optional: remove after transition to keep DOM clean
  try {
    clearTimeout(backdrop._rmTimer);
    backdrop._rmTimer = setTimeout(() => {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }, 300); // match transition duration
  } catch (e) { /* ignore */ }
}



  // Toggle for dev logs (set to false in prod)
  const DEBUG_LOGS = true;  // ← Change to false for quiet mode

  function log(type, msg, data = {}) {
    if (!DEBUG_LOGS) return;
    console[type](`[ModalManager] ${msg}`, data);
  }

  // Modal configuration
    // Modal configuration (use id strings and resolve elements later)
  const modals = {
    resetPinModal: { id: 'resetPinModal', element: null, hasPullHandle: false },
    settingsModal: { id: 'settingsModal', element: null, hasPullHandle: false },
    helpSupportModal: { id: 'helpSupportModal', element: null, hasPullHandle: false },
    securityModal: { id: 'securityModal', element: null, hasPullHandle: false },
    securityPinModal: { id: 'securityPinModal', element: null, hasPullHandle: false },
    updateProfileModal: { id: 'updateProfileModal', element: null, hasPullHandle: true },
    pinModal: { id: 'pinModal', element: null, hasPullHandle: false },
    allPlansModal: { id: 'allPlansModal', element: null, hasPullHandle: true },
    contactModal: { id: 'contactModal', element: null, hasPullHandle: false },
    changePwdModal: { id: 'changePwdModal', element: null, hasPullHandle: false },
    rpResetModal: { id: 'rpResetModal', element: null, hasPullHandle: false },
  };


  // Modal stack to track open modals
  const openModalsStack = [];
  let currentDepth = 0;
  let isProcessingPopstate = false;

  // Utility: Check if modal is visible (trimmed logs)
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
    // Log only on mismatch (less spam)
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

  // Utility: Add transition effect (unchanged, but guard self-triggers)
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
      // Guard: Don't log if self-triggered
      if (!isProcessingPopstate) log('debug', `applyTransition: ${modal.id} ${show ? 'shown' : 'hidden'}`);
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

  // Force close modal (trimmed logs)
  function forceCloseModal(modalId) {
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
      document.body.focus();
      log('debug', `forceCloseModal: Moved focus from ${modalId} to body`);
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
        log('debug', `forceCloseModal: Modal ${modalId} closed, stack: ${openModalsStack.map((item) => item.id).join(', ')}, depth: ${currentDepth}`);
      }
      const previousModal = openModalsStack[openModalsStack.length - 1];
      if (previousModal) {
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
        document.body.focus();
        log('debug', 'forceCloseModal: Restored focus to document body');
      }
    });
    hideBackdrop(modal);
  }

  // Open modal (added dynamic z-index for stack robustness)
  function openModal(modalId, skipHistory = false) {
    log('debug', `openModal: Attempting to open ${modalId}`);

    const modalConfig = modals[modalId];
        // Lazy-resolve element if it wasn't present at init (handles dynamic DOM)
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

    modal.classList.remove('hidden');
    modal.style.display = modalConfig.hasPullHandle ? 'block' : 'flex';
    modal.setAttribute('aria-hidden', 'false');
    modal.removeAttribute('inert');

    // Set dynamic z-index based on stack depth (ensures top modal is always visible on top)
    // Set dynamic z-index - always compute topmost
    modal.style.zIndex = getNextModalZIndex();
    
    


    // Special slide-in for updateProfileModal
    if (modalId === 'updateProfileModal') {
      modal.style.transform = 'translateX(-100%)';
      modal.style.opacity = '0';
    } else {
      modal.style.transform = 'translateY(20px)';
      modal.style.opacity = '0';
    }

    applyTransition(modal, true, () => {
      if (!openModalsStack.some((item) => item.id === modalId)) {
        openModalsStack.push({ modal, id: modalId });
        currentDepth++;
      }

      if (!skipHistory) {
        history.pushState({ modalId }, '', `#${modalId}`);
      }

      // Focus handling
      let focusTarget =
        modal.querySelector('input, select, textarea, [tabindex]:not([tabindex="-1"])') ||
        modal.querySelector('button:not([data-close])');

      if (modalId === 'securityPinModal') {
        const title = modal.querySelector('#pinTitle');
        if (title) focusTarget = title;
        // Dispatch event to bind PIN inputs
        document.dispatchEvent(new CustomEvent('security:pin-modal-opened'));
        log('debug', 'openModal: Dispatched security:pin-modal-opened for securityPinModal');
      }

      if (focusTarget) {
        focusTarget.setAttribute('tabindex', '-1');
        focusTarget.focus();
      }

      trapFocus(modal);
    });
  }

  // Close modal (removed PIN guard as no longer needed)
  function closeModal(modalId) {
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

    // Move focus away from modal BEFORE closing
    if (document.activeElement && modal.contains(document.activeElement)) {
      document.body.focus();
      log('debug', `closeModal: Moved focus from ${modalId} to body`);
    }

    // Apply closing transition
    applyTransition(modal, false, () => {
      modal.classList.add('hidden');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      modal.setAttribute('inert', '');
      
      // Remove from stack
      const idx = openModalsStack.findIndex((item) => item.id === modalId);
      if (idx !== -1) {
        openModalsStack.splice(idx, 1);
        currentDepth = openModalsStack.length;
        log('debug', `closeModal: Modal ${modalId} closed, stack: ${openModalsStack.map((item) => item.id).join(', ')}, depth: ${currentDepth}`);
      }

      // Restore previous modal if exists (no need to show if already visible; z-index handles layering)
      const previousModal = openModalsStack[openModalsStack.length - 1];
      if (previousModal) {
        const prevEl = previousModal.modal;
        
        // Focus first focusable element
        const focusable = prevEl.querySelector(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) {
          setTimeout(() => focusable.focus(), 100);
          log('debug', `closeModal: Restored focus to ${previousModal.id}`);
        }
      } else {
        // No more modals, focus body
        document.body.focus();
        log('debug', 'closeModal: Restored focus to document body');
      }
    });
    hideBackdrop(modal);

    // Handle history if needed
    if (history.state && history.state.modalId === modalId) {
      history.back();
      log('debug', `closeModal: Triggered history.back for ${modalId}`);
    }
  }

  // Focus trap for accessibility (unchanged)
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

    modal._trapHandler = keydownHandler;  // Store for cleanup
    modal.addEventListener('keydown', keydownHandler);
    log('debug', `trapFocus: Focus trap set for ${modal.id}`);
  }

  // Handle device back button (popstate) (trimmed logs, added guard)
  function handlePopstate(e) {
    if (isProcessingPopstate) {
      log('debug', 'handlePopstate: Skipping, already processing popstate');
      return;
    }
    isProcessingPopstate = true;
    log('debug', 'handlePopstate: Popstate event triggered', e.state);

    // Close the top modal if it exists
    const topModal = openModalsStack[openModalsStack.length - 1];
    if (topModal) {
      log('debug', `handlePopstate: Closing top modal ${topModal.id}`);
      forceCloseModal(topModal.id);
    }

    if (e.state && e.state.isModal && e.state.modalDepth && e.state.modalId) {
      log('debug', `handlePopstate: Processing modal state, depth: ${e.state.modalDepth}, modalId: ${e.state.modalId}`);
      while (openModalsStack.length > e.state.modalDepth) {
        const { modal, id } = openModalsStack.pop();
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
        // Reset z-index if needed (though usually not, as it was set on open)
        newTopModal.modal.style.zIndex = 1050 + (openModalsStack.length * 10);
        applyTransition(newTopModal.modal, true);
        trapFocus(newTopModal.modal);
        log('debug', `handlePopstate: Restored modal ${newTopModal.id}`);
      }
    } else if (openModalsStack.length > 0) {
      log('debug', 'handlePopstate: No modal state, closing top modal only');
      const { modal, id } = openModalsStack.pop();
      forceCloseModal(id);
      log('debug', `handlePopstate: Closed modal ${id}`);
      // Restore previous modal if any
      const previousModal = openModalsStack[openModalsStack.length - 1];
      if (previousModal && !isModalVisible(previousModal.modal)) {
        previousModal.modal.classList.remove('hidden');
        previousModal.modal.style.display = modals[previousModal.id].hasPullHandle ? 'block' : 'flex';
        previousModal.modal.setAttribute('aria-hidden', 'false');
        previousModal.modal.removeAttribute('inert');
        // Reset z-index
        previousModal.modal.style.zIndex = 1050 + (openModalsStack.length * 10);
        applyTransition(previousModal.modal, true);
        trapFocus(previousModal.modal);
        log('debug', `handlePopstate: Restored previous modal ${previousModal.id}`);
      }
    }

    currentDepth = openModalsStack.length;
    log('debug', `handlePopstate: Updated stack: ${openModalsStack.map((item) => item.id).join(', ')}, depth: ${currentDepth}`);
    if (openModalsStack.length === 0) {
      history.replaceState({ isModal: false }, '', window.location.href);
      log('debug', 'handlePopstate: Reset history state');
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

  // Initialize (removed __setupPinActive from observer)
  function initialize() {
    log('info', 'initialize: Starting initialization');
        // Resolve element references now (handles modals added after script load)
    Object.entries(modals).forEach(([modalId, cfg]) => {
      if (!cfg) return;
      // If element already set, keep it; otherwise attempt to resolve from DOM
      if (!cfg.element) {
        cfg.element = document.getElementById(cfg.id || modalId) || null;
      }
      if (!cfg.element) {
        log('warn', `initialize: Modal element not found for ${modalId} (expected id="${cfg.id || modalId}")`);
      } else {
        log('debug', `initialize: Modal ${modalId} resolved to element`, { id: cfg.element.id });
        // normalize starting hidden state
        if (cfg.element.getAttribute('aria-hidden') === null || cfg.element.getAttribute('aria-hidden') === 'true') {
          cfg.element.setAttribute('aria-hidden', 'true');
          cfg.element.setAttribute('inert', '');
          cfg.element.classList.add('hidden');
          cfg.element.style.display = 'none';
        }
      }
    });


    Object.entries(modals).forEach(([modalId, { element }]) => {
      if (!element) return;
      const closeBtn = element.querySelector('[data-close]');
      if (closeBtn) {
        const closeHandler = (e) => {
          e.preventDefault();
          log('debug', `Close button clicked for ${modalId}`);
          closeModal(modalId);
        };
        // Remove existing listeners to prevent duplicates
        closeBtn.removeEventListener('click', closeBtn._closeHandler);
        closeBtn.removeEventListener('touchend', closeBtn._closeHandler);
        // Store the handler for future removal
        closeBtn._closeHandler = closeHandler;
        closeBtn.addEventListener('click', closeHandler);
        closeBtn.addEventListener('touchend', closeHandler);
        log('debug', `initialize: Bound close button for ${modalId}`);
      } else {
        log('warn', `initialize: No close button found for ${modalId}`);
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
      changePWD: 'changePwdModal',
      // resetPwdBtn: 'rpResetModal',
    };

    // Bind triggers to open modals (retained Smart Button skip for securityPinRow)
    Object.entries(triggers).forEach(([triggerId, modalId]) => {
      const trigger = document.getElementById(triggerId);

      if (trigger) {
        if (triggerId === "securityPinRow") {
          // Special handling for Security PIN modal (SKIP if Smart Button flagged)
          trigger.addEventListener("click", (e) => {
            // Guard: Skip if Smart Button handled (from your dashboard.js)
            if (trigger.dataset.skipModal === 'true' || window.__smartPinHandled) {
              log('debug', `[GUARD] Ignored ${triggerId} click – Smart Button handled`);
              e.stopImmediatePropagation();
              return;
            }

            e.preventDefault();

            // Ignore clicks inside the modal itself
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

          // Ignore clicks on inputs/buttons inside modal
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
          // Normal handling for all other triggers
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

    window.addEventListener('popstate', handlePopstate);
    log('debug', 'initialize: Popstate listener added');

    // MutationObserver with BETTER DEBOUNCE (longer + self-guard) to stop loops
    Object.entries(modals).forEach(([modalId, { element }]) => {
      if (!element) return;
      const observer = new MutationObserver((mutations) => {
        if (isProcessingPopstate) {  // Guard for popstate
          log('debug', `MutationObserver: Skipping for ${modalId} during popstate`);
          return;
        }

        // Debounce: Longer timer + ignore self-changes (e.g., from applyTransition)
        clearTimeout(observer._debounceTimer);
        observer._debounceTimer = setTimeout(() => {
          const visible = isModalVisible(element);
          const inStack = openModalsStack.some((item) => item.id === modalId);
          
          // Only act on real state change (not self-triggered)
          if (visible && !inStack && !element.dataset._mutating) {
            element.dataset._mutating = 'true';  // Temp flag
            log('debug', `MutationObserver: ${modalId} became visible, opening`);
            openModal(modalId);
            setTimeout(() => { delete element.dataset._mutating; }, 200);  // Clear after settle
          } else if (!visible && inStack && !element.dataset._mutating) {
            element.dataset._mutating = 'true';
            log('debug', `MutationObserver: ${modalId} became hidden, closing`);
            closeModal(modalId);
            setTimeout(() => { delete element.dataset._mutating; }, 200);
          }
        }, 200);  // ↑ Longer debounce = fewer loops
      });
      observer.observe(element, {
        attributes: true,
        attributeFilter: ['style', 'class', 'aria-hidden'],
        subtree: false,
      });
      log('debug', `initialize: MutationObserver set for ${modalId}`);
    });

    window.ModalManager = {
      openModal,
      closeModal,
      forceCloseModal,
      getOpenModals: () => openModalsStack.map((item) => item.id),
      getCurrentDepth: () => currentDepth,
      closeAll: () => {
        log('info', 'closeAll: Closing all modals');
        while (openModalsStack.length > 0) {
          const { modal, id } = openModalsStack.pop();
          forceCloseModal(id);
        }
        currentDepth = 0;
        history.replaceState({ isModal: false }, '', window.location.href);
        log('info', 'closeAll: All modals closed, reset history state');
      },
    };
    
    log('info', 'initialize: Initialization complete');
  }

  // Add click protection for nested modals (unchanged)
  Object.entries(modals).forEach(([modalId, { element }]) => {
    if (!element) return;
    
    element.addEventListener('click', (e) => {
      // Stop clicks from propagating to modals beneath
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