"use client";

import { useState, useEffect, useRef } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  Search,
  ShieldCheck,
  ShieldX,
  Sparkles,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiClient, getErrorMessage } from "@/lib/api-client";
import type { KnowledgeBase } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkflowStatus = "idle" | "running" | "pending_approval" | "completed" | "error";

type Chunk = {
  id?: string;
  document_name?: string;
  page_number?: number;
  score?: number;
  content?: string;
  content_type?: string;
};

type WorkflowResult = {
  thread_id: string;
  status: string;
  response: string;
  logs: string[];
  chunks: Chunk[];
  critic_feedback: string;
  critic_confidence: number;
  pending_approval: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function confidenceBadge(score: number) {
  const pct = Math.round(score * 100);
  if (score >= 0.6) return { label: `${pct}% confident`, color: "var(--color-brand-600)", bg: "var(--color-brand-600)/10" };
  if (score >= 0.3) return { label: `${pct}% confidence`, color: "#f59e0b", bg: "#f59e0b20" };
  return { label: `${pct}% low`, color: "#ef4444", bg: "#ef444420" };
}

function StatusPill({ status }: { status: WorkflowStatus }) {
  const map: Record<WorkflowStatus, { icon: React.ReactNode; label: string; cls: string }> = {
    idle: { icon: null, label: "Idle", cls: "text-[var(--color-text-muted)]" },
    running: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      label: "Running",
      cls: "text-[var(--color-brand-600)]",
    },
    pending_approval: {
      icon: <Clock className="h-3.5 w-3.5" />,
      label: "Pending Review",
      cls: "text-amber-500",
    },
    completed: {
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      label: "Completed",
      cls: "text-emerald-500",
    },
    error: { icon: <XCircle className="h-3.5 w-3.5" />, label: "Error", cls: "text-red-500" },
  };
  const s = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${s.cls}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [query, setQuery] = useState("");
  const [kbId, setKbId] = useState("");
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [uiStatus, setUiStatus] = useState<WorkflowStatus>("idle");
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs panel
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [result?.logs]);

  useEffect(() => {
    void apiClient
      .get<{ items: KnowledgeBase[] }>("/knowledge-bases?page_size=100")
      .then(({ data }) => {
        setKnowledgeBases(data.items ?? []);
        setKbId((current) => current || data.items?.[0]?.id || "");
      })
      .catch((error) => toast.error(getErrorMessage(error)));
  }, []);

  async function handleRun() {
    if (!query.trim()) {
      toast.error("Enter a question first.");
      return;
    }
    if (!kbId) {
      toast.error("Select a workspace before running the agent.");
      return;
    }

    setUiStatus("running");
    setResult(null);

    try {
      const { data } = await apiClient.post<WorkflowResult>("/agents/run", {
        query: query.trim(),
        kb_id: kbId.trim() || null,
      });

      setResult(data);
      setUiStatus(data.pending_approval ? "pending_approval" : "completed");

      if (data.pending_approval) {
        toast("🔍 Critic flagged low confidence — review needed.", { icon: "⚠️" });
      } else {
        toast.success("Workflow completed.");
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
      setUiStatus("error");
    }
  }

  async function handleApprove() {
    if (!result?.thread_id) return;
    setApproving(true);
    try {
      const { data } = await apiClient.post<WorkflowResult>(
        `/agents/${result.thread_id}/approve`,
      );
      setResult(data);
      setUiStatus("completed");
      toast.success("Approved — response generated.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    if (!result?.thread_id) return;
    setRejecting(true);
    try {
      const { data } = await apiClient.post<WorkflowResult>(
        `/agents/${result.thread_id}/reject`,
      );
      setResult(data);
      setUiStatus("completed");
      toast("Context rejected — fallback response returned.", { icon: "🚫" });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setRejecting(false);
    }
  }

  const badge = result ? confidenceBadge(result.critic_confidence) : null;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
          Orchestration
        </p>
        <h2 className="font-display text-3xl font-bold">Multi-agent runner</h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-secondary)]">
          Persistent LangGraph workflow: rewrite → retrieve → critic →{" "}
          <span className="font-semibold text-amber-500">HITL review</span> → generate.
          State is checkpointed to Postgres so every run is resumable.
        </p>
      </div>

      {/* Query Input */}
      <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-6 shadow-sm">
        <label className="mb-3 block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Agent query
        </label>

        <div className="mb-3 flex gap-3">
          <select
            id="agent-workspace-select"
            value={kbId}
            onChange={(e) => setKbId(e.target.value)}
            className="w-64 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-2.5 text-sm outline-none transition focus:border-[var(--color-brand-500)]"
          >
            <option value="">Select workspace</option>
            {knowledgeBases.map((kb) => (
              <option key={kb.id} value={kb.id}>{kb.icon} {kb.name}</option>
            ))}
          </select>
          <div className="flex-1" />
          <StatusPill status={uiStatus} />
        </div>

        <div className="flex flex-col gap-3 lg:flex-row">
          <textarea
            id="agent-query-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={3}
            placeholder="Ask a complex research question — the coordinator, retriever, critic, and generator will collaborate."
            className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-brand-500)]"
          />
          <button
            id="agent-run-btn"
            onClick={() => void handleRun()}
            disabled={uiStatus === "running"}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-600)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-700)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uiStatus === "running" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Run workflow
          </button>
        </div>
      </div>

      {/* HITL Review Banner */}
      {result?.pending_approval && uiStatus === "pending_approval" ? (
        <div className="rounded-3xl border border-amber-400/40 bg-amber-400/5 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-400/10">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-display text-lg font-bold text-amber-500">
                Human review required
              </h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                The <strong>CriticAgent</strong> flagged the retrieved context as potentially
                low-relevance (confidence{" "}
                <span className="font-mono font-semibold text-amber-500">
                  {Math.round((result.critic_confidence ?? 0) * 100)}%
                </span>
                ). Review the chunks below, then approve or reject to continue.
              </p>

              {result.critic_feedback ? (
                <p className="mt-2 rounded-xl bg-[var(--color-surface-0)] px-3 py-2 text-xs font-mono text-[var(--color-text-muted)]">
                  critic_feedback: {result.critic_feedback}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  id="agent-approve-btn"
                  onClick={() => void handleApprove()}
                  disabled={approving || rejecting}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {approving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Approve &amp; generate
                </button>
                <button
                  id="agent-reject-btn"
                  onClick={() => void handleReject()}
                  disabled={approving || rejecting}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-500 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {rejecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldX className="h-4 w-4" />
                  )}
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Results Grid */}
      {result ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          {/* Left: Response + Thread Info */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-[var(--color-brand-600)]" />
                  <h3 className="font-display text-lg font-bold">Final response</h3>
                </div>
                {badge ? (
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{ color: badge.color, backgroundColor: badge.bg }}
                  >
                    {badge.label}
                  </span>
                ) : null}
              </div>

              {result.response ? (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[var(--color-text-secondary)]">
                  {result.response}
                </p>
              ) : (
                <p className="mt-4 text-sm italic text-[var(--color-text-muted)]">
                  Awaiting human approval to generate the response…
                </p>
              )}
            </div>

            {/* Thread metadata */}
            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-5 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Workflow metadata
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { label: "Thread ID", value: result.thread_id },
                  { label: "Status", value: result.status },
                  { label: "Critic verdict", value: result.critic_feedback || "—" },
                  {
                    label: "Confidence",
                    value: `${Math.round((result.critic_confidence ?? 0) * 100)}%`,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-3"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      {item.label}
                    </p>
                    <p className="mt-1 truncate font-mono text-xs text-[var(--color-text-primary)]">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Chunks + Logs */}
          <div className="space-y-6">
            {/* Retrieved chunks */}
            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Search className="h-5 w-5 text-[var(--color-brand-600)]" />
                <h3 className="font-display text-lg font-bold">Retrieved chunks</h3>
                <span className="ml-auto rounded-full bg-[var(--color-surface-0)] px-2.5 py-0.5 text-xs font-semibold">
                  {result.chunks.length}
                </span>
              </div>

              <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
                {result.chunks.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-secondary)]">No chunks returned.</p>
                ) : (
                  result.chunks.map((chunk, index) => (
                    <div
                      key={`${chunk.id ?? index}-${index}`}
                      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                          {chunk.document_name ?? `Chunk ${index + 1}`}
                        </p>
                        <div className="flex flex-shrink-0 gap-1.5">
                          {chunk.content_type && chunk.content_type !== "text" ? (
                            <span className="rounded-full bg-[var(--color-brand-600)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--color-brand-600)]">
                              {chunk.content_type}
                            </span>
                          ) : null}
                          {typeof chunk.score === "number" ? (
                            <span className="text-xs text-[var(--color-text-muted)]">
                              {(chunk.score * 100).toFixed(0)}%
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {chunk.content ? (
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                          {chunk.content}
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Execution log */}
            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[var(--color-brand-600)]" />
                <h3 className="font-display text-lg font-bold">Execution log</h3>
              </div>
              <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                {result.logs.map((log, index) => (
                  <div
                    key={`${log.slice(0, 20)}-${index}`}
                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-2.5 text-sm text-[var(--color-text-secondary)]"
                  >
                    {log}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
