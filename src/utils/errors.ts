import { APIError } from '@/types/api';
import { ERROR_MESSAGES } from '@/constants/messages';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const handleAPIError = (error: any): APIError => {
  if (error.response) {
    // Server responded with error
    return {
      message: error.response.data?.message || ERROR_MESSAGES.SERVER_ERROR,
      statusCode: error.response.status,
      details: error.response.data,
    };
  } else if (error.request) {
    // Request made but no response
    return {
      message: ERROR_MESSAGES.NETWORK_ERROR,
      statusCode: 0,
    };
  } else {
    // Error in request setup
    return {
      message: error.message || ERROR_MESSAGES.UNKNOWN_ERROR,
      statusCode: 0,
    };
  }
};

export const getErrorMessage = (error: any): string => {
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  if (error?.response?.data?.message) return error.response.data.message;
  return ERROR_MESSAGES.UNKNOWN_ERROR;
};
