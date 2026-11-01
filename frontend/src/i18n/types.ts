export const supportedLanguages = ["en", "de"] as const;
export type UiLanguage = (typeof supportedLanguages)[number];
export type UiLanguagePreference = UiLanguage | "auto";

export const formattingLocales: Record<UiLanguage, string> = {
  en: "en-GB",
  de: "de-DE",
};
