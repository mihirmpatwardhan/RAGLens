import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";

const configuredApiUrl = typeof window !== "undefined"
  ? ""
  : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const API_BASE_URL = configuredApiUrl;

type AuthTokenProvider = () => Promise<string | null>;

let authTokenProvider: AuthTokenProvider | null = null;

export function setApiAuthTokenProvider(provider: AuthTokenProvider | null) {
  authTokenProvider = provider;
}

function addAuthInterceptor(client: AxiosInstance) {
  // Attach Bearer token to every request
  client.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      if (authTokenProvider) {
        const token = await authTokenProvider();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // On 401 — clear stale token and redirect to login so the user can re-authenticate
  // instead of silently failing on every subsequent click.
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401 && typeof window !== "undefined") {
        // Only redirect if we actually had a token (avoid redirect loop on login page)
        const hadToken = Boolean(localStorage.getItem("raglens_token"));
        if (hadToken) {
          localStorage.removeItem("raglens_token");
          // Redirect to login; preserve current path so user can return after auth
          const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `/login?returnTo=${returnTo}`;
        }
      }
      return Promise.reject(error);
    }
  );
}

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: `${API_BASE_URL}/api/v1`,
    // 60 s is comfortable for most API calls; file uploads use uploadClient below.
    timeout: 60000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  addAuthInterceptor(client);
  return client;
}

/**
 * Dedicated Axios instance for file uploads.
 * Uses a 5-minute timeout because large PDF/audio/video uploads can easily
 * take several minutes on slow connections. The default 30 s timeout causes
 * spurious "timeout exceeded" errors that users are seeing.
 */
function createUploadClient(): AxiosInstance {
  const client = axios.create({
    baseURL: `${API_BASE_URL}/api/v1`,
    timeout: 300000, // 5 minutes
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  addAuthInterceptor(client);
  return client;
}

export const apiClient = createApiClient();
export const uploadClient = createUploadClient();

export function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
      return "Request timed out. The server is taking too long to respond — please try again.";
    }
    const data = error.response?.data;
    if (data?.error?.message) return data.error.message;
    if (data?.detail) return typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    if (error.message) return error.message;
  }
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred";
}

