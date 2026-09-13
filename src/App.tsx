import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { ROUTES } from '@/constants/config';
import {
  Home,
  Dashboard,
  Profile,
  NotFound,
} from '@/pages';
import {
  ProtectedRoute,
  Spinner,
} from '@/components';

/**
 * Main App component with routing
 */
const App: React.FC = () => {
  const { isLoading, fetchSession } = useAuthStore();

  useEffect(() => {
    // Fetch session on app load
    fetchSession();
  }, [fetchSession]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black dark:bg-white">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path={ROUTES.HOME} element={<Home />} />

        {/* Protected routes */}
        <Route
          path={ROUTES.DASHBOARD}
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.PROFILE}
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />

        {/* Catch all - 404 */}
        <Route path={ROUTES.NOT_FOUND} element={<NotFound />} />
        <Route path="*" element={<Navigate to={ROUTES.NOT_FOUND} replace />} />
      </Routes>
    </Router>
  );
};

export default App;
