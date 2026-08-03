"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { apiClient, getErrorMessage } from "@/lib/api-client";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { RecentPipelineRun } from "@/types";

export default function PipelinesPage() {
  const [runs, setRuns] = useState<RecentPipelineRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadRuns();
  }, []);

  async function loadRuns() {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/documents/pipeline-runs/recent");
      setRuns(data.items || []);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const counts = useMemo(
    () => ({
      running: runs.filter((run) => run.status === "running").length,
      completed: runs.filter((run) => run.status === "completed").length,
      failed: runs.filter((run) => run.status === "failed").length,
    }),
    [runs]
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
            Background tasks
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold">Workflows</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-secondary)]">
            See the status of file processing jobs. Each entry shows what happened when you uploaded a file.
          </p>
        </div>

        <button
          onClick={() => void loadRuns()}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-50)] px-4 py-2.5 text-sm font-semibold"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Running", value: counts.running, tone: "bg-amber-500/10 text-amber-600" },
          { label: "Completed", value: counts.completed, tone: "bg-emerald-500/10 text-emerald-600" },
          { label: "Failed", value: counts.failed, tone: "bg-red-500/10 text-red-600" },
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
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)]">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--color-brand-600)]" />
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-50)] p-10 text-center">
          <h3 className="font-display text-xl font-bold">No tasks yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-[var(--color-text-secondary)]">
            Upload a file first and this page will automatically show the processing status.
          </p>
          <Link
            href="/dashboard/documents"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Upload files
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {runs.map((run) => {
            const completedStages = Object.values(run.stages || {}).filter(
              (stage) => stage.status === "completed"
            ).length;
            const totalStages = Object.keys(run.stages || {}).length;

            return (
              <div
                key={run.id}
                className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-display text-lg font-bold text-[var(--color-text-primary)]">
                      {run.document_name}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      {run.knowledge_base_name} · Started {formatRelativeTime(run.created_at)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold capitalize",
                        run.status === "completed" && "bg-emerald-500/10 text-emerald-600",
                        run.status === "running" && "bg-amber-500/10 text-amber-600",
                        run.status === "failed" && "bg-red-500/10 text-red-600",
                        run.status === "pending" && "bg-blue-500/10 text-blue-600"
                      )}
                    >
                      {run.status}
                    </span>
                    <span className="rounded-full bg-[var(--color-surface-0)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                      {run.document_status}
                    </span>
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-full bg-[var(--color-surface-100)]">
                  <div
                    className={cn(
                      "h-2 rounded-full transition-all",
                      run.status === "completed" && "bg-emerald-500",
                      run.status === "running" && "bg-[var(--color-brand-600)]",
                      run.status === "failed" && "bg-red-500",
                      run.status === "pending" && "bg-blue-500"
                    )}
                    style={{ width: `${Math.max(run.progress, run.status === "failed" ? 100 : 4)}%` }}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-[var(--color-text-secondary)]">
                  <span>{Math.round(run.progress)}% complete</span>
                  <span>
                    {completedStages}/{totalStages} stages finished
                  </span>
                  <span>{run.total_chunks} chunks</span>
                  <span>{run.total_embeddings} embeddings</span>
                </div>

                {run.current_stage ? (
                  <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                    Current stage: <strong className="text-[var(--color-text-primary)]">{run.current_stage}</strong>
                  </p>
                ) : null}

                {run.error_message ? (
                  <p className="mt-3 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-600">
                    {run.error_message}
                  </p>
                ) : null}

                {totalStages > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {Object.entries(run.stages).map(([stageId, stage]) => (
                      <span
                        key={stageId}
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-semibold",
                          stage.status === "completed" && "bg-emerald-500/10 text-emerald-600",
                          stage.status === "running" && "bg-amber-500/10 text-amber-600",
                          stage.status === "failed" && "bg-red-500/10 text-red-600",
                          stage.status === "pending" && "bg-[var(--color-surface-0)] text-[var(--color-text-secondary)]"
                        )}
                      >
                        {stage.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
