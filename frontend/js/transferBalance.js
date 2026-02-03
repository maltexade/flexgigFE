// frontend/js/transferBalance.js
(function () {
  'use strict';

  const MM_MODAL_ID = 'fxgTransferModal';
  const DOM_MODAL_ID = 'fxg-transfer-modal';
  const FXG_STORAGE_KEY = 'fxgUserBalance';
  const CONFIRM_MODAL_ID = 'fxg-transfer-confirm-modal';

  // helpers
  const onlyDigits = s => (s || '').toString().replace(/[^\d]/g, '');
  const fmt = n => (Number(n) || 0).toLocaleString('en-US');

  function $(id) { return document.getElementById(id); }

  // resolve elements lazily
  function resolveEls() {
    const modalEl = $(DOM_MODAL_ID);
    return {
      modal: modalEl,
      trigger: $('fxg-open-transfer-modal'),
      closeBtn: $('fxg-close-btn'),
      backdrop: modalEl ? modalEl.querySelector('.fxg-backdrop') : null,
      balanceEl: $('fxg-balance'),
      form: $('fxg-form'),
      usernameEl: $('fxg-username'),
      amountEl: $('fxg-amount'),
      continueBtn: $('fxg-continue'),
      usernameErr: $('fxg-username-error'),
      amountErr: $('fxg-amount-error'),
      successEl: $('fxg-success')
    };
  }

  // Local authoritative balance
  let BALANCE = 0;

  // --- Balance init & sync ---
  function initBalanceFromSources() {
    if (typeof window.currentDisplayedBalance === 'number' && !Number.isNaN(window.currentDisplayedBalance)) {
      BALANCE = Number(window.currentDisplayedBalance);
      persistFxgBalance(BALANCE);
      return;
    }
    try {
      const userData = localStorage.getItem('userData');
      if (userData) {
        const parsed = JSON.parse(userData);
        if (parsed && typeof parsed.wallet_balance !== 'undefined') {
          BALANCE = Number(parsed.wallet_balance) || 0;
          persistFxgBalance(BALANCE);
          return;
        }
      }
    } catch (e) {}
    try {
      const prev = localStorage.getItem(FXG_STORAGE_KEY);
      if (prev !== null) {
        BALANCE = Number(prev) || 0;
        return;
      }
    } catch (e) {}
    BALANCE = 0;
  }

  function persistFxgBalance(n) {
    try { localStorage.setItem(FXG_STORAGE_KEY, String(Number(n) || 0)); } catch (e) {}
  }

  function updateLocalBalance(n) {
    n = Number(n) || 0;
    BALANCE = n;
    persistFxgBalance(n);
    const els = resolveEls();
    if (els.balanceEl) {
      els.balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
    }
  }

  function patchUpdateAllBalances() {
    try {
      if (!window.updateAllBalances || window.__fxg_updateAllBalances_patched) return;
      const original = window.updateAllBalances;
      window.updateAllBalances = function (newBalance, skipAnimation) {
        try {
          const res = original.apply(this, arguments);
          if (typeof newBalance !== 'undefined' && newBalance !== null) {
            updateLocalBalance(Number(newBalance) || 0);
          } else if (typeof window.currentDisplayedBalance === 'number') {
            updateLocalBalance(window.currentDisplayedBalance);
          }
          return res;
        } catch (e) {
          try { return original.apply(this, arguments); } catch (err) { console.warn('patched updateAllBalances error', err); }
        }
      };
      window.__fxg_updateAllBalances_patched = true;
      console.debug('[fxgTransfer] Patched window.updateAllBalances');
    } catch (e) {
      console.warn('[fxgTransfer] Failed to patch updateAllBalances', e);
    }
  }

  function bindBalanceUpdateEvent() {
    if (bindBalanceUpdateEvent._bound) return;
    window.addEventListener('balance_update', (ev) => {
      try {
        if (ev?.detail?.balance !== undefined) {
          updateLocalBalance(Number(ev.detail.balance) || 0);
        }
      } catch (e) {}
    });
    bindBalanceUpdateEvent._bound = true;
  }

  function bindStorageEvents() {
    if (bindStorageEvents._bound) return;
    window.addEventListener('storage', (ev) => {
      if (!ev || ev.key !== 'userData' || !ev.newValue) return;
      try {
        const parsed = JSON.parse(ev.newValue);
        if (parsed?.wallet_balance !== undefined) {
          updateLocalBalance(Number(parsed.wallet_balance) || 0);
        }
      } catch (e) {}
    });
    bindStorageEvents._bound = true;
  }

  function refreshOnModalOpen() {
    initBalanceFromSources();
    const els = resolveEls();
    if (els.balanceEl) els.balanceEl.textContent = `Balance: ₦${fmt(BALANCE)}`;
  }



function openModal() {
  if (window.ModalManager?.openModal) {
    window.ModalManager.openModal('fxgTransferModal');
  } else {
    console.warn('[fxgTransfer] ModalManager.openModal not available — modal may not open correctly');
    // optional minimal fallback — but prefer to fix the root cause
    const els = resolveEls();
    if (els.modal) {
      els.modal.style.display = 'block';
      els.modal.classList.add('show');
      document.body.style.overflow = 'hidden';
    }
  }
}

function closeModal() {
  if (window.ModalManager?.closeModal) {
    window.ModalManager.closeModal('fxgTransferModal');
  } else {
    console.warn('[fxgTransfer] ModalManager.closeModal not available');
    const els = resolveEls();
    if (els.modal) {
      els.modal.classList.remove('show');
      setTimeout(() => {
        els.modal.style.display = 'none';
        document.body.style.overflow = '';
      }, 300);
    }
  }
}

  // --- Confirm modal ---
  function ensureConfirmModalExists() {
    if ($(CONFIRM_MODAL_ID)) return;

    const css = `
#${CONFIRM_MODAL_ID} { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:110000; pointer-events:none; }
#${CONFIRM_MODAL_ID} .fxg-confirm-backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.65); backdrop-filter:blur(4px); pointer-events:auto; }
#${CONFIRM_MODAL_ID} .fxg-confirm-sheet { position:relative; width:100%; max-width:520px; background:#000; border-radius:14px; color:#fff; box-shadow:0 30px 80px rgba(0,0,0,0.6); pointer-events:auto; overflow:hidden; transform:translateY(24px); opacity:0; transition:transform .28s cubic-bezier(.18,.9,.32,1), opacity .22s ease; }
@media (max-width:720px) {
  #${CONFIRM_MODAL_ID} .fxg-confirm-sheet { height:60vh; max-height:60vh; border-radius:12px 12px 0 0; width:100%; margin:0 8px 8px 8px; align-self:flex-end; transform:translateY(16px); }
}
#${CONFIRM_MODAL_ID}.show .fxg-confirm-sheet { transform:translateY(0); opacity:1; }
.fxg-confirm-header { display:flex; align-items:center; justify-content:space-between; padding:16px; border-bottom:1px solid rgba(255,255,255,0.04); }
.fxg-confirm-title { font-weight:800; font-size:16px; display:flex; align-items:center; gap:10px; }
.fxg-confirm-body { padding:16px; display:flex; flex-direction:column; gap:12px; color:#c9d6e3; font-size:15px; }
.fxg-confirm-row { display:flex; justify-content:space-between; align-items:center; gap:12px; }
.fxg-confirm-label { color:#9fbbe8; font-weight:700; font-size:13px; }
.fxg-confirm-value { color:#ffffff; font-weight:800; }
.fxg-confirm-footer { padding:14px 16px; border-top:1px solid rgba(255,255,255,0.02); display:flex; gap:10px; justify-content:flex-end; }
.fxg-confirm-btn { background:linear-gradient(90deg,#1ea0ff,#0b67ff); color:#fff; border:none; padding:10px 14px; border-radius:10px; font-weight:800; cursor:pointer; min-width:110px; }
.fxg-confirm-btn:disabled { opacity:0.5; cursor:not-allowed; }
.fxg-confirm-cancel { background:transparent; color:#cfe6ff; border:1px solid rgba(255,255,255,0.04); padding:9px 12px; border-radius:10px; cursor:pointer; }
.fxg-confirm-error { color:#ff8a8a; padding:8px 0; font-size:14px; }
    `.trim();

    const style = document.createElement('style');
    style.setAttribute('data-fxg-confirm-style', 'true');
    style.textContent = css;
    document.head.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.id = CONFIRM_MODAL_ID;
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.innerHTML = `
      <div class="fxg-confirm-backdrop" data-fxg-confirm-close></div>
      <div class="fxg-confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="${CONFIRM_MODAL_ID}-title" tabindex="-1">
        <header class="fxg-confirm-header">
          <div class="fxg-confirm-title">Confirm Transfer</div>
          <button class="fxg-confirm-close" aria-label="Close" style="background:transparent;border:none;color:#fff;font-size:20px;font-weight:bold;cursor:pointer">×</button>
        </header>
        <div class="fxg-confirm-body">
          <div class="fxg-confirm-row"><div class="fxg-confirm-label">Product</div><div class="fxg-confirm-value">Wallet Transfer</div></div>
          <div class="fxg-confirm-row"><div class="fxg-confirm-label">Amount</div><div class="fxg-confirm-value" id="${CONFIRM_MODAL_ID}-amount">₦0</div></div>
          <div class="fxg-confirm-row"><div class="fxg-confirm-label">To</div><div class="fxg-confirm-value" id="${CONFIRM_MODAL_ID}-recipient">@username</div></div>
          <div style="color:#9fbbe8;font-size:13px;margin-top:8px;">Transfers are instant and cannot be reversed.</div>
        </div>
        <footer class="fxg-confirm-footer">
          <button class="fxg-confirm-cancel">Cancel</button>
          <button class="fxg-confirm-btn" id="${CONFIRM_MODAL_ID}-send">Confirm Send</button>
        </footer>
      </div>
    `;
    document.body.appendChild(wrapper);

    // Bind close events once
    const backdrop = wrapper.querySelector('[data-fxg-confirm-close]');
    const closeBtn = wrapper.querySelector('.fxg-confirm-close');
    const cancelBtn = wrapper.querySelector('.fxg-confirm-cancel');

    const closeHandler = () => closeConfirmModal();
    [backdrop, closeBtn, cancelBtn].forEach(el => el?.addEventListener('click', closeHandler));

    wrapper.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeConfirmModal();
    });
  }

  function openConfirmModal(payload) {
    ensureConfirmModalExists();
    const wrapper = $(CONFIRM_MODAL_ID);
    if (!wrapper) return;

    const amountEl = $(`${CONFIRM_MODAL_ID}-amount`);
    const recipientEl = $(`${CONFIRM_MODAL_ID}-recipient`);
    if (amountEl) amountEl.textContent = `₦${fmt(payload.amount)}`;
    if (recipientEl) recipientEl.textContent = `@${payload.recipient}`;

    wrapper.classList.add('show');
    wrapper.setAttribute('aria-hidden', 'false');

    const sendBtn = $(`${CONFIRM_MODAL_ID}-send`);
    if (sendBtn && !sendBtn._fxg_confirm_bound) {
      sendBtn.addEventListener('click', () => confirmSend(payload));
      sendBtn._fxg_confirm_bound = true;
    }

    // No auto-focus — user can tab or click
  }

  function closeConfirmModal() {
    const wrapper = $(CONFIRM_MODAL_ID);
    if (!wrapper) return;
    wrapper.classList.remove('show');
    wrapper.setAttribute('aria-hidden', 'true');
  }

  // --- Real transfer logic (replace simulation with your API call) ---
  async function confirmSend(payload) {
    const wrapper = $(CONFIRM_MODAL_ID);
    const sendBtn = $(`${CONFIRM_MODAL_ID}-send`);
    const cancelBtn = wrapper?.querySelector('.fxg-confirm-cancel');

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    if (cancelBtn) cancelBtn.disabled = true;

    try {
      // ---------------- REAL API CALL GOES HERE ----------------
      // const res = await fetch('/api/wallet/transfer', {
      //   method: 'POST',
      //   credentials: 'include',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     recipient: payload.recipient,
      //     amount: payload.amount
      //   })
      // });
      // if (!res.ok) throw new Error(await res.text() || 'Transfer failed');

      await new Promise(r => setTimeout(r, 900)); // simulation

      // Success path
      BALANCE = Math.max(0, BALANCE - payload.amount);
      updateLocalBalance(BALANCE);

      if (typeof window.updateAllBalances === 'function') {
        try { window.updateAllBalances(BALANCE); } catch {}
      }

      closeConfirmModal();
      ModalManager.closeModal('fxgTransferModal');

      const els = resolveEls();
      if (els.successEl) {
        els.successEl.hidden = false;

        // Reset form
        if (els.usernameEl) els.usernameEl.value = '';
        if (els.amountEl) els.amountEl.value = '';
        if (els.continueBtn) {
          const text = els.continueBtn.querySelector('.fxg-btn-text') || els.continueBtn;
          text.textContent = 'Send Again';
          els.continueBtn.disabled = true;
        }
      }

      // Optional: hide success after some time or on close — your choice
    } catch (err) {
      console.error('[fxgTransfer] Transfer failed', err);

      let errNode = wrapper?.querySelector('.fxg-confirm-error');
      if (!errNode && wrapper) {
        errNode = document.createElement('div');
        errNode.className = 'fxg-confirm-error';
        wrapper.querySelector('.fxg-confirm-body').appendChild(errNode);
      }
      if (errNode) {
        errNode.textContent = err.message?.includes('failed') ? err.message : 'Transfer failed. Please try again.';
      }

      sendBtn.disabled = false;
      sendBtn.textContent = 'Confirm Send';
      if (cancelBtn) cancelBtn.disabled = false;
    }
  }

  // --- Main UI init ---
  function initUI() {
    const els = resolveEls();
    if (!els.modal) {
      console.warn('[fxgTransfer] Modal element not found');
      return;
    }

    // Open trigger
    if (els.trigger && !els.trigger._fxg_bound) {
      els.trigger.addEventListener('click', (e) => {
  e.preventDefault();
  refreshOnModalOpen();           // still update balance
  openModal();                    // now uses ModalManager
  // NO setTimeout focus — ModalManager already handles it
});
      els.trigger._fxg_bound = true;
    }

    // Close
    if (els.closeBtn && !els.closeBtn._fxg_bound) {
  els.closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  });
  els.closeBtn._fxg_bound = true;
}

