"use client";

import { motion } from "framer-motion";
import {
  Database,
  FileText,
  Layers,
  MessageSquare,
  Clock,
  TrendingUp,
  TrendingDown,
  DollarSign,
  CheckCircle,
  HardDrive,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCard {
  label: string;
  value: string;
  change: string;
  changeType: "up" | "down" | "neutral";
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
}

const STATS: StatCard[] = [
  { label: "Knowledge Bases", value: "6", change: "+2 this week", changeType: "up", icon: Database, color: "#8b5cf6" },
  { label: "Documents", value: "406", change: "+28 today", changeType: "up", icon: FileText, color: "#a78bfa" },
  { label: "Total Chunks", value: "30,088", change: "+4.2k this week", changeType: "up", icon: Layers, color: "#2dd4bf" },
  { label: "Conversations", value: "1,247", change: "+89 today", changeType: "up", icon: MessageSquare, color: "#34d399" },
  { label: "Avg Latency", value: "1.2s", change: "-18% vs last week", changeType: "up", icon: Clock, color: "#fbbf24" },
  { label: "Total Cost", value: "$34.82", change: "$12.40 today", changeType: "neutral", icon: DollarSign, color: "#f87171" },
  { label: "Success Rate", value: "97.4%", change: "+0.8%", changeType: "up", icon: CheckCircle, color: "#34d399" },
  { label: "Storage Used", value: "2.6 GB", change: "of 10 GB", changeType: "neutral", icon: HardDrive, color: "#c084fc" },
];

const HOURLY_DATA = Array.from({ length: 24 }, (_, i) => ({
  hour: i,
  queries: Math.floor(Math.random() * 80 + 10),
  latency: Math.floor(Math.random() * 500 + 800),
}));

const RECENT_QUERIES = [
  { query: "What are the SOLID principles?", status: "success", latency: 1243, tokens: 847, model: "GPT-4o" },
  { query: "Explain microservices architecture", status: "success", latency: 987, tokens: 1232, model: "GPT-4o" },
  { query: "Compare REST vs GraphQL", status: "success", latency: 1567, tokens: 956, model: "Claude 3.5" },
  { query: "Kubernetes deployment strategies", status: "error", latency: 3200, tokens: 0, model: "GPT-4o" },
  { query: "Machine learning pipeline best practices", status: "success", latency: 1890, tokens: 1456, model: "Gemini Pro" },
];

const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.4, ease: [0.19, 1, 0.22, 1] },
  }),
};

