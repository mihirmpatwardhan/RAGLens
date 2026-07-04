"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { Upload, AlertCircle, FileText, X, Loader2 } from "lucide-react";
import { cn, formatBytes, getFileIcon } from "@/lib/utils";

interface FileUploadProps {
  onUpload: (files: File[]) => void;
  accept?: Record<string, string[]>;
  maxFiles?: number;
  maxSizeMB?: number;
}

export function FileUpload({
  onUpload,
  accept,
  maxFiles = 10,
  maxSizeMB = 100,
}: FileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<
    Array<{ file: File; progress: number; status: "uploading" | "done" | "error" }>
  >([]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newFiles = acceptedFiles.map((file) => ({
        file,
        progress: 0,
        status: "uploading" as const,
      }));
      setUploadedFiles((prev) => [...prev, ...newFiles]);

      // Simulate upload progress
      newFiles.forEach((f, i) => {
        let progress = 0;
        const interval = setInterval(() => {
          progress += Math.random() * 25;
          if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            setUploadedFiles((prev) =>
              prev.map((p) =>
                p.file === f.file ? { ...p, progress: 100, status: "done" as const } : p
              )
            );
          } else {
            setUploadedFiles((prev) =>
              prev.map((p) =>
                p.file === f.file ? { ...p, progress: Math.min(progress, 99) } : p
              )
            );
          }
        }, 200 + i * 100);
      });

      onUpload(acceptedFiles);
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles,
    maxSize: maxSizeMB * 1024 * 1024,
  });

  function removeFile(index: number) {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div {...getRootProps()}>
        <input {...getInputProps()} />
        <motion.div
          animate={isDragActive ? { scale: 1.02, boxShadow: "0 0 20px rgba(124, 58, 237, 0.25)" } : { scale: 1, boxShadow: "none" }}
          className={cn(
            "relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 group",
            isDragActive
              ? "border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/5"
              : "border-[var(--color-border)] hover:border-[var(--color-brand-500)]/30 hover:bg-[var(--color-surface-200)]/30"
          )}
        >
          {/* Animated gradient border when dragging */}
          {isDragActive && (
            <motion.div
              className="absolute inset-0 rounded-2xl gradient-border-animated"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            />
          )}

          <div className="relative z-10 flex flex-col items-center">
            <motion.div
              animate={isDragActive ? { y: -8, scale: 1.15 } : { y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center mb-5 transition-all duration-300 shadow-sm",
                isDragActive
                  ? "bg-[var(--color-brand-500)]/15 glow-brand"
                  : "bg-[var(--color-surface-200)] group-hover:bg-[var(--color-brand-500)]/10"
              )}
            >
              <Upload className={cn(
                "w-7 h-7 transition-colors duration-300",
                isDragActive ? "text-[var(--color-brand-400)]" : "text-[var(--color-text-muted)] group-hover:text-[var(--color-brand-400)]"
              )} />
            </motion.div>
            <p className="text-sm font-semibold mb-1.5 font-display">
              {isDragActive ? "Drop files here" : "Drag & drop files"}
            </p>
            <p className="text-xs text-[var(--color-text-muted)] font-display mt-0.5">
              or click to browse · Max {maxSizeMB}MB per file · Up to {maxFiles} files
            </p>
          </div>
        </motion.div>
      </div>

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          {uploadedFiles.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass-subtle rounded-xl p-3.5 flex items-center gap-3 border border-[var(--color-border)] shadow-sm"
            >
              <span className="text-xl flex-shrink-0">
                {getFileIcon(item.file.type)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate font-display text-[var(--color-text-primary)]">{item.file.name}</p>
                <p className="text-[10px] text-[var(--color-text-muted)] font-mono mt-0.5">
                  {formatBytes(item.file.size)}
                </p>
              </div>
              <div className="flex-shrink-0">
                {/* Circular animated progress indicator */}
                {item.status === "uploading" && (
                  <div className="relative w-6 h-6 flex items-center justify-center select-none">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-[var(--color-surface-300)]"
                        strokeWidth="3.5"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <motion.path
                        className="text-[var(--color-brand-400)]"
                        strokeWidth="3.5"
                        strokeDasharray={`${item.progress}, 100`}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        transition={{ duration: 0.2 }}
                      />
                    </svg>
                    <span className="absolute text-[7px] font-mono font-bold text-[var(--color-text-secondary)]">{Math.round(item.progress)}%</span>
                  </div>
                )}
                {/* Checkmark draw animation on success */}
                {item.status === "done" && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15 }}
                    className="text-emerald-400 flex items-center justify-center w-5 h-5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <motion.path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                      />
                    </svg>
                  </motion.div>
                )}
                {/* Shake animation on error */}
                {item.status === "error" && (
                  <motion.div
                    animate={{ x: [-4, 4, -4, 4, 0] }}
                    transition={{ duration: 0.4 }}
                    className="text-red-400"
                  >
                    <AlertCircle className="w-5 h-5" />
                  </motion.div>
                )}
              </div>
              <button
                onClick={() => removeFile(i)}
                className="p-1.5 rounded-lg hover:bg-[var(--color-surface-300)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
