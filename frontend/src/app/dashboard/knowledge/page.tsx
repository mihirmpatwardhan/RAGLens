"use client";

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion as fm } from "framer-motion";
import {
  Plus,
  Search,
  Database,
  FileText,
  Layers,
  HardDrive,
  MoreHorizontal,
  X,
  Trash2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { cn, formatBytes, formatNumber } from "@/lib/utils";
import { apiClient, getErrorMessage } from "@/lib/api-client";
import { FileUpload } from "@/components/common/file-upload";
import toast from "react-hot-toast";

interface KB {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  document_count: number;
  chunk_count: number;
  storage_bytes: number;
  updated_at: string;
}

const COLOR_PRESETS = [
  { value: "#8b5cf6", name: "Purple" },
  { value: "#a78bfa", name: "Lavender" },
  { value: "#2dd4bf", name: "Teal" },
  { value: "#34d399", name: "Emerald" },
  { value: "#fbbf24", name: "Amber" },
  { value: "#f87171", name: "Coral" },
];

const ICON_PRESETS = ["🏗️", "🧠", "📖", "⚖️", "📦", "💬", "🔍", "⚡", "📁"];

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.45, ease: [0.19, 1, 0.22, 1] },
  }),
};

/* ── Live Formatted Counter ── */
function AnimatedFormattedStat({ value, formatter }: { value: number; formatter: (v: number) => string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let start = 0;
    const duration = 1000;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      setCount(Math.floor(progress * value));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value]);

  return <span ref={ref} className="font-display font-bold text-lg">{formatter(count)}</span>;
}

