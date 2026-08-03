"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { apiClient, setApiAuthTokenProvider } from "@/lib/api-client";
import type { AxiosError } from "axios";


export function CustomAuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, logout, setLoading, setInitialized } = useAuthStore();


  useEffect(() => {
    // 1. Setup API Auth Token Provider to pull from localStorage
    setApiAuthTokenProvider(async () => {
      if (typeof window !== "undefined") {
        return localStorage.getItem("raglens_token");
      }
      return null;
    });

    // 2. Load current user session if token exists
    async function loadUserSession() {
      const token = typeof window !== "undefined"
        ? localStorage.getItem("raglens_token")
        : null;

      if (!token) {
        // No token — definitively not logged in
        logout();
        return;
      }

      setLoading(true);
      try {
        const { data } = await apiClient.get("/auth/me");
        setUser(data);
      } catch (error) {
        const axiosErr = error as AxiosError;
        const status = axiosErr.response?.status;
        // Only clear the token for auth failures (401/403).
        // Network errors (status=undefined) or server errors (5xx) should NOT log out the user —
        // they may be caused by a backend restart and the token is still valid.
        if (status === 401 || status === 403) {
          localStorage.removeItem("raglens_token");
          logout();
        } else {
          console.warn("Could not fetch user session (backend may be starting up):", error);
          // Mark as initialized but keep the persisted user state.
          // The 401 interceptor will handle auth failures on subsequent API calls.
          setInitialized();
        }
      }
    }

    void loadUserSession();

    return () => {
      setApiAuthTokenProvider(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
