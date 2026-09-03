"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { CommandPalette } from "@/components/layout/command-palette";
import { useThemeStore } from "@/stores/theme-store";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useAppUser } from "@/hooks/use-auth";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarCollapsed } = useThemeStore();
  const pathname = usePathname();
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAppUser();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/login");
    }
  }, [isLoaded, isSignedIn, router]);

  // Show loading only while auth state is being determined
  if (!isLoaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--color-surface-0)] relative">
        <div className="fixed inset-0 bg-dot-grid opacity-15 pointer-events-none z-0" />
        <div className="flex flex-col items-center gap-3 relative z-10">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--color-brand-600)]" />
          <p className="text-sm font-semibold text-[var(--color-text-secondary)] font-display">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  // If loaded but not signed in, useEffect above is handling redirect — show nothing
  if (!isSignedIn) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--color-surface-0)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--color-brand-600)]" />
          <p className="text-sm font-semibold text-[var(--color-text-secondary)] font-display">
            Redirecting to sign in...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-[var(--color-surface-0)] bg-noise relative">

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
          sidebarCollapsed ? "md:ml-[var(--sidebar-collapsed-width)]" : "md:ml-[var(--sidebar-width)]"
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
