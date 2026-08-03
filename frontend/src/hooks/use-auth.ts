import { useAuthStore } from "@/stores/auth-store";
import { useCallback } from "react";

// ──────────────────────────────────────────────
// Local JWT-backed hooks
// ──────────────────────────────────────────────

export function useAppAuth() {
  const { user, logout } = useAuthStore();

  const getLocalToken = useCallback(async () => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("raglens_token");
    }
    return null;
  }, []);

  return {
    getToken: getLocalToken,
    userId: user?.id || null,
    isSignedIn: Boolean(user),
    isLoaded: true,
    signOut: async () => {
      if (typeof window !== "undefined") {
        localStorage.removeItem("raglens_token");
      }
      logout();
      // Force redirect to login
      window.location.href = "/login";
    },
    isClerk: false,
  };
}

export function useAppUser() {
  const { user, isLoading, isInitialized } = useAuthStore();

  // isLoaded = true only after the session check is complete.
  // This prevents the dashboard from flashing a redirect to /login
  // before the CustomAuthProvider has verified the stored token.
  const isLoaded = isInitialized && !isLoading;

  return {
    user: user
      ? {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          imageUrl: user.avatar_url || undefined,
          firstName: user.full_name?.split(" ")[0] || undefined,
        }
      : null,
    isSignedIn: Boolean(user),
    isLoaded,
    isClerk: false,
  };
}