if (els.backdrop && !els.backdrop._fxg_bound) {
  els.backdrop.addEventListener('click', (e) => {
    // Optional: only close if clicked directly on backdrop (not content)
    if (e.target === els.backdrop) {
      closeModal();
    }
  });
  els.backdrop._fxg_bound = true;
}

    // Validation
    function validate() {
      if (!els.usernameEl || !els.amountEl || !els.continueBtn) return false;

      const username = (els.usernameEl.value || '').trim();
      const raw = onlyDigits(els.amountEl.value);
      const amt = Number(raw);

      const usernameOk = username.length >= 2;
      const amountOk = raw.length > 0 && amt > 0 && amt <= BALANCE;

      if (els.usernameErr) {
        els.usernameErr.textContent = usernameOk || !username ? '' : 'Username too short';
      }

      if (els.amountErr) {
        if (!raw) {
          els.amountErr.textContent = '';
        } else if (amt <= 0) {
          els.amountErr.textContent = 'Invalid amount';
        } else if (amt > BALANCE) {
          els.amountErr.textContent = `Max ₦${fmt(BALANCE)}`;
        } else {
          els.amountErr.textContent = '';
        }
      }

      const valid = usernameOk ;
      els.continueBtn.disabled = !valid;
      return valid;
    }

    // Amount input with better cursor handling
    if (els.amountEl && !els.amountEl._fxg_bound) {
      let prevFormatted = '';

      els.amountEl.addEventListener('input', e => {
        const cursor = e.target.selectionStart;
        let raw = onlyDigits(e.target.value);

        if (raw.length > 1 && raw.startsWith('0')) {
          raw = raw.replace(/^0+/, '') || '0';
        }

        const formatted = raw ? Number(raw).toLocaleString('en-US') : '';

        if (formatted !== prevFormatted) {
          prevFormatted = formatted;
          e.target.value = formatted;

          // Approximate cursor restoration
          const added = formatted.length - raw.length;
          const newPos = cursor + added;
          e.target.setSelectionRange(newPos, newPos);
        }

        validate();
      });

      els.amountEl._fxg_bound = true;
    }

    if (els.usernameEl && !els.usernameEl._fxg_bound) {
      els.usernameEl.addEventListener('input', validate);
      els.usernameEl._fxg_bound = true;
    }

    // Form → Confirm
    if (els.form && !els.form._fxg_bound) {
      els.form.addEventListener('submit', ev => {
        ev.preventDefault();
        if (!validate()) return;

        const payload = {
          recipient: (els.usernameEl.value || '').trim(),
          amount: Number(onlyDigits(els.amountEl.value)),
          timestamp: new Date().toISOString()
        };

        openConfirmModal(payload);
      });
      els.form._fxg_bound = true;
    }

    // Reset success visibility when modal opens
    // Remove any old direct open logic here
