import { create } from 'zustand';
import { userService } from '@/services/user';
import { UserProfile } from '@/types/user';

interface UserStore {
  profile: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  
  // Async actions
  fetchProfile: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

export const useUserStore = create<UserStore>((set, get) => ({
  profile: null,
  isLoading: false,
  error: null,

  setProfile: (profile) => set({ profile }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  clearError: () => set({ error: null }),

  fetchProfile: async () => {
    const { setProfile, setLoading, setError } = get();
    setLoading(true);
    try {
      const profile = await userService.getProfile();
      setProfile(profile);
      setError(null);
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  },

  updateProfile: async (data) => {
    const { setProfile, setLoading, setError } = get();
    setLoading(true);
    try {
      const updatedProfile = await userService.updateProfile(data);
      setProfile(updatedProfile);
      setError(null);
    } catch (error) {
      console.error('Failed to update profile:', error);
      setError('Failed to update profile');
      throw error;
    } finally {
      setLoading(false);
    }
  },
}));
