"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { CommandPalette } from "@/components/layout/command-palette";
import { useThemeStore } from "@/stores/theme-store";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarCollapsed } = useThemeStore();
  const pathname = usePathname();

  return (
    <div className="h-screen flex overflow-hidden bg-[var(--color-surface-0)] bg-aurora-animated bg-noise relative">
      {/* Subtle background noise */}
      <div className="fixed inset-0 bg-dot-grid opacity-15 pointer-events-none z-0" />

      {/* Ambient background blur elements */}
      <div className="absolute top-1/4 left-1/3 w-[300px] h-[300px] rounded-full bg-[var(--color-brand-500)]/5 filter blur-3xl pointer-events-none z-0 animate-float-slow" />
      <div className="absolute bottom-1/4 right-1/4 w-[250px] h-[250px] rounded-full bg-[var(--color-accent-500)]/5 filter blur-3xl pointer-events-none z-0 animate-float" />

      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-300 ease-[var(--ease-out-expo)] relative z-10",
          sidebarCollapsed ? "ml-[var(--sidebar-collapsed-width)]" : "ml-[var(--sidebar-width)]"
        )}
      >
        {/* Header */}
        <Header />

        {/* Page Content with animation */}
        <main className="flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25, ease: [0.19, 1, 0.22, 1] }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Command Palette (Global) */}
      <CommandPalette />
    </div>
  );
}
