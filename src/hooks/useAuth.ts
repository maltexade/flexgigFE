import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/auth';

/**
 * Hook to manage authentication state and session
 */
export const useAuth = () => {
  const { user, isAuthenticated, isLoading, error, fetchSession, logout, setUser } =
    useAuthStore();

  useEffect(() => {
    // Fetch session on mount
    fetchSession();
  }, [fetchSession]);

  const loginWithGoogle = () => {
    authService.loginWithGoogle();
  };

  const handleLogout = async () => {
    await logout();
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    loginWithGoogle,
    logout: handleLogout,
    setUser,
  };
};
