"use client";

import { motion } from "framer-motion";
import {
  Upload, ShieldCheck, FileCheck, Eye, Layout, Globe, Image, Table, Tags, FileType, BookOpen, Scissors, Binary, Database, List, CheckCircle2, Clock, Activity, RotateCcw, ChevronRight, Zap,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";

interface PipelineStage {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  status: "completed" | "running" | "pending" | "error";
  duration_ms: number;
  progress: number;
  color: string;
  details: string;
}

const DEMO_STAGES: PipelineStage[] = [
  { id: "upload", label: "Upload", icon: Upload, status: "completed", duration_ms: 234, progress: 100, color: "#8b5cf6", details: "report-2024.pdf (4.2 MB)" },
  { id: "virus_scan", label: "Virus Scan", icon: ShieldCheck, status: "completed", duration_ms: 1200, progress: 100, color: "#34d399", details: "Clean — no threats detected" },
  { id: "validation", label: "Validation", icon: FileCheck, status: "completed", duration_ms: 89, progress: 100, color: "#14b8a6", details: "Valid PDF, 42 pages" },
  { id: "ocr", label: "OCR", icon: Eye, status: "completed", duration_ms: 8450, progress: 100, color: "#a78bfa", details: "3 scanned pages processed" },
  { id: "layout", label: "Layout Detection", icon: Layout, status: "completed", duration_ms: 3200, progress: 100, color: "#c084fc", details: "Headers, paragraphs, lists detected" },
  { id: "language", label: "Language Detection", icon: Globe, status: "completed", duration_ms: 45, progress: 100, color: "#2dd4bf", details: "English (en) — 99.8% confidence" },
  { id: "images", label: "Image Extraction", icon: Image, status: "completed", duration_ms: 1890, progress: 100, color: "#f472b6", details: "12 images extracted & captioned" },
  { id: "tables", label: "Table Extraction", icon: Table, status: "completed", duration_ms: 2340, progress: 100, color: "#fbbf24", details: "8 tables parsed to structured data" },
  { id: "metadata", label: "Metadata Extraction", icon: Tags, status: "completed", duration_ms: 156, progress: 100, color: "#34d399", details: "Title, author, date, keywords" },
  { id: "classify", label: "Classification", icon: FileType, status: "completed", duration_ms: 890, progress: 100, color: "#f87171", details: "Technical Report > Engineering" },
  { id: "summary", label: "Summarization", icon: BookOpen, status: "completed", duration_ms: 4500, progress: 100, color: "#8b5cf6", details: "Document & section summaries generated" },
  { id: "chunking", label: "Chunking", icon: Scissors, status: "completed", duration_ms: 234, progress: 100, color: "#a78bfa", details: "187 chunks (recursive, 512 tokens)" },
  { id: "embedding", label: "Embedding", icon: Binary, status: "running", duration_ms: 12000, progress: 72, color: "#2dd4bf", details: "134/187 embeddings generated" },
  { id: "storage", label: "Vector Storage", icon: Database, status: "pending", duration_ms: 0, progress: 0, color: "#34d399", details: "Waiting for embeddings..." },
  { id: "indexing", label: "Indexing", icon: List, status: "pending", duration_ms: 0, progress: 0, color: "#fbbf24", details: "Waiting for storage..." },
  { id: "ready", label: "Ready", icon: CheckCircle2, status: "pending", duration_ms: 0, progress: 0, color: "#34d399", details: "Document will be searchable" },
];

const statusColors = {
  completed: "text-emerald-400",
  running: "text-[var(--color-brand-400)]",
  pending: "text-[var(--color-text-muted)]",
  error: "text-red-400",
};

const statusBg = {
  completed: "bg-emerald-400",
  running: "bg-[var(--color-brand-400)]",
  pending: "bg-[var(--color-surface-500)]",
  error: "bg-red-400",
};

export default function PipelinesPage() {
  const completedCount = DEMO_STAGES.filter((s) => s.status === "completed").length;
  const totalDuration = DEMO_STAGES.reduce((s, stage) => s + stage.duration_ms, 0);
  const overallProgress = (completedCount / DEMO_STAGES.length) * 100;

  return (
    <div className="p-6 space-y-6 z-10 relative">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-display">Ingestion Pipeline</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1 font-display">
            Real-time document processing with stage-by-stage observability
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl glass-subtle text-sm border border-[var(--color-border)] shadow-sm">
            <motion.div
              animate={{ scale: [1, 1.25, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <Activity className="w-4 h-4 text-[var(--color-brand-400)]" />
            </motion.div>
            <span className="text-[var(--color-text-secondary)] font-display font-medium">Processing</span>
            <span className="font-mono font-bold text-[var(--color-brand-400)]">
              {completedCount}/{DEMO_STAGES.length}
            </span>
          </div>
        </div>
      </div>

      {/* Overall Progress with shimmer progress bar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-noise glass-card rounded-xl p-6 border border-[var(--color-border)] shadow-lg"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[var(--color-brand-500)]/12 flex items-center justify-center shadow-inner">
              <Zap className="w-5 h-5 text-[var(--color-brand-400)] animate-pulse-glow" />
            </div>
            <div>
              <h3 className="font-bold font-display text-sm sm:text-base">report-2024.pdf</h3>
              <p className="text-[10px] sm:text-xs text-[var(--color-text-muted)] mt-0.5">4.2 MB · 42 pages · Started 45s ago</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)] font-mono">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatDuration(totalDuration)}
            </span>
          </div>
        </div>

        {/* Progress bar with shimmer sweep */}
        <div className="w-full h-2.5 rounded-full bg-[var(--color-surface-400)] overflow-hidden relative">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[var(--color-brand-600)] via-[var(--color-brand-400)] to-[var(--color-accent-400)] relative overflow-hidden"
            initial={{ width: 0 }}
            animate={{ width: `${overallProgress}%` }}
            transition={{ duration: 1.2, ease: [0.19, 1, 0.22, 1] }}
            style={{ boxShadow: "0 0 16px rgba(124, 58, 237, 0.4)" }}
          >
            {/* Shimmer overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer-sweep_2.5s_infinite]" />
          </motion.div>
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-[var(--color-text-muted)] font-mono">
          <span>{Math.round(overallProgress)}% complete</span>
          <span>~{formatDuration(totalDuration * (1 - overallProgress / 100))} remaining</span>
        </div>
      </motion.div>

      {/* Pipeline Stages */}
      <div className="space-y-1">
        {DEMO_STAGES.map((stage, i) => (
          <motion.div
            key={stage.id}
            initial={{ opacity: 0, y: 12, rotateX: 6 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ delay: i * 0.04, duration: 0.5, ease: [0.19, 1, 0.22, 1] }}
            style={{ perspective: 1000 }}
          >
            <motion.div
              whileHover={{ x: 4 }}
              className={cn(
                "bg-noise glass-card rounded-xl p-4 flex items-center gap-4 cursor-pointer group transition-all duration-200 border relative overflow-hidden",
                stage.status === "running" ? "border-transparent shadow-[0_0_15px_rgba(124,58,237,0.18)]" : "border-[var(--color-border)]"
              )}
            >
              {/* Rotating conic border for running stages */}
              {stage.status === "running" && (
                <div className="absolute inset-0 rounded-xl gradient-border-animated" />
              )}

              {/* Stage Number */}
              <div className="w-7 h-7 rounded-lg bg-[var(--color-surface-300)] flex items-center justify-center text-[10px] font-mono font-bold text-[var(--color-text-muted)] z-10">
                {String(i + 1).padStart(2, "0")}
              </div>

              {/* Status LED */}
              <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0 relative z-10", statusBg[stage.status])}>
                {stage.status === "running" && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-[var(--color-brand-400)]"
                    animate={{ scale: [1, 2, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
                {stage.status === "completed" && (
                  <div className="absolute -inset-0.5 rounded-full bg-emerald-400/20" />
                )}
              </div>

              {/* Icon */}
              <motion.div
                whileHover={{ scale: 1.12, rotate: 5 }}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 z-10 shadow-inner"
                style={{ background: `${stage.color}15` }}
              >
                <stage.icon className="w-4 h-4" style={{ color: stage.color }} />
              </motion.div>

              {/* Info */}
              <div className="flex-1 min-w-0 z-10">
                <div className="flex items-center gap-2">
                  <h4 className={cn("text-xs sm:text-sm font-semibold font-display", statusColors[stage.status])}>
                    {stage.label}
                  </h4>
                  {stage.status === "running" && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="px-2 py-0.5 rounded-lg bg-[var(--color-brand-500)]/12 text-[8px] font-bold text-[var(--color-brand-400)] uppercase tracking-wider border border-[var(--color-brand-500)]/20 font-display"
                    >
                      In Progress
                    </motion.span>
                  )}
                </div>
                <p className="text-[10px] sm:text-xs text-[var(--color-text-muted)] truncate mt-0.5 leading-relaxed font-sans">{stage.details}</p>
              </div>

              {/* Progress (if running) */}
              {stage.status === "running" && (
                <div className="w-24 z-10 mr-2">
                  <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-400)] overflow-hidden relative">
                    <motion.div
                      className="h-full rounded-full relative overflow-hidden"
                      style={{ background: `linear-gradient(90deg, ${stage.color}, ${stage.color}80)`, boxShadow: `0 0 6px ${stage.color}` }}
                      initial={{ width: 0 }}
                      animate={{ width: `${stage.progress}%` }}
                      transition={{ duration: 0.8 }}
                    >
                      {/* Shimmer sweep inside stage bar */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer-sweep_2s_infinite]" />
                    </motion.div>
                  </div>
                  <p className="text-[9px] text-[var(--color-text-muted)] text-right mt-0.5 font-mono">
                    {stage.progress}%
                  </p>
                </div>
              )}

              {/* Duration */}
              {stage.duration_ms > 0 && (
                <span className="text-[10px] sm:text-xs font-mono text-[var(--color-text-muted)] w-16 text-right z-10">
                  {formatDuration(stage.duration_ms)}
                </span>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                {stage.status === "error" && (
                  <button className="p-1.5 rounded-lg hover:bg-[var(--color-surface-300)] transition-colors text-[var(--color-text-muted)]">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
                <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />
              </div>
            </motion.div>

            {/* Connector line (animated dashed SVG path with flowing dashes) */}
            {i < DEMO_STAGES.length - 1 && (
              <div className="flex justify-center h-4 relative">
                <svg className="w-4 h-full pointer-events-none" viewBox="0 0 10 20">
                  <line 
                    x1="5" 
                    y1="0" 
                    x2="5" 
                    y2="20" 
                    stroke={
                      stage.status === "completed" 
                        ? "var(--color-success)" 
                        : stage.status === "running" 
                        ? "var(--color-brand-400)" 
                        : "var(--color-surface-500)"
                    } 
                    strokeWidth="2" 
                    strokeDasharray="4 4"
                    className={stage.status === "running" || stage.status === "completed" ? "pipeline-connection" : ""} 
                    style={{ strokeOpacity: 0.7 }}
                  />
                </svg>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
