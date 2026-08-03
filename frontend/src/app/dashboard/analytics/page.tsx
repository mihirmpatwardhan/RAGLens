"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Database, Loader2, MessageSquareText, RefreshCw, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { apiClient, getErrorMessage } from "@/lib/api-client";
import { formatBytes, formatNumber } from "@/lib/utils";
import type { AnalyticsOverview } from "@/types";

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadOverview();
  }, []);

  async function loadOverview() {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/analytics/overview");
      setOverview(data);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const cards = useMemo(() => {
    if (!overview) return [];
    return [
      {
        label: "Workspaces",
        value: formatNumber(overview.total_knowledge_bases),
        helper: `${formatNumber(overview.total_documents)} files uploaded`,
      },
      {
        label: "Searchable sections",
        value: formatNumber(overview.total_chunks),
        helper: `Extracted from your files`,
      },
      {
        label: "Conversations",
        value: formatNumber(overview.total_conversations),
        helper: `${formatNumber(overview.total_messages)} total messages`,
      },
      {
        label: "Storage",
        value: formatBytes(overview.storage_used_bytes),
        helper: `${formatNumber(overview.total_tokens_used)} tokens processed`,
      },
      {
        label: "Queries today",
        value: formatNumber(overview.queries_today),
        helper: `${formatNumber(overview.queries_this_week)} this week`,
      },
      {
        label: "Avg latency",
        value: `${Math.round(overview.avg_query_latency_ms)}ms`,
        helper: "Assistant message average",
      },
      {
        label: "Success rate",
        value: `${Math.round(overview.success_rate * 100)}%`,
        helper: "Non-empty assistant responses",
      },
      {
        label: "Total cost",
        value: `$${overview.total_cost.toFixed(2)}`,
        helper: "Accumulated assistant cost",
      },
    ];
  }, [overview]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
            Observability
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold">Workspace analytics</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-secondary)]">
            Live totals from your own workspace. No fake traffic, no demo numbers.
          </p>
        </div>

        <button
          onClick={() => void loadOverview()}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-50)] px-4 py-2.5 text-sm font-semibold"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)]">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--color-brand-600)]" />
        </div>
      ) : !overview ? null : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-4 shadow-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {card.label}
                </p>
                <p className="mt-3 font-display text-3xl font-bold text-[var(--color-text-primary)]">
                  {card.value}
                </p>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{card.helper}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-[var(--color-brand-600)]" />
                <h3 className="font-display text-lg font-bold">Content health</h3>
              </div>
              <div className="mt-5 space-y-4 text-sm text-[var(--color-text-secondary)]">
                <p>
                  {overview.total_documents === 0
                    ? "No files have been uploaded yet."
                    : `${formatNumber(overview.total_documents)} files uploaded across ${formatNumber(overview.total_knowledge_bases)} workspaces.`}
                </p>
                <p>{formatBytes(overview.storage_used_bytes)} of storage is in use.</p>
                <p>{formatNumber(overview.total_chunks)} sections from your files are ready to search.</p>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-5 w-5 text-[var(--color-brand-600)]" />
                <h3 className="font-display text-lg font-bold">Usage</h3>
              </div>
              <div className="mt-5 space-y-4 text-sm text-[var(--color-text-secondary)]">
                <p>{formatNumber(overview.queries_today)} user questions arrived today.</p>
                <p>{formatNumber(overview.queries_this_week)} user questions arrived this week.</p>
                <p>{formatNumber(overview.total_messages)} total messages are stored in conversation history.</p>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[var(--color-brand-600)]" />
                <h3 className="font-display text-lg font-bold">Response quality</h3>
              </div>
              <div className="mt-5 space-y-4 text-sm text-[var(--color-text-secondary)]">
                <p>
                  Success rate currently sits at <strong>{Math.round(overview.success_rate * 100)}%</strong>.
                </p>
                <p>
                  Assistant latency averages <strong>{Math.round(overview.avg_query_latency_ms)}ms</strong>.
                </p>
                <p>
                  Accumulated assistant cost is <strong>${overview.total_cost.toFixed(2)}</strong>.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-[var(--color-brand-600)]" />
              <h3 className="font-display text-lg font-bold">What changed</h3>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-text-secondary)]">
              This analytics view now reads directly from FastAPI and the database. It reflects only
              your own uploaded content, conversation traffic, and assistant responses.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
