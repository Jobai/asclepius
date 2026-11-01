import type { ConfirmOptions } from "../contexts/ConfirmContext";
import {
  message,
  type UiMessage,
  type TermMessage,
  type TranslatedMessage,
} from "@/i18n/messages";

export const BULK_CONFIRM_THRESHOLD = 10;

export interface BulkConfirmOpts {
  count: number;
  targetLabel?: string | TermMessage | TranslatedMessage;
  action: "reprocess" | "regenerateFilename" | "merge";
  description: UiMessage;
  confirmText?: UiMessage;
  variant?: "default" | "destructive";
}

export function shouldConfirmBulk(count: number): boolean {
  return count > BULK_CONFIRM_THRESHOLD;
}

export function buildBulkConfirm(opts: BulkConfirmOpts): ConfirmOptions {
  const { count, action, description, confirmText, variant, targetLabel } =
    opts;
  return {
    title: message(
      action === "merge"
        ? "feedback.bulkMerge"
        : action === "reprocess"
          ? "feedback.bulkReprocess"
          : "feedback.bulkRegenerateFilename",
      { count, target: targetLabel ?? "" },
    ),
    description,
    confirmText,
    variant,
  };
}
