import { apiClient } from './api';
import { API_ENDPOINTS } from '@/constants/config';
import { UserProfile } from '@/types/user';

export const userService = {
  /**
   * Get user profile
   */
  async getProfile(): Promise<UserProfile> {
    const response = await apiClient.get(API_ENDPOINTS.USER_PROFILE);
    return response.data as UserProfile;
  },

  /**
   * Update user profile
   */
  async updateProfile(profileData: Partial<UserProfile>): Promise<UserProfile> {
    const response = await apiClient.put(
      API_ENDPOINTS.USER_UPDATE,
      profileData
    );
    return response.data as UserProfile;
  },

  /**
   * Update profile picture
   */
  async updateProfilePicture(file: File): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await apiClient.post(
      '/api/user/profile-picture',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return response.data as { url: string };
  },
};
