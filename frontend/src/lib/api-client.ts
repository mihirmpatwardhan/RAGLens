/**
 * RAGLense — API Client
 * Axios-based HTTP client with auth interceptors and error handling.
 */

import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth-store";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Create the configured Axios instance.
 */
function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: `${API_BASE_URL}/api/v1`,
    timeout: 30000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  // Request interceptor — attach auth token
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const { tokens } = useAuthStore.getState();
      if (tokens?.access_token) {
        config.headers.Authorization = `Bearer ${tokens.access_token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor — handle token refresh & errors
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & {
        _retry?: boolean;
      };

      // If 401 and not already retrying, attempt token refresh
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        const { tokens, setTokens, logout } = useAuthStore.getState();
        if (tokens?.refresh_token) {
          try {
            const response = await axios.post(
              `${API_BASE_URL}/api/v1/auth/refresh`,
              { refresh_token: tokens.refresh_token }
            );
            const newTokens = response.data;
            setTokens(newTokens);
            originalRequest.headers.Authorization = `Bearer ${newTokens.access_token}`;
            return client(originalRequest);
          } catch {
            logout();
          }
        } else {
          logout();
        }
      }

      return Promise.reject(error);
    }
  );

  return client;
}

// Export singleton instance
export const apiClient = createApiClient();

/**
 * Helper for API error messages.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data;
    if (data?.error?.message) return data.error.message;
    if (data?.detail) return typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    if (error.message) return error.message;
  }
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred";
}
