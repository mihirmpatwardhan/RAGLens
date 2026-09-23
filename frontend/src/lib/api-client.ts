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
 * take several minutes on slow connections. When no public backend origin is
 * configured, keep this same-origin so hosted deployments do not target the
 * user's localhost.
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

// Use a direct backend only when explicitly configured (or during server-side
// execution). Otherwise return a same-origin URL for hosted deployments.
export function getStreamingApiUrl(path: string): string {
  return `${API_BASE_URL}/api/v1${path.startsWith("/") ? path : `/${path}`}`;
}

function formatValidationErrors(errors: unknown[]): string {
  return errors
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const errObj = item as { loc?: unknown[]; msg?: string; message?: string };
        const rawField = Array.isArray(errObj.loc)
          ? errObj.loc.filter((l) => l !== "body").join(" ")
          : "";
        const field = rawField ? rawField.charAt(0).toUpperCase() + rawField.slice(1) : "";
        const msg = errObj.msg || errObj.message || JSON.stringify(item);
        return field ? `${field}: ${msg}` : msg;
      }
      return String(item);
    })
    .filter(Boolean)
    .join("; ");
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
      return "Request timed out. The server is taking too long to respond — please try again.";
    }

    const data = error.response?.data;

    // 1. Data is directly an array of validation errors
    if (Array.isArray(data)) {
      return formatValidationErrors(data);
    }

    // 2. Structured error object: { error: { message: ... } }
    if (data?.error?.message && typeof data.error.message === "string") {
      return data.error.message;
    }

    // 3. FastAPI detail field
    if (data?.detail) {
      if (Array.isArray(data.detail)) {
        return formatValidationErrors(data.detail);
      }
      if (typeof data.detail === "string") {
        try {
          const parsed = JSON.parse(data.detail);
          if (Array.isArray(parsed)) {
            return formatValidationErrors(parsed);
          }
          if (parsed && typeof parsed === "object" && parsed.message) {
            return String(parsed.message);
          }
        } catch {
          // Plain string detail
        }
        return data.detail;
      }
      if (typeof data.detail === "object") {
        return JSON.stringify(data.detail);
      }
      return String(data.detail);
    }

    // 4. Data itself is a JSON string representation of errors
    if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return formatValidationErrors(parsed);
        }
      } catch {
        return data;
      }
    }

    if (data?.message && typeof data.message === "string") {
      return data.message;
    }
    if (error.message) return error.message;
  }
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred";
}
