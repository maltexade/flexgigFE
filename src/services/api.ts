import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios';
import { BACKEND_URL, HTTP_STATUS } from '@/constants/config';
import { APIResponse } from '@/types/api';
import { handleAPIError, AppError } from '@/utils/errors';

class APIClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: BACKEND_URL,
      timeout: 30000,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        // Handle 401 - redirect to login
        if (error.response?.status === HTTP_STATUS.UNAUTHORIZED) {
          localStorage.clear();
          window.location.href = '/';
        }
        return Promise.reject(error);
      }
    );
  }

  async get<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<APIResponse<T>> {
    try {
      const response = await this.client.get<APIResponse<T>>(url, config);
      return response.data;
    } catch (error) {
      throw handleAPIError(error);
    }
  }

  async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<APIResponse<T>> {
    try {
      const response = await this.client.post<APIResponse<T>>(url, data, config);
      return response.data;
    } catch (error) {
      throw handleAPIError(error);
    }
  }

  async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<APIResponse<T>> {
    try {
      const response = await this.client.put<APIResponse<T>>(url, data, config);
      return response.data;
    } catch (error) {
      throw handleAPIError(error);
    }
  }

  async delete<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<APIResponse<T>> {
    try {
      const response = await this.client.delete<APIResponse<T>>(url, config);
      return response.data;
    } catch (error) {
      throw handleAPIError(error);
    }
  }

  setAuthToken(token: string) {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  clearAuthToken() {
    delete this.client.defaults.headers.common['Authorization'];
  }
}

export const apiClient = new APIClient();
