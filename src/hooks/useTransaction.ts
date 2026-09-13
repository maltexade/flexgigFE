import { useCallback } from 'react';
import { transactionService } from '@/services/transaction';
import { useAsync } from './useAsync';
import { Transaction, PaginatedResponse } from '@/types/transaction';

/**
 * Hook for transaction operations
 */
export const useTransaction = () => {
  const getTransactions = useCallback(
    (page = 1, limit = 20) => transactionService.getTransactions(page, limit),
    []
  );

  const getTransaction = useCallback(
    (id: string) => transactionService.getTransaction(id),
    []
  );

  const createTransaction = useCallback(
    (data: {
      type: string;
      amount: number;
      description: string;
      metadata?: Record<string, any>;
    }) => transactionService.createTransaction(data),
    []
  );

  return {
    getTransactions,
    getTransaction,
    createTransaction,
  };
};
