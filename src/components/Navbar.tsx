import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks';
import { ROUTES } from '@/constants/config';
import clsx from 'clsx';

/**
 * Main navigation bar component
 */
const Navbar: React.FC = () => {
  const { user, isAuthenticated, loginWithGoogle, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="bg-black dark:bg-n05 text-white dark:text-black shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to={ROUTES.HOME} className="flex-shrink-0 font-museo font-bold text-2xl">
            FlexGig
          </Link>

          {/* Desktop menu */}
          <div className="hidden md:flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                <Link
                  to={ROUTES.DASHBOARD}
                  className={clsx(
                    'px-3 py-2 rounded-md text-sm font-medium',
                    isActive(ROUTES.DASHBOARD)
                      ? 'bg-p1 text-white'
                      : 'hover:bg-gray-700 dark:hover:bg-gray-300'
                  )}
                >
                  Dashboard
                </Link>
                <Link
                  to={ROUTES.PROFILE}
                  className={clsx(
                    'px-3 py-2 rounded-md text-sm font-medium',
                    isActive(ROUTES.PROFILE)
                      ? 'bg-p1 text-white'
                      : 'hover:bg-gray-700 dark:hover:bg-gray-300'
                  )}
                >
                  Profile
                </Link>
                <div className="flex items-center space-x-3">
                  {user?.profilePicture && (
                    <img
                      src={user.profilePicture}
                      alt={user.fullName || 'User'}
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <span className="text-sm">{user?.fullName || 'User'}</span>
                  <button
                    onClick={logout}
                    className="px-3 py-2 rounded-md text-sm font-medium bg-red-600 hover:bg-red-700"
                  >
                    Logout
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={loginWithGoogle}
                className="px-4 py-2 bg-p1 text-white rounded-md hover:bg-blue-600"
              >
                Sign in with Google
              </button>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4 space-y-2">
            {isAuthenticated ? (
              <>
                <Link
                  to={ROUTES.DASHBOARD}
                  className="block px-3 py-2 rounded-md text-base font-medium hover:bg-gray-700"
                >
                  Dashboard
                </Link>
                <Link
                  to={ROUTES.PROFILE}
                  className="block px-3 py-2 rounded-md text-base font-medium hover:bg-gray-700"
                >
                  Profile
                </Link>
                <button
                  onClick={logout}
                  className="w-full text-left px-3 py-2 rounded-md text-base font-medium bg-red-600 hover:bg-red-700"
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                onClick={loginWithGoogle}
                className="w-full px-3 py-2 bg-p1 text-white rounded-md hover:bg-blue-600"
              >
                Sign in with Google
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