window.addEventListener('modalOpened', ev => {
  if (ev?.detail === 'fxgTransferModal') {   // ← use string, not MM_MODAL_ID constant if IDs differ
    refreshOnModalOpen();
    const els = resolveEls();
    if (els.successEl) els.successEl.hidden = true;

    // Optional: re-validate form (in case balance changed while modal was closed)
    if (typeof validate === 'function') validate();

    // NO auto-focus — ModalManager already does reasonable focus trapping
  }
});
  }

  // Bootstrap
  function bootstrap() {
    initBalanceFromSources();
    patchUpdateAllBalances();
    bindBalanceUpdateEvent();
    bindStorageEvents();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(initUI, 80));
    } else {
      setTimeout(initUI, 80);
    }

    // Final safety net
    setTimeout(() => {
      const be = $('fxg-balance');
      if (be) be.textContent = `Balance: ₦${fmt(BALANCE)}`;
    }, 600);
  }

  bootstrap();

  // Debug helpers
  window.fxgTransfer = window.fxgTransfer || {};
  window.fxgTransfer.getBalance = () => BALANCE;
  window.fxgTransfer.setBalance = v => {
    updateLocalBalance(Number(v) || 0);
    if (typeof window.updateAllBalances === 'function') {
      try { window.updateAllBalances(BALANCE); } catch {}
    }
  };

})();