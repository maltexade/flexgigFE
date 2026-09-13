import { apiClient } from './api';
import { API_ENDPOINTS } from '@/constants/config';
import { Transaction } from '@/types/transaction';
import { PaginatedResponse } from '@/types/api';

export const transactionService = {
  /**
   * Get transaction list
   */
  async getTransactions(
    page = 1,
    limit = 20
  ): Promise<PaginatedResponse<Transaction>> {
    const response = await apiClient.get(API_ENDPOINTS.TRANSACTION_LIST, {
      params: { page, limit },
    });
    return response.data as PaginatedResponse<Transaction>;
  },

  /**
   * Get transaction details
   */
  async getTransaction(id: string): Promise<Transaction> {
    const url = API_ENDPOINTS.TRANSACTION_DETAILS.replace(':id', id);
    const response = await apiClient.get(url);
    return response.data as Transaction;
  },

  /**
   * Create new transaction (buy data, airtime, etc)
   */
  async createTransaction(data: {
    type: string;
    amount: number;
    description: string;
    metadata?: Record<string, any>;
  }): Promise<Transaction> {
    const response = await apiClient.post(API_ENDPOINTS.TRANSACTION_LIST, data);
    return response.data as Transaction;
  },
};
