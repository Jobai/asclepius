import type { ParseKeys, TFunction } from "i18next";
import { useTranslation } from "react-i18next";

export type CommonKey = ParseKeys<"common">;
export type CommonTranslator = TFunction<"common">;
type MessageKey = ParseKeys<
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
export type UiMessage = string | TranslatedMessage;
export interface TranslatedMessage {
  key: MessageKey;
  values?: Record<string, string | number | TranslatedMessage>;
}

export function message(
  key: MessageKey,
  values?: TranslatedMessage["values"],
): TranslatedMessage {
  return { key, values };
}

export function useMessage() {
  const { t } = useTranslation([
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
