/**
 * RAGLense — Theme Store
 * Manages theme, sidebar, and layout state via Zustand.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ThemeState {
  // Theme
  theme: "dark" | "light" | "system";
  setTheme: (theme: "dark" | "light" | "system") => void;

  // Sidebar
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Command Palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;

  // Right Panel (Pipeline Inspector)
  rightPanelOpen: boolean;
  rightPanelTab: string;
  setRightPanelOpen: (open: boolean) => void;
  setRightPanelTab: (tab: string) => void;
  toggleRightPanel: () => void;

  // Layout
  activeView: string;
  setActiveView: (view: string) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      // Theme defaults
      theme: "dark",
      setTheme: (theme) => set({ theme }),

      // Sidebar defaults
      sidebarOpen: true,
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }),

      // Command Palette
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      toggleCommandPalette: () =>
        set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

      // Right Panel
      rightPanelOpen: false,
      rightPanelTab: "chunks",
      setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
      setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
      toggleRightPanel: () =>
        set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),

      // Layout
      activeView: "chat",
      setActiveView: (view) => set({ activeView: view }),
    }),
    {
      name: "RAGLense-theme",
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);
