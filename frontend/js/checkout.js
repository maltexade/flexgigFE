/* checkout-modal.js (ES module version)
   Wiring for #checkoutModal (open/close, touch drag, pay handling)
   Integrates with dashboard.js helpers if they exist:
   - renderCheckoutModal(), triggerCheckoutReauth(), withLoader(), notify()
   - If processCheckoutPayment() exists, it will be called to perform the real charge
*/

console.log('[checkout-modal] Module loaded 🦞');

'use strict';

// Wait for DOM ready (non-blocking)
function domReady(cb) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cb);
  } else cb();
}

// Declare module-scope variables so exports work after DOM ready
let openCheckoutModalLocal, closeCheckoutModalLocal, initCheckoutModal, onPayClicked;

domReady(() => {
  const modal = document.getElementById('checkoutModal');
  if (!modal) {
    console.warn('[checkout-modal] #checkoutModal not found - skipping init');
    return;
  }

  const content = modal.querySelector('.modal-content');
  const closeBtn = modal.querySelector('.close-btn');
  const pullHandle = modal.querySelector('.pull-handle') || modal.querySelector('.handle');
  const payBtn = document.getElementById('payBtn');

  const safeNotify = (msg, type = 'info') => {
    if (typeof notify === 'function') return notify(msg, type);
    console.log('[notify]', type, msg);
  };

  // ------------------------------
  // Modal open/close definitions
  // ------------------------------
  openCheckoutModalLocal = function () {
    try {
      if (typeof renderCheckoutModal === 'function') {
        try { renderCheckoutModal(); } catch (e) { console.warn('[checkout-modal] renderCheckoutModal failed', e); }
      } else {
        const priceEl = document.getElementById('checkout-price');
        if (priceEl && priceEl.textContent) {
          if (payBtn) { payBtn.disabled = false; payBtn.classList.add('active'); }
        }
      }

      modal.style.display = 'flex';
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      history.pushState({ popup: true }, '', location.href);
    } catch (err) {
      console.error('[checkout-modal] open error', err);
    }
  };

  closeCheckoutModalLocal = function () {
    try {
      modal.classList.remove('active');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      if (content) content.style.transform = 'translateY(100%)';
      if (history.state && history.state.popup) history.back();
    } catch (err) {
      console.error('[checkout-modal] close error', err);
    }
  };

  // ------------------------------
  // Pay button logic
  // ------------------------------
  onPayClicked = async function (ev) {
    try {
      if (!payBtn || payBtn.disabled) return;
      const origText = payBtn.textContent;
      payBtn.disabled = true;
      payBtn.classList.remove('active');
      payBtn.textContent = 'Processing...';

      let reauthOk = true;
      if (typeof triggerCheckoutReauth === 'function') {
        const res = await triggerCheckoutReauth();
        if (!res || !res.success) {
          safeNotify('Reauthentication required', 'info');
          reauthOk = false;
        }
      }

      if (!reauthOk) {
        payBtn.disabled = false;
        payBtn.classList.add('active');
        payBtn.textContent = origText;
        return;
      }

      const state = JSON.parse(localStorage.getItem('userState') || '{}');
      const { provider, planId, number } = state;
      const priceEl = document.getElementById('checkout-price');
      const priceText = priceEl ? priceEl.textContent.replace(/[^\d.]/g, '') : null;
      const price = priceText ? Number(priceText) : null;
      const paymentPayload = { provider, planId, number, price };

      let chargeResult = null;
      if (typeof processCheckoutPayment === 'function') {
        chargeResult = await processCheckoutPayment(paymentPayload);
      } else {
        await new Promise(r => setTimeout(r, 900));
        chargeResult = { ok: true, txId: 'SIM-' + Date.now() };
      }

      if (chargeResult && chargeResult.ok) {
        safeNotify('Payment successful', 'success');
        setTimeout(() => closeCheckoutModalLocal(), 600);
      } else {
        safeNotify('Payment failed', 'error');
        payBtn.disabled = false;
        payBtn.classList.add('active');
        payBtn.textContent = origText;
      }
    } catch (err) {
      console.error('[checkout-modal] pay error', err);
    }
  };

  if (payBtn) {
    payBtn.removeEventListener('click', onPayClicked);
    payBtn.addEventListener('click', onPayClicked);
  }

  initCheckoutModal = function () {
    try { if (typeof renderCheckoutModal === 'function') renderCheckoutModal(); } catch (e) {}
  };

  console.log('[checkout-modal] Initialized');
});

// ------------------------------
// EXPORTS
// ------------------------------
export {
  openCheckoutModalLocal as openCheckoutModal,
  closeCheckoutModalLocal as closeCheckoutModal,
  initCheckoutModal,
  onPayClicked
};
