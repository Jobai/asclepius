import { describe, expect, it } from "vitest";
import {
  guestLanguageKeys, normalizeLanguage, readGuestPreference,
  resolveLanguage, resolvePreference,
} from "./preferences";

describe("language resolution", () => {
  it.each(["de", "de-DE", "de-AT", "de-CH", " DE_ch "])("normalizes %s", (value) => {
    expect(normalizeLanguage(value)).toBe("de");
  });
  it("walks browser preferences in order and falls back to English", () => {
    expect(resolveLanguage("auto", ["fr", "de-AT", "en-GB"])).toBe("de");
    expect(resolveLanguage("auto", ["en-US", "de"])).toBe("en");
    expect(resolveLanguage("auto", ["fr", "es"])).toBe("en");
    expect(resolveLanguage("auto", [])).toBe("en");
    expect(normalizeLanguage("invalid")).toBeNull();
  });
  it("honors explicit preferences, including account auto", () => {
    expect(resolveLanguage("en", ["de"])).toBe("en");
    expect(resolveLanguage("de", ["en"])).toBe("de");
    expect(resolvePreference("auto", "de")).toBe("auto");
    expect(resolvePreference("en", "de")).toBe("en");
    expect(resolvePreference(null, "de")).toBe("de");
    expect(resolvePreference("invalid", null)).toBe("auto");
  });
});

describe("guest storage", () => {
  it("keeps core and share preferences separate without writing", () => {
    const storage = { getItem: (key: string) => key === guestLanguageKeys.core ? "de" : "en" };
    expect(readGuestPreference("core", () => storage)).toBe("de");
    expect(readGuestPreference("share", () => storage)).toBe("en");
  });
  it.each([null, "garbage", '"de"', "{broken"])("ignores invalid storage %s", (value) => {
    expect(readGuestPreference("core", () => ({ getItem: () => value }))).toBe("auto");
  });
  it("tolerates an inaccessible storage object or a failed read", () => {
    expect(readGuestPreference("core", () => { throw new Error("blocked"); })).toBe("auto");
    expect(readGuestPreference("share", () => ({ getItem: () => { throw new Error("blocked"); } }))).toBe("auto");
  });
});
