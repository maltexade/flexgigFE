import { apiClient } from './api';
import { API_ENDPOINTS } from '@/constants/config';
import { Referral, ReferralStats } from '@/types/user';
import { PaginatedResponse } from '@/types/api';

export const referralService = {
  /**
   * Get referral campaign data
   */
  async getCampaign(): Promise<any> {
    const response = await apiClient.get(API_ENDPOINTS.REFERRAL_CAMPAIGN);
    return response.data;
  },

  /**
   * Get list of referrals
   */
  async getReferrals(
    page = 1,
    limit = 20
  ): Promise<PaginatedResponse<Referral>> {
    const response = await apiClient.get(API_ENDPOINTS.REFERRAL_LIST, {
      params: { page, limit },
    });
    return response.data as PaginatedResponse<Referral>;
  },

  /**
   * Get referral history
   */
  async getReferralHistory(): Promise<any> {
    const response = await apiClient.get(API_ENDPOINTS.REFERRAL_HISTORY);
    return response.data;
  },

  /**
   * Get referral stats
   */
  async getStats(): Promise<ReferralStats> {
    const response = await apiClient.get('/api/referrals/stats');
    return response.data as ReferralStats;
  },

  /**
   * Move referral earnings to wallet
   */
  async moveToWallet(amount: number): Promise<{ success: boolean }> {
    const response = await apiClient.post(API_ENDPOINTS.REFERRAL_MOVE_TO_WALLET, {
      amount,
    });
    return response.data as { success: boolean };
  },
};
