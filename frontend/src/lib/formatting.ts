import { useTranslation } from "react-i18next";
import { formatDate, formatDocType } from "./utils";
import {
  formatDateTime,
  formatDuration,
  formatRelative,
  parseBackendTs,
} from "./datetime";
import { formattingLocales } from "@/i18n/types";

/** Explicit precision at every call site. Never parse a clinical display string. */
export function formatNumber(
  value: number,
  locale: string,
  options: Intl.NumberFormatOptions,
): string {
  return Number.isFinite(value)
    ? new Intl.NumberFormat(locale, options).format(value)
    : String(value);
}

export function formatClinicalValue(
  value: string | number | null | undefined,
  locale: string,
): string {
  if (value == null) return "";
  return typeof value === "string"
    ? value
    : formatNumber(value, locale, { maximumSignificantDigits: 21 });
}

export function formatClinicalResult(
  row: { value?: number | null; value_text?: string | null },
  locale: string,
): string {
  // Preserve original qualified/range/text results, even if a numeric value exists.
  return row.value_text
    ? row.value_text
    : row.value == null
      ? "—"
      : formatClinicalValue(row.value, locale);
}

export function useUiFormat() {
  const { t, i18n } = useTranslation("common");
  const locale =
    formattingLocales[i18n.resolvedLanguage === "de" ? "de" : "en"];
  return {
    locale,
    formatDate: (value: string | null | undefined) =>
      formatDate(value, locale, t("dates.noDate")),
    formatDocType: (value: string | null | undefined) =>
      formatDocType(value, t),
    formatDateTime: (
      value: string | null | undefined,
      options?: Intl.DateTimeFormatOptions,
    ) => formatDateTime(value, locale, options),
    formatDuration: (seconds: number) => formatDuration(seconds, locale),
    formatRelative: (
      value: string | null | undefined,
      direction: "past" | "future" = "past",
    ) =>
      formatRelative(value, direction, locale, {
        expired: t("dates.expired"),
        justNow: t("dates.justNow"),
      }),
    formatCount: (value: number) =>
      formatNumber(value, locale, { maximumFractionDigits: 0 }),
    formatClinicalValue: (value: string | number | null | undefined) =>
      formatClinicalValue(value, locale),
    formatClinicalResult: (row: {
      value?: number | null;
      value_text?: string | null;
    }) => formatClinicalResult(row, locale),
    formatTime: (value: string | null | undefined) => {
      const ms = parseBackendTs(value);
      return ms == null
        ? ""
        : new Intl.DateTimeFormat(locale, {
            hour: "2-digit",
            minute: "2-digit",
          }).format(ms);
    },
  };
}
