"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Upload,
  Filter,
  List,
  Grid3X3,
  MoreHorizontal,
  Database,
  Trash2,
  Loader2,
  ArrowRight,
  RefreshCw,
  FileSpreadsheet,
} from "lucide-react";
import { cn, formatBytes, getFileIcon } from "@/lib/utils";
import { apiClient, getErrorMessage } from "@/lib/api-client";
import { FileUpload } from "@/components/common/file-upload";
import toast from "react-hot-toast";

interface KB {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

interface Document {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  status: "uploaded" | "processing" | "ready" | "error";
  created_at: string;
  chunk_count?: number;
}

export default function DocumentsPage() {
  const [kbs, setKbs] = useState<KB[]>([]);
  const [loadingKBs, setLoadingKBs] = useState(true);
  const [selectedKbId, setSelectedKbId] = useState<string>("");
  
  const [docs, setDocs] = useState<Document[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    fetchKBs();
  }, []);

  useEffect(() => {
    if (selectedKbId) {
      fetchDocuments(selectedKbId);
    } else {
      setDocs([]);
    }
  }, [selectedKbId]);

  async function fetchKBs() {
    setLoadingKBs(true);
    try {
      const { data } = await apiClient.get("/knowledge-bases");
      setKbs(data.items || []);
      if (data.items && data.items.length > 0) {
        setSelectedKbId(data.items[0].id);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoadingKBs(false);
    }
  }

  async function fetchDocuments(kbId: string) {
    setLoadingDocs(true);
    try {
      const { data } = await apiClient.get(`/documents/kb/${kbId}`);
      setDocs(data.items || []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoadingDocs(false);
    }
  }

  async function handleFileUpload(files: File[]) {
    if (!selectedKbId) {
      toast.error("Please select a knowledge base first.");
      return;
    }
    
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        await apiClient.post(`/documents/upload/${selectedKbId}`, formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
        toast.success(`Uploaded ${file.name} successfully!`);
      } catch (err) {
        toast.error(`Failed to upload ${file.name}: ${getErrorMessage(err)}`);
      }
    }
    fetchDocuments(selectedKbId);
  }

  async function handleDeleteDoc(docId: string) {
    if (!confirm("Are you sure you want to delete this document?")) return;
    try {
      await apiClient.delete(`/documents/${docId}`);
      toast.success("Document deleted successfully.");
      fetchDocuments(selectedKbId);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  const activeKB = kbs.find((k) => k.id === selectedKbId);

  const filtered = docs.filter((doc) =>
    doc.original_filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 z-10 relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-display">Documents</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1 font-display">
            Browse and manage all documents across knowledge bases
          </p>
        </div>

        {/* KB Selection dropdown */}
        <div className="flex items-center gap-3">
          {loadingKBs ? (
            <Loader2 className="w-5 h-5 animate-spin text-[var(--color-brand-400)]" />
          ) : kbs.length > 0 ? (
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider font-display">
                Active KB:
              </label>
              <select
                value={selectedKbId}
                onChange={(e) => setSelectedKbId(e.target.value)}
                className="px-4 py-2 rounded-xl bg-[var(--color-surface-200)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] input-glow outline-none cursor-pointer font-display font-medium"
              >
                {kbs.map((kb) => (
                  <option key={kb.id} value={kb.id}>
                    {kb.icon} {kb.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {selectedKbId && (
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setUploadOpen(!uploadOpen)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-primary btn-shimmer text-sm font-semibold shadow-lg shadow-brand/10"
            >
              <Upload className="w-4 h-4" /> Upload
            </motion.button>
          )}
        </div>
      </div>

      {/* ── EXPANDABLE EXPLICIT UPLOAD ZONE ── */}
      <AnimatePresence>
        {uploadOpen && selectedKbId && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-noise glass-card rounded-2xl p-6 overflow-hidden space-y-4 border border-[var(--color-border)] shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <div>
                <h3 className="text-sm font-bold font-display text-[var(--color-text-primary)]">
                  Add Documents to "{activeKB?.name}"
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  PDFs, Word documents, text, markdown, and CSV files are indexed automatically.
                </p>
              </div>
              <button
                onClick={() => setUploadOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--color-surface-200)] text-[var(--color-text-muted)] transition-all font-display text-xs font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>

            <FileUpload
              onUpload={handleFileUpload}
              accept={{
                "application/pdf": [".pdf"],
                "text/plain": [".txt"],
                "text/markdown": [".md"],
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
              }}
              maxFiles={10}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content conditional */}
      {kbs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-[var(--color-border)] rounded-2xl text-center">
          <Database className="w-12 h-12 text-[var(--color-text-muted)] mb-3" />
          <h3 className="text-lg font-bold font-display mb-1.5">No Knowledge Bases Found</h3>
          <p className="text-sm text-[var(--color-text-muted)] max-w-sm mb-5 leading-relaxed">
            You must create a knowledge base before uploading and indexing files.
          </p>
          <a
            href="/dashboard/knowledge"
            className="px-5 py-2.5 rounded-xl btn-primary font-semibold text-xs inline-flex items-center gap-2 shadow-lg shadow-brand/10"
          >
            Create Knowledge Base <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      ) : !selectedKbId ? (
        <div className="text-center py-20">
          <p className="text-sm text-[var(--color-text-muted)]">Please select a knowledge base from the top dropdown to view documents.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documents..."
                className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-[var(--color-surface-200)]/70 border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] input-glow outline-none"
              />
            </div>
            <button
              onClick={() => fetchDocuments(selectedKbId)}
              className="p-2.5 rounded-xl glass-interactive text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] border border-[var(--color-border)] cursor-pointer"
              title="Refresh document status"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <div className="flex rounded-xl overflow-hidden border border-[var(--color-border)] ml-auto">
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "p-2.5 transition-all cursor-pointer",
                  viewMode === "list" ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-200)]"
                )}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-2.5 transition-all cursor-pointer",
                  viewMode === "grid" ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-200)]"
                )}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Document list container */}
          {loadingDocs ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--color-brand-400)]" />
              <p className="text-sm text-[var(--color-text-muted)]">Loading documents...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 border border-dashed border-[var(--color-border)] rounded-2xl text-center">
              <FileSpreadsheet className="w-10 h-10 text-[var(--color-text-muted)] mb-2" />
              <p className="text-sm font-semibold text-[var(--color-text-secondary)] font-display">No documents in this KB</p>
              <p className="text-xs text-[var(--color-text-muted)] max-w-xs mt-1 leading-relaxed">
                Click the "Upload" button at the top to add PDF, Markdown, or text files to this knowledge base.
              </p>
            </div>
          ) : (
            <div className="bg-noise glass-card rounded-2xl overflow-hidden border border-[var(--color-border)] shadow-xl">
              {/* Header */}
              <div className="grid grid-cols-[1fr_120px_100px_100px_40px] gap-4 px-5 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-100)]/30 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] font-display">
                <span>Document</span>
                <span>Size</span>
                <span>Status</span>
                <span>Uploaded</span>
                <span></span>
              </div>

              {/* Rows with staggered entrance and bounce file icons */}
              {filtered.map((doc, i) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.035, duration: 0.45, ease: [0.19, 1, 0.22, 1] }}
                  className="grid grid-cols-[1fr_120px_100px_100px_40px] gap-4 px-5 py-4 items-center border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-200)]/60 hover:shadow-[0_0_15px_rgba(124,58,237,0.06)] hover:border-[var(--color-brand-500)]/15 transition-all cursor-pointer group"
                >
                  {/* Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <motion.span 
                      className="text-lg flex-shrink-0 block"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 350, damping: 15, delay: i * 0.03 }}
                    >
                      {getFileIcon(doc.mime_type)}
                    </motion.span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate text-[var(--color-text-primary)] group-hover:text-[var(--color-brand-400)] transition-colors font-display">
                        {doc.original_filename}
                      </p>
                      {doc.chunk_count ? (
                        <p className="text-[10px] text-[var(--color-text-muted)] font-mono mt-0.5">
                          {doc.chunk_count} chunks generated
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* Size */}
                  <span className="text-xs text-[var(--color-text-muted)] font-mono">
                    {formatBytes(doc.file_size)}
                  </span>

                  {/* Status Badges with Breathing LEDs */}
                  <span
                    className={cn(
                      "text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg w-fit border flex items-center gap-1.5 font-display",
                      doc.status === "ready" && "bg-emerald-500/12 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(52,211,153,0.08)]",
                      doc.status === "processing" && "bg-[var(--color-brand-500)]/12 text-[var(--color-brand-400)] border-[var(--color-brand-500)]/25 shadow-[0_0_8px_rgba(139,92,246,0.12)] animate-pulse",
                      doc.status === "uploaded" && "bg-[var(--color-accent-500)]/12 text-[var(--color-accent-400)] border-[var(--color-accent-500)]/20",
                      doc.status === "error" && "bg-red-500/12 text-red-400 border-red-500/20 shadow-[0_0_8px_rgba(248,113,113,0.12)]"
                    )}
                  >
                    {doc.status === "processing" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-400)] animate-breathe" />
                    )}
                    {doc.status === "error" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    )}
                    {doc.status}
                  </span>

                  {/* Uploaded Date */}
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {new Date(doc.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>

                  {/* Actions */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteDoc(doc.id);
                    }}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 relative z-20 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
