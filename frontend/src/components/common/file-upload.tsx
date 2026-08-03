"use client";

import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useDropzone, type FileRejection } from "react-dropzone";
import { AlertCircle, CheckCircle2, Loader2, Upload, X } from "lucide-react";
import { cn, formatBytes, getFileIcon } from "@/lib/utils";

type UploadItemStatus = "uploading" | "done" | "error";

interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: UploadItemStatus;
  error?: string;
}

interface FileUploadProps {
  onUpload: (file: File, onProgress: (progress: number) => void) => Promise<void>;
  accept?: Record<string, string[]>;
  maxFiles?: number;
  maxSizeMB?: number;
  helperText?: string;
}

function getUploadError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Upload failed";
}

function formatMB(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

function rejectionMessage(rejection: FileRejection, maxSizeMB: number) {
  for (const error of rejection.errors) {
    if (error.code === "file-too-large")
      return `File too large — max is ${maxSizeMB}MB (your file: ${formatMB(rejection.file.size)})`;
    if (error.code === "too-many-files") return "Too many files — upload one at a time or reduce batch size";
    if (error.code === "file-invalid-type")
      return `Unsupported file type: ${rejection.file.type || rejection.file.name.split(".").pop()}`;
  }
  return rejection.errors[0]?.message || "File was rejected";
}


export function FileUpload({
  onUpload,
  accept,
  maxFiles = 10,
  maxSizeMB = 100,
  helperText,
}: FileUploadProps) {
  const [items, setItems] = useState<UploadItem[]>([]);

  const acceptedLabel = useMemo(
    () => helperText || `Click to browse or drop files here · Max ${maxSizeMB}MB each · Up to ${maxFiles} files`,
    [helperText, maxFiles, maxSizeMB]
  );

  const updateItem = useCallback((id: string, updater: (item: UploadItem) => UploadItem) => {
    setItems((current) => current.map((item) => (item.id === id ? updater(item) : item)));
  }, []);

  const startUpload = useCallback(
    async (file: File) => {
      const id = crypto.randomUUID();
      setItems((current) => [
        {
          id,
          file,
          progress: 0,
          status: "uploading",
        },
        ...current,
      ]);

      try {
        await onUpload(file, (progress) => {
          updateItem(id, (item) => ({
            ...item,
            progress: Math.min(100, Math.max(progress, item.progress)),
          }));
        });

        updateItem(id, (item) => ({
          ...item,
          progress: 100,
          status: "done",
        }));
      } catch (error) {
        updateItem(id, (item) => ({
          ...item,
          progress: item.progress || 100,
          status: "error",
          error: getUploadError(error),
        }));
      }
    },
    [onUpload, updateItem]
  );

  const onDropAccepted = useCallback(
    (acceptedFiles: File[]) => {
      for (const file of acceptedFiles) {
        void startUpload(file);
      }
    },
    [startUpload]
  );

  const onDropRejected = useCallback((fileRejections: FileRejection[]) => {
    setItems((current) => [
      ...fileRejections.map(({ file, errors }) => ({
        id: crypto.randomUUID(),
        file,
        progress: 100,
        status: "error" as const,
        error: errors[0]?.message || rejectionMessage({ file, errors }, maxSizeMB),
      })),
      ...current,
    ]);
  }, [maxSizeMB]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    maxFiles,
    maxSize: maxSizeMB * 1024 * 1024,
    onDropAccepted,
    onDropRejected,
  });

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-4">
      <div {...getRootProps()}>
        <input {...getInputProps()} />
        <motion.div
          animate={
            isDragActive
              ? { scale: 1.01, boxShadow: "0 0 24px rgba(245, 158, 11, 0.18)" }
              : { scale: 1, boxShadow: "none" }
          }
          className={cn(
            "relative cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300",
            isDragActive
              ? "border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/5"
              : "border-[var(--color-border)] hover:border-[var(--color-brand-500)]/30 hover:bg-[var(--color-surface-200)]/30"
          )}
        >
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "mb-5 flex h-16 w-16 items-center justify-center rounded-2xl transition-all",
                isDragActive
                  ? "bg-[var(--color-brand-500)]/15"
                  : "bg-[var(--color-surface-200)]"
              )}
            >
              <Upload
                className={cn(
                  "h-7 w-7 transition-colors",
                  isDragActive
                    ? "text-[var(--color-brand-500)]"
                    : "text-[var(--color-text-muted)]"
                )}
              />
            </div>
            <p className="font-display text-sm font-semibold">
              {isDragActive ? "Drop files here" : "Drag and drop files"}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">{acceptedLabel}</p>
          </div>
        </motion.div>
      </div>

      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-50)] p-3.5 shadow-sm"
            >
              <span className="text-xl">{getFileIcon(item.file.type)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                    {item.file.name}
                  </p>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {formatBytes(item.file.size)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-200)]">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      item.status === "done" && "bg-emerald-500",
                      item.status === "error" && "bg-red-500",
                      item.status === "uploading" && "bg-[var(--color-brand-500)]"
                    )}
                    style={{ width: `${Math.min(100, Math.max(item.progress, item.status === "error" ? 100 : 4))}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {item.status === "uploading" && `${Math.round(item.progress)}% uploaded`}
                  {item.status === "done" && "Uploaded successfully"}
                  {item.status === "error" && item.error}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {item.status === "uploading" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--color-brand-500)]" />
                ) : null}
                {item.status === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : null}
                {item.status === "error" ? (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                ) : null}
                <button
                  onClick={() => removeItem(item.id)}
                  className="rounded-lg p-1.5 text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-200)] hover:text-[var(--color-text-primary)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
