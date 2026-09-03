"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Search, Bell, PanelRight, Command, Menu, X } from "lucide-react";
import { useThemeStore } from "@/stores/theme-store";
import { useAppUser } from "@/hooks/use-auth";
import { AppUserButton } from "@/components/auth/app-user-button";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Chat",
  "/dashboard/knowledge": "My Workspaces",
  "/dashboard/documents": "My Files",
  "/dashboard/pipelines": "Workflows",
  "/dashboard/playground": "Try AI Models",
  "/dashboard/prompts": "Custom Instructions",
  "/dashboard/agents": "AI Agents",
  "/dashboard/analytics": "Analytics",
  "/dashboard/evaluation": "Quality Check",
  "/dashboard/experiments": "A/B Tests",
  "/dashboard/settings": "Settings",
};

export function Header() {
  const pathname = usePathname();
  const {
    setCommandPaletteOpen,
    rightPanelOpen,
    toggleRightPanel,
    sidebarCollapsed,
    toggleSidebar,
    mobileSidebarOpen,
    toggleMobileSidebar,
  } = useThemeStore();
  const { user } = useAppUser();

  const title = ROUTE_TITLES[pathname] || "RAGLens";

  const toggleNavigation = () => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      toggleMobileSidebar();
    } else {
      toggleSidebar();
    }
  };

  // Typewriter placeholder animation
  const [placeholder, setPlaceholder] = useState("Search anything...");
  useEffect(() => {
    const texts = ["Search your files...", "Go to Workflows...", "Find a Workspace...", "Search chats..."];
    let textIdx = 0;
    let charIdx = 0;
    let isDeleting = false;
    let timeout: NodeJS.Timeout;

    const type = () => {
      const current = texts[textIdx];
      if (isDeleting) {
        setPlaceholder(current.slice(0, charIdx - 1));
        charIdx--;
      } else {
        setPlaceholder(current.slice(0, charIdx + 1));
        charIdx++;
      }

      let speed = isDeleting ? 30 : 60;
      if (!isDeleting && charIdx === current.length) {
        speed = 2000; // wait at end
        isDeleting = true;
      } else if (isDeleting && charIdx === 0) {
        isDeleting = false;
        textIdx = (textIdx + 1) % texts.length;
        speed = 200; // wait before next word
      }

      timeout = setTimeout(type, speed);
    };

    timeout = setTimeout(type, 500);
    return () => clearTimeout(timeout);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setCommandPaletteOpen]);

  return (
    <header className="h-[var(--header-height)] border-b border-[var(--color-border)] bg-[var(--color-surface-50)]/60 backdrop-blur-2xl flex items-center justify-between px-3 sm:px-6 sticky top-0 z-30">
      {/* Left: Title */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={toggleNavigation}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-200)]"
        >
          <span className="md:hidden">
            {mobileSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </span>
          <span className="hidden md:block">
            {sidebarCollapsed ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </span>
        </button>
        <h1 className="text-base font-bold text-[var(--color-text-primary)] font-display">
          {title}
        </h1>
      </div>

      {/* Center: Search with typewriter & expand focus */}
      <motion.button
        onClick={() => setCommandPaletteOpen(true)}
        whileHover={{ scale: 1.01, boxShadow: "0 0 16px rgba(245, 158, 11, 0.12)" }}
        className="hidden sm:flex items-center gap-3 px-4 py-2 rounded-xl bg-[var(--color-surface-200)]/70 border border-[var(--color-border)] hover:border-[var(--color-brand-500)]/30 transition-all cursor-pointer group max-w-xs hover:max-w-md w-full mx-8"
      >
        <Search className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-brand-400)] transition-colors" />
        <span className="text-xs text-[var(--color-text-muted)] flex-1 text-left font-display">
          {placeholder}
        </span>
        <kbd className="hidden md:flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-[var(--color-surface-300)] text-[10px] font-medium text-[var(--color-text-muted)] border border-[var(--color-border)]">
          <Command className="w-3 h-3" />K
        </kbd>
      </motion.button>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-200)] transition-all relative"
        >
          <motion.div
            animate={{ rotate: [0, -12, 12, -12, 12, 0] }}
            transition={{ repeat: Infinity, duration: 1.5, repeatDelay: 3 }}
          >
            <Bell className="w-[18px] h-[18px]" />
          </motion.div>
          <motion.span
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--color-brand-500)]"
            animate={{ scale: [1, 1.25, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{ boxShadow: "0 0 6px rgba(245, 158, 11, 0.5)" }}
          />
        </motion.button>

        {/* Right Panel Toggle */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleRightPanel}
          className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center transition-all",
            rightPanelOpen
              ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10 glow-brand"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-200)]"
          )}
        >
          <PanelRight className="w-[18px] h-[18px]" />
        </motion.button>

        {/* User Avatar */}
        <div className="ml-1 flex items-center">
          <AppUserButton />
          <span className="sr-only">{user?.fullName || "Account"}</span>
        </div>
      </div>
    </header>
  );
}
