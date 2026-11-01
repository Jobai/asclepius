import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { defaultNS, resources } from "./resources";
import { supportedLanguages, type UiLanguage } from "./types";

/** Bundled resources initialize synchronously, with no detection/backend plugins. */
export function createUiI18n(language: UiLanguage = "en") {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    resources: structuredClone(resources),
    lng: language,
    fallbackLng: "en",
    supportedLngs: [...supportedLanguages],
    defaultNS,
    ns: Object.keys(resources.en),
    initAsync: false,
    returnNull: false,
    // React escapes interpolated text. Never render translation output as raw HTML.
    interpolation: { escapeValue: false },
  });
  return instance;
}

export const i18n = createUiI18n();
