"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Github,
  Loader2,
  Music,
  RefreshCw,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiClient, uploadClient, getErrorMessage } from "@/lib/api-client";
import { FileUpload } from "@/components/common/file-upload";
import { cn, formatBytes, formatRelativeTime, getFileIcon } from "@/lib/utils";
import type { Document, KnowledgeBase } from "@/types";

export default function DocumentsPage() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKbId, setSelectedKbId] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingKnowledgeBases, setLoadingKnowledgeBases] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // GitHub ingestion
  const [githubOpen, setGithubOpen] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [githubIngesting, setGithubIngesting] = useState(false);

  const activeKb = useMemo(
    () => knowledgeBases.find((kb) => kb.id === selectedKbId) || null,
    [knowledgeBases, selectedKbId]
  );

  const filteredDocuments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return documents;
    return documents.filter((doc) => doc.original_filename.toLowerCase().includes(query));
  }, [documents, searchQuery]);

  async function fetchKnowledgeBases() {
    setLoadingKnowledgeBases(true);
    try {
      const { data } = await apiClient.get("/knowledge-bases");
      const items = data.items || [];
      setKnowledgeBases(items);
      const initialId = items[0]?.id || "";
      setSelectedKbId(initialId);
      if (initialId) {
        void fetchDocuments(initialId);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoadingKnowledgeBases(false);
    }
  }

  async function fetchDocuments(kbId: string) {
    setLoadingDocuments(true);
    try {
      const { data } = await apiClient.get(`/documents/kb/${kbId}`);
      setDocuments(data.items || []);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoadingDocuments(false);
    }
  }

  useEffect(() => {
    setTimeout(() => {
      void fetchKnowledgeBases();
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload(file: File, onProgress: (progress: number) => void) {
    if (!selectedKbId) throw new Error("Please select a workspace first.");

    const formData = new FormData();
    formData.append("file", file);

    // uploadClient has a 5-minute timeout and correct baseURL — no manual override needed.
    await uploadClient.post(`/documents/upload/${selectedKbId}`, formData, {
      onUploadProgress: (event) => {
        if (!event.total) {
          onProgress(85);
          return;
        }
        onProgress(Math.round((event.loaded / event.total) * 100));
      },
    });

    toast.success(`${file.name} uploaded.`);
    await fetchDocuments(selectedKbId);
  }

  async function handleDeleteDocument(documentId: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;

    try {
      await apiClient.delete(`/documents/${documentId}`);
      setDocuments((current) => current.filter((doc) => doc.id !== documentId));
      toast.success("Document deleted.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function handleGithubIngest() {
    if (!selectedKbId) return toast.error("Select a workspace first.");
    if (!githubUrl.trim()) return toast.error("Enter a GitHub repository URL.");
    if (!githubUrl.startsWith("https://github.com/")) {
      return toast.error("Only https://github.com/ URLs are supported.");
    }
    setGithubIngesting(true);
    try {
      await apiClient.post(`/documents/ingest-github/${selectedKbId}`, {
        repo_url: githubUrl.trim(),
        branch: "main",
      });
      toast.success(
        "Repository queued for ingestion. Code chunks will appear shortly."
      );
      setGithubUrl("");
      setGithubOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setGithubIngesting(false);
    }
  }

  const summary = {
    ready: documents.filter((doc) => doc.status === "ready").length,
    processing: documents.filter((doc) => doc.status === "processing").length,
    error: documents.filter((doc) => doc.status === "error").length,
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="mt-2 font-display text-3xl font-bold">My Files</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-secondary)]">
            Upload your documents, track when they’re ready, and keep them organised by workspace.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {loadingKnowledgeBases ? (
            <Loader2 className="h-5 w-5 animate-spin text-[var(--color-brand-600)]" />
          ) : knowledgeBases.length > 0 ? (
            <select
              value={selectedKbId}
              onChange={(event) => {
                const newId = event.target.value;
                setSelectedKbId(newId);
                if (newId) {
                  void fetchDocuments(newId);
                } else {
                  setDocuments([]);
                }
              }}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-50)] px-4 py-2.5 text-sm outline-none"
            >
              {knowledgeBases.map((kb) => (
                <option key={kb.id} value={kb.id}>
                  {kb.icon} {kb.name}
                </option>
              ))}
            </select>
          ) : null}

          <button
            id="github-toggle-btn"
            onClick={() => setGithubOpen((v) => !v)}
            disabled={!selectedKbId}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-2.5 text-sm font-semibold transition hover:bg-[var(--color-surface-50)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Github className="h-4 w-4" />
            {githubOpen ? "Hide GitHub" : "Ingest GitHub"}
          </button>

          <button
            onClick={() => setUploadOpen((current) => !current)}
            disabled={!selectedKbId}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-700)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {uploadOpen ? "Hide uploader" : "Upload files"}
          </button>
        </div>
      </div>

      {knowledgeBases.length === 0 && !loadingKnowledgeBases ? (
        <div className="rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-50)] p-10 text-center">
          <FileText className="mx-auto h-10 w-10 text-[var(--color-text-muted)]" />
          <h3 className="mt-4 font-display text-xl font-bold">Create a workspace first</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-[var(--color-text-secondary)]">
            Files belong to a workspace. Start by creating one so you can organise your uploads.
          </p>
          <Link
            href="/dashboard/knowledge"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Go to My Workspaces
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}

      {uploadOpen && selectedKbId ? (
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="font-display text-lg font-bold text-[var(--color-text-primary)]">
              Upload into {activeKb?.name}
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              PDFs, Office docs, markdown, text, CSV, JSON, images, and audio/video are supported.
            </p>
          </div>
          <FileUpload
            onUpload={handleUpload}
            accept={{
              "application/pdf": [".pdf"],
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
              "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
              "text/plain": [".txt"],
              "text/markdown": [".md"],
              "text/csv": [".csv"],
              "application/json": [".json"],
              "image/png": [".png"],
              "image/jpeg": [".jpg", ".jpeg"],
              "audio/mpeg": [".mp3"],
              "audio/wav": [".wav"],
              "video/mp4": [".mp4"],
              "video/webm": [".webm"],
            }}
            maxFiles={10}
            maxSizeMB={500}
          />
        </div>
      ) : null}

      {/* ── GitHub Ingestion Panel ─────────────────────────────── */}
      {githubOpen && selectedKbId ? (
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <Github className="h-5 w-5 text-[var(--color-brand-600)]" />
            <div>
              <h3 className="font-display text-lg font-bold text-[var(--color-text-primary)]">
                Ingest GitHub Repository
              </h3>
              <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
                Clone and index source code into <strong>{activeKb?.name}</strong>.
                Python, JS, and TypeScript files are AST-chunked.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <input
              id="github-url-input"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleGithubIngest()}
              placeholder="https://github.com/owner/repository"
              className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-2.5 text-sm font-mono outline-none focus:border-[var(--color-brand-400)]"
            />
            <button
              id="github-ingest-btn"
              onClick={() => void handleGithubIngest()}
              disabled={githubIngesting || !githubUrl.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-600)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {githubIngesting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Cloning...</>
              ) : (
                <><Github className="h-4 w-4" /> Ingest Repo</>
              )}
            </button>
          </div>
        </div>
      ) : null}

      {activeKb ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Ready", value: summary.ready, tone: "text-emerald-600 bg-emerald-500/10" },
            { label: "Processing", value: summary.processing, tone: "text-amber-600 bg-amber-500/10" },
            { label: "Errors", value: summary.error, tone: "text-red-600 bg-red-500/10" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {item.label}
                </p>
                <span className={cn("rounded-full px-2 py-1 text-xs font-semibold", item.tone)}>
                  {item.value}
                </span>
              </div>
              <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                {item.label === "Ready" && "These files are ready to use in chat."}
                {item.label === "Processing" && "We're still reading through these files, hang tight."}
                {item.label === "Errors" && "Something went wrong with these files. Try re-uploading them."}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)] shadow-sm">
        <div className="flex flex-col gap-4 border-b border-[var(--color-border)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-display text-lg font-bold">Uploaded files</h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {activeKb ? `Showing files for ${activeKb.name}.` : "Select a workspace to see files."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search files"
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-2.5 text-sm outline-none"
            />
            <button
              onClick={() => selectedKbId && void fetchDocuments(selectedKbId)}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-2.5 text-sm font-semibold"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {loadingDocuments ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-brand-600)]" />
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--color-text-muted)]" />
            <h4 className="mt-4 font-display text-lg font-bold">No files yet</h4>
            <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-[var(--color-text-secondary)]">
              Upload files to this workspace and start chatting with your documents.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {filteredDocuments.map((document) => (
              <div
                key={document.id}
                className="grid gap-4 px-5 py-4 lg:grid-cols-[1.3fr_0.9fr_0.6fr_0.45fr] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{getFileIcon(document.mime_type)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                        {document.original_filename}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        {formatBytes(document.file_size)} · Uploaded {formatRelativeTime(document.created_at)}
                      </p>
                      {document.summary ? (
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                          {document.summary}
                        </p>
                      ) : null}

                      {/* ── Inline audio / video player ─────────────────── */}
                      {(document.mime_type?.startsWith("audio/") ||
                        document.mime_type?.startsWith("video/")) &&
                        document.status === "ready" && (
                          <div className="mt-3">
                            <div className="flex items-center gap-2 mb-2">
                              {document.mime_type.startsWith("audio/") ? (
                                <Music className="h-3.5 w-3.5 text-[var(--color-brand-600)]" />
                              ) : (
                                <Video className="h-3.5 w-3.5 text-[var(--color-brand-600)]" />
                              )}
                              <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
                                {document.mime_type.startsWith("audio/") ? "Audio" : "Video"} Transcript
                              </span>
                            </div>
                            {document.mime_type.startsWith("audio/") ? (
                              <audio
                                controls
                                src={`/api/v1/documents/${document.id}/stream`}
                                style={{
                                  width: "100%",
                                  height: "36px",
                                  borderRadius: "8px",
                                  accentColor: "var(--color-brand-600)",
                                }}
                              />
                            ) : (
                              <video
                                controls
                                src={`/api/v1/documents/${document.id}/stream`}
                                style={{
                                  width: "100%",
                                  maxHeight: "160px",
                                  borderRadius: "8px",
                                  background: "#000",
                                }}
                              />
                            )}
                          </div>
                        )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    <span className="font-semibold text-[var(--color-text-primary)]">
                      {document.chunk_count}
                    </span>{" "}
                    sections
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {document.page_count ? `${document.page_count} pages` : "Page count pending"}
                  </p>
                </div>

                <div>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize",
                      document.status === "ready" && "bg-emerald-500/10 text-emerald-600",
                      document.status === "processing" && "bg-amber-500/10 text-amber-600",
                      document.status === "uploaded" && "bg-blue-500/10 text-blue-600",
                      document.status === "error" && "bg-red-500/10 text-red-600"
                    )}
                  >
                    {document.status}
                  </span>
                  {document.error_message ? (
                    <p className="mt-2 text-xs text-red-600">{document.error_message}</p>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-3 lg:justify-end">
                  <Link
                    href="/dashboard/pipelines"
                    className="text-sm font-semibold text-[var(--color-brand-700)]"
                  >
                    Details
                  </Link>
                  <button
                    onClick={() => void handleDeleteDocument(document.id, document.original_filename)}
                    className="rounded-xl p-2 text-[var(--color-text-muted)] transition hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
