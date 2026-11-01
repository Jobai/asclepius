import type { UiLanguage, UiLanguagePreference } from "./types";

export const guestLanguageKeys = {
  core: "asclepius:ui-language:core",
  share: "asclepius:ui-language:share",
} as const;

export function isLanguagePreference(value: unknown): value is UiLanguagePreference {
  return value === "auto" || value === "en" || value === "de";
}

export function normalizeLanguage(value: string): UiLanguage | null {
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return base === "en" || base === "de" ? base : null;
}

/** Account auto is an explicit preference, not an absent preference. */
export function resolvePreference(
  account: unknown,
  guest: unknown,
): UiLanguagePreference {
  if (isLanguagePreference(account)) return account;
  return isLanguagePreference(guest) ? guest : "auto";
}

export function resolveLanguage(
  preference: UiLanguagePreference,
  browserLanguages: readonly string[],
): UiLanguage {
  if (preference !== "auto") return preference;
  for (const language of browserLanguages) {
    const supported = normalizeLanguage(language);
    if (supported) return supported;
  }
  return "en";
}

/** Inject the storage accessor: even accessing window.localStorage can throw. */
export function readGuestPreference(
  surface: keyof typeof guestLanguageKeys,
  storage: () => Pick<Storage, "getItem">,
): UiLanguagePreference {
  try {
    const value = storage().getItem(guestLanguageKeys[surface]);
    return isLanguagePreference(value) ? value : "auto";
  } catch {
    return "auto";
  }
}
