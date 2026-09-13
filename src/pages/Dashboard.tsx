import React, { useEffect, useState } from 'react';
import { Layout, Spinner, Alert } from '@/components';
import { useAuth } from '@/hooks';
import { useUserStore } from '@/store/userStore';
import { formatCurrency, formatDate } from '@/utils/formatters';

/**
 * Dashboard page - Main user dashboard
 */
const Dashboard: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading, error, fetchProfile } = useUserStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'referrals'>('overview');

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  if (authLoading || profileLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Spinner size="lg" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Welcome section */}
      <div className="mb-8">
        <h1 className="text-4xl font-museo font-bold text-black dark:text-white mb-2">
          Welcome Back, {user?.fullName || 'User'}!
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          {user?.email}
        </p>
      </div>

      {/* Error alert */}
      {error && (
        <Alert
          type="error"
          message={error}
          dismissible
          onClose={() => {}}
        />
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Total Balance</p>
          <p className="text-3xl font-bold text-black dark:text-white mt-2">₦0.00</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Data Used</p>
          <p className="text-3xl font-bold text-black dark:text-white mt-2">0 GB</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Referrals</p>
          <p className="text-3xl font-bold text-black dark:text-white mt-2">0</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Transactions</p>
          <p className="text-3xl font-bold text-black dark:text-white mt-2">0</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex">
            {(['overview', 'transactions', 'referrals'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 font-medium capitalize ${
                  activeTab === tab
                    ? 'border-b-2 border-p1 text-p1'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400">
                Welcome to your FlexGig dashboard! Here you can manage your account, view transactions, and track referrals.
              </p>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="text-center py-8">
              <p className="text-gray-600 dark:text-gray-400">No transactions yet</p>
            </div>
          )}

          {activeTab === 'referrals' && (
            <div className="text-center py-8">
              <p className="text-gray-600 dark:text-gray-400">No referrals yet</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
