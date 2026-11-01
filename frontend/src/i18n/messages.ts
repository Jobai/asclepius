import type { ParseKeys, TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  preferredTermName,
  type NamedTerm,
  type TermDisplayNames,
} from "@/lib/terminology";

export type CommonKey = ParseKeys<"common">;
export type CommonTranslator = TFunction<"common">;
export type MessageKey = ParseKeys<
  [
    "common",
    "auth",
    "documents",
    "patients",
    "clinical",
    "settings",
    "share",
    "errors",
  ]
>;

/** Strings remain literal for server/user content; descriptors translate at render. */
export type UiMessage = string | TranslatedMessage | MessageList | TermMessage;
export interface TermMessage {
  term: {
    names?: TermDisplayNames;
    canonical?: string | null;
    original?: string | null;
  };
}
export interface MessageList {
  messages: UiMessage[];
}
export interface TranslatedMessage {
  key: MessageKey;
  values?: Record<string, string | number | TranslatedMessage | TermMessage>;
}

/** Keep names bilingual while a confirmation or modal remains open. */
export function termMessage(
  term: NamedTerm | null | undefined,
  fallback = "",
): TermMessage {
  return {
    term: {
      names: term?.display_names,
      canonical: term?.canonical_display,
      original: term?.name || term?.canonical_code || fallback,
    },
  };
}

export function message(
  key: MessageKey,
  values?: TranslatedMessage["values"],
): TranslatedMessage {
  return { key, values };
}

export function useMessage() {
  const { t, i18n } = useTranslation([
    "common",
    "auth",
    "documents",
    "patients",
    "clinical",
    "settings",
    "share",
    "errors",
  ]);
  const resolve = (value: UiMessage | undefined): string => {
    if (value === undefined) return "";
    if (typeof value === "string") return value;
    if ("messages" in value) return value.messages.map(resolve).join("; ");
    if ("term" in value)
      return preferredTermName(
        value.term.names,
        value.term.canonical,
        value.term.original,
        i18n.resolvedLanguage,
      );
    const values = Object.fromEntries(
      Object.entries(value.values ?? {}).map(([key, value]) => [
        key,
        typeof value === "object" ? resolve(value) : value,
      ]),
    );
    return t(value.key, values);
  };
  return resolve;
}
