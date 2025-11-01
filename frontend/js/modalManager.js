// /frontend/js/modalManager.js
(function () {
  'use strict';

  const DEBUG_LOGS = true;

  function log(type, msg, data = {}) {
    if (!DEBUG_LOGS) return;
    console[type](`[ModalManager] ${msg}`, data);
  }

  // Modal configuration - checkoutModal added with pullHandle
  const modals = {
    settingsModal: { element: document.getElementById('settingsModal'), hasPullHandle: false },
    helpSupportModal: { element: document.getElementById('helpSupportModal'), hasPullHandle: false },
    securityModal: { element: document.getElementById('securityModal'), hasPullHandle: false },
    securityPinModal: { element: document.getElementById('securityPinModal'), hasPullHandle: false },
    updateProfileModal: { element: document.getElementById('updateProfileModal'), hasPullHandle: true },
    pinModal: { element: document.getElementById('pinModal'), hasPullHandle: false },
    allPlansModal: { element: document.getElementById('allPlansModal'), hasPullHandle: true },
    contactModal: { element: document.getElementById('contactModal'), hasPullHandle: false },
    checkoutModal: { element: document.getElementById('checkoutModal'), hasPullHandle: true },
  };

  const openModalsStack = [];
  let currentDepth = 0;
  let isProcessingPopstate = false;
  let scrollPosition = 0;
  let bodyScrollLocked = false;

  // ==================== SCROLL LOCK MANAGEMENT ====================
  function lockBodyScroll() {
    if (bodyScrollLocked) {
      log('debug', 'lockBodyScroll: Already locked');
      return;
    }

    scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    
    // Comprehensive lock strategy
    const body = document.body;
    const html = document.documentElement;
    
    body.style.setProperty('overflow', 'hidden', 'important');
    body.style.setProperty('position', 'fixed', 'important');
    body.style.setProperty('top', `-${scrollPosition}px`, 'important');
    body.style.setProperty('width', '100%', 'important');
    body.style.setProperty('left', '0', 'important');
    body.style.setProperty('right', '0', 'important');
    
    html.style.setProperty('overflow', 'hidden', 'important');
    html.style.setProperty('position', 'relative', 'important');
    
    // Lock main container
    const main = document.querySelector('main') || document.querySelector('.main-content') || document.querySelector('.dashboard-content');
    if (main) {
      main.dataset._origOverflow = main.style.overflow || '';
      main.dataset._origHeight = main.style.height || '';
      main.style.setProperty('overflow', 'hidden', 'important');
      main.style.setProperty('height', '100vh', 'important');
    }
    
    // Add body class for CSS hooks
    body.classList.add('modal-open');
    
    bodyScrollLocked = true;
    log('info', `🔒 Body scroll LOCKED at position ${scrollPosition}`);
  }

  function unlockBodyScroll() {
    // CRITICAL: Only unlock when stack is truly empty
    if (openModalsStack.length > 0) {
      log('debug', `unlockBodyScroll: SKIPPED - ${openModalsStack.length} modal(s) still open`);
      return;
    }

    if (!bodyScrollLocked) {
      log('debug', 'unlockBodyScroll: Not locked');
      return;
    }
    
    const body = document.body;
    const html = document.documentElement;
    
    // Remove all inline styles
    body.style.removeProperty('overflow');
    body.style.removeProperty('position');
    body.style.removeProperty('top');
    body.style.removeProperty('width');
    body.style.removeProperty('left');
    body.style.removeProperty('right');
    
    html.style.removeProperty('overflow');
    html.style.removeProperty('position');
    
    // Restore main container
    const main = document.querySelector('main') || document.querySelector('.main-content') || document.querySelector('.dashboard-content');
    if (main) {
      const origOverflow = main.dataset._origOverflow || '';
      const origHeight = main.dataset._origHeight || '';
      main.style.overflow = origOverflow;
      main.style.height = origHeight;
      delete main.dataset._origOverflow;
      delete main.dataset._origHeight;
    }
    
    // Remove body class
    body.classList.remove('modal-open');
    
    // Restore scroll position
    window.scrollTo(0, scrollPosition);
    
    bodyScrollLocked = false;
    log('info', `🔓 Body scroll UNLOCKED, restored to ${scrollPosition}`);
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
        pointer-events: auto;
      `;
      
      modal.insertBefore(backdrop, modal.firstChild);
      log('debug', `ensureBackdrop: Created for ${modal.id}`);
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
    if (!modal) return false;
    const cs = window.getComputedStyle(modal);
    const ariaHidden = modal.getAttribute('aria-hidden') !== 'true';
    return cs.display !== 'none' && 
           cs.visibility !== 'hidden' && 
           !modal.classList.contains('hidden') && 
           ariaHidden;
  }

  // ==================== TRANSITION EFFECTS ====================
  function applyTransition(modal, show, callback) {
    if (!modal) return callback?.();

    const isProfile = modal.id === 'updateProfileModal';
    const isCheckout = modal.id === 'checkoutModal';
    const isAllPlans = modal.id === 'allPlansModal';
    
    // Modals with pull handles slide from bottom
    const slideFromBottom = isCheckout || isAllPlans || modal.querySelector('.pull-handle');
    
    modal.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    
    if (show) {
      modal.style.opacity = '0';
      if (isProfile) {
        modal.style.transform = 'translateX(-100%)';
      } else if (slideFromBottom) {
        modal.style.transform = 'translateY(100%)';
      } else {
        modal.style.transform = 'translateY(20px)';
      }
    } else {
      modal.style.opacity = '1';
      if (isProfile) {
        modal.style.transform = 'translateX(0)';
      } else if (slideFromBottom) {
        modal.style.transform = 'translateY(0)';
      } else {
        modal.style.transform = 'translateY(0)';
      }
    }

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
      callback?.();
    };

    modal.addEventListener('transitionend', onTransitionEnd);

    requestAnimationFrame(() => {
      if (show) {
        modal.style.opacity = '1';
        if (isProfile) {
          modal.style.transform = 'translateX(0)';
        } else if (slideFromBottom) {
          modal.style.transform = 'translateY(0)';
        } else {
          modal.style.transform = 'translateY(0)';
        }
      } else {
        modal.style.opacity = '0';
        if (isProfile) {
          modal.style.transform = 'translateX(-100%)';
        } else if (slideFromBottom) {
          modal.style.transform = 'translateY(100%)';
        } else {
          modal.style.transform = 'translateY(20px)';
        }
      }
    });
  }

  // ==================== FORCE CLOSE MODAL ====================
  function forceCloseModal(modalId) {
    log('debug', `forceCloseModal: ${modalId}`);
    const modalConfig = modals[modalId];
    if (!modalConfig?.element) {
      log('error', `forceCloseModal: Not found ${modalId}`);
      return;
    }
    
    const modal = modalConfig.element;
    if (!isModalVisible(modal)) {
      const idx = openModalsStack.findIndex((item) => item.id === modalId);
      if (idx !== -1) {
        openModalsStack.splice(idx, 1);
        currentDepth = openModalsStack.length;
      }
      return;
    }
    
    if (document.activeElement && modal.contains(document.activeElement)) {
      document.body.focus();
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
        log('info', `Closed ${modalId}, stack: [${openModalsStack.map(i => i.id).join(', ')}], depth: ${currentDepth}`);
      }
      
      // CRITICAL: Unlock only when stack empty
      if (openModalsStack.length === 0) {
        unlockBodyScroll();
      }
      
      const previousModal = openModalsStack[openModalsStack.length - 1];
      if (previousModal) {
        const focusable = previousModal.modal.querySelector(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) focusable.focus();
      }
    });
  }

  // ==================== OPEN MODAL ====================
  function openModal(modalId, skipHistory = false) {
    log('debug', `openModal: ${modalId}`);

    const modalConfig = modals[modalId];
    if (!modalConfig?.element) {
      log('error', `openModal: Not found ${modalId}`);
      return;
    }

    const modal = modalConfig.element;
    
    // Check if already in stack
    if (openModalsStack.some((item) => item.id === modalId)) {
      log('debug', `openModal: ${modalId} already open`);
      return;
    }

    // PIN setup guard
    if ((modalId === 'pinModal' || modalId === 'securityPinModal') && window.__setupPinActive) {
      log('warn', `openModal: Blocked ${modalId} - setup active`);
      return;
    }

    // CRITICAL: Lock scroll when first modal opens
    if (openModalsStack.length === 0) {
      lockBodyScroll();
    }

    // Calculate z-index for proper stacking
    const baseZIndex = 1000;
    const zIndex = baseZIndex + (currentDepth * 10);
    modal.style.zIndex = zIndex;
    
    log('info', `Opening ${modalId} at z-index ${zIndex}, depth: ${currentDepth}`);

    modal.classList.remove('hidden');
    modal.style.display = modalConfig.hasPullHandle ? 'block' : 'flex';
    modal.setAttribute('aria-hidden', 'false');
    modal.removeAttribute('inert');
    
    ensureBackdrop(modal);

    applyTransition(modal, true, () => {
      openModalsStack.push({ modal, id: modalId });
      currentDepth++;
      
      log('info', `Opened ${modalId}, stack: [${openModalsStack.map(i => i.id).join(', ')}], depth: ${currentDepth}`);

      if (!skipHistory) {
        history.pushState({ modalId, modalDepth: currentDepth }, '', `#${modalId}`);
      }

      let focusTarget = modal.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusTarget) {
        focusTarget = modal.querySelector('button:not([data-close]):not([disabled])');
      }

      if (modalId === 'securityPinModal') {
        const title = modal.querySelector('#pinTitle');
        if (title) focusTarget = title;
        document.dispatchEvent(new CustomEvent('security:pin-modal-opened'));
      }

      if (focusTarget) {
        focusTarget.setAttribute('tabindex', '-1');
        setTimeout(() => focusTarget.focus(), 100);
      }

      trapFocus(modal);
    });
  }

  // ==================== CLOSE MODAL ====================
  function closeModal(modalId) {
    log('debug', `closeModal: ${modalId}`);
    const modalConfig = modals[modalId];
    if (!modalConfig?.element) {
      log('error', `closeModal: Not found ${modalId}`);
      return;
    }
    
    const modal = modalConfig.element;
    if (!isModalVisible(modal)) {
      log('warn', `closeModal: ${modalId} not visible`);
      return;
    }

    // PIN setup guard
    if ((modalId === 'pinModal' || modalId === 'securityPinModal') && window.__setupPinActive) {
      log('warn', `closeModal: Blocked ${modalId} - setup active`);
      return;
    }

    if (document.activeElement && modal.contains(document.activeElement)) {
      document.body.focus();
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
        log('info', `Closed ${modalId}, stack: [${openModalsStack.map(i => i.id).join(', ')}], depth: ${currentDepth}`);
      }

      // CRITICAL: Only unlock when stack empty
      if (openModalsStack.length === 0) {
        unlockBodyScroll();
      }

      const previousModal = openModalsStack[openModalsStack.length - 1];
      if (previousModal) {
        const prevEl = previousModal.modal;
        
        if (!isModalVisible(prevEl)) {
          prevEl.classList.remove('hidden');
          prevEl.style.display = modals[previousModal.id].hasPullHandle ? 'block' : 'flex';
          prevEl.setAttribute('aria-hidden', 'false');
          prevEl.removeAttribute('inert');
          prevEl.style.zIndex = 1000 + ((currentDepth - 1) * 10);
          showBackdrop(prevEl);
          log('debug', `Restored ${previousModal.id}`);
        }
        
        const focusable = prevEl.querySelector(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) {
          setTimeout(() => focusable.focus(), 100);
        }
      }
    });

    if (history.state?.modalId === modalId) {
      history.back();
    }
  }

  // ==================== FOCUS TRAP ====================
  function trapFocus(modal) {
    if (!modal) return;
    
    const focusableElements = modal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    if (!firstFocusable || !lastFocusable) return;

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
  }

  // ==================== POPSTATE HANDLER ====================
  function handlePopstate(e) {
    if (isProcessingPopstate) return;
    isProcessingPopstate = true;
    
    log('info', `🔙 Popstate: state=${JSON.stringify(e.state)}, stack=[${openModalsStack.map(i => i.id).join(', ')}]`);

    const topModal = openModalsStack[openModalsStack.length - 1];
    if (topModal) {
      log('debug', `Closing top modal: ${topModal.id}`);
      forceCloseModal(topModal.id);
    }

    if (e.state?.isModal && e.state.modalDepth && e.state.modalId) {
      while (openModalsStack.length > e.state.modalDepth) {
        const { id } = openModalsStack.pop();
        forceCloseModal(id);
      }
      
      const newTopModal = openModalsStack[openModalsStack.length - 1];
      if (newTopModal && newTopModal.id === e.state.modalId && !isModalVisible(newTopModal.modal)) {
        const m = newTopModal.modal;
        m.classList.remove('hidden');
        m.style.display = modals[newTopModal.id].hasPullHandle ? 'block' : 'flex';
        m.setAttribute('aria-hidden', 'false');
        m.removeAttribute('inert');
        showBackdrop(m);
        applyTransition(m, true);
        trapFocus(m);
      }
    } else if (openModalsStack.length > 0) {
      const { id } = openModalsStack.pop();
      forceCloseModal(id);
      
      const previousModal = openModalsStack[openModalsStack.length - 1];
      if (previousModal && !isModalVisible(previousModal.modal)) {
        const m = previousModal.modal;
        m.classList.remove('hidden');
        m.style.display = modals[previousModal.id].hasPullHandle ? 'block' : 'flex';
        m.setAttribute('aria-hidden', 'false');
        m.removeAttribute('inert');
        showBackdrop(m);
        applyTransition(m, true);
        trapFocus(m);
      }
    }

    currentDepth = openModalsStack.length;
    
    if (openModalsStack.length === 0) {
      history.replaceState({ isModal: false }, '', window.location.href);
      unlockBodyScroll();
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
    }

    setTimeout(() => {
      isProcessingPopstate = false;
    }, 50);
  }

  // ==================== INITIALIZATION ====================
  function initialize() {
    log('info', '🚀 ModalManager initializing...');
    
    Object.entries(modals).forEach(([modalId, { element }]) => {
      if (!element) {
        log('warn', `Modal not found: ${modalId}`);
      } else {
        element.setAttribute('aria-hidden', 'true');
        element.setAttribute('inert', '');
        element.classList.add('hidden');
        element.style.display = 'none';
      }
    });

    Object.entries(modals).forEach(([modalId, { element }]) => {
      if (!element) return;
      
      const closeBtn = element.querySelector('[data-close]');
      if (closeBtn) {
        const closeHandler = (e) => {
          e.preventDefault();
          e.stopPropagation();
          closeModal(modalId);
        };
        closeBtn.removeEventListener('click', closeBtn._closeHandler);
        closeBtn.removeEventListener('touchend', closeBtn._closeHandler);
        closeBtn._closeHandler = closeHandler;
        closeBtn.addEventListener('click', closeHandler);
        closeBtn.addEventListener('touchend', closeHandler);
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
      if (!trigger) return;

      if (triggerId === "securityPinRow") {
        trigger.addEventListener("click", (e) => {
          if (trigger.dataset.skipModal === 'true' || window.__smartPinHandled) {
            e.stopImmediatePropagation();
            return;
          }
          e.preventDefault();
          if (e.target.closest("#securityPinModal")) return;
          openModal(modalId);
        }, { capture: true });

        const secModal = document.getElementById("securityPinModal");
        if (secModal) {
          secModal.addEventListener("click", (e) => {
            if (e.target.closest("form") || e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") {
              e.stopPropagation();
            }
          });
        }
      } else {
        trigger.addEventListener("click", (e) => {
          e.preventDefault();
          openModal(modalId);
        });
      }
    });

    window.addEventListener('popstate', handlePopstate);

    // Lighter mutation observer - only for critical state changes
    Object.entries(modals).forEach(([modalId, { element }]) => {
      if (!element) return;
      
      const observer = new MutationObserver(() => {
        if (isProcessingPopstate || window.__setupPinActive) return;
        
        clearTimeout(observer._debounceTimer);
        observer._debounceTimer = setTimeout(() => {
          const visible = isModalVisible(element);
          const inStack = openModalsStack.some((item) => item.id === modalId);
          
          if (visible && !inStack && !element.dataset._mutating) {
            element.dataset._mutating = 'true';
            openModal(modalId);
            setTimeout(() => delete element.dataset._mutating, 200);
          } else if (!visible && inStack && !element.dataset._mutating) {
            element.dataset._mutating = 'true';
            closeModal(modalId);
            setTimeout(() => delete element.dataset._mutating, 200);
          }
        }, 150);
      });
      
      observer.observe(element, {
        attributes: true,
        attributeFilter: ['class', 'aria-hidden'],
        subtree: false,
      });
    });

    window.ModalManager = {
      openModal,
      closeModal,
      forceCloseModal,
      getOpenModals: () => openModalsStack.map((item) => item.id),
      getCurrentDepth: () => currentDepth,
      isScrollLocked: () => bodyScrollLocked,
      closeAll: () => {
        log('info', '🗑️ Closing all modals');
        while (openModalsStack.length > 0) {
          const { id } = openModalsStack.pop();
          forceCloseModal(id);
        }
        currentDepth = 0;
        unlockBodyScroll();
        history.replaceState({ isModal: false }, '', window.location.href);
      },
    };
    
    log('info', '✅ ModalManager ready');
  }

  document.addEventListener('DOMContentLoaded', initialize);

  window.addEventListener('unload', () => {
    unlockBodyScroll();
    window.removeEventListener('popstate', handlePopstate);
    Object.values(modals).forEach(({ element }) => {
      if (element?._trapHandler) {
        element.removeEventListener('keydown', element._trapHandler);
      }
    });
  });
})();