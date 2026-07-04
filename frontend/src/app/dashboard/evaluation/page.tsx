"use client";

import { motion } from "framer-motion";
import { Target, TrendingUp, BarChart3, Play, History } from "lucide-react";
import { cn } from "@/lib/utils";

const METRICS = [
  { name: "Faithfulness", score: 0.92, trend: "+0.03", color: "#22c55e", description: "How factually consistent is the answer with the context" },
  { name: "Groundedness", score: 0.89, trend: "+0.05", color: "#06b6d4", description: "How well is the answer grounded in retrieved sources" },
  { name: "Context Precision", score: 0.94, trend: "+0.01", color: "#6366f1", description: "Ratio of relevant chunks in retrieved context" },
  { name: "Context Recall", score: 0.87, trend: "-0.02", color: "#f59e0b", description: "How many relevant chunks were retrieved" },
  { name: "Answer Relevancy", score: 0.91, trend: "+0.04", color: "#8b5cf6", description: "How relevant is the answer to the user query" },
  { name: "Latency P95", score: 0.78, trend: "+0.08", color: "#ef4444", description: "95th percentile response time" },
];

export default function EvaluationPage() {
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">RAG Evaluation</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Measure retrieval and generation quality with RAGAS & DeepEval metrics
          </p>
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[var(--color-brand-600)] to-[var(--color-brand-500)] text-white text-sm font-medium glow-brand">
          <Play className="w-4 h-4" /> Run Evaluation
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {METRICS.map((metric, i) => (
          <motion.div key={metric.name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="glass-card rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{metric.name}</h3>
              <span className={cn("text-xs font-mono", metric.trend.startsWith("+") ? "text-emerald-400" : "text-red-400")}>
                {metric.trend}
              </span>
            </div>

            {/* Score Gauge */}
            <div className="relative mb-3">
              <div className="w-full h-3 rounded-full bg-[var(--color-surface-400)] overflow-hidden">
                <motion.div className="h-full rounded-full" style={{ background: metric.color, boxShadow: `0 0 8px ${metric.color}40` }}
                  initial={{ width: 0 }} animate={{ width: `${metric.score * 100}%` }} transition={{ duration: 1, delay: i * 0.1 }} />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-2xl font-bold" style={{ color: metric.color }}>{(metric.score * 100).toFixed(0)}%</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">Target: 90%</span>
              </div>
            </div>

            <p className="text-xs text-[var(--color-text-muted)]">{metric.description}</p>
          </motion.div>
        ))}
      </div>

      {/* Evaluation History */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold">Evaluation History</h3>
          <button className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"><History className="w-3.5 h-3.5" /> View All</button>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {[
            { id: "eval-5", date: "Today, 2:30 PM", queries: 50, avg_score: 0.91, status: "completed" },
            { id: "eval-4", date: "Yesterday, 4:15 PM", queries: 50, avg_score: 0.88, status: "completed" },
            { id: "eval-3", date: "Jul 1, 10:00 AM", queries: 100, avg_score: 0.85, status: "completed" },
          ].map((run) => (
            <div key={run.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[var(--color-surface-200)] transition-colors cursor-pointer">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-sm flex-1">{run.date}</span>
              <span className="text-xs text-[var(--color-text-muted)]">{run.queries} queries</span>
              <span className="text-xs font-mono text-emerald-400">{(run.avg_score * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
