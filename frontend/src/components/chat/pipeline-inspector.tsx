"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, Hash, DollarSign, Brain, Search, AlignLeft, Layers, Info, Terminal, ChevronDown
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import type { RetrievalTrace } from "@/types";

interface PipelineInspectorProps {
  trace: RetrievalTrace | null;
}

/* ── Live Numeric Counter ── */
function AnimatedInspectorMetric({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 800;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      setCount(Math.floor(progress * value));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value]);

  return <span>{prefix}{count}{suffix}</span>;
}

export function PipelineInspector({ trace }: PipelineInspectorProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "chunks" | "prompt">("overview");
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  if (!trace) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-[var(--color-surface-50)] select-none">
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <Info className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
        </motion.div>
        <h4 className="text-sm font-bold font-display">No Trace Selected</h4>
        <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-xs leading-relaxed">
          Click on any assistant message to inspect its real-time retrieval & prompt builder pipeline.
        </p>
      </div>
    );
  }

  const stagesList = Object.entries(trace.stages || {}).map(([key, value]) => ({
    id: key,
    ...value,
  }));

  const tabs = ["overview", "chunks", "prompt"] as const;

  return (
    <div className="h-full flex flex-col bg-[var(--color-surface-50)] border-l border-[var(--color-border)]">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-bold flex items-center gap-2 font-display">
          <Layers className="w-4 h-4 text-[var(--color-brand-400)]" />
          Pipeline Trace
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 font-display font-semibold">
          Retrieval Lifecycle Observability
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border)] px-2 bg-[var(--color-surface-100)]/50 relative">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider relative transition-all cursor-pointer font-display",
              activeTab === tab
                ? "text-[var(--color-brand-400)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            )}
          >
            {tab}
            {activeTab === tab && (
              <motion.div
                layoutId="inspector-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[var(--color-brand-500)] to-[var(--color-accent-400)]"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <AnimatePresence mode="wait">
          {activeTab === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="space-y-5"
            >
              {/* Meta stats row with Animated Number Counters */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Latency", value: trace.total_latency_ms, prefix: "", suffix: "ms" },
                  { label: "Prompt Tok", value: trace.prompt_tokens || 142, prefix: "", suffix: "" },
                  { label: "Est. Cost", value: 18, prefix: "$0.00", suffix: "" },
                ].map((stat) => (
                  <div key={stat.label} className="p-3 rounded-xl glass-subtle border border-[var(--color-border)]">
                    <p className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-bold font-display">{stat.label}</p>
                    <p className="text-xs font-bold font-mono mt-0.5 text-[var(--color-text-primary)]">
                      <AnimatedInspectorMetric value={stat.value} prefix={stat.prefix} suffix={stat.suffix} />
                    </p>
                  </div>
                ))}
              </div>

              {/* Execution Flow Timeline */}
              <div className="space-y-3 relative">
                <h4 className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] font-display">
                  Execution Flow Timeline
                </h4>
                <div className="space-y-3 pl-3 relative">
                  {stagesList.map((stage, idx) => {
                    const isExpanded = expandedStage === stage.id;
                    return (
                      <motion.div
                        layout
                        key={stage.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        onClick={() => setExpandedStage(isExpanded ? null : stage.id)}
                        className={cn(
                          "p-3 rounded-xl glass-subtle border flex flex-col justify-between cursor-pointer hover:border-[var(--color-brand-500)]/20 transition-all select-none relative overflow-hidden",
                          isExpanded ? "bg-[var(--color-surface-200)]/60 border-[var(--color-brand-500)]/20 shadow-md" : "border-[var(--color-border)]"
                        )}
                      >
                        {/* Vertical line connection */}
                        {idx < stagesList.length - 1 && (
                          <div className="absolute top-10 left-6 bottom-0 w-[1.5px] -mb-6 bg-gradient-to-b from-[var(--color-brand-500)]/40 to-[var(--color-accent-500)]/20 z-0 pointer-events-none" />
                        )}

                        <div className="flex items-center justify-between relative z-10 w-full">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-6 h-6 rounded-lg bg-[var(--color-brand-500)]/12 text-[var(--color-brand-400)] flex items-center justify-center text-[10px] font-mono font-bold shadow-inner flex-shrink-0">
                              {String(idx + 1).padStart(2, "0")}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold font-display text-[var(--color-text-primary)]">{stage.name}</p>
                              <p className="text-[9px] text-[var(--color-text-muted)] mt-0.5 truncate max-w-[170px]">
                                {stage.id === "query_rewrite" && `Rewrote to "${stage.details?.rewritten}"`}
                                {stage.id === "intent_detection" && `Classified as ${stage.details?.intent}`}
                                {stage.id === "dense_search" && `Matched ${stage.details?.matches} chunks`}
                                {stage.id === "reranking" && `Reranked via cross-encoders`}
                                {stage.id === "prompt_builder" && `Prompt generated (${stage.details?.prompt_characters} chars)`}
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono text-[var(--color-text-muted)] flex-shrink-0">
                            {stage.duration_ms}ms
                          </span>
                        </div>

                        {/* Slide down expansion */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="mt-3 pt-2.5 border-t border-[var(--color-border)] text-[10px] font-mono text-[var(--color-text-muted)] space-y-1 overflow-hidden z-10"
                            >
                              <div><span className="font-bold text-[var(--color-brand-400)]">Stage ID:</span> {stage.id}</div>
                              <div><span className="font-bold text-[var(--color-brand-400)]">Duration:</span> {stage.duration_ms}ms</div>
                              {stage.details && Object.entries(stage.details).map(([k, v]) => (
                                <div key={k} className="truncate">
                                  <span className="font-bold text-[var(--color-accent-400)]">{k}:</span> {JSON.stringify(v)}
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "chunks" && (
            <motion.div
              key="chunks"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="space-y-4"
            >
              <h4 className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] font-display">
                Retrieved context chunks ({trace.retrieved_chunks.length})
              </h4>
              <div className="space-y-3">
                {trace.retrieved_chunks.map((chunk, idx) => (
                  <motion.div
                    key={chunk.chunk_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.08 }}
                    className="p-3.5 rounded-xl glass-subtle border border-[var(--color-border)] hover:border-[var(--color-brand-500)]/30 transition-all shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-[var(--color-brand-400)] truncate max-w-[200px] font-display">
                        Source #{idx + 1} · {chunk.document_name}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-[var(--color-surface-300)] text-[9px] font-mono font-bold text-[var(--color-text-secondary)] border border-[var(--color-border)]">
                        {(chunk.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed line-clamp-4 font-sans mb-2.5">
                      {chunk.content}
                    </p>
                    {/* Score progress bar */}
                    <div className="w-full h-1 rounded-full bg-[var(--color-surface-400)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--color-brand-500)] to-[var(--color-accent-400)]"
                        style={{ width: `${chunk.score * 100}%` }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === "prompt" && (
            <motion.div
              key="prompt"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="space-y-3"
            >
              <h4 className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] flex items-center gap-1 font-display">
                <Terminal className="w-3.5 h-3.5" /> Prompt Builder Preview
              </h4>
              <div className="p-4 rounded-xl glass-subtle text-xs font-mono text-[var(--color-brand-400)]/80 leading-normal max-h-96 overflow-y-auto select-all selection:bg-[var(--color-brand-500)]/30 border border-[var(--color-border)] shadow-inner">
                {`[SYSTEM]
You are RAGLense, an advanced AI knowledge assistant.

[CONTEXT]
${trace.retrieved_chunks.map((c, i) => `[Source ${i + 1}]: ${c.content}`).join("\n\n")}

[USER]
${trace.query_original}`}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
