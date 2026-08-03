"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info, Layers, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RetrievalTrace } from "@/types";

interface PipelineInspectorProps {
  trace: RetrievalTrace | null;
}

function AnimatedInspectorMetric({
  value,
  suffix = "",
}: {
  value: number;
  suffix?: string;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 700;

    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      setCount(Math.floor(progress * value));
      if (progress < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  }, [value]);

  return (
    <span>
      {count}
      {suffix}
    </span>
  );
}

export function PipelineInspector({ trace }: PipelineInspectorProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "sources" | "query">("overview");
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  if (!trace) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--color-surface-50)] p-6 text-center select-none">
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <Info className="mb-3 h-10 w-10 text-[var(--color-text-muted)]" />
        </motion.div>
        <h4 className="font-display text-sm font-bold">No answer selected</h4>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-[var(--color-text-muted)]">
          Ask a question to see which documents were used to generate the answer.
        </p>
      </div>
    );
  }

  const stages = Object.entries(trace.stages || {}).map(([id, value]) => ({
    id,
    ...value,
  }));

  const stageLabels: Record<string, string> = {
    embed_query: "Understanding your question",
    retrieve: "Searching documents",
    rerank: "Finding best matches",
    generate: "Generating answer",
    query_rewrite: "Rephrasing question",
  };

  return (
    <div className="flex h-full flex-col border-l border-[var(--color-border)] bg-[var(--color-surface-50)]">
      <div className="border-b border-[var(--color-border)] px-5 py-4">
        <h3 className="font-display text-sm font-bold flex items-center gap-2">
          <Layers className="h-4 w-4 text-[var(--color-brand-500)]" />
          How this answer was made
        </h3>
        <p className="mt-0.5 text-[10px] font-semibold text-[var(--color-text-muted)]">
          See which files and steps were used
        </p>
      </div>

      <div className="flex border-b border-[var(--color-border)] bg-[var(--color-surface-100)]/50 px-2">
        {(["overview", "sources", "query"] as const).map((tab) => {
          const labels = { overview: "Overview", sources: "Sources", query: "Your Question" };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "relative px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-all",
                activeTab === tab
                  ? "text-[var(--color-brand-600)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              )}
            >
              {labels[tab]}
              {activeTab === tab ? (
                <motion.div
                  layoutId="inspector-tab"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-[var(--color-brand-500)] to-[var(--color-accent-400)]"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <AnimatePresence mode="wait">
          {activeTab === "overview" ? (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="space-y-5"
            >
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Response time", value: trace.total_latency_ms, suffix: "ms" },
                  { label: "Sources used", value: trace.retrieved_chunks.length },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-3"
                  >
                    <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                      {metric.label}
                    </p>
                    <p className="mt-0.5 text-xs font-bold text-[var(--color-text-primary)]">
                      <AnimatedInspectorMetric value={metric.value} suffix={metric.suffix} />
                    </p>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h4 className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
                  Steps taken
                </h4>
                <div className="space-y-3">
                  {stages.map((stage, index) => {
                    const expanded = expandedStage === stage.id;
                    const label = stageLabels[stage.id] || stage.name || stage.id.replace(/_/g, " ");
                    return (
                      <motion.button
                        key={stage.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.04 }}
                        onClick={() => setExpandedStage(expanded ? null : stage.id)}
                        className={cn(
                          "w-full rounded-xl border p-3 text-left transition-all",
                          expanded
                            ? "border-[var(--color-brand-500)]/30 bg-[var(--color-surface-0)]"
                            : "border-[var(--color-border)] bg-[var(--color-surface-0)]/70 hover:border-[var(--color-brand-500)]/20"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                              {label}
                            </p>
                            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                              {stage.duration_ms}ms
                            </p>
                          </div>
                          <span className="rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-1 text-[10px] font-semibold">
                            Done
                          </span>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ) : null}

          {activeTab === "sources" ? (
            <motion.div
              key="sources"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="space-y-3"
            >
              <h4 className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
                Documents used in this answer
              </h4>
              {trace.retrieved_chunks.map((chunk, index) => (
                <div
                  key={chunk.chunk_id}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-3.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 flex-shrink-0 text-[var(--color-brand-500)]" />
                      <p className="truncate text-xs font-semibold text-[var(--color-text-primary)]">
                        {index + 1}. {chunk.document_name}
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 rounded-full px-2 py-0.5 flex-shrink-0">
                      {(chunk.score * 100).toFixed(0)}% match
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-[var(--color-text-secondary)]">
                    {chunk.content}
                  </p>
                </div>
              ))}
            </motion.div>
          ) : null}

          {activeTab === "query" ? (
            <motion.div
              key="query"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="space-y-3"
            >
              <h4 className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
                Question used
              </h4>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-4">
                <p className="text-xs font-semibold text-[var(--color-text-muted)] mb-2">Your question</p>
                <p className="text-sm text-[var(--color-text-primary)] leading-6 whitespace-pre-wrap">
                  {trace.query_original}
                </p>
                {trace.query_rewritten && trace.query_rewritten !== trace.query_original && (
                  <>
                    <p className="text-xs font-semibold text-[var(--color-text-muted)] mt-4 mb-2">Rephrased for better search</p>
                    <p className="text-sm text-[var(--color-text-secondary)] leading-6 whitespace-pre-wrap">
                      {trace.query_rewritten}
                    </p>
                  </>
                )}
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-4">
                <p className="text-xs font-semibold text-[var(--color-text-muted)] mb-2">Context provided to AI ({trace.retrieved_chunks.length} snippets)</p>
                <div className="space-y-3">
                  {trace.retrieved_chunks.map((chunk, index) => (
                    <p key={chunk.chunk_id} className="text-xs text-[var(--color-text-secondary)] leading-6">
                      <span className="font-semibold text-[var(--color-text-primary)]">[{index + 1}] {chunk.document_name}</span>
                      <br />
                      {chunk.content}
                    </p>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
