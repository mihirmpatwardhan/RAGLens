"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Hash, Globe, Tag, Compass,
  ChevronRight, Copy, Terminal, AlignLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Chunk } from "@/types";

interface ChunkInspectorProps {
  chunk: Chunk | null;
  onClose?: () => void;
}

/* ── Matrix-rain style vector generator ── */
function MatrixVectorDisplay() {
  const [displayVals, setDisplayVals] = useState<number[]>(() => 
    Array.from({ length: 24 }, () => parseFloat((Math.random() * 2 - 1).toFixed(6)))
  );

  useEffect(() => {

    const interval = setInterval(() => {
      setDisplayVals(prev => 
        prev.map((val) => {
          if (Math.random() > 0.75) {
            return parseFloat((Math.random() * 2 - 1).toFixed(6));
          }
          return val;
        })
      );
    }, 150);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative p-4 rounded-xl bg-black/40 border border-[var(--color-brand-500)]/30 text-[10px] font-mono text-emerald-400 overflow-hidden leading-normal max-h-52 overflow-y-auto shadow-inner select-all selection:bg-emerald-500/20">
      {/* Matrix rain glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/5 to-transparent pointer-events-none animate-pulse" />
      <div className="relative z-10">
        {"["}
        <div className="grid grid-cols-3 gap-x-2 gap-y-1 my-1 px-2 font-mono">
          {displayVals.map((val, idx) => (
            <motion.span
              key={idx}
              animate={{ opacity: [0.5, 1, 0.8] }}
              transition={{ duration: 0.6 }}
              className="text-emerald-400 font-mono tracking-tighter"
            >
              {val > 0 ? `+${val.toFixed(6)}` : val.toFixed(6)}
            </motion.span>
          ))}
          <span className="text-emerald-600 font-bold col-span-full mt-2 font-mono tracking-normal">
            ... showing live parameters of 1536
          </span>
        </div>
        {"]"}
      </div>
    </div>
  );
}

export function ChunkInspector({ chunk, onClose }: ChunkInspectorProps) {
  const [activeTab, setActiveTab] = useState<"content" | "metadata" | "vectors">("content");

  if (!chunk) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-[var(--color-surface-50)] select-none">
        <motion.div
          animate={{ y: [0, -8, 0], rotate: [0, 5, -5, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        >
          <Compass className="w-10 h-10 text-[var(--color-text-muted)] mb-3" />
        </motion.div>
        <h4 className="text-sm font-bold font-display">No Chunk Selected</h4>
        <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-xs leading-relaxed">
          Select any text chunk from the pipeline or document explorer to inspect its properties.
        </p>
      </div>
    );
  }

  const tabs = ["content", "metadata", "vectors"] as const;

  return (
    <div className="h-full flex flex-col bg-[var(--color-surface-50)] border-l border-[var(--color-border)]">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2 font-display">
            <Hash className="w-4 h-4 text-[var(--color-brand-400)]" />
            Chunk #{chunk.chunk_index}
          </h3>
          <p className="text-[10px] text-[var(--color-text-muted)] font-mono mt-0.5 truncate max-w-[200px]">
            ID: {chunk.id}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-surface-200)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
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
                layoutId="chunk-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[var(--color-brand-500)] to-[var(--color-accent-400)]"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <AnimatePresence mode="wait">
          {activeTab === "content" && (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="space-y-4"
            >
              {/* Main text content */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] flex items-center gap-1 font-display">
                  <AlignLeft className="w-3.5 h-3.5" /> Raw Text Content
                </label>
                <div className="p-4 rounded-xl glass-subtle border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap font-sans select-all selection:bg-[var(--color-brand-500)]/35 shadow-sm">
                  {chunk.content}
                </div>
              </div>

              {/* Quick Metrics with slide-down reveal */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Tokens", value: chunk.token_count },
                  { label: "Characters", value: chunk.char_count },
                ].map((m) => (
                  <div key={m.label} className="p-3 rounded-xl glass-subtle border border-[var(--color-border)]">
                    <p className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-bold font-display">{m.label}</p>
                    <p className="text-lg font-bold font-mono mt-0.5 text-[var(--color-text-primary)]">{m.value}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === "metadata" && (
            <motion.div
              key="metadata"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="space-y-4"
            >
              {/* Keywords */}
              {chunk.keywords && chunk.keywords.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] flex items-center gap-1 font-display">
                    <Tag className="w-3.5 h-3.5" /> Extracted Keywords
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {chunk.keywords.map((word) => (
                      <span
                        key={word}
                        className="px-2.5 py-1 rounded-lg bg-[var(--color-surface-200)] border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:border-[var(--color-brand-500)]/30 transition-colors font-sans"
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Entities */}
              {chunk.entities && chunk.entities.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] flex items-center gap-1 font-display">
                    <Globe className="w-3.5 h-3.5" /> NER Entities
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {chunk.entities.map((ent) => (
                      <span
                        key={ent}
                        className="px-2.5 py-1 rounded-lg bg-[var(--color-brand-500)]/10 border border-[var(--color-brand-500)]/20 text-xs text-[var(--color-brand-400)] font-sans font-medium"
                      >
                        {ent}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              {chunk.summary && (
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] flex items-center gap-1 font-display">
                    <FileText className="w-3.5 h-3.5" /> Chunk Summary
                  </label>
                  <div className="p-3.5 rounded-xl glass-subtle border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] leading-relaxed shadow-sm font-sans">
                    {chunk.summary}
                  </div>
                </div>
              )}

              {/* Details Table */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] font-display">
                  Attributes
                </label>
                <div className="rounded-xl border border-[var(--color-border)] overflow-hidden divide-y divide-[var(--color-border)] text-xs shadow-sm">
                  {[
                    { label: "Page Number", value: chunk.page_number || "N/A" },
                    { label: "Section Title", value: chunk.section_title || "Root" },
                    { label: "Content Hash", value: chunk.content_hash, mono: true },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between p-3 bg-[var(--color-surface-100)]/50">
                      <span className="text-[var(--color-text-muted)] font-display font-medium">{row.label}</span>
                      <span className={cn("font-semibold truncate max-w-[150px] font-display", row.mono && "font-mono text-[var(--color-text-muted)] select-all")}>
                        {String(row.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "vectors" && (
            <motion.div
              key="vectors"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="space-y-4"
            >
              {/* Vector DB specs */}
              <div className="rounded-xl border border-[var(--color-border)] overflow-hidden divide-y divide-[var(--color-border)] text-xs shadow-sm">
                <div className="flex items-center justify-between p-3 bg-[var(--color-surface-100)]/50">
                  <span className="text-[var(--color-text-muted)] font-display font-medium">Embedding Model</span>
                  <span className="font-mono text-[var(--color-brand-400)]">{chunk.embedding_model || "unknown"}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-[var(--color-surface-100)]/50">
                  <span className="text-[var(--color-text-muted)] font-display font-medium">Vector Dimensions</span>
                  <span className="font-semibold font-mono">{chunk.embedding_dimension || 1536}</span>
                </div>
              </div>

              {/* Dynamic Matrix Rain Vector Display */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] flex items-center justify-between font-display">
                  <span className="flex items-center gap-1"><Terminal className="w-3.5 h-3.5" /> Vector Array</span>
                  <button className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--color-surface-300)] text-[9px] hover:text-[var(--color-text-primary)] transition-colors border border-[var(--color-border)] cursor-pointer font-display font-semibold">
                    <Copy className="w-2.5 h-2.5" /> Copy
                  </button>
                </label>
                <MatrixVectorDisplay />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
