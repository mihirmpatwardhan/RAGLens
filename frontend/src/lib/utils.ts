import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes with conflict resolution.
 * Usage: cn("bg-red-500", conditional && "bg-blue-500")
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format number with commas.
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num);
}

/**
 * Format milliseconds to human-readable duration.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

/**
 * Format a date to relative time (e.g., "2 hours ago").
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

/**
 * Truncate a string to a maximum length.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Generate a random color from the brand palette.
 */
export const BRAND_COLORS = [
  "#6366f1", "#8b5cf6", "#a78bfa", "#06b6d4",
  "#14b8a6", "#22c55e", "#f59e0b", "#ef4444",
  "#ec4899", "#f97316",
];

export function getRandomColor(): string {
  return BRAND_COLORS[Math.floor(Math.random() * BRAND_COLORS.length)];
}

/**
 * File type to icon mapping.
 */
export function getFileIcon(mimeType: string): string {
  if (mimeType.includes("pdf")) return "📄";
  if (mimeType.includes("word") || mimeType.includes("document")) return "📝";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "📊";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "📽️";
  if (mimeType.includes("image")) return "🖼️";
  if (mimeType.includes("audio")) return "🎵";
  if (mimeType.includes("video")) return "🎬";
  if (mimeType.includes("json")) return "📋";
  if (mimeType.includes("html")) return "🌐";
  if (mimeType.includes("markdown") || mimeType.includes("text")) return "📃";
  if (mimeType.includes("zip") || mimeType.includes("archive")) return "📦";
  return "📎";
}
