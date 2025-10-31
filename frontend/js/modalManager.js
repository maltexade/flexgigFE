// /frontend/js/modalManager.js
(function () {
  'use strict';

  // Toggle for dev logs (set to false in prod)
  const DEBUG_LOGS = true;

  function log(type, msg, data = {}) {
    if (!DEBUG_LOGS) return;
    console[type](`[ModalManager] ${msg}`, data);
  }

  // Modal configuration
  const modals = {
    settingsModal: { element: document.getElementById('settingsModal'), hasPullHandle: false },
    helpSupportModal: { element: document.getElementById('helpSupportModal'), hasPullHandle: false },
    securityModal: { element: document.getElementById('securityModal'), hasPullHandle: false },
    securityPinModal: { element: document.getElementById('securityPinModal'), hasPullHandle: false },
    updateProfileModal: { element: document.getElementById('updateProfileModal'), hasPullHandle: true },
    pinModal: { element: document.getElementById('pinModal'), hasPullHandle: false },
    allPlansModal: { element: document.getElementById('allPlansModal'), hasPullHandle: true },
    contactModal: { element: document.getElementById('contactModal'), hasPullHandle: false },
  };

  // Modal stack to track open modals
  const openModalsStack = [];
  let currentDepth = 0;
  let isProcessingPopstate = false;
  let scrollPosition = 0;

  // ==================== SCROLL LOCK MANAGEMENT ====================
  function lockBodyScroll() {
    // Save current scroll position
    scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    
    // Apply styles to prevent scrolling
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollPosition}px`;
    document.body.style.width = '100%';
    
    // Also lock html element for iOS
    document.documentElement.style.overflow = 'hidden';
    
    log('debug', `lockBodyScroll: Locked at position ${scrollPosition}`);
  }

  function unlockBodyScroll() {
    // Only unlock if no modals are open
    if (openModalsStack.length > 0) {
      log('debug', 'unlockBodyScroll: Skipped - modals still open');
      return;
    }
    
    // Remove scroll lock styles
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    
    document.documentElement.style.overflow = '';
    
    // Restore scroll position
    window.scrollTo(0, scrollPosition);
    
    log('debug', `unlockBodyScroll: Unlocked, restored position ${scrollPosition}`);
  }

  // ==================== BACKDROP MANAGEMENT ====================
  function ensureBackdrop(modal) {
    let backdrop = modal.querySelector('.modal-backdrop');
    
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: -1;
        opacity: 0;
        transition: opacity 0.3s ease;
      `;
      
      // Insert backdrop as first child
      modal.insertBefore(backdrop, modal.firstChild);
      log('debug', `ensureBackdrop: Created backdrop for ${modal.id}`);
    }
    
    return backdrop;
  }

  function showBackdrop(modal) {
    const backdrop = ensureBackdrop(modal);
    requestAnimationFrame(() => {
      backdrop.style.opacity = '1';
    });
  }

  function hideBackdrop(modal) {
    const backdrop = modal.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.style.opacity = '0';
    }
  }

  // ==================== MODAL VISIBILITY CHECK ====================
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
    
    if (isVisible !== (modal.dataset._lastVisible === 'true')) {
      log('debug', `isModalVisible: ${modal.id} now ${isVisible ? 'visible' : 'hidden'}`);
      modal.dataset._lastVisible = isVisible;
    }
    return isVisible;
  }

  // ==================== TRANSITION EFFECTS ====================
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
        hideBackdrop(modal);
      } else {
        modal.removeAttribute('inert');
        showBackdrop(modal);
      }
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

  // ==================== FORCE CLOSE MODAL ====================
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
      hideBackdrop(modal);
      
      const idx = openModalsStack.findIndex((item) => item.id === modalId);
      if (idx !== -1) {
        openModalsStack.splice(idx, 1);
        currentDepth = openModalsStack.length;
        log('debug', `forceCloseModal: Modal ${modalId} closed, stack: ${openModalsStack.map((item) => item.id).join(', ')}, depth: ${currentDepth}`);
      }
      
      // Unlock scroll if no more modals
      unlockBodyScroll();
      
      const previousModal = openModalsStack[openModalsStack.length - 1];
      if (previousModal) {
        const focusable = previousModal.modal.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) {
          focusable.focus();
          log('debug', `forceCloseModal: Restored focus to ${previousModal.id}`);
        }
      } else {
        document.body.focus();
        log('debug', 'forceCloseModal: Restored focus to document body');
      }
    });
  }

  // ==================== OPEN MODAL ====================
  function openModal(modalId, skipHistory = false) {
    log('debug', `openModal: Attempting to open ${modalId}`);

    const modalConfig = modals[modalId];
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

    // Guard: Skip if PIN setup active
    if ((modalId === 'pinModal' || modalId === 'securityPinModal') && window.__setupPinActive) {
      log('warn', `openModal: Skipping ${modalId} – setup active`);
      return;
    }

    // Lock body scroll when first modal opens
    if (openModalsStack.length === 0) {
      lockBodyScroll();
    }

    modal.classList.remove('hidden');
    modal.style.display = modalConfig.hasPullHandle ? 'block' : 'flex';
    modal.setAttribute('aria-hidden', 'false');
    modal.removeAttribute('inert');
    
    // Ensure proper z-index stacking
    modal.style.zIndex = 1000 + currentDepth * 10;

    // Ensure backdrop exists
    ensureBackdrop(modal);

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

      let focusTarget =
        modal.querySelector('input, select, textarea, [tabindex]:not([tabindex="-1"])') ||
        modal.querySelector('button:not([data-close])');

      if (modalId === 'securityPinModal') {
        const title = modal.querySelector('#pinTitle');
        if (title) focusTarget = title;
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

  // ==================== CLOSE MODAL ====================
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

    // Guard: Don't auto-close PIN during setup
    if ((modalId === 'pinModal' || modalId === 'securityPinModal') && window.__setupPinActive) {
      log('warn', `closeModal: Skipping ${modalId} – setup active`);
      return;
    }

    if (document.activeElement && modal.contains(document.activeElement)) {
      document.body.focus();
      log('debug', `closeModal: Moved focus from ${modalId} to body`);
    }

    applyTransition(modal, false, () => {
      modal.classList.add('hidden');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      modal.setAttribute('inert', '');
      hideBackdrop(modal);
      
      const idx = openModalsStack.findIndex((item) => item.id === modalId);
      if (idx !== -1) {
        openModalsStack.splice(idx, 1);
        currentDepth = openModalsStack.length;
        log('debug', `closeModal: Modal ${modalId} closed, stack: ${openModalsStack.map((item) => item.id).join(', ')}, depth: ${currentDepth}`);
      }

      // Unlock scroll if no more modals
      unlockBodyScroll();

      const previousModal = openModalsStack[openModalsStack.length - 1];
      if (previousModal) {
        const prevEl = previousModal.modal;
        
        if (!isModalVisible(prevEl)) {
          prevEl.classList.remove('hidden');
          prevEl.style.display = modals[previousModal.id].hasPullHandle ? 'block' : 'flex';
          prevEl.setAttribute('aria-hidden', 'false');
          prevEl.removeAttribute('inert');
          prevEl.style.zIndex = 1000 + (currentDepth - 1) * 10;
          showBackdrop(prevEl);
          log('debug', `closeModal: Restored visibility for ${previousModal.id}`);
        }
        
        const focusable = prevEl.querySelector(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) {
          setTimeout(() => focusable.focus(), 100);
          log('debug', `closeModal: Restored focus to ${previousModal.id}`);
        }
      } else {
        document.body.focus();
        log('debug', 'closeModal: Restored focus to document body');
      }
    });

    if (history.state && history.state.modalId === modalId) {
      history.back();
      log('debug', `closeModal: Triggered history.back for ${modalId}`);
    }
  }

  // ==================== FOCUS TRAP ====================
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
        } else if (!e.shiftKey && document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    };

    modal._trapHandler = keydownHandler;
    modal.addEventListener('keydown', keydownHandler);
    log('debug', `trapFocus: Focus trap set for ${modal.id}`);
  }

  // ==================== POPSTATE HANDLER ====================
  function handlePopstate(e) {
    if (isProcessingPopstate) {
      log('debug', 'handlePopstate: Skipping, already processing popstate');
      return;
    }
    isProcessingPopstate = true;
    log('debug', 'handlePopstate: Popstate event triggered', e.state);

    const topModal = openModalsStack[openModalsStack.length - 1];
    if (topModal) {
      log('debug', `handlePopstate: Closing top modal ${topModal.id}`);
      forceCloseModal(topModal.id);
    }

    if (e.state && e.state.isModal && e.state.modalDepth && e.state.modalId) {
      log('debug', `handlePopstate: Processing modal state, depth: ${e.state.modalDepth}, modalId: ${e.state.modalId}`);
      while (openModalsStack.length > e.state.modalDepth) {
        const { id } = openModalsStack.pop();
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
        showBackdrop(newTopModal.modal);
        applyTransition(newTopModal.modal, true);
        trapFocus(newTopModal.modal);
        log('debug', `handlePopstate: Restored modal ${newTopModal.id}`);
      }
    } else if (openModalsStack.length > 0) {
      log('debug', 'handlePopstate: No modal state, closing top modal only');
      const { id } = openModalsStack.pop();
      forceCloseModal(id);
      log('debug', `handlePopstate: Closed modal ${id}`);
      
      const previousModal = openModalsStack[openModalsStack.length - 1];
      if (previousModal && !isModalVisible(previousModal.modal)) {
        previousModal.modal.classList.remove('hidden');
        previousModal.modal.style.display = modals[previousModal.id].hasPullHandle ? 'block' : 'flex';
        previousModal.modal.setAttribute('aria-hidden', 'false');
        previousModal.modal.removeAttribute('inert');
        showBackdrop(previousModal.modal);
        applyTransition(previousModal.modal, true);
        trapFocus(previousModal.modal);
        log('debug', `handlePopstate: Restored previous modal ${previousModal.id}`);
      }
    }

    currentDepth = openModalsStack.length;
    log('debug', `handlePopstate: Updated stack: ${openModalsStack.map((item) => item.id).join(', ')}, depth: ${currentDepth}`);
    
    if (openModalsStack.length === 0) {
      history.replaceState({ isModal: false }, '', window.location.href);
      unlockBodyScroll();
      log('debug', 'handlePopstate: Reset history state and unlocked scroll');
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

  // ==================== INITIALIZATION ====================
  function initialize() {
    log('info', 'initialize: Starting initialization');
    
    Object.entries(modals).forEach(([modalId, { element }]) => {
      if (!element) {
        log('error', `initialize: Modal element not found for ${modalId}`);
      } else {
        log('debug', `initialize: Modal ${modalId} found`);
        if (element.getAttribute('aria-hidden') === null || element.getAttribute('aria-hidden') === 'true') {
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
          log('debug', `Close button clicked for ${modalId}`);
          closeModal(modalId);
        };
        closeBtn.removeEventListener('click', closeBtn._closeHandler);
        closeBtn.removeEventListener('touchend', closeBtn._closeHandler);
        closeBtn._closeHandler = closeHandler;
        closeBtn.addEventListener('click', closeHandler);
        closeBtn.addEventListener('touchend', closeHandler);
        log('debug', `initialize: Bound close button for ${modalId}`);
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
              log('debug', `[GUARD] Ignored click inside securityPinModal`);
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
                log('debug', `[GUARD] Click inside securityPinModal ignored for reopening`);
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
      }
    });

    window.addEventListener('popstate', handlePopstate);
    log('debug', 'initialize: Popstate listener added');

    Object.entries(modals).forEach(([modalId, { element }]) => {
      if (!element) return;
      const observer = new MutationObserver((mutations) => {
        if (isProcessingPopstate || window.__setupPinActive) {
          return;
        }

        clearTimeout(observer._debounceTimer);
        observer._debounceTimer = setTimeout(() => {
          const visible = isModalVisible(element);
          const inStack = openModalsStack.some((item) => item.id === modalId);
          
          if (visible && !inStack && !element.dataset._mutating) {
            element.dataset._mutating = 'true';
            log('debug', `MutationObserver: ${modalId} became visible, opening`);
            openModal(modalId);
            setTimeout(() => { delete element.dataset._mutating; }, 200);
          } else if (!visible && inStack && !element.dataset._mutating) {
            element.dataset._mutating = 'true';
            log('debug', `MutationObserver: ${modalId} became hidden, closing`);
            closeModal(modalId);
            setTimeout(() => { delete element.dataset._mutating; }, 200);
          }
        }, 200);
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
          const { id } = openModalsStack.pop();
          forceCloseModal(id);
        }
        currentDepth = 0;
        unlockBodyScroll();
        history.replaceState({ isModal: false }, '', window.location.href);
        log('info', 'closeAll: All modals closed, reset history state');
      },
    };
    
    log('info', 'initialize: Initialization complete');
  }

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

  window.addEventListener('unload', () => {
    log('debug', 'unload: Cleaning up listeners');
    unlockBodyScroll();
    window.removeEventListener('popstate', handlePopstate);
    Object.values(modals).forEach(({ element }) => {
      if (element && element._trapHandler) {
        element.removeEventListener('keydown', element._trapHandler);
      }
    });
  });
})();