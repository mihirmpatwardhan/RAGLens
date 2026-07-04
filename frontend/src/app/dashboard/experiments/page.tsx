"use client";

import { FlaskConical, Plus, Play, Pause, CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const EXPERIMENTS = [
  { id: "1", name: "Chunking Strategy Comparison", description: "Recursive vs Semantic vs Sentence chunking on legal docs", status: "completed", metrics: { best: "Semantic", score: 94.2 }, created: "2h ago" },
  { id: "2", name: "Embedding Model Benchmark", description: "OpenAI vs BGE-M3 vs E5-Large on technical docs", status: "running", metrics: { progress: 67 }, created: "30m ago" },
  { id: "3", name: "Reranker Impact Analysis", description: "With vs without cross-encoder reranking", status: "completed", metrics: { best: "With Reranker", score: 89.7 }, created: "1d ago" },
  { id: "4", name: "Temperature Sweep", description: "Temperature 0.0 to 1.0 on factual Q&A", status: "pending", metrics: {}, created: "5m ago" },
];

export default function ExperimentsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-display">Experiments</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Run A/B tests and parameter sweeps to optimize your RAG pipeline</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-primary btn-shimmer text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> New Experiment
        </motion.button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {EXPERIMENTS.map((exp, i) => (
          <motion.div
            key={exp.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
            className="glass-card rounded-xl p-5 hover:scale-[1.005] transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-4">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                exp.status === "completed" && "bg-emerald-500/12",
                exp.status === "running" && "bg-[var(--color-brand-500)]/12",
                exp.status === "pending" && "bg-[var(--color-surface-300)]"
              )}>
                {exp.status === "completed" && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                {exp.status === "running" && (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  >
                    <Play className="w-5 h-5 text-[var(--color-brand-400)]" />
                  </motion.div>
                )}
                {exp.status === "pending" && <Clock className="w-5 h-5 text-[var(--color-text-muted)]" />}
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-brand-400)] transition-colors font-display">
                  {exp.name}
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)]">{exp.description}</p>
              </div>

              {"score" in exp.metrics && (
                <div className="text-right">
                  <p className="text-lg font-bold text-emerald-400 font-display">{exp.metrics.score}%</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">Best: {exp.metrics.best}</p>
                </div>
              )}

              {"progress" in exp.metrics && (
                <div className="w-24">
                  <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-400)] overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--color-brand-600)] to-[var(--color-brand-400)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${exp.metrics.progress}%` }}
                      transition={{ duration: 1 }}
                      style={{ boxShadow: "0 0 8px rgba(124, 58, 237, 0.3)" }}
                    />
                  </div>
                  <p className="text-[10px] text-[var(--color-text-muted)] text-right mt-1 font-mono">{exp.metrics.progress}%</p>
                </div>
              )}
              
              <span className="text-xs text-[var(--color-text-muted)] font-mono">{exp.created}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
