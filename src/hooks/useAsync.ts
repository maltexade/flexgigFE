import { useCallback, useState } from 'react';
import { getErrorMessage } from '@/utils/errors';

interface UseAsyncOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
}

/**
 * Hook for handling async operations with loading and error states
 */
export const useAsync = <T,>(
  asyncFunction: () => Promise<T>,
  immediate = true,
  options?: UseAsyncOptions
) => {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async () => {
    setStatus('pending');
    setData(null);
    setError(null);
    try {
      const response = await asyncFunction();
      setData(response);
      setStatus('success');
      options?.onSuccess?.(response);
      return response;
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      setStatus('error');
      options?.onError?.(err);
      throw err;
    }
  }, [asyncFunction, options]);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  return { status, data, error, execute };
};
