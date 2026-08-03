import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const unit = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(Math.log(bytes) / Math.log(unit));
  return `${parseFloat((bytes / Math.pow(unit, index)).toFixed(decimals))} ${sizes[index]}`;
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const target = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - target.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return target.toLocaleDateString();
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
}

export const BRAND_COLORS = [
  "#f59e0b",
  "#d97706",
  "#fbbf24",
  "#06b6d4",
  "#22d3ee",
  "#34d399",
  "#e879f9",
  "#ef4444",
  "#d946ef",
  "#f97316",
];

export function getRandomColor(): string {
  return BRAND_COLORS[Math.floor(Math.random() * BRAND_COLORS.length)];
}

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
