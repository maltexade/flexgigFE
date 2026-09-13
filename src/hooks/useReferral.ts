import { useCallback } from 'react';
import { referralService } from '@/services/referral';
import { useAsync } from './useAsync';

/**
 * Hook for referral operations
 */
export const useReferral = () => {
  const getCampaign = useCallback(() => referralService.getCampaign(), []);
  const getReferrals = useCallback(
    (page = 1, limit = 20) => referralService.getReferrals(page, limit),
    []
  );
  const getReferralHistory = useCallback(
    () => referralService.getReferralHistory(),
    []
  );
  const getStats = useCallback(() => referralService.getStats(), []);
  const moveToWallet = useCallback(
    (amount: number) => referralService.moveToWallet(amount),
    []
  );

  return {
    getCampaign,
    getReferrals,
    getReferralHistory,
    getStats,
    moveToWallet,
  };
};
