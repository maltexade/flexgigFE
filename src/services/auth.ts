import { apiClient } from './api';
import { BACKEND_URL, API_ENDPOINTS } from '@/constants/config';
import { User, AuthResponse, LogoutResponse } from '@/types/auth';

export const authService = {
  /**
   * Get current session user
   */
  async getSession(): Promise<{ user: User | null }> {
    try {
      const response = await apiClient.get(API_ENDPOINTS.AUTH_SESSION);
      return {
        user: response.data || null,
      };
    } catch (error) {
      console.error('Failed to get session:', error);
      return { user: null };
    }
  },

  /**
   * Redirect to Google OAuth login
   */
  loginWithGoogle(): void {
    const authUrl = `${BACKEND_URL}${API_ENDPOINTS.AUTH_LOGIN_GOOGLE}?prompt=select_account`;
    window.location.href = authUrl;
  },

  /**
   * Handle OAuth callback and store user data
   */
  handleOAuthCallback(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
  },

  /**
   * Logout user
   */
  async logout(): Promise<LogoutResponse> {
    try {
      const response = await apiClient.post<LogoutResponse>(API_ENDPOINTS.AUTH_LOGOUT);
      
      // Clear all local storage
      localStorage.clear();
      sessionStorage.clear();
      apiClient.clearAuthToken();
      
      // Clear IndexedDB
      if (window.indexedDB) {
        const dbs = await indexedDB.databases?.();
        if (dbs) {
          dbs.forEach((db) => {
            if (db.name) indexedDB.deleteDatabase(db.name);
          });
        }
      }
      
      return response.data as LogoutResponse;
    } catch (error) {
      console.error('Logout error:', error);
      // Clear local state anyway
      localStorage.clear();
      sessionStorage.clear();
      apiClient.clearAuthToken();
      throw error;
    }
  },

  /**
   * Reset PIN
   */
  async resetPin(email: string, newPin: string): Promise<AuthResponse> {
    const response = await apiClient.post(API_ENDPOINTS.AUTH_RESET_PIN, {
      email,
      newPin,
    });
    return response.data as AuthResponse;
  },

  /**
   * Validate WebAuthn
   */
  async validateWebAuthn(credential: any): Promise<AuthResponse> {
    const response = await apiClient.post('/auth/webauthn/verify', credential);
    return response.data as AuthResponse;
  },
};
