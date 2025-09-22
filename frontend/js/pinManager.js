// pinManager.js
export const PinManager = {
  async checkPinExists(uid) {
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
        console.error('[PinManager] Failed to check PIN:', await response.text());
        return null;
      }
      const { hasPin } = await response.json();
      return hasPin ? { table: 'users', column: 'pin' } : null;
    } catch (err) {
      console.error('[PinManager] Error checking PIN:', err);
      return null;
    }
  },

  async verifyPin(uid, pin) {
    try {
      const response = await fetch('https://api.flexgig.com.ng/api/verify-pin', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ pin }),
      });
      if (!response.ok) {
        console.error('[PinManager] PIN verification failed:', await response.text());
        return false;
      }
      return true;
    } catch (err) {
      console.error('[PinManager] Error verifying PIN:', err);
      return false;
    }
  },

  async savePin(uid, newPin) {
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
        console.error('[PinManager] PIN update failed:', await response.text());
        return { ok: false, error: 'Failed to update PIN' };
      }
      console.log('[PinManager] PIN updated successfully');
      return { ok: true };
    } catch (err) {
      console.error('[PinManager] Error updating PIN:', err);
      return { ok: false, error: err.message };
    }
  },

  bindStrictInputs(inputs) {
    inputs.forEach(input => {
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('pattern', '[0-9]*');
      input.setAttribute('maxlength', '4');
      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^0-9]/g, '').slice(0, 4);
      });
      input.addEventListener('paste', (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '').slice(0, 4);
        input.value = text;
        e.preventDefault();
      });
      input.addEventListener('keypress', (e) => {
        if (!/[0-9]/.test(e.key) || input.value.length >= 4) {
          e.preventDefault();
        }
      });
    });
  },
};