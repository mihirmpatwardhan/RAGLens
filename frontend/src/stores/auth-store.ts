import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean; // true once the first session check is done
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,      // start true — assume loading until we check
      isInitialized: false, // becomes true after first session fetch

      setUser: (user) =>
        set({
          user,
          isAuthenticated: Boolean(user),
          isLoading: false,
          isInitialized: true,
        }),

      setLoading: (loading) => set({ isLoading: loading }),

      setInitialized: () => set({ isInitialized: true, isLoading: false }),

      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
        }),
    }),
    {
      name: "RAGLens-auth",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        // isLoading and isInitialized are NOT persisted — always re-verify on load
      }),
      onRehydrateStorage: () => (state) => {
        // After rehydration, we still need to verify the token with the server.
        // Keep isLoading true; CustomAuthProvider will set it to false after checking.
        if (state) {
          state.isLoading = true;
          state.isInitialized = false;
        }
      },
    }
  )
);
