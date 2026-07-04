"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Database,
  FileText,
  GitBranch,
  Beaker,
  BarChart3,
  Settings,
  Search,
  Plus,
  Sparkles,
  Target,
  Layers,
} from "lucide-react";
import { useThemeStore } from "@/stores/theme-store";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  group: string;
}

export function CommandPalette() {
  const router = useRouter();
  const { commandPaletteOpen, setCommandPaletteOpen } = useThemeStore();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const allCommands: CommandItem[] = [
    // Navigation
    { id: "chat", title: "Go to Chat", icon: MessageSquare, action: () => router.push("/dashboard"), group: "Navigation" },
    { id: "knowledge", title: "Go to Knowledge Bases", icon: Database, action: () => router.push("/dashboard/knowledge"), group: "Navigation" },
    { id: "documents", title: "Go to Documents", icon: FileText, action: () => router.push("/dashboard/documents"), group: "Navigation" },
    { id: "pipelines", title: "Go to Pipelines", icon: GitBranch, action: () => router.push("/dashboard/pipelines"), group: "Navigation" },
    { id: "playground", title: "Go to Model Arena", icon: Beaker, action: () => router.push("/dashboard/playground"), group: "Navigation" },
    { id: "prompts", title: "Go to Prompt Lab", icon: Sparkles, action: () => router.push("/dashboard/prompts"), group: "Navigation" },
    { id: "agents", title: "Go to Agents", icon: Layers, action: () => router.push("/dashboard/agents"), group: "Navigation" },
    { id: "analytics", title: "Go to Analytics", icon: BarChart3, action: () => router.push("/dashboard/analytics"), group: "Navigation" },
    { id: "eval", title: "Go to Evaluation", icon: Target, action: () => router.push("/dashboard/evaluation"), group: "Navigation" },
    { id: "settings", title: "Go to Settings", icon: Settings, action: () => router.push("/dashboard/settings"), group: "Navigation" },
    // Actions
    { id: "new-chat", title: "New Chat", subtitle: "Start a new conversation", icon: Plus, action: () => router.push("/dashboard"), group: "Actions" },
    { id: "new-kb", title: "New Knowledge Base", subtitle: "Create a knowledge base", icon: Plus, action: () => router.push("/dashboard/knowledge"), group: "Actions" },
    { id: "upload", title: "Upload Document", subtitle: "Upload a file to process", icon: FileText, action: () => router.push("/dashboard/documents"), group: "Actions" },
  ];

  const filteredCommands = query
    ? allCommands.filter(
        (cmd) =>
          cmd.title.toLowerCase().includes(query.toLowerCase()) ||
          cmd.subtitle?.toLowerCase().includes(query.toLowerCase())
      )
    : allCommands;

  const groups = [...new Set(filteredCommands.map((c) => c.group))];

  const executeCommand = useCallback(
    (item: CommandItem) => {
      item.action();
      setCommandPaletteOpen(false);
      setQuery("");
      setSelectedIndex(0);
    },
    [setCommandPaletteOpen]
  );

  useEffect(() => {
    if (!commandPaletteOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setCommandPaletteOpen(false);
        setQuery("");
        setSelectedIndex(0);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && filteredCommands[selectedIndex]) {
        e.preventDefault();
        executeCommand(filteredCommands[selectedIndex]);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commandPaletteOpen, filteredCommands, selectedIndex, setCommandPaletteOpen, executeCommand]);

  if (!commandPaletteOpen) return null;

  let flatIndex = -1;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-start justify-center">
        {/* Backdrop with animated blur & subtle aurora gradients */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/70 backdrop-blur-md overflow-hidden"
          onClick={() => {
            setCommandPaletteOpen(false);
            setQuery("");
          }}
        >
          <div className="absolute -top-24 -left-24 w-[350px] h-[350px] rounded-full bg-[var(--color-brand-500)]/8 filter blur-[80px] animate-float-slow" />
          <div className="absolute -bottom-24 -right-24 w-[300px] h-[300px] rounded-full bg-[var(--color-accent-500)]/8 filter blur-[80px] animate-float" />
        </motion.div>

        {/* Dialog with 3D scale-in and depth */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92, rotateX: -6, z: -40 }}
          animate={{ opacity: 1, scale: 1, rotateX: 0, z: 0 }}
          exit={{ opacity: 0, scale: 0.95, rotateX: -4, z: -20 }}
          transition={{ duration: 0.28, ease: [0.19, 1, 0.22, 1] }}
          style={{ transformStyle: "preserve-3d", perspective: 1000 }}
          className="relative max-w-xl w-full mx-auto mt-[15vh] px-4"
        >
          <div className="glass-card bg-noise rounded-2xl overflow-hidden shadow-2xl border border-[var(--color-border)] relative">
            {/* Animated gradient border */}
            <div className="absolute inset-0 rounded-2xl gradient-border-animated opacity-55 pointer-events-none" />

            {/* Search Input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-border)] relative z-10">
              <Search className="w-5 h-5 text-[var(--color-brand-400)]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Type a command or search..."
                className="flex-1 bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none text-sm font-sans"
              />
              <kbd className="px-2 py-0.5 rounded-md bg-[var(--color-surface-300)] text-[10px] font-semibold text-[var(--color-text-muted)] border border-[var(--color-border)] font-mono">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto py-2 relative z-10">
              {filteredCommands.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-[var(--color-text-muted)] font-display">
                  No results found for &quot;{query}&quot;
                </div>
              ) : (
                groups.map((group) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key={group}
                  >
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] px-5 py-2 font-display">
                      {group}
                    </p>
                    {filteredCommands
                      .filter((c) => c.group === group)
                      .map((item) => {
                        flatIndex++;
                        const currentIndex = flatIndex;
                        const isSelected = currentIndex === selectedIndex;
                        return (
                          <motion.button
                            key={item.id}
                            onClick={() => executeCommand(item)}
                            className={cn(
                              "flex items-center gap-3 w-full px-5 py-2.5 text-left transition-all duration-150 relative cursor-pointer",
                              isSelected
                                ? "text-[var(--color-brand-400)]"
                                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-200)]/40"
                            )}
                          >
                            {/* Animated highlight slider */}
                            {isSelected && (
                              <motion.div
                                layoutId="cmd-highlight"
                                className="absolute inset-y-1 inset-x-2.5 rounded-xl bg-gradient-to-r from-[var(--color-brand-500)]/15 to-[var(--color-accent-500)]/5 border border-[var(--color-brand-500)]/20 shadow-inner z-0"
                                transition={{ type: "spring", stiffness: 450, damping: 32 }}
                              />
                            )}
                            <item.icon className="w-4 h-4 min-w-[16px] relative z-10" />
                            <div className="flex-1 min-w-0 relative z-10">
                              <p className="text-xs font-semibold font-display truncate">
                                {item.title}
                              </p>
                              {item.subtitle && (
                                <p className="text-[10px] text-[var(--color-text-muted)] truncate mt-0.5">
                                  {item.subtitle}
                                </p>
                              )}
                            </div>
                          </motion.button>
                        );
                      })}
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