export default function AnalyticsPage() {
  const maxQueries = Math.max(...HOURLY_DATA.map((d) => d.queries));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-display">Analytics</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Real-time platform metrics and performance insights
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--color-surface-100)] p-1 rounded-xl border border-[var(--color-border)]">
          {["24h", "7d", "30d", "All"].map((period) => (
            <button
              key={period}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                period === "24h"
                  ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/20"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-200)] border border-transparent"
              )}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        initial="hidden"
        animate="visible"
      >
        {STATS.map((stat, i) => (
          <motion.div
            key={stat.label}
            custom={i}
            variants={fadeIn}
            whileHover={{ y: -2 }}
            className="glass-card rounded-xl p-4 hover:scale-[1.01] transition-all duration-200"
          >
            <div className="flex items-center justify-between mb-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: `${stat.color}12` }}
              >
                <stat.icon className="w-4.5 h-4.5" style={{ color: stat.color }} />
              </div>
              {stat.changeType === "up" && (
                <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold font-mono">
                  <TrendingUp className="w-3.5 h-3.5" />
                  {stat.change.split(" ")[0]}
                </div>
              )}
              {stat.changeType === "down" && (
                <div className="flex items-center gap-1 text-[11px] text-red-400 font-semibold font-mono">
                  <TrendingDown className="w-3.5 h-3.5" />
                  {stat.change.split(" ")[0]}
                </div>
              )}
            </div>
            <p className="text-2xl font-bold tracking-tight font-display">{stat.value}</p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-[11px] text-[var(--color-text-muted)]">{stat.label}</p>
              <p className="text-[10px] text-[var(--color-text-secondary)] font-medium font-mono">{stat.change.includes(" ") ? stat.change.substring(stat.change.indexOf(" ") + 1) : stat.change}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Query Volume Chart */}
        <div className="lg:col-span-2 glass-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold font-display">Query Volume</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Queries per hour (last 24h)</p>
            </div>
            <div className="flex items-center gap-1 text-xs text-emerald-400 font-semibold">
              <ArrowUpRight className="w-3.5 h-3.5" />
              +12% vs yesterday
            </div>
          </div>

          {/* Sparkline bar chart */}
          <div className="flex items-end gap-1.5 h-32 pt-2">
            {HOURLY_DATA.map((d, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-lg transition-all duration-200 hover:opacity-100 cursor-pointer group relative"
                style={{
                  height: `${(d.queries / maxQueries) * 100}%`,
                  background: `linear-gradient(to top, var(--color-brand-600), var(--color-brand-400))`,
                  opacity: 0.65 + (d.queries / maxQueries) * 0.35,
                }}
              >
                {/* Tooltip */}
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-lg bg-[var(--color-surface-400)] text-[10px] text-[var(--color-text-primary)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 border border-[var(--color-border)] shadow-xl">
                  <strong>{d.queries}</strong> queries
                </div>
              </div>
            ))}
          </div>

          {/* Hour labels */}
          <div className="flex justify-between mt-2.5 text-[10px] text-[var(--color-text-muted)] font-mono">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>
        </div>

        {/* Performance Gauge */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4 font-display">System Health</h3>
          <div className="space-y-4">
            {[
              { label: "API Uptime", value: 99.9, color: "#34d399" },
              { label: "Vector DB", value: 95.2, color: "#2dd4bf" },
              { label: "LLM Availability", value: 98.7, color: "#8b5cf6" },
              { label: "Cache Hit Rate", value: 78.4, color: "#fbbf24" },
              { label: "Index Health", value: 100, color: "#34d399" },
            ].map((metric) => (
              <div key={metric.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[var(--color-text-secondary)]">{metric.label}</span>
                  <span className="font-mono font-bold" style={{ color: metric.color }}>
                    {metric.value}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-400)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{
                      width: `${metric.value}%`,
                      background: metric.color,
                      boxShadow: `0 0 6px ${metric.color}40`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Vector Space Projection */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold font-display">Vector Space Projection</h3>
            <p className="text-xs text-[var(--color-text-muted)]">UMAP 2D projection of chunk embeddings cluster maps</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#8b5cf6]" /> System Design</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#2dd4bf]" /> ML Research</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#a78bfa]" /> Wiki Docs</span>
          </div>
        </div>

        {/* Scatter container */}
        <div className="relative h-64 bg-[var(--color-surface-200)]/40 border border-[var(--color-border)] rounded-xl overflow-hidden bg-dot-grid flex items-center justify-center">
          {/* Scatter dots */}
          {Array.from({ length: 30 }).map((_, idx) => {
            const seedX = Math.sin(idx * 45) * 38 + 50;
            const seedY = Math.cos(idx * 30) * 38 + 50;
            const color = idx % 3 === 0 ? "#8b5cf6" : idx % 3 === 1 ? "#2dd4bf" : "#a78bfa";
            return (
              <div
                key={idx}
                className="absolute w-2.5 h-2.5 rounded-full hover:scale-150 transition-all duration-150 cursor-pointer group"
                style={{
                  left: `${seedX}%`,
                  top: `${seedY}%`,
                  backgroundColor: color,
                  boxShadow: `0 0 8px ${color}A0`,
                }}
              >
                {/* Tooltip */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 p-2.5 rounded-lg bg-[var(--color-surface-400)] text-[10px] text-[var(--color-text-primary)] w-44 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 border border-[var(--color-border)] shadow-xl">
                  <p className="font-semibold text-[var(--color-brand-400)] mb-1 font-mono">Chunk #{idx + 100}</p>
                  <p className="line-clamp-2 text-[var(--color-text-secondary)] leading-relaxed">This chunk contains parsed text from document node index representing vector space projection mappings.</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Queries Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-100)]/50">
          <h3 className="text-sm font-semibold font-display">Recent Queries</h3>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {RECENT_QUERIES.map((q, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--color-surface-200)]/40 transition-colors cursor-pointer group"
            >
              <div className={cn("w-1.5 h-1.5 rounded-full", q.status === "success" ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]" : "bg-red-400")} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--color-text-primary)] group-hover:text-[var(--color-brand-400)] transition-colors truncate">{q.query}</p>
              </div>
              <span className="text-xs text-[var(--color-text-muted)] font-mono font-medium">{q.model}</span>
              <span className="text-xs text-[var(--color-text-muted)] font-mono w-16 text-right">{q.latency}ms</span>
              <span className="text-xs text-[var(--color-text-muted)] font-mono w-14 text-right">{q.tokens} tok</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
