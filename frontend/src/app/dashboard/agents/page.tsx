"use client";

import { motion } from "framer-motion";
import { Layers, Brain, Search, FileSearch, BookOpen, Quote, AlertTriangle, Code, Database, Globe, Zap, Clock, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const AGENTS = [
  { id: "coordinator", name: "Coordinator", icon: Brain, color: "#8b5cf6", status: "active", description: "Routes queries to appropriate specialist agents", tasks: 247, latency: "120ms" },
  { id: "retriever", name: "Retriever", icon: Search, color: "#2dd4bf", status: "active", description: "Specialized in finding relevant document chunks", tasks: 892, latency: "340ms" },
  { id: "research", name: "Research", icon: FileSearch, color: "#a78bfa", status: "idle", description: "Multi-step research across multiple knowledge bases", tasks: 156, latency: "2.1s" },
  { id: "summarizer", name: "Summarizer", icon: BookOpen, color: "#34d399", status: "active", description: "Generates concise summaries of retrieved information", tasks: 423, latency: "890ms" },
  { id: "citation", name: "Citation", icon: Quote, color: "#fbbf24", status: "idle", description: "Verifies and formats source citations", tasks: 312, latency: "450ms" },
  { id: "critic", name: "Critic", icon: AlertTriangle, color: "#f87171", status: "idle", description: "Detects hallucinations and verifies factual accuracy", tasks: 187, latency: "670ms" },
  { id: "code", name: "Code", icon: Code, color: "#c084fc", status: "idle", description: "Generates, explains, and debugs code snippets", tasks: 89, latency: "1.2s" },
  { id: "sql", name: "SQL", icon: Database, color: "#14b8a6", status: "idle", description: "Generates SQL queries from natural language", tasks: 45, latency: "560ms" },
  { id: "web", name: "Web", icon: Globe, color: "#f472b6", status: "disabled", description: "Searches the web for supplementary information", tasks: 0, latency: "—" },
];

const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.45, ease: [0.19, 1, 0.22, 1] },
  }),
};

export default function AgentsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold font-display">Multi-Agent System</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Specialized AI agents that collaborate to answer complex queries
        </p>
      </div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
        initial="hidden"
        animate="visible"
      >
        {AGENTS.map((agent, i) => (
          <motion.div
            key={agent.id}
            custom={i}
            variants={fadeIn}
            whileHover={{ y: -3 }}
            className="glass-card-hover rounded-xl p-5 cursor-pointer group relative overflow-hidden"
          >
            {/* Subtle card status background glow */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
              style={{ background: `radial-gradient(circle at 50% 0%, ${agent.color}08 0%, transparent 65%)` }}
            />

            <div className="flex items-start justify-between mb-4 relative z-10">
              <div className="flex items-center gap-3">
                <motion.div
                  whileHover={{ scale: 1.08, rotate: 3 }}
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: `${agent.color}12` }}
                >
                  <agent.icon className="w-5.5 h-5.5" style={{ color: agent.color }} />
                </motion.div>
                <div>
                  <h3 className="font-semibold text-[var(--color-text-primary)] font-display group-hover:text-[var(--color-brand-400)] transition-colors">
                    {agent.name} Agent
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className={cn("w-1.5 h-1.5 rounded-full relative",
                      agent.status === "active" && "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]",
                      agent.status === "idle" && "bg-[var(--color-text-muted)]",
                      agent.status === "disabled" && "bg-red-400"
                    )}>
                      {agent.status === "active" && (
                        <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--color-text-muted)] font-medium capitalize">{agent.status}</span>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-sm text-[var(--color-text-secondary)] mb-4 leading-relaxed relative z-10 min-h-[40px]">
              {agent.description}
            </p>

            <div className="flex items-center gap-4 text-[11px] text-[var(--color-text-muted)] relative z-10 pt-3 border-t border-[var(--color-border)]">
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                <strong>{agent.tasks}</strong> tasks
              </span>
              <span className="flex items-center gap-1 font-mono">
                <Clock className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                {agent.latency}
              </span>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
