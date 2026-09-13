import React, { useEffect } from 'react';
import { Layout, Button } from '@/components';
import { useAuth } from '@/hooks';
import { ROUTES } from '@/constants/config';
import { useNavigate } from 'react-router-dom';

/**
 * Home page - Landing page with login
 */
const Home: React.FC = () => {
  const { isAuthenticated, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to dashboard if already authenticated
    if (isAuthenticated) {
      navigate(ROUTES.DASHBOARD);
    }
  }, [isAuthenticated, navigate]);

  return (
    <Layout>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center min-h-[calc(100vh-200px)]">
        {/* Left side - Content */}
        <div className="space-y-6">
          <h1 className="text-5xl font-museo font-bold text-black dark:text-white">
            FlexGig
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Cheap Data Plug
          </p>
          <p className="text-lg text-gray-700 dark:text-gray-400">
            Get affordable data, convert excess airtime to cash, and pay utility bills - all with great user experience and speed.
          </p>

          {/* Features */}
          <div className="space-y-3 pt-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📱</span>
              <span className="text-gray-700 dark:text-gray-300">Affordable data plans</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">💰</span>
              <span className="text-gray-700 dark:text-gray-300">Convert airtime to cash</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚡</span>
              <span className="text-gray-700 dark:text-gray-300">Pay bills instantly</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">🚀</span>
              <span className="text-gray-700 dark:text-gray-300">Fast & secure</span>
            </div>
          </div>
        </div>

        {/* Right side - CTA */}
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-p1 to-blue-600 rounded-lg p-8 text-white shadow-lg">
            <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
            <p className="text-lg mb-6">Sign in with your Google account to access all features.</p>
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onClick={loginWithGoogle}
            >
              Sign in with Google
            </Button>
          </div>

          {/* Additional info */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-3">Why choose FlexGig?</h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li>✓ Instant transactions</li>
              <li>✓ Best rates guaranteed</li>
              <li>✓ Secure & verified</li>
              <li>✓ 24/7 support</li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Home;
