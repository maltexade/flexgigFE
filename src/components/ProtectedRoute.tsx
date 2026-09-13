import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks';
import Spinner from './Spinner';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Route wrapper that redirects to home if not authenticated
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
