import React, { useEffect } from 'react';
import { Layout, Spinner } from '@/components';
import { useAuth } from '@/hooks';
import { useUserStore } from '@/store/userStore';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants/config';
import { formatDate } from '@/utils/formatters';

/**
 * User Profile page
 */
const Profile: React.FC = () => {
  const { user } = useAuth();
  const { profile, isLoading, fetchProfile } = useUserStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Spinner size="lg" />
        </div>
      </Layout>
    );
  }

  if (!profile && !user) {
    return (
      <Layout>
        <div className="text-center py-8">
          <p className="text-gray-600 dark:text-gray-400">No profile data available</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-museo font-bold text-black dark:text-white mb-8">
          Profile
        </h1>

        {/* Profile Card */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-8">
          <div className="flex items-start gap-6 mb-8">
            {user?.profilePicture && (
              <img
                src={user.profilePicture}
                alt={user.fullName || 'User'}
                className="w-24 h-24 rounded-full object-cover"
              />
            )}
            <div>
              <h2 className="text-2xl font-bold text-black dark:text-white">
                {user?.fullName || profile?.fullName}
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                {user?.email || profile?.email}
              </p>
            </div>
          </div>

          {/* Profile Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400">Username</label>
              <p className="text-lg font-semibold text-black dark:text-white">
                {profile?.username || 'N/A'}
              </p>
            </div>
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400">Email</label>
              <p className="text-lg font-semibold text-black dark:text-white">
                {profile?.email || user?.email}
              </p>
            </div>
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400">Phone Number</label>
              <p className="text-lg font-semibold text-black dark:text-white">
                {profile?.phoneNumber || 'N/A'}
              </p>
            </div>
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400">Country</label>
              <p className="text-lg font-semibold text-black dark:text-white">
                {profile?.country || 'N/A'}
              </p>
            </div>
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400">Member Since</label>
              <p className="text-lg font-semibold text-black dark:text-white">
                {profile?.createdAt ? formatDate(profile.createdAt) : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Profile;
