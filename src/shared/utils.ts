import type { Severity, StatusLabel } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getStatusLabel(score: number): Exclude<StatusLabel, "Unavailable"> {
  if (score < 40) {
    return "Poor";
  }
  if (score < 60) {
    return "Fair";
  }
  if (score < 80) {
    return "Good";
  }
  return "Excellent";
}

export function severityRank(level: Severity): number {
  if (level === "High") {
    return 0;
  }
  if (level === "Medium") {
    return 1;
  }
  return 2;
}

export function createReportId(prefix: string): string {
  const entropy = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now()}_${entropy}`;
}

export function countWords(text: string): number {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return 0;
  }
  return normalized.split(" ").length;
}

export function countSentences(text: string): number {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return 0;
  }
  const parts = normalized.split(/[.!?]+/).map((segment) => segment.trim()).filter(Boolean);
  return parts.length;
}

export function formatTimestampForFilename(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}${m}${d}-${hh}${mm}`;
}

export function domainFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return "report";
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function isRestrictedBrowserPage(url: string): boolean {
  return /^(chrome|edge|about|moz-extension|chrome-extension|view-source):/i.test(url);
}
