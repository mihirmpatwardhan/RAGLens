"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Database,
  Files,
  Loader2,
  MessageSquareText,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiClient, getErrorMessage } from "@/lib/api-client";
import { formatBytes, formatNumber, formatRelativeTime } from "@/lib/utils";
import type { KnowledgeBase } from "@/types";

const ICON_OPTIONS = ["📚", "🧠", "📁", "🧾", "⚡", "🔎"];
const COLOR_OPTIONS = ["#8b5cf6", "#14b8a6", "#34d399", "#f59e0b", "#f97316", "#ec4899"];

export default function KnowledgePage() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    icon: ICON_OPTIONS[0],
    color: COLOR_OPTIONS[0],
  });

  const activeKb = useMemo(
    () => knowledgeBases.find((kb) => kb.id === selectedKbId) || null,
    [knowledgeBases, selectedKbId]
  );

  async function fetchKnowledgeBases() {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/knowledge-bases");
      const items = data.items || [];
      setKnowledgeBases(items);
      setSelectedKbId((current) => current || items[0]?.id || "");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setTimeout(() => {
      void fetchKnowledgeBases();
    }, 0);
  }, []);

  async function handleCreateKnowledgeBase() {
    if (!form.name.trim()) {
              toast.error("Workspace name is required.");
      return;
    }

    setCreating(true);
    try {
      const { data } = await apiClient.post("/knowledge-bases", {
        name: form.name.trim(),
        description: form.description.trim() || null,
        icon: form.icon,
        color: form.color,
      });

      setKnowledgeBases((current) => [data, ...current]);
      setSelectedKbId(data.id);
      setCreateOpen(false);
      setForm({
        name: "",
        description: "",
        icon: ICON_OPTIONS[0],
        color: COLOR_OPTIONS[0],
      });
      toast.success("Workspace created!");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteKnowledgeBase(id: string, name: string) {
    if (!confirm(`Delete "${name}" and all its documents?`)) return;

    try {
      await apiClient.delete(`/knowledge-bases/${id}`);
      const nextItems = knowledgeBases.filter((kb) => kb.id !== id);
      setKnowledgeBases(nextItems);
      setSelectedKbId(nextItems[0]?.id || "");
      toast.success("Workspace deleted.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
            Your workspaces
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-[var(--color-text-primary)]">
            My Workspaces
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-secondary)]">
            Create a workspace for each topic, project, or team. Upload files into each one and ask questions from those documents.
          </p>
        </div>

        <button
          onClick={() => setCreateOpen((current) => !current)}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-brand-700)]"
        >
          <Plus className="h-4 w-4" />
          {createOpen ? "Close" : "New Workspace"}
        </button>
      </div>

      {createOpen ? (
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-6 shadow-sm">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Name
                </label>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Customer support knowledge"
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-brand-500)]"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  rows={4}
                  placeholder="What kind of documents and questions belong in this workspace?"
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-brand-500)]"
                />
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Icon
                </p>
                <div className="flex flex-wrap gap-2">
                  {ICON_OPTIONS.map((icon) => (
                    <button
                      key={icon}
                      onClick={() => setForm((current) => ({ ...current, icon }))}
                      className={`rounded-2xl border px-4 py-3 text-xl transition ${
                        form.icon === icon
                          ? "border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10"
                          : "border-[var(--color-border)] bg-[var(--color-surface-0)]"
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Color
                </p>
                <div className="flex flex-wrap gap-3">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setForm((current) => ({ ...current, color }))}
                      className={`h-10 w-10 rounded-full border-2 transition ${
                        form.color === color
                          ? "border-white ring-2 ring-[var(--color-brand-500)]"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={handleCreateKnowledgeBase}
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-700)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Create workspace
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)]">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--color-brand-600)]" />
        </div>
      ) : knowledgeBases.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-50)] p-10 text-center">
          <Database className="mx-auto h-10 w-10 text-[var(--color-text-muted)]" />
          <h3 className="mt-4 font-display text-xl font-bold text-[var(--color-text-primary)]">
            Create your first workspace
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-[var(--color-text-secondary)]">
            Start with a new workspace, upload your files, and then ask questions from those documents.
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            New Workspace
          </button>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-4 md:grid-cols-2">
            {knowledgeBases.map((kb, index) => {
              const active = kb.id === selectedKbId;

              return (
                <motion.div
                  key={kb.id}
                  role="button"
                  tabIndex={0}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  onClick={() => setSelectedKbId(kb.id)}
                  className={`rounded-3xl border p-5 text-left shadow-sm transition ${
                    active
                      ? "border-[var(--color-brand-500)]/40 bg-[var(--color-surface-50)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-50)] hover:border-[var(--color-brand-500)]/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl"
                        style={{ backgroundColor: `${kb.color}20` }}
                      >
                        {kb.icon}
                      </div>
                      <div>
                        <p className="font-display text-lg font-bold text-[var(--color-text-primary)]">
                          {kb.name}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          Updated {formatRelativeTime(kb.updated_at)}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteKnowledgeBase(kb.id, kb.name);
                      }}
                      className="rounded-xl p-2 text-[var(--color-text-muted)] transition hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="mt-4 min-h-[48px] text-sm leading-6 text-[var(--color-text-secondary)]">
                    {kb.description || "No description yet. Use this workspace to keep related files and answers together."}
                  </p>

                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-[var(--color-surface-0)] px-3 py-3">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                        Files
                      </p>
                      <p className="mt-1 text-sm font-semibold">{formatNumber(kb.document_count)}</p>
                    </div>
                    <div className="rounded-2xl bg-[var(--color-surface-0)] px-3 py-3">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                        Sections
                      </p>
                      <p className="mt-1 text-sm font-semibold">{formatNumber(kb.chunk_count)}</p>
                    </div>
                    <div className="rounded-2xl bg-[var(--color-surface-0)] px-3 py-3">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                        Storage
                      </p>
                      <p className="mt-1 text-sm font-semibold">{formatBytes(kb.storage_bytes)}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-6 shadow-sm">
            {activeKb ? (
              <>
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl"
                    style={{ backgroundColor: `${activeKb.color}20` }}
                  >
                    {activeKb.icon}
                  </div>
                  <div>
                    <p className="font-display text-xl font-bold">{activeKb.name}</p>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      {activeKb.description || "Upload your files into this workspace and start chatting with them."}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3">
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      AI Model
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-primary)]">
                      {activeKb.settings?.llm_model || "Default AI model"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      Workspace settings
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      Everything is automatically configured for best results. No setup needed.
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/dashboard/documents"
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    <Files className="h-4 w-4" />
                    Open documents
                  </Link>
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-2.5 text-sm font-semibold"
                  >
                    <MessageSquareText className="h-4 w-4" />
                    Open chat
                  </Link>
                </div>

                <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                    <BookOpen className="h-4 w-4 text-[var(--color-brand-600)]" />
                    How it works
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-[var(--color-text-secondary)]">
                    <p>1. Upload your files in the Files tab.</p>
                    <p>2. Wait a moment while we read through them.</p>
                    <p>3. Go to Chat and ask questions from your files.</p>
                  </div>
                  <Link
                    href="/dashboard/documents"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-brand-700)]"
                  >
                    Go to My Files <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
