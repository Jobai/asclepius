import { DOC_TYPES } from "./docTypes";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { DocumentStatus } from "@/types";
import { i18n } from "@/i18n";
import type { CommonKey, CommonTranslator } from "@/i18n/messages";

// parseBackendTs is the canonical naive-UTC ISO parser; it now lives in
// lib/datetime alongside the other timestamp helpers. Re-exported here for the
// existing call sites that import it from "@/lib/utils".
export { parseBackendTs } from "@/lib/datetime";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Document helpers (used across 5+ pages) ──────────

/**
 * Return the canonical event date from a document object.
 */
export function getBestDate(doc: {
  event_date?: string | null;
  issued_date?: string | null;
}): string {
  return doc.event_date || doc.issued_date || "";
}

/**
 * Format a YYYY-MM-DD date string for display.
 * Returns "No date" for falsy input.
 */
export function formatDate(
  s: string | null | undefined,
  locale = "en-GB",
  noDate = "No date",
): string {
  if (!s) return noDate;
  const d = new Date(s + "T00:00:00");
  if (!Number.isFinite(d.getTime())) return s;
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format doc_type for display: replace underscores with spaces.
 */
export function formatDocType(
  type: string | null | undefined,
  t: CommonTranslator = i18n.getFixedT(null, "common"),
): string {
  if (!type) return t("docTypes.unknown");
  const key = DOC_TYPE_KEYS[type];
  return key ? t(key) : type.replace(/_/g, " ");
}

const DOC_TYPE_KEYS: Record<string, CommonKey> = Object.fromEntries(
  [...DOC_TYPES, "lab_report"].map((id) => [id, `docTypes.${id}` as CommonKey]),
);

export const STATUS_KEYS: Record<string, CommonKey> = {
  completed: "status.completed",
  started: "status.started",
  skipped: "status.skipped",
  done: "status.done",
  failed: "status.failed",
  processing: "status.processing",
  pending: "status.pending",
  needs_review: "status.needs_review",
  cancelled: "status.cancelled",
};

export function statusLabel(
  status: string,
  t: CommonTranslator = i18n.getFixedT(null, "common"),
): string {
  return STATUS_KEYS[status]
    ? t(STATUS_KEYS[status])
    : status.replace(/_/g, " ");
}

// ─── Status badge styling ──────────────────────────────

const STATUS_CLASSES: Record<string, string> = {
  done: "bg-success-soft text-success",
  failed: "bg-destructive-soft text-destructive",
  processing: "bg-info-soft text-info",
  pending: "bg-muted text-muted-foreground",
  needs_review: "bg-warning-soft text-warning",
  cancelled: "bg-muted text-muted-foreground",
};

/**
 * Return Tailwind classes for a document status badge.
 */
export function getStatusClasses(status: DocumentStatus | string): string {
  return STATUS_CLASSES[status] || STATUS_CLASSES.pending;
}
