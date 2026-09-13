import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';

/**
 * Hook to check if user is authenticated and protect routes
 */
export const useProtectedRoute = () => {
  const { user, isLoading } = useAuthStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setIsReady(true);
    }
  }, [isLoading]);

  return {
    isAuthenticated: !!user,
    user,
    isLoading: !isReady,
  };
};
