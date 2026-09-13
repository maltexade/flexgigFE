export interface UserProfile {
  id: string;
  email: string;
  username: string;
  fullName: string;
  profilePicture?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  country?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Referral {
  id: string;
  code: string;
  referrerId: string;
  referreredUserId: string;
  status: 'pending' | 'active' | 'completed';
  reward?: number;
  createdAt: string;
}

export interface ReferralStats {
  totalReferrals: number;
  activeReferrals: number;
  totalEarnings: number;
  pendingEarnings: number;
}
