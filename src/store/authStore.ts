import { create } from 'zustand';
import { User } from '@/types/auth';
import { authService } from '@/services/auth';
import { STORAGE_KEYS } from '@/constants/config';

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  
  // Async actions
  fetchSession: () => Promise<void>;
  logout: () => Promise<void>;
  resetPin: (email: string, newPin: string) => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  setUser: (user) => {
    set({ user, isAuthenticated: !!user });
    if (user) {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.USER);
    }
  },

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  clearError: () => set({ error: null }),

  fetchSession: async () => {
    const { setUser, setLoading, setError } = get();
    setLoading(true);
    try {
      const { user } = await authService.getSession();
      setUser(user);
      setError(null);
    } catch (error) {
      console.error('Failed to fetch session:', error);
      setUser(null);
      setError('Failed to load session');
    } finally {
      setLoading(false);
    }
  },

  logout: async () => {
    const { setUser, setLoading, setError } = get();
    setLoading(true);
    try {
      await authService.logout();
      setUser(null);
      setError(null);
    } catch (error) {
      console.error('Logout error:', error);
      setError('Logout failed');
      // Still clear local state
      setUser(null);
    } finally {
      setLoading(false);
    }
  },

  resetPin: async (email: string, newPin: string) => {
    const { setLoading, setError } = get();
    setLoading(true);
    try {
      await authService.resetPin(email, newPin);
      setError(null);
    } catch (error) {
      console.error('PIN reset error:', error);
      setError('Failed to reset PIN');
      throw error;
    } finally {
      setLoading(false);
    }
  },
}));
