/**
 * RAGLense — Auth Store
 * Manages authentication state, tokens, and user profile via Zustand.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, TokenPair } from "@/types";

interface AuthState {
  // State
  user: User | null;
  tokens: TokenPair | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setAuth: (user: User, tokens: TokenPair) => void;
  setUser: (user: User) => void;
  setTokens: (tokens: TokenPair) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: true,

      setAuth: (user, tokens) =>
        set({
          user,
          tokens,
          isAuthenticated: true,
          isLoading: false,
        }),

      setUser: (user) => set({ user }),

      setTokens: (tokens) => set({ tokens }),

      setLoading: (loading) => set({ isLoading: loading }),

      logout: () =>
        set({
          user: null,
          tokens: null,
          isAuthenticated: false,
          isLoading: false,
        }),
    }),
    {
      name: "RAGLense-auth",
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