export default function KnowledgePage() {
  const [kbs, setKbs] = useState<KB[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [kbName, setKbName] = useState("");
  const [kbDesc, setKbDesc] = useState("");
  const [kbIcon, setKbIcon] = useState("🧠");
  const [kbColor, setKbColor] = useState("#8b5cf6");
  const [creating, setCreating] = useState(false);

  // Detail Drawer State
  const [selectedKb, setSelectedKb] = useState<KB | null>(null);
  const [kbDocs, setKbDocs] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  useEffect(() => {
    fetchKBs();
  }, []);

  async function fetchKBs() {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/knowledge-bases");
      setKbs(data.items || []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateKB(e: React.FormEvent) {
    e.preventDefault();
    if (!kbName.trim()) return;
    setCreating(true);
    try {
      const { data } = await apiClient.post("/knowledge-bases", {
        name: kbName,
        description: kbDesc,
        icon: kbIcon,
        color: kbColor,
        settings: {},
      });
      toast.success("Knowledge Base created successfully!");
      setShowCreateModal(false);
      // Reset form
      setKbName("");
      setKbDesc("");
      setKbIcon("🧠");
      setKbColor("#8b5cf6");
      fetchKBs();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteKB(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete "${name}"? This will delete all its uploaded documents.`)) return;
    try {
      await apiClient.delete(`/knowledge-bases/${id}`);
      toast.success("Knowledge Base deleted.");
      if (selectedKb?.id === id) {
        setSelectedKb(null);
      }
      fetchKBs();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function fetchKbDocuments(kbId: string) {
    setLoadingDocs(true);
    try {
      const { data } = await apiClient.get(`/documents/kb/${kbId}`);
      setKbDocs(data.items || []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoadingDocs(false);
    }
  }

  // Triggered when a file is dropped/uploaded
  async function handleFileUpload(files: File[], kbId: string) {
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        await apiClient.post(`/documents/upload/${kbId}`, formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
        toast.success(`Uploaded ${file.name} successfully!`);
      } catch (err) {
        toast.error(`Failed to upload ${file.name}: ${getErrorMessage(err)}`);
      }
    }
    // Refresh documents & KB stats
    fetchKbDocuments(kbId);
    fetchKBs();
  }

  async function handleDeleteDoc(docId: string, kbId: string) {
    if (!confirm("Are you sure you want to delete this document?")) return;
    try {
      await apiClient.delete(`/documents/${docId}`);
      toast.success("Document deleted.");
      fetchKbDocuments(kbId);
      fetchKBs();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  const filtered = kbs.filter(
    (kb) =>
      kb.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      kb.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 relative min-h-screen z-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-display">Knowledge Bases</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1 font-display">
            Manage your document collections and AI-powered knowledge stores
          </p>
        </div>
        <fm.button
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-primary btn-shimmer text-sm font-semibold shadow-lg shadow-brand/10"
        >
          <Plus className="w-4 h-4" />
          New Knowledge Base
        </fm.button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search knowledge bases..."
          className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-[var(--color-surface-200)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] input-glow transition-all outline-none"
        />
      </div>

      {/* Stats Row with Live Counter Animations */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total KBs", value: kbs.length, formatter: (v: number) => String(v), icon: Database, color: "#8b5cf6" },
          { label: "Documents", value: kbs.reduce((s, k) => s + (k.document_count || 0), 0), formatter: formatNumber, icon: FileText, color: "#2dd4bf" },
          { label: "Chunks", value: kbs.reduce((s, k) => s + (k.chunk_count || 0), 0), formatter: formatNumber, icon: Layers, color: "#34d399" },
          { label: "Storage", value: kbs.reduce((s, k) => s + (k.storage_bytes || 0), 0), formatter: formatBytes, icon: HardDrive, color: "#fbbf24" },
        ].map((stat, i) => (
          <fm.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="glass-subtle rounded-xl p-4 flex items-center gap-3 border border-[var(--color-border)]"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-inner" style={{ background: `${stat.color}12` }}>
              <stat.icon className="w-5 h-5 animate-pulse-glow" style={{ color: stat.color }} />
            </div>
            <div>
              <AnimatedFormattedStat value={stat.value} formatter={stat.formatter} />
              <p className="text-[10px] text-[var(--color-text-muted)] font-display uppercase tracking-wider font-bold mt-0.5">{stat.label}</p>
            </div>
          </fm.div>
        ))}
      </div>

      {/* KB List Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 text-[var(--color-brand-400)] animate-spin" />
          <p className="text-sm text-[var(--color-text-muted)]">Loading knowledge bases...</p>
        </div>
      ) : (
        <fm.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          initial="hidden"
          animate="visible"
        >
          {filtered.map((kb, i) => (
            <fm.div
              key={kb.id}
              custom={i}
              variants={fadeInUp}
              whileHover={{ y: -4 }}
              onClick={() => {
                setSelectedKb(kb);
                fetchKbDocuments(kb.id);
              }}
              className="card-tilt bg-noise glass-card rounded-2xl p-5 cursor-pointer group relative overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-brand-500)]/30 shadow-lg shadow-black/10"
            >
              {/* Animated gradient border lines */}
              <div className="absolute inset-0 rounded-2xl gradient-border-animated opacity-0 group-hover:opacity-50 transition-opacity duration-300 pointer-events-none" />

              {/* Top */}
              <div className="flex items-start justify-between mb-4 relative z-10">
                <div className="flex items-center gap-3">
                  <fm.div
                    whileHover={{ scale: 1.12, rotate: 6 }}
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shadow-md"
                    style={{ background: `${kb.color || "#8b5cf6"}15` }}
                  >
                    {kb.icon || "📁"}
                  </fm.div>
                  <div>
                    <h3 className="font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-brand-400)] transition-colors font-display text-sm sm:text-base">
                      {kb.name}
                    </h3>
                    <p className="text-[10px] text-[var(--color-text-muted)] font-display uppercase tracking-wider font-semibold">Active store</p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteKB(kb.id, kb.name);
                  }}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 relative z-20"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Description */}
              <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] mb-4 line-clamp-2 relative z-10 min-h-[40px] leading-relaxed">
                {kb.description || "No description provided."}
              </p>

              {/* Stats row */}
              <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)] relative z-10 border-t border-[var(--color-border)]/50 pt-3">
                <span className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-[var(--color-brand-400)]" />
                  {kb.document_count || 0} docs
                </span>
                <span className="flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-[var(--color-accent-400)]" />
                  {formatNumber(kb.chunk_count || 0)} chunks
                </span>
                <span className="flex items-center gap-1 font-mono">
                  <HardDrive className="w-3.5 h-3.5 text-[var(--color-rose-400)]" />
                  {formatBytes(kb.storage_bytes || 0)}
                </span>
              </div>
            </fm.div>
          ))}

          {/* Create New Card with pulsing border */}
          <fm.button
            custom={filtered.length}
            variants={fadeInUp}
            whileHover={{ scale: 1.02, y: -2 }}
            onClick={() => setShowCreateModal(true)}
            animate={{
              boxShadow: [
                "0 0 0px rgba(124, 58, 237, 0)",
                "0 0 16px rgba(124, 58, 237, 0.12)",
                "0 0 0px rgba(124, 58, 237, 0)"
              ],
              borderColor: [
                "rgba(255, 255, 255, 0.06)",
                "rgba(124, 58, 237, 0.25)",
                "rgba(255, 255, 255, 0.06)"
              ]
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="border-2 border-dashed rounded-2xl p-5 flex flex-col items-center justify-center gap-3 min-h-[200px] hover:border-[var(--color-brand-500)]/40 hover:bg-[var(--color-brand-500)]/5 transition-all duration-300 group text-left cursor-pointer"
          >
            <div className="w-14 h-14 rounded-xl bg-[var(--color-surface-200)] group-hover:bg-[var(--color-brand-500)]/10 flex items-center justify-center transition-colors">
              <Plus className="w-7 h-7 text-[var(--color-text-muted)] group-hover:text-[var(--color-brand-400)] transition-colors" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] transition-colors font-display">
                Create Knowledge Base
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Store and chunk your PDFs or markdown files
              </p>
            </div>
          </fm.button>
        </fm.div>
      )}

      {/* ── CREATE MODAL ── */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <fm.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCreateModal(false)}
            />
            <fm.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="relative w-full max-w-md bg-noise glass-card rounded-2xl p-6 overflow-hidden z-10 border border-[var(--color-border)] shadow-2xl"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold font-display flex items-center gap-2">
                  <Database className="w-5 h-5 text-[var(--color-brand-400)] animate-pulse-glow" />
                  New Knowledge Base
                </h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1.5 rounded-lg hover:bg-[var(--color-surface-200)] text-[var(--color-text-muted)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateKB} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">
                    KB Name
                  </label>
                  <input
                    type="text"
                    required
                    value={kbName}
                    onChange={(e) => setKbName(e.target.value)}
                    placeholder="e.g. Finance Reports, Legal Docs"
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-surface-200)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] input-glow outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">
                    Description
                  </label>
                  <textarea
                    value={kbDesc}
                    onChange={(e) => setKbDesc(e.target.value)}
                    placeholder="Describe what kind of documents will be stored in this KB..."
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-surface-200)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] input-glow outline-none resize-none"
                  />
                </div>

                {/* Preset presets */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">
                      Color Theme
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {COLOR_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setKbColor(p.value)}
                          className={cn(
                            "w-6 h-6 rounded-full border-2 transition-all cursor-pointer",
                            kbColor === p.value ? "border-white scale-110" : "border-transparent opacity-70 hover:opacity-100"
                          )}
                          style={{ backgroundColor: p.value }}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">
                      Emoji Icon
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {ICON_PRESETS.map((ico) => (
                        <button
                          key={ico}
                          type="button"
                          onClick={() => setKbIcon(ico)}
                          className={cn(
                            "w-6 h-6 rounded-lg text-sm flex items-center justify-center bg-[var(--color-surface-200)] hover:bg-[var(--color-surface-300)] transition-all cursor-pointer",
                            kbIcon === ico ? "ring-2 ring-[var(--color-brand-500)] scale-110" : ""
                          )}
                        >
                          {ico}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-[var(--color-border)]">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold hover:bg-[var(--color-surface-200)] transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-5 py-2.5 rounded-xl btn-primary text-xs font-semibold flex items-center gap-2 shadow-lg shadow-brand/10"
                  >
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Create KB
                  </button>
                </div>
              </form>
            </fm.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── DETAIL DRAWER (SLIDE OVER) ── */}
      <AnimatePresence>
        {selectedKb && (
          <div className="fixed inset-0 z-40 flex justify-end">
            {/* Backdrop */}
            <fm.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSelectedKb(null)}
            />
            {/* Drawer */}
            <fm.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-xl h-full bg-noise bg-[var(--color-surface-100)] border-l border-[var(--color-border)] flex flex-col z-10 shadow-2xl p-6 overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-start justify-between pb-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-md"
                    style={{ background: `${selectedKb.color || "#8b5cf6"}15` }}
                  >
                    {selectedKb.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold font-display text-[var(--color-text-primary)]">
                      {selectedKb.name}
                    </h3>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono">
                      ID: {selectedKb.id}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedKb(null)}
                  className="p-2 rounded-xl hover:bg-[var(--color-surface-200)] text-[var(--color-text-muted)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Description */}
              <div className="py-4">
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed font-sans">
                  {selectedKb.description || "No description provided."}
                </p>
              </div>

              {/* ── DRAG & DROP FILE UPLOAD (EXPLICIT / EASY) ── */}
              <div className="space-y-3 py-4 border-t border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--color-brand-400)] animate-pulse-glow" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] font-display">
                    Upload Documents
                  </h4>
                </div>
                <FileUpload
                  onUpload={(files) => handleFileUpload(files, selectedKb.id)}
                  accept={{
                    "application/pdf": [".pdf"],
                    "text/plain": [".txt"],
                    "text/markdown": [".md"],
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
                  }}
                  maxFiles={5}
                />
              </div>

              {/* ── DOCUMENT LIST ── */}
              <div className="flex-1 flex flex-col min-h-0 pt-4 border-t border-[var(--color-border)] space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] font-display">
                  Documents in KB ({kbDocs.length})
                </h4>

                {loadingDocs ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-[var(--color-brand-400)]" />
                    <p className="text-xs text-[var(--color-text-muted)]">Loading file list...</p>
                  </div>
                ) : kbDocs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 border border-dashed border-[var(--color-border)] rounded-2xl text-center">
                    <FileText className="w-8 h-8 text-[var(--color-text-muted)] mb-2" />
                    <p className="text-xs text-[var(--color-text-secondary)] font-semibold font-display">No files uploaded yet</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 font-sans">Use the dropzone above to index documents.</p>
                  </div>
                ) : (
                  <div className="space-y-2 overflow-y-auto max-h-[300px] pr-1">
                    {kbDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="glass-subtle rounded-xl p-3 flex items-center justify-between group border border-[var(--color-border)] hover:border-[var(--color-brand-500)]/20 transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-lg">📄</span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[var(--color-text-primary)] truncate font-display">
                              {doc.original_filename}
                            </p>
                            <p className="text-[10px] text-[var(--color-text-muted)] font-mono mt-0.5">
                              {formatBytes(doc.file_size)} · Status:{" "}
                              <span
                                className={cn(
                                  "font-bold",
                                  doc.status === "ready" && "text-emerald-400",
                                  doc.status === "processing" && "text-[var(--color-brand-400)] animate-pulse",
                                  doc.status === "error" && "text-red-400"
                                )}
                              >
                                {doc.status}
                              </span>
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeleteDoc(doc.id, selectedKb.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </fm.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
