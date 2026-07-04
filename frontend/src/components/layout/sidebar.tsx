"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  MessageSquare,
  Database,
  FileText,
  GitBranch,
  Beaker,
  BarChart3,
  Target,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Layers,
  FlaskConical,
} from "lucide-react";
import { useThemeStore } from "@/stores/theme-store";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "AI Studio",
    items: [
      { title: "Chat", href: "/dashboard", icon: MessageSquare },
      { title: "Knowledge Bases", href: "/dashboard/knowledge", icon: Database },
      { title: "Documents", href: "/dashboard/documents", icon: FileText },
      { title: "Pipelines", href: "/dashboard/pipelines", icon: GitBranch },
    ],
  },
  {
    title: "Playground",
    items: [
      { title: "Model Arena", href: "/dashboard/playground", icon: Beaker },
      { title: "Prompt Lab", href: "/dashboard/prompts", icon: Sparkles },
      { title: "Agents", href: "/dashboard/agents", icon: Layers, badge: "Multi" },
    ],
  },
  {
    title: "Observability",
    items: [
      { title: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
      { title: "Evaluation", href: "/dashboard/evaluation", icon: Target },
      { title: "Experiments", href: "/dashboard/experiments", icon: FlaskConical },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useThemeStore();
  const { user } = useAuthStore();

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 h-full z-40 flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-50)]/80 backdrop-blur-xl transition-all duration-300 ease-[var(--ease-out-expo)]",
        sidebarCollapsed
          ? "w-[var(--sidebar-collapsed-width)]"
          : "w-[var(--sidebar-width)]"
      )}
    >
      {/* Animated gradient edge accent */}
      <div className="absolute top-0 right-0 w-[2px] h-full overflow-hidden z-20">
        <div 
          className="w-full h-full bg-gradient-to-b from-[var(--color-brand-500)] via-[var(--color-accent-400)] to-[var(--color-rose-400)] opacity-40"
          style={{ backgroundSize: "100% 200%", animation: "gradient-x 6s ease-in-out infinite" }} 
        />
      </div>

      {/* 3D Perspective rotation container inside sidebar */}
      <div 
        className="flex flex-col h-full transition-all duration-300"
        style={{
          transform: sidebarCollapsed ? "perspective(1000px) rotateY(4deg)" : "perspective(1000px) rotateY(0deg)",
          transformOrigin: "left center"
        }}
      >
        {/* Logo */}
        <div className="h-[var(--header-height)] flex items-center px-4 border-b border-[var(--color-border)]">
          <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
            <motion.div
              className="w-9 h-9 min-w-[36px] rounded-xl bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-accent-400)] flex items-center justify-center shadow-lg glow-brand"
              whileHover={{ scale: 1.08, rotate: 5 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
            >
              <Brain className="w-5 h-5 text-white" />
            </motion.div>
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="text-base font-bold tracking-tight whitespace-nowrap overflow-hidden font-display"
                >
                  <span className="gradient-text font-display">RAGLense</span>
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        </div>

        {/* New Chat Button */}
        <div className="px-3 pt-4 pb-2">
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-2.5 rounded-xl transition-all duration-200 font-semibold text-sm btn-primary btn-shimmer",
              sidebarCollapsed
                ? "w-10 h-10 justify-center"
                : "px-4 py-2.5"
            )}
          >
            <Plus className="w-4 h-4 min-w-[16px]" />
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="font-display"
                >
                  New Chat
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 space-y-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <AnimatePresence>
                {!sidebarCollapsed && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 mb-2 px-3"
                  >
                    <div className="h-px flex-1 bg-gradient-to-r from-[var(--color-brand-500)]/30 to-transparent" />
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] font-display">
                      {group.title}
                    </p>
                    <div className="h-px flex-1 bg-gradient-to-l from-[var(--color-accent-500)]/30 to-transparent" />
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-xl transition-all duration-200 relative group",
                        sidebarCollapsed
                          ? "w-10 h-10 justify-center mx-auto"
                          : "px-3 py-2.5",
                        isActive
                          ? "text-[var(--color-brand-400)]"
                          : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-200)]/50"
                      )}
                    >
                      {/* Morphing sliding pill indicator */}
                      {isActive && (
                        <motion.div
                          layoutId="sidebar-active-bg"
                          className="absolute inset-y-1 inset-x-1.5 rounded-xl bg-gradient-to-r from-[var(--color-brand-500)]/12 to-[var(--color-accent-500)]/5 border border-[var(--color-brand-500)]/20 shadow-inner z-0"
                          transition={{
                            type: "spring",
                            stiffness: 380,
                            damping: 30,
                          }}
                          style={{
                            boxShadow: "0 0 12px rgba(124, 58, 237, 0.08), inset 0 1px 0 rgba(255,255,255,0.05)",
                          }}
                        />
                      )}

                      <motion.div
                        className="relative z-10"
                        whileHover={{ scale: 1.12, rotate: isActive ? 0 : 4 }}
                        transition={{ type: "spring", stiffness: 400, damping: 15 }}
                      >
                        <item.icon className={cn(
                          "w-[18px] h-[18px] min-w-[18px] transition-colors duration-200",
                          isActive 
                            ? "text-[var(--color-brand-400)] drop-shadow-[0_0_6px_rgba(124,58,237,0.4)]" 
                            : "group-hover:text-[var(--color-accent-400)]"
                        )} />
                      </motion.div>

                      <AnimatePresence>
                        {!sidebarCollapsed && (
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-sm font-semibold flex-1 whitespace-nowrap relative z-10 font-display"
                          >
                            {item.title}
                          </motion.span>
                        )}
                      </AnimatePresence>

                      {!sidebarCollapsed && item.badge && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/20 relative z-10 font-display">
                          {item.badge}
                        </span>
                      )}

                      {/* Tooltip for collapsed state */}
                      {sidebarCollapsed && (
                        <div className="absolute left-full ml-2 px-3 py-1.5 rounded-lg bg-[var(--color-surface-400)] text-xs text-[var(--color-text-primary)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl border border-[var(--color-border)] font-display">
                          {item.title}
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom Profile Section with gradient ring & breathe glow */}
        <div className="border-t border-[var(--color-border)] p-3 relative overflow-visible">
          <div className={cn(
            "flex items-center gap-3 rounded-xl p-2 bg-[var(--color-surface-100)]/40 border border-transparent hover:bg-[var(--color-surface-200)]/40 hover:border-[var(--color-border)] transition-all",
            sidebarCollapsed ? "justify-center" : "px-3"
          )}>
            {/* Avatar with breathing ring */}
            <div className="relative flex-shrink-0">
              <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-accent-400)] opacity-70 animate-breathe" 
                   style={{ boxShadow: "0 0 10px rgba(124, 58, 237, 0.3)" }} />
              <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--color-brand-600)] to-[var(--color-accent-500)] flex items-center justify-center text-white text-xs font-bold font-display shadow-md">
                {user?.full_name?.charAt(0)?.toUpperCase() || "U"}
              </div>
            </div>

            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex-1 min-w-0"
              >
                <p className="text-xs font-bold truncate font-display text-[var(--color-text-primary)]">
                  {user?.full_name || "Demo User"}
                </p>
                <p className="text-[10px] truncate font-mono text-[var(--color-text-muted)]">
                  {user?.email || "demo@raglense.com"}
                </p>
              </motion.div>
            )}
          </div>
        </div>

        {/* Bottom Actions: Settings + Collapse */}
        <div className="border-t border-[var(--color-border)] p-3 space-y-1">
          <Link
            href="/dashboard/settings"
            className={cn(
              "flex items-center gap-3 rounded-xl transition-all duration-200 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-200)]",
              sidebarCollapsed ? "w-10 h-10 justify-center mx-auto" : "px-3 py-2.5"
            )}
          >
            <motion.div whileHover={{ rotate: 90 }} transition={{ duration: 0.3 }}>
              <Settings className="w-[18px] h-[18px] min-w-[18px]" />
            </motion.div>
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-sm font-semibold font-display"
                >
                  Settings
                </motion.span>
              )}
            </AnimatePresence>
          </Link>

          <button
            onClick={toggleSidebar}
            className={cn(
              "flex items-center gap-3 rounded-xl transition-all duration-200 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-200)] w-full",
              sidebarCollapsed ? "w-10 h-10 justify-center mx-auto" : "px-3 py-2.5"
            )}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-[18px] h-[18px]" />
            ) : (
              <>
                <ChevronLeft className="w-[18px] h-[18px]" />
                <span className="text-sm font-semibold font-display">Collapse</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
